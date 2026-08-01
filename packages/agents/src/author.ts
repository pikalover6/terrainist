/**
 * Prompt → Loam document, via GLM 5.2 on OpenRouter.
 *
 * Two feedback loops meet here, and they are deliberately separate:
 *
 * 1. **Validation.** When a candidate document fails the profile validator, the
 *    diagnostics go back to the model **verbatim** — code, node path, message
 *    and fix hint — alongside the document it just wrote. That is what the
 *    `fix` field in every diagnostic exists for. Budget:
 *    {@link MAX_AUTHOR_ATTEMPTS}.
 * 2. **Compile feedback.** A document can be perfectly valid and still describe
 *    a world the compiler cannot make well: a basin whose rim never closes, a
 *    house the road network cannot reach, a constraint the solver had to demote.
 *    {@link reviseLoamDoc} continues the same conversation with that report and
 *    asks for a revision. The caller owns the compile; this module only knows
 *    how to carry the text back. Budget: {@link MAX_COMPILE_ROUNDS}.
 *
 * There is no render critique and no repair pass. If the budgets run out, the
 * kit is wrong and the kit is what gets fixed.
 */

import {
  formatDiagnostic,
  validateSettlementDocument,
  validateTerrainDocument,
  type LoamDiagnostic,
  type SettlementDocument,
  type TerrainDocument,
} from "@terrainist/spec";

import {
  AUTHORING_REASONING_EFFORT,
  AUTHORING_TEMPERATURE,
  GLM_MODEL_ID,
  MAX_AUTHOR_ATTEMPTS,
} from "./config.js";
import { loadOpenRouterKey } from "./env.js";
import { extractJson } from "./json.js";
import { DEFAULT_KIT, loadAuthorKit, type KitName } from "./kit.js";
import { chatComplete, sumUsage, type ChatMessage, type FetchLike, type Usage } from "./openrouter.js";

/** A document either profile's validator accepts. */
export type AuthoredDocument = TerrainDocument | SettlementDocument;

/** Request for {@link authorLoamDoc}. */
export interface AuthorRequest {
  /** The user's text prompt. */
  readonly prompt: string;
  /** Region edge length in blocks; becomes `root.envelope.size`. */
  readonly size?: number;
  /** The world seed the caller has already decided on. */
  readonly worldSeed: number | string;
  /** Which kit to author against. Defaults to {@link DEFAULT_KIT}. */
  readonly kitName?: KitName;
  /** Override the pinned model. */
  readonly model?: string;
  /** Override the reasoning effort sent to OpenRouter. */
  readonly reasoningEffort?: string;
  /** Maximum attempts, initial included. */
  readonly maxAttempts?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Injected for tests; defaults to `.env` / the process environment. */
  readonly apiKey?: string;
  /** Injected for tests; defaults to the on-disk kit. */
  readonly kit?: string;
}

/** Request for {@link reviseLoamDoc}: another turn on an existing conversation. */
export interface ReviseRequest {
  /** The conversation {@link authorLoamDoc} (or a previous revision) left behind. */
  readonly messages: readonly ChatMessage[];
  /** The compile report, rendered for the model. Goes in verbatim. */
  readonly feedback: string;
  /** The document that produced that report, serialized. */
  readonly previous: string;
  readonly worldSeed: number | string;
  readonly size: number;
  readonly kitName?: KitName;
  readonly model?: string;
  /** Override the reasoning effort sent to OpenRouter. */
  readonly reasoningEffort?: string;
  readonly maxAttempts?: number;
  readonly fetchImpl?: FetchLike;
  readonly apiKey?: string;
}

/** One authoring attempt, for the report. */
export interface AuthorAttempt {
  readonly index: number;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly usage: Usage;
  /** Raw model text, kept so a failed run can be inspected. */
  readonly raw: string;
}

/** A completed authoring run. */
export interface AuthorResult {
  readonly doc: AuthoredDocument;
  readonly attempts: number;
  readonly diagnosticsPerAttempt: readonly (readonly LoamDiagnostic[])[];
  readonly usage: Usage;
  readonly model: string;
  readonly history: readonly AuthorAttempt[];
  /** The conversation so far — hand this to {@link reviseLoamDoc}. */
  readonly messages: readonly ChatMessage[];
  /** Which kit (and therefore which profile) produced it. */
  readonly kitName: KitName;
}

/** Thrown when every attempt failed validation. */
export class AuthoringFailedError extends Error {
  readonly attempts: number;
  readonly diagnosticsPerAttempt: readonly (readonly LoamDiagnostic[])[];
  readonly usage: Usage;
  readonly history: readonly AuthorAttempt[];

  constructor(history: readonly AuthorAttempt[]) {
    const last = history[history.length - 1];
    super(
      `authoring failed after ${history.length} attempt(s); last attempt had ${last?.diagnostics.length ?? 0} problem(s):\n${(last?.diagnostics ?? []).map(formatDiagnostic).join("\n")}`,
    );
    this.name = "AuthoringFailedError";
    this.attempts = history.length;
    this.diagnosticsPerAttempt = history.map((a) => a.diagnostics);
    this.usage = sumUsage(history.map((a) => a.usage));
    this.history = history;
  }
}

const DEFAULT_SIZE = 512;

/**
 * Author a document for `prompt` against the kit named by `kitName`.
 *
 * The caller's `worldSeed` and `size` are authoritative: whatever the model
 * writes for `meta.worldSeed` and `root.envelope.size` is overwritten after a
 * successful validation and the document is validated once more, so the result
 * is always both caller-consistent and known-valid.
 */
export async function authorLoamDoc(request: AuthorRequest): Promise<AuthorResult> {
  const kitName = request.kitName ?? DEFAULT_KIT;
  const apiKey = request.apiKey ?? loadOpenRouterKey();
  const kit = request.kit ?? (await loadAuthorKit(kitName));
  const size = request.size ?? DEFAULT_SIZE;

  const messages: ChatMessage[] = [
    { role: "system", content: kit },
    { role: "user", content: userPrompt(request.prompt, size, request.worldSeed, kitName) },
  ];

  return await runAuthorLoop({
    messages,
    apiKey,
    kitName,
    size,
    worldSeed: request.worldSeed,
    model: request.model ?? GLM_MODEL_ID,
    reasoningEffort: request.reasoningEffort ?? AUTHORING_REASONING_EFFORT,
    maxAttempts: Math.max(1, request.maxAttempts ?? MAX_AUTHOR_ATTEMPTS),
    ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
  });
}

/** Author a terrain-profile document. Kept for callers pinned to that profile. */
export async function authorTerrainDoc(request: AuthorRequest): Promise<AuthorResult> {
  return await authorLoamDoc({ ...request, kitName: request.kitName ?? "terrain" });
}

/**
 * Ask for a revision of a document that validated but compiled badly.
 *
 * The conversation continues rather than restarting: the model still has its
 * own reasoning, the kit, and the original prompt in context, so the revision
 * turn only has to carry what the compiler found.
 */
export async function reviseLoamDoc(request: ReviseRequest): Promise<AuthorResult> {
  const kitName = request.kitName ?? DEFAULT_KIT;
  const apiKey = request.apiKey ?? loadOpenRouterKey();
  const messages: ChatMessage[] = [
    ...request.messages,
    { role: "assistant", content: request.previous },
    { role: "user", content: compileFeedbackPrompt(request.feedback) },
  ];

  return await runAuthorLoop({
    messages,
    apiKey,
    kitName,
    size: request.size,
    worldSeed: request.worldSeed,
    model: request.model ?? GLM_MODEL_ID,
    reasoningEffort: request.reasoningEffort ?? AUTHORING_REASONING_EFFORT,
    maxAttempts: Math.max(1, request.maxAttempts ?? MAX_AUTHOR_ATTEMPTS),
    ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
  });
}

/* -------------------------------------------------------------------------- */

interface LoopOptions {
  readonly messages: ChatMessage[];
  readonly apiKey: string;
  readonly kitName: KitName;
  readonly size: number;
  readonly worldSeed: number | string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly maxAttempts: number;
  readonly fetchImpl?: FetchLike;
}

/** Completion → extract → validate → retry with diagnostics, until valid. */
async function runAuthorLoop(options: LoopOptions): Promise<AuthorResult> {
  const { messages, kitName } = options;
  const validate = kitName === "terrain" ? validateTerrainDocument : validateSettlementDocument;
  const history: AuthorAttempt[] = [];

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    const completion = await chatComplete({
      apiKey: options.apiKey,
      model: options.model,
      messages,
      temperature: AUTHORING_TEMPERATURE,
      reasoningEffort: options.reasoningEffort,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    });

    const extracted = extractJson(completion.text);
    if (!extracted.ok) {
      const diagnostics: LoamDiagnostic[] = [
        {
          code: "LOAM-T000",
          name: "BAD_DOCUMENT",
          severity: "error",
          nodePath: "",
          message: `the response was not a JSON document: ${extracted.reason}`,
          fix: "reply with the JSON object alone — no prose before it, no markdown fence, no trailing commentary",
        },
      ];
      history.push({ index: attempt, diagnostics, usage: completion.usage, raw: completion.text });
      if (attempt === options.maxAttempts) break;
      messages.push({ role: "assistant", content: completion.text });
      messages.push({ role: "user", content: retryPrompt(diagnostics, undefined) });
      continue;
    }

    const validation = validate(extracted.value);
    history.push({
      index: attempt,
      diagnostics: validation.diagnostics,
      usage: completion.usage,
      raw: completion.text,
    });

    if (validation.document !== undefined) {
      const pinned = pinCallerValues(validation.document, options.worldSeed, options.size);
      const recheck = validate(pinned);
      if (recheck.document === undefined) {
        /* c8 ignore next 4 — only reachable if pinning itself is buggy. */
        throw new Error(
          `authorLoamDoc: pinning worldSeed/size invalidated the document:\n${recheck.diagnostics.map(formatDiagnostic).join("\n")}`,
        );
      }
      return {
        doc: recheck.document,
        attempts: history.length,
        diagnosticsPerAttempt: history.map((a) => a.diagnostics),
        usage: sumUsage(history.map((a) => a.usage)),
        model: completion.model,
        history,
        messages: [...messages],
        kitName,
      };
    }

    if (attempt === options.maxAttempts) break;
    messages.push({ role: "assistant", content: extracted.source });
    messages.push({ role: "user", content: retryPrompt(validation.diagnostics, extracted.source) });
  }

  throw new AuthoringFailedError(history);
}

/** The first user turn. */
export function userPrompt(
  prompt: string,
  size: number,
  worldSeed: number | string,
  kitName: KitName = DEFAULT_KIT,
): string {
  return [
    `Author a Loam ${kitName}-profile document for this world:`,
    ``,
    prompt,
    ``,
    `Requirements:`,
    `- "root.envelope.size" must be exactly [${size}, ${size}].`,
    `- "meta.worldSeed" must be exactly ${JSON.stringify(worldSeed)}.`,
    `- "meta.prompt" must be exactly ${JSON.stringify(prompt)}.`,
    `- "meta.name" should be a short snake_case name derived from the prompt.`,
    ``,
    kitName === "settlement"
      ? `Every feature the prompt names must show up as a terrain verb, a palette\noverride, a forest node, or a structure node placed by constraints. If the\nprompt describes no habitation, author the terrain layer alone — a document\nwith no plaza, buildings or roads is a correct answer.`
      : `Every feature the prompt names must show up as a terrain verb, a palette\noverride, or a forest node.`,
    `Respond with the JSON object and nothing else.`,
  ].join("\n");
}

/** A retry turn: the diagnostics verbatim, plus what to do about them. */
export function retryPrompt(
  diagnostics: readonly LoamDiagnostic[],
  previous: string | undefined,
): string {
  const lines = [
    `That document is not valid. The compiler's validator reported ${diagnostics.length} problem(s).`,
    `Each one names the node path, what is wrong, and the fix to apply:`,
    ``,
    ...diagnostics.map(formatDiagnostic),
    ``,
  ];
  if (previous !== undefined) {
    lines.push(
      `Here is the document you produced, for reference:`,
      ``,
      previous,
      ``,
    );
  }
  lines.push(
    `Apply every fix above and reply with the corrected, complete JSON document.`,
    `Do not explain the changes. Do not wrap the JSON in a fence. Keep everything`,
    `that was already valid exactly as it was.`,
  );
  return lines.join("\n");
}

/** A compile-feedback turn: the report verbatim, plus what to do about it. */
export function compileFeedbackPrompt(feedback: string): string {
  return [
    `That document is valid, and it compiled — but the compiler found problems`,
    `with the world it describes. These are not syntax errors: the geometry or`,
    `the layout did not come out the way the document asks for.`,
    ``,
    feedback,
    ``,
    `Revise the document to address every point above and reply with the`,
    `complete, corrected JSON document. Change as little as possible — keep the`,
    `world's character, the names, and everything that compiled cleanly. Do not`,
    `explain the changes. Do not wrap the JSON in a fence.`,
  ].join("\n");
}

/** Overwrite the caller-owned fields, structurally, without mutating the input. */
function pinCallerValues(
  doc: AuthoredDocument,
  worldSeed: number | string,
  size: number,
): unknown {
  const clone = JSON.parse(JSON.stringify(doc)) as {
    meta: { worldSeed: number | string };
    root: { envelope: { size?: [number, number] } };
  };
  clone.meta.worldSeed = worldSeed;
  clone.root.envelope.size = [size, size];
  return clone;
}
