/**
 * Dev-world exhibit rows for the **frontier pack's buildings** — one review walk, nine of them (props in the prop grid).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged; sizes are the
 * implementing wave's own recommendations, treated as load-bearing.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { FRONTIER_BUILDING_ARCHETYPES, frontierFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per frontier row. */
export const FRONTIER_ROW_LENGTH = 4;

/** Footprint for a frontier archetype at gradient position `column`. */
export function frontierSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "false_front_saloon":
      return [15 + (grow % 2), 16, 17 + grow];
    case "stamp_mill":
      return [19 + (grow % 2), 18, 21 + grow];
    case "livery_stable":
      return [15 + (grow % 2), 14, 21 + grow];
    case "wagon_shop":
      return [13 + (grow % 2), 13, 15 + grow];
    case "mission_church":
      return [13 + (grow % 2), 16, 19 + grow];
    case "assay_office":
    case "telegraph_office":
    case "cantina":
    case "dugout_shanty":
    default:
      return [11 + grow, 12, 11 + (grow % 2)];
  }
}

/** The saloon shows its upper floor in the back half; the rest stay low. */
function frontierFloors(archetype: string, column: number): number {
  if (archetype === "false_front_saloon") {
    return column >= Math.ceil(FRONTIER_ROW_LENGTH / 2) ? 2 : 1;
  }
  return 1;
}

/** The building rows: one per frontier archetype, four cells each. */
export const FRONTIER_EXHIBIT_ROWS: readonly DevExhibitRow[] = FRONTIER_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `fron_${archetype}`,
    cells: Array.from({ length: FRONTIER_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = frontierFacadeDefaults(archetype);
      const floors = frontierFloors(archetype, column);
      return {
        id: `${archetype}_fron${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: frontierSizeFor(archetype, column),
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
