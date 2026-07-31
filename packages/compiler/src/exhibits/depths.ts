/**
 * Dev-world exhibit rows for wave six — the depths.
 *
 * The argument is `exhibits/underground.ts`'s, and it has the same awkwardness:
 * the half of these buildings that matters is under the ground, and a grid is
 * read from the air. So what the row shows is the **entrance** — a blockhouse,
 * a ticket hall, a hatch hut — and what a reader who climbs down the ladder
 * finds is the archetype. Each cell is dug to the deepest legal cellar, which
 * is also what the archetype digs for itself when a document says nothing:
 * these rows exercise that default rather than overriding it.
 *
 * ## Why the row labels are prefixed
 *
 * The base grid lays a row named after the archetype for every entry of
 * `BUILDING_ARCHETYPES`, and the layout keys rows by label — two rows with one
 * label is a collision, not an extra exhibit. Every label below is therefore
 * `depth_<archetype>`.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { DEPTHS_BUILDING_ARCHETYPES, depthsFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per depths row. */
export const DEPTHS_ROW_LENGTH = 3;

/**
 * Footprint for a wave-six entrance at gradient position `column`.
 *
 * All three are small, and deliberately: an entrance that is bigger than what
 * it is an entrance to is a hall. They are wide enough that the cellar beneath
 * has room for its own fit-out — a subway platform on a seven-by-seven is a
 * corridor — and no wider.
 */
export function depthsSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column * 2;
  switch (archetype) {
    case "bunker_complex":
      return [11 + grow, 10, 11 + grow];
    case "subway_station":
      return [13 + grow, 11, 13 + grow];
    case "underground_silo":
    default:
      return [11 + grow, 11, 11 + grow];
  }
}

/**
 * The rows: one per wave-six archetype, three cells each.
 *
 * Single storey throughout — every one of these is a one-room entrance, and a
 * two-storey bunker is a block of flats. The gradient is size and theme.
 */
export const DEPTHS_EXHIBIT_ROWS: readonly DevExhibitRow[] = DEPTHS_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `depth_${archetype}`,
    cells: Array.from({ length: DEPTHS_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = depthsFacadeDefaults(archetype);
      return {
        id: `${archetype}_d${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "flat",
        floors: 1,
        size: depthsSizeFor(archetype, column),
        params: {
          archetype,
          floors: 1,
          ...(facade.roof === undefined ? {} : { roof: facade.roof }),
          ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
          ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
        },
      };
    }),
  }),
);
