/**
 * The column plan — the compiler's intermediate voxel model.
 *
 * A terrain-profile world is *columnar*: every column is bedrock, then stone,
 * then an optional soil band, then one surface block, then optionally fluid up
 * to a fluid surface, then optionally a snow layer. Nothing else. Holding that
 * as eight typed arrays instead of a 512×512×384 voxel grid keeps a full
 * fjords compile inside a few tens of megabytes, and it makes the fluid
 * validator exact rather than approximate: "is this fluid block next to air?"
 * is answerable from the neighbouring columns' tops alone.
 */

import type { BasinWater, CalderaMask, Classification, HeightField, Region } from "@terrainist/stdlib";
import { SurfaceClass } from "@terrainist/stdlib";

import type { Palette } from "./palette.js";
import { WORLD_MIN_Y } from "../emit/prismarine.js";

/** Fluid kinds stored per column. */
export const FluidKind = Object.freeze({ NONE: 0, WATER: 1, LAVA: 2 } as const);

/** Highest block a world can hold. */
export const WORLD_MAX_Y = 319;

/** The per-column materialization plan for a whole region. */
export interface ColumnPlan {
  readonly region: Region;
  /** Y of the topmost solid block. */
  readonly ground: Int32Array;
  /** Y of the topmost fluid block, or `ground` when the column has no fluid. */
  readonly fluidTop: Int32Array;
  /** {@link FluidKind}. */
  readonly fluidKind: Uint8Array;
  /** Block state of the topmost solid block. */
  readonly surface: Int32Array;
  /** Block state of the soil band directly under the surface. */
  readonly subsurface: Int32Array;
  /** Thickness of that soil band, in blocks. */
  readonly soil: Uint8Array;
  /** 1 when a snow layer sits on the surface. */
  readonly snow: Uint8Array;
  /** Resolved biome id per column. */
  readonly biome: Uint16Array;
  /** Sea level, carried for the emitter and validators. */
  readonly seaLevel: number;
  /** Block state of bedrock / stone / fluids, resolved once. */
  readonly states: {
    readonly bedrock: number;
    readonly stone: number;
    readonly water: number;
    readonly lava: number;
    readonly snowLayer: number;
  };
}

/** Everything {@link buildColumnPlan} reads. */
export interface ColumnPlanInput {
  readonly field: HeightField;
  readonly classification: Classification;
  readonly palette: Palette;
  readonly seaLevel: number;
  readonly soilDepth: number;
  readonly calderas: readonly CalderaMask[];
  readonly basins: readonly BasinWater[];
}

/**
 * Turn the classified heightfield into a column plan.
 *
 * Surface selection follows the profile's symbol table; every symbol is
 * resolved *at the column*, so a `mix` palette (a black-sand beach, say)
 * varies block to block without any sequential RNG.
 */
export function buildColumnPlan(input: ColumnPlanInput): ColumnPlan {
  const { field, classification, palette, seaLevel, soilDepth } = input;
  const oceanMask = classification.oceanMask;
  const region = field.region;
  const n = region.width * region.depth;

  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const fluidKind = new Uint8Array(n);
  const surface = new Int32Array(n);
  const subsurface = new Int32Array(n);
  const soil = new Uint8Array(n);
  const snow = new Uint8Array(n);
  const biome = new Uint16Array(n);

  const states = {
    bedrock: palette.state("ground.bedrock"),
    stone: palette.state("ground.stone"),
    water: palette.state("liquid.water"),
    lava: palette.state("liquid.lava"),
    snowLayer: palette.state("foliage.snow_layer"),
  };

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      const idx = j * region.width + i;
      const y = clampY(Math.floor(field.values[idx] as number));
      ground[idx] = y;
      fluidTop[idx] = y;

      switch (classification.classes[idx]) {
        case SurfaceClass.UNDERWATER:
          surface[idx] = palette.stateAt("ground.underwater", x, z);
          subsurface[idx] = states.stone;
          soil[idx] = 0;
          break;
        case SurfaceClass.BEACH:
        // A lake shore gets the beach material for now; T2 (materials) is where
        // the two diverge.
        case SurfaceClass.LAKESHORE:
          surface[idx] = palette.stateAt("ground.beach", x, z);
          subsurface[idx] = palette.stateAt("ground.beach", x, z);
          soil[idx] = Math.min(255, soilDepth);
          break;
        case SurfaceClass.CLIFF:
          surface[idx] = palette.stateAt("ground.cliff", x, z);
          subsurface[idx] = states.stone;
          soil[idx] = 0;
          break;
        case SurfaceClass.SNOW:
          surface[idx] = palette.stateAt("ground.peak", x, z);
          subsurface[idx] = states.stone;
          soil[idx] = 0;
          snow[idx] = 1;
          break;
        default:
          surface[idx] = palette.stateAt("ground.surface", x, z);
          subsurface[idx] = palette.stateAt("ground.subsurface", x, z);
          soil[idx] = Math.min(255, soilDepth);
          break;
      }

      // Sea water goes only where the sea can reach: the classification's ocean
      // mask, not a blanket "below sea level". A landlocked gorge floor stays
      // dry however deep it is cut.
      if (oceanMask[idx] === 1) {
        fluidKind[idx] = FluidKind.WATER;
        fluidTop[idx] = seaLevel;
        snow[idx] = 0;
      }
    }
  }

  const plan: ColumnPlan = {
    region,
    ground,
    fluidTop,
    fluidKind,
    surface,
    subsurface,
    soil,
    snow,
    biome,
    seaLevel,
    states,
  };

  for (const basin of input.basins) {
    if (basin.waterY === null) continue;
    settleFluidPool(plan, basin.columns, basin.waterY, FluidKind.WATER);
  }
  for (const caldera of input.calderas) {
    if (!caldera.lava) continue;
    settleFluidPool(plan, caldera.columns, Math.floor(caldera.lavaY), FluidKind.LAVA);
  }

  return plan;
}

/**
 * Fill a bounded pool to `level`, then **erode it until it cannot flow**.
 *
 * A candidate column drops out when a horizontal neighbour is neither in the
 * pool nor solid up to `level` — which would leave a fluid block with an air
 * face. Removing a column can expose its neighbours, so the erosion runs to a
 * fixed point. This is what makes caldera lava and basin water settle-safe by
 * construction instead of by hope.
 */
export function settleFluidPool(
  plan: ColumnPlan,
  columns: Int32Array,
  level: number,
  kind: number,
): number {
  const { region, ground, fluidTop, fluidKind } = plan;
  const n = region.width * region.depth;
  const inPool = new Uint8Array(n);
  const candidates: number[] = [];
  for (const idx of columns) {
    if (idx < 0 || idx >= n) continue;
    if ((ground[idx] as number) >= level) continue;
    inPool[idx] = 1;
    candidates.push(idx);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const idx of candidates) {
      if (inPool[idx] === 0) continue;
      const i = idx % region.width;
      const j = (idx - i) / region.width;
      if (
        leaks(i - 1, j) ||
        leaks(i + 1, j) ||
        leaks(i, j - 1) ||
        leaks(i, j + 1)
      ) {
        inPool[idx] = 0;
        changed = true;
      }
    }
  }

  let filled = 0;
  for (const idx of candidates) {
    if (inPool[idx] === 0) continue;
    fluidKind[idx] = kind;
    fluidTop[idx] = level;
    plan.snow[idx] = 0;
    filled++;
  }
  return filled;

  /** True when `(i, j)` would let the pool spill: in-region, not pooled, not solid. */
  function leaks(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return false;
    const idx = j * region.width + i;
    if (inPool[idx] === 1) return false;
    const top = Math.max(ground[idx] as number, (fluidTop[idx] as number));
    return top < level;
  }
}

/** Clamp a field height into the emittable world. */
export function clampY(y: number): number {
  if (y < WORLD_MIN_Y + 1) return WORLD_MIN_Y + 1;
  if (y > WORLD_MAX_Y) return WORLD_MAX_Y;
  return y;
}
