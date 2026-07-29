/**
 * The cave pass: `cave.carver@0` nodes → interior air spans and their dressing.
 *
 * The carving itself lives in the stdlib (`@terrainist/stdlib`'s `caves/`),
 * which knows nothing about blocks; this file is the seam where a carved span
 * set becomes part of the column plan and gains dripstone, moss and mushrooms.
 *
 * Three properties are worth stating, because everything downstream leans on
 * them:
 *
 * 1. **Nothing above ground moves.** A span's ceiling is capped at
 *    `ground - CAVE_ROOF_THICKNESS` everywhere except the columns of a declared
 *    entrance mouth, so the surface block, the biome, the snow layer and every
 *    tree stay exactly where the earlier passes put them.
 * 2. **Nothing wet is approached.** The band the carver cuts inside is empty
 *    within four blocks of any fluid column. {@link checkCaveIntegrity}
 *    recomputes that from the finished spans rather than trusting it.
 * 3. **The dressing attaches.** A span is a *maximal* run of air with solid
 *    rock at `lo - 1` and at `hi + 1` (the stdlib merges runs that touch), so a
 *    stalagmite at `lo` and a stalactite at `hi` are both fixed to real stone.
 *    That is why the pointed-dripstone rules need no world readback to be
 *    correct.
 */

import {
  CAVE_ROOF_THICKNESS,
  carveCaves,
  dilate,
  emptyCaveSpans,
  resolveCaveParams,
  type CaveParams,
  type CaveSpans,
  type Classification,
  type Marker,
  type Seed256,
} from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";

import { FluidKind, type ColumnPlan } from "./columns.js";
import type { DecorBlock } from "./decorate.js";
import { detailSeed, hash3 } from "./detail.js";
import type { Palette } from "./palette.js";

/** What the cave pass attached to the column plan. */
export interface CavePlan {
  readonly spans: CaveSpans;
  /** 1 for a column an entrance mouth opens to the sky. */
  readonly entranceColumns: Uint8Array;
  /** `cave_mouth` markers, one per opened entrance. */
  readonly markers: readonly Marker[];
  /** Air blocks cut out of the stone body. */
  readonly carvedBlocks: number;
  /** Worm systems placed, summed over every cave node. */
  readonly systems: number;
  /** Chambers opened, summed over every cave node. */
  readonly chambers: number;
  /** True when at least one node asked for decoration. */
  readonly decorate: boolean;
}

/** One `cave.carver@0` node, as the compiler hands it to this pass. */
export interface CaveNodeInput {
  readonly id: string;
  readonly nodePath: string;
  readonly seed: Seed256;
  readonly params: CaveParams;
}

/** Resolve a validated node's params. Re-exported so the compiler stays thin. */
export { resolveCaveParams };

/**
 * Carve every cave node and combine the results.
 *
 * Nodes are carved independently against the *same* column plan — a later node
 * does not see an earlier one's air — and their spans are then merged. That is
 * deliberate: making node N+1's carve depend on node N's would make a document
 * order the compiler is free to preserve into a semantic one it is not.
 */
export function buildCavePlan(
  nodes: readonly CaveNodeInput[],
  plan: ColumnPlan,
  classification: Classification,
): CavePlan {
  const { region } = plan;
  const n = region.width * region.depth;
  if (nodes.length === 0) {
    return {
      spans: emptyCaveSpans(n),
      entranceColumns: new Uint8Array(n),
      markers: [],
      carvedBlocks: 0,
      systems: 0,
      chambers: 0,
      decorate: false,
    };
  }

  // Every column the world holds fluid in, whatever put it there: the ocean
  // mask, a lake or pond chain, a river pool, a caldera's lava. The plan is the
  // single source of truth for this, which is what makes the shell rule cover
  // water the classification alone would not know about.
  const fluid = new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    if (plan.fluidKind[idx] !== FluidKind.NONE) fluid[idx] = 1;
  }

  const spanSets: CaveSpans[] = [];
  const entranceColumns = new Uint8Array(n);
  const markers: Marker[] = [];
  let systems = 0;
  let chambers = 0;
  let decorate = false;

  for (const node of nodes) {
    const result = carveCaves({
      region,
      seed: node.seed,
      params: node.params,
      ground: plan.ground,
      fluid,
      oceanMask: classification.oceanMask,
      slopes: classification.slopes,
      seaLevel: plan.seaLevel,
      nodeId: node.nodePath,
    });
    spanSets.push(result.spans);
    for (let idx = 0; idx < n; idx++) {
      if (result.entranceColumns[idx] === 1) entranceColumns[idx] = 1;
    }
    markers.push(...result.markers);
    systems += result.systems;
    chambers += result.chambers;
    if (node.params.decorate) decorate = true;
  }

  const spans = mergeSpanSets(spanSets, n);
  let carvedBlocks = 0;
  for (let k = 0; k < spans.lo.length; k++) {
    carvedBlocks += (spans.hi[k] as number) - (spans.lo[k] as number) + 1;
  }

  return { spans, entranceColumns, markers, carvedBlocks, systems, chambers, decorate };
}

/** Union several span sets over the same region, re-merging per column. */
export function mergeSpanSets(sets: readonly CaveSpans[], columns: number): CaveSpans {
  if (sets.length === 1) return sets[0] as CaveSpans;
  const offsets = new Int32Array(columns + 1);
  const outLo: number[] = [];
  const outHi: number[] = [];

  for (let idx = 0; idx < columns; idx++) {
    offsets[idx] = outLo.length;
    const runs: [number, number][] = [];
    for (const set of sets) {
      const end = set.offsets[idx + 1] as number;
      for (let k = set.offsets[idx] as number; k < end; k++) {
        runs.push([set.lo[k] as number, set.hi[k] as number]);
      }
    }
    runs.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
    for (const [lo, hi] of runs) {
      const last = outLo.length - 1;
      if (last >= (offsets[idx] as number) && lo <= (outHi[last] as number) + 1) {
        if (hi > (outHi[last] as number)) outHi[last] = hi;
        continue;
      }
      outLo.push(lo);
      outHi.push(hi);
    }
  }
  offsets[columns] = outLo.length;
  return { offsets, lo: Int32Array.from(outLo), hi: Int32Array.from(outHi) };
}

/* -------------------------------------------------------------------------- */
/* dressing                                                                    */
/* -------------------------------------------------------------------------- */

/** Height below which a span is too tight to dress at all. */
const MIN_DRESSED_HEIGHT = 3;

/** Height at or above which a two-block dripstone spike may be placed. */
const TALL_SPAN_HEIGHT = 6;

/** Chance a cave floor column is dripstone rather than the surrounding rock. */
const FLOOR_PATCH_CHANCE = 0.3;

/** Block states the cave dressing places, resolved once. */
interface CaveStates {
  readonly floor: number;
  readonly moss: number;
  readonly cobweb: number;
  readonly brownMushroom: number;
  readonly redMushroom: number;
  /** `pointed_dripstone` by `[direction][thickness]`. */
  readonly spike: Readonly<Record<"up" | "down", Readonly<Record<"tip" | "frustum", number>>>>;
}

function resolveCaveStates(palette: Palette, stack: PrismarineStack): CaveStates {
  const fallback = palette.state("cave.dripstone");
  const spike = (vertical: "up" | "down", thickness: "tip" | "frustum"): number =>
    stack.blockStateOf("pointed_dripstone", {
      vertical_direction: vertical,
      thickness,
      waterlogged: "false",
    }) ?? fallback;
  return {
    floor: palette.state("cave.floor"),
    moss: palette.state("cave.moss"),
    cobweb: palette.state("cave.cobweb"),
    brownMushroom: palette.state("foliage.brown_mushroom"),
    redMushroom: palette.state("foliage.red_mushroom"),
    spike: {
      up: { tip: spike("up", "tip"), frustum: spike("up", "frustum") },
      down: { tip: spike("down", "tip"), frustum: spike("down", "frustum") },
    },
  };
}

/** What the dressing produced, for the compile report. */
export interface CaveDecorResult {
  readonly blocks: readonly DecorBlock[];
  /** Counts by category: `floor`, `stalagmite`, `stalactite`, `moss`, `mushroom`, `cobweb`. */
  readonly counts: Readonly<Record<string, number>>;
}

/**
 * Dress the caves.
 *
 * Every decision is position-keyed on `(x, spanEnd, z)` rather than drawn from
 * a sequential RNG, so the pass may be read in any order and re-run at will —
 * the same rule the surface decoration pass follows, and for the same reason.
 *
 * The pointed dripstone rules are the load-bearing ones:
 *
 * - an **up** spike sits at `lo`, whose `lo - 1` is stone by the span
 *   invariant, and grows upward — `frustum` under `tip` for a two-block one,
 *   which is the state pair vanilla uses;
 * - a **down** spike hangs at `hi`, whose `hi + 1` is stone, and grows
 *   downward, so a two-block one is `frustum` at `hi` and `tip` at `hi - 1`;
 * - a span open to the sky (an entrance mouth) grows nothing from its ceiling,
 *   because it has none.
 *
 * Nothing is ever placed floating, and the two never meet: a two-block spike
 * needs a span at least {@link TALL_SPAN_HEIGHT} tall, which leaves two clear
 * blocks between the tips.
 */
export function decorateCaves(
  plan: ColumnPlan,
  palette: Palette,
  stack: PrismarineStack,
  seed: Seed256,
): CaveDecorResult {
  const caves = plan.caves;
  const counts: Record<string, number> = {
    floor: 0,
    stalagmite: 0,
    stalactite: 0,
    moss: 0,
    mushroom: 0,
    cobweb: 0,
  };
  if (caves === undefined || !caves.decorate) return { blocks: [], counts };

  const { region, ground } = plan;
  const states = resolveCaveStates(palette, stack);
  const floorSeed = detailSeed(seed, "caves.floor");
  const ceilSeed = detailSeed(seed, "caves.ceiling");
  const webSeed = detailSeed(seed, "caves.cobweb");
  const blocks: DecorBlock[] = [];

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      const idx = j * region.width + i;
      const end = caves.spans.offsets[idx + 1] as number;
      const surface = ground[idx] as number;

      for (let k = caves.spans.offsets[idx] as number; k < end; k++) {
        const lo = caves.spans.lo[k] as number;
        const hi = caves.spans.hi[k] as number;
        const height = hi - lo + 1;
        if (height < MIN_DRESSED_HEIGHT) continue;
        const tall = height >= TALL_SPAN_HEIGHT;

        // --- the floor ------------------------------------------------------
        if (hash3(floorSeed, x, lo, z, 1) < FLOOR_PATCH_CHANCE) {
          blocks.push({ x, y: lo - 1, z, stateId: states.floor });
          counts["floor"] = (counts["floor"] as number) + 1;
        }

        const f = hash3(floorSeed, x, lo, z, 2);
        if (f < 0.06) {
          blocks.push({ x, y: lo, z, stateId: tall ? states.spike.up.frustum : states.spike.up.tip });
          if (tall) blocks.push({ x, y: lo + 1, z, stateId: states.spike.up.tip });
          counts["stalagmite"] = (counts["stalagmite"] as number) + 1;
        } else if (f < 0.12) {
          blocks.push({ x, y: lo, z, stateId: states.moss });
          counts["moss"] = (counts["moss"] as number) + 1;
        } else if (f < 0.155) {
          blocks.push({
            x,
            y: lo,
            z,
            stateId: f < 0.14 ? states.brownMushroom : states.redMushroom,
          });
          counts["mushroom"] = (counts["mushroom"] as number) + 1;
        }

        // --- the ceiling ----------------------------------------------------
        // A mouth column has open sky over it; there is nothing up there for a
        // stalactite to hold on to.
        if (hi < surface && hash3(ceilSeed, x, hi, z, 3) < 0.07) {
          blocks.push({ x, y: hi, z, stateId: tall ? states.spike.down.frustum : states.spike.down.tip });
          if (tall) blocks.push({ x, y: hi - 1, z, stateId: states.spike.down.tip });
          counts["stalactite"] = (counts["stalactite"] as number) + 1;
        }

        // --- cobwebs --------------------------------------------------------
        if (hash3(webSeed, x, lo, z, 4) < 0.004) {
          blocks.push({ x, y: lo + 1, z, stateId: states.cobweb });
          counts["cobweb"] = (counts["cobweb"] as number) + 1;
        }
      }
    }
  }

  return { blocks, counts };
}

/* -------------------------------------------------------------------------- */
/* validators                                                                  */
/* -------------------------------------------------------------------------- */

/** One place a cave came too near water, or ate a surface it should not have. */
export interface CaveBreach {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly detail: string;
}

/** Findings of the two cave invariants, with a handful of examples each. */
export interface CaveIntegrityReport {
  readonly fluidBreaches: number;
  readonly surfaceBreaches: number;
  readonly samples: readonly CaveBreach[];
}

/** Examples a cave integrity report carries. */
export const MAX_CAVE_SAMPLES = 8;

/** Horizontal shell a cave keeps from any fluid column. */
export const CAVE_FLUID_SHELL_BLOCKS = 4;

/** Horizontal reach of the ocean keep-out. */
export const CAVE_OCEAN_KEEPOUT_BLOCKS = 8;

/**
 * Recompute both cave invariants from the finished spans.
 *
 * The fluid rule is checked the strong way: the fluid mask is re-derived from
 * the plan, dilated by four, and *any* span in a covered column is a breach —
 * not "a span near enough vertically", which would let a carver bug hide behind
 * a lucky depth. The ocean keep-out is a second dilation, by eight, against
 * which no span may reach sea level. Both are recomputed here rather than
 * carried over from the carver, so the two implementations have to agree.
 *
 * This should always find nothing. It exists because "always" is the claim
 * being made, and a claim nobody re-derives is a comment.
 */
export function checkCaveIntegrity(plan: ColumnPlan): CaveIntegrityReport {
  const caves = plan.caves;
  const samples: CaveBreach[] = [];
  let fluidBreaches = 0;
  let surfaceBreaches = 0;
  if (caves === undefined) return { fluidBreaches, surfaceBreaches, samples };

  const { region, ground, seaLevel } = plan;
  const n = region.width * region.depth;
  const fluid = new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    if (plan.fluidKind[idx] !== FluidKind.NONE) fluid[idx] = 1;
  }
  const nearFluid = dilate(fluid, region.width, region.depth, CAVE_FLUID_SHELL_BLOCKS);
  const nearOcean = dilate(plan.oceanMask, region.width, region.depth, CAVE_OCEAN_KEEPOUT_BLOCKS);

  const sample = (breach: CaveBreach): void => {
    if (samples.length < MAX_CAVE_SAMPLES) samples.push(breach);
  };

  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      const start = caves.spans.offsets[idx] as number;
      const end = caves.spans.offsets[idx + 1] as number;
      if (start === end) continue;
      const x = region.x0 + i;
      const z = region.z0 + j;
      const surface = ground[idx] as number;
      const entrance = caves.entranceColumns[idx] === 1;

      if (nearFluid[idx] === 1) {
        fluidBreaches += end - start;
        sample({
          x,
          y: caves.spans.hi[start] as number,
          z,
          detail: `carved within ${CAVE_FLUID_SHELL_BLOCKS} blocks of a water or lava column`,
        });
      }

      for (let k = start; k < end; k++) {
        const lo = caves.spans.lo[k] as number;
        const hi = caves.spans.hi[k] as number;

        if (nearOcean[idx] === 1 && lo <= seaLevel) {
          fluidBreaches++;
          sample({
            x,
            y: lo,
            z,
            detail: `reaches y ${lo}, at or below sea level ${seaLevel}, within ${CAVE_OCEAN_KEEPOUT_BLOCKS} blocks of the ocean`,
          });
        }

        if (entrance) continue;
        if (hi >= surface) {
          surfaceBreaches++;
          sample({ x, y: hi, z, detail: `reaches y ${hi}, removing the surface block at y ${surface}` });
        } else if (hi > surface - CAVE_ROOF_THICKNESS) {
          surfaceBreaches++;
          sample({
            x,
            y: hi,
            z,
            detail: `leaves only ${surface - hi} blocks of roof (want ${CAVE_ROOF_THICKNESS})`,
          });
        }
      }
    }
  }
  return { fluidBreaches, surfaceBreaches, samples };
}
