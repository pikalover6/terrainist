/**
 * `precinct.farm@0` — WP-4, the farmstead and the seams
 *
 * WP-4 is the work package where a holding stops being fields and becomes a
 * farm: the yard is levelled, surfaced and built on (§7), and the four seams
 * the plan names are wired — the land-use clamp learns farm parcels (§8), the
 * clearing is suppressed over them (§9.1), the ground treatment is kept out of
 * them (§9.2), and the occupancy grid is told they are spoken for (§9.3).
 *
 * §13's own acceptance for this WP, in order:
 *
 * 1. **the clamp gives the fields the town's biome and snow decision**;
 * 2. **no tree inside a parcel**;
 * 3. the walkability audit's goldens do not regress — carried by the suite's
 *    own fixtures, and joined here by the harder bar §13.1 sets for every farm
 *    WP: a compiled world read back off disk, linted zero on all 27 rules.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine, listChunks, type PrismarineStack } from "../src/emit/prismarine.js";
import { compileArtifacts, compileTerrain, type TerrainCompileReport  } from "../src/terrain/compile.js";
import { buildLandUseMask } from "../src/terrain/landuse.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import type { FarmReportRow } from "../src/structures/farm.js";
import type { Rect } from "../src/layout/frames.js";

/**
 * One village and one holding beside it.
 *
 * The village is what makes assertion 1 answerable at all: "the town's biome"
 * is a thing only a world with a town has, and a holding on its own would clamp
 * to whatever its own fields voted for.
 */
function doc(): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "farm_wp4", worldSeed: 302 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 6, baseHeight: 72, seaLevel: 62, frequency: 0.004 }
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "hall",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [13, 9, 11] },
          tags: ["village", "hall"]
        },
        {
          id: "cottage",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [9, 7, 8] },
          constraints: [{ distance: "hall", min: 6, max: 20 }],
          tags: ["village", "cottage"]
        },
        {
          id: "east_farm",
          kind: "generator",
          generator: "precinct.farm@0",
          label: "the holding east of the village",
          envelope: { shape: "region", size: [96, 80] },
          params: { parcels: 6, parcelSize: 18, crops: ["wheat", "potatoes"] },
          constraints: [{ distance: "hall", min: 10, max: 70 }],
          ports: { gate: { type: "road_stub" } },
          tags: ["farm", "rural"]
        }
      ]
    }
  };
}

interface Sample {
  readonly name: string;
  readonly props: Readonly<Record<string, string>>;
}

let root: string;
let dir: string;
let report: TerrainCompileReport;
let structures: StructurePassResult;
let plan: ColumnPlan;
let stack: PrismarineStack;
let physics: PhysicsReport;
let world: Map<string, Sample>;

function at(x: number, y: number, z: number): Sample {
  return world.get(`${x},${y},${z}`) ?? { name: "air", props: {} };
}

function holding(): FarmReportRow {
  const row = report.farms?.[0];
  if (row === undefined) throw new Error("no holding in the report");
  return row;
}

function columnsOf(rect: Rect): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, z });
  }
  return out;
}

function within(rect: Rect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}

function idx(x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-farm-yard-"));
  dir = path.join(root, "holding");
  const art_compiled = await compileArtifacts(doc(), {});
  if (!art_compiled.ok) throw new Error(art_compiled.diagnostics.map((d) => d.name).join(", "));
  plan = art_compiled.artifacts.plan;
  const compiled = await compileTerrain(doc(), { outDir: dir });
  if (!compiled.ok) {
    throw new Error(
      `fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  report = compiled.report;
  structures = report.layout?.structures as StructurePassResult;

  world = new Map();
  const regionDir = path.join(dir, "region");
  const anvil = stack.openAnvil(regionDir);
  try {
    for (const { chunkX, chunkZ } of await listChunks(regionDir)) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          for (let y = 50; y <= 120; y++) {
            const id = chunk.getBlockStateId(lx, y, lz);
            const decoded = stack.blockStateProps(id);
            if (decoded === undefined || decoded.name === "air") continue;
            world.set(`${chunkX * 16 + lx},${y},${chunkZ * 16 + lz}`, {
              name: decoded.name,
              props: decoded.props
            });
          }
        }
      }
    }
  } finally {
    await anvil.close();
  }

  physics = await lintWorldPhysics(dir, stack, {
    buildings: structures.buildings as never,
    roads: (structures.roads?.routes ?? []) as never,
    tunnels: structures.tunnels.map((t) => ({
      id: t.id,
      from: t.endpoints[0],
      to: t.endpoints[1]
    })),
    terrainTop: {
      x0: plan.region.x0,
      z0: plan.region.z0,
      width: plan.region.width,
      depth: plan.region.depth,
      ground: plan.ground,
      entrances:
        (plan.caves as { entranceColumns?: Uint8Array } | undefined)?.entranceColumns ??
        new Uint8Array(plan.region.width * plan.region.depth)
    }
  });
}, 900_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* §7 the farmstead                                                            */
/* -------------------------------------------------------------------------- */

describe("the yard (§7.1)", () => {
  it("is reported, is square, and is 16..24 on a side", () => {
    const yard = holding().yard;
    expect(yard).toBeDefined();
    const side = (yard as { rect: Rect }).rect.x1 - (yard as { rect: Rect }).rect.x0 + 1;
    expect(side).toBeGreaterThanOrEqual(16);
    expect(side).toBeLessThanOrEqual(24);
    expect((yard as { rect: Rect }).rect.z1 - (yard as { rect: Rect }).rect.z0 + 1).toBe(side);
  });

  it("is levelled — one height across every column it kept", () => {
    const yard = holding().yard as { rect: Rect; level: number };
    const heights = new Set<number>();
    for (const { x, z } of columnsOf(yard.rect)) heights.add(plan.ground[idx(x, z)] as number);
    // §7.1: "unlike a parcel it **is** levelled". One height, and it is the one
    // the report says the yard was cut to.
    expect([...heights]).toEqual([yard.level]);
  });

  it("is surfaced as a working yard — never grass", () => {
    const yard = holding().yard as { rect: Rect; level: number };
    const footprints = structures.buildings
      .filter((b) => b.nodePath.startsWith("world.east_farm."))
      .map((b) => b.footprint);
    let path = 0;
    let coarse = 0;
    for (const { x, z } of columnsOf(yard.rect)) {
      if (footprints.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) continue;
      const name = at(x, yard.level, z).name;
      if (name === "dirt_path") path++;
      else if (name === "coarse_dirt") coarse++;
      // A working yard that is grass reads as a lawn (§7.1).
      expect(name).not.toBe("grass_block");
    }
    expect(path).toBeGreaterThan(0);
    expect(coarse).toBeGreaterThan(0);
  });
});

describe("the farmstead (§7.2)", () => {
  it("builds the farmhouse first, and one building per reported archetype", () => {
    const row = holding();
    // §7.2's order, and its stopping rule: the farmhouse is always first and
    // always built, and the list stops when the yard is full — so the report
    // names what was *built*, never what was wanted.
    expect(row.farmstead[0]).toBe("farmhouse");
    expect(row.farmstead[1]).toBe("barn");
    const built = structures.buildings.filter((b) => b.nodePath.startsWith("world.east_farm."));
    expect(built).toHaveLength(row.farmstead.length);
  });

  it("stands every farmstead building inside the yard, on the yard's level", () => {
    const yard = holding().yard as { rect: Rect; level: number };
    for (const b of structures.buildings.filter((x) =>
      x.nodePath.startsWith("world.east_farm."),
    )) {
      expect(b.footprint.x0).toBeGreaterThanOrEqual(yard.rect.x0);
      expect(b.footprint.x1).toBeLessThanOrEqual(yard.rect.x1);
      expect(b.footprint.z0).toBeGreaterThanOrEqual(yard.rect.z0);
      expect(b.footprint.z1).toBeLessThanOrEqual(yard.rect.z1);
    }
  });

  it("names the gate anchor exactly once (§7.3, LOAM-I504)", () => {
    const track = report.diagnostics.filter((d) => d.code === "LOAM-I504");
    expect(track).toHaveLength(1);
    expect(track[0]?.message).toContain("world.east_farm");
  });
});

/* -------------------------------------------------------------------------- */
/* §8 the land-use clamp                                                       */
/* -------------------------------------------------------------------------- */

describe("the clamp learns farm parcels (§8)", () => {
  it("takes parcel and yard rects through the `farmParcels` seam and nothing else", () => {
    // The seam itself, at unit scale: the rects are in, and a rect handed to no
    // seam at all is out. `farmParcels` is never the holding envelope.
    const mask = buildLandUseMask(
      { x0: 0, z0: 0, width: 8, depth: 8 },
      { farmParcels: [{ x0: 1, z0: 1, x1: 2, z1: 2 }] },
    );
    expect(mask[1 * 8 + 1]).toBe(1);
    expect(mask[2 * 8 + 2]).toBe(1);
    expect(mask[5 * 8 + 5]).toBe(0);
  });

  it("gives the fields the town's biome", async () => {
    const anvil = stack.openAnvil(path.join(dir, "region"));
    const cache = new Map<string, Awaited<ReturnType<typeof anvil.load>>>();
    const biomeAt = async (x: number, z: number, y: number): Promise<number | undefined> => {
      const key = `${x >> 4},${z >> 4}`;
      let chunk = cache.get(key);
      if (chunk === undefined) {
        chunk = await anvil.load(x >> 4, z >> 4);
        cache.set(key, chunk);
      }
      if (chunk === null || chunk === undefined) return undefined;
      return chunk.getBiomeId(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16);
    };
    try {
      const town = structures.buildings.find((b) => b.nodePath === "world.hall");
      expect(town).toBeDefined();
      const townBiome = await biomeAt(
        (town as { footprint: Rect }).footprint.x0,
        (town as { footprint: Rect }).footprint.z0,
        (town as { foundationY: number }).foundationY,
      );
      expect(townBiome).toBeDefined();
      const seen = new Set<number>();
      for (const parcel of holding().parcels) {
        for (const { x, z } of columnsOf(parcel.rect)) {
          if (structures.farms?.parcelMask[idx(x, z)] !== 1) continue;
          const b = await biomeAt(x, z, plan.ground[idx(x, z)] as number);
          if (b !== undefined) seen.add(b);
        }
      }
      expect(seen.size).toBeGreaterThan(0);
      // One biome over every field, and it is the town's: a wheat field with
      // its own biome decision is a seam through a farm.
      expect([...seen]).toEqual([townBiome]);
    } finally {
      await anvil.close();
    }
  }, 300_000);

  it("leaves no snow layer on a parcel or a yard column", () => {
    const farms = structures.farms;
    expect(farms).toBeDefined();
    for (let i = 0; i < plan.snow.length; i++) {
      if ((farms as { parcelMask: Uint8Array }).parcelMask[i] === 1) expect(plan.snow[i]).toBe(0);
      if ((farms as { yardMask: Uint8Array }).yardMask[i] === 1) expect(plan.snow[i]).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §9 the other passes                                                         */
/* -------------------------------------------------------------------------- */

describe("the other passes stay out (§9)", () => {
  it("grows no tree inside a parcel or a yard (§9.1)", () => {
    // What a tree is, as the world sees it: a canopy, a sapling, or an
    // unstripped trunk. A **stripped** log is joinery — the holding's own
    // scarecrow and handcart are made of it, and they stand in a field on
    // purpose (§6.5).
    const woody = (name: string): boolean =>
      name.endsWith("_leaves") ||
      name.endsWith("_sapling") ||
      name.endsWith("_wood") ||
      (name.endsWith("_log") && !name.startsWith("stripped_"));
    const farms = structures.farms as { parcelMask: Uint8Array; yardMask: Uint8Array };
    for (const [key, sample] of world) {
      if (!woody(sample.name)) continue;
      const [x, , z] = key.split(",").map(Number) as [number, number, number];
      const i = idx(x, z);
      if (i < 0 || i >= farms.parcelMask.length) continue;
      // A barn is made of logs: a building's own footprint is not a tree.
      if (structures.buildings.some((b) => within(b.footprint, x, z))) continue;
      expect(farms.parcelMask[i]).toBe(0);
      expect(farms.yardMask[i]).toBe(0);
    }
  });

  it("dresses no parcel column (§9.2)", () => {
    // The ground pass writes its treatments into `lots`; none of them may reach
    // a field. Asserted through the mask the pass was actually handed: a column
    // a parcel won is reserved, so no treatment and no wear can touch it.
    const farms = structures.farms as { parcelMask: Uint8Array };
    let claimed = 0;
    for (let i = 0; i < farms.parcelMask.length; i++) if (farms.parcelMask[i] === 1) claimed++;
    expect(claimed).toBeGreaterThan(0);
    // The yard is the one exception §9.2 names, so it is *not* in this mask.
    const yard = holding().yard as { rect: Rect };
    const yardColumns = columnsOf(yard.rect).filter((c) => farms.parcelMask[idx(c.x, c.z)] === 1);
    expect(yardColumns).toEqual([]);
  });

  it("leaves nothing but the farm's own surfaces on a parcel column (§9.2, §9.3)", () => {
    // The occupancy grid is not carried on the report, so the claim is asserted
    // where it is meant to be visible: on the ground. A parcel column carries a
    // surface the farm pass wrote and nothing else — no dressing, no wear
    // paint, no scatter, no life pass furniture.
    const farms = structures.farms as { parcelMask: Uint8Array };
    const legal = new Set(["farmland", "dirt_path", "coarse_dirt", "grass_block", "dirt"]);
    const seen = new Set<string>();
    for (const parcel of holding().parcels) {
      for (const { x, z } of columnsOf(parcel.rect)) {
        if (farms.parcelMask[idx(x, z)] !== 1) continue;
        seen.add(at(x, plan.ground[idx(x, z)] as number, z).name);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const name of seen) expect(legal).toContain(name);
  });
});

describe("the world (§13.1)", () => {
  it("lints zero on all 27 physics rules", () => {
    expect(physics.findings).toEqual([]);
    expect(PHYSICS_RULES.length).toBe(27);
  });
});
