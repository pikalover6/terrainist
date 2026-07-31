/**
 * Dev-world exhibit rows for wave 6A — the transport buildings.
 *
 * The argument is `exhibits/commerce.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and an airport terminal at nine by seven under a
 * cottage's windows is a shed. These rows are the fix: each cell carries the
 * archetype's own facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two rows
 * with one label is a collision, not an extra exhibit. Every label below is
 * therefore `term_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { TERMINUS_BUILDING_ARCHETYPES, terminusFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per wave-6A row. */
export const TERMINUS_ROW_LENGTH = 4;

/**
 * Footprint for a wave-6A building at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter:
 *
 * - the **halls read end to end** — train station, roundhouse, airport terminal,
 *   shipyard — are long and reasonably wide, because a rail run, a bank of rows
 *   and a keel all want depth, and the banked ones want width for the
 *   three-column aisle as well;
 * - the **boathouse** needs a slip *and* a walkway round it, so it is never
 *   narrow;
 * - the **signal box** and the **toll house** are tiny, which is the whole point
 *   of both;
 * - the **control tower** and the **lighthouse** rebuild the roof, so they get
 *   the height for a deck, a parapet and a topper above the plate.
 */
export function terminusSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "train_station":
      return [15 + grow, 13 + grow, 21 + grow];
    case "signal_box":
      return [9 + grow, 13, 11 + grow];
    case "roundhouse":
      return [15 + grow, 14 + grow, 21 + grow];
    case "coach_house":
      return [13 + grow, 13 + grow, 15 + grow];
    case "toll_house":
      return [9 + grow, 11, 11 + grow];
    case "transit_hub":
      return [15 + grow, 12 + grow, 17 + grow];
    case "control_tower":
      return [11 + grow, 18 + grow, 11 + grow];
    case "airport_terminal":
      return [15 + grow, 13 + grow, 21 + grow];
    case "boathouse":
      return [13 + grow, 14 + grow, 17 + grow];
    case "shipyard":
      return [13 + grow, 15 + grow, 19 + grow];
    case "lighthouse":
      return [11 + grow, 20 + grow, 11 + grow];
    case "climbing_wall":
    default:
      return [13 + grow, 15 + grow, 15 + grow];
  }
}

/**
 * The building rows: one per wave-6A archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const TERMINUS_EXHIBIT_ROWS: readonly DevExhibitRow[] = TERMINUS_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `term_${archetype}`,
    cells: Array.from({ length: TERMINUS_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = terminusFacadeDefaults(archetype);
      const floors = column < Math.ceil(TERMINUS_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_tm${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: terminusSizeFor(archetype, column),
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
