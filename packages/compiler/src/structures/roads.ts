/**
 * `road.network@0` v0 — routing, grading and surfacing.
 *
 * The shape of the problem: the solver has already placed every building and
 * resolved its ports, and the terrain has already been levelled under each pad.
 * What is left is to *connect* them over ground that is still hilly, without
 * walking through water, through another building, or up a cliff.
 *
 * The algorithm is a **successive-shortest-path tree**:
 *
 * 1. pick a hub — the plaza's centre when there is one, else the largest
 *    building's approach;
 * 2. route each remaining anchor to the hub with A* over the post-pad
 *    heightfield, 4-connected, cost = base + slope + turn penalties, with
 *    water/lava and foreign footprints hard-forbidden;
 * 3. **discount cells that are already road**, and make the target of each
 *    later search the *whole* network built so far rather than the hub alone.
 *    That is what makes a village grow a spine with lanes joining it, instead
 *    of a star of parallel tracks all running to the middle.
 *
 * Then each route is *graded* — its elevation profile replaced with the tightest
 * 1-Lipschitz envelope that never rises more than two blocks above the natural
 * ground and never drops below the water table — and *surfaced*, which mutates
 * the column plan directly. Mutating the plan (rather than emitting blocks over
 * the top of it) is deliberate: it keeps the heightmap, the fluid validator and
 * the biome pass all looking at the same ground the player will walk on.
 */

import {
  Rng,
  streamSeed,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";
import { warning, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid, Placement, ResolvedPort } from "../layout/types.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Cost of one flat step along virgin ground. */
export const ROAD_BASE_COST = 10;
/** Extra cost per block of vertical change. */
export const ROAD_SLOPE_COST = 8;
/** Extra cost for changing heading — buys straighter roads. */
export const ROAD_TURN_COST = 6;
/** Multiplier applied when stepping onto an existing road cell. */
export const ROAD_REUSE_DISCOUNT = 0.35;
/** Blocks between lantern posts. */
export const ROAD_LANTERN_SPACING = 14;
/** How far above natural ground a graded route may sit. */
export const ROAD_FILL_BAND = 2;

/** Widths this v0 surfaces. */
export const ROAD_MIN_WIDTH = 2;
export const ROAD_MAX_WIDTH = 3;

/** The `road.network@0` params this v0 reads. */
export interface RoadParams {
  /** Surfaced width, 2..3. */
  readonly width?: number;
  /** Plant fence-post lanterns along the routes. Default `true`. */
  readonly lanterns?: boolean;
  /** Blocks between lantern posts. Default {@link ROAD_LANTERN_SPACING}. */
  readonly lanternSpacing?: number;
}

/** One anchor the network must reach. */
export interface RoadAnchor {
  readonly nodePath: string;
  /** The column the route starts from — one block outside the footprint. */
  readonly x: number;
  readonly z: number;
  /** Footprint area, used only to pick the hub deterministically. */
  readonly area: number;
}

/** Everything {@link buildRoadNetwork} reads. */
export interface RoadNetworkInput {
  readonly nodePath: string;
  readonly params: RoadParams;
  readonly seed: Seed256;
  /** Mutated in place: ground, surface, subsurface and snow along each route. */
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Every placed node — buildings supply anchors, the plaza supplies the hub. */
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  /** The plaza's placement, when the document has one. */
  readonly plaza?: Placement;
  /**
   * Columns the plaza pass has already surfaced.
   *
   * Routes cross them freely — the green is where the lanes are *going* — but
   * they are graded to the plaza's own level rather than lifted onto the fill
   * band, and their paving is left alone. Without this a lane runs straight
   * across the square two blocks up and cuts it in half.
   */
  readonly paved?: Uint8Array;
  /** Columns no route may enter even though they are on the plaza — the well. */
  readonly keepClear?: Uint8Array;
  /** Node paths that are buildings (their footprints are hard obstacles). */
  readonly buildingPaths: ReadonlySet<string>;
  /** Updated with a `road` tag for every surfaced column. */
  readonly occupancy?: OccupancyGrid;
}

/** One routed road. */
export interface RoadRoute {
  readonly from: string;
  readonly to: string;
  /** Centre-line columns, from the anchor to the network. */
  readonly path: readonly { readonly x: number; readonly z: number; readonly y: number }[];
  readonly cost: number;
}

/** What the road pass produced. */
export interface RoadNetworkResult {
  readonly blocks: readonly StructureBlock[];
  readonly routes: readonly RoadRoute[];
  /** Every column the network surfaced. */
  readonly surfacedColumns: number;
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Anchors that could not be reached. */
  readonly unrouted: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* anchors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The approach column of one placement: the port's position stepped one block
 * along its outward normal, so the route starts outside the wall it leaves.
 *
 * `road_stub` wins over `door` — a building that declares both wants its
 * traffic on the stub. With neither, the placement contributes no anchor.
 */
export function approachOf(
  placement: Placement,
  ports: readonly ResolvedPort[],
): RoadAnchor | null {
  const mine = ports.filter((p) => p.nodePath === placement.nodePath);
  const port = mine.find((p) => p.type === "road_stub") ?? mine.find((p) => p.type === "door");
  const area =
    (placement.footprint.x1 - placement.footprint.x0 + 1) *
    (placement.footprint.z1 - placement.footprint.z0 + 1);
  if (port === undefined) return null;
  return {
    nodePath: placement.nodePath,
    x: port.position[0] + port.outwardNormal[0],
    z: port.position[2] + port.outwardNormal[2],
    area,
  };
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** Route, grade and surface the whole network. */
export function buildRoadNetwork(input: RoadNetworkInput): RoadNetworkResult {
  const { plan, occupancy } = input;
  const { region } = plan;
  const cells = region.width * region.depth;

  const width = clampInt(Math.round(input.params.width ?? 3), ROAD_MIN_WIDTH, ROAD_MAX_WIDTH);
  const spacing = Math.max(4, Math.round(input.params.lanternSpacing ?? ROAD_LANTERN_SPACING));
  const wantLanterns = input.params.lanterns !== false;

  const blocked = buildBlockedMask(input);
  const paved = input.paved ?? new Uint8Array(cells);
  const road = new Uint8Array(cells);

  const diagnostics: LoamDiagnostic[] = [];
  const routes: RoadRoute[] = [];
  const unrouted: string[] = [];
  const blocks: StructureBlock[] = [];

  // --- anchors, in document order ------------------------------------------
  const anchors: RoadAnchor[] = [];
  for (const placement of input.placements) {
    if (!input.buildingPaths.has(placement.nodePath)) continue;
    const anchor = approachOf(placement, input.ports);
    if (anchor === null) continue;
    if (!inside(region, anchor.x, anchor.z)) continue;
    anchors.push(anchor);
  }

  // --- the hub -------------------------------------------------------------
  const hub = pickHub(input, anchors, region, blocked);
  if (hub === null || anchors.length === 0) {
    return { blocks, routes, surfacedColumns: 0, diagnostics, unrouted };
  }
  road[index(region, hub.x, hub.z)] = 1;

  const states = resolveRoadStates(input.palette, input.stack);
  const rng = new Rng(streamSeed(input.seed, "grammar"));
  const lanternSide = new Map<string, number>();

  for (const anchor of anchors) {
    if (anchor.nodePath === hub.nodePath) continue;
    const start = freeCellNear(region, blocked, road, anchor.x, anchor.z);
    if (start === null) {
      unrouted.push(anchor.nodePath);
      diagnostics.push(unroutable(input.nodePath, anchor.nodePath, hub.nodePath, "its approach column is blocked"));
      continue;
    }

    const path = routeTo(region, blocked, road, plan, start);
    if (path === null) {
      unrouted.push(anchor.nodePath);
      diagnostics.push(unroutable(input.nodePath, anchor.nodePath, hub.nodePath, "no legal path exists"));
      continue;
    }

    const profile = gradeProfile(
      path.map((c) => plan.ground[index(region, c.x, c.z)] as number),
      plan.seaLevel,
      path.map((c) => (paved[index(region, c.x, c.z)] === 1 ? 0 : ROAD_FILL_BAND)),
    );
    const surfaced: { x: number; z: number; y: number }[] = [];
    for (const [i, cell] of path.entries()) {
      surfaced.push({ x: cell.x, z: cell.z, y: profile[i] as number });
    }

    surfaceRoute(region, plan, blocked, road, surfaced, width, states, occupancy, paved);
    if (wantLanterns) {
      plantLanterns(region, plan, road, surfaced, width, spacing, states, blocks, rng, lanternSide);
    }

    routes.push({
      from: anchor.nodePath,
      to: hub.nodePath,
      path: surfaced,
      cost: path.length,
    });
  }

  let surfacedColumns = 0;
  for (let k = 0; k < cells; k++) if (road[k] === 1) surfacedColumns++;

  return { blocks, routes, surfacedColumns, diagnostics, unrouted };
}

/* -------------------------------------------------------------------------- */
/* obstacles + hub                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Columns a route may never enter: any fluid, and any building footprint.
 *
 * The plaza is deliberately *not* an obstacle — it is where the roads are meant
 * to arrive — and neither is the one-block approach of each anchor, which sits
 * outside its own footprint by construction.
 */
function buildBlockedMask(input: RoadNetworkInput): Uint8Array {
  const plan = input.plan;
  const region = plan.region;
  const mask = new Uint8Array(region.width * region.depth);
  for (let k = 0; k < mask.length; k++) {
    if (plan.fluidKind[k] !== FluidKind.NONE) mask[k] = 1;
  }
  for (const placement of input.placements) {
    if (!input.buildingPaths.has(placement.nodePath)) continue;
    stamp(region, mask, placement.footprint, 1);
  }
  if (input.keepClear !== undefined) {
    for (let k = 0; k < mask.length; k++) if (input.keepClear[k] === 1) mask[k] = 1;
  }
  return mask;
}

/** The plaza's centre, or the largest building's approach. */
function pickHub(
  input: RoadNetworkInput,
  anchors: readonly RoadAnchor[],
  region: Region,
  blocked: Uint8Array,
): RoadAnchor | null {
  if (input.plaza !== undefined) {
    const rect = input.plaza.footprint;
    const x = Math.floor((rect.x0 + rect.x1) / 2);
    const z = Math.floor((rect.z0 + rect.z1) / 2);
    // The exact centre is not always available — since G4.5a the plaza pass puts
    // a well there, and a well is water, which is a hard obstacle. Step outward
    // in a fixed spiral until a paved column turns up; anywhere on the green is
    // as good a hub as any, and giving up would demote the plaza to "not the
    // hub" and scatter the lanes to the largest building instead.
    for (let r = 0; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const hx = x + dx;
          const hz = z + dz;
          if (!inside(region, hx, hz)) continue;
          if (hx < rect.x0 || hx > rect.x1 || hz < rect.z0 || hz > rect.z1) continue;
          if (blocked[index(region, hx, hz)] === 1) continue;
          return { nodePath: input.plaza.nodePath, x: hx, z: hz, area: 0 };
        }
      }
    }
  }
  let best: RoadAnchor | null = null;
  for (const anchor of anchors) {
    if (blocked[index(region, anchor.x, anchor.z)] === 1) continue;
    // Ties break on the earlier (document-order) anchor, never on area alone.
    if (best === null || anchor.area > best.area) best = anchor;
  }
  return best;
}

/** The nearest unblocked column to `(x, z)`, searched in a fixed spiral. */
function freeCellNear(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  x: number,
  z: number,
): { x: number; z: number } | null {
  for (let r = 0; r <= 4; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = x + dx;
        const cz = z + dz;
        if (!inside(region, cx, cz)) continue;
        const idx = index(region, cx, cz);
        if (blocked[idx] === 1 && road[idx] === 0) continue;
        return { x: cx, z: cz };
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* A*                                                                          */
/* -------------------------------------------------------------------------- */

/** Step deltas, in the fixed order the search expands them. */
const STEPS: readonly (readonly [number, number])[] = Object.freeze([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const);

/** Lowest possible per-step cost — the A* heuristic's scale factor. */
const MIN_STEP_COST = ROAD_BASE_COST * ROAD_REUSE_DISCOUNT;

/**
 * Route from `start` to the nearest cell of the existing network.
 *
 * Searched **backwards**: the open set starts as every road cell at zero cost
 * and the goal is the anchor, which turns "nearest of many targets" into an
 * ordinary single-goal A*. The heuristic is Manhattan distance scaled by the
 * cheapest possible step, so it never over-estimates and the first expansion of
 * the goal is optimal.
 *
 * State is `(cell, incoming heading)` so the turn penalty is expressible; ties
 * break on the lower state key, which makes the result independent of heap
 * implementation details.
 */
export function routeTo(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  plan: ColumnPlan,
  start: { x: number; z: number },
): { x: number; z: number }[] | null {
  const cells = region.width * region.depth;
  const states = cells * 5;
  const goal = index(region, start.x, start.z);

  const g = new Float64Array(states).fill(Infinity);
  const from = new Int32Array(states).fill(-1);
  const heap = new Heap();

  const heuristic = (idx: number): number => {
    const dx = Math.abs((idx % region.width) - (goal % region.width));
    const dz = Math.abs(Math.floor(idx / region.width) - Math.floor(goal / region.width));
    return (dx + dz) * MIN_STEP_COST;
  };

  for (let idx = 0; idx < cells; idx++) {
    if (road[idx] !== 1) continue;
    const state = idx * 5 + 4;
    g[state] = 0;
    heap.push(heuristic(idx), state);
  }
  if (heap.size === 0) return null;

  let found = -1;
  const closed = new Uint8Array(states);
  while (heap.size > 0) {
    const state = heap.pop();
    if (closed[state] === 1) continue;
    closed[state] = 1;
    const idx = Math.floor(state / 5);
    if (idx === goal) {
      found = state;
      break;
    }
    const dir = state % 5;
    const x = region.x0 + (idx % region.width);
    const z = region.z0 + Math.floor(idx / region.width);
    const here = plan.ground[idx] as number;

    for (const [d, step] of STEPS.entries()) {
      const nx = x + (step[0] as number);
      const nz = z + (step[1] as number);
      if (!inside(region, nx, nz)) continue;
      const nIdx = index(region, nx, nz);
      const onRoad = road[nIdx] === 1;
      if (blocked[nIdx] === 1 && !onRoad && nIdx !== goal) continue;
      const nState = nIdx * 5 + d;
      if (closed[nState] === 1) continue;

      const drop = Math.abs((plan.ground[nIdx] as number) - here);
      let cost = ROAD_BASE_COST + ROAD_SLOPE_COST * drop;
      if (dir !== 4 && dir !== d) cost += ROAD_TURN_COST;
      if (onRoad) cost *= ROAD_REUSE_DISCOUNT;

      const tentative = (g[state] as number) + cost;
      if (tentative >= (g[nState] as number)) continue;
      g[nState] = tentative;
      from[nState] = state;
      heap.push(tentative + heuristic(nIdx), nState);
    }
  }

  if (found < 0) return null;
  const path: { x: number; z: number }[] = [];
  for (let s = found; s >= 0; s = from[s] as number) {
    const idx = Math.floor(s / 5);
    path.push({ x: region.x0 + (idx % region.width), z: region.z0 + Math.floor(idx / region.width) });
    if ((from[s] as number) < 0) break;
  }
  return path;
}

/**
 * A binary min-heap of `(priority, state)`.
 *
 * Ties break on the lower state id rather than on insertion order, so the
 * search is reproducible regardless of how the heap happens to sift.
 */
class Heap {
  private readonly priority: number[] = [];
  private readonly value: number[] = [];

  get size(): number {
    return this.value.length;
  }

  push(priority: number, value: number): void {
    this.priority.push(priority);
    this.value.push(value);
    let i = this.value.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.value[0] as number;
    const lastP = this.priority.pop() as number;
    const lastV = this.value.pop() as number;
    if (this.value.length > 0) {
      this.priority[0] = lastP;
      this.value[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.value.length && this.less(l, best)) best = l;
        if (r < this.value.length && this.less(r, best)) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const pa = this.priority[a] as number;
    const pb = this.priority[b] as number;
    if (pa !== pb) return pa < pb;
    return (this.value[a] as number) < (this.value[b] as number);
  }

  private swap(a: number, b: number): void {
    const p = this.priority[a] as number;
    this.priority[a] = this.priority[b] as number;
    this.priority[b] = p;
    const v = this.value[a] as number;
    this.value[a] = this.value[b] as number;
    this.value[b] = v;
  }
}

/* -------------------------------------------------------------------------- */
/* grading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Grade an elevation profile to a maximum step of one block.
 *
 * The result is the lower envelope of cones of slope 1 rooted at
 * `ground + ROAD_FILL_BAND`, floored at the water table:
 *
 *     s[i] = max(waterTable + 1, min_j (o[j] + band[j] + |i − j|))
 *
 * Two properties fall straight out of that form and are what the tests assert:
 * a lower envelope of unit cones is 1-Lipschitz, so `|s[i+1] − s[i]| ≤ 1`
 * everywhere; and taking `max` with a constant preserves that. Fill is capped
 * at `band` by construction. Cut is not — a route crossing a narrow gully digs
 * as deep as the gully, because this v0 has no bridges.
 *
 * `band` may vary per cell, which is what lets a lane arriving at the plaza
 * *descend onto* the green instead of running across it two blocks up on an
 * embankment: the plaza's cells are given band 0, the cone construction ramps
 * the approach down to meet them, and the 1-Lipschitz guarantee is untouched
 * because a per-cone apex height was always allowed to differ.
 *
 * v0.2 §7 `road.network@0`: not yet — `maxGrade`, `bridgeThreshold`,
 * `tunnelThreshold` and `crown` would each change this function; none is read.
 */
export function gradeProfile(
  ground: readonly number[],
  seaLevel: number,
  band: readonly number[] | number = ROAD_FILL_BAND,
): number[] {
  const n = ground.length;
  const out = new Array<number>(n);
  const bandAt = (i: number): number => (typeof band === "number" ? band : (band[i] as number));
  for (let i = 0; i < n; i++) out[i] = (ground[i] as number) + bandAt(i);
  for (let i = 1; i < n; i++) out[i] = Math.min(out[i] as number, (out[i - 1] as number) + 1);
  for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i] as number, (out[i + 1] as number) + 1);
  const floor = seaLevel + 1;
  for (let i = 0; i < n; i++) out[i] = Math.max(out[i] as number, floor);
  return out;
}

/* -------------------------------------------------------------------------- */
/* surfacing                                                                   */
/* -------------------------------------------------------------------------- */

/** The block states the road pass writes. */
interface RoadStates {
  readonly surface: (x: number, z: number) => number;
  readonly shoulder: (x: number, z: number) => number;
  readonly step: number;
  readonly subsurface: number;
  readonly post: number;
  readonly lantern: number;
}

function resolveRoadStates(palette: Palette, stack: PrismarineStack): RoadStates {
  const fallback = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const at = (symbol: string, name: string) =>
    palette.has(symbol)
      ? (x: number, z: number): number => palette.stateAt(symbol, x, z)
      : (): number => fallback(name);
  return {
    surface: at("road.surface", "dirt_path"),
    shoulder: at("road.shoulder", "gravel"),
    step: palette.has("road.step") ? palette.state("road.step") : fallback("stone_bricks"),
    subsurface: palette.has("road.subsurface") ? palette.state("road.subsurface") : fallback("dirt"),
    post: palette.has("road.post") ? palette.state("road.post") : fallback("oak_fence"),
    lantern: palette.has("road.lantern") ? palette.state("road.lantern") : fallback("lantern"),
  };
}

/**
 * Write one route into the column plan.
 *
 * Each centre-line cell claims a band perpendicular to its local heading: the
 * centre lane gets `@road.surface`, the outermost offset the shoulder mix, and
 * any cell where the graded profile steps gets `@road.step` so the change of
 * level reads as a deliberate stair rather than a glitch.
 */
function surfaceRoute(
  region: Region,
  plan: ColumnPlan,
  blocked: Uint8Array,
  road: Uint8Array,
  path: readonly { x: number; z: number; y: number }[],
  width: number,
  states: RoadStates,
  occupancy: OccupancyGrid | undefined,
  paved: Uint8Array,
): void {
  const half = (width - 1) >> 1;
  const offsets: number[] = [];
  for (let o = -half; o <= width - 1 - half; o++) offsets.push(o);

  for (const [i, cell] of path.entries()) {
    const heading = headingAt(path, i);
    const isStep = i > 0 && cell.y !== (path[i - 1] as { y: number }).y;
    for (const offset of offsets) {
      const x = cell.x + heading.pz * offset;
      const z = cell.z + heading.px * offset;
      if (!inside(region, x, z)) continue;
      const idx = index(region, x, z);
      // Never surface a foreign footprint or open water, even in the shoulder.
      if (blocked[idx] === 1) continue;
      // The plaza surfaced itself; a lane crossing the green is *on* the green.
      // It still counts as road for routing, occupancy and lantern spacing.
      if (paved[idx] === 1) {
        road[idx] = 1;
        if (occupancy !== undefined) claim(occupancy, idx);
        continue;
      }

      const outer = offsets.length > 1 && Math.abs(offset) === Math.max(half, width - 1 - half);
      plan.ground[idx] = cell.y;
      plan.fluidTop[idx] = cell.y;
      plan.snow[idx] = 0;
      plan.surface[idx] = isStep
        ? states.step
        : outer
          ? states.shoulder(x, z)
          : states.surface(x, z);
      plan.subsurface[idx] = states.subsurface;
      if (plan.soil[idx] === 0) plan.soil[idx] = 1;
      road[idx] = 1;
      if (occupancy !== undefined) claim(occupancy, idx);
    }
  }
}

/** Unit heading at path index `i`, and the perpendicular used for the band. */
function headingAt(
  path: readonly { x: number; z: number }[],
  i: number,
): { px: number; pz: number } {
  const a = path[Math.max(0, i - 1)] as { x: number; z: number };
  const b = path[Math.min(path.length - 1, i + 1)] as { x: number; z: number };
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  // Perpendicular of (dx, dz) is (-dz, dx); the band walks that axis.
  return dx === 0 && dz === 0 ? { px: 0, pz: 1 } : { px: dx, pz: -dz };
}

/**
 * Plant fence-post lanterns along a route, alternating sides.
 *
 * The side alternates per route *and* per post, and which side a route starts
 * on is drawn from the node's `grammar` stream, so two parallel lanes do not
 * end up with all their lights on the same edge.
 */
function plantLanterns(
  region: Region,
  plan: ColumnPlan,
  road: Uint8Array,
  path: readonly { x: number; z: number; y: number }[],
  width: number,
  spacing: number,
  states: RoadStates,
  out: StructureBlock[],
  rng: Rng,
  sides: Map<string, number>,
): void {
  const offset = ((width - 1) >> 1) + 1;
  let flip = rng.int(0, 1);
  for (let i = spacing; i < path.length; i += spacing) {
    const cell = path[i] as { x: number; z: number; y: number };
    const heading = headingAt(path, i);
    const side = flip === 0 ? 1 : -1;
    flip = 1 - flip;
    const x = cell.x + heading.pz * offset * side;
    const z = cell.z + heading.px * offset * side;
    if (!inside(region, x, z)) continue;
    const idx = index(region, x, z);
    if (road[idx] === 1) continue;
    if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
    const key = `${x},${z}`;
    if (sides.has(key)) continue;
    sides.set(key, side);
    const base = (plan.ground[idx] as number) + 1;
    out.push({ x, y: base, z, stateId: states.post });
    out.push({ x, y: base + 1, z, stateId: states.lantern });
  }
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Mark one column as road-occupied, in the union mask and the `road` tag. */
function claim(occupancy: OccupancyGrid, idx: number): void {
  occupancy.mask[idx] = 1;
  let tag = occupancy.byTag.get("road");
  if (tag === undefined) {
    tag = new Uint8Array(occupancy.mask.length);
    (occupancy.byTag as Map<string, Uint8Array>).set("road", tag);
  }
  tag[idx] = 1;
}

function stamp(region: Region, mask: Uint8Array, rect: Rect, value: number): void {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(region, x, z)) continue;
      mask[index(region, x, z)] = value;
    }
  }
}

function unroutable(nodePath: string, from: string, to: string, why: string): LoamDiagnostic {
  return warning(
    "ROAD_UNROUTABLE",
    nodePath,
    `no road could be routed from "${from}" to the network hub "${to}": ${why}`,
    `move "${from}" onto ground the network can reach — a route may not cross water, lava or another building's footprint, so check for a lake or a wall of houses between the two`,
  );
}

/** Row-major column index. Callers must have checked {@link inside}. */
export function index(region: Region, x: number, z: number): number {
  return (z - region.z0) * region.width + (x - region.x0);
}

/** True when `(x, z)` is a column of the region. */
export function inside(region: Region, x: number, z: number): boolean {
  return (
    x >= region.x0 && x < region.x0 + region.width && z >= region.z0 && z < region.z0 + region.depth
  );
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/*
 * v0.2 §7 `road.network@0` — implemented vs deferred
 * --------------------------------------------------
 * implemented: `width` (2..3, this profile's shorthand for a one-class
 *   `hierarchy`), `lanterns`/`lanternSpacing` (this profile's shorthand for
 *   `lighting`), and the `road_stub`/`door` anchors.
 *
 * v0.2 §7: not yet — `anchors` selectors: every placed building is an anchor,
 *   selector syntax (`#tag:house`) is parsed by the validator and ignored here.
 * v0.2 §7: not yet — `pattern`; the network is always `minimal_spanning`-ish.
 * v0.2 §7: not yet — `hierarchy`, `blockSize`, `junctionStyle`, `curvature`.
 * v0.2 §7: not yet — `maxGrade`, `bridgeThreshold`, `tunnelThreshold`, `crown`.
 * v0.2 §4.9.6: not yet — `corridors()` at substage 3b, so `along` constraints
 *   still have nothing to bind to and the network is not a placed node.
 * v0.2 §7.10: not yet — `LOAM-W430 DISCONNECTED_ROAD_GRAPH`; an unreachable
 *   anchor is reported per route as `LOAM-T209 ROAD_UNROUTABLE` instead.
 */
