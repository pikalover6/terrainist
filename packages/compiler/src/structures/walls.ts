/**
 * `infra.wall@0` — **the circumvallation pass**.
 *
 * What it replaces: the `curtain_wall` *prop* in
 * `packages/stdlib/src/structures/props-blitz.ts`. That is a straight segment
 * placed as an object — it cannot ring anything, it cannot follow a slope, and
 * a settlement wanting a wall got a handful of individual segments oddly placed
 * near each other. This pass is the other thing: one closed course, derived
 * from the settlement that actually got built, swept over the real ground.
 *
 * ## The three parts, and where each lives
 *
 * 1. `structures/wall-course.ts` — **where the wall goes**. A 15°-quantized
 *    support hull of the settlement's placed footprint, offset outward by the
 *    margin, rasterized 4-connected. Pure geometry, no plan, no seed.
 * 2. `structures/wall-sweep-seam.ts` — **the cross-section over terrain**. The
 *    pinned `SweptProfile` contract, with a local fixture engine until
 *    `structures/sweep.ts` lands. One import, one swap.
 * 3. This file — **the blocks**. Every one is written through
 *    `structures/life.ts`'s {@link Planter}, which is what makes the pass
 *    physics-lint-clean without a second opinion about occupancy: a column the
 *    wall cannot claim in full is skipped whole (the SweptProfile contract's
 *    rule 7, which is also the life pass's rule).
 *
 * ## Gates
 *
 * A gate is not authored and is not placed. It exists **because a carriageway
 * crosses the course**, so it is found rather than sited: every maximal run of
 * course columns a road claims becomes one opening, widened by a jamb either
 * side, and the sweep is told to skip those indices. Nothing is written in the
 * carriageway — the road passes through the wall, not the other way round. The
 * gatehouse is a pair of towers flanking the opening, seated on the first
 * course column outside it, which is where a real gatehouse's piers stand.
 *
 * ## Terrain following
 *
 * `follow: "step"` with `maxGrade: 1`. The datum is the 1-Lipschitz **upper**
 * envelope of `ground + height`, so the crest is never *less* than the asked
 * height above the ground and never steps by more than one block per column —
 * which means the wall-walk is walkable end to end by construction rather than
 * by a tread pass. On a dip the wall grows a footing down to the ground; past
 * {@link WALL_MAX_FILL} courses of it the column is refused, because past that
 * the thing is not a wall on a slope, it is a dam.
 *
 * ## Determinism
 *
 * The course is a pure function of the placement; the datum is a pure function
 * of the course and the plan; the merlon parity is `pathIndex % 2`. Nothing
 * here draws a random number at all, which is why there is no seed parameter.
 */

import { note, warning, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { ColumnPlan } from "../terrain/columns.js";

import type { StructureBlock } from "./buildings.js";
import { Planter, buildLifeWorld, op, type LifeOp, type PlaceRule } from "./life.js";
import { index, inside } from "./roads.js";
import {
  deriveWallCourse,
  findGates,
  inGate,
  type CoursePoint,
  type WallCourse,
  type WallGate,
} from "./wall-course.js";
// ---------------------------------------------------------------------------
// IMPORT SEAM. When `structures/sweep.ts` lands, this import becomes
// `import { sweep } from "./sweep.js"` behind the same adapter. See the module
// note in `wall-sweep-seam.ts` — nothing below this line knows the difference.
// ---------------------------------------------------------------------------
import { sweepCourse, type SweptColumn, type SweptProfile } from "./wall-sweep-seam.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Defaults for the author-facing knobs. Mirrors `WallOptions`. */
export const WALL_DEFAULT_MARGIN = 10;
export const WALL_DEFAULT_TOWER_PITCH = 40;
export const WALL_DEFAULT_HEIGHT = 6;

/**
 * Courses of footing one wall column will sink to reach the ground.
 *
 * The wall stands on the ground it crosses; a hollow between two knolls is made
 * up by building down. Past this the course picked a bad line and the honest
 * outcome is a hole in the wall reported as a note, not a twenty-block masonry
 * dam across a valley.
 */
export const WALL_MAX_FILL = 18;

/** Columns a tower is across, and how far it stands proud of the wall-walk. */
export const WALL_TOWER_SIDE = 5;
export const WALL_TOWER_RISE = 4;

/** A generous ceiling on recipes, in the shape `SET_PIECE_BUDGET` has. */
export const WALL_BUDGET = 60_000;

/**
 * The wall's own place rule.
 *
 * `requireFreeColumn` is on and stays on: a wall that grew through a house
 * would be the `curtain_wall` prop's defect with more blocks. The course is
 * derived to sit outside everything, so a column this refuses is a genuine
 * collision — a lane's shoulder, a prop, a tree the scatter got to first — and
 * skipping it whole is the contract.
 */
const WALL_RULE: PlaceRule = { requireFreeColumn: true, requireEmptyVoxel: true };

/* -------------------------------------------------------------------------- */
/* materials                                                                   */
/* -------------------------------------------------------------------------- */

/** The block vocabulary one wall style is built from. */
export interface WallMaterials {
  /** The body of the curtain, and its footing. */
  readonly core: string;
  /** The wall-walk's top course — what a player stands on. */
  readonly walk: string;
  /** The parapet band either side of the walk. */
  readonly parapet: string;
  /** The merlon course on top of the parapet. */
  readonly merlon: string;
  /** A tower's body. */
  readonly tower: string;
}

/**
 * Materials per style — three constructions, not three palettes.
 *
 * Every entry is a **full cube**. No slabs, no stairs, no fences: a wall is the
 * one structure where every one of those is either a physics finding waiting to
 * happen (`floating.slab`, `connection.stale`) or a hole a mob can path
 * through, and the crenellation reads from the *gap*, not from the block shape.
 */
export const WALL_MATERIALS: Readonly<Record<string, WallMaterials>> = Object.freeze({
  masonry: {
    core: "stone_bricks",
    walk: "stone_bricks",
    parapet: "stone_bricks",
    merlon: "chiseled_stone_bricks",
    tower: "stone_bricks",
  },
  palisade: {
    core: "spruce_log",
    walk: "spruce_planks",
    parapet: "spruce_log",
    merlon: "stripped_spruce_log",
    tower: "spruce_log",
  },
  earthwork: {
    core: "packed_mud",
    walk: "mud_bricks",
    parapet: "mud_bricks",
    merlon: "packed_mud",
    tower: "mud_bricks",
  },
});

/* -------------------------------------------------------------------------- */
/* the profile                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The wall's cross-section, as a pinned {@link SweptProfile}.
 *
 * Three columns across: parapet, wall-walk, parapet. That is the narrowest
 * section that is still a *wall* rather than a fence — a player can walk the
 * crest, and the two parapets give the crenellation something to stand on. The
 * `tower` interval feature is `at: "both"`, so towers land at the pitch **and**
 * at every corner of the course, which is where a real curtain puts them: a
 * corner is the one place a wall cannot be flanked from along its own face.
 */
export function wallProfile(style: string, towerPitch: number): SweptProfile {
  const m = (WALL_MATERIALS[style] ?? WALL_MATERIALS["masonry"]) as WallMaterials;
  return {
    id: `infra.wall@0/${style}`,
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      { id: "walk", role: "walkway", width: 1, centred: true, surface: m.walk, fill: m.core },
      {
        id: "parapet",
        role: "parapet",
        width: 1,
        surface: m.parapet,
        fill: m.core,
        cap: { height: 2, block: m.merlon },
      },
    ],
    features: [{ id: "tower", pitch: towerPitch, at: "both", offset: 0 }],
  };
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** One settlement asking for a wall. */
export interface WallJob {
  /** The `district` or `city` node the wall rings. */
  readonly nodePath: string;
  /** Resolved from the node's `params.walls`. */
  readonly style: string;
  readonly margin: number;
  readonly towerPitch: number;
  readonly height: number;
  readonly gates: boolean;
  /**
   * The settlement's placed footprint, as columns.
   *
   * In practice the corners of every building rectangle under the node: the
   * support hull only ever reads extreme projections, so a rectangle
   * contributes exactly its four corners and handing it every interior column
   * would be the same answer for thousands of times the work.
   */
  readonly extent: readonly CoursePoint[];
}

/** Everything {@link buildWalls} reads. */
export interface WallPassInput {
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly jobs: readonly WallJob[];
  /** Every block written so far, in emit order — the occupancy view. */
  readonly existing?: readonly StructureBlock[];
  /** True on a carriageway column. Both the gate finder and an absolute veto. */
  readonly onRoad?: (x: number, z: number) => boolean;
}

/** One wall, as built. */
export interface BuiltWall {
  readonly nodePath: string;
  readonly style: string;
  readonly course: WallCourse;
  readonly gates: readonly WallGate[];
  readonly towers: number;
  /** Course columns the sweep claimed and the planter accepted. */
  readonly columns: number;
  /** Course columns refused — collision, unbuildable ground, or too deep. */
  readonly skipped: number;
}

/** What {@link buildWalls} produced. */
export interface WallPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly walls: readonly BuiltWall[];
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: Readonly<Record<string, number>>;
}

/** Ring every settlement that asked for it. */
export function buildWalls(input: WallPassInput): WallPassResult {
  if (input.jobs.length === 0) {
    return { blocks: [], walls: [], diagnostics: [], stats: {} };
  }
  const diagnostics: LoamDiagnostic[] = [];
  const walls: BuiltWall[] = [];
  const region = input.plan.region;
  const onRoad =
    input.onRoad ??
    ((): boolean => false);

  const world = buildLifeWorld({
    plan: input.plan,
    stack: input.stack,
    ...(input.existing === undefined ? {} : { existing: input.existing }),
    // The carriageway is an absolute veto here, not a discount: the whole point
    // of a gate is that the road keeps its surface.
    avoid: (x: number, z: number): boolean => onRoad(x, z),
  });
  const planter = new Planter(
    world,
    input.stack,
    () => false,
    () => false,
    new Set<string>(),
    WALL_BUDGET,
  );

  for (const job of input.jobs) {
    const course = deriveWallCourse({
      extent: job.extent,
      margin: job.margin,
      bounds: { x0: region.x0, z0: region.z0, width: region.width, depth: region.depth },
    });
    if (course === undefined) {
      diagnostics.push(
        note(
          "WALL_COURSE_EMPTY",
          job.nodePath,
          "no wall course could be derived: the settlement's built footprint is too small, too thin, or the offset ring would fall outside the world region",
          `either drop "walls" from this node, lower "walls.margin" (it is ${job.margin}), or give the node a larger envelope with room outside the buildings for the ring to stand in`,
        ),
      );
      continue;
    }

    const gates = job.gates ? findGates(course.path, onRoad) : [];
    const openings = new Set<number>();
    for (const gate of gates) {
      for (let i = 0; i < course.path.length; i++) {
        if (inGate(gate, i, course.path.length)) openings.add(i);
      }
    }

    const profile = wallProfile(job.style, job.towerPitch);
    const swept = sweepCourse({
      profile,
      path: course.path,
      closed: true,
      rise: job.height,
      ground: (x, z) => (inside(region, x, z) ? world.standY(x, z) : undefined),
      skip: (i) => openings.has(i),
      bends: course.cornerIndices,
    });

    const materials = (WALL_MATERIALS[job.style] ?? WALL_MATERIALS["masonry"]) as WallMaterials;

    // --- towers, **before** the curtain ---------------------------------------
    // Ordering, not taste. A tower is centred on the course, so it shares
    // columns with the curtain; `Planter` refuses any recipe that would write
    // into a column this pass already claimed, and all-or-nothing means the
    // loser is dropped *whole*. Curtain first and every tower vanishes. Towers
    // first and the curtain loses the handful of columns the tower now
    // occupies, which is the correct answer — the tower is the wall there.
    let towers = 0;
    const towerColumns = new Set<string>();
    const towerSites: { x: number; z: number }[] = [
      ...swept.features.filter((f) => f.id === "tower").map((f) => ({ x: f.x, z: f.z })),
      // The gatehouse: a tower on the first course column outside each end of
      // every opening. Not a feature of the profile, because a gate's position
      // is a fact about the roads and the profile knows nothing about them.
      ...gates.flatMap((gate) => {
        const n = course.path.length;
        const before = course.path[(gate.from - 1 + n) % n] as CoursePoint;
        const after = course.path[(gate.to + 1) % n] as CoursePoint;
        return [before, after];
      }),
    ];
    for (const site of towerSites) {
      if (!buildTower(planter, world, site.x, site.z, job.height, materials)) continue;
      towers++;
      const half = (WALL_TOWER_SIDE - 1) / 2;
      for (let dz = -half; dz <= half; dz++) {
        for (let dx = -half; dx <= half; dx++) towerColumns.add(`${site.x + dx},${site.z + dz}`);
      }
    }

    let placed = 0;
    let skipped = 0;
    for (const column of swept.columns) {
      // A column a tower already owns is not a skipped column: it is built, and
      // built better. Counting it as a failure would make every wall look
      // full of holes in the report.
      if (towerColumns.has(`${column.x},${column.z}`)) continue;
      const base = world.standY(column.x, column.z);
      if (base === undefined) {
        skipped++;
        continue;
      }
      const ops = wallColumnOps(column, base, materials);
      if (ops === undefined) {
        skipped++;
        continue;
      }
      if (planter.place("wall", ops, column.x, base, column.z, WALL_RULE)) placed++;
      else skipped++;
    }

    walls.push({
      nodePath: job.nodePath,
      style: job.style,
      course,
      gates,
      towers,
      columns: placed,
      skipped,
    });
    if (placed === 0) {
      diagnostics.push(
        warning(
          "WALL_COURSE_EMPTY",
          job.nodePath,
          `a wall course was derived (${course.path.length} columns) and not one column of it could be built`,
          "something else already owns the ring — usually a road shoulder or a scatter. Raise \"walls.margin\" so the course stands clear of the built ground",
        ),
      );
    }
  }

  return {
    blocks: planter.blocks,
    walls,
    diagnostics,
    stats: {
      walls: walls.length,
      wallColumns: walls.reduce((s, w) => s + w.columns, 0),
      wallTowers: walls.reduce((s, w) => s + w.towers, 0),
      wallGates: walls.reduce((s, w) => s + w.gates.length, 0),
      wallColumnsSkipped: walls.reduce((s, w) => s + w.skipped, 0),
      wallBlocks: planter.blocks.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* recipes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One column of curtain: footing from the ground up to the band top, then the
 * band's own surface, then the cap.
 *
 * Returns `undefined` when the footing would be deeper than
 * {@link WALL_MAX_FILL} or the column's top is already at or below the ground —
 * both of which mean the course crossed something the wall has no business
 * spanning, and both of which are better reported as a skipped column than
 * built.
 *
 * **Crenellation.** The cap is two courses on the parapet bands, and the outer
 * one is written only on even `pathIndex`. That is the whole merlon rule, and
 * it is parity on the *path* rather than on the world column so the pattern
 * runs continuously round a corner instead of resetting.
 */
export function wallColumnOps(
  column: SweptColumn,
  base: number,
  materials: WallMaterials,
): LifeOp[] | undefined {
  const height = column.top - base;
  if (height < 0 || height > WALL_MAX_FILL) return undefined;
  const ops: LifeOp[] = [];
  for (let dy = 0; dy < height; dy++) ops.push(op(0, dy, 0, column.fill));
  ops.push(op(0, height, 0, column.surface));
  const cap = column.cap;
  if (cap !== undefined) {
    ops.push(op(0, height + 1, 0, cap.block));
    if (column.pathIndex % 2 === 0 && cap.height > 1) {
      ops.push(op(0, height + 2, 0, materials.merlon));
    }
  }
  return ops;
}

/**
 * A tower: a solid plinth to two courses above the wall-walk, then a
 * crenellated ring two courses higher.
 *
 * Solid rather than hollow, deliberately. A hollow tower with no stair and no
 * door is a sealed room — `interior.blocked_column` in the physics lint, and a
 * lie in the world. A solid one is a *bastion*, which is what a curtain wall's
 * towers mostly were before anyone put a room in them, and every block of it
 * is supported by the block below.
 *
 * All-or-nothing in one call, so a tower that would clip a building is not
 * built at all rather than built with a bite out of it — {@link Planter.place}
 * checks every op before it writes the first.
 */
export function buildTower(
  planter: Planter,
  world: { standY(x: number, z: number): number | undefined },
  cx: number,
  cz: number,
  wallHeight: number,
  materials: WallMaterials,
): boolean {
  const base = world.standY(cx, cz);
  if (base === undefined) return false;
  const half = (WALL_TOWER_SIDE - 1) / 2;
  const body = wallHeight + 2;
  const ops: LifeOp[] = [];
  for (let dz = -half; dz <= half; dz++) {
    for (let dx = -half; dx <= half; dx++) {
      const rim = Math.abs(dx) === half || Math.abs(dz) === half;
      const top = body + (rim ? WALL_TOWER_RISE - 2 : 0);
      for (let dy = 0; dy <= top; dy++) {
        ops.push(op(dx, dy, dz, dy === top && rim ? materials.merlon : materials.tower));
      }
      // The merlon course: every other rim column, by its own coordinates so
      // the four faces agree at the corners.
      if (rim && (dx + dz) % 2 === 0) {
        ops.push(op(dx, top + 1, dz, materials.merlon));
      }
    }
  }
  // A tower stands on ground the wall already proved: only the centre column's
  // stand height anchors it, and `Planter` refuses any footing whose own column
  // disagrees, so a tower half on a step is declined whole.
  return planter.place("wall_tower", ops, cx, base, cz, WALL_RULE);
}

/* -------------------------------------------------------------------------- */
/* extent                                                                      */
/* -------------------------------------------------------------------------- */

/** A placed rectangle — `layout/frames.ts`'s `Rect`, restated structurally. */
export interface ExtentRect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/**
 * The corners of every rectangle, which is the whole extent a support hull
 * needs.
 *
 * `max ⟨p, n⟩` over a rectangle is attained at a corner for every direction `n`,
 * so four points per building give bit-for-bit the same hull as every column of
 * it — and make the derivation linear in buildings rather than in blocks.
 */
export function extentOfRects(rects: readonly ExtentRect[]): CoursePoint[] {
  const out: CoursePoint[] = [];
  for (const r of rects) {
    out.push(
      { x: r.x0, z: r.z0 },
      { x: r.x1, z: r.z0 },
      { x: r.x0, z: r.z1 },
      { x: r.x1, z: r.z1 },
    );
  }
  return out;
}

/** A road-column predicate over a row-major mask, for {@link WallPassInput}. */
export function roadMaskPredicate(
  region: { x0: number; z0: number; width: number; depth: number },
  mask: Uint8Array,
): (x: number, z: number) => boolean {
  return (x: number, z: number): boolean =>
    inside(region, x, z) && mask[index(region, x, z)] === 1;
}
