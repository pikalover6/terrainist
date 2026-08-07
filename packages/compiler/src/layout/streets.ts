/**
 * The street skeleton — fabric v2, F1.
 *
 * The inversion this file exists for: **the void defines the solid.** Every
 * settlement the solver built before it was a bag of buildings with pairwise
 * constraints, which is how you get correct buildings sprinkled on a lawn. A
 * district instead gets its *streets* first; the streets cut the ground into
 * blocks; the blocks subdivide into lots; and a building is a thing that stands
 * on a lot with its door on the street. Nothing here places anything — this
 * module only draws the void.
 *
 * {@link StreetGraph} is the pinned cross-team contract (`docs/DESIGN.md`,
 * "Fabric v2 + precincts"): F1 produces it, F4's streetscape dresses it, and
 * the road pass surfaces it. Blocks and lots are deliberately **not** in it —
 * they are F1's private working state, and exporting them would freeze a
 * subdivision scheme that is going to change.
 *
 * Determinism: every number below is either arithmetic on the district's
 * bounds, a draw from `Rng(streamSeed(districtSeed, "…"))` taken in a fixed
 * order, or a positional hash keyed on a world column. There is no
 * `Math.random`, no wall clock, and no map-iteration order in any decision.
 */

import type { DistrictDensity, DistrictFabric } from "@terrainist/spec";
import type { Seed256 } from "@terrainist/stdlib";

import { headingOf, type Point2, type Rect } from "./frames.js";
import { drawFabric } from "./forms/registry.js";
import { flatGround } from "./forms/types.js";

/*
 * The **construction** moved to `forms/axial.ts` when the urban-form registry
 * landed, with its bodies untouched (`docs/URBAN-FORMS-v0.md` §5.1). What stays
 * here is the pinned contract — the graph types every downstream pass reads —
 * and the three functions that consume a graph. Every name the construction
 * exported is re-exported below, so no import site in the tree moved.
 */
export {
  AVENUE_EVERY,
  BLOCK_SIZE_BY_DENSITY,
  GRID_JITTER,
  MIN_BLOCK_SPACING,
  MIN_CLIPPED_RUN,
  MIN_DISTRICT_SPAN,
  ORGANIC_AMPLITUDE,
  ORGANIC_WAVELENGTH,
  SIDEWALK_BY_DENSITY,
  STREET_WIDTH,
  TRIG_15,
  TRIG_SCALE,
  densify4,
  intersectionsOf,
  quantizeHeading,
  rotateOffset,
  runsOf,
  snapHeading,
} from "./forms/axial.js";

/* -------------------------------------------------------------------------- */
/* the pinned contract                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One street, a 4-connected polyline in world column space.
 *
 * `path` is the **carriageway centre line, cell by cell**: consecutive entries
 * differ by exactly one block on exactly one axis, so a consumer can walk it
 * without interpolating. The surfaced carriageway is `width` columns wide,
 * centred on that line and laid perpendicular to the local heading.
 */
export interface StreetSegment {
  readonly id: string;
  /** Width class: avenue 7, street 5, lane 3 (carriageway columns). */
  readonly kind: "avenue" | "street" | "lane";
  readonly width: number;
  readonly path: readonly { readonly x: number; readonly z: number }[];
  /**
   * What is *in* the width — absent means `"carriageway"`, which is every
   * segment every form but `canal` and `terraced` draws.
   *
   * The street surfacer dispatches on this and nothing else does: a channel is
   * a street whose carriageway is water, and a flight of steps is a street the
   * tread law lays instead of the grader. Optional, and the absent case is the
   * code that runs today — see §5.7.
   */
  readonly role?: "carriageway" | "channel" | "steps";
}

/** Where two or more segments meet. */
export interface StreetIntersection {
  readonly x: number;
  readonly z: number;
  readonly segments: readonly string[]; // segment ids meeting here
}

/** A district's street skeleton. */
export interface StreetGraph {
  readonly segments: readonly StreetSegment[];
  readonly intersections: readonly StreetIntersection[];
  /** Sidewalk band width per side (columns); 2 downtown, 1 elsewhere. */
  readonly sidewalk: number;
}

/* -------------------------------------------------------------------------- */
/* the pre-registry entry point, kept                                          */
/* -------------------------------------------------------------------------- */

/** What {@link buildStreetGraph} needs. */
export interface StreetGraphInput {
  /** The district's inclusive footprint, in world columns. */
  readonly bounds: Rect;
  readonly fabric: DistrictFabric;
  /** `nodeSeed(worldSeed, districtPath, seedSalt)`. */
  readonly seed: Seed256;
  /** Preferred centre-line spacing, in blocks. */
  readonly blockSize: number;
  /** Sidewalk band per side, in columns. */
  readonly sidewalk: number;
  /**
   * 1 = inside; a segment leaving the mask **ends there** (C1).
   *
   * Row-major over {@link StreetGraphInput.bounds}. Absent for an authored
   * rectangular district, and its absence is load-bearing: the unmasked,
   * unrotated construction is byte-for-byte the one fabric v2 shipped.
   *
   * The dead ends and T-junctions this produces are the point, not a defect.
   * A grid clipped to an arbitrary polygon is what a real quarter looks like
   * where a boulevard cut across it, and a segment that simply stops at the
   * cell edge is a street that meets the boulevard.
   */
  readonly mask?: Uint8Array;
  /**
   * Local grid rotation about the bounds centre, degrees, quantised to 15.
   *
   * Only 0…75 are meaningful — a square grid is symmetric under a quarter
   * turn — and 0 (or absent) keeps the world-axis construction.
   */
  readonly orientation?: number;
  /** Density, for the forms that read it. Defaults to `"medium"`. */
  readonly density?: DistrictDensity;
}

/** Why a district could not be given a skeleton. */
export interface StreetGraphFailure {
  readonly ok: false;
  readonly reason: string;
  readonly fix: string;
}

/** A skeleton, or the reason there is none. */
export type StreetGraphResult = { readonly ok: true; readonly graph: StreetGraph } | StreetGraphFailure;

/**
 * Draw a district's street skeleton — **the pre-registry entry point, kept.**
 *
 * A thin wrapper over `drawFabric` that returns only the graph. It keeps its
 * signature and its behaviour so that every existing caller and every existing
 * test works unmodified, which is most of the review confidence in the identity
 * argument (§5.3). Anything that wants the rest of a {@link FormPlan} — a lot
 * mask, a reservation, a bench, a channel, the {@link FormRecord} — calls
 * `drawFabric` instead; that is what the fabric pass does.
 *
 * The ground handed to the form here is {@link flatGround}: this entry point has
 * no height field, and saying so honestly is what makes a contour-reading form
 * refuse rather than draw a flat imitation of itself.
 */
export function buildStreetGraph(input: StreetGraphInput): StreetGraphResult {
  const drawn = drawFabric({
    bounds: input.bounds,
    fabric: input.fabric,
    seed: input.seed,
    blockSize: input.blockSize,
    sidewalk: input.sidewalk,
    density: input.density ?? "medium",
    ground: flatGround(),
    focus: [],
    nodePath: "",
    ...(input.mask === undefined ? {} : { mask: input.mask }),
    ...(input.orientation === undefined ? {} : { orientation: input.orientation }),
  });
  if (!drawn.ok) return { ok: false, reason: drawn.refusal.reason, fix: drawn.refusal.fix };
  return { ok: true, graph: drawn.outcome.plan.graph };
}

/* -------------------------------------------------------------------------- */
/* consuming the skeleton                                                      */
/* -------------------------------------------------------------------------- */

/** A cell with the segment that claims it and the local heading there. */
export interface StreetCell {
  readonly x: number;
  readonly z: number;
  readonly segment: string;
  /** Perpendicular unit vector, for the carriageway band. */
  readonly px: number;
  readonly pz: number;
}

/**
 * Every carriageway column the graph claims, with the segment it belongs to.
 *
 * The band construction matches `surfaceRoute`'s exactly — offsets
 * `-half … width-1-half` perpendicular to the local heading — because the same
 * cells have to be surfaced by the road pass and kept clear by the lot
 * subdivision, and two different notions of "the street" is how a building ends
 * up half in the road.
 */
export function carriagewayCells(graph: StreetGraph, bounds?: Rect): StreetCell[] {
  const out: StreetCell[] = [];
  const seen = new Set<string>();
  for (const segment of graph.segments) {
    const half = (segment.width - 1) >> 1;
    for (const [i, cell] of segment.path.entries()) {
      const heading = headingOf(segment.path, i);
      for (let o = -half; o <= segment.width - 1 - half; o++) {
        const x = cell.x + heading.pz * o;
        const z = cell.z + heading.px * o;
        // Clipped, not clamped. Where a street turns, its band is laid on the
        // diagonal — which mitres the corner, and at the district edge would
        // otherwise spill one column into the neighbour. A street belongs to
        // exactly one district and stops at its line.
        if (bounds !== undefined && (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1)) {
          continue;
        }
        const key = `${x},${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x, z, segment: segment.id, px: heading.px, pz: heading.pz });
      }
    }
  }
  return out;
}

/**
 * The local heading and its perpendicular at index `i` of a path.
 *
 * Moved to `layout/frames.ts` — the leaf module — so a form may read the same
 * rule without a cycle back through the registry, and re-exported here because
 * this is where every existing consumer imports it from.
 */
export { headingOf } from "./frames.js";

/**
 * The endpoints of every street on the district boundary.
 *
 * The inter-district road pass's anchor list: a lane arriving from the next
 * district should meet a street where the street already ends, not somewhere
 * convenient.
 *
 * `mask` extends the same idea to a C1 cell, whose boundary is a polygon rather
 * than the bounds rectangle: a clipped street ends *inside* the bounds, on the
 * mask edge, and that end is exactly the T-junction onto the arterial. Without
 * this the cell's whole street network would look interior and the road pass
 * would have nothing to anchor to — which is the invariant that makes a city's
 * connectivity structural rather than something to be checked for afterwards.
 */
export function boundaryEndpoints(graph: StreetGraph, bounds: Rect, mask?: Uint8Array): Point2[] {
  const out: Point2[] = [];
  const stride = bounds.x1 - bounds.x0 + 1;
  const outside = (x: number, z: number): boolean => {
    if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return true;
    if (mask === undefined) return false;
    return mask[(z - bounds.z0) * stride + (x - bounds.x0)] !== 1;
  };
  const onEdge = (p: Point2): boolean =>
    p.x <= bounds.x0 ||
    p.x >= bounds.x1 ||
    p.z <= bounds.z0 ||
    p.z >= bounds.z1 ||
    outside(p.x + 1, p.z) ||
    outside(p.x - 1, p.z) ||
    outside(p.x, p.z + 1) ||
    outside(p.x, p.z - 1);
  for (const segment of graph.segments) {
    const first = segment.path[0];
    const last = segment.path[segment.path.length - 1];
    if (first !== undefined && onEdge(first)) out.push(first);
    if (last !== undefined && onEdge(last)) out.push(last);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the F4 seam                                                                 */
/* -------------------------------------------------------------------------- */

/** What the streetscape pass will be handed. */
export interface DressStreetsContext {
  /** The district's footprint. */
  readonly bounds: Rect;
  /** 1 for a carriageway column, indexed over `bounds`. */
  readonly carriageway: Uint8Array;
  /** 1 for a sidewalk column, indexed over `bounds`. */
  readonly sidewalk: Uint8Array;
  /** `nodeSeed(worldSeed, districtPath)`. */
  readonly seed: Seed256;
}

/**
 * Dress a district's streets — **F4 fills this in**.
 *
 * A deliberate no-op and the merge seam between F1 and F4: curbs, sidewalk
 * paving, lamp posts at fixed spacing, crossings at the intersections and the
 * street furniture a district type implies are all F4's, and all of them are
 * derivable from the two arguments here. F1's contract is that this is called
 * once per district, after the carriageway is surfaced and before the props
 * pass, with the graph and the masks it drew.
 */
export function dressStreets(_graph: StreetGraph, _ctx: DressStreetsContext): void {
  // F4: streetscape. Intentionally empty until then — see the doc comment.
}
