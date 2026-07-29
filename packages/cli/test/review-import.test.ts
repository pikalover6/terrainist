/**
 * The review harvester.
 *
 * The fixture below is a synthetic client log, but its *shape* is not
 * invented: the line format, the `[System] [CHAT]` prefix and the "Saved
 * screenshot as" notice were read out of real logs under
 * `~/Library/Application Support/minecraft/logs`. The three things that
 * actually go wrong in a real session are what the cases are about — the plate
 * re-firing while a reviewer shuffles on it, a session split across two log
 * files, and a screenshot that has to be attributed to whatever was on screen
 * when it was taken.
 */

import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  buildSession,
  chatPayload,
  classifyChat,
  logStartDate,
  parseClientLog,
  readClientLog,
  readScreenshots,
  renderSessionMarkdown,
  screenshotTime,
  REVIEW_MANIFEST_FORMATS,
  type ReviewEvent,
  type ReviewManifest,
} from "../src/review-import.js";

const scratch: string[] = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function scratchDir(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-review-${label}-`));
  scratch.push(dir);
  return dir;
}

/** A log line in the client's real format. */
function chat(clock: string, text: string): string {
  return `[${clock}] [Render thread/INFO]: [System] [CHAT] ${text}`;
}

const DAY = new Date(2026, 6, 29);

/**
 * One session's worth of log, with every wrinkle in it.
 *
 * Station A is arrived at three times in a row (the plate re-firing), gets two
 * comments and a fail. Station B gets a pass. Station C is arrived at, gets a
 * comment, and never gets a verdict. A verdict for a station arrives *after*
 * the reviewer has walked on, which is why verdicts carry their own id.
 */
const LOG = [
  "[18:20:00] [Render thread/INFO]: Loaded 7 recipes",
  chat("18:20:01", "Local game hosted on port [55230]"),
  chat("18:20:02", "[@] >> STATION _start"),
  chat("18:20:05", "<kai> starting the sweep"),
  chat("18:20:10", "[@] >> STATION cottage__cottage_0"),
  chat("18:20:11", "[@] >> STATION cottage__cottage_0"),
  chat("18:20:12", "[@] >> STATION cottage__cottage_0"),
  chat("18:20:20", "<kai> the porch roof floats"),
  chat("18:20:25", "Saved screenshot as 2026-07-29_18.20.25.png"),
  chat("18:20:30", "<kai> and the door is off-centre"),
  chat("18:20:35", "[FAIL] VERDICT cottage__cottage_0 fail"),
  chat("18:20:40", "[@] >> STATION cottage__cottage_1"),
  chat("18:20:50", "[PASS] VERDICT cottage__cottage_1 pass"),
  chat("18:21:00", "[@] >> STATION roofs__roofs_hip_boreal_pine"),
  chat("18:21:05", "<kai> hip roof looks fine but the eave is thin"),
  // A late correction: the reviewer changes their mind about the first one
  // from somewhere else entirely, and it still has to file correctly.
  chat("18:21:30", "VERDICT cottage__cottage_1 fail"),
  chat("18:21:40", "Set own game mode to Spectator Mode"),
  "",
].join("\n");

const MANIFEST: ReviewManifest = {
  spawn: { id: "_start", provenance: { row: "_start", family: "instructions" } },
  stations: [
    {
      id: "cottage__cottage_0",
      provenance: { row: "cottage", family: "cottage", size: [7, 8, 7], roof: "gable", theme: "temperate_timber" },
    },
    { id: "cottage__cottage_1", provenance: { row: "cottage", family: "cottage", size: [8, 8, 7] } },
    { id: "roofs__roofs_hip_boreal_pine", provenance: { row: "roofs", family: "cottage", size: [9, 9, 9] } },
  ],
};

/* -------------------------------------------------------------------------- */
/* line parsing                                                                */
/* -------------------------------------------------------------------------- */

describe("line parsing", () => {
  it("takes the chat payload and throws away everything before it", () => {
    expect(chatPayload(chat("18:20:02", "hello"))).toEqual({ clock: "18:20:02", text: "hello" });
    // The `[System]` marker is not always there — a server message has none.
    expect(chatPayload("[01:02:03] [Render thread/INFO]: [CHAT] hi")).toEqual({
      clock: "01:02:03",
      text: "hi",
    });
    expect(chatPayload("[18:20:00] [Render thread/INFO]: Loaded 7 recipes")).toBeUndefined();
    expect(chatPayload("not a log line at all")).toBeUndefined();
  });

  it("matches markers by content, whatever prefix the command block wears", () => {
    const base = { t: 0, clock: "00:00:00", source: "x" };
    for (const line of [
      ">> STATION alpha",
      "[@] >> STATION alpha",
      "[NEXT] >> STATION alpha",
      "<kai> >> STATION alpha",
      "[Not Secure] [@] >>  STATION alpha",
    ]) {
      expect(classifyChat(line, base), line).toMatchObject({ kind: "marker", station: "alpha" });
    }
  });

  it("reads a verdict wherever it appears, and normalises its case", () => {
    const base = { t: 0, clock: "00:00:00", source: "x" };
    expect(classifyChat("[PASS] VERDICT beta pass", base)).toMatchObject({
      kind: "verdict",
      station: "beta",
      verdict: "pass",
    });
    expect(classifyChat("VERDICT beta FAIL", base)).toMatchObject({ verdict: "fail" });
  });

  it("keeps a player's own chat and drops the client's chatter", () => {
    const base = { t: 0, clock: "00:00:00", source: "x" };
    expect(classifyChat("<kai> the roof floats", base)).toMatchObject({
      kind: "comment",
      author: "kai",
      text: "the roof floats",
    });
    // System messages are not comments: a session is not a transcript of the
    // reviewer's game-mode changes.
    expect(classifyChat("Set own game mode to Spectator Mode", base)).toBeUndefined();
    expect(classifyChat("Local game hosted on port [55230]", base)).toBeUndefined();
    expect(classifyChat("<kai>   ", base)).toBeUndefined();
  });

  it("recognises the client's own screenshot notice", () => {
    const base = { t: 0, clock: "00:00:00", source: "x" };
    expect(classifyChat("Saved screenshot as 2026-07-29_18.20.25.png", base)).toMatchObject({
      kind: "screenshot",
      file: "2026-07-29_18.20.25.png",
    });
  });

  it("dates a log from its name, and latest.log from its mtime", () => {
    expect(logStartDate("2026-07-28-1.log.gz", new Date(2020, 0, 1))).toEqual(new Date(2026, 6, 28));
    const mtime = new Date(2026, 6, 29, 23, 5, 0);
    expect(logStartDate("latest.log", mtime)).toEqual(new Date(2026, 6, 29));
  });

  it("rolls the date forward when the clock goes backwards", () => {
    const events = parseClientLog(
      [chat("23:59:58", ">> STATION a"), chat("00:00:02", ">> STATION b")].join("\n"),
      "latest.log",
      DAY,
    );
    expect(events).toHaveLength(2);
    expect((events[1] as ReviewEvent).t - (events[0] as ReviewEvent).t).toBe(4000);
  });
});

/* -------------------------------------------------------------------------- */
/* the session                                                                 */
/* -------------------------------------------------------------------------- */

describe("the session", () => {
  const events = parseClientLog(LOG, "latest.log", DAY);
  const session = buildSession({ events, manifest: MANIFEST, logs: ["latest.log"] });

  it("collapses a plate that fires three times into one visit", () => {
    const station = session.stations["cottage__cottage_0"];
    expect(station?.visits).toHaveLength(1);
    // The markers themselves are still counted — the collapse is about which
    // window a note lands in, not about pretending the plate did not fire.
    expect(session.totals.markers).toBe(6);
  });

  it("files every comment under the station that was last announced", () => {
    expect(session.stations["cottage__cottage_0"]?.comments.map((c) => c.text)).toEqual([
      "the porch roof floats",
      "and the door is off-centre",
    ]);
    expect(session.stations["_start"]?.comments.map((c) => c.text)).toEqual(["starting the sweep"]);
    expect(session.stations["roofs__roofs_hip_boreal_pine"]?.comments).toHaveLength(1);
    expect(session.unassigned.comments).toHaveLength(0);
  });

  it("files a verdict by the id in the verdict line, not by where the player is", () => {
    expect(session.stations["cottage__cottage_0"]?.verdict).toBe("fail");
    // Pressed at cottage_1, then reversed from a different station entirely.
    expect(session.stations["cottage__cottage_1"]?.verdicts).toEqual(["pass", "fail"]);
    expect(session.stations["cottage__cottage_1"]?.verdict).toBe("fail");
    expect(session.stations["roofs__roofs_hip_boreal_pine"]?.verdict).toBeNull();
    expect(session.totals).toMatchObject({ verdicts: 3, pass: 1, fail: 2 });
  });

  it("attaches the manifest's provenance and flags a station it does not know", () => {
    expect(session.stations["cottage__cottage_0"]?.provenance).toMatchObject({ row: "cottage" });
    expect(session.stations["cottage__cottage_0"]?.unknown).toBe(false);
    const stray = buildSession({
      events: parseClientLog(chat("10:00:00", ">> STATION ghost"), "l", DAY),
      manifest: MANIFEST,
    });
    expect(stray.stations["ghost"]?.unknown).toBe(true);
    expect(stray.totals.stationsInManifest).toBe(4);
  });

  it("takes the screenshot the client announced with the station it was taken at", () => {
    expect(session.stations["cottage__cottage_0"]?.screenshots).toEqual([
      { file: "2026-07-29_18.20.25.png", t: new Date(2026, 6, 29, 18, 20, 25).getTime(), from: "log" },
    ]);
  });

  it("puts notes made before the first marker aside rather than guessing", () => {
    const early = buildSession({
      events: parseClientLog(
        [chat("10:00:00", "<kai> before anything"), chat("10:00:10", ">> STATION a")].join("\n"),
        "l",
        DAY,
      ),
    });
    expect(early.unassigned.comments.map((c) => c.text)).toEqual(["before anything"]);
    expect(early.stations["a"]?.comments).toHaveLength(0);
  });

  it("leads its summary with the fails and what was said about them", () => {
    const md = renderSessionMarkdown(session);
    expect(md).toContain("## Fails (2)");
    expect(md.indexOf("## Fails")).toBeLessThan(md.indexOf("## Passed"));
    expect(md).toContain("the porch roof floats");
    expect(md).toContain("cottage · cottage · 7x8x7 · gable · temperate_timber");
    expect(md).toContain("**1 pass**, **2 fail**");
    // A station visited and never judged is named, because that is a hole in
    // the review rather than a pass.
    expect(md).toContain("## Visited without a verdict (2)");
  });
});

/* -------------------------------------------------------------------------- */
/* files                                                                       */
/* -------------------------------------------------------------------------- */

describe("reading files", () => {
  it("concatenates two logs into one ordered session", async () => {
    const dir = await scratchDir("logs");
    const first = path.join(dir, "2026-07-29-1.log");
    const second = path.join(dir, "2026-07-29-2.log");
    await writeFile(
      first,
      [chat("18:00:00", ">> STATION a"), chat("18:00:05", "<kai> note on a")].join("\n"),
    );
    await writeFile(
      second,
      [chat("19:00:00", ">> STATION b"), chat("19:00:05", "<kai> note on b")].join("\n"),
    );

    const events = [...(await readClientLog(first)), ...(await readClientLog(second))];
    const session = buildSession({ events, logs: [first, second] });
    expect(Object.keys(session.stations)).toEqual(["a", "b"]);
    expect(session.stations["a"]?.comments.map((c) => c.text)).toEqual(["note on a"]);
    expect(session.stations["b"]?.comments.map((c) => c.text)).toEqual(["note on b"]);

    // Order of the files on the command line must not matter: the events are
    // sorted by their own timestamps.
    const reversed = buildSession({ events: [...events].reverse() });
    expect(Object.keys(reversed.stations)).toEqual(["a", "b"]);
  });

  it("times a screenshot from its name, and falls back to the mtime", async () => {
    const dir = await scratchDir("shots");
    const named = path.join(dir, "2026-07-29_18.20.30.png");
    const odd = path.join(dir, "cropped.png");
    await writeFile(named, "");
    await writeFile(odd, "");
    const when = new Date(2026, 6, 29, 18, 21, 10);
    await utimes(odd, when, when);

    const shots = await readScreenshots(dir);
    expect(shots.map((s) => s.source)).toEqual(["filename", "mtime"]);
    expect(shots[0]?.t).toBe(new Date(2026, 6, 29, 18, 20, 30).getTime());
    expect(shots[1]?.t).toBe(when.getTime());
    expect(screenshotTime("nothing-here.png", when)).toEqual({ t: when.getTime(), source: "mtime" });
  });

  it("files each screenshot under the station whose window contains it", async () => {
    const dir = await scratchDir("windows");
    for (const name of ["2026-07-29_18.20.30.png", "2026-07-29_18.20.45.png", "2026-07-29_18.21.10.png"]) {
      await writeFile(path.join(dir, name), "");
    }
    // One before the first arrival, to prove an unassignable shot is not
    // silently attached to whatever came next.
    const early = path.join(dir, "2026-07-29_18.19.00.png");
    await writeFile(early, "");

    const session = buildSession({
      events: parseClientLog(LOG, "latest.log", DAY),
      screenshots: await readScreenshots(dir),
      screenshotDir: dir,
    });
    expect(session.stations["cottage__cottage_0"]?.screenshots.map((s) => s.file)).toEqual([
      // The client's own announcement, and the file taken in the same window;
      // the announced one is not counted twice.
      "2026-07-29_18.20.25.png",
      "2026-07-29_18.20.30.png",
    ]);
    // 18:20:45 is after the arrival at cottage_1 at 18:20:40 — the window, not
    // the file's neighbours, decides.
    expect(session.stations["cottage__cottage_1"]?.screenshots.map((s) => s.file)).toEqual([
      "2026-07-29_18.20.45.png",
    ]);
    expect(session.stations["roofs__roofs_hip_boreal_pine"]?.screenshots.map((s) => s.file)).toEqual([
      "2026-07-29_18.21.10.png",
    ]);
    // 18:19:00 is before the session's first marker at 18:20:02, so it belongs
    // to nobody rather than to whatever came next.
    expect(session.unassigned.screenshots.map((s) => s.file)).toEqual(["2026-07-29_18.19.00.png"]);
    expect(session.totals.screenshots).toBe(5);
  });
});


/* -------------------------------------------------------------------------- */
/* v2 manifests                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A Terrarium v2 session: the reviewer walks a single-structure station and
 * then a multi-structure one.
 *
 * The property under test is the one the format bump was for. A note left in
 * front of a compiled hamlet has to arrive attached to the *list of things that
 * were standing in front of the reviewer* — the mini-document's node paths —
 * because "the inn's roof is wrong" is unusable if nobody can say which node
 * built the inn. Attribution itself stays per station: nothing in a chat line
 * says which of five buildings it meant, and a harvester that guessed would
 * file half the notes against the wrong node. That is v3's problem.
 */
const V2_MANIFEST: ReviewManifest = {
  format: "terrainist-terrarium/2",
  spawn: { id: "_start", provenance: { row: "_start", family: "instructions" } },
  stations: [
    {
      id: "cottage__cottage_0",
      provenance: { row: "cottage", family: "cottage", size: [7, 8, 7] },
    },
    {
      id: "multi__village_slice",
      provenance: { row: "village_slice", family: "terrarium_village_slice", size: [88, 1, 88] },
      structures: [
        { nodePath: "world.hall", id: "hall" },
        { nodePath: "world.inn", id: "inn" },
        { nodePath: "world.smithy", id: "smithy" },
        { nodePath: "world.plaza", id: "plaza" },
      ],
      document: { profile: "settlement", meta: { name: "terrarium_village_slice", worldSeed: 811004 } },
    },
  ],
};

const V2_LOG = [
  chat("19:00:00", "[@] >> STATION cottage__cottage_0"),
  chat("19:00:05", "[PASS] VERDICT cottage__cottage_0 pass"),
  chat("19:00:20", "[@] >> STATION multi__village_slice"),
  chat("19:00:31", "<kai> the inn's roof is wrong and the lane misses the smithy door"),
  chat("19:00:40", "Saved screenshot as 2026-07-29_19.00.40.png"),
  chat("19:00:55", "[FAIL] VERDICT multi__village_slice fail"),
  "",
].join("\n");

describe("a v2 session", () => {
  const session = buildSession({
    events: parseClientLog(V2_LOG, "latest.log", DAY),
    manifest: V2_MANIFEST,
    logs: ["latest.log"],
    manifestPath: "/tmp/terrarium.manifest.json",
  });

  it("reads both manifest formats", () => {
    expect(REVIEW_MANIFEST_FORMATS).toContain("terrainist-terrarium/2");
    expect(REVIEW_MANIFEST_FORMATS).toContain("terrainist-review-rig/1");
    expect(session.source.manifestFormat).toBe("terrainist-terrarium/2");
    // A v1 manifest still joins: the two formats differ only by addition, and
    // the join has always been on the station id.
    const v1 = buildSession({ events: parseClientLog(LOG, "l", DAY), manifest: MANIFEST });
    expect(v1.source.manifestFormat).toBeNull();
    expect(v1.stations["cottage__cottage_0"]?.unknown).toBe(false);
    expect(v1.stations["cottage__cottage_0"]?.structures).toBeUndefined();
  });

  it("aggregates a multi-station exactly as it does a single one", () => {
    const station = session.stations["multi__village_slice"];
    expect(station?.verdict).toBe("fail");
    expect(station?.unknown).toBe(false);
    expect(station?.visits).toHaveLength(1);
    expect(station?.comments).toHaveLength(1);
    expect(station?.screenshots.map((x) => x.file)).toEqual(["2026-07-29_19.00.40.png"]);
    expect(session.totals).toMatchObject({ stationsVisited: 2, pass: 1, fail: 1, comments: 1 });
  });

  it("carries the mini-document's node paths through to the session", () => {
    expect(session.stations["multi__village_slice"]?.structures).toEqual([
      "world.hall",
      "world.inn",
      "world.smithy",
      "world.plaza",
    ]);
    // A single-structure station has none, and gains no empty list.
    expect(session.stations["cottage__cottage_0"]?.structures).toBeUndefined();
  });

  it("lists a failed multi-station's structures in the summary, under its note", () => {
    const md = renderSessionMarkdown(session);
    expect(md).toContain("### multi__village_slice");
    expect(md).toContain("structures: world.hall, world.inn, world.smithy, world.plaza");
    expect(md).toContain("the inn's roof is wrong");
    // The shortlist sits with the note, not somewhere else in the document.
    expect(md.indexOf("structures: world.hall")).toBeLessThan(md.indexOf("the inn's roof is wrong"));
  });
});
