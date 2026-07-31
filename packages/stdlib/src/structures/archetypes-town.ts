/**
 * Archetype breadth, the **town wave** — the three civic buildings a village
 * gets once it stops being a hamlet.
 *
 * `archetypes.ts` owns the original six and the tag table; `archetypes-civic.ts`
 * owns the seven rural/civic ones, the walkability guard and the two exterior
 * flourishes; `archetypes-blitz.ts` owns the ten-domain breadth wave. This file
 * owns a deliberately *narrow* set with one thing in common — they are the
 * buildings a town square is made of: a town hall, a school, a bathhouse.
 *
 * ## Why these are fit-outs and not a second grammar
 *
 * The law `archetypes-blitz.ts` states, restated because this file obeys it
 * exactly: **an archetype is a fit-out, not a second grammar.** A fit-out runs
 * after every shape stage — foundation, walls, windows, floors, roof, chimney —
 * and writes into the same cell map they did, where a later write to a cell
 * replaces an earlier one. So a town hall is not a new shell: it is the house
 * grammar with masonry trim carried up its corners, a clock-and-bell gable over
 * the front bay, and a council chamber inside. A school is the same shell with
 * a dark board across one end wall and rows of desks facing it. A bathhouse is
 * the same shell clad in smooth stone with water written *into* its floor
 * plane.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — the door approach, the stair columns, the hearth reserve and
 *    the connectivity guard, none of them restated here.
 *
 * ## And one rule this file adds
 *
 * 3. **Water is boxed in by construction.** The bathhouse's pools are written
 *    at the floor plane `y = 0`, inset at least one cell from the interior's
 *    own edge. Below every water cell is the foundation skirt, which the shell
 *    lays under the whole footprint; beside every water cell is either more
 *    pool or a floor cell the shell has already made solid. That is exactly the
 *    predicate the compiler's fluid-stability check re-derives, so the physics
 *    lint's zero-unstable-fluids rule holds without a single special case
 *    downstream.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The three archetypes this file fits out, in civic order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`. `town_hall` is the one
 * with a roadmap obligation attached: G5's acceptance sentence wants a tunnel
 * running from the church to the town hall, and a tunnel needs both ends to be
 * buildings that exist.
 */
export const TOWN_BUILDING_ARCHETYPES = ["town_hall", "school", "bathhouse"] as const;

/** One of the archetypes this file fits out. */
export type TownBuildingArchetype = (typeof TOWN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isTownArchetype(value: string): value is TownBuildingArchetype {
  return (TOWN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the breadth table and *before* the extended one, for the
 * reason every table here goes before the ones under it: the older tables are
 * greedy. Bare `hall` belongs to the original table and stays there — a
 * document that says `hall` means a great hall — so this table claims only the
 * compounds that unambiguously name a seat of local government.
 */
export function townArchetypeOfTags(tags: readonly string[]): TownBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("town_hall") || has("townhall") || has("moot_hall") || has("city_hall")) {
    return "town_hall";
  }
  if (has("school") || has("schoolhouse") || has("academy")) return "school";
  if (has("bathhouse") || has("baths") || has("sauna") || has("hammam")) return "bathhouse";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `blitzFacadeDefaults`: defaults a caller merges into its
 * params, never something applied over an explicit one.
 */
export function townFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // Tall paired lights and a gable the clock gable can sit in front of: a
    // town hall is a civic face before it is a room.
    case "town_hall":
      return { windowShape: "tall", windowRhythm: "paired", roof: "gable" };
    // A classroom wants daylight on every bay — regular, and nothing clever.
    case "school":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // High small openings: steam wants to stay in, and a bather does not want
    // to be looked at.
    case "bathhouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What exterior work needs to know, or `null` when it may not run.
 *
 * The blitz file's {@link ExteriorPlan} in miniature, and deliberately a local
 * copy rather than an import of a private helper: the two conditions are the
 * same, and both are refusals rather than approximations. The plan has to be a
 * **plain rect** — every routine below reasons about one box, and an L has a
 * reflex corner none of them has a rule for — and a roof flourish additionally
 * needs **room**, at least three courses between the eave plate and the ceiling
 * it may reach.
 */
interface TownPlan {
  /** Envelope extents. */
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
  /** The footprint, as an inclusive rect. */
  readonly rect: LocalRect;
}

/** The plan for work on the walls. No headroom condition: a re-clad needs none. */
function wallPlan(ctx: FitOutContext): TownPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  // A plain rect, and nothing else: the interior of one is exactly the box
  // inset by one on all four sides.
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return {
    sx,
    sz,
    base: ctx.wallTop + 1,
    top: ctx.roofTop + ROOF_FLOURISH_RISE,
    rect: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 },
  };
}

/**
 * Blocks a re-clad may never overwrite.
 *
 * The blitz list — the way in, the way up, the fire, the lights — plus the
 * **glazing**: every archetype here re-clads a wall it deliberately left
 * windows in, and a trim course that swallowed a pane would give a town hall
 * blind walls at exactly the height its tall lights sit.
 */
const KEEP_AS_IS = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|_pane$|glass$)/;

/** The masonry mix the trims draw from — the shell's own stone palette. */
function masonry(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (x, y, z) => ((x * 7 + y * 13 + z * 5) % 6 === 0 ? accent : primary);
}

/** The footprint perimeter of a rect plan, in canonical (z, x) order. */
function ringOf(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      if (x === 0 || x === sx - 1 || z === 0 || z === sz - 1) out.push({ x, z });
    }
  }
  return out;
}

/**
 * Write a block on a wall-ring cell, unless what stands there is load-bearing.
 *
 * Returns whether it landed, so the caller's count is the count of cells it
 * actually changed rather than the count of cells it looked at.
 */
function clad(ctx: FitOutContext, x: number, y: number, z: number, block: string): boolean {
  const standing = ctx.blockAt(x, y, z);
  if (standing !== undefined && KEEP_AS_IS.test(standing.block)) return false;
  ctx.put(x, y, z, block);
  return true;
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count,
 * so `meta.furnitureCount` keeps meaning "things this building has in it".
 * Zero, and not one cell touched, for anything that is not ours.
 */
export function furnishTown(ctx: FitOutContext): number {
  if (!isTownArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "town_hall":
      fitTownHall(ctx, c);
      break;
    case "school":
      fitSchool(ctx, c);
      break;
    case "bathhouse":
    default:
      fitBathhouse(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* town hall                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The dignified trim: masonry plinth, masonry quoins, a stone band at the eave.
 *
 * Three courses of work and no more, because that is what "dignified" costs. A
 * building whose whole wall is re-clad is a keep; a building with a stone
 * plinth, stone corners and a string course under the eave is a civic building
 * in a village of timber ones, which is exactly the read wanted.
 */
function trimWalls(ctx: FitOutContext, plan: TownPlan, c: PropCounter): void {
  const stone = masonry(ctx);
  for (const cell of ringOf(plan.sx, plan.sz)) {
    const corner =
      (cell.x === 0 || cell.x === plan.sx - 1) && (cell.z === 0 || cell.z === plan.sz - 1);
    for (let y = 1; y <= ctx.wallTop; y++) {
      // The plinth (two courses), the quoins (the full height of a corner) and
      // the string course under the plate. Everything else stays as the shell
      // built it.
      const band = y <= 2 || y === ctx.wallTop || corner;
      if (!band) continue;
      if (clad(ctx, cell.x, y, cell.z, stone(cell.x, y, cell.z))) c.n++;
    }
  }
}

/**
 * The clock-and-bell gable, on the church steeple's precedent.
 *
 * A 3 × 3 shaft over the *front* bay, a solid cap, a bell hung from the cap and
 * a clock face of quartz on the shaft's front. It stands entirely above
 * `wallTop`, so it cannot take an interior cell from the fit-out, the stair or
 * the hearth; its plan stays inside the footprint and its head stays within
 * {@link ROOF_FLOURISH_RISE} of the roof. Refused outright on a plan too small
 * or too flat to carry one — a gable that has to overshoot is a building that
 * lied about its size.
 */
function emitClockGable(ctx: FitOutContext, plan: TownPlan, c: PropCounter): number {
  if (plan.sx < 7 || plan.sz < 7) return 0;
  if (plan.top - plan.base < 3) return 0;
  const before = c.n;

  const mx = plan.sx >> 1;
  // The front bay, not the middle: a clock a visitor has to walk round the
  // building to read is not a public clock.
  const mz = 2;
  const wall = ctx.style["wall.primary"] as string;
  const frame = ctx.style["wall.frame"] as string;
  const stone = masonry(ctx);

  for (let y = plan.base; y < plan.top; y++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const corner = dx !== 0 && dz !== 0;
        // The louvre band, where the bell hangs: open fence on the faces.
        const louvre = !corner && y >= plan.top - 1;
        c.raw(
          mx + dx,
          y,
          mz + dz,
          louvre ? (ctx.style["wall.fence"] as string) : corner ? frame : wall,
          corner ? { axis: "y" } : undefined,
        );
      }
    }
  }
  // The cap, in the shell's own stone, and the bell under it. `attachment:
  // ceiling` names the block above the bell, which the cap has just supplied.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      c.raw(mx + dx, plan.top, mz + dz, stone(mx + dx, plan.top, mz + dz));
    }
  }
  c.raw(mx, plan.top - 1, mz, "bell", { facing: "north", attachment: "ceiling", powered: "false" });
  // The dial: a pale face on the front of the shaft, one course under the
  // louvres, with a dark centre so it reads as a clock and not as a window.
  const dialY = plan.top - 2;
  if (dialY >= plan.base) {
    c.raw(mx, dialY, mz - 1, "quartz_block");
    if (mx - 1 >= 0) c.raw(mx - 1, dialY, mz - 1, "chiseled_quartz_block");
    if (mx + 1 < plan.sx) c.raw(mx + 1, dialY, mz - 1, "chiseled_quartz_block");
  }
  return c.n - before;
}

/**
 * `town_hall` — the council chamber and the clock over it.
 *
 * Inside, the shape of local government: a long table down the middle on
 * trestles, benches turned in along both sides of it, a lectern at the head
 * where the business is read out, banners high on the end wall, and the
 * chest of records in the corner. Outside, the trim and the gable — which
 * together are the whole difference between a town hall and a large cottage.
 */
function fitTownHall(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    trimWalls(ctx, plan, c);
    emitClockGable(ctx, plan, c);
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const fence = ctx.style["wall.fence"] as string;
  const chair = ctx.style["stair.interior"] as string;
  // The head of the chamber is the end furthest from the door, so a visitor
  // walks in facing the bench.
  const headNorth = ctx.door === null || ctx.door.z > (it.z0 + it.z1) / 2;
  const headZ = headNorth ? it.z0 : it.z1;

  // The council table: trestles with a plate for a top, down the middle,
  // stopping one short of the head so the lectern has somewhere to stand.
  const from = headNorth ? it.z0 + 2 : it.z0 + 1;
  const to = headNorth ? it.z1 - 1 : it.z1 - 2;
  for (let z = from; z <= to; z++) {
    if (c.put1(mid, z, fence)) c.stack(mid, z, 2, "oak_pressure_plate", { powered: "false" });
  }
  // Benches either side, turned in on the table. A stair-chair's `facing` is
  // the direction of its high half — the backrest — so it points AWAY from
  // the thing the sitter faces.
  for (let z = from; z <= to; z += 2) {
    c.put1(mid - 1, z, chair, { facing: "west", half: "bottom", shape: "straight" });
    c.put1(mid + 1, z, chair, { facing: "east", half: "bottom", shape: "straight" });
  }
  // The lectern at the head, facing down the table.
  c.put1(mid, headZ, "lectern", {
    facing: headNorth ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  // The records: a chest and a bookshelf in the corners behind the bench.
  c.put1(it.x0, headZ, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, headZ, "bookshelf");
  c.put1(it.x0, headNorth ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
  // Banners high on the wall behind the head of the table — out of the way of
  // the floor entirely, so they cost the room nothing.
  const bannerY = Math.min(4, ctx.storyHeight - 1);
  for (const bx of [mid - 1, mid + 1]) {
    if (bx < it.x0 || bx > it.x1) continue;
    c.raw(bx, bannerY, headZ, "blue_banner", { rotation: "8" });
  }
}

/* -------------------------------------------------------------------------- */
/* school                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `school` — desks in rows, a board on the end wall, a bell over the door.
 *
 * The read is repetition and direction: every desk faces the same way, and the
 * way they face is a wall that is darker than every other wall in the building.
 * The desks are the oldest two-block furniture there is — a stair for the seat
 * and a slab-topped trestle for the writing surface — laid in rows with an
 * aisle between them so the room stays one region without the guard having to
 * refuse anything.
 */
function fitSchool(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const plan = wallPlan(ctx);
  // The board is on the end furthest from the door: a class faces away from
  // the way in.
  const boardNorth = ctx.door === null || ctx.door.z > (it.z0 + it.z1) / 2;
  const boardZ = boardNorth ? it.z0 : it.z1;
  // Seat facing: the backrest (a stair's `facing` side) points AWAY from the
  // board the class faces.
  const facing: Cardinal = boardNorth ? "south" : "north";

  if (plan !== null) {
    // The board: the interior face of the end wall, gone dark, between the
    // plinth and head height. The wall ring cell is one outside the interior.
    const wallZ = boardNorth ? it.z0 - 1 : it.z1 + 1;
    const topY = Math.min(4, ctx.wallTop - 1);
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 2; y <= topY; y++) {
        if (clad(ctx, x, y, wallZ, "black_concrete")) c.n++;
      }
    }
    // The bell cote over the front bay: a modest one, a course of stone with
    // the bell hung under it, and nothing else.
    const bellY = ctx.roofTop + ROOF_FLOURISH_RISE;
    if (bellY - (ctx.wallTop + 1) >= 2 && plan.sx >= 5) {
      const mx = plan.sx >> 1;
      const mz = boardNorth ? plan.sz - 2 : 1;
      c.raw(mx, bellY, mz, ctx.style["foundation.accent"] as string);
      c.raw(mx, bellY - 1, mz, "bell", {
        facing: "north",
        attachment: "ceiling",
        powered: "false",
      });
    }
  }

  // The desks. Rows across the room, two cells apart so a child can get out
  // of one, with the three middle columns left as the aisle to the board.
  // Three, not one: the shell hangs its ceiling light over the room's centre
  // — one of the two middle columns, by width parity — and in a three-course
  // storey the lantern sits at head height, where a desk row under a low
  // ceiling cannot be stepped over. A one-column aisle that guessed wrong ran
  // straight into the lantern, and a two-column aisle still left a sealed
  // pocket where the lantern's row met the desks beside it. Three columns
  // always leave two clear ones past the light, whichever cell it hangs in.
  // And a clear lane one cell wide runs around the whole field, inside the
  // walls: the shell's stair reserve and hearth breast refuse desk cells, and
  // a refusal inside a wall-to-wall field left sealed air pockets the walking
  // agent flagged. With the perimeter lane every gap in the field connects
  // around it, whatever the shell happened to refuse.
  const centre = Math.floor((it.x0 + it.x1) / 2);
  const aisle = Math.max(it.x0, centre - 1);
  const inAisle = (x: number): boolean => x >= aisle && x <= centre + 1;
  const xFirst = it.x0 + 1;
  const xLast = it.x1 - 1;
  const first = boardNorth ? it.z0 + 2 : it.z0 + 1;
  const last = boardNorth ? it.z1 - 1 : it.z1 - 2;
  const slabBlock = ctx.style["stone.slab"] as string;
  const seat = ctx.style["stair.interior"] as string;
  for (let z = first; z <= last; z += 2) {
    for (let x = xFirst; x <= xLast; x++) {
      if (inAisle(x)) continue;
      // The desk: a slab on the floor plane's own level, which reads as a
      // writing surface rather than as a block in the way.
      if (!c.put1(x, z, slabBlock, { type: "bottom", waterlogged: "false" })) continue;
    }
    // The seats: one row behind the desks, facing the board.
    const seatZ = boardNorth ? z + 1 : z - 1;
    if (seatZ < it.z0 || seatZ > it.z1) continue;
    for (let x = xFirst; x <= xLast; x += 2) {
      if (inAisle(x)) continue;
      c.put1(x, seatZ, seat, { facing, half: "bottom", shape: "straight" });
    }
  }

  // The master's end: a lectern facing the class, a bookshelf and the chest of
  // slates beside it.
  c.put1(aisle, boardZ, "lectern", {
    facing: boardNorth ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x0, boardZ, "bookshelf");
  c.put1(it.x1, boardZ, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, boardNorth ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* bathhouse                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The pool rect: the interior, inset one cell on every side.
 *
 * `null` when the room is too small to hold a pool and still have a walkway
 * round it, which on a plan this grammar builds means anything under five by
 * five of interior. A bath you have to stand in to walk past is not a bath.
 */
function poolRect(it: LocalRect): LocalRect | null {
  const rect = { x0: it.x0 + 1, z0: it.z0 + 1, x1: it.x1 - 1, z1: it.z1 - 1 };
  if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1) return null;
  return rect;
}

/**
 * `bathhouse` — pools sunk into the floor, smooth walls, steam and benches.
 *
 * The water is the building, and the way it is written is the whole of the
 * fluid safety argument: it goes **into the floor plane** at `y = 0`, in a rect
 * inset one cell from the interior, so
 *
 * - under every water cell is the foundation skirt the shell laid under the
 *   whole footprint;
 * - beside every water cell, on all four sides, is either more pool or a floor
 *   cell the shell has already written solid.
 *
 * Nothing about that depends on the terrain, the theme or the seed, so it is
 * true for every bathhouse this grammar will ever build. The cells above the
 * water stay clear — no prop is ever placed on a pool cell — so the room is
 * walkable in the only sense that matters: you can get everywhere, and where
 * the floor is water you get wet.
 */
function fitBathhouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const plan = wallPlan(ctx);
  if (plan !== null) {
    // Smooth stone and quartz, above the plinth: a bathhouse is the one
    // building in a village whose walls are meant to look wiped down.
    for (const cell of ringOf(plan.sx, plan.sz)) {
      for (let y = 2; y <= ctx.wallTop; y++) {
        const block = (cell.x * 3 + y * 5 + cell.z * 7) % 5 === 0 ? "quartz_block" : "smooth_stone";
        if (clad(ctx, cell.x, y, cell.z, block)) c.n++;
      }
    }
  }

  const pool = poolRect(it);
  const inPool = (x: number, z: number): boolean =>
    pool !== null && x >= pool.x0 && x <= pool.x1 && z >= pool.z0 && z <= pool.z1;

  if (pool !== null) {
    // The divider: a course of the coping down the middle of a wide pool, so a
    // large room reads as a hot bath and a cold one rather than as a pond.
    const divider = pool.z1 - pool.z0 >= 3 ? Math.floor((pool.z0 + pool.z1) / 2) : null;
    for (let z = pool.z0; z <= pool.z1; z++) {
      for (let x = pool.x0; x <= pool.x1; x++) {
        if (z === divider) {
          ctx.put(x, 0, z, ctx.style["stone.slab"] as string, {
            type: "top",
            waterlogged: "false",
          });
          c.n++;
          continue;
        }
        ctx.put(x, 0, z, "water", { level: "0" });
        c.n++;
      }
    }
  }

  // The coping: a ring of dressed stone written into the floor plane around
  // the water, which is what turns a hole full of water into a bath.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (inPool(x, z)) continue;
      const beside =
        inPool(x + 1, z) || inPool(x - 1, z) || inPool(x, z + 1) || inPool(x, z - 1);
      if (!beside) continue;
      ctx.put(x, 0, z, "smooth_stone");
      c.n++;
    }
  }

  // The steam: braziers on pedestals carved out of the pool's own corners —
  // a coping post rising from the water with a campfire on top. Deliberately
  // NOT on the walkway: the pool is inset one cell, so the walkway around it
  // is always one cell wide, and a body-blocking prop on a one-wide ring cuts
  // it — the walking agent found whole arcs of small bathhouses unreachable.
  // A pool cell is never walkable anyway, so a pedestal there costs nothing,
  // and replacing a water corner with solid stone keeps every remaining water
  // cell bounded by solid or water — the fluid argument is unchanged.
  if (pool !== null) {
    const pedestal = (px: number, pz: number, top: string, props?: Record<string, string>): void => {
      ctx.put(px, 0, pz, "smooth_stone");
      ctx.put(px, 1, pz, top, props);
      c.n += 2;
    };
    pedestal(pool.x0, pool.z0, "campfire", {
      lit: "true",
      signal_fire: "false",
      facing: "north",
      waterlogged: "false",
    });
    pedestal(pool.x1, pool.z1, "campfire", {
      lit: "true",
      signal_fire: "false",
      facing: "north",
      waterlogged: "false",
    });
    // The attendant's cauldron on a third pedestal, by the pool's near edge.
    pedestal(pool.x1, pool.z0, "cauldron", { level: "3" });
  } else {
    // No pool, no pedestals: an open changing room, where the guard's own
    // connectivity check is enough to keep corner props from sealing anything.
    c.put1(it.x0, it.z0, "campfire", {
      lit: "true",
      signal_fire: "false",
      facing: "north",
      waterlogged: "false",
    });
    c.put1(it.x1, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1, "cauldron", { level: "3" });
  }
  // The changing benches, along the walkway on two corners. A bench is a
  // bottom stair with its backrest to the wall, and a stair is a half-step
  // the walking agent can mount — so a bench never cuts the one-wide ring the
  // way a full block would, PROVIDED there is headroom to stand on it. Under
  // a three-course storey with a floor plane overhead there is none: the
  // mounted head lands in the storey above's floor, the bench turns back into
  // a wall, and the two-storey bathhouses came back with sealed arcs. So the
  // ring gets benches only when a stander on one fits.
  const benchHeadroom = ctx.floors < 2 || ctx.storyHeight >= 4;
  if (benchHeadroom && !inPool(it.x1, it.z0)) {
    c.put1(it.x1, it.z0, ctx.style["stair.interior"] as string, {
      facing: "east",
      half: "bottom",
      shape: "straight",
    });
  }
  if (benchHeadroom && !inPool(it.x0, it.z1)) {
    c.put1(it.x0, it.z1, ctx.style["stair.interior"] as string, {
      facing: "west",
      half: "bottom",
      shape: "straight",
    });
  }
  // A bench run along the west walkway, spaced so the room never narrows to
  // nothing between a bench and the water.
  if (benchHeadroom) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      if (inPool(it.x0, z)) continue;
      c.put1(it.x0, z, ctx.style["stair.interior"] as string, {
        facing: "west",
        half: "bottom",
        shape: "straight",
      });
    }
  }
}
