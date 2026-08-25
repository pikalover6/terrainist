/**
 * `KERB_SYMBOL_UNSCOPED` (the slop census's class-3 M2; Stocktake Run units
 * 22–23): a district in its own theme lays its kerb course from the palette's
 * `street.curb` symbol — the one the sidewalk pass beside it reads — rather
 * than from the district theme's table, so the two courses are one material.
 * Attributed on the fourteen law-5 documents: two move (the pirate cities),
 * each an exact swap of the kerb course, polished diorite → andesite.
 */

import { describe, expect, it } from "vitest";

import { KERB_SYMBOL_UNSCOPED } from "../src/structures/roads.js";

describe("the kerb is one course, whoever themes the district", () => {
  it("ships on", () => {
    expect(KERB_SYMBOL_UNSCOPED).toBe(true);
  });
});
