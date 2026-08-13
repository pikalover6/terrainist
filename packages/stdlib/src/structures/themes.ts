/**
 * Material themes — the diversity layer under `building.grammar@0`.
 *
 * The problem this solves: a village whose every house is oak planks, spruce
 * corner posts and dark-oak stairs reads as one building copy-pasted eight
 * times, however good that one building is. Real settlements are built from a
 * *local* palette — one or two woods, one or two stones, whatever the roofer
 * had — and vary *within* it, house by house.
 *
 * So the model is two levels:
 *
 * 1. a **village theme** ({@link MaterialTheme}), drawn once from the world
 *    seed: a small closed set of wood sets, stone sets and roof sets that look
 *    like they came from the same valley;
 * 2. a **per-building triple** — one wood, one stone, one roof — assigned by
 *    {@link assignMaterials}, which enumerates the theme's whole product space,
 *    shuffles it with a seeded Fisher-Yates and deals one to each building in
 *    node-path order. Two buildings therefore *cannot* share a triple until the
 *    product is exhausted, and with 3 woods × 4 roofs there is room for twelve
 *    buildings before that happens.
 *
 * Everything is a pure function of the seed and the building count, so the same
 * document compiles to the same materials forever.
 */

import { Rng, streamSeed, type Seed256 } from "../determinism/index.js";

/* -------------------------------------------------------------------------- */
/* sets                                                                        */
/* -------------------------------------------------------------------------- */

/** One wood family: everything a timber-framed wall and its joinery need. */
export interface WoodSet {
  readonly id: string;
  readonly planks: string;
  readonly log: string;
  readonly stripped: string;
  readonly stairs: string;
  readonly slab: string;
  readonly fence: string;
  readonly door: string;
  readonly trapdoor: string;
}

/** One masonry family: the foundation course and the things built out of it. */
export interface StoneSet {
  readonly id: string;
  readonly primary: string;
  readonly accent: string;
  readonly stairs: string;
  readonly slab: string;
  readonly wall: string;
}

/** One roofing family: the slope, its ridge cap, and the solid fallback. */
export interface RoofSet {
  readonly id: string;
  readonly stairs: string;
  readonly slab: string;
  readonly solid: string;
}

/** The three sets one building was dealt. */
export interface BuildingMaterials {
  readonly wood: WoodSet;
  readonly stone: StoneSet;
  readonly roof: RoofSet;
}

/**
 * One curtain-wall vocabulary: the five roles a city wall is built from.
 *
 * Mirrors the compiler's `WallMaterials` exactly, and for the same reason every
 * entry there is a **full cube**: a slab or a fence in a curtain is either a
 * physics finding waiting to happen or a hole a mob paths through.
 */
export interface CurtainWallSet {
  /** The body of the curtain, and its footing. */
  readonly core: string;
  /** The wall-walk's top course — what a player stands on. */
  readonly walk: string;
  /** The parapet band either side of the walk. */
  readonly parapet: string;
  /** The merlon course on top of the parapet. */
  readonly merlon: string;
  /** A tower's body. */
  readonly tower: string;
}

/** A village-wide palette: the sets every building in it draws from. */
export interface MaterialTheme {
  readonly id: string;
  readonly woods: readonly WoodSet[];
  readonly stones: readonly StoneSet[];
  readonly roofs: readonly RoofSet[];
  /**
   * The city wall's own materials — when absent, derived from the ground roles
   * as before (`revetment` body, `pavement` walk, `coping` merlon).
   *
   * Kai, walking Troy (2026-08-12): the sun-clay circuit took its body from the
   * ground's brick roles and read as "weird brick foundation" under sandstone
   * crenellations. A curtain wall is one object seen from outside the town, so
   * a theme may say what it is made of directly instead of inheriting the
   * terrace masonry. Declared per theme; every theme that stays silent keeps
   * the derivation byte for byte.
   */
  readonly curtain?: CurtainWallSet;
  /**
   * This palette belongs to a **dry country**.
   *
   * Kai, walking Troy (2026-08-11): the sandstone town was right and its
   * surroundings read *lush Ireland, not Aegean gold*. The cause is that a
   * material theme says everything about what a town is built from and nothing
   * about the land it stands in, so a sun-baked city gets the same green
   * grassland tint a Cotswold village does.
   *
   * The flag lives on the **theme**, deliberately, rather than in a list of
   * theme ids kept somewhere downstream: a future desert or steppe palette
   * joins the look by declaring one thing about itself, in the same file where
   * its blocks are chosen, and nothing has to be taught its name.
   *
   * Two things read it, both gated so that no theme without it moves a byte:
   *
   * - `terrain/biomes.ts` biases the **derived ambient** grassland biomes
   *   toward the savanna family, so the grass tint outside town reads dry gold.
   *   Author intent still wins: an explicit `intent.climate.biome`, or a cold
   *   or wet climate intent, turns the bias off.
   * - `terrain/urban-floor.ts` picks the pale half of its packed-earth mix,
   *   because a dry town's courtyards are dust and stone where a wet one's are
   *   trodden mud.
   *
   * Absent means temperate, which is every theme but {@link SUN_CLAY_THEME}.
   */
  readonly aridAmbient?: boolean;
}

function wood(id: string, door = `${id}_door`): WoodSet {
  return {
    id,
    planks: `${id}_planks`,
    log: `${id}_log`,
    stripped: `stripped_${id}_log`,
    stairs: `${id}_stairs`,
    slab: `${id}_slab`,
    fence: `${id}_fence`,
    door,
    trapdoor: `${id}_trapdoor`,
  };
}

const OAK = wood("oak");
const SPRUCE = wood("spruce");
const BIRCH = wood("birch");
const DARK_OAK = wood("dark_oak");

const COBBLE: StoneSet = {
  id: "cobblestone",
  primary: "cobblestone",
  accent: "stone_bricks",
  stairs: "cobblestone_stairs",
  slab: "cobblestone_slab",
  wall: "cobblestone_wall",
};
const STONE_BRICK: StoneSet = {
  id: "stone_bricks",
  primary: "stone_bricks",
  accent: "cobblestone",
  stairs: "stone_brick_stairs",
  slab: "stone_brick_slab",
  wall: "stone_brick_wall",
};
const MOSSY: StoneSet = {
  id: "mossy_cobblestone",
  primary: "mossy_cobblestone",
  accent: "cobblestone",
  stairs: "mossy_cobblestone_stairs",
  slab: "mossy_cobblestone_slab",
  wall: "mossy_cobblestone_wall",
};
const DEEPSLATE: StoneSet = {
  id: "deepslate_bricks",
  primary: "deepslate_bricks",
  accent: "cobbled_deepslate",
  stairs: "deepslate_brick_stairs",
  slab: "deepslate_brick_slab",
  wall: "deepslate_brick_wall",
};

function woodRoof(w: WoodSet): RoofSet {
  return { id: w.id, stairs: w.stairs, slab: w.slab, solid: w.planks };
}
const DEEPSLATE_TILE_ROOF: RoofSet = {
  id: "deepslate_tile",
  stairs: "deepslate_tile_stairs",
  slab: "deepslate_tile_slab",
  solid: "deepslate_tiles",
};
const BRICK_ROOF: RoofSet = {
  id: "brick",
  stairs: "brick_stairs",
  slab: "brick_slab",
  solid: "bricks",
};

/**
 * The themes a village may be built in.
 *
 * Deliberately few and deliberately narrow: the point of a theme is that a
 * stranger can tell two villages apart at a glance and still believe each one
 * was built by a single community.
 */
export const MATERIAL_THEMES: readonly MaterialTheme[] = Object.freeze([
  {
    id: "temperate_timber",
    woods: [OAK, SPRUCE, BIRCH],
    stones: [COBBLE, STONE_BRICK, MOSSY],
    roofs: [woodRoof(DARK_OAK), woodRoof(SPRUCE), DEEPSLATE_TILE_ROOF, BRICK_ROOF],
  },
  {
    id: "boreal_pine",
    woods: [SPRUCE, DARK_OAK, OAK],
    stones: [COBBLE, MOSSY, DEEPSLATE],
    roofs: [woodRoof(SPRUCE), woodRoof(DARK_OAK), DEEPSLATE_TILE_ROOF, woodRoof(OAK)],
  },
  {
    id: "birchwood_downs",
    woods: [BIRCH, OAK, SPRUCE],
    stones: [STONE_BRICK, COBBLE, MOSSY],
    roofs: [woodRoof(DARK_OAK), BRICK_ROOF, woodRoof(SPRUCE), DEEPSLATE_TILE_ROOF],
  },
] as const);

/* -------------------------------------------------------------------------- */
/* the modern city palette                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Concrete, glass and quartz — the palette the high-rise grammar is drawn in.
 *
 * `WoodSet` is a shape, not a claim about trees: what the grammar asks of it is
 * a wall surface, a frame member, an accent, a stair, a slab, a railing, a door
 * and a trapdoor. Concrete and quartz answer every one of those.
 *
 * The railing is a **wall**, not `iron_bars`, and the reason is load-bearing.
 * The grammar treats the `fence` role as a *post you can stand something on* —
 * a potted plant, a porch lamp, a pressure plate — and the physics lint agrees
 * with vanilla that a fence or a wall carries a support chain down to the
 * ground while iron bars do not. Every one of those decorations came out
 * floating the first time this theme was asked to build an actual settlement
 * rather than the high-rise exhibit row (489 `unsupported.chain` findings on
 * the headline city). A parapet also reads better on concrete than bars do.
 */
const CONCRETE_LIGHT: WoodSet = {
  id: "concrete_light",
  planks: "light_gray_concrete",
  log: "gray_concrete",
  stripped: "smooth_quartz",
  stairs: "quartz_stairs",
  slab: "quartz_slab",
  fence: "diorite_wall",
  door: "birch_door",
  trapdoor: "iron_trapdoor",
};

const CONCRETE_WHITE: WoodSet = {
  id: "concrete_white",
  planks: "white_concrete",
  log: "light_blue_concrete",
  stripped: "quartz_block",
  stairs: "smooth_quartz_stairs",
  slab: "smooth_quartz_slab",
  fence: "diorite_wall",
  door: "birch_door",
  trapdoor: "iron_trapdoor",
};

const CONCRETE_BLUE: WoodSet = {
  id: "concrete_blue",
  planks: "gray_concrete",
  log: "blue_concrete",
  stripped: "light_gray_concrete",
  stairs: "quartz_stairs",
  slab: "quartz_slab",
  fence: "andesite_wall",
  door: "birch_door",
  trapdoor: "iron_trapdoor",
};

const SMOOTH_STONE: StoneSet = {
  id: "smooth_stone",
  primary: "smooth_stone",
  accent: "polished_andesite",
  stairs: "polished_andesite_stairs",
  slab: "smooth_stone_slab",
  wall: "andesite_wall",
};

const POLISHED_DIORITE: StoneSet = {
  id: "polished_diorite",
  primary: "polished_diorite",
  accent: "smooth_stone",
  stairs: "polished_diorite_stairs",
  slab: "polished_diorite_slab",
  wall: "diorite_wall",
};

const QUARTZ_ROOF: RoofSet = {
  id: "smooth_quartz",
  stairs: "smooth_quartz_stairs",
  slab: "smooth_quartz_slab",
  solid: "smooth_quartz",
};

const CONCRETE_ROOF: RoofSet = {
  id: "gray_concrete",
  stairs: "quartz_stairs",
  slab: "quartz_slab",
  solid: "gray_concrete",
};

/** The id a document (or an exhibit row) names to get the modern palette. */
export const MODERN_CITY_THEME_ID = "modern_city";

/**
 * Concrete, glass curtain wall, quartz trim; gray, white and blue accents.
 *
 * Deliberately **not** a member of {@link MATERIAL_THEMES}. That array is the
 * pool `pickTheme` draws a *village* from, and a village of concrete towers is
 * not a thing any existing document asked for — adding a fourth entry to the
 * pool would also reroll every seeded draw that has ever been taken from it,
 * which is a change to every golden world for the sake of a palette none of
 * them wanted. It lives in {@link ALL_MATERIAL_THEMES} instead, which is what
 * the by-name lookup consults, so `"theme": "modern_city"` resolves and
 * nothing else moves.
 */
export const MODERN_CITY_THEME: MaterialTheme = Object.freeze({
  id: MODERN_CITY_THEME_ID,
  woods: [CONCRETE_LIGHT, CONCRETE_WHITE, CONCRETE_BLUE],
  stones: [SMOOTH_STONE, POLISHED_DIORITE],
  roofs: [QUARTZ_ROOF, CONCRETE_ROOF],
});

/* -------------------------------------------------------------------------- */
/* the white-quartz palette                                                    */
/* -------------------------------------------------------------------------- */

const QUARTZ_WHITE: WoodSet = {
  id: "quartz_white",
  planks: "quartz_block",
  log: "quartz_pillar",
  stripped: "smooth_quartz",
  stairs: "quartz_stairs",
  slab: "quartz_slab",
  fence: "diorite_wall",
  door: "birch_door",
  trapdoor: "birch_trapdoor",
};

const QUARTZ_BRICK: WoodSet = {
  id: "quartz_brick",
  planks: "quartz_bricks",
  log: "chiseled_quartz_block",
  stripped: "quartz_block",
  stairs: "smooth_quartz_stairs",
  slab: "smooth_quartz_slab",
  fence: "diorite_wall",
  door: "birch_door",
  trapdoor: "birch_trapdoor",
};

const CALCITE_SET: WoodSet = {
  id: "calcite_pale",
  planks: "calcite",
  log: "quartz_pillar",
  stripped: "smooth_quartz",
  stairs: "quartz_stairs",
  slab: "quartz_slab",
  fence: "diorite_wall",
  door: "birch_door",
  trapdoor: "birch_trapdoor",
};

const CALCITE_STONE: StoneSet = {
  id: "calcite",
  primary: "calcite",
  accent: "quartz_block",
  stairs: "quartz_stairs",
  slab: "quartz_slab",
  wall: "diorite_wall",
};

const QUARTZ_STONE: StoneSet = {
  id: "quartz_bricks",
  primary: "quartz_bricks",
  accent: "calcite",
  stairs: "smooth_quartz_stairs",
  slab: "smooth_quartz_slab",
  wall: "diorite_wall",
};

const AMETHYST_ROOF: RoofSet = {
  id: "amethyst",
  stairs: "quartz_stairs",
  slab: "quartz_slab",
  solid: "amethyst_block",
};

/** The id a document (or an intent's `character.materialTheme`) names. */
export const WHITE_QUARTZ_THEME_ID = "white_quartz";

/**
 * Quartz, calcite and a stroke of amethyst — the pale, elegant palette.
 *
 * Like {@link MODERN_CITY_THEME} this is deliberately **not** in
 * {@link MATERIAL_THEMES}: adding a member to that pool rerolls every seeded
 * theme draw ever taken and therefore every golden world. It is reachable by
 * name only, which is exactly what an intent that says "white quartz" wants.
 */
export const WHITE_QUARTZ_THEME: MaterialTheme = Object.freeze({
  id: WHITE_QUARTZ_THEME_ID,
  woods: [QUARTZ_WHITE, QUARTZ_BRICK, CALCITE_SET],
  stones: [CALCITE_STONE, QUARTZ_STONE],
  roofs: [QUARTZ_ROOF, AMETHYST_ROOF],
});

/* -------------------------------------------------------------------------- */
/* the sun-clay palette                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The joinery every sun-clay wall family shares.
 *
 * Acacia, and it is the one *wood* in the theme on purpose: a Mediterranean
 * street is sandstone and plaster with **timber** shutters and doors in it, and
 * acacia is the pinned set's driest, most orange plank family — spruce or dark
 * oak beside sandstone reads as a northern cottage that lost its walls.
 */
const SUN_CLAY_DOOR = "acacia_door";
const SUN_CLAY_TRAPDOOR = "acacia_trapdoor";

/**
 * Cut sandstone ashlar — the town's dressed wall.
 *
 * `WoodSet` is a shape, not a claim about trees (see {@link CONCRETE_LIGHT}):
 * the grammar asks a wall family for a surface, a frame member, an accent, a
 * stair, a slab, a railing, a door and a trapdoor, and the sandstone family
 * answers every one of them from blocks the pinned 1.21.11 set carries.
 */
const SANDSTONE_ASHLAR: WoodSet = {
  id: "sandstone_ashlar",
  planks: "smooth_sandstone",
  log: "cut_sandstone",
  stripped: "sandstone",
  stairs: "sandstone_stairs",
  slab: "sandstone_slab",
  fence: "sandstone_wall",
  door: SUN_CLAY_DOOR,
  trapdoor: SUN_CLAY_TRAPDOOR,
};

/**
 * Lime-washed plaster over a sandstone frame — the white of the reference.
 *
 * `white_terracotta` rather than any of the whites the quartz theme uses: it is
 * a *warm* off-white with a fired grain, which is what limewash on mud plaster
 * looks like, where quartz and calcite are the cold, polished whites that made
 * every Mediterranean prompt come out as a wedding cake.
 */
const PLASTER_WHITE: WoodSet = {
  id: "plaster_white",
  planks: "white_terracotta",
  log: "chiseled_sandstone",
  stripped: "smooth_sandstone",
  stairs: "sandstone_stairs",
  slab: "sandstone_slab",
  fence: "sandstone_wall",
  door: SUN_CLAY_DOOR,
  trapdoor: SUN_CLAY_TRAPDOOR,
};

/** Mud brick over packed mud — the oldest and poorest wall on the street. */
const MUD_BRICK_WALL: WoodSet = {
  id: "mud_brick",
  planks: "mud_bricks",
  log: "packed_mud",
  stripped: "smooth_sandstone",
  stairs: "mud_brick_stairs",
  slab: "mud_brick_slab",
  fence: "mud_brick_wall",
  door: SUN_CLAY_DOOR,
  trapdoor: SUN_CLAY_TRAPDOOR,
};

const SANDSTONE_STONE: StoneSet = {
  id: "sandstone",
  primary: "sandstone",
  accent: "cut_sandstone",
  stairs: "sandstone_stairs",
  slab: "sandstone_slab",
  wall: "sandstone_wall",
};

const SMOOTH_SANDSTONE_STONE: StoneSet = {
  id: "smooth_sandstone",
  primary: "smooth_sandstone",
  accent: "chiseled_sandstone",
  stairs: "smooth_sandstone_stairs",
  slab: "smooth_sandstone_slab",
  wall: "sandstone_wall",
};

const MUD_BRICK_STONE: StoneSet = {
  id: "mud_bricks",
  primary: "mud_bricks",
  accent: "packed_mud",
  stairs: "mud_brick_stairs",
  slab: "mud_brick_slab",
  wall: "mud_brick_wall",
};

/** The pale flat roof — a terrace you could dry figs on. */
const SANDSTONE_TERRACE_ROOF: RoofSet = {
  id: "smooth_sandstone",
  stairs: "smooth_sandstone_stairs",
  slab: "smooth_sandstone_slab",
  solid: "smooth_sandstone",
};

/** The white flat roof: limewash over the same terrace. */
const PLASTER_TERRACE_ROOF: RoofSet = {
  id: "white_plaster",
  stairs: "sandstone_stairs",
  slab: "sandstone_slab",
  solid: "white_terracotta",
};

/** The mud-brick roof of the poorer quarter. */
const MUD_BRICK_ROOF: RoofSet = {
  id: "mud_brick",
  stairs: "mud_brick_stairs",
  slab: "mud_brick_slab",
  solid: "mud_bricks",
};

/** The id a document (or an intent's `character.materialTheme`) names. */
export const SUN_CLAY_THEME_ID = "sun_clay";

/**
 * Sun-baked stone and clay: sandstone, plaster and terracotta.
 *
 * **The gap this fills.** The five themes before it could say northern timber,
 * northern pine, chalk downs, poured concrete and polished quartz — and nothing
 * at all could say *sandstone-and-plaster antiquity*. Every Mediterranean,
 * ancient or desert prompt (Troy, Athens, Jerusalem, an oasis trade town) came
 * out modern-grey or wedding-cake white, which is the medium failing to whisper
 * the one thing the prompt actually said.
 *
 * The read it aims at is the reference imagery: dense sandy-white fabric —
 * sandstone ashlar and lime-washed plaster walls, pale flat roofs, terracotta
 * and mud brick where the town is older or poorer, timber only in the doors.
 * **Ordinary antiquity, not prestige**: unlike {@link WHITE_QUARTZ_THEME} this
 * is the right answer for a plain hill town on the Aegean, not only for a
 * temple.
 *
 * Like {@link MODERN_CITY_THEME} and {@link WHITE_QUARTZ_THEME} it is
 * deliberately **not** in {@link MATERIAL_THEMES}: a member added to that pool
 * rerolls every seeded theme draw ever taken and therefore every shipped world.
 * It is reachable by name only.
 */
export const SUN_CLAY_THEME: MaterialTheme = Object.freeze({
  id: SUN_CLAY_THEME_ID,
  // The one dry palette in the tree (2026-08-11) — see `aridAmbient`.
  aridAmbient: true,
  // All sandstone, by design (Kai, walking Troy 2026-08-12): the derived wall
  // took its body from the ground roles, which are mud brick and fired brick
  // here, and a brick curtain under sandstone merlons read as a mistake. The
  // circuit is the one thing seen from outside the town, so it is cut from the
  // town's own dressed stone: sandstone body, smooth sandstone walk and towers,
  // cut sandstone parapet, chiseled merlons for the crenellation to read.
  curtain: {
    core: "minecraft:sandstone",
    walk: "minecraft:smooth_sandstone",
    parapet: "minecraft:cut_sandstone",
    merlon: "minecraft:chiseled_sandstone",
    tower: "minecraft:smooth_sandstone",
  },
  woods: [SANDSTONE_ASHLAR, PLASTER_WHITE, MUD_BRICK_WALL],
  stones: [SANDSTONE_STONE, SMOOTH_SANDSTONE_STONE, MUD_BRICK_STONE],
  roofs: [SANDSTONE_TERRACE_ROOF, PLASTER_TERRACE_ROOF, BRICK_ROOF, MUD_BRICK_ROOF],
});

/** Every theme that can be asked for **by name**, drawable or not. */
export const ALL_MATERIAL_THEMES: readonly MaterialTheme[] = Object.freeze([
  ...MATERIAL_THEMES,
  MODERN_CITY_THEME,
  WHITE_QUARTZ_THEME,
  SUN_CLAY_THEME,
]);

/** The theme a world is built in, drawn from the settlement's node seed. */
export function pickTheme(seed: Seed256, override?: string): MaterialTheme {
  if (override !== undefined) {
    const named = ALL_MATERIAL_THEMES.find((t) => t.id === override);
    if (named !== undefined) return named;
  }
  const rng = new Rng(streamSeed(seed, "theme"));
  return MATERIAL_THEMES[rng.int(0, MATERIAL_THEMES.length - 1)] as MaterialTheme;
}

/**
 * Deal one distinct (wood, stone, roof) triple to each of `count` buildings.
 *
 * The full product is enumerated in a fixed order, shuffled once with a seeded
 * Fisher-Yates, and dealt round-robin. Distinctness holds up to
 * `woods · roofs` buildings; past that the deal wraps, which is the documented
 * "unless the palette is exhausted" case.
 */
export function assignMaterials(
  theme: MaterialTheme,
  count: number,
  seed: Seed256,
): BuildingMaterials[] {
  const product: BuildingMaterials[] = [];
  for (const [wi, w] of theme.woods.entries()) {
    for (const [ri, r] of theme.roofs.entries()) {
      // The stone rotates with the pair so a wood is never welded to one stone.
      const stone = theme.stones[(wi + ri) % theme.stones.length] as StoneSet;
      product.push({ wood: w, roof: r, stone });
    }
  }
  const rng = new Rng(streamSeed(seed, "theme.deal"));
  for (let i = product.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = product[i] as BuildingMaterials;
    product[i] = product[j] as BuildingMaterials;
    product[j] = tmp;
  }
  const out: BuildingMaterials[] = [];
  for (let i = 0; i < count; i++) out.push(product[i % product.length] as BuildingMaterials);
  return out;
}

/** The identity a uniqueness test compares: the (wall, trim, roof) triple. */
export function materialKey(m: BuildingMaterials): string {
  return `${m.wood.planks}|${m.stone.primary}|${m.roof.stairs}`;
}

/**
 * Flatten a triple into the grammar's symbol → block-id map.
 *
 * Everything the grammar can place has a symbol here, which is what lets a
 * document override any single one through `style.palettes` without knowing how
 * the theme was chosen.
 */
export function styleOf(m: BuildingMaterials): Record<string, string> {
  return {
    "wall.primary": m.wood.planks,
    "wall.frame": m.wood.stripped,
    "wall.accent": m.wood.log,
    "wall.window": "glass_pane",
    "wall.fence": m.wood.fence,
    "wall.trapdoor": m.wood.trapdoor,
    "roof.stairs": m.roof.stairs,
    "roof.slab": m.roof.slab,
    "roof.solid": m.roof.solid,
    "foundation.primary": m.stone.primary,
    "foundation.accent": m.stone.accent,
    "stone.stairs": m.stone.stairs,
    "stone.slab": m.stone.slab,
    "stone.wall": m.stone.wall,
    "floor.interior": m.wood.planks,
    "stair.interior": m.wood.stairs,
    "door.block": m.wood.door,
    "light.lantern": "lantern",
    "light.torch": "torch",
    "chimney.block": "cobblestone",
    "chimney.rim": "cobblestone_wall",
  };
}
