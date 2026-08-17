/**
 * Dev-world exhibit rows for the **mesoamerican_jungle pack's buildings** —
 * one review walk, fifteen of them. The pack ships no props, so this file is
 * the whole of its dev-world coverage.
 *
 * The argument is `exhibits/nile.ts`'s, unchanged: one row per archetype, four
 * cells of gradient, sizes picked so each fit-out gets the envelope its doc
 * comment describes (the pyramids and platforms broad and square, the ball
 * court long, the ramada and the dwelling small).
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import {
  MESOAMERICAN_BUILDING_ARCHETYPES,
  mesoamericanFacadeDefaults,
} from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per mesoamerican row. */
export const MESOAMERICAN_ROW_LENGTH = 4;

/** Footprint for a mesoamerican archetype at gradient position `column`. */
export function mesoamericanSizeFor(
  archetype: string,
  column: number,
): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The monuments: square and broad, the tiers above the plate the read.
    case "step_pyramid":
    case "jaguar_temple":
      return [19 + 2 * grow, 16, 19 + 2 * grow];
    case "round_observatory":
      return [13 + (grow % 2), 14 + 2 * grow, 13 + (grow % 2)];
    case "serpent_stair":
      return [13 + (grow % 2), 12 + grow, 19 + 2 * grow];
    // The long ranges and courts.
    case "ball_court":
      return [13 + (grow % 2), 9, 25 + 2 * grow];
    case "palace_range":
      return [13 + grow, 10, 21 + 2 * grow];
    case "market_ramada":
      return [15 + 2 * grow, 8, 13 + (grow % 2)];
    // The plaza furniture and small works.
    case "stela_plaza":
    case "tzompantli_rack":
    case "sacbe_terminus":
    case "milpa_terrace":
      return [13 + grow, 8, 13 + grow];
    case "canoe_landing":
      return [11 + (grow % 2), 8, 15 + 2 * grow];
    // The small rooms.
    case "chultun_cistern":
    case "thatch_dwelling":
    case "temazcal_bath":
    default:
      return [9 + grow, 8, 9 + grow];
  }
}

/** Floors: single-storey but for the palace range, which reads as a terrace. */
function mesoamericanFloors(archetype: string, column: number): number {
  if (archetype === "palace_range") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per mesoamerican archetype, four cells each. */
export const MESOAMERICAN_EXHIBIT_ROWS: readonly DevExhibitRow[] =
  MESOAMERICAN_BUILDING_ARCHETYPES.map((archetype) => ({
    row: `meso_${archetype}`,
    cells: Array.from({ length: MESOAMERICAN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = mesoamericanFacadeDefaults(archetype);
      const floors = mesoamericanFloors(archetype, column);
      return {
        id: `${archetype}_meso${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: mesoamericanSizeFor(archetype, column),
        params: {
          archetype,
          floors,
          ...(facade.roof === undefined ? {} : { roof: facade.roof }),
          ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
          ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
        },
      };
    }),
  }));
