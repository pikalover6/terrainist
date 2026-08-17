/**
 * **The viaduct** — the ground contract's first `structure.linework` client
 * (`docs/GROUND-CONTRACT-v0.md` §13.2e), and the one band in the dev world
 * where a walk is the only review of a *ground declaration* rather than of a
 * shape.
 *
 * The aqueduct's band next door shows an arcade striding a valley. This one
 * shows the half an arcade cannot do on its own: **something walks onto the
 * deck.** A viaduct's deck is a carriageway, so its two approach embankments are
 * ground the street network has to join rather than cut, and that is a rank-25
 * declaration or it is a ramp of air.
 *
 * ## What the band is shaped to prove, in the order a walker meets it
 *
 * 1. **A run, not a cell** (`CATALOG-EXPANSION` §5 rule 5). The ground has a
 *    level shoulder, a slope, a ravine and a second shoulder, so the resolved
 *    corridor takes a straight, a bend around the ravine's shallow end, a corner
 *    and a climb — one of each, in one run.
 * 2. **The approaches are ground.** East and west of the arcade the embankment
 *    rises one course a column to the deck, so a player walks up onto the
 *    viaduct instead of pillar-jumping onto it. Counted here as
 *    `approachColumns`, and every one of them went through the resolver.
 * 3. **The road passes through by declaration, not by rank.** A carriageway
 *    crosses the western approach. Those columns receive **no claim at all** —
 *    not a bed, not a clearance, not a guard — so the lane keeps its own ground,
 *    and the bed comes back interrupted and says so (`LOAM-T236`). That is
 *    §13.2's original gate instruction, generalised from `infra.wall@0` to every
 *    client of the class.
 * 4. **The bays keep their grade.** No bed is declared under the arcade, ever: a
 *    viaduct that levelled its own bays would be an embankment with holes in it.
 *    `openColumns` counts the arch openings at grade, the way the aqueduct's
 *    band counts its own.
 *
 * Like every band since `infra.ts`, it shapes only its own ground and touches no
 * fluid on the column plan, so nothing north of it moves and
 * `checkFluidStability` stays at zero.
 */

import { infraEntry, nodeSeed } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import { driverForPlan } from "../layout/ground-driver.js";
import type { StructureBlock } from "../structures/buildings.js";
import { buildInfraEntries, type InfraPlacementView } from "../structures/infra-entry.js";
import { declareLinework } from "../structures/linework.js";
import { index } from "../structures/roads.js";
import type { CoursePoint } from "../structures/wall-course.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";

/* -------------------------------------------------------------------------- */
/* the band                                                                    */
/* -------------------------------------------------------------------------- */

export const VIADUCT_WIDTH = 112;
export const VIADUCT_DEPTH = 40;

/** The run's centre row, from the band's north edge. */
const VIADUCT_Z = 20;
/** The two anchors, as offsets along `x`. */
const VIADUCT_A_X = 26;
const VIADUCT_B_X = 103;

/**
 * The ravine the arcade strides, in the band's own `x`.
 *
 * Sixteen deep against the row's `maxPier` of 24 and a `clearance` of 11: the
 * bays over the floor are more than a pier tall below the deck, so the middle of
 * the run is **open ground at grade**, which is the claim the band exists to
 * make about an arcade. The walls are two a column, inside the row's `maxGrade`
 * of four, so the `between` router still finds a corridor across rather than
 * round.
 */
const RAVINE_DEPTH = 16;
const RAVINE_X0 = 44;
const RAVINE_X1 = 68;

/**
 * The western shoulder's climb: the ground the *approach* has to meet.
 *
 * A viaduct on dead-flat ground would declare two embankments of identical
 * length and prove nothing about the grade law. This slope makes the two
 * approaches different lengths, which is the cheapest way to show that the bed
 * is derived from the ground rather than from a constant.
 */
const SLOPE_X0 = 16;
const SLOPE_X1 = 34;
const SLOPE_RISE = 6;

/**
 * The carriageway that crosses the western approach, in band columns.
 *
 * Placed by arithmetic, not by eye: the west abutment stands at
 * {@link VIADUCT_A_X} and the embankment runs **outward** from it, one course a
 * column, so the lane has to be west of the abutment or it is a lane under a
 * bay — which is a different (and already-tested) thing entirely.
 */
const ROAD_CX = 17;
const ROAD_HALF = 3;

/** The band's ground at one of its own columns. */
function viaductGround(baseY: number, dx: number, dz: number): number {
  // A shallow cross-fall, so nothing in the band is a billiard table and the
  // embankment's own flanks have something to meet.
  const fall = Math.round(Math.abs(dz - VIADUCT_Z) / 8);
  let y = baseY - fall;
  if (dx > SLOPE_X0) y += Math.min(SLOPE_RISE, Math.floor((dx - SLOPE_X0) / 3));
  if (dx >= RAVINE_X0 && dx <= RAVINE_X1) {
    const intoWall = Math.min(dx - RAVINE_X0, RAVINE_X1 - dx);
    y -= Math.min(RAVINE_DEPTH, intoWall * 2);
  }
  return y;
}

/** The plan index of a column, or `undefined` outside the region. */
function at(plan: ColumnPlan, x: number, z: number): number | undefined {
  const { region } = plan;
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || i >= region.width || j < 0 || j >= region.depth) return undefined;
  return j * region.width + i;
}

/** A 3×3 patch of ground a route may name — §5's "a name the compiler placed". */
function anchorPatch(cx: number, cz: number): CoursePoint[] {
  const columns: CoursePoint[] = [];
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) columns.push({ x, z });
  }
  return columns;
}

/** What one build of the viaduct band reports. */
export interface ViaductExhibitResult {
  readonly blocks: readonly StructureBlock[];
  readonly columns: number;
  readonly skipped: number;
  readonly diagnostics: readonly string[];
  /** Columns of approach embankment the resolver granted at rank 25. */
  readonly approachColumns: number;
  /** Of those, columns whose declared level the resolver actually wrote. */
  readonly approachHonoured: number;
  /** Approach columns the crossing subtraction refused — the road's own. */
  readonly approachRefused: number;
  /** The deck's one course, and how many columns of it there are. */
  readonly deckY: number;
  readonly deckColumns: number;
  /** Courses of deck that are not at {@link deckY} — a level deck has none. */
  readonly offLevel: number;
  /** Centre columns of deck with air above them: the carriageway, end to end. */
  readonly walkable: number;
  /**
   * Columns of the run's centre line with **nothing at grade** — the arch
   * openings, counted rather than eyeballed.
   */
  readonly openColumns: number;
  /** The carriageway that crosses the western approach, in world columns. */
  readonly road: {
    readonly x0: number;
    readonly x1: number;
    readonly z0: number;
    readonly z1: number;
  };
  readonly centreZ: number;
}

/**
 * Cut the ravine, paint the crossing lane, declare the approaches and throw the
 * viaduct across.
 *
 * **Declare early, build late, in one function** — which is the one place this
 * band differs from every other exhibit, and it differs because that split *is*
 * the contract. `declareLinework` commits the bed through a real
 * {@link driverForPlan}, the resolver arbitrates it, the driver writes the
 * answer into the plan, and only then does `buildInfraEntries` lay a block. The
 * pipeline does the same thing with four hundred columns of world between the
 * two halves.
 */
export function buildViaductExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  baseY: number,
): ViaductExhibitResult {
  for (let dz = 0; dz < VIADUCT_DEPTH; dz++) {
    for (let dx = 0; dx < VIADUCT_WIDTH; dx++) {
      const k = at(plan, x0 + dx, z0 + dz);
      if (k === undefined) continue;
      const y = viaductGround(baseY, dx, dz);
      plan.ground[k] = y;
      plan.fluidTop[k] = y;
      plan.fluidKind[k] = FluidKind.NONE;
    }
  }

  const centreZ = z0 + VIADUCT_Z;
  const road = {
    x0: x0 + ROAD_CX - ROAD_HALF,
    x1: x0 + ROAD_CX + ROAD_HALF,
    z0,
    z1: z0 + VIADUCT_DEPTH - 1,
  };
  const pathState = stack.blockStateOf("dirt_path", {}) ?? 0;
  for (let z = road.z0; z <= road.z1; z++) {
    for (let x = road.x0; x <= road.x1; x++) {
      const k = at(plan, x, z);
      if (k !== undefined) plan.surface[k] = pathState;
    }
  }

  // The solved carriageway, as a mask over the whole region. In the pipeline
  // this is `solvedCarriagewayMask` over the street graphs; here the band paints
  // its own lane, so the band states it directly — the pass takes a mask and
  // does not care who rasterized it.
  const carriageway = new Uint8Array(plan.region.width * plan.region.depth);
  for (let z = road.z0; z <= road.z1; z++) {
    for (let x = road.x0 - 1; x <= road.x1 + 1; x++) {
      const k = at(plan, x, z);
      if (k !== undefined) carriageway[k] = 1;
    }
  }

  const extents = new Map<string, CoursePoint[]>([
    ["west_yard", anchorPatch(x0 + VIADUCT_A_X, centreZ)],
    ["east_yard", anchorPatch(x0 + VIADUCT_B_X, centreZ)],
  ]);
  const view: InfraPlacementView = {
    bounds: { x0, z0, width: VIADUCT_WIDTH, depth: VIADUCT_DEPTH },
    extentOf: (id) => extents.get(id),
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: (x, z) => {
      const k = at(plan, x, z);
      if (k === undefined) return undefined;
      if (plan.fluidKind[k] !== FluidKind.NONE) return undefined;
      return plan.ground[k] as number;
    },
    onRoad: (x, z) => {
      const k = at(plan, x, z);
      return k !== undefined && carriageway[k] === 1;
    },
  };

  const def = infraEntry("viaduct");
  if (def === undefined) throw new Error('viaduct exhibit: registry has no "viaduct"');
  const nodePath = "dev.infra.viaduct";
  const job = {
    nodePath,
    def,
    route: { form: "between" as const, target: "west_yard → east_yard", targets: ["west_yard", "east_yard"] as [string, string] },
    params: {},
    seed: nodeSeed(worldSeed, nodePath, ""),
    gates: true,
  };

  // --- declare ------------------------------------------------------------
  const driver = driverForPlan(plan);
  const declared = declareLinework({
    region: plan.region,
    jobs: [job],
    view,
    ground: driver,
    carriageway,
    fluidKind: driver.baseline.fluidKind,
  });
  const bed = declared.beds.get(nodePath);
  const approachColumns = bed?.columns.length ?? 0;
  let approachHonoured = 0;
  for (const column of bed?.columns ?? []) {
    if ((plan.ground[column.idx] as number) === column.y) approachHonoured++;
  }
  // What the crossing subtraction took, from the pass's own count rather than
  // from a re-derivation here: these are the columns the embankment wanted and
  // the lane already owned, and they received **no claim at all**.
  const approachRefused = declared.stats["lineworkBedColumnsSubtracted"] ?? 0;

  // --- build --------------------------------------------------------------
  const result = buildInfraEntries({
    plan,
    stack,
    jobs: [job],
    view,
    ground: driver,
    lineworkBeds: declared.beds,
  });

  const deckY = bed?.deckY ?? 0;
  const centre = result.blocks.filter((b) => b.z === centreZ && b.y === deckY);
  const above = new Set(
    result.blocks.filter((b) => b.z === centreZ && b.y > deckY).map((b) => `${b.x},${b.y}`),
  );
  let walkable = 0;
  for (const b of centre) if (!above.has(`${b.x},${deckY + 1}`)) walkable++;

  const occupied = new Set<number>();
  for (const b of result.blocks) {
    if (b.z !== centreZ) continue;
    const k = at(plan, b.x, b.z);
    if (k === undefined) continue;
    if (b.y === (plan.ground[k] as number) + 1) occupied.add(b.x);
  }
  let openColumns = 0;
  for (let x = x0 + VIADUCT_A_X + 1; x < x0 + VIADUCT_B_X; x++) {
    if (!occupied.has(x)) openColumns++;
  }

  return {
    blocks: result.blocks,
    columns: result.entries.reduce((n, e) => n + e.columns, 0),
    skipped: result.entries.reduce((n, e) => n + e.skipped, 0),
    diagnostics: [...declared.diagnostics, ...result.diagnostics].map((d) => d.code),
    approachColumns,
    approachHonoured,
    approachRefused,
    deckY,
    deckColumns: centre.length,
    offLevel: result.blocks.filter((b) => b.z === centreZ && b.y === deckY - 1).length,
    walkable,
    openColumns,
    road,
    centreZ,
  };
}

/** Region index of a band column, for a caller that wants one. */
export function viaductIndex(plan: ColumnPlan, x: number, z: number): number {
  return index(plan.region, x, z);
}
