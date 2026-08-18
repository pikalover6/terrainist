/**
 * Dev-world exhibit rows for the **himalayan_monastery pack's buildings** — one
 * review walk, thirteen of them. The pack's two props (the prayer flag line and
 * the mani stone cairn) already ride the prop grid's `himalayan_ridge` row at
 * three yaws each; verified, not duplicated here.
 *
 * The argument is `exhibits/caravan.ts`'s, unchanged: one row per archetype,
 * four cells of gradient, sizes picked to give each fit-out the envelope its own
 * doc comment describes — the chorten **square**, because its dome steps in as
 * filled discs and an oblong reads as a mistake; the hall, the gallery and the
 * cell row long, because the colonnade, the wheel run and the cells run their
 * axis; the kora gate wide across the way and shallow through it; the bell cote
 * narrow and **tall**, because the hang only happens on a storey with five
 * courses of headroom and a row that never reached it would never exercise the
 * branch the Atlantean pack found its bell defect in.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { HIMALAYAN_BUILDING_ARCHETYPES, himalayanFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per himalayan row. */
export const HIMALAYAN_ROW_LENGTH = 4;

/** Footprint for a himalayan archetype at gradient position `column`. */
export function himalayanSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The chorten: SQUARE, always — the dome is discs, width must equal depth.
    case "chorten_shrine":
      return [13 + 2 * grow, 13, 13 + 2 * grow];
    // The long rooms: the assembly, the wheel run and the cells run the axis.
    case "dzong_hall":
      return [15 + (grow % 2), 12, 25 + 2 * grow];
    case "prayer_wheel_gallery":
      return [13 + (grow % 2), 11, 21 + 2 * grow];
    case "monk_cell_row":
      return [11 + (grow % 2), 10, 21 + 2 * grow];
    case "scripture_library":
    case "stilt_granary":
      return [11 + (grow % 2), 10, 17 + 2 * grow];
    case "yak_byre":
      return [11 + (grow % 2), 9, 19 + 2 * grow];
    case "butter_tea_kitchen":
    case "incense_kiln":
      return [11 + (grow % 2), 10, 15 + 2 * grow];
    // Broad ground: a debating yard is read across.
    case "debate_courtyard":
      return [15 + 2 * grow, 10, 15 + 2 * grow];
    // The retreat: the smallest room in the pack, and it stays small.
    case "hermit_retreat":
      return [7 + (grow % 2), 8, 9 + (grow % 2)];
    // The gate: wide across the way, shallow through it, and tall for the arch.
    case "kora_gatehouse":
      return [15 + 2 * grow, 12, 9 + (grow % 2)];
    // Narrow and TALL — the bell only hangs where the storey gives it five
    // courses, and an exhibit that never reached that height would never walk
    // the branch the hang lives in.
    case "dzong_bell_cote":
      return [7 + (grow % 2), 15 + 2 * grow, 7 + (grow % 2)];
    default:
      return [11 + grow, 10, 13 + grow];
  }
}

/** Floors: single-storey everywhere but the bell cote and the granary. */
function himalayanFloors(archetype: string, column: number): number {
  if (archetype === "dzong_bell_cote") return 2 + (column % 2);
  if (archetype === "stilt_granary") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per himalayan archetype, four cells each. */
export const HIMALAYAN_EXHIBIT_ROWS: readonly DevExhibitRow[] =
  HIMALAYAN_BUILDING_ARCHETYPES.map((archetype) => ({
    row: `hima_${archetype}`,
    cells: Array.from({ length: HIMALAYAN_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = himalayanFacadeDefaults(archetype);
      const floors = himalayanFloors(archetype, column);
      return {
        id: `${archetype}_hima${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "flat",
        floors,
        size: himalayanSizeFor(archetype, column),
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
