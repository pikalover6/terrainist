/**
 * **Terraces from the terrain** — `TERRACE_BY_TERRAIN`, T7.
 *
 * The finding this wave answers, in one sentence, measured on Troy r22g4 in the
 * citadel window `x∈[88,142] z∈[-218,-158]`: the hill steps 85→86→87→88 toward
 * the crest and the streets follow it flush, one column per step, but the
 * blocks between them elected **one** plane at the lower median of their
 * street-perimeter datum and the pad cut the whole block flat there. What a
 * walker reads as "the street ramps +1/+2/+3 over flat ground" is the ground
 * beside it being an excavation, and the buildings on a plane's uphill rim seat
 * three and four blocks below the street band in front of their own doors.
 *
 * The root cause is arithmetic and it is one word wide: `GROUND_TIE_SPAN` reads
 * the **span** of the perimeter datum, `max − min`, and a block crossing three
 * natural steps spans 3, which is inside a threshold of 4. So the block that
 * most needs to be two terraces is exactly the block the criterion waves
 * through as one deep cut.
 *
 * Two constructions answer it, both gated on the one flag:
 *
 * 1. **The split criterion reads the hill** — a block whose own perimeter
 *    crosses `TERRACE_STEP_SPAN` distinct *pristine* levels is cut at the
 *    natural step lines, and each terrace re-anchors on the lower median of its
 *    own share of the perimeter. It is a second *criterion* on the splitter
 *    that shipped, not a second splitter.
 * 2. **The uphill-rim seat exception** — a lot whose plane sits more than
 *    `RIM_SEAT_MAX_DROP` below its own frontage takes the frontage, because it
 *    is straddling the terrace rather than standing on it.
 *
 * Everything here is off the global flag, exactly as `platforms.test.ts` is off
 * `SEAM_TIERS` and `ground-plane-tie.test.ts` off `GROUND_PLANE_TIE`:
 * `PlatformInput.terraceByTerrain` is the parameter, so both elections are
 * exercised explicitly and neither depends on what the constant happens to be.
 * The standing rule applies throughout — *prove the harness can see a
 * difference before trusting that it saw none* — so the fixtures are asserted
 * twice and the two answers are required to disagree.
 */

import { describe, expect, it } from "vitest";

import type { HeightField } from "@terrainist/stdlib";

import { FLOOR_HEIGHT, seatOnPlane } from "../src/layout/district.js";
import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { type PlatformTieReport, derivePlatforms as electPlatforms } from "../src/layout/platforms.js";
import type { PlatformInput } from "../src/layout/platforms.js";
import type { StreetDatum } from "../src/layout/street-datum.js";
import {
  ELECTION_SOLVE,
  GROUND_PLANE_TIE,
  GROUND_TIE_SPAN,
  RIM_SEAT_MAX_DROP,
  TERRACE_BY_TERRAIN,
  TERRACE_STEP_SPAN,
} from "../src/layout/types.js";

/* -------------------------------------------------------------------------- */
/* WP-E2's flip: this file tests the FALLBACK election                         */
/* -------------------------------------------------------------------------- */

/**
 * `derivePlatforms` with **`ELECTION_SOLVE` forced off** — the pre-election
 * procedure, which is what every law below is a law *of*.
 *
 * Re-pinned at WP-E2's flip, with attribution (`docs/ELECTION-SOLVE-v0.md`
 * §4). T7's terrain criterion and `TERRACE_STEP_SPAN` are subsumed: under the solve
 * the *levels* decide whether atoms coalesce, so no splitter runs at all. These are not
 * outcomes the objective happens to agree with; they are the construction the
 * objective *replaced*, and asserting them against the solve would be asserting
 * that the flip did nothing.
 *
 * The procedure is still live — the flag pair keeps it reachable until its own
 * collapse packet — so its laws are still worth pinning, and this parameter is
 * the honest way to say which construction is under test. Written first so a
 * call that names `electionSolve` itself still wins. The solve's own laws live
 * in `election-solve.test.ts`; the flip's world-level evidence is the
 * regenerated `tools/worlds/ground-probe-baselines/` against
 * `preflip-election/`.
 */
const derivePlatforms = (input: PlatformInput): FormBench[] =>
  electPlatforms({ electionSolve: false, ...input });


/* -------------------------------------------------------------------------- */
/* the fixture kit — the same shape `ground-plane-tie.test.ts` uses             */
/* -------------------------------------------------------------------------- */

const SIDE = 24;
const BOUNDS: Rect = { x0: 0, z0: 0, x1: SIDE - 1, z1: SIDE - 1 };
const REGION = { x0: 0, z0: 0, width: SIDE, depth: SIDE } as const;
const REACH = 2;

function fieldOf(at: (x: number, z: number) => number): HeightField {
  const values = new Float64Array(SIDE * SIDE);
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) values[z * SIDE + x] = at(x, z);
  return { region: REGION, values } as unknown as HeightField;
}

function datumOf(graded: (x: number, z: number) => number | undefined): StreetDatum {
  const columnY = new Int32Array(SIDE * SIDE).fill(-64);
  const band = new Uint8Array(SIDE * SIDE);
  for (let z = 0; z < SIDE; z++) {
    for (let x = 0; x < SIDE; x++) {
      const y = graded(x, z);
      if (y === undefined) continue;
      columnY[z * SIDE + x] = y;
      band[z * SIDE + x] = 1;
    }
  }
  return {
    bySegment: new Map(),
    region: REGION,
    columnY,
    band,
    levelNear(x: number, z: number, reach: number): number | undefined {
      const r = Math.max(0, Math.floor(reach));
      let best: number | undefined;
      let bestD2 = Number.POSITIVE_INFINITY;
      for (let cz = Math.max(0, z - r); cz <= Math.min(SIDE - 1, z + r); cz++) {
        for (let cx = Math.max(0, x - r); cx <= Math.min(SIDE - 1, x + r); cx++) {
          const k = cz * SIDE + cx;
          if (band[k] !== 1) continue;
          const d2 = (cx - x) * (cx - x) + (cz - z) * (cz - z);
          if (d2 > r * r || d2 >= bestD2) continue;
          bestD2 = d2;
          best = columnY[k] as number;
        }
      }
      return best;
    },
  } as unknown as StreetDatum;
}

function blockedOf(isStreet: (x: number, z: number) => boolean): Uint8Array {
  const out = new Uint8Array(SIDE * SIDE);
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) if (isStreet(x, z)) out[z * SIDE + x] = 1;
  return out;
}

function levelsOf(benches: readonly FormBench[]): number[] {
  return benches.map((b) => b.level).sort((a, b) => a - b);
}

function report(): PlatformTieReport {
  return { blocks: 0, tied: 0, untied: 0, spanSplit: 0, terraceSplit: 0, terraceAreaOnly: 0 };
}

/* -------------------------------------------------------------------------- */
/* the citadel stair: 85 → 86 → 87 → 88, streets flush with every step          */
/* -------------------------------------------------------------------------- */

/**
 * Troy's window at fixture scale, and the numbers are Troy's own.
 *
 * The hill rises one block per four columns of `z` — 85, 86, 87 under the first
 * pair of blocks and 88, 89, 90 under the second — and a cross of streets runs
 * over it flush with the ground it crosses, which is what the street datum
 * actually does. Each of the four blocks therefore crosses **three** natural
 * steps while its own relief is **two**.
 *
 * That is the defect's exact arithmetic. The relief the shipped splitter tests
 * is 2, inside {@link FLOOR_HEIGHT}; the span the shipped criterion tests is 3,
 * inside {@link GROUND_TIE_SPAN}; and the count the new criterion tests is 3,
 * which is {@link TERRACE_STEP_SPAN}. Every shipped test passes the block
 * through as one plane and the pad cuts it flat at the lower median.
 */
const stairAt = (_x: number, z: number): number => 85 + Math.floor(z / 4);
const isStreetColumn = (x: number, z: number): boolean => x === 11 || x === 12 || z === 11 || z === 12;
const stairField = fieldOf(stairAt);
const stairBlocked = blockedOf(isStreetColumn);
const stairDatum = datumOf((x, z) => (isStreetColumn(x, z) ? stairAt(x, z) : undefined));
const stairInput = {
  bounds: BOUNDS,
  blocked: stairBlocked,
  field: stairField,
  pristine: stairField,
  datum: { street: stairDatum, reach: REACH },
  tiered: true,
} as const;

/**
 * The same fixture with the criterion explicitly off — *the shipped election*.
 *
 * Spelled out rather than left to the default, because the default **is** the
 * constant and the suite is run both ways: a fixture that says nothing would
 * silently stop testing the before-state at the flip, which is the one moment
 * the before-state is worth having.
 */
const shippedInput = { ...stairInput, terraceByTerrain: false } as const;

describe("the split criterion reads the hill (T7)", () => {
  it("is one deep-cut plane per block today — the defect, recorded", () => {
    const benches = derivePlatforms(shippedInput);
    // Four blocks, four planes, each at the lower median of a perimeter that
    // ran its whole share of the stair — and each block's own bottom step is
    // filled two blocks while its top step is flush. The upper pair's ground
    // runs 85·86·87 and elects 87; the lower pair's runs 88·89·90 and elects
    // 88, so its crest column is a cut of two.
    expect(benches).toHaveLength(4);
    expect(levelsOf(benches)).toEqual([87, 87, 88, 88]);
    // …and no shipped test ever fired: the block's relief is 2 and its
    // perimeter datum spans 3, both inside their thresholds. That is the gap,
    // in two assertions.
    expect(2).toBeLessThanOrEqual(FLOOR_HEIGHT);
    expect(3).toBeLessThanOrEqual(GROUND_TIE_SPAN);
  });

  it("cuts the block at the natural step lines with the flag on", () => {
    const tie = report();
    const benches = derivePlatforms({ ...stairInput, terraceByTerrain: true, report: tie });
    // More, shallower terraces — Kai's walk-calibrated law, as arithmetic.
    expect(benches.length).toBeGreaterThan(2);
    expect(tie.terraceSplit).toBe(4);
    // Every level the election takes is a level the hill actually has, and each
    // terrace is flush with the street beside it rather than a storey from it:
    // the shipped lattice can only ever answer 86 or 90 here.
    for (const level of levelsOf(benches)) {
      expect(level).toBeGreaterThanOrEqual(85);
      expect(level).toBeLessThanOrEqual(90);
    }
    expect(new Set(levelsOf(benches)).size).toBeGreaterThan(1);
  });

  it("cuts no deeper than the hill's own deepest step", () => {
    const benches = derivePlatforms({ ...stairInput, terraceByTerrain: true });
    // The measurement that matters to a walker: how far below its own natural
    // ground does a claimed column end up. One plane at 88 buries the 90 band
    // by two; terraces have to beat that.
    let deepest = 0;
    for (const bench of benches) {
      for (const run of bench.runs) {
        for (let z = run.z0; z <= run.z1; z++) {
          for (let x = run.x0; x <= run.x1; x++) {
            deepest = Math.max(deepest, stairAt(x, z) - bench.level);
          }
        }
      }
    }
    const before = derivePlatforms(shippedInput);
    let deepestBefore = 0;
    for (const bench of before) {
      for (const run of bench.runs) {
        for (let z = run.z0; z <= run.z1; z++) {
          for (let x = run.x0; x <= run.x1; x++) {
            deepestBefore = Math.max(deepestBefore, stairAt(x, z) - bench.level);
          }
        }
      }
    }
    expect(deepest).toBeLessThan(deepestBefore);
  });

  it("needs a pristine field and a datum, and is inert without either", () => {
    // T7 implies the plane tie: with no datum a terrace has nothing to anchor
    // on, and the whole construction is dead rather than guessing.
    const noDatum = { bounds: BOUNDS, blocked: stairBlocked, field: stairField, tiered: true } as const;
    expect(derivePlatforms({ ...noDatum, terraceByTerrain: true, pristine: stairField })).toEqual(
      derivePlatforms({ ...noDatum, terraceByTerrain: false }),
    );
    // …and with no pristine field there is no hill to read.
    const { pristine: _pristine, ...noPristine } = stairInput;
    expect(derivePlatforms({ ...noPristine, terraceByTerrain: true })).toEqual(
      derivePlatforms({ ...noPristine, terraceByTerrain: false }),
    );
  });

  it("reads the pristine field and not the padded one", () => {
    // The padded field is the master field the fabric pass is handed, and by
    // the time it runs the solver's pads are already composed into it. A block
    // beside somebody else's pad would read that pad as the hill.
    const flattened = fieldOf(() => 86);
    const padded = { ...stairInput, field: flattened, terraceByTerrain: true } as const;
    const tie = report();
    // The hill is still in `pristine`, so the terraces still happen…
    const benches = derivePlatforms({ ...padded, report: tie });
    expect(tie.terraceSplit).toBe(4);
    // …and reading the flat field as the hill would find no steps at all.
    const blind = report();
    derivePlatforms({ ...padded, pristine: flattened, report: blind });
    expect(blind.terraceSplit).toBe(0);
    expect(benches.length).toBeGreaterThan(2);
  });

  it("leaves a block whose hill is one step alone", () => {
    // Two distinct levels is one step, and one step is what a kerb, a doorstep
    // and `FRONTAGE_RISE` already absorb. Cutting there would put a seam
    // through every gently rolling block in every world.
    const gentleAt = (_x: number, z: number): number => (z < 12 ? 85 : 86);
    const gentle = fieldOf(gentleAt);
    const input = {
      bounds: BOUNDS,
      blocked: stairBlocked,
      field: gentle,
      pristine: gentle,
      datum: { street: datumOf((x, z) => (isStreetColumn(x, z) ? gentleAt(x, z) : undefined)), reach: REACH },
      tiered: true,
    } as const;
    const tie = report();
    derivePlatforms({ ...input, terraceByTerrain: true, report: tie });
    expect(tie.terraceSplit).toBe(0);
    expect(2).toBeLessThan(TERRACE_STEP_SPAN);
  });

  it("declines the block the shipped criteria already split", () => {
    // The load-bearing narrowing. A block climbing far more than a storey is
    // not the defect — it is the storey-split case, whose buckets are wide
    // bands. One-block contour bands on ground that steep come out under
    // `MIN_PLATFORM_COLUMNS`, `mergeSlivers` walks them downhill to the lowest
    // neighbour in a cascade, and the quarter ships with cut depths reaching
    // -40 (measured, Troy r22, with this clause absent).
    const cliffAt = (_x: number, z: number): number => 85 + z;
    const cliff = fieldOf(cliffAt);
    const input = {
      bounds: BOUNDS,
      blocked: stairBlocked,
      field: cliff,
      pristine: cliff,
      datum: { street: datumOf((x, z) => (isStreetColumn(x, z) ? cliffAt(x, z) : undefined)), reach: REACH },
      tiered: true,
    } as const;
    const tie = report();
    const on = derivePlatforms({ ...input, terraceByTerrain: true, report: tie });
    expect(tie.terraceSplit).toBe(0);
    expect(on).toEqual(derivePlatforms({ ...input, terraceByTerrain: false }));
  });

  it("is deterministic — same hill in, same terraces out", () => {
    const once = derivePlatforms({ ...stairInput, terraceByTerrain: true });
    const twice = derivePlatforms({ ...stairInput, terraceByTerrain: true });
    expect(once).toEqual(twice);
  });
});

/* -------------------------------------------------------------------------- */
/* the flag and the constants                                                  */
/* -------------------------------------------------------------------------- */

describe("the uphill-rim seat exception (T7)", () => {
  // `seatOnPlane` reads the compile-time flag rather than a parameter, because
  // the seat is decided inside one expression in `layDistrict` and threading a
  // second switch down to it would be a second answer to the same question.
  // So these read as the ladder tests do: the law either side of the flip, both
  // stated, and the suite is run both ways.
  const rim = (planeY: number, tied: number | undefined): number | undefined =>
    seatOnPlane(planeY, tied);

  it("keeps the plane while a lot is standing on it", () => {
    // Flush, a kerb up, and a kerb down: the ordinary town, either side of the
    // flip. The exception is not a preference for the street, it is a repair of
    // a hole.
    expect(rim(90, 90)).toBe(90);
    expect(rim(90, 91)).toBe(90);
    expect(rim(90, 89)).toBe(90);
    expect(rim(90, 90 + RIM_SEAT_MAX_DROP)).toBe(90);
  });

  it("never fires upwards — a plane above its frontage is F5's kerb", () => {
    expect(rim(90, 80)).toBe(90);
    expect(rim(90, 90 - 20)).toBe(90);
  });

  it("never fires on a lot with no frontage — F6 is untouched", () => {
    expect(rim(90, undefined)).toBe(90);
  });

  it("has nothing to say about a lot on no platform", () => {
    // `undefined` in, `undefined` out: the caller's `??` chain then reaches the
    // city cell, the tie and the median exactly as it did before T7 existed.
    expect(seatOnPlane(undefined, 99)).toBeUndefined();
    expect(seatOnPlane(undefined, undefined)).toBeUndefined();
  });

  it("hands the buried lot back to its own street, past the kerb", () => {
    // The citadel's rims: a plane at 84 under a street band at 87 and 88.
    //
    // **Re-pinned at WP-E2's flip, with attribution** (`ELECTION-SOLVE-v0.md`
    // §5): the exception is *subsumed*, not merely disabled. With the solve on,
    // frontage agreement is a term in the objective — `FRONT_LOW`, priced per
    // column — so a plane can no longer sit 3 below the door it serves, and
    // there is nothing for the exception to catch. `seatOnPlane` is therefore
    // the plane, unconditionally, and the third arm below is the shipped one.
    // The T7 arm stays stated because the flag pair leaves the old procedure
    // reachable until its collapse packet.
    const buried = [3, 4, 12].map((drop) => rim(84, 84 + drop));
    expect(buried).toEqual(
      ELECTION_SOLVE ? [84, 84, 84] : TERRACE_BY_TERRAIN ? [87, 88, 96] : [84, 84, 84],
    );
  });
});

describe("the flag (T7)", () => {
  it("defaults every call to the constant", () => {
    const { terraceByTerrain: _off, ...silent } = shippedInput;
    expect(derivePlatforms(silent)).toEqual(
      derivePlatforms({ ...silent, terraceByTerrain: TERRACE_BY_TERRAIN }),
    );
  });

  it("implies the ground-plane tie", () => {
    // §6's ladder shape, for a rung that hangs off the side of it: T7 is
    // independent of the `GROUND_V1_*` rungs — it changes what a claimant asks
    // for, not where the answer arbitrates — but both of its halves read the
    // street datum, so with the plane tie off there is nothing to anchor a
    // terrace on and nothing to compare a seat against.
    expect(TERRACE_BY_TERRAIN ? GROUND_PLANE_TIE : true).toBe(true);
  });

  it("keeps the rim exception inside a kerb's reach of the frontage", () => {
    // `FRONTAGE_RISE` already lifts a tied seat one above its carriageway and a
    // one-block step down off a pavement is a thing towns do. Two is the last
    // drop that reads as a kerb; three is a hole. The exception fires strictly
    // past this, so a plane exactly `RIM_SEAT_MAX_DROP` below its street keeps
    // the plane.
    expect(RIM_SEAT_MAX_DROP).toBe(2);
    expect(TERRACE_STEP_SPAN).toBe(3);
  });
});
