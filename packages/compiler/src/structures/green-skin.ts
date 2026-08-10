/**
 * **The green skin** — overgrowth written over the finished fabric
 * (`docs/RUINS-PLAN-v0-WP6.md`).
 *
 * > **THE GREEN SKIN LAW.** Overgrowth is a **surface** written over the
 * > finished fabric, not a set of plants placed beside it. Every built surface
 * > inside the ruin field — wall face, wall head, rubble top, pavement, kerb,
 * > parapet, step — is a candidate, and the field decides how much of it is
 * > green.
 *
 * **WP-6a** built the surface index and wrote nothing. **WP-6b is the vertical
 * skin**: climbing strands up the exterior faces (§4.1), leaf plugs in the
 * openings (§4.3), glow lichen on the undersides (§4.4), all under the
 * silhouette law (§4.5) and the green rule (§4.6). The mossy re-clad lift
 * (§4.2) is the one part of that wave that lives elsewhere — in `stdlib`'s
 * `decay.ts`, because it is the fit-out's own cladding given a weight.
 * **WP-6c is the horizontal skin** (§5): moss carpets on the wall heads, the
 * parapets and the rubble tops, moss across the surviving pavement and the
 * ruin yards, and the tufts that grow on what the skin has itself turned to
 * moss. WP-6d (the street colonizer) is still to come, and the `streetTrunks`
 * counter and the `colonized` mask are its.
 *
 * ## The level law (§5)
 *
 * > **The skin never changes a level.** It substitutes a **full cube for a full
 * > cube**, or it adds growth into a cell that was air. It never touches a
 * > slab, a stair, a wall or a kerb cap, and it never puts a carpet on anything
 * > that is not a full cube — a `moss_carpet` on a slab is an
 * > `unsupported.chain` finding, and the ground contract arbitrates levels, not
 * > this pass.
 *
 * Enforced by construction and in the direction that removes: the horizontal
 * sweep touches a column only when its exposed top block is a full cube by
 * **both** readers — `support.ts`'s {@link canSupport} by name and the block
 * registry's `isFullCube` by state — which is the union of the op-list
 * vocabulary and the lint's own. `moss_block` is in the walkability audit's
 * soil set and `moss_carpet` is in its `SOLID_TOP`, so every column the sweep
 * touches stays standable at exactly the level it was.
 *
 * ## Where it runs, and why there is no other slot (§3.1)
 *
 * Last, after buildings, tunnels, plaza, streets, retaining, courtyards,
 * grounds, props, the streetscape and the life pass, immediately before
 * `buildStructures` assembles its result. Three constraints pin it:
 *
 * - it must see the **ruin field**, which `structures/index.ts` builds right
 *   after `buildBuildings`;
 * - it must see the **finished ground**, because a moss substitution on a
 *   column the ground pass is about to repaint is a substitution that never
 *   happened;
 * - it must see **every built surface**, and the streetscape's kerbs and lamp
 *   posts are among the last blocks laid.
 *
 * ## The reach law, restated (§3.4)
 *
 * > **No ruin field → the pass is structurally absent.** {@link growGreenSkin}
 * > returns an empty result on its first line when `ruinField === undefined`,
 * > and `structures/index.ts` does not call it at all.
 *
 * Same enforcement as the rest of F19: a document with no `decline` builds no
 * ruined shell, so there is no field, so the world is byte-identical to the one
 * that compiled before this file existed.
 *
 * ## Determinism, and the channel reservation (§3.3)
 *
 * Every draw is `hash3(seed, x, y, z, channel)` on the cell — no counters, no
 * traversal order, no wall clock. Channels 41–49 are exhausted
 * by the shipped feature (41/42/43 the district roll, 44–49 the ground pass's
 * ruin work), so:
 *
 * > **Channels 50–59 are reserved for the green skin.** Nothing else may take
 * > one.
 *
 * | channel | draw |
 * |---|---|
 * | 50 | which eligible exterior face cell takes a climber |
 * | 51 | a climbing strand's length |
 * | 52 | vine vs glow lichen |
 * | 53 | which opening takes a leaf plug, and whether it bulges |
 * | 54 | carpet on a horizontal survivor (rubble top, wall head, parapet) |
 * | 55 | pavement moss |
 * | 56 | pavement moss variant (block vs carpet vs tuft) |
 * | 57 | street/yard colonization election |
 * | 58 | the spine meander |
 * | 59 | street shrub species and variant |
 *
 * The constants below name the reservation so a future pass that reaches for a
 * channel finds it taken in code rather than only in a document.
 */

import {
  bandForIntensity,
  bodyFits,
  canSupport,
  chooseGrowthFace,
  greenSkinShares,
  growthFaces,
  ownGrowthFaces,
} from "@terrainist/stdlib";

import { note, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { hash3, hashPick } from "../terrain/detail.js";
import { GLOW_LICHEN_SYMBOL, type Palette } from "../terrain/palette.js";
import type { DistrictProduct } from "../layout/district.js";

import type { BuiltBuilding, StructureBlock } from "./buildings.js";
import type { ReclaimSpecies } from "./reclaim-species.js";
import { sampleField, type RuinField } from "./ruin-field.js";

/** The palette symbol every climbing strand is written from. */
export const VINE_SYMBOL = "foliage.vine";

/* -------------------------------------------------------------------------- */
/* the channel reservation (§3.3)                                              */
/* -------------------------------------------------------------------------- */

/** The first hash channel reserved for the green skin. */
export const GREEN_SKIN_CHANNEL_FIRST = 50;
/** The last one. Nothing outside this pass may take 50…59. */
export const GREEN_SKIN_CHANNEL_LAST = 59;

/** The reserved channels, by the draw each one makes (§3.3's table). */
export const GREEN_SKIN_CHANNELS = Object.freeze({
  /** Which eligible exterior face cell takes a climber. */
  faceCell: 50,
  /** A climbing strand's length. */
  strandLength: 51,
  /** Vine vs glow lichen. */
  lichen: 52,
  /** Which opening takes a leaf plug, and whether it bulges. */
  plug: 53,
  /** Carpet on a horizontal survivor. */
  carpet: 54,
  /** Pavement moss. */
  pavement: 55,
  /** Pavement moss variant. */
  pavementVariant: 56,
  /** Street/yard colonization election. */
  colonize: 57,
  /** The spine meander. */
  spine: 58,
  /** Street shrub species and variant. */
  shrub: 59,
} as const);

/* -------------------------------------------------------------------------- */
/* the surface index (§3.2)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The value stored for a cell nobody laid a block in.
 *
 * `air` is recorded **as air**, not as absence: a cell the crumble *cleared*
 * and a cell nobody ever touched are different facts, and the skin needs the
 * first one — an opening a notch left is a hole through a wall, and a cell
 * outside the fabric is just sky.
 */
export const SURFACE_INDEX_UNSET = -1;

/**
 * A random-access view of every structure block laid on the ruined columns.
 *
 * > **Rule: the index is built over ruined columns only.** Every column whose
 * > ruin field is zero is skipped at index time, not at write time.
 *
 * That is the reach law made a *cost* law as well as a correctness law: a
 * metropolis lays millions of structure blocks and the skin needs random access
 * to a few hundred thousand of them.
 *
 * The store is one `Int32Array` per indexed column, spanning `[y0, y1]` — the
 * column's ground to the highest block laid on it — filled by a single forward
 * pass over the laid list, **last write wins**, exactly as the emitter resolves
 * a cell written twice.
 */
export interface SurfaceIndex {
  /** Columns indexed — the ruined ones with at least one block laid on them. */
  readonly columns: number;
  /** Cells the index holds, across all columns. */
  readonly cells: number;
  /** The state id at a cell, or {@link SURFACE_INDEX_UNSET}. */
  stateAt(x: number, y: number, z: number): number;
  /** The block name at a cell, or `undefined` when the index holds nothing. */
  nameAt(x: number, y: number, z: number): string | undefined;
  /**
   * The index holds a block there and it is a full cube by name
   * (`support.ts`'s {@link canSupport}).
   *
   * Deliberately the conservative one — "not a full cube by name" — so the skin
   * refuses to hang a vine off a slab, a stair, a fence or a pane. The failure
   * that costs is calling something substantial that is not.
   */
  solidAt(x: number, y: number, z: number): boolean;
  /**
   * The index holds air there, or holds nothing and `y` is above the column's
   * ground.
   *
   * Below ground an unindexed cell is rock, not sky; above it, it is air the
   * emitter never wrote in.
   */
  openAt(x: number, y: number, z: number): boolean;
  /**
   * A standing body fits at this cell — both of its two courses admit one
   * (`support.ts`'s {@link bodyFits}, the physics lint's own vocabulary).
   *
   * The U2 guard's predicate: growth may never go where a body walks.
   */
  walkedAt(x: number, y: number, z: number): boolean;
  /** The lowest and highest `y` the index holds for a column, or `undefined`. */
  spanAt(x: number, z: number): { readonly y0: number; readonly y1: number } | undefined;
  /**
   * Every indexed column, in **ascending column-key order** (`z` then `x`).
   *
   * The skin's whole working set, and the one traversal order any pass over it
   * may use: fixed, positional, and independent of the order the blocks were
   * laid in, which is what makes a pass that sweeps it a pure function of the
   * seed rather than of the emission order.
   */
  readonly indexed: readonly IndexedColumn[];
}

/** One column of the surface index, with the vertical extent it holds. */
export interface IndexedColumn {
  readonly x: number;
  readonly z: number;
  readonly y0: number;
  readonly y1: number;
}

/** What building the index cost — measured, per §12.5's risk. */
export interface SurfaceIndexCost {
  readonly columns: number;
  readonly cells: number;
  /** Structure blocks the two passes walked. */
  readonly scanned: number;
  /** Blocks that landed in the index — the ones on a ruined column. */
  readonly stored: number;
}

/**
 * Build the surface index over the ruined columns of a plan.
 *
 * Two forward passes over `laid`, both in emission order:
 *
 * 1. the extent pass takes each ruined column's `[y0, y1]` — ground to the
 *    highest block anyone laid on it;
 * 2. the fill pass writes every block into its column's slab, last write wins.
 *
 * Neither pass sorts, hashes into a set keyed by iteration order, or reads the
 * clock: the index is a pure function of (plan, field, laid).
 */
export function buildSurfaceIndex(
  plan: ColumnPlan,
  field: RuinField,
  laid: readonly StructureBlock[],
  stack: PrismarineStack,
): { readonly index: SurfaceIndex; readonly cost: SurfaceIndexCost } {
  const { region } = plan;
  const ruined = (x: number, z: number): boolean => sampleField(region, field.field, x, z) > 0;
  const columnKey = (x: number, z: number): number => {
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return -1;
    return j * region.width + i;
  };

  // --- pass 1: the extent of every ruined column ---------------------------
  const low = new Map<number, number>();
  const high = new Map<number, number>();
  for (const b of laid) {
    const key = columnKey(b.x, b.z);
    if (key < 0) continue;
    if (!ruined(b.x, b.z)) continue;
    const lo = low.get(key);
    if (lo === undefined || b.y < lo) low.set(key, b.y);
    const hi = high.get(key);
    if (hi === undefined || b.y > hi) high.set(key, b.y);
  }

  // The floor of a column's slab is the lower of its ground and its lowest laid
  // block: a cellar's foundation courses run well under the surface, and an
  // index that started at the ground would call every one of them absent.
  const slabs = new Map<number, { y0: number; y1: number; cells: Int32Array }>();
  let cells = 0;
  for (const [key, lo] of low) {
    const top = high.get(key) as number;
    const ground = plan.ground[key] as number;
    const y0 = Math.min(lo, ground);
    const y1 = Math.max(top, ground);
    const span = new Int32Array(y1 - y0 + 1).fill(SURFACE_INDEX_UNSET);
    slabs.set(key, { y0, y1, cells: span });
    cells += span.length;
  }

  // --- pass 2: fill, last write wins ---------------------------------------
  let stored = 0;
  for (const b of laid) {
    const key = columnKey(b.x, b.z);
    if (key < 0) continue;
    const slab = slabs.get(key);
    if (slab === undefined) continue;
    if (b.y < slab.y0 || b.y > slab.y1) continue;
    slab.cells[b.y - slab.y0] = b.stateId;
    stored++;
  }

  const names = new Map<number, string>();
  const nameOf = (stateId: number): string | undefined => {
    if (stateId === SURFACE_INDEX_UNSET) return undefined;
    let name = names.get(stateId);
    if (name === undefined) {
      name = stack.blockNameByStateId(stateId) ?? "air";
      names.set(stateId, name);
    }
    return name;
  };
  const AIR = /^(air|cave_air|void_air)$/;

  const stateAt = (x: number, y: number, z: number): number => {
    const key = columnKey(x, z);
    if (key < 0) return SURFACE_INDEX_UNSET;
    const slab = slabs.get(key);
    if (slab === undefined || y < slab.y0 || y > slab.y1) return SURFACE_INDEX_UNSET;
    return slab.cells[y - slab.y0] as number;
  };
  const nameAt = (x: number, y: number, z: number): string | undefined => nameOf(stateAt(x, y, z));

  const index: SurfaceIndex = {
    columns: slabs.size,
    cells,
    stateAt,
    nameAt,
    solidAt(x, y, z) {
      const name = nameAt(x, y, z);
      if (name === undefined) return false;
      if (AIR.test(name)) return false;
      return canSupport(name);
    },
    openAt(x, y, z) {
      const name = nameAt(x, y, z);
      if (name !== undefined) return AIR.test(name);
      const key = columnKey(x, z);
      if (key < 0) return false;
      return y > (plan.ground[key] as number);
    },
    walkedAt(x, y, z) {
      const fits = (cy: number): boolean => {
        const name = nameAt(x, cy, z);
        if (name === undefined) {
          const key = columnKey(x, z);
          if (key < 0) return false;
          return cy > (plan.ground[key] as number);
        }
        return bodyFits(name);
      };
      return fits(y) && fits(y + 1);
    },
    spanAt(x, z) {
      const key = columnKey(x, z);
      if (key < 0) return undefined;
      const slab = slabs.get(key);
      if (slab === undefined) return undefined;
      return { y0: slab.y0, y1: slab.y1 };
    },
    indexed: [...slabs.keys()]
      .sort((a, b) => a - b)
      .map((key) => {
        const slab = slabs.get(key) as { y0: number; y1: number };
        return {
          x: region.x0 + (key % region.width),
          z: region.z0 + Math.floor(key / region.width),
          y0: slab.y0,
          y1: slab.y1,
        };
      }),
  };

  return {
    index,
    cost: { columns: slabs.size, cells, scanned: laid.length * 2, stored },
  };
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** What the skin is handed (§3.1). */
export interface GreenSkinInput {
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** The settlement's own stream. */
  readonly seed: number;
  /** §7.1. **Absent means the pass does not run.** */
  readonly ruinField?: RuinField;
  /** Every structure block laid so far, in emission order. */
  readonly laid: readonly StructureBlock[];
  readonly districts: readonly DistrictProduct[];
  /** `grounds.ts`'s `ruin_yard` columns, newly published (§6.1). */
  readonly ruinYardColumns?: Uint8Array;
  /**
   * The species the place already grows (§4.6).
   *
   * Absent means the skin writes no leaves — the plug is the one thing in the
   * vertical skin that needs a species, and the green rule forbids inventing
   * one. Climbers and lichen are unaffected: a vine is a vine everywhere and
   * moss is universal, which is the rule's own exception.
   */
  readonly flora?: ReclaimSpecies;
  /**
   * The buildings this settlement stood, for the one question the surface
   * index cannot answer: **is this column inside a shell**.
   *
   * §4.1's eligibility is "outside the shell (or on any non-shell surface)",
   * and §13.9's exclusion is that the fit-out owns the inside — *"two surfaces,
   * two owners, one law each"*. `interiorCells` is the true enclosed set across
   * both rects of an L or a T, which is the set that answers it.
   */
  readonly buildings?: readonly BuiltBuilding[];
  /**
   * Columns the doorstep pass rewrote or built on — a door's **approach**.
   *
   * The base plan's first guarantee, now also a growth rule: no plug, no
   * strand and no carpet in a door column, its lintel or its approach.
   */
  readonly doorstepColumns?: Uint8Array;
}

/** The skin's counters, for `LOAM-I514` (§9). */
export interface GreenSkinCounts {
  /** Columns the index covered — the skin's whole working set. */
  readonly indexedColumns: number;
  /** Cells the index held. */
  readonly indexedCells: number;
  /** Structure blocks that landed in the index. */
  readonly indexedBlocks: number;
  /** Climbing strands founded (WP-6b). */
  readonly climbers: number;
  /** Glow lichen substitutions (WP-6b). */
  readonly lichen: number;
  /** Leaf plugs written into openings (WP-6b). */
  readonly plugs: number;
  /** Moss carpets on horizontal survivors — wall heads, parapets, rubble, pavement (WP-6c). */
  readonly carpets: number;
  /** Pavement substitutions (WP-6c). */
  readonly pavement: number;
  /** Street/yard columns elected for a trunk (WP-6d). */
  readonly streetTrunks: number;
  /** Shrubs and tufts the skin planted (WP-6c's covers, WP-6d's streets). */
  readonly shrubs: number;
}

const NO_COUNTS: GreenSkinCounts = Object.freeze({
  indexedColumns: 0,
  indexedCells: 0,
  indexedBlocks: 0,
  climbers: 0,
  lichen: 0,
  plugs: 0,
  carpets: 0,
  pavement: 0,
  streetTrunks: 0,
  shrubs: 0,
});

/** What the skin produced. */
export interface GreenSkinResult {
  readonly blocks: readonly StructureBlock[];
  /**
   * Street/yard columns the scatter may now stand a trunk on (§6).
   *
   * Empty until WP-6d elects anything, and empty is exactly what keeps the
   * closure closed: `reclaimOpen`'s new clause is "a column in this mask is
   * open", and a mask with no bits set opens nothing.
   */
  readonly colonized: Uint8Array;
  readonly counts: GreenSkinCounts;
  /** The index's cost, for §12.5's measurement. Absent when the pass no-oped. */
  readonly cost?: SurfaceIndexCost;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Write the green skin over a settlement's ruined fabric.
 *
 * **WP-6b: the vertical skin.** The sweep is one pass over the index's own
 * column order (`z` then `x`), and every draw inside it is keyed on the cell, so
 * the result is a pure function of (index, field, seed) and running it twice
 * writes the same blocks in the same order.
 *
 * The `colonized` mask it hands back is still empty — WP-6d elects it — which is
 * what keeps the closure exactly as closed as it was.
 */
export function growGreenSkin(input: GreenSkinInput): GreenSkinResult {
  const { plan, palette, stack, seed } = input;
  const { region } = plan;
  const cells = region.width * region.depth;
  // §3.4, the reach law, structural and on the first line.
  if (input.ruinField === undefined) {
    return {
      blocks: [],
      colonized: new Uint8Array(cells),
      counts: NO_COUNTS,
      diagnostics: [],
    };
  }

  const field = input.ruinField;
  const { index, cost } = buildSurfaceIndex(plan, field, input.laid, stack);

  const colIndex = (x: number, z: number): number => {
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return -1;
    return j * region.width + i;
  };
  const groundAt = (x: number, z: number): number => {
    const k = colIndex(x, z);
    return k < 0 ? Number.POSITIVE_INFINITY : (plan.ground[k] as number);
  };
  const solid = (x: number, y: number, z: number): boolean => index.solidAt(x, y, z);

  /**
   * **A cell a standing body occupies** — §4.3's `bodyFits` rule, made a
   * predicate over the index rather than a magic height.
   *
   * A leaf is a full cube by name, so a plug in either of a body's two courses
   * is a plug that blocks the walk. Which courses those are is *not* a function
   * of the terrain ground: a shell stands on a pad, and its upper storeys have
   * floors of their own four and eight courses higher. So the question is asked
   * where it actually lives — is there a floor under this cell with the
   * headroom a body needs (the feet course), or under the cell below it (the
   * head course).
   *
   * Since `reachOrRefuse`'s flood runs over exactly those courses, keeping out
   * of them is what makes WP-2's proof still valid without re-running it.
   */
  const bodyCourse = (x: number, y: number, z: number): boolean => {
    const open = (cy: number): boolean => index.openAt(x, cy, z);
    /**
     * A **floor**, as opposed to a sill.
     *
     * The discriminator is extent, and it has to be, because the two look
     * identical one cell at a time: the block under a window hole is masonry
     * and so is the block under a doorway. A floor is solid *and continues in
     * all four directions*; a window sill is one course of a wall plane with
     * air on the two faces the wall does not run along. Without this the rule
     * eats §4.3's own picture — *"a window plugs from its head down and leaves
     * its sill open"* — because a two-course window is exactly two courses
     * above its own sill.
     */
    const floorAt = (cy: number): boolean =>
      solid(x, cy, z) &&
      solid(x - 1, cy, z) &&
      solid(x + 1, cy, z) &&
      solid(x, cy, z - 1) &&
      solid(x, cy, z + 1);
    // Feet on a floor, head in the clear.
    if (floorAt(y - 1) && open(y) && open(y + 1)) return true;
    // The head course of a body standing one lower.
    if (floorAt(y - 2) && open(y - 1) && open(y)) return true;
    return false;
  };

  /* ---------------------------------------------------------------------- */
  /* what the skin may not touch                                            */
  /* ---------------------------------------------------------------------- */

  // §13.9 / §4.1: the fit-out owns the inside of a shell, and the skin owns the
  // outside. Two surfaces, two owners, one law each.
  const interior = new Set<string>();
  for (const b of input.buildings ?? []) {
    for (const key of b.interiorCells) interior.add(key);
  }

  // The base plan's first guarantee, extended to growth: no door column, no
  // lintel, no approach. Doors are found by name in the laid list — the same
  // evidence the physics lint reads — and the four columns a body steps
  // through to reach one go with them.
  const doorCells = new Set<string>();
  for (const b of input.laid) {
    const name = stack.blockNameByStateId(b.stateId);
    if (name === undefined || !name.endsWith("_door")) continue;
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (let y = b.y - 1; y <= b.y + 3; y++) doorCells.add(`${b.x + dx},${y},${b.z + dz}`);
    }
  }
  const doorstep = input.doorstepColumns;
  const nearDoor = (x: number, y: number, z: number): boolean => {
    if (doorCells.has(`${x},${y},${z}`)) return true;
    if (doorstep === undefined) return false;
    const k = colIndex(x, z);
    if (k < 0 || doorstep[k] !== 1) return false;
    // A doorstep column is an approach at body height and nothing higher: a
    // vine four courses over a landing is not in anybody's way.
    return y <= groundAt(x, z) + 3;
  };

  /* ---------------------------------------------------------------------- */
  /* the blocks the skin writes with                                        */
  /* ---------------------------------------------------------------------- */

  const vineBase = palette.has(VINE_SYMBOL) ? palette.state(VINE_SYMBOL) : undefined;
  const lichenBase = palette.has(GLOW_LICHEN_SYMBOL) ? palette.state(GLOW_LICHEN_SYMBOL) : undefined;
  const leafSymbols = (input.flora?.leafSymbols ?? []).filter((s) => palette.has(s));

  /** Re-encode a state with overridden properties the block actually declares. */
  const propCache = new Map<string, number>();
  const withProps = (stateId: number, overrides: Readonly<Record<string, string>>): number => {
    const key = `${stateId}|${Object.entries(overrides)
      .map(([k, v]) => `${k}=${v}`)
      .join(",")}`;
    const cached = propCache.get(key);
    if (cached !== undefined) return cached;
    const decoded = stack.blockStateProps(stateId);
    let out = stateId;
    if (decoded !== undefined) {
      const props: Record<string, string> = { ...decoded.props };
      let touched = false;
      for (const [name, value] of Object.entries(overrides)) {
        if (!Object.hasOwn(props, name)) continue;
        if (props[name] !== value) touched = true;
        props[name] = value;
      }
      if (touched) out = stack.blockStateOf(decoded.name, props) ?? stateId;
    }
    propCache.set(key, out);
    return out;
  };

  /* ---------------------------------------------------------------------- */
  /* the sweep                                                              */
  /* ---------------------------------------------------------------------- */

  const blocks: StructureBlock[] = [];
  /** First writer wins: the skin never writes a cell twice. */
  const taken = new Set<string>();
  const put = (x: number, y: number, z: number, stateId: number): boolean => {
    const key = `${x},${y},${z}`;
    if (taken.has(key)) return false;
    taken.add(key);
    blocks.push({ x, y, z, stateId });
    return true;
  };

  let climbers = 0;
  let lichen = 0;
  let plugs = 0;

  // §4.3 runs before §4.1 so that a window hole that drew both reads as a
  // stuffed window rather than as a curtain across it — the leaves are the
  // opaque mass and the strand is what runs over the masonry beside them.
  // Neither counter depends on the other: both are elected from their own
  // channel before any block is written, which is what makes MONOTONE GREEN a
  // property of the counters and not only of the picture.
  /**
   * How high a column's sweep must look.
   *
   * **The one subtlety in the whole sweep.** A face cell is *air beside
   * masonry*, and the air column beside a wall holds no block above its own
   * ground — so its own indexed extent stops at the pavement and a sweep bounded
   * by `y1` would never visit a single wall face in the city. The surface a
   * strand hangs on belongs to the **neighbour**, so the ceiling does too: the
   * highest block laid on this column or on any of its four horizontal
   * neighbours. Cheap, positional, and exact for both readers — a face cell and
   * an opening are each defined by a horizontal neighbour.
   */
  const ceilingAt = (x: number, z: number): number => {
    let top = index.spanAt(x, z)?.y1 ?? Number.NEGATIVE_INFINITY;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const span = index.spanAt(x + dx, z + dz);
      if (span !== undefined && span.y1 > top) top = span.y1;
    }
    return top;
  };

  for (const column of index.indexed) {
    const { x, z, y0 } = column;
    const y1 = ceilingAt(x, z);
    const intensity = sampleField(region, field.field, x, z);
    if (intensity <= 0) continue;
    const shares = greenSkinShares(bandForIntensity(intensity));
    const ground = groundAt(x, z);
    if (!Number.isFinite(ground)) continue;
    const inside = interior.has(`${x},${z}`);

    // --- §4.3, growth entering openings ------------------------------------
    if (leafSymbols.length > 0 && shares.openingPlug > 0 && !inside) {
      for (let y = Math.max(y0, ground + 3); y <= y1; y++) {
        if (!index.openAt(x, y, z)) continue;
        // A genuine hole *through* a wall: solid on two opposite sides. Not the
        // absence of a wall — a gap over a wall head has air on both sides of
        // it, not masonry.
        const alongX = solid(x - 1, y, z) && solid(x + 1, y, z);
        const alongZ = solid(x, y, z - 1) && solid(x, y, z + 1);
        if (!alongX && !alongZ) continue;
        // **THE SILHOUETTE LAW** (§4.5): the top course of every surviving wall,
        // and the ragged head the crumble drew, take climbers only — never a
        // leaf mass. So a plug goes only where this column still carries
        // masonry *above* it, which is the definition of "not the head".
        // The test is on the **wall plane**, not on the hole's own column: a
        // hole whose two flanking columns still carry masonry one course higher
        // is a window or an arrow slit in a standing wall, and it is
        // emphatically not the ragged head. A direct-lintel test would be the
        // stricter reading and it plugs *exactly nothing* at `total`, because
        // the crumble has taken every lintel in the quarter — machinery that
        // exists and never runs is DESIGN's second failure mode.
        const capped = alongX
          ? solid(x - 1, y + 1, z) && solid(x + 1, y + 1, z)
          : solid(x, y + 1, z - 1) && solid(x, y + 1, z + 1);
        if (!capped && !solid(x, y + 1, z)) continue;
        if (nearDoor(x, y, z)) continue;
        if (bodyCourse(x, y, z)) continue;
        if (hash3(seed, x, y, z, GREEN_SKIN_CHANNELS.plug) >= shares.openingPlug) continue;
        plugs++;
        const symbol = hashPick(seed, x, z, GREEN_SKIN_CHANNELS.plug, leafSymbols);
        const leaf = leafState(withProps, palette.stateAt(symbol, x, z));
        put(x, y, z, leaf);
        // The bulge — **one** cell each way, never two. A two-deep bulge inward
        // is a sealed room, and the base plan spent §5.7 proving rooms are not
        // sealed. Each side is drawn at half the plug share on its own cell.
        const sides: readonly (readonly [number, number])[] = alongX
          ? [
              [0, -1],
              [0, 1],
            ]
          : [
              [-1, 0],
              [1, 0],
            ];
        for (const [dx, dz] of sides) {
          const bx = x + dx;
          const bz = z + dz;
          if (!index.openAt(bx, y, bz)) continue;
          if (y <= groundAt(bx, bz) + 2) continue;
          if (nearDoor(bx, y, bz)) continue;
          if (bodyCourse(bx, y, bz)) continue;
          // Inward is the shell's own air, which is exactly where a bulge
          // belongs — the only guard it needs is that a standing body still
          // fits, which the `ground + 2` test above is.
          if (
            hash3(seed, bx, y, bz, GREEN_SKIN_CHANNELS.plug) >= shares.openingPlug / 2
          ) {
            continue;
          }
          put(bx, y, bz, leaf);
        }
      }
    }

    // --- §4.1, climbing growth ---------------------------------------------
    if (vineBase === undefined || inside) continue;
    for (let y = y1; y >= Math.max(y0, ground + 2); y--) {
      if (!index.openAt(x, y, z)) continue;
      const own = ownGrowthFaces({ x, y, z }, solid);
      if (own.length === 0) continue;
      if (nearDoor(x, y, z)) continue;
      if (hash3(seed, x, y, z, GREEN_SKIN_CHANNELS.faceCell) >= shares.wallFace) continue;
      climbers++;
      const carried = chooseGrowthFace(own, { x, y, z });
      // The strand's length: a share of the face height below its head, drawn
      // on channel 51 and scaled by `CLIMB_REACH`. Monotone in the dial, so a
      // light quarter's strands are prefixes of a total quarter's.
      const height = Math.max(1, y - (ground + 1));
      const reach = hash3(seed, x, y, z, GREEN_SKIN_CHANNELS.strandLength);
      const length = 1 + Math.floor(reach * shares.climbReach * height);
      const offset = CLIMB_FACE_OFFSET[carried] as readonly [number, number];
      for (let k = 0; k < length; k++) {
        const cy = y - k;
        // The ground, less one: a vine reaching the surface is the ground-cover
        // pass's column, not the skin's.
        if (cy < ground + 2) break;
        if (!index.openAt(x, cy, z)) break;
        // **A climbing strand may not extend past the last course of its
        // support.** A vine below the end of the wall it clings to is a vine
        // whose every true face points at air; vanilla pops it on the first
        // block update, and until then it renders as a flat plate in space.
        if (!solid(x + offset[0], cy, z + offset[1])) break;
        if (nearDoor(x, cy, z)) break;
        const props = growthFaces({ x, y: cy, z }, solid, carried);
        if (props === null) break;
        // §4.4: glow lichen is a substitution **within the climbers already
        // placed**, on undersides only — where `up = true` is legal — because a
        // lichen's read is a stain on a ceiling and a vine's is a curtain on a
        // wall. Theme-gated: a palette that does not resolve the symbol grows
        // no lichen, because the substitution has nothing to write.
        const underside = props["up"] === "true";
        const asLichen =
          underside &&
          lichenBase !== undefined &&
          hash3(seed, x, cy, z, GREEN_SKIN_CHANNELS.lichen) < shares.lichen;
        const base = asLichen ? (lichenBase as number) : vineBase;
        // Every multi-face block the skin writes carries `waterlogged = false`
        // (§8's `fluid.*` row). `quench` goes the other way, by law.
        const written = put(x, cy, z, withProps(base, { ...props, waterlogged: "false" }));
        if (written && asLichen) lichen++;
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* §5, the horizontal skin (WP-6c)                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * A **second sweep**, deliberately, rather than more work inside the first.
   *
   * The vertical skin's blocks are written first and `put`'s first-writer-wins
   * rule therefore keeps them exactly as WP-6b wrote them: a carpet and a
   * strand that want the same cell of air resolve to the strand, and the
   * vertical wave's output is a prefix of this one's. Two sweeps over the same
   * fixed column order cost one more walk of the index and buy the property
   * that landing WP-6c cannot have moved a single vine.
   */
  let carpets = 0;
  let pavement = 0;
  let shrubs = 0;
  {
    const mossBlock = stack.blockByName("minecraft:moss_block")?.stateId;
    /**
     * What grows on the moss the skin has just made.
     *
     * §5's pavement row offers `moss_carpet`, `short_grass` or `fern`; the
     * shipped set is the **last two**, and the missing one is the level law
     * enforcing itself. The walkability audit's `SOLID_TOP` holds `_carpet`,
     * so a `moss_carpet` on a carriageway makes the cell *above* it standable
     * and the street's walking level rises by one — which is precisely *"the
     * skin never changes a level"*, read on the surface a player actually
     * walks. A tuft and a fern are invisible to `supportAt` and to
     * `passableAt` alike, so they are inert to every metric the audit reports.
     * The carpet keeps the surfaces the audit does not walk: the wall heads,
     * the parapets and the rubble tops, where it is the whole point.
     */
    const cover = ([
      ["foliage.short_grass", "minecraft:short_grass"],
      ["foliage.fern", "minecraft:fern"],
    ] as const).map(([symbol, fallback]) => ({
      symbol,
      carpet: false,
      state: palette.has(symbol) ? undefined : stack.blockByName(fallback)?.stateId,
    }));
    const carpetSlot = {
      symbol: "foliage.moss_carpet",
      carpet: true,
      state: palette.has("foliage.moss_carpet")
        ? undefined
        : stack.blockByName("minecraft:moss_carpet")?.stateId,
    };
    const coverState = (
      slot: { readonly symbol: string; readonly state: number | undefined },
      x: number,
      z: number,
    ): number | undefined =>
      slot.state ?? (palette.has(slot.symbol) ? palette.stateAt(slot.symbol, x, z) : undefined);
    const yards = input.ruinYardColumns;

    if (mossBlock !== undefined) {
      for (const column of index.indexed) {
        const { x, z, y0, y1 } = column;
        const intensity = sampleField(region, field.field, x, z);
        if (intensity <= 0) continue;
        const shares = greenSkinShares(bandForIntensity(intensity));
        const ground = groundAt(x, z);
        if (!Number.isFinite(ground)) continue;
        // §13.9: the fit-out owns the inside of a shell and the skin owns the
        // outside. Two surfaces, two owners, one law each — so the interior
        // heaps keep `decay.ts`'s own one-in-three carpet and take none of
        // this.
        if (interior.has(`${x},${z}`)) continue;

        // The **exposed horizontal survivor**: the first cell from the top of
        // the column that is not open. A fence, a lamp post's own column, a
        // slab cap or a kerb stops the search here rather than being stepped
        // over, which is the level law enforced by not looking underneath
        // furniture — no carpet appears beneath a bench.
        let top = Number.NEGATIVE_INFINITY;
        for (let y = y1; y >= y0; y--) {
          if (index.openAt(x, y, z)) continue;
          top = y;
          break;
        }
        if (!Number.isFinite(top)) continue;
        if (!index.openAt(x, top + 1, z)) continue;
        const name = index.nameAt(x, top, z);
        if (name === undefined) continue;
        // Full cube by **both** readers: the name-side vocabulary the op list
        // shares with the fit-out, and the registry answer the lint will use
        // when it reads this world back off disk. A pane of glass passes the
        // first and fails the second, and a carpet on glass is a finding.
        if (!canSupport(name) || !stack.isFullCube(index.stateAt(x, top, z))) continue;
        if (nearDoor(x, top, z) || nearDoor(x, top + 1, z)) continue;

        if (top - ground <= 1) {
          // --- surviving pavement, and the ruin yards ----------------------
          // Everything the ground plane still owns: carriageway, sidewalk,
          // plaza, forecourt, dressed lot, the yard's worn mix, and the
          // grounded spill apron that heaped onto it. The substitution is cube
          // for cube, so the level is the level it was.
          if (name === "moss_block") continue;
          if (hash3(seed, x, top, z, GREEN_SKIN_CHANNELS.pavement) >= shares.pavement) continue;
          if (!put(x, top, z, mossBlock)) continue;
          pavement++;
          // > **The skin plants only on ground it has itself turned to soil or
          // > moss.** The substitution runs first, the planting second, in one
          // > pass. A tuft of grass on a paving slab is the `flower_pot` lesson
          // > in a third costume.
          //
          // A `ruin_yard` column takes the field's own local value instead of
          // the carpet share — §5's fourth row, *"its volunteer growth rises to
          // the field's local value"* — which is the one thing the yard mask
          // exists to say that the pavement rule cannot.
          const k = colIndex(x, z);
          const inYard = yards !== undefined && k >= 0 && yards[k] === 1;
          const share = inYard ? shares.skin : shares.carpet;
          if (hash3(seed, x, top, z, GREEN_SKIN_CHANNELS.pavementVariant) >= share) continue;
          const slot = hashPick(seed, x, z, GREEN_SKIN_CHANNELS.pavementVariant, cover);
          const state = coverState(slot, x, z);
          if (state === undefined) continue;
          if (!put(x, top + 1, z, state)) continue;
          // §6.4's division of labour, one storey down: a moss carpet is the
          // horizontal skin's carpet, and a tuft of grass or a fern is one of
          // the under-two-block growths the skin owns outright.
          if (slot.carpet) carpets++;
          else shrubs++;
        } else {
          // --- wall heads, parapets and rubble tops -------------------------
          // The most-seen surface in a ruin field, because you look down on it
          // from everywhere, and the one the silhouette law explicitly leaves
          // open to a carpet: *"the top course of every surviving wall takes
          // climbers and carpet only, never a leaf mass"*.
          if (hash3(seed, x, top, z, GREEN_SKIN_CHANNELS.carpet) >= shares.carpet) continue;
          const state = coverState(carpetSlot, x, z);
          if (state === undefined) continue;
          if (put(x, top + 1, z, state)) carpets++;
        }
      }
    }
  }

  const diagnostics: LoamDiagnostic[] = [];
  diagnostics.push(
    note(
      "GREEN_SKIN",
      "",
      `the green skin covered ${index.columns} ruined columns: ${climbers} climbing strands (${lichen} glow lichen), ${plugs} leaf plugs, ${carpets} moss carpets, ${pavement} pavement substitutions, ${shrubs} tufts, ${blocks.length} blocks`,
      climbers + plugs + carpets + pavement === 0
        ? "no surface in the ruin field met the skin's eligibility — raise `decline`, or check that the district actually ruined any lots"
        : "informational",
    ),
  );

  return {
    blocks,
    // WP-6d elects this. An empty mask opens nothing, which is what keeps the
    // closure exactly as closed as it was.
    colonized: new Uint8Array(cells),
    counts: {
      ...NO_COUNTS,
      indexedColumns: index.columns,
      indexedCells: index.cells,
      indexedBlocks: cost.stored,
      climbers,
      lichen,
      plugs,
      carpets,
      pavement,
      shrubs,
    },
    cost,
    diagnostics,
  };
}

/**
 * The unit offset of a strand's carried horizontal face.
 *
 * A `north` face means "attached to the block to the north", so the support to
 * check for the last-course rule lies one column that way.
 */
const CLIMB_FACE_OFFSET: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
});

/**
 * A leaf state the skin may write — **`persistent = true`, always**.
 *
 * This is not a detail; it is the difference between a feature and a feature
 * that disappears. `LEAF_STATE_POLICY` is `"computed"`, and a computed leaf
 * carries a `distance` from a BFS over **its own plant's wood**. The skin's
 * leaves have no wood within 6 in any direction, so vanilla would decay every
 * one of them on the first random tick — Kai would walk a green city, leave,
 * come back and find it bare.
 */
function leafState(
  withProps: (stateId: number, overrides: Readonly<Record<string, string>>) => number,
  base: number,
): number {
  return withProps(base, { persistent: "true", waterlogged: "false" });
}
