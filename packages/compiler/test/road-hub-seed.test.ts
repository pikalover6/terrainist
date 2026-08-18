/**
 * The unrouted hub, and the shaft it used to dig.
 *
 * `buildRoadNetwork` seeds the hub cell into the road mask before it routes
 * anything. It used to seed only the *mask* — `roadY` is a zero-initialised
 * `Int32Array`, so a hub nothing ever routed to kept a declared level of y=0,
 * and the shoulder blend, which seeds its dilation from `roadY`, graded the
 * five-by-five around it down toward bedrock at one block a ring. On a hilltop
 * that is a ninety-block shaft with an unclaimed natural pillar at its centre,
 * which is what a walk of `pirate_unicorn_war` found.
 *
 * The property under test is the one a verge can never be allowed to break: a
 * shoulder is a *bank beside a lane*, so no declared verge column may sit more
 * than `ROAD_SHOULDER_REACH` blocks from the ground it was cut into.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { Placement, ResolvedPort } from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { buildRoadNetwork, ROAD_SHOULDER_REACH } from "../src/structures/roads.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const GROUND = 93;

function region(size = 64): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, water: (x: number, z: number) => boolean = () => false): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const fluidKind = new Uint8Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const x = r.x0 + i;
      const z = r.z0 + j;
      const k = j * r.width + i;
      ground[k] = GROUND;
      fluidTop[k] = GROUND;
      if (water(x, z)) {
        fluidKind[k] = FluidKind.WATER;
        fluidTop[k] = SEA;
        ground[k] = SEA - 6;
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

function building(
  id: string,
  x0: number,
  z0: number,
  w: number,
  d: number,
  y = GROUND,
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

describe("the hub's own level", () => {
  const r = region(64);

  /**
   * A channel across the whole map, far too wide to bridge: the only anchor is
   * marooned on the far side, so the pass surfaces no route at all and the hub
   * keeps the level it was seeded with.
   */
  function marooned() {
    const p = plan(r, (_x, z) => z >= -12 && z <= 11);
    // The natural ground, before the pass commits anything: with no ground
    // driver in the fixture the pass writes its levels straight into
    // `plan.ground`, so comparing against it afterwards would compare a claim
    // with itself.
    const natural = Int32Array.from(p.ground);
    const cottage = building("world.marooned", -4, -24, 7, 7);
    const plazaPlacement = building("world.plaza", -4, 14, 10, 10).placement;
    const result = buildRoadNetwork({
      nodePath: "world.lanes",
      params: {},
      seed: nodeSeed(7n, "world.lanes"),
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [cottage.placement, plazaPlacement],
      ports: [cottage.port],
      plaza: plazaPlacement,
      buildingPaths: new Set(["world.marooned"]),
    });
    return { natural, result };
  }

  it("routes nothing — the fixture is the defect's shape", () => {
    const { result } = marooned();
    expect(result.routes).toEqual([]);
    expect(result.unrouted).toEqual(["world.marooned"]);
  });

  it("never declares a verge more than the shoulder reach from natural ground", () => {
    const { natural, result } = marooned();
    for (const claim of result.declaration.shoulders) {
      const g = natural[claim.idx] as number;
      expect(Math.abs(claim.y - g)).toBeLessThanOrEqual(ROAD_SHOULDER_REACH);
    }
  });

  it("declares nothing anywhere near the void", () => {
    // The shaft's signature: a verge target down at y≈0..2 under a hilltop.
    const { result } = marooned();
    for (const claim of result.declaration.shoulders) {
      expect(claim.y).toBeGreaterThan(SEA);
    }
  });
});
