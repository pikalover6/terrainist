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
/** Cost of one flat diagonal step — `ROAD_BASE_COST · √2`, rounded. */
export const ROAD_DIAGONAL_COST = 14;
/** Extra cost per block of vertical change. */
export const ROAD_SLOPE_COST = 8;
/** Extra cost for a 90° change of heading; a 45° kink costs half of it. */
export const ROAD_TURN_COST = 6;
/** Longest straight a smoothing pass will pull, in cells. */
export const ROAD_SMOOTH_REACH = 20;
/** Multiplier applied when stepping onto an existing road cell. */
export const ROAD_REUSE_DISCOUNT = 0.35;
/** Blocks between lantern posts. */
export const ROAD_LANTERN_SPACING = 14;

/**
 * How far above natural ground a graded route may sit — the **cut bias**.
 *
 * This was 2, and 2 is why the first village's lanes read as dikes: the cone
 * envelope roots every apex at `ground + band`, so on flat ground the whole
 * lane sits `band` blocks *above* the field it crosses and shows a vertical
 * face of that height on both sides for its entire length. A road is a thing
 * cut into the land, not a causeway laid on top of it, and the grading should
 * prefer to remove material rather than add it.
 *
 * At 1 the profile is biased downward — the apex is one block over natural
 * ground, so the envelope's minimum almost always lands *at or below* it — and
 * any fill face that does survive is capped at one block by construction,
 * which is the property {@link gradeProfile}'s test asserts. What smooths over
 * the remaining edges is {@link blendShoulders}, not a taller embankment.
 *
 * At **0** it is not biased downward, it is *flush*: the envelope's apex is
 * natural ground, so `min_j (ground[j] + |i − j|) ≤ ground[i]` holds
 * everywhere and a lane is only ever cut into the land, never laid on it. One
 * was still one too many — a walkthrough of the first village reported the
 * lanes as raised causeways with a cobble kerb showing a full block of face
 * beside the grass, which is exactly what a uniform `+1` apex builds on flat
 * ground. The road surface block now *replaces* the terrain's top block in its
 * column, which is what "a path worn into a field" means.
 */
export const ROAD_FILL_BAND = 0;

/**
 * Extra cost for a cell that touches a building's perimeter.
 *
 * A* has no opinion about walls: a lane that grazes a smithy for fifteen cells
 * costs exactly what the same lane one block further out costs, so the
 * tie-break decides, and half the time the tie-break picks the wall. From the
 * ground the result is a road that scrapes along the side of a building and
 * then turns away from its door, which no village has ever looked like.
 *
 * The penalty is deliberately soft — three flat steps — because it must lose
 * to genuine geometry: squeezing between two houses is sometimes the only way
 * through, and the router should still take it rather than declare the anchor
 * unroutable. It only has to break ties.
 */
export const ROAD_WALL_HUG_COST = 30;

/** How far a building's perimeter reaches when charging {@link ROAD_WALL_HUG_COST}. */
export const ROAD_WALL_HUG_REACH = 1;

/**
 * How many cells of the final approach are forced straight out from the door.
 *
 * The corridor is exempt from the wall-hug penalty (a road *must* touch the
 * building it serves) and the stub is prepended to the search result rather
 * than searched for, so the lane always meets the door face square on instead
 * of sidling up to it diagonally.
 */
export const ROAD_APPROACH_CELLS = 3;

/**
 * One-off cost of leaving dry land for water, and the cost of each further
 * water cell.
 *
 * Together these are the bridge threshold, expressed the way the router can
 * actually use it: crossing an `n`-cell channel costs
 * `ROAD_BRIDGE_ENTRY + n · ROAD_WATER_COST`, so a crossing is taken exactly
 * when going round would cost more than that. At these numbers a ten-block
 * river is worth about 240 blocks of detour — which is the right answer for a
 * village on one bank and a cottage on the other, and the wrong answer for a
 * pond you can walk around, which is the distinction that matters.
 */
export const ROAD_BRIDGE_ENTRY = 1200;
/** Cost of one further cell out over water. */
export const ROAD_WATER_COST = 120;

/**
 * The widest water a bridge may span, in cells.
 *
 * Not a cost — a hard limit, and the difference is the point. A cost says "a
 * lake is expensive"; a limit says "you do not bridge a lake", which is what
 * stops the router from answering a hard routing problem with a four-hundred
 * block viaduct. A cell is bridgeable when the water run through it is at most
 * this long along one of the two axes, which is exactly "there is a near bank
 * in some direction".
 */
export const ROAD_BRIDGE_MAX_SPAN = 22;

/** How many columns either side of a lane are graded into it. */
export const ROAD_SHOULDER_REACH = 2;

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
  /** The port's outward normal — the direction the final approach must run. */
  readonly nx: number;
  readonly nz: number;
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
  /** Of those, the columns carried on a bridge deck over water. */
  readonly bridgeColumns: number;
  /** The surfaced width the pass used, for the canopy clip. */
  readonly width: number;
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
  const nx = Math.sign(port.outwardNormal[0]);
  const nz = Math.sign(port.outwardNormal[2]);
  return {
    nodePath: placement.nodePath,
    x: port.position[0] + port.outwardNormal[0],
    z: port.position[2] + port.outwardNormal[2],
    nx,
    nz,
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

  const water = buildBridgeableMask(plan);
  const blocked = buildBlockedMask(input, water);
  const paved = input.paved ?? new Uint8Array(cells);
  const road = new Uint8Array(cells);
  const roadY = new Int32Array(cells);
  const bridged = new Uint8Array(cells);

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
    return { blocks, routes, surfacedColumns: 0, bridgeColumns: 0, width, diagnostics, unrouted };
  }
  road[index(region, hub.x, hub.z)] = 1;

  const wallHug = buildWallHugMask(
    region,
    input.placements,
    input.buildingPaths,
    anchors,
    ROAD_APPROACH_CELLS,
    width,
  );

  const states = resolveRoadStates(input.palette, input.stack);
  const rng = new Rng(streamSeed(input.seed, "grammar"));
  const lanternSide = new Map<string, number>();

  for (const anchor of anchors) {
    if (anchor.nodePath === hub.nodePath) continue;
    // The straight stub out of the door. Searching *from its far end* and
    // pasting the stub back on is what makes the approach perpendicular: A*
    // never gets the chance to sidle up to the door face diagonally, because
    // by the time it has any freedom the lane is already three cells clear of
    // the wall and pointing away from it.
    const stub = doorStub(region, blocked, road, anchor);
    const head = stub[stub.length - 1] ?? { x: anchor.x, z: anchor.z };
    const start = freeCellNear(region, blocked, road, head.x, head.z);
    if (start === null) {
      unrouted.push(anchor.nodePath);
      diagnostics.push(unroutable(input.nodePath, anchor.nodePath, hub.nodePath, "its approach column is blocked"));
      continue;
    }

    const found = routeTo(region, blocked, road, plan, start, { water, wallHug });
    if (found === null) {
      unrouted.push(anchor.nodePath);
      diagnostics.push(unroutable(input.nodePath, anchor.nodePath, hub.nodePath, "no legal path exists"));
      continue;
    }
    // Smooth first, grade second: the elevation profile has to belong to the
    // cells that will actually be surfaced, or the lane steps where the route
    // no longer goes.
    const smoothed = smoothRoute(region, blocked, road, plan, found, ROAD_SMOOTH_REACH, water);
    // The stub is prepended *after* smoothing, so the smoother cannot pull a
    // straight through it and undo the perpendicular arrival.
    const path = joinStub(stub, smoothed);

    const profile = gradeProfile(
      path.map((c) => plan.ground[index(region, c.x, c.z)] as number),
      plan.seaLevel,
      path.map((c) => (paved[index(region, c.x, c.z)] === 1 ? 0 : ROAD_FILL_BAND)),
      // A deck has to clear the water it spans, so a bridge cell's floor is
      // the fluid surface plus one rather than the water table.
      path.map((c) => {
        const k = index(region, c.x, c.z);
        return water[k] === 1 ? Math.max(plan.seaLevel, plan.fluidTop[k] as number) + 1 : 0;
      }),
    );
    const surfaced: { x: number; z: number; y: number }[] = [];
    for (const [i, cell] of path.entries()) {
      surfaced.push({ x: cell.x, z: cell.z, y: profile[i] as number });
    }

    surfaceRoute(region, plan, blocked, road, roadY, surfaced, width, states, occupancy, paved, water, bridged);
    buildBridgeDeck(region, plan, surfaced, width, states, blocks, water);

    routes.push({
      from: anchor.nodePath,
      to: hub.nodePath,
      path: surfaced,
      cost: path.length,
    });
  }

  // --- lanterns, once every route has been surfaced -----------------------
  // Deliberately last. A post planted while routes were still being laid could
  // have a later route regrade the ground out from under it, which is exactly
  // how the first village ended up with nine lanterns hanging in mid-air: the
  // block they stood on was replaced by air when the lane beside them was cut
  // down. Planting against the finished heightfield makes support structural.
  if (wantLanterns) {
    for (const route of routes) {
      plantLanterns(region, plan, road, route.path, width, spacing, states, blocks, rng, lanternSide);
    }
  }

  // --- shoulders, after every route is graded -----------------------------
  // Same reason as the lanterns: a verge blended against a lane that a later
  // route then re-cuts is a verge blended to the wrong height.
  blendShoulders(region, plan, road, roadY, blocked, paved);

  let surfacedColumns = 0;
  let bridgeColumns = 0;
  for (let k = 0; k < cells; k++) {
    if (road[k] === 1) surfacedColumns++;
    if (bridged[k] === 1) bridgeColumns++;
  }

  return { blocks, routes, surfacedColumns, bridgeColumns, width, diagnostics, unrouted };
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
function buildBlockedMask(input: RoadNetworkInput, water: Uint8Array): Uint8Array {
  const plan = input.plan;
  const region = plan.region;
  const mask = new Uint8Array(region.width * region.depth);
  for (let k = 0; k < mask.length; k++) {
    // Water is no longer a hard obstacle — it is a priced one, and `water`
    // says which cells a bridge may legally reach. Lava, and any water too
    // wide to span, stay forbidden outright.
    if (plan.fluidKind[k] !== FluidKind.NONE && water[k] === 0) mask[k] = 1;
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

/**
 * Water cells a bridge may cross: fresh or salt water whose run is at most
 * {@link ROAD_BRIDGE_MAX_SPAN} cells along the x or the z axis.
 *
 * Run lengths are read off the rows and the columns in two linear sweeps, so
 * this is O(cells) and, being a pure function of the fluid mask, deterministic.
 */
export function buildBridgeableMask(plan: ColumnPlan): Uint8Array {
  const { region, fluidKind } = plan;
  const n = region.width * region.depth;
  const wet = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (fluidKind[k] === FluidKind.WATER) wet[k] = 1;

  const out = new Uint8Array(n);
  const runs = new Int32Array(n);

  // Rows.
  for (let j = 0; j < region.depth; j++) {
    let i = 0;
    while (i < region.width) {
      const base = j * region.width;
      if (wet[base + i] === 0) {
        i++;
        continue;
      }
      let end = i;
      while (end < region.width && wet[base + end] === 1) end++;
      const span = end - i;
      for (let k = i; k < end; k++) runs[base + k] = span;
      i = end;
    }
  }
  for (let k = 0; k < n; k++) {
    if (wet[k] === 1 && (runs[k] as number) > 0 && (runs[k] as number) <= ROAD_BRIDGE_MAX_SPAN) {
      out[k] = 1;
    }
  }

  // Columns.
  runs.fill(0);
  for (let i = 0; i < region.width; i++) {
    let j = 0;
    while (j < region.depth) {
      if (wet[j * region.width + i] === 0) {
        j++;
        continue;
      }
      let end = j;
      while (end < region.depth && wet[end * region.width + i] === 1) end++;
      const span = end - j;
      for (let k = j; k < end; k++) runs[k * region.width + i] = span;
      j = end;
    }
  }
  for (let k = 0; k < n; k++) {
    if (wet[k] === 1 && (runs[k] as number) > 0 && (runs[k] as number) <= ROAD_BRIDGE_MAX_SPAN) {
      out[k] = 1;
    }
  }

  return out;
}

/**
 * Cells that touch a building's perimeter and are not part of anyone's door
 * approach — the columns {@link ROAD_WALL_HUG_COST} is charged on.
 *
 * The exemption is subtracted after the whole penalty field is stamped, so a
 * door corridor clears the penalty even where it runs past a *neighbouring*
 * building's wall: arriving at your own door matters more than keeping a
 * polite distance from someone else's.
 */
export function buildWallHugMask(
  region: Region,
  placements: readonly Placement[],
  buildingPaths: ReadonlySet<string>,
  anchors: readonly RoadAnchor[],
  approach: number,
  width: number,
): Uint8Array {
  const mask = new Uint8Array(region.width * region.depth);
  const reach = ROAD_WALL_HUG_REACH;
  for (const placement of placements) {
    if (!buildingPaths.has(placement.nodePath)) continue;
    const f = placement.footprint;
    for (let z = f.z0 - reach; z <= f.z1 + reach; z++) {
      for (let x = f.x0 - reach; x <= f.x1 + reach; x++) {
        if (!inside(region, x, z)) continue;
        // Inside the footprint is already a hard obstacle; only the collar
        // around it carries a penalty.
        if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) continue;
        mask[index(region, x, z)] = 1;
      }
    }
  }
  const half = (width - 1) >> 1;
  for (const anchor of anchors) {
    for (let step = 0; step < approach + 1; step++) {
      for (let o = -half - 1; o <= half + 1; o++) {
        const x = anchor.x + anchor.nx * step + anchor.nz * o;
        const z = anchor.z + anchor.nz * step + anchor.nx * o;
        if (!inside(region, x, z)) continue;
        mask[index(region, x, z)] = 0;
      }
    }
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
          return { nodePath: input.plaza.nodePath, x: hx, z: hz, nx: 0, nz: 0, area: 0 };
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

/**
 * Step deltas, in the fixed order the search expands them: the four cardinals
 * first, then the four diagonals, so a tie between an orthogonal and a diagonal
 * route resolves the same way every run.
 *
 * Eight-connectivity is what stopped roads reading as staircases. A 4-connected
 * A* has no way to express "head north-east"; it can only alternate north and
 * east, and the turn penalty then decides whether it does so in one long L or in
 * a flight of steps. Neither looks like a lane.
 */
const STEPS: readonly (readonly [number, number])[] = Object.freeze([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
] as const);

/** Heading states per cell: the eight directions plus "no heading yet". */
const DIR_STATES = STEPS.length + 1;
/** The index of the "no heading yet" state. */
const NO_DIR = STEPS.length;

/** Lowest possible per-step cost — the A* heuristic's scale factor. */
const MIN_STEP_COST = ROAD_BASE_COST * ROAD_REUSE_DISCOUNT;
/** Lowest possible diagonal step cost. */
const MIN_DIAGONAL_COST = ROAD_DIAGONAL_COST * ROAD_REUSE_DISCOUNT;

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
  costs: { water?: Uint8Array; wallHug?: Uint8Array } = {},
): { x: number; z: number }[] | null {
  const water = costs.water;
  const wallHug = costs.wallHug;
  const cells = region.width * region.depth;
  const states = cells * DIR_STATES;
  const goal = index(region, start.x, start.z);

  const g = new Float64Array(states).fill(Infinity);
  const from = new Int32Array(states).fill(-1);
  const heap = new Heap();

  // Octile distance at the cheapest achievable per-step costs. Never an
  // over-estimate: no real step can beat a fully discounted straight or
  // diagonal, so the first expansion of the goal is still optimal.
  const heuristic = (idx: number): number => {
    const dx = Math.abs((idx % region.width) - (goal % region.width));
    const dz = Math.abs(Math.floor(idx / region.width) - Math.floor(goal / region.width));
    const lo = dx < dz ? dx : dz;
    return (dx + dz) * MIN_STEP_COST + lo * (MIN_DIAGONAL_COST - 2 * MIN_STEP_COST);
  };

  for (let idx = 0; idx < cells; idx++) {
    if (road[idx] !== 1) continue;
    const state = idx * DIR_STATES + NO_DIR;
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
    const idx = Math.floor(state / DIR_STATES);
    if (idx === goal) {
      found = state;
      break;
    }
    const dir = state % DIR_STATES;
    const x = region.x0 + (idx % region.width);
    const z = region.z0 + Math.floor(idx / region.width);
    const here = plan.ground[idx] as number;

    for (const [d, step] of STEPS.entries()) {
      const sx = step[0] as number;
      const sz = step[1] as number;
      const nx = x + sx;
      const nz = z + sz;
      if (!inside(region, nx, nz)) continue;
      const nIdx = index(region, nx, nz);
      const onRoad = road[nIdx] === 1;
      if (blocked[nIdx] === 1 && !onRoad && nIdx !== goal) continue;
      const diagonal = sx !== 0 && sz !== 0;
      // No cutting a corner through a wall or a pond: a diagonal step is only
      // legal when both of the orthogonal cells it squeezes between are legal
      // too. Without this a lane slips between two building corners.
      if (diagonal && !cornerOpen(region, blocked, road, x, z, sx, sz)) continue;
      const wetHere = water !== undefined && water[idx] === 1;
      const wetNext = water !== undefined && water[nIdx] === 1;
      // A bridge runs square across its channel. A diagonal deck would need
      // stepped slabs and a staircase of piers, and neither reads as a bridge
      // from any angle, so a step that touches water must be orthogonal.
      if (diagonal && (wetHere || wetNext)) continue;
      const nState = nIdx * DIR_STATES + d;
      if (closed[nState] === 1) continue;

      // Over water the profile is the deck, not the bed, so the bed's drop is
      // not a cost the route pays.
      const drop = wetHere || wetNext ? 0 : Math.abs((plan.ground[nIdx] as number) - here);
      let cost = (diagonal ? ROAD_DIAGONAL_COST : ROAD_BASE_COST) + ROAD_SLOPE_COST * drop;
      if (wetNext) cost += ROAD_WATER_COST + (wetHere ? 0 : ROAD_BRIDGE_ENTRY);
      if (wallHug !== undefined && wallHug[nIdx] === 1) cost += ROAD_WALL_HUG_COST;
      // A 45° kink is half a turn — which is exactly what buys flowing lanes
      // instead of staircases, because the search can now bend gently.
      if (dir !== NO_DIR && dir !== d) cost += (ROAD_TURN_COST * turnEighths(dir, d)) / 2;
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
    const idx = Math.floor(s / DIR_STATES);
    path.push({ x: region.x0 + (idx % region.width), z: region.z0 + Math.floor(idx / region.width) });
    if ((from[s] as number) < 0) break;
  }
  return path;
}

/**
 * The straight run of cells out of a door, nearest the door first.
 *
 * Stops at the first cell it cannot enter, so a door facing a wall or the
 * region edge degrades to a shorter stub — or to none, in which case the
 * caller simply searches from the anchor as before.
 */
export function doorStub(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  anchor: RoadAnchor,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  if (anchor.nx === 0 && anchor.nz === 0) return out;
  for (let step = 0; step < ROAD_APPROACH_CELLS; step++) {
    const x = anchor.x + anchor.nx * step;
    const z = anchor.z + anchor.nz * step;
    if (!inside(region, x, z)) break;
    const k = index(region, x, z);
    if (blocked[k] === 1 && road[k] === 0) break;
    out.push({ x, z });
  }
  return out;
}

/**
 * Paste a door stub onto the front of a routed path.
 *
 * The search started at the stub's far end, so that cell is `path[0]`; the
 * stub's own last entry is therefore dropped rather than duplicated. Cells the
 * route already revisits are dropped too, so the joined path stays simple.
 */
export function joinStub(
  stub: readonly { x: number; z: number }[],
  path: readonly { x: number; z: number }[],
): { x: number; z: number }[] {
  if (stub.length === 0) return path.slice();
  const out: { x: number; z: number }[] = [];
  const seen = new Set<string>();
  for (const c of [...stub, ...path]) {
    const key = `${c.x},${c.z}`;
    if (seen.has(key)) continue;
    // Only ever 8-connected: if the stub and the search head are not adjacent
    // (the anchor's own cell was blocked and `freeCellNear` stepped aside),
    // drop the stub rather than emit a jump.
    const prev = out[out.length - 1];
    if (prev !== undefined && Math.max(Math.abs(prev.x - c.x), Math.abs(prev.z - c.z)) > 1) {
      return path.slice();
    }
    seen.add(key);
    out.push({ x: c.x, z: c.z });
  }
  return out;
}

/** Both orthogonal cells a diagonal step squeezes between are enterable. */
function cornerOpen(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  x: number,
  z: number,
  sx: number,
  sz: number,
): boolean {
  for (const [cx, cz] of [
    [x + sx, z],
    [x, z + sz],
  ] as const) {
    if (!inside(region, cx, cz)) return false;
    const k = index(region, cx, cz);
    if (blocked[k] === 1 && road[k] === 0) return false;
  }
  return true;
}

/** How many eighths of a turn separate two heading indices, 0..4. */
function turnEighths(a: number, b: number): number {
  // STEPS is ordered cardinals-then-diagonals, which is not angular order, so
  // the angle is read off the deltas rather than off the indices.
  const angle = (d: number): number => {
    const [dx, dz] = STEPS[d] as readonly [number, number];
    // Eighths clockwise from north.
    if (dx === 0 && dz === -1) return 0;
    if (dx === 1 && dz === -1) return 1;
    if (dx === 1 && dz === 0) return 2;
    if (dx === 1 && dz === 1) return 3;
    if (dx === 0 && dz === 1) return 4;
    if (dx === -1 && dz === 1) return 5;
    if (dx === -1 && dz === 0) return 6;
    return 7;
  };
  const d = Math.abs(angle(a) - angle(b));
  return Math.min(d, 8 - d);
}

/**
 * String-pull a found route straight.
 *
 * A\* returns the cheapest *lattice* path, and the cheapest lattice path across
 * gently varying ground is full of one-cell jogs: every one of them costs the
 * same as its neighbour, so the tie-break decides, and the eye reads the result
 * as a wobble. Pulling a string taut through the corridor removes exactly those
 * jogs and nothing else.
 *
 * The rule is conservative on purpose. A segment `i → j` replaces the path
 * between them only when every cell of the straight line is enterable *and* the
 * line's own ground profile is no steeper than the path it replaces — so a lane
 * still walks round a knoll instead of driving through it.
 */
export function smoothRoute(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  plan: ColumnPlan,
  path: readonly { x: number; z: number }[],
  reach: number = ROAD_SMOOTH_REACH,
  water?: Uint8Array,
): { x: number; z: number }[] {
  if (path.length < 3) return path.slice();
  const out: { x: number; z: number }[] = [path[0] as { x: number; z: number }];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    let bestLine: { x: number; z: number }[] | null = null;
    const limit = Math.min(path.length - 1, i + reach);
    for (let j = limit; j > i + 1; j--) {
      const a = path[i] as { x: number; z: number };
      const b = path[j] as { x: number; z: number };
      const line = lineCells(a, b);
      if (!lineLegal(region, blocked, road, line, water)) continue;
      if (roughness(region, plan, line) > roughness(region, plan, path.slice(i, j + 1))) continue;
      best = j;
      bestLine = line;
      break;
    }
    if (bestLine === null) {
      out.push(path[best] as { x: number; z: number });
    } else {
      for (let k = 1; k < bestLine.length; k++) out.push(bestLine[k] as { x: number; z: number });
    }
    i = best;
  }
  return out;
}

/**
 * The 8-connected line between two cells: a Bresenham walk that emits one cell
 * per step and never a diagonal whose corners are both skipped.
 */
export function lineCells(
  a: { x: number; z: number },
  b: { x: number; z: number },
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [{ x: a.x, z: a.z }];
  let x = a.x;
  let z = a.z;
  const dx = Math.abs(b.x - x);
  const dz = Math.abs(b.z - z);
  const sx = x < b.x ? 1 : -1;
  const sz = z < b.z ? 1 : -1;
  let err = dx - dz;
  while (x !== b.x || z !== b.z) {
    const e2 = 2 * err;
    if (e2 > -dz && e2 < dx) {
      // A true diagonal step.
      err += dx - dz;
      x += sx;
      z += sz;
    } else if (e2 > -dz) {
      err -= dz;
      x += sx;
    } else {
      err += dx;
      z += sz;
    }
    out.push({ x, z });
  }
  return out;
}

/** Every cell of a candidate straight is enterable. */
function lineLegal(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  line: readonly { x: number; z: number }[],
  water?: Uint8Array,
): boolean {
  for (const [i, c] of line.entries()) {
    if (!inside(region, c.x, c.z)) return false;
    const k = index(region, c.x, c.z);
    if (blocked[k] === 1 && road[k] === 0) return false;
    // The smoother knows nothing about bridge cost or deck geometry, so it is
    // simply not allowed to invent or reroute a crossing: any candidate
    // straight that touches water is rejected and the route keeps the cells
    // the priced search chose.
    if (water !== undefined && water[k] === 1) return false;
    if (i === 0) continue;
    const p = line[i - 1] as { x: number; z: number };
    const sx = c.x - p.x;
    const sz = c.z - p.z;
    if (sx !== 0 && sz !== 0 && !cornerOpen(region, blocked, road, p.x, p.z, sx, sz)) return false;
  }
  return true;
}

/** Total absolute ground change along a run of cells — its "steepness bill". */
function roughness(
  region: Region,
  plan: ColumnPlan,
  cells: readonly { x: number; z: number }[],
): number {
  let sum = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1] as { x: number; z: number };
    const b = cells[i] as { x: number; z: number };
    if (!inside(region, a.x, a.z) || !inside(region, b.x, b.z)) return Infinity;
    sum += Math.abs(
      (plan.ground[index(region, b.x, b.z)] as number) -
        (plan.ground[index(region, a.x, a.z)] as number),
    );
  }
  return sum;
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
  deckFloor: readonly number[] | number = 0,
): number[] {
  const n = ground.length;
  const out = new Array<number>(n);
  const bandAt = (i: number): number => (typeof band === "number" ? band : (band[i] as number));
  const floorAt = (i: number): number =>
    Math.max(seaLevel + 1, typeof deckFloor === "number" ? deckFloor : (deckFloor[i] as number));

  for (let i = 0; i < n; i++) out[i] = (ground[i] as number) + bandAt(i);
  for (let i = 1; i < n; i++) out[i] = Math.min(out[i] as number, (out[i - 1] as number) + 1);
  for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i] as number, (out[i + 1] as number) + 1);

  // The floor is now per-cell — a bridge deck has to clear the water it spans,
  // and the water it spans need not be the sea. A per-cell floor is not
  // 1-Lipschitz on its own, so it is first replaced by its *upper* envelope of
  // unit cones, `max_j (floor[j] − |i − j|)`. That is 1-Lipschitz by the same
  // argument the lower envelope is, and the pointwise max of two 1-Lipschitz
  // functions is 1-Lipschitz — which is how the grade cap survives a bridge,
  // and why the ramp onto a deck is graded rather than a step.
  const floor = new Array<number>(n);
  for (let i = 0; i < n; i++) floor[i] = floorAt(i);
  for (let i = 1; i < n; i++) floor[i] = Math.max(floor[i] as number, (floor[i - 1] as number) - 1);
  for (let i = n - 2; i >= 0; i--) floor[i] = Math.max(floor[i] as number, (floor[i + 1] as number) - 1);

  for (let i = 0; i < n; i++) out[i] = Math.max(out[i] as number, floor[i] as number);
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
  /** Bridge deck: a top slab, so the deck is flush with the lane it joins. */
  readonly deck: number;
  /** Bridge pier: the column dropped from the deck to the bed at each end. */
  readonly pier: number;
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
    // A *top* slab, not a bottom one: the lane it meets has its walking
    // surface at `y + 1`, and a bottom slab would put the deck half a block
    // below that — a step at both banks and a visible seam from every angle.
    deck: palette.has("road.deck")
      ? palette.state("road.deck")
      : (stack.blockStateOf("oak_slab", { type: "top", waterlogged: "false" }) ??
        fallback("oak_planks")),
    pier: palette.has("road.pier") ? palette.state("road.pier") : fallback("oak_log"),
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
  roadY: Int32Array,
  path: readonly { x: number; z: number; y: number }[],
  width: number,
  states: RoadStates,
  occupancy: OccupancyGrid | undefined,
  paved: Uint8Array,
  water: Uint8Array,
  bridged: Uint8Array,
): void {
  const half = (width - 1) >> 1;
  const offsets: number[] = [];
  for (let o = -half; o <= width - 1 - half; o++) offsets.push(o);

  for (const [i, cell] of path.entries()) {
    const heading = headingAt(path, i);
    const isStep = i > 0 && cell.y !== (path[i - 1] as { y: number }).y;
    const band: { x: number; z: number; outer: boolean }[] = [];
    for (const offset of offsets) {
      band.push({
        x: cell.x + heading.pz * offset,
        z: cell.z + heading.px * offset,
        outer: offsets.length > 1 && Math.abs(offset) === Math.max(half, width - 1 - half),
      });
    }
    // A diagonal step touches its two neighbours only at a corner, which the
    // eye reads as a broken ribbon. Surfacing the pair of orthogonal cells the
    // step passes between closes it without widening the lane anywhere else.
    if (i > 0) {
      const prev = path[i - 1] as { x: number; z: number };
      if (prev.x !== cell.x && prev.z !== cell.z) {
        band.push({ x: prev.x, z: cell.z, outer: false });
        band.push({ x: cell.x, z: prev.z, outer: false });
      }
    }
    for (const spot of band) {
      const x = spot.x;
      const z = spot.z;
      if (!inside(region, x, z)) continue;
      const idx = index(region, x, z);
      // A bridge cell is *not* surfaced. The whole point of a deck is that the
      // water underneath it is undisturbed — rewriting the column here would
      // fill the channel with dirt path and, worse, would move `ground` and
      // `fluidTop` under a river the fluid validator has already settled.
      // It still counts as road, so the network stays connected and the
      // canopy clip keeps the deck clear.
      if (water[idx] === 1) {
        road[idx] = 1;
        roadY[idx] = cell.y;
        bridged[idx] = 1;
        if (occupancy !== undefined) claim(occupancy, idx);
        continue;
      }
      // Never surface a foreign footprint, even in the shoulder.
      if (blocked[idx] === 1) continue;
      // The plaza surfaced itself; a lane crossing the green is *on* the green.
      // It still counts as road for routing, occupancy and lantern spacing.
      if (paved[idx] === 1) {
        road[idx] = 1;
        roadY[idx] = plan.ground[idx] as number;
        if (occupancy !== undefined) claim(occupancy, idx);
        continue;
      }

      const outer = spot.outer;
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
      roadY[idx] = cell.y;
      if (occupancy !== undefined) claim(occupancy, idx);
    }
  }
}

/**
 * Surface a route's water crossings as bridges.
 *
 * A bridge is three things, and it needs all three to read as one from the
 * ground: a **deck** one block wider on each side than the lane it carries
 * (top slabs at the graded profile height, so it is flush with both banks), a
 * **rail** of fence along those two extra columns, and a **pier** at each end
 * of the span dropping from the deck to the river bed.
 *
 * Nothing here touches the column plan. Every block is emitted as a structure
 * block over water the terrain pass already settled, so a bridge cannot
 * destabilize a fluid — the validator reads the plan, and the plan still says
 * "river". The piers do replace water blocks in their own columns, which is
 * both what a pier is and harmless: a full column of solid has no exposed
 * face for its neighbours to flow into.
 */
function buildBridgeDeck(
  region: Region,
  plan: ColumnPlan,
  path: readonly { x: number; z: number; y: number }[],
  width: number,
  states: RoadStates,
  out: StructureBlock[],
  water: Uint8Array,
): void {
  const half = (width - 1) >> 1;
  const outer = half + 1;
  const wetAt = (x: number, z: number): boolean =>
    inside(region, x, z) && water[index(region, x, z)] === 1;

  for (const [i, cell] of path.entries()) {
    if (!wetAt(cell.x, cell.z)) continue;
    const heading = headingAt(path, i);
    // The ends of the span: the neighbours along the route that are dry.
    const prev = path[i - 1];
    const next = path[i + 1];
    const isEnd =
      prev === undefined ||
      next === undefined ||
      !wetAt(prev.x, prev.z) ||
      !wetAt(next.x, next.z);

    for (let o = -outer; o <= outer; o++) {
      const x = cell.x + heading.pz * o;
      const z = cell.z + heading.px * o;
      if (!wetAt(x, z)) continue;
      out.push({ x, y: cell.y, z, stateId: states.deck });
      if (Math.abs(o) !== outer) continue;
      // Rail, and at the ends of the span a pier under it down to the bed.
      out.push({ x, y: cell.y + 1, z, stateId: states.post });
      if (!isEnd) continue;
      const bed = plan.ground[index(region, x, z)] as number;
      for (let y = bed + 1; y < cell.y; y++) {
        out.push({ x, y, z, stateId: states.pier });
      }
    }
  }
}

/**
 * Grade the two columns either side of a lane into it.
 *
 * Grading gives the lane a 1-Lipschitz profile; it says nothing about what the
 * lane's *edge* looks like. Across a slope that edge is a cut face on the
 * uphill side and a fill face on the downhill one, and at the road's own
 * grade those faces can be several blocks tall — which is what makes a lane
 * read as a shelf bulldozed across a field rather than a track worn into it.
 *
 * The fix is a verge: within {@link ROAD_SHOULDER_REACH} columns of the lane,
 * the ground is pulled to within `k + 1` blocks of the road surface at ring
 * `k`, so the land ramps up to (or down to) the lane over two columns instead
 * of stepping. Only the *height* moves — the surface block is left alone, so a
 * lane through grass keeps grass right up to its shoulder.
 *
 * Three columns are never touched: anything claimed (road, plaza, footprint),
 * anything wet, and anything **next to** something wet. The last is the fluid
 * invariant: lowering a dry column beside a river opens a face the river would
 * flow into on the first tick, and a bridge that drains its own channel is a
 * worse defect than the embankment this fixes.
 */
function blendShoulders(
  region: Region,
  plan: ColumnPlan,
  road: Uint8Array,
  roadY: Int32Array,
  blocked: Uint8Array,
  paved: Uint8Array,
): void {
  const n = region.width * region.depth;
  // Ring dilation of the finished road mask, not perpendicular offsets from a
  // centre line. The offset form was the obvious one and it is wrong on a
  // diagonal: cells at perpendicular distance 2 and 3 from a 45° lane are
  // themselves √2 apart, so the verge came out as a checkerboard of graded and
  // ungraded columns — clearly visible from the map as a dithered swathe
  // beside every diagonal lane. A dilation has no such gaps by construction,
  // and it needs no notion of heading at all.
  let frontier = road;
  const claimed = new Uint8Array(n);
  const height = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    if (road[k] === 1) {
      claimed[k] = 1;
      height[k] = roadY[k] as number;
    }
  }

  for (let ring = 1; ring <= ROAD_SHOULDER_REACH; ring++) {
    const next = new Uint8Array(n);
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const idx = j * region.width + i;
        if (frontier[idx] !== 1) continue;
        const y = height[idx] as number;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
            const k = jj * region.width + ii;
            if (claimed[k] === 1) continue;
            claimed[k] = 1;
            next[k] = 1;
            height[k] = y;
          }
        }
      }
    }

    const allowed = ring;
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const idx = j * region.width + i;
        if (next[idx] !== 1) continue;
        if (blocked[idx] === 1 || paved[idx] === 1) continue;
        if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
        const x = region.x0 + i;
        const z = region.z0 + j;
        // Lowering a dry column beside water opens a face the water would flow
        // into on the first tick. A verge is never worth draining a river for.
        if (nearFluid(region, plan, x, z)) continue;

        const y = height[idx] as number;
        const g = plan.ground[idx] as number;
        const target = g > y + allowed ? y + allowed : g < y - allowed ? y - allowed : g;
        if (target === g) continue;
        plan.ground[idx] = target;
        plan.fluidTop[idx] = target;
        if (plan.soil[idx] === 0) plan.soil[idx] = 1;
      }
    }
    frontier = next;
  }
}

/** True when `(x, z)` or any of its four neighbours holds a fluid. */
function nearFluid(region: Region, plan: ColumnPlan, x: number, z: number): boolean {
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const nz = z + dz;
    if (!inside(region, nx, nz)) continue;
    if (plan.fluidKind[index(region, nx, nz)] !== FluidKind.NONE) return true;
  }
  return false;
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
 * Plant lamp posts along a route, alternating sides.
 *
 * A lamp is **two** fence posts and a lantern on top, not one. A single post
 * puts the light at eye level of the ground it stands on, and from any angle
 * above — which is every angle a render or a player on a hill has — it reads as
 * a lantern half-buried in the grass. Two courses lift it clear.
 *
 * Support is checked, not assumed: the post stands on the finished ground of a
 * dry, non-road column, and each block of the lamp rests on the one below it.
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
    out.push({ x, y: base + 1, z, stateId: states.post });
    out.push({ x, y: base + 2, z, stateId: states.lantern });
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
