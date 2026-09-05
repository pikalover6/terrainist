/**
 * Two fluid-stability fixes behind `LOAM-T110 UNSTABLE_FLUID` (the Stocktake
 * Run's F1;
 * `scratchpad/t110/T110-PROBE.md`, recorded in `docs/decks/anchors/T110-2026-08-25.md`):
 *
 * - `OCEAN_FILL_CONTINUES` — the ocean fill keeps going past a `flooded:
 *   "never"` column it had to flood, so an unblocked below-sea column on its
 *   far side is not left dry against the sea (three of five refusals).
 * - a second pool never lowers the first (the railway town's basin over a
 *   river pond, 71 blocks). Its `POOL_NEVER_LOWERS` switch was deleted with
 *   its dead off-path by the Deslop Run (unit 24); the guard is unconditional
 *   now and its world effect is measured in the record.
 *
 * The ocean fill is a pure function of a height field, so the fix is pinned on
 * a synthetic 7 × 7 field with an explicit option.
 */

import { describe, expect, it } from "vitest";

import { HeightField, OCEAN_FILL_CONTINUES, computeOceanMask } from "@terrainist/stdlib";

/**
 * A 7 × 7 field: everything below sea (60 < 63) except a ring of land at
 * height 70 around the centre block; inside the ring, a `never` column at the
 * one gap in the ring (3, 1) and a below-sea column behind it at (3, 2).
 * The sea reaches the gap; the gap is blocked; the column behind it is the
 * stranded one.
 */
function fixture(): { field: HeightField; noFlood: Uint8Array; gap: number; behind: number } {
  const width = 7, depth = 7;
  const values = new Float64Array(width * depth).fill(60);
  const at = (x: number, z: number) => z * width + x;
  for (let x = 2; x <= 4; x++) for (let z = 1; z <= 3; z++) values[at(x, z)] = 70; // the ring + inside
  values[at(3, 1)] = 60; // the gap in the ring (sea side)
  values[at(3, 2)] = 60; // behind the gap, inside
  const noFlood = new Uint8Array(width * depth);
  noFlood[at(3, 1)] = 1;
  const field = new HeightField({ x0: 0, z0: 0, width, depth }, values);
  return { field, noFlood, gap: at(3, 1), behind: at(3, 2) };
}

describe("the ocean fill continues past a never column it had to flood", () => {
  it("ships on", () => {
    expect(OCEAN_FILL_CONTINUES).toBe(true);
  });

  it("today strands the column behind the flooded gap dry against the sea", () => {
    const { field, noFlood, gap, behind } = fixture();
    const r = computeOceanMask(field, 63, noFlood, { continuePastNoFlood: false });
    expect(r.mask[gap]).toBe(1);
    expect(r.overriddenNoFlood).toBe(1);
    expect(r.mask[behind]).toBe(0);
  });

  it("on, the sea that crossed the gap reaches the column behind it", () => {
    const { field, noFlood, gap, behind } = fixture();
    const r = computeOceanMask(field, 63, noFlood, { continuePastNoFlood: true });
    expect(r.mask[gap]).toBe(1);
    expect(r.mask[behind]).toBe(1);
    expect(r.overriddenNoFlood).toBe(1);
  });

  it("is byte-identical with no never mask either way", () => {
    const { field } = fixture();
    const a = computeOceanMask(field, 63, undefined, { continuePastNoFlood: false });
    const b = computeOceanMask(field, 63, undefined, { continuePastNoFlood: true });
    expect([...a.mask]).toEqual([...b.mask]);
  });
});
