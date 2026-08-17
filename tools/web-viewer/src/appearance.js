/**
 * How a block *looks* and *occupies space* in the viewer.
 *
 * Two layers, and the lower one is load-bearing. Underneath is a flat colour
 * per block family and a rough box: no assets, nothing to license, and a
 * deterministic pastel for anything unlisted so an unknown block is visible
 * and stable rather than invisible. On top of it sits `textures.js`, which
 * names a real texture per face for the blocks a libre Luanti pack has one
 * for. A block the texture table misses does not fall through a crack — it
 * renders exactly as it did when there were no textures at all.
 *
 * No Mojang assets are involved at either layer, and none ever will be.
 */

import { cellOf } from "./atlas.js";
import { resolveFaces, textureOf } from "./textures.js";

/** Wood species: planks, log, stripped log, leaves. */
const WOOD = {
  oak: { planks: [162, 130, 78], log: [109, 85, 50], leaves: [72, 111, 40] },
  spruce: { planks: [104, 78, 47], log: [58, 37, 16], leaves: [56, 88, 56] },
  birch: { planks: [196, 179, 123], log: [216, 215, 210], leaves: [128, 167, 85] },
  jungle: { planks: [154, 110, 77], log: [85, 67, 25], leaves: [59, 121, 24] },
  acacia: { planks: [168, 90, 50], log: [104, 97, 88], leaves: [96, 138, 47] },
  dark_oak: { planks: [66, 43, 20], log: [60, 46, 26], leaves: [63, 99, 34] },
  mangrove: { planks: [117, 54, 48], log: [84, 48, 41], leaves: [92, 138, 51] },
  cherry: { planks: [226, 177, 172], log: [86, 55, 60], leaves: [232, 171, 199] },
  pale_oak: { planks: [225, 219, 208], log: [110, 106, 98], leaves: [135, 150, 116] },
  bamboo: { planks: [197, 168, 74], log: [126, 148, 55], leaves: [102, 148, 52] },
  crimson: { planks: [101, 48, 70], log: [92, 25, 29], leaves: [122, 9, 16] },
  warped: { planks: [43, 104, 99], log: [58, 58, 92], leaves: [22, 119, 121] },
};

/** The 16 dyes: wool, concrete, terracotta, carpet, glass, banners, beds. */
const DYE = {
  white: [233, 236, 236],
  orange: [240, 118, 19],
  magenta: [189, 68, 179],
  light_blue: [58, 175, 217],
  yellow: [248, 198, 39],
  lime: [112, 185, 25],
  pink: [237, 141, 172],
  gray: [62, 68, 71],
  light_gray: [142, 142, 134],
  cyan: [21, 137, 145],
  purple: [121, 42, 172],
  blue: [53, 57, 157],
  brown: [114, 71, 40],
  green: [84, 109, 27],
  red: [160, 39, 34],
  black: [25, 25, 25],
};

/** Exact names, checked before any family rule. */
const EXACT = {
  stone: [125, 125, 125],
  cobblestone: [122, 122, 122],
  mossy_cobblestone: [104, 116, 90],
  smooth_stone: [158, 158, 158],
  stone_bricks: [122, 122, 122],
  chiseled_stone_bricks: [118, 118, 118],
  deepslate: [80, 80, 84],
  tuff: [108, 109, 102],
  calcite: [223, 224, 220],
  andesite: [136, 136, 137],
  diorite: [188, 188, 189],
  granite: [149, 103, 85],
  polished_blackstone: [53, 48, 56],
  blackstone: [42, 36, 42],
  gilded_blackstone: [72, 54, 44],
  bedrock: [85, 85, 85],
  gravel: [131, 127, 126],
  clay: [160, 166, 179],
  dirt: [134, 96, 67],
  coarse_dirt: [119, 85, 59],
  rooted_dirt: [144, 103, 76],
  podzol: [91, 65, 30],
  dirt_path: [148, 122, 66],
  farmland: [96, 63, 32],
  grass_block: [106, 148, 66],
  moss_block: [89, 109, 45],
  sand: [219, 207, 163],
  red_sand: [190, 102, 33],
  sandstone: [216, 203, 155],
  snow: [249, 254, 254],
  snow_block: [249, 254, 254],
  ice: [145, 183, 253],
  packed_ice: [141, 180, 250],
  water: [58, 104, 190],
  lava: [225, 116, 21],
  glass: [200, 226, 234],
  glass_pane: [200, 226, 234],
  bricks: [150, 97, 83],
  quartz_block: [235, 229, 222],
  smooth_quartz: [235, 229, 222],
  quartz_bricks: [232, 226, 218],
  quartz_pillar: [234, 229, 222],
  chiseled_quartz_block: [232, 226, 218],
  hay_block: [166, 138, 24],
  bookshelf: [143, 116, 72],
  lectern: [156, 121, 68],
  barrel: [124, 96, 55],
  chest: [162, 130, 78],
  crafting_table: [123, 85, 51],
  composter: [107, 77, 43],
  cartography_table: [104, 87, 66],
  smithing_table: [55, 56, 68],
  campfire: [186, 118, 51],
  tnt: [180, 55, 45],
  anvil: [70, 70, 70],
  iron_block: [220, 220, 220],
  iron_bars: [166, 170, 174],
  iron_chain: [90, 94, 104],
  chain: [90, 94, 104],
  gold_block: [246, 208, 61],
  lapis_block: [30, 67, 140],
  bone_block: [229, 225, 203],
  amethyst_block: [134, 97, 189],
  amethyst_cluster: [175, 138, 226],
  budding_amethyst: [127, 90, 182],
  prismarine: [99, 156, 146],
  prismarine_bricks: [99, 171, 158],
  dark_prismarine: [52, 90, 74],
  sea_lantern: [200, 227, 219],
  glowstone: [240, 210, 140],
  lantern: [246, 197, 118],
  soul_lantern: [126, 214, 218],
  torch: [252, 215, 120],
  wall_torch: [252, 215, 120],
  end_rod: [232, 228, 220],
  lightning_rod: [176, 122, 96],
  copper_block: [192, 107, 79],
  cut_copper: [191, 106, 80],
  exposed_copper: [161, 125, 104],
  exposed_cut_copper: [161, 125, 104],
  weathered_copper: [108, 153, 116],
  weathered_cut_copper: [108, 153, 116],
  oxidized_copper: [82, 162, 132],
  oxidized_cut_copper: [82, 162, 132],
  short_grass: [104, 156, 62],
  tall_grass: [104, 156, 62],
  fern: [96, 148, 60],
  large_fern: [96, 148, 60],
  seagrass: [63, 131, 44],
  tall_seagrass: [63, 131, 44],
  kelp: [79, 129, 45],
  kelp_plant: [79, 129, 45],
  glow_lichen: [124, 140, 116],
  vine: [72, 111, 40],
  moss_carpet: [89, 109, 45],
  brown_mushroom: [151, 109, 77],
  red_mushroom: [200, 60, 58],
  poppy: [180, 50, 45],
  dandelion: [242, 214, 63],
  cornflower: [70, 106, 200],
  azure_bluet: [222, 226, 232],
  oxeye_daisy: [235, 238, 230],
  allium: [175, 138, 226],
  blue_orchid: [47, 181, 199],
  lily_of_the_valley: [235, 240, 235],
  red_tulip: [190, 52, 40],
  orange_tulip: [222, 128, 44],
  white_tulip: [232, 236, 232],
  pink_tulip: [232, 170, 200],
  dead_bush: [148, 112, 60],
  sweet_berry_bush: [92, 118, 62],
  pink_petals: [232, 171, 199],
  wither_rose: [40, 40, 40],
  flower_pot: [126, 80, 62],
  ladder: [143, 112, 65],
  lever: [124, 100, 72],
  tripwire_hook: [140, 120, 90],
  hopper: [70, 70, 74],
  dispenser: [110, 110, 110],
  bell: [232, 190, 84],
  scaffolding: [190, 155, 90],
};

/** A deterministic pastel for a block nobody has coloured yet. */
export function fallbackColor(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const hue = (hash % 360) / 360;
  const sat = 0.28 + ((hash >>> 9) % 20) / 100;
  const light = 0.5 + ((hash >>> 17) % 20) / 100;
  return hslToRgb(hue, sat, light);
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}

/** Strip the shape suffixes that never change a block's colour. */
const SHAPE_SUFFIXES = [
  "_stairs",
  "_slab",
  "_wall",
  "_fence_gate",
  "_fence",
  "_pane",
  "_trapdoor",
  "_door",
  "_button",
  "_pressure_plate",
  "_sign",
  "_wall_sign",
  "_wall_banner",
  "_banner",
  "_carpet",
  "_bed",
  "_candle",
];

function baseName(name) {
  let out = name.startsWith("potted_") ? name.slice("potted_".length) : name;
  for (const suffix of SHAPE_SUFFIXES) {
    if (out.endsWith(suffix) && out !== suffix.slice(1)) {
      out = out.slice(0, -suffix.length);
      break;
    }
  }
  return out;
}

/** sRGB 0-255 for a block name. Never returns undefined. */
export function colorOf(name) {
  const direct = EXACT[name];
  if (direct !== undefined) return direct;

  const base = baseName(name);
  const exactBase = EXACT[base];
  if (exactBase !== undefined) return exactBase;

  for (const [species, tones] of Object.entries(WOOD)) {
    if (base === species || base.startsWith(`${species}_`) || base.startsWith(`stripped_${species}`)) {
      if (base.includes("leaves")) return tones.leaves;
      if (base.includes("log") || base.includes("wood") || base.includes("stem")) return tones.log;
      return tones.planks;
    }
  }
  if (base.endsWith("_leaves")) return [76, 118, 44];

  for (const [dye, rgb] of Object.entries(DYE)) {
    if (base === `${dye}_wool` || base === `${dye}_concrete` || base === `${dye}_terracotta` ||
        base === `${dye}_concrete_powder` || base === `${dye}_stained_glass` ||
        base === `${dye}_glazed_terracotta` || base === dye) {
      return rgb;
    }
  }
  if (base.endsWith("_terracotta")) return [152, 94, 67];
  if (base.startsWith("deepslate")) return [80, 80, 84];
  if (base.startsWith("polished_")) return colorOf(base.slice("polished_".length));
  if (base.startsWith("mossy_")) return [104, 116, 90];
  if (base.startsWith("cut_") || base.startsWith("smooth_") || base.startsWith("chiseled_")) {
    return colorOf(base.slice(base.indexOf("_") + 1));
  }
  return fallbackColor(name);
}

/** Blocks that glow: drawn at full brightness, unshaded. */
const EMISSIVE = new Set([
  "glowstone",
  "sea_lantern",
  "lantern",
  "soul_lantern",
  "torch",
  "wall_torch",
  "soul_torch",
  "soul_wall_torch",
  "end_rod",
  "shroomlight",
  "campfire",
  "soul_campfire",
  "magma_block",
  "lava",
  "jack_o_lantern",
  "redstone_lamp",
  "amethyst_cluster",
  "candle",
  "white_candle",
  "ochre_froglight",
  "verdant_froglight",
  "pearlescent_froglight",
]);

/** Fluids and glassy blocks: drawn as full cubes, but see-through. */
const TRANSLUCENT = new Map([
  ["water", 0.62],
  ["ice", 0.7],
  ["packed_ice", 0.85],
  ["blue_ice", 0.85],
  ["glass", 0.35],
  ["glass_pane", 0.35],
  ["tinted_glass", 0.5],
  ["honey_block", 0.7],
  ["slime_block", 0.7],
]);

/**
 * Plants: two diagonal quads, corner to corner, exactly as Minecraft draws
 * them. Anything in here is `render: "cross"` — alpha-cutout, never merged,
 * never occluding, and (see `physics.js`) never solid to walk into. A cube
 * with a plant texture on it is the single ugliest thing this viewer has ever
 * drawn; Kai found a meadow of them on his 2026-08-17 walk.
 */
const CROSS = new Set([
  "short_grass",
  "grass",
  "tall_grass",
  "fern",
  "large_fern",
  "seagrass",
  "tall_seagrass",
  "kelp",
  "kelp_plant",
  "vine",
  "glow_lichen",
  "sugar_cane",
  "dead_bush",
  "sweet_berry_bush",
  "brown_mushroom",
  "red_mushroom",
  "poppy",
  "dandelion",
  "cornflower",
  "azure_bluet",
  "oxeye_daisy",
  "allium",
  "blue_orchid",
  "lily_of_the_valley",
  "torchflower",
  "wither_rose",
  "red_tulip",
  "orange_tulip",
  "white_tulip",
  "pink_tulip",
  "rose_bush",
  "peony",
  "lilac",
  "sunflower",
  "nether_wart",
  "crimson_roots",
  "warped_roots",
  "nether_sprouts",
  "bamboo",
  "bamboo_sapling",
  "cave_vines",
  "cave_vines_plant",
  "twisting_vines",
  "twisting_vines_plant",
  "weeping_vines",
  "weeping_vines_plant",
  "hanging_roots",
  "wheat",
  "carrots",
  "potatoes",
  "beetroots",
]);

/** Ground cover: one flat quad lying just above the floor. */
const FLAT = new Set(["pink_petals", "wildflowers", "leaf_litter"]);

/**
 * The shape of a plant name nobody listed. Deliberately narrow, and only ever
 * consulted for a block the exporter could *not* prove is a full cube, so a
 * `grass_block` or a `mushroom_stem` never reaches it.
 */
const PLANTISH =
  /(^|_)(grass|fern|flower|flowers|sapling|mushroom|bush|shrub|roots|sprouts|vines|petals|tulip|orchid|lily|seagrass|kelp|wart|sugar_cane)($|_)/;

/** Is this name drawn as a plant rather than as a box? */
export function isCross(name) {
  return CROSS.has(name) || name.endsWith("_sapling");
}

/** Things with no real volume that are still boxes; drawn as a small one. */
const SMALL = new Set([
  "flower_pot",
  "torch",
  "wall_torch",
  "soul_torch",
  "soul_wall_torch",
  "lever",
  "tripwire_hook",
  "end_rod",
  "lightning_rod",
  "lantern",
  "soul_lantern",
  "chain",
  "iron_chain",
  "bell",
  "candle",
]);

const FULL = [0, 0, 0, 1, 1, 1];

/**
 * The box a block fills, in unit-cube coordinates, plus whether a neighbour may
 * cull its face against it. An approximation on purpose: stairs are cubes here,
 * because a POC that draws every stair as seven boxes buys pixels nobody is
 * judging yet and costs frames everybody is.
 */
export function shapeOf(name, solidFlag) {
  // `render` defaults to "box": every rule below that does not say otherwise
  // is describing a box, and the mesher must never see the field missing.
  return { render: "box", ...shapeRules(name, solidFlag) };
}

function shapeRules(name, solidFlag) {
  const base = name.startsWith("potted_") ? "flower_pot" : name;
  if (TRANSLUCENT.has(base)) {
    // A fluid stops just short of the top so its surface reads as a surface.
    const height = base === "water" ? 0.9 : 1;
    return { box: [0, 0, 0, 1, height, 1], occludes: false, sameCulls: true, render: "box" };
  }
  // A plant is not a box at all. It keeps a box anyway — a nominal one, the
  // footprint the cross sweeps — because everything downstream (merging rules,
  // the debug wireframe) reads `box`, and nothing downstream may treat it as
  // geometry: `render` is what decides that.
  if (isCross(base)) {
    return { box: [0, 0, 0, 1, 1, 1], occludes: false, sameCulls: false, render: "cross" };
  }
  if (FLAT.has(base)) {
    return { box: [0, 0, 0, 1, 0.0625, 1], occludes: false, sameCulls: false, render: "flat" };
  }
  if (SMALL.has(base)) return { box: [0.3, 0, 0.3, 0.7, 0.8, 0.7], occludes: false, sameCulls: false };
  if (base.endsWith("_carpet") || base === "snow" || base.endsWith("_pressure_plate")) {
    return { box: [0, 0, 0, 1, 0.08, 1], occludes: false, sameCulls: false };
  }
  if (base.endsWith("_slab")) return { box: [0, 0, 0, 1, 0.5, 1], occludes: false, sameCulls: false };
  if (base.endsWith("_trapdoor")) return { box: [0, 0, 0, 1, 0.19, 1], occludes: false, sameCulls: false };
  if (base.endsWith("_door")) return { box: [0, 0, 0, 1, 1, 0.19], occludes: false, sameCulls: false };
  if (base.endsWith("_pane") || base.endsWith("_bars")) {
    return { box: [0.44, 0, 0.44, 0.56, 1, 0.56], occludes: false, sameCulls: false };
  }
  if (base.endsWith("_fence") || base.endsWith("_fence_gate") || base.endsWith("_wall")) {
    return { box: [0.34, 0, 0.34, 0.66, 1, 0.66], occludes: false, sameCulls: false };
  }
  if (base.endsWith("_banner") || base.endsWith("_sign")) {
    return { box: [0, 0.2, 0.4, 1, 1, 0.6], occludes: false, sameCulls: false };
  }
  if (base.endsWith("_stairs")) return { box: FULL, occludes: true, sameCulls: false };
  if (base === "ladder") return { box: [0, 0, 0, 1, 1, 0.12], occludes: false, sameCulls: false };
  if (base.endsWith("_bed")) return { box: [0, 0, 0, 1, 0.56, 1], occludes: false, sameCulls: false };
  if (base === "cauldron" || base === "water_cauldron" || base === "hopper" || base === "composter") {
    return { box: FULL, occludes: true, sameCulls: false };
  }
  // A plant name the table has never heard of. It gets no texture and keeps
  // its flat colour — but it gets that colour as a *cross*, because the one
  // thing worse than an unknown flower is an unknown flower drawn as a cube.
  if (!solidFlag && PLANTISH.test(base)) {
    return { box: [0, 0, 0, 1, 1, 1], occludes: false, sameCulls: false, render: "cross" };
  }
  // Fall back on what the exporter measured: `isFullCube` is conservative, so
  // "true" is trustworthy and "false" only means "we could not prove it".
  if (solidFlag) return { box: FULL, occludes: true, sameCulls: false };
  return { box: [0.15, 0, 0.15, 0.85, 0.95, 0.85], occludes: false, sameCulls: false };
}

/**
 * A block you walk *up* rather than into.
 *
 * Stairs, and only stairs. The mesher draws one as a full cube, so the honest
 * 0.6 step refuses it and a staircase turns into a ladder of jumps; flagging it
 * here is what lets `physics.js` give it a step of a whole block. When stairs
 * are meshed as real steps, this goes away.
 */
/**
 * How tall the block is to walk into: 0 for something you pass straight
 * through, 1 for a cube, and the box's own height for everything in between.
 *
 * This is the *only* thing `physics.js` knows about blocks, and it is why a
 * slab is a step rather than a wall and a meadow is not a maze. Fluids are 0 —
 * they are buoyant, which the controller handles separately — and so is every
 * plant, which is the collision half of "plants are not cubes".
 */
export function isClimbable(name) {
  return name.endsWith("_stairs");
}

export function collisionHeight(name, shape) {
  const base = name.startsWith("potted_") ? "flower_pot" : name;
  if (shape.render === "cross" || shape.render === "flat") return 0;
  if (base === "water" || base === "lava" || base === "bubble_column") return 0;
  return shape.box[4];
}

/**
 * The six atlas cells and the tint for one block.
 *
 * Three outcomes, and only three. A block the texture table knows gets its
 * cells and a white tint (or a real tint, where the pack has one texture and
 * we have sixteen colours of it). A block it does not know — or one the atlas
 * has an incomplete set of faces for — gets no cells at all and its flat
 * colour as the tint, which is the pre-texture look, unchanged. And with no
 * atlas at hand (node, tests, a page whose textures failed to load) *every*
 * block takes that second path.
 */
function facesOf(name, layout) {
  const flat = { faces: undefined, tint: colorOf(name) };
  if (layout === undefined) return flat;
  const spec = textureOf(name);
  const files = resolveFaces(spec);
  if (files === undefined || files.some((file) => file === undefined)) return flat;
  return {
    faces: files.map((file) => cellOf(layout, file)),
    tint: spec.tint ?? [255, 255, 255],
  };
}

/**
 * Resolve a whole palette once, at load: colour, shape, alpha, emissivity and
 * texture per index. The mesher does no string work at all.
 *
 * `layout` is the atlas from `atlas.js`; omit it and the palette resolves to
 * the flat-colour viewer this started as, which is what the node tests use.
 */
export function resolvePalette(palette, solid, layout) {
  return palette.map((name, index) => {
    if (index === 0) {
      return {
        name,
        color: [0, 0, 0],
        tint: [0, 0, 0],
        faces: undefined,
        box: FULL,
        occludes: false,
        sameCulls: false,
        render: "box",
        collide: 0,
        climb: false,
        alpha: 1,
        emissive: false,
        air: true,
      };
    }
    const shape = shapeOf(name, solid?.[index] === true);
    const base = name.startsWith("potted_") ? "flower_pot" : name;
    const skin = facesOf(name, layout);
    return {
      name,
      color: colorOf(name),
      tint: skin.tint,
      faces: skin.faces,
      box: shape.box,
      occludes: shape.occludes,
      sameCulls: shape.sameCulls,
      render: shape.render,
      collide: collisionHeight(name, shape),
      climb: isClimbable(name),
      alpha: TRANSLUCENT.get(base) ?? 1,
      emissive: EMISSIVE.has(base),
      air: false,
    };
  });
}

/** Every texture file this palette will ask the atlas for. */
export function texturesFor(palette) {
  const wanted = new Set();
  for (const name of palette) {
    const files = resolveFaces(textureOf(name));
    if (files === undefined || files.some((file) => file === undefined)) continue;
    for (const file of files) wanted.add(file);
  }
  return [...wanted].sort();
}
