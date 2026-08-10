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
import {
  positionFloat,
  positionInt,
  propFootprint,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
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
import type { Palette } from "../terrain/palette.js";
import type { StructureBlock } from "./buildings.js";
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

/** Positional draw channels this pass owns (§6.4). 30..39 are reserved. */
const CHANNEL_PARCEL_JITTER = 30;
/** Crop index into the holding's crop list. */
const CHANNEL_CROP = 31;
/** Row direction tie-break on a square parcel. */
const CHANNEL_ROW_AXIS = 32;
/** Baulk phase, 0..2 rows. */
const CHANNEL_BAULK_PHASE = 33;
/** Fallow (§6.5). */
const CHANNEL_FALLOW = 34;
/** Gate position along the chosen edge run. */
const CHANNEL_GATE = 35;
/** Which parcel carries the scarecrow / hay / cart prop. */
const CHANNEL_PROP = 36;
/**
 * Pasture tuft density — §6.2's "`short_grass` at a lifted density".
 *
 * The next free number in the block §6.4 reserved, taken under that section's
 * own instruction ("an implementer adding a draw takes the next free number and
 * adds a row here"); the row is added to the plan's table alongside this line.
 * 37 belongs to WP-4's farmstead draw and is left alone.
 */
const CHANNEL_PASTURE = 38;

/** Rows of pasture that get a tuft — §6.2's "lifted density". */
const PASTURE_TUFT_DENSITY = 0.55;

/** §6.1's baulk pitch: an unsown walking strip every seven rows. */
export const BAULK_PITCH = 7;

/** §6.1: the first baulk, before the phase draw shifts it. */
const BAULK_FIRST_ROW = 3;

/** §6.1: a parcel this wide or wider also gets a centreline baulk. */
const CENTRELINE_BAULK_SPAN = 20;

/** §6.1's turning strip: two rows at each end of the run. */
const HEADLAND_DEPTH = 2;

/** §6.5: at most one prop per parcel, at most three per holding. */
const MAX_HOLDING_PROPS = 3;

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

/**
 * A prop the holding offers to the ordinary `prop.place@0` emitter (§6.5).
 *
 * Handed back rather than emitted: a scarecrow is a prop, and the prop pass is
 * what knows how to refuse one whole when a single op cannot land — the standing
 * rule since the cropped-street-furniture fix. The shape is
 * `PrecinctPropSpec`'s, for the same reason and through the same seam.
 */
export interface FarmPropSpec {
  readonly nodePath: string;
  readonly prop: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** What {@link buildFarms} produced. */
export interface FarmPassResult {
  /** WP-3's crops, fences, gates and hay — the things that stand above ground. */
  readonly blocks: readonly StructureBlock[];
  /** §6.5's props, for the caller to hand to `buildProps`. */
  readonly props: readonly FarmPropSpec[];
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
  /**
   * The theme's ground roles, for the edge course and the dry-stone wall.
   *
   * Optional with {@link FarmPassInput.stack}, and the pair is the seam between
   * WP-2's planner and WP-3's emitter: a caller that hands neither gets the plan,
   * the claims and the report and **no blocks**. That is what the planner's own
   * tests want — a holding's packing is a fact about geometry, and asking them to
   * load a block stack to assert it would be asking the wrong question.
   */
  readonly palette?: Palette;
  /** The pinned 1.21.11 block set — §6.2's crop states are addressed through it. */
  readonly stack?: PrismarineStack;
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
  /** Per report row, what the emitter needs once the resolver has spoken. */
  const sowable: (SowJob | undefined)[] = [];

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
      sowable.push(undefined);
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
    sowable.push({ job, settings, yard: yard.rect, parcels: packed.parcels, intents: mine });
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

  // WP-3, and the ordering is the whole of §5.4's last sentence: the rows are
  // drawn against the **resolved** ground and the resolved ownership, never
  // against the plan the packer made. A column the parcel claimed and lost — to
  // a lane, a doorstep, a wall — is simply not one of the columns drawn on, so a
  // row stops where the field stops and the fence closes across the gap.
  const states = resolved === undefined ? undefined : farmStates(input);
  const blocks: StructureBlock[] = [];
  const props: FarmPropSpec[] = [];
  const sown = settled.map((row, i) => {
    const job = sowable[i];
    if (states === undefined || resolved === undefined || job === undefined) return row;
    const crops = sowHolding(job, states, input, resolved, blocks, props);
    return { ...row, crops };
  });

  return {
    blocks,
    props,
    farms: sown,
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

/* -------------------------------------------------------------------------- */
/* §6 the parcel emitter — WP-3                                                */
/* -------------------------------------------------------------------------- */

/**
 * One holding, carried from the planning loop to the emitter.
 *
 * The two are separated by exactly one thing: the resolver. The packer decides
 * *where* a field is, the resolver decides *what the ground under it is*, and
 * only then may a row be drawn — §5.4's last sentence, and the reason this
 * struct exists rather than the emitter running inline.
 */
interface SowJob {
  readonly job: FarmJob;
  readonly settings: FarmSettings;
  readonly yard: Rect;
  readonly parcels: readonly FarmParcelPlan[];
  /** The driver-array index of each parcel's intent, parallel to `parcels`. */
  readonly intents: readonly number[];
}

type Facing = "north" | "south" | "east" | "west";

/** Every block state the emitter lays, resolved once per compile. */
interface FarmStates {
  /** §6.2's persistence law, second half: farmland is written at moisture 0. */
  readonly farmland: number;
  readonly path: number;
  readonly coarse: number;
  /** The edge course, and pasture's own surface: the theme's soil. */
  readonly soil: number;
  readonly tuft: number;
  readonly hay: number;
  readonly fence: number;
  readonly gate: Readonly<Record<Facing, number>>;
  /** `edge: "wall"` — a dry-stone course in the theme's bank/revetment role. */
  readonly wall: number;
  /** The block that stands **above** a sown column, by crop id. */
  readonly crop: Readonly<Record<string, number>>;
}

/**
 * §6.2's table, in the pinned 1.21.11 set.
 *
 * Every crop is emitted mature (§14's exclusion 9: a field of `age=2` wheat is a
 * field that looks broken), and `beetroots` is the one whose mature stage is 3
 * rather than 7.
 */
function farmStates(input: FarmPassInput): FarmStates | undefined {
  const { palette, stack } = input;
  if (palette === undefined || stack === undefined) return undefined;
  const named = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const symbol = (s: string, fallback: string): number =>
    palette.has(s) ? palette.state(s) : named(fallback);
  const state = (name: string, props: Readonly<Record<string, string>>): number =>
    stack.blockStateOf(name, props) ?? named(name);
  const gate = (facing: Facing): number =>
    state("minecraft:oak_fence_gate", {
      facing,
      in_wall: "false",
      open: "false",
      powered: "false",
    });
  return {
    farmland: state("minecraft:farmland", { moisture: "0" }),
    path: named("minecraft:dirt_path"),
    coarse: symbol("ground.coarse_dirt", "minecraft:coarse_dirt"),
    soil: symbol("ground.surface", "minecraft:grass_block"),
    tuft: symbol("foliage.short_grass", "minecraft:short_grass"),
    hay: state("minecraft:hay_block", { axis: "y" }),
    fence: symbol("road.post", "minecraft:oak_fence"),
    gate: { north: gate("north"), south: gate("south"), east: gate("east"), west: gate("west") },
    // A field edge is not a building: the bank is the dry-stone course, and the
    // revetment is what a theme that has no bank falls back to.
    wall: palette.has("ground.bank")
      ? palette.state("ground.bank")
      : symbol("ground.revetment", "minecraft:cobblestone"),
    crop: {
      wheat: state("minecraft:wheat", { age: "7" }),
      carrots: state("minecraft:carrots", { age: "7" }),
      potatoes: state("minecraft:potatoes", { age: "7" }),
      beetroots: state("minecraft:beetroots", { age: "3" }),
      // No stems (§6.2): an attached stem needs a facing a lattice cannot
      // guarantee, and an unattached one reads as nothing.
      pumpkin: named("minecraft:pumpkin"),
      berries: state("minecraft:sweet_berry_bush", { age: "3" }),
    },
  };
}

/** §10's `farm.cropList` resolve when no `era`/`climate` has spoken: temperate. */
const DEFAULT_CROPS: readonly string[] = ["wheat", "carrots", "potatoes", "beetroots"];

/** How `report.farms[].crops` names a parcel §6.5 sent fallow. */
export const FALLOW = "fallow";

/**
 * The shortest interior side a crop's pattern needs.
 *
 * §6.2 says the crop draw skips "any crop the parcel is too small for", and this
 * is that test. Only `pumpkin` has a pattern with a period — a 2-column lattice
 * — and it wants an interior wide enough for two pumpkins on a side; every other
 * crop fills whatever row it is given. At the 10-block parcel floor the interior
 * is 8, so nothing in the table is refused in practice: the mechanism is here
 * because §6.2 names it, not because a v0 crop trips it.
 */
const CROP_MIN_INTERIOR: Readonly<Record<string, number>> = Object.freeze({ pumpkin: 5 });

/** What one parcel's interior is made of, before ownership is consulted. */
type CellKind = "sown" | "baulk" | "headland" | "edge" | "standing";

/**
 * Sow one holding: every field, its edge, its gate, and at most three props.
 *
 * Returns the crops drawn, one per seated parcel, for the report row.
 */
function sowHolding(
  sow: SowJob,
  states: FarmStates,
  input: FarmPassInput,
  resolved: { readonly owner: Int32Array; readonly ground: Int32Array },
  blocks: StructureBlock[],
  props: FarmPropSpec[],
): readonly string[] {
  const { job, settings, parcels } = sow;
  const plan = input.plan;
  const region = plan.region;
  const list = settings.crops.length > 0 ? settings.crops : DEFAULT_CROPS;
  /**
   * Fence columns this holding has already run, plus their orthogonal
   * neighbours (§6.3): two parcels that touch share **one** boundary, and a
   * double fence with a one-column dead alley between it is the single most
   * common way this feature can look wrong.
   */
  const fenced = new Uint8Array(region.width * region.depth);
  const crops: string[] = [];
  const layouts: ParcelLayout[] = [];

  for (const [i, parcel] of parcels.entries()) {
    const layout = parcelLayout(parcel, job.seed, settings);
    const crop = pickCrop(parcel, list, layout, crops, parcels, job.seed);
    // A rested field is named in the report rather than blanked: "fallow" and
    // "no crop drawn" are different facts (§6.5, and §12's crop-circle rule).
    crops.push(layout.fallow ? FALLOW : crop);
    layouts.push(layout);
  }

  // The props are sited **before** a single row is drawn, and the ground each of
  // them stands on is trodden bare (§6.5's "at most one per parcel"). Both
  // halves are the persistence law defending itself: a prop is placed by the
  // ordinary `prop.place@0` emitter, which sites the thing from its own search
  // and would happily set a handcart down in the wheat — and a prop that took a
  // crop and left the farmland under it would un-till that column on the first
  // random tick. Ground a prop may stand on is therefore ground with no crop on
  // it, decided here, before the crop exists.
  const trodden = placeProps(sow, layouts, crops, states, region, resolved, blocks, props);

  for (const [i, parcel] of parcels.entries()) {
    sowParcel(
      parcel,
      layouts[i] as ParcelLayout,
      crops[i] === FALLOW ? (list[0] as string) : (crops[i] as string),
      sow.intents[i] as number,
      states,
      input,
      resolved,
      fenced,
      trodden,
      blocks,
      sow,
    );
  }
  return crops;
}

/** One parcel's fixed decisions, drawn once and read by everything below. */
interface ParcelLayout {
  /** `true` when rows run along x — §6.1's "one axis for the whole parcel". */
  readonly alongX: boolean;
  readonly interior: Rect;
  readonly baulkPhase: number;
  readonly fallow: boolean;
  /** Interior span across the rows, in columns. */
  readonly rows: number;
}

/** §6.1's row direction and §6.5's fallow draw, for one parcel. */
function parcelLayout(parcel: FarmParcelPlan, seed: Seed256, settings: FarmSettings): ParcelLayout {
  const rect = parcel.rect;
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  // The parcel's long axis; on a square parcel, channel 32's tie-break. §6.1
  // reads "the axis of the holding's yaw" there, and a holding is always seated
  // at yaw 0, which would make every square parcel in the world identical — the
  // channel table reserves 32 for exactly this tie, so the draw is what breaks
  // it. Documented rather than improvised: it is the only reading under which
  // channel 32 has anything to decide.
  const alongX =
    width !== depth
      ? width > depth
      : positionInt(seed, rect.x0, CHANNEL_ROW_AXIS, rect.z0, 0, 1) === 0;
  const interior: Rect = { x0: rect.x0 + 1, z0: rect.z0 + 1, x1: rect.x1 - 1, z1: rect.z1 - 1 };
  const rows = alongX ? interior.z1 - interior.z0 + 1 : interior.x1 - interior.x0 + 1;
  return {
    alongX,
    interior,
    baulkPhase: positionInt(seed, rect.x0, CHANNEL_BAULK_PHASE, rect.z0, 0, 2),
    fallow: positionFloat(seed, rect.x0, CHANNEL_FALLOW, rect.z0) < settings.fallow,
    rows,
  };
}

/**
 * §6.2's crop draw: positional, keyed on the parcel's min corner, walked forward
 * from the drawn index like `pickArchetype` does — skipping any crop the parcel
 * is too small for, and skipping the crop a touching, already-placed parcel
 * took. The last parcel in a holding may repeat.
 */
function pickCrop(
  parcel: FarmParcelPlan,
  list: readonly string[],
  layout: ParcelLayout,
  taken: readonly string[],
  parcels: readonly FarmParcelPlan[],
  seed: Seed256,
): string {
  const interiorSide = Math.min(
    layout.interior.x1 - layout.interior.x0 + 1,
    layout.interior.z1 - layout.interior.z0 + 1,
  );
  const neighbours = new Set<string>();
  for (const [i, other] of parcels.entries()) {
    if (i >= taken.length) break;
    if (!adjacent(parcel.rect, other.rect)) continue;
    const crop = taken[i];
    if (crop !== undefined && crop !== "") neighbours.add(crop);
  }
  const start = positionInt(seed, parcel.rect.x0, CHANNEL_CROP, parcel.rect.z0, 0, list.length - 1);
  let fallback: string | undefined;
  for (let step = 0; step < list.length; step++) {
    const crop = list[(start + step) % list.length] as string;
    if ((CROP_MIN_INTERIOR[crop] ?? 0) > interiorSide) continue;
    fallback ??= crop;
    if (neighbours.has(crop)) continue;
    return crop;
  }
  // Every crop the parcel can grow is already growing next door: the last parcel
  // in a holding may repeat (§6.2), and this is that sentence.
  return fallback ?? (list[start] as string);
}

/**
 * Two parcels a player reads as neighbours — §6.2's "the previously-placed
 * adjacent parcel", whose crop this one must not take.
 *
 * The bar is the jitter span, not zero: two parcels on neighbouring grid cells
 * are inset 0..2 each (§6.4 channel 30), so "abutting" would catch only the
 * quarter of neighbour pairs that both drew a zero inset — and the colour change
 * at a boundary is what makes a parcel legible whether the gap is nothing or
 * four columns.
 */
function adjacent(a: Rect, b: Rect): boolean {
  return chebyshev(a, b) <= PARCEL_ADJACENT_GAP;
}

/** Widest gap across which two parcels still read as neighbours (§6.2). */
const PARCEL_ADJACENT_GAP = 4;

/**
 * Draw one parcel: the edge course and its fence, the headlands, the baulks and
 * the rows.
 *
 * Every column is checked against `resolved.owner` first. That check is the
 * whole of §5.4's instruction — a column the parcel lost is not drawn on, so a
 * lane through a field is a lane through a field rather than a lane with wheat
 * laid over it — and it is also what makes the persistence law safe: the pair
 * (farmland, crop) is written in one place, under one ownership test, so there
 * is no path that writes the farmland and skips the crop.
 */
function sowParcel(
  parcel: FarmParcelPlan,
  layout: ParcelLayout,
  crop: string,
  mine: number,
  states: FarmStates,
  input: FarmPassInput,
  resolved: { readonly owner: Int32Array; readonly ground: Int32Array },
  fenced: Uint8Array,
  trodden: ReadonlySet<number>,
  blocks: StructureBlock[],
  sow: SowJob,
): void {
  const plan = input.plan;
  const region = plan.region;
  const rect = parcel.rect;
  const gate = gateColumn(parcel, sow, fenced, region, mine, resolved);

  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(region, x, z)) continue;
      const idx = index(region, x, z);
      // §5.4: the resolved ground and the resolved ownership, never the plan the
      // packer made.
      if (resolved.owner[idx] !== mine) continue;
      const y = resolved.ground[idx] as number;
      const plotted = cellKind(x, z, rect, layout);
      // The edge is never trodden away: a parcel keeps its boundary and its one
      // gate whatever stands inside it.
      const kind: CellKind = plotted !== "edge" && trodden.has(idx) ? "standing" : plotted;
      const surface =
        kind === "edge"
          ? states.soil
          : // A prop's standing: trodden bare, and `coarse_dirt` rather than
            // `dirt_path` because a hay bale is a full block and `dirt_path`
            // reverts to `dirt` under one.
            kind === "standing"
            ? states.coarse
            : kind === "headland" || kind === "baulk"
              ? states.path
              : sownSurface(x, z, layout, crop, states);
      plan.surface[idx] = surface;
      // Snow over a crop is not a season, it is a compile that disagreed with
      // itself (§8) — and a snow layer standing where the wheat goes is also a
      // block in the crop's own space.
      plan.snow[idx] = 0;
      if (plan.soil[idx] === 0) plan.soil[idx] = 1;

      if (kind === "edge") {
        edgeVertical(x, z, y, idx, gate, states, sow.settings, fenced, region, blocks);
        continue;
      }
      if (surface === states.farmland) {
        // THE PERSISTENCE LAW, first half: every farmland column carries a crop.
        // Farmland with nothing above it reverts to dirt on a random tick, so a
        // world shipped with bare tilled rows is a world that un-tills itself in
        // front of the player.
        blocks.push({ x, y: y + 1, z, stateId: states.crop[crop] as number });
      } else if (crop === "berries" && kind === "sown" && !layout.fallow) {
        blocks.push({ x, y: y + 1, z, stateId: states.crop["berries"] as number });
      } else if (crop === "pasture" && kind === "sown" && !layout.fallow) {
        if (positionFloat(sow.job.seed, x, CHANNEL_PASTURE, z) < PASTURE_TUFT_DENSITY) {
          blocks.push({ x, y: y + 1, z, stateId: states.tuft });
        }
      }
    }
  }
}

/** Which of §6.1's four things a column is. */
function cellKind(x: number, z: number, rect: Rect, layout: ParcelLayout): CellKind {
  if (x === rect.x0 || x === rect.x1 || z === rect.z0 || z === rect.z1) return "edge";
  const interior = layout.interior;
  const u = layout.alongX ? x : z;
  const u0 = layout.alongX ? interior.x0 : interior.z0;
  const u1 = layout.alongX ? interior.x1 : interior.z1;
  // §6.1's headlands: the turning strip at each end of the run, and the single
  // cue that most reliably says "ploughed" from a distance.
  if (u < u0 + HEADLAND_DEPTH || u > u1 - HEADLAND_DEPTH) return "headland";
  const v = layout.alongX ? z : x;
  const v0 = layout.alongX ? interior.z0 : interior.x0;
  const row = v - v0;
  if (row >= BAULK_FIRST_ROW && (row - BAULK_FIRST_ROW - layout.baulkPhase) % BAULK_PITCH === 0) {
    return "baulk";
  }
  if (layout.rows >= CENTRELINE_BAULK_SPAN && row === layout.rows >> 1) return "baulk";
  return "sown";
}

/** The surface of a sown column: §6.2's table, and §6.5's fallow. */
function sownSurface(
  x: number,
  z: number,
  layout: ParcelLayout,
  crop: string,
  states: FarmStates,
): number {
  // A fallow parcel is rested ground with the baulks and the edge kept (§6.5) —
  // and, under the persistence law, it is `coarse_dirt` rather than bare tilth.
  if (layout.fallow) return states.coarse;
  switch (crop) {
    case "berries":
      return states.coarse;
    case "pasture":
      return states.soil;
    case "pumpkin": {
      // A 2-column lattice, `dirt_path` between (§6.2). The lattice cells are
      // the farmland ones, so every farmland column still carries a pumpkin.
      const u = layout.alongX ? x - layout.interior.x0 : z - layout.interior.z0;
      const v = layout.alongX ? z - layout.interior.z0 : x - layout.interior.x0;
      return (u & 1) === 0 && (v & 1) === 0 ? states.farmland : states.path;
    }
    default:
      return states.farmland;
  }
}

/** Where a parcel's one gate stands, and which way it faces (§6.3). */
interface FarmGateColumn {
  readonly x: number;
  readonly z: number;
  readonly facing: Facing;
}

/**
 * §6.3's one gate per parcel: in the edge run facing the yard, at a position
 * drawn on channel 35, never at a corner — and never on a run this holding has
 * already fenced, because a shared boundary carries one fence and both parcels'
 * gates are elsewhere.
 */
function gateColumn(
  parcel: FarmParcelPlan,
  sow: SowJob,
  fenced: Uint8Array,
  region: Region,
  mine: number,
  resolved: { readonly owner: Int32Array },
): FarmGateColumn | undefined {
  const rect = parcel.rect;
  if (rect.x1 - rect.x0 < 2 || rect.z1 - rect.z0 < 2) return undefined;
  const cx = (rect.x0 + rect.x1) >> 1;
  const cz = (rect.z0 + rect.z1) >> 1;
  const yx = (sow.yard.x0 + sow.yard.x1) >> 1;
  const yz = (sow.yard.z0 + sow.yard.z1) >> 1;
  // The side facing the yard first, then the rest in a fixed order: a parcel
  // with no line of sight to the yard still gets exactly one gate.
  const facing: Facing =
    Math.abs(yx - cx) > Math.abs(yz - cz) ? (yx < cx ? "west" : "east") : yz < cz ? "north" : "south";
  const order: readonly Facing[] = [facing, "north", "west", "east", "south"];
  const seen = new Set<Facing>();
  for (const side of order) {
    if (seen.has(side)) continue;
    seen.add(side);
    const run = edgeRun(rect, side);
    const draw = positionInt(sow.job.seed, rect.x0, CHANNEL_GATE, rect.z0, 0, run.length - 1);
    for (let step = 0; step < run.length; step++) {
      const column = run[(draw + step) % run.length] as { x: number; z: number };
      if (!inside(region, column.x, column.z)) continue;
      const idx = index(region, column.x, column.z);
      // A column the parcel lost is not the parcel's to hang a gate on (§5.4),
      // and a column already fenced belongs to the shared boundary (§6.3).
      if (resolved.owner[idx] !== mine) continue;
      if (fenced[idx] === 1) continue;
      return { ...column, facing: side };
    }
  }
  return undefined;
}

/** One side of a parcel's edge course, corners excluded. */
function edgeRun(rect: Rect, side: Facing): readonly { x: number; z: number }[] {
  const run: { x: number; z: number }[] = [];
  if (side === "north" || side === "south") {
    const z = side === "north" ? rect.z0 : rect.z1;
    for (let x = rect.x0 + 1; x <= rect.x1 - 1; x++) run.push({ x, z });
  } else {
    const x = side === "west" ? rect.x0 : rect.x1;
    for (let z = rect.z0 + 1; z <= rect.z1 - 1; z++) run.push({ x, z });
  }
  return run;
}

/**
 * The vertical that stands on one edge column: a fence post, a dry-stone
 * course, a gate, or nothing.
 *
 * Fence posts stand on the **edge course** and never on farmland or
 * `dirt_path` (§6.3): `dirt_path` reverts to `dirt` under a solid block, and a
 * fence on farmland reads as a mistake. Putting the posts on soil dodges both,
 * and the surface has already been written as soil by the caller.
 */
function edgeVertical(
  x: number,
  z: number,
  y: number,
  idx: number,
  gate: FarmGateColumn | undefined,
  states: FarmStates,
  settings: FarmSettings,
  fenced: Uint8Array,
  region: Region,
  blocks: StructureBlock[],
): void {
  if (settings.edge === "none") return;
  const isGate = gate !== undefined && gate.x === x && gate.z === z;
  if (isGate) {
    // `edge: "wall"` leaves a one-column gap where the gate would be (§6.3).
    if (settings.edge === "fence") {
      blocks.push({ x, y: y + 1, z, stateId: states.gate[gate.facing] });
    }
    fenced[idx] = 1;
    return;
  }
  // §6.3's shared boundary: a column orthogonally beside a run this holding has
  // already fenced is the other parcel's fence, seen from this side.
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (!inside(region, x + dx, z + dz)) continue;
    if (fenced[index(region, x + dx, z + dz)] === 1) return;
  }
  blocks.push({ x, y: y + 1, z, stateId: settings.edge === "wall" ? states.wall : states.fence });
  fenced[idx] = 1;
}

/* -------------------------------------------------------------------------- */
/* §6.5 the props                                                              */
/* -------------------------------------------------------------------------- */

/**
 * At most one prop per parcel and at most three per holding (§6.5).
 *
 * Each stands on ground that carries no crop — a scarecrow on a baulk, a cart
 * on a headland, the hay in the corner of a rested field — which is both what
 * §6.5 says and what the persistence law needs: a prop that landed on a sown
 * column would take the crop and leave the farmland bare.
 *
 * The scarecrow and the cart go through the ordinary `prop.place@0` emitter, so
 * they are refused whole when a single op cannot land. The hay is four blocks
 * and has no prop generator behind it — the same call the precinct's windsock
 * makes, and for the same reason.
 */
function placeProps(
  sow: SowJob,
  layouts: readonly ParcelLayout[],
  crops: readonly string[],
  states: FarmStates,
  region: Region,
  resolved: { readonly owner: Int32Array; readonly ground: Int32Array },
  blocks: StructureBlock[],
  props: FarmPropSpec[],
): ReadonlySet<number> {
  const { parcels, job } = sow;
  const trodden = new Set<number>();
  if (parcels.length === 0) return trodden;
  const used = new Set<number>();
  let placed = 0;
  /**
   * The scrap of bare ground a prop stands on, cleared before the rows exist.
   *
   * Sized from the prop's own footprint and a ring beyond it, because
   * `planPropPlacement` lays a prop's rectangle out from the target column
   * rather than around it, and takes the first candidate that fits: on the level
   * ground of a field, that candidate is the target column itself, and the
   * cleared patch is therefore exactly the ground the prop will cover.
   */
  const tread = (site: { readonly x: number; readonly z: number }, span: number): void => {
    for (let dz = -1; dz <= span; dz++) {
      for (let dx = -1; dx <= span; dx++) {
        const x = site.x + dx;
        const z = site.z + dz;
        if (!inside(region, x, z)) continue;
        trodden.add(index(region, x, z));
      }
    }
  };

  // The cart, on the headland of the parcel nearest the yard.
  let nearest = 0;
  for (let i = 1; i < parcels.length; i++) {
    const a = chebyshev((parcels[i] as FarmParcelPlan).rect, sow.yard);
    const b = chebyshev((parcels[nearest] as FarmParcelPlan).rect, sow.yard);
    if (a < b) nearest = i;
  }
  const cart = columnOfKind(
    parcels[nearest] as FarmParcelPlan,
    layouts[nearest] as ParcelLayout,
    "headland",
    sow.intents[nearest] as number,
    region,
    resolved,
  );
  if (cart !== undefined) {
    used.add(nearest);
    placed++;
    tread(cart, propSpan("cart"));
    props.push({
      nodePath: `${job.nodePath}.cart`,
      prop: "cart",
      params: { at: { x: cart.x, z: cart.z } },
    });
  }

  // The scarecrow, on a baulk of a sown parcel — drawn on channel 36 over the
  // eligible parcels, keyed on the holding's own gate corner so that adding a
  // field somewhere else does not move it.
  const sownParcels = parcels
    .map((_, i) => i)
    .filter((i) => !used.has(i) && (layouts[i] as ParcelLayout).fallow === false && crops[i] !== "pasture");
  if (placed < MAX_HOLDING_PROPS && sownParcels.length > 0) {
    const pick = sownParcels[
      positionInt(job.seed, sow.yard.x0, CHANNEL_PROP, sow.yard.z0, 0, sownParcels.length - 1)
    ] as number;
    const site = columnOfKind(
      parcels[pick] as FarmParcelPlan,
      layouts[pick] as ParcelLayout,
      "baulk",
      sow.intents[pick] as number,
      region,
      resolved,
    );
    if (site !== undefined) {
      used.add(pick);
      placed++;
      tread(site, propSpan("scarecrow"));
      props.push({
        nodePath: `${job.nodePath}.scarecrow`,
        prop: "scarecrow",
        params: { at: { x: site.x, z: site.z } },
      });
    }
  }

  // The hay, in the corner of the first rested or grazed field.
  if (placed < MAX_HOLDING_PROPS) {
    for (let i = 0; i < parcels.length; i++) {
      if (used.has(i)) continue;
      if (!(layouts[i] as ParcelLayout).fallow && crops[i] !== "pasture") continue;
      const corner = columnOfKind(
        parcels[i] as FarmParcelPlan,
        layouts[i] as ParcelLayout,
        "headland",
        sow.intents[i] as number,
        region,
        resolved,
      );
      if (corner === undefined) continue;
      blocks.push({ x: corner.x, y: corner.y + 1, z: corner.z, stateId: states.hay });
      blocks.push({ x: corner.x, y: corner.y + 2, z: corner.z, stateId: states.hay });
      // The hay is two blocks and has no prop generator behind it.
      tread(corner, 1);
      used.add(i);
      break;
    }
  }
  return trodden;
}


/**
 * The first column of a parcel of the given kind that the parcel actually won,
 * in (z, x) order — a total order, so which column a prop stands on is a fact
 * about the field rather than about the loop.
 */
function columnOfKind(
  parcel: FarmParcelPlan,
  layout: ParcelLayout,
  want: CellKind,
  mine: number,
  region: Region,
  resolved: { readonly owner: Int32Array; readonly ground: Int32Array },
): { readonly x: number; readonly z: number; readonly y: number } | undefined {
  const rect = parcel.rect;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(region, x, z)) continue;
      const idx = index(region, x, z);
      if (resolved.owner[idx] !== mine) continue;
      if (cellKind(x, z, rect, layout) !== want) continue;
      return { x, z, y: resolved.ground[idx] as number };
    }
  }
  return undefined;
}

/** The widest side of a prop's footprint, in columns. */
function propSpan(prop: "cart" | "scarecrow"): number {
  const size = propFootprint(prop, {}).size;
  return Math.max(size[0] as number, size[2] as number);
}
