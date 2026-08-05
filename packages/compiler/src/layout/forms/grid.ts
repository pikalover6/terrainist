/**
 * `grid` — a surveyed plan. **Frozen.**
 *
 * Line positions per axis, each line spanning the domain edge to edge, interior
 * lines jittered by `GRID_JITTER` and clamped so two lines cannot cross or close
 * the block between them. Every `AVENUE_EVERY`th line is an avenue.
 *
 * Terrain: none. A grid is what an authority draws on paper and then makes the
 * ground agree with, which is exactly what the district's own pad does.
 *
 * This module is an **adapter**, not a construction: the construction is
 * `axial.ts`, moved unchanged, and `grid` is `axialGraph` with `fabric: "grid"`.
 * That is the byte-identity argument (§5.1) in one line of code.
 */

import { MIN_DISTRICT_SPAN, axialGraph } from "./axial.js";
import { drewAsAsked, type FormContext, type FormResult, type UrbanForm } from "./types.js";

/** The `grid` form. */
export const GRID_FORM: UrbanForm = {
  id: "grid",
  requires: {
    minSpan: MIN_DISTRICT_SPAN,
    polygon: true,
    // Nothing to fall back *to*: a grid is the floor of the vocabulary, and a
    // domain too small for one is `DISTRICT_TOO_SMALL`, exactly as today.
    fallback: null,
  },
  describe:
    "A surveyed plan: two perpendicular sets of straight streets, each running the width of the quarter, with an avenue every third line. What an authority lays out on paper and then makes the ground agree with.",
  draw(ctx: FormContext): FormResult {
    return axialDraw(ctx, "grid");
  },
};

/** Shared by `grid` and `organic`: the two values that distinguish them. */
export function axialDraw(ctx: FormContext, fabric: "grid" | "organic"): FormResult {
  const result = axialGraph({
    bounds: ctx.bounds,
    fabric,
    seed: ctx.seed,
    blockSize: ctx.blockSize,
    sidewalk: ctx.sidewalk,
    ...(ctx.mask === undefined ? {} : { mask: ctx.mask }),
    ...(ctx.orientation === undefined ? {} : { orientation: ctx.orientation }),
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason, fix: result.fix, fallback: null };
  }
  return { ok: true, plan: { graph: result.graph, record: drewAsAsked(fabric) } };
}
