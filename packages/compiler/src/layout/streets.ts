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

import { Rng, positionInt, streamSeed, type Seed256 } from "@terrainist/stdlib";

import { clampInt, type Point2, type Rect } from "./frames.js";

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
/* widths + spacing                                                            */
/* -------------------------------------------------------------------------- */

/** Carriageway width per class, in columns. */
export const STREET_WIDTH: Readonly<Record<StreetSegment["kind"], number>> = Object.freeze({
  avenue: 7,
  street: 5,
  lane: 3,
});

/** Every Nth line on an axis is an avenue rather than a street. */
export const AVENUE_EVERY = 3;

/** Sidewalk band per side, by density. Downtown gets two; a village gets one. */
export const SIDEWALK_BY_DENSITY: Readonly<Record<string, number>> = Object.freeze({
  high: 2,
  medium: 2,
  low: 1,
});

/** Default centre-line spacing per density, when the author gives no `blockSize`. */
export const BLOCK_SIZE_BY_DENSITY: Readonly<Record<string, number>> = Object.freeze({
  high: 34,
  medium: 42,
  low: 54,
});

/**
 * How far a grid line may wander from its nominal position, in blocks.
 *
 * Small on purpose. A grid whose lines jitter by half a block size is not a
 * jittered grid, it is an organic fabric that lied about its `fabric` — and the
 * whole reason `"grid"` exists is that a reader should be able to see the grid.
 */
export const GRID_JITTER = 3;

/** How far an organic street's centre line wanders from the nominal grid. */
export const ORGANIC_AMPLITUDE = 6;

/** Blocks between organic waypoints — the wavelength of the wander. */
export const ORGANIC_WAVELENGTH = 24;

/* -------------------------------------------------------------------------- */
/* building the skeleton                                                       */
/* -------------------------------------------------------------------------- */

/** What {@link buildStreetGraph} needs. */
export interface StreetGraphInput {
  /** The district's inclusive footprint, in world columns. */
  readonly bounds: Rect;
  readonly fabric: "grid" | "organic";
  /** `nodeSeed(worldSeed, districtPath, seedSalt)`. */
  readonly seed: Seed256;
  /** Preferred centre-line spacing, in blocks. */
  readonly blockSize: number;
  /** Sidewalk band per side, in columns. */
  readonly sidewalk: number;
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
 * The smallest district that can hold a fabric.
 *
 * Two crossing streets each side, one block of lots between them, and a
 * sidewalk band on every frontage. Below this the "district" is a crossroads,
 * and a crossroads is what the ordinary solver plus `road.network@0` is for.
 */
export const MIN_DISTRICT_SPAN = 2 * (STREET_WIDTH.street + 2 * 2) + 20;

/**
 * Closest two street centre lines are ever drawn, in blocks.
 *
 * The same number as the profile's `DISTRICT_MIN_BLOCK`, restated here because
 * this module is the one that enforces it: an avenue plus two sidewalks is
 * eleven columns, so sixteen leaves an alley of block between two of them —
 * a medieval quarter, and the tightest fabric worth drawing.
 */
export const MIN_BLOCK_SPACING = 16;

/**
 * Draw a district's street skeleton.
 *
 * Both fabrics come from the same construction — a set of line positions per
 * axis, each line spanning the district edge to edge — because both are grids;
 * `"organic"` is a grid that has been let go of. Spanning edge to edge is what
 * makes every street reach the district boundary, which is what lets the
 * inter-district road pass pick the ends up as anchors, and it is also why grid
 * connectivity is structural rather than something to be checked for.
 */
export function buildStreetGraph(input: StreetGraphInput): StreetGraphResult {
  const { bounds, sidewalk } = input;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;

  if (width < MIN_DISTRICT_SPAN || depth < MIN_DISTRICT_SPAN) {
    return {
      ok: false,
      reason: `a district needs at least ${MIN_DISTRICT_SPAN} blocks on each axis to hold two crossing streets and a block of lots between them; this one is ${width} × ${depth}`,
      fix: `grow "envelope.size" to at least [${MIN_DISTRICT_SPAN}, ${MIN_DISTRICT_SPAN}] — or express this as ordinary building.grammar@0 nodes with constraints, which is what the solver is for below district scale`,
    };
  }

  const spacing = Math.max(MIN_BLOCK_SPACING, input.blockSize);
  const jitter = new Rng(streamSeed(input.seed, "layout"));

  // Lines first, both axes, in a fixed order (x then z) so a district's grid
  // does not move when an unrelated pass draws from the same node seed.
  const xLines = linePositions(bounds.x0, bounds.x1, spacing, input.fabric, jitter, sidewalk);
  const zLines = linePositions(bounds.z0, bounds.z1, spacing, input.fabric, jitter, sidewalk);
  if (xLines.length < 2 || zLines.length < 2) {
    return {
      ok: false,
      reason: `a ${width} × ${depth} district at blockSize ${input.blockSize} yields ${xLines.length} × ${zLines.length} streets; a fabric needs at least two on each axis`,
      fix: `lower "params.blockSize" (or drop it and let the density choose) so the streets fit, or grow "envelope.size"`,
    };
  }

  const wander = streamSeed(input.seed, "jitter");
  const segments: StreetSegment[] = [];
  for (const [i, x] of xLines.entries()) {
    segments.push(
      lineSegment(`ns${i}`, classOf(i), true, x, bounds.z0, bounds.z1, bounds, input.fabric, wander, sidewalk),
    );
  }
  for (const [j, z] of zLines.entries()) {
    segments.push(
      lineSegment(`ew${j}`, classOf(j), false, z, bounds.x0, bounds.x1, bounds, input.fabric, wander, sidewalk),
    );
  }

  return { ok: true, graph: { segments, intersections: intersectionsOf(segments), sidewalk } };
}

/** Avenue every {@link AVENUE_EVERY} lines, street otherwise. */
function classOf(index: number): StreetSegment["kind"] {
  return index % AVENUE_EVERY === 0 ? "avenue" : "street";
}

/**
 * Centre-line positions along one axis.
 *
 * The first and last lines are inset by half a carriageway plus a sidewalk, so
 * the whole street — surface, verge and all — is inside the district. The
 * interior lines are spread evenly between them and then jittered; the jitter
 * is clamped so two lines can never cross or close the block between them.
 */
function linePositions(
  lo: number,
  hi: number,
  spacing: number,
  fabric: "grid" | "organic",
  rng: Rng,
  sidewalk: number,
): number[] {
  const inset = ((STREET_WIDTH.avenue - 1) >> 1) + sidewalk;
  const first = lo + inset;
  const last = hi - inset;
  if (last <= first) return [];

  const span = last - first;
  const gaps = Math.max(1, Math.round(span / spacing));
  const out: number[] = [];
  for (let k = 0; k <= gaps; k++) {
    const nominal = first + Math.round((k * span) / gaps);
    // Interior lines jitter; the two edge lines never do, because moving them
    // would take the street off the district and the skeleton's whole job at
    // the boundary is to be findable from outside.
    const amount = k === 0 || k === gaps ? 0 : fabric === "grid" ? GRID_JITTER : GRID_JITTER * 2;
    const offset = amount === 0 ? 0 : rng.int(-amount, amount);
    const room = Math.floor(span / gaps / 2) - STREET_WIDTH.avenue;
    const bounded = room <= 0 ? 0 : clampInt(offset, -room, room);
    out.push(clampInt(nominal + bounded, first, last));
  }
  // A jitter that collapsed two lines onto each other would produce a block of
  // zero depth, and every lot in it would be dropped. Enforce separation.
  for (let k = 1; k < out.length; k++) {
    const previous = out[k - 1] as number;
    if ((out[k] as number) - previous < STREET_WIDTH.avenue + 2) {
      out[k] = Math.min(last, previous + STREET_WIDTH.avenue + 2);
    }
  }
  return out.filter((v, k) => k === 0 || v > (out[k - 1] as number));
}

/**
 * One street, cell by cell.
 *
 * A grid line is straight. An organic line is the same line pushed sideways by
 * a positional hash sampled every {@link ORGANIC_WAVELENGTH} blocks and joined
 * with 4-connected steps — a positional hash rather than a stream draw so that
 * the wander of a street does not depend on how many streets were drawn before
 * it, which is what keeps the graph stable when the block size changes.
 */
function lineSegment(
  id: string,
  kind: StreetSegment["kind"],
  vertical: boolean,
  fixed: number,
  from: number,
  to: number,
  bounds: Rect,
  fabric: "grid" | "organic",
  wander: Seed256,
  sidewalk: number,
): StreetSegment {
  const lo = vertical ? bounds.x0 : bounds.z0;
  const hi = vertical ? bounds.x1 : bounds.z1;
  // The wander is bounded by what the *widest* street's carriageway and its
  // verge need, not by this street's own width: a lane that wandered to within
  // three columns of the edge would still be inside, and the next fabric to
  // reuse this function would not be.
  const inset = ((STREET_WIDTH.avenue - 1) >> 1) + sidewalk;
  const path: Point2[] = [];
  const cell = (cross: number, along: number): Point2 =>
    vertical ? { x: cross, z: along } : { x: along, z: cross };
  let previous = fixed;

  for (let t = from; t <= to; t++) {
    let target = fixed;
    if (fabric === "organic") {
      const anchor = Math.floor(t / ORGANIC_WAVELENGTH) * ORGANIC_WAVELENGTH;
      const next = anchor + ORGANIC_WAVELENGTH;
      const a = organicOffset(wander, id, anchor);
      const b = organicOffset(wander, id, next);
      const mix = (t - anchor) / ORGANIC_WAVELENGTH;
      target = fixed + Math.round(a + (b - a) * mix);
    }
    // Never let the wander take a street (or its verge) off the district.
    target = clampInt(target, lo + inset, hi - inset);
    if (t === from) {
      previous = target;
    } else {
      // 4-connected: the cross-axis walk happens at the *previous* step along
      // the line, so no two consecutive cells are diagonal neighbours.
      const step = target > previous ? 1 : -1;
      while (previous !== target) {
        previous += step;
        path.push(cell(previous, t - 1));
      }
    }
    path.push(cell(previous, t));
  }

  return { id, kind, width: STREET_WIDTH[kind], path };
}

/** The organic wander at one waypoint: a positional draw keyed on the line. */
function organicOffset(wander: Seed256, id: string, t: number): number {
  // The id is folded into the y slot, which is otherwise unused for a column
  // draw — two parallel streets must not wander in lockstep.
  let key = 0;
  for (let i = 0; i < id.length; i++) key = (key * 131 + id.charCodeAt(i)) | 0;
  return positionInt(wander, t, key, 0, -ORGANIC_AMPLITUDE, ORGANIC_AMPLITUDE);
}

/**
 * Every crossing in the graph, in a fixed order.
 *
 * Computed from the cell sets rather than from the construction, because an
 * organic street can meet another one anywhere and a construction-derived
 * answer would only ever be right for the grid. Where two segments share a run
 * of cells (a diagonal-ish organic crossing) the intersection is reported at
 * the middle one — one intersection per crossing is what F4's crossings and
 * the road pass's junctions both want.
 */
export function intersectionsOf(segments: readonly StreetSegment[]): StreetIntersection[] {
  const cells = segments.map((s) => {
    const set = new Set<string>();
    for (const c of s.path) set.add(`${c.x},${c.z}`);
    return set;
  });

  const out: StreetIntersection[] = [];
  for (let a = 0; a < segments.length; a++) {
    for (let b = a + 1; b < segments.length; b++) {
      const shared: Point2[] = [];
      for (const cell of (segments[a] as StreetSegment).path) {
        if ((cells[b] as Set<string>).has(`${cell.x},${cell.z}`)) shared.push(cell);
      }
      if (shared.length === 0) continue;
      const mid = shared[shared.length >> 1] as Point2;
      out.push({
        x: mid.x,
        z: mid.z,
        segments: [(segments[a] as StreetSegment).id, (segments[b] as StreetSegment).id],
      });
    }
  }
  out.sort((p, q) => (p.z !== q.z ? p.z - q.z : p.x - q.x));
  return out;
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

/** The local heading and its perpendicular at index `i` of a path. */
export function headingOf(
  path: readonly Point2[],
  i: number,
): { readonly dx: number; readonly dz: number; readonly px: number; readonly pz: number } {
  const before = path[Math.max(0, i - 1)] as Point2;
  const after = path[Math.min(path.length - 1, i + 1)] as Point2;
  const dx = Math.sign(after.x - before.x);
  const dz = Math.sign(after.z - before.z);
  if (dx === 0 && dz === 0) return { dx: 0, dz: 1, px: 0, pz: 1 };
  // Perpendicular: rotate the heading a quarter turn. `pz` scales the x offset
  // and `px` the z offset, which is the convention `surfaceRoute` uses.
  return { dx, dz, px: dx, pz: -dz };
}

/**
 * The endpoints of every street on the district boundary.
 *
 * The inter-district road pass's anchor list: a lane arriving from the next
 * district should meet a street where the street already ends, not somewhere
 * convenient. Pure — nothing is wired to it in F1.
 */
export function boundaryEndpoints(graph: StreetGraph, bounds: Rect): Point2[] {
  const out: Point2[] = [];
  const onEdge = (p: Point2): boolean =>
    p.x <= bounds.x0 || p.x >= bounds.x1 || p.z <= bounds.z0 || p.z >= bounds.z1;
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
