/**
 * A program the placer cannot seat anywhere.
 *
 * Under the gate-leniency ruling (Kai, 2026-08-15; LOAM-SPEC §15.2) that is
 * the `PROGRAM_DROPPED` pattern, not a failure: the world is missing one
 * feature, it says so, and it still ships. It used to be `E336
 * PROGRAM_GATE_FAILED` — an error the compile then went on to ignore, so the
 * world emitted anyway and the exit status lied about it.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { AuthoredProgramRecord } from "@terrainist/spec";

import { sourceHashOf } from "../src/programs/hash.js";
import { verifyProgram } from "../src/programs/verify.js";
import { compileTerrain } from "../src/terrain/compile.js";

const scratch: string[] = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

const SOURCE = [
  "export const envelope = [6, 6, 6];",
  "export default function build(api) {",
  "  for (let y = 0; y < 4; y++) api.set(2, y, 2, 'minecraft:stone_bricks');",
  "  return { name: 'cairn', seatY: 0 };",
  "}",
].join("\n");

async function record(): Promise<AuthoredProgramRecord> {
  const base: AuthoredProgramRecord = {
    mode: "plugin",
    envelope: [6, 6, 6],
    source: SOURCE,
    sourceHash: sourceHashOf(SOURCE),
    outputHash: "",
  };
  const verified = await verifyProgram("cairn", base, { worldSeed: 5n, skipPhysics: true });
  return { ...base, outputHash: verified.outputHash };
}

function document(program: AuthoredProgramRecord): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "no_site", worldSeed: 5 },
    programs: { cairn: program },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [64, 64] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 4, seaLevel: 63, baseHeight: 72, erosionPasses: 0 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "cairns",
          kind: "generator",
          generator: "scatter.program@0",
          // No ground in this world is 1,000 blocks up, so nothing can be seated.
          params: { program: "cairn", count: 3, spacing: 8, area: { all: true }, elevation: [1000, 1010] },
        },
      ],
    },
  };
}

describe("a program no site would take", () => {
  it("warns PROGRAM_DROPPED and the world still emits", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-no-site-"));
    scratch.push(dir);
    const result = await compileTerrain(document(await record()), { outDir: path.join(dir, "world") });
    if (!result.ok) {
      throw new Error(result.diagnostics.map((d) => `${d.name}@${d.nodePath}: ${d.message}`).join("\n"));
    }
    const dropped = result.report.diagnostics.filter(
      (d) => d.name === "PROGRAM_DROPPED" && d.message.includes("no site would take"),
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.severity).toBe("warning");
    expect(dropped[0]?.code).toBe("LOAM-W337");
    expect(dropped[0]?.nodePath).toBe("world.cairns");
    // And nothing anywhere calls it an error.
    expect(result.report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  }, 120_000);
});
