/**
 * Breakpoint exhibits — the grammar at its own structural thresholds.
 *
 * `building.grammar@0` is full of hard edges. A footprint one block too shallow
 * for a stair flight gets a ladder instead. A wing whose shared run is two
 * cells is silently dropped and the building comes out a rect. A storey height
 * asked for below `MIN_STORY_HEIGHT` is clamped up, and the envelope it was
 * supposed to fit inside is not — so the roof eats into the walls. Every one of
 * those is a *deliberate* fallback, and every one of them is also exactly where
 * a regression hides: the code either side of a threshold is exercised by any
 * village, but the code *at* it is exercised by nothing unless something is
 * built there on purpose.
 *
 * So these rows put a building at each edge, and — where the edge has two sides
 * worth seeing — one on each side of it. Nothing here is a size gradient: each
 * cell is a claim of the form "this dimension is the smallest/largest value for
 * which behaviour X still happens", derived from the exported constant rather
 * than from a literal, so a change to the constant moves the exhibit with it.
 *
 * The thresholds covered, all from `stdlib/structures/core.ts`:
 *
 * | threshold | rule | cells |
 * | --- | --- | --- |
 * | stair → ladder | a flight needs `interior depth ≥ storyHeight + 1` | `bp_stairs` |
 * | `MIN_WING_OVERLAP` | shared run < 3 → wing dropped | `bp_wing` |
 * | `MIN_WING_DEPTH` | wing depth < 3 → wing dropped | `bp_wing` |
 * | `MIN_MAIN_DEPTH` | main block left < 3 deep → wing dropped | `bp_wing` |
 * | wing overhang | `offset + span > box` → wing dropped | `bp_wing` |
 * | roof crush | `sizeY = floors × MIN_STORY_HEIGHT + ROOF_RESERVE + 1` | `bp_height` |
 * | `MAX_FLOORS` | `floors` above 2 is clamped | `bp_clamp` |
 * | `MIN_STORY_HEIGHT` / `MAX_STORY_HEIGHT` | `floorHeight` is clamped both ways | `bp_clamp` |
 * | `MAX_ROOF_LAYERS` | a roof never exceeds 5 courses | `bp_clamp` |
 * | `MIN_BASEMENT_DEPTH` / `MAX_BASEMENT_DEPTH` | `basement` is clamped both ways | `bp_clamp` |
 *
 * Vegetation thresholds (the mega-spruce cap and friends) are deliberately not
 * here: this is the structure grammar's showroom, and the scatter pass has no
 * exhibit in the dev world at all.
 */

import {
  MAX_BASEMENT_DEPTH,
  MAX_FLOORS,
  MAX_ROOF_LAYERS,
  MAX_STORY_HEIGHT,
  MIN_BASEMENT_DEPTH,
  MIN_MAIN_DEPTH,
  MIN_STORY_HEIGHT,
  MIN_WING_DEPTH,
  MIN_WING_OVERLAP,
  ROOF_RESERVE,
} from "@terrainist/stdlib";

import type { DevExhibitCell, DevExhibitRow } from "./types.js";

/**
 * The `sizeY` at which a `floors`-storey building gets exactly
 * {@link MIN_STORY_HEIGHT} per storey without the clamp doing any work.
 *
 * `storyHeight = floor((sizeY − ROOF_RESERVE − 1) / floors)`, clamped from
 * below at {@link MIN_STORY_HEIGHT}. One block under this the division returns
 * `MIN_STORY_HEIGHT − 1`, the clamp puts it back, and the walls are then taller
 * than the envelope reserved for them — which is the roof crush, visible as a
 * roof sitting lower on its walls than the one beside it.
 */
export function exactRoofHeight(floors: number): number {
  return floors * MIN_STORY_HEIGHT + ROOF_RESERVE + 1;
}

/** Theme for every breakpoint cell: one variable at a time, so the theme is fixed. */
const THEME = "temperate_timber";

function cell(
  id: string,
  size: readonly [number, number, number],
  floors: number,
  params?: Record<string, unknown>,
): DevExhibitCell {
  return {
    id,
    archetype: "cottage",
    theme: THEME,
    roof: "gable",
    floors,
    size,
    ...(params === undefined ? {} : { params }),
  };
}

/* -------------------------------------------------------------------------- */
/* stair → ladder                                                              */
/* -------------------------------------------------------------------------- */

/** Storeys the stair row builds — a flight only exists above one storey. */
const STAIR_FLOORS = 2;

/** Storey height the stair row runs at: the minimum, so the flight is shortest. */
const STAIR_STORY = MIN_STORY_HEIGHT;

/**
 * Shallowest envelope that still fits a flight.
 *
 * The run is `storyHeight` steps and stands one cell off the north wall, so it
 * needs `storyHeight + 1` of interior depth; the interior is the envelope inset
 * by one on each side, and `canStair` measures `z1 − z0`, which is one less than
 * that depth. `sizeZ − 3 ≥ storyHeight + 1` is the condition, and this is the
 * `sizeZ` that meets it with nothing to spare.
 */
export const STAIR_MIN_DEPTH = STAIR_STORY + 4;

/**
 * The flight, and the ladder one block shallower.
 *
 * Both cells are the same building in every other respect, so the pair reads as
 * "this is what the fallback costs you" rather than as two different houses.
 */
export const BREAKPOINT_STAIR_ROW: DevExhibitRow = {
  row: "bp_stairs",
  cells: [
    cell("bp_stairs_flight_min", [11, exactRoofHeight(STAIR_FLOORS), STAIR_MIN_DEPTH], STAIR_FLOORS),
    cell("bp_stairs_ladder", [11, exactRoofHeight(STAIR_FLOORS), STAIR_MIN_DEPTH - 1], STAIR_FLOORS),
  ],
};

/* -------------------------------------------------------------------------- */
/* the wing's four rejections                                                  */
/* -------------------------------------------------------------------------- */

/** One envelope for the whole wing row, so the plan is the only variable. */
const WING_BOX: readonly [number, number, number] = [13, exactRoofHeight(2), 13];

/** A south wing of the given run and depth, at `offset` along the face. */
function southWing(span: number, depth: number, offset = 0): Record<string, unknown> {
  return { wing: { size: [span, depth], side: "south", offset } };
}

/**
 * Each wing rejection, at the edge and one step past it.
 *
 * A refused wing is *dropped* — the grammar never fails a document — so the
 * "past it" cells all build a plain rect. That is the exhibit: the pair shows
 * you what a one-block error in a document costs, which is the whole building's
 * shape, silently.
 */
export const BREAKPOINT_WING_ROW: DevExhibitRow = {
  row: "bp_wing",
  cells: [
    // The shared run — the doorway between the two rooms.
    cell("bp_wing_overlap_min", WING_BOX, 2, southWing(MIN_WING_OVERLAP, 4)),
    cell("bp_wing_overlap_short", WING_BOX, 2, southWing(MIN_WING_OVERLAP - 1, 4)),
    // The wing's own depth — a room rather than a buttress.
    cell("bp_wing_depth_min", WING_BOX, 2, southWing(5, MIN_WING_DEPTH)),
    cell("bp_wing_depth_shallow", WING_BOX, 2, southWing(5, MIN_WING_DEPTH - 1)),
    // What the wing leaves behind: `boxDepth − depth + 1 ≥ MIN_MAIN_DEPTH`.
    cell("bp_wing_main_min", WING_BOX, 2, southWing(5, WING_BOX[2] - MIN_MAIN_DEPTH + 1)),
    cell("bp_wing_main_thin", WING_BOX, 2, southWing(5, WING_BOX[2] - MIN_MAIN_DEPTH + 2)),
    // Flush with the far end of the face, and one block past it.
    cell("bp_wing_flush_end", WING_BOX, 2, southWing(5, 4, WING_BOX[0] - 5)),
    cell("bp_wing_overhang", WING_BOX, 2, southWing(5, 4, WING_BOX[0] - 4)),
  ],
};

/* -------------------------------------------------------------------------- */
/* the roof crush                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The `sizeY` boundary, at both storey counts.
 *
 * The even cells are the exact fit; the odd ones are a block shorter, where the
 * storey-height clamp fires and the roof is pushed down into the envelope. Read
 * as a pair, the difference between them is precisely what the clamp did.
 */
export const BREAKPOINT_HEIGHT_ROW: DevExhibitRow = {
  row: "bp_height",
  cells: [1, 2].flatMap((floors) => [
    cell(`bp_height_${floors}f_exact`, [11, exactRoofHeight(floors), 11], floors),
    cell(`bp_height_${floors}f_crushed`, [11, exactRoofHeight(floors) - 1, 11], floors),
  ]),
};

/* -------------------------------------------------------------------------- */
/* every other clamp                                                           */
/* -------------------------------------------------------------------------- */

/** Envelope tall enough that a `MAX_STORY_HEIGHT` building is not also crushed. */
const TALL_Y = MAX_FLOORS * MAX_STORY_HEIGHT + MAX_ROOF_LAYERS + 1;

/**
 * Footprint at which the roof wants exactly {@link MAX_ROOF_LAYERS} courses.
 *
 * Layers are `min(ceil(min(sx, sz) / 2), max(2, round(wallTop × 0.55)))`,
 * clamped to `2..MAX_ROOF_LAYERS`. At `MAX_STORY_HEIGHT` storeys the second
 * term is far above the cap, so the footprint alone decides — and this is the
 * span whose half is the cap.
 */
const ROOF_CAP_SPAN = MAX_ROOF_LAYERS * 2;

export const BREAKPOINT_CLAMP_ROW: DevExhibitRow = {
  row: "bp_clamp",
  cells: [
    // v0 builds two storeys. A document asking for three gets two.
    cell(`bp_clamp_floors_${MAX_FLOORS + 1}`, [11, exactRoofHeight(MAX_FLOORS), 11], MAX_FLOORS + 1),
    // Storey height, at each stop and one past each.
    cell("bp_clamp_story_min", [11, exactRoofHeight(2), 11], 2, { floorHeight: MIN_STORY_HEIGHT }),
    cell("bp_clamp_story_under", [11, exactRoofHeight(2), 11], 2, { floorHeight: MIN_STORY_HEIGHT - 1 }),
    cell("bp_clamp_story_max", [11, TALL_Y, 11], MAX_FLOORS, { floorHeight: MAX_STORY_HEIGHT }),
    cell("bp_clamp_story_over", [11, TALL_Y, 11], MAX_FLOORS, { floorHeight: MAX_STORY_HEIGHT + 1 }),
    // The roof-layer cap, and the widest footprint one course below it.
    cell("bp_clamp_roof_cap", [ROOF_CAP_SPAN, TALL_Y, ROOF_CAP_SPAN], MAX_FLOORS, {
      floorHeight: MAX_STORY_HEIGHT,
    }),
    cell("bp_clamp_roof_under", [ROOF_CAP_SPAN - 2, TALL_Y, ROOF_CAP_SPAN - 2], MAX_FLOORS, {
      floorHeight: MAX_STORY_HEIGHT,
    }),
    // The cellar, at each stop and one past each. A clamped cellar is only
    // visible from inside, which is exactly why it needs an exhibit with a
    // known depth rather than a village house nobody opens.
    cell("bp_clamp_cellar_min", [11, exactRoofHeight(2), 11], 2, { basement: MIN_BASEMENT_DEPTH }),
    cell("bp_clamp_cellar_under", [11, exactRoofHeight(2), 11], 2, {
      basement: MIN_BASEMENT_DEPTH - 1,
    }),
    cell("bp_clamp_cellar_max", [11, exactRoofHeight(2), 11], 2, { basement: MAX_BASEMENT_DEPTH }),
    cell("bp_clamp_cellar_over", [11, exactRoofHeight(2), 11], 2, {
      basement: MAX_BASEMENT_DEPTH + 1,
    }),
  ],
};

/** Every breakpoint row, in grid order. Registered from `devworld-rows.ts`. */
export const BREAKPOINT_EXHIBIT_ROWS: readonly DevExhibitRow[] = Object.freeze([
  BREAKPOINT_STAIR_ROW,
  BREAKPOINT_WING_ROW,
  BREAKPOINT_HEIGHT_ROW,
  BREAKPOINT_CLAMP_ROW,
]);
