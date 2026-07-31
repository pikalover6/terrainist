/**
 * Dev-world exhibit rows for the wave-5E arcana buildings.
 *
 * The argument is `exhibits/faith.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a beacon spire at thirteen by eleven under a gable
 * is not a spire. These rows are the fix: each cell carries the archetype's
 * own facade tendencies and a footprint that suits what it is.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `arc_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { ARCANA_BUILDING_ARCHETYPES, arcanaFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per arcana row. */
export const ARCANA_ROW_LENGTH = 4;

/**
 * Footprint for an arcana archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The ones that matter most:
 *
 * - the **alchemist's tower** and the **beacon spire** are small and *tall*,
 *   the wizard tower's proportions: both close their cone in the room between
 *   the eave plate and the roof top, and a short envelope closes itself in two
 *   courses;
 * - the **dragon roost** is the biggest thing here, because the read is a
 *   great open hall with a nest lost in the middle of it;
 * - the **bathing pavilion** wants a generous *square*: the pool is inset one
 *   cell all round, so a narrow room has a pool with no bathers' side to it;
 * - the **remembrance arch** wants **height in the storey**, not in the
 *   envelope — its crown is drawn at the top interior course, so the row runs
 *   on a taller box than a memorial of its plan would otherwise need;
 * - the **urn wall** and the **servants' quarters** are long in z, because
 *   both are a corridor with the building's whole content on the side walls.
 */
export function arcanaSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "alchemists_tower":
      return [9 + (grow % 2), 19 + grow * 2, 9 + (grow % 2)];
    case "dragon_roost":
      return [17 + grow, 15 + grow, 21 + grow * 2];
    case "crystal_shrine":
      return [11 + grow, 13 + grow, 13 + grow];
    case "dwarven_gate":
      return [15 + grow, 13 + grow, 13 + grow];
    case "beacon_spire":
      return [7 + (grow % 2), 21 + grow * 2, 7 + (grow % 2)];
    case "cenotaph":
      return [11 + grow, 12 + grow, 13 + grow];
    case "war_memorial":
      return [11 + grow, 12 + grow, 13 + grow];
    case "urn_wall":
      return [9 + grow, 12 + grow, 17 + grow];
    case "remembrance_arch":
      return [13 + grow, 15 + grow, 15 + grow];
    case "pyre_platform":
      return [13 + grow, 12 + grow, 13 + grow];
    case "bathing_pavilion":
      return [13 + grow, 13 + grow, 13 + grow];
    case "servants_quarters":
    default:
      return [11 + grow, 12 + grow, 17 + grow];
  }
}

/**
 * The building rows: one per arcana archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const ARCANA_EXHIBIT_ROWS: readonly DevExhibitRow[] = ARCANA_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `arc_${archetype}`,
    cells: Array.from({ length: ARCANA_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = arcanaFacadeDefaults(archetype);
      const floors = column < Math.ceil(ARCANA_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_w5e${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: arcanaSizeFor(archetype, column),
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
