import type { DistrictDensity, HorizontalFace } from "@terrainist/spec/ir";
import type { Seed256 } from "@terrainist/stdlib";
import { Grid } from "./district-grid.js";
import { LOT_DEPTH, LOT_FRONTAGE, MAX_INFILL_DEPTH, MIN_INFILL_SIDE, STREET_PROBE_SLACK } from "./district-constants.js";
import type { Block } from "./district-blocks.js";
import type { Rect, Point2 } from "./frames.js";
import { largestRect } from "./masks.js";
import { isCourtyardPlan, planCourtyard, splitIndexNearest, type CourtyardPlan, type CourtyardReject } from "./courtyards.js";
import { TERRACE_MAX_FRONTAGE } from "./district-terraces.js";
import { carriagewayCells, type StreetGraph } from "./streets.js";
import type { FormStrip } from "./forms/index.js";

/** One parcel, fronting one street. */
export interface Lot {
  readonly id: string;
  readonly rect: Rect;
  /** The direction from the lot towards its street — where its door points. */
  readonly face: HorizontalFace;
  /**
   * Which side of the block the lot's strip was cut from.
   *
   * Equal to {@link Lot.face} for every lot the ordinary subdivision cuts, and
   * *opposite* to it on a courtyard block's streetless face, where the range
   * turns its door into the court (§4.3). Runs are grouped by `side`, never by
   * `face`, so a north strip facing south and a south strip facing south stay
   * two strips rather than collapsing into one.
   */
  readonly side: HorizontalFace;
  /** The segment id it fronts; `""` when it fronts the district boundary. */
  readonly street: string;
  readonly block: number;
  /** Frontage index within the strip, for run detection. */
  readonly order: number;
  readonly corner: boolean;
  /**
   * True on a lot in a courtyard block's perimeter. Its coverage draws — the
   * terrace one and the per-lot one — are forced to 1: an unbuilt lot in a
   * courtyard perimeter is a hole in the wall, and the whole point of the form
   * is that the wall is unbroken (§4.3).
   */
  readonly courtyard: boolean;
}

/** The four sides of a block, in the fixed order the subdivision walks them. */
export const SIDES: readonly HorizontalFace[] = Object.freeze(["north", "south", "west", "east"] as const);

/**
 * Which segment claims the ground just outside one side of a block.
 *
 * A block side with no street behind it is the district boundary, and a lot may
 * not front it: a door onto the outside of the district is a door onto whatever
 * the next pass happens to put there.
 */
export function segmentOwners(grid: Grid, graph: StreetGraph): (string | undefined)[] {
  const out = new Array<string | undefined>(grid.cells);
  for (const cell of carriagewayCells(graph)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) out[k] = cell.segment;
  }
  return out;
}

/** What one block's subdivision produced. */
export interface Subdivision {
  readonly lots: readonly Lot[];
  readonly dropped: number;
  /** The block's own frontage, for a landmark that wants the whole block. */
  readonly front: BlockSite | null;
  /** The courtyard this block closes around, when it was selected (§4.2). */
  readonly courtyard: CourtyardPlan | null;
  /** Why it was not selected. `null` when it was. */
  readonly rejected: CourtyardReject | null;
}

/** A whole block, offered to a landmark no run of lots can hold. */
export interface BlockSite {
  readonly block: number;
  readonly rect: Rect;
  readonly face: HorizontalFace;
  readonly street: string;
  /** A planned strip's site — its whole free mask; absent on a block. */
  readonly planned?: boolean;
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
export function subdivide(
  block: Block,
  index: number,
  density: DistrictDensity,
  grid: Grid,
  blockedMask: Uint8Array,
  owner: (string | undefined)[],
  sidewalkWidth: number,
  courtyards: { readonly share: number; readonly stream: Seed256 },
  benched: boolean,
): Subdivision {
  const frontage = LOT_FRONTAGE[density];
  const { rect } = block;
  const width = rect.x1 - rect.x0 + 1;
  const span = rect.z1 - rect.z0 + 1;
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
  if (fronts.size === 0) {
    return { lots: [], dropped: 0, front: null, courtyard: null, rejected: "perimeter" };
  }
  const primary = bestSide(fronts, benched ? { width, span } : undefined);
  const front: BlockSite = {
    block: index,
    rect,
    face: primary,
    street: fronts.get(primary) as string,
  };

  const decision = planCourtyard({
    rect,
    columns: block.columns,
    density,
    share: courtyards.share,
    depth,
    perimeter,
    fronts: new Set(fronts.keys()),
    primary,
    maxFrontage: TERRACE_MAX_FRONTAGE[density],
    stream: courtyards.stream,
  });
  const plan = isCourtyardPlan(decision) ? decision : null;
  const rejected = plan === null ? (decision as { rejected: CourtyardReject }).rejected : null;

  const lots: Lot[] = [];
  let dropped = 0;

  const emit = (
    strip: Rect,
    side: HorizontalFace,
    street: string,
    cornerWest: boolean,
    cornerEast: boolean,
    face: HorizontalFace = side,
  ): void => {
    const along = side === "north" || side === "south";
    const length = along ? strip.x1 - strip.x0 + 1 : strip.z1 - strip.z0 + 1;
    const sizes = allocateFrontage(length, frontage as number);
    let cursor = along ? strip.x0 : strip.z0;
    for (const [k, size] of sizes.entries()) {
      const rect: Rect = along
        ? { x0: cursor, z0: strip.z0, x1: cursor + size - 1, z1: strip.z1 }
        : { x0: strip.x0, z0: cursor, x1: strip.x1, z1: cursor + size - 1 };
      cursor += size;
      if (!isFree(grid, blockedMask, rect)) {
        dropped++;
        continue;
      }
      const corner = (k === 0 && cornerWest) || (k === sizes.length - 1 && cornerEast);
      const courtyard = plan !== null;
      lots.push({
        id: `b${index}_${side}_${k}`,
        rect,
        face,
        side,
        street,
        block: index,
        order: k,
        corner,
        courtyard,
      });
    }
  };

  if (!perimeter) {
    emit(rect, primary, front.street, true, true);
    return { lots, dropped, front, courtyard: null, rejected };
  }

  if (plan !== null) {
    const inward: Readonly<Record<HorizontalFace, HorizontalFace>> = {
      north: "south",
      south: "north",
      west: "east",
      east: "west",
    };
    const innerZ0c = rect.z0 + depth;
    const innerZ1c = rect.z1 - depth;
    for (const side of SIDES) {
      const street = fronts.get(side);
      const face = street === undefined ? (inward[side] as HorizontalFace) : side;
      const strip: Rect =
        side === "north"
          ? { ...rect, z1: rect.z0 + depth - 1 }
          : side === "south"
            ? { ...rect, z0: rect.z1 - depth + 1 }
            : side === "west"
              ? { x0: rect.x0, z0: innerZ0c, x1: rect.x0 + depth - 1, z1: innerZ1c }
              : { x0: rect.x1 - depth + 1, z0: innerZ0c, x1: rect.x1, z1: innerZ1c };
      const ends = side === "north" || side === "south";
      emit(strip, side, street ?? front.street, ends, ends, face);
    }
    return { lots, dropped, front, courtyard: plan, rejected: null };
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
  if (innerZ1 - innerZ0 + 1 >= MIN_INFILL_SIDE) {
    if (west !== undefined) {
      emit({ x0: rect.x0, z0: innerZ0, x1: rect.x0 + depth - 1, z1: innerZ1 }, "west", west, false, false);
    }
    if (east !== undefined) {
      emit({ x0: rect.x1 - depth + 1, z0: innerZ0, x1: rect.x1, z1: innerZ1 }, "east", east, false, false);
    }
  }

  return { lots, dropped, front, courtyard: null, rejected };
}

/** What one strip's frontage walk produced. */
export interface FrontageWalk {
  readonly lots: readonly Lot[];
  readonly sites: readonly BlockSite[];
  readonly dropped: number;
  /** Columns the lots claimed — the numerator of §4.2's recovery measurement. */
  readonly lotColumns: number;
  /** Columns the seated rectangles took — the denominator's other half. */
  readonly seatedColumns: number;
}

/**
 * How many lots a frontage of `length` columns is cut into, and how wide each is
 */
export function allocateFrontage(length: number, target: number): number[] {
  const count = Math.max(1, Math.round(length / target));
  const base = Math.floor(length / count);
  const extra = length - base * count;
  return Array.from({ length: count }, (_, k) => base + (k < extra ? 1 : 0));
}

/**
 * Lots walked off a planned strip's own frontage.
 */
export function frontageLots(
  strips: readonly FormStrip[],
  grid: Grid,
  blocked: Uint8Array,
  density: DistrictDensity,
): FrontageWalk {
  const bounds: Rect = {
    x0: grid.x0,
    z0: grid.z0,
    x1: grid.x0 + grid.width - 1,
    z1: grid.z0 + grid.depth - 1,
  };
  const lots: Lot[] = [];
  const sites: BlockSite[] = [];
  let dropped = 0;
  let lotColumns = 0;
  let seatedColumns = 0;
  const taken = new Uint8Array(grid.cells);

  for (const strip of strips) {
    if (strip.stations === 0) continue;
    const sizes = allocateFrontage(strip.stations, LOT_FRONTAGE[density] as number);
    const stripFree = new Uint8Array(grid.cells);
    for (let c = 0; c < grid.cells; c++) {
      if (strip.columns[c] !== 1 || blocked[c] === 1) continue;
      if ((strip.depth[c] as number) >= MAX_INFILL_DEPTH) continue;
      stripFree[c] = 1;
    }
    const byStation: number[][] = Array.from({ length: strip.stations }, () => []);
    for (let c = 0; c < grid.cells; c++) {
      if (strip.columns[c] !== 1 || blocked[c] === 1 || taken[c] === 1) continue;
      const st = strip.station[c] as number;
      if (st < 0 || st >= strip.stations) continue;
      if ((strip.depth[c] as number) >= MAX_INFILL_DEPTH) continue;
      (byStation[st] as number[]).push(c);
    }
    let cursor = 0;
    for (const [k, size] of sizes.entries()) {
      const from = cursor;
      cursor += size;
      const member = new Uint8Array(grid.cells);
      const frontier: number[] = [];
      for (let st = from; st < from + size && st < strip.stations; st++) {
        for (const c of byStation[st] as number[]) {
          if (member[c] === 1 || (strip.depth[c] as number) > 1) continue;
          member[c] = 1;
          frontier.push(c);
        }
      }
      let columns = frontier.length;
      const budget = size * MAX_INFILL_DEPTH;
      for (let head = 0; head < frontier.length && columns < budget; head++) {
        const c = frontier[head] as number;
        const x = grid.x(c);
        const z = grid.z(c);
        for (const [dx, dz] of NEIGHBOURS) {
          const n = grid.index(x + dx, z + dz);
          if (n < 0 || member[n] === 1) continue;
          if (strip.columns[n] !== 1 || blocked[n] === 1 || taken[n] === 1) continue;
          if ((strip.depth[n] as number) >= MAX_INFILL_DEPTH) continue;
          if (LOT_PARCEL_OWN_STATIONS && !inLotSpan(strip.station[n] as number, from, size)) continue;
          member[n] = 1;
          columns++;
          frontier.push(n);
        }
      }
      if (columns === 0) {
        dropped++;
        continue;
      }
      const rect = largestRect(bounds, member);
      if (rect === null || Math.min(rect.x1 - rect.x0 + 1, rect.z1 - rect.z0 + 1) < MIN_INFILL_SIDE) {
        dropped++;
        continue;
      }
      lotColumns += columns;
      seatedColumns += (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
      for (let z = rect.z0; z <= rect.z1; z++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          const c = grid.index(x, z);
          if (c >= 0) taken[c] = 1;
        }
      }
      for (let c = 0; c < grid.cells; c++) if (member[c] === 1) taken[c] = 1;
      const face = faceOf(
        strip.outward[Math.min(from + (size >> 1), strip.stations - 1)] as Point2,
      );
      lots.push({
        id: `s${strip.index}f${k}`,
        rect,
        face,
        side: face,
        street: strip.street,
        block: strip.index,
        order: k,
        corner: k === 0 || k === sizes.length - 1,
        courtyard: false,
      });
    }
    const site = largestRect(bounds, stripFree);
    if (site !== null) {
      sites.push({
        block: strip.index,
        rect: site,
        face: faceOf(strip.outward[strip.stations >> 1] as Point2),
        street: strip.street,
        planned: true,
      });
    }
  }
  return { lots, sites, dropped, lotColumns, seatedColumns };
}

/**
 * The face a lot shows the street, from the strip's outward normal.
 */
function faceOf(outward: Point2): HorizontalFace {
  const dx = -outward.x;
  const dz = -outward.z;
  if (Math.abs(dx) >= Math.abs(dz)) return dx < 0 ? "west" : "east";
  return dz < 0 ? "north" : "south";
}

/**
 * The frontage side to use when a block only gets one.
 */
export function bestSide(
  fronts: ReadonlyMap<HorizontalFace, string>,
  size?: { readonly width: number; readonly span: number },
): HorizontalFace {
  if (size !== undefined) {
    let best: HorizontalFace | undefined;
    let bestLength = 0;
    for (const side of SIDES) {
      if (!fronts.has(side)) continue;
      const length = side === "north" || side === "south" ? size.width : size.span;
      if (length > bestLength) {
        bestLength = length;
        best = side;
      }
    }
    if (best !== undefined) return best;
  }
  for (const side of SIDES) {
    if (fronts.has(side)) return side;
  }
  return "north";
}

/**
 * The street behind one side of a block, or `undefined` for the district edge.
 */
function streetBehind(
  rect: Rect,
  side: HorizontalFace,
  grid: Grid,
  owner: (string | undefined)[],
  sidewalkWidth: number,
): string | undefined {
  const along = side === "north" || side === "south";
  const positions = along ? middleOut(rect.x0, rect.x1) : middleOut(rect.z0, rect.z1);
  for (const at of positions) {
    for (let step = 1; step <= sidewalkWidth + STREET_PROBE_SLACK; step++) {
      const x = side === "west" ? rect.x0 - step : side === "east" ? rect.x1 + step : at;
      const z = side === "north" ? rect.z0 - step : side === "south" ? rect.z1 + step : at;
      const k = grid.index(x, z);
      if (k < 0) break;
      const found = owner[k];
      if (found !== undefined) return found;
    }
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

/**
 * **A frontage lot grows inward through its own stations, never sideways into
 * a neighbour's.**
 */
export const LOT_PARCEL_OWN_STATIONS = false;

/** {@link LOT_PARCEL_OWN_STATIONS}'s rule as a pure function. */
export function inLotSpan(station: number, from: number, size: number): boolean {
  return station >= from && station < from + size;
}

/**
 * The positions along a side, middle first, then alternately outward —
 * The block-face scan order as a pure function so a test can
 * read it. `[lo, hi]` inclusive.
 */
export function middleOut(lo: number, hi: number): number[] {
  const mid = Math.floor((lo + hi) / 2);
  const out = [mid];
  for (let d = 1; mid - d >= lo || mid + d <= hi; d++) {
    if (mid - d >= lo) out.push(mid - d);
    if (mid + d <= hi) out.push(mid + d);
  }
  return out;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const);

/**
 * Lot subdivision stage — narrow input/result.
 *
 * Receives owned/immutable blocks, masks, graph, and courtyard params; returns
 * lots, sites, courtyard plans, and diagnostics ownership without sharing
 * district.ts's large mutable context.
 */
export interface LotSubdivisionInput {
  readonly blocks: readonly Block[];
  readonly grid: Grid;
  readonly blocked: Uint8Array;
  readonly graph: StreetGraph;
  readonly density: DistrictDensity;
  readonly sidewalkWidth: number;
  readonly courtyardShare: number;
  readonly courtyardStream: Seed256;
  readonly benched: boolean;
  readonly plannedStrips?: readonly FormStrip[];
  readonly plazaBlock: number;
}

export interface LotSubdivisionResult {
  readonly lots: readonly Lot[];
  readonly blockSites: readonly BlockSite[];
  readonly dropped: number;
  readonly courtyardPlans: ReadonlyMap<number, CourtyardPlan>;
  readonly courtyardRejects: ReadonlyMap<import("./courtyards.js").CourtyardReject, number>;
  readonly preferAt: ReadonlyMap<string, number>;
  readonly courtyardPassagePlanCount: number;
  readonly frontage: FrontageWalk | null;
  readonly plazaLots: number;
}

export function subdivideLots(input: LotSubdivisionInput): LotSubdivisionResult {
  const {
    blocks,
    grid,
    blocked,
    graph,
    density,
    sidewalkWidth,
    courtyardShare,
    courtyardStream,
    benched,
    plannedStrips,
    plazaBlock,
  } = input;
  const owner = segmentOwners(grid, graph);
  const lots: Lot[] = [];
  const blockSites: BlockSite[] = [];
  let dropped = 0;
  let plazaLots = 0;
  let frontage: FrontageWalk | null = null;
  const courtyardPlans = new Map<number, CourtyardPlan>();
  const courtyardRejects = new Map<import("./courtyards.js").CourtyardReject, number>();
  const preferAt = new Map<string, number>();
  for (const [i, block] of blocks.entries()) {
    const cut = subdivide(
      block,
      i,
      density,
      grid,
      blocked,
      owner,
      sidewalkWidth,
      { share: courtyardShare, stream: courtyardStream },
      benched,
    );
    dropped += cut.dropped;
    if (cut.rejected !== null) {
      courtyardRejects.set(cut.rejected, (courtyardRejects.get(cut.rejected) ?? 0) + 1);
    }
    if (i === plazaBlock) {
      plazaLots += cut.lots.length;
      continue;
    }
    if (cut.courtyard !== null) {
      courtyardPlans.set(i, cut.courtyard);
      for (const [face, at] of cut.courtyard.preferAt) preferAt.set(`${i}:${face}`, at);
    }
    lots.push(...cut.lots);
    if (cut.front !== null && cut.lots.length > 0) blockSites.push(cut.front);
  }
  if (plannedStrips !== undefined) {
    const walked = frontageLots(plannedStrips, grid, blocked, density);
    lots.push(...walked.lots);
    blockSites.push(...walked.sites);
    dropped += walked.dropped;
    frontage = walked;
  }
  lots.sort((a, b) => (a.rect.z0 !== b.rect.z0 ? a.rect.z0 - b.rect.z0 : a.rect.x0 - b.rect.x0));
  return {
    lots,
    blockSites,
    dropped,
    courtyardPlans,
    courtyardRejects,
    preferAt,
    courtyardPassagePlanCount: courtyardPlans.size,
    frontage,
    plazaLots,
  };
}
