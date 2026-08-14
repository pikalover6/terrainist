/**
 * The **nautical & pirate pack's buildings** — the two entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.2 in the table's second half that have an
 * inside rather than a footprint on the quay.
 *
 * The pack's thesis is that the catalog has an excellent fleet and almost no
 * *shore*, and these two are the shore's working buildings:
 *
 * - `salt_house` — the store beside the salt pans: white heaps in bays down
 *   both walls, a raked lane between them, wide low doors;
 * - `treadwheel_crane` — the harbour crane, which is a **silhouette**: the
 *   great wheel standing in the middle of a timber housing, the jib running
 *   out over the floor from its head, and the fall hanging off the end of it.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it without restating it:
 * an archetype is a **fit-out**, not a second grammar. Everything here runs
 * after the shape stages and writes into the same cell map. Not a line of
 * `core.ts` moves for either of them, and — unlike the classical pack — this
 * file does no exterior work at all: it never writes above the eave plate,
 * never touches the wall ring, and never puts a block in the apron. That is
 * the cheapest possible answer to the rule that a slab in the apron with
 * nothing under it is `floating.isolated`.
 *
 * ## The rules, inherited from every earlier wave and paid for there
 *
 * 1. **Everything goes through {@link PropCounter}**, which routes through the
 *    ground floor's own `free` and `take` — the door approach, the stair
 *    columns, the connectivity guard and the blocked-column guard, none of
 *    them restated here. There is not one `raw` call in this file.
 * 2. **The wheel is 4-connected.** A wheel drawn as an annulus of "cells near
 *    the radius" steps diagonally, and a bone of it that steps diagonally is a
 *    full cube with six air faces. {@link WHEEL_RING} is therefore an explicit
 *    closed loop in which every cell is orthogonally adjacent to the next, and
 *    the same property is what carries the load down to the floor.
 * 3. **The jib is continuous** and the fall stops at `y = 2`: a rope run down
 *    to the floor would take a walkable cell out of the middle of the room for
 *    no read at all.
 * 4. **The wheel is conditional.** It needs five clear courses and a room wide
 *    enough to walk round it; on a tight envelope the crane gets a windlass
 *    instead, and on a very tight one it gets its cargo and its tools. A
 *    fit-out that assumed its envelope is the oldest bug in the catalog.
 * 5. **No sign blocks**, no bare `flower_pot`, no lantern (the shell hangs the
 *    room's one light and the lint's rule fires on the name), and `cauldron`
 *    takes no properties.
 * 6. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position.
 */

import { PropCounter, type FitOutContext } from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The two archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`, straight after the
 * agrarian pack, and mirrored in the same order by the spec package's
 * `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element by
 * element, so it is load-bearing in both places.
 */
export const BRINE_BUILDING_ARCHETYPES = ["salt_house", "treadwheel_crane"] as const;

/** One of the archetypes this file fits out. */
export type BrineBuildingArchetype = (typeof BRINE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isBrineArchetype(value: string): value is BrineBuildingArchetype {
  return (BRINE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the agrarian table and well before the extended
 * one. This pack claims **only words derived from its own two ids and their
 * catalog notes**, and the deliberate non-claims are the point of this
 * comment — every one of them is a word an earlier table or a plainer building
 * has the better claim to:
 *
 * - bare **`crane`** is left unclaimed. A crane is a machine, not a building,
 *   and a document that says `crane` on a modern dock wants a gantry rather
 *   than a medieval timber housing; the harbour crane therefore answers to
 *   `treadwheel_crane` and `harbour_crane` only;
 * - bare **`salt`** is not claimed either — `salt_pans` is Track A's and is a
 *   *field*, not a store, so this building takes `salt_house`, `salt_store`
 *   and `saltern` and leaves the bare word where it is;
 * - **`warehouse`**, **`store`** and **`storehouse`** stay the warehouse's, on
 *   the same principle: a salt house is a warehouse with a subject, and the
 *   subject has to be said;
 * - **`shipyard`**, **`boathouse`**, **`dock`**, **`wharf`**, **`quay`** and
 *   **`harbour`** are not here at all. The first two are buildings the catalog
 *   already ships and the rest are the linework engine's or the layout's, not
 *   an archetype's.
 */
export function brineArchetypeOfTags(tags: readonly string[]): BrineBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("salt_house") || has("salt_store") || has("saltern")) return "salt_house";
  if (has("treadwheel_crane") || has("harbour_crane")) return "treadwheel_crane";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * - the **salt house** keeps the weather out of a hygroscopic cargo, so it
 *   asks for a `gable` and the sparsest possible openings — a salt store with
 *   a rank of windows is a salt store with wet salt in it;
 * - the **treadwheel crane** is a silhouette with a hole in one end for the
 *   load: `gable` again, and **no** windows at all, because every opening in
 *   its face competes with the one that matters.
 */
export function brineFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "salt_house":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "treadwheel_crane":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
export function furnishBrine(ctx: FitOutContext): number {
  if (!isBrineArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "salt_house":
      fitSaltHouse(ctx, c);
      break;
    case "treadwheel_crane":
    default:
      fitTreadwheelCrane(ctx, c);
      break;
  }
  return c.n;
}

/**
 * How many courses of clear air this storey actually has.
 *
 * On one floor the room runs to the eave plate; on more than one it stops at
 * the boards over it, and a fit-out that measured the first and built into the
 * second would put its ironmongery through somebody's floor.
 */
function headroomOf(ctx: FitOutContext): number {
  return ctx.floors > 1 ? ctx.storyHeight - 1 : ctx.wallTop - 1;
}

/* -------------------------------------------------------------------------- */
/* the salt house                                                              */
/* -------------------------------------------------------------------------- */

/** The white of a salt heap, banded so a bay reads as a heap rather than a wall. */
function saltHeap(x: number, z: number): string {
  return (x * 3 + z * 5) % 4 === 0 ? "calcite" : "white_concrete";
}

/**
 * `salt_house` — the store beside the pans, and the only white interior in the
 * pack.
 *
 * Bays down both long walls with a divider between each pair, the salt heaped
 * in them — one course against the wall and a second where the heap is
 * deepest, which is what gives it a *shape* instead of a shelf — and the raked
 * lane down the middle, in carpet so a body still walks it. A shovel and a
 * measure stand at the end of the lane.
 *
 * The middle of the floor is deliberately empty. A salt house is a room whose
 * whole content is against the walls, which is both true of the building and
 * the cheapest way to keep the ground floor one region on every envelope.
 */
function fitSaltHouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const midZ = Math.floor((it.z0 + it.z1) / 2);

  // The bays, down both long walls.
  for (const z of [it.z0, it.z1]) {
    if (z === midZ) continue; // a one-cell-deep room is a lane, not a store
    for (let x = it.x0; x <= it.x1; x++) {
      if ((x - it.x0) % 4 === 3) {
        // The divider between one bay and the next.
        c.put1(x, z, fence, {
          east: "false",
          north: "false",
          south: "false",
          waterlogged: "false",
          west: "false",
        });
        continue;
      }
      if (!c.put1(x, z, saltHeap(x, z))) continue;
      // The crown of the heap, where the bay is deepest.
      if ((x - it.x0) % 4 === 1) c.stack(x, z, 2, saltHeap(x, z + 1));
    }
  }

  // The raked lane down the middle — carpet, so the floor stays walkable.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.put1(midX, z, "light_gray_carpet");

  // The tools at the head of the lane: the measure, and a barrow of coarse salt.
  c.put1(it.x0, midZ, "cauldron");
  c.put1(it.x1, midZ, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* the treadwheel crane                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The great wheel, as a **closed 4-connected loop** in the x–y plane.
 *
 * Offsets from the hub, `[dx, dy]`. Read them round and every step is one cell
 * north, south, east or west of the last — which is the difference between a
 * wheel and a dozen bones hanging in the air with six air faces each. It is
 * also why the loop is sixteen cells rather than the twelve a circle of radius
 * two would suggest: the four "corner" cells are the connectors.
 *
 * There is deliberately **no hub**: a block at the centre of a ring of radius
 * two has nothing but diagonal neighbours, and a spoke out to the rim would
 * fill the columns either side of the axis from the floor to the ceiling,
 * which is `interior.blocked_column`. The wheel is a rim, and it reads as one.
 */
const WHEEL_RING: readonly (readonly [number, number])[] = [
  [-1, -2],
  [0, -2],
  [1, -2],
  [1, -1],
  [2, -1],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [-1, 2],
  [-1, 1],
  [-2, 1],
  [-2, 0],
  [-2, -1],
  [-1, -1],
];

/**
 * The small wheel — the same machine in a room with a lower ceiling.
 *
 * The eight cells round a 3x3 square, which is the smallest closed loop that
 * is 4-connected all the way round. Three courses instead of five, so it fits
 * wherever the storey leaves four clear.
 */
const WHEEL_RING_SMALL: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

function fitTreadwheelCrane(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const log = style["wall.accent"] as string;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const midZ = Math.floor((it.z0 + it.z1) / 2);
  const head = headroomOf(ctx);
  const wide = it.x1 - it.x0 >= 6;
  const deep = it.z1 - it.z0 >= 4;

  // The cargo, always: the load on the quay floor beside the machine.
  c.put1(it.x0, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, it.z1, "cauldron");

  // The wheel stands in the **back row** of the room, against the wall. It has
  // to: a wheel with a row of floor behind it walls that row off — its cells at
  // head height block a body even where the floor under them is clear, and a
  // walled-off row is a pocket. That is what the 9x9 envelope found.
  const wz = it.z0;

  /**
   * Where along that wall the wheel can actually stand.
   *
   * The middle of the back wall is where the shell puts the **hearth**, so the
   * obvious answer — centre it — is the one answer that is reserved on most
   * envelopes. This walks outward from the middle and takes the first bay
   * whose three foot cells are free and whose rim still fits between the
   * corners; `null` means the room has no bay for a wheel, and the crane gets
   * the windlass instead.
   */
  const wheelX = (reach: number): number | null => {
    for (let d = 0; d <= it.x1 - it.x0; d++) {
      for (const x of d === 0 ? [midX] : [midX - d, midX + d]) {
        if (x - reach < it.x0 || x + reach > it.x1) continue;
        let clear = true;
        for (let dx = -reach; dx <= reach && clear; dx++) clear = ctx.free(x + dx, wz);
        if (!clear) continue;
        return x;
      }
    }
    return null;
  };

  /**
   * Build one wheel, its jib and its fall.
   *
   * `top` is the course the rim reaches and the course the jib runs at, so the
   * jib comes out of the wheel's head rather than out of the air beside it.
   * The fall stops at `y = 2`: a rope to the floor takes a cell out of the room
   * and reads no better for it.
   */
  const wheel = (
    wx: number,
    ring: readonly (readonly [number, number])[],
    hubY: number,
    top: number,
  ): void => {
    for (const [dx, dy] of ring) {
      const x = wx + dx;
      const y = hubY + dy;
      if (y === 1) c.put1(x, wz, log, { axis: "z" });
      else c.stack(x, wz, y, log, { axis: "z" });
    }
    for (let z = wz + 1; z <= it.z1; z++) c.stack(wx, z, top, log, { axis: "z" });
    for (let y = top - 1; y >= 2; y--) {
      c.stack(wx, it.z1, y, "iron_bars", {
        east: "false",
        north: "true",
        south: "true",
        waterlogged: "false",
        west: "false",
      });
    }
  };

  const bigBay = wide && deep && head >= 5 ? wheelX(2) : null;
  if (bigBay !== null) {
    wheel(bigBay, WHEEL_RING, 3, 5);
    return;
  }
  const smallBay = deep && it.x1 - it.x0 >= 4 && head >= 4 ? wheelX(1) : null;
  if (smallBay !== null) {
    wheel(smallBay, WHEEL_RING_SMALL, 2, 3);
    return;
  }

  // No room for a rim: the windlass, which is the same machine at a smaller
  // port. It needs a fourth clear course over it — three posts' worth of
  // column with a ceiling on it is `interior.blocked_column`.
  if (head >= 4 && it.x1 - it.x0 >= 2) {
    for (const x of [midX - 1, midX + 1]) {
      c.put1(x, midZ, fence, {
        east: "false",
        north: "false",
        south: "false",
        waterlogged: "false",
        west: "false",
      });
      c.stack(x, midZ, 2, fence, {
        east: "false",
        north: "false",
        south: "false",
        waterlogged: "false",
        west: "false",
      });
    }
    for (let x = midX - 1; x <= midX + 1; x++) {
      c.stack(x, midZ, 3, "stripped_oak_log", { axis: "x" });
    }
    return;
  }

  // Too small for either machine: the crane's gear, ranked against the wall.
  for (let x = it.x0; x <= it.x1; x += 2) {
    c.put1(x, it.z0, "barrel", { facing: "up", open: "false" });
  }
}
