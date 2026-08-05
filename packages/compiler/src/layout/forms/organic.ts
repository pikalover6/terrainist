/**
 * `organic` — a grid that has been let go of. **Frozen, and honestly described.**
 *
 * Twice the jitter of `grid`, plus a per-line wander sampled every
 * `ORGANIC_WAVELENGTH` blocks from a positional hash and interpolated between
 * waypoints. It is not an organic town and never was; it is the cheapest
 * possible departure from a grid, it is what half the goldens are built on, and
 * it is kept because both of those are true (§5.4). `grown` is the real thing.
 */

import { axialDraw } from "./grid.js";
import { MIN_DISTRICT_SPAN } from "./axial.js";
import type { FormContext, FormResult, UrbanForm } from "./types.js";

/** The `organic` form. */
export const ORGANIC_FORM: UrbanForm = {
  id: "organic",
  requires: {
    minSpan: MIN_DISTRICT_SPAN,
    polygon: true,
    fallback: null,
  },
  describe:
    "The same two sets of streets as `grid`, let go of: twice the jitter and a slow sideways wander along every line. The legacy value — an unplanned quarter is `grown`.",
  draw(ctx: FormContext): FormResult {
    return axialDraw(ctx, "organic");
  },
};
