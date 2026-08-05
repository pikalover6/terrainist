/**
 * The axial construction — the two grids, moved here unchanged.
 *
 * Everything in this file was `streets.ts` before the urban-form registry
 * existed, and **the bodies are byte-identical to what shipped**: the widths and
 * spacing constants, the 15° trig table, `densify4`, `runsOf`, `linePositions`,
 * `lineSegment`, `organicOffset`, `intersectionsOf`, the clipped/rotated
 * generator and the edge-to-edge one. `streets.ts` re-exports every public name
 * from here, so no existing import site moved and no existing test changed.
 *
 * That the move is a *move* is the whole of the byte-identity argument
 * (`docs/URBAN-FORMS-v0.md` §5.1): `grid` and `organic` are adapters over
 * {@link axialGraph} that pass the two values which already distinguished them,
 * the RNG draw order is untouched because `linePositions` draws for both fabrics
 * at every interior line, and `mask === undefined` still selects the unclipped
 * path.
 *
 * Forms that draw *lines* (`canal`, and the ribs of `linear`) share `runsOf`,
 * `densify4` and `rotateOffset` from here rather than growing their own.
 */

import { Rng, positionInt, streamSeed, type Seed256 } from "@terrainist/stdlib";

import { clampInt, type Point2, type Rect } from "../frames.js";
import type { StreetGraph, StreetIntersection, StreetSegment } from "../streets.js";

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

/* -------------------------------------------------------------------------- */
/* the axial construction                                                      */
/* -------------------------------------------------------------------------- */

/** Which of the two axial fabrics is being drawn. */
export type AxialFabric = "grid" | "organic";

/** What {@link axialGraph} needs — the pre-registry `StreetGraphInput`. */
export interface AxialInput {
  /** The district's inclusive footprint, in world columns. */
  readonly bounds: Rect;
  readonly fabric: AxialFabric;
  /** `nodeSeed(worldSeed, districtPath, seedSalt)`. */
  readonly seed: Seed256;
  /** Preferred centre-line spacing, in blocks. */
  readonly blockSize: number;
  /** Sidewalk band per side, in columns. */
  readonly sidewalk: number;
  /**
   * 1 = inside; a segment leaving the mask **ends there** (C1).
   *
   * Row-major over {@link AxialInput.bounds}. Absent for an authored
   * rectangular district, and its absence is load-bearing: the unmasked,
   * unrotated construction below is byte-for-byte the one fabric v2 shipped.
   */
  readonly mask?: Uint8Array;
  /** Local grid rotation about the bounds centre, degrees, quantised to 15. */
  readonly orientation?: number;
}

/** Why a district could not be given a skeleton. */
export interface AxialFailure {
  readonly ok: false;
  readonly reason: string;
  readonly fix: string;
}

/** A skeleton, or the reason there is none. */
export type AxialResult = { readonly ok: true; readonly graph: StreetGraph } | AxialFailure;

/**
 * Draw a district's street skeleton, the axial way.
 *
 * Both fabrics come from the same construction — a set of line positions per
 * axis, each line spanning the district edge to edge — because both are grids;
 * `"organic"` is a grid that has been let go of. Spanning edge to edge is what
 * makes every street reach the district boundary, which is what lets the
 * inter-district road pass pick the ends up as anchors, and it is also why grid
 * connectivity is structural rather than something to be checked for.
 */
export function axialGraph(input: AxialInput): AxialResult {
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
function clippedGraph(input: AxialInput, spacing: number, jitter: Rng): AxialResult {
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

/**
 * Maximal runs of a path that lie inside the cell, longest-first order kept.
 *
 * Exported for the forms that draw their own lines into a masked cell: a ring,
 * a spoke, a contour or a rib is cut here exactly as a grid line is, so every
 * form's answer to "the cell stops" is the same code.
 */
export function runsOf(path: readonly Point2[], inside: (p: Point2) => boolean): Point2[][] {
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
export function linePositions(
  lo: number,
  hi: number,
  spacing: number,
  fabric: AxialFabric,
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
export function lineSegment(
  id: string,
  kind: StreetSegment["kind"],
  vertical: boolean,
  fixed: number,
  from: number,
  to: number,
  bounds: Rect,
  fabric: AxialFabric,
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
export function organicOffset(wander: Seed256, id: string, t: number): number {
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
/* connectivity                                                                */
/* -------------------------------------------------------------------------- */

/** Euclidean distance between two columns. `sqrt` is IEEE-exact; `hypot` is not. */
export function distance(a: Point2, b: Point2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * The segments a road can reach from a seed column, in draw order.
 *
 * A clip can strand a run — the far end of a ring that the cell's polygon cut
 * into two arcs, a spoke that only exists outside the last ring it touched, a
 * lane of a grown town on the wrong side of the cut — and a stranded run is
 * carriageway no lane reaches, buildings fronting nothing, and a
 * `traversal.unreachable` finding in the physics lint. Two segments are joined
 * when they share a centre-line cell, which is exactly what a crossing is; the
 * component containing the seed (or the largest, if none does) is kept.
 *
 * Written by `radial`, shared by `linear` and `grown`, and it lives here beside
 * `runsOf` because "the cell stops" and "the plan is one piece" are the same
 * question asked twice.
 */
export function connectedSegments(segments: readonly StreetSegment[], seed: Point2): StreetSegment[] {
  if (segments.length === 0) return [];
  const parent = segments.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while ((parent[root] as number) !== root) root = parent[root] as number;
    let walk = i;
    while ((parent[walk] as number) !== walk) {
      const next = parent[walk] as number;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (i: number, j: number): void => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };

  const owner = new Map<string, number>();
  for (const [i, segment] of segments.entries()) {
    for (const cell of segment.path) {
      const key = `${cell.x},${cell.z}`;
      const first = owner.get(key);
      if (first === undefined) owner.set(key, i);
      else union(first, i);
    }
  }

  // The component nearest the seed wins; failing that, the biggest one. Both
  // tie-break on the lowest segment index, which is draw order.
  const size = new Map<number, number>();
  for (const [i] of segments.entries()) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  let chosen = -1;
  let bestReach = Number.POSITIVE_INFINITY;
  for (const [i, segment] of segments.entries()) {
    const root = find(i);
    for (const cell of segment.path) {
      const reach = distance(cell, seed);
      if (reach < bestReach) {
        bestReach = reach;
        chosen = root;
      }
    }
  }
  if (chosen < 0) {
    let biggest = 0;
    for (const [root, count] of size) {
      if (count > biggest) {
        biggest = count;
        chosen = root;
      }
    }
  }
  return segments.filter((_, i) => find(i) === chosen);
}
