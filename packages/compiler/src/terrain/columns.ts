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
 *
 * G2.5b adds the **materials** layer on top of that skeleton: volcanic banding
 * inside a volcano's footprint, frozen lava flows down its flanks, cliff-face
 * and scree rock detail, ocean-floor variation and lakeshore mud. Every one of
 * those is a per-column decision keyed on position, so the model never has to
 * be traversed in a particular order for the world to come out the same.
 */

import {
  PI,
  SurfaceClass,
  TAU,
  cos,
  fbm2,
  footprintHas,
  sin,
  stableFluidColumns,
  type BasinWater,
  type CalderaMask,
  type Classification,
  type FeatureFootprint,
  type HeightField,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";

import type { CavePlan } from "./caves.js";
import { clusterCell, materialCell } from "./cluster.js";
import { detailSeed, hash2, hash3i, hashInt } from "./detail.js";
import type { Palette } from "./palette.js";
import { WORLD_MIN_Y } from "../emit/prismarine.js";

/** Fluid kinds stored per column. */
export const FluidKind = Object.freeze({ NONE: 0, WATER: 1, LAVA: 2 } as const);

/** Highest block a world can hold. */
export const WORLD_MAX_Y = 319;

/** Y at and below which the stone body is pure deepslate. */
export const DEEPSLATE_BAND_LOW = -4;
/** Y at and above which the stone body is pure stone. */
export const DEEPSLATE_BAND_HIGH = 8;

/** Normalized height within a volcano footprint where the mid flank starts. */
export const VOLCANO_MID_BAND = 0.35;
/** Normalized height within a volcano footprint where the bare upper cone starts. */
export const VOLCANO_UPPER_BAND = 0.65;

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
  /** 1 inside a volcano footprint. */
  readonly volcanic: Uint8Array;
  /** 1 on the bare upper cone, rim and caldera — the `basalt_deltas` band. */
  readonly volcanicUpper: Uint8Array;
  /** 1 where a frozen lava flow was surfaced. */
  readonly lavaFlow: Uint8Array;
  /** 1 where a closed-basin pool submerges the column (fresh water). */
  readonly lakeMask: Uint8Array;
  /**
   * 1 where the sea reaches the column.
   *
   * Carried on the plan, not just on the classification, because the cave
   * pass's ocean keep-out is re-derived after the fact by a validator that has
   * the plan and nothing else.
   */
  readonly oceanMask: Uint8Array;
  /**
   * Interior air spans cut out of the stone body by `cave.carver@0`, or absent
   * when the document declares no cave node.
   *
   * This is the one field of the plan that is *filled in after construction*.
   * Caves are post-field and post-classification by design — they may not move
   * a surface, a biome or a fluid — so the pass that produces them needs a
   * finished plan to read, and the only thing it hands back is this.
   */
  caves?: CavePlan;
  /** Sea level, carried for the emitter and validators. */
  readonly seaLevel: number;
  /** Detail-stream seed for the emitter's deepslate blend band. */
  readonly stoneSeed: number;
  /** Block state of bedrock / stone / fluids, resolved once. */
  readonly states: {
    readonly bedrock: number;
    readonly stone: number;
    readonly deepslate: number;
    readonly water: number;
    readonly lava: number;
    readonly snowLayer: number;
    /** `minecraft:cave_air` — what a carved cave interval is filled with. */
    readonly caveAir: number;
  };
}

/** A volcano edit, as the materials pass needs it. */
export interface VolcanoInfo {
  readonly editId: string;
  /** `lavaFlows` param, already defaulted. */
  readonly lavaFlows: number;
  /** The edit's node seed, so its flow paths are reproducible. */
  readonly seed: Seed256;
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
  /** Per-edit footprints; volcano footprints drive the volcanic bands. */
  readonly footprints?: readonly FeatureFootprint[];
  /** Volcano edits, matched to footprints by `editId`. */
  readonly volcanoes?: readonly VolcanoInfo[];
  /** Root node seed; the materials detail streams hang off it. */
  readonly seed?: Seed256;
}

/** The materials pass's detail streams, derived once per compile. */
interface MaterialSeeds {
  readonly rock: number;
  readonly floor: number;
  readonly shore: number;
  readonly volcanic: number;
  readonly stone: number;
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
  const volcanic = new Uint8Array(n);
  const volcanicUpper = new Uint8Array(n);
  const lavaFlow = new Uint8Array(n);

  const seeds = materialSeeds(input.seed);

  const states = {
    bedrock: palette.state("ground.bedrock"),
    stone: palette.state("ground.stone"),
    deepslate: palette.state("ground.deepslate"),
    water: palette.state("liquid.water"),
    lava: palette.state("liquid.lava"),
    snowLayer: palette.state("foliage.snow_layer"),
    caveAir: palette.state("cave.air"),
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
          surface[idx] = oceanFloorState(palette, seeds, x, z);
          subsurface[idx] = states.stone;
          soil[idx] = 0;
          break;
        case SurfaceClass.BEACH:
          surface[idx] = palette.stateAt("ground.beach", x, z);
          subsurface[idx] = palette.stateAt("ground.beach", x, z);
          soil[idx] = Math.min(255, soilDepth);
          break;
        case SurfaceClass.LAKESHORE:
          // A lake shore is not a sea beach: wet mud, gravel and coarse dirt.
          surface[idx] = lakeshoreState(palette, seeds, x, z);
          subsurface[idx] = palette.stateAt("ground.subsurface", x, z);
          soil[idx] = Math.min(255, soilDepth);
          break;
        case SurfaceClass.CLIFF:
          surface[idx] = cliffState(palette, seeds, x, z);
          subsurface[idx] = states.stone;
          soil[idx] = 0;
          break;
        case SurfaceClass.SNOW:
          if (isDeepSnow(classification, idx, y)) {
            // Well above the snow line and near-flat: a snowfield reads as
            // packed snow, not one thin layer over grey rock.
            surface[idx] = palette.stateAt("ground.snow_block", x, z);
            subsurface[idx] = states.stone;
            soil[idx] = 0;
          } else {
            surface[idx] = palette.stateAt("ground.peak", x, z);
            subsurface[idx] = states.stone;
            soil[idx] = 0;
            snow[idx] = 1;
          }
          break;
        default:
          // Inland ground: a mixed ambient surface leaves its shoreline members
          // to the shore, which is painted from `ground.beach` two cases up.
          // Identity for every palette that does not mix sand into its soil —
          // see `SHORE_SURFACE_BLOCKS` in `palette.ts`.
          surface[idx] = palette.inlandStateAt("ground.surface", x, z);
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
    volcanic,
    volcanicUpper,
    lavaFlow,
    lakeMask: classification.lakeMask,
    oceanMask,
    seaLevel,
    stoneSeed: seeds.stone,
    states,
  };

  applyScree(plan, classification, palette, seeds);
  applyVolcanicBands(plan, input, seeds);
  applyLavaFlows(plan, input, seeds);

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

/* -------------------------------------------------------------------------- */
/* Materials                                                                   */
/* -------------------------------------------------------------------------- */

function materialSeeds(seed: Seed256 | undefined): MaterialSeeds {
  if (seed === undefined) {
    // Hand-built plans in tests may omit the seed; a fixed constant keeps them
    // deterministic without pretending to be seed-derived.
    return { rock: 1, floor: 2, shore: 3, volcanic: 4, stone: 5 };
  }
  return {
    rock: detailSeed(seed, "materials.rock"),
    floor: detailSeed(seed, "materials.floor"),
    shore: detailSeed(seed, "materials.shore"),
    volcanic: detailSeed(seed, "materials.volcanic"),
    stone: detailSeed(seed, "materials.stone"),
  };
}

/**
 * Cliff faces: mostly the cliff symbol, with andesite and tuff intrusions.
 *
 * The *strata* come from a low-frequency field, so they are already connected
 * patches. The **mix draw inside a symbol** is not: a document that declares
 * `ground.cliff` as a mix would otherwise get an independent draw per column,
 * and a face is seen edge-on, so that reads as static rather than as rock. The
 * symbol is therefore sampled at the cluster lattice — a no-op for the single-
 * block defaults, and connected patches for a mix. The field itself keeps the
 * column's true coordinates: quantizing it would put a staircase outline round
 * every stratum.
 */
function cliffState(palette: Palette, seeds: MaterialSeeds, x: number, z: number): number {
  const n = fbm2(seeds.rock, x, z, { octaves: 2, frequency: 0.012, lacunarity: 2, gain: 0.5 });
  // A cliff column is steep by construction, so no relief test is needed here.
  const s = clusterCell(x, z);
  if (n > 0.3) return palette.stateAt("ground.andesite", s.x, s.z);
  if (n < -0.34) return palette.stateAt("ground.tuff", s.x, s.z);
  return palette.stateAt("ground.cliff", s.x, s.z);
}

/** Ocean floor: gravel with drifting sand and clay patches. */
function oceanFloorState(palette: Palette, seeds: MaterialSeeds, x: number, z: number): number {
  const n = fbm2(seeds.floor, x, z, { octaves: 2, frequency: 0.02, lacunarity: 2, gain: 0.5 });
  if (n > 0.22) return palette.stateAt("ground.sand", x, z);
  if (n < -0.38) return palette.stateAt("ground.clay", x, z);
  return palette.stateAt("ground.underwater", x, z);
}

/** Lakeshore: a wet band of mud, gravel and coarse dirt. */
function lakeshoreState(palette: Palette, seeds: MaterialSeeds, x: number, z: number): number {
  const r = hash2(seeds.shore, x, z, 1);
  if (r < 0.4) return palette.stateAt("ground.mud", x, z);
  if (r < 0.75) return palette.stateAt("ground.gravel", x, z);
  return palette.stateAt("ground.coarse_dirt", x, z);
}

/**
 * True when a snow column is high and flat enough to be a solid snowfield.
 *
 * A single `snow` layer over grey rock is what a *dusting* looks like; the
 * plateaus well above the snow line should read as packed snow instead.
 */
function isDeepSnow(classification: Classification, idx: number, y: number): boolean {
  const span = classification.maxHeight - classification.snowLine;
  if (span <= 0) return false;
  return (classification.slopes[idx] as number) < 8 && y >= classification.snowLine + 0.3 * span;
}

/**
 * Scree: the rubble apron at the foot of a cliff run.
 *
 * A column qualifies when it is ordinary ground on a moderate slope with a
 * distinctly higher cliff column within three blocks — i.e. it sits *below* a
 * face rather than on one.
 */
function applyScree(
  plan: ColumnPlan,
  classification: Classification,
  palette: Palette,
  seeds: MaterialSeeds,
): void {
  const { region, ground, surface, soil, fluidKind } = plan;
  const { classes, slopes } = classification;
  const reach = 3;

  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (classes[idx] !== SurfaceClass.SOIL) continue;
      if (fluidKind[idx] !== FluidKind.NONE) continue;
      const slope = slopes[idx] as number;
      if (slope < 12) continue;
      const y = ground[idx] as number;

      let foot = false;
      for (let dj = -reach; dj <= reach && !foot; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= region.depth) continue;
        for (let di = -reach; di <= reach; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= region.width) continue;
          const other = jj * region.width + ii;
          if (classes[other] !== SurfaceClass.CLIFF) continue;
          if ((ground[other] as number) - y < 3) continue;
          foot = true;
          break;
        }
      }
      if (!foot) continue;

      const x = region.x0 + i;
      const z = region.z0 + j;
      // Scree sits by definition on a face, and a face is seen edge-on: an
      // independent draw per column reads as static, not as rubble. Sample the
      // same hash at the cluster lattice so the gravel, cobble and bare rock
      // arrive in connected patches. Gentle scree keeps its per-column draw.
      const s = materialCell(region, ground, x, z);
      const r = hash2(seeds.rock, s.x, s.z, 7);
      surface[idx] =
        r < 0.45
          ? palette.stateAt("ground.gravel", s.x, s.z)
          : r < 0.8
            ? palette.stateAt("ground.cobblestone", s.x, s.z)
            : palette.stateAt("ground.stone", s.x, s.z);
      soil[idx] = 0;
    }
  }
}

/**
 * Elevation-banded volcanic materials inside every volcano footprint.
 *
 * The band is normalized over the footprint's own height range, so it tracks the
 * cone rather than the world: the lower flank keeps its biome surface with
 * basalt breaking through, the mid flank is basalt/blackstone/gravel, and the
 * upper cone, rim and caldera walls are bare blackstone and basalt with
 * occasional magma glow. Nothing on the upper half of a cone is ever grass.
 */
function applyVolcanicBands(plan: ColumnPlan, input: ColumnPlanInput, seeds: MaterialSeeds): void {
  const footprints = (input.footprints ?? []).filter((fp) => fp.verb === "volcano");
  if (footprints.length === 0) return;
  const { region, ground, surface, subsurface, soil, snow, volcanic, volcanicUpper, fluidKind } = plan;
  const { palette } = input;
  const n = region.width * region.depth;

  for (const fp of footprints) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let idx = 0; idx < n; idx++) {
      if (!footprintHas(fp, idx)) continue;
      const y = ground[idx] as number;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    if (!Number.isFinite(lo) || hi <= lo) continue;

    const caldera = (input.calderas ?? []).find((c) => c.editId === fp.editId);
    const inCaldera = new Uint8Array(n);
    if (caldera !== undefined) {
      for (const idx of caldera.columns) {
        if (idx >= 0 && idx < n) inCaldera[idx] = 1;
      }
    }

    for (let idx = 0; idx < n; idx++) {
      if (!footprintHas(fp, idx)) continue;
      volcanic[idx] = 1;
      if (fluidKind[idx] !== FluidKind.NONE) continue;

      const i = idx % region.width;
      const x = region.x0 + i;
      const z = region.z0 + (idx - i) / region.width;
      const t = ((ground[idx] as number) - lo) / (hi - lo);
      const patch = fbm2(seeds.volcanic, x, z, {
        octaves: 3,
        frequency: 0.03,
        lacunarity: 2,
        gain: 0.5,
      });

      if (inCaldera[idx] === 1 || t >= VOLCANO_UPPER_BAND) {
        surface[idx] = burntState(palette, seeds, x, z, patch, true);
        subsurface[idx] = palette.stateAt("ground.basalt", x, z);
        soil[idx] = 0;
        snow[idx] = 0;
        volcanicUpper[idx] = 1;
      } else if (t >= VOLCANO_MID_BAND) {
        const r = hash2(seeds.volcanic, x, z, 11);
        surface[idx] =
          r < 0.45
            ? palette.stateAt("ground.basalt", x, z)
            : r < 0.78
              ? palette.stateAt("ground.blackstone", x, z)
              : palette.stateAt("ground.gravel", x, z);
        subsurface[idx] = palette.stateAt("ground.basalt", x, z);
        soil[idx] = 0;
        snow[idx] = 0;
        // The top half of the cone is bare rock, whatever the slope says.
        if (t >= 0.5) volcanicUpper[idx] = 1;
      } else if (patch > 0.1) {
        // Lower flank: the biome surface, cracked by basalt patches.
        surface[idx] = palette.stateAt("ground.basalt", x, z);
        subsurface[idx] = palette.stateAt("ground.basalt", x, z);
        soil[idx] = 0;
        snow[idx] = 0;
      }
    }
  }
}

/** Blackstone/basalt with sporadic magma glow — the burnt upper-cone surface. */
function burntState(
  palette: Palette,
  seeds: MaterialSeeds,
  x: number,
  z: number,
  patch: number,
  allowMagma: boolean,
): number {
  if (allowMagma && hash2(seeds.volcanic, x, z, 3) < 0.035) {
    return palette.stateAt("ground.magma", x, z);
  }
  return patch > 0
    ? palette.stateAt("ground.blackstone", x, z)
    : palette.stateAt("ground.basalt", x, z);
}

/**
 * Frozen lava flows: seeded rim starts, steepest descent, surfaced in magma and
 * cooled rock.
 *
 * Real lava is never placed along the run — a flow that could move is exactly
 * the unstable fluid the profile forbids. Where a flow bottoms out in a closed
 * pocket, {@link settleFluidPool} is asked for a one-column pool; the settle
 * logic erodes it away unless the pocket really is enclosed, so the invariant
 * holds by construction rather than by inspection.
 */
function applyLavaFlows(plan: ColumnPlan, input: ColumnPlanInput, seeds: MaterialSeeds): void {
  const volcanoes = (input.volcanoes ?? []).filter((v) => v.lavaFlows > 0);
  if (volcanoes.length === 0) return;
  const footprints = input.footprints ?? [];
  const { region, ground, surface, subsurface, soil, snow, lavaFlow, fluidKind } = plan;
  const { palette } = input;
  const height = input.field.values;
  const n = region.width * region.depth;

  for (const volcano of volcanoes) {
    const fp = footprints.find((f) => f.editId === volcano.editId && f.verb === "volcano");
    if (fp === undefined) continue;
    const caldera = (input.calderas ?? []).find((c) => c.editId === volcano.editId);

    // Footprint centre and extent, so a volcano without a caldera still has a
    // rim to spill from.
    let sumI = 0;
    let sumJ = 0;
    let count = 0;
    let summit = Number.NEGATIVE_INFINITY;
    for (let idx = 0; idx < n; idx++) {
      if (!footprintHas(fp, idx)) continue;
      const i = idx % region.width;
      sumI += i;
      sumJ += (idx - i) / region.width;
      count++;
      const y = ground[idx] as number;
      if (y > summit) summit = y;
    }
    if (count === 0) continue;
    const centerX = caldera?.centerX ?? region.x0 + Math.round(sumI / count);
    const centerZ = caldera?.centerZ ?? region.z0 + Math.round(sumJ / count);
    const rimRadius = Math.max(3, Math.round(caldera?.radius ?? Math.sqrt(count / PI) * 0.35));

    const flowSeed = detailSeed(volcano.seed, "lavaFlow");
    for (let k = 0; k < volcano.lavaFlows; k++) {
      // Seeded start angle: evenly spread, then jittered inside its own sector.
      const jitter = hash2(flowSeed, k, 0, 1);
      const angle = ((k + jitter) / volcano.lavaFlows) * TAU;
      const width = hashInt(flowSeed, k, 0, 2, 2, 4);
      // Find the rim crest along this bearing — the highest column on the ray —
      // and start one block *outside* it. Starting on the inner lip would send
      // every flow straight back down into the crater it came from.
      const dirX = cos(angle);
      const dirZ = sin(angle);
      let crest = rimRadius;
      let crestY = Number.NEGATIVE_INFINITY;
      for (let radius = Math.max(1, rimRadius - 4); radius <= rimRadius * 2 + 24; radius++) {
        const i = Math.round(centerX + dirX * radius) - region.x0;
        const j = Math.round(centerZ + dirZ * radius) - region.z0;
        if (i < 0 || j < 0 || i >= region.width || j >= region.depth) break;
        const idx = j * region.width + i;
        if (!footprintHas(fp, idx)) break;
        const y = ground[idx] as number;
        if (y > crestY) {
          crestY = y;
          crest = radius;
        }
      }
      let x = Math.round(centerX + dirX * (crest + 1));
      let z = Math.round(centerZ + dirZ * (crest + 1));

      const painted: number[] = [];
      const visited = new Set<number>();
      // Consecutive steps that had to push over a bump rather than run downhill.
      let stalled = 0;
      for (let step = 0; step < 2048; step++) {
        const i = x - region.x0;
        const j = z - region.z0;
        if (i < 0 || j < 0 || i >= region.width || j >= region.depth) break;
        const idx = j * region.width + i;
        if (!footprintHas(fp, idx)) break;
        if (fluidKind[idx] !== FluidKind.NONE) break;
        if (visited.has(idx)) break;
        visited.add(idx);

        paintFlow(fp, x, z, width, painted);

        // Steepest descent over the eight neighbours of the *unrounded* field —
        // integer column tops quantize a 0.9-per-block cone into ledges that
        // stop a flow after a dozen steps.
        let bestIdx = -1;
        let bestX = x;
        let bestZ = z;
        let bestDrop = 0;
        const here = height[idx] as number;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
            const other = jj * region.width + ii;
            if (visited.has(other)) continue;
            const drop = here - (height[other] as number);
            if (drop > bestDrop) {
              bestDrop = drop;
              bestIdx = other;
              bestX = region.x0 + ii;
              bestZ = region.z0 + jj;
            }
          }
        }

        if (bestIdx >= 0 && bestDrop >= 0.05) {
          stalled = 0;
          x = bestX;
          z = bestZ;
          continue;
        }

        // No descent here. A real flow tops small bumps and keeps going
        // outward; four such steps in a row means the ground really has
        // flattened, and the run ends.
        if (++stalled > 4) break;
        const stepX = Math.round(x + dirX);
        const stepZ = Math.round(z + dirZ);
        const si = stepX - region.x0;
        const sj = stepZ - region.z0;
        if (si < 0 || sj < 0 || si >= region.width || sj >= region.depth) break;
        const sidx = sj * region.width + si;
        if ((height[sidx] as number) - here > 1.5) break;
        x = stepX;
        z = stepZ;
      }

      // Lava only where the run ends in a genuinely enclosed pocket.
      if (painted.length > 0) {
        const last = painted[painted.length - 1] as number;
        if (isPocket(last)) {
          settleFluidPool(plan, Int32Array.from([last]), (ground[last] as number) + 1, FluidKind.LAVA);
        }
      }
    }
  }

  /** Paint one flow segment: a disk of `width` blocks of cooled crust. */
  function paintFlow(
    fp: FeatureFootprint,
    x: number,
    z: number,
    width: number,
    painted: number[],
  ): void {
    const r = Math.max(0, Math.floor(width / 2));
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (di * di + dj * dj > r * r + r) continue;
        const i = x + di - region.x0;
        const j = z + dj - region.z0;
        if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
        const idx = j * region.width + i;
        // A flow never spills outside the cone that fed it.
        if (!footprintHas(fp, idx)) continue;
        if (fluidKind[idx] !== FluidKind.NONE) continue;
        const px = region.x0 + i;
        const pz = region.z0 + j;
        const roll = hash2(seeds.volcanic, px, pz, 23);
        surface[idx] =
          roll < 0.18
            ? palette.stateAt("ground.magma", px, pz)
            : roll < 0.6
              ? palette.stateAt("ground.blackstone", px, pz)
              : palette.stateAt("ground.basalt", px, pz);
        subsurface[idx] = palette.stateAt("ground.basalt", px, pz);
        soil[idx] = 0;
        snow[idx] = 0;
        lavaFlow[idx] = 1;
        if (di === 0 && dj === 0) painted.push(idx);
      }
    }
  }

  /** True when every 4-neighbour of a column stands strictly higher. */
  function isPocket(idx: number): boolean {
    const i = idx % region.width;
    const j = (idx - i) / region.width;
    const here = ground[idx] as number;
    const neighbours = [
      [i - 1, j],
      [i + 1, j],
      [i, j - 1],
      [i, j + 1],
    ] as const;
    for (const [ii, jj] of neighbours) {
      if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) return false;
      if ((ground[jj * region.width + ii] as number) <= here) return false;
    }
    return true;
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Fill a bounded pool to `level`, then **erode it until it cannot flow**.
 *
 * The erosion itself is the stdlib's {@link stableFluidColumns} — shared with
 * the open-basin fill-level search, so a level that search accepts is a level
 * this function realizes. What is added here is the plan: neighbouring *fluid*
 * counts as filled ground, and the surviving columns get their blocks. This is
 * what makes caldera lava and basin water settle-safe by construction instead
 * of by hope.
 */
export function settleFluidPool(
  plan: ColumnPlan,
  columns: Int32Array,
  level: number,
  kind: number,
): number {
  const { region, ground, fluidTop, fluidKind } = plan;
  const { inPool } = stableFluidColumns({
    width: region.width,
    depth: region.depth,
    columns,
    level,
    floorAt: (idx) => ground[idx] as number,
    topAt: (idx) => Math.max(ground[idx] as number, fluidTop[idx] as number),
  });

  let filled = 0;
  for (const idx of columns) {
    if (idx < 0 || idx >= inPool.length || inPool[idx] === 0) continue;
    // See {@link POOL_NEVER_LOWERS}: a column already under a higher pool of
    // the same fluid keeps that surface; a second pool may only raise it.
    if (POOL_NEVER_LOWERS && fluidKind[idx] === kind && (fluidTop[idx] as number) > level) continue;
    fluidKind[idx] = kind;
    fluidTop[idx] = level;
    plan.snow[idx] = 0;
    filled++;
  }
  return filled;
}

/** Clamp a field height into the emittable world. */
export function clampY(y: number): number {
  if (y < WORLD_MIN_Y + 1) return WORLD_MIN_Y + 1;
  if (y > WORLD_MAX_Y) return WORLD_MAX_Y;
  return y;
}

/**
 * The stone body's block at one depth: deepslate low, stone high, and a
 * position-hashed blend between {@link DEEPSLATE_BAND_LOW} and
 * {@link DEEPSLATE_BAND_HIGH} so the two do not meet on a ruler-straight line.
 */
export function stoneBandState(
  states: ColumnPlan["states"],
  stoneSeed: number,
  x: number,
  y: number,
  z: number,
): number {
  if (y <= DEEPSLATE_BAND_LOW) return states.deepslate;
  if (y >= DEEPSLATE_BAND_HIGH) return states.stone;
  const span = DEEPSLATE_BAND_HIGH - DEEPSLATE_BAND_LOW;
  const p = (DEEPSLATE_BAND_HIGH - y) / span;
  return hash3i(stoneSeed, x, y, z, 5) / 4294967296 < p ? states.deepslate : states.stone;
}

/**
 * **A second pool never lowers the first.**
 *
 * Off — `false` is today's bytes — `settleFluidPool` writes every column of a
 * pool to the pool's level unconditionally, so where two pools overlap (the
 * railway town: a `basin` at y 54 over the demoted pond of a sealess `river` at
 * y 51) the one settled second overwrites the first *downward*, and every
 * neighbour still at the higher surface has an exposed face — 71 blocks of
 * `LOAM-T110 UNSTABLE_FLUID` (`scratchpad/t110/T110-PROBE.md`, 2026-08-25).
 * On, a column already holding the same fluid above the new level keeps its
 * surface. Pools that do not overlap are byte-identical. Staged under the
 * Run's law 5: landed `false`; **`true` ships** (2026-08-25, unit 15) — no
 * law-5 world moves; the railway town compiles clean.
 */
export const POOL_NEVER_LOWERS = true;
