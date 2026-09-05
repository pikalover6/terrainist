/**
 * The Stocktake Run's F20 (`docs/decks/anchors/F10-LOWER-SQUARE-2026-08-25.md`
 * §G): a route is graded
 * against the ground it will get. A station on a column a higher tier already
 * won is pinned at that height, so the 1-Lipschitz envelope passes through it
 * instead of cutting under it and being refused.
 *
 * Two pure pins and one driver read: the grader with and without pins on the
 * hillside fixture's own numbers (a 109 terrace, three held rows at its edge,
 * a 103 square ahead), and `view("C").held` over a tier-A claim. The
 * `ROUTE_PINS_HELD_GROUND` switch was deleted with its dead off-path by the
 * Deslop Run (unit 17); the pins are unconditional now.
 */

import { describe, expect, it } from "vitest";

import type { GroundBaseline, GroundIntent } from "../src/layout/ground-contract.js";
import { createGroundDriver } from "../src/layout/ground-driver.js";
import { gradeProfile } from "../src/structures/sweep.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

describe("a route is graded against the ground it will get", () => {
  // Stations 0…7 on the terrace at 109, the edge rows 5, 6, 7 held by the
  // quarter plane and a pad's apron, then the lower level at 103 — the sheer
  // edge the fixture's lane met, where the 1-Lipschitz line from low ground
  // ahead trenches the terrace.
  const ground = [109, 109, 109, 109, 109, 109, 109, 109, 103, 103, 103, 103, 103, 103, 103, 103];
  const heldAt = new Set([5, 6, 7]);
  const sea = 62;

  it("today cuts a lower envelope through the held rows — the cutting the resolver refuses", () => {
    const today = gradeProfile(ground, sea, 1, 0);
    // The envelope reaches for 103 ahead: the held rows are graded below 109,
    // one per station back from the edge — 105, 106, 107 (the band is 1).
    expect([today[5], today[6], today[7]]).toEqual([107, 106, 105]);
  });

  it("pinned, the held rows stay at 109 and the descent is graded past them, 1-Lipschitz", () => {
    const band = ground.map((_, i) => (heldAt.has(i) ? 0 : 1));
    const floor = ground.map((y, i) => (heldAt.has(i) ? y : 0));
    const on = gradeProfile(ground, sea, band, floor);
    for (const i of heldAt) expect(on[i]).toBe(109);
    for (let i = 1; i < on.length; i++) expect(Math.abs((on[i] as number) - (on[i - 1] as number))).toBeLessThanOrEqual(1);
    // The descent starts *after* the last pin and gets down at one per station.
    expect([on[8], on[9], on[10], on[11], on[12]]).toEqual([108, 107, 106, 105, 104]);
    expect(on[on.length - 1]).toBe(104);
  });
});

describe("view(tier).held marks the prefix's decisions", () => {
  const W = 8;
  const D = 8;
  const CELLS = W * D;
  const baseline = (): GroundBaseline => ({
    region: { x0: 0, z0: 0, width: W, depth: D },
    ground: new Int32Array(CELLS).fill(70),
    fluidTop: new Int32Array(CELLS).fill(70),
    fluidKind: new Uint8Array(CELLS),
    seaLevel: 62
  });
  const planOf = (base: GroundBaseline): ColumnPlan =>
    ({
      region: base.region,
      ground: Int32Array.from(base.ground),
      fluidTop: Int32Array.from(base.fluidTop),
      fluidKind: Uint8Array.from(base.fluidKind),
      snow: new Uint8Array(CELLS).fill(1),
      seaLevel: base.seaLevel
    }) as unknown as ColumnPlan;
  const row = (z: number, y: number): GroundIntent => ({
    source: "test.building.footprint",
    sourceClass: "building.footprint",
    kind: "platform",
    columns: Array.from({ length: W }, (_, x) => ({ idx: z * W + x, y })),
    transition: "step"
  });

  it("holds the tier-A pad's row for the road's tier and nothing else", () => {
    const base = baseline();
    const driver = createGroundDriver(base, planOf(base));
    driver.enterTier("A");
    driver.commit([row(3, 74)]);
    driver.enterTier("B");
    driver.enterTier("C");
    const view = driver.view("C");
    expect(view.held).toBeDefined();
    const held = view.held as Uint8Array;
    expect(held[3 * W + 0]).toBe(1);
    expect(held[3 * W + W - 1]).toBe(1);
    expect(held[5 * W + 0]).toBe(0);
    expect(view.ground[3 * W + 0]).toBe(74);
    expect([...held].reduce((n, v) => n + v, 0)).toBe(W);
  });
});
