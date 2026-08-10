/**
 * Vendored 2026-07-27 from the mcai prototype (packages/voxel-renderer);
 * carried over as proven code per docs/DESIGN.md.
 */

import { Canvas } from "./canvas.js";
import type { VoxelGrid } from "./grid.js";
import { applyBiomeTint } from "../biome-tint.js";
import { appearanceOf, isRenderAir } from "./palette.js";

export interface OrthoOptions {
  /** Pixels per block. */
  scale?: number;
  maxEdge?: number;
  background?: [number, number, number, number];
}

function pickScale(spanA: number, spanB: number, options: OrthoOptions): number {
  let scale = options.scale ?? 4;
  const maxEdge = options.maxEdge ?? 4096;
  while (scale > 1 && Math.max(spanA * scale, spanB * scale) > maxEdge) scale -= 1;
  return scale;
}

function put(canvas: Canvas, px: number, py: number, scale: number, color: readonly [number, number, number], shade: number, alpha = 1): void {
  for (let dy = 0; dy < scale; dy++) {
    for (let dx = 0; dx < scale; dx++) {
      canvas.blend(px + dx, py + dy, Math.min(255, Math.round(color[0] * shade)), Math.min(255, Math.round(color[1] * shade)), Math.min(255, Math.round(color[2] * shade)), alpha);
    }
  }
}

/**
 * Top-down map of the highest non-air block in each column, hill-shaded from
 * the height difference with the north-west neighbours so relief is legible.
 * `ceiling` limits the scan, which turns the same code into an "everything
 * below Y" underground map.
 */
export function renderTopDown(grid: VoxelGrid, options: OrthoOptions & { ceiling?: number; floor?: number } = {}): Canvas {
  const b = grid.bounds;
  const top = Math.min(options.ceiling ?? b.maxY, b.maxY);
  const bottom = Math.max(options.floor ?? b.minY, b.minY);
  const spanX = b.maxX - b.minX + 1;
  const spanZ = b.maxZ - b.minZ + 1;
  const scale = pickScale(spanX, spanZ, options);
  const canvas = new Canvas(spanX * scale, spanZ * scale, options.background ?? [16, 18, 22, 255]);

  const heights = new Int32Array(spanX * spanZ).fill(Number.MIN_SAFE_INTEGER);
  const blocks = new Uint16Array(spanX * spanZ);
  for (let z = b.minZ; z <= b.maxZ; z++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      for (let y = top; y >= bottom; y--) {
        const index = grid.indexAt(x, y, z);
        if (index === 0 || isRenderAir(grid.palette[index]!)) continue;
        heights[(z - b.minZ) * spanX + (x - b.minX)] = y;
        blocks[(z - b.minZ) * spanX + (x - b.minX)] = index;
        break;
      }
    }
  }

  for (let z = b.minZ; z <= b.maxZ; z++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      const cell = (z - b.minZ) * spanX + (x - b.minX);
      const index = blocks[cell]!;
      if (index === 0) continue;
      const block = grid.palette[index]!;
      const appearance = appearanceOf(block);
      const color = applyBiomeTint(appearance.color, block, grid.biomeAt(x, z));
      const height = heights[cell]!;
      const west = x > b.minX ? heights[cell - 1]! : height;
      const north = z > b.minZ ? heights[cell - spanX]! : height;
      const relief = (height - west) + (height - north);
      const shade = Math.max(0.45, Math.min(1.5, 1 + relief * 0.11)) * (appearance.emissive ? 1.3 : 1);
      put(canvas, (x - b.minX) * scale, (z - b.minZ) * scale, scale, color, shade);
    }
  }
  return canvas;
}

/**
 * A single horizontal layer — the floor plan a builder would draw. Blocks at
 * exactly `y` are drawn solid; the layer below shows through faintly so rooms
 * read against their floor.
 */
export function renderFloorPlan(grid: VoxelGrid, y: number, options: OrthoOptions = {}): Canvas {
  const b = grid.bounds;
  const spanX = b.maxX - b.minX + 1;
  const spanZ = b.maxZ - b.minZ + 1;
  const scale = pickScale(spanX, spanZ, options);
  const canvas = new Canvas(spanX * scale, spanZ * scale, options.background ?? [16, 18, 22, 255]);
  for (let z = b.minZ; z <= b.maxZ; z++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      const below = grid.indexAt(x, y - 1, z);
      if (below !== 0) {
        const block = grid.palette[below]!;
        const appearance = appearanceOf(block);
        put(canvas, (x - b.minX) * scale, (z - b.minZ) * scale, scale, applyBiomeTint(appearance.color, block, grid.biomeAt(x, z)), 0.42);
      }
      const here = grid.indexAt(x, y, z);
      if (here === 0) continue;
      const hereBlock = grid.palette[here]!;
      const appearance = appearanceOf(hereBlock);
      put(canvas, (x - b.minX) * scale, (z - b.minZ) * scale, scale, applyBiomeTint(appearance.color, hereBlock, grid.biomeAt(x, z)), appearance.emissive ? 1.3 : 1, appearance.thin ? 0.85 : 1);
    }
  }
  return canvas;
}

/**
 * Vertical cross-section: looking along one horizontal axis, the first
 * non-air block found within the slab is drawn, so interiors, floors and
 * ceilings are all visible at once.
 */
export function renderSection(
  grid: VoxelGrid,
  axis: "x" | "z",
  from: number,
  to: number,
  options: OrthoOptions & { fromFar?: boolean } = {},
): Canvas {
  const b = grid.bounds;
  const acrossMin = axis === "z" ? b.minX : b.minZ;
  const acrossMax = axis === "z" ? b.maxX : b.maxZ;
  const spanAcross = acrossMax - acrossMin + 1;
  const spanY = b.maxY - b.minY + 1;
  const scale = pickScale(spanAcross, spanY, options);
  const canvas = new Canvas(spanAcross * scale, spanY * scale, options.background ?? [16, 18, 22, 255]);

  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const depthOrder: number[] = [];
  for (let d = low; d <= high; d++) depthOrder.push(d);
  if (options.fromFar) depthOrder.reverse();

  for (let y = b.minY; y <= b.maxY; y++) {
    for (let across = acrossMin; across <= acrossMax; across++) {
      for (let step = 0; step < depthOrder.length; step++) {
        const depth = depthOrder[step]!;
        const index = axis === "z" ? grid.indexAt(across, y, depth) : grid.indexAt(depth, y, across);
        if (index === 0) continue;
        const block = grid.palette[index]!;
        const appearance = appearanceOf(block);
        const [wx, wz] = axis === "z" ? [across, depth] : [depth, across];
        // Fade with depth into the slab so the cut face stands forward.
        const shade = (appearance.emissive ? 1.3 : 1) * Math.max(0.5, 1 - step * 0.06);
        put(canvas, (across - acrossMin) * scale, (b.maxY - y) * scale, scale, applyBiomeTint(appearance.color, block, grid.biomeAt(wx!, wz!)), shade);
        break;
      }
    }
  }
  return canvas;
}
