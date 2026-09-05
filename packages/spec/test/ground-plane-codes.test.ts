import { describe, expect, it } from "vitest";

import { TERRAIN_DIAGNOSTICS } from "../src/ir.js";

describe("terrain diagnostic codes", () => {
  it("keeps the ground-plane tie codes at their numbers", () => {
    expect(TERRAIN_DIAGNOSTICS.GROUND_PLANE_UNTIED).toBe("LOAM-T241");
    expect(TERRAIN_DIAGNOSTICS.GROUND_PLANE_DRIFT).toBe("LOAM-T242");
    expect(TERRAIN_DIAGNOSTICS.DISTRICT_BLOCK_ALLEY).toBe("LOAM-T240");
  });

  it("keeps every terrain diagnostic code unique", () => {
    const codes = Object.values(TERRAIN_DIAGNOSTICS);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
