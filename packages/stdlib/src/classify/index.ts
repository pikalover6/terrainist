/**
 * Surface classification and markers.
 *
 * Turns a composed heightfield into (a) a per-column slope grid, (b) a
 * per-column surface class per the terrain profile's rules, and (c) the three
 * heightfield markers `highest_point`, `largest_flat`, `coast_points`.
 *
 * Block/biome selection is deliberately *not* here — that is G2b's
 * materialization pass. This module hands it exactly the fields it needs.
 */

import { atan, toDegrees } from "../math/index.js";
import type { ClassifyParams, HeightField } from "../field/index.js";
import { footprintHas, type BasinWater, type FeatureFootprint, type Marker } from "../edits/index.js";

// ---------------------------------------------------------------------------
// Surface classes
// ---------------------------------------------------------------------------

/** Per-column surface class. Values are stable and safe to store in a `Uint8Array`. */
export const SurfaceClass = Object.freeze({
  /** Below sea level — `@ground.underwater`. */
  UNDERWATER: 0,
  /** Within `beachWidth` of sea level — `@ground.beach`. */
  BEACH: 1,
  /** Slope ≥ `cliffThreshold` — `@ground.cliff`, no soil. */
  CLIFF: 2,
  /** Ordinary land — `@ground.surface` over `soilDepth` of `@ground.subsurface`. */
  SOIL: 3,
  /** Above the snow line — `@ground.peak` plus snow layers. */
  SNOW: 4,
  /** Bordering still fresh water (a basin pool) rather than the ocean. */
  LAKESHORE: 5,
} as const);

/** Numeric surface-class value. */
export type SurfaceClassValue = (typeof SurfaceClass)[keyof typeof SurfaceClass];

/** Human-readable names, indexed by class value. */
export const SURFACE_CLASS_NAMES: readonly string[] = Object.freeze([
  "underwater",
  "beach",
  "cliff",
  "soil",
  "snow",
  "lakeshore",
]);

// ---------------------------------------------------------------------------
// Slope
// ---------------------------------------------------------------------------

/**
 * Per-column slope in **degrees**, from central differences over the grid
 * (one-sided at the border). Slope is `atan(|∇h|)`, where the gradient is in
 * blocks of rise per block of run — so a 45° face reads as 45.
 */
export function computeSlopes(field: HeightField): Float64Array {
  const { width, depth } = field.region;
  const v = field.values;
  const out = new Float64Array(width * depth);
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      const xm = i > 0 ? (v[idx - 1] as number) : (v[idx] as number);
      const xp = i < width - 1 ? (v[idx + 1] as number) : (v[idx] as number);
      const zm = j > 0 ? (v[idx - width] as number) : (v[idx] as number);
      const zp = j < depth - 1 ? (v[idx + width] as number) : (v[idx] as number);
      const runX = (i > 0 ? 1 : 0) + (i < width - 1 ? 1 : 0);
      const runZ = (j > 0 ? 1 : 0) + (j < depth - 1 ? 1 : 0);
      const gx = runX > 0 ? (xp - xm) / runX : 0;
      const gz = runZ > 0 ? (zp - zm) / runZ : 0;
      out[idx] = toDegrees(atan(Math.sqrt(gx * gx + gz * gz)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hydrology
// ---------------------------------------------------------------------------

/** The outcome of the ocean flood-fill. */
export interface OceanMask {
  /** 1 where the column holds ocean water at sea level. */
  mask: Uint8Array;
  /** Number of `flooded: "never"` columns that had to be flooded anyway. */
  overriddenNoFlood: number;
}

/**
 * Which below-sea columns are actually ocean.
 *
 * A depression only holds sea water if the sea can reach it, so the mask is the
 * set of below-sea columns 4-connected to the **map edge** — an open fjord or
 * estuary floods; a landlocked gorge, however deep, stays dry. This is the fix
 * for "any carve below y=63 becomes a river".
 *
 * `noFlood` (from carves declaring `flooded: "never"`) blocks the fill. Blocking
 * alone would be unsound, though: a dry below-sea column touching ocean water
 * would leave that water with an exposed air face. So after the fill, any
 * blocked column adjacent to water is flooded regardless, to a fixed point, and
 * counted — `never` is honoured exactly as far as physics allows.
 */
export function computeOceanMask(
  field: HeightField,
  seaLevel: number,
  noFlood?: Uint8Array,
): OceanMask {
  const { width, depth } = field.region;
  const v = field.values;
  const n = width * depth;
  const mask = new Uint8Array(n);
  const below = (idx: number): boolean => (v[idx] as number) < seaLevel;
  const blocked = (idx: number): boolean => noFlood !== undefined && noFlood[idx] === 1;

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (idx: number): void => {
    if (mask[idx] === 1 || !below(idx) || blocked(idx)) return;
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

  // Fixed-point repair: a blocked column that borders water must flood too.
  let overriddenNoFlood = 0;
  if (noFlood !== undefined) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let idx = 0; idx < n; idx++) {
        if (mask[idx] === 1 || !below(idx) || !blocked(idx)) continue;
        const i = idx % width;
        const j = (idx - i) / width;
        const wet =
          (i > 0 && mask[idx - 1] === 1) ||
          (i < width - 1 && mask[idx + 1] === 1) ||
          (j > 0 && mask[idx - width] === 1) ||
          (j < depth - 1 && mask[idx + width] === 1);
        if (!wet) continue;
        mask[idx] = 1;
        overriddenNoFlood++;
        changed = true;
      }
    }
  }

  return { mask, overriddenNoFlood };
}

/** Columns submerged by a closed-basin pool (below its settled water surface). */
export function computeLakeMask(
  field: HeightField,
  basins: readonly BasinWater[],
): Uint8Array {
  const { width, depth } = field.region;
  const mask = new Uint8Array(width * depth);
  for (const basin of basins) {
    if (basin.waterY === null) continue;
    for (const idx of basin.columns) {
      if (idx < 0 || idx >= mask.length) continue;
      if ((field.values[idx] as number) < basin.waterY) mask[idx] = 1;
    }
  }
  return mask;
}

/**
 * Chebyshev-free 4-connected BFS distance from the set `seeds`, capped at
 * `limit`. Columns further than `limit` (or unreachable) read `limit + 1`.
 */
function distanceFrom(seeds: Uint8Array, width: number, depth: number, limit: number): Int32Array {
  const n = width * depth;
  const dist = new Int32Array(n).fill(limit + 1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let idx = 0; idx < n; idx++) {
    if (seeds[idx] === 1) {
      dist[idx] = 0;
      queue[tail++] = idx;
    }
  }
  while (head < tail) {
    const idx = queue[head++] as number;
    const d = (dist[idx] as number) + 1;
    if (d > limit) continue;
    const i = idx % width;
    const j = (idx - i) / width;
    if (i > 0) relax(idx - 1, d);
    if (i < width - 1) relax(idx + 1, d);
    if (j > 0) relax(idx - width, d);
    if (j < depth - 1) relax(idx + width, d);
  }
  return dist;

  function relax(next: number, d: number): void {
    if ((dist[next] as number) <= d) return;
    dist[next] = d;
    queue[tail++] = next;
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Extra knobs for marker extraction; all have profile-consistent defaults. */
export interface MarkerOptions {
  /** Slope (degrees) below which a column counts as "flat". Default 5. */
  flatSlopeDegrees?: number;
  /** Maximum number of `coast_points` sampled. Default 64. */
  maxCoastPoints?: number;
  /** Carve columns that asked not to be flooded (`EditComposition.noFlood`). */
  noFlood?: Uint8Array;
  /** Closed-basin pools, so their shores classify as `LAKESHORE`. */
  basins?: readonly BasinWater[];
  /** Per-edit footprints; volcano footprints suppress snow. */
  footprints?: readonly FeatureFootprint[];
}

/** The result of the classification pass. */
export interface Classification {
  /** Slope in degrees, one entry per column, row-major over the region. */
  slopes: Float64Array;
  /** Surface class per column. */
  classes: Uint8Array;
  /** Normalized relief per column: 0 at `max(seaLevel, minHeight)`, 1 at `maxHeight`. */
  relief: Float64Array;
  /** Lowest field height. */
  minHeight: number;
  /** Highest field height. */
  maxHeight: number;
  /** Absolute Y above which columns are classified `SNOW`. */
  snowLine: number;
  /**
   * 1 where the column holds ocean water at sea level — below-sea *and*
   * hydraulically connected to the map edge. The water pass must read this
   * rather than testing `height < seaLevel`.
   */
  oceanMask: Uint8Array;
  /** 1 where the column is submerged by a closed-basin pool. */
  lakeMask: Uint8Array;
  /** How many `flooded: "never"` columns had to be flooded for fluid stability. */
  overriddenNoFlood: number;
  /** `highest_point`, `largest_flat`, and one marker per sampled coast point. */
  markers: Marker[];
  /** Column count of the largest connected near-flat land area. */
  largestFlatArea: number;
}

/**
 * Classify every column and extract the heightfield markers.
 *
 * Rule order (first match wins):
 * 1. the column holds water (ocean mask, or a basin pool) → `UNDERWATER`;
 * 2. within `beachWidth` **of ocean water**, and no higher than
 *    `seaLevel + beachWidth` → `BEACH`;
 * 3. within `beachWidth` of a basin pool → `LAKESHORE`;
 * 4. slope ≥ `cliffThreshold` → `CLIFF` (and no soil);
 * 5. height ≥ snow line, and not inside a volcano footprint → `SNOW`;
 * 6. otherwise → `SOIL`.
 *
 * Rule 2's proximity test is the fix for inland depressions near sea level
 * coming out as beach: being at beach *height* is not enough, the column has to
 * actually be by the sea. Rule 5's footprint test keeps snow off a volcano —
 * a fresh cone is bare rock and ash, not an alpine summit, and the old
 * height-only rule crescented every caldera rim in white.
 *
 * The snow line sits at `base + snowLineFraction · (maxHeight - base)` with
 * `base = max(seaLevel, minHeight)` — i.e. `snowLineFraction` (default 0.8) of
 * the field's max relief, measured from sea level or from the land floor,
 * whichever is higher. A world with no relief therefore never grows a snow cap.
 * `relief` is normalized the same way: 0 at `base`, 1 at `maxHeight`.
 */
export function classify(
  field: HeightField,
  params: ClassifyParams & { seaLevel: number },
  options: MarkerOptions = {},
): Classification {
  const { width, depth } = field.region;
  const v = field.values;
  const slopes = computeSlopes(field);
  const classes = new Uint8Array(width * depth);
  const relief = new Float64Array(width * depth);

  const { min: minHeight, max: maxHeight } = field.extent();
  const seaLevel = params.seaLevel;
  // Relief is measured from the higher of sea level and the field floor, so a
  // world with no relief at all (a flat plain above sea level) has no snow line
  // rather than a snow cap at 0.8 of a meaningless span.
  const reliefBase = minHeight > seaLevel ? minHeight : seaLevel;
  const reliefSpan = maxHeight - reliefBase;
  const snowLine = reliefBase + params.snowLineFraction * (reliefSpan > 0 ? reliefSpan : 0);

  const ocean = computeOceanMask(field, seaLevel, options.noFlood);
  const oceanMask = ocean.mask;
  const lakeMask = computeLakeMask(field, options.basins ?? []);
  const beachReach = params.beachWidth;
  const oceanDistance = distanceFrom(oceanMask, width, depth, beachReach);
  const lakeDistance = distanceFrom(lakeMask, width, depth, beachReach);
  const snowFree = snowSuppressionMask(width * depth, options.footprints ?? []);

  for (let idx = 0; idx < classes.length; idx++) {
    const h = v[idx] as number;
    relief[idx] = reliefSpan > 0 ? (h - reliefBase) / reliefSpan : 0;
    if (oceanMask[idx] === 1 || lakeMask[idx] === 1) {
      classes[idx] = SurfaceClass.UNDERWATER;
    } else if (h <= seaLevel + params.beachWidth && (oceanDistance[idx] as number) <= beachReach) {
      classes[idx] = SurfaceClass.BEACH;
    } else if ((lakeDistance[idx] as number) <= beachReach) {
      classes[idx] = SurfaceClass.LAKESHORE;
    } else if ((slopes[idx] as number) >= params.cliffThreshold) {
      classes[idx] = SurfaceClass.CLIFF;
    } else if (reliefSpan > 0 && h >= snowLine && snowFree[idx] === 0) {
      classes[idx] = SurfaceClass.SNOW;
    } else {
      classes[idx] = SurfaceClass.SOIL;
    }
  }

  const markers: Marker[] = [];
  const highest = findHighestPoint(field);
  markers.push(highest);
  const flat = findLargestFlat(field, slopes, seaLevel, options.flatSlopeDegrees ?? 5);
  if (flat) markers.push(flat.marker);
  for (const m of sampleCoastPoints(field, seaLevel, options.maxCoastPoints ?? 64)) {
    markers.push(m);
  }

  return {
    slopes,
    classes,
    relief,
    minHeight,
    maxHeight,
    snowLine,
    oceanMask,
    lakeMask,
    overriddenNoFlood: ocean.overriddenNoFlood,
    markers,
    largestFlatArea: flat ? flat.area : 0,
  };
}

/** Verbs whose footprint forbids snow. */
const SNOWLESS_VERBS: readonly string[] = Object.freeze(["volcano"]);

/** 1 where a footprint forbids the snow class. */
function snowSuppressionMask(n: number, footprints: readonly FeatureFootprint[]): Uint8Array {
  const out = new Uint8Array(n);
  for (const fp of footprints) {
    if (!SNOWLESS_VERBS.includes(fp.verb)) continue;
    for (let idx = 0; idx < n; idx++) {
      if (footprintHas(fp, idx)) out[idx] = 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

/** The single highest column; ties resolve to the lowest row-major index. */
export function findHighestPoint(field: HeightField): Marker {
  const { x0, z0, width } = field.region;
  const v = field.values;
  let best = Number.NEGATIVE_INFINITY;
  let bestIdx = 0;
  for (let idx = 0; idx < v.length; idx++) {
    const h = v[idx] as number;
    if (h > best) {
      best = h;
      bestIdx = idx;
    }
  }
  return {
    id: "highest_point",
    name: "highest_point",
    x: x0 + (bestIdx % width),
    z: z0 + Math.floor(bestIdx / width),
    y: best,
  };
}

/**
 * The centroid of the largest 4-connected region of near-flat land columns.
 *
 * "Near-flat land" means `slope < flatSlopeDegrees` and height ≥ sea level.
 * Components are discovered in row-major order with an explicit queue, so the
 * traversal (and therefore the tie-break between equal-area components) is
 * fully deterministic. The returned point is the component member nearest the
 * arithmetic centroid — guaranteeing the marker is actually *on* flat ground.
 */
export function findLargestFlat(
  field: HeightField,
  slopes: Float64Array,
  seaLevel: number,
  flatSlopeDegrees: number,
): { marker: Marker; area: number } | null {
  const { x0, z0, width, depth } = field.region;
  const v = field.values;
  const n = width * depth;
  const eligible = new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    eligible[idx] =
      (v[idx] as number) >= seaLevel && (slopes[idx] as number) < flatSlopeDegrees ? 1 : 0;
  }

  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let bestArea = 0;
  let bestMembers: number[] = [];

  for (let start = 0; start < n; start++) {
    if (eligible[start] === 0 || seen[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const members: number[] = [];
    while (head < tail) {
      const idx = queue[head++] as number;
      members.push(idx);
      const i = idx % width;
      const j = (idx - i) / width;
      if (i > 0) pushIf(idx - 1);
      if (i < width - 1) pushIf(idx + 1);
      if (j > 0) pushIf(idx - width);
      if (j < depth - 1) pushIf(idx + width);
    }
    if (members.length > bestArea) {
      bestArea = members.length;
      bestMembers = members;
    }

    function pushIf(next: number): void {
      if (eligible[next] === 1 && seen[next] === 0) {
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  if (bestArea === 0) return null;

  let sumX = 0;
  let sumZ = 0;
  for (const idx of bestMembers) {
    sumX += idx % width;
    sumZ += Math.floor(idx / width);
  }
  const cx = sumX / bestArea;
  const cz = sumZ / bestArea;
  let bestIdx = bestMembers[0] as number;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const idx of bestMembers) {
    const dx = (idx % width) - cx;
    const dz = Math.floor(idx / width) - cz;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = idx;
    }
  }
  return {
    area: bestArea,
    marker: {
      id: "largest_flat",
      name: "largest_flat",
      x: x0 + (bestIdx % width),
      z: z0 + Math.floor(bestIdx / width),
      y: v[bestIdx] as number,
    },
  };
}

/**
 * A deterministic sample of the land/sea boundary: land columns (height ≥
 * `seaLevel`) with at least one 4-neighbour below sea level, collected in
 * row-major order and then strided down to at most `maxPoints`. Striding (as
 * opposed to a random subsample) keeps the points spread along the coastline
 * and independent of any RNG stream.
 */
export function sampleCoastPoints(
  field: HeightField,
  seaLevel: number,
  maxPoints: number,
): Marker[] {
  const { x0, z0, width, depth } = field.region;
  const v = field.values;
  const boundary: number[] = [];
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      if ((v[idx] as number) < seaLevel) continue;
      const wet =
        (i > 0 && (v[idx - 1] as number) < seaLevel) ||
        (i < width - 1 && (v[idx + 1] as number) < seaLevel) ||
        (j > 0 && (v[idx - width] as number) < seaLevel) ||
        (j < depth - 1 && (v[idx + width] as number) < seaLevel);
      if (wet) boundary.push(idx);
    }
  }
  if (boundary.length === 0 || maxPoints <= 0) return [];
  const stride = Math.max(1, Math.ceil(boundary.length / maxPoints));
  const out: Marker[] = [];
  for (let k = 0; k < boundary.length && out.length < maxPoints; k += stride) {
    const idx = boundary[k] as number;
    out.push({
      id: `coast_points.${out.length}`,
      name: "coast_points",
      x: x0 + (idx % width),
      z: z0 + Math.floor(idx / width),
      y: v[idx] as number,
    });
  }
  return out;
}
