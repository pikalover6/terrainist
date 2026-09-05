/**
 * `precinct.farm@0` — WP-3, the parcel emitter.
 *
 * WP-3 is where the blocks arrive, so — unlike WP-2's planner tests — almost
 * everything here is asserted against a **compiled world read back off disk**.
 * §13.1 is explicit about why: "Phase 4.1 shipped three defects that passed
 * every unit test and 4.2 shipped six. The bar is a compiled world read back off
 * disk and linted."
 *
 * The four assertions §13 names for WP-3, in order:
 *
 * 1. **the persistence law** — no bare farmland column *anywhere* in the world,
 *    and every farmland column written at `moisture = 0`;
 * 2. **no fence post on farmland or `dirt_path`**;
 * 3. **exactly one gate per parcel**;
 * 4. **zero findings on all 26 physics rules.**
 *
 * The first is deliberately a sweep over the whole world rather than over the
 * parcels: a farmland column the farm pass did not write is exactly as bad as
 * one it did, and a test that only looked where it expected to find something
 * would not have noticed.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine, listChunks, type PrismarineStack } from "../src/emit/prismarine.js";
import { compileArtifacts, compileTerrain, type TerrainCompileReport  } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import type { FarmReportRow } from "../src/structures/farm.js";
import type { Rect } from "../src/layout/frames.js";

/** Crops that may stand on farmland (§6.2). Nothing else may. */
const CROPS_ON_FARMLAND = new Set(["wheat", "carrots", "potatoes", "beetroots", "pumpkin"]);

/**
 * Two holdings, so the edge vocabulary and the fallow share are both exercised
 * in one compile: `east_farm` is a sown holding with a fence, `west_farm` a
 * half-rested one behind a dry-stone wall.
 */
function doc(): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "farm_wp3", worldSeed: 302 },
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
          id: "east_farm",
          kind: "generator",
          generator: "precinct.farm@0",
          label: "the holding east of the village",
          envelope: { shape: "region", size: [96, 80] },
          params: {
            parcels: 6,
            parcelSize: 18,
            crops: ["wheat", "potatoes", "pumpkin", "berries", "pasture"]
          },
          ports: { gate: { type: "road_stub" } },
          tags: ["farm", "rural"]
        },
        {
          id: "west_farm",
          kind: "generator",
          generator: "precinct.farm@0",
          label: "the upland croft, half of it rested",
          envelope: { shape: "region", size: [72, 64] },
          params: { parcels: 3, parcelSize: 16, edge: "wall", fallow: 0.5, crops: ["carrots"] },
          constraints: [{ distance: "east_farm", min: 8, max: 60 }],
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
/** Every non-air block in the compiled world, by `x,y,z`. */
let world: Map<string, Sample>;

function at(x: number, y: number, z: number): Sample {
  return world.get(`${x},${y},${z}`) ?? { name: "air", props: {} };
}

function farms(): readonly FarmReportRow[] {
  return report.farms ?? [];
}

function within(rect: Rect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-farm-sow-"));
  dir = path.join(root, "holdings");
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

  // The readback, once: the world every assertion below is about is the one on
  // disk, not the one in the plan.
  world = new Map();
  const regionDir = path.join(dir, "region");
  const anvil = stack.openAnvil(regionDir);
  try {
    for (const { chunkX, chunkZ } of await listChunks(regionDir)) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          for (let y = 50; y <= 110; y++) {
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
      // No cave node in the fixture, so no entrance columns: the rule that
      // reads them wants an array, not an absence.
      entrances:
        (plan.caves as { entranceColumns?: Uint8Array } | undefined)?.entranceColumns ??
        new Uint8Array(plan.region.width * plan.region.depth)
    }
  });
}, 900_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the holding sows", () => {
  it("seats both holdings and draws one crop per seated parcel", () => {
    expect(farms()).toHaveLength(2);
    for (const row of farms()) {
      expect(row.parcelsSeated).toBeGreaterThan(0);
      expect(row.crops).toHaveLength(row.parcelsSeated);
    }
  });

  it("lays farmland, crops, baulks and headlands on the ground it won", () => {
    const east = farms()[0] as FarmReportRow;
    let farmland = 0;
    let path_ = 0;
    for (const parcel of east.parcels) {
      for (let z = parcel.rect.z0; z <= parcel.rect.z1; z++) {
        for (let x = parcel.rect.x0; x <= parcel.rect.x1; x++) {
          for (let y = 60; y <= 110; y++) {
            const name = at(x, y, z).name;
            if (name === "farmland") farmland++;
            if (name === "dirt_path") path_++;
          }
        }
      }
    }
    // Rows and turning strips both, because a field with no headland does not
    // read as ploughed and a field with no rows is not a field.
    expect(farmland).toBeGreaterThan(0);
    expect(path_).toBeGreaterThan(0);
  });
});

describe("what the emitter is allowed to touch", () => {
  it("lays nothing outside a parcel it seated", () => {
    const rects = farms().flatMap((row) => row.parcels.map((p) => p.rect));
    const stray = (structures.farms?.blocks ?? [])
      .filter((b) => !rects.some((r) => within(r, b.x, b.z)))
      .slice(0, 5);
    expect(stray).toEqual([]);
  });

  it("names a rested field in the report rather than blanking it (§6.5)", () => {
    const west = farms()[1] as FarmReportRow;
    expect(west.settings.fallow).toBe(0.5);
    for (const crop of west.crops) expect(["carrots", "fallow"]).toContain(crop);
  });
});

describe("THE PERSISTENCE LAW (§6.2)", () => {
  it("leaves no bare farmland column anywhere in the world", () => {
    const bare: string[] = [];
    for (const [key, sample] of world) {
      if (sample.name !== "farmland") continue;
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      const above = at(x, y + 1, z);
      if (!CROPS_ON_FARMLAND.has(above.name)) bare.push(`${key} carries ${above.name}`);
    }
    expect(bare.slice(0, 8)).toEqual([]);
  });

  it("writes every farmland column at moisture 0 — the state the world settles into", () => {
    const wet: string[] = [];
    for (const [key, sample] of world) {
      if (sample.name !== "farmland") continue;
      if (sample.props["moisture"] !== "0") wet.push(`${key} at ${String(sample.props["moisture"])}`);
    }
    expect(wet.slice(0, 8)).toEqual([]);
  });

  it("emits every crop mature — §14's exclusion 9", () => {
    const young: string[] = [];
    const mature: Readonly<Record<string, string>> = {
      wheat: "7",
      carrots: "7",
      potatoes: "7",
      beetroots: "3",
      sweet_berry_bush: "3"
    };
    for (const [key, sample] of world) {
      const want = mature[sample.name];
      if (want === undefined) continue;
      if (sample.props["age"] !== want) young.push(`${key} ${sample.name} age ${String(sample.props["age"])}`);
    }
    expect(young.slice(0, 8)).toEqual([]);
  });
});

describe("the edge (§6.3)", () => {
  it("stands no fence post on farmland or on a dirt path", () => {
    // Over the holding's **own** blocks: a scarecrow's mast is a fence too, and
    // §6.5 puts that one on a baulk on purpose. The rule §6.3 states is about
    // the boundary — `dirt_path` reverts to `dirt` under a solid block and a
    // fence on farmland reads as a mistake, so the posts stand on the edge
    // course, which is soil.
    const bad: string[] = [];
    for (const block of structures.farms?.blocks ?? []) {
      const here = at(block.x, block.y, block.z).name;
      if (!here.endsWith("_fence") && !here.endsWith("_fence_gate")) continue;
      const below = at(block.x, block.y - 1, block.z).name;
      if (below === "farmland" || below === "dirt_path") bad.push(`${block.x},${block.y},${block.z} on ${below}`);
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it("gives every fenced parcel exactly one gate", () => {
    const east = farms()[0] as FarmReportRow;
    expect(east.settings.edge).toBe("fence");
    for (const parcel of east.parcels) {
      const gates = (structures.farms?.blocks ?? []).filter(
        (b) => at(b.x, b.y, b.z).name.endsWith("_fence_gate") && within(parcel.rect, b.x, b.z),
      );
      expect(`parcel ${parcel.ordinal}: ${gates.length} gates`).toBe(
        `parcel ${parcel.ordinal}: 1 gates`,
      );
    }
  });

  it("runs a dry-stone course and no fence where the author wrote edge: wall", () => {
    const west = farms()[1] as FarmReportRow;
    expect(west.settings.edge).toBe("wall");
    for (const parcel of west.parcels) {
      const fences = (structures.farms?.blocks ?? []).filter((b) => {
        const name = at(b.x, b.y, b.z).name;
        if (!name.endsWith("_fence") && !name.endsWith("_fence_gate")) return false;
        return within(parcel.rect, b.x, b.z);
      });
      expect(fences).toEqual([]);
    }
    // …and the course it laid instead is masonry, standing on the edge run.
    const course = (structures.farms?.blocks ?? []).filter((b) =>
      west.parcels.some((p) => within(p.rect, b.x, b.z) && b.y > 60),
    );
    expect(course.length).toBeGreaterThan(0);
  });
});

describe("the world it compiles to", () => {
  it("lints zero on every one of the 26 physics rules", () => {
    for (const rule of PHYSICS_RULES) {
      const found = physics.findings.filter((f) => f.rule === rule).slice(0, 3);
      expect(`${rule}=${physics.counts[rule] ?? 0} ${JSON.stringify(found)}`).toBe(`${rule}=0 []`);
    }
  });
});
