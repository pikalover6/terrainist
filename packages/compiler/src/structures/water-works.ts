/**
 * **The `fluid.channel` declaration** — how a structure says where the water is
 * (`docs/INFRA-ENTRIES-v0.md` families B and D; `docs/GROUND-CONTRACT-v0.md`
 * §2.1, §3.5, §4's rank-0 row).
 *
 * Three catalog entries move water — `dam`, `weir`, `canal_lock` — and the
 * design filed all three post-freeze on one sentence: *"`dam` and `weir`
 * additionally move water — a `fluid.channel` declaration, rank 0, tier A"*.
 * This module is that declaration, and nothing else. It does not know what a
 * dam is made of, and `infra-entry.ts` does not know how a pool closes.
 *
 * ## The contract, in four sentences
 *
 * 1. A water mover declares **two** things and never a third: a set of *solid*
 *    columns at one crest level (the barrier), and a set of *wet* columns whose
 *    fluid surface is one held level (the pool). Both go in as
 *    `fluid.channel` — rank 0, the top of §4's table — because losing a water
 *    claim is a physics failure rather than an ugly walk.
 * 2. The declaration is the **only** statement about the water surface. Nothing
 *    here writes `fluidTop` by hand; the driver's resolve does, over the whole
 *    accumulated prefix, exactly as `digCanals` has since WP-3. That is what
 *    makes the physics lint, the vegetation clip, the boat clearance and the
 *    biome clamp all see one answer instead of four.
 * 3. A pool is declared **only if it closes**. Every wet column's in-region
 *    4-neighbours must be wet at the same surface or stand at or above it —
 *    which is `checkFluidStability`'s own predicate, restated as a
 *    precondition rather than checked afterwards. The `terrain/validate.ts`
 *    rule counts `top - max(lowest neighbour surface, floor)` blocks of flow
 *    per column, so one unclosed column is `LOAM-T110` and a leak that reaches
 *    the region edge is thousands.
 * 4. Where it does not close, the head comes **down** a block and the whole
 *    question is asked again, to a floor of one. A dam in an empty valley gets
 *    its full head; the same dam beside a town settles at the head the town
 *    leaves room for; a dam with nowhere at all to put water builds as dry
 *    sculpture and says so. At no point does a partial pool get written.
 *
 * ## Why the head retries rather than truncating
 *
 * The tempting alternative — flood as far as the reach allows and stop — is the
 * one thing that cannot be done. A water surface in Minecraft is *flat*; a pool
 * cut off at an arbitrary column has an open vertical face at the cut, and the
 * first tick pours it downhill. There is no partial credit. So the only two
 * honest answers are "this head closes" and "it does not", and the retry is how
 * an entry finds the largest head that does.
 *
 * ## Determinism
 *
 * Integer arithmetic throughout, no RNG, no clock. The two places a choice is
 * made state their total order: the crossing is the **narrowest** bounded water
 * span, ties to the lowest `z`, then the lowest `x`, then the x-axis before the
 * z-axis; and upstream is the side with the **higher mean terrain**, ties to the
 * higher mean water surface, then to the lexicographically smaller `(dz, dx)`.
 * Both are compared by cross-multiplied integer sums rather than by division,
 * so no rounding enters either.
 */

import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { GroundClaim, GroundIntent } from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";

import { index, inside } from "./roads.js";
import type { CoursePoint } from "./wall-course.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Columns beyond the named anchor's own extent that a watercourse is looked for
 * in.
 *
 * An author writes `"across": "mill_holding"` and means *the stream at the
 * mill*, not *a stream strictly inside the holding's hull* — a watercourse is
 * the one piece of a settlement's geography nobody drew a boundary around. Wide
 * enough to find the water a holding was sited on, narrow enough that naming
 * one end of a town does not dam the other.
 */
export const WATERCOURSE_SEARCH = 24;

/** How far either side of a crossing the upstream test samples the ground. */
export const WATERCOURSE_PROBE = 12;

/** Columns a barrier over-runs the water into each bank. */
export const WATERCOURSE_FLANK = 4;

/**
 * The widest water a barrier will cross.
 *
 * Past this the "watercourse" is a lake or the sea, and a line thrown across
 * one is not a dam, it is a causeway somebody will walk the length of looking
 * for the point of it.
 */
export const WATERCOURSE_MAX_SPAN = 48;

/* -------------------------------------------------------------------------- */
/* the crossing                                                                */
/* -------------------------------------------------------------------------- */

/** A unit step, on one of the two axes. */
export interface Step {
  readonly dx: number;
  readonly dz: number;
}

/** The watercourse crossing a barrier is thrown across. */
export interface WatercourseCrossing {
  /** The water columns of the crossing, in order along the barrier. */
  readonly wet: readonly CoursePoint[];
  /** The barrier's own direction — the axis the water is narrow along. */
  readonly line: Step;
  /** Perpendicular to {@link line}, pointing **upstream**. */
  readonly up: Step;
  /** The natural water surface at the crossing. */
  readonly natural: number;
  /** Columns of water the barrier crosses. */
  readonly span: number;
}

/** What {@link findWatercourse} decided. */
export type WatercourseResult =
  | ({ readonly kind: "crossing" } & WatercourseCrossing)
  | { readonly kind: "none"; readonly detail: string };

/**
 * **The four arrays the water planner reads, and no others** (§6a.1, WP-G6a).
 *
 * `findWatercourse`, `planWaterWorks` and `firstLeak` were typed on
 * `ColumnPlan` and read exactly `region`, `ground`, `fluidTop` and `fluidKind`
 * — the audit's "already pure; becomes `baseline.*` by name". Narrowing the
 * parameter is the whole of the relocation: a `ColumnPlan` still satisfies it,
 * so every existing caller is unchanged, and a `GroundBaseline` satisfies it
 * too, so the tier-A declarer can plan against the baseline it is entitled to
 * without a cast and without seeing a plan the build half has been writing.
 *
 * `drownPool` deliberately keeps its `ColumnPlan`: it is the **material** half
 * (`surface`, `soil`, `snow`) and stays where materials belong.
 */
export type WaterField = Pick<ColumnPlan, "region" | "ground" | "fluidTop" | "fluidKind">;

/** A rectangle of world, in the shape every pass here states one. */
export interface WaterBounds {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
}

/** One crossing candidate, with everything the total order reads. */
interface Candidate {
  readonly span: number;
  readonly x: number;
  readonly z: number;
  readonly axis: 0 | 1;
}

/** The stated total order: narrowest, then lowest `z`, then lowest `x`, then axis. */
function betterCrossing(candidate: Candidate, held: Candidate): boolean {
  if (candidate.span !== held.span) return candidate.span < held.span;
  if (candidate.z !== held.z) return candidate.z < held.z;
  if (candidate.x !== held.x) return candidate.x < held.x;
  return candidate.axis < held.axis;
}

/**
 * Find the narrowest bounded crossing of the water near `extent`.
 *
 * "Bounded" is the whole of the refusal: a water run that leaves the search
 * rectangle without meeting a bank is not a crossing, it is a column standing
 * *in* a body of water — the same distinction `resolveAcross`'s {@link reach}
 * makes about a carriageway, for the same reason, and the reason a dam thrown
 * across the open sea would otherwise be legal.
 */
export function findWatercourse(
  plan: WaterField,
  bounds: WaterBounds,
  extent: readonly CoursePoint[],
  search = WATERCOURSE_SEARCH,
): WatercourseResult {
  if (extent.length === 0) {
    return { kind: "none", detail: "it named nothing the compiler placed" };
  }
  const region = plan.region;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of extent) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  const rect = {
    x0: Math.max(bounds.x0, x0 - search),
    x1: Math.min(bounds.x0 + bounds.width - 1, x1 + search),
    z0: Math.max(bounds.z0, z0 - search),
    z1: Math.min(bounds.z0 + bounds.depth - 1, z1 + search),
  };
  if (rect.x0 > rect.x1 || rect.z0 > rect.z1) {
    return { kind: "none", detail: "it sits outside the world region" };
  }

  const wetAt = (x: number, z: number): boolean =>
    inside(region, x, z) && plan.fluidKind[index(region, x, z)] === FluidKind.WATER;
  const inRect = (x: number, z: number): boolean =>
    x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;

  let best: Candidate | undefined;
  let sawWater = false;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!wetAt(x, z)) continue;
      sawWater = true;
      for (const axis of [0, 1] as const) {
        const dx = axis === 0 ? 1 : 0;
        const dz = axis === 0 ? 0 : 1;
        // Only the low end of a run is measured, so a run of `n` columns
        // produces one candidate rather than `n` identical ones.
        if (wetAt(x - dx, z - dz) && inRect(x - dx, z - dz)) continue;
        let n = 0;
        let unbounded = false;
        for (;;) {
          const px = x + n * dx;
          const pz = z + n * dz;
          if (!inRect(px, pz)) {
            unbounded = true;
            break;
          }
          if (!wetAt(px, pz)) break;
          n++;
          if (n > WATERCOURSE_MAX_SPAN) {
            unbounded = true;
            break;
          }
        }
        // A run that started against the rectangle's own low edge never met a
        // bank on that hand either.
        if (!inRect(x - dx, z - dz)) unbounded = true;
        if (unbounded || n === 0) continue;
        const candidate: Candidate = { span: n, x, z, axis };
        if (best === undefined || betterCrossing(candidate, best)) best = candidate;
      }
    }
  }
  if (best === undefined) {
    return {
      kind: "none",
      detail: sawWater
        ? `the water within ${search} columns of it is not crossed anywhere inside the world region — it is open water rather than a watercourse`
        : `there is no water within ${search} columns of it`,
    };
  }

  const line: Step = best.axis === 0 ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
  const perp: Step = best.axis === 0 ? { dx: 0, dz: 1 } : { dx: 1, dz: 0 };
  const wet: CoursePoint[] = [];
  let natural = Infinity;
  for (let n = 0; n < best.span; n++) {
    const x = best.x + n * line.dx;
    const z = best.z + n * line.dz;
    wet.push({ x, z });
    const top = plan.fluidTop[index(region, x, z)] as number;
    if (top < natural) natural = top;
  }
  return {
    kind: "crossing",
    wet,
    line,
    up: upstreamOf(plan, wet, perp),
    natural,
    span: best.span,
  };
}

/**
 * Which hand of the crossing is upstream — **the higher ground**.
 *
 * Water runs downhill, so the valley a barrier impounds is the one whose land
 * stands higher, and that is a measurement rather than a taste. Means are
 * compared cross-multiplied so no division and no rounding enters; the tie-break
 * chain ends at a lexicographic order over the step itself, because an unstated
 * tie is two runs of the same document damming opposite sides of a bridge.
 */
function upstreamOf(plan: WaterField, wet: readonly CoursePoint[], perp: Step): Step {
  const region = plan.region;
  const sample = (sign: number): { ground: number; fluid: number; count: number } => {
    let ground = 0;
    let fluid = 0;
    let count = 0;
    for (let d = 1; d <= WATERCOURSE_PROBE; d++) {
      for (const c of wet) {
        const x = c.x + sign * d * perp.dx;
        const z = c.z + sign * d * perp.dz;
        if (!inside(region, x, z)) continue;
        const k = index(region, x, z);
        ground += plan.ground[k] as number;
        fluid += plan.fluidTop[k] as number;
        count++;
      }
    }
    return { ground, fluid, count };
  };
  const plus = sample(1);
  const minus = sample(-1);
  const positive: Step = { dx: perp.dx, dz: perp.dz };
  // `0 - 0` rather than `-0`: negative zero compares equal to zero everywhere
  // that matters and unequal in a deep-equality assertion, which is a test
  // failure that teaches nothing.
  const negative: Step = { dx: 0 - perp.dx, dz: 0 - perp.dz };
  if (plus.count > 0 && minus.count > 0) {
    const byGround = plus.ground * minus.count - minus.ground * plus.count;
    if (byGround !== 0) return byGround > 0 ? positive : negative;
    const byFluid = plus.fluid * minus.count - minus.fluid * plus.count;
    if (byFluid !== 0) return byFluid > 0 ? positive : negative;
  } else if (plus.count !== minus.count) {
    // One hand is off the region entirely: the world does not continue there,
    // so it cannot be the valley.
    return plus.count > minus.count ? positive : negative;
  }
  if (positive.dz !== negative.dz) return positive.dz < negative.dz ? positive : negative;
  return positive.dx < negative.dx ? positive : negative;
}

/* -------------------------------------------------------------------------- */
/* the works                                                                   */
/* -------------------------------------------------------------------------- */

/** The four numbers a water-moving entry states about itself. */
export interface WaterWorksSpec {
  readonly hold: number;
  readonly freeboard: number;
  readonly reach: number;
  readonly chamber?: number;
}

/** A closed impoundment, ready to declare. */
export interface WaterWorks {
  /** The fluid surface the pool and the chamber are held at. */
  readonly held: number;
  /** The level the barrier's own columns are declared at. */
  readonly crest: number;
  /** The natural water surface the head is measured from. */
  readonly natural: number;
  /** The head actually achieved, in blocks — `held - natural`. */
  readonly head: number;
  /** Barrier columns: index → declared solid level. Ascending by index. */
  readonly barrier: ReadonlyMap<number, number>;
  /** Wet columns: index → declared bed level. Every one holds to {@link held}. */
  readonly pool: ReadonlyMap<number, number>;
  /** The subset of {@link pool} that is the lock's chamber; empty otherwise. */
  readonly chamber: readonly number[];
  /** Pool columns that were dry before — the ones the water is new on. */
  readonly flooded: readonly number[];
  /** Columns upstream the second gate stands, or 0 when there is one gate. */
  readonly gateOffset: number;
  /**
   * Why no head closed, on the works that hold none.
   *
   * A barrier that impounds nothing is still built — a masonry line standing
   * out of the water, which is what a dam looks like from downstream anyway —
   * and the alternative is an author with a silent node. So the refusal is a
   * field on a usable plan rather than a separate return: the barrier's columns
   * are declared either way, because *the structure* has to be dry to stand up
   * whether or not there is a pool behind it.
   */
  readonly refusal?: string;
}

/** Everything {@link planWaterWorks} reads about the world it is planning in. */
export interface WaterWorksInput {
  readonly plan: WaterField;
  readonly crossing: WatercourseCrossing;
  readonly spec: WaterWorksSpec;
  /** The profile's lateral half-width — how thick the barrier is along the flow. */
  readonly halfSpan: number;
  /** Columns something already built owns. A pool may not drown one. */
  readonly taken: (x: number, z: number) => boolean;
  /** Columns the barrier over-runs the water into each bank. */
  readonly flank?: number;
}

/**
 * The barrier's own line: the water run, over-run into both banks.
 *
 * The over-run is what makes a dam meet its abutments rather than stop at the
 * waterline with a column of air either side of it, and it is the same `flank`
 * an `across` chord already takes for the same reason.
 */
export function barrierLine(crossing: WatercourseCrossing, flank: number): CoursePoint[] {
  const line: CoursePoint[] = [];
  const first = crossing.wet[0] as CoursePoint;
  const last = crossing.wet[crossing.wet.length - 1] as CoursePoint;
  for (let d = flank; d >= 1; d--) {
    line.push({ x: first.x - d * crossing.line.dx, z: first.z - d * crossing.line.dz });
  }
  line.push(...crossing.wet);
  for (let d = 1; d <= flank; d++) {
    line.push({ x: last.x + d * crossing.line.dx, z: last.z + d * crossing.line.dz });
  }
  return line;
}

/**
 * Plan the largest head that **closes**, or refuse.
 *
 * The loop is the design: try the entry's own hold, and where the pool it makes
 * would leak — past the reach, off into a column something is standing in, or
 * anywhere its own frontier does not hold the line — take a block off the head
 * and ask again. Nothing partial is ever returned, so a caller cannot declare
 * half a pool.
 */
export function planWaterWorks(input: WaterWorksInput): WaterWorks {
  const { plan, crossing, spec } = input;
  const region = plan.region;
  const flank = input.flank ?? WATERCOURSE_FLANK;

  const line = barrierLine(crossing, flank);
  const centre = crossing.wet[crossing.wet.length >> 1] as CoursePoint;
  const chamberLength = spec.chamber ?? 0;
  const gateOffset = chamberLength === 0 ? 0 : 2 * input.halfSpan + chamberLength + 1;

  const standing = (k: number): number => {
    const g = plan.ground[k] as number;
    const f = plan.fluidTop[k] as number;
    return plan.fluidKind[k] === FluidKind.NONE ? g : Math.max(g, f);
  };

  let lastDetail = "";
  for (let hold = Math.max(1, spec.hold); hold >= 1; hold--) {
    const attempt = attemptHead(hold);
    if ("detail" in attempt) {
      lastDetail = attempt.detail;
      continue;
    }
    return attempt;
  }
  // Nothing closed. The barrier is still declared — dry, one course over the
  // water it crosses — so the entry has ground to stand on and a walker meets a
  // structure rather than a stretch of river with a note about it in the log.
  const dry = attemptHead(0);
  return {
    ...(dry as WaterWorks),
    refusal: `no head from ${Math.max(1, spec.hold)} down to 1 could be held: ${lastDetail}`,
  };

  /**
   * One head, tried whole. `hold === 0` is the dry barrier: the same masonry,
   * declared at the same crest arithmetic, with no pool sought at all — which
   * is why it is this function rather than a second one that can drift from it.
   */
  function attemptHead(hold: number): WaterWorks | { readonly detail: string } {
    const held = crossing.natural + hold;
    // A dry barrier still has to stand *out* of the water it crosses, so its
    // crest is at least one course over the natural surface however little
    // freeboard the row asks for. (A weir asks for none, because its lip sits
    // at the head it holds — and a weir holding nothing would otherwise be
    // declared level with the river and never dry out.)
    const crest =
      hold === 0 ? crossing.natural + Math.max(1, spec.freeboard) : held + spec.freeboard;
    const barrier = new Map<number, number>();
    const blocked = new Set<number>();

    /** Lay one gate: the line, thickened along the flow by the profile's reach. */
    const gate = (offset: number): void => {
      for (const c of line) {
        for (let d = -input.halfSpan; d <= input.halfSpan; d++) {
          const x = c.x + (offset + d) * crossing.up.dx;
          const z = c.z + (offset + d) * crossing.up.dz;
          if (!inside(region, x, z)) continue;
          const k = index(region, x, z);
          blocked.add(k);
          // Only where the barrier is *raising* something. A column of bank
          // already standing above the crest is the abutment, and a claim that
          // levelled it to the crest would cut a notch in the valley side.
          if (standing(k) < crest) barrier.set(k, crest);
        }
      }
    };
    gate(0);

    const chamberCols: number[] = [];
    const chamberWet: number[] = [];
    if (chamberLength > 0) gate(gateOffset);
    if (chamberLength > 0 && hold > 0) {
      for (const c of line) {
        for (let d = input.halfSpan + 1; d <= gateOffset - input.halfSpan - 1; d++) {
          const x = c.x + d * crossing.up.dx;
          const z = c.z + d * crossing.up.dz;
          if (!inside(region, x, z)) continue;
          const k = index(region, x, z);
          blocked.add(k);
          if (plan.fluidKind[k] === FluidKind.WATER && !input.taken(x, z)) {
            chamberWet.push(k);
          } else if (standing(k) < crest) {
            // The chamber's walls: everything round the water that does not
            // already stand above the crest. This is what makes a chamber a
            // chamber rather than a puddle two gates happen to sit either side
            // of, and it is what keeps the held water in it stable.
            barrier.set(k, crest);
          }
          chamberCols.push(k);
        }
      }
    }
    void chamberCols;

    // --- the pool -----------------------------------------------------------
    const pool = new Map<number, number>();
    const floodable = (k: number): boolean => !blocked.has(k) && standing(k) < held;
    const queue: number[] = [];
    const seedAt = gateOffset + input.halfSpan + 1;
    for (const c of hold === 0 ? [] : crossing.wet) {
      const x = c.x + seedAt * crossing.up.dx;
      const z = c.z + seedAt * crossing.up.dz;
      if (!inside(region, x, z)) continue;
      const k = index(region, x, z);
      if (floodable(k)) queue.push(k);
    }
    queue.sort((a, b) => a - b);
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head] as number;
      if (pool.has(k)) continue;
      const i = k % region.width;
      const j = (k - i) / region.width;
      const x = region.x0 + i;
      const z = region.z0 + j;
      if (input.taken(x, z)) {
        return {
          detail: `a head of ${hold} would flood a column something is already standing in at (${x}, ${z})`,
        };
      }
      // **Upstream, or it is not a pool.** A fill that reaches a column level
      // with the barrier has gone *round* the abutment — the flank did not
      // reach high enough ground on one bank — and what is downstream of a dam
      // is by definition not impounded. Without this the water walks around the
      // end of the barrier and the whole valley below it comes up to the same
      // surface: stable, and completely wrong.
      const along = (x - centre.x) * crossing.up.dx + (z - centre.z) * crossing.up.dz;
      if (along <= input.halfSpan) {
        return {
          detail: `a head of ${hold} runs round the end of the barrier at (${x}, ${z}) instead of standing behind it`,
        };
      }
      if (Math.max(Math.abs(x - centre.x), Math.abs(z - centre.z)) > spec.reach) {
        return {
          detail: `a head of ${hold} makes a pool that runs past ${spec.reach} columns without closing`,
        };
      }
      pool.set(k, plan.ground[k] as number);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (!pool.has(n) && floodable(n)) queue.push(n);
      }
    }

    // The chamber's floor is dug flat, one course under the shallowest column
    // of it — which is what makes a lock read as a *chamber* from the towpath
    // rather than as a length of canal with gates on it.
    if (chamberWet.length > 0) {
      let floor = Infinity;
      for (const k of chamberWet) floor = Math.min(floor, plan.ground[k] as number);
      for (const k of chamberWet) pool.set(k, floor - 1);
    }

    // --- §4's own predicate, as a precondition ------------------------------
    const leak = firstLeak(plan, pool, barrier, held);
    if (leak !== undefined) {
      return {
        detail: `a head of ${hold} leaves an open face at (${leak.x}, ${leak.z})`,
      };
    }

    const flooded: number[] = [];
    for (const k of pool.keys()) {
      if (plan.fluidKind[k] === FluidKind.NONE) flooded.push(k);
    }
    flooded.sort((a, b) => a - b);
    return {
      held,
      crest,
      natural: crossing.natural,
      head: hold,
      barrier: sortedMap(barrier),
      pool: sortedMap(pool),
      chamber: [...chamberWet].sort((a, b) => a - b),
      flooded,
      gateOffset,
    };
  }
}

/** A map in ascending index order — a fact about the region, not about a walk. */
function sortedMap(m: ReadonlyMap<number, number>): ReadonlyMap<number, number> {
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
}

/**
 * The first wet column with an open horizontal face, or `undefined`.
 *
 * `terrain/validate.ts`'s `checkFluidStability`, restated over the *declared*
 * answer instead of over the finished plan: a wet column is safe when every
 * in-region 4-neighbour is either wet at the same surface or stands at or above
 * it. Region-boundary neighbours are outside the world and destabilise nothing,
 * which is that function's own rule and not a convenience taken here.
 */
export function firstLeak(
  plan: WaterField,
  pool: ReadonlyMap<number, number>,
  barrier: ReadonlyMap<number, number>,
  held: number,
): CoursePoint | undefined {
  const region = plan.region;
  for (const k of [...pool.keys()].sort((a, b) => a - b)) {
    const i = k % region.width;
    const j = (k - i) / region.width;
    const x = region.x0 + i;
    const z = region.z0 + j;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!inside(region, x + dx, z + dz)) continue;
      const n = index(region, x + dx, z + dz);
      if (pool.has(n)) continue;
      const natural =
        plan.fluidKind[n] === FluidKind.NONE
          ? (plan.ground[n] as number)
          : Math.max(plan.ground[n] as number, plan.fluidTop[n] as number);
      if (Math.max(natural, barrier.get(n) ?? Number.NEGATIVE_INFINITY) >= held) continue;
      return { x, z };
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* the declaration                                                             */
/* -------------------------------------------------------------------------- */

/** What {@link declareWaterWorks} committed. */
export interface WaterDeclaration {
  readonly solid: number;
  readonly water: number;
}

/**
 * Commit the works as `fluid.channel` (§3.5, §4's rank-0 row).
 *
 * Three intents and never more: the barrier as a `platform`, the pool as a
 * `platform` carrying its fluid, and a `preserve` over both. The `preserve` is
 * the same one `digCanals` declares and it is doing the same job — a later pass
 * that raised a column out of this pool would open the face the whole retry
 * loop above exists to close.
 *
 * Returns `{ solid: 0, water: 0 }` with no driver, which is every caller that
 * is not the world pipeline.
 */
export function declareWaterWorks(
  driver: GroundDriver | undefined,
  source: string,
  works: WaterWorks,
): WaterDeclaration {
  if (driver === undefined) return { solid: 0, water: 0 };
  const solid: GroundClaim[] = [...works.barrier].map(([idx, y]) => ({ idx, y }));
  const wet: GroundClaim[] = [...works.pool].map(([idx, y]) => ({
    idx,
    y,
    fluid: { kind: FluidKind.WATER as 1 | 2, top: works.held },
  }));
  const intents: GroundIntent[] = [];
  if (solid.length > 0) {
    intents.push({
      source: `${source}#barrier`,
      sourceClass: "fluid.channel",
      kind: "platform",
      columns: solid,
      transition: "wall",
    });
  }
  if (wet.length > 0) {
    intents.push(
      {
        source: `${source}#pool`,
        sourceClass: "fluid.channel",
        kind: "platform",
        columns: wet,
        transition: "none",
      },
      {
        source: `${source}#pool`,
        sourceClass: "fluid.channel",
        kind: "preserve",
        columns: wet,
        transition: "none",
      },
    );
  }
  if (intents.length === 0) return { solid: 0, water: 0 };
  driver.commit(intents);
  return { solid: solid.length, water: wet.length };
}

/**
 * Drown the materials on the columns the water is **new** on.
 *
 * The level went through the contract; this is the material half, and it is the
 * canal pass's own move: a column that has just gone under loses its top course
 * to whatever was beneath it, loses its soil so nothing is sown in it, and
 * loses its snow. Nothing is done to a column that was already water — the
 * river's own bed is the river's.
 *
 * `lakeMask` and `oceanMask` are deliberately untouched, for `digCanals`'
 * reason: a valley that turned into an ocean biome because somebody built a
 * dam is exactly the cross-pass defect the ground contract's §9 warns about.
 */
export function drownPool(plan: ColumnPlan, works: WaterWorks): number {
  for (const k of works.flooded) {
    plan.surface[k] = plan.subsurface[k] as number;
    plan.soil[k] = 0;
    plan.snow[k] = 0;
  }
  return works.flooded.length;
}
