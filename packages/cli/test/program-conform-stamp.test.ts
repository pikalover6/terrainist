/**
 * The conformance stamp, end to end and without a byte of API spend.
 *
 * Wave 9A taught the gate to judge whether a program follows the ground and
 * wave 9B taught the seat to read that judgement off the record — but nothing
 * copied one to the other, so every freshly authored document carried no
 * verdict and every program was seated `pad`. This file walks the whole seam:
 * the real compiler-backed gate produces the verdict, the authoring freeze
 * stamps it onto the record, and a document carrying that record compiles to a
 * `conform` seat.
 *
 * The model is stubbed — the "author" replies with a committed fixture — but
 * the gate is the real one, so the verdict is earned rather than asserted.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { attachPrograms, authorProgram, type ProgramRequest } from "@terrainist/agents";
import { compileTerrain, compilerProgramGate } from "@terrainist/compiler";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURES = path.join(REPO_ROOT, "packages/compiler/test/fixtures/programs");
const ENVELOPE: readonly [number, number, number] = [16, 24, 16];

const scratch: string[] = [];
afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

const DOC_CONTEXT = { worldSeed: 7, size: 96, prompt: "a shed on a hill" } as const;

const REQUEST: ProgramRequest = {
  id: "shed",
  mode: "landmark",
  brief: "a shed that follows the ground",
  envelope: ENVELOPE
};

/** A stub `fetch` that replies with the given program source, fenced. */
function stubFetch(source: string): (input: string, init?: RequestInit) => Promise<Response> {
  return async (): Promise<Response> =>
    new Response(
      JSON.stringify({
        model: "stub",
        choices: [{ message: { content: ["```js", source, "```"].join("\n") }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

async function freeze(file: string) {
  const source = await readFile(path.join(FIXTURES, file), "utf8");
  const outcome = await authorProgram({
    request: REQUEST,
    docContext: DOC_CONTEXT,
    gate: compilerProgramGate(),
    apiKey: "test",
    fetchImpl: stubFetch(source)
  });
  return outcome;
}

function document(program: Record<string, unknown>): Record<string, unknown> {
  return attachPrograms(
    {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "conform_stamp", worldSeed: 7 },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [96, 96] },
        children: [
          {
            id: "terrain",
            kind: "generator",
            generator: "terrain.heightfield@0",
            params: { amplitude: 10, seaLevel: 63, baseHeight: 74}
          },
          {
            id: "climate",
            kind: "generator",
            generator: "terrain.climate@0",
            params: { forceTheme: "temperate" }
          },
          {
            id: "shed",
            kind: "generator",
            generator: "authored:shed",
            constraints: [{ zone: "center" }]
          }
        ]
      }
    } as Record<string, unknown>,
    { shed: program } as never,
  );
}

describe("the live gate's verdict reaches the document", () => {
  it("stamps conforms: true and a b3 digest onto a ground-reading program", async () => {
    const outcome = await freeze("conforming-shed.js");
    expect(outcome.record.ok).toBe(true);
    const entry = outcome.entry;
    expect(entry).toBeDefined();
    expect(entry?.conforms).toBe(true);
    expect(entry?.conformHash).toMatch(/^b3:[0-9a-f]{16,}$/);
    expect(entry?.outputHash).toMatch(/^b3:/);

    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-conform-stamp-"));
    scratch.push(dir);
    const result = await compileTerrain(document(entry as unknown as Record<string, unknown>), {
      outDir: path.join(dir, "world")
    });
    const diagnostics = result.ok ? result.report.diagnostics : result.diagnostics;
    const codes = diagnostics.map((d) => `${d.code} ${d.name}@${d.nodePath}: ${d.message}`);
    if (!result.ok) throw new Error(codes.join("\n"));
    // Seated conform: T342 reports the residual, and nothing was dropped.
    expect(diagnostics.filter((d) => d.code === "LOAM-T342").length).toBeGreaterThan(0);
    expect(diagnostics.filter((d) => d.name === "PROGRAM_DROPPED")).toEqual([]);
  }, 600_000);

  it("stamps conforms: false — judged, kept, and seated pad", async () => {
    const outcome = await freeze("rigid-prefab.js");
    expect(outcome.record.ok).toBe(true);
    expect(outcome.entry?.conforms).toBe(false);
    expect(outcome.entry?.conformHash).toMatch(/^b3:[0-9a-f]{16,}$/);
  }, 600_000);
});
