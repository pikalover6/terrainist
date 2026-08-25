/**
 * Candidate-menu injection tests — the prompt-identity gate.
 *
 * The menu is a change to what the model is *shown*, and the only honest way to
 * measure such a change is against a baseline that provably did not move. So
 * the load-bearing test here is the negative one: with no menu handed in, the
 * messages array `authorLoamDoc` builds is byte-for-byte the array it built
 * before this feature existed — same length, same roles, same content, in the
 * same order. That is this feature's equivalent of the byte-identity shasum a
 * compiler flag ships behind (`CLAUDE.md`, byte-identity staging).
 *
 * The positive tests hold the seam: the kit stays message 0 so a cached prefix
 * stays cached, and the menu survives into a compile-feedback round because
 * `trimRevisionConversation` preserves every leading system message.
 *
 * Stub `fetch` throughout: no network, no API key, no spend.
 */

import { describe, expect, it } from "vitest";

import type { SemanticIntent } from "@terrainist/spec";

import {
  authorLoamDoc,
  reviseLoamDoc,
  trimRevisionConversation,
  userPrompt,
} from "../src/author.js";
import type { ChatMessage, FetchLike } from "../src/openrouter.js";

/** A minimal, valid terrain-profile document. */
function validDoc(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "test_world", worldSeed: 1, prompt: "a test world" },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 40 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
      ],
    },
  };
}

interface Recorded {
  readonly body: { messages: ChatMessage[] };
}

/** A stub `fetch` that always replies with a valid document. */
function stubFetch(): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    calls.push({ body: JSON.parse(String(init?.body)) as { messages: ChatMessage[] } });
    return new Response(
      JSON.stringify({
        model: "google/gemini-3.7-flash",
        choices: [
          { message: { role: "assistant", content: JSON.stringify(validDoc()) }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.001 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { fetchImpl, calls };
}

const BASE = {
  prompt: "a test world",
  size: 256,
  worldSeed: 4242,
  apiKey: "test-key",
  kit: "KIT",
  kitName: "terrain" as const,
};

const MENU = "CANDIDATE STRUCTURES\n  stoa   bldg  XL  Stoa — the agora's long side.";

/** The messages the run actually sent, in order. */
async function sentMessages(
  options: { readonly menu?: string; readonly intent?: SemanticIntent } = {},
): Promise<ChatMessage[]> {
  const { fetchImpl, calls } = stubFetch();
  await authorLoamDoc({
    ...BASE,
    fetchImpl,
    ...(options.menu === undefined ? {} : { candidateMenu: options.menu }),
    ...(options.intent === undefined ? {} : { intent: options.intent }),
  });
  return calls[0]?.body.messages ?? [];
}

describe("the candidate menu, off", () => {
  it("changes nothing at all: the conversation is what it was before", async () => {
    const withoutField = await sentMessages();
    // Every way of saying "no menu" is the same way: an absent field, an empty
    // string, and the whitespace an empty render could leave behind.
    for (const menu of ["", "   \n "]) {
      expect(await sentMessages({ menu }), JSON.stringify(menu)).toEqual(withoutField);
    }
    // Pinned against the turn builders themselves rather than against a
    // snapshot of my own code path: this is the array as it was authored
    // before the menu existed.
    expect(withoutField).toEqual([
      { role: "system", content: "KIT" },
      { role: "user", content: userPrompt("a test world", 256, 4242, "terrain") },
    ]);
  });

  it("leaves the intent path exactly where it was", async () => {
    const intent = { era: "classical", character: { formPacks: ["classical_mediterranean"] } };
    const before = await sentMessages({ intent });
    const after = await sentMessages({ intent, menu: "" });
    expect(after).toEqual(before);
    expect(before).toHaveLength(2);
    expect(before[1]?.content).toContain("classical_mediterranean");
  });
});

describe("the candidate menu, on", () => {
  it("goes in as a second system message, after the kit and before the prompt", async () => {
    const messages = await sentMessages({ menu: MENU });
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "system", content: "KIT" });
    expect(messages[1]).toEqual({ role: "system", content: MENU });
    expect(messages[2]?.role).toBe("user");
    // The user turn is untouched — the menu did not ride along inside it.
    const off = await sentMessages();
    expect(messages[2]).toEqual(off[1]);
  });

  it("does not disturb the kit, so a cached prefix stays cached", async () => {
    const off = await sentMessages();
    const on = await sentMessages({ menu: MENU });
    expect(on[0]).toEqual(off[0]);
  });

  it("is carried verbatim — no wrapper, no re-wrap, no trimming", async () => {
    const messages = await sentMessages({ menu: MENU });
    expect(messages[1]?.content).toBe(MENU);
  });

  it("survives the revision trim into a compile-feedback round", async () => {
    const { fetchImpl, calls } = stubFetch();
    const authored = await authorLoamDoc({ ...BASE, candidateMenu: MENU, fetchImpl });

    // The trim keeps every leading system message; that is what carries it.
    const trimmed = trimRevisionConversation(authored.messages);
    expect(trimmed.messages[1]).toEqual({ role: "system", content: MENU });

    await reviseLoamDoc({
      messages: authored.messages,
      feedback: "the basin rim never closes",
      previous: JSON.stringify(validDoc()),
      worldSeed: 4242,
      size: 256,
      kitName: "terrain",
      apiKey: "test-key",
      fetchImpl,
    });
    const revision = calls[1]?.body.messages ?? [];
    expect(revision[0]).toEqual({ role: "system", content: "KIT" });
    expect(revision[1]).toEqual({ role: "system", content: MENU });
    expect(revision[revision.length - 1]?.content).toContain("the basin rim never closes");
  });
});
