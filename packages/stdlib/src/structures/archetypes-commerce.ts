/**
 * Archetype breadth, **wave five B** — commerce and civic interiors.
 *
 * `archetypes-blitz.ts` states the design law this file obeys and it is
 * restated nowhere: **an archetype is a fit-out, not a second grammar.** A
 * fit-out runs after every shape stage — foundation, walls, windows, floors,
 * roof, chimney — and writes into the same cell map they did, where a later
 * write to a cell replaces an earlier one. So a shopping mall is the house
 * shell with shop bays down both wall rows and a promenade left empty between
 * them; a council chamber is the same shell with its benches pushed to the
 * walls and a table in the middle. None of them is a new shell.
 *
 * Twelve buildings, in three groups:
 *
 * - **commerce** — `shopping_mall`, `department_store`, `food_court`,
 *   `auction_house`, `caravanserai`, `spice_market`, `shop_row`;
 * - **civic** — `university_hall`, `embassy`, `council_chamber`;
 * - **residential** — `boarding_house`, `gate_lodge`.
 *
 * ## The rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + ROOF_FLOURISH_RISE` and in plan by the footprint plus the one
 *    block apron the eave already uses.
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
 *   every bank and every bench along a wall therefore faces *away* from the
 *   rostrum, the lectern or the wall behind it;
 * - a bare `flower_pot` renders **empty**; {@link pottedAt} (wave two's,
 *   imported rather than re-derived) picks a `potted_*` from position;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height. {@link bankCells} keeps a **three-column aisle** centred on that
 *   column and a **one-cell clear lane** around the whole field — which is why
 *   no archetype here both lays a bank *and* fills its side wall rows: the
 *   wall rows **are** that lane;
 * - the trestle idiom (a fence with a plate on it) is refused by the stack
 *   guard under a three-course storey, so {@link table} switches to a slab;
 * - **no sign blocks**, ever. A menu, a flag and a house rule are all banners,
 *   and a banner beside an unmountable platform is a **wall** banner — a
 *   standing one takes a floor cell and seals a pocket (the opera lesson);
 * - **no `chain`.** It is missing from the pinned 1.21.11 block table; a
 *   hanging bunch is `iron_bars` or a wall trapdoor;
 * - no fluid outside a cauldron or a boxed pool, nothing body-blocking on a
 *   one-wide circulation lane, apron props on actual ground, and a roof
 *   rebuild that ends in a **solid** cap.
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
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: the seven commercial
 * ones first, then the three civic, then the two residential.
 */
export const COMMERCE_BUILDING_ARCHETYPES = [
  "shopping_mall",
  "department_store",
  "food_court",
  "auction_house",
  "caravanserai",
  "spice_market",
  "shop_row",
  "university_hall",
  "embassy",
  "council_chamber",
  "boarding_house",
  "gate_lodge",
] as const;

/** One of the archetypes this file fits out. */
export type CommerceBuildingArchetype = (typeof COMMERCE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isCommerceArchetype(value: string): value is CommerceBuildingArchetype {
  return (COMMERCE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after wave four A's dwellings and *before* the extended table, for
 * the reason every later wave sits there: the tables under it are greedy.
 * Every near miss below is deliberate, and each one would otherwise have been
 * a silent theft:
 *
 * - `market`, `stall` and `vendor` are the **market stall's**, so the spice
 *   market answers to `spice_market`, `souk` and `bazaar` and never to bare
 *   `market`;
 * - `shop`, `grocer` and `emporium` are the **general store's** and bare
 *   `store` is the **granary's**, so the shopping mall takes `mall`, the
 *   department store its own compound only, and the shop row `parade`;
 * - `trade` and `inn` still reach the **inn**, which is why the caravanserai
 *   answers to `caravanserai` and `khan`;
 * - bare `hall` is still the **great hall's** and `academy` the **school's**,
 *   so the university takes `university_hall`, `university` and `college`;
 * - `court` belongs to the **courthouse**, so the chamber takes
 *   `council_chamber` and `council`;
 * - `lodging` is the high-rise **hotel's** and `hospice` the **almshouse's**
 *   (wave 4A claimed it), so the boarding house takes `boarding_house` and
 *   `lodging_house`, and the gate lodge stays a compound —
 *   `gate_lodge`/`gatekeepers_lodge` — rather than risk bare `lodge`.
 */
export function commerceArchetypeOfTags(
  tags: readonly string[],
): CommerceBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("shopping_mall") || has("mall")) return "shopping_mall";
  if (has("department_store")) return "department_store";
  if (has("food_court")) return "food_court";
  if (has("auction_house") || has("auction")) return "auction_house";
  if (has("caravanserai") || has("khan")) return "caravanserai";
  if (has("spice_market") || has("souk") || has("bazaar")) return "spice_market";
  if (has("shop_row") || has("parade")) return "shop_row";
  if (has("university_hall") || has("university") || has("college")) return "university_hall";
  if (has("embassy") || has("consulate")) return "embassy";
  if (has("council_chamber") || has("council")) return "council_chamber";
  if (has("boarding_house") || has("lodging_house")) return "boarding_house";
  if (has("gate_lodge") || has("gatekeepers_lodge")) return "gate_lodge";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 */
export function commerceFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // Retail is glass: as much of it as the rhythm will carry.
    case "shopping_mall":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    case "department_store":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    case "food_court":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "flat" };
    // A saleroom is a hall with a high face and few openings.
    case "auction_house":
      return { windowShape: "tall", windowRhythm: "paired", roof: "hip" };
    // A caravan yard turns inward: small openings, broad roof.
    case "caravanserai":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "spice_market":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "shop_row":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    // Institutions: tall windows, formal roofs.
    case "university_hall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "embassy":
      return { windowShape: "tall", windowRhythm: "paired", roof: "hip" };
    case "council_chamber":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    // Houses.
    case "boarding_house":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "gate_lodge":
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
 * The blitz file's `ExteriorPlan`, restated rather than imported because the
 * waves are separate seams and a shared private helper is a shared edit. The
 * refusals are the same: a **plain rect** only — an L has a reflex corner none
 * of these routines has a rule for.
 */
interface CommercePlan {
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
function wallPlan(ctx: FitOutContext): CommercePlan | null {
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

/**
 * Write a block on a wall cell, unless what stands there is load-bearing.
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
 * The rostrum, the reception desk, the counter run and the kitchen range are
 * all the same idea: the thing you walk *towards*. Returns the z of that end
 * and the cardinal a person standing in the room faces to look at it.
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
 * Three constraints are built in, and every one of them came back from a
 * walkthrough:
 *
 * - a **three-column aisle**, centred on the column the shell hangs its
 *   lantern in;
 * - a **one-cell clear lane** around the whole field, inside the walls — which
 *   is why no fit-out here lays a bank and then fills its wall rows;
 * - **alternate rows only** (`step` defaults to two), so a body can get out of
 *   a row without climbing the next one.
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
 * A bank of seats, flat, every one of them turned away from the thing it
 * looks at.
 *
 * Flat and not raked, deliberately: a riser is a stair a body stands *on*, and
 * a stander needs `floors < 2 || storyHeight >= 4`.
 */
function seatBank(
  ctx: FitOutContext,
  c: PropCounter,
  end: { readonly z: number; readonly look: Cardinal },
  startGap = 2,
): number {
  const seat = ctx.style["stair.interior"] as string;
  // THE SEAT RULE: `facing` names the stair's high half — the backrest — so a
  // seat looking at the rostrum carries the cardinal pointing *away* from it.
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
 * standing eye.
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

/** A wall banner on the interior face of the far wall, above every head. */
function wallBanner(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  end: { readonly z: number; readonly look: Cardinal },
  colour: string,
): void {
  const y = Math.min(3, ctx.storyHeight - 1);
  if (y < 2) return;
  if (ctx.blockAt(x, y, end.z) !== undefined) return;
  // A wall banner's `facing` is the direction it faces *out of* the wall, so
  // one hung on the far wall looks back down the room.
  c.raw(x, y, end.z, colour, { facing: end.look === "north" ? "south" : "north" });
}

/** A shoulder-height trapdoor rack on a wall row: a rack, and passable. */
function rack(ctx: FitOutContext, c: PropCounter, x: number, z: number, facing: Cardinal): void {
  c.stack(x, z, Math.min(2, ctx.storyHeight - 1), ctx.style["wall.trapdoor"] as string, {
    facing,
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });
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
export function furnishCommerce(ctx: FitOutContext): number {
  if (!isCommerceArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "shopping_mall":
      fitShoppingMall(ctx, c);
      break;
    case "department_store":
      fitDepartmentStore(ctx, c);
      break;
    case "food_court":
      fitFoodCourt(ctx, c);
      break;
    case "auction_house":
      fitAuctionHouse(ctx, c);
      break;
    case "caravanserai":
      fitCaravanserai(ctx, c);
      break;
    case "spice_market":
      fitSpiceMarket(ctx, c);
      break;
    case "shop_row":
      fitShopRow(ctx, c);
      break;
    case "university_hall":
      fitUniversityHall(ctx, c);
      break;
    case "embassy":
      fitEmbassy(ctx, c);
      break;
    case "council_chamber":
      fitCouncilChamber(ctx, c);
      break;
    case "boarding_house":
      fitBoardingHouse(ctx, c);
      break;
    case "gate_lodge":
    default:
      fitGateLodge(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* commerce                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `shopping_mall` — a galleried retail hall: shop bays both sides, a wide
 * promenade between them.
 *
 * The bays are on the **two wall rows** and the promenade is everything else,
 * which is the laboratory's plan rather than the store's: a bank would want
 * the wall rows for its clear lane, and a mall's whole read is that the middle
 * of it is empty. Each bay carries a **different stock** — a barrel, a shelf
 * of goods, a loom, a smithing bench — with a fence pier between one bay and
 * the next, and the promenade is a pale runner in the **floor plane**, off the
 * lantern column by the three-column rule, with planters at the far corners.
 */
function fitShoppingMall(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  // The promenade, three columns wide off the lantern and painted, not laid.
  c.n += floorPaint(
    ctx,
    { x0: Math.max(it.x0, lamp.x - 1), x1: Math.min(it.x1, lamp.x + 1), z0: it.z0, z1: it.z1 },
    (x, z) => ((x + z) % 2 === 0 ? "smooth_quartz" : "polished_diorite"),
  );

  // The bays: distinct stock down both wall rows, a pier between each pair.
  const stock = ["barrel", "bookshelf", "loom", "smithing_table", "cartography_table"] as const;
  const fence = ctx.style["wall.fence"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    const bay = z - it.z0;
    for (const x of [it.x0, it.x1]) {
      if (bay % 3 === 2) {
        c.put1(x, z, fence);
        continue;
      }
      const block = stock[(bay + (x === it.x0 ? 0 : 2)) % stock.length] as string;
      c.put1(
        x,
        z,
        block,
        block === "barrel"
          ? { facing: "up", open: "false" }
          : block === "loom"
            ? { facing: x === it.x0 ? "east" : "west" }
            : undefined,
      );
    }
  }
  // The planters, at the head of the promenade.
  c.put1(lamp.x - 1 >= it.x0 ? lamp.x - 1 : it.x0, end.z, pottedAt(lamp.x - 1, end.z));
  c.put1(lamp.x + 1 <= it.x1 ? lamp.x + 1 : it.x1, end.z, pottedAt(lamp.x + 1, end.z));
  c.put1(lamp.x, nearZ, "composter", { level: "0" });
  wallBanner(ctx, c, lamp.x, end, "lime_wall_banner");
}

/**
 * `department_store` — counters per department, stacked stock walls, a
 * mannequin or two.
 *
 * The counters are dressed timber up both wall rows with the department's own
 * kit standing on the run; behind them the **stock wall** stacks a second
 * crate wherever the storey has the headroom for it. A **mannequin** is a
 * fence stem with a wool bust on it, standing **on** the counter run rather
 * than on the floor — an entity is out of the question here, and a bust in the
 * middle of the shop floor is a bollard.
 */
function fitDepartmentStore(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const counter = ctx.style["wall.frame"] as string;
  const wools = ["white_wool", "light_blue_wool", "pink_wool", "yellow_wool"] as const;

  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    const bay = z - it.z0;
    for (const x of [it.x0, it.x1]) {
      if (bay % 3 === 0) {
        // The stock wall: a crate, and a second on top of it where the room
        // has the height. `stack` refuses a column it would seal.
        if (c.put1(x, z, "barrel", { facing: "up", open: "false" })) {
          c.stack(x, z, 2, "barrel", { facing: "up", open: "false" });
        }
        continue;
      }
      if (!c.put1(x, z, counter, { axis: "z" })) continue;
      if (bay % 3 === 1) {
        // The mannequin, on the counter it stands on.
        c.stack(x, z, 2, wools[bay % wools.length] as string);
      }
    }
  }

  // The departments: the far wall is haberdashery and the near one the tills.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, x % 2 === 0 ? "loom" : "bookshelf", x % 2 === 0 ? { facing: end.look === "north" ? "south" : "north" } : undefined);
  }
  c.put1(lamp.x, end.z, "smithing_table");
  c.put1(it.x0, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  wallBanner(ctx, c, lamp.x, end, "magenta_wall_banner");
}

/**
 * `food_court` — counter stalls across the far wall, a shared seating field.
 *
 * The counters are a run of dressed timber across the **far wall row** with a
 * smoker, a furnace and a cauldron standing in it, and the **menu** is a row
 * of wall banners above them. The seating is one field laid through
 * {@link bankCells} — the school's aisle discipline, which is why the side
 * wall rows carry nothing solid: they are the field's clear lane. Alternate
 * cells in a row are a table, the rest are seats turned to it.
 */
function fitFoodCourt(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const counter = ctx.style["wall.frame"] as string;

  // The stalls.
  for (let x = it.x0; x <= it.x1; x++) {
    const kit = (x - it.x0) % 4;
    if (kit === 1) {
      c.put1(x, end.z, "smoker", { facing: look, lit: "false" });
      continue;
    }
    if (kit === 3) {
      c.put1(x, end.z, "cauldron", { level: "0" });
      continue;
    }
    c.put1(x, end.z, counter, { axis: "x" });
  }
  // The menu boards.
  for (const bx of [lamp.x - 2, lamp.x, lamp.x + 2]) {
    if (bx < it.x0 || bx > it.x1) continue;
    wallBanner(ctx, c, bx, end, bx === lamp.x ? "orange_wall_banner" : "yellow_wall_banner");
  }

  // The seating field: tables on alternate cells, seats on the rest, and every
  // seat's backrest away from what it looks at.
  const backrest = opposite(end.look);
  const seat = ctx.style["stair.interior"] as string;
  for (const cell of bankCells(ctx, end, 2)) {
    if ((cell.x + cell.z) % 3 === 0) {
      table(ctx, c, cell.x, cell.z);
      continue;
    }
    c.put1(cell.x, cell.z, seat, { facing: backrest, half: "bottom", shape: "straight" });
  }
}

/**
 * `auction_house` — a rostrum and lectern at the head, lots along the walls,
 * seat rows in the body.
 *
 * The rostrum is a **slab dais** across the far row with the auctioneer's
 * lectern in the middle of it, and the sold-banners are **wall** banners over
 * it: a standing banner beside an unmountable platform is the sealed pocket
 * the opera house taught this wave about. The lots are tables on the two
 * near corners only — the wall rows stay the seat field's clear lane.
 */
function fitAuctionHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  dais(ctx, c, end.z, new Set([lamp.x]));
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  for (const bx of [lamp.x - 1, lamp.x + 1]) {
    if (bx < it.x0 || bx > it.x1) continue;
    wallBanner(ctx, c, bx, end, "red_wall_banner");
  }

  seatBank(ctx, c, end);

  // The lot tables and the clerk's chest, on the near row.
  table(ctx, c, it.x0, nearZ);
  table(ctx, c, it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ);
  c.put1(it.x1, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
}

/**
 * `caravanserai` — the courtyard house, mercantile: an open court, cells for
 * travellers, a hay store and the pack tack.
 *
 * The courtyard house's plan exactly — a colonnade on the wall rows and the
 * middle **left empty** — with the domestic kit swapped for a caravan's.
 * There are no animals, because there are no entities: a camel is a
 * **pack-saddle rack**, which is a barrel with a carpet folded over it, and a
 * carpet is passable so the rack costs the yard nothing above the crate it
 * already spends. The traveller cells are fence partitions with a chest each.
 */
function fitCaravanserai(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const fence = ctx.style["wall.fence"] as string;

  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    const bay = z - it.z0;
    for (const x of [it.x0, it.x1]) {
      if (bay % 3 === 0) {
        // The partition between one traveller's cell and the next.
        c.put1(x, z, fence);
        continue;
      }
      if (bay % 3 === 1) {
        c.put1(x, z, "chest", { facing: x === it.x0 ? "east" : "west", type: "single" });
        continue;
      }
      // The pack tack: a saddle crate with a rug over it.
      if (c.put1(x, z, "barrel", { facing: "up", open: "false" })) {
        c.stack(x, z, 2, (bay + (x === it.x0 ? 0 : 1)) % 2 === 0 ? "red_carpet" : "brown_carpet");
      }
    }
  }

  // The hay store at the head of the yard, and the well in the middle of it.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, (x - it.x0) % 2 === 0 ? "hay_block" : "barrel", (x - it.x0) % 2 === 0 ? { axis: "y" } : { facing: "up", open: "false" });
  }
  c.put1(lamp.x, end.z, "cauldron", { level: "3" });
  c.put1(it.x0, nearZ, pottedAt(it.x0, nearZ));
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/**
 * `spice_market` — a souk lane: dense stall bays, sacks of colour, hanging
 * bunches and warm light.
 *
 * The stalls are a **dense** bank — every row, not every other one, because a
 * souk lane is a squeeze — laid through {@link bankCells} so the aisle and the
 * clear lane are still the ones the walking agent expects. The sacks are wool
 * and terracotta, position-keyed; the **hanging bunches** are wall trapdoors
 * and `iron_bars` on the side walls (never `chain`, which the pinned block
 * table does not have); and the lanterns hang only over cells a sack already
 * fills, so no light ever costs the lane a standing cell.
 */
function fitSpiceMarket(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  const sacks = [
    "orange_terracotta",
    "yellow_terracotta",
    "red_terracotta",
    "brown_wool",
    "orange_wool",
  ] as const;
  for (const cell of bankCells(ctx, end, 2, 2)) {
    const block = sacks[(cell.x * 3 + cell.z) % sacks.length] as string;
    if (!c.put1(cell.x, cell.z, block)) continue;
    // The stall's own light, over the sack it stands on and nowhere else.
    if ((cell.x + cell.z) % 4 === 0) {
      c.stack(cell.x, cell.z, 2, "lantern", { hanging: "false", waterlogged: "false" });
    }
  }

  // The hanging bunches: racks up both side walls, and a bar of them by the
  // door end. Both are passable, so the lane the bank leaves stays a lane.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    rack(ctx, c, it.x0, z, "east");
    rack(ctx, c, it.x1, z, "west");
  }
  const barY = Math.min(2, ctx.storyHeight - 1);
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 3) {
    c.stack(x, nearZ, barY, "iron_bars", {
      north: "false",
      south: "false",
      east: "true",
      west: "true",
      waterlogged: "false",
    });
  }

  // The spicer's own counter, across the head of the lane.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, (x - it.x0) % 3 === 0 ? "barrel" : (ctx.style["wall.frame"] as string), (x - it.x0) % 3 === 0 ? { facing: "up", open: "false" } : { axis: "x" });
  }
  c.put1(lamp.x, end.z, "cauldron", { level: "0" });
  wallBanner(ctx, c, lamp.x, end, "orange_wall_banner");
}

/**
 * `shop_row` — repeating shopfront bays on the facade, a small interior behind
 * each one.
 *
 * The terraced row's commercial cousin: the read is on the **outside**, where
 * every fourth column of the door face gets a stone-brick pier between the
 * plinth and the eaves and a slab cornice over it — the repeating bay. Inside,
 * a partition of fence and a counter per bay down both wall rows, which is as
 * much interior as the depth honestly allows.
 */
function fitShopRow(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const plan = wallPlan(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  if (plan !== null) {
    // The piers, on the door face — the near one, which is the street.
    const faceZ = end.look === "north" ? plan.sz - 1 : 0;
    for (let x = 0; x < plan.sx; x += 4) {
      for (let y = 1; y <= ctx.wallTop - 1; y++) {
        if (clad(ctx, x, y, faceZ, "stone_bricks")) c.n++;
      }
    }
    // The cornice over the shopfronts, one course under the plate.
    const corniceY = ctx.wallTop - 1;
    if (corniceY >= 2) {
      for (let x = 0; x < plan.sx; x++) {
        if (x % 4 === 0) continue;
        if (clad(ctx, x, corniceY, faceZ, "polished_andesite")) c.n++;
      }
    }
  }

  // The bays inside: a counter, a stock crate, a partition, repeating.
  const counter = ctx.style["wall.frame"] as string;
  const fence = ctx.style["wall.fence"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    const bay = z - it.z0;
    for (const x of [it.x0, it.x1]) {
      if (bay % 3 === 0) c.put1(x, z, fence);
      else if (bay % 3 === 1) c.put1(x, z, counter, { axis: "z" });
      else c.put1(x, z, "barrel", { facing: "up", open: "false" });
    }
  }
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, nearZ, "composter", { level: "0" });
  wallBanner(ctx, c, lanternColumn(it).x, end, "green_wall_banner");
}

/* -------------------------------------------------------------------------- */
/* civic                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `university_hall` — the lecture hall's grand parent: a dais, a book wall and
 * a gallery over flat rows.
 *
 * The books line the **far wall row** either side of the dais rather than the
 * side walls, for the reason the whole file repeats: the side wall rows are
 * the seat field's clear lane. The **gallery** is a trapdoor dado run high on
 * both side walls — a rail read, and passable, so the lane below it is still a
 * lane. The rows are flat, always: a raked bench is a step a body stands on.
 */
function fitUniversityHall(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  dais(ctx, c, end.z, new Set([lamp.x, it.x0, it.x1]));
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  // The book wall, in the two ends of the far row.
  c.put1(it.x0, end.z, "bookshelf");
  c.put1(it.x1, end.z, "bookshelf");
  wallBanner(ctx, c, lamp.x, end, "blue_wall_banner");

  seatBank(ctx, c, end);

  // The gallery rail: a trapdoor course up both side walls, above every head
  // that has one and passable in any case.
  const railY = Math.min(3, ctx.storyHeight - 1);
  if (railY >= 2) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      rack(ctx, c, it.x0, z, "east");
      rack(ctx, c, it.x1, z, "west");
    }
  }
  c.put1(it.x0, nearZ, "bookshelf");
  c.put1(it.x1, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
}

/**
 * `embassy` — a flag wall, a reception desk, waiting benches and a records
 * room behind iron.
 *
 * The flags are wall banners on the far wall over the **reception desk**, a
 * run of dressed timber across the far row. The waiting benches are stairs on
 * the side wall rows with their backrests to the wall — no bank here, so the
 * wall rows are free to carry them. The **records room** is the near corner
 * with an iron grille over its chest and an iron trapdoor cabinet beside it:
 * a trim, and not an enclosure, because a sealed corner is a pocket.
 */
function fitEmbassy(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const look: Cardinal = end.look === "north" ? "south" : "north";

  // The desk.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, ctx.style["wall.frame"] as string, { axis: "x" });
  }
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });
  // The flags.
  for (const bx of [lamp.x - 2, lamp.x + 2]) {
    if (bx < it.x0 || bx > it.x1) continue;
    wallBanner(ctx, c, bx, end, bx < lamp.x ? "blue_wall_banner" : "white_wall_banner");
  }

  // The waiting benches, backs to the wall.
  if (benchHeadroom(ctx)) {
    const seat = ctx.style["stair.interior"] as string;
    for (let z = it.z0 + 2; z <= it.z1 - 2; z += 2) {
      c.put1(it.x0, z, seat, { facing: "west", half: "bottom", shape: "straight" });
      c.put1(it.x1, z, seat, { facing: "east", half: "bottom", shape: "straight" });
    }
  }

  // The records: an iron-trimmed corner by the door.
  if (c.put1(it.x0, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" })) {
    c.stack(it.x0, nearZ, 2, "iron_bars", {
      north: "false",
      south: "false",
      east: "true",
      west: "true",
      waterlogged: "false",
    });
  }
  c.stack(it.x1, nearZ, Math.min(2, ctx.storyHeight - 1), "iron_trapdoor", {
    facing: "west",
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `council_chamber` — the town hall's chamber, standalone: benches round the
 * walls, a table in the middle, a speaker's lectern at the head.
 *
 * The ring is a ring of **benches on the wall rows**, broken at the aisle
 * columns so the chamber never closes a lane on itself, and the table in the
 * middle is **lantern-aware**: the shell hangs its light over the centre
 * column, and a block under that light is the `interior.blocked_column` the
 * stack guard exists to refuse, so the board sits either side of the lamp cell
 * and never in it.
 */
function fitCouncilChamber(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  // The board: two cells either side of the light, never under it.
  for (const tx of [lamp.x - 1, lamp.x + 1]) {
    if (tx < it.x0 + 1 || tx > it.x1 - 1) continue;
    table(ctx, c, tx, lamp.z);
  }

  // The ring of benches, on the wall rows, broken at the aisle.
  const seat = ctx.style["stair.interior"] as string;
  if (benchHeadroom(ctx)) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z >= lamp.z - 1 && z <= lamp.z + 1) continue;
      c.put1(it.x0, z, seat, { facing: "west", half: "bottom", shape: "straight" });
      c.put1(it.x1, z, seat, { facing: "east", half: "bottom", shape: "straight" });
    }
    // The two cross-benches, backs to the near wall and facing the speaker.
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      if (x >= lamp.x - 1 && x <= lamp.x + 1) continue;
      c.put1(x, nearZ, seat, {
        facing: end.look === "north" ? "south" : "north",
        half: "bottom",
        shape: "straight",
      });
    }
  }

  // The speaker's end.
  dais(ctx, c, end.z, new Set([lamp.x]));
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  wallBanner(ctx, c, lamp.x, end, "purple_wall_banner");
}

/* -------------------------------------------------------------------------- */
/* residential                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `boarding_house` — the inn's residential cousin: small rooms in bays, one
 * shared hearth, the house rules on the wall.
 *
 * The bays run down **one** wall row — a bed laid whole pair or neither by
 * `placeBed`, a chest at its foot, a fence partition between it and the next —
 * so the other wall row stays the corridor a lodging house actually needs. The
 * shared kitchen is a range across the far row, and the house rules are a wall
 * banner over it: a banner, because there are no sign blocks in this stack.
 */
function fitBoardingHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const fence = ctx.style["wall.fence"] as string;

  // The rooms, down the west range.
  const bedX = it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    const bay = z - it.z0;
    if (bay % 3 === 0) {
      // The partition, wall first and the inner post **only if the wall cell
      // took one**. A partition whose wall half the shell's reserve refused
      // would otherwise leave that wall cell open with a post beside it and
      // occupied bays either side of it — a one-cell sealed pocket, which is
      // exactly what the tight two-storey envelope found.
      if (c.put1(it.x0, z, fence)) c.put1(bedX, z, fence);
      continue;
    }
    if (bay % 3 === 1) {
      // Head to the wall, foot into the room, whole pair or neither — and the
      // pair is counted by the shell's own `placeBed`, not by this counter.
      ctx.placeBed(bedX, z, "west", "white_bed");
      continue;
    }
    c.put1(it.x0, z, "chest", { facing: "east", type: "single" });
  }

  // The shared kitchen, across the far wall.
  c.put1(lamp.x, end.z, "cauldron", { level: "3" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "furnace", { facing: look, lit: "false" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "smoker", { facing: look, lit: "false" });
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  wallBanner(ctx, c, lamp.x, end, "brown_wall_banner");

  // The common corner: a chair and a board by the door, on the east wall.
  if (benchHeadroom(ctx)) {
    c.put1(it.x1, nearZ, ctx.style["stair.interior"] as string, {
      facing: "east",
      half: "bottom",
      shape: "straight",
    });
  }
  table(ctx, c, it.x1, lamp.z);
}

/**
 * `gate_lodge` — a gatekeeper's one room: a watch window, a fire corner, a key
 * rack by the door.
 *
 * The smallest thing in this wave and deliberately so. The **watch** is a seat
 * on the far wall row turned to look down the room at the door — a stair's
 * `facing` being its backrest, that seat carries the cardinal pointing away
 * from the door — with a small board beside it. The **key rack** is a pair of
 * wall trapdoors by the entry, which is the cheapest honest rack the palette
 * has and passable besides. Everything else is one cot, one chest, one pot.
 */
function fitGateLodge(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;

  // The watch seat, looking back down the room at the way in.
  if (benchHeadroom(ctx)) {
    c.put1(lamp.x, end.z, ctx.style["stair.interior"] as string, {
      facing: end.look,
      half: "bottom",
      shape: "straight",
    });
  }
  table(ctx, c, lamp.x - 1 >= it.x0 ? lamp.x - 1 : it.x0, end.z);
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, end.z, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });

  // The cot, head to the west wall and foot into the room.
  if (it.x0 + 1 <= it.x1) ctx.placeBed(it.x0 + 1, lamp.z, "west", "white_bed");

  // The key rack, either side of the door end.
  rack(ctx, c, it.x0, nearZ, "east");
  rack(ctx, c, it.x1, nearZ, "west");
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
  c.put1(it.x1, lamp.z, "crafting_table");
}
