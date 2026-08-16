/**
 * Which texture goes on which face of which block.
 *
 * The textures are RE:Fi (MysticTempest, CC BY-SA 4.0) — a libre 16px pack for
 * Luanti/Minetest, vendored under `textures/refi/`. See its `ATTRIBUTION.md`.
 * Nothing here is a Mojang asset and nothing here is derived from one.
 *
 * The pack names its files after *Minetest* nodes, so this module is the
 * translation layer: Minecraft block name in, pack filenames out, one per face
 * where the faces differ (grass top/side/bottom, a log's end grain, a barrel's
 * lid). Where the pack has no variant of something we do have — the sixteen
 * dyed carpets, say — the entry names a base texture plus a `tint`, and the
 * mesher multiplies that tint into the vertex colour exactly as it multiplies
 * the flat colour today.
 *
 * A block this table does not name is not an error: it falls through to the
 * flat-colour path in `appearance.js` and renders exactly as it did before
 * there were any textures at all. That is the contract — coverage is allowed
 * to be partial, and growing it is a table edit.
 */

/** Every filename below, relative to `textures/refi/`. Flat: names are unique. */
const F = (name) => name;

/* -------------------------------------------------------------------------- */
/* families                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Wood species → planks, log side, log end, stripped side, stripped end,
 * leaves. `undefined` for a slot the pack has nothing for.
 */
const WOOD = {
  oak: {
    planks: "default_wood.png",
    log: "default_tree.png",
    logEnd: "default_tree_top.png",
    stripped: "mcl_core_stripped_oak_side.png",
    strippedEnd: "mcl_core_stripped_oak_top.png",
    leaves: "default_leaves.png",
    door: "mcl_doors_door_wood_lower.png",
    trapdoor: "doors_trapdoor.png",
  },
  spruce: {
    planks: "mcl_core_planks_spruce.png",
    log: "mcl_core_log_spruce.png",
    logEnd: "mcl_core_log_spruce_top.png",
    stripped: "mcl_core_stripped_spruce_side.png",
    strippedEnd: "mcl_core_stripped_spruce_top.png",
    leaves: "mcl_core_leaves_spruce.png",
    door: "mcl_doors_door_spruce_lower.png",
    trapdoor: "mcl_doors_trapdoor_spruce.png",
  },
  birch: {
    planks: "mcl_core_planks_birch.png",
    log: "mcl_core_log_birch.png",
    logEnd: "mcl_core_log_birch_top.png",
    stripped: "mcl_core_stripped_birch_side.png",
    strippedEnd: "mcl_core_stripped_birch_top.png",
    leaves: "mcl_core_leaves_birch.png",
    door: "mcl_doors_door_birch_lower.png",
    trapdoor: "mcl_doors_trapdoor_birch.png",
  },
  jungle: {
    planks: "default_junglewood.png",
    log: "default_jungletree.png",
    logEnd: "default_jungletree_top.png",
    stripped: "mcl_core_stripped_jungle_side.png",
    strippedEnd: "mcl_core_stripped_jungle_top.png",
    leaves: "default_jungleleaves.png",
    door: "mcl_doors_door_jungle_lower.png",
    trapdoor: "mcl_doors_trapdoor_jungle.png",
  },
  acacia: {
    planks: "default_acacia_wood.png",
    log: "default_acacia_tree.png",
    logEnd: "default_acacia_tree_top.png",
    stripped: "mcl_core_stripped_acacia_side.png",
    strippedEnd: "mcl_core_stripped_acacia_top.png",
    leaves: "default_acacia_leaves.png",
    door: "mcl_doors_door_acacia_lower.png",
    trapdoor: "mcl_doors_trapdoor_acacia.png",
  },
  dark_oak: {
    planks: "mcl_core_planks_big_oak.png",
    log: "mcl_core_log_big_oak.png",
    logEnd: "mcl_core_log_big_oak_top.png",
    stripped: "mcl_core_stripped_dark_oak_side.png",
    strippedEnd: "mcl_core_stripped_dark_oak_top.png",
    leaves: "mcl_core_leaves_big_oak.png",
    door: "mcl_doors_door_dark_oak_lower.png",
    trapdoor: "mcl_doors_trapdoor_dark_oak.png",
  },
  mangrove: {
    planks: "mcl_mangrove_planks.png",
    log: "mcl_mangrove_log.png",
    logEnd: "mcl_mangrove_log_top.png",
    stripped: "mcl_stripped_mangrove_log_side.png",
    strippedEnd: "mcl_stripped_mangrove_log_top.png",
    leaves: "mcl_mangrove_leaves.png",
    door: "mcl_mangrove_door_bottom.png",
    trapdoor: "mcl_mangrove_trapdoor.png",
  },
  cherry: {
    planks: "mcl_cherry_blossom_planks.png",
    log: "mcl_cherry_blossom_log.png",
    logEnd: "mcl_cherry_blossom_log_top.png",
    stripped: "mcl_cherry_blossom_log_stripped.png",
    strippedEnd: "mcl_cherry_blossom_log_top_stripped.png",
    leaves: "mcl_cherry_blossom_leaves.png",
    door: "mcl_cherry_blossom_door_bottom.png",
    trapdoor: "mcl_cherry_blossom_trapdoor.png",
  },
  pale_oak: {
    planks: "mcl_pale_oak_planks.png",
    log: "mcl_pale_oak_log.png",
    logEnd: "mcl_pale_oak_log_top.png",
    stripped: "mcl_stripped_pale_oak_log_side.png",
    strippedEnd: "mcl_stripped_pale_oak_log_top.png",
    leaves: "mcl_pale_oak_leaves.png",
    trapdoor: "mcl_pale_oak_trapdoor.png",
  },
  bamboo: {
    planks: "mcl_bamboo_bamboo_plank.png",
    log: "mcl_bamboo_bamboo_block.png",
    logEnd: "mcl_bamboo_bamboo_bottom.png",
    stripped: "mcl_bamboo_bamboo_block_stripped.png",
    strippedEnd: "mcl_bamboo_bamboo_bottom_stripped.png",
    leaves: "mcl_bamboo_leaf_big.png",
  },
};

/** Minecraft dye name → the colour word RE:Fi uses in its filenames. */
const DYE_WORD = {
  white: "white",
  orange: "orange",
  magenta: "magenta",
  light_blue: "light_blue",
  yellow: "yellow",
  lime: "lime",
  pink: "pink",
  gray: "grey",
  light_gray: "silver",
  cyan: "cyan",
  purple: "purple",
  blue: "blue",
  brown: "brown",
  green: "green",
  red: "red",
  black: "black",
};

/**
 * Wool is a Minetest-Game texture set, so it uses Minetest's colour words —
 * "violet" for purple, "dark_grey" for gray, and two files that had to be
 * added under the MineClone names. Its own little dictionary, therefore.
 */
const WOOL_FILE = {
  white: "wool_white.png",
  orange: "wool_orange.png",
  magenta: "wool_magenta.png",
  light_blue: "mcl_wool_light_blue.png",
  yellow: "wool_yellow.png",
  lime: "mcl_wool_lime.png",
  pink: "wool_pink.png",
  gray: "wool_dark_grey.png",
  light_gray: "wool_grey.png",
  cyan: "wool_cyan.png",
  purple: "wool_violet.png",
  blue: "wool_blue.png",
  brown: "wool_brown.png",
  green: "wool_dark_green.png",
  red: "wool_red.png",
  black: "wool_black.png",
};

/* -------------------------------------------------------------------------- */
/* exact names                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Block name → faces. `all` covers every face; `top`, `bottom`, `side` and
 * `end` (top *and* bottom, for pillars) refine it.
 */
const EXACT = {
  /* stone and its cousins */
  stone: { all: "default_stone.png" },
  cobblestone: { all: "default_cobble.png" },
  mossy_cobblestone: { all: "default_mossycobble.png" },
  smooth_stone: { all: "default_stone_block.png" },
  stone_bricks: { all: "default_stone_brick.png" },
  cracked_stone_bricks: { all: "mcl_core_stonebrick_cracked.png" },
  chiseled_stone_bricks: { all: "mcl_core_stonebrick_carved.png" },
  mossy_stone_bricks: { all: "mcl_core_stonebrick_mossy.png" },
  bedrock: { all: "mcl_core_bedrock.png" },
  gravel: { all: "default_gravel.png" },
  andesite: { all: "mcl_core_andesite.png" },
  polished_andesite: { all: "mcl_core_andesite_smooth.png" },
  diorite: { all: "mcl_core_diorite.png" },
  polished_diorite: { all: "mcl_core_diorite_smooth.png" },
  granite: { all: "mcl_core_granite.png" },
  polished_granite: { all: "mcl_core_granite_smooth.png" },
  obsidian: { all: "default_obsidian.png" },
  bricks: { all: "default_brick.png" },
  calcite: { all: "calcite.png" },
  tuff: { all: "mcl_deepslate_tuff.png" },
  polished_tuff: { all: "mcl_deepslate_tuff_polished.png" },
  tuff_bricks: { all: "mcl_deepslate_tuff_bricks.png" },
  chiseled_tuff: { all: "mcl_deepslate_tuff_chiseled.png", end: "mcl_deepslate_tuff_chiseled_top.png" },
  dripstone_block: { all: "dripstone_block.png" },

  /* deepslate */
  deepslate: { all: "mcl_deepslate.png", end: "mcl_deepslate_top.png" },
  cobbled_deepslate: { all: "mcl_deepslate_cobbled.png" },
  polished_deepslate: { all: "mcl_deepslate_polished.png" },
  deepslate_bricks: { all: "mcl_deepslate_bricks.png" },
  cracked_deepslate_bricks: { all: "mcl_deepslate_bricks_cracked.png" },
  deepslate_tiles: { all: "mcl_deepslate_tiles.png" },
  cracked_deepslate_tiles: { all: "mcl_deepslate_tiles_cracked.png" },
  chiseled_deepslate: { all: "mcl_deepslate_chiseled.png" },

  /* blackstone */
  blackstone: { all: "mcl_blackstone.png", top: "mcl_blackstone_top.png" },
  polished_blackstone: { all: "mcl_blackstone_polished.png" },
  polished_blackstone_bricks: { all: "mcl_blackstone_polished_bricks.png" },
  chiseled_polished_blackstone: { all: "mcl_blackstone_chiseled_polished.png" },
  gilded_blackstone: { all: "mcl_blackstone_gilded_side.png" },
  basalt: { all: "mcl_blackstone_basalt_side.png", end: "mcl_blackstone_basalt_top.png" },
  smooth_basalt: { all: "mcl_blackstone_basalt_smooth.png" },

  /* soil */
  dirt: { all: "default_dirt.png" },
  coarse_dirt: { all: "mcl_core_coarse_dirt.png" },
  rooted_dirt: { all: "mcl_lush_caves_rooted_dirt.png" },
  grass_block: {
    top: "default_grass.png",
    side: "default_grass_side.png",
    bottom: "default_dirt.png",
  },
  podzol: {
    top: "mcl_core_dirt_podzol_top.png",
    side: "mcl_core_dirt_podzol_side.png",
    bottom: "default_dirt.png",
  },
  mycelium: {
    top: "mcl_core_mycelium_top.png",
    side: "mcl_core_mycelium_side.png",
    bottom: "default_dirt.png",
  },
  dirt_path: {
    top: "mcl_core_grass_path_top.png",
    side: "mcl_core_grass_path_side.png",
    bottom: "default_dirt.png",
  },
  farmland: { top: "farming_soil.png", side: "default_dirt.png", bottom: "default_dirt.png" },
  clay: { all: "default_clay.png" },
  moss_block: { all: "mcl_lush_caves_moss_block.png" },
  moss_carpet: { all: "mcl_lush_caves_moss_carpet.png" },
  mud: { all: "mcl_mud.png" },
  packed_mud: { all: "mcl_mud_packed_mud.png" },
  mud_bricks: { all: "mcl_mud_bricks.png" },

  /* sand, snow, ice */
  sand: { all: "default_sand.png" },
  red_sand: { all: "mcl_core_red_sand.png" },
  sandstone: {
    all: "mcl_core_sandstone_normal.png",
    top: "mcl_core_sandstone_top.png",
    bottom: "mcl_core_sandstone_bottom.png",
  },
  smooth_sandstone: { all: "mcl_core_sandstone_smooth.png" },
  chiseled_sandstone: { all: "mcl_core_sandstone_carved.png" },
  red_sandstone: {
    all: "mcl_core_red_sandstone_normal.png",
    top: "mcl_core_red_sandstone_top.png",
    bottom: "mcl_core_red_sandstone_bottom.png",
  },
  smooth_red_sandstone: { all: "mcl_core_red_sandstone_smooth.png" },
  chiseled_red_sandstone: { all: "mcl_core_red_sandstone_carved.png" },
  snow: { all: "default_snow.png" },
  snow_block: { all: "default_snow.png" },
  ice: { all: "default_ice.png" },
  packed_ice: { all: "mcl_core_ice_packed.png" },
  blue_ice: { all: "mcl_core_ice_blue.png" },
  powder_snow: { all: "powder_snow.png" },

  /* fluids */
  water: { all: "default_water.png" },
  lava: { all: "default_lava.png" },

  /* glass */
  glass: { all: "default_glass.png" },
  glass_pane: { all: "default_glass.png" },
  tinted_glass: { all: "default_obsidian_glass.png" },

  /* quartz */
  // `quartz_stairs` and `quartz_slab` strip to a bare `quartz`, which is not a
  // block of its own — it is the block of quartz, so it is spelled twice.
  quartz: {
    all: "mcl_nether_quartz_block_side.png",
    top: "mcl_nether_quartz_block_top.png",
    bottom: "mcl_nether_quartz_block_bottom.png",
  },
  quartz_block: {
    all: "mcl_nether_quartz_block_side.png",
    top: "mcl_nether_quartz_block_top.png",
    bottom: "mcl_nether_quartz_block_bottom.png",
  },
  smooth_quartz: { all: "mcl_nether_quartz_block_bottom.png" },
  quartz_bricks: { all: "mcl_backstone_quartz_bricks.png" },
  quartz_pillar: { all: "mcl_nether_quartz_pillar_side.png", end: "mcl_nether_quartz_pillar_top.png" },
  chiseled_quartz_block: {
    all: "mcl_nether_quartz_chiseled_side.png",
    end: "mcl_nether_quartz_chiseled_top.png",
  },

  /* metal and mineral blocks */
  iron_block: { all: "default_steel_block.png" },
  gold_block: { all: "default_gold_block.png" },
  diamond_block: { all: "default_diamond_block.png" },
  emerald_block: { all: "mcl_core_emerald_block.png" },
  lapis_block: { all: "mcl_core_lapis_block.png" },
  coal_block: { all: "default_coal_block.png" },
  copper_block: { all: "mcl_copper_block.png" },
  cut_copper: { all: "mcl_copper_block_cut.png" },
  exposed_copper: { all: "mcl_copper_exposed.png" },
  exposed_cut_copper: { all: "mcl_copper_exposed_cut.png" },
  weathered_copper: { all: "mcl_copper_weathered.png" },
  weathered_cut_copper: { all: "mcl_copper_weathered_cut.png" },
  oxidized_copper: { all: "mcl_copper_oxidized.png" },
  oxidized_cut_copper: { all: "mcl_copper_oxidized_cut.png" },
  amethyst_block: { all: "mcl_amethyst_amethyst_block.png" },
  amethyst_cluster: { all: "mcl_amethyst_amethyst_cluster.png" },
  budding_amethyst: { all: "mcl_amethyst_budding_amethyst.png" },
  bone_block: { all: "mcl_core_bone_block_side.png", end: "mcl_core_bone_block_top.png" },
  hay_block: { all: "mcl_farming_hayblock_side.png", end: "mcl_farming_hayblock_top.png" },

  /* prismarine and the sea */
  prismarine: { all: "mcl_ocean_prismarine_anim.png" },
  prismarine_bricks: { all: "mcl_ocean_prismarine_bricks.png" },
  dark_prismarine: { all: "mcl_ocean_prismarine_dark.png" },
  sea_lantern: { all: "mcl_ocean_sea_lantern.png" },
  seagrass: { all: "mcl_ocean_seagrass.png" },
  tall_seagrass: { all: "mcl_ocean_seagrass.png" },
  kelp: { all: "mcl_ocean_kelp_plant.png" },
  kelp_plant: { all: "mcl_ocean_kelp_plant.png" },

  /* furniture and workstations */
  crafting_table: {
    top: "crafting_workbench_top.png",
    side: "crafting_workbench_side.png",
    bottom: "default_wood.png",
  },
  bookshelf: { all: "default_bookshelf.png", end: "mcl_books_bookshelf_top.png" },
  lectern: { all: "mcl_lectern_lectern.png" },
  barrel: {
    all: "mcl_barrels_barrel_side.png",
    top: "mcl_barrels_barrel_top.png",
    bottom: "mcl_barrels_barrel_bottom.png",
  },
  composter: {
    all: "mcl_composter_side.png",
    top: "mcl_composter_top.png",
    bottom: "mcl_composter_bottom.png",
  },
  chest: { all: "default_chest_side.png", top: "default_chest_top.png", bottom: "default_chest_top.png" },
  cartography_table: {
    all: "mcl_cartography_table_front.png",
    top: "mcl_cartography_table_top.png",
    bottom: "mcl_cartography_table_bottom.png",
  },
  smithing_table: {
    all: "mcl_smithing_table_side.png",
    top: "mcl_smithing_table_top.png",
    bottom: "mcl_smithing_table_bottom.png",
  },
  furnace: { all: "default_furnace_side.png", top: "default_furnace_top.png", bottom: "default_furnace_bottom.png" },
  dispenser: { all: "default_furnace_side.png", top: "default_furnace_top.png", bottom: "default_furnace_bottom.png" },
  anvil: { all: "mcl_anvils_anvil_side.png", top: "mcl_anvils_anvil_top_damaged_0.png", bottom: "mcl_anvils_anvil_base.png" },
  hopper: { all: "mcl_hoppers_hopper_outside.png", top: "mcl_hoppers_hopper_top.png", bottom: "mcl_hoppers_hopper_bottom.png" },
  cauldron: { all: "mcl_cauldrons_cauldron_side.png", top: "mcl_cauldrons_cauldron.png" },
  water_cauldron: { all: "mcl_cauldrons_cauldron_side.png", top: "mcl_cauldrons_cauldron_water_top.png" },
  tnt: { all: "tnt_side.png", top: "tnt_top.png", bottom: "tnt_bottom.png" },

  /* light */
  glowstone: { all: "mcl_nether_glowstone.png" },
  lantern: { all: "lantern.png" },
  soul_lantern: { all: "mcl_lanterns_soul_lantern.png" },
  torch: { all: "default_torch_on_floor.png" },
  wall_torch: { all: "default_torch_on_floor.png" },
  soul_torch: { all: "soul_torch_on_floor.png" },
  soul_wall_torch: { all: "soul_torch_on_floor.png" },
  campfire: { all: "mcl_campfires_campfire_log_lit.png" },
  end_rod: { all: "mcl_end_end_rod_side.png", end: "mcl_end_end_rod_top.png" },
  purpur_block: { all: "mcl_end_purpur_block.png" },
  purpur_pillar: { all: "mcl_end_purpur_pillar.png", end: "mcl_end_purpur_pillar_top.png" },
  brewing_stand: { all: "mcl_brewing_stand.png" },
  redstone_lamp: { all: "redstone_lamp_off.png" },

  /* metalwork and fittings */
  iron_bars: { all: "xpanes_pane_iron.png" },
  chain: { all: "mcl_lanterns_chain.png" },
  iron_chain: { all: "mcl_lanterns_chain.png" },
  ladder: { all: "default_ladder_wood.png" },
  lever: { all: "jeija_wall_lever.png" },
  tripwire_hook: { all: "mesecons_walllever_lever.png" },
  lightning_rod: { all: "mcl_lightning_rods_rod.png" },
  bell: { all: "mcl_bells_bell_floor_side.png", top: "mcl_bells_bell_top.png", bottom: "mcl_bells_bell_bottom.png" },
  scaffolding: { all: "mcl_scaffolding_scaffolding_side.png", top: "mcl_scaffolding_scaffolding_top.png", bottom: "mcl_scaffolding_scaffolding_bottom.png" },
  iron_door: { all: "mcl_doors_door_iron_lower.png" },
  iron_trapdoor: { all: "doors_trapdoor_steel.png" },
  flower_pot: { all: "mcl_flowerpots_flowerpot_inventory.png" },

  /* small plants */
  short_grass: { all: "mcl_flowers_tallgrass.png" },
  grass: { all: "mcl_flowers_tallgrass.png" },
  tall_grass: { all: "mcl_flowers_double_plant_grass_bottom.png" },
  fern: { all: "mcl_flowers_fern.png" },
  large_fern: { all: "mcl_flowers_double_plant_fern_bottom.png" },
  dead_bush: { all: "default_dry_shrub.png" },
  vine: { all: "mcl_core_vine.png" },
  glow_lichen: { all: "mcl_core_glow_lichen.png" },
  sugar_cane: { all: "mcl_core_reeds.png" },
  poppy: { all: "mcl_flowers_poppy.png" },
  dandelion: { all: "flowers_dandelion_yellow.png" },
  cornflower: { all: "mcl_flowers_blue_orchid.png" },
  blue_orchid: { all: "mcl_flowers_blue_orchid.png" },
  allium: { all: "mcl_flowers_allium.png" },
  azure_bluet: { all: "flowers_dandelion_white.png" },
  oxeye_daisy: { all: "mcl_flowers_oxeye_daisy.png" },
  lily_of_the_valley: { all: "mcl_flowers_lily_of_the_valley.png" },
  wither_rose: { all: "mcl_flowers_wither_rose.png" },
  brown_mushroom: { all: "farming_mushroom_brown.png" },
  red_mushroom: { all: "farming_mushroom_red.png" },
  azalea_leaves: { all: "mcl_lush_caves_azalea_leaves.png" },
  flowering_azalea_leaves: { all: "mcl_lush_caves_azalea_leaves_flowering.png" },
  cactus: { all: "mcl_core_cactus_side.png", top: "mcl_core_cactus_top.png", bottom: "mcl_core_cactus_bottom.png" },
};

/* -------------------------------------------------------------------------- */
/* the lookup                                                                  */
/* -------------------------------------------------------------------------- */

/** Shape suffixes that inherit the base block's texture unchanged. */
const INHERIT_SUFFIXES = [
  "_stairs",
  "_slab",
  "_wall",
  "_fence_gate",
  "_fence",
  "_pane",
  "_button",
  "_pressure_plate",
];

/** `x_stairs` → `x`, and so on down the list. */
function inheritedBase(name) {
  for (const suffix of INHERIT_SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) return name.slice(0, -suffix.length);
  }
  return undefined;
}

/** Split `light_blue_wool` into `["light_blue", "wool"]`, or undefined. */
function splitDye(name) {
  for (const dye of Object.keys(DYE_WORD)) {
    if (name.startsWith(`${dye}_`)) return [dye, name.slice(dye.length + 1)];
  }
  return undefined;
}

/** Split `stripped_spruce_log` / `spruce_planks` into species and part. */
function splitWood(name) {
  const stripped = name.startsWith("stripped_");
  const rest = stripped ? name.slice("stripped_".length) : name;
  for (const species of Object.keys(WOOD)) {
    // A bare species name only turns up as the stem of a shape — `oak_fence`
    // stripped to `oak` — and those are made of planks, not of log.
    if (rest === species) return { species, part: "planks", stripped };
    if (rest.startsWith(`${species}_`)) {
      return { species, part: rest.slice(species.length + 1), stripped };
    }
  }
  return undefined;
}

/**
 * The textures for one block name, or `undefined` when the pack has nothing
 * for it and the flat colour should be used instead.
 *
 * The returned object may carry `all`, `top`, `bottom`, `side`, `end` and an
 * optional `tint` (sRGB 0-255) — `resolveFaces` turns that into six filenames.
 */
export function textureOf(name) {
  const direct = EXACT[name];
  if (direct !== undefined) return direct;

  if (name.startsWith("potted_")) return EXACT.flower_pot;

  const inherited = inheritedBase(name);
  if (inherited !== undefined) {
    const found = textureOf(inherited);
    if (found !== undefined) return found;
    // `cobblestone_wall` inherits from `cobblestone`, but `stone_brick_wall`
    // must first become `stone_bricks`: the singular is how Minecraft names
    // the shape and the plural is how it names the block.
    const plural = textureOf(`${inherited}s`);
    if (plural !== undefined) return plural;
  }

  const wood = splitWood(name);
  if (wood !== undefined) {
    const tones = WOOD[wood.species];
    if (wood.part === "planks") return single(tones.planks);
    if (wood.part === "leaves") return single(tones.leaves);
    if (wood.part === "log" || wood.part === "wood" || wood.part === "stem" || wood.part === "hyphae") {
      const side = wood.stripped ? tones.stripped : tones.log;
      const end = wood.stripped ? tones.strippedEnd : tones.logEnd;
      if (side === undefined) return undefined;
      return wood.part === "wood" || wood.part === "hyphae" ? single(side) : { all: side, end };
    }
    if (wood.part === "door") return single(tones.door);
    if (wood.part === "trapdoor") return single(tones.trapdoor);
    // Everything else wooden — signs, boats, buttons — wears the planks.
    if (tones.planks !== undefined) return single(tones.planks);
  }

  const dyed = splitDye(name);
  if (dyed !== undefined) {
    const [dye, part] = dyed;
    const word = DYE_WORD[dye];
    if (part === "wool" || part === "carpet") return single(WOOL_FILE[dye]);
    if (part === "concrete") return single(`mcl_colorblocks_concrete_${word}.png`);
    if (part === "concrete_powder") return single(`mcl_colorblocks_concrete_powder_${word}.png`);
    if (part === "terracotta") return single(`hardened_clay_stained_${word}.png`);
    if (part === "glazed_terracotta") return single(`mcl_colorblocks_glazed_terracotta_${word}.png`);
    if (part === "stained_glass" || part === "stained_glass_pane") {
      // The glass set is the one place RE:Fi spells it "gray", not "grey".
      return single(`mcl_core_glass_${dye === "gray" ? "gray" : word}.png`);
    }
    // Beds, banners and candles have no per-colour texture worth vendoring;
    // they take a neutral base and the dye as a tint.
    if (part === "bed") return { all: "beds_bed_top_top.png", tint: DYE_TINT[dye] };
    if (part === "banner" || part === "wall_banner") {
      return { all: "mcl_banners_banner_base.png", tint: DYE_TINT[dye] };
    }
    if (part === "candle") return { all: "mcl_candles_candle.png", tint: DYE_TINT[dye] };
  }
  if (name === "terracotta") return single("hardened_clay.png");
  if (name === "candle") return single("mcl_candles_candle.png");

  return undefined;
}

/**
 * The sixteen dyes as sRGB, for the handful of blocks the pack has only one
 * texture of. Kept here rather than imported from `appearance.js` so this
 * module stays a leaf: `appearance.js` imports *it*.
 */
const DYE_TINT = {
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

function single(file) {
  return file === undefined ? undefined : { all: file };
}

/** The block names named outright above — the vendoring walks these. */
export const EXACT_BLOCK_NAMES = Object.keys(EXACT);

/** The wood species and dye words the family rules understand. */
export const WOOD_SPECIES = Object.keys(WOOD);
export const DYE_NAMES = Object.keys(DYE_WORD);

/**
 * Expand a {@link textureOf} record into six filenames, in `FACES` order:
 * +X, -X, +Y, -Y, +Z, -Z.
 *
 * `undefined` in a slot means "this face has no texture" — which only happens
 * when the record is partial, and the caller falls back to flat colour there.
 */
export function resolveFaces(spec) {
  if (spec === undefined) return undefined;
  const side = spec.side ?? spec.all;
  const top = spec.top ?? spec.end ?? spec.all;
  const bottom = spec.bottom ?? spec.end ?? spec.all;
  return [side, side, top, bottom, side, side];
}

/** Every filename this table can ever ask for — what the vendoring copies. */
export function referencedTextures(blockNames) {
  const wanted = new Set();
  for (const name of blockNames) {
    const faces = resolveFaces(textureOf(name));
    if (faces === undefined) continue;
    for (const file of faces) if (file !== undefined) wanted.add(F(file));
  }
  return [...wanted].sort();
}
