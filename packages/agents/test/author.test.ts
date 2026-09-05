/**
 * Document-author agent tests.
 *
 * Every one of these runs against a stub `fetch`: no network, no API key, no
 * spend. The stub records the request bodies so the retry test can assert that
 * the diagnostics really went back to the model verbatim.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { authorLoamDoc, AuthoringFailedError } from "../src/author.js";
import { extractJson, stripFences } from "../src/json.js";
import { apiBaseUrl, defaultModel, loadApiKey, parseEnv } from "../src/env.js";
import { sumUsage } from "../src/chat.js";
import type { FetchLike } from "../src/chat.js";

/** A minimal, valid Loam 1 document. */
function validDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    loam: "1",
    name: "test_world",
    seed: 1,
    prompt: "a test world",
    size: [256, 256],
    terrain: { sea: 63, relief: 40 },
    land: [{ verb: "peak", zone: "center", radius: 60, height: 60, id: "the_peak" }],
    woods: [{ id: "pines", density: 0.02, species: [{ id: "pine", weight: 1, shape: "spruce_tall" }] }],
    ...overrides,
  };
}

/** A document the validator rejects: a key the language does not have. */
function invalidDoc(): Record<string, unknown> {
  return validDoc({ profile: "settlement" });
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
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.001 }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { fetchImpl, calls };
}

const BASE = { prompt: "a test world", size: 256, worldSeed: 4242, apiKey: "test-key", kit: "KIT" };

describe("authorLoamDoc", () => {
  it("returns a validated document on the first attempt", async () => {
    const { fetchImpl, calls } = stubFetch([JSON.stringify(validDoc())]);
    const result = await authorLoamDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(1);
    expect(result.diagnosticsPerAttempt).toEqual([[]]);
    expect(result.loam["name"]).toBe("test_world");
    expect(result.doc.meta.name).toBe("test_world");
    expect(result.usage.totalTokens).toBe(150);
    expect(result.usage.cost).toBeCloseTo(0.001);
    expect(calls).toHaveLength(1);

    const body = calls[0]?.body as {
      model: string;
      temperature: number;
      reasoning_effort: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("google/gemini-3.8-flash");
    expect(body.temperature).toBe(1);
    expect(body.reasoning_effort).toBe("high");
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.messages[0]).toEqual({ role: "system", content: "KIT" });
    expect(body.messages[1]?.content).toContain("a test world");
  });

  it("posts to the API root it is given, and nowhere else", async () => {
    const { fetchImpl, calls } = stubFetch([JSON.stringify(validDoc())]);
    await authorLoamDoc({ ...BASE, baseUrl: "http://localhost:11434/v1/", model: "local/whatever", fetchImpl });
    expect(calls[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
    expect((calls[0]?.body as { model: string }).model).toBe("local/whatever");
    // Nothing provider-specific rides along: the body is the OpenAI shape.
    expect(Object.keys(calls[0]?.body ?? {}).sort()).toEqual(["messages", "model", "reasoning_effort", "temperature"]);
  });

  it("pins the caller's seed and size over whatever the model wrote", async () => {
    const { fetchImpl } = stubFetch([JSON.stringify(validDoc({ seed: 999 }))]);

    const result = await authorLoamDoc({ ...BASE, worldSeed: 4242, size: 512, fetchImpl });
    expect(result.loam["seed"]).toBe(4242);
    expect(result.loam["size"]).toEqual([512, 512]);
    expect(result.doc.meta.worldSeed).toBe(4242);
    expect(result.doc.root.envelope.size).toEqual([512, 512]);
  });

  it("retries with the diagnostics rendered verbatim, then succeeds", async () => {
    const { fetchImpl, calls } = stubFetch([
      JSON.stringify(invalidDoc()),
      JSON.stringify(validDoc())
    ]);
    const result = await authorLoamDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(2);
    expect(result.diagnosticsPerAttempt[0]?.length).toBeGreaterThan(0);
    expect(result.diagnosticsPerAttempt[1]).toEqual([]);
    // Both attempts' tokens are counted.
    expect(result.usage.totalTokens).toBe(300);

    const second = calls[1]?.body as { messages: { role: string; content: string }[] };
    expect(second.messages).toHaveLength(4);
    expect(second.messages[2]?.role).toBe("assistant");
    const retry = second.messages[3]?.content ?? "";
    expect(retry).toContain("LOAM-T008");
    expect(retry).toContain("UNKNOWN_KEY");
    expect(retry).toContain("fix:");
    // The previous document goes back with the diagnostics.
    expect(retry).toContain('"profile":"settlement"');
  });

  it("gives up after the attempt budget and reports every attempt", async () => {
    const { fetchImpl, calls } = stubFetch([JSON.stringify(invalidDoc())]);

    await expect(authorLoamDoc({ ...BASE, fetchImpl })).rejects.toBeInstanceOf(
      AuthoringFailedError,
    );
    expect(calls).toHaveLength(3);

    try {
      await authorLoamDoc({ ...BASE, fetchImpl });
      expect.unreachable();
    } catch (err) {
      const failure = err as AuthoringFailedError;
      expect(failure.attempts).toBe(3);
      expect(failure.diagnosticsPerAttempt).toHaveLength(3);
      expect(failure.diagnosticsPerAttempt[0]?.length).toBeGreaterThan(0);
      expect(failure.usage.totalTokens).toBe(450);
      expect(failure.message).toContain("LOAM-T008");
    }
  });

  it("strips markdown fences and leading prose", async () => {
    const fenced = `Here is the world you asked for:\n\n\`\`\`json\n${JSON.stringify(validDoc())}\n\`\`\`\n\nHope that helps!`;
    const { fetchImpl } = stubFetch([fenced]);
    const result = await authorLoamDoc({ ...BASE, fetchImpl });
    expect(result.attempts).toBe(1);
    expect(result.loam["name"]).toBe("test_world");
  });

  it("treats an unparseable reply as a diagnostic and retries", async () => {
    const { fetchImpl, calls } = stubFetch(["I'd rather not.", JSON.stringify(validDoc())]);
    const result = await authorLoamDoc({ ...BASE, fetchImpl });

    expect(result.attempts).toBe(2);
    expect(result.diagnosticsPerAttempt[0]?.[0]?.code).toBe("LOAM-T000");
    const retry = (calls[1]?.body as { messages: { content: string }[] }).messages[3]?.content ?? "";
    expect(retry).toContain("no JSON object");
  });

  it("surfaces a non-2xx response as an error", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response("rate limited", { status: 429, statusText: "Too Many Requests" });
    await expect(authorLoamDoc({ ...BASE, fetchImpl })).rejects.toThrow(/429/);
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
    const result = extractJson("prose {a: 1} more");
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

describe("the API settings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("read TERRAINIST_* from the environment, with the OpenRouter key name as a fallback", () => {
    vi.stubEnv("TERRAINIST_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "legacy-key");
    vi.stubEnv("TERRAINIST_API_BASE", "http://localhost:8080/v1/");
    vi.stubEnv("TERRAINIST_MODEL", "acme/model-1");
    expect(loadApiKey()).toBe("legacy-key");
    expect(apiBaseUrl()).toBe("http://localhost:8080/v1");
    expect(defaultModel()).toBe("acme/model-1");
    vi.stubEnv("TERRAINIST_API_KEY", "new-key");
    expect(loadApiKey()).toBe("new-key");
  });
});

describe("sumUsage", () => {
  it("adds token counts and costs", () => {
    expect(
      sumUsage([
        { promptTokens: 1, completionTokens: 2, totalTokens: 3, cost: 0.5 },
        { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
      ]),
    ).toEqual({ promptTokens: 11, completionTokens: 22, totalTokens: 33, cost: 0.5 });
  });

  it("omits cost when nothing reported one", () => {
    expect(sumUsage([{ promptTokens: 1, completionTokens: 1, totalTokens: 2 }]).cost).toBeUndefined();
  });
});
