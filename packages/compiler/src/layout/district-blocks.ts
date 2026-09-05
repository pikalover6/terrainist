import { note } from "@terrainist/spec";
import type { DistrictDensity } from "@terrainist/spec/ir";
import type { LoamDiagnostic } from "@terrainist/spec";
import type { Rect, Point2 } from "./frames.js";
import { STREET_WIDTH, carriagewayCells } from "./streets.js";
import type { StreetGraph, StreetSegment } from "./streets.js";
import { Grid, dilateGrid } from "./district-grid.js";
import { LOT_DEPTH, MIN_INFILL_SIDE, STREET_PROBE_SLACK } from "./district-constants.js";
import type { LevelSeam } from "./levels.js";

/**
 * Widest a **leaf** block may be across its short axis before an alley is cut
 * through it — and the number is **measured**, not derived from taste.
 */
export function leafBlockCap(density: DistrictDensity, sidewalkWidth: number): number {
  return 2 * (2 * LOT_DEPTH[density] + 2) + STREET_WIDTH.lane + 2 * sidewalkWidth;
}

/**
 * Rounds of alley cutting.
 *
 * One round halves a block's short axis, so from the widest leaf any form can
 * produce — under `2 · blockSize`, and `blockSize` is bounded by the profile —
 * two rounds already reach the cap. Three is slack; it is a termination bound
 * rather than a shape decision, and the pass stops on its own as soon as a
 * round finds nothing to cut.
 */
export const MAX_ALLEY_ROUNDS = 3;

/**
 * Built ground per column of block land, under which a **walled** quarter is
 * reported (`LOAM-W527`).
 */
export const WALLED_COVERAGE_FLOOR = 0.5;

/** One face of the street graph: the ground between the streets. */
export interface Block {
  readonly rect: Rect;
  readonly columns: number;
}

/** Connected components of the unclaimed ground, in row-major discovery order. */
export function blocksOf(grid: Grid, blocked: Uint8Array, split: boolean): Block[] {
  const seen = new Uint8Array(grid.cells);
  const out: Block[] = [];
  const stack: number[] = [];
  const member = new Uint8Array(grid.cells);
  const flooded: number[] = [];

  for (let start = 0; start < grid.cells; start++) {
    if (blocked[start] === 1 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    for (const k of flooded) member[k] = 0;
    flooded.length = 0;
    member[start] = 1;
    flooded.push(start);
    let x0 = grid.x(start);
    let x1 = x0;
    let z0 = grid.z(start);
    let z1 = z0;
    let columns = 0;

    while (stack.length > 0) {
      const k = stack.pop() as number;
      columns++;
      const x = grid.x(k);
      const z = grid.z(k);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      for (const [dx, dz] of NEIGHBOURS) {
        const n = grid.index(x + dx, z + dz);
        if (n < 0 || seen[n] === 1 || blocked[n] === 1) continue;
        seen[n] = 1;
        member[n] = 1;
        flooded.push(n);
        stack.push(n);
      }
    }
    if (!split) {
      const rect = largestFreeRect(grid, member, { x0, z0, x1, z1 });
      if (rect === null) continue;
      if (Math.min(rect.x1 - rect.x0 + 1, rect.z1 - rect.z0 + 1) < MIN_INFILL_SIDE) continue;
      out.push({ rect, columns });
      continue;
    }
    for (const rect of rectsOf(grid, member, { x0, z0, x1, z1 })) {
      out.push({ rect, columns: (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1) });
    }
  }
  return out;
}

/** What the alley pass added, and what it had to work with. */
export interface AlleyPass {
  /** The lanes cut, in the order they were cut. Empty is the ordinary case. */
  readonly lanes: readonly StreetSegment[];
  /** Rounds that found something to cut. 0 for every quarter under the cap. */
  readonly rounds: number;
}

/**
 * Cut an alley through every block too deep to be rim frontage — {@link leafBlockCap}.
 *
 * The alley is a **real street**, not a gap, appended to the quarter's own graph.
 * Deterministic: blocks arrive in row-major discovery order, the cut is the
 * block's own middle column, and the pass stops when a round finds nothing.
 */
export function cutDeepBlocks(args: {
  readonly grid: Grid;
  /** Mutated: the alley's carriageway is added. */
  readonly carriageway: Uint8Array;
  /** Mutated in place, and the caller's `sidewalk` is replaced from it. */
  readonly blocked: Uint8Array;
  readonly split: boolean;
  readonly density: DistrictDensity;
  readonly sidewalkWidth: number;
  readonly bounds: Rect;
}): AlleyPass & { readonly sidewalk: Uint8Array | null } {
  const { grid, carriageway, blocked, split, density, sidewalkWidth, bounds } = args;
  const cap = leafBlockCap(density, sidewalkWidth);
  const lanes: StreetSegment[] = [];
  let sidewalk: Uint8Array | null = null;
  let rounds = 0;

  for (let round = 0; round < MAX_ALLEY_ROUNDS; round++) {
    const cuts: StreetSegment[] = [];
    for (const [k, block] of blocksOf(grid, blocked, split).entries()) {
      const width = block.rect.x1 - block.rect.x0 + 1;
      const depth = block.rect.z1 - block.rect.z0 + 1;
      if (Math.min(width, depth) <= cap) continue;
      const path = alleyThrough(block.rect, grid, carriageway, sidewalkWidth);
      if (path === null) continue;
      cuts.push({
        id: `alley${round}_${k}`,
        kind: "lane",
        width: STREET_WIDTH.lane,
        path,
      });
    }
    if (cuts.length === 0) break;
    rounds++;
    lanes.push(...cuts);
    for (const cell of carriagewayCells({ segments: cuts, intersections: [], sidewalk: sidewalkWidth }, bounds)) {
      const k = grid.index(cell.x, cell.z);
      if (k >= 0) carriageway[k] = 1;
    }
    sidewalk = dilateGrid(grid, carriageway, sidewalkWidth);
    for (let k = 0; k < grid.cells; k++) {
      if (carriageway[k] === 1 || sidewalk[k] === 1) blocked[k] = 1;
    }
  }

  return { lanes, rounds, sidewalk };
}

/**
 * The alley's centre line through one block rectangle, or `null`.
 *
 * Parallel to the block's **long** axis at the middle of its short one.
 */
function alleyThrough(
  rect: Rect,
  grid: Grid,
  paved: Uint8Array,
  sidewalkWidth: number,
): Point2[] | null {
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  const shortIsX = width <= depth;
  const at = shortIsX
    ? Math.floor((rect.x0 + rect.x1) / 2)
    : Math.floor((rect.z0 + rect.z1) / 2);
  const limit = sidewalkWidth + STREET_PROBE_SLACK;

  const reach = (from: number, step: -1 | 1): number => {
    let last = from;
    for (let n = 1; n <= limit; n++) {
      const along = from + step * n;
      const k = shortIsX ? grid.index(at, along) : grid.index(along, at);
      if (k < 0) return last;
      last = along;
      if (paved[k] === 1) return along;
    }
    return last;
  };

  const lo = reach(shortIsX ? rect.z0 : rect.x0, -1);
  const hi = reach(shortIsX ? rect.z1 : rect.x1, 1);
  if (hi - lo + 1 < MIN_INFILL_SIDE) return null;

  const path: Point2[] = [];
  for (let along = lo; along <= hi; along++) {
    path.push(shortIsX ? { x: at, z: along } : { x: along, z: at });
  }
  return path;
}

/**
 * How far a platform seam must drop before it splits the block it runs through.
 */
export const SEAM_BLOCK_MIN_DROP = 2;

/**
 * The seams that bound a block: those that drop at least
 * {@link SEAM_BLOCK_MIN_DROP}.
 */
export function boundingSeams(seams: readonly LevelSeam[]): readonly LevelSeam[] {
  return seams.filter((seam) => seam.drop >= SEAM_BLOCK_MIN_DROP);
}

/**
 * Most rectangles a curved block is cut into.
 */
const MAX_BLOCK_RECTS = 8;

/**
 * A curved block as **several** inscribed rectangles rather than one.
 */
export function rectsOf(grid: Grid, member: Uint8Array, bounds: Rect): Rect[] {
  const out: Rect[] = [];
  const left = Uint8Array.from(member);
  for (let n = 0; n < MAX_BLOCK_RECTS; n++) {
    const rect = largestFreeRect(grid, left, bounds);
    if (rect === null) break;
    const w = rect.x1 - rect.x0 + 1;
    const d = rect.z1 - rect.z0 + 1;
    if (Math.min(w, d) < MIN_INFILL_SIDE) break;
    out.push(rect);
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const k = grid.index(x, z);
        if (k >= 0) left[k] = 0;
      }
    }
  }
  return out;
}

/**
 * The largest axis-aligned rectangle of **this block** inside its bounding box.
 */
export function largestFreeRect(grid: Grid, member: Uint8Array, bounds: Rect): Rect | null {
  const width = bounds.x1 - bounds.x0 + 1;
  const heights = new Int32Array(width);
  let best: Rect | null = null;
  let bestArea = 0;

  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let i = 0; i < width; i++) {
      const k = grid.index(bounds.x0 + i, z);
      heights[i] = k < 0 || member[k] !== 1 ? 0 : (heights[i] as number) + 1;
    }
    const stack: number[] = [];
    for (let i = 0; i <= width; i++) {
      const h = i === width ? 0 : (heights[i] as number);
      while (stack.length > 0 && (heights[stack[stack.length - 1] as number] as number) >= h) {
        const top = stack.pop() as number;
        const height = heights[top] as number;
        const left = stack.length === 0 ? 0 : (stack[stack.length - 1] as number) + 1;
        const area = height * (i - left);
        if (height > 0 && area > bestArea) {
          bestArea = area;
          best = { x0: bounds.x0 + left, z0: z - height + 1, x1: bounds.x0 + i - 1, z1: z };
        }
      }
      stack.push(i);
    }
  }
  return best;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const);

/**
 * Narrow block derivation stage — extracted from district.ts to satisfy Phase 6.2.
 * Takes only the masks/graph/bounds it needs, returns new graph/masks ownership
 * without capturing giant mutable context. Preserves exact b763d56 order/RNG:
 * cutDeepBlocks (which uses leafBlockCap and alleyThrough) then blocksOf, with
 * typed-array ownership handed through without copy (carriageway/blocked mutated
 * in place per original contract, sidewalk newly owned only where alley already
 * allocated it).
 */
export interface BlockDerivationInput {
  readonly grid: import("./district-grid.js").Grid;
  readonly carriageway: Uint8Array;
  readonly blocked: Uint8Array;
  readonly sidewalk: Uint8Array;
  readonly graph: import("./streets.js").StreetGraph;
  readonly density: import("@terrainist/spec/ir").DistrictDensity;
  readonly sidewalkWidth: number;
  readonly bounds: import("./frames.js").Rect;
  readonly hasPlanned: boolean;
}
export interface BlockDerivationResult {
  readonly blocks: readonly Block[];
  readonly graph: import("./streets.js").StreetGraph;
  readonly carriageway: Uint8Array;
  readonly blocked: Uint8Array;
  readonly sidewalk: Uint8Array;
  readonly lanes: readonly import("./streets.js").StreetSegment[];
  readonly rounds: number;
}
export function deriveBlockStage(input: BlockDerivationInput): BlockDerivationResult {
  const { grid, carriageway, blocked, sidewalk, graph, density, sidewalkWidth, bounds, hasPlanned } = input;
  if (hasPlanned) {
    return { blocks: [], graph, carriageway, blocked, sidewalk, lanes: [], rounds: 0 };
  }
  const alley = cutDeepBlocks({ grid, carriageway, blocked, split: true, density, sidewalkWidth, bounds });
  const nextSidewalk = alley.sidewalk ?? sidewalk;
  const nextGraph = alley.lanes.length > 0 ? { ...graph, segments: [...graph.segments, ...alley.lanes] } : graph;
  const blocks = blocksOf(grid, blocked, true);
  return { blocks, graph: nextGraph, carriageway, blocked, sidewalk: nextSidewalk, lanes: alley.lanes, rounds: alley.rounds };
}
