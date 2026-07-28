#!/usr/bin/env node
/**
 * Terrainist CLI.
 *
 * Three commands:
 *
 *   terrainist compile <doc.loam.json> --out <dir>
 *
 * which compiles a Loam terrain-profile document into a Minecraft world;
 *
 *   terrainist emit <spec.json> --out <dir>
 *
 * which compiles a `terrainist-spike-0` fixture into `<dir>/<name>/`
 * (level.dat + region/) and packages it as `<dir>/<name>.zip`; and
 *
 *   terrainist render <worldDir> --out <file.png>
 *   terrainist render <worldDir> --views all --out <dir>
 *
 * which render that world top-down to a deterministic PNG, or write the whole
 * multi-angle view set (isometric corners, maps, cutaways, sections) as one
 * PNG per view.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { compileTerrain, emitWorld, formatDiagnostic, loadSpikeDocument } from "@terrainist/compiler";
import type { CompileResult, EmitSummary, TerrainCompileReport } from "@terrainist/compiler";
import { DEFAULT_SCALE, renderTopDown, renderWorldViews, worldToGrid } from "@terrainist/render";
import type { RenderView, WorldViewOptions } from "@terrainist/render";

import { zipWorld } from "./zip.js";

/** Parsed CLI invocation. */
export interface CliInvocation {
  command: string;
  args: readonly string[];
}

const USAGE = `terrainist — text prompt to Minecraft world

Usage:
  terrainist compile <doc.loam.json> [--out <dir>] [--no-zip] [--allow-unstable]
                                     [--report <file.json>]
  terrainist emit <spec.json> [--out <dir>] [--no-zip]
  terrainist render <worldDir> --out <file.png> [--scale <N>]
  terrainist render <worldDir> --views all --out <dir> [--scale <N>] [--surface-y <Y>]

compile options:
  --out <dir>       Output directory (default: out). The world folder is
                    written to <dir>/<meta.name>/ and the archive alongside it.
  --no-zip          Skip creating the .zip.
  --allow-unstable  Downgrade LOAM-T110 (unstable fluid) to a warning.
  --report <file>   Write the full compile report as JSON.

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

  const result = await compileTerrain(parsed, { outDir: worldDir, allowUnstable });

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
  if (zipPath !== undefined) lines.push(`  zip        ${zipPath}`);
  if (reportPath !== undefined) lines.push(`  report     ${path.resolve(reportPath)}`);
  console.log(lines.join("\n"));
  for (const d of report.diagnostics) console.warn(`\n${formatDiagnostic(d)}`);
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
    case "compile":
      return await runCompile(rest);
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

export type { CompileResult, EmitSummary, RenderView };
