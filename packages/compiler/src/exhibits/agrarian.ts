/**
 * Dev-world exhibit rows for the **agrarian burn-down** — one review walk,
 * nine working buildings (battery P2's farm-town fabric).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged. The sizes are the
 * implementing wave's own verified envelopes, treated as load-bearing:
 *
 * - the **pen buildings** (pigsty, sheepfold, cattle pen) sit on squat boxes
 *   because the enclosure ring in the apron is the read, not the hut;
 * - the **orchard** and **vineyard** want apron length for their rows;
 * - the **threshing floor** is wide because the swept floor is the point;
 * - the **marketplace** needs its arcade's headroom (`wallTop ≥ 6`).
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { AGRARIAN_BUILDING_ARCHETYPES, agrarianFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per agrarian row. */
export const AGRARIAN_ROW_LENGTH = 4;

/** Footprint for an agrarian archetype at gradient position `column`. */
export function agrarianSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "farmstead":
      return [13 + (grow % 2), 18, 15 + grow];
    case "pigsty":
    case "sheepfold":
    case "cattle_pen":
      return [11 + grow, 14, 13 + grow];
    case "orchard":
    case "vineyard":
      return [13 + (grow % 2), 18, 15 + grow * 2];
    case "terraced_field":
      return [13 + grow, 14, 15 + grow];
    case "threshing_floor":
      return [15 + grow, 16, 15 + (grow % 2)];
    case "marketplace":
    default:
      return [15 + grow, 16, 17 + grow];
  }
}

/** Working buildings are single-storey; the farmhouse shows its upper range. */
function agrarianFloors(archetype: string, column: number): number {
  if (archetype === "farmstead") {
    return column >= Math.ceil(AGRARIAN_ROW_LENGTH / 2) ? 2 : 1;
  }
  return 1;
}

/** The building rows: one per agrarian archetype, four cells each. */
export const AGRARIAN_EXHIBIT_ROWS: readonly DevExhibitRow[] = AGRARIAN_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `agr_${archetype}`,
    cells: Array.from({ length: AGRARIAN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = agrarianFacadeDefaults(archetype);
      const floors = agrarianFloors(archetype, column);
      return {
        id: `${archetype}_agr${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: agrarianSizeFor(archetype, column),
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
