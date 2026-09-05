/**
 * **The waterline floor may not fill the water that is already there** — the
 * other half of `PlatformInput.waterFloor`, and the regression the flag-matrix
 * walk caught on `overgrown_metropolis_hideout`.
 *
 * `platform-waterline.test.ts` pins the rule that a platform may not be elected
 * *under* the sea: grading dry ground down below the waterline makes a lake and
 * the fabric is then laid on it. This file pins its mirror image.
 *
 * A `"stepped"` quarter with a river running through it splits into buckets,
 * and the channel — sixteen columns of bed at y≈55 under water at y=63 — is one
 * of them. The floor raised that piece to the waterline, so the district's pad
 * edit graded **the bed up to the surface**: a dam. And a dam is not a local
 * loss, because the ocean flood-fill floods only what the map edge can reach
 * (`computeOceanMask`) — the whole reach upstream of it was cut off from the sea
 * and reclassified dry. The walked world lost 2,121 water columns: half a river
 * ran, the other half was an empty deepslate trench, and a 20-block office shell
 * stood on 240 columns of what had been the riverbed, because a dry bed reads as
 * ordinary land to the lot election.
 *
 * So the floor is told what water already exists (`PlatformInput.water`) and a
 * platform that *is* water — a channel, not a bank — keeps the level its own bed
 * gives it. The Troy rule is untouched: every platform of *ground* is still held
 * to the waterline, which is what the sibling file asserts.
 *
 * Three blocks, in the shape of the sibling:
 *
 * 1. the unit rule on `derivePlatforms` — the harness first proved able to see
 *    the difference (without the mask the same field fills the channel);
 * 2. the same rule on `dissolveTallPairs` — a channel does not surface because
 *    a neighbour dissolved into it;
 * 3. a compiled fixture: a grid quarter astride a river running to the coast,
 *    whose river must still cross the quarter.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { HeightField } from "@terrainist/stdlib";

import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import {
  DISSOLVE_DROP_MAX,
  damsWater,
  derivePlatforms,
  dissolveTallPairs,
  type WaterMask
} from "../src/layout/platforms.js";
import { compileArtifacts, compileTerrain  } from "../src/terrain/compile.js";

/** The sea level every fixture here uses — the profile's own default. */
const SEA_LEVEL = 63;

/* -------------------------------------------------------------------------- */
/* a quarter with a river through it                                           */
/* -------------------------------------------------------------------------- */

const SIDE = 40;
const BOUNDS: Rect = { x0: 0, z0: 0, x1: SIDE - 1, z1: SIDE - 1 };
/** The channel: sixteen columns of bed, wide enough to survive the blur. */
const CHANNEL_X0 = 14;
const CHANNEL_X1 = 25;

/** Is this column the channel's? */
function inChannel(x: number): boolean {
  return x >= CHANNEL_X0 && x <= CHANNEL_X1;
}

/**
 * A shelf at y=71 cut by a channel at y=55, with the water at {@link SEA_LEVEL}
 * standing in it. This is the metropolis in miniature: one block of free ground
 * whose buckets span a *wet* bed rather than a dry shoulder.
 */
function valley(): HeightField {
  const values = new Float64Array(SIDE * SIDE);
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) values[j * SIDE + i] = inChannel(i) ? 55 : 71;
  }
  return { region: { x0: 0, z0: 0, width: SIDE, depth: SIDE }, values } as unknown as HeightField;
}

/** The water standing in that channel — the classification's ocean ∪ lake mask. */
function riverMask(): WaterMask {
  const mask = new Uint8Array(SIDE * SIDE);
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) if (inChannel(i)) mask[j * SIDE + i] = 1;
  }
  return { mask, region: { x0: 0, z0: 0, width: SIDE, depth: SIDE } };
}

/** One block spanning the whole footprint: nothing is street. */
function free(): Uint8Array {
  return new Uint8Array(SIDE * SIDE);
}

describe("the floor fills no water that was already there", () => {
  const input = {
    bounds: BOUNDS,
    blocked: free(),
    field: valley(),
    tiered: true,
    waterFloor: SEA_LEVEL
  };

  it("dams the channel when it is not told the water is there", () => {
    // The harness must be able to see the difference before the next test's
    // "the channel kept its bed" means anything. This is the shipped bug, in
    // one line: every platform, the river included, at or above the surface.
    const benches = derivePlatforms(input);
    expect(benches.length).toBeGreaterThan(1);
    for (const bench of benches) expect(bench.level).toBeGreaterThanOrEqual(SEA_LEVEL);
  });

  it("leaves the channel at its bed once it is told", () => {
    const benches = derivePlatforms({ ...input, water: riverMask() });
    const wet = benches.filter((b) => b.runs.some((r) => inChannel(r.x0) && inChannel(r.x1)));
    expect(wet.length).toBeGreaterThan(0);
    for (const bench of wet) expect(bench.level).toBeLessThan(SEA_LEVEL);
  });

  it("still holds every platform of ground to the floor", () => {
    // The Troy rule, unchanged: only the water is exempt, and a bank with its
    // toes wet is not water.
    const benches = derivePlatforms({ ...input, water: riverMask() });
    const dry = benches.filter((b) => b.runs.every((r) => !inChannel(r.x0) && !inChannel(r.x1)));
    expect(dry.length).toBeGreaterThan(0);
    for (const bench of dry) expect(bench.level).toBeGreaterThanOrEqual(SEA_LEVEL);
  });

  it("is unchanged by a mask with no water in it", () => {
    const none: WaterMask = {
      mask: new Uint8Array(SIDE * SIDE),
      region: { x0: 0, z0: 0, width: SIDE, depth: SIDE }
    };
    expect(derivePlatforms({ ...input, water: none })).toEqual(derivePlatforms(input));
  });
});

describe("reclaiming and damming are told apart by the flood-fill", () => {
  const SIZE = 24;
  const region = { x0: 0, z0: 0, width: SIZE, depth: SIZE };
  const quarter: Rect = { x0: 6, z0: 6, x1: 17, z1: 17 };
  const maskOf = (wet: (x: number, z: number) => boolean): WaterMask => {
    const mask = new Uint8Array(SIZE * SIZE);
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) if (wet(x, z)) mask[z * SIZE + x] = 1;
    return { mask, region };
  };

  it("calls a bay the quarter's edge dips into reclamation", () => {
    // Open water from the west edge, ending inside the quarter: filling it
    // strands nothing, because nothing is behind it.
    expect(damsWater(maskOf((x, z) => x <= 9 && z >= 8 && z <= 12), quarter)).toBe(false);
  });

  it("calls a channel crossing the quarter a dam", () => {
    // The same water, carried through the quarter to a reach on the far side:
    // fill the middle and the east reach can no longer reach any edge.
    expect(damsWater(maskOf((x, z) => z >= 10 && z <= 13 && x <= 20), quarter)).toBe(true);
  });

  it("does not mistake a landlocked lake for a reach it stranded", () => {
    // Unreachable from the edge in both runs — it is a basin, not a river, and
    // the quarter did nothing to it.
    expect(damsWater(maskOf((x, z) => x >= 8 && x <= 15 && z >= 8 && z <= 15), quarter)).toBe(false);
  });
});

describe("the dissolve fills no water either", () => {
  const bounds: Rect = { x0: 0, z0: 0, x1: 9, z1: 3 };
  /** A channel under the sea beside a shelf far enough above it to dissolve. */
  const pair = (): FormBench[] => [
    { id: "channel", runs: [{ x0: 0, z0: 0, x1: 4, z1: 3 }], level: SEA_LEVEL - 8 },
    {
      id: "shelf",
      runs: [{ x0: 5, z0: 0, x1: 9, z1: 3 }],
      level: SEA_LEVEL - 8 + DISSOLVE_DROP_MAX + 1
    }
  ];
  /** Water over the channel half only. */
  const water = (): WaterMask => {
    const mask = new Uint8Array(10 * 4);
    for (let j = 0; j < 4; j++) for (let i = 0; i <= 4; i++) mask[j * 10 + i] = 1;
    return { mask, region: { x0: 0, z0: 0, width: 10, depth: 4 } };
  };

  it("surfaces the channel when it is not told the water is there", () => {
    const out = dissolveTallPairs(bounds, pair(), SEA_LEVEL);
    expect(out.benches[0]?.level).toBe(SEA_LEVEL);
  });

  it("leaves the channel at its bed and still floors the ground beside it", () => {
    const out = dissolveTallPairs(bounds, pair(), SEA_LEVEL, water());
    expect(out.benches[0]?.level).toBe(SEA_LEVEL - 8);
    expect(out.benches[1]?.level).toBeGreaterThanOrEqual(SEA_LEVEL);
  });

  it("never dissolves a shelf down into the channel it stands over", () => {
    // The dissolve hands the higher platform the lower one's level, and the
    // lower one here is a riverbed. The floor still applies to the *ground*.
    const out = dissolveTallPairs(bounds, pair(), SEA_LEVEL, water());
    for (const bench of out.benches) {
      if (bench.id === "channel") continue;
      expect(bench.level).toBeGreaterThanOrEqual(SEA_LEVEL);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the compiled quarter                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A grid quarter astride a river running to the coast — the walked world's
 * shape at a quarter of its area, and `"stepped"` for the same reason it was:
 * the relief election reads the valley and steps the ground nobody asked to be
 * stepped.
 *
 * Under the bug this compiles with the channel graded to the waterline through
 * the quarter: 86 of the 151 cross-sections of the course inside the quarter
 * hold no water at all, and the reach above the dam drains.
 */
const RIVER_QUARTER = {
  loam: "0.1",
  profile: "settlement",
  meta: {
    name: "river_quarter",
    worldSeed: "304",
    prompt: "a quarter astride a river running to the sea"
  },
  root: {
    id: "world",
    kind: "composite",
    envelope: { shape: "region", size: [256, 256] },
    children: [
      {
        id: "terrain",
        kind: "generator",
        generator: "terrain.heightfield@0",
        params: {
          seaLevel: SEA_LEVEL,
          baseHeight: 68,
          amplitude: 24,
          frequency: 0.003,
          beachWidth: 4
        },
        children: [
          {
            id: "shelf",
            kind: "generator",
            generator: "terrain.edit@0",
            params: { verb: "plateau", at: [0.5, 0.5], radius: 85, height: 6, profile: "rounded" }
          },
          {
            id: "river",
            kind: "generator",
            generator: "terrain.edit@0",
            params: {
              verb: "river",
              course: [
                [0.1, 0.48],
                [0.42, 0.46],
                [0.72, 0.54],
                "coast"
              ],
              width: 16,
              depth: 8,
              profile: "sharp"
            }
          }
        ]
      },
      { id: "climate", kind: "generator", generator: "terrain.climate@0", params: { forceTheme: "temperate" } },
      {
        id: "quarter",
        kind: "district",
        envelope: { shape: "region", size: [150, 130] },
        params: { fabric: "grid", density: "high", blockSize: 42, mix: ["cottage", "townhouse"] },
        constraints: [{ zone: "center" }]
      }
    ]
  }
} as unknown;

describe("a stepped quarter astride a river, compiled", () => {
  const scratch: string[] = [];
  let ok = false;
  let unstable = 0;
  /** Cross-sections of the course inside the quarter that hold no water. */
  let dryCrossSections = 0;
  let wetColumns = 0;
  let lotColumns = 0;
  let wetLotColumns = 0;

  beforeAll(async () => {
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-waterline-river-"));
    scratch.push(root);
    let plan: {
      region: { x0: number; z0: number; width: number; depth: number };
      fluidKind: Uint8Array;
    } | null = null;
    const art = await compileArtifacts(RIVER_QUARTER, {});
    plan = art.ok ? (art.artifacts.plan as unknown as typeof plan) : null;
    const compiled = await compileTerrain(RIVER_QUARTER, {
      outDir: path.join(root, "river_quarter")
    });
    ok = compiled.ok;
    unstable = (compiled.diagnostics ?? []).filter((d) => d.name === "UNSTABLE_FLUID").length;
    const p = plan as unknown as {
      region: { x0: number; z0: number; width: number; depth: number };
      fluidKind: Uint8Array;
    } | null;
    if (p === null) return;
    const fluid = (x: number, z: number): boolean =>
      p.fluidKind[(z - p.region.z0) * p.region.width + (x - p.region.x0)] !== 0;
    for (let x = -75; x <= 75; x++) {
      let width = 0;
      for (let z = -65; z <= 65; z++) if (fluid(x, z)) width += 1;
      wetColumns += width;
      if (width === 0) dryCrossSections += 1;
    }
    const report = (compiled.report ?? {}) as unknown as {
      layout?: { structures?: { buildings?: readonly { footprint: Rect }[] } };
    };
    for (const building of report.layout?.structures?.buildings ?? []) {
      const f = building.footprint;
      for (let z = f.z0; z <= f.z1; z++) {
        for (let x = f.x0; x <= f.x1; x++) {
          lotColumns += 1;
          if (fluid(x, z)) wetLotColumns += 1;
        }
      }
    }
  }, 300_000);

  afterAll(async () => {
    for (const dir of scratch) await rm(dir, { recursive: true, force: true });
  });

  it("compiles, with no fluid that would flow on the first tick", () => {
    expect(unstable).toBe(0);
    expect(ok).toBe(true);
  });

  it("does not dam the river it was laid across", () => {
    // Measured: 1,951 wet columns and 16 dry cross-sections with the rule,
    // 718 and 86 without it. The thresholds sit between the two, not on
    // either — a bend of the course may legitimately miss a slice.
    expect(wetColumns).toBeGreaterThan(1500);
    expect(dryCrossSections).toBeLessThan(30);
  });

  it("puts no lot column in the water it kept", () => {
    expect(lotColumns).toBeGreaterThan(0);
    expect(wetLotColumns).toBe(0);
  });
});

/**
 * A coastal quarter whose grid elects an entire infill footprint on the bed of
 * its preserved river. Before the footprint seat was held to the waterline, its
 * pad removed the water at y=63 and left dry ground at y=60 beside the standing
 * channel: the exact first-tick breach from `war_torn_manhattan`.
 */
const COASTAL_INFILL = {
  loam: "0.1",
  profile: "settlement",
  meta: {
    name: "coastal_infill",
    worldSeed: "8042605784900685458",
    prompt: "a dense city quarter beside a wide river"
  },
  root: {
    id: "world",
    kind: "composite",
    envelope: { shape: "region", size: [128, 128] },
    children: [
      {
        id: "terrain",
        kind: "generator",
        generator: "terrain.heightfield@0",
        params: {
          seaLevel: SEA_LEVEL,
          baseHeight: 71,
          amplitude: 14,
          frequency: 0.003,
          beachWidth: 3,
          continentalness: { frequency: 0.001, seaFraction: 0.28 }
        },
        children: [
          {
            id: "river",
            kind: "generator",
            generator: "terrain.edit@0",
            params: {
              verb: "valley",
              course: [[0.16, 0.08], [0.18, 0.4], [0.2, 0.72], "coast"],
              width: 48,
              depth: 18,
              profile: "rounded"
            }
          },
          {
            id: "east_river",
            kind: "generator",
            generator: "terrain.edit@0",
            params: {
              verb: "valley",
              course: [[0.84, 0.08], [0.8, 0.4], [0.76, 0.72], "coast"],
              width: 44,
              depth: 18,
              profile: "rounded"
            }
          },
          {
            id: "bedrock",
            kind: "generator",
            generator: "terrain.edit@0",
            params: {
              verb: "plateau",
              at: [0.48, 0.48],
              radius: 140,
              height: 5,
              profile: "rounded"
            }
          }
        ]
      },
      {
        id: "climate",
        kind: "generator",
        generator: "terrain.climate@0",
        params: { forceTheme: "temperate" }
      },
      {
        id: "quarter",
        kind: "district",
        envelope: { shape: "region", size: [70, 64] },
        constraints: [{ at: [0.5, 0.72] }],
        params: { fabric: "grid", density: "high", blockSize: 34, mix: ["cottage"] }
      }
    ]
  }
} as unknown;

describe("coastal infill footprints", () => {
  it("reclaims a wet footprint at the waterline instead of opening the river", async () => {
    const result = await compileArtifacts(COASTAL_INFILL, {});
    expect(result.ok).toBe(true);
  });
});
