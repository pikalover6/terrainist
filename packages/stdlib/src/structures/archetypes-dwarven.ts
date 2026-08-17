/**
 * The **Dwarven & Volcanic pack's buildings** — the fifteen entries of that
 * pack, every one of which has an inside.
 *
 * ## The thesis
 *
 * "A dwarven hold", "a hold under the volcano", "a forge city in the black
 * rock" all route to `medieval` or `ancient` and arrive as a stone village
 * with a smithy in it. The palette was never the problem — `white_quartz` and
 * the stone themes have been here since the founding waves — the missing
 * thing is the **noun set**: an underground hold is a great forge with the
 * furnace pit down its middle, a monumental gate face cut into the mountain, a
 * pillared deep hall, a smelter, a gem cuttery, a stone brewhouse, a miners'
 * dormitory, a tool vault, a rune forge, a cart depot with the rails still in
 * the floor, an assay hall, a hot-stone bath, a signal brazier tower, a king's
 * treasury behind bars and a worked cavern shrine. The catalog could say none
 * of those, and a cottage in blackstone is a cottage.
 *
 * The fifteen:
 *
 * - `great_forge` — the anchor: the furnace pit running the length of the
 *   axis, the anvil rank against the working wall, the chimney breast at the
 *   head;
 * - `dwarf_hold_gate` — the monumental doorway face: paired pillars, the
 *   lintel course carried across them, braziers at their feet. The id carries
 *   the hold because `dwarven_gate` is the **arcana wave's** fantasy gate and
 *   keeps every plain spelling of the word (see below);
 * - `deep_hall` — the pillared hall: pillar pairs down both sides of a clear
 *   central aisle, with the vault springing off them as stair courses;
 * - `smelter_works` — the furnace bank, the ore bins and the slag barrels;
 * - `gem_cutter_workshop` — cutting benches against the light, the rough on
 *   the plinth and the polished stone at the head;
 * - `stone_brewhouse` — the dwarven brewery: the kettle rank on its stone
 *   stalls and the barrel racks down the cold wall;
 * - `miners_dormitory` — slab bunks in bays down both walls, the lamp niche
 *   between each pair and the kit barrels at the door;
 * - `tool_vault` — the barred tool racks up under the boards, the strongbox
 *   at the head and the issue bench under the racks;
 * - `rune_forge_shrine` — the rune anvil on its stone altar with the glow
 *   bedded behind it and the unlit candle ring round the walls;
 * - `cart_depot` — the minecart staging floor: rails run down the axis in a
 *   broken line with buffer blocks at the ends, spare wheels and grease
 *   barrels against the walls;
 * - `ore_assay_hall` — sample slabs ranked down both walls, the cutting and
 *   weighing stations at the head, the ledger table across it;
 * - `stone_bath_house` — the hot-stone bath: heated benches round the walls, a
 *   water cauldron beside each and the hot stones bedded at the head. **No
 *   standing water is written**: a water cell is not a walkable floor, and a
 *   bath house a body cannot cross is a pool;
 * - `beacon_brazier_tower` — the signal floor: a fence rail at intervals round
 *   the edge, the brazier bedded in stone at the head, the fuel in the corner;
 * - `kings_treasury` — the barred vault face across the head with the bullion
 *   ranked on plinths down both walls behind it;
 * - `stalactite_shrine` — the worked cavern shrine: dripstone hanging from the
 *   boards along both walls, the calcite altar at the head and amethyst set
 *   into the plinth. **Interior fit-out only** — this file carves no cave.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it, and — like `archetypes-norse.ts`, which is this file's nearest
 * model — it does **no exterior work at all**: never above the eave plate,
 * never into the wall ring, never into the apron.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Everything goes through {@link PropCounter}**, which routes through the
 *    ground floor's own `free` and `take` — the door approach, the stair
 *    columns, the connectivity guard and the blocked-column guard, none of
 *    them restated here. There is not one `raw` call in this file.
 * 2. **Everything stands against a wall and the middle stays walkable.** The
 *    forge pit, the pillar ranks and the cart rails each leave the room one
 *    walkable region on every envelope the solver can hand it.
 * 3. **Nothing is a pillar.** A stack filling an interior column floor to
 *    ceiling is `interior.blocked_column`, so every pillar here is written
 *    with {@link headroomOf} in hand and capped a course short.
 * 4. **No lava, anywhere, ever.** This is the volcanic pack and that is
 *    precisely why: lava beside a walkable column is a body on fire and lava
 *    beside timber is a settlement on fire. Every glow here is `glowstone` or
 *    `shroomlight` — full cubes bedded against full cubes, with no support
 *    rule to fail — and every furnace is written `lit: "false"`. No
 *    `magma_block` either: it damages a body standing on it.
 * 5. **No lantern by name, no lit fire, no sign block**, no bare `flower_pot`,
 *    and `cauldron` takes no properties. **`chain` is not in the pinned
 *    1.21.11 table**: every hanging line here is `iron_bars`.
 * 6. **No `mud`, and no gravity block on a floor.** Fifteen sixteenths of a
 *    cube is a floor a body cannot stand on, and gravel on a floor is a hole
 *    waiting for a neighbour to be broken.
 * 7. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same hold
 *    forever.
 */

import { PropCounter, type FitOutContext } from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The fifteen archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` and mirrored in the
 * same order by the spec package's `KNOWN_BUILDING_ARCHETYPES` — where the
 * order is asserted element by element, so it is load-bearing in both places.
 */
export const DWARVEN_BUILDING_ARCHETYPES = [
  "great_forge",
  "dwarf_hold_gate",
  "deep_hall",
  "smelter_works",
  "gem_cutter_workshop",
  "stone_brewhouse",
  "miners_dormitory",
  "tool_vault",
  "rune_forge_shrine",
  "cart_depot",
  "ore_assay_hall",
  "stone_bath_house",
  "beacon_brazier_tower",
  "kings_treasury",
  "stalactite_shrine",
] as const;

/** One of the archetypes this file fits out. */
export type DwarvenBuildingArchetype = (typeof DWARVEN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isDwarvenArchetype(value: string): value is DwarvenBuildingArchetype {
  return (DWARVEN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted with the other late packs, immediately after the Nile table, and
 * for the same reason: the tables below are greedy. The **non-claims** are the
 * load-bearing half of this comment, because a hold's vocabulary is made
 * almost entirely of words older tables already own and own correctly:
 *
 * - **bare `forge`, `smithy` and `foundry` are NOT ours** — the founding
 *   table's and the industry wave's, and both are right. The great forge
 *   answers to `great_forge`, `forge_pit` and `deep_forge` only;
 * - **bare `dwarven_gate`, `dwarven` and `deep_gate` are NOT ours.** All three
 *   belong to the **arcana wave's** `dwarven_gate`, which has been in the
 *   catalog since that wave and is a perfectly good door face. This pack's
 *   gate is the hold's own, answers to `dwarf_hold_gate`, `hold_gate` and
 *   `under_gate`, and the arcana gate is not shipped twice;
 * - **bare `hall`, `great_hall`, `guildhall` and `keep` are not ours** — the
 *   original table's. The pillared hall answers to `deep_hall`,
 *   `pillared_hall` and `mine_hall`;
 * - **bare `smelter`, `furnace`, `kiln` and `foundry` are not ours**; the
 *   smelter answers to `smelter_works` and `ore_smelter`;
 * - **bare `workshop`, `jeweller` and `lapidary` are not ours** — the first is
 *   the founding table's. The cuttery answers to `gem_cutter_workshop`,
 *   `gem_cuttery` and `gem_cutter`;
 * - **bare `brewery`, `brewhouse` and `alehouse` are not ours** — the commerce
 *   wave's. The dwarven brewery answers to `stone_brewhouse`,
 *   `dwarf_brewhouse` and `deep_brewery`;
 * - **bare `dormitory`, `barracks` and `bunkhouse` are not ours** — the
 *   institution, garrison and frontier waves'. The miners' quarters answer to
 *   `miners_dormitory` and `miner_barracks`;
 * - **bare `vault`, `armoury` and `storehouse` are not ours**; the tool vault
 *   answers to `tool_vault` and `toolhouse`;
 * - **bare `shrine`, `temple` and `chapel` are not ours**, exactly as the
 *   sanctum, Nile, East Asian and Norse packs each recorded: they mean church
 *   in the extended table and stay there. The rune forge answers to
 *   `rune_forge_shrine` and `rune_forge`; the cavern shrine to
 *   `stalactite_shrine` and `cavern_shrine`;
 * - **bare `depot`, `station` and `yard` are not ours** — the terminus wave's.
 *   The staging floor answers to `cart_depot` and `minecart_depot`;
 * - **bare `assay_office` is not ours** — the frontier wave's, word for word.
 *   The hold's assay answers to `ore_assay_hall` and `ore_assay`;
 * - **bare `bathhouse`, `baths` and `bath` are not ours** — the leisure wave's
 *   bathhouse and the Mesoamerican pack's temazcal. The hot-stone bath answers
 *   to `stone_bath_house` and `hot_spring_bath`;
 * - **bare `beacon_tower`, `beacon_spire`, `watchtower` and `lookout` are not
 *   ours** — the first two are their own archetypes and the last two are
 *   claimed above every table in this file. The signal floor answers to
 *   `beacon_brazier_tower` and `brazier_tower`;
 * - **bare `treasury` and `sanctuary_treasury` are not ours**; the hold's
 *   answers to `kings_treasury` and `deep_treasury`.
 *
 * Every claim below is therefore a compound of this pack's own ids, and not
 * one bare word changes hands.
 */
export function dwarvenArchetypeOfTags(tags: readonly string[]): DwarvenBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("great_forge") || has("forge_pit") || has("deep_forge")) return "great_forge";
  if (has("dwarf_hold_gate") || has("hold_gate") || has("under_gate")) return "dwarf_hold_gate";
  if (has("deep_hall") || has("pillared_hall") || has("mine_hall")) return "deep_hall";
  if (has("smelter_works") || has("ore_smelter")) return "smelter_works";
  if (has("gem_cutter_workshop") || has("gem_cuttery") || has("gem_cutter")) {
    return "gem_cutter_workshop";
  }
  if (has("stone_brewhouse") || has("dwarf_brewhouse") || has("deep_brewery")) {
    return "stone_brewhouse";
  }
  if (has("miners_dormitory") || has("miner_barracks")) return "miners_dormitory";
  if (has("tool_vault") || has("toolhouse")) return "tool_vault";
  if (has("rune_forge_shrine") || has("rune_forge")) return "rune_forge_shrine";
  if (has("cart_depot") || has("minecart_depot")) return "cart_depot";
  if (has("ore_assay_hall") || has("ore_assay")) return "ore_assay_hall";
  if (has("stone_bath_house") || has("hot_spring_bath")) return "stone_bath_house";
  if (has("beacon_brazier_tower") || has("brazier_tower")) return "beacon_brazier_tower";
  if (has("kings_treasury") || has("deep_treasury")) return "kings_treasury";
  if (has("stalactite_shrine") || has("cavern_shrine")) return "stalactite_shrine";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * The pack's exterior argument is **`flat`**, and it is the argument of a
 * culture that builds into rock rather than under weather: thirteen of the
 * fifteen take the flat top, which is also the shape that leaves the deepest
 * gap between the eave plate and the height allowance for the chimney breasts
 * and pillar ranks inside. The two exceptions are the **great forge** and the
 * **smelter works**, which take `gable` because a furnace hall wants a ridge
 * over the flue.
 *
 * The window rhythms carry the rest: nine are **`none`** — a hold's wall has
 * doorways, not windows, and `none` is the grammar's precise word for "the
 * only opening is the door the shell always hangs" — while the halls, the
 * cuttery (which needs the light), the brewhouse, the dormitory and the assay
 * are `sparse` or `regular`.
 */
export function dwarvenFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "great_forge":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "dwarf_hold_gate":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "deep_hall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "smelter_works":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "gem_cutter_workshop":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "stone_brewhouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "miners_dormitory":
      return { windowShape: "single", windowRhythm: "regular", roof: "flat" };
    case "tool_vault":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "rune_forge_shrine":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "cart_depot":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "ore_assay_hall":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "flat" };
    case "stone_bath_house":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "beacon_brazier_tower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "kings_treasury":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "stalactite_shrine":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
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
export function furnishDwarven(ctx: FitOutContext): number {
  if (!isDwarvenArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "great_forge":
      fitGreatForge(ctx, c);
      break;
    case "dwarf_hold_gate":
      fitHoldGate(ctx, c);
      break;
    case "deep_hall":
      fitDeepHall(ctx, c);
      break;
    case "smelter_works":
      fitSmelterWorks(ctx, c);
      break;
    case "gem_cutter_workshop":
      fitGemCutter(ctx, c);
      break;
    case "stone_brewhouse":
      fitStoneBrewhouse(ctx, c);
      break;
    case "miners_dormitory":
      fitMinersDormitory(ctx, c);
      break;
    case "tool_vault":
      fitToolVault(ctx, c);
      break;
    case "rune_forge_shrine":
      fitRuneForge(ctx, c);
      break;
    case "cart_depot":
      fitCartDepot(ctx, c);
      break;
    case "ore_assay_hall":
      fitOreAssayHall(ctx, c);
      break;
    case "stone_bath_house":
      fitStoneBathHouse(ctx, c);
      break;
    case "beacon_brazier_tower":
      fitBeaconTower(ctx, c);
      break;
    case "kings_treasury":
      fitKingsTreasury(ctx, c);
      break;
    case "stalactite_shrine":
    default:
      fitStalactiteShrine(ctx, c);
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
 * the boards over it. Wave 3B's number, restated here rather than imported for
 * the reason every pack restates it: two packs are two seams, and a shared
 * private helper is a shared edit.
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

/** A closed barrel, the one cargo block every wave here uses. */
const BARREL = { facing: "up", open: "false" } as const;

/** A bottom slab — the bench top, the shelf and the plinth of this whole file. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a rack, a grille, a hanging line. */
const BARS_Z = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
} as const;

/** A run of bars along x — the vault face across the head of a room. */
const BARS_X = {
  east: "true",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "true",
} as const;

/** A cold furnace. Never `lit`, per rule 4. */
const COLD = { lit: "false" } as const;

/**
 * The wall a cell is nearest, as a stair `facing` that puts the **backrest**
 * against it.
 *
 * The stair-seat rule, obeyed everywhere in this file: a stair's `facing` is
 * the direction of its high half, so a bench against the north wall faces
 * north and the sitter looks south, into the room.
 */
function seatFacing(
  it: FitOutContext["interior"],
  x: number,
  z: number,
): "north" | "south" | "east" | "west" {
  if (z === it.z0) return "north";
  if (z === it.z1) return "south";
  if (x === it.x0) return "west";
  return "east";
}

/** The wall row furthest from the door — the head of a hall. */
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
 * A **hewn pillar** — the pack's vertical accent, capped short of the ceiling.
 *
 * Rule 3 as one function: a stack that reaches the boards is
 * `interior.blocked_column` however handsome it is, so a pillar here is
 * written to `headroomOf(ctx) - 1` and never further. Two courses is the floor
 * — a pillar shorter than a body does not read as a pillar — so on a storey
 * with no room for one nothing is written and the caller carries on.
 *
 * Returns whether it stood, because a caller ranking a pair wants to know.
 */
function hewnPillar(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  block: string,
): boolean {
  const head = headroomOf(ctx);
  if (head < 3) return false;
  if (!c.put1(x, z, block)) return false;
  for (let y = 2; y <= head - 1; y++) c.stack(x, z, y, block);
  return true;
}

/**
 * Stand one block somewhere on a row, starting at `preferX` and walking
 * outward until a cell **takes** it.
 *
 * `free` and `put1` are different questions — a cell can be unreserved and
 * still be refused by the walkability guard or the blocked-column guard — so a
 * one-off prop that matters (the anvil, the fuel, the strongbox) asks for the
 * first cell that *accepts* it rather than for the first cell that looks
 * empty. The scan is symmetric and deterministic, so the answer is the same
 * forever. Returns whether anything stood.
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

/**
 * **A brazier**: the glow bedded, with solid neighbours and a cap over it.
 *
 * The pack's one recurring light, and the reason there is no lava in a
 * volcanic pack. `glowstone` is a full cube against full cubes: there is no
 * support rule for it to fail, no fire for the lint to find, and nothing for a
 * body to burn on. Returns whether the glow itself landed.
 */
function brazier(ctx: FitOutContext, c: PropCounter, x: number, z: number, stone: string): boolean {
  const it = ctx.interior;
  const head = headroomOf(ctx);
  const lit = c.put1(x, z, "glowstone");
  if (lit && head >= 3) c.stack(x, z, 2, stone);
  for (const nx of [x - 1, x + 1]) {
    if (nx < it.x0 || nx > it.x1) continue;
    c.put1(nx, z, stone);
  }
  return lit;
}

/**
 * The **furnace pit** down a hall's axis, and the pack's signature shape.
 *
 * A hold's forge is organised round a trench of fire running the *length* of
 * the room, not a hearth in a wall. It is written as a run of dressed dark
 * stone on the middle column with the glow bedded at intervals along it —
 * never `campfire`, never `lava`, never anything whose name ends `lantern`.
 *
 * The run is deliberately **broken at both ends and gapped along its length**:
 * the room stays one walkable region however tight the envelope, because a
 * body can pass round the pit at either end and across it in the gaps. Every
 * cell goes through `put1`, so the walkability guard can refuse any one of
 * them outright and the forge is still a forge.
 */
function furnacePit(ctx: FitOutContext, c: PropCounter, stone: string, glow: string): void {
  const it = ctx.interior;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const from = it.z0 + 1;
  const to = it.z1 - 1;
  if (to < from) return;
  const glowAt = Math.floor((from + to) / 2);
  for (let z = from; z <= to; z++) {
    if ((z - from) % 2 === 1) continue; // the gaps that keep it a pit, not a wall
    c.put1(midX, z, z === glowAt ? glow : stone);
  }
}

/* -------------------------------------------------------------------------- */
/* the great forge                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `great_forge` — the anchor of the pack, and the only building in it a
 * stranger will name out loud.
 *
 * Three things and nothing else: the **furnace pit** down the axis, the
 * **anvil rank** against the working wall with the smithing tables between the
 * anvils, and the **chimney breast** at the head — a course of dressed stone
 * with the glow bedded in it and the breast carried one course over, so the
 * glow has a solid block above it and one either side.
 *
 * The charcoal stands at the door end, which is where it is delivered.
 */
function fitGreatForge(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const headZ = headRow(ctx);

  furnacePit(ctx, c, "blackstone", "glowstone");

  // The anvil rank down the working wall, tables in the bays between.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    const step = (z - it.z0) % 3;
    if (step === 1) c.put1(it.x0, z, "anvil", { facing: "north" });
    else if (step === 2) c.put1(it.x0, z, "smithing_table");
  }

  // The bellows and quench line down the other wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    if ((z - it.z0) % 2 === 1) c.put1(it.x1, z, "cauldron");
    else c.put1(it.x1, z, "barrel", BARREL);
  }

  // The chimney breast at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) brazier(ctx, c, bay, headZ, stone);

  // The charcoal, at the door end where the carts leave it.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  standInRow(ctx, c, doorEnd, it.x1, "coal_block");
}

/* -------------------------------------------------------------------------- */
/* the hold gate                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `dwarf_hold_gate` — the door face *is* the building.
 *
 * **On the name.** The obvious id is `dwarven_gate`, and it is taken: the
 * arcana wave ships exactly that under exactly that word, and a form pack's
 * members must be unique across the whole registry. So the id carries the hold
 * (`dwarf_hold_gate`), and the words stay where they were — bare
 * `dwarven_gate`, `dwarven` and `deep_gate` all still reach the arcana gate,
 * and this one answers to `dwarf_hold_gate`, `hold_gate` and `under_gate`.
 *
 * **On the building.** Two great **pillars** flanking the head of the room
 * with the **lintel course** carried across between their heads, the **rune
 * band** of chiselled stone at the foot of each, and a **brazier** burning at
 * the middle of the lintel's span. The middle of the floor is otherwise
 * completely clear: a gate is a thing a body walks through.
 */
function fitHoldGate(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  const bay = bayOn(ctx, headZ, 2);
  if (bay !== null) {
    hewnPillar(ctx, c, bay - 2, headZ, "polished_blackstone");
    hewnPillar(ctx, c, bay + 2, headZ, "polished_blackstone");
    // The lintel, carried across between the pillar heads.
    if (head >= 4) {
      for (let x = bay - 2; x <= bay + 2; x++) c.stack(x, headZ, head - 1, stone);
    }
    // The brazier under the middle of the span.
    brazier(ctx, c, bay, headZ, stone);
  } else {
    const lone = bayOn(ctx, headZ, 0);
    if (lone !== null) hewnPillar(ctx, c, lone, headZ, "polished_blackstone");
  }

  // The rune band: chiselled stone along the foot of both side walls, in bays
  // so the run is never a second wall.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      c.put1(x, z, "chiseled_polished_blackstone");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the deep hall                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `deep_hall` — the pillared hall, and the room the whole hold is arranged
 * around.
 *
 * **Pillar pairs** stand one cell in from each side wall in bays down the
 * length of the room, with the **vault** springing off each pair as a stair
 * course turned back toward the wall. The **central aisle is never touched**:
 * the pillars go in at every third row, which leaves both the aisle and the
 * wall rows continuous, and on an envelope too narrow to hold a pillar off the
 * wall (fewer than five cells across) they are written against the wall
 * instead, where they cannot cut anything.
 *
 * The **glow** is bedded into the pillar heads rather than hung, and the
 * **long table** of slabs runs across the head of the hall.
 */
function fitDeepHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const stair = style["stone.stairs"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const wide = it.x1 - it.x0 >= 4;
  const leftX = wide ? it.x0 + 1 : it.x0;
  const rightX = wide ? it.x1 - 1 : it.x1;

  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    if (z === headZ) continue;
    for (const x of [leftX, rightX]) {
      if (!hewnPillar(ctx, c, x, z, "polished_blackstone")) continue;
      // The vault springing off the pillar head, turned back toward the wall.
      if (head >= 4) {
        c.stack(x, z, head - 1, stair, {
          facing: x === leftX ? "east" : "west",
          half: "top",
          shape: "straight",
          waterlogged: "false",
        });
      }
      // The glow bedded into the pillar, at eye height.
      if (head >= 5) c.stack(x, z, 3, "shroomlight");
    }
  }

  // The long table across the head, in bays so it is not a wall of slab.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
}

/* -------------------------------------------------------------------------- */
/* the smelter                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `smelter_works` — the furnace bank, and the least decorated room here.
 *
 * A **bank of blast furnaces** stands along the head wall, every one of them
 * `lit: "false"` (rule 4: a lit furnace is a fire, and this pack has an
 * argument to keep). The **ore bins** are barrels down one wall, the **slag**
 * is a coal block in the corner furthest from the bank, and the **tapping
 * floor** in front of the furnaces stays completely clear.
 */
function fitSmelterWorks(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const headZ = headRow(ctx);
  const look = headZ === it.z0 ? "south" : "north";

  // The furnace bank across the head, alternating with dressed stone piers.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) c.put1(x, headZ, stone);
    else c.put1(x, headZ, "blast_furnace", { facing: look, ...COLD });
  }

  // The ore bins down one wall, stacked two high on the wall run.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 === 1) continue;
    if (c.put1(it.x0, z, "barrel", BARREL) && headroomOf(ctx) >= 3) {
      c.stack(it.x0, z, 2, "barrel", BARREL);
    }
  }

  // The charge stone down the other, and the slag in the far corner.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x1, z, "blackstone");
  }
  const far = headZ === it.z0 ? it.z1 : it.z0;
  standInRow(ctx, c, far, it.x1, "coal_block");
}

/* -------------------------------------------------------------------------- */
/* the gem cuttery                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `gem_cutter_workshop` — cutting benches against the light.
 *
 * The one room in the pack that wants **windows**, and
 * {@link dwarvenFacadeDefaults} gives it a regular rhythm for exactly that
 * reason: a cutter works at the wall, in the light. So the **benches** are
 * slabs down both side walls with a **grindstone** standing at every third
 * bay, the **rough** is stacked on the bench and the **polished stone** — a
 * course of amethyst — is set into the head where the finished work is laid
 * out.
 */
function fitGemCutter(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      const step = (z - it.z0) % 3;
      if (step === 0) continue; // the gap a cutter stands in
      if (step === 1) {
        c.put1(x, z, "grindstone", { face: "floor", facing: x === it.x0 ? "east" : "west" });
        continue;
      }
      if (c.put1(x, z, slab, SLAB) && head >= 3) c.stack(x, z, 2, "amethyst_block");
    }
  }

  // The laying-out table across the head, in bays.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, "amethyst_block");
}

/* -------------------------------------------------------------------------- */
/* the brewhouse                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `stone_brewhouse` — the dwarven brewery, and the warmest room in the hold.
 *
 * A **kettle rank** across the head: cauldrons standing on the stone stalls
 * with the glow bedded between them, because a brewhouse is heated from below
 * and a cauldron over a bedded glow is the honest way to say so without
 * lighting a fire. The **barrel racks** are down the cold wall, stacked two
 * high on the wall run, and the **mash tuns** are cauldrons in the bays down
 * the other.
 */
function fitStoneBrewhouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The kettle rank across the head: stall, cauldron, stall, glow.
  for (let x = it.x0; x <= it.x1; x++) {
    const step = (x - it.x0) % 4;
    if (step === 0) c.put1(x, headZ, "cauldron");
    else if (step === 2) c.put1(x, headZ, "glowstone");
    else c.put1(x, headZ, stone);
  }

  // The barrel racks down the cold wall, two high.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    if (c.put1(it.x0, z, "barrel", BARREL) && head >= 3) c.stack(it.x0, z, 2, "barrel", BARREL);
  }

  // The mash tuns down the other.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x1, z, "cauldron");
  }
}

/* -------------------------------------------------------------------------- */
/* the miners' dormitory                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `miners_dormitory` — bunks in bays, and nothing in the middle of the floor.
 *
 * The **bunks** are slabs down both side walls in bays of two, written as
 * **slabs and not as `bed`s** for the reason the Norse cabin recorded: a bed
 * is a two-cell block whose halves must agree, and `put1` may legally refuse
 * either one of them — a head with no foot is a broken block, not a sparser
 * room. A run of bottom slabs is a bunk a body can also stand on.
 *
 * Between each pair of bunks sits a **lamp niche** — the glow bedded in the
 * wall run at eye height, over the slab, so it has solid below and solid
 * either side. The **kit barrels** stand at the door end.
 */
function fitMinersDormitory(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const step = (z - it.z0) % 3;
      if (step === 2) continue; // the gap a body steps into
      if (!c.put1(x, z, slab, SLAB)) continue;
      if (step === 1 && head >= 3) c.stack(x, z, 2, "shroomlight");
    }
  }

  // The washing trough and the kit at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) {
    c.put1(bay, headZ, "cauldron");
    if (bay + 1 <= it.x1) c.put1(bay + 1, headZ, "barrel", BARREL);
  }
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the tool vault                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `tool_vault` — where a hold keeps the picks between shifts.
 *
 * The **racks** are runs of `iron_bars` up under the boards on both side walls
 * — bars, not `chain`, and at head height so the floor beneath keeps its two
 * courses of air. Under them the **issue bench** of slabs, at the head the
 * **strongbox** of iron on a plinth, and in the corner the spare stock.
 */
function fitToolVault(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  if (head >= 3) {
    for (const x of [it.x0, it.x1]) {
      for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(x, z, head, "iron_bars", BARS_Z);
    }
  }

  // The issue bench under the racks, one wall only, in bays.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x0, z, slab, SLAB);
  }

  // The strongbox at the head, on its plinth.
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null && c.put1(bay, headZ, slab, SLAB) && head >= 3) {
    c.stack(bay, headZ, 2, "iron_block");
  }

  // The spare stock, at the door end of the other wall.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the rune forge                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `rune_forge_shrine` — the one building in the pack with a rite in it.
 *
 * The **rune anvil** stands on a stone altar at the head with the **glow
 * bedded behind it** in the wall run, and the **rune band** of chiselled
 * blackstone runs the two rows either side of it. Round the walls the
 * **offering ring** of unlit candles, which are lightless by design because
 * a lit anything is a fire the lint has opinions about — and because the
 * room's one real light is the shell's, which this file never touches.
 */
function fitRuneForge(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const headZ = headRow(ctx);
  const look = headZ === it.z0 ? "north" : "south";

  // The altar across the head: chiselled band, glow at the middle.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, "chiseled_polished_blackstone");
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) brazier(ctx, c, bay, headZ, stone);

  // The rune anvil, a pace out into the room where a smith stands at it.
  //
  // Scanned outward from the middle and placed at the **first cell that takes
  // it**, rather than at the one free cell nearest the middle: `free` and
  // `put1` are different questions — a cell can be unreserved and still be
  // refused by the walkability guard or the blocked-column guard — and an
  // anvil is the one prop in this room whose absence would be noticed.
  const front = headZ === it.z0 ? headZ + 1 : headZ - 1;
  if (front >= it.z0 && front <= it.z1) {
    const midX = Math.floor((it.x0 + it.x1) / 2);
    standInRow(ctx, c, front, midX, "anvil", { facing: look });
  }

  // The offering ring: unlit candles down both walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      c.put1(x, z, "white_candle", {
        candles: `${1 + ((z - it.z0) % 3)}`,
        lit: "false",
        waterlogged: "false",
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the cart depot                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `cart_depot` — the minecart staging floor.
 *
 * The **rails** run down the axis of the floor. A rail is a *passable*
 * block — a body walks over it, exactly as it does over a carpet — which is
 * the only reason a line of them down the middle of a room is legal at all;
 * a solid line there would be a wall, and a depot a body cannot cross is a
 * siding. The run is broken at both ends with a **buffer block** of dressed
 * blackstone standing clear of it, and the **spare wheels and grease** are
 * barrels against the side walls.
 */
function fitCartDepot(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const midX = Math.floor((it.x0 + it.x1) / 2);

  // The running line.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    c.put1(midX, z, "rail", { shape: "north_south", waterlogged: "false" });
  }

  // The buffer at the head end of the line, clear of the rail itself.
  const stop = headZ === it.z0 ? it.z0 : it.z1;
  c.put1(midX, stop, "polished_blackstone");

  // The stores against both side walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      c.put1(x, z, "barrel", BARREL);
    }
  }

  // The hoist rack, up under the boards on one wall.
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(it.x0, z, head, "iron_bars", BARS_Z);
  }

  // The lamp, bedded at the head beside the buffer.
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, "shroomlight");
}

/* -------------------------------------------------------------------------- */
/* the assay hall                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `ore_assay_hall` — where the hold decides what a seam is worth.
 *
 * **On the name.** `assay_office` is the frontier wave's, word for word, and a
 * form pack's members must be unique registry-wide. So the id carries the ore
 * (`ore_assay_hall`) and every plain spelling stays with the frontier office.
 *
 * **On the building.** The **sample slabs** are ranked down both side walls
 * with the ore standing on them — a different block per bay, because a rank of
 * identical cubes reads as shelving rather than as samples — and the
 * **stations** at the head are a stonecutter for the sectioning and a
 * cartography table for the ledger.
 */
function fitOreAssayHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const SAMPLES = ["iron_block", "gold_block", "amethyst_block", "coal_block"] as const;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      if (!c.put1(x, z, slab, SLAB)) continue;
      if (head < 3) continue;
      const pick = SAMPLES[(z - it.z0 + (x === it.x0 ? 0 : 2)) % SAMPLES.length] as string;
      c.stack(x, z, 2, pick);
    }
  }

  // The stations across the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) {
    c.put1(bay, headZ, "stonecutter", { facing: headZ === it.z0 ? "south" : "north" });
    if (bay - 1 >= it.x0) c.put1(bay - 1, headZ, "cartography_table");
    if (bay + 1 <= it.x1) c.put1(bay + 1, headZ, slab, SLAB);
  }
}

/* -------------------------------------------------------------------------- */
/* the bath house                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `stone_bath_house` — the hot-stone bath, and the pack's one soft room.
 *
 * **No standing water is written anywhere in it**, and that is the whole
 * engineering note: a water cell is not a walkable floor, the freeCells rule
 * refuses it outright, and a bath house a body cannot cross is a pool. The
 * heat is said instead — the **benches** are stairs round the walls with their
 * backrest against them, the **water** is a cauldron at every third bay, and
 * the **hot stones** are bedded glow under a dressed cap at the head, exactly
 * as every brazier in this file is built.
 */
function fitStoneBathHouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const seat = style["stone.stairs"] as string;
  const headZ = headRow(ctx);

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const step = (z - it.z0) % 3;
      if (step === 2) continue; // the gap a bather steps through
      if (step === 1) {
        c.put1(x, z, "cauldron");
        continue;
      }
      c.put1(x, z, seat, {
        facing: seatFacing(it, x, z),
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
    }
  }

  // The hot stones at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) brazier(ctx, c, bay, headZ, stone);
}

/* -------------------------------------------------------------------------- */
/* the brazier tower                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `beacon_brazier_tower` — the signal floor over the hold's gate road.
 *
 * The tower's *shape* is the shell's and this file never argues with it. What
 * a signal floor needs is three things: the **rail** round the edge (fence
 * posts at intervals, never a solid run, because a solid run is a second wall
 * and a beacon watch has to see out), the **brazier** bedded in stone at the
 * head, and the **middle left completely clear** for the ladder well the shell
 * cuts. The fuel stands in the corner furthest from the fire, which is where a
 * watch actually keeps it.
 */
function fitBeaconTower(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const stone = style["foundation.accent"] as string;
  const headZ = headRow(ctx);

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      if (z === headZ) continue;
      c.put1(x, z, fence, POST);
    }
  }

  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) brazier(ctx, c, bay, headZ, stone);

  const far = headZ === it.z0 ? it.z1 : it.z0;
  standInRow(ctx, c, far, it.x1, "coal_block");
}

/* -------------------------------------------------------------------------- */
/* the treasury                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `kings_treasury` — the barred vault face, and the bullion behind it.
 *
 * The read is the **grille**: a run of `iron_bars` across the head of the room
 * at the floor course and again at eye height, so the head wall is *seen
 * through* rather than walked into. Behind — which is to say, down both side
 * walls — the **bullion** stands on slab plinths, gold on one side and iron on
 * the other, because a treasury that is all one metal reads as a warehouse.
 *
 * Every bar goes through `put1`, so the walkability guard can refuse any cell
 * of the grille outright and the vault is still a vault.
 */
function fitKingsTreasury(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The grille across the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if (!c.put1(x, headZ, "iron_bars", BARS_X)) continue;
    if (head >= 3) c.stack(x, headZ, 2, "iron_bars", BARS_X);
  }

  // The bullion on its plinths, down both side walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      if (!c.put1(x, z, slab, SLAB)) continue;
      if (head >= 3) c.stack(x, z, 2, x === it.x0 ? "gold_block" : "iron_block");
    }
  }

  // The tally barrels at the door end.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the cavern shrine                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `stalactite_shrine` — the worked cavern shrine.
 *
 * **This file carves no cave.** A cavern is the terrain's business and the
 * cave system's; what an archetype may do is fit out the room it was given so
 * that it *reads* as a worked cavern, and that is exactly what this does: the
 * **dripstone** hangs from the boards along both side walls (hanging, so it
 * touches the wall and nothing floats), the **calcite altar** stands across
 * the head with the glow bedded behind it, and the **amethyst** is set into
 * the plinth at the foot of each hanging.
 *
 * The middle of the floor stays entirely clear, which is what a shrine floor
 * is for.
 */
function fitStalactiteShrine(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The hangings: dripstone under the boards, and the plinth under each.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      if (head >= 4) {
        c.stack(x, z, head, "dripstone_block");
        c.stack(x, z, head - 1, "dripstone_block");
      }
      if (c.put1(x, z, slab, SLAB) && head >= 3) c.stack(x, z, 2, "amethyst_block");
    }
  }

  // The calcite altar across the head, in bays, with the glow bedded at it.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, "calcite");
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) brazier(ctx, c, bay, headZ, stone);
}
