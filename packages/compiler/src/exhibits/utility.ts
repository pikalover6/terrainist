/**
 * Dev-world exhibit rows for wave 6C — waterworks and energy.
 *
 * The argument is `exhibits/industry.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, with a cottage's footprint and a cottage's windows, and a
 * water tower at nine by seven under a cottage gable is a shed. These rows are
 * the fix: each cell carries the archetype's own facade tendencies and a
 * footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`. A row here called `cistern` would therefore be the
 * second row of that name, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `util_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread, which is a
 * conflict a merge can resolve.
 */

import { UTILITY_BUILDING_ARCHETYPES, utilityFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per utility row. */
export const UTILITY_ROW_LENGTH = 4;

/**
 * Footprint for a utility archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The **water tower** is the tall one:
 * its tank is rebuilt above the eave plate, so it needs envelope Y or the roof
 * plan refuses and you get a shed with cauldrons in it. The **cistern** is the
 * wide one, because its pool is the interior inset one cell all round and a
 * narrow cistern is a puddle. The sheds are read down their length — intake at
 * the door end, plant up the walls — so they are deep.
 */
export function utilitySizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "water_tower":
      return [13 + grow, 21 + grow, 13 + grow];
    case "cistern":
      return [15 + grow, 12 + grow, 17 + grow];
    case "well":
      return [11 + grow, 12 + grow, 13 + grow];
    case "pumping_station":
      return [13 + grow, 13 + grow, 17 + grow];
    case "substation":
      return [15 + grow, 12 + grow, 15 + grow];
    case "gasworks":
      return [15 + grow, 15 + grow, 15 + grow];
    case "steam_plant":
      return [13 + grow, 14 + grow, 19 + grow];
    case "biomass_shed":
      return [13 + grow, 12 + grow, 17 + grow];
    case "battery_shed":
      return [13 + grow, 12 + grow, 15 + grow];
    case "coal_tipple":
    default:
      return [13 + grow, 14 + grow, 17 + grow];
  }
}

/**
 * The building rows: one per utility archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const UTILITY_EXHIBIT_ROWS: readonly DevExhibitRow[] = UTILITY_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `util_${archetype}`,
    cells: Array.from({ length: UTILITY_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = utilityFacadeDefaults(archetype);
      const floors = column < Math.ceil(UTILITY_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w6c${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: utilitySizeFor(archetype, column),
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
