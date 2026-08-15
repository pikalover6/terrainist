/**
 * `infra.entry@0` — **the infrastructure host** (`docs/INFRA-ENTRIES-v0.md`, W0).
 *
 * Sixty-eight catalog rows are not an object at a place: they are a line over
 * ground nobody owns, a face between two levels, or a treatment of a plane
 * somebody else made. Exactly one of them was built — `curtain_wall` — by a
 * bespoke three-file pass, and the lesson of that pass is that **all three of
 * its parts generalise and none of them is the entry**: `deriveWallCourse` is a
 * route form, `sweepCourse` is the engine every client already shares, and what
 * belongs to the curtain wall alone is its cross-section and its material
 * table. So the host is one node kind, one pass, and one registry of
 * cross-sections, and adding an entry is a row in
 * `stdlib/structures/infra-entries.ts` plus a profile function.
 *
 * This file is the pass. Two halves:
 *
 * 1. **{@link resolveInfraRoute}** — the five coordinate-free route forms, each
 *    derived against the *finished placement* exactly as a wall course is. An
 *    author never writes a coordinate; they name something the compiler placed
 *    and say how far out, how far to the side, or how long a run.
 * 2. **{@link buildInfraEntries}** — the registry-to-`sweepCourse` driver, run
 *    in the wall's slot for the wall's reason (§3.8): it is the only point at
 *    which the carriageway a crossing is found against is finished.
 *
 * ## Determinism
 *
 * The route is a pure function of the finished placement: integer or
 * exact-rational arithmetic over a fixed iteration order, no RNG, no clock.
 * The one new hazard the design names is that `across` and `into` *pick a
 * bearing*, so both break ties by a stated total order — for `across` the
 * narrowest span, then the lowest `z`, then the lowest `x`; for `into` the
 * steepest outward rise, then the lowest `z`, then the lowest `x` of the far
 * end. Both orders are asserted in `test/infra-entry.test.ts`, because an
 * unstated tie-break is two runs disagreeing.
 *
 * ## Ground contract (§3.5)
 *
 * **No new `GroundSourceClass`, and no tier-A declaration pre-freeze.** An
 * entry declares `sweep.run` (rank 110, tier C) or declares nothing. A registry
 * row naming `structure.linework` is refused here rather than honoured: a
 * tier-A declarer must declare against the baseline, before the streets exist,
 * and this pass runs after them by design. Resolving that properly reopens
 * GROUND-CONTRACT §13.2 and is post-freeze work.
 *
 * Most entries write no level at all — the wall's own construction, blocks
 * through `life.ts`'s `Planter` on the ground they find. The two that *are* a
 * statement about the ground (`crash_furrow` cuts below it, `crop_circle`
 * flattens it) take {@link declareRun} / {@link stampArea}'s declaring path
 * instead: commit the levels as a `sweep.run` intent, let the resolver
 * arbitrate them against every other claim on those columns, and lay the
 * materials on the answer. Never on the level the entry asked for — that is
 * §9a.1 rule 2, and it is why a furrow crossing a plaza comes out interrupted
 * rather than cutting one in half.
 *
 * ## What W1 had to change here, and why (the design's acceptance test)
 *
 * `docs/INFRA-ENTRIES-v0.md` §3.3 states its own test: *adding an entry must
 * not cost a line of `structures/` code*. Three of W1's four entries met it
 * whole; the claim is **not** exactly true, and the four places it failed are
 * named here rather than smoothed over, because a design's own test is worth
 * something only if its failures are legible.
 *
 * 1. **Interval features were seated and then dropped.** `sweepCourse` returns
 *    them, W0's driver had nowhere to send them, and "a floodlight mast every
 *    fifth panel" is in the entry's one-line description in the catalog.
 *    {@link seatFittings} is the cheap half of §3.3's promised hand-off: a
 *    column of blocks per feature, through the same `Planter`. The prop-id
 *    hand-off to `buildProps` is still unexercised and still the right answer
 *    for anything with a footprint.
 * 2. **`gap` left the whole crossing open.** With one crossing — which is
 *    exactly what an `across` route has — "block everything but the widest
 *    gate" and "leave the road alone" are the same instruction, so a barricade
 *    was a pile of rubble on the verges either side of an untouched street.
 *    The gap is now a *doorway inside* the chosen crossing
 *    ({@link INFRA_GAP_WIDTH}), which is what §3.6's sentence means and what
 *    makes the walkability claim true.
 * 3. **A below-datum band could not be built.** {@link infraColumnOps} refused
 *    a column whose top was under the ground, so `ditch` — a band role the
 *    vocabulary already names, and the one §2's family-A note says
 *    `crash_furrow` needs — was unreachable. The declaring path above is the
 *    answer, and it is the ground contract's own machinery rather than a
 *    second way to move terrain.
 * 4. **An areal stamp was one block over a whole mask.** That builds
 *    `stump_field`; it cannot build a *figure*, and a crop circle is nothing
 *    but a figure. `InfraAreaStamp.cell` gives the registry a per-column say in
 *    centre-relative coordinates — the only geometry an entry computes for
 *    itself, and still not a world coordinate (§5).
 */

import {
  INFRA_ENTRY_GENERATOR,
  note,
  warning,
  type LoamDiagnostic,
} from "@terrainist/spec";
import type {
  InfraAreaCell,
  InfraContext,
  InfraEntryDef,
  InfraRouteForm,
  InfraSpanDef,
  InfraSweptProfile,
  MaterialTheme,
  Seed256,
} from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { GroundClaim, GroundSourceClass } from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import type { ColumnPlan } from "../terrain/columns.js";

import type { StructureBlock } from "./buildings.js";
import { Planter, buildLifeWorld, op, type LifeOp, type LifeWorld, type PlaceRule } from "./life.js";
import { index, inside, routeTo } from "./roads.js";
import type { SweptProfile } from "./sweep.js";
import {
  deriveWallCourse,
  findGates,
  inGate,
  walkEdge,
  type CoursePoint,
  type WallGate,
} from "./wall-course.js";
import { normalAt, sweepCourse, type SweptColumn } from "./wall-sweep-seam.js";

/* -------------------------------------------------------------------------- */
/* the pinned-type adapters                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The registry's restated profile, as the engine's own type.
 *
 * One line, and it is the whole reason the restatement in `stdlib` is safe: if
 * the two declarations ever drift — a band role added to the engine and not to
 * the registry, a `follow` mode renamed — **this assignment stops compiling**,
 * in the one package that can see both. A runtime check could not do that, and
 * a comment asking people to keep two files in step has never worked.
 */
export function asSweptProfile(profile: InfraSweptProfile): SweptProfile {
  return profile;
}

/** The same pin for the registry's ground class (§3.5's three legal values). */
export function asGroundSourceClass(
  cls: NonNullable<InfraEntryDef["sourceClass"]>,
): GroundSourceClass {
  return cls;
}

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Courses of footing one entry column will sink to reach the ground. */
export const INFRA_MAX_FILL = 12;

/** Columns a `ring` stands outside its anchor when the node says nothing. */
export const INFRA_DEFAULT_MARGIN = 8;

/** Columns an `along` run stands to the side when the node says nothing. */
export const INFRA_DEFAULT_OFFSET = 2;

/** Columns an `into` run is long when the node says nothing. */
export const INFRA_DEFAULT_RUN = 32;

/** Columns an `across` chord over-runs its crossing on each side. */
export const INFRA_ACROSS_FLANK = 4;

/** How far a span probe will walk before calling the crossing unbounded. */
export const INFRA_SPAN_LIMIT = 96;

/** A generous ceiling on recipes, in the shape `WALL_BUDGET` has. */
export const INFRA_BUDGET = 60_000;

/**
 * The share of a resolved route that may be lost before `LOAM-T234` fires.
 *
 * A fence loses columns to collisions and to unbuildable ground, and a few is
 * normal — the course is derived, not negotiated. Past a third of the run the
 * author is looking at a fence full of holes and would rather read it than walk
 * into it.
 */
export const INFRA_REFUSAL_FRACTION = 1 / 3;

/**
 * The entry's own place rule — the wall's, verbatim.
 *
 * `requireFreeColumn` is on and stays on: it is the construction that makes
 * `infra.wall@0` physics-lint-clean without a second opinion about occupancy,
 * and a column the entry cannot claim in full is skipped whole (the
 * `SweptProfile` contract's rule 7, which is also the life pass's rule).
 */
const INFRA_RULE: PlaceRule = { requireFreeColumn: true, requireEmptyVoxel: true };

/** The rule an entry crossing a carriageway on purpose (`block`) writes under. */
const INFRA_CROSSING_RULE: PlaceRule = {
  requireFreeColumn: true,
  requireEmptyVoxel: true,
  onCarriageway: true,
};

/**
 * The rule a **declaring** entry writes under.
 *
 * `requireEmptyVoxel` is off because the whole job is to re-materialise the top
 * course of a column the resolver already decided — the same disposition an
 * areal treatment has always had, for the same reason. `requireFreeColumn`
 * stays **on**: a scar may cut the ground and may not cut a building, and the
 * column rule is what says so without this pass having to know what a building
 * is.
 */
const INFRA_DECLARED_RULE: PlaceRule = {
  requireFreeColumn: true,
  requireEmptyVoxel: false,
  onCarriageway: true,
};

/**
 * Columns of doorway a `gap` leaves in the crossing it chose (§3.6).
 *
 * Three, so a cart gets through and so the opening survives a column lost to a
 * collision at either edge. Odd, because the doorway is centred on the
 * crossing's own centre index and an even width would have to break a tie
 * nobody has stated.
 */
export const INFRA_GAP_WIDTH = 3;

/* -------------------------------------------------------------------------- */
/* the route forms                                                             */
/* -------------------------------------------------------------------------- */

/** A route, as the node wrote it and the validator accepted it. */
export interface InfraRouteSpec {
  readonly form: InfraRouteForm;
  /**
   * The node id the form names. Never a coordinate — §5.
   *
   * For `between`, which names two, this carries the *pair* as `"a → b"` so
   * every diagnostic in this file can go on saying "the route names …" without
   * a second code path; {@link targets} is what the resolver reads.
   */
  readonly target: string;
  /** The two anchors a `between` route is strung between, in the node's order. */
  readonly targets?: readonly [string, string];
  readonly margin?: number;
  readonly offset?: number;
  readonly side?: "left" | "right";
  readonly run?: number;
}

/** A resolved line: the columns, and whether it closes. */
export interface InfraCourse {
  readonly path: readonly CoursePoint[];
  readonly closed: boolean;
  /** Path indices that are corners of the true line, for `at: "bend"`. */
  readonly bends: readonly number[];
}

/** What {@link resolveInfraRoute} decided. */
export type InfraResolution =
  | { readonly kind: "route"; readonly course: InfraCourse }
  | { readonly kind: "area"; readonly columns: readonly CoursePoint[] }
  /** The anchor is absent, unplaced, or not linear — `LOAM-T233`. */
  | { readonly kind: "unanchored"; readonly detail: string }
  /** The derivation ran and produced nothing usable — `LOAM-T232`. */
  | { readonly kind: "empty"; readonly detail: string };

/** A world region, in the shape every pass here states it. */
export interface InfraBounds {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
}

/**
 * The finished placement, as the resolver needs to see it.
 *
 * Deliberately four small questions rather than the whole structure pass: the
 * resolver is pure geometry over *names the compiler placed*, and a view this
 * narrow is what makes each route form unit-testable without a compile. The
 * driver in `structures/index.ts` fills it from the road network, the street
 * surface, the farm holdings and the placement table.
 */
export interface InfraPlacementView {
  readonly bounds: InfraBounds;
  /**
   * The corner columns of what a named node actually built — the same extent a
   * wall course is derived from, so `ring` is `deriveWallCourse` verbatim.
   */
  readonly extentOf: (id: string) => readonly CoursePoint[] | undefined;
  /** A named corridor's own polyline: a road route, an arterial, a shore. */
  readonly corridorOf: (id: string) => readonly CoursePoint[] | undefined;
  /** A named node's published column mask — `parcelMask` for a farm. */
  readonly maskOf: (id: string) => Uint8Array | undefined;
  /** Stand height, or `undefined` where nothing may be built. */
  readonly ground: (x: number, z: number) => number | undefined;
  /** True on a carriageway column. */
  readonly onRoad: (x: number, z: number) => boolean;
}

/** True when a column is inside the resolver's bounds. */
function withinBounds(b: InfraBounds, x: number, z: number): boolean {
  return x >= b.x0 && z >= b.z0 && x < b.x0 + b.width && z < b.z0 + b.depth;
}

/**
 * The longest in-bounds run of a path, first-wins on ties.
 *
 * Clamped rather than refused, which is the wall's disposition of 2026-08-11
 * one scale down: a line that leaves the region is trimmed to the part that can
 * be built, and a line with nothing left is `empty` and says so. First-wins on
 * a tie so the answer does not depend on which end the scan started from.
 */
export function clampToBounds(
  path: readonly CoursePoint[],
  bounds: InfraBounds,
): readonly CoursePoint[] {
  let best: CoursePoint[] = [];
  let run: CoursePoint[] = [];
  for (const c of path) {
    if (withinBounds(bounds, c.x, c.z)) {
      run.push(c);
      continue;
    }
    if (run.length > best.length) best = run;
    run = [];
  }
  if (run.length > best.length) best = run;
  return best;
}

/** Rasterize a vertex list 4-connected, the way a wall course is rasterized. */
export function rasterize(vertices: readonly CoursePoint[]): CoursePoint[] {
  const out: CoursePoint[] = [];
  const push = (c: CoursePoint): void => {
    const last = out[out.length - 1];
    if (last !== undefined && last.x === c.x && last.z === c.z) return;
    out.push(c);
  };
  for (let i = 0; i + 1 < vertices.length; i++) {
    for (const c of walkEdge(vertices[i] as CoursePoint, vertices[i + 1] as CoursePoint)) push(c);
  }
  const last = vertices[vertices.length - 1];
  if (last !== undefined) push(last);
  return out;
}

/** What a route form may be told about the entry asking for it. */
export interface InfraRouteOptions {
  /**
   * Blocks of rise or fall a `between` corridor may take in one step — the
   * entry's own grade cap (§3.2).
   *
   * The only thing any route form has ever needed to know about its client, and
   * it is optional so every other form's call site is unchanged.
   */
  readonly gradeCap?: number;
}

/** The grade cap a `between` route uses when the entry states none. */
export const INFRA_DEFAULT_GRADE_CAP = 2;

/** Resolve one route against the finished placement. */
export function resolveInfraRoute(
  spec: InfraRouteSpec,
  view: InfraPlacementView,
  options: InfraRouteOptions = {},
): InfraResolution {
  switch (spec.form) {
    case "ring":
      return resolveRing(spec, view);
    case "along":
      return resolveAlong(spec, view);
    case "across":
      return resolveAcross(spec, view);
    case "between":
      return resolveBetween(spec, view, options.gradeCap ?? INFRA_DEFAULT_GRADE_CAP);
    case "into":
      return resolveInto(spec, view);
    case "over":
      return resolveOver(spec, view);
    default:
      // No form left. Kept as a stated answer rather than a fall-through, for
      // the next form the design names before the host resolves it.
      return {
        kind: "unanchored",
        detail: `the "${String(spec.form)}" route form is not one this host resolves`,
      };
  }
}

/**
 * `between` — the road router's own cost field, between two placed anchors,
 * at the entry's grade cap (§3.2, landed 2026-08-15).
 *
 * The other five forms derive a line from *one* thing's geometry. This one
 * cannot: what two anchors have between them is not a shape, it is a question
 * — *is there a way from here to there that this entry could stand on?* — and
 * the compiler already has the machine that answers it. `routeTo` is the road
 * network's A\*, and the whole of the threading is that it is called with a
 * **one-cell road mask**: the seed set it relaxes from is anchor A alone, and
 * its goal is anchor B. It then returns the cheapest corridor under the road
 * network's own costs — base, diagonal, slope, turn — which is what makes an
 * aqueduct or a pole line follow the same valleys the lanes do instead of a
 * ruled line through a hill.
 *
 * The **grade cap is a veto inside that search**, not a post-filter: a corridor
 * that is only cheap because it climbs a cliff once is not a cheap corridor
 * with one bad step in it, it is not a corridor. `roads.ts`'s `maxDrop` option
 * is that veto and was added here for this.
 *
 * ## What it does not do
 *
 * No water mask is passed, so water is neither charged nor forbidden. That is
 * the right disposition for the two clients that exist — a chain across a
 * harbour mouth *wants* the water, and the span's blocks are in the air — and
 * it is the thing to revisit when `aqueduct` lands, because an aqueduct that
 * routed straight over a channel would be asking for piers nobody built.
 *
 * ## Orientation
 *
 * The returned path runs from the **first** anchor the node named to the
 * second. `routeTo` reconstructs backwards from its goal, so the reversal here
 * is not cosmetic: an interval feature's phase is locked to the path's start,
 * and a run whose start depended on which end A\* happened to pop would seat
 * its pylons differently on two compiles of the same document.
 */
function resolveBetween(
  spec: InfraRouteSpec,
  view: InfraPlacementView,
  gradeCap: number,
): InfraResolution {
  const targets = spec.targets;
  if (targets === undefined) {
    return {
      kind: "unanchored",
      detail: 'a "between" route names two anchors and this one carries none',
    };
  }
  const [nameA, nameB] = targets;
  const a = anchorOf(nameA, view);
  const b = anchorOf(nameB, view);
  if (a === undefined || b === undefined) {
    const missing = a === undefined ? nameA : nameB;
    return {
      kind: "unanchored",
      detail: `"${missing}" named nothing the compiler placed, so there is no anchor at that end of the run`,
    };
  }
  if (a.x === b.x && a.z === b.z) {
    return {
      kind: "empty",
      detail: `"${nameA}" and "${nameB}" resolved to the same column, so there is nothing between them`,
    };
  }
  // Both ends must be somewhere a thing could stand: an anchor over water or
  // off the region is an end the run could never be fixed to, and reporting
  // that is better than routing to a column and then refusing every block.
  for (const [name, c] of [
    [nameA, a],
    [nameB, b],
  ] as const) {
    if (!withinBounds(view.bounds, c.x, c.z)) {
      return { kind: "empty", detail: `"${name}" sits outside the world region` };
    }
    if (view.ground(c.x, c.z) === undefined) {
      return {
        kind: "empty",
        detail: `"${name}" resolved to a column nothing may be built on, so the run has no end to stand on`,
      };
    }
  }

  const path = betweenCorridor(a, b, view, gradeCap);
  if (path === undefined) {
    return {
      kind: "empty",
      detail: `no corridor joins "${nameA}" to "${nameB}" at a grade cap of ${gradeCap} block(s) per step`,
    };
  }
  const clamped = clampToBounds(path, view.bounds);
  if (clamped.length === 0) {
    return { kind: "empty", detail: `the corridor between "${nameA}" and "${nameB}" fell outside the world region` };
  }
  return { kind: "route", course: { path: clamped, closed: false, bends: bendsOf(clamped) } };
}

/**
 * The column a named node is anchored at.
 *
 * An extent's centroid, or a corridor's midpoint for a node whose only geometry
 * is a line. Both are *the compiler's* answer about where the thing is, which
 * is the whole of §5: the author named it and never said where it was.
 */
function anchorOf(id: string, view: InfraPlacementView): CoursePoint | undefined {
  const extent = view.extentOf(id);
  if (extent !== undefined && extent.length > 0) return centroid(extent);
  const corridor = view.corridorOf(id);
  if (corridor !== undefined && corridor.length > 0) {
    return corridor[corridor.length >> 1] as CoursePoint;
  }
  return undefined;
}

/**
 * Run the road router's cost field between two columns at a grade cap.
 *
 * The arrays are built here from the resolver's own narrow view rather than
 * borrowed from the road pass, and deliberately: the view is four questions, it
 * is what makes every form unit-testable without a compile, and a `between`
 * that could only be exercised inside a full road network would be the one
 * route form with no test of its own. `blocked` is "nothing may be built here",
 * which is exactly what `ground` returning `undefined` means.
 */
function betweenCorridor(
  a: CoursePoint,
  b: CoursePoint,
  view: InfraPlacementView,
  gradeCap: number,
): readonly CoursePoint[] | undefined {
  const { x0, z0, width, depth } = view.bounds;
  const region = { x0, z0, width, depth };
  const cells = width * depth;
  const blocked = new Uint8Array(cells);
  const ground = new Int32Array(cells);
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const g = view.ground(x0 + i, z0 + j);
      const idx = j * width + i;
      if (g === undefined) {
        blocked[idx] = 1;
        continue;
      }
      ground[idx] = g;
    }
  }
  // The one-cell seed set: A is the whole of the router's "road", so the field
  // it relaxes is the cost of getting anywhere *from A*, and B is the goal.
  const road = new Uint8Array(cells);
  road[(a.z - z0) * width + (a.x - x0)] = 1;
  blocked[(a.z - z0) * width + (a.x - x0)] = 0;
  blocked[(b.z - z0) * width + (b.x - x0)] = 0;

  const found = routeTo(region, blocked, road, { ground }, { x: b.x, z: b.z }, {
    maxDrop: Math.max(0, Math.round(gradeCap)),
  });
  if (found === null || found.length < 2) return undefined;
  // `routeTo` reconstructs from its goal backwards to the seed, so this comes
  // back B → A. Reversed, because the node named A first.
  return rasterize([...found].reverse().map((c) => ({ x: c.x, z: c.z })));
}

/** The indices at which a rasterized path changes direction — `at: "bend"`. */
export function bendsOf(path: readonly CoursePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i + 1 < path.length; i++) {
    const p = path[i - 1] as CoursePoint;
    const c = path[i] as CoursePoint;
    const n = path[i + 1] as CoursePoint;
    if (c.x - p.x !== n.x - c.x || c.z - p.z !== n.z - c.z) out.push(i);
  }
  return out;
}

/**
 * `ring` — `deriveWallCourse` verbatim, on somebody else's extent.
 *
 * The whole claim of the host in one function: a 15°-quantized support hull of
 * what the named node *actually built*, offset by the margin, rasterized
 * 4-connected. Not a second implementation of the wall's course — the same one,
 * bounds-clamping and all, which is why a cordon round a holding flattens along
 * the region edge instead of vanishing exactly as a city wall does.
 */
function resolveRing(spec: InfraRouteSpec, view: InfraPlacementView): InfraResolution {
  const extent = view.extentOf(spec.target);
  if (extent === undefined || extent.length === 0) {
    return {
      kind: "unanchored",
      detail: `"${spec.target}" named nothing the compiler placed, so there is no extent to ring`,
    };
  }
  const course = deriveWallCourse({
    extent,
    margin: spec.margin ?? INFRA_DEFAULT_MARGIN,
    bounds: view.bounds,
  });
  if (course === undefined) {
    return {
      kind: "empty",
      detail: `no ring could be derived around "${spec.target}" at margin ${spec.margin ?? INFRA_DEFAULT_MARGIN}`,
    };
  }
  return {
    kind: "route",
    course: { path: course.path, closed: true, bends: course.cornerIndices },
  };
}

/**
 * `along` — the corridor's own polyline, offset laterally.
 *
 * The `along` *constraint*'s line, reused where it is exact instead of a
 * preference. The offset is taken along the **true** normal (a windowed central
 * difference, the engine's rule 3), not off the rasterized cells: a one-column
 * difference on a 4-connected diagonal is either `(1,0)` or `(0,1)` and never
 * the direction the corridor actually runs at, and offsetting off that is the
 * two-column checker the linework engine exists to end.
 */
function resolveAlong(spec: InfraRouteSpec, view: InfraPlacementView): InfraResolution {
  const corridor = view.corridorOf(spec.target);
  if (corridor === undefined || corridor.length < 2) {
    return {
      kind: "unanchored",
      detail: `"${spec.target}" is not a corridor with a line of its own — pointing "along" at a building buys you nothing`,
    };
  }
  const offset = spec.offset ?? INFRA_DEFAULT_OFFSET;
  const sign = spec.side === "right" ? -1 : 1;
  const moved: CoursePoint[] = [];
  for (let i = 0; i < corridor.length; i++) {
    const c = corridor[i] as CoursePoint;
    const { nx, nz } = normalAt(corridor, i, false);
    moved.push({
      x: Math.round(c.x + sign * offset * nx),
      z: Math.round(c.z + sign * offset * nz),
    });
  }
  const path = clampToBounds(rasterize(moved), view.bounds);
  if (path.length === 0) {
    return { kind: "empty", detail: `the offset line beside "${spec.target}" fell outside the world region` };
  }
  return { kind: "route", course: { path, closed: false, bends: [] } };
}

/** One crossing candidate, with everything the total order reads. */
interface Chord {
  readonly index: number;
  readonly centre: CoursePoint;
  readonly nx: number;
  readonly nz: number;
  readonly back: number;
  readonly forward: number;
  readonly span: number;
}

/**
 * `across` — the perpendicular chord at the target's **narrowest** crossing.
 *
 * Narrowest, because a barricade is thrown across a street where the street is
 * a street rather than where it opens into a square, and because "narrowest" is
 * a measurement rather than a taste. The tie-break is the design's stated total
 * order — lowest span, then lowest `z`, then lowest `x` — and it is not
 * optional: without it two runs of the same document disagree about which
 * crossing got the barricade.
 */
function resolveAcross(spec: InfraRouteSpec, view: InfraPlacementView): InfraResolution {
  const corridor = view.corridorOf(spec.target);
  if (corridor === undefined || corridor.length < 2) {
    return {
      kind: "unanchored",
      detail: `"${spec.target}" is not a corridor, so there is nothing to draw a chord across`,
    };
  }
  const mask = view.maskOf(spec.target);
  const claimed = (x: number, z: number): boolean =>
    mask === undefined
      ? view.onRoad(x, z)
      : withinBounds(view.bounds, x, z) &&
        mask[(z - view.bounds.z0) * view.bounds.width + (x - view.bounds.x0)] === 1;

  let best: Chord | undefined;
  for (let i = 0; i < corridor.length; i++) {
    const c = corridor[i] as CoursePoint;
    const { nx, nz } = normalAt(corridor, i, false);
    const forward = reach(c, nx, nz, 1, claimed, view.bounds);
    const back = reach(c, nx, nz, -1, claimed, view.bounds);
    if (forward < 0 || back < 0) continue;
    const span = forward + back + 1;
    if (best === undefined || betterChord({ index: i, centre: c, nx, nz, back, forward, span }, best)) {
      best = { index: i, centre: c, nx, nz, back, forward, span };
    }
  }
  if (best === undefined) {
    return {
      kind: "empty",
      detail: `no bounded crossing of "${spec.target}" was found inside the world region`,
    };
  }
  const flank = spec.margin ?? INFRA_ACROSS_FLANK;
  const from = {
    x: Math.round(best.centre.x - (best.back + flank) * best.nx),
    z: Math.round(best.centre.z - (best.back + flank) * best.nz),
  };
  const to = {
    x: Math.round(best.centre.x + (best.forward + flank) * best.nx),
    z: Math.round(best.centre.z + (best.forward + flank) * best.nz),
  };
  const path = clampToBounds(rasterize([from, to]), view.bounds);
  if (path.length === 0) {
    return { kind: "empty", detail: `the chord across "${spec.target}" fell outside the world region` };
  }
  return { kind: "route", course: { path, closed: false, bends: [] } };
}

/** The stated total order: narrowest span, then lowest `z`, then lowest `x`. */
function betterChord(candidate: Chord, held: Chord): boolean {
  if (candidate.span !== held.span) return candidate.span < held.span;
  if (candidate.centre.z !== held.centre.z) return candidate.centre.z < held.centre.z;
  return candidate.centre.x < held.centre.x;
}

/**
 * How far the claimed mask reaches from a column along one hand of the normal.
 *
 * `-1` means it never stopped inside the region, which is not a crossing: an
 * unbounded run is a column standing *in* the thing rather than across it.
 */
function reach(
  c: CoursePoint,
  nx: number,
  nz: number,
  sign: number,
  claimed: (x: number, z: number) => boolean,
  bounds: InfraBounds,
): number {
  for (let d = 0; d <= INFRA_SPAN_LIMIT; d++) {
    const x = Math.round(c.x + sign * d * nx);
    const z = Math.round(c.z + sign * d * nz);
    if (!withinBounds(bounds, x, z)) return d === 0 ? -1 : d - 1;
    if (!claimed(x, z)) return d === 0 ? -1 : d - 1;
  }
  return -1;
}

/**
 * `into` — a run of `n` columns **ending** at the named node, drawn back along
 * the steepest outward bearing.
 *
 * Steepest outward, because the entry this form exists for is a crash furrow
 * and a furrow is a gouge something made coming *down*: the run starts high and
 * ends at the thing that stopped. The bearing is one of the course's own
 * twenty-four, so a furrow runs at the same 15° quantum every other line in
 * this compiler does, and the tie-break is stated (greatest rise, then lowest
 * `z`, then lowest `x` of the far end).
 */
function resolveInto(spec: InfraRouteSpec, view: InfraPlacementView): InfraResolution {
  const extent = view.extentOf(spec.target);
  if (extent === undefined || extent.length === 0) {
    return {
      kind: "unanchored",
      detail: `"${spec.target}" named nothing the compiler placed, so a run "into" it has no end`,
    };
  }
  const anchor = centroid(extent);
  if (!withinBounds(view.bounds, anchor.x, anchor.z)) {
    return { kind: "empty", detail: `"${spec.target}" sits outside the world region` };
  }
  const base = view.ground(anchor.x, anchor.z);
  const run = spec.run ?? INFRA_DEFAULT_RUN;
  let best: { end: CoursePoint; rise: number } | undefined;
  for (const n of COURSE_BEARINGS) {
    const end = { x: Math.round(anchor.x + run * n.nx), z: Math.round(anchor.z + run * n.nz) };
    if (!withinBounds(view.bounds, end.x, end.z)) continue;
    const g = view.ground(end.x, end.z);
    if (g === undefined || base === undefined) continue;
    const rise = g - base;
    if (best === undefined || betterBearing({ end, rise }, best)) best = { end, rise };
  }
  if (best === undefined) {
    return {
      kind: "empty",
      detail: `no ${run}-column bearing out of "${spec.target}" stays inside the world region on buildable ground`,
    };
  }
  const path = clampToBounds(rasterize([best.end, anchor]), view.bounds);
  if (path.length === 0) {
    return { kind: "empty", detail: `the run into "${spec.target}" fell outside the world region` };
  }
  return { kind: "route", course: { path, closed: false, bends: [] } };
}

/** Greatest outward rise, then lowest `z`, then lowest `x` of the far end. */
function betterBearing(
  candidate: { end: CoursePoint; rise: number },
  held: { end: CoursePoint; rise: number },
): boolean {
  if (candidate.rise !== held.rise) return candidate.rise > held.rise;
  if (candidate.end.z !== held.end.z) return candidate.end.z < held.end.z;
  return candidate.end.x < held.end.x;
}

/**
 * The twenty-four bearings, as the wall course's own normals.
 *
 * Recomputed here from the same construction rather than imported so the table
 * stays a compile-time constant of this module; `wall-course.ts` documents why
 * spelling a constant as arithmetic is legal under the determinism rule.
 */
const COURSE_BEARINGS: readonly { readonly nx: number; readonly nz: number }[] = Object.freeze(
  Array.from({ length: 24 }, (_, k) => {
    const theta = (2 * Math.PI * k) / 24;
    return {
      nx: Math.round(Math.cos(theta) * 1e6) / 1e6,
      nz: Math.round(Math.sin(theta) * 1e6) / 1e6,
    };
  }),
);

/** The rounded mean of an extent — an anchor, not a centre of mass. */
export function centroid(extent: readonly CoursePoint[]): CoursePoint {
  let sx = 0;
  let sz = 0;
  for (const c of extent) {
    sx += c.x;
    sz += c.z;
  }
  return { x: Math.round(sx / extent.length), z: Math.round(sz / extent.length) };
}

/**
 * `over` — every column of the named node's published mask.
 *
 * The one non-route form (family C). Row-major order, which is the plan's own
 * order: an areal treatment writes no level and takes no column, it
 * re-materialises the top course of ground the resolver already decided, and
 * the order it does that in has to be a fact about the region rather than about
 * the mask's provenance.
 */
function resolveOver(spec: InfraRouteSpec, view: InfraPlacementView): InfraResolution {
  const mask = view.maskOf(spec.target);
  if (mask === undefined) {
    return {
      kind: "unanchored",
      detail: `"${spec.target}" publishes no column mask, so there is no area to treat`,
    };
  }
  const { x0, z0, width, depth } = view.bounds;
  const columns: CoursePoint[] = [];
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      if (mask[j * width + i] === 1) columns.push({ x: x0 + i, z: z0 + j });
    }
  }
  if (columns.length === 0) {
    return { kind: "empty", detail: `"${spec.target}"'s published mask claims no columns` };
  }
  return { kind: "area", columns };
}

/* -------------------------------------------------------------------------- */
/* the driver                                                                  */
/* -------------------------------------------------------------------------- */

/** One `infra.entry@0` node, resolved into a job. */
export interface InfraEntryJob {
  readonly nodePath: string;
  /** The registry row, looked up once by the job builder. */
  readonly def: InfraEntryDef;
  readonly route: InfraRouteSpec;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: Seed256;
  readonly theme?: MaterialTheme;
  /**
   * `false` on an `open` entry closes it: the run crosses regardless.
   *
   * The wall's `gates` param, and the same disposition — an author who says
   * "no gates" has said something about their own fortification and the
   * compiler does not second-guess it.
   */
  readonly gates: boolean;
  /** Blocks of datum above the ground, overriding the registry's `rise`. */
  readonly height?: number;
}

/** Everything {@link buildInfraEntries} reads. */
export interface InfraEntryPassInput {
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly jobs: readonly InfraEntryJob[];
  readonly view: InfraPlacementView;
  /** Every block written so far, in emit order — the occupancy view. */
  readonly existing?: readonly StructureBlock[];
  /**
   * The pipeline's one ground driver, for the entries that declare levels
   * (`InfraEntryDef.declaresLevels` — W1's furrow and crop circle).
   *
   * Optional, and absent for every caller that is not the world pipeline: the
   * terrarium, the exhibits and the unit tests that sweep an entry on a bare
   * plan have no accumulated prefix to arbitrate against, and an entry that
   * declares without one falls back to building on the ground it finds rather
   * than failing (§3.12's disposition, which every converted pass already has).
   */
  readonly ground?: GroundDriver;
}

/** One entry, as built. */
export interface BuiltInfraEntry {
  readonly nodePath: string;
  readonly entry: string;
  readonly form: InfraRouteForm;
  /** Route columns the sweep claimed and the planter accepted. */
  readonly columns: number;
  /** Route columns refused — collision, unbuildable ground, or too deep. */
  readonly skipped: number;
  /** Openings the crossing behaviour left in the run. */
  readonly openings: number;
  /** Interval fittings seated — masts, markers, crates, debris. */
  readonly fittings: number;
  /** Columns whose level went through the ground contract, or 0. */
  readonly declared: number;
}

/** What {@link buildInfraEntries} produced. */
export interface InfraEntryPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly entries: readonly BuiltInfraEntry[];
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: Readonly<Record<string, number>>;
}

/**
 * Build every entry that asked for one.
 *
 * Total on an empty job list, which is the byte-identity claim made structural:
 * a document with no `infra.entry@0` node produces no jobs, the caller never
 * constructs the pass, and nothing about this file can reach the world.
 */
export function buildInfraEntries(input: InfraEntryPassInput): InfraEntryPassResult {
  if (input.jobs.length === 0) {
    return { blocks: [], entries: [], diagnostics: [], stats: {} };
  }
  const diagnostics: LoamDiagnostic[] = [];
  const entries: BuiltInfraEntry[] = [];
  const view = input.view;

  const world = buildLifeWorld({
    plan: input.plan,
    stack: input.stack,
    ...(input.existing === undefined ? {} : { existing: input.existing }),
  });
  const planter = new Planter(
    world,
    input.stack,
    () => false,
    // The carriageway veto is per job, not per pass: an `open` entry must not
    // write in a road and a `block` entry must. It is applied at the rule.
    () => false,
    new Set<string>(),
    INFRA_BUDGET,
  );

  for (const job of input.jobs) {
    // §3.5 / §5, defended rather than documented: a tier-A declarer would have
    // to run before the streets, and this pass runs after them so its crossings
    // are found against the finished carriageway. Both cannot be true.
    if (job.def.sourceClass === "structure.linework") {
      diagnostics.push(
        warning(
          "INFRA_ENTRY_PARAM",
          job.nodePath,
          `"${job.def.id}" declares structure.linework (ground-contract rank 25, tier A), which no pre-freeze entry may declare: a tier-A declarer must declare against the baseline, before the streets exist, and this pass runs after them so that a crossing is found against the finished carriageway`,
          "use an entry that declares sweep.run, or nothing — an arcade or a guideway is post-freeze work (docs/INFRA-ENTRIES-v0.md §3.5)",
        ),
      );
      continue;
    }

    const resolved = resolveInfraRoute(job.route, view, { gradeCap: gradeCapOf(job) });
    if (resolved.kind === "unanchored") {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_UNANCHORED",
          job.nodePath,
          `the "${job.route.form}" route names "${job.route.target}": ${resolved.detail}`,
          'name a node the compiler placed — a district, a holding, a precinct or a road — in the route form, e.g. "route": { "ring": "north_holding", "margin": 12 }',
        ),
      );
      continue;
    }
    if (resolved.kind === "empty") {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_EMPTY",
          job.nodePath,
          `the "${job.route.form}" route resolved to nothing: ${resolved.detail}`,
          "give the anchor more room, or reduce the route's margin/offset so the line stands inside the world region",
        ),
      );
      continue;
    }
    if (resolved.kind === "area") {
      entries.push(stampArea(planter, world, input, job, resolved.columns));
      continue;
    }

    const course = resolved.course;
    if (course.path.length < job.def.minRun) {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_EMPTY",
          job.nodePath,
          `the "${job.route.form}" route resolved to ${course.path.length} column(s), and "${job.def.id}" refuses anything shorter than ${job.def.minRun}`,
          "point the route at something larger, or widen its margin so the derived line is long enough to read as what it is",
        ),
      );
      continue;
    }

    // A span is not a sweep and never was: its geometry is a chord between two
    // heads rather than a cross-section carried along a datum, so it forks
    // before the sweep is ever constructed.
    if (job.def.geometry.kind === "span") {
      entries.push(buildSpan(planter, world, view, job, course));
      const built = entries[entries.length - 1] as BuiltInfraEntry;
      if (built.columns === 0) {
        diagnostics.push(
          warning(
            "INFRA_ROUTE_EMPTY",
            job.nodePath,
            `a corridor was found for "${job.def.id}" (${course.path.length} columns) and neither end could be built on`,
            "something else already owns both anchors — usually a road, a quay or a building. Name anchors with clear ground at their centres",
          ),
        );
      }
      continue;
    }

    const { openings, gates } = crossingOpenings(job, course, view);
    const profile = asSweptProfile(
      job.def.geometry.kind === "route"
        ? job.def.geometry.profile(contextOf(job))
        : // Unreachable: an area registry row resolves to an area route form.
          // Stated rather than thrown, because a registry typo must not take a
          // world down.
          { id: job.def.id, bands: [], follow: "step", maxGrade: 1, crossing: "stop" },
    );
    const swept = sweepCourse({
      profile,
      path: course.path,
      closed: course.closed,
      rise: job.height ?? job.def.rise,
      ground: (x, z) => (inside(input.plan.region, x, z) ? world.standY(x, z) : undefined),
      skip: (i) => openings.has(i),
      bends: course.bends,
    });

    // Declare → resolve → build, for the entries whose levels *are* the entry
    // (§3.5's declaring path). Before a block is laid, so that every column
    // below reads `standY` as the ground the resolver decided rather than the
    // ground this pass wished for.
    const declared =
      job.def.declaresLevels === true ? declareRun(input, world, job, swept.columns) : 0;

    // `block` and `gap` write through the carriageway on purpose — a hedgerow
    // does not open for a cart track, and a barricade's whole point is that it
    // stops one. `open` is the wall's rule: the road keeps its surface, and the
    // skip set has already taken the gate indices out of the sweep.
    const rule =
      job.def.declaresLevels === true
        ? INFRA_DECLARED_RULE
        : job.def.crossings === "open"
          ? INFRA_RULE
          : INFRA_CROSSING_RULE;
    let placed = 0;
    let skipped = 0;
    for (const column of swept.columns) {
      // The carriageway is an absolute veto for the two behaviours that leave
      // the road its surface. `open` skipped the gate indices already; this
      // catches a band column thrown sideways into a lane the skip did not
      // cover, which is the wall's `avoid` predicate said per column.
      if (job.def.crossings === "open" && view.onRoad(column.x, column.z)) {
        skipped++;
        continue;
      }
      const base = world.standY(column.x, column.z);
      if (base === undefined) {
        skipped++;
        continue;
      }
      // A declaring entry paints the top course of the ground it was given,
      // exactly as an areal treatment does: the level is already in the plan,
      // so filling up to it from below would be filling a hole this entry dug.
      const ops =
        job.def.declaresLevels === true
          ? declaredColumnOps(column)
          : infraColumnOps(column, base);
      if (ops === undefined) {
        skipped++;
        continue;
      }
      if (
        planter.place(
          "infra_entry",
          ops,
          column.x,
          base,
          column.z,
          rule,
          job.def.declaresLevels !== true,
        )
      ) {
        placed++;
      } else skipped++;
    }

    const fittings = seatFittings(planter, world, view, job, swept.features);

    entries.push({
      nodePath: job.nodePath,
      entry: job.def.id,
      form: job.route.form,
      columns: placed,
      skipped,
      openings: gates.length,
      fittings,
      declared,
    });
    if (placed === 0) {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_EMPTY",
          job.nodePath,
          `a route was derived for "${job.def.id}" (${course.path.length} columns) and not one column of it could be built`,
          "something else already owns the line — usually a road shoulder, a building or a scatter. Move the route out with a larger margin or offset",
        ),
      );
    } else if (skipped > (placed + skipped) * INFRA_REFUSAL_FRACTION) {
      diagnostics.push(
        note(
          "INFRA_RUN_REFUSED",
          job.nodePath,
          `"${job.def.id}" built ${placed} of ${placed + skipped} route columns — ${skipped} were refused by collision or unbuildable ground`,
          "no change needed if the gaps read as a worn line on a walk — otherwise move the route clear of what it is crossing with a larger margin or offset",
        ),
      );
    }
  }

  return {
    blocks: planter.blocks,
    entries,
    diagnostics,
    stats: {
      infraEntries: entries.length,
      infraEntryColumns: entries.reduce((s, e) => s + e.columns, 0),
      infraEntryColumnsSkipped: entries.reduce((s, e) => s + e.skipped, 0),
      infraEntryOpenings: entries.reduce((s, e) => s + e.openings, 0),
      infraEntryFittings: entries.reduce((s, e) => s + e.fittings, 0),
      infraEntryDeclared: entries.reduce((s, e) => s + e.declared, 0),
      infraEntryBlocks: planter.blocks.length,
    },
  };
}

/**
 * The grade cap a `between` route uses for this job — **the entry's own**,
 * which is §3.2's exact wording.
 *
 * Every geometry kind already states it: a swept profile's `maxGrade` is the
 * steepest step its cross-section may take, and a span's is how steep a line of
 * sight between two anchors may be. Reading it off the geometry rather than
 * adding a fourth field to the registry row is what keeps a route form from
 * becoming a place where an entry states the same number twice and the two
 * disagree.
 */
function gradeCapOf(job: InfraEntryJob): number {
  const geometry = job.def.geometry;
  if (geometry.kind === "route") return geometry.profile(contextOf(job)).maxGrade;
  if (geometry.kind === "span") return geometry.span(contextOf(job)).maxGrade;
  return INFRA_DEFAULT_GRADE_CAP;
}

/** The context a registry function is handed (§3.3 — `PropContext`'s shape). */
function contextOf(
  job: InfraEntryJob,
  extent?: { readonly width: number; readonly depth: number },
): InfraContext {
  return {
    ...(job.theme === undefined ? { theme: undefined } : { theme: job.theme }),
    params: job.params,
    seed: job.seed,
    // Set for an area job and for nothing else: a disc has to know how big the
    // field is, and the alternative is an author guessing at a radius the
    // compiler already knows.
    ...(extent === undefined ? {} : { extent }),
  };
}

/**
 * Which path indices the run leaves open, per the entry's crossing behaviour
 * (§3.6). **A gate is found, never placed.**
 *
 * `open` — every maximal run of route columns a carriageway claims becomes one
 * opening, widened by a jamb either side. The wall's own finder, unchanged.
 * `block` — none: the entry crosses regardless.
 * `gap` — the inversion, and a barricade's whole point: block every crossing
 * but one, chosen by a stated total order (widest span, ties to the span
 * nearest the run's own start). A barricade with no gap is a wall across a
 * street and the walkability audit will say so.
 */
export function crossingOpenings(
  job: InfraEntryJob,
  course: InfraCourse,
  view: InfraPlacementView,
): { openings: Set<number>; gates: readonly WallGate[] } {
  const openings = new Set<number>();
  if (job.def.crossings === "block" || !job.gates) return { openings, gates: [] };

  const found = findGates(course.path, view.onRoad);
  if (found.length === 0) return { openings, gates: [] };

  const chosen =
    job.def.crossings === "open"
      ? found
      : // `gap`: exactly one, and the widest — a gap you cannot get a cart
        // through is not a gap. Ties to the earliest along the run, which is a
        // stated order over an index rather than a distance.
        [
          found.reduce((held, g) =>
            g.width > held.width || (g.width === held.width && g.centre < held.centre) ? g : held,
          ),
        ];
  const n = course.path.length;
  if (job.def.crossings === "gap") {
    // **A doorway inside the crossing, not the crossing.** W0 opened the chosen
    // gate whole, which on a route with exactly one crossing — an `across`
    // chord, which is what this behaviour exists for — is indistinguishable
    // from leaving the road alone: the barricade came out as two heaps on the
    // verges and a clear street between them. §3.6's sentence is "block the
    // carriageway **but leave one opening**", and this is that sentence:
    // {@link INFRA_GAP_WIDTH} columns centred on the crossing's own centre
    // index, everything else built through.
    const half = (INFRA_GAP_WIDTH - 1) >> 1;
    for (const gate of chosen) {
      for (let d = -half; d <= half; d++) openings.add(((gate.centre + d) % n + n) % n);
    }
    return { openings, gates: chosen };
  }
  for (const gate of chosen) {
    for (let i = 0; i < n; i++) {
      if (inGate(gate, i, n)) openings.add(i);
    }
  }
  return { openings, gates: chosen };
}

/**
 * One column of entry: footing from the ground up to the band top, then the
 * band's own surface, then the cap.
 *
 * `undefined` when the footing would be deeper than {@link INFRA_MAX_FILL} or
 * the column's top is already at or below the ground — both mean the line
 * crossed something this entry has no business spanning, and both are better
 * reported as a skipped column than built. The wall's `wallColumnOps` with its
 * merlon parity taken out: a crenellation is the curtain wall's, and a registry
 * that wants one writes it into its own cap.
 */
export function infraColumnOps(column: SweptColumn, base: number): LifeOp[] | undefined {
  const height = column.top - base;
  if (height < 0 || height > INFRA_MAX_FILL) return undefined;
  const ops: LifeOp[] = [];
  for (let dy = 0; dy < height; dy++) ops.push(op(0, dy, 0, column.fill));
  ops.push(op(0, height, 0, column.surface));
  const cap = column.cap;
  if (cap !== undefined) {
    for (let c = 1; c <= cap.height; c++) ops.push(op(0, height + c, 0, cap.block));
  }
  return ops;
}

/**
 * One column of a **declaring** entry: the resolved ground's top course,
 * re-materialised, and whatever the band carries above it.
 *
 * Anchored on the column's stand height, so `dy = -1` is the topmost solid
 * block — the same anchor {@link stampArea} uses, and for the same reason. The
 * band's `level` is not read here at all: it was read by {@link declareRun},
 * committed, arbitrated, and is already in the plan. Reading it twice is how a
 * pass ends up painting at a level the resolver refused.
 */
export function declaredColumnOps(column: SweptColumn): LifeOp[] {
  const ops: LifeOp[] = [op(0, -1, 0, column.surface)];
  const cap = column.cap;
  if (cap !== undefined) {
    for (let c = 0; c < cap.height; c++) ops.push(op(0, c, 0, cap.block));
  }
  return ops;
}

/**
 * Commit a declaring run's levels to the ground contract (§3.13, §9).
 *
 * `sweep.run`, rank 110, tier C: the run outranks a field and a prop pad and
 * yields to every built thing, which is exactly the disposition a gouge across
 * a farm should have. Columns another pass has already written in are left out
 * of the claim entirely — a furrow that lowered the ground under a road would
 * leave the road hanging over it, and the honest answer is a scar that stops
 * where the town starts.
 *
 * Returns the number of columns declared; `0` when there is no driver, which is
 * every caller that is not the world pipeline.
 */
export function declareRun(
  input: InfraEntryPassInput,
  world: LifeWorld,
  job: InfraEntryJob,
  columns: readonly SweptColumn[],
): number {
  const driver = input.ground;
  if (driver === undefined) return 0;
  const region = input.plan.region;
  const claims: GroundClaim[] = [];
  const seen = new Set<number>();
  for (const c of columns) {
    if (!inside(region, c.x, c.z)) continue;
    if (world.taken(c.x, c.z)) continue;
    const idx = index(region, c.x, c.z);
    if (seen.has(idx)) continue;
    seen.add(idx);
    // The sweep's datum is a **stand** height — the first air block, because
    // that is what every entry that stands on the ground needs — and a ground
    // level is the topmost *solid* block. One block apart, and the conversion
    // belongs here rather than in the profile: a registry row says `level: -2`
    // and means two blocks into the earth, which is the only reading of it
    // anybody would defend.
    claims.push({ idx, y: c.top - 1 });
  }
  if (claims.length === 0) return 0;
  // Ascending column index: the claim list is a fact about the region, not
  // about the order the sweep happened to visit its bands in.
  claims.sort((a, b) => a.idx - b.idx);
  driver.commit([
    {
      source: `${job.nodePath}#run`,
      sourceClass: asGroundSourceClass(job.def.sourceClass ?? "sweep.run"),
      kind: "profile",
      columns: claims,
      transition: "ramp",
    },
  ]);
  return claims.length;
}

/**
 * Seat the profile's interval features as fittings — a column of blocks each.
 *
 * The features are already placed: `sweepCourse` seated them by arc length off
 * the true line, phase-locked to the path's start, so two compiles put the
 * masts in the same places. All this adds is what stands there, and it re-reads
 * the ground under each one rather than trusting the datum: a mast is off the
 * line by a column or two, and a column or two sideways on a slope is a
 * different stand height.
 */
export function seatFittings(
  planter: Planter,
  world: LifeWorld,
  view: InfraPlacementView,
  job: InfraEntryJob,
  features: readonly { readonly id: string; readonly x: number; readonly z: number }[],
): number {
  const table = job.def.fittings;
  if (table === undefined) return 0;
  let seated = 0;
  for (const feature of features) {
    const fitting = table[feature.id];
    if (fitting === undefined || fitting.stack.length === 0) continue;
    // The carriageway veto the column loop applies, applied to the furniture:
    // a floodlight mast in the middle of the gate is the gate's problem.
    if (job.def.crossings === "open" && view.onRoad(feature.x, feature.z)) continue;
    const base = world.standY(feature.x, feature.z);
    if (base === undefined) continue;
    const ops = fitting.stack.map((block, k) => op(0, k, 0, block));
    if (planter.place("infra_fitting", ops, feature.x, base, feature.z, INFRA_RULE)) seated++;
  }
  return seated;
}

/* -------------------------------------------------------------------------- */
/* the span — two towers and a hanging curve                                   */
/* -------------------------------------------------------------------------- */

/** Terms of the `cosh` series. Past this the addend is under 1e-17 for |x| ≤ 4. */
const COSH_TERMS = 20;

/** The largest argument {@link cosh} is asked for; beyond it the curve is flat. */
const COSH_LIMIT = 4;

/**
 * `cosh`, as a series in `+`, `*` and `/` alone.
 *
 * **Not `Math.cosh`.** `docs/DESIGN.md`'s determinism rule and `stdlib`'s §6.5
 * rule 6 say the same thing about the transcendental library: `Math.cosh`,
 * `Math.exp` and friends are not exactly specified by IEEE 754, so two engines
 * may return neighbouring doubles for the same input — and a world that
 * disagreed with itself by one block of chain sag between two machines would
 * break the byte-identity claim silently, for some users only. The Taylor
 * series is `+`, `*` and `/`, every one of which *is* exactly specified, so a
 * fixed term count is a bit-identical answer everywhere.
 *
 * Converges fast over the range a catenary ever asks for: the argument is
 * half-span over the catenary parameter, which for any sag a chain has is under
 * two, and it is clamped at {@link COSH_LIMIT} so a degenerate solve cannot
 * walk out of the series' comfortable range.
 */
export function cosh(x: number): number {
  const t = Math.min(Math.abs(x), COSH_LIMIT);
  const xx = t * t;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < COSH_TERMS; k++) {
    term = (term * xx) / ((2 * k - 1) * (2 * k));
    sum += term;
  }
  return sum;
}

/** Halvings the catenary solve takes. Fixed, because a tolerance is a clock. */
const CATENARY_STEPS = 64;

/**
 * The catenary parameter `a` whose curve sags `sag` blocks over a chord of
 * `span` blocks.
 *
 * The real thing, not a parabola: a hanging chain is `y = a·cosh(s/a)`, its sag
 * at mid-span is `a·(cosh(span/2a) − 1)`, and that expression is strictly
 * *decreasing* in `a` — a taut chain is a large `a` and a slack one a small
 * one. Strictly monotone means bisection, and bisection with a **fixed** step
 * count is the deterministic root-finder: a loop that stopped on a tolerance
 * would stop after a machine-dependent number of iterations at exactly the
 * inputs where the two machines disagreed.
 *
 * Sixty-four halvings of a bracket that starts at four decades takes the
 * interval below 1e-17 of its width, which is past the point where the rounded
 * block heights could differ.
 */
export function catenaryParameter(span: number, sag: number): number {
  const want = Math.max(sag, 1e-9);
  let lo = span / 10_000;
  let hi = span * 1_000;
  for (let i = 0; i < CATENARY_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const at = mid * (cosh(span / (2 * mid)) - 1);
    if (at > want) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The height of every column of a hanging span, tower head to tower head.
 *
 * Three things happen here and the order of them is the whole of the geometry:
 *
 * 1. **The curve.** The chord between the two heads, interpolated linearly,
 *    minus the catenary's own dip — which is zero at both ends and `sag·span`
 *    at mid-span. Unequal heads are handled by carrying the dip on the chord
 *    rather than by solving an asymmetric catenary, which is the standard
 *    reading and is exact when the heads are level (the case a harbour mouth
 *    actually is).
 * 2. **The floor.** Every column is lifted to `clearance` blocks above whatever
 *    stands under it, so the chain is *slung across* the water rather than
 *    lying in it — and never lifted above the chord, because a chain that rose
 *    over its own supports is not hanging.
 * 3. **The hang.** From the low point outward to each tower the heights are
 *    forced non-decreasing, by **raising**, capped at that side's head. Raising
 *    rather than lowering is what keeps step 2's clearance: a repair that
 *    lowered would put back the block in the water that step 2 just took out.
 *    Without this step a floor that lifted one column and not its neighbour
 *    would leave a chain block with nothing above it and nothing beside it,
 *    which is the one thing a hanging member may never be.
 */
export function spanHeights(
  headA: number,
  headB: number,
  span: number,
  sag: number,
  floorAt: (i: number) => number | undefined,
): number[] {
  const n = span + 1;
  if (n < 2) return [headA];
  const a = catenaryParameter(span, Math.max(0, sag) * span);
  const mid = span / 2;
  const crest = cosh(mid / a);
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const chord = headA + ((headB - headA) * i) / span;
    const dip = a * (crest - cosh((i - mid) / a));
    y.push(Math.round(chord - dip));
  }
  y[0] = headA;
  y[n - 1] = headB;

  // The floor. Interior columns only: a tower head is where it is.
  for (let i = 1; i < n - 1; i++) {
    const floor = floorAt(i);
    if (floor === undefined) continue;
    const chord = Math.round(headA + ((headB - headA) * i) / span);
    y[i] = Math.min(chord, Math.max(y[i] as number, floor));
  }

  // The hang, from the lowest column outward. Ties to the lowest index, which
  // is a stated order over an index rather than over a height.
  let low = 0;
  for (let i = 1; i < n; i++) if ((y[i] as number) < (y[low] as number)) low = i;
  for (let i = low - 1; i >= 1; i--) y[i] = Math.min(Math.max(y[i] as number, y[i + 1] as number), headA);
  for (let i = low + 1; i < n - 1; i++) {
    y[i] = Math.min(Math.max(y[i] as number, y[i - 1] as number), headB);
  }
  return y;
}

/**
 * The vertical run of member each column carries, as `[bottom, top]`.
 *
 * A hanging curve rendered one block per column is not a curve: where the
 * heights step by more than one, the two blocks touch at a corner and nothing
 * else, and a chain block whose only neighbour is diagonal is hanging from
 * nothing. So each column is filled **up to the level of the neighbour nearer
 * its tower**, which is exactly how a real chain behaves — it goes down
 * vertically and along horizontally, never diagonally — and it makes the whole
 * member one 6-connected set anchored at both heads. That connectivity is the
 * invariant `test/infra-entry.test.ts` asserts, because it is the physics claim:
 * every block hangs from the tower or from a block of chain above or beside it.
 */
export function spanRuns(y: readonly number[]): { lo: number; hi: number }[] {
  const n = y.length;
  let low = 0;
  for (let i = 1; i < n; i++) if ((y[i] as number) < (y[low] as number)) low = i;
  const runs: { lo: number; hi: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      // The heads: the tower is the block there, and the curve does not repeat it.
      runs.push({ lo: y[i] as number, hi: (y[i] as number) - 1 });
      continue;
    }
    const left = y[i - 1] as number;
    const right = y[i + 1] as number;
    const hi = i < low ? left : i > low ? right : Math.max(left, right);
    runs.push({ lo: y[i] as number, hi: Math.max(hi, y[i] as number) });
  }
  return runs;
}

/** The rule the hanging member writes under — it owns air, not a column. */
const INFRA_CABLE_RULE: PlaceRule = {
  // A span's whole point is that it crosses ground it does not own: a quay, a
  // mole, a lane, open water. Demanding a free column would delete the chain
  // over every one of them, which is the opposite of what a chain across a
  // harbour mouth is for. The voxel rule stays on — the member takes air and
  // never a block somebody else wrote — and it is what keeps the claim honest
  // without a second opinion about who owns the seabed.
  requireFreeColumn: false,
  requireEmptyVoxel: true,
  padAbove: false,
  onCarriageway: true,
};

/**
 * A **span**: two towers on the ends of a resolved corridor, and a catenary
 * hung between their heads (family E's `harbour_chain_tower`).
 *
 * The chain is strung on the **straight chord** between the two towers rather
 * than along the router's corridor, and the difference is the point: the
 * corridor is what answers *can these two anchors see each other on ground
 * something could stand on* — that is why `between` runs the cost field at all,
 * and it is what refuses a pair of moles with a headland between them — but a
 * chain hangs on the shortest line between its ends, because that is what
 * gravity does. Bending a chain round a valley would be a rope on pulleys.
 */
function buildSpan(
  planter: Planter,
  world: LifeWorld,
  view: InfraPlacementView,
  job: InfraEntryJob,
  course: InfraCourse,
): BuiltInfraEntry {
  const def: InfraSpanDef =
    job.def.geometry.kind === "span"
      ? job.def.geometry.span(contextOf(job))
      : // Unreachable: the driver dispatches on the same discriminant. Stated
        // rather than thrown, for the reason every fallback in this file is.
        { id: job.def.id, tower: [], cable: "iron_chain", sag: 0, clearance: 0, maxGrade: 1 };

  const ends = [course.path[0] as CoursePoint, course.path[course.path.length - 1] as CoursePoint];
  let placed = 0;
  let skipped = 0;

  // --- the two towers ------------------------------------------------------
  const heads: (number | undefined)[] = ends.map((c) => {
    const base = world.standY(c.x, c.z);
    if (base === undefined) return undefined;
    // The carriageway veto the route path applies, applied to the towers: a
    // chain tower planted in a lane is the lane's problem, and refusing it is
    // the same disposition every `open` entry has about the road.
    if (job.def.crossings === "open" && view.onRoad(c.x, c.z)) return undefined;
    const ops = def.tower.map((block, k) => op(0, k, 0, block));
    if (ops.length === 0) return undefined;
    if (!planter.place("infra_tower", ops, c.x, base, c.z, INFRA_RULE)) return undefined;
    return base + def.tower.length - 1;
  });
  for (const head of heads) {
    if (head === undefined) skipped++;
    else placed++;
  }

  // A span with one tower is a tower. The chain is refused whole rather than
  // left hanging off the end that did get built — "ships as a pair or not at
  // all" is the catalog's own sentence about this entry.
  const [headA, headB] = heads;
  if (headA === undefined || headB === undefined) {
    return {
      nodePath: job.nodePath,
      entry: job.def.id,
      form: job.route.form,
      columns: placed,
      skipped,
      openings: 0,
      fittings: 0,
      declared: 0,
    };
  }

  // --- the curve -----------------------------------------------------------
  const chord = rasterize([ends[0] as CoursePoint, ends[1] as CoursePoint]);
  const span = chord.length - 1;
  const y = spanHeights(headA, headB, span, def.sag, (i) => {
    const c = chord[i] as CoursePoint;
    const stand = world.standY(c.x, c.z);
    return stand === undefined ? undefined : stand + Math.max(0, def.clearance);
  });
  const runs = spanRuns(y);
  for (let i = 1; i < chord.length - 1; i++) {
    const c = chord[i] as CoursePoint;
    const run = runs[i] as { lo: number; hi: number };
    const ops: LifeOp[] = [];
    // `axis: "y"` said out loud. Every block of the member is part of a
    // vertical run by construction — the curve goes down and along, never
    // diagonally — and a chain left on its default state is the `connection.
    // stale` family of defect one block wide.
    for (let level = run.lo; level <= run.hi; level++) {
      ops.push(op(0, level - run.lo, 0, def.cable, { axis: "y" }));
    }
    if (ops.length === 0) {
      skipped++;
      continue;
    }
    // `anchorsGround` off: the member is in the air by construction, and the
    // stand-height check exists for recipes that stand on the ground.
    if (planter.place("infra_cable", ops, c.x, run.lo, c.z, INFRA_CABLE_RULE, false)) placed++;
    else skipped++;
  }

  return {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: placed,
    skipped,
    openings: 0,
    fittings: 0,
    declared: 0,
  };
}

/**
 * An areal treatment: the top course of ground it does not own (family C).
 *
 * Two shapes, and the registry row says which. **A treatment** writes no level
 * and no block above the surface — that is what a treatment *is*, and it is why
 * the class table has nothing for it to declare. **A declaring treatment** —
 * `crop_circle`, per the ratified Q2 — additionally levels its own footprint
 * through the ground contract and presses the standing crop flat, because a
 * figure that only repaints the soil reads as paint from the air and as nothing
 * from the ground.
 *
 * The accepted risk §5 names lives in the first shape: material ownership is
 * unprotected by the ground contract, so the mitigation is pass order (this
 * runs after everything that could move the ground) plus the generated-world
 * assertion that a treated column's emitted top block is the treatment's.
 */
function stampArea(
  planter: Planter,
  world: LifeWorld,
  input: InfraEntryPassInput,
  job: InfraEntryJob,
  columns: readonly CoursePoint[],
): BuiltInfraEntry {
  const stamp =
    job.def.geometry.kind === "area"
      ? job.def.geometry.stamp(contextOf(job, extentOf(columns)))
      : { id: job.def.id, surface: "dirt" };
  const depth = Math.max(0, stamp.depth ?? 0);
  const flattens = job.def.declaresLevels === true;

  // --- which columns the figure covers, and what each becomes ---------------
  // The mask says where the pass *may* write; the stamp's own geometry says
  // what the pattern is. Centre-relative, because the registry may never see a
  // world coordinate (§5), and rounded once here so every cell is measured
  // from the same origin.
  const centre = centroid(columns);
  const covered: { readonly c: CoursePoint; readonly cell: InfraAreaCell }[] = [];
  for (const c of columns) {
    const cell =
      stamp.cell === undefined
        ? ({ surface: stamp.surface } satisfies InfraAreaCell)
        : stamp.cell(c.x - centre.x, c.z - centre.z);
    if (cell === undefined) continue;
    const stand = world.standY(c.x, c.z);
    if (stand === undefined) continue;
    // A column carrying something taller than the treatment clears is not
    // wheat: it is a barn, a scarecrow's post, a tree. Skipped whole, so a
    // flattening figure never takes the top off a building.
    if (flattens && world.solidAt(c.x, stand + Math.max(0, cell.clear ?? 0), c.z)) continue;
    covered.push({ c, cell });
  }

  let declared = 0;
  if (flattens && input.ground !== undefined && covered.length > 0) {
    declared = declareFlat(input, world, job, covered.map((e) => e.c));
  }

  // --- the materials, on the ground the resolver gave ------------------------
  let placed = 0;
  let skipped = 0;
  for (const { c, cell } of covered) {
    const stand = world.standY(c.x, c.z);
    if (stand === undefined) {
      skipped++;
      continue;
    }
    const ops: LifeOp[] = [];
    if (cell.surface !== undefined) {
      for (let d = 0; d <= depth; d++) ops.push(op(0, -1 - d, 0, cell.surface));
    }
    // Pressing the crop: only where something is actually standing, so a
    // treatment over bare soil costs no blocks at all.
    for (let up = 0; up < Math.max(0, cell.clear ?? 0); up++) {
      if (!world.emptyAt(c.x, stand + up, c.z)) ops.push(op(0, up, 0, "air"));
    }
    if (ops.length === 0) continue;
    // `requireEmptyVoxel` is off and only here: the whole point of a treatment
    // is to *replace* the top course of a column somebody else decided. The
    // column rule stays on for a treatment that only paints and comes off for
    // one that flattens — flattening a field means taking down what stood in
    // it, and the tall-column test above is what keeps that honest.
    if (
      planter.place(
        "infra_area",
        ops,
        c.x,
        stand,
        c.z,
        { requireFreeColumn: !flattens, requireEmptyVoxel: false },
        false,
      )
    ) {
      placed++;
    } else skipped++;
  }
  return {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: placed,
    skipped,
    openings: 0,
    fittings: 0,
    declared,
  };
}

/**
 * Commit a flattening treatment's one level (§3.13, §9).
 *
 * **One** level, and the *median* of the ground it covers: a figure pressed
 * into a field is flat, and a median moves half the columns down and half up by
 * the least it can, which on a farm — where the parcels are already levelled
 * platforms — usually moves nothing at all. The alternatives are both worse: the
 * minimum digs a pit in sloping ground, and the maximum builds a plinth.
 */
function declareFlat(
  input: InfraEntryPassInput,
  world: LifeWorld,
  job: InfraEntryJob,
  columns: readonly CoursePoint[],
): number {
  const driver = input.ground;
  if (driver === undefined) return 0;
  const region = input.plan.region;
  const levels: number[] = [];
  const claims: GroundClaim[] = [];
  for (const c of columns) {
    if (!inside(region, c.x, c.z)) continue;
    const stand = world.standY(c.x, c.z);
    if (stand === undefined) continue;
    levels.push(stand - 1);
    claims.push({ idx: index(region, c.x, c.z), y: 0 });
  }
  if (claims.length === 0) return 0;
  levels.sort((a, b) => a - b);
  const level = levels[levels.length >> 1] as number;
  const levelled = claims.map((claim) => ({ idx: claim.idx, y: level }));
  levelled.sort((a, b) => a.idx - b.idx);
  driver.commit([
    {
      source: `${job.nodePath}#figure`,
      sourceClass: asGroundSourceClass(job.def.sourceClass ?? "sweep.run"),
      kind: "platform",
      columns: levelled,
      transition: "step",
    },
  ]);
  return levelled.length;
}

/** The bounding span of an area's columns, for the stamp's own sizing. */
function extentOf(columns: readonly CoursePoint[]): { width: number; depth: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of columns) {
    if (c.x < x0) x0 = c.x;
    if (c.x > x1) x1 = c.x;
    if (c.z < z0) z0 = c.z;
    if (c.z > z1) z1 = c.z;
  }
  return columns.length === 0 ? { width: 0, depth: 0 } : { width: x1 - x0 + 1, depth: z1 - z0 + 1 };
}

/** The generator id this pass answers to, for the caller's node walk. */
export const INFRA_ENTRY_KIND: string = INFRA_ENTRY_GENERATOR;
