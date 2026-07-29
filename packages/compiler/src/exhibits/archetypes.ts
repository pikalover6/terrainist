/**
 * Dev-world exhibit rows for the extended archetypes.
 *
 * `devworld.ts` builds one row per entry of `BUILDING_ARCHETYPES`, so the seven
 * archetypes added in this round already appear in the grid without anything
 * here. What it does *not* do is vary their facade: `sizeFor` falls through to
 * the cottage gradient for anything it does not name, and — the seam that
 * matters — `core.ts` never consults the archetype when it resolves
 * `windowShape`, `windowRhythm` or `roof`, so a church in the default grid gets
 * a cottage's windows.
 *
 * These rows are the fix, and the demonstration of the workaround: each cell
 * carries the archetype's own {@link archetypeFacadeDefaults} and a footprint
 * that suits it (a church is long and tall, a market stall is small and
 * square). A caller that spreads {@link ARCHETYPE_EXHIBIT_ROWS} into the grid
 * therefore sees the archetypes as they are meant to look rather than as the
 * default gradient renders them.
 *
 * **Seam file, both ways.** `devworld.ts` and `devworld-rows.ts` are shared
 * ground and stay closed to this track; this file only *exports*. Registering
 * it is one import and one spread in `devworld-rows.ts`, which is a conflict a
 * merge can resolve.
 */

import { archetypeFacadeDefaults, EXTENDED_BUILDING_ARCHETYPES } from "@terrainist/stdlib";

import { DEV_ROOFS, DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per extended-archetype row. */
export const ARCHETYPE_ROW_LENGTH = 5;

/**
 * Footprint for an extended archetype at gradient position `column`.
 *
 * Each one is shaped like the thing it is, which is the point of a dedicated
 * row: a church is a nave — long, narrow and tall enough to carry a steeple —
 * and a market stall is barely a room.
 */
export function extendedSizeFor(
  archetype: string,
  column: number,
): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // Long and tall: the nave needs bays for the pews and height for the
    // tall lights, and the steeple is sized off the roof it stands on.
    case "church":
      return [9 + grow, 13 + grow, 13 + grow * 2];
    // Wide and deep, low walls: two ranges of stalls and a cart aisle.
    case "barn":
      return [11 + grow, 10, 13 + grow];
    // Tall and square, so the sails have wall to hang on.
    case "windmill":
      return [9 + grow, 14 + grow, 9 + grow];
    case "warehouse":
      return [11 + grow, 11, 11 + grow];
    // The smallest thing the grammar can still build a door into.
    case "market_stall":
      return [7, 8, 7 + (grow % 2)];
    case "library":
      return [9 + grow, 11, 9 + (grow % 3)];
    case "bakery":
    default:
      return [8 + grow, 9, 8 + (grow % 3)];
  }
}

/**
 * The rows: one per extended archetype, five cells each.
 *
 * The gradient inside a row is size, theme and storey count — the roof is
 * pinned to the archetype's own tendency, because the roof-versus-theme
 * comparison already has a control row of its own and repeating it here would
 * only make the church row harder to read.
 */
export const ARCHETYPE_EXHIBIT_ROWS: readonly DevExhibitRow[] = EXTENDED_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: archetype,
    cells: Array.from({ length: ARCHETYPE_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = archetypeFacadeDefaults(archetype);
      // Two storeys from the halfway mark, so every row shows the upper-floor
      // fit-out next to the single-storey version of the same building.
      const floors = column < Math.ceil(ARCHETYPE_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_x${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? (DEV_ROOFS[column % DEV_ROOFS.length] as string),
        floors,
        size: extendedSizeFor(archetype, column),
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
