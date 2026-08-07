/**
 * Materialize a column plan into Anvil chunks and write the world.
 *
 * The hot loop here is the whole compiler's cost centre — a 512×512 world is
 * roughly 50 million block writes — so it goes through
 * {@link EmitChunk.fillColumn} and {@link EmitChunk.setStateId}, which reuse a
 * single scratch position and write state ids straight into the section
 * palettes. No `Vec3` is allocated per block and no `prismarine-block` is ever
 * constructed.
 */

import path from "node:path";

import type { BlockEntity } from "../emit/block-entities.js";
import { applyConnectionStates, type ConnectionStats } from "../emit/connections.js";
import type { EmitChunk, PrismarineStack } from "../emit/prismarine.js";
import { WORLD_MIN_Y } from "../emit/prismarine.js";
import { writeWorldFiles } from "../emit/write.js";

import type { ColumnPlan } from "./columns.js";
import {
  DEEPSLATE_BAND_HIGH,
  DEEPSLATE_BAND_LOW,
  FluidKind,
  stoneBandState,
} from "./columns.js";
import type { StructureClip } from "./clip.js";
import type { DecorBlock } from "./decorate.js";
import { emitFloraBlocks, treeBlocks, treeStates, type FloraStateCodec, type TreePlacement } from "./vegetation.js";

/** Vertical resolution of the biome array: one value per 4×4×4 cell. */
const BIOME_CELL = 4;

/** Input to {@link emitTerrain}. */
export interface TerrainEmitInput {
  readonly plan: ColumnPlan;
  readonly trees: readonly TreePlacement[];
  /** Ground cover and water plants, from the decoration pass. */
  readonly decor?: readonly DecorBlock[];
  /**
   * Buildings and road furniture, from the structure pass. Stamped **last**, so
   * a wall always wins over a tuft of grass or a tree that shared its column.
   */
  readonly structures?: readonly DecorBlock[];
  /**
   * Block entities — the sign text and command-block commands that no block
   * state can carry. Stamped after every block list, so the compound always
   * lands on the block the same pass placed, and in list order, which is what
   * keeps the written `block_entities` list deterministic.
   *
   * These are *not* blocks: nothing here places one, and a compound whose
   * block was never placed is a defect (`blockentity.orphan` in the physics
   * lint), not a shortcut.
   */
  readonly blockEntities?: readonly BlockEntity[];
  /**
   * Structure boxes vegetation may not enter. Trees whose crowns overlap a
   * building have already been dropped or accepted upstream (`clip.ts`); this
   * is where the survivors' individual leaf and log voxels are withheld.
   */
  readonly clip?: StructureClip;
  readonly stack: PrismarineStack;
  readonly worldDir: string;
  readonly levelName: string;
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
}

/** What the terrain emit produced. */
export interface TerrainEmitSummary {
  readonly worldDir: string;
  readonly levelDatPath: string;
  readonly regionDir: string;
  readonly regionFiles: readonly string[];
  readonly chunkCount: number;
  /** Every block written, including fluids and vegetation. */
  readonly blockCount: number;
  readonly treeBlockCount: number;
  /** Ground-cover and water-plant blocks written. */
  readonly decorBlockCount: number;
  /** Building and road-furniture blocks written. */
  readonly structureBlockCount: number;
  /** Block-entity compounds stamped into chunks. */
  readonly blockEntityCount: number;
  readonly minecraftVersion: string;
  readonly dataVersion: number;
  readonly spawn: readonly [number, number, number];
  /** What the connection-state pass examined and rewrote. */
  readonly connections: ConnectionStats;
}

/** Materialize and write. */
export async function emitTerrain(input: TerrainEmitInput): Promise<TerrainEmitSummary> {
  const { plan, stack } = input;
  const { region } = plan;

  const treesByChunk = bucketTrees(input.trees, stack, input.clip);
  const decorByChunk = bucketDecor(input.decor ?? []);
  const structureByChunk = bucketDecor(input.structures ?? []);
  const blockEntityByChunk = bucketBlockEntities(input.blockEntities ?? []);
  const chunks = new Map<string, EmitChunk>();

  const chunkX0 = region.x0 >> 4;
  const chunkX1 = (region.x0 + region.width - 1) >> 4;
  const chunkZ0 = region.z0 >> 4;
  const chunkZ1 = (region.z0 + region.depth - 1) >> 4;

  let blockCount = 0;
  let treeBlockCount = 0;
  let decorBlockCount = 0;
  let structureBlockCount = 0;
  let blockEntityCount = 0;

  for (let cz = chunkZ0; cz <= chunkZ1; cz++) {
    for (let cx = chunkX0; cx <= chunkX1; cx++) {
      const chunk = stack.createChunk();
      blockCount += fillChunk(chunk, plan, cx, cz);
      paintBiomes(chunk, plan, cx, cz);
      // Ground cover goes down before the trees, so a trunk always wins over a
      // tuft of grass that happened to land on the same column.
      const decor = decorByChunk.get(`${cx},${cz}`);
      if (decor !== undefined) decorBlockCount += stampBlocks(chunk, decor, cx, cz);
      const trees = treesByChunk.get(`${cx},${cz}`);
      if (trees !== undefined) treeBlockCount += stampBlocks(chunk, trees, cx, cz);
      const structures = structureByChunk.get(`${cx},${cz}`);
      if (structures !== undefined) structureBlockCount += stampBlocks(chunk, structures, cx, cz);
      // Last of all, and touching no block: the compounds that carry a sign's
      // text and a command block's command.
      const entities = blockEntityByChunk.get(`${cx},${cz}`);
      if (entities !== undefined) blockEntityCount += stampBlockEntities(chunk, entities);
      chunks.set(`${cx},${cz}`, chunk);
    }
  }

  // Connections last, over the finished world. Fences, panes, walls and bars
  // store their neighbours in their own block state and Minecraft never
  // recomputes that on load, so it has to be right on disk — and it can only
  // be computed once every block exists.
  //
  // The surface layer is a candidate too, and the comment that used to stand
  // here said otherwise: "terrain columns hold no connective block". That is
  // true of terrain the heightfield wrote and false of terrain a *ground
  // treatment* wrote. A palette is free to point a paving symbol at a wall —
  // `plaza.border` → `minecraft:stone_brick_wall` is a reasonable thing for an
  // author to write, and `grounds.ts` duly lays it into `plan.surface`. Fed
  // only the non-terrain writes, this pass never saw those columns, and they
  // kept the default "connected to nothing" state: 604 `connection.stale`
  // findings on one generated world, every one of them a wall laid as ground.
  //
  // A connection is a property of a neighbourhood, not of which pass wrote the
  // block, so the whole surface layer goes in. `applyConnectionStates` rejects
  // a non-connective state on a cached id lookup, so the added cost is one map
  // probe per column.
  const connections = applyConnectionStates(
    chunks,
    [...(input.decor ?? []), ...(input.structures ?? []), ...surfaceCandidates(plan)],
    stack,
  );

  const written = await writeWorldFiles({
    chunks,
    worldDir: path.resolve(input.worldDir),
    levelName: input.levelName,
    spawn: input.spawn,
    stack,
  });

  return {
    worldDir: written.worldDir,
    levelDatPath: written.levelDatPath,
    regionDir: written.regionDir,
    regionFiles: written.regionFiles,
    chunkCount: written.chunkCount,
    blockCount: blockCount + treeBlockCount + decorBlockCount + structureBlockCount,
    treeBlockCount,
    decorBlockCount,
    structureBlockCount,
    blockEntityCount,
    minecraftVersion: stack.minecraftVersion,
    dataVersion: stack.dataVersion,
    spawn: [input.spawn.x, input.spawn.y, input.spawn.z],
    connections,
  };
}

/** Write every column of one chunk; returns the block count written. */
function fillChunk(chunk: EmitChunk, plan: ColumnPlan, cx: number, cz: number): number {
  const { region, ground, fluidTop, fluidKind, surface, subsurface, soil, snow, states } = plan;
  const baseX = cx * 16;
  const baseZ = cz * 16;
  let count = 0;

  for (let lz = 0; lz < 16; lz++) {
    const z = baseZ + lz;
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let lx = 0; lx < 16; lx++) {
      const x = baseX + lx;
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const idx = j * region.width + i;

      const top = ground[idx] as number;
      const soilDepth = soil[idx] as number;
      const soilBase = top - soilDepth;

      chunk.setStateId(lx, WORLD_MIN_Y, lz, states.bedrock);
      count += 1;

      if (soilBase > WORLD_MIN_Y + 1) {
        count += fillStoneBody(chunk, plan, lx, lz, x, z, WORLD_MIN_Y + 1, soilBase - 1);
      }
      if (soilDepth > 0 && top - 1 >= soilBase) {
        chunk.fillColumn(lx, lz, soilBase, top - 1, subsurface[idx] as number);
        count += top - soilBase;
      }
      chunk.setStateId(lx, top, lz, surface[idx] as number);
      count += 1;

      const kind = fluidKind[idx];
      if (kind !== FluidKind.NONE) {
        const fluidState = kind === FluidKind.LAVA ? states.lava : states.water;
        const surfaceY = fluidTop[idx] as number;
        if (surfaceY > top) {
          chunk.fillColumn(lx, lz, top + 1, surfaceY, fluidState);
          count += surfaceY - top;
        }
      } else if (snow[idx] === 1 && top + 1 <= 319) {
        chunk.setStateId(lx, top + 1, lz, states.snowLayer);
        count += 1;
      }

      // Caves last, over the finished column: the stone body was written as
      // bulk fills, and punching the interior spans out of it afterwards costs
      // one pass over the carved blocks instead of splitting every column's
      // fill into runs. `cave_air`, not `air` — Minecraft treats the two
      // differently for light and spawning, and the readback lint uses the
      // distinction to tell a carved gallery from the sky above the terrain.
      count -= punchCaves(chunk, plan, idx, lx, lz);
    }
  }
  return count;
}

/**
 * Replace one column's cave spans with `cave_air`.
 *
 * Returns the number of solid blocks removed, so the caller can keep its block
 * count honest — a carved world writes *fewer* blocks than its heightfield
 * implies, and a count that ignored that would drift from what is on disk.
 */
function punchCaves(
  chunk: EmitChunk,
  plan: ColumnPlan,
  idx: number,
  lx: number,
  lz: number,
): number {
  const caves = plan.caves;
  if (caves === undefined) return 0;
  const end = caves.spans.offsets[idx + 1] as number;
  let removed = 0;
  for (let k = caves.spans.offsets[idx] as number; k < end; k++) {
    const lo = caves.spans.lo[k] as number;
    const hi = caves.spans.hi[k] as number;
    chunk.fillColumn(lx, lz, lo, hi, plan.states.caveAir);
    removed += hi - lo + 1;
  }
  return removed;
}

/**
 * Fill one column's stone body, y-banded.
 *
 * Deepslate below the blend band, stone above it, and inside the band a
 * position-hashed coin flip whose bias walks from all-deepslate to all-stone —
 * so the two rocks interleave over a dozen blocks instead of meeting on a
 * perfectly flat y=0 plane. The two solid runs are still bulk fills; only the
 * band costs a hash per block.
 */
function fillStoneBody(
  chunk: EmitChunk,
  plan: ColumnPlan,
  lx: number,
  lz: number,
  x: number,
  z: number,
  y0: number,
  y1: number,
): number {
  const { states, stoneSeed } = plan;
  const deepTop = Math.min(y1, DEEPSLATE_BAND_LOW);
  if (deepTop >= y0) chunk.fillColumn(lx, lz, y0, deepTop, states.deepslate);
  const bandLo = Math.max(y0, DEEPSLATE_BAND_LOW + 1);
  const bandHi = Math.min(y1, DEEPSLATE_BAND_HIGH - 1);
  for (let y = bandLo; y <= bandHi; y++) {
    chunk.setStateId(lx, y, lz, stoneBandState(states, stoneSeed, x, y, z));
  }
  const stoneLo = Math.max(y0, DEEPSLATE_BAND_HIGH);
  if (y1 >= stoneLo) chunk.fillColumn(lx, lz, stoneLo, y1, states.stone);
  return y1 - y0 + 1;
}

/**
 * Write the chunk's biome array at 4×4×4 resolution.
 *
 * Terrain biomes are a surface property, so each horizontal cell is painted
 * uniformly down the whole column — but *per cell*, which is the point: the
 * G1 emitter could only give a chunk one biome, so a beach and the ocean it
 * meets had to share one.
 */
function paintBiomes(chunk: EmitChunk, plan: ColumnPlan, cx: number, cz: number): void {
  const { region, biome } = plan;
  const baseX = cx * 16;
  const baseZ = cz * 16;
  const top = WORLD_MIN_Y + 384;

  for (let cellZ = 0; cellZ < 4; cellZ++) {
    for (let cellX = 0; cellX < 4; cellX++) {
      // Sample the cell's centre column, clamped into the region.
      const x = clampTo(baseX + cellX * BIOME_CELL + 1, region.x0, region.x0 + region.width - 1);
      const z = clampTo(baseZ + cellZ * BIOME_CELL + 1, region.z0, region.z0 + region.depth - 1);
      const id = biome[(z - region.z0) * region.width + (x - region.x0)] as number;
      const lx = cellX * BIOME_CELL;
      const lz = cellZ * BIOME_CELL;
      for (let y = WORLD_MIN_Y; y < top; y += BIOME_CELL) {
        chunk.setBiomeAt(lx, y, lz, id);
      }
    }
  }
}

/** Stamp absolute-positioned blocks that fall inside one chunk. */
function stampBlocks(
  chunk: EmitChunk,
  blocks: readonly PlacedBlock[],
  cx: number,
  cz: number,
): number {
  const baseX = cx * 16;
  const baseZ = cz * 16;
  let count = 0;
  for (const ref of blocks) {
    chunk.setStateId(ref.x - baseX, ref.y, ref.z - baseZ, ref.stateId);
    count++;
  }
  return count;
}

/**
 * Attach one chunk's block entities.
 *
 * Coordinates stay absolute: unlike every block write in this file, the adapter
 * wants the world position, because that is what the compound itself stores.
 */
function stampBlockEntities(chunk: EmitChunk, entities: readonly BlockEntity[]): number {
  for (const entity of entities) {
    chunk.setBlockEntityNbt(entity.x, entity.y, entity.z, {
      ...entity.data,
      id: { type: "string", value: entity.id },
    });
  }
  return entities.length;
}

/** Bucket block entities by chunk, preserving their deterministic order. */
function bucketBlockEntities(entities: readonly BlockEntity[]): Map<string, BlockEntity[]> {
  const out = new Map<string, BlockEntity[]>();
  for (const entity of entities) {
    if (entity.y < WORLD_MIN_Y || entity.y > 319) continue;
    const key = `${entity.x >> 4},${entity.z >> 4}`;
    let bucket = out.get(key);
    if (bucket === undefined) {
      bucket = [];
      out.set(key, bucket);
    }
    bucket.push(entity);
  }
  return out;
}

/** One block, resolved to absolute coordinates and a state id. */
interface PlacedBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly stateId: number;
}

/** Bucket decoration blocks by chunk, preserving their deterministic order. */
function bucketDecor(decor: readonly DecorBlock[]): Map<string, PlacedBlock[]> {
  const out = new Map<string, PlacedBlock[]>();
  for (const block of decor) {
    if (block.y < WORLD_MIN_Y || block.y > 319) continue;
    const key = `${block.x >> 4},${block.z >> 4}`;
    let bucket = out.get(key);
    if (bucket === undefined) {
      bucket = [];
      out.set(key, bucket);
    }
    bucket.push(block);
  }
  return out;
}

/**
 * Expand every tree into absolute blocks, bucketed by chunk.
 *
 * Bucketing (rather than walking the tree list once per chunk) keeps the pass
 * linear in the number of tree blocks, and the deterministic iteration order
 * of the placement list carries through: two trees whose canopies could touch
 * cannot, because the scatter's occupancy mask already forbade it.
 */
function bucketTrees(
  trees: readonly TreePlacement[],
  codec: FloraStateCodec,
  clip?: StructureClip,
): Map<string, PlacedBlock[]> {
  const out = new Map<string, PlacedBlock[]>();
  for (const tree of trees) {
    // The parts → blockstate mapping (§3.2). Under `LEAF_STATE_POLICY =
    // "legacy"` and for a plant that emits only `log` and `leaves` — which is
    // every tree of every document that declares no `strata` — this is
    // byte-identical to the one-line mapping it replaces, and the byte-identity
    // gate on the six control worlds is the proof.
    const emission = emitFloraBlocks(treeBlocks(tree), treeStates(tree), codec);
    for (const block of emission.blocks) {
      const x = tree.x + block.dx;
      const y = tree.baseY + block.dy;
      const z = tree.z + block.dz;
      if (y < WORLD_MIN_Y || y > 319) continue;
      if (clip !== undefined && clip.blocked(x, y, z)) continue;
      const key = `${x >> 4},${z >> 4}`;
      let bucket = out.get(key);
      if (bucket === undefined) {
        bucket = [];
        out.set(key, bucket);
      }
      bucket.push({ x, y, z, stateId: block.stateId });
    }
  }
  return out;
}

function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Every surface column, as a connection candidate.
 *
 * Lazily, because the list is region-sized and is consumed once. The y is the
 * surface course itself — `plan.ground[idx]` is the top solid block, which is
 * exactly where a ground treatment laid its paving.
 */
function* surfaceCandidates(plan: ColumnPlan): Generator<{ x: number; y: number; z: number }> {
  const { region } = plan;
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      yield { x: region.x0 + i, y: plan.ground[idx] as number, z: region.z0 + j };
    }
  }
}
