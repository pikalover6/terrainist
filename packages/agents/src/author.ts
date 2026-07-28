/**
 * Prompt → terrain-profile Loam document, via GLM 5.2 on OpenRouter.
 *
 * The only feedback loop here is the validator's: when a candidate document
 * fails, the diagnostics go back to the model **verbatim** — code, node path,
 * message and fix hint — alongside the document it just wrote. That is what
 * the `fix` field in every diagnostic exists for. There is no render critique
 * and no repair pass; if three attempts cannot produce a valid document, the
 * kit is wrong and the kit is what gets fixed.
 */

import {
  formatDiagnostic,
  validateTerrainDocument,
  type LoamDiagnostic,
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
import { loadTerrainAuthorKit } from "./kit.js";
import { chatComplete, sumUsage, type ChatMessage, type FetchLike, type Usage } from "./openrouter.js";

/** Request for {@link authorTerrainDoc}. */
export interface AuthorRequest {
  /** The user's text prompt. */
  readonly prompt: string;
  /** Region edge length in blocks; becomes `root.envelope.size`. */
  readonly size?: number;
  /** The world seed the caller has already decided on. */
  readonly worldSeed: number | string;
  /** Override the pinned model. */
  readonly model?: string;
  /** Maximum attempts, initial included. */
  readonly maxAttempts?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Injected for tests; defaults to `.env` / the process environment. */
  readonly apiKey?: string;
  /** Injected for tests; defaults to the on-disk kit. */
  readonly kit?: string;
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
  readonly doc: TerrainDocument;
  readonly attempts: number;
  readonly diagnosticsPerAttempt: readonly (readonly LoamDiagnostic[])[];
  readonly usage: Usage;
  readonly model: string;
  readonly history: readonly AuthorAttempt[];
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
 * Author a terrain-profile document for `prompt`.
 *
 * The caller's `worldSeed` and `size` are authoritative: whatever the model
 * writes for `meta.worldSeed` and `root.envelope.size` is overwritten after a
 * successful validation and the document is validated once more, so the result
 * is always both caller-consistent and known-valid.
 */
export async function authorTerrainDoc(request: AuthorRequest): Promise<AuthorResult> {
  const apiKey = request.apiKey ?? loadOpenRouterKey();
  const kit = request.kit ?? (await loadTerrainAuthorKit());
  const model = request.model ?? GLM_MODEL_ID;
  const size = request.size ?? DEFAULT_SIZE;
  const maxAttempts = Math.max(1, request.maxAttempts ?? MAX_AUTHOR_ATTEMPTS);

  const messages: ChatMessage[] = [
    { role: "system", content: kit },
    { role: "user", content: userPrompt(request.prompt, size, request.worldSeed) },
  ];

  const history: AuthorAttempt[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const completion = await chatComplete({
      apiKey,
      model,
      messages,
      temperature: AUTHORING_TEMPERATURE,
      reasoningEffort: AUTHORING_REASONING_EFFORT,
      ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
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
      if (attempt === maxAttempts) break;
      messages.push({ role: "assistant", content: completion.text });
      messages.push({ role: "user", content: retryPrompt(diagnostics, undefined) });
      continue;
    }

    const validation = validateTerrainDocument(extracted.value);
    history.push({
      index: attempt,
      diagnostics: validation.diagnostics,
      usage: completion.usage,
      raw: completion.text,
    });

    if (validation.document !== undefined) {
      const pinned = pinCallerValues(validation.document, request.worldSeed, size);
      const recheck = validateTerrainDocument(pinned);
      if (recheck.document === undefined) {
        /* c8 ignore next 4 — only reachable if pinning itself is buggy. */
        throw new Error(
          `authorTerrainDoc: pinning worldSeed/size invalidated the document:\n${recheck.diagnostics.map(formatDiagnostic).join("\n")}`,
        );
      }
      return {
        doc: recheck.document,
        attempts: history.length,
        diagnosticsPerAttempt: history.map((a) => a.diagnostics),
        usage: sumUsage(history.map((a) => a.usage)),
        model: completion.model,
        history,
      };
    }

    if (attempt === maxAttempts) break;
    messages.push({ role: "assistant", content: extracted.source });
    messages.push({ role: "user", content: retryPrompt(validation.diagnostics, extracted.source) });
  }

  throw new AuthoringFailedError(history);
}

/* -------------------------------------------------------------------------- */

/** The first user turn. */
export function userPrompt(prompt: string, size: number, worldSeed: number | string): string {
  return [
    `Author a Loam terrain-profile document for this world:`,
    ``,
    prompt,
    ``,
    `Requirements:`,
    `- "root.envelope.size" must be exactly [${size}, ${size}].`,
    `- "meta.worldSeed" must be exactly ${JSON.stringify(worldSeed)}.`,
    `- "meta.prompt" must be exactly ${JSON.stringify(prompt)}.`,
    `- "meta.name" should be a short snake_case name derived from the prompt.`,
    ``,
    `Every feature the prompt names must show up as a terrain verb, a palette`,
    `override, or a forest node. Respond with the JSON object and nothing else.`,
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

/** Overwrite the caller-owned fields, structurally, without mutating the input. */
function pinCallerValues(
  doc: TerrainDocument,
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
