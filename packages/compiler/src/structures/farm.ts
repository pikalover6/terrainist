/**
 * `precinct.farm@0` — the holding (`docs/FARM-PLAN-v0.md`).
 *
 * One node is one holding: a farmyard with a house and its outbuildings, and
 * the fields that belong to it. The kit joins the precinct *family* — a whole
 * compound derived deterministically from one solver-placed box — but not the
 * precinct ground policy: a holding never levels its envelope. It levels its
 * yard, and each field separately, and leaves everything else alone.
 *
 * ## What is here, and what is not
 *
 * This is **WP-1 plus WP-2**: the node exists, the solver seats it, its params
 * are read and defaulted in one place, every holding gets a report row — and
 * now the holding is *planned*. The gentle-ground scan (§5.1), the packing loop
 * (§5.2), the `farm.parcel` claims at rank 125 (§5.3) and the three refusal
 * warnings (`W500`, `W501`, `W503`) are here.
 *
 * **Still no blocks.** Rows, baulks, headlands, crops, edges, gates and props
 * are WP-3; the farmstead buildings, the yard's own surface and claim, the
 * published port and the four downstream seams (§8, §9) are WP-4. A holding
 * therefore *claims* ground at WP-2 and lays nothing on it: the resolver decides
 * the fields' levels, the transitions at their edges exist, and the report says
 * how many columns each holding won. That is the whole of WP-2's visible effect
 * on a world, and it is the effect the plan asks for — the fields are level
 * before anything is sown on them.
 *
 * The yard is the one place WP-2 reaches into WP-4's section, and it reaches
 * only as far as §5.2's first line makes it: `plan(holding)` seats the yard
 * *before* it packs anything, because the packing grid is anchored on the yard
 * and `LOAM-W503` — a WP-2 diagnostic — fires when no yard can be seated. So
 * WP-2 computes the yard **rectangle** and nothing else about it: it is not
 * levelled, not claimed, not surfaced, not reported, and no building stands on
 * it. All of that is WP-4, and the report row's `yard` field stays absent
 * exactly as WP-1 left it.
 *
 * The reach law (§2) holds trivially here: with no farm node there are no jobs,
 * the caller does not build a result at all, and nothing downstream changes.
 */

import {
  FARM_PARAM_DEFAULTS,
  FARM_PARAM_RANGES,
  FARM_CROPS,
  warning,
  type FarmEdge,
  type LoamDiagnostic,
  type PortDeclaration,
} from "@terrainist/spec";
import { positionInt, type Region, type Seed256 } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import {
  INTENT_RANK,
  type GroundClaim,
  type GroundIntent,
  type GroundTransition,
} from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import type { OccupancyGrid, Placement } from "../layout/types.js";
import { FluidKind } from "../terrain/columns.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { index, inside } from "./roads.js";

/** One holding the structure pass is asked to lay out. */
export interface FarmJob {
  readonly nodePath: string;
  readonly placement: Placement;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: Seed256;
  readonly tags: readonly string[];
  /** Ports the document declared on the holding — `gate`, by convention. */
  readonly ports: Readonly<Record<string, PortDeclaration>>;
}

/**
 * A holding's params, defaulted once.
 *
 * `crops` is the declared vocabulary only: an empty list means "the holding
 * draws from the era/climate default", which is WP-5's fan-out row and is
 * deliberately not decided here. Unknown crop ids are dropped — the validator
 * has already told the author about them with `LOAM-W502`, and §3.3 says the
 * holding keeps its seeded draw over the ones it understands.
 */
export interface FarmSettings {
  readonly parcels: number;
  readonly parcelSize: number;
  readonly crops: readonly string[];
  readonly farmstead: "auto" | "none" | readonly string[];
  readonly edge: FarmEdge;
  readonly fallow: number;
}

/* -------------------------------------------------------------------------- */
/* §5.1 the gentle-ground scan — the constants                                 */
/* -------------------------------------------------------------------------- */

/**
 * Tallest relief a field may be seated across (§5.1).
 *
 * The number to argue about and the one to measure on a walk (§15's Q1): a
 * parcel is 10–28 on a side, so three blocks is a grade under 1:4 across the
 * shortest parcel and under 1:9 across the longest, and the resulting cut is at
 * most two blocks at one corner — a lip the edge absorbs as a lynchet rather
 * than as a wall. Two makes holdings rare on rolling ground; four starts
 * producing three-block lips that want a wall. **One line, by design.**
 */
export const FIELD_MAX_RELIEF = 3;

/** Columns of clear ground kept between the yard and the first field (§5.2). */
export const YARD_SETBACK = 2;

/** Shortest side a parcel may be jittered down to (§3.3's `parcelSize` floor). */
const PARCEL_MIN_SIDE = 10;

/** Positional draw channels this pass owns (§6.4). WP-2 uses 30 only. */
const CHANNEL_PARCEL_JITTER = 30;

/** Why a candidate cell was refused. The keys of `FarmReportRow.refusals`. */
export type FarmRefusal = "envelope" | "claimed" | "wet" | "soil" | "relief";

/**
 * Reasons in tie-break order, worst-first.
 *
 * A cell usually fails more than one way, and the report names one reason per
 * refused cell so that "the dominant refusal reason" is a count over a
 * partition rather than a count over overlapping sets. Ordered by how little
 * the author can do about it: a cell off the edge of the region was never a
 * candidate, a cell a lane already owns is not the farm's to take, and relief
 * is last because it is the reason the scan exists and the one an author fixes
 * by moving the holding.
 */
const REFUSAL_ORDER: readonly FarmRefusal[] = ["envelope", "claimed", "wet", "soil", "relief"];

/** One field, as the packer seated it. */
export interface FarmParcelPlan {
  /** Position in the holding's placement order — the `#parcel_i` suffix. */
  readonly ordinal: number;
  readonly rect: Rect;
  /** The level the parcel claimed: the median of the ground under it. */
  readonly level: number;
  /** Relief measured across the rect, for the walk and for the report. */
  readonly relief: number;
  /** Columns the parcel claimed and **won** once the resolver had its say. */
  readonly columnsWon: number;
  /**
   * Columns the parcel claimed and lost to a stronger class — a lane through
   * the field, a doorstep, a wall.
   *
   * Normal, and deliberately not a diagnostic (§5.3): the parcel declares no
   * `preserve`, because losing columns to a lane is the behaviour we want and
   * making it audible would fill the report with news nobody can act on. It is
   * counted rather than said, so a walk that finds a field cut in half can tell
   * a lane from a bug.
   *
   * **As of this pass's own commit.** The road and street networks declare
   * before it, so their columns are refused by the scan (§5.1) rather than lost
   * here; a doorstep (120) declares *after* it and takes its columns without
   * this count moving. That is the ordering the contract intends — the ground
   * is not decided until the last declarer has spoken — and it is why WP-3's
   * emitter must draw its rows against the **resolved** ground and the claimed
   * mask rather than against the plan the packer made.
   */
  readonly columnsLost: number;
}

/** One holding's row in `report.farms[]` (`docs/FARM-PLAN-v0.md` §12). */
export interface FarmReportRow {
  readonly nodePath: string;
  readonly id: string;
  /** The footprint the solver seated the holding on. */
  readonly envelope: Rect;
  readonly settings: FarmSettings;
  /** Parcels asked for — the crop-circle rule's left-hand side. */
  readonly parcelsRequested: number;
  /** Parcels seated — `parcels.length`, and the crop-circle rule's right side. */
  readonly parcelsSeated: number;
  /** The fields, in placement order. */
  readonly parcels: readonly FarmParcelPlan[];
  /** Why the refused cells were refused, by reason. One reason per refused cell. */
  readonly refusals: Readonly<Record<string, number>>;
  /**
   * Set when the holding was refused whole — no yard could be seated (`W503`).
   *
   * Present rather than implied, because "zero fields" and "no holding at all"
   * are different facts and a report that could not tell them apart would be
   * the silent decline this repo keeps naming as its first failure mode.
   */
  readonly refused?: "yard";
  /** The yard rect and the level it was cut to. Absent until WP-4. */
  readonly yard?: { readonly rect: Rect; readonly level: number };
  /** Crops actually drawn, one per seated parcel. Empty until WP-3. */
  readonly crops: readonly string[];
  /** Farmstead archetypes built. Empty until WP-4. */
  readonly farmstead: readonly string[];
  /** Columns the holding claimed as `farm.parcel`. Zero until WP-2. */
  readonly columnsClaimed: number;
  /**
   * Parcel edges the ground resolver answered with a masonry wall (§5.3).
   *
   * A non-zero count on a walked world is a bug in the gentle-ground scan, not
   * in the resolver. Zero until WP-2 declares anything.
   */
  readonly parcelWalls: number;
  /** The node path a `road.network@0` node anchors on to reach the gate. */
  readonly portAnchor: string;
}

/** Aggregate numbers about the holdings. */
export interface FarmStats {
  readonly holdings: number;
  readonly farmParcels: number;
  readonly farmColumns: number;
}

/** What {@link buildFarms} produced. */
export interface FarmPassResult {
  /** WP-3's rows, baulks, edges and crops. Empty at WP-1, by construction. */
  readonly blocks: readonly never[];
  readonly farms: readonly FarmReportRow[];
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: FarmStats;
}

/** Everything {@link buildFarms} reads. */
export interface FarmPassInput {
  readonly jobs: readonly FarmJob[];
  /**
   * The ground contract's one accumulator (§5.5).
   *
   * Read for the resolved-so-far ground (`view()`) and for the declaration set
   * the roads, the streets, the precincts and the retaining have already
   * contributed — which is how the scan answers "is this column already
   * claimed by something stronger than a field" without a second, private
   * notion of what "claimed" means. Written by `commit`, once, with every
   * holding's parcels.
   */
  readonly ground: GroundDriver;
  /** For the surface state under each column — the soil-family test of §5.1. */
  readonly plan: ColumnPlan;
  /** `grounds.ts`'s soil family, passed in so there is exactly one copy of it. */
  readonly soil: ReadonlySet<number>;
  /** The occupancy grid, for the `building`/`road`/`plaza`/`prop` tags of §5.1. */
  readonly occupancy?: OccupancyGrid;
  /** Placed building footprints — the gate rule's second fallback (§4.1). */
  readonly buildings?: readonly Rect[];
}

/**
 * Read one holding's params, defaulted and clamped.
 *
 * Clamping rather than trusting: the validator rejects an out-of-range param
 * with `LOAM-T226`, so a value outside the range can only reach here from a
 * caller that did not validate (a unit test, or a future pass building a
 * holding of its own), and a holding is better off with a legal number than
 * with a crash.
 */
export function farmSettings(params: Readonly<Record<string, unknown>>): FarmSettings {
  const crops = Array.isArray(params["crops"])
    ? (params["crops"] as readonly unknown[]).filter(
        (c): c is string => typeof c === "string" && (FARM_CROPS as readonly string[]).includes(c),
      )
    : [];
  const farmsteadRaw = params["farmstead"];
  const farmstead: FarmSettings["farmstead"] =
    farmsteadRaw === "none"
      ? "none"
      : Array.isArray(farmsteadRaw) && farmsteadRaw.every((a) => typeof a === "string")
        ? (farmsteadRaw as readonly string[])
        : "auto";
  const edgeRaw = params["edge"];
  const edge: FarmEdge =
    edgeRaw === "wall" || edgeRaw === "none" || edgeRaw === "fence"
      ? edgeRaw
      : FARM_PARAM_DEFAULTS.edge;
  return {
    parcels: clampInt(params["parcels"], FARM_PARAM_DEFAULTS.parcels, FARM_PARAM_RANGES.parcels),
    parcelSize: clampInt(
      params["parcelSize"],
      FARM_PARAM_DEFAULTS.parcelSize,
      FARM_PARAM_RANGES.parcelSize,
    ),
    crops,
    farmstead,
    edge,
    fallow: clampFraction(params["fallow"], FARM_PARAM_DEFAULTS.fallow, FARM_PARAM_RANGES.fallow),
  };
}

/**
 * Lay out every holding: seat the yard, pack the fields, claim the ground.
 *
 * The order is §5.2's `plan(holding)` exactly — yard, then grid, then a greedy
 * walk down a total order of cells — and the two rules a naive implementation
 * loses are kept by construction rather than by care: cells are disjoint by
 * tiling and jitter only ever shrinks one, so parcels never overlap; and the
 * loop `continue`s on a refusal rather than retrying the cell at another size,
 * so the packing stays a pure function of the declaration set.
 *
 * Every holding's claims are committed in **one** `commit`, after the loop:
 * the driver re-resolves the whole accumulated prefix per commit, and there is
 * no reason for two holdings to pay for that twice — and no ordering subtlety
 * either, because two `farm.parcel` intents are ordered by their `source`
 * strings, which are node paths and therefore unique and stable.
 */
export function buildFarms(input: FarmPassInput): FarmPassResult {
  const scan = scanOf(input);
  const farms: FarmReportRow[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const intents: GroundIntent[] = [];
  /** Where this pass's intents start in the driver's accumulated array. */
  const base = input.ground.intents.length;
  /** Per report row, the intent indices of its parcels — filled in after resolve. */
  const owned: number[][] = [];

  for (const job of input.jobs) {
    const settings = farmSettings(job.params);
    const envelope = job.placement.footprint;
    const row = {
      nodePath: job.nodePath,
      id: job.placement.id,
      envelope,
      settings,
      parcelsRequested: settings.parcels,
      crops: [] as readonly string[],
      farmstead: [] as readonly string[],
      portAnchor: job.nodePath,
    };

    const gate = gateOf(envelope, scan, input.occupancy, input.buildings ?? []);
    const yard = seatYard(envelope, gate, scan);
    if (yard.rect === undefined) {
      diagnostics.push(farmRefused(job.nodePath, yard.side, yard.bestRelief, yard.reason));
      farms.push({
        ...row,
        parcelsSeated: 0,
        parcels: [],
        refusals: { [yard.reason]: 1 },
        refused: "yard",
        columnsClaimed: 0,
        parcelWalls: 0,
      });
      owned.push([]);
      continue;
    }

    const packed = packParcels(job, settings, envelope, yard.rect, gate, scan);
    const mine: number[] = [];
    for (const parcel of packed.parcels) {
      mine.push(base + intents.length);
      intents.push({
        source: parcelSource(job.nodePath, parcel.ordinal),
        sourceClass: "farm.parcel",
        kind: "platform",
        columns: claimsOf(parcel, scan.region),
        // A request, and §2.5 of the ground contract says the resolver's
        // drop/run table answers it. A field edge wants a step or a bank and
        // never a masonry wall; when the answer comes back a wall, `parcelWalls`
        // counts it and the scan is what is wrong, not the resolver.
        transition: "step",
      });
    }
    owned.push(mine);
    // No `preserve` (§5.3): losing columns to a lane, a doorstep or a wall is
    // normal, and it is exactly the behaviour we want.
    if (packed.parcels.length === 0) {
      diagnostics.push(farmNoGround(job.nodePath, packed.refusals, packed.bestRelief));
    } else if (packed.parcels.length < settings.parcels) {
      diagnostics.push(
        farmParcelsShort(job.nodePath, settings.parcels, packed.parcels.length, packed.refusals),
      );
    }
    farms.push({
      ...row,
      parcelsSeated: packed.parcels.length,
      parcels: packed.parcels,
      refusals: packed.refusals,
      columnsClaimed: 0,
      parcelWalls: 0,
    });
  }

  if (intents.length > 0) input.ground.commit(intents);
  const resolved = intents.length === 0 ? undefined : input.ground.finish();
  const settled = farms.map((row, i) => settle(row, owned[i] ?? [], resolved));

  return {
    blocks: [],
    farms: settled,
    diagnostics,
    stats: {
      holdings: settled.length,
      farmParcels: settled.reduce((n, f) => n + f.parcelsSeated, 0),
      farmColumns: settled.reduce((n, f) => n + f.columnsClaimed, 0),
    },
  };
}

/** `#parcel_i` — the source string §5.3 names, in one place. */
function parcelSource(nodePath: string, ordinal: number): string {
  return `${nodePath}#parcel_${ordinal}`;
}

/**
 * Fill in what only the resolver knows: which claimed columns each parcel won,
 * which it lost, and how many of its edges came back as masonry.
 */
function settle(
  row: FarmReportRow,
  mine: readonly number[],
  resolved: ReturnType<GroundDriver["finish"]> | undefined,
): FarmReportRow {
  if (resolved === undefined || mine.length === 0) return row;
  const won = new Map<number, number>();
  for (const k of mine) won.set(k, 0);
  for (let idx = 0; idx < resolved.owner.length; idx++) {
    const owner = resolved.owner[idx] as number;
    const tally = won.get(owner);
    if (tally !== undefined) won.set(owner, tally + 1);
  }
  const parcels = row.parcels.map((parcel, i) => {
    const claimed = area(parcel.rect);
    const w = won.get(mine[i] as number) ?? 0;
    return { ...parcel, columnsWon: w, columnsLost: claimed - w };
  });
  return {
    ...row,
    parcels,
    columnsClaimed: parcels.reduce((n, p) => n + p.columnsWon, 0),
    parcelWalls: countWalls(resolved.transitions, row.nodePath),
  };
}

/**
 * Parcel edges the drop/run table answered with masonry (§5.3).
 *
 * `retaining` and `built` are the two masonry answers `treatmentForSeam` gives;
 * `kerb` and `bank` are the step and the slope a field edge is allowed to have,
 * and `rock` is the ground refusing to be a wall at all. A non-zero count on a
 * walked world is a bug in the gentle-ground scan, not in the resolver.
 */
function countWalls(transitions: readonly GroundTransition[], nodePath: string): number {
  const prefix = `${nodePath}#parcel_`;
  let walls = 0;
  for (const t of transitions) {
    if (t.treatment !== "retaining" && t.treatment !== "built") continue;
    if (t.aboveSource.startsWith(prefix) || t.belowSource.startsWith(prefix)) walls++;
  }
  return walls;
}

/* -------------------------------------------------------------------------- */
/* §5.1 the scan                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything the seatability test reads, resolved once for the whole pass.
 *
 * Exported with {@link seatRect} so §5.1 can be tested at its corners on a hand
 * -built column plan rather than only through a compiled world: the bar is one
 * integer, and an off-by-one in it is invisible in a world and obvious here.
 */
export interface FarmScan {
  readonly region: Region;
  readonly ground: { readonly [i: number]: number };
  readonly fluidKind: { readonly [i: number]: number };
  readonly surface: Int32Array;
  readonly soil: ReadonlySet<number>;
  /** 1 where an intent of a class stronger than `farm.parcel` claimed a level. */
  readonly stronger: Uint8Array;
  /** 1 where the occupancy grid carries a `building`/`road`/`plaza`/`prop` tag. */
  readonly occupied: Uint8Array;
}

/** Build the scan from a pass input. Exported for the same reason as {@link FarmScan}. */
export function scanOf(input: FarmPassInput): FarmScan {
  const region = input.plan.region;
  const view = input.ground.view();
  const columns = region.width * region.depth;
  const stronger = new Uint8Array(columns);
  const rank = INTENT_RANK["farm.parcel"];
  for (const intent of input.ground.intents) {
    // Level claims only: `clearance` and `preserve` propose no level of their
    // own (ground contract §2.2), so a column named only by those is nobody's.
    if (intent.kind !== "platform" && intent.kind !== "profile" && intent.kind !== "face") continue;
    if (INTENT_RANK[intent.sourceClass] >= rank) continue;
    for (const claim of intent.columns) stronger[claim.idx] = 1;
  }
  const occupied = new Uint8Array(columns);
  if (input.occupancy !== undefined) {
    // §5.1 names these four tags. The union `mask` is deliberately *not* used:
    // it carries every placed node's inflated footprint, which includes the
    // holding's own envelope, and a holding that refused its own ground would
    // never seat a field.
    for (const tag of ["building", "road", "plaza", "prop"]) {
      const m = input.occupancy.byTag.get(tag);
      if (m === undefined) continue;
      for (let i = 0; i < occupied.length; i++) if (m[i] === 1) occupied[i] = 1;
    }
  }
  return {
    region,
    ground: view.ground,
    fluidKind: view.fluidKind,
    surface: input.plan.surface,
    soil: input.soil,
    stronger,
    occupied,
  };
}

/** What the scan says about one candidate rectangle. */
export type Seat = { readonly level: number; readonly relief: number } | { readonly refusal: FarmRefusal };

export function isSeated(seat: Seat): seat is { readonly level: number; readonly relief: number } {
  return "level" in seat;
}

/**
 * §5.1, verbatim: a rectangle is seatable iff its relief is within
 * {@link FIELD_MAX_RELIEF}, no column is wet, no column is already claimed by
 * something stronger, and every column's surface is soil-family.
 *
 * A refused rectangle reports **one** reason, worst-first by
 * {@link REFUSAL_ORDER}, so the report's refusal counts partition the refused
 * cells instead of double-counting them.
 */
export function seatRect(rect: Rect, scan: FarmScan): Seat {
  const region = scan.region;
  const levels: number[] = [];
  let wet = false;
  let claimed = false;
  let hard = false;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(region, x, z)) return { refusal: "envelope" };
      const idx = index(region, x, z);
      if ((scan.fluidKind[idx] as number) !== FluidKind.NONE) wet = true;
      if (scan.stronger[idx] === 1 || scan.occupied[idx] === 1) claimed = true;
      if (!scan.soil.has(scan.surface[idx] as number)) hard = true;
      const y = scan.ground[idx] as number;
      levels.push(y);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
  }
  if (levels.length === 0) return { refusal: "envelope" };
  const relief = hi - lo;
  const failed: Partial<Record<FarmRefusal, boolean>> = {
    claimed,
    wet,
    soil: hard,
    relief: relief > FIELD_MAX_RELIEF,
  };
  for (const reason of REFUSAL_ORDER) if (failed[reason] === true) return { refusal: reason };
  return { level: median(levels), relief };
}

/** The median, rounded half-up — §5.1's `level(R)`. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if ((sorted.length & 1) === 1) return sorted[mid] as number;
  return Math.floor(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 + 0.5);
}

/* -------------------------------------------------------------------------- */
/* §4.1 the gate                                                               */
/* -------------------------------------------------------------------------- */

/** Which side of the envelope the gate stands on, and where. */
interface FarmGate {
  readonly x: number;
  readonly z: number;
  readonly side: "z0" | "x0" | "x1" | "z1";
}

/**
 * §4.1's gate: the perimeter point closest to the nearest road; failing that,
 * to the nearest placed building footprint; failing that, the midpoint of the
 * envelope's `-z` side.
 *
 * The three-step ladder is the whole rule, and the last rung is what makes it
 * total — a holding alone on a plain still has a gate, and therefore still has
 * a yard corner to anchor its grid on.
 */
function gateOf(
  envelope: Rect,
  scan: FarmScan,
  occupancy: OccupancyGrid | undefined,
  buildings: readonly Rect[],
): FarmGate {
  const road = occupancy?.byTag.get("road");
  let target: { x: number; z: number } | undefined;
  if (road !== undefined) {
    const region = scan.region;
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        if (road[j * region.width + i] !== 1) continue;
        const x = region.x0 + i;
        const z = region.z0 + j;
        const d = distanceToRect(x, z, envelope);
        // Ties broken by (z, x) — the enumeration order — so the answer does
        // not depend on which equally-close lane column was visited first.
        if (d < best) {
          best = d;
          target = { x, z };
        }
      }
    }
  }
  if (target === undefined && buildings.length > 0) {
    let best = Number.POSITIVE_INFINITY;
    for (const rect of buildings) {
      const cx = (rect.x0 + rect.x1) >> 1;
      const cz = (rect.z0 + rect.z1) >> 1;
      const d = distanceToRect(cx, cz, envelope);
      if (d < best) {
        best = d;
        target = { x: cx, z: cz };
      }
    }
  }
  if (target === undefined) {
    return { x: (envelope.x0 + envelope.x1) >> 1, z: envelope.z0, side: "z0" };
  }
  const cx = clamp(target.x, envelope.x0, envelope.x1);
  const cz = clamp(target.z, envelope.z0, envelope.z1);
  const sides: readonly { readonly side: FarmGate["side"]; readonly d: number }[] = [
    { side: "z0", d: cz - envelope.z0 },
    { side: "x0", d: cx - envelope.x0 },
    { side: "x1", d: envelope.x1 - cx },
    { side: "z1", d: envelope.z1 - cz },
  ];
  // First-wins ordering, with `-z` first: the same side the last rung of the
  // ladder falls back to, so a perfectly-centred target is not decided by luck.
  let chosen = sides[0] as { side: FarmGate["side"]; d: number };
  for (const candidate of sides) if (candidate.d < chosen.d) chosen = candidate;
  switch (chosen.side) {
    case "z0":
      return { x: cx, z: envelope.z0, side: "z0" };
    case "z1":
      return { x: cx, z: envelope.z1, side: "z1" };
    case "x0":
      return { x: envelope.x0, z: cz, side: "x0" };
    default:
      return { x: envelope.x1, z: cz, side: "x1" };
  }
}

/* -------------------------------------------------------------------------- */
/* §7.1 the yard rectangle — as much of the yard as WP-2 needs                 */
/* -------------------------------------------------------------------------- */

/**
 * §7.1's yard, reduced to the one thing §5.2 needs from it: a rectangle.
 *
 * The side is scaled by the *envelope*, not by the parcel count, for the
 * ordering reason — the yard is seated before a single field is, so the parcel
 * count §7.2 scales the farmstead by does not exist yet. A quarter of the
 * envelope's short side, clamped into §7.1's 16..24, puts a 40 × 40 croft on 16
 * and anything from 96 across on 24.
 *
 * The search is a 2-column lattice ordered outward from the gate-anchored ideal
 * position, first seatable wins. A retry ladder would make the answer depend on
 * traversal order; a single fixed position would refuse a holding whose gate
 * happens to face a boulder.
 */
function seatYard(
  envelope: Rect,
  gate: FarmGate,
  scan: FarmScan,
): {
  readonly rect?: Rect;
  readonly side: number;
  readonly bestRelief: number;
  readonly reason: FarmRefusal;
} {
  const width = envelope.x1 - envelope.x0 + 1;
  const depth = envelope.z1 - envelope.z0 + 1;
  const side = clamp(Math.floor(Math.min(width, depth) / 4), 16, 24);
  if (side > width || side > depth) {
    return { side, bestRelief: 0, reason: "envelope" };
  }
  const maxX = envelope.x1 - side + 1;
  const maxZ = envelope.z1 - side + 1;
  const idealX =
    gate.side === "x0"
      ? envelope.x0
      : gate.side === "x1"
        ? maxX
        : clamp(gate.x - (side >> 1), envelope.x0, maxX);
  const idealZ =
    gate.side === "z0"
      ? envelope.z0
      : gate.side === "z1"
        ? maxZ
        : clamp(gate.z - (side >> 1), envelope.z0, maxZ);

  const candidates: { x: number; z: number; d: number }[] = [];
  for (let z = envelope.z0; z <= maxZ; z++) {
    for (let x = envelope.x0; x <= maxX; x++) {
      // A 2-column lattice through the ideal: enough positions to find ground,
      // few enough that the search is cheap on a large envelope.
      if ((Math.abs(x - idealX) & 1) === 1 || (Math.abs(z - idealZ) & 1) === 1) continue;
      candidates.push({ x, z, d: Math.max(Math.abs(x - idealX), Math.abs(z - idealZ)) });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);

  let bestRelief = Number.POSITIVE_INFINITY;
  const counts = new Map<FarmRefusal, number>();
  for (const candidate of candidates) {
    const rect: Rect = {
      x0: candidate.x,
      z0: candidate.z,
      x1: candidate.x + side - 1,
      z1: candidate.z + side - 1,
    };
    const answer = seatRect(rect, scan);
    if (isSeated(answer)) return { rect, side, bestRelief: answer.relief, reason: "relief" };
    counts.set(answer.refusal, (counts.get(answer.refusal) ?? 0) + 1);
    if (answer.refusal === "relief") {
      bestRelief = Math.min(bestRelief, reliefOf(rect, scan));
    }
  }
  return {
    side,
    bestRelief: Number.isFinite(bestRelief) ? bestRelief : 0,
    reason: dominant(counts),
  };
}

/** The relief of a rectangle, measured again for a diagnostic that names it. */
function reliefOf(rect: Rect, scan: FarmScan): number {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(scan.region, x, z)) continue;
      const y = scan.ground[index(scan.region, x, z)] as number;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
  }
  return Number.isFinite(lo) ? hi - lo : 0;
}

/* -------------------------------------------------------------------------- */
/* §5.2 the packing                                                            */
/* -------------------------------------------------------------------------- */

interface Packed {
  readonly parcels: readonly FarmParcelPlan[];
  readonly refusals: Readonly<Record<string, number>>;
  readonly bestRelief: number;
}

/**
 * §5.2's `plan(holding)`, from the grid down.
 *
 * The grid is tiled on the holding's yaw axes — a holding is seated with one
 * rotation (`yaw` 0), so those are the world axes — anchored at the yard corner
 * nearest the gate, and walked in a total order: chebyshev distance from the
 * yard, then z, then x. A holding's fields therefore sit *against* its yard
 * rather than scattering, and the order is a property of the geometry rather
 * than of the loop.
 */
function packParcels(
  job: FarmJob,
  settings: FarmSettings,
  envelope: Rect,
  yard: Rect,
  gate: FarmGate,
  scan: FarmScan,
): Packed {
  const s = settings.parcelSize;
  const origin = anchorCorner(yard, gate);
  const blocked: Rect = {
    x0: yard.x0 - YARD_SETBACK,
    z0: yard.z0 - YARD_SETBACK,
    x1: yard.x1 + YARD_SETBACK,
    z1: yard.z1 + YARD_SETBACK,
  };
  const cells: Rect[] = [];
  const i0 = Math.ceil((envelope.x0 - origin.x) / s);
  const i1 = Math.floor((envelope.x1 + 1 - s - origin.x) / s);
  const j0 = Math.ceil((envelope.z0 - origin.z) / s);
  const j1 = Math.floor((envelope.z1 + 1 - s - origin.z) / s);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cell: Rect = {
        x0: origin.x + i * s,
        z0: origin.z + j * s,
        x1: origin.x + i * s + s - 1,
        z1: origin.z + j * s + s - 1,
      };
      if (overlaps(cell, blocked)) continue;
      cells.push(cell);
    }
  }
  const ordered = orderParcelCells(cells, yard);

  const parcels: FarmParcelPlan[] = [];
  const counts = new Map<FarmRefusal, number>();
  let bestRelief = Number.POSITIVE_INFINITY;
  for (const cell of ordered) {
    if (parcels.length >= settings.parcels) break;
    const rect = jitter(cell, job.seed);
    const answer = seatRect(rect, scan);
    if (!isSeated(answer)) {
      // One shape per cell, once (§5.2): a refused cell is never retried at
      // another size, because a retry ladder makes the packing order-dependent
      // and the report unreadable.
      counts.set(answer.refusal, (counts.get(answer.refusal) ?? 0) + 1);
      if (answer.refusal === "relief") bestRelief = Math.min(bestRelief, reliefOf(rect, scan));
      continue;
    }
    parcels.push({
      ordinal: parcels.length,
      rect,
      level: answer.level,
      relief: answer.relief,
      columnsWon: 0,
      columnsLost: 0,
    });
  }
  if (cells.length === 0) counts.set("envelope", 1);
  const refusals: Record<string, number> = {};
  for (const reason of REFUSAL_ORDER) {
    const n = counts.get(reason);
    if (n !== undefined) refusals[reason] = n;
  }
  return {
    parcels,
    refusals,
    bestRelief: Number.isFinite(bestRelief) ? bestRelief : 0,
  };
}

/**
 * §5.2's cell order: chebyshev distance from the yard, then z, then x.
 *
 * **A total order, never traversal order** — the plan says so in those words,
 * and it is what makes the packing a pure function of the geometry. Exported so
 * a test can shuffle the enumeration and get the same answer back, which is the
 * only way to prove a sort is total rather than merely stable.
 */
export function orderParcelCells(cells: readonly Rect[], yard: Rect): readonly Rect[] {
  return [...cells].sort(
    (a, b) => chebyshev(a, yard) - chebyshev(b, yard) || a.z0 - b.z0 || a.x0 - b.x0,
  );
}

/** The yard corner the grid is anchored at: the one nearest the gate (§5.2). */
function anchorCorner(yard: Rect, gate: FarmGate): { readonly x: number; readonly z: number } {
  const corners = [
    { x: yard.x0, z: yard.z0 },
    { x: yard.x1 + 1, z: yard.z0 },
    { x: yard.x0, z: yard.z1 + 1 },
    { x: yard.x1 + 1, z: yard.z1 + 1 },
  ];
  let best = corners[0] as { x: number; z: number };
  let bestD = Number.POSITIVE_INFINITY;
  for (const corner of corners) {
    const d = Math.abs(corner.x - gate.x) + Math.abs(corner.z - gate.z);
    if (d < bestD) {
      bestD = d;
      best = corner;
    }
  }
  return best;
}

/**
 * §6.4 channel 30 — the per-parcel size jitter, keyed on the cell's own corners.
 *
 * The channel table calls the jitter "−2..+2 on each side" and §5.2 says the
 * cell is "**shrunk** by" it. Only the shrinking half can be built: a side
 * jittered outward would cross into the neighbouring cell, and §5.2's first
 * standing rule is that parcels never overlap. So each side is inset 0..2, and
 * the inset is given back from the high side first when it would take a parcel
 * under {@link PARCEL_MIN_SIDE} — the floor §6.4 states.
 *
 * Positional, keyed on the cell's four corners: adding a parcel somewhere else
 * in the holding leaves every other parcel exactly as it was.
 */
function jitter(cell: Rect, seed: Seed256): Rect {
  const draw = (x: number, z: number): number =>
    positionInt(seed, x, CHANNEL_PARCEL_JITTER, z, 0, 2);
  let west = draw(cell.x0, cell.z0);
  let east = draw(cell.x1, cell.z0);
  let north = draw(cell.x0, cell.z1);
  let south = draw(cell.x1, cell.z1);
  const width = cell.x1 - cell.x0 + 1;
  const depth = cell.z1 - cell.z0 + 1;
  while (width - west - east < PARCEL_MIN_SIDE && (west > 0 || east > 0)) {
    if (east > 0) east--;
    else west--;
  }
  while (depth - north - south < PARCEL_MIN_SIDE && (north > 0 || south > 0)) {
    if (south > 0) south--;
    else north--;
  }
  return { x0: cell.x0 + west, z0: cell.z0 + north, x1: cell.x1 - east, z1: cell.z1 - south };
}

/** Every column of a parcel, at its claimed level — §5.3's `columns`. */
function claimsOf(parcel: FarmParcelPlan, region: Region): readonly GroundClaim[] {
  const columns: GroundClaim[] = [];
  for (let z = parcel.rect.z0; z <= parcel.rect.z1; z++) {
    for (let x = parcel.rect.x0; x <= parcel.rect.x1; x++) {
      if (!inside(region, x, z)) continue;
      columns.push({ idx: index(region, x, z), y: parcel.level });
    }
  }
  return columns;
}

/* -------------------------------------------------------------------------- */
/* §12 the diagnostics                                                         */
/* -------------------------------------------------------------------------- */

/** How the report and the messages name a refusal, in the author's language. */
const REFUSAL_PROSE: Readonly<Record<FarmRefusal, string>> = Object.freeze({
  envelope: "the envelope has no room left for another field",
  claimed: "the ground is already claimed by a road, a building or a yard",
  wet: "the ground is under water",
  soil: "the surface is rock, sand or pavement rather than soil",
  relief: `the ground is steeper than the ${FIELD_MAX_RELIEF}-block bar`,
});

function dominant(counts: ReadonlyMap<FarmRefusal, number>): FarmRefusal {
  let best: FarmRefusal = "relief";
  let n = -1;
  // Ties broken by REFUSAL_ORDER, so the dominant reason is a function of the
  // counts and not of insertion order.
  for (const reason of REFUSAL_ORDER) {
    const count = counts.get(reason) ?? 0;
    if (count > n) {
      n = count;
      best = reason;
    }
  }
  return best;
}

function dominantOf(refusals: Readonly<Record<string, number>>): FarmRefusal {
  const counts = new Map<FarmRefusal, number>();
  for (const reason of REFUSAL_ORDER) {
    const n = refusals[reason];
    if (n !== undefined) counts.set(reason, n);
  }
  return dominant(counts);
}

function farmRefused(
  nodePath: string,
  side: number,
  bestRelief: number,
  reason: FarmRefusal,
): LoamDiagnostic {
  return warning(
    "FARM_REFUSED",
    nodePath,
    `"${nodePath}" places nothing: no ${side}×${side} yard fits anywhere in its envelope — ${REFUSAL_PROSE[reason]}${
      reason === "relief" ? ` (the flattest measures ${bestRelief} blocks of relief)` : ""
    }`,
    `move the holding to flatter, open ground — a valley floor or a plain beside the town — or give it a larger "envelope" so a ${side}×${side} yard has somewhere to sit`,
  );
}

function farmNoGround(
  nodePath: string,
  refusals: Readonly<Record<string, number>>,
  bestRelief: number,
): LoamDiagnostic {
  const reason = dominantOf(refusals);
  return warning(
    "FARM_NO_GROUND",
    nodePath,
    `"${nodePath}" seated its yard and not one field: every candidate was refused because ${REFUSAL_PROSE[reason]}${
      reason === "relief"
        ? ` (the flattest measured ${bestRelief} blocks against the ${FIELD_MAX_RELIEF}-block bar)`
        : ""
    }`,
    `move the holding to flatter ground, or drop "terrain_conform" if something is levelling the envelope — a field is seated only where the ground is already within ${FIELD_MAX_RELIEF} blocks of level`,
  );
}

function farmParcelsShort(
  nodePath: string,
  requested: number,
  delivered: number,
  refusals: Readonly<Record<string, number>>,
): LoamDiagnostic {
  const reason = dominantOf(refusals);
  return warning(
    "FARM_PARCELS_SHORT",
    nodePath,
    `"${nodePath}" asked for ${requested} fields and seated ${delivered}: the rest were refused, mostly because ${REFUSAL_PROSE[reason]}`,
    reason === "envelope"
      ? `give the holding a larger "envelope", or a smaller "parcelSize", so ${requested} fields fit`
      : `move the holding to flatter, clearer ground, lower "parcels" to ${delivered}, or lower "parcelSize" so a field fits between the obstacles`,
  );
}

/* -------------------------------------------------------------------------- */
/* small geometry                                                              */
/* -------------------------------------------------------------------------- */

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function area(rect: Rect): number {
  return (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
}

/** Chebyshev distance between two rectangles; 0 when they touch or overlap. */
function chebyshev(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(b.x0 - a.x1, a.x0 - b.x1));
  const dz = Math.max(0, Math.max(b.z0 - a.z1, a.z0 - b.z1));
  return Math.max(dx, dz);
}

/** Squared euclidean distance from a column to the nearest column of a rect. */
function distanceToRect(x: number, z: number, rect: Rect): number {
  const dx = Math.max(0, Math.max(rect.x0 - x, x - rect.x1));
  const dz = Math.max(0, Math.max(rect.z0 - z, z - rect.z1));
  return dx * dx + dz * dz;
}

function clampInt(raw: unknown, fallback: number, range: { min: number; max: number }): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(raw)));
}

function clampFraction(
  raw: unknown,
  fallback: number,
  range: { min: number; max: number },
): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(range.max, Math.max(range.min, raw));
}
