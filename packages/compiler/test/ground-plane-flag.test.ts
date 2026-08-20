import { describe, expect, it } from "vitest";

import { FLOOR_HEIGHT } from "../src/layout/district.js";
import { GROUND_PLANE_TIE, GROUND_TIE_SPAN } from "../src/layout/types.js";

/**
 * Wave 12A (`docs/GROUND-UNIFICATION-v0.md` §11.4). No call site yet: the flag
 * exists so 12B and 12D have something to hang on, and the only assertions
 * available are that it is off and that `GROUND_TIE_SPAN` is still *derived*.
 */
describe("the ground-plane tie flag (WP-12)", () => {
  it("is off until 12F flips it on a walk verdict", () => {
    expect(GROUND_PLANE_TIE).toBe(false);
  });

  it("pins GROUND_TIE_SPAN to FLOOR_HEIGHT (G4, §11.9.6)", () => {
    // Written as a literal in `layout/types.ts` only because `district.ts`
    // imports that module; this is the edge that keeps the two honest.
    expect(GROUND_TIE_SPAN).toBe(FLOOR_HEIGHT);
  });
});
