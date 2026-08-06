/**
 * Ground treatment (fabric v2, workstream F2) — the ground between the walls.
 *
 * The first showcase walk's verdict was that correct buildings were sitting on
 * a lawn: the grammar builds a granary and the road pass runs a lane to its
 * door, and everything in between is untouched terrain grass, right up to the
 * masonry. Then the lawn ends and closed canopy begins, in a step. Nothing in
 * the pipeline was responsible for the *space* a settlement occupies, so
 * nothing made it.
 *
 * This module is that responsibility, in three parts, none of which needs F1's
 * district machinery — every one of them derives from what is already on the
 * ground, so it applies to every settlement world that compiles today:
 *
 * 1. **Lot dressing.** Every placed building gets a treatment chosen by its
 *    archetype's catalog category ({@link GROUND_TREATMENTS}): a paved apron
 *    ring downtown, a fenced garden behind a cottage, a gravel working yard at
 *    a works, a smooth-stone path ring and flower borders at a church. The
 *    treatment mutates the column plan's *surface*, exactly as the road pass
 *    does, because a forecourt is a change to the ground rather than an object
 *    resting on it.
 * 2. **Worn ground paint.** A settlement-wide speckle of dirt path and coarse
 *    dirt fanning out from every road and doorstep column, dense against the
 *    lane and single-digit percent a few blocks off it, so the ground records
 *    that people walk here.
 * 3. **The clearing transition band.** Between the felled ground of a
 *    settlement and the wood outside it, a band of meadow that thins to
 *    scattered trees, with the stumps and fallen logs of the trees that were
 *    taken. This one runs *after* the scatter — it thins a planted forest
 *    rather than deciding where one may grow — and is exported separately as
 *    {@link buildTransitionBand}.
 *
 * ## Rules the whole module obeys
 *
 * - **Nothing floats.** Every block is placed at `plan.ground[idx] + 1` of its
 *   own column, never at a neighbour's height.
 * - **Nothing lands on water.** A column with any fluid is skipped outright.
 * - **Nothing overwrites work already done.** Roads, the plaza, doorsteps,
 *   building footprints and props are all masked out before a single column is
 *   touched, which is why this pass runs last.
 * - **Every decision is position-keyed.** `hash2`/`hashInt`/`hashPick` from
 *   `terrain/detail.ts`, seeded off the node seed — no sequential RNG, no
 *   traversal-order dependence, and no transcendental arithmetic.
 */

import { structureById, type Region } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import { CLEARING_MARGIN, distanceToHull, type HullPoint } from "../terrain/clearing.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { hash2, hashInt, hashPick } from "../terrain/detail.js";
import type { Palette } from "../terrain/palette.js";
import type { TreePlacement } from "../terrain/vegetation.js";

import type { BuiltBuilding, StructureBlock } from "./buildings.js";
import { index, inside } from "./roads.js";

/* -------------------------------------------------------------------------- */
/* tunables — Kai dials these after a walk                                     */
/* -------------------------------------------------------------------------- */

/** Width, in columns, of the paved apron ring around a commercial/civic lot. */
export const APRON_RADIUS = 2;

/** Width, in columns, of the gravel working yard around an industrial lot. */
export const YARD_RADIUS = 2;

/** Width, in columns, of the path ring around a religious/memorial lot. */
export const SACRED_RADIUS = 2;

/** How deep, in columns, a cottage garden reaches out from the wall it abuts. */
export const GARDEN_DEPTH = 5;

/**
 * How far a dressed column's ground may sit from the building's floor plane
 * before the treatment gives up on it, in blocks.
 *
 * A forecourt is a flat thing. Painting one across a two-block drop produces a
 * staircase of mismatched surface blocks, which reads worse than the grass it
 * replaced — so anything steeper is simply left alone.
 */
export const LOT_MAX_RELIEF = 2;

/** Share of a garden's interior columns that grow a flower. */
export const GARDEN_FLOWER_DENSITY = 0.14;

/** Share of a garden's interior columns that grow a tuft of grass. */
export const GARDEN_GRASS_DENSITY = 0.26;

/** Share of the outer ring of a sacred lot that carries a border flower. */
export const SACRED_FLOWER_DENSITY = 0.18;

/** How far worn paint fans out from a road or doorstep column, in columns. */
export const WEAR_REACH = 5;

/** Probability a column one step off a lane is worn to path. */
export const WEAR_NEAR = 0.42;

/** Probability a column at {@link WEAR_REACH} is worn — deliberately faint. */
export const WEAR_FAR = 0.03;

/** How far past the cleared hull the transition band reaches, in columns. */
export const TRANSITION_BAND = 14;

/**
 * Share of the band, measured from its inner edge, that is kept tree-free.
 *
 * The inner half is meadow: the ground a village has actually been mowing.
 * The outer half is the thinning wood.
 */
export const TRANSITION_MEADOW_FRACTION = 0.5;

/** In the outer half of the band, one tree in this many survives. */
export const TRANSITION_TREE_KEEP = 6;

/** Share of felled trees that leave a stump standing. */
export const TRANSITION_STUMP_CHANCE = 0.18;

/** Share of felled trees that leave a log lying where they fell. */
export const TRANSITION_LOG_CHANCE = 0.1;

/** Blocks in a fallen log. */
export const TRANSITION_LOG_LENGTH = 3;

/** Share of meadow columns that grow a tuft of grass. */
export const TRANSITION_GRASS_DENSITY = 0.15;

/** Share of meadow columns that grow a flower. */
export const TRANSITION_FLOWER_DENSITY = 0.05;

/** How far past the outermost footprint the ground pass will paint, in columns. */
export const GROUND_CLIP_MARGIN = 24;

/* -------------------------------------------------------------------------- */
/* the category → treatment table                                              */
/* -------------------------------------------------------------------------- */

/** What a lot's leftover ground is made of. */
export type GroundTreatment = "apron" | "garden" | "yard" | "sacred" | "none";

/**
 * The treatment each catalog category asks for.
 *
 * Keyed by `StructureCategory` — the archetype id of a placed building is the
 * catalog id of its entry, so `structureById(archetype).category` is the whole
 * lookup. A category with no entry here (or a building whose archetype is not
 * in the catalog) falls back to {@link DEFAULT_TREATMENT}, which is a garden:
 * the least wrong thing to put beside an unknown building is a hedge.
 */
export const GROUND_TREATMENTS: Readonly<Record<string, GroundTreatment>> = Object.freeze({
  residential: "garden",
  vernacular: "garden",
  rural: "garden",
  nomadic: "garden",
  fantasy: "garden",
  civic: "apron",
  commercial: "apron",
  modern: "apron",
  science: "apron",
  leisure: "apron",
  amusement: "apron",
  "transport-land": "apron",
  "transport-water": "apron",
  "transport-air": "apron",
  industrial: "yard",
  energy: "yard",
  infrastructure: "yard",
  waterworks: "yard",
  military: "yard",
  religious: "sacred",
  memorial: "sacred",
  ruins: "none",
  underground: "none",
  "street-furniture": "none",
});

/** Clamp a dial into 0..1. */
function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The treatment for a building whose category the catalog does not name. */
export const DEFAULT_TREATMENT: GroundTreatment = "garden";

/** The treatment one archetype's lot gets. */
export function treatmentOf(archetype: string | undefined): GroundTreatment {
  if (archetype === undefined) return DEFAULT_TREATMENT;
  const entry = structureById(archetype);
  if (entry === undefined) return DEFAULT_TREATMENT;
  return GROUND_TREATMENTS[entry.category] ?? DEFAULT_TREATMENT;
}

/* -------------------------------------------------------------------------- */
/* pass inputs and outputs                                                     */
/* -------------------------------------------------------------------------- */

/** Everything {@link buildGrounds} reads. */
export interface GroundPassInput {
  readonly buildings: readonly BuiltBuilding[];
  /** Mutated: the surface of every dressed or worn column. */
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Detail seed; every decision hangs off it. */
  readonly seed: number;
  /** 1 on every road column — aprons meet it, worn paint fans out of it. */
  readonly roadColumns?: Uint8Array;
  /** 1 on every plaza column the plaza pass surfaced. */
  readonly paved?: Uint8Array;
  /** 1 on the plaza's well, which nothing may enter. */
  readonly keepClear?: Uint8Array;
  /** 1 on every column the doorstep pass rewrote. */
  readonly doorstepColumns?: Uint8Array;
  /** Read for its `prop` / `building` / `road` / `plaza` tags; never written. */
  readonly occupancy?: OccupancyGrid;
  /**
   * How worn the settlement's open ground is, 0..1 — the `decay.coverage`
   * fan-out row's landing place.
   *
   * It scales the worn-paint probabilities: a kept-up village keeps today's
   * faint speckle, an abandoned one has paths worn right across its greens.
   * Omitted means "today", so a no-intent compile is byte-identical.
   */
  readonly decayCoverage?: number;
  /**
   * How far volunteer growth has reclaimed the ground, 0..1 — the
   * `decay.vegetationReclaim` row's landing place.
   *
   * It scales garden grass and flower density: nobody weeds an abandoned lot,
   * so its garden grows *more*, not less. Omitted means "today".
   */
  readonly vegetationReclaim?: number;
}

/** One dressed lot, for the report and for tests. */
export interface DressedLot {
  readonly nodePath: string;
  readonly treatment: GroundTreatment;
  /** Columns whose surface the treatment rewrote. */
  readonly columns: number;
  /** Blocks the treatment stood on that ground (fence, flowers, grass). */
  readonly blocks: number;
}

/** What {@link buildGrounds} produced. */
export interface GroundPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly lots: readonly DressedLot[];
  /** Columns rewritten by lot dressing. */
  readonly dressedColumns: number;
  /** Columns rewritten by worn paint. */
  readonly wornColumns: number;
}

/**
 * The block states the ground pass writes, resolved once.
 *
 * The three `pave*` states are the **ground roles** of `terrain/palette.ts`,
 * not the plaza's symbols they used to be. A forecourt is the piece of built
 * ground a player reads as belonging to the building it rings, so it is laid in
 * the theme's `plinth` — the building's own base course — broken up with the
 * pavement and the coping the rest of the quarter is paved and capped with.
 * Before this it was `plaza.border` (`stone_bricks`) and `plaza.cobble`
 * (`cobblestone`) whatever theme the settlement was drawn in, which is one of
 * the six places the "everything is the same grey" defect lived.
 */
interface GroundStates {
  /** The masonry against the wall: the theme's `plinth`. */
  readonly paveA: number;
  /** The outer breaking-up course: the theme's `kerb`. */
  readonly paveB: number;
  /** The second tone in the body of an apron: the theme's `pavement`. */
  readonly paveC: number;
  readonly gravel: number;
  readonly coarse: number;
  readonly path: number;
  readonly smooth: number;
  readonly fence: number;
  readonly gate: Readonly<Record<"north" | "south" | "east" | "west", number>>;
  readonly grass: number;
  readonly flowers: readonly number[];
  /** Surface states a treatment is willing to paint over. */
  readonly soft: ReadonlySet<number>;
}

function resolveStates(palette: Palette, stack: PrismarineStack): GroundStates {
  const named = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const symbol = (s: string, fallback: string): number =>
    palette.has(s) ? palette.state(s) : named(fallback);
  const gate = (facing: string): number =>
    stack.blockStateOf("minecraft:oak_fence_gate", {
      facing,
      in_wall: "false",
      open: "false",
      powered: "false",
    }) ?? named("minecraft:oak_fence_gate");
  const soft = new Set<number>();
  for (const name of [
    "minecraft:grass_block",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:podzol",
    "minecraft:rooted_dirt",
    "minecraft:moss_block",
    "minecraft:mud",
  ]) {
    const state = stack.blockByName(name)?.stateId;
    if (state !== undefined) soft.add(state);
  }
  for (const s of ["ground.surface", "ground.coarse_dirt", "ground.podzol", "ground.mud"]) {
    if (palette.has(s)) soft.add(palette.state(s));
  }
  return {
    // The ground roles first, with the pre-role symbol as the fallback, so a
    // caller that never ran `defineGroundRoles` — every unit test that dresses
    // a lot on a bare palette — lays exactly what it always laid.
    paveA: symbol("ground.plinth", "minecraft:stone_bricks"),
    paveB: symbol("street.curb", "minecraft:cobblestone"),
    paveC: symbol("street.sidewalk", "minecraft:smooth_stone"),
    // A working yard is earth and grit and was never part of the grey: it keeps
    // the terrain profile's own symbols, which a document can already override.
    gravel: symbol("ground.gravel", "minecraft:gravel"),
    coarse: symbol("ground.coarse_dirt", "minecraft:coarse_dirt"),
    path: symbol("road.surface", "minecraft:dirt_path"),
    smooth: symbol("street.sidewalk", "minecraft:smooth_stone"),
    fence: symbol("road.post", "minecraft:oak_fence"),
    gate: { north: gate("north"), south: gate("south"), east: gate("east"), west: gate("west") },
    grass: symbol("foliage.short_grass", "minecraft:short_grass"),
    flowers: [
      symbol("flower.poppy", "minecraft:poppy"),
      symbol("flower.dandelion", "minecraft:dandelion"),
      symbol("flower.cornflower", "minecraft:cornflower"),
      symbol("flower.oxeye_daisy", "minecraft:oxeye_daisy"),
      symbol("flower.azure_bluet", "minecraft:azure_bluet"),
    ],
    soft,
  };
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dress every lot, then wear the ground between them.
 *
 * Runs last in the structure pass, after the doorsteps: everything it must not
 * touch has by then declared itself, and the ground it reads is the ground the
 * emitter will lay.
 */
export function buildGrounds(input: GroundPassInput): GroundPassResult {
  const { plan } = input;
  const { region } = plan;
  const cells = region.width * region.depth;
  const blocks: StructureBlock[] = [];
  const lots: DressedLot[] = [];

  if (input.buildings.length === 0) {
    return { blocks, lots, dressedColumns: 0, wornColumns: 0 };
  }

  const states = resolveStates(input.palette, input.stack);
  const reserved = reservedMask(input, cells);
  // Columns this pass has claimed itself, so two neighbouring lots do not
  // fight over the strip between them: first treatment wins, in building order.
  const taken = new Uint8Array(cells);
  const clip = clipBounds(input.buildings, region);

  const free = (x: number, z: number): number => {
    if (!inside(region, x, z)) return -1;
    if (x < clip.x0 || x > clip.x1 || z < clip.z0 || z > clip.z1) return -1;
    const idx = index(region, x, z);
    if (reserved[idx] === 1 || taken[idx] === 1) return -1;
    if (plan.fluidKind[idx] !== FluidKind.NONE) return -1;
    return idx;
  };

  let dressedColumns = 0;
  for (const built of input.buildings) {
    const treatment = treatmentOf(built.meta.params.archetype as unknown as string);
    if (treatment === "none") {
      lots.push({ nodePath: built.nodePath, treatment, columns: 0, blocks: 0 });
      continue;
    }
    const before = blocks.length;
    const columns =
      treatment === "garden"
        ? dressGarden(input, states, built, free, taken, blocks)
        : dressRing(input, states, built, treatment, free, taken, blocks);
    dressedColumns += columns;
    lots.push({
      nodePath: built.nodePath,
      treatment,
      columns,
      blocks: blocks.length - before,
    });
  }

  const wornColumns = wearGround(input, states, reserved, taken, clip);

  // Treated ground is spoken for. The two passes still to come — the scatter
  // and the ground-cover decoration — both read the occupancy grid, and
  // neither should be planting an oak in a forecourt or tufting grass out of a
  // worn path. Claiming here is the whole of that instruction.
  if (input.occupancy !== undefined && input.occupancy.mask.length === cells) {
    const tags = input.occupancy.byTag as Map<string, Uint8Array>;
    let tag = tags.get("ground");
    if (tag === undefined) {
      tag = new Uint8Array(cells);
      tags.set("ground", tag);
    }
    for (let k = 0; k < cells; k++) {
      if (taken[k] !== 1) continue;
      input.occupancy.mask[k] = 1;
      tag[k] = 1;
    }
  }

  return { blocks, lots, dressedColumns, wornColumns };
}

/**
 * Every column this pass may not touch.
 *
 * Building footprints (the rect, not just the covered cells — the envelope is
 * what the solver levelled), roads, the plaza and its well, doorsteps, and
 * anything the occupancy grid has tagged as a building, a road, a plaza or a
 * prop. The union is computed once because every treatment asks the same
 * question of every column it considers.
 */
function reservedMask(input: GroundPassInput, cells: number): Uint8Array {
  const { region } = input.plan;
  const mask = new Uint8Array(cells);
  const or = (source: Uint8Array | undefined): void => {
    if (source === undefined || source.length !== cells) return;
    for (let k = 0; k < cells; k++) if (source[k] === 1) mask[k] = 1;
  };
  or(input.roadColumns);
  or(input.paved);
  or(input.keepClear);
  or(input.doorstepColumns);
  if (input.occupancy !== undefined && input.occupancy.mask.length === cells) {
    for (const tag of ["building", "interior", "road", "plaza", "prop"]) {
      or(input.occupancy.byTag.get(tag));
    }
  }
  for (const built of input.buildings) {
    for (let z = built.footprint.z0; z <= built.footprint.z1; z++) {
      for (let x = built.footprint.x0; x <= built.footprint.x1; x++) {
        if (!inside(region, x, z)) continue;
        mask[index(region, x, z)] = 1;
      }
    }
    // …and the apron columns the building itself stood something in.
    //
    // A window box is a fence on the ground *outside* the wall with a pot on
    // top of it, and a porch lamp is two fence posts and a lantern; both live
    // one column into the apron and neither is in the footprint. Without this
    // the lot dressing plants a garden flower in that exact column, the flower
    // is written after the fence and wins, and the pot above it is left
    // hanging — `unsupported.chain`, found by C1's probe world and reproducible
    // anywhere a building with a window box gets a soft-ground lot.
    for (const key of built.apron?.floor?.keys() ?? []) {
      const comma = key.indexOf(",");
      const x = Number(key.slice(0, comma));
      const z = Number(key.slice(comma + 1));
      if (!inside(region, x, z)) continue;
      mask[index(region, x, z)] = 1;
    }
  }
  return mask;
}

/** The union of every footprint, grown by {@link GROUND_CLIP_MARGIN}. */
function clipBounds(buildings: readonly BuiltBuilding[], region: Region): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const b of buildings) {
    x0 = Math.min(x0, b.footprint.x0);
    x1 = Math.max(x1, b.footprint.x1);
    z0 = Math.min(z0, b.footprint.z0);
    z1 = Math.max(z1, b.footprint.z1);
  }
  return {
    x0: Math.max(region.x0, x0 - GROUND_CLIP_MARGIN),
    x1: Math.min(region.x0 + region.width - 1, x1 + GROUND_CLIP_MARGIN),
    z0: Math.max(region.z0, z0 - GROUND_CLIP_MARGIN),
    z1: Math.min(region.z0 + region.depth - 1, z1 + GROUND_CLIP_MARGIN),
  };
}

/* -------------------------------------------------------------------------- */
/* treatment 1: the ring — aprons, yards and sacred paths                      */
/* -------------------------------------------------------------------------- */

/**
 * A ring of treated ground around a footprint, `radius` columns wide.
 *
 * All three ring treatments share the geometry and differ only in what they
 * lay: an apron is masonry throughout, a yard is gravel and coarse dirt, and a
 * sacred ring is smooth stone next to the wall with a flower border outside it.
 */
function dressRing(
  input: GroundPassInput,
  states: GroundStates,
  built: BuiltBuilding,
  treatment: GroundTreatment,
  free: (x: number, z: number) => number,
  taken: Uint8Array,
  blocks: StructureBlock[],
): number {
  const { plan, seed } = input;
  const radius =
    treatment === "apron" ? APRON_RADIUS : treatment === "yard" ? YARD_RADIUS : SACRED_RADIUS;
  const rect = built.footprint;
  let count = 0;

  for (let z = rect.z0 - radius; z <= rect.z1 + radius; z++) {
    for (let x = rect.x0 - radius; x <= rect.x1 + radius; x++) {
      const dx = x < rect.x0 ? rect.x0 - x : x > rect.x1 ? x - rect.x1 : 0;
      const dz = z < rect.z0 ? rect.z0 - z : z > rect.z1 ? z - rect.z1 : 0;
      const d = Math.max(dx, dz);
      if (d === 0 || d > radius) continue;
      const idx = free(x, z);
      if (idx < 0) continue;
      const g = plan.ground[idx] as number;
      if (Math.abs(g - built.floorY) > LOT_MAX_RELIEF) continue;

      if (treatment === "sacred" && d > 1) {
        // The outer ring of a churchyard is not paved — it is the grass the
        // path runs through, with a border of flowers along it.
        taken[idx] = 1;
        if (
          states.soft.has(plan.surface[idx] as number) &&
          hash2(seed, x, z, 41) < SACRED_FLOWER_DENSITY
        ) {
          blocks.push({ x, y: g + 1, z, stateId: hashPick(seed, x, z, 42, states.flowers) });
        }
        continue;
      }

      plan.surface[idx] = ringState(states, treatment, seed, x, z, d, radius);
      plan.snow[idx] = 0;
      if (plan.soil[idx] === 0) plan.soil[idx] = 1;
      taken[idx] = 1;
      count++;
    }
  }
  return count;
}

/** The surface block one ring column gets. */
function ringState(
  states: GroundStates,
  treatment: GroundTreatment,
  seed: number,
  x: number,
  z: number,
  d: number,
  radius: number,
): number {
  const r = hash2(seed, x, z, 7);
  if (treatment === "yard") {
    if (r < 0.45) return states.gravel;
    if (r < 0.85) return states.coarse;
    return states.path;
  }
  if (treatment === "sacred") return states.smooth;
  // An apron: the building's own base course against the wall, breaking up into
  // the quarter's kerb and grit at its outer edge so it meets the lane rather
  // than stopping at a drawn line.
  if (d < radius) {
    return r < 0.7 ? states.paveA : states.paveC;
  }
  if (r < 0.5) return states.paveB;
  if (r < 0.8) return states.paveA;
  return states.gravel;
}

/* -------------------------------------------------------------------------- */
/* treatment 2: the cottage garden                                             */
/* -------------------------------------------------------------------------- */

/**
 * A fenced garden plot beside a house, on the side away from the traffic.
 *
 * The side is chosen by looking for road columns around the footprint: the
 * garden goes opposite the busiest face, which is the face the door and the
 * lane are on. With no road anywhere near, the plot goes south, which is a
 * choice rather than a guess and is at least consistent.
 *
 * The fence runs the three outer edges of the plot — the fourth is the house
 * wall — with a gate at the midpoint of the far edge, so the garden is enterable
 * rather than sealed.
 */
function dressGarden(
  input: GroundPassInput,
  states: GroundStates,
  built: BuiltBuilding,
  free: (x: number, z: number) => number,
  taken: Uint8Array,
  blocks: StructureBlock[],
): number {
  const { plan, seed } = input;
  const rect = built.footprint;
  const side = quietSide(input, rect);

  // The plot, one column clear of the wall so the fence never touches masonry.
  const plot: Rect =
    side === "north"
      ? { x0: rect.x0, x1: rect.x1, z0: rect.z0 - GARDEN_DEPTH, z1: rect.z0 - 1 }
      : side === "south"
        ? { x0: rect.x0, x1: rect.x1, z0: rect.z1 + 1, z1: rect.z1 + GARDEN_DEPTH }
        : side === "west"
          ? { x0: rect.x0 - GARDEN_DEPTH, x1: rect.x0 - 1, z0: rect.z0, z1: rect.z1 }
          : { x0: rect.x1 + 1, x1: rect.x1 + GARDEN_DEPTH, z0: rect.z0, z1: rect.z1 };

  // The far edge — where the gate goes — and its outward facing.
  const gateX =
    side === "west" ? plot.x0 : side === "east" ? plot.x1 : Math.floor((plot.x0 + plot.x1) / 2);
  const gateZ =
    side === "north" ? plot.z0 : side === "south" ? plot.z1 : Math.floor((plot.z0 + plot.z1) / 2);

  let count = 0;
  for (let z = plot.z0; z <= plot.z1; z++) {
    for (let x = plot.x0; x <= plot.x1; x++) {
      const idx = free(x, z);
      if (idx < 0) continue;
      const g = plan.ground[idx] as number;
      if (Math.abs(g - built.floorY) > LOT_MAX_RELIEF) continue;
      taken[idx] = 1;
      count++;

      const edge = x === plot.x0 || x === plot.x1 || z === plot.z0 || z === plot.z1;
      // The edge against the house is the house; nothing is built on it.
      const againstWall =
        (side === "north" && z === plot.z1) ||
        (side === "south" && z === plot.z0) ||
        (side === "west" && x === plot.x1) ||
        (side === "east" && x === plot.x0);
      if (edge && !againstWall) {
        const isGate = x === gateX && z === gateZ;
        blocks.push({
          x,
          y: g + 1,
          z,
          stateId: isGate ? states.gate[side] : states.fence,
        });
        continue;
      }
      if (edge) continue;

      // Inside: the ground stays what it is (a garden is grass), and the hash
      // decides between a flower, a tuft and bare ground.
      if (!states.soft.has(plan.surface[idx] as number)) continue;
      const r = hash2(seed, x, z, 11);
      // `vegetationReclaim` lifts both densities toward a fully-grown-over
      // plot. 0 (or absent) is exactly today's garden.
      const reclaim = input.vegetationReclaim === undefined ? 0 : clampUnit(input.vegetationReclaim);
      const flowerDensity = GARDEN_FLOWER_DENSITY + (1 - GARDEN_FLOWER_DENSITY) * reclaim * 0.5;
      const grassDensity = GARDEN_GRASS_DENSITY + (1 - GARDEN_GRASS_DENSITY) * reclaim * 0.7;
      if (r < flowerDensity) {
        blocks.push({ x, y: g + 1, z, stateId: hashPick(seed, x, z, 12, states.flowers) });
      } else if (r < flowerDensity + grassDensity) {
        blocks.push({ x, y: g + 1, z, stateId: states.grass });
      }
    }
  }
  return count;
}

/** The side of a footprint with the least road against it. */
function quietSide(
  input: GroundPassInput,
  rect: Rect,
): "north" | "south" | "east" | "west" {
  const road = input.roadColumns;
  const { region } = input.plan;
  const counts: Record<"north" | "south" | "east" | "west", number> = {
    north: 0,
    south: 0,
    east: 0,
    west: 0,
  };
  if (road !== undefined && road.length === region.width * region.depth) {
    const reach = 4;
    for (let k = 1; k <= reach; k++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        if (inside(region, x, rect.z0 - k) && road[index(region, x, rect.z0 - k)] === 1) counts.north++;
        if (inside(region, x, rect.z1 + k) && road[index(region, x, rect.z1 + k)] === 1) counts.south++;
      }
      for (let z = rect.z0; z <= rect.z1; z++) {
        if (inside(region, rect.x0 - k, z) && road[index(region, rect.x0 - k, z)] === 1) counts.west++;
        if (inside(region, rect.x1 + k, z) && road[index(region, rect.x1 + k, z)] === 1) counts.east++;
      }
    }
  }
  // Fixed tie-break order, so a building with no road anywhere gardens south.
  const order = ["south", "north", "east", "west"] as const;
  let best: "north" | "south" | "east" | "west" = "south";
  let bestCount = Number.POSITIVE_INFINITY;
  for (const side of order) {
    if (counts[side] < bestCount) {
      bestCount = counts[side];
      best = side;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* treatment 3: worn ground paint                                              */
/* -------------------------------------------------------------------------- */

/**
 * Speckle the ground around every lane and doorstep with dirt path.
 *
 * A breadth-first sweep out from the road and doorstep columns gives each
 * nearby column a step distance; the probability of wear falls linearly from
 * {@link WEAR_NEAR} at one step to {@link WEAR_FAR} at {@link WEAR_REACH}, and
 * the roll itself is the column's own hash. Only columns whose surface is still
 * soil are eligible, so a treated apron, a cobbled plaza or a beach is never
 * dirtied.
 */
function wearGround(
  input: GroundPassInput,
  states: GroundStates,
  reserved: Uint8Array,
  taken: Uint8Array,
  clip: Rect,
): number {
  const { plan, seed } = input;
  const { region } = plan;
  const cells = region.width * region.depth;
  const sources: number[] = [];
  const push = (source: Uint8Array | undefined): void => {
    if (source === undefined || source.length !== cells) return;
    for (let k = 0; k < cells; k++) if (source[k] === 1) sources.push(k);
  };
  push(input.roadColumns);
  push(input.doorstepColumns);
  if (sources.length === 0) return 0;

  const dist = new Int32Array(cells).fill(-1);
  let frontier = sources;
  for (const k of frontier) dist[k] = 0;
  for (let step = 1; step <= WEAR_REACH; step++) {
    const next: number[] = [];
    for (const k of frontier) {
      const i = k % region.width;
      const j = (k - i) / region.width;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= region.width || nj >= region.depth) continue;
        const nk = nj * region.width + ni;
        if (dist[nk] !== -1) continue;
        dist[nk] = step;
        next.push(nk);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  let worn = 0;
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    if (z < clip.z0 || z > clip.z1) continue;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      if (x < clip.x0 || x > clip.x1) continue;
      const idx = j * region.width + i;
      const d = dist[idx] as number;
      if (d <= 0 || d > WEAR_REACH) continue;
      if (reserved[idx] === 1 || taken[idx] === 1) continue;
      if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
      if (!states.soft.has(plan.surface[idx] as number)) continue;
      // Linear falloff. Integer arithmetic only — no transcendentals anywhere
      // in this module, which §6.5 rule 6 requires and a test enforces.
      const t = (d - 1) / (WEAR_REACH - 1);
      // `decayCoverage` is a *coverage*, not a multiplier: it lifts the whole
      // falloff toward total wear, so 0 is today's speckle and 1 is bare
      // ground everywhere the sweep reached.
      const base = WEAR_NEAR + (WEAR_FAR - WEAR_NEAR) * t;
      const lift = input.decayCoverage === undefined ? 0 : clampUnit(input.decayCoverage);
      const chance = base + (1 - base) * lift;
      if (hash2(seed, x, z, 23) >= chance) continue;
      plan.surface[idx] = hash2(seed, x, z, 24) < 0.65 ? states.path : states.coarse;
      plan.snow[idx] = 0;
      if (plan.soil[idx] === 0) plan.soil[idx] = 1;
      taken[idx] = 1;
      worn++;
    }
  }
  return worn;
}

/* -------------------------------------------------------------------------- */
/* the clearing transition band                                                */
/* -------------------------------------------------------------------------- */

/** Everything {@link buildTransitionBand} reads. */
export interface TransitionBandInput {
  readonly plan: ColumnPlan;
  /** The settlement clearing's hulls — one per cluster of footprints. */
  readonly hulls: readonly (readonly HullPoint[])[];
  /** The scatter's trees, already clipped against the structures. */
  readonly trees: readonly TreePlacement[];
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  readonly seed: number;
  readonly occupancy?: OccupancyGrid;
  /**
   * Ground the band may not dress, as a column predicate.
   *
   * The caller passes the decoration apron here — the dilated footprints, lane
   * corridors and plaza the ground-cover pass already refuses to drop deadwood
   * on. A stump leaning against a garden wall is the same defect whether the
   * undergrowth pass or this one placed it.
   */
  readonly avoid?: (x: number, z: number) => boolean;
}

/** What {@link buildTransitionBand} produced. */
export interface TransitionBandResult {
  /** The trees that survive — the input list minus the felled ones. */
  readonly trees: readonly TreePlacement[];
  /** Stumps, fallen logs, meadow grass and flowers. */
  readonly blocks: readonly StructureBlock[];
  readonly felled: number;
  readonly stumps: number;
  readonly logs: number;
  readonly meadowBlocks: number;
  /** 1 on every column inside the band. */
  readonly band: Uint8Array;
}

/**
 * Thin the wood where it meets a settlement, and dress what is left.
 *
 * A post-pass over the scatter's output, which is the only honest place for it:
 * the question "does this settlement abut dense forest?" cannot be answered
 * before the forest has been planted, and thinning a planted stand keeps every
 * surviving tree exactly where the scatter put it.
 *
 * The band is the annulus from {@link CLEARING_MARGIN} — the edge of the
 * totally cleared hull — out to `CLEARING_MARGIN + TRANSITION_BAND`. Its inner
 * {@link TRANSITION_MEADOW_FRACTION} is felled outright and dressed as meadow;
 * its outer part keeps one tree in {@link TRANSITION_TREE_KEEP}. Every felled
 * tree gets a hash roll for a stump or a fallen log, so the thinning reads as
 * something people did rather than as trees that never grew.
 */
export function buildTransitionBand(input: TransitionBandInput): TransitionBandResult {
  const { plan } = input;
  const { region } = plan;
  const cells = region.width * region.depth;
  const band = new Uint8Array(cells);
  const blocks: StructureBlock[] = [];

  if (input.hulls.length === 0) {
    return {
      trees: input.trees,
      blocks,
      felled: 0,
      stumps: 0,
      logs: 0,
      meadowBlocks: 0,
      band,
    };
  }

  const states = resolveStates(input.palette, input.stack);
  const inner = CLEARING_MARGIN;
  const outer = CLEARING_MARGIN + TRANSITION_BAND;
  const meadowEdge = inner + Math.round(TRANSITION_BAND * TRANSITION_MEADOW_FRACTION);

  /** Distance from the nearest hull, or `outer` when nothing is near. */
  const distance = (x: number, z: number): number => {
    let best = outer + 1;
    for (const hull of input.hulls) {
      const d = distanceToHull(hull, x, z);
      if (d < best) best = d;
    }
    return best;
  };

  // --- the band mask, and the meadow it carries ----------------------------
  let meadowBlocks = 0;
  const occupied = input.occupancy?.mask;
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      const idx = j * region.width + i;
      const d = distance(x, z);
      if (d <= inner || d > outer) continue;
      band[idx] = 1;
      if (d > meadowEdge) continue;
      if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
      if (occupied !== undefined && occupied.length === cells && occupied[idx] === 1) continue;
      if (input.avoid?.(x, z) === true) continue;
      if (!states.soft.has(plan.surface[idx] as number)) continue;
      const g = plan.ground[idx] as number;
      const r = hash2(input.seed, x, z, 61);
      if (r < TRANSITION_FLOWER_DENSITY) {
        blocks.push({ x, y: g + 1, z, stateId: hashPick(input.seed, x, z, 62, states.flowers) });
        meadowBlocks++;
      } else if (r < TRANSITION_FLOWER_DENSITY + TRANSITION_GRASS_DENSITY) {
        blocks.push({ x, y: g + 1, z, stateId: states.grass });
        meadowBlocks++;
      }
    }
  }

  // --- the thinning --------------------------------------------------------
  const kept: TreePlacement[] = [];
  let felled = 0;
  let stumps = 0;
  let logs = 0;
  for (const tree of input.trees) {
    if (!inside(region, tree.x, tree.z) || band[index(region, tree.x, tree.z)] !== 1) {
      kept.push(tree);
      continue;
    }
    const d = distance(tree.x, tree.z);
    const survives =
      d > meadowEdge && hashInt(input.seed, tree.x, tree.z, 71, 0, TRANSITION_TREE_KEEP - 1) === 0;
    if (survives) {
      kept.push(tree);
      continue;
    }
    felled++;
    const roll = hash2(input.seed, tree.x, tree.z, 72);
    if (roll < TRANSITION_STUMP_CHANCE) {
      if (placeStump(input, tree, blocks)) stumps++;
    } else if (roll < TRANSITION_STUMP_CHANCE + TRANSITION_LOG_CHANCE) {
      if (placeFallenLog(input, tree, blocks)) logs++;
    }
  }

  return { trees: kept, blocks, felled, stumps, logs, meadowBlocks, band };
}

/** One or two courses of the felled tree's own log, left standing. */
function placeStump(
  input: TransitionBandInput,
  tree: TreePlacement,
  blocks: StructureBlock[],
): boolean {
  const { plan } = input;
  const { region } = plan;
  if (!inside(region, tree.x, tree.z)) return false;
  if (input.avoid?.(tree.x, tree.z) === true) return false;
  const idx = index(region, tree.x, tree.z);
  if (plan.fluidKind[idx] !== FluidKind.NONE) return false;
  const occupied = input.occupancy?.mask;
  if (occupied !== undefined && occupied.length === region.width * region.depth && occupied[idx] === 1) {
    return false;
  }
  const g = plan.ground[idx] as number;
  // Exactly one course. A two-block stump is a two-log column with nothing over
  // it, which every "no bare trunk tip" invariant in the suite reads as a tree
  // that lost its canopy — and it is not worth breaking that invariant for.
  blocks.push({ x: tree.x, y: g + 1, z: tree.z, stateId: tree.trunkState });
  return true;
}

/**
 * A log lying where the tree fell: {@link TRANSITION_LOG_LENGTH} blocks along
 * one axis, each one resting on its own column's ground.
 *
 * The log's axis is rewritten off the tree's own trunk state, so a felled birch
 * leaves a birch log — decoding the state and re-encoding it with a horizontal
 * axis rather than guessing at a species.
 */
function placeFallenLog(
  input: TransitionBandInput,
  tree: TreePlacement,
  blocks: StructureBlock[],
): boolean {
  const { plan, stack } = input;
  const { region } = plan;
  const alongX = hashInt(input.seed, tree.x, tree.z, 74, 0, 1) === 0;
  const decoded = stack.blockStateProps(tree.trunkState);
  const laid =
    decoded === undefined
      ? tree.trunkState
      : (stack.blockStateOf(decoded.name, { ...decoded.props, axis: alongX ? "x" : "z" }) ??
        tree.trunkState);

  const placed: StructureBlock[] = [];
  for (let k = 0; k < TRANSITION_LOG_LENGTH; k++) {
    const x = tree.x + (alongX ? k : 0);
    const z = tree.z + (alongX ? 0 : k);
    if (!inside(region, x, z)) return false;
    if (input.avoid?.(x, z) === true) return false;
    const idx = index(region, x, z);
    if (plan.fluidKind[idx] !== FluidKind.NONE) return false;
    const occupied = input.occupancy?.mask;
    if (occupied !== undefined && occupied.length === region.width * region.depth && occupied[idx] === 1) {
      return false;
    }
    placed.push({ x, y: (plan.ground[idx] as number) + 1, z, stateId: laid });
  }
  blocks.push(...placed);
  return true;
}
