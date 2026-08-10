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
 * This is **WP-1**: the node exists, the solver seats it, its params are read
 * and defaulted in one place, and every holding gets a report row. **No blocks
 * are emitted and no ground is claimed** — the gentle-ground scan and the
 * packing loop are WP-2 (`farm.parcel`, rank 125), the rows and crops are WP-3,
 * the yard and the seams are WP-4. Every count on the report row that those
 * work packages will fill is present and zero, so a report written today and a
 * report written after WP-3 have the same shape, and so that the proof that
 * this pass ran is the row rather than a block count.
 *
 * The reach law (§2) holds trivially here: with no farm node there are no jobs,
 * the caller does not build a result at all, and nothing downstream changes.
 */

import {
  FARM_PARAM_DEFAULTS,
  FARM_PARAM_RANGES,
  FARM_CROPS,
  type FarmEdge,
  type LoamDiagnostic,
  type PortDeclaration,
} from "@terrainist/spec";
import type { Seed256 } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import type { Placement } from "../layout/types.js";

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

/** One holding's row in `report.farms[]` (`docs/FARM-PLAN-v0.md` §12). */
export interface FarmReportRow {
  readonly nodePath: string;
  readonly id: string;
  /** The footprint the solver seated the holding on. */
  readonly envelope: Rect;
  readonly settings: FarmSettings;
  /** Parcels asked for — the crop-circle rule's left-hand side. */
  readonly parcelsRequested: number;
  /** Parcels seated. Zero until WP-2 packs them. */
  readonly parcelsSeated: number;
  /** Why the refused cells were refused, by reason. Empty until WP-2. */
  readonly refusals: Readonly<Record<string, number>>;
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
 * Lay out every holding.
 *
 * WP-1: one report row per placed holding, no blocks, no claims, no
 * diagnostics — a holding that seats no field is `LOAM-W500`'s business and
 * there is no seating yet, so saying anything now would be saying it twice.
 */
export function buildFarms(input: FarmPassInput): FarmPassResult {
  const farms: FarmReportRow[] = [];
  for (const job of input.jobs) {
    const settings = farmSettings(job.params);
    farms.push({
      nodePath: job.nodePath,
      id: job.placement.id,
      envelope: job.placement.footprint,
      settings,
      parcelsRequested: settings.parcels,
      parcelsSeated: 0,
      refusals: {},
      crops: [],
      farmstead: [],
      columnsClaimed: 0,
      parcelWalls: 0,
      portAnchor: job.nodePath,
    });
  }
  return {
    blocks: [],
    farms,
    diagnostics: [],
    stats: { holdings: farms.length, farmParcels: 0, farmColumns: 0 },
  };
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
