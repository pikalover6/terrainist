/**
 * Dev-world exhibit rows for the wave-four homestead — the rural yards and the
 * fantasy houses.
 *
 * The argument is `exhibits/regional.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a dovecote at thirteen by eleven under a gable is
 * not a dovecote. These rows are the fix: each cell carries the archetype's
 * own facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `home_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { HOMESTEAD_BUILDING_ARCHETYPES, homesteadFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per homestead row. */
export const HOMESTEAD_ROW_LENGTH = 4;

/**
 * Footprint for a homestead archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter most:
 *
 * - the **silo**, the **dovecote** and the **hop kiln** are small and *tall*,
 *   because all three close their roofs with a corbel drawn in the room
 *   between the eave plate and the shell roof's top, and a short envelope
 *   closes itself in two courses;
 * - the **stable** is long, because a corridor of stalls is;
 * - the **chicken coop** and the **root cellar** are low and small, which is
 *   what both of them are;
 * - the **mushroom house** and the **hobbit hole** are squat and tall for the
 *   same reason as the silo: the cap and the mound are corbels.
 */
export function homesteadSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "stable":
      return [13 + grow, 13 + grow, 19 + grow];
    case "silo":
      return [9 + (grow % 2), 18 + grow * 2, 9 + (grow % 2)];
    case "dovecote":
      return [9 + (grow % 2), 18 + grow * 2, 9 + (grow % 2)];
    case "chicken_coop":
      return [11 + grow, 11 + grow, 13 + grow];
    case "apiary":
      return [13 + grow, 13 + grow, 13 + grow];
    case "hop_kiln":
      return [11 + (grow % 2), 17 + grow * 2, 11 + (grow % 2)];
    case "cider_press":
      return [13 + grow, 13 + grow, 15 + grow];
    case "root_cellar_mound":
      return [11 + grow, 14 + grow, 11 + grow];
    case "witch_hut":
      return [11 + grow, 14 + grow, 13 + grow];
    case "mushroom_house":
      return [11 + (grow % 2), 16 + grow * 2, 11 + (grow % 2)];
    case "hobbit_hole":
      return [11 + (grow % 2), 16 + grow * 2, 11 + (grow % 2)];
    case "gingerbread_cottage":
    default:
      return [11 + grow, 14 + grow, 13 + grow];
  }
}

/**
 * The building rows: one per homestead archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const HOMESTEAD_EXHIBIT_ROWS: readonly DevExhibitRow[] = HOMESTEAD_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `home_${archetype}`,
    cells: Array.from({ length: HOMESTEAD_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = homesteadFacadeDefaults(archetype);
      const floors = column < Math.ceil(HOMESTEAD_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w4d${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: homesteadSizeFor(archetype, column),
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
