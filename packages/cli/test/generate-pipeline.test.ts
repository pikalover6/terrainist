/**
 * `terrainist generate` end to end, with the model stubbed out.
 *
 * The stub replies with Loam 1 documents we wrote; the intent pre-pass, the
 * compiler, the feedback selection and the revision loop are all real.
 * Nothing here touches the network: `globalThis.fetch` is replaced for the
 * duration of each test, and the key is a fake one in the environment.
 *
 * The worlds are 128×128 so a compile is a fraction of a second.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INTENT_CLASSIFIER_PROMPT } from "@terrainist/agents";

import { runGenerate } from "../src/index.js";
import { dateStamp } from "../src/world-name.js";

/** A small Loam 1 hamlet that compiles clean. */
function cleanDoc(name = "stub_hamlet"): Record<string, unknown> {
  return {
    loam: "1",
    name,
    seed: 7,
    prompt: "a stub hamlet",
    size: [128, 128],
    terrain: { base: 76, relief: 18, scale: 250 },
    land: [{ id: "shelf", verb: "plateau", at: [0.5, 0.5], radius: 44, height: 6 }],
    things: [
      { id: "green", is: "plaza", size: [16, 16], where: [{ zone: "center" }] },
      {
        id: "cottage",
        is: "cottage",
        size: [9, 8, 8],
        floors: 1,
        roof: "gable",
        where: [{ near: "green", gap: [1, 8] }, { facing: "green" }],
        ground: "cut_fill",
        door: "north",
        tags: ["house"],
      },
    ],
    roads: { pattern: "organic", width: 3, reach: ["green", "#tag:house"] },
    woods: [{ id: "woods", density: 0.02, species: [{ id: "oak", shape: "oak_round" }] }],
  };
}

/**
 * The same document with a basin whose rim cannot close — `LOAM-T105`.
 *
 * Found by compiling: a deep basin pushed against the eastern edge of the
 * region has nothing to hold its water in.
 */
function basinDoc(): Record<string, unknown> {
  const doc = cleanDoc();
  (doc["land"] as unknown[]).push({ id: "the_mere", verb: "basin", at: [0.95, 0.5], radius: 50, depth: 40, water: true });
  return doc;
}

/**
 * Replies, in order, from the stubbed model. The intent classifier's own call
 * is answered with an empty intent and not counted, so `bodies` is exactly
 * the authoring conversation.
 */
function stubModel(texts: readonly string[]): { bodies: Record<string, unknown>[]; classified: () => number } {
  const bodies: Record<string, unknown>[] = [];
  let i = 0;
  let classifierCalls = 0;
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    let text: string;
    if (body.messages[0]?.content === INTENT_CLASSIFIER_PROMPT) {
      classifierCalls++;
      text = "{}";
    } else {
      bodies.push(body);
      text = texts[Math.min(i, texts.length - 1)] as string;
      i++;
    }
    return new Response(
      JSON.stringify({
        model: "google/gemini-3.8-flash",
        choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.002 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  return { bodies, classified: () => classifierCalls };
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

describe("runGenerate — the happy path", () => {
  it("classifies, authors, compiles and keeps the world and its Loam 1 document", async () => {
    const { bodies, classified } = stubModel([JSON.stringify(cleanDoc())]);

    const code = await runGenerate(["a stub hamlet", "--size", "128", "--seed", "7", "--out", outDir, "--no-zip"]);

    expect(code).toBe(0);
    expect(classified()).toBe(1);
    expect(bodies).toHaveLength(1);
    // The kit is the system prompt, and it speaks Loam 1.
    const messages = (bodies[0] as { messages: { content: string }[] }).messages;
    expect(messages[0]?.content).toContain('`"1"`');
    expect(messages[1]?.content).toContain("a stub hamlet");

    const doc = JSON.parse(await readFile(path.join(outDir, "stub_hamlet.loam.json"), "utf8")) as Record<string, unknown>;
    expect(doc["loam"]).toBe("1");
    expect(doc["seed"]).toBe("7");
    expect(doc["size"]).toEqual([128, 128]);
    // No debugging sidecars unless asked for.
    await expect(readFile(path.join(outDir, "stub_hamlet.report.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(outDir, "stub_hamlet.ir.json"))).rejects.toMatchObject({ code: "ENOENT" });
    // The world folder carries the compile's date stamp.
    const worldDir = path.join(outDir, `stub_hamlet_${dateStamp(new Date())}`);
    await expect(readFile(path.join(worldDir, "level.dat"))).resolves.toBeDefined();
  }, 60_000);

  it("--keep-doc also keeps the lowered document and the compile report", async () => {
    stubModel([JSON.stringify(cleanDoc("lean_hamlet"))]);

    const code = await runGenerate(["a lean stub hamlet", "--size", "128", "--seed", "7", "--out", outDir, "--no-zip", "--keep-doc"]);

    expect(code).toBe(0);
    const ir = JSON.parse(await readFile(path.join(outDir, "lean_hamlet.ir.json"), "utf8")) as { loam: string; root: unknown };
    expect(ir.loam).toBe("0.1");
    expect(ir.root).toBeDefined();
    const report = JSON.parse(await readFile(path.join(outDir, "lean_hamlet.report.json"), "utf8")) as { name: string; timings: unknown };
    expect(report.name).toBe("lean_hamlet");
    expect(report.timings).toBeDefined();
  }, 60_000);

  it("keeps the rejected reply beside the document when the first attempt failed validation", async () => {
    const { bodies } = stubModel([JSON.stringify({ ...cleanDoc(), profile: "settlement" }), JSON.stringify(cleanDoc())]);

    const code = await runGenerate(["a stub hamlet", "--size", "128", "--seed", "7", "--out", outDir, "--no-zip"]);

    expect(code).toBe(0);
    expect(bodies).toHaveLength(2);
    const record = JSON.parse(await readFile(path.join(outDir, "stub_hamlet.authoring.json"), "utf8")) as {
      outcome: string;
      attempts: { attempt: number; diagnostics: { code: string }[]; reply: string }[];
    };
    expect(record.outcome).toBe("valid");
    expect(record.attempts).toHaveLength(2);
    expect(record.attempts[0]?.diagnostics[0]?.code).toBe("LOAM-T008");
    expect(record.attempts[0]?.reply).toContain('"profile"');
    expect(record.attempts[1]?.diagnostics).toEqual([]);
  }, 60_000);

  it("reports a document that never validated, keeps every reply, and exits 1", async () => {
    const { bodies } = stubModel([JSON.stringify({ ...cleanDoc(), profile: "settlement" })]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await runGenerate(["a stub hamlet", "--size", "128", "--seed", "7", "--out", outDir, "--no-zip"]);
    spy.mockRestore();

    expect(code).toBe(1);
    expect(bodies).toHaveLength(3);
    const record = JSON.parse(await readFile(path.join(outDir, "failed-7.authoring.json"), "utf8")) as { outcome: string; attempts: unknown[] };
    expect(record.outcome).toBe("failed");
    expect(record.attempts).toHaveLength(3);
  }, 60_000);
});

describe("runGenerate — compile feedback", () => {
  it("is off by default: one call, the findings are printed, the world is kept", async () => {
    const { bodies } = stubModel([JSON.stringify(basinDoc())]);

    const code = await runGenerate(["a stub hamlet", "--size", "128", "--seed", "7", "--out", outDir, "--no-zip"]);

    expect(code).toBe(0);
    expect(bodies).toHaveLength(1);
  }, 60_000);

  it("--compile-rounds 1 feeds a LOAM-T105 back and compiles the revision", async () => {
    const { bodies } = stubModel([JSON.stringify(basinDoc()), JSON.stringify(cleanDoc())]);

    const code = await runGenerate(["a stub hamlet", "--size", "128", "--seed", "7", "--out", outDir, "--no-zip", "--compile-rounds", "1"]);

    expect(code).toBe(0);
    expect(bodies).toHaveLength(2);

    const revision = (bodies[1] as { messages: { role: string; content: string }[] }).messages;
    const turn = revision[revision.length - 1]?.content ?? "";
    expect(turn).toContain("LOAM-T105");
    expect(turn).toContain("BASIN_RIM_NOT_CLOSED");
    expect(turn).toContain("fix:");
    expect(turn).toContain("Revise the document");
    // The document that produced the report goes back with it, as the model wrote it.
    expect(revision[revision.length - 2]?.role).toBe("assistant");
    expect(revision[revision.length - 2]?.content).toContain("the_mere");

    // The document on disk is the revision's, not the first attempt's.
    const doc = JSON.parse(await readFile(path.join(outDir, "stub_hamlet.loam.json"), "utf8")) as { land: { id: string }[] };
    expect(doc.land.map((e) => e.id)).not.toContain("the_mere");
  }, 120_000);

  it("stops after the round budget and keeps the last world", async () => {
    const { bodies } = stubModel([JSON.stringify(basinDoc())]);

    const code = await runGenerate(["a stub hamlet", "--size", "128", "--seed", "7", "--out", outDir, "--no-zip", "--compile-rounds", "1"]);

    // One authoring call plus one revision call, then the world is kept even
    // though the basin warning is still there.
    expect(code).toBe(0);
    expect(bodies).toHaveLength(2);
  }, 120_000);
});
