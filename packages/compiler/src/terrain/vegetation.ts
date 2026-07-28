/**
 * `scatter.forest@0` — deterministic tree placement and tree templates.
 *
 * Placement is a **position-keyed jittered-grid Poisson-disk**: the region is
 * tiled with `spacing`-wide cells, each cell offers one candidate at a
 * hash-jittered position, and candidates are accepted in row-major order
 * subject to a 2-D occupancy mask. That gives Poisson-disk's minimum-spacing
 * guarantee while keeping every decision a pure function of the tree's own
 * coordinates — no sequential RNG, so the forest is identical however the
 * region is traversed.
 *
 * Occupancy is checked against the **canopy footprint**, not the trunk, so
 * canopies never interpenetrate.
 */

import {
  SurfaceClass,
  clamp01,
  columnFloat,
  fbm2,
  positionFloat,
  positionInt,
  positionWeighted,
  seed32,
  streamSeed,
  type Classification,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";
import type { ForestParams, ForestSpecies, ScatterArea, TreeShape } from "@terrainist/spec";
import { ZONE_TOKENS } from "@terrainist/spec";

import type { ColumnPlan } from "./columns.js";
import { FluidKind } from "./columns.js";
import type { Palette } from "./palette.js";

/** §7 defaults for `scatter.forest@0`. */
export const FOREST_DEFAULTS = Object.freeze({
  density: 0.15,
  spacing: 3,
  clumping: 0.4,
  maxSlope: 35,
  elevation: [1, 200] as readonly [number, number],
  edgeFalloff: 12,
});

/** Zone token → fractional centre, matching the stdlib's nine-grid. */
const ZONE_FRACTIONS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  center: [0.5, 0.5],
  north: [0.5, 1 / 6],
  south: [0.5, 5 / 6],
  east: [5 / 6, 0.5],
  west: [1 / 6, 0.5],
  northeast: [5 / 6, 1 / 6],
  northwest: [1 / 6, 1 / 6],
  southeast: [5 / 6, 5 / 6],
  southwest: [1 / 6, 5 / 6],
});

/** One placed tree. */
export interface TreePlacement {
  readonly nodeId: string;
  readonly speciesId: string;
  readonly shape: TreeShape;
  /** World coordinates of the trunk base (the first log, one above the ground). */
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  /** Trunk length in blocks. */
  readonly height: number;
  readonly trunkState: number;
  readonly leafState: number;
}

/** The outcome of the scatter pass. */
export interface ScatterResult {
  readonly trees: readonly TreePlacement[];
  /** Union of every forest node's eligibility mask — feeds the biome rule. */
  readonly coverage: Uint8Array;
  /** Trees placed per forest node id, for the report. */
  readonly perNode: Readonly<Record<string, number>>;
}

/** A forest node flattened to what the scatter pass needs. */
export interface ForestNodeInput {
  readonly id: string;
  readonly nodePath: string;
  readonly seed: Seed256;
  readonly params: ForestParams;
}

/** Fill in `scatter.forest@0` defaults. */
export function resolveForestParams(params: ForestParams): Required<
  Pick<ForestParams, "density" | "spacing" | "clumping" | "maxSlope" | "edgeFalloff">
> & { elevation: readonly [number, number]; area: ScatterArea } {
  return {
    density: params.density ?? FOREST_DEFAULTS.density,
    spacing: params.spacing ?? FOREST_DEFAULTS.spacing,
    clumping: params.clumping ?? FOREST_DEFAULTS.clumping,
    maxSlope: params.maxSlope ?? FOREST_DEFAULTS.maxSlope,
    edgeFalloff: params.edgeFalloff ?? FOREST_DEFAULTS.edgeFalloff,
    elevation: params.elevation ?? FOREST_DEFAULTS.elevation,
    area: params.area ?? { all: true },
  };
}

/**
 * Build the eligibility mask of one forest node: 1 where a tree may stand.
 *
 * A column is eligible when it is soil (not cliff, beach, ocean floor or snow
 * cap), dry, gentle enough, inside the node's coarse `area`, and within the
 * elevation band relative to sea level.
 */
export function forestEligibility(
  plan: ColumnPlan,
  classification: Classification,
  params: ReturnType<typeof resolveForestParams>,
): Uint8Array {
  const { region, ground, fluidKind, seaLevel } = plan;
  const mask = new Uint8Array(region.width * region.depth);
  const area = areaTest(region, params.area);
  const [eMin, eMax] = params.elevation;

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (classification.classes[idx] !== SurfaceClass.SOIL) continue;
      if (fluidKind[idx] !== FluidKind.NONE) continue;
      if ((classification.slopes[idx] as number) > params.maxSlope) continue;
      const relative = (ground[idx] as number) - seaLevel;
      if (relative < eMin || relative > eMax) continue;
      if (!area(region.x0 + i, z)) continue;
      mask[idx] = 1;
    }
  }
  return mask;
}

/** Run every forest node's scatter, in document order. */
export function scatterForests(
  nodes: readonly ForestNodeInput[],
  plan: ColumnPlan,
  classification: Classification,
  palette: Palette,
): ScatterResult {
  const { region } = plan;
  const coverage = new Uint8Array(region.width * region.depth);
  // Canopy footprints already claimed, shared across nodes so a wilderness
  // fill cannot grow into a deliberate forest's canopy.
  const occupancy = new Uint8Array(region.width * region.depth);
  const trees: TreePlacement[] = [];
  const perNode: Record<string, number> = {};

  for (const node of nodes) {
    const params = resolveForestParams(node.params);
    const mask = forestEligibility(plan, classification, params);
    for (let k = 0; k < coverage.length; k++) if (mask[k] === 1) coverage[k] = 1;
    const before = trees.length;
    scatterOne(node, params, plan, mask, occupancy, palette, trees);
    perNode[node.id] = trees.length - before;
  }

  return { trees, coverage, perNode };
}

function scatterOne(
  node: ForestNodeInput,
  params: ReturnType<typeof resolveForestParams>,
  plan: ColumnPlan,
  mask: Uint8Array,
  occupancy: Uint8Array,
  palette: Palette,
  out: TreePlacement[],
): void {
  const { region, ground } = plan;
  const scatter = streamSeed(node.seed, "scatter");
  const clumpSeed = seed32(streamSeed(node.seed, "scatter.clump"));
  const spacing = Math.max(1, Math.floor(params.spacing));
  const species = node.params.species;
  const weights = species.map((s) => s.weight ?? 1);
  // The per-cell acceptance probability that reproduces `density` trees per
  // eligible column, capped at 1 (spacing itself then limits the density).
  const cellProbability = clamp01(params.density * spacing * spacing);

  const cellsX = Math.ceil(region.width / spacing);
  const cellsZ = Math.ceil(region.depth / spacing);

  for (let cz = 0; cz < cellsZ; cz++) {
    for (let cx = 0; cx < cellsX; cx++) {
      // Candidate position: cell origin plus a position-keyed jitter.
      const jx = positionFloat(scatter, cx, 1, cz);
      const jz = positionFloat(scatter, cx, 2, cz);
      const x = region.x0 + Math.min(region.width - 1, Math.floor(cx * spacing + jx * spacing));
      const z = region.z0 + Math.min(region.depth - 1, Math.floor(cz * spacing + jz * spacing));
      const idx = (z - region.z0) * region.width + (x - region.x0);
      if (mask[idx] !== 1) continue;

      let p = cellProbability;
      if (params.clumping > 0) {
        const n = fbm2(clumpSeed, x, z, { octaves: 2, frequency: 0.02, lacunarity: 2, gain: 0.5 });
        p *= 1 - params.clumping + params.clumping * 2 * clamp01(0.5 + 0.5 * n);
      }
      p *= edgeTaper(region, x, z, params.edgeFalloff);
      if (columnFloat(scatter, x, z, 3) >= p) continue;

      const pick = positionWeighted(scatter, x, 4, z, weights);
      const chosen = species[pick] as ForestSpecies;
      const template = TREE_TEMPLATES[chosen.shape];
      const minH = chosen.minHeight ?? template.minHeight;
      const maxH = chosen.maxHeight ?? template.maxHeight;
      const height = positionInt(scatter, x, 5, z, Math.min(minH, maxH), Math.max(minH, maxH));
      const radius = template.canopyRadius(height);

      if (!claim(region, occupancy, x, z, radius)) continue;

      out.push({
        nodeId: node.id,
        speciesId: chosen.id,
        shape: chosen.shape,
        x,
        z,
        baseY: (ground[idx] as number) + 1,
        height,
        trunkState: palette.state(chosen.trunkPalette ?? template.trunkSymbol),
        leafState: palette.state(chosen.leafPalette ?? template.leafSymbol),
      });
    }
  }
}

/** Density taper within `falloff` blocks of the region boundary. */
function edgeTaper(region: Region, x: number, z: number, falloff: number): number {
  if (falloff <= 0) return 1;
  const dx = Math.min(x - region.x0, region.x0 + region.width - 1 - x);
  const dz = Math.min(z - region.z0, region.z0 + region.depth - 1 - z);
  const d = Math.min(dx, dz);
  return d >= falloff ? 1 : clamp01(d / falloff);
}

/** Reserve a canopy footprint; false when it would overlap an existing one. */
function claim(
  region: Region,
  occupancy: Uint8Array,
  x: number,
  z: number,
  radius: number,
): boolean {
  const r = Math.max(0, Math.ceil(radius));
  const i0 = Math.max(0, x - r - region.x0);
  const i1 = Math.min(region.width - 1, x + r - region.x0);
  const j0 = Math.max(0, z - r - region.z0);
  const j1 = Math.min(region.depth - 1, z + r - region.z0);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (occupancy[j * region.width + i] === 1) return false;
    }
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      occupancy[j * region.width + i] = 1;
    }
  }
  return true;
}

/** A predicate over world coordinates for a coarse `area`. */
function areaTest(region: Region, area: ScatterArea): (x: number, z: number) => boolean {
  if ("all" in area) return () => true;
  if ("zone" in area) {
    const token = (ZONE_TOKENS as readonly string[]).includes(area.zone) ? area.zone : "center";
    const [fx, fz] = ZONE_FRACTIONS[token] as readonly [number, number];
    const cx = region.x0 + fx * region.width;
    const cz = region.z0 + fz * region.depth;
    // A zone is one cell of the nine-grid, with a soft half-cell margin.
    const halfX = region.width / 6;
    const halfZ = region.depth / 6;
    return (x, z) => Math.abs(x - cx) <= halfX && Math.abs(z - cz) <= halfZ;
  }
  const cx = region.x0 + area.at[0] * region.width;
  const cz = region.z0 + area.at[1] * region.depth;
  const r2 = area.radius * area.radius;
  return (x, z) => (x - cx) * (x - cx) + (z - cz) * (z - cz) <= r2;
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

/** One block of a generated tree, relative to the trunk base. */
export interface TreeBlock {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  /** `"log"` or `"leaves"`; the emitter maps it to the placement's states. */
  readonly part: "log" | "leaves";
}

/** A tree shape: trunk length range, default palette symbols, and geometry. */
export interface TreeTemplate {
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly trunkSymbol: string;
  readonly leafSymbol: string;
  /** Horizontal canopy radius for a given trunk height. */
  canopyRadius(height: number): number;
  /** The blocks of one tree, trunk base at the origin. */
  blocks(height: number): TreeBlock[];
}

function conifer(spread: number): (height: number) => TreeBlock[] {
  return (height) => {
    const out: TreeBlock[] = [];
    for (let dy = 0; dy < height; dy++) out.push({ dx: 0, dy, dz: 0, part: "log" });
    // Whorled conifer canopy: radius grows downward from the tip, dipping every
    // third layer so the silhouette reads as a spruce rather than a cone.
    const start = Math.max(1, Math.floor(height * 0.35));
    for (let dy = start; dy <= height; dy++) {
      const fromTop = height - dy;
      let r = Math.min(spread, Math.floor(fromTop / 2));
      if (fromTop % 3 === 2 && r > 0) r -= 1;
      if (r === 0) {
        if (dy >= height) out.push({ dx: 0, dy, dz: 0, part: "leaves" });
        continue;
      }
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && dy < height) continue;
          if (dx * dx + dz * dz > r * r + r) continue;
          out.push({ dx, dy, dz, part: "leaves" });
        }
      }
    }
    out.push({ dx: 0, dy: height, dz: 0, part: "leaves" });
    return out;
  };
}

function blob(radius: number, squash: number): (height: number) => TreeBlock[] {
  return (height) => {
    const out: TreeBlock[] = [];
    for (let dy = 0; dy < height; dy++) out.push({ dx: 0, dy, dz: 0, part: "log" });
    const cy = height - 1;
    const ry = Math.max(1, Math.round(radius * squash));
    for (let dy = cy - ry; dy <= cy + ry; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dz === 0 && dy < height) continue;
          const vy = (dy - cy) / ry;
          if ((dx * dx + dz * dz) / (radius * radius) + vy * vy > 1.15) continue;
          out.push({ dx, dy, dz, part: "leaves" });
        }
      }
    }
    return out;
  };
}

/** The four tree shapes the terrain profile implements. */
export const TREE_TEMPLATES: Readonly<Record<TreeShape, TreeTemplate>> = Object.freeze({
  spruce_tall: {
    minHeight: 8,
    maxHeight: 13,
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    canopyRadius: () => 2,
    blocks: conifer(2),
  },
  spruce_squat: {
    minHeight: 5,
    maxHeight: 7,
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    canopyRadius: () => 3,
    blocks: conifer(3),
  },
  oak_round: {
    minHeight: 5,
    maxHeight: 7,
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.oak_leaves",
    canopyRadius: () => 2,
    blocks: blob(2, 1),
  },
  birch_slim: {
    minHeight: 6,
    maxHeight: 9,
    trunkSymbol: "wood.birch_log",
    leafSymbol: "wood.birch_leaves",
    canopyRadius: () => 2,
    blocks: blob(2, 0.75),
  },
});
