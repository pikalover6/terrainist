/**
 * Dev-world exhibit rows for the wave-three regional houses.
 *
 * The argument is `exhibits/wave2.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, with a cottage's footprint and a cottage's windows, and
 * an igloo at nine by seven under a gable is not an igloo. These rows are the
 * fix: each cell carries the archetype's own facade tendencies and a footprint
 * that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `reg_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { REGIONAL_BUILDING_ARCHETYPES, regionalFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per regional row. */
export const REGIONAL_ROW_LENGTH = 4;

/**
 * Footprint for a regional archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter most:
 *
 * - the **igloo** and the **thatched roundhouse** are small and *tall*,
 *   because both roofs are corbelled out of the room between the eave plate
 *   and the shell roof's top, and a short envelope closes itself in two
 *   courses;
 * - the **machiya** is narrow and deep, which is what a townhouse taxed on
 *   its frontage is;
 * - the **riad** is square and generous, because the basin needs an interior
 *   with a walkway all the way round it;
 * - the **fachwerk barn** is the widest thing here, because a barn is.
 */
export function regionalSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "hanok":
      return [13 + grow, 15 + grow, 11 + grow];
    case "machiya":
      return [9 + (grow % 2), 13 + grow, 17 + grow * 2];
    case "riad":
      return [13 + grow, 12 + grow, 13 + grow];
    case "cycladic_house":
      return [11 + grow, 12 + grow, 11 + grow];
    case "adobe_pueblo":
      return [13 + grow, 12 + grow, 11 + grow];
    case "stilt_house":
      return [11 + grow, 12 + grow, 11 + grow];
    case "sod_house":
      return [9 + grow, 13 + grow, 9 + grow];
    case "igloo":
      return [9 + (grow % 2), 16 + grow * 2, 9 + (grow % 2)];
    case "thatched_roundhouse":
      return [9 + (grow % 2), 16 + grow * 2, 9 + (grow % 2)];
    case "colonial_veranda_house":
      return [13 + grow, 14 + grow, 13 + grow];
    case "hacienda":
      return [15 + grow, 13 + grow, 13 + grow];
    case "fachwerk_barn":
    default:
      return [15 + grow, 15 + grow, 19 + grow];
  }
}

/**
 * The building rows: one per regional archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const REGIONAL_EXHIBIT_ROWS: readonly DevExhibitRow[] = REGIONAL_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `reg_${archetype}`,
    cells: Array.from({ length: REGIONAL_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = regionalFacadeDefaults(archetype);
      const floors = column < Math.ceil(REGIONAL_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w3${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: regionalSizeFor(archetype, column),
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
