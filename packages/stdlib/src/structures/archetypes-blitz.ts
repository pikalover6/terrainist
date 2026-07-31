/**
 * Archetype **breadth, wave three** — ten buildings across ten domains.
 *
 * `archetypes.ts` owns the first six archetypes and the tag table;
 * `archetypes-civic.ts` owns the seven civic/rural ones, the walkability guard
 * and the two exterior flourishes. This file owns a deliberately *wide* set:
 * a castle keep and a gatehouse, a pagoda, a wizard's tower, an observatory, a
 * greenhouse, a gymnasium, a mausoleum, a barracks and a windpump.
 *
 * ## Why these are fit-outs and not a second grammar
 *
 * A fit-out runs **after** every shape stage — foundation, walls, windows,
 * floors, roof, chimney — and writes into the same cell map they did, where a
 * later write to a cell replaces an earlier one. That makes the fit-out seam
 * far more powerful than "put furniture on the floor": it can re-clad a wall,
 * clear a roof and build a different one in its place, and it can do all of
 * that without a line of `core.ts` changing.
 *
 * So a keep is not a new grammar. It is the house grammar with its timber
 * re-clad in masonry, its roof replaced by a fighting deck and a crenellated
 * parapet, and a hall's furniture inside. A pagoda is the same shell with a
 * stack of eave tiers where the gable was. That is the cheapest honest way to
 * add ten buildings, and — the part that matters — every invariant the shell
 * already guarantees still holds: the floor plane is unbroken, the stair still
 * climbs, the walkability guard still vetoes furniture that would strand a
 * corner, and the physics lint's support rules are met by construction.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} — the same allowance the steeple
 *    takes — and in plan by the footprint plus the one-block apron ring the
 *    eave already uses. The layout solver reserved a box; a building that
 *    outgrows it is a building that lied.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — so the door approach, the stair columns, the hearth reserve
 *    and the connectivity guard are all honoured without this file restating
 *    any of them.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  emitBlades,
  type FitOutContext,
} from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The ten archetypes this file fits out, in domain order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`. The order is the one
 * the catalog reads in: military, religious, fantasy, science, rural, leisure,
 * memorial, military again, waterworks.
 */
export const BLITZ_BUILDING_ARCHETYPES = [
  "keep",
  "gatehouse",
  "barracks",
  "pagoda",
  "wizard_tower",
  "observatory",
  "greenhouse",
  "gym",
  "mausoleum",
  "windpump",
] as const;

/** One of the archetypes this file fits out. */
export type BlitzBuildingArchetype = (typeof BLITZ_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isBlitzArchetype(value: string): value is BlitzBuildingArchetype {
  return (BLITZ_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the tall table and the watchtower and *before* the extended
 * one, for the reason the extended table goes before the original: the tables
 * below are greedy. `temple` and `shrine` both mean church over there, and a
 * pagoda would never reach its own building if this ran second.
 */
export function blitzArchetypeOfTags(tags: readonly string[]): BlitzBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("keep") || has("castle") || has("donjon") || has("citadel")) return "keep";
  if (has("gatehouse") || has("barbican") || has("gate")) return "gatehouse";
  if (has("barracks") || has("garrison")) return "barracks";
  if (has("pagoda")) return "pagoda";
  if (has("wizard") || has("wizard_tower") || has("arcane") || has("sorcerer")) {
    return "wizard_tower";
  }
  if (has("observatory") || has("telescope") || has("astronomy")) return "observatory";
  if (has("greenhouse") || has("glasshouse") || has("conservatory")) return "greenhouse";
  if (has("gym") || has("gymnasium") || has("fitness")) return "gym";
  if (has("mausoleum") || has("tomb") || has("sepulchre")) return "mausoleum";
  if (has("windpump")) return "windpump";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. The roof is the
 * field that matters most here — every archetype that rebuilds its own roof
 * asks for the *shape with the most vertical room*, because the replacement is
 * bounded by where the original one finished.
 */
export function blitzFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    // Masonry, few openings, and a hip roof whose height the battlement takes
    // over: a keep is a wall with a room in it.
    case "keep":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "gatehouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "barracks":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // The tiers are the building; the walls under them want to be quiet.
    case "pagoda":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    case "wizard_tower":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "observatory":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // As much glass as a wall can carry.
    case "greenhouse":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "gym":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "mausoleum":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "windpump":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
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
 * Two conditions, and both are refusals rather than approximations:
 *
 * - the plan has to be a **plain rect**. Every routine below reasons about one
 *   box — a ring, a set of inset rings, a dome — and an L has a reflex corner
 *   none of them has a rule for. A wing therefore keeps the shell's own roof,
 *   which is a correct building, just not a tiered one;
 * - there has to be **room**: at least two courses between the eave plate and
 *   the ceiling the replacement may reach.
 */
export interface ExteriorPlan {
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

/**
 * The plan for work on the **walls** — a re-clad, a glazing, a cornice.
 *
 * Only the rect condition applies: none of those needs headroom, and a gym
 * under a flat roof would lose its mirror wall to a guard that exists for the
 * roof's sake.
 */
function wallPlan(ctx: FitOutContext): ExteriorPlan | null {
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

/** The plan for a **roof rebuild**: a wall plan that also has room to build in. */
function exteriorPlan(ctx: FitOutContext): ExteriorPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, because the chimney's corbel and its
 * chimney-pot campfire stand there: a replacement roof that cleared only up to
 * its own ceiling would leave a fire burning in mid-air over the ridge it
 * deleted. The flue *below* the plate is wall and stays wall.
 */
function clearRoof(ctx: FitOutContext, plan: ExteriorPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
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
 * Lowest course a glasshouse's glazing will ever take.
 *
 * The wall below it is the plinth — solid courses at foot level, which is what
 * every real glasshouse has. Where the wall can afford it the band starts one
 * higher still; see {@link fitGreenhouse}.
 */
export const GREENHOUSE_SILL_Y = 2;

/** Blocks a re-clad may never overwrite: the way in, the way up, the fire. */
const KEEP_AS_IS = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$)/;

/**
 * Re-clad the wall ring in masonry.
 *
 * A keep in oak planks is a big cottage. The shell has already resolved a
 * stone palette for its own foundation and plinth, so the re-clad is that
 * palette carried up the wall — no new symbol, no new theme, and the building
 * still reads as belonging to the village it stands in.
 *
 * Cells carrying the door, a ladder, a hearth fire or a light are left alone:
 * every one of them is either the way in, the way up, or a block the physics
 * lint holds to a support rule this pass has no business breaking.
 */
function recladRing(
  ctx: FitOutContext,
  plan: ExteriorPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
  props?: (x: number, y: number, z: number) => Record<string, string> | undefined,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && KEEP_AS_IS.test(standing.block)) continue;
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
 * The crenellation machinery, generalised off the watchtower.
 *
 * The tower builds a solid parapet course and then merlons on every other cell
 * in a phase that is a pure function of position, so opposite walls agree. That
 * is exactly the right rule and it was written inline in `emitWatchtower`;
 * here it is a function three buildings call, which is the difference between
 * a pattern and a copy.
 *
 * Returns the Y of the merlon course, or `null` when there was no room.
 */
export function crenellate(
  ctx: FitOutContext,
  plan: ExteriorPlan,
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
 * True when an inset rect is too small to be drawn as a ring.
 *
 * A ring narrower than three cells has no interior, so "the ring" and "the
 * rect" are the same set — and a one-cell one is a single block with air on
 * every side, which the physics lint reports as `floating.isolated` and is
 * right to. Every stepped roof here asks this before it draws a course, fills
 * the rect solid instead, and stops: a spire ends in a block, not a speck.
 */
function degenerate(x0: number, x1: number, z0: number, z1: number): boolean {
  return x1 - x0 < 2 || z1 - z0 < 2;
}

/** Fill an inclusive rect at one Y. */
function slab(
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
export function furnishBlitz(ctx: FitOutContext): number {
  if (!isBlitzArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "keep":
      fitKeep(ctx, c);
      break;
    case "gatehouse":
      fitGatehouse(ctx, c);
      break;
    case "barracks":
      fitBarracks(ctx, c);
      break;
    case "pagoda":
      fitPagoda(ctx, c);
      break;
    case "wizard_tower":
      fitWizardTower(ctx, c);
      break;
    case "observatory":
      fitObservatory(ctx, c);
      break;
    case "greenhouse":
      fitGreenhouse(ctx, c);
      break;
    case "gym":
      fitGym(ctx, c);
      break;
    case "mausoleum":
      fitMausoleum(ctx, c);
      break;
    case "windpump":
    default:
      fitWindpump(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* military                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The battlement every military archetype here wears.
 *
 * A solid fighting deck over the ceiling plane, a parapet round it, merlons on
 * the parapet. The deck is what makes the top read as a place rather than as a
 * lid, and it is one course above the ceiling the shell already laid, so the
 * room below is sealed twice over and no light gets in through the roof.
 */
function battlement(ctx: FitOutContext, plan: ExteriorPlan): void {
  const stone = masonry(ctx);
  clearRoof(ctx, plan);
  slab(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, ctx.style["foundation.accent"] as string);
  crenellate(ctx, plan, plan.base, stone);
}

/**
 * A table run down a column, with benches turned to it.
 *
 * Two things this owes the room, and the old inline version paid neither:
 *
 * - **the board scales.** The trestle idiom — a fence post with a pressure
 *   plate for a top — needs a course of headroom above the post, and
 *   {@link PropCounter.stack} refuses it on a three-high storey, which is
 *   exactly what a two-storey keep has. So a short storey gets the *slab*
 *   idiom instead: an upturned slab at seat height, which is a table on any
 *   ceiling. Either way there is a table, at every envelope;
 * - **the benches follow the board.** A bench is only laid beside a cell the
 *   board actually reached, so a run broken by the door approach or the stair
 *   column never ends up with a diner facing thin air.
 *
 * The facing rule, once, because every seat in this file obeys it: a stair's
 * `facing` names the side its *high* half stands on — the backrest. A chair
 * therefore faces **away** from what it is drawn up to.
 */
function hallTable(ctx: FitOutContext, c: PropCounter, x: number, z0: number, z1: number): void {
  const fence = ctx.style["wall.fence"] as string;
  const slabBlock = ctx.style["stone.slab"] as string;
  // Room for a trestle top? A three-high storey has two usable courses, and a
  // post with a top on it fills both — which is a pillar, and refused.
  const trestle = ctx.storyHeight >= 4;
  const board: number[] = [];
  for (let z = z0; z <= z1; z++) {
    if (trestle) {
      if (!c.put1(x, z, fence)) continue;
      if (!c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" })) continue;
      board.push(z);
    } else if (c.put1(x, z, slabBlock, { type: "top", waterlogged: "false" })) {
      board.push(z);
    }
  }
  // Benches every other bay, on both sides, and only where the board is.
  const chair = ctx.style["stair.interior"] as string;
  for (let k = 0; k < board.length; k += 2) {
    const z = board[k] as number;
    // Backrest away from the table: the west seat's high half is on its west.
    c.put1(x - 1, z, chair, {
      facing: "west",
      half: "bottom",
      shape: "straight",
    });
    c.put1(x + 1, z, chair, {
      facing: "east",
      half: "bottom",
      shape: "straight",
    });
  }
}

/**
 * `keep` — the anchor of the military set.
 *
 * Masonry from the plinth to the parapet, a fighting deck for a roof, and a
 * great hall inside it: a long table on trestles, banners on the end wall, an
 * arms chest and an anvil. The one thing a keep must not be is a house made of
 * stone, and the deck is what stops it: the silhouette is a box with a notched
 * top, which is the shape everyone means by "castle".
 */
function fitKeep(ctx: FitOutContext, c: PropCounter): void {
  const plan = exteriorPlan(ctx);
  if (plan !== null) {
    const stone = masonry(ctx);
    // The whole wall, plinth to plate. Corner posts included: a masonry corner
    // is a quoin, not a timber post.
    recladRing(ctx, plan, 1, ctx.wallTop, stone);
    battlement(ctx, plan);
    c.n += 1;
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  // The high table, down the middle, and the benches that go with it — laid as
  // one group so a bench is never set down opposite a gap in the board.
  hallTable(ctx, c, mid, it.z0 + 1, it.z1 - 1);
  // The arms end: an anvil, a chest and a barrel of stores.
  c.put1(it.x1, it.z0, "anvil", { facing: "west" });
  c.put1(it.x0, it.z0, "chest", { facing: "east", type: "single" });
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
  // Banners high on the wall behind the high table, out of the way of the
  // floor entirely.
  const bannerY = Math.min(4, ctx.storyHeight - 1);
  for (const bx of [mid - 1, mid + 1]) {
    if (bx < it.x0 || bx > it.x1) continue;
    c.raw(bx, bannerY, it.z0, "red_banner", { rotation: "8" });
  }
}

/**
 * `gatehouse` — a keep with a way through it.
 *
 * The battlement is the keep's. What makes it a gatehouse is the head of the
 * entrance: a portcullis of iron bars raised into the wall above the doorway,
 * and a machicolation — a course of upturned stairs in the apron at parapet
 * level, overhanging the gate. Both are on the door's own face, which is the
 * face a visitor sees, and the machicolation lives in the same one-block apron
 * ring the eave already occupies.
 */
function fitGatehouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = exteriorPlan(ctx);
  if (plan !== null) {
    recladRing(ctx, plan, 1, ctx.wallTop, masonry(ctx));
    battlement(ctx, plan);
    c.n += 1;
  }

  const door = ctx.door;
  if (door !== null && plan !== null) {
    // The portcullis, raised: bars in the two courses over the door head.
    for (let y = 4; y <= Math.min(5, ctx.wallTop); y++) {
      ctx.put(door.x, y, door.z, "iron_bars");
      c.n++;
    }
    // The machicolation: upturned stairs in the apron, overhanging the gate.
    const [dx, dz] = stepOf(door.face);
    const alongZ = dx !== 0;
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
    }
  }

  // The guardroom: a brazier, a stores chest, a bench and a water butt.
  const it = ctx.interior;
  c.put1(it.x0, it.z0, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, it.z0, "cauldron", { level: "3" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  // The bench sits against the west wall, so its backrest is the west side and
  // the seat opens into the guardroom. A stair's `facing` is its high half.
  c.put1(it.x0, it.z1, ctx.style["stair.interior"] as string, {
    facing: "west",
    half: "bottom",
    shape: "straight",
  });
}

/**
 * `barracks` — bunks, kit and a drill sergeant's table.
 *
 * The plainest building in the file and deliberately so: a barracks is rows of
 * beds in a long room, and the read comes from the repetition. Beds go through
 * `placeBed`, so a bunk is laid as a pair or not at all and never across the
 * door approach.
 */
function fitBarracks(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const bunks: { x: number; z: number; facing: Cardinal }[] = [];
  // The **foot** is one cell in from the wall and the head is against it:
  // `placeBed` puts the head at `foot + facing`, so a foot on the wall column
  // would want its head outside the room and the pair would never be laid.
  for (let z = it.z0; z <= it.z1; z += 2) {
    if (it.x0 + 1 <= it.x1) bunks.push({ x: it.x0 + 1, z, facing: "west" });
    if (it.x1 - 1 >= it.x0) bunks.push({ x: it.x1 - 1, z, facing: "east" });
  }
  // `placeBed` counts into `furnish`'s own tally rather than this one, and it
  // is the guard for both halves landing — so the loop simply asks for six
  // bunks and takes however many the room has space for.
  for (const bunk of bunks.slice(0, 6)) {
    ctx.placeBed(bunk.x, bunk.z, bunk.facing, "white_bed");
  }
  // Kit against the end wall, and the sergeant's table.
  const mid = Math.floor((it.x0 + it.x1) / 2);
  c.put1(mid, it.z1, "crafting_table");
  c.put1(mid - 1 >= it.x0 ? mid - 1 : mid, it.z1, "barrel", {
    facing: "up",
    open: "false",
  });
  c.put1(mid + 1 <= it.x1 ? mid + 1 : mid, it.z1, "cauldron", { level: "0" });
  c.put1(mid, it.z0, "smithing_table");
}

/* -------------------------------------------------------------------------- */
/* religious, fantasy, science                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `pagoda` — three to five stacked eave tiers.
 *
 * The tiers are the whole building. Each one is a plane of roof slabs over the
 * footprint inset by its index, with a course of upturned stairs one cell
 * further out: the stairs are the flare, and the flare is why a pagoda reads
 * as a pagoda rather than as a wedding cake. The lowest tier's flare lands in
 * the apron, which is the ring the eave it replaced was already using.
 *
 * The tier count is drawn from the room there is, between three and five, and
 * the spacing from the same: a tall envelope gets its tiers two courses apart,
 * a short one gets them stacked.
 */
function fitPagoda(ctx: FitOutContext, c: PropCounter): void {
  const plan = exteriorPlan(ctx);
  if (plan !== null) {
    clearRoof(ctx, plan);
    const room = plan.top - plan.base;
    const tiers = Math.max(3, Math.min(5, Math.floor(room / 2) + 1));
    const step = Math.max(1, Math.floor(room / tiers));
    const stairs = ctx.style["roof.stairs"] as string;
    const slabBlock = ctx.style["roof.slab"] as string;

    for (let k = 0; k < tiers; k++) {
      const y = plan.base + k * step;
      if (y > plan.top) break;
      const inset = k;
      const x0 = inset;
      const x1 = plan.sx - 1 - inset;
      const z0 = inset;
      const z1 = plan.sz - 1 - inset;
      if (x0 > x1 || z0 > z1) break;
      // The tier's deck.
      slab(ctx, y, x0, x1, z0, z1, slabBlock, { type: "bottom" });
      // The flare: one ring further out, upturned so the eave line kicks up.
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        for (let z = z0 - 1; z <= z1 + 1; z++) {
          if (x >= x0 && x <= x1 && z >= z0 && z <= z1) continue;
          if (x < -1 || x > plan.sx || z < -1 || z > plan.sz) continue;
          const facing: Cardinal = z < z0 ? "north" : z > z1 ? "south" : x < x0 ? "west" : "east";
          ctx.put(x, y, z, stairs, { facing, half: "top", shape: "straight" });
        }
      }
      c.n++;
    }
    // The finial: a post and a lantern on the crown, both supported.
    const fx = plan.sx >> 1;
    const fz = plan.sz >> 1;
    const crown = plan.base + (tiers - 1) * step;
    if (crown + 2 <= plan.top) {
      ctx.put(fx, crown + 1, fz, ctx.style["wall.fence"] as string);
      ctx.put(fx, crown + 2, fz, ctx.style["light.lantern"] as string, {
        hanging: "false",
      });
      c.n += 2;
    }
  }

  // A shrine hall: a runner up the middle, an altar at the far end, candles.
  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const altarZ = ctx.door === null || ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
  for (let z = it.z0; z <= it.z1; z++) c.put1(mid, z, "red_carpet");
  if (c.put1(mid, altarZ, "chiseled_stone_bricks")) {
    c.stack(mid, altarZ, 2, "red_candle", {
      candles: "2",
      lit: "false",
      waterlogged: "false",
    });
  }
  if (mid - 1 >= it.x0) c.put1(mid - 1, altarZ, pottedAt(mid - 1, altarZ));
  if (mid + 1 <= it.x1) {
    c.put1(mid + 1, altarZ, "lectern", {
      facing: altarZ === it.z0 ? "south" : "north",
      has_book: "false",
      powered: "false",
    });
  }
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
}

/**
 * `wizard_tower` — a stepped stone shaft under a pointed cap.
 *
 * The fantasy read is three things and they are all cheap: masonry with
 * glowing stones set into it, a cone rather than a pitch, and a light at the
 * top of the spire. The cone is built as inset rings of the roof's solid
 * block, one course apart, so the profile is steep — a hip roof rises one in
 * two, and a wizard's tower has to rise one in one or it is a granary with
 * pretensions.
 */
function fitWizardTower(ctx: FitOutContext, c: PropCounter): void {
  const plan = exteriorPlan(ctx);
  if (plan !== null) {
    const stone = masonry(ctx);
    // Masonry with glowstone set into it in a position-keyed scatter: the
    // tower glows from the wall rather than from lamps hung on it.
    recladRing(ctx, plan, 1, ctx.wallTop, (x, y, z) =>
      (x * 5 + y * 3 + z * 11) % 23 === 0 ? "glowstone" : stone(x, y, z),
    );
    clearRoof(ctx, plan);
    // The cone: inset rings, one course apart, until it closes.
    const solid = ctx.style["roof.solid"] as string;
    let k = 0;
    let capY = plan.base;
    let cap: LocalRect = plan.rect;
    for (let y = plan.base; y <= plan.top; y++, k++) {
      const x0 = k;
      const x1 = plan.sx - 1 - k;
      const z0 = k;
      const z1 = plan.sz - 1 - k;
      // Stop before the ring degenerates: the course after this one is what
      // the cap closes, and a cap is a face, not a speck.
      if (x0 > x1 || z0 > z1 || (k > 0 && degenerate(x0, x1, z0, z1))) break;
      capY = y;
      cap = { x0, z0, x1, z1 };
      c.n++;
      if (k === 0) {
        slab(ctx, y, x0, x1, z0, z1, solid);
        continue;
      }
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
          ctx.put(x, y, z, solid);
        }
      }
    }
    // Close the last ring, so the spire has something to stand on rather than
    // a hole where the cone ran out of footprint.
    slab(ctx, capY, cap.x0, cap.x1, cap.z0, cap.z1, solid);
    if (capY + 1 <= plan.top) {
      ctx.put(plan.sx >> 1, capY + 1, plan.sz >> 1, ctx.style["light.lantern"] as string, {
        hanging: "false",
      });
      c.n++;
    }
  }

  // The workshop: a brewing stand, presses of books, a cauldron and candles.
  const it = ctx.interior;
  c.put1(it.x1, it.z0, "brewing_stand", {
    has_bottle_0: "false",
    has_bottle_1: "false",
    has_bottle_2: "false",
  });
  // The enchanting table and its presses.
  //
  // A table with no bookshelves round it is the thing that reads as "the book
  // is missing": the client always draws the book, but with nothing to answer
  // it the table looks like a lectern that lost its page. So the table stands
  // one cell in from a corner and the corner's two wall rows carry an arc of
  // shelves at one block's distance, leaving it open to the room.
  //
  // The corner is *chosen*, not assumed: the flight, the ladder and the hearth
  // each reserve a corner of their own, and the north-west one is exactly
  // where the inter-storey stair lands.
  const corners = [
    [it.x0 + 1, it.z0 + 1, 1, 1],
    [it.x1 - 1, it.z0 + 1, -1, 1],
    [it.x0 + 1, it.z1 - 1, 1, -1],
    [it.x1 - 1, it.z1 - 1, -1, -1],
  ] as const;
  const arcOf = (
    x: number,
    z: number,
    dx: number,
    dz: number,
  ): readonly (readonly [number, number])[] => {
    const cells: (readonly [number, number])[] = [
      [x - dx, z - dz],
      [x - dx, z],
      [x - dx, z + dz],
      [x, z - dz],
      [x + dx, z - dz],
    ];
    return cells.filter(([cx, cz]) => cx >= it.x0 && cx <= it.x1 && cz >= it.z0 && cz <= it.z1);
  };
  let best: (typeof corners)[number] | null = null;
  let bestFree = 0;
  for (const corner of corners) {
    const [x, z, dx, dz] = corner;
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
    if (!ctx.free(x, z)) continue;
    const room = arcOf(x, z, dx, dz).filter(([cx, cz]) => ctx.free(cx, cz)).length;
    if (best === null || room > bestFree) {
      best = corner;
      bestFree = room;
    }
  }
  if (best !== null) {
    const [ex, ez, dx, dz] = best;
    if (c.put1(ex, ez, "enchanting_table")) {
      for (const [cx, cz] of arcOf(ex, ez, dx, dz)) c.put1(cx, cz, "bookshelf");
      // One candle on the table's open side, which is the whole of the detail.
      c.put1(ex, ez + dz, "white_candle", {
        candles: "2",
        lit: "false",
        waterlogged: "false",
      });
    }
  }
  c.put1(it.x1, it.z1, "cauldron", { level: "3" });
  for (let z = it.z0 + 3; z <= it.z1; z++) {
    if ((z + it.x0) % 2 !== 0) continue;
    c.put1(it.x0, z, "bookshelf");
  }
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z1, "lectern", {
    facing: "north",
    has_book: "false",
    powered: "false",
  });
}

/**
 * `observatory` — a stepped dome with a slit, and an instrument under it.
 *
 * The dome is inset rings like the wizard's cone, but two courses per step, so
 * it swells rather than points. The slit is a one-cell gap left open on the
 * north half of every ring — which is exactly what an observatory dome is for,
 * and which costs one condition inside the loop.
 *
 * The telescope is a gesture, not a model: a mount, a barrel of dark stone and
 * an end rod for the eyepiece, all routed through the prop counter so the
 * column it stands in never becomes a pillar through the room.
 */
function fitObservatory(ctx: FitOutContext, c: PropCounter): void {
  const plan = exteriorPlan(ctx);
  if (plan !== null) {
    clearRoof(ctx, plan);
    const solid = ctx.style["roof.solid"] as string;
    const slitX = plan.sx >> 1;
    let k = 0;
    for (let y = plan.base; y <= plan.top; y++) {
      const x0 = k;
      const x1 = plan.sx - 1 - k;
      const z0 = k;
      const z1 = plan.sz - 1 - k;
      if (x0 > x1 || z0 > z1) break;
      // Once the dome has narrowed past a ring, the course is its crown: a
      // filled rect, which is what a stepped dome closes with anyway.
      const crown = degenerate(x0, x1, z0, z1);
      // A crown is never one cell: it is pulled back to at least two on each
      // axis, which both plugs the ring below it and keeps it out of the
      // `floating.isolated` rule's way.
      const cx0 = crown ? Math.max(0, Math.min(x0, x1 - 1)) : x0;
      const cz0 = crown ? Math.max(0, Math.min(z0, z1 - 1)) : z0;
      for (let x = cx0; x <= x1; x++) {
        for (let z = cz0; z <= z1; z++) {
          const onRing = x === x0 || x === x1 || z === z0 || z === z1;
          if (!onRing && y !== plan.base && !crown) continue;
          // The slit: open on the north half of the dome, all the way up.
          if (!crown && x === slitX && z <= (plan.sz - 1) / 2) continue;
          ctx.put(x, y, z, solid);
        }
      }
      c.n++;
      if (crown) break;
      // Two courses per inset: a dome, not a cone.
      if ((y - plan.base) % 2 === 1) k++;
    }
  }

  // The instrument, under the slit.
  const it = ctx.interior;
  const mx = Math.floor((it.x0 + it.x1) / 2);
  const mz = Math.floor((it.z0 + it.z1) / 2);
  if (c.put1(mx, mz, "smooth_stone")) {
    c.stack(mx, mz, 2, "end_rod", { facing: "up" });
  }
  // The charts and the observer's kit.
  c.put1(it.x0, it.z1, "lectern", {
    facing: "east",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x1, it.z1, "bookshelf");
  c.put1(it.x1, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, it.z0, "cartography_table");
}

/* -------------------------------------------------------------------------- */
/* rural, leisure, memorial, waterworks                                        */
/* -------------------------------------------------------------------------- */

/**
 * `greenhouse` — glass walls, a glass roof and beds of crops.
 *
 * The glazing skips one course deliberately: the interior wall torches the
 * ground-floor fit-out brackets to the long walls name the block behind them,
 * and glass is not a face the physics lint will accept for that. Leaving the
 * torch course as it is costs one band of opaque wall at eye height, which is
 * what a real glasshouse has anyway — the frame rail.
 *
 * The beds are farmland written **into the floor plane**, with the crop above
 * it, so the bed is the floor rather than something standing on it. Every bed
 * cell goes through the prop counter, so a row that would strand a corner is
 * simply not laid.
 */
function fitGreenhouse(ctx: FitOutContext, c: PropCounter): void {
  // The **wall** plan, not the roof one: a glasshouse under a flat roof still
  // wants glass walls, and it still wants its plank lid taken off. The pitch
  // rebuild asks for its own headroom below, where it needs it.
  const plan = wallPlan(ctx);
  const torchY = Math.min(3, ctx.storyHeight - 1);
  if (plan !== null) {
    // The glazing runs from **sill** height, not from the floor. Two rules
    // make that true at every envelope:
    //
    // - no glass on a **floor plane**. On a two-storey glasshouse the upper
    //   plane lands mid-wall, and glazing it puts a pane at the height of an
    //   upstairs boot — the course Kai read as "a block too low";
    // - a **two-course plinth** at the foot of the wall wherever dropping the
    //   lowest course still leaves the wall some glass. A short wall keeps it:
    //   a glasshouse with no glass in it is worse than a low sill.
    const band: number[] = [];
    for (let y = GREENHOUSE_SILL_Y; y < ctx.wallTop; y++) {
      if (y === torchY) continue;
      if (y % ctx.storyHeight === 0) continue;
      band.push(y);
    }
    if (band.length > 1 && band[0] === GREENHOUSE_SILL_Y) band.shift();
    // Glaze the wall field, corner posts and the torch rail excepted.
    for (const cell of ringOf(plan.sx, plan.sz)) {
      const corner =
        (cell.x === 0 || cell.x === plan.sx - 1) && (cell.z === 0 || cell.z === plan.sz - 1);
      if (corner) continue;
      for (const y of band) {
        const standing = ctx.blockAt(cell.x, y, cell.z);
        if (standing !== undefined && KEEP_AS_IS.test(standing.block)) continue;
        ctx.put(cell.x, y, cell.z, "glass");
        c.n++;
      }
    }
    // The roof: the shell's planks come off first — a glass pitch built under
    // a plank one is a glass pitch nobody can see out of.
    clearRoof(ctx, plan);
    if (plan.top - plan.base < 2) {
      // No room to pitch: a flat deck of glass over the footprint, which is a
      // lean-to glasshouse and is still all glass.
      slab(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, "glass");
      c.n++;
    } else {
      const layers = Math.min(plan.top - plan.base, Math.ceil(Math.min(plan.sx, plan.sz) / 2));
      let closed = false;
      for (let k = 0; k < layers; k++) {
        const y = plan.base + k;
        const x0 = k;
        const x1 = plan.sx - 1 - k;
        const z0 = k;
        const z1 = plan.sz - 1 - k;
        if (x0 > x1 || z0 > z1) break;
        // As the dome and the cone do: once the ring degenerates it is drawn as
        // a filled rect, pulled back to at least two cells on each axis.
        const crown = k > 0 && degenerate(x0, x1, z0, z1);
        const cx0 = crown ? Math.max(0, Math.min(x0, x1 - 1)) : x0;
        const cz0 = crown ? Math.max(0, Math.min(z0, z1 - 1)) : z0;
        for (let x = cx0; x <= x1; x++) {
          for (let z = cz0; z <= z1; z++) {
            if (!crown && k > 0 && x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
            ctx.put(x, y, z, "glass");
          }
        }
        c.n++;
        if (crown) {
          closed = true;
          break;
        }
      }
      // The ridge closes the pitch in the same glass. It used to be laid in
      // frame timber, and a timber ridge over a glass roof is exactly the
      // plank Kai could not see the sky through.
      const ridgeY = plan.base + layers;
      if (!closed && ridgeY <= plan.top) {
        slab(ctx, ridgeY, layers, plan.sx - 1 - layers, layers, plan.sz - 1 - layers, "glass");
        c.n++;
      }
    }
  }

  // The beds: **raised** planters in rows, with the middle column left as the
  // path a gardener walks.
  //
  // Raised is the whole point. Farmland written into the floor plane is
  // farmland at the height a boot lands on, and a crop walked over is a crop
  // trampled back to dirt. A course up, the soil is a kerb you step *beside*:
  // the bed reads as a bed, the walk is unobstructed, and the only way onto
  // the soil is to climb it — which costs no fall, and so costs no crop.
  const it = ctx.interior;
  const crops = ["wheat", "carrots", "potatoes", "beetroots"];
  const mid = Math.floor((it.x0 + it.x1) / 2);
  for (let z = it.z0; z <= it.z1; z += 2) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (x === mid) continue;
      const crop = crops[(x * 3 + z) % crops.length] as string;
      const age = crop === "beetroots" ? "3" : "7";
      // The soil goes through the prop counter, so a row that would strand a
      // corner is simply not laid — the guard the flush beds already used.
      if (!c.put1(x, z, "farmland", { moisture: "7" })) continue;
      if (c.stack(x, z, 2, crop, { age })) continue;
      // No headroom over the planter: fall back to the flush bed, which is
      // the old idiom and still a bed.
      ctx.put(x, 1, z, crop, { age });
      ctx.put(x, 0, z, "farmland", { moisture: "0" });
    }
  }
  c.put1(it.x1, it.z1, "composter", { level: "3" });
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
}

/**
 * `gym` — mats, mirrors and iron.
 *
 * Three reads, and each is one material used honestly: the floor is wool, so
 * the room is matted; one long wall is glass, which at gym scale is a mirror;
 * and the equipment is the anvil family, a grindstone and a target, which are
 * the closest blocks Minecraft has to a rack of weights and a heavy bag.
 *
 * The bag hangs from the ceiling plane rather than standing on the floor — a
 * target at head height directly under the joists, so it is supported, is not
 * an isolated block, and leaves the cell under it walkable.
 */
function fitGym(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  const torchY = Math.min(3, ctx.storyHeight - 1);
  if (plan !== null) {
    // The mirror wall: the north face, glazed above the plinth.
    for (let x = 1; x < plan.sx - 1; x++) {
      for (let y = 2; y < ctx.wallTop; y++) {
        if (y === torchY) continue;
        const standing = ctx.blockAt(x, y, 0);
        if (standing !== undefined && KEEP_AS_IS.test(standing.block)) continue;
        ctx.put(x, y, 0, "glass");
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  // The mats: wool written into the floor plane, in two colours, so the room
  // reads as marked out rather than carpeted.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      ctx.put(x, 0, z, (x + z) % 2 === 0 ? "blue_wool" : "light_blue_wool");
    }
  }
  c.n++;
  // The iron: anvils in three states of wear, a grindstone, a smithing bench.
  c.put1(it.x1, it.z0, "anvil", { facing: "west" });
  c.put1(it.x1, it.z0 + 1 <= it.z1 ? it.z0 + 1 : it.z0, "chipped_anvil", {
    facing: "west",
  });
  c.put1(it.x1, it.z1, "damaged_anvil", { facing: "west" });
  c.put1(it.x0, it.z0, "grindstone", { face: "floor", facing: "south" });
  c.put1(it.x0, it.z1, "smithing_table");
  // The bench: a stair to sit on, looking at the mirror wall on the north
  // face — so its backrest, which is what `facing` names, is on the south.
  const mid = Math.floor((it.x0 + it.x1) / 2);
  c.put1(mid, it.z1, ctx.style["stair.interior"] as string, {
    facing: "south",
    half: "bottom",
    shape: "straight",
  });
  // The heavy bag, hung from the ceiling plane.
  const bagY = ctx.wallTop - 1;
  if (ctx.floors === 1 && bagY >= 2 && ctx.blockAt(mid, bagY, it.z0) === undefined) {
    ctx.put(mid, bagY, it.z0, "target", { power: "0" });
    c.n++;
  }
  // The water cooler.
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z1, "cauldron", {
    level: "3",
  });
}

/**
 * `mausoleum` — masonry, a cornice and one tomb.
 *
 * The smallest building in the file, and the one with the most restraint in
 * it: stone, a slab cornice in the apron at the eave line so the box has a
 * shadow, a sarcophagus in the middle of the floor and candles at its head.
 * Nothing else. A memorial that is busy is not a memorial.
 */
function fitMausoleum(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    recladRing(ctx, plan, 1, ctx.wallTop, masonry(ctx));
    // The cornice: a slab course in the apron at the plate line, which is the
    // same ring the eave uses and the same trick it plays.
    const slabBlock = ctx.style["stone.slab"] as string;
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) {
        const outside = x === -1 || x === plan.sx || z === -1 || z === plan.sz;
        if (!outside) continue;
        ctx.put(x, ctx.wallTop, z, slabBlock, { type: "top" });
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  const mx = Math.floor((it.x0 + it.x1) / 2);
  const mz = Math.floor((it.z0 + it.z1) / 2);
  // The sarcophagus: two cells of dressed stone with a slab lid on one, so it
  // reads as a chest rather than as a block.
  if (c.put1(mx, mz, "chiseled_stone_bricks")) {
    c.stack(mx, mz, 2, ctx.style["stone.slab"] as string, { type: "bottom" });
  }
  c.put1(mx, mz + 1 <= it.z1 ? mz + 1 : mz, "chiseled_stone_bricks");
  c.put1(it.x0, it.z0, pottedAt(it.x0, it.z0));
  c.put1(it.x1, it.z0, pottedAt(it.x1, it.z0));
  c.put1(it.x0, it.z1, "white_candle", {
    candles: "3",
    lit: "false",
    waterlogged: "false",
  });
}

/**
 * `windpump` — a mill wheel over a sump.
 *
 * The wheel is `emitBlades`, the windmill's static cross, reused rather than
 * copied: it is already sized off the envelope, already clipped to the apron,
 * and already refuses to build when the wall it would hang on is too small.
 * What makes this a pump and not a mill is inside — a sump of cauldrons, a
 * lifting gear of pistons and hoppers, and the barrels the water goes into.
 */
function fitWindpump(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mx = Math.floor((it.x0 + it.x1) / 2);
  const mz = Math.floor((it.z0 + it.z1) / 2);
  // The pump head: a piston on a stone base, and the pipe run beside it.
  if (c.put1(mx, mz, "smooth_stone"))
    c.stack(mx, mz, 2, "piston", { facing: "up", extended: "false" });
  c.put1(it.x0, it.z0, "cauldron", { level: "3" });
  c.put1(it.x0, it.z1, "cauldron", { level: "3" });
  c.put1(it.x1, it.z0, "hopper", { facing: "down", enabled: "true" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  emitBlades(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A planted pot for a decorative cell, keyed off the cell itself.
 *
 * A bare `flower_pot` is an *empty* pot in game — the block Kai read as "just
 * dirt". `core.ts` has the same idiom keyed off a seed stream; a fit-out has
 * no stream in its context, so the draw is a pure function of position, which
 * is deterministic for the same reason the masonry mix is.
 */
function pottedAt(x: number, z: number): string {
  const pots = ["potted_poppy", "potted_dandelion", "potted_azure_bluet", "potted_cornflower"];
  const i = (((x * 7 + z * 13) % pots.length) + pots.length) % pots.length;
  return pots[i] as string;
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
