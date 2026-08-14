/**
 * Dev-world exhibit rows for the **wilds pack's buildings** — one review walk,
 * three buildings (the camps and clearings review in the prop grid's wilds
 * rows).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged. Sizes are the
 * implementing wave's own recommendations: the fire lookout's storeys ARE the
 * read (the tower is its legs), so its gradient climbs floors rather than
 * plan.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { WILDS_BUILDING_ARCHETYPES, wildsFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per wilds row. */
export const WILDS_ROW_LENGTH = 4;

/** Footprint for a wilds archetype at gradient position `column`. */
export function wildsSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "fire_lookout_tower":
      return [11 + (grow % 2), 16 + grow, 11 + (grow % 2)];
    case "waystation":
      return [9 + (grow % 2), 11, 9 + grow];
    case "hunting_lodge":
    default:
      return [15 + (grow % 2), 13, 17 + grow];
  }
}

/** The lookout climbs; the lodge and waystation stay grounded. */
function wildsFloors(archetype: string, column: number): number {
  if (archetype === "fire_lookout_tower") {
    return column >= Math.ceil(WILDS_ROW_LENGTH / 2) ? 3 : 2;
  }
  return 1;
}

/** The building rows: one per wilds archetype, four cells each. */
export const WILDS_EXHIBIT_ROWS: readonly DevExhibitRow[] = WILDS_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `wild_${archetype}`,
    cells: Array.from({ length: WILDS_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = wildsFacadeDefaults(archetype);
      const floors = wildsFloors(archetype, column);
      return {
        id: `${archetype}_wild${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: wildsSizeFor(archetype, column),
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
