import type { Rect } from "./frames.js";
import { dilateMask } from "./forms/contour-lines.js";

/** Row-major addressing over a district footprint. */
export class Grid {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
  readonly cells: number;

  constructor(bounds: Rect) {
    this.x0 = bounds.x0;
    this.z0 = bounds.z0;
    this.width = bounds.x1 - bounds.x0 + 1;
    this.depth = bounds.z1 - bounds.z0 + 1;
    this.cells = this.width * this.depth;
  }

  /** Cell index, or `-1` outside the footprint. */
  index(x: number, z: number): number {
    const i = x - this.x0;
    const j = z - this.z0;
    if (i < 0 || j < 0 || i >= this.width || j >= this.depth) return -1;
    return j * this.width + i;
  }

  x(index: number): number {
    return this.x0 + (index % this.width);
  }

  z(index: number): number {
    return this.z0 + Math.floor(index / this.width);
  }
}

/**
 * The `rings`-deep band around a mask, excluding the mask itself.
 *
 * Delegated to `forms/contour-lines.ts`'s `dilateMask`, unchanged line for
 * line, so that the site planner's street band and this sidewalk are one
 * computation rather than two agreeing implementations
 */
export function dilateGrid(grid: Grid, mask: Uint8Array, rings: number): Uint8Array {
  return dilateMask(mask, grid.width, grid.depth, rings);
}
