/**
 * The **himalayan_monastery pack's buildings** — the thirteen entries of that
 * pack which have an inside rather than a footprint on the bare ground.
 *
 * ## The thesis
 *
 * "A mountain monastery", "a dzong", "a lamasery on a ridge" all route to the
 * `medieval` era and arrive as a European abbey in stone. The *palette* was
 * never the problem — deepslate, calcite and dark oak have shipped since the
 * founding waves — the missing thing is the **noun set**. A dzong on a
 * Himalayan spur is a battered hall with a whitewashed skin and a dark timber
 * band under its eave, a gallery of prayer wheels somebody walks the length of,
 * a chorten at the gate, a butter-tea kitchen, a row of monks' cells, a
 * scripture library, a yak byre, a bell cote, a debating yard, a hermit's
 * retreat, a gate you begin the kora at, a granary up on stone stilts and a
 * kiln for juniper incense. The catalog could say none of those, and a Cotswold
 * cottage rendered in deepslate is still a Cotswold cottage.
 *
 * ## What this pack is NOT
 *
 * **It does not steal a word.** `monastery`, `stupa`, `bell_pavilion`,
 * `granary`, `kiln`, `library`, `cairn`, `courtyard`, `hermitage`, `byre`,
 * `gatehouse` and `teahouse` are every one of them somebody else's, word for
 * word, and a member belongs to one pack only — so this pack's anchor ships as
 * `dzong_hall`, its bell as `dzong_bell_cote`, its granary as `stilt_granary`
 * and its stupa as `chorten_shrine`. The negative sweep that found those taken
 * is the reason every id here is a compound of a word — `dzong`, `chorten`,
 * `kora`, `mani`, `monk`, `yak`, `scripture`, `debate`, `incense`, `butter`,
 * `prayer` — that no table in the catalog has ever claimed.
 *
 * The thirteen:
 *
 * - `dzong_hall` — the anchor: the assembly hall, its walls **battered** —
 *   deepslate at the foot, whitewash above it, a dark timber band under the
 *   plate and a gold trim course on top of that — with the pillar rows, the
 *   abbot's dais and the butter lamps inside;
 * - `prayer_wheel_gallery` — the wheels: copper drums on stone plinths down
 *   both walls, **pillar-mounted and never hung**, at a height a hand reaches;
 * - `chorten_shrine` — the stupa: a **filled-disc dome** on a stepped plinth
 *   with the spire standing on its crown, and the ablution basin inside;
 * - `butter_tea_kitchen` — the churns, the cold range and the curbed water
 *   trough;
 * - `monk_cell_row` — the cells: slab bunks in bays with the timber screens
 *   between them;
 * - `scripture_library` — the ranks of shelving and the reading bench;
 * - `yak_byre` — the hurdles, the troughs and the fodder up on a plinth;
 * - `dzong_bell_cote` — the bell, **hung directly under a solid cap** with the
 *   pull rope beside it, or standing on its frame when the storey will not give
 *   the height;
 * - `debate_courtyard` — the seat ring and the flagged floor a debate is walked
 *   round;
 * - `hermit_retreat` — the smallest room in the pack: a bench, a shelf and one
 *   lamp;
 * - `kora_gatehouse` — the gate you begin the circumambulation at: one arch
 *   bay, and the kora flagging leading away from it;
 * - `stilt_granary` — the grain, up off the damp on stone stilts;
 * - `incense_kiln` — the juniper kiln, cold, with the stock ranked on plinths.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it.
 *
 * Eleven of the thirteen do **no exterior work at all**. The exceptions are the
 * **hall's batter** — a re-clad of the wall ring between the ground and the
 * eave plate, which touches no course above it and therefore strands nothing —
 * and the **chorten's dome**, which is built the way the Mesoamerican pack's
 * temazcal, the steppe pack's ger, the Atlantean oracle and the caravan pack's
 * oasis shrine are built and for the same reason: **filled discs stepping in**,
 * each standing on the filled disc below it. A dome built as a ring per course
 * is `floating.isolated` waiting to happen, and a hollow one is a sealed pocket
 * besides.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Every interior block goes through {@link PropCounter}**, which routes
 *    through the ground floor's own `free` and `take` — the door approach, the
 *    stair columns, the **hearth reserve** the shell keeps for its campfire, the
 *    connectivity guard and the blocked-column guard, none of them restated
 *    here. `raw` appears only above the eave plate and in the floor plane a
 *    basin's rim is written in.
 * 2. **Every pool is curb-closed and stable.** The water goes **into the
 *    floor** at `y = 0`, in a rect inset at least one cell from the interior on
 *    every side, and every floor cell touching it is written solid. The cells
 *    are claimed through `take` **before a drop is written**, so a basin that
 *    would strand part of the room is refused outright rather than drowned.
 * 3. **Nothing is a pillar.** A stack filling an interior column floor to
 *    ceiling is `interior.blocked_column`, which is why every column here is
 *    written with {@link headroomOf} in hand rather than at a fixed height.
 * 4. **`iron_chain`, never `chain`.** `chain` is not in the pinned 1.21.11
 *    block table; `iron_chain` is. Every chain in this file has a cap course
 *    directly above it and **nothing hangs under it**: `attachment: ceiling`
 *    demands a FULL CUBE above, and a chain is not one. That is the tide-bell
 *    lesson, banked — and it is why the bell cote hangs its bell *directly*
 *    under the cap and puts the rope in the column beside it.
 * 5. **The glow is `glowstone`, bedded.** The butter lamp of this pack is a
 *    full cube standing on the floor with solid neighbours either side, so
 *    neither the lantern rule nor `floating.isolated` has anything to say. No
 *    `campfire`, no fire, nothing written `lit: "true"` — the shell's own hearth
 *    is the room's fire, and a fit-out that lit a second one would be arguing
 *    with it.
 * 6. **No `mud` and no `snow`.** Both are partial blocks; a room floored in
 *    either is a room you can only look at. The whitewash is `calcite` and the
 *    stone is the deepslate family, all of them full cubes.
 * 7. **No sign blocks**, no bare `flower_pot`, no `farmland`, and no gravity
 *    block above the floor plane.
 * 8. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same
 *    monastery forever.
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
export const HIMALAYAN_BUILDING_ARCHETYPES = [
  "dzong_hall",
  "prayer_wheel_gallery",
  "chorten_shrine",
  "butter_tea_kitchen",
  "monk_cell_row",
  "scripture_library",
  "yak_byre",
  "dzong_bell_cote",
  "debate_courtyard",
  "hermit_retreat",
  "kora_gatehouse",
  "stilt_granary",
  "incense_kiln",
] as const;

/** One of the archetypes this file fits out. */
export type HimalayanBuildingArchetype = (typeof HIMALAYAN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isHimalayanArchetype(value: string): value is HimalayanBuildingArchetype {
  return (HIMALAYAN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted with the other pack tables, above the greedy general tables. The
 * **non-claims** are the load-bearing half of this comment, because a monastic
 * vocabulary brushes up against a faith wave that already speaks most of it:
 *
 * - **bare `monastery`, `abbey`, `priory` and `cloister` are NOT ours** — the
 *   faith wave's, word for word. Ours answers to `dzong_hall`, `dzong` and
 *   `dzong_keep`, `dzong` being a word no table in the catalog has ever had;
 * - **bare `stupa` is not ours** — the Nile/faith side's. The chorten answers
 *   to `chorten_shrine`, `chorten` and `chorten_stupa`, and `chorten` is
 *   unclaimed;
 * - **bare `shrine`, `roadside_shrine` and `chapel` are not ours** — the faith
 *   and relic waves';
 * - **bare `bell_pavilion`, `bell_tower`, `bellcote` and `campanile` are not
 *   ours** — the east-asian pack's and the faith wave's. Ours answers to
 *   `dzong_bell_cote` and `prayer_bell_cote`;
 * - **bare `library`, `archive` and `scriptorium` are not ours.** The
 *   scripture hall answers to `scripture_library`, `scripture_hall` and
 *   `sutra_library`, `scripture` and `sutra` both being unclaimed;
 * - **bare `granary`, `mudbrick_granary` and `staddle_granary` are not ours** —
 *   the founding table's, the Nile pack's and the agrarian expansion's. Ours
 *   answers to `stilt_granary`, `raised_granary` and `grain_store`;
 * - **bare `kiln`, `pottery_kiln` and `hop_kiln` are not ours** — the works
 *   wave's. Ours answers to `incense_kiln`, `incense_works` and `juniper_kiln`;
 * - **bare `byre`, `cow_byre`, `stable`, `paddock` and `corral` are not ours** —
 *   the agrarian expansion's. The yak yard answers to `yak_byre`, `yak_stable`
 *   and `yak_shed`, and `yak` is a word no table has ever had;
 * - **bare `courtyard`, `courtyard_house` and `cloister` are not ours.** The
 *   debating yard answers to `debate_courtyard`, `debate_yard` and
 *   `monk_debate_yard`;
 * - **bare `hermitage`, `hermit_grotto` and `cell` are not ours** — the faith
 *   and sanctum waves'. Ours answers to `hermit_retreat`, `retreat_hut` and
 *   `meditation_cell`;
 * - **bare `gate`, `gatehouse`, `arch` and `caravan_gatehouse` are not ours** —
 *   the city gate's, the triumphal arch's and the caravan pack's. The kora gate
 *   answers to `kora_gatehouse`, `kora_gate` and `kora_arch`, `kora` being
 *   unclaimed;
 * - **bare `kitchen`, `field_kitchen`, `teahouse` and `tea_house` are not
 *   ours** — the works and east-asian waves'. Ours answers to
 *   `butter_tea_kitchen`, `butter_kitchen` and `butter_tea_house`;
 * - **bare `dormitory`, `bunkhouse` and `almshouse` are not ours.** The cells
 *   answer to `monk_cell_row`, `monk_cells` and `monk_quarters`;
 * - **bare `pagoda`, `wat_pavilion` and `prayer` compounds an earlier table
 *   owns are not ours** — the gallery answers to `prayer_wheel_gallery`,
 *   `prayer_wheels` and `mani_wheel_gallery`.
 *
 * Every claim below is therefore either a compound of this pack's own ids or a
 * word (`dzong`, `chorten`, `kora`, `mani`, `monk`, `yak`, `scripture`, `sutra`,
 * `debate`, `incense`, `butter`, `juniper`, `meditation`, `retreat`) that no
 * table in the catalog has ever claimed.
 */
export function himalayanArchetypeOfTags(
  tags: readonly string[],
): HimalayanBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("dzong_hall") || has("dzong") || has("dzong_keep")) return "dzong_hall";
  if (has("prayer_wheel_gallery") || has("prayer_wheels") || has("mani_wheel_gallery")) {
    return "prayer_wheel_gallery";
  }
  if (has("chorten_shrine") || has("chorten") || has("chorten_stupa")) return "chorten_shrine";
  if (has("butter_tea_kitchen") || has("butter_kitchen") || has("butter_tea_house")) {
    return "butter_tea_kitchen";
  }
  if (has("monk_cell_row") || has("monk_cells") || has("monk_quarters")) return "monk_cell_row";
  if (has("scripture_library") || has("scripture_hall") || has("sutra_library")) {
    return "scripture_library";
  }
  if (has("yak_byre") || has("yak_stable") || has("yak_shed")) return "yak_byre";
  if (has("dzong_bell_cote") || has("prayer_bell_cote")) return "dzong_bell_cote";
  if (has("debate_courtyard") || has("debate_yard") || has("monk_debate_yard")) {
    return "debate_courtyard";
  }
  if (has("hermit_retreat") || has("retreat_hut") || has("meditation_cell")) {
    return "hermit_retreat";
  }
  if (has("kora_gatehouse") || has("kora_gate") || has("kora_arch")) return "kora_gatehouse";
  if (has("stilt_granary") || has("raised_granary") || has("grain_store")) return "stilt_granary";
  if (has("incense_kiln") || has("incense_works") || has("juniper_kiln")) return "incense_kiln";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * Most of the pack takes **`flat`**, and that is the pack's exterior argument in
 * one word: a dzong roofs flat over its battered walls, because a flat roof is a
 * drying floor and a terrace and the snow is shovelled off it anyway. The
 * chorten takes **`hip`**, the shape that leaves the deepest gap between the
 * eave plate and the height allowance — and that gap is where the dome and its
 * spire are built. The byre and the kiln take `gable`, because a working shed
 * on a mountain sheds its load off a ridge.
 *
 * The window rhythms carry the rest. The gallery and the debating yard are
 * `regular` — a colonnade is mostly opening — the granary, the library and the
 * kiln are `none`, because grain, ink and smoke all want the dark, and the rest
 * are `sparse`.
 */
export function himalayanFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "dzong_hall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "prayer_wheel_gallery":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "chorten_shrine":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "butter_tea_kitchen":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "flat" };
    case "monk_cell_row":
      return { windowShape: "single", windowRhythm: "regular", roof: "flat" };
    case "scripture_library":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "yak_byre":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "gable" };
    case "dzong_bell_cote":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "flat" };
    case "debate_courtyard":
      return { windowShape: "wide", windowRhythm: "regular", roof: "flat" };
    case "hermit_retreat":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "kora_gatehouse":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "flat" };
    case "stilt_granary":
      return { windowShape: "single", windowRhythm: "none", roof: "flat" };
    case "incense_kiln":
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
export function furnishHimalayan(ctx: FitOutContext): number {
  if (!isHimalayanArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "dzong_hall":
      fitDzongHall(ctx, c);
      break;
    case "prayer_wheel_gallery":
      fitPrayerWheelGallery(ctx, c);
      break;
    case "chorten_shrine":
      fitChortenShrine(ctx, c);
      break;
    case "butter_tea_kitchen":
      fitButterTeaKitchen(ctx, c);
      break;
    case "monk_cell_row":
      fitMonkCellRow(ctx, c);
      break;
    case "scripture_library":
      fitScriptureLibrary(ctx, c);
      break;
    case "yak_byre":
      fitYakByre(ctx, c);
      break;
    case "dzong_bell_cote":
      fitDzongBellCote(ctx, c);
      break;
    case "debate_courtyard":
      fitDebateCourtyard(ctx, c);
      break;
    case "hermit_retreat":
      fitHermitRetreat(ctx, c);
      break;
    case "kora_gatehouse":
      fitKoraGatehouse(ctx, c);
      break;
    case "stilt_granary":
      fitStiltGranary(ctx, c);
      break;
    case "incense_kiln":
    default:
      fitIncenseKiln(ctx, c);
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

/** A bottom slab: the bench top, the plinth and the kerb of this whole file. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a screen, a drying rod, a rack. */
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
 * **The dzong's four substances**, named outright rather than drawn from the
 * palette — exactly as the Mesoamerican pack names `mossy_stone_bricks`, the
 * steppe pack names its felt and the caravan pack names its mudbrick. The
 * theme's stone is what the *frame* is made of, and no palette symbol in the
 * grammar spells "whitewashed rammed earth over a battered plinth".
 *
 * All four are full cubes, which is rule 6 applied to a wall.
 */
/** The battered foot: dark, heavy, and wider-reading than what stands on it. */
const BATTER = "polished_deepslate";
/** The whitewash: `calcite`, the whitest full cube in the pinned table. */
const WHITEWASH = "calcite";
/** The dark timber band under the eave — the kemar course. */
const TIMBER = "dark_oak_planks";
/** The gold trim: one course of it, and never more. */
const GOLD = "gold_block";

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
 * the throne, the kiln, the bell — must not vanish because the one cell it
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
 * The **butter lamp** — the pack's recurring wall ornament and its only glow.
 *
 * `glowstone` between two courses of `chiseled_deepslate`, all three at the
 * floor course against a wall. `glowstone` is a full cube standing on the
 * shell's own floor with a solid neighbour either side, so neither the lint's
 * lantern rule (its name does not end `lantern` in the first place) nor
 * `floating.isolated` has anything to say. Returns whether the glow landed.
 */
function butterLamp(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  const it = ctx.interior;
  const lit = c.put1(x, z, "glowstone");
  const along = z === it.z0 || z === it.z1;
  // The surround is tried **along the wall first and inward second**, and it
  // takes the first two cells that land rather than the two it wanted: on a
  // pillared wall the cells either side of a lamp are as often a column as they
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
    if (c.put1(nx, nz, "chiseled_deepslate")) laid++;
  }
  return lit;
}

/**
 * A **screen** of `iron_bars` down one wall, at the top of the storey.
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
function himalayanJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * The **thangka** colours — the banner cloth of a monastery, in full cubes.
 *
 * Wool rather than banner blocks: a banner is a block entity this fit-out
 * cannot carry and an attachable besides, and the whole point of the pack's
 * colour is that it is a thing you can stack against a wall.
 */
const CLOTH = ["red_wool", "yellow_wool", "blue_wool", "green_wool", "white_wool"] as const;

/** One cloth block, drawn from position. */
function clothAt(x: number, z: number): string {
  return CLOTH[himalayanJitter(x, 2, z, CLOTH.length)] as string;
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
 * riad's courtyard basin, the caravan cistern's and the science pack's pond,
 * unchanged:
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
 *   so no later `put1` in this file can ever stand a churn on the water.
 *
 * Returns whether the basin was built. `false` is a perfectly good answer — a
 * shrine you have to wade across is a pond.
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
interface HimalayanPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
}

/** The plan for work on the walls: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): HimalayanPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return { sx, sz, base: ctx.wallTop + 1, top: ctx.roofTop + ROOF_FLOURISH_RISE };
}

/** The plan for a roof rebuild: a wall plan that also has room to build in. */
function roofPlan(ctx: FitOutContext): HimalayanPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: HimalayanPlan): void {
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
  plan: HimalayanPlan,
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
 * **THE BATTER** — the dzong wall, read bottom to top.
 *
 * A dzong wall is not one substance and that is the whole read: the bottom
 * third is dark stone (the batter, the part that would lean inward if this
 * grammar could lean), the middle is whitewash, and directly under the eave
 * plate comes the **dark timber band** with a single **gold trim course** on top
 * of it. One course of gold and never more — gold is an accent, and a building
 * clad in it is a trophy rather than a monastery.
 *
 * Returns the block a wall cell should be, as a pure function of position, so
 * `reclad` can be handed it and the same document builds the same wall forever.
 */
function dzongWall(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const plate = ctx.wallTop;
  const foot = Math.max(1, Math.floor(plate / 3));
  return (x, y, z) => {
    if (y >= plate) return GOLD;
    if (y >= plate - 1) return TIMBER;
    if (y <= foot) return himalayanJitter(x, y, z, 7) === 0 ? "deepslate_bricks" : BATTER;
    return himalayanJitter(x, y, z, 9) === 0 ? "polished_diorite" : WHITEWASH;
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
 * **The chorten's dome and spire** — the pack's one silhouette argument.
 *
 * A chorten is the single most recognisable object on a Himalayan ridge, and a
 * hip roof on one is a cottage with a funny hat. Built the way the temazcal's
 * shoulder, the ger's crown, the Atlantean oracle's dome and the oasis shrine's
 * are built, and for the same reason: **filled discs stepping in**, each
 * standing on the filled disc below it. A dome written as a ring per course
 * leaves its outermost cells with air below and beside them, which is
 * `floating.isolated`; a hollow dome is a sealed pocket besides. The lid under
 * it gives the room a ceiling and gives the first disc a floor.
 *
 * On top of the crown stands the **spire**: an unbroken column, `gold_block` at
 * its head, each course standing on the one below it. A spire with a gap in it
 * is four floating blocks and a stump.
 *
 * Silently does nothing on an envelope with no room above the plate — a fit-out
 * that insisted would be arguing with the shell.
 */
function chortenDome(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  const wall = wallPlan(ctx);

  // The wall skin: the whitewashed drum of the chorten, over its dark foot.
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, dzongWall(ctx));

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
      c.raw(x, plan.base, z, himalayanJitter(x, plan.base, z, 5) === 0 ? board : lidBlock);
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
        const banded = himalayanJitter(x, y, z, 6) === 0 ? BATTER : WHITEWASH;
        c.raw(x, y, z, radius < 1.6 ? WHITEWASH : banded);
      }
    }
    crown = y;
  }

  // **The spire, written last and unconditionally.** It stands on the crown of
  // the dome, every course of it on the course below, and it ends in gold: that
  // is the harmika and the sun-and-moon finial in the only two blocks this
  // grammar has for them. A chorten whose finial depended on how much roof
  // allowance the shell felt like giving it is a chorten that is sometimes a
  // dome.
  const mx = Math.round(cx);
  const mz = Math.round(cz);
  if (crown > plan.base) {
    c.raw(mx, crown, mz, GOLD);
    for (let y = crown + 1; y <= plan.top + 2; y++) {
      const ring = y % 2 === 0 ? "cut_copper" : GOLD;
      c.raw(mx, y, mz, y === plan.top + 2 ? GOLD : ring);
    }
  }

  guardHangers(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* the dzong hall                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `dzong_hall` — the anchor, and the only building here a stranger will name
 * out loud.
 *
 * Outside, the **batter**: the wall ring re-clad from the ground to the plate,
 * dark stone at the foot, whitewash above it, the dark timber band under the
 * eave and one course of gold on top. That is the whole of this archetype's
 * exterior work — it touches **no course above the plate**, so nothing the shell
 * hung from its ceiling plane is stranded and the hanger guard has nothing to
 * do here.
 *
 * Inside, three things. The **pillar rows** — dark oak columns down both wall
 * rows at every other bay, capped short of the ceiling so no column is a pillar
 * through the room — the **thangka cloth** hung between their heads, and the
 * **butter lamps** bedded among them, which is where the pack's glow lives. And
 * the **abbot's dais** across the head: a run of bottom slabs with the gold
 * throne block set into it.
 *
 * The middle of the floor is left untouched. The middle of an assembly hall is
 * where the assembly sits, and it is where the shell reserves its hearth.
 */
function fitDzongHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The batter, outside: ground to plate, and not one course above it.
  const wall = wallPlan(ctx);
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, dzongWall(ctx));

  // The pillar rows, both walls, at every other bay, the cloth between them.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      column(ctx, c, x, z, "dark_oak_log");
    }
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 4 === 1) c.put1(x, z, slab, SLAB);
      else if ((z - it.z0) % 4 === 3) butterLamp(ctx, c, x, z);
    }
    // The thangka, hung on the wall at the top of the storey — over a body's
    // head, where a hanging is looked up at rather than walked into.
    if (head < 4) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 4 !== 1) continue;
      c.stack(x, z, head - 1, clothAt(x, z));
    }
  }

  // The abbot's dais across the head, with the throne set into it.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), GOLD);
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the prayer wheel gallery                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `prayer_wheel_gallery` — the wheels, and the pack's one argument about how a
 * thing is mounted.
 *
 * **Pillar-mounted, never hung.** A row of prayer wheels is the obvious thing
 * to hang from a ceiling and the obvious thing to get wrong: a hanger needs a
 * FULL CUBE directly above it, the ceiling plane over a gallery is the shell's
 * business and not this fit-out's, and the Atlantean pack has already paid for
 * that lesson once with a bell. So every wheel here **stands**: a stone plinth
 * on the floor, the copper drum on the plinth, and the gold cap on the drum
 * where the storey has room for one. Every course of it touches the course
 * below, and there is no support rule left to fail.
 *
 * The **walk** down the middle of the room is left clear — a gallery you walk
 * the length of is a gallery whose length is walkable.
 */
function fitPrayerWheelGallery(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue; // the gap a hand reaches through
      if (slot === 1) {
        c.put1(x, z, slab, SLAB);
        continue;
      }
      // The wheel itself: plinth, drum, cap — every course on the one below.
      if (!c.put1(x, z, BATTER)) continue;
      if (head < 3) continue;
      c.stack(x, z, 2, "cut_copper");
      if (head >= 4) c.stack(x, z, 3, GOLD);
    }
  }

  // The gallery's own lamp and the pilgrim's shelf at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the chorten                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `chorten_shrine` — the stupa at the gate, and the pack's only roof rebuild.
 *
 * Outside it is the **dome** — filled discs stepping in over a whitewashed drum
 * — with the **spire** standing on its crown and ending in gold.
 *
 * Inside it is a **ring of seats** against both walls with their backs to the
 * wall, so the room sits looking in; the **ablution basin**, one course of water
 * sunk into the floor a little to the head side of the middle, curbed by
 * construction; and the **butter lamp** at the head.
 *
 * The basin is deliberately off the exact middle of the floor: the shell hangs
 * its lantern from the ceiling plane over the centre, and a basin under it would
 * be a room whose one route ran through the lantern column.
 *
 * Bare `stupa` stays where it was, and bare `shrine`, `roadside_shrine` and
 * `chapel` stay the faith and relic waves'.
 */
function fitChortenShrine(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);

  chortenDome(ctx, c);

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

  // The lamp at the head, where the offering stands.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the butter tea kitchen                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `butter_tea_kitchen` — the churns, and the room the whole community passes
 * through twice a day.
 *
 * The **churns** are cauldrons down one wall in bays with the **stores** on a
 * plinth between them; the **range** stands at the head, a `smoker` written
 * `lit: "false"` because rule 5 says a fit-out does not light a second fire in
 * a room the shell already gave a hearth; and the **water trough** is a curbed
 * sunken basin, one cell of it, off the lantern column.
 *
 * Bare `kitchen`, `field_kitchen`, `teahouse` and `tea_house` all stay where
 * they were.
 */
function fitButterTeaKitchen(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const rim = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The churns down one wall, the stores up on a plinth down the other.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x0, z, "cauldron");
    else if ((z - it.z0) % 3 === 2) c.put1(it.x0, z, "barrel", BARREL);
  }
  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "hay_block", { axis: "y" });
    }
  }

  // The water trough, one cell of it, one row off the lantern column.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 0, 0, rim);

  // The range at the head, COLD, and the lamp beside it.
  const look = headZ === it.z0 ? "south" : "north";
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "smoker", {
    facing: look,
    lit: "false",
  });
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the monks' cells                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `monk_cell_row` — the cells, and the plainest room in the pack.
 *
 * A **bunk** of bottom slabs in each bay down both walls, a **timber screen** of
 * `iron_bars` at the top of one storey between them — head height and no lower,
 * because a screen at chest height is a screen nobody walks past — and the
 * **shelf** across the head with one lamp on it.
 *
 * A bed block would be the obvious thing here and it is deliberately absent: a
 * bed is two cells that must both land or neither, and a row of them down a
 * narrow cell block is a row of half-beds on the first tight envelope. A slab
 * bunk is what a cell actually has.
 *
 * Bare `dormitory`, `bunkhouse` and `almshouse` stay where they were.
 */
function fitMonkCellRow(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue; // the doorway of each cell
      c.put1(x, z, slab, SLAB);
    }
    // The bedding roll, up on the bunk and never on a floor that gets swept.
    if (head < 3) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 0) continue;
      if (z === headZ) continue;
      c.stack(x, z, 2, clothAt(x, z));
    }
  }

  // The screens between the cells, at the top of the storey.
  screenOn(ctx, c, it.x0, BARS_Z);

  // The shelf and the lamp across the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the scripture library                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `scripture_library` — the pecha racks, and the darkest room in the pack.
 *
 * The **ranks** are bookshelves on plinths down both walls, two courses where
 * the storey has room; the **gangway** runs between them; the **reading bench**
 * is at the head with the lamp beside it. The window rhythm is `none` for the
 * same reason the drowned archive's is: a room whose whole subject is keeping
 * the sun off what is in it is a room kept dark.
 *
 * Bare `library`, `archive` and `scriptorium` stay where they were.
 */
function fitScriptureLibrary(ctx: FitOutContext, c: PropCounter): void {
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
      if (slot === 0) c.put1(x, z, "bookshelf");
      else c.put1(x, z, slab, SLAB);
    }
    if (head < 3) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      if (z === headZ) continue;
      c.stack(x, z, 2, "bookshelf");
    }
  }

  // The reading bench at the head, through `standInRow`: it is the room's one
  // must-have and it must not vanish because its cell was the door's.
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "lectern", {
    facing: headZ === it.z0 ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the yak byre                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `yak_byre` — where the herd stands out of the wind.
 *
 * Hurdles off one wall in bays with the **troughs** between them; the **fodder**
 * up on a plinth down the other, because fodder on the ground is fodder trodden
 * into it; the **tack shelf** across the head.
 *
 * Bare `byre`, `cow_byre`, `stable`, `stables`, `paddock` and `corral` stay
 * where they were, and the caravan pack's `camel_lines` is a *different* room:
 * that one is a walled yard off a trade court, this one is a beast shed on a
 * mountain.
 */
function fitYakByre(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x0, z, fence, POST);
    else if ((z - it.z0) % 3 === 2) c.put1(it.x0, z, "cauldron");
  }

  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "hay_block", { axis: "y" });
    }
  }

  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the bell cote                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `dzong_bell_cote` — the bell, and the tide-bell lesson written down twice.
 *
 * **The bell hangs directly under a SOLID CAP.** `attachment: ceiling` demands
 * a full cube at `y + 1`, and `iron_chain` is not one — a bell hung under a
 * chain is `unsupported.chain` dormant until the first envelope tall enough to
 * reach the branch, which is exactly how the Atlantean pack found its own defect
 * on 2026-08-17. So the cap course goes down first, the bell goes directly
 * under it, and the **rope** — two links of `iron_chain` under their own cap
 * course — goes in the column *beside* it, purely as the pull.
 *
 * When the storey will not give the height, the bell **stands on its frame** at
 * the floor course instead. A bell that vanished on a short envelope is a bell
 * cote with no bell in it.
 *
 * Bare `bell_pavilion`, `bell_tower`, `bellcote` and `campanile` stay where
 * they were.
 */
function fitDzongBellCote(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const cap = style["roof.solid"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const facing = headZ === it.z0 ? "south" : "north";

  // The rail round the bell floor: posts at intervals, never a solid run — a
  // bell floor is a thing you see out of.
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

  // The ringer's stores and the lamp at the head.
  const lit = bayOn(ctx, headZ, 1);
  if (lit !== null) butterLamp(ctx, c, lit, headZ);
  standInRow(ctx, c, headZ === it.z0 ? it.z1 : it.z0, it.x1, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the debating yard                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `debate_courtyard` — the yard a debate is walked round.
 *
 * The **seat ring** runs down both walls, stairs with their backs to the wall,
 * so the yard sits looking in. The **columns** stand at every third bay with the
 * **awning** springing off each of them: a bottom slab one cell in from the
 * column at the course the column actually reached, so the awning touches the
 * column it hangs off and nothing in it is floating. That is the whole reason
 * the awning is written at {@link columnTop} rather than at a fixed height — a
 * slab at a guessed course beside a column that stopped lower is a slab in
 * mid-air.
 *
 * The middle of the floor is left clear, because it is the floor the debate is
 * walked on.
 *
 * Bare `courtyard`, `courtyard_house` and `cloister` stay where they were.
 */
function fitDebateCourtyard(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const top = columnTop(ctx);

  for (const x of [it.x0, it.x1]) {
    const inward = x === it.x0 ? 1 : -1;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 !== 0) continue;
      if (!column(ctx, c, x, z, "dark_oak_log")) continue;
      if (head >= 4 && x + inward >= it.x0 && x + inward <= it.x1) {
        c.stack(x + inward, z, top, slab, SLAB);
      }
    }
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 !== 1) continue;
      c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    }
  }

  // The teacher's seat and the lamp at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the hermit's retreat                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `hermit_retreat` — the smallest room in the pack, and deliberately so.
 *
 * A **bench** down one wall, a **shelf** of slabs down the other, one **lamp**
 * at the head and one water jar. Nothing else — a retreat furnished like a
 * parlour is not a retreat, and the empty floor is the point.
 *
 * Bare `hermitage` and `hermit_grotto` stay the faith and sanctum waves'.
 */
function fitHermitRetreat(ctx: FitOutContext, c: PropCounter): void {
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

  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  standInRow(ctx, c, doorEnd, it.x1, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the kora gate                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `kora_gatehouse` — the gate the circumambulation begins at.
 *
 * **One** arch bay, and that is a walkability decision, not a taste one. Two
 * piers and a lintel across them read as a gate at a glance; a second bay behind
 * the first cuts the room into segments with a column at each end, which is
 * exactly the kind of pocket that passes a connectivity check and fails the
 * lint's walk from the door.
 *
 * The **kora flagging** runs down one wall from the arch — a run of bottom slabs
 * marking the way round, kept to one side so the room's own route is never on
 * it — with the **mani stones** of `chiseled_deepslate` set into it at intervals
 * and the lamp at the head.
 *
 * Bare `gate`, `gatehouse` and `arch` stay the city gate's and the triumphal
 * arch's; `caravan_gatehouse` stays the caravan pack's, word for word.
 */
function fitKoraGatehouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The arch, at the head end of the room: two piers three cells apart, and
  // the lintel across their heads at the course the columns actually reached.
  //
  // `head >= 4` is the walkability clause, and it is not the same number as
  // {@link column}'s. A column may stand on a three-course storey — it reaches
  // courses 1 and 2 and leaves the third clear, which is all a *column* owes.
  // An arch owes more: the lintel lands on {@link columnTop}, so on three
  // courses it lands at course 2 and the way through is one course high — a
  // gate a player cannot walk under, and (because the lintel spans the whole
  // bay) a wall across the room that strands everything beyond it. That is a
  // `traversal.unreachable` pocket, found by the terrarium's walk on the
  // review world's own seven-by-seven gatehouse plan. Four courses is the
  // first storey with room for a body under the lintel, so below it the room
  // simply has no arch — the same bar the pack's awnings already keep.
  const archZ = headZ === it.z0 ? it.z0 + 2 : it.z1 - 2;
  const bay = bayOn(ctx, archZ, 2) ?? bayOn(ctx, archZ, 0);
  const piers: number[] = [];
  if (bay !== null && archZ > it.z0 && archZ < it.z1 && headroomOf(ctx) >= 4) {
    for (const x of [bay - 2, bay + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      if (column(ctx, c, x, archZ, BATTER)) piers.push(x);
    }
    if (piers.length === 2) {
      const top = columnTop(ctx);
      for (let x = piers[0] as number; x <= (piers[1] as number); x++) {
        c.stack(x, archZ, top, GOLD);
      }
    }
  }

  // The kora flagging down one wall, with the mani stones set into it.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ || z === archZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x1, z, slab, SLAB);
    else if ((z - it.z0) % 3 === 2) c.put1(it.x1, z, "chiseled_deepslate");
  }

  // The gatekeeper's counter, the lamp and the stores.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const lit = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (lit !== null) butterLamp(ctx, c, lit, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the stilt granary                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `stilt_granary` — the grain, up off the damp.
 *
 * The **stilts** are stone: a plinth of bottom slabs down both walls with the
 * short deepslate posts standing on it and the **bins** on the posts, so nothing
 * in the room touches the floor plane except what carries it. Every course
 * stands on the course below it — that is what a stilt *is*, and a bin written
 * at a guessed height over a post that stopped lower is a bin in mid-air, which
 * is why the second course is only written where the storey has room for it.
 *
 * The window rhythm is `none`: grain keeps in the dark.
 *
 * Bare `granary`, `mudbrick_granary` and `staddle_granary` stay the founding
 * table's, the Nile pack's and the agrarian expansion's.
 */
function fitStiltGranary(ctx: FitOutContext, c: PropCounter): void {
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
    // The bins, on the stilts and never on the floor.
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
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the incense kiln                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `incense_kiln` — juniper in one end, smoke out of the other.
 *
 * The **kiln** stands at the head: a `blast_furnace` written `lit: "false"`,
 * with the **glow** bedded beside it as this pack's butter lamp. Never a lit
 * fire and never a `campfire` — the shell's own hearth is the room's fire, and
 * rule 5 says a fit-out does not light a second one.
 *
 * The **juniper** is ranked on a plinth down one wall and the **finished sticks**
 * down the other, both up off the floor, with the **drying rods** of `iron_bars`
 * at the top of the storey over them.
 *
 * Bare `kiln`, `pottery_kiln` and `hop_kiln` stay the works wave's.
 */
function fitIncenseKiln(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  plinth(ctx, c, it.x0, slab, headZ);
  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x0, z, 2, "moss_block");
      c.stack(it.x1, z, 2, "dark_oak_planks");
    }
  }

  // The drying rods, at the top of the storey where a body walks under them.
  screenOn(ctx, c, it.x1, BARS_Z);

  // The kiln at the head, cold, and the lamp bedded beside it.
  const look = headZ === it.z0 ? "south" : "north";
  standInRow(ctx, c, headZ, Math.floor((it.x0 + it.x1) / 2), "blast_furnace", {
    facing: look,
    lit: "false",
  });
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) butterLamp(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}
