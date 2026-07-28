/**
 * Deterministic 2D noise primitives for the terrain profile.
 *
 * Everything here is a pure function of `(seed, x, z, params)`. Gradients live
 * on an integer lattice and are selected by a pinned 32-bit mix seeded from a
 * BLAKE3 stream seed (see `seed32`), so the whole stack reproduces bit-for-bit
 * across engines: the only floating-point operations involved are `+ - * /` and
 * table lookups whose table is built once from `ctx.math`.
 *
 * Parameterization matches the `terrain.heightfield@0` table of
 * LOAM-SPEC-v0.1 §7.5 exactly.
 */

import { cos, fade, lerp, sin, clamp01, TAU } from "../math/index.js";
import type { Seed256 } from "../determinism/index.js";
import { seed32, streamSeed } from "../determinism/index.js";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

/** Domain-warp parameters. `amount` is in blocks. */
export interface WarpParams {
  amount: number;
  frequency: number;
}

/** Large-scale land/ocean mask parameters. */
export interface ContinentalnessParams {
  frequency: number;
  /** Target fraction of the region that sits below sea level, in `[0, 1)`. */
  seaFraction: number;
}

/** One `[input, output]` control point of the `curve` remap; both in `[0, 1]`. */
export type CurvePoint = readonly [number, number];

/** The noise-stack subset of `terrain.heightfield@0`'s params. */
export interface NoiseStackParams {
  /** World Y of the water surface. */
  seaLevel: number;
  /** Mean land height. */
  baseHeight: number;
  /** Vertical scale of the primary octave stack, in blocks. */
  amplitude: number;
  /** 1..10 */
  octaves: number;
  /** Base frequency, per block. */
  frequency: number;
  lacunarity: number;
  gain: number;
  /** Ridged multifractal instead of fBm — the fjord/mountain switch. */
  ridged: boolean;
  warp: WarpParams;
  /** 0..8 thermal-erosion smoothing passes over the materialized grid. */
  erosionPasses: number;
  /** Piecewise-linear remap of the normalized height. Empty = identity. */
  curve: readonly CurvePoint[];
  /** Large-scale land/ocean mask; omitted means "all land". */
  continentalness?: ContinentalnessParams | undefined;
}

/** Defaults from the §7.5 `terrain.heightfield@0` table. */
export const NOISE_STACK_DEFAULTS: Readonly<NoiseStackParams> = Object.freeze({
  seaLevel: 63,
  baseHeight: 70,
  amplitude: 40,
  octaves: 5,
  frequency: 0.0035,
  lacunarity: 2.0,
  gain: 0.5,
  ridged: false,
  warp: Object.freeze({ amount: 0, frequency: 0.01 }),
  erosionPasses: 0,
  curve: Object.freeze([]) as readonly CurvePoint[],
  continentalness: undefined,
});

/** Fill in defaults for any omitted noise-stack parameter. */
export function resolveNoiseStackParams(
  partial: Partial<NoiseStackParams> | undefined,
): NoiseStackParams {
  const p = partial ?? {};
  const warp = p.warp ?? NOISE_STACK_DEFAULTS.warp;
  const resolved: NoiseStackParams = {
    seaLevel: p.seaLevel ?? NOISE_STACK_DEFAULTS.seaLevel,
    baseHeight: p.baseHeight ?? NOISE_STACK_DEFAULTS.baseHeight,
    amplitude: p.amplitude ?? NOISE_STACK_DEFAULTS.amplitude,
    octaves: clampInt(p.octaves ?? NOISE_STACK_DEFAULTS.octaves, 1, 10),
    frequency: p.frequency ?? NOISE_STACK_DEFAULTS.frequency,
    lacunarity: p.lacunarity ?? NOISE_STACK_DEFAULTS.lacunarity,
    gain: p.gain ?? NOISE_STACK_DEFAULTS.gain,
    ridged: p.ridged ?? NOISE_STACK_DEFAULTS.ridged,
    warp: { amount: warp.amount, frequency: warp.frequency },
    erosionPasses: clampInt(p.erosionPasses ?? NOISE_STACK_DEFAULTS.erosionPasses, 0, 8),
    curve: p.curve ? p.curve.map((c) => [c[0], c[1]] as CurvePoint) : [],
    continentalness: p.continentalness
      ? {
          frequency: p.continentalness.frequency,
          seaFraction: clamp01(p.continentalness.seaFraction),
        }
      : undefined,
  };
  return resolved;
}

function clampInt(v: number, lo: number, hi: number): number {
  const i = Math.floor(v);
  return i < lo ? lo : i > hi ? hi : i;
}

// ---------------------------------------------------------------------------
// Gradient lattice
// ---------------------------------------------------------------------------

const GRADIENT_COUNT = 256;

/**
 * 256 unit gradient directions, built once at module load from `ctx.math`.
 * A power-of-two count lets the lattice hash select one with a mask.
 */
const GRAD_X = new Float64Array(GRADIENT_COUNT);
const GRAD_Z = new Float64Array(GRADIENT_COUNT);
for (let i = 0; i < GRADIENT_COUNT; i++) {
  const a = (TAU * i) / GRADIENT_COUNT;
  GRAD_X[i] = cos(a);
  GRAD_Z[i] = sin(a);
}

/**
 * Pinned 32-bit lattice hash. Uses only `Math.imul`, XOR and unsigned shifts,
 * all of which are exactly specified by ECMAScript.
 */
function latticeHash(seed: number, ix: number, iz: number): number {
  let h = (seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Normalization factor bringing 2D gradient noise from ≈±1/√2 to ≈±1. */
const GRADIENT_NORM = 1.4142135623730951;

/**
 * 2D gradient (Perlin-style) noise on the integer lattice, with quintic fade
 * interpolation. Output is approximately `[-1, 1]`.
 */
export function gradientNoise2(seed: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const g00 = latticeHash(seed, ix, iz) & (GRADIENT_COUNT - 1);
  const g10 = latticeHash(seed, ix + 1, iz) & (GRADIENT_COUNT - 1);
  const g01 = latticeHash(seed, ix, iz + 1) & (GRADIENT_COUNT - 1);
  const g11 = latticeHash(seed, ix + 1, iz + 1) & (GRADIENT_COUNT - 1);

  const d00 = (GRAD_X[g00] as number) * fx + (GRAD_Z[g00] as number) * fz;
  const d10 = (GRAD_X[g10] as number) * (fx - 1) + (GRAD_Z[g10] as number) * fz;
  const d01 = (GRAD_X[g01] as number) * fx + (GRAD_Z[g01] as number) * (fz - 1);
  const d11 = (GRAD_X[g11] as number) * (fx - 1) + (GRAD_Z[g11] as number) * (fz - 1);

  const u = fade(fx);
  const v = fade(fz);
  return lerp(lerp(d00, d10, u), lerp(d01, d11, u), v) * GRADIENT_NORM;
}

// ---------------------------------------------------------------------------
// Octave stacks
// ---------------------------------------------------------------------------

/** Shared octave-stack settings. */
export interface OctaveParams {
  octaves: number;
  frequency: number;
  lacunarity: number;
  gain: number;
}

/**
 * Fractional Brownian motion: `octaves` summed gradient octaves, amplitude
 * multiplied by `gain` and frequency by `lacunarity` each step, normalized by
 * the total amplitude so the result stays in ≈`[-1, 1]`.
 */
export function fbm2(seed: number, x: number, z: number, p: OctaveParams): number {
  let amp = 1;
  let freq = p.frequency;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < p.octaves; o++) {
    // Each octave uses a distinct lattice offset so octaves never align.
    sum += amp * gradientNoise2(seed + o * 0x9e3779b1, x * freq, z * freq);
    norm += amp;
    amp *= p.gain;
    freq *= p.lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Ridged multifractal: each octave becomes `(1 - |n|)²`, weighted by the
 * previous octave's signal so ridges reinforce. Returned in ≈`[-1, 1]`, with
 * +1 at the ridge crest — the fjord/mountain shape.
 */
export function ridged2(seed: number, x: number, z: number, p: OctaveParams): number {
  let amp = 1;
  let freq = p.frequency;
  let sum = 0;
  let norm = 0;
  let weight = 1;
  for (let o = 0; o < p.octaves; o++) {
    const n = gradientNoise2(seed + o * 0x9e3779b1, x * freq, z * freq);
    let signal = 1 - (n < 0 ? -n : n);
    signal = signal * signal;
    signal = signal * weight;
    weight = clamp01(signal * 2);
    sum += amp * signal;
    norm += amp;
    amp *= p.gain;
    freq *= p.lacunarity;
  }
  const unit = norm > 0 ? sum / norm : 0;
  return unit * 2 - 1;
}

/**
 * Domain warp: displace the sample point by a vector read from two independent
 * noise channels. `amount` is in blocks; `amount === 0` is a no-op.
 */
export function domainWarp(
  seedX: number,
  seedZ: number,
  x: number,
  z: number,
  warp: WarpParams,
): { x: number; z: number } {
  if (warp.amount === 0) return { x, z };
  const f = warp.frequency;
  const dx = gradientNoise2(seedX, x * f, z * f);
  const dz = gradientNoise2(seedZ, x * f, z * f);
  return { x: x + dx * warp.amount, z: z + dz * warp.amount };
}

// ---------------------------------------------------------------------------
// Curve remap
// ---------------------------------------------------------------------------

/**
 * Piecewise-linear remap of a normalized value, per the `curve` param.
 *
 * Control points are sorted by input (stable, by UTF-8-free numeric compare);
 * the value is clamped to the endpoints outside the control range. An empty
 * curve is the identity.
 */
export function applyCurve(points: readonly CurvePoint[], t: number): number {
  if (points.length === 0) return t;
  const sorted = points.slice().sort((a, b) => a[0] - b[0]);
  const first = sorted[0] as CurvePoint;
  if (t <= first[0]) return first[1];
  const last = sorted[sorted.length - 1] as CurvePoint;
  if (t >= last[0]) return last[1];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as CurvePoint;
    const b = sorted[i] as CurvePoint;
    if (t <= b[0]) {
      const span = b[0] - a[0];
      const u = span === 0 ? 0 : (t - a[0]) / span;
      return lerp(a[1], b[1], u);
    }
  }
  return last[1];
}

// ---------------------------------------------------------------------------
// Named noise channels
// ---------------------------------------------------------------------------

/** The independent noise channels the heightfield stack draws from. */
export interface NoiseSeeds {
  /** Primary octave stack. */
  base: number;
  /** Domain-warp X displacement. */
  warpX: number;
  /** Domain-warp Z displacement. */
  warpZ: number;
  /** Continentalness mask. */
  continentalness: number;
}

/**
 * Derive the four lattice seeds from a node seed. Each channel gets its own
 * BLAKE3 stream (`noise`, `noise.warp.x`, …) so changing one subsystem never
 * shifts another (§6.3).
 */
export function deriveNoiseSeeds(node: Seed256): NoiseSeeds {
  return {
    base: seed32(streamSeed(node, "noise")),
    warpX: seed32(streamSeed(node, "noise.warp.x")),
    warpZ: seed32(streamSeed(node, "noise.warp.z")),
    continentalness: seed32(streamSeed(node, "noise.continentalness")),
  };
}

// ---------------------------------------------------------------------------
// The heightfield stack, evaluated pointwise
// ---------------------------------------------------------------------------

/** Ocean-floor depth below sea level at full ocean, as a fraction of amplitude. */
const OCEAN_FLOOR_FRACTION = 0.75;
/** Width of the continental shelf transition band, in mask units. */
const CONTINENTAL_BAND = 0.25;

/**
 * Evaluate the base terrain stack at one column, in world Y units, **before**
 * any edits or erosion.
 *
 * Order of operations (normative for the profile):
 * 1. domain warp the sample point;
 * 2. fBm or ridged multifractal → `n ∈ [-1, 1]`;
 * 3. normalize to `[0, 1]` and apply `curve`;
 * 4. land height = `baseHeight + (shaped·2 - 1)·amplitude`;
 * 5. if `continentalness` is present, blend between an ocean-floor profile and
 *    the land height across a `CONTINENTAL_BAND`-wide transition centred on
 *    `seaFraction`.
 */
export function evaluateBaseHeight(
  seeds: NoiseSeeds,
  params: NoiseStackParams,
  x: number,
  z: number,
): number {
  const w = domainWarp(seeds.warpX, seeds.warpZ, x, z, params.warp);
  const octaves: OctaveParams = {
    octaves: params.octaves,
    frequency: params.frequency,
    lacunarity: params.lacunarity,
    gain: params.gain,
  };
  const n = params.ridged
    ? ridged2(seeds.base, w.x, w.z, octaves)
    : fbm2(seeds.base, w.x, w.z, octaves);
  const shaped = applyCurve(params.curve, clamp01((n + 1) * 0.5));
  const land = params.baseHeight + (shaped * 2 - 1) * params.amplitude;

  const cont = params.continentalness;
  if (!cont) return land;

  const c = clamp01((gradientNoise2(seeds.continentalness, x * cont.frequency, z * cont.frequency) + 1) * 0.5);
  const t = cont.seaFraction;
  // s = 0 → pure ocean, s = 1 → pure land, smooth across the shelf band.
  const s = smooth(clamp01((c - t) / CONTINENTAL_BAND + 0.5));
  const depthFraction = t <= 0 ? 0 : clamp01((t - c) / t);
  const oceanFloor = params.seaLevel - 2 - depthFraction * params.amplitude * OCEAN_FLOOR_FRACTION;
  return lerp(oceanFloor, land, s);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** The continentalness mask value at a column, in `[0, 1]` (1 = fully inland). */
export function continentalnessAt(
  seeds: NoiseSeeds,
  cont: ContinentalnessParams,
  x: number,
  z: number,
): number {
  const c = clamp01((gradientNoise2(seeds.continentalness, x * cont.frequency, z * cont.frequency) + 1) * 0.5);
  return smooth(clamp01((c - cont.seaFraction) / CONTINENTAL_BAND + 0.5));
}

// ---------------------------------------------------------------------------
// Thermal erosion
// ---------------------------------------------------------------------------

/** Height difference (blocks) above which material starts to slide. */
export const EROSION_TALUS = 1.0;
/** Fraction of the excess moved per pass. */
export const EROSION_RATE = 0.5;

/**
 * Cheap thermal erosion over a materialized grid, in place.
 *
 * Each pass reads a frozen snapshot and writes accumulated deltas, so the
 * result is independent of traversal order (§6.5 rule 5). Material slides from
 * a cell to its 4-neighbours whenever the drop exceeds `EROSION_TALUS`,
 * proportionally to each neighbour's share of the total excess.
 */
export function erode(
  values: Float64Array,
  width: number,
  depth: number,
  passes: number,
  talus = EROSION_TALUS,
  rate = EROSION_RATE,
): void {
  if (passes <= 0 || width < 2 || depth < 2) return;
  const src = new Float64Array(values.length);
  const delta = new Float64Array(values.length);
  for (let pass = 0; pass < passes; pass++) {
    src.set(values);
    delta.fill(0);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        const idx = j * width + i;
        const h = src[idx] as number;
        let total = 0;
        let d0 = 0;
        let d1 = 0;
        let d2 = 0;
        let d3 = 0;
        if (i > 0) {
          const dh = h - (src[idx - 1] as number);
          if (dh > talus) {
            d0 = dh - talus;
            total += d0;
          }
        }
        if (i < width - 1) {
          const dh = h - (src[idx + 1] as number);
          if (dh > talus) {
            d1 = dh - talus;
            total += d1;
          }
        }
        if (j > 0) {
          const dh = h - (src[idx - width] as number);
          if (dh > talus) {
            d2 = dh - talus;
            total += d2;
          }
        }
        if (j < depth - 1) {
          const dh = h - (src[idx + width] as number);
          if (dh > talus) {
            d3 = dh - talus;
            total += d3;
          }
        }
        if (total <= 0) continue;
        // Move at most `rate` of the largest single excess, split by share.
        let maxExcess = d0;
        if (d1 > maxExcess) maxExcess = d1;
        if (d2 > maxExcess) maxExcess = d2;
        if (d3 > maxExcess) maxExcess = d3;
        const moved = rate * maxExcess;
        delta[idx] = (delta[idx] as number) - moved;
        if (d0 > 0) delta[idx - 1] = (delta[idx - 1] as number) + (moved * d0) / total;
        if (d1 > 0) delta[idx + 1] = (delta[idx + 1] as number) + (moved * d1) / total;
        if (d2 > 0) delta[idx - width] = (delta[idx - width] as number) + (moved * d2) / total;
        if (d3 > 0) delta[idx + width] = (delta[idx + width] as number) + (moved * d3) / total;
      }
    }
    for (let k = 0; k < values.length; k++) {
      values[k] = (values[k] as number) + (delta[k] as number);
    }
  }
}
