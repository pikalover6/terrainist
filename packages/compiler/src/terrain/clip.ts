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
}

/** Extend each built building's footprint to the box its blocks occupy. */
export function structureBoxes(buildings: readonly BuiltBuilding[]): StructureBox[] {
  return buildings.map((b) => ({
    x0: b.footprint.x0,
    z0: b.footprint.z0,
    x1: b.footprint.x1,
    z1: b.footprint.z1,
    // Local y = 0 is the floor; the skirt runs below it and the roof above.
    y0: b.floorY - b.meta.foundationDepth,
    y1: b.floorY + b.meta.roofTop + 1,
  }));
}

/** Build the clip test for a region and a set of boxes. */
export function makeStructureClip(region: Region, boxes: readonly StructureBox[]): StructureClip {
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

  return {
    boxes,
    columns,
    blockedColumn,
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
