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
 * | high rock (bare)      | `stony_peaks`                |
 * | snow                  | `snowy_slopes`               |
 *
 * "under a forest node" is resolved from the forest coverage mask built by the
 * scatter pass's eligibility rules — a column that a forest node could plant
 * in counts as forested even where the Poisson sampler happened not to place a
 * tree, so biomes do not speckle. Nodes below `FOREST_COVERAGE_DENSITY` are
 * excluded from that mask: scattered trees over open country are not a wood.
 */

import { SurfaceClass } from "@terrainist/stdlib";
import type { ClimateIntent } from "@terrainist/spec/ir";

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

  // --- intent-only rows (F21, 2026-08-09) ----------------------------------
  // `biomeForColumn` never derives any of these: they exist so that
  // `intent.climate.biome` can *name* them without drawing LOAM-W472. The
  // ledger's bar is "the emitter can honestly place it at DataVersion 4671",
  // which here means two things at once — the id is in the 1.21.11 registry,
  // and the biome's whole signature is grass tint, foliage tint, sky/fog and
  // mob spawns, none of which the terrain pass has to write blocks for.
  //
  // Deliberately NOT carried, because their signature is *ground material* the
  // terrain pass never lays and the world would read as a lie: `desert` and
  // `badlands` (sand / terracotta), `mangrove_swamp` (mud and water),
  // `mushroom_fields` (mycelium), `ice_spikes` (packed ice),
  // `bamboo_jungle` (bamboo). Ask for those with terrain, not with a tint.
  //
  // Appended in a block at the end on purpose: `ambientVote`'s tie-break walks
  // this array in source order, so anything inserted higher up would move
  // existing worlds.
  //
  // Two of them CAN now win that vote: `savanna` and `windswept_savanna`, in a
  // world whose settlement theme declares itself arid (see
  // {@link aridAmbientBiome}, 2026-08-11). The bias writes into the pre-clamp
  // layer, so an arid world's settlement ground follows its dry country exactly
  // as it has always followed its wet one. No other world is affected: the bias
  // is identity without the flag.
  "minecraft:dark_forest",
  "minecraft:birch_forest",
  "minecraft:old_growth_birch_forest",
  "minecraft:flower_forest",
  "minecraft:windswept_forest",
  "minecraft:pale_garden",
  "minecraft:cherry_grove",
  "minecraft:sunflower_plains",
  "minecraft:meadow",
  "minecraft:grove",
  "minecraft:savanna",
  "minecraft:windswept_savanna",
  "minecraft:jungle",
  "minecraft:sparse_jungle",
  "minecraft:swamp",
  "minecraft:snowy_taiga",
  "minecraft:old_growth_spruce_taiga",
  "minecraft:old_growth_pine_taiga",
  "minecraft:jagged_peaks",
  "minecraft:frozen_peaks",
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
 * Absolute floors, in blocks above sea level, under the two rock bands.
 *
 * `relief` is normalized to the world's own vertical span, so on its own it is
 * not merely scale-free but scale-*inverting*: the flatter the world, the
 * larger the share of columns that clear 0.6 of a short span. A world whose
 * whole land sat within 22 blocks of the sea came out 74% "high rock"
 * (F20, 2026-08-09). The normalized threshold still decides *which* columns are
 * the high ones within a world; these floors decide whether the world has any
 * high ground at all.
 */
export const UPLAND_RISE = 24;
/** Blocks above sea level below which land is never "high rock". */
export const HIGH_ROCK_RISE = 48;

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
  // Intent-only rows (F21). Every key here is a biome `biomeForColumn` never
  // derives, so these entries can only fire on a document that *names* the
  // biome — no existing world moves a byte.
  ["minecraft:snowy_taiga", "minecraft:taiga"],
  ["minecraft:grove", "minecraft:meadow"],
  ["minecraft:frozen_peaks", "minecraft:jagged_peaks"],
]);

const TEMPERATE_TO_SNOWY: ReadonlyMap<string, ProfileBiome> = new Map<string, ProfileBiome>([
  ["minecraft:plains", "minecraft:snowy_plains"],
  ["minecraft:beach", "minecraft:snowy_beach"],
  ["minecraft:windswept_hills", "minecraft:snowy_slopes"],
  ["minecraft:forest", "minecraft:taiga"],
  // Intent-only keys, for the same reason as above: `meadow` and
  // `jagged_peaks` are never derived, so adding their snowy siblings changes
  // nothing a document did not ask for. `taiga → snowy_taiga` is deliberately
  // absent: `taiga` IS derived, and adding it would repaint shipped worlds.
  ["minecraft:meadow", "minecraft:grove"],
  ["minecraft:jagged_peaks", "minecraft:frozen_peaks"],
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

/* -------------------------------------------------------------------------- */
/* the arid ambient bias (2026-08-11)                                          */
/* -------------------------------------------------------------------------- */

/**
 * The dry sibling of each **derived** grassland biome.
 *
 * Kai, walking Troy: the sandstone city was right and the country around it
 * read *lush Ireland, not Aegean gold*. Nothing was wrong with the terrain —
 * the grass tint was simply the temperate one, because the biome rule above
 * knows about height, water and trees and nothing at all about what the town
 * is built from.
 *
 * Two entries, and only two, because the bias is about **grass tint** and the
 * rule only derives two biomes whose whole read is grass:
 * `plains` and the grassy hills above it. `forest` and `taiga` are woodland —
 * their read is the trees standing in them, and a savanna tint under a closed
 * oak canopy is a different lie from the one being fixed. Bare rock, beach,
 * snow and water carry no grass tint at all.
 *
 * @see MaterialTheme.aridAmbient — the flag that turns this on.
 */
const ARID_GRASSLAND: ReadonlyMap<string, ProfileBiome> = new Map<string, ProfileBiome>([
  ["minecraft:plains", "minecraft:savanna"],
  ["minecraft:windswept_hills", "minecraft:windswept_savanna"],
]);

/**
 * Offsets past which an authored climate counts as a *declaration* of cold or
 * wet rather than a nudge, and outranks a theme's dryness.
 *
 * Half the range, deliberately high. The number that set it is Troy's own
 * document, which asks for a "warm dry Aegean coastal climate" and writes
 * `temperature: 0.5, humidity: 0.3` — a *positive* humidity on the driest
 * prompt in the battery. Authoring models nudge humidity for reasons that have
 * nothing to do with rain, and a bar at zero would switch this feature off for
 * the very world it was built for. Half the axis is a model saying "rainforest".
 */
export const ARID_COLD_OFFSET = -0.5;
/** @see ARID_COLD_OFFSET */
export const ARID_WET_OFFSET = 0.5;

/**
 * Biome names an author may write that mean cold or wet outright, by prefix or
 * by name — the *other* half of "explicitly cold/snowy/wet".
 *
 * Naming one of these over a sun-clay town is an author saying the place is not
 * dry, whatever it is built of, and it wins.
 */
const NOT_DRY_BIOME =
  /^minecraft:(snowy_|frozen_|.*taiga|grove|swamp|jungle|sparse_jungle|bamboo_jungle|river|ocean|deep_)/;

/** The climate an author wrote, as much of it as reaches the biome pass. */
export type AuthoredClimate = Pick<ClimateIntent, "biome" | "snow" | "temperature" | "humidity">;

/**
 * True when an authored climate outranks a theme's `aridAmbient` declaration.
 *
 * **Not** simply "the author named a biome": `intent.climate.biome` names the
 * ground the *settlement* stands on and the land-use clamp already honours it
 * at precedence rung 1 — Troy says `beach`, and its footprint stays beach with
 * or without this bias. What outranks the theme is the author declaring the
 * *country* cold or wet: a snowy or rainy biome by name, a snow policy of
 * `always`, or an offset past {@link ARID_COLD_OFFSET} / {@link ARID_WET_OFFSET}.
 */
export function climateOutranksArid(climate: AuthoredClimate): boolean {
  if (climate.snow === "always") return true;
  if (climate.biome !== undefined && NOT_DRY_BIOME.test(climate.biome)) return true;
  if ((climate.temperature ?? 0) <= ARID_COLD_OFFSET) return true;
  return (climate.humidity ?? 0) >= ARID_WET_OFFSET;
}

/** Everything {@link aridAmbientBiome} needs to know about a column. */
export interface AridBiasInput {
  /** The settlement theme's `aridAmbient` declaration. */
  readonly arid: boolean;
  /**
   * True when the author declared a climate that outranks the theme — see
   * {@link climateOutranksArid}. Author intent always wins.
   */
  readonly authored: boolean;
  /** The column's temperature; a cold column keeps its temperate tint. */
  readonly temperature: number;
}

/**
 * The dry sibling of a derived ambient biome, or the biome unchanged.
 *
 * Applied to the **derived** layer only, before the land-use clamp: the clamped
 * footprint is whatever the clamp decided, and this never touches it.
 */
export function aridAmbientBiome(biome: ProfileBiome, c: AridBiasInput): ProfileBiome {
  if (!c.arid || c.authored) return biome;
  if (c.temperature < TAIGA_TEMPERATURE) return biome;
  return ARID_GRASSLAND.get(biome) ?? biome;
}

/** Everything the biome rule reads for one column. */
export interface BiomeInput {
  /** Surface class from the stdlib classifier. */
  readonly surfaceClass: number;
  /** Field height, rounded to the block the surface sits on. */
  readonly groundY: number;
  /** Normalized relief in `[0, 1]`. */
  readonly relief: number;
  /** The world's sea level, for the absolute floors under the rock bands. */
  readonly seaLevel: number;
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
      return c.relief >= HIGH_ROCK_RELIEF && c.groundY - c.seaLevel >= HIGH_ROCK_RISE
        ? "minecraft:stony_peaks"
        : "minecraft:windswept_hills";
    default: {
      // Soil caps at `windswept_hills`: grass over four blocks of dirt is not
      // bare rock, whatever its height. Only the `CLIFF` branch reaches
      // `stony_peaks`.
      if (c.relief >= UPLAND_RELIEF && c.groundY - c.seaLevel >= UPLAND_RISE) {
        return "minecraft:windswept_hills";
      }
      if (!c.forested) return "minecraft:plains";
      return c.temperature < TAIGA_TEMPERATURE ? "minecraft:taiga" : "minecraft:forest";
    }
  }
}
