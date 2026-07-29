/**
 * The review harvester — a session out of a client log.
 *
 * The rig puts a reviewer in front of one exhibit at a time and gives them
 * three ways to react: a PASS button, a FAIL button, and the chat box. All
 * three end up in the same place — `~/Library/Application Support/minecraft/
 * logs/latest.log` — mixed in with several thousand lines about shader
 * compilation. This module is the other half of that loop: it reads the log
 * back and turns it into a session document that a human, or a later
 * generator, can act on.
 *
 * ## What the log actually looks like
 *
 * Verified against real logs on this machine rather than remembered. Every
 * chat line the client renders is written as
 *
 * ```
 * [18:17:46] [Render thread/INFO]: [System] [CHAT] Set own game mode to Spectator Mode
 * [18:23:00] [Render thread/INFO]: [System] [CHAT] Saved screenshot as 2026-07-19_18.23.00.png
 * ```
 *
 * — a wall-clock **time** with no date, a thread tag, and then the rendered
 * message. A command block's `say` arrives with the block's name in brackets
 * (`[@] >> STATION cottage__cottage_0`), and the player's own chat arrives as
 * `<name> text`. The bracketed prefix is not stable — it is whatever the
 * command block is called, and on a server it would be different again — so
 * **every marker here is matched by content, never by prefix**.
 *
 * Two consequences of "a time with no date" are handled explicitly: the date
 * comes from the log's filename when it has one (`2026-07-28-1.log`) and from
 * its mtime when it does not (`latest.log`), and a session that runs past
 * midnight is detected by the clock going backwards.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/* -------------------------------------------------------------------------- */
/* events                                                                      */
/* -------------------------------------------------------------------------- */

/** What kind of thing a parsed line turned out to be. */
export type ReviewEventKind = "marker" | "verdict" | "comment" | "screenshot";

/** One thing that happened, at a time. */
export interface ReviewEvent {
  readonly kind: ReviewEventKind;
  /** Absolute epoch milliseconds, local time. */
  readonly t: number;
  /** `HH:MM:SS` as the log wrote it, kept for human-readable output. */
  readonly clock: string;
  /** Which log this came from. */
  readonly source: string;
  /** Station id — on a marker, the station arrived at; on a verdict, its subject. */
  readonly station?: string;
  readonly verdict?: "pass" | "fail";
  /** A comment's text, with the `<name>` prefix removed. */
  readonly text?: string;
  /** A comment's author. */
  readonly author?: string;
  /** A screenshot's file name, as the client reported it. */
  readonly file?: string;
}

/** A screenshot found on disk. */
export interface ReviewScreenshot {
  readonly file: string;
  readonly path: string;
  readonly t: number;
  /** Where the timestamp came from. */
  readonly source: "filename" | "mtime";
}

/**
 * The chat payload of one log line, or `undefined` for a line that is not chat.
 *
 * Anything before `[CHAT] ` is thrown away: the thread tag, the log level, and
 * the `[System]` marker the client adds to messages it generated itself.
 */
export function chatPayload(line: string): { clock: string; text: string } | undefined {
  const match = /^\[(\d{2}:\d{2}:\d{2})\]\s+\[[^\]]*\]:\s*(.*)$/.exec(line);
  if (match === null) return undefined;
  const rest = match[2] as string;
  const at = rest.indexOf("[CHAT] ");
  if (at < 0) return undefined;
  return { clock: match[1] as string, text: rest.slice(at + "[CHAT] ".length).trimEnd() };
}

/** Station markers: `>> STATION <id>`, wherever in the line they appear. */
const MARKER = /(?:^|\s)>>\s*STATION\s+(\S+)/;
/** Verdicts: `VERDICT <id> pass|fail`. */
const VERDICT = /(?:^|\s)VERDICT\s+(\S+)\s+(pass|fail)\b/i;
/** The client's own screenshot notice. */
const SCREENSHOT = /^Saved screenshot as (\S+\.png)/;
/** A player's chat message. */
const PLAYER = /^<([^>]+)>\s?(.*)$/;

/** Strip any leading bracketed tags — `[@] `, `[NEXT] `, `[Not Secure] `. */
function stripTags(text: string): string {
  let out = text;
  for (;;) {
    const next = out.replace(/^\[[^\]]*\]\s*/, "");
    if (next === out) return out;
    out = next;
  }
}

/**
 * Classify one chat line.
 *
 * Order matters: a marker or a verdict is recognised *before* the player-chat
 * shape, so a reviewer who types `VERDICT x fail` by hand is recorded as a
 * verdict rather than as a comment about one.
 */
export function classifyChat(text: string, base: Omit<ReviewEvent, "kind">): ReviewEvent | undefined {
  const marker = MARKER.exec(text);
  if (marker !== null) return { ...base, kind: "marker", station: marker[1] as string };

  const verdict = VERDICT.exec(text);
  if (verdict !== null) {
    return {
      ...base,
      kind: "verdict",
      station: verdict[1] as string,
      verdict: (verdict[2] as string).toLowerCase() as "pass" | "fail",
    };
  }

  const bare = stripTags(text);
  const shot = SCREENSHOT.exec(bare);
  if (shot !== null) return { ...base, kind: "screenshot", file: shot[1] as string };

  const player = PLAYER.exec(bare);
  if (player === null) return undefined;
  const body = (player[2] as string).trim();
  if (body === "") return undefined;
  return { ...base, kind: "comment", author: player[1] as string, text: body };
}

/**
 * The calendar day a log belongs to.
 *
 * From the filename when the client rotated it (`2026-07-28-1.log.gz`), and
 * from the file's own mtime otherwise — which is the `latest.log` case, and
 * the one that matters, because that is the file a reviewer actually has.
 */
export function logStartDate(file: string, mtime: Date): Date {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(path.basename(file));
  if (match === null) return new Date(mtime.getFullYear(), mtime.getMonth(), mtime.getDate());
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Parse one log's worth of text into events.
 *
 * `day` is the calendar date the log's first line falls on; the clock going
 * backwards rolls it forward, which is what makes a session that crosses
 * midnight come out in order instead of folding back on itself.
 */
export function parseClientLog(text: string, source: string, day: Date): ReviewEvent[] {
  const events: ReviewEvent[] = [];
  let dayOffset = 0;
  let previous = -1;
  for (const line of text.split("\n")) {
    const chat = chatPayload(line);
    if (chat === undefined) continue;
    const [h, m, s] = chat.clock.split(":").map(Number) as [number, number, number];
    const seconds = h * 3600 + m * 60 + s;
    if (previous >= 0 && seconds < previous) dayOffset++;
    previous = seconds;
    const t = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate() + dayOffset,
      h,
      m,
      s,
    ).getTime();
    const event = classifyChat(chat.text, { t, clock: chat.clock, source });
    if (event !== undefined) events.push(event);
  }
  return events;
}

/** Read and parse a log file, resolving its date from name then mtime. */
export async function readClientLog(file: string): Promise<ReviewEvent[]> {
  const resolved = path.resolve(file);
  const info = await stat(resolved);
  const text = await readFile(resolved, "utf8");
  return parseClientLog(text, path.basename(resolved), logStartDate(resolved, info.mtime));
}

/** Timestamp a screenshot: from its client-generated name, else its mtime. */
export function screenshotTime(file: string, mtime: Date): { t: number; source: "filename" | "mtime" } {
  const match = /(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})\.(\d{2})/.exec(path.basename(file));
  if (match === null) return { t: mtime.getTime(), source: "mtime" };
  const [, y, mo, d, h, mi, s] = match as unknown as string[];
  return {
    t: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime(),
    source: "filename",
  };
}

/** Every PNG in a directory, timestamped and in time order. */
export async function readScreenshots(dir: string): Promise<ReviewScreenshot[]> {
  const resolved = path.resolve(dir);
  const names = (await readdir(resolved)).filter((n) => n.toLowerCase().endsWith(".png")).sort();
  const shots: ReviewScreenshot[] = [];
  for (const name of names) {
    const full = path.join(resolved, name);
    const info = await stat(full);
    const { t, source } = screenshotTime(name, info.mtime);
    shots.push({ file: name, path: full, t, source });
  }
  return shots.sort((a, b) => a.t - b.t || a.file.localeCompare(b.file));
}

/* -------------------------------------------------------------------------- */
/* the session                                                                 */
/* -------------------------------------------------------------------------- */

/** One visit to one station: the window its notes belong to. */
export interface ReviewVisit {
  readonly station: string;
  readonly start: number;
  /** Exclusive; `null` on the last visit, which runs to the end of the session. */
  readonly end: number | null;
}

/** A comment, attributed. */
export interface ReviewComment {
  readonly t: number;
  readonly clock: string;
  readonly author: string;
  readonly text: string;
}

/** A screenshot, attributed. */
export interface ReviewShot {
  readonly file: string;
  readonly t: number;
  /** `"log"` when the client announced it, `"dir"` when it was found on disk. */
  readonly from: "log" | "dir";
}

/** Everything gathered about one station. */
export interface ReviewStation {
  readonly id: string;
  /** The last verdict recorded — a reviewer who changes their mind wins. */
  readonly verdict: "pass" | "fail" | null;
  /** Every verdict, in order, so a change of mind is visible rather than lost. */
  readonly verdicts: readonly ("pass" | "fail")[];
  readonly comments: readonly ReviewComment[];
  readonly screenshots: readonly ReviewShot[];
  readonly visits: readonly ReviewVisit[];
  /** The manifest's provenance for this station, when a manifest was supplied. */
  readonly provenance?: unknown;
  /** True when the station has no counterpart in the manifest. */
  readonly unknown: boolean;
}

/** The session document `review-import` writes. */
export interface ReviewSession {
  readonly format: "terrainist-review-session/1";
  readonly source: {
    readonly logs: readonly string[];
    readonly screenshots: string | null;
    readonly manifest: string | null;
  };
  readonly totals: {
    readonly stationsVisited: number;
    readonly stationsInManifest: number | null;
    readonly markers: number;
    readonly verdicts: number;
    readonly pass: number;
    readonly fail: number;
    readonly comments: number;
    readonly screenshots: number;
  };
  /** Stations, in the order they were first visited. */
  readonly stations: Readonly<Record<string, ReviewStation>>;
  /** Notes that arrived before any station marker. */
  readonly unassigned: {
    readonly comments: readonly ReviewComment[];
    readonly screenshots: readonly ReviewShot[];
  };
}

/** The manifest fields the harvester reads — everything else is ignored. */
export interface ReviewManifest {
  readonly stations?: readonly { readonly id: string; readonly provenance?: unknown }[];
  readonly spawn?: { readonly id: string; readonly provenance?: unknown };
}

/** Input to {@link buildSession}. */
export interface SessionInput {
  readonly events: readonly ReviewEvent[];
  readonly screenshots?: readonly ReviewScreenshot[];
  readonly manifest?: ReviewManifest | undefined;
  readonly logs?: readonly string[];
  readonly screenshotDir?: string | undefined;
  readonly manifestPath?: string | undefined;
}

/** Mutable accumulator behind {@link ReviewStation}. */
interface Accumulator {
  id: string;
  verdicts: ("pass" | "fail")[];
  comments: ReviewComment[];
  screenshots: ReviewShot[];
  visits: { station: string; start: number; end: number | null }[];
}

/**
 * Fold events and screenshots into a session.
 *
 * The one rule that makes this work at all: **a comment belongs to whichever
 * station was last announced**. The plate announces on every arrival, so the
 * announcement is never stale for long, and consecutive announcements of the
 * same station — a reviewer stepping on and off the plate, which is what
 * actually happens — are collapsed rather than opening an empty visit each
 * time. Verdicts are the exception: they carry their own station id, so a
 * PASS pressed after wandering off is still filed correctly.
 */
export function buildSession(input: SessionInput): ReviewSession {
  const events = [...input.events].sort((a, b) => a.t - b.t);
  const manifestIds = new Set<string>();
  const provenanceOf = new Map<string, unknown>();
  for (const s of input.manifest?.stations ?? []) {
    manifestIds.add(s.id);
    if (s.provenance !== undefined) provenanceOf.set(s.id, s.provenance);
  }
  const spawn = input.manifest?.spawn;
  if (spawn !== undefined) {
    manifestIds.add(spawn.id);
    if (spawn.provenance !== undefined) provenanceOf.set(spawn.id, spawn.provenance);
  }

  const stations = new Map<string, Accumulator>();
  const at = (id: string): Accumulator => {
    let acc = stations.get(id);
    if (acc === undefined) {
      acc = { id, verdicts: [], comments: [], screenshots: [], visits: [] };
      stations.set(id, acc);
    }
    return acc;
  };

  const visits: ReviewVisit[] = [];
  let current: string | undefined;
  let markers = 0;
  const looseComments: ReviewComment[] = [];
  const looseShots: ReviewShot[] = [];

  for (const event of events) {
    switch (event.kind) {
      case "marker": {
        markers++;
        const id = event.station as string;
        // Plate spam: standing on the plate re-fires it, and a reviewer who
        // shuffles produces a dozen markers for one visit. Only a *change* of
        // station opens a window.
        if (id === current) break;
        if (visits.length > 0) {
          const last = visits[visits.length - 1] as ReviewVisit;
          visits[visits.length - 1] = { ...last, end: event.t };
        }
        visits.push({ station: id, start: event.t, end: null });
        at(id);
        current = id;
        break;
      }
      case "verdict": {
        at(event.station as string).verdicts.push(event.verdict as "pass" | "fail");
        break;
      }
      case "comment": {
        const comment: ReviewComment = {
          t: event.t,
          clock: event.clock,
          author: event.author as string,
          text: event.text as string,
        };
        if (current === undefined) looseComments.push(comment);
        else at(current).comments.push(comment);
        break;
      }
      case "screenshot": {
        const shot: ReviewShot = { file: event.file as string, t: event.t, from: "log" };
        if (current === undefined) looseShots.push(shot);
        else at(current).screenshots.push(shot);
        break;
      }
    }
  }

  // Screenshots found on disk land in the window that contains them. A file
  // the log already announced is not counted twice: the log's own line is the
  // better record, because its timestamp is the client's.
  for (const shot of input.screenshots ?? []) {
    const visit = visits.find((v) => shot.t >= v.start && (v.end === null || shot.t < v.end));
    const record: ReviewShot = { file: shot.file, t: shot.t, from: "dir" };
    if (visit === undefined) {
      if (!looseShots.some((s) => s.file === shot.file)) looseShots.push(record);
      continue;
    }
    const acc = at(visit.station);
    if (acc.screenshots.some((s) => s.file === shot.file)) continue;
    acc.screenshots.push(record);
  }

  for (const visit of visits) at(visit.station).visits.push(visit);

  const out: Record<string, ReviewStation> = {};
  let pass = 0;
  let fail = 0;
  let comments = 0;
  let screenshots = 0;
  for (const acc of stations.values()) {
    const verdict = acc.verdicts.length === 0 ? null : (acc.verdicts[acc.verdicts.length - 1] as "pass" | "fail");
    for (const v of acc.verdicts) if (v === "pass") pass++; else fail++;
    comments += acc.comments.length;
    screenshots += acc.screenshots.length;
    const provenance = provenanceOf.get(acc.id);
    out[acc.id] = {
      id: acc.id,
      verdict,
      verdicts: acc.verdicts,
      comments: acc.comments.sort((a, b) => a.t - b.t),
      screenshots: acc.screenshots.sort((a, b) => a.t - b.t),
      visits: acc.visits,
      ...(provenance === undefined ? {} : { provenance }),
      unknown: manifestIds.size > 0 && !manifestIds.has(acc.id),
    };
  }

  return {
    format: "terrainist-review-session/1",
    source: {
      logs: input.logs ?? [],
      screenshots: input.screenshotDir ?? null,
      manifest: input.manifestPath ?? null,
    },
    totals: {
      stationsVisited: stations.size,
      stationsInManifest: manifestIds.size === 0 ? null : manifestIds.size,
      markers,
      verdicts: pass + fail,
      pass,
      fail,
      comments: comments + looseComments.length,
      screenshots: screenshots + looseShots.length,
    },
    stations: out,
    unassigned: {
      comments: looseComments,
      screenshots: looseShots,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the summary                                                                 */
/* -------------------------------------------------------------------------- */

/** One line describing where a station's exhibit came from. */
function provenanceLine(station: ReviewStation): string {
  const p = station.provenance as
    | { row?: string; family?: string; theme?: string; roof?: string; size?: number[]; seedSalt?: string }
    | undefined;
  if (p === undefined) return "";
  const parts = [p.row, p.family, p.size === undefined ? undefined : p.size.join("x"), p.roof, p.theme];
  if (p.seedSalt !== undefined) parts.push(`salt ${p.seedSalt}`);
  return parts.filter((x) => x !== undefined && x !== "").join(" · ");
}

/**
 * A compact markdown summary — fails first, with what was said about them.
 *
 * The ordering is the whole point. A session is a hundred and fifty stations
 * of which four are wrong, and the document that opens with the four is the
 * one that gets read.
 */
export function renderSessionMarkdown(session: ReviewSession): string {
  const t = session.totals;
  const entries = Object.values(session.stations);
  const fails = entries.filter((s) => s.verdict === "fail");
  const passes = entries.filter((s) => s.verdict === "pass");
  const noVerdict = entries.filter((s) => s.verdict === null && s.visits.length > 0);
  const commented = entries.filter((s) => s.verdict !== "fail" && s.comments.length > 0);

  const lines: string[] = ["# Review session", ""];
  lines.push(
    `- stations visited: **${t.stationsVisited}**` +
      (t.stationsInManifest === null ? "" : ` of ${t.stationsInManifest} in the manifest`),
    `- verdicts: **${t.pass} pass**, **${t.fail} fail** (${t.verdicts} recorded over ${t.markers} arrivals)`,
    `- comments: ${t.comments}   screenshots: ${t.screenshots}`,
    "",
  );

  lines.push(`## Fails (${fails.length})`, "");
  if (fails.length === 0) lines.push("_none_", "");
  for (const station of fails) {
    lines.push(`### ${station.id}${station.unknown ? " _(not in manifest)_" : ""}`);
    const prov = provenanceLine(station);
    if (prov !== "") lines.push(`\`${prov}\``);
    for (const c of station.comments) lines.push(`- ${c.clock} <${c.author}> ${c.text}`);
    if (station.comments.length === 0) lines.push("- _no comment recorded_");
    for (const s of station.screenshots) lines.push(`- shot: \`${s.file}\``);
    lines.push("");
  }

  lines.push(`## Comments on stations not failed (${commented.length})`, "");
  if (commented.length === 0) lines.push("_none_", "");
  for (const station of commented) {
    lines.push(`- **${station.id}** (${station.verdict ?? "no verdict"})`);
    for (const c of station.comments) lines.push(`  - ${c.clock} <${c.author}> ${c.text}`);
  }
  if (commented.length > 0) lines.push("");

  lines.push(
    `## Passed (${passes.length})`,
    "",
    passes.length === 0 ? "_none_" : passes.map((s) => s.id).join(", "),
    "",
    `## Visited without a verdict (${noVerdict.length})`,
    "",
    noVerdict.length === 0 ? "_none_" : noVerdict.map((s) => s.id).join(", "),
    "",
  );

  if (session.unassigned.comments.length > 0 || session.unassigned.screenshots.length > 0) {
    lines.push("## Before the first station", "");
    for (const c of session.unassigned.comments) lines.push(`- ${c.clock} <${c.author}> ${c.text}`);
    for (const s of session.unassigned.screenshots) lines.push(`- shot: \`${s.file}\``);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** Read a manifest, tolerating one that is not a rig manifest at all. */
export async function readManifest(file: string): Promise<ReviewManifest> {
  const parsed = JSON.parse(await readFile(path.resolve(file), "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${file} is not a review-rig manifest`);
  }
  return parsed as ReviewManifest;
}
