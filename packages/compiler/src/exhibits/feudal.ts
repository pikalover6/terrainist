/**
 * Dev-world exhibit rows for the **feudal_japanese pack's buildings** — one
 * review walk, thirteen of them. The pack's three props (the stone lantern, the
 * koi pond and the banner line) already ride the prop grid's `feudal_garden`
 * row at three yaws each; verified, not duplicated here.
 *
 * The argument is `exhibits/himalayan.ts`'s, unchanged: one row per archetype,
 * four cells of gradient, sizes picked to give each fit-out the envelope its own
 * doc comment describes — the pagoda **square**, because its tiers step in as
 * filled discs and an oblong reads as a mistake; the keep, the shop row and the
 * dojo long, because the pillar rows, the shopfronts and the mats run their
 * axis; the two gates wide across the way and shallow through it **and tall**,
 * because an arch is only built on a storey with four courses of headroom and a
 * row that never reached it would never exercise the branch the Himalayan
 * gatehouse cost the terrarium five `traversal.unreachable` findings in; the
 * turret narrow and **tall**, because the hang only happens on a storey with
 * five courses of headroom and a row that never reached it would never exercise
 * the branch the Atlantean pack found its bell defect in.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { FEUDAL_BUILDING_ARCHETYPES, feudalFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per feudal row. */
export const FEUDAL_ROW_LENGTH = 4;

/** Footprint for a feudal archetype at gradient position `column`. */
export function feudalSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The pagoda: SQUARE, always — the tiers are discs, width must equal depth.
    case "gojunoto_pagoda":
      return [13 + 2 * grow, 15, 13 + 2 * grow];
    // The long rooms: the audience hall, the shopfronts and the mats run the
    // axis.
    case "yamashiro_tenshu":
      return [15 + (grow % 2), 12, 25 + 2 * grow];
    case "machiya_shop_row":
      return [11 + (grow % 2), 10, 23 + 2 * grow];
    case "dojo_hall":
      return [13 + (grow % 2), 11, 21 + 2 * grow];
    case "noh_stage":
      return [15 + 2 * grow, 11, 17 + 2 * grow];
    case "onsen_bathhouse":
      return [13 + (grow % 2), 10, 15 + 2 * grow];
    case "kura_storehouse":
    case "kaji_forge":
      return [11 + (grow % 2), 10, 15 + 2 * grow];
    // Broad ground: a dry garden is read across.
    case "karesansui_court":
      return [15 + 2 * grow, 10, 15 + 2 * grow];
    // The tea room: the smallest room in the pack, and it stays small.
    case "chashitsu_teahouse":
      return [7 + (grow % 2), 8, 9 + (grow % 2)];
    // The gates: wide across the way, shallow through it, and TALL — an arch is
    // only built where the storey gives four courses of headroom, and an
    // exhibit that never reached that height would never walk the branch.
    case "sando_torii":
    case "masugata_gate":
      return [15 + 2 * grow, 13, 11 + (grow % 2)];
    // Narrow and TALL — the bell only hangs where the storey gives it five
    // courses.
    case "yagura_watchtower":
      return [7 + (grow % 2), 15 + 2 * grow, 7 + (grow % 2)];
    default:
      return [11 + grow, 10, 13 + grow];
  }
}

/** Floors: single-storey everywhere but the turret and the store. */
function feudalFloors(archetype: string, column: number): number {
  if (archetype === "yagura_watchtower") return 2 + (column % 2);
  if (archetype === "kura_storehouse") return 1 + (column % 2);
  return 1;
}

/** The building rows: one per feudal archetype, four cells each. */
export const FEUDAL_EXHIBIT_ROWS: readonly DevExhibitRow[] = FEUDAL_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `feud_${archetype}`,
    cells: Array.from({ length: FEUDAL_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = feudalFacadeDefaults(archetype);
      const floors = feudalFloors(archetype, column);
      return {
        id: `${archetype}_feud${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: feudalSizeFor(archetype, column),
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
