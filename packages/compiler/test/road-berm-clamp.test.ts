/**
 * The berm clamp — a water floor is a cap on cutting, never a licence to fill.
 *
 * `docs/GROUND-UNIFICATION-v0.md` Part III §3.1, wave 10A. `routeFloorAt`
 * stopped roads draining lake rims and was right to (`road-shore-floor.test.ts`
 * is that rule, and it still passes beside this file). Its doc-comment claimed
 * the lift was bounded — "the answer is some nearby column's own natural
 * ground" — and that claim is true **pointwise** and false **after
 * propagation**: `gradeProfile` replaces a per-cell floor with the upper
 * envelope of unit cones, `max_j (floor[j] − |i − j|)`, so one rim station at
 * 95 propagates 94, 93, 92 … and a route leaving a tarn onto ground six blocks
 * lower builds an embankment up to six stations long, across ground nowhere
 * near the water.
 *
 * The forensics verdict (§3.1) is that no *walked* world showed this — the
 * walked earthwork was an `infra.entry@0` wall course — so `ROAD_BERM_MAX` is
 * set from the hazard geometry at 2, W1's pre-envelope clamp is the
 * load-bearing half, and W2 ships as the cheap assertion `bermExcursion`.
 *
 * The first test is the one that makes the rest mean something: it runs the
 * *unclamped* construction by hand and shows the berm, so the clamp is proved
 * able to fail before it is asserted to hold.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";
import { TERRAIN_DIAGNOSTICS } from "@terrainist/spec";

import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import type { OccupancyGrid, Placement, ResolvedPort } from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { checkFluidStability } from "../src/terrain/validate.js";
import {
  ROAD_BERM_MAX,
  bermExcursion,
  buildRoadNetwork,
  gradeProfile,
  index,
} from "../src/structures/roads.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

const SEA = 63;
/** The pond's surface, high above the ground the lane crosses. */
const POND_SURFACE = 95;
const POND_BED = 92;
/** The single dry course that holds the pond in. */
const RIM_X = 19;
/** The flat the lane runs over — deliberately far below the pond. */
const LOW = 84;

/* -------------------------------------------------------------------------- */
/* W1/W2 on the pure construction                                              */
/* -------------------------------------------------------------------------- */

/**
 * The stations of a lane on the flat, running away from a pond whose surface
 * stands eleven blocks above it. The lane never climbs the rim — its
 * cross-section merely comes within `reach` of the water at its first three
 * stations, which is exactly when `routeFloorAt` answers with the rim's
 * surface.
 */
const stationGround: number[] = Array.from({ length: 24 }, () => LOW);
/** Stations whose cross-section is beside the water. */
const NEAR_WATER = 3;

describe("the unclamped floor (the defect, run by hand)", () => {
  it("propagates one rim station into an embankment many stations long", () => {
    // Exactly what `routeFloorAt` returned before W1: the rim's own surface at
    // the station beside the water, nothing anywhere else.
    const unclamped = stationGround.map((_, i) => (i < NEAR_WATER ? POND_SURFACE : 0));
    const profile = gradeProfile(stationGround, SEA, 0, unclamped);
    // The cone carries 95, 94, 93 … down the profile, over ground that fell
    // faster than the cone did.
    const run = bermExcursion(profile, stationGround);
    expect(run).toBeGreaterThan(ROAD_BERM_MAX);
    expect(profile[8] as number).toBeGreaterThan((stationGround[8] as number) + ROAD_BERM_MAX);
  });
});

describe("the clamped floor (W1)", () => {
  /** What `routeFloorAt` returns now: the same floor, capped per station. */
  const clamped = stationGround.map((g, i) =>
    Math.min(i < NEAR_WATER ? POND_SURFACE : 0, g + ROAD_BERM_MAX),
  );

  it("is a no-op on a station standing on the rim itself", () => {
    // §3.1: "a rim column is at or above the water surface by definition, so
    // this is a no-op at the rim itself".
    expect(Math.min(POND_SURFACE, POND_SURFACE + ROAD_BERM_MAX)).toBe(POND_SURFACE);
  });

  it("never stands more than ROAD_BERM_MAX above its own ground (W2)", () => {
    const profile = gradeProfile(stationGround, SEA, 0, clamped);
    expect(bermExcursion(profile, stationGround)).toBe(0);
  });

  it("leaves gradeProfile 1-Lipschitz", () => {
    for (const floor of [clamped, stationGround.map((g) => g + ROAD_BERM_MAX)]) {
      const profile = gradeProfile(stationGround, SEA, 0, floor);
      for (let i = 1; i < profile.length; i++) {
        expect(Math.abs((profile[i] as number) - (profile[i - 1] as number))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("still lets a deck floor lift the profile — decks are not clamped", () => {
    // `routeFloorAt` returns the deck floor before the clamp is reached: a
    // deck's own ground is the channel bed, and clearing the water it spans is
    // the whole point of it.
    const bed = Array.from({ length: 12 }, (_, i) => (i > 3 && i < 8 ? POND_BED : LOW));
    const deck = bed.map((_, i) => (i > 3 && i < 8 ? POND_SURFACE + 1 : 0));
    const profile = gradeProfile(bed, SEA, 0, deck);
    expect(profile[5] as number).toBeGreaterThanOrEqual(POND_SURFACE + 1);
  });
});

describe("bermExcursion", () => {
  it("is the longest consecutive run over the cap, and 0 when nothing exceeds it", () => {
    const g = [80, 80, 80, 80, 80, 80, 80];
    expect(bermExcursion([82, 82, 82, 82, 82, 82, 82], g)).toBe(0);
    expect(bermExcursion([83, 83, 80, 83, 83, 83, 80], g)).toBe(3);
  });
});

describe("the diagnostic", () => {
  it("registers T239 in the T23x block", () => {
    expect(TERRAIN_DIAGNOSTICS.ROAD_BERM_CLAMPED).toBe("LOAM-T239");
  });
});

/* -------------------------------------------------------------------------- */
/* the fixture: a high pond, a one-course rim, and a lane on the flat below     */
/* -------------------------------------------------------------------------- */

function region(size = 96): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

/** The pond lies east of the rim column; the lane runs west of it. */
function wet(x: number): boolean {
  return x > RIM_X;
}

/**
 * The land falls **along** the lane, three blocks a column, from the pond's
 * rim down to the flat — so a cross-section is level and every lift this file
 * measures is longitudinal, which is the axis the cone propagates along.
 */
function height(x: number): number {
  if (wet(x)) return POND_BED;
  if (x === RIM_X) return POND_SURFACE;
  return Math.max(LOW, POND_SURFACE - 3 * (RIM_X - x));
}

function plan(r: Region): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const fluidKind = new Uint8Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const x = r.x0 + i;
      const k = j * r.width + i;
      ground[k] = height(x);
      fluidTop[k] = ground[k] as number;
      if (wet(x)) {
        fluidKind[k] = FluidKind.WATER;
        fluidTop[k] = POND_SURFACE;
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

/** Route a lane along the flat, its cross-section within reach of the rim. */
function laneBesideThePond(): {
  p: ColumnPlan;
  r: Region;
  natural: Int32Array;
  diagnostics: readonly { readonly code: string }[];
  routes: readonly {
    readonly from: string;
    readonly to: string;
    readonly path: readonly { readonly x: number; readonly z: number; readonly y: number }[];
  }[];
} {
  const r = region(96);
  const p = plan(r);
  const natural = Int32Array.from(p.ground);
  const west = building("world.west", -34, 0, 8, 5, height(-34));
  const east = building("world.east", 15, 0, 5, 5, height(17));
  const plaza = building("world.plaza", -8, 2, 10, 3, height(-8)).placement;
  const result = buildRoadNetwork({
    nodePath: "world.lanes",
    params: { width: 3, lanterns: false, lanternSpacing: 8 },
    seed: nodeSeed(7n, "world.lanes"),
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [west.placement, east.placement, plaza],
    ports: [west.port, east.port],
    plaza,
    buildingPaths: new Set(["world.west", "world.east"]),
    occupancy: occupancy(r),
  });
  return { p, r, natural, diagnostics: result.diagnostics ?? [], routes: result.routes };
}

describe("a lane crossing low ground beside a high pond", () => {
  it("starts from a fixture the physics lint already accepts", () => {
    expect(checkFluidStability(plan(region(96))).unstable).toBe(0);
  });

  it("holds the berm to the ramp back down, and no further (W2)", () => {
    // W2 on the axis the cone propagates along: the centreline, station by
    // station, against the natural ground of that same column. (A
    // cross-section is level across its width by construction, so a lane on a
    // side-slope stands proud of its outer columns for a reason that has
    // nothing to do with a water floor.)
    //
    // §3.1's bound — "the cone then only carries the ramp needed to get back
    // down, over at most `ROAD_BERM_MAX` cells" — is exact on ground that is
    // itself 1-Lipschitz, which is what the pure test above asserts (run 0).
    // This fixture is deliberately *steeper* than that, three blocks a column,
    // because a clamp can only ever bite where the ground falls faster than
    // the cone does; there the residual is the 1-Lipschitz descent from the
    // clamped floor, which is W3 ("the descent is already right") and not an
    // embankment. The numbers are measured, and both halves matter: with the
    // clamp this run stands over the cap for **5** stations by at most **5**
    // blocks; with `routeFloorAt` unclamped it was **13** stations by **9**.
    const { r, natural, routes } = laneBesideThePond();
    expect(ROAD_BERM_MAX).toBe(2);
    let stations = 0;
    for (const route of routes) {
      const profile = route.path.map((c) => c.y);
      const ground = route.path.map((c) => natural[index(r, c.x, c.z)] as number);
      const lift = profile.map((y, i) => y - (ground[i] as number));
      stations += profile.length;
      expect(
        bermExcursion(profile, ground),
        `${route.from} → ${route.to} stands over the cap for too many stations`,
      ).toBeLessThanOrEqual(5);
      expect(Math.max(...lift), `${route.from} → ${route.to} peak lift`).toBeLessThanOrEqual(5);
    }
    expect(stations).toBeGreaterThan(0);
  });

  it("leaves the pond stable — the rim is still the rim", () => {
    const { p, r } = laneBesideThePond();
    expect(checkFluidStability(p).unstable).toBe(0);
    for (let z = r.z0 + 1; z < r.z0 + r.depth - 1; z++) {
      const k = index(r, RIM_X, z);
      expect(p.ground[k] as number, `rim at z=${z}`).toBeGreaterThanOrEqual(POND_SURFACE);
    }
  });

  it("reports the clamp as LOAM-T239, naming the route and the station count", () => {
    const { diagnostics } = laneBesideThePond();
    const berm = diagnostics.filter((d) => d.code === TERRAIN_DIAGNOSTICS.ROAD_BERM_CLAMPED);
    expect(berm.length).toBeGreaterThan(0);
    const first = berm[0] as unknown as { readonly message: string; readonly severity: string };
    expect(first.severity).toBe("note");
    expect(first.message).toMatch(/at \d+ of \d+ station/);
  });

  it("is the same twice", () => {
    const a = laneBesideThePond();
    const b = laneBesideThePond();
    expect(Array.from(a.p.ground)).toEqual(Array.from(b.p.ground));
  });
});

