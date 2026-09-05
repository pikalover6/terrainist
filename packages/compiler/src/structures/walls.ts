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
 * by a tread pass. On a dip the wall grows a footing down to the ground, up to
 * {@link WALL_HOLD_STAND} courses of it (the line held across the dip is the
 * design — see `WALL_HOLD_STAND`); past {@link WALL_MAX_FILL} the column is
 * refused, because a column taller than the line may stand is a datum fault.
 *
 * ## Determinism
 *
 * The course is a pure function of the placement; the datum is a pure function
 * of the course and the plan; the merlon parity is `pathIndex % 2`. Nothing
 * here draws a random number at all, which is why there is no seed parameter.
 */

import { note, WALL_MIN_MARGIN, warning, type LoamDiagnostic } from "@terrainist/spec/ir";

import type { MaterialTheme } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { groundMaterials } from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";
import { Planter, buildLifeWorld, op, type LifeOp, type PlaceRule } from "./life.js";
import { index, inside } from "./sweep.js";
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
 * The crown is a builder's line (`follow: "run"`): level runs of at least
 * {@link WALL_RUN} columns where the ground allows, stepping only where the
 * ground would bury the walk or stand it more than {@link WALL_MAX_STAND}
 * proud, at a tower or a corner when one is near.
 *
 * `WALL_MAX_STAND` is the ordinary band: how proud the walk may stand on
 * ground that merely undulates before the run must step (Appendix B's twelve,
 * kept). Across a **dip** the line is held instead — `WALL_HOLD_STAND` and
 * `WALL_HOLD_SPAN` below.
 */
const WALL_RUN = 8;
const WALL_MAX_STAND = 12;

/**
 * How tall the wall may grow to hold its line across a dip, and how wide a
 * dip it holds its line across — the Wall Run's numbers (W1: *the top line
 * held level across every dip*).
 *
 * The Groundwork Run capped every column at `WALL_MAX_STAND`, so a dip deeper
 * than four was descended in tower-sized treads — the ground copied in coarser
 * steps, which a walk read as the wall sinking with the terrain. The Wall
 * Run's census (`tools/groundwork/records/w1-census.md`) measured what each
 * dip on the reference set needs: the frozen example, the walled city's south
 * dip (`/tp 74 90 106`), holds its line at a stand of 33 and at nothing less;
 * troy's shore at 29; forty-eight would stand a third of a ring more than 32
 * tall. Thirty-six is the smallest round number that holds the frozen
 * examples. A dip is ground that leaves the run's band and *comes back*: a
 * knoll's far side and a lower plateau never come back, and their level is
 * not carried downhill — the walled city's 30-station ridge would otherwise
 * drag a 27-tall wall 300 stations round a plateau whose own line is eight
 * (`records/w2-mechanism.md`). The span is the widest dip held: troy's widest
 * frozen dip is 174 stations bank to bank (`/tp -92 81 9`), that plateau 300.
 * Past either number the crown steps as it always did, at a tower
 * (`WALL_TOWER_STEP`). Kai's walk confirms or moves both.
 */
const WALL_HOLD_STAND = 36;
const WALL_HOLD_SPAN = 192;

/**
 * Standing water the wall wades into, on its own footing from the bed — a
 * beach a block under the sea, a lake's shallow edge. Deeper water ends the
 * wall, with a tower on each bank; {@link WALL_TOWER_STEP} likewise puts a
 * tower wherever the crown steps this much or more, so a big step reads as a
 * builder's, not a slip.
 */
const WALL_WADE = 5;
const WALL_TOWER_STEP = 8;

/** How far below its centre a tower's own columns may be footed before the tower is refused rather than left hanging. */
const WALL_TOWER_FOOTING = 32;

/** The least distance between two towers the ground asks for (Appendix B started at ~16). */
const WALL_TOWER_SPACING = 12;

/**
 * A ring is not laid along a street or through a house. Where the derived
 * course lies on ground it cannot stand on for this many columns or more —
 * a street running past the buildings' hull, a house outside it — those
 * columns join the extent and the course is drawn again outside them, up to
 * {@link WALL_COURSE_RETRIES} times. A crossing is shorter than this and
 * stays a gate.
 */
const WALL_STREET_RUN = 12;
const WALL_COURSE_RETRIES = 4;

/**
 * Courses one wall column may be, ground to walk, before it is refused.
 *
 * The wall stands on the ground it crosses; a hollow between two knolls is made
 * up by building down. The datum never stands a column more than
 * {@link WALL_HOLD_STAND} above its ground, so the cap is that limit and no
 * less: a cap below it (the Groundwork's eighteen) would refuse the very
 * columns the held line needs and punch holes in a wall that was doing as
 * asked (C1: no column refused for depth). A column past it is a datum carried
 * over refused ground, and the honest outcome is a skipped column reported as
 * a note, not a pier taller than the line.
 */
export const WALL_MAX_FILL = WALL_HOLD_STAND;

/**
 * Footing depths past which a wall run is *reported* (`LOAM-I524`), never
 * refused. A course or two of footing is ordinary ground-following; a mean of
 * six is a run spending most of its length on stilts, and a single column eight
 * courses down is a pier taller than the wall it carries.
 */
export const WALL_FOOTING_MEAN_NOTE = 6;
/** @see WALL_FOOTING_MEAN_NOTE */
export const WALL_FOOTING_MAX_NOTE = 8;

/**
 * The step across a platform boundary at which the wall's own fill **is** the
 * face — S11's bar.
 *
 * Two, and it is the same two `STREET_STAIR_RAIL_DROP` uses: one block is a
 * kerb, which every course crosses everywhere and which nobody would call a
 * face. Two is the first drop a player can fall down, and the first at which a
 * crossing reads as masonry standing in for a retaining wall that was never
 * built there.
 */
export const WALL_SEAM_CROSS_DROP = 2;

/** Columns a tower is across, and how far it stands proud of the wall-walk. */
const WALL_TOWER_SIDE = 5;
const WALL_TOWER_RISE = 4;

/** A generous ceiling on recipes, in the shape `SET_PIECE_BUDGET` has. */
const WALL_BUDGET = 60_000;

/**
 * The wall's own place rule.
 *
 * `requireFreeColumn` is on and stays on: a wall that grew through a house
 * would be the `curtain_wall` prop's defect with more blocks. The course is
 * derived to sit outside everything, so a column this refuses is a genuine
 * collision — a lane's shoulder, a prop, a tree the scatter got to first — and
 * skipping it whole is the contract.
 */
const WALL_RULE: PlaceRule = { requireFreeColumn: true, requireEmptyVoxel: true, wade: WALL_WADE };

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

/**
 * The wall materials a theme's built-ground roles give.
 *
 * The roles are the ones a mason would name, and they already exist: a
 * settlement's `revetment` is the masonry it holds earth with, its `coping` the
 * dressed course that caps it, its `pavement` the dressed flat it walks on.
 * A curtain wall is exactly those three jobs stood on end — body, crest, cap —
 * so it takes them rather than a fourth hand-kept table that would drift out of
 * step with the theme the rest of the built ground is in. That drift is the
 * "everything is the same grey stone" defect the ground roles were introduced
 * to end, and a wall in `stone_bricks` beside a town in mud brick is the same
 * defect wearing a different hat.
 *
 * Every entry is a full cube, which is the wall's own rule (a slab or a fence
 * in a curtain is either a physics finding or a hole a mob paths through). The
 * nine solid ground roles are all full blocks by the palette's own test, so the
 * five picked here are safe by construction.
 *
 * A theme whose roles are missing — there is no such theme, but the type says
 * `undefined` is possible — falls back to the pinned `masonry` table.
 *
 * **One function, two callers.** It lives here rather than in `walls-intent.ts`
 * because both wall paths need it: the `structures.fortification` dial that
 * asked for it first, and {@link wallJobsOf}'s authored `params.walls`, which
 * built a walked Troy's ancient circuit in default grey inside a sun-clay city
 * for exactly as long as this derivation had only one caller.
 */
export function wallMaterialsOfTheme(theme: MaterialTheme | undefined): WallMaterials {
  if (theme === undefined) return WALL_MATERIALS["masonry"] as WallMaterials;
  // A theme may name its curtain outright — see `MaterialTheme.curtain`. The
  // derivation below is what a silent theme still gets, unchanged.
  if (theme.curtain !== undefined) {
    const c = theme.curtain;
    return { core: c.core, walk: c.walk, parapet: c.parapet, merlon: c.merlon, tower: c.tower };
  }
  const g = groundMaterials(theme);
  return {
    core: g.revetment,
    walk: g.pavement,
    parapet: g.revetment,
    merlon: g.coping,
    tower: g.revetment,
  };
}

/**
 * Styles whose materials are the **style**, not the theme.
 *
 * A palisade is timber and an earthwork is rammed mud: those are constructions
 * an author picked by name, and re-materialising them from the settlement's
 * stone would be answering a different question from the one that was asked.
 * `masonry` is the one style that says only *how* rather than *what*, so it —
 * and only it — takes the theme's own stone.
 */
export function wallStyleFixesMaterials(style: string): boolean {
  return style !== "masonry";
}

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
export function wallProfile(
  style: string,
  towerPitch: number,
  materials?: WallMaterials,
): SweptProfile {
  const m = materials ?? ((WALL_MATERIALS[style] ?? WALL_MATERIALS["masonry"]) as WallMaterials);
  return {
    id: `infra.wall@0/${style}`,
    follow: "run",
    runLength: WALL_RUN,
    maxStand: WALL_MAX_STAND,
    holdStand: WALL_HOLD_STAND,
    holdSpan: WALL_HOLD_SPAN,
    runCover: (WALL_TOWER_SIDE - 1) / 2,
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
   * The blocks this wall is built from, overriding {@link WALL_MATERIALS}'s
   * entry for {@link style}.
   *
   * Absent on every authored wall — `params.walls` names a style and a style is
   * a table — and set by the `structures.fortification` fan-out row, which
   * builds a curtain out of the settlement's *own* built-ground roles so a town
   * in mud brick is not walled in grey stone. Absent means the style table,
   * which is why a document that never touches the dial is byte-identical.
   */
  readonly materials?: WallMaterials;
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
  /**
   * **S11's one new input, and it moves nothing**
 * : the quarter's platform field, as the
   * platform id under a column — `NO_PLATFORM` (`-1`) where the ground is nobody
   * level's.
   *
   * The circuit is swept on its own 1-Lipschitz datum and each column is filled
   * down to ground ({@link WALL_MAX_FILL}), so where it crosses a level change
   * the wall material *is* the face. That is the eight sheer faces of drop 14
   * the Troy audit attributed to walls, and `LOAM-I524 WALL_FOOTING_DEEP`
   * already half-reported it on the same world. This measures it properly and
   * says so, as `LOAM-I415`; **promoting a crossing to a tier stack is
   * deliberately a later round** (§5 non-goal 12), decided on this number.
   *
   * Optional: absent, not one byte and not one report line changes, which is how
   * every caller behaves that has no platform field to give.
   */
  readonly platformAt?: (x: number, z: number) => number;
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
/**
 * The course, at the requested margin if it fits — stepped in two columns at a
 * time (floor {@link WALL_MIN_MARGIN}) when it does not.
 *
 * Margin backoff (2026-08-11, the prop-reseat pattern): a settlement grown
 * against the region edge asked for a wall and would silently get none — Troy
 * c5, measured. The margin is advice; the circuit is the icon. `builtMargin`
 * reports what actually fit, so the caller can say so (`LOAM-T229`).
 */
export function courseWithMarginBackoff(
  extent: readonly CoursePoint[],
  margin: number,
  bounds: { readonly x0: number; readonly z0: number; readonly width: number; readonly depth: number },
): { course: ReturnType<typeof deriveWallCourse>; builtMargin: number } {
  let course = deriveWallCourse({ extent, margin, bounds });
  let builtMargin = margin;
  for (let m = margin - 2; course === undefined && m >= WALL_MIN_MARGIN; m -= 2) {
    course = deriveWallCourse({ extent, margin: m, bounds });
    builtMargin = m;
  }
  return { course, builtMargin };
}

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
    const bounds = { x0: region.x0, z0: region.z0, width: region.width, depth: region.depth };
    // The course, drawn again outside any street or house it would lie along.
    let extent: CoursePoint[] = [...job.extent];
    let derived = courseWithMarginBackoff(extent, job.margin, bounds);
    for (let retry = 0; retry < WALL_COURSE_RETRIES && derived.course !== undefined; retry++) {
      const path = derived.course.path;
      const m = path.length;
      const held = (p: CoursePoint): boolean =>
        inside(region, p.x, p.z) &&
        world.standY(p.x, p.z) !== undefined &&
        (onRoad(p.x, p.z) || world.vetoed(p.x, p.z) || world.taken(p.x, p.z));
      const flags = path.map((p) => held(p));
      const extra: CoursePoint[] = [];
      // maximal runs on a closed ring, starting after a free point
      let start = flags.findIndex((f) => !f);
      if (start < 0) break;
      for (let k = 1; k <= m; ) {
        const i = (start + k) % m;
        if (!flags[i]) {
          k++;
          continue;
        }
        let len = 0;
        while (len < m && flags[(i + len) % m]) len++;
        if (len >= WALL_STREET_RUN) for (let j = 0; j < len; j++) extra.push(path[(i + j) % m] as CoursePoint);
        k += len;
      }
      if (extra.length === 0) break;
      extent = [...extent, ...extra];
      derived = courseWithMarginBackoff(extent, job.margin, bounds);
    }
    const { course, builtMargin } = derived;
    if (course !== undefined && course.clamped) {
      diagnostics.push(
        note(
          "WALL_COURSE_CLAMPED",
          job.nodePath,
          "the settlement is built to the world-region edge, so the circuit flattens along the boundary there — closed, not clipped; buildings on the line become part of the wall",
          "no change needed — or grow the settlement with wall room from the region edge if the flattened stretch reads wrong on a walk",
        ),
      );
    }
    if (course !== undefined && builtMargin !== job.margin) {
      diagnostics.push(
        note(
          "WALL_MARGIN_REDUCED",
          job.nodePath,
          `the wall's margin of ${job.margin} pushed the ring outside the world region; it was stepped in to ${builtMargin} and the circuit built there`,
          "no change needed — or give the settlement more room from the region edge if the tighter ring crowds the fabric",
        ),
      );
    }
    if (course === undefined) {
      // Name the numbers, not the guesses: which of the three refusals it was
      // is computable right here, and "too small, too thin, or outside" sent
      // a whole debugging session the wrong way (Troy c5, 2026-08-11).
      const xs = job.extent.map((p) => p.x);
      const zs = job.extent.map((p) => p.z);
      const shape =
        job.extent.length === 0
          ? "an empty extent"
          : `fabric x ${Math.min(...xs)}..${Math.max(...xs)}, z ${Math.min(...zs)}..${Math.max(...zs)}`;
      diagnostics.push(
        note(
          "WALL_COURSE_EMPTY",
          job.nodePath,
          `no wall course could be derived even after stepping the margin down to ${WALL_MIN_MARGIN}: ` +
            `${shape}, against region x ${bounds.x0}..${bounds.x0 + bounds.width}, z ${bounds.z0}..${bounds.z0 + bounds.depth}`,
          `either drop "walls" from this node, or give the node a larger envelope with room outside the buildings for the ring to stand in`,
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

    const materials =
      job.materials ?? ((WALL_MATERIALS[job.style] ?? WALL_MATERIALS["masonry"]) as WallMaterials);
    const profile = wallProfile(job.style, job.towerPitch, materials);
    // Where the wall stands: on the ground, or on the bed under shallow water.
    const standAt = (x: number, z: number): number | undefined => {
      if (!inside(region, x, z)) return undefined;
      const dry = world.standY(x, z);
      if (dry !== undefined) return dry;
      const depth = world.wadeAt?.(x, z);
      if (depth === undefined || depth > WALL_WADE) return undefined;
      return (input.plan.ground[index(region, x, z)] as number) + 1;
    };
    const wading = (x: number, z: number): boolean => world.standY(x, z) === undefined;
    const swept = sweepCourse({
      profile,
      path: course.path,
      closed: true,
      rise: job.height,
      ground: standAt,
      skip: (i) => openings.has(i),
      bends: course.cornerIndices,
    });

    // --- towers, **before** the curtain ---------------------------------------
    // Ordering, not taste. A tower is centred on the course, so it shares
    // columns with the curtain; `Planter` refuses any recipe that would write
    // into a column this pass already claimed, and all-or-nothing means the
    // loser is dropped *whole*. Curtain first and every tower vanishes. Towers
    // first and the curtain loses the handful of columns the tower now
    // occupies, which is the correct answer — the tower is the wall there.
    let towers = 0;
    const towerColumns = new Set<string>();
    // A tower stands where the crown puts it: its floor two above the walk at
    // its site (the higher walk, where the crown steps there), footed on each
    // of its own columns.
    const walkAt = (i: number): number => {
      const n = course.path.length;
      return Math.max(
        swept.datum[((i % n) + n) % n] as number,
        swept.datum[(((i - 1) % n) + n) % n] as number,
      );
    };
    // Towers the ground asks for: one wherever the crown steps WALL_TOWER_STEP
    // or more, and one on each bank of a stretch the wall cannot stand on —
    // water too deep to wade, a road it must not cross, ground another pass
    // holds — so the wall ends at a tower instead of trailing off.
    const n = course.path.length;
    const asked: { x: number; z: number; walk: number }[] = [];
    const at = (i: number): number => ((i % n) + n) % n;
    const unbuildable = (i: number): boolean => {
      const p = course.path[at(i)] as CoursePoint;
      if (openings.has(at(i))) return false;
      return standAt(p.x, p.z) === undefined || world.vetoed(p.x, p.z) || world.taken(p.x, p.z);
    };
    const cannot: boolean[] = [];
    for (let i = 0; i < n; i++) cannot.push(unbuildable(i));
    for (let i = 0; i < n; i++) {
      const prev = at(i - 1);
      const p = course.path[i] as CoursePoint;
      const step = Math.abs((swept.datum[i] as number) - (swept.datum[prev] as number));
      const bank = cannot[prev] !== cannot[i];
      if (step >= WALL_TOWER_STEP || bank) {
        const site = cannot[i] ? (course.path[prev] as CoursePoint) : p;
        asked.push({ x: site.x, z: site.z, walk: walkAt(i) });
      }
    }
    const towerSites: { x: number; z: number; walk: number }[] = [
      ...swept.features
        .filter((f) => f.id === "tower")
        .map((f) => ({ x: f.x, z: f.z, walk: walkAt(f.pathIndex) })),
      // The gatehouse: a tower on the first course column outside each end of
      // every opening. Not a feature of the profile, because a gate's position
      // is a fact about the roads and the profile knows nothing about them.
      ...gates.flatMap((gate) => {
        const n = course.path.length;
        const bi = (gate.from - 1 + n) % n;
        const ai = (gate.to + 1) % n;
        const before = course.path[bi] as CoursePoint;
        const after = course.path[ai] as CoursePoint;
        return [
          { x: before.x, z: before.z, walk: walkAt(bi) },
          { x: after.x, z: after.z, walk: walkAt(ai) },
        ];
      }),
    ];
    // Two towers closer than WALL_TOWER_SPACING read as one pile: the first
    // asked for stands, the rest fold into it.
    for (const site of asked) {
      if (
        towerSites.some(
          (t) => Math.abs(t.x - site.x) < WALL_TOWER_SPACING && Math.abs(t.z - site.z) < WALL_TOWER_SPACING,
        )
      ) {
        continue;
      }
      towerSites.push(site);
    }
    for (const site of towerSites) {
      if (!buildTower(planter, { standY: standAt }, site.x, site.z, site.walk, materials)) continue;
      towers++;
      const half = (WALL_TOWER_SIDE - 1) / 2;
      for (let dz = -half; dz <= half; dz++) {
        for (let dx = -half; dx <= half; dx++) towerColumns.add(`${site.x + dx},${site.z + dz}`);
      }
    }

    let placed = 0;
    let skipped = 0;
    // How deep each built column had to reach below the run's own rise to find
    // ground. Collected, not acted on: see WALL_FOOTING_DEEP below.
    let footingSum = 0;
    let footingMax = 0;
    let footingCount = 0;
    for (const column of swept.columns) {
      // A column a tower already owns is not a skipped column: it is built, and
      // built better. Counting it as a failure would make every wall look
      // full of holes in the report.
      if (towerColumns.has(`${column.x},${column.z}`)) continue;
      const base = standAt(column.x, column.z);
      if (base === undefined) {
        skipped++;
        continue;
      }
      const ops = wallColumnOps(column, base, materials);
      if (ops === undefined) {
        skipped++;
        continue;
      }
      if (
        planter.place("wall", ops, column.x, base, column.z, WALL_RULE, !wading(column.x, column.z))
      ) {
        placed++;
        const footing = Math.max(0, column.top - base - job.height);
        footingSum += footing;
        footingCount++;
        if (footing > footingMax) footingMax = footing;
      } else skipped++;
    }

    const footing = wallFootingNote({
      nodePath: job.nodePath,
      style: job.style,
      courseColumns: course.path.length,
      built: placed,
      count: footingCount,
      sum: footingSum,
      max: footingMax,
    });
    if (footing !== undefined) diagnostics.push(footing);

    // S11 — measured, not moved. Skipped whole when the caller handed over no
    // platform field, which is every caller that has none: no allocation, no
    // walk of the course, no report line.
    if (input.platformAt !== undefined) {
      const crossing = wallSeamCrossingNote({
        nodePath: job.nodePath,
        style: job.style,
        courseColumns: course.path.length,
        crossings: wallSeamCrossings(course.path, input.platformAt, (x, z) =>
          inside(region, x, z) ? world.standY(x, z) : undefined,
        ),
      });
      if (crossing !== undefined) diagnostics.push(crossing);
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
function buildTower(
  planter: Planter,
  world: { standY(x: number, z: number): number | undefined },
  cx: number,
  cz: number,
  walk: number,
  materials: WallMaterials,
): boolean {
  const base = world.standY(cx, cz);
  if (base === undefined) return false;
  const half = (WALL_TOWER_SIDE - 1) / 2;
  // The floor: two courses above the walk it commands, never below the ground
  // the centre stands on.
  const body = Math.max(walk + 2 - base, 0);
  const ops: LifeOp[] = [];
  for (let dz = -half; dz <= half; dz++) {
    for (let dx = -half; dx <= half; dx++) {
      const rim = Math.abs(dx) === half || Math.abs(dz) === half;
      const top = body + (rim ? WALL_TOWER_RISE - 2 : 0);
      // Footed on this column's own ground: the body starts where the column
      // stands; a column more than `WALL_TOWER_FOOTING` below the centre
      // refuses the tower rather than leaving air under its skirt.
      const stand = world.standY(cx + dx, cz + dz);
      if (stand === undefined) return false;
      const from = stand - base;
      if (from < -WALL_TOWER_FOOTING || from > top) return false;
      for (let dy = from; dy <= top; dy++) {
        ops.push(op(dx, dy, dz, dy === top && rim ? materials.merlon : materials.tower));
      }
      if (rim && (dx + dz) % 2 === 0) {
        ops.push(op(dx, top + 1, dz, materials.merlon));
      }
    }
  }
  return planter.place("wall_tower", ops, cx, base, cz, WALL_RULE, false);
}
/* -------------------------------------------------------------------------- */
/* extent                                                                      */
/* -------------------------------------------------------------------------- */

/** A placed rectangle — canonical {@link Rect}, aliased for wall extent domain intent. */
export type ExtentRect = Rect;

/**
 * The corners of every rectangle, which is the whole extent a support hull
 * needs.
 *
 * `max ⟨p, n⟩` over a rectangle is attained at a corner for every direction `n`,
 * so four points per building give bit-for-bit the same hull as every column of
 * it — and make the derivation linear in buildings rather than in blocks.
 */
export function extentOfRects(rects: readonly Rect[]): CoursePoint[] {
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

/** What a course did where it crossed a platform boundary — S11's numbers. */
export interface WallSeamCrossings {
  /** Course columns whose next column is across a boundary and a face down. */
  readonly crossings: number;
  /** The tallest of those faces, in blocks. */
  readonly deepest: number;
  /** The longest unbroken run of crossing columns, in columns. */
  readonly longest: number;
}

/**
 * **S11's measurement** — where a fortification course's fill stands as a face
 * across a platform boundary.
 *
 * Two facts have to hold at a column for it to count, and they are deliberately
 * different in kind. The first is a **boundary**: the column and the next one
 * belong to different platforms, so the ground there is a seam and not a hill —
 * *"a `retaining.seam` requires a seam"*, which is the note §3.1's forensics
 * flagged for the `infra.entry` case. The second is a **face**: the two columns
 * stand at least {@link WALL_SEAM_CROSS_DROP} apart, so the wall's own fill is
 * spanning something a retaining wall would otherwise have held.
 *
 * Pure, closed over the course exactly as the sweep walks it, and it changes
 * nothing: the wall is the wall it was. `undefined` from `standAt` — a column
 * off the region, or one with no ground — is not a crossing, because a crossing
 * needs two grounds to compare.
 */
export function wallSeamCrossings(
  path: readonly CoursePoint[],
  platformAt: (x: number, z: number) => number,
  standAt: (x: number, z: number) => number | undefined,
): WallSeamCrossings {
  let crossings = 0;
  let deepest = 0;
  let longest = 0;
  let run = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as CoursePoint;
    const b = path[i + 1] as CoursePoint;
    const pa = platformAt(a.x, a.z);
    const pb = platformAt(b.x, b.z);
    if (pa === pb) {
      run = 0;
      continue;
    }
    const ya = standAt(a.x, a.z);
    const yb = standAt(b.x, b.z);
    if (ya === undefined || yb === undefined) {
      run = 0;
      continue;
    }
    const drop = Math.abs(ya - yb);
    if (drop < WALL_SEAM_CROSS_DROP) {
      run = 0;
      continue;
    }
    crossings++;
    if (drop > deepest) deepest = drop;
    run++;
    if (run > longest) longest = run;
  }
  return { crossings, deepest, longest };
}

/**
 * S11's note (`LOAM-I415`), and it is a **measurement, not a move**.
 *
 * The promotion this number decides — a circuit's crossing built as a tier stack
 * rather than as a pier of curtain — is explicitly not in this work package
 * (§5 non-goal 12); it is decided on a walk with the count in hand, exactly as
 * §3.1's viaduct note does for WP-10C. `undefined` when the course kept to one
 * platform, which is every wall on flat ground and every wall on a quarter that
 * elected no levels at all.
 */
export function wallSeamCrossingNote(run: {
  readonly nodePath: string;
  readonly style: string;
  readonly courseColumns: number;
  readonly crossings: WallSeamCrossings;
}): LoamDiagnostic | undefined {
  const { crossings, deepest, longest } = run.crossings;
  if (crossings === 0) return undefined;
  return note(
    "WALL_COURSE_CROSSES_SEAM",
    run.nodePath,
    `wall run "${run.style}" (${run.courseColumns} course columns) crosses a platform boundary at ` +
      `${crossings} column(s) where the ground steps at least ${WALL_SEAM_CROSS_DROP} block(s) — ` +
      `the deepest crossing is ${deepest} block(s) and the longest unbroken stretch is ${longest} column(s), ` +
      `and along it the wall's own fill is the face rather than a wall standing on one`,
    `no action needed — the circuit is not moved on this number. It is the measurement that decides whether a crossing is worth building as a tier stack instead, which is a later round`,
  );
}

/**
 * The footing that became the structure (`LOAM-I524`).
 *
 * A curtain column sinks its footing straight down to the ground, silently, all
 * the way to {@link WALL_MAX_FILL}. Across a dip that is not a wall, it is a
 * **dam**: the walked defect was a 5-wide pier standing a dozen courses proud of
 * the valley floor, sheer on both faces, with nothing in the report between
 * "built" and "refused".
 *
 * Pure, and it changes nothing: the wall is the wall it was, and the numbers are
 * simply said. `undefined` when the run kept to the ground.
 */
export function wallFootingNote(run: {
  readonly nodePath: string;
  readonly style: string;
  readonly courseColumns: number;
  readonly built: number;
  /** How many built columns the footings were measured over. */
  readonly count: number;
  readonly sum: number;
  readonly max: number;
}): LoamDiagnostic | undefined {
  if (run.count === 0) return undefined;
  const mean = run.sum / run.count;
  if (mean <= WALL_FOOTING_MEAN_NOTE && run.max <= WALL_FOOTING_MAX_NOTE) return undefined;
  return note(
    "WALL_FOOTING_DEEP",
    run.nodePath,
    `wall run "${run.style}" (${run.courseColumns} course columns, ${run.built} built) sank its footing ` +
      `${mean.toFixed(1)} courses on average and ${run.max} at the deepest (cap ${WALL_MAX_FILL}) — ` +
      `the deep stretch stands as a sheer pier of wall material, not as a wall on the ground`,
    `no change needed if the pier reads as a rampart on a walk — otherwise move the circuit clear of the dip ` +
      `with a larger "walls.margin", or shrink the envelope so the course keeps to the settlement's own bench`,
  );
}
