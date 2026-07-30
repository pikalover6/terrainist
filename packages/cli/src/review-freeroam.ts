/**
 * Free-roam review — a session out of a client log with no stations in it.
 *
 * The station rig (see `review-import.ts`) can only file a note because a
 * pressure plate announced where the reviewer was standing. A generated world
 * has no plates, no verdict buttons and nothing to stand on but the terrain, so
 * the anchor has to come from the reviewer instead. Minecraft already ships the
 * mechanism: **F3+C** copies a teleport command for the current position to the
 * clipboard, and pasting it into chat writes it into the log —
 *
 * ```
 * [18:20:10] [Render thread/INFO]: [System] [CHAT] <kai> /execute in minecraft:overworld run tp @s 123.45 64.00 -45.67 -90.00 12.00
 * ```
 *
 * That line is a **position fix**, not a note: it opens a sighting window, and
 * everything typed until the next fix is filed against it. The parsing layer is
 * shared with the station harvester unchanged — only the fold, the join and the
 * rendering differ.
 *
 * With a `--report` from `terrainist compile --report` each sighting is also
 * joined to the nearest structure or marker by 3D distance, which turns "the
 * cliff here is wrong" into a note against a node path. Everything the report
 * offers is treated as possibly-absent: a report missing `markers` or `layout`
 * degrades to no join rather than throwing.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { TerrainCompileReport } from "@terrainist/compiler";

import type { ReviewComment, ReviewEvent, ReviewScreenshot, ReviewShot } from "./review-import.js";

/* -------------------------------------------------------------------------- */
/* position fixes                                                              */
/* -------------------------------------------------------------------------- */

/** A position the reviewer pasted into chat with F3+C. */
export interface PositionFix {
  /** Namespaced dimension id, always `minecraft:`-prefixed. */
  readonly dimension: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw?: number;
  readonly pitch?: number;
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;
/**
 * The F3+C paste, as tolerantly as is safe.
 *
 * The leading slash is optional because a client that *ran* the command echoes
 * it without one, and the `minecraft:` prefix is optional because a reviewer
 * retyping the line by hand drops it. Yaw and pitch are optional as a pair.
 */
const POSITION_FIX = new RegExp(
  String.raw`^\/?\s*execute\s+in\s+(?:([a-z0-9_.-]+):)?([a-z0-9_./-]+)\s+run\s+tp\s+@s\s+` +
    String.raw`(${NUM})\s+(${NUM})\s+(${NUM})(?:\s+(${NUM})\s+(${NUM}))?\s*$`,
  "i",
);

/** Parse an F3+C paste, or `undefined` for a line that is not one. */
export function parsePositionFix(text: string): PositionFix | undefined {
  const match = POSITION_FIX.exec(text.trim());
  if (match === null) return undefined;
  const namespace = (match[1] ?? "minecraft").toLowerCase();
  const fix: PositionFix = {
    dimension: `${namespace}:${(match[2] as string).toLowerCase()}`,
    x: Number(match[3]),
    y: Number(match[4]),
    z: Number(match[5]),
  };
  if (match[6] === undefined || match[7] === undefined) return fix;
  return { ...fix, yaw: Number(match[6]), pitch: Number(match[7]) };
}

/* -------------------------------------------------------------------------- */
/* the session                                                                 */
/* -------------------------------------------------------------------------- */

/** The nearest thing in the compile report to a sighting. */
export interface FreeRoamJoin {
  /** `"structure"` for a layout placement, `"marker"` for a field marker. */
  readonly kind: "structure" | "marker";
  readonly name: string;
  /** A placement's node path, when the report had one. */
  readonly nodePath?: string;
  /** 3D distance in blocks, rounded to two places. */
  readonly distance: number;
}

/** One position fix and everything said while it stood. */
export interface FreeRoamSighting {
  /** 0-based index in visit order — a stable handle for a sighting. */
  readonly index: number;
  readonly dimension: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw?: number;
  readonly pitch?: number;
  readonly clock: string;
  readonly start: number;
  /** Exclusive. The last sighting closes at the session's last event. */
  readonly end: number;
  readonly notes: readonly ReviewComment[];
  readonly screenshots: readonly ReviewShot[];
  /** The nearest structure or marker, when a compile report was supplied. */
  readonly nearest?: FreeRoamJoin;
}

/** The session document `review-import --world` writes. */
export interface FreeRoamSession {
  readonly format: "terrainist-freeroam-session/1";
  readonly source: {
    readonly logs: readonly string[];
    readonly screenshots: string | null;
    readonly world: string | null;
    readonly report: string | null;
  };
  readonly totals: {
    readonly sightings: number;
    readonly notes: number;
    readonly screenshots: number;
    /** Sightings that found a structure or marker to hang on. */
    readonly joined: number;
  };
  /** Sightings in the order the fixes arrived. */
  readonly sightings: readonly FreeRoamSighting[];
  /** Notes and shots from before the first position fix. */
  readonly unassigned: {
    readonly comments: readonly ReviewComment[];
    readonly screenshots: readonly ReviewShot[];
  };
}

/** Input to {@link buildFreeRoamSession}. */
export interface FreeRoamInput {
  readonly events: readonly ReviewEvent[];
  readonly screenshots?: readonly ReviewScreenshot[];
  readonly logs?: readonly string[];
  readonly screenshotDir?: string | undefined;
  readonly world?: string | undefined;
  readonly reportPath?: string | undefined;
  readonly report?: FreeRoamReport | undefined;
}

/**
 * The compile report as the join reads it.
 *
 * Deliberately a *widening* of {@link TerrainCompileReport}: every field is
 * optional, because the report on disk may be older or newer than this build
 * and a missing field must mean "no join", never a crash.
 */
export type FreeRoamReport = Partial<TerrainCompileReport> & Record<string, unknown>;

/** Mutable accumulator behind {@link FreeRoamSighting}. */
interface Accumulator {
  index: number;
  fix: PositionFix;
  clock: string;
  start: number;
  end: number;
  notes: ReviewComment[];
  screenshots: ReviewShot[];
}

/** One candidate the join can match a sighting to. */
interface Candidate {
  readonly kind: "structure" | "marker";
  readonly name: string;
  readonly nodePath?: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Everything in a report that has a position — tolerating a report with none. */
export function joinCandidates(report: FreeRoamReport | undefined): Candidate[] {
  if (report === undefined || report === null || typeof report !== "object") return [];
  const out: Candidate[] = [];

  const placements = (report.layout as { placements?: unknown } | undefined)?.placements;
  if (Array.isArray(placements)) {
    for (const raw of placements as readonly unknown[]) {
      const p = raw as {
        id?: unknown;
        nodePath?: unknown;
        anchor?: { x?: unknown; z?: unknown };
        foundationY?: unknown;
      };
      const x = Number(p.anchor?.x);
      const z = Number(p.anchor?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const nodePath = typeof p.nodePath === "string" ? p.nodePath : undefined;
      const name = typeof p.id === "string" ? p.id : (nodePath ?? "structure");
      const y = Number(p.foundationY);
      out.push({
        kind: "structure",
        name,
        ...(nodePath === undefined ? {} : { nodePath }),
        x,
        y: Number.isFinite(y) ? y : 0,
        z,
      });
    }
  }

  const markers = report.markers;
  if (Array.isArray(markers)) {
    for (const raw of markers as readonly unknown[]) {
      const m = raw as { id?: unknown; name?: unknown; x?: unknown; y?: unknown; z?: unknown };
      const x = Number(m.x);
      const z = Number(m.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const y = Number(m.y);
      const name = typeof m.id === "string" ? m.id : typeof m.name === "string" ? m.name : "marker";
      out.push({ kind: "marker", name, x, y: Number.isFinite(y) ? y : 0, z });
    }
  }

  return out;
}

/**
 * The nearest candidate to a fix, by 3D distance.
 *
 * Ties break on the candidate's own order — placements before markers — so the
 * join is deterministic for a world with two things in the same place.
 */
function nearestTo(fix: PositionFix, candidates: readonly Candidate[]): FreeRoamJoin | undefined {
  let best: Candidate | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = Math.hypot(c.x - fix.x, c.y - fix.y, c.z - fix.z);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  if (best === undefined) return undefined;
  return {
    kind: best.kind,
    name: best.name,
    ...(best.nodePath === undefined ? {} : { nodePath: best.nodePath }),
    distance: Math.round(bestDistance * 100) / 100,
  };
}

/**
 * Fold events and screenshots into a free-roam session.
 *
 * The rule mirrors the station fold with position where the station id was: a
 * note belongs to whichever fix was pasted last, and notes typed before any fix
 * are set aside rather than guessed at. Two differences are deliberate. There
 * are no verdicts — a `VERDICT` line in a free-roam log is ignored rather than
 * inventing a station for it. And the last window **closes** at the session's
 * last event instead of running open-ended, because a free-roam window has no
 * plate to end it and an infinite one would swallow screenshots taken hours
 * later.
 */
export function buildFreeRoamSession(input: FreeRoamInput): FreeRoamSession {
  const events = [...input.events].sort((a, b) => a.t - b.t);
  const shots = [...(input.screenshots ?? [])].sort((a, b) => a.t - b.t || a.file.localeCompare(b.file));

  // The session ends with its last *log* event. A screenshot taken after that
  // is outside every window, which is the point: the reviewer had stopped.
  const last = events.length === 0 ? 0 : (events[events.length - 1] as ReviewEvent).t;

  const sightings: Accumulator[] = [];
  const looseComments: ReviewComment[] = [];
  const looseShots: ReviewShot[] = [];
  const current = (): Accumulator | undefined => sightings[sightings.length - 1];

  for (const event of events) {
    switch (event.kind) {
      case "comment": {
        const text = event.text as string;
        const fix = parsePositionFix(text);
        if (fix !== undefined) {
          const open = current();
          if (open !== undefined) open.end = event.t;
          sightings.push({
            index: sightings.length,
            fix,
            clock: event.clock,
            start: event.t,
            end: last,
            notes: [],
            screenshots: [],
          });
          break;
        }
        const note: ReviewComment = {
          t: event.t,
          clock: event.clock,
          author: event.author as string,
          text,
        };
        const open = current();
        if (open === undefined) looseComments.push(note);
        else open.notes.push(note);
        break;
      }
      case "screenshot": {
        const shot: ReviewShot = { file: event.file as string, t: event.t, from: "log" };
        const open = current();
        if (open === undefined) looseShots.push(shot);
        else open.screenshots.push(shot);
        break;
      }
      // A station marker or a verdict has no meaning out here — a free-roam
      // world has neither plates nor buttons — so a stray one is dropped
      // rather than crashing the import or inventing a station for it.
      default:
        break;
    }
  }

  for (const shot of shots) {
    // Windows are half-open so a fix's own instant belongs to the new sighting;
    // the last one is closed at both ends, because it ends rather than running on.
    const found = sightings.find(
      (s) => shot.t >= s.start && (s.index === sightings.length - 1 ? shot.t <= s.end : shot.t < s.end),
    );
    const record: ReviewShot = { file: shot.file, t: shot.t, from: "dir" };
    if (found === undefined) {
      if (!looseShots.some((s) => s.file === shot.file)) looseShots.push(record);
      continue;
    }
    if (found.screenshots.some((s) => s.file === shot.file)) continue;
    found.screenshots.push(record);
  }

  const candidates = joinCandidates(input.report);
  let notes = 0;
  let screenshots = 0;
  let joined = 0;
  const out: FreeRoamSighting[] = [];
  for (const acc of sightings) {
    notes += acc.notes.length;
    screenshots += acc.screenshots.length;
    const nearest = nearestTo(acc.fix, candidates);
    if (nearest !== undefined) joined++;
    out.push({
      index: acc.index,
      dimension: acc.fix.dimension,
      position: { x: acc.fix.x, y: acc.fix.y, z: acc.fix.z },
      ...(acc.fix.yaw === undefined ? {} : { yaw: acc.fix.yaw }),
      ...(acc.fix.pitch === undefined ? {} : { pitch: acc.fix.pitch }),
      clock: acc.clock,
      start: acc.start,
      end: acc.end,
      notes: acc.notes.sort((a, b) => a.t - b.t),
      screenshots: acc.screenshots.sort((a, b) => a.t - b.t),
      ...(nearest === undefined ? {} : { nearest }),
    });
  }

  return {
    format: "terrainist-freeroam-session/1",
    source: {
      logs: input.logs ?? [],
      screenshots: input.screenshotDir ?? null,
      world: input.world ?? null,
      report: input.reportPath ?? null,
    },
    totals: {
      sightings: out.length,
      notes: notes + looseComments.length,
      screenshots: screenshots + looseShots.length,
      joined,
    },
    sightings: out,
    unassigned: { comments: looseComments, screenshots: looseShots },
  };
}

/* -------------------------------------------------------------------------- */
/* the summary                                                                 */
/* -------------------------------------------------------------------------- */

/** `123, 64, -46` — block coordinates, which is what a reviewer types back. */
function coords(s: FreeRoamSighting): string {
  return [s.position.x, s.position.y, s.position.z].map((n) => Math.round(n)).join(", ");
}

/**
 * A chronological markdown summary — one heading per sighting.
 *
 * Nothing to sort by: free-roam has no verdicts, so the order the reviewer
 * walked in *is* the order the notes make sense in. The joined structure goes
 * in the heading because it is the thing a fix is actually about.
 */
export function renderFreeRoamMarkdown(session: FreeRoamSession): string {
  const t = session.totals;
  const lines: string[] = ["# Free-roam review", ""];
  if (session.source.world !== null) lines.push(`- world: **${session.source.world}**`);
  lines.push(
    `- sightings: **${t.sightings}**` +
      (session.source.report === null ? " (no compile report — no structure join)" : `, ${t.joined} joined to a structure`),
    `- notes: ${t.notes}   screenshots: ${t.screenshots}`,
    "",
  );

  if (session.unassigned.comments.length > 0 || session.unassigned.screenshots.length > 0) {
    lines.push("## Before the first position fix", "");
    for (const c of session.unassigned.comments) lines.push(`- ${c.clock} <${c.author}> ${c.text}`);
    for (const s of session.unassigned.screenshots) lines.push(`- shot: \`${s.file}\``);
    lines.push("");
  }

  lines.push(`## Sightings (${session.sightings.length})`, "");
  if (session.sightings.length === 0) lines.push("_none — no F3+C position was pasted into chat_", "");
  for (const s of session.sightings) {
    const near =
      s.nearest === undefined
        ? ""
        : ` — near **${s.nearest.name}** (${s.nearest.distance} blocks${s.nearest.nodePath === undefined ? "" : `, \`${s.nearest.nodePath}\``})`;
    lines.push(`### ${s.clock} · ${coords(s)}${near}`);
    if (s.dimension !== "minecraft:overworld") lines.push(`\`${s.dimension}\``);
    for (const c of s.notes) lines.push(`- ${c.clock} <${c.author}> ${c.text}`);
    if (s.notes.length === 0) lines.push("- _no note recorded_");
    for (const shot of s.screenshots) lines.push(`- shot: \`${shot.file}\``);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/* -------------------------------------------------------------------------- */
/* the report                                                                  */
/* -------------------------------------------------------------------------- */

/** Read a compile report, tolerating a file that is not one. */
export async function readCompileReport(file: string): Promise<FreeRoamReport> {
  const parsed = JSON.parse(await readFile(path.resolve(file), "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${file} is not a compile report`);
  }
  return parsed as FreeRoamReport;
}

/**
 * Where a world's compile report is likely to be — best effort, no registry.
 *
 * `terrainist compile --report <file>` puts it wherever the caller said, so the
 * only thing that can be done without inventing a registry is to try the places
 * the convention puts it and say so when none of them exists.
 */
export function reportCandidatePaths(world: string, outDir = "out"): string[] {
  const base = path.basename(world);
  const dir = path.dirname(world) === "." ? outDir : path.dirname(world);
  return [
    `${world}.report.json`,
    path.join(world, "report.json"),
    path.join(dir, `${base}.report.json`),
    path.join(outDir, `${base}.report.json`),
    path.join(outDir, base, "report.json"),
  ].filter((p, i, all) => all.indexOf(p) === i);
}
