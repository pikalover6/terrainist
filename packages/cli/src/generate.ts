/**
 * `terrainist generate` — prompt in, world out.
 *
 * The whole G3 pipeline in one command: GLM 5.2 authors a terrain-profile
 * document against the spec kit, the validator's diagnostics drive any
 * retries, and the resulting document goes through the ordinary compiler and
 * zipper. The only feedback loop is the validator's; nothing looks at pixels.
 *
 * The default seed is derived from the prompt (BLAKE3, via the stdlib's §6.1
 * world-seed resolution), so the same words give the same world unless the
 * caller asks for a different seed.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { authorTerrainDoc, AuthoringFailedError, GLM_MODEL_ID } from "@terrainist/agents";
import type { AuthorResult } from "@terrainist/agents";
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
      "",
    ].join("\n"),
  );

  let result: AuthorResult;
  try {
    result = await authorTerrainDoc({
      prompt: options.prompt,
      size: options.size,
      worldSeed: options.seed,
      model: options.model,
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
  await mkdir(outDir, { recursive: true });
  const docPath = path.join(outDir, `${result.doc.meta.name}.loam.json`);
  await writeFile(docPath, `${JSON.stringify(result.doc, null, 2)}\n`);
  console.log(`  document   ${docPath}\n`);

  return { result, docPath, worldDir: path.join(outDir, result.doc.meta.name) };
}

/** Drop the intermediate document unless the caller asked to keep it. */
export async function discardDocument(docPath: string, keep: boolean): Promise<void> {
  if (!keep) await rm(docPath, { force: true });
}
