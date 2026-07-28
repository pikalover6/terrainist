/**
 * Anvil world emit (G1 spike).
 *
 * Expands a `terrainist-spike-0` document's fill ops into chunk columns,
 * writes `region/*.mca` + `level.dat`, and returns a summary.
 *
 * Determinism is a hard requirement: two emits of the same document must be
 * byte-identical. Three wall-clock leaks had to be plugged —
 *   1. `prismarine-provider-anvil` stamps chunk `LastUpdate` from `Date.now()`
 *      (see {@link EmitChunk.freezeLastUpdate});
 *   2. its region writer stamps the 4 KiB timestamp sector at file offset 4096
 *      with `Date.now() / 1000` (zeroed after close, below);
 *   3. `LastPlayed` in level.dat (pinned in `buildLevelDat`).
 * Chunks are also saved in a fixed order, because sector allocation depends on
 * write order.
 */

import { mkdir, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SpikeDocument, SpikeFillOp } from "./document.js";
import { DEFAULT_BIOME, buildLevelDat } from "./level-dat.js";
import type { EmitBlock, EmitChunk } from "./prismarine.js";
import { WORLD_HEIGHT, WORLD_MIN_Y, loadPrismarine, writeGzippedNbt } from "./prismarine.js";

/** Minecraft version we emit at. Newest the prismarine stack supports. */
export const EMIT_MINECRAFT_VERSION = "1.21.11";

/** Anvil region header constants. */
const SECTOR_BYTES = 4096;
const TIMESTAMP_SECTOR_OFFSET = SECTOR_BYTES;

export interface EmitBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface EmitSummary {
  /** Directory holding `level.dat` + `region/` — i.e. the world folder. */
  readonly worldDir: string;
  readonly levelDatPath: string;
  readonly regionDir: string;
  /** Absolute paths of the written `r.<x>.<z>.mca` files, sorted. */
  readonly regionFiles: readonly string[];
  readonly chunkCount: number;
  /** Distinct block positions written (overlapping fills counted once). */
  readonly blockCount: number;
  readonly bounds: EmitBounds;
  readonly spawn: readonly [number, number, number];
  readonly minecraftVersion: string;
  readonly dataVersion: number;
}

export interface EmitOptions {
  /** Override the emit target version. Defaults to {@link EMIT_MINECRAFT_VERSION}. */
  readonly minecraftVersion?: string;
}

/**
 * Compile `doc` into a Minecraft Java world at `outDir`.
 *
 * `outDir` **is** the world folder (it gets `level.dat` and `region/`); the
 * caller decides where that sits, e.g. `out/<doc.name>`.
 */
export async function emitWorld(
  doc: SpikeDocument,
  outDir: string,
  options: EmitOptions = {},
): Promise<EmitSummary> {
  const version = options.minecraftVersion ?? EMIT_MINECRAFT_VERSION;
  const mc = loadPrismarine(version);

  const palette = resolvePalette(doc, mc.blockByName.bind(mc));
  const biomeId = mc.biomeIdByName(DEFAULT_BIOME);
  if (biomeId === undefined) {
    throw new Error(`emit: unknown biome "${DEFAULT_BIOME}" in ${version}`);
  }

  const chunks = new Map<string, EmitChunk>();
  const written = new Set<string>();
  let bounds: MutableBounds | undefined;

  for (const [index, op] of doc.ops.entries()) {
    const region = normalizeFill(op, index);
    bounds = growBounds(bounds, region);

    const block = palette.get(op.block);
    /* c8 ignore next */
    if (block === undefined) throw new Error(`emit: unresolved palette symbol "${op.block}"`);

    for (let y = region.minY; y <= region.maxY; y++) {
      for (let z = region.minZ; z <= region.maxZ; z++) {
        for (let x = region.minX; x <= region.maxX; x++) {
          const chunkX = x >> 4;
          const chunkZ = z >> 4;
          const chunk = getOrCreateChunk(chunks, chunkX, chunkZ, mc.createChunk, biomeId);
          chunk.setBlock(x - chunkX * 16, y, z - chunkZ * 16, block);
          written.add(`${x},${y},${z}`);
        }
      }
    }
  }

  /* c8 ignore next */
  if (bounds === undefined) throw new Error("emit: document produced no blocks");

  // --- write -------------------------------------------------------------
  const worldDir = path.resolve(outDir);
  const regionDir = path.join(worldDir, "region");
  // Start from a clean region directory: prismarine reuses existing sector
  // layouts, which would make output depend on what was there before.
  await rm(regionDir, { recursive: true, force: true });
  await mkdir(regionDir, { recursive: true });

  const anvil = mc.openAnvil(regionDir);
  const regionFiles = new Set<string>();
  for (const key of [...chunks.keys()].sort(compareChunkKeys)) {
    const [chunkX, chunkZ] = parseChunkKey(key);
    const chunk = chunks.get(key);
    /* c8 ignore next */
    if (chunk === undefined) continue;
    await anvil.save(chunkX, chunkZ, chunk);
    regionFiles.add(path.join(regionDir, `r.${chunkX >> 5}.${chunkZ >> 5}.mca`));
  }
  await anvil.close();

  const sortedRegionFiles = [...regionFiles].sort();
  for (const file of sortedRegionFiles) {
    await zeroRegionTimestamps(file);
  }

  const levelDatPath = path.join(worldDir, "level.dat");
  await writeFile(
    levelDatPath,
    writeGzippedNbt(
      buildLevelDat({
        levelName: doc.name,
        spawn: doc.spawn,
        minecraftVersion: mc.minecraftVersion,
        dataVersion: mc.dataVersion,
      }),
    ),
  );

  return {
    worldDir,
    levelDatPath,
    regionDir,
    regionFiles: sortedRegionFiles,
    chunkCount: chunks.size,
    blockCount: written.size,
    bounds: {
      min: [bounds.minX, bounds.minY, bounds.minZ],
      max: [bounds.maxX, bounds.maxY, bounds.maxZ],
    },
    spawn: [doc.spawn.x, doc.spawn.y, doc.spawn.z],
    minecraftVersion: mc.minecraftVersion,
    dataVersion: mc.dataVersion,
  };
}

/**
 * Zero the region file's chunk-timestamp table.
 *
 * `prismarine-provider-anvil` writes `Math.floor(Date.now() / 1000)` per chunk
 * into the 4 KiB sector at offset 4096. Minecraft only uses these for cache
 * invalidation, so zeroing them is safe — and it is the difference between a
 * reproducible build and a nondeterministic one.
 */
export async function zeroRegionTimestamps(regionFile: string): Promise<void> {
  const handle = await open(regionFile, "r+");
  try {
    await handle.write(Buffer.alloc(SECTOR_BYTES), 0, SECTOR_BYTES, TIMESTAMP_SECTOR_OFFSET);
  } finally {
    await handle.close();
  }
}

/* -------------------------------------------------------------------------- */

interface MutableBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function resolvePalette(
  doc: SpikeDocument,
  blockByName: (name: string) => EmitBlock | undefined,
): Map<string, EmitBlock> {
  const resolved = new Map<string, EmitBlock>();
  for (const [symbol, blockId] of Object.entries(doc.palette)) {
    const block = blockByName(blockId);
    if (block === undefined) {
      throw new Error(`emit: palette symbol "${symbol}" refers to unknown block "${blockId}"`);
    }
    resolved.set(symbol, block);
  }
  return resolved;
}

function normalizeFill(op: SpikeFillOp, index: number): MutableBounds {
  const [x1, y1, z1] = op.from;
  const [x2, y2, z2] = op.to;
  const region: MutableBounds = {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    minZ: Math.min(z1, z2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
    maxZ: Math.max(z1, z2),
  };
  if (region.minY < WORLD_MIN_Y || region.maxY >= WORLD_MIN_Y + WORLD_HEIGHT) {
    throw new Error(
      `emit: ops[${index}] spans y ${region.minY}..${region.maxY}, outside the world ` +
        `(${WORLD_MIN_Y}..${WORLD_MIN_Y + WORLD_HEIGHT - 1})`,
    );
  }
  return region;
}

function growBounds(current: MutableBounds | undefined, region: MutableBounds): MutableBounds {
  if (current === undefined) return { ...region };
  return {
    minX: Math.min(current.minX, region.minX),
    minY: Math.min(current.minY, region.minY),
    minZ: Math.min(current.minZ, region.minZ),
    maxX: Math.max(current.maxX, region.maxX),
    maxY: Math.max(current.maxY, region.maxY),
    maxZ: Math.max(current.maxZ, region.maxZ),
  };
}

function getOrCreateChunk(
  chunks: Map<string, EmitChunk>,
  chunkX: number,
  chunkZ: number,
  createChunk: () => EmitChunk,
  biomeId: number,
): EmitChunk {
  const key = `${chunkX},${chunkZ}`;
  let chunk = chunks.get(key);
  if (chunk === undefined) {
    chunk = createChunk();
    chunk.setUniformBiome(biomeId);
    chunks.set(key, chunk);
  }
  return chunk;
}

function parseChunkKey(key: string): [number, number] {
  const [x, z] = key.split(",");
  return [Number(x), Number(z)];
}

function compareChunkKeys(a: string, b: string): number {
  const [ax, az] = parseChunkKey(a);
  const [bx, bz] = parseChunkKey(b);
  return az - bz || ax - bx;
}
