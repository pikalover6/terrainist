/**
 * The shared Anvil write-out step.
 *
 * Extracted from {@link emitWorld} so the G1 spike path and the terrain
 * pipeline write worlds through *exactly* the same code — including the three
 * wall-clock leaks that had to be plugged for byte-identical output (chunk
 * `LastUpdate`, the region timestamp sector, and `LastPlayed`).
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildLevelDat } from "./level-dat.js";
import type { EmitChunk, PrismarineStack } from "./prismarine.js";
import { writeGzippedNbt } from "./prismarine.js";
import { zeroRegionTimestamps } from "./timestamps.js";

/** Where the player spawns. */
export interface WriteSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Input to {@link writeWorldFiles}. */
export interface WriteWorldInput {
  /** Chunk columns keyed `"<chunkX>,<chunkZ>"`. */
  readonly chunks: ReadonlyMap<string, EmitChunk>;
  readonly worldDir: string;
  readonly levelName: string;
  readonly spawn: WriteSpawn;
  readonly stack: PrismarineStack;
  /** Game-rule overrides for `level.dat`; see {@link LevelDatOptions.gameRules}. */
  readonly gameRules?: Readonly<Record<string, boolean | number>>;
  /**
   * Default game mode for `level.dat`; creative (1) when omitted.
   *
   * Only the Terrarium sets it — it opens in spectator (3), because a reviewer
   * is looking rather than building. See {@link LevelDatOptions.gameType}.
   */
  readonly gameType?: number;
}

/** What the write step produced. */
export interface WriteWorldResult {
  readonly worldDir: string;
  readonly levelDatPath: string;
  readonly regionDir: string;
  readonly regionFiles: readonly string[];
  readonly chunkCount: number;
}

/**
 * Write `level.dat` and every region file, deterministically.
 *
 * Chunks are saved in a fixed (z, x) order because prismarine's sector
 * allocation depends on write order, and the region timestamp sector is zeroed
 * afterwards because the provider stamps it from the wall clock.
 */
export async function writeWorldFiles(input: WriteWorldInput): Promise<WriteWorldResult> {
  const worldDir = path.resolve(input.worldDir);
  const regionDir = path.join(worldDir, "region");
  // Start from a clean region directory: prismarine reuses existing sector
  // layouts, which would make output depend on what was there before.
  await rm(regionDir, { recursive: true, force: true });
  await mkdir(regionDir, { recursive: true });

  const anvil = input.stack.openAnvil(regionDir);
  const regionFiles = new Set<string>();
  for (const key of [...input.chunks.keys()].sort(compareChunkKeys)) {
    const [chunkX, chunkZ] = parseChunkKey(key);
    const chunk = input.chunks.get(key);
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
        levelName: input.levelName,
        spawn: input.spawn,
        minecraftVersion: input.stack.minecraftVersion,
        dataVersion: input.stack.dataVersion,
        ...(input.gameRules === undefined ? {} : { gameRules: input.gameRules }),
        ...(input.gameType === undefined ? {} : { gameType: input.gameType }),
      }),
    ),
  );

  return {
    worldDir,
    levelDatPath,
    regionDir,
    regionFiles: sortedRegionFiles,
    chunkCount: input.chunks.size,
  };
}

/** Parse a `"<x>,<z>"` chunk key. */
export function parseChunkKey(key: string): [number, number] {
  const [x, z] = key.split(",");
  return [Number(x), Number(z)];
}

/** Sort chunk keys by (z, x) — the write order determinism depends on. */
export function compareChunkKeys(a: string, b: string): number {
  const [ax, az] = parseChunkKey(a);
  const [bx, bz] = parseChunkKey(b);
  return az - bz || ax - bx;
}
