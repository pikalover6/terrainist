/**
 * One retry executor for every model-calling flow in this package.
 *
 * Five flows shared the same shape before this landed:
 *
 * 1. `chatComplete` → extract → validate → feedback prompt → retry
 * 2. bounded by a per-flow attempt limit
 * 3. capturing usage, model, raw text, diagnostics, history and the
 *    conversation that produced them
 * 4. transport retry (fetch, 5xx, empty content, truncated JSON, output
 *    budget) already inside `chatComplete`
 *
 * This module owns the diagnostic retry. Transport retry stays inside
 * `openrouter.ts`. Prompt construction, extraction and validation stay with
 * the caller — the executor never learns what a valid intent or a good
 * program looks like — but the loop, the back-and-forth messages, the
 * summing of `Usage` and the `AttemptRecord` shape live here once.
 */

import { AUTHORING_MODEL_ID, AUTHORING_TEMPERATURE } from "./config.js";
import { chatComplete, sumUsage, type ChatMessage, type FetchLike, type Usage } from "./chat.js";
import type { LoamDiagnostic } from "@terrainist/spec";

/** Narrow client-options value — the only thing callers hand to the executor about how to call the model. */
export interface RetryClientOptions {
  readonly apiKey: string;
  /** The API root; the default is OpenRouter. */
  readonly baseUrl?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly fetchImpl?: FetchLike;
}

interface AttemptRecord {
  readonly index: number;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly usage: Usage;
  readonly raw: string;
}

type ExtractResult<T> =
  | { readonly ok: true; readonly value: T; readonly source: string; readonly raw: string }
  | { readonly ok: false; readonly reason: string; readonly raw: string };

interface ValidateResult<T> {
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly value?: T;
}

export interface RetryExecutorOptions<TEx, TVal> {
  readonly client: RetryClientOptions;
  readonly initialMessages: readonly ChatMessage[];
  readonly maxAttempts: number;
  /** Turn the raw model text into a typed extraction. */
  readonly extract: (raw: string) => ExtractResult<TEx>;
  /** Decide whether the extraction is valid and what value it carries. */
  readonly validate: (extraction: ExtractResult<TEx>) => Promise<ValidateResult<TVal>> | ValidateResult<TVal>;
  /** Build the user turn that carries the diagnostics back to the model. */
  readonly buildRetryMessage: (args: {
    readonly extraction: ExtractResult<TEx>;
    readonly validation: ValidateResult<TVal>;
    readonly attempt: number;
  }) => string;
  /** What the executor pushes as the assistant turn before the retry. Defaults to the raw reply. */
  readonly getAssistantContent?: (extraction: ExtractResult<TEx>) => string;
  /** When is a validation a success? Default: `value !== undefined`. */
  readonly isSuccess?: (validation: ValidateResult<TVal>) => boolean;
}

export interface RetryExecutorResult<TVal> {
  readonly value?: TVal;
  readonly history: readonly AttemptRecord[];
  readonly usage: Usage;
  /** Model that produced the final attempt; on failure the caller's pin is kept. */
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly attempts: number;
  readonly raw: string;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly failed: boolean;
}

export async function executeWithRetry<TEx, TVal>(
  options: RetryExecutorOptions<TEx, TVal>,
): Promise<RetryExecutorResult<TVal>> {
  const maxAttempts = Math.max(1, options.maxAttempts);
  const messages: ChatMessage[] = [...options.initialMessages];
  const history: AttemptRecord[] = [];
  const usages: Usage[] = [];
  let lastModel: string | undefined;
  let lastRaw = "";
  let lastDiagnostics: readonly LoamDiagnostic[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const completion = await chatComplete({
      apiKey: options.client.apiKey,
      ...(options.client.baseUrl === undefined ? {} : { baseUrl: options.client.baseUrl }),
      messages,
      temperature: options.client.temperature ?? AUTHORING_TEMPERATURE,
      ...(options.client.model === undefined ? {} : { model: options.client.model }),
      ...(options.client.reasoningEffort === undefined ? {} : { reasoningEffort: options.client.reasoningEffort }),
      ...(options.client.maxTokens === undefined ? {} : { maxTokens: options.client.maxTokens }),
      ...(options.client.fetchImpl === undefined ? {} : { fetchImpl: options.client.fetchImpl }),
    });
    lastModel = completion.model;
    lastRaw = completion.text;
    usages.push(completion.usage);

    const extraction = options.extract(completion.text);
    const validation = await options.validate(extraction);
    lastDiagnostics = validation.diagnostics;

    history.push({
      index: attempt,
      diagnostics: validation.diagnostics,
      usage: completion.usage,
      raw: completion.text,
    });

    const success = options.isSuccess ? options.isSuccess(validation) : validation.value !== undefined;
    if (success) {
      return {
        ...(validation.value === undefined ? {} : { value: validation.value }),
        history,
        usage: sumUsage(usages),
        model: lastModel,
        messages: [...messages],
        attempts: history.length,
        raw: lastRaw,
        diagnostics: lastDiagnostics,
        failed: false,
      } as RetryExecutorResult<TVal>;
    }

    if (attempt === maxAttempts) break;
    const assistantContent = options.getAssistantContent
      ? options.getAssistantContent(extraction)
      : extraction.raw;
    messages.push({ role: "assistant", content: assistantContent });
    const retryMessage = options.buildRetryMessage({
      extraction,
      validation,
      attempt,
    });
    messages.push({ role: "user", content: retryMessage });
  }

  return {
    history,
    usage: sumUsage(usages),
    model: lastModel ?? options.client.model ?? AUTHORING_MODEL_ID,
    messages: [...messages],
    attempts: history.length,
    raw: lastRaw,
    diagnostics: lastDiagnostics,
    failed: true,
  } as RetryExecutorResult<TVal>;
}
