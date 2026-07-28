#!/usr/bin/env node
/**
 * Terrainist CLI.
 *
 * Two real commands, both from the G1 spike:
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

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { emitWorld, loadSpikeDocument } from "@terrainist/compiler";
import type { CompileResult, EmitSummary } from "@terrainist/compiler";
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
  terrainist emit <spec.json> [--out <dir>] [--no-zip]
  terrainist render <worldDir> --out <file.png> [--scale <N>]
  terrainist render <worldDir> --views all --out <dir> [--scale <N>] [--surface-y <Y>]

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
