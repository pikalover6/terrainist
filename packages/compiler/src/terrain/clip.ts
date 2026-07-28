/**
 * Clipping vegetation against buildings.
 *
 * The scatter pass reserves *trunk* columns only — that is deliberate, and it is
 * what lets a forest close its canopy instead of reading as speckle. But a
 * canopy that may overlap its neighbours may also overlap a roof, and the first
 * village compile did exactly that: oaks planted two blocks off a gable draped
 * leaves across the tiles, and from any angle the houses looked half-buried.
 *
 * The fix is two rules, both applied here:
 *
 * 1. **No vegetation voxel may occupy a structure's box.** The box is the placed
 *    footprint extended vertically from the bottom of the foundation skirt to
 *    one block above the roof — the "+1" so a canopy cannot sit flush on the
 *    ridge either.
 * 2. **A tree that would lose more than {@link MAX_CLIP_FRACTION} of its volume
 *    is not planted at all.** Clipping alone would leave half-eaten trees
 *    pressed against walls, which looks worse than the overlap did; past that
 *    threshold the honest answer is that the tree was never there.
 *
 * Both rules read a set of boxes rather than the occupancy grid, because
 * occupancy is 2-D and the question here is genuinely 3-D: a tree standing
 * downhill of a hall may legitimately put its crown *above* the hall's roofline,
 * and flattening that to "the column is claimed" would delete trees the eye
 * expects to see.
 */

import type { Region } from "@terrainist/stdlib";

import type { BuiltBuilding } from "../structures/buildings.js";

import { TREE_TEMPLATES, type TreePlacement } from "./vegetation.js";

/** Share of a tree's voxels that may be clipped before it is dropped entirely. */
export const MAX_CLIP_FRACTION = 0.4;

/** Blocks of headroom kept clear above a road surface. */
export const ROAD_CANOPY_CLEARANCE = 4;

/**
 * How far loose ground decor must stay clear of built ground, in blocks.
 *
 * `blockedColumn` answers "is this column *under* a structure", and for a plant
 * that stands in one column that is the whole question. A fallen log is not:
 * it lies across up to four columns, it is a metre-thick horizontal beam, and
 * a render review found sixteen of them lying flat against village walls, where
 * the eye reads them not as deadwood but as timber someone left leaning on the
 * house. Deadwood therefore keeps an apron: no fallen log within this many
 * blocks of a footprint, a road corridor or the plaza.
 *
 * Four blocks is the log's own maximum length, which is exactly the distance at
 * which a log can no longer point *at* a wall.
 */
export const DECOR_APRON = 4;

/** The shape {@link roadCorridorBoxes} reads out of a routed road. */
export interface RouteLike {
  readonly path: readonly { readonly x: number; readonly z: number; readonly y: number }[];
}

/** The world-space box one structure occupies, inclusive on every axis. */
export interface StructureBox {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly y0: number;
  readonly y1: number;
}

/**
 * The clip test, plus the column mask that bounds it.
 *
 * The mask is the cheap rejection: the overwhelming majority of vegetation
 * voxels are nowhere near a building, and one array lookup answers for them.
 */
export interface StructureClip {
  readonly boxes: readonly StructureBox[];
  /** 1 on every column any box covers. */
  readonly columns: Uint8Array;
  /** True when `(x, y, z)` falls inside a structure. */
  blocked(x: number, y: number, z: number): boolean;
  /** True when the column `(x, z)` is under or over a structure. */
  blockedColumn(x: number, z: number): boolean;
  /**
   * True when `(x, z)` is within {@link DECOR_APRON} blocks of built ground —
   * a footprint, a road corridor, or a column the caller passed as claimed.
   */
  inApron(x: number, z: number): boolean;
}

/**
 * Extend each built building's footprint to the box its blocks occupy.
 *
 * One block wider than the footprint on every side, because the grammar's
 * facade details — the eave course above all — live in that apron ring, and a
 * canopy pressed into an eave looks exactly as wrong as one pressed into a roof.
 */
export function structureBoxes(buildings: readonly BuiltBuilding[]): StructureBox[] {
  return buildings.map((b) => ({
    x0: b.footprint.x0 - 1,
    z0: b.footprint.z0 - 1,
    x1: b.footprint.x1 + 1,
    z1: b.footprint.z1 + 1,
    // Local y = 0 is the floor; the skirt runs below it and the roof above.
    y0: b.floorY - b.meta.foundationDepth,
    y1: b.floorY + b.meta.roofTop + 1,
  }));
}

/**
 * The boxes that keep a lane open through a wood.
 *
 * A road cut through a forest is a *cut*: you see sky above it. The scatter only
 * reserves trunk columns, so nothing stopped two oaks either side of a lane from
 * closing their crowns over it, and the first village had 1198 road columns
 * roofed in leaves — a tunnel, not a lane.
 *
 * One box per route cell, spanning the surfaced band plus a block of verge, and
 * reaching {@link ROAD_CANOPY_CLEARANCE} above the graded surface. That is the
 * headroom a rider needs, and no more: a crown that arches *high* over the road
 * is scenery and is left alone.
 */
export function roadCorridorBoxes(
  routes: readonly RouteLike[],
  width: number,
  clearance: number = ROAD_CANOPY_CLEARANCE,
): StructureBox[] {
  const reach = Math.max(1, ((width - 1) >> 1) + 1);
  const out: StructureBox[] = [];
  for (const route of routes) {
    for (const cell of route.path) {
      out.push({
        x0: cell.x - reach,
        x1: cell.x + reach,
        z0: cell.z - reach,
        z1: cell.z + reach,
        y0: cell.y,
        y1: cell.y + clearance,
      });
    }
  }
  return out;
}

/**
 * Dilate a column mask by `margin` blocks, Chebyshev.
 *
 * Separable: a horizontal max filter then a vertical one, which is `O(w · d ·
 * margin)` rather than `O(w · d · margin²)` and gives the same square apron.
 */
export function dilateColumns(region: Region, mask: Uint8Array, margin: number): Uint8Array {
  const { width, depth } = region;
  if (margin <= 0) return Uint8Array.from(mask);
  const rows = new Uint8Array(width * depth);
  for (let j = 0; j < depth; j++) {
    const base = j * width;
    for (let i = 0; i < width; i++) {
      if (mask[base + i] !== 1) continue;
      const from = Math.max(0, i - margin);
      const to = Math.min(width - 1, i + margin);
      for (let k = from; k <= to; k++) rows[base + k] = 1;
    }
  }
  const out = new Uint8Array(width * depth);
  for (let j = 0; j < depth; j++) {
    const base = j * width;
    for (let i = 0; i < width; i++) {
      if (rows[base + i] !== 1) continue;
      const from = Math.max(0, j - margin);
      const to = Math.min(depth - 1, j + margin);
      for (let k = from; k <= to; k++) out[k * width + i] = 1;
    }
  }
  return out;
}

/**
 * Build the clip test for a region and a set of boxes.
 *
 * `claimed` is extra built ground that owns no box — the paved plaza, which is
 * a change to the surface rather than a solid. It contributes to the decor
 * apron only: there is nothing above it to clip a canopy against.
 */
export function makeStructureClip(
  region: Region,
  boxes: readonly StructureBox[],
  claimed?: Uint8Array,
): StructureClip {
  const columns = new Uint8Array(region.width * region.depth);
  for (const box of boxes) {
    for (let z = box.z0; z <= box.z1; z++) {
      const j = z - region.z0;
      if (j < 0 || j >= region.depth) continue;
      for (let x = box.x0; x <= box.x1; x++) {
        const i = x - region.x0;
        if (i < 0 || i >= region.width) continue;
        columns[j * region.width + i] = 1;
      }
    }
  }

  const blockedColumn = (x: number, z: number): boolean => {
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return false;
    return columns[j * region.width + i] === 1;
  };

  const built = new Uint8Array(columns);
  if (claimed !== undefined) {
    for (let k = 0; k < built.length && k < claimed.length; k++) {
      if (claimed[k] === 1) built[k] = 1;
    }
  }
  const apron = dilateColumns(region, built, DECOR_APRON);

  return {
    boxes,
    columns,
    blockedColumn,
    inApron(x: number, z: number): boolean {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return false;
      return apron[j * region.width + i] === 1;
    },
    blocked(x: number, y: number, z: number): boolean {
      if (!blockedColumn(x, z)) return false;
      for (const box of boxes) {
        if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) continue;
        if (y >= box.y0 && y <= box.y1) return true;
      }
      return false;
    },
  };
}

/** What {@link clipTrees} decided. */
export interface TreeClipResult {
  /** The trees that survive, in their original order. */
  readonly trees: readonly TreePlacement[];
  /** Trees dropped for losing too much of themselves. */
  readonly dropped: number;
  /** Voxels the survivors will have clipped away at emit. */
  readonly clippedBlocks: number;
}

/**
 * Apply rule 2: drop every tree that a structure would eat more than
 * {@link MAX_CLIP_FRACTION} of.
 *
 * Rule 1 — clipping the survivors' individual voxels — is applied at emit,
 * where the blocks are expanded anyway; doing it twice would mean materializing
 * every tree's voxel list into memory a second time for no gain.
 */
export function clipTrees(
  trees: readonly TreePlacement[],
  clip: StructureClip,
): TreeClipResult {
  const kept: TreePlacement[] = [];
  let dropped = 0;
  let clippedBlocks = 0;

  for (const tree of trees) {
    const variation = { height: tree.height, radiusDelta: tree.radiusDelta, mega: tree.mega };
    const radius = TREE_TEMPLATES[tree.shape].canopyRadius(variation) + (tree.mega ? 2 : 0);
    // Cheap rejection: a tree whose whole horizontal reach misses every claimed
    // column cannot be clipped, and that is nearly all of them.
    if (!nearStructure(clip, tree.x, tree.z, radius + 1)) {
      kept.push(tree);
      continue;
    }

    const blocks = TREE_TEMPLATES[tree.shape].blocks(variation);
    let hit = 0;
    for (const block of blocks) {
      if (clip.blocked(tree.x + block.dx, tree.baseY + block.dy, tree.z + block.dz)) hit++;
    }
    if (blocks.length > 0 && hit / blocks.length > MAX_CLIP_FRACTION) {
      dropped++;
      continue;
    }
    clippedBlocks += hit;
    kept.push(tree);
  }

  return { trees: kept, dropped, clippedBlocks };
}

/** True when any claimed column lies within `reach` of `(x, z)`. */
function nearStructure(clip: StructureClip, x: number, z: number, reach: number): boolean {
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (clip.blockedColumn(x + dx, z + dz)) return true;
    }
  }
  return false;
}
