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
  /** Maximal horizontal runs of the bench, one row tall — see `maskRuns`. */
  readonly runs: readonly Rect[];
  /** The level every column of the bench is cut or filled to. */
  readonly level: number;
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
