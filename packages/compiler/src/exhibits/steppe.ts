/**
 * Dev-world exhibit rows for the **steppe_nomad pack's buildings** — one review
 * walk, twelve of them. The pack's three props (the khan's banner pole, the
 * shaman's ovoo and the balbal stone) already ride the prop grid's
 * `steppe_camp` row at two yaws each; verified, not duplicated here.
 *
 * The argument is `exhibits/norse.ts`'s, unchanged: one row per archetype, four
 * cells of gradient, sizes picked to give each fit-out the envelope its own doc
 * comment describes — the gers **square**, because the felt dome steps in as
 * filled discs and an oblong reads as a mistake; the winter corral broad,
 * because it is a bank around ground; the watch platform narrow and tall.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { STEPPE_BUILDING_ARCHETYPES, steppeFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per steppe row. */
export const STEPPE_ROW_LENGTH = 4;

/** Footprint for a steppe archetype at gradient position `column`. */
export function steppeSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The gers: SQUARE, always — the dome is discs, and width must equal depth.
    case "ger_round_tent":
    case "kumis_tent":
      return [9 + 2 * grow, 8, 9 + 2 * grow];
    case "khans_ger":
      return [13 + 2 * grow, 9, 13 + 2 * grow];
    case "cart_ger":
      return [7 + 2 * grow, 7, 7 + 2 * grow];
    // Broad grounds: the fit-out is a bank around bare earth.
    case "winter_corral":
      return [17 + 2 * grow, 6, 15 + 2 * grow];
    case "wrestling_ground":
      return [15 + 2 * grow, 7, 13 + 2 * grow];
    // Long lines: the horse line and the caravan run their axis.
    case "horse_line":
    case "caravan_rest":
      return [9 + (grow % 2), 8, 17 + 2 * grow];
    case "borts_rack":
      return [7 + (grow % 2), 7, 13 + 2 * grow];
    // Narrow and tall — the platform is read off its storeys.
    case "watch_platform_steppe":
      return [7 + (grow % 2), 12 + 2 * grow, 7 + (grow % 2)];
    case "felt_workshop":
    case "bowyer_tent":
    default:
      return [9 + grow, 8, 11 + grow];
  }
}

/** Floors: single-storey everywhere but the watch platform. */
function steppeFloors(archetype: string, column: number): number {
  if (archetype === "watch_platform_steppe") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per steppe archetype, four cells each. */
export const STEPPE_EXHIBIT_ROWS: readonly DevExhibitRow[] = STEPPE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `step_${archetype}`,
    cells: Array.from({ length: STEPPE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = steppeFacadeDefaults(archetype);
      const floors = steppeFloors(archetype, column);
      return {
        id: `${archetype}_step${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: steppeSizeFor(archetype, column),
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
