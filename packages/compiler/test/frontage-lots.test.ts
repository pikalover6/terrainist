/**
 * Two switches on the planned path's lot walk (`frontageLots`), staged under
 * the Stocktake Run's law 5 (`docs/decks/anchors/MONTFORT-HILLSIDE-2026-08-25.md`):
 *
 * - `LOT_PARCEL_OWN_STATIONS` — a lot's parcel grows inward through its own
 *   stations, never sideways into the next lot's (the starvation that dropped
 *   ~70 % of hillside lots).
 * - `PLANNED_SITE_WHOLE_STRIP` — the site a strip offers a landmark is the
 *   strip's free mask, not the union of the lots already seated.
 *
 * These pin the switch states and the one pure rule; the world-level effect is
 * measured in the record, not asserted here.
 */

import { describe, expect, it } from "vitest";

import {
  LOT_PARCEL_OWN_STATIONS,
  PLANNED_SITE_WHOLE_STRIP,
  inLotSpan,
} from "../src/layout/district.js";

describe("a frontage lot grows through its own stations", () => {
  it("stays off until the parcel can take its leftovers too (F10)", () => {
    expect(LOT_PARCEL_OWN_STATIONS).toBe(false);
  });

  it("admits a station inside the lot's span and refuses one outside it, both ends", () => {
    // a lot of size 4 starting at station 6 spans 6, 7, 8, 9
    expect(inLotSpan(6, 6, 4)).toBe(true);
    expect(inLotSpan(9, 6, 4)).toBe(true);
    expect(inLotSpan(5, 6, 4)).toBe(false);
    expect(inLotSpan(10, 6, 4)).toBe(false);
  });

  it("refuses a column no station owns", () => {
    expect(inLotSpan(-1, 0, 3)).toBe(false);
  });
});

describe("the whole strip, offered to a landmark", () => {
  it("ships on: the site is the strip's free mask", () => {
    expect(PLANNED_SITE_WHOLE_STRIP).toBe(true);
  });
});
