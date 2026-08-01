/**
 * Dev-world exhibit rows for the wave-6D spectacle buildings.
 *
 * The argument is `exhibits/arcana.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a big top at eleven by nine under a gable is a shed
 * with stripes on it. These rows are the fix: each cell carries the archetype's
 * own facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two rows
 * with one label is a collision, not an extra exhibit. Every label below is
 * `spec_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { SPECTACLE_BUILDING_ARCHETYPES, spectacleFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per spectacle row. */
export const SPECTACLE_ROW_LENGTH = 4;

/**
 * Footprint for a spectacle archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is:
 *
 * - the **big top** is the tallest and the squarest, because a tent is a cone
 *   and a cone drawn over an oblong is a marquee;
 * - the **hall of mirrors** and the **hedge maze** are long, because both are
 *   comb mazes and a comb needs fingers to be worth walking;
 * - the **dodgems pavilion** wants a generous square: the arena is inset one
 *   cell all round, so a narrow room has an arena with no edge to park at;
 * - the **aquarium** wants a generous square for the same reason — its pool is
 *   inset one cell and the walkway round it is what a visitor uses.
 */
export function spectacleSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "big_top":
      return [17 + grow, 21 + grow * 2, 17 + grow];
    case "hall_of_mirrors":
      return [11 + grow, 12 + grow, 19 + grow];
    case "funhouse":
      return [13 + grow, 13 + grow, 15 + grow];
    case "dodgems_pavilion":
      return [15 + grow, 12 + grow, 15 + grow];
    case "aquarium":
      return [15 + grow, 13 + grow, 15 + grow];
    case "hedge_maze":
    default:
      return [13 + grow, 12 + grow, 19 + grow];
  }
}

/**
 * The building rows: one per spectacle archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const SPECTACLE_EXHIBIT_ROWS: readonly DevExhibitRow[] =
  SPECTACLE_BUILDING_ARCHETYPES.map((archetype) => ({
    row: `spec_${archetype}`,
    cells: Array.from({ length: SPECTACLE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = spectacleFacadeDefaults(archetype);
      const floors = column < Math.ceil(SPECTACLE_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w6d${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: spectacleSizeFor(archetype, column),
        params: {
          archetype,
          floors,
          ...(facade.roof === undefined ? {} : { roof: facade.roof }),
          ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
          ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
        },
      };
    }),
  }));
