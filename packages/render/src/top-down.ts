/**
 * Top-down orthographic world render (G1).
 *
 * Reads an already-emitted Anvil world back through the compiler's prismarine
 * adapter and paints one pixel block per column: the colour of its highest
 * non-air block, shaded by height so relief reads at a glance. Pure Node, no
 * native dependencies — headless-gl does not build on Apple Silicon / Node 26,
 * so the deepslate/WebGL path is deliberately out of scope here.
 *
 * The output is the deterministic structural-feedback primitive for autonomous
 * loops: same world in, byte-identical PNG out. That means no wall-clock, no
 * unordered iteration, and no floating-point that varies by run.
 */

import path from "node:path";

import {
  EMIT_MINECRAFT_VERSION,
  listChunks,
  loadPrismarine,
} from "@terrainist/compiler";
import type { ChunkPos, EmitColumnTop } from "@terrainist/compiler";
import { PNG } from "pngjs";

import { blockColor, isAir } from "./block-colors.js";

/** Blocks per chunk edge. */
const CHUNK_WIDTH = 16;

/** Default pixels per block. */
export const DEFAULT_SCALE = 4;

/** Height shading range: the lowest surface is dimmed to this, the highest to 1.0. */
const MIN_BRIGHTNESS = 0.6;
const MAX_BRIGHTNESS = 1.0;

/** The world extent a render covers, in block coordinates (inclusive). */
export interface TopDownBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Surface y range actually observed; both 0 when the world has no blocks. */
  readonly minY: number;
  readonly maxY: number;
}

export interface TopDownRender {
  /** Encoded PNG, RGBA. */
  readonly png: Buffer;
  readonly width: number;
  readonly height: number;
  readonly bounds: TopDownBounds;
  /** Pixels per block. */
  readonly scale: number;
  /** Columns that had at least one non-air block (i.e. non-transparent pixels). */
  readonly columnCount: number;
}

export interface TopDownOptions {
  /** Pixels per block; must be a positive integer. Defaults to {@link DEFAULT_SCALE}. */
  readonly scale?: number;
  /** Version the world was emitted at. Defaults to the compiler's emit version. */
  readonly minecraftVersion?: string;
}

/**
 * Render `worldDir` (a folder holding `level.dat` + `region/`) top-down.
 *
 * Coverage is the bounding box of the chunks present on disk, so the image
 * always lands on chunk boundaries. Image +x is world +x; image +y is world +z.
 */
export async function renderTopDown(
  worldDir: string,
  options: TopDownOptions = {},
): Promise<TopDownRender> {
  const scale = options.scale ?? DEFAULT_SCALE;
  if (!Number.isInteger(scale) || scale < 1) {
    throw new Error(`render: scale must be a positive integer, got ${scale}`);
  }

  const regionDir = path.join(path.resolve(worldDir), "region");
  const chunks = await listChunks(regionDir);
  if (chunks.length === 0) {
    throw new Error(`render: no chunks found in ${regionDir}`);
  }

  const extent = chunkExtent(chunks);
  const blocksWide = extent.maxX - extent.minX + 1;
  const blocksTall = extent.maxZ - extent.minZ + 1;

  // Pass 1: read the surface of every column, remembering the y range so the
  // height shading can be normalised over what the world actually contains.
  const surface = new Array<EmitColumnTop | null>(blocksWide * blocksTall).fill(null);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let columnCount = 0;

  const mc = loadPrismarine(options.minecraftVersion ?? EMIT_MINECRAFT_VERSION);
  const anvil = mc.openAnvil(regionDir);
  try {
    for (const { chunkX, chunkZ } of chunks) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      for (let localZ = 0; localZ < CHUNK_WIDTH; localZ++) {
        for (let localX = 0; localX < CHUNK_WIDTH; localX++) {
          const top = chunk.highestBlock(localX, localZ);
          if (top === null || isAir(top.name)) continue;
          const x = chunkX * CHUNK_WIDTH + localX;
          const z = chunkZ * CHUNK_WIDTH + localZ;
          surface[(z - extent.minZ) * blocksWide + (x - extent.minX)] = top;
          if (top.y < minY) minY = top.y;
          if (top.y > maxY) maxY = top.y;
          columnCount++;
        }
      }
    }
  } finally {
    await anvil.close();
  }

  if (columnCount === 0) {
    minY = 0;
    maxY = 0;
  }

  // Pass 2: paint. Every pixel of a block gets the same colour, so scaling is
  // nearest-neighbour by construction and stays exact at any integer scale.
  const width = blocksWide * scale;
  const height = blocksTall * scale;
  const png = new PNG({ width, height });
  const pixels = png.data;
  const span = maxY - minY;

  for (let row = 0; row < blocksTall; row++) {
    for (let column = 0; column < blocksWide; column++) {
      const top = surface[row * blocksWide + column];
      if (top === undefined || top === null) continue; // transparent (fill is already 0)

      const [r, g, b] = blockColor(top.name);
      const brightness =
        span === 0
          ? MAX_BRIGHTNESS
          : MIN_BRIGHTNESS + ((MAX_BRIGHTNESS - MIN_BRIGHTNESS) * (top.y - minY)) / span;
      const shaded: [number, number, number] = [
        shade(r, brightness),
        shade(g, brightness),
        shade(b, brightness),
      ];

      for (let dy = 0; dy < scale; dy++) {
        const rowStart = ((row * scale + dy) * width + column * scale) * 4;
        for (let dx = 0; dx < scale; dx++) {
          const offset = rowStart + dx * 4;
          pixels[offset] = shaded[0];
          pixels[offset + 1] = shaded[1];
          pixels[offset + 2] = shaded[2];
          pixels[offset + 3] = 255;
        }
      }
    }
  }

  return {
    // pngjs writes no tIME chunk and deflates at fixed level/strategy, so the
    // encoding is a pure function of the pixel buffer.
    png: PNG.sync.write(png),
    width,
    height,
    bounds: { ...extent, minY, maxY },
    scale,
    columnCount,
  };
}

/** Block-space bounding box of a set of chunks. */
function chunkExtent(chunks: readonly ChunkPos[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minChunkX = Number.POSITIVE_INFINITY;
  let maxChunkX = Number.NEGATIVE_INFINITY;
  let minChunkZ = Number.POSITIVE_INFINITY;
  let maxChunkZ = Number.NEGATIVE_INFINITY;
  for (const { chunkX, chunkZ } of chunks) {
    if (chunkX < minChunkX) minChunkX = chunkX;
    if (chunkX > maxChunkX) maxChunkX = chunkX;
    if (chunkZ < minChunkZ) minChunkZ = chunkZ;
    if (chunkZ > maxChunkZ) maxChunkZ = chunkZ;
  }
  return {
    minX: minChunkX * CHUNK_WIDTH,
    maxX: maxChunkX * CHUNK_WIDTH + CHUNK_WIDTH - 1,
    minZ: minChunkZ * CHUNK_WIDTH,
    maxZ: maxChunkZ * CHUNK_WIDTH + CHUNK_WIDTH - 1,
  };
}

function shade(channel: number, brightness: number): number {
  const value = Math.round(channel * brightness);
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
