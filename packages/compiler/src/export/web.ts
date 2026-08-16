/**
 * Web export: a compiled world → a static, browser-loadable voxel payload.
 *
 * This is the data half of the walkable web viewer (`tools/web-viewer/`). It
 * carries no Minecraft assets of any kind — the payload is block *names* and a
 * dense occupancy grid, and the viewer colours them itself. What it does reuse
 * is the real pipeline: the document is compiled exactly as `terrainist
 * compile` compiles it, into a scratch world folder, and the export is read
 * back off that world. Anything the game would render — terrain, fluids,
 * trees, decor, structures, program blocks — is therefore in the export by
 * construction, with no second materializer to drift from the first.
 *
 * The on-disk shape:
 *
 * - `manifest.json` — format version, world name, bounds, spawn, sea level,
 *   the palette (index → block name, index 0 always air) and the chunk index.
 * - `chunks/<x>.<z>.bin.gz` — one 16×16-column chunk, palette-indexed, trimmed
 *   to the y range that chunk actually uses, run-length encoded column by
 *   column, gzipped.
 *
 * Determinism: chunks are visited in (z, x) order, the palette is interned in
 * first-seen order, and nothing timestamps the payload. Same document → same
 * bytes.
 */

import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { WORLD_HEIGHT, WORLD_MIN_Y, listChunks, loadPrismarine } from "../emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../emit/world.js";
import { compileTerrain } from "../terrain/compile.js";
import { formatDiagnostic } from "@terrainist/spec";

/** Payload format tag; bump when the wire shape changes incompatibly. */
export const WEB_EXPORT_FORMAT = "terrainist-web-world/1";

/** Chunk edge, in blocks. Matches Minecraft's, so chunk coords carry over. */
export const WEB_CHUNK_WIDTH = 16;

/** Magic prefix on every chunk file (before gzip). */
const CHUNK_MAGIC = "TWV1";

/**
 * Names that mean "nothing is here". Kept local rather than imported from the
 * renderer: this module sits *below* `@terrainist/render` in the dependency
 * graph, and the list is three entries.
 */
const AIR_NAMES: ReadonlySet<string> = new Set(["air", "cave_air", "void_air"]);

/** Blocks the viewer must not draw even though the game stores them. */
const INVISIBLE_NAMES: ReadonlySet<string> = new Set([
  "barrier",
  "light",
  "structure_void",
  "moving_piston",
]);

/* -------------------------------------------------------------------------- */
/* manifest types                                                              */
/* -------------------------------------------------------------------------- */

export interface WebExportBounds {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export interface WebChunkEntry {
  /** Chunk coordinates (block >> 4). */
  readonly x: number;
  readonly z: number;
  /** Path relative to the manifest. */
  readonly file: string;
  /** Lowest y stored in this chunk. */
  readonly minY: number;
  /** Number of y layers stored. */
  readonly height: number;
  /** Gzipped size on disk, for a loader that wants a progress bar. */
  readonly bytes: number;
}

export interface WebManifest {
  readonly format: typeof WEB_EXPORT_FORMAT;
  readonly name: string;
  readonly minecraftVersion: string;
  readonly chunkWidth: number;
  readonly bytesPerIndex: 1 | 2;
  readonly bounds: WebExportBounds;
  readonly spawn: readonly [number, number, number];
  readonly seaLevel: number;
  /** Palette index → un-namespaced block name; index 0 is always `air`. */
  readonly palette: readonly string[];
  /**
   * Per-palette-entry "fills its whole cell" flag, parallel to `palette`.
   * The viewer culls faces against it; a fence or a torch must not hide the
   * face of the block behind it.
   */
  readonly solid: readonly boolean[];
  readonly chunks: readonly WebChunkEntry[];
}

export interface WebExportOptions {
  /** Directory to fill. Created if absent; existing chunk files are replaced. */
  readonly outDir: string;
  /** Downgrade LOAM-T110 (unstable fluid) to a warning, as `compile` does. */
  readonly allowUnstable?: boolean;
}

export interface WebExportSummary {
  readonly outDir: string;
  readonly manifestPath: string;
  readonly chunkCount: number;
  readonly paletteSize: number;
  readonly bytes: number;
  readonly bounds: WebExportBounds;
  readonly spawn: readonly [number, number, number];
  readonly seaLevel: number;
  readonly name: string;
}

/* -------------------------------------------------------------------------- */
/* run-length coding                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Encode palette indices as `(count, value)` runs.
 *
 * `count` is a u16, so a run longer than 65535 is split; `value` is one or two
 * bytes to match the palette. Little-endian throughout — every browser that
 * can run WebGL is little-endian, and `DataView` reads are explicit anyway.
 */
export function encodeRle(indices: Uint16Array | Uint8Array, bytesPerIndex: 1 | 2): Uint8Array {
  const runs: number[] = [];
  let i = 0;
  while (i < indices.length) {
    const value = indices[i] as number;
    let run = 1;
    while (i + run < indices.length && indices[i + run] === value && run < 0xffff) run++;
    runs.push(run, value);
    i += run;
  }
  const stride = 2 + bytesPerIndex;
  const out = new Uint8Array((runs.length / 2) * stride);
  const view = new DataView(out.buffer);
  for (let r = 0, off = 0; r < runs.length; r += 2, off += stride) {
    view.setUint16(off, runs[r] as number, true);
    if (bytesPerIndex === 1) view.setUint8(off + 2, runs[r + 1] as number);
    else view.setUint16(off + 2, runs[r + 1] as number, true);
  }
  return out;
}

/** Inverse of {@link encodeRle}; `length` is the expected cell count. */
export function decodeRle(
  bytes: Uint8Array,
  bytesPerIndex: 1 | 2,
  length: number,
): Uint16Array {
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

/** One chunk's decoded payload, as {@link decodeChunk} hands it back. */
export interface DecodedChunk {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly minY: number;
  readonly height: number;
  /** Cell order: `((x * 16) + z) * height + (y - minY)`. */
  readonly cells: Uint16Array;
}

/**
 * Serialise one chunk (header + RLE body), *before* gzip.
 *
 * Cells run column-major with y innermost, because that is the axis with the
 * long runs: a column of stone under a column of air is two runs, where a
 * y-major layout would be two runs per layer.
 */
export function encodeChunk(chunk: DecodedChunk, bytesPerIndex: 1 | 2): Uint8Array {
  const body = encodeRle(chunk.cells, bytesPerIndex);
  const out = new Uint8Array(24 + body.byteLength);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = CHUNK_MAGIC.charCodeAt(i);
  view.setUint8(4, bytesPerIndex);
  view.setUint8(5, 0);
  view.setUint16(6, chunk.height, true);
  view.setInt32(8, chunk.chunkX, true);
  view.setInt32(12, chunk.chunkZ, true);
  view.setInt32(16, chunk.minY, true);
  view.setUint32(20, body.byteLength, true);
  out.set(body, 24);
  return out;
}

/** Inverse of {@link encodeChunk}. Throws on a payload it does not recognise. */
export function decodeChunk(bytes: Uint8Array): DecodedChunk {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== CHUNK_MAGIC.charCodeAt(i)) throw new Error("web export: bad chunk magic");
  }
  const bytesPerIndex = view.getUint8(4);
  if (bytesPerIndex !== 1 && bytesPerIndex !== 2) {
    throw new Error(`web export: bad index width ${bytesPerIndex}`);
  }
  const height = view.getUint16(6, true);
  const chunkX = view.getInt32(8, true);
  const chunkZ = view.getInt32(12, true);
  const minY = view.getInt32(16, true);
  const bodyBytes = view.getUint32(20, true);
  const body = bytes.subarray(24, 24 + bodyBytes);
  const cells = decodeRle(body, bytesPerIndex, WEB_CHUNK_WIDTH * WEB_CHUNK_WIDTH * height);
  return { chunkX, chunkZ, minY, height, cells };
}

/* -------------------------------------------------------------------------- */
/* the export                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Compile `doc` and write a web payload into `options.outDir`.
 *
 * The world itself is emitted into a scratch directory and deleted afterwards:
 * the caller asked for a web export, not a save folder, and keeping the world
 * would put an Anvil copy of every export on disk for nothing.
 */
export async function exportWebWorld(
  doc: unknown,
  options: WebExportOptions,
): Promise<WebExportSummary> {
  const outDir = path.resolve(options.outDir);
  const scratch = await mkdtemp(path.join(tmpdir(), "terrainist-web-"));
  const worldDir = path.join(scratch, "world");
  try {
    const result = await compileTerrain(doc, {
      outDir: worldDir,
      allowUnstable: options.allowUnstable ?? false,
    });
    if (!result.ok) {
      const lines = result.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => formatDiagnostic(d))
        .join("\n\n");
      throw new Error(`web export: the document did not compile\n\n${lines}`);
    }
    const { report } = result;
    return await writeWebExport(worldDir, outDir, {
      name: report.name,
      spawn: report.emit.spawn as readonly [number, number, number],
      seaLevel: report.stats.seaLevel,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

interface WorldFacts {
  readonly name: string;
  readonly spawn: readonly [number, number, number];
  readonly seaLevel: number;
}

/**
 * Read an emitted world folder and write the web payload. Split out from
 * {@link exportWebWorld} so tests can point it at a world they already have.
 */
export async function writeWebExport(
  worldDir: string,
  outDir: string,
  facts: WorldFacts,
): Promise<WebExportSummary> {
  const regionDir = path.join(path.resolve(worldDir), "region");
  const chunks = await listChunks(regionDir);
  if (chunks.length === 0) throw new Error(`web export: no chunks in ${regionDir}`);

  const chunkDir = path.join(outDir, "chunks");
  await rm(chunkDir, { recursive: true, force: true });
  await mkdir(chunkDir, { recursive: true });

  const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const anvil = mc.openAnvil(regionDir);

  const palette: string[] = ["air"];
  const solid: boolean[] = [false];
  const paletteIndex = new Map<string, number>([["air", 0]]);
  /** state id → palette index, the hot cache: a full world is millions of reads. */
  const stateCache = new Map<number, number>();

  const scanMaxY = WORLD_MIN_Y + WORLD_HEIGHT - 1;
  const area = WEB_CHUNK_WIDTH * WEB_CHUNK_WIDTH;
  const scratch = new Uint16Array(area * WORLD_HEIGHT);

  const entries: WebChunkEntry[] = [];
  const bodies: { readonly entry: Omit<WebChunkEntry, "bytes">; readonly chunk: DecodedChunk }[] =
    [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  try {
    for (const { chunkX, chunkZ } of chunks) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      scratch.fill(0);
      let chunkMinY = Number.POSITIVE_INFINITY;
      let chunkMaxY = Number.NEGATIVE_INFINITY;

      for (let y = WORLD_MIN_Y; y <= scanMaxY; y++) {
        const layer = y - WORLD_MIN_Y;
        for (let localX = 0; localX < WEB_CHUNK_WIDTH; localX++) {
          for (let localZ = 0; localZ < WEB_CHUNK_WIDTH; localZ++) {
            const stateId = chunk.getBlockStateId(localX, y, localZ);
            if (stateId === 0) continue; // air, the overwhelmingly common case
            let index = stateCache.get(stateId);
            if (index === undefined) {
              const raw = mc.blockNameByStateId(stateId);
              if (raw === undefined || AIR_NAMES.has(raw) || INVISIBLE_NAMES.has(raw)) {
                index = 0;
              } else {
                index = paletteIndex.get(raw) ?? -1;
                if (index === -1) {
                  index = palette.length;
                  palette.push(raw);
                  solid.push(mc.isFullCube(stateId));
                  paletteIndex.set(raw, index);
                }
              }
              stateCache.set(stateId, index);
            }
            if (index === 0) continue;
            scratch[(localX * WEB_CHUNK_WIDTH + localZ) * WORLD_HEIGHT + layer] = index;
            if (y < chunkMinY) chunkMinY = y;
            if (y > chunkMaxY) chunkMaxY = y;
          }
        }
      }
      if (chunkMaxY < chunkMinY) continue; // empty chunk: not in the index at all

      const height = chunkMaxY - chunkMinY + 1;
      const cells = new Uint16Array(area * height);
      const base = chunkMinY - WORLD_MIN_Y;
      for (let column = 0; column < area; column++) {
        for (let k = 0; k < height; k++) {
          cells[column * height + k] = scratch[column * WORLD_HEIGHT + base + k] as number;
        }
      }
      const blockX = chunkX * WEB_CHUNK_WIDTH;
      const blockZ = chunkZ * WEB_CHUNK_WIDTH;
      if (blockX < minX) minX = blockX;
      if (blockZ < minZ) minZ = blockZ;
      if (blockX + WEB_CHUNK_WIDTH - 1 > maxX) maxX = blockX + WEB_CHUNK_WIDTH - 1;
      if (blockZ + WEB_CHUNK_WIDTH - 1 > maxZ) maxZ = blockZ + WEB_CHUNK_WIDTH - 1;
      if (chunkMinY < minY) minY = chunkMinY;
      if (chunkMaxY > maxY) maxY = chunkMaxY;

      bodies.push({
        entry: {
          x: chunkX,
          z: chunkZ,
          file: `chunks/${chunkX}.${chunkZ}.bin.gz`,
          minY: chunkMinY,
          height,
        },
        chunk: { chunkX, chunkZ, minY: chunkMinY, height, cells },
      });
    }
  } finally {
    await anvil.close();
  }

  if (bodies.length === 0) throw new Error(`web export: ${worldDir} has no non-air blocks`);

  // The index width is a property of the finished palette, so the bodies are
  // held until every chunk has been read. They are ~100 KB each at this point.
  const bytesPerIndex: 1 | 2 = palette.length <= 256 ? 1 : 2;
  let bytes = 0;
  for (const { entry, chunk } of bodies) {
    // Node writes gzip with mtime 0, so this is reproducible run to run.
    const gz = gzipSync(Buffer.from(encodeChunk(chunk, bytesPerIndex)), { level: 9 });
    await writeFile(path.join(outDir, entry.file), gz);
    bytes += gz.byteLength;
    entries.push({ ...entry, bytes: gz.byteLength });
  }

  const manifest: WebManifest = {
    format: WEB_EXPORT_FORMAT,
    name: facts.name,
    minecraftVersion: EMIT_MINECRAFT_VERSION,
    chunkWidth: WEB_CHUNK_WIDTH,
    bytesPerIndex,
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
    spawn: facts.spawn,
    seaLevel: facts.seaLevel,
    palette,
    solid,
    chunks: entries,
  };
  const manifestPath = path.join(outDir, "manifest.json");
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, manifestJson);
  bytes += Buffer.byteLength(manifestJson);

  return {
    outDir,
    manifestPath,
    chunkCount: entries.length,
    paletteSize: palette.length,
    bytes,
    bounds: manifest.bounds,
    spawn: facts.spawn,
    seaLevel: facts.seaLevel,
    name: facts.name,
  };
}
