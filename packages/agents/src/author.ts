/**
 * Prompt → Loam 1 document, via the configured authoring model.
 *
 * Two feedback loops meet here, and they are deliberately separate:
 *
 * 1. **Validation.** When a candidate document fails the Loam 1 validator, the
 *    diagnostics go back to the model **verbatim** — code, node path, message
 *    and fix hint — alongside the document it just wrote. That is what the
 *    `fix` field in every diagnostic exists for. Budget:
 *    {@link MAX_AUTHOR_ATTEMPTS}.
 * 2. **Compile feedback.** A document can be perfectly valid and still describe
 *    a world the compiler cannot make well: a basin whose rim never closes, a
 *    house the road network cannot reach, a constraint the solver had to demote.
 *    {@link reviseLoamDoc} continues the same conversation with that report and
 *    asks for a revision. The caller owns the compile; this module only knows
 *    how to carry the text back. Budget: {@link MAX_COMPILE_ROUNDS}. The
 *    conversation it continues is **trimmed** first — see
 *    {@link trimRevisionConversation}.
 *
 * There is no render critique and no repair pass. If the budgets run out, the
 * kit is wrong and the kit is what gets fixed.
 */

import { error, formatDiagnostic, validateLoam, type LoamDiagnostic, type LoamRegistries } from "@terrainist/spec";
import type { SemanticIntent, SettlementDocument, TerrainDocument } from "@terrainist/spec/ir";

import {
  AUTHORING_REASONING_EFFORT,
  MAX_AUTHOR_ATTEMPTS,
} from "./config.js";
import { apiBaseUrl, defaultModel, loadApiKey } from "./env.js";
import { extractJson } from "./json.js";
import { intentKitContext, loamIntent } from "./intent-prepass.js";
import { DEFAULT_KIT, loadAuthorKit, type KitName } from "./kit.js";
import { sumUsage, type ChatMessage, type FetchLike, type Usage } from "./chat.js";
import { executeWithRetry, type RetryClientOptions } from "./retry-executor.js";

/** A Loam 1 document as a plain object: what the model wrote, pinned. */
export type LoamObject = Record<string, unknown>;

/**
 * The lowered document — the compiler's internal representation
 * (`@terrainist/spec/ir`). Never a user artifact.
 */
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
  /**
   * The registries the Loam 1 validator resolves `is` against. The prop names
   * are the stdlib's, which this package does not import; the CLI hands them
   * over. Absent, every prop name reads as a bespoke thing.
   */
  readonly registries?: LoamRegistries;
  /** Override the model (`TERRAINIST_MODEL`, else the pinned default). */
  readonly model?: string;
  /** Override the API root (`TERRAINIST_API_BASE`, else OpenRouter). */
  readonly baseUrl?: string;
  /** Override the reasoning effort (`reasoning_effort`). */
  readonly reasoningEffort?: string;
  /** Override the sampling temperature (default 1). */
  readonly temperature?: number;
  /** Maximum attempts, initial included. */
  readonly maxAttempts?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Injected for tests; defaults to `.env` / the process environment. */
  readonly apiKey?: string;
  /** Injected for tests; defaults to the on-disk kit. */
  readonly kit?: string;
  /**
   * The classified intent from the pre-pass (ratified disposition 3).
   *
   * Handed to the conversation as kit context *and* pinned into the finished
   * document, so what the classifier decided is inspectable in the artifact
   * rather than only in a log line.
   */
  readonly intent?: SemanticIntent;
}

/** Request for {@link reviseLoamDoc}: another turn on an existing conversation. */
export interface ReviseRequest {
  /** The conversation {@link authorLoamDoc} (or a previous revision) left behind. */
  readonly messages: readonly ChatMessage[];
  /**
   * A frozen `programs` map merged into the reply before validation. The
   * model should never re-type 64 KiB of program source, so its reply may
   * omit the map; `authored:` references still validate against the truth.
   */
  readonly programs?: Readonly<Record<string, unknown>>;
  /** The compile report, rendered for the model. Goes in verbatim. */
  readonly feedback: string;
  /** The document that produced that report, serialized. */
  readonly previous: string;
  readonly worldSeed: number | string;
  readonly size: number;
  readonly kitName?: KitName;
  /** See {@link AuthorRequest.registries}. */
  readonly registries?: LoamRegistries;
  readonly model?: string;
  readonly baseUrl?: string;
  /** Override the reasoning effort. */
  readonly reasoningEffort?: string;
  /** Override the sampling temperature. */
  readonly temperature?: number;
  readonly maxAttempts?: number;
  readonly fetchImpl?: FetchLike;
  readonly apiKey?: string;
  /**
   * Prior rounds kept verbatim; see {@link trimRevisionConversation}.
   * Defaults to {@link DEFAULT_KEPT_ROUNDS}.
   */
  readonly keepRounds?: number;
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
  /**
   * The Loam 1 document: the model's own, with the caller's seed, size and
   * prompt pinned. This is the artifact `generate` writes next to the world.
   */
  readonly loam: LoamObject;
  /** `loam` lowered onto the compiler's internal representation. */
  readonly doc: AuthoredDocument;
  /** The Loam 1 document exactly as the model wrote it — what a revision turn shows it. */
  readonly source: string;
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
 * writes for `seed` and `size` is overwritten after a successful validation and
 * the document is validated once more, so the result is always both
 * caller-consistent and known-valid.
 */
export async function authorLoamDoc(request: AuthorRequest): Promise<AuthorResult> {
  const kitName = request.kitName ?? DEFAULT_KIT;
  const apiKey = request.apiKey ?? loadApiKey();
  const kit = request.kit ?? (await loadAuthorKit(kitName));
  const size = request.size ?? DEFAULT_SIZE;

  // The kit stays message 0, byte for byte: it is the largest and most stable
  // prefix in the conversation, so anything a provider caches it as stays
  // cached.
  const messages: ChatMessage[] = [
    { role: "system", content: kit },
    {
      role: "user",
      content: [
        userPrompt(request.prompt, size, request.worldSeed, kitName),
        ...(request.intent === undefined ? [] : ["", intentKitContext(request.intent)]),
      ].join("\n"),
    },
  ];

  return await runAuthorLoop({
    messages,
    apiKey,
    kitName,
    registries: request.registries ?? { props: new Set() },
    size,
    worldSeed: request.worldSeed,
    ...(request.intent === undefined ? {} : { intent: request.intent }),
    model: request.model ?? defaultModel(),
    baseUrl: request.baseUrl ?? apiBaseUrl(),
    reasoningEffort: request.reasoningEffort ?? AUTHORING_REASONING_EFFORT,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    maxAttempts: Math.max(1, request.maxAttempts ?? MAX_AUTHOR_ATTEMPTS),
    ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
  });
}

/* -------------------------------------------------------------------------- */
/* The revision-conversation trim                                             */
/* -------------------------------------------------------------------------- */

/**
 * Rounds of the prior conversation kept verbatim, most recent first.
 *
 * Zero, and deliberately: {@link reviseLoamDoc} appends the *current* document
 * and the compiler's *current* findings after the trim, so a kept round would
 * be a superseded document and diagnostics that have already been acted on.
 * This is the conservative dial — if a run ever shows the model needs its own
 * previous reasoning, raise it to 1 and only the older rounds are dropped.
 */
export const DEFAULT_KEPT_ROUNDS = 0;

/** Options for {@link trimRevisionConversation}. */
export interface TrimOptions {
  /** Rounds (assistant + user pairs) kept verbatim. Default {@link DEFAULT_KEPT_ROUNDS}. */
  readonly keepRounds?: number;
}

/** What {@link trimRevisionConversation} produced. */
export interface TrimmedConversation {
  readonly messages: readonly ChatMessage[];
  /** How many turns the marker replaced. Zero means nothing was trimmed. */
  readonly droppedMessages: number;
  /** Characters of prompt removed — the whole point of the exercise. */
  readonly droppedChars: number;
}

/**
 * Drop superseded rounds from a revision conversation.
 *
 * Compile-feedback rounds used to re-send the entire conversation, so every
 * rejected attempt and every prior document rode along into every later round:
 * `out/e2e/comparison.md` measured a 9:1 prompt-to-completion cost ratio, and
 * the conversation is the part that grows. A revision turn needs the system
 * kit, the original prompt, the **current** document and the compiler's
 * **current** diagnostics, and nothing else — the older documents are strictly
 * superseded by the one that follows them.
 *
 * What survives: every leading `system` message (the kit), the first `user`
 * turn (the original prompt and the caller's pinned requirements), and the last
 * `keepRounds` rounds. Everything between becomes a **one-line marker**, so the
 * model is told the turns existed rather than left to infer a gap.
 *
 * Pure and deterministic: no clock, no RNG, no mutation of the input.
 */
export function trimRevisionConversation(
  messages: readonly ChatMessage[],
  options: TrimOptions = {},
): TrimmedConversation {
  const keepRounds = Math.max(0, options.keepRounds ?? DEFAULT_KEPT_ROUNDS);

  let head = 0;
  while (head < messages.length && messages[head]?.role === "system") head++;
  // The first user turn carries the prompt and the caller's pinned worldSeed
  // and size. Losing it would let the model re-invent both.
  if (head < messages.length && messages[head]?.role === "user") head++;

  const preserved = messages.slice(0, head);
  const rest = messages.slice(head);
  const keep = Math.min(rest.length, keepRounds * 2);
  const dropped = rest.slice(0, rest.length - keep);
  if (dropped.length === 0) {
    return { messages: [...messages], droppedMessages: 0, droppedChars: 0 };
  }

  const supersededDocs = dropped.filter((m) => m.role === "assistant").length;
  const marker: ChatMessage = {
    role: "user",
    content: `[${dropped.length} earlier turn(s) omitted, including ${supersededDocs} superseded document(s) and the diagnostics already applied to them; only the document and findings below are current.]`,
  };

  return {
    messages: [...preserved, marker, ...rest.slice(rest.length - keep)],
    droppedMessages: dropped.length,
    droppedChars: dropped.reduce((sum, m) => sum + m.content.length, 0) - marker.content.length,
  };
}

/**
 * Ask for a revision of a document that validated but compiled badly.
 *
 * The conversation continues rather than restarting — the model keeps the kit
 * and the original prompt — but it continues **trimmed**: see
 * {@link trimRevisionConversation} for why the superseded rounds go.
 */
export async function reviseLoamDoc(request: ReviseRequest): Promise<AuthorResult> {
  const kitName = request.kitName ?? DEFAULT_KIT;
  const apiKey = request.apiKey ?? loadApiKey();
  const trimmed = trimRevisionConversation(request.messages, {
    ...(request.keepRounds === undefined ? {} : { keepRounds: request.keepRounds }),
  });
  const messages: ChatMessage[] = [
    ...trimmed.messages,
    { role: "assistant", content: request.previous },
    { role: "user", content: compileFeedbackPrompt(request.feedback) },
  ];

  return await runAuthorLoop({
    messages,
    apiKey,
    kitName,
    registries: request.registries ?? { props: new Set() },
    ...(request.programs === undefined ? {} : { programs: request.programs }),
    size: request.size,
    worldSeed: request.worldSeed,
    model: request.model ?? defaultModel(),
    baseUrl: request.baseUrl ?? apiBaseUrl(),
    reasoningEffort: request.reasoningEffort ?? AUTHORING_REASONING_EFFORT,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    maxAttempts: Math.max(1, request.maxAttempts ?? MAX_AUTHOR_ATTEMPTS),
    ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
  });
}

/* -------------------------------------------------------------------------- */

interface LoopOptions {
  readonly messages: ChatMessage[];
  readonly registries: LoamRegistries;
  readonly apiKey: string;
  readonly kitName: KitName;
  /** See {@link ReviseRequest.programs}. */
  readonly programs?: Readonly<Record<string, unknown>>;
  readonly size: number;
  readonly worldSeed: number | string;
  readonly model: string;
  readonly baseUrl: string;
  readonly reasoningEffort: string;
  readonly temperature?: number;
  readonly maxAttempts: number;
  readonly fetchImpl?: FetchLike;
  /** Pinned into the finished document if the model wrote none of its own. */
  readonly intent?: SemanticIntent;
}

/** Completion → extract → validate → retry with diagnostics, until valid. */
async function runAuthorLoop(options: LoopOptions): Promise<AuthorResult> {
  const { kitName } = options;
  const registries = options.registries;
  const validate = (candidate: unknown) => validateLoam(candidate, registries);
  const client: RetryClientOptions = {
    apiKey: options.apiKey,
    model: options.model,
    baseUrl: options.baseUrl,
    reasoningEffort: options.reasoningEffort,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  };

  const result = await executeWithRetry<unknown, { loam: LoamObject; doc: AuthoredDocument }>({
    client,
    initialMessages: options.messages,
    maxAttempts: options.maxAttempts,
    extract: (raw) => {
      const extracted = extractJson(raw);
      if (extracted.ok) return { ok: true, value: extracted.value, source: extracted.source, raw };
      return { ok: false, reason: extracted.reason, raw };
    },
    validate: (extraction) => {
      if (!extraction.ok) {
        const diagnostics: LoamDiagnostic[] = [
          error(
            "BAD_DOCUMENT",
            "",
            `the response was not a JSON document: ${extraction.reason}`,
            "reply with the JSON object alone — no prose before it, no markdown fence, no trailing commentary",
          ),
        ];
        return { diagnostics };
      }
      const candidate =
        options.programs !== undefined &&
        typeof extraction.value === "object" &&
        extraction.value !== null
          ? {
              ...(extraction.value as Record<string, unknown>),
              programs: {
                ...((extraction.value as Record<string, unknown>)["programs"] as object | undefined),
                ...options.programs,
              },
            }
          : extraction.value;
      const validation = validate(candidate);
      if (validation.document !== undefined) {
        const pinned = pinCallerValues(candidate as LoamObject, options.worldSeed, options.size, options.intent);
        const recheck = validate(pinned);
        if (recheck.document === undefined) {
          /* c8 ignore next 4 — only reachable if pinning itself is buggy. */
          throw new Error(
            `authorLoamDoc: pinning seed/size invalidated the document:\n${recheck.diagnostics.map(formatDiagnostic).join("\n")}`,
          );
        }
        return { diagnostics: validation.diagnostics, value: { loam: pinned, doc: recheck.document } };
      }
      return { diagnostics: validation.diagnostics };
    },
    buildRetryMessage: ({ extraction, validation }) => {
      if (!extraction.ok) return retryPrompt(validation.diagnostics, undefined);
      return retryPrompt(validation.diagnostics, extraction.source);
    },
    getAssistantContent: (extraction) => (extraction.ok ? extraction.source : extraction.raw),
  });

  if (!result.failed && result.value !== undefined) {
    // The document as the model wrote it: the last attempt's reply, with the
    // JSON lifted out of any prose or fence around it.
    const lastRaw = result.history.at(-1)?.raw ?? "";
    const lifted = extractJson(lastRaw);
    return {
      loam: result.value.loam,
      doc: result.value.doc,
      source: lifted.ok ? lifted.source : lastRaw,
      attempts: result.attempts,
      diagnosticsPerAttempt: result.history.map((a) => a.diagnostics),
      usage: result.usage,
      model: result.model,
      history: result.history.map((a) => ({ index: a.index, diagnostics: a.diagnostics, usage: a.usage, raw: a.raw })),
      messages: [...result.messages],
      kitName,
    };
  }

  throw new AuthoringFailedError(result.history.map((a) => ({ index: a.index, diagnostics: a.diagnostics, usage: a.usage, raw: a.raw })));
}

/** The first user turn. */
export function userPrompt(
  prompt: string,
  size: number,
  worldSeed: number | string,
  kitName: KitName = DEFAULT_KIT,
): string {
  void kitName;
  return [
    `Author a Loam document for this world:`,
    ``,
    prompt,
    ``,
    `Requirements:`,
    `- "size" must be exactly [${size}, ${size}].`,
    `- "seed" must be exactly ${JSON.stringify(worldSeed)}.`,
    `- "prompt" must be exactly ${JSON.stringify(prompt)}.`,
    `- "name" is a short snake_case name derived from the prompt.`,
    ``,
    `Every image the prompt names must be delivered by something in the document:`,
    `a land edit, a palette, a wood, a thing from the catalog, or a bespoke thing`,
    `with a brief. If the prompt describes no habitation, write the land alone.`,
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

/** Overwrite the caller-owned Loam 1 fields, structurally, without mutating the input. */
function pinCallerValues(
  loam: LoamObject,
  worldSeed: number | string,
  size: number,
  intent?: SemanticIntent,
): LoamObject {
  const clone = JSON.parse(JSON.stringify(loam)) as LoamObject;
  clone["seed"] = worldSeed;
  clone["size"] = [size, size];
  // The classified intent is stored in the document — but only when the model
  // wrote none of its own. A model that authored per-place character has
  // understood the prompt better than the classifier did, and overwriting its
  // world-scope intent would flatten exactly the distinction the pre-pass
  // exists to produce.
  if (intent !== undefined && clone["intent"] === undefined && Object.keys(intent).length > 0) {
    clone["intent"] = loamIntent(intent);
  }
  return clone;
}
