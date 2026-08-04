/**
 * Authored programs, through the *pipeline* rather than through the pass.
 *
 * `programs.test.ts` hands `buildPrograms` hand-built jobs, which is exactly
 * the shape of the defect this file exists to prevent: the pass was complete,
 * unit-tested and never called, so a document with a `programs` map compiled to
 * a world with no program in it and said nothing. Everything below therefore
 * starts from a **document**.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveWorldSeed } from "@terrainist/stdlib";
import type { AuthoredProgramRecord } from "@terrainist/spec";

import { compileTerrain, generatorCoverageNotes } from "../src/terrain/compile.js";
import type { TerrainCompileReport } from "../src/terrain/compile.js";
import { gateDoubleRun, sourceHashOf } from "../src/programs/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch: string[] = [];

const WORLD_SEED = 90210;

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

/** A program map entry with the hashes this host actually produces. */
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
    outputHash: "b3:0000000000000000",
  };
  const gate = gateDoubleRun(id, draft, resolveWorldSeed(WORLD_SEED));
  expect(gate.ok).toBe(true);
  return { ...draft, outputHash: gate.outputHash };
}

function document(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "saucer_field", worldSeed: WORLD_SEED },
    programs: {
      tower: record("tower", "tower.js", [17, 34, 17], "landmark"),
      saucer: record("saucer", "saucer.js", [21, 13, 21], "plugin"),
    },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 12, seaLevel: 63, baseHeight: 78, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "beacon",
          kind: "generator",
          generator: "authored:tower",
          constraints: [{ zone: "center" }],
          tags: ["landmark"],
        },
        {
          id: "saucers",
          kind: "generator",
          generator: "scatter.program@0",
          params: { program: "saucer", count: 3, spacing: 14, area: { all: true } },
        },
      ],
    },
  };
}

async function compile(label: string): Promise<TerrainCompileReport> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  const result = await compileTerrain(document(), { outDir: path.join(dir, "saucer_field") });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return result.report;
}

let first: TerrainCompileReport;
let second: TerrainCompileReport;

beforeAll(async () => {
  first = await compile("programs-a");
  second = await compile("programs-b");
}, 300_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("authored programs in the compile pipeline", () => {
  it("names both nodes in the report, with the instances each stood up", () => {
    const rows = first.stats.programs ?? [];
    expect(rows.map((r) => r.nodePath)).toEqual(["world.beacon", "world.saucers"]);
    const beacon = rows.find((r) => r.nodePath === "world.beacon");
    const saucers = rows.find((r) => r.nodePath === "world.saucers");
    expect(beacon).toMatchObject({ programId: "tower", mode: "landmark", instances: 1 });
    expect(beacon?.blockCount).toBeGreaterThan(500);
    expect(saucers?.programId).toBe("saucer");
    expect(saucers?.mode).toBe("plugin");
    expect(saucers?.instances).toBeGreaterThan(0);
    expect(saucers?.blockCount).toBeGreaterThan(0);
    expect(first.timings.programs).toBeGreaterThanOrEqual(0);
  });

  it("puts the program's blocks in the emitted world", () => {
    const rows = first.stats.programs ?? [];
    const programBlocks = rows.reduce((sum, r) => sum + r.blockCount, 0);
    expect(programBlocks).toBeGreaterThan(500);
    expect(first.emit.structureBlockCount).toBeGreaterThanOrEqual(programBlocks);
  });

  it("publishes the landmark's anchors as §7.3 markers", () => {
    const ids = first.markers.map((m) => m.id);
    expect(ids).toContain("world.beacon#door");
    expect(first.markers.some((m) => m.id.startsWith("world.saucers#"))).toBe(true);
  });

  it("seats the landmark on the site the solver reserved", () => {
    const placement = (first.layout?.placements ?? []).find((p) => p.nodePath === "world.beacon");
    expect(placement).toBeDefined();
    expect(placement?.size).toEqual([17, 34, 17]);
    const marker = first.markers.find((m) => m.id === "world.beacon#door");
    expect(marker?.x).toBeGreaterThanOrEqual(placement?.footprint.x0 as number);
    expect(marker?.x).toBeLessThanOrEqual(placement?.footprint.x1 as number);
  });

  it("reports no program error and drops nothing silently", () => {
    const problems = first.diagnostics.filter((d) => d.severity === "error");
    expect(problems).toEqual([]);
    expect(first.diagnostics.some((d) => d.code === "LOAM-W337")).toBe(false);
  });

  it("compiles the same document and seed to the same program output", () => {
    expect(second.stats.programs).toEqual(first.stats.programs);
    const program = (r: TerrainCompileReport): unknown =>
      r.markers.filter((m) => m.id.includes("#")).map((m) => [m.id, m.x, m.y, m.z]);
    expect(program(second)).toEqual(program(first));
    expect(second.emit.structureBlockCount).toBe(first.emit.structureBlockCount);
  });
});

/**
 * The same two spellings in the **terrain** profile, which has no layout
 * solver: the validator admits them there ("a monument on pure terrain is the
 * contract's own first example"), so the pass must run there too.
 */
function terrainDocument(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "saucer_moor", worldSeed: WORLD_SEED },
    programs: {
      tower: record("tower", "tower.js", [17, 34, 17], "landmark"),
      saucer: record("saucer", "saucer.js", [21, 13, 21], "plugin"),
    },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 12, seaLevel: 63, baseHeight: 78, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        { id: "beacon", kind: "generator", generator: "authored:tower" },
        {
          id: "saucers",
          kind: "generator",
          generator: "scatter.program@0",
          params: { program: "saucer", count: 3, spacing: 14, area: { all: true } },
        },
      ],
    },
  };
}

async function compileTerrainProfile(label: string): Promise<TerrainCompileReport> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  const result = await compileTerrain(terrainDocument(), { outDir: path.join(dir, "saucer_moor") });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return result.report;
}

describe("authored programs in a terrain-profile document", () => {
  let plain: TerrainCompileReport;
  let again: TerrainCompileReport;

  beforeAll(async () => {
    plain = await compileTerrainProfile("programs-terrain-a");
    again = await compileTerrainProfile("programs-terrain-b");
  }, 300_000);

  it("runs both spellings with no layout solver in sight", () => {
    expect(plain.layout).toBeUndefined();
    const rows = plain.stats.programs ?? [];
    expect(rows.map((r) => r.nodePath)).toEqual(["world.beacon", "world.saucers"]);
    const beacon = rows.find((r) => r.nodePath === "world.beacon");
    expect(beacon).toMatchObject({ programId: "tower", mode: "landmark", instances: 1 });
    expect(beacon?.blockCount).toBeGreaterThan(500);
    const saucers = rows.find((r) => r.nodePath === "world.saucers");
    expect(saucers).toMatchObject({ programId: "saucer", mode: "plugin" });
    expect(saucers?.instances).toBeGreaterThan(0);
    expect(saucers?.blockCount).toBeGreaterThan(0);
  });

  it("puts the terrain-profile program's blocks in the emitted world", () => {
    const rows = plain.stats.programs ?? [];
    const programBlocks = rows.reduce((sum, r) => sum + r.blockCount, 0);
    expect(programBlocks).toBeGreaterThan(500);
    expect(plain.emit.structureBlockCount).toBeGreaterThanOrEqual(programBlocks);
  });

  it("publishes the terrain landmark's anchors as markers, near the region centre", () => {
    const door = plain.markers.find((m) => m.id === "world.beacon#door");
    expect(door).toBeDefined();
    // The landmark's site is the centred footprint of a 128×128 region.
    expect(Math.abs(door?.x as number)).toBeLessThanOrEqual(20);
    expect(Math.abs(door?.z as number)).toBeLessThanOrEqual(20);
    expect(plain.markers.some((m) => m.id.startsWith("world.saucers#"))).toBe(true);
  });

  it("drops nothing silently and reports no error", () => {
    expect(plain.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(plain.diagnostics.some((d) => d.code === "LOAM-W337")).toBe(false);
  });

  it("compiles the same terrain document and seed to the same program output", () => {
    expect(again.stats.programs).toEqual(plain.stats.programs);
    const program = (r: TerrainCompileReport): unknown =>
      r.markers.filter((m) => m.id.includes("#")).map((m) => [m.id, m.x, m.y, m.z]);
    expect(program(again)).toEqual(program(plain));
    expect(again.emit.structureBlockCount).toBe(plain.emit.structureBlockCount);
  });
});

describe("the silent-drop class", () => {
  it("notes a generator no pass implements", () => {
    const notes = generatorCoverageNotes(
      [
        { kind: "generator", id: "terrain", generator: "terrain.heightfield@0" },
        { kind: "generator", id: "beacon", generator: "authored:tower" },
        { kind: "generator", id: "saucers", generator: "scatter.program@0" },
        { kind: "generator", id: "mystery", generator: "weather.storm@0" },
        { kind: "primitive", id: "plaza" },
      ],
      "world",
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.code).toBe("LOAM-T208");
    expect(notes[0]?.nodePath).toBe("world.mystery");
    expect(notes[0]?.severity).toBe("note");
  });
});
