/**
 * `terrain.edit@0` — the eight terrain verbs of the Loam terrain profile.
 *
 * An edit contributes a kernel to the master heightfield **before**
 * materialization. Composition is in two deterministic groups: all *raise*
 * verbs in document order, then all *carve* verbs in document order. `strength`
 * (0..1, default 1) scales any kernel.
 *
 * Placement is coarse and fractional — `at`, `zone`, or `course` — and is
 * resolved here into world blocks. The model gives intent; the compiler does
 * the geometry (Catmull-Rom course refinement, zone jitter, falloff profiles).
 */

import { Rng, nodeSeed, seed32, streamSeed, type Seed256 } from "../determinism/index.js";
import { TAU, atan2, clamp, clamp01, lerp, sin, smoothstep01, sqrt } from "../math/index.js";
import { gradientNoise2 } from "../noise/index.js";
import type { HeightField, Region } from "../field/index.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The nine-grid zone tokens of the root region. North is −Z, east is +X. */
export type Zone =
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "northeast"
  | "northwest"
  | "southeast"
  | "southwest";

/** The eight terrain verbs. */
export type EditVerb =
  | "ridge"
  | "peak"
  | "volcano"
  | "plateau"
  | "island"
  | "valley"
  | "river"
  | "basin";

/** Falloff shape: `sharp` is a linear cone, `rounded` is a Hermite dome. */
export type FalloffProfile = "sharp" | "rounded";

/** Verbs that raise the field. Applied first, in document order. */
export const RAISE_VERBS: readonly EditVerb[] = Object.freeze([
  "ridge",
  "peak",
  "volcano",
  "plateau",
  "island",
]);

/** Verbs that carve the field. Applied after all raises, in document order. */
export const CARVE_VERBS: readonly EditVerb[] = Object.freeze(["valley", "river", "basin"]);

/** Which composition group a verb belongs to. */
export function editGroup(verb: EditVerb): "raise" | "carve" {
  return RAISE_VERBS.includes(verb) ? "raise" : "carve";
}

/** A fractional `[fx, fz] ∈ [0,1]²` coordinate of the root region. */
export type Fractional = readonly [number, number];

/** A `terrain.edit@0` node, flattened to id + verb + params. */
export interface TerrainEdit {
  /** The edit node's `id`; names the feature and keys its markers. */
  id: string;
  verb: EditVerb;
  /** 0..1, default 1 — scales the whole kernel. */
  strength?: number;

  // placement (exactly one required, matching the verb's placement mode)
  at?: Fractional;
  zone?: Zone;
  course?: readonly Fractional[];

  // shape params (defaults per verb, see EDIT_DEFAULTS)
  width?: number;
  height?: number;
  radius?: number;
  depth?: number;
  profile?: FalloffProfile;
  rim?: number;
  caldera?: boolean;
  calderaDepth?: number;
  lava?: boolean;
  water?: boolean;

  /**
   * 0..0.5 — how far the effective radius of a radial verb wanders away from a
   * perfect circle. `0` reproduces the exact circular kernel of G2a.
   * Applies to `peak`, `volcano`, `island`, `plateau`, `basin`.
   */
  irregularity?: number;
  /**
   * 0..1 — lateral meander of a corridor verb's centreline, as a multiple of
   * `1.5 × width`. `0` keeps the plain refined spline.
   * Applies to `ridge`, `valley`, `river`.
   */
  meander?: number;
  /**
   * Whether a carved channel may take on ocean water.
   * `"auto"` (default) floods only the parts that are hydraulically connected
   * to the map edge; `"never"` keeps the carve dry wherever it can be kept dry
   * without leaving a fluid face exposed to air.
   * Applies to `valley`, `river`, `basin`.
   */
  flooded?: FloodedMode;
}

/** `flooded` param values. */
export type FloodedMode = "auto" | "never";

/** Per-verb defaults, exactly as tabulated in the terrain profile. */
export const EDIT_DEFAULTS: Readonly<Record<EditVerb, Readonly<Partial<TerrainEdit>>>> =
  Object.freeze({
    ridge: Object.freeze({ width: 48, height: 50, profile: "rounded" as FalloffProfile }),
    peak: Object.freeze({ radius: 56, height: 70, profile: "sharp" as FalloffProfile }),
    volcano: Object.freeze({
      radius: 64,
      height: 80,
      caldera: true,
      calderaDepth: 12,
      lava: true,
      profile: "sharp" as FalloffProfile,
    }),
    plateau: Object.freeze({ radius: 64, height: 25, rim: 8 }),
    island: Object.freeze({ radius: 48, height: 30, profile: "rounded" as FalloffProfile }),
    valley: Object.freeze({ width: 40, depth: 30, profile: "rounded" as FalloffProfile }),
    river: Object.freeze({ width: 10, depth: 6, profile: "rounded" as FalloffProfile }),
    basin: Object.freeze({ radius: 56, depth: 20, water: false, profile: "rounded" as FalloffProfile }),
  });

/** Read a numeric param with its per-verb default. */
function num(edit: TerrainEdit, key: keyof TerrainEdit, verb: EditVerb): number {
  const v = edit[key] as number | undefined;
  if (v !== undefined) return v;
  const d = EDIT_DEFAULTS[verb][key] as number | undefined;
  if (d === undefined) throw new Error(`terrain.edit@0 ${verb}: missing param '${String(key)}'`);
  return d;
}

function flag(edit: TerrainEdit, key: keyof TerrainEdit, verb: EditVerb): boolean {
  const v = edit[key] as boolean | undefined;
  return v ?? ((EDIT_DEFAULTS[verb][key] as boolean | undefined) ?? false);
}

function falloffOf(edit: TerrainEdit, verb: EditVerb): FalloffProfile {
  return edit.profile ?? ((EDIT_DEFAULTS[verb].profile as FalloffProfile | undefined) ?? "rounded");
}

// ---------------------------------------------------------------------------
// Falloff profiles
// ---------------------------------------------------------------------------

/**
 * Falloff as a function of `u = 1 - d/reach ∈ [0, 1]` (1 at the centre/axis,
 * 0 at the outer edge).
 *
 * - `sharp`: linear — a cone with a distinct apex or crest.
 * - `rounded`: Hermite smoothstep — a dome with a flat top and a flat foot.
 */
export function falloff(profile: FalloffProfile, u: number): number {
  const t = clamp01(u);
  return profile === "sharp" ? t : smoothstep01(t);
}

// ---------------------------------------------------------------------------
// Organic shaping
// ---------------------------------------------------------------------------

/** Default `irregularity` for radial verbs. */
export const IRREGULARITY_DEFAULT = 0.18;
/** Hard ceiling on `irregularity`; beyond this the lobes self-intersect. */
export const IRREGULARITY_MAX = 0.5;
/** Default `meander` for corridor verbs. */
export const MEANDER_DEFAULT = 0.5;
/** Default `flooded` mode for carve verbs. */
export const FLOODED_DEFAULT: FloodedMode = "auto";

/** Harmonic orders used by the angular radius modulation. */
const SHAPE_HARMONICS: readonly number[] = Object.freeze([2, 3, 4, 5]);
/** Warp amplitude as a fraction of `irregularity · radius`. */
const SHAPE_WARP_AMPLITUDE = 0.6;
/** Warp wavelength as a multiple of the radius (low frequency ⇒ lumps, not fuzz). */
const SHAPE_WARP_WAVELENGTH = 1.7;

/**
 * A radial verb's modulated extent.
 *
 * `radiusAt(θ)` is `radius · (1 + Σ_{k=2..5} a_k·sin(kθ + φ_k))` and
 * `distanceAt` is the Euclidean distance warped by a low-frequency 2D noise
 * field, so the boundary is both wavy (harmonics) and lumpy (warp). Both the
 * harmonic coefficients and the warp lattice are drawn from the edit's `shape`
 * stream, so every feature has its own silhouette and every rebuild reproduces
 * it exactly.
 */
export interface RadialShape {
  /** The nominal (unmodulated) radius. */
  readonly radius: number;
  /** Upper bound on the modulated extent — what the scan bounds must cover. */
  readonly maxRadius: number;
  /** Effective radius in the direction of the offset `(dx, dz)`. */
  radiusAt(dx: number, dz: number): number;
  /** Warped distance from the centre for the offset `(dx, dz)`. */
  distanceAt(dx: number, dz: number): number;
}

/** A perfectly circular shape — the `irregularity: 0` case, kept exact. */
function circularShape(radius: number): RadialShape {
  return {
    radius,
    maxRadius: radius,
    radiusAt: () => radius,
    distanceAt: (dx, dz) => sqrt(dx * dx + dz * dz),
  };
}

/**
 * Build the modulated extent for one radial edit.
 *
 * `irregularity` is the *total* harmonic amplitude: the four coefficients are
 * drawn positive, normalized to sum to `irregularity`, and given independent
 * phases. That keeps `radiusAt` inside `radius · [1 − irr, 1 + irr]` regardless
 * of how the draw came out, which is what makes the bound on `maxRadius` sound.
 */
export function makeRadialShape(
  seed: Seed256,
  radius: number,
  irregularity: number,
): RadialShape {
  const irr = clamp(irregularity, 0, IRREGULARITY_MAX);
  if (irr <= 0 || radius <= 0) return circularShape(radius);

  const rng = Rng.forStream(seed, "shape");
  const raw: number[] = [];
  let total = 0;
  for (let k = 0; k < SHAPE_HARMONICS.length; k++) {
    // A floor keeps any single harmonic from taking the whole budget.
    const w = 0.35 + rng.float();
    raw.push(w);
    total += w;
  }
  const amps = raw.map((w) => (irr * w) / total);
  const phases = SHAPE_HARMONICS.map(() => rng.float() * TAU);

  const warpSeed = seed32(streamSeed(seed, "shape.warp"));
  const warpAmp = irr * radius * SHAPE_WARP_AMPLITUDE;
  const warpFreq = SHAPE_WARP_WAVELENGTH / radius;

  return {
    radius,
    maxRadius: radius * (1 + irr) + warpAmp,
    radiusAt(dx: number, dz: number): number {
      const theta = atan2(dz, dx);
      let m = 0;
      for (let k = 0; k < SHAPE_HARMONICS.length; k++) {
        m += (amps[k] as number) * sin((SHAPE_HARMONICS[k] as number) * theta + (phases[k] as number));
      }
      return radius * (1 + m);
    },
    distanceAt(dx: number, dz: number): number {
      const d = sqrt(dx * dx + dz * dz);
      const w = gradientNoise2(warpSeed, dx * warpFreq, dz * warpFreq);
      const warped = d + w * warpAmp;
      return warped > 0 ? warped : 0;
    },
  };
}

/** Read the `irregularity` param, defaulting per the profile. */
export function irregularityOf(edit: TerrainEdit): number {
  return clamp(edit.irregularity ?? IRREGULARITY_DEFAULT, 0, IRREGULARITY_MAX);
}

/** Read the `meander` param, defaulting per the profile. */
export function meanderOf(edit: TerrainEdit): number {
  return clamp(edit.meander ?? MEANDER_DEFAULT, 0, 1);
}

/** Read the `flooded` param, defaulting per the profile. */
export function floodedOf(edit: TerrainEdit): FloodedMode {
  return edit.flooded ?? FLOODED_DEFAULT;
}

// ---------------------------------------------------------------------------
// Placement resolution
// ---------------------------------------------------------------------------

/** Fractional centre of each zone in the nine-grid. North is −Z. */
export const ZONE_FRACTIONS: Readonly<Record<Zone, Fractional>> = Object.freeze({
  northwest: [1 / 6, 1 / 6],
  north: [1 / 2, 1 / 6],
  northeast: [5 / 6, 1 / 6],
  west: [1 / 6, 1 / 2],
  center: [1 / 2, 1 / 2],
  east: [5 / 6, 1 / 2],
  southwest: [1 / 6, 5 / 6],
  south: [1 / 2, 5 / 6],
  southeast: [5 / 6, 5 / 6],
});

/** Zone jitter magnitude, as a fraction of the region size (profile: ±10%). */
export const ZONE_JITTER_FRACTION = 0.1;

/** A resolved world-block point. */
export interface Point2 {
  x: number;
  z: number;
}

function toWorld(region: Region, f: Fractional): Point2 {
  return { x: region.x0 + f[0] * region.width, z: region.z0 + f[1] * region.depth };
}

/**
 * Resolve a radial verb's centre.
 *
 * `at` is used verbatim; `zone` resolves to the zone's centre plus a
 * deterministic jitter of ±10% of the region size, drawn from the edit node's
 * `jitter` stream.
 */
export function resolveCenter(edit: TerrainEdit, region: Region, editSeed: Seed256): Point2 {
  if (edit.at) return toWorld(region, edit.at);
  if (edit.zone) {
    const base = toWorld(region, ZONE_FRACTIONS[edit.zone]);
    const rng = Rng.forStream(editSeed, "jitter");
    const dx = (rng.float() * 2 - 1) * ZONE_JITTER_FRACTION * region.width;
    const dz = (rng.float() * 2 - 1) * ZONE_JITTER_FRACTION * region.depth;
    return { x: base.x + dx, z: base.z + dz };
  }
  throw new Error(`terrain.edit@0 '${edit.id}': ${edit.verb} needs 'at' or 'zone'`);
}

// ---------------------------------------------------------------------------
// Course refinement
// ---------------------------------------------------------------------------

/** Samples per unit length of the coarse polyline used when refining a course. */
const COURSE_SAMPLE_SPACING = 1.0;

/**
 * Refine 2–8 coarse waypoints into a smooth polyline via a centripetal-free
 * uniform Catmull-Rom spline, with the endpoints duplicated so the curve passes
 * through the first and last waypoints. Sample spacing is ≈1 block, which is
 * finer than any kernel's falloff needs and keeps the distance field smooth.
 */
export function refineCourse(region: Region, waypoints: readonly Fractional[]): Point2[] {
  if (waypoints.length < 2) {
    throw new Error("terrain.edit@0: 'course' needs 2–8 waypoints");
  }
  const pts = waypoints.map((w) => toWorld(region, w));
  const ext: Point2[] = [pts[0] as Point2, ...pts, pts[pts.length - 1] as Point2];
  const out: Point2[] = [];
  for (let i = 1; i + 2 < ext.length; i++) {
    const p0 = ext[i - 1] as Point2;
    const p1 = ext[i] as Point2;
    const p2 = ext[i + 1] as Point2;
    const p3 = ext[i + 2] as Point2;
    const segLen = sqrt((p2.x - p1.x) * (p2.x - p1.x) + (p2.z - p1.z) * (p2.z - p1.z));
    const steps = Math.max(2, Math.ceil(segLen / COURSE_SAMPLE_SPACING));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  out.push(pts[pts.length - 1] as Point2);
  return out;
}

function catmullRom(p0: Point2, p1: Point2, p2: Point2, p3: Point2, t: number): Point2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const c0 = -0.5 * t3 + t2 - 0.5 * t;
  const c1 = 1.5 * t3 - 2.5 * t2 + 1;
  const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
  const c3 = 0.5 * t3 - 0.5 * t2;
  return {
    x: p0.x * c0 + p1.x * c1 + p2.x * c2 + p3.x * c3,
    z: p0.z * c0 + p1.z * c1 + p2.z * c2 + p3.z * c3,
  };
}

// ---------------------------------------------------------------------------
// Corridor shaping
// ---------------------------------------------------------------------------

/** Meander amplitude as a multiple of `meander × width`. */
const MEANDER_AMPLITUDE = 1.5;
/** Meander wavelength as a multiple of the corridor width. */
const MEANDER_WAVELENGTH = 8;
/** Width-variation wavelength as a multiple of the corridor width. */
const WIDTH_WAVELENGTH = 4;
/** Peak width variation, as a fraction of the nominal width. */
const WIDTH_VARIATION = 0.3;
/** Endpoint taper length, as a multiple of the corridor width. */
const TAPER_WIDTHS = 1.5;

/** One 1D noise channel, sampled along a corridor's arclength. */
function arclengthNoise(seed: number, s: number): number {
  return gradientNoise2(seed, s, 0.5);
}

/**
 * A corridor verb's realized geometry: a laterally meandered centreline, a
 * per-sample half-width, and a per-sample endpoint taper.
 *
 * The taper is what stops a carve from ending in a blunt vertical wall — the
 * kernel amplitude rolls off across the last `1.5 × width` of arclength at both
 * ends. The same roll-off is applied to the meander displacement, so the curve
 * still passes through the author's first and last waypoints.
 */
export interface CorridorShape {
  /** The displaced centreline, one entry per refined sample. */
  readonly samples: Point2[];
  /** Half-width at each sample, in blocks. */
  readonly halfWidths: Float64Array;
  /** Kernel amplitude scale at each sample, in `[0, 1]`. */
  readonly taper: Float64Array;
  /** Largest half-width, for scan bounds. */
  readonly maxHalfWidth: number;
}

/**
 * Displace and modulate a refined course.
 *
 * Everything is keyed off arclength `s`, so the shape is independent of how
 * densely the spline happened to be sampled. Both noise channels come from the
 * edit's `shape` stream.
 *
 * `meander: 0` switches the whole organic layer off — no displacement, no width
 * variation, no taper — reproducing the plain uniform ribbon of G2a. It is the
 * corridor counterpart of `irregularity: 0`.
 */
export function makeCorridorShape(
  base: readonly Point2[],
  seed: Seed256,
  width: number,
  meander: number,
): CorridorShape {
  const n = base.length;
  const halfWidths = new Float64Array(n);
  const taper = new Float64Array(n);
  const samples: Point2[] = new Array(n);

  if (clamp(meander, 0, 1) === 0) {
    const half = width / 2;
    halfWidths.fill(half);
    taper.fill(1);
    for (let i = 0; i < n; i++) {
      const p = base[i] as Point2;
      samples[i] = { x: p.x, z: p.z };
    }
    return { samples, halfWidths, taper, maxHalfWidth: half };
  }

  // Cumulative arclength.
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a = base[i - 1] as Point2;
    const b = base[i] as Point2;
    s[i] = (s[i - 1] as number) + sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
  }
  const length = s[n - 1] as number;

  const meanderSeed = seed32(streamSeed(seed, "shape.meander"));
  const widthSeed = seed32(streamSeed(seed, "shape.width"));
  const amp = clamp(meander, 0, 1) * width * MEANDER_AMPLITUDE;
  const meanderScale = 1 / (MEANDER_WAVELENGTH * width);
  const widthScale = 1 / (WIDTH_WAVELENGTH * width);
  const taperLength = TAPER_WIDTHS * width;

  let maxHalfWidth = 0;
  for (let i = 0; i < n; i++) {
    const si = s[i] as number;
    const endDistance = Math.min(si, length - si);
    const t = taperLength > 0 ? smoothstep01(clamp01(endDistance / taperLength)) : 1;
    taper[i] = t;

    const hw = (width / 2) * (1 + WIDTH_VARIATION * arclengthNoise(widthSeed, si * widthScale));
    halfWidths[i] = hw > 0.5 ? hw : 0.5;
    if ((halfWidths[i] as number) > maxHalfWidth) maxHalfWidth = halfWidths[i] as number;

    const p = base[i] as Point2;
    if (amp === 0) {
      samples[i] = { x: p.x, z: p.z };
      continue;
    }
    // Unit tangent from a central difference, then its left normal.
    const prev = base[i > 0 ? i - 1 : 0] as Point2;
    const next = base[i < n - 1 ? i + 1 : n - 1] as Point2;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tl = sqrt(tx * tx + tz * tz);
    if (tl === 0) {
      samples[i] = { x: p.x, z: p.z };
      continue;
    }
    const nx = -tz / tl;
    const nz = tx / tl;
    const d = amp * t * arclengthNoise(meanderSeed, si * meanderScale);
    samples[i] = { x: p.x + nx * d, z: p.z + nz * d };
  }

  return { samples, halfWidths, taper, maxHalfWidth };
}

/**
 * Monotonic-descent adjustment for `river` courses.
 *
 * The refined course is sampled against the current field; whichever end sits
 * lower becomes the **mouth**. Elevations are then swept from the head toward
 * the mouth and clamped to be non-increasing, so a river never climbs. The
 * result is the course's descent profile, used for the `head`/`mouth` markers
 * and to cap the carve bed.
 */
export function monotonicDescent(
  samples: readonly Point2[],
  field: HeightField,
): { elevations: number[]; reversed: boolean } {
  const raw = samples.map((p) => field.heightAt(p.x, p.z));
  const first = raw[0] as number;
  const last = raw[raw.length - 1] as number;
  const reversed = last > first;
  const ordered = reversed ? raw.slice().reverse() : raw.slice();
  let running = ordered[0] as number;
  for (let i = 0; i < ordered.length; i++) {
    const v = ordered[i] as number;
    if (v < running) running = v;
    ordered[i] = running;
  }
  return { elevations: reversed ? ordered.reverse() : ordered, reversed };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Squared distance from `(x, z)` to a segment. */
function segmentDistanceSq(x: number, z: number, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  let t = 0;
  if (lenSq > 0) t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / lenSq);
  const px = a.x + dx * t - x;
  const pz = a.z + dz * t - z;
  return px * px + pz * pz;
}

/** Distance from `(x, z)` to the polyline, and the index of the nearest sample. */
export function polylineDistance(
  x: number,
  z: number,
  samples: readonly Point2[],
): { distance: number; index: number } {
  let best = Number.POSITIVE_INFINITY;
  let bestIndex = 0;
  for (let i = 0; i + 1 < samples.length; i++) {
    const d = segmentDistanceSq(x, z, samples[i] as Point2, samples[i + 1] as Point2);
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  return { distance: sqrt(best), index: bestIndex };
}

interface Bounds {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

/** Grid index bounds covering a world-space box, clipped to the region. */
function boundsFor(region: Region, minX: number, maxX: number, minZ: number, maxZ: number): Bounds {
  return {
    i0: Math.max(0, Math.floor(minX - region.x0)),
    i1: Math.min(region.width - 1, Math.ceil(maxX - region.x0)),
    j0: Math.max(0, Math.floor(minZ - region.z0)),
    j1: Math.min(region.depth - 1, Math.ceil(maxZ - region.z0)),
  };
}

function courseBounds(region: Region, samples: readonly Point2[], pad: number): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const p of samples) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return boundsFor(region, minX - pad, maxX + pad, minZ - pad, maxZ + pad);
}

// ---------------------------------------------------------------------------
// Markers and results
// ---------------------------------------------------------------------------

/** A named point of interest exposed by an edit (or by the heightfield pass). */
export interface Marker {
  /** `"<editId>.<name>"` for edit markers, or a bare name for field markers. */
  id: string;
  name: string;
  x: number;
  z: number;
  /** Field height at the marker, after composition. */
  y: number;
}

/** A caldera interior, so the materializer can place lava settle-safely. */
export interface CalderaMask {
  /** The owning edit's id. */
  editId: string;
  centerX: number;
  centerZ: number;
  /** Radius of the caldera bowl, in blocks. */
  radius: number;
  /** Lowest rim height around the bowl — lava must stay strictly below this. */
  rimY: number;
  /** Recommended lava surface level: `floor(rimY) - 2`. */
  lavaY: number;
  /** Whether the edit asked for lava at all. */
  lava: boolean;
  /** Grid indices of the columns strictly inside the rim. */
  columns: Int32Array;
}

/** A basin that requested water fill. */
export interface BasinWater {
  editId: string;
  centerX: number;
  centerZ: number;
  radius: number;
  /** Water surface level (`rim - 1`), or `null` when the rim is not closed. */
  waterY: number | null;
  columns: Int32Array;
}

/**
 * The set of columns one edit actually touched, as a bitset over the region
 * grid (one bit per column — 32 KB for a 512² region).
 *
 * This generalizes the caldera mask: every verb records where it landed, at its
 * *modulated* extent rather than its nominal circle, so downstream passes
 * (materials, classification, decoration) can ask "is this column inside the
 * volcano?" without re-deriving the geometry.
 */
export interface FeatureFootprint {
  readonly editId: string;
  readonly verb: EditVerb;
  /** Row-major bitset over the region grid, LSB first. */
  readonly bits: Uint8Array;
  /** Number of set bits. */
  readonly count: number;
}

/** Test a footprint bit by grid index. */
export function footprintHas(fp: FeatureFootprint, idx: number): boolean {
  return ((fp.bits[idx >> 3] as number) & (1 << (idx & 7))) !== 0;
}

/** Accumulates the columns an edit touched, then freezes them into a bitset. */
class FootprintBuilder {
  private readonly bits: Uint8Array;
  private count = 0;

  constructor(private readonly editId: string, private readonly verb: EditVerb, columns: number) {
    this.bits = new Uint8Array((columns + 7) >> 3);
  }

  add(idx: number): void {
    const byte = idx >> 3;
    const bit = 1 << (idx & 7);
    if (((this.bits[byte] as number) & bit) !== 0) return;
    this.bits[byte] = (this.bits[byte] as number) | bit;
    this.count++;
  }

  finish(): FeatureFootprint {
    return { editId: this.editId, verb: this.verb, bits: this.bits, count: this.count };
  }
}

/** A non-fatal note produced while composing edits. */
export interface EditDiagnostic {
  code: string;
  editId: string;
  message: string;
}

/** The outcome of composing every edit into the field. */
export interface EditComposition {
  /** Markers keyed by `"<editId>.<name>"`, in application order. */
  markers: Marker[];
  calderas: CalderaMask[];
  basins: BasinWater[];
  diagnostics: EditDiagnostic[];
  /** Application order actually used (raise group, then carve group). */
  order: string[];
  /** One footprint per applied edit, in application order. */
  footprints: FeatureFootprint[];
  /**
   * Columns claimed by a carve with `flooded: "never"` — the hydrology pass
   * must not hand these ocean water unless leaving them dry would expose a
   * fluid face to air.
   */
  noFlood: Uint8Array;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** What `applyEdits` needs in order to seed and place each edit. */
export interface EditContext {
  region: Region;
  /** Resolved 64-bit world seed. */
  worldSeed: bigint;
  /** `nodePath` of the heightfield node the edits hang off. */
  parentPath: string;
  /** Sea level, needed by `river` (carves to a water surface at sea level). */
  seaLevel: number;
}

/**
 * Compose every edit into `field`, mutating it in place.
 *
 * Order is normative: **all raise verbs in document order, then all carve verbs
 * in document order**. This makes composition independent of how the author
 * interleaved the nodes, so a river always cuts the mountain that a later-listed
 * `ridge` raised.
 */
export function applyEdits(
  field: HeightField,
  edits: readonly TerrainEdit[],
  ctx: EditContext,
): EditComposition {
  const n = ctx.region.width * ctx.region.depth;
  const result: EditComposition = {
    markers: [],
    calderas: [],
    basins: [],
    diagnostics: [],
    order: [],
    footprints: [],
    noFlood: new Uint8Array(n),
  };
  const raises = edits.filter((e) => editGroup(e.verb) === "raise");
  const carves = edits.filter((e) => editGroup(e.verb) === "carve");
  for (const edit of [...raises, ...carves]) {
    result.order.push(edit.id);
    const fp = new FootprintBuilder(edit.id, edit.verb, n);
    applyEdit(field, edit, ctx, result, fp);
    const footprint = fp.finish();
    result.footprints.push(footprint);
    if (editGroup(edit.verb) === "carve" && floodedOf(edit) === "never") {
      for (let idx = 0; idx < n; idx++) {
        if (footprintHas(footprint, idx)) result.noFlood[idx] = 1;
      }
    }
  }
  return result;
}

function seedFor(ctx: EditContext, edit: TerrainEdit): Seed256 {
  return nodeSeed(ctx.worldSeed, `${ctx.parentPath}.${edit.id}`);
}

function pushMarker(out: EditComposition, editId: string, name: string, p: Point2, y: number): void {
  out.markers.push({ id: `${editId}.${name}`, name, x: p.x, z: p.z, y });
}

function applyEdit(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  fp: FootprintBuilder,
): void {
  const strength = clamp01(edit.strength ?? 1);
  if (strength === 0) return;
  const seed = seedFor(ctx, edit);
  switch (edit.verb) {
    case "ridge":
      applyCorridorRaise(field, edit, ctx, out, seed, strength, fp);
      return;
    case "peak":
      applyRadialCone(field, edit, ctx, out, seed, strength, num(edit, "height", "peak"), fp);
      return;
    case "volcano":
      applyVolcano(field, edit, ctx, out, seed, strength, fp);
      return;
    case "plateau":
      applyPlateau(field, edit, ctx, out, seed, strength, fp);
      return;
    case "island":
      applyRadialCone(field, edit, ctx, out, seed, strength, num(edit, "height", "island"), fp);
      return;
    case "valley":
      applyValley(field, edit, ctx, out, seed, strength, fp);
      return;
    case "river":
      applyRiver(field, edit, ctx, out, seed, strength, fp);
      return;
    case "basin":
      applyBasin(field, edit, ctx, out, seed, strength, fp);
      return;
  }
}

// --- raise: ridge -----------------------------------------------------------

function applyCorridorRaise(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  seed: Seed256,
  strength: number,
  fp: FootprintBuilder,
): void {
  if (!edit.course) throw new Error(`terrain.edit@0 '${edit.id}': ridge needs 'course'`);
  const width = num(edit, "width", "ridge");
  const shape = makeCorridorShape(refineCourse(ctx.region, edit.course), seed, width, meanderOf(edit));
  const samples = shape.samples;
  const height = num(edit, "height", "ridge");
  const profile = falloffOf(edit, "ridge");
  const region = field.region;
  const b = courseBounds(region, samples, shape.maxHalfWidth + 1);

  let peakPoint: Point2 = samples[0] as Point2;
  let peakY = Number.NEGATIVE_INFINITY;

  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const x = region.x0 + i;
      const z = region.z0 + j;
      const { distance, index } = polylineDistance(x, z, samples);
      const halfWidth = shape.halfWidths[index] as number;
      if (distance >= halfWidth) continue;
      const f = falloff(profile, 1 - distance / halfWidth) * (shape.taper[index] as number);
      if (f <= 0) continue;
      const idx = j * region.width + i;
      fp.add(idx);
      const v = (field.values[idx] as number) + height * f * strength;
      field.values[idx] = v;
      if (v > peakY) {
        peakY = v;
        peakPoint = { x, z };
      }
    }
  }

  const head = samples[0] as Point2;
  const mouth = samples[samples.length - 1] as Point2;
  pushMarker(out, edit.id, "head", head, field.heightAt(head.x, head.z));
  pushMarker(out, edit.id, "mouth", mouth, field.heightAt(mouth.x, mouth.z));
  pushMarker(out, edit.id, "peak", peakPoint, peakY === Number.NEGATIVE_INFINITY ? 0 : peakY);
}

// --- raise: peak / island ---------------------------------------------------

function applyRadialCone(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  seed: Seed256,
  strength: number,
  height: number,
  fp: FootprintBuilder,
): void {
  const verb = edit.verb;
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", verb);
  const profile = falloffOf(edit, verb);
  const shape = makeRadialShape(seed, radius, irregularityOf(edit));
  addRadial(field, center, shape, height * strength, profile, fp);
  emitRadialMarkers(field, out, edit.id, center, radius);
}

/** Add `peakDelta · falloff(1 - d/r_eff)` to every column inside the modulated disc. */
function addRadial(
  field: HeightField,
  center: Point2,
  shape: RadialShape,
  peakDelta: number,
  profile: FalloffProfile,
  fp: FootprintBuilder,
): void {
  const region = field.region;
  const reach = shape.maxRadius;
  const b = boundsFor(region, center.x - reach, center.x + reach, center.z - reach, center.z + reach);
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const rEff = shape.radiusAt(dx, dz);
      if (rEff <= 0) continue;
      const d = shape.distanceAt(dx, dz);
      if (d >= rEff) continue;
      const f = falloff(profile, 1 - d / rEff);
      const idx = j * region.width + i;
      fp.add(idx);
      field.values[idx] = (field.values[idx] as number) + peakDelta * f;
    }
  }
}

function emitRadialMarkers(
  field: HeightField,
  out: EditComposition,
  editId: string,
  center: Point2,
  radius: number,
): void {
  const foot: Point2 = { x: center.x + radius, z: center.z };
  pushMarker(out, editId, "center", center, field.heightAt(center.x, center.z));
  pushMarker(out, editId, "peak", center, field.heightAt(center.x, center.z));
  pushMarker(out, editId, "foot", foot, field.heightAt(foot.x, foot.z));
}

// --- raise: volcano ---------------------------------------------------------

/** Caldera radius as a fraction of the cone radius. */
export const CALDERA_RADIUS_FRACTION = 0.28;

function applyVolcano(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  seed: Seed256,
  strength: number,
  fp: FootprintBuilder,
): void {
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", "volcano");
  const height = num(edit, "height", "volcano");
  const wantsCaldera = flag(edit, "caldera", "volcano");
  const calderaDepth = num(edit, "calderaDepth", "volcano");
  const wantsLava = flag(edit, "lava", "volcano");

  const profile = falloffOf(edit, "volcano");
  const shape = makeRadialShape(seed, radius, irregularityOf(edit));

  if (!wantsCaldera) {
    // A plain cone.
    addRadial(field, center, shape, height * strength, profile, fp);
    emitRadialMarkers(field, out, edit.id, center, radius);
    return;
  }

  // Cone + caldera in one sweep. Outside the caldera radius the surface is the
  // ordinary cone; inside it, the cone is truncated at the *rim* height (so the
  // crater rim, not the axis, is the summit) and the bowl is cut below that.
  //
  // The caldera rim is a fixed *fraction* of the modulated cone radius, not a
  // fixed number of blocks — so the crater inherits the same lobes as the cone
  // and the two stay concentric. Because the ratio is constant, the rim's
  // falloff value (and therefore the truncation height) is constant too, which
  // is what keeps the rim level all the way round a lopsided cone.
  const calderaRadius = radius * CALDERA_RADIUS_FRACTION;
  const rimAdd = height * falloff(profile, 1 - CALDERA_RADIUS_FRACTION) * strength;
  const region = field.region;
  const reach = shape.maxRadius;
  const b = boundsFor(region, center.x - reach, center.x + reach, center.z - reach, center.z + reach);
  const columns: number[] = [];
  let rimY = Number.POSITIVE_INFINITY;
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const rEff = shape.radiusAt(dx, dz);
      if (rEff <= 0) continue;
      const d = shape.distanceAt(dx, dz);
      if (d >= rEff) continue;
      const calderaEff = rEff * CALDERA_RADIUS_FRACTION;
      const idx = j * region.width + i;
      fp.add(idx);
      if (d >= calderaEff) {
        field.values[idx] =
          (field.values[idx] as number) + height * falloff(profile, 1 - d / rEff) * strength;
        continue;
      }
      // Bowl: full depth at the axis, tapering to zero at the rim.
      const bowl = calderaDepth * strength * smoothstep01(1 - d / calderaEff);
      field.values[idx] = (field.values[idx] as number) + rimAdd - bowl;
      // The rim ring is defined by *ratio*, not by a fixed 1.5-block band: on a
      // lobed crater the band width has to scale with the lobe, or a column deep
      // inside a narrow lobe would read as "interior" while sitting higher than
      // the ring of a wide one — and the lava level derived from that ring
      // would spill.
      if (d / calderaEff >= 1 - 1.5 / calderaRadius) {
        const after = field.values[idx] as number;
        if (after < rimY) rimY = after;
      } else {
        columns.push(idx);
      }
    }
  }

  const rimPoint: Point2 = { x: center.x + calderaRadius, z: center.z };
  pushMarker(out, edit.id, "center", center, field.heightAt(center.x, center.z));
  pushMarker(out, edit.id, "peak", rimPoint, field.heightAt(rimPoint.x, rimPoint.z));
  const foot: Point2 = { x: center.x + radius, z: center.z };
  pushMarker(out, edit.id, "foot", foot, field.heightAt(foot.x, foot.z));

  if (columns.length > 0 && rimY !== Number.POSITIVE_INFINITY) {
    const lavaY = Math.floor(rimY) - 2;
    out.calderas.push({
      editId: edit.id,
      centerX: center.x,
      centerZ: center.z,
      radius: calderaRadius,
      rimY,
      lavaY,
      lava: wantsLava,
      columns: Int32Array.from(columns),
    });
    pushMarker(out, edit.id, "caldera", center, field.heightAt(center.x, center.z));
  } else if (wantsLava) {
    out.diagnostics.push({
      code: "LOAM-T105",
      editId: edit.id,
      message: "caldera too small to hold lava at this region resolution; lava skipped",
    });
  }
}

// --- raise: plateau ---------------------------------------------------------

/**
 * `plateau` levels the field to `base(centre) + height` inside `radius - rim`,
 * then falls off across `rim`. It is a *level-to* operation rather than a plain
 * additive dome — that is what makes the top actually flat over uneven ground.
 * `strength` blends between the original field and the levelled target.
 */
function applyPlateau(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  seed: Seed256,
  strength: number,
  fp: FootprintBuilder,
): void {
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", "plateau");
  const height = num(edit, "height", "plateau");
  const rim = clamp(num(edit, "rim", "plateau"), 0, radius);
  const target = field.heightAt(center.x, center.z) + height;
  const shape = makeRadialShape(seed, radius, irregularityOf(edit));

  const region = field.region;
  const reach = shape.maxRadius;
  const b = boundsFor(region, center.x - reach, center.x + reach, center.z - reach, center.z + reach);
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const rEff = shape.radiusAt(dx, dz);
      if (rEff <= 0) continue;
      const d = shape.distanceAt(dx, dz);
      if (d >= rEff) continue;
      // The rim band tracks the modulated edge, so the flat top has the same
      // outline as the foot.
      const core = rEff - rim;
      const f = rim <= 0 || d <= core ? 1 : smoothstep01(clamp01((rEff - d) / rim));
      const idx = j * region.width + i;
      fp.add(idx);
      const h = field.values[idx] as number;
      const raised = h > target ? h : target; // never dig, only level up
      field.values[idx] = lerp(h, raised, f * strength);
    }
  }
  emitRadialMarkers(field, out, edit.id, center, radius);
}

// --- carve: valley ----------------------------------------------------------

function applyValley(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  seed: Seed256,
  strength: number,
  fp: FootprintBuilder,
): void {
  if (!edit.course) throw new Error(`terrain.edit@0 '${edit.id}': valley needs 'course'`);
  const width = num(edit, "width", "valley");
  const shape = makeCorridorShape(refineCourse(ctx.region, edit.course), seed, width, meanderOf(edit));
  const samples = shape.samples;
  const depth = num(edit, "depth", "valley");
  const profile = falloffOf(edit, "valley");
  const region = field.region;
  const b = courseBounds(region, samples, shape.maxHalfWidth + 1);
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const { distance, index } = polylineDistance(region.x0 + i, region.z0 + j, samples);
      const halfWidth = shape.halfWidths[index] as number;
      if (distance >= halfWidth) continue;
      const f = falloff(profile, 1 - distance / halfWidth) * (shape.taper[index] as number);
      if (f <= 0) continue;
      const idx = j * region.width + i;
      fp.add(idx);
      field.values[idx] = (field.values[idx] as number) - depth * f * strength;
    }
  }
  emitCourseMarkers(field, out, edit.id, samples, false);
}

// --- carve: river -----------------------------------------------------------

/**
 * `river` carves a channel that descends to its mouth.
 *
 * The course is meandered first, then the descent pass is re-run **on the
 * displaced curve** — running it on the straight spline would sample the wrong
 * columns and let the meandered channel climb. The bed at each sample is
 * `min(seaLevel, descentElevation) - depth`, so a river that starts inland
 * steps down through the highlands instead of trenching its whole length to sea
 * level; the last stretch reaches `seaLevel - depth` and becomes a proper
 * estuary. Because the descent elevations are non-increasing toward the mouth,
 * so is the bed.
 */
function applyRiver(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  seed: Seed256,
  strength: number,
  fp: FootprintBuilder,
): void {
  if (!edit.course) throw new Error(`terrain.edit@0 '${edit.id}': river needs 'course'`);
  const width = num(edit, "width", "river");
  const shape = makeCorridorShape(refineCourse(ctx.region, edit.course), seed, width, meanderOf(edit));
  const samples = shape.samples;
  const { elevations, reversed } = monotonicDescent(samples, field);
  const depth = num(edit, "depth", "river");
  const profile = falloffOf(edit, "river");
  const region = field.region;
  const b = courseBounds(region, samples, shape.maxHalfWidth + 1);
  const beds = new Float64Array(samples.length);
  for (let k = 0; k < samples.length; k++) {
    const e = elevations[k] as number;
    beds[k] = (e < ctx.seaLevel ? e : ctx.seaLevel) - depth;
  }
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const { distance, index } = polylineDistance(region.x0 + i, region.z0 + j, samples);
      const halfWidth = shape.halfWidths[index] as number;
      if (distance >= halfWidth) continue;
      const f = falloff(profile, 1 - distance / halfWidth) * (shape.taper[index] as number);
      if (f <= 0) continue;
      const idx = j * region.width + i;
      const h = field.values[idx] as number;
      const bed = beds[index] as number;
      if (bed >= h) continue; // already at or below the bed — never raise
      fp.add(idx);
      field.values[idx] = lerp(h, bed, f * strength);
    }
  }
  emitCourseMarkers(field, out, edit.id, samples, reversed);
}

/**
 * Course markers: `head` is the upstream end, `mouth` the downstream end.
 * `reversed` is set when the *last* waypoint is the higher one, in which case
 * the roles swap.
 */
function emitCourseMarkers(
  field: HeightField,
  out: EditComposition,
  editId: string,
  samples: readonly Point2[],
  reversed: boolean,
): void {
  const a = samples[0] as Point2;
  const b = samples[samples.length - 1] as Point2;
  const head = reversed ? b : a;
  const mouth = reversed ? a : b;
  pushMarker(out, editId, "head", head, field.heightAt(head.x, head.z));
  pushMarker(out, editId, "mouth", mouth, field.heightAt(mouth.x, mouth.z));
}

// --- carve: basin -----------------------------------------------------------

function applyBasin(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  seed: Seed256,
  strength: number,
  fp: FootprintBuilder,
): void {
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", "basin");
  const depth = num(edit, "depth", "basin");
  const profile = falloffOf(edit, "basin");
  const wantsWater = flag(edit, "water", "basin");
  const shape = makeRadialShape(seed, radius, irregularityOf(edit));

  addRadial(field, center, shape, -depth * strength, profile, fp);
  emitRadialMarkers(field, out, edit.id, center, radius);

  if (!wantsWater) return;

  // The rim is the ring of columns just inside the basin edge. Water may only
  // be placed when that ring is fully above the intended surface *and* the
  // whole ring lies inside the region (an open rim would spill).
  const region = field.region;
  const reach = shape.maxRadius;
  const b = boundsFor(region, center.x - reach, center.x + reach, center.z - reach, center.z + reach);
  const inside: number[] = [];
  let rimMin = Number.POSITIVE_INFINITY;
  const rimClosed =
    center.x - reach >= region.x0 &&
    center.x + reach <= region.x0 + region.width - 1 &&
    center.z - reach >= region.z0 &&
    center.z + reach <= region.z0 + region.depth - 1;
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const rEff = shape.radiusAt(dx, dz);
      if (rEff <= 0) continue;
      const d = shape.distanceAt(dx, dz);
      if (d >= rEff) continue;
      const idx = j * region.width + i;
      if (d >= rEff - 2) {
        const v = field.values[idx] as number;
        if (v < rimMin) rimMin = v;
      } else {
        inside.push(idx);
      }
    }
  }
  if (!rimClosed || inside.length === 0 || rimMin === Number.POSITIVE_INFINITY) {
    out.diagnostics.push({
      code: "LOAM-T105",
      editId: edit.id,
      message: "basin rim is not closed; water fill skipped",
    });
    out.basins.push({
      editId: edit.id,
      centerX: center.x,
      centerZ: center.z,
      radius,
      waterY: null,
      columns: Int32Array.from(inside),
    });
    return;
  }
  const waterY = Math.floor(rimMin) - 1;
  // Every interior column must actually sit below the surface, else there is
  // nothing to fill and the "lake" would be a puddle on a hump.
  let anyBelow = false;
  for (const idx of inside) {
    if ((field.values[idx] as number) < waterY) {
      anyBelow = true;
      break;
    }
  }
  if (!anyBelow) {
    out.diagnostics.push({
      code: "LOAM-T105",
      editId: edit.id,
      message: "basin interior does not sit below its rim; water fill skipped",
    });
  }
  out.basins.push({
    editId: edit.id,
    centerX: center.x,
    centerZ: center.z,
    radius,
    waterY: anyBelow ? waterY : null,
    columns: Int32Array.from(inside),
  });
}
