/**
 * Dev-world exhibit rows for archetype wave five A — the garrison.
 *
 * The argument is `exhibits/wave2.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a castle at nine by seven is a shed with merlons.
 * These rows are the fix: each cell carries the archetype's own facade
 * tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `gar_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { GARRISON_BUILDING_ARCHETYPES, garrisonFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per garrison row. */
export const GARRISON_ROW_LENGTH = 4;

/**
 * Footprint for a garrison archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter most:
 *
 * - the **castle** is the biggest envelope in the wave, because a great hall
 *   with a long board needs nine interior columns and seven of depth;
 * - the **beacon_tower** is narrow and tall — a tower with a fire on top;
 * - the **pillbox** and the **guard_post** stay small at every column, because
 *   the discipline is the archetype;
 * - the **armory** and the **arsenal** are deep, so the rack walls have a run
 *   of bays to repeat down.
 */
export function garrisonSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "castle":
      return [15 + grow, 17 + grow, 17 + grow];
    case "barbican":
      return [13 + grow, 15 + grow, 11 + grow];
    case "bastion":
      return [13 + grow, 14 + grow, 13 + grow];
    case "armory":
      return [11 + grow, 12 + grow, 17 + grow];
    case "arsenal":
      return [13 + grow, 13 + grow, 19 + grow];
    case "bunker":
      return [13 + grow, 10, 13 + grow];
    case "pillbox":
      return [9 + (grow % 2), 9, 9 + (grow % 2)];
    case "guard_post":
      return [9 + (grow % 2), 11, 9 + (grow % 2)];
    case "checkpoint":
      return [11 + grow, 11, 11 + grow];
    case "beacon_tower":
      return [9 + (grow % 2), 18 + grow, 9 + (grow % 2)];
    case "gravedigger_hut":
      return [9 + (grow % 2), 11, 11 + grow];
    case "shepherds_bothy":
    default:
      return [9 + (grow % 2), 11, 9 + (grow % 2)];
  }
}

/**
 * The building rows: one per garrison archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version
 * — except the outposts, which are single-storey by definition.
 */
export const GARRISON_EXHIBIT_ROWS: readonly DevExhibitRow[] = GARRISON_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `gar_${archetype}`,
    cells: Array.from({ length: GARRISON_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = garrisonFacadeDefaults(archetype);
      const single =
        archetype === "pillbox" ||
        archetype === "guard_post" ||
        archetype === "checkpoint" ||
        archetype === "gravedigger_hut" ||
        archetype === "shepherds_bothy" ||
        archetype === "bunker";
      const floors = single || column < Math.ceil(GARRISON_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_g5${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: garrisonSizeFor(archetype, column),
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
