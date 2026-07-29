/**
 * The underground connective pass: `connected … via "tunnel"` → a walkable
 * gallery between two cellars.
 *
 * This is the other half of the constraint the layout solver only *costs*
 * (§4 `connected`: soft proximity in pass 3, realization in pass 6). By the
 * time this runs the buildings exist, their cellars are dug, and the column
 * plan is final — which is the only point in the pipeline where a router can
 * see everything it has to dodge.
 *
 * ## What the router is actually solving
 *
 * A 3-D A* over `(column, floor Y)`, four-connected horizontally, with a rise
 * or fall of at most one block per step. Not eight-connected, unlike the road
 * router: a three-wide bore taken diagonally is a staircase of overlapping
 * squares from the inside and needs mitred lining at every cell, and a tunnel
 * is a thing dug by people with picks, so it turns in right angles. Y is a real
 * search dimension rather than a profile fitted afterwards, because the whole
 * difficulty of an underground route is vertical: it has to stay under the
 * ground, over the void, clear of every cave and four blocks from every drop
 * of water, and those four constraints disagree about which way to go.
 *
 * ## What it hard-avoids, and why each one is hard rather than costly
 *
 * - **Water and lava**, by the cave carver's own shell rule and its own
 *   machinery (`dilate` by {@link TUNNEL_FLUID_SHELL}). A tunnel that surfaces
 *   into a lake does not read as a design decision.
 * - **The ocean keep-out**, likewise dilated: below sea level and near the sea,
 *   there is no roof thickness that makes a dry gallery believable.
 * - **Existing caves**, dilated horizontally, because a tunnel that opens into
 *   a cave system is a tunnel with mobs in it.
 * - **Other buildings' foundations**, so a gallery never passes under a third
 *   party's cellar and takes its floor with it.
 * - **Tunnels already built**, in document order. v0.2 §4 allows a deliberate
 *   junction; this version routes around instead, because a junction is only
 *   trivially safe when the two galleries share a floor level *and* cross
 *   square, and proving that is more machinery than a second tunnel is worth
 *   today. Routing around is never wrong, only longer.
 *
 * ## The one place the roof rule is relaxed
 *
 * A cellar's floor is four or five blocks under a building's ground floor, and
 * the ground outside the building is at the building's own level, so the first
 * few blocks out of a cellar wall necessarily have a thin roof. The portal —
 * {@link TUNNEL_PORTAL_CELLS} cells, straight out of the wall, descending one
 * block per cell — is the fixed run that gets the gallery down to a depth where
 * the roof rule holds, and it is the only part of a tunnel exempt from it. The
 * ground it passes under is the building's own levelled pad, so those blocks
 * are the pad's fill, not a hillside.
 */

import {
  dilate,
  type BuildingMaterials,
  type CaveSpans,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";
import { warning, type LoamDiagnostic, type PortDeclaration } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid, Placement, ResolvedPort } from "../layout/types.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { detailSeed, hash3 } from "../terrain/detail.js";

import type { BuiltBuilding, StructureBlock } from "./buildings.js";
import { index, inside } from "./roads.js";

/* -------------------------------------------------------------------------- */
/* the shape of a tunnel                                                       */
/* -------------------------------------------------------------------------- */

/** Clear width of the bore, in blocks. Odd, so it has a centre line. */
export const TUNNEL_WIDTH = 3;

/** Clear height of the bore on a level run. */
export const TUNNEL_HEIGHT = 3;

/** Clear height at a step, so the ceiling has somewhere to change level. */
export const TUNNEL_FLIGHT_HEIGHT = 4;

/** Rock left between a tunnel's ceiling and the surface, outside the portals. */
export const TUNNEL_ROOF_THICKNESS = 4;

/** Horizontal shell kept from any fluid column — the cave carver's rule. */
export const TUNNEL_FLUID_SHELL = 4;

/** Horizontal reach of the ocean keep-out. */
export const TUNNEL_OCEAN_KEEPOUT = 8;

/** Deepest a gallery may run. */
export const TUNNEL_FLOOR_Y = -60;

/**
 * Cells of straight run out of each cellar wall: one level, then a descent of
 * one block per cell.
 *
 * This is the **cap**, not the length. A cellar floor sits `depth` blocks under
 * a building's ground floor and the ground outside is at the building's own
 * level, so a gallery leaving a cellar starts with about one block of rock over
 * it and has to buy its way down to a full {@link TUNNEL_ROOF_THICKNESS}. How
 * many cells that takes depends on which way the ground outside is going, so
 * the run descends until the roof rule holds and stops — and this bounds it, so
 * a building on a downhill slope digs a long ramp rather than an endless one.
 */
export const TUNNEL_PORTAL_CELLS = 12;

/** Cells between support frames. */
export const TUNNEL_FRAME_SPACING = 6;

/**
 * Frames between lanterns.
 *
 * The lantern hangs from a frame's lintel, because the lintel is the only
 * block in a tunnel's ceiling that is guaranteed to be there and guaranteed to
 * be solid — so the spacing the author would write (every eight blocks) snaps
 * to the frame lattice, and every second frame is the nearest it gets.
 */
export const TUNNEL_LANTERN_EVERY_N_FRAMES = 2;

/** Blocks of Y the router may explore above and below the deeper endpoint. */
export const TUNNEL_Y_BAND = 12;

/** Per-step A* cost of one block of horizontal run. */
export const TUNNEL_STEP_COST = 10;

/** Extra cost of a step that also changes level — what keeps a gallery flat. */
export const TUNNEL_RISE_COST = 16;

/* -------------------------------------------------------------------------- */
/* inputs and outputs                                                          */
/* -------------------------------------------------------------------------- */

/** One `connected … via "tunnel"` pair, already resolved to node paths. */
export interface TunnelLink {
  /** Stable id: `"<fromId>__<toId>"`, used for the diagnostic path. */
  readonly id: string;
  readonly fromPath: string;
  readonly toPath: string;
  /** Declared `from` / `to` port names, when the document named them. */
  readonly fromPort?: string;
  readonly toPort?: string;
  /** `maxLength`, when the constraint set one. */
  readonly maxLength?: number;
}

/** One end of a tunnel, resolved against a built cellar. */
interface Portal {
  readonly nodePath: string;
  /** The wall column the opening is cut through, on the footprint perimeter. */
  readonly wall: { readonly x: number; readonly z: number };
  /** Outward step, away from the building. */
  readonly out: readonly [number, number];
  /** The cellar's walkable floor Y. */
  readonly y: number;
  /** A standable cell inside the cellar, in front of the opening. */
  readonly landing: { readonly x: number; readonly y: number; readonly z: number };
}

/** One cell of a tunnel's centre line. */
export interface TunnelCell {
  readonly x: number;
  readonly z: number;
  /** Walkable floor Y: the block under it is the gallery floor. */
  readonly y: number;
  /** True when this cell's floor block is a step in a flight. */
  readonly flight: boolean;
  /** True inside a portal run, where the roof rule is relaxed by design. */
  readonly portal: boolean;
}

/** What one tunnel became. */
export interface BuiltTunnel {
  readonly id: string;
  readonly fromPath: string;
  readonly toPath: string;
  /** Centre line, from the `from` cellar to the `to` cellar. */
  readonly path: readonly TunnelCell[];
  /** Standable cells inside each cellar, for the traversal lint. */
  readonly endpoints: readonly [
    { readonly x: number; readonly y: number; readonly z: number },
    { readonly x: number; readonly y: number; readonly z: number },
  ];
  readonly carvedBlocks: number;
  readonly liningBlocks: number;
  readonly stairSteps: number;
  readonly frames: number;
  readonly lanterns: number;
}

/** Everything {@link buildTunnels} reads. */
export interface TunnelPassInput {
  readonly links: readonly TunnelLink[];
  readonly buildings: readonly BuiltBuilding[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  /** Declared ports per node path, so a `tunnel_stub` can pick its own wall. */
  readonly declaredPorts: ReadonlyMap<string, Readonly<Record<string, PortDeclaration>>>;
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly seed: Seed256;
  /** The village's stone family; the gallery is lined in it. */
  readonly materials?: BuildingMaterials;
  /** Claimed, so the scatter keeps a portal's mouth clear of trunks. */
  readonly occupancy?: OccupancyGrid;
}

/** What the tunnel pass produced. */
export interface TunnelPassResult {
  readonly tunnels: readonly BuiltTunnel[];
  /** Lining, stamped with the rest of the structure blocks. */
  readonly blocks: readonly StructureBlock[];
  /** The bore, as per-column air spans — merged into the plan by the caller. */
  readonly spans: CaveSpans;
  /** 1 for a column a tunnel bore passes through. */
  readonly columns: Uint8Array;
  /** 1 for a column inside a portal run, where the roof rule is relaxed. */
  readonly portalColumns: Uint8Array;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Route and build every declared tunnel, in document order.
 *
 * Order is load-bearing twice over: it fixes which tunnel gets the direct line
 * when two would cross, and it is what makes the result a pure function of the
 * document rather than of a map's iteration.
 */
export function buildTunnels(input: TunnelPassInput): TunnelPassResult {
  const { plan } = input;
  const { region } = plan;
  const n = region.width * region.depth;
  const diagnostics: LoamDiagnostic[] = [];
  const tunnels: BuiltTunnel[] = [];
  const blocks: StructureBlock[] = [];
  const columns = new Uint8Array(n);
  const portalColumns = new Uint8Array(n);
  /** Per-column carved runs, accumulated across tunnels and merged at the end. */
  const carved = new Map<number, number[]>();

  if (input.links.length === 0) {
    return { tunnels, blocks, spans: emptySpans(n), columns, portalColumns, diagnostics };
  }

  const byPath = new Map(input.buildings.map((b) => [b.nodePath, b] as const));
  const states = resolveTunnelStates(input.stack, input.materials);
  const obstacles = buildObstacleMask(input);
  /** Columns an earlier tunnel already claimed. */
  const taken = new Uint8Array(n);

  for (const link of input.links) {
    const from = byPath.get(link.fromPath);
    const to = byPath.get(link.toPath);
    if (from === undefined || to === undefined || from.basementDepth === 0 || to.basementDepth === 0) {
      // Only reachable when the solver dropped one end (`optional: true`), or
      // when a cellar could not be dug. §4 calls both ends existing a hard
      // precondition, so this is worth saying out loud.
      diagnostics.push(
        warning(
          "TUNNEL_UNROUTABLE",
          link.id,
          `no tunnel was dug between "${link.fromPath}" and "${link.toPath}": ${
            from === undefined || to === undefined
              ? "one end was not placed"
              : "one end has no cellar to open into"
          }`,
          'both ends must be placed buildings — drop "optional": true from them, or widen the envelope that stopped one being placed',
        ),
      );
      continue;
    }

    const portalA = portalOf(from, to, input);
    const portalB = portalOf(to, from, input);
    const built = routeAndBuild({
      link,
      input,
      portalA,
      portalB,
      obstacles,
      taken,
      states,
      carved,
      columns,
      portalColumns,
      blocks,
    });
    if (built === null) {
      diagnostics.push(
        warning(
          "TUNNEL_UNROUTABLE",
          link.id,
          `no route between the cellars of "${link.fromPath}" and "${link.toPath}" clears the caves, water and foundations between them`,
          "move one of the two buildings — a shorter or straighter line between them is what this needs; the solver report shows what is pinning each one where it is",
        ),
      );
      continue;
    }
    if (link.maxLength !== undefined && built.path.length > link.maxLength) {
      diagnostics.push(
        warning(
          "TUNNEL_UNROUTABLE",
          link.id,
          `the route is ${built.path.length} blocks long, past the declared maxLength of ${link.maxLength}; it was dug anyway`,
          `raise "maxLength" to at least ${built.path.length}, or move the two ends closer together`,
        ),
      );
    }
    tunnels.push(built);
  }

  if (input.occupancy !== undefined) {
    for (let idx = 0; idx < n; idx++) {
      if (portalColumns[idx] === 1) input.occupancy.mask[idx] = 1;
    }
  }

  return { tunnels, blocks, spans: flattenSpans(carved, n), columns, portalColumns, diagnostics };
}

/* -------------------------------------------------------------------------- */
/* portals                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where a tunnel leaves one building for another.
 *
 * A declared `tunnel_stub` port wins outright — that is what declaring one is
 * for — and only its *face* and its position along that face are read, because
 * the port's own Y is resolved against the building's floor and a tunnel meets
 * the cellar, four or five blocks lower. When nothing is declared the face is
 * the one whose outward normal points most directly at the other end, which is
 * the shortest gallery the geometry allows.
 */
function portalOf(self: BuiltBuilding, other: BuiltBuilding, input: TunnelPassInput): Portal {
  const rect = self.footprint;
  const declared = declaredStub(self.nodePath, input);
  const face =
    declared === null
      ? faceToward(rect, other.footprint)
      : (declared.face as "north" | "south" | "east" | "west");
  const out = FACE_STEP[face];

  // The wall column: the declared stub's position clamped onto the face, else
  // its midpoint. Either way it is pulled one block off each corner, because a
  // three-wide bore through a corner post opens two walls at once.
  const along = declared === null ? null : (out[0] === 0 ? declared.x : declared.z);
  const wall = wallColumn(rect, face, along);
  const y = self.basementFloorY as number;
  return {
    nodePath: self.nodePath,
    wall,
    out,
    y,
    landing: { x: wall.x - out[0], y, z: wall.z - out[1] },
  };
}

const FACE_STEP: Readonly<Record<"north" | "south" | "east" | "west", readonly [number, number]>> =
  Object.freeze({ north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] });

/** The declared `tunnel_stub` port of a node, resolved into the world. */
function declaredStub(
  nodePath: string,
  input: TunnelPassInput,
): { face: string; x: number; z: number } | null {
  for (const port of input.ports) {
    if (port.nodePath !== nodePath || port.type !== "tunnel_stub") continue;
    return { face: port.face, x: port.position[0], z: port.position[2] };
  }
  return null;
}

/** The footprint face pointing most directly at another footprint. */
function faceToward(self: Rect, other: Rect): "north" | "south" | "east" | "west" {
  const dx = (other.x0 + other.x1) / 2 - (self.x0 + self.x1) / 2;
  const dz = (other.z0 + other.z1) / 2 - (self.z0 + self.z1) / 2;
  // Ties resolve to the X axis, deterministically — the same rule the `facing`
  // constraint uses, for the same reason.
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? "east" : "west";
  return dz >= 0 ? "south" : "north";
}

/** The column an opening is cut through, kept clear of both corner posts. */
function wallColumn(
  rect: Rect,
  face: "north" | "south" | "east" | "west",
  along: number | null,
): { x: number; z: number } {
  const half = (TUNNEL_WIDTH - 1) >> 1;
  if (face === "north" || face === "south") {
    const mid = along ?? Math.floor((rect.x0 + rect.x1) / 2);
    return { x: clamp(mid, rect.x0 + half + 1, rect.x1 - half - 1), z: face === "north" ? rect.z0 : rect.z1 };
  }
  const mid = along ?? Math.floor((rect.z0 + rect.z1) / 2);
  return { x: face === "west" ? rect.x0 : rect.x1, z: clamp(mid, rect.z0 + half + 1, rect.z1 - half - 1) };
}

/* -------------------------------------------------------------------------- */
/* the obstacle mask                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Columns no gallery may pass under, whatever depth it is at.
 *
 * Each term is a *column* rule rather than a `(column, Y)` rule, which makes it
 * a conservative over-approximation of the real constraint — a cave forty
 * blocks above the search band closes its column here. That is the right trade:
 * the alternative is a per-Y test inside the A* inner loop, and a tunnel routed
 * ten blocks around a cave it would have missed anyway is invisible, while a
 * tunnel that breaks into one is not.
 *
 * The whole mask is then dilated by one, because the bore is three wide and the
 * router only ever tracks its centre line.
 */
export function buildObstacleMask(input: TunnelPassInput): Uint8Array {
  const { plan } = input;
  const { region } = plan;
  const n = region.width * region.depth;
  const fluid = new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    if (plan.fluidKind[idx] !== FluidKind.NONE) fluid[idx] = 1;
  }
  const nearFluid = dilate(fluid, region.width, region.depth, TUNNEL_FLUID_SHELL);
  const nearOcean = dilate(plan.oceanMask, region.width, region.depth, TUNNEL_OCEAN_KEEPOUT);

  const blocked = new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    if (nearFluid[idx] === 1 || nearOcean[idx] === 1) blocked[idx] = 1;
  }
  // Existing caves: any column the carver opened at all.
  const caves = plan.caves;
  if (caves !== undefined) {
    for (let idx = 0; idx < n; idx++) {
      if ((caves.spans.offsets[idx + 1] as number) > (caves.spans.offsets[idx] as number)) {
        blocked[idx] = 1;
      }
    }
  }
  // Every placed footprint. The two ends of each tunnel are cleared again just
  // before that tunnel is routed, so a gallery may enter its *own* cellars and
  // nobody else's.
  for (const placement of input.placements) {
    stampRect(region, blocked, placement.footprint, 1);
  }
  return dilate(blocked, region.width, region.depth, 1);
}

/* -------------------------------------------------------------------------- */
/* routing and building                                                        */
/* -------------------------------------------------------------------------- */

interface RouteRequest {
  readonly link: TunnelLink;
  readonly input: TunnelPassInput;
  readonly portalA: Portal;
  readonly portalB: Portal;
  readonly obstacles: Uint8Array;
  readonly taken: Uint8Array;
  readonly states: TunnelStates;
  readonly carved: Map<number, number[]>;
  readonly columns: Uint8Array;
  readonly portalColumns: Uint8Array;
  readonly blocks: StructureBlock[];
}

function routeAndBuild(r: RouteRequest): BuiltTunnel | null {
  const { input, portalA, portalB } = r;
  const { region } = input.plan;
  void region;

  const stubA = portalRun(portalA, input.plan);
  const stubB = portalRun(portalB, input.plan);

  // Free the two portals from the obstacle mask: their columns are inside (or
  // one ring outside) their own building, which the mask blanket-closed.
  const open = Uint8Array.from(r.obstacles);
  for (let idx = 0; idx < open.length; idx++) {
    if (r.taken[idx] === 1) open[idx] = 1;
  }
  for (const cell of [...stubA, ...stubB]) clearSwath(region, open, cell);

  const head = stubA[stubA.length - 1] as TunnelCell;
  const tail = stubB[stubB.length - 1] as TunnelCell;
  const middle = routeTunnel(input.plan, open, head, tail);
  if (middle === null) return null;

  // `middle` starts at `head` and ends at `tail`; the two stubs already hold
  // those cells, so the joins drop one each.
  const path: TunnelCell[] = [
    ...stubA,
    ...middle.slice(1, -1),
    ...[...stubB].reverse(),
  ];
  markFlights(path);

  const carveSet = carveTunnel(r, path);
  const lining = lineTunnel(r, path, carveSet);

  // Every column this gallery touched is closed to the next one: v0 routes
  // around rather than junctioning, so the claim is the whole bore, not just
  // its centre line.
  for (const idx of carveSet.columns) r.taken[idx] = 1;

  return {
    id: r.link.id,
    fromPath: portalA.nodePath,
    toPath: portalB.nodePath,
    path,
    endpoints: [portalA.landing, portalB.landing],
    carvedBlocks: carveSet.blocks,
    liningBlocks: lining.blocks,
    stairSteps: path.filter((c) => c.flight).length,
    frames: lining.frames,
    lanterns: lining.lanterns,
  };
}

/**
 * The fixed run out of one cellar wall, wall cell first.
 *
 * The descent starts immediately, at the wall itself, which is what keeps the
 * cell in front of the building under its own ground rather than through it.
 * The step out of the cellar therefore lands its stair *inside* the footprint —
 * on the one column of the cellar's floor slab that the doorway stands on. That
 * is the single exception to "this pass never writes inside a building", and it
 * is the right one: the block in question is the threshold.
 */
function portalRun(portal: Portal, plan: ColumnPlan): TunnelCell[] {
  const { region, ground } = plan;
  const out: TunnelCell[] = [
    { x: portal.wall.x, z: portal.wall.z, y: portal.y, flight: false, portal: true },
  ];
  for (let k = 1; k <= TUNNEL_PORTAL_CELLS; k++) {
    const x = portal.wall.x + portal.out[0] * k;
    const z = portal.wall.z + portal.out[1] * k;
    const y = portal.y - k;
    out.push({ x, z, y, flight: false, portal: true });
    if (!inside(region, x, z)) break;
    // Stop as soon as the gallery is deep enough for the ordinary rule: from
    // here on the router is on its own terms, and nothing downstream has to
    // make an exception for it.
    const g = ground[index(region, x, z)] as number;
    if (y + TUNNEL_FLIGHT_HEIGHT - 1 + TUNNEL_ROOF_THICKNESS <= g) break;
  }
  return out;
}

/** Open a cell and its two bore neighbours in a working obstacle mask. */
function clearSwath(region: Region, mask: Uint8Array, cell: TunnelCell): void {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!inside(region, cell.x + dx, cell.z + dz)) continue;
      mask[index(region, cell.x + dx, cell.z + dz)] = 0;
    }
  }
}

/** Mark the cells whose floor block is a step: the higher end of each rise. */
function markFlights(path: TunnelCell[]): void {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as TunnelCell;
    const b = path[i] as TunnelCell;
    if (a.y === b.y) continue;
    const higher = a.y > b.y ? i - 1 : i;
    path[higher] = { ...(path[higher] as TunnelCell), flight: true };
  }
}

/* -------------------------------------------------------------------------- */
/* the A*                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Route between two portal ends.
 *
 * State is `(column, floor Y)`. A state is legal when its column is open, its
 * floor slab has rock under it, and its ceiling has {@link TUNNEL_ROOF_THICKNESS}
 * blocks of rock over it. Steps are four-connected with `|Δy| ≤ 1`; a step that
 * changes level costs {@link TUNNEL_RISE_COST} extra, which is what makes the
 * gallery run flat and climb only where the ground forces it to.
 *
 * The heuristic is Manhattan distance at the cheapest possible step, so it
 * never over-estimates and the first expansion of a goal column at the goal Y
 * is optimal. Ties break on the lower state key, so the result does not depend
 * on the heap's internals.
 */
export function routeTunnel(
  plan: ColumnPlan,
  open: Uint8Array,
  start: TunnelCell,
  goal: TunnelCell,
): TunnelCell[] | null {
  const { region, ground } = plan;
  const cells = region.width * region.depth;
  const yLo = Math.min(start.y, goal.y) - TUNNEL_Y_BAND;
  const yHi = Math.max(start.y, goal.y) + TUNNEL_Y_BAND;
  const ySpan = yHi - yLo + 1;
  const states = cells * ySpan;

  const legal = (idx: number, y: number): boolean => {
    if (y < yLo || y > yHi) return false;
    if (open[idx] === 1) return false;
    if (y - 1 <= TUNNEL_FLOOR_Y) return false;
    return y + TUNNEL_FLIGHT_HEIGHT - 1 + TUNNEL_ROOF_THICKNESS <= (ground[idx] as number);
  };

  const startIdx = index(region, start.x, start.z);
  const goalIdx = index(region, goal.x, goal.z);
  const goalState = goalIdx * ySpan + (goal.y - yLo);
  const goalX = region.x0 + (goalIdx % region.width);
  const goalZ = region.z0 + Math.floor(goalIdx / region.width);

  const g = new Float64Array(states).fill(Infinity);
  const from = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const heap = new TunnelHeap();

  const heuristic = (idx: number, y: number): number => {
    const x = region.x0 + (idx % region.width);
    const z = region.z0 + Math.floor(idx / region.width);
    return (Math.abs(x - goalX) + Math.abs(z - goalZ)) * TUNNEL_STEP_COST + Math.abs(y - goal.y) * TUNNEL_STEP_COST;
  };

  const startState = startIdx * ySpan + (start.y - yLo);
  if (start.y < yLo || start.y > yHi) return null;
  g[startState] = 0;
  heap.push(heuristic(startIdx, start.y), startState);

  let found = -1;
  while (heap.size > 0) {
    const state = heap.pop();
    if (closed[state] === 1) continue;
    closed[state] = 1;
    if (state === goalState) {
      found = state;
      break;
    }
    const idx = Math.floor(state / ySpan);
    const y = yLo + (state % ySpan);
    const x = region.x0 + (idx % region.width);
    const z = region.z0 + Math.floor(idx / region.width);

    for (const [sx, sz] of ORTHOGONAL) {
      const nx = x + sx;
      const nz = z + sz;
      if (!inside(region, nx, nz)) continue;
      const nIdx = index(region, nx, nz);
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        // The goal is entered on its own terms: it is a portal cell, and portal
        // cells are exempt from the roof rule by construction.
        if (!(nIdx === goalIdx && ny === goal.y) && !legal(nIdx, ny)) continue;
        const nState = nIdx * ySpan + (ny - yLo);
        if (closed[nState] === 1) continue;
        const cost = TUNNEL_STEP_COST + (dy === 0 ? 0 : TUNNEL_RISE_COST);
        const tentative = (g[state] as number) + cost;
        if (tentative >= (g[nState] as number)) continue;
        g[nState] = tentative;
        from[nState] = state;
        heap.push(tentative + heuristic(nIdx, ny), nState);
      }
    }
  }

  if (found < 0) return null;
  const out: TunnelCell[] = [];
  for (let s = found; s >= 0; s = from[s] as number) {
    const idx = Math.floor(s / ySpan);
    out.push({
      x: region.x0 + (idx % region.width),
      z: region.z0 + Math.floor(idx / region.width),
      y: yLo + (s % ySpan),
      flight: false,
      portal: false,
    });
    if ((from[s] as number) < 0) break;
  }
  return out.reverse();
}

const ORTHOGONAL: readonly (readonly [number, number])[] = Object.freeze([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const);

/** A min-heap keyed on `(priority, state)`, so ties are broken deterministically. */
class TunnelHeap {
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
/* carving                                                                     */
/* -------------------------------------------------------------------------- */

/** The bore, as the set of cells it removed. */
interface CarveSet {
  /** `"x,y,z"` of every carved cell — the lining's keep-out. */
  readonly cells: Set<string>;
  /** Column indices the bore passes through. */
  readonly columns: Set<number>;
  readonly blocks: number;
}

/**
 * Punch the bore.
 *
 * Three wide, perpendicular to the direction of travel, and three high — four
 * at a step, so the ceiling has a block to change level in and a climbing
 * player has headroom over the tread. The perpendicular is taken from the
 * *segment*, so a corner carves both arms and the union is a proper right-angle
 * junction rather than two bores that clip each other's walls.
 */
function carveTunnel(r: RouteRequest, path: readonly TunnelCell[]): CarveSet {
  const { region } = r.input.plan;
  const cells = new Set<string>();
  const columns = new Set<number>();
  const footprints = r.input.placements.map((p) => p.footprint);
  const air = r.states.air;
  let blocks = 0;

  const add = (x: number, y: number, z: number): void => {
    if (!inside(region, x, z)) return;
    const key = `${x},${y},${z}`;
    if (cells.has(key)) return;
    cells.add(key);
    const idx = index(region, x, z);
    columns.add(idx);
    r.columns[idx] = 1;
    pushRun(r.carved, idx, y);
    // Inside a footprint the span alone is not enough. Spans are punched while
    // the columns are filled; a building's blocks are stamped *after* that, so
    // the cellar wall would be re-laid straight back over the opening. The
    // doorway is therefore cut a second time, as air in this pass's own block
    // list — which is stamped after the building's.
    if (footprints.some((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1)) {
      r.blocks.push({ x, y, z, stateId: air });
    }
    blocks++;
  };

  const half = (TUNNEL_WIDTH - 1) >> 1;
  for (const [i, cell] of path.entries()) {
    const height = boreHeight(cell, footprints);
    const idx = index(region, cell.x, cell.z);
    if (cell.portal) r.portalColumns[idx] = 1;
    // Both perpendiculars at a corner, so the turn is carved square.
    for (const [px, pz] of perpendiculars(path, i)) {
      for (let d = -half; d <= half; d++) {
        for (let y = cell.y; y < cell.y + height; y++) add(cell.x + px * d, y, cell.z + pz * d);
      }
    }
  }
  return { cells, columns, blocks };
}

/**
 * The clear height of the bore at one cell.
 *
 * Four at a step, so the ceiling has a block to change level in — except in a
 * portal, where every block of height is a block of roof the gallery does not
 * have. A cellar's top course sits at the level of the ground outside the
 * building, so a four-high bore leaving one takes the surface block with it;
 * three does not. Three is enough for the climb in any case — the walking agent
 * needs headroom over both cells of a rise, and a three-high bore gives it on
 * both.
 */
function boreHeight(cell: TunnelCell, footprints: readonly Rect[]): number {
  if (!cell.flight) return TUNNEL_HEIGHT;
  if (cell.portal || insideFootprint(footprints, cell.x, cell.z)) return TUNNEL_HEIGHT;
  return TUNNEL_FLIGHT_HEIGHT;
}

function insideFootprint(footprints: readonly Rect[], x: number, z: number): boolean {
  return footprints.some((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1);
}

/**
 * The unit perpendicular(s) of a path cell.
 *
 * One on a straight run; both at a corner, which is what makes the bore's turn
 * a filled square instead of two bores meeting at a point.
 */
function perpendiculars(
  path: readonly TunnelCell[],
  i: number,
): readonly (readonly [number, number])[] {
  const dirs = new Set<string>();
  const prev = path[i - 1];
  const next = path[i + 1];
  for (const [a, b] of [
    [prev, path[i] as TunnelCell],
    [path[i] as TunnelCell, next],
  ] as const) {
    if (a === undefined || b === undefined) continue;
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    if (dx === 0 && dz === 0) continue;
    // Perpendicular of (dx, dz) in the plane.
    dirs.add(`${-dz},${dx}`);
  }
  if (dirs.size === 0) return [[1, 0]];
  return [...dirs].sort().map((key) => {
    const [px, pz] = key.split(",").map(Number) as [number, number];
    return [px, pz] as const;
  });
}

/* -------------------------------------------------------------------------- */
/* lining                                                                      */
/* -------------------------------------------------------------------------- */

/** Block states the gallery is built from, resolved once. */
interface TunnelStates {
  readonly masonry: number;
  readonly cracked: number;
  readonly stairs: readonly [number, number, number, number];
  readonly lintel: readonly [number, number];
  readonly post: number;
  readonly lantern: number;
  /** Plain air — what a doorway through a cellar wall is made of. */
  readonly air: number;
}

function resolveTunnelStates(stack: PrismarineStack, materials?: BuildingMaterials): TunnelStates {
  const byName = (name: string, fallback: string): number =>
    stack.blockByName(name)?.stateId ?? (stack.blockByName(fallback)?.stateId as number);
  const masonryName = materials?.stone.accent ?? "stone_bricks";
  const stairName = materials?.stone.stairs ?? "stone_brick_stairs";
  const stair = (facing: string): number =>
    stack.blockStateOf(stairName, {
      facing,
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    }) ?? byName(stairName, "stone_brick_stairs");
  const log = (axis: string): number =>
    stack.blockStateOf("stripped_oak_log", { axis }) ?? byName("stripped_oak_log", "oak_log");
  return {
    masonry: byName(masonryName, "stone_bricks"),
    cracked: byName("cracked_stone_bricks", "stone_bricks"),
    stairs: [stair("north"), stair("east"), stair("south"), stair("west")] as const,
    lintel: [log("x"), log("z")] as const,
    post: byName(materials?.wood.fence ?? "oak_fence", "oak_fence"),
    lantern: stack.blockStateOf("lantern", { hanging: "true", waterlogged: "false" }) ??
      byName("lantern", "lantern"),
    air: stack.blockByName("air")?.stateId ?? 0,
  };
}

/**
 * Lay the gallery's floor, walls, ceiling, frames and lights.
 *
 * The rule that keeps this honest: **nothing is ever written into a cell the
 * bore carved**, except the floor's own stairs and the frames, which are placed
 * deliberately. Everything else replaces rock that is already there, so a
 * lining block can never be floating and never occludes the walkway — and at a
 * corner, where two arms' walls would otherwise cut across each other's bore,
 * the keep-out is what makes the junction come out square.
 *
 * Nothing is written inside a building's footprint either. The cellar walls
 * belong to the building grammar; the tunnel's job at that seam is to remove
 * three blocks of them, not to re-lay them in its own masonry.
 */
function lineTunnel(
  r: RouteRequest,
  path: readonly TunnelCell[],
  carve: CarveSet,
): { blocks: number; frames: number; lanterns: number } {
  const { region } = r.input.plan;
  const footprints = r.input.placements.map((p) => p.footprint);
  const crackSeed = detailSeed(r.input.seed, `tunnel.${r.link.id}`);
  const half = (TUNNEL_WIDTH - 1) >> 1;
  let blocks = 0;
  let frames = 0;
  let lanterns = 0;

  const place = (
    x: number,
    y: number,
    z: number,
    stateId: number,
    force = false,
    allowInBuilding = false,
  ): void => {
    if (!inside(region, x, z)) return;
    if (!allowInBuilding && insideFootprint(footprints, x, z)) return;
    if (!force && carve.cells.has(`${x},${y},${z}`)) return;
    r.blocks.push({ x, y, z, stateId });
    blocks++;
  };
  const stone = (x: number, y: number, z: number): number =>
    hash3(crackSeed, x, y, z, 1) < 0.22 ? r.states.cracked : r.states.masonry;

  let frameIndex = 0;
  for (const [i, cell] of path.entries()) {
    const height = boreHeight(cell, footprints);
    const perps = perpendiculars(path, i);

    for (const [px, pz] of perps) {
      // --- floor and ceiling ------------------------------------------------
      for (let d = -half; d <= half; d++) {
        const x = cell.x + px * d;
        const z = cell.z + pz * d;
        place(x, cell.y - 1, z, stone(x, cell.y - 1, z), true);
        place(x, cell.y + height, z, stone(x, cell.y + height, z));
      }
      // --- walls ------------------------------------------------------------
      for (const side of [-(half + 1), half + 1]) {
        const x = cell.x + px * side;
        const z = cell.z + pz * side;
        for (let y = cell.y; y < cell.y + height; y++) place(x, y, z, stone(x, y, z));
      }
    }

    // --- the step ---------------------------------------------------------
    // The floor block of the higher cell of a rise is a stair facing the climb,
    // so the flight is a walk in both directions: a half-step up from below, a
    // one-block drop from above.
    if (cell.flight) {
      const lower = (path[i - 1] as TunnelCell | undefined)?.y === cell.y - 1 ? path[i - 1] : path[i + 1];
      if (lower !== undefined) {
        const facing = facingIndex(Math.sign(cell.x - lower.x), Math.sign(cell.z - lower.z));
        if (facing >= 0) {
          // The threshold stair is the one block this pass writes inside a
          // building: without it the step out of the cellar is a jump.
          place(cell.x, cell.y - 1, cell.z, r.states.stairs[facing] as number, true, true);
        }
      }
    }

    // --- the support frame ------------------------------------------------
    // Only on a straight, level, single-perpendicular run well clear of both
    // portals: a frame at a corner would stand its posts in the other arm.
    const straight =
      perps.length === 1 &&
      !cell.flight &&
      !cell.portal &&
      i >= 2 &&
      i <= path.length - 3 &&
      i % TUNNEL_FRAME_SPACING === 0;
    if (!straight) continue;
    const [px, pz] = perps[0] as readonly [number, number];
    frames++;
    // Posts against the walls, the full height of the bore, and a stripped-log
    // lintel across the ceiling plane above them.
    for (const side of [-half, half]) {
      const x = cell.x + px * side;
      const z = cell.z + pz * side;
      for (let y = cell.y; y < cell.y + height; y++) place(x, y, z, r.states.post, true);
    }
    for (let d = -half; d <= half; d++) {
      const x = cell.x + px * d;
      const z = cell.z + pz * d;
      place(x, cell.y + height, z, r.states.lintel[px !== 0 ? 0 : 1] as number, true);
    }
    if (frameIndex % TUNNEL_LANTERN_EVERY_N_FRAMES === 0) {
      // Hung from the lintel, one block over head height: the light is in the
      // ceiling, not in the walkway.
      place(cell.x, cell.y + height - 1, cell.z, r.states.lantern, true);
      lanterns++;
    }
    frameIndex++;
  }

  return { blocks, frames, lanterns };
}

/** Index into {@link FACINGS} for a unit step, or -1. */
function facingIndex(dx: number, dz: number): number {
  if (dx === 0 && dz === -1) return 0;
  if (dx === 1 && dz === 0) return 1;
  if (dx === 0 && dz === 1) return 2;
  if (dx === -1 && dz === 0) return 3;
  return -1;
}

/* -------------------------------------------------------------------------- */
/* spans                                                                       */
/* -------------------------------------------------------------------------- */

function pushRun(carved: Map<number, number[]>, idx: number, y: number): void {
  let ys = carved.get(idx);
  if (ys === undefined) {
    ys = [];
    carved.set(idx, ys);
  }
  ys.push(y);
}

function emptySpans(columns: number): CaveSpans {
  return { offsets: new Int32Array(columns + 1), lo: new Int32Array(0), hi: new Int32Array(0) };
}

/** Turn the per-column carved Y sets into merged, sorted CSR spans. */
function flattenSpans(carved: ReadonlyMap<number, number[]>, columns: number): CaveSpans {
  const offsets = new Int32Array(columns + 1);
  const lo: number[] = [];
  const hi: number[] = [];
  for (let idx = 0; idx < columns; idx++) {
    offsets[idx] = lo.length;
    const ys = carved.get(idx);
    if (ys === undefined) continue;
    const sorted = [...new Set(ys)].sort((a, b) => a - b);
    for (const y of sorted) {
      const last = lo.length - 1;
      if (last >= (offsets[idx] as number) && y <= (hi[last] as number) + 1) {
        if (y > (hi[last] as number)) hi[last] = y;
        continue;
      }
      lo.push(y);
      hi.push(y);
    }
  }
  offsets[columns] = lo.length;
  return { offsets, lo: Int32Array.from(lo), hi: Int32Array.from(hi) };
}

/* -------------------------------------------------------------------------- */

function stampRect(region: Region, mask: Uint8Array, rect: Rect, value: number): void {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(region, x, z)) continue;
      mask[index(region, x, z)] = value;
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* -------------------------------------------------------------------------- */
/* the validator                                                               */
/* -------------------------------------------------------------------------- */

/** One place a gallery came too near water, or too near the sky. */
export interface TunnelBreach {
  readonly tunnelId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly detail: string;
}

/** Findings of the tunnel invariants, with a handful of examples. */
export interface TunnelIntegrityReport {
  readonly fluidBreaches: number;
  readonly roofBreaches: number;
  readonly samples: readonly TunnelBreach[];
}

/** Examples a tunnel integrity report carries. */
export const MAX_TUNNEL_SAMPLES = 8;

/**
 * Recompute both tunnel invariants from the routes that were actually dug.
 *
 * Same shape, and same reason, as `checkCaveIntegrity`: the fluid mask is
 * re-derived from the finished plan and dilated, and the roof is measured
 * against the finished `ground` — never carried over from the router, so the
 * two implementations have to agree. The portal runs are exempt from the roof
 * rule and only from that one; a portal four blocks from a lake is still a
 * breach, because the water does not care that the building is right there.
 *
 * This should always find nothing. It exists because "always" is the claim.
 */
export function checkTunnelIntegrity(
  plan: ColumnPlan,
  tunnels: readonly BuiltTunnel[],
  buildings: readonly BuiltBuilding[] = [],
): TunnelIntegrityReport {
  const samples: TunnelBreach[] = [];
  let fluidBreaches = 0;
  let roofBreaches = 0;
  if (tunnels.length === 0) return { fluidBreaches, roofBreaches, samples };

  const { region, ground } = plan;
  const n = region.width * region.depth;
  const fluid = new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    if (plan.fluidKind[idx] !== FluidKind.NONE) fluid[idx] = 1;
  }
  const nearFluid = dilate(fluid, region.width, region.depth, TUNNEL_FLUID_SHELL);
  const nearOcean = dilate(plan.oceanMask, region.width, region.depth, TUNNEL_OCEAN_KEEPOUT);
  const sample = (breach: TunnelBreach): void => {
    if (samples.length < MAX_TUNNEL_SAMPLES) samples.push(breach);
  };
  const half = (TUNNEL_WIDTH - 1) >> 1;
  const footprints = buildings.map((b) => b.footprint);

  for (const tunnel of tunnels) {
    for (const [i, cell] of tunnel.path.entries()) {
      const height = boreHeight(cell, footprints);
      for (const [px, pz] of perpendiculars(tunnel.path, i)) {
        for (let d = -half; d <= half; d++) {
          const x = cell.x + px * d;
          const z = cell.z + pz * d;
          if (!inside(region, x, z)) continue;
          const idx = index(region, x, z);
          if (nearFluid[idx] === 1 || nearOcean[idx] === 1) {
            fluidBreaches++;
            sample({
              tunnelId: tunnel.id,
              x,
              y: cell.y,
              z,
              detail: `bore within ${TUNNEL_FLUID_SHELL} blocks of water, lava or the sea`,
            });
            continue;
          }
          // A portal is exempt from the roof *margin*, not from the surface: it
          // runs under a building's own levelled pad, and one block of fill
          // there is a foundation, but a hole in the ground beside a chapel is
          // a hole in the ground beside a chapel.
          if (insideFootprint(footprints, x, z)) continue;
          const roof = (ground[idx] as number) - (cell.y + height - 1);
          const want = cell.portal ? 1 : TUNNEL_ROOF_THICKNESS;
          if (roof < want) {
            roofBreaches++;
            sample({
              tunnelId: tunnel.id,
              x,
              y: cell.y + height - 1,
              z,
              detail: `leaves only ${roof} blocks of roof under the surface at y ${ground[idx] as number} (want ${want})`,
            });
          }
        }
      }
    }
  }
  return { fluidBreaches, roofBreaches, samples };
}
