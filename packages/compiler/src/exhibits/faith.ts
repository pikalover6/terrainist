/**
 * Dev-world exhibit rows for the wave-4B faith and memorial buildings.
 *
 * The argument is `exhibits/regional.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a minaret at thirteen by eleven under a gable is not
 * a minaret. These rows are the fix: each cell carries the archetype's own
 * facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `faith_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { FAITH_BUILDING_ARCHETYPES, faithFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per faith row. */
export const FAITH_ROW_LENGTH = 4;

/**
 * Footprint for a faith archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter most:
 *
 * - the **cathedral** and the **abbey** are long in z, because a nave is: the
 *   pews, the crossing band and the altar all want bays to fall into;
 * - the **bell tower** and the **minaret** are small and *tall*, the wizard
 *   tower's proportions — the minaret's cone is corbelled out of the room
 *   between the eave plate and the roof top, and a short envelope closes
 *   itself in two courses;
 * - the **stupa** and the **ziggurat** are square and tall for the same
 *   reason: a dome that runs out of height is a lid;
 * - the **cloister** is square and generous, because the garth needs an open
 *   middle with a walk all the way round it;
 * - the **hermitage** is the smallest thing here, because a hermit's cell is.
 */
export function faithSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "cathedral":
      return [15 + grow, 17 + grow, 21 + grow * 2];
    case "monastery":
      return [13 + grow, 13 + grow, 19 + grow];
    case "abbey":
      return [13 + grow, 15 + grow, 19 + grow];
    case "cloister":
      return [15 + grow, 12 + grow, 15 + grow];
    case "hermitage":
      return [9 + (grow % 2), 10 + grow, 9 + (grow % 2)];
    case "mosque":
      return [15 + grow, 14 + grow, 15 + grow];
    case "synagogue":
      return [13 + grow, 13 + grow, 15 + grow];
    case "stupa":
      return [13 + grow, 17 + grow * 2, 13 + grow];
    case "ziggurat":
      return [15 + grow, 16 + grow * 2, 15 + grow];
    case "bell_tower":
      return [9 + (grow % 2), 18 + grow * 2, 9 + (grow % 2)];
    case "minaret":
      return [7 + (grow % 2), 20 + grow * 2, 7 + (grow % 2)];
    case "tomb":
    default:
      return [9 + grow, 9 + grow, 11 + grow];
  }
}

/**
 * The building rows: one per faith archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const FAITH_EXHIBIT_ROWS: readonly DevExhibitRow[] = FAITH_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `faith_${archetype}`,
    cells: Array.from({ length: FAITH_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = faithFacadeDefaults(archetype);
      const floors = column < Math.ceil(FAITH_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w4b${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: faithSizeFor(archetype, column),
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
