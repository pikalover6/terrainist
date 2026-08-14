/**
 * Dev-world exhibit rows for the **Nile pack's buildings** — one review walk, eight of them (the pyramid, lake and felucca review in the prop grid).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged; sizes are the
 * implementing wave's own recommendations, treated as load-bearing.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { NILE_BUILDING_ARCHETYPES, nileFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per nile row. */
export const NILE_ROW_LENGTH = 4;

/** Footprint for a nile archetype at gradient position `column`. */
export function nileSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "hypostyle_hall":
    case "mortuary_temple":
    case "pylon_gate":
      return [19 + (grow % 2), 18, 19 + grow];
    case "canopic_shrine":
      return [11 + (grow % 2), 12 + grow, 11 + (grow % 2)];
    case "mastaba":
    case "nilometer":
    case "mudbrick_granary":
    default:
      return [17 + (grow % 2), 18, 19 + grow];
  }
}

/** One-room monuments, all of them. */
function nileFloors(): number {
  return 1;
}

/** The building rows: one per nile archetype, four cells each. */
export const NILE_EXHIBIT_ROWS: readonly DevExhibitRow[] = NILE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `nile_${archetype}`,
    cells: Array.from({ length: NILE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = nileFacadeDefaults(archetype);
      const floors = nileFloors();
      return {
        id: `${archetype}_nile${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: nileSizeFor(archetype, column),
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
