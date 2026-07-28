/**
 * Heightfield construction — the materialized master field every later pass
 * reads, plus the `heightAt(x, z)` sampler required by LOAM-SPEC-v0.1 §4.7.6.
 */

import { clamp } from "../math/index.js";
import type { Seed256 } from "../determinism/index.js";
import type { CurvePoint, NoiseStackParams, NoiseSeeds } from "../noise/index.js";
import {
  NOISE_STACK_DEFAULTS,
  deriveNoiseSeeds,
  erode,
  evaluateBaseHeight,
  resolveNoiseStackParams,
} from "../noise/index.js";

// ---------------------------------------------------------------------------
// Region
// ---------------------------------------------------------------------------

/** An axis-aligned block region in world coordinates. `x0`/`z0` are inclusive. */
export interface Region {
  x0: number;
  z0: number;
  /** Extent along +X, in blocks. */
  width: number;
  /** Extent along +Z, in blocks. */
  depth: number;
}

/** Build a region centred on the origin, the profile's default framing. */
export function centeredRegion(width: number, depth: number): Region {
  return { x0: -Math.floor(width / 2), z0: -Math.floor(depth / 2), width, depth };
}

/** Convert a fractional `[fx, fz] ∈ [0,1]²` coordinate to world blocks. */
export function fractionalToWorld(region: Region, fx: number, fz: number): [number, number] {
  return [region.x0 + fx * region.width, region.z0 + fz * region.depth];
}

// ---------------------------------------------------------------------------
// Full parameter set
// ---------------------------------------------------------------------------

/** Surface-classification params of `terrain.heightfield@0`. */
export interface ClassifyParams {
  /** Degrees; above this slope use `@ground.cliff` and skip soil. */
  cliffThreshold: number;
  /** `@ground.subsurface` thickness under `@ground.surface`. */
  soilDepth: number;
  /** Blocks either side of sea level that use `@ground.beach`. */
  beachWidth: number;
  /** Height fraction of max relief above which snow appears. */
  snowLineFraction: number;
}

/** The complete `terrain.heightfield@0` parameter set (minus `themes`). */
export interface HeightfieldParams extends NoiseStackParams, ClassifyParams {}

/** Defaults from the §7.5 table plus the profile's 0.8 snow line. */
export const HEIGHTFIELD_DEFAULTS: Readonly<HeightfieldParams> = Object.freeze({
  ...NOISE_STACK_DEFAULTS,
  cliffThreshold: 55,
  soilDepth: 3,
  beachWidth: 4,
  snowLineFraction: 0.8,
});

/** Fill in defaults for any omitted heightfield parameter. */
export function resolveHeightfieldParams(
  partial: Partial<HeightfieldParams> | undefined,
): HeightfieldParams {
  const p = partial ?? {};
  return {
    ...resolveNoiseStackParams(p),
    cliffThreshold: p.cliffThreshold ?? HEIGHTFIELD_DEFAULTS.cliffThreshold,
    soilDepth: p.soilDepth ?? HEIGHTFIELD_DEFAULTS.soilDepth,
    beachWidth: p.beachWidth ?? HEIGHTFIELD_DEFAULTS.beachWidth,
    snowLineFraction: p.snowLineFraction ?? HEIGHTFIELD_DEFAULTS.snowLineFraction,
  };
}

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

/**
 * A materialized heightfield over a region.
 *
 * ## Why `heightAt` reads the grid
 *
 * §7.5 describes `heightAt(x, z)` as "evaluating the same noise stack without
 * materialization". That is exactly true only while the field is a pointwise
 * function of position. Two profile features break that:
 *
 * - **thermal erosion** (`erosionPasses > 0`) is a neighbourhood operation over
 *   the whole grid — no pointwise evaluation can reproduce it;
 * - **`terrain.edit@0` kernels** are composed into the master field.
 *
 * So `heightAt` is defined as *a read of the materialized grid* (bilinear
 * between samples, clamped at the region border). `evaluateBase` remains
 * available for the pure pointwise base stack, and
 * `test/field.test.ts` asserts `heightAt(x,z) === grid[x,z]` exactly at every
 * integer column — for all parameter sets, erosion and edits included.
 */
export class HeightField {
  readonly region: Region;
  readonly values: Float64Array;

  constructor(region: Region, values?: Float64Array) {
    this.region = region;
    const n = region.width * region.depth;
    if (values && values.length !== n) {
      throw new RangeError(`HeightField: expected ${n} values, got ${values.length}`);
    }
    this.values = values ?? new Float64Array(n);
  }

  /** Grid index for integer world coordinates, or `-1` when outside. */
  index(x: number, z: number): number {
    const i = x - this.region.x0;
    const j = z - this.region.z0;
    if (i < 0 || j < 0 || i >= this.region.width || j >= this.region.depth) return -1;
    return j * this.region.width + i;
  }

  /** Grid index with coordinates clamped into the region. */
  clampedIndex(x: number, z: number): number {
    const i = clamp(x - this.region.x0, 0, this.region.width - 1) | 0;
    const j = clamp(z - this.region.z0, 0, this.region.depth - 1) | 0;
    return j * this.region.width + i;
  }

  /** Height at an integer column, clamped to the region border. */
  at(x: number, z: number): number {
    return this.values[this.clampedIndex(Math.floor(x), Math.floor(z))] as number;
  }

  /** Write the height at an integer column. Out-of-region writes are ignored. */
  set(x: number, z: number, value: number): void {
    const idx = this.index(x, z);
    if (idx >= 0) this.values[idx] = value;
  }

  /**
   * The §4.7.6 sampler. Integer columns return the stored grid value exactly;
   * fractional columns are bilinearly interpolated between neighbours.
   */
  heightAt(x: number, z: number): number {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    const tx = x - fx;
    const tz = z - fz;
    if (tx === 0 && tz === 0) return this.at(fx, fz);
    const h00 = this.at(fx, fz);
    const h10 = this.at(fx + 1, fz);
    const h01 = this.at(fx, fz + 1);
    const h11 = this.at(fx + 1, fz + 1);
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  /** Min and max stored heights. */
  extent(): { min: number; max: number } {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < this.values.length; k++) {
      const v = this.values[k] as number;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (this.values.length === 0) return { min: 0, max: 0 };
    return { min, max };
  }

  /** A deep copy (used by tests and by speculative edit composition). */
  clone(): HeightField {
    return new HeightField({ ...this.region }, Float64Array.from(this.values));
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Everything a field build needs beyond the region. */
export interface FieldBuildInput {
  region: Region;
  params: HeightfieldParams;
  seeds: NoiseSeeds;
}

/**
 * Build the base heightfield: evaluate the noise stack at every integer column,
 * then run `erosionPasses` of thermal erosion over the grid.
 *
 * Erosion runs *before* `terrain.edit@0` kernels are composed, matching the
 * profile's pass order (base stack → raise edits → carve edits): a plateau
 * should not be rounded off by the base terrain's erosion budget.
 */
export function buildBaseField(input: FieldBuildInput): HeightField {
  const { region, params, seeds } = input;
  const field = new HeightField(region);
  const values = field.values;
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      values[j * region.width + i] = evaluateBaseHeight(seeds, params, region.x0 + i, z);
    }
  }
  erode(values, region.width, region.depth, params.erosionPasses);
  return field;
}

/** Convenience: derive noise seeds from a node seed and build the base field. */
export function buildBaseFieldForNode(
  region: Region,
  params: Partial<HeightfieldParams> | undefined,
  node: Seed256,
): { field: HeightField; params: HeightfieldParams; seeds: NoiseSeeds } {
  const resolved = resolveHeightfieldParams(params);
  const seeds = deriveNoiseSeeds(node);
  return { field: buildBaseField({ region, params: resolved, seeds }), params: resolved, seeds };
}

/**
 * The pure pointwise base stack, without erosion or edits. Equal to the grid
 * value at every integer column when `erosionPasses === 0` and no edits are
 * applied — asserted by `test/field.test.ts`.
 */
export function evaluateBase(
  seeds: NoiseSeeds,
  params: NoiseStackParams,
  x: number,
  z: number,
): number {
  return evaluateBaseHeight(seeds, params, x, z);
}

export type { CurvePoint, NoiseSeeds, NoiseStackParams };
