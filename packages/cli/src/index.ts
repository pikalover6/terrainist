#!/usr/bin/env node
/**
 * Terrainist CLI.
 *
 * The whole pipeline, and every useful place to enter it partway:
 *
 * - **`generate "<prompt>"`** — an authoring model writes a Loam document, the
 *   compiler builds it, and author-actionable findings go back for revision
 *   rounds. Needs `OPENROUTER_API_KEY`.
 * - **`compile <doc.loam.json>`** — build a world from a document that already
 *   exists. The entry point for debugging the compiler, because it takes the
 *   model out of the loop entirely.
 * - **`install <worldDir>`** — copy a built world into the saves directory.
 * - **`devworld`** / **`terrarium`** — the two review worlds: the exhibit grid
 *   of everything the grammar can build, and the multi-structure station world
 *   wired for walking a change rather than reading about it.
 * - **`catalog`** — the structure registry, as text or `--json`.
 * - **`review-import`** — fold an in-game session's logs and screenshots into
 *   one session file. With `--world` it runs in free-roam mode instead, where
 *   an F3+C position pasted into chat anchors the notes that follow it.
 * - **`emit <spec.json>`** — the pre-Loam spike emitter, kept because the
 *   golden pyramid still goes through it.
 * - **`render <worldDir>`** — a deterministic top-down PNG, or the whole
 *   multi-angle view set (isometric corners, maps, cutaways, sections).
 *
 * Each command's own options are printed by `--help`; `usage()` below is the
 * single source of that text.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildDevWorld,
  buildTerrarium,
  compileTerrain,
  emitWorld,
  formatDiagnostic,
  loadSpikeDocument,
} from "@terrainist/compiler";
import type { CompileResult, EmitSummary, TerrainCompileReport } from "@terrainist/compiler";
import { DEFAULT_SCALE, renderTopDown, renderWorldViews, worldToGrid } from "@terrainist/render";
import type { RenderView, WorldViewOptions } from "@terrainist/render";

import { AuthoringFailedError, reviseLoamDoc, sumUsage } from "@terrainist/agents";
import type { Usage } from "@terrainist/agents";

import {
  STRUCTURE_CATALOG,
  STRUCTURE_CATEGORIES,
  summarizeCatalog,
  type StructureStatus,
} from "@terrainist/stdlib";

import {
  physicsLintFailures,
  renderCompileFeedback,
  renderDiagnosticFeedback,
} from "./feedback.js";
import {
  authorAndWriteDocument,
  discardDocument,
  parseGenerateArgs,
  printAuthorFailure,
  printReviseSummary,
  seedFromPrompt,
  writeDocument,
} from "./generate.js";
import { defaultSavesDir, installWorld } from "./install.js";
import { gitProvenance } from "./provenance.js";
import {
  buildFreeRoamSession,
  readCompileReport,
  renderFreeRoamMarkdown,
  reportCandidatePaths,
  type FreeRoamReport,
} from "./review-freeroam.js";
import {
  buildSession,
  readClientLog,
  readManifest,
  readScreenshots,
  renderSessionMarkdown,
  type ReviewEvent,
  type ReviewManifest,
  type ReviewScreenshot,
} from "./review-import.js";
import { zipWorld } from "./zip.js";

/** Parsed CLI invocation. */
export interface CliInvocation {
  command: string;
  args: readonly string[];
}

const USAGE = `terrainist — text prompt to Minecraft world

Usage:
  terrainist generate "<prompt>" [--size 512] [--seed N] [--out <dir>]
                                 [--kit settlement|terrain] [--compile-rounds N]
                                 [--keep-doc] [--no-zip] [--allow-unstable]
  terrainist install <worldDir> [--saves <dir>] [--replace] [--force]
                                [--channel <name>]
  terrainist compile <doc.loam.json> [--out <dir>] [--no-zip] [--allow-unstable]
                                     [--report <file.json>]
  terrainist devworld [--out <dir>] [--no-zip]
  terrainist terrarium [--out <dir>] [--no-zip]
  terrainist review-import [--log <file>]... [--screenshots <dir>]
                           [--manifest <file>] [--out <session.json>]
                           [--world <name>] [--report <file.json>]
  terrainist catalog [--json] [--category <name>] [--status <name>]
  terrainist emit <spec.json> [--out <dir>] [--no-zip]
  terrainist render <worldDir> --out <file.png> [--scale <N>]
  terrainist render <worldDir> --views all --out <dir> [--scale <N>] [--surface-y <Y>]

generate options:
  --size <N>        Region edge length in blocks (default: 512).
  --seed <N>        World seed (default: BLAKE3 of the prompt).
  --out <dir>       Output directory (default: out).
  --kit <name>      Spec kit the model authors against: "settlement" (default,
                    terrain + plaza, buildings, roads and constraints) or
                    "terrain" (terrain profile only).
  --compile-rounds <N>
                    Compile-feedback revision rounds (default: 2, max 5). After
                    each compile, author-actionable findings — an unclosed
                    basin rim, an unroutable road, a demoted or dropped
                    layout node — go back to the model for a revision.
  --keep-doc        Keep the authored .loam.json after a successful compile.
  --model <id>      Override the pinned authoring model.
  --effort <level>  Reasoning effort: low, medium, high (default), xhigh, max.
  Requires OPENROUTER_API_KEY in the repo-root .env or the environment.

install options:
  --saves <dir>     Saves directory (default: ${defaultSavesDir()}).
  --replace         Replace an existing save of the same name in place —
                    delete it, copy this one over it, stamp a fresh
                    LastPlayed. Without it a name collision never overwrites
                    and installs as <name>-2, <name>-3, ...
                    Refuses if Minecraft has that save open: replacing a
                    loaded world leaves it unopenable, because the game
                    rewrites level.dat on quit and the world gen settings it
                    keeps in data/minecraft/ have already been deleted.
  --force           Replace even if the save looks open. For a stale lock only.
  --channel <name>  Install as <world>_<name> (e.g. "nightly", "baseline") and
                    rewrite the in-game world name to match, so two channels of
                    the same world sit side by side and are told apart in the
                    world list.
  Stamps level.dat's LastPlayed with the current time — the only place
  Terrainist reads the wall clock.

compile options:
  --out <dir>       Output directory (default: out). The world folder is
                    written to <dir>/<meta.name>/ and the archive alongside it.
  --no-zip          Skip creating the .zip.
  --allow-unstable  Downgrade LOAM-T110 (unstable fluid) to a warning.
  --report <file>   Write the full compile report as JSON.

devworld options:
  --out <dir>       Output directory (default: out). Writes <dir>/dev_world/
                    and the archive alongside it.
  --no-zip          Skip creating the .zip.
  A superflat showcase world: a grid of every building archetype crossed with
  the size, storey, theme and roof gradients, on a lit, empty grass plain.
  Fixed seed — two builds are diffable by eye.

terrarium options:
  --out <dir>       Output directory (default: out). Writes <dir>/terrarium/,
                    <dir>/terrarium.manifest.json and the archive alongside.
  --no-zip          Skip creating the .zip.
  The human-review world: one void-floating station per exhibit, each with an
  arrival pressure plate that announces the station in chat, NEXT/PREV teleport
  buttons and PASS/FAIL verdict buttons. Single-structure stations come first;
  after them a band of multi-structure stations, each a whole mini-settlement
  put through the real compiler — a lane arriving at a door, two cellars joined
  by a tunnel, a plaza with four buildings, a pier over water. Fixed seed.

review-import options:
  --log <file>      A Minecraft client log to read; repeatable, and read in
                    the order given. Defaults to the client's latest.log.
  --screenshots <dir>
                    Screenshot directory; each PNG is filed under the station
                    whose visit window contains its timestamp.
  --manifest <file> The Terrarium manifest, to attach each station's
                    provenance. Both terrainist-terrarium/2 and the older
                    terrainist-review-rig/1 are read.
  --world <name>    Free-roam mode: review a whole generated world instead of
                    a station rig. There are no plates or verdict buttons —
                    press F3+C in game and paste the copied teleport command
                    into chat, and every note typed after it is filed against
                    that position.
  --report <file>   A "terrainist compile --report" JSON, so each position is
                    joined to the nearest structure or marker. Free-roam only;
                    without one the mode still works, just without the join.
  --out <file>      Session JSON to write (default: review-session.json). A
                    markdown summary is written alongside it as <file>.md.

emit options:
  --out <dir>       Output directory (default: out). The world folder is
                    written to <dir>/<name>/ and the archive to
                    <dir>/<name>.zip.
  --no-zip          Skip creating the .zip.

render options:
  --out <path>      PNG to write, or the directory to fill with --views.
  --scale <N>       Pixels per block (default: ${DEFAULT_SCALE}).
  --views all       Write the full view set (four isometric corners, top-down
                    map, cutaways and sections) as <dir>/<name>.png.
  --surface-y <Y>   Y below which content is underground; adds an
                    underground-only map to --views. Off by default.
`;

/**
 * `terrainist catalog [--json] [--category <c>] [--status <s>]`.
 *
 * The structure registry, printed. `--json` is the machine form the artifact
 * build reads; without it the same data comes out as a coverage table, which
 * is what a human wants when the question is "how much of this is real".
 */
export function runCatalog(args: readonly string[]): number {
  let asJson = false;
  let category: string | undefined;
  let status: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      asJson = true;
    } else if (arg === "--category") {
      category = args[i + 1];
      if (category === undefined) throw new Error("--category requires a name");
      i++;
    } else if (arg === "--status") {
      status = args[i + 1];
      if (status === undefined) throw new Error("--status requires a name");
      i++;
    } else {
      throw new Error(`unexpected argument ${String(arg)}`);
    }
  }
  const rows = STRUCTURE_CATALOG.filter(
    (e) => (category === undefined || e.category === category) && (status === undefined || e.status === status),
  );
  if (asJson) {
    console.log(
      JSON.stringify(
        { summary: summarizeCatalog(), categories: STRUCTURE_CATEGORIES, entries: rows },
        null,
        2,
      ),
    );
    return 0;
  }
  const summary = summarizeCatalog();
  const label: Readonly<Record<StructureStatus, string>> = {
    implemented: "done",
    in_progress: "wip ",
    not_started: "    ",
  };
  const lines: string[] = [
    `terrainist structure catalog — ${summary.total} entries, ` +
      `${summary.byStatus.implemented} implemented, ` +
      `${summary.byStatus.in_progress} in progress, ` +
      `${summary.byStatus.not_started} not started`,
    "",
  ];
  for (const category_ of STRUCTURE_CATEGORIES) {
    const inCategory = rows.filter((e) => e.category === category_);
    if (inCategory.length === 0) continue;
    const done = inCategory.filter((e) => e.status === "implemented").length;
    lines.push(`${category_}  (${done}/${inCategory.length})`);
    for (const entry of inCategory) {
      lines.push(`  [${label[entry.status]}] ${entry.id.padEnd(26)} ${entry.name}`);
    }
    lines.push("");
  }
  console.log(lines.join("\n"));
  return 0;
}

/** `terrainist devworld [--out <dir>]` — the building-grammar showcase world. */
export async function runDevWorld(args: readonly string[]): Promise<number> {
  let outDir = "out";
  let zip = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" || arg === "-o") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--out requires a directory");
      outDir = value;
      i++;
    } else if (arg === "--no-zip") {
      zip = false;
    } else {
      throw new Error(`unexpected argument ${String(arg)}`);
    }
  }

  const result = await buildDevWorld(path.resolve(outDir));
  const zipPath = zip ? await zipWorld(result.emit.worldDir) : undefined;

  const rows = new Map<string, number>();
  for (const e of result.grid.exhibits) rows.set(e.row, (rows.get(e.row) ?? 0) + 1);
  const { region } = result.grid;
  const lines = [
    `built "dev_world" — ${result.emit.minecraftVersion} (DataVersion ${result.emit.dataVersion})`,
    `  world      ${result.emit.worldDir}`,
    `  grid       ${rows.size} rows, ${result.buildingCount} buildings ` +
      `(${[...rows].map(([r, n]) => `${r}=${n}`).join(", ")})`,
    `  plain      ${region.width}x${region.depth} at (${region.x0}, ${region.z0}), grass at y 64`,
    `  chunks     ${result.emit.chunkCount}`,
    `  blocks     ${result.emit.blockCount} (${result.emit.structureBlockCount} building)`,
    `  lights     ${result.lightCount}`,
    `  fluids     ${result.fluids.unstable} unstable`,
    `  spawn      [${result.emit.spawn.join(", ")}]`,
  ];
  if (zipPath !== undefined) lines.push(`  zip        ${zipPath}`);
  console.log(lines.join("\n"));
  return result.fluids.unstable === 0 ? 0 : 1;
}

/** `terrainist terrarium [--out <dir>]` — the human-review world. */
export async function runTerrarium(args: readonly string[]): Promise<number> {
  let outDir = "out";
  let zip = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" || arg === "-o") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--out requires a directory");
      outDir = value;
      i++;
    } else if (arg === "--no-zip") {
      zip = false;
    } else {
      throw new Error(`unexpected argument ${String(arg)}`);
    }
  }

  const provenance = await gitProvenance();
  const result = await buildTerrarium(path.resolve(outDir), provenance ?? undefined);
  const zipPath = zip ? await zipWorld(result.worldDir) : undefined;

  const kinds = new Map<string, number>();
  for (const s of result.plan.stations) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const { region } = result.plan;
  const lines = [
    `built "terrarium" — ${result.minecraftVersion} (DataVersion ${result.dataVersion})`,
    `  world      ${result.worldDir}`,
    `  manifest   ${result.manifestPath}`,
    `  stations   ${result.stationCount} + spawn ` +
      `(${[...kinds].map(([k, n]) => `${k}=${n}`).join(", ")})`,
    `  multi      ${result.multiStationCount} mini-settlements ` +
      `(${result.tunnels.length} tunnels, ${result.roads.length} lanes)`,
    `  extent     ${region.width}x${region.depth} at (${region.x0}, ${region.z0}), platforms at y ${result.manifest.groundY}`,
    `  chunks     ${result.chunkCount}`,
    `  blocks     ${result.blockCount}`,
    `  entities   ${result.blockEntityCount} block entities (signs and command blocks)`,
    `  spawn      [${result.plan.spawn.landing.x}, ${result.plan.spawn.landing.y}, ${result.plan.spawn.landing.z}]`,
  ];
  if (zipPath !== undefined) lines.push(`  zip        ${zipPath}`);
  lines.push(`\nnext: terrainist install ${result.worldDir}`);
  console.log(lines.join("\n"));
  return 0;
}

/** The client's default log directory on this platform. */
export function defaultLogsDir(): string {
  const home = process.env["HOME"] ?? "";
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "minecraft", "logs");
  }
  if (process.platform === "win32") {
    return path.join(process.env["APPDATA"] ?? home, ".minecraft", "logs");
  }
  return path.join(home, ".minecraft", "logs");
}

/**
 * Free-roam half of `review-import`: fold, join, write, summarise.
 *
 * Resolving a report from `--world` is best effort by design — there is no
 * world registry, so the conventional paths are tried and the absence of one is
 * *said out loud* rather than silently producing a session with no joins.
 */
async function writeFreeRoamSession(opts: {
  events: readonly ReviewEvent[];
  screenshots?: readonly ReviewScreenshot[];
  screenshotDir?: string;
  logs: readonly string[];
  world: string;
  reportPath?: string;
  outFile: string;
}): Promise<number> {
  let reportPath: string | undefined;
  let report: FreeRoamReport | undefined;
  if (opts.reportPath !== undefined) {
    reportPath = path.resolve(opts.reportPath);
    report = await readCompileReport(reportPath);
  } else {
    for (const candidate of reportCandidatePaths(opts.world)) {
      try {
        report = await readCompileReport(candidate);
        reportPath = path.resolve(candidate);
        break;
      } catch {
        // Not there, or not JSON: keep looking, and fall through to no join.
      }
    }
  }

  const session = buildFreeRoamSession({
    events: opts.events,
    ...(opts.screenshots === undefined ? {} : { screenshots: opts.screenshots }),
    logs: opts.logs.map((l) => path.resolve(l)),
    screenshotDir: opts.screenshotDir === undefined ? undefined : path.resolve(opts.screenshotDir),
    world: opts.world,
    reportPath,
    report,
  });

  const outPath = path.resolve(opts.outFile);
  const summaryPath = `${outPath.replace(/\.json$/, "")}.md`;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(session, null, 2)}\n`);
  await writeFile(summaryPath, renderFreeRoamMarkdown(session));

  const t = session.totals;
  console.log(
    [
      `imported ${opts.logs.length} log(s) — free-roam review of ${opts.world}`,
      `  sightings  ${t.sightings} position fix(es)`,
      reportPath === undefined
        ? "  report     none found — sightings have no structure join"
        : `  report     ${reportPath} (${t.joined} joined)`,
      `  notes      ${t.notes} note(s), ${t.screenshots} screenshot(s)`,
      `  session    ${outPath}`,
      `  summary    ${summaryPath}`,
    ].join("\n"),
  );
  return 0;
}

/** `terrainist review-import` — a client log back into a session document. */
export async function runReviewImport(args: readonly string[]): Promise<number> {
  const logs: string[] = [];
  let screenshotDir: string | undefined;
  let manifestPath: string | undefined;
  let world: string | undefined;
  let reportPath: string | undefined;
  let outFile = "review-session.json";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg === "--log") {
      if (value === undefined) throw new Error("--log requires a file");
      logs.push(value);
      i++;
    } else if (arg === "--screenshots") {
      if (value === undefined) throw new Error("--screenshots requires a directory");
      screenshotDir = value;
      i++;
    } else if (arg === "--manifest") {
      if (value === undefined) throw new Error("--manifest requires a file");
      manifestPath = value;
      i++;
    } else if (arg === "--world") {
      if (value === undefined) throw new Error("--world requires a name");
      world = value;
      i++;
    } else if (arg === "--report") {
      if (value === undefined) throw new Error("--report requires a file");
      reportPath = value;
      i++;
    } else if (arg === "--out" || arg === "-o") {
      if (value === undefined) throw new Error("--out requires a file path");
      outFile = value;
      i++;
    } else {
      throw new Error(`unexpected argument ${String(arg)}`);
    }
  }

  if (logs.length === 0) logs.push(path.join(defaultLogsDir(), "latest.log"));

  const events: ReviewEvent[] = [];
  for (const log of logs) events.push(...(await readClientLog(log)));

  let screenshots: ReviewScreenshot[] | undefined;
  if (screenshotDir !== undefined) screenshots = await readScreenshots(screenshotDir);

  if (world !== undefined) {
    return await writeFreeRoamSession({
      logs,
      world,
      ...(reportPath === undefined ? {} : { reportPath }),
      ...(screenshots === undefined ? {} : { screenshots }),
      ...(screenshotDir === undefined ? {} : { screenshotDir }),
      events,
      outFile,
    });
  }

  let manifest: ReviewManifest | undefined;
  if (manifestPath !== undefined) manifest = await readManifest(manifestPath);

  const session = buildSession({
    events,
    ...(screenshots === undefined ? {} : { screenshots }),
    manifest,
    logs: logs.map((l) => path.resolve(l)),
    screenshotDir: screenshotDir === undefined ? undefined : path.resolve(screenshotDir),
    manifestPath: manifestPath === undefined ? undefined : path.resolve(manifestPath),
  });

  const outPath = path.resolve(outFile);
  const summaryPath = `${outPath.replace(/\.json$/, "")}.md`;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(session, null, 2)}\n`);
  await writeFile(summaryPath, renderSessionMarkdown(session));

  const t = session.totals;
  console.log(
    [
      `imported ${logs.length} log(s)`,
      `  stations   ${t.stationsVisited} visited` +
        (t.stationsInManifest === null ? "" : ` of ${t.stationsInManifest}`),
      `  verdicts   ${t.pass} pass, ${t.fail} fail (${t.markers} arrivals)`,
      `  notes      ${t.comments} comment(s), ${t.screenshots} screenshot(s)`,
      `  session    ${outPath}`,
      `  summary    ${summaryPath}`,
    ].join("\n"),
  );
  return 0;
}

export async function runEmit(args: readonly string[]): Promise<void> {
  let specPath: string | undefined;
  let outDir = "out";
  let zip = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" || arg === "-o") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--out requires a directory");
      outDir = value;
      i++;
    } else if (arg === "--no-zip") {
      zip = false;
    } else if (arg !== undefined && arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (specPath === undefined) {
      specPath = arg;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }

  if (specPath === undefined) throw new Error("emit requires a spec file");

  const doc = await loadSpikeDocument(path.resolve(specPath));
  const worldDir = path.join(path.resolve(outDir), doc.name);
  const summary = await emitWorld(doc, worldDir);
  const zipPath = zip ? await zipWorld(summary.worldDir) : undefined;

  printSummary(summary, zipPath);
}

/** `terrainist compile <doc.loam.json> --out <dir>` — the terrain profile pipeline. */
export async function runCompile(args: readonly string[]): Promise<number> {
  let docPath: string | undefined;
  let outDir = "out";
  let zip = true;
  let allowUnstable = false;
  let reportPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" || arg === "-o") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--out requires a directory");
      outDir = value;
      i++;
    } else if (arg === "--report") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--report requires a file path");
      reportPath = value;
      i++;
    } else if (arg === "--no-zip") {
      zip = false;
    } else if (arg === "--allow-unstable") {
      allowUnstable = true;
    } else if (arg !== undefined && arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (docPath === undefined) {
      docPath = arg;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }

  if (docPath === undefined) throw new Error("compile requires a .loam.json document");

  const source = await readFile(path.resolve(docPath), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new Error(`${docPath} is not valid JSON`, { cause: cause as Error });
  }

  const name = typeof (parsed as { meta?: { name?: unknown } })?.meta?.name === "string"
    ? ((parsed as { meta: { name: string } }).meta.name)
    : "world";
  const worldDir = path.join(path.resolve(outDir), name);

  // Read here, not in the compiler: the compiler shells out to nothing, so the
  // checkout's identity has to be handed to it as an input.
  const provenance = await gitProvenance();
  const result = await compileTerrain(parsed, {
    outDir: worldDir,
    allowUnstable,
    ...(provenance === null ? {} : { provenance }),
  });

  if (!result.ok) {
    console.error(`terrainist: ${result.diagnostics.length} problem(s) in ${docPath}\n`);
    for (const d of result.diagnostics) console.error(`${formatDiagnostic(d)}\n`);
    return 1;
  }

  const zipPath = zip ? await zipWorld(result.report.emit.worldDir) : undefined;
  if (reportPath !== undefined) {
    const target = path.resolve(reportPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(result.report, null, 2)}\n`);
  }
  printCompileReport(result.report, zipPath, reportPath);
  return 0;
}

function printCompileReport(
  report: TerrainCompileReport,
  zipPath: string | undefined,
  reportPath: string | undefined,
): void {
  const { stats, timings, emit } = report;
  const biomes = Object.entries(stats.biomeHistogram)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${name.replace("minecraft:", "")} ${((count / stats.columns) * 100).toFixed(1)}%`)
    .join(", ");
  const lines = [
    `compiled "${report.name}" — ${emit.minecraftVersion} (DataVersion ${emit.dataVersion})`,
    `  world      ${emit.worldDir}`,
    `  seed       ${report.worldSeed}`,
    `  region     ${stats.region.width}x${stats.region.depth} at (${stats.region.x0}, ${stats.region.z0})`,
    `  heights    ${stats.minHeight.toFixed(1)}..${stats.maxHeight.toFixed(1)}  sea ${stats.seaLevel}  snow line ${stats.snowLine.toFixed(1)}`,
    `  land       ${(stats.landFraction * 100).toFixed(1)}% of columns above sea level`,
    `  biomes     ${biomes}`,
    `  trees      ${stats.treeCount} (${Object.entries(stats.treesPerNode).map(([k, v]) => `${k}=${v}`).join(", ")})`,
    `  chunks     ${stats.chunkCount}`,
    `  blocks     ${stats.blockCount} (${stats.treeBlockCount} vegetation)`,
    `  markers    ${report.markers.length}`,
    `  spawn      [${emit.spawn.join(", ")}]`,
    `  timings    ${Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(0)}ms`).join("  ")}`,
  ];
  if (report.provenance !== undefined) {
    const p = report.provenance;
    const marks = [p.isBaseline ? "baseline" : p.branch, ...(p.dirty ? ["dirty"] : [])];
    lines.push(`  built from ${p.commit.slice(0, 12)} (${marks.join(", ")})`);
  }
  if (zipPath !== undefined) lines.push(`  zip        ${zipPath}`);
  if (reportPath !== undefined) lines.push(`  report     ${path.resolve(reportPath)}`);
  console.log(lines.join("\n"));
  for (const d of report.diagnostics) console.warn(`\n${formatDiagnostic(d)}`);
}

/**
 * `terrainist generate "<prompt>"` — author with the pinned model, then compile and zip.
 *
 * Two loops, in order. The authoring loop (inside `@terrainist/agents`) makes
 * the document *valid*. Then this one makes the *world* good: compile, look at
 * what the compiler says about the world it just built, and — for the findings
 * the author can actually act on — hand them back and ask for a revision. A
 * compile is a couple of seconds, so up to `--compile-rounds` of them is a
 * cheap way to catch a lake that never filled or a house no lane could reach.
 *
 * A physics-lint failure is never fed back. It means the compiler emitted a
 * world that breaks its own invariants, which no rewording of the document can
 * fix, so the run aborts and says so.
 */
export async function runGenerate(args: readonly string[]): Promise<number> {
  const options = parseGenerateArgs(args);

  const authored = await authorAndWriteDocument(options);
  if (authored === undefined) return 1;

  let session = authored.result;
  let docPath = authored.docPath;
  let worldDir = authored.worldDir;
  const usages: Usage[] = [session.usage];

  for (let round = 0; ; round++) {
    const result = await compileTerrain(session.doc, {
      outDir: worldDir,
      allowUnstable: options.allowUnstable,
    });

    const diagnostics = result.ok ? result.report.diagnostics : result.diagnostics;
    const lint = physicsLintFailures(diagnostics);
    if (lint.length > 0) {
      console.error(
        [
          "",
          "terrainist: PHYSICS LINT FAILED — this is a compiler bug, not a document problem.",
          "The authored document is legal Loam; the compiler still emitted a world that",
          "breaks its own invariants. Do not re-prompt: file this against the compiler,",
          `with the document at ${docPath}.`,
          "",
          ...lint.map(formatDiagnostic),
          "",
        ].join("\n"),
      );
      return 1;
    }

    const feedback = result.ok
      ? renderCompileFeedback(result.report)
      : renderDiagnosticFeedback(result.diagnostics);

    if (result.ok && feedback === undefined) {
      const zipPath = options.zip ? await zipWorld(result.report.emit.worldDir) : undefined;
      await discardDocument(docPath, options.keepDoc);
      printCompileReport(result.report, zipPath, undefined);
      printRunUsage(usages, round);
      console.log(`\nnext: terrainist install ${result.report.emit.worldDir}`);
      return 0;
    }

    const exhausted = round >= options.compileRounds;
    if (result.ok && exhausted) {
      // Warnings only, and no budget left: the world exists and is worth
      // keeping. The findings are printed with the report, as always.
      const zipPath = options.zip ? await zipWorld(result.report.emit.worldDir) : undefined;
      await discardDocument(docPath, options.keepDoc);
      printCompileReport(result.report, zipPath, undefined);
      printRunUsage(usages, round);
      console.log(
        `\nnote: ${options.compileRounds} compile-feedback round(s) used; the findings above remain`,
      );
      console.log(`next: terrainist install ${result.report.emit.worldDir}`);
      return 0;
    }
    if (!result.ok && (exhausted || feedback === undefined)) {
      console.error(
        `terrainist: the authored document failed to compile — ${result.diagnostics.length} problem(s)\n`,
      );
      for (const d of result.diagnostics) console.error(`${formatDiagnostic(d)}\n`);
      console.error(`the document was kept at ${docPath}`);
      printRunUsage(usages, round);
      return 1;
    }

    console.log(`\ncompile feedback, round ${round + 1} of ${options.compileRounds}:\n`);
    console.log(`${feedback as string}\n`);

    try {
      session = await reviseLoamDoc({
        messages: session.messages,
        feedback: feedback as string,
        previous: JSON.stringify(session.doc),
        worldSeed: options.seed,
        size: options.size,
        kitName: session.kitName,
        model: options.model,
        reasoningEffort: options.effort,
      });
    } catch (err) {
      if (err instanceof AuthoringFailedError) {
        console.error("terrainist: the revision never validated; keeping the previous document");
        printAuthorFailure(err);
        usages.push(err.usage);
        continue;
      }
      throw err;
    }
    usages.push(session.usage);
    printReviseSummary(round + 1, session);
    docPath = await writeDocument(path.resolve(options.outDir), session.doc);
    worldDir = path.join(path.resolve(options.outDir), session.doc.meta.name);
  }
}

/** Total spend across authoring and every revision round. */
function printRunUsage(usages: readonly Usage[], rounds: number): void {
  const total = sumUsage(usages);
  console.log(
    `  authoring  ${usages.length} model run(s), ${rounds} compile-feedback round(s), ` +
      `${total.promptTokens} in + ${total.completionTokens} out = ${total.totalTokens} tokens` +
      `${total.cost === undefined ? "" : ` ($${total.cost.toFixed(4)})`}`,
  );
}

/** `terrainist install <worldDir> [--saves <dir>]` — copy into the saves folder. */
export async function runInstall(args: readonly string[]): Promise<number> {
  let worldDir: string | undefined;
  let savesDir: string | undefined;
  let replace = false;
  let force = false;
  let channel: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--saves") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--saves requires a directory");
      savesDir = value;
      i++;
    } else if (arg === "--channel") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--channel requires a name");
      channel = value;
      i++;
    } else if (arg === "--replace") {
      replace = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg !== undefined && arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (worldDir === undefined) {
      worldDir = arg;
    } else {
      throw new Error(`unexpected argument ${String(arg)}`);
    }
  }

  if (worldDir === undefined) throw new Error("install requires a world directory");

  const result = await installWorld({
    worldDir,
    replace,
    force,
    ...(savesDir === undefined ? {} : { savesDir }),
    ...(channel === undefined ? {} : { channel }),
  });

  const lines = [
    `installed "${result.folderName}"`,
    `  from       ${path.resolve(worldDir)}`,
    `  to         ${result.installedPath}`,
    `  lastPlayed ${result.lastPlayed} (${new Date(result.lastPlayed).toISOString()})`,
  ];
  if (result.renamed) {
    lines.push(
      `  note       "${path.basename(path.resolve(worldDir))}" already existed; installed alongside it`,
    );
  }
  if (result.replaced) {
    lines.push(`  note       replaced the existing save of the same name`);
  }
  console.log(lines.join("\n"));
  return 0;
}

export async function runRender(args: readonly string[]): Promise<void> {
  let worldDir: string | undefined;
  let outFile: string | undefined;
  let scale = DEFAULT_SCALE;
  let views = false;
  let surfaceY: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" || arg === "-o") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--out requires a file path");
      outFile = value;
      i++;
    } else if (arg === "--scale" || arg === "-s") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--scale requires a number");
      scale = Number(value);
      if (!Number.isInteger(scale) || scale < 1) {
        throw new Error(`--scale must be a positive integer, got "${value}"`);
      }
      i++;
    } else if (arg === "--views") {
      const value = args[i + 1];
      if (value !== "all") throw new Error(`--views only supports "all", got ${String(value)}`);
      views = true;
      i++;
    } else if (arg === "--surface-y") {
      const value = args[i + 1];
      if (value === undefined) throw new Error("--surface-y requires a number");
      surfaceY = Number(value);
      if (!Number.isInteger(surfaceY)) {
        throw new Error(`--surface-y must be an integer, got "${value}"`);
      }
      i++;
    } else if (arg !== undefined && arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (worldDir === undefined) {
      worldDir = arg;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }

  if (worldDir === undefined) throw new Error("render requires a world directory");
  if (outFile === undefined) {
    throw new Error(views ? "render --views requires --out <dir>" : "render requires --out <file.png>");
  }

  if (views) {
    await renderViews(path.resolve(worldDir), path.resolve(outFile), scale, surfaceY);
    return;
  }

  const result = await renderTopDown(path.resolve(worldDir), { scale });
  const outPath = path.resolve(outFile);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, result.png);

  const { minX, maxX, minZ, maxZ, minY, maxY } = result.bounds;
  console.log(
    [
      `rendered ${result.width}x${result.height} px (scale ${result.scale})`,
      `  world      ${path.resolve(worldDir)}`,
      `  bounds     x ${minX}..${maxX}  z ${minZ}..${maxZ}  (surface y ${minY}..${maxY})`,
      `  columns    ${result.columnCount}`,
      `  png        ${outPath}`,
    ].join("\n"),
  );
}

/** `--views all`: one PNG per named view, plus a manifest line each. */
async function renderViews(
  worldDir: string,
  outDir: string,
  scale: number,
  surfaceY: number | undefined,
): Promise<void> {
  const grid = await worldToGrid(worldDir);
  const options: WorldViewOptions = {
    isoScale: scale,
    orthoScale: scale,
    ...(surfaceY === undefined ? {} : { surfaceY }),
  };
  const views = renderWorldViews(grid, options);

  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const view of views) {
    const file = path.join(outDir, `${view.name}.png`);
    await writeFile(file, view.canvas.toPng());
    written.push(`  ${view.name.padEnd(16)} ${view.canvas.width}x${view.canvas.height}  ${file}`);
  }

  const b = grid.bounds;
  console.log(
    [
      `rendered ${views.length} views (scale ${scale}${surfaceY === undefined ? "" : `, surface y ${surfaceY}`})`,
      `  world      ${worldDir}`,
      `  grid       x ${b.minX}..${b.maxX}  y ${b.minY}..${b.maxY}  z ${b.minZ}..${b.maxZ}`,
      `  palette    ${grid.palette.length} entries`,
      ...written,
    ].join("\n"),
  );
}

function printSummary(summary: EmitSummary, zipPath: string | undefined): void {
  const { min, max } = summary.bounds;
  const lines = [
    `emitted ${summary.minecraftVersion} (DataVersion ${summary.dataVersion})`,
    `  world      ${summary.worldDir}`,
    `  level.dat  ${path.basename(summary.levelDatPath)}`,
    `  regions    ${summary.regionFiles.map((f) => path.basename(f)).join(" ")}`,
    `  chunks     ${summary.chunkCount}`,
    `  blocks     ${summary.blockCount}`,
    `  bounds     [${min.join(", ")}] .. [${max.join(", ")}]`,
    `  spawn      [${summary.spawn.join(", ")}]`,
  ];
  if (zipPath !== undefined) lines.push(`  zip        ${zipPath}`);
  console.log(lines.join("\n"));
}

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "generate":
      return await runGenerate(rest);
    case "install":
      return await runInstall(rest);
    case "compile":
      return await runCompile(rest);
    case "devworld":
      return await runDevWorld(rest);
    // `rig-build` is the v1 name, kept as a hidden alias: it is in shell
    // history, in notes and in at least one script, and a command that used to
    // work should not start printing "unknown command".
    case "terrarium":
    case "rig-build":
      return await runTerrarium(rest);
    case "review-import":
      return await runReviewImport(rest);
    case "catalog":
      return runCatalog(rest);
    case "emit":
      await runEmit(rest);
      return 0;
    case "render":
      await runRender(rest);
      return 0;
    case undefined:
      console.log(USAGE);
      return 1;
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return 0;
    default:
      console.error(`terrainist: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`terrainist: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.cause instanceof Error) {
        console.error(`  caused by: ${error.cause.message}`);
      }
      process.exitCode = 1;
    },
  );
}

export { defaultSavesDir, installWorld, longToMillis, millisToLong, stampLastPlayed, stampLevelDat } from "./install.js";
export { BASELINE_TAG, gitProvenance } from "./provenance.js";
export type { InstallOptions, InstallResult } from "./install.js";
export { parseGenerateArgs, seedFromPrompt } from "./generate.js";
export {
  buildSession,
  chatPayload,
  classifyChat,
  logStartDate,
  parseClientLog,
  readClientLog,
  readManifest,
  readScreenshots,
  renderSessionMarkdown,
  screenshotTime,
} from "./review-import.js";
export {
  buildFreeRoamSession,
  joinCandidates,
  parsePositionFix,
  readCompileReport,
  renderFreeRoamMarkdown,
  reportCandidatePaths,
} from "./review-freeroam.js";
export type {
  FreeRoamInput,
  FreeRoamJoin,
  FreeRoamReport,
  FreeRoamSession,
  FreeRoamSighting,
  PositionFix,
} from "./review-freeroam.js";
export type {
  ReviewComment,
  ReviewEvent,
  ReviewManifest,
  ReviewScreenshot,
  ReviewSession,
  ReviewShot,
  ReviewStation,
  ReviewVisit,
} from "./review-import.js";
export type { GenerateOptions } from "./generate.js";

export type { CompileResult, EmitSummary, RenderView };
