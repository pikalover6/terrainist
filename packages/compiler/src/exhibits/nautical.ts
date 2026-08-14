/**
 * Dev-world exhibit rows for the **nautical pack's buildings** — one review
 * walk, six buildings from the pack's two implementing halves (the props
 * review in the prop grid's corsair/brine rows).
 *
 * The argument is `exhibits/sanctum.ts`'s, unchanged. Sizes are the halves'
 * own recommendations, treated as load-bearing:
 *
 * - the **martello tower** shows small as well as large because the corner
 *   chamfer that makes the drum octagonal is most visible on the small plan;
 * - the **sail loft** carries both storey counts: the loft cloth only exists
 *   with an upper floor, and the single-storey fallback is its own read;
 * - the **treadwheel crane** degrades great wheel → small wheel → windlass as
 *   the envelope shrinks, and the row shows all three.
 *
 * **Seam file.** `devworld.ts` and `devworld-rows.ts` are shared ground; this
 * file only *exports*. Registering it is one import and one spread.
 */

import {
  BRINE_BUILDING_ARCHETYPES,
  CORSAIR_BUILDING_ARCHETYPES,
  brineFacadeDefaults,
  corsairFacadeDefaults,
} from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per nautical row. */
export const NAUTICAL_ROW_LENGTH = 4;

/** Both halves' buildings, walked as one pack. */
const NAUTICAL_PACK_BUILDINGS = [
  ...CORSAIR_BUILDING_ARCHETYPES,
  ...BRINE_BUILDING_ARCHETYPES,
] as const;

/** Footprint for a nautical archetype at gradient position `column`. */
export function nauticalSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "powder_magazine":
      return [11 + (grow % 2), 14, 15 + grow];
    // Small first: the chamfered drum is most visible on the small plan.
    case "martello_tower":
      return [9 + grow, 11 + grow, 9 + grow];
    case "chandlery":
      return [11 + (grow % 2), 12, 13 + grow];
    case "sail_loft":
      return [13 + (grow % 2), 16, 17 + grow];
    case "salt_house":
      return [11 + grow, 12 + (grow % 2), 11 + grow];
    // Windlass -> small wheel -> great wheel as the envelope grows.
    case "treadwheel_crane":
    default:
      return [9 + grow * 2, 11 + grow * 2, 9 + grow * 3];
  }
}

/** The sail loft's cloth needs the upper storey; half its row shows it. */
function nauticalFloors(archetype: string, column: number): number {
  if (archetype === "sail_loft") {
    return column >= Math.ceil(NAUTICAL_ROW_LENGTH / 2) ? 2 : 1;
  }
  return 1;
}

function facadeFor(archetype: string): { roof?: string; windowShape?: string; windowRhythm?: string } {
  return (CORSAIR_BUILDING_ARCHETYPES as readonly string[]).includes(archetype)
    ? corsairFacadeDefaults(archetype)
    : brineFacadeDefaults(archetype);
}

/** The building rows: one per nautical archetype, four cells each. */
export const NAUTICAL_EXHIBIT_ROWS: readonly DevExhibitRow[] = NAUTICAL_PACK_BUILDINGS.map(
  (archetype) => ({
    row: `naut_${archetype}`,
    cells: Array.from({ length: NAUTICAL_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = facadeFor(archetype);
      const floors = nauticalFloors(archetype, column);
      return {
        id: `${archetype}_naut${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "hip",
        floors,
        size: nauticalSizeFor(archetype, column),
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
