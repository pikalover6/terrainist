/**
 * The seed-sweep row — one cell, eight seeds.
 *
 * Every other row of the dev world varies something a reader can name: the
 * archetype, the envelope, the roof, the theme, the plan. This one varies
 * *nothing*, and that is the measurement it makes.
 *
 * The grammar draws a great deal on its own — which window shape, which
 * shutter, where the chimney lands, which stone the skirt is, how the interior
 * is furnished — all of it keyed off the node seed. So a single row of the
 * grid is one sample from a distribution nobody has ever looked at end to end,
 * and "is that cottage wrong, or is that just what a cottage can look like?"
 * has had no cheap answer. Eight identical cells side by side under eight
 * different `seedSalt` values is that answer: whatever varies across these
 * eight is the span of one pass, and anything outside it is a defect.
 *
 * The cell is deliberately the *middle* of the space rather than a corner —
 * two floors, a gable roof, `temperate_timber`, a mid-size square envelope —
 * because a sweep taken at an extreme measures the extreme's clamping as much
 * as it measures the variance.
 */

import type { DevExhibitCell, DevExhibitRow } from "./types.js";

/** The row label, and the id prefix of every cell in it. */
export const SEED_SWEEP_ROW_LABEL = "seed_sweep";

/** How many seeds the sweep walks. */
export const SEED_SWEEP_LENGTH = 8;

/** The one configuration under test, held fixed across the row. */
export const SEED_SWEEP_CELL: Omit<DevExhibitCell, "id" | "seedSalt"> = Object.freeze({
  archetype: "cottage",
  theme: "temperate_timber",
  roof: "gable",
  floors: 2,
  // Mid-size and square: big enough for a stair flight and a wing's worth of
  // interior, small enough that the whole row fits in one look.
  size: [11, 10, 11] as readonly [number, number, number],
});

/** The salt of sweep column `column`. Stable, and the id carries it. */
export function seedSweepSalt(column: number): string {
  return `sweep${column}`;
}

/**
 * The row: the same cell, `SEED_SWEEP_LENGTH` times, under `SEED_SWEEP_LENGTH`
 * salts.
 *
 * The ids differ too, because the grid keys node paths off them — but the salt
 * is what the row is *about*, and it is the field the dev world hands to
 * `nodeSeed` exactly as a document's own `seedSalt` would be handed to it.
 */
export const SEED_SWEEP_EXHIBIT_ROW: DevExhibitRow = Object.freeze({
  row: SEED_SWEEP_ROW_LABEL,
  cells: Array.from({ length: SEED_SWEEP_LENGTH }, (_, column): DevExhibitCell => ({
    ...SEED_SWEEP_CELL,
    id: `${SEED_SWEEP_ROW_LABEL}_${column}`,
    seedSalt: seedSweepSalt(column),
  })),
});

/** Registered from `devworld-rows.ts`. */
export const SEED_EXHIBIT_ROWS: readonly DevExhibitRow[] = Object.freeze([SEED_SWEEP_EXHIBIT_ROW]);
