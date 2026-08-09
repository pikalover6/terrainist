/**
 * The settlement-edge undergrowth feather.
 *
 * Kai's walk of `hillside_town_steep` (2026-08-07) found a straight line across
 * the natural terraces: tall grass, ferns and flowers on one side, bare stepped
 * grass on the other. It was the layout solver's occupancy union — a union of
 * rectangles — read by the undergrowth pass as a hard in/out test. Measured on
 * that fixture before the fix: 0.000 plants per column inside the mask, 0.207
 * one column outside it.
 *
 * `undergrowthFeather` is the ramp that dissolves it, and these are the
 * properties the ramp has to have. They are written against the contract, not
 * the arithmetic: the interior share on claimed ground, ambient past the band,
 * monotone in between, and a pure function of the column.
 *
 * The inner endpoint changed on 2026-08-09. It used to be 0, from the days when
 * the claim really was bare; the town green then filled the claim to half
 * ambient and left a *trough* between them — half inside, nearly nothing one
 * column out, ambient ten columns further. Kai walked that trough and it is the
 * harsh cutoff this file now holds against: one density field from ambient down
 * to the interior share, monotone, with no zero in it.
 */

import { describe, expect, it } from "vitest";

import {
  TOWN_GREEN_DENSITY,
  UNDERGROWTH_FEATHER,
  undergrowthFeather,
  type StructureOccupancy,
} from "../src/terrain/vegetation.js";

const W = 64;
const D = 64;

/** A settlement claiming the left half of the region — a dead straight edge. */
function halfPlane(): StructureOccupancy {
  const mask = new Uint8Array(W * D);
  for (let j = 0; j < D; j++) for (let i = 0; i < 20; i++) mask[j * W + i] = 1;
  return { mask, byTag: new Map() };
}

/** The weight on the middle row, `i` columns in from the left edge. */
function rowAt(weight: Float32Array, i: number): number {
  return weight[(D >> 1) * W + i] as number;
}

describe("the settlement-edge undergrowth feather", () => {
  it("holds claimed ground at the interior share, not at nothing", () => {
    const weight = undergrowthFeather(halfPlane(), W, D);
    for (let i = 0; i < 20; i++) expect(rowAt(weight, i)).toBe(TOWN_GREEN_DENSITY);
  });

  it("returns to ambient at the band's outer rim, and stays there", () => {
    const weight = undergrowthFeather(halfPlane(), W, D);
    for (let i = 20 + UNDERGROWTH_FEATHER; i < W; i++) expect(rowAt(weight, i)).toBe(1);
  });

  it("ramps monotonically across the band, and nowhere leaves 0..1", () => {
    const weight = undergrowthFeather(halfPlane(), W, D);
    let previous = -1;
    for (let i = 20; i < 20 + UNDERGROWTH_FEATHER; i++) {
      const w = rowAt(weight, i);
      expect(w).toBeGreaterThan(previous);
      previous = w;
    }
    for (const w of weight) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("leaves the claim at the interior share — the line has to go, not move", () => {
    const weight = undergrowthFeather(halfPlane(), W, D);
    // One column out of claimed ground the town's own density still rules; a
    // step to a quarter of the way back to ambient in one column is the seam
    // again, and a step *down* to bare is the trough this replaced.
    expect(rowAt(weight, 20)).toBeGreaterThanOrEqual(TOWN_GREEN_DENSITY);
    expect(rowAt(weight, 20)).toBeLessThan(TOWN_GREEN_DENSITY + 0.1 * (1 - TOWN_GREEN_DENSITY));
  });

  it("never dips below the interior share anywhere — no trough", () => {
    for (const share of [0.25, TOWN_GREEN_DENSITY, 0.75]) {
      const weight = undergrowthFeather(halfPlane(), W, D, UNDERGROWTH_FEATHER, share);
      for (const w of weight) expect(w).toBeGreaterThanOrEqual(share);
      // ...and it is one monotone field the whole way out, claim included.
      let previous = -1;
      for (let i = 0; i < W; i++) {
        const w = rowAt(weight, i);
        expect(w).toBeGreaterThanOrEqual(previous);
        previous = w;
      }
    }
  });

  it("takes the dial's share as its inner endpoint, and only that", () => {
    const sparse = undergrowthFeather(halfPlane(), W, D, UNDERGROWTH_FEATHER, 0.25);
    const lush = undergrowthFeather(halfPlane(), W, D, UNDERGROWTH_FEATHER, 0.75);
    expect(rowAt(sparse, 0)).toBeCloseTo(0.25, 6);
    expect(rowAt(lush, 0)).toBeCloseTo(0.75, 6);
    // Weak control: the band's width and the ambient it reaches are untouched.
    for (let i = 20 + UNDERGROWTH_FEATHER; i < W; i++) {
      expect(rowAt(sparse, i)).toBe(1);
      expect(rowAt(lush, i)).toBe(1);
    }
    // A lusher town is never *less* green than a sparser one, column for column.
    for (let i = 0; i < W; i++) expect(rowAt(lush, i)).toBeGreaterThanOrEqual(rowAt(sparse, i));
  });

  it("keeps the old bare-claim behaviour reachable at share 0", () => {
    const weight = undergrowthFeather(halfPlane(), W, D, UNDERGROWTH_FEATHER, 0);
    for (let i = 0; i < 20; i++) expect(rowAt(weight, i)).toBe(0);
    expect(rowAt(weight, 20)).toBeLessThan(0.1);
  });

  it("is a pure function of the mask — same input, same field", () => {
    const a = undergrowthFeather(halfPlane(), W, D);
    const b = undergrowthFeather(halfPlane(), W, D);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("is translation-locked to the mask, not to the traversal", () => {
    // The same edge, built by filling the mask in the opposite order. Anything
    // order-dependent in the distance transform would show up here.
    const mask = new Uint8Array(W * D);
    for (let j = D - 1; j >= 0; j--) for (let i = 19; i >= 0; i--) mask[j * W + i] = 1;
    const weight = undergrowthFeather({ mask, byTag: new Map() }, W, D);
    expect(Array.from(weight)).toEqual(Array.from(undergrowthFeather(halfPlane(), W, D)));
  });

  it("degenerates cleanly to a hard step at band 0", () => {
    const weight = undergrowthFeather(halfPlane(), W, D, 0);
    expect(rowAt(weight, 19)).toBe(TOWN_GREEN_DENSITY);
    expect(rowAt(weight, 20)).toBe(1);
    expect(rowAt(undergrowthFeather(halfPlane(), W, D, 0, 0), 19)).toBe(0);
  });

  it("leaves a document with nothing claimed entirely alone", () => {
    const weight = undergrowthFeather({ mask: new Uint8Array(W * D), byTag: new Map() }, W, D);
    for (const w of weight) expect(w).toBe(1);
  });
});
