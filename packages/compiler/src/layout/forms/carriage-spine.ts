/**
 * The carriage spine — one road a cart can climb.
 *
 * Ratified by Kai 2026-08-07, on the accepted `hillside` prototype: *"a horse or
 * a cart on these roads would not be able to move from terrace to terrace."*
 * Every cross-contour connection the form draws is a flight of stairs, and no
 * hill town in the world is a stair town. There is always one road the carts
 * use, switchbacking up the flank, and the stairs are the shortcuts between its
 * legs.
 *
 * ## The switchbacks are never drawn
 *
 * They are what a grade cap produces. A route obeying one block of rise per
 * {@link SPINE_GRADE_RUN} columns has arc length at least `SPINE_GRADE_RUN · Δe`
 * between two streets `Δe` apart, whatever it does in plan; the flank is not
 * that long in the fall line, so the route **must** oblique across the contours,
 * and where the flank runs out it **must** turn back. A hairpin is therefore a
 * measurement rather than a motif, and a quarter broad enough not to need one
 * does not get one.
 *
 * ## The cap is the step
 *
 * The search's move is one **macro-step**: exactly `SPINE_GRADE_RUN` columns in
 * one of eight directions, changing the road's level by at most one block. The
 * cap is then structural — no state of the search can represent a steeper route
 * — rather than a cost that a cheap enough alternative can buy its way past.
 * That is the whole reason this is not an ordinary A\* priced on slope: an
 * ordinary A\* returns a route that is cheap, direct and unclimbable, which is
 * the road the town already has.
 *
 * Two consequences worth stating, because they are why the state space stays
 * small enough to search exhaustively:
 *
 * - the lattice is **coarse** — one node per macro-step, so a 160 × 152 quarter
 *   is 27 × 26 nodes rather than 24 320 columns;
 * - the road's **level is part of the state**, which is what makes the cap a
 *   property of an edge rather than of a path, and it is bounded per leg by the
 *   two streets the leg runs between.
 *
 * ## Determinism
 *
 * No random draw. The heap breaks ties on the state index, the successor order
 * is fixed, and every cost is an integer, so the route is a pure function of the
 * ground, the strips and the streets.
 */

import { hairpinLandings, type Point2, type Rect } from "../frames.js";

import { densify4 } from "./axial.js";

/* -------------------------------------------------------------------------- */
/* §3.6a — the constants                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Columns of run per block of rise: `SPINE_MAX_GRADE = 1 : 6`, inverted.
 *
 * The gradient a loaded cart takes without a runaway, and the steepest grade the
 * cart profile can *build*: half a block per three columns is the coarsest
 * alternation that still reads as a ramp rather than as two steps, and this is
 * twice that. Steeper is a stair; gentler doubles the length of the road for one
 * point of comfort.
 */
export const SPINE_GRADE_RUN = 6;

/**
 * Blocks of embankment the road may stand on, and blocks it may be benched into
 * its own hill.
 *
 * The same number both ways, and the symmetry is the point: a carriage road is
 * a **cut-and-fill bench**, not masonry laid on the surface. Four is below
 * `TERRACE_RISE` (6), so a spine never opens a face a retaining wall would have
 * to be built for, and above 2, so a traverse crosses a gully rather than diving
 * into it. The cart law is given twice this as its own budget, so the profile
 * has headroom where the raster of a diagonal takes the road a column off the
 * line the search priced.
 */
const SPINE_FILL_BAND = 4;

/**
 * Charged per claimed frontage column a macro-step crosses.
 *
 * Against a run cost of {@link SPINE_GRADE_RUN}, crossing seven columns of
 * terrace costs more than a fifty-column detour — which is the ordering "hug the
 * flank rather than slice the centre" actually means. Level ground is the
 * scarcest resource in the quarter (§2) and the spine is the one user of it that
 * arrives after the terraces are allocated, so it pays.
 */
const SPINE_STRIP_COST = 40;

/** Per eighth-turn between macro-steps: two straight traverses beat a wander. */
const SPINE_TURN_COST = 12;

/** Per block of cut or fill at a macro-step's far end. */
const SPINE_FILL_COST = 3;

/**
 * Shorter axis at or above `2 ×` this, and the quarter gets a **second** spine.
 *
 * A 96-column flank at 1:6 buys sixteen blocks of climb in one traverse, which
 * is more than two terrace rises; below that a second spine has nowhere to be
 * that the first one is not, and two roads up one flank are one road drawn twice
 * — the defect §3.3 removes for contour streets, arriving sideways.
 */
const SPINE_SECOND_SPAN = 96;

/** Carriageway columns. Three of running surface between two parapet courses. */
export const SPINE_WIDTH = 5;

/**
 * Columns of hillside reserved **beyond** the spine's own verge.
 *
 * `smoothTerrace`'s closing radius, and deliberately the same number: a corridor
 * exactly as wide as its carriageway is a gap that closing can reach across, and
 * a terrace closed over a road is a terrace with a notch in it — which is
 * precisely what `walkBack` finds and reports as `offPlatform`.
 */
export const SPINE_RESERVE_MARGIN = 2;

/* -------------------------------------------------------------------------- */
/* what the router is given                                                    */
/* -------------------------------------------------------------------------- */

/** The ground the spine is routed over, as the planner already holds it. */
export interface SpineGround {
  readonly bounds: Rect;
  readonly width: number;
  readonly depth: number;
  /**
   * The ground **as the plan will leave it**: a platform's level where a terrace
   * has been cut, the hill's own height everywhere else.
   *
   * Both halves of that sentence were paid for. Routing against the *blur* is
   * routing against a hill that does not exist: the cart law demands `need[k] ≥
   * ground[k] + 1` at every column of the centre line, and a blur is by
   * construction below the bumps it smoothed, so a route chosen on it is a route
   * the profile refuses one pass later — and a refused profile is a reserved
   * corridor with no road in it. Routing against the *natural* field is worse
   * and subtler: measured, the first route this planner drew ran fifty columns
   * across ground it had itself just planned to cut flat at 109, and the whole
   * seven-block climb was left for the twenty columns after it — a 1-in-3 the
   * law refused, whole. A planner that routes over ground it is about to move is
   * routing over a hill nobody will ever see.
   */
  height(x: number, z: number): number;
  at(x: number, z: number): number;
  inside(p: Point2): boolean;
  /**
   * 1 on a column already spoken for: a frontage strip, or a principal street's
   * own band. Level ground the spine has to pay {@link SPINE_STRIP_COST} to take.
   */
  readonly strip: Uint8Array;
}

/** One principal contour street, as the spine sees it. */
export interface SpineStreet {
  readonly path: readonly Point2[];
  readonly level: number;
}

/** A routed spine. */
export interface CarriageSpine {
  /** The centre line, 4-connected, from the lowest street to the topmost. */
  readonly path: readonly Point2[];
  /** How many hairpins the grade cap forced. */
  readonly hairpins: number;
  /** How many principal streets it climbed between. */
  readonly legs: number;
  /**
   * Index into {@link CarriageSpine.path} of each **interior** leg's landing —
   * where the road meets a principal street it does not start or stop on.
   *
   * Handed back because the planner has to make those junctions real: the leg
   * aimed at the *candidate* contour, and a stretch of that contour that pinched
   * out is not a street to arrive at.
   */
  readonly junctions: readonly { readonly at: number; readonly level: number }[];
}

/* -------------------------------------------------------------------------- */
/* the entry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which end of the lowest principal street the spine enters at (§3.6a rule 5).
 *
 * The end nearest the quarter's own edge, because that is the end an external
 * road reaches: `road.network@0` routes between districts and arrives at a
 * boundary, and the lowest street is where it arrives lowest. Ties break on the
 * lower ground, then on the row-major index — §3.1's order, unchanged.
 *
 * `which` picks the *other* end for a second spine, so two spines on a wide
 * flank start from opposite ends of the same street rather than from the same
 * corner.
 */
export function spineEntry(ground: SpineGround, street: SpineStreet, which: number): Point2 {
  const ends: Point2[] = [street.path[0] as Point2, street.path[street.path.length - 1] as Point2];
  const rank = (p: Point2): [number, number, number] => [
    Math.min(
      p.x - ground.bounds.x0,
      ground.bounds.x1 - p.x,
      p.z - ground.bounds.z0,
      ground.bounds.z1 - p.z,
    ),
    ground.height(p.x, p.z),
    ground.at(p.x, p.z),
  ];
  const sorted = ends
    .map((p) => ({ p, key: rank(p) }))
    .sort((a, b) =>
      a.key[0] !== b.key[0]
        ? a.key[0] - b.key[0]
        : a.key[1] !== b.key[1]
          ? a.key[1] - b.key[1]
          : a.key[2] - b.key[2],
    );
  return (sorted[which % sorted.length] as { p: Point2 }).p;
}

/** True when the quarter is broad enough for a second spine (§3.6a). */
export function spineBudget(bounds: Rect): number {
  const span = Math.min(bounds.x1 - bounds.x0 + 1, bounds.z1 - bounds.z0 + 1);
  return span >= 2 * SPINE_SECOND_SPAN ? 2 : 1;
}

/* -------------------------------------------------------------------------- */
/* the route                                                                   */
/* -------------------------------------------------------------------------- */

/** The eight macro-step directions, in a fixed order — the successor order. */
const DIRS: readonly (readonly [number, number])[] = Object.freeze([
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const);

/** Cost of one macro-step, by direction: the run it actually covers. */
const STEP_COST: readonly number[] = Object.freeze([6, 8, 6, 8, 6, 8, 6, 8]);

/** Eighths of a turn between two of {@link DIRS}. */
function turnEighths(a: number, b: number): number {
  const d = Math.abs(a - b) % 8;
  return d > 4 ? 8 - d : d;
}

/**
 * Route one carriage spine from `entry` up through every principal street.
 *
 * **Leg by leg**, one leg per adjacent pair of streets in elevation order, each
 * leg ending on a column the street above owns. That is what makes the spine
 * touch every principal street exactly once, at an ordinary junction the street
 * family's own ownership order arbitrates — a cart road ranks below a
 * carriageway of its width, so the junction is the street's level and the
 * spine's tread run is pinned to it.
 *
 * Returns `null` when any leg is unroutable: half a carriage road that stops on
 * the hillside is worse than none, and the stairs are still there.
 */
export function routeCarriageSpine(
  ground: SpineGround,
  streets: readonly SpineStreet[],
  entry: Point2,
): CarriageSpine | null {
  if (streets.length < 2) return null;
  const order = [...streets].sort((a, b) => a.level - b.level);
  const vertices: Point2[] = [entry];
  const landings: { readonly p: Point2; readonly level: number }[] = [];
  let cursor = entry;
  for (let i = 1; i < order.length; i++) {
    const leg = routeLeg(ground, order[i - 1] as SpineStreet, order[i] as SpineStreet, cursor);
    if (leg === null) return null;
    vertices.push(...leg.vertices.slice(1));
    cursor = leg.vertices[leg.vertices.length - 1] as Point2;
    if (i < order.length - 1) landings.push({ p: cursor, level: (order[i] as SpineStreet).level });
  }
  const path = densifyRun(vertices).filter((p) => ground.inside(p));
  if (path.length < 2 * SPINE_GRADE_RUN) return null;
  // **Counted off the line, not off the search.** A switchback on a lattice
  // arrives as two ninety-degree turns as often as as one reversal, so counting
  // the router's own direction changes undercounts it — and worse, it would
  // disagree with the landings `street-stairs.ts` lays, which are read from this
  // same geometry. One definition, read twice.
  const turns = hairpinLandings(path, SPINE_GRADE_RUN, 0);
  let hairpins = 0;
  for (let k = 0; k < turns.length; k++) {
    if (turns[k] === 1 && (k === 0 || turns[k - 1] !== 1)) hairpins++;
  }
  const junctions = landings.map((landing) => {
    let at = 0;
    let best = Number.POSITIVE_INFINITY;
    for (const [k, q] of path.entries()) {
      const d =
        (q.x - landing.p.x) * (q.x - landing.p.x) + (q.z - landing.p.z) * (q.z - landing.p.z);
      if (d < best) {
        best = d;
        at = k;
      }
    }
    return { at, level: landing.level };
  });
  return { path, hairpins, legs: order.length - 1, junctions };
}

/** One leg: the coarse vertices from `from` up to the street above. */
function routeLeg(
  ground: SpineGround,
  below: SpineStreet,
  above: SpineStreet,
  from: Point2,
): { readonly vertices: Point2[] } | null {
  const { bounds } = ground;
  const run = SPINE_GRADE_RUN;
  const cw = Math.floor((ground.width - 1) / run) + 1;
  const cd = Math.floor((ground.depth - 1) / run) + 1;
  const nodes = cw * cd;
  const worldOf = (c: number): Point2 => ({
    x: bounds.x0 + (c % cw) * run,
    z: bounds.z0 + Math.floor(c / cw) * run,
  });
  const coarseOf = (p: Point2): number =>
    Math.min(cd - 1, Math.round((p.z - bounds.z0) / run)) * cw +
    Math.min(cw - 1, Math.round((p.x - bounds.x0) / run));

  // The goal: within one macro-step of the street this leg climbs to.
  //
  // **There is no junction exemption, and its absence is the design.** An
  // earlier draft let the search do anything within a macro-step of either
  // street, on the theory that a junction stands on cut platform. Measured, that
  // is where the terrace's own *face* is: the road walked up to the platform
  // edge and stepped five blocks onto it, and the cart law refused the run
  // whole and correctly. A terrace face is 1-in-1 and no carriage road climbs
  // one. What a carriage road does instead is roll onto the terrace **where the
  // terrace meets grade** — at the ends of the strips, where the claim rule
  // pinched them out — and with the cut/fill band applied everywhere, that is
  // the only place the search can find. So it finds it.
  const target = new Uint8Array(nodes);
  for (const p of above.path) {
    for (let dz = -run; dz <= run; dz++) {
      for (let dx = -run; dx <= run; dx++) {
        const q = { x: p.x + dx, z: p.z + dz };
        if (!ground.inside(q)) continue;
        const c = coarseOf(q);
        const w = worldOf(c);
        if (Math.abs(w.x - p.x) > run || Math.abs(w.z - p.z) > run) continue;
        target[c] = 1;
      }
    }
  }

  // The level band. A leg never needs to stand below the street it left or above
  // the one it is climbing to, plus one block of slack either way for a traverse
  // that has to cross a shoulder.
  const lo = Math.min(below.level, above.level) - 1;
  const hi = Math.max(below.level, above.level) + 1;
  const levels = hi - lo + 1;
  if (levels <= 0) return null;
  const states = nodes * levels * (DIRS.length + 1);
  const idOf = (c: number, l: number, d: number): number =>
    (c * levels + (l - lo)) * (DIRS.length + 1) + d;

  const legal = (c: number, l: number): boolean => {
    const w = worldOf(c);
    if (!ground.inside(w)) return false;
    return Math.abs(l - ground.height(w.x, w.z)) <= SPINE_FILL_BAND;
  };

  const start = coarseOf(from);
  const cost = new Float64Array(states).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(states).fill(-1);
  const heap = new Heap();
  const startId = idOf(start, below.level, DIRS.length);
  if (below.level < lo || below.level > hi) return null;
  cost[startId] = 0;
  heap.push(0, startId);

  // Chebyshev macro-steps to the nearest goal node, over the whole lattice and
  // ignoring legality — one multi-source sweep, so the heuristic is a lookup.
  const toGoal = new Int32Array(nodes).fill(-1);
  const wave: number[] = [];
  for (let c = 0; c < nodes; c++) {
    if (target[c] !== 1) continue;
    toGoal[c] = 0;
    wave.push(c);
  }
  if (wave.length === 0) return null;
  for (let head = 0; head < wave.length; head++) {
    const c = wave[head] as number;
    const cx = c % cw;
    const cz = (c - cx) / cw;
    for (const step of DIRS) {
      const nx = cx + (step[0] as number);
      const nz = cz + (step[1] as number);
      if (nx < 0 || nz < 0 || nx >= cw || nz >= cd) continue;
      const nc = nz * cw + nx;
      if ((toGoal[nc] as number) >= 0) continue;
      toGoal[nc] = (toGoal[c] as number) + 1;
      wave.push(nc);
    }
  }

  /**
   * The cheapest any goal can be: the octile distance in macro-steps, and at
   * least the blocks still to climb. Never an over-estimate, because a
   * macro-step costs at least six and moves one node and one block.
   */
  const heuristic = (c: number, l: number): number =>
    Math.max(toGoal[c] as number, Math.abs(above.level - l)) * 6;

  // The plan half of every macro-step, computed once: whether its run stays
  // inside the quarter, and how many claimed frontage columns it crosses. The
  // level half is the only thing that varies per state, which is what keeps the
  // search over `nodes × levels × dirs` states cheap.
  const edgeBlocked = new Uint8Array(nodes * DIRS.length);
  const edgeStrips = new Int32Array(nodes * DIRS.length);
  const edgeHigh = new Int32Array(nodes * DIRS.length);
  const edgeLow = new Int32Array(nodes * DIRS.length);
  for (let c = 0; c < nodes; c++) {
    const cx = c % cw;
    const cz = (c - cx) / cw;
    for (const [d, step] of DIRS.entries()) {
      const e = c * DIRS.length + d;
      const nx = cx + (step[0] as number);
      const nz = cz + (step[1] as number);
      if (nx < 0 || nz < 0 || nx >= cw || nz >= cd) {
        edgeBlocked[e] = 1;
        continue;
      }
      let strips = 0;
      let high = Number.NEGATIVE_INFINITY;
      let low = Number.POSITIVE_INFINITY;
      for (const p of densifyRun([worldOf(c), worldOf(nz * cw + nx)])) {
        if (!ground.inside(p)) {
          edgeBlocked[e] = 1;
          break;
        }
        if (ground.strip[ground.at(p.x, p.z)] === 1) strips++;
        const g = ground.height(p.x, p.z);
        if (g > high) high = g;
        if (g < low) low = g;
      }
      edgeStrips[e] = strips;
      edgeHigh[e] = high;
      edgeLow[e] = low;
    }
  }

  let found = -1;
  const closed = new Uint8Array(states);
  while (heap.size > 0) {
    const state = heap.pop();
    if (closed[state] === 1) continue;
    closed[state] = 1;
    const dir = state % (DIRS.length + 1);
    const rest = (state - dir) / (DIRS.length + 1);
    const l = (rest % levels) + lo;
    const c = (rest - (rest % levels)) / levels;
    if (target[c] === 1 && l === above.level) {
      found = state;
      break;
    }
    const cx = c % cw;
    const cz = (c - cx) / cw;
    const here = cost[state] as number;
    for (const [d, step] of DIRS.entries()) {
      const nx = cx + (step[0] as number);
      const nz = cz + (step[1] as number);
      if (nx < 0 || nz < 0 || nx >= cw || nz >= cd) continue;
      const nc = nz * cw + nx;
      if (edgeBlocked[c * DIRS.length + d] === 1) continue;
      const b = worldOf(nc);
      const strips = edgeStrips[c * DIRS.length + d] as number;
      for (let dl = -1; dl <= 1; dl++) {
        const nl = l + dl;
        if (nl < lo || nl > hi) continue;
        if (!legal(nc, nl)) continue;
        // **The run has to be buildable, not just its two ends.** The road
        // between two macro-nodes stands at the higher of their two levels at
        // worst, and the cart law will refuse the whole run if any column of it
        // pokes through — so the ground under the run is measured here, against
        // the raw field, and a step over a bump the blur hid is not a state the
        // search can reach.
        const e = c * DIRS.length + d;
        if ((edgeHigh[e] as number) - Math.min(l, nl) > SPINE_FILL_BAND) continue;
        if (Math.max(l, nl) - (edgeLow[e] as number) > SPINE_FILL_BAND) continue;
        const fill = Math.abs(nl - ground.height(b.x, b.z));
        const turn = dir === DIRS.length ? 0 : SPINE_TURN_COST * turnEighths(dir, d);
        const price =
          (STEP_COST[d] as number) +
          turn +
          SPINE_STRIP_COST * strips +
          SPINE_FILL_COST * Math.round(fill);
        const next = idOf(nc, nl, d);
        if (closed[next] === 1) continue;
        const tentative = here + price;
        if (tentative >= (cost[next] as number)) continue;
        cost[next] = tentative;
        parent[next] = state;
        heap.push(tentative + heuristic(nc, nl), next);
      }
    }
  }
  if (found < 0) return null;

  const back: number[] = [];
  for (let s = found; s >= 0; s = parent[s] as number) back.push(s);
  back.reverse();
  const vertices: Point2[] = [from];
  for (const [i, s] of back.entries()) {
    if (i === 0) continue;
    const dir = s % (DIRS.length + 1);
    const rest = (s - dir) / (DIRS.length + 1);
    const c = (rest - (rest % levels)) / levels;
    vertices.push(worldOf(c));
  }
  // …and land on the street above, at a column that street's carriageway owns,
  // which is what pins the tread run to the junction's level.
  const last = vertices[vertices.length - 1] as Point2;
  let landing = above.path[0] as Point2;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of above.path) {
    const d = (p.x - last.x) * (p.x - last.x) + (p.z - last.z) * (p.z - last.z);
    if (d < bestD) {
      bestD = d;
      landing = p;
    }
  }
  vertices.push(landing);
  return { vertices };
}

/**
 * The 4-connected columns of a run of straight segments.
 *
 * Sampled along the true line one column at a time and *then* densified, rather
 * than handed to `densify4` as two distant endpoints: `densify4` turns on the x
 * axis first, so a six-column diagonal handed to it whole comes out as an L. A
 * road is a line, and the staircase of a diagonal has to be the line's own.
 */
function densifyRun(vertices: readonly Point2[]): Point2[] {
  const samples: Point2[] = [];
  for (const [i, b] of vertices.entries()) {
    if (i === 0) {
      samples.push(b);
      continue;
    }
    const a = vertices[i - 1] as Point2;
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    for (let t = 1; t <= n; t++) {
      samples.push({
        x: Math.round(a.x + ((b.x - a.x) * t) / n),
        z: Math.round(a.z + ((b.z - a.z) * t) / n),
      });
    }
  }
  return densify4(samples);
}

/* -------------------------------------------------------------------------- */
/* the heap                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A binary heap over `(priority, state)`, ties broken on the **state index**.
 *
 * The tie-break is the determinism law in one comparator: without it two states
 * of equal priority come off the heap in an order that depends on the insertion
 * sequence, and the route becomes a function of the traversal rather than of the
 * ground.
 */
class Heap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.values.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.values.push(value);
    let i = this.values.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.values[0] as number;
    const key = this.keys.pop() as number;
    const value = this.values.pop() as number;
    if (this.values.length > 0) {
      this.keys[0] = key;
      this.values[0] = value;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.values.length && this.before(l, best)) best = l;
        if (r < this.values.length && this.before(r, best)) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }

  private before(a: number, b: number): boolean {
    const ka = this.keys[a] as number;
    const kb = this.keys[b] as number;
    if (ka !== kb) return ka < kb;
    return (this.values[a] as number) < (this.values[b] as number);
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a] as number;
    const v = this.values[a] as number;
    this.keys[a] = this.keys[b] as number;
    this.values[a] = this.values[b] as number;
    this.keys[b] = k;
    this.values[b] = v;
  }
}
