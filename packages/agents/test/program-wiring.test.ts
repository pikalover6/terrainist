/**
 * The invocation gap: programs that were written, verified and frozen into the
 * document, and then never named by a single node.
 *
 * Everything here runs against a stub `fetch` — no network, no key, no spend —
 * and the shape being defended is the one the committed `invasion-p1` fixture
 * actually shipped with.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectProgramInvocations,
  findOrphanPrograms,
  programWiringFeedback,
  reviseForProgramWiring,
} from "../src/program-wiring.js";
import type { AuthoredProgramEntry } from "../src/program-author.js";
import type { FetchLike } from "../src/openrouter.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function entry(mode: AuthoredProgramEntry["mode"]): AuthoredProgramEntry {
  return {
    mode,
    envelope: [16, 16, 16],
    sourceHash: "b3:0123456789abcdef",
    outputHash: "b3:fedcba9876543210",
    source:
      "export const envelope = [16, 16, 16];\n" +
      "export default function build(api) {\n  api.set(0, 0, 0, \"minecraft:stone\");\n  return { name: \"t\", seatY: 0 };\n}\n",
  };
}

/** A minimal, valid terrain-profile document — what a revision must return. */
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
      ],
    },
    ...overrides,
  };
}

/** A revision response that really does invoke the orphans it was asked to. */
function wiredDoc(
  overrides: Record<string, unknown> = {},
  which: readonly ("mothership" | "ufo")[] = ["mothership", "ufo"],
): Record<string, unknown> {
  const doc = validDoc(overrides);
  const root = doc["root"] as { children: unknown[] };
  const add: unknown[] = [];
  if (which.includes("mothership")) {
    add.push({ id: "mothership", kind: "generator", generator: "authored:mothership" });
  }
  if (which.includes("ufo")) {
    add.push({
      id: "drone_fleet",
      kind: "generator",
      generator: "scatter.program@0",
      params: { program: "ufo", count: 6, area: { zone: "north" }, spacing: 24 },
    });
  }
  root.children = [...root.children, ...add];
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
        model: "openai/gpt-5.6-luna",
        choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.002 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { fetchImpl, calls };
}

const REVISE_BASE = {
  messages: [
    { role: "system" as const, content: "KIT" },
    { role: "user" as const, content: "author a world" },
  ],
  worldSeed: 4242,
  size: 256,
  kitName: "terrain" as const,
  apiKey: "test-key",
};

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

describe("collectProgramInvocations", () => {
  it("finds authored:<id> generators and scatter.program@0 params.program", () => {
    const found = collectProgramInvocations({
      root: {
        children: [
          { id: "a", kind: "generator", generator: "authored:mothership" },
          {
            id: "b",
            kind: "generator",
            generator: "scatter.program@0",
            params: { program: "ufo", count: 12 },
          },
          { id: "c", kind: "generator", generator: "prop.place@0", params: { prop: "cart" } },
        ],
      },
    });
    expect([...found.landmark]).toEqual(["mothership"]);
    expect([...found.plugin]).toEqual(["ufo"]);
  });

  it("ignores a scatter.program@0 whose params name nothing usable", () => {
    const found = collectProgramInvocations({
      root: { children: [{ generator: "scatter.program@0", params: { programId: "ufo" } }] },
    });
    // `programId` is not the param name; `program` is.
    expect(found.plugin.size).toBe(0);
  });
});

describe("findOrphanPrograms", () => {
  it("reports a landmark program no node invokes", () => {
    const orphans = findOrphanPrograms(
      { root: { children: [{ generator: "prop.place@0", params: {} }] } },
      { mothership: entry("landmark") },
    );
    expect(orphans.map((o) => o.id)).toEqual(["mothership"]);
    expect(orphans[0]?.mode).toBe("landmark");
  });

  it("reports a plugin program no scatter.program@0 names", () => {
    const orphans = findOrphanPrograms(
      { root: { children: [{ generator: "authored:mothership" }] } },
      { mothership: entry("landmark"), ufo: entry("plugin") },
    );
    expect(orphans.map((o) => o.id)).toEqual(["ufo"]);
  });

  it("reports nothing when both modes are wired", () => {
    const orphans = findOrphanPrograms(
      {
        root: {
          children: [
            { generator: "authored:mothership" },
            { generator: "scatter.program@0", params: { program: "ufo" } },
          ],
        },
      },
      { mothership: entry("landmark"), ufo: entry("plugin") },
    );
    expect(orphans).toEqual([]);
  });

  it("accepts either invocation form for a both-mode program", () => {
    const map = { hybrid: entry("both") };
    expect(findOrphanPrograms({ a: { generator: "authored:hybrid" } }, map)).toEqual([]);
    expect(
      findOrphanPrograms({ a: { generator: "scatter.program@0", params: { program: "hybrid" } } }, map),
    ).toEqual([]);
    expect(findOrphanPrograms({ a: { generator: "prop.place@0" } }, map)).toHaveLength(1);
  });

  it("costs nothing on a document with no programs at all", () => {
    expect(findOrphanPrograms(validDoc(), {})).toEqual([]);
  });

  it("carries the brief across from intent.character.programs", () => {
    const orphans = findOrphanPrograms(
      {
        intent: { character: { programs: [{ id: "ufo", mode: "plugin", brief: "a saucer" }] } },
        root: { children: [] },
      },
      { ufo: entry("plugin") },
    );
    expect(orphans[0]?.brief).toBe("a saucer");
  });

  it("sees the invasion-p1 fixture for exactly what it is", async () => {
    const doc = JSON.parse(
      await readFile(path.join(FIXTURES, "invasion-p1.loam.json"), "utf8"),
    ) as { programs: Record<string, AuthoredProgramEntry> };
    const orphans = findOrphanPrograms(doc, doc.programs);
    expect(orphans.map((o) => `${o.id}:${o.mode}`).sort()).toEqual([
      "mothership:landmark",
      "ufo:plugin",
    ]);
    // And the reason it shipped silently: placeholders under other generators.
    const invoked = collectProgramInvocations(doc);
    expect(invoked.landmark.size).toBe(0);
    expect(invoked.plugin.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The feedback text                                                           */
/* -------------------------------------------------------------------------- */

describe("programWiringFeedback", () => {
  it("names each program and teaches both invocation syntaxes", () => {
    const text = programWiringFeedback([
      { id: "mothership", mode: "landmark", envelope: [90, 35, 90], brief: "a broken hull" },
      { id: "ufo", mode: "plugin", envelope: [9, 8, 9] },
    ]);
    expect(text).toContain('"mothership" — mode landmark, envelope [90, 35, 90]');
    expect(text).toContain("brief: a broken hull");
    expect(text).toContain('"ufo" — mode plugin');
    expect(text).toContain('"authored:');
    expect(text).toContain("scatter.program@0");
    expect(text).toContain('"program":');
    expect(text).toContain("REPLACE");
  });
});

/* -------------------------------------------------------------------------- */
/* The revision round                                                          */
/* -------------------------------------------------------------------------- */

describe("reviseForProgramWiring", () => {
  it("spends nothing when every program is already invoked", async () => {
    const doc = validDoc({ programs: {} });
    const { fetchImpl, calls } = stubFetch([JSON.stringify(validDoc())]);
    const wiring = await reviseForProgramWiring({
      ...REVISE_BASE,
      doc,
      programs: {},
      fetchImpl,
    });
    expect(calls).toHaveLength(0);
    expect(wiring.orphans).toEqual([]);
    expect(wiring.revised).toBe(false);
    expect(wiring.usage.totalTokens).toBe(0);
    expect(wiring.doc).toBe(doc);
  });

  it("makes exactly one revision call for all orphans at once", async () => {
    const programs = { mothership: entry("landmark"), ufo: entry("plugin") };
    const { fetchImpl, calls } = stubFetch([JSON.stringify(wiredDoc())]);
    const wiring = await reviseForProgramWiring({
      ...REVISE_BASE,
      doc: validDoc({ programs }),
      programs,
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(wiring.orphans).toHaveLength(2);
    expect(wiring.revised).toBe(true);
    const messages = (calls[0]?.body as { messages: { role: string; content: string }[] }).messages;
    const last = messages[messages.length - 1]?.content ?? "";
    expect(last).toContain("mothership");
    expect(last).toContain("ufo");
    expect(last).toContain("scatter.program@0");
  });

  it("re-attaches the frozen programs map to whatever the revision returned", async () => {
    const programs = { mothership: entry("landmark") };
    // The model's reply drops the map, as a model rewriting a tree tends to.
    const { fetchImpl } = stubFetch([JSON.stringify(validDoc())]);
    const wiring = await reviseForProgramWiring({
      ...REVISE_BASE,
      doc: validDoc({ programs }),
      programs,
      fetchImpl,
    });
    expect((wiring.doc as { programs: Record<string, unknown> }).programs).toHaveProperty(
      "mothership",
    );
  });

  it("reports the round's usage so the run's accounting stays whole", async () => {
    const programs = { mothership: entry("landmark") };
    const { fetchImpl } = stubFetch([JSON.stringify(wiredDoc({}, ["mothership"]))]);
    const wiring = await reviseForProgramWiring({
      ...REVISE_BASE,
      doc: validDoc({ programs }),
      programs,
      fetchImpl,
    });
    expect(wiring.usage.totalTokens).toBe(150);
    expect(wiring.usage.cost).toBeCloseTo(0.002);
    expect(wiring.result?.attempts).toBe(1);
  });

  it("retries once with the validator's diagnostics", async () => {
    const programs = { mothership: entry("landmark") };
    const { fetchImpl, calls } = stubFetch(["not a document at all", JSON.stringify(wiredDoc({}, ["mothership"]))]);
    const wiring = await reviseForProgramWiring({
      ...REVISE_BASE,
      doc: validDoc({ programs }),
      programs,
      fetchImpl,
    });
    expect(calls).toHaveLength(2);
    expect(wiring.revised).toBe(true);
    expect(wiring.usage.totalTokens).toBe(300);
  });

  it("keeps the document and warns when the revision never validates", async () => {
    const programs = { mothership: entry("landmark"), ufo: entry("plugin") };
    const doc = validDoc({ programs });
    const { fetchImpl, calls } = stubFetch(["still not a document"]);
    const wiring = await reviseForProgramWiring({
      ...REVISE_BASE,
      doc,
      programs,
      fetchImpl,
    });
    expect(calls).toHaveLength(2);
    expect(wiring.revised).toBe(false);
    expect(wiring.doc).toBe(doc);
    expect(wiring.result).toBeUndefined();
    expect(wiring.usage.totalTokens).toBe(300);
    expect(wiring.warning).toContain('"mothership" [landmark]');
    expect(wiring.warning).toContain('"ufo" [plugin]');
  });
});
