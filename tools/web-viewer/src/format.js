/**
 * The wire format of a `terrainist export-web` payload, decoded.
 *
 * The mirror image of `packages/compiler/src/export/web.ts`. Kept as a plain
 * ES module with no browser dependencies so node can unit-test it and the page
 * can `import` it unbundled.
 */

const CHUNK_MAGIC = "TWV1";

/** Cell count of one chunk body: 16x16 columns of `height` layers. */
export const CHUNK_WIDTH = 16;

/**
 * Expand `(count, value)` runs back into palette indices.
 *
 * `length` is passed rather than inferred: it is known from the header, and a
 * truncated payload should produce a short world rather than a wrong-sized
 * array the mesher then walks off the end of.
 */
export function decodeRle(bytes, bytesPerIndex, length) {
  const out = new Uint16Array(length);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stride = 2 + bytesPerIndex;
  let at = 0;
  for (let off = 0; off + stride <= bytes.byteLength; off += stride) {
    const count = view.getUint16(off, true);
    const value = bytesPerIndex === 1 ? view.getUint8(off + 2) : view.getUint16(off + 2, true);
    for (let k = 0; k < count && at < length; k++) out[at++] = value;
  }
  return out;
}

/** Decode one chunk file (already gunzipped) into its header plus cells. */
export function decodeChunk(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== CHUNK_MAGIC.charCodeAt(i)) throw new Error("viewer: bad chunk magic");
  }
  const bytesPerIndex = view.getUint8(4);
  if (bytesPerIndex !== 1 && bytesPerIndex !== 2) {
    throw new Error(`viewer: bad index width ${bytesPerIndex}`);
  }
  const height = view.getUint16(6, true);
  const chunkX = view.getInt32(8, true);
  const chunkZ = view.getInt32(12, true);
  const minY = view.getInt32(16, true);
  const bodyBytes = view.getUint32(20, true);
  const body = bytes.subarray(24, 24 + bodyBytes);
  const cells = decodeRle(body, bytesPerIndex, CHUNK_WIDTH * CHUNK_WIDTH * height);
  return { chunkX, chunkZ, minY, height, cells };
}

/** Index of a cell inside a decoded chunk: column-major, y innermost. */
export function cellOffset(localX, localZ, layer, height) {
  return (localX * CHUNK_WIDTH + localZ) * height + layer;
}

/**
 * The loaded world: chunks by key, plus the palette-derived lookups the mesher
 * reads. Chunks arrive as they stream in; a block in an absent chunk is air,
 * which is exactly what a viewer at the edge of the loaded set should see.
 */
export class WorldView {
  constructor(manifest) {
    this.manifest = manifest;
    this.chunks = new Map();
    // The mesher reads a chunk's neighbourhood in scan order, so consecutive
    // lookups are nearly always in the same chunk. Remembering the last one
    // turns ~75,000 string-key map lookups per chunk into a pair of integer
    // comparisons, which on the hero world is most of what `indexAt` costs.
    this.recent = undefined;
  }

  static key(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`;
  }

  put(chunk) {
    this.chunks.set(WorldView.key(chunk.chunkX, chunk.chunkZ), chunk);
    this.recent = chunk;
  }

  drop(chunkX, chunkZ) {
    this.chunks.delete(WorldView.key(chunkX, chunkZ));
    if (this.recent !== undefined && this.recent.chunkX === chunkX && this.recent.chunkZ === chunkZ) {
      this.recent = undefined;
    }
  }

  has(chunkX, chunkZ) {
    return this.chunks.has(WorldView.key(chunkX, chunkZ));
  }

  /** Palette index at world coordinates; 0 (air) outside anything loaded. */
  indexAt(x, y, z) {
    // `>> 4` is `Math.floor(v / 16)` for anything in world range, and it is
    // the difference between an integer op and a float division per sample.
    const chunkX = x >> 4;
    const chunkZ = z >> 4;
    let chunk = this.recent;
    if (chunk === undefined || chunk.chunkX !== chunkX || chunk.chunkZ !== chunkZ) {
      chunk = this.chunks.get(WorldView.key(chunkX, chunkZ));
      if (chunk === undefined) return 0;
      this.recent = chunk;
    }
    const layer = y - chunk.minY;
    if (layer < 0 || layer >= chunk.height) return 0;
    const localX = x - chunkX * CHUNK_WIDTH;
    const localZ = z - chunkZ * CHUNK_WIDTH;
    return chunk.cells[cellOffset(localX, localZ, layer, chunk.height)];
  }
}
