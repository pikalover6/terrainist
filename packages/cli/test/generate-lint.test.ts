/**
 * A physics-lint failure aborts the run instead of re-prompting.
 *
 * `LOAM-T110` (fluid that would flow) and `LOAM-T111` (a tree standing on
 * nothing) mean the compiler emitted a world that breaks its own invariants.
 * No rewording of a legal document can fix that, so `generate` must stop, say
 * whose bug it is, and keep the document for the report — not spend another
 * completion asking the model to try again.
 *
 * The compiler is stubbed here because a legal document that provokes the lint
 * is, by construction, a bug we do not have on hand.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isPhysicsLint, TERRAIN_DIAGNOSTICS } from "@terrainist/spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INTENT_CLASSIFIER_PROMPT } from "@terrainist/agents";

const compileTerrain = vi.fn();

vi.mock("@terrainist/compiler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@terrainist/compiler")>();
  return { ...actual, compileTerrain };
});

const { runGenerate } = await import("../src/index.js");

/** A document the validator accepts; what the compiler does with it is stubbed. */
const DOC = {
  loam: "1",
  name: "lint_world",
  seed: 7,
  prompt: "a stub world",
  size: [128, 128],
  woods: [{ id: "woods", density: 0.02, species: [{ id: "oak", shape: "oak_round" }] }],
};

let outDir: string;
let bodies: Record<string, unknown>[];

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "terrainist-lint-"));
  bodies = [];
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    // The intent classifier's call is answered with an empty intent and not
    // counted; `bodies` is the authoring conversation alone.
    const classifier = body.messages[0]?.content === INTENT_CLASSIFIER_PROMPT;
    if (!classifier) bodies.push(body);
    return new Response(
      JSON.stringify({
        model: "google/gemini-3.8-flash",
        choices: [{ message: { content: classifier ? "{}" : JSON.stringify(DOC) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  compileTerrain.mockReset();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(outDir, { recursive: true, force: true });
});

describe("runGenerate — physics lint", () => {
  it("aborts loudly on LOAM-T110 and never asks for a revision", async () => {
    const expectedCode = TERRAIN_DIAGNOSTICS.UNSTABLE_FLUID;
    // Canonical: spec marks this as physics lint
    expect(isPhysicsLint(expectedCode)).toBe(true);
    compileTerrain.mockResolvedValue({
      ok: false,
      diagnostics: [
        {
          code: expectedCode,
          name: "UNSTABLE_FLUID",
          severity: "error",
          nodePath: "",
          message: "3 fluid blocks would flow on the first tick",
          fix: "raise the surrounding terrain or lower the fluid"
        }
      ]
    });
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    const code = await runGenerate([
      "a stub world",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      "--no-zip",
      "--keep-doc"
    ]);
    spy.mockRestore();

    expect(code).toBe(1);
    // One authoring call and no revision call: the loop never asks the model
    // to fix a compiler bug.
    expect(bodies).toHaveLength(1);
    expect(compileTerrain).toHaveBeenCalledTimes(1);
    const text = errors.join("\n");
    expect(text).toContain("PHYSICS LINT FAILED");
    expect(text).toContain("compiler bug");
    expect(text).toContain(expectedCode);
    expect(text).toContain("lint_world.loam.json");
  }, 60_000);

  it("aborts on LOAM-T111 even when the compile otherwise succeeded", async () => {
    const expectedCode = TERRAIN_DIAGNOSTICS.FLOATING_VEGETATION;
    expect(isPhysicsLint(expectedCode)).toBe(true);
    compileTerrain.mockResolvedValue({
      ok: true,
      report: {
        name: "lint_world",
        worldSeed: "7",
        markers: [],
        stats: {},
        timings: {},
        emit: { worldDir: path.join(outDir, "lint_world") },
        diagnostics: [
          {
            code: expectedCode,
            name: "FLOATING_VEGETATION",
            severity: "error",
            nodePath: "world.woods",
            message: "a tree has no ground under it",
            fix: "none — this is a compiler invariant"
          }
        ]
      }
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await runGenerate([
      "a stub world",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      "--no-zip"
    ]);
    spy.mockRestore();

    expect(code).toBe(1);
    expect(bodies).toHaveLength(1);
  }, 60_000);
});
