/**
 * level.dat construction.
 *
 * `prismarine-provider-anvil`'s `level.writeLevel` is too limiting for a world
 * that must actually load: it hardcodes `LevelName: "prismarine-world"`, omits
 * `DataVersion`, and cannot express `WorldGenSettings`. So we build the NBT
 * ourselves and gzip it.
 *
 * The generator is a **void-style superflat** (flat, one layer of air, no
 * features, no lakes, no structures) so that any chunk we did not emit
 * generates empty instead of default overworld terrain.
 *
 * Schema note: 1.21.9+ (this includes DataVersion 4671) restructured level.dat.
 * `SpawnX`/`SpawnY`/`SpawnZ`/`SpawnAngle` became a single `spawn` compound and
 * `GameRules` became `game_rules` with namespaced keys. Writing the legacy
 * names at DataVersion 4671 silently loses them: no data fixer runs, because
 * from the game's point of view the world is already current. The field set
 * below was checked against real 1.21.11 saves.
 */

import {
  LONG_ZERO,
  bool,
  byte,
  compound,
  compoundList,
  emptyList,
  float,
  int,
  intArray,
  long,
  string,
  stringList,
} from "./nbt.js";
import type { NbtCompoundValue, NbtRoot } from "./nbt.js";

/** World spawn position (block coordinates). */
export interface LevelDatSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Biome used both for emitted chunks and for the flat generator's fill. */
export const DEFAULT_BIOME = "minecraft:plains";

export interface LevelDatOptions {
  readonly levelName: string;
  readonly spawn: LevelDatSpawn;
  readonly minecraftVersion: string;
  readonly dataVersion: number;
  /** Creative by default; 0 = survival, 1 = creative. */
  readonly gameType?: number;
  /** 0 = peaceful. */
  readonly difficulty?: number;
  /** World seed, as a `[high, low]` long. Fixed for determinism. */
  readonly seed?: readonly [number, number];
  /**
   * Game rules to override, by rule name.
   *
   * Names are the 1.21.9+ ones — namespaced `minecraft:` snake_case, e.g.
   * `command_block_output`, not the old camelCase `commandBlockOutput`. A bare
   * name is namespaced here; the old spelling would be written verbatim and
   * silently ignored by the game, so callers pass the new one.
   *
   * A `boolean` is written as a byte and a `number` as an int, which is the
   * shape real 1.21.11 saves carry (verified: `minecraft:command_block_output`
   * is `byte 1`, `minecraft:random_tick_speed` is `int 3`).
   */
  readonly gameRules?: Readonly<Record<string, boolean | number>>;
}

/**
 * Build the level.dat NBT document.
 *
 * Nothing here reads the clock or an RNG: `LastPlayed`, `Time`, `DayTime` and
 * the seed are all pinned so two emits of the same document are byte-identical.
 */
export function buildLevelDat(options: LevelDatOptions): NbtRoot {
  const {
    levelName,
    spawn,
    minecraftVersion,
    dataVersion,
    gameType = 1,
    difficulty = 0,
    seed = LONG_ZERO,
    gameRules = {},
  } = options;

  const data: NbtCompoundValue = {
    // --- format / version ---------------------------------------------------
    version: int(19133),
    DataVersion: int(dataVersion),
    Version: compound({
      Id: int(dataVersion),
      Name: string(minecraftVersion),
      Snapshot: byte(0),
      Series: string("main"),
    }),
    WasModded: bool(false),
    initialized: bool(true),

    // --- identity -----------------------------------------------------------
    LevelName: string(levelName),
    // Pinned at 0: the wall clock must never enter the output.
    LastPlayed: long(LONG_ZERO),

    // --- rules --------------------------------------------------------------
    GameType: int(gameType),
    allowCommands: bool(true),
    hardcore: bool(false),
    Difficulty: byte(difficulty),
    DifficultyLocked: bool(false),
    // 1.21.9+ name; an empty compound means "all rules at their defaults".
    game_rules: compound(gameRulesCompound(gameRules)),

    // --- spawn (1.21.9+ shape; replaces SpawnX/SpawnY/SpawnZ/SpawnAngle) -----
    spawn: compound({
      pos: intArray([spawn.x, spawn.y, spawn.z]),
      yaw: float(0),
      pitch: float(0),
      dimension: string("minecraft:overworld"),
    }),

    // --- time / weather -----------------------------------------------------
    Time: long(LONG_ZERO),
    DayTime: long(LONG_ZERO),
    raining: bool(false),
    rainTime: int(12000),
    thundering: bool(false),
    thunderTime: int(12000),
    clearWeatherTime: int(0),

    // --- misc ---------------------------------------------------------------
    // World border fields are deliberately absent: 1.21.11 saves omit them and
    // the game applies its defaults.
    WanderingTraderSpawnChance: int(25),
    WanderingTraderSpawnDelay: int(24_000),
    CustomBossEvents: compound({}),
    ScheduledEvents: emptyList(),
    ServerBrands: stringList(["vanilla"]),
    DataPacks: compound({ Enabled: stringList(["vanilla"]), Disabled: emptyList() }),

    // --- worldgen -----------------------------------------------------------
    WorldGenSettings: buildWorldGenSettings(seed),
  };

  return { type: "compound", name: "", value: { Data: compound(data) } };
}

/**
 * The `game_rules` compound, with every key namespaced and sorted.
 *
 * Sorted because the compound is written in insertion order and the output has
 * to be byte-identical run to run: a caller who builds the record from an
 * object literal would otherwise pin the bytes to their key order.
 */
function gameRulesCompound(rules: Readonly<Record<string, boolean | number>>): NbtCompoundValue {
  const out: Record<string, ReturnType<typeof bool> | ReturnType<typeof int>> = {};
  for (const key of Object.keys(rules).sort()) {
    const value = rules[key] as boolean | number;
    out[key.includes(":") ? key : `minecraft:${key}`] =
      typeof value === "boolean" ? bool(value) : int(value);
  }
  return out;
}

function buildWorldGenSettings(seed: readonly [number, number]) {
  const flatOverworld: NbtCompoundValue = {
    type: string("minecraft:overworld"),
    generator: compound({
      type: string("minecraft:flat"),
      settings: compound({
        biome: string(DEFAULT_BIOME),
        lakes: bool(false),
        features: bool(false),
        // One layer of air at the world floor: everything we did not emit is void.
        layers: compoundList([{ block: string("minecraft:air"), height: int(1) }]),
        // `structure_overrides` is deliberately omitted, matching real 1.21.11
        // void-superflat saves; the codec treats it as optional.
      }),
    }),
  };

  // The nether and the end keep vanilla generation; only the overworld is void.
  const nether: NbtCompoundValue = {
    type: string("minecraft:the_nether"),
    generator: compound({
      type: string("minecraft:noise"),
      settings: string("minecraft:nether"),
      biome_source: compound({
        type: string("minecraft:multi_noise"),
        preset: string("minecraft:nether"),
      }),
    }),
  };

  const end: NbtCompoundValue = {
    type: string("minecraft:the_end"),
    generator: compound({
      type: string("minecraft:noise"),
      settings: string("minecraft:end"),
      biome_source: compound({ type: string("minecraft:the_end") }),
    }),
  };

  return compound({
    seed: long(seed),
    generate_features: bool(false),
    bonus_chest: bool(false),
    dimensions: compound({
      "minecraft:overworld": compound(flatOverworld),
      "minecraft:the_nether": compound(nether),
      "minecraft:the_end": compound(end),
    }),
  });
}
