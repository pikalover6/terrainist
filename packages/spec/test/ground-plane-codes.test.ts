import { describe, expect, it } from "vitest";

import { TERRAIN_DIAGNOSTICS } from "../src/index.js";

/**
 * Wave 12A's registry test (`docs/GROUND-UNIFICATION-v0.md` §11.4, §11.7). The
 * four ground-plane codes are minted before anything emits them, so the only
 * thing there is to assert is that they exist, that they are the numbers §11.7
 * ratified, and that they did not land on top of a neighbour.
 */
describe("ground-plane tie diagnostics (WP-12)", () => {
  it("mints the four codes at their ratified numbers", () => {
    expect(TERRAIN_DIAGNOSTICS.GROUND_PLANE_UNTIED).toBe("LOAM-T241");
    expect(TERRAIN_DIAGNOSTICS.GROUND_PLANE_DRIFT).toBe("LOAM-T242");
    expect(TERRAIN_DIAGNOSTICS.PLANE_EDGE_SERVED).toBe("LOAM-I416");
    expect(TERRAIN_DIAGNOSTICS.PLANE_EDGE_DEFERRED).toBe("LOAM-I417");
  });

  it("continues the blocks it says it continues", () => {
    // `T241`-`T242` after `DISTRICT_BLOCK_ALLEY`; `I416`-`I417` after
    // `WALL_COURSE_CROSSES_SEAM`.
    expect(TERRAIN_DIAGNOSTICS.DISTRICT_BLOCK_ALLEY).toBe("LOAM-T240");
    expect(TERRAIN_DIAGNOSTICS.WALL_COURSE_CROSSES_SEAM).toBe("LOAM-I415");
  });

  it("keeps every terrain diagnostic code unique", () => {
    const codes = Object.values(TERRAIN_DIAGNOSTICS);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
