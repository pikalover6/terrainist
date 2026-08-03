/**
 * The classify-the-prompt pre-pass, against a stubbed fetch.
 *
 * What is checked: the happy path returns a validated intent; a malformed
 * reply costs one retry and then succeeds; two bad replies leave the run
 * *without* intent rather than stopping it; and the classified intent reaches
 * both the authoring conversation and the finished document.
 */

import { describe, expect, it } from "vitest";

import { authorLoamDoc } from "../src/author.js";
import {
  classifyPromptIntent,
  intentKitContext,
  INTENT_CLASSIFIER_PROMPT,
} from "../src/intent-prepass.js";
import type { ChatMessage } from "../src/openrouter.js";

/** A stub `fetch` that replies with `texts[i]` to the i-th call. */
function stubFetch(texts: readonly string[]): {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  bodies: Record<string, unknown>[];
} {
  const bodies: Record<string, unknown>[] = [];
  let call = 0;
  const fetchImpl = async (_input: string, init?: RequestInit): Promise<Response> => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const text = texts[Math.min(call, texts.length - 1)] ?? "";
    call++;
    return new Response(
      JSON.stringify({
        model: "openai/gpt-5.6-luna",
        choices: [{ message: { content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { fetchImpl, bodies };
}

const GOOD = JSON.stringify({
  era: "pirate",
  wealth: 0.3,
  decline: 0.4,
  character: { label: "pirate haven" },
});

describe("classifyPromptIntent", () => {
  it("returns a validated intent from one call", async () => {
    const { fetchImpl, bodies } = stubFetch([GOOD]);
    const result = await classifyPromptIntent({
      prompt: "a grumpy pirate island",
      apiKey: "test",
      fetchImpl,
    });
    expect(result.failed).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.intent.character?.label).toBe("pirate haven");
    // One call, and the system prompt is the classifier's — not a kit.
    expect(bodies).toHaveLength(1);
    const messages = (bodies[0] as { messages: ChatMessage[] }).messages;
    expect(messages[0]?.content).toBe(INTENT_CLASSIFIER_PROMPT);
    expect(messages[0]?.content).not.toContain("loam");
  });

  it("teaches the classifier the vocabulary it is allowed to use", () => {
    // A model can only hit vocabulary it can see. Each of these was a real
    // miss: an invented era word, an invented theme id, and prose in a
    // prefer list that the compiler could only throw away.
    for (const era of [
      "primitive",
      "ancient",
      "medieval",
      "renaissance",
      "industrial",
      "modern",
      "far_future",
    ]) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(era);
    }
    for (const theme of [
      "temperate_timber",
      "boreal_pine",
      "birchwood_downs",
      "modern_city",
      "white_quartz",
    ]) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(theme);
    }
    for (const shape of ["spruce_tall", "spruce_squat", "oak_round", "birch_slim"]) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(shape);
    }
    // …and the two-places rule, which it broke by merging two islands into one
    // averaged blob.
    expect(INTENT_CLASSIFIER_PROMPT).toContain("do NOT average them");
  });

  it("retries once with the diagnostics when the object is invalid", async () => {
    const { fetchImpl, bodies } = stubFetch([JSON.stringify({ wealth: 7 }), GOOD]);
    const result = await classifyPromptIntent({
      prompt: "a rich city",
      apiKey: "test",
      fetchImpl,
    });
    expect(result.attempts).toBe(2);
    expect(result.failed).toBe(false);
    const retry = (bodies[1] as { messages: ChatMessage[] }).messages.at(-1);
    expect(retry?.content).toContain("LOAM-T104");
  });

  it("gives up quietly after the retry — a classifier never blocks a world", async () => {
    const { fetchImpl } = stubFetch(["not json at all", "still not json"]);
    const result = await classifyPromptIntent({
      prompt: "anything",
      apiKey: "test",
      fetchImpl,
    });
    expect(result.failed).toBe(true);
    expect(result.intent).toEqual({});
    expect(result.attempts).toBe(2);
  });

  it("never makes a second call when the first one lands", async () => {
    const { fetchImpl, bodies } = stubFetch([GOOD, GOOD]);
    await classifyPromptIntent({ prompt: "x", apiKey: "test", fetchImpl });
    expect(bodies).toHaveLength(1);
  });
});

describe("the intent reaches the authoring run", () => {
  const doc = {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "twin_isles", worldSeed: 1, prompt: "two islands" },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
      ],
    },
  };

  it("passes it as kit context and stores it in the document", async () => {
    const { fetchImpl, bodies } = stubFetch([JSON.stringify(doc)]);
    const result = await authorLoamDoc({
      prompt: "two islands",
      size: 256,
      worldSeed: 1,
      kitName: "terrain",
      kit: "KIT",
      apiKey: "test",
      fetchImpl,
      intent: { era: "pirate", character: { label: "pirate haven" } },
    });

    const first = (bodies[0] as { messages: ChatMessage[] }).messages[1];
    expect(first?.content).toContain('"label": "pirate haven"');
    expect(first?.content).toContain("own \"character\" block");

    expect((result.doc as { intent?: unknown }).intent).toEqual({
      era: "pirate",
      character: { label: "pirate haven" },
    });
  });

  it("leaves a document that authored its own intent alone", async () => {
    const authored = { ...doc, intent: { era: "far_future" } };
    const { fetchImpl } = stubFetch([JSON.stringify(authored)]);
    const result = await authorLoamDoc({
      prompt: "two islands",
      size: 256,
      worldSeed: 1,
      kitName: "terrain",
      kit: "KIT",
      apiKey: "test",
      fetchImpl,
      intent: { era: "pirate" },
    });
    // The model's own intent wins: it read the whole prompt, the classifier
    // read it in isolation.
    expect((result.doc as { intent?: { era?: string } }).intent?.era).toBe("far_future");
  });

  it("authors exactly as before when no intent is supplied", async () => {
    const { fetchImpl, bodies } = stubFetch([JSON.stringify(doc)]);
    const result = await authorLoamDoc({
      prompt: "two islands",
      size: 256,
      worldSeed: 1,
      kitName: "terrain",
      kit: "KIT",
      apiKey: "test",
      fetchImpl,
    });
    const first = (bodies[0] as { messages: ChatMessage[] }).messages[1];
    expect(first?.content).not.toContain("classifier");
    expect((result.doc as { intent?: unknown }).intent).toBeUndefined();
  });

  it("renders the kit context with the intent JSON in it", () => {
    const text = intentKitContext({ wealth: 0.9 });
    expect(text).toContain('"wealth": 0.9');
    expect(text).toContain("region node its own");
  });
});
