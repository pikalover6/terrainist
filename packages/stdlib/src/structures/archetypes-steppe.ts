/**
 * The **Steppe Nomad pack's buildings** — the twelve entries of that pack which
 * have an inside rather than a footprint on the open grass.
 *
 * ## The thesis
 *
 * "A Mongol camp", "a steppe horde", "the khan's ordu" all route to the
 * `medieval` era and arrive as a generic European village, with the wayside
 * pack's single `yurt` **prop** parked outside it as the only concession. The
 * *palette* was never the problem — `sun_clay` and `temperate_timber` have both
 * shipped since the founding waves — the missing thing is the **noun set**: a
 * nomad place is a ring of gers with a crown ring open at the top of each, a
 * horse line, a felt works, a kumis tent, an ovoo on the ridge and a wrestling
 * ground trodden flat in the middle, and the catalog could say none of those.
 * A cottage with a round roof is a cottage.
 *
 * The twelve:
 *
 * - `ger_round_tent` — the anchor: the felt-and-lattice round tent, the hearth
 *   under the crown ring, the low bed platform round the wall;
 * - `khans_ger` — grander, and organised round the **dais at the head**, with
 *   the banner posts either side of the way in;
 * - `cart_ger` — the ger that never comes down: the same felt dome standing on
 *   a cart bed, the axle logs under it and the drawbar at the head;
 * - `kumis_tent` — the fermented mare's milk: the churns down one wall, the
 *   skin bags hung over them and the stirring post at the head;
 * - `horse_line` — the picket: posts and a rail down both walls, the troughs
 *   in the bays between them, the hay at the head;
 * - `felt_workshop` — the felt works: the bales up on the plinth, the rolling
 *   frame overhead, the wetting vats under it;
 * - `bowyer_tent` — the composite bow: horn and sinew racked overhead, the
 *   bench down one wall, the glue pot at the head;
 * - `caravan_rest` — the halt: cargo stacked clear of the floor down both
 *   walls, water by the way in, fodder at the head;
 * - `wrestling_ground` — the *bökh* ring: a low bank all round a floor
 *   deliberately left completely bare, and the judges' posts at the head;
 * - `watch_platform_steppe` — the raised lookout: the rail round the edge, the
 *   signal brazier bedded in stone, the horn rack overhead and the ladder well
 *   left open;
 * - `borts_rack` — the *borts* rack: air-dried beef hung from horizontal poles
 *   carried above head height, so every lane of the room under them stays
 *   walkable;
 * - `winter_corral` — the *khashaa*: the winter stock enclosure, hurdles down
 *   one wall, the fodder stacked on a plinth down the other, the lean-to shelf
 *   across the head.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it.
 *
 * Ten of the twelve do **no exterior work at all**, exactly like
 * `archetypes-norse.ts`. The exception is the **felt dome**, which the four
 * tent types share and which is the pack's whole silhouette argument: a ger is
 * a *round* building and a hip roof on it is a cottage. The dome is built the
 * way the Mesoamerican pack's temazcal is built and for the same reason —
 * **filled discs stepping in, each standing on the filled disc below it**. A
 * dome built as a ring per course is `floating.isolated` waiting to happen.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Every interior block goes through {@link PropCounter}**, which routes
 *    through the ground floor's own `free` and `take` — the door approach, the
 *    stair columns, the connectivity guard and the blocked-column guard, none
 *    of them restated here. `raw` appears only above the eave plate.
 * 2. **Everything stands against a wall and the middle stays walkable.** The
 *    bed platform, the churn rank and the cargo plinth each leave the room one
 *    walkable region on every envelope the solver can hand it.
 * 3. **Nothing is a pillar.** A stack filling an interior column from floor to
 *    ceiling is `interior.blocked_column`, and `PropCounter`'s headroom guard
 *    refuses it — which is why every post here is written with
 *    {@link headroomOf} in hand rather than at a fixed height.
 * 4. **No lantern by name, and no lit fire.** The lint's lantern rule fires on
 *    any block whose name ends `lantern`. Every glow in this file is
 *    `glowstone` bedded against solid neighbours; `campfire` never appears.
 * 5. **No sign blocks**, no bare `flower_pot`, and `cauldron` takes no
 *    properties. **`chain` is not in the pinned 1.21.11 table**: every hanging
 *    line here is `iron_bars`, and every one of them sits at head height or
 *    above so the floor under it stays a 1x2 body's floor.
 * 6. **No `mud` and no `farmland`** — 15/16 of a block is a floor a body
 *    cannot stand on.
 * 7. **A rebuilt roof starts with a lid**, and nothing the rebuild does may
 *    strand a hanger the shell placed — {@link guardHangers} closes that for
 *    the four domed types at once.
 * 8. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same camp
 *    forever.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  roofPlan,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { cardinalStep, type LocalRect } from "./core.js";
import { buildingIdFromTags, defineBuildingDescriptors } from "./descriptor.js";

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
export const STEPPE_BUILDING_ARCHETYPES = [
  "ger_round_tent",
  "khans_ger",
  "cart_ger",
  "kumis_tent",
  "horse_line",
  "felt_workshop",
  "bowyer_tent",
  "caravan_rest",
  "wrestling_ground",
  "watch_platform_steppe",
  "borts_rack",
  "winter_corral",
] as const;

/** One of the archetypes this file fits out. */
export type SteppeBuildingArchetype = (typeof STEPPE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isSteppeArchetype(value: string): value is SteppeBuildingArchetype {
  return (STEPPE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted with the other pack tables, above the greedy general tables and
 * below nothing that would change. The **non-claims** are the load-bearing
 * half of this comment, because the steppe vocabulary brushes up against words
 * older tables own and own correctly:
 *
 * - **bare `yurt` is NOT ours.** `yurt` is the wayside pack's `prop.place@0`
 *   piece and has been since wave three: a document that writes `yurt` in a
 *   props list wants that prop and must keep getting it. This pack's tent
 *   answers to `ger_round_tent`, `ger` and `round_tent` — `ger` being the word
 *   the thing is actually called, which no table in the catalog has claimed;
 * - **bare `tent` and bare `camp` are not ours** — `tent` is the blitz pack's
 *   prop and `camp`/`encampment` are the siegeworks wave's `siege_camp`, whose
 *   claim on a war document is the better one;
 * - **bare `stable`, `paddock` and `corral` are not ours.** The founding
 *   table's stable and the agrarian expansion's `cattle_pen` own all three,
 *   and a picket line is not a stable: it is a rail in the open with no stall
 *   in it. Ours answers to `horse_line`, `picket_line` and `horse_picket`, and
 *   the winter enclosure to `winter_corral`, `winter_pen` and `stock_shelter`;
 * - **bare `caravanserai` is not ours** — the trade wave's, and rightly: a
 *   caravanserai is a walled masonry courtyard and this is an open-sided
 *   shelter beside a track. Ours answers to `caravan_rest`, `caravan_shelter`
 *   and `caravan_halt`;
 * - **bare `watchtower`, `lookout` and `tower` are not ours** — the first two
 *   are claimed above every table in this file by `archetypeOfTags` itself.
 *   The raised platform answers to `watch_platform_steppe`, `watch_platform`
 *   and `steppe_lookout`;
 * - **bare `arena`, `stadium` and `amphitheater` are not ours** — the sanctum
 *   and leisure waves'. The wrestling ring answers to `wrestling_ground`,
 *   `wrestling_ring` and `bokh_ring`;
 * - **bare `brewery`, `dairy` and `mill` are not ours**; the kumis tent
 *   answers to `kumis_tent`, `kumis` and `airag_tent`;
 * - **bare `drying_rack` and the Nordic pack's `drying_rack_yard` are not
 *   ours**, and this is the sharpest near miss in the pack: that one is a
 *   *fish* yard on a northern shore, a prop, hung vertically off a hjell.
 *   This one is air-dried beef on horizontal poles inside a room, and it takes
 *   the words the Norse yard does not: `borts_rack`, `borts` and `meat_rack`;
 * - **bare `workshop`, `smithy` and `fletcher` are not ours**; the felt works
 *   answers to `felt_workshop`, `felt_house` and `felt_maker`, and the bow
 *   maker to `bowyer_tent`, `bowyer` and `bow_maker`.
 *
 * Every claim below is therefore either a compound of this pack's own ids or a
 * word (`ger`, `borts`, `kumis`, `bokh_ring`, `airag_tent`, `balbal`) that no
 * table in the catalog has ever claimed.
 */
function steppeArchetypeOfTags(tags: readonly string[]): SteppeBuildingArchetype | null {
  return buildingIdFromTags(STEPPE_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * The four tent types ask for **`hip`**, which is the shape that leaves the
 * deepest gap between the eave plate and the height allowance — and that gap
 * is where the felt dome is built. The working buildings take **`gable`**,
 * because a steppe workshop is a ridge tent on poles, and the watch platform
 * takes **`flat`**: a lookout floor has a deck, not a roof.
 *
 * The window rhythms carry the rest. **Every tent is `none`** — a rank of glass
 * in a felt wall is the one detail that would make a stranger read the whole
 * camp as a suburb — and so are the borts rack and the winter corral, which
 * want the dark and the draught respectively. The workshops are lit
 * (`regular`), because a bowyer and a felt-maker work by eye.
 */
export function steppeFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "ger_round_tent":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "khans_ger":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "cart_ger":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "kumis_tent":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "horse_line":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "gable" };
    case "felt_workshop":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "bowyer_tent":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "caravan_rest":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "gable" };
    case "wrestling_ground":
      return { windowShape: "wide", windowRhythm: "regular", roof: "gable" };
    case "watch_platform_steppe":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "borts_rack":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "winter_corral":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    default:
      return {};
  }
}
export const STEPPE_BUILDING_DESCRIPTORS = defineBuildingDescriptors(STEPPE_BUILDING_ARCHETYPES, {
  tags: {
    ger_round_tent: ["ger_round_tent", "ger", "round_tent"],
    khans_ger: ["khans_ger", "khan_ger", "great_ger"],
    cart_ger: ["cart_ger", "wagon_ger", "ger_cart"],
    kumis_tent: ["kumis_tent", "kumis", "airag_tent"],
    horse_line: ["horse_line", "picket_line", "horse_picket"],
    felt_workshop: ["felt_workshop", "felt_house", "felt_maker"],
    bowyer_tent: ["bowyer_tent", "bowyer", "bow_maker"],
    caravan_rest: ["caravan_rest", "caravan_shelter", "caravan_halt"],
    wrestling_ground: ["wrestling_ground", "wrestling_ring", "bokh_ring"],
    watch_platform_steppe: ["watch_platform_steppe", "watch_platform", "steppe_lookout"],
    borts_rack: ["borts_rack", "borts", "meat_rack"],
    winter_corral: ["winter_corral", "winter_pen", "stock_shelter"],
  },
  facadeDefaults: (id) => steppeFacadeDefaults(id),
  furnish: furnishSteppe,
  dispatch: "standard",
});

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
function furnishSteppe(ctx: FitOutContext): number {
  if (!isSteppeArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "ger_round_tent":
      fitGer(ctx, c);
      break;
    case "khans_ger":
      fitKhansGer(ctx, c);
      break;
    case "cart_ger":
      fitCartGer(ctx, c);
      break;
    case "kumis_tent":
      fitKumisTent(ctx, c);
      break;
    case "horse_line":
      fitHorseLine(ctx, c);
      break;
    case "felt_workshop":
      fitFeltWorkshop(ctx, c);
      break;
    case "bowyer_tent":
      fitBowyerTent(ctx, c);
      break;
    case "caravan_rest":
      fitCaravanRest(ctx, c);
      break;
    case "wrestling_ground":
      fitWrestlingGround(ctx, c);
      break;
    case "watch_platform_steppe":
      fitWatchPlatform(ctx, c);
      break;
    case "borts_rack":
      fitBortsRack(ctx, c);
      break;
    case "winter_corral":
    default:
      fitWinterCorral(ctx, c);
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

/** A bottom slab — the bench top, the plinth and the shelf of this whole file. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a rail, a rope, a rack. */
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

/** A bare post of bars, joined to nothing sideways. */
const BARS_POST = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
} as const;

/**
 * The wall a cell is nearest, as a stair `facing` that puts the **backrest**
 * against it.
 *
 * The stair-seat rule, obeyed everywhere in this file: a stair's `facing` is
 * the direction of its high half, so a bank against the north wall faces north
 * and the sitter looks south, into the ring.
 */
function seatFacing(
  it: LocalRect,
  x: number,
  z: number,
): "north" | "south" | "east" | "west" {
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
 * A **tent post** — the pack's vertical accent, capped short of the ceiling.
 *
 * Rule 3 as one function: a stack that reaches the boards is
 * `interior.blocked_column` however handsome it is, so a post here is written
 * to `headroomOf(ctx) - 1` and never further. Two courses is the floor — a post
 * shorter than a body does not read as a post at all — so on a storey with no
 * room for one, nothing is written and the caller carries on.
 *
 * Returns whether it stood, because a caller ranking a pair wants to know.
 */
function tentPost(ctx: FitOutContext, c: PropCounter, x: number, z: number, log: string): boolean {
  const head = headroomOf(ctx);
  if (head < 3) return false;
  if (!c.put1(x, z, log, { axis: "y" })) return false;
  for (let y = 2; y <= head - 1; y++) c.stack(x, z, y, log, { axis: "y" });
  return true;
}

/**
 * The **hearth** under the crown ring: a bedded glow with dressed stone either
 * side of it.
 *
 * `glowstone` and never `campfire`: a lit fire is a fire the physics lint has
 * opinions about, and a full cube bedded between full cubes has no support rule
 * to fail. The stones either side are what make it read as a fire ring rather
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

/* -------------------------------------------------------------------------- */
/* the felt dome                                                               */
/* -------------------------------------------------------------------------- */

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: RebuildPlan): void {
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
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one: a
 * position-derived integer hash is the idiom every earlier wave uses, it is a
 * pure function, and `Math.imul` is exactly specified where `Math.pow` is not.
 */
function steppeJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * **Felt** — the pack's one material argument.
 *
 * A ger's skin is pressed sheep's wool over a lattice, lashed down with hair
 * rope, and no palette symbol in the grammar spells that: the theme's timber
 * and stone are what the *frame* is made of. So the cloth is named outright as
 * a **substance** rather than drawn from the palette, exactly as the
 * Mesoamerican pack names `mossy_stone_bricks` and `moss_block`: white wool
 * mostly, one cell in nine grey where the felt has weathered, one in nine the
 * brown of the lashings. Theme-independent on purpose — felt is felt in
 * boreal pine and in sun clay alike.
 */
function feltCloth(): (x: number, y: number, z: number) => string {
  return (x, y, z) => {
    const draw = steppeJitter(x, y, z, 9);
    if (draw === 0) return "light_gray_wool";
    if (draw === 1) return "brown_terracotta";
    return "white_wool";
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
 *
 * It is a *closure*, not a fix: it holds for a hanger this pack never placed,
 * in a shape somebody adds next year.
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
 * **The felt dome**, and the pack's whole silhouette argument.
 *
 * A ger is a *round* building: a lattice wall, a ring of roof poles leaning in,
 * and the **crown ring** — the *toono* — open at the top of them. A hip roof on
 * one is a cottage with a funny hat, which is precisely the failure the pack
 * exists to fix.
 *
 * Built the way the Mesoamerican temazcal's shoulder is built, and for the same
 * reason: **filled discs stepping in**, each standing on the filled disc below
 * it. A dome written as a ring per course leaves its outermost cells with air
 * below and beside them, which is `floating.isolated`; a hollow dome is a
 * sealed pocket besides. The lid under it (rule 7) gives the room a ceiling and
 * gives the first disc a floor.
 *
 * The last two courses come out in the theme's own timber rather than in felt:
 * that is the crown ring, and it is the one part of a ger a photograph is
 * always of.
 *
 * Silently does nothing on an envelope with no room above the plate — a fit-out
 * that insisted would be arguing with the shell.
 */
function feltDome(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  const felt = feltCloth();
  const wall = wallPlan(ctx);

  // The wall skin: the same felt, over the lattice, from the ground to the
  // plate. Doors, glass and anything with a support rule are left alone.
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, felt);

  if (plan === null) {
    guardHangers(ctx, c);
    return;
  }

  clearRoof(ctx, plan);

  // Rule 7: the lid first — a ceiling for the room and a floor for the dome.
  const lidBlock = ctx.style["roof.solid"] as string;
  const board = ctx.style["floor.interior"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      c.raw(x, plan.base, z, steppeJitter(x, plan.base, z, 5) === 0 ? board : lidBlock);
    }
  }

  // The dome: filled discs, stepping in, each on the one below it.
  const cx = (plan.sx - 1) / 2;
  const cz = (plan.sz - 1) / 2;
  const r0 = Math.min(cx, cz);
  const crown = ctx.style["wall.accent"] as string;
  for (let y = plan.base + 1; y <= plan.top; y++) {
    const radius = r0 - (y - plan.base - 1) * 0.85;
    if (radius < 0.5) break;
    for (let z = 0; z < plan.sz; z++) {
      for (let x = 0; x < plan.sx; x++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz > radius * radius) continue;
        c.raw(x, y, z, radius < 1.6 ? crown : felt(x, y, z));
      }
    }
  }

  guardHangers(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* the ger                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `ger_round_tent` — the anchor of the pack, and the only building in it a
 * stranger will name out loud.
 *
 * Three things, and nothing else: the **felt dome** over it, the **hearth**
 * under the crown ring where the smoke goes out, and the **bed platform** — a
 * run of bottom slabs round the wall, which is bed, seat and table at once and
 * is what a ger has instead of rooms. The **chests** stand at the head, on the
 * honoured side away from the door, which is where a household actually keeps
 * them.
 *
 * Nothing stands in the middle of the floor except the fire, because the middle
 * of a ger is where everybody sits.
 */
function fitGer(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);

  feltDome(ctx, c);

  // The bed platform, round both long walls in bays.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if ((z - it.z0) % 3 === 2) continue; // the gap between two bays
      c.put1(x, z, slab, SLAB);
    }
  }

  // The hearth, under the crown, one row in from the head so the middle of the
  // room and the way in are both left alone.
  const fireZ = headZ === it.z0 ? Math.min(it.z0 + 2, it.z1) : Math.max(it.z1 - 2, it.z0);
  hearthAt(ctx, c, fireZ);

  // The chests, on the honoured side.
  c.put1(it.x0, headZ, "barrel", BARREL);
  c.put1(it.x1, headZ, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the khan's ger                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `khans_ger` — the ger organised round the **dais at the head**.
 *
 * The difference between this and the ordinary ger is one piece of furniture
 * and it is the whole building: the raised seat at the head, opposite the door,
 * with a banner post either side of it. Everything else is the ger's — the felt
 * dome, the fire — because a khan's ger *is* a ger, and a fit-out that made it
 * something else would be arguing with the note.
 *
 * The dais is a course of slabs rather than of full blocks: a body can stand on
 * a bottom slab, so the head of the room stays walkable and the seat is still
 * visibly raised.
 */
function fitKhansGer(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const seat = style["stair.interior"] as string;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);
  const look = headZ === it.z0 ? "north" : "south";

  feltDome(ctx, c);

  // The dais, a course of slabs across the head.
  for (let x = it.x0; x <= it.x1; x++) c.put1(x, headZ, slab, SLAB);

  // The seat itself, on the row in front of the dais — which is where a chair
  // on a dais actually is — and the two banner posts either side of it.
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const midX = bayOn(ctx, front, 1) ?? bayOn(ctx, front, 0);
  if (midX !== null && front >= it.z0 && front <= it.z1) {
    c.put1(midX, front, seat, { facing: look, half: "bottom", shape: "straight" });
    for (const x of [midX - 2, midX + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      tentPost(ctx, c, x, front, log);
    }
  }

  // The fire, between the seat and the door.
  const fireZ = Math.floor((it.z0 + it.z1) / 2);
  hearthAt(ctx, c, fireZ);

  // The tribute chests, at the door end where a guest sets them down.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the cart ger                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `cart_ger` — the ger that never comes down.
 *
 * The heavy wagon-borne tent the sources describe with twenty-two oxen in front
 * of it: the same felt dome, standing on a **cart bed**. So the fit-out is the
 * bed and its running gear — a plank deck of slabs down both walls, the **axle
 * logs** laid across the floor at the two ends and the **drawbar** at the head
 * — and the room itself deliberately sparse, because everything in a travelling
 * house is lashed down.
 *
 * The wheels are not written. A wheel standing proud of the footprint is a cell
 * in the apron with nothing under it, which is `floating.isolated` in its
 * oldest clothes; the axles carry the read at floor level where a body can see
 * them.
 */
function fitCartGer(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  feltDome(ctx, c);

  // The cart bed: plank decking down both walls, in bays.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if ((z - it.z0) % 4 === 3) continue;
      c.put1(x, z, slab, SLAB);
    }
  }

  // The axle logs, across the floor at the two ends of the bed.
  for (const z of [it.z0, it.z1]) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      if ((x - it.x0) % 2 === 0) continue;
      c.put1(x, z, log, { axis: "x" });
    }
  }

  // The drawbar at the head, and the lashed cargo by the way in.
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, log, { axis: "z" });
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the kumis tent                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `kumis_tent` — fermented mare's milk, and the loudest building in a camp.
 *
 * Kumis is made by pouring the milk into a hide bag and beating it a thousand
 * times a day with a wooden plunger, so the room is three things: the **churns**
 * ranked down one wall (`cauldron`, which takes no properties), the **skin
 * bags** hung on a rail over them, and the **stirring post** at the head with
 * the barrels of the finished drink beside it.
 *
 * The rail is at head height and no lower, because `iron_bars` is a
 * body-blocking block and a bag at chest height is a bag nobody can walk past.
 */
function fitKumisTent(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);

  feltDome(ctx, c);

  // The churns down one wall, with the barrels of finished kumis between them.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 2 === 1) c.put1(it.x0, z, "cauldron");
    else c.put1(it.x0, z, "barrel", BARREL);
  }

  // The skin bags, hung on the rail over the churns.
  railOn(ctx, c, it.x0, BARS_Z);

  // The stirring post at the head, and the milk pails opposite the churns.
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) tentPost(ctx, c, bay, headZ, log);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x1, z, "cauldron");
  }
}

/* -------------------------------------------------------------------------- */
/* the horse line                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `horse_line` — the picket, and not a stable.
 *
 * The distinction is the whole reason this archetype exists rather than
 * reaching for the founding table's `stable`: a steppe horse is never stalled.
 * It is tied to a **line strung between posts** in the open, and the building
 * round it is at most a windbreak. So the fit-out is **posts and a rail** down
 * both walls with the **troughs** in the bays between them, and the middle of
 * the floor left completely bare because that is where the horses stand.
 *
 * The posts are fence blocks rather than logs: a fence is not a full cube, so a
 * picket line is a thing you can see through, which is the point of it.
 */
function fitHorseLine(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const headZ = headRow(ctx);

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 1) c.put1(x, z, fence, POST);
      else if ((z - it.z0) % 3 === 2) c.put1(x, z, "cauldron");
    }
    // The line itself, strung between the posts' heads.
    railOn(ctx, c, x, BARS_Z);
  }

  // The fodder at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, "hay_block", { axis: "y" });
  }
}

/* -------------------------------------------------------------------------- */
/* the felt works                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `felt_workshop` — where the camp's walls are made.
 *
 * Felt is not woven: the wool is laid out, soaked, rolled round a pole and
 * dragged behind a horse until it mats. So the room is the **bales** stacked up
 * on a slab plinth off the damp floor, the **rolling frame** overhead, the
 * **wetting vats** under it and the **sorting table** across the head.
 *
 * The bales are wool by name — the one place in the pack where the *product*
 * rather than the frame decides the block — and they stand on the plinth rather
 * than on the floor, which is the same argument the Norse stabbur makes about
 * grain.
 */
function fitFeltWorkshop(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The plinth down one wall, and the bales up on it.
  plinth(ctx, c, it.x0, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x0, z, 2, steppeJitter(z, 0, 0, 3) === 0 ? "light_gray_wool" : "white_wool");
    }
  }

  // The wetting vats down the other wall, with the rolling frame over them.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x1, z, "cauldron");
  }
  railOn(ctx, c, it.x1, BARS_Z);

  // The sorting table across the head, in bays so it is not a wall of slab.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
}

/* -------------------------------------------------------------------------- */
/* the bowyer                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `bowyer_tent` — the composite bow, which takes a year to make and is the one
 * technology the whole steppe is organised around.
 *
 * Horn, wood and sinew, glued and left to cure, so the room is **racks** — bars
 * overhead on both walls, where the staves season — the **bench** down one wall
 * under them, the **glue pot** at the head and the **barrels of horn** by the
 * way in. Nothing stands in the middle: a bowyer's floor is where the stave
 * gets bent.
 */
function fitBowyerTent(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The seasoning racks, both walls, at head height.
  railOn(ctx, c, it.x0, BARS_Z);
  railOn(ctx, c, it.x1, BARS_Z);

  // The bench down one wall, in bays.
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x0, z, slab, SLAB);
  }

  // The glue pot at the head, and the horn by the way in.
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, "cauldron");
  c.put1(it.x1, doorEnd, "barrel", BARREL);
  c.put1(it.x1, headZ, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the caravan halt                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `caravan_rest` — the halt beside a track, and the plainest room in the pack.
 *
 * Not a caravanserai: that is the trade wave's walled masonry courtyard and it
 * keeps every spelling of the word. This is the thing a track actually has one
 * of every day's ride — an open-sided shelter with the **cargo** stacked clear
 * of the ground down both walls, **water** by the way in and **fodder** at the
 * head. The middle of the floor is bare, because that is where a body carrying
 * a pack has to walk.
 */
function fitCaravanRest(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The plinth down both walls, and the cargo standing on it in bays.
  for (const x of [it.x0, it.x1]) plinth(ctx, c, x, slab, headZ);
  if (head >= 3) {
    for (const x of [it.x0, it.x1]) {
      for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
        if ((z - it.z0) % 3 !== 1) continue;
        c.stack(x, z, 2, "barrel", BARREL);
      }
    }
  }

  // The fodder at the head, and the water by the way in.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, "hay_block", { axis: "y" });
  }
  const bay = bayOn(ctx, doorEnd, 0);
  if (bay !== null) c.put1(bay, doorEnd, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the wrestling ground                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `wrestling_ground` — the *bökh* ring, and the one building here whose content
 * is the **absence** of content.
 *
 * The floor is the point: trodden flat and completely bare, because two men are
 * about to fall over on it. So the fit-out is entirely round the edge — a **low
 * bank** of stairs against all four walls with their backs to the wall, so the
 * camp sits looking in, the **judges' posts** flanking the head, and the
 * **prize barrels** by the way in.
 *
 * The bank runs in bays with a gap between them: a solid run against a wall is
 * a second wall, and the gaps are also what keeps the wall row itself steppable
 * at intervals.
 */
function fitWrestlingGround(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, seat, {
        facing: seatFacing(it, x, z),
        half: "bottom",
        shape: "straight",
      });
    }
  }

  // The judges' posts, flanking the head of the ring.
  const bay = bayOn(ctx, headZ, 2);
  if (bay !== null) {
    tentPost(ctx, c, bay - 2, headZ, log);
    tentPost(ctx, c, bay + 2, headZ, log);
  }

  // The prizes, by the way in.
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the watch platform                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `watch_platform_steppe` — the raised lookout over open grass.
 *
 * The platform's *shape* is the shell's and this file never argues with it.
 * What a lookout floor needs is four things: the **rail** round the edge (fence
 * posts at intervals, never a solid run, because a solid run is a second wall
 * and a lookout has to be able to see thirty miles), the **signal brazier**
 * bedded in stone at the head, the **horn rack** overhead where the alarm hangs,
 * and the **middle left completely clear** for the ladder well the shell cuts.
 *
 * `flat` is the roof for exactly this reason: a lookout has a deck, not a
 * ridge.
 */
function fitWatchPlatform(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The rail: posts at intervals round the ring, never a solid run.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      if (z === headZ) continue;
      c.put1(x, z, fence, POST);
    }
  }

  // The brazier at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) {
    if (c.put1(bay, headZ, "glowstone") && head >= 3) c.stack(bay, headZ, 2, stone);
    for (const x of [bay - 1, bay + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, headZ, stone);
    }
  }

  // The horn rack, overhead on one wall, and the watch's stores in the corner
  // furthest from the fire.
  railOn(ctx, c, it.x1, BARS_Z);
  const far = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, far, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the borts rack                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `borts_rack` — air-dried beef, and the reason a camp can cross a desert.
 *
 * *Borts* is meat cut into strips along the grain and hung in the shade until
 * it is hard as wood. The distinction from the Nordic pack's `drying_rack_yard`
 * is not decoration: that one is split cod hung **vertically** off a shore
 * frame, outdoors, as a prop; this is beef laid along **horizontal poles**
 * inside a dark room, and the two share no word.
 *
 * The poles run down both walls at the **top of the storey** and the strips
 * hang one course under them — and only when the storey has four courses to
 * give, because a strip at `y = 2` is a strip in a body's face and `iron_bars`
 * is a body-blocking block. The **salting barrels** stand at one end and the
 * **cutting bench** across the head.
 */
function fitBortsRack(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The poles, both walls, at the top of the storey.
  railOn(ctx, c, it.x0, BARS_Z);
  railOn(ctx, c, it.x1, BARS_Z);

  // The strips, hanging one course under the poles — never below head height.
  if (head >= 4) {
    for (const x of [it.x0, it.x1]) {
      for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
        if ((z - it.z0) % 2 === 1) continue;
        c.stack(x, z, head - 1, "iron_bars", BARS_POST);
      }
    }
    // The cross pole between them, tying the frame together.
    const midX = Math.floor((it.x0 + it.x1) / 2);
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      c.stack(midX, z, head, "iron_bars", BARS_X);
    }
  }

  // The cutting bench across the head, and the salt at the far end.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the winter corral                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `winter_corral` — the *khashaa*, the one fixed thing a nomad household owns.
 *
 * A camp moves four times a year but the winter ground does not, and what
 * stands on it is a low enclosure of hurdles with a lean-to in one corner where
 * the weakest animals go. So the room is **hurdles** down one wall, the
 * **fodder** stacked on a plinth down the other so it never sits on frozen
 * ground, the **troughs** in the bays and the **lean-to shelf** across the head.
 *
 * Bare `corral` and bare `paddock` stay with the agrarian expansion's
 * `cattle_pen`, which is the better building for every document that writes
 * them; this one answers to `winter_corral`, `winter_pen` and `stock_shelter`.
 */
function fitWinterCorral(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The hurdles down one wall, in bays so the run is not a second wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x0, z, fence, POST);
    else c.put1(it.x0, z, "cauldron");
  }

  // The plinth and the fodder down the other: hay never on frozen ground.
  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "hay_block", { axis: "y" });
    }
  }

  // The lean-to shelf across the head, in bays.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
}
