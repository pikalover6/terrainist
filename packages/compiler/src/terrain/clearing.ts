/**
 * The settlement clearing — why a village is not a hole punched in a forest.
 *
 * The scatter pass keeps trees off *claimed* ground: footprints, clearance,
 * road corridors. That is enough to stop a tree growing through a wall and not
 * nearly enough to make a settlement read as one. The first village compile put
 * closed canopy hard against every gable: from above the houses were invisible,
 * and from ground level the place looked less like a village than like something
 * the forest had swallowed. Real settlements clear their ground — people fell
 * the trees they build among, and keep felling them — so the wood does not stop
 * at the wall, it stops well short of it and then thins out over a good distance.
 *
 * This module computes that. The **hull** is the convex hull of every placed
 * footprint plus the plaza, grown by {@link CLEARING_MARGIN}: inside it, no tree
 * at all. Outside it, tree eligibility ramps from 0 back to 1 over
 * {@link CLEARING_FEATHER} blocks, so the treeline feathers instead of standing
 * up as a wall around a clean-edged disc.
 *
 * Two things it deliberately does **not** do:
 *
 * - it does not touch undergrowth. A cleared settlement is a lived-in meadow —
 *   grass, flower patches, the odd bush — not a dirt pad. The clearing scales
 *   the scatter's acceptance probability only; every forest node's eligibility
 *   *mask*, which is what the decoration pass reads, is left alone.
 * - it does not become an occupancy claim. Occupancy means "this ground is
 *   spoken for"; the clearing is a density field, and the difference matters to
 *   every pass that reads one or the other.
 *
 * The result is a per-column multiplier, so it composes with clumping and edge
 * taper by multiplication and stays a pure function of the column.
 */

import { clamp01, gradientNoise2, type Region } from "@terrainist/stdlib";

import type { Point2, Rect } from "../layout/frames.js";
/** How far beyond the hull the total-clearing zone reaches, in blocks. */
export const CLEARING_MARGIN = 10;

/** How far past that the treeline feathers back to full density, in blocks. */
export const CLEARING_FEATHER = 12;

/**
 * Peak inward/outward wobble of the clearing boundary, in blocks.
 *
 * The hull is a convex *polygon*, and a feather of constant width around a
 * polygon is still a polygon: the first village's treeline ran in five dead
 * straight lines with visible corners, which is not how a wood meets a
 * settlement. Perturbing the distance threshold — not the hull — by a
 * low-frequency noise field bends those lines into bays and spurs without
 * costing anything: the field is a pure function of the column, so the
 * clearing stays a per-column multiplier and stays deterministic.
 *
 * ±4 blocks against a 12-block feather is roughly a third of the ramp, which
 * is enough to break every straight edge and not enough to punch a hole in the
 * clearing or to strand a tree against a wall (the margin absorbs it).
 */
const CLEARING_WOBBLE = 4;

/** Wavelength of that wobble, in blocks. */
const CLEARING_WOBBLE_WAVELENGTH = 34;

/**
 * The boundary wobble at one column, in blocks, in `[-CLEARING_WOBBLE, +…]`.
 *
 * Two octaves: the long one bends the treeline into bays, the short one at a
 * third of the amplitude keeps the resulting edge from reading as a sine wave.
 */
function clearingWobble(seed: number, x: number, z: number): number {
  const f = 1 / CLEARING_WOBBLE_WAVELENGTH;
  const a = gradientNoise2(seed, x * f, z * f);
  const b = gradientNoise2(seed ^ 0x5bd1e995, x * f * 2.7, z * f * 2.7);
  return CLEARING_WOBBLE * (a * 0.75 + b * 0.25);
}

/**
 * How close two footprints must be to belong to the same clearing, in blocks.
 *
 * One hull over *every* placement is wrong the moment a document places an
 * outlier: a watchtower on a ridge half a map away would drag the hull into a
 * long wedge and fell a corridor of forest between the tower and the town, which
 * is not what a watchtower does to a wood. Single-linkage clustering at this
 * distance gives the town one clearing and the tower its own glade, which is
 * both what the eye expects and what the brief asks for.
 */
const CLEARING_LINK_DISTANCE = 56;

/** A point of the hull polygon — canonical {@link Point2}, aliased for clearing hull domain intent. */
export type HullPoint = Point2;
/** What {@link buildSettlementClearing} produced. */
export interface SettlementClearing {
  /** One convex hull per cluster, each in polygon order. */
  readonly hulls: readonly (readonly HullPoint[])[];
  /** Per-column tree-density multiplier in `0..1`, row-major over the region. */
  readonly density: Float32Array;
  /** Columns fully cleared (multiplier exactly 0). */
  readonly clearedColumns: number;
}

/**
 * The convex hull of a set of points, as a counter-clockwise polygon.
 *
 * Andrew's monotone chain: sort lexicographically, sweep the lower hull then the
 * upper. Integer inputs and an integer cross product mean no floating-point
 * tie-breaking, so the hull is bit-identical across engines.
 */
export function convexHull(points: readonly HullPoint[]): HullPoint[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x));
  const build = (source: readonly HullPoint[]): HullPoint[] => {
    const out: HullPoint[] = [];
    for (const p of source) {
      while (out.length >= 2 && cross(out[out.length - 2] as HullPoint, out[out.length - 1] as HullPoint, p) <= 0) {
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  return [...lower, ...upper];
}

function cross(o: HullPoint, a: HullPoint, b: HullPoint): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

/**
 * Distance from `(x, z)` to a convex polygon: `0` inside, the distance to the
 * nearest edge outside.
 *
 * Insideness is the standard "left of every counter-clockwise edge" test, which
 * is exact for the integer hulls this module builds.
 */
export function distanceToHull(hull: readonly HullPoint[], x: number, z: number): number {
  if (hull.length === 0) return Number.POSITIVE_INFINITY;
  if (hull.length === 1) {
    const p = hull[0] as HullPoint;
    return Math.hypot(x - p.x, z - p.z);
  }

  let inside = true;
  let best = Number.POSITIVE_INFINITY;
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k] as HullPoint;
    const b = hull[(k + 1) % hull.length] as HullPoint;
    if (cross(a, b, { x, z }) < 0) inside = false;
    best = Math.min(best, segmentDistance(x, z, a, b));
  }
  return inside ? 0 : best;
}

function segmentDistance(x: number, z: number, a: HullPoint, b: HullPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(x - a.x, z - a.z);
  let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
}

/**
 * Build the clearing field for a set of placed footprints.
 *
 * `rects` are the *placed* footprints — every building and the plaza. Fewer than
 * three distinct corners cannot bound an area, so the hull degenerates to a
 * point or a segment and the distance test above still does the right thing:
 * a lone building clears a disc around itself.
 */
export function buildSettlementClearing(
  region: Region,
  rects: readonly Rect[],
  wobbleSeed = 0,
): SettlementClearing {
  const density = new Float32Array(region.width * region.depth).fill(1);
  if (rects.length === 0) return { hulls: [], density, clearedColumns: 0 };

  const reach = CLEARING_MARGIN + CLEARING_FEATHER;
  // The wobble can push a column up to CLEARING_WOBBLE blocks *closer* to the
  // hull than its true distance, so the sweep has to look that much further
  // out or the treeline would clip flat against the old polygon again.
  const sweepReach = reach + CLEARING_WOBBLE;
  const hulls: HullPoint[][] = [];

  for (const group of clusterRects(rects)) {
    const corners: HullPoint[] = [];
    for (const r of group) {
      corners.push(
        { x: r.x0, z: r.z0 },
        { x: r.x1, z: r.z0 },
        { x: r.x0, z: r.z1 },
        { x: r.x1, z: r.z1 },
      );
    }
    const hull = convexHull(corners);
    hulls.push(hull);

    // Only the band within margin + feather of a hull can be anything but 1, so
    // each sweep is bounded by that cluster's bounding box grown by the reach,
    // rather than by the region.
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const p of hull.length === 0 ? corners : hull) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }

    const i0 = Math.max(0, Math.floor(minX - sweepReach) - region.x0);
    const i1 = Math.min(region.width - 1, Math.ceil(maxX + sweepReach) - region.x0);
    const j0 = Math.max(0, Math.floor(minZ - sweepReach) - region.z0);
    const j1 = Math.min(region.depth - 1, Math.ceil(maxZ + sweepReach) - region.z0);

    for (let j = j0; j <= j1; j++) {
      const z = region.z0 + j;
      for (let i = i0; i <= i1; i++) {
        const x = region.x0 + i;
        const raw = distanceToHull(hull, x, z);
        if (raw >= sweepReach) continue;
        // Inside the hull the distance is exactly 0 and the wobble is not
        // allowed to rescue a tree: `raw > 0` keeps "no canopy inside the
        // hull" a structural property rather than a probable one.
        const d = raw > 0 && wobbleSeed !== 0 ? raw + clearingWobble(wobbleSeed, x, z) : raw;
        const f = clamp01((d - CLEARING_MARGIN) / CLEARING_FEATHER);
        const idx = j * region.width + i;
        // Clusters may overlap; the clearer of the two wins, so a column between
        // two neighbouring hulls is never *less* cleared than either says.
        if (f < (density[idx] as number)) density[idx] = f;
      }
    }
  }

  let cleared = 0;
  for (let k = 0; k < density.length; k++) if (density[k] === 0) cleared++;

  return { hulls, density, clearedColumns: cleared };
}

/**
 * Single-linkage clustering of footprints at {@link CLEARING_LINK_DISTANCE}.
 *
 * Union-find over rectangle-to-rectangle distance, walked in the caller's order
 * (document order, via the solver) so the clusters and their contents are
 * reproducible. The distance is between the *rectangles*, not their centres: two
 * long halls a wall apart are neighbours however far their midpoints are.
 */
export function clusterRects(rects: readonly Rect[]): Rect[][] {
  const parent = rects.map((_, k) => k);
  const find = (k: number): number => {
    let root = k;
    while ((parent[root] as number) !== root) root = parent[root] as number;
    for (let n = k; n !== root; ) {
      const next = parent[n] as number;
      parent[n] = root;
      n = next;
    }
    return root;
  };

  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      if (rectDistance(rects[a] as Rect, rects[b] as Rect) > CLEARING_LINK_DISTANCE) continue;
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    }
  }

  const groups = new Map<number, Rect[]>();
  for (let k = 0; k < rects.length; k++) {
    const root = find(k);
    let group = groups.get(root);
    if (group === undefined) {
      group = [];
      groups.set(root, group);
    }
    group.push(rects[k] as Rect);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, g]) => g);
}

/** Gap between two axis-aligned rectangles; 0 when they touch or overlap. */
function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
  const dz = Math.max(0, Math.max(a.z0 - b.z1, b.z0 - a.z1));
  return Math.hypot(dx, dz);
}
