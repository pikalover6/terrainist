/**
 * The settlement profile, end to end.
 *
 * Two claims, tested against compiled worlds rather than against the passes:
 *
 * 1. **Adding the profile moves nothing.** The same document under `terrain`
 *    and under `settlement`, with no structure nodes, has to come out
 *    identical — the settlement path is additive or it is a regression.
 * 2. **A settlement document builds and diagnoses honestly.** What the solver
 *    could not satisfy, and what a generator does not implement, is reported;
 *    nothing is silently dropped.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileTerrain } from "../src/terrain/compile.js";
import type { TerrainCompileReport } from "../src/terrain/compile.js";

const scratch: string[] = [];

/** The terrain half of the document, shared by both profiles. */
function terrainChildren(): unknown[] {
  return [
    {
      id: "terrain",
      kind: "generator",
      generator: "terrain.heightfield@0",
      params: { amplitude: 24, seaLevel: 63, baseHeight: 72}
    },
    { id: "climate", kind: "generator", generator: "terrain.climate@0", params: { forceTheme: "temperate" } },
    {
      id: "woods",
      kind: "generator",
      generator: "scatter.forest@0",
      params: {
        area: { all: true },
        density: 0.3,
        species: [{ id: "oak", weight: 1, shape: "oak_round" }]
      }
    }
  ];
}

function document(profile: "terrain" | "settlement", extras: unknown[] = []): Record<string, unknown> {
  return {
    loam: "0.1",
    profile,
    meta: { name: "hollow_dale", worldSeed: 90210 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [...terrainChildren(), ...extras]
    }
  };
}

/** The structures: a hall, two cottages, a plaza, and a road network. */
function structures(): unknown[] {
  return [
    {
      id: "town_hall",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [14, 10, 12] },
      params: { floors: 2, roof: "steep_gable" },
      constraints: [
        { zone: "center" },
        { clearance: 3 },
        { terrain_conform: "cut_fill", reference: "median" }
      ],
      ports: { main_door: { type: "door", face: "south" } },
      tags: ["civic"]
    },
    {
      id: "cottage_north",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [8, 7, 9] },
      params: { floors: 1 },
      constraints: [
        { zone: "north" },
        { distance: "town_hall", min: 6, max: 60 },
        { facing: "town_hall" }
      ],
      ports: { door: { type: "door", face: "south" } },
      tags: ["house"]
    },
    {
      id: "cottage_west",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [8, 7, 9] },
      params: { floors: 1 },
      constraints: [{ zone: "west" }, { distance: "#tag:house", min: 5 }],
      tags: ["house"],
      optional: true
    },
    { id: "plaza", kind: "primitive", envelope: { shape: "region", size: [20, 20] }, constraints: [{ adjacent_to: "town_hall", gap: [0, 2] }] },
    { id: "streets", kind: "generator", generator: "road.network@0", params: { anchors: ["town_hall", "#tag:house"] } }
  ];
}

async function compile(label: string, doc: Record<string, unknown>): Promise<TerrainCompileReport> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  const result = await compileTerrain(doc, { outDir: path.join(dir, "hollow_dale") });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return result.report;
}

let terrainOnly: TerrainCompileReport;
let asSettlement: TerrainCompileReport;
let settled: TerrainCompileReport;

beforeAll(async () => {
  terrainOnly = await compile("terrain", document("terrain"));
  asSettlement = await compile("as-settlement", document("settlement"));
  settled = await compile("settled", document("settlement", structures()));
}, 180_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("profile dispatch", () => {
  /**
   * The hard check the G4 brief asks for: adding the settlement profile must
   * not move a single block of a terrain-profile world. The same document under
   * both profiles, with no structures, has to come out identical.
   */
  it("leaves the terrain path byte-identical", () => {
    expect(asSettlement.stats).toEqual(terrainOnly.stats);
    expect(asSettlement.markers).toEqual(terrainOnly.markers);
    // `emit` carries the output paths, which differ by construction.
    const shape = (r: TerrainCompileReport): unknown => ({
      chunkCount: r.emit.chunkCount,
      blockCount: r.emit.blockCount,
      treeBlockCount: r.emit.treeBlockCount,
      decorBlockCount: r.emit.decorBlockCount,
      spawn: r.emit.spawn
    });
    expect(shape(asSettlement)).toEqual(shape(terrainOnly));
    expect(asSettlement.worldSeed).toBe(terrainOnly.worldSeed);
  });

  it("adds no solver report to a terrain-profile compile", () => {
    expect(terrainOnly.layout).toBeUndefined();
    // A structure-free settlement document runs the solver over nothing, which
    // must also change nothing.
    expect(asSettlement.layout?.placements ?? []).toEqual([]);
    expect(asSettlement.layout?.padEdits ?? []).toEqual([]);
  });
});

describe("settlement compile", () => {
  it("places every structure node and reports it", () => {
    const placements = settled.layout?.placements ?? [];
    expect(placements.map((p) => p.id).sort()).toEqual(["cottage_north", "cottage_west", "plaza", "town_hall"]);
    expect(settled.layout?.report.nodes.map((n) => n.nodePath).sort()).toEqual([
      "world.cottage_north",
      "world.cottage_west",
      "world.plaza",
      "world.town_hall"
    ]);
    for (const p of placements) {
      expect(p.footprint.x0).toBeGreaterThanOrEqual(-64);
      expect(p.footprint.x1).toBeLessThanOrEqual(63);
      expect([0, 90, 180, 270]).toContain(p.yaw);
    }
  });

  it("notes that road corridors are not built yet", () => {
    const note = settled.diagnostics.find((d) => d.code === "LOAM-T208");
    expect(note?.severity).toBe("note");
    expect(note?.nodePath).toBe("world.streets");
  });

  it("resolves ports for the road router to bind to", () => {
    const refs = (settled.layout?.ports ?? []).map((p) => p.ref).sort();
    // `cottage_west` declares no port and gets the profile's default south door.
    expect(refs).toEqual(["world.cottage_north#door", "world.cottage_west#door", "world.town_hall#main_door"]);
  });

  it("levels the ground under every structure", () => {
    const pads = settled.layout?.padEdits ?? [];
    expect(pads.map((p) => p.nodePath).sort()).toEqual([
      "world.cottage_north",
      "world.cottage_west",
      "world.plaza",
      "world.town_hall"
    ]);
    for (const pad of pads) expect(pad.apron).toBeGreaterThan(0);
  });

  it("compiles deterministically", async () => {
    const again = await compile("settled-2", document("settlement", structures()));
    expect(JSON.stringify(again.layout)).toBe(JSON.stringify(settled.layout));
    expect(again.stats).toEqual(settled.stats);
  });

  it("plants fewer trees than the same world without structures", () => {
    // The occupancy grid is what the scatter pass reads; this is its visible
    // consequence — the ground the buildings claim stops growing trees.
    expect(settled.stats.treeCount).toBeGreaterThan(0);
    expect(settled.stats.treeCount).toBeLessThan(asSettlement.stats.treeCount);
  });
});

/* -------------------------------------------------------------------------- */
/* constraints on a prop node                                                  */
/* -------------------------------------------------------------------------- */

describe("a constraint on prop.place@0", () => {
  it("is refused by the validator — a prop never reaches the layout solver", async () => {
    const doc = document("settlement", [
      ...structures(),
      {
        id: "market_cart",
        kind: "generator",
        generator: "prop.place@0",
        params: { prop: "cart", zone: "center" },
        constraints: [{ adjacent_to: "town_hall", gap: [0, 2] }, { clearance: 3 }]
      }
    ]);
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-prop-constraints-"));
    scratch.push(dir);
    const result = await compileTerrain(doc, { outDir: path.join(dir, "prop-constraints") });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const refused = result.diagnostics.find((d) => d.name === "CONSTRAINTS_NOT_ALLOWED" && d.nodePath === "world.market_cart");
    expect(refused?.severity).toBe("error");
    expect(refused?.fix).toContain("zone");
  });
});
