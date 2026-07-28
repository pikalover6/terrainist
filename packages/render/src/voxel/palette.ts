/**
 * Vendored 2026-07-27 from the mcai prototype (packages/voxel-renderer);
 * carried over as proven code per docs/DESIGN.md. Only change: the optional
 * fields of BlockAppearance are widened with `| undefined`, which our
 * `exactOptionalPropertyTypes` requires and the prototype's tsconfig did not.
 */

/**
 * Average texture colours for Minecraft Java 1.21 blocks.
 *
 * The renderer's whole job is to let a person judge a generated world at a
 * glance, so the palette has to keep materials apart: oak from spruce, cobble
 * from stone brick, grass from moss. Colours are rough averages of the real
 * textures, not saturated primaries — a world rendered from this table should
 * look like a muted photograph of the world, not a chart.
 */

export interface BlockAppearance {
  /** Average texture colour, sRGB 0-255. */
  color: [number, number, number];
  /** 1 = opaque. Below 1 the renderer blends, for glass, water and ice. */
  alpha?: number | undefined;
  /** Does not fill its cell: plants, torches, rails, carpets, panes, fences. */
  thin?: boolean | undefined;
  /** Light source; the renderer brightens it. */
  emissive?: boolean | undefined;
}

export const DEFAULT_COLOR: [number, number, number] = [150, 140, 130];

const AIR_IDS = new Set(["air", "cave_air", "void_air", "structure_void", "barrier", "light", "moving_piston"]);

/** Wood tones, reused by every shape variant of each species. */
const WOOD: Record<string, { planks: [number, number, number]; log: [number, number, number]; stripped: [number, number, number]; leaves: [number, number, number] }> = {
  oak: { planks: [162, 130, 78], log: [109, 85, 50], stripped: [177, 143, 87], leaves: [72, 111, 40] },
  spruce: { planks: [104, 78, 47], log: [58, 37, 16], stripped: [141, 108, 66], leaves: [56, 88, 56] },
  birch: { planks: [196, 179, 123], log: [216, 215, 210], stripped: [196, 176, 121], leaves: [128, 167, 85] },
  jungle: { planks: [154, 110, 77], log: [85, 67, 25], stripped: [171, 132, 84], leaves: [59, 121, 24] },
  acacia: { planks: [168, 90, 50], log: [104, 97, 88], stripped: [174, 92, 59], leaves: [96, 138, 47] },
  dark_oak: { planks: [66, 43, 20], log: [60, 46, 26], stripped: [90, 65, 35], leaves: [63, 99, 34] },
  mangrove: { planks: [117, 54, 48], log: [84, 48, 41], stripped: [123, 55, 48], leaves: [92, 138, 51] },
  cherry: { planks: [226, 177, 172], log: [86, 55, 60], stripped: [214, 145, 130], leaves: [232, 171, 199] },
  pale_oak: { planks: [225, 219, 208], log: [110, 106, 98], stripped: [214, 207, 195], leaves: [135, 150, 116] },
  bamboo: { planks: [197, 168, 74], log: [126, 148, 55], stripped: [193, 162, 71], leaves: [102, 148, 52] },
  crimson: { planks: [101, 48, 70], log: [92, 25, 29], stripped: [122, 57, 85], leaves: [122, 9, 16] },
  warped: { planks: [43, 104, 99], log: [58, 58, 92], stripped: [58, 152, 148], leaves: [22, 119, 121] },
};

/** The 16 dye colours, used for wool, concrete, terracotta, glass, carpet, beds. */
const DYE: Record<string, [number, number, number]> = {
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
  red: [161, 39, 34],
  black: [25, 25, 29],
};

/** Terracotta is the dye colour muted toward fired clay. */
function terracotta(dye: [number, number, number]): [number, number, number] {
  return [Math.round(dye[0] * 0.55 + 152 * 0.45), Math.round(dye[1] * 0.55 + 94 * 0.45), Math.round(dye[2] * 0.55 + 67 * 0.45)];
}

/** Ore textures read as their host rock with a minority of mineral flecks. */
function ore(rock: [number, number, number], mineral: [number, number, number]): [number, number, number] {
  return [Math.round(rock[0] * 0.65 + mineral[0] * 0.35), Math.round(rock[1] * 0.65 + mineral[1] * 0.35), Math.round(rock[2] * 0.65 + mineral[2] * 0.35)];
}

const STONE: [number, number, number] = [125, 125, 125];
const DEEPSLATE: [number, number, number] = [78, 78, 80];
const NETHERRACK: [number, number, number] = [111, 54, 52];

export const BLOCK_APPEARANCE: Record<string, BlockAppearance> = {
  // Stone family
  stone: { color: STONE },
  cobblestone: { color: [127, 127, 127] },
  mossy_cobblestone: { color: [110, 118, 96] },
  smooth_stone: { color: [159, 159, 159] },
  stone_bricks: { color: [122, 121, 122] },
  mossy_stone_bricks: { color: [113, 121, 105] },
  cracked_stone_bricks: { color: [118, 117, 117] },
  chiseled_stone_bricks: { color: [120, 119, 120] },
  andesite: { color: [136, 136, 137] },
  polished_andesite: { color: [132, 134, 133] },
  diorite: { color: [188, 187, 189] },
  polished_diorite: { color: [192, 193, 195] },
  granite: { color: [149, 103, 86] },
  polished_granite: { color: [154, 106, 89] },
  tuff: { color: [108, 109, 102] },
  polished_tuff: { color: [98, 100, 94] },
  tuff_bricks: { color: [93, 95, 89] },
  calcite: { color: [223, 224, 220] },
  dripstone_block: { color: [134, 107, 91] },
  deepslate: { color: DEEPSLATE },
  cobbled_deepslate: { color: [77, 77, 80] },
  polished_deepslate: { color: [72, 72, 74] },
  deepslate_bricks: { color: [71, 71, 73] },
  deepslate_tiles: { color: [54, 54, 56] },
  cracked_deepslate_bricks: { color: [69, 69, 71] },
  cracked_deepslate_tiles: { color: [53, 53, 55] },
  chiseled_deepslate: { color: [55, 55, 57] },
  reinforced_deepslate: { color: [87, 91, 84] },
  bedrock: { color: [85, 85, 85] },
  blackstone: { color: [42, 36, 41] },
  polished_blackstone: { color: [53, 50, 60] },
  polished_blackstone_bricks: { color: [48, 44, 51] },
  gilded_blackstone: { color: [69, 45, 39] },
  basalt: { color: [80, 80, 86] },
  smooth_basalt: { color: [72, 72, 78] },
  polished_basalt: { color: [99, 98, 100] },
  obsidian: { color: [21, 18, 30] },
  crying_obsidian: { color: [36, 14, 66] },
  netherrack: { color: NETHERRACK },
  magma_block: { color: [142, 63, 31], emissive: true },
  end_stone: { color: [221, 223, 165] },
  end_stone_bricks: { color: [219, 226, 172] },
  purpur_block: { color: [169, 125, 169] },
  purpur_pillar: { color: [173, 130, 173] },
  prismarine: { color: [99, 156, 145] },
  prismarine_bricks: { color: [99, 171, 158] },
  dark_prismarine: { color: [51, 91, 75] },
  sea_lantern: { color: [172, 199, 190], emissive: true },
  quartz_block: { color: [235, 229, 222] },
  smooth_quartz: { color: [236, 230, 224] },
  chiseled_quartz_block: { color: [231, 226, 218] },
  quartz_bricks: { color: [234, 228, 220] },
  quartz_pillar: { color: [235, 230, 223] },
  mud: { color: [60, 57, 61] },
  packed_mud: { color: [142, 106, 78] },
  mud_bricks: { color: [137, 103, 78] },
  resin_bricks: { color: [211, 106, 26] },
  bricks: { color: [150, 97, 83] },
  nether_bricks: { color: [44, 22, 26] },
  red_nether_bricks: { color: [69, 6, 8] },
  cracked_nether_bricks: { color: [42, 21, 25] },
  chiseled_nether_bricks: { color: [47, 24, 28] },

  // Dirt and ground
  dirt: { color: [134, 96, 67] },
  coarse_dirt: { color: [119, 85, 59] },
  rooted_dirt: { color: [144, 103, 76] },
  grass_block: { color: [124, 152, 73] },
  podzol: { color: [91, 64, 27] },
  mycelium: { color: [111, 99, 100] },
  dirt_path: { color: [148, 121, 65] },
  farmland: { color: [96, 62, 33] },
  clay: { color: [160, 166, 179] },
  gravel: { color: [131, 127, 126] },
  sand: { color: [219, 207, 163] },
  red_sand: { color: [190, 102, 33] },
  sandstone: { color: [216, 203, 155] },
  smooth_sandstone: { color: [219, 208, 162] },
  cut_sandstone: { color: [217, 205, 158] },
  chiseled_sandstone: { color: [216, 204, 157] },
  red_sandstone: { color: [186, 99, 29] },
  smooth_red_sandstone: { color: [190, 102, 33] },
  cut_red_sandstone: { color: [190, 102, 33] },
  snow: { color: [249, 254, 254], thin: true },
  snow_block: { color: [249, 254, 254] },
  powder_snow: { color: [248, 253, 253] },
  ice: { color: [145, 183, 253], alpha: 0.7 },
  packed_ice: { color: [141, 180, 250] },
  blue_ice: { color: [116, 168, 253] },
  frosted_ice: { color: [145, 183, 253], alpha: 0.7 },
  soul_sand: { color: [81, 62, 50] },
  soul_soil: { color: [75, 57, 46] },
  moss_block: { color: [89, 109, 45] },
  pale_moss_block: { color: [103, 112, 96] },
  mangrove_roots: { color: [92, 71, 49] },
  muddy_mangrove_roots: { color: [70, 57, 47] },
  bone_block: { color: [209, 205, 179] },
  hay_block: { color: [166, 138, 21] },
  dried_kelp_block: { color: [50, 60, 42] },
  sponge: { color: [195, 192, 74] },
  wet_sponge: { color: [172, 185, 79] },
  slime_block: { color: [111, 192, 91], alpha: 0.8 },
  honey_block: { color: [251, 179, 62], alpha: 0.85 },
  honeycomb_block: { color: [229, 148, 30] },
  sculk: { color: [10, 24, 31] },
  sculk_catalyst: { color: [24, 37, 44] },
  sculk_sensor: { color: [24, 56, 65] },
  sculk_shrieker: { color: [57, 62, 55] },
  sculk_vein: { color: [16, 32, 40], thin: true },
  spawner: { color: [45, 55, 68] },
  end_portal_frame: { color: [86, 116, 96] },
  dragon_egg: { color: [12, 9, 15] },
  decorated_pot: { color: [158, 96, 74], thin: true },
  turtle_egg: { color: [225, 226, 187], thin: true },
  frogspawn: { color: [102, 89, 79], thin: true },
  pointed_dripstone: { color: [130, 103, 88], thin: true },
  amethyst_block: { color: [133, 97, 191] },
  budding_amethyst: { color: [140, 105, 196] },
  amethyst_cluster: { color: [166, 125, 216], thin: true, emissive: true },

  // Ores and mineral blocks
  coal_ore: { color: ore(STONE, [16, 16, 16]) },
  deepslate_coal_ore: { color: ore(DEEPSLATE, [16, 16, 16]) },
  iron_ore: { color: ore(STONE, [216, 175, 147]) },
  deepslate_iron_ore: { color: ore(DEEPSLATE, [216, 175, 147]) },
  copper_ore: { color: ore(STONE, [216, 128, 57]) },
  deepslate_copper_ore: { color: ore(DEEPSLATE, [216, 128, 57]) },
  gold_ore: { color: ore(STONE, [252, 220, 92]) },
  deepslate_gold_ore: { color: ore(DEEPSLATE, [252, 220, 92]) },
  redstone_ore: { color: ore(STONE, [255, 40, 40]) },
  deepslate_redstone_ore: { color: ore(DEEPSLATE, [255, 40, 40]) },
  lapis_ore: { color: ore(STONE, [42, 82, 176]) },
  deepslate_lapis_ore: { color: ore(DEEPSLATE, [42, 82, 176]) },
  diamond_ore: { color: ore(STONE, [92, 219, 213]) },
  deepslate_diamond_ore: { color: ore(DEEPSLATE, [92, 219, 213]) },
  emerald_ore: { color: ore(STONE, [23, 221, 98]) },
  deepslate_emerald_ore: { color: ore(DEEPSLATE, [23, 221, 98]) },
  nether_quartz_ore: { color: ore(NETHERRACK, [235, 229, 222]) },
  nether_gold_ore: { color: ore(NETHERRACK, [252, 220, 92]) },
  ancient_debris: { color: [94, 66, 60] },
  iron_block: { color: [220, 220, 220] },
  gold_block: { color: [249, 236, 78] },
  diamond_block: { color: [98, 237, 228] },
  emerald_block: { color: [42, 203, 87] },
  lapis_block: { color: [30, 67, 140] },
  redstone_block: { color: [175, 24, 5] },
  coal_block: { color: [16, 15, 15] },
  netherite_block: { color: [66, 60, 62] },
  copper_block: { color: [192, 107, 79] },
  exposed_copper: { color: [161, 125, 103] },
  weathered_copper: { color: [108, 153, 110] },
  oxidized_copper: { color: [82, 162, 132] },
  raw_iron_block: { color: [166, 135, 107] },
  raw_copper_block: { color: [154, 105, 74] },
  raw_gold_block: { color: [221, 169, 46] },

  // Glass and light
  glass: { color: [220, 235, 240], alpha: 0.35 },
  glass_pane: { color: [220, 235, 240], alpha: 0.35, thin: true },
  tinted_glass: { color: [44, 39, 46], alpha: 0.6 },
  torch: { color: [255, 205, 110], thin: true, emissive: true },
  wall_torch: { color: [255, 205, 110], thin: true, emissive: true },
  soul_torch: { color: [110, 219, 236], thin: true, emissive: true },
  soul_wall_torch: { color: [110, 219, 236], thin: true, emissive: true },
  redstone_torch: { color: [211, 62, 41], thin: true, emissive: true },
  lantern: { color: [232, 176, 92], thin: true, emissive: true },
  soul_lantern: { color: [116, 205, 222], thin: true, emissive: true },
  glowstone: { color: [222, 179, 116], emissive: true },
  shroomlight: { color: [242, 145, 76], emissive: true },
  jack_o_lantern: { color: [219, 156, 55], emissive: true },
  campfire: { color: [148, 106, 66], thin: true, emissive: true },
  soul_campfire: { color: [110, 190, 205], thin: true, emissive: true },
  redstone_lamp: { color: [95, 55, 30] },
  end_rod: { color: [230, 226, 215], thin: true, emissive: true },
  ochre_froglight: { color: [250, 240, 187], emissive: true },
  verdant_froglight: { color: [225, 242, 209], emissive: true },
  pearlescent_froglight: { color: [246, 227, 240], emissive: true },
  sea_pickle: { color: [95, 106, 45], thin: true, emissive: true },
  beacon: { color: [117, 216, 208], emissive: true },
  conduit: { color: [166, 142, 114], emissive: true },
  fire: { color: [222, 129, 33], thin: true, emissive: true },
  soul_fire: { color: [86, 201, 216], thin: true, emissive: true },
  lava: { color: [214, 105, 27], emissive: true },
  water: { color: [63, 118, 228], alpha: 0.55 },
  bubble_column: { color: [63, 118, 228], alpha: 0.4 },

  // Plants and foliage
  short_grass: { color: [124, 163, 71], thin: true },
  tall_grass: { color: [124, 163, 71], thin: true },
  fern: { color: [111, 152, 65], thin: true },
  large_fern: { color: [111, 152, 65], thin: true },
  dead_bush: { color: [148, 106, 47], thin: true },
  bush: { color: [102, 138, 62], thin: true },
  dandelion: { color: [225, 218, 66], thin: true },
  poppy: { color: [201, 47, 45], thin: true },
  blue_orchid: { color: [47, 172, 205], thin: true },
  allium: { color: [176, 143, 214], thin: true },
  azure_bluet: { color: [220, 226, 208], thin: true },
  red_tulip: { color: [199, 47, 43], thin: true },
  orange_tulip: { color: [216, 130, 48], thin: true },
  white_tulip: { color: [220, 226, 220], thin: true },
  pink_tulip: { color: [227, 175, 208], thin: true },
  oxeye_daisy: { color: [227, 231, 214], thin: true },
  cornflower: { color: [70, 106, 206], thin: true },
  lily_of_the_valley: { color: [223, 231, 219], thin: true },
  wither_rose: { color: [43, 44, 32], thin: true },
  torchflower: { color: [226, 130, 51], thin: true },
  pitcher_plant: { color: [128, 96, 190], thin: true },
  sunflower: { color: [232, 202, 63], thin: true },
  lilac: { color: [183, 148, 200], thin: true },
  rose_bush: { color: [156, 51, 47], thin: true },
  peony: { color: [206, 176, 214], thin: true },
  vine: { color: [60, 101, 33], thin: true },
  glow_lichen: { color: [126, 143, 121], thin: true, emissive: true },
  moss_carpet: { color: [89, 109, 45], thin: true },
  hanging_roots: { color: [150, 111, 88], thin: true },
  big_dripleaf: { color: [104, 137, 52], thin: true },
  small_dripleaf: { color: [95, 130, 50], thin: true },
  azalea: { color: [92, 122, 47] },
  flowering_azalea: { color: [125, 118, 130] },
  spore_blossom: { color: [206, 108, 168], thin: true },
  lily_pad: { color: [32, 128, 48], thin: true },
  sugar_cane: { color: [148, 192, 101], thin: true },
  bamboo: { color: [126, 148, 55], thin: true },
  cactus: { color: [85, 127, 45] },
  wheat: { color: [186, 174, 84], thin: true },
  carrots: { color: [63, 137, 40], thin: true },
  potatoes: { color: [69, 140, 47], thin: true },
  beetroots: { color: [98, 133, 55], thin: true },
  pumpkin: { color: [198, 118, 24] },
  carved_pumpkin: { color: [198, 118, 24] },
  melon: { color: [111, 145, 33] },
  pumpkin_stem: { color: [124, 152, 73], thin: true },
  melon_stem: { color: [124, 152, 73], thin: true },
  sweet_berry_bush: { color: [72, 97, 55], thin: true },
  cave_vines: { color: [93, 121, 47], thin: true },
  kelp: { color: [86, 128, 50], thin: true },
  seagrass: { color: [83, 145, 47], thin: true },
  brown_mushroom: { color: [153, 118, 93], thin: true },
  red_mushroom: { color: [201, 61, 56], thin: true },
  mushroom_stem: { color: [203, 196, 185] },
  brown_mushroom_block: { color: [149, 111, 82] },
  red_mushroom_block: { color: [186, 48, 44] },
  nether_wart: { color: [125, 26, 32], thin: true },
  crimson_fungus: { color: [141, 43, 42], thin: true },
  warped_fungus: { color: [74, 128, 122], thin: true },
  crimson_roots: { color: [141, 30, 56], thin: true },
  warped_roots: { color: [20, 138, 129], thin: true },
  twisting_vines: { color: [20, 146, 138], thin: true },
  weeping_vines: { color: [141, 15, 22], thin: true },
  nether_sprouts: { color: [22, 156, 148], thin: true },
  chorus_plant: { color: [93, 62, 93] },
  chorus_flower: { color: [151, 118, 151] },
  cobweb: { color: [229, 235, 235], alpha: 0.7, thin: true },
  flower_pot: { color: [126, 71, 53], thin: true },

  // Utility, furniture and redstone
  crafting_table: { color: [131, 92, 55] },
  furnace: { color: [110, 109, 109] },
  blast_furnace: { color: [90, 90, 92] },
  smoker: { color: [95, 84, 74] },
  chest: { color: [162, 121, 60] },
  trapped_chest: { color: [162, 121, 60] },
  ender_chest: { color: [37, 51, 54] },
  barrel: { color: [124, 92, 51] },
  bookshelf: { color: [151, 122, 76] },
  chiseled_bookshelf: { color: [151, 122, 76] },
  lectern: { color: [152, 119, 65] },
  cartography_table: { color: [111, 92, 74] },
  fletching_table: { color: [196, 180, 130] },
  smithing_table: { color: [58, 55, 60] },
  loom: { color: [154, 128, 90] },
  composter: { color: [111, 82, 46] },
  cauldron: { color: [72, 72, 74] },
  water_cauldron: { color: [72, 76, 96] },
  lava_cauldron: { color: [140, 84, 40], emissive: true },
  brewing_stand: { color: [124, 104, 90], thin: true },
  enchanting_table: { color: [110, 52, 55] },
  anvil: { color: [69, 69, 69] },
  grindstone: { color: [130, 129, 128] },
  stonecutter: { color: [117, 112, 108] },
  bell: { color: [227, 179, 65], thin: true },
  note_block: { color: [95, 63, 41] },
  jukebox: { color: [92, 66, 49] },
  hopper: { color: [70, 70, 74], thin: true },
  dispenser: { color: [113, 112, 112] },
  dropper: { color: [113, 112, 112] },
  observer: { color: [98, 98, 98] },
  piston: { color: [151, 143, 118] },
  sticky_piston: { color: [131, 148, 96] },
  tnt: { color: [172, 60, 42] },
  target: { color: [225, 205, 197] },
  lodestone: { color: [130, 131, 135] },
  respawn_anchor: { color: [50, 26, 87], emissive: true },
  scaffolding: { color: [188, 152, 88], thin: true },
  ladder: { color: [138, 110, 68], thin: true },
  chain: { color: [65, 68, 79], thin: true },
  iron_chain: { color: [65, 68, 79], thin: true },
  iron_bars: { color: [111, 116, 119], thin: true },
  rail: { color: [141, 124, 90], thin: true },
  powered_rail: { color: [174, 138, 71], thin: true },
  detector_rail: { color: [152, 129, 92], thin: true },
  activator_rail: { color: [125, 96, 78], thin: true },
  lever: { color: [124, 100, 74], thin: true },
  tripwire_hook: { color: [136, 118, 86], thin: true },
  armor_stand: { color: [166, 152, 122], thin: true },
  item_frame: { color: [124, 100, 74], thin: true },
  cake: { color: [223, 219, 213], thin: true },
  skeleton_skull: { color: [196, 196, 196], thin: true },
  wither_skeleton_skull: { color: [50, 50, 50], thin: true },
  player_head: { color: [116, 84, 60], thin: true },
  zombie_head: { color: [83, 124, 74], thin: true },
  creeper_head: { color: [116, 178, 100], thin: true },
  dragon_head: { color: [30, 27, 33], thin: true },
};

// Wood: every species, every common shape.
for (const [species, tones] of Object.entries(WOOD)) {
  const isStem = species === "crimson" || species === "warped";
  const logId = isStem ? `${species}_stem` : `${species}_log`;
  const woodId = isStem ? `${species}_hyphae` : `${species}_wood`;
  BLOCK_APPEARANCE[`${species}_planks`] = { color: tones.planks };
  BLOCK_APPEARANCE[logId] = { color: tones.log };
  BLOCK_APPEARANCE[woodId] = { color: tones.log };
  BLOCK_APPEARANCE[`stripped_${logId}`] = { color: tones.stripped };
  BLOCK_APPEARANCE[`stripped_${woodId}`] = { color: tones.stripped };
  BLOCK_APPEARANCE[`${species}_stairs`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_slab`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_fence`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_fence_gate`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_door`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_trapdoor`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_button`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_pressure_plate`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_sign`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_wall_sign`] = { color: tones.planks, thin: true };
  BLOCK_APPEARANCE[`${species}_hanging_sign`] = { color: tones.planks, thin: true };
  if (!isStem) {
    BLOCK_APPEARANCE[`${species}_leaves`] = { color: tones.leaves, alpha: 0.92 };
    BLOCK_APPEARANCE[`${species}_sapling`] = { color: tones.leaves, thin: true };
  }
}

// Dye-coloured families.
for (const [name, color] of Object.entries(DYE)) {
  BLOCK_APPEARANCE[`${name}_wool`] = { color };
  BLOCK_APPEARANCE[`${name}_carpet`] = { color, thin: true };
  BLOCK_APPEARANCE[`${name}_concrete`] = { color };
  BLOCK_APPEARANCE[`${name}_concrete_powder`] = { color: [Math.min(255, color[0] + 22), Math.min(255, color[1] + 22), Math.min(255, color[2] + 22)] };
  BLOCK_APPEARANCE[`${name}_terracotta`] = { color: terracotta(color) };
  BLOCK_APPEARANCE[`${name}_glazed_terracotta`] = { color: terracotta(color) };
  BLOCK_APPEARANCE[`${name}_stained_glass`] = { color, alpha: 0.45 };
  BLOCK_APPEARANCE[`${name}_stained_glass_pane`] = { color, alpha: 0.45, thin: true };
  BLOCK_APPEARANCE[`${name}_shulker_box`] = { color };
  BLOCK_APPEARANCE[`${name}_banner`] = { color, thin: true };
  BLOCK_APPEARANCE[`${name}_wall_banner`] = { color, thin: true };
  BLOCK_APPEARANCE[`${name}_bed`] = { color, thin: true };
  BLOCK_APPEARANCE[`${name}_candle`] = { color, thin: true, emissive: true };
}
BLOCK_APPEARANCE["terracotta"] = { color: [152, 94, 67] };
BLOCK_APPEARANCE["candle"] = { color: [227, 216, 189], thin: true, emissive: true };
BLOCK_APPEARANCE["shulker_box"] = { color: [139, 100, 139] };

// Stone-family shape variants share their parent's colour.
const STONE_SHAPES: Array<[string, string]> = [
  ["cobblestone", "cobblestone"],
  ["mossy_cobblestone", "mossy_cobblestone"],
  ["stone_brick", "stone_bricks"],
  ["mossy_stone_brick", "mossy_stone_bricks"],
  ["stone", "stone"],
  ["smooth_stone", "smooth_stone"],
  ["andesite", "andesite"],
  ["polished_andesite", "polished_andesite"],
  ["diorite", "diorite"],
  ["polished_diorite", "polished_diorite"],
  ["granite", "granite"],
  ["polished_granite", "polished_granite"],
  ["tuff", "tuff"],
  ["polished_tuff", "polished_tuff"],
  ["tuff_brick", "tuff_bricks"],
  ["deepslate", "deepslate"],
  ["cobbled_deepslate", "cobbled_deepslate"],
  ["polished_deepslate", "polished_deepslate"],
  ["deepslate_brick", "deepslate_bricks"],
  ["deepslate_tile", "deepslate_tiles"],
  ["brick", "bricks"],
  ["mud_brick", "mud_bricks"],
  ["resin_brick", "resin_bricks"],
  ["sandstone", "sandstone"],
  ["smooth_sandstone", "smooth_sandstone"],
  ["cut_sandstone", "cut_sandstone"],
  ["red_sandstone", "red_sandstone"],
  ["smooth_red_sandstone", "smooth_red_sandstone"],
  ["quartz", "quartz_block"],
  ["smooth_quartz", "smooth_quartz"],
  ["blackstone", "blackstone"],
  ["polished_blackstone", "polished_blackstone"],
  ["polished_blackstone_brick", "polished_blackstone_bricks"],
  ["nether_brick", "nether_bricks"],
  ["red_nether_brick", "red_nether_bricks"],
  ["prismarine", "prismarine"],
  ["prismarine_brick", "prismarine_bricks"],
  ["dark_prismarine", "dark_prismarine"],
  ["purpur", "purpur_block"],
  ["end_stone_brick", "end_stone_bricks"],
  ["basalt", "basalt"],
  ["mossy_stone_brick", "mossy_stone_bricks"],
];
/**
 * The copper oxidation family, in every form the game actually ships.
 *
 * Added because a planner authoring a bronze statue reached for
 * `oxidized_cut_copper` and `waxed_weathered_copper` — real 1.21 blocks, and the
 * obvious vocabulary for weathered metal — which this table did not have. A mesh
 * zone naming an absent block is an error by design, so the omission would have
 * failed a node AFTER its mesh had been paid for.
 *
 * Cut and chiselled forms share their parent's oxidation colour, and waxing
 * changes only whether the block keeps ageing, not how it looks — so these are
 * derived rather than hand-entered, and cannot drift from the four base states.
 */
const COPPER_STATES: Array<[string, string]> = [
  ["", "copper_block"],
  ["exposed_", "exposed_copper"],
  ["weathered_", "weathered_copper"],
  ["oxidized_", "oxidized_copper"],
];
for (const [prefix, parent] of COPPER_STATES) {
  const base = BLOCK_APPEARANCE[parent];
  if (!base) continue;
  const solids = [`${prefix}cut_copper`, `${prefix}chiseled_copper`, `${prefix}copper_grate`];
  const blockName = prefix === "" ? "copper_block" : `${prefix}copper`;
  for (const id of [...solids, blockName]) BLOCK_APPEARANCE[id] ??= { color: base.color };
  // Waxed forms are visually identical; they only stop the ageing.
  for (const id of [...solids, blockName]) BLOCK_APPEARANCE[`waxed_${id}`] ??= { color: base.color };
  // Stairs and slabs of each, which the renderer must not treat as full cells.
  for (const shape of ["stairs", "slab"]) {
    BLOCK_APPEARANCE[`${prefix}cut_copper_${shape}`] ??= { color: base.color, thin: true };
    BLOCK_APPEARANCE[`waxed_${prefix}cut_copper_${shape}`] ??= { color: base.color, thin: true };
  }
}

for (const [prefix, parent] of STONE_SHAPES) {
  const base = BLOCK_APPEARANCE[parent];
  if (!base) continue;
  for (const shape of ["stairs", "slab", "wall"]) {
    BLOCK_APPEARANCE[`${prefix}_${shape}`] ??= { color: base.color, thin: true };
  }
}

const SHAPE_SUFFIXES = [
  "_stairs",
  "_slab",
  "_wall",
  "_fence_gate",
  "_fence",
  "_door",
  "_trapdoor",
  "_button",
  "_pressure_plate",
  "_wall_sign",
  "_hanging_sign",
  "_sign",
  "_pane",
  "_carpet",
  "_wall_banner",
  "_banner",
];

/** True when the renderer should treat the block as empty space. */
export function isRenderAir(blockState: string): boolean {
  return AIR_IDS.has(bareId(blockState));
}

/** Resolve any block state to an appearance, falling back to heuristics. */
export function appearanceOf(blockState: string): BlockAppearance {
  const id = bareId(blockState);
  const exact = BLOCK_APPEARANCE[id];
  if (exact) return exact;

  for (const suffix of SHAPE_SUFFIXES) {
    if (!id.endsWith(suffix)) continue;
    const stem = id.slice(0, -suffix.length);
    // "stone_brick_stairs" wants "stone_bricks"; "oak_planks" style stems
    // resolve directly.
    const parent = BLOCK_APPEARANCE[stem] ?? BLOCK_APPEARANCE[`${stem}s`] ?? BLOCK_APPEARANCE[`${stem}_block`] ?? BLOCK_APPEARANCE[`${stem}_planks`];
    if (parent) return { color: parent.color, alpha: parent.alpha, emissive: parent.emissive, thin: true };
    break;
  }

  return heuristic(id);
}

function bareId(blockState: string): string {
  const withoutState = blockState.split("[")[0] ?? blockState;
  const colon = withoutState.indexOf(":");
  return (colon < 0 ? withoutState : withoutState.slice(colon + 1)).toLowerCase();
}

function heuristic(id: string): BlockAppearance {
  for (const [species, tones] of Object.entries(WOOD)) {
    if (!id.startsWith(`${species}_`) && !id.includes(`_${species}_`)) continue;
    if (id.includes("leaves")) return { color: tones.leaves, alpha: 0.92 };
    if (id.includes("log") || id.includes("stem") || id.includes("wood") || id.includes("hyphae")) return { color: tones.log };
    return { color: tones.planks };
  }
  for (const [name, color] of Object.entries(DYE)) {
    if (id.startsWith(`${name}_`)) return { color };
  }
  if (id.includes("deepslate")) return { color: DEEPSLATE };
  if (id.endsWith("_ore")) return { color: ore(id.includes("deepslate") ? DEEPSLATE : STONE, [140, 140, 140]) };
  if (id.includes("water")) return { color: [63, 118, 228], alpha: 0.55 };
  if (id.includes("lava") || id.includes("fire") || id.includes("torch") || id.includes("lantern") || id.includes("glow")) {
    return { color: [235, 175, 90], thin: id.includes("torch") || id.includes("lantern"), emissive: true };
  }
  if (id.includes("glass")) return { color: [220, 235, 240], alpha: 0.35, thin: id.includes("pane") };
  if (id.includes("leaves")) return { color: [72, 111, 40], alpha: 0.92 };
  if (id.includes("grass") || id.includes("moss") || id.includes("fern") || id.includes("vine")) return { color: [110, 145, 66], thin: true };
  if (id.includes("sandstone")) return { color: [216, 203, 155] };
  if (id.includes("sand")) return { color: [219, 207, 163] };
  if (id.includes("brick")) return { color: [150, 97, 83] };
  if (id.includes("cobble")) return { color: [127, 127, 127] };
  if (id.includes("stone") || id.includes("tuff") || id.includes("rock")) return { color: STONE };
  if (id.includes("dirt") || id.includes("mud") || id.includes("soil")) return { color: [134, 96, 67] };
  if (id.includes("copper")) return { color: [192, 107, 79] };
  if (id.includes("iron")) return { color: [180, 180, 184] };
  if (id.includes("gold")) return { color: [230, 200, 80] };
  if (id.includes("rail")) return { color: [141, 124, 90], thin: true };
  return { color: DEFAULT_COLOR };
}
