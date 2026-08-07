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
 *    whose bench index differs from a 4-neighbour's — **thinned to one boundary
 *    in {@link contourStrideFor}**. Each connected component of what is left
 *    becomes one polyline by the double sweep (farthest cell from a fixed
 *    start, then farthest from *there*, then the BFS-tree path between them),
 *    `densify4`'d and cut to the mask.
 * 3. **Stairs.** Every `blockSize` columns of arc along a contour street, a
 *    steepest-descent walk to the next contour street downhill, emitted with
 *    `role: "steps"` so the surfacer lays it with the tread law instead of the
 *    grader. With a stride above one a flight crosses the whole band of benches
 *    between two streets, which is what a stair-alley in a hill town is, and it
 *    is the frontage the terraces in the middle of the band are reached from.
 * 4. **Benches as products.** Each bench's columns as maximal horizontal runs,
 *    which the caller turns into `PadEdit`s and founds its buildings on.
 * 5. **The retained boundaries.** Every bench boundary the stride did *not* make
 *    a street goes into the form's lot mask as 0, which is what keeps no
 *    lot spanning two bench levels once the streets stop doing it — see
 *    {@link contourStrideFor}.
 *
 * `orientation` is deliberately ignored: the contours decide the street
 * direction, not the author, and {@link FormRecord.ignored} says so rather than
 * letting a silently dropped input become the next expensive defect.
 */

import type { Point2, Rect } from "../frames.js";
import { RETAIN_MAX } from "../levels.js";
import { largestRect, maskRuns } from "../masks.js";
import type { StreetSegment } from "../streets.js";

import { STREET_WIDTH, densify4, intersectionsOf, runsOf } from "./axial.js";
import {
  boxBlur,
  branchesOf,
  componentsOf,
  flightFrom,
  linkComponents,
} from "./contour-lines.js";
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
 * Columns of a bench's mean width that never reach a lot, and why.
 *
 * A bench is a curved band, and `blocksOf` hands `subdivide` the largest
 * *rectangle* inscribed in each block rather than the block itself — deliberately
 * (see `largestFreeRect`), because the alternative is lots that lie half in a
 * street. The narrow side of that rectangle is the band's tightest point, not
 * its mean, so a bench whose mean width is exactly what a row of houses needs
 * yields a row of houses nowhere. Measured on `stepped_hilltown`: 98 blocks
 * holding 12 073 columns whose inscribed rectangles came to 4 902, a shortfall
 * of two to three columns on a ten-column band. Three is that shortfall,
 * rounded to the side that builds.
 */
const BENCH_SLACK = 3;

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

/**
 * Narrowest bench that can carry a row of lots with **no street on it**.
 *
 * `MIN_INFILL_SIDE` in `district.ts` is 7 — the shallowest footprint this
 * compiler hands the grammar — and one column goes to the retained boundary the
 * bench loses to the wall above it. Restated rather than imported for the same
 * reason {@link MIN_BENCH_WIDTH} is: a form sits upstream of `district.ts`, and
 * importing it here closes a module cycle.
 *
 * This is the floor the refusal uses once {@link contourStrideFor} returns more
 * than one, because at that point most benches carry no street and the question
 * "can a bench hold a street, its verges and a lot" is being asked of ground
 * that was never going to be asked to hold all three.
 */
const MIN_BENCH_LOTS = 7 + 1;

/**
 * Mean bench width {@link benchHeightFor} climbs to reach, in columns.
 *
 * What a terrace has to fit across its depth, added up: a retained boundary on
 * the low side (1, blocked so no lot spans the step), the row of houses
 * ({@link MIN_BENCH_LOTS}, which is `MIN_INFILL_SIDE` plus the side gap
 * `infillLot` takes off the back), a retained boundary on the high side (1),
 * and {@link BENCH_SLACK} for the fact that a bench is a curved band and the
 * rectangle `largestFreeRect` inscribes in it is narrower than the band.
 *
 * It is compared against the **mean** rather than the widest bench for the
 * reason {@link benchHeightFor} sets out at length: the widest bench is the
 * quarter's most favourable spot and the houses stand on all of them.
 */
const MIN_MEAN_BENCH = 1 + MIN_BENCH_LOTS + 1 + BENCH_SLACK;

/* -------------------------------------------------------------------------- */
/* how often a bench boundary is a street                                      */
/* -------------------------------------------------------------------------- */

/**
 * A street on every `S`th bench boundary, and the whole of why a hill town is
 * not pavement.
 *
 * **What was wrong.** The form's founding invariant was *a bench boundary is
 * always a street* — which made the street count scale with the **relief**
 * rather than with the town. Forty-five blocks of relief at one storey a bench
 * is twelve terraces, and twelve terraces is twelve full-width contour streets:
 * measured on `stepped_hilltown`, 20 559 of 25 600 columns were carriageway or
 * sidewalk, 80 % of the quarter, and four buildings stood in it. The invariant
 * bought exactly one thing — *no lot spans two bench levels* — and Phase 4.2
 * bought that thing again and cheaper: `terraced` resolves the `"stepped"`
 * ground policy, so `levelSeams`' columns go into `blocked` **before**
 * `blocksOf` runs (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.3 step 4) and a block
 * already cannot span two platforms. The guarantee comes from the seam being
 * *blocked*, not from it being a *street*. So the streets were being paid for
 * twice.
 *
 * **The rule.** A street's job here is the job it has in every other form: to
 * bound a block. So space the contour streets the way every other form spaces
 * its streets — at `blockSize`, which is *the* preferred centre-line spacing —
 * and let the ground decide how many benches that is:
 *
 * > A bench is `W = 2·area / boundaryColumns` columns deep on average (each
 * > contour is two columns wide, one either side of the step, so the boundary
 * > set is twice the total contour length, and the benches tile the quarter).
 * > The stride is the **fewest benches whose combined depth reaches
 * > `blockSize`**: `S = ceil(blockSize / W)`.
 *
 * `ceil` rather than `round` because `blockSize` is a floor on how deep a block
 * may be, not a target to straddle: a band one bench shallower than the fabric
 * asked for is a band that cannot hold the row of lots the fabric asked for.
 *
 * Two consequences are worth stating because they are what makes this safe:
 *
 * - **On gentle ground `W ≥ blockSize`, so `S = 1` and this is exactly the
 *   construction the form has always drawn** — same boundary set, same
 *   components, same polylines, byte for byte. A hill town only thins its
 *   streets when the ground is steep enough to have been giving it too many.
 * - The stride is a function of the blurred height field, the mask and
 *   `blockSize`, all of which are already inputs. No RNG, no clock, one
 *   division.
 *
 * The intervening boundaries are not abandoned: they go into the lot mask, so
 * the invariant holds under `params.ground: "benched"` too, where no seam is
 * blocked; they are the seams `structures/retaining.ts` builds walls on; and
 * the stair-alleys that cross them are what the terraces between two streets
 * are reached from.
 *
 * @param blockSize preferred centre-line spacing, from the fabric
 * @param area masked columns of the quarter
 * @param boundaryColumns columns of the bench-boundary set
 * @param benches how many benches the field holds
 */
export function contourStrideFor(
  blockSize: number,
  area: number,
  boundaryColumns: number,
  benches: number,
): number {
  // A field with no boundary has one bench, which the caller has already
  // refused; answering 1 keeps this total rather than dividing by zero.
  if (boundaryColumns <= 0) return 1;
  const width = (2 * area) / boundaryColumns;
  const stride = Math.ceil(blockSize / width);
  // At least one boundary must still be a street or there is no skeleton at
  // all, so the stride can never exceed the number of boundaries there are.
  return Math.min(Math.max(1, stride), Math.max(1, benches - 1));
}

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

  // --- the bench boundary, level by level -----------------------------------
  // `level[k]` is the *lower* of the two benches the column sits on the step
  // between, so both sides of one contour carry the same number and the stride
  // below can thin whole contours rather than half of each.
  const boundary = new Uint8Array(cells);
  const boundaryLevel = new Int32Array(cells).fill(-1);
  let boundaryColumns = 0;
  let maskedColumns = 0;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const level = bench[k] as number;
      if (level < 0) continue;
      maskedColumns++;
      const neighbours = [
        j > 0 ? k - width : -1,
        i > 0 ? k - 1 : -1,
        i + 1 < width ? k + 1 : -1,
        j + 1 < depth ? k + width : -1,
      ];
      let lower = -1;
      for (const n of neighbours) {
        if (n < 0) continue;
        const other = bench[n] as number;
        if (other < 0) continue;
        if (other === level) continue;
        const pair = Math.min(level, other);
        if (lower < 0 || pair < lower) lower = pair;
      }
      if (lower < 0) continue;
      boundary[k] = 1;
      boundaryLevel[k] = lower;
      boundaryColumns++;
    }
  }

  // --- contour streets, one boundary in `stride` ----------------------------
  // See `contourStrideFor`. At stride 1 the street set *is* the boundary set,
  // which is the construction this form has always drawn.
  const stride = contourStrideFor(ctx.blockSize, maskedColumns, boundaryColumns, present.size);
  const streetLine = new Uint8Array(cells);
  const retained = new Uint8Array(cells);
  if (stride <= 1) {
    streetLine.set(boundary);
  } else {
    for (let k = 0; k < cells; k++) {
      if (boundary[k] !== 1) continue;
      if ((boundaryLevel[k] as number) % stride === stride - 1) streetLine[k] = 1;
      else retained[k] = 1;
    }
  }

  const components = componentsOf(streetLine, width, depth);
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
  // The bench boundary each contour street was drawn from, by segment index —
  // the lowest one its component touches, so a component that grazes two levels
  // where the benches pinch still has one answer. Read only to find which
  // streets are the *highest*, and therefore which of them have a band of
  // terraces above them that nothing else would reach.
  const contourLevel: number[] = [];
  let drawn = 0;
  for (const [c, component] of kept.entries()) {
    let level = Number.POSITIVE_INFINITY;
    for (const k of component) level = Math.min(level, boundaryLevel[k] as number);
    for (const [b, branch] of branchesOf(component, width, depth, MAX_CONTOURS - drawn).entries()) {
      const path = densify4(branch.map(pointOf));
      const stem = b === 0 ? `cn${c}` : `cn${c}b${b}`;
      for (const [r, run] of runsOf(path, inside).entries()) {
        segments.push({
          id: r === 0 ? stem : `${stem}_${r}`,
          kind: "street",
          width: STREET_WIDTH.street,
          path: run,
        });
        contourLevel.push(level);
      }
      drawn++;
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

  // --- stair-alleys ---------------------------------------------------------
  // A flight per `blockSize` columns of arc along each contour street, crossing
  // the whole band of benches below it. At a stride above one the band holds
  // terraces with no contour street of their own, and the flight is the *only*
  // thing that reaches them: it is their frontage, which is what a stair-alley
  // in a hill town is for. The band **above the highest street** has nothing
  // below it to walk down from, so that street throws flights upward as well —
  // otherwise the top of the hill is terraces nobody can get onto, and the
  // measurement said so (20 of 79 blocks with no frontage at all).
  const topLevel = Math.max(...contourLevel);
  const contours = segments.length;
  for (const upward of [false, true]) {
    // Only the highest streets climb, and only once the stride has left a band
    // above them. At stride 1 every boundary is a street and the bench above
    // the highest one is served by it, which is why this loop runs once there
    // and every gentle terraced quarter is byte-identical.
    if (upward && stride <= 1) continue;
    for (let s = 0; s < contours; s++) {
      if (upward && (contourLevel[s] as number) !== topLevel) continue;
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
        const walk = flightFrom(segment.path[a] as Point2, s, {
          smooth,
          owner,
          bench,
          at,
          inside,
          limit: 4 * ctx.blockSize,
          sign: upward ? -1 : 1,
          // The band is `stride` benches deep, so a flight that has crossed
          // that many has crossed the band whether or not a street was waiting
          // at the far side. At stride 1 there is always a street at the far
          // side — that is what stride 1 *means* — so the span never fires and
          // a flight that stalls is dropped, exactly as it always was.
          span: stride > 1 ? stride : Number.POSITIVE_INFINITY,
          keepStalled: stride > 1,
        });
        if (walk === null || walk.length < MIN_STAIR_RUN) continue;
        const path = densify4(walk);
        segments.push({
          id: `${upward ? "up" : "st"}${s}_${a}`,
          kind: "lane",
          width: STREET_WIDTH.lane,
          path,
          role: "steps",
        });
        claim(segments.length - 1, path);
      }
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
  // At a stride above one most benches carry no street, so the bar a bench has
  // to clear is the one a *row of lots* sets, not the one a street and its two
  // verges and a row of lots set together. Asking the wider question of ground
  // that will never be asked to hold all three is what turned buildable hill
  // towns into `grown` fallbacks.
  const benchFloor = stride > 1 ? MIN_BENCH_LOTS : MIN_BENCH_WIDTH;
  if (widestBench < benchFloor) {
    return {
      ok: false,
      reason:
        stride > 1
          ? `this ground is too steep to terrace at ${benchHeight} blocks a bench, the tallest bench a retaining wall is built for: the widest bench comes out ${widestBench} columns, and a row of houses along a terrace needs ${benchFloor}`
          : `this ground is too steep to terrace at ${benchHeight} blocks a bench, the tallest bench a retaining wall is built for: the widest bench comes out ${widestBench} columns, and a contour street with lots along it needs ${benchFloor}`,
      fix: 'move the quarter onto a gentler slope with a "zone" or "at" constraint, give it a smaller footprint so it sits across fewer contours, or write "fabric": "grown" for an unplanned quarter that climbs the hill without terracing it',
      fallback: "grown",
    };
  }

  if (stride > 1) {
    adapted.push(
      `contour streets on every ${stride === 2 ? "2nd" : stride === 3 ? "3rd" : `${stride}th`} bench boundary (the rest are retained)`,
    );
  }

  return {
    ok: true,
    plan: {
      graph: { segments, intersections: intersectionsOf(segments), sidewalk: ctx.sidewalk },
      benches,
      // **The retained boundaries.** A bench boundary that carries no street is
      // ground no lot may take, and saying so here is what keeps *no lot spans
      // two bench levels* true without a street to enforce it. Under the
      // `"stepped"` policy `terraced` resolves by default these are the very
      // columns `levelSeams` already puts in `blocked`, so this is belt and
      // braces; under an explicit `params.ground: "benched"` no seam is blocked
      // and this is the only thing holding the invariant up. It is also what
      // gives `structures/retaining.ts` a clear column to stand its wall on
      // rather than a building's foundation skirt.
      //
      // Absent at stride 1, where every boundary is a street: a mask of all
      // ones would be a no-op, and *absent* is the byte-identical path.
      ...(stride > 1 ? { lotMask: lotMaskOf(retained, cells) } : {}),
      record: drewAsAsked("terraced", {
        adapted: [`benches ${benches.length} of ${benchHeight} blocks`, ...adapted],
        // The contours decide which way a street runs; an author's angle cannot.
        ignored: ["orientation (contour-led)"],
      }),
    },
  };
}

/** 1 everywhere but the retained bench boundaries — the form's lot mask. */
function lotMaskOf(retained: Uint8Array, cells: number): Uint8Array {
  const mask = new Uint8Array(cells).fill(1);
  for (let k = 0; k < cells; k++) if (retained[k] === 1) mask[k] = 0;
  return mask;
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
 * single slope. So cut the field at a candidate height and measure what came
 * out. So:
 *
 * > Take the **smallest** height in `[BENCH_HEIGHT, BENCH_HEIGHT_MAX]` whose
 * > **typical** bench can carry a row of houses, and whose field still holds
 * > two benches. If none can, return the tallest — the caller refuses with that
 * > measurement, which is now honestly "even the tallest bench this ground
 * > allows is too narrow" rather than "4 was too narrow".
 *
 * Smallest-first is what keeps one storey per bench the answer wherever it is
 * possible, so a gentle terraced quarter is byte-identical to the one this
 * compiler drew before the height became a range, and a hill only pays the
 * taller party-wall step when the alternative is no quarter at all.
 *
 * **"Typical", and why it used to say "widest".** This first read *the width of
 * the widest bench*, from the largest rectangle inscribed in any one of them.
 * That is the right question to ask about whether the form can be drawn **at
 * all** — the refusal still asks it — and the wrong one to ask about how tall a
 * bench should be, because it is answered by the single most favourable spot in
 * the quarter. Measured on `stepped_hilltown`: at four blocks a bench the widest
 * bench was over 17 columns (a flat shoulder near the summit) and the derivation
 * stopped at four, while the **mean** bench was 10.3 columns — one column of
 * retained boundary either side and eight left, which is one short of the depth
 * `infillLot` needs after its side gap, so 98 blocks yielded 3 buildings. The
 * mean is {@link meanBenchWidthOf}, it is the same number
 * {@link contourStrideFor} spaces the streets by, and it is what the houses
 * actually stand on.
 *
 * Deterministic: three integer cuts of one blurred field and one sweep over
 * each, no RNG and no clock.
 */
export function benchHeightFor(ctx: FormContext, field: BenchField): number {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const cells = width * depth;
  const masked = (k: number): boolean => ctx.mask === undefined || ctx.mask[k] === 1;
  for (let height = BENCH_HEIGHT; height <= BENCH_HEIGHT_MAX; height++) {
    const { bench, present } = cut(field.smooth, cells, field.base, height, masked);
    // One bench is a grid with extra words, and a taller cut can only make it
    // worse, so this is a floor on the candidate rather than a reason to climb.
    if (present.size < 2) return height;
    if (meanBenchWidthOf(bench, width, depth) >= MIN_MEAN_BENCH) return height;
  }
  return BENCH_HEIGHT_MAX;
}

/**
 * The mean bench width, in columns: `2 · area / boundary columns`.
 *
 * Each contour is two columns wide — one either side of the step — so the
 * boundary set is twice the total contour length, and the benches tile the
 * quarter between those contours. One pass, no allocation beyond two counters,
 * and it is the same quantity {@link contourStrideFor} divides `blockSize` by,
 * derived here from a candidate cut rather than from the chosen one.
 */
export function meanBenchWidthOf(bench: Int32Array, width: number, depth: number): number {
  let area = 0;
  let boundary = 0;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const level = bench[k] as number;
      if (level < 0) continue;
      area++;
      const neighbours = [
        j > 0 ? k - width : -1,
        i > 0 ? k - 1 : -1,
        i + 1 < width ? k + 1 : -1,
        j + 1 < depth ? k + width : -1,
      ];
      for (const n of neighbours) {
        if (n < 0) continue;
        const other = bench[n] as number;
        if (other < 0 || other === level) continue;
        boundary++;
        break;
      }
    }
  }
  return boundary === 0 ? Number.POSITIVE_INFINITY : (2 * area) / boundary;
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
