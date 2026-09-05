/**
 * `terrainist generate` — prompt in, world out.
 *
 * The pipeline in one command: a cheap classifier reads the prompt, the
 * authoring model writes a Loam 1 document against the kit (the validator's
 * diagnostics drive any retries), one bespoke program is authored per thing
 * the catalog cannot make, and the document goes through the compiler and
 * the zipper. `runGenerate` in `index.ts` owns the compile and the optional
 * compile-feedback rounds; this module owns the arguments and the authoring.
 *
 * The default seed is derived from the prompt (BLAKE3), so the same words
 * give the same world unless the caller asks for a different seed.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  attachPrograms,
  authorLoamDoc,
  authorPrograms,
  classifyPromptIntent,
  formatProgramRun,
  DEFAULT_BESPOKE_BUDGET_USD,
  formatClassification,
  AuthoringFailedError,
  AUTHORING_REASONING_EFFORT,
  defaultModel,
  AUTHORING_TEMPERATURE,
  MAX_COMPILE_ROUNDS,
} from "@terrainist/agents";
import type {
  AuthoredDocument as LoamDocument,
  AuthorAttempt,
  AuthorResult,
  AuthoredProgramEntry,
  LoamObject,
  Usage,
} from "@terrainist/agents";
import type { ProgramVerificationGate, SemanticIntent } from "@terrainist/spec/ir";
import { formatDiagnostic, lowerLoam } from "@terrainist/spec";
import { resolveWorldSeed } from "@terrainist/stdlib";

import { parseArgs } from "./args.js";
import { loamRegistries } from "./loam-doc.js";
import { resolveWorldName } from "./world-name.js";

export { loamRegistries } from "./loam-doc.js";

/** The efforts OpenAI names; `--effort` also passes any other single word through to the server. */
export const EFFORT_LEVELS = ["low", "medium", "high"] as const;

/** Parsed `generate` options. */
export interface GenerateOptions {
  readonly prompt: string;
  /** Region edge in blocks. */
  readonly size: number;
  /** Decimal world seed, as a string so 64-bit seeds survive. */
  readonly seed: string;
  readonly outDir: string;
  /** Name the world folder outright (`--name`), bypassing the date stamp. */
  readonly worldName?: string;
  /** Also keep the lowered document and the compile report beside the world. */
  readonly keepDoc: boolean;
  readonly zip: boolean;
  /** Copy the finished world into a Minecraft saves folder. */
  readonly install: boolean;
  /** The saves folder `--install` copies into; the platform default when absent. */
  readonly savesDir?: string;
  readonly model: string;
  /** Reasoning effort (`reasoning_effort`). */
  readonly effort: string;
  /** Sampling temperature for the authoring calls. */
  readonly temperature: number;
  /** How many compile-feedback revision rounds the document may get. */
  readonly compileRounds: number;
}

/** The prompt-derived default seed: BLAKE3 of the prompt, as a decimal string. */
export function seedFromPrompt(prompt: string): string {
  return resolveWorldSeed(prompt).toString();
}

/** Parse `generate` argv. */
export function parseGenerateArgs(args: readonly string[]): GenerateOptions {
  const { flags, positionals } = parseArgs(args, {
    flags: {
      "--out": { type: "value", aliases: ["-o"], missingMessage: "--out requires a directory" },
      "--seed": {
        type: "value",
        missingMessage: "--seed requires a decimal integer",
        validate: (v) => {
          if (!/^-?\d+$/.test(v)) throw new Error("--seed must be a decimal integer");
        },
      },
      "--name": { type: "value", missingMessage: "--name requires a folder name" },
      "--size": {
        type: "value",
        missingMessage: "--size requires a number of blocks",
        validate: (v) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 16 || n > 4096) throw new Error("--size must be an integer in 16..4096");
        },
      },
      "--model": { type: "value", missingMessage: "--model requires a model id" },
      "--effort": {
        type: "value",
        missingMessage: "--effort requires a reasoning effort, e.g. high",
        validate: (v) => {
          if (!/^[\w-]+$/.test(v)) throw new Error("--effort must be one word, e.g. low, medium or high");
        },
      },
      "--temperature": {
        type: "value",
        missingMessage: "--temperature requires a number",
        validate: (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0 || n > 2) throw new Error("--temperature must be a number in 0..2");
        },
      },
      "--compile-rounds": {
        type: "value",
        missingMessage: "--compile-rounds requires a whole number",
        validate: (v) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > 5) throw new Error("--compile-rounds must be an integer in 0..5");
        },
      },
      "--install": { type: "boolean" },
      "--saves": { type: "value", missingMessage: "--saves requires a directory" },
      "--no-zip": { type: "boolean" },
      "--keep-doc": { type: "boolean" },
    },
    positionals: { max: 1 },
    unknown: "unknown option",
    singleDashAsPositional: true,
    allowDoubleDash: true,
  });

  const prompt = positionals[0];
  if (prompt === undefined || prompt.trim() === "") {
    throw new Error('generate requires a prompt, e.g. terrainist generate "a volcanic island"');
  }
  const str = (k: string): string | undefined => (typeof flags[k] === "string" ? (flags[k] as string) : undefined);
  const seed = str("--seed");
  const worldName = str("--name");
  const savesDir = str("--saves");
  if (savesDir !== undefined && flags["--install"] !== true) throw new Error("--saves only makes sense with --install");

  return {
    prompt,
    size: str("--size") === undefined ? 512 : Number(str("--size")),
    seed: seed ?? seedFromPrompt(prompt),
    outDir: str("--out") ?? "out",
    ...(worldName === undefined ? {} : { worldName }),
    keepDoc: flags["--keep-doc"] === true,
    zip: flags["--no-zip"] !== true,
    install: flags["--install"] === true,
    ...(savesDir === undefined ? {} : { savesDir }),
    model: str("--model") ?? defaultModel(),
    effort: str("--effort") ?? AUTHORING_REASONING_EFFORT,
    temperature: str("--temperature") === undefined ? AUTHORING_TEMPERATURE : Number(str("--temperature")),
    compileRounds: str("--compile-rounds") === undefined ? MAX_COMPILE_ROUNDS : Number(str("--compile-rounds")),
  };
}

/** Print the per-attempt authoring summary. */
function printAuthorSummary(result: AuthorResult): void {
  const { usage } = result;
  console.log(
    [
      `authored with ${result.model} in ${result.attempts} attempt(s)`,
      ...result.diagnosticsPerAttempt.map((diags, i) =>
        `  attempt ${i + 1}   ${diags.length === 0 ? "valid" : `${diags.length} problem(s): ${diags.map((d) => `${d.code} ${d.name}@${d.nodePath === "" ? "<document>" : d.nodePath}`).join(", ")}`}`,
      ),
      `  tokens     ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens}${usage.cost === undefined ? "" : `  ($${usage.cost.toFixed(4)})`}`,
    ].join("\n"),
  );
}

/** Render every attempt's diagnostics after a failed authoring run. */
export function printAuthorFailure(failure: AuthoringFailedError): void {
  console.error(`terrainist: authoring failed after ${failure.attempts} attempt(s)`);
  failure.diagnosticsPerAttempt.forEach((diags, i) => {
    console.error(`\n--- attempt ${i + 1}: ${diags.length} problem(s) ---`);
    for (const d of diags) console.error(formatDiagnostic(d));
  });
  const { usage } = failure;
  console.error(
    `\ntokens ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens}${usage.cost === undefined ? "" : ` ($${usage.cost.toFixed(4)})`}`,
  );
}

/**
 * Persist the model's rejected replies beside the document, so a failed or
 * retried run can be read back: one JSON file with every attempt's raw text
 * and the diagnostics it earned. Written only when something was rejected.
 *
 * @returns the file's path, or `undefined` when every attempt was clean.
 */
export async function writeAuthoringRecord(
  outDir: string,
  stem: string,
  history: readonly AuthorAttempt[],
  outcome: "valid" | "failed",
): Promise<string | undefined> {
  const rejected = history.filter((a) => a.diagnostics.length > 0);
  if (rejected.length === 0) return undefined;
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${stem}.authoring.json`);
  await writeFile(
    file,
    `${JSON.stringify(
      {
        outcome,
        attempts: history.map((a) => ({
          attempt: a.index + 1,
          diagnostics: a.diagnostics,
          usage: a.usage,
          reply: a.raw,
        })),
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

/** What {@link authorAndWriteDocument} produced. */
export interface AuthoredDocument {
  readonly result: AuthorResult;
  /** The Loam 1 document as written to disk — programs attached, if any were. */
  readonly loam: LoamObject;
  /** `loam` lowered for the compiler. Never written unless asked for. */
  readonly doc: LoamDocument;
  /**
   * The frozen programs map, so a later revision round can re-attach it: a
   * revision rewrites the document, and the programs it was authored beside
   * are still valid — they were verified against the world seed and size, not
   * against a particular node tree.
   */
  readonly programs: Readonly<Record<string, AuthoredProgramEntry>>;
  /** Every model usage this phase spent, in order. */
  readonly usages: readonly Usage[];
  /** Where the document was written. */
  readonly docPath: string;
  /** Where its world folder should go. */
  readonly worldDir: string;
}

/**
 * Author a document for `options` and write it next to the world folder.
 *
 * Returns `undefined` when every attempt failed validation; the per-attempt
 * diagnostics have already been printed and the replies persisted by then.
 */
export async function authorAndWriteDocument(
  options: GenerateOptions,
  gate?: ProgramVerificationGate,
): Promise<AuthoredDocument | undefined> {
  const outDir = path.resolve(options.outDir);
  console.log(
    [
      `prompt     ${options.prompt}`,
      `seed       ${options.seed}`,
      `size       ${options.size}x${options.size}`,
      `model      ${options.model}`,
      `effort     ${options.effort}  temperature ${options.temperature}`,
      "",
    ].join("\n"),
  );

  // One cheap call before the expensive one, and its output is printed: when a
  // world comes out wrong, this line is the first place to look.
  let intent: SemanticIntent | undefined;
  const classified = await classifyPromptIntent({ prompt: options.prompt, model: options.model });
  console.log(`${formatClassification(classified)}\n`);
  if (!classified.failed && Object.keys(classified.intent).length > 0) intent = classified.intent;

  let result: AuthorResult;
  try {
    result = await authorLoamDoc({
      prompt: options.prompt,
      size: options.size,
      worldSeed: options.seed,
      registries: loamRegistries(),
      model: options.model,
      reasoningEffort: options.effort,
      temperature: options.temperature,
      ...(intent === undefined ? {} : { intent }),
    });
  } catch (err) {
    if (err instanceof AuthoringFailedError) {
      printAuthorFailure(err);
      const record = await writeAuthoringRecord(outDir, `failed-${options.seed}`, err.history, "failed");
      if (record !== undefined) console.error(`\nthe rejected replies were kept at ${record}`);
      return undefined;
    }
    throw err;
  }

  printAuthorSummary(result);
  const usages: Usage[] = [result.usage];
  const name = loamName(result.loam);
  const record = await writeAuthoringRecord(outDir, name, result.history, "valid");
  if (record !== undefined) console.log(`  rejected   ${record}`);

  // Bespoke programs are authored AFTER the document, because what a world
  // wants a program for is something the document has already said. Every
  // program that passes the gate is frozen into the document — source and
  // hashes — so the compile downstream is a pure function and needs no model.
  let loam: LoamObject = result.loam;
  let programs: Readonly<Record<string, AuthoredProgramEntry>> = {};
  if (gate === undefined) {
    console.log("programs   skipped (no verification gate available in this build)\n");
  } else {
    const authored = await authorPrograms({
      prompt: options.prompt,
      worldSeed: options.seed,
      size: options.size,
      gate,
      doc: result.doc,
      model: options.model,
      reasoningEffort: options.effort,
      temperature: options.temperature,
      budgetUsd: DEFAULT_BESPOKE_BUDGET_USD,
      ...(intent === undefined ? {} : { context: JSON.stringify(intent) }),
    });
    console.log(`${formatProgramRun(authored)}\n`);
    programs = authored.programs;
    loam = attachPrograms(loam, programs);
  }

  const doc = lowerLoamObject(loam);
  const docPath = await writeDocument(outDir, loam);
  console.log(`  document   ${docPath}\n`);

  const worldDir = path.join(
    outDir,
    (
      await resolveWorldName({
        base: name,
        outDir,
        ...(options.worldName === undefined ? {} : { name: options.worldName }),
      })
    ).name,
  );
  return { result, loam, doc, programs, usages, docPath, worldDir };
}

/** The document's `name`, which the validator has already required. */
export function loamName(loam: LoamObject): string {
  return typeof loam["name"] === "string" ? (loam["name"] as string) : "world";
}

/** Lower a Loam 1 object for the compiler. */
export function lowerLoamObject(loam: LoamObject): LoamDocument {
  return lowerLoam(loam, loamRegistries()) as unknown as LoamDocument;
}

/** Write a Loam 1 document as `<outDir>/<name>.loam.json`; returns its path. */
export async function writeDocument(outDir: string, loam: LoamObject): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const docPath = path.join(outDir, `${loamName(loam)}.loam.json`);
  await writeFile(docPath, `${JSON.stringify(loam, null, 2)}\n`);
  return docPath;
}

/**
 * Write a debugging sidecar as pretty JSON beside the world, with the two
 * values `JSON.stringify` refuses or mangles handled deliberately: bigints
 * become decimal strings, non-finite numbers become their names.
 */
export async function writeSidecar(outDir: string, fileName: string, value: unknown): Promise<string> {
  const dir = path.resolve(outDir);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, fileName);
  await writeFile(
    target,
    `${JSON.stringify(
      value,
      (_key, v: unknown) => {
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "number" && !Number.isFinite(v)) return String(v);
        return v;
      },
      2,
    )}\n`,
  );
  return target;
}

/** Print what one compile-feedback round asked for and what it cost. */
export function printReviseSummary(round: number, result: AuthorResult): void {
  const { usage } = result;
  console.log(
    [
      `  revision ${round} authored in ${result.attempts} attempt(s)`,
      `  tokens     ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens}${usage.cost === undefined ? "" : `  ($${usage.cost.toFixed(4)})`}`,
      "",
    ].join("\n"),
  );
}
