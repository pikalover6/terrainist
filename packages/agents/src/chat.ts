/**
 * A very small chat-completions client for any OpenAI-compatible API.
 *
 * Deliberately not an SDK: one endpoint (`<base>/chat/completions`), `fetch`,
 * and typed narrowing of the fields we actually read. The request is the
 * OpenAI shape and nothing else — `model`, `messages`, `temperature`,
 * `reasoning_effort`, `max_tokens` — so OpenRouter, OpenAI, and any server
 * that speaks the same dialect are drop-in through `TERRAINIST_API_BASE`.
 * `fetch` is injectable so the tests never touch the network.
 */

import { AUTHORING_MODEL_ID, DEFAULT_API_BASE } from "./config.js";

/** One chat message. */
export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** Token accounting returned by the API. */
export interface Usage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /** Cost in the provider's currency, when the API reports one (OpenRouter does). */
  readonly cost?: number;
  /**
   * Tokens the model spent thinking, when the provider reports them.
   *
   * Providers that report this include the count *inside*
   * `completionTokens` (it bills at the completion rate), so this is a
   * breakdown of the output, never an addition to it. The 2026-08-14
   * Luna/Gemini head-to-head is why it is recorded: two models can match
   * on price while one spends 5× the output tokens, and without this
   * split "token efficiency" can't be told apart from "unit price".
   */
  readonly reasoningTokens?: number;
}

/** What one completion produced. */
export interface CompletionResult {
  readonly text: string;
  readonly usage: Usage;
  readonly model: string;
  readonly finishReason?: string;
}

/** The `fetch` shape this module needs. Lets tests inject a stub. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Options shared by every call. */
export interface ClientOptions {
  readonly apiKey: string;
  /** The API root; `<base>/chat/completions` is posted to. Default {@link DEFAULT_API_BASE}. */
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
}

/** Options for {@link chatComplete}. */
export interface ChatOptions extends ClientOptions {
  readonly model?: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature?: number;
  readonly reasoningEffort?: string;
  readonly maxTokens?: number;
}

const ZERO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
const CHAT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;


/** Sum a list of usages — the per-attempt totals of an authoring run. */
export function sumUsage(parts: readonly Usage[]): Usage {
  let cost = 0;
  let sawCost = false;
  let reasoning = 0;
  let sawReasoning = false;
  let prompt = 0;
  let completion = 0;
  let total = 0;
  for (const p of parts) {
    prompt += p.promptTokens;
    completion += p.completionTokens;
    total += p.totalTokens;
    if (p.cost !== undefined) {
      cost += p.cost;
      sawCost = true;
    }
    if (p.reasoningTokens !== undefined) {
      reasoning += p.reasoningTokens;
      sawReasoning = true;
    }
  }
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    ...(sawCost ? { cost } : {}),
    ...(sawReasoning ? { reasoningTokens: reasoning } : {}),
  };
}

/** Run one chat completion. Throws on any non-2xx response. */
export async function chatComplete(options: ChatOptions): Promise<CompletionResult> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const model = options.model ?? AUTHORING_MODEL_ID;
  const url = chatCompletionsUrl(options.baseUrl ?? DEFAULT_API_BASE);
  const where = apiHost(url);

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0,
  };
  if (options.reasoningEffort !== undefined) body["reasoning_effort"] = options.reasoningEffort;
  if (options.maxTokens !== undefined) body["max_tokens"] = options.maxTokens;

  // Retries on network-shaped failures only: a rejected fetch, a 5xx, a
  // truncated body (res.json() throwing "Unexpected end of JSON input" after a
  // long request through a proxy), or a 200 whose message has no content at
  // all — an upstream-provider hiccup the server passes through as an empty
  // choice. Anything the server *said* — a 4xx, or a well-formed body that
  // fails narrowing for any other reason — is not retried here: 4xx repeats
  // identically, and content-level problems belong to the authoring loop's
  // diagnostic retries, not this one.
  //
  // Three, not two: a max-effort program call runs for minutes and burns six
  // figures of reasoning tokens, which is exactly the shape of request a
  // provider drops, and two attempts was observed losing a landmark outright
  // (2026-08-04). Raised to six with exponential backoff after two unattended
  // battery generations died the same night (2026-08-10/11) to connection
  // blips that outlasted the old 2s+4s: a Wi-Fi renegotiation or DNS hiccup
  // runs tens of seconds, and an unattended run must ride it out. Worst case
  // this adds ~62s to a doomed call, which is nothing against losing a world.
  const attempts = 6;
  const backoff = (attempt: number): number => Math.min(2000 * 2 ** (attempt - 1), 30_000);
  let lastFailure: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: Awaited<ReturnType<FetchLike>>;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error(`${where} request timed out after ${CHAT_REQUEST_TIMEOUT_MS / 1000}s`)),
      CHAT_REQUEST_TIMEOUT_MS,
    );
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      // undici's "fetch failed" carries the network error in `cause` (the
      // Stocktake Run's G1 lost two generations to it, unit 46); say which.
      const inner = (cause as { cause?: { message?: string; code?: string } }).cause;
      const why = inner === undefined ? "" : ` (${inner.code ?? ""}${inner.code && inner.message ? ": " : ""}${inner.message ?? ""})`;
      lastFailure = new Error(`${where} fetch failed: ${(cause as Error).message}${why}`);
      if (attempt < attempts) await sleepMs(backoff(attempt));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await safeText(response);
      const failure = new Error(`${where} ${response.status} ${response.statusText}: ${detail}`);
      if (response.status >= 500 && attempt < attempts) {
        lastFailure = failure;
        await sleepMs(backoff(attempt));
        continue;
      }
      throw failure;
    }

    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch (cause) {
      lastFailure = new Error(
        `${where} response body unreadable (truncated?): ${(cause as Error).message}`,
      );
      if (attempt < attempts) await sleepMs(backoff(attempt));
      continue;
    }
    try {
      return narrowCompletion(payload, model, where);
    } catch (cause) {
      if (
        (cause instanceof EmptyContentError || cause instanceof OutputBudgetError) &&
        attempt < attempts
      ) {
        lastFailure = cause;
        await sleepMs(backoff(attempt));
        continue;
      }
      throw cause;
    }
  }
  throw lastFailure ?? new Error(`${where} request failed`);
}

/** A 200 whose first choice carried no text — retryable provider hiccup. */
class EmptyContentError extends Error {}

/**
 * The model hit the output ceiling before writing anything.
 *
 * Retried like a hiccup — how long a max-effort model thinks varies run to run,
 * so the same call can succeed — but never by asking it to think less: the
 * remedy is a bigger budget, and callers that need one set `maxTokens`.
 */
class OutputBudgetError extends Error {}

/** Injectable only via tests' fake timers; a plain delay between retries. */
function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */

/** The chat-completions URL for an API root. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/** The host of a URL, for error messages; the URL itself when it does not parse. */
function apiHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function narrowCompletion(payload: unknown, requestedModel: string, where: string): CompletionResult {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(`${where} returned a non-object response body`);
  }
  const p = payload as {
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
      cost?: unknown;
      completion_tokens_details?: { reasoning_tokens?: unknown };
    };
    model?: unknown;
    error?: { message?: unknown };
  };

  if (p.error !== undefined) {
    throw new Error(`${where} error: ${String(p.error.message ?? "unknown")}`);
  }

  const choice = p.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string") {
    // Two very different failures arrive in the same shape, and calling both
    // "no message content" cost a day: a provider hiccup (retry it), and a
    // model that spent its whole output budget on reasoning and had nothing
    // left to say (retrying an identical call mostly repeats it). Only
    // `finish_reason` tells them apart, so it goes in the message.
    if (choice?.finish_reason === "length") {
      const reasoning = num(p.usage?.completion_tokens_details?.reasoning_tokens);
      throw new OutputBudgetError(
        `${where} stopped on the output limit before the model wrote any content` +
          `${reasoning > 0 ? ` — ${reasoning} of its output tokens went to reasoning` : ""}. ` +
          `Raise max_tokens for this call.`,
      );
    }
    throw new EmptyContentError(`${where} response had no message content`);
  }

  const reasoningTokens = num(p.usage?.completion_tokens_details?.reasoning_tokens);
  const usage: Usage = {
    promptTokens: num(p.usage?.prompt_tokens),
    completionTokens: num(p.usage?.completion_tokens),
    totalTokens: num(p.usage?.total_tokens),
    ...(typeof p.usage?.cost === "number" ? { cost: p.usage.cost } : {}),
    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
  };

  return {
    text: content,
    usage: usage.totalTokens === 0 && usage.promptTokens === 0 ? { ...ZERO_USAGE, ...usage } : usage,
    model: typeof p.model === "string" ? p.model : requestedModel,
    ...(typeof choice?.finish_reason === "string"
      ? { finishReason: choice.finish_reason }
      : {}),
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "<no body>";
  }
}
