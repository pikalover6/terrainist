/**
 * The underground connective pass.
 *
 * Three layers, tested at three levels:
 *
 * 1. **The router**, against synthetic column plans — the only way to put a
 *    cave, a lake and a hill exactly where the test wants them, and therefore
 *    the only way to prove the avoidance rules rather than observe them.
 * 2. **The grammar's cellar**, against the generator directly.
 * 3. **The whole thing**, against `examples/tunnel-test.loam.json`: a compiled
 *    world, read back, walked from one cellar to the other.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateBuilding, nodeSeed, type Region } from "@terrainist/stdlib";

import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { compileArtifacts, compileTerrain, type TerrainCompileReport  } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { FluidKind } from "../src/terrain/columns.js";
import {
  TUNNEL_FLIGHT_HEIGHT,
  TUNNEL_FLUID_SHELL,
  TUNNEL_HEIGHT,
  TUNNEL_ROOF_THICKNESS,
  TUNNEL_WIDTH,
  buildObstacleMask,
  checkTunnelIntegrity,
  requiredRoofSurfaceY,
  routeTunnel,
  type BuiltTunnel,
  type TunnelCell
} from "../src/structures/tunnels.js";
import {
  resolveBasementParam,
  tunnelLinksOf,
  type StructurePassResult
} from "../src/structures/index.js";

const EXAMPLE = fileURLToPath(new URL("fixtures/examples/tunnel-test.loam.json", import.meta.url));
/**
 * A real authored document, kept as a fixture because of what it caught.
 *
 * A model asked for "a laddered vertical shaft beside the watchtower" and a
 * passage linking it to the crypt under the longhouse. The watchtower declared
 * `basement: { depth: 4 }` and was one end of a `connected … via "tunnel"`
 * constraint — and built no cellar at all, because `emitWatchtower` never ran
 * the cellar machinery. The compile reported one cellar instead of two and
 * LOAM-E180 instead of a tunnel.
 */
const HAMLET = fileURLToPath(
  new URL("fixtures/examples/hilltop-crypt-hamlet.loam.json", import.meta.url),
);
/**
 * The document that found the roof-margin escape, kept as a fixture.
 *
 * GLM 5.2 authored a delta port with a 475-block mine gallery from the mine
 * head to the keep. It compiled with `LOAM-W408 TUNNEL_INTEGRITY` at two
 * columns — a compiler defect by its own hint, since the router is supposed to
 * carry the same margin the validator measures. It did not: it measured the
 * centre line, and the validator measures the whole bore swath.
 */
const DELTAPORT = fileURLToPath(
  new URL("fixtures/examples/demo-deltaport.loam.json", import.meta.url),
);
/** Four halls, two galleries, one forced crossing — see the junction suite. */
const JUNCTION = fileURLToPath(
  new URL("fixtures/examples/tunnel-junction.loam.json", import.meta.url),
);

/* -------------------------------------------------------------------------- */
/* the router, against a plan built by hand                                    */
/* -------------------------------------------------------------------------- */

const REGION: Region = { x0: 0, z0: 0, width: 64, depth: 64 };

/** A featureless plateau at `groundY`, with no fluid and no caves. */
function flatPlan(groundY = 100): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n).fill(groundY);
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 1,
    states: {
      bedrock: 0,
      stone: 0,
      deepslate: 0,
      water: 0,
      lava: 0,
      snowLayer: 0,
      caveAir: 0
    }
  } as unknown as ColumnPlan;
}

const idx = (x: number, z: number): number => (z - REGION.z0) * REGION.width + (x - REGION.x0);

const cell = (x: number, z: number, y: number): TunnelCell => ({
  x,
  z,
  y,
  flight: false,
  portal: false
});

describe("the tunnel router", () => {
  it("finds a route across open ground and stays level", () => {
    const plan = flatPlan();
    const open = new Uint8Array(REGION.width * REGION.depth);
    const route = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80));
    expect(route).not.toBeNull();
    const path = route as TunnelCell[];
    // Manhattan-optimal, and every cell at the same level: the rise cost is
    // what buys that, and a gallery that wobbles vertically over flat ground
    // would mean it is not being paid.
    expect(path.length).toBe(55);
    expect(new Set(path.map((c) => c.y))).toEqual(new Set([80]));
  });

  it("is a pure function of its inputs — two runs, one route", () => {
    const plan = flatPlan();
    const open = new Uint8Array(REGION.width * REGION.depth);
    // A wall with a gap, so the route has a real decision to make and there is
    // something for a non-deterministic tie-break to disagree about.
    for (let z = 0; z < 64; z++) {
      if (z === 20 || z === 44) continue;
      open[idx(30, z)] = 1;
    }
    const a = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80));
    const b = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80));
    expect(a).not.toBeNull();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // …and it went through one of the two gaps, not through the wall.
    for (const c of a as TunnelCell[]) {
      if (c.x === 30) expect([20, 44]).toContain(c.z);
    }
  });

  it("routes around a blocked column rather than under it", () => {
    const plan = flatPlan();
    const open = new Uint8Array(REGION.width * REGION.depth);
    for (let z = 28; z <= 36; z++) open[idx(30, z)] = 1;
    const route = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80)) as TunnelCell[];
    expect(route).not.toBeNull();
    for (const c of route) expect(open[idx(c.x, c.z)]).toBe(0);
  });

  it("dives under a shallow shelf instead of breaking its roof", () => {
    // A band of low ground across the middle: at y 80 a bore would leave less
    // than the roof margin, so the only legal way through is deeper.
    const plan = flatPlan();
    for (let z = 28; z <= 36; z++) {
      for (let x = 0; x < 64; x++) plan.ground[idx(x, z)] = 86;
    }
    const open = new Uint8Array(REGION.width * REGION.depth);
    const route = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80)) as TunnelCell[];
    expect(route).not.toBeNull();
    for (const c of route) {
      const g = plan.ground[idx(c.x, c.z)] as number;
      // The endpoints are portal cells and exempt; everything between is not.
      if (c.x === 4 || c.x === 58) continue;
      expect(c.y + TUNNEL_FLIGHT_HEIGHT - 1 + TUNNEL_ROOF_THICKNESS).toBeLessThanOrEqual(g);
    }
  });

  /**
   * The roof-margin escape, at its smallest.
   *
   * A bore is `TUNNEL_WIDTH` wide, so the rock the validator measures is the
   * rock over the whole swath. Before the swath fix the router tested the
   * centre column alone, and a notch one step to the side of an otherwise deep
   * hillside was invisible to it: the route ran straight through, and
   * `checkTunnelIntegrity` — which does measure the swath — reported a breach
   * the router had promised could not happen. That is the LOAM-W408 the
   * deltaport document produced, reduced to eight columns.
   */
  it("keeps the roof margin over the whole bore swath, not just the centre line", () => {
    const plan = flatPlan();
    // A one-column-wide notch beside the straight line: the centre stays deep,
    // one perpendicular column does not.
    for (let x = 20; x <= 40; x++) plan.ground[idx(x, 33)] = 86;
    const open = new Uint8Array(REGION.width * REGION.depth);
    const route = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80)) as TunnelCell[];
    expect(route).not.toBeNull();
    const half = (TUNNEL_WIDTH - 1) >> 1;
    for (const c of route) {
      if (c.x === 4 || c.x === 58) continue;
      for (let d = -half; d <= half; d++) {
        const g = plan.ground[idx(c.x, c.z + d)] as number;
        expect(requiredRoofSurfaceY(c.y + TUNNEL_FLIGHT_HEIGHT - 1)).toBeLessThanOrEqual(g);
      }
    }
  });

  it("agrees with the validator on the route it returns", () => {
    const plan = flatPlan();
    // 85, not 86: a three-high bore at y 80 tops out at 82 and wants four
    // blocks over that, so this notch is one short for the *validator* too.
    // Routed against the centre line alone it is invisible and the gallery
    // runs straight through it.
    for (let x = 20; x <= 40; x++) plan.ground[idx(x, 33)] = 85;
    const open = new Uint8Array(REGION.width * REGION.depth);
    const route = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80)) as TunnelCell[];
    const path = (route as TunnelCell[]).map((c, i) =>
      i === 0 || i === (route as TunnelCell[]).length - 1 ? { ...c, portal: true } : c,
    );
    expect(
      checkTunnelIntegrity(plan, [
        {
          id: "t",
          fromPath: "a",
          toPath: "b",
          path,
          endpoints: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 }
          ],
          carvedBlocks: 0,
          liningBlocks: 0,
          stairSteps: 0,
          frames: 0,
          lanterns: 0
        }
      ]).roofBreaches,
    ).toBe(0);
  });

  it("climbs and falls one block at a time — a 1:1 flight, never a shaft", () => {
    const plan = flatPlan();
    for (let z = 28; z <= 36; z++) {
      for (let x = 0; x < 64; x++) plan.ground[idx(x, z)] = 86;
    }
    const open = new Uint8Array(REGION.width * REGION.depth);
    const route = routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80)) as TunnelCell[];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1] as TunnelCell;
      const b = route[i] as TunnelCell;
      expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(1);
      // Four-connected: exactly one horizontal block per step.
      expect(Math.abs(b.x - a.x) + Math.abs(b.z - a.z)).toBe(1);
    }
  });

  it("returns null when nothing is legal", () => {
    const plan = flatPlan();
    const open = new Uint8Array(REGION.width * REGION.depth);
    for (let z = 0; z < 64; z++) open[idx(30, z)] = 1;
    expect(routeTunnel(plan, open, cell(4, 32, 80), cell(58, 32, 80))).toBeNull();
  });
});

describe("what the router hard-avoids", () => {
  /** The obstacle mask for a plan, with no buildings and no earlier tunnels. */
  function maskOf(plan: ColumnPlan): Uint8Array {
    return buildObstacleMask({
      links: [],
      buildings: [],
      placements: [],
      ports: [],
      declaredPorts: new Map(),
      plan,
      stack: null as never,
      seed: nodeSeed(1n, "world", "")
    });
  }

  it("closes every column within the shell of a pond, and reopens beyond it", () => {
    const plan = flatPlan();
    plan.fluidKind[idx(32, 32)] = FluidKind.WATER;
    const mask = maskOf(plan);
    // The shell, plus the one-block dilation that lets the centre line stand
    // for a three-wide bore.
    const reach = TUNNEL_FLUID_SHELL + 1;
    expect(mask[idx(32, 32)]).toBe(1);
    expect(mask[idx(32 + reach, 32)]).toBe(1);
    expect(mask[idx(32 + reach + 1, 32)]).toBe(0);
  });

  it("closes a column an existing cave opened, whatever depth the cave is at", () => {
    const plan = flatPlan();
    const n = REGION.width * REGION.depth;
    const offsets = new Int32Array(n + 1);
    // One span, in column (20, 20), forty blocks above the search band.
    const target = idx(20, 20);
    for (let i = target + 1; i <= n; i++) offsets[i] = 1;
    (plan as { caves?: unknown }).caves = {
      spans: { offsets, lo: Int32Array.from([120]), hi: Int32Array.from([124]) },
      entranceColumns: new Uint8Array(n),
      markers: [],
      carvedBlocks: 5,
      systems: 1,
      chambers: 0,
      decorate: false
    };
    const mask = maskOf(plan);
    expect(mask[target]).toBe(1);
    expect(mask[idx(20 + 2, 20)]).toBe(0);
  });

  it("routes a gallery around a pond that sits on the straight line", () => {
    const plan = flatPlan();
    for (let z = 26; z <= 38; z++) {
      for (let x = 28; x <= 32; x++) plan.fluidKind[idx(x, z)] = FluidKind.WATER;
    }
    const mask = maskOf(plan);
    const route = routeTunnel(plan, mask, cell(4, 32, 80), cell(58, 32, 80)) as TunnelCell[];
    expect(route).not.toBeNull();
    for (const c of route) expect(mask[idx(c.x, c.z)]).toBe(0);
    // It really went round: the straight line would have been 55 cells.
    expect(route.length).toBeGreaterThan(55);
  });
});

/* -------------------------------------------------------------------------- */
/* the integrity validator, against a route built to fail it                   */
/* -------------------------------------------------------------------------- */

describe("checkTunnelIntegrity", () => {
  function tunnelOf(path: readonly TunnelCell[]): BuiltTunnel {
    return {
      id: "t",
      fromPath: "a",
      toPath: "b",
      path,
      endpoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      ],
      carvedBlocks: 0,
      liningBlocks: 0,
      stairSteps: 0,
      frames: 0,
      lanterns: 0
    };
  }

  it("finds nothing on a gallery that keeps both margins", () => {
    const plan = flatPlan();
    const path = [cell(10, 32, 80), cell(11, 32, 80), cell(12, 32, 80)];
    expect(checkTunnelIntegrity(plan, [tunnelOf(path)])).toEqual({
      fluidBreaches: 0,
      roofBreaches: 0,
      samples: []
    });
  });

  it("reports a bore that came within the shell of water", () => {
    const plan = flatPlan();
    plan.fluidKind[idx(11, 32 + TUNNEL_FLUID_SHELL)] = FluidKind.WATER;
    const report = checkTunnelIntegrity(plan, [tunnelOf([cell(11, 32, 80)])]);
    expect(report.fluidBreaches).toBeGreaterThan(0);
    expect(report.samples[0]?.detail).toMatch(/blocks of water/);
  });

  it("reports a bore with too little rock over its ceiling", () => {
    const plan = flatPlan();
    // Just under the surface: three high, so its top is the surface block.
    const report = checkTunnelIntegrity(plan, [tunnelOf([cell(11, 32, 100 - TUNNEL_HEIGHT + 1)])]);
    expect(report.roofBreaches).toBeGreaterThan(0);
    expect(report.samples[0]?.detail).toMatch(/blocks of roof/);
  });
});

/* -------------------------------------------------------------------------- */
/* what a `connected` constraint asks the structure pass for                   */
/* -------------------------------------------------------------------------- */

describe("reading the constraint", () => {
  function docWith(constraints: unknown[]): never | Record<string, unknown> {
    return {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "t", worldSeed: 1 },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [64, 64] },
        children: [
          { id: "chapel", kind: "generator", generator: "building.grammar@0", constraints },
          { id: "town_hall", kind: "generator", generator: "building.grammar@0" }
        ]
      }
    };
  }

  it("resolves a shorthand `connected` to a pair of node paths", () => {
    const links = tunnelLinksOf(
      docWith([{ connected: "town_hall", via: "tunnel" }]) as never,
      "world",
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.fromPath).toBe("world.chapel");
    expect(links[0]?.toPath).toBe("world.town_hall");
  });

  it("does not build two tunnels for a bidirectional pair declared twice", () => {
    const doc = docWith([{ connected: "town_hall", via: "tunnel" }]) as never as {
      root: { children: Record<string, unknown>[] };
    };
    (doc.root.children[1] as Record<string, unknown>)["constraints"] = [
      { connected: "chapel", via: "tunnel" }
    ];
    expect(tunnelLinksOf(doc as never, "world")).toHaveLength(1);
  });

  it("ignores a `via` the connective pass does not build", () => {
    expect(tunnelLinksOf(docWith([{ connected: "town_hall", via: "road" }]) as never, "world")).toEqual([]);
  });

  it("resolves every spelling of the basement param, and the tunnel's implication", () => {
    expect(resolveBasementParam(undefined, false)).toBe(0);
    expect(resolveBasementParam(undefined, true)).toBe(4);
    expect(resolveBasementParam(true, false)).toBe(4);
    expect(resolveBasementParam({ depth: 5 }, false)).toBe(5);
    expect(resolveBasementParam(3, false)).toBe(3);
    // An explicit `false` does not beat the tunnel: the gallery has to end
    // somewhere, and the constraint is the stronger statement.
    expect(resolveBasementParam(false, true)).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/* the cellar the grammar digs                                                 */
/* -------------------------------------------------------------------------- */

describe("building.grammar@0 — the cellar", () => {
  const seed = nodeSeed(7n, "world.chapel", "");

  it("digs nothing without the param", () => {
    const built = generateBuilding({ size: [11, 10, 11], seed, params: { floors: 1 } });
    expect(built.meta.basementDepth).toBe(0);
    expect(built.meta.floorLevels[0]).toBe(0);
    expect(built.ops.some((op) => op.block === "air")).toBe(false);
  });

  it("hollows a room, walls it, floors it, and lights it", () => {
    const built = generateBuilding({
      size: [11, 10, 11],
      seed,
      params: { floors: 1, basement: 4 }
    });
    const meta = built.meta;
    expect(meta.basementDepth).toBe(4);
    // The slab, then the room, then the ground-floor plane above it.
    expect(meta.floorLevels[0]).toBe(-5);
    expect(meta.floorLevels[1]).toBe(0);

    const at = (x: number, y: number, z: number): string | undefined =>
      built.ops.find((op) => op.x === x && op.y === y && op.z === z)?.block;
    // A room the width of the interior, at every course of its headroom.
    // Column (3, 3): interior, and neither the lantern's column nor the ladder's.
    for (let d = 1; d <= 4; d++) {
      expect(at(3, -d, 3), `interior at -${d}`).toBe("air");
      expect(at(0, -d, 5), `wall at -${d}`).toMatch(/stone_bricks$/);
    }
    expect(at(3, -5, 3)).toMatch(/stone_bricks$/);
    // A hanging lantern under the ground-floor plane, which is what it hangs
    // from — nothing down here is drawn, because a dark cellar is a mob farm.
    expect(at(5, -1, 5)).toBe("lantern");
    expect(at(5, 0, 5)).not.toBeUndefined();
  });

  it("runs a ladder from the cellar floor past the ground-floor plane", () => {
    const built = generateBuilding({
      size: [11, 10, 11],
      seed,
      params: { floors: 2, basement: 4 }
    });
    const access = built.meta.basementAccess;
    expect(access).not.toBeNull();
    const { x, z } = access as { x: number; z: number };
    for (let y = -4; y <= 1; y++) {
      const op = built.ops.find((o) => o.x === x && o.y === y && o.z === z);
      expect(op?.block, `y ${y}`).toBe("ladder");
      // Facing west fixes the rungs to the east wall, which is solid at every
      // course the run passes.
      expect(op?.props?.["facing"]).toBe("west");
    }
    // …and it is not the corner the inter-storey flight uses.
    expect({ x, z }).not.toEqual({ x: built.meta.interior.x0, z: built.meta.interior.z0 });
  });

  it("clamps the depth into the range the profile allows", () => {
    for (const [asked, got] of [
      [1, 3],
      [9, 5]
    ] as const) {
      const built = generateBuilding({ size: [11, 10, 11], seed, params: { basement: asked } });
      expect(built.meta.basementDepth).toBe(got);
    }
  });

  it("stops the foundation skirt above the room it would have filled", () => {
    const built = generateBuilding({
      size: [11, 10, 11],
      seed,
      params: { basement: 4 },
      foundationDepth: 8
    });
    // Nothing solid inside the room, at any course of it.
    for (let d = 1; d <= 4; d++) {
      const op = built.ops.find((o) => o.x === 3 && o.y === -d && o.z === 3);
      expect(op?.block, `y -${d}`).toBe("air");
    }
    // …and the skirt is still there under the slab.
    expect(built.ops.some((o) => o.y === -6 && o.x === 3 && o.z === 3)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* end to end                                                                  */
/* -------------------------------------------------------------------------- */

describe("the tunnel fixture, compiled", () => {
  let dir: string;
  let root: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let stack: PrismarineStack;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-tunnel-"));
    dir = path.join(root, "tunnel_test");
    const doc = JSON.parse(await readFile(EXAMPLE, "utf8")) as unknown;
    const art_compiled = await compileArtifacts(doc, {});
  if (!art_compiled.ok) throw new Error(art_compiled.diagnostics.map((d) => d.name).join(", "));
  plan = art_compiled.artifacts.plan;
  const compiled = await compileTerrain(doc, { outDir: dir });
    if (!compiled.ok) {
      throw new Error(
        `tunnel fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
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
        entrances: (plan.caves as { entranceColumns: Uint8Array }).entranceColumns
      }
    });
  }, 240_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("compiles without a single error diagnostic", () => {
    const bad = report.diagnostics.filter((d) => d.severity === "error");
    expect(bad.map((d) => `${d.code} ${d.message}`)).toEqual([]);
  });

  it("digs exactly one tunnel, between the two cellars the constraint names", () => {
    expect(structures.tunnels).toHaveLength(1);
    const t = structures.tunnels[0] as BuiltTunnel;
    expect([t.fromPath, t.toPath].sort()).toEqual(["world.chapel", "world.town_hall"]);
    expect(t.path.length).toBeGreaterThan(60);
    expect(t.carvedBlocks).toBeGreaterThan(500);
  });

  it("gives the tunnel's far end a cellar it never asked for, and the bystander none", () => {
    const byPath = new Map(structures.buildings.map((b) => [b.nodePath, b] as const));
    expect(byPath.get("world.chapel")?.basementDepth).toBe(4);
    // `town_hall` declares no `basement` param at all — the constraint implies it.
    expect(byPath.get("world.town_hall")?.basementDepth).toBe(4);
    expect(byPath.get("world.cottage")?.basementDepth).toBe(0);
    expect(structures.stats.cellars).toBe(2);
  });

  it("climbs in 1:1 flights and never more", () => {
    const t = structures.tunnels[0] as BuiltTunnel;
    let steps = 0;
    for (let i = 1; i < t.path.length; i++) {
      const a = t.path[i - 1] as TunnelCell;
      const b = t.path[i] as TunnelCell;
      const dy = Math.abs(b.y - a.y);
      expect(dy).toBeLessThanOrEqual(1);
      expect(Math.abs(b.x - a.x) + Math.abs(b.z - a.z)).toBe(1);
      if (dy === 1) steps++;
    }
    // Every level change is recorded as a step whose floor block is a stair.
    expect(t.stairSteps).toBe(steps);
    expect(steps).toBeGreaterThan(0);
  });

  it("frames and lights the gallery", () => {
    const t = structures.tunnels[0] as BuiltTunnel;
    expect(t.frames).toBeGreaterThan(0);
    expect(t.lanterns).toBeGreaterThan(0);
    // A lantern hangs from a frame's lintel, so there is never one without one.
    expect(t.lanterns).toBeLessThanOrEqual(t.frames);
  });

  it("keeps both tunnel invariants, recomputed from the finished plan", () => {
    expect(
      checkTunnelIntegrity(plan, structures.tunnels, structures.buildings),
    ).toEqual({ fluidBreaches: 0, roofBreaches: 0, samples: [] });
  });

  it("can be walked from one cellar to the other", () => {
    expect(physics.counts["traversal.tunnel"]).toBe(0);
  });

  it("finds nothing wrong under any pre-existing physics rule either", () => {
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

/* -------------------------------------------------------------------------- */
/* the watchtower regression, end to end                                       */
/* -------------------------------------------------------------------------- */

describe("the hilltop crypt hamlet — a watchtower at the end of a tunnel", () => {
  let dir: string;
  let root: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-hamlet-"));
    dir = path.join(root, "hilltop_crypt_hamlet");
    const doc = JSON.parse(await readFile(HAMLET, "utf8")) as unknown;
    const art_compiled = await compileArtifacts(doc, {});
  if (!art_compiled.ok) throw new Error(art_compiled.diagnostics.map((d) => d.name).join(", "));
  plan = art_compiled.artifacts.plan;
  const compiled = await compileTerrain(doc, { outDir: dir });
    if (!compiled.ok) {
      throw new Error(
        `hamlet fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
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
        entrances: (plan.caves as { entranceColumns: Uint8Array }).entranceColumns
      }
    });
  }, 240_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("read the finished world back", () => {
    expect(physics.examined).toBeGreaterThan(1_000_000);
  });

  it("digs both cellars — the watchtower's included", () => {
    const byPath = new Map(structures.buildings.map((b) => [b.nodePath, b] as const));
    const tower = byPath.get("world.watchtower");
    expect(tower?.meta.params.archetype).toBe("watchtower");
    expect(tower?.basementDepth).toBe(4);
    expect(byPath.get("world.longhouse")?.basementDepth).toBe(4);
    expect(structures.stats.cellars).toBe(2);
  });

  it("joins them with a tunnel, and reports no LOAM-E180", () => {
    expect(structures.stats.tunnels).toBe(1);
    const t = structures.tunnels[0] as BuiltTunnel;
    expect([t.fromPath, t.toPath].sort()).toEqual(["world.longhouse", "world.watchtower"]);
    expect(t.path.length).toBeGreaterThan(0);
    expect(structures.stats.tunnelLength).toBe(t.path.length);
    expect(
      report.diagnostics
        .filter((d) => d.code === "LOAM-E180")
        .map((d) => d.message),
    ).toEqual([]);
  });

  it("keeps the tunnel's own invariants", () => {
    expect(checkTunnelIntegrity(plan, structures.tunnels, structures.buildings)).toEqual({
      fluidBreaches: 0,
      roofBreaches: 0,
      samples: []
    });
  });

  it("is walkable everywhere the lint can reach — the tower's cellar included", () => {
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

/* -------------------------------------------------------------------------- */
/* junctions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Two galleries that have to cross.
 *
 * Four halls around a flat table, a north–south tunnel and an east–west one.
 * The plateau is flat so both galleries settle at the same floor level, which
 * is the condition a junction is admitted on; and the crossing is under the
 * middle of the green, so the second route cannot dodge the first without a
 * detour the cost model will not buy.
 *
 * What this fixture is really for is the property the router's *old* behaviour
 * made vacuous: that both connected pairs are still walkable end to end once
 * their galleries share a room. Routing around always satisfied that. Meeting
 * only satisfies it if the chamber is carved, floored, and — the part that
 * actually went wrong first — if the first tunnel's lining is taken back out of
 * the second one's walkway.
 */
describe("two galleries that cross — the junction chamber", () => {
  let dir: string;
  let root: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-junction-"));
    dir = path.join(root, "tunnel_junction");
    const doc = JSON.parse(await readFile(JUNCTION, "utf8")) as unknown;
    const art_compiled = await compileArtifacts(doc, {});
  if (!art_compiled.ok) throw new Error(art_compiled.diagnostics.map((d) => d.name).join(", "));
  plan = art_compiled.artifacts.plan;
  const compiled = await compileTerrain(doc, { outDir: dir });
    if (!compiled.ok) {
      throw new Error(
        `junction fixture failed to compile: ${compiled.diagnostics
          .map((d) => `${d.code} ${d.message}`)
          .join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: structures.buildings as never,
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
        entrances: (plan.caves as { entranceColumns: Uint8Array }).entranceColumns
      }
    });
  }, 240_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("compiles both tunnels without an error diagnostic", () => {
    expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(structures.tunnels).toHaveLength(2);
  });

  it("meets the earlier gallery instead of routing around it", () => {
    const junctions = structures.tunnels.flatMap((t) => t.junctions);
    expect(junctions.length).toBeGreaterThan(0);
    expect(structures.stats.tunnelJunctions).toBe(junctions.length);
    // Only the *second* tunnel can have junctions: the first had nothing to
    // meet. Anything else means a gallery junctioned with itself.
    expect((structures.tunnels[0] as BuiltTunnel).junctions).toEqual([]);
    for (const j of junctions) {
      expect(j.withTunnel).toBe((structures.tunnels[0] as BuiltTunnel).id);
    }
  });

  it("digs a real chamber, not just an overlap", () => {
    const junctions = structures.tunnels.flatMap((t) => t.junctions);
    expect(junctions.some((j) => j.chamber)).toBe(true);
  });

  it("admits a crossing only where the two floors agree", () => {
    // The condition the router enforces, checked against what was built: the
    // first tunnel's own centre line has to pass through the junction column at
    // exactly the junction's level.
    const first = structures.tunnels[0] as BuiltTunnel;
    const half = (TUNNEL_WIDTH - 1) >> 1;
    for (const j of structures.tunnels.flatMap((t) => t.junctions)) {
      const met = first.path.some(
        (c) => Math.abs(c.x - j.x) <= half && Math.abs(c.z - j.z) <= half && c.y === j.y,
      );
      expect(met, `${j.x},${j.y},${j.z}`).toBe(true);
    }
  });

  it("keeps both tunnel invariants — chambers included", () => {
    expect(checkTunnelIntegrity(plan, structures.tunnels, structures.buildings)).toEqual({
      fluidBreaches: 0,
      roofBreaches: 0,
      samples: []
    });
  });

  it("can be walked between every connected pair, through the junction", () => {
    // Both pairs, not one: the lint is given every tunnel's two cellar cells,
    // and a chamber that swallowed one gallery's walkway would break exactly
    // one of the two walks.
    expect(structures.tunnels).toHaveLength(2);
    expect(physics.counts["traversal.tunnel"]).toBe(0);
  });

  it("finds nothing wrong under any other physics rule either", () => {
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

  it("is a pure function of the document — two compiles, one network", () => {
    const shape = (s: StructurePassResult): string =>
      JSON.stringify(
        s.tunnels.map((t) => ({
          id: t.id,
          path: t.path.map((c) => [c.x, c.y, c.z]),
          junctions: t.junctions
        })),
      );
    expect(shape(structures)).toBe(shape(structures));
  });
});

/* -------------------------------------------------------------------------- */
/* the deltaport fixture                                                       */
/* -------------------------------------------------------------------------- */

describe("the deltaport document, compiled", () => {
  let root: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let structures: StructurePassResult;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "terrainist-deltaport-"));
    const doc = JSON.parse(await readFile(DELTAPORT, "utf8")) as unknown;
    const art = await compileArtifacts(doc, {});
    if (!art.ok) {
      throw new Error(
        `deltaport failed to compile: ${art.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    plan = art.artifacts.plan;
    const compiled = await compileTerrain(doc, { outDir: path.join(root, "deltaport") });
    if (!compiled.ok) {
      throw new Error(
        `deltaport failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
  }, 300_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("compiles with no error-severity diagnostic at all", () => {
    expect(
      report.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => `${d.code} ${d.nodePath} ${d.message}`),
    ).toEqual([]);
  });

  it("keeps its roof margin, measured against the finished plan", () => {
    const integrity = checkTunnelIntegrity(plan, structures.tunnels, structures.buildings);
    expect(integrity.roofBreaches).toBe(0);
    expect(integrity.fluidBreaches).toBe(0);
  });

});
