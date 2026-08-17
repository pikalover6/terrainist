/**
 * Dev-world exhibit rows for the **nordic_viking pack's buildings** — one
 * review walk, thirteen of them (the rune stone, boat burial and drying racks
 * review in the prop grid's `norse_shore` row).
 *
 * The argument is `exhibits/nile.ts`'s, unchanged: one row per archetype, four
 * cells of gradient, sizes picked to give each fit-out the envelope its own
 * doc comment describes (the halls long, the belfry and the watchtower narrow
 * and tall).
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { NORSE_BUILDING_ARCHETYPES, norseFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per norse row. */
export const NORSE_ROW_LENGTH = 4;

/** Footprint for a norse archetype at gradient position `column`. */
export function norseSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The long halls: the axis is the read, so length grows and width does not.
    case "norse_mead_hall":
    case "jarls_hall":
      return [11 + (grow % 2), 10, 19 + 2 * grow];
    case "longship_shed":
    case "weaving_hall":
      return [9 + (grow % 2), 9, 17 + 2 * grow];
    // Narrow and tall — the tiers above the plate carry them.
    case "stave_belfry":
    case "palisade_watchtower":
      return [7 + (grow % 2), 12 + 2 * grow, 7 + (grow % 2)];
    // The gate room: wide across the way, shallow through it.
    case "shield_wall_gate":
      return [13 + 2 * grow, 9, 9 + (grow % 2)];
    case "hof_shrine":
      return [9 + (grow % 2), 10 + grow, 11 + grow];
    // One-room work and store buildings.
    case "turf_house":
    case "norse_forge":
    case "fishermans_cabin":
    case "norse_storehouse":
    case "wool_shed_norse":
    default:
      return [9 + grow, 8, 11 + grow];
  }
}

/** Floors: single-storey everywhere but the two towers. */
function norseFloors(archetype: string, column: number): number {
  if (archetype === "stave_belfry" || archetype === "palisade_watchtower") {
    return 1 + (column % 2);
  }
  return 1;
}

/** The building rows: one per norse archetype, four cells each. */
export const NORSE_EXHIBIT_ROWS: readonly DevExhibitRow[] = NORSE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `nor_${archetype}`,
    cells: Array.from({ length: NORSE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = norseFacadeDefaults(archetype);
      const floors = norseFloors(archetype, column);
      return {
        id: `${archetype}_nor${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: norseSizeFor(archetype, column),
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
