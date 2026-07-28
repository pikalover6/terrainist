/**
 * A very small OpenRouter client — chat completions and the model catalog.
 *
 * Deliberately not an SDK: two endpoints, `fetch`, and typed narrowing of the
 * fields we actually read. `fetch` is injectable so the tests never touch the
 * network.
 */

import {
  ATTRIBUTION_HEADERS,
  CHAT_COMPLETIONS_URL,
  GLM_MODEL_ID,
  MODELS_URL,
} from "./config.js";

/** One chat message. */
export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** Token accounting returned by OpenRouter. */
export interface Usage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /** Credits charged, when OpenRouter reports them. */
  readonly cost?: number;
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

/** Sum a list of usages — the per-attempt totals of an authoring run. */
export function sumUsage(parts: readonly Usage[]): Usage {
  let cost = 0;
  let sawCost = false;
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
  }
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    ...(sawCost ? { cost } : {}),
  };
}

/** Run one chat completion. Throws on any non-2xx response. */
export async function chatComplete(options: ChatOptions): Promise<CompletionResult> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const model = options.model ?? GLM_MODEL_ID;

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0,
    usage: { include: true },
  };
  if (options.reasoningEffort !== undefined) {
    body["reasoning"] = { effort: options.reasoningEffort };
  }
  if (options.maxTokens !== undefined) body["max_tokens"] = options.maxTokens;

  const response = await doFetch(CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...ATTRIBUTION_HEADERS,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await safeText(response);
    throw new Error(`OpenRouter ${response.status} ${response.statusText}: ${detail}`);
  }

  const payload = (await response.json()) as unknown;
  return narrowCompletion(payload, model);
}

/**
 * Confirm the pinned model still exists.
 *
 * On failure the error lists near-matches from the live catalog, so the fix is
 * "change the pin to this id" rather than "go read the API docs".
 */
export async function verifyModelAvailable(
  options: ClientOptions & { readonly model?: string },
): Promise<void> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const wanted = options.model ?? GLM_MODEL_ID;

  const response = await doFetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${options.apiKey}`, ...ATTRIBUTION_HEADERS },
  });
  if (!response.ok) {
    throw new Error(
      `OpenRouter model catalog ${response.status} ${response.statusText}: ${await safeText(response)}`,
    );
  }

  const payload = (await response.json()) as { data?: { id?: unknown }[] };
  const ids = (payload.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string");

  if (ids.includes(wanted)) return;

  const near = ids.filter((id) => /glm|z-ai|zhipu/i.test(id)).sort();
  throw new Error(
    `OpenRouter has no model "${wanted}". ${
      near.length === 0
        ? "No GLM/Z.ai models are listed at all."
        : `Near matches: ${near.join(", ")}`
    }\nUpdate GLM_MODEL_ID in packages/agents/src/config.ts.`,
  );
}

/* -------------------------------------------------------------------------- */

function narrowCompletion(payload: unknown, requestedModel: string): CompletionResult {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("OpenRouter returned a non-object response body");
  }
  const p = payload as {
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
      cost?: unknown;
    };
    model?: unknown;
    error?: { message?: unknown };
  };

  if (p.error !== undefined) {
    throw new Error(`OpenRouter error: ${String(p.error.message ?? "unknown")}`);
  }

  const choice = p.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter response had no message content");
  }

  const usage: Usage = {
    promptTokens: num(p.usage?.prompt_tokens),
    completionTokens: num(p.usage?.completion_tokens),
    totalTokens: num(p.usage?.total_tokens),
    ...(typeof p.usage?.cost === "number" ? { cost: p.usage.cost } : {}),
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
