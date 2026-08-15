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

import path from "node:path";

import { parseBlockString } from "./blockstring.js";
import { applyConnectionStates, type ConnectionCandidate } from "./connections.js";
import type { SpikeDocument, SpikeFillOp } from "./document.js";
import { DEFAULT_BIOME } from "./level-dat.js";
import type { EmitBlock, EmitChunk, PrismarineStack } from "./prismarine.js";
import { WORLD_HEIGHT, WORLD_MIN_Y, loadPrismarine } from "./prismarine.js";
import { zeroRegionTimestamps } from "./timestamps.js";
import { writeWorldFiles } from "./write.js";

/** Minecraft version we emit at. Newest the prismarine stack supports. */
export const EMIT_MINECRAFT_VERSION = "1.21.11";

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

  const palette = resolvePalette(doc, mc);
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

  // Connections last, over the finished world — the same pass, for the same
  // reason, as the terrain emitter's. A fence stores its neighbours in its own
  // block state and Minecraft never recomputes that on load, so it has to be
  // right on disk. Without this the physics gate walked worlds the real
  // emitter would never produce and reported `connection.stale` against
  // programs whose fences were fine.
  applyConnectionStates(chunks, parseCandidates(written), mc);

  // --- write -------------------------------------------------------------
  const writeResult = await writeWorldFiles({
    chunks,
    worldDir: path.resolve(outDir),
    levelName: doc.name,
    spawn: doc.spawn,
    stack: mc,
  });

  return {
    worldDir: writeResult.worldDir,
    levelDatPath: writeResult.levelDatPath,
    regionDir: writeResult.regionDir,
    regionFiles: writeResult.regionFiles,
    chunkCount: writeResult.chunkCount,
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

/** Re-exported for the CLI and tests; the implementation lives in `timestamps.ts`. */
export { zeroRegionTimestamps };

/* -------------------------------------------------------------------------- */

interface MutableBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function resolvePalette(doc: SpikeDocument, mc: PrismarineStack): Map<string, EmitBlock> {
  const resolved = new Map<string, EmitBlock>();
  for (const [symbol, blockId] of Object.entries(doc.palette)) {
    const block = resolveBlockString(mc, blockId);
    if (block === undefined) {
      throw new Error(
        `emit: palette symbol "${symbol}" refers to unknown block or state "${blockId}"` +
          registryAbsenceHint(blockId),
      );
    }
    resolved.set(symbol, block);
  }
  return resolved;
}

/**
 * Block names every model knows that the pinned registry spells differently —
 * renames, not hallucinations. Without a hint the E336 text reads as "you
 * invented a block", which sends the authoring repair loop hunting for a
 * spelling mistake that isn't there and burns rounds.
 *
 * Keyed by bare name (no `minecraft:`, no `[...]` state). `chain` is the only
 * entry because it is the only such name: diffing the pinned 1.21.11 block
 * list against 1.21.4 shows exactly one departure, and it is the copper-age
 * rename `chain` → `iron_chain` (the pin also carries the eight
 * `*_copper_chain` variants that arrived with it). The block itself never
 * left; `iron_chain` keeps the same `axis` state, so the old string maps over
 * with its state intact.
 */
const REGISTRY_ABSENCE_HINTS: Readonly<Record<string, string>> = {
  chain:
    "minecraft:chain was RENAMED minecraft:iron_chain in the pinned 1.21.11 " +
    "registry (the copper-age rename; copper_chain variants exist too). " +
    "fix: write minecraft:iron_chain with the same states — " +
    '"minecraft:chain[axis=y]" becomes "minecraft:iron_chain[axis=y]".',
};

/** The hint clause appended to an unknown-block error, or `""` when we have none. */
function registryAbsenceHint(blockId: string): string {
  const bare = blockId.replace(/^minecraft:/, "").replace(/\[.*$/, "");
  const hint = REGISTRY_ABSENCE_HINTS[bare];
  return hint === undefined ? "" : ` — ${hint}`;
}

/**
 * A palette entry may carry blockstate properties —
 * `"minecraft:grass_block[snowy=false]"` — the syntax authored programs use;
 * a bare name resolves to the block's default state.
 */
function resolveBlockString(mc: PrismarineStack, blockId: string): EmitBlock | undefined {
  const parsed = parseBlockString(blockId);
  if (parsed === undefined) return undefined;
  const base = mc.blockByName(parsed.name);
  if (base === undefined) return undefined;
  if (Object.keys(parsed.props).length === 0) return base;
  const stateId = mc.blockStateOf(parsed.name, parsed.props);
  if (stateId === undefined) return undefined;
  return { id: base.id, name: base.name, stateId };
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

/**
 * The written-cell keys back as coordinates, lazily.
 *
 * Every cell the document wrote is a connection candidate. That is a superset
 * of what has to be examined — most of them are stone — but the pass rejects a
 * non-connective state on a cached id lookup, and a generator keeps the whole
 * list from existing twice over for a large document.
 */
function* parseCandidates(written: ReadonlySet<string>): Generator<ConnectionCandidate> {
  for (const key of written) {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    yield { x, y, z };
  }
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
