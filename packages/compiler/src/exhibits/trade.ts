/**
 * Dev-world exhibit rows for the **trade wave**.
 *
 * The argument is `exhibits/archetypes.ts`'s and `exhibits/blitz.ts`'s,
 * unchanged. `devworld.ts` already builds one row per entry of
 * `BUILDING_ARCHETYPES`, so a tavern appears in the grid without a line of this
 * file — but it appears at the *cottage gradient*, with a cottage's footprint
 * and a cottage's windows, and a general store with sparse single lights is a
 * cottage with a counter in it. These rows are the fix: every cell carries the
 * archetype's own facade tendencies and a footprint that suits what it is.
 *
 * **Seam file.** `devworld-rows.ts` is shared ground; this file only *exports*.
 * Registering it there is one import and one spread, which is a conflict a
 * merge can resolve.
 */

import { TRADE_BUILDING_ARCHETYPES, tradeFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per trade-archetype row. */
export const TRADE_ROW_LENGTH = 4;

/**
 * Footprint for a trade archetype at gradient position `column`.
 *
 * Each is shaped like the trade it houses:
 *
 * - the **tavern** is the widest and the deepest, because the bar runs down
 *   one whole wall and the tables need an aisle either side of them;
 * - the **general store** is long across its shopfront, so the dense mullioned
 *   rhythm has enough bays to read as a window run rather than as a pair;
 * - the **apothecary** is the smallest of the three — a working room, not a
 *   public one — and stays square so the bench, the shelves and the sill of
 *   pots each get a wall.
 */
export function tradeSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "tavern":
      return [13 + grow, 11, 13 + grow];
    case "general_store":
      return [13 + grow * 2, 10, 11 + grow];
    case "apothecary":
    default:
      return [9 + grow, 10, 9 + grow];
  }
}

/**
 * The building rows: one per trade archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const TRADE_EXHIBIT_ROWS: readonly DevExhibitRow[] = TRADE_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    // Prefixed, because the *base* grid already lays a row out per entry of
    // `BUILDING_ARCHETYPES` and two rows with the same label share a column
    // axis: the second row's cells would be laid out as if they were the
    // first's, and land on top of them. The high-rise rows carry their prefix
    // for exactly this reason.
    row: `trade_${archetype}`,
    cells: Array.from({ length: TRADE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = tradeFacadeDefaults(archetype);
      const floors = column < Math.ceil(TRADE_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_t${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: tradeSizeFor(archetype, column),
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
