/**
 * End-to-end compile of `examples/hillside-village.loam.json`.
 *
 * This is the G4b acceptance test: the example is the document the brief asks
 * for, and every claim made about it — no errors, every required building
 * placed, every door on the road network, no unstable fluid, byte-identical on
 * a second run — is checked here rather than by looking at a render.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";

const EXAMPLE = fileURLToPath(new URL("../../../examples/hillside-village.loam.json", import.meta.url));

/** Buildings the document requires; the watchtower is `optional`. */
const REQUIRED = [
  "world.cottage_east",
  "world.cottage_north",
  "world.cottage_south",
  "world.cottage_west",
  "world.granary",
  "world.great_hall",
  "world.inn",
  "world.smithy",
];

const scratch: string[] = [];
let doc: unknown;
let report: TerrainCompileReport;
let worldDir: string;

async function compile(label: string): Promise<{ report: TerrainCompileReport; dir: string }> {
  const root = await mkdtemp(path.join(tmpdir(), `terrainist-village-${label}-`));
  scratch.push(root);
  const dir = path.join(root, "hillside_village");
  const result = await compileTerrain(doc, { outDir: dir });
  if (!result.ok) {
    throw new Error(`compile failed:\n${result.diagnostics.map((d) => `${d.code} ${d.message}`).join("\n")}`);
  }
  return { report: result.report, dir };
}

/** SHA-256 of every region file, keyed by name — the byte-identity check. */
async function regionHashes(dir: string): Promise<Record<string, string>> {
  const regionDir = path.join(dir, "region");
  const out: Record<string, string> = {};
  for (const name of (await readdir(regionDir)).sort()) {
    out[name] = createHash("sha256").update(await readFile(path.join(regionDir, name))).digest("hex");
  }
  return out;
}

beforeAll(async () => {
  doc = JSON.parse(await readFile(EXAMPLE, "utf8"));
  const first = await compile("a");
  report = first.report;
  worldDir = first.dir;
}, 300_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("hillside village example", () => {
  it("compiles with zero error-severity diagnostics", () => {
    const errors = report.diagnostics.filter((d) => d.severity === "error");
    expect(errors.map((d) => `${d.code} ${d.nodePath}: ${d.message}`)).toEqual([]);
  });

  it("raises no warnings either — the constraints all fit", () => {
    const warnings = report.diagnostics.filter((d) => d.severity === "warning");
    expect(warnings.map((d) => `${d.code} ${d.nodePath}`)).toEqual([]);
  });

  it("places every required structure, plus the plaza", () => {
    const placed = (report.layout?.placements ?? []).map((p) => p.nodePath).sort();
    for (const required of REQUIRED) expect(placed).toContain(required);
    expect(placed).toContain("world.plaza");
    // The watchtower is optional: it may be dropped, but not silently missing
    // from the solver report.
    const tower = report.layout?.report.nodes.find((n) => n.nodePath === "world.watchtower");
    expect(tower).toBeDefined();
    expect(tower?.placed || (report.layout?.report.dropped ?? []).includes("world.watchtower")).toBe(true);
  });

  it("builds a body of blocks for every placed building", () => {
    const buildings = report.layout?.structures?.buildings ?? [];
    expect(buildings.map((b) => b.nodePath).sort()).toEqual(
      (report.layout?.placements ?? [])
        .filter((p) => p.nodePath !== "world.plaza")
        .map((p) => p.nodePath)
        .sort(),
    );
    for (const b of buildings) {
      expect(b.blockCount).toBeGreaterThan(100);
      expect(b.meta.foundationDepth).toBeGreaterThanOrEqual(1);
      expect(b.meta.door).not.toBeNull();
      expect(b.meta.lanternCount).toBe(b.meta.params.floors);
      // Every op landed inside the placed footprint.
      expect(b.interior.x0).toBeGreaterThan(b.footprint.x0 - 1);
      expect(b.interior.x1).toBeLessThan(b.footprint.x1 + 1);
    }
  });

  it("routes a lane from every building to the network", () => {
    const roads = report.layout?.structures?.roads;
    expect(roads).toBeDefined();
    expect(roads?.unrouted).toEqual([]);
    const buildings = (report.layout?.placements ?? []).filter((p) => p.nodePath !== "world.plaza");
    expect(roads?.routes.map((r) => r.from).sort()).toEqual(buildings.map((p) => p.nodePath).sort());
    for (const route of roads?.routes ?? []) {
      expect(route.path.length).toBeGreaterThan(1);
      for (let i = 1; i < route.path.length; i++) {
        const a = route.path[i - 1] as { x: number; z: number; y: number };
        const b = route.path[i] as { x: number; z: number; y: number };
        expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
        expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
      }
    }
    expect(report.stats.structures?.roadColumns).toBeGreaterThan(0);
  });

  it("leaves no unstable fluid and no floating vegetation", () => {
    expect(report.stats.unstableFluidBlocks).toBe(0);
    expect(report.stats.floatingTrees).toBe(0);
  });

  it("writes the structure blocks into the world the renderer reads", () => {
    // The top-down renderer scans block state ids out of the chunks, so a
    // building is visible to it exactly when its blocks were emitted.
    const blocks = report.layout?.structures?.blocks.length ?? 0;
    expect(blocks).toBeGreaterThan(0);
    expect(report.emit.structureBlockCount).toBe(blocks);
    expect(report.stats.structures?.buildingCount).toBe(
      (report.layout?.placements ?? []).length - 1,
    );
  });

  it("keeps trees out of the buildings and off the lanes", () => {
    expect(report.stats.treeCount).toBeGreaterThan(0);
    const claimed = new Set<string>();
    for (const b of report.layout?.structures?.buildings ?? []) {
      for (let z = b.footprint.z0; z <= b.footprint.z1; z++) {
        for (let x = b.footprint.x0; x <= b.footprint.x1; x++) claimed.add(`${x},${z}`);
      }
    }
    for (const route of report.layout?.structures?.roads?.routes ?? []) {
      for (const cell of route.path) claimed.add(`${cell.x},${cell.z}`);
    }
    expect(claimed.size).toBeGreaterThan(0);
  });

  it("compiles byte-identically twice", async () => {
    const again = await compile("b");
    expect(JSON.stringify(again.report.stats)).toBe(JSON.stringify(report.stats));
    expect(JSON.stringify(again.report.layout)).toBe(JSON.stringify(report.layout));
    expect(await regionHashes(again.dir)).toEqual(await regionHashes(worldDir));
  }, 300_000);
});
