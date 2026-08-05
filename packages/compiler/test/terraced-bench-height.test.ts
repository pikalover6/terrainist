/**
 * Two defects the flagship hill-town prompt shipped, pinned so they cannot come
 * back — `docs/URBAN-FORMS-v0.md` §10.3 and `docs/COURTYARDS-AND-LEVELS-v0.md`
 * §3.3.
 *
 * 1. **The west of the world had no runs.** `maskRuns` used `start = -1` as its
 *    "no run open" sentinel while `start` held a *world* X, so over any quarter
 *    west of the origin it closed nothing and returned an empty list. Every
 *    fixture in this repo happened to sit at `x0 = 0`. The consequences were two
 *    diagnostics that both blamed the terrain: `terraced` skips a bench with no
 *    runs before it can measure its width, so a hill town refused itself with
 *    "the widest bench comes out 0 columns", and `derivePlatforms` pushed
 *    fifteen blocks' worth of pieces and kept none, so a 45-block slope came out
 *    as "one platform". Both suites below place their bounds at negative X on
 *    purpose; a positive-X regression test is exactly what missed this.
 * 2. **`benchHeight` was fixed at 4.** A bench is the horizontal offcut of a
 *    riser, so its width is `benchHeight / gradient` and the deciding variable
 *    is the **gradient**, not the relief. §10.3's deferred
 *    `clamp(round(relief / 6), 3, 6)` is derived from the wrong number.
 *    `benchHeightFor` climbs instead, and stops at `RETAIN_MAX` because a seam
 *    taller than that is a `bank` — nothing built, no wall, and a hill town with
 *    no retaining walls in it is not the thing the prompt asked for.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import type { Rect } from "../src/layout/frames.js";
import { RETAIN_MAX, treatmentForDrop } from "../src/layout/levels.js";
import { maskRuns } from "../src/layout/masks.js";
import { derivePlatforms } from "../src/layout/platforms.js";
import {
  BENCH_HEIGHT,
  BENCH_HEIGHT_MAX,
  TERRACED_FORM,
  benchFieldOf,
  benchHeightFor,
} from "../src/layout/forms/terraced.js";
import type { FormContext, GroundSample } from "../src/layout/forms/index.js";

/* -------------------------------------------------------------------------- */
/* 1. the sentinel                                                             */
/* -------------------------------------------------------------------------- */

describe("maskRuns west of the origin", () => {
  it("returns the runs of a mask over negative X", () => {
    const bounds: Rect = { x0: -160, z0: 45, x1: -1, z1: 204 };
    const mask = new Uint8Array(160 * 160);
    // Row z = 63, columns x = −160 … −158. The first is the one that used to
    // open a run at a negative `start` and therefore never close it.
    mask[(63 - 45) * 160 + 0] = 1;
    mask[(63 - 45) * 160 + 1] = 1;
    mask[(63 - 45) * 160 + 2] = 1;
    expect(maskRuns(bounds, mask)).toEqual([{ x0: -160, z0: 63, x1: -158, z1: 63 }]);
  });

  it("gives a mask the same runs wherever the quarter stands", () => {
    // Translation invariance is the property the sentinel broke, and it is the
    // one worth asserting: the same 8-column blob, laid at x0 = 0 and at
    // x0 = −64, must produce runs of the same widths.
    const widthsAt = (x0: number): number[] => {
      const bounds: Rect = { x0, z0: 0, x1: x0 + 15, z1: 15 };
      const mask = new Uint8Array(16 * 16);
      for (let j = 4; j < 12; j++) for (let i = 3; i < 11; i++) mask[j * 16 + i] = 1;
      return maskRuns(bounds, mask).map((r) => r.x1 - r.x0 + 1);
    };
    expect(widthsAt(-64)).toEqual(widthsAt(0));
    expect(widthsAt(-64).length).toBe(8);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. platforms on the relief that produced one                                */
/* -------------------------------------------------------------------------- */

const WEST: Rect = { x0: -160, z0: 45, x1: -1, z1: 204 };
const SIDE = 160;

/** A field over {@link WEST} whose height is a function of `x` only. */
function westRamp(rise: (i: number) => number) {
  const values = new Float64Array(SIDE * SIDE);
  for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) values[j * SIDE + i] = rise(i);
  return { region: { x0: WEST.x0, z0: WEST.z0, width: SIDE, depth: SIDE }, values } as never;
}

describe("derivePlatforms west of the origin", () => {
  it("steps 45 blocks of relief into more than one platform", () => {
    // The hill town's measurement, restated: 45 blocks of relief across the
    // quarter, `FLOOR_HEIGHT` 4, which is roughly eleven storeys and cannot
    // honestly be one platform. It came out as none.
    const benches = derivePlatforms({
      bounds: WEST,
      blocked: new Uint8Array(SIDE * SIDE),
      field: westRamp((i) => 64 + (i * 45) / (SIDE - 1)),
    });
    expect(benches.length).toBeGreaterThan(1);
    expect(new Set(benches.map((b) => b.level)).size).toBeGreaterThan(1);
    // Every platform is a real rectangle set, not an empty run list — the
    // failure mode was a bench with columns and no runs.
    for (const bench of benches) expect(bench.runs.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the height a bench has to be                                             */
/* -------------------------------------------------------------------------- */

const BOUNDS: Rect = { x0: 0, z0: 0, x1: 199, z1: 179 };
const SEED = nodeSeed(20260805n, "world.hill_town", "");

/** A slope of exactly 1 in 3 along x: a 4-block bench is 12 columns wide. */
const steepAt = (x: number): number => 70 + Math.round(x / 3);

function slope(height: (x: number) => number): GroundSample {
  return {
    height: (x) => height(x),
    water: () => false,
    slope: (x) => Math.abs(height(x + 1) - height(x)),
    relief: height(BOUNDS.x1) - height(BOUNDS.x0),
    levelled: false,
    waterReach: Number.POSITIVE_INFINITY,
  };
}

const context = (ground: GroundSample): FormContext => ({
  bounds: BOUNDS,
  seed: SEED,
  blockSize: 40,
  sidewalk: 2,
  density: "medium",
  ground,
  focus: [],
});

describe("benchHeightFor — the gradient decides", () => {
  it("climbs above one storey where a 4-block bench is too narrow to build on", () => {
    // 1 in 3 along x. `MIN_BENCH_WIDTH` is 15 — a lane, two verges and the
    // shallowest lot the subdivision will cut — so a bench needs 45 blocks of
    // horizontal run per 15 of width: 4 gives 12 columns and will not do, 5
    // gives 15 and will. Fixed at 4 this quarter refused itself.
    const ctx = context(slope(steepAt));
    const field = benchFieldOf(ctx);
    expect(benchHeightFor(ctx, field)).toBeGreaterThan(BENCH_HEIGHT);
    expect(benchHeightFor(ctx, field)).toBeLessThanOrEqual(BENCH_HEIGHT_MAX);

    // …and the form now draws it, at the height it chose, rather than refusing.
    const drawn = TERRACED_FORM.draw(ctx);
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    const adapted = drawn.plan.record.adapted?.join(" ") ?? "";
    expect(adapted).toMatch(new RegExp(`benches \\d+ of ${benchHeightFor(ctx, field)} blocks`));
  });

  it("keeps one storey per bench wherever one storey is enough", () => {
    // 1 in 15 along x: a 4-block bench is 60 columns, four times what a street
    // and its lots need. Smallest-first is what makes every terraced world
    // drawn before the height became a range byte-identical.
    const gentle = slope((x) => 70 + Math.round(x / 15));
    const ctx = context(gentle);
    expect(benchHeightFor(ctx, benchFieldOf(ctx))).toBe(BENCH_HEIGHT);
  });

  it("stops where the retaining wall stops", () => {
    // The two numbers are not independent judgements: a seam of `benchHeight`
    // taller than `RETAIN_MAX` is classified `bank`, which builds nothing, so a
    // taller bench would buy width by deleting every wall in the town.
    expect(BENCH_HEIGHT_MAX).toBe(RETAIN_MAX);
    expect(treatmentForDrop(BENCH_HEIGHT_MAX)).toBe("retaining");
    expect(treatmentForDrop(BENCH_HEIGHT_MAX + 1)).toBe("bank");
  });

  it("still refuses ground no bench in the range can carry", () => {
    // 1 in 1. Even a 6-block bench is 6 columns, and the refusal is now the
    // honest one — the tallest bench this ground allows, not "4 was narrow".
    const cliff = slope((x) => 70 + x);
    const result = TERRACED_FORM.draw(context(cliff));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/too steep to terrace at 6 blocks a bench/);
    expect(result.fallback).toBe("grown");
  });
});
