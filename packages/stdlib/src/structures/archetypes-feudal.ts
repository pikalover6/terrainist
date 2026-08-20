/**
 * The **feudal_japanese pack's buildings** — the thirteen entries of that pack
 * which have an inside rather than a footprint on the bare ground.
 *
 * ## The thesis
 *
 * "A samurai castle town", "a Sengoku village", "an Edo street" all route to
 * the `medieval` era and arrive as a European market town in oak and cobble.
 * The *palette* was never the problem — dark oak, spruce and the quartz family
 * have shipped since the founding waves — the missing thing is the **noun set**.
 * A castle town under a keep is a white keep on a stone batter, a terrace of
 * shop-houses down the highway, a five-storey pagoda, a vermilion gate on the
 * shrine approach, a training hall, a hot-spring bathhouse, a stage for the
 * plays, a raked gravel court, a plastered rice store, a tea room the size of
 * four mats, a smith at the castle wall, a corner turret and a box gate. The
 * catalog could say none of those, and a Cotswold cottage rendered in dark oak
 * is still a Cotswold cottage.
 *
 * ## What this pack is NOT
 *
 * **It does not steal a word.** The east-asian pack got there first and took
 * the general ones: `torii`, `pagoda`, `zen_garden`, `tenshu_keep`,
 * `moon_gate`, `paifang`, `shoji_teahouse`, `stone_lantern`, `drum_tower`,
 * `spirit_wall`, `castle_base_wall` and `bell_pavilion` are all its, word for
 * word, and `machiya`, `tea_house`, `smithy`, `bathhouse`, `keep`, `castle`,
 * `granary`, `gatehouse` and `watchtower` are older tables' — and a member
 * belongs to one pack only. So this pack's anchor ships as `yamashiro_tenshu`,
 * its pagoda as `gojunoto_pagoda`, its torii as `sando_torii` and its terrace
 * as `machiya_shop_row`. The negative sweep that found those taken is the
 * reason every id here is a compound of a word — `yamashiro`, `gojunoto`,
 * `sando`, `dojo`, `onsen`, `noh`, `karesansui`, `kura`, `chashitsu`, `kaji`,
 * `yagura`, `masugata`, `nagaya` — that no table in the catalog has ever
 * claimed.
 *
 * The thirteen:
 *
 * - `yamashiro_tenshu` — the anchor: the keep, its walls read bottom to top as
 *   a **stone batter** under white plaster under a dark timber band under a
 *   tiled course, with the pillar rows, the lord's dais and the paper-screen
 *   rhythm inside;
 * - `machiya_shop_row` — the shop-house terrace: counters to the street, the
 *   noren cloth over head height and the stores at the back;
 * - `gojunoto_pagoda` — the five-storey pagoda: **each roof tier a filled
 *   slab-topped disc** stepping in, every tier standing on the tier below, with
 *   the sorin mast unbroken on the crown;
 * - `sando_torii` — the shrine approach: **one** vermilion arch bay with the
 *   gravel of the sando running away from it;
 * - `dojo_hall` — the training hall: the weapon racks, the mat bays and the
 *   master's seat at the head;
 * - `onsen_bathhouse` — the hot spring: a **curbed sunken basin**, claimed
 *   before a drop is poured, with the wash benches round it;
 * - `noh_stage` — the stage: the pine-panel back wall, the boarded platform and
 *   the seat rows looking at it;
 * - `karesansui_court` — the dry garden: raked bands written into the floor
 *   plane, the standing stones set among them and the veranda round the edge;
 * - `kura_storehouse` — the rice store: plastered, up on stone stilts, dark;
 * - `chashitsu_teahouse` — the tea room: four mats, a shelf, a cold hearth
 *   alcove and one lamp;
 * - `kaji_forge` — the smith at the castle wall: the quench trough, the cold
 *   furnace and the stock ranked on plinths;
 * - `yagura_watchtower` — the corner turret: the alarm bell, **hung directly
 *   under a solid cap**, with the pull rope in the column beside it;
 * - `masugata_gate` — the box gate: one arch bay with **four courses of
 *   headroom under the lintel**, and the guard's counter beside it.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it.
 *
 * Eleven of the thirteen do **no exterior work at all**. The exceptions are the
 * **keep's batter** — a re-clad of the wall ring between the ground and the
 * eave plate, which touches no course above it and therefore strands nothing —
 * and the **pagoda's tiers**, which are built the way the Mesoamerican pack's
 * temazcal, the steppe pack's ger, the Atlantean oracle and the Himalayan
 * chorten are built and for the same reason: **filled discs stepping in**, each
 * standing on the filled disc below it. A tier built as a ring per course is
 * `floating.isolated` waiting to happen, and a hollow one is a sealed pocket
 * besides.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Every interior block goes through {@link PropCounter}**, which routes
 *    through the ground floor's own `free` and `take` — the door approach, the
 *    stair columns, the **hearth reserve** the shell keeps for its campfire, the
 *    connectivity guard and the blocked-column guard, none of them restated
 *    here. `raw` appears only above the eave plate and in the floor plane a
 *    basin's rim or the dry garden's raking is written in.
 * 2. **Every pool is curb-closed and stable.** The water goes **into the
 *    floor** at `y = 0`, in a rect inset at least one cell from the interior on
 *    every side, and every floor cell touching it is written solid. The cells
 *    are claimed through `take` **before a drop is written**, so a bath that
 *    would strand part of the room is refused outright rather than drowned.
 * 3. **Nothing is a pillar.** A stack filling an interior column floor to
 *    ceiling is `interior.blocked_column`, which is why every column here is
 *    written with {@link headroomOf} in hand rather than at a fixed height.
 * 4. **An arch owes four courses.** A lintel landing on {@link columnTop} on a
 *    three-course storey lands at course 2, and a gate a body cannot walk under
 *    is a wall across the room — `traversal.unreachable`, found by the
 *    terrarium on the Himalayan pack's own gatehouse. Below four courses the
 *    room simply has no arch.
 * 5. **`iron_chain`, never `chain`.** `chain` is not in the pinned 1.21.11
 *    block table; `iron_chain` is. Every chain in this file has a cap course
 *    directly above it and **nothing hangs under it**: `attachment: ceiling`
 *    demands a FULL CUBE above, and a chain is not one. That is the tide-bell
 *    lesson, banked — and it is why the turret hangs its bell *directly* under
 *    the cap and puts the rope in the column beside it.
 * 6. **The glow is `glowstone`, bedded.** The andon lamp of this pack is a full
 *    cube standing on the floor with solid neighbours either side, so neither
 *    the lint's lantern rule (its name does not end `lantern` in the first
 *    place) nor `floating.isolated` has anything to say. No `campfire`, no
 *    fire, nothing written `lit: "true"` — the shell's own hearth is the room's
 *    fire, and a fit-out that lit a second one would be arguing with it.
 * 7. **No `mud`, no `snow`, no bare `gravel` off the floor plane.** All three
 *    are partial or falling blocks; the plaster is the quartz family and the
 *    stone is the deepslate family, all of them full cubes.
 * 8. **No sign blocks**, no bare `flower_pot`, no `farmland`.
 * 9. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same
 *    castle town forever.
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
export const FEUDAL_BUILDING_ARCHETYPES = [
  "yamashiro_tenshu",
  "machiya_shop_row",
  "gojunoto_pagoda",
  "sando_torii",
  "dojo_hall",
  "onsen_bathhouse",
  "noh_stage",
  "karesansui_court",
  "kura_storehouse",
  "chashitsu_teahouse",
  "kaji_forge",
  "yagura_watchtower",
  "masugata_gate",
] as const;

/** One of the archetypes this file fits out. */
export type FeudalBuildingArchetype = (typeof FEUDAL_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isFeudalArchetype(value: string): value is FeudalBuildingArchetype {
  return (FEUDAL_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted with the other pack tables, above the greedy general tables. The
 * **non-claims** are the load-bearing half of this comment, because the
 * east-asian pack already speaks most of this vocabulary:
 *
 * - **bare `tenshu_keep`, `keep`, `castle` and `donjon` are NOT ours** — the
 *   east-asian pack's and the garrison wave's, word for word. Ours answers to
 *   `yamashiro_tenshu`, `yamashiro` and `yamashiro_keep`, `yamashiro` being a
 *   word no table in the catalog has ever had;
 * - **bare `machiya`, `shop_row`, `terraced_row` and `tudor_row` are not
 *   ours** — the east-asian and vernacular waves'. The terrace answers to
 *   `machiya_shop_row`, `machiya_terrace` and `nagaya_row`;
 * - **bare `pagoda` is not ours** — an older table's. The five-storey answers
 *   to `gojunoto_pagoda`, `gojunoto` and `five_storied_pagoda`;
 * - **bare `torii`, `moon_gate`, `paifang` and `shrine` are not ours** — the
 *   east-asian pack's and the faith wave's. The approach answers to
 *   `sando_torii`, `sando` and `sando_gate`;
 * - **bare `tea_house`, `teahouse` and `shoji_teahouse` are not ours** — the
 *   works and east-asian waves'. The tea room answers to `chashitsu_teahouse`,
 *   `chashitsu` and `chashitsu_room`;
 * - **bare `bathhouse`, `stone_bath_house`, `salt_bath_terme` and
 *   `temazcal_bath` are not ours.** The hot spring answers to
 *   `onsen_bathhouse`, `onsen` and `onsen_bath`;
 * - **bare `zen_garden`, `courtyard` and `botanical_garden` are not ours** —
 *   the east-asian pack's and older waves'. The dry garden answers to
 *   `karesansui_court`, `karesansui` and `raked_gravel_court`;
 * - **bare `granary`, `mudbrick_granary`, `staddle_granary` and `stilt_granary`
 *   are not ours** — the founding table's, the Nile pack's, the agrarian
 *   expansion's and the Himalayan pack's. The rice store answers to
 *   `kura_storehouse`, `kura` and `rice_kura`;
 * - **bare `smithy`, `great_forge`, `norse_forge` and `workshop` are not
 *   ours** — the founding table's, the dwarven and Norse packs'. The smith
 *   answers to `kaji_forge`, `kaji` and `kaji_smithy`;
 * - **bare `watchtower`, `tower`, `palisade_watchtower` and `drum_tower` are
 *   not ours.** The turret answers to `yagura_watchtower`, `yagura` and
 *   `yagura_turret`;
 * - **bare `gate`, `gatehouse`, `arch`, `city_gate`, `caravan_gatehouse` and
 *   `kora_gatehouse` are not ours** — the city gate's, the triumphal arch's and
 *   the caravan and Himalayan packs'. The box gate answers to `masugata_gate`,
 *   `masugata` and `masugata_gatehouse`;
 * - **bare `hall`, `town_hall`, `dance_hall` and `guildhall` are not ours.**
 *   The training hall answers to `dojo_hall`, `dojo` and `kendo_dojo`;
 * - **bare `theatre`, `amphitheater` and `bandstand` are not ours** — the
 *   leisure and spectacle waves'. The stage answers to `noh_stage`, `noh` and
 *   `noh_butai`.
 *
 * Every claim below is therefore either a compound of this pack's own ids or a
 * word (`yamashiro`, `nagaya`, `gojunoto`, `sando`, `dojo`, `kendo`, `onsen`,
 * `noh`, `butai`, `karesansui`, `kura`, `chashitsu`, `kaji`, `yagura`,
 * `masugata`) that no table in the catalog has ever claimed.
 */
export function feudalArchetypeOfTags(tags: readonly string[]): FeudalBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("yamashiro_tenshu") || has("yamashiro") || has("yamashiro_keep")) {
    return "yamashiro_tenshu";
  }
  if (has("machiya_shop_row") || has("machiya_terrace") || has("nagaya_row")) {
    return "machiya_shop_row";
  }
  if (has("gojunoto_pagoda") || has("gojunoto") || has("five_storied_pagoda")) {
    return "gojunoto_pagoda";
  }
  if (has("sando_torii") || has("sando") || has("sando_gate")) return "sando_torii";
  if (has("dojo_hall") || has("dojo") || has("kendo_dojo")) return "dojo_hall";
  if (has("onsen_bathhouse") || has("onsen") || has("onsen_bath")) return "onsen_bathhouse";
  if (has("noh_stage") || has("noh") || has("noh_butai")) return "noh_stage";
  if (has("karesansui_court") || has("karesansui") || has("raked_gravel_court")) {
    return "karesansui_court";
  }
  if (has("kura_storehouse") || has("kura") || has("rice_kura")) return "kura_storehouse";
  if (has("chashitsu_teahouse") || has("chashitsu") || has("chashitsu_room")) {
    return "chashitsu_teahouse";
  }
  if (has("kaji_forge") || has("kaji") || has("kaji_smithy")) return "kaji_forge";
  if (has("yagura_watchtower") || has("yagura") || has("yagura_turret")) {
    return "yagura_watchtower";
  }
  if (has("masugata_gate") || has("masugata") || has("masugata_gatehouse")) return "masugata_gate";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * Most of the pack takes **`hip`**, and that is the pack's exterior argument in
 * one word: the hipped tiled roof with its four falls is the silhouette of the
 * whole vernacular, from the keep down to the gate. The pagoda takes `hip` too
 * and for a second reason — it is the shape that leaves the deepest gap between
 * the eave plate and the height allowance, and that gap is where the tiers and
 * the mast are built. The store and the forge take `gable`, because a working
 * shed sheds its load off a ridge, and the dry garden takes `flat`, because a
 * garden court is roofed by the sky.
 *
 * The window rhythms carry the rest. The shop row, the training hall and the
 * stage are `regular` — a paper-screen wall is mostly opening — the store, the
 * forge and the tea room are `none`, because rice, smoke and a tea ceremony all
 * want the dark, and the rest are `sparse`.
 */
export function feudalFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "yamashiro_tenshu":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    case "machiya_shop_row":
      return { windowShape: "wide", windowRhythm: "regular", roof: "hip" };
    case "gojunoto_pagoda":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "sando_torii":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "dojo_hall":
      return { windowShape: "wide", windowRhythm: "regular", roof: "hip" };
    case "onsen_bathhouse":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "hip" };
    case "noh_stage":
      return { windowShape: "wide", windowRhythm: "regular", roof: "hip" };
    case "karesansui_court":
      return { windowShape: "wide", windowRhythm: "regular", roof: "flat" };
    case "kura_storehouse":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "chashitsu_teahouse":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "kaji_forge":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "yagura_watchtower":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "masugata_gate":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
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
export function furnishFeudal(ctx: FitOutContext): number {
  if (!isFeudalArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "yamashiro_tenshu":
      fitYamashiroTenshu(ctx, c);
      break;
    case "machiya_shop_row":
      fitMachiyaShopRow(ctx, c);
      break;
    case "gojunoto_pagoda":
      fitGojunotoPagoda(ctx, c);
      break;
    case "sando_torii":
      fitSandoTorii(ctx, c);
      break;
    case "dojo_hall":
      fitDojoHall(ctx, c);
      break;
    case "onsen_bathhouse":
      fitOnsenBathhouse(ctx, c);
      break;
    case "noh_stage":
      fitNohStage(ctx, c);
      break;
    case "karesansui_court":
      fitKaresansuiCourt(ctx, c);
      break;
    case "kura_storehouse":
      fitKuraStorehouse(ctx, c);
      break;
    case "chashitsu_teahouse":
      fitChashitsuTeahouse(ctx, c);
      break;
    case "kaji_forge":
      fitKajiForge(ctx, c);
      break;
    case "yagura_watchtower":
      fitYaguraWatchtower(ctx, c);
      break;
    case "masugata_gate":
    default:
      fitMasugataGate(ctx, c);
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
 * second would put its bell through somebody's floor. Wave 3B's number,
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

/** A bottom slab: the bench top, the plinth, the veranda and the kerb. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a screen, a weapon rack, a drying rod. */
const BARS_Z = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
} as const;

/** A vertical link of `iron_chain` — the one hanger this pack uses. */
const CHAIN_Y = { axis: "y", waterlogged: "false" } as const;

/** A source block of water, sunk into the floor plane. */
const WATER = { level: "0" } as const;

/* -------------------------------------------------------------------------- */
/* the substances                                                              */
/* -------------------------------------------------------------------------- */

/**
 * **The castle town's five substances**, named outright rather than drawn from
 * the palette — exactly as the Mesoamerican pack names `mossy_stone_bricks`,
 * the steppe pack names its felt and the Himalayan pack names its whitewash.
 * The theme's stone is what the *frame* is made of, and no palette symbol in
 * the grammar spells "white plaster between a dark timber frame".
 *
 * All five are full cubes, which is rule 7 applied to a wall.
 */
/** The batter: the sloped stone base a keep stands on. */
const BATTER = "polished_deepslate";
/** The plaster: `smooth_quartz`, the whitest workable full cube in the table. */
const PLASTER = "smooth_quartz";
/** The plaster's grain — one block in nine, so the wall is not a flat sheet. */
const PLASTER_GRAIN = "quartz_block";
/** The dark timber of the frame, the posts and the band under the eave. */
const TIMBER = "dark_oak_planks";
/** The tile: the dark fired course the roofs and the eave band are read by. */
const TILE = "deepslate_tiles";
/** The vermilion of a torii and a shrine rail. */
const VERMILION = "red_terracotta";

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
 * the dais, the furnace, the bell — must not vanish because the one cell it
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
 * A **column** of dark timber over a stone foot, capped short of the ceiling.
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
 * **ONE ARCH BAY, with four courses of headroom or none at all.**
 *
 * Rule 4 as one function, and the whole of the Himalayan gatehouse's scar
 * written down again: the lintel lands on {@link columnTop}, so on a
 * three-course storey it lands at course 2 — a gate a body cannot walk under
 * and, because the lintel spans the whole bay, a wall across the room that
 * strands everything past it. Four courses is the first storey with room for a
 * body under the lintel, so below it the room simply has no arch.
 *
 * **One** bay and never two: two piers and a lintel read as a gate at a glance,
 * and a second bay behind the first cuts the room into segments with a column
 * at each end, which is exactly the kind of pocket that passes a connectivity
 * check and fails the lint's walk from the door.
 *
 * Returns the pier columns actually stood — two, or none.
 */
function archBay(
  ctx: FitOutContext,
  c: PropCounter,
  z: number,
  pier: string,
  lintel: string,
): readonly number[] {
  const it = ctx.interior;
  if (z <= it.z0 || z >= it.z1) return [];
  if (headroomOf(ctx) < 4) return [];
  const bay = bayOn(ctx, z, 2) ?? bayOn(ctx, z, 0);
  if (bay === null) return [];
  const piers: number[] = [];
  for (const x of [bay - 2, bay + 2]) {
    if (x < it.x0 || x > it.x1) continue;
    if (column(ctx, c, x, z, pier)) piers.push(x);
  }
  if (piers.length !== 2) return [];
  const top = columnTop(ctx);
  for (let x = piers[0] as number; x <= (piers[1] as number); x++) c.stack(x, z, top, lintel);
  return piers;
}

/**
 * The **andon lamp** — the pack's recurring wall ornament and its only glow.
 *
 * `glowstone` between two blocks of dark timber, all three at the floor course
 * against a wall. `glowstone` is a full cube standing on the shell's own floor
 * with a solid neighbour either side, so neither the lint's lantern rule (its
 * name does not end `lantern` in the first place) nor `floating.isolated` has
 * anything to say. Returns whether the glow landed.
 */
function andonLamp(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  const it = ctx.interior;
  const lit = c.put1(x, z, "glowstone");
  const along = z === it.z0 || z === it.z1;
  // The surround is tried **along the wall first and inward second**, and it
  // takes the first two cells that land rather than the two it wanted: on a
  // pillared wall the cells either side of a lamp are as often a post as they
  // are floor, and a lamp whose surround silently vanished is a bare glow cube
  // stuck to a wall.
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
    if (c.put1(nx, nz, TIMBER)) laid++;
  }
  return lit;
}

/**
 * A **paper screen** of `iron_bars` down one wall, at the top of the storey.
 *
 * Head height and no lower, always: `iron_bars` is a body-blocking block to the
 * physics lint, so a screen at `y = 2` is a screen through somebody's face and
 * the cell under it stops being walkable. Nothing happens at all on a storey
 * with no room for one.
 */
function screenOn(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  props: Record<string, string>,
): void {
  const it = ctx.interior;
  const head = headroomOf(ctx);
  if (head < 3) return;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(x, z, head, "iron_bars", props);
}

/**
 * A **veranda** of bottom slabs down one wall, in bays — the engawa.
 *
 * Bottom slabs, not full blocks: a body stands on a bottom slab, so a run down
 * a wall is furniture rather than a second wall, and the bays keep the wall row
 * steppable at intervals besides.
 */
function engawa(ctx: FitOutContext, c: PropCounter, x: number, slab: string, skipZ: number): void {
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
function feudalJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * The **noren** colours — the shop cloth of a machiya street, in full cubes.
 *
 * Wool rather than banner blocks: a banner is a block entity this fit-out
 * cannot carry and an attachable besides, and the whole point of the pack's
 * colour is that it is a thing you can stack against a wall.
 */
const CLOTH = ["blue_wool", "white_wool", "red_wool", "brown_wool", "black_wool"] as const;

/** One cloth block, drawn from position. */
function clothAt(x: number, z: number): string {
  return CLOTH[feudalJitter(x, 2, z, CLOTH.length)] as string;
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
 * riad's courtyard basin, the caravan cistern's, the Himalayan trough's and the
 * science pack's pond, unchanged:
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
 *   so no later `put1` in this file can ever stand a bench on the water.
 *
 * Returns whether the basin was built. `false` is a perfectly good answer — a
 * bathhouse you have to wade across is a pond.
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
  if (!ctx.take(cells, BATTER)) return false;

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
/* the exterior work                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The Mesoamerican pack's plan in every respect, restated rather than imported
 * for the reason that pack restated the Nile's.
 */
interface FeudalPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
}

/** The plan for work on the walls: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): FeudalPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return { sx, sz, base: ctx.wallTop + 1, top: ctx.roofTop + ROOF_FLOURISH_RISE };
}

/** The plan for a roof rebuild: a wall plan that also has room to build in. */
function roofPlan(ctx: FitOutContext): FeudalPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: FeudalPlan): void {
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
 * The Mesoamerican pack's list unchanged: the way in, the way up, **the shell's
 * own hearth**, the glass and anything the physics lint holds to a support rule.
 * `^campfire$` is in it for exactly the reason rule 1 gives — the shell drops a
 * campfire into any single-storey interior bigger than five by five, and a
 * re-clad that swallowed one would be a fit-out arguing with the hearth reserve.
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
  plan: FeudalPlan,
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
 * **THE BATTER** — the keep wall, read bottom to top.
 *
 * A tenshu wall is not one substance and that is the whole read: the bottom
 * third is the dark stone base (the batter, the part that would lean inward if
 * this grammar could lean), the middle is white plaster, and directly under the
 * eave plate comes the **dark timber band** with a single **tiled course** on
 * top of it. One tiled course and never more — the tile is the eave's shadow,
 * and a wall clad in it is a roof standing on end.
 *
 * Returns the block a wall cell should be, as a pure function of position, so
 * `reclad` can be handed it and the same document builds the same wall forever.
 */
function tenshuWall(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const plate = ctx.wallTop;
  const foot = Math.max(1, Math.floor(plate / 3));
  return (x, y, z) => {
    if (y >= plate) return TILE;
    if (y >= plate - 1) return TIMBER;
    if (y <= foot) return feudalJitter(x, y, z, 7) === 0 ? "cobbled_deepslate" : BATTER;
    return feudalJitter(x, y, z, 9) === 0 ? PLASTER_GRAIN : PLASTER;
  };
}

/**
 * **THE HANGER GUARD** — nothing this file writes may leave a hanging block
 * hanging from air.
 *
 * The Mesoamerican pack's closure, restated as code for the same reason it was
 * there: the shell hangs its lantern from the ceiling plane directly above it,
 * and **the tier rebuild deletes and re-lays the volume over that plane.**
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
 * **The pagoda's tiers and mast** — the pack's one silhouette argument.
 *
 * A five-storey pagoda is the single most recognisable object in this
 * vocabulary, and a hip roof on one is a cottage with a funny hat. Built the way
 * the temazcal's shoulder, the ger's crown, the Atlantean oracle's dome and the
 * chorten's are built, and for the same reason: **filled discs stepping in**,
 * each standing on the filled disc below it. A tier written as a ring per course
 * leaves its outermost cells with air below and beside them, which is
 * `floating.isolated`; a hollow tier is a sealed pocket besides.
 *
 * What makes it a *pagoda* rather than a dome is the **eave course**: every
 * other course is written a cell wider than the mass under it, in bottom slabs,
 * so the tier reads as a flared tiled roof with a body of wall under it. A slab
 * is not a full cube and the `floating.*` rule has nothing to say about one, but
 * it is written over the tier below all the same — an eave springing off nothing
 * is a brim in mid-air, whatever the rule thinks.
 *
 * On top of the crown stands the **sorin mast**: an unbroken column, tile at its
 * head, each course standing on the one below it. A mast with a gap in it is
 * four floating blocks and a stump.
 *
 * Silently does nothing on an envelope with no room above the plate — a fit-out
 * that insisted would be arguing with the shell.
 */
function pagodaTiers(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  const wall = wallPlan(ctx);

  // The wall skin: the plastered body of the pagoda over its dark stone foot.
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, tenshuWall(ctx));

  if (plan === null) {
    guardHangers(ctx, c);
    return;
  }

  clearRoof(ctx, plan);

  // The lid first — a ceiling for the room and a floor for the first tier.
  const lidBlock = ctx.style["roof.solid"] as string;
  const board = ctx.style["floor.interior"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      c.raw(x, plan.base, z, feudalJitter(x, plan.base, z, 5) === 0 ? board : lidBlock);
    }
  }

  // The tiers: filled discs, stepping in, each on the one below it, with the
  // flared eave course between them.
  const cx = (plan.sx - 1) / 2;
  const cz = (plan.sz - 1) / 2;
  const r0 = Math.min(cx, cz);
  let crown = plan.base;
  let lastRadius = r0;
  for (let y = plan.base + 1; y <= plan.top; y++) {
    const step = y - plan.base - 1;
    const radius = r0 - step * 0.7;
    if (radius < 0.5) break;
    const eave = step % 2 === 0;
    for (let z = 0; z < plan.sz; z++) {
      for (let x = 0; x < plan.sx; x++) {
        const dx = Math.abs(x - cx);
        const dz = Math.abs(z - cz);
        // A square disc, not a round one: a pagoda tier is a hipped roof over a
        // square plan, and Chebyshev distance is what a square reads as.
        if (Math.max(dx, dz) > radius) continue;
        const rim = Math.max(dx, dz) > radius - 1;
        if (eave && rim) {
          // The flare, in bottom slabs, standing on the mass below it.
          c.raw(x, y, z, ctx.style["roof.slab"] as string, SLAB);
          continue;
        }
        c.raw(x, y, z, feudalJitter(x, y, z, 6) === 0 ? TIMBER : TILE);
      }
    }
    crown = y;
    lastRadius = radius;
  }

  // **The mast, written last and unconditionally.** It stands on the crown of
  // the top tier, every course of it on the course below, and it ends in tile:
  // that is the sorin and its rings in the only blocks this grammar has for
  // them. A pagoda whose mast depended on how much roof allowance the shell
  // felt like giving it is a pagoda that is sometimes a shed.
  const mx = Math.round(cx);
  const mz = Math.round(cz);
  if (crown > plan.base && lastRadius >= 0.5) {
    c.raw(mx, crown, mz, TILE);
    for (let y = crown + 1; y <= plan.top + 2; y++) {
      const ring = y % 2 === 0 ? "cut_copper" : TILE;
      c.raw(mx, y, mz, y === plan.top + 2 ? "gold_block" : ring);
    }
  }

  guardHangers(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* the keep                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `yamashiro_tenshu` — the anchor, and the only building here a stranger will
 * name out loud.
 *
 * Outside, the **batter**: the wall ring re-clad from the ground to the plate,
 * dark stone at the foot, white plaster above it, the dark timber band under
 * the eave and one tiled course on top. That is the whole of this archetype's
 * exterior work — it touches **no course above the plate**, so nothing the shell
 * hung from its ceiling plane is stranded and the hanger guard has nothing to
 * do here.
 *
 * Inside, three things. The **pillar rows** — dark oak posts down both wall
 * rows at every other bay, capped short of the ceiling so no post is a pillar
 * through the room — the **paper screens** between their heads, and the **andon
 * lamps** bedded among them, which is where the pack's glow lives. And the
 * **lord's dais** across the head: a run of bottom slabs with the chiseled
 * quartz seat set into it.
 *
 * The middle of the floor is left untouched. The middle of an audience hall is
 * where the retainers sit, and it is where the shell reserves its hearth.
 *
 * Bare `tenshu_keep`, `keep`, `castle` and `donjon` all stay where they were.
 */
function fitYamashiroTenshu(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The batter, outside: ground to plate, and not one course above it.
  const wall = wallPlan(ctx);
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, tenshuWall(ctx));

  // The pillar rows, both walls, at every other bay, the screens between them.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      column(ctx, c, x, z, "dark_oak_log");
    }
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 4 === 1) c.put1(x, z, slab, SLAB);
      else if ((z - it.z0) % 4 === 3) andonLamp(ctx, c, x, z);
    }
    // The screen panel, at the top of the storey — over a body's head, where a
    // paper wall is looked through rather than walked into.
    if (head < 4) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 4 !== 1) continue;
      c.stack(x, z, head - 1, PLASTER);
    }
  }

  // The lord's dais across the head, with the seat set into it.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "chiseled_quartz_block");
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the shop-house terrace                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `machiya_shop_row` — the terrace of shop-houses, and the street the town is.
 *
 * A machiya is a shop at the front and a house behind it, and the read that
 * matters is the **counter**: a run of bottom slabs down one wall in bays, with
 * the **noren cloth** strung over head height above each bay, so a walker sees
 * a row of shopfronts down the length of the room. The **stores** go up on the
 * opposite plinth, and the **strongbox** stands at the back.
 *
 * Bare `machiya`, `shop_row`, `terraced_row` and `tudor_row` all stay where
 * they were.
 */
function fitMachiyaShopRow(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The counters down the street wall, in bays with a gap to be served at.
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === headZ) continue;
    const slot = (z - it.z0) % 3;
    if (slot === 2) continue; // the gap a customer stands in
    c.put1(it.x0, z, slot === 0 ? TIMBER : slab, slot === 0 ? undefined : SLAB);
  }
  // The noren over each shopfront, at the top of the storey.
  if (head >= 4) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 0) continue;
      c.stack(it.x0, z, head - 1, clothAt(it.x0, z));
    }
  }

  // The stores, up on the back plinth and never on a floor that gets swept.
  engawa(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "barrel", BARREL);
    }
  }

  // The shelf, the lamp and the strongbox at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the pagoda                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `gojunoto_pagoda` — the five-storey pagoda, and the pack's only roof rebuild.
 *
 * Outside it is the **tiers** — filled square discs stepping in over a plastered
 * body, with a flared slab eave every other course — and the **sorin mast**
 * standing unbroken on the crown.
 *
 * Inside it is the **relic plinth** at the head, the **seat ring** against both
 * walls with their backs to the wall so the room sits looking in, and the andon
 * lamp beside the plinth.
 *
 * Bare `pagoda` stays where it was.
 */
function fitGojunotoPagoda(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const headZ = headRow(ctx);

  pagodaTiers(ctx, c);

  // The ring of seats, in bays so no run is a second wall.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    }
  }

  // The relic plinth at the head — the room's one must-have, through
  // `standInRow` so it cannot vanish because its cell was the door's.
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "chiseled_quartz_block");
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the shrine approach                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `sando_torii` — the gate the shrine approach begins at.
 *
 * **One** vermilion arch bay, built through {@link archBay}, which is rule 4 in
 * a helper: four courses of headroom or no arch at all. The **sando** — the
 * approach — runs down one wall away from it as a run of bottom slabs with the
 * **guardian stones** set into it at intervals, kept to one side so the room's
 * own route is never on it, and the purification shelf and lamp stand at the
 * head.
 *
 * Bare `torii`, `moon_gate`, `paifang` and `shrine` all stay where they were.
 */
function fitSandoTorii(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  const archZ = headZ === it.z0 ? it.z0 + 2 : it.z1 - 2;
  archBay(ctx, c, archZ, VERMILION, VERMILION);

  // The sando down one wall, with the guardian stones set into it.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ || z === archZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x1, z, slab, SLAB);
    else if ((z - it.z0) % 3 === 2) c.put1(it.x1, z, "chiseled_deepslate");
  }

  // The purification shelf, the lamp and the offering box.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "cauldron");
  const lit = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (lit !== null) andonLamp(ctx, c, lit, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the training hall                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `dojo_hall` — the training hall, and the emptiest floor in the pack after the
 * tea room.
 *
 * The **weapon racks** are `iron_bars` at the top of one wall — head height and
 * no lower, because a rack at chest height is a rack somebody walks into — with
 * the **mat bays** of bottom slabs down both walls under them. The **master's
 * seat** is across the head with the lamp beside it.
 *
 * The middle of the floor is left clear, because the middle of a dojo is what a
 * dojo is for.
 *
 * Bare `hall`, `town_hall`, `dance_hall` and `guildhall` all stay where they
 * were.
 */
function fitDojoHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const seat = style["stair.interior"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue; // the way onto the floor
      if (slot === 0) c.put1(x, z, slab, SLAB);
      else c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    }
  }

  // The weapon racks, at the top of the storey over the mats.
  screenOn(ctx, c, it.x0, BARS_Z);

  // The master's seat and the lamp across the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), TIMBER);
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the bathhouse                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `onsen_bathhouse` — the hot spring, and the pack's loudest water claim.
 *
 * The **bath** is a curbed sunken basin, the biggest one in the pack: the water
 * goes into the floor plane, inset a cell from the interior on every side, and
 * **the cells are claimed through `take` before a drop is poured**, so a bath
 * that would strand part of the room is refused outright rather than drowned.
 *
 * Round it, the **wash benches** down one wall and the **buckets** down the
 * other, with the water jar and the lamp at the head. Nothing in the room is
 * lit: the shell's own hearth is the fire that heats it, and rule 6 says a
 * fit-out does not light a second one.
 *
 * Bare `bathhouse`, `stone_bath_house`, `salt_bath_terme` and `temazcal_bath`
 * all stay where they were.
 */
function fitOnsenBathhouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The bath first, while the floor is still empty enough to take one.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 1, 1, rim);

  // The wash benches down one wall, the buckets down the other.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x0, z, slab, SLAB);
    else if ((z - it.z0) % 3 === 2) c.put1(it.x1, z, "cauldron");
  }

  // The changing shelf, the lamp and the stores at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the stage                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `noh_stage` — the stage, and the one room in the pack built round a sight
 * line.
 *
 * The **kagami-ita**, the painted pine panel, is the back wall of the stage: a
 * course of dark timber at head height across the head row, over the **boards**
 * — a run of bottom slabs at the head a performer stands on. The **seat rows**
 * are stairs down both walls with their backs to the wall, so the room sits
 * looking at the boards, and the middle of the floor is left clear because that
 * is the floor the audience sits on.
 *
 * Bare `theatre`, `amphitheater`, `bandstand` and `dance_hall` all stay where
 * they were.
 */
function fitNohStage(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const seat = style["stair.interior"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The seat rows, in bays so no run is a second wall.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    }
  }

  // The boards across the head, and the pine panel over them.
  for (let x = it.x0; x <= it.x1; x++) c.put1(x, headZ, slab, SLAB);
  if (head >= 4) {
    for (let x = it.x0; x <= it.x1; x++) {
      if ((x - it.x0) % 2 === 1) continue;
      c.stack(x, headZ, head - 1, TIMBER);
    }
  }

  // The lamp at the corner of the stage and the property chest at the back.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the dry garden                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `karesansui_court` — the dry garden, raked.
 *
 * The **raking** is written **into the floor plane** and nowhere else: bands of
 * the plaster family at `y = 0`, a pure function of z, so the floor stays a
 * floor and every cell of it stays standable. That is the whole reason there is
 * no gravel in this room — gravel is a falling block, and a garden that fell
 * through its own floor plane the first time somebody dug under it is a hole.
 *
 * The **stones** are set among the bands: single blocks of chiseled deepslate
 * against the walls where a body walks round them rather than into them. The
 * **engawa** — the veranda a garden is looked at from — runs down one wall in
 * bays, and the lamp stands at the head.
 *
 * Bare `zen_garden`, `courtyard`, `botanical_garden` and `memorial_garden` all
 * stay where they were.
 */
function fitKaresansuiCourt(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The raking, in the floor plane. `raw` is right here and nowhere else in
  // this fit-out: the floor is already solid, so this replaces one solid block
  // with another and takes nothing away from the room's walk.
  for (let z = it.z0; z <= it.z1; z++) {
    const band = (z - it.z0) % 3 === 0 ? PLASTER_GRAIN : PLASTER;
    for (let x = it.x0; x <= it.x1; x++) c.raw(x, 0, z, band);
  }

  // The stones, against one wall, in bays.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 4 !== 1) continue;
    c.put1(it.x0, z, "chiseled_deepslate");
  }

  // The engawa down the other wall, and the lamp at the head.
  engawa(ctx, c, it.x1, slab, headZ);
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the rice store                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `kura_storehouse` — the rice, up off the damp and behind thick plaster.
 *
 * The **stilts** are stone: a plinth of bottom slabs down both walls with short
 * deepslate posts standing on it and the **bales** on the posts, so nothing in
 * the room touches the floor plane except what carries it. Every course stands
 * on the course below it — that is what a stilt *is*, and a bale written at a
 * guessed height over a post that stopped lower is a bale in mid-air, which is
 * why the second course is only written where the storey has room for it.
 *
 * The window rhythm is `none`: rice keeps in the dark.
 *
 * Bare `granary`, `mudbrick_granary`, `staddle_granary` and `stilt_granary` all
 * stay where they were.
 */
function fitKuraStorehouse(ctx: FitOutContext, c: PropCounter): void {
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
      if (slot === 0) c.put1(x, z, BATTER);
      else c.put1(x, z, slab, SLAB);
    }
    // The bales, on the stilts and never on the floor.
    if (head < 3) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 0) continue;
      if (z === headZ) continue;
      c.stack(x, z, 2, "hay_block", { axis: "y" });
    }
  }

  // The measuring bench and the lamp at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the tea room                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `chashitsu_teahouse` — four mats and a kettle, and deliberately nothing else.
 *
 * A **bench** down one wall, a **shelf** of slabs down the other, the **cold
 * hearth alcove** at the head — a cauldron, never a fire, because the shell's
 * own hearth is the room's fire — one lamp, and the empty floor that is the
 * whole point. A tea room furnished like a parlour is not a tea room.
 *
 * Bare `tea_house`, `teahouse` and `shoji_teahouse` all stay the works and
 * east-asian waves'.
 */
function fitChashitsuTeahouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x0, z, seat, {
      facing: seatFacing(it, it.x0, z),
      half: "bottom",
      shape: "straight",
    });
  }
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 !== 2) continue;
    c.put1(it.x1, z, slab, SLAB);
  }

  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "cauldron");
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the smith                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `kaji_forge` — the swordsmith at the castle wall.
 *
 * The **furnace** stands at the head: a `blast_furnace` written `lit: "false"`,
 * with the **glow** bedded beside it as this pack's andon lamp. Never a lit
 * fire and never a `campfire` — the shell's own hearth is the room's fire, and
 * rule 6 says a fit-out does not light a second one.
 *
 * The **quench trough** is a cauldron down one wall, the **stock** is ranked on
 * plinths down both, and the **finishing rods** of `iron_bars` run at the top of
 * the storey over them, where a body walks under them rather than into them.
 *
 * Bare `smithy`, `great_forge`, `norse_forge`, `rune_forge_shrine` and
 * `workshop` all stay where they were.
 */
function fitKajiForge(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  engawa(ctx, c, it.x0, slab, headZ);
  engawa(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x0, z, 2, "iron_block");
      c.stack(it.x1, z, 2, TIMBER);
    }
  }

  // The finishing rods, at the top of the storey.
  screenOn(ctx, c, it.x1, BARS_Z);

  // The furnace at the head, COLD, the quench trough and the lamp beside it.
  const look = headZ === it.z0 ? "south" : "north";
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "blast_furnace", {
    facing: look,
    lit: "false",
  });
  standInRow(ctx, c, doorEnd, it.x0, "cauldron");
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) andonLamp(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the turret                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `yagura_watchtower` — the corner turret, and the tide-bell lesson written
 * down a third time.
 *
 * **The alarm bell hangs directly under a SOLID CAP.** `attachment: ceiling`
 * demands a full cube at `y + 1`, and `iron_chain` is not one — a bell hung
 * under a chain is `unsupported.chain` dormant until the first envelope tall
 * enough to reach the branch, which is exactly how the Atlantean pack found its
 * own defect on 2026-08-17. So the cap course goes down first, the bell goes
 * directly under it, and the **rope** — two links of `iron_chain` under their
 * own cap course — goes in the column *beside* it, purely as the pull.
 *
 * When the storey will not give the height, the bell **stands on its frame** at
 * the floor course instead. A bell that vanished on a short envelope is a
 * turret with no alarm in it.
 *
 * Bare `watchtower`, `tower`, `palisade_watchtower` and `drum_tower` all stay
 * where they were.
 */
function fitYaguraWatchtower(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const cap = style["roof.solid"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const facing = headZ === it.z0 ? "south" : "north";

  // The rail round the watch floor: posts at intervals, never a solid run — a
  // turret is a thing you see out of.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      c.put1(x, z, fence, POST);
    }
  }

  // The hang, top down, with nothing anywhere in it standing over air.
  const bay = bayOn(ctx, headZ, 0);
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const hangX = bay ?? Math.floor((it.x0 + it.x1) / 2);
  let hung = false;
  if (head >= 5 && front > it.z0 && front < it.z1 && ctx.free(hangX, front)) {
    c.stack(hangX, front, head, cap);
    hung = c.stack(hangX, front, head - 1, "bell", {
      attachment: "ceiling",
      facing,
      powered: "false",
    });
    const ropeZ = headZ === it.z0 ? front - 1 : front + 1;
    if (hung && ropeZ >= it.z0 && ropeZ <= it.z1 && ctx.free(hangX, ropeZ)) {
      c.stack(hangX, ropeZ, head, cap);
      c.stack(hangX, ropeZ, head - 1, "iron_chain", CHAIN_Y);
      c.stack(hangX, ropeZ, head - 2, "iron_chain", CHAIN_Y);
    }
  }
  if (!hung) {
    standInRow(ctx, c, headZ, hangX, "bell", {
      attachment: "floor",
      facing,
      powered: "false",
    });
  }

  // The watch's stores and the lamp at the head.
  const lit = bayOn(ctx, headZ, 1);
  if (lit !== null) andonLamp(ctx, c, lit, headZ);
  standInRow(ctx, c, headZ === it.z0 ? it.z1 : it.z0, it.x1, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the box gate                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `masugata_gate` — the box gate of a castle wall.
 *
 * **One** arch bay of stone piers with a dark timber lintel across the course
 * the piers actually reached, built through {@link archBay} — four courses of
 * headroom or no arch at all, because a lintel a body cannot walk under is a
 * wall across the room and everything past it is a
 * `traversal.unreachable` pocket. One bay and no more, for the same walkability
 * reason: a second cuts the room into segments with a column at each end.
 *
 * The **guard's counter** runs across the head with the lamp on it and the
 * **arms rack** of bottom slabs down one wall.
 *
 * Bare `gate`, `gatehouse`, `arch`, `city_gate`, `caravan_gatehouse` and
 * `kora_gatehouse` all stay where they were.
 */
function fitMasugataGate(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  const archZ = headZ === it.z0 ? it.z0 + 2 : it.z1 - 2;
  archBay(ctx, c, archZ, BATTER, TIMBER);

  // The arms rack down one wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ || z === archZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x1, z, slab, SLAB);
    else if ((z - it.z0) % 3 === 2) c.put1(it.x1, z, "cobbled_deepslate");
  }

  // The guard's counter, the lamp and the stores.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const lit = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (lit !== null) andonLamp(ctx, c, lit, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}
