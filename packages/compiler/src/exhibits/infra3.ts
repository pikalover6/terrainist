/**
 * The **carried and poled spans** — the three `between` clients that landed
 * after the harbour chain (`infra-entries.ts`, W6) and that a walk is the only
 * review of:
 *
 * 1. **`aqueduct`** — a level trough of held water on an arcade, thrown across a
 *    valley. The valley is cut deeper than the row's `maxPier`, so the middle
 *    bays have **no leg at all** and the arcade strides them: that is the one
 *    claim about an aqueduct that a cross-section cannot make, and it is the
 *    reason this band's ground is a valley rather than a slope.
 * 2. **`telegraph_line`** — poles at a pitch down a rolling run, with a
 *    carriageway crossing it once *on a column the pitch lands a pole in*. The
 *    pole steps aside and the wire crosses over, which is the whole of what
 *    `crossings: "open"` means for a poled span.
 * 3. **`maglev_pylon`** — a dead-level guideway on slender pylons over ground
 *    that is not level anywhere. The beam's centre is bare deck with air over
 *    it, so the guideway is walkable end to end.
 *
 * **Three bands rather than one**, unlike the water movers' watercourse, and
 * for a reason that is about the ground rather than about tidiness: each of the
 * three entries is *about* a different ground — a valley, a roll, a jumble —
 * and a single band would have to pick one and then show two of the three
 * spans over the wrong terrain. Each band shapes only its own ground, in the
 * `infra.ts`/`infra2.ts` idiom, so nothing north of these exhibits moves; none
 * of the three touches a fluid on the column plan, so `checkFluidStability`
 * stays at zero (the aqueduct's water is nine blocks in the air and is held by
 * placed masonry, which is exactly why the row is not a `fluid.channel`).
 */

import { infraEntry, nodeSeed } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { StructureBlock } from "../structures/buildings.js";
import {
  buildInfraEntries,
  type InfraPlacementView,
} from "../structures/infra-entry.js";
import type { CoursePoint } from "../structures/wall-course.js";

/* -------------------------------------------------------------------------- */
/* shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** The plan index of a column, or `undefined` outside the region. */
function at(plan: ColumnPlan, x: number, z: number): number | undefined {
  const { region } = plan;
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || i >= region.width || j < 0 || j >= region.depth) return undefined;
  return j * region.width + i;
}

/**
 * Shape a band's ground, dry, from a height function of its own columns.
 *
 * The dev world's one shaping primitive: `flatten` with the constant taken out.
 * `dx`/`dz` are offsets from the band's north-west corner, so a band's profile
 * is written in its own coordinates and moves with it.
 */
function shape(
  plan: ColumnPlan,
  x0: number,
  z0: number,
  width: number,
  depth: number,
  yAt: (dx: number, dz: number) => number,
): void {
  for (let dz = 0; dz < depth; dz++) {
    for (let dx = 0; dx < width; dx++) {
      const k = at(plan, x0 + dx, z0 + dz);
      if (k === undefined) continue;
      const y = yAt(dx, dz);
      plan.ground[k] = y;
      plan.fluidTop[k] = y;
      plan.fluidKind[k] = FluidKind.NONE;
    }
  }
}

/** A 3×3 patch of ground a route may name — §5's "a name the compiler placed". */
function anchorPatch(cx: number, cz: number): CoursePoint[] {
  const columns: CoursePoint[] = [];
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) columns.push({ x, z });
  }
  return columns;
}

/** The four questions a placement view is, over a band that owns its ground. */
function bandView(
  plan: ColumnPlan,
  x0: number,
  z0: number,
  width: number,
  depth: number,
  extents: Map<string, CoursePoint[]>,
  onRoad: (x: number, z: number) => boolean,
): InfraPlacementView {
  return {
    bounds: { x0, z0, width, depth },
    extentOf: (id) => extents.get(id),
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: (x, z) => {
      const k = at(plan, x, z);
      if (k === undefined) return undefined;
      if (plan.fluidKind[k] !== FluidKind.NONE) return undefined;
      return plan.ground[k] as number;
    },
    onRoad,
  };
}

/** Run one `between` job through the real entry path. */
function runBetween(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  entry: string,
  nodePath: string,
  a: string,
  b: string,
  view: InfraPlacementView,
): {
  blocks: readonly StructureBlock[];
  columns: number;
  skipped: number;
  diagnostics: readonly string[];
} {
  const def = infraEntry(entry);
  if (def === undefined) throw new Error(`span exhibit: registry has no "${entry}"`);
  const result = buildInfraEntries({
    plan,
    stack,
    jobs: [
      {
        nodePath,
        def,
        route: { form: "between", target: `${a} → ${b}`, targets: [a, b] },
        params: {},
        seed: nodeSeed(worldSeed, nodePath, ""),
        gates: false,
      },
    ],
    view,
  });
  return {
    blocks: result.blocks,
    columns: result.entries.reduce((n, e) => n + e.columns, 0),
    skipped: result.entries.reduce((n, e) => n + e.skipped, 0),
    diagnostics: result.diagnostics.map((d) => d.code),
  };
}

/* -------------------------------------------------------------------------- */
/* 1. the aqueduct                                                             */
/* -------------------------------------------------------------------------- */

export const AQUEDUCT_WIDTH = 104;
export const AQUEDUCT_DEPTH = 32;

/** The run's centre row, from the band's north edge. */
const AQUEDUCT_Z = 16;
/** The two anchors, as offsets along `x`. */
const AQUEDUCT_A_X = 8;
const AQUEDUCT_B_X = 95;

/**
 * The valley, in the band's own `x`: level shoulders, two slopes of two blocks
 * a column, and a floor twenty below.
 *
 * Twenty is the number that matters and it is arithmetic rather than taste. The
 * deck stands `clearance` (9) above the higher anchor's `standY`, so a bay is
 * left open when its own ground is more than `maxPier` (24) below the deck —
 * that is, more than sixteen below the shoulders. A valley twenty deep
 * therefore has a rank of **open** bays over its floor and legs everywhere
 * else, which is the read the band exists for. The slope is two a column
 * against the row's `maxGrade` of four, so the corridor the `between` router
 * needs still exists; the valley crosses the whole band, so it cannot be walked
 * round instead.
 */
const VALLEY_DEPTH = 20;
const VALLEY_SLOPE_X0 = 36;
const VALLEY_FLOOR_X0 = 46;
const VALLEY_FLOOR_X1 = 58;
const VALLEY_SLOPE_X1 = 68;

/** Blocks below the shoulders at band column `dx`. */
function valleyDrop(dx: number): number {
  if (dx <= VALLEY_SLOPE_X0 || dx >= VALLEY_SLOPE_X1) return 0;
  if (dx >= VALLEY_FLOOR_X0 && dx <= VALLEY_FLOOR_X1) return VALLEY_DEPTH;
  if (dx < VALLEY_FLOOR_X0) return Math.min(VALLEY_DEPTH, (dx - VALLEY_SLOPE_X0) * 2);
  return Math.min(VALLEY_DEPTH, (VALLEY_SLOPE_X1 - dx) * 2);
}

/** What one build of the aqueduct band reports. */
export interface AqueductExhibitResult {
  readonly blocks: readonly StructureBlock[];
  readonly columns: number;
  readonly skipped: number;
  /** Diagnostic codes the pass raised — empty is the exhibit passing. */
  readonly diagnostics: readonly string[];
  /**
   * Blocks of water standing in the trough, the course they sit at, and how
   * many distinct courses there are — a level channel has exactly one.
   */
  readonly waterBlocks: number;
  readonly waterY: number;
  readonly waterCourses: number;
  /**
   * Columns of the run's centre line with **nothing at grade** — the arch
   * openings, counted rather than eyeballed.
   */
  readonly openColumns: number;
  /** Where a walker meets the arcade: the deck's course, and the run's row. */
  readonly deckY: number;
  readonly centreZ: number;
}

/** Cut the valley and throw the aqueduct across it. */
export function buildAqueductExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  baseY: number,
): AqueductExhibitResult {
  shape(plan, x0, z0, AQUEDUCT_WIDTH, AQUEDUCT_DEPTH, (dx) => baseY - valleyDrop(dx));

  const centreZ = z0 + AQUEDUCT_Z;
  const extents = new Map<string, CoursePoint[]>([
    ["spring_head", anchorPatch(x0 + AQUEDUCT_A_X, centreZ)],
    ["town_cistern", anchorPatch(x0 + AQUEDUCT_B_X, centreZ)],
  ]);
  const view = bandView(plan, x0, z0, AQUEDUCT_WIDTH, AQUEDUCT_DEPTH, extents, () => false);
  const built = runBetween(
    plan,
    stack,
    worldSeed,
    "aqueduct",
    "dev.infra.aqueduct",
    "spring_head",
    "town_cistern",
    view,
  );

  const water = stack.blockByName("water")?.stateId;
  const wet = built.blocks.filter((b) => b.stateId === water);
  // Nothing of the entry standing at grade on the centre line is an opening —
  // the valley floor's whole width, plus every bay between two piers.
  const occupied = new Set<number>();
  for (const b of built.blocks) {
    if (b.z !== centreZ) continue;
    const k = at(plan, b.x, b.z);
    if (k === undefined) continue;
    if (b.y === (plan.ground[k] as number) + 1) occupied.add(b.x);
  }
  let openColumns = 0;
  for (let x = x0 + AQUEDUCT_A_X + 1; x < x0 + AQUEDUCT_B_X; x++) {
    if (!occupied.has(x)) openColumns++;
  }

  return {
    blocks: built.blocks,
    columns: built.columns,
    skipped: built.skipped,
    diagnostics: built.diagnostics,
    waterBlocks: wet.length,
    waterY: (wet[0]?.y ?? 0) as number,
    waterCourses: new Set(wet.map((b) => b.y)).size,
    openColumns,
    // `standY` is the first air over the ground, so the deck is one course
    // above the shoulder plus the row's clearance.
    deckY: baseY + 1 + 9,
    centreZ,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. the telegraph line                                                       */
/* -------------------------------------------------------------------------- */

export const TELEGRAPH_WIDTH = 104;
export const TELEGRAPH_DEPTH = 28;

const TELEGRAPH_Z = 14;
const TELEGRAPH_A_X = 6;
const TELEGRAPH_B_X = 97;

/**
 * The carriageway, in the band's own `x` — and it is placed by arithmetic.
 *
 * The poles stand at path indices `0, 12, 24, …` from the first anchor, so the
 * pole this street has to displace is the one at index 36, which is column
 * `TELEGRAPH_A_X + 36`. A road that missed it by a column would still be a
 * road, and the exhibit would silently stop showing the thing it is for.
 */
const TELEGRAPH_ROAD_CX = TELEGRAPH_A_X + 36;
const TELEGRAPH_ROAD_HALF = 2;

/** The roll: two blocks up and down, twice across the band, and never steep. */
function rollAt(baseY: number, dx: number, dz: number): number {
  const a = Math.round(2 * Math.sin((dx / 17) * Math.PI));
  const b = Math.round(Math.sin((dz / 11) * Math.PI));
  return baseY + a + b;
}

/** What one build of the telegraph band reports. */
export interface TelegraphExhibitResult {
  readonly blocks: readonly StructureBlock[];
  readonly columns: number;
  /** Supports the pass refused — the street's own pole is in here. */
  readonly skipped: number;
  readonly diagnostics: readonly string[];
  /** Blocks of wire, and the wire columns standing over the carriageway. */
  readonly wireBlocks: number;
  readonly wireOverRoad: number;
  /** Poles that stood: one column each, counted at the surface. */
  readonly poles: number;
  /** The carriageway, in world columns, for the walk. */
  readonly road: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
  readonly centreZ: number;
}

/** Roll the ground, paint one street, and string the line across it. */
export function buildTelegraphExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  baseY: number,
): TelegraphExhibitResult {
  shape(plan, x0, z0, TELEGRAPH_WIDTH, TELEGRAPH_DEPTH, (dx, dz) => rollAt(baseY, dx, dz));

  const centreZ = z0 + TELEGRAPH_Z;
  const road = {
    x0: x0 + TELEGRAPH_ROAD_CX - TELEGRAPH_ROAD_HALF,
    x1: x0 + TELEGRAPH_ROAD_CX + TELEGRAPH_ROAD_HALF,
    z0,
    z1: z0 + TELEGRAPH_DEPTH - 1,
  };
  const pathState = stack.blockStateOf("dirt_path", {}) ?? 0;
  for (let z = road.z0; z <= road.z1; z++) {
    for (let x = road.x0; x <= road.x1; x++) {
      const k = at(plan, x, z);
      if (k !== undefined) plan.surface[k] = pathState;
    }
  }
  const onRoad = (x: number, z: number): boolean =>
    x >= road.x0 && x <= road.x1 && z >= road.z0 && z <= road.z1;

  const extents = new Map<string, CoursePoint[]>([
    ["west_office", anchorPatch(x0 + TELEGRAPH_A_X, centreZ)],
    ["east_office", anchorPatch(x0 + TELEGRAPH_B_X, centreZ)],
  ]);
  const view = bandView(plan, x0, z0, TELEGRAPH_WIDTH, TELEGRAPH_DEPTH, extents, onRoad);
  const built = runBetween(
    plan,
    stack,
    worldSeed,
    "telegraph_line",
    "dev.infra.telegraph",
    "west_office",
    "east_office",
    view,
  );

  const bars = stack.blockByName("iron_bars")?.stateId;
  const wire = built.blocks.filter((b) => b.stateId === bars);
  const poles = new Set<string>();
  for (const b of built.blocks) {
    if (b.stateId === bars) continue;
    const k = at(plan, b.x, b.z);
    if (k !== undefined && b.y === (plan.ground[k] as number) + 1) poles.add(`${b.x},${b.z}`);
  }

  return {
    blocks: built.blocks,
    columns: built.columns,
    skipped: built.skipped,
    diagnostics: built.diagnostics,
    wireBlocks: wire.length,
    wireOverRoad: new Set(wire.filter((b) => onRoad(b.x, b.z)).map((b) => b.x)).size,
    poles: poles.size,
    road,
    centreZ,
  };
}

/* -------------------------------------------------------------------------- */
/* 3. the maglev guideway                                                      */
/* -------------------------------------------------------------------------- */

export const MAGLEV_WIDTH = 104;
export const MAGLEV_DEPTH = 28;

const MAGLEV_Z = 14;
const MAGLEV_A_X = 6;
const MAGLEV_B_X = 97;

/**
 * The jumble: nothing level anywhere, and nothing the pylons cannot found on.
 *
 * A deterministic integer hash rather than a curve, because the claim under
 * test is *the beam does not care* — a sine would let a level deck read as a
 * coincidence of phase. Steps stay within the row's `maxGrade` of eight and the
 * whole range within its `maxPier` of thirty-two, so every pylon stands.
 */
function jumbleAt(baseY: number, dx: number, dz: number): number {
  const h = Math.sin(dx * 0.41 + dz * 0.17) + Math.sin(dx * 0.13 - dz * 0.29);
  return baseY + Math.round(h * 2.5);
}

/** What one build of the maglev band reports. */
export interface MaglevExhibitResult {
  readonly blocks: readonly StructureBlock[];
  readonly columns: number;
  readonly skipped: number;
  readonly diagnostics: readonly string[];
  /** The beam's one course, and how many columns of it there are. */
  readonly deckY: number;
  readonly beamColumns: number;
  /** Courses of beam that are not at {@link deckY} — a level beam has none. */
  readonly offLevel: number;
  /** Centre columns of beam with air above them: the walk, end to end. */
  readonly walkable: number;
  /** Pylons founded on the ground, counted at the surface. */
  readonly pylons: number;
  readonly centreZ: number;
}

/** Rumple the ground and survey a guideway straight over it. */
export function buildMaglevExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  baseY: number,
): MaglevExhibitResult {
  shape(plan, x0, z0, MAGLEV_WIDTH, MAGLEV_DEPTH, (dx, dz) => jumbleAt(baseY, dx, dz));

  const centreZ = z0 + MAGLEV_Z;
  const extents = new Map<string, CoursePoint[]>([
    ["north_terminus", anchorPatch(x0 + MAGLEV_A_X, centreZ)],
    ["south_terminus", anchorPatch(x0 + MAGLEV_B_X, centreZ)],
  ]);
  const view = bandView(plan, x0, z0, MAGLEV_WIDTH, MAGLEV_DEPTH, extents, () => false);
  const built = runBetween(
    plan,
    stack,
    worldSeed,
    "maglev_pylon",
    "dev.infra.maglev",
    "north_terminus",
    "south_terminus",
    view,
  );

  const deckState = stack.blockByName("smooth_stone")?.stateId;
  const beam = built.blocks.filter((b) => b.stateId === deckState && b.z === centreZ);
  const deckY = beam.length === 0 ? 0 : Math.min(...beam.map((b) => b.y));
  const above = new Set(
    built.blocks.filter((b) => b.z === centreZ && b.y > deckY).map((b) => `${b.x},${b.y}`),
  );
  let walkable = 0;
  for (const b of beam) if (!above.has(`${b.x},${deckY + 1}`)) walkable++;

  const pylons = new Set<string>();
  for (const b of built.blocks) {
    const k = at(plan, b.x, b.z);
    if (k !== undefined && b.y === (plan.ground[k] as number) + 1) pylons.add(`${b.x},${b.z}`);
  }

  return {
    blocks: built.blocks,
    columns: built.columns,
    skipped: built.skipped,
    diagnostics: built.diagnostics,
    deckY,
    beamColumns: beam.length,
    offLevel: beam.filter((b) => b.y !== deckY).length,
    walkable,
    pylons: pylons.size,
    centreZ,
  };
}
