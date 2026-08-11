/**
 * Dev-world exhibit rows for the siegeworks pack — seven fortworks.
 *
 * The argument is `exhibits/garrison.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a star fort at nine by seven is a shed with a kerb.
 * These rows are the fix: each cell carries the archetype's own facade
 * tendencies and a footprint that suits what it is.
 *
 * The pack's whole reason for existing is the read at a glance, so the
 * gradient is chosen for the **silhouette** rather than for interior variety:
 * every work here is wide enough that its apron has a trace to draw, and the
 * two headliners — the star fort and the siege camp — get the biggest
 * envelopes in the set, because a star with a three-cell face has no points
 * and a tent narrower than its own ridge is a lean-to.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit. Every label below
 * is `siege_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { SIEGEWORKS_BUILDING_ARCHETYPES, siegeworksFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per siegeworks row. */
export const SIEGEWORKS_ROW_LENGTH = 4;

/**
 * Footprint for a siegeworks archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is:
 *
 * - the **star fort** is the widest in the set and nearly square, because the
 *   trace needs a middle salient on every face and a corner to raise;
 * - the **siege camp** is long, so the tent has a ridge to run down and the
 *   far apron has room for the bank and the engine;
 * - the **drill yard** is the deepest — a parade ground is a *run*;
 * - the **moat** and the **drawbridge** stay low, because a work read from
 *   the ground plane gains nothing from height;
 * - the **palisade** and the **motte** are square and modest, the size a
 *   stockade or a mound actually is.
 */
export function siegeworksSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "star_fort":
      return [17 + grow, 14 + grow, 17 + grow];
    case "motte_and_bailey":
      return [13 + grow, 15 + grow, 13 + grow];
    case "palisade":
      return [13 + grow, 11, 13 + grow];
    case "moat":
      return [13 + grow, 11, 13 + grow];
    case "drawbridge":
      return [13 + grow, 12, 15 + grow];
    case "drill_yard":
      return [13 + grow, 11, 21 + grow];
    case "siege_camp":
    default:
      return [15 + grow, 13 + grow, 19 + grow];
  }
}

/**
 * The rows: one per siegeworks archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency. Everything here is **single storey** on purpose:
 * these are works rather than buildings, and a second floor in a tent or over
 * a moat is a distraction from the only thing the walk is judging — whether
 * the silhouette says what the name says.
 */
export const SIEGEWORKS_EXHIBIT_ROWS: readonly DevExhibitRow[] =
  SIEGEWORKS_BUILDING_ARCHETYPES.map((archetype) => ({
    row: `siege_${archetype}`,
    cells: Array.from({ length: SIEGEWORKS_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = siegeworksFacadeDefaults(archetype);
      const floors = 1;
      return {
        id: `${archetype}_sw${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: siegeworksSizeFor(archetype, column),
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
