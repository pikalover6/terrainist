/**
 * The highrise door's head course is written (`HIGHRISE_DOOR_HEAD_SOLID`).
 *
 * `emitHighrise`'s curtain-wall loop skipped the door columns at relative
 * y1–y3 on the ground storey while its comment promised an opaque head course;
 * with `storyHeight > 3` that left air over every highrise door, and on
 * `examples/c1-harbourtown` a canopy slab with air on six sides — the physics
 * gate (`bridge-stair.test.ts`). This pins the switch; the gate pins the world.
 */

import { describe, expect, it } from "vitest";

import { HIGHRISE_DOOR_HEAD_SOLID } from "@terrainist/stdlib";

describe("a highrise door has a head course", () => {
  it("ships on", () => {
    expect(HIGHRISE_DOOR_HEAD_SOLID).toBe(true);
  });
});
