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
  MATERIAL_THEME_IDS,
  FANTASY_FLORA_IDS,
  FLORA_CHARACTER_WORDS,
  FLORA_PROGRAM_WORDS,
} from "../src/intent-prepass.js";
import {
  ERA_ALIASES,
  ERA_CLASSES,
  FLORA_SPECIES_IDS,
  MASSING_STYLES,
  ROOF_TYPES,
  TREE_SHAPES,
  WINDOW_RHYTHMS,
} from "@terrainist/spec";
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
    // miss: an invented era word ("pirate" as an era CLASS), an invented
    // theme id, and prose in a prefer list the compiler could only throw
    // away. The lists come from the spec so the prompt cannot drift from it.
    for (const era of ERA_CLASSES) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(era);
    }
    // Every alias is spelled out too — the classifier must know that "pirate"
    // is a legal spelling of renaissance rather than an era of its own.
    for (const alias of Object.keys(ERA_ALIASES)) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(alias);
    }
    expect(INTENT_CLASSIFIER_PROMPT).toContain("pirate");
    for (const theme of MATERIAL_THEME_IDS) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(theme);
    }
    expect(MATERIAL_THEME_IDS).toEqual([
      "temperate_timber",
      "boreal_pine",
      "birchwood_downs",
      "modern_city",
      "white_quartz",
      "sun_clay",
    ]);
    // The flora vocabulary is three closed sets now, not four tree shapes
    // (FLORA-GRAMMAR-v0 §6.1): a species named in a prefer list is the only
    // thing that reaches a fantasy species, so every word the compiler grounds
    // has to be a word the classifier is shown.
    for (const shape of TREE_SHAPES) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(shape);
    }
    for (const word of [...FLORA_SPECIES_IDS, ...FLORA_PROGRAM_WORDS, ...FLORA_CHARACTER_WORDS]) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(word);
    }
    // …and the gate is stated, not implied.
    expect(INTENT_CLASSIFIER_PROMPT).toContain("FANTASY gate");
    for (const id of FANTASY_FLORA_IDS) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(id);
    }
    expect(INTENT_CLASSIFIER_PROMPT).toMatch(/medieval fishing\s+village must never sprout glow trees/);
    for (const enumValue of [...ROOF_TYPES, ...MASSING_STYLES, ...WINDOW_RHYTHMS]) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(enumValue);
    }
    // Prop and archetype ids, so a phrase never looks like the expected shape.
    for (const id of ["cottage", "tavern", "lighthouse", "fountain", "galleon"]) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(id);
    }
  });

  it("states the prose-goes-in-tokens rule and the do-not-merge rule", () => {
    // Prose in a prefer list grounds nowhere; the fix is a structural rule,
    // not a hint.
    expect(INTENT_CLASSIFIER_PROMPT).toContain('PROSE GOES IN "tokens", NEVER IN A PREFER LIST.');
    expect(INTENT_CLASSIFIER_PROMPT).toContain('"unicorn island"');

    // Two distinct places must not collapse into one averaged character block.
    expect(INTENT_CLASSIFIER_PROMPT).toContain("ONE PLACE PER TOKEN — DO NOT MERGE PLACES.");
    expect(INTENT_CLASSIFIER_PROMPT).toContain('one "character" block covering both');
    expect(INTENT_CLASSIFIER_PROMPT).toContain('"region_<place>"');
  });

  it("carries one worked example showing a two-place prompt", () => {
    expect(INTENT_CLASSIFIER_PROMPT).toContain("EXAMPLE");
    expect(INTENT_CLASSIFIER_PROMPT).toContain("Good reply:");
    expect(INTENT_CLASSIFIER_PROMPT).toContain("region_unicorn_isle");
    expect(INTENT_CLASSIFIER_PROMPT).toContain("region_pirate_cove");
    // The example must be honest about the two observed failures.
    expect(INTENT_CLASSIFIER_PROMPT).toContain('no "era": "pirate"');
    // Exactly one worked example — this is a small-model prompt.
    expect(INTENT_CLASSIFIER_PROMPT.match(/Good reply:/g)).toHaveLength(1);
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
