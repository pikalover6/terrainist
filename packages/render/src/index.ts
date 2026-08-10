/**
 * Headless rendering.
 *
 * Two paths, both pure Node with no native dependencies (headless-gl does not
 * build here, so anything WebGL-backed needs a browser host and stays out of
 * scope):
 *
 *  - {@link renderTopDown} — one orthographic PNG read straight off the region
 *    files; the cheap deterministic structural check for autonomous loops;
 *  - {@link worldToGrid} plus the vendored voxel renderer
 *    ({@link renderWorldViews}, {@link renderIsometric}, …) — the multi-angle
 *    set for render critique.
 */

import type { LoamDocument } from "@terrainist/spec";

export { biomeNamesById } from "./biome-registry.js";
export {
  BIOME_TINTS,
  DEFAULT_TINT,
  applyBiomeTint,
  biomeTint,
  tintKindOf,
} from "./biome-tint.js";
export type { BiomeTint, TintKind } from "./biome-tint.js";
export { blockColor, isAir } from "./block-colors.js";
export type { Rgb } from "./block-colors.js";

export { DEFAULT_SCALE, renderTopDown } from "./top-down.js";
export type { TopDownBounds, TopDownOptions, TopDownRender } from "./top-down.js";

export { worldToGrid } from "./world-grid.js";
export type { WorldToGridOptions } from "./world-grid.js";

/* The vendored mcai voxel renderer. Its orthographic top-down takes a grid, not
 * a world directory, so it is re-exported as `renderVoxelTopDown` to keep it
 * distinct from this package's world-level `renderTopDown`. */
export { Canvas, contactSheet } from "./voxel/canvas.js";
export { VoxelGrid } from "./voxel/grid.js";
export type { GridBounds } from "./voxel/grid.js";
export { cutawayClip, renderIsometric } from "./voxel/isometric.js";
export type { IsoCorner, IsoOptions } from "./voxel/isometric.js";
export {
  renderFloorPlan,
  renderSection,
  renderTopDown as renderVoxelTopDown,
} from "./voxel/orthographic.js";
export type { OrthoOptions } from "./voxel/orthographic.js";
export { BLOCK_APPEARANCE, DEFAULT_COLOR, appearanceOf, isRenderAir } from "./voxel/palette.js";
export type { BlockAppearance } from "./voxel/palette.js";
export { crop, renderStructureViews, renderWorldViews } from "./voxel/views.js";
export type { NamedView, WorldViewOptions } from "./voxel/views.js";

/** A single requested camera angle for a render. Placeholder shape. */
export interface RenderView {
  name: string;
}

/** Not implemented yet — deepslate multi-angle rendering needs a browser host. */
export function render(_document: LoamDocument, _views: RenderView[]): never {
  throw new Error("@terrainist/render: render() is not implemented yet");
}
