/**
 * Dev-world exhibit rows for the **arcane pack's buildings** — one review
 * walk, five buildings (the props, including the dragon skeleton, review in
 * the prop grid's arcane rows).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged. Sizes are the
 * implementing wave's own recommendations, treated as load-bearing:
 *
 * - the **academy** wants the fat plan (a 5×5 turret needs ≥11×11) and its
 *   small cell shows the clean degradation;
 * - the **summoning hall** is single-storey everywhere: the gallery only
 *   builds at `floors: 1` with a tall wall;
 * - the **pegasus stable** keeps its long axis so the landing ledge reads.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { ARCANE_BUILDING_ARCHETYPES, arcaneFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per arcane row. */
export const ARCANE_PACK_ROW_LENGTH = 4;

/** Footprint for an arcane archetype at gradient position `column`. */
export function arcanePackSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // Small first: the last cell is the full fat-turret plan.
    case "arcane_academy":
      return [7 + grow * 4, 8 + grow * 3, 7 + grow * 4];
    case "summoning_hall":
      return [15 + grow, 16, 15 + grow];
    case "arcane_library":
      return [15 + (grow % 2), 14, 17 + grow];
    case "blossom_shrine":
      return [11 + (grow % 2), 12 + grow, 11 + (grow % 2)];
    case "pegasus_stable":
    default:
      return [15 + (grow % 2), 12, 19 + grow];
  }
}

/** Single-storey throughout — the summoning gallery demands it. */
function arcanePackFloors(): number {
  return 1;
}

/** The building rows: one per arcane archetype, four cells each. */
export const ARCANE_PACK_EXHIBIT_ROWS: readonly DevExhibitRow[] = ARCANE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `arcp_${archetype}`,
    cells: Array.from({ length: ARCANE_PACK_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = arcaneFacadeDefaults(archetype);
      const floors = arcanePackFloors();
      return {
        id: `${archetype}_arcp${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: arcanePackSizeFor(archetype, column),
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
