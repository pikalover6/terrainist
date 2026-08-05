/**
 * `canal` — the primary circulation is water (`docs/URBAN-FORMS-v0.md` §3.5).
 *
 * **A canal is a street whose carriageway is water.** That is the whole idea,
 * and it is why this form is cheap: it draws the axial skeleton, *promotes*
 * some of the lines on the domain's longer axis from a street to a channel, and
 * changes nothing else. A promoted line keeps its path and its width; it takes
 * `role: "channel"`, and every pass downstream of the skeleton — blocks, lots,
 * frontage seating, the sidewalk dressing — treats it exactly as it treats a
 * street, so the buildings front the water with their doors on the quay through
 * machinery that never learned the word "canal".
 *
 * The form writes **no geometry**. It declares a {@link FormChannel} per
 * promoted segment, and `structures/canals.ts` — the canal pass, which runs
 * after the column plan is built and before the streets are surfaced — is what
 * digs the water. The datum is decided here because it is a *plan* decision:
 * one water surface for the whole quarter.
 */

import type { DistrictDensity } from "@terrainist/spec";

import type { StreetSegment } from "../streets.js";
import { MIN_CLIPPED_RUN, intersectionsOf } from "./axial.js";
import { axialDraw } from "./grid.js";
import type { FormChannel, FormContext, FormResult, UrbanForm } from "./types.js";

/**
 * Every Nth line on the long axis becomes water, by density.
 *
 * Three at `high`, two otherwise — a canal quarter is *mostly* canal, and the
 * denser the quarter the more it wants dry frontage between two waterways.
 */
export const CANAL_EVERY: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 3,
  medium: 2,
  low: 2,
});

/** Columns of water under the surface. Mirrors `CANAL_DEPTH` in `profiles.ts`. */
export const CANAL_CHANNEL_DEPTH = 2;

/**
 * How close open water must be for the quarter to share its level.
 *
 * Beyond this the canals are a **closed pound**: cut to the quarter's own level
 * rather than to the sea. That is a real thing and it looks right, so it is a
 * note rather than a refusal — see `structures/canals.ts`, which is where the
 * note is raised, because that is where "is there open water near here" can be
 * measured on the finished column plan rather than guessed from a heightfield.
 */
export const CANAL_SEA_REACH = 24;

/** The most the quay may sit above a shared sea datum before it stops sharing. */
export const CANAL_SEA_TOLERANCE = 2;

/**
 * The most the ground may fall along a run and still be one pound of water.
 *
 * A canal has **one** water surface for its whole length (`CANAL_PROFILE`'s
 * `follow: "level"`), so the ground it crosses has to be flat enough to hold
 * that one level. A real canal answers a longer fall with a staircase of locks,
 * one pound per reach; this form builds no locks, so past this much fall it
 * refuses the quarter and says which measurement failed rather than digging a
 * channel whose far end is a masonry aqueduct standing in a field.
 *
 * Six is a cutting deep enough to read as a canal in a town and shallow enough
 * that the quay still meets the ground behind it.
 */
export const CANAL_MAX_FALL = 6;

/** How many block sizes the short axis needs: channel, two quays, a street each side. */
export const CANAL_SPAN_BLOCKS = 3;

/** The `canal` form. */
export const CANAL_FORM: UrbanForm = {
  id: "canal",
  requires: {
    // The real size test is `3 · blockSize` and it is `draw`'s, because only
    // `draw` knows the block size. This is the floor every fabric shares.
    minSpan: 38,
    polygon: true,
    fallback: "grid",
  },
  describe:
    "A canal town: the primary circulation is water. Every second or third line of the plan is not a street but a dug channel with a quay either side, and the houses front the water with their doors on the quay. The canal is not a decoration laid over a street plan — it is where the street would have been.",
  draw(ctx: FormContext): FormResult {
    return drawCanal(ctx);
  },
};

/** Draw the axial skeleton and promote the long-axis lines that carry water. */
function drawCanal(ctx: FormContext): FormResult {
  const width = ctx.bounds.x1 - ctx.bounds.x0 + 1;
  const depth = ctx.bounds.z1 - ctx.bounds.z0 + 1;
  const span = Math.min(width, depth);
  const need = CANAL_SPAN_BLOCKS * ctx.blockSize;
  if (span < need) {
    return {
      ok: false,
      reason: `a canal quarter needs a channel, a quay each side and a street behind each quay — ${CANAL_SPAN_BLOCKS} × blockSize ${ctx.blockSize} = ${need} blocks on its short axis — and this quarter is ${width} × ${depth}`,
      fix: `lower "params.blockSize" below ${Math.floor(span / CANAL_SPAN_BLOCKS)} on this district, or grow "envelope.size" to at least [${need}, ${need}]`,
      fallback: "grid",
    };
  }

  // The skeleton is the grid's, drawn by the same construction and the same
  // draws. A canal quarter is a surveyed plan — canals are dug, and a dug thing
  // is straight — so `grid` rather than `organic` is the right base, and going
  // through `axialDraw` is what keeps the clipped/rotated cell path shared.
  const base = axialDraw(ctx, "grid");
  if (!base.ok) return { ...base, fallback: "grid" };

  const segments = [...base.plan.graph.segments];
  // Lines run *along* the domain's longer axis: `ew` segments span x, `ns`
  // segments span z (and the same is true in a rotated cell's local frame,
  // where `ns` runs along local v). A canal down the long dimension of the
  // quarter is the one that reads as the quarter's spine.
  const alongLong = width >= depth ? "ew" : "ns";
  const indices = new Set<number>();
  for (const segment of segments) {
    const line = lineOf(segment.id);
    if (line !== null && line.prefix === alongLong) indices.add(line.index);
  }
  const last = Math.max(...indices, 0);
  const every = CANAL_EVERY[ctx.density];

  const trim = ctx.sidewalk + 2;
  const channels: FormChannel[] = [];
  const promoted: string[] = [];
  const dropped: string[] = [];
  const out: StreetSegment[] = [];
  // Two sweeps, because the datum is a fact about the runs and the runs are not
  // known until the promotion has happened: the first decides *which* lines
  // carry water and how far each is trimmed, the second cuts them all to the one
  // level the first sweep's ground says they can share.
  const runs: StreetSegment[] = [];

  for (const segment of segments) {
    const line = lineOf(segment.id);
    // Never the first or the last line on the axis: those two are the quarter's
    // boundary streets, and the road pass anchors the next quarter's lanes on
    // their ends. A canal there would open straight onto an arterial, which is
    // exactly what step 3 of §3.5 trims for.
    const promote =
      line !== null &&
      line.prefix === alongLong &&
      line.index > 0 &&
      line.index < last &&
      line.index % every === 1;
    if (!promote) {
      out.push(segment);
      continue;
    }
    // Trimmed at both ends so a channel never opens onto an arterial or off
    // the district: the last `sidewalk + 2` columns go back to being quay.
    const path = segment.path.slice(trim, segment.path.length - trim);
    if (path.length < MIN_CLIPPED_RUN) {
      // Too short to be water once trimmed. It stays a street — a stub of
      // canal with two dry ends is a puddle, and a puddle is a defect.
      dropped.push(segment.id);
      out.push(segment);
      continue;
    }
    const run: StreetSegment = { ...segment, role: "channel", path };
    out.push(run);
    runs.push(run);
    promoted.push(segment.id);
  }

  const datum = canalDatum(ctx, runs);
  // The refusal, and it is a refusal rather than a warning because the thing
  // that would be drawn is not a worse canal, it is not a canal: one level over
  // ground that falls this far is a channel standing proud of the land at one
  // end or a slot cut through the town at the other.
  if (datum.fall > CANAL_MAX_FALL) {
    return {
      ok: false,
      reason: `the ground under this quarter's canal lines falls ${datum.fall} blocks (from y ${datum.high} to y ${datum.low}) and a canal holds one water level for its whole length, so at ${CANAL_MAX_FALL} blocks of fall it stops being a canal and starts being an aqueduct at one end and a trench at the other`,
      fix: `move the quarter onto flatter ground with an "at" or "zone" constraint, or flatten it first with a "terrain.edit" node whose "verb" is "plateau" over the quarter, or lower "params.blockSize" so the lines are shorter and each crosses less fall`,
      fallback: "grid",
    };
  }

  for (const run of runs) {
    channels.push({ segment: run.id, surfaceY: datum.surfaceY, depth: CANAL_CHANNEL_DEPTH });
  }

  if (channels.length === 0) {
    return {
      ok: false,
      reason: `no line of a ${width} × ${depth} quarter at blockSize ${ctx.blockSize} survives being trimmed into a channel, so this canal quarter would have no canal in it`,
      fix: 'lower "params.blockSize" so more lines fit, or grow "envelope.size"',
      fallback: "grid",
    };
  }

  const adapted = [
    `${promoted.length} of ${indices.size} lines on the quarter's ${width >= depth ? "x" : "z"} axis promoted to channels (every ${every}${ordinal(every)})`,
    `water datum ${datum.surfaceY}${datum.shared ? " (shared with the sea)" : " (one below the lowest ground the runs cross)"}, quay ${datum.low}, ${datum.fall} block(s) of fall cut through`,
  ];
  if (dropped.length > 0) {
    adapted.push(`${dropped.length} line(s) left as streets: too short to trim into a channel`);
  }

  return {
    ok: true,
    plan: {
      // Recomputed: a trimmed channel no longer meets the cross streets it met
      // before, and a stale intersection is a junction the surfacer would dress
      // over open water.
      graph: { ...base.plan.graph, segments: out, intersections: intersectionsOf(out) },
      channels,
      record: {
        id: "canal",
        requested: "canal",
        adapted,
        ignored: [
          "focus (a canal quarter is organised by its water, not by a place)",
          "corridor (read by the `linear` form only)",
        ],
      },
    },
  };
}

/** The water surface and whether it is the sea's (§3.5 step 5). */
export interface CanalDatum {
  readonly surfaceY: number;
  /** True when the quarter shares the sea's level rather than its own. */
  readonly shared: boolean;
  /** Lowest ground the runs cross — the quay level, and the datum's parent. */
  readonly low: number;
  /** Highest ground the runs cross. */
  readonly high: number;
  /** `high − low`: the fall one pound of water is being asked to span. */
  readonly fall: number;
}

/**
 * One water surface for the whole quarter.
 *
 * The quay level is the **lowest ground the promoted runs actually cross**, not
 * the height at the quarter's midpoint. That one change is what makes a canal
 * hold on real ground: the water goes one below the lowest column of the run,
 * so every column the channel passes is *cut down* to reach it and no stretch
 * of it is ever a trough built up above the land — which is precisely how a
 * level datum taken at the centre used to spring a leak wherever the ground
 * fell away from the middle of the quarter. `high`/`fall` are reported with it
 * so the caller can refuse a fall no single pound can span
 * ({@link CANAL_MAX_FALL}).
 *
 * Beside real water (`waterReach` under {@link CANAL_SEA_REACH}, and the quay
 * within {@link CANAL_SEA_TOLERANCE} of the sea) the quarter shares the sea's
 * level instead, so it reads as open to it. The `min` is not decoration: a quay
 * is *never* allowed to sit at or below its own canal.
 *
 * With no runs to measure — the skeleton callers, and every test that asks what
 * level a quarter would cut to — the quarter's midpoint is the answer, which is
 * the reading this function has always given.
 */
export function canalDatum(ctx: FormContext, runs: readonly StreetSegment[] = []): CanalDatum {
  const cx = Math.floor((ctx.bounds.x0 + ctx.bounds.x1) / 2);
  const cz = Math.floor((ctx.bounds.z0 + ctx.bounds.z1) / 2);
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    for (const cell of run.path) {
      const h = ctx.ground.height(cell.x, cell.z);
      if (h < low) low = h;
      if (h > high) high = h;
    }
  }
  if (!Number.isFinite(low)) {
    low = ctx.ground.height(cx, cz);
    high = low;
  }
  const quayY = low;
  const sea = ctx.ground.seaLevel;
  const fall = high - low;
  if (
    sea !== undefined &&
    ctx.ground.waterReach < CANAL_SEA_REACH &&
    Math.abs(quayY - sea) <= CANAL_SEA_TOLERANCE
  ) {
    return { surfaceY: Math.min(sea, quayY - 1), shared: true, low, high, fall };
  }
  return { surfaceY: quayY - 1, shared: false, low, high, fall };
}

/** The axis family and line index of an axial segment id (`ns3`, `ew2_1`). */
function lineOf(id: string): { readonly prefix: string; readonly index: number } | null {
  const match = /^(ns|ew)(\d+)(?:_\d+)?$/.exec(id);
  if (match === null) return null;
  return { prefix: match[1] as string, index: Number.parseInt(match[2] as string, 10) };
}

/** "rd" for 3, "nd" for 2 — the report reads as a sentence or it is not read. */
function ordinal(n: number): string {
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}
