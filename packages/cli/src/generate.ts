/**
 * `terrainist generate` — prompt in, world out.
 *
 * The whole pipeline in one command: GLM 5.2 authors a document against a spec
 * kit (the settlement kit by default, `--kit terrain` for terrain alone), the
 * validator's diagnostics drive any retries, and the resulting document goes
 * through the ordinary compiler and zipper. `runGenerate` then adds the
 * compile-feedback loop on top. Nothing looks at pixels.
 *
 * The default seed is derived from the prompt (BLAKE3, via the stdlib's §6.1
 * world-seed resolution), so the same words give the same world unless the
 * caller asks for a different seed.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  authorLoamDoc,
  AuthoringFailedError,
  DEFAULT_KIT,
  GLM_MODEL_ID,
  MAX_COMPILE_ROUNDS,
} from "@terrainist/agents";
import type { AuthoredDocument as LoamDocument, AuthorResult, KitName } from "@terrainist/agents";
import { formatDiagnostic } from "@terrainist/compiler";
import { resolveWorldSeed } from "@terrainist/stdlib";

/** Parsed `generate` options. */
export interface GenerateOptions {
  readonly prompt: string;
  readonly size: number;
  readonly seed: string;
  readonly outDir: string;
  readonly keepDoc: boolean;
  readonly zip: boolean;
  readonly allowUnstable: boolean;
  readonly model: string;
  /** Which spec kit authors the document. */
  readonly kit: KitName;
  /** How many compile-feedback revision rounds the document gets. */
  readonly compileRounds: number;
}

/** The prompt-derived default seed: BLAKE3 of the prompt, as a decimal string. */
export function seedFromPrompt(prompt: string): string {
  return resolveWorldSeed(prompt).toString();
}

/** Parse `generate` argv. */
export function parseGenerateArgs(args: readonly string[]): GenerateOptions {
  let prompt: string | undefined;
  let size = 512;
  let seed: string | undefined;
  let outDir = "out";
  let keepDoc = false;
  let zip = true;
  let allowUnstable = false;
  let model = GLM_MODEL_ID;
  let kit: KitName = DEFAULT_KIT;
  let compileRounds = MAX_COMPILE_ROUNDS;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = (): string => {
      const value = args[i + 1];
      if (value === undefined) throw new Error(`${String(arg)} requires a value`);
      i++;
      return value;
    };
    if (arg === "--size") {
      size = Number(next());
      if (!Number.isInteger(size) || size < 16 || size > 4096) {
        throw new Error("--size must be an integer in 16..4096");
      }
    } else if (arg === "--seed") {
      const value = next();
      if (!/^-?\d+$/.test(value)) throw new Error("--seed must be a decimal integer");
      seed = value;
    } else if (arg === "--out" || arg === "-o") {
      outDir = next();
    } else if (arg === "--model") {
      model = next();
    } else if (arg === "--kit") {
      const value = next();
      if (value !== "terrain" && value !== "settlement") {
        throw new Error('--kit must be "terrain" or "settlement"');
      }
      kit = value;
    } else if (arg === "--compile-rounds") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 0 || value > 5) {
        throw new Error("--compile-rounds must be an integer in 0..5");
      }
      compileRounds = value;
    } else if (arg === "--keep-doc") {
      keepDoc = true;
    } else if (arg === "--no-zip") {
      zip = false;
    } else if (arg === "--allow-unstable") {
      allowUnstable = true;
    } else if (arg !== undefined && arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    } else if (prompt === undefined) {
      prompt = arg;
    } else {
      throw new Error(`unexpected argument ${String(arg)}`);
    }
  }

  if (prompt === undefined || prompt.trim() === "") {
    throw new Error('generate requires a prompt, e.g. terrainist generate "a volcanic island"');
  }

  return {
    prompt,
    size,
    seed: seed ?? seedFromPrompt(prompt),
    outDir,
    keepDoc,
    zip,
    allowUnstable,
    model,
    kit,
    compileRounds,
  };
}

/** Print the per-attempt authoring summary. */
export function printAuthorSummary(result: AuthorResult): void {
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

/** What {@link authorAndWriteDocument} produced. */
export interface AuthoredDocument {
  readonly result: AuthorResult;
  /** Where the document was written. */
  readonly docPath: string;
  /** Where its world folder should go. */
  readonly worldDir: string;
}

/**
 * Author a document for `options` and write it next to the world folder.
 *
 * Returns `undefined` when every attempt failed validation; the per-attempt
 * diagnostics have already been printed by then.
 */
export async function authorAndWriteDocument(
  options: GenerateOptions,
): Promise<AuthoredDocument | undefined> {
  console.log(
    [
      `prompt     ${options.prompt}`,
      `seed       ${options.seed}`,
      `size       ${options.size}x${options.size}`,
      `model      ${options.model}`,
      `kit        ${options.kit}`,
      "",
    ].join("\n"),
  );

  let result: AuthorResult;
  try {
    result = await authorLoamDoc({
      prompt: options.prompt,
      size: options.size,
      worldSeed: options.seed,
      model: options.model,
      kitName: options.kit,
    });
  } catch (err) {
    if (err instanceof AuthoringFailedError) {
      printAuthorFailure(err);
      return undefined;
    }
    throw err;
  }

  printAuthorSummary(result);

  const outDir = path.resolve(options.outDir);
  const docPath = await writeDocument(outDir, result.doc);
  console.log(`  document   ${docPath}\n`);

  return { result, docPath, worldDir: path.join(outDir, result.doc.meta.name) };
}

/** Write an authored document next to its world folder; returns its path. */
export async function writeDocument(outDir: string, doc: LoamDocument): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const docPath = path.join(outDir, `${doc.meta.name}.loam.json`);
  await writeFile(docPath, `${JSON.stringify(doc, null, 2)}\n`);
  return docPath;
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

/** Drop the intermediate document unless the caller asked to keep it. */
export async function discardDocument(docPath: string, keep: boolean): Promise<void> {
  if (!keep) await rm(docPath, { force: true });
}
