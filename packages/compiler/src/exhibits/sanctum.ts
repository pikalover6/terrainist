/**
 * Dev-world exhibit rows for the **sanctum pack** — one review walk, ten
 * buildings.
 *
 * The argument is `exhibits/faith.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, and a colossus on a nine-by-eleven plan under a gable is
 * a garden gnome. These rows are the fix.
 *
 * ## The sizes are the exhibit
 *
 * Everything in this pack is built in the volume between the eave plate and
 * `roofTop + ROOF_FLOURISH_RISE`, and that volume is a function of the
 * footprint and the roof shape — a **wide** plan gives a tall hip and so a
 * deep bowl or a big figure; a **slim, tall** plan gives a shaft. So the
 * gradient below is not decoration:
 *
 * - the **temple** is long in z and single-storey, because a peristyle wants
 *   bays to fall into and a cella is one room;
 * - the **amphitheatre** and the **arena** are square and generous, because
 *   the cavea is an ellipse inscribed in the footprint and a narrow one is an
 *   alley with stairs;
 * - the **stadium** is long, because a pitch is;
 * - the **colossus** is wide and *low* — the widest plan that still reads as a
 *   pedestal — because the figure's height is the roof allowance and the
 *   allowance grows with the span;
 * - the **obelisk** is the opposite: the slimmest, tallest envelope in the
 *   catalog, because the shell itself is the shaft;
 * - the **shrine** and the **altar stone** are the smallest things here, and
 *   the **chapel** is a village building rather than a great church.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import { SANCTUM_BUILDING_ARCHETYPES, sanctumFacadeDefaults } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per sanctum row. */
export const SANCTUM_ROW_LENGTH = 4;

/** Footprint for a sanctum archetype at gradient position `column`. */
export function sanctumSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "temple":
      return [15 + grow, 15 + grow, 21 + grow * 2];
    case "chapel":
      return [9 + (grow % 2), 11 + grow, 13 + grow];
    case "shrine":
      return [7 + (grow % 2), 10 + grow, 7 + (grow % 2)];
    case "altar_stone":
      return [9 + (grow % 2), 10 + grow, 9 + (grow % 2)];
    case "wayside_cross":
      return [9 + (grow % 2), 14 + grow, 9 + (grow % 2)];
    // The shell is the shaft: as slim and as tall as the grammar will build.
    case "obelisk":
      return [7 + (grow % 2), 20 + grow * 2, 7 + (grow % 2)];
    // Wide and low: the figure is the roof allowance, and the allowance is a
    // function of the span.
    case "colossus":
      return [15 + grow, 12 + (grow % 2), 15 + grow];
    case "amphitheater":
      return [17 + grow * 2, 15 + grow, 17 + grow * 2];
    case "arena":
      return [17 + grow * 2, 15 + grow, 17 + grow * 2];
    case "stadium":
    default:
      return [15 + grow, 13 + grow, 21 + grow * 2];
  }
}

/**
 * Storeys for a sanctum archetype.
 *
 * Every other wave's rows step the storey count up at the halfway mark to show
 * the upper-floor fit-out. Half of this pack refuses that: a **cella**, a
 * **shrine**, a **chamber under a capstone** and the **undercroft of a bowl**
 * are one-room buildings, and a second floor cuts the room the fit-out is for
 * in half. The monuments and the games buildings keep the gradient, because
 * their read is entirely above the plate and the storeys under it are the
 * substructure either way.
 */
function sanctumFloors(archetype: string, column: number): number {
  const stepped = column >= Math.ceil(SANCTUM_ROW_LENGTH / 2) ? 2 : 1;
  switch (archetype) {
    case "temple":
    case "shrine":
    case "altar_stone":
    case "chapel":
      return 1;
    default:
      return stepped;
  }
}

/**
 * The building rows: one per sanctum archetype, four cells each.
 *
 * The row labels are prefixed `sanc_` for the reason every wave's are: the
 * base grid lays a row **named after the archetype** for every entry of
 * `BUILDING_ARCHETYPES`, and the dev-world layout keys rows by label — two
 * rows with one label is a collision, not an extra exhibit.
 */
export const SANCTUM_EXHIBIT_ROWS: readonly DevExhibitRow[] = SANCTUM_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: `sanc_${archetype}`,
    cells: Array.from({ length: SANCTUM_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = sanctumFacadeDefaults(archetype);
      const floors = sanctumFloors(archetype, column);
      return {
        id: `${archetype}_sanc${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: sanctumSizeFor(archetype, column),
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
