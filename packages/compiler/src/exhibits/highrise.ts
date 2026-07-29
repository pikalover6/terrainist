/**
 * Dev-world exhibit rows for the tall archetypes.
 *
 * The base grid gives every archetype a row on its own size gradient, which for
 * a skyscraper means a seven-wide, two-storey box: correct as a regression
 * fixture (the tall emitter must not fall over on a footprint that small) and
 * useless as a look at the building. These rows are the look at the building —
 * a height gradient in the palette the grammar was designed for, so a reader
 * scanning east watches the same tower grow from six storeys to fifteen and can
 * see whether the curtain-wall rhythm, the parapet and the plant room still
 * hold together at the top of the range.
 *
 * One row per archetype, because the four differ in exactly the thing a row
 * cannot show: an office is an open plate, a hotel is a corridor and bays, an
 * apartment block is the same massing wearing balconies.
 *
 * **Seam file.** `devworld.ts` is shared ground and stays closed; registering
 * this is one import and one spread in `devworld-rows.ts`.
 */

import { HIGHRISE_ARCHETYPES, MODERN_CITY_THEME_ID, type BuildingArchetype } from "@terrainist/stdlib";

import type { DevExhibitCell, DevExhibitRow } from "./types.js";

/** Cells per tall-archetype row. */
export const HIGHRISE_ROW_LENGTH = 4;

/** Storey height the tall grammar builds at, restated for the size sums. */
export const HIGHRISE_EXHIBIT_STOREY = 4;

/**
 * The storey gradient, per archetype.
 *
 * Deliberately short of each archetype's cap. The cap is a *limit* and the
 * limit is exercised by the unit tests; a dev world that built four
 * twenty-storey towers would spend most of its region file on the two that
 * nobody walks up.
 */
export const HIGHRISE_FLOOR_GRADIENT: Readonly<Record<string, readonly number[]>> = Object.freeze({
  skyscraper: [6, 9, 12, 15],
  office: [4, 6, 8, 10],
  hotel: [3, 5, 7, 9],
  apartment_block: [3, 5, 7, 9],
});

/**
 * Footprint for a tall archetype at gradient position `column`.
 *
 * A hotel is the widest of the four because its plate has to carry a core, a
 * corridor **and** a room bay east of both; below about seventeen there is no
 * room left to put a bed in and the fit-out quietly does nothing.
 */
export function highriseSizeFor(archetype: string, column: number): [number, number, number] {
  const floors = (HIGHRISE_FLOOR_GRADIENT[archetype] ?? [4, 6, 8, 10])[column] ?? 6;
  // Y is advisory for the tall grammar — it builds to its storey count — but a
  // reader comparing the row against the envelope should see them agree.
  const height = floors * HIGHRISE_EXHIBIT_STOREY + 8;
  switch (archetype) {
    case "hotel":
      return [17 + column, height, 19 + column];
    case "apartment_block":
      return [15 + column, height, 17 + column];
    case "office":
      return [15 + column, height, 15 + column];
    case "skyscraper":
    default:
      return [17 + column * 2, height, 17 + column * 2];
  }
}

/**
 * The rows: one per tall archetype, four cells each, all in `modern_city`.
 *
 * The theme is pinned rather than cycled. Every other row in the grid varies
 * the palette because the palette is the variable under test there; here the
 * variable is height, and a concrete tower rendered in oak planks would be a
 * comparison of two unrelated things.
 */
export const HIGHRISE_EXHIBIT_ROWS: readonly DevExhibitRow[] = HIGHRISE_ARCHETYPES.map(
  (archetype) => ({
    row: `highrise_${archetype}`,
    cells: Array.from({ length: HIGHRISE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const floors = (HIGHRISE_FLOOR_GRADIENT[archetype] ?? [4, 6, 8, 10])[column] ?? 6;
      return {
        id: `highrise_${archetype}_x${column}`,
        archetype: archetype as BuildingArchetype,
        theme: MODERN_CITY_THEME_ID,
        roof: "flat",
        floors,
        size: highriseSizeFor(archetype, column),
        params: { floorHeight: HIGHRISE_EXHIBIT_STOREY },
      };
    }),
  }),
);
