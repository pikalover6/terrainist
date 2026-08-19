/**
 * A quarter's ground as a set of level platforms, and the seams between them.
 *
 * `docs/COURTYARDS-AND-LEVELS-v0.md` §3.1. `FormBench` — `{ runs, level }` —
 * has always been a platform field in everything but name; what it lacked was
 * *identity*, so nothing could say "this lot is on platform 3 and its neighbour
 * is on platform 2", and therefore nothing could build what goes between them.
 * {@link GroundLevels} is that identity, derived once and shared by every
 * consumer.
 *
 * Two decisions in this file are load-bearing and neither is negotiable:
 *
 * 1. **A form declares platforms; the seams are derived.** A form that declared
 *    its own seams could get one wrong, and a wrong seam is a cliff through a
 *    town. {@link levelSeams} builds them from the platform field by
 *    construction — every 4-adjacent pair of columns whose platform index
 *    differs — so a missing seam is not expressible. It is the same argument
 *    the canal pass's containment closure makes: the water is contained because
 *    every column it touches was *made* to hold it.
 * 2. **`FormBench` stays the wire format.** {@link groundLevelsOf} is a
 *    generalisation of `district.ts`'s `benchLevels`: over `terraced`'s benches
 *    `levelY[at(x, z)]` is the number `benchLevels` returns today, column for
 *    column, so `foundationY` is unchanged and a `terraced` quarter is
 *    byte-identical.
 *
 * Nothing here draws anything. WP-B (`layout/platforms.ts`,
 * `structures/retaining.ts`) is what builds a seam.
 */

import type { Point2, Rect } from "./frames.js";
import type { FormBench } from "./forms/types.js";
import { SEAM_TIERS } from "./types.js";

/** No platform covers this column. */
export const NO_PLATFORM = -1;

/** A quarter's ground as a set of level platforms. */
export interface GroundLevels {
  readonly bounds: Rect;
  /** Platform index per column, row-major over `bounds`; −1 = natural ground. */
  readonly index: Int32Array;
  /** Walking-surface Y per platform, in index order. */
  readonly levelY: readonly number[];
  /** The platforms as maximal horizontal runs — what a `PadEdit` wants. */
  readonly runs: readonly (readonly Rect[])[];
  /** Platform at a world column, or −1. */
  at(x: number, z: number): number;
}

/**
 * How the ground gets from one platform down to the next.
 *
 * `"tiered"` is `docs/GROUND-UNIFICATION-v0.md` §4.1 S2's: a drop past
 * {@link RETAIN_MAX} is not a face a wall refuses, it is `ceil(drop / RETAIN_MAX)`
 * faces stacked with a tread between them ({@link tiersOf}). It is what rule 5
 * returns instead of `"replan"` once {@link SEAM_TIERS} is on, and
 * `structures/retaining.ts`'s `buildTieredSeam` is what builds it.
 *
 * `"rock"` is `docs/SITE-PLAN-v0.md` §5.4's: an **uphill cut** nothing is
 * pressing against is exposed rock, made of `ground.stone` — the terrain pass's
 * own deep-subsurface symbol, so a cut face and the natural cliff beside it are
 * made of the same thing. Nothing is built there and no level moves; the finish
 * (`structures/retaining.ts`'s `finishCutFaces`) states what it is made of.
 */
export type SeamTreatment = "kerb" | "retaining" | "bank" | "built" | "tiered" | "rock";

/** Where two platforms touch, and how the ground gets between them. */
export interface LevelSeam {
  readonly above: number; // platform index
  readonly below: number;
  /** The columns of `below` that touch `above`, 8-connected, in a fixed order. */
  readonly cells: readonly Point2[];
  readonly drop: number; // levelY[above] − levelY[below]
  readonly treatment: SeamTreatment;
}

/**
 * Tallest drop a retaining wall is built for (§3.4).
 *
 * Six blocks is about the tallest dry-stone wall that reads as *built* rather
 * than as a cliff face with a coping on it. Past it the two platforms are
 * graded into each other and the record says so. Unmeasured — §10.2.
 */
export const RETAIN_MAX = 6;

/** Drop at which a retaining wall gets a balustrade (§3.4). Unmeasured — §10.2. */
export const RETAIN_RAIL = 3;

/**
 * Shortest seam run that is walled rather than graded, in columns.
 *
 * **Measured, 2026-08-05.** The `stepped_hilltown` quarter (160×160, 12
 * platforms at 67…111) reported 1010 seams, 714 of them one or two columns
 * long. A two-column wall is not a wall; a thousand of them scattered over a
 * hillside is scree. Most of that was {@link SEAM_NEIGHBOURS}' fault and is
 * fixed there — regrouping the same 2495 seam columns 8-connected gives 37
 * components, 25 of them 25 columns or longer. This constant is the guard on
 * what is left: of those 37, two are shorter than six columns.
 *
 * Six because it is {@link RETAIN_MAX}: a wall shorter than the tallest wall we
 * build is shorter than it is tall, and a masonry face taller than it is long
 * is a buttress nobody asked for. Below it the seam is graded into a bank,
 * which `structures/retaining.ts` already knows how to do.
 */
export const MIN_RETAIN_RUN = 6;

/**
 * Adjacency for grouping seam columns into one face — **8-connected**, and this
 * is the fix for the scree.
 *
 * A seam *column* is found 4-connected (a column of the lower platform sharing
 * an edge with a higher one), and that is the definition of a face and does not
 * change. But the run those columns form is a **contour**, and a contour on a
 * lattice is a staircase: along a 45° boundary consecutive lower-side columns
 * are diagonal neighbours, never edge neighbours. Grouping them 4-connected
 * therefore cuts every diagonal seam into one- and two-column crumbs — which is
 * exactly the measured 714 — and the pass then builds a stub of wall at each.
 * The wall itself never cared: `thickenCourse` makes a diagonal course
 * 4-connected before it is swept, precisely so a diagonal run is one wall.
 *
 * So the grouping is 8-connected and the crumbs become terraces.
 */
const SEAM_NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * The platform field a list of benches describes, or `null` when there is none.
 *
 * `null` rather than an all-`−1` array for the reason `benchLevels` returns
 * `null` today: the ordinary path — every form but `terraced`, and every
 * document written before this phase — allocates nothing and branches once.
 *
 * Benches keep their declaration order, so platform index *is* bench index.
 * Later benches overwrite earlier ones where they overlap, which is exactly
 * what `benchLevels` does, so overlapping benches resolve identically. A bench
 * that ends up covering no column inside `bounds` still occupies its index —
 * the index is the form's, and renumbering it would make the report lie.
 */
export function groundLevelsOf(bounds: Rect, benches: readonly FormBench[]): GroundLevels | null {
  if (benches.length === 0) return null;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  if (width <= 0 || depth <= 0) return null;
  const index = new Int32Array(width * depth).fill(NO_PLATFORM);
  for (const [platform, bench] of benches.entries()) {
    for (const run of bench.runs) {
      const x0 = Math.max(bounds.x0, run.x0);
      const x1 = Math.min(bounds.x1, run.x1);
      const z0 = Math.max(bounds.z0, run.z0);
      const z1 = Math.min(bounds.z1, run.z1);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) index[(z - bounds.z0) * width + (x - bounds.x0)] = platform;
      }
    }
  }
  const levelY = benches.map((b) => b.level);
  // Maximal horizontal runs of the *resolved* field, not of the declared
  // benches: where two benches overlap, only the winner's runs are the ground
  // that gets levelled, and a `PadEdit` list built from the declarations would
  // level the loser's columns twice, at two heights, in list order.
  const runs: Rect[][] = benches.map(() => []);
  for (let j = 0; j < depth; j++) {
    let start = -1;
    let current = NO_PLATFORM;
    for (let i = 0; i <= width; i++) {
      const here = i === width ? NO_PLATFORM : (index[j * width + i] as number);
      if (here !== current) {
        if (start >= 0 && current !== NO_PLATFORM) {
          (runs[current] as Rect[]).push({
            x0: bounds.x0 + start,
            z0: bounds.z0 + j,
            x1: bounds.x0 + i - 1,
            z1: bounds.z0 + j,
          });
        }
        start = here === NO_PLATFORM ? -1 : i;
        current = here;
      }
    }
  }
  return {
    bounds,
    index,
    levelY,
    runs,
    at(x: number, z: number): number {
      const i = x - bounds.x0;
      const j = z - bounds.z0;
      if (i < 0 || j < 0 || i >= width || j >= depth) return NO_PLATFORM;
      return index[j * width + i] as number;
    },
  };
}

/** One column of one seam, before the components are grouped. */
interface SeamCell {
  readonly key: number; // (above * platforms + below)
  readonly cell: number; // index into `levels.index`
}

/**
 * Every place two platforms touch, grouped into 8-connected components.
 *
 * A seam's `cells` are columns of the **lower** platform — the side a retaining
 * wall stands on — and a component never mixes platform pairs, so `drop` is one
 * number for the whole run. Components are returned in row-major order of their
 * first cell, and each component's cells in row-major order, so the list is a
 * pure function of the field. Natural ground (−1) is not a platform and takes
 * part in no seam: the ground it meets was never cut, so there is nothing to
 * retain.
 *
 * The `treatment` here is the *drop's* answer only. `"built"` — a building
 * already standing on the seam, whose own foundation skirt is the wall — is a
 * fact about the placements, which this module does not see; WP-B reclassifies
 * a seam it finds built over.
 */
export function levelSeams(levels: GroundLevels): readonly LevelSeam[] {
  const { bounds, index, levelY } = levels;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const platforms = levelY.length;

  // Pass 1: every lower-side column that touches a strictly higher platform,
  // keyed by the pair. One column may touch two different upper platforms and
  // is then a member of two seams, which is correct: two walls meet there.
  const cells = new Map<number, number[]>();
  const mark = (k: number, above: number, below: number): void => {
    const key = above * platforms + below;
    let list = cells.get(key);
    if (list === undefined) {
      list = [];
      cells.set(key, list);
    }
    list.push(k);
  };
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const here = index[k] as number;
      if (here === NO_PLATFORM) continue;
      const hy = levelY[here] as number;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
        const n = index[jj * width + ii] as number;
        if (n === NO_PLATFORM || n === here) continue;
        const ny = levelY[n] as number;
        // Strictly higher only. Two platforms at the same Y are two platforms
        // and no step, so there is no face between them to build.
        if (ny > hy) mark(k, n, here);
      }
    }
  }
  if (cells.size === 0) return [];

  // Pass 2: 8-connected components within each pair, so one seam is one run of
  // wall — see SEAM_NEIGHBOURS for why the diagonal is not optional. `member`
  // is rebuilt per pair rather than shared, which keeps the grouping
  // independent of the order the pairs were discovered in.
  const out: LevelSeam[] = [];
  const keys = [...cells.keys()].sort((a, b) => a - b);
  for (const key of keys) {
    const list = cells.get(key) as number[];
    const above = Math.floor(key / platforms);
    const below = key % platforms;
    const drop = (levelY[above] as number) - (levelY[below] as number);
    const member = new Set(list);
    const seen = new Set<number>();
    const ordered = [...list].sort((a, b) => a - b);
    for (const start of ordered) {
      if (seen.has(start)) continue;
      const queue = [start];
      seen.add(start);
      const component: number[] = [];
      for (let head = 0; head < queue.length; head++) {
        const k = queue[head] as number;
        component.push(k);
        const i = k % width;
        const j = (k - i) / width;
        for (const [di, dj] of SEAM_NEIGHBOURS) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
          const n = jj * width + ii;
          if (!member.has(n) || seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      component.sort((a, b) => a - b);
      out.push({
        above,
        below,
        cells: component.map((k) => ({
          x: bounds.x0 + (k % width),
          z: bounds.z0 + Math.floor(k / width),
        })),
        drop,
        treatment: treatmentForSeam(drop, component.length),
      });
    }
  }
  // Row-major by first cell, then by the pair, so the list is stable under any
  // change to the order the pairs happened to be discovered in.
  out.sort((a, b) => {
    const ac = a.cells[0] as Point2;
    const bc = b.cells[0] as Point2;
    if (ac.z !== bc.z) return ac.z - bc.z;
    if (ac.x !== bc.x) return ac.x - bc.x;
    if (a.above !== b.above) return a.above - b.above;
    return a.below - b.below;
  });
  return out;
}

/** §3.4's table, drop → treatment. */
export function treatmentForDrop(drop: number): SeamTreatment {
  if (drop <= 1) return "kerb";
  if (drop <= RETAIN_MAX) return "retaining";
  return "bank";
}

/**
 * §3.4's table with the run length in it: drop **and** length → treatment.
 *
 * The drop decides what the face *is*; the length decides whether it is worth
 * building. A retaining wall shorter than {@link MIN_RETAIN_RUN} is graded into
 * a bank instead — the same treatment a drop past {@link RETAIN_MAX} gets, and
 * for the same reason: what would be built there would not read as built. A
 * kerb keeps its length-independent answer, because a kerb is one course of
 * material on the ground and two columns of it is a doorstep, not scree.
 */
export function treatmentForSeam(drop: number, run: number): SeamTreatment {
  // **One table.** This is `treatmentForEdge` asked with no context at all —
  // no land pressure, no available run, unlimited depth, unlimited budget, the
  // fill side — and the two cannot disagree because there is only one of them
  // (`docs/SITE-PLAN-v0.md` §5.1, and §10's "one table, proven to be one
  // table"). The one thing a bare seam cannot do is `"replan"`: there is no
  // planner still running to narrow, merge or dissolve the terrace that claimed
  // the ground, so the answer collapses to the bank it always was.
  const chosen = treatmentForEdge(seamContext(drop, run));
  return chosen === "replan" ? "bank" : chosen;
}

/* -------------------------------------------------------------------------- */
/* §5 — transitions by context, not by drop alone                              */
/* -------------------------------------------------------------------------- */

/**
 * Run a graded bank reserves, in columns, for a drop of `drop`
 * (`docs/SITE-PLAN-v0.md` §3.8's `BANK_RUN`).
 *
 * Two columns per block of difference — the ratio `LevelPad.adaptiveApron`
 * already uses and which was measured to read as a ramp rather than as a cut.
 * This is what §5.2 rule 3 asks `availableRun` about, and it is deliberately
 * the **smooth** ramp's run: {@link BENCH_FACE} builds the bank as benches and
 * gets there in fewer columns, so a rule that grants a bank on `BANK_RUN` is
 * granting one the geometry can always afford.
 */
export function bankRun(drop: number): number {
  return 2 * drop;
}

/**
 * Blocks of face per bench of a **benched** bank, and the answer to a face
 * taller than {@link RETAIN_MAX} (`docs/SITE-PLAN-v0.md` §5.2 rule 5).
 *
 * A drop past the tallest wall we build is not a dressing problem — §5 says the
 * planner should narrow, merge or dissolve — but the retaining pass runs eight
 * passes downstream of the planner and still has to put *something* there, and
 * what it used to put there was a 1:1 ramp: seven blocks of fall over seven
 * columns, which is a 45° face of raw earth and reads from below as the cliff
 * the wall refused to be.
 *
 * So the bank is **benched**: faces of two blocks with {@link BENCH_TREAD}
 * columns of soil between them. Two, because one block is a kerb — a course you
 * step up, not a face — and three is a scramble; and because four benches of two
 * is what a seven-block drop wants.
 */
export const BENCH_FACE = 2;

/**
 * Columns of soil between two faces of a benched bank.
 *
 * Two: enough to stand on, enough for the planting hooks a terraced bank wants,
 * and it makes the whole bank `ceil(drop / BENCH_FACE) · BENCH_TREAD` columns —
 * eight for a seven-block drop, against {@link bankRun}'s fourteen. A benched
 * bank is therefore *cheaper* in ground than the smooth ramp §3.8 sizes, which
 * is measured rather than assumed and is written up in `docs/SITE-PLAN-v0.md`
 * §5.2's WP-3 amendment.
 */
export const BENCH_TREAD = 2;

/** Columns of run a benched bank of `drop` reserves. */
export function benchedRun(drop: number): number {
  return Math.ceil(Math.max(drop, 1) / BENCH_FACE) * BENCH_TREAD;
}

/**
 * How close a use has to be to an edge to count as **land pressure**
 * (`docs/SITE-PLAN-v0.md` §5.2 rule 3).
 *
 * "A carriageway, sidewalk, plaza or lot rectangle within two columns of the
 * edge", which is the operational meaning of the thing that makes a wall
 * earned: a bank spreads and a wall does not, so what buys masonry is somebody
 * needing the ground the bank would spread over.
 */
export const WALL_DEMAND_RANGE = 2;

/**
 * The shallowest platform worth keeping once a transition has taken its run —
 * `district.ts`'s `MIN_INFILL_SIDE`, restated here for the reason
 * `forms/hillside.ts` restates it as `MIN_BUILDABLE_DEPTH`: this module sits
 * upstream of both. `site-plan-transitions.test.ts` asserts the three cannot
 * drift apart.
 */
export const MIN_EDGE_DEPTH = 7;

/** What a use adjacent to an edge is, for §5.2 rule 3. */
export type EdgeUse = "street" | "lot" | "civic" | "natural";

/** Everything a planned edge knows about itself (`docs/SITE-PLAN-v0.md` §5.1). */
export interface EdgeContext {
  /** Blocks of fall across the face. */
  readonly drop: number;
  /** Columns of the edge, 8-connected. */
  readonly run: number;
  /** Unclaimed columns beyond it, on the side a bank would be graded into. */
  readonly availableRun: number;
  readonly adjacentUse: EdgeUse;
  readonly access: "public" | "private";
  /** Platform depth left once the treatment reserves its run. */
  readonly depthAfter: number;
  /** §5.4: the fill edge is the downhill one, the cut edge the uphill one. */
  readonly side: "cut" | "fill";
  /** Columns of wall the district has left to spend. */
  readonly budget: number;
  /**
   * Share of the face already standing under a building, `0`…`1` (§5.2 rule 2).
   *
   * A fraction rather than a flag because a seam clipped at one end by the
   * corner of a house is still a seam and still wants its wall, while a seam a
   * terrace stands along the length of is that terrace's own foundation skirt:
   * the threshold is `structures/retaining.ts`'s `RETAIN_BUILT_SHARE`, which
   * this restates as {@link BUILT_SHARE} so the decision and the pass that
   * discovers it agree.
   */
  readonly builtShare: number;
  /**
   * Share of the face with a street or a lot within {@link WALL_DEMAND_RANGE} on
   * the side a bank would spread over, `0`…`1`.
   *
   * **§5.2 states `adjacentUse` as one word per edge and that is too coarse to
   * carry rule 3**, which is the second thing WP-3 measured. A terrace's
   * downhill face is one 8-connected component a hundred and ninety columns
   * long; one stair-alley descending past it puts street within two columns of
   * six of those, and asked as a yes/no the whole face becomes "under land
   * pressure" and is walled end to end. That is the fortress the inversion
   * exists to stop. So `adjacentUse` names *what* presses and this names *how
   * much of the edge* it presses on, and rule 3 reads both.
   */
  readonly pressedShare: number;
  /**
   * Whether rule 5 may answer a tall fill face with a **tier stack** (S2) rather
   * than with `"replan"`.
   *
   * Defaults to {@link SEAM_TIERS}, the compile-time flag 11F flips on Kai's
   * walk verdict. The field exists for the reason `PlatformInput.tiered` exists
   * one file over: a test must be able to exercise the flag-on answer without
   * flipping a constant the whole compiler reads, and a caller that wants the
   * shipped answer says nothing.
   */
  readonly tiered?: boolean;
}

/** §5.2 rule 2's threshold — `structures/retaining.ts`'s `RETAIN_BUILT_SHARE`. */
export const BUILT_SHARE = 0.5;

/**
 * How much of a face has to be under land pressure before the whole face is
 * (§5.2 rule 3, as WP-3 amends it).
 *
 * A quarter. `BUILT_SHARE` is a half because a building either is the wall or is
 * clipping the end of one; pressure is different in kind — a stair-alley
 * descending past a hundred-and-ninety-column terrace face puts street within
 * two columns of six of them, and a yes/no reading of that walls the face end to
 * end. A quarter of the run is the point at which the ground beyond the face is
 * being *used* rather than crossed.
 */
export const EDGE_PRESSED_SHARE = 0.25;

/* -------------------------------------------------------------------------- */
/* the tier stack — `docs/GROUND-UNIFICATION-v0.md` §4.1 S2–S5, §4.2           */
/* -------------------------------------------------------------------------- */

/**
 * The tallest **face** one tier of a stack presents — {@link RETAIN_MAX}, under
 * the name S2 gives it.
 *
 * > **`RETAIN_MAX` is a ceiling on a face, not on a drop.** (S2)
 *
 * The number is unchanged and means exactly what `RETAIN_MAX`'s own comment
 * always said it meant: the tallest masonry face that reads as *built* rather
 * than as a cliff with a coping on it. What changes is the question it answers.
 * It used to answer *"is this drop buildable"*, and a drop past it fell through
 * to a 45° ramp of raw earth (§4.0a M3); it now answers *"how tall may one face
 * of the stack be"*, and the drop is served by as many faces as it takes.
 */
export const SEAM_TIER_FACE = RETAIN_MAX;

/**
 * How many faces a stack may have (§4.1 S3).
 *
 * > **A seam whose drop needs more than three faces is not served by a taller
 * > stack; it is fed back to the level election, which gives one of the two
 * > platforms its level back.**
 *
 * Three, so the stack serves eighteen blocks — "a three-storey retained face,
 * and the most a town builds without becoming a dam". Every one of Troy's
 * tallDrop seams is a drop of 8 or 9 (§4.0), which is two tiers, so three is the
 * measured answer with room to spare.
 *
 * **Pinned, not measured: §10.6's recommendation, and Kai's on the 11F walk** —
 * three tiers (18 blocks) or two (12); two dissolves more levels and ships
 * flatter quarters. It is one constant and one recompile.
 *
 * `layout/platforms.ts` carries a module-local copy of this number
 * (`DISSOLVE_DROP_MAX = SEAM_TIER_MAX · RETAIN_MAX`) written by wave 11C before
 * this export existed, with a comment saying to replace it with the import the
 * moment it does. It does, and the two agree by test.
 */
export const SEAM_TIER_MAX = 3;

/**
 * Columns of **tread** between two faces of a `terraced` stack (§4.1 S4).
 *
 * Three, not {@link BENCH_TREAD}'s two: "two columns of soil between two faces
 * of earth is a bank profile, and a tread you are meant to stand on with a
 * two-column balustraded ledge is a parapet walk nobody asked for. Three is the
 * width the flora pass can plant and a body can turn on."
 *
 * **Pinned, not measured: §10.7's recommendation** — 3 with {@link SEAM_SETBACK}
 * 1, and the pair is the whole of the hill-town-vs-citadel look. Both are Kai's
 * on the 11F walk.
 */
export const SEAM_TREAD = 3;

/**
 * Columns of **setback** between two faces of a `revetted` stack (§4.1 S5).
 *
 * One: "one column of setback per tier is what makes a battered wall read as one
 * wall rather than as a staircase" (§10.7). It is also what makes the revetted
 * dressing the structural fallback S5 needs — a stack of `n` tiers costs
 * `n · (1 + SEAM_SETBACK)` columns of run against the terraced stack's
 * `n · (1 + SEAM_TREAD)`, so the geometry never fails for want of ground, it
 * only changes what it is made of.
 */
export const SEAM_SETBACK = 1;

/**
 * How a stack is dressed (§4.1 S5) — **one arithmetic, two dressings**.
 *
 * - `"revetted"` — {@link SEAM_SETBACK}-column setbacks, and the stack reads as
 *   one battered wall. What a citadel face pressed on both sides by construction
 *   gets, which is what a great wall with setbacks is.
 * - `"terraced"` — {@link SEAM_TREAD} columns of the theme's `ground.bank` earth
 *   per tread, plantable, and the stack reads as a hill town's terraces. What a
 *   mid-town face with open hillside beyond it gets.
 */
export type SeamDressing = "revetted" | "terraced";

/** One face of a stack, and the ground behind it. */
export interface SeamTier {
  /** Blocks of fall this tier's face presents. Never past {@link SEAM_TIER_FACE}. */
  readonly face: number;
  /** Columns of the tier's own ground behind the face — the dressing's tread. */
  readonly tread: number;
}

/**
 * Faces a drop of `drop` needs — S2's `ceil(drop / RETAIN_MAX)`, and the only
 * quantity {@link SEAM_TIER_MAX} is ever compared against. Dressing-independent:
 * how tall the faces are is arithmetic, what they are made of is S5.
 */
export function tierCountOf(drop: number): number {
  return drop <= 0 ? 0 : Math.ceil(drop / SEAM_TIER_FACE);
}

/** Columns of tread a dressing spends per tier. */
export function treadOf(dressing: SeamDressing): number {
  return dressing === "revetted" ? SEAM_SETBACK : SEAM_TREAD;
}

/**
 * Columns of run a stack of `tiers` tiers reserves, as S5 prices it:
 * `tiers · (1 + tread)` — one column of face plus the tread behind it, per tier.
 *
 * The construction spends at most this (its topmost tread is the upper platform
 * the stack holds, which the stack does not have to buy), so a stack that fits
 * this budget always fits.
 */
export function tieredRun(tiers: number, dressing: SeamDressing): number {
  return tiers * (1 + treadOf(dressing));
}

/**
 * A drop, as the stack that serves it — §4.2's arithmetic, verbatim.
 *
 * ```
 * n     = ceil(drop / RETAIN_MAX)              // S2
 * if n > SEAM_TIER_MAX -> "replan"             // S3
 * faces = drop split as evenly as possible, tallest at the BOTTOM
 * tread = revetted ? SEAM_SETBACK : SEAM_TREAD // S5
 * ```
 *
 * **Tallest at the bottom** because that is how a retained hillside is actually
 * built and how it reads: the load is at the base. A drop of 8 comes back as
 * faces of 4 and 4; a drop of 11 as 6 and 5; a drop of 14 as 5, 5, 4.
 *
 * Index 0 is the **bottom** tier, so the tier levels are a running sum from the
 * lower platform's floor and the last one lands exactly on the upper platform.
 *
 * `"replan"` past {@link SEAM_TIER_MAX} tiers is S3: the answer is not a taller
 * stack, it is that the *election* was wrong, and `layout/platforms.ts`'s
 * dissolve rule is the caller that can act on it.
 */
export function tiersOf(drop: number, dressing: SeamDressing): readonly SeamTier[] | "replan" {
  if (drop <= 0) return [];
  const n = tierCountOf(drop);
  if (n > SEAM_TIER_MAX) return "replan";
  const tread = treadOf(dressing);
  const base = Math.floor(drop / n);
  // The remainder, spent one block at a time from the bottom up: that is what
  // "as evenly as possible, tallest at the bottom" means as arithmetic, and it
  // keeps every face within one block of every other.
  const tall = drop % n;
  const out: SeamTier[] = [];
  for (let k = 0; k < n; k++) out.push({ face: k < tall ? base + 1 : base, tread });
  return out;
}

/**
 * Which dressing a stack gets — S5's choice, and the *only* thing that differs
 * between a citadel's great wall and a hill town's terraces.
 *
 * Two clauses, in order:
 *
 * 1. **Pressure.** At or above {@link EDGE_PRESSED_SHARE} the ground beyond the
 *    face is being used rather than crossed, so the stack is `revetted`. This is
 *    the same threshold and the same argument rule 3 already makes about walls
 *    against banks, one construction over.
 * 2. **Room.** Below it the stack wants to be `terraced`, and a terraced stack
 *    needs {@link tieredRun}'s columns of hillside to step down. Where
 *    `availableRun` cannot pay, the stack is `revetted` instead — S5's
 *    structural fallback, which is why the geometry never fails for want of
 *    ground.
 */
export function seamDressing(
  pressedShare: number,
  availableRun: number,
  tiers: number,
): SeamDressing {
  if (pressedShare >= EDGE_PRESSED_SHARE) return "revetted";
  return availableRun >= tieredRun(tiers, "terraced") ? "terraced" : "revetted";
}

/** A treatment, or the planner's instruction to go back and claim less ground. */
export type EdgeChoice = SeamTreatment | "replan";

/**
 * `docs/SITE-PLAN-v0.md` §5.2's decision order, and the whole of WP-3.
 *
 * > **Transitions by context, not by drop alone.**
 *
 * The drop table is still here — it is rules 1, 5 and 9 — and what surrounds it
 * is everything else the edge knows: how much room there is beyond it, what is
 * pressing on it, whether anybody can walk up to it, what the platform has left
 * after the treatment is paid for, which side of the cut it is, and what the
 * district can still afford in masonry.
 *
 * **Rule 3 is the inversion.** Today a long seam becomes a wall because it is
 * long; here it becomes a wall because something is pressing on it. A mid-town
 * seam with hillside beyond it and nothing needing that hillside is a terraced
 * bank, which is stepped earth you can plant, and that is the answer to a walk
 * that reported sheer platform-to-platform dropoffs mid-town.
 *
 * **Rule 7 is the ration.** Masonry is a budget the district spends, so the
 * walls end up where the town actually presses on the hill rather than
 * everywhere the contour happens to be long.
 *
 * **Rules 5 and 6 return `"replan"`** — a face taller than any wall we build, or
 * a terrace with no usable depth left once its transition is paid for, is a
 * terrace that claimed ground it should not have. A caller with a planner still
 * running acts on it; a caller downstream of the planner maps it to a benched
 * bank ({@link BENCH_FACE}) and says so.
 */
export function treatmentForEdge(ctx: EdgeContext): EdgeChoice {
  // **The unbuilt answer, and the one word §5.2 was missing.** Three of its
  // clauses — 4, 5 and 7 — mean "do not build here, let the ground be ground",
  // and §5.2 spells all three `"bank"`. That is right on the fill side and
  // impossible on the cut side: a bank is ground *added* against a face, while
  // grading a cut back into the hill is ground *removed*, and the only pass
  // that removes ground is the terrace claim itself. So the unbuilt answer is
  // the bank downhill and the hill's own rock uphill. This amends §5.2 and
  // §5.4 — WP-3's note there records the measurement.
  const soft: SeamTreatment = ctx.side === "fill" ? "bank" : "rock";
  // 1. A single block of step is something you walk up.
  if (ctx.drop <= 1) return "kerb";
  // 2. A building already standing on the face: its own foundation skirt is the
  //    wall, and a second wall in front of it is a second wall.
  if (ctx.builtShare >= BUILT_SHARE) return "built";
  // 3. **A bank is the default where there is space.** Nothing is pressing on
  //    this edge and the hill beyond it is unclaimed, so the ground is graded.
  //    Fill side only, for the reason `soft` gives.
  if (
    ctx.side === "fill" &&
    ctx.availableRun >= bankRun(ctx.drop) &&
    ctx.pressedShare <= EDGE_PRESSED_SHARE
  ) {
    return "bank";
  }
  // 4. A wall shorter than the tallest wall we build is a buttress nobody asked
  //    for — `MIN_RETAIN_RUN`'s own argument, unchanged.
  if (ctx.run < MIN_RETAIN_RUN) return soft;
  // 5. Taller than any wall we build — **one face**. A fill face this tall is
  //    served by a stack of them (S2): `ceil(drop / RETAIN_MAX)` faces, none
  //    past the ceiling, with a tread between. Only past `SEAM_TIER_MAX` tiers
  //    is the answer that the *election* was wrong, which is what `"replan"`
  //    has always meant and now finally has a caller for (S3). A cut face this
  //    tall is a cliff, which is what a hillside is made of, and is unchanged.
  if (ctx.drop > RETAIN_MAX) {
    if (ctx.side !== "fill") return soft;
    if ((ctx.tiered ?? SEAM_TIERS) && tierCountOf(ctx.drop) <= SEAM_TIER_MAX) return "tiered";
    return "replan";
  }
  // 6. No terrace left once the transition has taken its run.
  if (ctx.depthAfter < MIN_EDGE_DEPTH) return "replan";
  // 7. The district has spent its masonry.
  if (ctx.budget <= 0) return soft;
  // 8. An uphill cut nothing is pressing against is the hill, and the hill is
  //    rock (§5.4).
  if (ctx.side === "cut" && ctx.adjacentUse !== "street" && ctx.adjacentUse !== "lot") {
    return "rock";
  }
  // 9. Somebody is pressing on this edge and it is a face we can build.
  return "retaining";
}

/**
 * The context a bare drop-and-run seam carries: none.
 *
 * Exported so a test can state §10's property — *"`treatmentForEdge` reduces to
 * `treatmentForSeam` when the context carries no land pressure, no available run
 * and an unlimited budget"* — without restating the object it reduces through.
 */
export function seamContext(drop: number, run: number): EdgeContext {
  return {
    drop,
    run,
    availableRun: 0,
    adjacentUse: "lot",
    access: "public",
    depthAfter: Number.POSITIVE_INFINITY,
    side: "fill",
    budget: Number.POSITIVE_INFINITY,
    builtShare: 0,
    pressedShare: 1,
  };
}
