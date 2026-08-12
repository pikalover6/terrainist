/**
 * Dev-world exhibit rows for the **classical Mediterranean pack** — one review
 * walk, fourteen buildings (the pack's props review in the prop grid, where
 * the trireme gets its water).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged: every archetype here
 * already appears in the base grid at the cottage gradient, and a peripteral
 * temple on a cottage plan is a shed with delusions. The sizes below are the
 * two implementing waves' own recommendations, treated as load-bearing:
 *
 * - the **stoa** and the **gymnasion** are long because the run *is* the icon
 *   (an arcade, a xystos track);
 * - the **peripteral temple** is the headline and gets the pediment's room;
 * - the **tholos** and the **palaestra** stay square — an octagonal ring and a
 *   sand court both read from the plan;
 * - the **sanctuary treasury** is deliberately the smallest thing here: a
 *   treasury reads by repetition, not by size;
 * - the **ship shed** is deep, because it is a garage for a hull.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import {
  CLASSICAL_B_BUILDING_ARCHETYPES,
  CLASSICAL_BUILDING_ARCHETYPES,
  classicalBFacadeDefaults,
  classicalFacadeDefaults,
} from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per classical row. */
export const CLASSICAL_ROW_LENGTH = 4;

/** Both waves' buildings, walked as one pack. */
const CLASSICAL_PACK_BUILDINGS = [
  ...CLASSICAL_BUILDING_ARCHETYPES,
  ...CLASSICAL_B_BUILDING_ARCHETYPES,
] as const;

/** Footprint for a classical archetype at gradient position `column`. */
export function classicalSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    // The run is the icon: grow the arcade, not the depth.
    case "stoa":
      return [21 + grow * 2, 13 + grow, 11 + (grow % 2)];
    case "peristyle_house":
      return [15 + grow, 12 + (grow % 2), 15 + grow];
    case "megaron":
      return [13 + (grow % 2), 15 + grow, 21 + grow];
    case "propylaea":
      return [15 + grow, 15 + grow, 11 + (grow % 2)];
    case "bouleuterion":
      return [15 + grow, 12 + grow, 15 + grow];
    // The headline; the short face is the door face and carries the pediment.
    case "peripteral_temple":
      return [15 + grow, 17 + grow, 23 + grow * 2];
    // Square by construction: the ring is octagonal, the cone is a disc.
    case "tholos":
      return [15 + grow, 16 + grow, 15 + grow];
    // Deliberately small — a treasury reads by repetition, not by size.
    case "sanctuary_treasury":
      return [9 + (grow % 2), 12 + grow, 9 + (grow % 2)];
    case "palaestra":
      return [17 + grow, 12 + (grow % 2), 17 + grow];
    // The longest plan in the pack; the length is the xystos.
    case "gymnasion":
      return [17 + (grow % 2), 12 + (grow % 2), 27 + grow * 2];
    case "odeon":
      return [15 + grow, 13 + grow, 17 + grow];
    // A garage for a hull: deep, with headroom for the ridge.
    case "ship_shed":
      return [13 + (grow % 2), 14 + grow, 21 + grow * 2];
    case "nymphaeum":
      return [13 + grow, 13 + grow, 13 + (grow % 2)];
    // storyHeight rises with the envelope; the press beam needs 4 courses.
    case "olive_press":
    default:
      return [11 + (grow % 2), 12 + grow, 11 + (grow % 2)];
  }
}

/**
 * Storeys: one, almost everywhere. A cella, a council bank, a passage, a sand
 * court and a hull garage are single volumes and a second floor halves the
 * room the fit-out is for. The peristyle house is the exception — a domus has
 * an upper range, and the gradient's back half shows it.
 */
function classicalFloors(archetype: string, column: number): number {
  if (archetype === "peristyle_house") {
    return column >= Math.ceil(CLASSICAL_ROW_LENGTH / 2) ? 2 : 1;
  }
  return 1;
}

function facadeFor(archetype: string): { roof?: string; windowShape?: string; windowRhythm?: string } {
  return (CLASSICAL_BUILDING_ARCHETYPES as readonly string[]).includes(archetype)
    ? classicalFacadeDefaults(archetype)
    : classicalBFacadeDefaults(archetype);
}

/**
 * The building rows: one per classical archetype, four cells each. Labels are
 * prefixed `clas_` for the reason every wave's are: the base grid already lays
 * a row named after each archetype, and rows key by label.
 */
export const CLASSICAL_EXHIBIT_ROWS: readonly DevExhibitRow[] = CLASSICAL_PACK_BUILDINGS.map(
  (archetype) => ({
    row: `clas_${archetype}`,
    cells: Array.from({ length: CLASSICAL_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = facadeFor(archetype);
      const floors = classicalFloors(archetype, column);
      return {
        id: `${archetype}_clas${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: classicalSizeFor(archetype, column),
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
