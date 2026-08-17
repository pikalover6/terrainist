/**
 * Dev-world exhibit rows for the **atlantean pack's buildings** — one review
 * walk, thirteen of them. The pack's two props (the leviathan altar and the
 * bronze colossus fragment) already ride the prop grid's `atlantean_ground` row
 * at three yaws each; verified, not duplicated here.
 *
 * The argument is `exhibits/norse.ts`'s, unchanged: one row per archetype, four
 * cells of gradient, sizes picked to give each fit-out the envelope its own doc
 * comment describes — the oracle rotunda **square**, because its dome steps in
 * as filled discs and an oblong reads as a mistake; the palace and the archive
 * long, because the colonnade and the book ranks run their axis; the
 * amphitheatre broad, because the bank curves in at the corners and needs the
 * width to read as a spiral; the bell tower narrow and tall.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { ATLANTEAN_BUILDING_ARCHETYPES, atlanteanFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per atlantean row. */
export const ATLANTEAN_ROW_LENGTH = 4;

/** Footprint for an atlantean archetype at gradient position `column`. */
export function atlanteanSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The rotunda: SQUARE, always — the dome is discs, width must equal depth.
    case "sea_oracle_rotunda":
      return [13 + 2 * grow, 12, 13 + 2 * grow];
    // The moon pool's light well stands four-square round its pool.
    case "moon_pool_shrine":
      return [11 + 2 * grow, 10, 11 + 2 * grow];
    // The long halls: the colonnade, the dive lines and the book ranks run the
    // axis, so length grows and width stays where the fit-out wants it.
    case "tidal_palace":
      return [15 + (grow % 2), 13, 25 + 2 * grow];
    case "trident_temple":
      return [13 + (grow % 2), 12, 21 + 2 * grow];
    case "pearl_diver_hall":
    case "drowned_archive":
      return [11 + (grow % 2), 10, 19 + 2 * grow];
    case "hippocamp_stable":
      return [11 + (grow % 2), 9, 19 + 2 * grow];
    case "navigator_academy":
      return [11 + (grow % 2), 10, 17 + 2 * grow];
    // Broad grounds: the bank and the planted court are read across.
    case "conch_amphitheater":
      return [19 + 2 * grow, 9, 17 + 2 * grow];
    case "coral_garden_court":
      return [15 + 2 * grow, 8, 15 + 2 * grow];
    // The gate: wide across the way, shallow through it, and tall for the arch.
    case "tide_gate_arch":
      return [15 + 2 * grow, 13, 9 + (grow % 2)];
    // Narrow and tall — the bell is read from below, off the storeys.
    case "tide_bell_tower":
      return [7 + (grow % 2), 14 + 2 * grow, 7 + (grow % 2)];
    case "salt_bath_terme":
    default:
      return [11 + grow, 9, 13 + grow];
  }
}

/** Floors: single-storey everywhere but the bell tower and the academy. */
function atlanteanFloors(archetype: string, column: number): number {
  if (archetype === "tide_bell_tower") return 2 + (column % 2);
  if (archetype === "navigator_academy") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per atlantean archetype, four cells each. */
export const ATLANTEAN_EXHIBIT_ROWS: readonly DevExhibitRow[] = ATLANTEAN_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `atl_${archetype}`,
    cells: Array.from({ length: ATLANTEAN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = atlanteanFacadeDefaults(archetype);
      const floors = atlanteanFloors(archetype, column);
      return {
        id: `${archetype}_atl${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "flat",
        floors,
        size: atlanteanSizeFor(archetype, column),
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
