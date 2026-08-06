/**
 * `role: "steps"` — a street the tread law lays instead of the grader
 * (`docs/URBAN-FORMS-v0.md` §4.2).
 *
 * A `terraced` quarter's cross-contour connections are not roads with a steep
 * profile; they are flights of stairs, and the difference is the whole of
 * whether a hill town is walkable. So a steps segment is **not** graded by
 * `gradeProfile` — it is laid by {@link synthesizeTreads} over the ground of its
 * own path and dressed with {@link STAIR_PROFILE}, which is the same code the
 * hillside set-piece stair uses.
 *
 * That buys four things this module deliberately does not reimplement:
 *
 * - the **tread law** — `need[k] = max(g[k] + 1, need[k+1] − 1)`, the backward
 *   pass that is the entirety of "no unclimbable riser";
 * - the **slab / stair / landing mix**, so a flight reads as masonry steps
 *   rather than as a patch of bricks;
 * - the profile's tread width, so a street stair reads as the same masonry the
 *   hillside set-piece stair is made of;
 * - **whole-run refusal.** A flight that cannot be made climbable is not built
 *   at all. Half a staircase ending in a two-block hop is worse than no
 *   staircase, and `traversal.unreachable` will find the bench that lost its
 *   only stair whether or not this module says anything.
 *
 * **The balustrade and its lamps are built, and the surfacer's shape is what
 * made that possible** (`docs/COURTYARDS-AND-LEVELS-v0.md` §2). They are the one
 * part of `STAIR_PROFILE` that stands *above* the tread, and a street stair
 * shares its columns with the contour streets it joins. Under the old surfacer
 * whichever segment was reached last owned a shared column, so a wall placed on
 * a tread could be left standing over a column another segment had since
 * lowered — `unsupported.chain`, and a floating balustrade is a worse defect than
 * a plain flight, so v0 shipped without one. Ownership now decides a column's
 * level before anything is written, and the rail is emitted in the **furnish**
 * phase against a `plan.ground` that is final. Hence the split below: geometry,
 * then levels, then dressing, then the rail — one phase per call, so the
 * surfacer can complete each over every segment before starting the next.
 *
 * Like `surfaceRoute`, the dressing mutates the column plan rather than emitting
 * blocks over the top of it, so the heightmap, the fluid validator and the biome
 * pass all keep looking at the same ground the player walks on.
 */

import type { Region } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Point2 } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";
import { STAIR_PROFILE, featureOf, treadPlan, type TreadShape } from "./profiles.js";
import { synthesizeTreads } from "./sweep.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Most courses of masonry one column of a street stair may carry.
 *
 * A flight between two benches climbs one bench — four blocks — plus whatever
 * the ground under it does on the way. Twice that is generous and still refuses
 * the flight down a cliff, which is the case worth refusing.
 */
export const STREET_STAIR_MAX_FILL = 8;

/**
 * The block name behind a **ground role**, for a dressing that needs properties.
 *
 * The palette stores state ids and a stair has to be laid facing the way you
 * are walking, so the role is resolved to its *name* and the property set is
 * applied to that. A palette without the role — every unit test that dresses a
 * flight by hand — falls back to the name the pass used before the roles
 * existed, so nothing built off this module can come out as air.
 */
function roleBlock(
  palette: Palette | undefined,
  role: string,
  fallback: string,
  stack: PrismarineStack,
): string {
  if (palette === undefined || !palette.has(role)) return fallback;
  return stack.blockNameByStateId(palette.state(role)) ?? fallback;
}

/**
 * Columns of tread, from {@link STAIR_PROFILE}.
 *
 * Read lazily rather than at module scope: `roads.ts` imports this module and
 * `profiles.ts` is reached through the same cycle, so a top-level read of
 * `STAIR_PROFILE.bands` runs before the profile exists in some import orders.
 */
function treadWidth(): number {
  return STAIR_PROFILE.bands.find((b) => b.id === "tread")?.width ?? 5;
}

/** Steps between lanterns on the balustrade — {@link STAIR_PROFILE}'s `lamp`. */
function lampPitch(): number {
  return featureOf(STAIR_PROFILE, "lamp").pitch;
}

/**
 * Steps between balustrade lanterns, at least.
 *
 * The profile's own `lamp` pitch is four, which is the rhythm of the *masonry*
 * — where the parapet thickens into a post — and reading it as the rhythm of
 * the *lighting* is what produced the hill town's glitter: a lantern every four
 * steps, on both balustrades, of every flight. A terraced quarter is nothing
 * but flights, and it is stacked, so a player standing on one bench sees six
 * terraces' worth of them at once: 314 lanterns on fifteen houses' worth of
 * town, against 55 street lamps.
 *
 * Twelve steps is a lantern you walk *to*, which is what a stair lantern is
 * for. The head and the foot of every flight are lit regardless
 * ({@link streetStairRail}), so a short flight is still a lit flight.
 */
export const STREET_STAIR_LAMP_PITCH = 12;

/* -------------------------------------------------------------------------- */
/* phase 1 — geometry                                                          */
/* -------------------------------------------------------------------------- */

/** What the claim phase needs to know about one flight. */
export interface StreetStairGeometryInput {
  readonly region: Region;
  /** Read for `fluidKind` only; nothing here writes. */
  readonly plan: ColumnPlan;
  /** Columns no street may cut into — every building footprint. */
  readonly blocked: Uint8Array;
  /** Columns some other pass already paved (a plaza, a green). */
  readonly paved: Uint8Array;
  /** Columns a bridge may span — a stair never crosses one. */
  readonly water: Uint8Array;
  /** The segment's centre line, 4-connected, already clipped to the region. */
  readonly path: readonly Point2[];
  /** The segment's declared carriageway width. */
  readonly width: number;
}

/**
 * What one column of a flight is for.
 *
 * - `"tread"` — walked on, and dressed with the stair/slab/landing mix.
 * - `"parapet"` — the balustrade's plinth: the outermost *carriageway* column,
 *   levelled with the flight and left as plain masonry, because a slab under a
 *   wall post is a hole in the parapet line.
 * - `"verge"` — the column outside the carriageway, levelled so the bank does
 *   not poke through the edge of the stair. Nothing stands on it.
 */
export type StreetStairRole = "tread" | "parapet" | "verge";

/** One column of a flight's tread band. */
export interface StreetStairColumn {
  /** Index along the centre line. */
  readonly k: number;
  /** Signed lateral offset from the centre line. */
  readonly a: number;
  readonly x: number;
  readonly z: number;
  readonly idx: number;
  readonly role: StreetStairRole;
}

/** The columns a flight would level, before anything about levels is known. */
export interface StreetStairGeometry {
  readonly centre: readonly Point2[];
  readonly columns: readonly StreetStairColumn[];
  /** Lateral offset of the balustrade course; 0 when the flight carries none. */
  readonly parapet: number;
  /** Present when the flight is refused: why, in the author's terms. */
  readonly refusedBecause?: string;
}

/** Nothing to build, for a run that never had a chance. */
function refusedGeometry(reason: string): StreetStairGeometry {
  return { centre: [], columns: [], parapet: 0, refusedBecause: reason };
}

/**
 * The columns one flight occupies — the claim phase's whole question.
 *
 * Purely geometric: it reads the masks and the fluid map and nothing that any
 * segment writes, so the answer does not depend on which segments have been
 * surfaced. Whether the flight can actually be *climbed* is the level phase's
 * question ({@link streetStairLevels}); this refuses only the runs that have no
 * ground to stand on at all.
 */
export function streetStairGeometry(input: StreetStairGeometryInput): StreetStairGeometry {
  const { region, plan, path } = input;
  const idx = (x: number, z: number): number => (z - region.z0) * region.width + (x - region.x0);
  const within = (x: number, z: number): boolean =>
    x >= region.x0 && z >= region.z0 && x < region.x0 + region.width && z < region.z0 + region.depth;

  const centre = path.filter((c) => within(c.x, c.z));
  if (centre.length < 4) return refusedGeometry("the flight is shorter than four columns");

  // A stair is masonry on land. Water or a foreign footprint under the centre
  // line is not something a flight can be laid over, and half a flight is worse
  // than none — so the whole run goes.
  for (const cell of centre) {
    const k = idx(cell.x, cell.z);
    if (input.water[k] === 1 || plan.fluidKind[k] !== FluidKind.NONE) {
      return refusedGeometry("the flight would cross water, which wants a bridge rather than a stair");
    }
    if (input.blocked[k] === 1) {
      return refusedGeometry("the flight would cross a building footprint");
    }
  }

  const half = treadWidth() >> 1;
  // Never wider than the segment declared plus its balustrade: a lane-width
  // steps segment is three columns of tread, and the profile's five would eat
  // the verge either side of it.
  const tread = Math.min(half, (input.width - 1) >> 1);
  // **The balustrade stands on the outermost carriageway column, not beyond
  // it.** The obvious place for a parapet is one column outside the tread, and
  // it is the wrong one: that column is the innermost *sidewalk* column of the
  // segment, and `streetscape.ts`'s `paveSidewalks` re-levels the whole sidewalk
  // band to its street's centre line after this pass has run — which on a flight
  // means the ground is pulled out from under a wall that was, at the time it
  // was emitted, standing on solid tread. (Measured: 75 of 487 balustrade blocks
  // on the terraced world, and every one of them a sidewalk column.) The
  // streetscape skips any column in `masks.carriageway`, so a parapet inside the
  // carriageway band is safe from it by construction — the same reason the
  // treads themselves have never been disturbed.
  const parapet = tread > 0 ? tread : 0;
  const verge = tread + 1;

  const columns: StreetStairColumn[] = [];
  for (const [k, cell] of centre.entries()) {
    const step = stepAt(centre, k);
    // A 4-connected step's perpendicular is the other axis, exactly.
    const px = -step.dz;
    const pz = step.dx;
    for (let a = -verge; a <= verge; a++) {
      const x = cell.x + px * a;
      const z = cell.z + pz * a;
      if (!within(x, z)) continue;
      const k2 = idx(x, z);
      if (input.blocked[k2] === 1 || input.paved[k2] === 1) continue;
      if (input.water[k2] === 1 || plan.fluidKind[k2] !== FluidKind.NONE) continue;
      const d = Math.abs(a);
      const role: StreetStairRole =
        d === verge ? "verge" : parapet > 0 && d === parapet ? "parapet" : "tread";
      columns.push({ k, a, x, z, idx: k2, role });
    }
  }
  return { centre, columns, parapet };
}

/* -------------------------------------------------------------------------- */
/* phase 2 — levels                                                            */
/* -------------------------------------------------------------------------- */

/** The flight's levels, in stand units, plus the tread mix they imply. */
export interface StreetStairLevels {
  /** The level a player stands at, per centre index. */
  readonly levels: readonly number[];
  readonly shapes: readonly TreadShape[];
  /** Present when refused: why, in the author's terms. */
  readonly refusedBecause?: string;
}

/**
 * Lay the tread law over a flight, against a **frozen** ground snapshot.
 *
 * `ground` is the surfacer's `natural` array, never the mutating plan: a flight
 * graded against ground an earlier segment has already cut is a flight whose
 * levels depend on document order, which is the defect §2 exists to remove.
 *
 * `pinFirst` / `pinLast` are the *ground* levels of the landings at either end
 * when those columns belong to some other segment — the level that segment has
 * already chosen. They are converted to stand units here, which is the one place
 * the two conventions meet: `need[k]` is the level a player stands at, so the
 * topmost solid block of column `k` is at `need[k] − 1`.
 */
export function streetStairLevels(
  geometry: StreetStairGeometry,
  ground: (x: number, z: number) => number,
  pins: { readonly first?: number; readonly last?: number } = {},
): StreetStairLevels {
  const centreGround = geometry.centre.map((c) => ground(c.x, c.z) + 1);
  const run = synthesizeTreads(centreGround, {
    maxFill: STREET_STAIR_MAX_FILL,
    reach: 1,
    maxGrade: 1,
    ...(pins.first === undefined ? {} : { pinFirst: pins.first + 1 }),
    ...(pins.last === undefined ? {} : { pinLast: pins.last + 1 }),
  });
  if (run.levels === null) {
    return {
      levels: [],
      shapes: [],
      refusedBecause: `no flight of ${geometry.centre.length} columns climbs this bank within ${STREET_STAIR_MAX_FILL} courses of masonry`,
    };
  }
  return { levels: run.levels, shapes: treadPlan(run.levels, centreGround) };
}

/* -------------------------------------------------------------------------- */
/* phase 3 — dressing                                                          */
/* -------------------------------------------------------------------------- */

/** Everything the dress and furnish phases write into. */
export interface StreetStairDressInput {
  readonly region: Region;
  /** Mutated in place, exactly as `surfaceRoute` mutates it. */
  readonly plan: ColumnPlan;
  /** 1 for a column the street pass surfaced; written here too. */
  readonly road: Uint8Array;
  /** The surfaced level of each road column; written here too. */
  readonly roadY: Int32Array;
  /** Masonry states, from the street state set. */
  readonly states: { readonly step: number; readonly subsurface: number };
  readonly stack: PrismarineStack;
  /**
   * The palette, for the ground roles the nosing and the balustrade take.
   *
   * A flight is the most visible piece of built ground in a hill town and every
   * one of them used to be dressed in `stone_brick_stairs` and
   * `stone_brick_slab` by name, whatever the settlement was made of. Optional
   * because a caller with no palette — the unit tests that dress a flight on a
   * bare plan — must still get the blocks it always got.
   */
  readonly palette?: Palette;
  readonly occupancy?: OccupancyGrid;
  /**
   * `owner[idx] === job` for every column this flight is allowed to *level*.
   *
   * A flight paints every column it claimed and levels only the ones it owns —
   * the geometry/material split of §2.3.
   */
  readonly owner: Int32Array;
  readonly job: number;
}

/** What a flight's dressing wrote. */
export interface StreetStairDressResult {
  readonly blocks: readonly StructureBlock[];
  /** Columns the flight levelled and surfaced. */
  readonly columns: number;
}

/**
 * Write one flight into the column plan.
 *
 * Only what the flight *owns* moves: the tread band's ground, fluid top, snow,
 * surface, subsurface and soil, plus its road tag and level. A column some other
 * segment owns is left at that segment's level, which is what the pins in
 * {@link streetStairLevels} were measured against, so the flight lands on the
 * street rather than beside it.
 */
export function dressStreetStairs(
  geometry: StreetStairGeometry,
  levels: StreetStairLevels,
  input: StreetStairDressInput,
): StreetStairDressResult {
  const { plan } = input;
  const blocks: StructureBlock[] = [];
  let columns = 0;

  for (const column of geometry.columns) {
    if (input.owner[column.idx] !== input.job) continue;
    const level = levels.levels[column.k] as number;
    const top = level - 1;
    const k2 = column.idx;

    plan.ground[k2] = top;
    plan.fluidTop[k2] = top;
    plan.snow[k2] = 0;
    plan.surface[k2] = input.states.step;
    plan.subsurface[k2] = input.states.subsurface;
    if (plan.soil[k2] === 0) plan.soil[k2] = 1;
    input.road[k2] = 1;
    input.roadY[k2] = top;
    if (input.occupancy !== undefined) input.occupancy.mask[k2] = 1;
    columns++;

    // The parapet plinth and the verge either side are levelled with the flight
    // — so the bank does not poke through the edge of the stair — but neither
    // carries the tread mix. The balustrade on top of the plinth is the furnish
    // phase's.
    if (column.role !== "tread") continue;

    // The tread law's mix, laid *into* the top course rather than on top of it:
    // a stair block where the column ahead is a block higher, a top slab on the
    // flat interior of a run, and a plain full block at a landing.
    const shape = levels.shapes[column.k] as TreadShape;
    const step = stepAt(geometry.centre, column.k);
    const dressing =
      shape === "stair"
        ? input.stack.blockStateOf(
            roleBlock(input.palette, "ground.stairs", "stone_brick_stairs", input.stack),
            {
              facing: facingOf(step.dx, step.dz),
              half: "bottom",
              shape: "straight",
              waterlogged: "false",
            },
          )
        : shape === "slab"
          ? input.stack.blockStateOf(
              roleBlock(input.palette, "ground.slab", "stone_brick_slab", input.stack),
              { type: "top", waterlogged: "false" },
            )
          : undefined;
    if (dressing !== undefined) blocks.push({ x: column.x, y: top, z: column.z, stateId: dressing });
  }

  return { blocks, columns };
}

/* -------------------------------------------------------------------------- */
/* phase 4 — the balustrade                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The flight's balustrade and its lamps — {@link STAIR_PROFILE}'s parapet band.
 *
 * Emitted in the surfacer's **furnish** phase, which is the entire reason it can
 * exist at all: `plan.ground` is final by then, so a wall laid on a rail column
 * cannot be undercut by a segment surfaced later. Each course is checked against
 * the ground actually under it rather than against the level the flight asked
 * for, so a rail column another segment owns — a landing shared with the street —
 * carries its wall at the street's height or carries none.
 *
 * A lamp is the same two courses the hillside set-piece stair uses: the wall
 * post, a second wall block, and a lantern on top, every `lamp` steps of the
 * profile's own pitch.
 */
export function streetStairRail(
  geometry: StreetStairGeometry,
  levels: StreetStairLevels,
  input: {
    readonly region: Region;
    readonly plan: ColumnPlan;
    readonly stack: PrismarineStack;
    readonly lantern: number;
    /** For the `balustrade` and `coping` ground roles; see {@link roleBlock}. */
    readonly palette?: Palette;
  },
): StructureBlock[] {
  const out: StructureBlock[] = [];
  const role = (name: string, fallback: string): number | undefined =>
    input.palette !== undefined && input.palette.has(name)
      ? input.palette.state(name)
      : input.stack.blockByName(fallback)?.stateId;
  // The theme's balustrade over the theme's coping — the same pair a retaining
  // wall is capped with, because a flight beside a wall and the wall itself are
  // the same piece of built ground and used to be the same two grey blocks by
  // accident rather than by agreement.
  const wall = role("ground.balustrade", "stone_brick_wall");
  const plinth = role("ground.coping", "stone_bricks");
  if (wall === undefined || plinth === undefined || levels.levels.length === 0) return out;
  // The post rhythm is the profile's; the *lantern* rhythm is not. See
  // {@link STREET_STAIR_LAMP_PITCH}.
  const pitch = Math.max(1, lampPitch());
  const lampPitchSteps = Math.max(pitch, STREET_STAIR_LAMP_PITCH);

  // One balustrade carries the lighting, not both: two lit rails four columns
  // apart read as a runway. Which one is a pure function of where the flight
  // starts, so neighbouring flights alternate and the quarter does not end up
  // lit down one edge.
  const head = geometry.centre[0] as Point2 | undefined;
  const litSide = head === undefined || (((head.x + head.z) & 1) === 0) ? 1 : -1;

  // The ends of the flight, so the head and the foot are lit however short it
  // is: a lantern at the top of a stair is the one that tells you the stair is
  // there. Taken over parapet columns on the lit side only, so the two ends are
  // real balustrade columns and not a step the rail never reached.
  let firstK = Infinity;
  let lastK = -Infinity;
  for (const column of geometry.columns) {
    if (column.role !== "parapet") continue;
    if (Math.sign(column.a) !== litSide) continue;
    if (column.k < firstK) firstK = column.k;
    if (column.k > lastK) lastK = column.k;
  }

  for (const column of geometry.columns) {
    if (column.role !== "parapet") continue;
    const k2 = column.idx;
    if (input.plan.fluidKind[k2] !== FluidKind.NONE) continue;
    // The ground as it finally stands, not the level the flight asked for: on a
    // shared landing that is the owning street's level, and a rail that ignored
    // it would be the floating balustrade v0 refused to build.
    const top = input.plan.ground[k2] as number;
    // A rail is only a rail where the flight actually rises beside it. On a
    // landing the parapet would be a knee-high wall across a junction.
    const level = levels.levels[column.k] as number;
    if (top !== level - 1) continue;
    // The plinth the wall stands on, emitted rather than assumed. At this point
    // it is the block the flight already levelled the column to, so on the
    // ordinary path it rewrites stone with the same stone. It earns its place on
    // the path that is not ordinary: `streetscape.ts` runs *after* this pass and
    // re-levels the sidewalk band to its street's centre line, and where a bend
    // puts a parapet column into that band by one column the ground would go out
    // from under a wall that was standing on solid tread when it was emitted.
    // A structure block is laid after the column plan is materialised, so the
    // footing survives — which is the difference between a balustrade and the
    // floating balustrade v0 refused to build.
    out.push({ x: column.x, y: top, z: column.z, stateId: plinth });
    out.push({ x: column.x, y: top + 1, z: column.z, stateId: wall });
    if (Math.sign(column.a) !== litSide) continue;
    const end = column.k === firstK || column.k === lastK;
    if (!end && column.k % lampPitchSteps !== 0) continue;
    out.push({ x: column.x, y: top + 2, z: column.z, stateId: wall });
    out.push({ x: column.x, y: top + 3, z: column.z, stateId: input.lantern });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** The unit step taken at column `k` — the last column reuses the one before. */
function stepAt(path: readonly Point2[], k: number): { readonly dx: number; readonly dz: number } {
  const a = path[Math.min(k, path.length - 2)] as Point2;
  const b = path[Math.min(k + 1, path.length - 1)] as Point2;
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  // A densified path never steps diagonally; if one ever did, keep the x axis so
  // the flight leans the same way along its whole length.
  return dx !== 0 ? { dx, dz: 0 } : { dx: 0, dz: dz === 0 ? 1 : dz };
}

/** The cardinal name of a unit step, for a stair's `facing`. */
function facingOf(dx: number, dz: number): string {
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dz > 0 ? "south" : "north";
}

