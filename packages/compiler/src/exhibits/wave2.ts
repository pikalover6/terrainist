/**
 * Dev-world exhibit rows for archetype wave two.
 *
 * The argument is `exhibits/archetypes.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, with a cottage's footprint and a cottage's windows, and
 * a trullo at nine by seven under a gable is not a trullo. These rows are the
 * fix: each cell carries the archetype's own facade tendencies and a footprint
 * that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`. A row here called `trullo` would therefore be the
 * second row of that name, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `wave2_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread, which is a
 * conflict a merge can resolve.
 */

import { WAVE2_BUILDING_ARCHETYPES, wave2FacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per wave-two row. */
export const WAVE2_ROW_LENGTH = 4;

/**
 * Footprint for a wave-two archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The three that matter most:
 *
 * - the **trullo** is small and *tall*, because the cone is drawn from the
 *   room between the eave plate and the shell roof's top and a short envelope
 *   corbels itself shut in two courses;
 * - the **tudor row** is long and narrow, which is what a row house is;
 * - the **courthouse** is deep rather than wide, because the whole fit-out is
 *   read end to end — dais, bar, gallery — and a square room has no end.
 */
export function wave2SizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "tudor_row":
      return [9 + grow, 14 + grow, 15 + grow * 2];
    case "mediterranean_villa":
      return [13 + grow, 12 + grow, 11 + grow];
    case "trullo":
      return [9 + (grow % 2), 16 + grow * 2, 9 + (grow % 2)];
    case "courthouse":
      return [11 + grow, 13 + grow, 17 + grow];
    case "post_office":
      return [11 + grow, 11, 13 + grow];
    case "infirmary":
      return [11 + grow, 11, 15 + grow];
    case "sawmill":
      return [11 + grow, 11, 17 + grow];
    case "kiln":
      return [9 + grow, 12 + grow, 11 + grow];
    case "tannery":
    default:
      return [11 + grow, 11, 13 + grow];
  }
}

/**
 * The building rows: one per wave-two archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const WAVE2_EXHIBIT_ROWS: readonly DevExhibitRow[] = WAVE2_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `wave2_${archetype}`,
    cells: Array.from({ length: WAVE2_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = wave2FacadeDefaults(archetype);
      const floors = column < Math.ceil(WAVE2_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w2${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: wave2SizeFor(archetype, column),
        params: {
          archetype,
          floors,
          ...(facade.roof === undefined ? {} : { roof: facade.roof }),
          ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
          ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
        },
      };
    }),
  }),
);
