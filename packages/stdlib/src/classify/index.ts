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
import type { Marker } from "../edits/index.js";

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
// Classification
// ---------------------------------------------------------------------------

/** Extra knobs for marker extraction; all have profile-consistent defaults. */
export interface MarkerOptions {
  /** Slope (degrees) below which a column counts as "flat". Default 5. */
  flatSlopeDegrees?: number;
  /** Maximum number of `coast_points` sampled. Default 64. */
  maxCoastPoints?: number;
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
  /** `highest_point`, `largest_flat`, and one marker per sampled coast point. */
  markers: Marker[];
  /** Column count of the largest connected near-flat land area. */
  largestFlatArea: number;
}

/**
 * Classify every column and extract the heightfield markers.
 *
 * Rule order (first match wins), per the terrain profile:
 * 1. height < `seaLevel` → `UNDERWATER`;
 * 2. height ≤ `seaLevel + beachWidth` → `BEACH`;
 * 3. slope ≥ `cliffThreshold` → `CLIFF` (and no soil);
 * 4. height ≥ snow line → `SNOW`;
 * 5. otherwise → `SOIL`.
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

  for (let idx = 0; idx < classes.length; idx++) {
    const h = v[idx] as number;
    relief[idx] = reliefSpan > 0 ? (h - reliefBase) / reliefSpan : 0;
    if (h < seaLevel) {
      classes[idx] = SurfaceClass.UNDERWATER;
    } else if (h <= seaLevel + params.beachWidth) {
      classes[idx] = SurfaceClass.BEACH;
    } else if ((slopes[idx] as number) >= params.cliffThreshold) {
      classes[idx] = SurfaceClass.CLIFF;
    } else if (reliefSpan > 0 && h >= snowLine) {
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
    markers,
    largestFlatArea: flat ? flat.area : 0,
  };
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
