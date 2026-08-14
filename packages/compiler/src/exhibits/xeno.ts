/**
 * Dev-world exhibit rows for the **alien pack's buildings** — one review walk,
 * three grown things (the pack's props review in the prop grid; the response
 * hardware has its own compound row there).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged. The sizes are the
 * implementing wave's own recommendations, treated as load-bearing:
 *
 * - the **spire** shows at two envelopes because the top-down taper is the
 *   form — a narrow plan must degrade to a slimmer stalk, not to a stump —
 *   and at four *positions* because the curl's starting quadrant is hashed
 *   off the envelope: four cells is four different twists;
 * - the **hive mound** carries one 2-floor cell deliberately: it proves the
 *   spare-face fallback when the stair claims a flank a tunnel mouth wanted;
 * - the **hydroponics bay** is long because the rack rows and the far-end
 *   tank are the read.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { XENO_BUILDING_ARCHETYPES, xenoFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per xeno row. */
export const XENO_ROW_LENGTH = 4;

/** Footprint for a xeno archetype at gradient position `column`. */
export function xenoSizeFor(archetype: string, column: number): [number, number, number] {
  switch (archetype) {
    // Alternate the two recommended envelopes so the taper's degradation and
    // four distinct curls all show in one row.
    case "xeno_spire":
      return column % 2 === 0 ? [15, 16, 17] : [11, 16, 11];
    case "hive_mound":
      return column % 2 === 0 ? [15, 14, 17] : [19, 14, 19];
    case "hydroponics_bay":
    default:
      return [13 + (column % 2), 12 + (column % 2), 21 + column];
  }
}

/** One 2-floor hive cell proves the stair/tunnel-mouth fallback. */
function xenoFloors(archetype: string, column: number): number {
  return archetype === "hive_mound" && column === XENO_ROW_LENGTH - 1 ? 2 : 1;
}

/** The building rows: one per xeno archetype, four cells each. */
export const XENO_EXHIBIT_ROWS: readonly DevExhibitRow[] = XENO_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `xeno_${archetype}`,
    cells: Array.from({ length: XENO_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = xenoFacadeDefaults(archetype);
      const floors = xenoFloors(archetype, column);
      return {
        id: `${archetype}_xeno${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: xenoSizeFor(archetype, column),
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
