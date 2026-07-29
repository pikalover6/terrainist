/**
 * Thin typed adapter over the (untyped, CommonJS) PrismarineJS stack.
 *
 * Everything that touches `minecraft-data`, `prismarine-chunk`,
 * `prismarine-provider-anvil`, `prismarine-nbt` and `vec3` lives here, so the
 * rest of the compiler talks to real types instead of `any`. The libraries are
 * loaded through `createRequire` because they are CJS and their published
 * typings do not match how we use them.
 */

import { open, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import * as nbt from "./nbt.js";
import type { NbtCompoundValue, NbtRoot } from "./nbt.js";

const require = createRequire(import.meta.url);

/* -------------------------------------------------------------------------- */
/* Shapes of the underlying JS libraries (narrowed to what we actually use).   */
/* -------------------------------------------------------------------------- */

interface RawVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface RawBlockStateDef {
  readonly name: string;
  readonly type: string;
  readonly num_values: number;
  readonly values?: readonly string[];
}

interface RawBlockDef {
  readonly id: number;
  readonly name: string;
  readonly defaultState: number;
  readonly minStateId: number;
  readonly maxStateId: number;
  readonly states?: readonly RawBlockStateDef[];
}

interface RawBiomeDef {
  readonly id: number;
  readonly name: string;
}

interface RawMinecraftData {
  readonly version: { readonly minecraftVersion: string; readonly dataVersion: number };
  readonly blocksByName: Record<string, RawBlockDef | undefined>;
  readonly blocksByStateId: Record<number, RawBlockDef | undefined>;
  readonly biomesByName: Record<string, RawBiomeDef | undefined>;
}

/**
 * `prismarine-chunk`'s 1.18+ column. `biomes[i].data` is a palette container;
 * a freshly built column always uses the single-value flavour, which is why we
 * can set a uniform biome by assigning its `value`.
 */
interface RawChunkColumn {
  setBlock(pos: RawVec3, block: { type: number; stateId: number }): void;
  /** Direct state write — the fast path used by the terrain materializer. */
  setBlockStateId(pos: RawVec3, stateId: number): void;
  setBiome(pos: RawVec3, biomeId: number): void;
  getBlock(pos: RawVec3): { name: string; stateId: number };
  /** Cheap read path: skips building a `prismarine-block` instance. */
  getBlockStateId(pos: RawVec3): number;
  getBiome(pos: RawVec3): number;
  readonly biomes: readonly { data: { value?: number; palette?: unknown } }[];
  /** Read by prismarine-provider-anvil; defaults to a `Date.now()`-derived value. */
  lastUpdate?: readonly [number, number];
  inhabitedTime?: number;
  /**
   * The chunk's block entities, keyed `"<x>,<y>,<z>"` by
   * `CommonChunkColumn`'s `posKey`. `prismarine-provider-anvil` serialises
   * `Object.values(...)` of this straight into the chunk's `block_entities`
   * list, so each value is a *compound body* — a map of field name to tagged
   * value — and the insertion order of this object is the order they land on
   * disk.
   */
  blockEntities: Record<string, unknown>;
}

interface RawAnvil {
  save(x: number, z: number, chunk: RawChunkColumn): Promise<void>;
  load(x: number, z: number): Promise<RawChunkColumn | null>;
  close(): Promise<void>;
}

type RawVec3Ctor = new (x: number, y: number, z: number) => RawVec3;
type RawChunkCtor = new (options: { minY: number; worldHeight: number }) => RawChunkColumn;

/* -------------------------------------------------------------------------- */
/* Public, typed surface.                                                     */
/* -------------------------------------------------------------------------- */

/** World vertical extent for 1.18+ worlds. */
export const WORLD_MIN_Y = -64;
export const WORLD_HEIGHT = 384;

/** A resolved block: what `setBlock` needs. */
export interface EmitBlock {
  readonly id: number;
  readonly name: string;
  readonly stateId: number;
}

/** The topmost non-air block of one column, as returned by {@link EmitChunk.highestBlock}. */
export interface EmitColumnTop {
  /** Absolute world y. */
  readonly y: number;
  /** Un-namespaced block name, e.g. `"grass_block"`. */
  readonly name: string;
}

/** A single chunk column being built or read back. */
export interface EmitChunk {
  /** Coordinates are chunk-local x/z (0..15) and absolute y. */
  setBlock(x: number, y: number, z: number, block: EmitBlock): void;
  getBlockName(x: number, y: number, z: number): string;
  /**
   * Raw block state id; 0 is air. The cheap read path — unlike
   * {@link getBlockName} it builds no `prismarine-block`, so bulk scans should
   * use it plus {@link PrismarineStack.blockNameByStateId}.
   */
  getBlockStateId(x: number, y: number, z: number): number;
  getBiomeId(x: number, y: number, z: number): number;
  /**
   * Scan a column top-down for its highest non-air block; `null` if it is
   * empty. Read-side helper for top-down renders and heightmaps.
   */
  highestBlock(x: number, z: number): EmitColumnTop | null;
  /** Paint the whole column with one biome (keeps single-value palettes). */
  setUniformBiome(biomeId: number): void;
  /**
   * Fast bulk write of one state id, without allocating a `Vec3` per call.
   *
   * 30M+ block writes is an ordinary terrain compile, so the materializer uses
   * this instead of {@link setBlock}: it reuses a single scratch position
   * object and skips the `prismarine-block` round trip entirely.
   */
  setStateId(x: number, y: number, z: number, stateId: number): void;
  /**
   * Fill `y0..y1` (inclusive, either order) of one column with a state id.
   * The materializer's column-run fast path.
   */
  fillColumn(x: number, z: number, y0: number, y1: number, stateId: number): void;
  /**
   * Set the biome of the 4×4×4 cell containing this block position. Unlike
   * {@link setUniformBiome} this promotes the section's biome container to a
   * palette, which is what per-column biomes require.
   */
  setBiomeAt(x: number, y: number, z: number, biomeId: number): void;
  /**
   * Pin `LastUpdate` to 0. prismarine-provider-anvil otherwise writes
   * `Date.now() & 0xffff`, which would break byte-for-byte determinism.
   */
  freezeLastUpdate(): void;
  /**
   * Attach a block entity to the block at **absolute world** `(x, y, z)`.
   *
   * The odd coordinate convention — world x/z here, chunk-local x/z everywhere
   * else on this interface — is not a slip. A block entity's own compound
   * stores absolute coordinates, and the chunk column does not know where it
   * sits in the world until the Anvil writer is told, so the *only* place the
   * world position exists is the caller's hand. Taking it here lets the adapter
   * stamp the envelope (`x`, `y`, `z`, `keepPacked`, and a `components` default)
   * itself, which is what stops a caller from writing a compound whose stored
   * coordinates disagree with the block it is attached to — a mismatch the game
   * resolves by discarding the block entity.
   *
   * `compound` is the type-specific body plus an `id` naming the block-entity
   * type; the envelope fields are overwritten, so they cannot be got wrong.
   * Setting a second entity at the same position replaces the first.
   */
  setBlockEntityNbt(x: number, y: number, z: number, compound: NbtCompoundValue): void;
  /**
   * Every block entity this chunk carries, in the order it will be written.
   *
   * Read-side counterpart of {@link setBlockEntityNbt}, for tests and for a
   * readback that wants the compound rather than the block.
   */
  blockEntitiesNbt(): readonly NbtCompoundValue[];
}

/** The Anvil region writer/reader for one `region/` directory. */
export interface EmitAnvil {
  save(chunkX: number, chunkZ: number, chunk: EmitChunk): Promise<void>;
  load(chunkX: number, chunkZ: number): Promise<EmitChunk | null>;
  close(): Promise<void>;
}

/** Everything version-pinned, resolved once. */
export interface PrismarineStack {
  readonly minecraftVersion: string;
  readonly dataVersion: number;
  blockByName(name: string): EmitBlock | undefined;
  /**
   * A specific block *state*, addressed by property values — e.g.
   * `blockStateOf("tall_grass", { half: "lower" })`.
   *
   * Block states are laid out contiguously from `minStateId`, with the **last**
   * declared property varying fastest, so the id is a mixed-radix index. Any
   * property left out keeps the value the default state carries; an unknown
   * block or an unknown property value yields `undefined`.
   */
  blockStateOf(name: string, properties: Readonly<Record<string, string>>): number | undefined;
  /** Un-namespaced name for a block state id; `undefined` if unknown. */
  blockNameByStateId(stateId: number): string | undefined;
  /**
   * Decode a state id back into its block name and full property map — the
   * inverse of {@link blockStateOf}.
   *
   * The connection-state pass needs this: to rewrite a fence's four
   * connection flags without losing the `waterlogged` it already carries, it
   * has to read the state it is rewriting rather than start from the default.
   */
  blockStateProps(
    stateId: number,
  ): { readonly name: string; readonly props: Record<string, string> } | undefined;
  /**
   * True when a block presents a full, solid square face on every side — the
   * property that decides whether a fence, wall or pane connects to it.
   *
   * Deliberately conservative. `minecraft-data` reports a `boundingBox` of
   * `"block"` for anything whose *bounds* are a cube, which includes stairs,
   * slabs, doors, torches and a dirt path, so it cannot answer this on its
   * own; what it can do is rule out the empty-bounded blocks cheaply, and the
   * rest is a name deny-list. Getting this wrong in the permissive direction
   * would connect a fence to thin air, which is the defect the pass exists to
   * remove, so "unsure" resolves to "no".
   */
  isFullCube(stateId: number): boolean;
  /**
   * Validate a block state *as it appears in a written palette* against the
   * pinned registry: the block has to exist, every property name has to be one
   * that block declares, every value has to be in that property's domain, no
   * declared property may be missing, and the resulting mixed-radix state id
   * has to land back inside the block's own id range.
   *
   * Returns `undefined` when the state is legal, or a human-readable reason
   * when it is not. This is the check that makes "the world loads at all" a
   * testable property rather than something only the game client can answer:
   * an unknown block or an out-of-domain property value is not a cosmetic
   * defect, it is a chunk the client refuses to parse.
   */
  blockStateIssue(name: string, properties: Readonly<Record<string, string>>): string | undefined;
  /** True when `name` (namespaced or not) is a biome in the pinned registry. */
  hasBiome(name: string): boolean;
  biomeIdByName(name: string): number | undefined;
  createChunk(): EmitChunk;
  openAnvil(regionDir: string): EmitAnvil;
}

/** Block names that count as "nothing here" when scanning a column. */
const AIR_NAMES = new Set(["air", "cave_air", "void_air"]);

/** Name suffixes that are never a full cube, whatever the bounding box says. */
const PARTIAL_SUFFIXES: readonly string[] = Object.freeze([
  "_stairs",
  "_slab",
  "_fence",
  "_fence_gate",
  "_wall",
  "_pane",
  "_door",
  "_trapdoor",
  "_button",
  "_pressure_plate",
  "_sign",
  "_banner",
  "_carpet",
  "_bed",
  "_head",
  "_skull",
  "_candle",
  "_torch",
  "_rod",
  "_chain",
  "_bars",
  "_plate",
  "_rail",
  "_sapling",
  "_bulb",
  "_amethyst_bud",
  "_cluster",
  "_coral",
  "_coral_fan",
  "_hanging_sign",
]);

/** Exact block names that are not a full cube. */
const PARTIAL_NAMES: ReadonlySet<string> = new Set([
  "air",
  "cave_air",
  "void_air",
  "water",
  "lava",
  "dirt_path",
  "farmland",
  "snow",
  "ladder",
  "lantern",
  "soul_lantern",
  "chest",
  "trapped_chest",
  "ender_chest",
  "anvil",
  "chipped_anvil",
  "damaged_anvil",
  "campfire",
  "soul_campfire",
  "cauldron",
  "water_cauldron",
  "lava_cauldron",
  "powder_snow_cauldron",
  "composter",
  "hopper",
  "brewing_stand",
  "enchanting_table",
  "end_portal_frame",
  "grindstone",
  "lectern",
  "stonecutter",
  "bell",
  "conduit",
  "daylight_detector",
  "sea_pickle",
  "turtle_egg",
  "flower_pot",
  "cake",
  "dragon_egg",
  "piston_head",
  "moving_piston",
  "lever",
  "repeater",
  "comparator",
  "redstone_wire",
  "tripwire",
  "tripwire_hook",
  "vine",
  "glow_lichen",
  "scaffolding",
  "cactus",
  "sugar_cane",
  "bamboo",
  "kelp",
  "kelp_plant",
  "seagrass",
  "tall_seagrass",
  "short_grass",
  "grass",
  "tall_grass",
  "fern",
  "large_fern",
  "dead_bush",
  "lily_pad",
  "snow_block_layer",
  "soul_sand",
  "mud",
  "brown_mushroom",
  "red_mushroom",
  "cobweb",
  "end_rod",
  "lightning_rod",
  "decorated_pot",
  "sniffer_egg",
  "heavy_core",
  "pointed_dripstone",
]);

/** Conservative "does a fence connect to this?" test, by block name. */
function isFullCubeName(name: string): boolean {
  if (PARTIAL_NAMES.has(name)) return false;
  if (name.startsWith("potted_")) return false;
  if (name.endsWith("_flower") || name.endsWith("_tulip") || name.endsWith("_orchid")) return false;
  for (const suffix of PARTIAL_SUFFIXES) {
    if (name.endsWith(suffix)) return false;
  }
  return true;
}

class ChunkAdapter implements EmitChunk {
  /**
   * Reused mutable position for the bulk write paths. Safe because
   * `prismarine-chunk` reads `x`/`y`/`z` synchronously and never retains the
   * object.
   */
  private readonly scratch: { x: number; y: number; z: number };

  constructor(
    /** @internal exposed so the Anvil adapter can hand it back to the library. */
    readonly raw: RawChunkColumn,
    private readonly vec: RawVec3Ctor,
    private readonly nameByStateId: (stateId: number) => string | undefined,
  ) {
    this.scratch = new vec(0, 0, 0) as { x: number; y: number; z: number };
  }

  setStateId(x: number, y: number, z: number, stateId: number): void {
    const p = this.scratch;
    p.x = x;
    p.y = y;
    p.z = z;
    this.raw.setBlockStateId(p, stateId);
  }

  fillColumn(x: number, z: number, y0: number, y1: number, stateId: number): void {
    const lo = y0 <= y1 ? y0 : y1;
    const hi = y0 <= y1 ? y1 : y0;
    const p = this.scratch;
    p.x = x;
    p.z = z;
    for (let y = lo; y <= hi; y++) {
      p.y = y;
      this.raw.setBlockStateId(p, stateId);
    }
  }

  setBiomeAt(x: number, y: number, z: number, biomeId: number): void {
    const p = this.scratch;
    p.x = x;
    p.y = y;
    p.z = z;
    this.raw.setBiome(p, biomeId);
  }

  setBlock(x: number, y: number, z: number, block: EmitBlock): void {
    this.raw.setBlock(new this.vec(x, y, z), { type: block.id, stateId: block.stateId });
  }

  getBlockName(x: number, y: number, z: number): string {
    return this.raw.getBlock(new this.vec(x, y, z)).name;
  }

  getBlockStateId(x: number, y: number, z: number): number {
    return this.raw.getBlockStateId(new this.vec(x, y, z));
  }

  getBiomeId(x: number, y: number, z: number): number {
    return this.raw.getBiome(new this.vec(x, y, z));
  }

  highestBlock(x: number, z: number): EmitColumnTop | null {
    // State id 0 is air in every version we target, so the common (empty)
    // case never reaches the name table.
    const pos = new this.vec(x, 0, z) as { x: number; y: number; z: number };
    for (let y = WORLD_MIN_Y + WORLD_HEIGHT - 1; y >= WORLD_MIN_Y; y--) {
      pos.y = y;
      const stateId = this.raw.getBlockStateId(pos);
      if (stateId === 0) continue;
      const name = this.nameByStateId(stateId);
      if (name === undefined || AIR_NAMES.has(name)) continue;
      return { y, name };
    }
    return null;
  }

  setUniformBiome(biomeId: number): void {
    for (const section of this.raw.biomes) {
      if (section.data.palette !== undefined) {
        throw new Error(
          "emit: expected a single-value biome palette on a fresh chunk column",
        );
      }
      section.data.value = biomeId;
    }
  }

  freezeLastUpdate(): void {
    this.raw.lastUpdate = [0, 0];
    this.raw.inhabitedTime = 0;
  }

  setBlockEntityNbt(x: number, y: number, z: number, compound: NbtCompoundValue): void {
    const id = compound["id"];
    if (id === undefined || id.type !== "string") {
      throw new Error(
        `emit: block entity at ${x},${y},${z} has no string "id" naming its type`,
      );
    }
    // The envelope every 1.21.11 block entity carries, verified against real
    // saves. `components` is defaulted rather than forced: a chest that names
    // its own item components should keep them.
    const body: NbtCompoundValue = {
      components: nbt.compound({}),
      ...compound,
      id,
      x: nbt.int(x),
      y: nbt.int(y),
      z: nbt.int(z),
      keepPacked: nbt.byte(0),
    };
    // `setBlockEntity` keys by the position it is handed; the library documents
    // that position as chunk-relative while the tag's own coordinates stay
    // absolute, so the key is local and the body is not.
    this.raw.blockEntities[`${x - (x >> 4) * 16},${y},${z - (z >> 4) * 16}`] = body;
  }

  blockEntitiesNbt(): readonly NbtCompoundValue[] {
    return Object.values(this.raw.blockEntities) as NbtCompoundValue[];
  }
}

/**
 * Resolve the whole prismarine stack for one Minecraft version.
 *
 * @param version e.g. `"1.21.11"`.
 */
export function loadPrismarine(version: string): PrismarineStack {
  const data = (require("minecraft-data") as (v: string) => RawMinecraftData | null)(version);
  if (data == null) {
    throw new Error(`emit: minecraft-data has no version "${version}"`);
  }

  const ChunkColumn = (require("prismarine-chunk") as (v: string) => RawChunkCtor)(version);
  const { Anvil } = require("prismarine-provider-anvil") as {
    Anvil: (v: string) => new (path: string) => RawAnvil;
  };
  const AnvilForVersion = Anvil(version);
  const { Vec3 } = require("vec3") as { Vec3: RawVec3Ctor };

  const blockNameByStateId = (stateId: number): string | undefined =>
    data.blocksByStateId[stateId]?.name;
  const fullCubeCache = new Map<number, boolean>();

  return {
    minecraftVersion: data.version.minecraftVersion,
    dataVersion: data.version.dataVersion,

    blockByName(name: string): EmitBlock | undefined {
      const def = data.blocksByName[stripNamespace(name)];
      return def === undefined
        ? undefined
        : { id: def.id, name: def.name, stateId: def.defaultState };
    },

    blockStateOf(name: string, properties: Readonly<Record<string, string>>): number | undefined {
      const def = data.blocksByName[stripNamespace(name)];
      if (def === undefined) return undefined;
      const states = def.states ?? [];
      if (states.length === 0) return Object.keys(properties).length === 0 ? def.defaultState : undefined;

      // Decode the default state into per-property indices, then override the
      // ones the caller named — so partial property sets stay meaningful.
      const indices: number[] = new Array(states.length).fill(0);
      let rest = def.defaultState - def.minStateId;
      for (let k = states.length - 1; k >= 0; k--) {
        const radix = (states[k] as RawBlockStateDef).num_values;
        indices[k] = rest % radix;
        rest = (rest - (indices[k] as number)) / radix;
      }

      for (const [key, value] of Object.entries(properties)) {
        const k = states.findIndex((s) => s.name === key);
        if (k < 0) return undefined;
        const state = states[k] as RawBlockStateDef;
        const values = domainOf(state);
        if (values.length === 0) return undefined;
        const at = values.indexOf(value);
        if (at < 0) return undefined;
        indices[k] = at;
      }

      let stateId = def.minStateId;
      let stride = 1;
      for (let k = states.length - 1; k >= 0; k--) {
        stateId += (indices[k] as number) * stride;
        stride *= (states[k] as RawBlockStateDef).num_values;
      }
      return stateId;
    },

    blockNameByStateId,

    blockStateProps(stateId: number) {
      const def = data.blocksByStateId[stateId];
      if (def === undefined) return undefined;
      const states = def.states ?? [];
      const props: Record<string, string> = {};
      let rest = stateId - def.minStateId;
      for (let k = states.length - 1; k >= 0; k--) {
        const state = states[k] as RawBlockStateDef;
        const index = rest % state.num_values;
        rest = (rest - index) / state.num_values;
        const values =
          state.values ??
          (state.type === "bool"
            ? ["true", "false"]
            : Array.from({ length: state.num_values }, (_, i) => String(i)));
        props[state.name] = values[index] as string;
      }
      return { name: def.name, props };
    },

    isFullCube(stateId: number): boolean {
      let known = fullCubeCache.get(stateId);
      if (known !== undefined) return known;
      const def = data.blocksByStateId[stateId];
      known =
        def !== undefined &&
        (def as { boundingBox?: string }).boundingBox === "block" &&
        isFullCubeName(def.name);
      fullCubeCache.set(stateId, known);
      return known;
    },

    blockStateIssue(
      name: string,
      properties: Readonly<Record<string, string>>,
    ): string | undefined {
      const short = stripNamespace(name);
      const def = data.blocksByName[short];
      if (def === undefined) return `no such block in ${data.version.minecraftVersion}`;
      const states = def.states ?? [];
      const declared = new Map(states.map((s) => [s.name, s] as const));

      for (const key of Object.keys(properties)) {
        if (!declared.has(key)) {
          const legal = states.map((s) => s.name).join(", ");
          return `property "${key}" is not one of [${legal || "none"}]`;
        }
      }
      for (const state of states) {
        if (!(state.name in properties)) return `property "${state.name}" is missing`;
      }

      // Same mixed-radix layout `blockStateOf` writes; recomputing it here is
      // the round trip, not a second copy of the intent.
      let stateId = def.minStateId;
      let stride = 1;
      for (let k = states.length - 1; k >= 0; k--) {
        const state = states[k] as RawBlockStateDef;
        const values = domainOf(state);
        const at = values.indexOf(String(properties[state.name]));
        if (at < 0) {
          return `property "${state.name}" value "${String(properties[state.name])}" is not one of [${values.join("|")}]`;
        }
        stateId += at * stride;
        stride *= state.num_values;
      }
      if (stateId < def.minStateId || stateId > def.maxStateId) {
        return `state id ${stateId} falls outside ${short}'s range ${def.minStateId}..${def.maxStateId}`;
      }
      const back = data.blocksByStateId[stateId];
      if (back?.name !== short) {
        return `state id ${stateId} decodes back to "${back?.name ?? "nothing"}"`;
      }
      return undefined;
    },

    hasBiome(name: string): boolean {
      return data.biomesByName[stripNamespace(name)] !== undefined;
    },

    biomeIdByName(name: string): number | undefined {
      return data.biomesByName[stripNamespace(name)]?.id;
    },

    createChunk(): EmitChunk {
      const column = new ChunkColumn({ minY: WORLD_MIN_Y, worldHeight: WORLD_HEIGHT });
      const chunk = new ChunkAdapter(column, Vec3, blockNameByStateId);
      chunk.freezeLastUpdate();
      return chunk;
    },

    openAnvil(regionDir: string): EmitAnvil {
      const anvil = new AnvilForVersion(regionDir);
      return {
        async save(chunkX, chunkZ, chunk) {
          await anvil.save(chunkX, chunkZ, unwrap(chunk));
        },
        async load(chunkX, chunkZ) {
          const column = await anvil.load(chunkX, chunkZ);
          return column === null ? null : new ChunkAdapter(column, Vec3, blockNameByStateId);
        },
        close() {
          return anvil.close();
        },
      };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Read-side discovery: which chunks does a `region/` directory actually hold?  */
/* -------------------------------------------------------------------------- */

/** Chunk coordinates (chunk units, i.e. block >> 4). */
export interface ChunkPos {
  readonly chunkX: number;
  readonly chunkZ: number;
}

const REGION_FILE_RE = /^r\.(-?\d+)\.(-?\d+)\.mca$/;
/** Region header: 1024 four-byte location entries, one per chunk slot. */
const REGION_LOCATION_ENTRIES = 1024;
const REGION_LOCATION_BYTES = REGION_LOCATION_ENTRIES * 4;

/**
 * List `r.<x>.<z>.mca` files in a region directory, sorted by (z, x).
 *
 * Returns an empty list if the directory does not exist.
 */
export async function listRegionFiles(regionDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(regionDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((name) => REGION_FILE_RE.test(name))
    .map((name) => path.join(regionDir, name))
    .sort();
}

/**
 * Discover every chunk present in a region directory, by reading each region
 * file's location table (a zero entry means "chunk never written").
 *
 * The result is sorted by (chunkZ, chunkX) so callers get a deterministic
 * iteration order.
 */
export async function listChunks(regionDir: string): Promise<ChunkPos[]> {
  const chunks: ChunkPos[] = [];
  for (const file of await listRegionFiles(regionDir)) {
    const match = REGION_FILE_RE.exec(path.basename(file));
    /* c8 ignore next */
    if (match === null) continue;
    const regionX = Number(match[1]);
    const regionZ = Number(match[2]);

    const header = Buffer.alloc(REGION_LOCATION_BYTES);
    const handle = await open(file, "r");
    let read: number;
    try {
      ({ bytesRead: read } = await handle.read(header, 0, REGION_LOCATION_BYTES, 0));
    } finally {
      await handle.close();
    }
    /* c8 ignore next */
    if (read < REGION_LOCATION_BYTES) continue;

    for (let index = 0; index < REGION_LOCATION_ENTRIES; index++) {
      if (header.readUInt32BE(index * 4) === 0) continue;
      chunks.push({
        chunkX: regionX * 32 + (index % 32),
        chunkZ: regionZ * 32 + Math.floor(index / 32),
      });
    }
  }
  return chunks.sort((a, b) => a.chunkZ - b.chunkZ || a.chunkX - b.chunkX);
}

/** One chunk's root NBT, simplified, together with where it came from. */
export interface RawChunkNbt {
  /** Region file this chunk was read from. */
  readonly file: string;
  readonly chunkX: number;
  readonly chunkZ: number;
  /** `prismarine-nbt`'s `simplify`d root compound. */
  readonly root: Record<string, unknown>;
}

/**
 * Read every chunk of one region file as raw NBT, bypassing `prismarine-chunk`.
 *
 * The chunk adapter decodes sections into state ids, which is exactly the wrong
 * lens for a lint that has to check what was *written*: the palette entry's
 * `Name` and `Properties` are the bytes the game parses, and a fault in the
 * serializer would be invisible to a read that goes back through the same
 * table that produced it. So this walks the Anvil container itself — location
 * header, sector, compression byte, NBT — and hands back the tree.
 */
export function readRegionChunksNbt(file: string, buffer: Buffer): RawChunkNbt[] {
  const nbt = require("prismarine-nbt") as {
    parseUncompressed(buf: Buffer): unknown;
    simplify(value: unknown): Record<string, unknown>;
  };
  const zlib = require("node:zlib") as {
    gunzipSync(buf: Buffer): Buffer;
    inflateSync(buf: Buffer): Buffer;
  };

  const match = REGION_FILE_RE.exec(path.basename(file));
  const regionX = match === null ? 0 : Number(match[1]);
  const regionZ = match === null ? 0 : Number(match[2]);

  const chunks: RawChunkNbt[] = [];
  if (buffer.length < REGION_LOCATION_BYTES) return chunks;
  for (let index = 0; index < REGION_LOCATION_ENTRIES; index++) {
    const location = buffer.readUInt32BE(index * 4);
    if (location === 0) continue;
    const offset = (location >> 8) * 4096;
    const length = buffer.readUInt32BE(offset);
    const compression = buffer.readUInt8(offset + 4);
    const payload = buffer.subarray(offset + 5, offset + 4 + length);
    const raw =
      compression === 1
        ? zlib.gunzipSync(payload)
        : compression === 2
          ? zlib.inflateSync(payload)
          : /* 3 = stored uncompressed */ payload;
    chunks.push({
      file,
      chunkX: regionX * 32 + (index % 32),
      chunkZ: regionZ * 32 + Math.floor(index / 32),
      root: nbt.simplify(nbt.parseUncompressed(raw)),
    });
  }
  return chunks;
}

/** Serialise an NBT document to a gzipped buffer (level.dat's on-disk form). */
export function writeGzippedNbt(root: NbtRoot): Buffer {
  const nbt = require("prismarine-nbt") as { writeUncompressed(value: unknown): Buffer };
  const zlib = require("node:zlib") as { gzipSync(buf: Buffer): Buffer };
  // Node's gzip header carries no timestamp (mtime is written as 0), so this is
  // reproducible run-to-run.
  return zlib.gzipSync(nbt.writeUncompressed(root));
}

/** Parse a gzipped NBT document back into a plain JS object (tests/debugging). */
export function readGzippedNbt(buffer: Buffer): unknown {
  const nbt = require("prismarine-nbt") as {
    parseUncompressed(buf: Buffer): unknown;
    simplify(value: unknown): unknown;
  };
  const zlib = require("node:zlib") as { gunzipSync(buf: Buffer): Buffer };
  return nbt.simplify(nbt.parseUncompressed(zlib.gunzipSync(buffer)));
}

function unwrap(chunk: EmitChunk): RawChunkColumn {
  if (!(chunk instanceof ChunkAdapter)) {
    throw new Error("emit: chunk was not created by this prismarine stack");
  }
  return chunk.raw;
}

/**
 * The legal values of one block-state property, in registry order.
 *
 * `minecraft-data` spells out `values` for every enum and every int property
 * but leaves booleans implicit, and the order matters: it is the radix digit
 * order the state id is built from, and Minecraft lists `true` first.
 */
function domainOf(state: RawBlockStateDef): readonly string[] {
  return state.values ?? (state.type === "bool" ? ["true", "false"] : []);
}

function stripNamespace(name: string): string {
  return name.startsWith("minecraft:") ? name.slice("minecraft:".length) : name;
}
