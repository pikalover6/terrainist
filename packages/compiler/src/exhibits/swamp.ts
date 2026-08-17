/**
 * Dev-world exhibit rows for the **swamp_witch pack's buildings** — one review
 * walk, twelve of them. The pack's three props (the coven stone circle, the
 * bone charm rack and the waterlogged shrine) already ride the prop grid's
 * `swamp_fen` row at two yaws each; verified, not duplicated here.
 *
 * The argument is `exhibits/norse.ts`'s, unchanged: one row per archetype, four
 * cells of gradient, sizes picked to give each fit-out the envelope its own doc
 * comment describes — the stilt hut **square**, because the ring of posts under
 * the deck plate is read from every side and an oblong reads as a shed on legs;
 * the drying loft and the smokehouse long, because the poles and the racks run
 * an axis; the leech pools broad, because the fit-out is a field of curbed
 * water rather than a room.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { SWAMP_BUILDING_ARCHETYPES, swampFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per swamp row. */
export const SWAMP_ROW_LENGTH = 4;

/** Footprint for a swamp archetype at gradient position `column`. */
export function swampSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The stilt hut: SQUARE, always — the understorey ring of posts is the
    // pack's silhouette argument and it is walked round from all four sides.
    case "witch_stilt_hut":
      return [11 + 2 * grow, 10, 11 + 2 * grow];
    // Long lines: the drying poles, the smoke racks and the root ribs all run
    // the axis, so length grows and width stays where the fit-out wants it.
    case "herb_drying_loft":
    case "eel_smokehouse":
      return [9 + (grow % 2), 9, 17 + 2 * grow];
    case "mangrove_root_cellar":
      return [9 + (grow % 2), 8, 15 + 2 * grow];
    case "fen_landing_stage":
      return [9 + (grow % 2), 8, 15 + 2 * grow];
    // Broad grounds: the leech field and the goat pen are a bank around ground.
    case "leech_pools":
      return [17 + 2 * grow, 7, 15 + 2 * grow];
    case "black_goat_pen":
      return [15 + 2 * grow, 7, 13 + 2 * grow];
    // The chapel ruin: the nave wants an axis and the decay wants height.
    case "fen_chapel_ruin":
      return [11 + (grow % 2), 11 + grow, 17 + 2 * grow];
    // The tent is small and its charms hang high.
    case "fortune_tellers_tent":
      return [9 + grow, 9, 9 + grow];
    case "bog_apothecary":
    case "moss_cottage":
    case "candle_workshop":
    default:
      return [9 + grow, 8, 11 + grow];
  }
}

/** Floors: single-storey everywhere but the loft and the cottage. */
function swampFloors(archetype: string, column: number): number {
  if (archetype === "herb_drying_loft") return 1 + (column % 2);
  if (archetype === "moss_cottage") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per swamp archetype, four cells each. */
export const SWAMP_EXHIBIT_ROWS: readonly DevExhibitRow[] = SWAMP_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `swmp_${archetype}`,
    cells: Array.from({ length: SWAMP_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = swampFacadeDefaults(archetype);
      const floors = swampFloors(archetype, column);
      return {
        id: `${archetype}_swmp${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: swampSizeFor(archetype, column),
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
