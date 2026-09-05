/**
 * The contour toolkit: blurring a height field, finding the long paths of a
 * lattice contour, walking across a slope, and joining a skeleton up.
 *
 * **Every body here was moved out of `forms/terraced.ts` unchanged**, which is
 * the extraction (WP-1) asks for, brought forward so
 * that `hillside` imports the construction rather than copying it. Two forms
 * with two copies of `doubleSweep` is exactly the "same contour derived twice"
 * defect that document spends a section on.
 *
 * The one thing that is *new* is the {@link Adjacency} parameter. `terraced`
 * groups its bench boundary 4-connected and every default here is that, so its
 * output is byte-for-byte what it was; `hillside` needs 8-connected grouping for
 * a contour **band** — a contour on a lattice is a
 * staircase, the third-time-learned lesson `levelSeams` already records), and it
 * asks for it explicitly.
 */

import type { Point2, Rect } from "../frames.js";
import type { StreetSegment } from "../streets.js";

import { MIN_CLIPPED_RUN, STREET_WIDTH, densify4 } from "./axial.js";

/* -------------------------------------------------------------------------- */
/* adjacency                                                                   */
/* -------------------------------------------------------------------------- */

/** Steps a walk may take, in the fixed order it takes them. */
export type Adjacency = readonly (readonly [number, number])[];

/** The four steps, in a fixed order: −z, −x, +x, +z. `terraced`'s, unchanged. */
const ORTHOGONAL: Adjacency = Object.freeze([
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const);

/** The eight steps, row-major. What a contour *band* has to be grouped by. */
export const DIAGONAL: Adjacency = Object.freeze([
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const);

/* -------------------------------------------------------------------------- */
/* the field                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A separable box blur, `passes` times, clamped at the edge.
 *
 * Integer window, no transcendentals, no RNG: the same field in gives the same
 * field out on every runtime, which is the determinism law stated in code.
 */
export function boxBlur(
  field: Float64Array,
  width: number,
  depth: number,
  radius: number,
  passes: number,
): Float64Array {
  let current = Float64Array.from(field);
  for (let pass = 0; pass < passes; pass++) {
    const rows = new Float64Array(current.length);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) {
          const ii = Math.min(width - 1, Math.max(0, i + d));
          sum += current[j * width + ii] as number;
        }
        rows[j * width + i] = sum / (2 * radius + 1);
      }
    }
    const both = new Float64Array(current.length);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) {
          const jj = Math.min(depth - 1, Math.max(0, j + d));
          sum += rows[jj * width + i] as number;
        }
        both[j * width + i] = sum / (2 * radius + 1);
      }
    }
    current = both;
  }
  return current;
}

/**
 * The `rings`-deep band around a mask, excluding the mask itself.
 *
 * **The one dilation in the compiler**, and the reason it lives in a module a
 * form can import is : a sidewalk is not
 * `sidewalk` columns of arithmetic offset from the centre line, it is a
 * *dilation of the carriageway raster*, and a ring walk reaches a full column
 * further on a diagonal than any width arithmetic says it does. A planner that
 * stands its platform under the arithmetic band leaves the outermost verge
 * column off the platform, which is precisely the `offPlatform` `walkBack`
 * reports four passes later. `layout/district.ts`'s `dilate` delegates here, so
 * the planner's band and the district's sidewalk are one computation.
 *
 * 8-connected, growing one ring at a time from the previous frontier, so a
 * column is claimed at its Chebyshev distance and never twice.
 */
export function dilateMask(
  mask: Uint8Array,
  width: number,
  depth: number,
  rings: number,
): Uint8Array {
  const cells = width * depth;
  const out = new Uint8Array(cells);
  let frontier = mask;
  const claimed = new Uint8Array(mask);
  for (let ring = 0; ring < rings; ring++) {
    const next = new Uint8Array(cells);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        if (frontier[k] !== 1) continue;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
            const n = jj * width + ii;
            if (claimed[n] === 1) continue;
            claimed[n] = 1;
            next[n] = 1;
            out[n] = 1;
          }
        }
      }
    }
    frontier = next;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* components and long paths                                                   */
/* -------------------------------------------------------------------------- */

/** The neighbours of a cell index, in the adjacency's fixed order. */
function neighboursOf(
  k: number,
  width: number,
  depth: number,
  adjacency: Adjacency = ORTHOGONAL,
): number[] {
  const i = k % width;
  const j = Math.floor(k / width);
  const out: number[] = [];
  for (const [di, dj] of adjacency) {
    const ii = i + di;
    const jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
    out.push(jj * width + ii);
  }
  return out;
}

/** Connected components of a mask, in row-major order of their first cell. */
export function componentsOf(
  mask: Uint8Array,
  width: number,
  depth: number,
  adjacency: Adjacency = ORTHOGONAL,
): number[][] {
  const seen = new Uint8Array(mask.length);
  const out: number[][] = [];
  for (let k = 0; k < mask.length; k++) {
    if (mask[k] !== 1 || seen[k] === 1) continue;
    const queue = [k];
    seen[k] = 1;
    const component: number[] = [];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head] as number;
      component.push(cell);
      for (const n of neighboursOf(cell, width, depth, adjacency)) {
        if (mask[n] !== 1 || seen[n] === 1) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    out.push(component);
  }
  return out;
}

/**
 * Every long path of one boundary component, not just its longest.
 *
 * **Why this is not one double sweep.** A contour on a lattice is not a curve —
 * it is a two-column band with spurs, forks and little islands, and one
 * component of it is a graph, not a path. {@link doubleSweep} answers "what is
 * the longest path through this graph", and *everything else in the component
 * is discarded*. That was survivable while every bench boundary was a street,
 * because thirty-seven components covered the quarter between them by accident.
 * Once a stride keeps one boundary in three, the surviving components are long
 * snaking things whose branches are most of their length, and the discard is the
 * whole defect: measured on `stepped_hilltown`, ten blocks held 9 792 of 13 868
 * block columns because the streets never reached them, and 45 % of block ground
 * never reached a lot.
 *
 * So: take the longest path, take it *out*, and sweep what is left, until what
 * is left is shorter than `MIN_CLIPPED_RUN`. Each path is one street. The
 * removal takes the path's columns and their neighbours out of the remainder, so
 * two streets are never drawn one column apart along the same spur.
 *
 * Deterministic: `doubleSweep` and {@link componentsOf} are both functions of
 * the cell set and its row-major order, and the loop drains largest-first with
 * ties on the lower cell index. `limit` caps the total for `intersectionsOf`,
 * which is O(n²) in segments.
 */
export function branchesOf(
  component: readonly number[],
  width: number,
  depth: number,
  limit: number,
  adjacency: Adjacency = ORTHOGONAL,
): number[][] {
  const out: number[][] = [];
  if (limit <= 0) return out;
  const remaining = new Uint8Array(width * depth);
  for (const k of component) remaining[k] = 1;
  let pool: number[][] = [[...component]];
  while (out.length < limit && pool.length > 0) {
    // Largest first, ties on the lower first cell — the same order the caller
    // keeps components in, and for the same reason.
    pool.sort((a, b) => (b.length !== a.length ? b.length - a.length : (a[0] as number) - (b[0] as number)));
    const piece = pool.shift() as number[];
    const spine = doubleSweep(piece, width, depth, adjacency);
    if (spine.length < MIN_CLIPPED_RUN) continue;
    out.push(spine);
    for (const k of spine) {
      remaining[k] = 0;
      for (const n of neighboursOf(k, width, depth, adjacency)) remaining[n] = 0;
    }
    const left = new Uint8Array(width * depth);
    for (const k of piece) if (remaining[k] === 1) left[k] = 1;
    pool.push(...componentsOf(left, width, depth, adjacency));
  }
  return out;
}

/**
 * The double sweep: the longest path of a component's BFS tree.
 *
 * The same construction the shoreline drive uses — farthest cell from a fixed
 * start, then farthest from *there*, then the tree path between the two. Ties
 * break on the lower cell index, so the answer is a function of the component
 * and nothing else.
 */
function doubleSweep(
  component: readonly number[],
  width: number,
  depth: number,
  adjacency: Adjacency = ORTHOGONAL,
): number[] {
  const cells = new Set(component);
  const first = component[0] as number;
  const a = sweep(first, cells, width, depth, adjacency).far;
  const second = sweep(a, cells, width, depth, adjacency);
  const path: number[] = [];
  let cursor = second.far;
  while (cursor !== -1) {
    path.push(cursor);
    cursor = second.parent.get(cursor) ?? -1;
  }
  return path.reverse();
}

/** One BFS over a component: the farthest cell, and the tree that found it. */
function sweep(
  start: number,
  cells: ReadonlySet<number>,
  width: number,
  depth: number,
  adjacency: Adjacency,
): { readonly far: number; readonly parent: Map<number, number> } {
  const parent = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let far = start;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] as number;
    far = cell;
    // `neighboursOf` guards the row wrap and the field edge, which is the same
    // guard the inline stencil this was moved from carried by hand.
    for (const n of neighboursOf(cell, width, depth, adjacency)) {
      if (!cells.has(n) || parent.has(n)) continue;
      parent.set(n, cell);
      queue.push(n);
    }
  }
  return { far, parent };
}

/* -------------------------------------------------------------------------- */
/* walking across the slope                                                    */
/* -------------------------------------------------------------------------- */

/** What {@link flightFrom} needs to walk across a band of benches. */
export interface FlightContext {
  readonly smooth: Float64Array;
  readonly owner: Int32Array;
  /** Bench index per column — how the walk knows it has crossed the band. */
  readonly bench: Int32Array;
  at(x: number, z: number): number;
  inside(p: Point2): boolean;
  readonly limit: number;
  /** `1` walks downhill, `−1` uphill. Everything else is the same walk. */
  readonly sign: number;
  /** Bench indices the walk must cross before the band behind it is whole. */
  readonly span: number;
  /** Keep a walk that stalled, once it has left the bench it started on. */
  readonly keepStalled: boolean;
}

/**
 * A steepest-descent (or steepest-ascent) walk across the band of benches
 * between one contour street and the next.
 *
 * 4-connected, never revisiting a column, and terminating the moment it stands
 * on a *different* contour street — which is what makes the flight a connection
 * between two benches rather than a path down the hill.
 *
 * - **Span.** A walk that has crossed `span` bench indices has crossed the whole
 *   band, and is a complete stair-alley whether or not it landed on anything.
 * - **Stall.** A walk that runs out of downhill — the quarter's edge, or the
 *   floor of the hill — is kept if it left the bench it started on. Below the
 *   lowest contour street that is the only alley the terraces there will get,
 *   and a dead-end flight down to the last terrace is what a hill town has.
 */
export function flightFrom(start: Point2, from: number, ctx: FlightContext): Point2[] | null {
  const walk: Point2[] = [start];
  const seen = new Set<number>([ctx.at(start.x, start.z)]);
  // Signed, so "downhill" and "uphill" are one walk: `sign` flips the field and
  // every comparison below reads "lower" as "further along the way we are
  // going". A second, mirrored copy of this function is how the two would
  // silently drift apart.
  const rise = (p: Point2): number => ctx.sign * (ctx.smooth[ctx.at(p.x, p.z)] as number);
  const startBench = ctx.bench[ctx.at(start.x, start.z)] as number;

  // The direction the hill falls in, read over a *wide* stencil. A narrow one is
  // useless here: the blur of a terrace is dead flat in the middle of the
  // terrace, so a one-column gradient is zero exactly where the walk spends most
  // of its length, and a walk that insists on a strictly lower neighbour stalls
  // on the flat and the bench above it never gets its stair.
  const REACH = 8;
  let heading = { x: -1, z: 0 };
  let fall = Number.POSITIVE_INFINITY;
  for (const d of STEPS) {
    const probe = { x: start.x + d.x * REACH, z: start.z + d.z * REACH };
    if (!ctx.inside(probe)) continue;
    const h = rise(probe);
    if (h < fall) {
      fall = h;
      heading = d;
    }
  }

  const crossed = (p: Point2): number => {
    const b = ctx.bench[ctx.at(p.x, p.z)] as number;
    return b < 0 || startBench < 0 ? 0 : Math.abs(b - startBench);
  };

  let cursor = start;
  for (let step = 0; step < ctx.limit; step++) {
    const here = rise(cursor);
    // Downhill first, and *never* uphill; among equals, keep going the way we
    // were going. That is what carries a flight straight across the flat of a
    // terrace and turns it down the riser at the far side, instead of wandering.
    let best: Point2 | null = null;
    let bestHeight = Number.POSITIVE_INFINITY;
    for (const d of [heading, ...STEPS]) {
      const candidate = { x: cursor.x + d.x, z: cursor.z + d.z };
      if (!ctx.inside(candidate)) continue;
      const k = ctx.at(candidate.x, candidate.z);
      if (seen.has(k)) continue;
      const h = rise(candidate);
      if (h > here || h >= bestHeight) continue;
      bestHeight = h;
      best = candidate;
      heading = d;
    }
    if (best === null) {
      return ctx.keepStalled && crossed(cursor) >= 1 ? walk : null;
    }
    cursor = best;
    seen.add(ctx.at(cursor.x, cursor.z));
    walk.push(cursor);
    const reached = ctx.owner[ctx.at(cursor.x, cursor.z)] as number;
    if (reached >= 0 && reached !== from) return walk;
    if (crossed(cursor) >= ctx.span) return walk;
  }
  return ctx.keepStalled && crossed(cursor) >= 1 ? walk : null;
}

/** The four steps, in a fixed order: −z, −x, +x, +z. */
const STEPS: readonly Point2[] = Object.freeze([
  { x: 0, z: -1 },
  { x: -1, z: 0 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
]);

/* -------------------------------------------------------------------------- */
/* connectivity                                                                */
/* -------------------------------------------------------------------------- */

/** What {@link linkComponents} needs to find its way across the quarter. */
export interface LinkContext {
  at(x: number, z: number): number;
  inside(p: Point2): boolean;
  readonly owner: Int32Array;
  pointOf(k: number): Point2;
  readonly cells: number;
  readonly width: number;
  readonly depth: number;
  readonly bounds: Rect;
}

/**
 * Join every disconnected piece of the skeleton to the main one, in place.
 *
 * A shortest walk over the quarter's own columns from the connected set to the
 * nearest orphan, laid as one more flight of steps — so the graph is connected
 * by construction rather than by hope, which is what the inter-district road
 * pass, `boundaryEndpoints` and the walking BFS in the physics lint all assume.
 */
export function linkComponents(segments: StreetSegment[], ctx: LinkContext): void {
  for (let guard = 0; guard < 16; guard++) {
    const groups = groupsOf(segments, ctx);
    if (groups.size <= 1) return;
    // The group holding the first segment is the one everything joins on to.
    const main = groups.get(segments[0] as StreetSegment) as number;

    const distance = new Int32Array(ctx.cells).fill(-1);
    const parent = new Int32Array(ctx.cells).fill(-1);
    const queue: number[] = [];
    for (const [s, segment] of segments.entries()) {
      if (groups.get(segment) !== main) continue;
      for (const p of segment.path) {
        if (!ctx.inside(p)) continue;
        const k = ctx.at(p.x, p.z);
        if ((distance[k] as number) >= 0) continue;
        distance[k] = 0;
        queue.push(k);
      }
      void s;
    }

    let landed = -1;
    for (let head = 0; head < queue.length && landed < 0; head++) {
      const cell = queue[head] as number;
      for (const n of neighboursOf(cell, ctx.width, ctx.depth)) {
        if ((distance[n] as number) >= 0) continue;
        const p = ctx.pointOf(n);
        if (!ctx.inside(p)) continue;
        distance[n] = (distance[cell] as number) + 1;
        parent[n] = cell;
        const owned = ctx.owner[n] as number;
        if (owned >= 0 && groups.get(segments[owned] as StreetSegment) !== main) {
          landed = n;
          break;
        }
        queue.push(n);
      }
    }
    if (landed < 0) return;

    const walk: Point2[] = [];
    for (let cursor = landed; cursor !== -1; cursor = parent[cursor] as number) {
      walk.push(ctx.pointOf(cursor));
    }
    walk.reverse();
    const path = densify4(walk);
    if (path.length < 2) return;
    const id = `lk${segments.length}`;
    segments.push({ id, kind: "lane", width: STREET_WIDTH.lane, path, role: "steps" });
    for (const p of path) {
      if (!ctx.inside(p)) continue;
      ctx.owner[ctx.at(p.x, p.z)] = segments.length - 1;
    }
  }
}

/**
 * Connected groups of segments, keyed by segment, valued by the index of the
 * lowest-numbered segment in the group — a union-find over shared columns.
 */
function groupsOf(
  segments: readonly StreetSegment[],
  ctx: LinkContext,
): Map<StreetSegment, number> {
  const parent = segments.map((_, s) => s);
  const find = (s: number): number => {
    let root = s;
    while ((parent[root] as number) !== root) root = parent[root] as number;
    let cursor = s;
    while ((parent[cursor] as number) !== cursor) {
      const next = parent[cursor] as number;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };

  const holder = new Int32Array(ctx.cells).fill(-1);
  for (const [s, segment] of segments.entries()) {
    for (const p of segment.path) {
      if (!ctx.inside(p)) continue;
      const k = ctx.at(p.x, p.z);
      const already = holder[k] as number;
      if (already >= 0) union(already, s);
      else holder[k] = s;
    }
  }
  // Adjacency counts too: two streets whose centre lines pass one column apart
  // share carriageway once their widths are laid, and the walking BFS agrees.
  for (let k = 0; k < ctx.cells; k++) {
    const a = holder[k] as number;
    if (a < 0) continue;
    for (const n of neighboursOf(k, ctx.width, ctx.depth)) {
      const b = holder[n] as number;
      if (b >= 0) union(a, b);
    }
  }

  const out = new Map<StreetSegment, number>();
  for (const [s, segment] of segments.entries()) out.set(segment, find(s));
  return out;
}
