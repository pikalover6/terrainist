/**
 * Terrain-author agent tests.
 *
 * Every one of these runs against a stub `fetch`: no network, no API key, no
 * spend. The stub records the request bodies so the retry test can assert that
 * the diagnostics really went back to the model verbatim.
 */

import { describe, expect, it } from "vitest";

import { authorTerrainDoc, AuthoringFailedError } from "../src/author.js";
import { extractJson, stripFences } from "../src/json.js";
import { parseEnv } from "../src/env.js";
import { sumUsage } from "../src/openrouter.js";
import type { FetchLike } from "../src/openrouter.js";

/** A minimal, valid terrain-profile document. */
function validDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
          children: [
            {
              id: "the_peak",
              kind: "generator",
              generator: "terrain.edit@0",
              params: { verb: "peak", zone: "center", radius: 60, height: 60 },
            },
          ],
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "woods",
          kind: "generator",
          generator: "scatter.forest@0",
          params: {
            area: { all: true },
            density: 0.02,
            species: [{ id: "pine", weight: 1, shape: "spruce_tall" }],
          },
        },
      ],
    },
    ...overrides,
  };
}

/** A document the validator rejects: a `peak` placed with a `course`. */
function invalidDoc(): Record<string, unknown> {
  const doc = validDoc();
  const root = doc["root"] as { children: Record<string, unknown>[] };
  const heightfield = root.children[0] as { children: Record<string, unknown>[] };
  heightfield.children[0] = {
    id: "the_peak",
    kind: "generator",
    generator: "terrain.edit@0",
    params: { verb: "peak", course: [[0.2, 0.2], [0.8, 0.8]], radius: 60 },
  };
  return doc;
}

interface Recorded {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

/** A stub `fetch` that replies with `texts[i]` for the i-th call. */
function stubFetch(texts: readonly string[]): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
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

const BASE = { prompt: "a test world", size: 256, worldSeed: 4242, apiKey: "test-key", kit: "KIT" };

describe("authorTerrainDoc", () => {
  it("returns a validated document on the first attempt", async () => {
    const { fetchImpl, calls } = stubFetch([JSON.stringify(validDoc())]);
    const result = await authorTerrainDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(1);
    expect(result.diagnosticsPerAttempt).toEqual([[]]);
    expect(result.doc.meta.name).toBe("test_world");
    expect(result.usage.totalTokens).toBe(150);
    expect(result.usage.cost).toBeCloseTo(0.001);
    expect(calls).toHaveLength(1);

    const body = calls[0]?.body as {
      model: string;
      temperature: number;
      reasoning: { effort: string };
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("z-ai/glm-5.2");
    expect(body.temperature).toBe(0);
    expect(body.reasoning.effort).toBe("high");
    expect(body.messages[0]).toEqual({ role: "system", content: "KIT" });
    expect(body.messages[1]?.content).toContain("a test world");
  });

  it("pins the caller's worldSeed and size over whatever the model wrote", async () => {
    const doc = validDoc();
    (doc["meta"] as { worldSeed: number }).worldSeed = 999;
    const { fetchImpl } = stubFetch([JSON.stringify(doc)]);

    const result = await authorTerrainDoc({ ...BASE, worldSeed: 4242, size: 512, fetchImpl });
    expect(result.doc.meta.worldSeed).toBe(4242);
    expect(result.doc.root.envelope.size).toEqual([512, 512]);
  });

  it("retries with the diagnostics rendered verbatim, then succeeds", async () => {
    const { fetchImpl, calls } = stubFetch([
      JSON.stringify(invalidDoc()),
      JSON.stringify(validDoc()),
    ]);
    const result = await authorTerrainDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(2);
    expect(result.diagnosticsPerAttempt[0]?.length).toBeGreaterThan(0);
    expect(result.diagnosticsPerAttempt[1]).toEqual([]);
    // Both attempts' tokens are counted.
    expect(result.usage.totalTokens).toBe(300);

    const second = calls[1]?.body as { messages: { role: string; content: string }[] };
    expect(second.messages).toHaveLength(4);
    expect(second.messages[2]?.role).toBe("assistant");
    const retry = second.messages[3]?.content ?? "";
    expect(retry).toContain("LOAM-T102");
    expect(retry).toContain("BAD_PLACEMENT");
    expect(retry).toContain("world.terrain.the_peak.params");
    expect(retry).toContain("fix:");
    // The previous document goes back with the diagnostics.
    expect(retry).toContain('"verb":"peak"');
  });

  it("gives up after the attempt budget and reports every attempt", async () => {
    const { fetchImpl, calls } = stubFetch([JSON.stringify(invalidDoc())]);

    await expect(authorTerrainDoc({ ...BASE, fetchImpl })).rejects.toBeInstanceOf(
      AuthoringFailedError,
    );
    expect(calls).toHaveLength(3);

    try {
      await authorTerrainDoc({ ...BASE, fetchImpl });
      expect.unreachable();
    } catch (err) {
      const failure = err as AuthoringFailedError;
      expect(failure.attempts).toBe(3);
      expect(failure.diagnosticsPerAttempt).toHaveLength(3);
      expect(failure.diagnosticsPerAttempt[0]?.length).toBeGreaterThan(0);
      expect(failure.usage.totalTokens).toBe(450);
      expect(failure.message).toContain("LOAM-T102");
    }
  });

  it("strips markdown fences and leading prose", async () => {
    const fenced = `Here is the world you asked for:\n\n\`\`\`json\n${JSON.stringify(validDoc())}\n\`\`\`\n\nHope that helps!`;
    const { fetchImpl } = stubFetch([fenced]);
    const result = await authorTerrainDoc({ ...BASE, fetchImpl });
    expect(result.attempts).toBe(1);
    expect(result.doc.meta.name).toBe("test_world");
  });

  it("treats an unparseable reply as a diagnostic and retries", async () => {
    const { fetchImpl, calls } = stubFetch(["I'd rather not.", JSON.stringify(validDoc())]);
    const result = await authorTerrainDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(2);
    expect(result.diagnosticsPerAttempt[0]?.[0]?.code).toBe("LOAM-T000");
    const retry = (calls[1]?.body as { messages: { content: string }[] }).messages[3]?.content ?? "";
    expect(retry).toContain("no JSON object");
  });

  it("surfaces a non-2xx response as an error", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response("rate limited", { status: 429, statusText: "Too Many Requests" });
    await expect(authorTerrainDoc({ ...BASE, fetchImpl })).rejects.toThrow(/429/);
  });
});

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"a":1}')).toMatchObject({ ok: true, value: { a: 1 } });
  });

  it("parses a fenced object", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toMatchObject({ ok: true, value: { a: 1 } });
  });

  it("parses an unlabelled fence", () => {
    expect(extractJson('```\n{"a":1}\n```')).toMatchObject({ ok: true, value: { a: 1 } });
  });

  it("skips leading prose and trailing commentary", () => {
    const raw = 'Sure! Here it is:\n{"a": {"b": "}"}}\nLet me know if you want changes.';
    expect(extractJson(raw)).toMatchObject({ ok: true, value: { a: { b: "}" } } });
  });

  it("is not fooled by braces inside strings", () => {
    const raw = '{"name": "a } b", "n": 2} trailing';
    expect(extractJson(raw)).toMatchObject({ ok: true, value: { name: "a } b", n: 2 } });
  });

  it("reports an empty response", () => {
    expect(extractJson("   ")).toMatchObject({ ok: false });
  });

  it("reports a response with no object", () => {
    const result = extractJson("no json here");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("no '{' found");
  });

  it("reports an unterminated object", () => {
    const result = extractJson('{"a": 1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("unterminated");
  });

  it("reports malformed JSON inside a well-formed brace span", () => {
    const result = extractJson("prose {a: 1,} more");
    expect(result.ok).toBe(false);
  });
});

describe("stripFences", () => {
  it("leaves unfenced text alone", () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });

  it("handles an unclosed fence", () => {
    expect(stripFences('```json\n{"a":1}').trim()).toBe('{"a":1}');
  });
});

describe("parseEnv", () => {
  it("reads plain, exported, quoted and commented lines", () => {
    const env = parseEnv(
      ['# a comment', 'A=1', 'export B=two', 'C="three"', "D='four'", '', 'malformed', '=nokey'].join("\n"),
    );
    expect(env).toEqual({ A: "1", B: "two", C: "three", D: "four" });
  });
});

describe("sumUsage", () => {
  it("adds token counts and costs", () => {
    expect(
      sumUsage([
        { promptTokens: 1, completionTokens: 2, totalTokens: 3, cost: 0.5 },
        { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      ]),
    ).toEqual({ promptTokens: 11, completionTokens: 22, totalTokens: 33, cost: 0.5 });
  });

  it("omits cost when nothing reported one", () => {
    expect(sumUsage([{ promptTokens: 1, completionTokens: 1, totalTokens: 2 }]).cost).toBeUndefined();
  });
});
