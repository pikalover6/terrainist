/**
 * Dev-world exhibit rows for the **desert_caravanserai pack's buildings** — one
 * review walk, thirteen of them. The pack's two props (the date palm grove and
 * the caravan pack stack) already ride the prop grid's `caravan_ground` row at
 * three yaws each; verified, not duplicated here.
 *
 * The argument is `exhibits/norse.ts`'s, unchanged: one row per archetype, four
 * cells of gradient, sizes picked to give each fit-out the envelope its own doc
 * comment describes — the shrine **square**, because its dome steps in as
 * filled discs and an oblong reads as a mistake; the court, the godown and the
 * arcade long, because the colonnade, the sack ranks and the stall row run
 * their axis; the gatehouse wide across the way and shallow through it; the
 * minaret narrow and tall.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { CARAVAN_BUILDING_ARCHETYPES, caravanFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per caravan row. */
export const CARAVAN_ROW_LENGTH = 4;

/** Footprint for a caravan archetype at gradient position `column`. */
export function caravanSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The shrine: SQUARE, always — the dome is discs, width must equal depth.
    case "oasis_shrine":
      return [13 + 2 * grow, 12, 13 + 2 * grow];
    // The long rooms: the arcade, the ranks and the channel run the axis, so
    // length grows and width stays where the fit-out wants it.
    case "serai_court":
      return [15 + (grow % 2), 12, 25 + 2 * grow];
    case "shade_arcade_row":
      return [13 + (grow % 2), 10, 21 + 2 * grow];
    case "spice_godown":
    case "date_store_tower":
      return [11 + (grow % 2), 10, 19 + 2 * grow];
    case "camel_lines":
      return [11 + (grow % 2), 9, 19 + 2 * grow];
    case "qanat_wellhead":
      return [11 + (grow % 2), 9, 17 + 2 * grow];
    case "dye_yard":
    case "desert_glass_kiln":
      return [11 + (grow % 2), 10, 15 + 2 * grow];
    // Broad ground: the cistern and the wind house are read across.
    case "serai_cistern":
      return [15 + 2 * grow, 9, 13 + 2 * grow];
    case "windcatcher_house":
      return [13 + 2 * grow, 10, 13 + 2 * grow];
    // The gate: wide across the way, shallow through it, and tall for the arch.
    case "caravan_gatehouse":
      return [15 + 2 * grow, 12, 9 + (grow % 2)];
    // Narrow and tall — the watch is read from below, off the storeys.
    case "watch_minaret":
      return [7 + (grow % 2), 14 + 2 * grow, 7 + (grow % 2)];
    default:
      return [11 + grow, 9, 13 + grow];
  }
}

/** Floors: single-storey everywhere but the minaret and the date store. */
function caravanFloors(archetype: string, column: number): number {
  if (archetype === "watch_minaret") return 2 + (column % 2);
  if (archetype === "date_store_tower") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per caravan archetype, four cells each. */
export const CARAVAN_EXHIBIT_ROWS: readonly DevExhibitRow[] = CARAVAN_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `crvn_${archetype}`,
    cells: Array.from({ length: CARAVAN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = caravanFacadeDefaults(archetype);
      const floors = caravanFloors(archetype, column);
      return {
        id: `${archetype}_crvn${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "flat",
        floors,
        size: caravanSizeFor(archetype, column),
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
