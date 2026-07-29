/**
 * The cave pass, end to end on `examples/caverns-test.loam.json`.
 *
 * The fixture is small on purpose (192², one hill, one tarn, one cave node with
 * two mouths), because these are *whole-world* assertions: the world is
 * compiled, read back off disk, and checked against the plan it came from.
 *
 * The two invariants that would be expensive to lose are checked twice over —
 * once against the column plan, which is exact, and once against the region
 * files, which is what a player actually loads:
 *
 * - no carved air within four blocks of water or lava, and none at or below sea
 *   level near the ocean;
 * - no column's top solid block moved, except at a declared entrance mouth.
 */

import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { checkCaveIntegrity } from "../src/terrain/caves.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";

const EXAMPLE = fileURLToPath(new URL("../../../examples/caverns-test.loam.json", import.meta.url));

const scratch: string[] = [];
let stack: PrismarineStack;
let report: TerrainCompileReport;
let plan: ColumnPlan;
let worldDir: string;
let lint: PhysicsReport;

async function compile(label: string): Promise<{ dir: string; report: TerrainCompileReport; plan: ColumnPlan }> {
  const root = await mkdtemp(path.join(tmpdir(), `terrainist-caves-${label}-`));
  scratch.push(root);
  const dir = path.join(root, "caverns_test");
  const doc = JSON.parse(await readFile(EXAMPLE, "utf8")) as unknown;
  let captured: ColumnPlan | undefined;
  const result = await compileTerrain(doc, { outDir: dir, onColumnPlan: (p) => (captured = p) });
  if (!result.ok) {
    throw new Error(`caverns compile failed: ${result.diagnostics.map((d) => d.name).join(", ")}`);
  }
  if (captured === undefined) throw new Error("compileTerrain did not hand over a column plan");
  return { dir, report: result.report, plan: captured };
}

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const compiled = await compile("main");
  worldDir = compiled.dir;
  report = compiled.report;
  plan = compiled.plan;
  lint = await lintWorldPhysics(worldDir, stack, {
    // The cave band runs from y 20, and the hilltop reaches the 130s.
    minY: 0,
    maxY: 160,
    terrainTop: {
      x0: plan.region.x0,
      z0: plan.region.z0,
      width: plan.region.width,
      depth: plan.region.depth,
      ground: plan.ground,
      entrances: plan.caves?.entranceColumns ?? new Uint8Array(plan.ground.length),
    },
  });
}, 180_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("caverns fixture", () => {
  it("compiles clean, with no diagnostics and no unstable fluid", () => {
    expect(report.diagnostics.map((d) => `${d.severity} ${d.name}`)).toEqual([]);
    expect(report.stats.unstableFluidBlocks).toBe(0);
  });

  it("carves a real cave system", () => {
    expect(report.stats.caves.systems).toBeGreaterThan(0);
    expect(report.stats.caves.carvedBlocks).toBeGreaterThan(2000);
  });

  it("opens the two entrances the document asked for, each with a marker", () => {
    expect(report.stats.caves.entrances).toBe(2);
    const mouths = report.markers.filter((m) => m.name === "cave_mouth");
    expect(mouths).toHaveLength(2);
    for (const mouth of mouths) {
      expect(mouth.id).toBe("world.caves.cave_mouth");
      expect(mouth.y).toBeGreaterThan(report.stats.seaLevel);
    }
  });

  it("dresses the caves with attached dripstone and a little life", () => {
    const counts = report.stats.caves.decorCounts;
    expect(report.stats.caves.decorBlocks).toBeGreaterThan(0);
    expect(counts["stalagmite"] as number).toBeGreaterThan(0);
    expect(counts["stalactite"] as number).toBeGreaterThan(0);
    expect(counts["floor"] as number).toBeGreaterThan(0);
  });

  it("keeps the plan's cave invariants: no fluid breach, no surface breach", () => {
    // Re-derived from the finished spans rather than carried over from the
    // carver, so the band and the spans have to agree independently.
    const integrity = checkCaveIntegrity(plan);
    expect(integrity.samples).toEqual([]);
    expect(integrity.fluidBreaches).toBe(0);
    expect(integrity.surfaceBreaches).toBe(0);
  });

  it("compiles byte-identically twice", async () => {
    const again = await compile("repeat");
    expect(again.report.stats.caves).toEqual(report.stats.caves);
    expect([...again.plan.caves!.spans.lo]).toEqual([...plan.caves!.spans.lo]);
    expect([...again.plan.caves!.spans.hi]).toEqual([...plan.caves!.spans.hi]);
    expect([...again.plan.caves!.spans.offsets]).toEqual([...plan.caves!.spans.offsets]);
    expect(again.report.markers).toEqual(report.markers);
  }, 120_000);
});

describe("caverns physics readback", () => {
  it("finds no unattached pointed dripstone", () => {
    expect(sample("dripstone.unattached")).toEqual([]);
    expect(lint.counts["dripstone.unattached"]).toBe(0);
  });

  it("finds no carved air near water or lava", () => {
    expect(sample("cave.fluid_shell")).toEqual([]);
    expect(lint.counts["cave.fluid_shell"]).toBe(0);
  });

  it("leaves the top surface exactly where the column plan put it", () => {
    expect(sample("cave.surface_breach")).toEqual([]);
    expect(lint.counts["cave.surface_breach"]).toBe(0);
  });

  it("passes every other physics rule too", () => {
    const offenders = Object.entries(lint.counts).filter(([, n]) => n > 0);
    expect(offenders).toEqual([]);
  });

  /** The first few findings of a rule, as readable strings. */
  function sample(rule: string): string[] {
    return lint.findings
      .filter((f) => f.rule === rule)
      .slice(0, 4)
      .map((f) => `${f.block} at ${f.x},${f.y},${f.z}: ${f.detail}`);
  }
});
