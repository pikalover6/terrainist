/**
 * Interior air on the column plan: the spans tunnels, galleries and cellars
 * cut out of the stone body, and the two invariants every carved span keeps —
 * nothing wet is approached, nothing above ground moves except where a portal
 * is declared. {@link checkCaveIntegrity} recomputes both from the finished
 * spans rather than trusting the pass that cut them.
 */

import { dilate, type CaveSpans, type Marker } from "@terrainist/stdlib";

/** Solid rock an interior span keeps below the surface, except at a declared portal. */
const CAVE_ROOF_THICKNESS = 4;


import { FluidKind, type ColumnPlan } from "./columns.js";

/** The interior air attached to the column plan. */
export interface CavePlan {
  readonly spans: CaveSpans;
  /** 1 for a column an entrance mouth opens to the sky. */
  readonly entranceColumns: Uint8Array;
  /** `cave_mouth` markers, one per opened entrance. */
  readonly markers: readonly Marker[];
  /** Air blocks cut out of the stone body. */
  readonly carvedBlocks: number;
  /**
   * 1 for a column whose air the *structure* pass owns — a tunnel bore.
   *
   * The roof rule below is the carver's contract with the surface, and a
   * gallery dug between two cellars is not the carver's. Its own thickness rule
   * lives in {@link checkTunnelIntegrity}, which knows where the portals are;
   * this flag is how the carver's validator is told to leave it alone.
   */
  readonly structuralColumns?: Uint8Array;
  /** 1 for a tunnel portal column, where the roof is thin by design. */
  readonly portalColumns?: Uint8Array;
}

/** Union several span sets over the same region, re-merging per column. */
export function mergeSpanSets(sets: readonly CaveSpans[], columns: number): CaveSpans {
  if (sets.length === 1) return sets[0] as CaveSpans;
  const offsets = new Int32Array(columns + 1);
  const outLo: number[] = [];
  const outHi: number[] = [];

  for (let idx = 0; idx < columns; idx++) {
    offsets[idx] = outLo.length;
    const runs: [number, number][] = [];
    for (const set of sets) {
      const end = set.offsets[idx + 1] as number;
      for (let k = set.offsets[idx] as number; k < end; k++) {
        runs.push([set.lo[k] as number, set.hi[k] as number]);
      }
    }
    runs.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
    for (const [lo, hi] of runs) {
      const last = outLo.length - 1;
      if (last >= (offsets[idx] as number) && lo <= (outHi[last] as number) + 1) {
        if (hi > (outHi[last] as number)) outHi[last] = hi;
        continue;
      }
      outLo.push(lo);
      outHi.push(hi);
    }
  }
  offsets[columns] = outLo.length;
  return { offsets, lo: Int32Array.from(outLo), hi: Int32Array.from(outHi) };
}

/**
 * Dissolve one-block rock slabs that nothing holds on to.
 *
 * The stdlib deliberately keeps a one-block slab between two spans of a column
 * rather than merging them, because that slab is what a stalagmite at `lo` and a
 * stalactite at `hi` are anchored to. But a slab whose four lateral neighbours
 * are *also* air is a stone block floating in a void — the `floating.isolated`
 * physics rule's exact definition, and a thing a player reads as a compiler bug
 * rather than as geology. It only shows up where two systems pass each other,
 * which is why it took a document with four cave nodes to surface it.
 *
 * Removing the slab merges the two spans, which is safe on every count: the
 * merged span still ends in rock at `lo - 1` and `hi + 1`, and both halves were
 * already inside the same column's carve band, so neither the fluid shell nor
 * the roof margin can move. The pass runs to a fixpoint because opening one
 * slab can leave a neighbouring one isolated in turn; it is a no-op on any world
 * that had no isolated slab to begin with.
 */
interface CaveBreach {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly detail: string;
}

/** Findings of the two cave invariants, with a handful of examples each. */
export interface CaveIntegrityReport {
  readonly fluidBreaches: number;
  readonly surfaceBreaches: number;
  readonly samples: readonly CaveBreach[];
}

/** Examples a cave integrity report carries. */
const MAX_CAVE_SAMPLES = 8;

/** Horizontal shell a cave keeps from any fluid column. */
const CAVE_FLUID_SHELL_BLOCKS = 4;

/** Horizontal reach of the ocean keep-out. */
const CAVE_OCEAN_KEEPOUT_BLOCKS = 8;

/**
 * Recompute both cave invariants from the finished spans.
 *
 * The fluid rule is checked the strong way: the fluid mask is re-derived from
 * the plan, dilated by four, and *any* span in a covered column is a breach —
 * not "a span near enough vertically", which would let a carver bug hide behind
 * a lucky depth. The ocean keep-out is a second dilation, by eight, against
 * which no span may reach sea level. Both are recomputed here rather than
 * carried over from the carver, so the two implementations have to agree.
 *
 * This should always find nothing. It exists because "always" is the claim
 * being made, and a claim nobody re-derives is a comment.
 */
export function checkCaveIntegrity(plan: ColumnPlan): CaveIntegrityReport {
  const caves = plan.caves;
  const samples: CaveBreach[] = [];
  let fluidBreaches = 0;
  let surfaceBreaches = 0;
  if (caves === undefined) return { fluidBreaches, surfaceBreaches, samples };

  const { region, ground, seaLevel } = plan;
  const n = region.width * region.depth;
  const fluid = new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    if (plan.fluidKind[idx] !== FluidKind.NONE) fluid[idx] = 1;
  }
  const nearFluid = dilate(fluid, region.width, region.depth, CAVE_FLUID_SHELL_BLOCKS);
  const nearOcean = dilate(plan.oceanMask, region.width, region.depth, CAVE_OCEAN_KEEPOUT_BLOCKS);
  const structural = caves.structuralColumns;

  const sample = (breach: CaveBreach): void => {
    if (samples.length < MAX_CAVE_SAMPLES) samples.push(breach);
  };

  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      const start = caves.spans.offsets[idx] as number;
      const end = caves.spans.offsets[idx + 1] as number;
      if (start === end) continue;
      const x = region.x0 + i;
      const z = region.z0 + j;
      const surface = ground[idx] as number;
      const entrance = caves.entranceColumns[idx] === 1;

      if (nearFluid[idx] === 1) {
        fluidBreaches += end - start;
        sample({
          x,
          y: caves.spans.hi[start] as number,
          z,
          detail: `carved within ${CAVE_FLUID_SHELL_BLOCKS} blocks of a water or lava column`,
        });
      }

      for (let k = start; k < end; k++) {
        const lo = caves.spans.lo[k] as number;
        const hi = caves.spans.hi[k] as number;

        if (nearOcean[idx] === 1 && lo <= seaLevel) {
          fluidBreaches++;
          sample({
            x,
            y: lo,
            z,
            detail: `reaches y ${lo}, at or below sea level ${seaLevel}, within ${CAVE_OCEAN_KEEPOUT_BLOCKS} blocks of the ocean`,
          });
        }

        if (entrance) continue;
        if (structural !== undefined && structural[idx] === 1) continue;
        if (hi >= surface) {
          surfaceBreaches++;
          sample({ x, y: hi, z, detail: `reaches y ${hi}, removing the surface block at y ${surface}` });
        } else if (hi > surface - CAVE_ROOF_THICKNESS) {
          surfaceBreaches++;
          sample({
            x,
            y: hi,
            z,
            detail: `leaves only ${surface - hi} blocks of roof (want ${CAVE_ROOF_THICKNESS})`,
          });
        }
      }
    }
  }
  return { fluidBreaches, surfaceBreaches, samples };
}
