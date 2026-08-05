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

/** How the ground gets from one platform down to the next. */
export type SeamTreatment = "kerb" | "retaining" | "bank" | "built";

/** Where two platforms touch, and how the ground gets between them. */
export interface LevelSeam {
  readonly above: number; // platform index
  readonly below: number;
  /** The columns of `below` that touch `above`, 4-connected, in a fixed order. */
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
 * Every place two platforms touch, grouped into 4-connected components.
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

  // Pass 2: 4-connected components within each pair, so one seam is one run of
  // wall. `member` is rebuilt per pair rather than shared, which keeps the
  // grouping independent of the order the pairs were discovered in.
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
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
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
        treatment: treatmentForDrop(drop),
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
