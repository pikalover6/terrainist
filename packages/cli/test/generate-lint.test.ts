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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const compileTerrain = vi.fn();

vi.mock("@terrainist/compiler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@terrainist/compiler")>();
  return { ...actual, compileTerrain };
});

const { runGenerate } = await import("../src/index.js");

/** A document the validator accepts; what the compiler does with it is stubbed. */
const DOC = {
  loam: "0.1",
  profile: "settlement",
  meta: { name: "lint_world", worldSeed: 7, prompt: "a stub world" },
  root: {
    id: "world",
    kind: "composite",
    envelope: { shape: "region", size: [128, 128] },
    children: [
      {
        id: "terrain",
        kind: "generator",
        generator: "terrain.heightfield@0",
        params: { amplitude: 18 },
      },
      { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
      {
        id: "woods",
        kind: "generator",
        generator: "scatter.forest@0",
        params: {
          area: { all: true },
          density: 0.02,
          species: [{ id: "oak", shape: "oak_round" }],
        },
      },
    ],
  },
};

let outDir: string;
let bodies: Record<string, unknown>[];

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "terrainist-lint-"));
  bodies = [];
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        model: "z-ai/glm-5.2",
        choices: [{ message: { content: JSON.stringify(DOC) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
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
    compileTerrain.mockResolvedValue({
      ok: false,
      diagnostics: [
        {
          code: "LOAM-T110",
          name: "UNSTABLE_FLUID",
          severity: "error",
          nodePath: "",
          message: "3 fluid blocks would flow on the first tick",
          fix: "raise the surrounding terrain or lower the fluid",
        },
      ],
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
      "--keep-doc",
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
    expect(text).toContain("LOAM-T110");
    expect(text).toContain("lint_world.loam.json");
  }, 60_000);

  it("aborts on LOAM-T111 even when the compile otherwise succeeded", async () => {
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
            code: "LOAM-T111",
            name: "FLOATING_VEGETATION",
            severity: "error",
            nodePath: "world.woods",
            message: "a tree has no ground under it",
            fix: "none — this is a compiler invariant",
          },
        ],
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await runGenerate([
      "a stub world",
      "--size", "128",
      "--seed", "7",
      "--out", outDir,
      "--no-zip",
    ]);
    spy.mockRestore();

    expect(code).toBe(1);
    expect(bodies).toHaveLength(1);
  }, 60_000);
});
