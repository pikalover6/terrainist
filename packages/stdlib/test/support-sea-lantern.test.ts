/**
 * `sea_lantern` is a full cube (Stocktake Run unit 27, F14): it ends in
 * "lantern" and the support classifier read it as a hanging lamp, which made
 * every sea lantern on the Hellenist and alien-farm anchors a physics finding
 * ("stands on air", "its support chain does not reach a solid block"). A
 * lantern proper still hangs or stands.
 */

import { describe, expect, it } from "vitest";

import { needsGround, supportDirection } from "../src/structures/support.js";

describe("sea_lantern is a block, not a lamp", () => {
  it("needs no ground and has no support direction", () => {
    expect(needsGround("sea_lantern")).toBe(false);
    expect(supportDirection("sea_lantern", undefined)).toBeNull();
    expect(supportDirection("sea_lantern", { waterlogged: "false" })).toBeNull();
  });
  it("a lantern still stands or hangs", () => {
    expect(needsGround("lantern")).toBe(true);
    expect(needsGround("soul_lantern")).toBe(true);
    expect(supportDirection("lantern", { hanging: "false" })).toBe("below");
    expect(supportDirection("soul_lantern", { hanging: "true" })).toBe("above");
  });
});
