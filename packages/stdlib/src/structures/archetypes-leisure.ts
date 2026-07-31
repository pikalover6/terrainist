/**
 * Archetype breadth, **wave four C** — leisure, modern and science interiors.
 *
 * `archetypes-blitz.ts` states the design law this file obeys and it is
 * restated nowhere: **an archetype is a fit-out, not a second grammar.** A
 * fit-out runs after every shape stage — foundation, walls, windows, floors,
 * roof, chimney — and writes into the same cell map they did, where a later
 * write to a cell replaces an earlier one. So a theatre is the house shell
 * with a dais at one end and rows of seats looking at it; a cinema is the
 * school's dark end wall gone pale and a projector at the back; a glass
 * pavilion is the greenhouse domesticated. None of them is a new shell.
 *
 * Twelve buildings, in three groups:
 *
 * - **leisure** — `theater`, `opera_house`, `cinema`, `dance_hall`,
 *   `boxing_gym`, `sauna`, `ski_lodge`, `clubhouse`;
 * - **modern** — `glass_pavilion`, `convenience_store`;
 * - **science** — `laboratory`, `lecture_hall`.
 *
 * ## The rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — the door approach, the stair columns, the hearth reserve and
 *    the connectivity guard, none of them restated here.
 *
 * ## The field lessons this file was written against
 *
 * Every one of these is a rule below rather than a comment:
 *
 * - a **stair's `facing` is its high half** — the backrest. Every seat in
 *   every bank here therefore faces *away* from the stage, the screen or the
 *   lectern its sitter is looking at;
 * - a bare `flower_pot` renders **empty**; {@link pottedAt} (wave two's,
 *   imported rather than re-derived) picks a `potted_*` from position;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height. {@link bankCells} is the school's lesson generalized: a seat or
 *   shelf bank keeps a **three-column aisle** centred on that column and a
 *   **one-cell clear lane around the whole field**, so whatever the shell's
 *   own reserve refuses inside the bank still connects around it;
 * - the trestle idiom (a fence with a plate on it) is refused by the stack
 *   guard under a three-course storey, so {@link table} switches to a slab;
 * - **raked** seating is a stair a body has to stand on, and a stander needs
 *   `floors < 2 || storyHeight >= 4`. Rather than bank the rows on some
 *   envelopes and not others, every bank here is **flat** — including the
 *   lecture hall's, which is the one that wanted raking most;
 * - **no sign blocks.** A marquee is a row of banners;
 * - **no open water.** The sauna is the bathhouse's dry cousin on purpose:
 *   it has a brazier and a dry cauldron and not one water cell;
 * - a body-blocking prop on a one-wide circulation ring seals it, so nothing
 *   stands in a lane; and a roof rebuild ends in a **solid cap**, with partial
 *   blocks only where something solid holds them up.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: leisure first, then
 * the two modern ones, then the two science ones.
 */
export const LEISURE_BUILDING_ARCHETYPES = [
  "theater",
  "opera_house",
  "cinema",
  "dance_hall",
  "boxing_gym",
  "sauna",
  "ski_lodge",
  "clubhouse",
  "glass_pavilion",
  "convenience_store",
  "laboratory",
  "lecture_hall",
] as const;

/** One of the archetypes this file fits out. */
export type LeisureBuildingArchetype = (typeof LEISURE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isLeisureArchetype(value: string): value is LeisureBuildingArchetype {
  return (LEISURE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the institutions and *before* the extended table, for the
 * reason every later wave sits there: the tables under it are greedy. Every
 * near miss below is deliberate, and each one would otherwise have been a
 * silent theft:
 *
 * - **`sauna` is the bathhouse's** (`archetypes-town.ts` claims it, along with
 *   `baths` and `hammam`). This file's `sauna` is the *dry* one, so the
 *   archetype keeps the catalog's id and answers to `dry_sauna` and
 *   `sweat_lodge` instead. A document that says `sauna` still gets a
 *   bathhouse, which is the older claim and the wetter building;
 * - `gym`, `gymnasium` and `fitness` are the **blitz gym's**, so the boxing
 *   gym takes `boxing_gym` and `boxing` only;
 * - `store` is the granary's and `shop`/`grocer` the general store's, so the
 *   convenience store takes `convenience_store` and `corner_shop`;
 * - `lodging` belongs to the high-rise **hotel**, and bare `lodge` is close
 *   enough to it to be a trap, so the ski lodge answers to `ski_lodge` only;
 * - bare `pavilion` is left unclaimed — the catalog has a bathing pavilion and
 *   a dodgems pavilion waiting for it — so the glass one is a compound only.
 */
export function leisureArchetypeOfTags(
  tags: readonly string[],
): LeisureBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("theater") || has("theatre")) return "theater";
  if (has("opera_house") || has("opera")) return "opera_house";
  if (has("cinema") || has("movie_theater")) return "cinema";
  if (has("dance_hall") || has("ballroom")) return "dance_hall";
  if (has("boxing_gym") || has("boxing")) return "boxing_gym";
  if (has("dry_sauna") || has("sweat_lodge")) return "sauna";
  if (has("ski_lodge")) return "ski_lodge";
  if (has("clubhouse") || has("club")) return "clubhouse";
  if (has("glass_pavilion")) return "glass_pavilion";
  if (has("convenience_store") || has("corner_shop")) return "convenience_store";
  if (has("laboratory") || has("lab")) return "laboratory";
  if (has("lecture_hall") || has("auditorium")) return "lecture_hall";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 */
export function leisureFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // An auditorium is a blind box with a grand face: few, tall openings.
    case "theater":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    case "opera_house":
      return { windowShape: "tall", windowRhythm: "paired", roof: "hip" };
    // A room built to be dark.
    case "cinema":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    // Light and air over the floor, and a wide room to put it in.
    case "dance_hall":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    case "boxing_gym":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Heat wants to stay in.
    case "sauna":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "ski_lodge":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    case "clubhouse":
      return { windowShape: "mullion", windowRhythm: "paired", roof: "hip" };
    // The building is its glazing; ask for the shape with the most room under
    // it, because the glass deck replaces the pitch anyway.
    case "glass_pavilion":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    case "convenience_store":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    case "laboratory":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    case "lecture_hall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
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
 * The blitz file's `ExteriorPlan`, restated rather than imported because the
 * waves are separate seams and a shared private helper is a shared edit. The
 * refusals are the same: a **plain rect** only — an L has a reflex corner none
 * of these routines has a rule for — and, for a rebuild, room above the plate.
 */
interface LeisurePlan {
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
function wallPlan(ctx: FitOutContext): LeisurePlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return {
    sx,
    sz,
    base: ctx.wallTop + 1,
    top: ctx.roofTop + ROOF_FLOURISH_RISE,
    rect: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 },
  };
}

/** Blocks a re-clad may never overwrite: the way in, the way up, the fire, the lights. */
const KEEP_AS_IS =
  /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

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
 * Returns whether it landed, so a caller's count is the count of cells it
 * actually changed rather than the count it looked at.
 */
function clad(ctx: FitOutContext, x: number, y: number, z: number, block: string): boolean {
  const standing = ctx.blockAt(x, y, z);
  if (standing !== undefined && KEEP_AS_IS.test(standing.block)) return false;
  ctx.put(x, y, z, block);
  return true;
}

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, for the chimney corbel and its chimney-pot
 * campfire: a replacement roof that cleared only to its own ceiling would
 * leave a fire burning over the ridge it deleted.
 */
function clearRoof(ctx: FitOutContext, plan: LeisurePlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/** The cardinal facing the other way. */
function opposite(facing: Cardinal): Cardinal {
  switch (facing) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    default:
      return "east";
  }
}

/**
 * The end of the room furthest from the door.
 *
 * The stage, the screen, the board and the lectern are all the same idea: the
 * thing you walk *towards*. Returns the z of that end and the cardinal a
 * person standing in the room faces to look at it.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * Wave two's rule, unchanged: the trestle — a fence stem with a plate on it —
 * is two blocks in one column, and under a three-course storey the second is
 * refused by the stack guard as an `interior.blocked_column`, leaving a bare
 * fence post that reads as a bollard. A top slab is one block at table height.
 */
function table(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/**
 * A bank of rows facing the far end — the school's lesson, generalized.
 *
 * Returns the cells a bank may occupy, in row order, and it is the *only* way
 * anything in this file lays a field of props. Three constraints are built in,
 * and every one of them came back from a walkthrough:
 *
 * - a **three-column aisle**, centred on the column the shell hangs its
 *   lantern in. One column guesses the parity wrong half the time; two still
 *   leave a sealed pocket where the lantern's own row meets the field beside
 *   it; three always leave two clear columns past the light;
 * - a **one-cell clear lane** around the whole field, inside the walls. The
 *   stair reserve and the hearth breast refuse cells *inside* a bank, and a
 *   refusal in a wall-to-wall field leaves sealed air pockets — with the lane,
 *   every gap connects around;
 * - **alternate rows only** (`step` defaults to two), so a body can get out of
 *   a row without climbing the next one.
 *
 * `startGap` is how far the first row stands off the stage: two leaves a clear
 * row in front of the dais, which is where the performers stand.
 */
function bankCells(
  ctx: FitOutContext,
  end: { readonly z: number; readonly look: Cardinal },
  startGap = 2,
  step = 2,
): { readonly x: number; readonly z: number; readonly row: number }[] {
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const aisle0 = Math.max(it.x0, lamp.x - 1);
  const aisle1 = Math.min(it.x1, lamp.x + 1);
  // Away from the stage: the stage is at `end.z`, and `look` is the direction
  // a body turns to see it.
  const dir = end.look === "north" ? 1 : -1;
  const out: { x: number; z: number; row: number }[] = [];
  for (let k = startGap, row = 0; ; k += step, row++) {
    const z = end.z + dir * k;
    if (z < it.z0 + 1 || z > it.z1 - 1) break;
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      if (x >= aisle0 && x <= aisle1) continue;
      out.push({ x, z, row });
    }
  }
  return out;
}

/**
 * A bank of seats, flat, every one of them turned away from the stage.
 *
 * Flat and not raked, deliberately. A riser is a stair a body stands *on*, and
 * a stander needs `floors < 2 || storyHeight >= 4`; a bank that raked itself
 * only on the tall envelopes would be two buildings wearing one name, and the
 * one on the short envelope is the one that seals its own back rows.
 */
function seatBank(
  ctx: FitOutContext,
  c: PropCounter,
  end: { readonly z: number; readonly look: Cardinal },
  startGap = 2,
): number {
  const seat = ctx.style["stair.interior"] as string;
  // THE SEAT RULE: `facing` names the stair's high half — the backrest — so a
  // seat looking at the stage carries the cardinal pointing *away* from it.
  const backrest = opposite(end.look);
  let n = 0;
  for (const cell of bankCells(ctx, end, startGap)) {
    if (c.put1(cell.x, cell.z, seat, { facing: backrest, half: "bottom", shape: "straight" })) {
      n++;
    }
  }
  return n;
}

/**
 * Recolour the floor plane over an inclusive rect.
 *
 * A carpet is a block at `y = 1`, which costs the room a walkable cell for
 * every cell of rug; the floor plane costs nothing and reads the same from a
 * standing eye. The gym's mats are written this way and this file follows it
 * for every rug, runner and sprung floor.
 */
function floorPaint(
  ctx: FitOutContext,
  rect: LocalRect,
  block: (x: number, z: number) => string,
): number {
  let n = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      ctx.put(x, 0, z, block(x, z));
      n++;
    }
  }
  return n;
}

/**
 * A dais at the far end: top slabs across the end row, minus any cells kept.
 *
 * A top slab is a half step, so a dais is walkable rather than a wall, and it
 * is written through the prop counter so a cell the shell reserved is simply
 * not raised.
 */
function dais(
  ctx: FitOutContext,
  c: PropCounter,
  z: number,
  keep: ReadonlySet<number> = new Set(),
): void {
  const it = ctx.interior;
  const slabBlock = ctx.style["stone.slab"] as string;
  for (let x = it.x0; x <= it.x1; x++) {
    if (keep.has(x)) continue;
    c.put1(x, z, slabBlock, { type: "top", waterlogged: "false" });
  }
}

/** True when a bench, which is a step a body mounts, has room for the body. */
function benchHeadroom(ctx: FitOutContext): boolean {
  return ctx.floors < 2 || ctx.storyHeight >= 4;
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
export function furnishLeisure(ctx: FitOutContext): number {
  if (!isLeisureArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "theater":
      fitTheater(ctx, c);
      break;
    case "opera_house":
      fitOperaHouse(ctx, c);
      break;
    case "cinema":
      fitCinema(ctx, c);
      break;
    case "dance_hall":
      fitDanceHall(ctx, c);
      break;
    case "boxing_gym":
      fitBoxingGym(ctx, c);
      break;
    case "sauna":
      fitSauna(ctx, c);
      break;
    case "ski_lodge":
      fitSkiLodge(ctx, c);
      break;
    case "clubhouse":
      fitClubhouse(ctx, c);
      break;
    case "glass_pavilion":
      fitGlassPavilion(ctx, c);
      break;
    case "convenience_store":
      fitConvenienceStore(ctx, c);
      break;
    case "laboratory":
      fitLaboratory(ctx, c);
      break;
    case "lecture_hall":
    default:
      fitLectureHall(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* leisure                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `theater` — a stage at the far end, seats looking at it, curtains either side.
 *
 * The stage is a **slab dais** across the end row: a half step, so the room
 * still walks onto it. The wing curtains are banners on the two stage corners
 * — banners and not signs, because a sign block demands a paired block entity
 * the structure op stream cannot carry. The house is one flat seat bank, and
 * the backstage corner takes the property chest and the costume barrel.
 */
function fitTheater(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  dais(ctx, c, end.z, new Set([it.x0, it.x1]));
  // The wings: a curtain at each end of the proscenium.
  c.put1(it.x0, end.z, "red_banner", { rotation: end.look === "north" ? "8" : "0" });
  c.put1(it.x1, end.z, "red_banner", { rotation: end.look === "north" ? "8" : "0" });
  seatBank(ctx, c, end);
  // Backstage: the property chest and the costume barrel, both on the near
  // corners so the lane round the house stays clear.
  c.put1(it.x0, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `opera_house` — the theatre, grander: boxes, a proscenium trim, a red runner.
 *
 * Three additions and nothing else, because a fourth would be a different
 * building. **Box seats** are chest-and-seat pairs on the two side walls level
 * with the stage, each seat turned to look down the room. The **proscenium**
 * is a quartz trim on the stage wall, above the plinth and out of the floor's
 * way entirely. The **runner** is red floor plane down the aisle, not carpet:
 * a carpet block costs a walkable cell per cell of aisle, and the aisle is the
 * one route this building cannot afford to spend.
 */
function fitOperaHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const plan = wallPlan(ctx);
  const lamp = lanternColumn(it);

  if (plan !== null) {
    // The proscenium: a band of quartz across the interior face of the stage
    // wall, from over head height to the plate.
    const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;
    const topY = Math.min(5, ctx.wallTop - 1);
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 3; y <= topY; y++) {
        const block = (x + y) % 4 === 0 ? "chiseled_quartz_block" : "quartz_block";
        if (clad(ctx, x, y, wallZ, block)) c.n++;
      }
    }
  }

  // The runner, in the floor plane down the three-column aisle.
  c.n += floorPaint(
    ctx,
    { x0: Math.max(it.x0, lamp.x - 1), x1: Math.min(it.x1, lamp.x + 1), z0: it.z0, z1: it.z1 },
    () => "red_concrete",
  );

  dais(ctx, c, end.z, new Set([it.x0, it.x1]));
  c.put1(it.x0, end.z, "red_banner", { rotation: end.look === "north" ? "8" : "0" });
  c.put1(it.x1, end.z, "red_banner", { rotation: end.look === "north" ? "8" : "0" });
  seatBank(ctx, c, end);

  // The boxes: a chest for the party's things and a seat beside it, on each
  // side wall a couple of rows back from the stage. The seat looks down the
  // room at the stage, so its backrest — which is what `facing` names — is on
  // the wall behind it.
  const dir = end.look === "north" ? 1 : -1;
  const boxZ = end.z + dir;
  if (boxZ >= it.z0 && boxZ <= it.z1) {
    c.put1(it.x0, boxZ, "chest", { facing: "east", type: "single" });
    c.put1(it.x1, boxZ, "chest", { facing: "west", type: "single" });
  }
  const seatZ = end.z + dir * 2;
  if (benchHeadroom(ctx) && seatZ >= it.z0 && seatZ <= it.z1) {
    const seat = ctx.style["stair.interior"] as string;
    c.put1(it.x0, seatZ, seat, { facing: "west", half: "bottom", shape: "straight" });
    c.put1(it.x1, seatZ, seat, { facing: "east", half: "bottom", shape: "straight" });
  }
}

/**
 * `cinema` — a pale screen on a dark wall, seats, a projector at the back.
 *
 * The screen is the school's board idiom inverted: the interior face of the
 * far wall goes **black** at the plinth and the plate and **white** between
 * them, so the pale rectangle reads as a screen hung on a dark room rather
 * than as a window. The projector stands at the **back of the aisle**, on the
 * clear lane the bank leaves round itself, where the cells either side of it
 * stay walkable — a body-blocking prop mid-aisle would seal the house.
 */
function fitCinema(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const plan = wallPlan(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  if (plan !== null) {
    const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;
    const topY = Math.min(5, ctx.wallTop - 1);
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 2; y <= topY; y++) {
        const edge = x === it.x0 || x === it.x1 || y === 2 || y === topY;
        if (clad(ctx, x, y, wallZ, edge ? "black_concrete" : "white_concrete")) c.n++;
      }
    }
  }

  seatBank(ctx, c, end);
  // The projector: a pedestal at the back of the aisle with the lens on it.
  // The lens is stacked, so on a three-course storey the stack guard refuses
  // it and the pedestal stands alone — which is a plinth, not a pillar.
  if (c.put1(lamp.x, nearZ, "smooth_stone")) {
    c.stack(lamp.x, nearZ, 2, "observer", {
      facing: end.look,
      powered: "false",
    });
  }
  // The lobby corner: concessions.
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
}

/**
 * `dance_hall` — a sprung floor, a band stage, benches round the walls.
 *
 * The floor is the building: alternating strips of pale and dark written into
 * the **floor plane**, which is a sprung dance floor at the only fidelity the
 * palette allows and costs the room nothing. The band gets a slab dais at the
 * far end with a note block and a jukebox on it; the bunting is banners on the
 * side walls; and the benches are stairs on the wall rows, laid only where a
 * body standing on one has the headroom for it.
 */
function fitDanceHall(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  c.n += floorPaint(ctx, it, (x) => (x % 2 === 0 ? "polished_andesite" : "birch_planks"));

  // The band: a dais, with the instruments standing on the floor beside it so
  // neither has to fight the other for a cell. Which cells the dais gives up
  // for them is *searched* rather than assumed — the hearth breast and the
  // stair reserve can eat any particular corner of the end row, and `put1`
  // refuses an occupied cell rather than replacing it, so a band pinned to one
  // cell is a band that sometimes never arrives.
  const bandKeep = new Set<number>();
  const bandCells: number[] = [];
  for (let x = it.x0; x <= it.x1; x++) {
    if (!ctx.free(x, end.z)) continue;
    bandCells.push(x);
    if (bandCells.length === 3) break;
  }
  for (const x of bandCells) bandKeep.add(x);
  dais(ctx, c, end.z, bandKeep);
  const [jx, nx, bx] = bandCells;
  if (jx !== undefined) c.put1(jx, end.z, "jukebox", { has_record: "false" });
  if (nx !== undefined) {
    c.put1(nx, end.z, "note_block", { instrument: "harp", note: "0", powered: "false" });
  }
  if (bx !== undefined) c.put1(bx, end.z, "barrel", { facing: "up", open: "false" });

  // The benches: down both side walls, alternate cells, backs to the wall.
  if (benchHeadroom(ctx)) {
    const seat = ctx.style["stair.interior"] as string;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      c.put1(it.x0, z, seat, { facing: "west", half: "bottom", shape: "straight" });
      c.put1(it.x1, z, seat, { facing: "east", half: "bottom", shape: "straight" });
    }
  }
  // The bunting, on the near corners.
  c.put1(it.x0, nearZ, "yellow_banner", { rotation: "8" });
  c.put1(it.x1, nearZ, "light_blue_banner", { rotation: "8" });
}

/**
 * `boxing_gym` — a roped ring in the middle, bags on the wall, a bench row.
 *
 * The blitz gym's cousin, and the differences are the ring and the bags. The
 * **ring** is a slab dais in the middle of the floor with fence corner posts
 * standing **on** it — on it, and not beside it, because a fence needs
 * something under it and a post floating over a floor cell is exactly the kind
 * of unsupported block the physics lint refuses. The ring is only raised when
 * the room can keep a clear lane all the way round it.
 */
function fitBoxingGym(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  // The mats.
  c.n += floorPaint(ctx, it, (x, z) => ((x + z) % 2 === 0 ? "red_wool" : "white_wool"));

  // The ring: three by three at the room's centre, with two clear cells
  // between it and every wall.
  const wide = it.x1 - it.x0 >= 6 && it.z1 - it.z0 >= 6;
  if (wide) {
    const slabBlock = ctx.style["stone.slab"] as string;
    const fence = ctx.style["wall.fence"] as string;
    for (let z = lamp.z - 1; z <= lamp.z + 1; z++) {
      for (let x = lamp.x - 1; x <= lamp.x + 1; x++) {
        if (!c.put1(x, z, slabBlock, { type: "top", waterlogged: "false" })) continue;
        // The corner posts, standing on the slab that has just been laid.
        const corner = (x === lamp.x - 1 || x === lamp.x + 1) && (z === lamp.z - 1 || z === lamp.z + 1);
        if (corner) c.stack(x, z, 2, fence);
      }
    }
  }

  // The bag rack: targets hung under the ceiling plane on the far wall, so the
  // cells under them stay walkable.
  const bagY = ctx.wallTop - 1;
  if (ctx.floors === 1 && bagY >= 2) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x += 2) {
      if (ctx.blockAt(x, bagY, end.z) !== undefined) continue;
      ctx.put(x, bagY, end.z, "target", { power: "0" });
      c.n++;
    }
  }
  // The bench row and the iron, all on wall rows.
  if (benchHeadroom(ctx)) {
    const seat = ctx.style["stair.interior"] as string;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      c.put1(it.x0, z, seat, { facing: "west", half: "bottom", shape: "straight" });
    }
  }
  c.put1(it.x1, it.z0 + 1 <= it.z1 ? it.z0 + 1 : it.z0, "anvil", { facing: "west" });
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, nearZ, "cauldron", { level: "0" });
}

/**
 * `sauna` — the bathhouse's dry cousin: tiered benches, hot stones, no water.
 *
 * The bathhouse writes water into its floor plane and boxes it in by
 * construction. This building has **no water at all** — not a pool, not a
 * waterlogged slab, not a filled cauldron — which is what makes it a sauna
 * rather than a small bathhouse, and which is asserted directly in the tests.
 *
 * The tiers are flat slab platforms against the two side walls, with a second
 * tier only where a body sitting on it would have the headroom; a raked tier
 * under a three-course storey is a step whose stander's head is in the floor
 * above. The brazier stands on a pedestal on the **far wall row**, away from
 * the one-wide lane the benches leave.
 */
function fitSauna(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const slabBlock = ctx.style["stone.slab"] as string;

  // The lower tier: a flat slab bench up both side walls. A top slab is a half
  // step, so the lane beside it is never cut the way a full block would cut it.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    for (const x of [it.x0, it.x1]) {
      if (!c.put1(x, z, slabBlock, { type: "top", waterlogged: "false" })) continue;
      // The upper tier, only where a sitter fits under the ceiling.
      if (ctx.storyHeight >= 5 && (z - it.z0) % 2 === 0) {
        c.stack(x, z, 2, slabBlock, { type: "top", waterlogged: "false" });
      }
    }
  }

  // The brazier: hot stones on a pedestal at the far wall, with the fire above
  // the pedestal rather than on the floor a bather walks.
  const px = lamp.x;
  if (c.put1(px, end.z, "smooth_stone")) {
    if (
      !c.stack(px, end.z, 2, "campfire", {
        lit: "true",
        signal_fire: "false",
        facing: end.look === "north" ? "south" : "north",
        waterlogged: "false",
      })
    ) {
      // No headroom for a fire on a plinth: the stones go in the corner
      // instead, which is the bathhouse's own fallback.
      c.put1(it.x0, end.z, "campfire", {
        lit: "true",
        signal_fire: "false",
        facing: "north",
        waterlogged: "false",
      });
    }
  }
  // The water bucket the attendant never fills: an empty cauldron. Dry, by the
  // rule that opens this fit-out.
  c.put1(it.x1, end.z, "cauldron", { level: "0" });
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
}

/**
 * `ski_lodge` — a great room round the hearth: rugs, ski racks, a mantel.
 *
 * The shell already builds a hearth and reserves the cells around it, so the
 * lodge does not build a fire — it builds the room the fire is the middle of.
 * **Rugs** in the floor plane; **ski racks** are trapdoors on the side walls at
 * shoulder height, which is the cheapest honest rack the palette has; the
 * **mantel** is a course of stripped log on the far wall with fence ends
 * standing on it — on it, because a fence over nothing is an unsupported block.
 */
function fitSkiLodge(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  // The fur rugs, in the floor plane and only over the middle of the room, so
  // the boards round the edge still read as boards.
  if (it.x1 - it.x0 >= 4 && it.z1 - it.z0 >= 4) {
    c.n += floorPaint(
      ctx,
      { x0: it.x0 + 1, x1: it.x1 - 1, z0: it.z0 + 1, z1: it.z1 - 1 },
      (x, z) => ((x + z) % 3 === 0 ? "white_wool" : "brown_wool"),
    );
  }

  // The mantel and its antlers, on the far wall row.
  const mantel = "stripped_spruce_log";
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 2) {
    if (!c.put1(x, end.z, mantel, { axis: "x" })) continue;
    c.stack(x, end.z, 2, ctx.style["wall.fence"] as string);
  }
  // The ski racks: trapdoors on both side walls at shoulder height.
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  const rackY = Math.min(2, ctx.storyHeight - 1);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    for (const [x, facing] of [
      [it.x0, "east"],
      [it.x1, "west"],
    ] as const) {
      c.stack(x, z, rackY, trapdoor, {
        facing,
        half: "top",
        open: "false",
        powered: "false",
        waterlogged: "false",
      });
    }
  }
  // The lounge: a seat and a table by the near wall, the stores in the corner.
  if (benchHeadroom(ctx)) {
    c.put1(it.x0, nearZ, ctx.style["stair.interior"] as string, {
      facing: "west",
      half: "bottom",
      shape: "straight",
    });
  }
  table(ctx, c, it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, nearZ);
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `clubhouse` — trophies, an honours board, lounge chairs and a short bar.
 *
 * The tavern's counter, shortened to a corner: a run of dressed timber on one
 * wall row with the cellar barrel behind it. The trophies are a gold block on
 * a shelf at the far end under a pair of banners — the honours board, which is
 * a banner row and not a sign, for the reason every wave states.
 */
function fitClubhouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  // The trophy shelf: the far wall row, with the cup in the middle of it.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, x % 2 === 0 ? "bookshelf" : (ctx.style["wall.frame"] as string), {
      ...(x % 2 === 0 ? {} : { axis: "x" }),
    });
  }
  c.put1(lamp.x, end.z, "gold_block");
  // The honours board: banners high on the far wall, clear of the floor.
  const bannerY = Math.min(4, ctx.storyHeight - 1);
  if (bannerY >= 2) {
    for (const bx of [lamp.x - 1, lamp.x + 1]) {
      if (bx < it.x0 || bx > it.x1) continue;
      c.raw(bx, bannerY, end.z, "green_banner", { rotation: end.look === "north" ? "8" : "0" });
    }
  }

  // The lounge: chairs turned in on low tables, both on the side wall rows so
  // the middle of the floor stays open.
  const seat = ctx.style["stair.interior"] as string;
  for (let z = it.z0 + 2; z <= it.z1 - 2; z += 3) {
    if (benchHeadroom(ctx)) {
      c.put1(it.x0, z, seat, { facing: "west", half: "bottom", shape: "straight" });
      c.put1(it.x1, z, seat, { facing: "east", half: "bottom", shape: "straight" });
    }
    if (it.x0 + 1 <= it.x1) table(ctx, c, it.x0 + 1, z);
    if (it.x1 - 1 >= it.x0) table(ctx, c, it.x1 - 1, z);
  }

  // The bar, in the near corner.
  c.put1(it.x0, nearZ, ctx.style["wall.frame"] as string, { axis: "x" });
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/* -------------------------------------------------------------------------- */
/* modern                                                                      */
/* -------------------------------------------------------------------------- */

/** The lowest course a pane may start at: never the floor plane, never a boot. */
const PAVILION_SILL_Y = 2;

/**
 * `glass_pavilion` — the greenhouse, domesticated.
 *
 * The glazing follows the greenhouse's sill rule exactly, and for the same
 * two reasons: no glass on a **floor plane** — on a two-storey pavilion that
 * plane lands mid-wall and a pane there sits at the height of an upstairs boot
 * — and a **plinth** at the foot of the wall wherever dropping the lowest
 * course still leaves the wall some glass. The roof is a flat glass deck where
 * there is room for one, laid as a **solid** cap over the footprint.
 *
 * Inside, an open plan: planted corners, a bench, a table, and nothing at all
 * in the middle of the floor. A pavilion is a view with a roof on it.
 */
function fitGlassPavilion(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  const torchY = Math.min(3, ctx.storyHeight - 1);
  if (plan !== null) {
    const band: number[] = [];
    for (let y = PAVILION_SILL_Y; y < ctx.wallTop; y++) {
      // The torch course names the block behind it, and glass is not a face
      // the physics lint accepts for a bracket; a floor plane is a boot height.
      if (y === torchY) continue;
      if (y % ctx.storyHeight === 0) continue;
      band.push(y);
    }
    if (band.length > 1 && band[0] === PAVILION_SILL_Y) band.shift();
    for (const cell of ringOf(plan.sx, plan.sz)) {
      const corner =
        (cell.x === 0 || cell.x === plan.sx - 1) && (cell.z === 0 || cell.z === plan.sz - 1);
      if (corner) continue;
      for (const y of band) {
        if (clad(ctx, cell.x, y, cell.z, "glass")) c.n++;
      }
    }
    // The deck: the shell's pitch comes off, and a flat glass lid goes on. A
    // solid cap, one course, with nothing partial in it — a slab roof would be
    // a partial block with nothing under it at the eave.
    if (plan.top - plan.base >= 1) {
      clearRoof(ctx, plan);
      for (let x = 0; x < plan.sx; x++) {
        for (let z = 0; z < plan.sz; z++) ctx.put(x, plan.base, z, "glass");
      }
      c.n++;
      // The parapet rail, so the deck reads as a roof rather than as a hole.
      for (const cell of ringOf(plan.sx, plan.sz)) {
        ctx.put(cell.x, plan.base + 1 <= plan.top ? plan.base + 1 : plan.base, cell.z, "glass_pane", {
          north: "false",
          south: "false",
          east: "false",
          west: "false",
          waterlogged: "false",
        });
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  // The planting, in the corners only.
  c.put1(it.x0, end.z, pottedAt(it.x0, end.z));
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
  c.put1(it.x0, nearZ, pottedAt(it.x0, nearZ));
  table(ctx, c, it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ);
  if (benchHeadroom(ctx)) {
    c.put1(it.x1, nearZ, ctx.style["stair.interior"] as string, {
      facing: "east",
      half: "bottom",
      shape: "straight",
    });
  }
}

/**
 * `convenience_store` — gondolas in short rows, a counter, cold cabinets.
 *
 * The shelving is laid through {@link bankCells}, which is the same discipline
 * the seat banks use and for the same reason: a three-column aisle off the
 * lantern and a clear lane round the whole field, so a shopper can always get
 * back out. The counter is a run of timber on the far wall with an iron-bar
 * grille over it; the cold cabinets are iron trapdoors on the side wall; the
 * crates stack in the corner.
 */
function fitConvenienceStore(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const lamp = lanternColumn(it);

  // The gondolas. Every other row, so a body can leave the row it is in.
  for (const cell of bankCells(ctx, end, 2)) {
    const block = (cell.x + cell.z) % 3 === 0 ? "barrel" : "bookshelf";
    c.put1(cell.x, cell.z, block, block === "barrel" ? { facing: "up", open: "false" } : undefined);
  }

  // The counter, along the far wall, with the grille above it.
  const counter = ctx.style["wall.frame"] as string;
  for (let x = it.x0; x <= it.x1 - 1; x++) {
    if (!c.put1(x, end.z, counter, { axis: "x" })) continue;
    if (x === lamp.x) {
      c.stack(x, end.z, 2, "iron_bars", {
        north: "false",
        south: "false",
        east: "true",
        west: "true",
        waterlogged: "false",
      });
    }
  }
  c.put1(it.x1, end.z, "chest", { facing: end.look === "north" ? "south" : "north", type: "single" });

  // The cold cabinets: iron trapdoors on the west wall at shoulder height,
  // over cells whose floor stays clear.
  const cabinetY = Math.min(2, ctx.storyHeight - 1);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.stack(it.x0, z, cabinetY, "iron_trapdoor", {
      facing: "east",
      half: "top",
      open: "false",
      powered: "false",
      waterlogged: "false",
    });
  }
  // The crates, stacked in the near corner.
  if (c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" })) {
    c.stack(it.x1, nearZ, 2, "barrel", { facing: "up", open: "false" });
  }
  c.put1(it.x0, nearZ, "composter", { level: "0" });
}

/* -------------------------------------------------------------------------- */
/* science                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `laboratory` — stone benches with glassware, a fume hood, a chalk board.
 *
 * The benches run up both side walls: smooth stone at floor level with a
 * brewing stand or a cauldron standing on it where the storey has the headroom
 * for the pair, and the glassware straight on the bench row where it does not.
 * The **fume hood** is an iron trapdoor canopy over the far end of one bench —
 * on support, above a block that is actually there. The **board** is the
 * school's, unchanged: the interior face of the far wall, gone dark.
 */
function fitLaboratory(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const plan = wallPlan(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  if (plan !== null) {
    const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;
    const topY = Math.min(4, ctx.wallTop - 1);
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 2; y <= topY; y++) {
        if (clad(ctx, x, y, wallZ, "black_concrete")) c.n++;
      }
    }
  }

  // The benches and what stands on them.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    for (const x of [it.x0, it.x1]) {
      const glass = (z - it.z0) % 3 === 0;
      if (!glass) {
        c.put1(x, z, "smooth_stone");
        continue;
      }
      // The glassware goes on the bench where there is room over it, and takes
      // the bench cell itself where there is not.
      if (c.put1(x, z, "smooth_stone")) {
        if (
          !c.stack(x, z, 2, "brewing_stand", {
            has_bottle_0: "false",
            has_bottle_1: "false",
            has_bottle_2: "false",
          })
        ) {
          continue;
        }
      }
    }
  }
  // A brewing stand at floor level too, so a short storey still has one.
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, nearZ, "brewing_stand", {
    has_bottle_0: "false",
    has_bottle_1: "false",
    has_bottle_2: "false",
  });
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ, "cauldron", { level: "0" });

  // The fume hood: an iron canopy over the bench at the far end of the west
  // wall, hung from the cell above a bench block that exists.
  const hoodY = Math.min(2, ctx.storyHeight - 1);
  for (let z = it.z0 + 1; z <= Math.min(it.z0 + 3, it.z1 - 1); z++) {
    c.stack(it.x0, z, hoodY, "iron_trapdoor", {
      facing: "east",
      half: "top",
      open: "false",
      powered: "false",
      waterlogged: "false",
    });
  }
  // The specimen shelves and the demonstrator's bench, at the board end.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, "bookshelf");
  }
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
}

/**
 * `lecture_hall` — the school at scale: a board, a lectern, banked-flat rows.
 *
 * Everything the school does, on a wider aisle. The one thing it deliberately
 * does **not** do is rake the rows. A riser is a stair a body stands on, and a
 * stander needs `floors < 2 || storyHeight >= 4` — a hall that raked itself
 * only on the tall envelopes would seal its own back rows on the short ones,
 * which is precisely the defect the seat rule was written after. Flat rows, a
 * three-column aisle off the lantern, and a clear lane all the way round.
 */
function fitLectureHall(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const plan = wallPlan(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  if (plan !== null) {
    const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;
    const topY = Math.min(5, ctx.wallTop - 1);
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 2; y <= topY; y++) {
        if (clad(ctx, x, y, wallZ, "black_concrete")) c.n++;
      }
    }
  }

  // The dais the lecturer stands on, and the lectern in the middle of it.
  dais(ctx, c, end.z, new Set([lamp.x]));
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  seatBank(ctx, c, end);
  c.put1(it.x0, nearZ, "bookshelf");
  c.put1(it.x1, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
}
