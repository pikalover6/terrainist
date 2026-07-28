/**
 * Region-file timestamp scrubbing.
 *
 * Lives in its own module so both the spike emitter and the terrain emitter
 * can reach it without importing each other.
 */

import { open } from "node:fs/promises";

/** Anvil sector size. */
const SECTOR_BYTES = 4096;
/** The chunk-timestamp table sits in the second 4 KiB sector. */
const TIMESTAMP_SECTOR_OFFSET = SECTOR_BYTES;

/**
 * Zero the region file's chunk-timestamp table.
 *
 * `prismarine-provider-anvil` writes `Math.floor(Date.now() / 1000)` per chunk
 * into the sector at offset 4096. Minecraft only uses these for cache
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
