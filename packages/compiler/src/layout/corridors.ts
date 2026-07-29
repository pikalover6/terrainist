/**
 * Route corridors — Loam v0.2 §4.9.6, substage 3b.
 *
 * A corridor is the answer to an ordering problem the language creates on
 * purpose. `along: "main_street"` is a placement statement, and placement is
 * pass 3; but a street is *routed* in pass 6, over ground that does not exist
 * until pass 5 has cut every building pad into it. Something has to stand for
 * the street while the buildings are being placed, and it has to be something
 * the router is then not allowed to move out from under them.
 *
 * That something is a **polygon in the horizontal plane plus a coarse
 * centreline inside it**, constructed once here and *frozen*: later passes may
 * move a centreline within its corridor and may never widen, shorten or
 * re-topologize it. Buildings snap to the corridor; the road wiggles inside it.
 *
 * Two sources register corridors, and §4.4 `course` is explicit that they are
 * the same object to the solver — "a river, a ridge and a main street":
 *
 * 1. **Course-bearing terrain features.** `terrain.edit@0` running `river`,
 *    `ridge` or `valley` has already refined and meandered its centreline by
 *    the time the solver runs, and `EditComposition.courses` carries it. No
 *    approximation is involved: this is the line the ground was cut along.
 * 2. **`road.network@0.corridors()`.** §7.5 requires this to work from
 *    `anchors` and `pattern` alone, with no placed geometry — which is a real
 *    constraint, because at 3b nothing is placed. What *is* available before
 *    placement is each anchor's coarse target point (§4.9.3: the jittered
 *    `zone` cell centre, or the `at` fraction), so that is what the coarse
 *    centreline is strung through. See {@link roadCorridors} for the honest
 *    limits of that.
 *
 * ### What the corridor is used for, in order
 *
 * - **3d/3e**: a structure that straddles a corridor pays a soft cost
 *   proportional to how much of its footprint sits in the reservation, so
 *   buildings drift off the future lane instead of standing in it.
 * - **3d**: `along` / `beside` measure their lateral offset, their side and
 *   their `at` position against the corridor — never against a centreline,
 *   which is the thing that is still allowed to move.
 * - **pass 6**: the road router gets a *discount* inside its own corridor. A
 *   discount and not a wall: the corridor was drawn from coarse anchor points
 *   before anyone knew where the ground was hard, and forcing a lane through a
 *   cliff to honour a guess made at 3b would be the corridor mechanism doing
 *   more harm than the ordering problem it fixes.
 */

import type { Region } from "@terrainist/stdlib";

import { clampInt, intersectRect, type Frame, type Point2, type Rect } from "./frames.js";

/** How wide a corridor is when nothing declares a width. */
export const DEFAULT_CORRIDOR_WIDTH = 7;

/**
 * Soft cost, in frame-normalized units, charged for a footprint that lies
 * *entirely* inside a route corridor.
 *
 * Scaled by the fraction of the footprint actually inside, so a building that
 * clips a lane's edge pays a little and one parked across it pays all of it.
 * The number is deliberately of the same order as a `zone` miss of a third of
 * the frame: enough to move a house that has anywhere else to go, not enough to
 * beat a hard constraint or a genuinely better piece of ground.
 */
export const CORRIDOR_RESERVATION_COST = 0.35;

/** A frozen route corridor (§4.9.6). */
export interface RouteCorridor {
  /** `"world.lanes"` for a road node, `"world.terrain.the_river"` for a course. */
  readonly nodePath: string;
  /** The leaf id an `along` selector names: `"lanes"`, `"the_river"`. */
  readonly id: string;
  /** Where the corridor came from — `road.network@0`, or a course verb. */
  readonly kind: "road" | "course";
  /** `river` / `ridge` / `valley`, for a course corridor. */
  readonly verb?: string;
  /** The coarse centreline, in world columns, head to tail. */
  readonly centerline: readonly Point2[];
  /** Half the corridor's width: the polygon is the centreline buffered by this. */
  readonly halfWidth: number;
  /** Bounding rectangle of the polygon — the cheap rejection test. */
  readonly bounds: Rect;
  /** Total centreline length in blocks, for normalizing an `at` position. */
  readonly length: number;
  /**
   * Node paths whose coarse points the centreline was strung through.
   *
   * They are exempt from the reservation cost, and they have to be: a road
   * corridor *ends at its anchors*, so charging an anchor for standing where
   * its own corridor starts is the reservation fining a building for being the
   * reason the street exists.
   */
  readonly anchors: readonly string[];
}

/** The nearest point of a corridor's centreline to a column. */
export interface CorridorHit {
  /** Distance from the column to the centreline, in blocks. */
  readonly distance: number;
  /** Distance from the column to the corridor's *edge*; 0 inside it. */
  readonly clearance: number;
  /** Normalized arclength position of the closest point, 0..1. */
  readonly position: number;
  /** Unit-ish tangent of the segment the closest point lies on. */
  readonly tangent: Point2;
  /** Closest point on the centreline. */
  readonly closest: Point2;
  /**
   * Which side of the line the column is on, in the direction of travel:
   * `1` for left, `-1` for right, `0` on it.
   *
   * "Left" is the standard screen-space handedness for Minecraft's axes: with
   * north at −Z and east at +X, the left of a traveller heading north (0, −1)
   * is west (−1, 0), and the cross product `t.x·dz − t.z·dx` is negative there.
   */
  readonly side: -1 | 0 | 1;
}

/* -------------------------------------------------------------------------- */
/* construction                                                                */
/* -------------------------------------------------------------------------- */

/** A course record, as `EditComposition.courses` carries it. */
export interface CourseSource {
  readonly editId: string;
  readonly verb: string;
  readonly samples: readonly Point2[];
  /** The cut's declared width, when the edit named one. */
  readonly width?: number;
}

/**
 * Register one corridor per course-bearing terrain feature.
 *
 * The centreline is **subsampled**, not simplified: a refined course is one
 * sample per block of arclength, and a corridor is queried once per candidate
 * placement per node, so keeping every sample would make the solver quadratic
 * in region size for no geometric gain. Every {@link CORRIDOR_SAMPLE_STRIDE}-th
 * sample plus the last one keeps the polyline within half a stride of the real
 * curve, which is well inside a corridor half-width.
 */
export function corridorsFromCourses(
  courses: readonly CourseSource[],
  ownerPath: string,
): RouteCorridor[] {
  const out: RouteCorridor[] = [];
  for (const course of courses) {
    const line = subsample(course.samples);
    if (line.length < 2) continue;
    const width = course.width !== undefined && course.width > 0 ? course.width : DEFAULT_CORRIDOR_WIDTH;
    out.push(
      makeCorridor({
        nodePath: `${ownerPath}.${course.editId}`,
        id: course.editId,
        kind: "course",
        verb: course.verb,
        centerline: line,
        halfWidth: Math.max(1, Math.round(width / 2)),
      }),
    );
  }
  return out;
}

/** One anchor `road.network@0.corridors()` may string its coarse line through. */
export interface RoadCorridorAnchor {
  readonly nodePath: string;
  /** The node's coarse target point, from its `zone` / `at` constraint. */
  readonly point: Point2;
}

/**
 * `road.network@0.corridors()` — §7.5's substage-3b contract.
 *
 * The method is required to work from `anchors` and `pattern` alone, "with no
 * placed geometry available", and this implementation takes that literally: the
 * only pre-placement position a node has is the coarse target point its `zone`
 * or `at` constraint seeds the search from (§4.9.4), so those are the anchors
 * and there is nothing else on offer.
 *
 * ### The honest limits
 *
 * - A node with **no coarse constraint** has no pre-placement point at all and
 *   contributes no anchor. A network whose anchors are all like that registers
 *   no corridor, which is the truthful answer: there is nothing to reserve.
 * - `pattern` is not read. The coarse line is a **chain through the anchors in
 *   nodePath order** — one polyline, not a graph. `grid`, `radial` and
 *   `ribbon` would each reserve a different shape, and reserving the wrong one
 *   is worse than reserving the spine every pattern has.
 * - The corridor is deliberately **wider than the lane**: `width` blocks of
 *   carriageway plus a margin, because the pass-6 route is allowed to wander
 *   inside the polygon and a reservation the width of the tarmac would leave it
 *   nowhere to wander.
 */
export function roadCorridors(
  nodePath: string,
  anchors: readonly RoadCorridorAnchor[],
  laneWidth: number,
  frame: Frame,
): RouteCorridor[] {
  if (anchors.length < 2) return [];
  const line = anchors.map((a) => ({
    x: clampInt(a.point.x, frame.x0, frame.x0 + frame.width - 1),
    z: clampInt(a.point.z, frame.z0, frame.z0 + frame.depth - 1),
  }));
  const id = (nodePath.split(".").pop() as string) || nodePath;
  return [
    makeCorridor({
      nodePath,
      id,
      kind: "road",
      centerline: dedupe(line),
      halfWidth: Math.max(2, Math.round(laneWidth / 2) + ROAD_CORRIDOR_MARGIN),
      anchors: anchors.map((a) => a.nodePath),
    }),
  ].filter((c) => c.centerline.length >= 2);
}

/** Blocks of slack either side of a lane, so a pass-6 route can wander. */
export const ROAD_CORRIDOR_MARGIN = 3;

/** Every {@link CORRIDOR_SAMPLE_STRIDE}-th sample of a refined course is kept. */
export const CORRIDOR_SAMPLE_STRIDE = 8;

function subsample(samples: readonly Point2[]): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i < samples.length; i += CORRIDOR_SAMPLE_STRIDE) {
    out.push(round(samples[i] as Point2));
  }
  const last = samples[samples.length - 1];
  if (last !== undefined) out.push(round(last));
  return dedupe(out);
}

function round(p: Point2): Point2 {
  return { x: Math.floor(p.x), z: Math.floor(p.z) };
}

function dedupe(points: readonly Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.x === p.x && prev.z === p.z) continue;
    out.push(p);
  }
  return out;
}

function makeCorridor(spec: {
  nodePath: string;
  id: string;
  kind: "road" | "course";
  verb?: string;
  centerline: readonly Point2[];
  halfWidth: number;
  anchors?: readonly string[];
}): RouteCorridor {
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  let length = 0;
  for (const [i, p] of spec.centerline.entries()) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
    if (i === 0) continue;
    const q = spec.centerline[i - 1] as Point2;
    length += Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z));
  }
  return {
    nodePath: spec.nodePath,
    id: spec.id,
    kind: spec.kind,
    ...(spec.verb === undefined ? {} : { verb: spec.verb }),
    centerline: spec.centerline,
    halfWidth: spec.halfWidth,
    anchors: spec.anchors ?? [],
    bounds: {
      x0: x0 - spec.halfWidth,
      z0: z0 - spec.halfWidth,
      x1: x1 + spec.halfWidth,
      z1: z1 + spec.halfWidth,
    },
    length,
  };
}

/* -------------------------------------------------------------------------- */
/* queries                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The nearest point of a corridor's centreline to `(x, z)`, with everything
 * `along` needs read off the same walk: distance, edge clearance, normalized
 * position, tangent and side.
 *
 * One pass over the segments, `Math.sqrt` only (§6.5 rule 6 forbids the
 * transcendentals; `sqrt` is IEEE-exact and therefore fine).
 */
export function corridorHit(corridor: RouteCorridor, x: number, z: number): CorridorHit {
  const line = corridor.centerline;
  let best = Number.POSITIVE_INFINITY;
  let bestClosest: Point2 = line[0] as Point2;
  let bestTangent: Point2 = { x: 1, z: 0 };
  let bestRun = 0;
  let run = 0;

  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Point2;
    const b = line[i] as Point2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const segLen = Math.sqrt(len2);
    let t = len2 === 0 ? 0 : ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + t * dx;
    const cz = a.z + t * dz;
    const d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
    if (d < best) {
      best = d;
      bestClosest = { x: cx, z: cz };
      bestTangent = segLen === 0 ? { x: 1, z: 0 } : { x: dx / segLen, z: dz / segLen };
      bestRun = run + t * segLen;
    }
    run += segLen;
  }

  const cross = bestTangent.x * (z - bestClosest.z) - bestTangent.z * (x - bestClosest.x);
  return {
    distance: best,
    clearance: Math.max(0, best - corridor.halfWidth),
    position: corridor.length === 0 ? 0 : bestRun / corridor.length,
    tangent: bestTangent,
    closest: bestClosest,
    side: cross > 0 ? -1 : cross < 0 ? 1 : 0,
  };
}

/** True when a column lies inside the corridor polygon. */
export function insideCorridor(corridor: RouteCorridor, x: number, z: number): boolean {
  if (x < corridor.bounds.x0 || x > corridor.bounds.x1) return false;
  if (z < corridor.bounds.z0 || z > corridor.bounds.z1) return false;
  return corridorHit(corridor, x, z).distance <= corridor.halfWidth;
}

/**
 * How many of a rectangle's columns lie inside the corridor polygon.
 *
 * Bounded by the intersection with the corridor's bounding box first, so a
 * footprint nowhere near the corridor costs one rectangle test rather than an
 * area's worth of polyline queries.
 */
export function corridorOverlap(corridor: RouteCorridor, rect: Rect): number {
  const clipped = intersectRect(corridor.bounds, rect);
  if (clipped === null) return 0;
  let count = 0;
  for (let z = clipped.z0; z <= clipped.z1; z++) {
    for (let x = clipped.x0; x <= clipped.x1; x++) {
      if (corridorHit(corridor, x, z).distance <= corridor.halfWidth) count++;
    }
  }
  return count;
}

/**
 * The corridor reservation as a column mask over `region` — what the pass-6
 * road router discounts inside.
 */
export function corridorMask(region: Region, corridors: readonly RouteCorridor[]): Uint8Array {
  const mask = new Uint8Array(region.width * region.depth);
  for (const corridor of corridors) {
    const clipped = intersectRect(corridor.bounds, {
      x0: region.x0,
      z0: region.z0,
      x1: region.x0 + region.width - 1,
      z1: region.z0 + region.depth - 1,
    });
    if (clipped === null) continue;
    for (let z = clipped.z0; z <= clipped.z1; z++) {
      for (let x = clipped.x0; x <= clipped.x1; x++) {
        if (corridorHit(corridor, x, z).distance > corridor.halfWidth) continue;
        mask[(z - region.z0) * region.width + (x - region.x0)] = 1;
      }
    }
  }
  return mask;
}

/**
 * Resolve an `along` / `beside` target selector to a registered corridor.
 *
 * Matched on the **leaf id** — `"^.main_street"`, `"world.terrain.the_river"`
 * and `"the_river"` all name the same thing — and on the full node path, with
 * `@terrain:` stripped so `{"beside": "@terrain:river"}` finds a river course
 * by verb. Ties resolve to the first corridor in registration order, which is
 * document order.
 */
export function resolveCorridor(
  target: string,
  corridors: readonly RouteCorridor[],
): RouteCorridor | null {
  const raw = target.trim();
  const bare = raw.startsWith("@terrain:") ? raw.slice("@terrain:".length) : raw;
  const withoutPort = bare.split("#")[0] as string;
  const stripped = withoutPort.startsWith("^.") ? withoutPort.slice(2) : withoutPort;
  const leaf = stripped.includes(".") ? (stripped.split(".").pop() as string) : stripped;
  return (
    corridors.find((c) => c.nodePath === stripped) ??
    corridors.find((c) => c.id === leaf) ??
    corridors.find((c) => c.verb === leaf) ??
    null
  );
}
