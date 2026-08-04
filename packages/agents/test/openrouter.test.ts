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

  it("gives up after the retry also returns empty content", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: EMPTY_BODY }]);
    const pending = chatComplete(callOptions(fetchImpl));
    pending.catch(() => {}); // assertion below re-awaits; avoid unhandled rejection
    await vi.runAllTimersAsync();
    await expect(pending).rejects.toThrow("no message content");
    expect(calls).toHaveLength(2);
  });

  it("does not retry other narrowing failures", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { error: { message: "boom" } } }]);
    await expect(chatComplete(callOptions(fetchImpl))).rejects.toThrow("OpenRouter error: boom");
    expect(calls).toHaveLength(1);
  });
});
