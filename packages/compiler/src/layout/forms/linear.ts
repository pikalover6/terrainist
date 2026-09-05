/**
 * `linear` — one street, and the town is what fronts it
 *
 * A ribbon village: one street, buildings along both sides of it, and fields
 * either end. Most settlements in the world are this shape, and before this form
 * the compiler could not make one at any size, because a `district` fills its
 * envelope edge to edge by construction.
 *
 * The construction:
 *
 * 1. **The spine.** The `corridor` when one crosses the domain — a village *on
 *    the road* is the commonest case, and this is the only form that reads it;
 *    then the `orientation` heading through the centroid; then the valley floor
 *    when the ground has real relief; then the domain's long axis.
 * 2. **Ribs.** Lanes perpendicular to the local spine heading at `blockSize`
 *    pitch, `ribDepth` columns either side, and then they stop. A rib is a dead
 *    end. At `high` density the rib ends are joined by a back lane.
 * 3. **The lot mask.** 1 within `ribDepth` of the spine or a rib, 0 elsewhere.
 *
 * The mask is the *point*. Without it the subdivision finds one enormous block
 * of leftover ground and lots its perimeter, which produces a hollow ring of
 * houses facing nothing — the failure mode this form exists to avoid, and the
 * reason `FormPlan` is richer than a `StreetGraph`. Everything outside the mask
 * is open ground and reaches the ground-treatment and scatter passes untouched:
 * fields, orchards and paddocks beside a village, which is exactly right.
 */

import type { DistrictDensity } from "@terrainist/spec/ir";

import type { Point2 } from "../frames.js";
import type { StreetSegment } from "../streets.js";
import {
  MIN_BLOCK_SPACING,
  MIN_CLIPPED_RUN,
  STREET_WIDTH,
  TRIG_15,
  TRIG_SCALE,
  connectedSegments,
  densify4,
  intersectionsOf,
  runsOf,
} from "./axial.js";
import { insideOf, walkLine } from "./radial.js";
import type { FormContext, FormResult, UrbanForm } from "./types.js";

/* -------------------------------------------------------------------------- */
/* the knobs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lot depth back from the build-to line, by density.
 *
 * The same table as `LOT_DEPTH` in `district.ts`, restated rather than imported:
 * `district.ts` sits downstream of `streets.ts`, which is downstream of the form
 * registry, so importing the value here would close a module cycle around a
 * top-level `const`. A test asserts the two tables agree, which is what keeps
 * the restatement from drifting.
 */
export const LINEAR_LOT_DEPTH: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 17,
  medium: 16,
  low: 15,
});

/**
 * The shortest quarter a ribbon can be drawn across.
 *
 * An avenue and its two verges, plus one row of lots on one side. A ribbon
 * village on a *narrow* strip is the whole idea — the requirement that bites is
 * on the **long** axis, and `draw` measures that one, because the registry's
 * `minSpan` is by definition the short one.
 */
const MIN_LINEAR_SPAN = STREET_WIDTH.avenue + 2 * 2 + 16;

/** The long axis a village needs: a spine and at least two ribs. */
export const MIN_SPINE_BLOCKS = 3;

/** Relief that makes the valley floor a better spine than the long axis. */
export const VALLEY_RELIEF = 6;

/** Blocks between valley-floor waypoints — a spine, not a contour crawl. */
const VALLEY_STRIDE = 8;

/* -------------------------------------------------------------------------- */
/* the form                                                                    */
/* -------------------------------------------------------------------------- */

/** The `linear` form. */
export const LINEAR_FORM: UrbanForm = {
  id: "linear",
  requires: {
    minSpan: MIN_LINEAR_SPAN,
    polygon: true,
    fallback: "grid",
  },
  describe:
    "A ribbon village: one street the length of the quarter, short dead-end ribs off it at block pitch, houses fronting both sides — and open ground beyond the lots, which becomes the fields and orchards a village sits in.",
  draw(ctx: FormContext): FormResult {
    return drawLinear(ctx);
  },
};

/* -------------------------------------------------------------------------- */
/* the construction                                                            */
/* -------------------------------------------------------------------------- */

function drawLinear(ctx: FormContext): FormResult {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const along = Math.max(width, depth);
  const pitch = Math.max(MIN_BLOCK_SPACING, ctx.blockSize);

  if (along < MIN_SPINE_BLOCKS * pitch) {
    return {
      ok: false,
      reason: `a ribbon village needs ${MIN_SPINE_BLOCKS * pitch} blocks along its street at blockSize ${pitch} to hold more than one rib, and this quarter is ${width} × ${depth}`,
      fix: `grow "envelope.size" along its long axis to at least ${MIN_SPINE_BLOCKS * pitch}, or lower "params.blockSize" so more than one rib fits`,
      fallback: "grid",
    };
  }

  const inside = insideOf(ctx);
  const adapted: string[] = [];
  const ignored: string[] = [];

  const spine = chooseSpine(ctx, adapted, ignored);
  const runs = runsOf(densify4(spine), inside);
  const line = longestRun(runs);
  if (line === undefined) {
    return {
      ok: false,
      reason: `no run of the village street longer than ${MIN_CLIPPED_RUN} cells survives the clip of this ${width} × ${depth} cell`,
      fix: "nothing to change in the document: a cell this shape has no line to string a village along",
      fallback: "grid",
    };
  }
  if (runs.length > 1) {
    adapted.push(`the street is cut into ${runs.length} runs by the shape of the quarter; the longest is the village`);
  }

  const segments: StreetSegment[] = [
    { id: "spine", kind: "avenue", width: STREET_WIDTH.avenue, path: line },
  ];

  /* -- ribs -------------------------------------------------------------- */

  const ribDepth = 2 * LINEAR_LOT_DEPTH[ctx.density] + ctx.sidewalk + 4;
  let ribs = 0;
  for (let i = pitch >> 1; i < line.length; i += pitch) {
    const at = line[i] as Point2;
    const perp = perpendicularAt(line, i);
    const raw: Point2[] = [];
    for (let d = -ribDepth; d <= ribDepth; d++) {
      raw.push({ x: at.x + perp.x * d, z: at.z + perp.z * d });
    }
    const cut = runsOf(densify4(raw), inside);
    for (const [r, run] of cut.entries()) {
      segments.push({
        id: r === 0 ? `rib${pad2(ribs)}` : `rib${pad2(ribs)}_${r}`,
        kind: "lane",
        width: STREET_WIDTH.lane,
        path: run,
      });
    }
    ribs += 1;
  }
  if (ribs < 2) {
    adapted.push(`ribs ${ribs} (the street is shorter than two rib pitches after the clip)`);
  }

  /* -- back lanes -------------------------------------------------------- */

  if (ctx.density === "high") {
    for (const side of [-1, 1] as const) {
      const raw: Point2[] = [];
      for (const [i, at] of line.entries()) {
        const perp = perpendicularAt(line, i);
        raw.push({ x: at.x + perp.x * ribDepth * side, z: at.z + perp.z * ribDepth * side });
      }
      for (const [r, run] of runsOf(densify4(raw), inside).entries()) {
        segments.push({
          id: `back${side < 0 ? "w" : "e"}${r === 0 ? "" : `_${r}`}`,
          kind: "lane",
          width: STREET_WIDTH.lane,
          path: run,
        });
      }
    }
  }

  const kept = connectedSegments(segments, line[line.length >> 1] as Point2);
  if (kept.length < segments.length) {
    const lost = segments.length - kept.length;
    adapted.push(`dropped ${lost} rib run${lost === 1 ? "" : "s"} the street could not reach`);
  }

  /* -- the lot mask ------------------------------------------------------ */

  // Two bands, not one. `ribDepth` from the *street* is the depth of the built
  // ribbon; a rib runs to the back of that ribbon, so flooding `ribDepth` from a
  // rib as well would double the band and swallow the fields either side —
  // which is the failure this form exists to avoid, wearing a lot mask.
  const lotBand = LINEAR_LOT_DEPTH[ctx.density] + ctx.sidewalk + 2;
  const spineOnly = kept.filter((s) => s.id === "spine");
  const lotMask = frontageMask(ctx, spineOnly, ribDepth);
  orInto(lotMask, frontageMask(ctx, kept.filter((s) => s.id !== "spine"), lotBand));

  if (ctx.focus.length > 0) {
    ignored.push("focus (a ribbon village is organised about its street, not about a place)");
  }

  return {
    ok: true,
    plan: {
      graph: { segments: kept, intersections: intersectionsOf(kept), sidewalk: ctx.sidewalk },
      lotMask,
      record: { id: "linear", requested: "linear", adapted, ignored },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the spine                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The line the village is strung along, in the design's fixed order.
 *
 * Whichever source wins, the ones that lost are named — `orientation` is a hint
 * this form takes seriously, and a corridor overriding it silently would be the
 * repo's named recurring defect wearing a different hat.
 */
function chooseSpine(ctx: FormContext, adapted: string[], ignored: string[]): Point2[] {
  const { bounds } = ctx;
  const cx = Math.floor((bounds.x0 + bounds.x1) / 2);
  const cz = Math.floor((bounds.z0 + bounds.z1) / 2);
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const half = Math.ceil(Math.sqrt(width * width + depth * depth) / 2) + 2;

  if (ctx.corridor !== undefined && ctx.corridor.length >= MIN_CLIPPED_RUN) {
    adapted.push("the spine is the road corridor crossing this quarter, not a line of its own");
    if (ctx.orientation !== undefined && ctx.orientation % 360 !== 0) {
      ignored.push("orientation (the corridor crossing the quarter is the street, and it has its own heading)");
    }
    return densify4([...ctx.corridor]);
  }

  if (ctx.orientation !== undefined) {
    const entry = TRIG_15[((Math.round(ctx.orientation / 15) % 24) + 24) % 24] as readonly [number, number];
    const raw: Point2[] = [];
    for (let t = -half; t <= half; t++) {
      raw.push({
        x: cx + Math.round((t * entry[0]) / TRIG_SCALE),
        z: cz + Math.round((t * entry[1]) / TRIG_SCALE),
      });
    }
    return raw;
  }

  if (ctx.ground.relief >= VALLEY_RELIEF && !ctx.ground.levelled) {
    adapted.push(`the spine follows the valley floor (${ctx.ground.relief} blocks of relief under this quarter)`);
    return valleyFloor(ctx);
  }

  // The long axis, through the centroid.
  const raw: Point2[] = [];
  if (width >= depth) {
    for (let x = bounds.x0; x <= bounds.x1; x++) raw.push({ x, z: cz });
  } else {
    for (let z = bounds.z0; z <= bounds.z1; z++) raw.push({ x: cx, z });
  }
  return raw;
}

/**
 * The lowest line across the domain: the valley floor.
 *
 * Sampled every {@link VALLEY_STRIDE} columns along the long axis — the lowest
 * column of each cross-section, ties to the lower cross coordinate — and the
 * waypoints joined by straight runs. Sampled rather than followed column by
 * column on purpose: a village street wanders with the valley, it does not
 * trace every gully in it.
 */
function valleyFloor(ctx: FormContext): Point2[] {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const alongX = width >= depth;
  const a0 = alongX ? bounds.x0 : bounds.z0;
  const a1 = alongX ? bounds.x1 : bounds.z1;
  const c0 = alongX ? bounds.z0 : bounds.x0;
  const c1 = alongX ? bounds.z1 : bounds.x1;
  const inside = insideOf(ctx);

  const waypoints: Point2[] = [];
  for (let a = a0; a <= a1; a += VALLEY_STRIDE) {
    let best: Point2 | undefined;
    let bestHeight = Number.POSITIVE_INFINITY;
    for (let c = c0; c <= c1; c++) {
      const at = alongX ? { x: a, z: c } : { x: c, z: a };
      if (!inside(at)) continue;
      const height = ctx.ground.height(at.x, at.z);
      if (height < bestHeight) {
        bestHeight = height;
        best = at;
      }
    }
    if (best !== undefined) waypoints.push(best);
  }

  const raw: Point2[] = [];
  for (const [i, at] of waypoints.entries()) {
    if (i === 0) {
      raw.push(at);
      continue;
    }
    for (const cell of walkLine(waypoints[i - 1] as Point2, at)) raw.push(cell);
  }
  return raw;
}

/* -------------------------------------------------------------------------- */
/* the lot mask                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 1 within `ribDepth` of the street or a rib, row-major over `bounds`.
 *
 * A 4-connected multi-source flood from every centre-line cell, capped at
 * `ribDepth` — a walk rather than a radius, so ground on the far side of the
 * cell's own boundary is not lotted just because it is geometrically close.
 * ANDed with the domain mask, because the caller ANDs it with its own and two
 * different answers to "where is the village" is how a lot ends up outside it.
 */
function frontageMask(
  ctx: FormContext,
  segments: readonly StreetSegment[],
  ribDepth: number,
): Uint8Array {
  const { bounds, mask } = ctx;
  const stride = bounds.x1 - bounds.x0 + 1;
  const rows = bounds.z1 - bounds.z0 + 1;
  const out = new Uint8Array(stride * rows);
  const reach = new Int32Array(stride * rows).fill(-1);
  const queue: number[] = [];

  const index = (x: number, z: number): number => {
    if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return -1;
    const k = (z - bounds.z0) * stride + (x - bounds.x0);
    if (mask !== undefined && mask[k] !== 1) return -1;
    return k;
  };

  for (const segment of segments) {
    for (const cell of segment.path) {
      const k = index(cell.x, cell.z);
      if (k < 0 || reach[k] !== -1) continue;
      reach[k] = 0;
      out[k] = 1;
      queue.push(k);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    const d = reach[k] as number;
    if (d >= ribDepth) continue;
    const x = bounds.x0 + (k % stride);
    const z = bounds.z0 + Math.floor(k / stride);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = index(x + dx, z + dz);
      if (n < 0 || reach[n] !== -1) continue;
      reach[n] = d + 1;
      out[n] = 1;
      queue.push(n);
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* small shared pieces                                                         */
/* -------------------------------------------------------------------------- */

/** OR one mask into another, in place. */
function orInto(into: Uint8Array, from: Uint8Array): void {
  for (let k = 0; k < into.length; k++) if (from[k] === 1) into[k] = 1;
}

/** The unit perpendicular to the local heading at index `i` of a path. */
function perpendicularAt(path: readonly Point2[], i: number): Point2 {
  const before = path[Math.max(0, i - 1)] as Point2;
  const after = path[Math.min(path.length - 1, i + 1)] as Point2;
  const dx = Math.sign(after.x - before.x);
  const dz = Math.sign(after.z - before.z);
  if (dx === 0 && dz === 0) return { x: 1, z: 0 };
  // A quarter turn, the convention `headingOf` uses: the perpendicular of a
  // north-south street points east.
  return { x: -dz, z: dx };
}

/** The longest run, ties to the earliest — a fixed choice, so a stable spine. */
function longestRun(runs: readonly Point2[][]): Point2[] | undefined {
  let best: Point2[] | undefined;
  for (const run of runs) {
    if (best === undefined || run.length > best.length) best = run;
  }
  return best;
}

/** Two digits, so segment ids sort the way they were drawn. */
function pad2(k: number): string {
  return k < 10 ? `0${k}` : `${k}`;
}
