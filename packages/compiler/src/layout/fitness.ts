/**
 * Terrain fitness — how good a piece of ground is to build on.
 *
 * The solver runs after the master heightfield is composed and classified
 * (§4.7 obligation 6) and before anything is materialized, so this is the only
 * information it has about the world: heights, slopes, and a hazard mask of
 * columns it must never build on.
 *
 * Water and lava are **hard**: a building that starts in the sea is not a
 * building with a high cost, it is a bug. Flatness is soft, and expressed as
 * the standard deviation of the ground under the footprint rather than as a
 * max/min range, so that one awkward column does not veto an otherwise good
 * site while a generally lumpy one is properly punished.
 */

import type { Classification, HeightField } from "@terrainist/stdlib";

import type { Rect } from "./frames.js";

/** Ground statistics under a candidate footprint. */
export interface FootprintStats {
  /** Median ground height — the foundation elevation for `reference: "median"`. */
  readonly median: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  /** Standard deviation of ground height, in blocks. */
  readonly deviation: number;
  readonly meanSlope: number;
  readonly maxSlope: number;
  /** True when any column is ocean, lake or lava. */
  readonly hazard: boolean;
  /** True when the footprint leaves the region. */
  readonly outOfRegion: boolean;
  readonly columns: number;
}

/**
 * Scratch buffer for the footprint heights, reused across calls.
 *
 * A district candidate's footprint is the whole district envelope (hundreds of
 * thousands of columns) and the solver evaluates many candidates, so copying
 * and comparator-sorting a fresh `number[]` per call dominated both runtime and
 * GC. The buffer is only ever live inside a single synchronous
 * {@link footprintStats} call — nothing it holds is read across calls, and
 * JavaScript's single-threaded, non-reentrant execution means no two calls can
 * overlap — so there is no state to leak between compiles.
 */
let heightScratch = new Float64Array(0);

/**
 * The k-th smallest of `buf[0..n)`, selected in place (Hoare partition,
 * median-of-three pivot — deterministic, no randomness).
 *
 * Exactly equal to `Array.from(buf.subarray(0, n)).sort((a, b) => a - b)[k]`
 * for any finite input, including even `n` (the caller passes `n >> 1`, the
 * upper middle, and that is preserved).
 */
function nthSmallest(buf: Float64Array, n: number, k: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const a = buf[lo] as number;
    const b = buf[hi] as number;
    const c = buf[mid] as number;
    let pivot = c;
    if (a < c) {
      if (c > b) pivot = a > b ? a : b;
    } else {
      if (c < b) pivot = a < b ? a : b;
    }
    let i = lo;
    let j = hi;
    while (i <= j) {
      while ((buf[i] as number) < pivot) i++;
      while ((buf[j] as number) > pivot) j--;
      if (i <= j) {
        const t = buf[i] as number;
        buf[i] = buf[j] as number;
        buf[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return buf[k] as number;
  }
  return buf[k] as number;
}

/** Deviation (blocks) at which the flatness term saturates. */
export const FLATNESS_SCALE = 8;

/** Weight of the flatness term inside the terrain cost. */
export const FLATNESS_WEIGHT = 0.55;

/** Weight of the slope term inside the terrain cost. */
export const SLOPE_WEIGHT = 0.45;

/** Gather ground statistics under an inclusive world rectangle. */
export function footprintStats(
  field: HeightField,
  classification: Classification,
  rect: Rect,
  hazardMask?: Uint8Array,
): FootprintStats {
  const region = field.region;
  const capacity = Math.max(0, rect.x1 - rect.x0 + 1) * Math.max(0, rect.z1 - rect.z0 + 1);
  if (heightScratch.length < capacity) heightScratch = new Float64Array(capacity);
  const heights = heightScratch;
  let n = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let slopeSum = 0;
  let maxSlope = 0;
  let hazard = false;
  let outOfRegion = false;

  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) {
        outOfRegion = true;
        continue;
      }
      const idx = j * region.width + i;
      const h = field.values[idx] as number;
      heights[n++] = h;
      sum += h;
      if (h < min) min = h;
      if (h > max) max = h;
      const slope = classification.slopes[idx] as number;
      slopeSum += slope;
      if (slope > maxSlope) maxSlope = slope;
      if (hazardMask !== undefined && hazardMask[idx] === 1) hazard = true;
    }
  }

  if (n === 0) {
    return {
      median: 0, mean: 0, min: 0, max: 0, deviation: 0,
      meanSlope: 0, maxSlope: 0, hazard: true, outOfRegion: true, columns: 0,
    };
  }
  const mean = sum / n;
  let varianceSum = 0;
  // Accumulated in insertion order, and *before* the selection below permutes
  // the buffer: floating-point addition is not associative, so a different
  // visiting order would give a different last bit.
  for (let k = 0; k < n; k++) {
    const h = heights[k] as number;
    varianceSum += (h - mean) * (h - mean);
  }
  const median = nthSmallest(heights, n, n >> 1);

  return {
    median,
    mean,
    min,
    max,
    deviation: Math.sqrt(varianceSum / n),
    meanSlope: slopeSum / n,
    maxSlope,
    hazard,
    outOfRegion,
    columns: n,
  };
}

/**
 * The soft terrain cost of a footprint, in `[0, 1]`.
 *
 * Both terms are normalized so this composes with the constraint costs, which
 * are normalized against `frameNorm` (§4.9.4). Hard rejections are the
 * caller's job — see {@link terrainFeasible}.
 */
export function terrainCost(stats: FootprintStats, maxSlopeLimit: number): number {
  const flat = clamp01(stats.deviation / FLATNESS_SCALE);
  const slope = clamp01(stats.meanSlope / Math.max(maxSlopeLimit, 1));
  return FLATNESS_WEIGHT * flat + SLOPE_WEIGHT * slope;
}

/** Why a footprint is unbuildable, or `null` when it is fine. */
export type TerrainVeto = "out_of_region" | "hazard" | "underwater" | "too_steep" | null;

/**
 * Hard ground checks. Water, lava and off-map are never negotiable; the slope
 * limit comes from `terrain_conform.maxSlope` and defaults to
 * {@link DEFAULT_MAX_SLOPE}.
 */
export function terrainFeasible(
  stats: FootprintStats,
  maxSlopeLimit: number,
  minGroundY: number,
): TerrainVeto {
  if (stats.outOfRegion) return "out_of_region";
  if (stats.hazard) return "hazard";
  if (stats.min < minGroundY) return "underwater";
  if (stats.maxSlope > maxSlopeLimit) return "too_steep";
  return null;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
