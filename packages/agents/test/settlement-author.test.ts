/**
 * Settlement authoring and the compile-feedback turn.
 *
 * Like the terrain-author tests, every case here runs against a stub `fetch`:
 * no network, no API key, no spend.
 */

import { describe, expect, it } from "vitest";

import { authorLoamDoc, AuthoringFailedError, reviseLoamDoc } from "../src/author.js";
import type { FetchLike } from "../src/openrouter.js";

/** A minimal, valid settlement-profile document with a real settlement in it. */
function settlementDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "test_hamlet", worldSeed: 1, prompt: "a test hamlet" },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 20, baseHeight: 76, erosionPasses: 2 },
          children: [
            {
              id: "shelf",
              kind: "generator",
              generator: "terrain.edit@0",
              params: { verb: "plateau", at: [0.5, 0.5], radius: 80, height: 6 },
            },
          ],
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "green",
          kind: "primitive",
          envelope: { shape: "region", size: [18, 18] },
          constraints: [{ zone: "center" }, { terrain_conform: "flatten", reference: "median" }],
          tags: ["plaza"],
        },
        {
          id: "cottage",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [9, 8, 8] },
          params: { floors: 1, roof: "gable" },
          constraints: [
            { adjacent_to: "green", gap: [1, 8] },
            { facing: "green" },
            { terrain_conform: "cut_fill", reference: "median", blend: 4 },
          ],
          ports: { door: { type: "door", face: "north" } },
          tags: ["house"],
        },
        {
          id: "lanes",
          kind: "generator",
          generator: "road.network@0",
          params: { anchors: ["green", "#tag:house"], pattern: "organic", width: 3 },
        },
        {
          id: "woods",
          kind: "generator",
          generator: "scatter.forest@0",
          params: {
            area: { all: true },
            density: 0.02,
            avoidTags: ["structure", "road", "plaza"],
            species: [{ id: "oak", shape: "oak_round" }],
          },
        },
      ],
    },
    ...overrides,
  };
}

/** A settlement document the validator rejects: two plazas. */
function twoPlazaDoc(): Record<string, unknown> {
  const doc = settlementDoc();
  const root = doc["root"] as { children: Record<string, unknown>[] };
  root.children.push({
    id: "market",
    kind: "primitive",
    envelope: { shape: "region", size: [12, 12] },
    tags: ["plaza"],
  });
  return doc;
}

interface Recorded {
  readonly body: Record<string, unknown>;
}

function stubFetch(texts: readonly string[]): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (_url, init) => {
    calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const text = texts[Math.min(i, texts.length - 1)];
    i++;
    return new Response(
      JSON.stringify({
        model: "z-ai/glm-5.2",
        choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.001 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { fetchImpl, calls };
}

function messagesOf(call: Recorded | undefined): { role: string; content: string }[] {
  return (call?.body as { messages: { role: string; content: string }[] } | undefined)?.messages ?? [];
}

const BASE = {
  prompt: "a test hamlet",
  size: 256,
  worldSeed: 4242,
  apiKey: "test-key",
  kit: "SETTLEMENT KIT",
};

describe("authorLoamDoc — settlement", () => {
  it("validates a settlement document against the settlement validator", async () => {
    const { fetchImpl, calls } = stubFetch([JSON.stringify(settlementDoc())]);
    const result = await authorLoamDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(1);
    expect(result.kitName).toBe("settlement");
    expect(result.diagnosticsPerAttempt).toEqual([[]]);
    expect(result.doc.profile).toBe("settlement");
    expect(messagesOf(calls[0])[0]?.content).toBe("SETTLEMENT KIT");
    expect(messagesOf(calls[0])[1]?.content).toContain("settlement-profile");
    // The kit is what teaches the model that wilderness is a valid answer, but
    // the first turn repeats it so a terrain-only reply is never a surprise.
    expect(messagesOf(calls[0])[1]?.content).toContain("no habitation");
  });

  it("rejects a settlement-illegal document and retries with the diagnostics", async () => {
    const { fetchImpl, calls } = stubFetch([
      JSON.stringify(twoPlazaDoc()),
      JSON.stringify(settlementDoc()),
    ]);
    const result = await authorLoamDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(2);
    const retry = messagesOf(calls[1])[3]?.content ?? "";
    expect(retry).toContain("LOAM-T202");
    expect(retry).toContain("PLAZA_CARDINALITY");
    expect(retry).toContain("fix:");
  });

  it("accepts a terrain-only settlement document", async () => {
    const doc = settlementDoc();
    const root = doc["root"] as { children: { id: string }[] };
    root.children = root.children.filter(
      (c) => !["green", "cottage", "lanes"].includes(c.id),
    );
    const { fetchImpl } = stubFetch([JSON.stringify(doc)]);
    const result = await authorLoamDoc({ ...BASE, fetchImpl });
    expect(result.attempts).toBe(1);
    expect(result.doc.root.children).toHaveLength(3);
  });

  it("keeps the terrain kit on the terrain validator", async () => {
    // A settlement document handed to the terrain profile must fail, which is
    // what proves `--kit terrain` really selects the narrower validator.
    const { fetchImpl } = stubFetch([JSON.stringify(settlementDoc())]);
    await expect(
      authorLoamDoc({ ...BASE, kitName: "terrain", fetchImpl }),
    ).rejects.toBeInstanceOf(AuthoringFailedError);
  });
});

describe("reviseLoamDoc", () => {
  it("continues the conversation with the compile feedback verbatim", async () => {
    const first = stubFetch([JSON.stringify(settlementDoc())]);
    const authored = await authorLoamDoc({ ...BASE, fetchImpl: first.fetchImpl });

    const revised = settlementDoc();
    (revised["meta"] as { name: string }).name = "test_hamlet_v2";
    const second = stubFetch([JSON.stringify(revised)]);

    const feedback =
      "warning LOAM-T105 BASIN_RIM_NOT_CLOSED at world.terrain.the_mere: the rim never closes\n  fix: widen it";
    const result = await reviseLoamDoc({
      messages: authored.messages,
      feedback,
      previous: JSON.stringify(authored.doc),
      worldSeed: 4242,
      size: 256,
      kitName: authored.kitName,
      apiKey: "test-key",
      fetchImpl: second.fetchImpl,
    });

    expect(result.doc.meta.name).toBe("test_hamlet_v2");
    expect(result.usage.totalTokens).toBe(150);

    const messages = messagesOf(second.calls[0]);
    // system, first user turn, the previous document, the feedback turn.
    expect(messages).toHaveLength(4);
    expect(messages[0]?.content).toBe("SETTLEMENT KIT");
    expect(messages[2]?.role).toBe("assistant");
    expect(messages[2]?.content).toContain("test_hamlet");
    expect(messages[3]?.content).toContain("LOAM-T105");
    expect(messages[3]?.content).toContain("BASIN_RIM_NOT_CLOSED");
    expect(messages[3]?.content).toContain("fix: widen it");
    expect(messages[3]?.content).toContain("Change as little as possible");
  });

  it("still pins the caller's seed and size on a revision", async () => {
    const doc = settlementDoc();
    (doc["meta"] as { worldSeed: number }).worldSeed = 5;
    (doc["root"] as { envelope: { size: number[] } }).envelope.size = [64, 64];
    const { fetchImpl } = stubFetch([JSON.stringify(doc)]);

    const result = await reviseLoamDoc({
      messages: [{ role: "system", content: "KIT" }],
      feedback: "something to fix",
      previous: "{}",
      worldSeed: 99,
      size: 320,
      apiKey: "test-key",
      fetchImpl,
    });
    expect(result.doc.meta.worldSeed).toBe(99);
    expect(result.doc.root.envelope.size).toEqual([320, 320]);
  });
});
