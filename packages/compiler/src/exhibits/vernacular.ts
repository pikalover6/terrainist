/**
 * Dev-world exhibit rows for the vernacular wave.
 *
 * The argument is `exhibits/archetypes.ts`'s and `exhibits/blitz.ts`'s,
 * unchanged. `devworld.ts` already builds one row per entry of
 * `BUILDING_ARCHETYPES`, so all three of these appear in the grid without a
 * line of this file — but they appear at the *cottage gradient*, and a saltbox
 * on a seven-deep plan has nowhere to run its long slope, which is the entire
 * point of a saltbox. These rows are the fix: each cell carries the
 * archetype's own facade tendencies and a footprint that suits what it is.
 *
 * **Seam file, both ways.** `devworld.ts` and `devworld-rows.ts` are shared
 * ground; this file only *exports*. Registering it is one import and one
 * spread, which is a conflict a merge can resolve.
 */

import {
  VERNACULAR_BUILDING_ARCHETYPES,
  vernacularFacadeDefaults,
} from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per vernacular-archetype row. */
export const VERNACULAR_ROW_LENGTH = 4;

/**
 * Footprint for a vernacular archetype at gradient position `column`.
 *
 * Each is shaped like the region builds it, and two of the three are shaped
 * that way for a mechanical reason rather than a picturesque one:
 *
 * - the **saltbox** is deep and only moderately tall, because the asymmetry is
 *   drawn along z and a shallow plan gives the long slope one cell to fall in;
 * - the **Dutch gable house** is narrow and tall, because the stepped parapet
 *   is drawn from the pitch across x and needs both the width to step over and
 *   the height above the plate to step *into*;
 * - the **chalet** is wide and low, because a deep eave over a tall box reads
 *   as a hat rather than as an overhang.
 */
export function vernacularSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "alpine_chalet":
      return [13 + grow, 11 + (grow % 2), 11 + grow];
    case "saltbox_house":
      return [9 + (grow % 2), 12 + grow, 15 + grow];
    case "dutch_gable_house":
    default:
      return [9 + grow, 15 + grow, 11 + grow];
  }
}

/**
 * The building rows: one per vernacular archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const VERNACULAR_EXHIBIT_ROWS: readonly DevExhibitRow[] =
  VERNACULAR_BUILDING_ARCHETYPES.map((archetype) => ({
    row: archetype,
    cells: Array.from({ length: VERNACULAR_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = vernacularFacadeDefaults(archetype);
      const floors = column < Math.ceil(VERNACULAR_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_v${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: vernacularSizeFor(archetype, column),
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
