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

import { Rng, nodeSeed, type Seed256 } from "../determinism/index.js";
import { clamp, clamp01, lerp, smoothstep01, sqrt } from "../math/index.js";
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
}

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
  const result: EditComposition = {
    markers: [],
    calderas: [],
    basins: [],
    diagnostics: [],
    order: [],
  };
  const raises = edits.filter((e) => editGroup(e.verb) === "raise");
  const carves = edits.filter((e) => editGroup(e.verb) === "carve");
  for (const edit of [...raises, ...carves]) {
    result.order.push(edit.id);
    applyEdit(field, edit, ctx, result);
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
): void {
  const strength = clamp01(edit.strength ?? 1);
  if (strength === 0) return;
  const seed = seedFor(ctx, edit);
  switch (edit.verb) {
    case "ridge":
      applyCorridorRaise(field, edit, ctx, out, strength);
      return;
    case "peak":
      applyRadialCone(field, edit, ctx, out, seed, strength, num(edit, "height", "peak"));
      return;
    case "volcano":
      applyVolcano(field, edit, ctx, out, seed, strength);
      return;
    case "plateau":
      applyPlateau(field, edit, ctx, out, seed, strength);
      return;
    case "island":
      applyRadialCone(field, edit, ctx, out, seed, strength, num(edit, "height", "island"));
      return;
    case "valley":
      applyValley(field, edit, ctx, out, strength);
      return;
    case "river":
      applyRiver(field, edit, ctx, out, strength);
      return;
    case "basin":
      applyBasin(field, edit, ctx, out, seed, strength);
      return;
  }
}

// --- raise: ridge -----------------------------------------------------------

function applyCorridorRaise(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  strength: number,
): void {
  if (!edit.course) throw new Error(`terrain.edit@0 '${edit.id}': ridge needs 'course'`);
  const samples = refineCourse(ctx.region, edit.course);
  const halfWidth = num(edit, "width", "ridge") / 2;
  const height = num(edit, "height", "ridge");
  const profile = falloffOf(edit, "ridge");
  const region = field.region;
  const b = courseBounds(region, samples, halfWidth + 1);

  let peakPoint: Point2 = samples[0] as Point2;
  let peakY = Number.NEGATIVE_INFINITY;

  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const x = region.x0 + i;
      const z = region.z0 + j;
      const { distance } = polylineDistance(x, z, samples);
      if (distance >= halfWidth) continue;
      const f = falloff(profile, 1 - distance / halfWidth);
      const idx = j * region.width + i;
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
): void {
  const verb = edit.verb;
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", verb);
  const profile = falloffOf(edit, verb);
  addRadial(field, center, radius, height * strength, profile);
  emitRadialMarkers(field, out, edit.id, center, radius);
}

/** Add `peakDelta · falloff(1 - d/radius)` to every column inside the disc. */
function addRadial(
  field: HeightField,
  center: Point2,
  radius: number,
  peakDelta: number,
  profile: FalloffProfile,
): void {
  const region = field.region;
  const b = boundsFor(region, center.x - radius, center.x + radius, center.z - radius, center.z + radius);
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const d = sqrt(dx * dx + dz * dz);
      if (d >= radius) continue;
      const f = falloff(profile, 1 - d / radius);
      const idx = j * region.width + i;
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
): void {
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", "volcano");
  const height = num(edit, "height", "volcano");
  const wantsCaldera = flag(edit, "caldera", "volcano");
  const calderaDepth = num(edit, "calderaDepth", "volcano");
  const wantsLava = flag(edit, "lava", "volcano");

  const profile = falloffOf(edit, "volcano");

  if (!wantsCaldera) {
    // A plain cone.
    addRadial(field, center, radius, height * strength, profile);
    emitRadialMarkers(field, out, edit.id, center, radius);
    return;
  }

  // Cone + caldera in one sweep. Outside the caldera radius the surface is the
  // ordinary cone; inside it, the cone is truncated at the *rim* height (so the
  // crater rim, not the axis, is the summit) and the bowl is cut below that.
  const calderaRadius = radius * CALDERA_RADIUS_FRACTION;
  const rimAdd = height * falloff(profile, 1 - calderaRadius / radius) * strength;
  const region = field.region;
  const b = boundsFor(region, center.x - radius, center.x + radius, center.z - radius, center.z + radius);
  const columns: number[] = [];
  let rimY = Number.POSITIVE_INFINITY;
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const d = sqrt(dx * dx + dz * dz);
      if (d >= radius) continue;
      const idx = j * region.width + i;
      if (d >= calderaRadius) {
        field.values[idx] =
          (field.values[idx] as number) + height * falloff(profile, 1 - d / radius) * strength;
        continue;
      }
      // Bowl: full depth at the axis, tapering to zero at the rim.
      const bowl = calderaDepth * strength * smoothstep01(1 - d / calderaRadius);
      field.values[idx] = (field.values[idx] as number) + rimAdd - bowl;
      if (d >= calderaRadius - 1.5) {
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
): void {
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", "plateau");
  const height = num(edit, "height", "plateau");
  const rim = clamp(num(edit, "rim", "plateau"), 0, radius);
  const core = radius - rim;
  const target = field.heightAt(center.x, center.z) + height;

  const region = field.region;
  const b = boundsFor(region, center.x - radius, center.x + radius, center.z - radius, center.z + radius);
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const d = sqrt(dx * dx + dz * dz);
      if (d >= radius) continue;
      const f = rim <= 0 || d <= core ? 1 : smoothstep01(clamp01((radius - d) / rim));
      const idx = j * region.width + i;
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
  strength: number,
): void {
  if (!edit.course) throw new Error(`terrain.edit@0 '${edit.id}': valley needs 'course'`);
  const samples = refineCourse(ctx.region, edit.course);
  const halfWidth = num(edit, "width", "valley") / 2;
  const depth = num(edit, "depth", "valley");
  const profile = falloffOf(edit, "valley");
  const region = field.region;
  const b = courseBounds(region, samples, halfWidth + 1);
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const { distance } = polylineDistance(region.x0 + i, region.z0 + j, samples);
      if (distance >= halfWidth) continue;
      const f = falloff(profile, 1 - distance / halfWidth);
      const idx = j * region.width + i;
      field.values[idx] = (field.values[idx] as number) - depth * f * strength;
    }
  }
  emitCourseMarkers(field, out, edit.id, samples, false);
}

// --- carve: river -----------------------------------------------------------

/**
 * `river` carves a channel whose bed sits at `seaLevel - depth`, i.e. the water
 * surface is at `seaLevel` (v0 fjord/inlet semantics — perched rivers wait for
 * fluid settling). The refined course is additionally forced to descend
 * monotonically toward its lower end, which fixes which end is the `mouth`.
 */
function applyRiver(
  field: HeightField,
  edit: TerrainEdit,
  ctx: EditContext,
  out: EditComposition,
  strength: number,
): void {
  if (!edit.course) throw new Error(`terrain.edit@0 '${edit.id}': river needs 'course'`);
  const samples = refineCourse(ctx.region, edit.course);
  const { reversed } = monotonicDescent(samples, field);
  const halfWidth = num(edit, "width", "river") / 2;
  const depth = num(edit, "depth", "river");
  const bed = ctx.seaLevel - depth;
  const profile = falloffOf(edit, "river");
  const region = field.region;
  const b = courseBounds(region, samples, halfWidth + 1);
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const { distance } = polylineDistance(region.x0 + i, region.z0 + j, samples);
      if (distance >= halfWidth) continue;
      const f = falloff(profile, 1 - distance / halfWidth);
      const idx = j * region.width + i;
      const h = field.values[idx] as number;
      if (bed >= h) continue; // already at or below the bed — never raise
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
): void {
  const center = resolveCenter(edit, ctx.region, seed);
  const radius = num(edit, "radius", "basin");
  const depth = num(edit, "depth", "basin");
  const profile = falloffOf(edit, "basin");
  const wantsWater = flag(edit, "water", "basin");

  addRadial(field, center, radius, -depth * strength, profile);
  emitRadialMarkers(field, out, edit.id, center, radius);

  if (!wantsWater) return;

  // The rim is the ring of columns just inside the basin edge. Water may only
  // be placed when that ring is fully above the intended surface *and* the
  // whole ring lies inside the region (an open rim would spill).
  const region = field.region;
  const b = boundsFor(region, center.x - radius, center.x + radius, center.z - radius, center.z + radius);
  const inside: number[] = [];
  let rimMin = Number.POSITIVE_INFINITY;
  let rimClosed =
    center.x - radius >= region.x0 &&
    center.x + radius <= region.x0 + region.width - 1 &&
    center.z - radius >= region.z0 &&
    center.z + radius <= region.z0 + region.depth - 1;
  for (let j = b.j0; j <= b.j1; j++) {
    for (let i = b.i0; i <= b.i1; i++) {
      const dx = region.x0 + i - center.x;
      const dz = region.z0 + j - center.z;
      const d = sqrt(dx * dx + dz * dz);
      if (d >= radius) continue;
      const idx = j * region.width + i;
      if (d >= radius - 2) {
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
