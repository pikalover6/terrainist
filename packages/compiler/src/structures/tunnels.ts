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
 * - **Tunnels already built**, in document order — *unless the two galleries
 *   meet at a level*, which is the one case that is not an obstacle but a
 *   junction. See below.
 *
 * ## Junctions
 *
 * The earlier version of this pass treated every column an earlier gallery had
 * claimed as a wall, and routed around. That is never *wrong* — but on a
 * network of more than two buildings it is nearly always what happens, and the
 * result is a set of galleries that carefully avoid each other by ten blocks
 * and cross nothing, which is not what an underground network looks like and
 * makes every route longer than the one the player would expect.
 *
 * A crossing is admitted on exactly one condition: the new gallery enters the
 * claimed column **at the floor level the earlier one left there**. That single
 * rule is what makes a junction trivially safe, and it is enforced in the A*'s
 * legality test rather than checked afterwards, so a route that cannot meet the
 * level simply never finds the crossing and goes round as before. Crossing is
 * priced ({@link TUNNEL_JUNCTION_COST}) so it happens where it is the natural
 * line and not merely where it is free.
 *
 * Where a crossing does happen, the two bores are widened into a **shared
 * junction chamber**: a square room {@link JUNCTION_RADIUS} blocks out from the
 * crossing, {@link JUNCTION_HEIGHT} high — a course taller than a gallery, so
 * it reads as a room and not as a wide bit of corridor — lined in the same
 * masonry and lit from the middle of its ceiling. The widening is skipped, and
 * only the widening, wherever the room would break the roof rule or reach into
 * an obstacle: the crossing itself is already a walkable square where the two
 * three-wide bores overlap, so a chamber that cannot be dug costs the network
 * nothing but its architecture.
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
  stableFluidColumns,
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

/**
 * Extra cost of a step into a column an earlier gallery already claimed.
 *
 * Four flat blocks' worth. Enough that a route which could cross or miss by a
 * couple of cells will miss — two galleries running side by side through the
 * same rock is a worse room than two that meet once — and nowhere near enough
 * to make a genuine crossing detour instead, which would put the junction
 * machinery back where it started.
 */
export const TUNNEL_JUNCTION_COST = 40;

/* -------------------------------------------------------------------------- */
/* styles                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How a gallery is dressed.
 *
 * `dressed` is the masonry gallery this pass has always dug and is still the
 * default. The other two are the same bore with a different hand on it:
 *
 * - **`mine`** — a rough-hewn working. The lining is drawn from three stones
 *   rather than one, the walls are studded with ore and recessed here and
 *   there, the frames are timber rather than masonry, a rail runs the length
 *   of the floor, and the dips in its profile stand in water.
 * - **`crypt`** — the burial passage that matches a `crypt` cellar: stone
 *   brick gone mossy and cracked, with niches along both walls.
 *
 * Style changes only what is *written*. The route, the bore, the roof rule and
 * the junction machinery are identical, which is what keeps one router and one
 * integrity check honest across all three.
 */
export const TUNNEL_STYLES = ["dressed", "mine", "crypt"] as const;

/** One gallery style. */
export type TunnelStyle = (typeof TUNNEL_STYLES)[number];

/** Coerce an unknown to a style; anything unrecognised is `dressed`. */
export function resolveTunnelStyle(value: unknown): TunnelStyle {
  return typeof value === "string" && (TUNNEL_STYLES as readonly string[]).includes(value)
    ? (value as TunnelStyle)
    : "dressed";
}

/** Cells between burial niches on a crypt passage. */
export const TUNNEL_NICHE_SPACING = 5;

/** Share of a mine gallery's wall blocks that are cut back one cell. */
export const MINE_RECESS_SHARE = 0.06;

/** Share of a mine gallery's wall blocks that show ore, inside an ore field. */
export const MINE_ORE_SHARE = 0.34;

/** Share of a mine gallery's wall that is inside an ore field at all. */
export const MINE_ORE_FIELD_SHARE = 0.3;

/** How deep a local dip in the floor profile must be before it holds water. */
export const MINE_POOL_MIN_DEPTH = 2;

/** Blocks out from an ore chamber's centre — a room wider than a junction. */
export const ORE_CHAMBER_RADIUS = 3;

/** Clear height of an ore chamber. */
export const ORE_CHAMBER_HEIGHT = 4;

/** Cells back from the far cellar the ore chamber is centred on. */
export const ORE_CHAMBER_INSET = 6;

/** Share of an ore chamber's wall that shows ore — dense, by design. */
export const ORE_CHAMBER_ORE_SHARE = 0.42;

/** Blocks out from the pool that the shell rule has to be answered for. */
const POOL_AIR_SHELL = TUNNEL_FLUID_SHELL;

/** Blocks out from a crossing that a shared junction chamber reaches. */
export const JUNCTION_RADIUS = 2;

/**
 * Clear height of a junction chamber.
 *
 * One course taller than a gallery on purpose. A room the same height as the
 * corridors feeding it does not read as a room from inside it; the extra course
 * is also where the lantern hangs without standing in anyone's headroom.
 */
export const JUNCTION_HEIGHT = 4;

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
  /** How the gallery is dressed. `dressed` when the constraint said nothing. */
  readonly style?: TunnelStyle;
  /** Whether a mine gallery widens into an ore chamber near its far end. */
  readonly oreChamber?: boolean;
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

/**
 * What earlier galleries have claimed, per column.
 *
 * `floorY` is only meaningful where `taken` is 1; it carries the walkable floor
 * the earlier bore left in that column, which is the level a later gallery has
 * to match to be allowed a junction there rather than a collision.
 */
export interface TunnelClaims {
  readonly taken: Uint8Array;
  readonly floorY: Int32Array;
}

/** A shared chamber where two galleries meet. */
export interface TunnelJunction {
  /** Centre column of the crossing. */
  readonly x: number;
  readonly z: number;
  /** The floor level both galleries share here. */
  readonly y: number;
  /** The other tunnel's id. */
  readonly withTunnel: string;
  /**
   * True when the crossing was widened into a proper chamber.
   *
   * False means the room would have broken the roof rule or reached into an
   * obstacle, so only the square where the two bores already overlap was left.
   * Walkable either way — that is the whole reason the widening is allowed to
   * fail quietly.
   */
  readonly chamber: boolean;
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
  /** Shared chambers this gallery dug where it met an earlier one. */
  readonly junctions: readonly TunnelJunction[];
  /** How this gallery was dressed. */
  readonly style: TunnelStyle;
  /** Rails laid down the centre line. */
  readonly rails: number;
  /** Burial niches cut into the walls. */
  readonly niches: number;
  /** Wall blocks replaced with ore. */
  readonly ores: number;
  /** Cells of standing water in the floor's dips. */
  readonly pool: number;
  /** The widened terminal room, when one was dug. */
  readonly oreChamber: OreChamber | null;
}

/** A widened terminal room on a mine gallery. */
export interface OreChamber {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /**
   * The direction the gallery runs through the room.
   *
   * Carried because the cart has to stand *beside* the line rather than across
   * it: a three-block cart laid over a three-wide bore is a wall, and the
   * traversal lint said so the first time this was built.
   */
  readonly along: readonly [number, number];
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
  /** Columns an earlier tunnel claimed, and the floor level it left there. */
  const claimed: TunnelClaims = { taken: new Uint8Array(n), floorY: new Int32Array(n) };
  /** Which tunnel claimed each column, so a junction can name its other half. */
  const claimedBy = new Map<number, string>();
  /**
   * Every air cell every gallery has carved so far.
   *
   * The lining rule "never write into a cell the bore carved" was per tunnel
   * while tunnels could not meet. Once they can, it has to be global, or the
   * second gallery lays its wall through the first one's walkway at the very
   * cell where they cross.
   */
  const carvedCells = new Set<string>();

  for (const link of input.links) {
    const from = byPath.get(link.fromPath);
    const to = byPath.get(link.toPath);
    if (from === undefined || to === undefined || from.basementDepth === 0 || to.basementDepth === 0) {
      // Only reachable when the solver dropped one end (`optional: true`), or
      // when a cellar could not be dug. §4 calls both ends existing a hard
      // precondition, so this is worth saying out loud — and worth saying
      // *which* end, and which of the two failures it is. The old text said
      // "one end has no cellar" and offered a hint about `optional` and
      // envelopes, neither of which had anything to do with it; a watchtower
      // that silently built no cellar was diagnosed as a placement problem for
      // as long as that lasted.
      const unplaced = [
        ...(from === undefined ? [link.fromPath] : []),
        ...(to === undefined ? [link.toPath] : []),
      ];
      if (from === undefined || to === undefined) {
        diagnostics.push(
          warning(
            "TUNNEL_UNROUTABLE",
            link.id,
            `no tunnel was dug between "${link.fromPath}" and "${link.toPath}": ${quoteList(unplaced)} ${
              unplaced.length === 1 ? "was" : "were"
            } not placed`,
            'both ends must be placed buildings — drop "optional": true from them, or widen the envelope that stopped one being placed',
          ),
        );
        continue;
      }
      // Both ends stand; at least one of them has no cellar under it. Every
      // archetype digs one when asked, so this now means the building's own
      // geometry refused — a footprint too small for a room and a way down.
      const cellarless = [
        ...(from.basementDepth === 0 ? [from] : []),
        ...(to.basementDepth === 0 ? [to] : []),
      ];
      diagnostics.push(
        warning(
          "TUNNEL_UNROUTABLE",
          link.id,
          `no tunnel was dug between "${link.fromPath}" and "${link.toPath}": ${quoteList(
            cellarless.map((b) => b.nodePath),
          )} ${cellarless.length === 1 ? "was" : "were"} placed, but ${
            cellarless.length === 1 ? "has" : "have"
          } no cellar for the gallery to open into${archetypeNote(cellarless)}`,
          "every archetype digs a cellar when a tunnel asks for one, so what refused here is the building's own size: give it a footprint of at least 5x5, so a room and the ladder into it fit, or route the tunnel to a larger building",
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
      claimed,
      claimedBy,
      carvedCells,
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

/** `"a"`, or `"a" and "b"` — for a diagnostic that names one end or both. */
function quoteList(paths: readonly string[]): string {
  return paths.map((p) => `"${p}"`).join(" and ");
}

/** ` (archetype "watchtower")`, when every named building is the same one. */
function archetypeNote(buildings: readonly BuiltBuilding[]): string {
  const names = new Set(buildings.map((b) => b.meta.params.archetype));
  const only = [...names];
  return only.length === 1 && only[0] !== undefined ? ` (archetype "${only[0]}")` : "";
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
  readonly claimed: TunnelClaims;
  readonly claimedBy: Map<number, string>;
  readonly carvedCells: Set<string>;
  readonly states: TunnelStates;
  readonly carved: Map<number, number[]>;
  readonly columns: Uint8Array;
  readonly portalColumns: Uint8Array;
  readonly blocks: StructureBlock[];
}

function routeAndBuild(r: RouteRequest): BuiltTunnel | null {
  const { input, portalA, portalB } = r;
  /**
   * How many blocks were queued before this gallery started.
   *
   * The reopen pass below may only touch *earlier* galleries' work. This
   * tunnel's own carve pushes air blocks for the doorways it cuts through its
   * cellar walls, and those blocks are — by construction — at carved cells, so
   * a reopen that swept the whole list would delete the two doors the gallery
   * exists to connect and leave a walk-through that walks into masonry.
   */
  const blocksBefore = r.blocks.length;
  const { region } = input.plan;
  void region;

  const stubA = portalRun(portalA, input.plan);
  const stubB = portalRun(portalB, input.plan);

  // Free the two portals from the obstacle mask: their columns are inside (or
  // one ring outside) their own building, which the mask blanket-closed.
  //
  // Earlier tunnels are deliberately *not* folded into `open` any more. They go
  // to the router as claims, which it may cross at a matching level and must
  // otherwise treat as closed — the distinction `open` cannot express.
  const open = Uint8Array.from(r.obstacles);
  for (const cell of [...stubA, ...stubB]) clearSwath(region, open, cell);
  // A portal is this gallery's own ground and may always be entered; an earlier
  // tunnel that reached into it is a junction like any other.
  const claims: TunnelClaims = {
    taken: Uint8Array.from(r.claimed.taken),
    floorY: Int32Array.from(r.claimed.floorY),
  };
  for (const cell of [...stubA, ...stubB]) clearSwath(region, claims.taken, cell);

  const head = stubA[stubA.length - 1] as TunnelCell;
  const tail = stubB[stubB.length - 1] as TunnelCell;
  const middle = routeTunnel(input.plan, open, head, tail, claims);
  if (middle === null) return null;

  // `middle` starts at `head` and ends at `tail`; the two stubs already hold
  // those cells, so the joins drop one each.
  const path: TunnelCell[] = [
    ...stubA,
    ...middle.slice(1, -1),
    ...[...stubB].reverse(),
  ];
  markFlights(path);

  // --- junctions ----------------------------------------------------------
  // Found before anything is carved, because whether a crossing becomes a room
  // decides how much rock comes out of it.
  const junctions = findJunctions(r, path);

  const carveSet = carveTunnel(r, path);
  for (const junction of junctions) {
    if (junction.chamber) carveJunction(r, junction, carveSet);
  }

  // Any lining an *earlier* gallery laid that now stands inside this one's air
  // is removed. Two bores that cross share their cells, and the block that was
  // the first tunnel's wall is the second tunnel's walkway.
  reopenCarvedCells(r.blocks, carveSet.cells, blocksBefore);

  // The ore chamber, before the lining: it is more bore, and the lining pass
  // has to see its cells as carved or it lays a wall across the room's mouth.
  const oreChamber = findOreChamber(r, path);
  if (oreChamber !== null) carveOreChamber(r, oreChamber, carveSet);

  const lining = lineTunnel(r, path, carveSet);
  for (const junction of junctions) {
    if (junction.chamber) lineJunction(r, junction, carveSet);
  }
  if (oreChamber !== null) lineOreChamber(r, oreChamber, carveSet);

  // Claim the bore for the tunnels that follow — the whole three-wide swath,
  // not the centre line, because that is what a later gallery has to meet the
  // level of. The floor recorded per column is the one a junction there would
  // share.
  for (const [idx, y] of carveSet.floorByColumn) {
    r.claimed.taken[idx] = 1;
    r.claimed.floorY[idx] = y;
    if (!r.claimedBy.has(idx)) r.claimedBy.set(idx, r.link.id);
  }
  for (const key of carveSet.cells) r.carvedCells.add(key);

  return {
    junctions,
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
    style: r.link.style ?? "dressed",
    rails: lining.rails,
    niches: lining.niches,
    ores: lining.ores,
    pool: lining.pool,
    oreChamber,
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
  claimed?: TunnelClaims,
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
    // A column an earlier gallery claimed is enterable only at the level that
    // gallery left there. Anything else is one bore passing over or under
    // another with a course or two of rock between them, which is a ceiling
    // nobody checked and a floor nobody laid.
    if (claimed !== undefined && claimed.taken[idx] === 1 && (claimed.floorY[idx] as number) !== y) {
      return false;
    }
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
        const cost =
          TUNNEL_STEP_COST +
          (dy === 0 ? 0 : TUNNEL_RISE_COST) +
          (claimed !== undefined && claimed.taken[nIdx] === 1 ? TUNNEL_JUNCTION_COST : 0);
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
  /** Walkable floor Y per column — what a later gallery must match to junction. */
  readonly floorByColumn: Map<number, number>;
  /**
   * `"x,y,z"` of every cell that is some path cell's **walk plane**.
   *
   * Distinct from `floorByColumn`, which holds one Y per column and therefore
   * loses the second one where a corner is also a step. This is the set the
   * floor course is guarded against: the course under a walk plane is inside
   * the bore of whatever stands one lower, so it has to be force-written, and
   * a forced write into a cell somebody walks on is a block in a corridor.
   */
  readonly walkCells: Set<string>;
  blocks: number;
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
  const floorByColumn = new Map<number, number>();
  const walkCells = new Set<string>();
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
        const bx = cell.x + px * d;
        const bz = cell.z + pz * d;
        for (let y = cell.y; y < cell.y + height; y++) add(bx, y, bz);
        if (inside(region, bx, bz)) {
          floorByColumn.set(index(region, bx, bz), cell.y);
          walkCells.add(`${bx},${cell.y},${bz}`);
        }
      }
    }
  }
  return { cells, columns, floorByColumn, walkCells, blocks };
}

/* -------------------------------------------------------------------------- */
/* junctions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Where this route crosses an earlier gallery, and whether each crossing can be
 * widened into a room.
 *
 * A crossing is a *run* of claimed cells, not a single one — two three-wide
 * bores meeting square share several columns — so the run is collapsed to its
 * midpoint and one chamber is dug per run. Without that a square crossing would
 * produce three overlapping chambers and three lanterns in the same ceiling.
 */
function findJunctions(r: RouteRequest, path: readonly TunnelCell[]): TunnelJunction[] {
  const { region } = r.input.plan;
  const runs: TunnelCell[][] = [];
  let run: TunnelCell[] = [];
  for (const cell of path) {
    if (!inside(region, cell.x, cell.z)) continue;
    const idx = index(region, cell.x, cell.z);
    const meets =
      r.claimed.taken[idx] === 1 &&
      (r.claimed.floorY[idx] as number) === cell.y &&
      !cell.portal;
    if (meets) {
      run.push(cell);
      continue;
    }
    if (run.length > 0) runs.push(run);
    run = [];
  }
  if (run.length > 0) runs.push(run);

  const out: TunnelJunction[] = [];
  for (const cells of runs) {
    const mid = cells[cells.length >> 1] as TunnelCell;
    const idx = index(region, mid.x, mid.z);
    out.push({
      x: mid.x,
      z: mid.z,
      y: mid.y,
      withTunnel: r.claimedBy.get(idx) ?? "",
      chamber: chamberFits(r, mid),
    });
  }
  return out;
}

/** Every column a chamber would occupy, centre first. */
function chamberColumns(junction: { x: number; z: number }): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let dz = -JUNCTION_RADIUS; dz <= JUNCTION_RADIUS; dz++) {
    for (let dx = -JUNCTION_RADIUS; dx <= JUNCTION_RADIUS; dx++) {
      out.push({ x: junction.x + dx, z: junction.z + dz });
    }
  }
  return out;
}

/**
 * Can a chamber be dug here?
 *
 * Every column of the room, and the ring of rock its lining occupies, has to be
 * in the region, out of the obstacle mask — which already carries the fluid
 * shell, the ocean keep-out, the caves and every footprint — and deep enough
 * under the surface for a room a course taller than a gallery. All or nothing:
 * a chamber with one corner missing is a chamber that has opened onto
 * something.
 */
function chamberFits(r: RouteRequest, junction: TunnelCell): boolean {
  const { region, ground } = r.input.plan;
  for (let dz = -JUNCTION_RADIUS - 1; dz <= JUNCTION_RADIUS + 1; dz++) {
    for (let dx = -JUNCTION_RADIUS - 1; dx <= JUNCTION_RADIUS + 1; dx++) {
      const x = junction.x + dx;
      const z = junction.z + dz;
      if (!inside(region, x, z)) return false;
      const idx = index(region, x, z);
      if (r.obstacles[idx] === 1) return false;
      // Exactly the roof rule the router already enforces on a flight cell —
      // `JUNCTION_HEIGHT` and `TUNNEL_FLIGHT_HEIGHT` are the same four blocks —
      // so a chamber fits wherever the gallery that reaches it was legal, and
      // `checkTunnelIntegrity` re-derives the identical inequality.
      if (junction.y + JUNCTION_HEIGHT - 1 + TUNNEL_ROOF_THICKNESS > (ground[idx] as number)) {
        return false;
      }
    }
  }
  return junction.y - 1 > TUNNEL_FLOOR_Y;
}

/** Hollow the chamber, adding its cells to the tunnel's own carve set. */
function carveJunction(r: RouteRequest, junction: TunnelJunction, carve: CarveSet): void {
  const { region } = r.input.plan;
  for (const { x, z } of chamberColumns(junction)) {
    const idx = index(region, x, z);
    for (let y = junction.y; y < junction.y + JUNCTION_HEIGHT; y++) {
      const key = `${x},${y},${z}`;
      if (carve.cells.has(key)) continue;
      carve.cells.add(key);
      carve.blocks++;
      pushRun(r.carved, idx, y);
    }
    carve.columns.add(idx);
    carve.floorByColumn.set(idx, junction.y);
    carve.walkCells.add(`${x},${junction.y},${z}`);
    r.columns[idx] = 1;
  }
}

/**
 * Line the chamber: a floor, a vaulted ceiling and four walls, and a lantern in
 * the middle of the ceiling.
 *
 * "Vaulted" here is what a block world can honestly offer — the ceiling is a
 * course higher than the galleries that feed it, so an arriving player walks
 * out of a three-high corridor into a four-high room and reads the change.
 */
function lineJunction(r: RouteRequest, junction: TunnelJunction, carve: CarveSet): void {
  const { region } = r.input.plan;
  const footprints = r.input.placements.map((p) => p.footprint);
  const crackSeed = detailSeed(r.input.seed, `junction.${r.link.id}.${junction.x},${junction.z}`);
  const stone = (x: number, y: number, z: number): number =>
    hash3(crackSeed, x, y, z, 1) < 0.22 ? r.states.cracked : r.states.masonry;
  const place = (x: number, y: number, z: number, stateId: number, force = false): void => {
    if (!inside(region, x, z)) return;
    if (insideFootprint(footprints, x, z)) return;
    const key = `${x},${y},${z}`;
    if (!force && (carve.cells.has(key) || r.carvedCells.has(key))) return;
    r.blocks.push({ x, y, z, stateId });
  };

  const reach = JUNCTION_RADIUS + 1;
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = junction.x + dx;
      const z = junction.z + dz;
      const wall = Math.max(Math.abs(dx), Math.abs(dz)) === reach;
      if (wall) {
        // The four walls, but only where a gallery does not come through them:
        // an arm's own bore is carved, and a carved cell is never written into,
        // so the four doorways open themselves.
        for (let y = junction.y; y < junction.y + JUNCTION_HEIGHT; y++) {
          place(x, y, z, stone(x, y, z));
        }
        continue;
      }
      place(x, junction.y - 1, z, stone(x, junction.y - 1, z), true);
      place(x, junction.y + JUNCTION_HEIGHT, z, stone(x, junction.y + JUNCTION_HEIGHT, z));
    }
  }
  // Hung from the middle of the ceiling, clear of every arm's headroom.
  place(junction.x, junction.y + JUNCTION_HEIGHT - 1, junction.z, r.states.lantern, true);
}

/**
 * Remove any block already queued that stands inside a cell this bore carved.
 *
 * Only ever removes: the pass's block list is its own, so the entries here are
 * earlier galleries' lining, and an earlier gallery's wall inside a later one's
 * walkway is exactly the defect junctions would otherwise introduce.
 */
function reopenCarvedCells(
  blocks: StructureBlock[],
  cells: ReadonlySet<string>,
  end: number,
): void {
  let write = 0;
  for (let read = 0; read < blocks.length; read++) {
    const b = blocks[read] as StructureBlock;
    if (read < end && cells.has(`${b.x},${b.y},${b.z}`)) continue;
    blocks[write++] = b;
  }
  blocks.length = write;
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
/* the ore chamber                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Where a mine gallery widens into a working face, if it can.
 *
 * A terminal room, not a mid-route one: it is centred `ORE_CHAMBER_INSET` cells
 * back from the far cellar, which is the last place on the route that is both
 * out of the portal ramp and far enough from the cellar wall for a room three
 * blocks wider than the bore. If the geometry there refuses — too near the
 * surface, too near water, over somebody's foundation — the gallery simply
 * arrives without one, exactly as a junction that cannot be widened stays a
 * crossing. The alternative is a route search that carries a room around with
 * it, and no route is worth that.
 */
function findOreChamber(r: RouteRequest, path: readonly TunnelCell[]): OreChamber | null {
  if (r.link.style !== "mine" || r.link.oreChamber !== true) return null;
  const { region, ground } = r.input.plan;
  // Walk in from the far end: the first cell that is out of both portals, level
  // with its neighbours, and has room for the chamber.
  for (let i = path.length - 1 - ORE_CHAMBER_INSET; i >= ORE_CHAMBER_INSET; i--) {
    const cell = path[i] as TunnelCell | undefined;
    if (cell === undefined || cell.portal || cell.flight) continue;
    // The room has to be *level* with the gallery for its whole width: a
    // chamber widened around a staircase is not a room, it is a stairwell with
    // the walls pushed out, and its floor course lands in the walkway of every
    // cell the flight passes through. Every path cell the room would contain
    // must therefore stand at the room's own plane.
    const span = path.filter(
      (q) => Math.abs(q.x - cell.x) <= ORE_CHAMBER_RADIUS + 1 && Math.abs(q.z - cell.z) <= ORE_CHAMBER_RADIUS + 1,
    );
    if (span.some((q) => q.y !== cell.y || q.portal)) continue;
    let fits = true;
    for (let dz = -ORE_CHAMBER_RADIUS - 1; dz <= ORE_CHAMBER_RADIUS + 1 && fits; dz++) {
      for (let dx = -ORE_CHAMBER_RADIUS - 1; dx <= ORE_CHAMBER_RADIUS + 1 && fits; dx++) {
        const x = cell.x + dx;
        const z = cell.z + dz;
        if (!inside(region, x, z)) fits = false;
        else {
          const idx = index(region, x, z);
          if (r.obstacles[idx] === 1) fits = false;
          else if (cell.y + ORE_CHAMBER_HEIGHT - 1 + TUNNEL_ROOF_THICKNESS > (ground[idx] as number)) {
            fits = false;
          }
        }
      }
    }
    if (!fits || cell.y - 1 <= TUNNEL_FLOOR_Y) continue;
    const next = (path[i + 1] ?? path[i - 1]) as TunnelCell;
    const dx = Math.sign(next.x - cell.x);
    const dz = Math.sign(next.z - cell.z);
    const along: readonly [number, number] = dx === 0 && dz === 0 ? [1, 0] : [dx, dz];
    return { x: cell.x, z: cell.z, y: cell.y, along };
  }
  return null;
}

/** Every column an ore chamber occupies, centre outward. */
function oreChamberColumns(c: OreChamber): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let dz = -ORE_CHAMBER_RADIUS; dz <= ORE_CHAMBER_RADIUS; dz++) {
    for (let dx = -ORE_CHAMBER_RADIUS; dx <= ORE_CHAMBER_RADIUS; dx++) {
      out.push({ x: c.x + dx, z: c.z + dz });
    }
  }
  return out;
}

/** Hollow the chamber into the gallery's own carve set. */
function carveOreChamber(r: RouteRequest, c: OreChamber, carve: CarveSet): void {
  const { region } = r.input.plan;
  for (const { x, z } of oreChamberColumns(c)) {
    if (!inside(region, x, z)) continue;
    const idx = index(region, x, z);
    for (let y = c.y; y < c.y + ORE_CHAMBER_HEIGHT; y++) {
      const key = `${x},${y},${z}`;
      if (carve.cells.has(key)) continue;
      carve.cells.add(key);
      carve.blocks++;
      pushRun(r.carved, idx, y);
    }
    carve.columns.add(idx);
    carve.floorByColumn.set(idx, c.y);
    carve.walkCells.add(`${x},${c.y},${z}`);
    r.columns[idx] = 1;
  }
}

/**
 * Line the chamber: rough stone studded densely with ore, a colonnade of
 * timber holding the roof up, a lantern, and the cart that ends the line.
 *
 * The colonnade is what makes it read as a *room* rather than as a wide bit of
 * tunnel from inside: four posts on the diagonal, clear of the walkway and
 * clear of every arm's mouth, which is the same argument the junction chamber's
 * extra course of height makes in the other direction.
 */
function lineOreChamber(r: RouteRequest, c: OreChamber, carve: CarveSet): void {
  const { region } = r.input.plan;
  const footprints = r.input.placements.map((p) => p.footprint);
  const oreSeed = detailSeed(r.input.seed, `tunnel.chamber.${r.link.id}.${c.x},${c.z}`);
  const rough = r.states.rough;
  const stone = (x: number, y: number, z: number, wall: boolean): number => {
    if (wall) {
      const ore = oreAt(r.states, oreSeed, x, y, z, 1, ORE_CHAMBER_ORE_SHARE);
      if (ore !== null) return ore;
    }
    const draw = hash3(oreSeed, x, y, z, 1);
    return rough[Math.min(rough.length - 1, Math.floor(draw * rough.length))] as number;
  };
  const place = (x: number, y: number, z: number, stateId: number, force = false): void => {
    if (!inside(region, x, z)) return;
    if (insideFootprint(footprints, x, z)) return;
    const key = `${x},${y},${z}`;
    if (!force && (carve.cells.has(key) || r.carvedCells.has(key))) return;
    r.blocks.push({ x, y, z, stateId });
  };

  const reach = ORE_CHAMBER_RADIUS + 1;
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === reach) {
        // The four walls, and only where an arm does not come through them:
        // a carved cell is never written into, so the mouths open themselves.
        for (let y = c.y; y < c.y + ORE_CHAMBER_HEIGHT; y++) place(x, y, z, stone(x, y, z, true));
        continue;
      }
      // The floor, under the same guard the gallery's own is under: a room
      // dug at one level meets a gallery that arrives at another, and the
      // room's floor course is the arriving corridor's walkway.
      if (!carve.walkCells.has(`${x},${c.y - 1},${z}`)) {
        place(x, c.y - 1, z, stone(x, c.y - 1, z, false), true);
      }
      place(x, c.y + ORE_CHAMBER_HEIGHT, z, stone(x, c.y + ORE_CHAMBER_HEIGHT, z, true));
    }
  }
  // The colonnade.
  for (const [dx, dz] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as const) {
    for (let y = c.y; y < c.y + ORE_CHAMBER_HEIGHT; y++) {
      place(c.x + dx, y, c.z + dz, r.states.timberPost, true);
    }
  }
  place(c.x, c.y + ORE_CHAMBER_HEIGHT - 1, c.z, r.states.lantern, true);

  // The cart at the terminus: wheels, a plank bed and a load, standing two
  // cells off the line and pointing along it — beside the walkway the gallery
  // arrives through, never across it. Blocks, not an entity: a minecart is an
  // entity, and everything this compiler emits has to survive a load-save
  // round trip as blocks.
  const [ax, az] = c.along;
  const px = -az;
  const pz = ax;
  const bx = c.x + px * 2;
  const bz = c.z + pz * 2;
  for (let k = -1; k <= 1; k++) {
    const x = bx + ax * k;
    const z = bz + az * k;
    // The grain of the wheels runs across the cart, which is the axis the
    // hubs read as from the side.
    place(x, c.y, z, r.states.cartWheel[ax !== 0 ? 1 : 0] as number, true);
    place(x, c.y + 1, z, r.states.cartBed, true);
  }
  place(bx, c.y + 2, bz, r.states.cartLoad, true);
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
  /* --- the styles ------------------------------------------------------- */
  /** Stone-brick gone green: the crypt's third block. */
  readonly mossy: number;
  /** The three stones a rough bore is hewn from, in draw order. */
  readonly rough: readonly number[];
  /** Coal, iron and copper — what a mine gallery's walls are studded with. */
  readonly ores: readonly number[];
  /** Timber post and lintel, for a working rather than a masonry gallery. */
  readonly timberPost: number;
  readonly timberLintel: readonly [number, number];
  /** The rail down the floor, in its default shape; the connection pass fixes it. */
  readonly rail: number;
  /** Still water, one block deep, in a dip. */
  readonly water: number;
  /** The shelf of a burial niche. */
  readonly nicheSlab: number;
  /** What lies on a shelf, and what hangs over it. */
  readonly candle: number;
  readonly cobweb: number;
  /** The cart at a terminus: wheels, bed and load. */
  readonly cartWheel: readonly [number, number];
  readonly cartBed: number;
  readonly cartLoad: number;
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
  const rawLog = (name: string, axis: string): number =>
    stack.blockStateOf(name, { axis }) ?? byName(name, "oak_log");
  return {
    masonry: byName(masonryName, "stone_bricks"),
    cracked: byName("cracked_stone_bricks", "stone_bricks"),
    stairs: [stair("north"), stair("east"), stair("south"), stair("west")] as const,
    lintel: [log("x"), log("z")] as const,
    post: byName(materials?.wood.fence ?? "oak_fence", "oak_fence"),
    lantern: stack.blockStateOf("lantern", { hanging: "true", waterlogged: "false" }) ??
      byName("lantern", "lantern"),
    air: stack.blockByName("air")?.stateId ?? 0,
    mossy: byName("mossy_stone_bricks", "stone_bricks"),
    // Three stones, not one. A working is cut through whatever the rock gave
    // and patched where it fell in, and one block repeated is the single
    // strongest tell that a corridor was generated rather than dug.
    rough: [
      byName("stone", "stone"),
      byName("cobblestone", "stone"),
      byName("andesite", "stone"),
    ] as const,
    ores: [
      byName("coal_ore", "stone"),
      byName("iron_ore", "stone"),
      byName("copper_ore", "stone"),
    ] as const,
    timberPost: rawLog("oak_log", "y"),
    timberLintel: [rawLog("oak_log", "x"), rawLog("oak_log", "z")] as const,
    rail: stack.blockStateOf("rail", { shape: "north_south", waterlogged: "false" }) ??
      byName("rail", "rail"),
    water: stack.blockStateOf("water", { level: "0" }) ?? byName("water", "water"),
    nicheSlab: stack.blockStateOf("stone_brick_slab", {
      type: "bottom",
      waterlogged: "false",
    }) ?? byName("stone_brick_slab", "stone_brick_slab"),
    candle: stack.blockStateOf("candle", { candles: "1", lit: "false", waterlogged: "false" }) ??
      byName("candle", "candle"),
    cobweb: byName("cobweb", "cobweb"),
    cartWheel: [
      rawLog("stripped_oak_log", "x"),
      rawLog("stripped_oak_log", "z"),
    ] as const,
    cartBed: byName("oak_planks", "oak_planks"),
    cartLoad: stack.blockStateOf("hay_block", { axis: "y" }) ?? byName("hay_block", "hay_block"),
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
): LiningResult {
  const { region } = r.input.plan;
  const style = r.link.style ?? "dressed";
  const footprints = r.input.placements.map((p) => p.footprint);
  const crackSeed = detailSeed(r.input.seed, `tunnel.${r.link.id}`);
  const oreSeed = detailSeed(r.input.seed, `tunnel.ore.${r.link.id}`);
  const half = (TUNNEL_WIDTH - 1) >> 1;
  let blocks = 0;
  let frames = 0;
  let lanterns = 0;
  let rails = 0;
  let niches = 0;
  let ores = 0;

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
    const key = `${x},${y},${z}`;
    if (!force && carve.cells.has(key)) return;
    // An *earlier* gallery's air is never written into, forced or not. `force`
    // means "this block is deliberate inside my own bore" — a floor stair, a
    // frame post — and none of those reasons apply to somebody else's walkway.
    if (r.carvedCells.has(key) && !carve.cells.has(key)) return;
    r.blocks.push({ x, y, z, stateId });
    blocks++;
  };

  /**
   * The block one cell of the lining is drawn from.
   *
   * `wall` is what separates a face a player looks at from the floor they walk
   * on: ore is studded into walls and ceilings and never into the floor, both
   * because that is where a miner would have followed it and because an ore
   * block in the walkway reads as a trip hazard rather than as a seam.
   */
  const stone = (x: number, y: number, z: number, wall: boolean): number => {
    const draw = hash3(crackSeed, x, y, z, 1);
    if (style === "crypt") {
      if (draw < 0.18) return r.states.cracked;
      if (draw < 0.36) return r.states.mossy;
      return r.states.masonry;
    }
    if (style === "mine") {
      if (wall) {
        const ore = oreAt(r.states, oreSeed, x, y, z, MINE_ORE_FIELD_SHARE, MINE_ORE_SHARE);
        if (ore !== null) {
          ores++;
          return ore;
        }
      }
      const rough = r.states.rough;
      return rough[Math.min(rough.length - 1, Math.floor(draw * rough.length))] as number;
    }
    return draw < 0.22 ? r.states.cracked : r.states.masonry;
  };

  // --- the water ------------------------------------------------------------
  // Found before anything is written, because the shell rule the physics lint
  // re-derives from the finished world is about the air *around* a fluid: the
  // bore within four blocks of a pool is written as plain air rather than left
  // as the cave air a bore normally is, which is the honest answer to "is this
  // a flooded working or a cave that broke into a lake" — it is a room.
  const pool = style === "mine" ? settleTunnelPools(r, path, carve) : EMPTY_POOL;
  for (const key of pool.shell) {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    place(x, y, z, r.states.air, true);
  }

  let frameIndex = 0;
  let nicheIndex = 0;
  for (const [i, cell] of path.entries()) {
    const height = boreHeight(cell, footprints);
    const perps = perpendiculars(path, i);

    for (const [px, pz] of perps) {
      // --- floor and ceiling ------------------------------------------------
      for (let d = -half; d <= half; d++) {
        const x = cell.x + px * d;
        const z = cell.z + pz * d;
        // The floor is force-written, because the course under a walk plane is
        // inside the bore of whatever cell stands one lower. That is exactly
        // why it needs a guard: where a corner is also a step, the higher
        // cell's floor swath reaches across the *lower* cell's walkway, and a
        // forced write there lays a full block in a corridor a player has to
        // walk down — which is what the traversal lint found the first time a
        // mine gallery was dug through one.
        if (!carve.walkCells.has(`${x},${cell.y - 1},${z}`)) {
          place(x, cell.y - 1, z, stone(x, cell.y - 1, z, false), true);
        }
        place(x, cell.y + height, z, stone(x, cell.y + height, z, true));
      }
      // --- walls ------------------------------------------------------------
      for (const side of [-(half + 1), half + 1]) {
        const x = cell.x + px * side;
        const z = cell.z + pz * side;
        // A rough bore is cut back a cell here and there: the wall block is
        // replaced with air, and the rock behind it is what the player sees.
        const recess =
          style === "mine" &&
          perps.length === 1 &&
          !cell.portal &&
          hash3(oreSeed, x, cell.y, z, 7) < MINE_RECESS_SHARE;
        for (let y = cell.y; y < cell.y + height; y++) {
          if (recess && y < cell.y + 2) {
            place(x, y, z, r.states.air);
            continue;
          }
          place(x, y, z, stone(x, y, z, true));
        }
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

    const straightRun = perps.length === 1 && !cell.portal;

    // --- the water, and the rail -------------------------------------------
    // The pool is one block deep by construction: it fills the *floor* course
    // of a dip whose sides rise at least two, so a player wades it rather than
    // swims it and the traversal walk crosses it unchanged.
    const flooded = pool.cells.has(`${cell.x},${cell.y},${cell.z}`);
    if (flooded) {
      for (const [px, pz] of perps) {
        for (let d = -half; d <= half; d++) {
          const x = cell.x + px * d;
          const z = cell.z + pz * d;
          if (!pool.cells.has(`${x},${cell.y},${z}`)) continue;
          place(x, cell.y, z, r.states.water, true);
        }
      }
    } else if (style === "mine" && !cell.portal && !insideFootprint(footprints, cell.x, cell.z)) {
      // The rail is laid in its *default* shape and left there: `shape` is a
      // statement about a neighbourhood, and `emit/connections.ts` is the one
      // place in this compiler allowed to make it — which is also what gets
      // the ascending variants right where the gallery climbs.
      place(cell.x, cell.y, cell.z, r.states.rail, true);
      rails++;
    }

    // --- burial niches ------------------------------------------------------
    if (style === "crypt" && straightRun && !cell.flight && i % TUNNEL_NICHE_SPACING === 0) {
      const [px, pz] = perps[0] as readonly [number, number];
      const side = nicheIndex % 2 === 0 ? half + 1 : -(half + 1);
      nicheIndex++;
      const x = cell.x + px * side;
      const z = cell.z + pz * side;
      if (
        inside(region, x, z) &&
        !insideFootprint(footprints, x, z) &&
        !carve.cells.has(`${x},${cell.y},${z}`)
      ) {
        // A niche is a *wall* cell: two courses of the lining removed and a
        // shelf laid in the bottom of the recess. It costs the gallery no
        // floor, so the walk through it is the walk it already had.
        place(x, cell.y, z, r.states.air, true);
        place(x, cell.y + 1, z, r.states.air, true);
        place(x, cell.y, z, r.states.nicheSlab, true);
        const draw = hash3(oreSeed, x, cell.y, z, 9);
        if (draw < 0.4) place(x, cell.y + 1, z, r.states.candle, true);
        else if (draw < 0.7) place(x, cell.y + 1, z, r.states.cobweb, true);
        niches++;
      }
    }

    // --- the support frame ------------------------------------------------
    // Only on a straight, level, single-perpendicular run well clear of both
    // portals: a frame at a corner would stand its posts in the other arm.
    const straight =
      straightRun &&
      !cell.flight &&
      i >= 2 &&
      i <= path.length - 3 &&
      i % TUNNEL_FRAME_SPACING === 0;
    if (!straight) continue;
    const [px, pz] = perps[0] as readonly [number, number];
    frames++;
    // Posts against the walls, the full height of the bore, and a lintel
    // across the ceiling plane above them. A working frames in timber — whole
    // logs, standing on the floor — where a dressed gallery frames in a fence
    // stem under a stripped-log beam.
    const post = style === "mine" ? r.states.timberPost : r.states.post;
    const lintel = style === "mine" ? r.states.timberLintel : r.states.lintel;
    for (const side of [-half, half]) {
      const x = cell.x + px * side;
      const z = cell.z + pz * side;
      for (let y = cell.y; y < cell.y + height; y++) place(x, y, z, post, true);
    }
    for (let d = -half; d <= half; d++) {
      const x = cell.x + px * d;
      const z = cell.z + pz * d;
      place(x, cell.y + height, z, lintel[px !== 0 ? 0 : 1] as number, true);
    }
    if (frameIndex % TUNNEL_LANTERN_EVERY_N_FRAMES === 0) {
      // Hung from the lintel, one block over head height: the light is in the
      // ceiling, not in the walkway.
      place(cell.x, cell.y + height - 1, cell.z, r.states.lantern, true);
      lanterns++;
    }
    frameIndex++;
  }

  return { blocks, frames, lanterns, rails, niches, ores, pool: pool.cells.size };
}

/** What one gallery's lining came to. */
interface LiningResult {
  readonly blocks: number;
  readonly frames: number;
  readonly lanterns: number;
  readonly rails: number;
  readonly niches: number;
  readonly ores: number;
  readonly pool: number;
}

/* -------------------------------------------------------------------------- */
/* ore                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The ore one wall block shows, or `null` for plain rock.
 *
 * Two draws, and the reason is that one draw gives a rash. The coarse one asks
 * whether this part of the rock is a *seam* at all, on a four-by-two-by-four
 * lattice so the answer is the same for a patch of wall rather than for a
 * block; the fine one picks which blocks of that patch broke through. The
 * result reads as a vein a miner followed, which is the thing a uniformly
 * sprinkled wall never does.
 */
export function oreAt(
  states: TunnelStates,
  seed: number,
  x: number,
  y: number,
  z: number,
  fieldShare: number,
  share: number,
): number | null {
  if (hash3(seed, x >> 2, y >> 1, z >> 2, 3) >= fieldShare) return null;
  const fine = hash3(seed, x, y, z, 4);
  if (fine >= share) return null;
  const ores = states.ores;
  const pick = Math.min(ores.length - 1, Math.floor((fine / share) * ores.length));
  return ores[pick] as number;
}

/* -------------------------------------------------------------------------- */
/* flooded dips                                                                */
/* -------------------------------------------------------------------------- */

/** A settled pool, and the bore air whose shell rule it made this pass's problem. */
interface TunnelPool {
  /** `"x,y,z"` of every water block. */
  readonly cells: ReadonlySet<string>;
  /** `"x,y,z"` of bore cells to write as plain air rather than leave cave air. */
  readonly shell: ReadonlySet<string>;
}

const EMPTY_POOL: TunnelPool = { cells: new Set<string>(), shell: new Set<string>() };

/**
 * The runs of a gallery's floor profile that stand at least `minDepth` below
 * both of their shoulders.
 *
 * A pure function of the centre line, and exported because that is what makes
 * it testable without a world: a route is a list of `(x, z, y)`, a dip is a
 * maximal run of equal `y` whose ground rises far enough on both sides before
 * it falls again, and everything about which cells hold water follows from
 * that one definition.
 */
export function floodedDipRuns(
  path: readonly TunnelCell[],
  minDepth = MINE_POOL_MIN_DEPTH,
): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  let a = 0;
  while (a < path.length) {
    let b = a;
    const y = (path[a] as TunnelCell).y;
    while (b + 1 < path.length && (path[b + 1] as TunnelCell).y === y) b++;
    // The shoulders: scan out either way, taking the highest ground reached
    // before the profile falls below this run. A run that reaches the end of
    // the path without ever falling below has an open shoulder there, and an
    // open shoulder is a cellar — no basin, no water.
    const shoulder = (step: number): number | null => {
      let best = y;
      for (let i = (step < 0 ? a : b) + step; i >= 0 && i < path.length; i += step) {
        const cy = (path[i] as TunnelCell).y;
        if (cy < y) return best;
        if (cy > best) best = cy;
        if (best - y >= minDepth) return best;
      }
      return null;
    };
    const left = shoulder(-1);
    const right = shoulder(1);
    const closed =
      left !== null && right !== null && left - y >= minDepth && right - y >= minDepth;
    // Portal runs never flood: they are the ramp out of a cellar, and a cellar
    // doorway standing in water is a defect, not a mood.
    const dry = path.slice(a, b + 1).some((c) => c.portal);
    if (closed && !dry) out.push([a, b]);
    a = b + 1;
  }
  return out;
}

/**
 * Fill the dips, and prove they hold.
 *
 * The proof is the stdlib's {@link stableFluidColumns} — the single definition
 * of "fluid-stable" in the toolchain, the same one the terrain's ponds and the
 * open-basin search use. A candidate column drops out when a neighbour is
 * neither in the pool nor filled to the surface level, run to a fixed point;
 * what survives is water that cannot flow, so zero unstable columns is a
 * property of the machinery rather than of this caller's arithmetic.
 */
function settleTunnelPools(
  r: RouteRequest,
  path: readonly TunnelCell[],
  carve: CarveSet,
): TunnelPool {
  const { region } = r.input.plan;
  const footprints = r.input.placements.map((p) => p.footprint);
  const cells = new Set<string>();
  const half = (TUNNEL_WIDTH - 1) >> 1;

  for (const [a, b] of floodedDipRuns(path)) {
    const level = (path[a] as TunnelCell).y + 1;
    /** The dip's own columns, and the walk plane each one stands at. */
    const floorByColumn = new Map<number, number>();
    for (let i = a; i <= b; i++) {
      const cell = path[i] as TunnelCell;
      for (const [px, pz] of perpendiculars(path, i)) {
        for (let d = -half; d <= half; d++) {
          const x = cell.x + px * d;
          const z = cell.z + pz * d;
          if (!inside(region, x, z)) continue;
          if (insideFootprint(footprints, x, z)) continue;
          floorByColumn.set(index(region, x, z), cell.y);
        }
      }
    }
    const settled = stableFluidColumns({
      width: region.width,
      depth: region.depth,
      columns: floorByColumn.keys(),
      level,
      // The floor of a candidate is the block under the walk plane, so a
      // column whose plane is the dip's own is below `level` and joins.
      floorAt: (idx) => (floorByColumn.get(idx) ?? level) - 1,
      // A neighbour that is not in the pool is either the rock the bore is cut
      // through — filled past this question as far as it is concerned — or a
      // stretch of gallery standing higher, whose own floor is the level it is
      // filled to. Both hold water in; neither leaks.
      topAt: (idx) => {
        const floor = carve.floorByColumn.get(idx);
        return floor === undefined ? level + TUNNEL_HEIGHT : floor;
      },
    });
    for (const [idx, y] of floorByColumn) {
      if (settled.inPool[idx] !== 1) continue;
      const x = region.x0 + (idx % region.width);
      const z = region.z0 + Math.floor(idx / region.width);
      cells.add(`${x},${y},${z}`);
    }
  }

  if (cells.size === 0) return EMPTY_POOL;

  // The shell: every carved cell of this gallery within the fluid shell of a
  // water block. Written as plain air, which is what it is — a lined room with
  // a puddle in it, not a cave that broke into groundwater.
  const shell = new Set<string>();
  const water = [...cells].map((k) => k.split(",").map(Number) as [number, number, number]);
  for (const key of carve.cells) {
    if (cells.has(key)) continue;
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    for (const [wx, wy, wz] of water) {
      if (
        Math.abs(x - wx) <= POOL_AIR_SHELL &&
        Math.abs(z - wz) <= POOL_AIR_SHELL &&
        Math.abs(y - wy) <= 2
      ) {
        shell.add(key);
        break;
      }
    }
  }
  return { cells, shell };
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
    // Junction chambers first. They are wider and a course taller than the
    // galleries that feed them, so if either invariant is going to fail
    // anywhere it fails here — and the chambers are not on any centre line, so
    // the loop below would never look at them.
    for (const junction of tunnel.junctions ?? []) {
      if (!junction.chamber) continue;
      for (const { x, z } of chamberColumns(junction)) {
        if (!inside(region, x, z)) continue;
        const idx = index(region, x, z);
        if (nearFluid[idx] === 1 || nearOcean[idx] === 1) {
          fluidBreaches++;
          sample({
            tunnelId: tunnel.id,
            x,
            y: junction.y,
            z,
            detail: `junction chamber within ${TUNNEL_FLUID_SHELL} blocks of water, lava or the sea`,
          });
          continue;
        }
        if (insideFootprint(footprints, x, z)) continue;
        const roof = (ground[idx] as number) - (junction.y + JUNCTION_HEIGHT - 1);
        if (roof < TUNNEL_ROOF_THICKNESS) {
          roofBreaches++;
          sample({
            tunnelId: tunnel.id,
            x,
            y: junction.y + JUNCTION_HEIGHT - 1,
            z,
            detail: `junction chamber leaves only ${roof} blocks of roof under the surface at y ${ground[idx] as number} (want ${TUNNEL_ROOF_THICKNESS})`,
          });
        }
      }
    }

    // The ore chamber, on the same argument the junction chambers are checked
    // on: wider and taller than the gallery, and not on any centre line.
    const chamber = tunnel.oreChamber;
    if (chamber !== null && chamber !== undefined) {
      for (const { x, z } of oreChamberColumns(chamber)) {
        if (!inside(region, x, z)) continue;
        const idx = index(region, x, z);
        if (nearFluid[idx] === 1 || nearOcean[idx] === 1) {
          fluidBreaches++;
          sample({
            tunnelId: tunnel.id,
            x,
            y: chamber.y,
            z,
            detail: `ore chamber within ${TUNNEL_FLUID_SHELL} blocks of water, lava or the sea`,
          });
          continue;
        }
        if (insideFootprint(footprints, x, z)) continue;
        const roof = (ground[idx] as number) - (chamber.y + ORE_CHAMBER_HEIGHT - 1);
        if (roof < TUNNEL_ROOF_THICKNESS) {
          roofBreaches++;
          sample({
            tunnelId: tunnel.id,
            x,
            y: chamber.y + ORE_CHAMBER_HEIGHT - 1,
            z,
            detail: `ore chamber leaves only ${roof} blocks of roof under the surface at y ${ground[idx] as number} (want ${TUNNEL_ROOF_THICKNESS})`,
          });
        }
      }
    }

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
