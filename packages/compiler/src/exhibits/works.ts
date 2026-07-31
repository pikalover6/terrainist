/**
 * Dev-world exhibit rows for wave 3B — the food-and-craft works.
 *
 * The argument is `exhibits/wave2.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, with a cottage's footprint and a cottage's windows, and a
 * foundry at nine by seven under a cottage gable is not a foundry. These rows
 * are the fix: each cell carries the archetype's own facade tendencies and a
 * footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`. A row here called `foundry` would therefore be the
 * second row of that name, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `works_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread, which is a
 * conflict a merge can resolve.
 */

import { WORKS_BUILDING_ARCHETYPES, worksFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per works row. */
export const WORKS_ROW_LENGTH = 4;

/**
 * Footprint for a works archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. A works is read **down its length** —
 * intake at the door end, machinery up the walls, the fire at the far end — so
 * the industrial six are deep rather than wide. The shops are squarer, because
 * a counter and a floor to stand in front of it is all they need.
 */
export function worksSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "brewery":
      return [11 + grow, 12 + grow, 15 + grow];
    case "distillery":
      return [11 + grow, 12 + grow, 15 + grow];
    case "butchery":
      return [11 + grow, 11, 13 + grow];
    case "tea_house":
      return [13 + grow, 11, 13 + grow];
    case "trading_post":
      return [13 + grow, 11, 13 + grow];
    case "pawnshop":
      return [11 + grow, 11, 11 + grow];
    case "cooperage":
      return [11 + grow, 11, 15 + grow];
    case "glassworks":
      return [11 + grow, 12 + grow, 15 + grow];
    case "papermill":
      return [11 + grow, 11, 17 + grow];
    case "textile_mill":
      return [11 + grow, 12 + grow, 17 + grow];
    case "cannery":
      return [11 + grow, 11, 17 + grow];
    case "foundry":
    default:
      return [13 + grow, 12 + grow, 15 + grow];
  }
}

/**
 * The building rows: one per works archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const WORKS_EXHIBIT_ROWS: readonly DevExhibitRow[] = WORKS_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `works_${archetype}`,
    cells: Array.from({ length: WORKS_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = worksFacadeDefaults(archetype);
      const floors = column < Math.ceil(WORKS_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w3b${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: worksSizeFor(archetype, column),
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
