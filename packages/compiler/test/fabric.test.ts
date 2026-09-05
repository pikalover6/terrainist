/**
 * Fabric v2, F1 — the district: streets, blocks, lots, frontage.
 *
 * Three layers, and the split is the same one the underground tests use:
 *
 * 1. **The skeleton alone** — `buildStreetGraph` on a bare rectangle. Two runs
 *    from one seed agree cell for cell, and the grid is connected, which are
 *    the two properties every consumer downstream is entitled to assume.
 * 2. **The fabric pass** — `solveDistricts` against a flat synthetic field.
 *    Every geometric invariant that makes a district read as a city lives here:
 *    doors on sidewalks, facades on the build-to line, nothing overlapping
 *    anything, and coverage that actually tracks the declared density.
 * 3. **A compiled world**, read back off disk with every physics rule at zero.
 *    That last one is the only test that could catch the interesting failure —
 *    a tower founded in mid-air, a street cut through a facade, a doorstep onto
 *    a two-block drop — and it is the reason this file is slow.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  HeightField,
  centeredRegion,
  nodeSeed,
  type Region,
  BUILDING_ARCHETYPES,
  archetypeOfTags,
  archetypeFacadeDefaults
} from "@terrainist/stdlib";
import {
  KNOWN_BUILDING_ARCHETYPES,
  nearestArchetypes,
  validateSettlementDocument
} from "@terrainist/spec/ir";
import { HIGHRISE_ARCHETYPES } from "@terrainist/stdlib";
import { UNDERGROUND_ARCHETYPES } from "@terrainist/stdlib";
import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { compileArtifacts, compileTerrain, type TerrainCompileReport  } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import {
  buildStreetGraph,
  carriagewayCells,
  boundaryEndpoints,
  dressStreets,
  type StreetGraph
} from "../src/layout/streets.js";
import { solveDistricts, type DistrictPassResult } from "../src/layout/district.js";
import { yawFacing, seat } from "../src/layout/district-landmarks.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DISTRICT_BOUNDS: Rect = { x0: -80, z0: -80, x1: 79, z1: 79 };

function flatField(region: Region, height = 72): HeightField {
  const field = new HeightField(region);
  field.values.fill(height);
  return field;
}

/** The placement the layout solver would have produced for a district node. */
function districtPlacement(nodePath: string, bounds: Rect, y = 72): Placement {
  return {
    nodePath,
    id: nodePath.split(".").pop() as string,
    translation: [bounds.x0, y, bounds.z0],
    yaw: 0,
    mirror: false,
    size: [bounds.x1 - bounds.x0 + 1, 1, bounds.z1 - bounds.z0 + 1],
    footprint: bounds,
    anchor: {
      x: Math.floor((bounds.x0 + bounds.x1) / 2),
      z: Math.floor((bounds.z0 + bounds.z1) / 2)
    },
    foundationY: y
  };
}

/** A settlement document carrying exactly one district, for the pass tests. */
function districtDoc(params: Record<string, unknown>, children: unknown[] = []): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "fabric_fixture", worldSeed: 20260731 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 4, baseHeight: 76, seaLevel: 62, frequency: 0.004 }
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "downtown",
          kind: "district",
          envelope: { shape: "region", size: [160, 160] },
          params,
          constraints: [{ zone: "center" }, { terrain_conform: "flatten", reference: "median" }],
          children
        }
      ]
    }
  };
}

/** Run the fabric pass over a flat field, with no compiler around it. */
function layFabric(params: Record<string, unknown>, children: unknown[] = []): DistrictPassResult {
  const validated = validateSettlementDocument(districtDoc(params, children));
  const doc = validated.document;
  if (doc === undefined) {
    throw new Error(
      `fixture did not validate: ${validated.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  const region = centeredRegion(256, 256);
  return solveDistricts({
    doc,
    worldSeed: 20260731n,
    field: flatField(region),
    placements: [districtPlacement("world.downtown", DISTRICT_BOUNDS)]
  });
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
}

/** The carriageway columns of a graph, as `"x,z"` keys. */
function carriagewayKeys(graph: StreetGraph): Set<string> {
  return new Set(carriagewayCells(graph, DISTRICT_BOUNDS).map((c) => `${c.x},${c.z}`));
}

/* -------------------------------------------------------------------------- */
/* 1. the skeleton                                                             */
/* -------------------------------------------------------------------------- */

describe("the street skeleton", () => {
  const build = (fabric: "grid" | "organic", salt = ""): StreetGraph => {
    const result = buildStreetGraph({
      bounds: DISTRICT_BOUNDS,
      fabric,
      seed: nodeSeed(20260731n, "world.downtown", salt),
      blockSize: 34,
      sidewalk: 2
    });
    if (!result.ok) throw new Error(result.reason);
    return result.graph;
  };

  it("draws the same graph twice from the same seed", () => {
    for (const fabric of ["grid", "organic"] as const) {
      expect(JSON.stringify(build(fabric))).toBe(JSON.stringify(build(fabric)));
    }
  });

  it("draws a different graph from a different seed salt", () => {
    expect(JSON.stringify(build("organic"))).not.toBe(JSON.stringify(build("organic", "v2")));
  });

  it("keeps every street inside the district", () => {
    for (const fabric of ["grid", "organic"] as const) {
      for (const cell of carriagewayCells(build(fabric), DISTRICT_BOUNDS)) {
        expect(cell.x).toBeGreaterThanOrEqual(DISTRICT_BOUNDS.x0);
        expect(cell.x).toBeLessThanOrEqual(DISTRICT_BOUNDS.x1);
        expect(cell.z).toBeGreaterThanOrEqual(DISTRICT_BOUNDS.z0);
        expect(cell.z).toBeLessThanOrEqual(DISTRICT_BOUNDS.z1);
      }
    }
  });

  it("lays a 4-connected polyline: consecutive path cells are neighbours", () => {
    for (const fabric of ["grid", "organic"] as const) {
      for (const segment of build(fabric).segments) {
        for (let i = 1; i < segment.path.length; i++) {
          const a = segment.path[i - 1] as { x: number; z: number };
          const b = segment.path[i] as { x: number; z: number };
          expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("connects every segment to every other through its intersections", () => {
    for (const fabric of ["grid", "organic"] as const) {
      const graph = build(fabric);
      const ids = graph.segments.map((s) => s.id);
      const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
      for (const node of graph.intersections) {
        for (const a of node.segments) {
          for (const b of node.segments) {
            if (a !== b) (neighbours.get(a) as string[]).push(b);
          }
        }
      }
      const seen = new Set<string>([ids[0] as string]);
      const stack = [ids[0] as string];
      while (stack.length > 0) {
        for (const next of neighbours.get(stack.pop() as string) as string[]) {
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(next);
        }
      }
      expect(seen.size, `${fabric}: ${ids.length - seen.size} segments unreachable`).toBe(ids.length);
    }
  });

  it("ends every street on the district boundary, for the road pass to anchor to", () => {
    const graph = build("grid");
    // Two ends per segment, all of them on an edge.
    expect(boundaryEndpoints(graph, DISTRICT_BOUNDS)).toHaveLength(graph.segments.length * 2);
  });

  it("refuses a district too small to hold a fabric, and says what to change", () => {
    const tiny = buildStreetGraph({
      bounds: { x0: 0, z0: 0, x1: 29, z1: 29 },
      fabric: "grid",
      seed: nodeSeed(1n, "world.pocket", ""),
      blockSize: 34,
      sidewalk: 2
    });
    expect(tiny.ok).toBe(false);
    if (tiny.ok) return;
    expect(tiny.reason).toMatch(/at least/);
    expect(tiny.fix).toMatch(/envelope\.size/);
  });

  it("hands F4 a seam that does nothing yet", () => {
    const graph = build("grid");
    expect(() =>
      dressStreets(graph, {
        bounds: DISTRICT_BOUNDS,
        carriageway: new Uint8Array(160 * 160),
        sidewalk: new Uint8Array(160 * 160),
        seed: nodeSeed(1n, "world.downtown", "")
      }),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the fabric pass                                                          */
/* -------------------------------------------------------------------------- */

describe("the district fabric", () => {
  const HIGH = { fabric: "grid", density: "high", mix: ["office", "apartment_block", "shop_row"] };
  const LOW = { fabric: "grid", density: "low", mix: ["townhouse", "cottage"] };

  const LANDMARKS = [
    {
      id: "spire",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [21, 60, 15] },
      params: { archetype: "skyscraper", floors: 14 },
      ports: { door: { type: "door", face: "south" } },
      tags: ["landmark"]
    },
    {
      id: "gallery",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [15, 14, 13] },
      params: { archetype: "museum", floors: 2 },
      ports: { door: { type: "door", face: "south" } },
      tags: ["landmark"]
    }
  ];

  it("produces a real placement, node and a door port per way in", () => {
    const laid = layFabric(HIGH, LANDMARKS);
    expect(laid.districts).toHaveLength(1);
    expect(laid.placements.length).toBeGreaterThan(20);
    expect(laid.nodes).toHaveLength(laid.placements.length);
    for (const node of laid.nodes) expect(node.generator).toBe("building.grammar@0");
    // One door port per *door*, not per building. A terrace is one node with a
    // door per bay, and every one of them has to be declared or the doorstep
    // pass leaves it with a one-block step — which is a jump, not a threshold.
    const doors = laid.ports.filter((p) => p.type === "door");
    expect(doors.length).toBeGreaterThanOrEqual(laid.placements.length);
    const byPath = new Map<string, number>();
    for (const port of doors) byPath.set(port.nodePath, (byPath.get(port.nodePath) ?? 0) + 1);
    expect(byPath.size).toBe(laid.placements.length);
    for (const placement of laid.placements) {
      const count = byPath.get(placement.nodePath) ?? 0;
      const bays = laid.params.get(placement.nodePath)?.["bays"];
      if (Array.isArray(bays)) expect(count, placement.nodePath).toBe(bays.length);
      else expect(count, placement.nodePath).toBe(1);
    }
  });

  it("puts every door on a sidewalk column beside its own street", () => {
    const laid = layFabric(HIGH, LANDMARKS);
    const district = laid.districts[0];
    if (district === undefined) throw new Error("no district");
    const grid = (x: number, z: number): number => {
      const i = x - district.bounds.x0;
      const j = z - district.bounds.z0;
      const w = district.bounds.x1 - district.bounds.x0 + 1;
      const d = district.bounds.z1 - district.bounds.z0 + 1;
      return i < 0 || j < 0 || i >= w || j >= d ? -1 : j * w + i;
    };
    const carriage = carriagewayKeys(district.streets);

    for (const port of laid.ports) {
      if (port.type !== "door") continue;
      const x = port.position[0] + port.outwardNormal[0];
      const z = port.position[2] + port.outwardNormal[2];
      const k = grid(x, z);
      expect(k, `${port.ref} steps outside the district`).toBeGreaterThanOrEqual(0);
      expect(district.sidewalk[k], `${port.ref} at ${x},${z} is not on a sidewalk`).toBe(1);
      // …and the sidewalk it stands on is one band off a carriageway.
      let found = false;
      for (let r = 1; r <= district.streets.sidewalk; r++) {
        for (const [dx, dz] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r]
        ]) {
          if (carriage.has(`${x + (dx as number)},${z + (dz as number)}`)) found = true;
        }
      }
      expect(found, `${port.ref} is on a sidewalk with no street beside it`).toBe(true);
    }
  });

  it("never overlaps two buildings", () => {
    const laid = layFabric(HIGH, LANDMARKS);
    for (let a = 0; a < laid.placements.length; a++) {
      for (let b = a + 1; b < laid.placements.length; b++) {
        const p = laid.placements[a] as Placement;
        const q = laid.placements[b] as Placement;
        expect(
          overlaps(p.footprint, q.footprint),
          `${p.nodePath} overlaps ${q.nodePath}`,
        ).toBe(false);
      }
    }
  });

  it("never builds on a carriageway or a sidewalk", () => {
    const laid = layFabric(HIGH, LANDMARKS);
    const district = laid.districts[0];
    if (district === undefined) throw new Error("no district");
    const w = district.bounds.x1 - district.bounds.x0 + 1;
    for (const placement of laid.placements) {
      for (let z = placement.footprint.z0; z <= placement.footprint.z1; z++) {
        for (let x = placement.footprint.x0; x <= placement.footprint.x1; x++) {
          const k = (z - district.bounds.z0) * w + (x - district.bounds.x0);
          expect(district.carriageway[k], `${placement.nodePath} stands in the road`).toBe(0);
          expect(district.sidewalk[k], `${placement.nodePath} stands on the pavement`).toBe(0);
        }
      }
    }
  });

  it("fills only from the declared mix, and leaves the landmarks their own", () => {
    const laid = layFabric(HIGH, LANDMARKS);
    let fromMix = 0;
    for (const [nodePath, params] of laid.params) {
      if (nodePath.includes(".infill_")) {
        fromMix++;
        expect(HIGH.mix).toContain(params["archetype"]);
        continue;
      }
      if (nodePath.includes(".terrace_")) {
        // A terrace is one node of many buildings, so the mix steers its
        // *bays*. Every one of them still comes from the declared list.
        expect(params["archetype"]).toBe("terrace");
        const bays = params["bays"] as readonly { archetype?: string }[];
        expect(Array.isArray(bays)).toBe(true);
        for (const bay of bays) {
          fromMix++;
          expect(HIGH.mix).toContain(bay.archetype);
        }
        continue;
      }
      // A landmark keeps whatever the document gave it.
      expect(["skyscraper", "museum"]).toContain(params["archetype"]);
    }
    expect(fromMix).toBeGreaterThan(20);
  });

  it("builds more of a high-density envelope than a low-density one", () => {
    const high = layFabric(HIGH);
    const low = layFabric(LOW);
    const dense = high.districts[0]?.stats;
    const sparse = low.districts[0]?.stats;
    if (dense === undefined || sparse === undefined) throw new Error("no district");
    // Share of the parcels the fabric built on, however it built on them: a
    // terrace claims whole runs of lots, so counting only the per-lot infill
    // stopped being a measure of density the moment the street wall landed.
    const built = (d: typeof dense): number => (d.infill + d.terraceLots) / d.lots;
    expect(built(dense)).toBeGreaterThan(0.8);
    expect(built(sparse)).toBeLessThan(0.5);
    expect(built(dense)).toBeGreaterThan(built(sparse));
    // ...and the *way* it built on them differs, which is the point: downtown
    // is a street wall, the village is detached houses.
    expect(dense.terraces).toBeGreaterThan(0);
    expect(sparse.terraces).toBe(0);
  });

  it("gives a high-density district a tall skyline and a low-density one a low roofline", () => {
    const high = layFabric(HIGH);
    const low = layFabric(LOW);
    const tallest = (r: DistrictPassResult): number =>
      Math.max(...r.placements.map((p) => p.size[1]));
    expect(tallest(high)).toBeGreaterThan(tallest(low));
  });

  it("gives the biggest landmark the lot it needs, in the same place every run", () => {
    const first = layFabric(HIGH, LANDMARKS);
    const second = layFabric(HIGH, LANDMARKS);
    const spire = (r: DistrictPassResult): Placement =>
      r.placements.find((p) => p.nodePath === "world.downtown.spire") as Placement;
    expect(spire(first)).toBeDefined();
    expect(JSON.stringify(spire(first))).toBe(JSON.stringify(spire(second)));
    // The landmark is placed before the infill: nothing else got its ground.
    const claimed = spire(first).footprint;
    for (const other of first.placements) {
      if (other.nodePath === "world.downtown.spire") continue;
      expect(overlaps(claimed, other.footprint)).toBe(false);
    }
  });

  it("lays the whole fabric identically twice", () => {
    expect(JSON.stringify(layFabric(HIGH, LANDMARKS).placements)).toBe(
      JSON.stringify(layFabric(HIGH, LANDMARKS).placements),
    );
  });

  it("reserves a central block when the author asks for a square", () => {
    const withSquare = layFabric({ ...HIGH, plaza: true });
    expect(withSquare.districts[0]?.stats.plazaLots).toBeGreaterThan(0);
  });

  it("says so when a landmark is too big for any lot", () => {
    const laid = layFabric(HIGH, [
      {
        ...(LANDMARKS[0] as Record<string, unknown>),
        id: "colossus",
        envelope: { shape: "box", size: [120, 40, 120] }
      }
    ]);
    expect(laid.diagnostics.map((d) => d.name)).toContain("CANNOT_FIT");
    expect(laid.districts[0]?.stats.landmarksUnplaced).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* seating arithmetic                                                          */
/* -------------------------------------------------------------------------- */

describe("frontage seating", () => {
  it("turns a node's front face onto its street", () => {
    expect(yawFacing("south", "south")).toBe(0);
    expect(yawFacing("south", "west")).toBe(90);
    expect(yawFacing("south", "north")).toBe(180);
    expect(yawFacing("south", "east")).toBe(270);
  });

  it("puts the facade on the build-to line and centres the rest", () => {
    const lot: Rect = { x0: 0, z0: 0, x1: 15, z1: 19 };
    expect(seat(lot, "north", 10, 12)).toEqual({ x0: 3, z0: 0, x1: 12, z1: 11 });
    expect(seat(lot, "south", 10, 12)).toEqual({ x0: 3, z0: 8, x1: 12, z1: 19 });
    expect(seat(lot, "west", 12, 10)).toEqual({ x0: 0, z0: 5, x1: 11, z1: 14 });
    expect(seat(lot, "east", 12, 10)).toEqual({ x0: 4, z0: 5, x1: 15, z1: 14 });
  });
});

/* -------------------------------------------------------------------------- */
/* the archetype vocabulary                                                    */
/* -------------------------------------------------------------------------- */

describe("the mix vocabulary", () => {

  it("suggests the near-misses an author actually types", () => {
    expect(KNOWN_BUILDING_ARCHETYPES).toContain("apartment_block");
    expect(nearestArchetypes("apartment")).toContain("apartment_block");
    expect(nearestArchetypes("offices")).toContain("office");
    expect(nearestArchetypes("townhous")).toContain("townhouse");
  });

  it("rejects an unknown mix name with those suggestions attached", () => {
    const bad = validateSettlementDocument(
      districtDoc({ fabric: "grid", density: "high", mix: ["offise"] }),
    );
    const found = bad.diagnostics.find((d) => d.name === "DISTRICT_PARAM");
    expect(found?.severity).toBe("error");
    expect(found?.fix).toContain("office");
  });

  it("accepts a well-formed district", () => {
    const good = validateSettlementDocument(
      districtDoc({ fabric: "organic", density: "medium", mix: ["townhouse"] }),
    );
    expect(good.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(good.document).toBeDefined();
  });

  it("BUILDING_ARCHETYPES still equals KNOWN_BUILDING_ARCHETYPES in exact public order", () => {
    // Public order is load-bearing; descriptor-derived BUILDING_ARCHETYPES must not reorder.
    // Pre-phase BUILDING_ARCHETYPES was `= KNOWN_BUILDING_ARCHETYPES` with no freeze — see b92079d `structures/archetypes.ts`.
    expect([...BUILDING_ARCHETYPES]).toEqual([...KNOWN_BUILDING_ARCHETYPES]);
  });

  it("every archetype is accepted as a district mix value, and no archetype is lost", () => {
    for (const archetype of BUILDING_ARCHETYPES) {
      const ok = validateSettlementDocument(
        districtDoc({ fabric: "grid", density: "high", mix: [archetype] }),
      );
      expect(
        ok.diagnostics.filter((d) => d.severity === "error"),
        `mix "${archetype}" rejected`,
      ).toEqual([]);
    }
    // Exhaustiveness: every KNOWN archetype appears in BUILDING_ARCHETYPES set
    expect(new Set(BUILDING_ARCHETYPES)).toEqual(new Set(KNOWN_BUILDING_ARCHETYPES));
  });

  it("archetypeOfTags respects historical chain priority — descriptor tag order, not spec ID order", () => {
    // Highrise before watchtower: tower_block is highrise, bare tower is watchtower
    expect(archetypeOfTags(["tower_block"])).toBe("skyscraper");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["high_rise"])).toBe("skyscraper");
    // Underground before watchtower: mineshaft is not a tower
    expect(archetypeOfTags(["mineshaft"])).toBe("mine_head");
    // Blitz vs extended: keep/castle before generic — b92079d `blitzArchetypeOfTags` maps `castle` → `keep`
    expect(archetypeOfTags(["keep"])).toBe("keep");
    expect(archetypeOfTags(["castle"])).toBe("keep");
    // Facade defaults delegate directly — sample a highrise and a watchtower
    const highFacade = archetypeFacadeDefaults("skyscraper");
    const watchFacade = archetypeFacadeDefaults("watchtower");
    expect(highFacade).toBeDefined();
    expect(watchFacade).toBeDefined();
  });

  it("special dispatch archetypes are still distinct — highrise/terrace/watchtower/underground", () => {
    for (const id of HIGHRISE_ARCHETYPES) expect(archetypeOfTags([id])).toBe(id);
    for (const id of UNDERGROUND_ARCHETYPES) expect(archetypeOfTags([id])).toBe(id);
    // `terrace` is not tag-routable — b92079d `TERRACE_ARCHETYPES` deliberately claims no tags;
    // `terrace` tag maps to residential `terraced_row` (see b92079d `residentialArchetypeOfTags`)
    expect(archetypeOfTags(["terrace"])).toBe("terraced_row");
    expect(archetypeOfTags(["terraced_row"])).toBe("terraced_row");
    expect(archetypeOfTags(["watchtower"])).toBe("watchtower");
    expect(archetypeOfTags(["lookout"])).toBe("watchtower");
  });
});

/* -------------------------------------------------------------------------- */
/* 2b. the street wall                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The terrace pass — U2.
 *
 * The fabric's answer to "buildings are also often touching each other". At
 * `high` the default for a run of consecutive lots on one block face is a
 * *terrace*, not N detached shells at zero spacing; at `medium` it is shorter
 * runs with real gaps; at `low` it never happens at all.
 *
 * What is asserted here is the layout side of that: which lots a terrace
 * claims, that it claims each of them exactly once, that its bays come from the
 * mix, that its door ports land where the grammar's doors are, and that none of
 * it moves when something else in the district does. The geometry of the run
 * itself — the party wall, the cornice, the shopfront — is
 * `stdlib/test/terrace.test.ts`.
 */
describe("the street wall", () => {
  const HIGH_WALL = { fabric: "grid", density: "high", mix: ["office", "apartment_block", "shop_row"] };
  const MED_WALL = { fabric: "grid", density: "medium", mix: ["townhouse", "shop_row"] };
  const LOW_WALL = { fabric: "grid", density: "low", mix: ["townhouse", "cottage"] };

  const LANDMARKS_HERE = [
    {
      id: "spire",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [21, 60, 15] },
      params: { archetype: "skyscraper", floors: 14 },
      ports: { door: { type: "door", face: "south" } },
      tags: ["landmark"]
    }
  ];

  const terracesOf = (laid: DistrictPassResult): Placement[] =>
    laid.placements.filter((p) => p.nodePath.includes(".terrace_"));

  it("makes the street wall the default downtown and never builds one in a village", () => {
    const high = layFabric(HIGH_WALL).districts[0]?.stats;
    const medium = layFabric(MED_WALL).districts[0]?.stats;
    const low = layFabric(LOW_WALL).districts[0]?.stats;
    if (high === undefined || medium === undefined || low === undefined) throw new Error("no district");
    expect(high.terraces).toBeGreaterThan(5);
    expect(high.terraceBays).toBeGreaterThan(high.terraces * 2);
    // Downtown, almost every parcel is part of a run.
    expect(high.terraceLots / high.lots).toBeGreaterThan(0.5);
    expect(high.infill).toBeLessThan(high.terraceLots);
    // A row-house quarter still has terraces, and still has gaps between them.
    expect(medium.terraces).toBeGreaterThan(0);
    expect(medium.infill).toBeGreaterThan(0);
    // A village is detached houses in gardens.
    expect(low.terraces).toBe(0);
    expect(low.terraceBays).toBe(0);
  });

  it("claims each lot once: a terrace's ground is nobody else's", () => {
    const laid = layFabric(HIGH_WALL, LANDMARKS_HERE);
    for (const a of laid.placements) {
      for (const b of laid.placements) {
        if (a === b) continue;
        expect(
          overlaps(a.footprint, b.footprint),
          `${a.nodePath} overlaps ${b.nodePath}`,
        ).toBe(false);
      }
    }
  });

  it("declares one door port per bay, at the column the grammar puts a door in", () => {
    const laid = layFabric(HIGH_WALL);
    const terraces = terracesOf(laid);
    expect(terraces.length).toBeGreaterThan(5);
    for (const placement of terraces) {
      const params = laid.params.get(placement.nodePath) as Record<string, unknown>;
      const bays = params["bays"] as readonly { width: number; floors: number }[];
      const ports = laid.ports.filter((p) => p.nodePath === placement.nodePath);
      expect(ports, placement.nodePath).toHaveLength(bays.length);
      for (const port of ports) {
        expect(port.type).toBe("door");
        // Resolved onto the building's own footprint, on the street side.
        expect(port.position[0]).toBeGreaterThanOrEqual(placement.footprint.x0);
        expect(port.position[0]).toBeLessThanOrEqual(placement.footprint.x1);
        expect(port.position[2]).toBeGreaterThanOrEqual(placement.footprint.z0);
        expect(port.position[2]).toBeLessThanOrEqual(placement.footprint.z1);
      }
      // Every door is a different column: two ports on one leaf would mean the
      // planner and the port table disagree about where the bays are.
      const columns = new Set(ports.map((p) => `${p.position[0]},${p.position[2]}`));
      expect(columns.size, placement.nodePath).toBe(bays.length);
    }
  });

  it("sizes the envelope to hold the parapet the grammar builds over it", () => {
    const laid = layFabric(HIGH_WALL);
    for (const placement of terracesOf(laid)) {
      const params = laid.params.get(placement.nodePath) as Record<string, unknown>;
      const bays = params["bays"] as readonly { floors: number }[];
      const tallest = bays.reduce((m, b) => Math.max(m, b.floors), 1);
      const floorHeight = params["floorHeight"] as number;
      expect(placement.size[1]).toBeGreaterThan(tallest * floorHeight);
    }
  });

  it("is positional: a landmark elsewhere leaves the rest of the street alone", () => {
    // The invariant the whole pass is written around. Adding a building to the
    // document may take the lots it stands on out of a run — that is what a
    // landmark is — but every terrace it did not touch has to come out
    // byte-identical, because its bays, heights and materials are hashes of its
    // own start column and not of a counter.
    const bare = layFabric(HIGH_WALL);
    const withLandmark = layFabric(HIGH_WALL, LANDMARKS_HERE);
    const index = (r: DistrictPassResult): Map<string, string> =>
      new Map(
        r.placements
          .filter((p) => p.nodePath.includes(".terrace_"))
          .map((p) => [p.nodePath, JSON.stringify([p, r.params.get(p.nodePath)])]),
      );
    const before = index(bare);
    const after = index(withLandmark);
    let shared = 0;
    for (const [path, snapshot] of after) {
      const was = before.get(path);
      if (was === undefined) continue; // a run the landmark broke: expected.
      shared++;
      expect(snapshot, path).toBe(was);
    }
    expect(shared, "the landmark did not leave any terrace untouched").toBeGreaterThan(5);
  });

  it("lays the same street wall twice", () => {
    const a = layFabric(HIGH_WALL, LANDMARKS_HERE);
    const b = layFabric(HIGH_WALL, LANDMARKS_HERE);
    expect(JSON.stringify([...a.params])).toBe(JSON.stringify([...b.params]));
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the compiled world                                                       */
/* -------------------------------------------------------------------------- */

describe("a district, compiled", () => {
  let root: string;
  let dir: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let stack: PrismarineStack;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-fabric-"));
    dir = path.join(root, "downtown");
    const doc = districtDoc(
      { fabric: "grid", density: "high", mix: ["office", "shop_row", "apartment_block"], plaza: true },
      [
        {
          id: "spire",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [19, 56, 15] },
          params: { archetype: "skyscraper", floors: 13 },
          ports: { door: { type: "door", face: "south" } },
          tags: ["landmark"]
        }
      ],
    );
    const art_compiled = await compileArtifacts(doc, {});
  if (!art_compiled.ok) throw new Error(art_compiled.diagnostics.map((d) => d.name).join(", "));
  plan = art_compiled.artifacts.plan;
  const compiled = await compileTerrain(doc, { outDir: dir });
    if (!compiled.ok) {
      throw new Error(
        `fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: structures.buildings as never,
      roads: (structures.roads?.routes ?? []) as never,
      tunnels: [],
      terrainTop: {
        x0: plan.region.x0,
        z0: plan.region.z0,
        width: plan.region.width,
        depth: plan.region.depth,
        ground: plan.ground,
        entrances: new Uint8Array(plan.region.width * plan.region.depth)
      }
    });
  }, 600_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("compiles without a single error diagnostic", () => {
    expect(report.diagnostics.filter((d) => d.severity === "error").map((d) => d.message)).toEqual([]);
  });

  it("publishes the street graph as a layout product", () => {
    const districts = report.layout?.districts;
    expect(districts).toBeDefined();
    expect(districts).toHaveLength(1);
    const graph = (districts as NonNullable<typeof districts>)[0]?.streets as StreetGraph;
    expect(graph.segments.length).toBeGreaterThan(3);
    expect(graph.sidewalk).toBe(2);
  });

  it("builds a block of city, not a lawn with a tower on it", () => {
    const stats = report.stats.structures;
    expect(stats?.districts).toBe(1);
    expect(stats?.districtBuildings).toBeGreaterThan(20);
    expect(stats?.streetColumns).toBeGreaterThan(1000);
  });

  it("finds nothing wrong under any physics rule", () => {
    expect(
      physics.findings
        .slice(0, 12)
        .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
        .join("\n"),
    ).toBe("");
    for (const rule of PHYSICS_RULES) {
      expect(physics.counts[rule], rule).toBe(0);
    }
  });
});
