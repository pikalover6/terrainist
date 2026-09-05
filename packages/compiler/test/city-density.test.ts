/**
 * Two switches behind the Hellenist density finding (spec T7; the Stocktake
 * Run's `docs/decks/anchors/HELLENIST-DENSITY-2026-08-25.md`):
 *
 * - a block face fronts the street anywhere along it, scanned middle-out, not
 *   only at its midpoint (45° city cells lost 68 % of their block land to a
 *   midpoint probe that missed the diagonal carriageway). Its
 *   `STREET_FACE_ALONG_SIDE` switch was deleted with its dead off-path by the
 *   Deslop Run (unit 14); `middleOut` is the scan order now.
 * - the park budget counts land, not cells (two park cells were 65 % of the
 *   fresh Hellenist city's ground). Its `PARK_BUDGET_BY_AREA` switch was
 *   deleted with its dead off-path by the Deslop Run (unit 16).
 *
 * What remains here is the pure rule; the world-level effect of both is
 * measured in the record.
 */

import { describe, expect, it } from "vitest";

import { middleOut } from "../src/layout/district-lots.js";

describe("a block face fronts the street anywhere along it", () => {
  it("asks the midpoint first, then alternates outward to both ends", () => {
    // [10, 16]: mid 13, then 12, 14, 11, 15, 10, 16
    expect(middleOut(10, 16)).toEqual([13, 12, 14, 11, 15, 10, 16]);
  });

  it("covers every column of an even-length side exactly once", () => {
    const order = middleOut(0, 9);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(order[0]).toBe(Math.floor((0 + 9) / 2));
  });

  it("is the midpoint alone for a one-column side", () => {
    expect(middleOut(7, 7)).toEqual([7]);
  });
});
