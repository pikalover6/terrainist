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
import type { DecorBlock } from "./decorate.js";
import { TREE_TEMPLATES, type TreePlacement } from "./vegetation.js";

/** Vertical resolution of the biome array: one value per 4×4×4 cell. */
const BIOME_CELL = 4;

/** Input to {@link emitTerrain}. */
export interface TerrainEmitInput {
  readonly plan: ColumnPlan;
  readonly trees: readonly TreePlacement[];
  /** Ground cover and water plants, from the decoration pass. */
  readonly decor?: readonly DecorBlock[];
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
  readonly minecraftVersion: string;
  readonly dataVersion: number;
  readonly spawn: readonly [number, number, number];
}

/** Materialize and write. */
export async function emitTerrain(input: TerrainEmitInput): Promise<TerrainEmitSummary> {
  const { plan, stack } = input;
  const { region } = plan;

  const treesByChunk = bucketTrees(input.trees);
  const decorByChunk = bucketDecor(input.decor ?? []);
  const chunks = new Map<string, EmitChunk>();

  const chunkX0 = region.x0 >> 4;
  const chunkX1 = (region.x0 + region.width - 1) >> 4;
  const chunkZ0 = region.z0 >> 4;
  const chunkZ1 = (region.z0 + region.depth - 1) >> 4;

  let blockCount = 0;
  let treeBlockCount = 0;
  let decorBlockCount = 0;

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
      chunks.set(`${cx},${cz}`, chunk);
    }
  }

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
    blockCount: blockCount + treeBlockCount + decorBlockCount,
    treeBlockCount,
    decorBlockCount,
    minecraftVersion: stack.minecraftVersion,
    dataVersion: stack.dataVersion,
    spawn: [input.spawn.x, input.spawn.y, input.spawn.z],
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
    }
  }
  return count;
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
function bucketTrees(trees: readonly TreePlacement[]): Map<string, PlacedBlock[]> {
  const out = new Map<string, PlacedBlock[]>();
  for (const tree of trees) {
    const template = TREE_TEMPLATES[tree.shape];
    for (const block of template.blocks({
      height: tree.height,
      radiusDelta: tree.radiusDelta,
      mega: tree.mega,
    })) {
      const x = tree.x + block.dx;
      const y = tree.baseY + block.dy;
      const z = tree.z + block.dz;
      if (y < WORLD_MIN_Y || y > 319) continue;
      const key = `${x >> 4},${z >> 4}`;
      let bucket = out.get(key);
      if (bucket === undefined) {
        bucket = [];
        out.set(key, bucket);
      }
      bucket.push({
        x,
        y,
        z,
        stateId: block.part === "log" ? tree.trunkState : tree.leafState,
      });
    }
  }
  return out;
}

function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
