/**
 * Dev-world exhibit rows for archetype wave four A — the dwellings.
 *
 * The argument is `exhibits/wave2.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a longhouse at nine by seven is a shed. These rows
 * are the fix: each cell carries the archetype's own facade tendencies and a
 * footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `resi_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { RESIDENTIAL_BUILDING_ARCHETYPES, residentialFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per residential row. */
export const RESIDENTIAL_ROW_LENGTH = 4;

/**
 * Footprint for a residential archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter most:
 *
 * - the **longhouse** and the **dormitory** are long, because both are read as
 *   a range of repeated bays and a square room has no range;
 * - the **townhouse** and the **terraced row** are narrow-fronted and deep,
 *   which is what an urban plot is;
 * - the **mansion** is wide enough for its double range — nine interior
 *   columns, or it quietly falls back to a single board;
 * - the **hut** is small, and stays small at every column of the gradient.
 */
export function residentialSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "farmhouse":
      return [13 + grow, 13 + grow, 15 + grow];
    case "townhouse":
      return [9 + grow, 14 + grow, 15 + grow];
    case "terraced_row":
      return [9 + grow, 13 + grow, 17 + grow * 2];
    case "manor_house":
      return [13 + grow, 14 + grow, 17 + grow];
    case "mansion":
      return [15 + grow, 15 + grow, 17 + grow];
    case "longhouse":
      return [11 + grow, 13 + grow, 21 + grow];
    case "bungalow":
      return [13 + grow, 11, 13 + grow];
    case "hut":
      return [9 + (grow % 2), 11, 9 + (grow % 2)];
    case "log_cabin":
      return [11 + grow, 12 + grow, 13 + grow];
    case "courtyard_house":
      return [13 + grow, 12 + grow, 13 + grow];
    case "dormitory":
      return [13 + grow, 12 + grow, 19 + grow];
    case "almshouse":
    default:
      return [11 + grow, 12 + grow, 19 + grow];
  }
}

/**
 * The building rows: one per residential archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version
 * — except the two archetypes that are single-storey by definition.
 */
export const RESIDENTIAL_EXHIBIT_ROWS: readonly DevExhibitRow[] =
  RESIDENTIAL_BUILDING_ARCHETYPES.map((archetype) => ({
    row: `resi_${archetype}`,
    cells: Array.from({ length: RESIDENTIAL_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = residentialFacadeDefaults(archetype);
      const single = archetype === "bungalow" || archetype === "hut";
      const floors = single || column < Math.ceil(RESIDENTIAL_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_r4${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: residentialSizeFor(archetype, column),
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
