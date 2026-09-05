/**
 * The revision-conversation trim.
 *
 * `out/e2e/comparison.md` measured compile-feedback rounds at a 9:1
 * prompt-to-completion cost ratio, because every rejected attempt and every
 * prior document rode along into each later round. These tests pin what
 * survives the trim (the kit, the original prompt, the current round) and what
 * does not, and check the saving is real rather than nominal.
 *
 * No network: the `reviseLoamDoc` test runs against a stub `fetch` that records
 * the request body, which is the only way to assert what actually goes on the
 * wire.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_KEPT_ROUNDS, reviseLoamDoc, trimRevisionConversation } from "../src/author.js";
import { AUTHORING_TEMPERATURE } from "../src/config.js";
import type { ChatMessage, FetchLike } from "../src/chat.js";

/** A stand-in for a whole Loam document — big, and the reason the trim exists. */
const BIG_DOC = `{"loam":"1","filler":"${"x".repeat(4000)}"}`;

/** A minimal, valid Loam 1 document the loop will accept. */
function validDoc(): Record<string, unknown> {
  return { loam: "1", name: "test_world", seed: 1, prompt: "a test world", size: [256, 256] };
}

/** A conversation with `rounds` completed revision rounds behind it. */
function conversation(rounds: number): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: "THE KIT" },
    { role: "user", content: "ORIGINAL PROMPT: a hillside village" }
  ];
  for (let i = 0; i < rounds; i++) {
    messages.push({ role: "assistant", content: `${BIG_DOC} // round ${i}` });
    messages.push({ role: "user", content: `diagnostics for round ${i}` });
  }
  return messages;
}

describe("trimRevisionConversation", () => {
  it("keeps the kit and the original prompt", () => {
    const before = conversation(3);
    const { messages } = trimRevisionConversation(before);
    expect(messages[0]).toEqual(before[0]);
    expect(messages[1]).toEqual(before[1]);
  });

  it("replaces every superseded round with a single one-line marker", () => {
    const { messages, droppedMessages } = trimRevisionConversation(conversation(3));
    expect(droppedMessages).toBe(6);
    expect(messages).toHaveLength(3);
    const marker = messages[2];
    expect(marker?.role).toBe("user");
    expect(marker?.content.split("\n")).toHaveLength(1);
    expect(marker?.content).toContain("6 earlier turn(s) omitted");
    expect(marker?.content).toContain("3 superseded document(s)");
  });

  it("cuts the conversation's length by more than an order of magnitude", () => {
    const before = conversation(3);
    const { messages, droppedChars } = trimRevisionConversation(before);
    const size = (m: readonly ChatMessage[]): number =>
      m.reduce((sum, x) => sum + x.content.length, 0);
    expect(size(messages)).toBeLessThan(size(before) / 10);
    expect(droppedChars).toBeGreaterThan(size(before) * 0.9);
    // No document text survives: that is the whole saving.
    expect(messages.some((m) => m.content.includes(BIG_DOC))).toBe(false);
  });

  it("defaults to keeping no prior round, because the current one follows it", () => {
    expect(DEFAULT_KEPT_ROUNDS).toBe(0);
  });

  it("keeps the latest round verbatim when asked, and trims only older ones", () => {
    const before = conversation(3);
    const { messages, droppedMessages } = trimRevisionConversation(before, { keepRounds: 1 });
    expect(droppedMessages).toBe(4);
    expect(messages).toHaveLength(5);
    expect(messages[3]).toEqual(before[6]);
    expect(messages[4]).toEqual(before[7]);
    expect(messages[3]?.content).toContain("round 2");
  });

  it("is a no-op on a fresh conversation with nothing to supersede", () => {
    const before = conversation(0);
    const { messages, droppedMessages, droppedChars } = trimRevisionConversation(before);
    expect(messages).toEqual(before);
    expect(droppedMessages).toBe(0);
    expect(droppedChars).toBe(0);
  });

  it("survives a conversation with no system or no user turn", () => {
    expect(trimRevisionConversation([]).messages).toEqual([]);
    const userless: ChatMessage[] = [
      { role: "system", content: "kit" },
      { role: "assistant", content: BIG_DOC }
    ];
    const out = trimRevisionConversation(userless);
    expect(out.messages[0]).toEqual(userless[0]);
    expect(out.messages).toHaveLength(2);
    expect(out.messages[1]?.role).toBe("user");
  });

  it("is pure and deterministic", () => {
    const before = conversation(2);
    const snapshot = JSON.stringify(before);
    const a = trimRevisionConversation(before);
    const b = trimRevisionConversation(conversation(2));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(a.messages).toEqual(b.messages);
  });
});

describe("reviseLoamDoc sends the trimmed conversation", () => {
  it("puts the kit, the prompt, the current document and the feedback on the wire", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          model: "stub",
          choices: [{ message: { content: JSON.stringify(validDoc()) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const current = JSON.stringify(validDoc());
    await reviseLoamDoc({
      messages: conversation(3),
      previous: current,
      feedback: "LOAM-T209 ROAD_UNROUTABLE: the inn cannot be reached",
      worldSeed: 1,
      size: 256,
      kitName: "settlement",
      apiKey: "stub",
      fetchImpl
    });

    expect(bodies).toHaveLength(1);
    const sent = bodies[0] as { messages: ChatMessage[]; temperature: number };
    expect(sent.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "user",
      "assistant",
      "user"
    ]);
    expect(sent.messages[0]?.content).toBe("THE KIT");
    expect(sent.messages[1]?.content).toContain("ORIGINAL PROMPT");
    expect(sent.messages[2]?.content).toContain("omitted");
    expect(sent.messages[3]?.content).toBe(current);
    expect(sent.messages[4]?.content).toContain("ROAD_UNROUTABLE");
    // No superseded document rode along.
    expect(sent.messages.some((m) => m.content.includes(BIG_DOC))).toBe(false);
    // Determinism is untouched.
    expect(sent.temperature).toBe(AUTHORING_TEMPERATURE);
  });
});
