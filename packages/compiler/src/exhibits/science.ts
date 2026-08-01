/**
 * Dev-world exhibit rows for wave 5D — science and modern living.
 *
 * The argument is `exhibits/leisure.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a telescope dome at nine by seven under a cottage's
 * windows is a shed with a hat. These rows are the fix: each cell carries the
 * archetype's own facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two rows
 * with one label is a collision, not an extra exhibit. Every label below is
 * therefore `sci_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { SCIENCE_BUILDING_ARCHETYPES, scienceFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per science row. */
export const SCIENCE_ROW_LENGTH = 4;

/**
 * Footprint for a wave-5D building at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter:
 *
 * - the **two domes** — telescope dome and planetarium — are square and *tall*:
 *   a corbel dome is drawn in the room above the eave plate, and on a low
 *   envelope there is no room to draw one, so the roof rebuild refuses;
 * - the **botanical garden** and the **aviary** are wide, because both lay a
 *   field with a clear lane round it and want room for the lane;
 * - the **field station** is small — that is what a field station is.
 */
export function scienceSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "telescope_dome":
      return [15 + grow, 20 + grow, 15 + grow];
    case "planetarium":
      return [15 + grow, 20 + grow, 15 + grow];
    case "alchemy_lab":
      return [13 + grow, 13 + grow, 17 + grow];
    case "herbarium":
      return [13 + grow, 12 + grow, 17 + grow];
    case "aviary":
      return [15 + grow, 13 + grow, 17 + grow];
    case "botanical_garden":
      return [15 + grow, 13 + grow, 19 + grow];
    case "seed_vault":
      return [13 + grow, 12 + grow, 15 + grow];
    case "weather_station":
      return [13 + grow, 15 + grow, 13 + grow];
    case "field_station":
      return [11 + grow, 11, 13 + grow];
    case "penthouse":
      return [15 + grow, 13 + grow, 15 + grow];
    case "atrium_block":
      return [17 + grow, 14 + grow, 17 + grow];
    case "modern_villa":
    default:
      return [15 + grow, 13 + grow, 17 + grow];
  }
}

/**
 * The building rows: one per wave-5D archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const SCIENCE_EXHIBIT_ROWS: readonly DevExhibitRow[] = SCIENCE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `sci_${archetype}`,
    cells: Array.from({ length: SCIENCE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = scienceFacadeDefaults(archetype);
      const floors = column < Math.ceil(SCIENCE_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_sc${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: scienceSizeFor(archetype, column),
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
