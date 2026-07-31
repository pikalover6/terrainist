/**
 * The district fabric pass — fabric v2, F1.
 *
 * A `district` is the one node in the profile whose interior the layout solver
 * never sees. The solver places the district itself, exactly as it places a
 * plaza: one footprint, chosen against `zone`/`at`/`distance` and the ground.
 * From there this pass takes over, and it works in the opposite direction to
 * everything else in the compiler:
 *
 * 1. **streets** — {@link buildStreetGraph} draws the skeleton across the
 *    footprint (`streets.ts`, and the graph is the F4 contract);
 * 2. **blocks** — the faces of that skeleton, i.e. the connected components of
 *    the ground the carriageway and its sidewalks did not take;
 * 3. **lots** — each block's street-facing perimeter, subdivided into frontages
 *    at a depth the density chooses, with the corners assigned to one side;
 * 4. **landmarks** — the district's own children, largest first, each claiming
 *    the run of lots that wastes the least ground;
 * 5. **infill** — every remaining lot, filled from `mix` until the coverage
 *    matches the density.
 *
 * Every building this pass produces is an ordinary {@link Placement} with an
 * ordinary `building.grammar@0` node behind it, so it flows through the
 * buildings pass, the doorsteps, the occupancy grid, the canopy clip and the
 * physics lint with nothing special done for it. The *only* thing the fabric
 * does differently is decide where and which way round — and that decision is
 * frontage, not cost.
 *
 * Determinism: the skeleton is seeded from `nodeSeed(worldSeed, districtPath)`;
 * every per-lot decision (which archetype, whether it is built at all, how many
 * floors) is a **positional** draw keyed on the lot's own street-facing corner,
 * so it does not depend on iteration order, on how many lots came before, or on
 * anything the author later adds elsewhere in the document.
 */

import {
  HIGHRISE_MAX_WIDTH,
  HIGHRISE_MIN_WIDTH,
  isHighriseArchetype,
  nodeSeed,
  positionFloat,
  positionInt,
  streamSeed,
  type HeightField,
  type Seed256,
} from "@terrainist/stdlib";
import {
  error,
  warning,
  isDistrictNode,
  type DistrictDensity,
  type DistrictNode,
  type DistrictParams,
  type HorizontalFace,
  type LoamDiagnostic,
  type PortDeclaration,
  type SettlementDocument,
  type StructureNode,
  type Yaw,
} from "@terrainist/spec";

import type { Rect } from "./frames.js";
import { frontFace, resolvePorts, rotatedSize } from "./ports.js";
import {
  BLOCK_SIZE_BY_DENSITY,
  SIDEWALK_BY_DENSITY,
  buildStreetGraph,
  carriagewayCells,
  type StreetGraph,
} from "./streets.js";
import type { LayoutNodeInput, PadEdit, Placement, ResolvedPort } from "./types.js";

/* -------------------------------------------------------------------------- */
/* the knobs the density turns                                                 */
/* -------------------------------------------------------------------------- */

/** Lot depth back from the build-to line, in blocks. */
export const LOT_DEPTH: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 17,
  medium: 16,
  low: 15,
});

/** Target frontage per lot, in blocks. Downtown parcels are narrow. */
export const LOT_FRONTAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 13,
  medium: 15,
  low: 19,
});

/** Share of unclaimed lots the infill actually builds on. */
export const LOT_COVERAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 0.94,
  medium: 0.62,
  low: 0.32,
});

/** Blocks of daylight left between an infill building and its lot's edges. */
export const LOT_SIDE_GAP: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});

/** Storeys the infill builds, per density. */
export const INFILL_FLOORS: Readonly<Record<DistrictDensity, readonly [number, number]>> =
  Object.freeze({
    high: [3, 8] as const,
    medium: [2, 4] as const,
    low: [1, 2] as const,
  });

/** Blocks per storey, matching the profile's default. */
export const FLOOR_HEIGHT = 4;

/** Smallest footprint axis this pass will hand the grammar. */
export const MIN_INFILL_SIDE = 7;

/** Deepest a building goes back from its build-to line. */
export const MAX_INFILL_DEPTH = 16;

/** Longest run of lots one landmark may merge. */
export const MAX_LANDMARK_RUN = 4;

/** How far past the sidewalk a block looks for the street it fronts. */
export const STREET_PROBE_SLACK = 10;

/* -------------------------------------------------------------------------- */
/* products                                                                    */
/* -------------------------------------------------------------------------- */

/** What one district's fabric came to. */
export interface DistrictStats {
  readonly blocks: number;
  readonly lots: number;
  readonly landmarks: number;
  /** Landmarks that found no lot run big enough. */
  readonly landmarksUnplaced: number;
  readonly infill: number;
  /**
   * Parcels the pass could not build on: off the envelope, cut through by an
   * organic street, or narrower than {@link MIN_INFILL_SIDE} after the side gap.
   *
   * A lot the *density* left open is not counted here — that is a decision, and
   * `lots - infill` already says how many. Dropped silently as far as the author
   * is concerned (a lot is an internal subdivision, and there is nothing in the
   * document to fix) but counted, because a district that drops most of its
   * parcels is a district whose `blockSize` is fighting its `density`.
   */
  readonly lotsDropped: number;
  /** Lots inside the reserved central block, when `params.plaza` is set. */
  readonly plazaLots: number;
  readonly carriagewayColumns: number;
  readonly sidewalkColumns: number;
}

/** One district's fabric, as the compile report carries it. */
export interface DistrictProduct {
  readonly nodePath: string;
  /** The footprint the solver placed — the fabric's whole world. */
  readonly bounds: Rect;
  /** The pinned F4 / road-pass contract. */
  readonly streets: StreetGraph;
  /** 1 for a carriageway column, row-major over {@link DistrictProduct.bounds}. */
  readonly carriageway: Uint8Array;
  /** 1 for a sidewalk column, row-major over {@link DistrictProduct.bounds}. */
  readonly sidewalk: Uint8Array;
  readonly stats: DistrictStats;
}

/** What the fabric pass hands back to the compiler. */
export interface DistrictPassResult {
  /** Synthetic solver nodes, one per building the fabric produced. */
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  /** `building.grammar@0` params per node path, for the structure pass. */
  readonly params: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly districts: readonly DistrictProduct[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Everything {@link solveDistricts} reads. */
export interface DistrictPassInput {
  readonly doc: SettlementDocument;
  readonly worldSeed: bigint;
  /**
   * The **levelled** master field.
   *
   * A district's own pad edit has already been composed by the time this runs,
   * which is the whole reason the pass is cheap: the ground inside a district
   * is flat, so a foundation elevation is one number and street grading is a
   * formality. Running before the pads would put every building on the terrain
   * the district was about to erase.
   */
  readonly field: HeightField;
  /** The solver's placements, in document order. */
  readonly placements: readonly Placement[];
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** Lay the fabric of every district in the document. */
export function solveDistricts(input: DistrictPassInput): DistrictPassResult {
  const rootPath = input.doc.root.id;
  const byPath = new Map(input.placements.map((p) => [p.nodePath, p] as const));

  const nodes: LayoutNodeInput[] = [];
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  const params = new Map<string, Readonly<Record<string, unknown>>>();
  const districts: DistrictProduct[] = [];
  const diagnostics: LoamDiagnostic[] = [];

  for (const child of input.doc.root.children) {
    if (!isDistrictNode(child)) continue;
    const nodePath = `${rootPath}.${child.id}`;
    const placement = byPath.get(nodePath);
    if (placement === undefined) continue; // dropped by the solver; already reported.
    const laid = layDistrict(child, nodePath, placement, input, diagnostics);
    if (laid === null) continue;
    nodes.push(...laid.nodes);
    placements.push(...laid.placements);
    ports.push(...laid.ports);
    padEdits.push(...laid.padEdits);
    for (const [path, p] of laid.params) params.set(path, p);
    districts.push(laid.product);
  }

  return { nodes, placements, ports, padEdits, params, districts, diagnostics };
}

/** One district's fabric. */
interface LaidDistrict {
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  readonly params: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly product: DistrictProduct;
}

function layDistrict(
  node: DistrictNode,
  nodePath: string,
  placement: Placement,
  input: DistrictPassInput,
  diagnostics: LoamDiagnostic[],
): LaidDistrict | null {
  const p = node.params;
  const density = p.density;
  const bounds = placement.footprint;
  const seed = nodeSeed(input.worldSeed, nodePath, node.seedSalt ?? "");
  const sidewalkWidth = SIDEWALK_BY_DENSITY[density] ?? 1;

  const skeleton = buildStreetGraph({
    bounds,
    fabric: p.fabric,
    seed,
    blockSize: p.blockSize ?? (BLOCK_SIZE_BY_DENSITY[density] as number),
    sidewalk: sidewalkWidth,
  });
  if (!skeleton.ok) {
    diagnostics.push(error("DISTRICT_TOO_SMALL", nodePath, skeleton.reason, skeleton.fix));
    return null;
  }
  const graph = skeleton.graph;

  // --- the void ------------------------------------------------------------
  const grid = new Grid(bounds);
  const carriageway = new Uint8Array(grid.cells);
  for (const cell of carriagewayCells(graph, bounds)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) carriageway[k] = 1;
  }
  const sidewalk = dilate(grid, carriageway, sidewalkWidth);

  // --- blocks --------------------------------------------------------------
  const blocked = new Uint8Array(grid.cells);
  for (let k = 0; k < grid.cells; k++) blocked[k] = carriageway[k] === 1 || sidewalk[k] === 1 ? 1 : 0;
  const blocks = blocksOf(grid, blocked);

  // --- the reserved square -------------------------------------------------
  // `plaza: true` keeps one block open. The block nearest the district's centre
  // is chosen because that is what a square *is*; ties break on the block's own
  // ordering, which is row-major over the footprint.
  let plazaBlock = -1;
  if (p.plaza === true && blocks.length > 0) {
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cz = (bounds.z0 + bounds.z1) / 2;
    let best = Number.POSITIVE_INFINITY;
    for (const [i, block] of blocks.entries()) {
      const dx = (block.rect.x0 + block.rect.x1) / 2 - cx;
      const dz = (block.rect.z0 + block.rect.z1) / 2 - cz;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        plazaBlock = i;
      }
    }
  }

  // --- lots ----------------------------------------------------------------
  const owner = segmentOwners(grid, graph);
  const lots: Lot[] = [];
  const blockSites: BlockSite[] = [];
  let dropped = 0;
  let plazaLots = 0;
  for (const [i, block] of blocks.entries()) {
    const cut = subdivide(block, i, density, grid, blocked, owner, sidewalkWidth);
    dropped += cut.dropped;
    if (i === plazaBlock) {
      plazaLots += cut.lots.length;
      continue;
    }
    lots.push(...cut.lots);
    if (cut.front !== null && cut.lots.length > 0) blockSites.push(cut.front);
  }
  lots.sort((a, b) => (a.rect.z0 !== b.rect.z0 ? a.rect.z0 - b.rect.z0 : a.rect.x0 - b.rect.x0));

  // --- landmarks, then infill ----------------------------------------------
  const claimed = new Set<string>();
  const built: BuiltLot[] = [];
  const landmarks = landmarksOf(node, nodePath, input.worldSeed, diagnostics);
  let unplaced = 0;
  for (const landmark of landmarks) {
    const site = claimSite(lots, blockSites, claimed, landmark);
    if (site === null) {
      unplaced++;
      diagnostics.push(
        warning(
          "CANNOT_FIT",
          landmark.nodePath,
          `no lot or block in "${nodePath}" is big enough for this landmark's ${landmark.size[0]} × ${landmark.size[2]} footprint`,
          `shrink "envelope.size", raise the district's "params.blockSize" so its blocks are bigger, or move this building out of the district and let the solver place it`,
        ),
      );
      continue;
    }
    for (const lot of site.lots) claimed.add(lot.id);
    built.push({
      nodePath: landmark.nodePath,
      id: landmark.id,
      rect: site.rect,
      face: site.face,
      size: landmark.size,
      ports: landmark.ports,
      params: landmark.params,
      tags: landmark.tags,
      seed: landmark.seed,
      frontPort: undefined,
    });
  }

  const infillStream = streamSeed(seed, "repeat");
  let infilled = 0;
  for (const lot of lots) {
    if (claimed.has(lot.id)) continue;
    // The coverage draw comes first and is *not* a drop: a lot the density left
    // open is open ground, which is a decision, not a failure to build.
    if (positionFloat(infillStream, lot.rect.x0, 0, lot.rect.z0) >= (LOT_COVERAGE[p.density] as number)) {
      continue;
    }
    const filled = infillLot(lot, p, infillStream);
    if (filled === null) {
      dropped++;
      continue;
    }
    infilled++;
    built.push({
      nodePath: `${nodePath}.${filled.id}`,
      id: filled.id,
      rect: filled.rect,
      face: lot.face,
      size: filled.size,
      ports: INFILL_PORTS,
      params: filled.params,
      tags: filled.tags,
      seed: nodeSeed(input.worldSeed, `${nodePath}.${filled.id}`, ""),
      frontPort: undefined,
    });
  }

  // --- turn every claimed lot into a placement ------------------------------
  const nodes: LayoutNodeInput[] = [];
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  const params = new Map<string, Readonly<Record<string, unknown>>>();

  for (const item of built) {
    const yaw = yawFacing(frontFace(item.ports, item.frontPort), item.face);
    const [rw, rh, rd] = rotatedSize(item.size, yaw);
    const rect = seat(item.rect, item.face, rw, rd);
    const foundationY = medianGround(input.field, rect);
    const made: Placement = {
      nodePath: item.nodePath,
      id: item.id,
      translation: [rect.x0, foundationY, rect.z0],
      yaw,
      mirror: false,
      size: [rw, rh, rd],
      footprint: rect,
      anchor: { x: rect.x0 + ((rw - 1) >> 1), z: rect.z0 + ((rd - 1) >> 1) },
      foundationY,
    };
    const solverNode: LayoutNodeInput = {
      id: item.id,
      nodePath: item.nodePath,
      kind: "generator",
      generator: "building.grammar@0",
      size: item.size,
      flexible: false,
      padding: 0,
      rotations: [yaw],
      constraints: [],
      ports: item.ports,
      optional: false,
      tags: item.tags,
      seed: item.seed,
    };
    nodes.push(solverNode);
    placements.push(made);
    ports.push(...resolvePorts(made, item.size, item.ports));
    // A pad on already-levelled ground is a no-op; it is emitted anyway so a
    // district whose apron did not quite reach still meets its own ground.
    padEdits.push({ nodePath: item.nodePath, footprint: rect, targetY: foundationY, apron: 2 });
    params.set(item.nodePath, item.params);
  }

  let carriagewayColumns = 0;
  let sidewalkColumns = 0;
  for (let k = 0; k < grid.cells; k++) {
    if (carriageway[k] === 1) carriagewayColumns++;
    if (sidewalk[k] === 1) sidewalkColumns++;
  }

  return {
    nodes,
    placements,
    ports,
    padEdits,
    params,
    product: {
      nodePath,
      bounds,
      streets: graph,
      carriageway,
      sidewalk,
      stats: {
        blocks: blocks.length,
        lots: lots.length,
        landmarks: landmarks.length - unplaced,
        landmarksUnplaced: unplaced,
        infill: infilled,
        lotsDropped: dropped,
        plazaLots,
        carriagewayColumns,
        sidewalkColumns,
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the grid                                                                    */
/* -------------------------------------------------------------------------- */

/** Row-major addressing over a district footprint. */
class Grid {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
  readonly cells: number;

  constructor(bounds: Rect) {
    this.x0 = bounds.x0;
    this.z0 = bounds.z0;
    this.width = bounds.x1 - bounds.x0 + 1;
    this.depth = bounds.z1 - bounds.z0 + 1;
    this.cells = this.width * this.depth;
  }

  /** Cell index, or `-1` outside the footprint. */
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

/** The `rings`-deep band around a mask, excluding the mask itself. */
function dilate(grid: Grid, mask: Uint8Array, rings: number): Uint8Array {
  const out = new Uint8Array(grid.cells);
  let frontier = mask;
  const claimed = new Uint8Array(mask);
  for (let ring = 0; ring < rings; ring++) {
    const next = new Uint8Array(grid.cells);
    for (let j = 0; j < grid.depth; j++) {
      for (let i = 0; i < grid.width; i++) {
        const k = j * grid.width + i;
        if (frontier[k] !== 1) continue;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= grid.width || jj >= grid.depth) continue;
            const n = jj * grid.width + ii;
            if (claimed[n] === 1) continue;
            claimed[n] = 1;
            next[n] = 1;
            out[n] = 1;
          }
        }
      }
    }
    frontier = next;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* blocks                                                                      */
/* -------------------------------------------------------------------------- */

/** One face of the street graph: the ground between the streets. */
interface Block {
  readonly rect: Rect;
  readonly columns: number;
}

/** Connected components of the unclaimed ground, in row-major discovery order. */
function blocksOf(grid: Grid, blocked: Uint8Array): Block[] {
  const seen = new Uint8Array(grid.cells);
  const out: Block[] = [];
  const stack: number[] = [];

  for (let start = 0; start < grid.cells; start++) {
    if (blocked[start] === 1 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
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
        stack.push(n);
      }
    }
    const rect = largestFreeRect(grid, blocked, { x0, z0, x1, z1 });
    if (rect === null) continue;
    out.push({ rect, columns });
  }
  return out;
}

/**
 * The largest free axis-aligned rectangle inside a block's bounding box.
 *
 * A grid block *is* its bounding box, and this returns exactly that. An organic
 * block is not — its streets curve, so the bounding box clips a sidewalk at
 * every bow — and the choice is between subdividing a rectangle that is partly
 * road (then dropping most of the lots it cuts) and subdividing the biggest
 * rectangle that is entirely block. This takes the second, which is why an
 * organic district has ragged margins of unbuilt ground: that ground is F2's
 * treatment, not a failure.
 *
 * The standard maximal-rectangle-under-a-histogram sweep — O(area), with every
 * tie broken by the earlier row and the earlier column, so it is stable.
 */
function largestFreeRect(grid: Grid, blocked: Uint8Array, bounds: Rect): Rect | null {
  const width = bounds.x1 - bounds.x0 + 1;
  const heights = new Int32Array(width);
  let best: Rect | null = null;
  let bestArea = 0;

  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let i = 0; i < width; i++) {
      const k = grid.index(bounds.x0 + i, z);
      heights[i] = k < 0 || blocked[k] === 1 ? 0 : (heights[i] as number) + 1;
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

/* -------------------------------------------------------------------------- */
/* lots                                                                        */
/* -------------------------------------------------------------------------- */

/** One parcel, fronting one street. */
interface Lot {
  readonly id: string;
  readonly rect: Rect;
  /** The direction from the lot towards its street — where its door points. */
  readonly face: HorizontalFace;
  /** The segment id it fronts; `""` when it fronts the district boundary. */
  readonly street: string;
  readonly block: number;
  /** Frontage index within the strip, for run detection. */
  readonly order: number;
  readonly corner: boolean;
}

/** The four sides of a block, in the fixed order the subdivision walks them. */
const SIDES: readonly HorizontalFace[] = Object.freeze(["north", "south", "west", "east"] as const);

/**
 * Which segment claims the ground just outside one side of a block.
 *
 * A block side with no street behind it is the district boundary, and a lot may
 * not front it: a door onto the outside of the district is a door onto whatever
 * the next pass happens to put there.
 */
function segmentOwners(grid: Grid, graph: StreetGraph): (string | undefined)[] {
  const out = new Array<string | undefined>(grid.cells);
  // No bounds argument: `grid.index` already refuses anything off the district,
  // and this map is only ever read through it.
  for (const cell of carriagewayCells(graph)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) out[k] = cell.segment;
  }
  return out;
}

/** What one block's subdivision produced. */
interface Subdivision {
  readonly lots: readonly Lot[];
  readonly dropped: number;
  /** The block's own frontage, for a landmark that wants the whole block. */
  readonly front: BlockSite | null;
}

/** A whole block, offered to a landmark no run of lots can hold. */
interface BlockSite {
  readonly block: number;
  readonly rect: Rect;
  readonly face: HorizontalFace;
  readonly street: string;
}

/**
 * Cut a block's street-facing perimeter into lots.
 *
 * The scheme is the classic one and its corners are settled by fiat: the north
 * and south strips run the block's full width and own the four corner parcels;
 * the east and west strips take what is left in the middle. Anything inside all
 * four strips is a courtyard, which this pass leaves alone — a block's core is
 * F2's ground treatment, not a building site.
 *
 * A block too thin to hold two opposite strips gets a single row of lots
 * spanning its whole depth, facing the first of its sides (in the fixed order
 * north, south, west, east) that has a street behind it. That is the case that
 * keeps a narrow block between two avenues from dissolving into nothing.
 *
 * Lot depth is the density's preference narrowed to half the block's shorter
 * axis, so the two opposite strips can never meet: `2 · depth ≤ shortest − 2`
 * by construction, which is why no two lots of a block overlap and why the core
 * always has at least two columns in it.
 */
function subdivide(
  block: Block,
  index: number,
  density: DistrictDensity,
  grid: Grid,
  blockedMask: Uint8Array,
  owner: (string | undefined)[],
  sidewalkWidth: number,
): Subdivision {
  const frontage = LOT_FRONTAGE[density];
  const { rect } = block;
  const width = rect.x1 - rect.x0 + 1;
  const span = rect.z1 - rect.z0 + 1;
  // Lot depth is the density's *preference*, narrowed to what the block can
  // actually give two opposite rows of. A fixed depth is what turns a 28-block
  // block into one building the size of the block — which is the failure this
  // whole pass exists to avoid, one scale down.
  const shortest = Math.min(width, span);
  const perimeter = shortest >= 2 * MIN_INFILL_SIDE + 2;
  const depth = perimeter
    ? Math.min(LOT_DEPTH[density], Math.floor((shortest - 2) / 2))
    : shortest;

  const fronts = new Map<HorizontalFace, string>();
  for (const side of SIDES) {
    const street = streetBehind(rect, side, grid, owner, sidewalkWidth);
    if (street !== undefined) fronts.set(side, street);
  }
  if (fronts.size === 0) return { lots: [], dropped: 0, front: null };
  const primary = bestSide(fronts);
  const front: BlockSite = {
    block: index,
    rect,
    face: primary,
    street: fronts.get(primary) as string,
  };

  const lots: Lot[] = [];
  let dropped = 0;
  const emit = (
    strip: Rect,
    side: HorizontalFace,
    street: string,
    cornerFirst: boolean,
    cornerLast: boolean,
  ): void => {
    const along = side === "north" || side === "south";
    const length = along ? strip.x1 - strip.x0 + 1 : strip.z1 - strip.z0 + 1;
    if (length < MIN_INFILL_SIDE) {
      dropped++;
      return;
    }
    const count = Math.max(1, Math.round(length / frontage));
    const base = Math.floor(length / count);
    const extra = length - base * count;
    let cursor = along ? strip.x0 : strip.z0;
    for (let k = 0; k < count; k++) {
      const size = base + (k < extra ? 1 : 0);
      const lot: Rect = along
        ? { x0: cursor, z0: strip.z0, x1: cursor + size - 1, z1: strip.z1 }
        : { x0: strip.x0, z0: cursor, x1: strip.x1, z1: cursor + size - 1 };
      cursor += size;
      if (!isFree(grid, blockedMask, lot)) {
        dropped++;
        continue;
      }
      lots.push({
        id: `b${index}${side[0]}${k}`,
        rect: lot,
        face: side,
        street,
        block: index,
        order: k,
        corner: (k === 0 && cornerFirst) || (k === count - 1 && cornerLast),
      });
    }
  };

  if (!perimeter) {
    // Too shallow for two rows: one row of lots spanning the whole block,
    // facing whichever side has a street, in the fixed side order.
    emit(rect, primary, front.street, true, true);
    return { lots, dropped, front };
  }

  const north = fronts.get("north");
  const south = fronts.get("south");
  const west = fronts.get("west");
  const east = fronts.get("east");

  if (north !== undefined) {
    emit({ ...rect, z1: rect.z0 + depth - 1 }, "north", north, west !== undefined, east !== undefined);
  }
  if (south !== undefined) {
    emit({ ...rect, z0: rect.z1 - depth + 1 }, "south", south, west !== undefined, east !== undefined);
  }
  const innerZ0 = north === undefined ? rect.z0 : rect.z0 + depth;
  const innerZ1 = south === undefined ? rect.z1 : rect.z1 - depth;
  // A side strip shallower than a building is a courtyard, not a lost lot: the
  // two long sides took the frontage and what is left is the block's core.
  if (innerZ1 - innerZ0 + 1 >= MIN_INFILL_SIDE) {
    if (west !== undefined) {
      emit({ x0: rect.x0, z0: innerZ0, x1: rect.x0 + depth - 1, z1: innerZ1 }, "west", west, false, false);
    }
    if (east !== undefined) {
      emit({ x0: rect.x1 - depth + 1, z0: innerZ0, x1: rect.x1, z1: innerZ1 }, "east", east, false, false);
    }
  }

  return { lots, dropped, front };
}

/** The frontage side to use when a block only gets one: fixed side order. */
function bestSide(fronts: ReadonlyMap<HorizontalFace, string>): HorizontalFace {
  for (const side of SIDES) {
    if (fronts.has(side)) return side;
  }
  return "north";
}

/**
 * The street behind one side of a block, or `undefined` for the district edge.
 *
 * Probed outward from the middle of the side, which is where a carriageway is
 * if there is one at all. The reach allows for {@link STREET_PROBE_SLACK}
 * columns of block ground before the sidewalk starts: an organic block's
 * inscribed rectangle does not touch its own streets, and a probe stopping at
 * the sidewalk band would report every one of its sides as the district edge.
 */
function streetBehind(
  rect: Rect,
  side: HorizontalFace,
  grid: Grid,
  owner: (string | undefined)[],
  sidewalkWidth: number,
): string | undefined {
  const midX = Math.floor((rect.x0 + rect.x1) / 2);
  const midZ = Math.floor((rect.z0 + rect.z1) / 2);
  for (let step = 1; step <= sidewalkWidth + STREET_PROBE_SLACK; step++) {
    const x = side === "west" ? rect.x0 - step : side === "east" ? rect.x1 + step : midX;
    const z = side === "north" ? rect.z0 - step : side === "south" ? rect.z1 + step : midZ;
    const k = grid.index(x, z);
    if (k < 0) return undefined;
    const found = owner[k];
    if (found !== undefined) return found;
  }
  return undefined;
}

/** True when every column of `rect` is buildable ground inside the district. */
function isFree(grid: Grid, blockedMask: Uint8Array, rect: Rect): boolean {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const k = grid.index(x, z);
      if (k < 0 || blockedMask[k] === 1) return false;
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* landmarks                                                                   */
/* -------------------------------------------------------------------------- */

/** A district child, ready to claim a lot. */
interface Landmark {
  readonly id: string;
  readonly nodePath: string;
  readonly size: readonly [number, number, number];
  readonly params: Readonly<Record<string, unknown>>;
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly tags: readonly string[];
  readonly seed: Seed256;
}

/** A lot that has been claimed and will become a building. */
interface BuiltLot {
  readonly nodePath: string;
  readonly id: string;
  /** The parcel the building is seated in, not the building itself. */
  readonly rect: Rect;
  readonly face: HorizontalFace;
  readonly size: readonly [number, number, number];
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly params: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
  readonly seed: Seed256;
  readonly frontPort: string | undefined;
}

/** The door every infill building declares — the front, on the local south. */
const INFILL_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
  door: Object.freeze({ type: "door", face: "south", tags: Object.freeze(["primary"]) }),
});

/**
 * The district's children, biggest footprint first.
 *
 * Biggest first because a landmark is the thing the district was built around:
 * if the cathedral and the corner shop compete for the one deep lot, the
 * cathedral wins, and "wins" has to be decided before either is placed rather
 * than by whichever the document happened to list first. Ties break on document
 * order, which is what makes the choice reproducible.
 */
function landmarksOf(
  node: DistrictNode,
  nodePath: string,
  worldSeed: bigint,
  diagnostics: LoamDiagnostic[],
): Landmark[] {
  const out: Landmark[] = [];
  for (const child of node.children ?? []) {
    const structure = child as StructureNode;
    const childPath = `${nodePath}.${structure.id}`;
    const size = envelopeSize(structure);
    if ((structure.constraints ?? []).length > 0) {
      diagnostics.push(
        warning(
          "CONSTRAINT_NOT_IMPLEMENTED",
          childPath,
          "a district landmark is placed by frontage, not by the solver, so the constraints on this node are ignored",
          "delete the constraints — a landmark's position comes from the lot it claims; move the node out of the district if you need constraint-driven placement",
        ),
      );
    }
    out.push({
      id: structure.id,
      nodePath: childPath,
      size,
      params: structure.params ?? {},
      ports: structure.ports ?? INFILL_PORTS,
      tags: structure.tags ?? [],
      seed: nodeSeed(worldSeed, childPath, structure.seedSalt ?? ""),
    });
  }
  return out
    .map((l, index) => ({ l, index }))
    .sort((a, b) => {
      const areaA = a.l.size[0] * a.l.size[2];
      const areaB = b.l.size[0] * b.l.size[2];
      return areaA !== areaB ? areaB - areaA : a.index - b.index;
    })
    .map((e) => e.l);
}

/** The unrotated footprint a landmark asks for. */
function envelopeSize(node: StructureNode): readonly [number, number, number] {
  const declared = node.envelope?.size;
  if (declared !== undefined && declared.length === 3) return declared as readonly [number, number, number];
  const params = node.params ?? {};
  const floors = typeof params["floors"] === "number" ? params["floors"] : 2;
  return [11, Math.max(4, Math.round(floors * FLOOR_HEIGHT)), 11];
}

/** A run of adjacent lots a landmark may take. */
interface LotRun {
  readonly lots: readonly Lot[];
  readonly rect: Rect;
  readonly face: HorizontalFace;
}

/**
 * The cheapest site for a landmark: a run of unclaimed lots, or failing that a
 * whole free block.
 *
 * "Cheapest" is least wasted ground, which is what stops a nine-block chapel
 * eating the lot the tower needed. Runs are scanned in lot order and ties break
 * on the first lot's position, so the same document always produces the same
 * claim.
 *
 * The whole-block tier is not a nicety. A downtown lot is thirteen blocks deep
 * by construction, and a landmark is a landmark precisely because it is bigger
 * than that — a cathedral or a tower on its own block is the normal case, not
 * the exceptional one. It is a *fallback* rather than a preference because a
 * landmark that fits a frontage should take a frontage: a block given over to a
 * building half its size is a hole in the street wall.
 */
function claimSite(
  lots: readonly Lot[],
  blocks: readonly BlockSite[],
  claimed: ReadonlySet<string>,
  landmark: Landmark,
): LotRun | null {
  const run = claimRun(lots, claimed, landmark);
  if (run !== null) return run;

  for (const block of blocks) {
    const mine = lots.filter((l) => l.block === block.block);
    if (mine.length === 0 || mine.some((l) => claimed.has(l.id))) continue;
    const yaw = yawFacing(frontFace(landmark.ports, undefined), block.face);
    const [rw, , rd] = rotatedSize(landmark.size, yaw);
    if (rw > block.rect.x1 - block.rect.x0 + 1 || rd > block.rect.z1 - block.rect.z0 + 1) continue;
    return { lots: mine, rect: block.rect, face: block.face };
  }
  return null;
}

/** The cheapest run of adjacent unclaimed lots that fits a landmark. */
function claimRun(lots: readonly Lot[], claimed: ReadonlySet<string>, landmark: Landmark): LotRun | null {
  let best: LotRun | null = null;
  let bestWaste = Number.POSITIVE_INFINITY;

  for (let start = 0; start < lots.length; start++) {
    const first = lots[start] as Lot;
    if (claimed.has(first.id)) continue;
    let run: Lot[] = [first];
    for (let length = 1; length <= MAX_LANDMARK_RUN; length++) {
      if (length > 1) {
        const next = lots[start + length - 1];
        if (
          next === undefined ||
          claimed.has(next.id) ||
          next.block !== first.block ||
          next.face !== first.face ||
          next.order !== (run[run.length - 1] as Lot).order + 1
        ) {
          break;
        }
        run = [...run, next];
      }
      const rect = unionRect(run.map((l) => l.rect));
      const yaw = yawFacing(frontFace(landmark.ports, undefined), first.face);
      const [rw, , rd] = rotatedSize(landmark.size, yaw);
      const w = rect.x1 - rect.x0 + 1;
      const d = rect.z1 - rect.z0 + 1;
      if (rw > w || rd > d) continue;
      const waste = w * d - rw * rd;
      if (waste < bestWaste) {
        bestWaste = waste;
        best = { lots: run, rect, face: first.face };
      }
    }
  }
  return best;
}

function unionRect(rects: readonly Rect[]): Rect {
  let out = rects[0] as Rect;
  for (const r of rects.slice(1)) {
    out = {
      x0: Math.min(out.x0, r.x0),
      z0: Math.min(out.z0, r.z0),
      x1: Math.max(out.x1, r.x1),
      z1: Math.max(out.z1, r.z1),
    };
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* infill                                                                      */
/* -------------------------------------------------------------------------- */

/** What one infilled lot came to. */
interface Infill {
  readonly id: string;
  readonly rect: Rect;
  readonly size: readonly [number, number, number];
  readonly params: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
}

/**
 * Fill one lot from the mix, or return `null` when the parcel cannot hold a
 * building at all. Whether the lot is built *by choice* is the caller's
 * coverage draw, not this function's.
 *
 * Every draw is keyed on the lot's min corner, never on a counter: which
 * archetype it takes and how many storeys it runs to are independent positional
 * hashes of the same column. That is what makes adding a landmark somewhere
 * else in the district leave the rest of the street exactly as it was.
 */
function infillLot(lot: Lot, params: DistrictParams, stream: Seed256): Infill | null {
  const density = params.density;
  const x = lot.rect.x0;
  const z = lot.rect.z0;
  const gap = LOT_SIDE_GAP[density] as number;
  const along = lot.face === "north" || lot.face === "south";
  const frontage = (along ? lot.rect.x1 - lot.rect.x0 : lot.rect.z1 - lot.rect.z0) + 1;
  const depth = (along ? lot.rect.z1 - lot.rect.z0 : lot.rect.x1 - lot.rect.x0) + 1;

  let across = frontage - 2 * gap;
  let back = Math.min(depth - gap, MAX_INFILL_DEPTH);
  if (across < MIN_INFILL_SIDE || back < MIN_INFILL_SIDE) return null;

  const archetype = pickArchetype(params.mix, across, stream, x, z);
  if (archetype === null) return null;
  if (isHighriseArchetype(archetype)) {
    across = Math.min(across, HIGHRISE_MAX_WIDTH);
    back = Math.min(back, HIGHRISE_MAX_WIDTH);
  }

  const [lo, hi] = INFILL_FLOORS[density];
  const floors = positionInt(stream, x, 1, z, lo, hi);
  // The unrotated envelope is stated in the *lot's* frame: `across` runs along
  // the street and `back` away from it, which is what the yaw then rotates into
  // world axes. Stating it any other way would make the door's face depend on
  // which side of the block the lot happened to be on.
  const size: [number, number, number] = [across, Math.max(4, floors * FLOOR_HEIGHT + 2), back];

  return {
    id: `infill_${x}_${z}`,
    rect: lot.rect,
    size,
    params: { archetype, floors, floorHeight: FLOOR_HEIGHT },
    tags: ["district", "infill", archetype, ...(lot.corner ? ["corner"] : [])],
  };
}

/**
 * The archetype a lot takes: a positional draw over the mix, in declaration
 * order, skipping anything the lot is too narrow to build.
 *
 * The skip matters. A tall archetype on a nine-block frontage is a chimney, and
 * the grammar would build it — so the mix is walked from the drawn index
 * forward until something fits, and a lot that fits nothing is left open rather
 * than given a building it cannot hold.
 */
function pickArchetype(
  mix: readonly string[],
  across: number,
  stream: Seed256,
  x: number,
  z: number,
): string | null {
  if (mix.length === 0) return null;
  const start = positionInt(stream, x, 2, z, 0, mix.length - 1);
  for (let k = 0; k < mix.length; k++) {
    const name = mix[(start + k) % mix.length] as string;
    if (isHighriseArchetype(name) && across < HIGHRISE_MIN_WIDTH) continue;
    return name;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* seating a building on its lot                                               */
/* -------------------------------------------------------------------------- */

/** Face order for rotation: yaw 90 advances one step (north→east→south→west). */
const FACE_ORDER: readonly HorizontalFace[] = Object.freeze(["north", "east", "south", "west"] as const);

/**
 * The yaw that turns a node's front face towards `target`.
 *
 * This is the whole of "frontage-aligned": the solver's yaw was a free choice
 * scored against `facing`; here it is determined, because a lot has exactly one
 * street and the door goes on it.
 */
export function yawFacing(front: HorizontalFace, target: HorizontalFace): Yaw {
  const steps = (FACE_ORDER.indexOf(target) - FACE_ORDER.indexOf(front) + 4) % 4;
  return ((steps * 90) % 360) as Yaw;
}

/**
 * Seat a `w × d` footprint against the lot's build-to line.
 *
 * The build-to line is the lot edge on the street side, one sidewalk band off
 * the carriageway: the facade sits *on* it, which is what makes a street wall
 * rather than a row of houses at random setbacks. Along the frontage the
 * building is centred, and centred with `floor` so two neighbours never
 * disagree about which column the seam falls on.
 */
export function seat(lot: Rect, face: HorizontalFace, w: number, d: number): Rect {
  const lotW = lot.x1 - lot.x0 + 1;
  const lotD = lot.z1 - lot.z0 + 1;
  const cx = lot.x0 + Math.floor((lotW - w) / 2);
  const cz = lot.z0 + Math.floor((lotD - d) / 2);
  switch (face) {
    case "north":
      return { x0: cx, z0: lot.z0, x1: cx + w - 1, z1: lot.z0 + d - 1 };
    case "south":
      return { x0: cx, z0: lot.z1 - d + 1, x1: cx + w - 1, z1: lot.z1 };
    case "west":
      return { x0: lot.x0, z0: cz, x1: lot.x0 + w - 1, z1: cz + d - 1 };
    default:
      return { x0: lot.x1 - w + 1, z0: cz, x1: lot.x1, z1: cz + d - 1 };
  }
}

/** Median ground height under a rectangle of the composed field. */
export function medianGround(field: HeightField, rect: Rect): number {
  const region = field.region;
  const heights: number[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      heights.push(field.values[j * region.width + i] as number);
    }
  }
  if (heights.length === 0) return 0;
  heights.sort((a, b) => a - b);
  return Math.round(heights[heights.length >> 1] as number);
}
