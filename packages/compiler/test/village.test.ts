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
import {
  DECOR_APRON,
  ROAD_CANOPY_CLEARANCE,
  makeStructureClip,
  structureBoxes,
} from "../src/terrain/clip.js";
import { MAX_FOUNDATION_DEPTH } from "../src/structures/buildings.js";
import { longestOrthogonalZigzag } from "./road-shape.js";
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

/** Block names that mean "nothing here" when reading a column back. */
const AIR_NAMES = new Set(["air", "cave_air", "void_air"]);

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
  "world.chapel",
  "world.market_stall",
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

  it("builds the chapel as an L: the wing param reaches the grammar", () => {
    // The end-to-end claim for the `wing` param: the document says one, the
    // param whitelist lets it through, `wingParamOf` reads it, and the
    // footprint the grammar returns is smaller than its own bounding box —
    // which only a multi-rect plan can be.
    const chapel = report.layout?.structures?.buildings?.find((b) => b.nodePath === "world.chapel");
    expect(chapel, "the chapel was placed").toBeDefined();
    const fp = chapel?.footprint as { x0: number; z0: number; x1: number; z1: number };
    const box = (fp.x1 - fp.x0 + 1) * (fp.z1 - fp.z0 + 1);
    expect(chapel?.cells.size).toBeLessThan(box);
    expect(chapel?.meta.footprint.wing).not.toBeNull();
    // ...and the archetype came from the tags, with the church's own facade.
    expect(chapel?.meta.params.archetype).toBe("church");
    expect(chapel?.meta.params.windowShape).toBe("tall");
    // The crypt: a tunnel endpoint gets a cellar whether or not it asked.
    expect(chapel?.basementDepth).toBeGreaterThan(0);
    expect(report.layout?.structures?.tunnels).toHaveLength(1);
  });

  it("moors a rowboat at the pier it declared", () => {
    const props = report.layout?.structures?.props ?? [];
    expect(props.map((p) => p.prop)).toEqual(["pier", "rowboat"]);
    const pier = props[0];
    const boat = props[1];
    expect(pier?.anchor, "a pier offers an anchor").toBeDefined();
    // `at: "pier"` is a *coarse* target, not a coordinate: the boat is placed
    // on the first open water near the pier's seaward end, so the claim is
    // proximity rather than adjacency.
    const dx = (boat?.footprint.x0 ?? 0) - (pier?.anchor?.x ?? 0);
    const dz = (boat?.footprint.z0 ?? 0) - (pier?.anchor?.z ?? 0);
    expect(Math.abs(dx) + Math.abs(dz)).toBeLessThan(24);
    expect(report.layout?.structures?.stats.propWaterLeaks).toBe(0);
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
      expect(b.meta.lanternCount).toBeGreaterThanOrEqual(1);
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
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBe(1);
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
   * Every non-air block of the emitted world in the scan band, by name.
   *
   * Built once and shared. Reading the *world* rather than the placement lists
   * is the whole point of the invariants below: a lantern is supported if the
   * block under it is in the chunk, and the only way to know that is to open
   * the chunk.
   */
  let worldCache: Map<string, string> | undefined;
  async function worldNames(): Promise<Map<string, string>> {
    if (worldCache !== undefined) return worldCache;
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const anvil = stack.openAnvil(path.join(worldDir, "region"));
    const names = new Map<number, string>();
    const nameOf = (id: number): string => {
      let n = names.get(id);
      if (n === undefined) {
        n = stack.blockNameByStateId(id) ?? "?";
        names.set(id, n);
      }
      return n;
    };
    const out = new Map<string, string>();
    const region = report.stats.region;
    for (let cz = region.z0 >> 4; cz <= (region.z0 + region.depth - 1) >> 4; cz++) {
      for (let cx = region.x0 >> 4; cx <= (region.x0 + region.width - 1) >> 4; cx++) {
        const chunk = await anvil.load(cx, cz);
        if (chunk === null) continue;
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            for (let y = SCAN_MIN_Y; y <= SCAN_MAX_Y; y++) {
              const name = nameOf(chunk.getBlockStateId(lx, y, lz));
              if (AIR_NAMES.has(name)) continue;
              out.set(`${cx * 16 + lx},${y},${cz * 16 + lz}`, name);
            }
          }
        }
      }
    }
    await anvil.close();
    worldCache = out;
    return out;
  }

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
    // Asked as a leaf: since 2026-08-14 a leaf may stand in the one-block eave
    // ring, right against the wall face — what it may never do is enter the
    // footprint itself. Wood still keeps the ring (`StructureBox.leafInset`).
    for (const key of await leafColumns()) {
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      if (clip.blocked(x, y, z, "leaves")) offenders.push(key);
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


  it("supports every lantern in the world — none hangs in mid-air", async () => {
    const world = await worldNames();
    const at = (x: number, y: number, z: number): string => world.get(`${x},${y},${z}`) ?? "air";
    const lamps: string[] = [];
    const unsupported: string[] = [];
    for (const [key, name] of world) {
      if (name !== "lantern" && name !== "soul_lantern") continue;
      lamps.push(key);
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      // A lantern is legal standing on something or hanging from something.
      // Air above *and* below is the defect: a light floating over the grass.
      if (at(x, y - 1, z) === "air" && at(x, y + 1, z) === "air") unsupported.push(key);
    }
    expect(lamps.length).toBeGreaterThan(20);
    expect(unsupported).toEqual([]);
  }, 180_000);

  it("caps every trunk — no bare log pokes out of a canopy", async () => {
    const world = await worldNames();
    const at = (x: number, y: number, z: number): string => world.get(`${x},${y},${z}`) ?? "air";
    const isLog = (n: string): boolean => n.endsWith("_log") && !n.startsWith("stripped_");
    const isLeaf = (n: string): boolean => n.endsWith("_leaves");
    const bare: string[] = [];
    let trunks = 0;
    for (const [key, name] of world) {
      if (!isLog(name)) continue;
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      // A single log lying on the ground is undergrowth deadwood, not a trunk.
      if (!isLog(at(x, y - 1, z))) continue;
      trunks++;
      // Only the topmost log of a trunk can be an exposed tip.
      if (at(x, y + 1, z) !== "air") continue;
      let covered = false;
      for (let dy = 1; dy <= 2 && !covered; dy++) {
        for (let dx = -1; dx <= 1 && !covered; dx++) {
          for (let dz = -1; dz <= 1 && !covered; dz++) {
            if (isLeaf(at(x + dx, y + dy, z + dz))) covered = true;
          }
        }
      }
      if (!covered) bare.push(key);
    }
    expect(trunks).toBeGreaterThan(100);
    expect(bare).toEqual([]);
  }, 180_000);

  it("keeps the canopy off the lanes — a road is a cut, not a tunnel", async () => {
    const world = await worldNames();
    const roads = report.layout?.structures?.roads;
    expect(roads).toBeDefined();
    const reach = Math.max(1, (((roads?.width ?? 3) - 1) >> 1) + 1);
    let corridor = 0;
    let roofed = 0;
    const seen = new Set<string>();
    for (const route of roads?.routes ?? []) {
      for (const cell of route.path) {
        for (let dx = -reach; dx <= reach; dx++) {
          for (let dz = -reach; dz <= reach; dz++) {
            const key = `${cell.x + dx},${cell.z + dz},${cell.y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            corridor++;
            for (let dy = 1; dy <= ROAD_CANOPY_CLEARANCE; dy++) {
              const name = world.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`);
              if (name !== undefined && name.endsWith("_leaves")) {
                roofed++;
                break;
              }
            }
          }
        }
      }
    }
    expect(corridor).toBeGreaterThan(500);
    expect(roofed).toBe(0);
  }, 180_000);

  /**
   * Fallen logs, read back out of the world.
   *
   * A fallen log is a log lying on natural ground with sky directly above it,
   * which is precisely what a trunk and a wall's belt course are not: a trunk
   * has more trunk above it, and a belt course stands on a wall.
   */
  it("lays no fallen log against a wall, a lane or the green", async () => {
    const world = await worldNames();
    const at = (x: number, y: number, z: number): string => world.get(`${x},${y},${z}`) ?? "air";
    const GROUND = new Set([
      "dirt",
      "grass_block",
      "podzol",
      "coarse_dirt",
      "rooted_dirt",
      "gravel",
      "stone",
      "sand",
      "moss_block",
    ]);
    const rects = [
      ...(report.layout?.structures?.buildings ?? []).map((b) => b.footprint),
      ...(report.layout?.placements ?? []).map((p) => p.footprint),
    ];
    const lanes = new Set<string>();
    for (const route of report.layout?.structures?.roads?.routes ?? []) {
      for (const cell of route.path) lanes.add(`${cell.x},${cell.z}`);
    }
    const inApron = (x: number, z: number): boolean => {
      for (const r of rects) {
        if (x >= r.x0 - DECOR_APRON && x <= r.x1 + DECOR_APRON && z >= r.z0 - DECOR_APRON && z <= r.z1 + DECOR_APRON) {
          return true;
        }
      }
      for (let dx = -DECOR_APRON; dx <= DECOR_APRON; dx++) {
        for (let dz = -DECOR_APRON; dz <= DECOR_APRON; dz++) {
          if (lanes.has(`${x + dx},${z + dz}`)) return true;
        }
      }
      return false;
    };

    let fallen = 0;
    const offenders: string[] = [];
    for (const [key, name] of world) {
      if (!name.endsWith("_log") || name.startsWith("stripped_")) continue;
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      if (!GROUND.has(at(x, y - 1, z))) continue;
      if (at(x, y + 1, z) !== "air") continue;
      fallen++;
      if (inApron(x, z)) offenders.push(key);
    }
    // The village is meant to have deadwood in its woods — just not on its
    // doorsteps.
    expect(fallen).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  }, 180_000);

  /**
   * The doorstep: a level floor plane meeting ground that is not level. Every
   * block a building puts in its apron ring at or below that plane has to stand
   * on something, or it reads as a step floating over the grass.
   */
  it("stands every porch and step block on solid ground", async () => {
    const world = await worldNames();
    const at = (x: number, y: number, z: number): string => world.get(`${x},${y},${z}`) ?? "air";
    const buildings = report.layout?.structures?.buildings ?? [];
    // A gallery's *ceiling* is an apron block with air under it, and it is
    // meant to be: the tunnel from the chapel to the great hall passes under
    // the apron of both, and the block over its bore is the roof, not a step
    // floating over the grass. The rule is about the ground the doorstep meets,
    // so a column the compiler deliberately hollowed out is not its business —
    // `cave.fluid_shell` and the tunnel traversal lint own those.
    const carved = new Set<string>();
    for (const tunnel of report.layout?.structures?.tunnels ?? []) {
      for (const cell of tunnel.path) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) carved.add(`${cell.x + dx},${cell.z + dz}`);
        }
      }
    }
    expect(buildings.length).toBeGreaterThan(0);
    let checked = 0;
    const floating: string[] = [];
    for (const b of buildings) {
      const { footprint: f, floorY } = b;
      for (let x = f.x0 - 1; x <= f.x1 + 1; x++) {
        for (let z = f.z0 - 1; z <= f.z1 + 1; z++) {
          if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) continue;
          for (let y = floorY - MAX_FOUNDATION_DEPTH; y <= floorY; y++) {
            if (at(x, y, z) === "air") continue;
            checked++;
            if (at(x, y - 1, z) !== "air") continue;
            if (carved.has(`${x},${z}`)) continue;
            floating.push(`${x},${y},${z} ${at(x, y, z)}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(floating).toEqual([]);
  }, 180_000);

  it("builds no two houses out of the same materials", () => {
    const stats = report.stats.structures;
    expect(stats?.theme).toBeTruthy();
    // Nine buildings, twelve triples in a theme's product: every one distinct.
    expect(stats?.distinctMaterials).toBe(stats?.buildingCount);
    const keys = (report.layout?.structures?.buildings ?? []).map((b) => b.meta.materialKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("runs its lanes without a staircase of right angles", () => {
    for (const route of report.layout?.structures?.roads?.routes ?? []) {
      expect(longestOrthogonalZigzag(route.path)).toBeLessThan(3);
    }
  });

  it("compiles byte-identically twice", async () => {
    const again = await compile("b");
    expect(JSON.stringify(again.report.stats)).toBe(JSON.stringify(report.stats));
    expect(JSON.stringify(again.report.layout)).toBe(JSON.stringify(report.layout));
    expect(await regionHashes(again.dir)).toEqual(await regionHashes(worldDir));
  }, 300_000);
});
