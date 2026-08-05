/**
 * `terraced` — the hill decides where the streets go
 * (`docs/URBAN-FORMS-v0.md` §3.6).
 *
 * On a real slope the streets are not a plan imposed on the ground; they are the
 * two things the ground allows. A street that runs **along** a contour is level
 * and can be long. A street that runs **across** one is short and is a flight of
 * stairs. Everything else follows from that: the blocks are the benches between
 * two contour streets, and every building on a bench shares one floor level.
 *
 * The construction is four steps and one invariant:
 *
 * 1. **Benches.** `benchOf(x, z) = floor((height − base) / {@link BENCH_HEIGHT})`
 *    over a field pre-smoothed by a 5-column box blur, twice, so a one-block
 *    noise pit cannot cut a contour in half.
 * 2. **Contour streets.** The boundary set of the bench field — every column
 *    whose bench index differs from a 4-neighbour's. Each connected component
 *    becomes one polyline by the double sweep (farthest cell from a fixed
 *    start, then farthest from *there*, then the BFS-tree path between them),
 *    `densify4`'d and cut to the mask.
 * 3. **Stairs.** Every `blockSize` columns of arc along a contour street, a
 *    steepest-descent walk to the next contour street downhill, emitted with
 *    `role: "steps"` so the surfacer lays it with the tread law instead of the
 *    grader.
 * 4. **Benches as products.** Each bench's columns as maximal horizontal runs,
 *    which the caller turns into `PadEdit`s and founds its buildings on.
 *
 * **The invariant that makes this safe:** a bench boundary is always a street, a
 * lot lives inside a block and a block lives between streets — therefore no lot
 * ever spans two bench levels, therefore no building is founded across a step.
 * That is the whole reason the contour is *the street* rather than a street
 * fitted to a contour afterwards.
 *
 * `orientation` is deliberately ignored: the contours decide the street
 * direction, not the author, and {@link FormRecord.ignored} says so rather than
 * letting a silently dropped input become the next expensive defect.
 */

import type { Point2, Rect } from "../frames.js";
import { RETAIN_MAX } from "../levels.js";
import { largestRect, maskRuns } from "../masks.js";
import type { StreetSegment } from "../streets.js";

import { MIN_CLIPPED_RUN, STREET_WIDTH, densify4, intersectionsOf, runsOf } from "./axial.js";
import {
  drewAsAsked,
  type FormBench,
  type FormContext,
  type FormResult,
  type UrbanForm,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Blocks of rise per bench on ground gentle enough not to need more — one
 * storey, and the floor of the range {@link benchHeightFor} chooses from.
 *
 * One storey is the number that makes a terrace's party wall step by a whole
 * floor, so it stays the answer wherever it is *possible*: a quarter whose
 * benches are already wide enough at 4 gets 4, and every terraced world drawn
 * before this became a range is byte-identical.
 */
export const BENCH_HEIGHT = 4;

/**
 * Tallest bench, and the number `RETAIN_MAX` fixes rather than a taste.
 *
 * A bench boundary is a seam of exactly `benchHeight` blocks, and
 * `treatmentForDrop` builds a retaining wall up to `RETAIN_MAX` and *nothing at
 * all* above it — past that the two platforms are graded into each other as a
 * `bank`. A hill town whose benches were 8 blocks apart would therefore have no
 * retaining walls in it, which is the one thing the prompt for a hill town
 * always names. So the ceiling on bench height is not a separate judgement: it
 * is the tallest drop the seam machinery will still build a wall for. The two
 * numbers agree by construction, and `terraced-bench-height.test.ts` asserts
 * they cannot drift apart.
 */
export const BENCH_HEIGHT_MAX = RETAIN_MAX;

/** Half-width of the box blur applied to the height field, in columns. */
const SMOOTH_RADIUS = 2;

/** How many times the blur is applied. Fixed — a knob here would be a dial. */
const SMOOTH_PASSES = 2;

/** Most contour streets one quarter is given. `intersectionsOf` is O(n²). */
const MAX_CONTOURS = 24;

/** Shortest stair kept, in cells. Below this it is a kerb, not a flight. */
const MIN_STAIR_RUN = 4;

/**
 * Narrowest bench that can carry a street and the lots that face it.
 *
 * A contour street, a verge either side, and the shallowest lot the
 * subdivision will cut — `MIN_INFILL_SIDE` in `district.ts` is 7, so 8 is the
 * first depth that reliably yields a building rather than an infill sliver.
 * Restated here rather than imported: `district.ts` sits downstream of the
 * registry, and importing it from a form closes a module cycle. `LOT_DEPTH`
 * proper is larger; this is the floor below which the answer is certainly no,
 * not an estimate of a comfortable bench.
 */
const MIN_BENCH_WIDTH = STREET_WIDTH.lane + 2 * 2 + 8;

/* -------------------------------------------------------------------------- */
/* the form                                                                    */
/* -------------------------------------------------------------------------- */

/** The `terraced` form. */
export const TERRACED_FORM: UrbanForm = {
  id: "terraced",
  requires: {
    // A hub of streets and one block of lots on each of two benches. The relief
    // floor is the one that matters and it is the one the registry checks
    // first, so a flat quarter gets the contour sentence rather than a size one.
    minSpan: 48,
    minRelief: 2 * BENCH_HEIGHT,
    // Without this the solver's `padFor` hands this form a billiard table: a
    // district is pad-levelled *before* the fabric pass runs. `districtGroundPolicy`
    // reads exactly this flag, which is why nothing anywhere enumerates form ids.
    unlevelled: true,
    polygon: true,
    fallback: "grown",
  },
  describe:
    "A hill town: streets that run along the contours are level and long, streets that run across them are flights of stairs, and the blocks are the benches between them. Every building on a bench shares one floor level, because a bench boundary is always a street.",
  draw,
};

function draw(ctx: FormContext): FormResult {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const cells = width * depth;
  const at = (x: number, z: number): number => (z - bounds.z0) * width + (x - bounds.x0);
  const pointOf = (k: number): Point2 => ({
    x: bounds.x0 + (k % width),
    z: bounds.z0 + Math.floor(k / width),
  });
  const masked = (k: number): boolean => ctx.mask === undefined || ctx.mask[k] === 1;
  const inside = (p: Point2): boolean =>
    p.x >= bounds.x0 && p.x <= bounds.x1 && p.z >= bounds.z0 && p.z <= bounds.z1 && masked(at(p.x, p.z));

  // --- the smoothed field and the bench field ------------------------------
  // Cut at the floor of the range first: `benchHeightFor` needs the blur and
  // the datum, and nothing else, and this is the only place the field is built.
  const first = benchFieldOf(ctx);
  // §10.3, filled: how tall a bench has to be *here*. On ground gentle enough
  // for one storey this is `BENCH_HEIGHT` and `first` is already the answer, so
  // the common path cuts the field once and every gentle terraced quarter is
  // byte-identical to the one drawn before the height became a range.
  const benchHeight = first.base === Number.POSITIVE_INFINITY ? BENCH_HEIGHT : benchHeightFor(ctx, first);
  const { smooth, base, bench, present } =
    benchHeight === first.height ? first : benchFieldOf(ctx, benchHeight);
  if (base === Number.POSITIVE_INFINITY) {
    return {
      ok: false,
      reason: "no column of this quarter is inside its own cell, so there is no ground to read contours off",
      fix: "nothing to change in the document: a cell this thin is dropped and its ground is left for the ground treatment pass",
      fallback: "grown",
    };
  }

  if (present.size < 2) {
    return {
      ok: false,
      reason: `after the contour blur the ground under this quarter holds one bench of ${benchHeight} blocks, which is a grid with extra words`,
      fix: 'move the quarter onto a slope with a "zone" or "at" constraint, drop "terrain_conform" (a terraced quarter levels itself, one bench at a time), or write "fabric": "grown" for an unplanned quarter on level ground',
      fallback: "grown",
    };
  }

  // --- contour streets -----------------------------------------------------
  const boundary = new Uint8Array(cells);
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const level = bench[k] as number;
      if (level < 0) continue;
      const neighbours = [
        j > 0 ? k - width : -1,
        i > 0 ? k - 1 : -1,
        i + 1 < width ? k + 1 : -1,
        j + 1 < depth ? k + width : -1,
      ];
      for (const n of neighbours) {
        if (n < 0) continue;
        const other = bench[n] as number;
        if (other < 0) continue;
        if (other !== level) {
          boundary[k] = 1;
          break;
        }
      }
    }
  }

  const components = componentsOf(boundary, width, depth);
  // Largest first so a cap drops paving accidents rather than the ridge line;
  // re-sorted into row-major order for emission so the segment ids are stable.
  const kept = [...components]
    .sort((a, b) => (b.length !== a.length ? b.length - a.length : (a[0] as number) - (b[0] as number)))
    .slice(0, MAX_CONTOURS)
    .sort((a, b) => (a[0] as number) - (b[0] as number));

  const adapted: string[] = [];
  if (components.length > kept.length) {
    adapted.push(`contour streets ${components.length} → ${kept.length} (the longest are kept)`);
  }

  const segments: StreetSegment[] = [];
  for (const [c, component] of kept.entries()) {
    const spine = doubleSweep(component, width);
    if (spine.length < MIN_CLIPPED_RUN) continue;
    const path = densify4(spine.map(pointOf));
    for (const [r, run] of runsOf(path, inside).entries()) {
      segments.push({
        id: r === 0 ? `cn${c}` : `cn${c}_${r}`,
        kind: "street",
        width: STREET_WIDTH.street,
        path: run,
      });
    }
  }
  if (segments.length === 0) {
    return {
      ok: false,
      reason: "no contour of the ground under this quarter is long enough to be a street",
      fix: 'move the quarter onto a longer, more even slope with a "zone" or "at" constraint, or write "fabric": "grown" for an unplanned quarter that ignores the ground',
      fallback: "grown",
    };
  }

  // Which contour street owns a column — the target a stair walks down to.
  const owner = new Int32Array(cells).fill(-1);
  const claim = (index: number, cellsOf: readonly Point2[]): void => {
    for (const p of cellsOf) {
      if (!inside(p)) continue;
      owner[at(p.x, p.z)] = index;
    }
  };
  for (const [s, segment] of segments.entries()) claim(s, segment.path);

  // --- stairs --------------------------------------------------------------
  const contours = segments.length;
  for (let s = 0; s < contours; s++) {
    const segment = segments[s] as StreetSegment;
    // Every `blockSize` columns of arc — and, when the contour is shorter than
    // one pitch, once at its midpoint anyway. A bench whose contour is a short
    // corner run would otherwise get no stair at all, which is a terrace you
    // can see and cannot reach: exactly the defect `traversal.unreachable`
    // exists to find, and cheaper to prevent here.
    const pitch = ctx.blockSize;
    const starts =
      segment.path.length > pitch
        ? Array.from({ length: Math.floor((segment.path.length - 1) / pitch) }, (_, n) => (n + 1) * pitch)
        : [segment.path.length >> 1];
    for (const a of starts) {
      const flight = descend(segment.path[a] as Point2, s, {
        smooth,
        owner,
        at,
        inside,
        limit: 4 * ctx.blockSize,
      });
      if (flight === null || flight.length < MIN_STAIR_RUN) continue;
      const path = densify4(flight);
      segments.push({
        id: `st${s}_${a}`,
        kind: "lane",
        width: STREET_WIDTH.lane,
        path,
        role: "steps",
      });
      claim(segments.length - 1, path);
    }
  }

  // --- every contour reachable from every other -----------------------------
  // A contour street the stairs did not reach is a bench you can see and cannot
  // get onto, and the inter-district road pass and the physics lint's
  // `traversal.unreachable` both take it personally. Link what is left with the
  // shortest walk over the quarter's own ground, laid as one more flight.
  linkComponents(segments, { at, inside, owner, pointOf, cells, width, depth, bounds });

  // --- benches -------------------------------------------------------------
  const benches: FormBench[] = [];
  let widestBench = 0;
  for (const index of [...present].sort((a, b) => a - b)) {
    const platform = new Uint8Array(cells);
    for (let k = 0; k < cells; k++) if (bench[k] === index) platform[k] = 1;
    const runs = maskRuns(bounds, platform);
    if (runs.length === 0) continue;
    const box = largestRect(bounds, platform);
    if (box !== null) {
      widestBench = Math.max(widestBench, Math.min(box.x1 - box.x0 + 1, box.z1 - box.z0 + 1));
    }
    benches.push({ runs, level: base + index * benchHeight + benchHeight - 1 });
  }

  // A bench is only a bench if something can stand on it. Its width is
  // `BENCH_HEIGHT / gradient`, so on genuinely steep ground the benches come
  // out narrower than a contour street and its verges and the quarter is all
  // pavement: measured, a 200 × 180 quarter on a 1-in-3 hill produced *zero
  // buildings*. Handing that back in silence is the failure this compiler has
  // paid for repeatedly — a request accepted and quietly not met. Refuse it,
  // name the measurement, and let the announced fallback draw a quarter that
  // has houses in it.
  if (widestBench < MIN_BENCH_WIDTH) {
    return {
      ok: false,
      reason: `this ground is too steep to terrace at ${benchHeight} blocks a bench, the tallest bench a retaining wall is built for: the widest bench comes out ${widestBench} columns, and a contour street with lots along it needs ${MIN_BENCH_WIDTH}`,
      fix: 'move the quarter onto a gentler slope with a "zone" or "at" constraint, give it a smaller footprint so it sits across fewer contours, or write "fabric": "grown" for an unplanned quarter that climbs the hill without terracing it',
      fallback: "grown",
    };
  }

  return {
    ok: true,
    plan: {
      graph: { segments, intersections: intersectionsOf(segments), sidewalk: ctx.sidewalk },
      benches,
      record: drewAsAsked("terraced", {
        adapted: [`benches ${benches.length} of ${benchHeight} blocks`, ...adapted],
        // The contours decide which way a street runs; an author's angle cannot.
        ignored: ["orientation (contour-led)"],
      }),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the field                                                                   */
/* -------------------------------------------------------------------------- */

/** The bench field over a domain, and the datum it is counted from. */
export interface BenchField {
  /** The blurred height field, row-major over `ctx.bounds`. */
  readonly smooth: Float64Array;
  /** The lowest masked column, rounded — bench 0's floor. */
  readonly base: number;
  /** Bench index per column, `-1` outside the mask. */
  readonly bench: Int32Array;
  /** Every bench index that has at least one column. */
  readonly present: ReadonlySet<number>;
  /** Blocks of rise this field was cut at — {@link benchHeightFor}'s answer. */
  readonly height: number;
}

/**
 * The bench field: the whole of "which terrace is this column on".
 *
 * Exported because it is the one thing a test can assert the invariant against
 * — no lot spans two bench levels, every adjacent bench pair is joined by a
 * stair — without re-deriving the blur and getting a different answer.
 *
 * `height` defaults to {@link BENCH_HEIGHT} so a caller that does not care about
 * the derivation gets the field the form has always cut.
 */
export function benchFieldOf(ctx: FormContext, height: number = BENCH_HEIGHT): BenchField {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const cells = width * depth;
  const at = (x: number, z: number): number => (z - bounds.z0) * width + (x - bounds.x0);
  const masked = (k: number): boolean => ctx.mask === undefined || ctx.mask[k] === 1;

  const field = new Float64Array(cells);
  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) field[at(x, z)] = ctx.ground.height(x, z);
  }
  const smooth = boxBlur(field, width, depth, SMOOTH_RADIUS, SMOOTH_PASSES);

  let base = Number.POSITIVE_INFINITY;
  for (let k = 0; k < cells; k++) {
    if (!masked(k)) continue;
    const h = Math.round(smooth[k] as number);
    if (h < base) base = h;
  }
  return { smooth, base, ...cut(smooth, cells, base, height, masked), height };
}

/** The bench index per column at one height, over an already-blurred field. */
function cut(
  smooth: Float64Array,
  cells: number,
  base: number,
  height: number,
  masked: (k: number) => boolean,
): { readonly bench: Int32Array; readonly present: ReadonlySet<number> } {
  const bench = new Int32Array(cells).fill(-1);
  const present = new Set<number>();
  if (base !== Number.POSITIVE_INFINITY) {
    for (let k = 0; k < cells; k++) {
      if (!masked(k)) continue;
      const b = Math.floor((Math.round(smooth[k] as number) - base) / height);
      bench[k] = b;
      present.add(b);
    }
  }
  return { bench, present };
}

/**
 * How tall a bench has to be here, and the whole of §10.3's answer.
 *
 * **The deciding variable is the gradient, not the relief.** A bench is the
 * horizontal offcut of a riser, so its width is `benchHeight / gradient`: sixty
 * columns on a 1-in-15 slope and twelve on a 1-in-3 one, at the *same* height,
 * and two quarters with identical relief spread over 400 and over 100 columns
 * behave nothing alike. That is why `clamp(round(relief / 6), 3, 6)` — the
 * derivation §10.3 deferred — is derived from the wrong number and is not what
 * this does.
 *
 * It is also why this measures rather than models. The gradient of real ground
 * is not one number: a quarter with a flat shoulder and a steep face has no
 * single slope, and every scalar summary of it (mean, median, percentile of the
 * adjacent differences) is a guess at which part of the quarter the answer
 * should serve. The quantity that actually decides whether the form can be
 * drawn is **the width of the widest bench**, which is the gradient's
 * consequence and is cheap to compute exactly: cut the field at a candidate
 * height and measure. So:
 *
 * > Take the **smallest** height in `[BENCH_HEIGHT, BENCH_HEIGHT_MAX]` whose
 * > widest bench can carry a contour street and the lots along it, and whose
 * > field still holds two benches. If none can, return the tallest — the caller
 * > refuses with that measurement, which is now honestly "even the tallest
 * > bench this ground allows is too narrow" rather than "4 was too narrow".
 *
 * Smallest-first is what keeps one storey per bench the answer wherever it is
 * possible, so a gentle terraced quarter is byte-identical to the one this
 * compiler drew before the height became a range, and a hill only pays the
 * taller party-wall step when the alternative is no quarter at all.
 *
 * Deterministic: three integer cuts of one blurred field and a
 * maximal-rectangle sweep over each, no RNG and no clock.
 */
export function benchHeightFor(ctx: FormContext, field: BenchField): number {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const cells = width * (bounds.z1 - bounds.z0 + 1);
  const masked = (k: number): boolean => ctx.mask === undefined || ctx.mask[k] === 1;
  for (let height = BENCH_HEIGHT; height <= BENCH_HEIGHT_MAX; height++) {
    const { bench, present } = cut(field.smooth, cells, field.base, height, masked);
    // One bench is a grid with extra words, and a taller cut can only make it
    // worse, so this is a floor on the candidate rather than a reason to climb.
    if (present.size < 2) return height;
    if (widestBenchOf(bounds, cells, bench, present) >= MIN_BENCH_WIDTH) return height;
  }
  return BENCH_HEIGHT_MAX;
}

/**
 * The narrow dimension of the largest rectangle inside any one bench.
 *
 * The same measurement the refusal quotes, so the number that chose the height
 * and the number in the diagnostic are the same number by construction.
 */
function widestBenchOf(
  bounds: Rect,
  cells: number,
  bench: Int32Array,
  present: ReadonlySet<number>,
): number {
  let widest = 0;
  for (const index of [...present].sort((a, b) => a - b)) {
    const platform = new Uint8Array(cells);
    for (let k = 0; k < cells; k++) if (bench[k] === index) platform[k] = 1;
    const box = largestRect(bounds, platform);
    if (box === null) continue;
    widest = Math.max(widest, Math.min(box.x1 - box.x0 + 1, box.z1 - box.z0 + 1));
  }
  return widest;
}

/**
 * A separable box blur, `passes` times, clamped at the edge.
 *
 * Integer window, no transcendentals, no RNG: the same field in gives the same
 * field out on every runtime, which is the determinism law stated in code.
 */
function boxBlur(
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

/** 4-connected components of a mask, in row-major order of their first cell. */
function componentsOf(mask: Uint8Array, width: number, depth: number): number[][] {
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
      for (const n of neighboursOf(cell, width, depth)) {
        if (mask[n] !== 1 || seen[n] === 1) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    out.push(component);
  }
  return out;
}

/** The 4-neighbours of a cell index, in a fixed order: −z, −x, +x, +z. */
function neighboursOf(k: number, width: number, depth: number): number[] {
  const i = k % width;
  const j = Math.floor(k / width);
  const out: number[] = [];
  if (j > 0) out.push(k - width);
  if (i > 0) out.push(k - 1);
  if (i + 1 < width) out.push(k + 1);
  if (j + 1 < depth) out.push(k + width);
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
function doubleSweep(component: readonly number[], width: number): number[] {
  const cells = new Set(component);
  const first = component[0] as number;
  const a = sweep(first, cells, width).far;
  const second = sweep(a, cells, width);
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
): { readonly far: number; readonly parent: Map<number, number> } {
  const parent = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let far = start;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] as number;
    far = cell;
    const i = cell % width;
    const steps = [cell - width, i > 0 ? cell - 1 : -1, cell + 1, cell + width];
    for (const n of steps) {
      if (n < 0 || !cells.has(n) || parent.has(n)) continue;
      // Guard the row wrap: `cell + 1` off the right-hand edge is the next row.
      if (Math.abs(n - cell) === 1 && Math.floor(n / width) !== Math.floor(cell / width)) continue;
      parent.set(n, cell);
      queue.push(n);
    }
  }
  return { far, parent };
}

/* -------------------------------------------------------------------------- */
/* stairs                                                                      */
/* -------------------------------------------------------------------------- */

/** What {@link descend} needs to walk downhill. */
interface DescentContext {
  readonly smooth: Float64Array;
  readonly owner: Int32Array;
  at(x: number, z: number): number;
  inside(p: Point2): boolean;
  readonly limit: number;
}

/**
 * A steepest-descent walk from a contour street to the next one downhill.
 *
 * 4-connected, never revisiting a column, and terminating the moment it stands
 * on a *different* contour street — which is what makes the flight a connection
 * between two benches rather than a path down the hill. A walk that reaches a
 * local minimum first is dropped: half a stair is worse than none.
 */
function descend(start: Point2, from: number, ctx: DescentContext): Point2[] | null {
  const walk: Point2[] = [start];
  const seen = new Set<number>([ctx.at(start.x, start.z)]);
  const heightAt = (p: Point2): number => ctx.smooth[ctx.at(p.x, p.z)] as number;

  // The direction the hill falls in, read over a *wide* stencil. A narrow one is
  // useless here: the blur of a terrace is dead flat in the middle of the
  // terrace, so a one-column gradient is zero exactly where the walk spends most
  // of its length, and a walk that insists on a strictly lower neighbour stalls
  // on the flat and the bench above it never gets its stair.
  const REACH = 8;
  let heading = { x: -1, z: 0 };
  let fall = Number.POSITIVE_INFINITY;
  for (const d of DIRECTIONS) {
    const probe = { x: start.x + d.x * REACH, z: start.z + d.z * REACH };
    if (!ctx.inside(probe)) continue;
    const h = heightAt(probe);
    if (h < fall) {
      fall = h;
      heading = d;
    }
  }

  let cursor = start;
  for (let step = 0; step < ctx.limit; step++) {
    const here = heightAt(cursor);
    // Downhill first, and *never* uphill; among equals, keep going the way we
    // were going. That is what carries a flight straight across the flat of a
    // terrace and turns it down the riser at the far side, instead of wandering.
    let best: Point2 | null = null;
    let bestHeight = Number.POSITIVE_INFINITY;
    for (const d of [heading, ...DIRECTIONS]) {
      const candidate = { x: cursor.x + d.x, z: cursor.z + d.z };
      if (!ctx.inside(candidate)) continue;
      const k = ctx.at(candidate.x, candidate.z);
      if (seen.has(k)) continue;
      const h = heightAt(candidate);
      if (h > here || h >= bestHeight) continue;
      bestHeight = h;
      best = candidate;
      heading = d;
    }
    if (best === null) return null;
    cursor = best;
    seen.add(ctx.at(cursor.x, cursor.z));
    walk.push(cursor);
    const reached = ctx.owner[ctx.at(cursor.x, cursor.z)] as number;
    if (reached >= 0 && reached !== from) return walk;
  }
  return null;
}

/** The four steps, in a fixed order: −z, −x, +x, +z. */
const DIRECTIONS: readonly Point2[] = Object.freeze([
  { x: 0, z: -1 },
  { x: -1, z: 0 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
]);

/* -------------------------------------------------------------------------- */
/* connectivity                                                                */
/* -------------------------------------------------------------------------- */

/** What {@link linkComponents} needs to find its way across the quarter. */
interface LinkContext {
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
function linkComponents(segments: StreetSegment[], ctx: LinkContext): void {
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
function groupsOf(segments: readonly StreetSegment[], ctx: LinkContext): Map<StreetSegment, number> {
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
