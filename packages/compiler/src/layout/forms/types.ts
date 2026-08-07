/**
 * The urban-form contract (`docs/URBAN-FORMS-v0.md` §2).
 *
 * An **urban form** is a named street-skeleton generator. Everything downstream
 * of the skeleton — blocks, lots, frontage seating, landmark claiming, infill,
 * the street surfacer — is shared and knows nothing about which form drew the
 * lines, which is precisely why the plugin boundary is here and not deeper.
 *
 * A form is handed a {@link FormContext} and returns a {@link FormResult}. It
 * writes **no geometry**: it produces a graph, masks, levels and channel
 * declarations, and the existing structure passes turn those into blocks.
 */

import type { DistrictDensity, DistrictFabric } from "@terrainist/spec";
import type { Seed256 } from "@terrainist/stdlib";

import type { Point2, Rect } from "../frames.js";
import type { EdgeUse, SeamTreatment } from "../levels.js";
import type { StreetGraph } from "../streets.js";

/* -------------------------------------------------------------------------- */
/* what a form is asked to draw on                                             */
/* -------------------------------------------------------------------------- */

/**
 * The ground, read through accessors rather than raw arrays.
 *
 * Accessors are deliberate and the design says so twice: the domain is not the
 * field's region and is not the plan's region, `city.ts` already carries a
 * comment about how expensive that particular confusion is, and one accessor
 * object built once by the caller removes the whole class of index bug from six
 * form modules. **No form gets a `Float64Array`.**
 */
export interface GroundSample {
  /** Rounded height at a world column. Clamped to the domain's edge outside it. */
  height(x: number, z: number): number;
  /** True where the column holds ocean or lake water. */
  water(x: number, z: number): boolean;
  /** Largest absolute height difference to a 4-neighbour, in blocks. */
  slope(x: number, z: number): number;
  /** Height range over the domain, precomputed once by the caller. */
  readonly relief: number;
  /** Composed sea level, when the document has terrain. */
  readonly seaLevel?: number;
  /**
   * False when the pass's field was levelled under this domain by a pad.
   *
   * A form that reads contours must refuse rather than draw a flat imitation of
   * itself; this is how it knows.
   */
  readonly levelled: boolean;
  /** Chebyshev distance from the domain's edge to the nearest water column. */
  readonly waterReach: number;
}

/** Something a plan can be about. */
export interface FormFocus {
  readonly kind: "plaza" | "gate" | "landmark" | "terminus" | "water";
  readonly at: Point2;
  /** Heading the approach runs on, degrees, 0 = +Z, quantised to 15. */
  readonly heading?: number;
  /** Child node id, when `kind` is `"landmark"`. */
  readonly id?: string;
  /** 0..1; the caller's confidence that this is the centre of the place. */
  readonly weight: number;
}

/**
 * One rung of the composition replan ladder (`docs/SITE-PLAN-v0.md` §3.1, §6.3).
 *
 * A plan is a pure function of `(FormContext, PlanAttempt)`, and round 0 is
 * `{ 0, 0, 0 }` — which is what every form that ignores the field draws. Only
 * `hillside` reads it, so its presence moves nothing else.
 */
export interface PlanAttempt {
  /** 0 for the first plan; 1 and 2 are the ladder's rungs. */
  readonly round: number;
  /**
   * Principal streets taken off the ceiling before selection.
   *
   * `MAX_PRINCIPAL_STREETS − dropStreets`, floored at `MIN_PRINCIPAL_STREETS`:
   * fewer streets is fewer platforms, fewer edges and less wall, and the streets
   * that go are by construction the ones commanding the least frontage.
   */
  readonly dropStreets: number;
  /** Columns taken off every strip's `D_target`. A shallower terrace cuts less. */
  readonly narrowBy: number;
}

/** The first plan: full ceiling, full depth (`docs/SITE-PLAN-v0.md` §3.1). */
export const ROUND_ZERO: PlanAttempt = Object.freeze({ round: 0, dropStreets: 0, narrowBy: 0 });

/** What a form is asked to draw on. */
export interface FormContext {
  /** Inclusive footprint — the tight bounding box of the domain. */
  readonly bounds: Rect;
  /**
   * 1 inside the domain, row-major over `bounds`.
   *
   * **Absent for an authored rectangular district, and its absence is
   * load-bearing** (§5): the unmasked, unrotated path through the axial forms is
   * byte-for-byte the one fabric v2 shipped.
   */
  readonly mask?: Uint8Array;
  /** Local frame rotation about the bounds centre, degrees, quantised to 15. */
  readonly orientation?: number;
  /** `nodeSeed(worldSeed, districtPath, seedSalt)`. */
  readonly seed: Seed256;
  /** Preferred centre-line spacing, in blocks. Already defaulted and fanned out. */
  readonly blockSize: number;
  /** Verge per side, in columns. Already defaulted and fanned out. */
  readonly sidewalk: number;
  readonly density: DistrictDensity;
  /** The ground under the domain. See {@link GroundSample}. */
  readonly ground: GroundSample;
  /** Points the plan may organise itself around, in a fixed order. */
  readonly focus: readonly FormFocus[];
  /**
   * A reserved route corridor crossing the domain, clipped to it — the
   * centreline of a `road.network@0` reservation or of a city arterial that
   * borders the cell. Cell by cell, 4-connected. Read by `linear`.
   */
  readonly corridor?: readonly Point2[];
  /**
   * Which rung of the replan ladder this is (`docs/SITE-PLAN-v0.md` §6.3).
   *
   * Absent means {@link ROUND_ZERO}. Read only by `hillside`; every other form
   * draws the same plan whatever it says, which is why the ladder can be a loop
   * in `layDistrict` rather than a branch in seven modules.
   */
  readonly attempt?: PlanAttempt;
}

/* -------------------------------------------------------------------------- */
/* what a form returns                                                         */
/* -------------------------------------------------------------------------- */

/** Ground no lot may take: a place, a market, a basin, a hub. */
export interface FormReservation {
  readonly rect: Rect;
  /** Offer this ground to the named district child before any other claim. */
  readonly for?: string;
  /** One line, for the report: "the round-point at the head of four radials". */
  readonly why: string;
}

/** A level platform the caller turns into `PadEdit`s. */
export interface FormBench {
  /**
   * A name for the report, e.g. `"contour.3"`. Optional and read by nothing
   * else: a bench's *identity* is its index in the form's list, which is what
   * `layout/levels.ts` turns into a platform index.
   */
  readonly id?: string;
  /** Maximal horizontal runs of the bench, one row tall — see `maskRuns`. */
  readonly runs: readonly Rect[];
  /** The level every column of the bench is cut or filled to. */
  readonly level: number;
}

/**
 * A band of buildable frontage a site planner cut beside one street
 * (`docs/SITE-PLAN-v0.md` §3.4, amending `docs/URBAN-FORMS-v0.md` §2.2
 * additively).
 *
 * **Absent for every form but `hillside`**, so nothing else sees a change. Its
 * one consumer is the frontage lot walk in `layout/frontage.ts`, which replaces
 * `blocksOf` → `rectsOf` → `largestFreeRect` → `subdivide` for the columns
 * inside a strip and for nothing else.
 *
 * The boundary is **irregular on both edges** — deep where the ground is flat,
 * absent where it steepens — and that irregularity is the feature. A rectangle
 * would be a bench.
 */
export interface FormStrip {
  /** The {@link StreetSegment} id this strip fronts. */
  readonly street: string;
  /** The strip's index in the plan; the lot ids are cut from it. */
  readonly index: number;
  /** The level the strip's platform is cut or filled to. */
  readonly level: number;
  /** Stations along the build-to line — the strip's arc length, in columns. */
  readonly stations: number;
  /**
   * Which station of the build-to line a column belongs to, `−1` off the strip.
   * Row-major over `FormContext.bounds`.
   *
   * Assigned by a breadth-first walk out from the street rather than by marching
   * a ray per station: a ray per station **aliases** on any run that is not axis
   * aligned — adjacent rays diverge and leave unhit columns between them — and
   * the resulting comb has almost no inscribed rectangle in it, which is the
   * defect the frontage walk exists to remove rather than to reintroduce.
   */
  readonly station: Int32Array;
  /** Columns back from the build-to line, `−1` off the strip. */
  readonly depth: Int32Array;
  /** The unit outward normal at each station — the way a lot grows. */
  readonly outward: readonly Point2[];
  /** 1 on a column this strip claimed, row-major over `FormContext.bounds`. */
  readonly columns: Uint8Array;
}

/**
 * A transition a site planner planned, rather than one a downstream pass
 * derived (`docs/SITE-PLAN-v0.md` §5.1, §5.4).
 *
 * **Absent for every form but `hillside`**, so nothing else sees a change.
 *
 * §5.4's normative sentence is the reason this type exists at all:
 *
 * > Every planned strip MUST declare its **cut** edge as a `PlannedEdge` with
 * > `side: "cut"`.
 *
 * The cut edge — the uphill one, where the platform has been cut *into* the hill
 * and natural ground stands above it — is the edge nothing owned. `levelSeams`
 * ignores it (natural ground is not a platform and takes part in no seam),
 * `skirtSeams` ignores it (it only claims neighbours whose ground is *below* the
 * platform top), and on a quarter with 100 % platform coverage it did not exist,
 * because the uphill side of every bench was the bench above. A site planner
 * leaves most of the hill alone, so the cut edge becomes the most common edge in
 * the quarter — and unowned it ships as a vertical band of raw soil behind every
 * terrace.
 *
 * **v0 declares the cut side and derives the fill side**, which amends §5.1; the
 * WP-3 amendment there records the measurement. In one sentence: a fill edge's
 * context includes buildings and finished ground, neither of which exists when
 * the planner runs, so its treatment is chosen by the pass that has them — from
 * the same {@link treatmentForEdge} table.
 */
export interface PlannedEdge {
  /** The {@link FormStrip.index} this edge belongs to, or `−1` for a bench edge. */
  readonly strip: number;
  /** The bench (platform index) whose face this is. */
  readonly bench: number;
  /** §5.4: the fill edge is the downhill one, the cut edge the uphill one. */
  readonly side: "cut" | "fill";
  /**
   * The columns of the edge, 8-connected, in row-major order.
   *
   * For a **cut** edge these are the columns of natural hillside standing above
   * the platform — the face itself, and the same set `faceCuts` finishes — so
   * "the treatments partition the edge columns exactly" (§5.4) is a statement
   * about ground somebody can point at.
   */
  readonly cells: readonly Point2[];
  /** Blocks of fall across the face. */
  readonly drop: number;
  readonly treatment: SeamTreatment;
  readonly adjacentUse: EdgeUse;
  readonly access: "public" | "private";
  /** One line, for the report: `"cut, 4 blocks over 61 columns, natural"`. */
  readonly why: string;
}

/** Dug water, for the canal pass. */
export interface FormChannel {
  /** The {@link StreetSegment} id whose role is `"channel"`. */
  readonly segment: string;
  /** The water top; one below the quay. */
  readonly surfaceY: number;
  /** Columns of water under the surface. */
  readonly depth: number;
}

/**
 * What the form actually did, for the compile report.
 *
 * Carried on `DistrictProduct.form`, so a fallback is legible in the **final**
 * report and not only in a compile-feedback round: `id !== requested` plus
 * `fellBackBecause` is the whole story, in one object, per quarter.
 */
export interface FormRecord {
  readonly id: DistrictFabric;
  /** What the document (or the fan-out row) asked for. */
  readonly requested: DistrictFabric;
  /** Present when `id !== requested`: the measured reason. */
  readonly fellBackBecause?: string;
  /** Knobs the form moved from what it was handed, e.g. "spokes 8 → 6". */
  readonly adapted: readonly string[];
  /** Inputs the form deliberately ignored, e.g. "orientation (contour-led)". */
  readonly ignored: readonly string[];
}

/** Everything a form produces. */
export interface FormPlan {
  /** The pinned F4 / road-pass contract, unchanged. */
  readonly graph: StreetGraph;
  /**
   * 1 where the fabric may cut lots, row-major over `bounds`.
   *
   * ANDed with the caller's own lot mask. Absent means "anywhere the streets
   * left free", which is what every form but `linear` says.
   */
  readonly lotMask?: Uint8Array;
  /** Ground no lot may take: a place, a market, a basin, a hub. */
  readonly reservations?: readonly FormReservation[];
  /**
   * Level platforms, in a fixed order. The caller turns each into `PadEdit`s
   * and seats every building whose lot falls inside one at that level.
   */
  readonly benches?: readonly FormBench[];
  /** Dug water, for the canal pass. Empty for every other form. */
  readonly channels?: readonly FormChannel[];
  /**
   * The frontage geometry a site planner cut (`docs/SITE-PLAN-v0.md` §3.4).
   *
   * Present only on a `hillside` plan. Its presence is the gate on the frontage
   * lot walk in `layout/district.ts`, so no other form moves.
   */
  readonly strips?: readonly FormStrip[];
  /**
   * The transitions a site planner planned (`docs/SITE-PLAN-v0.md` §5).
   *
   * Present only on a `hillside` plan, and v0 carries its **cut** edges (§5.4).
   */
  readonly edges?: readonly PlannedEdge[];
  /** What the form actually did, for the compile report. */
  readonly record: FormRecord;
}

/** A drawn plan, or the measured reason there is none. */
export type FormResult =
  | { readonly ok: true; readonly plan: FormPlan }
  | {
      /** What was measured, in the author's terms. */
      readonly ok: false;
      readonly reason: string;
      /** What to change in the document. Never "loosen your constraints". */
      readonly fix: string;
      /** The form to draw instead, or `null` to refuse the quarter outright. */
      readonly fallback: DistrictFabric | null;
    };

/* -------------------------------------------------------------------------- */
/* the plugin                                                                  */
/* -------------------------------------------------------------------------- */

/** What the registry checks before `draw` is called. */
export interface FormRequirements {
  /** Shortest axis of the domain's bounding box the form can work in. */
  readonly minSpan: number;
  /** Height range the domain must have. Only `terraced` sets it above 0. */
  readonly minRelief?: number;
  /** The form reads contours and must not be given levelled ground. */
  readonly unlevelled?: boolean;
  /**
   * The form can be drawn into a masked, rotated, non-rectangular domain.
   *
   * **Every shipped form sets this true.** The field exists so that a form which
   * cannot is forced to say so at registration rather than producing carriageway
   * outside its cell, and so the registry can refuse to offer it to a city cell
   * instead of discovering the problem in the physics lint.
   */
  readonly polygon: boolean;
  /** The form drawn instead when a requirement is unmet; `null` refuses. */
  readonly fallback: DistrictFabric | null;
}

/** One urban form. */
export interface UrbanForm {
  readonly id: DistrictFabric;
  /** Checked by the registry before {@link UrbanForm.draw} is called. */
  readonly requires: FormRequirements;
  /** One paragraph, printed by `terrainist forms`. */
  readonly describe: string;
  draw(ctx: FormContext): FormResult;
}

/* -------------------------------------------------------------------------- */
/* helpers every form and every caller wants                                   */
/* -------------------------------------------------------------------------- */

/** A {@link FormRecord} for a form that drew what it was asked for. */
export function drewAsAsked(
  id: DistrictFabric,
  extra?: { readonly adapted?: readonly string[]; readonly ignored?: readonly string[] },
): FormRecord {
  return {
    id,
    requested: id,
    adapted: extra?.adapted ?? [],
    ignored: extra?.ignored ?? [],
  };
}

/**
 * A {@link GroundSample} over ground nobody measured.
 *
 * Flat, dry, levelled, no sea. The honest answer for a caller that has no
 * height field — `buildStreetGraph`'s callers and every skeleton test — and
 * `levelled: true` is what makes a contour-reading form refuse it rather than
 * draw a flat imitation of itself.
 */
export function flatGround(): GroundSample {
  return {
    height: () => 0,
    water: () => false,
    slope: () => 0,
    relief: 0,
    levelled: true,
    waterReach: Number.POSITIVE_INFINITY,
  };
}
