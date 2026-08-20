/**
 * **The block-anchored lattice** — `docs/GROUND-UNIFICATION-v0.md` §11, wave
 * 12B.
 *
 * The finding this wave answers, in one sentence: `derivePlatforms` anchored
 * its storey lattice on `base = min(free ground)` with the streets *excluded*
 * by the `blocked` mask, so the carriageway's own level was never a mark on the
 * lattice at all — the citadel's streets graded to 90 and its elected levels
 * were 91 and 87, and `90 mod 4` is neither of those (§11.0a P3/P4). Ninety was
 * not on the ruler.
 *
 * Everything here is off the global flag, exactly as `platforms.test.ts` is off
 * `SEAM_TIERS`: `PlatformInput.datum` is present ⇔ the tie is on, so both
 * elections are exercised explicitly and neither depends on what
 * `GROUND_PLANE_TIE` happens to be. The standing rule applies — *prove the
 * harness can see a difference before trusting that it saw none* — so every
 * fixture below is asserted twice, once with the datum and once without, and
 * the two answers are required to disagree.
 *
 * The laws under test: **G1** (a claimed-ground column is at its street's level
 * or a whole storey from it), **G2** (the per-block anchor is the lower median
 * of the datum along the block's perimeter), **G3** (no frontage, no tie),
 * **G4** (a block whose perimeter datum spans a storey is split, not averaged),
 * **G9** (the tie implies the frontage tie) and **G10** (determinism).
 */

import { describe, expect, it } from "vitest";

import type { HeightField } from "@terrainist/stdlib";

import { FLOOR_HEIGHT } from "../src/layout/district.js";
import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import {
  type PlatformTieReport,
  type WaterMask,
  derivePlatforms,
} from "../src/layout/platforms.js";
import type { StreetDatum } from "../src/layout/street-datum.js";
import { FRONTAGE_TIE, GROUND_PLANE_TIE, GROUND_TIE_SPAN } from "../src/layout/types.js";

/* -------------------------------------------------------------------------- */
/* the fixture kit                                                             */
/* -------------------------------------------------------------------------- */

const SIDE = 24;
const BOUNDS: Rect = { x0: 0, z0: 0, x1: SIDE - 1, z1: SIDE - 1 };
const REGION = { x0: 0, z0: 0, width: SIDE, depth: SIDE } as const;

/**
 * The reach the fixtures probe with.
 *
 * The compiler passes `frontageReach(sidewalkWidth)` = `sidewalkWidth + 10`,
 * which on a 24-column fixture reaches most of the quarter and makes the
 * geometry illegible. Two columns is the same construction at a scale where
 * "this block's own perimeter" is visible in the assertion, and the reach is a
 * parameter of the input precisely so a test may say so.
 */
const REACH = 2;

/** A field whose height is `at(x, z)`, sampled by the materialisation rule. */
function fieldOf(at: (x: number, z: number) => number): HeightField {
  const values = new Float64Array(SIDE * SIDE);
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) values[z * SIDE + x] = at(x, z);
  return { region: REGION, values } as unknown as HeightField;
}

/**
 * A `StreetDatum` over the fixture region: banded exactly where `graded`
 * answers, and `levelNear` is the shipped one's contract — nearest by squared
 * Euclidean distance, ties to the **lowest region index** (F11).
 */
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

/** 1 where the column is street — the mask `derivePlatforms` is handed. */
function blockedOf(isStreet: (x: number, z: number) => boolean): Uint8Array {
  const out = new Uint8Array(SIDE * SIDE);
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) if (isStreet(x, z)) out[z * SIDE + x] = 1;
  return out;
}

/** The levels the election produced, ascending, so an assertion reads as a set. */
function levelsOf(benches: readonly FormBench[]): number[] {
  return benches.map((b) => b.level).sort((a, b) => a - b);
}

/** Every column any bench claimed, as `z * SIDE + x`. */
function coverage(benches: readonly FormBench[]): Set<number> {
  const out = new Set<number>();
  for (const bench of benches) {
    for (const run of bench.runs) {
      for (let z = run.z0; z <= run.z1; z++) for (let x = run.x0; x <= run.x1; x++) out.add(z * SIDE + x);
    }
  }
  return out;
}

function report(): PlatformTieReport {
  return { blocks: 0, tied: 0, untied: 0, spanSplit: 0 };
}

/* -------------------------------------------------------------------------- */
/* the citadel: streets at 90, free ground at 91 and 94                        */
/* -------------------------------------------------------------------------- */

/**
 * The walked geometry, at fixture scale: a cross of streets graded to one level
 * and four blocks of the town's own ground standing over them. The citadel's
 * numbers exactly — carriageway **90**, the near blocks' summit **91**, the far
 * blocks' **94** — so the arithmetic under test is the arithmetic that shipped.
 */
const STREET_Y = 90;
const isCross = (x: number, z: number): boolean => x === 11 || x === 12 || z === 11 || z === 12;
const citadelField = fieldOf((x, z) => (isCross(x, z) ? STREET_Y : z <= 10 ? 91 : 94));
const citadelBlocked = blockedOf(isCross);
const citadelDatum = datumOf((x, z) => (isCross(x, z) ? STREET_Y : undefined));

describe("the citadel's lattice (G1, G2)", () => {
  it("elects 91 and 95 with no datum — and ninety is not on the ruler", () => {
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field: citadelField,
    });
    // Today's arithmetic, recorded rather than described: `base` is the lowest
    // *free* column (91, because the streets are blocked out of the minimum),
    // the near blocks quantise to it and the far blocks to one storey above.
    expect(levelsOf(benches)).toEqual([91, 91, 95, 95]);
    // The whole finding, as one assertion: every mark the election can produce
    // is congruent to 91, the street is congruent to 90, and no rounding rule
    // can move a plane onto a ruler that has no mark there (§11.0a P4).
    for (const bench of benches) expect(bench.level % FLOOR_HEIGHT).toBe(91 % FLOOR_HEIGHT);
    expect(STREET_Y % FLOOR_HEIGHT).not.toBe(91 % FLOOR_HEIGHT);
    // And the defect Kai walked four times: the town's ground one block proud
    // of its own pavement.
    expect(Math.min(...levelsOf(benches)) - STREET_Y).toBe(1);
  });

  it("elects 90 and 94 with the datum: the +1 bar collapses (G2)", () => {
    const tie = report();
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field: citadelField,
      datum: { street: citadelDatum, reach: REACH },
      report: tie,
    });
    expect(levelsOf(benches)).toEqual([90, 90, 94, 94]);
    // k = 0 *is* the carriageway's own level, and every other mark is a whole
    // storey from it.
    for (const bench of benches) expect(Math.abs((bench.level - STREET_Y) % FLOOR_HEIGHT)).toBe(0);
    expect(levelsOf(benches).filter((y) => y - STREET_Y === 1)).toEqual([]);
    expect(tie).toEqual({ blocks: 4, tied: 4, untied: 0, spanSplit: 0 });
  });

  it("moves the plane down toward the street, never up", () => {
    const before = levelsOf(
      derivePlatforms({ bounds: BOUNDS, blocked: citadelBlocked, field: citadelField }),
    );
    const after = levelsOf(
      derivePlatforms({
        bounds: BOUNDS,
        blocked: citadelBlocked,
        field: citadelField,
        datum: { street: citadelDatum, reach: REACH },
      }),
    );
    expect(after).not.toEqual(before);
    for (const [i, y] of after.entries()) expect(y).toBeLessThanOrEqual(before[i] as number);
  });

  it("is deterministic — the same field twice is the same benches", () => {
    const once = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field: citadelField,
      datum: { street: citadelDatum, reach: REACH },
    });
    const twice = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field: citadelField,
      datum: { street: citadelDatum, reach: REACH },
    });
    expect(twice).toEqual(once);
  });
});

/* -------------------------------------------------------------------------- */
/* G3 — no frontage, no tie                                                    */
/* -------------------------------------------------------------------------- */

describe("a block with no graded carriageway in reach (G3, LOAM-T241)", () => {
  // The same cross, but only the northern half of the north–south street was
  // graded. The two southern blocks touch nothing the datum knows about.
  const halfGraded = datumOf((x, z) =>
    (x === 11 || x === 12) && z <= 10 ? STREET_Y : undefined,
  );

  it("keeps exactly the number it has today, and is counted", () => {
    const tie = report();
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field: citadelField,
      datum: { street: halfGraded, reach: REACH },
      report: tie,
    });
    // Two blocks anchored on the street at 90; two found nothing in reach and
    // kept `min(free ground)`'s answer — 95, character for character the number
    // the datum-less election produced above.
    expect(levelsOf(benches)).toEqual([90, 90, 95, 95]);
    expect(tie).toEqual({ blocks: 4, tied: 2, untied: 2, spanSplit: 0 });
  });

  it("reports nothing at all when every block is tied", () => {
    const tie = report();
    derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field: citadelField,
      datum: { street: citadelDatum, reach: REACH },
      report: tie,
    });
    expect(tie.untied).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* the risk: a seat that moves                                                 */
/* -------------------------------------------------------------------------- */

describe("the biggest-risk case: `foundationY` moves (§11.6 row 1)", () => {
  // A quarter whose low block sits at 89, whose high block sits at 94, and
  // whose street grades to 92 — chosen so the anchor and the old base are three
  // apart *and* the rounding lands the other way, which is the largest move the
  // anchor can ever make.
  const isStreet = (x: number, z: number): boolean => z === 11 || z === 12;
  const field = fieldOf((x, z) => (isStreet(x, z) ? 92 : z <= 10 ? 89 : 94));
  const blocked = blockedOf(isStreet);
  const datum = datumOf((x, z) => (isStreet(x, z) ? 92 : undefined));

  it("moves a seat by three blocks and lands it congruent to its street", () => {
    const before = derivePlatforms({ bounds: BOUNDS, blocked, field });
    const after = derivePlatforms({
      bounds: BOUNDS,
      blocked,
      field,
      datum: { street: datum, reach: REACH },
    });
    expect(levelsOf(before)).toEqual([89, 93]);
    expect(levelsOf(after)).toEqual([88, 96]);
    // A building on a derived platform is seated at `levels.levelY[platform]`
    // and nowhere else (§11.0a P7), so this *is* the move every building on the
    // high block makes.
    expect(96 - 93).toBe(3);
    // Three is the ceiling, and the reason is arithmetic rather than luck: two
    // bases congruent modulo FLOOR_HEIGHT produce identical levels, so a move of
    // a whole storey is impossible and the residual is always in 1…3.
    for (const bench of after) expect(Math.abs((bench.level - 92) % FLOOR_HEIGHT)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* G4 — the perimeter-span split                                               */
/* -------------------------------------------------------------------------- */

describe("a block whose streets disagree (G4)", () => {
  // One block between two streets two storeys apart: graded 80 to the north and
  // 88 to the south. The block's *own* relief is three blocks — under
  // FLOOR_HEIGHT, so the shipped election makes it one platform — but its
  // perimeter datum spans eight, and a block that straddles more than one
  // storey of street cannot be one platform without one of its streets being
  // wrong about it.
  const isStreet = (x: number, z: number): boolean => z <= 1 || z >= 22;
  const field = fieldOf((x, z) => (z <= 1 ? 80 : z >= 22 ? 88 : z <= 11 ? 82 : 85));
  const blocked = blockedOf(isStreet);
  const datum = datumOf((x, z) => (z <= 1 ? 80 : z >= 22 ? 88 : undefined));

  it("splits rather than averaging, and both pieces land on the block's lattice", () => {
    // Flag off: relief 3 ≤ FLOOR_HEIGHT, so one bench — and one platform is no
    // platform, which is why the shipped election returns nothing here.
    expect(derivePlatforms({ bounds: BOUNDS, blocked, field })).toEqual([]);

    const tie = report();
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked,
      field,
      datum: { street: datum, reach: REACH },
      report: tie,
    });
    expect(tie.spanSplit).toBe(1);
    expect(benches.length).toBe(2);
    // The block anchors on the lower of its two streets — F5's corner rule
    // again, the plane goes low — and the piece under the higher street comes
    // out a whole storey below it: a street on an embankment above a yard,
    // which is a real town.
    expect(levelsOf(benches)).toEqual([80, 84]);
    for (const bench of benches) expect(bench.level % FLOOR_HEIGHT).toBe(0);
  });

  it("does not fire while the perimeter span is a storey or less", () => {
    // The same block, both streets at 84: span 0, no split, one platform.
    const flat = datumOf((x, z) => (isStreet(x, z) ? 84 : undefined));
    const tie = report();
    derivePlatforms({
      bounds: BOUNDS,
      blocked,
      field,
      datum: { street: flat, reach: REACH },
      report: tie,
    });
    expect(tie.spanSplit).toBe(0);
    expect(GROUND_TIE_SPAN).toBe(FLOOR_HEIGHT);
  });
});

/* -------------------------------------------------------------------------- */
/* the water floor still binds, after the anchor                               */
/* -------------------------------------------------------------------------- */

describe("the waterline clamp binds after the re-anchor (§11.6 row 2)", () => {
  // The citadel, dropped to the shore: streets graded to 60, near blocks at 61,
  // far blocks at 64, and the sea at 63.
  const field = fieldOf((x, z) => (isCross(x, z) ? 60 : z <= 10 ? 61 : 64));
  const datum = datumOf((x, z) => (isCross(x, z) ? 60 : undefined));

  it("raises an anchored level to the floor, never below it", () => {
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field,
      waterFloor: 63,
      datum: { street: datum, reach: REACH },
    });
    // Anchored, the near blocks want 60 — a plane under the sea beside them, and
    // the pad edit's reclassification would call the result ocean. The floor is
    // applied where the level is *computed*, so it still binds.
    expect(levelsOf(benches)).toEqual([63, 63, 64, 64]);
    for (const bench of benches) expect(bench.level).toBeGreaterThanOrEqual(63);
  });

  it("still exempts a piece that is itself water (`damsWater`'s pair)", () => {
    const mask = new Uint8Array(SIDE * SIDE);
    for (let z = 0; z <= 10; z++) for (let x = 0; x <= 10; x++) mask[z * SIDE + x] = 1;
    const water: WaterMask = { mask, region: REGION };
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field,
      waterFloor: 63,
      water,
      datum: { street: datum, reach: REACH },
    });
    // The north-west block is the channel: it keeps the level its own bed gives
    // it rather than being graded up to the waterline, which would be a dam.
    expect(levelsOf(benches)).toEqual([60, 63, 64, 64]);
  });
});

/* -------------------------------------------------------------------------- */
/* no sliver is left behind                                                    */
/* -------------------------------------------------------------------------- */

const HILL_STREET_Y = 89;

describe("the anchor leaves no new natural ground (§11.6 row 3)", () => {
  // A plane hillside under the same cross of streets: every block has more than
  // a storey of relief, so both elections split, bucket and merge.
  // The street grades to 89, deliberately **incongruent** with the 86 the free
  // ground's minimum would have anchored on: two bases congruent modulo
  // FLOOR_HEIGHT elect identical levels, so a fixture that wants to see the
  // anchor work has to put the two rulers out of phase.
  const field = fieldOf((x, z) =>
    isCross(x, z) ? HILL_STREET_Y : 86 + Math.round(0.6 * x + 0.3 * z),
  );
  const datum = datumOf((x, z) => (isCross(x, z) ? HILL_STREET_Y : undefined));

  it("covers every column the datum-less election covered", () => {
    const before = derivePlatforms({ bounds: BOUNDS, blocked: citadelBlocked, field });
    const tie = report();
    const after = derivePlatforms({
      bounds: BOUNDS,
      blocked: citadelBlocked,
      field,
      datum: { street: datum, reach: REACH },
      report: tie,
    });
    expect(levelsOf(after)).not.toEqual(levelsOf(before));
    const covered = coverage(after);
    for (const k of coverage(before)) expect(covered.has(k)).toBe(true);
    // Every piece the split produced is on the street's lattice, which is G1
    // restated over a quarter that actually steps.
    for (const bench of after) expect(Math.abs((bench.level - HILL_STREET_Y) % FLOOR_HEIGHT)).toBe(0);
    expect(tie.untied).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* G9, G10 — the flag's own contract                                           */
/* -------------------------------------------------------------------------- */

describe("the flag's contract (G9, G10)", () => {
  it("implies the frontage tie: there is no datum without one", () => {
    // `gradeDatum` returns `null` while `FRONTAGE_TIE` is off, so a ground-plane
    // tie over a frontage-tie-less compiler would anchor nothing, everywhere,
    // silently. Asserted rather than left to degrade.
    if (GROUND_PLANE_TIE) expect(FRONTAGE_TIE).toBe(true);
  });

  it("is off, so the shipped election is the datum-less one", () => {
    expect(GROUND_PLANE_TIE).toBe(false);
  });
});
