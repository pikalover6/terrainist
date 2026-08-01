/**
 * The city plan layer — fabric v3, C1.
 *
 * Fabric v2 inverted "buildings first" into "streets first" and it worked. Kai
 * walked the result and returned the harder verdict: *"the settlements are all
 * just rectangles with simple grid layouts… it looks entirely like something
 * generated procedurally."* That is a structural limit, not a tuning miss.
 * `buildStreetGraph` picks line positions per axis and draws each line edge to
 * edge across a **rectangle**, and a district's outline is its authored
 * envelope rect. Rectangles inside rectangles, by construction.
 *
 * C1 inverts one level further: **arterials first, and districts are the
 * residue.**
 *
 * 1. **The armature.** A drive that follows the *real* shoreline, a spine along
 *    the long axis over low ground, one or two diagonals cut across the fabric,
 *    and a ring where the city is big enough to want one. All four are routed
 *    over the composed heightfield with the road pass's own A\* — the same cost
 *    model, the same bridge pricing, the same string-pulling — because a second
 *    router is a second set of bugs and a second answer to "can a boulevard
 *    climb that".
 * 2. **The partition.** Subtract the carriageways; the connected components
 *    that survive are the {@link DistrictCell}s. They are arbitrary polygons,
 *    carried as masks. A diagonal crossing a grid is what produces wedge lots
 *    and triangular corners, and it is the single most important thing in this
 *    file for killing the rectangle read.
 * 3. **The consequence.** Each cell takes a *character* from where it is and
 *    what its ground is like, and an *orientation* from the arterial that
 *    dominates its longest frontage — so neighbouring quarters meet at an angle
 *    instead of continuing one global grid, and they do so for a visible
 *    reason.
 *
 * {@link CityPlan} is the pinned cross-track surface (`docs/DESIGN.md`, "Fabric
 * v3 — the city"): C1 produces it, C2's skyline, C3's life pass and C4's set
 * pieces consume it. A cell's *internal* subdivision stays private to the
 * district fabric exactly as blocks and lots stayed private to F1.
 *
 * Determinism: every number below is arithmetic on the city's bounds, a draw
 * from `Rng(streamSeed(citySeed, …))` taken in a fixed order, a positional hash
 * keyed on a world column, or a lookup in {@link TRIG_15}. There is no
 * `Math.random`, no wall clock, no map-iteration order in any decision, and —
 * per the repo's rules — no transcendental function anywhere: every angle in
 * the contract is quantised to 15° precisely so rotation can be table-driven.
 */

import {
  Rng,
  positionInt,
  streamSeed,
  type HeightField,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";

import {
  ROAD_SMOOTH_REACH,
  buildBridgeableMask,
  routeTo,
  smoothRoute,
} from "../structures/roads.js";

import { clampInt, type Point2, type Rect } from "./frames.js";
import {
  carriagewayCells,
  densify4,
  headingOf,
  quantizeHeading,
  type StreetGraph,
} from "./streets.js";

/* -------------------------------------------------------------------------- */
/* the pinned contract                                                         */
/* -------------------------------------------------------------------------- */

// Radians are not used anywhere in this contract. Angles are degrees.
//
// `DistrictCharacter` is declared in `prominence.ts` rather than here: the
// skyline field shipped before this module and the contract amendment in
// `docs/DESIGN.md` names that file as its home. Re-exported so a consumer of
// the city plan still gets the whole contract from one import.
export type { DistrictCharacter } from "./prominence.js";
import type { DistrictCharacter } from "./prominence.js";

/** A city-scale road. Drawn before any district exists. */
export interface Arterial {
  readonly id: string;
  readonly kind: "boulevard" | "drive" | "diagonal" | "ring" | "spine";
  /** Carriageway columns. Wider than any StreetSegment: 9–13. */
  readonly width: number;
  /** Carriageway centre line, 4-connected, cell by cell — same shape as
   *  StreetSegment["path"], so every existing consumer walks it unchanged. */
  readonly path: readonly { readonly x: number; readonly z: number }[];
  /** Where this arterial visually ends. C4 seats a landmark on it. */
  readonly termini: readonly {
    readonly at: { readonly x: number; readonly z: number };
    /** Heading the viewer looks along, degrees, 0 = +Z, quantised to 15. */
    readonly heading: number;
  }[];
}

/** One face of the arterial network: an arbitrary polygon, not a rect. */
export interface DistrictCell {
  readonly id: string;
  readonly character: DistrictCharacter;
  /** 1 inside the cell. Row-major over `bounds`, NOT over the region. */
  readonly mask: Uint8Array;
  /** Tight bounding box of the mask, in world columns. */
  readonly bounds: Rect;
  /** Columns inside the mask. */
  readonly area: number;
  /** Local grid rotation about the bounds centre, degrees, quantised to 15. */
  readonly orientation: number;
  readonly blockSize: number;
  readonly density: "low" | "medium" | "high";
  /** Salt for this cell's palette drift, so fabric changes as you walk. */
  readonly paletteSalt: string;
}

export interface CityPlan {
  readonly bounds: Rect;
  readonly arterials: readonly Arterial[];
  readonly cells: readonly DistrictCell[];
  /** 1 on any arterial carriageway column, row-major over the region. */
  readonly arterialMask: Uint8Array;
}

/**
 * A note on `arterialMask`'s indexing, because it is an easy and expensive bug.
 *
 * "The region" in the contract line above is **this plan's own region** — i.e.
 * {@link CityPlan.bounds} — which is the rect the contract hands you and the
 * only one it hands you. The sentence exists to contrast with
 * {@link DistrictCell.mask}, which is over the *cell's* bounds and not over the
 * city's. So: `arterialMask[(z − bounds.z0) · widthOf(bounds) + (x − bounds.x0)]`.
 * {@link arterialAt} does it for you and is the safe way to ask.
 */
export function arterialAt(plan: CityPlan, x: number, z: number): boolean {
  const { bounds } = plan;
  if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return false;
  const stride = bounds.x1 - bounds.x0 + 1;
  return plan.arterialMask[(z - bounds.z0) * stride + (x - bounds.x0)] === 1;
}

/** Whether a column is inside one cell, honouring the cell's own indexing. */
export function cellContains(cell: DistrictCell, x: number, z: number): boolean {
  const b = cell.bounds;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return false;
  return cell.mask[(z - b.z0) * (b.x1 - b.x0 + 1) + (x - b.x0)] === 1;
}

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Carriageway width per arterial kind, in columns. All inside the 9–13 band. */
export const ARTERIAL_WIDTH: Readonly<Record<Arterial["kind"], number>> = Object.freeze({
  spine: 13,
  drive: 11,
  diagonal: 11,
  ring: 9,
  boulevard: 9,
});

/** Columns kept clear inside the bounds so an arterial's band never spills out. */
export const CITY_INSET = 8;

/** Blocks of dry land between the water and the drive's centre line. */
export const DRIVE_OFFSET = 12;

/** Tolerance either side of {@link DRIVE_OFFSET} for a column to count as shore. */
export const DRIVE_BAND = 5;

/** Water columns a footprint needs before the plan calls the city coastal. */
export const COAST_MIN_WATER = 900;

/** Shore-band columns a drive needs before it is worth routing. */
export const DRIVE_MIN_BAND = 120;

/**
 * What an arterial pays per cell for leaving the shore band, and per steep cell.
 *
 * Charged through the router's existing per-cell surcharge channel rather than
 * as a veto: a cost says "go round the bluff if you reasonably can", a veto
 * says "there is no city here", and on real terrain the second one is wrong
 * about a third of the time.
 */
export const ARTERIAL_OFF_BAND_COST = 34;

/** Height change, in blocks per column, past which ground is steep for a boulevard. */
export const ARTERIAL_STEEP = 3;

/**
 * Bridge pricing for an arterial, replacing the village lane's.
 *
 * The lane's `ROAD_BRIDGE_ENTRY` of 1200 buys "a ten-block river is worth 240
 * blocks of detour", which is the right answer for a cottage on the far bank
 * and precisely the wrong one for a city: Bayline's road pass dutifully routed
 * *around* the head of its river rather than bridging the mouth, and a
 * waterfront city with no bridge is a miss. A boulevard is infrastructure. It
 * crosses.
 */
export const ARTERIAL_BRIDGE_ENTRY = 150;
/** …and per further cell of the span. */
export const ARTERIAL_WATER_COST = 12;

/** Smallest face of the armature kept as a district cell, in columns. */
export const MIN_CELL_AREA = 420;

/** Shortest axis a cell's bounding box needs before a fabric is attempted. */
export const MIN_CELL_SPAN = 44;

/** Columns from open water within which a cell column counts as waterfront. */
export const WATERFRONT_REACH = 7;

/** Share of a cell's boundary that must be near water for `waterfront`. */
export const WATERFRONT_SHARE = 0.14;

/** Relief across a cell, in blocks, past which it is given over to a park. */
export const PARK_RELIEF = 13;

/** Below this fraction of its own bounding box a cell is an awkward shape. */
export const PARK_COMPACTNESS = 0.5;

/** A cell smaller than this is a lanes quarter rather than a grid one. */
export const LANES_AREA = 2600;

/** Normalised distance from the city centre inside which the core is chosen. */
export const CORE_RADIUS = 0.46;

/** How far out from a cell's edge the orientation probe looks for an arterial. */
export const ORIENT_PROBE = 9;

/** Per-character fabric knobs. The reason two quarters look different. */
export const CHARACTER_KIT: Readonly<
  Record<
    DistrictCharacter,
    {
      readonly blockSize: number;
      readonly density: DistrictCell["density"];
      readonly fabric: "grid" | "organic";
    }
  >
> = Object.freeze({
  core: { blockSize: 40, density: "high", fabric: "grid" },
  grid: { blockSize: 44, density: "high", fabric: "grid" },
  rowhouse: { blockSize: 36, density: "high", fabric: "grid" },
  lanes: { blockSize: 31, density: "high", fabric: "organic" },
  industrial: { blockSize: 58, density: "medium", fabric: "grid" },
  civic: { blockSize: 48, density: "medium", fabric: "grid" },
  park: { blockSize: 64, density: "low", fabric: "organic" },
  waterfront: { blockSize: 40, density: "medium", fabric: "organic" },
});

/**
 * The smallest block a city cell will ask for, whatever its character.
 *
 * Not an aesthetic floor — a **safety** one, and it is worth spelling out
 * because the number looks arbitrary. Below roughly this spacing the block
 * subdivision starts producing seven-deep parcels, and a seven-deep building
 * with three storeys in it comes out of the grammar with pockets its own stair
 * cannot reach: `showcase-bayline.loam.json` with nothing changed but
 * `blockSize: 33` on its (ordinary, pre-C1) districts lints 62
 * `traversal.unreachable` findings. That is a building-grammar bug and it is
 * not C1's to fix, but C1 must not be the thing that walks into it, so a
 * quarter that wants to feel tight gets its tightness from an organic skeleton
 * and a turned grid rather than from a smaller block.
 */
export const CELL_MIN_BLOCK = 30;

/**
 * Smallest footprint axis a city cell hands the building grammar.
 *
 * Three blocks above the district default, and the extra three are a
 * quarantine rather than a preference — see {@link CELL_MIN_BLOCK} and
 * `CellFabric.minBuilding`. A parcel this pass declines is open ground, which
 * the ground-treatment pass dresses; a building the grammar cannot lay out is
 * a physics finding.
 */
export const CELL_MIN_BUILDING = 10;

/** The block size the {@link CHARACTER_KIT} numbers are stated against. */
export const CHARACTER_BLOCK_BASE = 40;

/**
 * How much a turned cell's blocks are grown, ×100.
 *
 * A rotated grid's blocks are diamonds against the world axes, and the block
 * subdivision inscribes an axis-aligned rectangle in each — which throws away
 * roughly a third of the area at 45°. Growing the spacing gives the inscribed
 * rectangle back the depth a lot needs, so a turned quarter has buildings in it
 * rather than nine dropped parcels and a lot of grass.
 */
export const ROTATED_BLOCK_GAIN = 116;

/** Ring roads want room; below this the loop is just a second spine. */
export const RING_MIN_SPAN = 260;

/** Diagonals drawn per city size, when the author does not say. */
export const DIAGONALS_BY_SIZE: Readonly<Record<string, number>> = Object.freeze({
  small: 1,
  medium: 1,
  large: 2,
});

/* -------------------------------------------------------------------------- */
/* input                                                                       */
/* -------------------------------------------------------------------------- */

/** The knobs a `city` node's params turn, already defaulted. */
export interface CityPlanParams {
  readonly size: "small" | "medium" | "large";
  /** `undefined` means "coastal if the ground is". */
  readonly coastal?: boolean;
  readonly diagonals?: number;
  readonly ring?: boolean;
  readonly blockSize?: number;
}

/** Everything {@link buildCityPlan} reads. */
export interface CityPlanInput {
  /** The footprint the solver placed — the plan's whole world. */
  readonly bounds: Rect;
  /** The composed, levelled heightfield. */
  readonly field: HeightField;
  /**
   * 1 where a column holds water, row-major over `field.region`.
   *
   * The layout stage has no column plan — it runs before one exists — so this
   * is the classification's ocean and lake masks unioned, which is exactly what
   * `buildColumnPlan` will turn into `fluidKind` a few passes later.
   */
  readonly water?: Uint8Array;
  readonly seaLevel: number;
  /** `nodeSeed(worldSeed, cityPath, seedSalt)`. */
  readonly seed: Seed256;
  readonly params: CityPlanParams;
}

/** Why a city could not be planned. */
export interface CityPlanFailure {
  readonly ok: false;
  readonly reason: string;
  readonly fix: string;
}

/** Numbers about the armature, for the compile report. */
export interface CityPlanStats {
  readonly arterials: number;
  /** Centre-line cells, summed over every arterial — the drive, in blocks. */
  readonly arterialLength: number;
  readonly arterialColumns: number;
  /** Centre-line cells carried over water. */
  readonly bridgedCells: number;
  readonly junctions: number;
  readonly cells: number;
  /** Faces of the armature dropped for being slivers. */
  readonly slivers: number;
  /** Columns those slivers held — ground the plan gave to nobody. */
  readonly sliverColumns: number;
  /** Columns the kept cells hold, summed. */
  readonly cellColumns: number;
  readonly characters: Readonly<Record<string, number>>;
  /** Distinct orientations among the cells — 1 means one global grid. */
  readonly orientations: number;
  readonly coastal: boolean;
}

/** A plan, or the reason there is none. */
export type CityPlanResult =
  | { readonly ok: true; readonly plan: CityPlan; readonly stats: CityPlanStats }
  | CityPlanFailure;

/* -------------------------------------------------------------------------- */
/* the local grid                                                              */
/* -------------------------------------------------------------------------- */

/** Row-major addressing over a city footprint, and the router's region. */
class Plot {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
  readonly cells: number;
  readonly region: Region;

  constructor(bounds: Rect) {
    this.x0 = bounds.x0;
    this.z0 = bounds.z0;
    this.width = bounds.x1 - bounds.x0 + 1;
    this.depth = bounds.z1 - bounds.z0 + 1;
    this.cells = this.width * this.depth;
    this.region = { x0: this.x0, z0: this.z0, width: this.width, depth: this.depth };
  }

  index(x: number, z: number): number {
    const i = x - this.x0;
    const j = z - this.z0;
    if (i < 0 || j < 0 || i >= this.width || j >= this.depth) return -1;
    return j * this.width + i;
  }

  x(index: number): number {
    return this.x0 + (index % this.width);
  }

  z(index: number): number {
    return this.z0 + Math.floor(index / this.width);
  }
}

const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const);

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Plan a city: route its armature, then take the faces of it as districts.
 *
 * Order is load-bearing throughout. The drive goes first because it is the one
 * arterial whose route is dictated by something outside the plan — the real
 * shoreline — and everything else should meet *it*. The spine second, because
 * it is the longest. Diagonals third, because a diagonal is interesting only
 * against a fabric that already exists to be cut. The ring last, because it is
 * a convenience road and should bend around what is already there.
 */
export function buildCityPlan(input: CityPlanInput): CityPlanResult {
  const plot = new Plot(input.bounds);
  if (plot.width < 2 * CITY_INSET + MIN_CELL_SPAN || plot.depth < 2 * CITY_INSET + MIN_CELL_SPAN) {
    return {
      ok: false,
      reason: `a city needs room for an arterial and a district cell beside it; this footprint is ${plot.width} × ${plot.depth}`,
      fix: `grow "envelope.size", or express this as a single "kind": "district" node — one quarter of fabric is what a district is`,
    };
  }

  const ground = groundOf(plot, input.field);
  const water = waterOf(plot, input.field.region, input.water);
  const bridgeable = buildBridgeableMask({ region: plot.region, fluidKind: water });
  const blocked = new Uint8Array(plot.cells);
  for (let k = 0; k < plot.cells; k++) {
    if (water[k] === 1 && bridgeable[k] === 0) blocked[k] = 1;
  }
  const steep = steepOf(plot, ground);

  let wet = 0;
  for (let k = 0; k < plot.cells; k++) if (water[k] === 1) wet++;
  const coastal = input.params.coastal ?? wet >= COAST_MIN_WATER;

  const ctx: RouteContext = { plot, ground, water, blocked, steep };
  const rng = new Rng(streamSeed(input.seed, "layout"));

  const arterials: Arterial[] = [];
  if (coastal && wet > 0) {
    const drive = routeDrive(ctx, water);
    if (drive !== null) arterials.push(makeArterial("drive", "drive", toEdge(ctx, drive)));
  }

  const spine = routeSpine(ctx, rng);
  if (spine !== null) arterials.push(makeArterial("spine", "spine", toEdge(ctx, spine)));

  const wanted = clampInt(
    Math.round(input.params.diagonals ?? (DIAGONALS_BY_SIZE[input.params.size] as number)),
    0,
    2,
  );
  for (const [i, path] of routeDiagonals(ctx, wanted, rng).entries()) {
    arterials.push(makeArterial(`diagonal${i}`, "diagonal", toEdge(ctx, path)));
  }

  const wantsRing =
    input.params.ring ?? Math.min(plot.width, plot.depth) >= RING_MIN_SPAN;
  if (wantsRing) {
    const ring = routeRing(ctx);
    if (ring !== null) arterials.push(makeArterial("ring", "ring", ring));
  }

  if (arterials.length === 0) {
    return {
      ok: false,
      reason: "no arterial could be routed across this footprint: every candidate line is blocked by unbridgeable water or impossible ground",
      fix: 'move the city with a "zone" or "at" constraint, or shrink its envelope so it sits on ground a boulevard can cross',
    };
  }

  // --- connectivity: an arterial that meets nothing is not city ------------
  const stitched = stitch(ctx, arterials);

  // --- the carriageway ------------------------------------------------------
  const raster = rasterize(plot, stitched);

  // --- the partition --------------------------------------------------------
  const faces = facesOf(plot, raster.mask, water);
  const cells: DistrictCell[] = [];
  const metrics = faces.kept.map((face) =>
    measure(plot, face, ground, water, input.bounds),
  );
  const characters = assign(metrics, input.params.size);
  for (const [i, face] of faces.kept.entries()) {
    const m = metrics[i] as CellMetrics;
    const character = characters[i] as DistrictCharacter;
    const kit = CHARACTER_KIT[character];
    const scale = (input.params.blockSize ?? CHARACTER_BLOCK_BASE) / CHARACTER_BLOCK_BASE;
    const drift = positionInt(streamSeed(input.seed, "grammar"), m.bounds.x0, 3, m.bounds.z0, -3, 3);
    const orientation = orientationOf(plot, face, raster);
    const gain = orientation === 0 ? 100 : ROTATED_BLOCK_GAIN;
    cells.push({
      id: `cell_${i}`,
      character,
      mask: face.mask,
      bounds: m.bounds,
      area: face.area,
      orientation,
      blockSize: clampInt(
        Math.round((kit.blockSize * scale * gain) / 100) + drift,
        CELL_MIN_BLOCK,
        96,
      ),
      density: kit.density,
      paletteSalt: `c1:${character}:${i}`,
    });
  }

  const histogram: Record<string, number> = {};
  for (const cell of cells) histogram[cell.character] = (histogram[cell.character] ?? 0) + 1;
  const distinct = new Set(cells.map((c) => c.orientation));
  let bridged = 0;
  for (const arterial of stitched) {
    for (const cell of arterial.path) {
      const k = plot.index(cell.x, cell.z);
      if (k >= 0 && water[k] === 1) bridged++;
    }
  }

  return {
    ok: true,
    plan: { bounds: input.bounds, arterials: stitched, cells, arterialMask: raster.mask },
    stats: {
      arterials: stitched.length,
      arterialLength: stitched.reduce((sum, a) => sum + a.path.length, 0),
      arterialColumns: raster.columns,
      bridgedCells: bridged,
      junctions: junctionsOf(stitched).length,
      cells: cells.length,
      slivers: faces.slivers,
      sliverColumns: faces.sliverColumns,
      cellColumns: cells.reduce((sum, c) => sum + c.area, 0),
      characters: histogram,
      orientations: distinct.size,
      coastal,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the armature                                                                */
/* -------------------------------------------------------------------------- */

/** Everything the four routers share. */
interface RouteContext {
  readonly plot: Plot;
  readonly ground: Int32Array;
  /** 1 where the column holds water. */
  readonly water: Uint8Array;
  /** 1 where no route may go at all — water too wide to span. */
  readonly blocked: Uint8Array;
  /** 1 where the ground rises faster than a boulevard should climb. */
  readonly steep: Uint8Array;
}

/**
 * Run an open arterial's two ends out to the city boundary.
 *
 * Load-bearing, and it took a probe to see why: an arterial routed between two
 * waypoints inset from the edge leaves a gap at each end, the ground flows
 * round it, and the "partition" comes back as **one cell the size of the whole
 * city** — the rectangle problem, restored in full, by eight columns of margin.
 * A cut only cuts if it reaches both edges.
 *
 * The extension is a straight run along the terminal heading, stopped by
 * anything the router itself would refuse, so it cannot invent a crossing the
 * cost model never priced.
 */
function toEdge(ctx: RouteContext, path: readonly Point2[]): Point2[] {
  const { plot } = ctx;
  const x1 = plot.x0 + plot.width - 1;
  const z1 = plot.z0 + plot.depth - 1;
  const run = (from: Point2, inner: Point2): Point2[] => {
    const dx = Math.sign(from.x - inner.x);
    const dz = Math.sign(from.z - inner.z);
    // One axis only: a diagonal tail would need the 4-connected staircase and
    // the whole point of the run is that it is the shortest reach to an edge.
    const [sx, sz] =
      Math.abs(from.x - inner.x) >= Math.abs(from.z - inner.z) ? [dx, 0] : [0, dz];
    if (sx === 0 && sz === 0) return [];
    const out: Point2[] = [];
    let x = from.x;
    let z = from.z;
    for (let step = 0; step < Math.max(plot.width, plot.depth); step++) {
      x += sx;
      z += sz;
      const k = plot.index(x, z);
      if (k < 0 || ctx.blocked[k] === 1) break;
      out.push({ x, z });
      if (x <= plot.x0 || x >= x1 || z <= plot.z0 || z >= z1) break;
    }
    return out;
  };

  const look = Math.min(10, path.length - 1);
  const head = run(path[0] as Point2, path[look] as Point2).reverse();
  const tail = run(path[path.length - 1] as Point2, path[path.length - 1 - look] as Point2);
  return [...head, ...path, ...tail];
}

/** An arterial from a routed centre line, with its two termini. */
function makeArterial(id: string, kind: Arterial["kind"], path: readonly Point2[]): Arterial {
  const first = path[0] as Point2;
  const last = path[path.length - 1] as Point2;
  const look = Math.min(12, path.length - 1);
  const inbound = path[look] as Point2;
  const outbound = path[path.length - 1 - look] as Point2;
  const closed = first.x === last.x && first.z === last.z;
  return {
    id,
    kind,
    width: ARTERIAL_WIDTH[kind],
    path,
    // A ring has no end to stand at and look down; an open arterial has two,
    // and the heading is the way the *viewer* looks — back along the road into
    // the city, which is where C4 will want the landmark.
    termini: closed
      ? []
      : [
          { at: first, heading: quantizeHeading(inbound.x - first.x, inbound.z - first.z) },
          { at: last, heading: quantizeHeading(outbound.x - last.x, outbound.z - last.z) },
        ],
  };
}

/**
 * Route one leg with the road pass's A\*, then pull it straight.
 *
 * `routeTo` searches *backwards* from every cell of its `road` mask to the
 * given start, so a mask holding nothing but the goal turns it into an ordinary
 * point-to-point search — the same cost model, the same turn penalties, the
 * same bridge pricing as every lane in the project, with the water surcharges
 * dialled down to what a city boulevard should pay.
 */
function leg(
  ctx: RouteContext,
  from: Point2,
  to: Point2,
  surcharge?: Uint8Array,
): Point2[] | null {
  const { plot } = ctx;
  const goal = new Uint8Array(plot.cells);
  const at = plot.index(to.x, to.z);
  if (at < 0) return null;
  goal[at] = 1;
  const start = plot.index(from.x, from.z);
  if (start < 0) return null;

  const found = routeTo(plot.region, ctx.blocked, goal, { ground: ctx.ground }, from, {
    water: waterCrossable(ctx),
    wallHug: surcharge ?? ctx.steep,
    bridgeEntry: ARTERIAL_BRIDGE_ENTRY,
    waterCost: ARTERIAL_WATER_COST,
  });
  if (found === null) return null;
  const smoothed = smoothRoute(
    plot.region,
    ctx.blocked,
    goal,
    { ground: ctx.ground },
    found,
    ROAD_SMOOTH_REACH,
    waterCrossable(ctx),
  );
  return densify4(smoothed);
}

/** Water a bridge may legally reach — the router's priced-not-forbidden set. */
function waterCrossable(ctx: RouteContext): Uint8Array {
  const out = new Uint8Array(ctx.plot.cells);
  for (let k = 0; k < out.length; k++) {
    if (ctx.water[k] === 1 && ctx.blocked[k] === 0) out[k] = 1;
  }
  return out;
}

/** Route a whole arterial through its waypoints, dropping repeated cells. */
function through(ctx: RouteContext, waypoints: readonly Point2[], surcharge?: Uint8Array): Point2[] | null {
  const out: Point2[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const part = leg(ctx, waypoints[i - 1] as Point2, waypoints[i] as Point2, surcharge);
    if (part === null) return null;
    for (const cell of part) {
      const previous = out[out.length - 1];
      if (previous !== undefined && previous.x === cell.x && previous.z === cell.z) continue;
      out.push(cell);
    }
  }
  return out.length >= 2 ? densify4(out) : null;
}

/**
 * The spine: the long axis, bent.
 *
 * Bent on purpose. A straight line from edge to edge is the rectangle problem
 * again at city scale; two seeded interior waypoints pushed off the axis give
 * the road a reason to be where it is, and the router then hangs that reason on
 * the actual ground between them.
 */
function routeSpine(ctx: RouteContext, rng: Rng): Point2[] | null {
  const { plot } = ctx;
  const horizontal = plot.width >= plot.depth;
  const along = horizontal ? plot.width : plot.depth;
  const across = horizontal ? plot.depth : plot.width;
  const swing = Math.max(4, Math.floor(across / 7));
  const mid = horizontal ? plot.z0 + (plot.depth >> 1) : plot.x0 + (plot.width >> 1);
  const lo = (horizontal ? plot.z0 : plot.x0) + CITY_INSET;
  const hi = (horizontal ? plot.z0 + plot.depth : plot.x0 + plot.width) - 1 - CITY_INSET;

  const at = (fraction: number, offset: number): Point2 => {
    const t = (horizontal ? plot.x0 : plot.z0) + CITY_INSET +
      Math.round(fraction * (along - 1 - 2 * CITY_INSET));
    const c = clampInt(mid + offset, lo, hi);
    return open(ctx, horizontal ? { x: t, z: c } : { x: c, z: t });
  };

  const waypoints = [
    at(0, rng.int(-swing, swing)),
    at(0.34, rng.int(-swing, swing)),
    at(0.67, rng.int(-swing, swing)),
    at(1, rng.int(-swing, swing)),
  ];
  return through(ctx, waypoints);
}

/**
 * The drive: the real shoreline, at a real offset.
 *
 * Not a curve fitted to the coast — a *route* through the band of dry land a
 * fixed distance back from the water, with every cell outside that band
 * surcharged. The router then does what it always does, so the drive climbs
 * round a headland rather than through it and bridges a river mouth rather than
 * detouring to its head.
 *
 * Its two ends are the band's graph diameter, found by the standard double
 * sweep: BFS from any band cell to the furthest, then from there to the
 * furthest again. That is deterministic, linear, and picks the two ends a
 * person would.
 */
function routeDrive(ctx: RouteContext, water: Uint8Array): Point2[] | null {
  const { plot } = ctx;
  const distance = waterDistance(plot, water);
  const band = new Uint8Array(plot.cells);
  let bandSize = 0;
  for (let k = 0; k < plot.cells; k++) {
    if (water[k] === 1 || ctx.blocked[k] === 1) continue;
    const d = distance[k] as number;
    if (d < DRIVE_OFFSET - DRIVE_BAND || d > DRIVE_OFFSET + DRIVE_BAND) continue;
    const x = plot.x(k);
    const z = plot.z(k);
    if (
      x < plot.x0 + CITY_INSET ||
      x > plot.x0 + plot.width - 1 - CITY_INSET ||
      z < plot.z0 + CITY_INSET ||
      z > plot.z0 + plot.depth - 1 - CITY_INSET
    ) {
      continue;
    }
    band[k] = 1;
    bandSize++;
  }
  if (bandSize < DRIVE_MIN_BAND) return null;

  const first = band.indexOf(1);
  const a = furthest(plot, band, first);
  const b = furthest(plot, band, a);
  if (a === b) return null;

  const surcharge = new Uint8Array(plot.cells);
  for (let k = 0; k < plot.cells; k++) {
    if (band[k] === 0) surcharge[k] = 1;
    if (ctx.steep[k] === 1) surcharge[k] = 1;
  }
  // A mid-band waypoint keeps the router honest on a coast that doubles back:
  // a straight A* from one end of a C-shaped bay to the other would rather cut
  // the chord and pay the off-band surcharge than walk the whole shore.
  const mid = furthestFromBoth(plot, band, a, b);
  const waypoints = [
    { x: plot.x(a), z: plot.z(a) },
    { x: plot.x(mid), z: plot.z(mid) },
    { x: plot.x(b), z: plot.z(b) },
  ];
  return through(ctx, waypoints, surcharge);
}

/**
 * The diagonals: the single most important line in the plan.
 *
 * A diagonal crossing a grid is what produces wedge lots, triangular corners
 * and blocks that are not rectangles — the thing no amount of jitter on an
 * axis-aligned grid can ever produce. Each one runs corner to corner, inset
 * enough that its band stays on the city and its two ends are still on the
 * boundary where the inter-district road pass can find them.
 */
function routeDiagonals(ctx: RouteContext, wanted: number, rng: Rng): Point2[][] {
  if (wanted <= 0) return [];
  const { plot } = ctx;
  const inset = CITY_INSET;
  const dx = Math.round(plot.width * 0.1);
  const dz = Math.round(plot.depth * 0.1);
  const west = plot.x0 + inset;
  const east = plot.x0 + plot.width - 1 - inset;
  const north = plot.z0 + inset;
  const south = plot.z0 + plot.depth - 1 - inset;

  const nwse: [Point2, Point2] = [
    { x: west, z: north + dz },
    { x: east, z: south - dz },
  ];
  const nesw: [Point2, Point2] = [
    { x: east, z: north + dz },
    { x: west, z: south - dz },
  ];
  // Which single diagonal a one-diagonal city gets is a real choice and it is
  // seeded, not fixed: the same city on two seeds should be cut two ways.
  const order = rng.int(0, 1) === 0 ? [nwse, nesw] : [nesw, nwse];

  const out: Point2[][] = [];
  for (const pair of order.slice(0, wanted)) {
    const mid: Point2 = {
      x: Math.round(((pair[0] as Point2).x + (pair[1] as Point2).x) / 2),
      z: Math.round(((pair[0] as Point2).z + (pair[1] as Point2).z) / 2),
    };
    const path = through(ctx, [
      open(ctx, pair[0] as Point2),
      open(ctx, mid),
      open(ctx, pair[1] as Point2),
    ]);
    if (path !== null) out.push(path);
  }
  return out;
}

/** The ring: a closed loop around the middle, when there is room for one. */
function routeRing(ctx: RouteContext): Point2[] | null {
  const { plot } = ctx;
  const cx = plot.x0 + (plot.width >> 1);
  const cz = plot.z0 + (plot.depth >> 1);
  const rx = Math.round(plot.width * 0.3);
  const rz = Math.round(plot.depth * 0.3);
  const corners: Point2[] = [
    open(ctx, { x: cx + rx, z: cz - rz }),
    open(ctx, { x: cx + rx, z: cz + rz }),
    open(ctx, { x: cx - rx, z: cz + rz }),
    open(ctx, { x: cx - rx, z: cz - rz }),
  ];
  const loop = through(ctx, [...corners, corners[0] as Point2]);
  if (loop === null || loop.length < 32) return null;
  return loop;
}

/**
 * Make every arterial reach every other one.
 *
 * Crossing is the normal case — a spine edge to edge and a diagonal corner to
 * corner cannot miss each other in a convex footprint — but water and cliffs
 * bend routes, and an arterial that ended up in its own component is a
 * boulevard to nowhere. Any stranded component gets a `boulevard` routed from
 * it to the main one, which is the same repair the road pass makes between
 * villages and for the same reason.
 */
function stitch(ctx: RouteContext, arterials: readonly Arterial[]): Arterial[] {
  const { plot } = ctx;
  const out = [...arterials];
  const claim = (list: readonly Arterial[]): Uint8Array => {
    const mask = new Uint8Array(plot.cells);
    for (const a of list) {
      for (const cell of a.path) {
        const k = plot.index(cell.x, cell.z);
        if (k >= 0) mask[k] = 1;
      }
    }
    return mask;
  };

  for (let guard = 0; guard < arterials.length; guard++) {
    const mask = claim(out);
    const groups = components(plot, mask);
    if (groups.length <= 1) break;
    // Largest component is the network; the next largest joins it.
    const [main, stranded] = [groups[0] as number[], groups[1] as number[]];
    const goal = new Uint8Array(plot.cells);
    for (const k of main) goal[k] = 1;
    const from = stranded[stranded.length >> 1] as number;
    const found = routeTo(
      plot.region,
      ctx.blocked,
      goal,
      { ground: ctx.ground },
      { x: plot.x(from), z: plot.z(from) },
      {
        water: waterCrossable(ctx),
        wallHug: ctx.steep,
        bridgeEntry: ARTERIAL_BRIDGE_ENTRY,
        waterCost: ARTERIAL_WATER_COST,
      },
    );
    if (found === null) break;
    out.push(makeArterial(`link${guard}`, "boulevard", densify4(found)));
  }
  return out;
}

/** Connected components of a mask, largest first, ties on the lowest index. */
function components(plot: Plot, mask: Uint8Array): number[][] {
  const seen = new Uint8Array(plot.cells);
  const out: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < plot.cells; start++) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    const group: number[] = [];
    while (stack.length > 0) {
      const k = stack.pop() as number;
      group.push(k);
      const x = plot.x(k);
      const z = plot.z(k);
      // Eight-connected: two arterials that cross on a diagonal step touch at a
      // corner, and a corner is a junction.
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const n = plot.index(x + dx, z + dz);
          if (n < 0 || seen[n] === 1 || mask[n] !== 1) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    group.sort((a, b) => a - b);
    out.push(group);
  }
  out.sort((a, b) => (a.length !== b.length ? b.length - a.length : (a[0] as number) - (b[0] as number)));
  return out;
}

/** Where two arterial centre lines meet, in a fixed order. */
export function junctionsOf(arterials: readonly Arterial[]): Point2[] {
  const out: Point2[] = [];
  const sets = arterials.map((a) => new Set(a.path.map((c) => `${c.x},${c.z}`)));
  for (let a = 0; a < arterials.length; a++) {
    for (let b = a + 1; b < arterials.length; b++) {
      const shared: Point2[] = [];
      for (const cell of (arterials[a] as Arterial).path) {
        if ((sets[b] as Set<string>).has(`${cell.x},${cell.z}`)) shared.push(cell);
      }
      if (shared.length === 0) continue;
      out.push(shared[shared.length >> 1] as Point2);
    }
  }
  out.sort((p, q) => (p.z !== q.z ? p.z - q.z : p.x - q.x));
  return out;
}

/* -------------------------------------------------------------------------- */
/* the carriageway                                                             */
/* -------------------------------------------------------------------------- */

/** The arterial mask, plus who owns each column and which way they run. */
interface Raster {
  readonly mask: Uint8Array;
  /** Owning arterial index + 1; 0 for a column no arterial claims. */
  readonly owner: Int32Array;
  /** The owning arterial's 15°-quantised heading there, mod 90, as 0..5. */
  readonly bucket: Int8Array;
  readonly columns: number;
}

/**
 * Rasterise every arterial's carriageway band.
 *
 * Built through {@link carriagewayCells} — the same band construction streets
 * and `surfaceRoute` use — so the columns the plan calls "arterial" are exactly
 * the columns the surfacing pass will pave. Two notions of "the road" is how a
 * building ends up half in one.
 */
function rasterize(plot: Plot, arterials: readonly Arterial[]): Raster {
  const mask = new Uint8Array(plot.cells);
  const owner = new Int32Array(plot.cells);
  const bucket = new Int8Array(plot.cells).fill(-1);
  const bounds: Rect = {
    x0: plot.x0,
    z0: plot.z0,
    x1: plot.x0 + plot.width - 1,
    z1: plot.z0 + plot.depth - 1,
  };

  for (const [i, arterial] of arterials.entries()) {
    const graph: StreetGraph = {
      segments: [{ id: arterial.id, kind: "avenue", width: arterial.width, path: arterial.path }],
      intersections: [],
      sidewalk: 0,
    };
    // Heading per centre-line cell, so a column can inherit the *local* run of
    // the road rather than the arterial's average — a drive that curves round a
    // bay has no single heading and its cells must not pretend otherwise.
    const headings = arterial.path.map((_, k) => {
      const h = headingOf(arterial.path, k);
      return (Math.round(quantizeHeading(h.dx, h.dz) / 15) % 6) as number;
    });
    for (const cell of carriagewayCells(graph, bounds)) {
      const k = plot.index(cell.x, cell.z);
      if (k < 0) continue;
      mask[k] = 1;
      owner[k] = i + 1;
    }
    // Only the centre line gets a heading outright; the rest of the band takes
    // it from there, so a curving drive's band curves with it.
    for (const [k, cell] of arterial.path.entries()) {
      const idx = plot.index(cell.x, cell.z);
      if (idx < 0) continue;
      bucket[idx] = (headings[k] ?? 0) as number;
    }
  }

  // Fill the band's heading from its centre line: one BFS over the mask.
  const queue: number[] = [];
  for (let k = 0; k < plot.cells; k++) if ((bucket[k] as number) >= 0) queue.push(k);
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    const x = plot.x(k);
    const z = plot.z(k);
    for (const [dx, dz] of NEIGHBOURS) {
      const n = plot.index(x + dx, z + dz);
      if (n < 0 || mask[n] !== 1 || (bucket[n] as number) >= 0) continue;
      bucket[n] = bucket[k] as number;
      queue.push(n);
    }
  }

  let columns = 0;
  for (let k = 0; k < plot.cells; k++) if (mask[k] === 1) columns++;
  return { mask, owner, bucket, columns };
}

/* -------------------------------------------------------------------------- */
/* the partition                                                               */
/* -------------------------------------------------------------------------- */

/** One face of the armature, before it has a character. */
interface Face {
  readonly indices: readonly number[];
  readonly bounds: Rect;
  readonly mask: Uint8Array;
  readonly area: number;
}

/** Subtract the carriageways and the water; what is left is the districts. */
function facesOf(
  plot: Plot,
  arterial: Uint8Array,
  water: Uint8Array,
): { readonly kept: Face[]; readonly slivers: number; readonly sliverColumns: number } {
  const blocked = new Uint8Array(plot.cells);
  for (let k = 0; k < plot.cells; k++) {
    blocked[k] = arterial[k] === 1 || water[k] === 1 ? 1 : 0;
  }
  const free = new Uint8Array(plot.cells);
  for (let k = 0; k < plot.cells; k++) free[k] = blocked[k] === 1 ? 0 : 1;

  const kept: Face[] = [];
  let slivers = 0;
  let sliverColumns = 0;
  for (const group of components(plot, free)) {
    if (group.length < MIN_CELL_AREA) {
      slivers++;
      sliverColumns += group.length;
      continue;
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const k of group) {
      const x = plot.x(k);
      const z = plot.z(k);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    const bounds: Rect = { x0, z0, x1, z1 };
    const stride = x1 - x0 + 1;
    const mask = new Uint8Array(stride * (z1 - z0 + 1));
    for (const k of group) {
      mask[(plot.z(k) - z0) * stride + (plot.x(k) - x0)] = 1;
    }
    kept.push({ indices: group, bounds, mask, area: group.length });
  }
  // Row-major over the city, so the cell ids run north to south. `components`
  // already sorts by size; re-sort so the *published* order is spatial.
  kept.sort((a, b) =>
    a.bounds.z0 !== b.bounds.z0 ? a.bounds.z0 - b.bounds.z0 : a.bounds.x0 - b.bounds.x0,
  );
  return { kept, slivers, sliverColumns };
}

/* -------------------------------------------------------------------------- */
/* character                                                                   */
/* -------------------------------------------------------------------------- */

/** What the character rules read off one face. */
interface CellMetrics {
  readonly bounds: Rect;
  readonly area: number;
  readonly centroid: Point2;
  /** 0 at the city centre, 1 at its edge, in the sup norm. */
  readonly fromCentre: number;
  /** Share of the face's boundary columns that are near open water. */
  readonly waterShare: number;
  /** Share of the face's boundary columns that lie on the city's own edge. */
  readonly edgeShare: number;
  /** Ground range across the face, in blocks. */
  readonly relief: number;
  /** Area over bounding-box area: 1 is a rectangle, 0.4 is a wedge. */
  readonly compactness: number;
}

function measure(
  plot: Plot,
  face: Face,
  ground: Int32Array,
  water: Uint8Array,
  city: Rect,
): CellMetrics {
  let sx = 0;
  let sz = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let boundary = 0;
  let nearWater = 0;
  let onEdge = 0;
  const inFace = new Set(face.indices);

  for (const k of face.indices) {
    const x = plot.x(k);
    const z = plot.z(k);
    sx += x;
    sz += z;
    const h = ground[k] as number;
    if (h < lo) lo = h;
    if (h > hi) hi = h;
    let edge = false;
    for (const [dx, dz] of NEIGHBOURS) {
      const n = plot.index(x + dx, z + dz);
      if (n < 0 || !inFace.has(n)) {
        edge = true;
        break;
      }
    }
    if (!edge) continue;
    boundary++;
    if (x <= city.x0 + 1 || x >= city.x1 - 1 || z <= city.z0 + 1 || z >= city.z1 - 1) onEdge++;
    if (nearWaterAt(plot, water, x, z)) nearWater++;
  }

  const n = face.indices.length;
  const bw = face.bounds.x1 - face.bounds.x0 + 1;
  const bd = face.bounds.z1 - face.bounds.z0 + 1;
  const halfW = Math.max(1, (city.x1 - city.x0) / 2);
  const halfD = Math.max(1, (city.z1 - city.z0) / 2);
  const cx = Math.round(sx / n);
  const cz = Math.round(sz / n);
  return {
    bounds: face.bounds,
    area: n,
    centroid: { x: cx, z: cz },
    fromCentre: Math.max(
      Math.abs(cx - (city.x0 + city.x1) / 2) / halfW,
      Math.abs(cz - (city.z0 + city.z1) / 2) / halfD,
    ),
    waterShare: boundary === 0 ? 0 : nearWater / boundary,
    edgeShare: boundary === 0 ? 0 : onEdge / boundary,
    relief: hi - lo,
    compactness: n / (bw * bd),
  };
}

/** True when open water is within {@link WATERFRONT_REACH} of a column. */
function nearWaterAt(plot: Plot, water: Uint8Array, x: number, z: number): boolean {
  for (let dz = -WATERFRONT_REACH; dz <= WATERFRONT_REACH; dz++) {
    for (let dx = -WATERFRONT_REACH; dx <= WATERFRONT_REACH; dx++) {
      const k = plot.index(x + dx, z + dz);
      if (k >= 0 && water[k] === 1) return true;
    }
  }
  return false;
}

/**
 * Give every face a character — **from where it is**, never from a draw.
 *
 * This is the part that makes a city read as authored rather than generated. A
 * quarter is different from the one next to it *because of something*: it is on
 * the water, or it is the middle, or it is the awkward steep triangle the
 * diagonal left behind, or it is out on the edge by the port. Randomising the
 * characters would put a park in the middle of downtown and an industrial
 * estate on the promenade, which is exactly the flavour of wrongness that reads
 * as procedural.
 *
 * The rules run in a fixed priority and each one takes from what is left, so
 * the result is a function of the geometry alone.
 */
function assign(metrics: readonly CellMetrics[], size: string): DistrictCharacter[] {
  const out = new Array<DistrictCharacter | null>(metrics.length).fill(null);
  const order = metrics
    .map((m, i) => ({ m, i }))
    .sort((a, b) =>
      a.m.area !== b.m.area ? b.m.area - a.m.area : a.m.bounds.z0 - b.m.bounds.z0,
    );

  // 1. Parks: the ground decided this one. A cell the terrain made steep, or a
  //    wedge the diagonal left that nothing rectangular fits into.
  for (const { m, i } of order) {
    if (m.relief >= PARK_RELIEF || (m.compactness < PARK_COMPACTNESS && m.area < LANES_AREA * 3)) {
      out[i] = "park";
    }
  }

  // 2. The core: the biggest cell near the middle.
  const core = order.find(({ m, i }) => out[i] === null && m.fromCentre <= CORE_RADIUS);
  const fallbackCore = order.find(({ i }) => out[i] === null);
  const chosenCore = core ?? fallbackCore;
  if (chosenCore !== undefined) out[chosenCore.i] = "core";

  // 3. Industry: out at the edge, away from the middle, by the water if it can
  //    be — a port quarter — and on the plainest edge otherwise.
  const industrialWanted = size === "large" ? 2 : 1;
  let industrial = 0;
  for (const pass of [true, false]) {
    for (const { m, i } of order) {
      if (industrial >= industrialWanted) break;
      if (out[i] !== null) continue;
      if (m.edgeShare < 0.22 || m.fromCentre < 0.42) continue;
      if (pass && m.waterShare < WATERFRONT_SHARE) continue;
      out[i] = "industrial";
      industrial++;
    }
  }

  // 4. The waterfront: everything else the water touches.
  for (const { m, i } of order) {
    if (out[i] === null && m.waterShare >= WATERFRONT_SHARE) out[i] = "waterfront";
  }

  // 5. Civic: the largest cell still unspoken for, once the city is big enough
  //    to have a quarter to spare for one.
  if (metrics.length >= 5) {
    const civic = order.find(({ i }) => out[i] === null);
    if (civic !== undefined) out[civic.i] = "civic";
  }

  // 6. Lanes for the small and the crooked; grid near the middle; rowhouses out.
  for (const { m, i } of order) {
    if (out[i] !== null) continue;
    if (m.area < LANES_AREA || m.compactness < 0.66) {
      out[i] = "lanes";
      continue;
    }
    out[i] = m.fromCentre < 0.58 ? "grid" : "rowhouse";
  }

  return out.map((c) => c ?? "grid");
}

/* -------------------------------------------------------------------------- */
/* orientation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The heading of the arterial that dominates a cell's longest frontage.
 *
 * This is what makes two neighbouring quarters meet at an angle rather than
 * continuing one global grid, and it is the *consequence* half of the design:
 * the fabric of a cell turns because the boulevard beside it turns, so the seam
 * between them has a visible cause.
 *
 * Quantised mod 90 because a square grid is symmetric under a quarter turn —
 * "45°" and "135°" are the same fabric — and taken as the modal bucket rather
 * than a mean, because averaging 5° and 85° gives 45°, which is neither.
 */
function orientationOf(plot: Plot, face: Face, raster: Raster): number {
  const inFace = new Set(face.indices);
  const tally = new Map<number, number[]>();
  for (const k of face.indices) {
    const x = plot.x(k);
    const z = plot.z(k);
    let edge = false;
    for (const [dx, dz] of NEIGHBOURS) {
      const n = plot.index(x + dx, z + dz);
      if (n < 0 || !inFace.has(n)) {
        edge = true;
        break;
      }
    }
    if (!edge) continue;
    for (const [dx, dz] of NEIGHBOURS) {
      let found = -1;
      for (let step = 1; step <= ORIENT_PROBE; step++) {
        const n = plot.index(x + dx * step, z + dz * step);
        if (n < 0) break;
        if (inFace.has(n)) break;
        if (raster.mask[n] === 1) {
          found = n;
          break;
        }
      }
      if (found < 0) continue;
      const id = raster.owner[found] as number;
      let buckets = tally.get(id);
      if (buckets === undefined) {
        buckets = [0, 0, 0, 0, 0, 0];
        tally.set(id, buckets);
      }
      const b = raster.bucket[found] as number;
      if (b >= 0) buckets[b] = (buckets[b] as number) + 1;
    }
  }

  // Fixed iteration: by arterial id, never by insertion order.
  let bestId = -1;
  let bestCount = 0;
  for (const id of [...tally.keys()].sort((a, b) => a - b)) {
    const total = (tally.get(id) as number[]).reduce((s, v) => s + v, 0);
    if (total > bestCount) {
      bestCount = total;
      bestId = id;
    }
  }
  if (bestId < 0) return 0;
  const buckets = tally.get(bestId) as number[];
  let best = 0;
  for (let b = 1; b < buckets.length; b++) {
    if ((buckets[b] as number) > (buckets[best] as number)) best = b;
  }
  // A cell whose frontage is on a due north–south or due east–west arterial
  // keeps the world axes, which is what stops a flat city being uniformly
  // skewed by one bucket of rounding noise.
  return best * 15;
}

/* -------------------------------------------------------------------------- */
/* fields                                                                      */
/* -------------------------------------------------------------------------- */

/** The composed heightfield, rounded, over the city's own grid. */
function groundOf(plot: Plot, field: HeightField): Int32Array {
  const out = new Int32Array(plot.cells);
  const region = field.region;
  for (let j = 0; j < plot.depth; j++) {
    const z = plot.z0 + j;
    for (let i = 0; i < plot.width; i++) {
      const x = plot.x0 + i;
      const fi = x - region.x0;
      const fj = z - region.z0;
      out[j * plot.width + i] =
        fi < 0 || fj < 0 || fi >= region.width || fj >= region.depth
          ? 0
          : Math.round(field.values[fj * region.width + fi] as number);
    }
  }
  return out;
}

/** The water mask, over the city's own grid. */
function waterOf(plot: Plot, region: Region, water: Uint8Array | undefined): Uint8Array {
  const out = new Uint8Array(plot.cells);
  if (water === undefined) return out;
  for (let j = 0; j < plot.depth; j++) {
    const z = plot.z0 + j;
    for (let i = 0; i < plot.width; i++) {
      const x = plot.x0 + i;
      const fi = x - region.x0;
      const fj = z - region.z0;
      if (fi < 0 || fj < 0 || fi >= region.width || fj >= region.depth) continue;
      if (water[fj * region.width + fi] === 1) out[j * plot.width + i] = 1;
    }
  }
  return out;
}

/** Columns where the ground climbs faster than a boulevard should. */
function steepOf(plot: Plot, ground: Int32Array): Uint8Array {
  const out = new Uint8Array(plot.cells);
  for (let j = 0; j < plot.depth; j++) {
    for (let i = 0; i < plot.width; i++) {
      const k = j * plot.width + i;
      const here = ground[k] as number;
      let worst = 0;
      for (const [dx, dz] of NEIGHBOURS) {
        const n = plot.index(plot.x0 + i + dx, plot.z0 + j + dz);
        if (n < 0) continue;
        const d = Math.abs((ground[n] as number) - here);
        if (d > worst) worst = d;
      }
      if (worst >= ARTERIAL_STEEP) out[k] = 1;
    }
  }
  return out;
}

/** Chebyshev distance to the nearest water column, by multi-source BFS. */
function waterDistance(plot: Plot, water: Uint8Array): Int32Array {
  const out = new Int32Array(plot.cells).fill(1 << 24);
  const queue: number[] = [];
  for (let k = 0; k < plot.cells; k++) {
    if (water[k] === 1) {
      out[k] = 0;
      queue.push(k);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    const x = plot.x(k);
    const z = plot.z(k);
    const next = (out[k] as number) + 1;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = plot.index(x + dx, z + dz);
        if (n < 0 || (out[n] as number) <= next) continue;
        out[n] = next;
        queue.push(n);
      }
    }
  }
  return out;
}

/** The band cell furthest (within the band) from `from` — one BFS. */
function furthest(plot: Plot, band: Uint8Array, from: number): number {
  const dist = new Int32Array(plot.cells).fill(-1);
  dist[from] = 0;
  const queue = [from];
  let best = from;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    if ((dist[k] as number) > (dist[best] as number)) best = k;
    const x = plot.x(k);
    const z = plot.z(k);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = plot.index(x + dx, z + dz);
        if (n < 0 || band[n] !== 1 || (dist[n] as number) >= 0) continue;
        dist[n] = (dist[k] as number) + 1;
        queue.push(n);
      }
    }
  }
  return best;
}

/** The band cell whose smaller distance to the two ends is largest. */
function furthestFromBoth(plot: Plot, band: Uint8Array, a: number, b: number): number {
  const da = bandDistance(plot, band, a);
  const db = bandDistance(plot, band, b);
  let best = a;
  let bestScore = -1;
  for (let k = 0; k < plot.cells; k++) {
    if (band[k] !== 1) continue;
    const x = da[k] as number;
    const y = db[k] as number;
    if (x < 0 || y < 0) continue;
    const score = Math.min(x, y);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

function bandDistance(plot: Plot, band: Uint8Array, from: number): Int32Array {
  const dist = new Int32Array(plot.cells).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    const x = plot.x(k);
    const z = plot.z(k);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = plot.index(x + dx, z + dz);
        if (n < 0 || band[n] !== 1 || (dist[n] as number) >= 0) continue;
        dist[n] = (dist[k] as number) + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/**
 * The nearest column a route may start or end on, searched in a fixed spiral.
 *
 * A waypoint dropped by arithmetic can easily land in the bay or on a cliff
 * face; nudging it to the closest legal column is what keeps a plan from losing
 * its whole spine to one unlucky corner.
 */
function open(ctx: RouteContext, at: Point2): Point2 {
  const { plot } = ctx;
  const start = plot.index(at.x, at.z);
  if (start >= 0 && ctx.blocked[start] === 0 && ctx.water[start] === 0) return at;
  for (let radius = 1; radius <= 48; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const k = plot.index(at.x + dx, at.z + dz);
        if (k < 0 || ctx.blocked[k] === 1 || ctx.water[k] === 1) continue;
        return { x: at.x + dx, z: at.z + dz };
      }
    }
  }
  return at;
}
