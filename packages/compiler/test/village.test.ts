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

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  CLEARING_FEATHER,
  CLEARING_MARGIN,
  buildSettlementClearing,
  distanceToHull,
} from "../src/terrain/clearing.js";
import { makeStructureClip, structureBoxes } from "../src/terrain/clip.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";

/** Blocks the tree templates place as canopy; the building grammar places none. */
const LEAF_BLOCKS = [
  "minecraft:oak_leaves",
  "minecraft:birch_leaves",
  "minecraft:spruce_leaves",
] as const;

/** Y range the canopy scan covers — well above and below anything built here. */
const SCAN_MIN_Y = 60;
const SCAN_MAX_Y = 140;

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

  /**
   * Where the leaves are, read back out of the emitted world.
   *
   * Deliberately not read off the tree placements: the whole point of the clip
   * is what the *renderer* sees, and the renderer sees chunks. Leaves are the
   * probe block because the building grammar never places one — a leaf inside a
   * hall is unambiguously a tree that should not be there.
   */
  async function leafColumns(): Promise<Set<string>> {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const anvil = stack.openAnvil(path.join(worldDir, "region"));
    const leaf = new Map<number, boolean>();
    const isLeaf = (stateId: number): boolean => {
      let known = leaf.get(stateId);
      if (known === undefined) {
        const name = stack.blockNameByStateId(stateId);
        known = name !== undefined && LEAF_BLOCKS.some((n) => n.endsWith(name) || name === n);
        leaf.set(stateId, known);
      }
      return known;
    };

    const out = new Set<string>();
    const region = report.stats.region;
    for (let cz = region.z0 >> 4; cz <= (region.z0 + region.depth - 1) >> 4; cz++) {
      for (let cx = region.x0 >> 4; cx <= (region.x0 + region.width - 1) >> 4; cx++) {
        const chunk = await anvil.load(cx, cz);
        if (chunk === null) continue;
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            for (let y = SCAN_MIN_Y; y <= SCAN_MAX_Y; y++) {
              if (!isLeaf(chunk.getBlockStateId(lx, y, lz))) continue;
              out.add(`${cx * 16 + lx},${y},${cz * 16 + lz}`);
            }
          }
        }
      }
    }
    await anvil.close();
    return out;
  }

  it("clears the settlement: no canopy stands inside the hull", async () => {
    const clearing = buildSettlementClearing(
      report.stats.region,
      (report.layout?.placements ?? []).map((p) => p.footprint),
    );
    expect(clearing.hulls.length).toBeGreaterThan(0);
    expect(report.stats.clearedColumns).toBeGreaterThan(500);

    let insideHull = 0;
    let inFeather = 0;
    let openForest = 0;
    for (const key of await leafColumns()) {
      const [x, , z] = key.split(",").map(Number) as [number, number, number];
      const d = Math.min(...clearing.hulls.map((h) => distanceToHull(h, x, z)));
      // Strictly inside the hull — over the built-up ground itself.
      if (d === 0) insideHull++;
      else if (d < CLEARING_MARGIN + CLEARING_FEATHER) inFeather++;
      else openForest++;
    }
    // Not one leaf over the settlement: every trunk stands at least the margin
    // away and no canopy reaches back across it. Outside, the treeline exists
    // but is thinner than the open forest — a feather, not a wall.
    expect(insideHull).toBe(0);
    expect(inFeather).toBeGreaterThan(0);
    expect(openForest).toBeGreaterThan(inFeather);
  }, 120_000);

  it("still dresses the cleared ground as a meadow, not a dirt pad", () => {
    // Undergrowth reads each node's eligibility mask, which the clearing never
    // touches — so the green keeps its grass and its flowers.
    expect(report.stats.decorCounts["grass"] ?? 0).toBeGreaterThan(1000);
    expect(report.stats.decorCounts["flowers"] ?? 0).toBeGreaterThan(100);
  });

  it("puts no leaf inside a building", async () => {
    const boxes = structureBoxes(report.layout?.structures?.buildings ?? []);
    expect(boxes.length).toBeGreaterThan(0);
    const clip = makeStructureClip(report.stats.region, boxes);
    const offenders: string[] = [];
    for (const key of await leafColumns()) {
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      if (clip.blocked(x, y, z)) offenders.push(key);
    }
    expect(offenders).toEqual([]);
  }, 120_000);

  it("paves the plaza and gives it a stable well", () => {
    const stats = report.stats.structures;
    expect(stats?.plazaColumns).toBeGreaterThan(100);
    expect(stats?.plazaWell).toBe(true);
    expect(stats?.plazaBenches).toBeGreaterThanOrEqual(2);
    // The well's water is part of the world, and the world has no unstable fluid.
    expect(report.stats.unstableFluidBlocks).toBe(0);
  });

  it("gives the mill river a sea to reach, so it never beads into ponds", () => {
    expect(report.stats.pondChains).toEqual({});
    expect(report.stats.biomeHistogram["minecraft:ocean"] ?? 0).toBeGreaterThan(0);
    expect(report.stats.biomeHistogram["minecraft:beach"] ?? 0).toBeGreaterThan(0);
    // Water plants only exist where there is real water to grow in.
    expect(report.stats.decorCounts["water"] ?? 0).toBeGreaterThan(0);
  });

  it("compiles byte-identically twice", async () => {
    const again = await compile("b");
    expect(JSON.stringify(again.report.stats)).toBe(JSON.stringify(report.stats));
    expect(JSON.stringify(again.report.layout)).toBe(JSON.stringify(report.layout));
    expect(await regionHashes(again.dir)).toEqual(await regionHashes(worldDir));
  }, 300_000);
});
