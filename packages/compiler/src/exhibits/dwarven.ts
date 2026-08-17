/**
 * Dev-world exhibit rows for the **dwarven_volcanic pack's buildings** — one
 * review walk, fifteen of them. The pack ships **no props at all**, so there is
 * no companion prop-grid row to check against: every archetype it owns has an
 * inside, and every one of them is here.
 *
 * The argument is `exhibits/norse.ts`'s, unchanged: one row per archetype, four
 * cells of gradient, sizes picked to give each fit-out the envelope its own doc
 * comment describes (the forge and the deep hall long, so the furnace pit and
 * the aisle have an axis to run down; the brazier tower narrow and tall).
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { DWARVEN_BUILDING_ARCHETYPES, dwarvenFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per dwarven row. */
export const DWARVEN_ROW_LENGTH = 4;

/** Footprint for a dwarven archetype at gradient position `column`. */
export function dwarvenSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The long halls: the furnace pit and the aisle run the axis, so length
    // grows and width stays where the fit-out wants it.
    case "great_forge":
    case "deep_hall":
      return [13 + (grow % 2), 11, 21 + 2 * grow];
    case "smelter_works":
    case "ore_assay_hall":
      return [11 + (grow % 2), 10, 17 + 2 * grow];
    // Narrow and tall — the beacon is read from below, off the storeys.
    case "beacon_brazier_tower":
      return [7 + (grow % 2), 13 + 2 * grow, 7 + (grow % 2)];
    // The gate: wide across the way, shallow through it.
    case "dwarf_hold_gate":
      return [15 + 2 * grow, 11, 9 + (grow % 2)];
    // The treasury grilles at floor and eye height want a tall-ish box.
    case "kings_treasury":
      return [11 + (grow % 2), 10 + grow, 13 + grow];
    // The dormitory stacks; the bath house and the shrines are one room.
    case "miners_dormitory":
      return [11 + grow, 9, 15 + grow];
    case "cart_depot":
      return [11 + grow, 9, 15 + 2 * grow];
    case "gem_cutter_workshop":
    case "stone_brewhouse":
    case "tool_vault":
    case "rune_forge_shrine":
    case "stone_bath_house":
    case "stalactite_shrine":
    default:
      return [9 + grow, 9, 11 + grow];
  }
}

/** Floors: single-storey everywhere but the tower and the dormitory. */
function dwarvenFloors(archetype: string, column: number): number {
  if (archetype === "beacon_brazier_tower") return 2 + (column % 2);
  if (archetype === "miners_dormitory") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per dwarven archetype, four cells each. */
export const DWARVEN_EXHIBIT_ROWS: readonly DevExhibitRow[] = DWARVEN_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `dwar_${archetype}`,
    cells: Array.from({ length: DWARVEN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = dwarvenFacadeDefaults(archetype);
      const floors = dwarvenFloors(archetype, column);
      return {
        id: `${archetype}_dwar${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "flat",
        floors,
        size: dwarvenSizeFor(archetype, column),
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
