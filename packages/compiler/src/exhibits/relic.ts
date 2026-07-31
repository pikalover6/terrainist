/**
 * Dev-world exhibit rows for the wave-6E ruined buildings.
 *
 * The argument is `exhibits/arcana.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a ruined keep at eleven by nine is a garden wall.
 * These rows are the fix: each cell carries the archetype's own facade
 * tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `ruin_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { RELIC_BUILDING_ARCHETYPES, relicFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per relic row. */
export const RELIC_ROW_LENGTH = 4;

/**
 * Footprint for a relic archetype at gradient position `column`.
 *
 * Each is shaped like the thing it was before it fell down, because the decay
 * is drawn *on* the shell and a shell with nothing to it has nothing to lose:
 *
 * - the **ruined keep** is the biggest plan here — a keep's read is four
 *   corner stumps a long way apart, and on a small square they touch;
 * - the **ruined church** is long in z and tall in storey, because a nave that
 *   crumbles to two courses is a sheep pen;
 * - the **collapsed tower** is small and tall: the lean is a *proportion* of
 *   the wall height, so a short envelope has nothing to slope.
 */
export function relicSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "ruined_cottage":
      return [11 + grow, 11 + grow, 13 + grow];
    case "ruined_keep":
      return [17 + grow, 13 + grow, 17 + grow];
    case "ruined_church":
      return [13 + grow, 15 + grow, 19 + grow];
    case "collapsed_tower":
      return [9 + (grow % 2), 17 + grow * 2, 9 + (grow % 2)];
    case "overgrown_villa":
    default:
      return [15 + grow, 13 + grow, 15 + grow];
  }
}

/**
 * The building rows: one per relic archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency (it is coming off anyway, but the shape decides
 * where the eave plate lands and therefore where the crumble line is drawn),
 * and the storey count steps up at the halfway mark so every row shows a
 * two-storey ruin beside a single-storey one.
 */
export const RELIC_EXHIBIT_ROWS: readonly DevExhibitRow[] = RELIC_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `ruin_${archetype}`,
    cells: Array.from({ length: RELIC_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = relicFacadeDefaults(archetype);
      const floors = column < Math.ceil(RELIC_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w6e${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: relicSizeFor(archetype, column),
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
