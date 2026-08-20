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

/**
 * The ground contract v1's own codes (`docs/GROUND-CONTRACT-v1.md` §7.5, §8's
 * collision-file discipline).
 *
 * §7.5 allocates every number the rewrite needs **in the document**, once, so
 * that two concurrent waves cannot pick the same free integer and collide on
 * merge. This test is the other half of that discipline: it pins the numbers to
 * the ones §7.5 ratified and pins the neighbours they were measured against, so
 * a wave that renumbers one fails here rather than in a merge.
 */
describe("ground contract v1 diagnostics (WP-G4)", () => {
  it("mints §7.5's codes at their allocated numbers", () => {
    expect(TERRAIN_DIAGNOSTICS.GROUND_SEAM_UNCOVERED).toBe("LOAM-E495");
    expect(TERRAIN_DIAGNOSTICS.GROUND_STAGE).toBe("LOAM-I497");
  });

  it("did not land on top of a neighbour", () => {
    // §7.5: "`E495`, `W494` and `I497` are unoccupied; `E494`, `E497`, `I491`,
    // `I495`, `I496`, `I498`, `W490`, `W492`, `W493` are not."
    expect(TERRAIN_DIAGNOSTICS.GROUND_INVARIANT).toBe("LOAM-E494");
    expect(TERRAIN_DIAGNOSTICS.GROUND_TRANSITION).toBe("LOAM-I495");
    expect(TERRAIN_DIAGNOSTICS.SITE_COMPOSITION).toBe("LOAM-I496");
    expect(TERRAIN_DIAGNOSTICS.SITE_PLAN_FAILED).toBe("LOAM-E497");
    expect(TERRAIN_DIAGNOSTICS.DISTRICT_FORM_ALIAS).toBe("LOAM-I498");
  });

  it("gives every name exactly one code and every code exactly one name", () => {
    const entries = Object.entries(TERRAIN_DIAGNOSTICS);
    expect(new Set(entries.map(([name]) => name)).size).toBe(entries.length);
    expect(new Set(entries.map(([, code]) => code)).size).toBe(entries.length);
  });
});
