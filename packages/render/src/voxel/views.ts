/**
 * Vendored 2026-07-27 from the mcai prototype (packages/voxel-renderer);
 * carried over as proven code per docs/DESIGN.md.
 */

import { Canvas, contactSheet } from "./canvas.js";
import { VoxelGrid, type GridBounds } from "./grid.js";
import { cutawayClip, renderIsometric, type IsoCorner } from "./isometric.js";
import { renderFloorPlan, renderSection, renderTopDown } from "./orthographic.js";

export interface WorldViewOptions {
  /** Pixels per block half-width for isometric panels. */
  isoScale?: number;
  /** Pixels per block for orthographic panels. */
  orthoScale?: number;
  maxEdge?: number;
  /** Y below which content counts as underground, for the split views. */
  surfaceY?: number;
}

export interface NamedView {
  name: string;
  label: string;
  canvas: Canvas;
}

/**
 * The standard set of views for judging a whole world: four isometric corners,
 * a hill-shaded top-down map, an underground-only map, and two cutaways that
 * halve the world so interiors are visible.
 */
export function renderWorldViews(grid: VoxelGrid, options: WorldViewOptions = {}): NamedView[] {
  const iso = { scale: options.isoScale ?? 4, maxEdge: options.maxEdge ?? 2600 };
  const ortho = { scale: options.orthoScale ?? 4, maxEdge: options.maxEdge ?? 2600 };
  const bounds = grid.bounds;
  const views: NamedView[] = [];

  const corners: IsoCorner[] = ["east-south", "east-north", "west-north", "west-south"];
  for (const corner of corners) {
    views.push({ name: `iso-${corner}`, label: `iso ${corner}`, canvas: renderIsometric(grid, corner, iso) });
  }

  views.push({ name: "map-top", label: "top-down (hill-shaded)", canvas: renderTopDown(grid, ortho) });

  if (options.surfaceY !== undefined) {
    views.push({
      name: "map-underground",
      label: `underground (below y=${options.surfaceY})`,
      canvas: renderTopDown(grid, { ...ortho, ceiling: options.surfaceY }),
    });
  }

  const midX = Math.round((bounds.minX + bounds.maxX) / 2);
  const midZ = Math.round((bounds.minZ + bounds.maxZ) / 2);
  views.push({
    name: "cutaway-x",
    label: `cutaway x<=${midX}`,
    canvas: renderIsometric(grid, "east-south", { ...iso, clip: cutawayClip(bounds, "x", "low", midX) }),
  });
  views.push({
    name: "cutaway-z",
    label: `cutaway z<=${midZ}`,
    canvas: renderIsometric(grid, "east-south", { ...iso, clip: cutawayClip(bounds, "z", "low", midZ) }),
  });
  views.push({
    name: "section-z",
    label: `section along z=${midZ}`,
    canvas: renderSection(grid, "z", midZ - 2, midZ + 2, ortho),
  });
  views.push({
    name: "section-x",
    label: `section along x=${midX}`,
    canvas: renderSection(grid, "x", midX - 2, midX + 2, ortho),
  });

  return views;
}

/**
 * Close-up views of one structure: isometric from two corners, a cutaway
 * through its middle, a floor plan a little above its floor, and two sections.
 */
export function renderStructureViews(grid: VoxelGrid, structure: GridBounds, options: WorldViewOptions = {}): NamedView[] {
  const iso = { scale: options.isoScale ?? 8, maxEdge: options.maxEdge ?? 2000 };
  const ortho = { scale: options.orthoScale ?? 8, maxEdge: options.maxEdge ?? 2000 };
  const cropped = crop(grid, structure);
  const midX = Math.round((structure.minX + structure.maxX) / 2);
  const midZ = Math.round((structure.minZ + structure.maxZ) / 2);
  return [
    { name: "iso-east-south", label: "iso east-south", canvas: renderIsometric(cropped, "east-south", iso) },
    { name: "iso-west-north", label: "iso west-north", canvas: renderIsometric(cropped, "west-north", iso) },
    {
      name: "cutaway",
      label: `cutaway z<=${midZ}`,
      canvas: renderIsometric(cropped, "east-south", { ...iso, clip: cutawayClip(structure, "z", "low", midZ) }),
    },
    { name: "section-z", label: `section z=${midZ}`, canvas: renderSection(cropped, "z", midZ - 1, midZ + 1, ortho) },
    { name: "section-x", label: `section x=${midX}`, canvas: renderSection(cropped, "x", midX - 1, midX + 1, ortho) },
    {
      name: "plan",
      label: `plan y=${structure.minY + 2}`,
      canvas: renderFloorPlan(cropped, structure.minY + 2, ortho),
    },
  ];
}

/** A grid restricted to a sub-box, sharing nothing with the original. */
export function crop(grid: VoxelGrid, bounds: GridBounds): VoxelGrid {
  const clamped: GridBounds = {
    minX: Math.max(bounds.minX, grid.bounds.minX),
    minY: Math.max(bounds.minY, grid.bounds.minY),
    minZ: Math.max(bounds.minZ, grid.bounds.minZ),
    maxX: Math.min(bounds.maxX, grid.bounds.maxX),
    maxY: Math.min(bounds.maxY, grid.bounds.maxY),
    maxZ: Math.min(bounds.maxZ, grid.bounds.maxZ),
  };
  const out = new VoxelGrid(clamped);
  const remap = new Map<number, number>();
  for (let y = clamped.minY; y <= clamped.maxY; y++) {
    for (let z = clamped.minZ; z <= clamped.maxZ; z++) {
      for (let x = clamped.minX; x <= clamped.maxX; x++) {
        const index = grid.indexAt(x, y, z);
        if (index === 0) continue;
        let mapped = remap.get(index);
        if (mapped === undefined) {
          mapped = out.intern(grid.palette[index]!);
          remap.set(index, mapped);
        }
        out.setIndex(x, y, z, mapped);
      }
    }
  }
  return out;
}

export { contactSheet };
