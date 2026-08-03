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
 *    how to carry the text back. Budget: {@link MAX_COMPILE_ROUNDS}. The
 *    conversation it continues is **trimmed** first — see
 *    {@link trimRevisionConversation}.
 *
 * There is no render critique and no repair pass. If the budgets run out, the
 * kit is wrong and the kit is what gets fixed.
 */

import {
  formatDiagnostic,
  validateSettlementDocument,
  validateTerrainDocument,
  type LoamDiagnostic,
  type SemanticIntent,
  type SettlementDocument,
  type TerrainDocument,
} from "@terrainist/spec";

import {
  AUTHORING_MODEL_ID,
  AUTHORING_REASONING_EFFORT,
  AUTHORING_TEMPERATURE,
  MAX_AUTHOR_ATTEMPTS,
} from "./config.js";
import { loadOpenRouterKey } from "./env.js";
import { extractJson } from "./json.js";
import { intentKitContext } from "./intent-prepass.js";
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
    size,
    worldSeed: request.worldSeed,
    ...(request.intent === undefined ? {} : { intent: request.intent }),
    model: request.model ?? AUTHORING_MODEL_ID,
    reasoningEffort: request.reasoningEffort ?? AUTHORING_REASONING_EFFORT,
    maxAttempts: Math.max(1, request.maxAttempts ?? MAX_AUTHOR_ATTEMPTS),
    ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
  });
}

/** Author a terrain-profile document. Kept for callers pinned to that profile. */
export async function authorTerrainDoc(request: AuthorRequest): Promise<AuthorResult> {
  return await authorLoamDoc({ ...request, kitName: request.kitName ?? "terrain" });
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
 * Pure and deterministic: no clock, no RNG, no mutation of the input. The
 * sampling temperature is not touched — {@link AUTHORING_TEMPERATURE} stays 0.
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
  const apiKey = request.apiKey ?? loadOpenRouterKey();
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
    size: request.size,
    worldSeed: request.worldSeed,
    model: request.model ?? AUTHORING_MODEL_ID,
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
  /** Pinned into the finished document if the model wrote none of its own. */
  readonly intent?: SemanticIntent;
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
      const pinned = pinCallerValues(validation.document, options.worldSeed, options.size, options.intent);
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
  intent?: SemanticIntent,
): unknown {
  const clone = JSON.parse(JSON.stringify(doc)) as {
    meta: { worldSeed: number | string };
    intent?: SemanticIntent;
    root: { envelope: { size?: [number, number] } };
  };
  clone.meta.worldSeed = worldSeed;
  clone.root.envelope.size = [size, size];
  // The classified intent is stored in the document — but only when the model
  // wrote none of its own. A model that authored per-region character has
  // understood the prompt better than the classifier did, and overwriting its
  // world-scope intent would flatten exactly the distinction the pre-pass
  // exists to produce.
  if (intent !== undefined && clone.intent === undefined && Object.keys(intent).length > 0) {
    clone.intent = intent;
  }
  return clone;
}
