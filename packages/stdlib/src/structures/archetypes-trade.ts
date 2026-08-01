/**
 * Archetype breadth, **the trade wave** — the three commercial fit-outs.
 *
 * `archetypes.ts` owns the original six and the tag table; `archetypes-civic.ts`
 * owns the civic/rural seven, the walkability guard and the exterior
 * flourishes; `archetypes-blitz.ts` owns the wide wave of ten. This file owns
 * the shopfront: a **tavern**, a **general store** and an **apothecary**.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * The law `archetypes-blitz.ts` states in its header holds here without an
 * exception. A fit-out runs **after** every shape stage — foundation, walls,
 * windows, floors, roof, chimney — and writes into the same cell map they did,
 * where a later write to a cell replaces an earlier one. So a tavern is not a
 * new building: it is the house shell with a wainscot band re-clad round its
 * wall foot, a bar counter down one side of the room, tables, stools, barrels
 * and a fire in it. A general store is the same shell with an awning of
 * upturned stairs over its door and its walls lined in stock. An apothecary is
 * the same shell again with a still on the bench and herbs on every sill.
 *
 * None of that needs a line of `core.ts` to change, and every invariant the
 * shell already guarantees still holds: the floor plane is unbroken, the stair
 * still climbs, the door approach is still clear, and the physics lint's
 * support rules are met by construction.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** The only exterior work in this file is
 *    the store's awning, and it lives in the same one-block apron ring the eave
 *    already occupies, bounded above by `roofTop + `{@link ROOF_FLOURISH_RISE}.
 *    The layout solver reserved a box; a shop that outgrows it is a shop that
 *    lied.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — so the door approach, the stair columns, the hearth reserve
 *    and the connectivity guard are all honoured without this file restating
 *    any of them. A counter run that would wall a corner off simply comes up
 *    one cell short, which is a shorter counter and still a shop.
 */

import { PropCounter, ROOF_FLOURISH_RISE, type FitOutContext } from "./archetypes-civic.js";
import type { Cardinal, LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The three archetypes this file fits out, in the order the catalog reads
 * them: the room you drink in, the room you buy in, the room you are cured in.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const TRADE_BUILDING_ARCHETYPES = ["tavern", "general_store", "apothecary"] as const;

/** One of the archetypes this file fits out. */
export type TradeBuildingArchetype = (typeof TRADE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isTradeArchetype(value: string): value is TradeBuildingArchetype {
  return (TRADE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the breadth table and **before** the extended and original
 * ones, for the reason every later table goes later: the older tables are
 * greedy. `trade` and `inn` mean inn down there and `store` means granary, so
 * this table deliberately claims *none* of those three words — a document that
 * says `trade` still gets its inn, and one that says `tavern` finally gets a
 * bar. `market`, `stall` and `vendor` belong to the extended table's market
 * stall for the same reason and are not claimed here either.
 */
export function tradeArchetypeOfTags(tags: readonly string[]): TradeBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("tavern") || has("pub") || has("alehouse")) return "tavern";
  if (has("general_store") || has("shop") || has("grocer") || has("emporium")) {
    return "general_store";
  }
  if (has("apothecary") || has("pharmacy") || has("herbalist") || has("alchemist")) {
    return "apothecary";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults` and `blitzFacadeDefaults`:
 * defaults a caller merges into its params, never something applied over an
 * explicit one. The window fields are what carry the read here — a shop is a
 * house with too much glass in its street wall, and a tavern is a house with
 * exactly as much as it needs to look warm from outside.
 */
export function tradeFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // Lit from within, seen from the road: ordinary lights, one per bay.
    case "tavern":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // The shopfront: as much glass as the wall will carry, because the goods
    // are the advertisement.
    case "general_store":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    // Paired lights, so there is wall between them for the shelves to stand
    // against and sill under them for the herb pots.
    case "apothecary":
      return { windowShape: "mullion", windowRhythm: "paired", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the shared shopfitting                                                      */
/* -------------------------------------------------------------------------- */

/** Blocks the wainscot may never overwrite: the way in, the way up, the fire. */
const KEEP_AS_IS = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$)/;

/**
 * Is the plan a plain rect?
 *
 * The wainscot and the awning both reason about one box; an L has a reflex
 * corner neither has a rule for, so a wing keeps the shell's own wall foot.
 * That is a correct building, just an untrimmed one.
 */
function plainRect(ctx: FitOutContext): { readonly sx: number; readonly sz: number } | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return { sx, sz };
}

/**
 * A band of warm timber round the foot of the wall, inside the envelope.
 *
 * One course, at the plinth line, in the roof's own solid timber — the palette
 * the shell already resolved, so no new symbol and no new theme. It reads as
 * the panelling every trading room in the world has, and it costs one ring of
 * cells the windows never occupy anyway.
 *
 * Cells carrying the door, a ladder, a hearth fire or a light are left alone:
 * each is either the way in, the way up, or a block the physics lint holds to
 * a support rule this pass has no business breaking.
 */
function wainscot(ctx: FitOutContext, y: number, block: string): number {
  const plan = plainRect(ctx);
  if (plan === null) return 0;
  let n = 0;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      if (x !== 0 && x !== plan.sx - 1 && z !== 0 && z !== plan.sz - 1) continue;
      const standing = ctx.blockAt(x, y, z);
      if (standing !== undefined && KEEP_AS_IS.test(standing.block)) continue;
      ctx.put(x, y, z, block);
      n++;
    }
  }
  return n;
}

/** Unit step of a cardinal, in node-local `(dx, dz)`. */
function stepOf(facing: Cardinal): readonly [number, number] {
  switch (facing) {
    case "north":
      return [0, -1];
    case "south":
      return [0, 1];
    case "east":
      return [1, 0];
    default:
      return [-1, 0];
  }
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
 * A shop awning: a run of upturned stairs in the apron over the door.
 *
 * The gatehouse's machicolation, doing an honest day's work instead of pouring
 * boiling oil. It sits one course above the door head, in the apron ring the
 * eave already uses, and is clipped both to that ring and to the envelope
 * ceiling — so a low shell simply gets no awning rather than a canopy poking
 * out of its roof.
 */
function awning(ctx: FitOutContext, c: PropCounter, block: string): void {
  const plan = plainRect(ctx);
  const door = ctx.door;
  if (plan === null || door === null) return;
  const y = Math.min(4, ctx.wallTop);
  if (y < 2 || y > ctx.roofTop + ROOF_FLOURISH_RISE) return;
  const [dx, dz] = stepOf(door.face);
  const alongZ = dx !== 0;
  for (let k = -2; k <= 2; k++) {
    const ax = door.x + dx + (alongZ ? 0 : k);
    const az = door.z + dz + (alongZ ? k : 0);
    if (ax < -1 || ax > plan.sx || az < -1 || az > plan.sz) continue;
    // Only the apron ring: an awning cell that landed *inside* the footprint
    // would be a stair floating in the shop's own wall line.
    const inApron = ax === -1 || ax === plan.sx || az === -1 || az === plan.sz;
    if (!inApron) continue;
    ctx.put(ax, y, az, block, {
      facing: opposite(door.face),
      half: "top",
      shape: "straight",
    });
    c.n++;
  }
}

/**
 * The wall the service counter runs along: the one furthest from the door.
 *
 * A counter across the entrance is a barricade, and the walkability guard would
 * rightly refuse most of it. Picking the far wall means the guard almost never
 * has to, which is the difference between a counter and a stub.
 */
function farWall(ctx: FitOutContext): { readonly axis: "x" | "z"; readonly line: number } {
  const it = ctx.interior;
  const door = ctx.door;
  if (door === null) return { axis: "z", line: it.z0 };
  const midX = (it.x0 + it.x1) / 2;
  const midZ = (it.z0 + it.z1) / 2;
  // Which face is the door in? The counter goes on the opposite one.
  if (door.face === "north" || door.face === "south") {
    return { axis: "z", line: door.z > midZ ? it.z0 : it.z1 };
  }
  return { axis: "x", line: door.x > midX ? it.x0 : it.x1 };
}

/** The cells of a wall line, inclusive, in canonical order. */
function wallRun(it: LocalRect, wall: { axis: "x" | "z"; line: number }): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  if (wall.axis === "z") {
    for (let x = it.x0; x <= it.x1; x++) out.push({ x, z: wall.line });
  } else {
    for (let z = it.z0; z <= it.z1; z++) out.push({ x: wall.line, z });
  }
  return out;
}

/** One cell in from a wall line, towards the middle of the room. */
function inward(it: LocalRect, wall: { axis: "x" | "z"; line: number }): number {
  if (wall.axis === "z") return wall.line === it.z0 ? 1 : -1;
  return wall.line === it.x0 ? 1 : -1;
}

/**
 * Put one prop in whichever corner of the room will have it.
 *
 * A corner is the natural home for the odd single object — a cauldron, a
 * bench, a crate — and it is also where the shell's own reserves cluster: the
 * stair column stands in one, the hearth breast in another. Naming a single
 * corner therefore loses the prop outright on perhaps a third of plans, which
 * is how a shop ends up without its till. Asking all four costs three calls
 * that fail cheaply and returns whether any of them landed.
 */
function corner(
  c: PropCounter,
  it: LocalRect,
  block: string,
  props?: Record<string, string>,
): boolean {
  for (const [x, z] of [
    [it.x0, it.z0],
    [it.x1, it.z0],
    [it.x1, it.z1],
    [it.x0, it.z1],
  ] as const) {
    if (c.put1(x, z, block, props)) return true;
  }
  return false;
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
export function furnishTrade(ctx: FitOutContext): number {
  if (!isTradeArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "tavern":
      fitTavern(ctx, c);
      break;
    case "general_store":
      fitGeneralStore(ctx, c);
      break;
    case "apothecary":
    default:
      fitApothecary(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the tavern                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `tavern` — a bar, tables, barrels and a fire.
 *
 * Four things make the room read, and they are all furniture:
 *
 * - the **bar**: a run of framing timber down the far wall with a slab for a
 *   top, and a stool — a fence post — in the aisle beside every other cell of
 *   it, turned towards the counter;
 * - the **tables**: fence trestles with a pressure plate for a top, the keep's
 *   high table shrunk to two cells and repeated, with stairs to sit on;
 * - the **cellar in the room**: barrels stacked two high in a corner, because
 *   the beer has to come from somewhere a drinker can see;
 * - the **fire**: a campfire in the corner the hearth reserve does not want,
 *   which is what makes a tavern warm rather than merely furnished.
 *
 * The wainscot band is the only wall work, and it is one course at the plinth
 * line: a bar room is panelled, and the alternative — re-cladding the whole
 * wall — would take the windows out of a building whose whole appeal from the
 * road is lit windows.
 */
function fitTavern(ctx: FitOutContext, c: PropCounter): void {
  c.n += wainscot(ctx, 1, ctx.style["roof.solid"] as string) > 0 ? 1 : 0;

  const it = ctx.interior;
  const wall = farWall(ctx);
  const step = inward(it, wall);
  const counterTop = ctx.style["roof.slab"] as string;
  const frame = ctx.style["wall.frame"] as string;
  const fence = ctx.style["wall.fence"] as string;
  const chair = ctx.style["stair.interior"] as string;

  // The bar, down the far wall, with stools in the aisle in front of it.
  const run = wallRun(it, wall);
  run.forEach((cell, i) => {
    // Leave the two end cells: a counter into the corner has no way behind it.
    if (i === 0 || i === run.length - 1) return;
    if (!c.put1(cell.x, cell.z, frame)) return;
    c.stack(cell.x, cell.z, 2, counterTop, { type: "bottom" });
    if (i % 2 !== 0) return;
    const sx = wall.axis === "z" ? cell.x : cell.x + step;
    const sz = wall.axis === "z" ? cell.z + step : cell.z;
    c.put1(sx, sz, fence);
  });

  // The tables: trestle and top, down the middle of the room, with a seat on
  // each side turned in.
  const midX = Math.floor((it.x0 + it.x1) / 2);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
    if (c.put1(midX, z, fence)) {
      c.stack(midX, z, 2, "oak_pressure_plate", { powered: "false" });
    }
    // A stair-chair's `facing` is its backrest side — it points AWAY from the
    // table the drinker faces.
    if (midX - 1 >= it.x0) {
      c.put1(midX - 1, z, chair, { facing: "west", half: "bottom", shape: "straight" });
    }
    if (midX + 1 <= it.x1) {
      c.put1(midX + 1, z, chair, { facing: "east", half: "bottom", shape: "straight" });
    }
  }

  // The stock: barrels stacked two high in the corner behind the bar.
  const cellarX = wall.axis === "x" ? wall.line : it.x0;
  const cellarZ = wall.axis === "x" ? it.z1 : wall.line;
  if (c.put1(cellarX, cellarZ, "barrel", { facing: "up", open: "false" })) {
    c.stack(cellarX, cellarZ, 2, "barrel", { facing: "up", open: "false" });
  }
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });

  // The fire, and a lamp post beside the door end so the room is lit low as
  // well as from the ceiling.
  corner(c, it, "campfire", {
    facing: "north",
    lit: "true",
    signal_fire: "false",
    waterlogged: "false",
  });
  const lampZ = it.z0;
  if (c.put1(it.x1, lampZ, fence)) {
    c.stack(it.x1, lampZ, 2, ctx.style["light.lantern"] as string, { hanging: "false" });
  }
}

/* -------------------------------------------------------------------------- */
/* the general store                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `general_store` — stock on every wall, a counter, and crates in the back.
 *
 * The read is repetition: a shop is a room where the walls are made of goods.
 * Two of the interior walls get an alternating run of barrel, bookshelf and
 * chest — three blocks that at render scale are a sack, a shelf of tins and a
 * crate — and every one of them goes through the guard, so the run stops
 * wherever stopping is what keeps the room crossable.
 *
 * Outside, the awning: a run of upturned stairs in the apron over the door.
 * It is the cheapest shopfront gesture there is and the only exterior work in
 * this file.
 */
function fitGeneralStore(ctx: FitOutContext, c: PropCounter): void {
  awning(ctx, c, ctx.style["roof.stairs"] as string);

  const it = ctx.interior;
  const wall = farWall(ctx);
  const step = inward(it, wall);

  // The counter, along the far wall, with the till end left open so the
  // shopkeeper has a way behind it.
  const run = wallRun(it, wall);
  run.forEach((cell, i) => {
    if (i === 0 || i === run.length - 1) return;
    if (!c.put1(cell.x, cell.z, ctx.style["wall.frame"] as string)) return;
    c.stack(cell.x, cell.z, 2, ctx.style["roof.slab"] as string, { type: "bottom" });
  });

  // The stock walls: the two runs perpendicular to the counter.
  const stock = ["barrel", "bookshelf", "chest"] as const;
  const shelfLines: readonly number[] =
    wall.axis === "z" ? [it.x0, it.x1] : [it.z0, it.z1];
  for (const line of shelfLines) {
    const cells =
      wall.axis === "z"
        ? wallRun(it, { axis: "x", line })
        : wallRun(it, { axis: "z", line });
    cells.forEach((cell, i) => {
      const block = stock[(i + line) % stock.length] as string;
      const props =
        block === "barrel"
          ? { facing: "up", open: "false" }
          : block === "chest"
            ? { facing: wall.axis === "z" ? "north" : "east", type: "single" }
            : undefined;
      c.put1(cell.x, cell.z, block, props);
    });
  }

  // The storage corner: crates stacked, in the corner furthest along the
  // counter wall from the door.
  const crateX = wall.axis === "x" ? wall.line - step : it.x1;
  const crateZ = wall.axis === "x" ? it.z1 : wall.line - step;
  if (c.put1(crateX, crateZ, "barrel", { facing: "up", open: "false" })) {
    c.stack(crateX, crateZ, 2, "barrel", { facing: "up", open: "false" });
  }
  // A composter of trimmings and a crafting bench for repacking.
  corner(c, it, "composter", { level: "2" });
  corner(c, it, "crafting_table");
}

/* -------------------------------------------------------------------------- */
/* the apothecary                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `apothecary` — a still, a cauldron, shelves of bottles and herbs at the
 * windows.
 *
 * The one archetype in this file whose furniture is *specific*: brewing stands
 * and a cauldron say chemistry the way nothing else in the block palette does.
 * Everything else supports them — a bench run along the far wall carrying the
 * stills, shelves with candles standing on them for the bottles they are
 * pretending to be, and a flower pot on every second cell of the two side
 * walls, which is the sill of the paired windows the facade default asks for.
 *
 * A wainscot band in stone, not timber: an apothecary's floor gets spilled on.
 */
function fitApothecary(ctx: FitOutContext, c: PropCounter): void {
  c.n += wainscot(ctx, 1, ctx.style["foundation.accent"] as string) > 0 ? 1 : 0;

  const it = ctx.interior;
  const wall = farWall(ctx);
  const run = wallRun(it, wall);

  // The bench: stone, with the stills standing on it. `stack` is what keeps
  // the column legal — a brewing stand *on the floor* in a three-high room is
  // fine, but the point here is that the working surface is raised.
  run.forEach((cell, i) => {
    if (i === 0 || i === run.length - 1) return;
    if (!c.put1(cell.x, cell.z, "smooth_stone")) return;
    if (i % 2 === 0) {
      c.stack(cell.x, cell.z, 2, "brewing_stand", {
        has_bottle_0: "false",
        has_bottle_1: "false",
        has_bottle_2: "false",
      });
    }
  });

  // The cauldron, at the working end of the bench, and the mortar bench beside
  // it: a crafting table is the closest block there is to a pestle.
  // Corners are the most contested cells in the room — the stair column and
  // the hearth reserve both live in one — so each of these asks every corner
  // in turn and takes the first that answers.
  corner(c, it, "cauldron", { level: "2" });
  corner(c, it, "crafting_table");

  // The shelves: bookshelves down one side wall with a candle standing on each
  // — the row of bottles, at eye height rather than on the floor.
  const shelfLine = wall.axis === "z" ? it.x0 : it.z0;
  const shelves =
    wall.axis === "z"
      ? wallRun(it, { axis: "x", line: shelfLine })
      : wallRun(it, { axis: "z", line: shelfLine });
  shelves.forEach((cell, i) => {
    if (i % 2 !== 0) return;
    if (!c.put1(cell.x, cell.z, "bookshelf")) return;
    c.stack(cell.x, cell.z, 2, "white_candle", {
      candles: "2",
      lit: "false",
      waterlogged: "false",
    });
  });

  // The herbs: pots along the opposite wall, under the paired lights.
  const potLine = wall.axis === "z" ? it.x1 : it.z1;
  const pots =
    wall.axis === "z"
      ? wallRun(it, { axis: "x", line: potLine })
      : wallRun(it, { axis: "z", line: potLine });
  pots.forEach((cell, i) => {
    if (i % 2 !== 0) return;
    c.put1(cell.x, cell.z, "flower_pot");
  });

  // The stores.
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
}
