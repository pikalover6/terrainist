/**
 * The layout solver (G4a).
 *
 * `solveLayout(request)` places every structure node against the composed
 * terrain and returns four things the rest of the pipeline needs:
 *
 * - **placements** — position, yaw and foundation elevation per node;
 * - **pad edits** — level-to field edits applied *before* materialization, so
 *   a building meets the ground instead of hovering over it;
 * - **an occupancy grid** — consumed by the scatter pass, which is what stops
 *   trees growing through walls;
 * - **resolved ports** — world positions and outward normals, the input G4b's
 *   road router binds to.
 *
 * Plus a machine-readable {@link SolverReport}: per node, where it went, which
 * relaxation rungs were climbed, and every constraint's effective strength and
 * final cost. §4.6 calls that report a first-class artifact, and it is the only
 * thing that makes "why is my chapel over there" answerable.
 */

import type { HeightField } from "@terrainist/stdlib";
import { applyLevelPad } from "@terrainist/stdlib";

import type { PadEdit } from "./types.js";

export * from "./cost.js";
export * from "./fitness.js";
export * from "./frames.js";
export * from "./from-document.js";
export * from "./ports.js";
export * from "./solve.js";
export * from "./types.js";

/**
 * Compose every pad edit into the master field, in document order.
 *
 * Deliberately mutating and deliberately *before* classification re-runs: a pad
 * changes slopes, beaches and snow lines under and around it, and a compiler
 * that levelled the ground after classifying would paint cliff materials on a
 * plaza.
 */
export function applyPadEdits(field: HeightField, edits: readonly PadEdit[]): void {
  for (const edit of edits) {
    applyLevelPad(field, {
      x0: edit.footprint.x0,
      z0: edit.footprint.z0,
      x1: edit.footprint.x1,
      z1: edit.footprint.z1,
      targetY: edit.targetY,
      apron: edit.apron,
    });
  }
}
