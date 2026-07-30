/**
 * Dev-world exhibit rows for the **town wave**.
 *
 * The argument is `exhibits/blitz.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so a town hall appears in
 * the grid without a line of this file — but it appears at the *cottage
 * gradient*, on a cottage's footprint with a cottage's windows, and a town hall
 * with no room over its eave has no clock gable at all. These rows are the fix:
 * each cell carries the archetype's own facade tendencies and a footprint that
 * suits what it is.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread, which is a
 * conflict a merge can resolve.
 */

import { TOWN_BUILDING_ARCHETYPES, townFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per town-archetype row. */
export const TOWN_ROW_LENGTH = 4;

/**
 * Footprint for a town archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is:
 *
 * - the **town hall** is broad and tall, because the clock gable is drawn from
 *   the room between the eave plate and the shell roof's top, and a squat
 *   envelope refuses one outright;
 * - the **school** is long, because desks in rows need length to be rows;
 * - the **bathhouse** is squarer and lower, because the pool is inset one cell
 *   from the interior on every side and a narrow room has no bath left in it.
 */
export function townSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "town_hall":
      return [13 + grow, 16 + grow, 13 + grow];
    case "school":
      return [11 + grow, 12, 15 + grow * 2];
    case "bathhouse":
    default:
      return [13 + grow, 11, 13 + grow];
  }
}

/**
 * The building rows: one per town archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const TOWN_EXHIBIT_ROWS: readonly DevExhibitRow[] = TOWN_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    // Prefixed, like the high-rise rows: `devworld.ts` already lays a base row
    // named after every archetype, and two rows sharing a label are one row
    // with two gradients in it.
    row: `town_${archetype}`,
    cells: Array.from({ length: TOWN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = townFacadeDefaults(archetype);
      const floors = column < Math.ceil(TOWN_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_t${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: townSizeFor(archetype, column),
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
