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
  /** Not painted by {@link biomeForColumn}; the land-use clamp's snowy ground. */
  "minecraft:snowy_plains",
  "minecraft:forest",
  "minecraft:taiga",
  "minecraft:windswept_hills",
  "minecraft:stony_peaks",
  "minecraft:snowy_slopes",
  "minecraft:river",
  "minecraft:basalt_deltas",
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

/**
 * Snowy / non-snowy sibling pairs, keyed snowy → temperate.
 *
 * The land-use clamp derives its biome from the **ambient majority** around a
 * footprint, and then has to make that winner agree with the settlement's
 * resolved snow policy: a snowy ambient under policy `never` would paint snow
 * grass with no snow on it (and vice versa). Each pair is chosen so the two
 * halves read as the same *place* in two climates — the grass tint moves, the
 * terrain identity does not.
 *
 * `stony_peaks` is deliberately absent: bare rock carries no grass tint and is
 * legible with or without snow, so it is its own sibling in both directions.
 */
const SNOWY_TO_TEMPERATE: ReadonlyMap<string, ProfileBiome> = new Map<string, ProfileBiome>([
  ["minecraft:snowy_plains", "minecraft:plains"],
  ["minecraft:snowy_beach", "minecraft:beach"],
  ["minecraft:snowy_slopes", "minecraft:windswept_hills"],
  ["minecraft:taiga", "minecraft:forest"],
]);

const TEMPERATE_TO_SNOWY: ReadonlyMap<string, ProfileBiome> = new Map<string, ProfileBiome>([
  ["minecraft:plains", "minecraft:snowy_plains"],
  ["minecraft:beach", "minecraft:snowy_beach"],
  ["minecraft:windswept_hills", "minecraft:snowy_slopes"],
  ["minecraft:forest", "minecraft:taiga"],
]);

/**
 * Map a biome onto the sibling that agrees with a resolved snow policy.
 *
 * Identity when the biome is already consistent, or when it has no sibling
 * (bare rock, water, volcanic ash — none of which take a grass tint).
 */
export function snowConsistentBiome(
  biome: ProfileBiome,
  policy: "never" | "always",
): ProfileBiome {
  if (policy === "always") return TEMPERATE_TO_SNOWY.get(biome) ?? biome;
  return SNOWY_TO_TEMPERATE.get(biome) ?? biome;
}

/** True when the biome is dry ground whose grass tint the clamp may adopt. */
export function isTintedLandBiome(biome: ProfileBiome): boolean {
  return (
    biome !== "minecraft:ocean" &&
    biome !== "minecraft:deep_ocean" &&
    biome !== "minecraft:cold_ocean" &&
    biome !== "minecraft:deep_cold_ocean" &&
    biome !== "minecraft:river" &&
    biome !== "minecraft:basalt_deltas"
  );
}

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
  /** Submerged by a closed-basin pool — fresh water, not sea. */
  readonly lake?: boolean;
  /** On the bare upper cone, rim or caldera of a volcano. */
  readonly volcanicUpper?: boolean;
}

/**
 * The profile's per-column biome rule.
 *
 * Two overrides come before the surface-class table, because they are about
 * *what the column is part of* rather than what it looks like: a closed-basin
 * pool is fresh water (`river`, whose tint reads as a lake rather than as the
 * sea), and the bare upper cone of a volcano is `basalt_deltas` — which in game
 * brings the ash particles and dark fog that sell a volcano from the ground.
 */
export function biomeForColumn(c: BiomeInput): ProfileBiome {
  if (c.lake === true) return "minecraft:river";
  if (c.volcanicUpper === true) return "minecraft:basalt_deltas";
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
