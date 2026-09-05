/**
 * Bespoke facing, through the whole compile.
 *
 * `program-facing.test.ts` checks the pieces; this one starts from a
 * **document**, because the two things worth proving are properties of the
 * pipeline rather than of any one function: a scattered invader really does end
 * up looking at the town it was told to invade, and a document whose programs
 * declare no front compiles to exactly the world it compiled to before any of
 * this existed.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { resolveWorldSeed } from "@terrainist/stdlib";
import type { AuthoredProgramRecord } from "@terrainist/spec/ir";

import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { gateDoubleRun, sourceHashOf } from "../src/programs/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch: string[] = [];

const WORLD_SEED = 4471;

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

function record(
  id: string,
  file: string,
  envelope: readonly [number, number, number],
  mode: AuthoredProgramRecord["mode"],
): AuthoredProgramRecord {
  const source = fixture(file);
  const draft: AuthoredProgramRecord = {
    mode,
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000"
  };
  const gate = gateDoubleRun(id, draft, resolveWorldSeed(WORLD_SEED));
  expect(gate.ok).toBe(true);
  return { ...draft, outputHash: gate.outputHash };
}

/**
 * A town in the east and something coming at it from the west.
 *
 * `face` is written on the scatter alone; the beacon is there to be faced.
 */
function document(face: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "the_landing", worldSeed: WORLD_SEED },
    programs: {
      sentinel: record("sentinel", "sentinel.js", [11, 12, 21], "both"),
      tower: record("tower", "tower.js", [17, 34, 17], "landmark")
    },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [192, 192] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 8, seaLevel: 63, baseHeight: 78}
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" }
        },
        {
          id: "beacon",
          kind: "generator",
          generator: "authored:tower",
          constraints: [{ zone: "east" }],
          tags: ["landmark"]
        },
        {
          id: "invaders",
          kind: "generator",
          generator: "scatter.program@0",
          params: {
            program: "sentinel",
            count: 4,
            spacing: 12,
            area: { zone: "west" },
            ...(face === undefined ? {} : { face })
          }
        }
      ]
    }
  };
}

/** The same document with a frontless program in the scatter's place. */
function frontless(face: Record<string, unknown> | undefined): Record<string, unknown> {
  const doc = document(undefined) as {
    programs: Record<string, unknown>;
    root: { children: Record<string, unknown>[] };
  };
  doc.programs["sentinel"] = record("saucer", "saucer.js", [21, 13, 21], "plugin");
  const scatter = doc.root.children[3] as { params: Record<string, unknown> };
  scatter.params = {
    ...scatter.params,
    ...(face === undefined ? {} : { face })
  };
  return doc as unknown as Record<string, unknown>;
}

async function compile(label: string, doc: Record<string, unknown>): Promise<TerrainCompileReport> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  const result = await compileTerrain(doc, { outDir: path.join(dir, "the_landing") });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return result.report;
}

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("a scattered program told which way to look", () => {
  it("turns every instance toward the landmark it was aimed at, and away for the other sense", async () => {
    const toward = await compile("toward", document({ toward: "beacon" }));
    const away = await compile("away", document({ away_from: "beacon" }));
    expect(toward.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(away.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

    const row = (r: TerrainCompileReport) =>
      (r.stats.programs ?? []).find((s) => s.nodePath === "world.invaders");
    expect(row(toward)?.instances).toBeGreaterThan(0);
    // The same instances on the same sites: a quarter turn either way makes the
    // same 21 × 11 box, so nothing about the placement moved — only the facing.
    expect(row(away)?.instances).toBe(row(toward)?.instances);
    expect(row(away)?.blockCount).toBe(row(toward)?.blockCount);

    const fronts = (r: TerrainCompileReport) =>
      new Map(r.markers.filter((m) => m.id.includes("#front")).map((m) => [m.id, m] as const));
    const facing = fronts(toward);
    const fleeing = fronts(away);
    expect(facing.size).toBe(row(toward)?.instances);
    expect([...fleeing.keys()].sort()).toEqual([...facing.keys()].sort());
    // The town is east of the landing, so `toward` is a quarter turn clockwise
    // and `away_from` is three: the declared front — local (5, ·, 0) in an
    // 11 × 21 envelope — lands against the eastern face of the footprint in the
    // first and against the western face in the second, the full 20 blocks
    // apart, on the same line.
    for (const [id, front] of facing) {
      const back = fleeing.get(id) as { x: number; z: number };
      expect(front.x - back.x).toBe(20);
      expect(front.z - back.z).toBe(0);
    }
  }, 600_000);
});

describe("the reach law", () => {
  it("compiles a frontless program identically, `face` or no `face`", async () => {
    // A document may say anything it likes about facing; a program that never
    // declared a front is never turned, and the world is the one it always was.
    const plain = await compile("plain", frontless(undefined));
    const asked = await compile("asked", frontless({ toward: "beacon" }));
    expect(asked.emit.structureBlockCount).toBe(plain.emit.structureBlockCount);
    expect(asked.stats.programs).toEqual(plain.stats.programs);
    expect(asked.markers.map((m) => [m.id, m.x, m.y, m.z])).toEqual(
      plain.markers.map((m) => [m.id, m.x, m.y, m.z]),
    );
    expect(asked.diagnostics.map((d) => d.code)).toEqual(plain.diagnostics.map((d) => d.code));
  }, 300_000);
});
