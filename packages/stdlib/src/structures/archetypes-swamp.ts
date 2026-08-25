/**
 * The **Swamp Witch pack's buildings** — the twelve entries of that pack which
 * have an inside rather than a footprint on the wet ground.
 *
 * ## The thesis
 *
 * "A witch's swamp", "a bog hamlet", "a fen coven" all route to the `medieval`
 * era and arrive as a generic European village standing on dry grass, with the
 * homestead pack's single `witch_hut` as the only concession. The *palette* was
 * never the problem — `temperate_timber` and `boreal_pine` have both shipped
 * since the founding waves — the missing thing is the **noun set**: a fen place
 * is a hut up on stilt posts over standing water, a drying loft full of cut
 * herbs, a leech farm of curbed pools, an eel smokehouse, a chapel the bog has
 * pulled over, a stone circle out in the reeds, and the catalog could say none
 * of those. A cottage with moss on it is a cottage.
 *
 * The twelve:
 *
 * - `witch_stilt_hut` — the anchor: the hut carried on a ring of **stilt
 *   posts** with the deck plate over them and the under-hut space genuinely
 *   open, the cauldron at the head and the fire beside it;
 * - `herb_drying_loft` — the cut herb: poles overhead down both walls, the
 *   strands hanging from them and the sorting bench under;
 * - `bog_apothecary` — the counter down one wall, the steeping vats down the
 *   other and the brewing stand at the head;
 * - `fen_chapel_ruin` — the leaning chapel the bog has taken: **the ruins
 *   vocabulary's own decay**, run from a profile of this pack's, with a cold
 *   altar stump left at the far end;
 * - `eel_smokehouse` — the smoke racks overhead on both walls, the eels
 *   hanging from them and the smoke pit bedded in stone at the head;
 * - `moss_cottage` — the fen dwelling: the walls re-clad in **moss and mossy
 *   cobble**, a bed in the corner, moss carpet on the floor;
 * - `fen_landing_stage` — the short **private** landing at the foot of a
 *   garden: plank decking down both walls, mooring posts in the bays, the
 *   ropes coiled overhead and the bait tub by the way in;
 * - `leech_pools` — the leech farm: shallow **curbed** pools, every one of
 *   them closed on all four sides by full blocks so not a drop can move;
 * - `candle_workshop` — the tallow: the dipping vats down one wall, the
 *   bench of **unlit** candles down the other and the drying rods overhead;
 * - `black_goat_pen` — hurdles down one wall, the fodder up on a plinth down
 *   the other, the troughs in the bays;
 * - `fortune_tellers_tent` — the table at the head with a seat either side of
 *   it, a cold candle on it and the charms hung well overhead;
 * - `mangrove_root_cellar` — the root ribs across the head of the storey, the
 *   shelves down both walls and the crocks under them.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it.
 *
 * Eleven of the twelve do **no exterior work at all**. The exception is the
 * **stilt understorey**, which is the pack's whole silhouette argument: a
 * witch's hut standing flat on the ground is a cottage, and the read is the
 * ring of posts under a deck plate with daylight between them. It is built the
 * way `stilt_house` builds its posts — a full column standing on the ground,
 * every course of it — because a post with air under it is `floating.isolated`
 * in its oldest clothes.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Every interior block goes through {@link PropCounter}**, which routes
 *    through the ground floor's own `free` and `take` — the door approach, the
 *    stair columns, the connectivity guard and the blocked-column guard, none
 *    of them restated here. `raw` and `ctx.put` appear only in the apron and
 *    on the wall ring.
 * 2. **Everything stands against a wall and the middle stays walkable.** The
 *    bunk, the counter, the plinth and the pool curb each leave the room one
 *    walkable region on every envelope the solver can hand it.
 * 3. **Nothing is a pillar.** A stack filling an interior column from floor to
 *    ceiling is `interior.blocked_column`, which is why every post here is
 *    written with {@link headroomOf} in hand rather than at a fixed height.
 * 4. **No lantern by name, and no lit fire.** The lint's lantern rule fires on
 *    any block whose name ends `lantern`. Every glow in this file is
 *    `glowstone` bedded against solid neighbours; `campfire` never appears and
 *    every candle is written `lit: "false"`.
 * 5. **No sign blocks**, no bare `flower_pot`, and `cauldron` takes no
 *    properties. **`chain` is not in the pinned 1.21.11 table**: every hanging
 *    line here is `iron_bars`, and every one of them sits at head height or
 *    above so the floor under it stays a 1x2 body's floor.
 * 6. **NO `mud`, no `muddy_mangrove_roots`, no `farmland`.** This is the pack
 *    that will be tempted and it is the pack that must not: mud is 15/16 of a
 *    block, a body cannot stand on it, and a bog village floored in it is a
 *    village you can only look at. `packed_mud` and `coarse_dirt` are full
 *    cubes and read the same from a metre away.
 * 7. **Water is CURBED or it is not written.** The leech pools are the only
 *    fluid in the pack and every source block in them is closed on all four
 *    sides by a full block with the floor under it, so nothing can flow, and
 *    the pool is only written once the curb is *confirmed* standing.
 * 8. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same fen
 *    forever.
 */

import {
  PropCounter,
  type FitOutContext,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";
import { cellHash, decayShell, protectedColumn, settleDecayedFixtures, type DecayProfile } from "./decay.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` **last**, and mirrored
 * in the same order and the same position by the spec package's
 * `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element by
 * element, so it is load-bearing in both places.
 */
export const SWAMP_BUILDING_ARCHETYPES = [
  "witch_stilt_hut",
  "herb_drying_loft",
  "bog_apothecary",
  "fen_chapel_ruin",
  "eel_smokehouse",
  "moss_cottage",
  "fen_landing_stage",
  "leech_pools",
  "candle_workshop",
  "black_goat_pen",
  "fortune_tellers_tent",
  "mangrove_root_cellar",
] as const;

/** One of the archetypes this file fits out. */
export type SwampBuildingArchetype = (typeof SWAMP_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isSwampArchetype(value: string): value is SwampBuildingArchetype {
  return (SWAMP_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted with the other pack tables, above the greedy general tables and
 * below nothing that would change. The **non-claims** are the load-bearing
 * half of this comment, because the fen vocabulary brushes up against words
 * older tables own and own correctly — and this pack has more near misses than
 * any pack since the Norse:
 *
 * - **bare `witch_hut`, `witches_hut` and `witch` are NOT ours.** That is the
 *   homestead wave's building, word for word, and a document that writes any
 *   of the three must keep getting it. This pack's anchor answers to
 *   `witch_stilt_hut`, `stilt_hut` and `swamp_hut` — and **bare `stilt_house`
 *   and `stilts` stay the regional wave's**, which is the jungle box that only
 *   *reads* as if it stood over water;
 * - **bare `apothecary`, `pharmacy`, `herbalist` and `alchemist` are not
 *   ours** — every one of them is the trade wave's shop and that is the better
 *   building for a document that writes them. Ours answers to `bog_apothecary`,
 *   `fen_apothecary` and `bog_alchemist`;
 * - **bare `chapel`, `wayside_chapel`, `ruined_chapel`, `ruined_church` and
 *   `abbey_ruin` are not ours.** The first two are the faith waves', the last
 *   three the relic wave's `ruined_church`, whose claim on a plain ruin request
 *   is the better one. Ours answers to `fen_chapel_ruin`, `bog_chapel` and
 *   `sunken_chapel`;
 * - **bare `smokehouse`, `smoke_house`, `smokery` and `smoker` are not ours** —
 *   the hedgerow expansion's, and a general smokehouse is what most documents
 *   mean. Ours answers to `eel_smokehouse`, `eel_smoker` and `fen_smokehouse`;
 * - **bare `cottage` is not ours**, and neither are `ruined_cottage`,
 *   `derelict_cottage` or `gingerbread_cottage`. Ours answers to
 *   `moss_cottage`, `mossy_cottage` and `fen_cottage`;
 * - **bare `boardwalk` is not ours** and could not be: that is an
 *   **infrastructure** entry, a public route across the wet, and this is a
 *   short *private* landing at the foot of one garden. The two are different
 *   things and share no word — ours answers to `fen_landing_stage`,
 *   `swamp_jetty` and `fen_jetty`, and bare `landing`, `canoe_landing`,
 *   `dugout_landing` and `smugglers_landing` all stay exactly where they were;
 * - **bare `pen`, `pig_pen`, `sheep_pen`, `cattle_pen`, `paddock` and `corral`
 *   are not ours** — the founding table's and the agrarian expansion's. The
 *   goat pen answers to `black_goat_pen`, `goat_pen` and `witch_goat_pen`;
 * - **bare `tent` is not ours** — the blitz pack's prop — and neither is
 *   `circus_tent`. The fortune teller's answers to `fortune_tellers_tent`,
 *   `fortune_tent` and `soothsayer_tent`;
 * - **bare `cellar`, `root_cellar`, `root_cellar_mound` and `wine_cellar` are
 *   not ours**: the first three are the underground grammar's basement styles
 *   and the homestead's mound. Ours answers to `mangrove_root_cellar`,
 *   `mangrove_cellar` and `bog_cellar`;
 * - **bare `workshop`, `chandlery` and `distillery` are not ours** —
 *   `chandlery` in particular is the nautical wave's ship chandler, which sells
 *   rope and tar rather than dipping tallow. Ours answers to
 *   `candle_workshop`, `candle_works` and `candle_maker`;
 * - **bare `scrying_pool`, `swimming_pool` and `duck_pond` are not ours**; the
 *   leech farm answers to `leech_pools`, `leech_farm` and `leech_beds`;
 * - **bare `drying_rack`, `fish_drying_rack`, the Nordic pack's
 *   `drying_rack_yard` and the steppe pack's `borts_rack` are not ours** — the
 *   drying loft answers to `herb_drying_loft`, `drying_loft` and `herb_loft`,
 *   which is a **room with a floor in it** rather than a frame in the open.
 *
 * Every claim below is therefore either a compound of this pack's own ids or a
 * word (`leech_beds`, `bog_alchemist`, `swamp_jetty`, `candle_works`) that no
 * table in the catalog has ever claimed.
 */
export function swampArchetypeOfTags(tags: readonly string[]): SwampBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("witch_stilt_hut") || has("stilt_hut") || has("swamp_hut")) return "witch_stilt_hut";
  if (has("herb_drying_loft") || has("drying_loft") || has("herb_loft")) return "herb_drying_loft";
  if (has("bog_apothecary") || has("fen_apothecary") || has("bog_alchemist")) {
    return "bog_apothecary";
  }
  if (has("fen_chapel_ruin") || has("bog_chapel") || has("sunken_chapel")) return "fen_chapel_ruin";
  if (has("eel_smokehouse") || has("eel_smoker") || has("fen_smokehouse")) return "eel_smokehouse";
  if (has("moss_cottage") || has("mossy_cottage") || has("fen_cottage")) return "moss_cottage";
  if (has("fen_landing_stage") || has("swamp_jetty") || has("fen_jetty")) {
    return "fen_landing_stage";
  }
  if (has("leech_pools") || has("leech_farm") || has("leech_beds")) return "leech_pools";
  if (has("candle_workshop") || has("candle_works") || has("candle_maker")) {
    return "candle_workshop";
  }
  if (has("black_goat_pen") || has("goat_pen") || has("witch_goat_pen")) return "black_goat_pen";
  if (has("fortune_tellers_tent") || has("fortune_tent") || has("soothsayer_tent")) {
    return "fortune_tellers_tent";
  }
  if (has("mangrove_root_cellar") || has("mangrove_cellar") || has("bog_cellar")) {
    return "mangrove_root_cellar";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * Almost the whole pack takes **`gable`**, because a fen building is a ridge
 * with the rain running straight off it and a crooked ridge is the read. The
 * two exceptions carry the argument: the **leech pools** take `flat`, since a
 * pool yard has a cover rather than a roof, and the **fortune teller's** takes
 * `hip`, which is the closest thing the shell has to a canvas.
 *
 * The window rhythms carry the rest. The smokehouse, the goat pen, the fortune
 * teller's and the root cellar are **`none`** — smoke, draught, secrecy and the
 * dark respectively — and the working rooms are lit (`regular`), because a
 * herbalist and a chandler both work by eye.
 */
export function swampFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "witch_stilt_hut":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "herb_drying_loft":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "bog_apothecary":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "fen_chapel_ruin":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    case "eel_smokehouse":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "moss_cottage":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "fen_landing_stage":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "gable" };
    case "leech_pools":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "flat" };
    case "candle_workshop":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "black_goat_pen":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "fortune_tellers_tent":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "mangrove_root_cellar":
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
export function furnishSwamp(ctx: FitOutContext): number {
  if (!isSwampArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "witch_stilt_hut":
      fitWitchStiltHut(ctx, c);
      break;
    case "herb_drying_loft":
      fitHerbDryingLoft(ctx, c);
      break;
    case "bog_apothecary":
      fitBogApothecary(ctx, c);
      break;
    case "fen_chapel_ruin":
      fitFenChapelRuin(ctx, c);
      // After the decay pass and after the ruin's own furniture, exactly as
      // `furnishRelic` does it: nothing the decay unsupported may survive it.
      settleDecayedFixtures(ctx);
      break;
    case "eel_smokehouse":
      fitEelSmokehouse(ctx, c);
      break;
    case "moss_cottage":
      fitMossCottage(ctx, c);
      break;
    case "fen_landing_stage":
      fitFenLandingStage(ctx, c);
      break;
    case "leech_pools":
      fitLeechPools(ctx, c);
      break;
    case "candle_workshop":
      fitCandleWorkshop(ctx, c);
      break;
    case "black_goat_pen":
      fitBlackGoatPen(ctx, c);
      break;
    case "fortune_tellers_tent":
      fitFortuneTellersTent(ctx, c);
      break;
    case "mangrove_root_cellar":
    default:
      fitMangroveRootCellar(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the shared machinery                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How many courses of clear air this storey actually has.
 *
 * On one floor the room runs to the eave plate; on more than one it stops at
 * the boards over it, and a fit-out that measured the first and built into the
 * second would put its rack through somebody's floor. Wave 3B's number,
 * restated here rather than imported for the reason every pack restates it:
 * two packs are two seams, and a shared private helper is a shared edit.
 */
function headroomOf(ctx: FitOutContext): number {
  return ctx.floors > 1 ? ctx.storyHeight - 1 : ctx.wallTop - 1;
}

/** The default properties of a fence post standing on its own. */
const POST = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
} as const;

/** A closed barrel, the one cargo block this pack uses. */
const BARREL = { facing: "up", open: "false" } as const;

/** A bottom slab — the bench top, the plinth, the deck and the shelf. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a rail, a rope, a rack. */
const BARS_Z = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
} as const;

/** A bare post of bars, joined to nothing sideways — a hanging strand. */
const BARS_POST = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
} as const;

/** A cold candle. Every candle in this pack is unlit; a lit one is a fire. */
const CANDLE = { candles: "1", lit: "false", waterlogged: "false" } as const;

/** A brewing stand with nothing in it. */
const STILL = {
  has_bottle_0: "false",
  has_bottle_1: "false",
  has_bottle_2: "false",
} as const;

/** The wall row furthest from the door — the head of a room. */
function headRow(ctx: FitOutContext): number {
  const it = ctx.interior;
  if (ctx.door === null) return it.z0;
  return ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
}

/**
 * Where along a wall row a fit-out can actually stand something `reach` cells
 * either side of a centre.
 *
 * The hedgerow pack's walk, restated: the middle of a wall is where the shell
 * reserves the hearth and where a door most often lands, so "centre it" is the
 * one answer unavailable on most envelopes. `null` means the room will give
 * none and the caller falls back to something one cell wide.
 */
function bayOn(ctx: FitOutContext, z: number, reach: number): number | null {
  const it = ctx.interior;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  for (let d = 0; d <= it.x1 - it.x0; d++) {
    for (const x of d === 0 ? [midX] : [midX - d, midX + d]) {
      if (x - reach < it.x0 || x + reach > it.x1) continue;
      let clear = true;
      for (let dx = -reach; dx <= reach && clear; dx++) clear = ctx.free(x + dx, z);
      if (clear) return x;
    }
  }
  return null;
}

/**
 * Stand one block somewhere on a row, starting at `preferX` and walking
 * outward until a cell **takes** it.
 *
 * The dwarven pack's banked lesson, restated: `free` and `put1` are different
 * questions — a cell can be unreserved and still be refused by the walkability
 * guard or the blocked-column guard — so a one-off prop that *matters* (the
 * cauldron, the brewing stand, the fortune teller's table) asks for the first
 * cell that **accepts** it rather than for the first cell that looks empty. The
 * scan is symmetric and deterministic, so the answer is the same forever.
 */
function standInRow(
  ctx: FitOutContext,
  c: PropCounter,
  z: number,
  preferX: number,
  block: string,
  props?: Record<string, string>,
): boolean {
  const it = ctx.interior;
  if (z < it.z0 || z > it.z1) return false;
  for (let d = 0; d <= it.x1 - it.x0; d++) {
    for (const x of d === 0 ? [preferX] : [preferX - d, preferX + d]) {
      if (x < it.x0 || x > it.x1) continue;
      if (c.put1(x, z, block, props)) return true;
    }
  }
  return false;
}

/** The middle column of the interior — where the shell hangs its lantern. */
function midXOf(it: LocalRect): number {
  return Math.floor((it.x0 + it.x1) / 2);
}

/**
 * The **fire**: a bedded glow with dressed stone either side of it.
 *
 * `glowstone` and never `campfire`: a lit fire is a fire the physics lint has
 * opinions about, and a full cube bedded between full cubes has no support rule
 * to fail. The stones either side are what make it read as a hearth rather
 * than as a lamp dropped on the floor.
 */
function hearthAt(ctx: FitOutContext, c: PropCounter, z: number): void {
  const it = ctx.interior;
  const stone = ctx.style["foundation.accent"] as string;
  const x = bayOn(ctx, z, 1) ?? bayOn(ctx, z, 0);
  if (x === null) return;
  if (!c.put1(x, z, "glowstone")) return;
  for (const k of [x - 1, x + 1]) {
    if (k < it.x0 || k > it.x1) continue;
    c.put1(k, z, stone);
  }
}

/**
 * A **plinth** of bottom slabs down one wall, in bays.
 *
 * Bottom slabs, not full blocks: a body stands on a bottom slab, so a plinth
 * down a wall is furniture rather than a second wall, and the bays keep the
 * wall row steppable at intervals besides.
 */
function plinth(ctx: FitOutContext, c: PropCounter, x: number, slab: string, skipZ: number): void {
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === skipZ) continue;
    c.put1(x, z, slab, SLAB);
  }
}

/**
 * A **rail** of `iron_bars` down one wall, at the top of the storey.
 *
 * Head height and no lower, always: `iron_bars` is a body-blocking block to the
 * physics lint, so a rail at `y = 2` is a rail through somebody's face and the
 * cell under it stops being walkable. Nothing happens at all on a storey with
 * no room for one.
 */
function railOn(ctx: FitOutContext, c: PropCounter, x: number, props: Record<string, string>): void {
  const it = ctx.interior;
  const head = headroomOf(ctx);
  if (head < 3) return;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(x, z, head, "iron_bars", props);
}

/**
 * The strands hanging one course under a rail — never below head height.
 *
 * Four courses of storey or nothing happens: a strand at `y = 2` is a strand in
 * a body's face and `iron_bars` is a body-blocking block.
 */
function strandsOn(ctx: FitOutContext, c: PropCounter, x: number): void {
  const it = ctx.interior;
  const head = headroomOf(ctx);
  if (head < 4) return;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 === 1) continue;
    c.stack(x, z, head - 1, "iron_bars", BARS_POST);
  }
}

/**
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one: a
 * position-derived integer hash is the idiom every earlier wave uses, it is a
 * pure function, and `Math.imul` is exactly specified where `Math.pow` is not.
 */
function swampJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/* -------------------------------------------------------------------------- */
/* the exterior: the wall ring and the stilt apron                             */
/* -------------------------------------------------------------------------- */

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

/** The ring of cells **outside** the footprint — the apron the stilts stand in. */
function apronOf(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = -1; z <= sz; z++) {
    for (let x = -1; x <= sx; x++) {
      if (x === -1 || x === sx || z === -1 || z === sz) out.push({ x, z });
    }
  }
  return out;
}

/**
 * Blocks a re-clad may never overwrite.
 *
 * Wave two's list unchanged: the way in, the way up, the fire, the glass and
 * anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/** True when the shell put something at this cell a fit-out must leave alone. */
function protectedAt(ctx: FitOutContext, x: number, y: number, z: number): boolean {
  const standing = ctx.blockAt(x, y, z);
  return standing !== undefined && PRESERVE.test(standing.block);
}

/** The cell a player stands in to open the door, or `null` when there is none. */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/**
 * The doorstep and the door itself — the two cells nothing out here may fill.
 *
 * The physics lint walks a building **from its door**; a stilt post written
 * over the doorstep is a building with no way in.
 */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  return out !== null && out.x === x && out.z === z;
}

/** Re-clad the wall ring between two courses. `block` is a pure function of position. */
function reclad(
  ctx: FitOutContext,
  plan: RebuildPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
): number {
  const out = outsideDoor(ctx);
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    if (out !== null && out.x === cell.x && out.z === cell.z) continue;
    for (let y = yFrom; y <= yTo; y++) {
      if (protectedAt(ctx, cell.x, y, cell.z)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/**
 * **THE STILT UNDERSTOREY** — the pack's whole silhouette argument.
 *
 * A witch's hut standing flat on the ground is a cottage. What makes the read
 * is a ring of **posts** in the apron with **daylight between them** and a
 * **deck plate** cantilevered over their heads, so the eye supplies the black
 * water the terrain does not.
 *
 * Three properties, and each is somebody's earlier scar:
 *
 * 1. **Every stilt is a full column, solid to the ground.** `stilt_house`
 *    learned this on the Terrarium: on conformed terrain the apron ground
 *    fills local `y = 0`, on a platform it sits one lower, and a post standing
 *    on air fails the lint's support-chain rule. So the column is written from
 *    `y = 0` (when nothing is there already) up to the plate, every course of
 *    it, with no gap anywhere in it.
 * 2. **The deck plate above them is fully supported.** It is a course of bottom
 *    slabs round the whole apron at `y = 3`, and every cell of it touches
 *    either a post head under it or the building's own wall face beside it —
 *    never air on all six sides.
 * 3. **The under-hut space is genuinely open.** Nothing is written at `y = 1`
 *    or `y = 2` in any apron cell that is not a post, which is what makes the
 *    posts read as posts. A skirt of boards would be a plinth, and a hut on a
 *    plinth is a cottage again.
 *
 * The doorstep is skipped outright, on both counts.
 */
function stiltUnderstorey(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan === null) return;
  // `wall.accent` and not `wall.log`: there is no `wall.log` symbol in
  // `BUILDING_STYLE_DEFAULTS`, and a fit-out that reads a symbol the style map
  // does not carry writes `undefined` into the op stream — which is not a
  // crash, it is 102 blockless ops that only fail much later.
  const log = ctx.style["wall.accent"] as string;
  const slab = ctx.style["stone.slab"] as string;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    const onX = cell.x === -1 || cell.x === plan.sx;
    const along = onX ? cell.z : cell.x;
    // The posts: every other bay, a full column from the ground to the plate.
    if (along % 2 === 0) {
      if (ctx.blockAt(cell.x, 0, cell.z) === undefined) {
        ctx.put(cell.x, 0, cell.z, log, { axis: "y" });
        c.n++;
      }
      for (let y = 1; y <= 2; y++) {
        ctx.put(cell.x, y, cell.z, log, { axis: "y" });
        c.n++;
      }
    }
    // The deck plate, over the posts and against the wall face.
    if (ctx.wallTop >= 4) {
      ctx.put(cell.x, 3, cell.z, slab, SLAB);
      c.n++;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the stilt hut                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `witch_stilt_hut` — the anchor of the pack, and the only building in it a
 * stranger will name out loud.
 *
 * The **stilt understorey** is the outside of it. Inside there are three
 * things: the **cauldron** at the head — the one must-have in the pack, and so
 * it goes down through {@link standInRow}, which asks for the first cell that
 * *accepts* it rather than the first cell that looks empty — the **fire**
 * beside it, and a **bunk** of bottom slabs down one wall with the herb rail
 * over the other.
 *
 * Nothing stands in the middle of the floor, because the middle of a one-room
 * hut is the only place there is to stand.
 */
function fitWitchStiltHut(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  stiltUnderstorey(ctx, c);

  // The cauldron at the head — the must-have, placed by the accepting scan.
  standInRow(ctx, c, headZ, midXOf(it), "cauldron");

  // The fire, one row in from the head so the way in stays clear.
  const fireZ = headZ === it.z0 ? Math.min(it.z0 + 2, it.z1) : Math.max(it.z1 - 2, it.z0);
  hearthAt(ctx, c, fireZ);

  // The bunk down one wall, in bays.
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x0, z, slab, SLAB);
  }

  // The herb rail over the other, and the stores by the way in.
  railOn(ctx, c, it.x1, BARS_Z);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the drying loft                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `herb_drying_loft` — where the cut herb hangs until it is brittle.
 *
 * The distinction from every drying rack in the catalog is not decoration: the
 * Nordic pack's `drying_rack_yard` is split cod hung **vertically** off a shore
 * frame outdoors, as a prop, and the steppe pack's `borts_rack` is beef on
 * horizontal poles. This is a **room with a floor in it**: poles down both
 * walls at the top of the storey, the strands hanging one course under them,
 * the **sorting bench** down one wall and the **composter** for the spoiled cut
 * at the head, which is the one piece that says herb rather than fish.
 */
function fitHerbDryingLoft(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The poles, both walls, at the top of the storey, and the strands under.
  railOn(ctx, c, it.x0, BARS_Z);
  railOn(ctx, c, it.x1, BARS_Z);
  strandsOn(ctx, c, it.x0);
  strandsOn(ctx, c, it.x1);

  // The sorting bench down one wall, in bays.
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x0, z, slab, SLAB);
  }

  // The composter at the head — the must-have — and the crocks by the way in.
  standInRow(ctx, c, headZ, midXOf(it), "composter", { level: "0" });
  c.put1(it.x1, doorEnd, "barrel", BARREL);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the apothecary                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `bog_apothecary` — the fen's own dispensary, and not the trade wave's shop.
 *
 * The trade `apothecary` is a **shop**: a counter, a customer side and a street
 * door, and it keeps every bare spelling of the word. This one has no customers
 * at all. It is a still-room — the **counter** of slabs down one wall, the
 * **steeping vats** ranked down the other with the shelf rail over them, and
 * the **brewing stand** at the head, which is the piece that makes it a
 * still-room rather than a pantry and so goes down through the accepting scan.
 */
function fitBogApothecary(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The counter down one wall.
  plinth(ctx, c, it.x0, slab, headZ);

  // The steeping vats down the other, with the shelf rail over them.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x1, z, "cauldron");
    else if ((z - it.z0) % 3 === 2) c.put1(it.x1, z, "barrel", BARREL);
  }
  railOn(ctx, c, it.x1, BARS_Z);

  // The still at the head — the must-have.
  standInRow(ctx, c, headZ, midXOf(it), "brewing_stand", STILL);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the chapel ruin                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The fen chapel's decay, as a {@link DecayProfile}.
 *
 * RUINS-PLAN-v0 WP-1's law, obeyed: the five moves are the operators in
 * `decay.ts` and a ruin is a **parameter set**, never a hand-written sequence.
 * This one is the relic wave's ruined church leaned into the wet — a generous
 * crumble so the walls stay tall enough to read as a nave, heavy overgrowth
 * because a bog takes a building faster than a hillside does, and survivor
 * cladding of **mossy cobble and mossy stone brick**, which is what stone looks
 * like after fifty years with its feet in water.
 */
export const FEN_CHAPEL_DECAY: DecayProfile = {
  intensity: 0.45,
  collapse: "structured",
  collapseFloor: 3,
  collapseSpread: 3,
  overgrowth: 0.5,
  rubble: 0.24,
  materials: {
    clad: (x, y, z) => {
      const k = cellHash(23, x + y * 3, z) % 5;
      if (k === 0) return "mossy_stone_bricks";
      if (k === 1) return "cracked_stone_bricks";
      if (k === 2) return "mossy_cobblestone";
      return "stone_bricks";
    },
    fragmentStyle: "stone.slab",
    spill: "mossy_cobblestone",
    heap: (x, z) => (cellHash(29, x, z) % 2 === 0 ? "mossy_cobblestone" : "cobblestone"),
    floorPaint: (x, z) => (cellHash(31, x, z) % 4 === 0 ? "moss_block" : null),
  },
};

/**
 * `fen_chapel_ruin` — the chapel the bog has pulled over.
 *
 * The decay is {@link FEN_CHAPEL_DECAY} and it is run by `decayShell`, which is
 * the ruins vocabulary's own operator set: this file writes not one crumble
 * move of its own, because a second implementation of the ruin law is a second
 * grammar and the law forbids it. `ctx.decay` is never read here either — the
 * **pristine-page rule**: an archetype that consulted the document's own decay
 * dial would decay twice on a declining page and differently on a clean one.
 * This chapel is a ruin because it is *this archetype*, and it is exactly as
 * ruined on a pristine page as on a ruined one.
 *
 * What the decay does not say is that this was a chapel, so the fit-out says
 * it: an **altar stump** at the end furthest from the door, one block of
 * chiseled stone with a slab on it, and no candle at all — this altar has been
 * cold since before anybody's grandmother.
 */
function fitFenChapelRuin(ctx: FitOutContext, c: PropCounter): void {
  decayShell(ctx, c, FEN_CHAPEL_DECAY);
  const it = ctx.interior;
  const far = ctx.door !== null && ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
  const mid = midXOf(it);
  // One column off the middle: the shell hangs its lantern in the middle column
  // and nothing here stands under it.
  for (const x of [mid - 1, mid + 1, it.x0, it.x1]) {
    if (x < it.x0 || x > it.x1) continue;
    if (protectedColumn(ctx, x, far)) continue;
    if (c.put1(x, far, "chiseled_stone_bricks")) {
      c.stack(x, far, 2, ctx.style["stone.slab"] as string, SLAB);
      break;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the smokehouse                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `eel_smokehouse` — where the fen's one reliable protein is cured.
 *
 * Bare `smokehouse`, `smoke_house`, `smokery` and `smoker` stay the hedgerow
 * expansion's, which is the better building for every document that writes
 * them. This one is specifically the **eel** house: the racks overhead on both
 * walls with the eels hanging a course under them, the **smoke pit** bedded in
 * stone at the head — `glowstone` between dressed blocks, because a lit fire
 * inside a sealed smoky room is exactly the finding the physics lint exists for
 * — and the **salting barrels** by the way in.
 */
function fitEelSmokehouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The racks, both walls, and the eels hanging under them.
  railOn(ctx, c, it.x0, BARS_Z);
  railOn(ctx, c, it.x1, BARS_Z);
  strandsOn(ctx, c, it.x0);
  strandsOn(ctx, c, it.x1);

  // The smoke pit at the head.
  hearthAt(ctx, c, headZ);

  // The cutting bench down one wall and the salt by the way in.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 2 === 1) continue;
    c.put1(it.x0, z, slab, SLAB);
  }
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the moss cottage                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `moss_cottage` — the fen dwelling, and the humblest room in the pack.
 *
 * Bare `cottage` still falls through to the founding cottage, as it must. What
 * makes this one a *fen* cottage is the skin: the walls are re-clad in **moss
 * block banded with mossy cobble**, which is the one material argument in the
 * pack and is named outright as a substance rather than drawn from the palette,
 * exactly as the Mesoamerican pack names its mossy stone — moss is moss in
 * boreal pine and in sun clay alike.
 *
 * Inside: a **bed** in the corner (through `ctx.placeBed`, which lays both
 * halves or neither), a **table**, the **pot** on the fire and a run of **moss
 * carpet** on the floor, which is a passable block and so costs the room
 * nothing at all.
 */
function fitMossCottage(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      swampJitter(x, y, z, 4) === 0 ? "moss_block" : "mossy_cobblestone",
    );
  }

  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The bed in the far corner, both halves or neither.
  ctx.placeBed(it.x0, headZ, it.x0 + 1 <= it.x1 ? "east" : "west", "green_bed");

  // The pot on the fire, and the table beside it.
  standInRow(ctx, c, headZ, midXOf(it), "cauldron");
  c.put1(it.x1, headZ, slab, SLAB);
  c.put1(it.x1, doorEnd, "barrel", BARREL);

  // The moss on the floor: passable, so it takes nothing from the room.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x0, z, "moss_carpet");
  }
}

/* -------------------------------------------------------------------------- */
/* the landing stage                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `fen_landing_stage` — the short **private** landing at the foot of a garden.
 *
 * The distinction from the infrastructure `boardwalk` is the whole reason this
 * archetype exists rather than reaching for that one: a boardwalk is a **public
 * route** across the wet, it runs between two places and the linework engine
 * builds it. This is one household's landing — a covered stage with the punt
 * tied at the end of it — and it is a **building with a floor**, which is a
 * different thing that shares no word with it.
 *
 * The fit-out is the **decking** down both walls in bays, the **mooring posts**
 * standing in them, the **ropes** coiled overhead and the **bait tub** by the
 * way in. The middle stays bare, because that is where a body carrying a
 * basket has to walk.
 */
function fitFenLandingStage(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const fence = style["wall.fence"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const step = (z - it.z0) % 3;
      if (step === 1) c.put1(x, z, fence, POST);
      else if (step !== 2) c.put1(x, z, slab, SLAB);
    }
  }

  // The ropes, coiled overhead on one wall.
  railOn(ctx, c, it.x1, BARS_Z);

  // The catch at the head, and the bait tub by the way in.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, "barrel", BARREL);
  }
  const bay = bayOn(ctx, doorEnd, 0);
  if (bay !== null) c.put1(bay, doorEnd, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the leech pools                                                             */
/* -------------------------------------------------------------------------- */

/**
 * **A curbed pool, or nothing at all.**
 *
 * The one fluid in the pack, and the whole of the care it takes. A water source
 * block moves the instant a horizontal neighbour is anything a fluid can enter
 * — air, a slab, a fence, a stair — so a pool written and *hoped about* is a
 * flooded quarter and a fluid-lint failure a day later.
 *
 * The order here is therefore: **curb first, confirm, and only then the
 * water.** The four horizontal neighbours are read back out of the cell map
 * with `blockAt` after the curb has been offered, and unless every one of them
 * is a standing full block — a curb this pass laid, or the building's own wall
 * — the water is never written and the bay is simply a curb with nothing in it.
 * A curb that fails to close is a dry pool, which is a fine thing to walk past;
 * a pool that fails to close is a river through somebody's parlour.
 *
 * Slabs are deliberately **not** used for the curb: a bottom slab is half a
 * block and water pours straight through it.
 *
 * Returns whether the water landed.
 */
function curbedPool(ctx: FitOutContext, c: PropCounter, x: number, z: number, curb: string): boolean {
  const it = ctx.interior;
  // The curb: the cells either side of the pool along the wall, and the one
  // inward of it. The wall itself closes the fourth side.
  for (const [cx, cz] of [
    [x, z - 1],
    [x, z + 1],
    [x === it.x0 ? x + 1 : x - 1, z],
  ] as const) {
    if (cx < it.x0 || cx > it.x1 || cz < it.z0 || cz > it.z1) continue;
    c.put1(cx, cz, curb);
  }
  // The confirmation: every horizontal neighbour is a standing full block.
  const full = (nx: number, nz: number): boolean => {
    const here = ctx.blockAt(nx, 1, nz);
    if (here === undefined) return false;
    return !/(_slab|_stairs|_fence|_wall|_door|iron_bars|carpet|_gate|cauldron|composter|barrel|chest)$/.test(
      here.block,
    );
  };
  if (!full(x - 1, z) || !full(x + 1, z) || !full(x, z - 1) || !full(x, z + 1)) return false;
  return c.put1(x, z, "water", { level: "0" });
}

/**
 * `leech_pools` — the leech farm, which is a real trade and a grim one.
 *
 * Shallow standing pools in a curbed yard, fished with a bare leg. The pools
 * run down **both wall rows** in bays, every one of them closed by
 * {@link curbedPool}, and the middle of the floor is left completely bare
 * because the pools are worked from the walkway between them.
 *
 * The **cover** is `flat` rather than a ridge, for the reason a real pool yard
 * has one: what a pool needs is shade and a lid, not a gable.
 */
function fitLeechPools(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const curb = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ || z === doorEnd) continue;
      if ((z - it.z0) % 3 !== 1) continue;
      curbedPool(ctx, c, x, z, curb);
    }
  }

  // The sorting bench across the head, in bays, and the crocks by the way in.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the chandler                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `candle_workshop` — the tallow dipper, and the reason a fen village has
 * light at all.
 *
 * Bare `chandlery` is the nautical wave's **ship** chandler, which sells rope,
 * tar and biscuit and has nothing to do with candles; bare `workshop` stays
 * where it was. This one answers to `candle_workshop`, `candle_works` and
 * `candle_maker`.
 *
 * The room is the **dipping vats** down one wall, the **bench** down the other
 * with candles standing on it, the **drying rods** overhead and the **tallow
 * vat** at the head, which is the must-have and goes down through the accepting
 * scan. Every candle is written `lit: "false"`: a rack of lit candles is a rack
 * of fires, and the one light in this room is the bedded glow the shell hangs.
 */
function fitCandleWorkshop(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The dipping vats down one wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x0, z, "cauldron");
  }

  // The bench down the other, with the cold candles standing on it.
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 2) continue;
    if (!c.put1(it.x1, z, slab, SLAB)) continue;
    if ((z - it.z0) % 2 === 0) c.stack(it.x1, z, 2, "white_candle", CANDLE);
  }

  // The drying rods overhead, and the tallow at the head.
  railOn(ctx, c, it.x1, BARS_Z);
  standInRow(ctx, c, headZ, midXOf(it), "cauldron");
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the goat pen                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `black_goat_pen` — one household's goats, and not a farm's herd.
 *
 * Bare `pen`, `pig_pen`, `sheep_pen`, `cattle_pen`, `paddock` and `corral` all
 * stay the founding table's and the agrarian expansion's, and the steppe pack's
 * `winter_corral` keeps `winter_pen` and `stock_shelter`. This one is two or
 * three animals in a shed behind a hut: **hurdles** down one wall with the
 * **troughs** in the bays, the **fodder** up on a plinth down the other so it
 * never sits on wet ground, the **muck** at the head and nothing whatever in
 * the middle.
 */
function fitBlackGoatPen(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The hurdles and the troughs, in bays so the run is not a second wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    const step = (z - it.z0) % 3;
    if (step === 1) c.put1(it.x0, z, fence, POST);
    else if (step === 2) c.put1(it.x0, z, "cauldron");
  }

  // The plinth and the fodder down the other: hay never on wet ground.
  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "hay_block", { axis: "y" });
    }
  }

  // The muck at the head — the must-have — and the shelf beside it, in bays.
  standInRow(ctx, c, headZ, midXOf(it), "composter", { level: "0" });
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
}

/* -------------------------------------------------------------------------- */
/* the fortune teller                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `fortune_tellers_tent` — the reader at the edge of the village.
 *
 * Bare `tent` is the blitz pack's prop and bare `circus_tent` is the leisure
 * wave's, both of which are the better answer for a document that writes them.
 * This one is a room with one piece of furniture in it and that piece is the
 * whole building: the **table** at the head with a **seat either side**, a
 * **cold candle** standing on it, and the **charms** hung well overhead on both
 * walls.
 *
 * The stair-seat rule, obeyed as everywhere else: a stair's `facing` is the
 * direction of its high half, so a sitter looking at the table has the
 * backrest behind him and the stair faces *away* from it.
 */
function fitFortuneTellersTent(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const seat = style["stair.interior"] as string;
  const headZ = headRow(ctx);
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  // The backrest goes away from the table, so the sitter looks at it.
  const back: Cardinal = headZ === it.z0 ? "south" : "north";

  // The table — the must-have — and the cold candle on it.
  const bay = bayOn(ctx, headZ, 0) ?? midXOf(it);
  if (c.put1(bay, headZ, slab, SLAB)) c.stack(bay, headZ, 2, "white_candle", CANDLE);
  else standInRow(ctx, c, headZ, midXOf(it), slab, SLAB);

  // The two seats, on the row in front of the table.
  if (front >= it.z0 && front <= it.z1) {
    for (const x of [bay - 1, bay + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, front, seat, { facing: back, half: "bottom", shape: "straight" });
    }
  }

  // The charms, hung well overhead on both walls.
  railOn(ctx, c, it.x0, BARS_Z);
  railOn(ctx, c, it.x1, BARS_Z);

  // The carpet, which is passable and so costs the floor nothing.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x0, z, "purple_carpet");
  }
}

/* -------------------------------------------------------------------------- */
/* the root cellar                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `mangrove_root_cellar` — the store dug in among the roots.
 *
 * Bare `root_cellar` and `root_cellar_mound` stay the underground grammar's
 * basement style and the homestead's mound, and rightly: those are a *hole* and
 * a *heap*, and this is a room. What makes it a mangrove cellar is overhead —
 * the **root ribs**, runs of the theme's own log laid along x at the top of the
 * storey, so the ceiling reads as a mat of roots the store was cut in under.
 *
 * The ribs skip any cell the shell already wrote at that course: the hanging
 * lantern lives up there, and a rib laid through it is `unsupported.lantern` on
 * somebody's walk. **No `mud` and no `muddy_mangrove_roots`** — this is the
 * building in the whole catalog most likely to want them and it is the building
 * that most must not.
 */
function fitMangroveRootCellar(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const log = style["wall.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The root ribs, at the top of the storey, in bays.
  if (head >= 3) {
    for (let z = it.z0; z <= it.z1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      for (let x = it.x0; x <= it.x1; x++) {
        if (ctx.blockAt(x, head, z) !== undefined) continue;
        c.stack(x, z, head, log, { axis: "x" });
      }
    }
  }

  // The shelves down both walls, in bays, with the crocks standing on them.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, slab, SLAB);
    }
  }

  // The stores at the head — the must-have — and the crocks by the way in.
  standInRow(ctx, c, headZ, midXOf(it), "barrel", BARREL);
  c.put1(it.x0, doorEnd, "composter", { level: "0" });
}
