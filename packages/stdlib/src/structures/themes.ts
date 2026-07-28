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

/** A village-wide palette: the sets every building in it draws from. */
export interface MaterialTheme {
  readonly id: string;
  readonly woods: readonly WoodSet[];
  readonly stones: readonly StoneSet[];
  readonly roofs: readonly RoofSet[];
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

/** The theme a world is built in, drawn from the settlement's node seed. */
export function pickTheme(seed: Seed256, override?: string): MaterialTheme {
  if (override !== undefined) {
    const named = MATERIAL_THEMES.find((t) => t.id === override);
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
