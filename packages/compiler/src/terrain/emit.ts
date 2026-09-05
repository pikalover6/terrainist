/**
 * Materialize a column plan into Anvil chunks and write the world.
 *
 * The hot loop here is the whole compiler's cost centre — a 512×512 world is
 * roughly 50 million block writes — so it goes through
 * {@link EmitChunk.fillColumn} and {@link EmitChunk.setStateId}, which reuse a
 * single scratch position and write state ids straight into the section
 * palettes. No `Vec3` is allocated per block and no `prismarine-block` is ever
 * constructed.
 *
 * Column and biome work, stamping, and the flora / growth / connection late
 * repair are now the shared production seam in `emit/materialize.ts` — terrain,
 * devworld (via this entry) and terrarium all flow through the same
 * implementation. Terrain and terrarium retain distinct WorldPlan construction,
 * floor/void behavior and level settings, but the materialization itself is one
 * source of truth.
 */

import path from "node:path";

import type { BlockEntity } from "../emit/block-entities.js";
import type { ConnectionStats } from "../emit/connections.js";
import type { FloraCell, FloraSettleStats } from "../emit/flora-settle.js";
import type { GrowthCell, GrowthFixupStats } from "../emit/growth-fixup.js";
import type { EmitChunk, PrismarineStack } from "../emit/prismarine.js";
import { writeWorldFiles } from "../emit/write.js";
import {
  bucketBlockEntities,
  bucketDecor,
  bucketTrees,
  collectGrowthCells,
  fillChunk,
  paintBiomes,
  repairWorld,
  stampBlockEntities,
  stampBlocks,
  surfaceCandidates,
} from "../emit/materialize.js";

import type { ColumnPlan } from "./columns.js";
import type { StructureClip } from "./clip.js";
import type { DecorBlock } from "./decorate.js";
import type { TreePlacement } from "./vegetation.js";

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
   *
   * The test is asked per part, because a building's box is not the same box
   * for a leaf as for a log (`StructureBox.leafInset`).
   */
  readonly clip?: StructureClip;
  /**
   * Columns whose flora the clip may not touch — the green skin's elected
 * trunks.
   *
   * The clip is asked **twice**: once per tree in `clipTrees`, which decides
   * whether a tree stands at all, and once per *block* here, which decides
   * which of a standing tree's voxels survive. Exempting only the first leaves
   * the tree standing and erases it block by block — measured on the WP-6d
   * fixture: 61 trees on elected columns, 27 visible in the world, and every
   * shell tree Kai's ruling elected in the missing 34. Both readers take the
   * exemption or neither does.
   *
   * Two strengths, because the two elections are not the same promise.
   * `"whole"` is a street trunk: the street law gave it the ground outright.
   * `"wood"` is a shell trunk, and it is the difference between Q5's image and
   * a physics finding — the trunk goes up through the roofless shell and the
   * **canopy is still clipped inside it**, so what survives is the crown above
   * the wall head and a bare trunk in the room. A crown allowed to fill the
   * nave blocks the room outright: 83 `interior.blocked_column` and 438
   * `traversal.unreachable` findings, measured, against a zero bar.
   */
  readonly clipExempt?: (x: number, z: number) => "whole" | "wood" | undefined;
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
  /** What the multi-face growth fixup examined, rewrote and dropped. */
  readonly growth: GrowthFixupStats;
  /** What the flora support settling examined and dropped. */
  readonly flora: FloraSettleStats;
}


/** Materialize and write. */
export async function emitTerrain(input: TerrainEmitInput): Promise<TerrainEmitSummary> {
  const { plan, stack } = input;
  const { region } = plan;

  const growthCells: GrowthCell[] = [];
  const treesByChunk = bucketTrees(input.trees, stack, input.clip, growthCells, input.clipExempt);
  /**
   * Every flora cell that survived the per-tree sweep, for the settling below.
   *
   * The bucketed lists *are* that set — a `PlacedBlock` is a {@link FloraCell}
   * — so this is a re-iterable view over them rather than a second copy: a
   * 512x512 wood is two million cells, and the settling reads them at most
   * twice.
   */
  const floraCells: Iterable<FloraCell> = {
    *[Symbol.iterator](): Iterator<FloraCell> {
      for (const bucket of treesByChunk.values()) yield* bucket;
    },
  };
  const decorByChunk = bucketDecor(input.decor ?? []);
  const structureByChunk = bucketDecor(input.structures ?? []);
  // A face is a property of a **neighbourhood, not of which pass wrote the
  // block** — the structure layer writes multi-face growth too and it derives
  // its faces against a *surface index* that stops at the ruin field's edge.
  // So its growth cells go through the same fixup the flora side does.
  collectGrowthCells(input.structures ?? [], stack, growthCells);
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

  const { flora, growth, connections } = repairWorld({
    chunks,
    floraCells,
    growthCells,
    connectionCandidates: [...(input.decor ?? []), ...(input.structures ?? []), ...surfaceCandidates(plan)],
    stack,
  });

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
    growth,
    flora,
  };
}
