/**
 * Dev-world exhibit rows for wave 5C — industry and modern works.
 *
 * The argument is `exhibits/works.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, with a cottage's footprint and a cottage's windows, and a
 * ropewalk at nine by seven under a cottage gable is not a ropewalk. These rows
 * are the fix: each cell carries the archetype's own facade tendencies and a
 * footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`. A row here called `refinery` would therefore be the
 * second row of that name, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `indy_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread, which is a
 * conflict a merge can resolve.
 */

import { INDUSTRY_BUILDING_ARCHETYPES, industryFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per industry row. */
export const INDUSTRY_ROW_LENGTH = 4;

/**
 * Footprint for an industry archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. A works is read **down its length** —
 * intake at the door end, machinery up the walls, the fire at the far end — so
 * the industrial seven are deep. The ropewalk is the deepest thing in the whole
 * catalog because a rope walk *is* its length; the conference centre wants
 * depth for its seat bank; and the brutalist block wants a plain fat rect,
 * because the facade is the building.
 */
export function industrySizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "brickworks":
      return [11 + grow, 12 + grow, 15 + grow];
    case "blast_furnace_works":
      return [13 + grow, 13 + grow, 15 + grow];
    case "factory_hall":
      return [13 + grow, 13 + grow, 19 + grow];
    case "machine_shop":
      return [11 + grow, 12 + grow, 15 + grow];
    case "refinery":
      return [13 + grow, 12 + grow, 17 + grow];
    case "charcoal_burner":
      return [13 + grow, 11, 13 + grow];
    case "ropewalk":
      return [11 + grow, 11, 21 + grow];
    case "parking_garage":
      return [15 + grow, 13 + grow, 17 + grow];
    case "gas_station":
      return [13 + grow, 11, 13 + grow];
    case "data_center":
      return [15 + grow, 12 + grow, 17 + grow];
    case "conference_center":
      return [15 + grow, 14 + grow, 19 + grow];
    case "brutalist_block":
    default:
      return [15 + grow, 15 + grow, 15 + grow];
  }
}

/**
 * The building rows: one per industry archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const INDUSTRY_EXHIBIT_ROWS: readonly DevExhibitRow[] = INDUSTRY_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `indy_${archetype}`,
    cells: Array.from({ length: INDUSTRY_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = industryFacadeDefaults(archetype);
      const floors = column < Math.ceil(INDUSTRY_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w5c${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: industrySizeFor(archetype, column),
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
