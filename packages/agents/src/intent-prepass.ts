/**
 * The authoring **pre-pass**: prompt → `SemanticIntent`, before anything is
 * authored.
 *
 * Ratified disposition 3: *intent comes from a classify-the-prompt pre-pass,
 * and its output is inspectable before the main authoring call.* It costs one
 * cheap call and buys a place to look when a world comes out wrong — "the model
 * thought this was a rich, planned, far-future city" is a diagnosis; "the world
 * came out wrong" is not.
 *
 * Why a separate call rather than a field the main authoring turn fills in:
 *
 * 1. **Inspectability.** The intent exists as an object before the expensive
 *    call, so `--intent` can override it and a human can read it.
 * 2. **Separation of jobs.** Classifying a sentence is a small, closed task
 *    with a fixed output shape; authoring a document is a large open one. Asked
 *    together, the large one swamps the small one — the model writes a document
 *    and back-fills an intent that agrees with what it already wrote.
 * 3. **Cheapness.** One small completion at the pinned model, no reasoning
 *    budget, a few hundred tokens out.
 *
 * The output is validated by the *same* validator the compiler uses, and one
 * retry carries the diagnostics back verbatim. If both attempts fail the run
 * proceeds **without** intent: a classifier that cannot classify must not be
 * able to stop a world being made.
 */

import { formatDiagnostic, validateIntentValue, type LoamDiagnostic, type SemanticIntent } from "@terrainist/spec";

import { AUTHORING_MODEL_ID, AUTHORING_TEMPERATURE } from "./config.js";
import { loadOpenRouterKey } from "./env.js";
import { extractJson } from "./json.js";
import { chatComplete, sumUsage, type ChatMessage, type FetchLike, type Usage } from "./openrouter.js";

/** Attempts the pre-pass makes: one call, one retry with the diagnostics. */
export const MAX_INTENT_ATTEMPTS = 2;

/**
 * The classifier's system prompt.
 *
 * Small on purpose. It teaches the dials, not the document: nothing here says
 * anything about Loam, node kinds or generators, because a classifier that
 * knows about documents starts writing them.
 */
export const INTENT_CLASSIFIER_PROMPT = `You classify a world-building prompt into a small JSON object of "intent" dials.
You never write a world. You only describe what kind of place the prompt asks for.

Reply with a JSON object and nothing else. Every field is OPTIONAL, and omitting
a field means "the prompt does not say" — which is NOT the same as zero.

When the prompt names two or more places that should read differently, do NOT
merge them: put shared facts at the top level and describe the per-place
differences in "tokens" prose so the author can give each region its own
character block.

{
  "era": string        // period word, resolved through an alias table to one
                       // of: primitive, ancient, medieval, early_modern,
                       // industrial, modern, far_future. Known aliases include
                       // "victorian", "pirate", "fantasy", "steampunk",
                       // "wild_west", "cyberpunk", "prehistoric". Prefer a
                       // class name when no alias clearly fits.
  "wealth": 0..1       // 0 destitute, 0.5 ordinary, 1 rich
  "decline": 0..1      // 0 kept up, 1 abandoned. Orthogonal to wealth:
                       // a rich ruin exists.
  "formality": 0..1    // 0 organic vernacular lanes, 1 planned and monumental
  "event": { "kind": "flood"|"fire"|"siege"|"boom",
             "severity": 0..1, "recency": 0..1 }   // 0 recency = happening now
  "climate": { "biome": "minecraft:<id>", "temperature": -1..1,
               "humidity": -1..1, "snow": "auto"|"never"|"always" }
  "character": {
    "label": string,             // free text, e.g. "pirate haven"
    "materialTheme": string,     // ONLY one of: temperate_timber, boreal_pine,
                                 // birchwood_downs, modern_city, white_quartz.
                                 // Omit rather than invent — no other id exists.
    "archetypes": { "prefer": [..], "forbid": [..] },
    "props":      { "prefer": [..], "forbid": [..] },
    "flora":      { "prefer": [..], "forbid": [..] },
    "motifs": { "roofType": "gable"|"hip"|"flat"|"dome"|"shed"|"mansard",
                "massing": "blocky"|"stepped"|"towered"|"sprawling",
                "windowRhythm": "sparse"|"regular"|"dense"|"banded",
                "ornamentDensity": 0..1 }
  },
  "tokens": { "<name>": string|number|boolean }   // anything else worth keeping
}

Rules:
- Only state what the prompt actually implies. Guessing every dial is worse
  than leaving one out.
- If the prompt describes SEVERAL distinct places (two islands, a city and a
  ruin), classify the WORLD as a whole here and put what makes each place
  different into "tokens.regions" as a short sentence. The document author gets
  this object and writes per-region character from it.
- Reply with the JSON object alone. No prose, no markdown fence.`;

/** What the pre-pass produced. */
export interface IntentClassification {
  /** The classified intent. `{}` when the model had nothing to say. */
  readonly intent: SemanticIntent;
  readonly attempts: number;
  readonly usage: Usage;
  readonly model: string;
  /** Raw model text of the final attempt, kept for inspection. */
  readonly raw: string;
  /** Diagnostics from the last attempt; empty on success. */
  readonly diagnostics: readonly LoamDiagnostic[];
  /** True when both attempts failed and the run continues without intent. */
  readonly failed: boolean;
}

/** Request for {@link classifyPromptIntent}. */
export interface ClassifyIntentRequest {
  readonly prompt: string;
  /** Override the pinned model. Defaults to {@link AUTHORING_MODEL_ID}. */
  readonly model?: string;
  readonly maxAttempts?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Injected for tests; defaults to `.env` / the process environment. */
  readonly apiKey?: string;
  /** Override the classifier's system prompt. Tests and experiments only. */
  readonly systemPrompt?: string;
}

/**
 * Classify a prompt into an intent object.
 *
 * Never throws for a model that misbehaves: a classification that cannot be
 * had comes back `failed` with an empty intent, and the caller authors exactly
 * as it did before this pass existed.
 */
export async function classifyPromptIntent(
  request: ClassifyIntentRequest,
): Promise<IntentClassification> {
  const apiKey = request.apiKey ?? loadOpenRouterKey();
  const model = request.model ?? AUTHORING_MODEL_ID;
  const maxAttempts = Math.max(1, request.maxAttempts ?? MAX_INTENT_ATTEMPTS);

  const messages: ChatMessage[] = [
    { role: "system", content: request.systemPrompt ?? INTENT_CLASSIFIER_PROMPT },
    { role: "user", content: `Prompt:\n${request.prompt}` },
  ];

  const usages: Usage[] = [];
  let raw = "";
  let diagnostics: readonly LoamDiagnostic[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const completion = await chatComplete({
      apiKey,
      model,
      messages,
      temperature: AUTHORING_TEMPERATURE,
      ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
    });
    usages.push(completion.usage);
    raw = completion.text;

    const extracted = extractJson(completion.text);
    if (extracted.ok) {
      const validation = validateIntentValue(extracted.value);
      diagnostics = validation.diagnostics;
      if (validation.intent !== undefined) {
        return {
          intent: validation.intent,
          attempts: attempt,
          usage: sumUsage(usages),
          model: completion.model,
          raw,
          diagnostics,
          failed: false,
        };
      }
    } else {
      diagnostics = [];
    }

    if (attempt === maxAttempts) break;
    messages.push({ role: "assistant", content: completion.text });
    messages.push({
      role: "user",
      content: retryIntentPrompt(extracted.ok ? diagnostics : [], extracted.ok ? undefined : "the reply was not a JSON object"),
    });
  }

  return {
    intent: {},
    attempts: usages.length,
    usage: sumUsage(usages),
    model,
    raw,
    diagnostics,
    failed: true,
  };
}

/** The pre-pass's one retry turn. */
export function retryIntentPrompt(
  diagnostics: readonly LoamDiagnostic[],
  reason: string | undefined,
): string {
  return [
    reason === undefined
      ? `That object is not a valid intent. The validator reported ${diagnostics.length} problem(s):`
      : `That reply could not be used: ${reason}.`,
    ``,
    ...diagnostics.map(formatDiagnostic),
    ``,
    `Reply with a corrected JSON intent object alone. Omit any field you are not`,
    `sure about — an omitted dial means "the prompt does not say", which is`,
    `always a safe answer.`,
  ].join("\n");
}

/**
 * Render an intent as the block the authoring conversation carries.
 *
 * The document author gets the classification as **context**, not as an
 * instruction to copy: it is told to put it in the document and, crucially, to
 * *differentiate* per region — which is the whole unicorn-island-vs-pirate-
 * island acceptance case.
 */
export function intentKitContext(intent: SemanticIntent): string {
  const json = JSON.stringify(intent, null, 2);
  return [
    `A classifier has already read this prompt and produced the world's intent:`,
    ``,
    json,
    ``,
    `Carry it into the document as a top-level "intent" object, adjusting`,
    `anything it got wrong. Where the prompt describes two or more places that`,
    `should read differently, give each region node its own "intent" with its`,
    `own "character" block — that is how one world holds two themes. A district`,
    `or city node inherits the world's intent and overrides only what differs.`,
  ].join("\n");
}

/** Render a classification for a human to look at before the expensive call. */
export function formatClassification(c: IntentClassification): string {
  if (c.failed) {
    return `intent     (classification failed after ${c.attempts} attempt(s); authoring without it)`;
  }
  return [`intent     ${JSON.stringify(c.intent)}`, `           ${c.attempts} attempt(s), ${c.usage.totalTokens} tokens`].join("\n");
}
