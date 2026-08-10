/**
 * The ground under the ruins — `docs/RUINS-PLAN-v0.md` WP-4 (and §7.4's
 * reclaim, which the same fixture is the only honest place to measure).
 *
 * WP-3 rolled the lots; this is the half that stops a ruined shell standing on
 * a mown lawn. Four mechanisms, all keyed on the per-column **ruin field**
 * (§7.1), which is empty in a world that never ruined anything:
 *
 * 1. `ruin_yard` — the treatment a ruined lot's ground takes, ahead of the
 *    category table (§7.2);
 * 2. the wear sweep lifted locally, so the worst ground lines up with the worst
 *    buildings (§7.3, first bullet);
 * 3. the street break-up above `decline ≥ 0.8` — paving back to soil, with the
 *    volunteer green on top (§7.3, second bullet), **and its walkability
 *    caveat**: soil is in the audit's `SOLID_TOP` set, so a broken street is
 *    still a street you can walk down;
 * 4. the clearing lift (§7.4), so the wood comes back *through* the fabric —
 *    with the kit's `avoidTags` line, unchanged, keeping it out of the shells
 *    and off the streets.
 *
 * §8's bar applies as it does to every WP: a compiled world read back off disk
 * and linted zero on all 26 physics rules, not a unit test.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, listChunks, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  RECLAIM_CANOPY_GAIN,
  compileTerrain,
  liftRuinClearing,
  type TerrainCompileReport,
} from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import type { Rect } from "../src/layout/frames.js";
import { RUIN_FIELD_APRON, RUIN_FIELD_FALLOFF } from "../src/structures/ruin-field.js";

/** A quarter with no ruin anywhere in its `mix` — §10's own instruction. */
const QUARTER = {
  fabric: "grid",
  density: "medium",
  blockSize: 40,
  mix: ["townhouse", "shop_row", "warehouse"],
};

function doc(): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "ruins_wp4", worldSeed: 307 },
    // §10's own sentence, and the classifier's: the decline goes on the
    // **region**, and the ordinary quarter under it needs no ruin vocabulary.
    intent: { decline: 0.9 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 4, baseHeight: 74, seaLevel: 62, octaves: 3, frequency: 0.004 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "dead_quarter",
          kind: "district",
          envelope: { shape: "region", size: [190, 190] },
          params: QUARTER,
          constraints: [
            { zone: "center" },
            { terrain_conform: "flatten", reference: "median", blend: 6 },
          ],
        },
        {
          id: "woods",
          kind: "generator",
          generator: "scatter.forest@0",
          params: {
            area: { all: true },
            density: 0.08,
            spacing: 4,
            clumping: 0.5,
            maxSlope: 30,
            elevation: [3, 110],
            edgeFalloff: 10,
            // §7.4: this line is what keeps the reclaim out of the shells and
            // off the streets, and F19 does not change it.
            avoidTags: ["structure", "road", "plaza"],
            species: [{ id: "reclaim_oak", weight: 1, shape: "oak_round" }],
          },
        },
      ],
    },
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
/** Every non-air block, indexed by column, for the readback assertions. */
let columnBlocks: Map<string, { y: number; name: string }[]>;
/** Where the scatter actually stood a trunk, after the clip and the band. */
let trees: { x: number; z: number }[] = [];

function idx(x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

function ruinAt(x: number, z: number): number {
  const field = structures.ruinField?.field;
  if (field === undefined) return 0;
  return field[idx(x, z)] as number;
}

function within(rect: Rect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-ruins-ground-"));
  dir = path.join(root, "dead_quarter");
  const compiled = await compileTerrain(doc(), {
    outDir: dir,
    onColumnPlan: (p) => {
      plan = p;
    },
    onArtifacts: (a) => {
      trees = a.trees.map((t) => ({ x: t.x, z: t.z }));
    },
  });
  if (!compiled.ok) {
    throw new Error(
      `fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  report = compiled.report;
  structures = report.layout?.structures as StructurePassResult;

  world = new Map();
  columnBlocks = new Map();
  const regionDir = path.join(dir, "region");
  const anvil = stack.openAnvil(regionDir);
  try {
    for (const { chunkX, chunkZ } of await listChunks(regionDir)) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const x = chunkX * 16 + lx;
          const z = chunkZ * 16 + lz;
          for (let y = 50; y <= 140; y++) {
            const id = chunk.getBlockStateId(lx, y, lz);
            const decoded = stack.blockStateProps(id);
            if (decoded === undefined || decoded.name === "air") continue;
            world.set(`${x},${y},${z}`, { name: decoded.name, props: decoded.props });
            const key = `${x},${z}`;
            let list = columnBlocks.get(key);
            if (list === undefined) {
              list = [];
              columnBlocks.set(key, list);
            }
            list.push({ y, name: decoded.name });
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
      to: t.endpoints[1],
    })),
    terrainTop: {
      x0: plan.region.x0,
      z0: plan.region.z0,
      width: plan.region.width,
      depth: plan.region.depth,
      ground: plan.ground,
      entrances:
        (plan.caves as { entranceColumns?: Uint8Array } | undefined)?.entranceColumns ??
        new Uint8Array(plan.region.width * plan.region.depth),
    },
  });
}, 900_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* §7.1 the ruin field                                                         */
/* -------------------------------------------------------------------------- */

describe("the ruin field (§7.1)", () => {
  it("exists, and reaches every ruined lot and its apron", () => {
    const field = structures.ruinField;
    expect(field).toBeDefined();
    expect((field as { lots: readonly unknown[] }).lots.length).toBeGreaterThan(0);
    expect((field as { columns: number }).columns).toBeGreaterThan(0);
    for (const lot of (field as { lots: readonly { rect: Rect; intensity: number }[] }).lots) {
      const cx = (lot.rect.x0 + lot.rect.x1) >> 1;
      const cz = (lot.rect.z0 + lot.rect.z1) >> 1;
      expect(ruinAt(cx, cz)).toBeCloseTo(lot.intensity, 5);
      // The apron ring holds the full value.
      // The apron ring holds at least the full value — a neighbouring ruin's
      // own field may be higher there, and the two compose by `max`.
      expect(ruinAt(lot.rect.x1 + 1, cz)).toBeGreaterThanOrEqual(lot.intensity - 1e-5);
    }
  });

  it("is zero on ground no ruin reaches — the falloff ends", () => {
    const field = structures.ruinField as {
      field: Float32Array;
      columns: number;
      lots: readonly { rect: Rect }[];
    };
    expect(field.columns).toBeLessThan(field.field.length);
    // Every column further than the apron plus the falloff from every ruined
    // rect is exactly 0, which is what makes the field a *local* lift rather
    // than a settlement-wide one.
    const reach = RUIN_FIELD_APRON + RUIN_FIELD_FALLOFF;
    let sampled = 0;
    for (let j = 0; j < plan.region.depth; j += 7) {
      const z = plan.region.z0 + j;
      for (let i = 0; i < plan.region.width; i += 7) {
        const x = plan.region.x0 + i;
        const near = field.lots.some((l) => {
          const dx = x < l.rect.x0 ? l.rect.x0 - x : x > l.rect.x1 ? x - l.rect.x1 : 0;
          const dz = z < l.rect.z0 ? l.rect.z0 - z : z > l.rect.z1 ? z - l.rect.z1 : 0;
          return Math.max(dx, dz) <= reach;
        });
        if (near) continue;
        expect(ruinAt(x, z)).toBe(0);
        sampled++;
      }
    }
    expect(sampled).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §7.2 the ruin yard                                                          */
/* -------------------------------------------------------------------------- */

describe("ruin_yard (§7.2)", () => {
  it("is the treatment every ruined lot takes, ahead of the category table", () => {
    const lots = structures.grounds?.lots ?? [];
    const ruined = new Set(
      (structures.ruinField as { lots: readonly { nodePath: string }[] }).lots.map(
        (l) => l.nodePath,
      ),
    );
    expect(ruined.size).toBeGreaterThan(0);
    let yards = 0;
    for (const lot of lots) {
      if (ruined.has(lot.nodePath)) {
        expect(lot.treatment).toBe("ruin_yard");
        yards++;
      } else {
        // §7.2 keys the treatment on the *field*, not on the building: an
        // intact lot whose ground a neighbouring ruin's falloff reaches is
        // allowed to take it too, and one that no ruin reaches never does.
        const built = structures.buildings.find((b) => b.nodePath === lot.nodePath);
        if (built === undefined) continue;
        const cx = (built.footprint.x0 + built.footprint.x1) >> 1;
        const cz = (built.footprint.z0 + built.footprint.z1) >> 1;
        if (ruinAt(cx, cz) === 0) expect(lot.treatment).not.toBe("ruin_yard");
      }
    }
    expect(yards).toBeGreaterThan(0);
    expect(structures.stats.ruinYards).toBe(yards);
  });

  it("fences its plot brokenly — a fence run with gaps, and no gate", () => {
    // The gate is the garden's signature and the ruin yard has none. Every gate
    // in the world therefore belongs to a lot that is still standing: the test
    // is which lot's ground the gate is on, taken as the nearest footprint.
    const ruined = new Set(
      (structures.ruinField as { lots: readonly { nodePath: string }[] }).lots.map(
        (l) => l.nodePath,
      ),
    );
    const nearest = (x: number, z: number): string => {
      let best = "";
      let bestD = Number.POSITIVE_INFINITY;
      for (const b of structures.buildings) {
        const dx = x < b.footprint.x0 ? b.footprint.x0 - x : x > b.footprint.x1 ? x - b.footprint.x1 : 0;
        const dz = z < b.footprint.z0 ? b.footprint.z0 - z : z > b.footprint.z1 ? z - b.footprint.z1 : 0;
        const d = Math.max(dx, dz);
        if (d < bestD) {
          bestD = d;
          best = b.nodePath;
        }
      }
      return best;
    };
    let gates = 0;
    let fences = 0;
    for (const [key, sample] of world) {
      const [x, , z] = key.split(",").map(Number) as [number, number, number];
      if (sample.name.endsWith("fence_gate")) {
        gates++;
        expect(ruined.has(nearest(x, z))).toBe(false);
        continue;
      }
      if (sample.name.endsWith("_fence") && ruined.has(nearest(x, z))) fences++;
    }
    // A broken fence is still a fence: the run is there, with gaps in it.
    expect(fences).toBeGreaterThan(0);
    expect(gates).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §7.3 the street in front of a ruin                                          */
/* -------------------------------------------------------------------------- */

describe("the broken street (§7.3)", () => {
  it("breaks a share of the carriageway back to soil at decline 0.9", () => {
    expect(structures.stats.brokenStreetColumns).toBeGreaterThan(0);
    expect(structures.streets?.broken).toBeDefined();
  });

  it("grows the reclaim's volunteer green on what it broke", () => {
    expect(structures.stats.streetReclaimBlocks).toBeGreaterThan(0);
  });

  it("plants only what a pedestrian can walk through — §7.3's audit caveat", () => {
    // `coarse_dirt` and `grass_block` are full cubes and `dirt_path` is in the
    // audit's `SOLID_TOP` set, so the surface itself stays load-bearing. What
    // could break a street is something *standing* on it, so every block this
    // pass put on a broken column is checked: plants, and nothing else.
    const broken = structures.streets?.broken as Uint8Array;
    const plant = /grass|fern|poppy|dandelion|cornflower|daisy|bluet|tulip|orchid|allium/;
    let planted = 0;
    for (const block of structures.grounds?.blocks ?? []) {
      if (broken[idx(block.x, block.z)] !== 1) continue;
      const decoded = stack.blockStateProps(block.stateId);
      expect(decoded).toBeDefined();
      expect(plant.test((decoded as { name: string }).name)).toBe(true);
      planted++;
    }
    expect(planted).toBe(structures.stats.streetReclaimBlocks);
    expect(planted).toBeGreaterThan(0);
  });

  it("breaks the paving to soil wherever nothing repainted it afterwards", () => {
    const broken = structures.streets?.broken as Uint8Array;
    const soil = new Set(["coarse_dirt", "grass_block", "dirt", "dirt_path"]);
    let soiled = 0;
    let total = 0;
    for (let j = 0; j < plan.region.depth; j++) {
      const z = plan.region.z0 + j;
      for (let i = 0; i < plan.region.width; i++) {
        if (broken[j * plan.region.width + i] !== 1) continue;
        const x = plan.region.x0 + i;
        const g = plan.ground[idx(x, z)] as number;
        const surface = world.get(`${x},${g},${z}`);
        expect(surface).toBeDefined();
        total++;
        if (soil.has((surface as Sample).name)) soiled++;
      }
    }
    // Not all of them: a crossing, a sidewalk band or a junction step is laid
    // after the carriageway and wins the column, which is correct — the
    // break-up is a surface, and the passes that own a surface still own it.
    expect(total).toBeGreaterThan(0);
    expect(soiled * 2).toBeGreaterThan(total);
  });
});

/* -------------------------------------------------------------------------- */
/* §7.4 the reclaim                                                            */
/* -------------------------------------------------------------------------- */

describe("the reclaim (§7.4)", () => {
  it("lifts the clearing over ruined ground — `max(clearing, ruin · gain)`", () => {
    // The lift itself, measured on the arithmetic: inside a settlement hull the
    // clearing is 0, which is precisely why no tree has ever grown in a town.
    const region = plan.region;
    const cells = region.width * region.depth;
    const before = new Float32Array(cells);
    const field = (structures.ruinField as { field: Float32Array }).field;
    const after = liftRuinClearing(
      region,
      { hulls: [], density: before, clearedColumns: cells },
      field,
    );
    let lifted = 0;
    for (let k = 0; k < cells; k++) {
      expect(after.density[k]).toBeCloseTo((field[k] as number) * RECLAIM_CANOPY_GAIN, 5);
      if ((after.density[k] as number) > 0) lifted++;
    }
    expect(lifted).toBe((structures.ruinField as { columns: number }).columns);
  });

  it("grows the wood back **through** the fabric — trees over ruined ground", () => {
    // The other half of §7.4, and the half the lift alone does not buy: the
    // eligibility mask, not the density, is what keeps a tree out of a
    // settlement, so a clearing lifted over ground the mask still excludes
    // plants nothing. Measured before the gate opened: 847 trees, 0 of them
    // over ruined ground, the nearest trunk 71 blocks from the quarter's
    // centre.
    const over = trees.filter((t) => ruinAt(t.x, t.z) > 0);
    expect(over.length).toBeGreaterThan(0);
  });

  it("keeps the wood out of the shells and off the streets — the avoidTags line", () => {
    // Unchanged by F19, and asserted rather than assumed: no trunk stands in a
    // footprint or on a surfaced street anywhere in the world.
    //
    // The **sidewalk** is checked from the district product rather than from
    // the occupancy grid on purpose: a quarter's own street bands write no
    // occupancy tag (the town green found the same hole from the other side),
    // so while the settlement's whole rectangle was excluded outright nothing
    // noticed. The reclaim removes that exclusion, and the first measurement
    // after it stood 67 of 111 reclaim trunks in the middle of the pavement.
    const footprints = structures.buildings.map((b) => b.footprint);
    const road = structures.streets?.road;
    for (const t of trees) {
      expect(footprints.some((r) => within(r, t.x, t.z))).toBe(false);
      if (road !== undefined) expect(road[idx(t.x, t.z)]).not.toBe(1);
      for (const district of structures.districts) {
        const b = district.bounds;
        if (!within(b, t.x, t.z)) continue;
        const local = (t.z - b.z0) * (b.x1 - b.x0 + 1) + (t.x - b.x0);
        expect(district.carriageway[local]).not.toBe(1);
        expect(district.sidewalk[local]).not.toBe(1);
      }
    }
  });

  it("greens the survivors — vines over ruined ground", () => {
    let vines = 0;
    for (const [key, sample] of world) {
      if (sample.name !== "vine") continue;
      const [x, , z] = key.split(",").map(Number) as [number, number, number];
      if (ruinAt(x, z) > 0) vines++;
    }
    expect(vines).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §8 the bar                                                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* §2 the reach law                                                            */
/* -------------------------------------------------------------------------- */

describe("the reach law (§2)", () => {
  it("leaves a decline-free document with no field, no yard and no break-up", async () => {
    const control = doc() as { intent?: unknown };
    delete control.intent;
    const out = await mkdtemp(path.join(tmpdir(), "terrainist-ruins-control-"));
    try {
      const compiled = await compileTerrain(control, { outDir: path.join(out, "control") });
      expect(compiled.ok).toBe(true);
      const s = compiled.report.layout?.structures as StructurePassResult;
      // Every WP-4 mechanism hangs off the field, and the field is absent —
      // which is what makes "no decline, byte-identical" structural rather
      // than remembered.
      expect(s.ruinField).toBeUndefined();
      expect(s.streets?.broken).toBeUndefined();
      expect(s.stats.ruinYards).toBe(0);
      expect(s.stats.ruinFieldColumns).toBe(0);
      expect(s.stats.brokenStreetColumns).toBe(0);
      expect(s.stats.streetReclaimBlocks).toBe(0);
      expect((s.grounds?.lots ?? []).every((l) => l.treatment !== "ruin_yard")).toBe(true);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 900_000);
});

describe("physics (§8)", () => {
  it("lints zero on all 26 rules", () => {
    expect(physics.findings).toEqual([]);
    expect(PHYSICS_RULES.length).toBe(26);
  });
});
