/**
 * Per-column biome painting, per the terrain profile's mapping table.
 *
 * The profile's table is:
 *
 * | column                | biome                        |
 * |---|---|
 * | ocean                 | `ocean` (`deep_ocean` below y=45) |
 * | beach zone            | `beach`                      |
 * | lowland               | `plains`, or `forest`/`taiga` under a forest node |
 * | upland                | `windswept_hills`            |
 * | high rock             | `stony_peaks`                |
 * | snow                  | `snowy_slopes`               |
 *
 * "under a forest node" is resolved from the forest coverage mask built by the
 * scatter pass's eligibility rules — a column that a forest node could plant
 * in counts as forested even where the Poisson sampler happened not to place a
 * tree, so biomes do not speckle.
 */

import { SurfaceClass } from "@terrainist/stdlib";

/** Biome names this profile can paint. */
export const PROFILE_BIOMES = [
  "minecraft:ocean",
  "minecraft:deep_ocean",
  "minecraft:cold_ocean",
  "minecraft:deep_cold_ocean",
  "minecraft:beach",
  "minecraft:snowy_beach",
  "minecraft:plains",
  "minecraft:forest",
  "minecraft:taiga",
  "minecraft:windswept_hills",
  "minecraft:stony_peaks",
  "minecraft:snowy_slopes",
] as const;

/** A biome name this profile can paint. */
export type ProfileBiome = (typeof PROFILE_BIOMES)[number];

/** Y below which ocean columns become `deep_ocean` (profile §"Surface, biomes, water"). */
export const DEEP_OCEAN_Y = 45;

/** Temperature below which oceans and beaches take their cold variants. */
export const COLD_TEMPERATURE = 0.3;

/** Temperature below which a forested lowland is taiga rather than forest. */
export const TAIGA_TEMPERATURE = 0.4;

/** Normalized relief above which non-snow land counts as "high rock". */
export const HIGH_ROCK_RELIEF = 0.6;

/** Normalized relief above which soil land counts as "upland". */
export const UPLAND_RELIEF = 0.45;

/** Everything the biome rule reads for one column. */
export interface BiomeInput {
  /** Surface class from the stdlib classifier. */
  readonly surfaceClass: number;
  /** Field height, rounded to the block the surface sits on. */
  readonly groundY: number;
  /** Normalized relief in `[0, 1]`. */
  readonly relief: number;
  readonly temperature: number;
  /** Whether any forest node considers this column plantable. */
  readonly forested: boolean;
}

/** The profile's per-column biome rule. */
export function biomeForColumn(c: BiomeInput): ProfileBiome {
  switch (c.surfaceClass) {
    case SurfaceClass.UNDERWATER: {
      const deep = c.groundY < DEEP_OCEAN_Y;
      if (c.temperature < COLD_TEMPERATURE) {
        return deep ? "minecraft:deep_cold_ocean" : "minecraft:cold_ocean";
      }
      return deep ? "minecraft:deep_ocean" : "minecraft:ocean";
    }
    case SurfaceClass.BEACH:
    case SurfaceClass.LAKESHORE:
      return c.temperature < COLD_TEMPERATURE ? "minecraft:snowy_beach" : "minecraft:beach";
    case SurfaceClass.SNOW:
      return "minecraft:snowy_slopes";
    case SurfaceClass.CLIFF:
      return c.relief >= HIGH_ROCK_RELIEF ? "minecraft:stony_peaks" : "minecraft:windswept_hills";
    default: {
      if (c.relief >= HIGH_ROCK_RELIEF) return "minecraft:stony_peaks";
      if (c.relief >= UPLAND_RELIEF) return "minecraft:windswept_hills";
      if (!c.forested) return "minecraft:plains";
      return c.temperature < TAIGA_TEMPERATURE ? "minecraft:taiga" : "minecraft:forest";
    }
  }
}
