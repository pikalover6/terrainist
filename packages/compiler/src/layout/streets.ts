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
  /**
   * 1 = inside; a segment leaving the mask **ends there** (C1).
   *
   * Row-major over {@link StreetGraphInput.bounds}. Absent for an authored
   * rectangular district, and its absence is load-bearing: the unmasked,
   * unrotated construction below is byte-for-byte the one fabric v2 shipped.
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
 * Shortest run of clipped street kept, in cells.
 *
 * A three-cell stub poking into the corner of a cell is not a street, it is a
 * paving accident, and every one of them would be surfaced and dressed with a
 * lamp post. Below this the run is dropped and the ground goes back to the
 * block.
 */
export const MIN_CLIPPED_RUN = 10;

/* -------------------------------------------------------------------------- */
/* rotation, without trigonometry                                              */
/* -------------------------------------------------------------------------- */

/**
 * `[sin, cos] × 4096` at every 15°, index `k` = `15k` degrees, 0 = +Z.
 *
 * A table rather than `Math.sin` because worldgen may not call a transcendental
 * function: `sin` is not required to be correctly rounded and two runtimes may
 * disagree in the last bit, which is exactly the kind of difference that turns
 * "same spec, same seed, same world" into a lie. Quantising every angle in the
 * C1 contract to 15° is what makes the table possible.
 *
 * Heading θ points along `(sin θ, cos θ)`: θ = 0 is +Z, θ = 90 is +X.
 */
export const TRIG_SCALE = 4096;

/** `[sinθ, cosθ] × {@link TRIG_SCALE}`, θ = 15 · index. */
export const TRIG_15: readonly (readonly [number, number])[] = Object.freeze([
  [0, 4096],
  [1060, 3956],
  [2048, 3547],
  [2896, 2896],
  [3547, 2048],
  [3956, 1060],
  [4096, 0],
  [3956, -1060],
  [3547, -2048],
  [2896, -2896],
  [2048, -3547],
  [1060, -3956],
  [0, -4096],
  [-1060, -3956],
  [-2048, -3547],
  [-2896, -2896],
  [-3547, -2048],
  [-3956, -1060],
  [-4096, 0],
  [-3956, 1060],
  [-3547, 2048],
  [-2896, 2896],
  [-2048, 3547],
  [-1060, 3956],
] as const);

/**
 * The 15°-quantised heading of a direction vector, in degrees, 0 = +Z.
 *
 * The nearest table entry by dot product — which is the nearest angle, because
 * every entry is (near enough) a unit vector and `argmax cos(θ − φ)` is
 * `argmin |θ − φ|`. Integer arithmetic throughout; ties break to the lower
 * heading, so a due-diagonal is always reported as the same one of its two
 * equidistant neighbours.
 */
export function quantizeHeading(dx: number, dz: number): number {
  if (dx === 0 && dz === 0) return 0;
  let bestK = 0;
  let best = -Infinity;
  for (const [k, entry] of TRIG_15.entries()) {
    const dot = dx * (entry[0] as number) + dz * (entry[1] as number);
    if (dot > best) {
      best = dot;
      bestK = k;
    }
  }
  return bestK * 15;
}

/** Round a heading to the nearest 15°, into `[0, 360)`. */
export function snapHeading(degrees: number): number {
  const k = Math.round(degrees / 15);
  return ((k % 24) + 24) % 24 * 15;
}

/**
 * Rotate a local grid offset into world space.
 *
 * The local `v` axis maps onto the heading `θ` — so a cell whose orientation is
 * the heading of the boulevard beside it gets streets running *parallel* to
 * that boulevard, which is the whole reason the field exists.
 */
export function rotateOffset(u: number, v: number, degrees: number): Point2 {
  const k = (((Math.round(degrees / 15) % 24) + 24) % 24) as number;
  const entry = TRIG_15[k] as readonly [number, number];
  const sin = entry[0];
  const cos = entry[1];
  return {
    x: Math.round((u * cos + v * sin) / TRIG_SCALE),
    z: Math.round((-u * sin + v * cos) / TRIG_SCALE),
  };
}

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

  // C1: a cell of a city plan is an arbitrary polygon at an arbitrary angle,
  // and neither is expressible by the edge-to-edge construction below. It gets
  // its own generator — and only it does, so that an authored rectangular
  // district that passes neither field still walks exactly the code fabric v2
  // shipped and produces exactly the same bytes.
  if (input.mask !== undefined || (input.orientation ?? 0) % 360 !== 0) {
    return clippedGraph(input, spacing, jitter);
  }

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

/* -------------------------------------------------------------------------- */
/* the clipped, rotated fabric (fabric v3, C1)                                 */
/* -------------------------------------------------------------------------- */

/**
 * The same grid, drawn in a rotated frame and cut to a mask.
 *
 * Two differences from the world-axis construction, and they are the two things
 * that stop a city reading as one rectangle full of smaller rectangles:
 *
 * 1. **The frame turns.** Lines are laid out in a `(u, v)` frame rotated about
 *    the bounds centre and mapped back to world columns through
 *    {@link rotateOffset}, so two neighbouring cells whose orientations differ
 *    by 15° meet at 15° instead of continuing one global grid.
 * 2. **A line stops where the cell does.** Every line is cut into maximal runs
 *    inside the mask, and each run is its own segment. A run that ends inside
 *    the bounds is a dead end or a T-junction onto the arterial the mask edge
 *    follows — which is what the fabric is *for*, not a hole in it.
 *
 * The frame is sized to the bounds' diagonal so a rotated grid still covers
 * every corner, and lines that miss the mask entirely simply produce no runs.
 */
function clippedGraph(input: StreetGraphInput, spacing: number, jitter: Rng): StreetGraphResult {
  const { bounds, sidewalk, mask } = input;
  const orientation = ((Math.round((input.orientation ?? 0) / 15) % 24) + 24) % 24 * 15;
  const cx = Math.floor((bounds.x0 + bounds.x1) / 2);
  const cz = Math.floor((bounds.z0 + bounds.z1) / 2);
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  // Half the bounds' diagonal, rounded up: the smallest square frame centred on
  // the cell that still contains it at any rotation.
  const half = Math.ceil(Math.sqrt(width * width + depth * depth) / 2) + 2;

  const uLines = linePositions(-half, half, spacing, input.fabric, jitter, sidewalk);
  const vLines = linePositions(-half, half, spacing, input.fabric, jitter, sidewalk);
  if (uLines.length < 2 || vLines.length < 2) {
    return {
      ok: false,
      reason: `a ${width} × ${depth} cell at blockSize ${input.blockSize} yields ${uLines.length} × ${vLines.length} streets; a fabric needs at least two on each axis`,
      fix: `lower "params.blockSize" (or drop it and let the density choose) so the streets fit, or grow "envelope.size"`,
    };
  }

  const wander = streamSeed(input.seed, "jitter");
  const inside = (p: Point2): boolean => {
    if (p.x < bounds.x0 || p.x > bounds.x1 || p.z < bounds.z0 || p.z > bounds.z1) return false;
    if (mask === undefined) return true;
    return mask[(p.z - bounds.z0) * width + (p.x - bounds.x0)] === 1;
  };

  const segments: StreetSegment[] = [];
  const draw = (base: string, kind: StreetSegment["kind"], fixed: number, alongV: boolean): void => {
    const raw: Point2[] = [];
    for (let t = -half; t <= half; t++) {
      let offset = 0;
      if (input.fabric === "organic") {
        const anchor = Math.floor(t / ORGANIC_WAVELENGTH) * ORGANIC_WAVELENGTH;
        const a = organicOffset(wander, base, anchor);
        const b = organicOffset(wander, base, anchor + ORGANIC_WAVELENGTH);
        const mix = (t - anchor) / ORGANIC_WAVELENGTH;
        offset = Math.round(a + (b - a) * mix);
      }
      const local = alongV
        ? rotateOffset(fixed + offset, t, orientation)
        : rotateOffset(t, fixed + offset, orientation);
      raw.push({ x: cx + local.x, z: cz + local.z });
    }
    for (const [r, run] of runsOf(densify4(raw), inside).entries()) {
      segments.push({
        id: r === 0 ? base : `${base}_${r}`,
        kind,
        width: STREET_WIDTH[kind],
        path: run,
      });
    }
  };

  for (const [i, u] of uLines.entries()) draw(`ns${i}`, classOf(i), u, true);
  for (const [j, v] of vLines.entries()) draw(`ew${j}`, classOf(j), v, false);

  if (segments.length === 0) {
    return {
      ok: false,
      reason: `no street line survives the clip of this ${width} × ${depth} cell — the shape is thinner than one block of fabric everywhere`,
      fix: "nothing to change in the document: a cell this thin is dropped and its ground is left for the ground treatment pass",
    };
  }

  return { ok: true, graph: { segments, intersections: intersectionsOf(segments), sidewalk } };
}

/**
 * Make a nearly-connected walk 4-connected, dropping repeats.
 *
 * A rotated line steps by `(−sinθ, cosθ)` per cell of the local frame, so two
 * consecutive rounded samples differ by at most one on each axis — they may be
 * equal (dropped), orthogonal (kept) or diagonal, and a diagonal gets the
 * intervening orthogonal cell inserted. Every consumer of a `path` walks it
 * assuming 4-connectivity, so this is not cosmetic.
 */
export function densify4(raw: readonly Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const cell of raw) {
    const previous = out[out.length - 1];
    if (previous === undefined) {
      out.push(cell);
      continue;
    }
    if (previous.x === cell.x && previous.z === cell.z) continue;
    if (previous.x !== cell.x && previous.z !== cell.z) {
      // Turn on the x axis first, always: an arbitrary but fixed choice, so the
      // staircase of a 45° street leans the same way along its whole length.
      out.push({ x: cell.x, z: previous.z });
    }
    out.push(cell);
  }
  return out;
}

/** Maximal runs of a path that lie inside the cell, longest-first order kept. */
function runsOf(path: readonly Point2[], inside: (p: Point2) => boolean): Point2[][] {
  const out: Point2[][] = [];
  let current: Point2[] = [];
  for (const cell of path) {
    if (inside(cell)) {
      current.push(cell);
      continue;
    }
    if (current.length >= MIN_CLIPPED_RUN) out.push(current);
    current = [];
  }
  if (current.length >= MIN_CLIPPED_RUN) out.push(current);
  return out;
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
