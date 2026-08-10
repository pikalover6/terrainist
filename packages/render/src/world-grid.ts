/**
 * Bridge: emitted Anvil world → {@link VoxelGrid}.
 *
 * The vendored voxel renderer reads a dense `VoxelGrid` rather than a world, so
 * this is the only place that knows about region files. It reads through the
 * compiler's prismarine adapter on the cheap state-id path (no
 * `prismarine-block` per voxel) and keeps a state-id → name cache, because a
 * full-height scan of a 16-chunk world is ~1.5M lookups.
 */

import path from "node:path";

import {
  EMIT_MINECRAFT_VERSION,
  WORLD_HEIGHT,
  WORLD_MIN_Y,
  listChunks,
  loadPrismarine,
} from "@terrainist/compiler";

import { biomeNamesById } from "./biome-registry.js";
import { VoxelGrid } from "./voxel/grid.js";
import { isRenderAir } from "./voxel/palette.js";

/** Blocks per chunk edge. */
const CHUNK_WIDTH = 16;

export interface WorldToGridOptions {
  /** Version the world was emitted at. Defaults to the compiler's emit version. */
  readonly minecraftVersion?: string;
  /** Lowest y to read. Defaults to the world floor. */
  readonly minY?: number;
  /** Highest y to read. Defaults to the world ceiling. */
  readonly maxY?: number;
  /** Record each column's biome so renderers can tint (default true). */
  readonly biomes?: boolean;
}

/**
 * Load `worldDir` (a folder holding `level.dat` + `region/`) into a grid whose
 * bounds are the tight bounding box of its non-air blocks.
 *
 * Throws when the world has no chunks, or no non-air blocks in range — a
 * `VoxelGrid` cannot represent an empty region and every renderer downstream
 * would divide by zero on it.
 */
export async function worldToGrid(
  worldDir: string,
  options: WorldToGridOptions = {},
): Promise<VoxelGrid> {
  const scanMinY = Math.max(options.minY ?? WORLD_MIN_Y, WORLD_MIN_Y);
  const scanMaxY = Math.min(options.maxY ?? WORLD_MIN_Y + WORLD_HEIGHT - 1, WORLD_MIN_Y + WORLD_HEIGHT - 1);

  const regionDir = path.join(path.resolve(worldDir), "region");
  const chunks = await listChunks(regionDir);
  if (chunks.length === 0) {
    throw new Error(`render: no chunks found in ${regionDir}`);
  }

  const version = options.minecraftVersion ?? EMIT_MINECRAFT_VERSION;
  const withBiomes = options.biomes ?? true;
  const biomeNames = withBiomes ? biomeNamesById(version) : undefined;
  const mc = loadPrismarine(version);
  const anvil = mc.openAnvil(regionDir);

  // Buffer the non-air voxels: a VoxelGrid needs its bounds up front, and
  // re-reading every chunk a second time costs more than holding them.
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const names: string[] = [];
  /** Packed (x, z) → biome name, sampled at each column's surface. */
  const columnBiomes = new Map<number, string>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  /** state id → namespaced name, or "" for anything that renders as air. */
  const nameCache = new Map<number, string>();
  const resolve = (stateId: number): string => {
    const cached = nameCache.get(stateId);
    if (cached !== undefined) return cached;
    const name = mc.blockNameByStateId(stateId);
    const resolved = name === undefined || isRenderAir(name) ? "" : `minecraft:${name}`;
    nameCache.set(stateId, resolved);
    return resolved;
  };

  try {
    for (const { chunkX, chunkZ } of chunks) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      const baseX = chunkX * CHUNK_WIDTH;
      const baseZ = chunkZ * CHUNK_WIDTH;
      if (biomeNames !== undefined) {
        // One sample per column, taken at the surface — that is the biome the
        // client tints the visible blocks by, and it costs 256 lookups per
        // chunk instead of one per voxel.
        for (let localZ = 0; localZ < CHUNK_WIDTH; localZ++) {
          for (let localX = 0; localX < CHUNK_WIDTH; localX++) {
            const top = chunk.highestBlock(localX, localZ);
            if (top === null) continue;
            const biome = biomeNames.get(chunk.getBiomeId(localX, top.y, localZ));
            if (biome !== undefined) {
              columnBiomes.set((baseX + localX) * 0x2000000 + (baseZ + localZ), biome);
            }
          }
        }
      }
      for (let y = scanMinY; y <= scanMaxY; y++) {
        for (let localZ = 0; localZ < CHUNK_WIDTH; localZ++) {
          for (let localX = 0; localX < CHUNK_WIDTH; localX++) {
            const stateId = chunk.getBlockStateId(localX, y, localZ);
            if (stateId === 0) continue; // air, the overwhelmingly common case
            const name = resolve(stateId);
            if (name === "") continue;
            const x = baseX + localX;
            const z = baseZ + localZ;
            xs.push(x);
            ys.push(y);
            zs.push(z);
            names.push(name);
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;
          }
        }
      }
    }
  } finally {
    await anvil.close();
  }

  if (names.length === 0) {
    throw new Error(`render: ${worldDir} has no non-air blocks in y ${scanMinY}..${scanMaxY}`);
  }

  const grid = new VoxelGrid({ minX, minY, minZ, maxX, maxY, maxZ });
  for (let i = 0; i < names.length; i++) {
    const x = xs[i] as number;
    const z = zs[i] as number;
    const biome = columnBiomes.get(x * 0x2000000 + z);
    if (biome !== undefined) grid.setColumnBiome(x, z, biome);
  }
  for (let i = 0; i < names.length; i++) {
    grid.set(xs[i] as number, ys[i] as number, zs[i] as number, names[i] as string);
  }
  return grid;
}
