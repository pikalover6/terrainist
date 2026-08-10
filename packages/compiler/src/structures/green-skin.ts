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
 * **WP-6a's scope is this file's index and nothing else.** The pass is wired in
 * as the last structure pass and it **writes no blocks**: `growGreenSkin`
 * returns an empty block list under every input it can be given today, which is
 * exactly what makes WP-6a's acceptance bar — every control world and every
 * `examples/` world byte-identical — a statement rather than a hope. WP-6b
 * (the vertical skin), WP-6c (the horizontal skin) and WP-6d (the street
 * colonizer) are the waves that put blocks in it.
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
 * Every draw a later wave makes is `hash2(seed, x, z, channel)` on the column —
 * no counters, no traversal order, no wall clock. Channels 41–49 are exhausted
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

import { canSupport, bodyFits } from "@terrainist/stdlib";

import type { LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";
import type { DistrictProduct } from "../layout/district.js";

import type { StructureBlock } from "./buildings.js";
import { sampleField, type RuinField } from "./ruin-field.js";

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
  /** Moss carpets on horizontal survivors (WP-6c). */
  readonly carpets: number;
  /** Pavement substitutions (WP-6c). */
  readonly pavement: number;
  /** Street/yard columns elected for a trunk (WP-6d). */
  readonly streetTrunks: number;
  /** Shrubs and tufts the skin planted (WP-6d). */
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
 * **WP-6a: this returns no blocks.** It builds the index the later waves read,
 * proves the reach law structurally (`ruinField === undefined` returns on the
 * first line), and hands back an empty `colonized` mask so that the closure
 * stays exactly as closed as it was.
 */
export function growGreenSkin(input: GreenSkinInput): GreenSkinResult {
  const cells = input.plan.region.width * input.plan.region.depth;
  // §3.4, the reach law, structural and on the first line.
  if (input.ruinField === undefined) {
    return {
      blocks: [],
      colonized: new Uint8Array(cells),
      counts: NO_COUNTS,
      diagnostics: [],
    };
  }

  const { index, cost } = buildSurfaceIndex(
    input.plan,
    input.ruinField,
    input.laid,
    input.stack,
  );

  return {
    // WP-6b/c/d fill these. WP-6a writes nothing, on purpose: it is the wave
    // whose acceptance is that every world is byte-identical.
    blocks: [],
    colonized: new Uint8Array(cells),
    counts: {
      ...NO_COUNTS,
      indexedColumns: index.columns,
      indexedCells: index.cells,
      indexedBlocks: cost.stored,
    },
    cost,
    diagnostics: [],
  };
}
