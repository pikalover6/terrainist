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
 * the arithmetic: full suppression on claimed ground, ambient past the band,
 * monotone in between, and a pure function of the column.
 */

import { describe, expect, it } from "vitest";

import {
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
  it("suppresses claimed ground outright", () => {
    const weight = undergrowthFeather(halfPlane(), W, D);
    for (let i = 0; i < 20; i++) expect(rowAt(weight, i)).toBe(0);
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

  it("starts near-total at the very edge — the line has to go, not move", () => {
    const weight = undergrowthFeather(halfPlane(), W, D);
    // One column out of claimed ground the meadow is still essentially bare;
    // a step from 0 to a quarter of ambient in one column is the seam again.
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

  it("degenerates cleanly to the old hard mask at band 0", () => {
    const weight = undergrowthFeather(halfPlane(), W, D, 0);
    expect(rowAt(weight, 19)).toBe(0);
    expect(rowAt(weight, 20)).toBe(1);
  });

  it("leaves a document with nothing claimed entirely alone", () => {
    const weight = undergrowthFeather({ mask: new Uint8Array(W * D), byTag: new Map() }, W, D);
    for (const w of weight) expect(w).toBe(1);
  });
});
