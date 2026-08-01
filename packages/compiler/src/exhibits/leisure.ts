/**
 * Dev-world exhibit rows for wave 4C — leisure, modern and science interiors.
 *
 * The argument is `exhibits/institution.ts`'s, unchanged. `devworld.ts`
 * already builds one row per entry of `BUILDING_ARCHETYPES`, so every
 * archetype here appears in the grid without a line of this file — but it
 * appears at the *cottage gradient*, and a lecture hall at nine by seven under
 * a cottage's windows is a shed. These rows are the fix: each cell carries the
 * archetype's own facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is therefore `lei_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { LEISURE_BUILDING_ARCHETYPES, leisureFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per leisure row. */
export const LEISURE_ROW_LENGTH = 4;

/**
 * Footprint for a wave-4C building at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter:
 *
 * - the **auditoria** — theatre, opera house, cinema, lecture hall — are long
 *   and reasonably wide, because a seat bank is read end to end and needs
 *   depth for its rows and width for its three-column aisle;
 * - the **boxing gym** is square and generous: its ring is only raised when
 *   the room can keep a clear lane all the way round it;
 * - the **sauna** and the **convenience store** are small, which is what a
 *   sweat room and a corner shop are.
 */
export function leisureSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "theater":
      return [13 + grow, 14 + grow, 19 + grow];
    case "opera_house":
      return [15 + grow, 15 + grow, 19 + grow];
    case "cinema":
      return [13 + grow, 12 + grow, 19 + grow];
    case "dance_hall":
      return [15 + grow, 13 + grow, 17 + grow];
    case "boxing_gym":
      return [15 + grow, 12 + grow, 15 + grow];
    case "sauna":
      return [11 + grow, 11, 13 + grow];
    case "ski_lodge":
      return [15 + grow, 14 + grow, 15 + grow];
    case "clubhouse":
      return [13 + grow, 13 + grow, 15 + grow];
    case "glass_pavilion":
      return [13 + grow, 12 + grow, 13 + grow];
    case "convenience_store":
      return [11 + grow, 11, 15 + grow];
    case "laboratory":
      return [13 + grow, 12 + grow, 17 + grow];
    case "lecture_hall":
    default:
      return [15 + grow, 14 + grow, 19 + grow];
  }
}

/**
 * The building rows: one per wave-4C archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const LEISURE_EXHIBIT_ROWS: readonly DevExhibitRow[] = LEISURE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `lei_${archetype}`,
    cells: Array.from({ length: LEISURE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = leisureFacadeDefaults(archetype);
      const floors = column < Math.ceil(LEISURE_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_le${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: leisureSizeFor(archetype, column),
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
