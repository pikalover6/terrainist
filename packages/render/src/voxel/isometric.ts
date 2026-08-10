/**
 * Vendored 2026-07-27 from the mcai prototype (packages/voxel-renderer);
 * carried over as proven code per docs/DESIGN.md.
 */

import { Canvas } from "./canvas.js";
import { VoxelGrid, type GridBounds } from "./grid.js";
import { applyBiomeTint } from "../biome-tint.js";
import { appearanceOf, isRenderAir, type BlockAppearance } from "./palette.js";

/**
 * Isometric voxel rasterizer.
 *
 * The projection is the classic 2:1 dimetric one:
 *
 *   px = (x - z) * s
 *   py = (x + z) * s/2 - y * s
 *
 * The world direction (1,1,1) projects to (0,0), so the camera looks straight
 * down the +x/+y/+z diagonal. That single fact makes the whole renderer exact
 * and cheap: cells that differ by (t,t,t) project onto the *same* hexagon, and
 * cells on different rays project onto *disjoint* hexagons (the projection of
 * the cubic lattice is a hexagonal tiling). So
 *
 *   - a cell is hidden exactly when the cell in front of it on its own ray,
 *     (x+1, y+1, z+1), is opaque — one neighbour test, no z-buffer; and
 *   - drawing in ascending y (then z, then x) is a correct painter's order,
 *     because on any ray the nearer cell has the larger y.
 */

/** Which world corner the camera sits over. */
export type IsoCorner = "east-south" | "east-north" | "west-south" | "west-north";

export interface IsoOptions {
  /** Pixels per block half-width. A cube sprite is 2*scale wide and 2*scale tall. */
  scale?: number;
  /** Skip cells outside this sub-box (used for cutaways). */
  clip?: (x: number, y: number, z: number) => boolean;
  background?: [number, number, number, number];
  /** Darken enclosed blocks so interiors read as interiors. Default true. */
  ambientOcclusion?: boolean;
  /** Deterministic per-cell brightness jitter, 0..1. Default 0.05. */
  grain?: number;
  /** Cap on the output edge in pixels; the scale is reduced to fit. */
  maxEdge?: number;
}

const FACE_SHADE = { top: 1, right: 0.7, front: 0.86 } as const;

interface Sprite {
  size: number;
  /** 0 = outside, 1 = top, 2 = +x face, 3 = +z face. */
  face: Uint8Array;
}

const spriteCache = new Map<number, Sprite>();

function cubeSprite(scale: number): Sprite {
  const cached = spriteCache.get(scale);
  if (cached) return cached;
  const size = scale * 2;
  const face = new Uint8Array(size * size);
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      // Sprite space: origin is the cube's top-back corner, at (scale, 0).
      const sx = u - scale + 0.5;
      const sy = v + 0.5;
      if (Math.abs(sx) / scale + Math.abs(sy - scale / 2) / (scale / 2) <= 1) {
        face[v * size + u] = 1;
      } else if (sx >= 0 && sx <= scale && sy >= scale - sx / 2 && sy <= 2 * scale - sx / 2) {
        face[v * size + u] = 2;
      } else if (sx <= 0 && sx >= -scale && sy >= scale + sx / 2 && sy <= 2 * scale + sx / 2) {
        face[v * size + u] = 3;
      }
    }
  }
  const sprite = { size, face };
  spriteCache.set(scale, sprite);
  return sprite;
}

/**
 * A view of a grid with the horizontal axes remapped so any of the four world
 * corners can act as the camera, without copying the voxels.
 */
class CornerView {
  readonly minU: number;
  readonly maxU: number;
  readonly minW: number;
  readonly maxW: number;

  constructor(private readonly grid: VoxelGrid, private readonly corner: IsoCorner) {
    const b = grid.bounds;
    const flipU = corner === "west-south" || corner === "west-north";
    const flipW = corner === "east-north" || corner === "west-north";
    this.minU = flipU ? -b.maxX : b.minX;
    this.maxU = flipU ? -b.minX : b.maxX;
    this.minW = flipW ? -b.maxZ : b.minZ;
    this.maxW = flipW ? -b.minZ : b.maxZ;
  }

  /** Map view coordinates back to world coordinates. */
  world(u: number, w: number): [number, number] {
    const flipU = this.corner === "west-south" || this.corner === "west-north";
    const flipW = this.corner === "east-north" || this.corner === "west-north";
    return [flipU ? -u : u, flipW ? -w : w];
  }

  indexAt(u: number, y: number, w: number): number {
    const [x, z] = this.world(u, w);
    return this.grid.indexAt(x, y, z);
  }
}

export function renderIsometric(grid: VoxelGrid, corner: IsoCorner = "east-south", options: IsoOptions = {}): Canvas {
  const view = new CornerView(grid, corner);
  const b = grid.bounds;
  const grain = options.grain ?? 0.05;
  const ao = options.ambientOcclusion ?? true;

  const spanU = view.maxU - view.minU + 1;
  const spanW = view.maxW - view.minW + 1;
  const spanY = b.maxY - b.minY + 1;

  let scale = options.scale ?? 4;
  const maxEdge = options.maxEdge ?? 4096;
  while (scale > 1) {
    const width = (spanU + spanW) * scale;
    const height = (spanU + spanW) * (scale / 2) + spanY * scale + 2 * scale;
    if (Math.max(width, height) <= maxEdge) break;
    scale -= 1;
  }

  const sprite = cubeSprite(scale);
  const thinScale = Math.max(1, Math.round(scale * 0.62));
  const thinSprite = cubeSprite(thinScale);
  const width = Math.ceil((spanU + spanW) * scale) + 2;
  const height = Math.ceil((spanU + spanW) * (scale / 2) + spanY * scale) + 2 * scale + 2;
  const canvas = new Canvas(width, height, options.background ?? [16, 18, 22, 255]);

  // px = (u - w) * scale + offsetX ; py = (u + w) * scale/2 - y * scale + offsetY
  const offsetX = -(view.minU - view.maxW) * scale + 1;
  const offsetY = -(view.minU + view.minW) * (scale / 2) + b.maxY * scale + 1;

  const appearances = grid.palette.map((block) => (isRenderAir(block) ? undefined : appearanceOf(block)));
  const opaque = grid.palette.map((block, index) => {
    const appearance = appearances[index];
    return appearance !== undefined && (appearance.alpha ?? 1) >= 1 && !appearance.thin;
  });
  const drawScale = grid.palette.map((block, index) => {
    const appearance = appearances[index];
    if (!appearance?.thin) return 1;
    // Stairs and slabs are architecture, not decoration: drawing them full size
    // keeps roofs and floors readable. Everything else genuinely thin shrinks.
    return /_stairs$|_slab$/.test(block) ? 1 : 0.62;
  });

  for (let y = b.minY; y <= b.maxY; y++) {
    for (let w = view.minW; w <= view.maxW; w++) {
      for (let u = view.minU; u <= view.maxU; u++) {
        const index = view.indexAt(u, y, w);
        if (index === 0) continue;
        const appearance = appearances[index];
        if (appearance === undefined) continue;
        const [wx, wz] = view.world(u, w);
        if (options.clip && !options.clip(wx, y, wz)) continue;
        // Exact hidden-cell removal: the only cell that can cover this one is
        // the next cell along the view ray.
        const front = view.indexAt(u + 1, y + 1, w + 1);
        if (opaque[front]) {
          const [fx, fz] = view.world(u + 1, w + 1);
          if (!options.clip || options.clip(fx, y + 1, fz)) continue;
        }

        const px = Math.round((u - w) * scale + offsetX);
        const py = Math.round((u + w) * (scale / 2) - y * scale + offsetY);
        const shade = shadeOf(view, u, y, w, opaque, ao);
        const grainOf = jitter(wx, y, wz, grain);
        const color = grid.hasBiomes
          ? applyBiomeTint(appearance.color, grid.palette[index]!, grid.biomeAt(wx, wz))
          : appearance.color;
        if (drawScale[index] === 1) {
          drawCube(canvas, sprite, px, py, appearance, shade, grainOf, color);
        } else {
          // Centre a smaller cube horizontally and rest it on the cell floor,
          // so plants, rails and panes read as detail sitting on their support.
          drawCube(canvas, thinSprite, px + (scale - thinScale), py + 2 * (scale - thinScale), appearance, shade, grainOf, color);
        }
      }
    }
  }
  return canvas;
}

/** Cheap ambient occlusion: how enclosed the three visible faces are. */
function shadeOf(view: CornerView, u: number, y: number, w: number, opaque: boolean[], enabled: boolean): { top: number; right: number; front: number } {
  if (!enabled) return { top: 1, right: 1, front: 1 };
  const covered = (du: number, dy: number, dw: number) => (opaque[view.indexAt(u + du, y + dy, w + dw)] ? 1 : 0);
  const top = 1 - 0.16 * (covered(1, 1, 0) + covered(0, 1, 1)) - 0.1 * covered(1, 1, 1);
  const right = 1 - 0.16 * (covered(1, 1, 0) + covered(1, 0, 1)) - 0.1 * covered(1, -1, 0);
  const front = 1 - 0.16 * (covered(0, 1, 1) + covered(1, 0, 1)) - 0.1 * covered(0, -1, 1);
  return { top: Math.max(0.45, top), right: Math.max(0.45, right), front: Math.max(0.45, front) };
}

/** Deterministic per-cell brightness variation so flat expanses show texture. */
function jitter(x: number, y: number, z: number, amount: number): number {
  if (amount <= 0) return 1;
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return 1 + ((h / 0xffffffff) * 2 - 1) * amount;
}

function drawCube(
  canvas: Canvas,
  sprite: Sprite,
  px: number,
  py: number,
  appearance: BlockAppearance,
  ao: { top: number; right: number; front: number },
  grain: number,
  override?: readonly [number, number, number],
): void {
  const alpha = appearance.alpha ?? 1;
  const emissiveBoost = appearance.emissive ? 1.35 : 1;
  const [r, g, b] = override ?? appearance.color;
  const size = sprite.size;

  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const face = sprite.face[v * size + u]!;
      if (face === 0) continue;
      const faceShade = face === 1 ? FACE_SHADE.top * ao.top : face === 2 ? FACE_SHADE.right * ao.right : FACE_SHADE.front * ao.front;
      const shade = faceShade * grain * emissiveBoost;
      canvas.blend(
        px + u,
        py + v,
        Math.min(255, Math.round(r * shade)),
        Math.min(255, Math.round(g * shade)),
        Math.min(255, Math.round(b * shade)),
        alpha,
      );
    }
  }
}

/** Render only the part of the grid on one side of a cut, revealing interiors. */
export function cutawayClip(bounds: GridBounds, axis: "x" | "z", keep: "low" | "high", at?: number): (x: number, y: number, z: number) => boolean {
  const mid = axis === "x" ? at ?? Math.round((bounds.minX + bounds.maxX) / 2) : at ?? Math.round((bounds.minZ + bounds.maxZ) / 2);
  return (x, _y, z) => {
    const value = axis === "x" ? x : z;
    return keep === "low" ? value <= mid : value >= mid;
  };
}
