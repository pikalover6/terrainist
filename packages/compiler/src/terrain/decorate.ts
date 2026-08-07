/**
 * Ground cover: undergrowth, shore life and water plants.
 *
 * The scatter pass puts trunks and canopies in the world; this pass puts
 * *everything else* — the grass, ferns, flower patches, mushrooms, fallen logs,
 * mud, moss, seagrass, kelp and lily pads that separate a lush world from a
 * heightmap with trees stuck in it.
 *
 * Two rules make it safe:
 *
 * 1. **Every decision is position-keyed.** A column's cover is a pure function
 *    of its coordinates and the node's seed, so the pass can be read in any
 *    order and re-run at will (`detail.ts` explains the hash).
 * 2. **Nothing here touches fluids.** Water plants replace the water block they
 *    stand in (Minecraft renders seagrass and kelp waterlogged by definition),
 *    and lily pads sit in the air block above a settled surface. The column
 *    plan's `fluidKind`/`fluidTop` are never modified, so the fluid-stability
 *    invariant proved before this pass still holds after it.
 *
 * A few decisions change the *surface block* rather than adding one — podzol
 * under a dense spruce canopy, coarse and rooted dirt patches. Those write back
 * into the column plan, which is why the pass runs before biome painting and
 * emit.
 */

import { SurfaceClass, fbm2, type Classification, type Seed256 } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";

import type { StructureClip } from "./clip.js";
import { FluidKind, type ColumnPlan } from "./columns.js";
import { detailSeed, hash2, hashInt, hashPick } from "./detail.js";
import type { Palette } from "./palette.js";
import type { ScatteredNode, TreePlacement } from "./vegetation.js";
import { canopyCover } from "./vegetation.js";

/** One decoration block, in absolute world coordinates. */
export interface DecorBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly stateId: number;
}

/** What the decoration pass produced, for the compile report. */
export interface DecorationResult {
  readonly blocks: readonly DecorBlock[];
  /** Counts by category: `grass`, `flowers`, `deadwood`, `shade`, `water`, `shore`. */
  readonly counts: Readonly<Record<string, number>>;
}

/** Everything {@link decorate} reads. */
export interface DecorateInput {
  readonly plan: ColumnPlan;
  readonly classification: Classification;
  /** Per-column temperature, for taiga-vs-forest cover choices. */
  readonly temperature: Float32Array;
  readonly trees: readonly TreePlacement[];
  readonly forests: readonly ScatteredNode[];
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /**
   * Structure boxes ground cover may not enter. Undergrowth is already kept out
   * of claimed columns by each node's eligibility mask; this catches the one
   * thing that escapes it — a fallen log, which starts on a legal column and
   * then runs for up to four blocks in a straight line. Deadwood is held to the
   * wider `inApron` test rather than `blockedColumn`, because a log that merely
   * *stops* at a wall is still a log lying against it.
   */
  readonly clip?: StructureClip;
  /** Root node seed; the decoration streams hang off it. */
  readonly seed: Seed256;
}

/** Temperature below which a forest floor dresses as taiga (ferns, berries). */
const TAIGA_TEMPERATURE = 0.4;

/** Canopy columns overhead at which a floor counts as deep shade. */
const DENSE_SHADE = 3;

/** Ocean depth (blocks below sea level) up to which seagrass grows. */
export const SEAGRASS_MAX_DEPTH = 12;
/** Depth band in which kelp forests grow. */
export const KELP_MIN_DEPTH = 12;
export const KELP_MAX_DEPTH = 30;

/** Block states the pass places, resolved once. */
interface DecorStates {
  readonly shortGrass: number;
  readonly tallGrassLower: number;
  readonly tallGrassUpper: number;
  readonly fern: number;
  readonly deadBush: number;
  readonly mossCarpet: number;
  readonly brownMushroom: number;
  readonly redMushroom: number;
  readonly berryBush: number;
  readonly azalea: number;
  readonly lilyPad: number;
  readonly seagrass: number;
  readonly tallSeagrassLower: number;
  readonly tallSeagrassUpper: number;
  readonly kelpPlant: number;
  readonly kelpTip: number;
  readonly flowers: readonly number[];
  readonly logX: number;
  readonly logZ: number;
  readonly podzol: number;
  readonly coarseDirt: number;
  readonly rootedDirt: number;
}

function resolveStates(palette: Palette, stack: PrismarineStack): DecorStates {
  const state = (symbol: string): number => palette.state(symbol);
  const withProps = (name: string, props: Record<string, string>, fallback: number): number =>
    stack.blockStateOf(name, props) ?? fallback;
  const tallGrass = state("foliage.tall_grass");
  const tallSeagrass = state("foliage.tall_seagrass");
  const log = "minecraft:spruce_log";
  return {
    shortGrass: state("foliage.short_grass"),
    tallGrassLower: withProps("minecraft:tall_grass", { half: "lower" }, tallGrass),
    tallGrassUpper: withProps("minecraft:tall_grass", { half: "upper" }, tallGrass),
    fern: state("foliage.fern"),
    deadBush: state("foliage.dead_bush"),
    mossCarpet: state("foliage.moss_carpet"),
    brownMushroom: state("foliage.brown_mushroom"),
    redMushroom: state("foliage.red_mushroom"),
    berryBush: state("foliage.sweet_berry_bush"),
    azalea: state("foliage.azalea"),
    lilyPad: state("foliage.lily_pad"),
    seagrass: state("foliage.seagrass"),
    tallSeagrassLower: withProps("minecraft:tall_seagrass", { half: "lower" }, tallSeagrass),
    tallSeagrassUpper: withProps("minecraft:tall_seagrass", { half: "upper" }, tallSeagrass),
    kelpPlant: state("foliage.kelp_plant"),
    kelpTip: state("foliage.kelp"),
    flowers: [
      state("flower.poppy"),
      state("flower.dandelion"),
      state("flower.cornflower"),
      state("flower.oxeye_daisy"),
      state("flower.azure_bluet"),
    ],
    logX: withProps(log, { axis: "x" }, state("wood.spruce_log")),
    logZ: withProps(log, { axis: "z" }, state("wood.spruce_log")),
    podzol: state("ground.podzol"),
    coarseDirt: state("ground.coarse_dirt"),
    rootedDirt: state("ground.rooted_dirt"),
  };
}

/**
 * Decorate the whole world.
 *
 * Mutates `input.plan.surface` where a cover choice replaces the ground block;
 * everything else comes back as {@link DecorBlock}s for the emitter.
 */
export function decorate(input: DecorateInput): DecorationResult {
  const { plan, palette, stack, trees } = input;
  const { region } = plan;
  const states = resolveStates(palette, stack);
  const blocks: DecorBlock[] = [];
  const counts: Record<string, number> = {
    grass: 0,
    flowers: 0,
    deadwood: 0,
    shade: 0,
    water: 0,
    shore: 0,
  };

  const canopy = canopyCover(plan, trees);
  const occupied = trunkMask(plan, trees);
  const decorated = new Uint8Array(region.width * region.depth);

  const seeds = {
    patch: detailSeed(input.seed, "decor.patch"),
    water: detailSeed(input.seed, "decor.water"),
    shore: detailSeed(input.seed, "decor.shore"),
  };

  for (const node of input.forests) {
    decorateForest(node, input, states, canopy, occupied, decorated, blocks, counts, seeds);
  }
  decorateWater(input, states, blocks, counts, seeds.water);
  decorateShore(input, states, occupied, blocks, counts, seeds.shore);

  return { blocks, counts };
}

/* -------------------------------------------------------------------------- */
/* Forest floors                                                               */
/* -------------------------------------------------------------------------- */

function decorateForest(
  node: ScatteredNode,
  input: DecorateInput,
  states: DecorStates,
  canopy: Uint8Array,
  occupied: Uint8Array,
  decorated: Uint8Array,
  blocks: DecorBlock[],
  counts: Record<string, number>,
  seeds: { patch: number },
): void {
  const { plan, classification, temperature, palette } = input;
  const { region, ground, fluidKind, surface, volcanic, lavaFlow } = plan;
  const cover = detailSeed(node.seed, "undergrowth");
  const { grass, flowers, deadwood } = node.params.undergrowth;

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (node.mask[idx] !== 1) continue;
      if (decorated[idx] === 1) continue;
      if (occupied[idx] === 1) continue;
      if (input.clip?.blockedColumn(region.x0 + i, z) === true) continue;
      if (fluidKind[idx] !== FluidKind.NONE) continue;
      if (volcanic[idx] === 1 || lavaFlow[idx] === 1) continue;
      if (classification.classes[idx] !== SurfaceClass.SOIL) continue;
      decorated[idx] = 1;

      const x = region.x0 + i;
      const y = (ground[idx] as number) + 1;
      const cold = (temperature[idx] as number) < TAIGA_TEMPERATURE;
      const shade = canopy[idx] as number;

      // --- soil conversions (these replace the surface, not sit on it) ------
      const soilNoise = fbm2(seeds.patch, x, z, {
        octaves: 2,
        frequency: 0.035,
        lacunarity: 2,
        gain: 0.5,
      });
      if (cold && shade >= DENSE_SHADE && hash2(cover, x, z, 1) < 0.7) {
        surface[idx] = states.podzol;
      } else if (soilNoise > 0.42) {
        surface[idx] = hash2(cover, x, z, 2) < 0.6 ? states.coarseDirt : states.rootedDirt;
        // Bare ground stays bare.
        continue;
      }

      // --- fallen logs (claim several columns, so try them first) -----------
      // A log is a four-block beam, so "this column is not claimed" is not
      // enough: it must start, and stay, outside the structure apron, or it
      // ends up lying against a wall reading as a dropped roof timber.
      if (
        shade === 0 &&
        input.clip?.inApron(x, z) !== true &&
        hash2(cover, x, z, 3) < deadwood * 0.15
      ) {
        const length = hashInt(cover, x, z, 4, 2, 4);
        const alongX = hash2(cover, x, z, 5) < 0.5;
        let placed = 0;
        for (let k = 0; k < length; k++) {
          const lx = alongX ? x + k : x;
          const lz = alongX ? z : z + k;
          const li = lx - region.x0;
          const lj = lz - region.z0;
          if (li < 0 || lj < 0 || li >= region.width || lj >= region.depth) break;
          const lidx = lj * region.width + li;
          if (occupied[lidx] === 1 || fluidKind[lidx] !== FluidKind.NONE) break;
          if (input.clip?.inApron(lx, lz) === true) break;
          if ((ground[lidx] as number) !== (ground[idx] as number)) break;
          decorated[lidx] = 1;
          occupied[lidx] = 1;
          blocks.push({ x: lx, y, z: lz, stateId: alongX ? states.logX : states.logZ });
          placed++;
        }
        if (placed > 0) {
          counts["deadwood"] = (counts["deadwood"] ?? 0) + placed;
          continue;
        }
      }

      // --- shade cover ------------------------------------------------------
      if (shade >= DENSE_SHADE) {
        const r = hash2(cover, x, z, 6);
        if (r < 0.16) {
          blocks.push({ x, y, z, stateId: states.mossCarpet });
          counts["shade"] = (counts["shade"] ?? 0) + 1;
          continue;
        }
        if (r < 0.19) {
          blocks.push({
            x,
            y,
            z,
            stateId: hash2(cover, x, z, 7) < 0.5 ? states.brownMushroom : states.redMushroom,
          });
          counts["shade"] = (counts["shade"] ?? 0) + 1;
          continue;
        }
      }

      // --- berries (taiga only) ---------------------------------------------
      if (cold && shade > 0 && hash2(cover, x, z, 8) < 0.03) {
        blocks.push({ x, y, z, stateId: states.berryBush });
        counts["shade"] = (counts["shade"] ?? 0) + 1;
        continue;
      }

      // --- dead bush on stony ground ----------------------------------------
      if (
        surface[idx] === palette.state("ground.gravel") &&
        hash2(cover, x, z, 9) < deadwood * 3
      ) {
        blocks.push({ x, y, z, stateId: states.deadBush });
        counts["deadwood"] = (counts["deadwood"] ?? 0) + 1;
        continue;
      }

      // --- flower patches ----------------------------------------------------
      // A low-frequency noise picks the meadows; inside one, flowers are common.
      const patch = fbm2(seeds.patch, x, z, {
        octaves: 2,
        frequency: 0.012,
        lacunarity: 2,
        gain: 0.5,
      });
      if (patch > 0.28 && shade < DENSE_SHADE) {
        if (hash2(cover, x, z, 10) < Math.min(1, flowers * 6)) {
          // Species is picked per *meadow*, not per column: a real flower field
          // is mostly one kind with a second mixed through it, and rolling five
          // species per block turns a meadow into confetti.
          const cellX = x >> 4;
          const cellZ = z >> 4;
          const primary = hash2(cover, x, z, 14) < 0.25 ? 15 : 11;
          blocks.push({ x, y, z, stateId: hashPick(cover, cellX, cellZ, primary, states.flowers) });
          counts["flowers"] = (counts["flowers"] ?? 0) + 1;
          continue;
        }
      }

      // --- grass, ferns and tall grass ---------------------------------------
      const g = hash2(cover, x, z, 12);
      if (g < grass) {
        const kind = hash2(cover, x, z, 13);
        if (cold && kind < 0.35) {
          blocks.push({ x, y, z, stateId: states.fern });
        } else if (kind > 0.85 && y + 1 <= 318) {
          blocks.push({ x, y, z, stateId: states.tallGrassLower });
          blocks.push({ x, y: y + 1, z, stateId: states.tallGrassUpper });
        } else {
          blocks.push({ x, y, z, stateId: states.shortGrass });
        }
        counts["grass"] = (counts["grass"] ?? 0) + 1;
      }
    }
  }
}

/**
 * Canopy columns overhead, per column — the shade map.
 *
 * Re-exported from `vegetation.ts`, which owns it now: the understory stratum
 * (§5.4) and the undergrowth pass must read one answer, not two.
 */
export { canopyCover };

/** 1 on every column a trunk stands in. */
function trunkMask(plan: ColumnPlan, trees: readonly TreePlacement[]): Uint8Array {
  const { region } = plan;
  const mask = new Uint8Array(region.width * region.depth);
  // A cave mouth has eaten the surface block of the columns it opens, so there
  // is nothing under them for a moss carpet or a flower to stand on. Folding
  // that into the same mask the trunks use keeps every surface-decor loop
  // honest without each one having to remember the cave pass exists.
  const entrances = plan.caves?.entranceColumns;
  if (entrances !== undefined) {
    for (let idx = 0; idx < mask.length; idx++) if (entrances[idx] === 1) mask[idx] = 1;
  }
  for (const tree of trees) {
    const span = tree.mega ? 2 : 1;
    for (let dz = 0; dz < span; dz++) {
      for (let dx = 0; dx < span; dx++) {
        const i = tree.x + dx - region.x0;
        const j = tree.z + dz - region.z0;
        if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
        mask[j * region.width + i] = 1;
      }
    }
  }
  return mask;
}

/* -------------------------------------------------------------------------- */
/* Water                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Seagrass, kelp and lily pads.
 *
 * Depth is measured from the *fluid surface* of the column, so a lake pool gets
 * the same treatment as the sea. Kelp is capped two blocks below the surface so
 * a fully grown strand never breaks the waterline.
 */
function decorateWater(
  input: DecorateInput,
  states: DecorStates,
  blocks: DecorBlock[],
  counts: Record<string, number>,
  seed: number,
): void {
  const { plan } = input;
  const { region, ground, fluidTop, fluidKind, lakeMask } = plan;

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (fluidKind[idx] !== FluidKind.WATER) continue;
      const x = region.x0 + i;
      const floor = ground[idx] as number;
      const top = fluidTop[idx] as number;
      const depth = top - floor;
      if (depth < 2) continue;

      if (lakeMask[idx] === 1) {
        // Lily pads: only on a lake, only near its shore.
        if (nearShore(plan, i, j, 3) && hash2(seed, x, z, 1) < 0.07) {
          blocks.push({ x, y: top + 1, z, stateId: states.lilyPad });
          counts["water"] = (counts["water"] ?? 0) + 1;
        }
        continue;
      }

      if (depth <= SEAGRASS_MAX_DEPTH) {
        const r = hash2(seed, x, z, 2);
        if (r < 0.3) {
          if (r < 0.06 && depth >= 3) {
            blocks.push({ x, y: floor + 1, z, stateId: states.tallSeagrassLower });
            blocks.push({ x, y: floor + 2, z, stateId: states.tallSeagrassUpper });
            counts["water"] = (counts["water"] ?? 0) + 2;
          } else {
            blocks.push({ x, y: floor + 1, z, stateId: states.seagrass });
            counts["water"] = (counts["water"] ?? 0) + 1;
          }
        }
        continue;
      }

      if (depth <= KELP_MAX_DEPTH && depth > KELP_MIN_DEPTH) {
        if (hash2(seed, x, z, 3) >= 0.08) continue;
        const maxHeight = Math.max(0, top - 2 - floor);
        if (maxHeight < 3) continue;
        const height = hashInt(seed, x, z, 4, 3, maxHeight);
        for (let k = 0; k < height; k++) {
          blocks.push({
            x,
            y: floor + 1 + k,
            z,
            stateId: k === height - 1 ? states.kelpTip : states.kelpPlant,
          });
        }
        counts["water"] = (counts["water"] ?? 0) + height;
      }
    }
  }
}

/** True when a water column has a non-water column within `reach`. */
function nearShore(plan: ColumnPlan, i: number, j: number, reach: number): boolean {
  const { region, fluidKind } = plan;
  for (let dj = -reach; dj <= reach; dj++) {
    const jj = j + dj;
    if (jj < 0 || jj >= region.depth) continue;
    for (let di = -reach; di <= reach; di++) {
      const ii = i + di;
      if (ii < 0 || ii >= region.width) continue;
      if (fluidKind[jj * region.width + ii] === FluidKind.NONE) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Shores                                                                      */
/* -------------------------------------------------------------------------- */

/** Occasional azalea bushes along a lake shore. */
function decorateShore(
  input: DecorateInput,
  states: DecorStates,
  occupied: Uint8Array,
  blocks: DecorBlock[],
  counts: Record<string, number>,
  seed: number,
): void {
  const { plan, classification } = input;
  const { region, ground, fluidKind } = plan;

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (classification.classes[idx] !== SurfaceClass.LAKESHORE) continue;
      if (fluidKind[idx] !== FluidKind.NONE || occupied[idx] === 1) continue;
      const x = region.x0 + i;
      if (hash2(seed, x, z, 1) >= 0.02) continue;
      blocks.push({ x, y: (ground[idx] as number) + 1, z, stateId: states.azalea });
      counts["shore"] = (counts["shore"] ?? 0) + 1;
    }
  }
}
