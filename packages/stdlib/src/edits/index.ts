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

/** The string a course endpoint may carry instead of a coordinate. */
export const COAST_ANCHOR = "coast";

/**
 * One `course` waypoint: a fractional coordinate, or the terrain anchor
 * `"coast"` in the first or last position of a carve corridor.
 *
 * The anchor exists because the author physically cannot know where the coast
 * will be. Continentalness and the world seed decide that, and they are
 * evaluated long after the document is written — so a cove aimed at
 * `[0.5, 0.0]` is a guess, and when the sea comes up in the south-west instead
 * the guess compiles as a dry canyon. `"coast"` says *aim at the water* and
 * defers the coordinate to {@link resolveCourseAnchors}.
 */
export type CourseWaypoint = Fractional | typeof COAST_ANCHOR;

/** True for the `"coast"` terrain anchor. */
export function isCoastAnchor(w: CourseWaypoint): w is typeof COAST_ANCHOR {
  return w === COAST_ANCHOR;
}

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
  course?: readonly CourseWaypoint[];

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
export function refineCourse(region: Region, waypoints: readonly CourseWaypoint[]): Point2[] {
  if (waypoints.length < 2) {
    throw new Error("terrain.edit@0: 'course' needs 2–8 waypoints");
  }
  const pts = waypoints.map((w) => {
    if (isCoastAnchor(w)) {
      // Unreachable through `applyEdits`, which resolves anchors before any
      // carve runs. Reaching it means someone refined a raw authored course.
      throw new Error(
        "terrain.edit@0: 'course' still holds a \"coast\" anchor — resolve it with resolveCourseAnchors first",
      );
    }
    return toWorld(region, w);
  });
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
// Terrain anchors — resolving `"coast"`
// ---------------------------------------------------------------------------

/**
 * How far past the resolved coastline the course is pushed, in blocks.
 *
 * Landing the endpoint *on* the first wet column is not enough: the corridor
 * tapers over its last `1.5 × width` of arclength, so a course that stops at the
 * waterline carves its shallowest, narrowest cross-section exactly where the
 * mouth needs to open. Running a little way out to sea puts the taper in the
 * water, where nobody can see it, and leaves the mouth at full section.
 */
export const COAST_ANCHOR_OVERSHOOT = 8;

/**
 * The preliminary ocean: which columns the sea would reach if the carves had
 * not run yet.
 *
 * Same rule as `classify`'s `computeOceanMask` — below sea level and
 * 4-connected to the map edge — minus the `flooded: "never"` machinery, which
 * has nothing to block at this point in the pipeline because no carve has
 * claimed a column yet. It is computed after the base field and every raise
 * verb, which is the last moment at which "where is the coast" has an answer
 * that does not depend on the carve asking the question.
 */
export function preliminaryOceanMask(field: HeightField, seaLevel: number): Uint8Array {
  const { width, depth } = field.region;
  const v = field.values;
  const n = width * depth;
  const mask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (idx: number): void => {
    if (mask[idx] === 1 || !((v[idx] as number) < seaLevel)) return;
    mask[idx] = 1;
    queue[tail++] = idx;
  };
  for (let i = 0; i < width; i++) {
    push(i);
    push((depth - 1) * width + i);
  }
  for (let j = 0; j < depth; j++) {
    push(j * width);
    push(j * width + width - 1);
  }
  while (head < tail) {
    const idx = queue[head++] as number;
    const i = idx % width;
    const j = (idx - i) / width;
    if (i > 0) push(idx - 1);
    if (i < width - 1) push(idx + 1);
    if (j > 0) push(idx - width);
    if (j < depth - 1) push(idx + width);
  }
  return mask;
}

/**
 * The nearest set column of `mask` to a world point, or `null` when the mask is
 * empty. Ties go to the lowest grid index — a full scan in row-major order, so
 * the answer never depends on iteration luck.
 *
 * `forward`, when given, is the course's outgoing bearing, and the search
 * prefers water that lies *ahead* of it. Without that preference the anchor
 * simply takes the closest sea in any direction, which on a peninsula means the
 * shore behind the course: the resolved endpoint doubles back over the channel
 * that was heading somewhere else, and the "cove" comes out as a hook. Columns
 * behind the bearing are not forbidden — if the only water is astern, astern is
 * where the mouth goes — they just lose to any candidate in front.
 */
export function nearestMaskColumn(
  field: HeightField,
  mask: Uint8Array,
  from: Point2,
  forward?: { readonly x: number; readonly z: number },
): Point2 | null {
  const { width, depth, x0, z0 } = field.region;
  let best = Number.POSITIVE_INFINITY;
  let bestPoint: Point2 | null = null;
  let bestBehind = Number.POSITIVE_INFINITY;
  let bestBehindPoint: Point2 | null = null;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      if (mask[j * width + i] !== 1) continue;
      const dx = x0 + i - from.x;
      const dz = z0 + j - from.z;
      const d = dx * dx + dz * dz;
      const ahead = forward === undefined || dx * forward.x + dz * forward.z > 0;
      if (ahead) {
        if (d < best) {
          best = d;
          bestPoint = { x: x0 + i, z: z0 + j };
        }
      } else if (d < bestBehind) {
        bestBehind = d;
        bestBehindPoint = { x: x0 + i, z: z0 + j };
      }
    }
  }
  return bestPoint ?? bestBehindPoint;
}

/**
 * The lowest column on the region border — where the water *would* leave the
 * map if this map had any. The fallback for `"coast"` on an ocean-free world:
 * aiming the carve downhill toward the edge is the closest thing to a coast
 * available, and `LOAM-T113` then tells the author plainly that it stayed dry.
 */
export function lowestEdgeColumn(field: HeightField): Point2 {
  const { width, depth, x0, z0 } = field.region;
  const v = field.values;
  let best = Number.POSITIVE_INFINITY;
  let bestPoint: Point2 = { x: x0, z: z0 };
  const consider = (i: number, j: number): void => {
    const h = v[j * width + i] as number;
    if (h < best) {
      best = h;
      bestPoint = { x: x0 + i, z: z0 + j };
    }
  };
  for (let i = 0; i < width; i++) {
    consider(i, 0);
    consider(i, depth - 1);
  }
  for (let j = 0; j < depth; j++) {
    consider(0, j);
    consider(width - 1, j);
  }
  return bestPoint;
}

function toFractional(region: Region, p: Point2): Fractional {
  return [
    clamp01(region.width === 0 ? 0 : (p.x - region.x0) / region.width),
    clamp01(region.depth === 0 ? 0 : (p.z - region.z0) / region.depth),
  ];
}

/**
 * Replace any `"coast"` waypoint with a real coordinate.
 *
 * The anchor may only be the first or last waypoint (the validator enforces
 * that), and it resolves against its *neighbour*: the nearest preliminary-ocean
 * column to the waypoint next to it, pushed {@link COAST_ANCHOR_OVERSHOOT}
 * blocks further along the same bearing so the mouth opens under water rather
 * than tapering shut on the beach. When the course has a waypoint before that
 * neighbour, the sea *ahead* of the direction it is already travelling wins
 * over the sea behind it — otherwise a cove running down a peninsula resolves
 * onto the shore it just left and comes out hooked.
 *
 * With no ocean anywhere the anchor falls back to {@link lowestEdgeColumn} and
 * the carve compiles dry — reported as `LOAM-T113`, not silently swallowed.
 */
export function resolveCourseAnchors(
  field: HeightField,
  course: readonly CourseWaypoint[],
  ocean: Uint8Array | null,
): Fractional[] {
  const region = field.region;
  const out = course.map((w) => (isCoastAnchor(w) ? null : (w as Fractional)));

  const resolveAt = (index: number, neighbour: number, behind: number): void => {
    if (out[index] !== null) return;
    const anchorFor = out[neighbour];
    // Both ends anchored *and* the neighbour unresolved cannot happen for a
    // 2-point course (the validator rejects it) and for longer ones the
    // neighbour is always an interior, coordinate-carrying waypoint.
    const from =
      anchorFor === null || anchorFor === undefined
        ? { x: region.x0 + region.width / 2, z: region.z0 + region.depth / 2 }
        : toWorld(region, anchorFor);
    // The bearing the course is already travelling on, when there is a waypoint
    // before the anchor's neighbour to measure it from.
    const prior = behind >= 0 && behind < out.length ? out[behind] : null;
    const bearing =
      prior === null || prior === undefined
        ? undefined
        : (() => {
            const p = toWorld(region, prior);
            return { x: from.x - p.x, z: from.z - p.z };
          })();
    const target =
      ocean === null ? null : nearestMaskColumn(field, ocean, from, bearing);
    const landing = target ?? lowestEdgeColumn(field);
    const dx = landing.x - from.x;
    const dz = landing.z - from.z;
    const len = sqrt(dx * dx + dz * dz);
    const extended =
      len === 0
        ? landing
        : {
            x: landing.x + (dx / len) * COAST_ANCHOR_OVERSHOOT,
            z: landing.z + (dz / len) * COAST_ANCHOR_OVERSHOOT,
          };
    out[index] = toFractional(region, extended);
  };

  if (course.length >= 2) {
    resolveAt(0, 1, 2);
    resolveAt(course.length - 1, course.length - 2, course.length - 3);
  }
  return out.map((p) => p ?? ([0.5, 0.5] as Fractional));
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

/**
 * Course length, in blocks, at which the long-wander octave starts to appear,
 * and the length at which it reaches full strength.
 *
 * The G2.5a meander scales with *width*, which is right for a connector and
 * wrong for a trunk river: a nine-block river gets an amplitude of about five
 * blocks and a wavelength of seventy-two, so across three hundred blocks of
 * course it wiggles four times by half its own width. From the map that is a
 * ruled line. Rivers wander in proportion to how far they run, not to how wide
 * they are — so a second, much longer octave is added whose amplitude is a
 * share of the course length and whose wavelength is a fixed fraction of it.
 *
 * The ramp is what keeps short connectors tame, and it is also the reason the
 * pinned golden field hash is **unchanged**: every corridor in that fixture is
 * under 120 blocks long, so `longRamp` is exactly 0 and this branch is not
 * taken at all. Below {@link LONG_COURSE_LENGTH} the function is bit-identical
 * to G2.5a's.
 */
const LONG_COURSE_LENGTH = 120;
/** Course length at which the long-wander octave reaches full amplitude. */
const LONG_COURSE_FULL = 360;
/** Long-wander amplitude as a share of course length, at `meander: 1`. */
const LONG_WANDER_SHARE = 0.12;
/** How many long-wander wavelengths fit in one course. */
const LONG_WANDER_CYCLES = 2.5;

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
  const wanderSeed = seed32(streamSeed(seed, "shape.wander"));
  const amp = clamp(meander, 0, 1) * width * MEANDER_AMPLITUDE;
  // Exactly 0 for any course shorter than LONG_COURSE_LENGTH, which is what
  // makes this an additive octave rather than a reroll of the old behaviour.
  const longRamp = clamp01((length - LONG_COURSE_LENGTH) / (LONG_COURSE_FULL - LONG_COURSE_LENGTH));
  const longAmp = clamp(meander, 0, 1) * LONG_WANDER_SHARE * length * longRamp;
  const longScale = length > 0 ? LONG_WANDER_CYCLES / length : 0;
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
    if (amp === 0 && longAmp === 0) {
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
    const d =
      amp * t * arclengthNoise(meanderSeed, si * meanderScale) +
      (longAmp === 0 ? 0 : longAmp * t * arclengthNoise(wanderSeed, si * longScale));
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
  /**
   * `"warning"` (the default) when the author should change something;
   * `"note"` when the compiler recovered on its own and is only reporting what
   * it did.
   */
  severity?: "warning" | "note";
}

/**
 * The refined centreline a corridor verb actually cut.
 *
 * Kept because hydrology needs it *after* composition: to demote a landlocked
 * river to a chain of ponds you have to walk its course looking for the low
 * points, and re-deriving the spline (meander, taper and all) downstream would
 * be a second source of truth for the same geometry.
 */
export interface CourseRecord {
  readonly editId: string;
  readonly verb: EditVerb;
  readonly flooded: FloodedMode;
  /** Refined, meandered samples in world coordinates, head-to-tail. */
  readonly samples: readonly Point2[];
}

/**
 * A carve that was applied, and what it asked hydrology for.
 *
 * `courses` only covers `river` (the pond demotion's input); the dry-carve check
 * has to see `valley` and `basin` too, and it needs the `flooded` declaration
 * next to the id without re-walking the document.
 */
export interface CarveRecord {
  readonly editId: string;
  readonly verb: EditVerb;
  readonly flooded: FloodedMode;
  /** Whether the author's course named the `"coast"` anchor. */
  readonly coastAnchored: boolean;
}

/** The outcome of composing every edit into the field. */
export interface EditComposition {
  /** Markers keyed by `"<editId>.<name>"`, in application order. */
  markers: Marker[];
  calderas: CalderaMask[];
  basins: BasinWater[];
  /** One record per applied corridor verb, in application order. */
  courses: CourseRecord[];
  /** One record per applied carve verb, in application order — what T113 walks. */
  carves: CarveRecord[];
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
 *
 * Between the two groups sits the terrain-anchor seam. A carve whose `course`
 * names `"coast"` is aimed at water that does not exist until the land does, so
 * the preliminary ocean mask is computed **after every raise and before any
 * carve** — the one moment when the coastline is final (no carve has moved it)
 * and still available (no carve has needed it yet). The resolved course then
 * goes through the ordinary refinement, meander and descent, exactly as an
 * authored one would.
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
    courses: [],
    carves: [],
    diagnostics: [],
    order: [],
    footprints: [],
    noFlood: new Uint8Array(n),
  };
  const raises = edits.filter((e) => editGroup(e.verb) === "raise");
  const carves = edits.filter((e) => editGroup(e.verb) === "carve");

  const run = (edit: TerrainEdit, coastAnchored: boolean): void => {
    result.order.push(edit.id);
    const fp = new FootprintBuilder(edit.id, edit.verb, n);
    applyEdit(field, edit, ctx, result, fp);
    const footprint = fp.finish();
    result.footprints.push(footprint);
    if (editGroup(edit.verb) !== "carve") return;
    result.carves.push({
      editId: edit.id,
      verb: edit.verb,
      flooded: floodedOf(edit),
      coastAnchored,
    });
    if (floodedOf(edit) === "never") {
      for (let idx = 0; idx < n; idx++) {
        if (footprintHas(footprint, idx)) result.noFlood[idx] = 1;
      }
    }
  };

  for (const edit of raises) run(edit, false);

  const anchored = carves.some((e) => e.course?.some(isCoastAnchor) === true);
  // Only computed when something asks for it: the fill is O(columns) but the
  // rule "same document, same field" is easier to trust when an unused feature
  // costs literally nothing.
  const ocean = anchored ? preliminaryOceanMask(field, ctx.seaLevel) : null;
  let oceanEmpty = false;
  if (ocean !== null) {
    oceanEmpty = !ocean.some((b) => b === 1);
  }

  for (const edit of carves) {
    const hasAnchor = edit.course?.some(isCoastAnchor) === true;
    if (!hasAnchor) {
      run(edit, false);
      continue;
    }
    const course = resolveCourseAnchors(field, edit.course as readonly CourseWaypoint[], oceanEmpty ? null : ocean);
    run({ ...edit, course }, true);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fluid settling
// ---------------------------------------------------------------------------

/** What {@link stableFluidColumns} needs to settle a candidate pool. */
export interface FluidSettleRequest {
  readonly width: number;
  readonly depth: number;
  /** Candidate grid indices. */
  readonly columns: Iterable<number>;
  /** The fluid surface level under test. */
  readonly level: number;
  /** Y of the solid floor of a column — a candidate joins the pool only below `level`. */
  readonly floorAt: (idx: number) => number;
  /** Y a *neighbouring* column is filled to, solid or fluid. */
  readonly topAt: (idx: number) => number;
  /**
   * Whether the grid border leaks.
   *
   * Default `false` — the emitter's region is a closed world as far as the
   * materializer is concerned. The open-basin search sets it, because water
   * touching the region edge would pour into chunks this compile never wrote.
   */
  readonly edgeLeaks?: boolean;
}

/** The surviving pool. */
export interface FluidSettleResult {
  /** 1 for every column that holds fluid at `level`. */
  readonly inPool: Uint8Array;
  /** How many columns that is. */
  readonly count: number;
}

/**
 * Erode a candidate pool at `level` until it cannot flow.
 *
 * A candidate drops out when a horizontal neighbour is neither in the pool nor
 * filled up to `level` — which would leave a fluid block with an air face.
 * Removing a column can expose its neighbours, so the erosion runs to a fixed
 * point. Columns outside the grid are treated as walls, not as leaks.
 *
 * This is the single definition of "fluid-stable" in the toolchain: the
 * compiler's `settleFluidPool` places blocks with it, and
 * {@link resolveOpenBasins} probes fill levels with it, so a level the probe
 * accepts is exactly a level the materializer can realize.
 */
export function stableFluidColumns(req: FluidSettleRequest): FluidSettleResult {
  const { width, depth, level, floorAt, topAt } = req;
  const edgeLeaks = req.edgeLeaks === true;
  const inPool = new Uint8Array(width * depth);
  const candidates: number[] = [];
  for (const idx of req.columns) {
    if (idx < 0 || idx >= inPool.length) continue;
    if (floorAt(idx) >= level) continue;
    inPool[idx] = 1;
    candidates.push(idx);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const idx of candidates) {
      if (inPool[idx] === 0) continue;
      const i = idx % width;
      const j = (idx - i) / width;
      if (leaks(i - 1, j) || leaks(i + 1, j) || leaks(i, j - 1) || leaks(i, j + 1)) {
        inPool[idx] = 0;
        changed = true;
      }
    }
  }

  let count = 0;
  for (const idx of candidates) {
    if (inPool[idx] === 1) count++;
  }
  return { inPool, count };

  function leaks(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= width || j >= depth) return edgeLeaks;
    const idx = j * width + i;
    if (inPool[idx] === 1) return false;
    return topAt(idx) < level;
  }
}

/** Lowest level a partial basin fill may settle at, relative to its floor. */
export const MIN_PARTIAL_BASIN_DEPTH = 2;

/** Highest level a partial basin fill may settle at, relative to its floor. */
export const MAX_PARTIAL_BASIN_DEPTH = 96;

/**
 * Give every open-rimmed `water: true` basin the deepest pool its rim can hold.
 *
 * The old behaviour was all-or-nothing: a rim with one gap in it meant no water
 * at all, and a "hidden lagoon" compiled dry. A gap does not stop water, it
 * only *lowers* the waterline — so instead of giving up, try fill levels
 * descending from one block below the lowest gap down to two blocks above the
 * basin floor, and take the first that {@link stableFluidColumns} proves holds
 * a non-empty pool. Only when no level works does the basin stay dry.
 *
 * The search is over integers in a fixed order and reads nothing but the field,
 * so it is deterministic. Run this **after** every edit has been composed *and*
 * after the ocean flood fill is known: a later carve can breach a rim that was
 * closed when the basin was cut, and a basin the sea already reaches is the
 * sea's, not a lake's.
 */
export function resolveOpenBasins(
  field: HeightField,
  out: EditComposition,
  sea?: { readonly seaLevel: number; readonly oceanMask: Uint8Array },
): void {
  const { width, depth } = field.region;
  const values = field.values;
  const isOcean = (idx: number): boolean => sea !== undefined && sea.oceanMask[idx] === 1;
  const floorAt = (idx: number): number => Math.floor(values[idx] as number);
  // An ocean column is already filled to sea level; that is what a neighbouring
  // pool leans against, and it is why a sea-flooded basin needs no lake at all.
  const topAt = (idx: number): number =>
    isOcean(idx) ? Math.max(floorAt(idx), (sea as { seaLevel: number }).seaLevel) : floorAt(idx);

  for (const basin of out.basins) {
    if (basin.waterY !== null || basin.columns.length === 0) continue;

    // Candidates are the basin's whole footprint, not just the interior the
    // carve reported: the two-block rim band it excluded is part of the bowl,
    // and treating it as wall is what put the waterline under the floor.
    const fp = out.footprints.find((f) => f.editId === basin.editId && f.verb === "basin");
    const candidates = fp === undefined ? basin.columns : footprintColumns(fp, width * depth);

    const inBasin = new Uint8Array(width * depth);
    const pool: number[] = [];
    let floorY = Number.POSITIVE_INFINITY;
    for (const idx of candidates) {
      if (idx < 0 || idx >= inBasin.length) continue;
      // A column the sea already reaches is ocean, not lake.
      if (isOcean(idx)) continue;
      if (inBasin[idx] === 1) continue;
      inBasin[idx] = 1;
      pool.push(idx);
      const y = floorAt(idx);
      if (y < floorY) floorY = y;
    }
    if (pool.length === 0) continue;

    // The wall around the bowl: nothing outside the pool can be submerged, so
    // its highest column is the ceiling on any fill. Note this is the *highest*
    // wall, not the lowest — taking the lowest point of the rim as the
    // waterline (what `applyBasin` does) is precisely the over-constraint that
    // dried these basins out, because one low column is not a spillway if the
    // ground behind it stands higher. Which levels actually leak is left to the
    // settle, which knows.
    let wallY = Number.NEGATIVE_INFINITY;
    for (const idx of pool) {
      const i = idx % width;
      const j = (idx - i) / width;
      considerWall(i - 1, j);
      considerWall(i + 1, j);
      considerWall(i, j - 1);
      considerWall(i, j + 1);
    }
    if (!Number.isFinite(wallY)) continue;

    const start = Math.min(wallY - 1, floorY + MAX_PARTIAL_BASIN_DEPTH);
    for (let level = start; level >= floorY + MIN_PARTIAL_BASIN_DEPTH; level--) {
      const settled = stableFluidColumns({
        width,
        depth,
        columns: pool,
        level,
        floorAt,
        topAt,
        edgeLeaks: true,
      });
      if (settled.count === 0) continue;
      basin.waterY = level;
      // Narrow the basin to the pool that actually holds, so the lake mask and
      // the materializer see the same columns this search proved stable.
      basin.columns = Int32Array.from(pool.filter((idx) => settled.inPool[idx] === 1));
      downgradeRimDiagnostic(out, basin.editId, level, settled.count);
      break;
    }

    function considerWall(i: number, j: number): void {
      if (i < 0 || j < 0 || i >= width || j >= depth) return;
      const idx = j * width + i;
      if (inBasin[idx] === 1) return;
      const y = topAt(idx);
      if (y > wallY) wallY = y;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Pond chains — the sealess-river demotion                                    */
/* -------------------------------------------------------------------------- */

/** How far from a course sample a pond may gather its bed columns. */
export const POND_REACH = 12;
/** Shallowest pond worth keeping, in blocks above its floor. */
export const POND_MIN_DEPTH = 1;
/** Deepest a pond may fill above its floor. */
export const POND_MAX_DEPTH = 6;
/** Fewest bed columns a pond must hold to count as water rather than a puddle. */
export const POND_MIN_COLUMNS = 6;
/** Minimum spacing between two ponds of one chain, in blocks. */
export const POND_SEPARATION = 18;
/** Course samples either side of a candidate that must not sit lower. */
const POND_MINIMUM_WINDOW = 6;

/** One pond the demotion formed. */
export interface PondChainResult {
  readonly editId: string;
  readonly ponds: number;
  /** Columns given water across the whole chain. */
  readonly columns: number;
}

/**
 * Demote a `river` that reaches no sea into a chain of ponds.
 *
 * A `river` carve digs a bed to `min(seaLevel, descent) - depth` and then relies
 * on the ocean flood fill to put water in it. On a map with no ocean — an inland
 * plateau, a small region that never dips below `seaLevel` — the flood fill has
 * nothing to propagate from, and the channel compiles bone dry: hydraulically
 * correct, visually a trench.
 *
 * Real landlocked drainage does not vanish, it *beads*: water collects at the
 * low points and the stretches between them run dry. So when a `flooded: "auto"`
 * river has **zero** ocean-connected columns, walk its course, find the local
 * minima of the bed, and give each one the deepest pool
 * {@link stableFluidColumns} proves its own banks can hold. Dry stretches stay
 * dry, and because every pond is settle-proved at the level it is recorded at,
 * the fluid validator's "zero unstable blocks" is preserved by construction.
 *
 * A river that *does* touch the sea is untouched, so an estuary still floods the
 * way it always did. Runs after {@link resolveOpenBasins}, on the same
 * post-composition field, and touches only `out.basins` — never `field.values`.
 */
export function resolvePondChains(
  field: HeightField,
  out: EditComposition,
  sea: { readonly seaLevel: number; readonly oceanMask: Uint8Array },
): PondChainResult[] {
  const { width, depth, x0, z0 } = field.region;
  const n = width * depth;
  const values = field.values;
  const floorAt = (idx: number): number => Math.floor(values[idx] as number);
  const results: PondChainResult[] = [];

  for (const course of out.courses) {
    if (course.verb !== "river" || course.flooded !== "auto") continue;
    const fp = out.footprints.find((f) => f.editId === course.editId && f.verb === "river");
    if (fp === undefined || fp.count === 0) continue;

    // Ocean connectivity: one flooded column anywhere in the channel and this is
    // a river with a mouth, which needs no help.
    let oceanic = 0;
    const bed = new Uint8Array(n);
    for (let idx = 0; idx < n; idx++) {
      if (!footprintHas(fp, idx)) continue;
      bed[idx] = 1;
      if (sea.oceanMask[idx] === 1) oceanic++;
    }
    if (oceanic > 0) continue;

    const claimed = new Uint8Array(n);
    let ponds = 0;
    let columns = 0;
    let lastX = Number.NEGATIVE_INFINITY;
    let lastZ = Number.NEGATIVE_INFINITY;

    const samples = course.samples;
    const elevation = samples.map((p) => {
      const i = Math.round(p.x) - x0;
      const j = Math.round(p.z) - z0;
      if (i < 0 || j < 0 || i >= width || j >= depth) return Number.POSITIVE_INFINITY;
      return floorAt(j * width + i);
    });

    for (let k = 0; k < samples.length; k++) {
      if (!isLocalMinimum(elevation, k)) continue;
      const p = samples[k] as Point2;
      const dx = p.x - lastX;
      const dz = p.z - lastZ;
      if (dx * dx + dz * dz < POND_SEPARATION * POND_SEPARATION) continue;

      const pool = gatherPond(p);
      if (pool === null) continue;
      lastX = p.x;
      lastZ = p.z;
      ponds++;
      columns += pool.columns.length;
      for (const idx of pool.columns) claimed[idx] = 1;
      out.basins.push({
        editId: `${course.editId}#pond${ponds}`,
        centerX: Math.round(p.x),
        centerZ: Math.round(p.z),
        radius: POND_REACH,
        waterY: pool.level,
        columns: Int32Array.from(pool.columns),
      });
    }

    out.diagnostics.push({
      code: "LOAM-T112",
      editId: course.editId,
      severity: "note",
      message:
        ponds === 0
          ? `river "${course.editId}" is connected to no sea on this map and its bed holds no fluid-stable pool, so it compiled as a dry channel`
          : `river "${course.editId}" is connected to no sea on this map; it was demoted to a chain of ${ponds} pond${ponds === 1 ? "" : "s"} over ${columns} columns, with the stretches between them left dry`,
    });
    results.push({ editId: course.editId, ponds, columns });

    /** The deepest fluid-stable pool centred on one course sample, if any. */
    function gatherPond(p: Point2): { level: number; columns: number[] } | null {
      const ci = Math.round(p.x) - x0;
      const cj = Math.round(p.z) - z0;
      const candidates: number[] = [];
      const inPond = new Uint8Array(n);
      let floorY = Number.POSITIVE_INFINITY;
      for (let j = cj - POND_REACH; j <= cj + POND_REACH; j++) {
        if (j < 0 || j >= depth) continue;
        for (let i = ci - POND_REACH; i <= ci + POND_REACH; i++) {
          if (i < 0 || i >= width) continue;
          const di = i - ci;
          const dj = j - cj;
          if (di * di + dj * dj > POND_REACH * POND_REACH) continue;
          const idx = j * width + i;
          if (bed[idx] !== 1 || claimed[idx] === 1) continue;
          if (sea.oceanMask[idx] === 1) continue;
          inPond[idx] = 1;
          candidates.push(idx);
          const y = floorAt(idx);
          if (y < floorY) floorY = y;
        }
      }
      if (candidates.length < POND_MIN_COLUMNS) return null;

      // Same reasoning as `resolveOpenBasins`: the ceiling is the *highest*
      // column of the surrounding wall, and which levels actually leak is left
      // to the settle, which knows.
      let wallY = Number.NEGATIVE_INFINITY;
      for (const idx of candidates) {
        const i = idx % width;
        const j = (idx - i) / width;
        consider(i - 1, j);
        consider(i + 1, j);
        consider(i, j - 1);
        consider(i, j + 1);
      }
      if (!Number.isFinite(wallY)) return null;

      const start = Math.min(wallY - 1, floorY + POND_MAX_DEPTH);
      for (let level = start; level >= floorY + POND_MIN_DEPTH; level--) {
        const settled = stableFluidColumns({
          width,
          depth,
          columns: candidates,
          level,
          floorAt,
          topAt: floorAt,
          edgeLeaks: true,
        });
        if (settled.count < POND_MIN_COLUMNS) continue;
        return { level, columns: candidates.filter((idx) => settled.inPool[idx] === 1) };
      }
      return null;

      function consider(i: number, j: number): void {
        if (i < 0 || j < 0 || i >= width || j >= depth) return;
        const idx = j * width + i;
        if (inPond[idx] === 1) return;
        const y = floorAt(idx);
        if (y > wallY) wallY = y;
      }
    }
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/* Dry carves — LOAM-T113                                                      */
/* -------------------------------------------------------------------------- */

/** One carve that asked to flood and did not. */
export interface DryCarveResult {
  readonly editId: string;
  /** Blocks from the carve's lowest column to the nearest ocean, or `null`. */
  readonly distance: number | null;
  /** Compass bearing to that ocean, or `null` on a map with no ocean at all. */
  readonly direction: string | null;
}

/** Eight-point compass bearing for a world-space offset. North is −Z. */
export function compassBearing(dx: number, dz: number): string {
  const ax = dx < 0 ? -dx : dx;
  const az = dz < 0 ? -dz : dz;
  const ns = dz < 0 ? "north" : "south";
  const ew = dx > 0 ? "east" : "west";
  // tan(22.5°) — the boundary between a cardinal and a diagonal sector.
  const T = 0.41421356237;
  if (ax <= az * T) return ns;
  if (az <= ax * T) return ew;
  return `${ns}-${ew}`;
}

/**
 * Report every carve that asked for water and got none — `LOAM-T113`.
 *
 * `flooded: "auto"` is a request, not a promise: the carve floods only where it
 * is below sea level *and* connected to the sea. A cove authored as a valley
 * running north, on a map whose ocean came up in the south-west, satisfies
 * neither — and the compiler used to say nothing at all, leaving a dry canyon
 * scar where the water was meant to be. The author is not at fault for guessing
 * wrong (they cannot know where continentalness will put the coast) but they
 * *are* the only one who can fix it, so the note names the edit, says it stayed
 * dry, gives the distance and bearing from its lowest point to the nearest real
 * coastline, and points at the `"coast"` anchor.
 *
 * Rivers already demoted to ponds by {@link resolvePondChains} are skipped —
 * `LOAM-T112` covers them and says the same thing better. So are basins that
 * settled a lake, which are wet by another route.
 *
 * Runs after the ocean fill and the two water passes, on the finished field.
 */
export function reportDryCarves(
  field: HeightField,
  out: EditComposition,
  sea: { readonly seaLevel: number; readonly oceanMask: Uint8Array },
): DryCarveResult[] {
  const { width, depth, x0, z0 } = field.region;
  const n = width * depth;
  const values = field.values;
  const ponded = new Set(
    out.diagnostics.filter((d) => d.code === "LOAM-T112").map((d) => d.editId),
  );
  const results: DryCarveResult[] = [];

  for (const carve of out.carves) {
    if (carve.flooded !== "auto") continue;
    if (ponded.has(carve.editId)) continue;
    // A basin that settled a pool is water, just not sea water.
    if (out.basins.some((b) => b.editId === carve.editId && b.waterY !== null)) continue;
    const fp = out.footprints.find((f) => f.editId === carve.editId && f.verb === carve.verb);
    if (fp === undefined || fp.count === 0) continue;

    let wet = 0;
    let lowY = Number.POSITIVE_INFINITY;
    let lowIdx = -1;
    for (let idx = 0; idx < n; idx++) {
      if (!footprintHas(fp, idx)) continue;
      if (sea.oceanMask[idx] === 1) {
        wet++;
        break;
      }
      const y = values[idx] as number;
      if (y < lowY) {
        lowY = y;
        lowIdx = idx;
      }
    }
    if (wet > 0 || lowIdx < 0) continue;

    const low: Point2 = { x: x0 + (lowIdx % width), z: z0 + ((lowIdx - (lowIdx % width)) / width) };
    const coast = nearestMaskColumn(field, sea.oceanMask, low);
    const noun = `${carve.verb} "${carve.editId}"`;
    const hint = carve.coastAnchored
      ? " Its course already names the \"coast\" anchor, so there was nothing nearer to aim at."
      : "";

    if (coast === null) {
      out.diagnostics.push({
        code: "LOAM-T113",
        editId: carve.editId,
        severity: "note",
        message:
          `${noun} asked to flood ("flooded": "auto") but compiled dry: this map has no ocean ` +
          `anywhere — no column below sea level reaches the map edge, so there is no water to ` +
          `flow in.${hint}`,
      });
      results.push({ editId: carve.editId, distance: null, direction: null });
      continue;
    }

    const dx = coast.x - low.x;
    const dz = coast.z - low.z;
    const distance = Math.round(sqrt(dx * dx + dz * dz));
    const direction = compassBearing(dx, dz);
    out.diagnostics.push({
      code: "LOAM-T113",
      editId: carve.editId,
      severity: "note",
      message:
        `${noun} asked to flood ("flooded": "auto") but compiled dry: not one of its columns ` +
        `reaches the sea. Its lowest point sits ${distance} blocks ${direction} of the nearest ` +
        `coastline, so the carve is a dry channel in the middle of the land.${hint}`,
    });
    results.push({ editId: carve.editId, distance, direction });
  }

  return results;
}

/**
 * True when sample `k`'s bed is no higher than every sample within
 * {@link POND_MINIMUM_WINDOW} of it, and strictly lower than at least one — the
 * plateau-tolerant local-minimum test, so a long flat reach reports its first
 * column rather than every column.
 */
function isLocalMinimum(elevation: readonly number[], k: number): boolean {
  const here = elevation[k] as number;
  if (!Number.isFinite(here)) return false;
  let strictly = false;
  for (let d = 1; d <= POND_MINIMUM_WINDOW; d++) {
    for (const j of [k - d, k + d]) {
      if (j < 0 || j >= elevation.length) continue;
      const there = elevation[j] as number;
      if (!Number.isFinite(there)) continue;
      if (there < here) return false;
      if (there > here) strictly = true;
    }
  }
  return strictly;
}

/** Every grid index a footprint covers, in row-major order. */
function footprintColumns(fp: FeatureFootprint, n: number): number[] {
  const out: number[] = [];
  for (let idx = 0; idx < n; idx++) {
    if (footprintHas(fp, idx)) out.push(idx);
  }
  return out;
}

/** Turn an edit's `LOAM-T105` warning into a note recording the level reached. */
function downgradeRimDiagnostic(
  out: EditComposition,
  editId: string,
  level: number,
  columns: number,
): void {
  for (let k = 0; k < out.diagnostics.length; k++) {
    const d = out.diagnostics[k] as EditDiagnostic;
    if (d.code !== "LOAM-T105" || d.editId !== editId) continue;
    out.diagnostics[k] = {
      code: "LOAM-T105",
      editId,
      severity: "note",
      message: `basin rim is not closed; filled to the highest fluid-stable level instead, water surface y=${level} over ${columns} columns`,
    };
  }
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
  out.courses.push({
    editId: edit.id,
    verb: "river",
    flooded: floodedOf(edit),
    // Head-to-tail: `monotonicDescent` reports when the *last* waypoint is the
    // higher one, and the pond chain wants to walk downstream.
    samples: reversed ? [...samples].reverse() : samples,
  });
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

// ---------------------------------------------------------------------------
// Structure pads — the level-to kernel, aimed at a footprint
// ---------------------------------------------------------------------------

/** A rectangular level-to edit: flat ground under a structure, blended out. */
export interface LevelPad {
  /** Inclusive world footprint. */
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** Height the footprint is levelled to. */
  readonly targetY: number;
  /** Falloff width outside the footprint, in blocks. */
  readonly apron: number;
  /** 0..1 blend between the original field and the levelled target. Default 1. */
  readonly strength?: number;
}

/**
 * Level the field under a structure footprint, with a smooth apron.
 *
 * This is the `plateau` verb's level-to kernel with a rectangular outline
 * instead of a modulated disc: inside the footprint the field *becomes*
 * `targetY` (cut as well as fill — a building needs one floor height, not a
 * raised mound), and across the apron it eases back to whatever the terrain was
 * doing. Mutates `field` in place, exactly as the edit kernels do, because the
 * pad is composed into the master field before materialization.
 */
export function applyLevelPad(field: HeightField, pad: LevelPad): void {
  const region = field.region;
  const strength = clamp01(pad.strength ?? 1);
  if (strength === 0) return;
  const apron = Math.max(0, Math.floor(pad.apron));

  const i0 = clamp(pad.x0 - apron - region.x0, 0, region.width - 1) | 0;
  const i1 = clamp(pad.x1 + apron - region.x0, 0, region.width - 1) | 0;
  const j0 = clamp(pad.z0 - apron - region.z0, 0, region.depth - 1) | 0;
  const j1 = clamp(pad.z1 + apron - region.z0, 0, region.depth - 1) | 0;

  for (let j = j0; j <= j1; j++) {
    const z = region.z0 + j;
    const dz = z < pad.z0 ? pad.z0 - z : z > pad.z1 ? z - pad.z1 : 0;
    for (let i = i0; i <= i1; i++) {
      const x = region.x0 + i;
      const dx = x < pad.x0 ? pad.x0 - x : x > pad.x1 ? x - pad.x1 : 0;
      const d = dx === 0 && dz === 0 ? 0 : sqrt(dx * dx + dz * dz);
      if (apron > 0 && d > apron) continue;
      const f = d === 0 ? 1 : apron === 0 ? 0 : smoothstep01(clamp01((apron - d) / apron));
      if (f <= 0) continue;
      const idx = j * region.width + i;
      const h = field.values[idx] as number;
      field.values[idx] = lerp(h, pad.targetY, f * strength);
    }
  }
}
