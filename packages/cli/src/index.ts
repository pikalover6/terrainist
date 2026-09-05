#!/usr/bin/env node
/**
 * `terrainist` — the command line.
 *
 *   generate   prompt → Loam 1 document → world (the whole pipeline)
 *   compile    a Loam 1 document → world, no model
 *   install    copy a world folder into a Minecraft saves directory
 *   kit        print the authoring kit (the language, as the model sees it)
 *   catalog    print the structure catalog
 *   ui         the local web UI (generate, browse, install)
 *
 * Every command answers `--help`. Arguments are read by `args.ts`; nothing
 * here depends on a framework.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { compileTerrain, compilerProgramGate, formatDiagnostic } from "@terrainist/compiler";
import type { TerrainCompileReport } from "@terrainist/compiler";
import {
  attachPrograms,
  AuthoringFailedError,
  AUTHORING_MODEL_ID,
  DEFAULT_API_BASE,
  loadAuthorKit,
  reviseLoamDoc,
  sumUsage,
} from "@terrainist/agents";
import type { Usage } from "@terrainist/agents";
import { STRUCTURE_CATALOG, STRUCTURE_CATEGORIES, summarizeCatalog, type StructureStatus } from "@terrainist/stdlib";

import { parseArgs } from "./args.js";
import { physicsLintFailures, renderCompileFeedback, renderDiagnosticFeedback } from "./feedback.js";
import {
  authorAndWriteDocument,
  loamRegistries,
  lowerLoamObject,
  parseGenerateArgs,
  printAuthorFailure,
  printReviseSummary,
  writeDocument,
  writeSidecar,
} from "./generate.js";
import { defaultSavesDir, installWorld } from "./install.js";
import { LoamDocumentError, loadLoamDocument, writeDebugIr, type LoadedLoamDocument } from "./loam-doc.js";
import { gitProvenance } from "./provenance.js";
import { runUi } from "./ui.js";
import { resolveWorldName } from "./world-name.js";
import { zipWorld } from "./zip.js";

/* -------------------------------------------------------------------------- */
/* help                                                                        */
/* -------------------------------------------------------------------------- */

const USAGE = `terrainist — text prompt to Minecraft world

Usage:
  terrainist generate "<prompt>" [options]       author a Loam 1 document, compile it
  terrainist compile <doc.loam.json> [options]   compile a document you already have
  terrainist install <worldDir> [--saves <dir>]  copy a world into Minecraft's saves
  terrainist kit                                 print the authoring kit
  terrainist catalog [--json]                    print the structure catalog
  terrainist ui [--port <n>] [--out <dir>]       the local web UI

Run \`terrainist <command> --help\` for that command's options.

The model is reached through any OpenAI-compatible chat-completions API.
Three settings, from the environment or a \`.env\` file at the repo root:
  TERRAINIST_API_KEY    the key (OPENROUTER_API_KEY is accepted too)
  TERRAINIST_API_BASE   the API root (default ${DEFAULT_API_BASE})
  TERRAINIST_MODEL      the model id (default ${AUTHORING_MODEL_ID})
Only \`generate\` and \`ui\` call a model; everything else runs offline.
`;

const HELP: Readonly<Record<string, string>> = {
  generate: `terrainist generate "<prompt>" [options]

Author a Loam 1 document for the prompt with the pinned model, compile it,
and write the world under --out. The document is kept beside the world as
<name>.loam.json; if the model's first reply was rejected by the validator,
every rejected reply is kept as <name>.authoring.json.

Options:
  --out <dir>            Output directory (default: out).
  --seed <N>             World seed, a decimal integer (default: derived from
                         the prompt, so the same words give the same world).
  --name <folder>        Name the world folder outright instead of
                         <name>_<MMDD>[-N].
  --size <N>             Region edge in blocks, 16..4096 (default: 512).
  --effort <level>       Reasoning effort, sent as reasoning_effort: low,
                         medium, high, or whatever the server accepts
                         (default: high).
  --temperature <t>      Sampling temperature, 0..2 (default: 1).
  --model <id>           Model id (default: TERRAINIST_MODEL, else ${AUTHORING_MODEL_ID}).
  --compile-rounds <N>   Compile-feedback revision rounds, 0..5 (default: 0).
                         Each round shows the model the compiler's findings
                         and asks for a revised document.
  --install              Copy the finished world into Minecraft's saves folder.
  --saves <dir>          The saves folder --install copies into (default: the
                         platform's .minecraft/saves).
  --no-zip               Do not write <world>.zip beside the world folder.
  --keep-doc             Also keep the lowered document (<name>.ir.json) and
                         the compile report (<name>.report.json).

Exit status is 1 when the model never produced a valid document, when the
world failed to compile, or when the compiler's own physics lint failed; the
document and the rejected replies are kept in every case. Nothing is retried
beyond the validator's own attempts.
`,
  compile: `terrainist compile <doc.loam.json> [options]

Compile a Loam 1 document into a world, with no model call. The file must say
"loam": "1"; \`terrainist kit\` prints the language.

Options:
  --out <dir>            Output directory (default: out).
  --name <folder>        Name the world folder outright instead of
                         <name>_<MMDD>[-N].
  --report <file.json>   Write the full compile report.
  --allow-unstable       Package the world even if fluid would flow on the
                         first tick (inspect it; it will visibly drain).
  --debug-ir             Write the lowered document, the compiler's internal
                         representation, as <out>/<name>.ir.json.
  --no-zip               Do not write <world>.zip beside the world folder.
`,
  install: `terrainist install <worldDir> [--saves <dir>]

Copy a compiled world folder into a Minecraft saves directory and stamp its
LastPlayed so it sorts to the top of the world list. An existing save is never
replaced: a name collision installs alongside as <name>-2, <name>-3, ...

Options:
  --saves <dir>          The saves folder (default: the platform's
                         .minecraft/saves; this machine: ${defaultSavesDir()}).
`,
  kit: `terrainist kit

Print the authoring kit — the system prompt the model writes Loam 1 against,
which is also the language reference. Generated from kits/src by
\`npm run kit\`.
`,
  catalog: `terrainist catalog [--json] [--category <name>] [--status <name>]

Print the structure catalog: every building archetype a document may name in
"is", grouped by category, with its status.

Options:
  --json                 Machine-readable output.
  --category <name>      Only this category.
  --status <name>        Only this status (implemented, in_progress, not_started).
`,
  ui: `terrainist ui [--port <n>] [--out <dir>]

Serve the local web UI: generate with a live log, list the worlds under --out,
install one into a Minecraft saves folder of your choosing. One process, no
build step; stop it with Ctrl-C.

Options:
  --port <n>             Port to listen on (default: 4747).
  --out <dir>            Where worlds are generated and listed from (default: out).
  --saves <dir>          The saves folder the page offers by default; any path
                         can be typed on the page (default: the platform's
                         .minecraft/saves).
`,
};

/** `--help`/`-h` anywhere in a command's arguments prints its help. */
function wantsHelp(args: readonly string[]): boolean {
  return args.some((a) => a === "--help" || a === "-h");
}

/* -------------------------------------------------------------------------- */
/* generate                                                                    */
/* -------------------------------------------------------------------------- */

export async function runGenerate(args: readonly string[]): Promise<number> {
  const options = parseGenerateArgs(args);
  const outDir = path.resolve(options.outDir);

  const authored = await authorAndWriteDocument(options, compilerProgramGate());
  if (authored === undefined) return 1;

  let session = authored.result;
  // The Loam 1 document plus any frozen bespoke programs, and its lowering,
  // which is what the compiler sees. A revision round rewrites the document;
  // the programs stay.
  let loam = authored.loam;
  let doc = authored.doc;
  let docPath = authored.docPath;
  const worldDir = authored.worldDir;
  const usages: Usage[] = [...authored.usages];

  for (let round = 0; ; round++) {
    const provenance = await gitProvenance();
    const result = await compileTerrain(doc, {
      outDir: worldDir,
      allowUnstable: false,
      ...(provenance === null ? {} : { provenance }),
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

    const feedback = result.ok ? renderCompileFeedback(result.report) : renderDiagnosticFeedback(result.diagnostics);
    const exhausted = round >= options.compileRounds;

    if (result.ok && (feedback === undefined || exhausted)) {
      const zipPath = options.zip ? await zipWorld(result.report.emit.worldDir) : undefined;
      let irPath: string | undefined;
      let reportPath: string | undefined;
      if (options.keepDoc) {
        irPath = await writeSidecar(outDir, `${result.report.name}.ir.json`, doc);
        reportPath = await writeSidecar(outDir, `${result.report.name}.report.json`, result.report);
      }
      printCompileReport(result.report, { zipPath, docPath, irPath, reportPath });
      printRunUsage(usages, round);
      if (feedback !== undefined) {
        console.log(`\nnote: ${options.compileRounds} compile-feedback round(s) used; the findings above remain`);
      }
      if (options.install) {
        const installed = await installWorld({
          worldDir: result.report.emit.worldDir,
          ...(options.savesDir === undefined ? {} : { savesDir: options.savesDir }),
        });
        printInstall(installed.folderName, result.report.emit.worldDir, installed.installedPath, installed.renamed);
      } else {
        console.log(`\nnext: terrainist install ${result.report.emit.worldDir}`);
      }
      return 0;
    }

    if (!result.ok && (exhausted || feedback === undefined)) {
      console.error(`terrainist: the authored document failed to compile — ${result.diagnostics.length} problem(s)\n`);
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
        previous: session.source,
        programs: authored.programs,
        registries: loamRegistries(),
        worldSeed: options.seed,
        size: options.size,
        kitName: session.kitName,
        model: options.model,
        reasoningEffort: options.effort,
        temperature: options.temperature,
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
    loam = attachPrograms(session.loam, authored.programs);
    doc = lowerLoamObject(loam);
    docPath = await writeDocument(outDir, loam);
    // The world folder name was resolved once, before the first compile; a
    // revision round rewrites the document, never the name.
  }
}

/** Total spend across authoring and every revision round. */
function printRunUsage(usages: readonly Usage[], rounds: number): void {
  const total = sumUsage(usages);
  console.log(
    `  authoring  ${usages.length} model run(s), ${rounds} compile-feedback round(s), ` +
      `${total.promptTokens} in + ${total.completionTokens} out = ${total.totalTokens} tokens` +
      `${total.reasoningTokens === undefined ? "" : ` (${total.reasoningTokens} of the out reasoning)`}` +
      `${total.cost === undefined ? "" : ` ($${total.cost.toFixed(4)})`}`,
  );
}

/* -------------------------------------------------------------------------- */
/* compile                                                                     */
/* -------------------------------------------------------------------------- */

export async function runCompile(args: readonly string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, {
    flags: {
      "--out": { type: "value", aliases: ["-o"], missingMessage: "--out requires a directory" },
      "--name": { type: "value", missingMessage: "--name requires a folder name" },
      "--report": { type: "value", missingMessage: "--report requires a file path" },
      "--no-zip": { type: "boolean" },
      "--allow-unstable": { type: "boolean" },
      "--debug-ir": { type: "boolean" },
    },
    positionals: { max: 1 },
    unknown: "unknown option",
    allowDoubleDash: true,
  });
  const outDir = typeof flags["--out"] === "string" ? (flags["--out"] as string) : "out";
  const zip = flags["--no-zip"] !== true;
  const allowUnstable = flags["--allow-unstable"] === true;
  const debugIr = flags["--debug-ir"] === true;
  const reportPath = typeof flags["--report"] === "string" ? (flags["--report"] as string) : undefined;
  const worldName = typeof flags["--name"] === "string" ? (flags["--name"] as string) : undefined;
  const docPath = positionals[0];
  if (docPath === undefined) throw new Error("compile requires a .loam.json document");

  let loaded: LoadedLoamDocument;
  try {
    loaded = await loadLoamDocument(docPath);
  } catch (err) {
    if (err instanceof LoamDocumentError) {
      console.error(`terrainist: ${err.render()}`);
      return 1;
    }
    throw err;
  }
  let irPath: string | undefined;
  if (debugIr) irPath = await writeDebugIr(outDir, loaded.name, loaded.doc);

  const resolved = await resolveWorldName({
    base: loaded.name,
    outDir,
    ...(worldName === undefined ? {} : { name: worldName }),
  });
  const worldDir = path.join(path.resolve(outDir), resolved.name);

  // Read here, not in the compiler: the compiler shells out to nothing, so the
  // checkout's identity has to be handed to it as an input.
  const provenance = await gitProvenance();
  const result = await compileTerrain(loaded.doc, {
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
  let reportOut: string | undefined;
  if (reportPath !== undefined) {
    reportOut = path.resolve(reportPath);
    await mkdir(path.dirname(reportOut), { recursive: true });
    await writeFile(reportOut, `${JSON.stringify(result.report, null, 2)}\n`);
  }
  printCompileReport(result.report, { zipPath, docPath, irPath, reportPath: reportOut });
  return 0;
}

function printCompileReport(
  report: TerrainCompileReport,
  paths: { zipPath?: string | undefined; docPath?: string | undefined; irPath?: string | undefined; reportPath?: string | undefined },
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
  if (stats.programs !== undefined && stats.programs.length > 0) {
    const built = stats.programs
      .map((p) => `${p.nodePath}=${p.programId}×${p.instances} (${p.blockCount} blocks)`)
      .join(", ");
    lines.push(`  programs   ${built}`);
  }
  if (report.provenance !== undefined) {
    const p = report.provenance;
    lines.push(`  built from ${p.commit.slice(0, 12)} (${p.branch}${p.dirty ? ", dirty" : ""})`);
  }
  if (paths.zipPath !== undefined) lines.push(`  zip        ${paths.zipPath}`);
  if (paths.docPath !== undefined) lines.push(`  doc        ${path.resolve(paths.docPath)}`);
  if (paths.irPath !== undefined) lines.push(`  ir         ${paths.irPath}`);
  if (paths.reportPath !== undefined) lines.push(`  report     ${paths.reportPath}`);
  console.log(lines.join("\n"));
  for (const d of report.diagnostics) console.warn(`\n${formatDiagnostic(d)}`);
}

/* -------------------------------------------------------------------------- */
/* install                                                                     */
/* -------------------------------------------------------------------------- */

export async function runInstall(args: readonly string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, {
    flags: {
      "--saves": { type: "value", missingMessage: "--saves requires a directory" },
    },
    positionals: { max: 1 },
    unknown: "unknown option",
    allowDoubleDash: true,
  });
  const savesDir = typeof flags["--saves"] === "string" ? (flags["--saves"] as string) : undefined;
  const worldDir = positionals[0];
  if (worldDir === undefined) throw new Error("install requires a world directory");

  const result = await installWorld({
    worldDir,
    ...(savesDir === undefined ? {} : { savesDir }),
  });
  printInstall(result.folderName, worldDir, result.installedPath, result.renamed);
  return 0;
}

function printInstall(folderName: string, worldDir: string, installedPath: string, renamed: boolean): void {
  const lines = [
    `installed "${folderName}"`,
    `  from       ${path.resolve(worldDir)}`,
    `  to         ${installedPath}`,
  ];
  if (renamed) {
    lines.push(`  note       "${path.basename(path.resolve(worldDir))}" already existed there; installed alongside it`);
  }
  console.log(lines.join("\n"));
}

/* -------------------------------------------------------------------------- */
/* catalog                                                                     */
/* -------------------------------------------------------------------------- */

export function runCatalog(args: readonly string[]): number {
  const { flags } = parseArgs(args, {
    flags: {
      "--json": { type: "boolean" },
      "--category": { type: "value", missingMessage: "--category requires a name" },
      "--status": { type: "value", missingMessage: "--status requires a name" },
    },
    positionals: { max: 0 },
    unknown: "unexpected argument",
    allowDoubleDash: true,
  });
  const asJson = flags["--json"] === true;
  const category = typeof flags["--category"] === "string" ? (flags["--category"] as string) : undefined;
  const status = typeof flags["--status"] === "string" ? (flags["--status"] as string) : undefined;

  const rows = STRUCTURE_CATALOG.filter(
    (e) => (category === undefined || e.category === category) && (status === undefined || e.status === status),
  );
  if (asJson) {
    console.log(JSON.stringify({ summary: summarizeCatalog(), categories: STRUCTURE_CATEGORIES, entries: rows }, null, 2));
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

/* -------------------------------------------------------------------------- */
/* main                                                                        */
/* -------------------------------------------------------------------------- */

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== undefined && HELP[command] !== undefined && wantsHelp(rest)) {
    console.log(HELP[command]);
    return 0;
  }
  switch (command) {
    case "generate":
      return await runGenerate(rest);
    case "compile":
      return await runCompile(rest);
    case "install":
      return await runInstall(rest);
    case "kit":
      if (rest.length > 0) throw new Error(`kit takes no arguments (got ${rest[0]})`);
      process.stdout.write(await loadAuthorKit());
      return 0;
    case "catalog":
      return runCatalog(rest);
    case "ui":
      return await runUi(rest);
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
export type { InstallOptions, InstallResult } from "./install.js";
export { gitProvenance } from "./provenance.js";
export { parseGenerateArgs, seedFromPrompt } from "./generate.js";
export type { GenerateOptions } from "./generate.js";
