/**
 * `radial` — everything faces one place (`docs/URBAN-FORMS-v0.md` §3.4).
 *
 * A place — a round-point, a cathedral square, a fortified gate — and everything
 * else is either running at it or running around it. It is the one plan shape a
 * grid cannot fake, because its blocks are wedges and its frontages face inward.
 *
 * The construction, in the order the design states it:
 *
 * 1. **The focus.** A `plaza`, then a named `landmark`, then the highest-weight
 *    `gate`, then the flattest column near the centroid. Projected into the mask
 *    by the same fixed spiral `open()` uses in `city.ts`.
 * 2. **The hub.** A reservation about the focus, carrying `for` when a landmark
 *    was named. A *rect*, deliberately: the disc reservation is §10.5 and is
 *    explicitly deferred, so the corners are ground the treatment pass dresses.
 * 3. **Rings.** Concentric 24-gons at `hubRadius + k · ringPitch`, cut to the
 *    mask by `runsOf` exactly as a grid line is.
 * 4. **Spokes.** Radials at a phase set by `orientation`, six of them at the hub
 *    and **doubling** at the radius where the gap between two adjacent spokes
 *    exceeds `1.5 · blockSize`. That doubling is the whole difference between a
 *    radial plan and a dartboard: without it the outer blocks are enormous
 *    wedges and the inner ones are slivers.
 *
 * No trigonometry: every ring vertex and every spoke direction comes out of
 * `TRIG_15`, and the arc gap that drives the doubling is measured as the actual
 * distance between two of those integer points rather than as `2r·sin(θ/2)`.
 *
 * Terrain is read for one thing only — seating the focus when the caller gave
 * none — and the fabric is otherwise arithmetic on the bounds, so two draws from
 * one seed are identical by construction.
 */

import type { DistrictDensity } from "@terrainist/spec";

import type { Point2, Rect } from "../frames.js";
import type { StreetSegment } from "../streets.js";
import {
  MIN_BLOCK_SPACING,
  MIN_CLIPPED_RUN,
  MIN_DISTRICT_SPAN,
  STREET_WIDTH,
  TRIG_15,
  TRIG_SCALE,
  connectedSegments,
  densify4,
  distance,
  intersectionsOf,
  runsOf,
} from "./axial.js";
import type { FormContext, FormFocus, FormResult, FormReservation, UrbanForm } from "./types.js";

/* -------------------------------------------------------------------------- */
/* the knobs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ring pitch gain, in percent — the wedge-block compensation.
 *
 * `subdivide` inscribes an axis-aligned rectangle in every block, and a wedge
 * loses area to that exactly as a rotated cell does, so `radial` grows its ring
 * pitch by the same 16 % `city.ts` applies to a rotated cell
 * (`ROTATED_BLOCK_GAIN`). Restated rather than imported because `city.ts` sits
 * downstream of the registry and importing it here would close a cycle; a test
 * asserts the two numbers agree. The real fix is a polygon lot cutter (§9.3).
 */
export const RADIAL_RING_GAIN = 116;

/** Smallest round-point worth reserving, in blocks of radius. */
export const MIN_HUB_RADIUS = 10;

/** Spokes at the hub. Six, at a 60° pitch, and every one of them an avenue. */
export const BASE_SPOKES = 6;

/** The arc gap that makes a wedge too wide to lot, as a fraction of `blockSize`. */
export const MAX_ARC_GAP_NUM = 3;
export const MAX_ARC_GAP_DEN = 2;

/** How many rings the domain must hold, beyond the hub, to be worth the plan. */
export const MIN_RINGS = 2;

/** Every Nth ring is an avenue, by density — the avenue share. */
const RING_AVENUE_EVERY: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 2,
  medium: 3,
  low: 4,
});

/** The spoke pitches, in 15° steps: 60°, then 30°, then the table's floor. */
const SPOKE_LEVELS: readonly number[] = Object.freeze([4, 2, 1]);

/* -------------------------------------------------------------------------- */
/* the form                                                                    */
/* -------------------------------------------------------------------------- */

/** The `radial` form. */
export const RADIAL_FORM: UrbanForm = {
  id: "radial",
  requires: {
    // The real requirement is `6 · blockSize`, which depends on the request and
    // so cannot live in this static table; `draw` measures it and says so. What
    // is static is that a radial quarter is still a quarter.
    minSpan: MIN_DISTRICT_SPAN,
    polygon: true,
    // A small radial ambition reads better as a huddle than as a grid.
    fallback: "grown",
  },
  describe:
    "Everything faces one place: a round-point or a square, concentric ring streets about it, and radial avenues running at it — the spokes doubling as they go out, so the outer blocks stay the size of a block instead of becoming enormous wedges.",
  draw(ctx: FormContext): FormResult {
    return drawRadial(ctx);
  },
};

/* -------------------------------------------------------------------------- */
/* the construction                                                            */
/* -------------------------------------------------------------------------- */

function drawRadial(ctx: FormContext): FormResult {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const span = Math.min(width, depth);
  const adapted: string[] = [];

  // The ring pitch is fitted to the quarter, not taken from `blockSize`.
  //
  // A radial plan is a *proportion* — a round-point, then rings out to the
  // edge — and the thing that has to fit is six of them across the short axis.
  // Taking the pitch from `ctx.blockSize` instead asks the quarter to be six
  // times a number chosen by density, which the arterial-first city never
  // satisfies: measured on a baroque-capital world, every one of eight cells
  // was 75–231 columns against a demand of 258–420, so `radial` announced a
  // fallback eight times out of eight and never drew. A form whose refusal is
  // certain is not a form. Below `blockSize` the rings simply come closer
  // together, which is what a small round-point quarter looks like anyway.
  const pitch = Math.max(MIN_BLOCK_SPACING, Math.min(ctx.blockSize, Math.floor(span / 6)));

  if (span < 6 * MIN_BLOCK_SPACING) {
    return {
      ok: false,
      reason: `a round-point plus two ring streets needs ${6 * MIN_BLOCK_SPACING} blocks on the short axis even at the tightest ring pitch, and this quarter is ${width} × ${depth}`,
      fix: `grow "envelope.size" to at least [${6 * MIN_BLOCK_SPACING}, ${6 * MIN_BLOCK_SPACING}] — below that there is no room for a round-point and two rings, whatever the block size`,
      fallback: "grown",
    };
  }
  if (pitch < ctx.blockSize) {
    adapted.push(`ring pitch ${ctx.blockSize} → ${pitch} (fitted to a ${width} × ${depth} quarter)`);
  }

  const inside = insideOf(ctx);
  const ignored: string[] = [];

  const seat = chooseFocus(ctx, inside, ignored);
  const focus = seat.at;

  const hubRadius = Math.max(MIN_HUB_RADIUS, pitch >> 1);
  const ringPitch = Math.max(MIN_BLOCK_SPACING, Math.round((pitch * RADIAL_RING_GAIN) / 100));
  if (ringPitch !== pitch) {
    adapted.push(`ring pitch ${pitch} → ${ringPitch} (a wedge block loses area to an axis-aligned lot cutter)`);
  }

  // Far enough to leave the domain from wherever the focus ended up.
  const maxRadius = farthestCorner(focus, bounds);
  const ringCount = Math.floor((maxRadius - hubRadius) / ringPitch);

  const point = (radius: number, step: number): Point2 => {
    const entry = TRIG_15[((step % 24) + 24) % 24] as readonly [number, number];
    return {
      x: focus.x + Math.round((radius * entry[0]) / TRIG_SCALE),
      z: focus.z + Math.round((radius * entry[1]) / TRIG_SCALE),
    };
  };

  /* -- rings ------------------------------------------------------------- */

  const avenueEvery = RING_AVENUE_EVERY[ctx.density];
  const segments: StreetSegment[] = [];
  const ringRadii: number[] = [];
  for (let k = 1; k <= ringCount; k++) {
    const radius = hubRadius + k * ringPitch;
    const raw: Point2[] = [];
    for (let step = 0; step <= 24; step++) {
      const from = point(radius, step);
      const to = point(radius, step + 1);
      for (const cell of walkLine(from, to)) raw.push(cell);
    }
    const kind: StreetSegment["kind"] = k % avenueEvery === 0 ? "avenue" : "street";
    const runs = runsOf(densify4(raw), inside);
    if (runs.length === 0) continue;
    ringRadii.push(radius);
    for (const [r, run] of runs.entries()) {
      segments.push({ id: r === 0 ? `ring${k}` : `ring${k}_${r}`, kind, width: STREET_WIDTH[kind], path: run });
    }
  }

  if (ringRadii.length < MIN_RINGS) {
    return {
      ok: false,
      reason: `only ${ringRadii.length} ring street of a ${ringPitch}-block pitch fits inside this ${width} × ${depth} quarter, and a radial plan needs ${MIN_RINGS}`,
      fix: 'lower "params.blockSize", grow "envelope.size", or move the focus off the edge of the quarter with an "at" constraint on the child it names',
      fallback: "grown",
    };
  }

  /* -- spokes ------------------------------------------------------------ */

  // A spoke is inserted at the first ring where the gap to its neighbour at the
  // pitch above has opened past 1.5 · blockSize. Measured on the ring points
  // themselves, so the number in the test and the number in the code are one
  // number and there is no trigonometry anywhere near it.
  const gapLimit = (MAX_ARC_GAP_NUM * pitch) / MAX_ARC_GAP_DEN;
  const levelStart: number[] = [];
  for (const [level, step] of SPOKE_LEVELS.entries()) {
    if (level === 0) {
      levelStart.push(hubRadius);
      continue;
    }
    const coarser = SPOKE_LEVELS[level - 1] as number;
    let start = Number.POSITIVE_INFINITY;
    for (const radius of ringRadii) {
      if (distance(point(radius, 0), point(radius, coarser)) > gapLimit) {
        start = radius;
        break;
      }
    }
    levelStart.push(start);
  }

  const phase = ((Math.round((ctx.orientation ?? 0) / 15) % 24) + 24) % 24;
  let drawnSpokes = 0;
  for (let k = 0; k < 24; k++) {
    const level = SPOKE_LEVELS.findIndex((step) => k % step === 0);
    if (level < 0) continue;
    const start = levelStart[level] as number;
    if (!Number.isFinite(start) || start > maxRadius) continue;
    const raw: Point2[] = [];
    for (let radius = start; radius <= maxRadius; radius++) raw.push(point(radius, k + phase));
    const kind: StreetSegment["kind"] = level === 0 ? "avenue" : "street";
    const runs = runsOf(densify4(raw), inside);
    for (const [r, run] of runs.entries()) {
      segments.push({
        id: r === 0 ? `spoke${pad2(k)}` : `spoke${pad2(k)}_${r}`,
        kind,
        width: STREET_WIDTH[kind],
        path: run,
      });
    }
    if (runs.length > 0) drawnSpokes += 1;
  }

  if (drawnSpokes !== BASE_SPOKES) {
    adapted.push(`spokes ${BASE_SPOKES} → ${drawnSpokes} (spokes double in at the ring where the wedge between two of them opens past 1.5 · blockSize)`);
  }
  const floored = levelStart[SPOKE_LEVELS.length - 1] as number;
  if (Number.isFinite(floored) && ringRadii.length > 0) {
    const outer = ringRadii[ringRadii.length - 1] as number;
    if (distance(point(outer, 0), point(outer, SPOKE_LEVELS[SPOKE_LEVELS.length - 1] as number)) > gapLimit) {
      adapted.push("spoke pitch floored at 15° — the outermost blocks are wider than 1.5 · blockSize");
    }
  }

  /* -- keep what a road can reach ---------------------------------------- */

  const kept = connectedSegments(segments, focus);
  if (kept.length < segments.length) {
    adapted.push(`dropped ${segments.length - kept.length} clipped run${segments.length - kept.length === 1 ? "" : "s"} the rest of the plan could not reach`);
  }
  if (kept.length === 0) {
    return {
      ok: false,
      reason: `no ring or spoke longer than ${MIN_CLIPPED_RUN} cells survives the clip of this ${width} × ${depth} cell`,
      fix: "nothing to change in the document: a cell this shape cannot hold a round-point, and an unplanned quarter is drawn instead",
      fallback: "grown",
    };
  }

  /* -- the hub ----------------------------------------------------------- */

  const hub: FormReservation = {
    rect: clampRect({ x0: focus.x - hubRadius, z0: focus.z - hubRadius, x1: focus.x + hubRadius, z1: focus.z + hubRadius }, bounds),
    ...(seat.for === undefined ? {} : { for: seat.for }),
    why: `the round-point at the head of ${drawnSpokes} radials`,
  };

  if (ctx.corridor !== undefined && ctx.corridor.length > 0) {
    ignored.push("corridor (a radial plan is organised about its focus, not about a route across it)");
  }

  return {
    ok: true,
    plan: {
      graph: { segments: kept, intersections: intersectionsOf(kept), sidewalk: ctx.sidewalk },
      reservations: [hub],
      record: { id: "radial", requested: "radial", adapted, ignored },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the focus                                                                   */
/* -------------------------------------------------------------------------- */

/** Where the plan is about, and the child that gets the hub if one named it. */
interface RadialSeat {
  readonly at: Point2;
  readonly for?: string;
}

/**
 * The focus, in the design's fixed order, projected into the mask.
 *
 * Every focus the plan does not use is named in `ignored` — a `terminus` or a
 * `water` focus is a real input, and silently dropping one is the defect this
 * repo names in the contract itself.
 */
function chooseFocus(ctx: FormContext, inside: (p: Point2) => boolean, ignored: string[]): RadialSeat {
  const chosen =
    ctx.focus.find((f) => f.kind === "plaza") ??
    ctx.focus.find((f) => f.kind === "landmark") ??
    bestGate(ctx.focus);

  for (const other of ctx.focus) {
    if (other === chosen) continue;
    if (other.kind === "terminus" || other.kind === "water") {
      ignored.push(`focus "${other.kind}" (a radial plan is seated on a plaza, a landmark or a gate)`);
    }
  }

  if (chosen !== undefined) {
    const at = project(chosen.at, inside);
    return chosen.kind === "landmark" && chosen.id !== undefined ? { at, for: chosen.id } : { at };
  }
  return { at: project(flattestNearCentre(ctx, inside), inside) };
}

/** The highest-weight `gate`; ties break to the earlier entry, as given. */
function bestGate(focus: readonly FormFocus[]): FormFocus | undefined {
  let best: FormFocus | undefined;
  for (const f of focus) {
    if (f.kind !== "gate") continue;
    if (best === undefined || f.weight > best.weight) best = f;
  }
  return best;
}

/**
 * The flattest column within a third of the short axis of the centroid.
 *
 * The only terrain `radial` reads, and it reads it for one reason: a round-point
 * on a slope needs a different level on every ring. Sampled on a fixed lattice
 * in row-major order, so a tie always breaks to the same column.
 */
function flattestNearCentre(ctx: FormContext, inside: (p: Point2) => boolean): Point2 {
  const { bounds } = ctx;
  const cx = Math.floor((bounds.x0 + bounds.x1) / 2);
  const cz = Math.floor((bounds.z0 + bounds.z1) / 2);
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const reach = Math.floor(Math.min(width, depth) / 3);
  // The centroid is the baseline and only a *strictly* flatter column beats it,
  // so ground with no slope to speak of seats the round-point in the middle of
  // the quarter rather than in whichever corner the lattice happened to visit
  // first. On flat ground this form is symmetric, and it should look it.
  let best: Point2 = { x: cx, z: cz };
  let bestSlope = ctx.ground.slope(cx, cz);
  for (let dz = -reach; dz <= reach; dz += 4) {
    for (let dx = -reach; dx <= reach; dx += 4) {
      const at = { x: cx + dx, z: cz + dz };
      if (!inside(at)) continue;
      const slope = ctx.ground.slope(at.x, at.z);
      if (slope < bestSlope) {
        bestSlope = slope;
        best = at;
      }
    }
  }
  return best;
}

/** The nearest column inside the domain, in the fixed spiral `open()` walks. */
function project(at: Point2, inside: (p: Point2) => boolean): Point2 {
  if (inside(at)) return at;
  for (let radius = 1; radius <= 48; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const candidate = { x: at.x + dx, z: at.z + dz };
        if (inside(candidate)) return candidate;
      }
    }
  }
  return at;
}

/* -------------------------------------------------------------------------- */
/* shared geometry                                                             */
/* -------------------------------------------------------------------------- */

/** Is this column inside the domain — bounds, and the mask when there is one? */
export function insideOf(ctx: FormContext): (p: Point2) => boolean {
  const { bounds, mask } = ctx;
  const stride = bounds.x1 - bounds.x0 + 1;
  return (p: Point2): boolean => {
    if (p.x < bounds.x0 || p.x > bounds.x1 || p.z < bounds.z0 || p.z > bounds.z1) return false;
    if (mask === undefined) return true;
    return mask[(p.z - bounds.z0) * stride + (p.x - bounds.x0)] === 1;
  };
}

/**
 * The cells of the straight line `a → b`, endpoints included.
 *
 * Sampled at `max(|dx|, |dz|)` steps, so two consecutive samples differ by at
 * most one on each axis and `densify4` can make the whole polyline 4-connected
 * in one pass. Integer arithmetic; no `atan2`, no Bresenham state machine.
 */
export function walkLine(a: Point2, b: Point2): Point2[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  if (steps === 0) return [a];
  const out: Point2[] = [];
  for (let t = 0; t <= steps; t++) {
    out.push({ x: a.x + Math.round((dx * t) / steps), z: a.z + Math.round((dz * t) / steps) });
  }
  return out;
}

/** The farthest bounds corner from a point, rounded up. */
function farthestCorner(at: Point2, bounds: Rect): number {
  let best = 0;
  for (const x of [bounds.x0, bounds.x1]) {
    for (const z of [bounds.z0, bounds.z1]) best = Math.max(best, distance(at, { x, z }));
  }
  return Math.ceil(best);
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
