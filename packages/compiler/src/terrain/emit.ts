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
import { FluidKind } from "./columns.js";
import { TREE_TEMPLATES, type TreePlacement } from "./vegetation.js";

/** Vertical resolution of the biome array: one value per 4×4×4 cell. */
const BIOME_CELL = 4;

/** Input to {@link emitTerrain}. */
export interface TerrainEmitInput {
  readonly plan: ColumnPlan;
  readonly trees: readonly TreePlacement[];
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
  readonly minecraftVersion: string;
  readonly dataVersion: number;
  readonly spawn: readonly [number, number, number];
}

/** Materialize and write. */
export async function emitTerrain(input: TerrainEmitInput): Promise<TerrainEmitSummary> {
  const { plan, stack } = input;
  const { region } = plan;

  const treesByChunk = bucketTrees(input.trees);
  const chunks = new Map<string, EmitChunk>();

  const chunkX0 = region.x0 >> 4;
  const chunkX1 = (region.x0 + region.width - 1) >> 4;
  const chunkZ0 = region.z0 >> 4;
  const chunkZ1 = (region.z0 + region.depth - 1) >> 4;

  let blockCount = 0;
  let treeBlockCount = 0;

  for (let cz = chunkZ0; cz <= chunkZ1; cz++) {
    for (let cx = chunkX0; cx <= chunkX1; cx++) {
      const chunk = stack.createChunk();
      blockCount += fillChunk(chunk, plan, cx, cz);
      paintBiomes(chunk, plan, cx, cz);
      const trees = treesByChunk.get(`${cx},${cz}`);
      if (trees !== undefined) treeBlockCount += stampTrees(chunk, trees, cx, cz);
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
    blockCount: blockCount + treeBlockCount,
    treeBlockCount,
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
        chunk.fillColumn(lx, lz, WORLD_MIN_Y + 1, soilBase - 1, states.stone);
        count += soilBase - 1 - WORLD_MIN_Y;
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

/** Stamp the tree blocks that fall inside one chunk. */
function stampTrees(chunk: EmitChunk, trees: readonly TreeBlockRef[], cx: number, cz: number): number {
  const baseX = cx * 16;
  const baseZ = cz * 16;
  let count = 0;
  for (const ref of trees) {
    chunk.setStateId(ref.x - baseX, ref.y, ref.z - baseZ, ref.stateId);
    count++;
  }
  return count;
}

/** One tree block, resolved to absolute coordinates and a state id. */
interface TreeBlockRef {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly stateId: number;
}

/**
 * Expand every tree into absolute blocks, bucketed by chunk.
 *
 * Bucketing (rather than walking the tree list once per chunk) keeps the pass
 * linear in the number of tree blocks, and the deterministic iteration order
 * of the placement list carries through: two trees whose canopies could touch
 * cannot, because the scatter's occupancy mask already forbade it.
 */
function bucketTrees(trees: readonly TreePlacement[]): Map<string, TreeBlockRef[]> {
  const out = new Map<string, TreeBlockRef[]>();
  for (const tree of trees) {
    const template = TREE_TEMPLATES[tree.shape];
    for (const block of template.blocks(tree.height)) {
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
