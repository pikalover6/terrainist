/**
 * `road.network@0` unit tests, over synthetic column plans.
 *
 * A hand-built plan is the point: it lets each property (connectivity, the
 * grade cap, water avoidance, the unroutable path) be asserted against terrain
 * chosen to provoke exactly that case, without a 90-second compile in the way.
 */

import { describe, expect, it } from "vitest";

import { longestOrthogonalZigzag } from "./road-shape.js";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { rotateLocal } from "../src/layout/ports.js";
import type { OccupancyGrid, Placement, ResolvedPort } from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { rotateLocalColumn } from "@terrainist/stdlib";
import {
  buildRoadNetwork,
  gradeProfile,
  index,
  routeTo,
  smoothRoute,
  surfaceStreetGraph,
  MARKING_DASH,
  MARKING_PERIOD,
  ROAD_FILL_BAND,
  type StreetSurfaceResult,
} from "../src/structures/roads.js";
import type { StreetGraph } from "../src/layout/streets.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 64): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

/** A flat-ish plan whose height comes from `height(x, z)`. */
function plan(
  r: Region,
  height: (x: number, z: number) => number = () => 70,
  water: (x: number, z: number) => boolean = () => false,
): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const fluidKind = new Uint8Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const x = r.x0 + i;
      const z = r.z0 + j;
      const k = j * r.width + i;
      ground[k] = height(x, z);
      fluidTop[k] = ground[k] as number;
      if (water(x, z)) {
        fluidKind[k] = FluidKind.WATER;
        fluidTop[k] = SEA;
      }
    }
  }
  return {
    region: r,
    ground,
    fluidTop,
    fluidKind,
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    seaLevel: SEA,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 },
  };
}

function occupancy(r: Region): OccupancyGrid {
  return { region: r, mask: new Uint8Array(r.width * r.depth), byTag: new Map() };
}

/** A placement plus its south-facing door port. */
function building(
  id: string,
  x0: number,
  z0: number,
  w: number,
  d: number,
  y = 70,
): { placement: Placement; port: ResolvedPort } {
  const footprint = { x0, z0, x1: x0 + w - 1, z1: z0 + d - 1 };
  const placement: Placement = {
    nodePath: id,
    id,
    translation: [x0, y, z0],
    yaw: 0,
    mirror: false,
    size: [w, 6, d],
    footprint,
    anchor: { x: x0 + ((w - 1) >> 1), z: z0 + ((d - 1) >> 1) },
    foundationY: y,
  };
  const port: ResolvedPort = {
    ref: `${id}#door`,
    nodePath: id,
    name: "door",
    type: "door",
    position: [placement.anchor.x, y, footprint.z1],
    outwardNormal: [0, 0, 1],
    face: "south",
    width: 1,
    height: 2,
    floorY: y,
  };
  return { placement, port };
}

const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

/* -------------------------------------------------------------------------- */

describe("gradeProfile", () => {
  it("never steps more than one block", () => {
    const rough = [70, 70, 78, 78, 64, 64, 71, 90, 66, 66, 66];
    const graded = gradeProfile(rough, SEA);
    for (let i = 1; i < graded.length; i++) {
      expect(Math.abs((graded[i] as number) - (graded[i - 1] as number))).toBeLessThanOrEqual(1);
    }
  });

  it("never fills more than the band above natural ground", () => {
    const rough = [70, 71, 73, 80, 74, 70, 69];
    const graded = gradeProfile(rough, SEA);
    for (const [i, y] of graded.entries()) {
      expect(y - (rough[i] as number)).toBeLessThanOrEqual(ROAD_FILL_BAND);
    }
  });

  it("never cuts below the water table", () => {
    const graded = gradeProfile([70, 68, 64, 62, 61, 66, 72], SEA);
    for (const y of graded) expect(y).toBeGreaterThan(SEA);
  });

  it("leaves flat ground flat, one band above it", () => {
    const flat = 70 + ROAD_FILL_BAND;
    expect(gradeProfile([70, 70, 70, 70], SEA)).toEqual([flat, flat, flat, flat]);
  });

  it("handles a single-cell profile", () => {
    expect(gradeProfile([70], SEA)).toEqual([70 + ROAD_FILL_BAND]);
  });

  it("prefers cut to fill: the band is at most one block", () => {
    // The cut bias is the embankment fix, expressed as a bound. Whatever the
    // ground does, a graded lane may never stand more than one block proud of
    // it, so it can never show a two-block fill face.
    expect(ROAD_FILL_BAND).toBeLessThanOrEqual(1);
  });

  it("lifts a bridge cell to its deck floor and still holds the grade cap", () => {
    // Cells 3..6 are a channel whose water surface is at 68; the deck must
    // clear it, and the ramps either side must still step one block at a time.
    const ground = [72, 71, 70, 62, 61, 61, 62, 70, 71, 72];
    const deck = [0, 0, 0, 69, 69, 69, 69, 0, 0, 0];
    const graded = gradeProfile(ground, SEA, ROAD_FILL_BAND, deck);
    for (let i = 3; i <= 6; i++) expect(graded[i]).toBeGreaterThanOrEqual(69);
    for (let i = 1; i < graded.length; i++) {
      expect(Math.abs((graded[i] as number) - (graded[i - 1] as number))).toBeLessThanOrEqual(1);
    }
  });
});

describe("routeTo", () => {
  const r = region(32);

  it("finds a path from the anchor to the existing network", () => {
    const p = plan(r);
    const road = new Uint8Array(r.width * r.depth);
    road[index(r, 0, 0)] = 1;
    const path = routeTo(r, new Uint8Array(r.width * r.depth), road, p, { x: -10, z: -8 });
    expect(path).not.toBeNull();
    // Ends at the anchor, arrives at the network, and every step is a single
    // 8-connected move — diagonals included, which is what lets a lane run at
    // 45° instead of climbing a staircase of right angles.
    expect(path?.[0]).toEqual({ x: -10, z: -8 });
    expect(path?.[(path?.length ?? 1) - 1]).toEqual({ x: 0, z: 0 });
    for (let i = 1; i < (path?.length ?? 0); i++) {
      const a = path?.[i - 1] as { x: number; z: number };
      const b = path?.[i] as { x: number; z: number };
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBe(1);
    }
  });

  it("runs straight across flat ground instead of staircasing", () => {
    const p = plan(r);
    // Flatten everything: with no slope to argue about, the only thing that can
    // shape the route is the search itself, which is exactly what is on trial.
    p.ground.fill(70);
    const road = new Uint8Array(r.width * r.depth);
    road[index(r, 0, 0)] = 1;
    const empty = new Uint8Array(r.width * r.depth);
    const found = routeTo(r, empty, road, p, { x: -14, z: -11 });
    expect(found).not.toBeNull();
    const path = smoothRoute(r, empty, road, p, found as { x: number; z: number }[]);
    // A right-angle staircase is the defect: three or more alternations of two
    // orthogonal headings. A diagonal run is not one, and is what we want.
    expect(longestOrthogonalZigzag(path)).toBeLessThan(3);
    // Smoothing must not invent a detour, and must not break the chain.
    expect(path[0]).toEqual({ x: -14, z: -11 });
    expect(path[path.length - 1]).toEqual({ x: 0, z: 0 });
    expect(path.length).toBeLessThanOrEqual(found?.length ?? 0);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as { x: number; z: number };
      const b = path[i] as { x: number; z: number };
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBe(1);
    }
  });

  it("refuses to smooth a straight through an obstacle", () => {
    const p = plan(r);
    p.ground.fill(70);
    const road = new Uint8Array(r.width * r.depth);
    road[index(r, 0, 0)] = 1;
    const blocked = new Uint8Array(r.width * r.depth);
    // A wall across the diagonal, with one gap the route has to use.
    for (let z = -16; z <= 15; z++) {
      if (z === 5) continue;
      blocked[index(r, -8, z)] = 1;
    }
    const found = routeTo(r, blocked, road, p, { x: -14, z: -11 });
    expect(found).not.toBeNull();
    const path = smoothRoute(r, blocked, road, p, found as { x: number; z: number }[]);
    for (const cell of path) expect(blocked[index(r, cell.x, cell.z)]).toBe(0);
    expect(path.some((c) => c.x === -8 && c.z === 5)).toBe(true);
  });

  it("returns null when the anchor is walled in", () => {
    const p = plan(r);
    const blocked = new Uint8Array(r.width * r.depth);
    const road = new Uint8Array(r.width * r.depth);
    road[index(r, 0, 0)] = 1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      blocked[index(r, -10 + (dx as number), -8 + (dz as number))] = 1;
    }
    expect(routeTo(r, blocked, road, p, { x: -10, z: -8 })).toBeNull();
  });

  it("returns null when there is no network to reach", () => {
    const p = plan(r);
    const road = new Uint8Array(r.width * r.depth);
    expect(routeTo(r, new Uint8Array(r.width * r.depth), road, p, { x: 0, z: 0 })).toBeNull();
  });

  describe("the reserved route corridor (§4.9.6)", () => {
    /**
     * A wall across the middle with two gaps, one either side of the direct
     * line and exactly as far from it.
     *
     * The symmetry is the instrument: with the two routes costing the same, the
     * unguided search is decided by its tie-break, and a corridor that covers
     * one gap and not the other has to be what decides it instead.
     */
    function twoGaps(): Uint8Array {
      const blocked = new Uint8Array(r.width * r.depth);
      for (let z = -16; z <= 15; z++) {
        if (z === -6 || z === 6) continue;
        blocked[index(r, -6, z)] = 1;
      }
      return blocked;
    }

    /** A band of the given half-width around the gap at `z`. */
    function bandThrough(z: number, halfWidth = 4): Uint8Array {
      const mask = new Uint8Array(r.width * r.depth);
      for (let x = -16; x <= 15; x++) {
        for (let dz = -halfWidth; dz <= halfWidth; dz++) {
          const zz = z + dz;
          if (zz < -16 || zz > 15) continue;
          mask[index(r, x, zz)] = 1;
        }
      }
      return mask;
    }

    it("takes whichever equal line its reservation covers", () => {
      const p = plan(r);
      p.ground.fill(70);
      const road = new Uint8Array(r.width * r.depth);
      road[index(r, 12, 0)] = 1;
      const blocked = twoGaps();
      const gapOf = (path: readonly { x: number; z: number }[] | null): number | undefined =>
        path?.find((c) => c.x === -6)?.z;

      expect(gapOf(routeTo(r, blocked, road, p, { x: -12, z: 0 }, { corridor: bandThrough(-6) }))).toBe(-6);
      expect(gapOf(routeTo(r, blocked, road, p, { x: -12, z: 0 }, { corridor: bandThrough(6) }))).toBe(6);
    });

    it("leaves the corridor rather than fail — it is a preference, not a channel", () => {
      const p = plan(r);
      p.ground.fill(70);
      const road = new Uint8Array(r.width * r.depth);
      road[index(r, 12, 0)] = 1;
      // The reservation is aimed at a gap that is not there: a hard channel
      // would report the anchor unroutable, a discount stops paying and goes
      // through the gap that is.
      const blocked = new Uint8Array(r.width * r.depth);
      for (let z = -16; z <= 15; z++) {
        if (z === 6) continue;
        blocked[index(r, -6, z)] = 1;
      }
      const path = routeTo(r, blocked, road, p, { x: -12, z: 0 }, { corridor: bandThrough(-6) });
      expect(path).not.toBeNull();
      for (const cell of path ?? []) expect(blocked[index(r, cell.x, cell.z)]).toBe(0);
      expect(path?.find((c) => c.x === -6)?.z).toBe(6);
    });

    it("changes nothing when no corridor was registered", () => {
      const p = plan(r);
      p.ground.fill(70);
      const road = new Uint8Array(r.width * r.depth);
      road[index(r, 0, 0)] = 1;
      const empty = new Uint8Array(r.width * r.depth);
      const a = routeTo(r, empty, road, p, { x: -12, z: -12 });
      const b = routeTo(r, empty, road, p, { x: -12, z: -12 }, {});
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });
  });

  it("prefers flat ground to a shorter climb", () => {
    // A wall of high ground straight between the two, with a flat corridor
    // around it: the slope penalty has to beat the extra distance.
    const p = plan(r, (x, z) => (x === -4 && z > -12 && z < 4 ? 90 : 70));
    const road = new Uint8Array(r.width * r.depth);
    road[index(r, 4, 0)] = 1;
    const path = routeTo(r, new Uint8Array(r.width * r.depth), road, p, { x: -12, z: 0 });
    expect(path).not.toBeNull();
    for (const cell of path ?? []) {
      expect(p.ground[index(r, cell.x, cell.z)]).toBe(70);
    }
  });
});

describe("buildRoadNetwork", () => {
  const r = region(64);

  function network(
    p: ColumnPlan,
    opts: { water?: boolean } = {},
  ): ReturnType<typeof buildRoadNetwork> & { occ: OccupancyGrid } {
    void opts;
    const hall = building("world.hall", -6, -6, 11, 11);
    const east = building("world.east", 14, -4, 8, 8);
    const west = building("world.west", -24, 6, 8, 8);
    const plazaPlacement = building("world.plaza", -4, 12, 10, 10).placement;
    const occ = occupancy(p.region);
    const result = buildRoadNetwork({
      nodePath: "world.lanes",
      params: { width: 3, lanterns: true, lanternSpacing: 8 },
      seed: nodeSeed(7n, "world.lanes"),
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [hall.placement, east.placement, west.placement, plazaPlacement],
      ports: [hall.port, east.port, west.port],
      plaza: plazaPlacement,
      buildingPaths: new Set(["world.hall", "world.east", "world.west"]),
      occupancy: occ,
    });
    return { ...result, occ };
  }

  it("connects every anchor to the hub, with continuous 8-connected paths", () => {
    const p = plan(r, (x, z) => 70 + Math.floor((x + z) / 16));
    const result = network(p);
    expect(result.diagnostics).toEqual([]);
    expect(result.unrouted).toEqual([]);
    expect(result.routes.map((route) => route.from).sort()).toEqual([
      "world.east",
      "world.hall",
      "world.west",
    ]);

    for (const route of result.routes) {
      for (let i = 1; i < route.path.length; i++) {
        const a = route.path[i - 1] as { x: number; z: number };
        const b = route.path[i] as { x: number; z: number };
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBe(1);
      }
    }

    // The property that matters: the surfaced columns form **one** connected
    // component, and every anchor's first cell is in it. Flooding the `road`
    // tag from the hub has to reach all of them.
    const road = result.occ.byTag.get("road") as Uint8Array;
    const hub = { x: 0, z: 16 };
    const seen = new Uint8Array(road.length);
    const queue = [index(r, hub.x, hub.z)];
    expect(road[queue[0] as number]).toBe(1);
    seen[queue[0] as number] = 1;
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head] as number;
      const x = r.x0 + (k % r.width);
      const z = r.z0 + Math.floor(k / r.width);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < r.x0 || nz < r.z0 || nx >= r.x0 + r.width || nz >= r.z0 + r.depth) continue;
        const nk = index(r, nx, nz);
        if (road[nk] !== 1 || seen[nk] === 1) continue;
        seen[nk] = 1;
        queue.push(nk);
      }
    }
    for (const route of result.routes) {
      const start = route.path[0] as { x: number; z: number };
      expect(seen[index(r, start.x, start.z)], `${route.from} is not on the network`).toBe(1);
    }
  });

  it("holds the grade cap along every routed centre line", () => {
    const p = plan(r, (x, z) => 70 + Math.floor(Math.abs(x) / 5) + Math.floor(Math.abs(z) / 7));
    for (const route of network(p).routes) {
      for (let i = 1; i < route.path.length; i++) {
        const a = route.path[i - 1] as { y: number };
        const b = route.path[i] as { y: number };
        expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("walks round water when the detour is cheap, and never surfaces it", () => {
    // A pond off to one side of everything. Nothing has to cross it, so the
    // bridge premium should make certain nothing does.
    const wet = (x: number, z: number): boolean =>
      x >= -20 && x <= -14 && z >= -20 && z <= -14;
    const p = plan(r, () => 70, wet);
    const result = network(p);
    expect(result.unrouted).toEqual([]);
    expect(result.bridgeColumns).toBe(0);
    for (const route of result.routes) {
      for (const cell of route.path) {
        expect(wet(cell.x, cell.z), `route crossed water at ${cell.x},${cell.z}`).toBe(false);
        expect(p.fluidKind[index(r, cell.x, cell.z)]).toBe(FluidKind.NONE);
      }
    }
  });

  it("bridges a channel it cannot walk round, without disturbing the water", () => {
    // A channel across the whole map, four cells wide: no detour exists, and
    // the span is well inside ROAD_BRIDGE_MAX_SPAN, so the router should build
    // a bridge rather than give up.
    const wet = (_x: number, z: number): boolean => z >= 4 && z <= 7;
    const p = plan(r, () => 70, wet);
    const before = p.ground.slice();
    const beforeFluid = p.fluidTop.slice();
    const result = network(p);

    expect(result.unrouted).toEqual([]);
    expect(result.bridgeColumns).toBeGreaterThan(0);

    // The plan is untouched under the deck: no dirt in the river, and the
    // fluid validator still sees the water it settled.
    for (let j = 0; j < r.depth; j++) {
      for (let i = 0; i < r.width; i++) {
        const k = j * r.width + i;
        if (p.fluidKind[k] === FluidKind.NONE) continue;
        expect(p.ground[k]).toBe(before[k]);
        expect(p.fluidTop[k]).toBe(beforeFluid[k]);
      }
    }

    // Every deck block stands clear of the water it spans.
    let deckBlocks = 0;
    for (const b of result.blocks) {
      if (!wet(b.x, b.z)) continue;
      deckBlocks++;
      expect(b.y).toBeGreaterThan(SEA);
    }
    expect(deckBlocks).toBeGreaterThan(0);

    // A bridge crosses square: no diagonal steps over water.
    for (const route of result.routes) {
      for (let i = 1; i < route.path.length; i++) {
        const a = route.path[i - 1] as { x: number; z: number };
        const b = route.path[i] as { x: number; z: number };
        if (!wet(a.x, a.z) && !wet(b.x, b.z)) continue;
        expect(a.x === b.x || a.z === b.z).toBe(true);
      }
    }
  });

  it("reports an unroutable anchor instead of throwing", () => {
    // A channel spanning the whole map and far too wide to bridge: the
    // northern cottage can never reach the plaza on the far side of it.
    const p = plan(r, () => 70, (_x, z) => z >= -12 && z <= 11);
    const marooned = building("world.marooned", -4, -20, 7, 7);
    const plazaPlacement = building("world.plaza", -4, 12, 10, 10).placement;
    const result = buildRoadNetwork({
      nodePath: "world.lanes",
      params: {},
      seed: nodeSeed(7n, "world.lanes"),
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [marooned.placement, plazaPlacement],
      ports: [marooned.port],
      plaza: plazaPlacement,
      buildingPaths: new Set(["world.marooned"]),
    });
    expect(result.unrouted).toEqual(["world.marooned"]);
    expect(result.routes).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0];
    expect(d?.code).toBe("LOAM-T209");
    expect(d?.name).toBe("ROAD_UNROUTABLE");
    expect(d?.severity).toBe("warning");
    // The diagnostic has to name both ends, or it is unactionable.
    expect(d?.message).toContain("world.plaza");
    expect(d?.message).toContain("world.marooned");
    expect(d?.nodePath).toBe("world.lanes");
  });

  it("claims every surfaced column under the `road` tag", () => {
    const p = plan(r);
    const result = network(p);
    const road = result.occ.byTag.get("road");
    expect(road).toBeDefined();
    let tagged = 0;
    for (let k = 0; k < (road?.length ?? 0); k++) {
      if (road?.[k] === 1) {
        tagged++;
        expect(result.occ.mask[k]).toBe(1);
      }
    }
    expect(tagged).toBe(result.surfacedColumns);
    expect(tagged).toBeGreaterThan(0);
  });

  it("plants lantern posts, and only on dry unsurfaced ground", () => {
    const p = plan(r);
    const result = network(p);
    expect(result.blocks.length).toBeGreaterThan(0);
    // Three blocks per lamp: two fence courses and the lantern on top.
    expect(result.blocks.length % 3).toBe(0);
    for (const b of result.blocks) {
      expect(p.fluidKind[index(r, b.x, b.z)]).toBe(FluidKind.NONE);
    }
    // Every lamp block rests on the one below it, and the lowest rests on the
    // finished ground. Support is the invariant, not the block count.
    const byColumn = new Map<string, number[]>();
    for (const b of result.blocks) {
      const key = `${b.x},${b.z}`;
      const ys = byColumn.get(key) ?? [];
      ys.push(b.y);
      byColumn.set(key, ys);
    }
    for (const [key, ys] of byColumn) {
      const [x, z] = key.split(",").map(Number) as [number, number];
      ys.sort((a, b) => a - b);
      expect(ys[0]).toBe((p.ground[index(r, x, z)] as number) + 1);
      for (let i = 1; i < ys.length; i++) {
        expect((ys[i] as number) - (ys[i - 1] as number)).toBe(1);
      }
    }
  });

  it("omits lanterns when the param says so", () => {
    const p = plan(r);
    const hall = building("world.hall", -6, -6, 11, 11);
    const plazaPlacement = building("world.plaza", -4, 12, 10, 10).placement;
    const result = buildRoadNetwork({
      nodePath: "world.lanes",
      params: { lanterns: false },
      seed: nodeSeed(7n, "world.lanes"),
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [hall.placement, plazaPlacement],
      ports: [hall.port],
      plaza: plazaPlacement,
      buildingPaths: new Set(["world.hall"]),
    });
    expect(result.blocks).toEqual([]);
    expect(result.routes).toHaveLength(1);
  });

  it("does nothing when there is nothing to connect", () => {
    const p = plan(r);
    const result = buildRoadNetwork({
      nodePath: "world.lanes",
      params: {},
      seed: nodeSeed(7n, "world.lanes"),
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [],
      ports: [],
      buildingPaths: new Set(),
    });
    expect(result.routes).toEqual([]);
    expect(result.surfacedColumns).toBe(0);
  });

  it("is deterministic", () => {
    const a = network(plan(r, (x, z) => 70 + Math.floor((x + z) / 16)));
    const b = network(plan(r, (x, z) => 70 + Math.floor((x + z) / 16)));
    expect(JSON.stringify(b.routes)).toBe(JSON.stringify(a.routes));
    expect(JSON.stringify(b.blocks)).toBe(JSON.stringify(a.blocks));
  });
});

/* -------------------------------------------------------------------------- */
/* U1 — urban street materials                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A city street may not be a farm track.
 *
 * The properties that matter to a player walking the block: an avenue is
 * tarmac (not dirt path), the tarmac is patched rather than a flat slab, there
 * is no gravel fringe where the carriageway meets the sidewalk band, and a
 * rural lane between two villages is untouched by any of it.
 */
describe("district street materials", () => {
  const AVENUE_WIDTH = 7;
  const AVENUE_CELLS = 49;

  const nameOf = (stateId: number): string => stack.blockNameByStateId(stateId) ?? "";

  /** One straight avenue and one straight lane, with no junction between. */
  const graph = (): StreetGraph => {
    const avenue: { x: number; z: number }[] = [];
    const lane: { x: number; z: number }[] = [];
    for (let x = -24; x <= 24; x++) {
      avenue.push({ x, z: 0 });
      lane.push({ x, z: 20 });
    }
    return {
      segments: [
        { id: "main", kind: "avenue", width: AVENUE_WIDTH, path: avenue },
        { id: "back", kind: "lane", width: 3, path: lane },
      ],
      intersections: [],
      sidewalk: 2,
    };
  };

  const surface = (theme: string): { p: ColumnPlan; result: StreetSurfaceResult } => {
    const p = plan(region());
    const result = surfaceStreetGraph({
      graphs: [graph()],
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [],
      buildingPaths: new Set<string>(),
      seed: nodeSeed(11n, "world.downtown"),
      theme,
    });
    return { p, result };
  };

  /** Every surface block name this pass wrote, with counts. */
  const written = (p: ColumnPlan, road: Uint8Array): Map<string, number> => {
    const counts = new Map<string, number>();
    for (let k = 0; k < road.length; k++) {
      if (road[k] !== 1) continue;
      const name = nameOf(p.surface[k] as number);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  };

  it("surfaces a modern avenue in concrete, not dirt path", () => {
    const { p, result } = surface("modern_city");
    const counts = written(p, result.road);
    expect(counts.get("gray_concrete") ?? 0).toBeGreaterThan(0);
    expect(counts.get("dirt_path") ?? 0).toBe(0);
    // The verge is the carriageway: no gravel fringe against the sidewalk.
    expect(counts.get("gravel") ?? 0).toBe(0);
  });

  it("leaves a rural road.network@0 route on dirt path", () => {
    const p = plan(region());
    const hall = building("world.hall", -6, -20, 9, 9);
    const east = building("world.east", 12, 10, 7, 7);
    const plazaPlacement = building("world.plaza", -4, 12, 10, 10).placement;
    const result = buildRoadNetwork({
      nodePath: "world.lanes",
      params: {},
      seed: nodeSeed(7n, "world.lanes"),
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [hall.placement, east.placement, plazaPlacement],
      ports: [hall.port, east.port],
      plaza: plazaPlacement,
      buildingPaths: new Set(["world.hall", "world.east"]),
    });
    expect(result.surfacedColumns).toBeGreaterThan(0);
    const counts = written(p, result.roadColumns);
    expect(counts.get("dirt_path") ?? 0).toBeGreaterThan(0);
    expect(counts.get("gray_concrete") ?? 0).toBe(0);
  });

  it("mixes the worn tone in at a low, positional frequency", () => {
    const { p, result } = surface("modern_city");
    const counts = written(p, result.road);
    const body = counts.get("gray_concrete") as number;
    const worn = counts.get("light_gray_concrete") as number;
    const share = worn / (body + worn);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.2);
  });

  it("dashes a centre line down an avenue and nothing down a lane", () => {
    const { p, result } = surface("modern_city");
    const counts = written(p, result.road);
    const painted = counts.get("white_concrete") as number;
    expect(painted).toBeGreaterThan(0);
    // Dashed, not solid.
    expect(painted).toBeLessThan(AVENUE_CELLS * (MARKING_DASH / MARKING_PERIOD) + 2);
    // The line is on the avenue's own centre column, and nowhere else.
    for (let k = 0; k < p.surface.length; k++) {
      if (nameOf(p.surface[k] as number) !== "white_concrete") continue;
      expect(p.region.z0 + Math.floor(k / p.region.width)).toBe(0);
    }
  });

  it("gives a lane its own, rougher surface", () => {
    const { p, result } = surface("modern_city");
    expect(written(p, result.road).get("cobblestone") ?? 0).toBeGreaterThan(0);
  });

  it("follows the material theme", () => {
    const { p, result } = surface("temperate_timber");
    const counts = written(p, result.road);
    expect(counts.get("cobblestone") ?? 0).toBeGreaterThan(0);
    expect(counts.get("gray_concrete") ?? 0).toBe(0);
  });

  it("is deterministic: two runs write byte-identical surfaces", () => {
    const a = surface("modern_city");
    const b = surface("modern_city");
    expect(Array.from(b.p.surface)).toEqual(Array.from(a.p.surface));
    expect(Array.from(b.result.road)).toEqual(Array.from(a.result.road));
  });
});

describe("rotation agrees across packages", () => {
  /**
   * The grammar rotates its own ops; the solver rotates ports. If those two
   * disagree by even one axis, every door in every village opens into a wall.
   */
  it("stdlib rotateLocalColumn matches the solver's rotateLocal", () => {
    for (const yaw of [0, 90, 180, 270] as const) {
      for (const [sx, sz] of [[7, 9], [13, 11], [3, 3], [11, 4]] as const) {
        for (let x = 0; x < sx; x++) {
          for (let z = 0; z < sz; z++) {
            expect(rotateLocalColumn(x, z, sx, sz, yaw)).toEqual(rotateLocal(x, z, sx, sz, yaw));
          }
        }
      }
    }
  });
});
