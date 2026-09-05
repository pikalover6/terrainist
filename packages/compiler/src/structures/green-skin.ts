/**
 * **The green skin** — overgrowth written over the finished fabric
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

import { note, warning, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { hash3, hashPick } from "../terrain/detail.js";
import { GLOW_LICHEN_SYMBOL, type Palette } from "../terrain/palette.js";
import type { DistrictProduct } from "../layout/district.js";

import type { BuiltBuilding, StructureBlock } from "./buildings.js";
import type { ReclaimSpecies } from "./reclaim-species.js";
import { sampleField, type RuinField } from "./ruin-field.js";

/** The palette symbol every climbing strand is written from. */
const VINE_SYMBOL = "foliage.vine";

/**
 * Glazing the leaf plug may substitute — Kai's 6e ruling.
 *
 * By **name**, and only the pane family: a pane is the thin sheet a window
 * hole is filled with, and a leaf cube standing in its cell is the same window
 * read as stuffed. Full `glass` blocks are not in it, because a solid glass
 * cube is a *wall* material in this palette's vocabulary and eating it is a
 * hole the crumble did not draw.
 */
const GLAZING = /glass_pane$/;

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
interface IndexedColumn {
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
  /**
   * Stand **one trunk per roofless shell** — Kai's Q5 ruling (2026-08-10:
   * `heavy` **and** `total`, bolder than the draft's total-only).
   *
   * **ON by default since WP-6e** — Kai made the ruling WP-6d could not make
   * on its own (2026-08-10).
   *
   * WP-6d shipped this flag off because the physics lint refused the image: a
   * trunk standing in a room is, by rule 17's own definition, *"an interior
   * column solid from y lo to y hi"*, and no siting rule can dodge a rule that
   * fires on the obstruction rather than on the consequence. Kai's ruling
   * refined the rule instead of weakening the guarantee: **a deliberately
   * elected shell trunk, verifiable from the plan, is not an accidental
   * obstruction, and interior reachability stays fully enforced.** The
   * exemption is `PhysicsContext.shellTrunks`, which is this pass's own
   * `shellTrunks` mask handed to the lint the way `terrainTop` is — the lint
   * exempts a column the compiler can *prove* it elected, and nothing else.
   *
   * `traversal.unreachable` is **not** exempted and never will be: a trunk that
   * cuts a room off from its door is a defect whoever put it there. That is
   * what `staysWhole` in `electShellTrees` is for, and it is why the siting is
   * a check rather than an argument.
   *
   * Set `false` to compile the same world without the image — which is what the
   * differential tests do.
   *
   * **State, honestly:** the off-switch is read (`electShellTrees` is skipped
   * when it is `false`) but nothing outside the differential tests ever sets
   * it — there is no Loam-level param behind it. The parameter is kept as the
   * TS-API surface that makes the with/without comparison possible: default
   * chosen under the never-wait rule, 2026-08-14; revisit on walk evidence.
   */
  readonly shellTrees?: boolean;
}

/** The skin's counters, for `LOAM-I514` (§9). */
interface GreenSkinCounts {
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
  /** Leaf plugs written into openings the crumble left as air (WP-6b). */
  readonly plugs: number;
  /**
   * Leaf plugs that **substituted a pane** — Kai's 6e ruling (WP-6e).
   *
   * Counted apart from `plugs` on purpose: the two are the same treatment
   * through the same draws, but one of them says *the crumble opened this
   * window* and the other says *the skin took the glass out of it*, and a
   * single number could not tell a walk which had happened.
   */
  readonly panePlugs: number;
  /** Moss carpets on horizontal survivors — wall heads, parapets, rubble, pavement (WP-6c). */
  readonly carpets: number;
  /** Pavement substitutions (WP-6c). */
  readonly pavement: number;
  /** Street/yard columns elected for a trunk (WP-6d). */
  readonly streetTrunks: number;
  /**
   * Roofless shells offered one trunk each (WP-6d, Q5 as Kai ruled it).
   *
   * *"A tree bursting out of a roofless nave is arguably the single strongest
   * overgrown image available."* Kai's ruling is **heavy AND total**, bolder
   * than the draft's total-only.
   */
  readonly shellTrees: number;
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
  panePlugs: 0,
  carpets: 0,
  pavement: 0,
  streetTrunks: 0,
  shellTrees: 0,
  shrubs: 0,
});

/**
 * What the street law measured, for `LOAM-I514` and for §11's machine checks.
 *
 * The legibility law is *"a measurement rather than an opinion"* (§6.2), so it
 * leaves numbers behind rather than a claim.
 */
interface GreenSkinLegibility {
  /** Columns the spine claimed across every street of every district. */
  readonly spineColumns: number;
  /** The shortest unobstructed run along a street axis from a spine column. */
  readonly shortestSightRun: number;
  /** Spine columns whose sight-line run fell under the bar. **Must be 0.** */
  readonly sightViolations: number;
  /** Chebyshev distance from the nearest elected trunk to an intersection. */
  readonly nearestJunction: number;
  /** Places a spine failed to run 4-connected end to end. **Must be 0.** */
  readonly spineBreaks: number;
  /** Trunks the election took before the withdraw loop. */
  readonly elected: number;
  /** Trunks U2 took back off it (§6.3). */
  readonly withdrawn: number;
}

/** What the skin produced. */
export interface GreenSkinResult {
  readonly blocks: readonly StructureBlock[];
  /**
   * Street/yard columns the scatter may now stand a trunk on (§6).
   *
   * Empty is exactly what keeps the closure closed: `reclaimOpen`'s new clause
   * is "a column in this mask is open", and a mask with no bits set opens
   * nothing — which is every column of every world that ruins nothing.
   */
  readonly colonized: Uint8Array;
  /**
   * Interior columns of roofless shells that may stand **one** trunk each.
   *
   * A **second** mask rather than a bit in the first one, deliberately. §6.1's
   * opening is narrow and stays narrow — `building`, `interior`, `farm`,
   * `courtyard` and `prop` stay hard against `colonized`, so no street trunk
   * ever stands in a shell. Kai's Q5 ruling crosses `building`/`interior` on
   * purpose and only here, and a mask of its own is what makes the crossing
   * legible at the seam rather than hidden inside a shared bit.
   */
  readonly shellTrunks: Uint8Array;
  /** What the legibility law measured (§6.2). Absent when the pass no-oped. */
  readonly legibility?: GreenSkinLegibility;
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
      shellTrunks: new Uint8Array(cells),
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

  /**
   * **The stairwell** — a route the skin may not write into, at any height.
   *
   * The door's approach was WP-6b's guarantee because a door is how you get
   * *in*; a flight is how you get *up*, and the two are the same promise on
   * different axes. `bodyCourse` cannot make this one on its own and the
   * reason is structural rather than a missed case: its floor test asks for a
   * solid cell with solid cells on all four sides, which is exactly what a
   * tread is **not** — a flight's underside is stepped, so every cell of it
   * reads as sill rather than floor and the guard waves the growth through.
   *
   * Measured, on the WP-6e fixture the moment the skin was allowed to eat
   * glazing (Kai's 6e ruling): a single inward bulge at `6,77,81` landed on
   * one tread of one flight and took the **whole upper storey** of that shell
   * with it — 146 `traversal.unreachable` findings from one leaf block. The
   * exemption Kai granted covers rule 17 and stops there; reachability is
   * enforced, so the pass has to keep out of the flight by construction.
   *
   * Columns rather than cells, and the whole building's height: a stairwell
   * column carries no window worth plugging at any level, so nothing of value
   * is given up by refusing the column outright.
   */
  const stairColumns = new Set<string>();
  for (const b of input.buildings ?? []) {
    for (const key of b.stairCells ?? []) stairColumns.add(key);
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

  /* ---------------------------------------------------------------------- */
  /* §6, the street colonizer's **election** (WP-6d)                        */
  /* ---------------------------------------------------------------------- */

  /**
   * The election runs **before** the two sweeps, and that ordering is
   * load-bearing rather than tidy.
   *
   * The skin writes into air, and the air above an elected column is where the
   * scatter is about to stand a trunk. Elect afterwards and the skin has
   * already hung a climbing strand up the shaft — measured on the WP-6d
   * fixture: 61 trees placed on elected columns, 27 of them still visible in
   * the emitted world, the other 34 buried under the skin's own vines and
   * carpets because the structure pass is emitted after the flora. So the
   * election happens first and the shaft is **reserved**: nothing the skin
   * writes goes above ground on a column it has promised to a tree.
   */
  const street = electStreetTrunks({
    input,
    index,
    field,
    colIndex,
    groundAt,
    interior,
    nearDoor,
    seed,
    cells,
  });
  /** Columns the skin has promised to a trunk — see above. */
  const reserved = new Uint8Array(cells);
  for (let k = 0; k < cells; k++) {
    if (street.colonized[k] === 1 || street.shellTrunks[k] === 1) reserved[k] = 1;
  }

  const blocks: StructureBlock[] = [];
  /** First writer wins: the skin never writes a cell twice. */
  const taken = new Set<string>();
  const put = (x: number, y: number, z: number, stateId: number): boolean => {
    const k = colIndex(x, z);
    // The reserved shaft. The ground plane itself is still the skin's — a moss
    // substitution *under* a trunk is exactly the ground a trunk should stand
    // on — and everything above it belongs to the tree.
    if (k >= 0 && reserved[k] === 1 && y > groundAt(x, z)) return false;
    const key = `${x},${y},${z}`;
    if (taken.has(key)) return false;
    taken.add(key);
    blocks.push({ x, y, z, stateId });
    return true;
  };

  let climbers = 0;
  let lichen = 0;
  let plugs = 0;
  let panePlugs = 0;

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
        /**
         * **The skin may eat the glass** — Kai's 6e ruling, 2026-08-10.
         *
         * The crumble keeps its glazing (that is the base plan's, and it is
         * not reopened here); the *skin* is allowed to substitute a pane cell
         * with the plug's own persistent leaves directly. So an opening is
         * either air the crumble left or a pane the builder glazed, and both
         * go through the same eligibility, the same shared leaf vocabulary and
         * the same channel-53 share draw — one predicate, two kinds of hole.
         *
         * Why it matters as a number rather than as a nicety: the WP-6b report
         * measured **187 pane cells above body height on the 0.95 fixture
         * against 14 plugs**, because the crumble takes a wall's lintel long
         * before it takes its windows, so nearly every genuine window hole in
         * the quarter was still glazed and therefore not `openAt`. The
         * openings the plug was written for were the ones it could not see.
         *
         * A pane is neither `openAt` nor `solidAt` — `canSupport` refuses it by
         * name, which is the conservative direction and stays conservative
         * here: the substitution never makes a strand's support out of glass,
         * it only replaces the pane's own cell. Traversal is untouched in both
         * directions, because a pane already blocks a body exactly as a leaf
         * cube does, and the `bodyCourse` guard below still runs regardless.
         */
        const open = index.openAt(x, y, z);
        const pane = !open && GLAZING.test(index.nameAt(x, y, z) ?? "");
        if (!open && !pane) continue;
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
        if (stairColumns.has(`${x},${z}`)) continue;
        if (bodyCourse(x, y, z)) continue;
        if (hash3(seed, x, y, z, GREEN_SKIN_CHANNELS.plug) >= shares.openingPlug) continue;
        if (pane) panePlugs++;
        else plugs++;
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
          // The flight, on the bulge's side too — this is the cell that cost
          // an upper storey, so it is guarded where it happened.
          if (stairColumns.has(`${bx},${bz}`)) continue;
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

  /* ---------------------------------------------------------------------- */
  /* §6, the street colonizer (WP-6d)                                       */
  /* ---------------------------------------------------------------------- */

  shrubs += plantStreetCover({
    index,
    colIndex,
    region,
    eligible: street.eligible,
    colonized: street.colonized,
    sharesAt: (x, z) => greenSkinShares(bandForIntensity(sampleField(region, field.field, x, z))),
    groundAt,
    nearDoor,
    put,
    palette,
    stack,
    seed,
  });

  const diagnostics: LoamDiagnostic[] = [];
  diagnostics.push(
    note(
      "GREEN_SKIN",
      "",
      `the green skin covered ${index.columns} ruined columns: ${climbers} climbing strands (${lichen} glow lichen), ${plugs} leaf plugs (${panePlugs} of them substituted for glazing), ${carpets} moss carpets, ${pavement} pavement substitutions, ${shrubs} tufts, ` +
        `${street.streetTrunks} street trunks and ${street.shellTrees} shell trees elected (${street.spineColumns} spine columns, shortest sight-line run ${
          Number.isFinite(street.shortestSightRun) ? street.shortestSightRun : "n/a"
        }, nearest trunk to a junction ${
          Number.isFinite(street.nearestJunction) ? street.nearestJunction : "n/a"
        }), ${blocks.length} blocks`,
      climbers + plugs + panePlugs + carpets + pavement === 0
        ? "no surface in the ruin field met the skin's eligibility — raise `decline`, or check that the district actually ruined any lots"
        : "informational",
    ),
  );
  if (street.withdrawn > 0) {
    diagnostics.push(
      warning(
        "GREEN_SKIN_WITHDRAWN",
        "",
        `the street colonizer withdrew ${street.withdrawn} of ${street.elected} elected trunks to keep every street band one walkable component (U2)`,
        "no change needed unless the rate is sustained above a few percent — that is a finding about `STREET_TRUNK_SHARE`, not about the withdraw loop",
      ),
    );
  }

  return {
    blocks,
    colonized: street.colonized,
    shellTrunks: street.shellTrunks,
    legibility: {
      spineColumns: street.spineColumns,
      shortestSightRun: street.shortestSightRun,
      sightViolations: street.sightViolations,
      nearestJunction: street.nearestJunction,
      spineBreaks: street.spineBreaks,
      elected: street.elected,
      withdrawn: street.withdrawn,
    },
    counts: {
      ...NO_COUNTS,
      indexedColumns: index.columns,
      indexedCells: index.cells,
      indexedBlocks: cost.stored,
      climbers,
      lichen,
      plugs,
      panePlugs,
      carpets,
      pavement,
      streetTrunks: street.streetTrunks,
      shellTrees: street.shellTrees,
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

/* -------------------------------------------------------------------------- */
/* §6 — street colonization, Kai's addition (WP-6d)                            */
/* -------------------------------------------------------------------------- */

/**
 * > **Ruling (Kai, 2026-08-10): trees and plants in the middle of a road are
 * > part of an overgrown settlement.** This **supersedes the closure's
 * > streets-stay-clear rule for ruined quarters only.** Everywhere the ruin
 * > field is zero — which is every column of every world that ruins nothing —
 * > the closure stands exactly as written.
 *
 * The election lives here, in the structures pass, *"where the district's own
 * `carriageway` and `sidewalk` masks live — because the law that disciplines it
 * is a **street** law and belongs beside the streets, not inside a forest
 * scatter."* What travels out is a mask; the trunks themselves are the
 * scatter's, and WP-6 adds not one line of tree generation (§6.4).
 */

/** §6.2: no trunk within this Chebyshev distance of a street intersection. */
export const JUNCTION_CLEAR = 2;

/**
 * §6.2: the unobstructed run along the street axis from any spine column, in
 * columns — *"the number that makes 'grid at city scale' a measurement rather
 * than an opinion"*. A street shorter than this must simply be clear end to end.
 */
export const SIGHT_MIN = 24;

/**
 * How far the spine's centre wanders before it turns, in columns.
 *
 * > **The spine meanders; it does not stripe.** A dead-straight cleared stripe
 * > down every street for a kilometre is its own kind of unreal.
 *
 * The amplitude is bounded by the carriageway (§6.2) and the *step* is clamped
 * to one column per path cell, which is what makes the lane 4-connected end to
 * end by construction rather than by a test that only notices when it is not.
 */
const SPINE_MEANDER_WAVELENGTH = 12;

/**
 * A shell is **roofless** when no more than this share of its room still has
 * masonry over it **above the top storey** — the roof line, not the plate.
 *
 * Q5's image is *a tree bursting out of a roofless nave*, and a shell that
 * still has its plate on is not that — a trunk under an intact roof is a tree
 * growing through a floor, which is the very thing base §4.3 drew the line at.
 */
const SHELL_ROOFLESS_MAX = 0.25;

/** Under-two-block growth is the skin's; anything with wood in it is not (§6.4). */
const STREET_COVER: readonly (readonly [string, string])[] = Object.freeze([
  ["foliage.short_grass", "minecraft:short_grass"],
  ["foliage.fern", "minecraft:fern"],
] as const);

/**
 * Ground the skin may plant on.
 *
 * > **The skin plants only on ground it has itself turned to soil or moss.**
 * > An azalea on polished andesite pops on the first tick, and a tuft of grass
 * > on a paving slab is the `flower_pot` lesson in a third costume.
 *
 * `moss_block` is the skin's own substitution (§5); the dirt family is what
 * §7.3's break-up and the ruin yard already left behind. Everything else in a
 * street — the paving, the kerb, the flagstones — grows nothing, and that is
 * the law rather than an omission.
 */
const PLANTABLE_GROUND =
  /^(moss_block|grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mud|farmland|dirt_path)$/;

interface ColonizeInput {
  readonly input: GreenSkinInput;
  readonly index: SurfaceIndex;
  readonly field: RuinField;
  readonly colIndex: (x: number, z: number) => number;
  readonly groundAt: (x: number, z: number) => number;
  readonly interior: ReadonlySet<string>;
  readonly nearDoor: (x: number, y: number, z: number) => boolean;
  readonly seed: number;
  readonly cells: number;
}

interface ColonizeResult {
  readonly colonized: Uint8Array;
  readonly shellTrunks: Uint8Array;
  /** 0 none, 1 carriageway, 2 sidewalk, 3 ruin yard — the cover pass reads it. */
  readonly eligible: Uint8Array;
  readonly streetTrunks: number;
  readonly shellTrees: number;
  readonly spineColumns: number;
  readonly shortestSightRun: number;
  readonly sightViolations: number;
  readonly nearestJunction: number;
  readonly spineBreaks: number;
  readonly elected: number;
  readonly withdrawn: number;
}

/** A spine column's street axis and how far its street runs each way. */
interface SpineRun {
  /** 0 for a street running along x, 1 for one running along z. */
  readonly axis: 0 | 1;
  /** Columns of this street remaining in the positive axis direction. */
  readonly pos: number;
  /** …and in the negative one. */
  readonly neg: number;
}

/** The election, the spine, U2 and the shell trees. Writes no blocks. */
function electStreetTrunks(ctx: ColonizeInput): ColonizeResult {
  const { input, index, field, colIndex, groundAt, interior, nearDoor, seed, cells } = ctx;
  const { region } = input.plan;

  const colonized = new Uint8Array(cells);
  const shellTrunks = new Uint8Array(cells);

  /* --- what the field says here ------------------------------------------ */

  const intensityAt = (x: number, z: number): number => sampleField(region, field.field, x, z);
  const sharesAt = (x: number, z: number) => greenSkinShares(bandForIntensity(intensityAt(x, z)));

  /* --- 1. the eligible set (§6.1) ---------------------------------------- */

  // 0 = not eligible, 1 = carriageway, 2 = sidewalk, 3 = ruin yard. Two column
  // sets, and only two: the district's own street bands inside the ruin field,
  // and the `ruin_yard` columns `grounds.ts` publishes — *"the one ground in
  // the world that says 'ruined' and forbids a tree"*.
  const eligible = new Uint8Array(cells);
  /**
   * The columns U2's pedestrian graph walks — **every open column of every
   * district**, not only the bands a trunk may be elected on.
   *
   * The narrow reading (street bands only) is the one §6.3 suggests and it does
   * not hold: the audit walks the *world*, and a trunk on the edge of a yard
   * can orphan the plaza column beside it without touching a street band at
   * all. Measured on the WP-6d fixture with the narrow graph: the audit
   * reported **2** components and **1** orphan column against the
   * colonizer-off world's 1 and 0 — a differential bar failed by exactly one
   * column that the check could not see. A graph wider than the election is
   * free (it is walked once per elected trunk, and the election is dozens) and
   * it is the only one that can promise what §6.3 promises.
   */
  const streetBand = new Uint8Array(cells);
  for (const district of input.districts) {
    const { bounds } = district;
    const width = bounds.x1 - bounds.x0 + 1;
    for (let z = bounds.z0; z <= bounds.z1; z++) {
      for (let x = bounds.x0; x <= bounds.x1; x++) {
        const k = colIndex(x, z);
        if (k < 0) continue;
        // Every column of the quarter is a node; only some are electable.
        if (!interior.has(`${x},${z}`)) streetBand[k] = 1;
        const local = (z - bounds.z0) * width + (x - bounds.x0);
        const carriage = district.carriageway[local] === 1;
        const walk = district.sidewalk[local] === 1;
        if (!carriage && !walk) continue;
        if (intensityAt(x, z) <= 0) continue;
        if (interior.has(`${x},${z}`)) continue;
        eligible[k] = carriage ? 1 : 2;
      }
    }
  }
  const yards = input.ruinYardColumns;
  if (yards !== undefined) {
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const k = j * region.width + i;
        if (yards[k] !== 1) continue;
        streetBand[k] = 1;
        if (eligible[k] !== 0) continue;
        const x = region.x0 + i;
        const z = region.z0 + j;
        if (intensityAt(x, z) <= 0) continue;
        if (interior.has(`${x},${z}`)) continue;
        eligible[k] = 3;
      }
    }
  }

  /* --- 2. the spine, and its meander (§6.2) ------------------------------ */

  const spine = new Uint8Array(cells);
  const spineRun = new Map<number, SpineRun>();
  let spineColumns = 0;
  let spineBreaks = 0;
  for (const district of input.districts) {
    for (const segment of district.streets.segments) {
      // A channel is water and a flight of steps is not a lane anyone drives:
      // the spine is the carriageway's, and only the carriageway's.
      if (segment.role !== undefined && segment.role !== "carriageway") continue;
      const path = segment.path;
      if (path.length < 2) continue;
      // The band is the tightest one anywhere along the run: `spineWidth` is a
      // band constant and a segment may cross two bands, and the narrower lane
      // is the one that has to stay continuous.
      let lane = 2;
      for (const p of path) lane = Math.min(lane, sharesAt(p.x, p.z).spineWidth);
      const amp = Math.max(0, Math.floor((segment.width - lane) / 2));
      const anchor = (k: number): number => {
        const p = path[Math.min(path.length - 1, k * SPINE_MEANDER_WAVELENGTH)] as {
          x: number;
          z: number;
        };
        return hash3(seed, p.x, k, p.z, GREEN_SKIN_CHANNELS.spine) * 2 - 1;
      };
      let previous: number | undefined;
      let last: number | undefined;
      for (let i = 0; i < path.length; i++) {
        const here = path[i] as { x: number; z: number };
        const next = (path[i + 1] ?? path[i - 1]) as { x: number; z: number };
        const forward = i + 1 < path.length ? 1 : -1;
        const dx = (next.x - here.x) * forward;
        const dz = (next.z - here.z) * forward;
        const axis: 0 | 1 = dx !== 0 ? 0 : 1;
        // The perpendicular the lane wanders across.
        const px = axis === 0 ? 0 : 1;
        const pz = axis === 0 ? 1 : 0;
        // A low-frequency positional draw, smoothed between anchors and then
        // clamped to one column of movement per cell — the clamp is what makes
        // the lane 4-connected, and it costs the meander nothing a walk sees.
        const u = i / SPINE_MEANDER_WAVELENGTH;
        const k0 = Math.floor(u);
        const frac = u - k0;
        const a = anchor(k0);
        const b = anchor(k0 + 1);
        const smooth = frac * frac * (3 - 2 * frac);
        const target = Math.round((a + (b - a) * smooth) * amp);
        const offset =
          previous === undefined ? target : Math.max(previous - 1, Math.min(previous + 1, target));
        previous = offset;
        // How far this street still runs each way, in world-axis terms.
        const ahead = path.length - 1 - i;
        const behind = i;
        const positive = axis === 0 ? next.x - here.x > 0 : next.z - here.z > 0;
        const towardsPositive = forward === 1 ? positive : !positive;
        const run: SpineRun = towardsPositive
          ? { axis, pos: ahead, neg: behind }
          : { axis, pos: behind, neg: ahead };
        let claimed: number | undefined;
        for (let w = 0; w < lane; w++) {
          const sx = here.x + px * (offset + w);
          const sz = here.z + pz * (offset + w);
          const k = colIndex(sx, sz);
          if (k < 0) continue;
          spine[k] = 1;
          spineRun.set(k, run);
          spineColumns++;
          if (claimed === undefined) claimed = k;
        }
        // The one thing the clamp cannot promise on its own: a path point whose
        // whole lane fell outside the region. Counted rather than swallowed.
        if (claimed === undefined) {
          spineBreaks++;
        } else if (last !== undefined) {
          const lx = region.x0 + (last % region.width);
          const lz = region.z0 + Math.floor(last / region.width);
          const cx = region.x0 + (claimed % region.width);
          const cz = region.z0 + Math.floor(claimed / region.width);
          if (Math.abs(cx - lx) + Math.abs(cz - lz) > 2) spineBreaks++;
        }
        last = claimed ?? last;
      }
    }
  }

  /* --- 3. junction clearance (§6.2) -------------------------------------- */

  const junctionClear = new Uint8Array(cells);
  const junctions: { x: number; z: number }[] = [];
  for (const district of input.districts) {
    for (const node of district.streets.intersections) {
      junctions.push({ x: node.x, z: node.z });
      for (let dz = -JUNCTION_CLEAR; dz <= JUNCTION_CLEAR; dz++) {
        for (let dx = -JUNCTION_CLEAR; dx <= JUNCTION_CLEAR; dx++) {
          const k = colIndex(node.x + dx, node.z + dz);
          if (k >= 0) junctionClear[k] = 1;
        }
      }
    }
  }

  /* --- 4. the election (§6.2) -------------------------------------------- */

  const DIRS: readonly (readonly [number, number])[] = Object.freeze([
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const);

  /**
   * Would a trunk here cut a spine column's view down its own street?
   *
   * The rule read from the spine's side: a spine column looks both ways along
   * its street axis, and what it must see is `SIGHT_MIN` columns of clear lane
   * — or the whole street, when the street is shorter than that. So a candidate
   * is refused when some spine column within `SIGHT_MIN` along *its* axis has
   * more street left in the candidate's direction than the gap between them.
   */
  const cutsSightLine = (x: number, z: number): boolean => {
    for (const [dx, dz] of DIRS) {
      const axis: 0 | 1 = dx !== 0 ? 0 : 1;
      for (let dist = 1; dist <= SIGHT_MIN; dist++) {
        const k = colIndex(x + dx * dist, z + dz * dist);
        if (k < 0) break;
        const run = spineRun.get(k);
        if (run === undefined || run.axis !== axis) continue;
        // From that spine column the candidate lies the other way.
        const towards = axis === 0 ? (dx > 0 ? run.neg : run.pos) : dz > 0 ? run.neg : run.pos;
        if (dist < Math.min(SIGHT_MIN, towards)) return true;
      }
    }
    return false;
  };

  const doorsteps = input.doorstepColumns;
  const touchesDoorstep = (x: number, z: number): boolean => {
    if (doorsteps === undefined) return false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = colIndex(x + dx, z + dz);
        if (k >= 0 && doorsteps[k] === 1) return true;
      }
    }
    return false;
  };

  const elected: number[] = [];
  const electedAt: { x: number; z: number }[] = [];
  const spacingOk = (x: number, z: number, spacing: number): boolean => {
    for (const p of electedAt) {
      if (Math.max(Math.abs(p.x - x), Math.abs(p.z - z)) < spacing) return false;
    }
    return true;
  };

  // > Election order is a deterministic sweep in column order (`z` then `x`)
  // > over the eligible set, taking a column when its channel-57 draw is under
  // > the band's share **and** it violates none of the four rules against the
  // > columns already elected. Order-dependent, but the order is fixed and
  // > positional, so the result is a pure function of the seed.
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const k = j * region.width + i;
      if (eligible[k] === 0) continue;
      const x = region.x0 + i;
      const shares = sharesAt(x, z);
      if (hash3(seed, x, 0, z, GREEN_SKIN_CHANNELS.colonize) >= shares.streetTrunk) continue;
      if (spine[k] === 1) continue;
      if (junctionClear[k] === 1) continue;
      if (nearDoor(x, groundAt(x, z) + 1, z)) continue;
      // **A doorstep's only street neighbour is the door's approach.** The base
      // plan's first guarantee reaches one column further than the landing
      // itself: a landing is a declared walk surface with, often, exactly one
      // declared neighbour, and a trunk on that neighbour leaves the door
      // opening onto a one-column island. Measured on the WP-6d fixture — the
      // audit's second component was a single doorstep at (17, 27) whose only
      // way out was the column elected at (17, 28).
      if (touchesDoorstep(x, z)) continue;
      if (!spacingOk(x, z, shares.streetTrunkSpacing)) continue;
      if (cutsSightLine(x, z)) continue;
      elected.push(k);
      electedAt.push({ x, z });
    }
  }

  /* --- 5. U2 — growth never seals a route (§6.3) -------------------------- */

  /**
   * The pedestrian graph, over the district street bands, by
   * `walkability.ts`'s own **reciprocal-move** rule: an edge exists only when
   * the move is level or a rise a body can walk back down. The base plan's §8
   * uses the audit as a bar; this uses its *law* as a predicate, and the
   * distinction matters — the physics lint's agent may drop three blocks and
   * would happily declare a street connected that a player cannot climb out of.
   */
  const levelAt = (x: number, z: number): number => {
    const span = index.spanAt(x, z);
    if (span !== undefined) {
      for (let y = span.y1; y >= span.y0; y--) {
        if (!index.openAt(x, y, z)) return y;
      }
    }
    return groundAt(x, z);
  };
  const level = new Int32Array(cells);
  const bandColumns: number[] = [];
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const k = j * region.width + i;
      if (streetBand[k] !== 1) continue;
      level[k] = levelAt(region.x0 + i, region.z0 + j);
      bandColumns.push(k);
    }
  }
  /** Component labels over the band, with `blocked` columns removed. */
  const componentsOf = (blocked: Uint8Array | undefined): Int32Array => {
    const label = new Int32Array(cells).fill(-1);
    let next = 0;
    for (const start of bandColumns) {
      if (label[start] !== -1) continue;
      if (blocked !== undefined && blocked[start] === 1) continue;
      const id = next++;
      const queue = [start];
      label[start] = id;
      while (queue.length > 0) {
        const k = queue.pop() as number;
        const i = k % region.width;
        const j = (k - i) / region.width;
        for (const [dx, dz] of DIRS) {
          const ni = i + dx;
          const nj = j + dz;
          if (ni < 0 || nj < 0 || ni >= region.width || nj >= region.depth) continue;
          const nk = nj * region.width + ni;
          if (streetBand[nk] !== 1 || label[nk] !== -1) continue;
          if (blocked !== undefined && blocked[nk] === 1) continue;
          // The reciprocal move: level, or one course either way.
          if (Math.abs((level[nk] as number) - (level[k] as number)) > 1) continue;
          label[nk] = id;
          queue.push(nk);
        }
      }
    }
    return label;
  };

  const baseline = componentsOf(undefined);
  /**
   * The differential bar, made a predicate: every baseline component's
   * surviving columns must still form **one** component. A colonizer that
   * splits nothing contributes exactly zero to `components`, to
   * `orphanColumns` and to `entranceReachableShare`, which is §6.3's acceptance
   * stated as a construction rather than as a golden number.
   */
  const sealsARoute = (blocked: Uint8Array): boolean => {
    const after = componentsOf(blocked);
    const seen = new Map<number, number>();
    for (const k of bandColumns) {
      if (blocked[k] === 1) continue;
      const before = baseline[k] as number;
      if (before < 0) continue;
      const now = after[k] as number;
      const first = seen.get(before);
      if (first === undefined) seen.set(before, now);
      else if (first !== now) return true;
    }
    return false;
  };

  // > On failure, **withdraw** elected trunks in reverse election order until it
  // > passes, and count the withdrawals.
  //
  // Read as written — take the whole elected set, then peel it from the tail —
  // that loop withdraws every trunk *after* the first offender as well: 64 of
  // 86 on the WP-6d fixture, against §11's own "under 5%" bar, and a `W513`
  // rate that says nothing about `STREET_TRUNK_SHARE` because it is dominated
  // by innocent bystanders. So the peel is per trunk and still tail-first: the
  // set is grown in election order and a trunk that seals a route is the one
  // withdrawn, which is exactly "reverse election order" among the trunks that
  // actually conflict, and nothing among the trunks that do not.
  const blocked = new Uint8Array(cells);
  const trunkColumns: { x: number; z: number }[] = [];
  let withdrawn = 0;
  for (let n = 0; n < elected.length; n++) {
    const k = elected[n] as number;
    blocked[k] = 1;
    if (sealsARoute(blocked)) {
      blocked[k] = 0;
      withdrawn++;
      continue;
    }
    colonized[k] = 1;
    trunkColumns.push(electedAt[n] as { x: number; z: number });
  }
  const keep = trunkColumns.length;

  /* --- the legibility measurements (§6.2, §9) ---------------------------- */

  let shortestSightRun = Number.POSITIVE_INFINITY;
  let sightViolations = 0;
  for (const [k, run] of spineRun) {
    const i = k % region.width;
    const j = (k - i) / region.width;
    const x = region.x0 + i;
    const z = region.z0 + j;
    for (const sign of [1, -1] as const) {
      const limit = sign > 0 ? run.pos : run.neg;
      const required = Math.min(SIGHT_MIN, limit);
      if (required <= 0) continue;
      let actual = limit;
      for (let dist = 1; dist <= limit; dist++) {
        const nk = colIndex(
          x + (run.axis === 0 ? sign * dist : 0),
          z + (run.axis === 1 ? sign * dist : 0),
        );
        if (nk >= 0 && colonized[nk] === 1) {
          actual = dist - 1;
          break;
        }
      }
      // The reported number is the one §6.2 is actually about — *"grid at city
      // scale"* — so it is measured only where the street is long enough to
      // carry a full run. A spine column two from the end of a lane has a
      // one-column view by geometry, and averaging that into the metric would
      // make the headline say the opposite of what the law guarantees.
      if (required >= SIGHT_MIN && actual < shortestSightRun) shortestSightRun = actual;
      if (actual < required) sightViolations++;
    }
  }
  let nearestJunction = Number.POSITIVE_INFINITY;
  for (const p of trunkColumns) {
    for (const node of junctions) {
      const d = Math.max(Math.abs(node.x - p.x), Math.abs(node.z - p.z));
      if (d < nearestJunction) nearestJunction = d;
    }
  }

  /* --- 6. shell trees — Kai's Q5 ruling, at heavy AND total --------------- */

  // Kai's 6e ruling: ON unless a caller explicitly asks for the world without
  // the image. `!== false` rather than `=== true` is the whole flip.
  const shellTrees = input.shellTrees !== false
    ? electShellTrees({
        input,
        index,
        colIndex,
        intensityAt,
        nearDoor,
        into: shellTrunks,
      })
    : 0;

  return {
    colonized,
    shellTrunks,
    eligible,
    streetTrunks: keep,
    shellTrees,
    spineColumns,
    shortestSightRun,
    sightViolations,
    nearestJunction,
    spineBreaks,
    elected: elected.length,
    withdrawn,
  };
}

/**
 * §6.4's other half — *"everything under two blocks is the skin's"*.
 *
 * A second pass, after the horizontal skin, for the same reason WP-6c was a
 * second pass after WP-6b: it reads what the substitution left. The species are
 * deliberately the two that are invisible to the walkability audit — a tuft and
 * a fern are inert to `supportAt` and to `passableAt` alike — because §6.2's
 * spine law says *"no trunk and no body-blocking growth"* and the cheapest way
 * to keep that promise everywhere is to own nothing that blocks a body.
 */
function plantStreetCover(args: {
  readonly index: SurfaceIndex;
  readonly colIndex: (x: number, z: number) => number;
  readonly region: ColumnPlan["region"];
  readonly eligible: Uint8Array;
  readonly colonized: Uint8Array;
  readonly sharesAt: (x: number, z: number) => ReturnType<typeof greenSkinShares>;
  readonly groundAt: (x: number, z: number) => number;
  readonly nearDoor: (x: number, y: number, z: number) => boolean;
  readonly put: (x: number, y: number, z: number, stateId: number) => boolean;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  readonly seed: number;
}): number {
  const { index, colIndex, region, eligible, colonized, sharesAt, groundAt, nearDoor, put } = args;
  const { palette, stack, seed } = args;
  let shrubs = 0;
  const coverState = (x: number, z: number): number | undefined => {
    const [symbol, fallback] = hashPick(seed, x, z, GREEN_SKIN_CHANNELS.shrub, STREET_COVER);
    if (palette.has(symbol)) return palette.stateAt(symbol, x, z);
    return stack.blockByName(fallback)?.stateId;
  };
  const topAt = (x: number, z: number): number => {
    const span = index.spanAt(x, z);
    if (span !== undefined) {
      for (let y = span.y1; y >= span.y0; y--) if (!index.openAt(x, y, z)) return y;
    }
    return groundAt(x, z);
  };
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const k = j * region.width + i;
      const kind = eligible[k];
      if (kind === 0) continue;
      // A trunk's own column is the scatter's; the skin does not crowd it.
      if (colonized[k] === 1) continue;
      const x = region.x0 + i;
      const shares = sharesAt(x, z);
      const share = kind === 1 ? shares.streetCarriageway : shares.streetSidewalk;
      if (hash3(seed, x, 0, z, GREEN_SKIN_CHANNELS.shrub) >= share) continue;
      const top = topAt(x, z);
      if (!index.openAt(x, top + 1, z)) continue;
      const name = index.nameAt(x, top, z);
      // > **The skin plants only on ground it has itself turned to soil or
      // > moss.** The substitution ran in the horizontal sweep above; the
      // > planting runs here, in the same pass, and reads what that sweep left.
      if (name === undefined || !PLANTABLE_GROUND.test(name)) continue;
      if (nearDoor(x, top + 1, z)) continue;
      const state = coverState(x, z);
      if (state === undefined) continue;
      if (colIndex(x, z) < 0) continue;
      if (put(x, top + 1, z, state)) shrubs++;
    }
  }
  return shrubs;
}

/**
 * **One trunk per roofless shell**, at `heavy` and `total` (Kai, 2026-08-10).
 *
 * Q5 asked whether a tree may grow out of a roofless shell's interior and
 * recommended `total` only; Kai ruled **bolder** — heavy as well, *"a trunk may
 * burst from a roofless shell in half-ruined quarters too, one per shell, sited
 * where the interior flood does not need it"*.
 *
 * The siting rule is the ruling's own, and it is checked rather than argued:
 * the cell is the one furthest from the shell's door, and it is taken only when
 * the room's open cells stay one 4-connected component without it. That is
 * `reachOrRefuse`'s own proof re-run over one candidate at a time — WP-2's
 * guarantee is that a door reaches every interior cell, and a trunk that
 * separates the room from its door would take it away.
 */
function electShellTrees(args: {
  readonly input: GreenSkinInput;
  readonly index: SurfaceIndex;
  readonly colIndex: (x: number, z: number) => number;
  readonly intensityAt: (x: number, z: number) => number;
  readonly nearDoor: (x: number, y: number, z: number) => boolean;
  readonly into: Uint8Array;
}): number {
  const { input, index, colIndex, intensityAt, nearDoor, into } = args;
  let planted = 0;
  for (const building of input.buildings ?? []) {
    const decay = building.meta.decay;
    // A shell the decay engine actually crumbled. A `"none"` shell kept its
    // walls and its plate; a refused one was rebuilt intact.
    if (decay === undefined || decay.refused || decay.mode !== "shell") continue;
    const cx = Math.round((building.footprint.x0 + building.footprint.x1) / 2);
    const cz = Math.round((building.footprint.z0 + building.footprint.z1) / 2);
    const band = bandForIntensity(intensityAt(cx, cz));
    // **Kai's ruling: heavy AND total.** `light` keeps its roof on.
    if (band !== "heavy" && band !== "total") continue;

    const room = [...building.interiorCells]
      .map((key) => {
        const [x, z] = key.split(",").map(Number) as [number, number];
        return { x, z, key };
      })
      // Fixed, positional order: the set's iteration order is the fit-out's,
      // and a siting that depended on it would not be a function of the seed.
      .sort((a, b) => a.z - b.z || a.x - b.x);
    if (room.length < 4) continue;

    /**
     * **Two different questions**, and getting them confused is what made the
     * first cut of this elect nothing at all.
     *
     * *Is the shell roofless* is asked **above the top storey**. Asked at head
     * height instead it measures the *second storey's floor plate*, which on
     * the WP-6d fixture called 97 % of every room covered at `decline: 0.95` —
     * a townhouse having two floors, not a shell having a roof.
     *
     * *May a trunk stand in this column* is asked at the two ends that matter:
     * a body's headroom on the floor (so the trunk is not founded inside
     * rubble) and **nothing above the roof line** (so the canopy is *"allowed
     * above the wall head"* and does not push through a roof). What it does not
     * ask is that the shaft be clear of the shell's own upper **floor plate**,
     * and that is the ruling: a two-storey shell keeps its plate through every
     * crumble the engine draws, so a strict shaft test elects exactly zero
     * trunks on a fixture where 38 of 42 shells are roofless — machinery that
     * exists and never runs, which is DESIGN's second failure mode. A trunk
     * *bursting* from a roofless shell goes through the plate; that is what the
     * word means, and it is the line Q5 says the ruling crosses on purpose.
     * The plate stays supported at its edges, so nothing is left hanging.
     */
    const roofline = building.floorY + Math.max(0, ...building.meta.floorLevels) + 3;
    const solidAbove = (x: number, z: number, from: number): boolean => {
      const span = index.spanAt(x, z);
      if (span === undefined) return false;
      for (let y = Math.max(from, span.y0); y <= span.y1; y++) {
        if (!index.openAt(x, y, z)) return true;
      }
      return false;
    };
    const underOpenSky = (x: number, z: number): boolean => !solidAbove(x, z, roofline);
    let covered = 0;
    for (const cell of room) if (solidAbove(cell.x, cell.z, roofline)) covered++;
    if (covered / room.length > SHELL_ROOFLESS_MAX) continue;

    /**
     * The standable cells of **one storey** — the flood U2 borrows from
     * `reachOrRefuse`, asked at that storey's own floor plane.
     */
    const openAtLevel = (level: number, cells: readonly { x: number; z: number; key: string }[]) => {
      const feet = building.floorY + level + 1;
      const set = new Set<string>();
      for (const cell of cells) {
        if (!index.openAt(cell.x, feet, cell.z)) continue;
        if (!index.openAt(cell.x, feet + 1, cell.z)) continue;
        set.add(cell.key);
      }
      return set;
    };
    const open = openAtLevel(0, room);
    if (open.size < 4) continue;
    /**
     * **Every storey, not only the ground floor** — WP-6e's tightening.
     *
     * A trunk *bursts* through the plate, so it stands in the upper rooms as
     * well as the lower one, and the ground floor's answer is not the
     * building's answer. Measured on the WP-6e fixture: two trunks each sited
     * on a perfectly whole ground floor cut one **corner cell of the second
     * storey** off from the flight, for two `traversal.unreachable` findings.
     * Kai's 6e exemption covers rule 17 and stops there — reachability stays
     * enforced — so the siting is what has to give, and it gives here.
     */
    const storeys: readonly { level: number; open: Set<string> }[] = (
      building.meta.floorLevels ?? [0]
    ).map((level, i) => {
      const cellsAt = building.interiorCellsByLevel?.[i];
      const cells =
        cellsAt === undefined
          ? room
          : room.filter((cell) => cellsAt.has(cell.key));
      return { level, open: openAtLevel(level, cells) };
    });
    const stairs = building.stairCells ?? new Set<string>();
    const doorSide = room.filter((cell) => nearDoor(cell.x, building.floorY + 1, cell.z));

    /** One storey's room stays one component with this cell taken out of it. */
    const levelWhole = (open: Set<string>, without: string): boolean => {
      const start = [...open].find((key) => key !== without);
      if (start === undefined) return false;
      const seen = new Set<string>([start]);
      const queue = [start];
      while (queue.length > 0) {
        const key = queue.pop() as string;
        const [x, z] = key.split(",").map(Number) as [number, number];
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nk = `${x + dx},${z + dz}`;
          if (nk === without || seen.has(nk) || !open.has(nk)) continue;
          seen.add(nk);
          queue.push(nk);
        }
      }
      return seen.size === open.size - (open.has(without) ? 1 : 0);
    };
    /** …on **every** storey the trunk passes through. */
    const staysWhole = (without: string): boolean =>
      storeys.every(({ open: level }) => level.size < 2 || levelWhole(level, without));

    // Furthest from the door, then furthest from the room's edge: a trunk in
    // the middle of a nave, not one wedged into the doorway.
    const distanceToDoor = (cell: { x: number; z: number }): number => {
      if (doorSide.length === 0) return 0;
      let best = Number.POSITIVE_INFINITY;
      for (const d of doorSide) {
        best = Math.min(best, Math.max(Math.abs(d.x - cell.x), Math.abs(d.z - cell.z)));
      }
      return best;
    };
    const candidates = room
      .filter((cell) => open.has(cell.key))
      .filter((cell) => !stairs.has(cell.key))
      .filter((cell) => !nearDoor(cell.x, building.floorY + 1, cell.z))
      .filter((cell) => underOpenSky(cell.x, cell.z))
      .filter((cell) => colIndex(cell.x, cell.z) >= 0)
      .sort((a, b) => distanceToDoor(b) - distanceToDoor(a) || a.z - b.z || a.x - b.x);

    for (const cell of candidates) {
      if (!staysWhole(cell.key)) continue;
      const k = colIndex(cell.x, cell.z);
      into[k] = 1;
      planted++;
      break;
    }
  }
  return planted;
}
