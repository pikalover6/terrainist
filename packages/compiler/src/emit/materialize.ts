/**
 * Shared chunk materializer — one production seam for terrain, devworld and terrarium.
 *
 * Normal terrain, devworld and terrarium retain distinct WorldPlan construction
 * (regions, void behavior, level settings) but feed through this module for:
 * - column block iteration and biome painting,
 * - structure/entity stamping,
 * - flora / growth / connection late repair in fixed order,
 * - deterministic Anvil write-out.
 *
 * The terrarium adapts its plan before calling in: bounded rects down to
 * {@link TERRARIUM_PLATFORM_FLOOR}, uniform biomes, and platform composition.
 * Those remain terrarium-specific and are the reason the shared seam accepts a
 * `chunkFor` / `floorY` / biome-sampler instead of hard-coding a terrain
 * region. An empty flora/growth iterable flows through the same interface
 * without inventing work — the two passes simply examine nothing and the
 * alternation exits on the first check.
 *
 * Ordering is the contract: flora settle first, then growth faces, then bounded
 * alternation while either drops, then two-phase connection repair last. The
 * two-phase connection pass reads the original world snapshot and writes only
 * after deciding every block, so candidate order never matters.
 *
 * Hot-loop constraints: every block write goes through `fillColumn` /
 * `setStateId` on a scratch position, never a `Vec3` or `prismarine-block`.
 * No per-block allocation in the column loops; only the bucket maps allocate
 * once per block list.
 */

import type { BlockEntity } from "./block-entities.js";
import { applyConnectionStates, type ConnectionCandidate, type ConnectionStats } from "./connections.js";
import { settleFloraSupport, type FloraCell, type FloraSettleStats } from "./flora-settle.js";
import { applyGrowthFaces, type GrowthCell, type GrowthFixupStats } from "./growth-fixup.js";
import type { EmitChunk, PrismarineStack } from "./prismarine.js";
import { WORLD_MIN_Y } from "./prismarine.js";

import { GROWTH_FACES, isMultifaceGrowth } from "@terrainist/stdlib";

import type { ColumnPlan } from "../terrain/columns.js";
import {
  DEEPSLATE_BAND_HIGH,
  DEEPSLATE_BAND_LOW,
  FluidKind,
  isFrozenColumn,
  stoneBandState,
} from "../terrain/columns.js";
import type { StructureClip } from "../terrain/clip.js";
import type { DecorBlock } from "../terrain/decorate.js";
import { emitFloraBlocks, treeBlocks, treeStates, type TreePlacement } from "../terrain/vegetation.js";
/** Vertical resolution of the biome array: one value per 4×4×4 cell. */
const BIOME_CELL = 4;

/**
 * The bound on the flora-settling / growth-fixup alternation.
 *
 * Each round only ever deletes blocks, so the alternation converges on its own;
 * this exists so a bug can never spin. Deep enough that a real support chain —
 * a strand on a leaf on a strand — is settled long before it is reached.
 */
const MAX_SETTLE_ROUNDS = 8;

// ---------------------------------------------------------------------------
// Late repair — shared orchestration, fixed order
// ---------------------------------------------------------------------------

/** Input to the shared late-repair seam. Empty iterables are legal and cheap. */
export interface RepairInput {
  readonly chunks: ReadonlyMap<string, EmitChunk> | Map<string, EmitChunk>;
  readonly floraCells: Iterable<FloraCell>;
  readonly growthCells: Iterable<GrowthCell>;
  readonly connectionCandidates: Iterable<ConnectionCandidate>;
  readonly stack: PrismarineStack;
}

export interface RepairResult {
  readonly flora: FloraSettleStats;
  readonly growth: GrowthFixupStats;
  readonly connections: ConnectionStats;
}

/**
 * Encapsulated late repair: flora settle, growth-face repair with bounded
 * alternation, then two-phase connection repair last. Do not reorder.
 *
 * - Flora support first, because a strand's faces must be derived against the
 *   crown that *stays*.
 * - Vine faces next, recomputed against the composed world.
 * - Bounded alternation while either pass drops — both only delete, so it
 *   terminates; the bound is a spin guard, not a tuning knob.
 * - Connections last, over the finished world with a two-phase snapshot.
 *
 * Terrarium with empty flora/growth candidates flows through the same call:
 * the two passes examine nothing, the loop condition fails immediately, and the
 * connection pass still runs over the terrarium's structure blocks.
 */
export function repairWorld(input: RepairInput): RepairResult {
  const { chunks, floraCells, growthCells, connectionCandidates, stack } = input;
  // Flora support first, because the two passes settle the same neighbourhood
  // and a strand's faces must be derived against the crown that *stays*: a leaf
  // whose only support was a trunk block a later air write erased is removed
  // here, before anything reads its faces. See `emit/flora-settle.ts`.
  let flora = settleFloraSupport(chunks as ReadonlyMap<string, EmitChunk>, floraCells, stack);

  // Vine faces, for the same reason and one pass earlier: a `vine`'s whole
  // state is the set of blocks it claims to be stuck to, and which blocks are
  // there is only knowable once every plant, every ground treatment and every
  // wall has been stamped. See `emit/growth-fixup.ts`.
  let growth = applyGrowthFaces(chunks as ReadonlyMap<string, EmitChunk>, growthCells, stack);

  // The one way round the two passes can still disagree: a strand the fixup
  // *drops* was the only thing a leaf touched, and that leaf is stranded the
  // moment the vine goes. Settling flora again is the answer, and settling it
  // can only strand another strand — so the two alternate until neither
  // removes anything. Both passes only ever delete, so this terminates; the
  // bound exists so a bug cannot spin, not as a tuning knob. A world where the
  // fixup drops nothing — every world that compiled before this loop existed —
  // takes exactly one pass of each and is byte-identical.
  for (let round = 0; growth.dropped > 0 && round < MAX_SETTLE_ROUNDS; round++) {
    const again = settleFloraSupport(chunks as ReadonlyMap<string, EmitChunk>, floraCells, stack);
    flora = { examined: flora.examined, dropped: flora.dropped + again.dropped };
    if (again.dropped === 0) break;
    const faces = applyGrowthFaces(chunks as ReadonlyMap<string, EmitChunk>, growthCells, stack);
    growth = {
      examined: growth.examined,
      rewritten: growth.rewritten + faces.rewritten,
      dropped: growth.dropped + faces.dropped,
    };
    if (faces.dropped === 0) break;
  }

  // Connections last, over the finished world. Fences, panes, walls and bars
  // store their neighbours in their own block state and Minecraft never
  // recomputes that on load, so it has to be right on disk — and it can only
  // be computed once every block exists. Two-phase: decide every block's new
  // state against the original snapshot, then write.
  const connections = applyConnectionStates(
    chunks as ReadonlyMap<string, EmitChunk>,
    connectionCandidates,
    stack,
  );

  return { flora, growth, connections };
}


// ---------------------------------------------------------------------------
// Column helpers — shared tail used by terrain and terrarium
// ---------------------------------------------------------------------------

function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Fill one column's stone body, y-banded. Terrain only: deepslate low, stone
 * high, blended band in between via position-hashed `stoneBandState`. Two bulk
 * fills plus per-block band. Preserves the exact deepslate/stone decisions the
 * terrain emitter has always made.
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
 * Replace one column's cave spans with `cave_air`, optionally clamped to a
 * platform floor. Returns the number of solid blocks removed for block-count
 * honesty. Terrain calls with no floor (unclamped); terrarium clamps to its
 * platform floor so a gallery below the platform is not punched.
 */
function punchCaves(
  chunk: EmitChunk,
  plan: ColumnPlan,
  idx: number,
  lx: number,
  lz: number,
  floorY?: number,
): number {
  const caves = plan.caves;
  if (caves === undefined) return 0;
  const end = caves.spans.offsets[idx + 1] as number;
  let removed = 0;
  for (let k = caves.spans.offsets[idx] as number; k < end; k++) {
    let lo = caves.spans.lo[k] as number;
    const hi = caves.spans.hi[k] as number;
    if (floorY !== undefined) {
      lo = Math.max(lo, floorY);
      if (hi < lo) continue;
    }
    chunk.fillColumn(lx, lz, lo, hi, plan.states.caveAir);
    removed += hi - lo + 1;
  }
  return removed;
}

// Shared tail: soil + surface
function fillSoilAndSurface(
  chunk: EmitChunk,
  plan: ColumnPlan,
  lx: number,
  lz: number,
  idx: number,
  top: number,
  soilBase: number,
  soilDepth: number,
): number {
  let count = 0;
  if (soilDepth > 0 && top - 1 >= soilBase) {
    chunk.fillColumn(lx, lz, soilBase, top - 1, plan.subsurface[idx] as number);
    count += top - soilBase;
  }
  chunk.setStateId(lx, top, lz, plan.surface[idx] as number);
  count += 1;
  return count;
}

// Shared tail: fluid or snow
function fillFluidOrSnow(
  chunk: EmitChunk,
  plan: ColumnPlan,
  lx: number,
  lz: number,
  idx: number,
  top: number,
  isFrozen: boolean,
): number {
  let count = 0;
  const kind = plan.fluidKind[idx];
  if (kind !== FluidKind.NONE) {
    const fluidState = kind === FluidKind.LAVA ? plan.states.lava : plan.states.water;
    const surfaceY = plan.fluidTop[idx] as number;
    if (surfaceY > top) {
      if (plan.states.ice !== undefined && isFrozen) {
        // F32: a frozen surface — water to one below the top, ice on top.
        if (surfaceY - 1 > top) chunk.fillColumn(lx, lz, top + 1, surfaceY - 1, fluidState);
        chunk.setStateId(lx, surfaceY, lz, plan.states.ice);
      } else {
        chunk.fillColumn(lx, lz, top + 1, surfaceY, fluidState);
      }
      count += surfaceY - top;
    }
  } else if (plan.snow[idx] === 1 && top + 1 <= 319) {
    chunk.setStateId(lx, top + 1, lz, plan.states.snowLayer);
    count += 1;
  }
  return count;
}

/** Write every column of one chunk; returns the block count written. Terrain path. */
export function fillChunk(chunk: EmitChunk, plan: ColumnPlan, cx: number, cz: number): number {
  const { region, ground, soil } = plan;
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

      chunk.setStateId(lx, WORLD_MIN_Y, lz, plan.states.bedrock);
      count += 1;

      if (soilBase > WORLD_MIN_Y + 1) {
        count += fillStoneBody(chunk, plan, lx, lz, x, z, WORLD_MIN_Y + 1, soilBase - 1);
      }
      count += fillSoilAndSurface(chunk, plan, lx, lz, idx, top, soilBase, soilDepth);

      const isFrozen = plan.states.ice !== undefined && isFrozenColumn(plan, idx);
      count += fillFluidOrSnow(chunk, plan, lx, lz, idx, top, isFrozen);

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
 * Write one rectangle of a plan's columns into the world.
 *
 * A bounded, floored version of the terrain column fill: soil and surface
 * exactly as the plan holds them, stone from there down to `floorY`, and
 * nothing at all outside the rectangle. No bedrock: the underside of a
 * platform is meant to be *seen*. `rect` is in **world** columns and `offset`
 * is what was added to the plan's own coordinates to get there — zero for the
 * substrate, and the platform's displacement for a transplanted settlement.
 * Cave spans are punched last, clamped to `floorY`, exactly as the emitter
 * does it.
 *
 * This is the terrarium's plan-adaptation entry point; the column tail
 * (soil/surface, fluid/snow, caves) is shared with the terrain path so the
 * two cannot drift.
 */
export function materializeColumns(
  chunkFor: (cx: number, cz: number) => EmitChunk,
  plan: ColumnPlan,
  rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number },
  floorY: number,
  offset: { readonly x: number; readonly z: number } = { x: 0, z: 0 },
): number {
  const { region } = plan;
  const stone = plan.states.stone;
  let count = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    const j = z - offset.z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - offset.x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const idx = j * region.width + i;
      const chunk = chunkFor(x >> 4, z >> 4);
      const lx = x - (x >> 4) * 16;
      const lz = z - (z >> 4) * 16;

      const top = plan.ground[idx] as number;
      const soilDepth = plan.soil[idx] as number;
      const soilBase = top - soilDepth;
      if (soilBase - 1 >= floorY) {
        chunk.fillColumn(lx, lz, floorY, soilBase - 1, stone);
        count += soilBase - floorY;
      }
      count += fillSoilAndSurface(chunk, plan, lx, lz, idx, top, soilBase, soilDepth);
      // Terrarium never freezes: its substrate is a built plain, not a climate
      // field with `freeze.always`, and its transplanted settlements' freeze
      // flags are irrelevant to a reviewer. Keeping the check would invent
      // ice on a platform where the uniform biome says there is none.
      count += fillFluidOrSnow(chunk, plan, lx, lz, idx, top, false);

      const removed = punchCaves(chunk, plan, idx, lx, lz, floorY);
      count -= removed;
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
export function paintBiomes(chunk: EmitChunk, plan: ColumnPlan, cx: number, cz: number): void {
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

/** Paint a whole chunk one biome, at the 4×4×4 resolution the format wants. */
export function paintChunkBiome(chunk: EmitChunk, biomeId: number): void {
  for (let cellZ = 0; cellZ < 4; cellZ++) {
    for (let cellX = 0; cellX < 4; cellX++) {
      for (let y = WORLD_MIN_Y; y < WORLD_MIN_Y + 384; y += 4) {
        chunk.setBiomeAt(cellX * 4, y, cellZ * 4, biomeId);
      }
    }
  }
}

/** One block, resolved to absolute coordinates and a state id. Shared shape of DecorBlock, StructureBlock and FloraCell. */
export type PlacedBlock = FloraCell;

/** Stamp absolute-positioned blocks that fall inside one chunk. */
export function stampBlocks<T extends PlacedBlock>(
  chunk: EmitChunk,
  blocks: readonly T[],
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
export function stampBlockEntities(chunk: EmitChunk, entities: readonly BlockEntity[]): number {
  for (const entity of entities) {
    chunk.setBlockEntityNbt(entity.x, entity.y, entity.z, {
      ...entity.data,
      id: { type: "string", value: entity.id },
    });
  }
  return entities.length;
}

/** Bucket block entities by chunk, preserving their deterministic order. */
export function bucketBlockEntities(entities: readonly BlockEntity[]): Map<string, BlockEntity[]> {
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

/**
 * Every multi-face growth block in a flat block list, as fixup candidates.
 *
 * Cached per state id rather than decoded per block, for `bucketTrees`'s own
 * reason: a city's worth of ivy is thousands of vines off a handful of states.
 */
export function collectGrowthCells(
  blocks: readonly DecorBlock[],
  codec: PrismarineStack,
  out: GrowthCell[],
): void {
  const growthState = new Map<number, boolean>();
  for (const block of blocks) {
    if (block.y < WORLD_MIN_Y || block.y > 319) continue;
    let is = growthState.get(block.stateId);
    if (is === undefined) {
      const decoded = codec.blockStateProps(block.stateId);
      is = decoded !== undefined && isMultifaceGrowth(decoded.name);
      growthState.set(block.stateId, is);
    }
    if (is) out.push({ x: block.x, y: block.y, z: block.z });
  }
}

export function bucketDecor<T extends PlacedBlock>(decor: readonly T[]): Map<string, T[]> {
  return bucketBlocks(decor);
}

/**
 * Expand every tree into absolute blocks, bucketed by chunk.
 *
 * Bucketing (rather than walking the tree list once per chunk) keeps the pass
 * linear in the number of tree blocks, and the deterministic iteration order
 * of the placement list carries through: two trees whose canopies could touch
 * cannot, because the scatter's occupancy mask already forbade it.
 */
export function bucketTrees(
  trees: readonly TreePlacement[],
  codec: PrismarineStack,
  clip: StructureClip | undefined,
  growth: GrowthCell[],
  exempt?: (x: number, z: number) => "whole" | "wood" | undefined,
): Map<string, PlacedBlock[]> {
  const out = new Map<string, PlacedBlock[]>();
  // Which state ids are multi-face growth is a property of the palette, not of
  // the plant, so the answer is cached per state id rather than re-decoded per
  // block: a giant's curtain is thousands of vines off one state.
  const growthState = new Map<number, boolean>();
  const leafState = new Map<number, boolean>();
  const isLeaf = (stateId: number): boolean => {
    const cached = leafState.get(stateId);
    if (cached !== undefined) return cached;
    const decoded = codec.blockStateProps(stateId);
    const is = decoded !== undefined && decoded.name.endsWith("_leaves");
    leafState.set(stateId, is);
    return is;
  };
  const isGrowth = (stateId: number): boolean => {
    const cached = growthState.get(stateId);
    if (cached !== undefined) return cached;
    const decoded = codec.blockStateProps(stateId);
    const is = decoded !== undefined && isMultifaceGrowth(decoded.name);
    growthState.set(stateId, is);
    return is;
  };
  for (const tree of trees) {
    const strength = exempt?.(tree.x, tree.z);
    const clipped = strength === "whole" ? undefined : clip;
    const woodOnly = strength === "wood";
    /**
     * A clipped tree's surviving cells, for the orphan-leaf sweep below.
     *
     * Clipping a crown leaves holes in it, and a hole in a crown can strand a
     * single outlying leaf with air on all six faces — `floating.isolated`,
     * measured first on the WP-4 ground fixture. So the kept set is collected
     * first and any leaf with no kept neighbour of its own tree is dropped, to
     * a fixpoint. Dropping a leaf that happens to touch masonry instead costs
     * nothing: it is one leaf, and the bar is zero findings.
     *
     * **Every clipped tree, not only the `"wood"`-exempt ones** (2026-08-10).
     * The sweep was written for the exempt trunks because they were the only
     * trees known to strand anything; the metropolis fixture then linted 35
     * orphaned leaves that all belonged to ordinary clipped trees — a crown
     * pressed into a shell, cut, and one leaf left behind on the far side. The
     * gate is `cut > 0`, so a tree no solid touched takes the unbuffered path
     * it always took and no world without clipped crowns moves.
     */
    let cut = 0;
    let keptCells: Set<string> | undefined = woodOnly ? new Set<string>() : undefined;
    const pending: PlacedBlock[] = [];
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
      // Part-aware, and it has to be the *same* answer `clipTrees` gave when it
      // decided this tree could stand at all: a building's box withholds wood
      // from its one-block eave ring but lets leaves up to the wall face. See
      // `StructureBox.leafInset`.
      const leafy = isLeaf(block.stateId);
      if (clipped !== undefined && clipped.blocked(x, y, z, leafy ? "leaves" : "wood")) {
        cut += 1;
        if (!(woodOnly && !leafy)) continue;
      }
      keptCells?.add(`${x},${y},${z}`);
      pending.push({ x, y, z, stateId: block.stateId });
    }
    // Nothing was cut: flush in order, which is the list this function has
    // always written for a tree standing clear of the fabric.
    if (keptCells === undefined && cut === 0) {
      for (const b of pending) {
        const key = `${b.x >> 4},${b.z >> 4}`;
        let bucket = out.get(key);
        if (bucket === undefined) {
          bucket = [];
          out.set(key, bucket);
        }
        bucket.push(b);
        if (isGrowth(b.stateId)) growth.push({ x: b.x, y: b.y, z: b.z });
      }
      continue;
    }
    if (keptCells === undefined) {
      keptCells = new Set<string>();
      for (const b of pending) keptCells.add(`${b.x},${b.y},${b.z}`);
    }
    for (let again = true; again; ) {
      again = false;
      for (const b of pending) {
        const key = `${b.x},${b.y},${b.z}`;
        if (!keptCells.has(key) || !isLeaf(b.stateId)) continue;
        let touching = false;
        for (const [, ox, oy, oz] of GROWTH_FACES) {
          if (keptCells.has(`${b.x + ox},${b.y + oy},${b.z + oz}`)) {
            touching = true;
            break;
          }
        }
        if (touching) continue;
        keptCells.delete(key);
        again = true;
      }
    }
    for (const b of pending) {
      if (!keptCells.has(`${b.x},${b.y},${b.z}`)) continue;
      const key = `${b.x >> 4},${b.z >> 4}`;
      let bucket = out.get(key);
      if (bucket === undefined) {
        bucket = [];
        out.set(key, bucket);
      }
      bucket.push(b);
      if (isGrowth(b.stateId)) growth.push({ x: b.x, y: b.y, z: b.z });
    }
  }
  return out;
}

/**
 * Every surface column, as a connection candidate.
 *
 * Lazily, because the list is region-sized and is consumed once. The y is the
 * surface course itself — `plan.ground[idx]` is the top solid block, which is
 * exactly where a ground treatment laid its paving.
 */
export function* surfaceCandidates(plan: ColumnPlan): Generator<{ x: number; y: number; z: number }> {
  const { region } = plan;
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      yield { x: region.x0 + i, y: plan.ground[idx] as number, z: region.z0 + j };
    }
  }
}

/**
 * Bucket a flat block list by chunk, preserving deterministic order. Shared
 * helper used by both terrain and terrarium stamping — the same code, the same
 * y-bounds, the same key scheme.
 */
export function bucketBlocks<T extends PlacedBlock>(blocks: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const block of blocks) {
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
