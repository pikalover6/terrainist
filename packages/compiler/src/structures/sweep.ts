/**
 * SweptProfile — the linework engine.
 *
 * One engine, four clients. A road, a city wall, a bridge and a public stair
 * are the same problem: **a cross-section swept along a polyline over real
 * terrain**. Before this file that problem had three separate answers to "what
 * happens on a slope" and, worse, three separate answers to "which column is
 * the kerb" — each of them a walk of the *rasterized* cells with a per-cell
 * perpendicular offset. On a diagonal that construction dithers: the offset
 * flips between two orthogonal columns from step to step, and what should be
 * one clean border course comes out a two-column checker.
 *
 * The fix, and the reason this engine exists at all, is rule 3 below: **band
 * membership is a perpendicular-distance test against the TRUE centre line**.
 * Rasterization decides only which columns are *visited*; the profile decides
 * what each one is, and it decides it from real geometry.
 *
 * See `docs/DESIGN.md` → "Upgrade push — Phase 0 contracts" → "3. SweptProfile"
 * for the pinned contract this file implements.
 */

import type { Region, Seed256 } from "@terrainist/stdlib";
import { note, warning, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { OccupancyGrid } from "../layout/types.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";
import { gradeProfile, index, inside } from "./roads.js";

/* -------------------------------------------------------------------------- */
/* the profile                                                                 */
/* -------------------------------------------------------------------------- */

export type BandRole =
  | "carriageway"
  | "verge"
  | "kerb"
  | "walkway"
  | "deck"
  | "core"
  | "parapet"
  | "footing"
  | "ditch";

/** One band of the cross-section, measured outward from the centre line. */
export interface ProfileBand {
  readonly id: string;
  readonly role: BandRole;
  /** Columns per side; with `centred`, the full width straddling the line. */
  readonly width: number;
  readonly centred?: boolean;
  /** Blocks relative to the swept datum. Negative cuts below it. */
  readonly level?: number;
  /** Palette symbol for the band's top course. */
  readonly surface: string;
  /** Fill between terrain and the band top. Defaults to `surface`. */
  readonly fill?: string;
  readonly cap?: BandCap;
}

export interface BandCap {
  /** Courses above the band top. */
  readonly height: number;
  readonly block: string;
  /** A fence/wall rail rather than a solid course. */
  readonly rail?: boolean;
}

export interface IntervalFeature {
  readonly id: string;
  /** Columns of arc length between instances. */
  readonly pitch: number;
  readonly phase?: number;
  readonly at?: "interval" | "bend" | "both";
  /** Lateral offset from the centre line. */
  readonly offset: number;
  /** A stdlib prop id or `authored:<id>`; omitted means the profile draws it. */
  readonly generator?: string;
}

export interface SweptProfile {
  readonly id: string;
  /** Innermost first. Mirrored across the centre line unless `asymmetric`. */
  readonly bands: readonly ProfileBand[];
  readonly asymmetric?: boolean;
  /** Blocks of datum change permitted per column before treads synthesize. */
  readonly maxGrade: number;
  readonly follow: "grade" | "level" | "step";
  readonly features?: readonly IntervalFeature[];
  readonly crossing: "bridge" | "causeway" | "ford" | "stop";
}

export interface SweepInput {
  readonly profile: SweptProfile;
  /** 4-connected world columns — the same shape as `StreetSegment["path"]`. */
  readonly path: readonly { readonly x: number; readonly z: number }[];
  /** Mutated exactly as the road pass mutates it. */
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  readonly seed?: Seed256;
  readonly avoid?: OccupancyGrid;
  /** Node path the diagnostics hang off. */
  readonly nodePath?: string;
}

export interface SweepFeaturePlacement {
  readonly id: string;
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
}

export interface SweepResult {
  readonly blocks: readonly StructureBlock[];
  /** 1 on every column the sweep claimed, row-major over the plan's region. */
  readonly claimed: Uint8Array;
  /** The datum actually built to, per path index. */
  readonly datum: Int32Array;
  readonly features: readonly SweepFeaturePlacement[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/* -------------------------------------------------------------------------- */
/* geometry: the true line                                                     */
/* -------------------------------------------------------------------------- */

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/** A vertex of the simplified centre line, and the path index it came from. */
export interface LineVertex extends Vec2 {
  /** Index into the *rasterized* path this vertex sits on. */
  readonly i: number;
}

/**
 * Default simplification tolerance, in blocks.
 *
 * A 4-connected rasterization of a straight diagonal is a staircase whose cells
 * sit at most `0.5` from the true diagonal, so any tolerance above a half block
 * collapses the staircase into the single segment it is a picture of. Above
 * about one block a genuine one-cell jog would start being swallowed too, which
 * is why the default sits between them rather than at either end.
 */
export const SWEEP_SIMPLIFY_TOLERANCE = 0.75;

/**
 * Douglas–Peucker over the rasterized path: recover the polyline the raster is
 * a picture of.
 *
 * This is the whole trick. The staircase `(0,0) (1,0) (1,1) (2,1) (2,2)…` is a
 * *drawing* of the line `(0,0)→(n,n)`, and every downstream question — which
 * side of the line is this column on, how far from it, how far along it —
 * has a clean answer against the line and a dithered one against the drawing.
 */
export function simplifyPath(
  path: readonly Vec2[],
  tolerance: number = SWEEP_SIMPLIFY_TOLERANCE,
): LineVertex[] {
  const n = path.length;
  if (n === 0) return [];
  if (n <= 2) return path.map((p, i) => ({ x: p.x, z: p.z, i }));

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  // Explicit stack rather than recursion: a long arterial is thousands of
  // cells, and the recursive form is the classic way to blow the stack on one.
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const span = stack.pop() as [number, number];
    const [lo, hi] = span;
    if (hi - lo < 2) continue;
    const a = path[lo] as Vec2;
    const b = path[hi] as Vec2;
    let worst = -1;
    let worstAt = -1;
    for (let k = lo + 1; k < hi; k++) {
      const d = distanceToSegment(path[k] as Vec2, a, b).distance;
      // `>` not `>=`: on a tie the earlier index wins, so the result is a pure
      // function of the input and not of the traversal order.
      if (d > worst) {
        worst = d;
        worstAt = k;
      }
    }
    if (worst > tolerance && worstAt > lo) {
      keep[worstAt] = 1;
      stack.push([lo, worstAt]);
      stack.push([worstAt, hi]);
    }
  }

  const out: LineVertex[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i] === 1) out.push({ x: (path[i] as Vec2).x, z: (path[i] as Vec2).z, i });
  }
  return out;
}

/** Closest point on segment `a→b` to `p`, with its parameter and distance. */
export function distanceToSegment(
  p: Vec2,
  a: Vec2,
  b: Vec2,
): { readonly distance: number; readonly t: number; readonly cx: number; readonly cz: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const cx = a.x + dx * t;
  const cz = a.z + dz * t;
  const ex = p.x - cx;
  const ez = p.z - cz;
  return { distance: Math.sqrt(ex * ex + ez * ez), t, cx, cz };
}

/** Where a column sits relative to the true line. */
export interface LineProjection {
  /** Signed perpendicular offset: positive along `(-dz, dx)` of the segment. */
  readonly offset: number;
  /** Unsigned perpendicular distance to the line. */
  readonly distance: number;
  /** Arc length from the start of the line to the projected point. */
  readonly arc: number;
  /**
   * The same coordinate, **unclamped** at the two ends of the line: negative
   * before the start, past the total length after the end. That is what tells
   * a column beside the run from a column beyond it, and it is the difference
   * between a swept band and a swept band with two round caps on it.
   */
  readonly along: number;
  /** Index of the segment that won. */
  readonly segment: number;
  /** Nearest index into the original rasterized path. */
  readonly index: number;
}

/**
 * Project a column onto the simplified centre line.
 *
 * Ties go to the earlier segment, which matters at a bend: the two runs both
 * claim the wedge column, the earlier one keeps it, and the sweep stays
 * idempotent per column instead of double-writing the miter.
 */
export function projectToLine(
  p: Vec2,
  line: readonly LineVertex[],
  arcs: readonly number[],
): LineProjection {
  if (line.length === 1) {
    const a = line[0] as LineVertex;
    const ex = p.x - a.x;
    const ez = p.z - a.z;
    const d = Math.sqrt(ex * ex + ez * ez);
    return { offset: ez, distance: d, arc: 0, along: 0, segment: 0, index: a.i };
  }

  let best = -1;
  let bestD = Infinity;
  let bestT = 0;
  for (let s = 0; s + 1 < line.length; s++) {
    const hit = distanceToSegment(p, line[s] as Vec2, line[s + 1] as Vec2);
    if (hit.distance < bestD - 1e-9) {
      bestD = hit.distance;
      best = s;
      bestT = hit.t;
    }
  }
  if (best < 0) best = 0;

  const a = line[best] as LineVertex;
  const b = line[best + 1] as LineVertex;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  // Perpendicular of the heading `(dx, dz)` is `(-dz, dx)`, matching the band
  // walk the road pass used before this engine existed, so an axis-aligned run
  // lands on exactly the columns it always did.
  const ux = len === 0 ? 0 : -dz / len;
  const uz = len === 0 ? 1 : dx / len;
  const offset = (p.x - a.x) * ux + (p.z - a.z) * uz;
  const arc = (arcs[best] as number) + bestT * len;
  // Unclamped tangential coordinate, so a column off the *end* of the run is
  // recognisable as such rather than folding onto the last vertex.
  const along = (arcs[best] as number) + (p.x - a.x) * (len === 0 ? 0 : dx / len) +
    (p.z - a.z) * (len === 0 ? 0 : dz / len);
  // The rasterized index the datum is read at: linear in the segment's own
  // parameter, which is exact for a straight run and near enough at a bend.
  const idx = Math.round(a.i + (b.i - a.i) * bestT);
  return { offset, distance: bestD, arc, along, segment: best, index: idx };
}

/** Cumulative arc length at each vertex of a simplified line. */
export function arcLengths(line: readonly LineVertex[]): number[] {
  const out = [0];
  for (let s = 0; s + 1 < line.length; s++) {
    const a = line[s] as Vec2;
    const b = line[s + 1] as Vec2;
    out.push((out[s] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* geometry: band membership                                                   */
/* -------------------------------------------------------------------------- */

/** One column the sweep touches, with everything the writer needs about it. */
export interface SweptColumn {
  readonly x: number;
  readonly z: number;
  /** Row-major index into the region. */
  readonly idx: number;
  /** Index into `bands` — 0 is innermost. */
  readonly band: number;
  /** True when this column is on the outermost band of its side. */
  readonly outer: boolean;
  /** Signed lateral offset in columns, rounded to the cross-section lattice. */
  readonly lane: number;
  /** Signed perpendicular offset from the true line, unrounded. */
  readonly offset: number;
  /** Nearest index into the rasterized path — where the datum is read. */
  readonly index: number;
  /** Arc length along the true line. */
  readonly arc: number;
}

/** A cross-section as the band walker wants it: a lane range per band. */
export interface LaneSpan {
  /** Inclusive lowest lane. */
  readonly lo: number;
  /** Inclusive highest lane. */
  readonly hi: number;
}

/**
 * The lane spans of a `width`-column carriageway, innermost band first.
 *
 * The lattice is the one the road pass has always used: `half = (w - 1) >> 1`
 * and lanes run `-half … w - 1 - half`, so an even width is biased to the
 * positive side exactly as before. The outer band is the pair of lanes at
 * `|lane| === max(half, w - 1 - half)` — again the pre-existing rule, kept so
 * that a straight road surfaced through this engine is byte-identical to one
 * surfaced by hand.
 */
export function carriagewaySpans(width: number): { lanes: LaneSpan; outer: number } {
  const half = (width - 1) >> 1;
  // `half === 0 ? 0 : -half` rather than `-half`, because `-0` is a different
  // value to `0` under `Object.is` and this span is compared in tests.
  return {
    lanes: { lo: half === 0 ? 0 : -half, hi: width - 1 - half },
    outer: Math.max(half, width - 1 - half),
  };
}

/**
 * Walk the columns of a swept band system.
 *
 * A column belongs to the sweep when its **perpendicular distance to the true
 * line** puts it inside the cross-section — not when some rasterized cell's
 * local perpendicular happens to land on it. On a diagonal that is the whole
 * difference between one continuous kerb course and a two-column dither.
 *
 * Columns come back in a fixed order (`z` then `x`) so that the writer's
 * last-write-wins behaviour is deterministic, and each column appears exactly
 * once: the innermost band wins a contested column, which is what makes the
 * miter at a bend fill rather than double-write.
 */
export function sweptColumns(
  region: Region,
  path: readonly Vec2[],
  lanes: LaneSpan,
  options: { readonly tolerance?: number; readonly line?: readonly LineVertex[] } = {},
): SweptColumn[] {
  if (path.length === 0) return [];
  const line = options.line ?? simplifyPath(path, options.tolerance);
  const arcs = arcLengths(line);
  const total = (arcs[arcs.length - 1] ?? 0) as number;

  const loEdge = lanes.lo - 0.5;
  const hiEdge = lanes.hi + 0.5;
  const reach = Math.ceil(Math.max(Math.abs(loEdge), Math.abs(hiEdge))) + 1;
  const outer = Math.max(Math.abs(lanes.lo), Math.abs(lanes.hi));

  // Candidate columns: the neighbourhood of the raster, deduped. Deliberately
  // not the path's bounding box — a long dog-leg's box is mostly empty, and
  // projecting thousands of far columns to reject them is pure waste.
  const seen = new Set<number>();
  const candidates: number[] = [];
  for (const cell of path) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cell.x + dx;
        const z = cell.z + dz;
        if (!inside(region, x, z)) continue;
        const idx = index(region, x, z);
        if (seen.has(idx)) continue;
        seen.add(idx);
        candidates.push(idx);
      }
    }
  }
  candidates.sort((a, b) => a - b);

  const out: SweptColumn[] = [];
  for (const idx of candidates) {
    const local = idx % region.width;
    const x = region.x0 + local;
    const z = region.z0 + (idx - local) / region.width;
    const hit = projectToLine({ x, z }, line, arcs);
    if (hit.offset < loEdge - 1e-9 || hit.offset > hiEdge + 1e-9) continue;
    // The run has two ends. A column beyond either of them is beside nothing,
    // and including it would round the sweep off with a cap the raster walk
    // this replaces never drew.
    if (hit.along < -0.5 - 1e-9 || hit.along > total + 0.5 + 1e-9) continue;
    let lane = Math.round(hit.offset);
    if (lane < lanes.lo) lane = lanes.lo;
    if (lane > lanes.hi) lane = lanes.hi;
    out.push({
      x,
      z,
      idx,
      band: Math.abs(lane),
      outer: outer > 0 && Math.abs(lane) === outer,
      lane,
      offset: hit.offset,
      index: hit.index,
      arc: hit.arc,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* geometry: continuity of a one-column course                                 */
/* -------------------------------------------------------------------------- */

/**
 * Make a one-column-wide course 4-connected, thickening **outward**.
 *
 * Rule 3 fixes *which* columns a band owns, but it cannot make a nominally
 * one-column course continuous, because on a diagonal no one-column course
 * can be. A band of unit perpendicular width along a 45° line spans about
 * 1.41 columns of lattice, so the rounding keeps exactly one column per row —
 * and a run of columns that touch only at their corners is a **sawtooth**: an
 * in-out-in-out zigzag rather than a coping line. The gorge lip of the
 * headline city's plaza is that zigzag, one block of stone edging per row,
 * alternating.
 *
 * A coping line reads as a line because it is 4-connected. So wherever a
 * course column has no orthogonal neighbour in the course but *does* have a
 * diagonal one, one of the two columns that would bridge them is recruited —
 * the one further from the line the course edges, so the course thickens into
 * the ground behind it and never eats into the surface it borders. That is
 * locally 2-wide exactly where the true line runs between columns and
 * one-wide everywhere else, so **an axis-aligned course is untouched**.
 *
 * `course` is read and written in place. `eligible` decides what may be
 * recruited (it must exclude everything on the inner side); when both bridging
 * columns are eligible, `outward` breaks the tie — larger wins, and a tie in
 * *that* falls back to region order, so the pass is independent of the order
 * the course was drawn in. Recruits are committed after the scan, so no
 * recruit can itself recruit and one call cannot cascade.
 *
 * Returns the number of columns added.
 */
export function thickenCourse(
  region: Region,
  course: Uint8Array,
  eligible: (idx: number, x: number, z: number) => boolean,
  outward: (idx: number, x: number, z: number) => number,
): number {
  const orthogonal = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const diagonal = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const;

  const added: number[] = [];
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (course[idx] !== 1) continue;
      const x = region.x0 + i;
      const z = region.z0 + j;

      let connected = false;
      for (const [dx, dz] of orthogonal) {
        if (!inside(region, x + dx, z + dz)) continue;
        if (course[index(region, x + dx, z + dz)] === 1) {
          connected = true;
          break;
        }
      }
      if (connected) continue;

      for (const [dx, dz] of diagonal) {
        if (!inside(region, x + dx, z + dz)) continue;
        if (course[index(region, x + dx, z + dz)] !== 1) continue;
        // The two columns that would bridge this corner contact.
        let bestIdx = -1;
        let bestOut = Number.NEGATIVE_INFINITY;
        for (const [bx, bz] of [
          [x + dx, z],
          [x, z + dz],
        ] as const) {
          if (!inside(region, bx, bz)) continue;
          const bidx = index(region, bx, bz);
          if (course[bidx] === 1) continue;
          if (!eligible(bidx, bx, bz)) continue;
          const score = outward(bidx, bx, bz);
          if (score > bestOut) {
            bestOut = score;
            bestIdx = bidx;
          }
        }
        if (bestIdx >= 0) added.push(bestIdx);
      }
    }
  }

  let count = 0;
  for (const idx of added) {
    if (course[idx] === 1) continue;
    course[idx] = 1;
    count++;
  }
  return count;
}

/**
 * Assign a column's lane to a band of a {@link SweptProfile}.
 *
 * Bands are innermost-first and mirrored across the line unless the profile is
 * asymmetric, in which case the band list is read as running from the negative
 * side to the positive one.
 */
export function bandOfLane(profile: SweptProfile, lane: number): number {
  if (profile.asymmetric === true) {
    let edge = profileSpan(profile).lo - 1;
    for (const [b, band] of profile.bands.entries()) {
      edge += band.width;
      if (lane <= edge) return b;
    }
    return profile.bands.length - 1;
  }
  let edge = 0;
  const d = Math.abs(lane);
  for (const [b, band] of profile.bands.entries()) {
    edge += band.centred === true ? (band.width - 1) / 2 : band.width;
    if (d <= edge) return b;
  }
  return profile.bands.length - 1;
}

/** Half the profile's total width, in columns. */
export function totalHalfWidth(profile: SweptProfile): number {
  let w = 0;
  for (const band of profile.bands) w += band.centred === true ? (band.width - 1) / 2 : band.width;
  return w;
}

/** The lane span a profile occupies. */
export function profileSpan(profile: SweptProfile): LaneSpan {
  if (profile.asymmetric === true) {
    let total = 0;
    for (const band of profile.bands) total += band.width;
    const lo = -((total - 1) >> 1);
    return { lo, hi: lo + total - 1 };
  }
  const half = Math.floor(totalHalfWidth(profile));
  return { lo: -half, hi: half };
}

/* -------------------------------------------------------------------------- */
/* terrain adaptation: treads                                                  */
/* -------------------------------------------------------------------------- */

/** Why a run refused to build. */
export type TreadRefusal = "unclimbable" | "unbuildable";

export interface TreadRun {
  /** The level each column is built to, or `null` when the run is refused. */
  readonly levels: readonly number[] | null;
  readonly refusal?: TreadRefusal;
  /** Columns whose riser is a full block — the ones that want a stair block. */
  readonly risers: readonly number[];
}

/**
 * Synthesize treads over a run of ground, the construction `dressStair` paid
 * for, generalized.
 *
 * Taken **backwards** along the path:
 *
 * ```text
 * need[k] = max(g[k] + 1, need[k + 1] − 1)
 * ```
 *
 * — each column must clear its own ground, and must be no more than one block
 * below the column above it, so the walk works in both directions. The run is
 * refused **whole** if the bottom step lands out of reach of the ground in
 * front of it, or if any column needs more fill than the cap allows: half a
 * staircase that ends in a two-block hop is worse than no staircase.
 *
 * **Slabs and stairs are decoration on top of that level, never the
 * mechanism.** Raising every column by the same half block leaves every riser
 * exactly as tall as it was and makes a two-block riser worse, not better.
 *
 * **Endpoint pins** (`pinFirst`, `pinLast`, in the same stand-level units as the
 * result) are what makes a flight *land* on the street it joins rather than on
 * whatever the raw ground under its last column happens to be
 * (`docs/COURTYARDS-AND-LEVELS-v0.md` §2.3). A street stair shares its top and
 * bottom columns with the contour streets either end, and those columns have an
 * owner; the pin is that owner's level. A pinned run is refused whole exactly as
 * an unpinned one is — and now the refusal is honest, because the endpoints it is
 * measured against are the ones that will actually be built. Passing neither pin
 * is bit-for-bit the old function.
 */
export function synthesizeTreads(
  ground: readonly number[],
  options: {
    readonly maxFill?: number;
    readonly reach?: number;
    readonly maxGrade?: number;
    /** Stand level column 0 must land on, when its landing has an owner. */
    readonly pinFirst?: number;
    /** Stand level column `n − 1` must land on, when its landing has an owner. */
    readonly pinLast?: number;
  } = {},
): TreadRun {
  const n = ground.length;
  if (n === 0) return { levels: [], risers: [] };
  const maxFill = options.maxFill ?? 8;
  const reach = options.reach ?? 1;
  const maxGrade = options.maxGrade ?? 1;
  const pinFirst = options.pinFirst;
  const pinLast = options.pinLast;

  // A pin below the column's own ground is a landing the flight would have to
  // cut into rock it does not own; refuse rather than build half of it.
  if (pinFirst !== undefined && pinFirst < (ground[0] as number) + 1) {
    return { levels: null, refusal: "unclimbable", risers: [] };
  }
  if (pinLast !== undefined && pinLast < (ground[n - 1] as number) + 1) {
    return { levels: null, refusal: "unclimbable", risers: [] };
  }

  const need = new Array<number>(n);
  need[n - 1] = pinLast ?? (ground[n - 1] as number) + 1;
  for (let k = n - 2; k >= 0; k--) {
    need[k] = Math.max((ground[k] as number) + 1, (need[k + 1] as number) - maxGrade);
  }

  // The far pin is an equality, so a run the backward pass had to lift above it
  // cannot be built between these two landings.
  if (pinFirst !== undefined) {
    if (pinFirst < (need[0] as number)) {
      return { levels: null, refusal: "unclimbable", risers: [] };
    }
    // Lifting the bottom landing to its owner's level pulls the columns after it
    // up by at most `maxGrade` each — the same 1-Lipschitz law, forwards.
    need[0] = pinFirst;
    for (let k = 1; k < n; k++) {
      need[k] = Math.max(need[k] as number, (need[k - 1] as number) - maxGrade);
    }
    if (pinLast !== undefined && (need[n - 1] as number) !== pinLast) {
      return { levels: null, refusal: "unclimbable", risers: [] };
    }
  }

  // The bottom step has to be reachable from the ground it starts on — or, when
  // the bottom landing has an owner, from that owner's level, which is the
  // measurement that is actually true once everything is built.
  const base = pinFirst ?? (ground[0] as number) + 1;
  if ((need[0] as number) - base > reach) {
    return { levels: null, refusal: "unclimbable", risers: [] };
  }
  for (let k = 0; k < n; k++) {
    if ((need[k] as number) - (ground[k] as number) > maxFill) {
      return { levels: null, refusal: "unbuildable", risers: [] };
    }
  }

  const risers: number[] = [];
  for (let k = 1; k < n; k++) {
    if ((need[k] as number) !== (need[k - 1] as number)) risers.push(k);
  }
  return { levels: need, risers };
}

/* -------------------------------------------------------------------------- */
/* terrain adaptation: the datum                                               */
/* -------------------------------------------------------------------------- */

/**
 * The datum the sweep builds to, per rasterized path index.
 *
 * `"grade"` is the existing 1-Lipschitz {@link gradeProfile} — one
 * implementation, not a second. `"level"` holds a single datum: a wall walk on
 * a flat crown. `"step"` changes by at most `maxGrade` per column and holds
 * otherwise, which is what a stepped rampart does.
 */
export function sweepDatum(
  ground: readonly number[],
  follow: SweptProfile["follow"],
  maxGrade: number,
  seaLevel: number,
): number[] {
  const n = ground.length;
  if (n === 0) return [];
  if (follow === "grade") return gradeProfile(ground, seaLevel);
  if (follow === "level") {
    // The crown of a wall is one level, and it is the level that keeps the
    // most of the run above its own ground: the maximum, not the mean.
    let top = ground[0] as number;
    for (const g of ground) if (g > top) top = g;
    return new Array<number>(n).fill(top);
  }
  const out = new Array<number>(n);
  out[0] = ground[0] as number;
  for (let i = 1; i < n; i++) {
    const want = ground[i] as number;
    const prev = out[i - 1] as number;
    const delta = want - prev;
    out[i] =
      delta > maxGrade ? prev + maxGrade : delta < -maxGrade ? prev - maxGrade : Math.max(prev, want);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* interval features                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Where an interval feature lands, by **arc length along the refined line**,
 * phase-locked to the path start so a recompile gives the same tower positions.
 * `at: "bend"` snaps to the line's own vertices.
 */
export function featureStations(
  feature: IntervalFeature,
  line: readonly LineVertex[],
): { readonly arc: number; readonly bend: boolean }[] {
  const arcs = arcLengths(line);
  const total = (arcs[arcs.length - 1] ?? 0) as number;
  const mode = feature.at ?? "interval";
  const out: { arc: number; bend: boolean }[] = [];
  if (mode === "interval" || mode === "both") {
    const pitch = Math.max(1, feature.pitch);
    for (let a = feature.phase ?? 0; a <= total + 1e-9; a += pitch) out.push({ arc: a, bend: false });
  }
  if (mode === "bend" || mode === "both") {
    for (let s = 1; s + 1 < line.length; s++) out.push({ arc: arcs[s] as number, bend: true });
  }
  out.sort((a, b) => a.arc - b.arc || (a.bend ? 1 : 0) - (b.bend ? 1 : 0));
  return out;
}

/** The world point at an arc length along the line, offset laterally. */
export function pointAtArc(line: readonly LineVertex[], arc: number, offset: number): Vec2 {
  if (line.length === 0) return { x: 0, z: 0 };
  if (line.length === 1) return { x: (line[0] as Vec2).x, z: (line[0] as Vec2).z };
  const arcs = arcLengths(line);
  let s = 0;
  while (s + 2 < line.length && (arcs[s + 1] as number) < arc) s++;
  const a = line[s] as Vec2;
  const b = line[s + 1] as Vec2;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const t = len === 0 ? 0 : (arc - (arcs[s] as number)) / len;
  const dx = len === 0 ? 0 : (b.x - a.x) / len;
  const dz = len === 0 ? 0 : (b.z - a.z) / len;
  return {
    x: Math.round(a.x + (b.x - a.x) * t + -dz * offset),
    z: Math.round(a.z + (b.z - a.z) * t + dx * offset),
  };
}

/* -------------------------------------------------------------------------- */
/* crossings                                                                   */
/* -------------------------------------------------------------------------- */

/** A run of path indices whose ground is fluid or missing. */
export interface CrossingRun {
  readonly from: number;
  readonly to: number;
}

/** Find the runs of the path that need a crossing decision. */
export function findCrossings(
  region: Region,
  plan: ColumnPlan,
  path: readonly Vec2[],
): CrossingRun[] {
  const out: CrossingRun[] = [];
  let start = -1;
  for (const [i, cell] of path.entries()) {
    const wet =
      !inside(region, cell.x, cell.z) ||
      plan.fluidKind[index(region, cell.x, cell.z)] !== FluidKind.NONE;
    if (wet && start < 0) start = i;
    if (!wet && start >= 0) {
      out.push({ from: start, to: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) out.push({ from: start, to: path.length - 1 });
  return out;
}

/* -------------------------------------------------------------------------- */
/* the sweep                                                                   */
/* -------------------------------------------------------------------------- */

/** Blocks of fill a band may sink before the sweep gives up on the column. */
const SWEEP_MAX_FILL = 12;

/**
 * Sweep a profile along a path.
 *
 * Bands below or at the datum are written into the **column plan** — the same
 * mutation the road pass makes, so the heightmap, the fluid validator and the
 * biome pass all keep looking at the ground the player will walk on. Caps and
 * features are emitted as structure blocks above it.
 *
 * **Occupancy is all-or-nothing per column**: a column the sweep cannot claim
 * in full is skipped whole, the same rule the life pass uses.
 */
export function sweep(input: SweepInput): SweepResult {
  const { profile, plan, palette, stack } = input;
  const region = plan.region;
  const nodePath = input.nodePath ?? profile.id;
  const cells = region.width * region.depth;
  const claimed = new Uint8Array(cells);
  const blocks: StructureBlock[] = [];
  const features: SweepFeaturePlacement[] = [];
  const diagnostics: LoamDiagnostic[] = [];

  const path = input.path.filter((c) => inside(region, c.x, c.z));
  if (path.length === 0) {
    return { blocks, claimed, datum: new Int32Array(0), features, diagnostics };
  }

  const line = simplifyPath(path);
  const ground = path.map((c) => plan.ground[index(region, c.x, c.z)] as number);
  const level = sweepDatum(ground, profile.follow, Math.max(1, profile.maxGrade), plan.seaLevel);

  // Where the datum climbs faster than a player can walk, treads take over the
  // run. Refusal is whole-run by construction — see `synthesizeTreads`.
  let steep = false;
  for (let i = 1; i < level.length; i++) {
    if (Math.abs((level[i] as number) - (level[i - 1] as number)) > profile.maxGrade) steep = true;
  }
  if (steep) {
    const treads = synthesizeTreads(ground, {
      maxFill: SWEEP_MAX_FILL,
      maxGrade: Math.max(1, profile.maxGrade),
    });
    if (treads.levels === null) {
      diagnostics.push(
        warning(
          "SWEEP_RUN_REFUSED",
          nodePath,
          `swept run '${profile.id}' refused whole: ${treads.refusal ?? "unbuildable"}`,
          "Route the run across gentler ground, or raise the profile's maxGrade.",
        ),
      );
      return { blocks, claimed, datum: Int32Array.from(level), features, diagnostics };
    }
    for (const [i, v] of treads.levels.entries()) level[i] = v;
  }

  const crossings = findCrossings(region, plan, path);
  const spanned = new Uint8Array(path.length);
  for (const run of crossings) {
    if (profile.crossing === "stop") {
      diagnostics.push(
        warning(
          "SWEEP_CROSSING_UNSPANNED",
          nodePath,
          `swept run '${profile.id}' stops at a crossing of ${run.to - run.from + 1} columns`,
          "Give the profile crossing: \"bridge\" or \"causeway\", or route around the water.",
        ),
      );
    }
    for (let i = run.from; i <= run.to; i++) {
      // A bridge deck leaves the water it spans undisturbed; a causeway fills;
      // a ford drops the datum to the waterline and paves.
      if (profile.crossing === "bridge") spanned[i] = 1;
      else if (profile.crossing === "stop") spanned[i] = 2;
      else if (profile.crossing === "ford") {
        const k = index(region, (path[i] as Vec2).x, (path[i] as Vec2).z);
        level[i] = Math.max(plan.seaLevel, plan.fluidTop[k] as number);
      }
    }
  }

  const span = profileSpan(profile);
  const columns = sweptColumns(region, path, span, { line });

  const stateOf = (symbol: string, x: number, z: number): number => {
    if (palette.has(symbol)) return palette.stateAt(symbol, x, z);
    return stack.blockByName(symbol.replace(/^minecraft:/, ""))?.stateId ?? 0;
  };

  let skipped = 0;
  for (const col of columns) {
    const band = profile.bands[bandOfLane(profile, col.lane)] as ProfileBand;
    const i = Math.min(path.length - 1, Math.max(0, col.index));
    if (spanned[i] === 2) continue;
    if (spanned[i] === 1) {
      // On a bridged column the plan is untouched: rewriting it would fill the
      // channel and move `fluidTop` under a river the validator has settled.
      claimed[col.idx] = 1;
      continue;
    }
    if (input.avoid !== undefined && input.avoid.mask[col.idx] === 1) {
      skipped++;
      continue;
    }
    const top = (level[i] as number) + (band.level ?? 0);
    plan.ground[col.idx] = top;
    plan.fluidTop[col.idx] = top;
    plan.snow[col.idx] = 0;
    plan.surface[col.idx] = stateOf(band.surface, col.x, col.z);
    plan.subsurface[col.idx] = stateOf(band.fill ?? band.surface, col.x, col.z);
    if (plan.soil[col.idx] === 0) plan.soil[col.idx] = 1;
    claimed[col.idx] = 1;
    if (input.avoid !== undefined) input.avoid.mask[col.idx] = 1;

    if (band.cap !== undefined) {
      const state = stateOf(band.cap.block, col.x, col.z);
      for (let h = 1; h <= band.cap.height; h++) {
        blocks.push({ x: col.x, y: top + h, z: col.z, stateId: state });
        if (band.cap.rail === true) break;
      }
    }
  }
  if (skipped > 0) {
    diagnostics.push(
      warning(
        "SWEEP_COLUMNS_SKIPPED",
        nodePath,
        `swept run '${profile.id}' skipped ${skipped} occupied column(s)`,
        "Move the conflicting node, or route the sweep clear of it.",
      ),
    );
  }

  for (const feature of profile.features ?? []) {
    for (const station of featureStations(feature, line)) {
      const at = pointAtArc(line, station.arc, feature.offset);
      if (!inside(region, at.x, at.z)) continue;
      const k = index(region, at.x, at.z);
      features.push({ id: feature.id, at: { x: at.x, y: (plan.ground[k] as number) + 1, z: at.z } });
    }
  }
  if (features.length > 0) {
    diagnostics.push(
      note(
        "SWEEP_FEATURES_PLACED",
        nodePath,
        `swept run '${profile.id}' placed ${features.length} interval feature(s)`,
        "No action needed.",
      ),
    );
  }

  return { blocks, claimed, datum: Int32Array.from(level), features, diagnostics };
}
