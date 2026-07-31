/**
 * Archetype breadth, **wave three B** — twelve food-and-craft works.
 *
 * `archetypes.ts` owns the first six archetypes and the tag table;
 * `archetypes-civic.ts` owns the seven civic/rural ones, the walkability guard
 * and the exterior flourishes; `archetypes-blitz.ts` owns the ten-building
 * breadth wave and states the design law this file obeys; `archetypes-wave2.ts`
 * is the file this one is modelled on, because its sawmill, kiln and tannery
 * are exactly this genre. Wave 3B adds six commercial buildings (a brewery, a
 * distillery, a butchery, a tea house, a trading post, a pawnshop) and six
 * industrial ones (a cooperage, a glassworks, a papermill, a textile mill, a
 * cannery, a foundry).
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * Read the header of `archetypes-blitz.ts` in full; it is the normative
 * statement. The short form: a fit-out runs **after** every shape stage and
 * writes into the same cell map, so a works is the ordinary building shell with
 * its machinery stood against the walls. Nothing here is a new grammar and
 * nothing here touches `core.ts`.
 *
 * Unlike wave two, **no archetype in this file rebuilds the exterior**. Every
 * one of the twelve is a pure interior fit-out, which is why they are all happy
 * on a `wing` footprint as well as on a plain rect.
 *
 * ## The field lessons this file was written against
 *
 * Every one of these came back from a walkthrough or from the physics lint, and
 * each is a rule here rather than a comment:
 *
 * - a **stair's `facing` is its high half** — the backrest. A seat therefore
 *   faces *away* from what the sitter is looking at, which is why the tea
 *   house's paired seats are turned away from the table between them;
 * - a bare `flower_pot` renders **empty**. Every pot here comes from
 *   {@link pottedAt}, which picks a `potted_*` variant from position;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height. Nothing here routes a one-cell walkway through it: the machinery
 *   runs along the wall rows and the middle of every floor is left open;
 * - the fence-and-pressure-plate table is refused by the stack guard under a
 *   three-course storey, so {@link worksTable} switches to a top slab there;
 * - a body-blocking prop on a one-cell circulation ring seals it. Furnaces,
 *   vats, looms, anvils and barrel stacks all stand **on a wall row**, spaced,
 *   never in the middle of the floor;
 * - a **sign block** is a block entity the local op stream cannot carry, so
 *   signage is a banner everywhere in this file;
 * - **no fluid is ever written.** Where a works wants liquor, pulp, dye or
 *   brine it gets a `cauldron`, which is a container rather than a fluid and
 *   cannot flow into the room the lint has to walk.
 */

import type { Cardinal, LocalRect } from "./core.js";
import { PropCounter, type FitOutContext } from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in domain order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`. The order is the one
 * the catalog reads in: commercial, then industrial.
 */
export const WORKS_BUILDING_ARCHETYPES = [
  "brewery",
  "distillery",
  "butchery",
  "tea_house",
  "trading_post",
  "pawnshop",
  "cooperage",
  "glassworks",
  "papermill",
  "textile_mill",
  "cannery",
  "foundry",
] as const;

/** One of the archetypes this file fits out. */
export type WorksBuildingArchetype = (typeof WORKS_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isWorksArchetype(value: string): value is WorksBuildingArchetype {
  return (WORKS_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after wave two and *before* the extended table, and every tag below
 * is one no earlier table claims. The near misses are deliberate, because each
 * one would have been a silent theft:
 *
 * - `trade` belongs to the **inn**, so a trading post answers to `trading_post`
 *   and `outpost` and never to the short word;
 * - `store`, `shop` and `grocer` belong to the granary and the general store;
 *   the pawnshop takes `pawnshop` and `pawn` only;
 * - `market`, `stall` and `vendor` belong to the **market stall**;
 * - `mill` belongs to the **windmill** and `sawmill`/`lumber_mill`, `kiln` and
 *   `tannery`/`tanner` belong to wave two, so the textile mill answers to
 *   `textile_mill`, `weaver` and `loom`, and the papermill to `papermill` and
 *   `paper_mill` — never to `mill` alone;
 * - `craft` and `smithy` belong to the **smithy**, so the foundry takes
 *   `foundry` and `casting`.
 */
export function worksArchetypeOfTags(tags: readonly string[]): WorksBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("brewery") || has("brewhouse")) return "brewery";
  if (has("distillery") || has("still")) return "distillery";
  if (has("butchery") || has("butcher")) return "butchery";
  if (has("tea_house") || has("teahouse")) return "tea_house";
  if (has("trading_post") || has("outpost")) return "trading_post";
  if (has("pawnshop") || has("pawn")) return "pawnshop";
  if (has("cooperage") || has("cooper")) return "cooperage";
  if (has("glassworks") || has("glassblower")) return "glassworks";
  if (has("papermill") || has("paper_mill")) return "papermill";
  if (has("textile_mill") || has("weaver") || has("loom")) return "textile_mill";
  if (has("cannery")) return "cannery";
  if (has("foundry") || has("casting")) return "foundry";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into its
 * params, never something applied over an explicit one. The genre splits two
 * ways — a shop wants daylight on its counter, a works wants a wide shed.
 */
export function worksFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // Heat and steam, not daylight.
    case "brewery":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "distillery":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    // A cutting floor wants light on it and a roof that sheds.
    case "butchery":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // The most window of anything here: a tea house is a view with a roof.
    case "tea_house":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    case "trading_post":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Barred and shuttered; a pawnshop advertises nothing.
    case "pawnshop":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "cooperage":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Glass is made by eye, so the shed is as bright as walls allow.
    case "glassworks":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "papermill":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    case "textile_mill":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "cannery":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // A casting floor is a furnace with a lid on it.
    case "foundry":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * The trestle idiom — a fence stem with a pressure plate on top — is two blocks
 * in one column, and under a three-course storey the second is refused by the
 * stack guard as an `interior.blocked_column`; what comes back is a bare fence
 * post, which reads as a bollard. A top slab is one block at table height, and
 * is the idiom the earlier waves settled on for exactly this case.
 */
function worksTable(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/**
 * The middle column of the room — where the shell hangs its lantern.
 *
 * Read straight off `core.ts`'s own arithmetic. Nothing here routes a one-cell
 * walkway through it; the helper exists so a fit-out can leave it alone.
 */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
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

/**
 * The end of the room furthest from the door.
 *
 * The counter in a trading post, the furnace bank in a foundry and the tea
 * counter in a tea house are the same idea: the thing you walk *towards*.
 * Returns the z of that end and the cardinal a person in the room faces to look
 * at it.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** The z of the end the door is at — the near end of the room. */
function nearZ(ctx: FitOutContext): number {
  const it = ctx.interior;
  return farEnd(ctx).look === "north" ? it.z1 : it.z0;
}

/**
 * A run along one side wall, every `stride` cells, from a callback.
 *
 * Every works in this file is some arrangement of two wall runs and an end
 * wall, and writing that out twelve times is twelve chances to put a machine in
 * the middle of the floor. `stride` is what keeps a run from becoming a
 * palisade: a sawyer, a cooper or a weaver has to be able to stand between two
 * of their own machines.
 */
function wallRun(
  ctx: FitOutContext,
  stride: number,
  phase: number,
  put: (z: number) => void,
): void {
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    if (((z - it.z0) % stride + stride) % stride !== phase) continue;
    put(z);
  }
}

/** A shelf of trapdoors up a side wall — the cheapest honest rack there is. */
function rack(ctx: FitOutContext, c: PropCounter, x: number, facing: Cardinal, stride = 2): void {
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  const y = Math.min(2, ctx.storyHeight - 1);
  wallRun(ctx, stride, 0, (z) => {
    c.stack(x, z, y, trapdoor, {
      facing,
      half: "top",
      open: "false",
      powered: "false",
      waterlogged: "false",
    });
  });
}

/**
 * One prop somewhere on a row, offered every cell of it in turn.
 *
 * A works has exactly one press, one hooping bench, one cold-store chest, and
 * "put it at `x0 + 1`" is how a building ends up without one: the stair column,
 * the door approach and the hearth reserve can each eat any particular cell,
 * and `put1` refuses rather than replaces. Walking the row is the idiom the
 * saltbox's loom and the shopfront's ledger already use.
 */
function putOnRow(
  c: PropCounter,
  it: LocalRect,
  z: number,
  block: string,
  props?: Record<string, string>,
): boolean {
  for (let x = it.x0; x <= it.x1; x++) {
    if (c.put1(x, z, block, props)) return true;
  }
  return false;
}

/** A barrel, stacked two high where the storey has room for the second one. */
function barrelStack(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (!c.put1(x, z, "barrel", { facing: "up", open: "false" })) return false;
  if (ctx.storyHeight >= 4) c.stack(x, z, 2, "barrel", { facing: "up", open: "false" });
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
export function furnishWorks(ctx: FitOutContext): number {
  if (!isWorksArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "brewery":
      fitBrewery(ctx, c);
      break;
    case "distillery":
      fitDistillery(ctx, c);
      break;
    case "butchery":
      fitButchery(ctx, c);
      break;
    case "tea_house":
      fitTeaHouse(ctx, c);
      break;
    case "trading_post":
      fitTradingPost(ctx, c);
      break;
    case "pawnshop":
      fitPawnshop(ctx, c);
      break;
    case "cooperage":
      fitCooperage(ctx, c);
      break;
    case "glassworks":
      fitGlassworks(ctx, c);
      break;
    case "papermill":
      fitPapermill(ctx, c);
      break;
    case "textile_mill":
      fitTextileMill(ctx, c);
      break;
    case "cannery":
      fitCannery(ctx, c);
      break;
    case "foundry":
    default:
      fitFoundry(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* commercial                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `brewery` — mash tuns down one wall, a barrel rack down the other.
 *
 * The tuns are cauldrons on the west wall row with the grain between them: hay
 * bales, which are the only sack the block palette has. Facing them, barrels
 * stacked two high are the maturing store, and the far wall carries the brewing
 * bench — a stone bench with brewing stands standing on it, which is the same
 * idiom the apothecary settled on.
 *
 * A cauldron is a container, not a fluid: nothing here writes water, so nothing
 * here can flow into the floor the lint has to walk.
 */
function fitBrewery(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);

  // The mash tuns and the grain, alternating up the west wall.
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x0, z, "cauldron", { level: "3" });
  });
  wallRun(ctx, 4, 1, (z) => {
    c.put1(it.x0, z, "hay_block", { axis: "y" });
  });
  // The maturing store: barrels up the east wall.
  wallRun(ctx, 2, 0, (z) => {
    barrelStack(ctx, c, it.x1, z);
  });

  // The brewing bench, along the far wall: bench first, stands on top of it.
  const bench = ctx.style["stone.slab"] as string;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (!c.put1(x, end.z, bench, { type: "top", waterlogged: "false" })) continue;
    if ((x - it.x0) % 2 !== 0) continue;
    c.stack(x, end.z, 2, "brewing_stand", {
      has_bottle_0: "false",
      has_bottle_1: "false",
      has_bottle_2: "false",
    });
  }
  const near = nearZ(ctx);
  c.put1(it.x0, near, "composter", { level: "0" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `distillery` — a copper still, a condenser coil and the bottle store.
 *
 * The still is waxed copper on the far wall row with a lightning rod standing
 * on it as the condenser arm: the rod is the only thin metal column in the
 * palette, and waxed copper is used rather than plain because plain copper
 * oxidises in play and a still that turns green in a fortnight is a different
 * building every time you look at it.
 *
 * Bottle shelves are trapdoor racks up one wall and the cask store is barrels
 * up the other. The floor between them is empty.
 */
function fitDistillery(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);

  // The still: copper on the wall row, rod above, cauldron beside it.
  let armed = false;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    if (!c.put1(x, end.z, "waxed_copper_block")) continue;
    if (armed) continue;
    armed = c.stack(x, end.z, 2, "lightning_rod", { facing: "up", powered: "false" });
  }
  c.put1(it.x0, end.z, "cauldron", { level: "3" });
  c.put1(it.x1, end.z, "furnace", { facing, lit: "false" });

  // The bottle shelves and the cask store.
  rack(ctx, c, it.x0, "east");
  wallRun(ctx, 3, 0, (z) => {
    barrelStack(ctx, c, it.x1, z);
  });
  const near = nearZ(ctx);
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `butchery` — a cutting line, hanging racks and a cold corner.
 *
 * The chopping blocks are stripped-log stumps on the west wall row — the
 * building's own frame timber, so a butchery in a spruce village is a spruce
 * butchery — with iron-bar hanging racks between them. The east wall carries
 * the smoker and the brine cauldron; the far wall is the cold store, chests and
 * a barrel.
 *
 * No hanging chain, deliberately: a chain wants a block above it and the only
 * block above an interior cell here is somebody's floor.
 */
function fitButchery(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const stump = ctx.style["wall.frame"] as string;

  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x0, z, stump, { axis: "y" });
  });
  wallRun(ctx, 4, 1, (z) => {
    c.put1(it.x0, z, "iron_bars", {
      north: "false",
      south: "false",
      east: "false",
      west: "false",
      waterlogged: "false",
    });
  });
  // The wet side: the smoker, and brine between the smokers.
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x1, z, "smoker", { facing: "west", lit: "false" });
  });
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x1, z, "cauldron", { level: "3" });
  });
  // The hanging rack over the cutting line, clear of the floor.
  rack(ctx, c, it.x0, "east", 3);

  // The cold store.
  putOnRow(c, it, end.z, "chest", { facing, type: "single" });
  putOnRow(c, it, end.z, "barrel", { facing: "up", open: "false" });
  const near = nearZ(ctx);
  c.put1(it.x0, near, "composter", { level: "0" });
}

/**
 * `tea_house` — low tables, paired seats and a counter of kettles.
 *
 * The tables are the slab idiom under a three-course storey, laid down the
 * middle *bays* of the room rather than the middle column of it, with a seat
 * either side. Each seat's `facing` is its **backrest**, so a pair looking at
 * the table between them faces outward in the block data and inward to a
 * player: the east seat is `facing: "east"` and the west seat `facing: "west"`.
 *
 * The counter is on the far wall with a kettle cauldron on it, and a pot stands
 * at each window end — a tea house is half a garden.
 */
function fitTeaHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const stair = ctx.style["stair.interior"] as string;

  // The tables: one column in from each side wall, so the centre of the room
  // (and the column the lantern hangs in) stays an open lane.
  const bays: readonly number[] = [it.x0 + 1, it.x1 - 1];
  for (const x of bays) {
    if (x <= it.x0 || x >= it.x1) continue;
    if (x === lamp.x) continue;
    wallRun(ctx, 3, 1, (z) => {
      if (!worksTable(ctx, c, x, z)) return;
      // The seats, one either side along z, each turned so its backrest is
      // away from the table.
      if (z - 1 >= it.z0) {
        c.put1(x, z - 1, stair, { facing: "north", half: "bottom", shape: "straight" });
      }
      if (z + 1 <= it.z1) {
        c.put1(x, z + 1, stair, { facing: "south", half: "bottom", shape: "straight" });
      }
    });
  }

  // The counter and its kettles, on the far wall row.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) {
      c.put1(x, end.z, "cauldron", { level: "3" });
      continue;
    }
    if ((x - it.x0) % 2 !== 0) continue;
    c.put1(x, end.z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  // The garden, at the window ends.
  const near = nearZ(ctx);
  c.put1(it.x0, near, pottedAt(it.x0, near));
  c.put1(it.x1, near, pottedAt(it.x1, near));
  c.put1(it.x0, end.z, pottedAt(it.x0, end.z));
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
}

/**
 * `trading_post` — goods walls, a trade counter and a banner over it.
 *
 * The two side walls are stock: barrels, chests and hay in a repeating cycle,
 * so the wall reads as *mixed* goods rather than as a warehouse of one thing.
 * The far wall is the counter — the building's own frame timber laid along —
 * with a banner over the middle of it. A banner and not a sign: a sign block
 * demands a paired block entity the local op stream cannot carry.
 *
 * No tie posts outside. The apron is the eave's, and a fence post standing in
 * it is a thing to trip over on the doorstep the road pass has to reach.
 */
function fitTradingPost(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const counter = ctx.style["wall.frame"] as string;
  const facing = opposite(end.look);

  for (const [x, side] of [
    [it.x0, "west"],
    [it.x1, "east"],
  ] as const) {
    let k = 0;
    wallRun(ctx, 2, 0, (z) => {
      const which = k++ % 3;
      if (which === 0) barrelStack(ctx, c, x, z);
      else if (which === 1) {
        c.put1(x, z, "chest", { facing: side === "west" ? "east" : "west", type: "single" });
      } else c.put1(x, z, "hay_block", { axis: "y" });
    });
  }

  // The counter, and the post's standard over the middle of it.
  let signed = false;
  for (let x = it.x0; x <= it.x1; x++) {
    if (!c.put1(x, end.z, counter, { axis: "x" })) continue;
    if (!signed && x === lamp.x) {
      signed = c.stack(x, end.z, 2, "white_banner", { rotation: end.look === "north" ? "8" : "0" });
    }
  }
  if (!signed) {
    c.stack(it.x0, end.z, 2, "white_banner", { rotation: end.look === "north" ? "8" : "0" });
  }
  const near = nearZ(ctx);
  c.put1(it.x0, near, "crafting_table");
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `pawnshop` — a barred counter, shelves of curios and the strongbox.
 *
 * The counter runs along the far wall with **iron bars** standing on it: the
 * grille is the whole character of the building, and it is the one place in
 * this file where bars are stacked rather than stood on the floor. Behind it,
 * the strongbox — a chest with a barrel beside it. The side walls are the
 * unredeemed pledges: bookshelves, a loom, a cauldron of odds, spaced so the
 * shop still has a floor.
 */
function fitPawnshop(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const bars = {
    north: "false",
    south: "false",
    east: "false",
    west: "false",
    waterlogged: "false",
  };

  // The counter and its grille.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (!c.put1(x, end.z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" })) {
      continue;
    }
    if ((x - it.x0) % 2 === 0) c.stack(x, end.z, 2, "iron_bars", bars);
  }
  c.put1(it.x0, end.z, "chest", { facing, type: "single" });
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });

  // The pledges.
  let k = 0;
  wallRun(ctx, 2, 0, (z) => {
    const which = k++ % 3;
    if (which === 0) c.put1(it.x0, z, "bookshelf");
    else if (which === 1) c.put1(it.x0, z, "loom", { facing: "east" });
    else c.put1(it.x0, z, "cauldron", { level: "0" });
  });
  rack(ctx, c, it.x1, "west");
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x1, z, "bookshelf");
  });
  const near = nearZ(ctx);
  c.put1(it.x0, near, pottedAt(it.x0, near));
}

/* -------------------------------------------------------------------------- */
/* industrial                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `cooperage` — barrel stacks in every state, a hoop bench and stave racks.
 *
 * Barrels are the product, so they appear open and shut, on the floor and
 * stacked: the whole west wall is finished casks and the east wall is staves —
 * trapdoor racks with the hooping bench (a smithing table, the only bench in
 * the palette with metalwork on it) at the far end of them.
 */
function fitCooperage(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);

  let k = 0;
  wallRun(ctx, 2, 0, (z) => {
    const open = k++ % 2 === 0 ? "false" : "true";
    if (!c.put1(it.x0, z, "barrel", { facing: "up", open })) return;
    if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, "barrel", { facing: "east", open: "false" });
  });
  rack(ctx, c, it.x1, "west");
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x1, z, ctx.style["wall.frame"] as string, { axis: "y" });
  });

  putOnRow(c, it, end.z, "smithing_table");
  putOnRow(c, it, end.z, "cauldron", { level: "3" });
  const near = nearZ(ctx);
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, "composter", { level: "0" });
}

/**
 * `glassworks` — a furnace bank, sand stores and racks of finished glass.
 *
 * The furnace bank is on the far wall row, which is where every fire in this
 * file lives: a furnace is a body-blocking cell and a body-blocking cell in the
 * middle of a one-wide lane seals the room. The west wall carries the sand —
 * stacked, because sand is what a glasshouse has most of — and the east wall
 * the finished stock, blocks of glass on trapdoor shelves.
 */
function fitGlassworks(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);

  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    c.put1(x, end.z, "furnace", { facing, lit: "false" });
  }
  wallRun(ctx, 2, 0, (z) => {
    if (!c.put1(it.x0, z, "sand")) return;
    if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, "sand");
  });
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, "glass");
  });
  rack(ctx, c, it.x1, "west", 3);
  const near = nearZ(ctx);
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `papermill` — pulp vats, a press and the drying floor.
 *
 * The vats are cauldrons up the west wall with the rag store between them; the
 * press is a cartography table, which is the only block in the palette whose
 * model is paper under a frame. Finished stock is **quartz slabs** — a
 * half-height white stack that reads as a ream, where a full block of quartz
 * would read as masonry.
 *
 * The drying lines are trapdoor racks over the vats, clear of the floor.
 */
function fitPapermill(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);

  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x0, z, "cauldron", { level: "3" });
  });
  rack(ctx, c, it.x0, "east", 4);
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, "quartz_slab", { type: "bottom", waterlogged: "false" });
  });
  wallRun(ctx, 4, 1, (z) => {
    c.put1(it.x1, z, "composter", { level: "0" });
  });

  putOnRow(c, it, end.z, "cartography_table");
  putOnRow(c, it, end.z, "barrel", { facing: "up", open: "false" });
  const near = nearZ(ctx);
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
}

/**
 * `textile_mill` — looms up one wall, dye vats up the other, wool between.
 *
 * The looms are actual `loom` blocks, all turned to face the floor they are
 * worked from. Opposite them the dye house: cauldrons with the fleece stacked
 * between them, in three colours because one colour is a warehouse and a mill
 * sorts its stock.
 */
function fitTextileMill(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const wools = ["white_wool", "light_gray_wool", "brown_wool"] as const;

  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x0, z, "loom", { facing: "east" });
  });
  let k = 0;
  wallRun(ctx, 2, 0, (z) => {
    const which = k++ % 2;
    if (which === 0) {
      c.put1(it.x1, z, "cauldron", { level: "3" });
      return;
    }
    const wool = wools[(k >> 1) % wools.length] as string;
    if (!c.put1(it.x1, z, wool)) return;
    if (ctx.storyHeight >= 4) c.stack(it.x1, z, 2, wool);
  });

  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if ((x - it.x0) % 3 !== 0) continue;
    c.put1(x, end.z, "loom", { facing });
  }
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z, "chest", { facing, type: "single" });
  const near = nearZ(ctx);
  c.put1(it.x0, near, "white_wool");
}

/**
 * `cannery` — an intake, a processing line and the furnace end.
 *
 * A cannery is a **line**, so it is built as one: barrels of intake at the door
 * end of the west wall, a run of counter slabs down that wall as the processing
 * bench, brine cauldrons opposite, and the sealing furnaces across the far
 * wall. One block of iron stands at the end of the bench as the tin stock —
 * one, because a wall of iron blocks is a bank vault, not a cannery.
 */
function fitCannery(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const bench = ctx.style["stone.slab"] as string;

  // The bench, the length of the west wall.
  wallRun(ctx, 1, 0, (z) => {
    c.put1(it.x0, z, bench, { type: "top", waterlogged: "false" });
  });
  // The brine, opposite, spaced so the floor between the two runs is open.
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x1, z, "cauldron", { level: "3" });
  });
  wallRun(ctx, 3, 1, (z) => {
    barrelStack(ctx, c, it.x1, z);
  });

  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    c.put1(x, end.z, "furnace", { facing, lit: "false" });
  }
  // The tin stock, at the head of the bench — the far corner the bench itself
  // does not reach, because the bench runs the *other* wall.
  putOnRow(c, it, end.z, "iron_block");
  const near = nearZ(ctx);
  c.put1(it.x1, near, "chest", { facing, type: "single" });
  c.put1(it.x0, near, "composter", { level: "0" });
}

/**
 * `foundry` — a furnace bank, anvils on the wall row, and an open casting floor.
 *
 * The casting floor is the point, so the middle of the room is left completely
 * empty and every machine is against a wall: blast furnaces and furnaces
 * alternating across the far wall, anvils up the east wall with the ingot stock
 * between them, and the moulding sand and quench cauldrons up the west.
 *
 * No lava, ever. There is no contained way to write it — an open source flows,
 * and the physics lint's zero-unstable-fluids rule is not negotiable — so the
 * heat is read from the furnace bank and the fire-coloured stock instead.
 */
function fitFoundry(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);

  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    const block = (x - it.x0) % 4 === 0 ? "blast_furnace" : "furnace";
    c.put1(x, end.z, block, { facing, lit: "false" });
  }
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, "anvil", { facing: "north" });
  });
  wallRun(ctx, 4, 1, (z) => {
    c.put1(it.x1, z, "copper_block");
  });
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x0, z, "cauldron", { level: "3" });
  });
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x0, z, "sand");
  });
  const near = nearZ(ctx);
  c.put1(it.x0, near, "iron_block");
  c.put1(it.x1, near, "barrel", { facing: "up", open: "false" });
}
