/**
 * `role: "steps"` — a street the tread law lays instead of the grader
 * (`docs/URBAN-FORMS-v0.md` §4.2).
 *
 * A `terraced` quarter's cross-contour connections are not roads with a steep
 * profile; they are flights of stairs, and the difference is the whole of
 * whether a hill town is walkable. So a steps segment is **not** graded by
 * `gradeProfile` — it is laid by {@link synthesizeTreadPlan} over the raw ground
 * of its own path and dressed with {@link STAIR_PROFILE}, which is the same code
 * the hillside set-piece stair uses.
 *
 * That buys four things this module deliberately does not reimplement:
 *
 * - the **tread law** — `need[k] = max(g[k] + 1, need[k+1] − 1)`, the backward
 *   pass that is the entirety of "no unclimbable riser";
 * - the **slab / stair / landing mix**, so a flight reads as masonry steps
 *   rather than as a patch of bricks;
 * - the profile's tread width, so a street stair reads as the same masonry the
 *   hillside set-piece stair is made of;
 * - **whole-run refusal.** A flight that cannot be made climbable is not built
 *   at all. Half a staircase ending in a two-block hop is worse than no
 *   staircase, and `traversal.unreachable` will find the bench that lost its
 *   only stair whether or not this module says anything.
 *
 * **What is deliberately not built in v0 is the balustrade and its lamps.** They
 * are the one part of `STAIR_PROFILE` that stands *above* the tread, and a
 * street stair shares its columns with the contour streets it joins: whichever
 * segment the surfacer reaches last owns the column, so a wall placed on top of
 * a tread can be left standing over a column another segment has since lowered.
 * The physics lint says so in `unsupported.chain`, and a floating balustrade is
 * a worse defect than a plain flight. It comes back with a rail that is emitted
 * after every segment is surfaced, which is a change to the surfacer's shape
 * rather than to this module.
 *
 * Like `surfaceRoute`, this mutates the column plan rather than emitting blocks
 * over the top of it, so the heightmap, the fluid validator and the biome pass
 * all keep looking at the same ground the player walks on. The stair and slab
 * blocks it *does* emit replace the top course of a column the flight itself
 * just levelled, so nothing here can float.
 */

import type { Region } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Point2 } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";

import type { StructureBlock } from "./buildings.js";
import { STAIR_PROFILE, synthesizeTreadPlan, type TreadShape } from "./profiles.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Most courses of masonry one column of a street stair may carry.
 *
 * A flight between two benches climbs one bench — four blocks — plus whatever
 * the ground under it does on the way. Twice that is generous and still refuses
 * the flight down a cliff, which is the case worth refusing.
 */
export const STREET_STAIR_MAX_FILL = 8;

/**
 * Columns of tread, from {@link STAIR_PROFILE}.
 *
 * Read lazily rather than at module scope: `roads.ts` imports this module and
 * `profiles.ts` is reached through the same cycle, so a top-level read of
 * `STAIR_PROFILE.bands` runs before the profile exists in some import orders.
 */
function treadWidth(): number {
  return STAIR_PROFILE.bands.find((b) => b.id === "tread")?.width ?? 5;
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** One flight to lay, and everything it is allowed to write into. */
export interface StreetStairInput {
  readonly region: Region;
  /** Mutated in place, exactly as `surfaceRoute` mutates it. */
  readonly plan: ColumnPlan;
  /** Columns no street may cut into — every building footprint. */
  readonly blocked: Uint8Array;
  /** 1 for a column the street pass surfaced; written here too. */
  readonly road: Uint8Array;
  /** The surfaced level of each road column; written here too. */
  readonly roadY: Int32Array;
  /** Columns some other pass already paved (a plaza, a green). */
  readonly paved: Uint8Array;
  /** Columns a bridge may span — a stair never crosses one. */
  readonly water: Uint8Array;
  /** The segment's centre line, 4-connected, already clipped to the region. */
  readonly path: readonly Point2[];
  /** The segment's declared carriageway width. */
  readonly width: number;
  /** Masonry states, from the street state set. */
  readonly states: { readonly step: number; readonly subsurface: number };
  readonly stack: PrismarineStack;
  readonly occupancy?: OccupancyGrid;
}

/** What a flight did, or the measured reason it was refused. */
export interface StreetStairResult {
  readonly built: boolean;
  readonly blocks: readonly StructureBlock[];
  /** Columns the flight levelled and surfaced. */
  readonly columns: number;
  /** Present when `built` is false: why, in the author's terms. */
  readonly refusedBecause?: string;
}

/** Nothing built, for a run that never had a chance. */
function refused(reason: string): StreetStairResult {
  return { built: false, blocks: [], columns: 0, refusedBecause: reason };
}

/**
 * Lay one flight of street stairs, or refuse the whole run.
 *
 * The levels are the engine's: `synthesizeTreadPlan` owns the recurrence, the
 * reach test and the refusal, and this function only decides what the topmost
 * course of each already-levelled column is made of and where the balustrade
 * goes. `need[k]` is the level a player *stands at*, so the topmost solid block
 * of column `k` is at `need[k] − 1` — the one place the two conventions meet,
 * stated once here.
 */
export function surfaceStreetStairs(input: StreetStairInput): StreetStairResult {
  const { region, plan, path } = input;
  const idx = (x: number, z: number): number => (z - region.z0) * region.width + (x - region.x0);
  const within = (x: number, z: number): boolean =>
    x >= region.x0 && z >= region.z0 && x < region.x0 + region.width && z < region.z0 + region.depth;

  const centre = path.filter((c) => within(c.x, c.z));
  if (centre.length < 4) return refused("the flight is shorter than four columns");

  // A stair is masonry on land. Water or a foreign footprint under the centre
  // line is not something a flight can be laid over, and half a flight is worse
  // than none — so the whole run goes.
  for (const cell of centre) {
    const k = idx(cell.x, cell.z);
    if (input.water[k] === 1 || plan.fluidKind[k] !== FluidKind.NONE) {
      return refused("the flight would cross water, which wants a bridge rather than a stair");
    }
    if (input.blocked[k] === 1) {
      return refused("the flight would cross a building footprint");
    }
  }

  // The *stand* level of each column: one above its topmost solid block, which
  // is the convention `synthesizeTreads` and `seekFlight` are both written in.
  const ground = centre.map((c) => (plan.ground[idx(c.x, c.z)] as number) + 1);
  const dressed = synthesizeTreadPlan(ground, {
    maxFill: STREET_STAIR_MAX_FILL,
    reach: 1,
    maxGrade: 1,
  });
  if (dressed === null) {
    return refused(
      `no flight of ${centre.length} columns climbs this bank within ${STREET_STAIR_MAX_FILL} courses of masonry`,
    );
  }

  const half = treadWidth() >> 1;
  // Never wider than the segment declared plus its balustrade: a lane-width
  // steps segment is three columns of tread, and the profile's five would eat
  // the verge either side of it.
  const tread = Math.min(half, (input.width - 1) >> 1);
  const rail = tread + 1;

  const blocks: StructureBlock[] = [];
  let columns = 0;

  for (const [k, cell] of centre.entries()) {
    const level = dressed.levels[k] as number;
    const shape = dressed.shapes[k] as TreadShape;
    const step = stepAt(centre, k);
    const facing = facingOf(step.dx, step.dz);
    // A 4-connected step's perpendicular is the other axis, exactly.
    const px = -step.dz;
    const pz = step.dx;

    for (let a = -rail; a <= rail; a++) {
      const x = cell.x + px * a;
      const z = cell.z + pz * a;
      if (!within(x, z)) continue;
      const k2 = idx(x, z);
      if (input.blocked[k2] === 1 || input.paved[k2] === 1) continue;
      if (input.water[k2] === 1 || plan.fluidKind[k2] !== FluidKind.NONE) continue;

      const top = level - 1;
      plan.ground[k2] = top;
      plan.fluidTop[k2] = top;
      plan.snow[k2] = 0;
      plan.surface[k2] = input.states.step;
      plan.subsurface[k2] = input.states.subsurface;
      if (plan.soil[k2] === 0) plan.soil[k2] = 1;
      input.road[k2] = 1;
      input.roadY[k2] = top;
      if (input.occupancy !== undefined) {
        input.occupancy.mask[k2] = 1;
      }
      columns++;

      // The rail columns are levelled with the flight — a verge either side, so
      // the bank does not poke through the edge of the stair — but nothing is
      // *stood* on them. See the note on {@link surfaceStreetStairs} about why
      // the balustrade and its lamps are not built in v0.
      if (Math.abs(a) === rail) continue;

      // The tread law's mix, laid *into* the top course rather than on top of
      // it: a stair block where the column ahead is a block higher, a top slab
      // on the flat interior of a run, and a plain full block at a landing.
      // Everything here replaces a block the flight itself just laid, at the
      // level the flight itself just set, so nothing can be left floating by a
      // later pass that lowers the column — which is precisely what a course
      // *above* the tread could not promise.
      const dressing =
        shape === "stair"
          ? input.stack.blockStateOf("stone_brick_stairs", {
              facing,
              half: "bottom",
              shape: "straight",
              waterlogged: "false",
            })
          : shape === "slab"
            ? input.stack.blockStateOf("stone_brick_slab", {
                type: "top",
                waterlogged: "false",
              })
            : undefined;
      if (dressing !== undefined) blocks.push({ x, y: top, z, stateId: dressing });
    }
  }

  return { built: true, blocks, columns };
}

/* -------------------------------------------------------------------------- */
/* geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** The unit step taken at column `k` — the last column reuses the one before. */
function stepAt(path: readonly Point2[], k: number): { readonly dx: number; readonly dz: number } {
  const a = path[Math.min(k, path.length - 2)] as Point2;
  const b = path[Math.min(k + 1, path.length - 1)] as Point2;
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  // A densified path never steps diagonally; if one ever did, keep the x axis so
  // the flight leans the same way along its whole length.
  return dx !== 0 ? { dx, dz: 0 } : { dx: 0, dz: dz === 0 ? 1 : dz };
}

/** The cardinal name of a unit step, for a stair's `facing`. */
function facingOf(dx: number, dz: number): string {
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dz > 0 ? "south" : "north";
}
