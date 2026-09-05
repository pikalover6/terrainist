/**
 * The shore floor — a graded route may not cut the rim of the water beside it.
 *
 * ## The walked defect
 *
 * A generated world (`pirate_unicorn_war`, seed 301) failed the physics lint
 * with six columns of `LOAM-T110 UNSTABLE_FLUID` around a hill basin whose
 * water surface stood at y = 95:
 *
 *     water at (142, 95, -10); water at (162, 95, -10); water at (143, 95, -9)
 *
 * The basin itself was sound. A street crossed it, decked its middle, and
 * graded its two approaches down to 94 — one block *through* the rim the lake
 * was resting against — so the lake's edge was left with an open horizontal
 * face and would have drained on the first tick. The document was legal Loam;
 * the world was the compiler's mistake.
 *
 * ## The rule this file pins
 *
 * `gradeProfile` has always had a floor for exactly this, and it was
 * `seaLevel + 1`: one constant for the whole world, so a lane along the **ocean**
 * was held above its shoreline and a lane along a **tarn** three hundred blocks
 * above the sea was not. `routeFloorAt` makes that constant per body — the
 * surface of whatever water the route's own cross-section stands beside — and
 * that is what these tests measure, with the same `checkFluidStability` the
 * physics lint runs as the oracle.
 *
 * The fixture is the mechanism distilled: a highland tarn whose rim is a single
 * course of ground at the water's own surface, a swale falling away from that
 * rim, and two anchors that put the lane in the swale. The swale is the point —
 * without it the profile has no reason to cut, and the rule is untested. It is
 * also *not* the 512×512 world: the defect is one pass wide, and a synthetic
 * plan asks the question in 40 ms instead of five seconds.
 *
 * The rim assertion is the one that would have caught the near-miss: the cut
 * that opened the rim came through the **cross-section**, not the centreline —
 * the lane's own cells never touched the water, its kerb did — so the whole rim
 * course is checked rather than the columns the path happens to name. The last
 * test holds the fix honest in the other direction: the floor is local, and a
 * route away from the water still grades into the ground it is standing in.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import type { OccupancyGrid, Placement, ResolvedPort } from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { checkFluidStability } from "../src/terrain/validate.js";
import { buildRoadNetwork } from "../src/structures/roads.js";
import { index } from "../src/structures/sweep.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

/** Sea level, and deliberately nowhere near the water this file is about. */
const SEA = 63;
/** The tarn's surface — thirty-two blocks above the sea's. */
const TARN_SURFACE = 95;
/** Its bed. */
const TARN_BED = 92;
/** The one row of ground that holds the tarn in. */
const RIM_Z = 5;

/* -------------------------------------------------------------------------- */
/* the fixture: a highland tarn, its rim, and a swale falling away from it      */
/* -------------------------------------------------------------------------- */

function region(size = 96): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

/** Water everywhere north of the rim. */
function wet(z: number): boolean {
  return z > RIM_Z;
}

/**
 * The land: the rim at the water's own surface, then a swale falling one block
 * per row for four rows, then flat five blocks below the tarn.
 *
 * Every dry column adjacent to water is at `TARN_SURFACE`, which is what makes
 * the plan fluid-stable before a road pass touches it — asserted below, because
 * a fixture that starts broken would prove nothing.
 */
function height(z: number): number {
  if (wet(z)) return TARN_BED;
  if (z === RIM_Z) return TARN_SURFACE;
  if (z >= 1 && z < RIM_Z) return TARN_SURFACE - (RIM_Z - z);
  return TARN_SURFACE - RIM_Z;
}

function plan(r: Region): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const fluidKind = new Uint8Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const z = r.z0 + j;
      const k = j * r.width + i;
      ground[k] = height(z);
      fluidTop[k] = ground[k] as number;
      if (wet(z)) {
        fluidKind[k] = FluidKind.WATER;
        fluidTop[k] = TARN_SURFACE;
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
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 }
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
  y: number,
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
    foundationY: y
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
    floorY: y
  };
  return { placement, port };
}

/** Route the lanes over a fresh copy of the fixture and hand back the plan. */
function laneOverTheTarn(): { p: ColumnPlan; r: Region } {
  const r = region(96);
  const p = plan(r);
  const west = building("world.west", -34, 0, 8, 5, height(2));
  const east = building("world.east", 26, 0, 8, 5, height(2));
  const plaza = building("world.plaza", -4, 2, 10, 3, height(3)).placement;
  buildRoadNetwork({
    nodePath: "world.lanes",
    params: { width: 3, lanterns: false},
    seed: nodeSeed(7n, "world.lanes"),
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [west.placement, east.placement, plaza],
    ports: [west.port, east.port],
    plaza,
    buildingPaths: new Set(["world.west", "world.east"]),
    occupancy: occupancy(r)
  });
  return { p, r };
}

/* -------------------------------------------------------------------------- */

describe("a graded route beside a highland water body", () => {
  it("starts from a fixture the physics lint already accepts", () => {
    const r = region(96);
    expect(checkFluidStability(plan(r)).unstable).toBe(0);
  });

  it("leaves the tarn stable — zero findings from the physics lint's own predicate", () => {
    const { p } = laneOverTheTarn();
    expect(checkFluidStability(p).unstable).toBe(0);
  });

  it("never cuts the rim below the surface the tarn rests against", () => {
    const { p, r } = laneOverTheTarn();
    // Every column of the rim course, not just the ones the lane crossed: the
    // whole row is what holds the water in, and one cut column drains it.
    for (let x = r.x0 + 1; x < r.x0 + r.width - 1; x++) {
      const k = index(r, x, RIM_Z);
      expect(p.fluidKind[k], `rim at x=${x} is dry`).toBe(FluidKind.NONE);
      expect(p.ground[k] as number, `rim at x=${x}`).toBeGreaterThanOrEqual(TARN_SURFACE);
    }
  });

  it("floors the section near the water and nowhere else", () => {
    // The floor has to be *local*, or the fix is a worse defect than the one it
    // repairs: a route that merely passes a pond would be carried across the
    // country on an embankment at the pond's surface. Away from the rim the
    // lane still grades into the swale it is standing in.
    const { p, r } = laneOverTheTarn();
    let lowest = Number.POSITIVE_INFINITY;
    for (let x = -30; x <= 22; x++) {
      for (let z = -6; z <= 1; z++) {
        const y = p.ground[index(r, x, z)] as number;
        if (y < lowest) lowest = y;
      }
    }
    expect(lowest).toBeLessThan(TARN_SURFACE);
  });

  it("is the same twice", () => {
    const a = laneOverTheTarn();
    const b = laneOverTheTarn();
    expect(Array.from(a.p.ground)).toEqual(Array.from(b.p.ground));
    expect(Array.from(a.p.fluidTop)).toEqual(Array.from(b.p.fluidTop));
  });
});
