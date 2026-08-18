/**
 * The **desert_caravanserai pack's buildings** — the thirteen entries of that
 * pack which have an inside rather than a footprint on the bare ground.
 *
 * ## The thesis
 *
 * "A Silk Road oasis", "a caravan town", "a desert serai" all route to the
 * `medieval` era and arrive as a European village in sandstone. The *palette*
 * was never the problem — `sun_clay` and the sandstone family have shipped
 * since the founding waves — the missing thing is the **noun set**. An oasis
 * town on a caravan road is a walled court with cells round it, a wellhead over
 * a qanat, a house with a wind tower on its head, a spice godown, camel lines,
 * an arcade of shaded stalls, a date store, a cistern, a dye yard, a
 * glassblower's kiln, a gatehouse wide enough for a loaded animal, a domed
 * shrine at the spring and a minaret somebody watches the road from. The
 * catalog could say none of those, and a Provençal cottage rendered in
 * sandstone is still a Provençal cottage.
 *
 * ## What this pack is NOT
 *
 * **It does not steal a word.** `caravanserai` itself is the *commerce* wave's,
 * word for word, and a member belongs to one pack only — so this pack's anchor
 * ships as `serai_court`, and every bare noun a desert town brushes against
 * (`cistern`, `granary`, `minaret`, `bazaar`, `souk`, `warehouse`, `kiln`,
 * `stable`, `gate`, `shrine`, `well`, `courtyard`) still goes exactly where it
 * went. The sweep that found `caravanserai` taken is the reason every id here
 * is a compound.
 *
 * The thirteen:
 *
 * - `serai_court` — the anchor: the arcaded court, columns down both walls with
 *   the traders' cells benched between them, and the court's own basin;
 * - `caravan_gatehouse` — one great arch bay, wide enough for a loaded animal,
 *   with the gatekeeper's bench beside it;
 * - `qanat_wellhead` — the underground channel brought to the surface: a curbed
 *   run of water down the room, and the draw rope on `iron_chain` over it;
 * - `windcatcher_house` — the badgir: the shaft columns at the head, the vent
 *   grilles at the top of the storey and the cool slab floor to sleep on;
 * - `spice_godown` — the sack ranks, banded in terracotta, on plinths off the
 *   floor;
 * - `camel_lines` — hurdles and troughs down one wall, fodder up on a plinth
 *   down the other;
 * - `shade_arcade_row` — the stall row under its awning: columns, and the
 *   awning slabs springing off them at head height;
 * - `date_store_tower` — the date store: bins on plinths and the press at the
 *   head;
 * - `serai_cistern` — the pack's largest water: one curbed basin at the middle
 *   of the floor with the drawing steps round it;
 * - `dye_yard` — the vats down both walls and the cloth drying over them, the
 *   loom at the head;
 * - `desert_glass_kiln` — the kiln at the head, the sand and the finished glass
 *   ranked down the walls;
 * - `oasis_shrine` — the pack's one piece of exterior work: the **mudbrick
 *   dome**, built as filled discs stepping in, over a ring of seats and the
 *   ablution basin;
 * - `watch_minaret` — the road watch: the open rail, the signal brazier and the
 *   stores, read off its storeys.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it.
 *
 * Twelve of the thirteen do **no exterior work at all**. The exception is the
 * **shrine's dome**, which is built the way the Mesoamerican pack's temazcal,
 * the steppe pack's ger and the Atlantean oracle are built and for the same
 * reason — **filled discs stepping in, each standing on the filled disc below
 * it**. A dome built as a ring per course is `floating.isolated` waiting to
 * happen, and a hollow one is a sealed pocket besides.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Every interior block goes through {@link PropCounter}**, which routes
 *    through the ground floor's own `free` and `take` — the door approach, the
 *    stair columns, the connectivity guard and the blocked-column guard, none
 *    of them restated here. `raw` appears only above the eave plate and in the
 *    floor plane a basin's rim is written in.
 * 2. **Every pool is curb-closed and stable.** The water goes **into the
 *    floor** at `y = 0`, in a rect inset at least one cell from the interior on
 *    every side, and every floor cell touching it is written solid. The cells
 *    are claimed through `take` **before a drop is written**, so a basin that
 *    would strand part of the room is refused outright rather than drowned.
 *    That is the Atlantean pack's argument and the swamp pack's, unchanged.
 * 3. **Nothing is a pillar.** A stack filling an interior column floor to
 *    ceiling is `interior.blocked_column`, which is why every column here is
 *    written with {@link headroomOf} in hand rather than at a fixed height.
 * 4. **`iron_chain`, never `chain`.** `chain` is not in the pinned 1.21.11
 *    block table; `iron_chain` is. The one chain in this file — the wellhead's
 *    draw rope — has the cap course directly above it, and **nothing hangs
 *    under it**: `attachment: ceiling` demands a FULL CUBE above, and a chain
 *    is not one. That is the tide-bell lesson, banked.
 * 5. **The glow is `glowstone`, bedded.** It is a full cube standing on the
 *    floor with solid neighbours either side, so neither the lantern rule nor
 *    `floating.isolated` has anything to say. No `campfire`, no fire, nothing
 *    written `lit: "true"` — the shell's own hearth is the room's fire, and a
 *    fit-out that lit a second one would be arguing with it.
 * 6. **No `mud`.** Mud is 15/16 of a block and a room floored in it is a room
 *    you can only look at. `mud_bricks` and `packed_mud` are full cubes and are
 *    what a mudbrick town is actually made of.
 * 7. **No sign blocks**, no bare `flower_pot`, no `farmland`, and no gravity
 *    block above the floor plane.
 * 8. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same town
 *    forever.
 */

import { PropCounter, ROOF_FLOURISH_RISE, type FitOutContext } from "./archetypes-civic.js";
import { cardinalStep, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The thirteen archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` **last**, and mirrored
 * in the same order and the same position by the spec package's
 * `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element by
 * element, so it is load-bearing in both places.
 */
export const CARAVAN_BUILDING_ARCHETYPES = [
  "serai_court",
  "caravan_gatehouse",
  "qanat_wellhead",
  "windcatcher_house",
  "spice_godown",
  "camel_lines",
  "shade_arcade_row",
  "date_store_tower",
  "serai_cistern",
  "dye_yard",
  "desert_glass_kiln",
  "oasis_shrine",
  "watch_minaret",
] as const;

/** One of the archetypes this file fits out. */
export type CaravanBuildingArchetype = (typeof CARAVAN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isCaravanArchetype(value: string): value is CaravanBuildingArchetype {
  return (CARAVAN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted with the other pack tables, above the greedy general tables. The
 * **non-claims** are the load-bearing half of this comment, because an oasis
 * vocabulary brushes up against a commerce wave that already speaks it:
 *
 * - **bare `caravanserai` and `khan` are NOT ours** — they are the commerce
 *   wave's `caravanserai`, word for word, and that is the collision that named
 *   this pack's anchor. Ours answers to `serai_court`, `serai` and
 *   `oasis_serai`;
 * - **bare `gate`, `gatehouse` and `arch` are not ours** — the city gate's and
 *   the triumphal arch's. Ours answers to `caravan_gatehouse`, `caravan_gate`
 *   and `serai_gate`;
 * - **bare `well`, `wellhead` and `water_tower` are not ours** — the utility
 *   wave's. Ours answers to `qanat_wellhead`, `qanat` and `qanat_head`,
 *   `qanat` being a word no table in the catalog has ever claimed;
 * - **bare `house`, `courtyard_house` and `tower_house` are not ours.** The
 *   wind tower answers to `windcatcher_house`, `windcatcher` and `badgir`;
 * - **bare `warehouse`, `store` and `spice_market` are not ours** — the
 *   founding table's warehouse and the commerce wave's souk. Ours answers to
 *   `spice_godown`, `godown` and `spice_warehouse`, `godown` being the
 *   trade-road word and unclaimed;
 * - **bare `stable`, `stables`, `paddock` and `corral` are not ours** — the
 *   founding table's and the agrarian expansion's. The camel yard answers to
 *   `camel_lines`, `camel_stable` and `camel_yard`, and `camel` is a word no
 *   table has ever had;
 * - **bare `bazaar`, `souk`, `market`, `arcade` and `stoa` are not ours** — the
 *   commerce and classical waves'. The stall row answers to
 *   `shade_arcade_row`, `shade_arcade` and `shade_bazaar_row`;
 * - **bare `granary` and `mudbrick_granary` are not ours** — the founding
 *   table's and the Nile pack's. The date store answers to `date_store_tower`,
 *   `date_store` and `date_granary`;
 * - **bare `cistern` and `reservoir` are not ours** — the utility wave's. Ours
 *   answers to `serai_cistern`, `sand_cistern` and `oasis_cistern`;
 * - **bare `dyeworks`, `tannery` and `workshop` are not ours.** The vats answer
 *   to `dye_yard`, `dyers_yard` and `indigo_yard`;
 * - **bare `kiln`, `glassworks` and `glassblower` are not ours** — the works
 *   wave's. Ours answers to `desert_glass_kiln`, `glass_kiln` and
 *   `sand_glass_kiln`;
 * - **bare `shrine`, `roadside_shrine` and `chapel` are not ours** — the faith
 *   and relic waves'. The spring shrine answers to `oasis_shrine`,
 *   `desert_shrine` and `oasis_chapel`, `oasis` being unclaimed;
 * - **bare `minaret`, `tower` and `watchtower` are not ours** — the faith
 *   wave's minaret and the founding watchtower. Ours answers to
 *   `watch_minaret` and `watchtower_minaret`.
 *
 * Every claim below is therefore either a compound of this pack's own ids or a
 * word (`serai`, `qanat`, `badgir`, `godown`, `camel`, `oasis`) that no table
 * in the catalog has ever claimed.
 */
export function caravanArchetypeOfTags(tags: readonly string[]): CaravanBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("serai_court") || has("serai") || has("oasis_serai")) return "serai_court";
  if (has("caravan_gatehouse") || has("caravan_gate") || has("serai_gate")) {
    return "caravan_gatehouse";
  }
  if (has("qanat_wellhead") || has("qanat") || has("qanat_head")) return "qanat_wellhead";
  if (has("windcatcher_house") || has("windcatcher") || has("badgir")) return "windcatcher_house";
  if (has("spice_godown") || has("godown") || has("spice_warehouse")) return "spice_godown";
  if (has("camel_lines") || has("camel_stable") || has("camel_yard")) return "camel_lines";
  if (has("shade_arcade_row") || has("shade_arcade") || has("shade_bazaar_row")) {
    return "shade_arcade_row";
  }
  if (has("date_store_tower") || has("date_store") || has("date_granary")) {
    return "date_store_tower";
  }
  if (has("serai_cistern") || has("sand_cistern") || has("oasis_cistern")) return "serai_cistern";
  if (has("dye_yard") || has("dyers_yard") || has("indigo_yard")) return "dye_yard";
  if (has("desert_glass_kiln") || has("glass_kiln") || has("sand_glass_kiln")) {
    return "desert_glass_kiln";
  }
  if (has("oasis_shrine") || has("desert_shrine") || has("oasis_chapel")) return "oasis_shrine";
  if (has("watch_minaret") || has("watchtower_minaret")) return "watch_minaret";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * Almost the whole pack takes **`flat`**, and that is the pack's exterior
 * argument in one word: a mudbrick oasis town roofs flat, because a flat roof
 * is a room you sleep on in the summer and rain is not the problem here. The
 * shrine takes **`hip`**, the shape that leaves the deepest gap between the
 * eave plate and the height allowance — and that gap is where the dome is
 * built.
 *
 * The window rhythms carry the rest. The court and the arcade are `regular` —
 * an arcaded building is mostly opening — the godown and the date store are
 * `none`, because a store keeps the sun out of the goods, and the working rooms
 * are `sparse`.
 */
export function caravanFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "serai_court":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "caravan_gatehouse":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "flat" };
    case "qanat_wellhead":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "windcatcher_house":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "flat" };
    case "spice_godown":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "camel_lines":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "flat" };
    case "shade_arcade_row":
      return { windowShape: "wide", windowRhythm: "regular", roof: "flat" };
    case "date_store_tower":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "serai_cistern":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "dye_yard":
      return { windowShape: "wide", windowRhythm: "regular", roof: "flat" };
    case "desert_glass_kiln":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "oasis_shrine":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "watch_minaret":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
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
export function furnishCaravan(ctx: FitOutContext): number {
  if (!isCaravanArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "serai_court":
      fitSeraiCourt(ctx, c);
      break;
    case "caravan_gatehouse":
      fitCaravanGatehouse(ctx, c);
      break;
    case "qanat_wellhead":
      fitQanatWellhead(ctx, c);
      break;
    case "windcatcher_house":
      fitWindcatcherHouse(ctx, c);
      break;
    case "spice_godown":
      fitSpiceGodown(ctx, c);
      break;
    case "camel_lines":
      fitCamelLines(ctx, c);
      break;
    case "shade_arcade_row":
      fitShadeArcadeRow(ctx, c);
      break;
    case "date_store_tower":
      fitDateStoreTower(ctx, c);
      break;
    case "serai_cistern":
      fitSeraiCistern(ctx, c);
      break;
    case "dye_yard":
      fitDyeYard(ctx, c);
      break;
    case "desert_glass_kiln":
      fitDesertGlassKiln(ctx, c);
      break;
    case "oasis_shrine":
      fitOasisShrine(ctx, c);
      break;
    case "watch_minaret":
    default:
      fitWatchMinaret(ctx, c);
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
 * second would put its awning through somebody's floor. Wave 3B's number,
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

/** A closed barrel — the pack's one cargo block. */
const BARREL = { facing: "up", open: "false" } as const;

/** A bottom slab: the bench top, the plinth and the kerb of this whole file. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a vent grille, a drying rod, a rack. */
const BARS_Z = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
} as const;

/** A run of bars along x. */
const BARS_X = {
  east: "true",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "true",
} as const;

/** A vertical link of `iron_chain` — the one hanger this pack uses. */
const CHAIN_Y = { axis: "y", waterlogged: "false" } as const;

/** A source block of water, sunk into the floor plane. */
const WATER = { level: "0" } as const;

/**
 * The wall a cell is nearest, as a stair `facing` that puts the **backrest**
 * against it.
 *
 * The stair-seat rule, obeyed everywhere in this file: a stair's `facing` is
 * the direction of its high half, so a bench against the north wall faces north
 * and the sitter looks south, into the room.
 */
function seatFacing(it: LocalRect, x: number, z: number): "north" | "south" | "east" | "west" {
  if (z === it.z0) return "north";
  if (z === it.z1) return "south";
  if (x === it.x0) return "west";
  return "east";
}

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
 * Stand one block somewhere in a row, preferring a cell and walking outward.
 *
 * The dwarven pack's law, banked and restated: a **single must-have** prop —
 * the loom, the kiln, the brazier — must not vanish because the one cell it
 * wanted was the door's. `free()` and `put1()` answer different questions, so
 * this asks `put1` itself, at every cell of the row, until one takes.
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
 * A **column** of dressed sandstone, capped short of the ceiling.
 *
 * Rule 3 as one function: a stack that reaches the boards is
 * `interior.blocked_column` however handsome it is, so a column here is written
 * to `headroomOf(ctx) - 1` and never further. Two courses is the floor — a
 * column shorter than a body does not read as a column at all — so on a storey
 * with no room for one, nothing is written and the caller carries on. Returns
 * whether it stood, and the height it reached is {@link columnTop}.
 */
function column(ctx: FitOutContext, c: PropCounter, x: number, z: number, block: string): boolean {
  const head = headroomOf(ctx);
  if (head < 3) return false;
  if (!c.put1(x, z, block, { axis: "y" })) return false;
  for (let y = 2; y <= head - 1; y++) c.stack(x, z, y, block, { axis: "y" });
  return true;
}

/** The top course a {@link column} reaches on this storey. */
function columnTop(ctx: FitOutContext): number {
  return headroomOf(ctx) - 1;
}

/**
 * The **lamp niche** — the pack's recurring wall ornament and its only glow.
 *
 * `glowstone` between two courses of `chiseled_sandstone`, all three at the
 * floor course against a wall. `glowstone` is a full cube standing on the
 * shell's own floor with a solid neighbour either side, so neither the lint's
 * lantern rule (its name does not end `lantern` in the first place) nor
 * `floating.isolated` has anything to say. Returns whether the glow landed.
 */
function lampNiche(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  const it = ctx.interior;
  const lit = c.put1(x, z, "glowstone");
  const along = z === it.z0 || z === it.z1;
  // The surround is tried **along the wall first and inward second**, and it
  // takes the first two cells that land rather than the two it wanted: on an
  // arcaded wall the cells either side of a niche are as often a column as
  // they are floor, and a niche whose surround silently vanished is a bare
  // glow cube stuck to a wall.
  const order: [number, number][] = along
    ? [
        [x - 1, z],
        [x + 1, z],
        [x, z - 1],
        [x, z + 1],
      ]
    : [
        [x, z - 1],
        [x, z + 1],
        [x - 1, z],
        [x + 1, z],
      ];
  let laid = 0;
  for (const [nx, nz] of order) {
    if (laid >= 2) break;
    if (nx < it.x0 || nx > it.x1 || nz < it.z0 || nz > it.z1) continue;
    if (c.put1(nx, nz, "chiseled_sandstone")) laid++;
  }
  return lit;
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
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one: a
 * position-derived integer hash is the idiom every earlier wave uses, it is a
 * pure function, and `Math.imul` is exactly specified where `Math.pow` is not.
 */
function caravanJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * The **sacks** — what a spice godown and a dye yard are actually full of.
 *
 * Coloured terracotta, drawn from position. Every one of them is a full cube,
 * which is the whole reason this pack says its colour in terracotta rather than
 * in wool or in carpet: a sack is a thing you stack, and a stack of 15/16
 * blocks is a stack you cannot walk past the top of.
 */
const SACKS = [
  "orange_terracotta",
  "yellow_terracotta",
  "red_terracotta",
  "brown_terracotta",
  "white_terracotta",
] as const;

/** One sack block, drawn from position. */
function sackAt(x: number, z: number): string {
  return SACKS[caravanJitter(x, 0, z, SACKS.length)] as string;
}

/** The **dye** blocks — the cloth over a dyer's vats, in the deep colours. */
const DYES = ["blue_terracotta", "cyan_terracotta", "purple_terracotta", "green_terracotta"] as const;

/** One dyed cloth block, drawn from position. */
function dyeAt(x: number, z: number): string {
  return DYES[caravanJitter(x, 1, z, DYES.length)] as string;
}

/* -------------------------------------------------------------------------- */
/* THE CURBED BASIN — the pack's load-bearing rule                             */
/* -------------------------------------------------------------------------- */

/**
 * **A pool, sunk into the floor and closed on every side.**
 *
 * The Atlantean pack's `sunkenBasin` word for word, restated here rather than
 * imported for the reason every pack restates its machinery: two packs are two
 * seams, and a shared private helper is a shared edit. The argument is the
 * riad's courtyard basin and the science pack's pond, unchanged:
 *
 * - the water goes **into the floor plane at `y = 0`**, never up at `y = 1`. A
 *   water cell at `y = 1` is a body-blocking cell in the middle of the room
 *   *and* a fluid with a free face on every side of it;
 * - the rect is **inset at least one cell from the interior on every side**, so
 *   the walkway round it is the room's own floor and every water cell has a
 *   floor cell orthogonally beside it. A basin flush to a wall would be a basin
 *   whose closure depended on the shell's window rhythm, and a window is a hole;
 * - **every floor cell touching the water is written solid** — that is the half
 *   of the predicate the shell does not already guarantee, because a floor cell
 *   the fit-out never touched could be anything;
 * - the cells are **claimed through `take` before a drop is written**, which
 *   runs the ground floor's connectivity guard *and* marks the cells occupied,
 *   so no later `put1` in this file can ever stand a trough on the water.
 *
 * Returns whether the basin was built. `false` is a perfectly good answer — a
 * court you have to wade across is a pond.
 */
function sunkenBasin(ctx: FitOutContext, c: PropCounter, rect: LocalRect, rim: string): boolean {
  const it = ctx.interior;
  if (rect.x0 <= it.x0 || rect.x1 >= it.x1 || rect.z0 <= it.z0 || rect.z1 >= it.z1) return false;
  if (rect.x1 < rect.x0 || rect.z1 < rect.z0) return false;

  const cells: [number, number][] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!ctx.free(x, z)) return false;
      cells.push([x, z]);
    }
  }
  // The claim, and the connectivity guard with it. Refused, and not one drop
  // of water is written — which is the whole point of asking first.
  if (!ctx.take(cells, "cut_sandstone")) return false;

  for (const [x, z] of cells) c.raw(x, 0, z, "water", WATER);

  // The rim: every floor cell touching the water, written solid. Interior
  // cells only — the ring outside the interior is the shell's own wall foot.
  for (let z = rect.z0 - 1; z <= rect.z1 + 1; z++) {
    for (let x = rect.x0 - 1; x <= rect.x1 + 1; x++) {
      if (x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1) continue;
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      c.raw(x, 0, z, rim);
    }
  }
  return true;
}

/**
 * The basin a room of this size can hold at a given centre, or `null`.
 *
 * `half` is how far the rect reaches either side of the centre; the answer is
 * clamped to leave a walkway one cell wide inside the interior on every side,
 * and refused outright when the room cannot give one.
 */
function basinAt(
  ctx: FitOutContext,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
): LocalRect | null {
  const it = ctx.interior;
  const x0 = Math.max(cx - halfX, it.x0 + 1);
  const x1 = Math.min(cx + halfX, it.x1 - 1);
  const z0 = Math.max(cz - halfZ, it.z0 + 1);
  const z1 = Math.min(cz + halfZ, it.z1 - 1);
  if (x1 < x0 || z1 < z0) return null;
  return { x0, x1, z0, z1 };
}

/**
 * **Put a basin somewhere near where the caller wanted it**, or nowhere.
 *
 * The lesson this helper *is*: on most envelopes the middle column of the room
 * is the **door's approach**, which the ground floor reserves and which
 * `free()` therefore refuses — so "centre the pool" is the one answer
 * unavailable on exactly the plans a pool most wants to be centred on. So the
 * centre is a *preference*: the search walks outward in x, then one row either
 * way in z, and takes the first placement {@link sunkenBasin} accepts. Every
 * attempt is free of side effects until the claim succeeds, so a failed probe
 * leaves the room exactly as it found it.
 *
 * Returns the rect actually filled, or `null` when the room will give none.
 */
function placeBasin(
  ctx: FitOutContext,
  c: PropCounter,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  rim: string,
): LocalRect | null {
  const it = ctx.interior;
  for (let dz = 0; dz <= 1; dz++) {
    for (const z of dz === 0 ? [cz] : [cz - dz, cz + dz]) {
      if (z < it.z0 || z > it.z1) continue;
      for (let dx = 0; dx <= it.x1 - it.x0; dx++) {
        for (const x of dx === 0 ? [cx] : [cx - dx, cx + dx]) {
          const rect = basinAt(ctx, x, z, halfX, halfZ);
          if (rect === null) continue;
          if (sunkenBasin(ctx, c, rect, rim)) return rect;
        }
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* the shrine's dome                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The Mesoamerican pack's plan in every respect, restated rather than imported
 * for the reason that pack restated the Nile's.
 */
interface CaravanPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
}

/** The plan for work on the walls: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): CaravanPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return { sx, sz, base: ctx.wallTop + 1, top: ctx.roofTop + ROOF_FLOURISH_RISE };
}

/** The plan for a roof rebuild: a wall plan that also has room to build in. */
function roofPlan(ctx: FitOutContext): CaravanPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: CaravanPlan): void {
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
 * Blocks a re-clad may never overwrite.
 *
 * The Mesoamerican pack's list unchanged: the way in, the way up, the fire, the
 * glass and anything the physics lint holds to a support rule.
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

/** Re-clad the wall ring between two courses. `block` is a pure function of position. */
function reclad(
  ctx: FitOutContext,
  plan: CaravanPlan,
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
 * **Mudbrick** — the substance an oasis town is actually built of.
 *
 * `mud_bricks` mostly, with `packed_mud` and the smooth sandstone banded
 * through it by position. Named outright as a *substance* rather than drawn
 * from the palette, exactly as the Mesoamerican pack names `mossy_stone_bricks`
 * and the steppe pack names its felt: the theme's stone is what the *frame* is
 * made of, and no palette symbol in the grammar spells "sun-dried brick".
 *
 * All three are full cubes — rule 6, which is why `mud` itself appears nowhere.
 */
function mudBrick(): (x: number, y: number, z: number) => string {
  return (x, y, z) => {
    const draw = caravanJitter(x, y, z, 8);
    if (draw === 0) return "packed_mud";
    if (draw === 1 || draw === 2) return "smooth_sandstone";
    return "mud_bricks";
  };
}

/**
 * **THE HANGER GUARD** — nothing this file writes may leave a hanging block
 * hanging from air.
 *
 * The Mesoamerican pack's closure, restated as code for the same reason it was
 * there: the shell hangs its lantern from the ceiling plane directly above it,
 * and **the dome rebuild deletes and re-lays the volume over that plane.**
 * `unsupported.chain` walks a hanger's support upward and fails it the moment
 * the cell above is air — a finding no render shows.
 */
function guardHangers(ctx: FitOutContext, c: PropCounter): void {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const ceiling = ctx.style["floor.interior"] as string;
  const top = ctx.roofTop + ROOF_FLOURISH_RISE;
  for (let y = 1; y <= top; y++) {
    for (let z = -1; z <= sz; z++) {
      for (let x = -1; x <= sx; x++) {
        const here = ctx.blockAt(x, y, z);
        if (here === undefined || here.props?.["hanging"] !== "true") continue;
        const above = ctx.blockAt(x, y + 1, z);
        if (above !== undefined && above.block !== "air") continue;
        c.raw(x, y + 1, z, ceiling);
      }
    }
  }
}

/**
 * **The shrine's dome** — the pack's one silhouette argument.
 *
 * A domed spring shrine is the single most recognisable object in an oasis
 * town, and a hip roof on one is a cottage with a funny hat. Built the way the
 * temazcal's shoulder, the ger's crown and the Atlantean oracle's dome are
 * built, and for the same reason: **filled discs stepping in**, each standing
 * on the filled disc below it. A dome written as a ring per course leaves its
 * outermost cells with air below and beside them, which is `floating.isolated`;
 * a hollow dome is a sealed pocket besides. The lid under it gives the room a
 * ceiling and gives the first disc a floor.
 *
 * The last courses come out in `glowstone` rather than in brick: that is the
 * oculus, it is the light the shrine is read by, and a full cube of it bedded
 * in a filled disc has no support rule left to fail.
 *
 * Silently does nothing on an envelope with no room above the plate — a fit-out
 * that insisted would be arguing with the shell.
 */
function shrineDome(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  const brick = mudBrick();
  const wall = wallPlan(ctx);

  // The wall skin: mudbrick from the ground to the plate. Doors, glass and
  // anything with a support rule are left alone.
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, brick);

  if (plan === null) {
    guardHangers(ctx, c);
    return;
  }

  clearRoof(ctx, plan);

  // The lid first — a ceiling for the room and a floor for the dome.
  const lidBlock = ctx.style["roof.solid"] as string;
  const board = ctx.style["floor.interior"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      c.raw(x, plan.base, z, caravanJitter(x, plan.base, z, 5) === 0 ? board : lidBlock);
    }
  }

  // The dome: filled discs, stepping in, each on the one below it.
  const cx = (plan.sx - 1) / 2;
  const cz = (plan.sz - 1) / 2;
  const r0 = Math.min(cx, cz);
  let crown = plan.base;
  for (let y = plan.base + 1; y <= plan.top; y++) {
    const radius = r0 - (y - plan.base - 1) * 0.85;
    if (radius < 0.5) break;
    for (let z = 0; z < plan.sz; z++) {
      for (let x = 0; x < plan.sx; x++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz > radius * radius) continue;
        c.raw(x, y, z, radius < 1.6 ? "glowstone" : brick(x, y, z));
      }
    }
    crown = y;
  }

  // **The oculus, written last and unconditionally.** On a tall envelope the
  // discs shrink until the last of them comes out in `glowstone` on their own;
  // on a shallow one the dome runs out of height before that happens, and a
  // shrine whose light depends on how much roof allowance the shell felt like
  // giving it is a shrine that is sometimes dark.
  if (crown > plan.base) c.raw(Math.round(cx), crown, Math.round(cz), "glowstone");

  guardHangers(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* the serai court                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `serai_court` — the anchor, and the only building here a stranger will name
 * out loud.
 *
 * Three things. The **arcade**: `cut_sandstone` columns down both wall rows at
 * every other bay, capped short of the ceiling so no column is a pillar through
 * the room. The **cells** between them — a bench of bottom slabs in each bay,
 * which is what a trader actually gets for his night — and the **lamp niches**
 * bedded among them, which is where the pack's glow lives. And the **court's
 * own basin** at the middle of the floor, curbed, because a serai without water
 * is a serai nobody stops at.
 *
 * The middle of the floor either side of the basin is left untouched: the
 * middle of a caravan court is where the animals are unloaded.
 */
function fitSeraiCourt(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The arcade, both walls, columns at every other bay, benches between.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      column(ctx, c, x, z, "cut_sandstone");
    }
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 4 === 1) c.put1(x, z, slab, SLAB);
      else if ((z - it.z0) % 4 === 3) lampNiche(ctx, c, x, z);
    }
  }

  // The court's basin, one row to the head side of the middle of the floor —
  // off the column the shell hangs its lantern in, so the room's route never
  // runs through it.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 1, 0, rim);

  // The keeper's counter across the head, and the bales by the way in.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the gatehouse                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `caravan_gatehouse` — one arch bay, wide enough for a loaded animal.
 *
 * **One** bay, and that is a walkability decision, not a taste one. Two piers
 * and a lintel across them read as a gate at a glance; a second bay behind the
 * first cuts the room into segments with a column at each end, which is exactly
 * the kind of pocket that passes a connectivity check and fails the lint's walk
 * from the door.
 *
 * The gatekeeper gets the rest: a bench down one wall obeying the stair-seat
 * rule, the toll counter at the head, the glow beside it.
 *
 * Bare `gate`, `gatehouse` and `arch` stay the city gate's and the triumphal
 * arch's; `caravan` compounds are this pack's.
 */
function fitCaravanGatehouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The arch, at the head end of the room: two piers three cells apart, and
  // the lintel across their heads at the course the columns actually reached.
  const archZ = headZ === it.z0 ? it.z0 + 2 : it.z1 - 2;
  const bay = bayOn(ctx, archZ, 2) ?? bayOn(ctx, archZ, 0);
  const piers: number[] = [];
  if (bay !== null && archZ > it.z0 && archZ < it.z1) {
    for (const x of [bay - 2, bay + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      if (column(ctx, c, x, archZ, "cut_sandstone")) piers.push(x);
    }
    if (piers.length === 2) {
      const top = columnTop(ctx);
      for (let x = piers[0] as number; x <= (piers[1] as number); x++) {
        c.stack(x, archZ, top, "chiseled_sandstone");
      }
    }
  }

  // The gatekeeper's bench down one wall, in bays.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ || z === archZ) continue;
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x1, z, seat, { facing: seatFacing(it, it.x1, z), half: "bottom", shape: "straight" });
  }

  // The toll counter and the glow at the head, the tally barrels by the way in.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const lit = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (lit !== null) lampNiche(ctx, c, lit, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the qanat wellhead                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `qanat_wellhead` — the underground channel, brought up where it can be drawn
 * from.
 *
 * The **channel** runs the length of the room, one cell wide, inset from the
 * wall so the walkway either side of it is the room's own floor and its closure
 * never depends on the shell's window rhythm. Two candidate columns are tried
 * rather than one, because the room's middle column is as often as not the
 * door's own approach — and a wellhead with no water in it is a shed.
 *
 * The **draw rope** is this pack's one hanger, and it is the tide-bell lesson
 * written down: a cap course of the theme's own roof stone at the top of the
 * storey, `iron_chain` under it, and **nothing under the chain**. A chain is
 * not a full cube, so anything with `attachment: ceiling` beneath one is
 * `unsupported.chain` in waiting; the rope simply ends in air, which is what a
 * rope does.
 */
function fitQanatWellhead(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const rim = style["foundation.accent"] as string;
  const cap = style["roof.solid"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The channel: one cell wide, running the length, inset one from the wall.
  let chan = -1;
  for (const x of [it.x0 + 2, it.x1 - 2]) {
    if (x <= it.x0 || x >= it.x1) continue;
    const rect: LocalRect = { x0: x, x1: x, z0: it.z0 + 1, z1: it.z1 - 1 };
    if (sunkenBasin(ctx, c, rect, rim)) {
      chan = x;
      break;
    }
  }

  // The draw rope, over the walkway beside the channel and never over it: a
  // rope over water is a rope nobody can stand under to pull.
  if (chan >= 0 && head >= 4) {
    const ropeX = chan + 1 <= it.x1 ? chan + 1 : chan - 1;
    const ropeZ = headZ === it.z0 ? it.z0 + 2 : it.z1 - 2;
    if (ropeX >= it.x0 && ropeX <= it.x1 && ropeZ > it.z0 && ropeZ < it.z1) {
      c.stack(ropeX, ropeZ, head, cap);
      c.stack(ropeX, ropeZ, head - 1, "iron_chain", CHAIN_Y);
    }
  }

  // The drawing side: jars on a plinth, and the buckets between them.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x1, z, "cauldron");
    else if ((z - it.z0) % 3 === 2) c.put1(it.x1, z, slab, SLAB);
  }

  // The keeper's shelf and the glow at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
  standInRow(ctx, c, headZ, it.x0, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the windcatcher house                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `windcatcher_house` — the badgir, and the one house in the catalog whose
 * whole subject is moving air.
 *
 * The **shaft** stands at the head of the room: two `cut_sandstone` columns
 * with the **vent grilles** of `iron_bars` between their heads, at the top of
 * the storey and no lower — `iron_bars` is a body-blocking block, and a grille
 * at chest height is a grille nobody can walk past. The **cool floor** is the
 * slab platform down one wall a household actually sleeps on in the summer, and
 * the **water jar** in the draught is the other half of how a badgir works.
 *
 * No exterior work: the tower a badgir wears is the shell's business, and a
 * second archetype reaching up through a roof it does not own is the second
 * grammar the design law forbids.
 */
function fitWindcatcherHouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The shaft: two columns at the head, grilles tied across their heads.
  const bay = bayOn(ctx, headZ, 2) ?? bayOn(ctx, headZ, 0);
  const shafts: number[] = [];
  if (bay !== null) {
    for (const x of [bay - 2, bay + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      if (column(ctx, c, x, headZ, "cut_sandstone")) shafts.push(x);
    }
  }
  if (shafts.length === 2 && head >= 3) {
    for (let x = shafts[0] as number; x <= (shafts[1] as number); x++) {
      c.stack(x, headZ, columnTop(ctx), "iron_bars", BARS_X);
    }
  }

  // The vents down the walls, at the top of the storey, where the draught runs.
  railOn(ctx, c, it.x0, BARS_Z);

  // The cool floor: the sleeping platform down the other wall, in bays.
  plinth(ctx, c, it.x1, slab, headZ);

  // The water jar in the draught, and the glow at the head.
  const lit = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (lit !== null) lampNiche(ctx, c, lit, headZ);
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  standInRow(ctx, c, front, Math.floor((it.x0 + it.x1) / 2), "cauldron");
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the spice godown                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `spice_godown` — the sack ranks, and the room the whole road exists for.
 *
 * The **sacks** are coloured terracotta — full cubes, rule 6's argument applied
 * to cargo — stacked two high on a **plinth** of bottom slabs down both walls,
 * so nothing sits on a floor that gets swept. Between the ranks the **tally
 * barrels** stand, and the glow is at the head where the ledger is.
 *
 * Bare `warehouse` stays the founding table's, and bare `spice_market` the
 * commerce wave's souk: this is a *store*, with no counter and no customers.
 */
function fitSpiceGodown(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue; // the gangway between two ranks
      if (slot === 0) c.put1(x, z, slab, SLAB);
      else c.put1(x, z, "barrel", BARREL);
    }
    // The sacks, up on the plinth and never on the floor.
    if (head < 3) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 0) continue;
      if (z === headZ) continue;
      c.stack(x, z, 2, sackAt(x, z));
    }
  }

  // The weighing bench and the glow at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the camel lines                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `camel_lines` — where the animals stand while their load is counted.
 *
 * Hurdles off one wall in bays with the **troughs** between them; the **fodder**
 * up on a plinth down the other, because fodder on the ground is fodder trodden
 * into it; the **tack shelf** across the head.
 *
 * Bare `stable`, `stables`, `paddock` and `corral` stay where they were, and
 * the steppe pack's `horse_line` is a *different* room: that one is a picket
 * out on the grass, this one is a walled yard off a court.
 */
function fitCamelLines(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The hurdles and troughs down one wall, in bays.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x0, z, fence, POST);
    else if ((z - it.z0) % 3 === 2) c.put1(it.x0, z, "cauldron");
  }

  // The plinth and the fodder down the other.
  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "hay_block", { axis: "y" });
    }
  }

  // The tack shelf and the glow across the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the shade arcade                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `shade_arcade_row` — the stall row, and the pack's argument about shade.
 *
 * The **columns** run down both walls at every third bay, and the **awning**
 * springs off each of them: a bottom slab one cell in from the column at the
 * course the column actually reached, so the awning touches the column it hangs
 * off and nothing in it is floating. That is the whole reason the awning is
 * written at {@link columnTop} rather than at a fixed height — a slab at a
 * guessed course beside a column that stopped lower is a slab in mid-air.
 *
 * The **counters** of bottom slabs fill the bays between, and the goods stand
 * on them: a stall is a table you can see over.
 *
 * Bare `bazaar`, `souk`, `market`, `arcade` and `stoa` all stay where they were.
 */
function fitShadeArcadeRow(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  const top = columnTop(ctx);

  for (const x of [it.x0, it.x1]) {
    const inward = x === it.x0 ? 1 : -1;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 !== 0) continue;
      if (!column(ctx, c, x, z, "cut_sandstone")) continue;
      // The awning, springing off the column it touches.
      if (head >= 4 && x + inward >= it.x0 && x + inward <= it.x1) {
        c.stack(x + inward, z, top, slab, SLAB);
      }
    }
    // The counters, and the goods on them.
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 !== 1) continue;
      if (c.put1(x, z, slab, SLAB) && head >= 3) c.stack(x, z, 2, sackAt(x, z));
    }
  }

  // The row's own lamp and the stall keeper's stores at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the date store                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `date_store_tower` — the year's dates, kept dark and kept up off the floor.
 *
 * **Bins** of bottom slabs down both walls with the pressed blocks stacked on
 * them, the **gangway** between the ranks, and the **press** at the head. The
 * window rhythm is `none` for the same reason the drowned archive's is: a store
 * whose whole subject is keeping the sun off what is in it is a room kept dark.
 *
 * Bare `granary` stays the founding table's and `mudbrick_granary` the Nile
 * pack's, word for word.
 */
function fitDateStoreTower(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue;
      c.put1(x, z, slab, SLAB);
    }
    if (head < 3) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 0) continue;
      if (z === headZ) continue;
      c.stack(x, z, 2, "brown_terracotta");
    }
  }

  // The press at the head, through `standInRow`: it is the room's one
  // must-have and it must not vanish because its cell was the door's.
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "smooth_sandstone");
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the cistern                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `serai_cistern` — the pack's largest body of water, and its most careful.
 *
 * One **curbed basin** at the middle of the floor, three cells by one, with the
 * **drawing steps** — stairs with their backs to the wall — round it and the
 * **jars** in the bays between. Every drop of it is closed by construction: the
 * cells are claimed through the ground floor's connectivity guard before a drop
 * is written, so a cistern that would strand half the room is refused and the
 * room is simply dry.
 *
 * Bare `cistern` and `reservoir` stay the utility wave's — which is the
 * interesting comparison, because that one is an infrastructure vessel and this
 * one is a room in a town.
 */
function fitSeraiCistern(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);

  // The steps and the jars, both walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue;
      if (slot === 1) c.put1(x, z, "cauldron");
      else c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    }
  }

  // The cistern itself, at the middle of the floor, one row off the lantern.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 1, 0, rim);

  // The glow at the head, under a dressed cap.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null && lampNiche(ctx, c, bay, headZ) && headroomOf(ctx) >= 3) {
    c.stack(bay, headZ, 2, "chiseled_sandstone");
  }
}

/* -------------------------------------------------------------------------- */
/* the dye yard                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `dye_yard` — the vats, and the one room in the pack that is a colour.
 *
 * The **vats** are cauldrons down both walls in bays; the **cloth** is the deep
 * terracotta set drying on the rods over them — up at the top of the storey,
 * where a body walks under it rather than into it; and the **loom** stands at
 * the head through {@link standInRow}, because a dye yard with no loom in it is
 * a yard full of buckets.
 *
 * Not a drop of water is written here, and that is deliberate: a dyer's vat is
 * a cauldron, the block the game already means by it, and an open pool of dye
 * beside an open pool of water is two fluids where the pack can only prove one.
 */
function fitDyeYard(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue;
      if (slot === 0) c.put1(x, z, "cauldron");
      else c.put1(x, z, slab, SLAB);
    }
    // The drying rods, and the cloth over them.
    railOn(ctx, c, x, BARS_Z);
    if (head < 4) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      c.stack(x, z, head - 1, dyeAt(x, z));
    }
  }

  // The loom at the head, facing back down the room, and the glow beside it.
  const look = headZ === it.z0 ? "south" : "north";
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "loom", { facing: look });
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the glass kiln                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `desert_glass_kiln` — sand in one end, glass out of the other.
 *
 * The **kiln** stands at the head: a `blast_furnace` written `lit: "false"`,
 * with the **heat** bedded beside it as this pack's own glow. Never a lit fire
 * and never a `campfire` — the shell's own hearth is the room's fire, and rule
 * 5 says a fit-out does not light a second one.
 *
 * The **sand** is ranked on a plinth down one wall and the **finished glass**
 * down the other, both up off the floor: sand is a gravity block and a heap of
 * it on a floor plane is a heap waiting for the first block tick, which is why
 * every grain of it here stands on a slab that stands on the shell's own floor.
 */
function fitDesertGlassKiln(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The stock, both walls: the plinth first, then what stands on it.
  plinth(ctx, c, it.x0, slab, headZ);
  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x0, z, 2, "sandstone");
      c.stack(it.x1, z, 2, "glass");
    }
  }

  // The kiln at the head, cold, and the heat bedded beside it.
  const look = headZ === it.z0 ? "south" : "north";
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "blast_furnace", {
    facing: look,
    lit: "false",
  });
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the oasis shrine                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `oasis_shrine` — the domed room at the spring, and the pack's only exterior
 * work.
 *
 * Inside it is a **ring of seats** against both walls with their backs to the
 * wall, so the room sits looking in; the **ablution basin**, one course of
 * water sunk into the floor a little to the head side of the middle, curbed by
 * construction; and the **glow** at the head.
 *
 * The basin is deliberately off the exact middle of the floor: the shell hangs
 * its lantern from the ceiling plane over the centre, and a basin under it
 * would be a room whose one route ran through the lantern column.
 *
 * Bare `shrine`, `roadside_shrine` and `chapel` stay the faith and relic waves'.
 */
function fitOasisShrine(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);

  shrineDome(ctx, c);

  // The ring of seats, in bays so no run is a second wall.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    }
  }

  // The ablution basin, one row to the head side of the middle of the floor.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 0, 0, rim);

  // The glow at the head, where the offering stands.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) lampNiche(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the watch minaret                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `watch_minaret` — the road watch, read off its storeys.
 *
 * The **rail** is fence posts at intervals round the watch floor and never a
 * solid run: a watch floor is a thing you see out of, and a bench of full
 * blocks round the wall is a parapet with nobody behind it.
 *
 * The **signal brazier** stands at the head under a dressed cap — glow bedded
 * between two courses of stone, cold, because a signal fire in a sealed room is
 * a fire the physics lint has an opinion about and the walk has a worse one.
 *
 * Bare `minaret` stays the faith wave's, bare `tower` and `watchtower` the
 * founding table's; this one answers to `watch_minaret` alone and to
 * `watchtower_minaret`.
 */
function fitWatchMinaret(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The rail: posts at intervals, never a solid run.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      c.put1(x, z, fence, POST);
    }
  }

  // The watch bench and the brazier at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null && lampNiche(ctx, c, bay, headZ) && head >= 3) {
    c.stack(bay, headZ, 2, "chiseled_sandstone");
  }
  standInRow(ctx, c, headZ === it.z0 ? it.z1 : it.z0, it.x1, "barrel", BARREL);
}
