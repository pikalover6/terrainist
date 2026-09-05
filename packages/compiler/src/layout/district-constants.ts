import type { DistrictDensity } from "@terrainist/spec/ir";

/* the knobs the density turns                                                 */
/* -------------------------------------------------------------------------- */

/** Lot depth back from the build-to line, in blocks. */
export const LOT_DEPTH: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 17,
  medium: 16,
  low: 15,
});

/** Target frontage per lot, in blocks. Downtown parcels are narrow. */
export const LOT_FRONTAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 13,
  medium: 15,
  low: 19,
});

/** Share of unclaimed lots the infill actually builds on. */
export const LOT_COVERAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 0.94,
  medium: 0.62,
  low: 0.32,
});

/** Blocks of daylight left between an infill building and its lot's edges. */
export const LOT_SIDE_GAP: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});

/**
 * Storeys the infill built, per density — **superseded by C2**.
 *
 * The flat band is what built a mesa: every lot in a downtown drawing 3..8
 * uniformly, so the only tall things were the landmarks. `prominence.ts` owns
 * the storey count now ({@link ProminenceField.storeys}, and `STOREY_RANGE`
 * there is the range this table used to be). Kept exported because it states
 * what the fabric used to do and one or two documents still reason about it.
 */
export const INFILL_FLOORS: Readonly<Record<DistrictDensity, readonly [number, number]>> =
  Object.freeze({
    high: [3, 8] as const,
    medium: [2, 4] as const,
    low: [1, 2] as const,
  });

/** Blocks per storey, matching the profile's default. */
export const FLOOR_HEIGHT = 4;

/**
 * Columns of blend around a building's pad.
 *
 * Two, unchanged: `applyLevelPad` ramps the ground to the pad's level with a
 * smoothstep across it, so a district whose own apron did not quite reach still
 * meets its own ground. It is named here because the platform-seam guard has to
 * ask about exactly this reach — see `touchesSeam`.
 */
export const BUILDING_APRON = 2;

/** Smallest footprint axis this pass will hand the grammar. */
export const MIN_INFILL_SIDE = 7;

/** Deepest a building goes back from its build-to line. */
export const MAX_INFILL_DEPTH = 16;

/** Longest run of lots one landmark may merge. */
export const MAX_LANDMARK_RUN = 4;

/** How far past the sidewalk a block looks for the street it fronts. */
export const STREET_PROBE_SLACK = 10;

/* -------------------------------------------------------------------------- */
