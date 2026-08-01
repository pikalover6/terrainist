/**
 * `precinct.harbour@0` — the harbour that goes and finds the coast.
 *
 * The kit used to hard-fail whenever the solver's box happened not to contain a
 * shoreline, which made every large world a coin flip: the coastline is decided
 * by the seed and the region size, the envelope is decided by a `zone` token,
 * and nothing was reconciling the two. U6 makes the harbour search.
 *
 * These are unit tests over a synthetic column plan rather than compiled
 * worlds, because the question is entirely about *where the water is* and a
 * hand-built sea is the only way to ask it precisely — including the case that
 * must still fail, a world with no sea at all.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Seed256 } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import type { Rect } from "../src/layout/frames.js";
import type { Placement } from "../src/layout/types.js";
import { buildPrecincts, type PrecinctJob } from "../src/structures/precincts.js";
import { centeredRegion } from "@terrainist/stdlib";

const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEED: Seed256 = nodeSeed(20260801n, "world.port", "");
const SEA_LEVEL = 63;

/**
 * A square world whose water is wherever `wet(x, z)` says.
 *
 * Land stands at 68, the sea bed at 55, which gives a quay a real wall to build
 * and a pier real water to reach into.
 */
function makePlan(size: number, wet: (x: number, z: number) => boolean): ColumnPlan {
  const region = centeredRegion(size, size);
  const n = size * size;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const fluidKind = new Uint8Array(n);
  const oceanMask = new Uint8Array(n);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const x = region.x0 + i;
      const z = region.z0 + j;
      if (wet(x, z)) {
        ground[idx] = 55;
        fluidTop[idx] = SEA_LEVEL;
        fluidKind[idx] = FluidKind.WATER;
        oceanMask[idx] = 1;
      } else {
        ground[idx] = 68;
        fluidTop[idx] = 68;
      }
    }
  }
  return {
    region,
    ground,
    fluidTop,
    fluidKind,
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask,
    seaLevel: SEA_LEVEL,
    stoneSeed: 1,
    states: { bedrock: 1, stone: 2, deepslate: 3, water: 4, lava: 5, snowLayer: 6, caveAir: 7 },
  };
}

function placementFor(rect: Rect): Placement {
  return {
    nodePath: "world.port",
    id: "port",
    translation: [rect.x0, 68, rect.z0],
    yaw: 0,
    mirror: false,
    size: [rect.x1 - rect.x0 + 1, 16, rect.z1 - rect.z0 + 1],
    footprint: rect,
    anchor: { x: (rect.x0 + rect.x1) >> 1, z: (rect.z0 + rect.z1) >> 1 },
    foundationY: 68,
  };
}

function harbourJob(rect: Rect, constraints?: readonly Readonly<Record<string, unknown>>[]): PrecinctJob {
  return {
    nodePath: "world.port",
    generator: "precinct.harbour@0",
    placement: placementFor(rect),
    params: { piers: 3 },
    seed: SEED,
    tags: ["port"],
    ports: {},
    ...(constraints === undefined ? {} : { constraints }),
  };
}

function run(plan: ColumnPlan, job: PrecinctJob) {
  return buildPrecincts({ jobs: [job], plan, stack });
}

/** A world whose sea is the northern third: water at `z < -60`. */
const NORTH_SEA = (size: number): ColumnPlan => makePlan(size, (_x, z) => z < -60);

/* -------------------------------------------------------------------------- */

describe("a harbour whose envelope already holds a shoreline", () => {
  it("builds where it was placed and does not move", () => {
    const plan = NORTH_SEA(384);
    // Straddling the waterline at z = -60.
    const out = run(plan, harbourJob({ x0: -52, z0: -100, x1: 51, z1: -25 }));
    expect(out.stats.harbours).toBe(1);
    expect(out.relocations.size).toBe(0);
    expect(out.diagnostics).toEqual([]);
    expect(out.stats.piers).toBeGreaterThan(0);
  });
});

describe("a harbour whose preferred zone has no coast in it", () => {
  const plan = NORTH_SEA(384);
  // Deep inland, at the southern edge: not one wet column.
  const out = run(plan, harbourJob({ x0: -52, z0: 80, x1: 51, z1: 155 }));

  it("finds the coastline instead of failing", () => {
    expect(out.stats.harbours).toBe(1);
    expect(out.stats.piers).toBeGreaterThan(0);
    expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("says so, with the code and a fix that names the hard pin", () => {
    const note = out.diagnostics.find((d) => d.code === "LOAM-W409");
    expect(note?.severity).toBe("warning");
    expect(note?.message).toContain("reseated itself");
    expect(note?.fix).toContain('"strength": "hard"');
  });

  it("seats itself across the actual waterline", () => {
    const moved = out.relocations.get("world.port");
    expect(moved).toBeDefined();
    const rect = (moved as Placement).footprint;
    // The waterline is z = -60; the box has to contain it.
    expect(rect.z0).toBeLessThan(-60);
    expect(rect.z1).toBeGreaterThan(-60);
    // …and it is still the size the author asked for.
    expect(rect.x1 - rect.x0).toBe(103);
    expect(rect.z1 - rect.z0).toBe(75);
  });

  it("prefers the coast nearest the zone it was asked for", () => {
    const moved = out.relocations.get("world.port") as Placement;
    const far = run(NORTH_SEA(384), harbourJob({ x0: -180, z0: 80, x1: -77, z1: 155 }));
    const movedFar = far.relocations.get("world.port") as Placement;
    // Two harbours asked for different corners of the same town get different
    // stretches of the same coast — the zone biases, it does not decide.
    expect(movedFar.footprint.x0).toBeLessThan(moved.footprint.x0);
  });

  it("is the same site on every run", () => {
    const again = run(NORTH_SEA(384), harbourJob({ x0: -52, z0: 80, x1: 51, z1: 155 }));
    expect(again.relocations.get("world.port")?.footprint).toEqual(
      out.relocations.get("world.port")?.footprint,
    );
  });
});

describe("a world with no coast at all", () => {
  const plan = makePlan(384, () => false);
  const out = run(plan, harbourJob({ x0: -52, z0: 80, x1: 51, z1: 155 }));

  it("still fails, and blames the world rather than the envelope", () => {
    expect(out.stats.harbours).toBe(0);
    const err = out.diagnostics.find((d) => d.severity === "error");
    expect(err?.code).toBe("LOAM-E170");
    expect(err?.message).toContain("searched the whole region");
    expect(err?.message).toContain("the envelope is not the problem");
    expect(err?.fix).toContain("continentalness");
  });
});

describe("a harbour the author pinned", () => {
  const plan = NORTH_SEA(384);
  const out = run(
    plan,
    harbourJob({ x0: -52, z0: 80, x1: 51, z1: 155 }, [{ type: "zone", zone: "south", strength: "hard" }]),
  );

  it("fails in place rather than overruling the pin", () => {
    expect(out.stats.harbours).toBe(0);
    expect(out.relocations.size).toBe(0);
    const err = out.diagnostics.find((d) => d.severity === "error");
    expect(err?.code).toBe("LOAM-E170");
    expect(err?.message).toContain("pinned to its envelope");
    expect(err?.fix).toContain("drop the hard");
  });

  it("moves for a soft zone, which is what a bare {\"zone\": …} is", () => {
    const soft = run(NORTH_SEA(384), harbourJob({ x0: -52, z0: 80, x1: 51, z1: 155 }, [
      { type: "zone", zone: "south" },
    ]));
    expect(soft.relocations.size).toBe(1);
  });
});

describe("the search respects ground another structure already claimed", () => {
  it("never seats a quay on top of a placed building", () => {
    const plan = NORTH_SEA(384);
    const region = plan.region;
    const mask = new Uint8Array(region.width * region.depth);
    // Claim the entire western half of the coast.
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        if (region.x0 + i < 0) mask[j * region.width + i] = 1;
      }
    }
    const out = buildPrecincts({
      jobs: [harbourJob({ x0: -52, z0: 80, x1: 51, z1: 155 })],
      plan,
      stack,
      occupancy: { region, mask, byTag: new Map() },
    });
    const moved = out.relocations.get("world.port");
    expect(moved).toBeDefined();
    expect((moved as Placement).footprint.x0).toBeGreaterThanOrEqual(0);
  });
});
