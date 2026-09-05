/**
 * **`infra.entry@0`'s route geometry** — the half both halves share
 *
 * WP-G6a splits the infrastructure host **by declaration**: a row that declares
 * levels is sited in the layout stage, at its class's tier, against the solved
 * layout; a row that declares nothing stays a painter in the build half and may
 * go on reading the finished world. The two halves need one thing in common —
 * *where the line goes* — and this module is exactly that and nothing else.
 *
 * Everything here was moved **verbatim** out of `structures/infra-entry.ts`:
 * the six coordinate-free route forms and their tie-breaks, the bounds clamp,
 * the rasterizer, the crossing finder, the water proximity test, and the
 * registry-context adapters. Nothing was rewritten in the move, because a moved
 * byte is a bug in the move (§6a.7 step 1).
 *
 * **It imports neither half.** `infra-entry-declare.ts` (the declarer) and
 * `infra-entry.ts` (the dresser) both import this file; this file imports
 * neither, holds no `Planter`, writes no block, and reads no `LifeWorld`. That
 * is what makes §1.4's read law enforceable by typing rather than by discipline:
 * a route form takes an {@link InfraPlacementView}, and a view is four small
 * questions the layout stage can answer as well as the finished world can.
 */

import type {
  InfraContext,
  InfraEntryDef,
  InfraRouteForm,
  InfraSweptProfile,
  MaterialTheme,
  Seed256,
} from "@terrainist/stdlib";

import type { GroundSourceClass } from "../layout/ground-contract.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";

import { index, inside } from "./sweep.js";
import { routeTo } from "./roads.js";
import type { SweptProfile } from "./sweep.js";
import {
  deriveWallCourse,
  findGates,
  inGate,
  walkEdge,
  type CoursePoint,
  type WallGate,
} from "./wall-course.js";
import { normalAt } from "./wall-sweep-seam.js";

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

/** Columns a `ring` stands outside its anchor when the node says nothing. */
export const INFRA_DEFAULT_MARGIN = 8;

/** Columns an `along` run stands to the side when the node says nothing. */
const INFRA_DEFAULT_OFFSET = 2;

/** Columns an `into` run is long when the node says nothing. */
const INFRA_DEFAULT_RUN = 32;

/** Columns an `across` chord over-runs its crossing on each side. */
const INFRA_ACROSS_FLANK = 4;

/** How far a span probe will walk before calling the crossing unbounded. */
const INFRA_SPAN_LIMIT = 96;

/**
 * Columns of doorway a `gap` leaves in the crossing it chose (§3.6).
 *
 * Three, so a cart gets through and so the opening survives a column lost to a
 * collision at either edge. Odd, because the doorway is centred on the
 * crossing's own centre index and an even width would have to break a tie
 * nobody has stated.
 */
export const INFRA_GAP_WIDTH = 3;

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
  /**
   * For a ring, its margin: how far inward, along the bands' hand, the thing
   * it rings begins. A retaining profile reads its datum out to it and widens
   * its walk to meet it, so the face stands where the author put the line and
   * the terrace runs to the face.
   */
  readonly reach?: number;
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
const INFRA_DEFAULT_GRADE_CAP = 2;

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
function bendsOf(path: readonly CoursePoint[]): number[] {
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
  const margin = spec.margin ?? INFRA_DEFAULT_MARGIN;
  const course = deriveWallCourse({ extent, margin, bounds: view.bounds });
  if (course === undefined) {
    return {
      kind: "empty",
      detail: `no ring could be derived around "${spec.target}" at margin ${spec.margin ?? INFRA_DEFAULT_MARGIN}`,
    };
  }
  return {
    kind: "route",
    course: { path: course.path, closed: true, bends: course.cornerIndices, reach: margin },
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

/**
 * The three arrays {@link nearStandingWater} reads, and nothing else.
 *
 * §6a.1's audit row: the test "was already pure; becomes `baseline.*` by name".
 * A `ColumnPlan` satisfies this structurally and so does a `GroundBaseline`,
 * which is the whole point — the build half asks it of the plan it is standing
 * on, the declare half asks it of the baseline, and neither reads a block.
 */
export type FluidField = Pick<ColumnPlan, "region" | "fluidTop" | "fluidKind" | "seaLevel">;

/**
 * True when `(x, z)` — or any of its eight neighbours, the one-column shore
 * margin — holds standing water whose surface is above sea level.
 *
 * The test is deliberately about *impounded* water: a lake, a tarn, a
 * reservoir, the sort of body a ring course can cut in half. The open sea is
 * left to the entries that cross it, because a mole or a causeway meeting the
 * ocean at sea level is doing exactly what it was asked to.
 */
export function nearStandingWater(plan: FluidField, x: number, z: number): boolean {
  const region = plan.region;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const zz = z + dz;
      if (!inside(region, xx, zz)) continue;
      const k = index(region, xx, zz);
      if (plan.fluidKind[k] === FluidKind.NONE) continue;
      if ((plan.fluidTop[k] as number) > plan.seaLevel) return true;
    }
  }
  return false;
}

export function gradeCapOf(job: InfraEntryJob): number {
  const geometry = job.def.geometry;
  if (geometry.kind === "route") return geometry.profile(contextOf(job)).maxGrade;
  if (geometry.kind === "span") return geometry.span(contextOf(job)).maxGrade;
  return INFRA_DEFAULT_GRADE_CAP;
}

/** The context a registry function is handed (§3.3 — `PropContext`'s shape). */
export function contextOf(
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
