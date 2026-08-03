/**
 * Swept cross-section **profiles**: the bridge kit's and the public stair's.
 *
 * The engine is `structures/sweep.ts` — the `SweptProfile` contract pinned in
 * `docs/DESIGN.md` §3, implemented. This module is *client* data built on it:
 * the two cross-sections, the widths derived from them, and the one thing the
 * engine deliberately does not do — decide what a tread is **made of**.
 *
 * ## THE SEAM
 *
 * Every type and every piece of geometry here comes from the engine:
 * {@link bandOfLane}, {@link totalHalfWidth}, {@link synthesizeTreads}. This
 * file declares no band, no cap and no interval feature of its own. Two client
 * call sites read it, each marked `SEAM(sweep)`: `structures/bridge.ts`
 * (the deck, rail and piers) and `structures/setpieces.ts` (`dressBridge`,
 * `dressStair`). Routing either through a full `sweep()` call — one pass that
 * grades, bands and dresses in a single traversal — is the remaining
 * integration step; the geometry is already the engine's.
 *
 * ## The tread law
 *
 * The `need[]` recurrence — `need[k] = max(g[k] + 1, need[k+1] − 1)` taken
 * backwards — is the *mechanism* and it is not negotiable: it is what makes a
 * flight climbable. Stairs and slabs are **decoration on top of that level**
 * (DESIGN §3 rule 2). {@link treadPlan} therefore never moves a level; it only
 * decides what the topmost course of an already-levelled column is made of,
 * and it does so under a proof (see {@link treadSurfaces}) that no transition
 * it produces is worse than the all-full-blocks construction it replaces.
 */

import {
  bandOfLane,
  synthesizeTreads,
  totalHalfWidth,
  type IntervalFeature,
  type SweptProfile,
} from "./sweep.js";

export type { IntervalFeature, ProfileBand, BandCap, SweptProfile } from "./sweep.js";

/* -------------------------------------------------------------------------- */
/* the bridge kit                                                             */
/* -------------------------------------------------------------------------- */

/** Columns of span between piers. See {@link BRIDGE_PROFILE}. */
export const BRIDGE_PIER_PITCH = 7;

/** Columns of bank the parapet carries past the last wet column. */
export const BRIDGE_APPROACH_RUN = 4;

/**
 * A crossing, as one cross-section.
 *
 * The widths are **relative**: `carriageway.width` is a placeholder the client
 * overrides with the road class's own lane width (see
 * {@link bridgeOffsets}), because a bridge carries whatever road reached it.
 * What the profile fixes is everything the two halves of the old kit disagreed
 * about — that the deck is one column wider each side than the lane, that the
 * rail runs on *that* extra column and not inboard of it, and that the pier,
 * the lamp and the pylon all hang off the same offset.
 */
export const BRIDGE_PROFILE: SweptProfile = {
  id: "bridge.masonry",
  bands: [
    { id: "carriageway", role: "carriageway", width: 4, centred: true, surface: "road.deck" },
    {
      id: "parapet",
      role: "parapet",
      width: 1,
      surface: "road.deck",
      cap: { height: 1, block: "road.post", rail: true },
    },
  ],
  maxGrade: 1,
  follow: "grade",
  features: [
    { id: "pier", pitch: BRIDGE_PIER_PITCH, at: "interval", offset: 0 },
    { id: "lamp", pitch: 11, at: "interval", offset: 0 },
    { id: "pylon", pitch: 0, at: "bend", offset: 0 },
  ],
  crossing: "bridge",
};

/**
 * {@link BRIDGE_PROFILE} resolved against the road width that reached the bank.
 *
 * A bridge carries whatever road arrived at it, so the carriageway band's width
 * is the one thing the profile cannot know in advance; everything outboard of
 * it is fixed.
 */
export function bridgeProfile(width: number): SweptProfile {
  return {
    ...BRIDGE_PROFILE,
    bands: BRIDGE_PROFILE.bands.map((band) =>
      band.role === "carriageway" ? { ...band, width } : band,
    ),
  };
}

/** The offsets a bridge of carriageway `width` occupies, in columns. */
export interface BridgeOffsets {
  /** Outermost carriageway column: the deck's inner extent per side. */
  readonly half: number;
  /** The parapet column — deck edge, rail, pier head, lamp and pylon alike. */
  readonly rail: number;
}

/**
 * Resolve {@link BRIDGE_PROFILE} against the road width that reached the bank.
 *
 * One function, two clients: `buildBridgeDeck` lays the deck and the piers,
 * `dressBridge` stands the pylons, lamps and balustrade — and because they now
 * read the same numbers out of the same profile they cannot disagree about
 * where the rail is again.
 */
export function bridgeOffsets(width: number): BridgeOffsets {
  const profile = bridgeProfile(width);
  return { half: (width - 1) >> 1, rail: Math.floor(totalHalfWidth(profile)) };
}

/** The band a lateral offset falls in, for a bridge of carriageway `width`. */
export function bridgeBandAt(width: number, offset: number) {
  const profile = bridgeProfile(width);
  if (Math.abs(offset) > totalHalfWidth(profile)) return undefined;
  return profile.bands[bandOfLane(profile, offset)];
}

/* -------------------------------------------------------------------------- */
/* the stair                                                                  */
/* -------------------------------------------------------------------------- */

/** A public flight: tread band, balustrade caps, lamp interval feature. */
export const STAIR_PROFILE: SweptProfile = {
  id: "stair.masonry",
  bands: [
    { id: "tread", role: "walkway", width: 5, centred: true, surface: "stone_bricks" },
    {
      id: "balustrade",
      role: "parapet",
      width: 1,
      surface: "stone_bricks",
      cap: { height: 1, block: "stone_brick_wall", rail: true },
    },
  ],
  maxGrade: 1,
  follow: "step",
  features: [{ id: "lamp", pitch: 4, at: "interval", offset: 0 }],
  crossing: "stop",
};

/* -------------------------------------------------------------------------- */
/* shared profile geometry                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Does an interval feature land at arc position `arc`?
 *
 * Phase-locked to the *start of the run*, per DESIGN §3 rule 5, which is what
 * makes pier rhythm and lamp spacing reproduce on recompile — and what stops
 * a bridge's lamps being counted from the far end of the road that reached it.
 */
export function featureHits(feature: IntervalFeature, arc: number): boolean {
  if (feature.pitch <= 0) return false;
  const phase = feature.phase ?? 0;
  return ((arc - phase) % feature.pitch + feature.pitch) % feature.pitch === 0;
}

/** Look a feature up by id. Throws on a typo rather than silently no-op-ing. */
export function featureOf(profile: SweptProfile, id: string): IntervalFeature {
  const found = profile.features?.find((f) => f.id === id);
  if (found === undefined) throw new Error(`profile ${profile.id} has no feature ${id}`);
  return found;
}

/* -------------------------------------------------------------------------- */
/* the tread law                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What the topmost course of a tread column is made of.
 *
 * - `"stair"` — the column ahead is one block higher. A stair block facing the
 *   direction of travel turns a 1.0 hop into two 0.5 steps.
 * - `"landing"` — a full block. The top of a flight, and the first tread.
 * - `"slab"` — a top slab: a half-step, only ever laid where the column ahead
 *   is at the *same* level, so a slab can never be followed by a 1.5 rise.
 */
export type TreadShape = "landing" | "stair" | "slab";

/**
 * The tread law: a mix of full blocks, stairs and slabs over a levelled flight.
 *
 * `need[k]` is the level a player stands *at* on column `k` (the fill occupies
 * `ground[k] .. need[k] − 1`), which is the same convention `seekFlight` and
 * `gradeProfile` already use. `ground[k]` is only consulted to know whether a
 * column carries any fill at all — a column the flight did not raise keeps its
 * own ground and is never dressed.
 *
 * Three rules, and the order matters:
 *
 * 1. Riser ahead of one block → `"stair"`.
 * 2. Flat ahead, but a block was climbed to get here → `"landing"`. So does
 *    the first column, so a flight always starts on something you can stand on
 *    squarely.
 * 3. Otherwise → `"slab"`: the flat interior of a run, dropped half a block,
 *    which is what breaks up the brick-patch look without moving a level.
 */
export function treadPlan(
  need: readonly number[],
  ground: readonly number[],
): TreadShape[] {
  const shapes: TreadShape[] = [];
  for (let k = 0; k < need.length; k++) {
    const level = need[k] as number;
    const courses = level - (ground[k] as number);
    if (courses <= 0) {
      shapes.push("landing");
      continue;
    }
    const ahead = k + 1 < need.length ? (need[k + 1] as number) - level : 0;
    const behind = k > 0 ? level - (need[k - 1] as number) : 1;
    shapes.push(ahead >= 1 ? "stair" : behind >= 1 ? "landing" : "slab");
  }
  return shapes;
}

/**
 * Synthesize a flight over raw ground and dress it, in one call.
 *
 * **The levels come from the engine.** `synthesizeTreads` owns the recurrence,
 * the reach test and the whole-run refusal; this adds only the decoration the
 * engine deliberately leaves to its clients. A refused run returns `null` and
 * the client builds nothing — half a staircase ending in a two-block hop is
 * worse than no staircase.
 */
export function synthesizeTreadPlan(
  ground: readonly number[],
  options: { readonly maxFill?: number; readonly reach?: number; readonly maxGrade?: number } = {},
): { readonly levels: readonly number[]; readonly shapes: readonly TreadShape[] } | null {
  const run = synthesizeTreads(ground, options);
  if (run.levels === null) return null;
  return { levels: run.levels, shapes: treadPlan(run.levels, ground) };
}

/**
 * The walking surfaces a tread plan produces, in half-blocks, as a pair per
 * column: what you *arrive* on and what you *depart* from.
 *
 * A stair's low half is where you land coming up and its high half is where you
 * push off; a top slab is half a block down on both counts; a full block is
 * neither. This is the model the climbability test asserts against, and it is
 * deliberately the pessimistic reading of a stair.
 */
export function treadSurfaces(
  need: readonly number[],
  shapes: readonly TreadShape[],
): { readonly arrive: number; readonly depart: number }[] {
  return need.map((level, k) => {
    const shape = shapes[k] as TreadShape;
    if (shape === "stair") return { arrive: level - 0.5, depart: level };
    if (shape === "slab") return { arrive: level - 0.5, depart: level - 0.5 };
    return { arrive: level, depart: level };
  });
}

/**
 * The largest step up a player must make anywhere along a dressed flight.
 *
 * ≤ 1.0 is the climbability contract: a block-high step is walkable in
 * Minecraft with a jump and is exactly what the undressed flight already
 * demanded, so the law is proven never to make a flight worse.
 */
export function worstRise(
  need: readonly number[],
  shapes: readonly TreadShape[],
): number {
  const surfaces = treadSurfaces(need, shapes);
  let worst = 0;
  for (let k = 1; k < surfaces.length; k++) {
    const rise = (surfaces[k]?.arrive as number) - (surfaces[k - 1]?.depart as number);
    if (rise > worst) worst = rise;
  }
  return worst;
}
