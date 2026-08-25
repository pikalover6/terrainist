/**
 * A station with claimable ground is frontage (`STRIP_FRONTAGE_BY_CLAIM`).
 *
 * The hillside planner's `held` bit is a raster artefact: on a diagonal contour
 * the nearest-point tie hands every equidistant column to the lower station, so
 * `held` reads `1010…` and `stations` — the number a strip is dissolved on and
 * the number its lots are cut from — is half the frontage. These tests pin the
 * pure rule the switch installs: the raster's `held`, OR the probe's positive
 * depth on this side, is frontage.
 */

import { describe, expect, it } from "vitest";

import { STRIP_FRONTAGE_BY_CLAIM, claimableStations } from "../src/layout/forms/hillside.js";

/** Depths for a 6-station run at `from = 2` inside an 8-station path. */
const DEPTHS: readonly (readonly [number, number])[] = [
  [0, 0], // 0 — before the run
  [0, 0], // 1
  [12, 0], // 2 — run station 0: uphill side claimable, downhill not
  [12, 0], // 3
  [12, 0], // 4
  [0, 0], // 5 — pinched on both sides (terrace rise)
  [9, 9], // 6
  [9, 9], // 7 — run station 5
];
const FROM = 2;

describe("a station with claimable ground is frontage", () => {
  it("ships on: a station with claimable depth is frontage", () => {
    expect(STRIP_FRONTAGE_BY_CLAIM).toBe(true);
  });

  it("turns a diagonal's 1010 into the frontage the probe measured", () => {
    const raster = Uint8Array.from([1, 0, 1, 0, 1, 0]);
    const uphill = claimableStations(raster, DEPTHS, FROM, 1);
    // stations 0–2 and 4–5 have uphill depth; station 3 pinched: 111011
    expect([...uphill]).toEqual([1, 1, 1, 0, 1, 1]);
  });

  it("reads the side it is asked about", () => {
    const raster = Uint8Array.from([0, 0, 0, 0, 0, 0]);
    const downhill = claimableStations(raster, DEPTHS, FROM, -1);
    // only stations 4–5 ([9, 9]) have downhill depth
    expect([...downhill]).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it("never un-holds a station the raster held, even with no probed depth", () => {
    const raster = Uint8Array.from([0, 0, 0, 1, 0, 0]);
    const out = claimableStations(raster, DEPTHS, FROM, 1);
    expect(out[3]).toBe(1);
  });

  it("returns a copy and leaves the raster's array alone", () => {
    const raster = Uint8Array.from([1, 0, 1, 0, 1, 0]);
    const out = claimableStations(raster, DEPTHS, FROM, 1);
    expect(out).not.toBe(raster);
    expect([...raster]).toEqual([1, 0, 1, 0, 1, 0]);
  });
});
