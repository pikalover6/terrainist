/**
 * `grown` — no plan at all: a town that accreted (`docs/URBAN-FORMS-v0.md` §3.3).
 *
 * An old town has no through-streets. It has a market, a few routes that were
 * there before the houses, and then two centuries of somebody building across
 * the end of somebody else's lane. What that produces is not a wobbly grid — it
 * is a graph of **T-junctions**, blocks of wildly different sizes, few
 * crossroads, and no line of sight longer than a couple of blocks.
 *
 * The construction is recursive splitting of the domain, which produces exactly
 * that and is deterministic, terminating and **connected by construction**:
 *
 * 1. Start with one region, the domain's bounding box.
 * 2. A region whose longer axis is above {@link splitFloor} is split by a single
 *    street across it. The split position is `0.5 ± r` with `r` drawn from the
 *    region's own positional hash in `[0.08, 0.30]`, clamped so neither half is
 *    thinner than {@link GROWN_MIN_HALF_NUM}/{@link GROWN_HALF_DEN} of a block;
 *    the street's heading is perpendicular to the split axis, jittered by one
 *    15° step with probability ⅓.
 * 3. Recurse into both halves, left first. Depth is bounded at
 *    {@link GROWN_MAX_DEPTH}, and a region below the floor terminates.
 * 4. Every split street is cut to the mask by `runsOf` and emitted. A split
 *    street spans the region it split — with a small overrun at each end, so a
 *    jittered street still lands **on** its parent's centre line — and that
 *    region's boundary is either the domain edge or a parent split street, so
 *    the union is connected. `boundaryEndpoints` and the inter-district road
 *    pass depend on that.
 * 5. Width class: the first {@link GROWN_AVENUE_SPLITS} splits are avenues, the
 *    rest streets, and the split of a region whose shorter axis is under
 *    1.4 · `blockSize` is a lane.
 * 6. The first split intersection is reserved as the market at `medium` and
 *    `high` density.
 *
 * `grown` and `organic` are both "not a grid", and keeping both is a deliberate
 * cost the design states: `organic` is a grid that has been let go of and is
 * frozen output; `grown` is the real thing.
 *
 * **Terrain: none.** A grown town on a slope is `terraced`'s job, and the
 * orientation of a city cell is not a frame this form has anything to align to —
 * both are named in `FormRecord.ignored` rather than silently dropped.
 */

import { positionInt, streamSeed } from "@terrainist/stdlib";

import type { Point2, Rect } from "../frames.js";
import type { StreetIntersection, StreetSegment } from "../streets.js";
import {
  MIN_BLOCK_SPACING,
  MIN_CLIPPED_RUN,
  MIN_DISTRICT_SPAN,
  STREET_WIDTH,
  TRIG_15,
  connectedSegments,
  densify4,
  intersectionsOf,
  runsOf,
} from "./axial.js";
import { insideOf, walkLine } from "./radial.js";
import type { FormContext, FormResult, FormReservation, UrbanForm } from "./types.js";

/* -------------------------------------------------------------------------- */
/* the knobs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Slack on the two-block split floor, in percent of `2 · blockSize`.
 *
 * Negative, and that is the whole reason the number is named: the floor is what
 * bounds a **leaf** region, so a positive slack would leave blocks up to
 * `2.3 · blockSize` across and put the block-size distribution outside the
 * `[0.6, 1.8] · blockSize` band §8.2 asserts. At −10 % a leaf's long axis is
 * under `1.8 · blockSize` and, with the half floor below, neither axis is under
 * `0.7 · blockSize`. Both bounds are structural, not measured.
 */
export const GROWN_SLACK_PERCENT = -10;

/** Splits deep enough to be somebody's back lane; past this a region is a block. */
export const GROWN_MAX_DEPTH = 8;

/** The thinnest half a split may leave, as `NUM/DEN` of a block. */
export const GROWN_MIN_HALF_NUM = 7;
export const GROWN_HALF_DEN = 10;

/** Splits drawn as avenues: the routes that were there before the houses. */
export const GROWN_AVENUE_SPLITS = 2;

/** A region thinner than `NUM/DEN` of a block is split by a lane, not a street. */
export const GROWN_LANE_SPAN_NUM = 14;
export const GROWN_LANE_SPAN_DEN = 10;

/** Cells of overrun at each end of a split street, so it meets its parent. */
export const GROWN_OVERRUN = 3;

/** The smallest market worth reserving, in blocks of radius. */
export const MIN_MARKET_RADIUS = 8;

/** `r`, the split offset either side of the middle, in percent of the span. */
const SPLIT_OFFSET_MIN = 8;
const SPLIT_OFFSET_MAX = 30;

/** The three positional streams: the offset, its sign, and the heading jitter. */
const OFFSET_STREAM = "grown.split";
const SIGN_STREAM = "grown.side";
const SKEW_STREAM = "grown.skew";

/* -------------------------------------------------------------------------- */
/* the form                                                                    */
/* -------------------------------------------------------------------------- */

/** The `grown` form. */
export const GROWN_FORM: UrbanForm = {
  id: "grown",
  requires: {
    minSpan: MIN_DISTRICT_SPAN,
    polygon: true,
    // A town that will not accrete is a town that was let go of.
    fallback: "organic",
  },
  describe:
    "A town nobody planned: the domain split and split again by one street at a time, so the streets meet in T-junctions rather than crossroads, the blocks come out every size, and no line of sight runs more than a couple of blocks. A market where the first two streets crossed.",
  draw(ctx: FormContext): FormResult {
    return drawGrown(ctx);
  },
};

/* -------------------------------------------------------------------------- */
/* the construction                                                            */
/* -------------------------------------------------------------------------- */

function drawGrown(ctx: FormContext): FormResult {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const pitch = Math.max(MIN_BLOCK_SPACING, ctx.blockSize);
  const floor = splitFloor(pitch);

  if (Math.max(width, depth) < floor) {
    return {
      ok: false,
      reason: `a town accretes by splitting itself, and this quarter is ${width} × ${depth} — under the ${floor} blocks one split of a ${pitch}-block fabric needs`,
      fix: `grow "envelope.size" to at least [${floor}, ${floor}], or lower "params.blockSize" so more than one block fits`,
      fallback: "organic",
    };
  }

  const inside = insideOf(ctx);
  const adapted: string[] = [];
  const ignored: string[] = [];

  const cuts = splitTree(ctx, pitch);
  const segments: StreetSegment[] = [];
  for (const [k, cut] of cuts.entries()) {
    const kind = cutKind(k, cut, pitch);
    for (const [r, run] of runsOf(densify4(cut.path), inside).entries()) {
      segments.push({
        id: r === 0 ? `cut${pad2(k)}` : `cut${pad2(k)}_${r}`,
        kind,
        width: STREET_WIDTH[kind],
        path: run,
      });
    }
  }

  if (segments.length === 0) {
    return {
      ok: false,
      reason: `no street longer than ${MIN_CLIPPED_RUN} cells survives the clip of this ${width} × ${depth} cell`,
      fix: "nothing to change in the document: a cell this shape has no room for a town to grow in",
      fallback: "organic",
    };
  }

  const centre: Point2 = {
    x: Math.floor((bounds.x0 + bounds.x1) / 2),
    z: Math.floor((bounds.z0 + bounds.z1) / 2),
  };
  const kept = connectedSegments(segments, centre);
  if (kept.length < segments.length) {
    const lost = segments.length - kept.length;
    adapted.push(`dropped ${lost} clipped run${lost === 1 ? "" : "s"} the rest of the town could not reach`);
  }
  if (cuts.length < 2) {
    adapted.push(`splits ${cuts.length} (the quarter holds one street and no more)`);
  }

  const intersections = intersectionsOf(kept);

  /* -- the market -------------------------------------------------------- */

  const reservations: FormReservation[] = [];
  if (ctx.density !== "low") {
    const at = firstJunction(kept, intersections);
    if (at !== undefined) {
      const radius = Math.max(MIN_MARKET_RADIUS, pitch >> 2);
      reservations.push({
        rect: clampRect({ x0: at.x - radius, z0: at.z - radius, x1: at.x + radius, z1: at.z + radius }, bounds),
        why: "the market the town grew around",
      });
    }
  }

  /* -- what this form did not read --------------------------------------- */

  if (ctx.orientation !== undefined && ctx.orientation % 360 !== 0) {
    ignored.push("orientation (a town nobody planned has no frame to align to)");
  }
  if (ctx.corridor !== undefined && ctx.corridor.length > 0) {
    ignored.push("corridor (a grown town closed over its through-routes; a village on the road is \"linear\")");
  }
  if (ctx.focus.length > 0) {
    ignored.push("focus (the market is where the first two streets crossed, not a place the plan was laid about)");
  }

  return {
    ok: true,
    plan: {
      graph: { segments: kept, intersections, sidewalk: ctx.sidewalk },
      ...(reservations.length === 0 ? {} : { reservations }),
      record: { id: "grown", requested: "grown", adapted, ignored },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the recursion                                                               */
/* -------------------------------------------------------------------------- */

/** One split: the street that made it, and the region it cut in two. */
export interface GrownCut {
  readonly path: readonly Point2[];
  /** The region the split ran across, before it was cut. */
  readonly region: Rect;
  readonly depth: number;
}

/** The longer axis a region must have before it is worth splitting. */
export function splitFloor(pitch: number): number {
  return Math.round((2 * pitch * (100 + GROWN_SLACK_PERCENT)) / 100);
}

/**
 * Every split of the domain, in the order they were made.
 *
 * Depth-first, left half before right, on an explicit stack — the order is the
 * segment order, the segment order is the id order, and none of it depends on a
 * `Map` iteration or a recursion the engine could reorder. Exported so a test
 * can measure the block distribution without re-deriving the recursion.
 */
export function splitTree(ctx: FormContext, pitch: number): GrownCut[] {
  const floor = splitFloor(pitch);
  const minHalf = Math.max(1, Math.round((pitch * GROWN_MIN_HALF_NUM) / GROWN_HALF_DEN));
  const offsetSeed = streamSeed(ctx.seed, OFFSET_STREAM);
  const signSeed = streamSeed(ctx.seed, SIGN_STREAM);
  const skewSeed = streamSeed(ctx.seed, SKEW_STREAM);

  const out: GrownCut[] = [];
  const stack: { rect: Rect; depth: number }[] = [{ rect: ctx.bounds, depth: 0 }];

  while (stack.length > 0) {
    const region = stack.pop() as { rect: Rect; depth: number };
    if (region.depth >= GROWN_MAX_DEPTH) continue;
    const { rect } = region;
    const width = rect.x1 - rect.x0 + 1;
    const depth = rect.z1 - rect.z0 + 1;
    const alongX = width >= depth;
    const span = alongX ? width : depth;
    if (span < floor) continue;

    const lo = alongX ? rect.x0 : rect.z0;
    const hi = alongX ? rect.x1 : rect.z1;
    const room = span - 2 * minHalf;
    if (room < 0) continue;

    // `0.5 ± r`, r ∈ [0.08, 0.30] of the span, from the region's own hash, then
    // clamped so neither half is thinner than a fraction of a block. The clamp
    // is what keeps the leaf regions inside the size band; the hash is what
    // makes a grown town look grown.
    const percent = positionInt(offsetSeed, rect.x0, region.depth, rect.z0, SPLIT_OFFSET_MIN, SPLIT_OFFSET_MAX);
    const side = positionInt(signSeed, rect.x0, region.depth, rect.z0, 0, 1) === 0 ? -1 : 1;
    const middle = lo + (span >> 1);
    const nudged = middle + side * Math.round((percent * span) / 100);
    const at = clampInt(nudged, lo + minHalf, hi - minHalf);

    /* the street across the region, perpendicular to the split axis */
    const crossLo = (alongX ? rect.z0 : rect.x0) - GROWN_OVERRUN;
    const crossHi = (alongX ? rect.z1 : rect.x1) + GROWN_OVERRUN;
    // One 15° step of skew, one time in three: enough that two streets are
    // never quite parallel, not so much that a block becomes a sliver.
    const skew = positionInt(skewSeed, rect.x0, region.depth, rect.z0, 0, 5);
    const lean = skew === 0 ? 1 : skew === 1 ? -1 : 0;
    const drift = lean === 0 ? 0 : Math.round((lean * (crossHi - crossLo) * TAN_15_NUM) / TAN_15_DEN);
    const a = point(alongX, at - (drift >> 1), crossLo);
    const b = point(alongX, at + drift - (drift >> 1), crossHi);

    out.push({ path: walkLine(a, b), region: rect, depth: region.depth });

    const left: Rect = alongX ? { ...rect, x1: at } : { ...rect, z1: at };
    const right: Rect = alongX ? { ...rect, x0: at } : { ...rect, z0: at };
    // Pushed right-first so the left half is popped and split first.
    stack.push({ rect: right, depth: region.depth + 1 });
    stack.push({ rect: left, depth: region.depth + 1 });
  }

  return out;
}

/** `tan 15°`, as the ratio of the `TRIG_15` entry — no transcendentals. */
const TAN_15_NUM = (TRIG_15[1] as readonly [number, number])[0];
const TAN_15_DEN = (TRIG_15[1] as readonly [number, number])[1];

/** The width class of one split: avenue, street, or the lane of a thin region. */
function cutKind(index: number, cut: GrownCut, pitch: number): StreetSegment["kind"] {
  const width = cut.region.x1 - cut.region.x0 + 1;
  const depth = cut.region.z1 - cut.region.z0 + 1;
  const shortAxis = Math.min(width, depth);
  if (shortAxis * GROWN_LANE_SPAN_DEN < pitch * GROWN_LANE_SPAN_NUM) return "lane";
  return index < GROWN_AVENUE_SPLITS ? "avenue" : "street";
}

/**
 * Where the first two streets crossed.
 *
 * The earliest intersection involving the earliest surviving segment, and
 * failing that the middle of that segment: a market is on the oldest street in
 * the town, and `intersectionsOf` is already sorted row-major, so the answer is
 * one fixed cell.
 */
function firstJunction(
  segments: readonly StreetSegment[],
  intersections: readonly StreetIntersection[],
): Point2 | undefined {
  const eldest = segments[0];
  if (eldest === undefined) return undefined;
  for (const crossing of intersections) {
    if (crossing.segments.includes(eldest.id)) return { x: crossing.x, z: crossing.z };
  }
  return eldest.path[eldest.path.length >> 1];
}

/* -------------------------------------------------------------------------- */
/* small shared pieces                                                         */
/* -------------------------------------------------------------------------- */

/** `(along, cross)` in the split's frame, back in world axes. */
function point(alongX: boolean, at: number, cross: number): Point2 {
  return alongX ? { x: at, z: cross } : { x: cross, z: at };
}

function clampInt(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** A rect cut to the domain's bounding box. */
function clampRect(rect: Rect, bounds: Rect): Rect {
  return {
    x0: Math.max(rect.x0, bounds.x0),
    z0: Math.max(rect.z0, bounds.z0),
    x1: Math.min(rect.x1, bounds.x1),
    z1: Math.min(rect.z1, bounds.z1),
  };
}

/** Two digits, so segment ids sort the way they were drawn. */
function pad2(k: number): string {
  return k < 10 ? `0${k}` : `${k}`;
}
