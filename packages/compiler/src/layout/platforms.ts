/**
 * **Platforms from blocks** — `docs/COURTYARDS-AND-LEVELS-v0.md` §3.3.
 *
 * `terraced` cuts its own benches from the contours. Every other form cuts
 * none, so under `params.ground: "stepped"` the fabric pass has to derive them,
 * and the construction is deliberately *not* contour-led — contours are
 * `terraced`'s idea and this has to work under `grid`, `grown` and `radial`
 * too:
 *
 * 1. **The platform is the block.** Blocks are already the connected components
 *    of the ground the carriageway and its verge did not take, so a block
 *    boundary is already a street and a street already grades itself. Every
 *    block is levelled to its own **median** natural height.
 * 2. **Quantise to a storey.** `levelY = base + round((median − base) /
 *    FLOOR_HEIGHT) · FLOOR_HEIGHT`. Neighbouring blocks therefore differ by
 *    whole storeys, so a cornice line and a party wall step cleanly rather than
 *    by three blocks. It is the same number `BENCH_HEIGHT` encodes and for the
 *    same reason.
 * 3. **Split a block that cannot be one platform.** A block whose own relief
 *    exceeds `FLOOR_HEIGHT` is cut by the same construction `terraced` uses —
 *    a 5-column box blur applied twice, then a bucket per storey — and each
 *    4-connected piece of a bucket is a platform of its own. That is the
 *    split-level block, and it costs no new algorithm.
 * 4. **Blocks are re-derived after step 3.** Not here: the caller puts the
 *    seams into `blocked` before `blocksOf` runs, which is the one line the
 *    rest of §3 rests on.
 *
 * Nothing in this file is random and nothing reads a clock: the blur is an
 * integer box filter, every component walk is row-major, and every list comes
 * back in the order the field produced it. Same field in, same benches out.
 */

import type { HeightField } from "@terrainist/stdlib";

import { FLOOR_HEIGHT } from "./district.js";
import type { Rect } from "./frames.js";
import type { FormBench } from "./forms/types.js";
import { maskRuns } from "./masks.js";

/** Half-width of the box blur applied before a block is split, in columns. */
const SMOOTH_RADIUS = 2;

/** How many times the blur is applied. The same two passes `terraced` uses. */
const SMOOTH_PASSES = 2;

/**
 * Columns a derived platform must hold to be worth having.
 *
 * A sliver of a bucket at the corner of a block is not a terrace, it is a
 * rounding artefact of the blur, and levelling it would put a two-column step
 * in the middle of a garden. A fragment below this keeps its natural ground —
 * `NO_PLATFORM` — so it is founded the way it was before this phase and takes
 * part in no seam.
 */
export const MIN_PLATFORM_COLUMNS = 9;

/** Everything {@link derivePlatforms} reads. */
export interface PlatformInput {
  /** The quarter's footprint; `blocked` is row-major over it. */
  readonly bounds: Rect;
  /** 1 where the ground is street, verge, reservation or outside the cell. */
  readonly blocked: Uint8Array;
  /** The **natural** field — a `"stepped"` quarter is not pad-levelled. */
  readonly field: HeightField;
}

/**
 * The platforms a quarter's blocks describe, as benches.
 *
 * `FormBench` is the wire format on purpose (§3.1): a derived platform and a
 * declared one are the same thing to everything downstream, so `groundLevelsOf`
 * needs no second entry point and `foundationY` needs no second branch.
 *
 * Returns an empty list when the ground under the quarter is flat enough that
 * every block quantises to one storey — one platform is no platform, and the
 * caller reports `DISTRICT_GROUND` rather than shipping a `"stepped"` quarter
 * that stepped nowhere.
 */
export function derivePlatforms(input: PlatformInput): FormBench[] {
  const { bounds, blocked, field } = input;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const cells = width * depth;
  if (cells <= 0 || blocked.length < cells) return [];

  const region = field.region;
  const heightAt = (k: number): number => {
    const x = bounds.x0 + (k % width);
    const z = bounds.z0 + Math.floor(k / width);
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return 0;
    return Math.round(field.values[j * region.width + i] as number);
  };

  // The quarter's datum: the lowest column any block stands on. Measured over
  // the *free* ground only, so a street cut down to a river does not drag the
  // whole quantisation with it.
  let base = Number.POSITIVE_INFINITY;
  for (let k = 0; k < cells; k++) {
    if (blocked[k] === 1) continue;
    const h = heightAt(k);
    if (h < base) base = h;
  }
  if (base === Number.POSITIVE_INFINITY) return [];

  const raw = new Float64Array(cells);
  for (let k = 0; k < cells; k++) raw[k] = heightAt(k);
  const smooth = boxBlur(raw, width, depth, SMOOTH_RADIUS, SMOOTH_PASSES);

  const benches: FormBench[] = [];
  const seen = new Uint8Array(cells);
  for (let start = 0; start < cells; start++) {
    if (blocked[start] === 1 || seen[start] === 1) continue;
    const block = component(start, cells, width, depth, seen, (k) => blocked[k] !== 1);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const k of block) {
      const h = heightAt(k);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    if (hi - lo <= FLOOR_HEIGHT) {
      push(benches, bounds, block, storey(base, medianOf(block, heightAt)), `block.${start}`);
      continue;
    }
    // Split. The bucket is the blurred storey, and each 4-connected piece of a
    // bucket is its own platform: two lobes of one bucket either side of a
    // ridge are two terraces, not one with a hole in it.
    const bucket = new Int32Array(cells).fill(-1);
    for (const k of block) {
      bucket[k] = Math.floor((Math.round(smooth[k] as number) - base) / FLOOR_HEIGHT);
    }
    const inner = new Uint8Array(cells);
    for (const k of block) inner[k] = 1;
    const split = new Uint8Array(cells);
    for (const k of block) {
      if (split[k] === 1) continue;
      const b = bucket[k] as number;
      const piece = component(k, cells, width, depth, split, (n) => inner[n] === 1 && bucket[n] === b);
      if (piece.length < MIN_PLATFORM_COLUMNS) continue;
      push(benches, bounds, piece, storey(base, medianOf(piece, heightAt)), `block.${start}.${b}`);
    }
  }

  // One platform is no platform: it is a pad with extra words, and the caller
  // says so with `DISTRICT_GROUND` rather than building a seamless "stepped"
  // quarter. Two platforms at one level are the same statement.
  const distinct = new Set(benches.map((b) => b.level));
  if (distinct.size <= 1) return [];
  return benches;
}

/** §3.3 step 2: a median, quantised to whole storeys above the quarter's base. */
function storey(base: number, median: number): number {
  return base + Math.round((median - base) / FLOOR_HEIGHT) * FLOOR_HEIGHT;
}

function medianOf(cells: readonly number[], heightAt: (k: number) => number): number {
  const heights = cells.map(heightAt).sort((a, b) => a - b);
  return heights[heights.length >> 1] as number;
}

function push(
  out: FormBench[],
  bounds: Rect,
  cells: readonly number[],
  level: number,
  id: string,
): void {
  const mask = new Uint8Array((bounds.x1 - bounds.x0 + 1) * (bounds.z1 - bounds.z0 + 1));
  for (const k of cells) mask[k] = 1;
  const runs = maskRuns(bounds, mask);
  if (runs.length === 0) return;
  out.push({ id, runs, level });
}

/** 4-connected component from `start`, row-major, marking `seen` as it goes. */
function component(
  start: number,
  cells: number,
  width: number,
  depth: number,
  seen: Uint8Array,
  member: (k: number) => boolean,
): number[] {
  const out: number[] = [];
  if (seen[start] === 1 || !member(start)) return out;
  seen[start] = 1;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    out.push(k);
    const i = k % width;
    const j = (k - i) / width;
    for (const [di, dj] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
      const n = jj * width + ii;
      if (n < 0 || n >= cells || seen[n] === 1 || !member(n)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * A separable box blur, `passes` times, clamped at the edge.
 *
 * Integer window, no transcendentals, no RNG: the same field in gives the same
 * field out on every runtime, which is the determinism law stated in code. It
 * is `terraced`'s blur, re-stated rather than imported, because that one is
 * private to a form and this file is not allowed to reach into one.
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
