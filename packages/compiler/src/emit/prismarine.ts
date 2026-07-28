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

import type { NbtRoot } from "./nbt.js";

const require = createRequire(import.meta.url);

/* -------------------------------------------------------------------------- */
/* Shapes of the underlying JS libraries (narrowed to what we actually use).   */
/* -------------------------------------------------------------------------- */

interface RawVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface RawBlockDef {
  readonly id: number;
  readonly name: string;
  readonly defaultState: number;
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
  /** Un-namespaced name for a block state id; `undefined` if unknown. */
  blockNameByStateId(stateId: number): string | undefined;
  biomeIdByName(name: string): number | undefined;
  createChunk(): EmitChunk;
  openAnvil(regionDir: string): EmitAnvil;
}

/** Block names that count as "nothing here" when scanning a column. */
const AIR_NAMES = new Set(["air", "cave_air", "void_air"]);

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

  return {
    minecraftVersion: data.version.minecraftVersion,
    dataVersion: data.version.dataVersion,

    blockByName(name: string): EmitBlock | undefined {
      const def = data.blocksByName[stripNamespace(name)];
      return def === undefined
        ? undefined
        : { id: def.id, name: def.name, stateId: def.defaultState };
    },

    blockNameByStateId,

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

function stripNamespace(name: string): string {
  return name.startsWith("minecraft:") ? name.slice("minecraft:".length) : name;
}
