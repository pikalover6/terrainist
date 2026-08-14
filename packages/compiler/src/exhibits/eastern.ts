/**
 * Dev-world exhibit rows for the **east-asian pack's buildings** — one review walk, four of them (torii, garden and lanterns review in the prop grid).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged; sizes are the
 * implementing wave's own recommendations, treated as load-bearing.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { EASTERN_BUILDING_ARCHETYPES, easternFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per eastern row. */
export const EASTERN_ROW_LENGTH = 4;

/** Footprint for a eastern archetype at gradient position `column`. */
export function easternSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "tenshu_keep":
      return column % 2 === 0 ? [19, 14, 19] : [15, 16 + grow, 17];
    case "drum_tower":
      return [13 + (grow % 2), 12 + grow, 21 + (grow % 2)];
    case "bell_pavilion":
      return [11 + (grow % 2), 16, 11 + (grow % 2)];
    case "shoji_teahouse":
    default:
      return [7 + grow, 8 + grow, 7 + grow];
  }
}

/** Single-storey — the tiers above the plate are the read. */
function easternFloors(): number {
  return 1;
}

/** The building rows: one per eastern archetype, four cells each. */
export const EASTERN_EXHIBIT_ROWS: readonly DevExhibitRow[] = EASTERN_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `east_${archetype}`,
    cells: Array.from({ length: EASTERN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = easternFacadeDefaults(archetype);
      const floors = easternFloors();
      return {
        id: `${archetype}_east${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: easternSizeFor(archetype, column),
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
