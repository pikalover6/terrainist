/**
 * Archetype breadth, **wave four A** — twelve dwellings.
 *
 * `archetypes.ts` owns the first six archetypes and the tag table;
 * `archetypes-civic.ts` owns the extended set, the walkability guard and the
 * exterior flourishes; `archetypes-blitz.ts` states the design law this file
 * obeys and every later wave restates. This file owns the **residential**
 * corner of the catalog: the buildings people live in, from a one-room hut to
 * a mansion, by way of a farmhouse, a townhouse, a terraced row, a manor, a
 * longhouse, a bungalow, a log cabin, a courtyard house, a dormitory and an
 * almshouse.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * Read the header of `archetypes-blitz.ts` in full; it is the normative
 * statement. The short form: a fit-out runs **after** every shape stage and
 * writes into the same cell map, so it can re-clad a wall, trim an apron and
 * rebuild a roof without a line of `core.ts` changing — and every invariant
 * the shell already guarantees still holds. A log cabin is the house shell
 * with its wall field re-clad in horizontal logs; a terraced row is the same
 * shell with masonry party piers banding the facade. Neither is a new grammar.
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
 * Every one of these cost a walkthrough, and every one is a rule here rather
 * than a comment:
 *
 * - a **stair's `facing` is its high half** — the backrest. A mead bench on
 *   the west wall therefore faces *west*, so the drinker looks into the room;
 * - a bare `flower_pot` renders **empty**. Every pot here goes through
 *   {@link pottedAt}, imported from wave two rather than restated, because two
 *   exported helpers of one name in one barrel is an ambiguity TypeScript
 *   resolves by dropping both;
 * - the shell hangs a **lantern over the middle column** of the room at head
 *   height. Nothing here routes a one-cell walkway through that column: the
 *   dormitory's aisle is the whole middle of the room, the mansion's ranges
 *   stand two cells off the wall and clear of it, and the courtyard house's
 *   court is deliberately *empty*;
 * - the fence-and-pressure-plate trestle is refused by the stack guard under a
 *   three-course storey, so {@link table} switches to a top slab there;
 * - **nothing body-blocking on width-1 circulation.** Larders, lockers and
 *   hearths all stand on the wall rows;
 * - beds are laid **whole pair or neither**, head to the wall, by `placeBed`;
 * - **an apron prop stands on the actual ground.** On conformed terrain the
 *   apron fills local y0; on a platform it sits one lower, and a post starting
 *   on air fails the lint's support-chain rule. Every apron post here checks
 *   `blockAt(x, 0, z)` and fills the gap first — the stilt/veranda lesson;
 * - **no sign blocks.** A sign is a block entity the op stream cannot carry;
 *   signage is a banner.
 */

import { bracketedTo, cardinalStep, type Cardinal, type LocalRect } from "./core.js";
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
export const RESIDENTIAL_BUILDING_ARCHETYPES = [
  "farmhouse",
  "townhouse",
  "terraced_row",
  "manor_house",
  "mansion",
  "longhouse",
  "bungalow",
  "hut",
  "log_cabin",
  "courtyard_house",
  "dormitory",
  "almshouse",
] as const;

/** One of the archetypes this file fits out. */
export type ResidentialBuildingArchetype =
  (typeof RESIDENTIAL_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isResidentialArchetype(
  value: string,
): value is ResidentialBuildingArchetype {
  return (RESIDENTIAL_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the institutions and *before* the extended table, for the
 * reason every later wave sits there: the tables below are greedy.
 *
 * The vocabulary is deliberately thin — the archetype's own id, plus at most
 * one synonym nothing else wants — because this is the wave most likely to
 * steal a tag by accident. Four near misses, each one a tag this table
 * **does not** claim:
 *
 * - `house` stays the fallback it has always been: a document tagged `house`
 *   gets a cottage, which is the right small dwelling and the tag the road
 *   network selects on;
 * - `hall` stays the great hall's. The longhouse answers to `longhouse` and
 *   `mead_hall`, never to bare `hall`;
 * - `apartment`, `flats` and `tenement` belong to the tall grammar's
 *   apartment block, so nothing here reaches for them;
 * - `villa` is the Mediterranean villa's and `riad` the riad's; the courtyard
 *   house takes `courtyard_house` and `courtyard` only.
 *
 * `hut` bare is claimed here. A compound `witch_hut` is a different id on a
 * different track, and `has` is an exact match — claiming `hut` cannot take it.
 */
export function residentialArchetypeOfTags(
  tags: readonly string[],
): ResidentialBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("farmhouse") || has("farmstead")) return "farmhouse";
  if (has("townhouse") || has("town_house")) return "townhouse";
  if (has("terraced_row") || has("terrace")) return "terraced_row";
  if (has("manor_house") || has("manor")) return "manor_house";
  if (has("mansion") || has("estate_house")) return "mansion";
  if (has("longhouse") || has("mead_hall")) return "longhouse";
  if (has("bungalow") || has("ranch_house")) return "bungalow";
  if (has("hut") || has("shack")) return "hut";
  if (has("log_cabin") || has("cabin")) return "log_cabin";
  if (has("courtyard_house") || has("courtyard")) return "courtyard_house";
  if (has("dormitory") || has("dorm")) return "dormitory";
  if (has("almshouse") || has("hospice")) return "almshouse";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one.
 */
export function residentialFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    // A working house: broad, plain lights and a roof that sheds.
    case "farmhouse":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Genteel and narrow-fronted: tall sashes, one per bay.
    case "townhouse":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    // The bays are the whole point, so the rhythm has to be even.
    case "terraced_row":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "manor_house":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    // Every light a wall can carry, and a hip that reads as a range.
    case "mansion":
      return { windowShape: "tall", windowRhythm: "dense", roof: "hip" };
    // A hall lit by holes: few, small, high.
    case "longhouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "bungalow":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    case "hut":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "log_cabin":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    // Blank to the street, open to the middle.
    case "courtyard_house":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "dormitory":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "almshouse":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
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
 * Wave two's `Wave2Plan` in every respect; restated here rather than imported
 * because the two waves are separate seams and a shared private helper is a
 * shared edit. The refusal is the same: a **plain rect** only — an L has a
 * reflex corner none of these routines has a rule for.
 */
interface ResiPlan {
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
function wallPlan(ctx: FitOutContext): ResiPlan | null {
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
 * The physics lint walks a building **from its door**; a porch post written
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
 * On conformed terrain the apron ground fills local y0; on a platform (the
 * Terrarium) it sits one lower, and a post whose column starts at y1 is a
 * column standing on air, which the lint's support-chain rule rightly refuses.
 * Filling y0 first closes the gap — and a two-course post is a better post.
 */
function apronPost(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  block: string,
  toY: number,
): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block);
  for (let y = 1; y <= toY; y++) c.raw(x, y, z, block);
}

/**
 * Blocks a re-clad may never overwrite.
 *
 * Wave two's list unchanged: the way in, the way up, the fire, the glass and
 * anything the physics lint holds to a support rule.
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
  plan: ResiPlan,
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

/**
 * A slab cornice in the apron at the plate line.
 *
 * The courthouse's trim, which is the cheapest way to make a box dignified,
 * and the one exterior gesture three of the genteel houses here share.
 */
function cornice(ctx: FitOutContext, c: PropCounter, plan: ResiPlan): void {
  const slabBlock = ctx.style["stone.slab"] as string;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    c.raw(cell.x, ctx.wallTop, cell.z, slabBlock, { type: "top", waterlogged: "false" });
  }
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * Wave two's rule verbatim: the trestle — a fence stem under a pressure plate
 * — is two blocks in one column and is refused by the stack guard under a
 * three-course storey, so a top slab stands in for it there.
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
 * The blitz file's `hallTable`, restated: the board is laid cell by cell and a
 * seat is only put beside a cell the board actually reached, so a run broken
 * by the door approach or a stair column never leaves a diner facing air. The
 * seat rule applies — a chair's `facing` is its backrest, so the west seat
 * faces west and the sitter looks east at the board beside them.
 */
function board(ctx: FitOutContext, c: PropCounter, x: number, z0: number, z1: number): number[] {
  const laid: number[] = [];
  for (let z = z0; z <= z1; z++) {
    // A cross lane every fourth bay. A board laid unbroken down a long room is
    // a wall with plates on it: the two halves of the floor can then only meet
    // round its ends, and the door approach or the far wall's furniture can
    // close either of those without anything here noticing.
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
 * needs a lane past it as well as the two wall rows. Under nine interior
 * columns there is no such room, and the honest answer is a room with no long
 * table in it rather than a room cut in half by one.
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

/** Trapdoor props for a panel, screen or shutter hung flat against a wall. */
function shutter(facing: Cardinal): Record<string, string> {
  return { facing, half: "top", open: "false", powered: "false", waterlogged: "false" };
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
export function furnishResidential(ctx: FitOutContext): number {
  if (!isResidentialArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "farmhouse":
      fitFarmhouse(ctx, c);
      break;
    case "townhouse":
      fitTownhouse(ctx, c);
      break;
    case "terraced_row":
      fitTerracedRow(ctx, c);
      break;
    case "manor_house":
      fitManorHouse(ctx, c);
      break;
    case "mansion":
      fitMansion(ctx, c);
      break;
    case "longhouse":
      fitLonghouse(ctx, c);
      break;
    case "bungalow":
      fitBungalow(ctx, c);
      break;
    case "hut":
      fitHut(ctx, c);
      break;
    case "log_cabin":
      fitLogCabin(ctx, c);
      break;
    case "courtyard_house":
      fitCourtyardHouse(ctx, c);
      break;
    case "dormitory":
      fitDormitory(ctx, c);
      break;
    case "almshouse":
    default:
      fitAlmshouse(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* working houses                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `farmhouse` — a kitchen hearth you could roast an ox at, a larder, a boot
 * room by the door.
 *
 * The far wall is the **kitchen range**: a smoker and a furnace either side of
 * a cauldron, with a crafting bench at one end of them, all on the wall row so
 * the middle of the floor stays the room a farm kitchen actually needs. One
 * side wall is the **larder** — barrels and hay, stacked only where the storey
 * has the headroom. The door end is the **boot room**: a chest, a composter
 * and a pot, on the two near corners.
 */
function fitFarmhouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  // The range, across the far wall.
  c.put1(lamp.x, end.z, "cauldron", { level: "3" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "smoker", { facing: look, lit: "false" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "furnace", { facing: look, lit: "false" });
  c.put1(it.x0, end.z, "crafting_table");
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });

  // The larder, up the west wall: barrels and hay, and never to the joists.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    const store = (z - it.z0) % 4 === 0 ? "barrel" : "hay_block";
    const props = store === "barrel" ? { facing: "up", open: "false" } : undefined;
    if (!c.put1(it.x0, z, store, props)) continue;
    if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, store, props);
  }

  // The kitchen board, down the column beside the east wall — off the middle,
  // so the lantern hangs over open floor.
  if (boardRoom(it)) board(ctx, c, it.x1 - 1, it.z0 + 2, it.z1 - 2);

  // The boot room, at the door end.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "chest", { facing: opposite(look), type: "single" });
  c.put1(it.x1, nearZ, "composter", { level: "0" });
  if (it.z0 + 1 <= it.z1) c.put1(it.x0, nearZ === it.z1 ? nearZ - 1 : nearZ + 1, pottedAt(it.x0, nearZ));
}

/**
 * `townhouse` — narrow-fronted and genteel: a parlour, a stair hall read, tall
 * windows.
 *
 * Outside, the shell is re-clad in **brick** with a stone band at the plinth
 * head and under the plate, and a slab cornice in the apron: a townhouse is a
 * brick box that takes itself seriously. Inside, the west column is the **stair
 * hall** — a carpet runner up the wall row, which reads as a hall without
 * taking a cell of the room's width away from the walk — and the east side is
 * the **parlour**: a table with a chair drawn up to it, a bookshelf and a pot.
 */
function fitTownhouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const band = ctx.style["foundation.primary"] as string;
    // A quoin is a stair, and a stair is not a face. Any wall cell something
    // is already bolted to stays a full cube — otherwise the brick pattern
    // pulls the wall out from behind the shallow-plan ladder `core.ts` fell
    // back to, which is `unsupported.ladder` on a backing that pass explicitly
    // claimed. The pattern is a pure function of position, so skipping a cell
    // here is still deterministic and opposite walls still agree.
    const quoin = (x: number, y: number, z: number): boolean =>
      (x * 3 + y * 5 + z * 7) % 11 === 0 && !bracketedTo(ctx.blockAt, x, y, z);
    c.n += reclad(ctx, plan, 2, ctx.wallTop - 1, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop - 1) return band;
      return quoin(x, y, z) ? "brick_stairs" : "bricks";
    },
    (x, y, z) => {
      if (y === 2 || y === ctx.wallTop - 1) return undefined;
      if (!quoin(x, y, z)) return undefined;
      // A stair in the wall field is a quoin: it needs a facing, and it faces
      // out of the wall it stands in.
      const facing: Cardinal = x === 0 ? "west" : x === plan.sx - 1 ? "east" : z === 0 ? "north" : "south";
      return { facing, half: "bottom", shape: "straight", waterlogged: "false" };
    });
    cornice(ctx, c, plan);
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  // The hall runner, up the west wall row. Carpet is passable to the take
  // guard, and a strip on a wall column cannot cut the floor in two — as long
  // as it stops short of the corners, which a runner that reached them could
  // box in against whatever stands on the end row.
  for (let z = it.z0 + 2; z <= it.z1 - 2; z++) c.put1(it.x0, z, "red_carpet");
  // The parlour, on the east side.
  const px = it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1;
  table(ctx, c, px, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1);
  c.put1(it.x1, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1, ctx.style["stair.interior"] as string, {
    // Backrest east, against the wall: the sitter looks west at the table.
    facing: "east",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x1, end.z, "bookshelf");
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/**
 * `terraced_row` — party-wall piers banding the facade, and a modest interior.
 *
 * The read is the **bay**: a stone-brick party pier every fourth column, a
 * plinth band and an eaves band between them, and plain plank infill in the
 * panels. That is what a row of houses built as one building looks like from
 * the street, and it is the reason this archetype exists as something other
 * than a long cottage.
 *
 * The inside is modest on purpose — a table, a chair, a chest, a barrel and a
 * pot. A terraced house is not a manor with more windows.
 */
function fitTerracedRow(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const infill = ctx.style["wall.primary"] as string;
    c.n += reclad(ctx, plan, 2, ctx.wallTop - 1, (x, y, z) => {
      const onX = x === 0 || x === plan.sx - 1;
      const along = onX ? z : x;
      // The piers: every fourth column of every wall. Both corners of a wall
      // are `along = 0` on one of its two axes, so a bay always has a pier at
      // each end of it without the rule needing a corner case.
      if (along % 4 === 0) return "stone_bricks";
      // The bands: the plinth head and the course under the plate.
      if (y === 2 || y === ctx.wallTop - 1) return "stone_bricks";
      return infill;
    });
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const tx = it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0;
  table(ctx, c, tx, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1);
  c.put1(it.x0, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1, ctx.style["stair.interior"] as string, {
    // Backrest west, on the wall: the sitter looks east at the table.
    facing: "west",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x1, end.z, "chest", { facing: "west", type: "single" });
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/* -------------------------------------------------------------------------- */
/* the great houses                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `manor_house` — a panelled hall, a long table, a study corner.
 *
 * The panelling is a course of trapdoors laid flat against both side walls at
 * shoulder height: the cheapest honest wainscot the block palette has, and it
 * costs no floor. The hall runs down a column **beside** the middle of the
 * room rather than through it, because the shell hangs its lantern over the
 * middle and a board there is a board under a light. The far end is the
 * **study**: a lectern with bookshelves either side of it.
 */
function fitManorHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) cornice(ctx, c, plan);

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const look: Cardinal = end.look === "north" ? "south" : "north";

  // The study, across the far wall.
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "bookshelf");
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "bookshelf");

  // The panelling: a dado of trapdoors on the two side walls at shoulder
  // height, over cells whose floor is clear so no column is ever sealed.
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  const dadoY = Math.min(2, ctx.storyHeight - 1);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    c.stack(it.x0, z, dadoY, trapdoor, shutter("east"));
    c.stack(it.x1, z, dadoY, trapdoor, shutter("west"));
  }

  // The long table, one column west of the middle.
  if (boardRoom(it)) board(ctx, c, lamp.x - 1, it.z0 + 2, it.z1 - 2);

  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/**
 * `mansion` — a double range, gallery rugs, and a lantern the furniture keeps
 * clear of.
 *
 * Two boards, one either side of the middle of the room, with seats between
 * them — the double range of a house that entertains. Both side wall rows are
 * carpeted as **galleries**, which reads as a house with corridors rather than
 * rooms and, because a strip on a wall column cannot cut a floor in two, costs
 * the walk nothing.
 *
 * The middle column is left **empty**, deliberately and by name: the shell
 * hangs its light there and a mansion's chandelier wants a floor under it, not
 * a sideboard.
 */
function fitMansion(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) cornice(ctx, c, plan);

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const width = it.x1 - it.x0 + 1;

  // The galleries: carpet up both wall rows — but never into the corners.
  // A runner that reaches the end of its wall boxes the corner cell in
  // between itself and whatever stands on the end row, and a stranded corner
  // is exactly the defect the walkability guard exists to catch.
  for (let z = it.z0 + 2; z <= it.z1 - 2; z++) {
    c.put1(it.x0, z, "red_carpet");
    c.put1(it.x1, z, "red_carpet");
  }

  // The double range. Two boards need nine columns of room: two wall rows,
  // two boards, two seat columns each and the open middle. Under that, one.
  // Two boards need thirteen interior columns: two carpeted wall rows, two
  // boards with a seat column either side of each, and the open middle. A
  // narrower room gets one, and it stands one column off the middle rather
  // than two — a single range at `lamp.x - 2` puts its west seats hard against
  // the west gallery and strands the lane between them.
  const columns = width >= 13 ? [lamp.x - 3, lamp.x + 3] : width >= 9 ? [lamp.x - 1] : [];
  for (const bx of columns) {
    if (bx <= it.x0 + 1 || bx >= it.x1 - 1) continue;
    board(ctx, c, bx, it.z0 + 2, it.z1 - 2);
  }

  // The state end: a lectern between two bookshelves, all on the wall row.
  const look: Cardinal = end.look === "north" ? "south" : "north";
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "bookshelf");
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "bookshelf");
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, nearZ, pottedAt(it.x0, nearZ));
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/**
 * `longhouse` — mead benches up both walls, shields between them, a hearth at
 * the head.
 *
 * The benches are stairs on the wall rows with their **backrests to the wall**
 * — a stair's `facing` is its high half, so the west bench faces west and the
 * drinker looks into the room, which is the whole point of a mead hall. Banners
 * stand between the bench runs as hung shields; they are banners and not signs
 * because a sign is a block entity the op stream cannot carry.
 *
 * The hearth is at the head of the hall on the far wall row, not in the middle
 * of the floor: a campfire is a body-blocking cell and a body-blocking cell on
 * a narrow floor seals the hall it is supposed to warm.
 */
function fitLonghouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const bench = ctx.style["stair.interior"] as string;

  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    const bay = (z - it.z0) % 3;
    if (bay === 2) {
      // The shields, in the gap between one bench run and the next.
      c.put1(it.x0, z, "red_banner", { rotation: "4" });
      c.put1(it.x1, z, "blue_banner", { rotation: "12" });
      continue;
    }
    c.put1(it.x0, z, bench, { facing: "west", half: "bottom", shape: "straight" });
    c.put1(it.x1, z, bench, { facing: "east", half: "bottom", shape: "straight" });
  }

  // The hearth at the head of the hall, with the ale store either side.
  const look: Cardinal = end.look === "north" ? "south" : "north";
  c.put1(lamp.x, end.z, "campfire", {
    facing: look,
    lit: "false",
    signal_fire: "false",
    waterlogged: "false",
  });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "chest", { facing: opposite(look), type: "single" });
  c.put1(it.x1, nearZ, "chest", { facing: opposite(look), type: "single" });
}

/* -------------------------------------------------------------------------- */
/* small houses                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `bungalow` — one comfortable storey, and a porch in the apron.
 *
 * The porch is posts and a slab canopy along the **door face only**, standing
 * clear of the doorstep and rising from the actual ground: on a platform the
 * apron sits one course lower than on conformed terrain, and a post that
 * starts at y1 there is a post standing on air. Inside is a home — a bed, a
 * table with a chair, a chest, a hearth cauldron and a pot.
 */
function fitBungalow(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null && ctx.door !== null) {
    const fence = ctx.style["wall.fence"] as string;
    const canopy = ctx.style["stone.slab"] as string;
    const canopyY = Math.max(2, Math.min(ctx.storyHeight, ctx.wallTop - 1));
    const face = ctx.door.face;
    for (const cell of apronOf(plan.sx, plan.sz)) {
      // The door face's own strip of apron, and nothing else: a porch that
      // wrapped the whole building would be a veranda, which is a different
      // archetype in a different file.
      const onFace =
        (face === "north" && cell.z === -1) ||
        (face === "south" && cell.z === plan.sz) ||
        (face === "west" && cell.x === -1) ||
        (face === "east" && cell.x === plan.sx);
      if (!onFace || onWayIn(ctx, cell.x, cell.z)) continue;
      const along = face === "north" || face === "south" ? cell.x : cell.z;
      if (along % 2 === 0 && along >= 0) apronPost(ctx, c, cell.x, cell.z, fence, canopyY - 1);
      c.raw(cell.x, canopyY, cell.z, canopy, { type: "bottom", waterlogged: "false" });
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  bedAlcove(ctx, "light_blue_bed");
  const tx = it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1;
  table(ctx, c, tx, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1);
  c.put1(it.x1, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1, ctx.style["stair.interior"] as string, {
    // Backrest east, on the wall: the sitter looks west at the table.
    facing: "east",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x1, end.z, "cauldron", { level: "3" });
  c.put1(it.x0, end.z, "chest", { facing: "east", type: "single" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/**
 * `hut` — a cot, a stool by the fire, a tool chest. Nothing else.
 *
 * The discipline is the archetype. A hut with a bookshelf in it is a cottage,
 * and the catalog already has one of those. Everything stands on a wall row,
 * so the one room is one room.
 */
function fitHut(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  bedAlcove(ctx, "brown_bed");
  // The fire on the far wall row, and the stool beside it — backrest away
  // from the fire, so the sitter faces it.
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
  c.put1(it.x1, end.z, "chest", { facing: "west", type: "single" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `log_cabin` — a full log re-clad, laid horizontally, and fur rugs.
 *
 * The re-clad is the building. Every course of the wall ring becomes the
 * theme's own **log**, with its axis running *along* the wall it stands in —
 * horizontal logs are what a cabin is, and a log with `axis: "y"` is a fence
 * post pretending. The corners take the cross axis, which is the notched
 * corner read at the only fidelity a block has.
 *
 * Inside: a bed, fur rugs up the wall rows, a bench by the fire and a
 * crafting corner. Rustic fit, nothing spare.
 */
function fitLogCabin(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const log = ctx.style["wall.accent"] as string;
    c.n += reclad(
      ctx,
      plan,
      2,
      ctx.wallTop,
      () => log,
      (x, _y, z) => {
        const onX = x === 0 || x === plan.sx - 1;
        const onZ = z === 0 || z === plan.sz - 1;
        // A corner takes the x axis so the two walls interlock rather than
        // both running into the same block on the same axis.
        if (onX && onZ) return { axis: "x" };
        return { axis: onX ? "z" : "x" };
      },
    );
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);

  bedAlcove(ctx, "brown_bed");
  // The furs, up the east wall row and short of both corners.
  for (let z = it.z0 + 2; z <= it.z1 - 2; z++) {
    c.put1(it.x1, z, (z - it.z0) % 2 === 0 ? "white_carpet" : "brown_carpet");
  }
  c.put1(lamp.x, end.z, "campfire", {
    facing: look,
    lit: "false",
    signal_fire: "false",
    waterlogged: "false",
  });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "crafting_table");
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "chest", { facing: opposite(look), type: "single" });
}

/* -------------------------------------------------------------------------- */
/* houses round something                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `courtyard_house` — the riad idiom secularised: an open middle, planted
 * corners, a colonnade.
 *
 * The court is what is **not** built. The middle of the room and every cell
 * touching it are left bare — which is also, exactly, the rule the lantern
 * column asks for — and the read is made by what surrounds it: a fence
 * colonnade down both wall rows, a planted pot at each of the four interior
 * corners, and a cauldron well on the far wall.
 *
 * The building keeps its plain shell on purpose: a courtyard house is blank to
 * the street and open to the middle, and the blankness is half the idea.
 */
function fitCourtyardHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const fence = ctx.style["wall.fence"] as string;

  // The colonnade: posts on the wall rows every other bay.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    c.put1(it.x0, z, fence);
    c.put1(it.x1, z, fence);
  }
  // The planted corners.
  c.put1(it.x0, it.z0, pottedAt(it.x0, it.z0));
  c.put1(it.x1, it.z0, pottedAt(it.x1, it.z0));
  c.put1(it.x0, it.z1, pottedAt(it.x0, it.z1));
  c.put1(it.x1, it.z1, pottedAt(it.x1, it.z1));
  // The well, on the far wall row, and the store opposite it.
  const lamp = lanternColumn(it);
  c.put1(lamp.x, end.z, "cauldron", { level: "3" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(lamp.x, nearZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `dormitory` — bunk ranges up both walls, lockers between them, one broad
 * aisle down the middle.
 *
 * The cots are `placeBed`'s, head to the wall and foot into the room, laid
 * whole pair or neither. The second range only runs when the room is **seven
 * wide or more**, which is the school's and the infirmary's rule for the same
 * reason: two ranges in a five-wide room leave a single-cell corridor straight
 * through the column the shell hangs its lantern in, and that is a room with a
 * wall across the middle of it.
 *
 * The lockers are barrels on the wall rows in the gaps between cot heads.
 */
function fitDormitory(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const width = it.x1 - it.x0 + 1;
  const ranges: readonly { readonly x: number; readonly wall: number; readonly facing: Cardinal }[] =
    width >= 7
      ? [
          { x: it.x0 + 1, wall: it.x0, facing: "west" },
          { x: it.x1 - 1, wall: it.x1, facing: "east" },
        ]
      : [{ x: it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, wall: it.x0, facing: "west" }];

  for (const range of ranges) {
    for (let z = it.z0; z <= it.z1; z += 2) {
      ctx.placeBed(range.x, z, range.facing, "white_bed");
    }
    // The lockers, on the wall row in the gaps between the cot heads.
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      c.put1(range.wall, z, "barrel", { facing: "up", open: "false" });
    }
  }

  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  // The common end: a wash cauldron and the linen chest, on the far wall.
  c.put1(lamp.x, end.z, "cauldron", { level: "3" });
  if (lamp.x + 1 <= it.x1) {
    c.put1(lamp.x + 1, end.z, "chest", {
      facing: end.look === "north" ? "south" : "north",
      type: "single",
    });
  }
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(lamp.x, nearZ, pottedAt(lamp.x, nearZ));
}

/**
 * `almshouse` — a row of identical little cells, and one shared hearth room.
 *
 * Each cell is a bed and a chest in a bay of the west range, with a fence
 * partition on the wall row between one bay and the next: identical, small and
 * repeated, which is the whole architecture of charity housing. The far end is
 * the **common room** — a hearth furnace, a cauldron and a bench turned to the
 * fire — and it is shared, because that is what an almshouse *is*.
 */
function fitAlmshouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);
  const fence = ctx.style["wall.fence"] as string;
  const cellX = it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0;

  // The cells: one bed per bay of three, with a chest beside its head and a
  // partition on the wall row between it and the next.
  for (let z = it.z0 + 1; z + 1 <= it.z1 - 1; z += 3) {
    ctx.placeBed(cellX, z, "west", "white_bed");
    c.put1(it.x0, z + 1, "chest", { facing: "east", type: "single" });
    if (z + 2 <= it.z1 - 1) c.put1(it.x0, z + 2, fence);
  }

  // The common room, across the far wall.
  c.put1(lamp.x, end.z, "furnace", { facing: look, lit: "false" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "cauldron", { level: "3" });
  if (lamp.x - 1 >= it.x0) {
    // The bench, one cell out from the fire wall: the backrest is on the wall
    // side, so the sitter looks away from the wall and into the room.
    c.put1(lamp.x - 1, end.z, ctx.style["stair.interior"] as string, {
      facing: end.look,
      half: "bottom",
      shape: "straight",
    });
  }
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
}
