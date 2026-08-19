/**
 * **A platform may not be elected under the water beside it** — the waterline
 * floor on the platform election (`PlatformInput.waterFloor`), wave 11F-fix.
 *
 * The regression this pins is the one the `SEAM_TIERS` flip surfaced on
 * `trojan_horse_in_troy`: a `"stepped"` quarter straddling a headland and the
 * sea elected a low shore piece at `base + 1 · FLOOR_HEIGHT`, four blocks under
 * sea level, and S6 rule 3 then dissolved the whole plateau *into it* — three
 * platforms gave their levels back and 2,400 columns of citadel were graded to
 * y=60 with the sea at 63. That grading is a pad edit, and a pad edit is
 * followed by a **reclassification**: the quarter did not merely sit low, it
 * became ocean. The fabric was then laid on the lake it had made, doors and
 * all, and the first doorstep cut into the bank beside it opened the water's
 * side — `LOAM-T110 UNSTABLE_FLUID`, fatal, ten blocks.
 *
 * The compiler's standing rule is that nothing seats below the waterline: the
 * solver's ground rules refuse water, `infra.entry` holds that a waterline is
 * not a frontage, and a basin is curbed before it is poured. The election is
 * now held to the same rule, in the one place that decides a level — so this
 * cannot be re-broken by a downstream veto being forgotten.
 *
 * Three blocks:
 *
 * 1. the unit rule on `derivePlatforms`, with the harness proved able to see
 *    the difference (without the floor the same field elects levels under it);
 * 2. the same rule on `dissolveTallPairs` — giving a level back is still
 *    electing one;
 * 3. a compiled fixture: a headland quarter beside sea-level water, through
 *    the flag-on election, whose lots must be dry and whose compile must carry
 *    no `LOAM-T110` at all.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { HeightField } from "@terrainist/stdlib";

import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { DISSOLVE_DROP_MAX, derivePlatforms, dissolveTallPairs } from "../src/layout/platforms.js";
import { compileTerrain } from "../src/terrain/compile.js";

/** The sea level every fixture here uses — the profile's own default. */
const SEA_LEVEL = 63;

/* -------------------------------------------------------------------------- */
/* a quarter on a shore                                                        */
/* -------------------------------------------------------------------------- */

const SIDE = 40;
const BOUNDS: Rect = { x0: 0, z0: 0, x1: SIDE - 1, z1: SIDE - 1 };

/**
 * A shelf falling into the sea: high shoulder at `x = 39`, and by `x = 0` the
 * ground is well under {@link SEA_LEVEL}. This is Troy's shape in miniature —
 * one block of free ground whose buckets span the waterline.
 */
function shore(): HeightField {
  const values = new Float64Array(SIDE * SIDE);
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      values[j * SIDE + i] = 54 + i * 0.9 + Math.abs(20 - j) * 0.2;
    }
  }
  return {
    region: { x0: 0, z0: 0, width: SIDE, depth: SIDE },
    values,
  } as unknown as HeightField;
}

/** One block spanning the whole footprint: nothing is street. */
function free(): Uint8Array {
  return new Uint8Array(SIDE * SIDE);
}

/* -------------------------------------------------------------------------- */

describe("the election is held to the waterline", () => {
  const input = { bounds: BOUNDS, blocked: free(), field: shore(), tiered: true };

  it("elects levels under the sea when nothing tells it where the sea is", () => {
    // The harness must be able to see the difference before the next test's
    // "none of them" means anything. This is the shipped bug, in one line.
    const drowned = derivePlatforms(input).filter((b) => b.level < SEA_LEVEL);
    expect(drowned.length).toBeGreaterThan(0);
  });

  it("elects none under it once it is told", () => {
    const benches = derivePlatforms({ ...input, waterFloor: SEA_LEVEL });
    expect(benches.length).toBeGreaterThan(1);
    for (const bench of benches) expect(bench.level).toBeGreaterThanOrEqual(SEA_LEVEL);
  });

  it("leaves the dry half of the same field exactly where it was", () => {
    // The floor raises what is drowned and touches nothing else: a quarter
    // clear of the water elects the platforms it always did.
    const wet = derivePlatforms({ ...input, waterFloor: SEA_LEVEL });
    const dry = derivePlatforms(input);
    const above = (benches: readonly FormBench[]): string =>
      JSON.stringify(benches.filter((b) => b.level > SEA_LEVEL));
    expect(above(wet)).toEqual(above(dry));
  });

  it("is unchanged by a floor no platform reaches down to", () => {
    expect(derivePlatforms({ ...input, waterFloor: 0 })).toEqual(derivePlatforms(input));
  });
});

describe("the dissolve is held to the same waterline", () => {
  const bounds: Rect = { x0: 0, z0: 0, x1: 9, z1: 3 };
  /** A shore platform under the sea and a shelf far enough above it to dissolve. */
  const pair = (): FormBench[] => [
    { id: "shore", runs: [{ x0: 0, z0: 0, x1: 4, z1: 3 }], level: SEA_LEVEL - 4 },
    { id: "shelf", runs: [{ x0: 5, z0: 0, x1: 9, z1: 3 }], level: SEA_LEVEL - 4 + DISSOLVE_DROP_MAX + 1 },
  ];

  it("drowns the shelf when it is not told where the sea is", () => {
    const out = dissolveTallPairs(bounds, pair());
    expect(out.dissolved.map((d) => d.id)).toEqual(["shelf"]);
    expect(out.benches.map((b) => b.level)).toEqual([SEA_LEVEL - 4, SEA_LEVEL - 4]);
  });

  it("never hands a platform a level below the floor, dissolving or not", () => {
    const out = dissolveTallPairs(bounds, pair(), SEA_LEVEL);
    for (const bench of out.benches) expect(bench.level).toBeGreaterThanOrEqual(SEA_LEVEL);
  });

  it("still dissolves a pair that is too tall — the rule is a floor, not a veto", () => {
    const tall: FormBench[] = [
      { id: "shore", runs: [{ x0: 0, z0: 0, x1: 4, z1: 3 }], level: SEA_LEVEL },
      { id: "shelf", runs: [{ x0: 5, z0: 0, x1: 9, z1: 3 }], level: SEA_LEVEL + DISSOLVE_DROP_MAX + 1 },
    ];
    const out = dissolveTallPairs(bounds, tall, SEA_LEVEL);
    expect(out.dissolved.map((d) => d.id)).toEqual(["shelf"]);
    expect(out.benches.map((b) => b.level)).toEqual([SEA_LEVEL, SEA_LEVEL]);
  });
});

/* -------------------------------------------------------------------------- */
/* the compiled fixture                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A headland shelf 36 blocks above a shallow sea, with a `"stepped"` quarter
 * laid across both. Tuned so the election *does* reach across the waterline —
 * before the floor this document compiled with `LOAM-T110` and 2,830 of its
 * 3,430 building columns standing in water.
 */
const SHORE_TOWN = {
  loam: "0.1",
  profile: "settlement",
  meta: { name: "shore_shelf", worldSeed: "4242424242", prompt: "a shelf town on a headland above the sea" },
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
          baseHeight: 56,
          amplitude: 6,
          octaves: 3,
          frequency: 0.004,
          lacunarity: 2,
          gain: 0.5,
          ridged: false,
          erosionPasses: 1,
          cliffThreshold: 70,
          soilDepth: 3,
          beachWidth: 4,
        },
        children: [
          {
            id: "headland",
            kind: "generator",
            generator: "terrain.edit@0",
            params: { verb: "plateau", at: [0.55, 0.45], radius: 62, height: 36, rim: 4, profile: "rounded" },
          },
        ],
      },
      { id: "climate", kind: "generator", generator: "terrain.climate@0", params: { forceTheme: "temperate" } },
      {
        id: "shelf_town",
        kind: "district",
        envelope: { shape: "region", size: [140, 120] },
        params: { fabric: "grown", density: "medium", mix: ["cottage", "townhouse"], ground: "stepped", plaza: true },
        constraints: [{ at: [0.5, 0.5] }],
      },
    ],
  },
} as unknown;

describe("a stepped quarter beside sea-level water, compiled", () => {
  const scratch: string[] = [];
  let ok = false;
  let levels: number[] = [];
  let wetLotColumns = 0;
  let lotColumns = 0;
  let unstable = 0;

  beforeAll(async () => {
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-waterline-"));
    scratch.push(root);
    let plan: {
      region: { x0: number; z0: number; width: number; depth: number };
      fluidKind: Uint8Array;
    } | null = null;
    // No `allowUnstable`: `LOAM-T110` is the fatal this fixture exists to catch,
    // so the compile itself is the assertion.
    const compiled = await compileTerrain(SHORE_TOWN, {
      outDir: path.join(root, "shore_shelf"),
      onColumnPlan: (p) => {
        plan = p as unknown as typeof plan;
      },
    });
    ok = compiled.ok;
    unstable = (compiled.diagnostics ?? []).filter((d) => d.name === "UNSTABLE_FLUID").length;
    // A failed compile carries no report — and this fixture's whole point is
    // that it once failed. Guarded so the diagnosis is the `T110` assertion
    // below rather than a `TypeError` in the setup.
    const report = (compiled.report ?? {}) as unknown as {
      layout?: {
        districts?: readonly { levels?: { levelY?: readonly number[] } }[];
        structures?: { buildings?: readonly { footprint: Rect }[] };
      };
    };
    levels = [...(report.layout?.districts?.[0]?.levels?.levelY ?? [])];
    const p = plan as unknown as {
      region: { x0: number; z0: number; width: number; depth: number };
      fluidKind: Uint8Array;
    } | null;
    for (const building of p === null ? [] : (report.layout?.structures?.buildings ?? [])) {
      const f = building.footprint;
      for (let z = f.z0; z <= f.z1; z++) {
        for (let x = f.x0; x <= f.x1; x++) {
          lotColumns += 1;
          const i = x - p.region.x0;
          const j = z - p.region.z0;
          if (p.fluidKind[j * p.region.width + i] !== 0) wetLotColumns += 1;
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

  it("elects a stepped quarter of several levels, none of them under the sea", () => {
    expect(levels.length).toBeGreaterThan(1);
    expect(new Set(levels).size).toBeGreaterThan(1);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(SEA_LEVEL);
  });

  it("puts no lot column in the water", () => {
    expect(lotColumns).toBeGreaterThan(0);
    expect(wetLotColumns).toBe(0);
  });
});
