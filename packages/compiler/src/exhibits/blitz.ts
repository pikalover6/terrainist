/**
 * Dev-world exhibit rows for the breadth blitz.
 *
 * Two grids, one file, because the round added to both halves of the
 * vocabulary: ten building archetypes and fifteen props.
 *
 * The argument is `exhibits/archetypes.ts`'s, unchanged. `devworld.ts` already
 * builds one row per entry of `BUILDING_ARCHETYPES`, so every archetype here
 * appears in the grid without a line of this file — but it appears at the
 * *cottage gradient*, with a cottage's footprint and a cottage's windows, and
 * a keep at nine by seven with a mullioned window is not a keep. These rows
 * are the fix: each cell carries the archetype's own facade tendencies and a
 * footprint that suits what it is.
 *
 * The prop rows exist for a different reason: `test/props.test.ts` holds the
 * prop grid against `PROP_NAMES` and requires every prop to be shown at least
 * once. A prop that has no exhibit is a prop nobody will ever look at.
 *
 * **Seam file, both ways.** `devworld.ts`, `devworld-rows.ts` and
 * `exhibits/props.ts` are shared ground; this file only *exports*. Registering
 * it is one import and one spread on each side, which is a conflict a merge
 * can resolve.
 */

import { BLITZ_BUILDING_ARCHETYPES, blitzFacadeDefaults, type PropName } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cells per breadth-archetype row. */
export const BLITZ_ROW_LENGTH = 4;

/**
 * Footprint for a breadth archetype at gradient position `column`.
 *
 * Each is shaped like the thing it is. The two that matter most:
 *
 * - the **keep** is square and tall, because a battlement over a long thin box
 *   reads as a wall rather than as a tower;
 * - the **pagoda** is square and *very* tall, because the tiers are drawn from
 *   the room between the eave plate and the shell roof's top, and a short
 *   envelope gets three tiers stacked one course apart instead of five spread
 *   out.
 */
export function blitzSizeFor(archetype: string, column: number): [number, number, number] {
  const grow = column;
  switch (archetype) {
    case "keep":
      return [11 + grow, 15 + grow, 11 + grow];
    case "gatehouse":
      return [11 + grow, 13 + grow, 9 + (grow % 2)];
    case "barracks":
      return [9 + grow, 10, 15 + grow];
    case "pagoda":
      return [11 + grow * 2, 16 + grow * 2, 11 + grow * 2];
    case "wizard_tower":
      return [9 + (grow % 2), 17 + grow * 2, 9 + (grow % 2)];
    case "observatory":
      return [11 + grow, 14 + grow, 11 + grow];
    case "greenhouse":
      return [9 + grow, 10, 13 + grow];
    case "gym":
      return [13 + grow, 10, 11 + grow];
    case "mausoleum":
      return [7 + (grow % 3), 9, 7 + (grow % 2)];
    case "windpump":
    default:
      return [9 + grow, 14 + grow, 9 + grow];
  }
}

/**
 * The building rows: one per breadth archetype, four cells each.
 *
 * The gradient inside a row is size and theme; the roof is pinned to the
 * archetype's own tendency, and the storey count steps up at the halfway mark
 * so every row shows the upper-floor fit-out beside the single-storey version.
 */
export const BLITZ_EXHIBIT_ROWS: readonly DevExhibitRow[] = BLITZ_BUILDING_ARCHETYPES.map(
  (archetype) => ({
    row: archetype,
    cells: Array.from({ length: BLITZ_ROW_LENGTH }, (_, column): DevExhibitCell => {
      const facade = blitzFacadeDefaults(archetype);
      const floors = column < Math.ceil(BLITZ_ROW_LENGTH / 2) ? 1 : 2;
      return {
        id: `${archetype}_b${column}`,
        archetype,
        theme: DEV_THEMES[column % DEV_THEMES.length] as string,
        roof: facade.roof ?? "gable",
        floors,
        size: blitzSizeFor(archetype, column),
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

/**
 * The prop rows, in the shape `exhibits/props.ts` spreads.
 *
 * Four families, and every one of the fifteen props appears at least once at
 * yaw 0. The rotations are spent where they buy the most: the compounds and
 * the works, whose op lists are hand-written and asymmetric, and where a
 * property that did not rotate would be invisible at yaw 0.
 */
export const BLITZ_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly { readonly prop: PropName; readonly params: Record<string, unknown> }[];
}[] = Object.freeze([
  {
    row: "street",
    water: false,
    cells: [
      { prop: "bench" as PropName, params: { yaw: 0 } },
      { prop: "bench" as PropName, params: { yaw: 90 } },
      { prop: "planter" as PropName, params: { yaw: 0 } },
      { prop: "clothesline" as PropName, params: { yaw: 0 } },
      { prop: "clothesline" as PropName, params: { yaw: 90 } },
      { prop: "scarecrow" as PropName, params: { yaw: 0 } },
      { prop: "market_barrow" as PropName, params: { yaw: 0 } },
      { prop: "market_barrow" as PropName, params: { yaw: 90 } },
      { prop: "signpost" as PropName, params: { yaw: 0 } },
    ],
  },
  {
    row: "works",
    water: false,
    cells: [
      { prop: "swimming_pool" as PropName, params: { yaw: 0 } },
      { prop: "swimming_pool" as PropName, params: { yaw: 90 } },
      { prop: "curtain_wall" as PropName, params: { length: 16, yaw: 0 } },
      { prop: "curtain_wall" as PropName, params: { length: 24, yaw: 90 } },
    ],
  },
  {
    row: "camps",
    water: false,
    cells: [
      { prop: "tent" as PropName, params: { yaw: 0 } },
      { prop: "tent" as PropName, params: { yaw: 90 } },
      { prop: "caravan" as PropName, params: { yaw: 0 } },
      { prop: "caravan" as PropName, params: { yaw: 180 } },
      { prop: "campsite" as PropName, params: { yaw: 0 } },
    ],
  },
  {
    row: "yards",
    water: false,
    cells: [
      { prop: "graveyard" as PropName, params: { yaw: 0 } },
      { prop: "graveyard" as PropName, params: { yaw: 90 } },
      { prop: "treehouse" as PropName, params: { yaw: 0 } },
      { prop: "cairn" as PropName, params: { yaw: 0 } },
      { prop: "carousel" as PropName, params: { yaw: 0 } },
      { prop: "carousel" as PropName, params: { yaw: 90 } },
    ],
  },
]);
