/**
 * C4 — **the set-piece pass**: making the anchors read as anchors.
 *
 * `layout/vistas.ts` decided *where* the set pieces are and `layout/city-pass.ts`
 * seated the buildings among them. What is left is everything that is not a
 * building: the parapet and pylons that turn a crossing into a bridge, the
 * railing and lamps that turn a shoreline road into a promenade, the flight of
 * steps that turns an unwalkable bank into a public stair, and the monument
 * that turns a reserved void into a square.
 *
 * ## Where it runs, and why that is the only place
 *
 * Between the ground treatment and the life pass. After the ground treatment,
 * because a set piece stands on the *finished* ground and until F2 has dressed
 * the last lot that ground is not final. Before the life pass, because C3 is
 * contractually last and is handed the emitted block list: run this after it
 * and a parapet would be free to grow through an awning C3 had already argued
 * its own support for.
 *
 * ## Discipline
 *
 * This pass runs late, over ground six other passes have already claimed, and
 * it holds itself to exactly the rules `structures/life.ts` sets out — using
 * literally the same code, not a second implementation of it:
 *
 * - {@link buildLifeWorld} is the occupancy view. Two additive passes must
 *   agree voxel for voxel on what "already taken" means, and a second
 *   `solidAt` is a second answer to the only question that matters.
 * - {@link Planter} is the one place a block is written, so every recipe is
 *   **all or nothing**: checked in full before a single op lands, dropped whole
 *   if any part of it would clip. A parapet that stops halfway across a river
 *   is worse than no parapet.
 * - `avoid` and `keepClear` are an **absolute column veto**, with no voxel
 *   exemption, exactly as the pinned contract says.
 * - A recipe that stands on the ground demands `standY(x, z) === y` for every
 *   footing. The ground under a set piece is graded — a city cell ramps between
 *   quarters and a landmark carries its own pad — so the column next door is
 *   routinely a block lower, and a post over it would be left hanging.
 * - Nothing here writes a `*_sign` block (no block-entity channel, so every one
 *   would be a `blockentity.orphan`) and nothing here writes a fluid.
 *
 * ## Determinism
 *
 * Positions come from the plan; the only choices left are periodic (a lamp
 * every N cells along a path whose indexing the plan fixed) or a `hashInt`
 * keyed on a world column. No `Math.random`, no wall clock, no transcendental,
 * and every iteration is over an array in plan order.
 *
 * ## Materials
 *
 * Masonry, deliberately, and the same masonry for all four kinds. A bridge, a
 * public stair, a river wall and a monument plinth are *infrastructure* — in a
 * real city they are the things built out of the one durable material, decades
 * apart, by the same public works department, and the material is what says so.
 * Dealing them each a themed palette would make four unrelated objects.
 */

import type { Seed256 } from "@terrainist/stdlib";
import { note, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Point2 } from "../layout/frames.js";
import type { SetPiece } from "../layout/vistas.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { hashInt, detailSeed } from "../terrain/detail.js";

import type { StructureBlock } from "./buildings.js";
import {
  ATTACHED_RULE,
  GROUND_RULE,
  PAVEMENT_RULE,
  Planter,
  buildLifeWorld,
  op,
  type LifeOp,
  type LifeWorld,
  type PlaceRule,
} from "./life.js";
import { approachIndices } from "./bridge.js";
// SEAM(sweep): the set-piece client's single import site — the bridge dressing
// and the stair both read their geometry out of the profiles here rather than
// restating it. When `structures/sweep.ts` lands, `dressBridge` and
// `dressStair` become `sweep()` calls with `BRIDGE_PROFILE` / `STAIR_PROFILE`
// and keep only their palette wiring. See `structures/profiles.ts`.
import {
  BRIDGE_PROFILE,
  STAIR_PROFILE,
  bridgeOffsets,
  featureHits,
  featureOf,
  synthesizeTreadPlan,
  type TreadShape,
} from "./profiles.js";
import { index, inside } from "./roads.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cells between lamps on a bridge parapet.
 *
 * Taken off {@link BRIDGE_PROFILE}'s `lamp` interval feature, not declared
 * twice: the profile is the contract and this is the name the pass has always
 * used for it.
 */
export const BRIDGE_LAMP_PITCH = featureOf(BRIDGE_PROFILE, "lamp").pitch;

/** How far a bridge pylon rises above the deck. */
export const BRIDGE_PYLON_HEIGHT = 5;

/** Cells of a pylon along the deck — a pier, not a post. */
export const BRIDGE_PYLON_RUN = 3;

/** Cells between lamps on a promenade railing. */
export const PROMENADE_LAMP_PITCH = 13;

/** Cells between benches on a promenade. */
export const PROMENADE_BENCH_PITCH = 19;

/** Columns out from the carriageway edge the promenade railing stands. */
export const PROMENADE_RAIL_OFFSET = 2;

/** Columns a hillside stair is wide, treads only — {@link STAIR_PROFILE}'s tread band. */
export const STAIR_TREAD_WIDTH =
  STAIR_PROFILE.bands.find((b) => b.id === "tread")?.width ?? 5;

/** Steps between lanterns on a hillside stair's balustrade — {@link STAIR_PROFILE}. */
export const STAIR_LAMP_PITCH = featureOf(STAIR_PROFILE, "lamp").pitch;

/**
 * Courses of masonry one column of a flight may be raised by.
 *
 * A ceiling on how much bank the stair is willing to make up for. Past this
 * the flight is no longer a stair on a slope, it is a retaining wall with steps
 * on top, and the honest answer is that the plan picked a bad strip: the piece
 * declines whole rather than building the wall.
 */
export const STAIR_MAX_FILL = 4;

/**
 * Columns either side of the plan's proposed strip that are swept for a
 * buildable flight. See {@link seekFlight}.
 */
export const STAIR_SEEK = 10;

/** Total rise a flight must have on the *finished* ground to be worth laying. */
export const STAIR_MIN_BUILT_RISE = 5;

/**
 * Chebyshev radius, in columns, within which each end of a flight must find
 * something to connect to.
 *
 * A stair is a **connection**, and the sweep in {@link seekFlight} had until
 * now verified only that it stood on climbable ground. Kai walked a masonry
 * flight — treads, balustrade, lanterns and all — stranded mid-hillside with
 * no path at the top and nothing at the bottom: geometrically a perfect stair,
 * urbanistically a folly. Both ends are now required to reach a road, street,
 * plaza or building pad, and because the sweep already tries every offset in a
 * window, "prefer a strip that connects" and "refuse when none does" are the
 * same one change.
 *
 * Three columns: far enough to bridge the sidewalk band and the shoulder a
 * flight naturally stops short of, near enough that "connected" still means it.
 */
export const STAIR_CONNECT = 3;

/** How tall the civic square's monument stands above its plinth. */
export const MONUMENT_HEIGHT = 5;

/** Columns in from a square's corner that its lamps stand. */
export const SQUARE_LAMP_INSET = 4;

/**
 * Blocks this pass may write in one world.
 *
 * A safety valve of the same shape the life pass carries, and for the same
 * reason: a set piece is bounded by construction (there are at most six of
 * them) but a bug in a loop bound is not, and a runaway additive pass is the
 * one failure mode that turns a slow compile into an unusable one.
 */
export const SET_PIECE_BUDGET = 6000;

/** The one infrastructure palette. See the module note on materials. */
const MASONRY = "stone_bricks";
const MASONRY_WALL = "stone_brick_wall";
const MASONRY_STAIRS = "stone_brick_stairs";
const MASONRY_SLAB = "stone_brick_slab";
const MASONRY_CHISELED = "chiseled_stone_bricks";
const LAMP = "lantern";

/**
 * The parapet rule: a voxel test, no column test, no ground anchor.
 *
 * A bridge deck's outer column *is* claimed — the street surfacing paved it a
 * moment ago, which is the whole reason there is a deck to stand a parapet on.
 * The column rule would therefore refuse every parapet block on the bridge, so
 * the test is the same strictly-more-precise one {@link PAVEMENT_RULE} makes:
 * this voxel and the one above it must be empty in the emitted world.
 */
const PARAPET_RULE: PlaceRule = {
  requireFreeColumn: false,
  requireEmptyVoxel: true,
  clearance: 1,
};

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** One city's set pieces, as the structure pass receives them. */
export interface SetPieceCity {
  readonly nodePath: string;
  readonly setPieces: readonly SetPiece[];
}

/** Everything {@link dressSetPieces} reads. */
export interface SetPiecePassInput {
  /** The finished column plan. Read only — this pass writes blocks, not ground. */
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  /** The settlement seed; every hash stream derives from it. */
  readonly seed: Seed256;
  readonly nodePath: string;
  readonly cities: readonly SetPieceCity[];
  /** Every block written so far, in emit order. */
  readonly existing?: readonly StructureBlock[];
  /** An absolute column veto — road surfaces and the like. */
  readonly avoid?: (x: number, z: number) => boolean;
  /** Extra columns to keep clear. Also an absolute veto. */
  readonly keepClear?: ReadonlySet<string>;
  /**
   * "Something a player can arrive from or leave for stands here" — a road,
   * street or arterial column, a paved plaza cell, or a building pad.
   *
   * Read only by the hillside stair, and only to decide whether the flight it
   * is about to lay actually *goes* anywhere. Omitted (no roads, no buildings,
   * a unit test) the connectivity requirement is not enforced: there is
   * nothing in such a world for a stair to fail to reach, and refusing every
   * flight would be a worse answer than the one this rule exists to fix.
   */
  readonly connects?: (x: number, z: number) => boolean;
}

/** What the set-piece pass produced. */
export interface SetPieceResult {
  readonly blocks: StructureBlock[];
  readonly diagnostics: LoamDiagnostic[];
  readonly stats: Readonly<Record<string, number>>;
}

/** Dress every set piece the city plans seated. */
export function dressSetPieces(input: SetPiecePassInput): SetPieceResult {
  const pieces = input.cities.flatMap((c) => c.setPieces);
  if (pieces.length === 0) {
    return { blocks: [], diagnostics: [], stats: {} };
  }
  const world = buildLifeWorld({
    plan: input.plan,
    stack: input.stack,
    ...(input.existing === undefined ? {} : { existing: input.existing }),
    ...(input.avoid === undefined ? {} : { avoid: input.avoid }),
    ...(input.keepClear === undefined ? {} : { keepClear: input.keepClear }),
  });
  // No walk lane and no carriageway veto of this pass's own: the reserved walk
  // lane is a *district street* concept and every piece here stands on an
  // arterial verge, a bridge deck or open ground the plan reserved. What the
  // caller vetoes through `avoid` still vetoes absolutely.
  const planter = new Planter(
    world,
    input.stack,
    () => false,
    () => false,
    new Set<string>(),
    SET_PIECE_BUDGET,
  );
  const seed = detailSeed(input.seed, "setpieces");
  const seaLevel = input.plan.seaLevel;
  const region = input.plan.region;
  /** The fluid surface of a column, or `null` where the plan says it is dry. */
  const fluid = (x: number, z: number): number | null => {
    if (!inside(region, x, z)) return null;
    const idx = index(region, x, z);
    if (input.plan.fluidKind[idx] === FluidKind.NONE) return null;
    return input.plan.fluidTop[idx] as number;
  };

  const diagnostics: LoamDiagnostic[] = [];

  // Plan order throughout — the pieces arrive in the order `planVistas` rated
  // them, and the first one to claim a voxel keeps it.
  for (const piece of pieces) {
    switch (piece.kind) {
      case "bridge":
        dressBridge(planter, world, piece, fluid, seaLevel);
        break;
      case "promenade":
        dressPromenade(planter, world, piece, seed);
        break;
      case "stair": {
        const refused = dressStair(planter, world, piece, input.connects);
        if (refused !== null) {
          diagnostics.push(
            note(
              "STAIR_UNCONNECTED",
              input.nodePath,
              `a hillside stair was refused whole: ${refused}`,
              "nothing to change in the document — a flight that reaches no path at one end is a folly, and the pass declines it rather than stranding masonry on the slope",
            ),
          );
        }
        break;
      }
      case "square":
        dressSquare(planter, world, piece);
        break;
      default:
        // A landmark is a *building*: the grammar built it three passes ago,
        // from the placement the city pass seated. There is nothing to add.
        break;
    }
  }

  const stats: Record<string, number> = { setPieces: pieces.length };
  for (const [kind, n] of [...planter.stats].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    stats[`setPiece_${kind}`] = n;
  }
  stats["setPieceBlocks"] = planter.blocks.length;

  // Only when there was something other than a landmark to build. A landmark
  // *is* a building — the grammar put it up three passes ago, from the
  // placement the city pass seated — so a city whose anchors are all landmarks
  // writing nothing here is the expected outcome, and reporting it would be a
  // false alarm in every world that has one.
  const dressable = pieces.filter((p) => p.kind !== "landmark").length;
  if (dressable > 0 && planter.blocks.length === 0) {
    diagnostics.push(
      note(
        "SET_PIECES_EMPTY",
        input.nodePath,
        `${dressable} set ${dressable === 1 ? "piece" : "pieces"} needed dressing and none of it took: every candidate voxel was already claimed`,
        "nothing to change in the document — this is an occupancy report, and the anchors themselves are still in the world",
      ),
    );
  }
  return { blocks: planter.blocks, diagnostics, stats };
}

/* -------------------------------------------------------------------------- */
/* shared geometry                                                             */
/* -------------------------------------------------------------------------- */

/** The local heading at index `k` of a 4-connected path, as a unit step. */
function stepAt(path: readonly Point2[], k: number): { dx: number; dz: number } {
  const before = path[Math.max(0, k - 1)] as Point2;
  const after = path[Math.min(path.length - 1, k + 1)] as Point2;
  const dx = Math.sign(after.x - before.x);
  const dz = Math.sign(after.z - before.z);
  return dx === 0 && dz === 0 ? { dx: 0, dz: 1 } : { dx, dz };
}

/**
 * A column `offset` to the left of a path cell.
 *
 * The left-hand normal of `(dx, dz)` is `(dz, −dx)` — the same convention
 * `streetscape.perp` uses, restated rather than imported because that module's
 * `Step` type is private and a `Point2` plus a heading is what this pass has.
 */
function sideOf(cell: Point2, dx: number, dz: number, offset: number): Point2 {
  return { x: cell.x + dz * offset, z: cell.z - dx * offset };
}

/**
 * The highest voxel in a column that holds *anything*, within a band.
 *
 * Occupied, not solid, and the distinction is the whole reason this exists. A
 * bridge deck is laid as **top slabs** and railed with **fences**, neither of
 * which is a full cube, so `solidAt` reports open air all the way down to the
 * river bed and a lamp asked to stand on the rail would be asked to stand
 * eleven blocks under the water. `emptyAt` is false for a block of any shape,
 * for terrain and for fluid alike, which is exactly "the last thing before the
 * sky". Searched downward, so a deck always beats the bed beneath it.
 */
function topOccupied(
  world: LifeWorld,
  x: number,
  z: number,
  hi: number,
  lo: number,
  /**
   * The fluid surface in this column, or `null` where there is none.
   *
   * Load-bearing, and it cost a finding to learn: `emptyAt` is false for water
   * too, so on a wet column the deck's rail *and the open river* both answer
   * "occupied", and the first draft hung a lantern on the surface of the water
   * at the one cell where the deck happened not to reach. A support has to be
   * something you could stand a block on, and water is not.
   */
  fluidTop: number | null,
): number | null {
  if (!inside(world.region, x, z)) return null;
  for (let y = hi; y >= lo; y--) {
    if (world.emptyAt(x, y, z)) continue;
    if (fluidTop !== null && y <= fluidTop) return null;
    return y;
  }
  return null;
}

/** The cardinal name of a unit step, for a stair's `facing`. */
function facingOf(dx: number, dz: number): string {
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dz > 0 ? "south" : "north";
}

/** A masonry stair op whose raised half points the way you climb. */
function stairOp(dy: number, facing: string): LifeOp {
  return op(0, dy, 0, MASONRY_STAIRS, {
    facing,
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });
}

/* -------------------------------------------------------------------------- */
/* the bridge                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Make a crossing read as a bridge.
 *
 * C1 already carries the boulevard over the water and `buildBridgeDeck` already
 * lays a real deck under it: top slabs flush with both banks, one column wider
 * on each side than the lane, a fence rail down those two extra columns and a
 * pier at each end of the span. What is missing is not structure — it is
 * *arrival*. You cross and nothing tells you the ground has gone.
 *
 * Three additions, each placed against what the deck actually is rather than
 * against an assumption about it:
 *
 * 1. **Pylons** at the two abutments, standing on the bank in line with the
 *    deck rail, so the crossing has a portal you pass through.
 * 2. **Lamps** at a pitch down the span, standing on the fence rail the deck
 *    already carries — a standing lantern needs only a non-air block beneath
 *    it, and a fence post is one.
 * 3. **A balustrade** carrying the rail line off the deck and onto the
 *    approach, so the bridge does not stop being a bridge at the waterline.
 *
 * The rail line is `half + 1` — *outside* the carriageway, and exactly where
 * the deck's own fence runs. The first draft of this put it at `half`, which
 * narrowed the road and built a second rail inboard of the first; the deck is
 * also **top slabs**, so `solidAt` is false on it and a parapet asked to stand
 * there found nothing to stand on. Reading `buildBridgeDeck` rather than
 * guessing at it is what fixed both.
 */
function dressBridge(
  planter: Planter,
  world: LifeWorld,
  piece: SetPiece,
  fluid: (x: number, z: number) => number | null,
  seaLevel: number,
): void {
  const path = piece.path;
  if (path === undefined || path.length === 0) return;
  // The deck is one column wider each side than the lane and its rail runs on
  // that extra column. **Read, not restated**: `bridgeOffsets` is the one
  // source of truth the deck builder uses too, which is what stops the two
  // halves of the kit disagreeing about where the parapet line is — the defect
  // this pass shipped with once already.
  const { rail } = bridgeOffsets(piece.width ?? 9);
  const lamp = featureOf(BRIDGE_PROFILE, "lamp");
  // A generous band around the waterline: one scan per column, and no
  // assumption at all about the height the deck was graded to.
  const hi = seaLevel + 32;
  const lo = seaLevel - 8;

  // The span, as the deck builder sees it: a column is "over water" when its
  // own centre is wet, not when the parapet column beside it happens to be.
  const wet = path.map((cell) => fluid(cell.x, cell.z) !== null);
  // Arc along the span, so lamps are phase-locked to the crossing and land
  // symmetrically on it rather than being counted from the far end of the road.
  const arcs: number[] = [];
  let arc = 0;
  for (const isWet of wet) {
    arcs.push(isWet ? arc++ : -1);
    if (!isWet) arc = 0;
  }
  // The bank columns the parapet is carried over. Beyond this run the road is a
  // road, and a balustrade down the whole approach is a wall along a street.
  const approach = new Set(approachIndices(wet));

  for (const [k, cell] of path.entries()) {
    const { dx, dz } = stepAt(path, k);
    const atEnd = k < BRIDGE_PYLON_RUN || k >= path.length - BRIDGE_PYLON_RUN;
    for (const sign of [1, -1] as const) {
      const at = sideOf(cell, dx, dz, sign * rail);
      const wet = fluid(at.x, at.z);
      const top = topOccupied(world, at.x, at.z, hi, lo, wet);
      if (top === null) continue;
      const free = top + 1;
      if (wet !== null) {
        // Over the span the deck's own fence is already here, so the only
        // thing to add is light, and it rests on that fence.
        const along = arcs[k] as number;
        if (along < 0 || !featureHits(lamp, along)) continue;
        planter.place(
          "bridgeLamp",
          [op(0, 0, 0, LAMP, { hanging: "false", waterlogged: "false" })],
          at.x,
          free,
          at.z,
          PARAPET_RULE,
          false,
        );
        continue;
      }
      if (atEnd) {
        // The portal. Stacked from the bank up, so every block but the first
        // has a full cube below it and the first has the ground.
        const ops: LifeOp[] = [];
        for (let up = 0; up < BRIDGE_PYLON_HEIGHT; up++) {
          ops.push(op(0, up, 0, up === BRIDGE_PYLON_HEIGHT - 1 ? MASONRY_CHISELED : MASONRY));
        }
        if (planter.place("bridgePylon", ops, at.x, free, at.z, PARAPET_RULE, false)) {
          planter.place(
            "bridgeLamp",
            [op(0, 0, 0, LAMP, { hanging: "false", waterlogged: "false" })],
            at.x,
            free + BRIDGE_PYLON_HEIGHT,
            at.z,
            ATTACHED_RULE,
            false,
          );
        }
        continue;
      }
      // Continuity onto the bank, for the approach run and no further.
      if (!approach.has(k)) continue;
      planter.place(
        "bridgeBalustrade",
        [op(0, 0, 0, MASONRY_WALL)],
        at.x,
        free,
        at.z,
        PARAPET_RULE,
        false,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the promenade                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Give the shoreline drive a sea wall, lamps and somewhere to sit.
 *
 * Everything lands on the verge between the carriageway and the water — never
 * on the road, never over the water — and every footing is anchored, so a
 * railing post whose column happens to be a block lower than its neighbour is
 * dropped rather than left standing on air. On a natural shoreline that is
 * common enough that the railing comes out slightly broken, which is what a
 * sea wall on a natural shoreline looks like.
 */
function dressPromenade(
  planter: Planter,
  world: LifeWorld,
  piece: SetPiece,
  seed: number,
): void {
  const path = piece.path;
  const side = piece.waterSide;
  if (path === undefined || side === undefined) return;
  const half = ((piece.width ?? 11) - 1) >> 1;
  const railAt = half + PROMENADE_RAIL_OFFSET;

  for (const [k, cell] of path.entries()) {
    const { dx, dz } = stepAt(path, k);
    const rail = sideOf(cell, dx, dz, side * railAt);
    const y = world.standY(rail.x, rail.z);
    if (y === undefined) continue;
    if (!planter.place("promenadeRail", [op(0, 0, 0, MASONRY_WALL)], rail.x, y, rail.z, PAVEMENT_RULE)) {
      continue;
    }
    if (k % PROMENADE_LAMP_PITCH === 0) {
      planter.place(
        "promenadeLamp",
        [
          op(0, 0, 0, MASONRY_WALL),
          op(0, 1, 0, LAMP, { hanging: "false", waterlogged: "false" }),
        ],
        rail.x,
        y + 1,
        rail.z,
        ATTACHED_RULE,
        false,
      );
      continue;
    }
    if (k % PROMENADE_BENCH_PITCH !== 0) continue;
    // A bench one column inland of the railing, facing the water: two stairs
    // whose raised half points away from the sea, so you sit looking at it.
    const seat = sideOf(cell, dx, dz, side * (railAt - 1));
    const seatY = world.standY(seat.x, seat.z);
    if (seatY === undefined) continue;
    const facing = facingOf(-side * dz, side * dx);
    // Along the walk, not across it: a three-block bench laid across a
    // promenade has one end in the carriageway, which the rule would refuse
    // anyway — so the whole bench would silently never appear.
    const along: Point2 = dx !== 0 ? { x: 1, z: 0 } : { x: 0, z: 1 };
    planter.place(
      "promenadeBench",
      [
        stairOp(0, facing),
        { ...stairOp(0, facing), dx: along.x, dz: along.z },
        { ...stairOp(0, facing), dx: -along.x, dz: -along.z },
      ],
      seat.x,
      seatY,
      seat.z,
      PAVEMENT_RULE,
    );
    // A planter beside the bench, half the time — a rhythm the eye reads as
    // maintained rather than stamped.
    if (hashInt(seed, seat.x, seat.z, 3, 0, 1) === 1) {
      const potX = seat.x + along.x * 2;
      const potZ = seat.z + along.z * 2;
      const potY = world.standY(potX, potZ);
      if (potY !== undefined) {
        planter.place("promenadePot", [op(0, 0, 0, "flower_pot")], potX, potY, potZ, PAVEMENT_RULE);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the hillside stair                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Lay a public stair up a bank a player cannot walk.
 *
 * A **defect fix** as much as a set piece, and the two halves have to be solved
 * together or neither is worth having. C1 levels each quarter to its own median
 * and deliberately does not level the city, so where two quarters at different
 * levels meet there is a bank. A one-block riser in it is a step; a two-block
 * riser is a wall, and a run of them is a piece of the city you can see and
 * cannot reach.
 *
 * ## Why the obvious construction does not work
 *
 * The obvious flight is a masonry stair block in the first air block of every
 * column, following the bank. It reads beautifully and it fixes **nothing**:
 * raising every column by the same half block leaves every riser exactly as
 * tall as it was, and on a two-block riser it is actively worse — you arrive at
 * the lower tread's raised half and the next tread's *low* half is now one and
 * a half blocks above you, which is past what a player can climb. Working that
 * out on paper rather than shipping it is the difference between a stair and a
 * decorated wall.
 *
 * ## What is built instead
 *
 * A tread *level* per column, chosen so the flight is climbable by construction:
 *
 * 1. every column wants at least one course of masonry, so the flight is
 *    continuous paving rather than steps interrupted by grass;
 * 2. a **backward** pass then raises each column until the next one is at most
 *    one block above it — `need[k] = max(low[k], need[k+1] − 1)` — which is the
 *    whole of "no unclimbable riser", stated once;
 * 3. the column is filled from its own ground up to that level.
 *
 * The two ways this can fail are checked rather than papered over: if the pass
 * has to raise the *bottom* step out of reach of the ground in front of it, or
 * if any column needs more than {@link STAIR_MAX_FILL} courses, the bank is too
 * steep for a flight of this length and nothing is built at all. A stair you
 * cannot get onto is the defect with a balustrade added.
 *
 * Every block sits on the one below it and the lowest sits on the bank, so
 * nothing here can float; the `standY(x, z) === y` anchor on each column's first
 * course is what makes that a fact rather than a hope.
 */
function dressStair(
  planter: Planter,
  world: LifeWorld,
  piece: SetPiece,
  connects?: (x: number, z: number) => boolean,
): string | null {
  const proposal = piece.path;
  if (proposal === undefined || proposal.length < 2) return null;
  const half = STAIR_TREAD_WIDTH >> 1;
  const rail = half + 1;

  const seated = seekFlight(world, proposal, connects);
  if (seated === null) {
    // Only worth reporting when there *was* a connectivity rule to fail. With
    // no `connects` the null is the old "no climbable strip here" outcome, and
    // that has never been a diagnostic.
    return connects === undefined
      ? null
      : "no strip in the search window both climbs the bank and reaches a road, plaza or building pad at each end";
  }
  const { path, need } = seated;

  // The tread law. `need[]` is the *mechanism* — it is what makes the flight
  // climbable and nothing below moves it. What the law decides is only what the
  // topmost course of each already-levelled column is made of: a stair where
  // the column ahead is a block higher, a full block at a landing, a top slab
  // on the flat interior of a run. That mix is what stops a public stair
  // reading as the patch of bricks Kai photographed on the cliff.
  const centreGround = path.map((cell) => world.standY(cell.x, cell.z) ?? 0);
  // The levels are the engine's — `synthesizeTreads` owns the recurrence, and
  // `seekFlight` above has already vetted the same run, so this agrees with
  // `need[]` by construction and is only asked for the *shapes*.
  const dressed = synthesizeTreadPlan(centreGround, {
    maxFill: STAIR_MAX_FILL,
    reach: 1,
    maxGrade: 1,
  });
  const shapes: readonly TreadShape[] = dressed?.shapes ?? path.map(() => "landing" as TreadShape);

  for (const [k, cell] of path.entries()) {
    const { dx, dz } = stepAt(path, k);
    const level = need[k] as number;
    const shape = shapes[k] as TreadShape;
    const facing = facingOf(dx, dz);
    for (let a = -rail; a <= rail; a++) {
      const at = sideOf(cell, dx, dz, a);
      const base = world.standY(at.x, at.z);
      if (base === undefined) continue;
      // A flanking column already higher than the tread keeps its own ground:
      // filling *down* is not something an additive pass can do, and a bank
      // that pokes through the edge of a flight is a bank.
      const courses = level - base;
      const isRail = Math.abs(a) === rail;
      const ops: LifeOp[] = [];
      for (let up = 0; up < courses; up++) {
        // The rail columns stay solid masonry: a balustrade footing is a plinth
        // and a slab under a wall post is a hole in the parapet line.
        const isTopCourse = up === courses - 1 && !isRail;
        ops.push(
          isTopCourse && shape === "stair"
            ? stairOp(up, facing)
            : isTopCourse && shape === "slab"
              ? op(0, up, 0, MASONRY_SLAB, { type: "top", waterlogged: "false" })
              : op(0, up, 0, MASONRY),
        );
      }
      if (courses > 0 && !planter.place(isRail ? "stairRailBase" : "stairTread", ops, at.x, base, at.z, PAVEMENT_RULE)) {
        continue;
      }
      if (!isRail) continue;
      // The balustrade sits on the course just laid, or straight on the ground
      // where the flight needed none — anchored in that second case, because
      // then it is the thing standing on the bank.
      const top = Math.max(level, base);
      const placed = planter.place(
        "stairRail",
        [op(0, 0, 0, MASONRY_WALL)],
        at.x,
        top,
        at.z,
        PAVEMENT_RULE,
        courses === 0,
      );
      if (!placed || k % STAIR_LAMP_PITCH !== 0) continue;
      planter.place(
        "stairLamp",
        [
          op(0, 0, 0, MASONRY_WALL),
          op(0, 1, 0, LAMP, { hanging: "false", waterlogged: "false" }),
        ],
        at.x,
        top + 1,
        at.z,
        ATTACHED_RULE,
        false,
      );
    }
  }
  return null;
}

/**
 * Re-seat a proposed flight against the ground that actually got emitted.
 *
 * The plan chose its strip on the heightfield as it stood **before the city's
 * quarters were levelled**, which is the only field the layout stage has: a
 * cell's terrace pad is computed in the same function that plans the set
 * pieces and applied a stage later. So by the time there is a world to build
 * in, the bank the plan found may have been flattened into a quarter, and new
 * ones may have appeared at the seams between quarters — which is precisely
 * where a city stair belongs.
 *
 * Rather than build the plan's strip regardless (a stair up nothing) or refuse
 * it (a defect left in place), the proposal is treated as what it is: a
 * *direction*, and roughly a place. A small window around it is swept on the
 * finished ground and the steepest flight that can actually be climbed wins.
 *
 * Ties break on the sweep order, which is fixed: nearest offset first, and
 * within that the lower offset. Nothing here consults a random source.
 */
function seekFlight(
  world: LifeWorld,
  proposal: readonly Point2[],
  connects?: (x: number, z: number) => boolean,
): { readonly path: Point2[]; readonly need: number[] } | null {
  const length = proposal.length;
  const first = proposal[0] as Point2;
  const last = proposal[length - 1] as Point2;
  const dx = Math.sign(last.x - first.x);
  const dz = Math.sign(last.z - first.z);
  if (dx === 0 && dz === 0) return null;
  // One cardinal: the plan's strips are cardinal by construction, and a
  // diagonal flight would need stepped treads this recipe does not build.
  const step = Math.abs(last.x - first.x) >= Math.abs(last.z - first.z)
    ? { dx, dz: 0 }
    : { dx: 0, dz };

  // One `best` per ring, not one for the whole sweep: the nearest ring that
  // holds a buildable flight wins outright, because a stair is a *place* and
  // searching further out for a steeper bank would drift it away from the seam
  // the plan chose it for.
  for (let radius = 0; radius <= STAIR_SEEK; radius++) {
    let best: { path: Point2[]; need: number[]; rise: number } | null = null;
    for (let du = -radius; du <= radius; du++) {
      for (let dv = -radius; dv <= radius; dv++) {
        if (radius > 0 && Math.max(Math.abs(du), Math.abs(dv)) !== radius) continue;
        const path: Point2[] = [];
        const walk: number[] = [];
        let ok = true;
        for (let k = 0; k < length && ok; k++) {
          const at = {
            x: first.x + du + step.dx * k + (step.dx === 0 ? dv : 0),
            z: first.z + dv + step.dz * k + (step.dz === 0 ? du : 0),
          };
          const y = world.standY(at.x, at.z);
          // A wet column has no `standY` at all, which is the water veto for
          // free: a flight may not begin, end or pass through the sea.
          if (y === undefined) ok = false;
          else if (walk.length > 0 && y < (walk[walk.length - 1] as number)) ok = false;
          else {
            path.push(at);
            walk.push(y);
          }
        }
        if (!ok || walk.length < length) continue;
        const rise = (walk[length - 1] as number) - (walk[0] as number);
        if (rise < STAIR_MIN_BUILT_RISE) continue;
        const need = walk.map((y) => y + 1);
        for (let k = need.length - 2; k >= 0; k--) {
          need[k] = Math.max(need[k] as number, (need[k + 1] as number) - 1);
        }
        // Getting *on* to the flight: the ground in front of the first step is
        // at `walk[0]`, so a first tread more than one block above it is a wall
        // with a stair behind it.
        if ((need[0] as number) - (walk[0] as number) > 1) continue;
        let worst = 0;
        for (const [k, level] of need.entries()) {
          const courses = level - (walk[k] as number);
          if (courses > worst) worst = courses;
        }
        if (worst > STAIR_MAX_FILL) continue;
        // Both ends, or neither: a flight is a connection, and one that lands
        // on open hillside at either end is the folly this rule refuses. The
        // sweep is doing the relocating for free — a strip one ring out that
        // *does* reach the street wins over the plan's own, and only when no
        // ring holds a connected strip does the piece decline whole.
        if (!endsConnect(path, connects)) continue;
        if (best !== null && rise <= best.rise) continue;
        best = { path, need, rise };
      }
    }
    if (best !== null) return { path: best.path, need: best.need };
  }
  return null;
}

/**
 * Does a flight reach something at *both* ends?
 *
 * The test is a Chebyshev ball of {@link STAIR_CONNECT} columns around the
 * first and last tread, and it deliberately does not care *what* it finds: a
 * carriageway, a sidewalk, a plaza cell and a building pad are all places a
 * player is already walking, and a stair that meets any of them is a stair
 * that is used. Excluding the flight's own columns is unnecessary — the stair
 * has not been written yet, and `connects` reports the city, not this pass.
 *
 * With no predicate the answer is yes: see {@link SetPiecePassInput.connects}.
 */
export function endsConnect(
  path: readonly Point2[],
  connects?: (x: number, z: number) => boolean,
): boolean {
  if (connects === undefined) return true;
  const reaches = (cell: Point2): boolean => {
    for (let dz = -STAIR_CONNECT; dz <= STAIR_CONNECT; dz++) {
      for (let dx = -STAIR_CONNECT; dx <= STAIR_CONNECT; dx++) {
        if (connects(cell.x + dx, cell.z + dz)) return true;
      }
    }
    return false;
  };
  const first = path[0];
  const last = path[path.length - 1];
  if (first === undefined || last === undefined) return false;
  return reaches(first) && reaches(last);
}

/* -------------------------------------------------------------------------- */
/* the civic square                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Furnish the void the plan held open.
 *
 * The *void* is the set piece — it was made by punching the square out of the
 * cell's lot mask before the quarter was subdivided, which is the only moment
 * at which a district can be told "not here". What is added here is only what
 * makes the void legible as a decision: a monument on a plinth at the centre,
 * and a lamp inset from each corner.
 *
 * Nothing is paved. Repainting a surface is the ground pass's job and it has
 * already run; a paving layer written *on top* of the ground would raise the
 * square a block above every street that meets it, which is a kerb all the way
 * round a place people are meant to walk into.
 */
function dressSquare(planter: Planter, world: LifeWorld, piece: SetPiece): void {
  const site = piece.site;
  const cx = (site.x0 + site.x1) >> 1;
  const cz = (site.z0 + site.z1) >> 1;

  // The plinth: a 3 × 3 of masonry, all nine footings at one level. Anchored,
  // so a centre that straddles a graded step is refused whole and the square
  // keeps its lamps rather than getting a monument with one corner in the air.
  const plinth: LifeOp[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) plinth.push(op(dx, 0, dz, MASONRY));
  }
  const y = world.standY(cx, cz);
  if (y !== undefined && planter.place("squarePlinth", plinth, cx, y, cz, GROUND_RULE)) {
    // The column, stacked on the plinth's middle: a slab cap, a shaft, a
    // chiselled head and a lantern. Every block has the one below it.
    const shaft: LifeOp[] = [op(0, 0, 0, MASONRY_SLAB, { type: "bottom", waterlogged: "false" })];
    for (let up = 1; up <= MONUMENT_HEIGHT; up++) {
      shaft.push(op(0, up, 0, up === MONUMENT_HEIGHT ? MASONRY_CHISELED : MASONRY));
    }
    shaft.push(op(0, MONUMENT_HEIGHT + 1, 0, LAMP, { hanging: "false", waterlogged: "false" }));
    planter.place("squareMonument", shaft, cx, y + 1, cz, ATTACHED_RULE, false);
  }

  const corners: readonly Point2[] = [
    { x: site.x0 + SQUARE_LAMP_INSET, z: site.z0 + SQUARE_LAMP_INSET },
    { x: site.x1 - SQUARE_LAMP_INSET, z: site.z0 + SQUARE_LAMP_INSET },
    { x: site.x0 + SQUARE_LAMP_INSET, z: site.z1 - SQUARE_LAMP_INSET },
    { x: site.x1 - SQUARE_LAMP_INSET, z: site.z1 - SQUARE_LAMP_INSET },
  ];
  for (const corner of corners) {
    const standing = world.standY(corner.x, corner.z);
    if (standing === undefined) continue;
    planter.place(
      "squareLamp",
      [
        op(0, 0, 0, MASONRY_WALL),
        op(0, 1, 0, MASONRY_WALL),
        op(0, 2, 0, LAMP, { hanging: "false", waterlogged: "false" }),
      ],
      corner.x,
      standing,
      corner.z,
      GROUND_RULE,
    );
  }
}
