/**
 * `terrainist generate` — prompt in, world out.
 *
 * The whole pipeline in one command: the pinned authoring model (GPT 5.6 Luna
 * by default, `--model` to override) authors a document against a spec
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
  attachPrograms,
  authorLoamDoc,
  authorPrograms,
  classifyPromptIntent,
  formatProgramRun,
  DEFAULT_BESPOKE_BUDGET_USD,
  formatClassification,
  reviseForProgramWiring,
  AuthoringFailedError,
  AUTHORING_MODEL_ID,
  AUTHORING_REASONING_EFFORT,
  DEFAULT_KIT,
  MAX_COMPILE_ROUNDS,
} from "@terrainist/agents";
import type {
  AuthoredDocument as LoamDocument,
  AuthorResult,
  AuthoredProgramEntry,
  KitName,
  ProgramVerificationGate,
  Usage,
} from "@terrainist/agents";
import { validateIntentValue, type SemanticIntent } from "@terrainist/spec";
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
  /** Reasoning effort sent to OpenRouter. */
  readonly effort: string;
  /** Which spec kit authors the document. */
  readonly kit: KitName;
  /** How many compile-feedback revision rounds the document gets. */
  readonly compileRounds: number;
  /**
   * Run the classify-the-prompt intent pre-pass. Default true; `--no-intent`
   * turns it off, which is exactly how the product behaved before Phase 2.
   */
  readonly intentPrepass: boolean;
  /**
   * An intent supplied on the command line, replacing the pre-pass entirely.
   *
   * The inspectability half of ratified disposition 3: having looked at what
   * the classifier said, a human can hand the run a corrected object instead of
   * re-rolling the prompt.
   */
  readonly intent?: SemanticIntent;
  /**
   * Author bespoke programs for this world. Default true; `--no-programs`
   * turns the pass off, and a run without it is exactly the product as it
   * behaved before Phase 3.
   */
  readonly programs: boolean;
  /** Per-world bespoke authoring spend stop, in USD. */
  readonly bespokeBudget: number;
}

/** The reasoning-effort levels OpenRouter's unified `reasoning` parameter accepts. */
export const EFFORT_LEVELS: readonly string[] = ["low", "medium", "high", "xhigh", "max"];

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
  let model = AUTHORING_MODEL_ID;
  let effort = AUTHORING_REASONING_EFFORT;
  let kit: KitName = DEFAULT_KIT;
  let compileRounds = MAX_COMPILE_ROUNDS;
  let intentPrepass = true;
  let intent: SemanticIntent | undefined;
  let programs = true;
  let bespokeBudget = DEFAULT_BESPOKE_BUDGET_USD;

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
    } else if (arg === "--effort") {
      const value = next();
      if (!EFFORT_LEVELS.includes(value)) {
        throw new Error(`--effort must be one of ${EFFORT_LEVELS.join(", ")}`);
      }
      effort = value;
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
    } else if (arg === "--no-intent") {
      intentPrepass = false;
    } else if (arg === "--intent") {
      const raw = next();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (cause) {
        throw new Error(`--intent must be a JSON object: ${(cause as Error).message}`);
      }
      const validation = validateIntentValue(parsed);
      if (validation.intent === undefined) {
        throw new Error(
          `--intent is not a valid intent:\n${validation.diagnostics.map((d) => `  ${d.code} ${d.nodePath}: ${d.message}`).join("\n")}`,
        );
      }
      intent = validation.intent;
    } else if (arg === "--no-programs") {
      programs = false;
    } else if (arg === "--bespoke-budget") {
      const value = Number(next());
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--bespoke-budget must be a non-negative number of dollars");
      }
      bespokeBudget = value;
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
    effort,
    kit,
    compileRounds,
    intentPrepass,
    programs,
    bespokeBudget,
    ...(intent === undefined ? {} : { intent }),
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
  /** The document as written to disk — programs attached, if any were. */
  readonly doc: LoamDocument;
  /**
   * The frozen programs map, so a later revision round can re-attach it: a
   * revision rewrites the document, and the programs it was authored beside
   * are still valid — they were verified against the world seed and size, not
   * against a particular node tree.
   */
  readonly programs: Readonly<Record<string, AuthoredProgramEntry>>;
  /**
   * Every model usage this phase spent, in order: the authoring run, and the
   * program-wiring revision when one happened. The caller totals these rather
   * than reading `result.usage`, which after a wiring revision is that
   * revision's spend alone.
   */
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
 * diagnostics have already been printed by then.
 */
export async function authorAndWriteDocument(
  options: GenerateOptions,
  gate?: ProgramVerificationGate,
): Promise<AuthoredDocument | undefined> {
  console.log(
    [
      `prompt     ${options.prompt}`,
      `seed       ${options.seed}`,
      `size       ${options.size}x${options.size}`,
      `model      ${options.model}`,
      `effort     ${options.effort}`,
      `kit        ${options.kit}`,
      "",
    ].join("\n"),
  );

  // --- the intent pre-pass ------------------------------------------------
  // One cheap call before the expensive one, and its output is printed: when a
  // world comes out wrong, this line is the first place to look (ratified
  // disposition 3). `--intent` replaces it; `--no-intent` skips it.
  let intent: SemanticIntent | undefined = options.intent;
  if (intent !== undefined) {
    console.log(`intent     ${JSON.stringify(intent)}  (from --intent)\n`);
  } else if (options.intentPrepass) {
    const classified = await classifyPromptIntent({
      prompt: options.prompt,
      model: options.model,
    });
    console.log(`${formatClassification(classified)}\n`);
    if (!classified.failed && Object.keys(classified.intent).length > 0) {
      intent = classified.intent;
    }
  }

  let result: AuthorResult;
  try {
    result = await authorLoamDoc({
      prompt: options.prompt,
      size: options.size,
      worldSeed: options.seed,
      model: options.model,
      reasoningEffort: options.effort,
      kitName: options.kit,
      ...(intent === undefined ? {} : { intent }),
    });
  } catch (err) {
    if (err instanceof AuthoringFailedError) {
      printAuthorFailure(err);
      return undefined;
    }
    throw err;
  }

  printAuthorSummary(result);

  const usages: Usage[] = [result.usage];

  // --- bespoke programs ---------------------------------------------------
  // Authored AFTER the document, because what a world wants a program for is
  // something the document has already said. Every program that passes the
  // gate is frozen into the document — source, sourceHash, outputHash — so the
  // compile downstream is a pure function again and needs no model.
  let doc: LoamDocument = result.doc;
  let programs: Readonly<Record<string, AuthoredProgramEntry>> = {};
  if (options.programs) {
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
        budgetUsd: options.bespokeBudget,
        ...(intent === undefined ? {} : { context: JSON.stringify(intent) }),
      });
      console.log(`${formatProgramRun(authored)}\n`);
      programs = authored.programs;
      doc = attachPrograms(doc, programs);

      // --- and make sure the tree actually invokes them --------------------
      // A program frozen into the map that no node names is a program that
      // cost two model calls and places zero blocks. One focused revision
      // closes it; a document that already wired everything spends nothing.
      const wiring = await reviseForProgramWiring({
        doc,
        programs,
        messages: result.messages,
        worldSeed: options.seed,
        size: options.size,
        kitName: result.kitName,
        model: options.model,
        reasoningEffort: options.effort,
      });
      if (wiring.orphans.length > 0) {
        console.log(
          `wiring     ${wiring.orphans.length} program(s) authored but never invoked: ` +
            `${wiring.orphans.map((o) => `${o.id} [${o.mode}]`).join(", ")}\n`,
        );
        usages.push(wiring.usage);
        if (wiring.revised && wiring.result !== undefined) {
          doc = wiring.doc as LoamDocument;
          result = wiring.result;
          const u = wiring.usage;
          console.log(
            `  wired in ${wiring.result.attempts} attempt(s); ${u.promptTokens} in + ` +
              `${u.completionTokens} out = ${u.totalTokens} tokens` +
              `${u.cost === undefined ? "" : `  ($${u.cost.toFixed(4)})`}\n`,
          );
        } else if (wiring.warning !== undefined) {
          console.warn(`${wiring.warning}\n`);
        }
      }
    }
  }

  const outDir = path.resolve(options.outDir);
  const docPath = await writeDocument(outDir, doc);
  console.log(`  document   ${docPath}\n`);

  return { result, doc, programs, usages, docPath, worldDir: path.join(outDir, doc.meta.name) };
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
