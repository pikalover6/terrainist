/**
 * Dev-world exhibit rows for the institutions — archetype wave three A.
 *
 * The argument is `exhibits/wave2.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a prison at nine by seven under a cottage's windows
 * is a shed. These rows are the fix: each cell carries the archetype's own
 * facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is therefore `inst_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { INSTITUTION_BUILDING_ARCHETYPES, institutionFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per institution row. */
export const INSTITUTION_ROW_LENGTH = 4;

/**
 * Footprint for an institution at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter:
 *
 * - the **prison** and the **hospital** are long, because both are read as a
 *   range of repeated bays rather than as a room;
 * - the **guildhall** is deep for the same reason the courthouse is: the
 *   fit-out runs end to end and a square room has no end;
 * - the **counting house** and the **police station** are small and wide,
 *   which is what a two-rank office and a front desk want.
 */
export function institutionSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "museum":
      return [13 + grow, 13 + grow, 15 + grow];
    case "guildhall":
      return [13 + grow, 14 + grow, 17 + grow];
    case "prison":
      return [11 + grow, 11, 17 + grow];
    case "police_station":
      return [13 + grow, 11, 13 + grow];
    case "fire_station":
      return [13 + grow, 12 + grow, 15 + grow];
    case "hospital":
      return [13 + grow, 12 + grow, 17 + grow];
    case "workhouse":
      return [11 + grow, 12 + grow, 17 + grow];
    case "orphanage":
      return [11 + grow, 12 + grow, 15 + grow];
    case "mint":
      return [11 + grow, 12 + grow, 13 + grow];
    case "customs_house":
      return [13 + grow, 12 + grow, 13 + grow];
    case "bank":
      return [13 + grow, 13 + grow, 13 + grow];
    case "counting_house":
    default:
      return [13 + grow, 11, 15 + grow];
  }
}

/**
 * The building rows: one per institution, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const INSTITUTION_EXHIBIT_ROWS: readonly DevExhibitRow[] =
  INSTITUTION_BUILDING_ARCHETYPES.map((archetype) => ({
    row: `inst_${archetype}`,
    cells: Array.from({ length: INSTITUTION_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = institutionFacadeDefaults(archetype);
      const floors = column < Math.ceil(INSTITUTION_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_in${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: institutionSizeFor(archetype, column),
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
