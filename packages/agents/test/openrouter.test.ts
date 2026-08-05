/**
 * OpenRouter client retry tests.
 *
 * All against a stub `fetch` with fake timers — no network, no spend. Focused
 * on the transport retry loop's edges, especially the empty-content 200 that
 * killed a live generate run on 2026-08-04.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatComplete } from "../src/openrouter.js";
import type { FetchLike } from "../src/openrouter.js";

interface StubReply {
  readonly status?: number;
  readonly body: unknown;
}

function stubFetch(replies: readonly StubReply[]): { fetchImpl: FetchLike; calls: number[] } {
  const calls: number[] = [];
  const fetchImpl: FetchLike = async () => {
    const reply = replies[Math.min(calls.length, replies.length - 1)]!;
    calls.push(reply.status ?? 200);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}

const GOOD_BODY = {
  choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  model: "test/model",
};

/** A 200 whose first choice carries no text — the provider-hiccup shape. */
const EMPTY_BODY = { choices: [{ message: {} }] };

function callOptions(fetchImpl: FetchLike) {
  return {
    apiKey: "k",
    model: "test/model",
    messages: [{ role: "user" as const, content: "hi" }],
    fetchImpl,
  };
}

describe("chatComplete retry on empty content", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries once when a 200 has no message content, then succeeds", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: EMPTY_BODY }, { body: GOOD_BODY }]);
    const pending = chatComplete(callOptions(fetchImpl));
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.text).toBe("hello");
    expect(calls).toHaveLength(2);
  });

  it("gives up once all three attempts return empty content", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: EMPTY_BODY }]);
    const pending = chatComplete(callOptions(fetchImpl));
    pending.catch(() => {}); // assertion below re-awaits; avoid unhandled rejection
    await vi.runAllTimersAsync();
    await expect(pending).rejects.toThrow("no message content");
    expect(calls).toHaveLength(3);
  });

  it("names the output limit when reasoning consumed the whole budget", async () => {
    // 2026-08-04: Luna at max effort spent all 65,536 output tokens thinking
    // and wrote nothing. That arrives in the same shape as a provider hiccup,
    // and reporting it as "no message content" sent the investigation at the
    // network for a day. `finish_reason` is the only thing that tells them
    // apart, so the message has to carry what actually happened.
    const truncated = {
      choices: [{ message: { content: null }, finish_reason: "length" }],
      usage: {
        prompt_tokens: 6000,
        completion_tokens: 65536,
        total_tokens: 71536,
        completion_tokens_details: { reasoning_tokens: 65536 },
      },
      model: "test/model",
    };
    const { fetchImpl, calls } = stubFetch([{ body: truncated }]);
    const pending = chatComplete(callOptions(fetchImpl));
    pending.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(pending).rejects.toThrow(/output limit/);
    await expect(pending).rejects.toThrow(/65536 of its output tokens went to reasoning/);
    // Still retried — how long a model thinks varies, so the same call can land.
    expect(calls).toHaveLength(3);
  });

  it("does not retry other narrowing failures", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { error: { message: "boom" } } }]);
    await expect(chatComplete(callOptions(fetchImpl))).rejects.toThrow("OpenRouter error: boom");
    expect(calls).toHaveLength(1);
  });
});
