/**
 * Archetype breadth, **wave five A** — twelve military buildings and outposts.
 *
 * `archetypes.ts` owns the first six archetypes and the tag table;
 * `archetypes-civic.ts` owns the extended set, the walkability guard and the
 * exterior flourishes; `archetypes-blitz.ts` states the design law this file
 * obeys and every later wave restates. This file owns the **garrison** corner
 * of the catalog: the buildings a place is defended from, from a one-room
 * pillbox to a castle, by way of a barbican, a bastion, an armory, an arsenal,
 * a bunker, a guard post, a checkpoint and a beacon tower — plus two small
 * outbuildings that belong to the same register of work rather than to the
 * dwellings, a gravedigger's hut and a shepherd's bothy.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * Read the header of `archetypes-blitz.ts` in full; it is the normative
 * statement. The short form: a fit-out runs **after** every shape stage and
 * writes into the same cell map, so it can re-clad a wall, trim an apron and
 * rebuild a roof without a line of `core.ts` changing — and every invariant
 * the shell already guarantees still holds. A castle is the keep's masonry
 * carried further, a bunker is the same shell in a gray palette. Neither is a
 * new grammar.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`.
 *
 * ## The field lessons this file was written against
 *
 * Restated as rules rather than comments, because every one of them cost a
 * walkthrough or a debug cycle in an earlier wave:
 *
 * - a **stair's `facing` is its high half** — the backrest — so a seat faces
 *   *away* from what its sitter looks at;
 * - a bare `flower_pot` renders **empty**; every pot goes through
 *   {@link pottedAt}, imported from wave two rather than restated;
 * - the shell hangs a **lantern over the middle column** at head height.
 *   Nothing here routes a one-cell walk through that column: every fit-out
 *   below stands on the wall rows and leaves the middle of the floor open;
 * - the fence-and-pressure-plate trestle is refused by the stack guard under a
 *   three-course storey, so {@link table} switches to a top slab there;
 * - **nothing body-blocking on width-1 circulation**; racks, crates and
 *   partitions all stand on the wall rows;
 * - **decor beside a platform is a WALL banner.** A standing banner on a floor
 *   cell beside something unmountable is a sealed pocket — the opera-house
 *   lesson — so every banner here either hangs on a wall or stands high on a
 *   wall row;
 * - **an apron prop stands on the actual ground.** On conformed terrain the
 *   apron fills local y0; on a platform it sits one lower, and a post starting
 *   on air fails the lint's support-chain rule. Every apron post here checks
 *   `blockAt(x, 0, z)` and fills the gap first;
 * - **no `chain` blocks.** The 1.21.11 table has no entry for them at all and
 *   the op is silently dropped; `iron_bars` hang the same read;
 * - **no sign blocks.** A sign is a block entity the op stream cannot carry.
 */

import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";
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
 * The twelve archetypes this file fits out, roughly by scale.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const GARRISON_BUILDING_ARCHETYPES = [
  "castle",
  "barbican",
  "bastion",
  "armory",
  "arsenal",
  "bunker",
  "pillbox",
  "guard_post",
  "checkpoint",
  "beacon_tower",
  "gravedigger_hut",
  "shepherds_bothy",
] as const;

/** One of the archetypes this file fits out. */
export type GarrisonBuildingArchetype = (typeof GARRISON_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isGarrisonArchetype(value: string): value is GarrisonBuildingArchetype {
  return (GARRISON_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the residential table and *before* the extended one, for the
 * reason every later wave sits there: the tables below are greedy.
 *
 * The vocabulary is thin, and three of the near misses are worth naming
 * because this is the wave most likely to steal a tag by accident:
 *
 * - **`castle`, `citadel`, `keep` and `donjon` are the breadth keep's** and
 *   stay there. The castle here is the keep grand — a *different* building at
 *   a bigger register — so it answers to `fortress` and `stronghold` only;
 * - **`barbican` is the breadth gatehouse's.** That was surprising and it is
 *   settled the honest way: the gatehouse claimed `barbican` in wave three and
 *   a claim is not moved by a later wave wanting it. The barbican here is
 *   therefore reached by **`outer_gate`** and **`gateworks`**, and a document
 *   tagged `barbican` still gets a gatehouse, which is a correct building;
 * - **`beacon` and `beacon_spire` are left alone** for the fantasy track's
 *   beacon spire. This tower answers to `beacon_tower` only;
 * - `garrison` and `barracks` stay the breadth barracks'.
 */
export function garrisonArchetypeOfTags(
  tags: readonly string[],
): GarrisonBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("fortress") || has("stronghold")) return "castle";
  if (has("outer_gate") || has("gateworks")) return "barbican";
  if (has("bastion")) return "bastion";
  if (has("armory") || has("armoury")) return "armory";
  if (has("arsenal")) return "arsenal";
  if (has("bunker")) return "bunker";
  if (has("pillbox")) return "pillbox";
  if (has("guard_post") || has("sentry_post")) return "guard_post";
  if (has("checkpoint")) return "checkpoint";
  if (has("beacon_tower")) return "beacon_tower";
  if (has("gravedigger_hut") || has("gravedigger")) return "gravedigger_hut";
  if (has("shepherds_bothy") || has("bothy")) return "shepherds_bothy";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. The military set
 * is sparse and single-light by temperament — a wall a defender stands behind
 * is a wall with as few holes in it as the job allows — and the four that
 * rebuild their roof ask for the shape with the most vertical room, because
 * the replacement is bounded by where the original finished.
 */
export function garrisonFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    // Masonry, few openings, and a hip the crenellation takes over.
    case "castle":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "barbican":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "bastion":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A store, not a hall: regular lights high enough to work under.
    case "armory":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "arsenal":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Firing slits: the narrowest rhythm the facade grammar has.
    case "bunker":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "pillbox":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "guard_post":
      return { windowShape: "single", windowRhythm: "regular", roof: "hip" };
    case "checkpoint":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "beacon_tower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "gravedigger_hut":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "shepherds_bothy":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The earlier waves' plan in every respect; restated here rather than imported
 * because the two waves are separate seams and a shared private helper is a
 * shared edit. The refusal is the same: a **plain rect** only — an L has a
 * reflex corner none of these routines has a rule for.
 */
interface GarrisonPlan {
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

/** The plan for work on the **walls and the apron**: the rect condition only. */
function wallPlan(ctx: FitOutContext): GarrisonPlan | null {
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

/** The plan for a **roof rebuild**: a wall plan that also has room to build in. */
function roofPlan(ctx: FitOutContext): GarrisonPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
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

/** The apron ring — the one-block skirt outside the footprint. */
function apronOf(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = -1; z <= sz; z++) {
    for (let x = -1; x <= sx; x++) {
      if (x === -1 || x === sx || z === -1 || z === sz) out.push({ x, z });
    }
  }
  return out;
}

/** The cell a player stands in to open the door, or `null` when there is none. */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/**
 * True when a cell is the doorstep or the door column itself.
 *
 * The physics lint walks a building **from its door**; a barrier arm written
 * over the doorstep is a building with no way in.
 */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  return out !== null && out.x === x && out.z === z;
}

/**
 * Stand a post in the apron, from the **actual** ground.
 *
 * On conformed terrain the apron ground fills local y0; on a platform it sits
 * one lower, and a post whose column starts at y1 is a column standing on air,
 * which the lint's support-chain rule rightly refuses. Filling y0 first closes
 * the gap.
 */
function apronPost(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  block: string,
  toY: number,
  props?: Record<string, string>,
): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block, props);
  for (let y = 1; y <= toY; y++) c.raw(x, y, z, block, props);
}

/**
 * Blocks a re-clad may never overwrite.
 *
 * The earlier waves' list unchanged: the way in, the way up, the fire, the
 * glass and anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/**
 * Re-clad the wall ring between two courses.
 *
 * `block` is a pure function of position, so opposite walls agree and the
 * result is deterministic without a draw.
 */
function reclad(
  ctx: FitOutContext,
  plan: GarrisonPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
  props?: (x: number, y: number, z: number) => Record<string, string> | undefined,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z), props?.(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/** The masonry mix the re-clads draw from — the shell's own stone palette. */
function masonry(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (x, y, z) => ((x * 7 + y * 13 + z * 5) % 6 === 0 ? accent : primary);
}

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, because the chimney's corbel and its
 * chimney-pot campfire stand there: a replacement roof that cleared only up to
 * its own ceiling would leave a fire burning in mid-air over the ridge it
 * deleted.
 */
function clearRoof(ctx: FitOutContext, plan: GarrisonPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
}

/** Fill an inclusive rect at one Y. */
function fill(
  ctx: FitOutContext,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  block: string,
  props?: Record<string, string>,
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) ctx.put(x, y, z, block, props);
  }
}

/**
 * A parapet course with merlons on it, restated off the watchtower's rule.
 *
 * The phase is a pure function of position, so opposite walls agree without a
 * draw. Returns the Y of the highest course written.
 */
function crenellate(
  ctx: FitOutContext,
  plan: GarrisonPlan,
  deckY: number,
  block: (x: number, y: number, z: number) => string,
): number | null {
  const parapetY = deckY + 1;
  const merlonY = deckY + 2;
  if (parapetY > plan.top) return null;
  const ring = ringOf(plan.sx, plan.sz);
  for (const cell of ring) ctx.put(cell.x, parapetY, cell.z, block(cell.x, parapetY, cell.z));
  if (merlonY > plan.top) return parapetY;
  for (const cell of ring) {
    if ((cell.x + cell.z) % 2 !== 0) continue;
    ctx.put(cell.x, merlonY, cell.z, block(cell.x, merlonY, cell.z));
  }
  return merlonY;
}

/**
 * A solid fighting deck over the ceiling plane, with a crenellated parapet.
 *
 * The deck is what makes the top read as a *place* rather than as a lid, and
 * it is a **solid cap** — the roof-rebuild rule: partial blocks only where
 * something supports them. Returns the deck's Y.
 */
function battlement(ctx: FitOutContext, plan: GarrisonPlan): number {
  const stone = masonry(ctx);
  clearRoof(ctx, plan);
  fill(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, ctx.style["foundation.accent"] as string);
  crenellate(ctx, plan, plan.base, stone);
  return plan.base;
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * The earlier waves' rule verbatim: the trestle — a fence stem under a
 * pressure plate — is two blocks in one column and is refused by the stack
 * guard under a three-course storey, so a top slab stands in for it there.
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
 * A long board down a column, with seats turned to it.
 *
 * The blitz file's `hallTable`, restated: a cross lane every fourth bay so the
 * two halves of the floor meet across the board rather than only round its
 * ends, and a seat only beside a cell the board actually reached. The seat
 * rule applies — a chair's `facing` is its backrest, so the west seat faces
 * west and the sitter looks east at the board beside them.
 */
function board(ctx: FitOutContext, c: PropCounter, x: number, z0: number, z1: number): number[] {
  const laid: number[] = [];
  for (let z = z0; z <= z1; z++) {
    if ((z - z0) % 4 === 3) continue;
    if (table(ctx, c, x, z)) laid.push(z);
  }
  const chair = ctx.style["stair.interior"] as string;
  for (let k = 0; k < laid.length; k += 2) {
    const z = laid[k] as number;
    c.put1(x - 1, z, chair, { facing: "west", half: "bottom", shape: "straight" });
    c.put1(x + 1, z, chair, { facing: "east", half: "bottom", shape: "straight" });
  }
  return laid;
}

/**
 * Is the room wide enough to stand a board in?
 *
 * A board takes its own column and a seat column either side, and the walk
 * needs a lane past it as well as the two wall rows.
 */
function boardRoom(it: LocalRect): boolean {
  return it.x1 - it.x0 + 1 >= 9 && it.z1 - it.z0 + 1 >= 7;
}

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/** Lay one bed wherever the room will take it, head against a wall. */
function bedAlcove(ctx: FitOutContext, block: string): boolean {
  const it = ctx.interior;
  const ranges: readonly { readonly x: number; readonly wall: number; readonly facing: Cardinal }[] =
    [
      { x: it.x0 + 1, wall: it.x0, facing: "west" },
      { x: it.x1 - 1, wall: it.x1, facing: "east" },
    ];
  for (const range of ranges) {
    if (range.x < it.x0 || range.x > it.x1 || range.x === range.wall) continue;
    for (let z = it.z0; z <= it.z1; z++) {
      if (!ctx.free(range.x, z) || !ctx.free(range.wall, z)) continue;
      ctx.placeBed(range.x, z, range.facing, block);
      return true;
    }
  }
  return false;
}

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

/** The end of the room furthest from the door, and the way a person looks at it. */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** Trapdoor props for a panel, screen, rack or shutter hung flat on a wall. */
function shutter(facing: Cardinal): Record<string, string> {
  return { facing, half: "top", open: "false", powered: "false", waterlogged: "false" };
}

/**
 * A rack up a wall row: a fence stem with a trapdoor board over it.
 *
 * The armoury's read, and the one every store in this file shares. It is on
 * the wall row and it is two courses at most, so it never body-blocks the
 * circulation and never seals a column: the trapdoor half of it goes through
 * {@link PropCounter.stack}, which refuses a write that would fill the storey.
 */
function rack(ctx: FitOutContext, c: PropCounter, x: number, z: number, facing: Cardinal): boolean {
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, ctx.style["wall.trapdoor"] as string, shutter(facing));
  return true;
}

/** Which way a rack on this wall row turns its board. */
function rackFacing(it: LocalRect, x: number): Cardinal {
  return x === it.x0 ? "east" : "west";
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
export function furnishGarrison(ctx: FitOutContext): number {
  if (!isGarrisonArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "castle":
      fitCastle(ctx, c);
      break;
    case "barbican":
      fitBarbican(ctx, c);
      break;
    case "bastion":
      fitBastion(ctx, c);
      break;
    case "armory":
      fitArmory(ctx, c);
      break;
    case "arsenal":
      fitArsenal(ctx, c);
      break;
    case "bunker":
      fitBunker(ctx, c);
      break;
    case "pillbox":
      fitPillbox(ctx, c);
      break;
    case "guard_post":
      fitGuardPost(ctx, c);
      break;
    case "checkpoint":
      fitCheckpoint(ctx, c);
      break;
    case "beacon_tower":
      fitBeaconTower(ctx, c);
      break;
    case "gravedigger_hut":
      fitGravediggerHut(ctx, c);
      break;
    case "shepherds_bothy":
    default:
      fitShepherdsBothy(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the great fortifications                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `castle` — the keep grand.
 *
 * Everything the keep has, and then the two things that make a castle out of
 * one: **corner turrets**, a course of masonry standing proud of the merlons
 * at the four angles of the parapet, and a **hall** rather than a guardroom —
 * a long board off the middle column, heraldry hung on the side walls behind
 * it, an armoury corner of anvil, smithing table and arms chest.
 *
 * The heraldry is a **wall** banner. A standing banner on a floor cell beside
 * an unmountable platform is a sealed pocket; hung on the wall it is decor
 * that costs the walk nothing.
 */
function fitCastle(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    // The whole wall, plinth to plate: a masonry corner is a quoin, not a post.
    c.n += reclad(ctx, plan, 1, ctx.wallTop, masonry(ctx));
    const deck = battlement(ctx, plan);
    c.n += 1;
    // The turrets: one course proud of the merlons, at the four angles, and
    // only when the envelope has the course to spare.
    // A turret is a column, not a lone capstone: a single block one course
    // proud of the merlons has air on all six faces wherever the crenellation
    // pattern left the corner low — the lint caught six of them. Build the
    // corner up continuously from the deck so every course stands on the one
    // below it.
    const turretY = deck + 3;
    if (turretY <= plan.top) {
      const stone = masonry(ctx);
      for (const cx of [0, plan.sx - 1]) {
        for (const cz of [0, plan.sz - 1]) {
          for (let y = deck + 1; y <= turretY; y++) c.raw(cx, y, cz, stone(cx, y, cz));
        }
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  // The great hall's board, one column off the middle so the lantern hangs
  // over open floor.
  if (boardRoom(it)) board(ctx, c, lamp.x - 1, it.z0 + 2, it.z1 - 2);

  // The armoury corner, all of it on the wall rows.
  c.put1(it.x1, it.z0, "anvil", { facing: "west" });
  c.put1(it.x0, it.z0, "chest", { facing: "east", type: "single" });
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z1, "smithing_table");
  // The high end: a cauldron and a lectern for the muster roll.
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });

  // The heraldry: wall banners at head height, on the side walls behind the
  // high end. `facing` is the way the cloth looks — out of the wall it hangs on.
  const bannerY = Math.min(2, ctx.storyHeight - 1);
  const bz = end.look === "north" ? it.z0 + 1 : it.z1 - 1;
  if (bz >= it.z0 && bz <= it.z1) {
    c.raw(it.x0, bannerY, bz, "red_wall_banner", { facing: "east" });
    c.raw(it.x1, bannerY, bz, "blue_wall_banner", { facing: "west" });
  }
}

/**
 * `barbican` — the gatehouse's outer work.
 *
 * **Tag note:** `barbican` itself is the breadth gatehouse's and stays there;
 * this building answers to `outer_gate` and `gateworks`.
 *
 * The battlement is the keep's. What makes it an outer work is the head of the
 * entrance: a **heavy arch** of masonry stairs springing either side of the
 * doorway, a **murder-hole read** of trapdoors under the soffit of the
 * machicolation course — hung on the stairs above them, so nothing floats —
 * and a guard room inside.
 */
function fitBarbican(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 1, ctx.wallTop, masonry(ctx));
    battlement(ctx, plan);
    c.n += 1;
  }

  const door = ctx.door;
  if (door !== null && plan !== null) {
    const stairs = ctx.style["stone.stairs"] as string;
    const [dx, dz] = cardinalStep(door.face);
    const alongZ = dx !== 0;
    // The arch: springers either side of the door head, turned into the
    // opening, and a masonry keystone over it.
    const archY = Math.min(4, ctx.wallTop - 1);
    for (const k of [-1, 1] as const) {
      const ax = door.x + (alongZ ? 0 : k);
      const az = door.z + (alongZ ? k : 0);
      if (ax < 0 || ax > plan.sx - 1 || az < 0 || az > plan.sz - 1) continue;
      ctx.put(ax, archY, az, stairs, {
        facing: alongZ ? (k < 0 ? "south" : "north") : k < 0 ? "east" : "west",
        half: "top",
        shape: "straight",
      });
      c.n++;
    }

    // The machicolation, in the apron at the parapet line, and the murder
    // holes hanging under it. A trapdoor with `half: "top"` reads as the
    // soffit of the course above it, which is the block that carries it.
    const trapdoor = ctx.style["wall.trapdoor"] as string;
    for (let k = -2; k <= 2; k++) {
      const mx = door.x + dx + (alongZ ? 0 : k);
      const mz = door.z + dz + (alongZ ? k : 0);
      if (mx < -1 || mx > plan.sx || mz < -1 || mz > plan.sz) continue;
      ctx.put(mx, plan.base + 1, mz, ctx.style["stone.stairs"] as string, {
        facing: opposite(door.face),
        half: "top",
        shape: "straight",
      });
      c.n++;
      if (k === 0) continue;
      ctx.put(mx, plan.base, mz, trapdoor, {
        facing: door.face,
        half: "top",
        open: "false",
        powered: "false",
        waterlogged: "false",
      });
      c.n++;
    }
  }

  // The guard room: a stores chest, a water butt, a bench and a barrel.
  const it = ctx.interior;
  c.put1(it.x0, it.z0, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, it.z0, "cauldron", { level: "3" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  // Backrest west, on the wall: the seat opens into the guard room.
  c.put1(it.x0, it.z1, ctx.style["stair.interior"] as string, {
    facing: "west",
    half: "bottom",
    shape: "straight",
  });
}

/**
 * `bastion` — the angular one: a battered plinth and a gun platform.
 *
 * The batter is the read. A bastion's wall leans back out of the ditch, and a
 * block grammar spells that as **banded courses that get lighter as they
 * rise**: the two lowest courses are solid accent masonry, the course above
 * them mixed, the rest primary. Over it the roof is rebuilt as a flat **gun
 * platform** with a parapet — the same battlement the keep wears, which is
 * what a gun deck is. Inside, the powder store: barrel stacks up one wall row
 * behind a rack, and a linstock cauldron at the far end.
 */
function fitBastion(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    const primary = ctx.style["foundation.primary"] as string;
    const accent = ctx.style["foundation.accent"] as string;
    const stone = masonry(ctx);
    c.n += reclad(ctx, plan, 1, ctx.wallTop, (x, y, z) => {
      if (y <= 2) return accent;
      if (y === 3) return stone(x, y, z);
      return primary;
    });
    battlement(ctx, plan);
    c.n += 1;
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  // The powder store: barrels up the west wall row, stacked only where the
  // storey has the headroom for a second course.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    if (!c.put1(it.x0, z, "barrel", { facing: "up", open: "false" })) continue;
    if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, "barrel", { facing: "up", open: "false" });
  }
  // The racks, up the east wall row.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    rack(ctx, c, it.x1, z, rackFacing(it, it.x1));
  }
  // The far end: a linstock cauldron between two crates.
  c.put1(lamp.x, end.z, "cauldron", { level: "3" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "chest", { facing: look, type: "single" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* the stores                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `armory` — rack walls, a smith's corner, crate rows.
 *
 * The building is its walls: a **rack** (a fence stem under a trapdoor board)
 * every other bay up both wall rows, which is what a room full of polearms
 * looks like at block fidelity. There are no armour stands, because an entity
 * is not a block and this pass emits blocks; the read is carried instead by a
 * smithing table with an iron block beside it at the far end.
 */
function fitArmory(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  // The rack walls, both rows, alternating bays and clear of both corners.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    rack(ctx, c, it.x0, z, rackFacing(it, it.x0));
    rack(ctx, c, it.x1, z, rackFacing(it, it.x1));
  }

  // The smith's corner, on the far wall row.
  c.put1(lamp.x, end.z, "smithing_table");
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "iron_block");
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "anvil", { facing: look });

  // The crate rows, at the door end.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "chest", { facing: opposite(look), type: "single" });
}

/**
 * `arsenal` — the armory scaled up, with a powder store behind bars.
 *
 * Three things the armory has not: an **iron-barred partition** shutting off
 * the powder end of one wall row (bars are body-blocking, so they go down
 * through `put1` and the ground floor's own guard refuses any that would
 * strand a cell — a partition that would seal a corner simply does not
 * appear), **shell racks** stacked two high where the storey allows, and a
 * **loading bench** by the door.
 */
function fitArsenal(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  // The powder store: barrel stacks up the west wall row from the far end
  // inward, and then an iron-barred partition on the same row shutting them
  // off. Both are laid **adaptively** rather than at fixed offsets — the far
  // end of a wall row is also where the shell may have put its stair, and a
  // store written at a fixed z is a store that silently does not exist.
  const run: number[] = [];
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) run.push(z);
  if (end.look === "south") run.reverse();
  let stored = 0;
  for (const z of run) {
    if (stored < 3) {
      if (!c.put1(it.x0, z, "barrel", { facing: "up", open: "false" })) continue;
      if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, "barrel", { facing: "up", open: "false" });
      stored++;
      continue;
    }
    // Bars are body-blocking, so this goes through the ground floor's own
    // guard: a partition that would strand a cell simply does not appear.
    if (c.put1(it.x0, z, "iron_bars", { waterlogged: "false" })) break;
  }

  // The shell racks, up the east wall row.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    rack(ctx, c, it.x1, z, rackFacing(it, it.x1));
  }

  // The far end: the proof bench and the smith's plant.
  c.put1(lamp.x, end.z, "smithing_table");
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "anvil", { facing: look });

  // The loading bench, at the door end: a board with a seat drawn up to it.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const bx = it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1;
  table(ctx, c, bx, nearZ);
  c.put1(it.x1, nearZ, ctx.style["stair.interior"] as string, {
    // Backrest east, on the wall: the loader looks west at the bench.
    facing: "east",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x0, nearZ, "chest", { facing: "east", type: "single" });
}

/* -------------------------------------------------------------------------- */
/* the modern works                                                            */
/* -------------------------------------------------------------------------- */

/** The gray, poured-concrete feel the two modern works are re-clad in. */
function concrete(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  return (x, y, z) => {
    if (y <= 1) return "gray_concrete";
    return (x * 5 + y * 3 + z * 11) % 7 === 0 ? "light_gray_concrete" : "gray_concrete";
  };
}

/**
 * `bunker` — low, gray, and lit through slits.
 *
 * The re-clad is the building: every wall course becomes poured concrete,
 * banded darker at the plinth. The **firing slits** are not this file's work —
 * the shell owns windows, and the facade default asks for the narrowest
 * rhythm the grammar has, which is what a slit rhythm is at block fidelity.
 * Inside: a map table with a chair, a cot in the corner, ammunition crates.
 */
function fitBunker(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) c.n += reclad(ctx, plan, 1, ctx.wallTop, concrete(ctx));

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  // The cot corner.
  bedAlcove(ctx, "gray_bed");

  // The map table, on the east side and off the lantern column.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const tx = it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1;
  table(ctx, c, tx, nearZ);
  c.put1(it.x1, nearZ, ctx.style["stair.interior"] as string, {
    facing: "east",
    half: "bottom",
    shape: "straight",
  });

  // The far wall: the watch post's plant.
  c.put1(lamp.x, end.z, "cartography_table");
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "chest", { facing: look, type: "single" });
}

/**
 * `pillbox` — one room, and nothing in it that is not the job.
 *
 * The discipline is the archetype. A concrete re-clad, a slit rhythm the shell
 * cuts, a **mounted position** — a stair turned out of the far wall with an
 * iron block beside it for the mount — and one ammunition crate. Anything more
 * is a bunker, and the catalog already has one of those.
 */
function fitPillbox(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) c.n += reclad(ctx, plan, 1, ctx.wallTop, concrete(ctx));

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);

  // The mounted position, on the far wall row: the backrest is the wall side,
  // so the gunner looks out of the wall the slits are in.
  c.put1(lamp.x, end.z, ctx.style["stair.interior"] as string, {
    facing: end.look,
    half: "bottom",
    shape: "straight",
  });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "iron_block");
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "barrel", { facing: "up", open: "false" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "chest", { facing: "east", type: "single" });
}

/* -------------------------------------------------------------------------- */
/* the outposts                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `guard_post` — a brazier in the apron, a bench inside, a bell to raise.
 *
 * The two exterior props are the archetype, and both are held to the apron
 * rule: a post stands on the **actual** ground, so its column is filled from
 * local y0 whenever the terrain has not filled it. The brazier is a campfire
 * on a masonry pedestal; the alarm bell stands on a pedestal of its own with
 * `attachment: "floor"`, which is the one attachment the lint can verify from
 * the block under it.
 */
function fitGuardPost(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null && ctx.door !== null) {
    const pedestal = ctx.style["foundation.accent"] as string;
    const face = ctx.door.face;
    const stand: { x: number; z: number }[] = [];
    for (const cell of apronOf(plan.sx, plan.sz)) {
      const onFace =
        (face === "north" && cell.z === -1) ||
        (face === "south" && cell.z === plan.sz) ||
        (face === "west" && cell.x === -1) ||
        (face === "east" && cell.x === plan.sx);
      if (!onFace || onWayIn(ctx, cell.x, cell.z)) continue;
      const along = face === "north" || face === "south" ? cell.x : cell.z;
      // The two corners of the door face, and nothing between them: the walk
      // along the front of a guard post has to stay a walk.
      if (along === 0 || along === (face === "north" || face === "south" ? plan.sx - 1 : plan.sz - 1)) {
        stand.push(cell);
      }
    }
    const brazier = stand[0];
    if (brazier !== undefined) {
      apronPost(ctx, c, brazier.x, brazier.z, pedestal, 2);
      c.raw(brazier.x, 3, brazier.z, "campfire", {
        facing: opposite(face),
        lit: "false",
        signal_fire: "false",
        waterlogged: "false",
      });
    }
    const belfry = stand[1];
    if (belfry !== undefined) {
      apronPost(ctx, c, belfry.x, belfry.z, pedestal, 2);
      c.raw(belfry.x, 3, belfry.z, "bell", {
        facing: opposite(face),
        attachment: "floor",
        powered: "false",
      });
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);

  // The watch bench, on the far wall row and turned into the room.
  c.put1(lamp.x, end.z, ctx.style["stair.interior"] as string, {
    facing: end.look,
    half: "bottom",
    shape: "straight",
  });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "cauldron", { level: "3" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/**
 * `checkpoint` — a barrier arm across the apron, a document desk inside.
 *
 * The arm is the read, and the doorstep is the constraint: the physics lint
 * walks a building from the cell inside its front door, and a boom laid over
 * that cell is a building with no way in. So the arm is built as a **pair of
 * grounded posts** standing off the door line with a trapdoor boom spanning
 * between them, and the three cells at the middle of the face — the doorstep
 * and its two neighbours — are left clear.
 *
 * The lantern posts are the same grounded columns with a lantern on top: a
 * lantern is a support-chain block, so it stands on a column that reaches the
 * ground or it does not stand at all.
 */
function fitCheckpoint(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  const door = ctx.door;
  if (plan !== null && door !== null) {
    const fence = ctx.style["wall.fence"] as string;
    const trapdoor = ctx.style["wall.trapdoor"] as string;
    const [dx, dz] = cardinalStep(door.face);
    const alongZ = dx !== 0;
    const stepX = door.x + dx;
    const stepZ = door.z + dz;
    for (let k = -3; k <= 3; k++) {
      if (Math.abs(k) <= 1) continue; // the doorstep and its neighbours
      const bx = stepX + (alongZ ? 0 : k);
      const bz = stepZ + (alongZ ? k : 0);
      if (bx < -1 || bx > plan.sx || bz < -1 || bz > plan.sz) continue;
      if (onWayIn(ctx, bx, bz)) continue;
      if (Math.abs(k) === 3) {
        // The post, and the lantern on top of it.
        apronPost(ctx, c, bx, bz, fence, 2);
        c.raw(bx, 3, bz, "lantern", { hanging: "false", waterlogged: "false" });
        continue;
      }
      // The boom: a trapdoor at arm height, carried by the post beside it.
      c.raw(bx, 2, bz, trapdoor, {
        facing: door.face,
        half: "bottom",
        open: "true",
        powered: "false",
        waterlogged: "false",
      });
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  // The document desk, on the east side, with the clerk's seat on the wall.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const dxCol = it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1;
  table(ctx, c, dxCol, nearZ);
  c.put1(it.x1, nearZ, ctx.style["stair.interior"] as string, {
    facing: "east",
    half: "bottom",
    shape: "straight",
  });
  // The far end: the register, the stamp bench and the stores.
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "chest", { facing: look, type: "single" });
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `beacon_tower` — the bell tower militarised.
 *
 * The masonry and the battlement are the keep's. What makes it a beacon is the
 * **fire basket**: a solid masonry pedestal standing on the fighting deck at
 * the middle of the plan, with a signal campfire on top of it. Both are inside
 * the height budget by construction — the deck sits at `wallTop + 1` and the
 * roof plan refuses to run at all unless there are two courses above it — and
 * the roof clear has already emptied everything over the deck, so nothing
 * clips the fire.
 *
 * Inside, signal banners hang on the wall behind the watch bench.
 */
function fitBeaconTower(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 1, ctx.wallTop, masonry(ctx));
    const deck = battlement(ctx, plan);
    c.n += 1;
    const mx = Math.floor((plan.sx - 1) / 2);
    const mz = Math.floor((plan.sz - 1) / 2);
    const pedestalY = deck + 1;
    const fireY = deck + 2;
    // The roof plan guarantees `top - base >= 2`, so both courses are inside
    // the budget; the assertion is restated as a guard rather than assumed.
    if (fireY <= plan.top) {
      c.raw(mx, pedestalY, mz, ctx.style["foundation.accent"] as string);
      c.raw(mx, fireY, mz, "campfire", {
        facing: "north",
        lit: "false",
        signal_fire: "true",
        waterlogged: "false",
      });
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);

  // The watch bench and the fuel store, on the far wall row.
  c.put1(lamp.x, end.z, ctx.style["stair.interior"] as string, {
    facing: end.look,
    half: "bottom",
    shape: "straight",
  });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "chest", { facing: opposite(end.look), type: "single" });

  // The signal banners, hung on the side walls at head height.
  const bannerY = Math.min(2, ctx.storyHeight - 1);
  const bz = end.look === "north" ? it.z0 + 1 : it.z1 - 1;
  if (bz >= it.z0 && bz <= it.z1) {
    c.raw(it.x0, bannerY, bz, "orange_wall_banner", { facing: "east" });
    c.raw(it.x1, bannerY, bz, "orange_wall_banner", { facing: "west" });
  }
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* the two small outbuildings                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `gravedigger_hut` — tool racks, a coffin bench, and one lantern's comfort.
 *
 * Modest by definition: a rack of spades up one wall row, a slab **coffin
 * bench** down the other, a lantern standing on the floor of the wall row at
 * the door end (it is a support-chain block, and the floor is the support),
 * and a barrel of lime. Nothing in the middle of the room.
 */
function fitGravediggerHut(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);
  const slab = ctx.style["stone.slab"] as string;

  // The tool racks, up the west wall row.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    rack(ctx, c, it.x0, z, rackFacing(it, it.x0));
  }
  // The coffin bench, down the east wall row: a top slab is a bench at any
  // storey height, which the trestle is not.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x1, z, slab, { type: "top", waterlogged: "false" });
  }
  // The far wall: the lime store and the digger's fire.
  c.put1(lamp.x, end.z, "campfire", {
    facing: look,
    lit: "false",
    signal_fire: "false",
    waterlogged: "false",
  });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "composter", { level: "0" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "lantern", { hanging: "false", waterlogged: "false" });
  c.put1(it.x1, nearZ, "chest", { facing: opposite(look), type: "single" });
}

/**
 * `shepherds_bothy` — a one-room stone hut on the hill.
 *
 * A cot against a wall, a hearth with a stool turned to it, a crook rack, and
 * **fleece bales** — white wool on the wall row, stacked only where the storey
 * has the headroom for a second course. The re-clad is deliberate and cheap:
 * the walls become the shell's own stone, because a bothy is what a shepherd
 * builds out of what is lying about.
 */
function fitShepherdsBothy(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const primary = ctx.style["foundation.primary"] as string;
    const stone = masonry(ctx);
    c.n += reclad(ctx, plan, 2, ctx.wallTop - 1, (x, y, z) =>
      y === 2 || y === ctx.wallTop - 1 ? primary : stone(x, y, z),
    );
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  bedAlcove(ctx, "white_bed");

  // The fleece bales, up the east wall row.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    if (!c.put1(it.x1, z, "white_wool")) continue;
    if (ctx.storyHeight >= 4) c.stack(it.x1, z, 2, "white_wool");
  }
  // The crook rack, at the door end of the east wall.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  rack(ctx, c, it.x1, nearZ, rackFacing(it, it.x1));

  // The hearth at the head of the room, with the stool beside it — backrest
  // away from the fire, so the shepherd faces it.
  c.put1(lamp.x, end.z, "campfire", {
    facing: look,
    lit: "false",
    signal_fire: "false",
    waterlogged: "false",
  });
  if (lamp.x + 1 <= it.x1) {
    c.put1(lamp.x + 1, end.z, ctx.style["stair.interior"] as string, {
      facing: "east",
      half: "bottom",
      shape: "straight",
    });
  }
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "cauldron", { level: "3" });
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
}
