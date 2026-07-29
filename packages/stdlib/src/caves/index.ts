/**
 * `cave.carver@0` — seeded underground cave systems.
 *
 * The carver is **subtractive and post-field**: it never touches the
 * heightfield, never moves a column's surface, and never places a block. All it
 * produces is, per column, a list of interior air spans — plus the handful of
 * columns where an entrance mouth is allowed to break daylight, and a marker
 * for each of those. That shape is what keeps the field golden hashes and the
 * top-surface invariant intact by construction rather than by inspection.
 *
 * ## Water safety is structural, not checked
 *
 * Every carve, everywhere, goes through one gate: `bandLo[idx] … bandHi[idx]`,
 * a per-column band computed once, before any worm takes a step. The band is
 * empty for a column within {@link CAVE_FLUID_SHELL} of any water or lava
 * column, and it never reaches at or below `seaLevel` for a column within
 * {@link CAVE_OCEAN_KEEPOUT} of the ocean mask. A worm cannot violate the shell
 * rule because there is no code path that carves outside the band — the
 * compiler's recomputed assertion is a second opinion, not the mechanism.
 *
 * ## Determinism
 *
 * Systems, worms and steps are drawn in a fixed order from the node's `carve`
 * stream (§6.3); the wander field is a pinned fBm keyed on world position, so
 * two runs agree bit for bit. Spans are merged at the end, which makes the
 * result independent of the order the spheres were added in.
 */

import { Rng, seed32, streamSeed, type Seed256 } from "../determinism/index.js";
import { TAU, cos, sin, sqrt } from "../math/index.js";
import { fbm2 } from "../noise/index.js";
import type { Region } from "../field/index.js";
import type { Marker } from "../edits/index.js";

/** Minimum horizontal distance a cave keeps from any water or lava column. */
export const CAVE_FLUID_SHELL = 4;

/** Horizontal reach of the ocean keep-out, inside which nothing is cut at or below sea level. */
export const CAVE_OCEAN_KEEPOUT = 8;

/** Rock left between a cave ceiling and the surface, away from an entrance. */
export const CAVE_ROOF_THICKNESS = 4;

/** Lowest Y a cave may occupy: one above the bedrock floor. */
export const CAVE_FLOOR_Y = -63;

/** Steps between chamber opportunities along a worm. */
const CHAMBER_INTERVAL = 44;

/** Region area, in blocks, that carries one cave system at `density: 1`. */
const AREA_PER_SYSTEM = 9_000;

/** Hard cap on systems, so a big region with `density: 1` still terminates. */
const MAX_SYSTEMS = 64;

/** Slope (degrees) above which a hillside is too steep for an entrance mouth. */
export const ENTRANCE_MAX_SLOPE = 26;

/** How close to the surface a cave must already run to be worth opening. */
export const ENTRANCE_MAX_ROOF = 24;

/** Minimum spacing between two entrance mouths, in blocks. */
export const ENTRANCE_SPACING = 28;

/** `cave.carver@0` params, after defaulting. */
export interface CaveParams {
  /** 0..1 — how many worm systems the region carries. */
  readonly density: number;
  /** Spatial frequency of the field that steers the worms. */
  readonly frequency: number;
  /** `[min, max]` worm tunnel radius, in blocks. */
  readonly radius: readonly [number, number];
  /** `[yMin, yMax]` absolute world Y band the systems live in. */
  readonly yRange: readonly [number, number];
  /** 0..1 — how much the worms climb and dive. */
  readonly verticality: number;
  /** Ellipsoid chambers opened at junctions along the worms. */
  readonly chambers: {
    readonly count: number;
    readonly radius: number;
    readonly chance: number;
  };
  /** Number of daylight mouths to force. `true`/`false` normalize to 1/0. */
  readonly entrances: number;
  /** Whether the compiler dresses the caves (dripstone, moss, mushrooms). */
  readonly decorate: boolean;
}

/** The `cave.carver@0` defaults. */
export const CAVE_DEFAULTS: CaveParams = Object.freeze({
  density: 0.3,
  frequency: 0.012,
  radius: [2, 5] as readonly [number, number],
  yRange: [-32, 48] as readonly [number, number],
  verticality: 0.3,
  chambers: Object.freeze({ count: 3, radius: 8, chance: 0.4 }),
  entrances: 0,
  decorate: true,
});

/** Raw (validated but undefaulted) cave params, as the profile hands them over. */
export interface CaveParamsInput {
  readonly density?: number;
  readonly frequency?: number;
  readonly radius?: readonly [number, number];
  readonly yRange?: readonly [number, number];
  readonly verticality?: number;
  readonly chambers?: {
    readonly count?: number;
    readonly radius?: number;
    readonly chance?: number;
  };
  readonly entrances?: number | boolean;
  readonly decorate?: boolean;
}

/** Apply the defaults of {@link CAVE_DEFAULTS} to a partial param object. */
export function resolveCaveParams(input: CaveParamsInput | undefined): CaveParams {
  const p = input ?? {};
  const entrances = p.entrances;
  return {
    density: p.density ?? CAVE_DEFAULTS.density,
    frequency: p.frequency ?? CAVE_DEFAULTS.frequency,
    radius: p.radius ?? CAVE_DEFAULTS.radius,
    yRange: p.yRange ?? CAVE_DEFAULTS.yRange,
    verticality: p.verticality ?? CAVE_DEFAULTS.verticality,
    chambers: {
      count: p.chambers?.count ?? CAVE_DEFAULTS.chambers.count,
      radius: p.chambers?.radius ?? CAVE_DEFAULTS.chambers.radius,
      chance: p.chambers?.chance ?? CAVE_DEFAULTS.chambers.chance,
    },
    entrances:
      entrances === undefined
        ? CAVE_DEFAULTS.entrances
        : typeof entrances === "boolean"
          ? entrances
            ? 1
            : 0
          : entrances,
    decorate: p.decorate ?? CAVE_DEFAULTS.decorate,
  };
}

/**
 * Per-column interior air spans, in CSR form.
 *
 * Column `idx` owns entries `offsets[idx] … offsets[idx + 1] - 1`; each entry
 * is an inclusive `[lo[k], hi[k]]` run of air. Spans of one column are sorted
 * ascending and never touch or overlap — two spans one block apart leave a real
 * one-block rock slab between them, which is what lets the dripstone pass treat
 * `lo - 1` and `hi + 1` as solid without re-deriving anything.
 */
export interface CaveSpans {
  readonly offsets: Int32Array;
  readonly lo: Int32Array;
  readonly hi: Int32Array;
}

/** Everything {@link carveCaves} reads. */
export interface CaveCarveRequest {
  readonly region: Region;
  /** The cave node's seed (§6.2). */
  readonly seed: Seed256;
  readonly params: CaveParams;
  /** Top solid block per column. */
  readonly ground: Int32Array;
  /** 1 where the column holds water or lava — ocean, lake, river pool, caldera. */
  readonly fluid: Uint8Array;
  /** 1 where the column is sea. */
  readonly oceanMask: Uint8Array;
  /** Slope in degrees per column, for the entrance rule. */
  readonly slopes: Float64Array;
  readonly seaLevel: number;
  /** Node path, so markers carry a stable id. */
  readonly nodeId: string;
}

/** What one cave node carved. */
export interface CaveCarveResult {
  readonly spans: CaveSpans;
  /** 1 for a column whose entrance mouth reaches or passes the surface. */
  readonly entranceColumns: Uint8Array;
  /** One `cave_mouth` marker per opened entrance. */
  readonly markers: readonly Marker[];
  /** Blocks of stone removed. */
  readonly carvedBlocks: number;
  /** Worm systems actually placed. */
  readonly systems: number;
  /** Chambers actually opened. */
  readonly chambers: number;
  /** Per-column carve band, exposed so the validator can re-derive the shell rule. */
  readonly bandLo: Int32Array;
  readonly bandHi: Int32Array;
}

/** An empty span set, for a region no cave node touched. */
export function emptyCaveSpans(columns: number): CaveSpans {
  return { offsets: new Int32Array(columns + 1), lo: new Int32Array(0), hi: new Int32Array(0) };
}

/** True when `(idx, y)` falls inside a carved span. */
export function caveAirAt(spans: CaveSpans, idx: number, y: number): boolean {
  const end = spans.offsets[idx + 1] as number;
  for (let k = spans.offsets[idx] as number; k < end; k++) {
    if (y >= (spans.lo[k] as number) && y <= (spans.hi[k] as number)) return true;
  }
  return false;
}

/** Total air blocks a span set holds. */
export function caveVolume(spans: CaveSpans): number {
  let total = 0;
  for (let k = 0; k < spans.lo.length; k++) {
    total += (spans.hi[k] as number) - (spans.lo[k] as number) + 1;
  }
  return total;
}

/**
 * Carve one `cave.carver@0` node.
 *
 * Pure: same request in, byte-identical spans out.
 */
export function carveCaves(request: CaveCarveRequest): CaveCarveResult {
  const { region, params, ground, slopes, seaLevel } = request;
  const n = region.width * region.depth;

  const { bandLo, bandHi } = carveBands(request);

  /** Accumulating spans, keyed by column. Merged at the end. */
  const acc = new Map<number, number[]>();

  const rng = Rng.forStream(request.seed, "carve");
  const wanderSeed = seed32(streamSeed(request.seed, "carve.wander"));
  const girthSeed = seed32(streamSeed(request.seed, "carve.girth"));

  const systemTarget = systemCount(params.density, n);
  let systems = 0;
  let chambers = 0;

  for (let s = 0; s < systemTarget; s++) {
    const origin = pickOrigin(rng, region, bandLo, bandHi);
    if (origin === null) continue;
    systems++;
    // Two or three worms leave every system origin, so a system reads as a
    // branching network rather than one lonely pipe.
    const worms = rng.int(2, 3);
    for (let w = 0; w < worms; w++) {
      chambers += runWorm({
        rng,
        region,
        params,
        bandLo,
        bandHi,
        acc,
        wanderSeed,
        girthSeed,
        origin,
        chambersLeft: params.chambers.count - chambers,
      });
    }
  }

  // --- entrances -----------------------------------------------------------
  const entranceColumns = new Uint8Array(n);
  const markers: Marker[] = [];
  if (params.entrances > 0 && acc.size > 0) {
    openEntrances({
      request,
      acc,
      bandLo,
      bandHi,
      entranceColumns,
      markers,
      ground,
      slopes,
      seaLevel,
    });
  }

  const spans = flatten(acc, n);
  return {
    spans,
    entranceColumns,
    markers,
    carvedBlocks: caveVolume(spans),
    systems,
    chambers,
    bandLo,
    bandHi,
  };
}

/* -------------------------------------------------------------------------- */
/* the carve band — where the water-safety rule actually lives                 */
/* -------------------------------------------------------------------------- */

/**
 * The per-column band `[bandLo, bandHi]` a worm may cut inside.
 *
 * `bandHi < bandLo` means "this column is closed", which is how the fluid shell
 * is expressed: dilate the fluid mask by {@link CAVE_FLUID_SHELL} and close
 * every column it covers. The ocean keep-out is a *floor* rather than a
 * closure, because a hillside eight blocks inland may still hold a cave well
 * above the waterline.
 */
export function carveBands(request: {
  readonly region: Region;
  readonly params: CaveParams;
  readonly ground: Int32Array;
  readonly fluid: Uint8Array;
  readonly oceanMask: Uint8Array;
  readonly seaLevel: number;
}): { bandLo: Int32Array; bandHi: Int32Array } {
  const { region, params, ground, fluid, oceanMask, seaLevel } = request;
  const n = region.width * region.depth;
  const nearFluid = dilate(fluid, region.width, region.depth, CAVE_FLUID_SHELL);
  const nearOcean = dilate(oceanMask, region.width, region.depth, CAVE_OCEAN_KEEPOUT);

  const bandLo = new Int32Array(n);
  const bandHi = new Int32Array(n);
  const yMin = Math.max(params.yRange[0], CAVE_FLOOR_Y);
  const yMax = params.yRange[1];

  for (let idx = 0; idx < n; idx++) {
    if (nearFluid[idx] === 1) {
      bandLo[idx] = 1;
      bandHi[idx] = 0;
      continue;
    }
    const lo = nearOcean[idx] === 1 ? Math.max(yMin, seaLevel + 1) : yMin;
    const hi = Math.min(yMax, (ground[idx] as number) - CAVE_ROOF_THICKNESS);
    bandLo[idx] = lo;
    bandHi[idx] = hi;
  }
  return { bandLo, bandHi };
}

/** Chebyshev dilation of a 0/1 mask by `r`, via two separable max passes. */
export function dilate(mask: Uint8Array, width: number, depth: number, r: number): Uint8Array {
  if (r <= 0) return Uint8Array.from(mask);
  const rows = new Uint8Array(mask.length);
  for (let j = 0; j < depth; j++) {
    const base = j * width;
    for (let i = 0; i < width; i++) {
      const lo = Math.max(0, i - r);
      const hi = Math.min(width - 1, i + r);
      let hit = 0;
      for (let k = lo; k <= hi; k++) {
        if (mask[base + k] === 1) {
          hit = 1;
          break;
        }
      }
      rows[base + i] = hit;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < depth; j++) {
    const lo = Math.max(0, j - r);
    const hi = Math.min(depth - 1, j + r);
    for (let i = 0; i < width; i++) {
      let hit = 0;
      for (let k = lo; k <= hi; k++) {
        if (rows[k * width + i] === 1) {
          hit = 1;
          break;
        }
      }
      out[j * width + i] = hit;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* worms                                                                       */
/* -------------------------------------------------------------------------- */

/** How many systems a region of `columns` columns carries at this density. */
export function systemCount(density: number, columns: number): number {
  if (density <= 0) return 0;
  return Math.min(MAX_SYSTEMS, Math.max(1, Math.round((density * columns) / AREA_PER_SYSTEM)));
}

/** A system origin: an open column and a Y inside its band. */
interface Origin {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Draw a system origin, rejecting closed columns.
 *
 * Rejection sampling rather than "collect the open columns and pick one":
 * building that list is O(region) per system and, more to the point, its
 * *order* would then decide which cave you get, which makes an unrelated change
 * to the band computation reroll every world.
 */
function pickOrigin(
  rng: Rng,
  region: Region,
  bandLo: Int32Array,
  bandHi: Int32Array,
): Origin | null {
  for (let attempt = 0; attempt < 128; attempt++) {
    const i = rng.int(0, region.width - 1);
    const j = rng.int(0, region.depth - 1);
    const idx = j * region.width + i;
    const lo = bandLo[idx] as number;
    const hi = bandHi[idx] as number;
    if (hi < lo) continue;
    return { x: region.x0 + i, y: rng.int(lo, hi), z: region.z0 + j };
  }
  return null;
}

interface WormRun {
  readonly rng: Rng;
  readonly region: Region;
  readonly params: CaveParams;
  readonly bandLo: Int32Array;
  readonly bandHi: Int32Array;
  readonly acc: Map<number, number[]>;
  readonly wanderSeed: number;
  readonly girthSeed: number;
  readonly origin: Origin;
  readonly chambersLeft: number;
}

/**
 * Walk one worm and carve it. Returns the number of chambers it opened.
 *
 * The walk is a 3-D drunkard's walk whose *bearing* is steered by a low-
 * frequency fBm sampled at the worm's own position: the noise gives the tunnel
 * a coherent large-scale direction (so a system trends somewhere rather than
 * scribbling), and a small per-step gaussian gives it the local wobble that
 * makes it read as rock rather than as a pipe. Pitch is bounded by
 * `verticality`, which is the difference between a spaghetti cave and a level
 * gallery.
 */
function runWorm(run: WormRun): number {
  const { rng, region, params, bandLo, bandHi, acc, wanderSeed, girthSeed, origin } = run;
  const [rMin, rMax] = params.radius;
  const maxPitch = params.verticality * 0.9;
  const steps = rng.int(90, 220);

  let x = origin.x;
  let y = origin.y;
  let z = origin.z;
  let yaw = rng.float() * TAU;
  let pitch = (rng.float() * 2 - 1) * maxPitch;
  let opened = 0;

  for (let step = 0; step < steps; step++) {
    const drift = fbm2(wanderSeed, x * params.frequency, z * params.frequency, {
      octaves: 3,
      frequency: 1,
      lacunarity: 2,
      gain: 0.5,
    });
    yaw += drift * 0.55 + rng.gaussian() * 0.12;
    pitch = clamp(pitch + drift * 0.18 + rng.gaussian() * 0.06, -maxPitch, maxPitch);

    const girth = fbm2(girthSeed, x * 0.05, z * 0.05, {
      octaves: 2,
      frequency: 1,
      lacunarity: 2,
      gain: 0.5,
    });
    const radius = rMin + (rMax - rMin) * clamp(0.5 + 0.5 * girth, 0, 1);

    carveSphere(acc, region, bandLo, bandHi, x, y, z, radius, 1);

    if (
      run.chambersLeft - opened > 0 &&
      step > 0 &&
      step % CHAMBER_INTERVAL === 0 &&
      rng.float() < params.chambers.chance
    ) {
      // A chamber is an oblate ellipsoid: wide, and about two-thirds as tall,
      // which is what a real solution cavern looks like and, incidentally, what
      // keeps it from punching through the roof of a shallow system.
      carveSphere(acc, region, bandLo, bandHi, x, y, z, params.chambers.radius, 0.62);
      opened++;
    }

    const horizontal = cos(pitch);
    x = Math.round(x + cos(yaw) * horizontal * 1.6);
    z = Math.round(z + sin(yaw) * horizontal * 1.6);
    y = Math.round(y + sin(pitch) * 1.6);

    // Leaving the region or the band's reach ends the run rather than sliding
    // along the wall: a worm pinned to an edge makes a trench, not a cave.
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 1 || j < 1 || i >= region.width - 1 || j >= region.depth - 1) break;
    const idx = j * region.width + i;
    const lo = bandLo[idx] as number;
    const hi = bandHi[idx] as number;
    if (hi < lo) break;
    y = clamp(y, lo, hi);
  }
  return opened;
}

/**
 * Carve a sphere (or a `flatten`-squashed ellipsoid) into the span accumulator.
 *
 * Every column's contribution is clipped to that column's band before it is
 * recorded, so nothing outside the band can ever enter the accumulator.
 */
function carveSphere(
  acc: Map<number, number[]>,
  region: Region,
  bandLo: Int32Array,
  bandHi: Int32Array,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  flattenY: number,
): void {
  const r = Math.max(1, radius);
  const ri = Math.ceil(r);
  for (let dz = -ri; dz <= ri; dz++) {
    const j = cz + dz - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let dx = -ri; dx <= ri; dx++) {
      const i = cx + dx - region.x0;
      if (i < 0 || i >= region.width) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      const idx = j * region.width + i;
      const lo = bandLo[idx] as number;
      const hi = bandHi[idx] as number;
      if (hi < lo) continue;
      const half = sqrt(r * r - d2) * flattenY;
      const y0 = Math.max(lo, Math.ceil(cy - half));
      const y1 = Math.min(hi, Math.floor(cy + half));
      if (y1 < y0) continue;
      push(acc, idx, y0, y1);
    }
  }
}

function push(acc: Map<number, number[]>, idx: number, lo: number, hi: number): void {
  let list = acc.get(idx);
  if (list === undefined) {
    list = [];
    acc.set(idx, list);
  }
  list.push(lo, hi);
}

/* -------------------------------------------------------------------------- */
/* entrances                                                                   */
/* -------------------------------------------------------------------------- */

interface EntranceRun {
  readonly request: CaveCarveRequest;
  readonly acc: Map<number, number[]>;
  readonly bandLo: Int32Array;
  readonly bandHi: Int32Array;
  readonly entranceColumns: Uint8Array;
  readonly markers: Marker[];
  readonly ground: Int32Array;
  readonly slopes: Float64Array;
  readonly seaLevel: number;
}

/**
 * Open up to `params.entrances` mouths where the network already runs close to
 * a gentle hillside.
 *
 * "Gentle" is the whole rule. A mouth punched into a cliff face is a hole in a
 * wall; a mouth on a shallow slope reads as a cave entrance, and — the reason
 * it matters mechanically — it can be walked into. Candidates are ranked by how
 * little rock has to come out, ties broken by column index, so the choice does
 * not depend on `Map` iteration order or on the worm that happened to get there
 * first.
 */
function openEntrances(run: EntranceRun): void {
  const { request, acc, bandLo, bandHi, entranceColumns, markers, ground, slopes, seaLevel } = run;
  const { region, params } = request;

  const candidates: { idx: number; roof: number; top: number }[] = [];
  for (const [idx, list] of acc) {
    if ((bandHi[idx] as number) < (bandLo[idx] as number)) continue;
    const g = ground[idx] as number;
    if (g <= seaLevel + 2) continue;
    const slope = slopes[idx] as number;
    if (!(slope < ENTRANCE_MAX_SLOPE)) continue;
    let top = Number.NEGATIVE_INFINITY;
    for (let k = 1; k < list.length; k += 2) {
      if ((list[k] as number) > top) top = list[k] as number;
    }
    const roof = g - top;
    if (roof > ENTRANCE_MAX_ROOF) continue;
    candidates.push({ idx, roof, top });
  }
  candidates.sort((a, b) => (a.roof !== b.roof ? a.roof - b.roof : a.idx - b.idx));

  const taken: { x: number; z: number }[] = [];
  for (const candidate of candidates) {
    if (markers.length >= params.entrances) break;
    const i = candidate.idx % region.width;
    const j = (candidate.idx - i) / region.width;
    const x = region.x0 + i;
    const z = region.z0 + j;
    if (taken.some((t) => Math.abs(t.x - x) < ENTRANCE_SPACING && Math.abs(t.z - z) < ENTRANCE_SPACING)) {
      continue;
    }
    carveMouth(run, x, z, candidate.top);
    taken.push({ x, z });
    markers.push({
      id: `${request.nodeId}.cave_mouth`,
      name: "cave_mouth",
      x,
      z,
      y: ground[candidate.idx] as number,
    });
  }
}

/**
 * Cut the mouth itself: a short, slightly flared shaft from the cave roof to
 * daylight.
 *
 * This is the one place the `ground - CAVE_ROOF_THICKNESS` cap is lifted — and
 * only the cap. The fluid shell and the ocean keep-out still apply, and every
 * column the mouth actually opens to the sky is recorded in `entranceColumns`,
 * which is what the top-surface lint checks its exceptions against.
 */
function carveMouth(run: EntranceRun, x: number, z: number, top: number): void {
  const { request, acc, bandLo, bandHi, entranceColumns, ground } = run;
  const { region } = request;
  for (let dz = -2; dz <= 2; dz++) {
    const j = z + dz - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let dx = -2; dx <= 2; dx++) {
      const i = x + dx - region.x0;
      if (i < 0 || i >= region.width) continue;
      if (dx * dx + dz * dz > 5) continue;
      const idx = j * region.width + i;
      // Closed columns stay closed: a mouth may not tunnel toward water.
      if ((bandHi[idx] as number) < (bandLo[idx] as number)) continue;
      const lo = Math.max(bandLo[idx] as number, Math.min(top, (ground[idx] as number) - 1));
      const hi = ground[idx] as number;
      if (hi < lo) continue;
      push(acc, idx, lo, hi);
      entranceColumns[idx] = 1;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* flattening                                                                  */
/* -------------------------------------------------------------------------- */

/** Sort, merge and pack the accumulator into {@link CaveSpans}. */
function flatten(acc: Map<number, number[]>, columns: number): CaveSpans {
  const offsets = new Int32Array(columns + 1);
  const perColumn = new Map<number, number[]>();

  for (const [idx, list] of acc) {
    const pairs: [number, number][] = [];
    for (let k = 0; k < list.length; k += 2) {
      pairs.push([list[k] as number, list[k + 1] as number]);
    }
    pairs.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
    const merged: number[] = [];
    for (const [lo, hi] of pairs) {
      const last = merged.length;
      // Touching runs merge: `hi + 1 === lo` means no rock between them, and a
      // zero-thickness slab is not something the dripstone pass could attach to.
      if (last > 0 && lo <= (merged[last - 1] as number) + 1) {
        if (hi > (merged[last - 1] as number)) merged[last - 1] = hi;
        continue;
      }
      merged.push(lo, hi);
    }
    perColumn.set(idx, merged);
  }

  let total = 0;
  for (let idx = 0; idx < columns; idx++) {
    offsets[idx] = total;
    total += (perColumn.get(idx)?.length ?? 0) / 2;
  }
  offsets[columns] = total;

  const lo = new Int32Array(total);
  const hi = new Int32Array(total);
  for (let idx = 0; idx < columns; idx++) {
    const merged = perColumn.get(idx);
    if (merged === undefined) continue;
    let k = offsets[idx] as number;
    for (let m = 0; m < merged.length; m += 2) {
      lo[k] = merged[m] as number;
      hi[k] = merged[m + 1] as number;
      k++;
    }
  }
  return { offsets, lo, hi };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
