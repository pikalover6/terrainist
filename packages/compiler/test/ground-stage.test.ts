/**
 * **The ground stage** — /WP-G6.
 *
 * v0 §9a's driver was a mixture mechanism: `view()` was "the plan at this
 * pipeline position", which is the write-order pile wearing a `readonly` type,
 * and every `commit` re-resolved and wrote its answer back. v1 replaces the
 * whole of that with three properties, and this file is where they are asserted
 * on the mechanism itself — without a compile, so a failure names the stage
 * rather than a world:
 *
 * 1. **`view(n)` is §1.4's typed prefix view.** Per column: the resolved level
 *    where a claim in a tier *strictly above* n owns it, the baseline level
 *    otherwise. No third case — which is testable directly, by resolving the
 *    prefix independently and comparing element for element.
 * 2. **The prefix property.** `view(n)` agrees with the *final* resolve on every
 *    column the prefix owns. This is what makes the four intermediate resolves
 *    legitimate reads rather than approximations, and it is the assertion §6/G6
 *    names as "the one that catches a prefix resolve that is not a prefix".
 * 3. **Five resolves, and tier order enforced.** `stats.ground.resolves` is 5 on
 *    a settlement path, and a claim arriving in a tier a prefix has already been
 *    sealed over is an error rather than a silently wrong answer.
 *
 * Every assertion here was conditioned on the freeze: with the flag
 * off the driver is still v0 §9a's mixture driver and its behaviour is the one
 * WP-G5 shipped, which the byte-identity control set is what pins.
 */

import { describe, expect, it } from "vitest";

import {
  GROUND_TIERS,
  type GroundBaseline,
  type GroundIntent,
  type GroundSourceClass,
  type GroundTier
} from "../src/layout/ground-contract.js";
import { createGroundDriver, tierIndex } from "../src/layout/ground-driver.js";
import { resolveGround } from "../src/layout/ground-resolver.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const W = 12;
const D = 12;
const CELLS = W * D;

const baseline = (): GroundBaseline => ({
  region: { x0: 0, z0: 0, width: W, depth: D },
  ground: new Int32Array(CELLS).fill(70),
  fluidTop: new Int32Array(CELLS).fill(70),
  fluidKind: new Uint8Array(CELLS),
  seaLevel: 62
});

/**
 * A plan with only the fields the stage touches.
 *
 * The driver writes `ground`, `fluidTop`, `fluidKind` and `snow` and reads
 * nothing else, so the rest of `ColumnPlan` is absent rather than faked — a
 * fake field is a field a future stage could start reading without a test
 * noticing.
 */
const planOf = (base: GroundBaseline): ColumnPlan =>
  ({
    region: base.region,
    ground: Int32Array.from(base.ground),
    fluidTop: Int32Array.from(base.fluidTop),
    fluidKind: Uint8Array.from(base.fluidKind),
    snow: new Uint8Array(CELLS).fill(1),
    seaLevel: base.seaLevel
  }) as unknown as ColumnPlan;

/** One `platform` intent over a row, at a level, in a class. */
const rowClaim = (
  source: string,
  sourceClass: GroundSourceClass,
  z: number,
  y: number,
): GroundIntent => ({
  source,
  sourceClass,
  kind: "platform",
  columns: Array.from({ length: W }, (_, x) => ({ idx: z * W + x, y })),
  transition: "step"
});

/**
 * One claim per tier, on overlapping rows so the tiers actually contest columns
 * — a fixture where every tier owned a private row would pass the prefix
 * assertions for the wrong reason.
 */
const population = (): { tier: GroundTier; intent: GroundIntent }[] => {
  const rows: [GroundSourceClass, number, number][] = [
    ["fluid.channel", 2, 66],
    ["building.footprint", 3, 74],
    ["quarter.plane", 3, 72],
    ["plaza.ground", 3, 71],
    ["courtyard.floor", 4, 73],
    ["street.network", 3, 69],
    ["road.network", 5, 68],
    ["doorstep.landing", 3, 75],
    ["prop.pad", 5, 67],
    ["verge", 7, 76]
  ];
  return rows.map(([cls, z, y]) => ({
    tier: GROUND_TIERS[cls],
    intent: rowClaim(`test.${cls}`, cls, z, y)
  }));
};

/** Declare the population in tier order, through one driver. */
const runStage = (): ReturnType<typeof createGroundDriver> => {
  const base = baseline();
  const driver = createGroundDriver(base, planOf(base));
  const pop = population();
  for (const tier of ["A", "B", "C", "D"] as const) {
    driver.enterTier(tier);
    for (const { tier: t, intent } of pop) if (t === tier) driver.commit([intent]);
  }
  return driver;
};

describe("view(tier) — the read law, generalised (§1.4)", () => {
  it("is the prefix resolve over strictly higher tiers, and nothing else", () => {
    const base = baseline();
    const driver = createGroundDriver(base, planOf(base));
    const pop = population();
    for (const tier of ["A", "B", "C", "D"] as const) {
      driver.enterTier(tier);
      // The independent statement of the same rule: resolve, by hand, exactly
      // the intents in tiers strictly above this one.
      const above = pop
        .filter((p) => tierIndex(p.tier) < tierIndex(tier))
        .map((p) => p.intent);
      const expected = resolveGround(base, above);
      const view = driver.view(tier);
      expect([...view.ground]).toEqual([...expected.ground]);
      expect([...view.fluidTop]).toEqual([...expected.fluidTop]);
      expect([...view.fluidKind]).toEqual([...expected.fluidKind]);
      for (const { tier: t, intent } of pop) if (t === tier) driver.commit([intent]);
    }
  });

  it("hands tier A the pristine baseline — the first case has no owners", () => {
    const base = baseline();
    const driver = createGroundDriver(base, planOf(base));
    driver.enterTier("A");
    expect([...driver.view("A").ground]).toEqual([...base.ground]);
  });

  it("never shows a tier its own claims (§1.4's escape hatch, by construction)", () => {
    const driver = runStage();
    const final = driver.finish();
    // Tier D's own `verge` sits at 76 on row 7 and wins there in the final
    // resolve; the view tier D declared against must not carry it.
    const at = 7 * W + 5;
    expect(final.ground[at]).toBe(76);
    expect(driver.view("D").ground[at]).not.toBe(76);
  });
});

describe("the prefix property (§6/WP-G6)", () => {
  it("agrees with the final resolve on every column the prefix owns", () => {
    const base = baseline();
    const driver = createGroundDriver(base, planOf(base));
    const pop = population();
    const seen: GroundIntent[] = [];
    for (const tier of ["A", "B", "C", "D"] as const) {
      driver.enterTier(tier);
      const view = driver.view(tier);
      // Owned by the prefix ⟹ the answer is already final. Computed from the
      // prefix's own owner map rather than from the tier letters, because that
      // is the set §1.4's first bullet makes the claim about.
      const prefix = resolveGround(base, seen);
      const final = resolveGround(base, pop.map((p) => p.intent));
      for (let k = 0; k < CELLS; k++) {
        if (prefix.owner[k] === -1) continue;
        expect(view.ground[k]).toBe(final.ground[k]);
      }
      for (const { tier: t, intent } of pop) {
        if (t === tier) {
          driver.commit([intent]);
          seen.push(intent);
        }
      }
    }
  });

  it("equals the one-shot resolve at finish()", () => {
    const driver = runStage();
    const final = driver.finish();
    // Re-pinned at the GROUND_V1_FREEZE flip: finish()'s fifth resolve is the
    // GENERATING one (§3.3's G6 amendment), so the oracle must pass the same
    // options — the assertion's meaning is unchanged: the prefix accumulation
    // is not a second resolver.
    const oneShot = resolveGround(driver.baseline, driver.intents, { generate: true });
    expect([...final.ground]).toEqual([...oneShot.ground]);
    expect([...final.owner]).toEqual([...oneShot.owner]);
  });
});

describe("five resolves, and tier order (§1.6, §7.3)", () => {
  it("resolves exactly five times on the settlement path", () => {
    const driver = runStage();
    driver.finish();
    expect(driver.resolves).toBe(5);
    // Idempotent: `finish` is memoised, so asking again is free. The budget is
    // a property of the design, not of how many consumers read the answer.
    driver.finish();
    expect(driver.resolves).toBe(5);
  });

  it("refuses a claim that arrives in a tier a prefix has already sealed", () => {
    const base = baseline();
    const driver = createGroundDriver(base, planOf(base));
    driver.enterTier("C");
    expect(() => driver.commit([rowClaim("late", "fluid.channel", 1, 60)])).toThrow(
      /declaration must run in tier order/,
    );
  });
});

describe("the freeze (§1.6 pass 5c, §2)", () => {
  it("writes the fifth resolve over the plan and clears snow on moved", () => {
    const base = baseline();
    const plan = planOf(base);
    const driver = createGroundDriver(base, plan);
    driver.enterTier("A");
    driver.commit([rowClaim("test.pad", "building.footprint", 6, 77)]);
    const resolved = driver.freeze();
    for (let k = 0; k < CELLS; k++) {
      expect(plan.ground[k]).toBe(resolved.ground[k]);
      // v0 §1.3's rule, landed: snow is cleared exactly on the moved mask, and
      // nowhere else. The eleven hand-written `plan.snow[idx] = 0` lines were
      // always a subset of this.
      expect(plan.snow[k]).toBe(resolved.moved[k] === 1 ? 0 : 1);
    }
  });
});
