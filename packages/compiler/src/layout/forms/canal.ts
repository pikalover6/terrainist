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
  const datum = canalDatum(ctx);

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
    out.push({ ...segment, role: "channel", path });
    promoted.push(segment.id);
    channels.push({ segment: segment.id, surfaceY: datum.surfaceY, depth: CANAL_CHANNEL_DEPTH });
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
    `water datum ${datum.surfaceY}${datum.shared ? " (shared with the sea)" : " (the quarter's own level)"}`,
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
}

/**
 * One water surface for the whole quarter.
 *
 * `quayY − 1` normally — the water is one below the ground the doors stand on,
 * which is what makes the bank exactly one course proud. Beside real water
 * (`waterReach` under {@link CANAL_SEA_REACH}, and the quarter within
 * {@link CANAL_SEA_TOLERANCE} of the sea) the quarter shares the sea's level
 * instead, so it reads as open to it. The `min` is not decoration: a quay is
 * *never* allowed to sit at or below its own canal.
 */
export function canalDatum(ctx: FormContext): CanalDatum {
  const cx = Math.floor((ctx.bounds.x0 + ctx.bounds.x1) / 2);
  const cz = Math.floor((ctx.bounds.z0 + ctx.bounds.z1) / 2);
  const quayY = ctx.ground.height(cx, cz);
  const sea = ctx.ground.seaLevel;
  if (
    sea !== undefined &&
    ctx.ground.waterReach < CANAL_SEA_REACH &&
    Math.abs(quayY - sea) <= CANAL_SEA_TOLERANCE
  ) {
    return { surfaceY: Math.min(sea, quayY - 1), shared: true };
  }
  return { surfaceY: quayY - 1, shared: false };
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
