/**
 * Dev-world exhibit rows for wave 5B — commerce and civic interiors.
 *
 * The argument is `exhibits/leisure.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a shopping mall at nine by seven under a cottage's
 * windows is a shed. These rows are the fix: each cell carries the archetype's
 * own facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is therefore `comm_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { COMMERCE_BUILDING_ARCHETYPES, commerceFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per commerce row. */
export const COMMERCE_ROW_LENGTH = 4;

/**
 * Footprint for a wave-5B building at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter:
 *
 * - the **halls with banks in them** — auction house, food court, university
 *   hall — are long and reasonably wide, because a bank is read end to end and
 *   needs depth for its rows and width for its three-column aisle;
 * - the **retail sheds** — mall, department store, spice market — are wide, so
 *   the bays down both wall rows still leave a promenade between them;
 * - the **shop row** is narrow-fronted and deep, which is what a terrace of
 *   shopfronts is;
 * - the **gate lodge** is tiny, which is the whole point of a gate lodge.
 */
export function commerceSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "shopping_mall":
      return [15 + grow, 13 + grow, 19 + grow];
    case "department_store":
      return [15 + grow, 13 + grow, 17 + grow];
    case "food_court":
      return [15 + grow, 12 + grow, 19 + grow];
    case "auction_house":
      return [13 + grow, 14 + grow, 19 + grow];
    case "caravanserai":
      return [15 + grow, 12 + grow, 17 + grow];
    case "spice_market":
      return [13 + grow, 12 + grow, 17 + grow];
    case "shop_row":
      return [11 + grow, 13 + grow, 19 + grow];
    case "university_hall":
      return [15 + grow, 15 + grow, 19 + grow];
    case "embassy":
      return [13 + grow, 14 + grow, 17 + grow];
    case "council_chamber":
      return [13 + grow, 13 + grow, 15 + grow];
    case "boarding_house":
      return [13 + grow, 13 + grow, 17 + grow];
    case "gate_lodge":
    default:
      return [9 + grow, 11, 11 + grow];
  }
}

/**
 * The building rows: one per wave-5B archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const COMMERCE_EXHIBIT_ROWS: readonly DevExhibitRow[] = COMMERCE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `comm_${archetype}`,
    cells: Array.from({ length: COMMERCE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = commerceFacadeDefaults(archetype);
      const floors = column < Math.ceil(COMMERCE_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_cm${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: commerceSizeFor(archetype, column),
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
