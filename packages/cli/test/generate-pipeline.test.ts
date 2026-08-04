/**
 * `terrainist generate` end to end, with the model stubbed out.
 *
 * The stub replies with documents we wrote; the compiler, the feedback
 * selection and the revision loop are all real. Nothing here touches the
 * network: `globalThis.fetch` is replaced for the duration of each test, and
 * the key is a fake one in the environment.
 *
 * The worlds are 128×128 so a compile is a fifth of a second.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runGenerate } from "../src/index.js";

/** A small settlement document that compiles clean. */
function cleanDoc(name = "stub_hamlet"): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name, worldSeed: 7, prompt: "a stub hamlet" },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { baseHeight: 76, amplitude: 18, frequency: 0.004, erosionPasses: 2 },
          children: [
            {
              id: "shelf",
              kind: "generator",
              generator: "terrain.edit@0",
              params: { verb: "plateau", at: [0.5, 0.5], radius: 44, height: 6 },
            },
          ],
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "green",
          kind: "primitive",
          envelope: { shape: "region", size: [16, 16] },
          constraints: [{ zone: "center" }, { terrain_conform: "flatten", reference: "median", blend: 4 }],
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
  };
}

/**
 * The same document with a basin whose rim cannot close — `LOAM-T105`.
 *
 * Found by compiling: a deep basin pushed against the eastern edge of the
 * region has nothing to hold its water in.
 */
function basinDoc(): Record<string, unknown> {
  const doc = cleanDoc("stub_hamlet");
  const root = doc["root"] as { children: { id: string; children?: unknown[] }[] };
  const terrain = root.children[0] as { children: unknown[] };
  terrain.children.push({
    id: "the_mere",
    kind: "generator",
    generator: "terrain.edit@0",
    params: { verb: "basin", at: [0.95, 0.5], radius: 50, depth: 40, water: true },
  });
  return doc;
}

/** Replies, in order, from the stubbed model. */
function stubModel(texts: readonly string[]): { bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  let i = 0;
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const text = texts[Math.min(i, texts.length - 1)];
    i++;
    return new Response(
      JSON.stringify({
        model: "z-ai/glm-5.2",
        choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.002 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  return { bodies };
}

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "terrainist-gen-"));
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(outDir, { recursive: true, force: true });
});

describe("runGenerate — settlement happy path", () => {
  it("authors, compiles and keeps the world with no feedback round", async () => {
    const { bodies } = stubModel([JSON.stringify(cleanDoc())]);

    const code = await runGenerate([
      "a stub hamlet",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      // The intent pre-pass is a second model call; these tests count calls,
      // so they opt out of it and `intent-prepass.test.ts` covers it instead.
      "--no-intent",
      "--no-programs",
      "--no-zip",
      "--keep-doc",
    ]);

    expect(code).toBe(0);
    expect(bodies).toHaveLength(1);
    // The settlement kit is the default system prompt.
    const messages = (bodies[0] as { messages: { content: string }[] }).messages;
    expect(messages[0]?.content).toContain("Settlement author kit");

    const doc = JSON.parse(await readFile(path.join(outDir, "stub_hamlet.loam.json"), "utf8")) as {
      profile: string;
    };
    expect(doc.profile).toBe("settlement");
    await expect(
      readFile(path.join(outDir, "stub_hamlet", "level.dat")),
    ).resolves.toBeDefined();
  }, 60_000);

  it("honours --kit terrain", async () => {
    const doc = cleanDoc("stub_land");
    doc["profile"] = "terrain";
    const root = doc["root"] as { children: { id: string }[] };
    root.children = root.children.filter((c) => !["green", "cottage", "lanes"].includes(c.id));
    const { bodies } = stubModel([JSON.stringify(doc)]);

    const code = await runGenerate([
      "a stub land",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      "--kit", "terrain",
      // The intent pre-pass is a second model call; these tests count calls,
      // so they opt out of it and `intent-prepass.test.ts` covers it instead.
      "--no-intent",
      "--no-programs",
      "--no-zip",
    ]);

    expect(code).toBe(0);
    const messages = (bodies[0] as { messages: { content: string }[] }).messages;
    expect(messages[0]?.content).toContain("Terrain author kit");
  }, 60_000);
});

describe("runGenerate — compile feedback", () => {
  it("feeds a LOAM-T105 back and compiles the revision", async () => {
    const { bodies } = stubModel([JSON.stringify(basinDoc()), JSON.stringify(cleanDoc())]);

    const code = await runGenerate([
      "a stub hamlet",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      // The intent pre-pass is a second model call; these tests count calls,
      // so they opt out of it and `intent-prepass.test.ts` covers it instead.
      "--no-intent",
      "--no-programs",
      "--no-zip",
      "--keep-doc",
    ]);

    expect(code).toBe(0);
    expect(bodies).toHaveLength(2);

    const revision = (bodies[1] as { messages: { role: string; content: string }[] }).messages;
    const turn = revision[revision.length - 1]?.content ?? "";
    expect(turn).toContain("LOAM-T105");
    expect(turn).toContain("BASIN_RIM_NOT_CLOSED");
    expect(turn).toContain("fix:");
    expect(turn).toContain("Revise the document");
    // The document that produced the report goes back with it.
    expect(revision[revision.length - 2]?.role).toBe("assistant");
    expect(revision[revision.length - 2]?.content).toContain("the_mere");

    // The world on disk is the revision's, not the first attempt's.
    const doc = JSON.parse(await readFile(path.join(outDir, "stub_hamlet.loam.json"), "utf8")) as {
      root: { children: { id: string; children?: { id: string }[] }[] };
    };
    const edits = doc.root.children[0]?.children ?? [];
    expect(edits.map((e) => e.id)).not.toContain("the_mere");
  }, 120_000);

  it("stops after the round budget and keeps the last world", async () => {
    const { bodies } = stubModel([JSON.stringify(basinDoc())]);

    const code = await runGenerate([
      "a stub hamlet",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      "--compile-rounds", "1",
      // The intent pre-pass is a second model call; these tests count calls,
      // so they opt out of it and `intent-prepass.test.ts` covers it instead.
      "--no-intent",
      "--no-programs",
      "--no-zip",
    ]);

    // One authoring call plus one revision call, then the world is kept even
    // though the basin warning is still there.
    expect(code).toBe(0);
    expect(bodies).toHaveLength(2);
  }, 120_000);

  it("--compile-rounds 0 skips the loop entirely", async () => {
    const { bodies } = stubModel([JSON.stringify(basinDoc())]);

    const code = await runGenerate([
      "a stub hamlet",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      "--compile-rounds", "0",
      // The intent pre-pass is a second model call; these tests count calls,
      // so they opt out of it and `intent-prepass.test.ts` covers it instead.
      "--no-intent",
      "--no-programs",
      "--no-zip",
    ]);

    expect(code).toBe(0);
    expect(bodies).toHaveLength(1);
  }, 60_000);
});
