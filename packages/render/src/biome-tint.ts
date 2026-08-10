/**
 * Biome tinting for the renderers.
 *
 * Vanilla does not store grass/foliage/water colours anywhere a world reader
 * can see them: grass and foliage are sampled from `grass.png` / `foliage.png`
 * by (temperature, downfall), with hard overrides for the special biomes
 * (swamp, dark forest, badlands, cherry grove, mangrove swamp, pale garden),
 * and water comes from each biome's `water_color` in the biome JSON. The data
 * we *do* have locally — `minecraft-data`'s biome table — carries only `id`,
 * `temperature` and a map `color`; it has no downfall and no water colour, so
 * it cannot reconstruct the tint. Checked before hand-rolling: nothing in
 * minecraft-data or deepslate ships the colormaps.
 *
 * So this is a hand-written table of the vanilla per-biome tints, keyed by
 * biome name. It covers every overworld biome the pinned registry has; unknown
 * or nether/end biomes fall back to the temperate default, which is what the
 * client shows for a biome with no colormap entry anyway.
 *
 * The tint is applied *multiplicatively* against the reference (plains) tint
 * rather than replacing the palette colour outright, so a grass block, a fern
 * and a leaf block keep the brightness differences the block palette gives
 * them while the biome shifts all of them together. That is exactly what makes
 * a biome seam visible in a render: the whole column of tinted blocks steps at
 * once.
 */

import type { Rgb } from "./block-colors.js";

/** Which colormap a block reads, if any. */
export type TintKind = "grass" | "foliage" | "water";

export interface BiomeTint {
  readonly grass: number;
  readonly foliage: number;
  readonly water: number;
}

/** Vanilla water colour used by every biome that does not override it. */
const DEFAULT_WATER = 0x3f76e4;

/** Temperate default (what plains-like, temperature 0.8 / downfall 0.4 gives). */
export const DEFAULT_TINT: BiomeTint = Object.freeze({
  grass: 0x8eb971,
  foliage: 0x71a74d,
  water: DEFAULT_WATER,
});

function tint(grass: number, foliage: number, water = DEFAULT_WATER): BiomeTint {
  return Object.freeze({ grass, foliage, water });
}

/** Vanilla tints per biome (namespace stripped). */
export const BIOME_TINTS: Readonly<Record<string, BiomeTint>> = Object.freeze({
  // temperature 0.8 / downfall 0.4 — the "plains" corner of the colormap
  plains: tint(0x91bd59, 0x77ab2f),
  sunflower_plains: tint(0x91bd59, 0x77ab2f),
  beach: tint(0x91bd59, 0x77ab2f),
  dripstone_caves: tint(0x91bd59, 0x77ab2f),
  deep_dark: tint(0x91bd59, 0x77ab2f),

  // forests
  forest: tint(0x79c05a, 0x59ae30),
  flower_forest: tint(0x79c05a, 0x59ae30),
  birch_forest: tint(0x88bb67, 0x6ba941),
  old_growth_birch_forest: tint(0x88bb67, 0x6ba941),
  dark_forest: tint(0x507a32, 0x59ae30),
  pale_garden: tint(0x778272, 0x878d76, 0x76889d),
  windswept_forest: tint(0x8ab689, 0x6da36b),

  // jungles
  jungle: tint(0x59c93c, 0x30bb0b),
  bamboo_jungle: tint(0x59c93c, 0x30bb0b),
  sparse_jungle: tint(0x64c73f, 0x3bbb0f),

  // taigas / cold
  taiga: tint(0x86b783, 0x68a464),
  old_growth_spruce_taiga: tint(0x86b783, 0x68a464),
  old_growth_pine_taiga: tint(0x86b87f, 0x68a55f),
  snowy_taiga: tint(0x80b497, 0x60a17b, 0x205e74),
  snowy_plains: tint(0x80b497, 0x60a17b),
  ice_spikes: tint(0x80b497, 0x60a17b),
  snowy_slopes: tint(0x80b497, 0x60a17b),
  frozen_peaks: tint(0x80b497, 0x60a17b),
  jagged_peaks: tint(0x80b497, 0x60a17b),
  grove: tint(0x80b497, 0x60a17b),
  snowy_beach: tint(0x83b593, 0x64a278),
  frozen_river: tint(0x80b497, 0x60a17b, 0x3938c9),

  // hills / peaks / shores
  windswept_hills: tint(0x8ab689, 0x6da36b),
  windswept_gravelly_hills: tint(0x8ab689, 0x6da36b),
  stony_shore: tint(0x8ab689, 0x6da36b),
  stony_peaks: tint(0x9abe4b, 0x82ac1e),
  meadow: tint(0x83bb6d, 0x63a948, 0x0e4ecf),
  cherry_grove: tint(0xb6db61, 0xb6db61, 0x5db7ef),

  // dry
  desert: tint(0xbfb755, 0xaea42a),
  savanna: tint(0xbfb755, 0xaea42a),
  savanna_plateau: tint(0xbfb755, 0xaea42a),
  windswept_savanna: tint(0xbfb755, 0xaea42a),
  badlands: tint(0x90814d, 0x9e814d),
  wooded_badlands: tint(0x90814d, 0x9e814d),
  eroded_badlands: tint(0x90814d, 0x9e814d),

  // wet
  swamp: tint(0x6a7039, 0x6a7039, 0x617b64),
  mangrove_swamp: tint(0x6a7039, 0x8db127, 0x3a7a6a),
  mushroom_fields: tint(0x55c93f, 0x2bbb0f),
  lush_caves: tint(0x8eb971, 0x71a74d),

  // water bodies
  river: tint(0x8eb971, 0x71a74d),
  ocean: tint(0x8eb971, 0x71a74d),
  deep_ocean: tint(0x8eb971, 0x71a74d),
  cold_ocean: tint(0x8eb971, 0x71a74d, 0x3d57d6),
  deep_cold_ocean: tint(0x8eb971, 0x71a74d, 0x3d57d6),
  lukewarm_ocean: tint(0x8eb971, 0x71a74d, 0x45adf2),
  deep_lukewarm_ocean: tint(0x8eb971, 0x71a74d, 0x45adf2),
  warm_ocean: tint(0x8eb971, 0x71a74d, 0x43d5ee),
  frozen_ocean: tint(0x80b497, 0x60a17b, 0x3938c9),
  deep_frozen_ocean: tint(0x80b497, 0x60a17b, 0x3938c9),

  // nether / end: no colormap, dry-corner values
  nether_wastes: tint(0xbfb755, 0xaea42a),
  crimson_forest: tint(0xbfb755, 0xaea42a),
  warped_forest: tint(0xbfb755, 0xaea42a),
  soul_sand_valley: tint(0xbfb755, 0xaea42a),
  basalt_deltas: tint(0xbfb755, 0xaea42a),
});

/** Tints for `biome` (namespaced or not); the temperate default when unknown. */
export function biomeTint(biome: string | undefined): BiomeTint {
  if (biome === undefined) return DEFAULT_TINT;
  const short = biome.startsWith("minecraft:") ? biome.slice("minecraft:".length) : biome;
  return BIOME_TINTS[short] ?? DEFAULT_TINT;
}

/** Blocks whose texture is grey-scale and multiplied by the grass colormap. */
const GRASS_BLOCKS: ReadonlySet<string> = new Set([
  "grass_block",
  "short_grass",
  "grass",
  "tall_grass",
  "fern",
  "large_fern",
  "potted_fern",
  "sugar_cane",
  "pink_petals",
  "wildflowers",
]);

/** Blocks multiplied by the foliage colormap. */
const FOLIAGE_BLOCKS: ReadonlySet<string> = new Set([
  "oak_leaves",
  "jungle_leaves",
  "acacia_leaves",
  "dark_oak_leaves",
  "mangrove_leaves",
  "vine",
]);

/**
 * Blocks that are *not* tinted even though their name looks like it: birch,
 * spruce, cherry, azalea and pale oak leaves ship fixed colours in vanilla, so
 * a biome must not move them.
 */
const FIXED_LEAVES: ReadonlySet<string> = new Set([
  "birch_leaves",
  "spruce_leaves",
  "cherry_leaves",
  "azalea_leaves",
  "flowering_azalea_leaves",
  "pale_oak_leaves",
]);

/** Which colormap `blockName` reads, or `undefined` for an untinted block. */
export function tintKindOf(blockName: string): TintKind | undefined {
  let name = blockName.startsWith("minecraft:")
    ? blockName.slice("minecraft:".length)
    : blockName;
  const bracket = name.indexOf("[");
  if (bracket >= 0) name = name.slice(0, bracket);

  if (FIXED_LEAVES.has(name)) return undefined;
  if (GRASS_BLOCKS.has(name)) return "grass";
  if (FOLIAGE_BLOCKS.has(name)) return "foliage";
  if (name === "water" || name === "bubble_column" || name === "water_cauldron") return "water";
  return undefined;
}

function channels(color: number): Rgb {
  return [(color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff];
}

function clamp255(value: number): number {
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
}

/**
 * Shift `color` (a block's palette colour) from the reference biome tint to
 * `biome`'s. Untinted blocks come back unchanged, so this is safe to call on
 * every voxel.
 */
export function applyBiomeTint(color: Rgb, blockName: string, biome: string | undefined): Rgb {
  const kind = tintKindOf(blockName);
  if (kind === undefined) return color;
  const target = channels(biomeTint(biome)[kind]);
  const reference = channels(DEFAULT_TINT[kind]);
  return [
    clamp255((color[0] * target[0]) / (reference[0] || 1)),
    clamp255((color[1] * target[1]) / (reference[1] || 1)),
    clamp255((color[2] * target[2]) / (reference[2] || 1)),
  ];
}
