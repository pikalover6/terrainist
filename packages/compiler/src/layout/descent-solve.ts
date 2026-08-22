/**
 * **The descent solve** — `docs/DESCENT-SOLVE-v0.md` §1 and §2.
 *
 * > *"Recognize the situation (two overlapping staircases going down a very
 * > steep cliff), and run a robust solver to spit out something coherent,
 * > rather than try to harmonize a huge mess."* — Kai, 2026-08-21
 *
 * Three procedures used to decide the network's descent of a steep face
 * piecemeal: a router that cannot see the face chose the path, a 1-Lipschitz
 * tread law that cannot see the resolved field laid the profile, and a rank
 * table neither party consulted arbitrated the contest. This module is the one
 * owner: it **recognizes** the face and the demands that must cross it (§1) and
 * **solves** them as one object by an exact integer method (§2).
 *
 * It is the kernel, and it is **pure** in the §1.3 sense — a function of
 * `(region, h, StreetGraph, StreetDatum, a legality predicate)` and nothing
 * else. It reads no plan, no resolver output and no tier, declares nothing, and
 * allocates no randomness; the same face in is the same descent out. That is
 * `layout/street-datum.ts`' and `layout/election-solve.ts`' discipline and this
 * file sits beside them: the wiring, the corridor and the record live one file
 * over, in `layout/descent-datum.ts`.
 *
 * ## The one structural idea (§2.2)
 *
 * The tread law T11 — `need[k] = max(g[k] + 1, need[k+1] − 1)` (`sweep.ts`) —
 * is a *filter on a path somebody else chose*. Make it the **state space** and
 * the path is chosen knowing it. A state is `(c, y, d, s)`: column, stand
 * level, incoming direction, and columns since the last riser saturating at
 * {@link DESCENT_LANDING_MIN}. Straight flight, side-hug traverse and
 * switchback are then **outcomes, not modes** — there is no alignment selector
 * to tune and no predicate to get wrong.
 *
 * ## The standing law (§2.3)
 *
 * *Every descent cost is a non-negative integer attached to one step; the
 * objective is their sum; no term may depend on the path globally.* A
 * path-global term (total wiggle, terrace count, "coherence") forfeits §2.4's
 * exactness and is a design change, not a tuning.
 */

import type { Region } from "@terrainist/stdlib";

import { MAX_TREAD_CUT } from "../structures/sweep.js";
import { STREET_STAIR_MAX_FILL } from "../structures/street-stairs.js";
import { compareStreetRank, type StreetOwnerKind, type StreetOwnerRole } from "../structures/street-owner.js";

import type { StreetGraph, StreetSegment } from "./streets.js";
import type { StreetDatum } from "./street-datum.js";
import {
  CUT_W,
  DESCENT_CLIMB_W,
  DESCENT_DROP_MIN,
  DESCENT_EARN_RATIO,
  DESCENT_LANDING_MIN,
  DESCENT_RUN_W,
  DESCENT_SCARP_W,
  DESCENT_SHARE_SPAN,
  DESCENT_TURN_W,
  FACE_MAX_COLUMNS,
  FILL_W,
  SCARP_DILATE,
  SCARP_RISER_MIN,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/* the raster                                                                  */
/* -------------------------------------------------------------------------- */

/** Row-major index of a world column, or `-1` outside the region. */
export function descentIndex(region: Region, x: number, z: number): number {
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return -1;
  return j * region.width + i;
}

/** The world column a region index names. */
function columnAt(region: Region, idx: number): { readonly x: number; readonly z: number } {
  const i = idx % region.width;
  return { x: region.x0 + i, z: region.z0 + (idx - i) / region.width };
}

/**
 * The four steps, in **direction index order** — the order M1's packed key
 * sorts by, so it is a fact about the answer and not about the loop.
 */
const STEP4: readonly (readonly [number, number])[] = Object.freeze([
  [0, -1], // 0 north
  [1, 0], //  1 east
  [0, 1], //  2 south
  [-1, 0], // 3 west
]);

function chebyshev(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

/* -------------------------------------------------------------------------- */
/* §1 — recognition                                                            */
/* -------------------------------------------------------------------------- */

/** A 4-connected component of the dilated scarp mask — §1.2 S2. */
export interface ScarpFace {
  /** Ascending region index of the component's lowest column — its identity. */
  readonly id: number;
  /** Every column of the face, **ascending region index**. */
  readonly columns: readonly number[];
  /** Membership test, region-indexed. 1 inside. */
  readonly mask: Uint8Array;
  /** `max h − min h` over the face, for the record. Never a criterion (§1.2 S3). */
  readonly relief: number;
}

/** A segment of the quarter's graph that must lose height across a face (§1.3). */
export interface DescentDemand {
  readonly segmentId: string;
  /** `D1` — the router already called this a flight; `D2` — T12's break case. */
  readonly source: "D1" | "D2";
  /** The face this demand crosses. */
  readonly faceId: number;
  /** Upper terminal column (region index) and its datum level. */
  readonly top: number;
  readonly topY: number;
  /** Lower terminal column and its datum level. */
  readonly bottom: number;
  readonly bottomY: number;
  /** The direction of travel arriving at {@link top}, as a {@link STEP4} index. */
  readonly heading: number;
  /** The demand's own path columns inside the face, for the search domain. */
  readonly corridorHint: readonly number[];
  /** The segment's carriageway width — the cross-section the corridor takes. */
  readonly width: number;
  /** `compareStreetRank`'s key, so a group can be ordered by T14 without the graph. */
  readonly rank: { readonly id: string; readonly width: number; readonly role: StreetOwnerRole; readonly kind: StreetOwnerKind };
}

/** What {@link recognizeDescents} reads. Everything, and nothing else. */
export interface DescentRecognitionInput {
  readonly region: Region;
  /**
   * The **pristine baseline materialisation** — `materialisedGround(region,
   * field)`, the same array `gradeStreetDatum` samples, by the same rule.
   * Recognition reads no resolved tier (§1.1).
   */
  readonly h: Int32Array;
  readonly graph: StreetGraph;
  readonly datum: StreetDatum;
}

/** §1's answer: the faces, the demands, and the groups §2 solves. */
export interface DescentRecognition {
  readonly faces: readonly ScarpFace[];
  /** Every steep demand, in `compareStreetRank` order. */
  readonly demands: readonly DescentDemand[];
  /** §1.4's groups — one descent problem each, in ascending senior-terminal order. */
  readonly groups: readonly (readonly DescentDemand[])[];
  /** Faces refused before the solve, with §2.7's reason. */
  readonly refusals: readonly { readonly faceId: number; readonly reason: "face-too-large"; readonly columns: number }[];
  /** How many columns seeded the scarp mask — WP-D0's census row. */
  readonly seeds: number;
}

/**
 * The scarp mask, dilated — §1.2 S1/S2.
 *
 * Exported so the census harness and the tests can read the mask itself rather
 * than a copy of the rule.
 */
export function scarpMask(region: Region, h: Int32Array): { readonly seed: Uint8Array; readonly mask: Uint8Array } {
  const cells = region.width * region.depth;
  const seed = new Uint8Array(cells);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const k = j * region.width + i;
      const here = h[k] as number;
      let worst = 0;
      for (const [dx, dz] of STEP4) {
        const ii = i + dx;
        const jj = j + dz;
        if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
        const drop = here - (h[jj * region.width + ii] as number);
        if (drop > worst) worst = drop;
      }
      // S1: two, because one is a kerb and `STREET_STAIR_RAIL_DROP = 2` is
      // already the first drop a player can fall down.
      if (worst >= SCARP_RISER_MIN) seed[k] = 1;
    }
  }
  // S2's dilation, Chebyshev, separable in two passes so a 2-dilate costs
  // `2 · (width + depth)` per column rather than `(2r + 1)²`.
  const mask = new Uint8Array(cells);
  const rowRun = new Uint8Array(cells);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      if (seed[j * region.width + i] !== 1) continue;
      for (let d = -SCARP_DILATE; d <= SCARP_DILATE; d++) {
        const ii = i + d;
        if (ii < 0 || ii >= region.width) continue;
        rowRun[j * region.width + ii] = 1;
      }
    }
  }
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      if (rowRun[j * region.width + i] !== 1) continue;
      for (let d = -SCARP_DILATE; d <= SCARP_DILATE; d++) {
        const jj = j + d;
        if (jj < 0 || jj >= region.depth) continue;
        mask[jj * region.width + i] = 1;
      }
    }
  }
  return { seed, mask };
}

/** 4-connected components of a mask, each ascending, in ascending seed order. */
function componentsOf(region: Region, mask: Uint8Array): number[][] {
  const cells = region.width * region.depth;
  const seen = new Uint8Array(cells);
  const out: number[][] = [];
  const queue = new Int32Array(cells);
  for (let start = 0; start < cells; start++) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const piece: number[] = [];
    while (head < tail) {
      const k = queue[head++] as number;
      piece.push(k);
      const i = k % region.width;
      const j = (k - i) / region.width;
      for (const [dx, dz] of STEP4) {
        const ii = i + dx;
        const jj = j + dz;
        if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
        const n = jj * region.width + ii;
        if (mask[n] !== 1 || seen[n] === 1) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    piece.sort((a, b) => a - b);
    out.push(piece);
  }
  return out;
}

/** The rank key a segment carries into `compareStreetRank` — T14. */
function rankOf(segment: StreetSegment): DescentDemand["rank"] {
  return {
    id: segment.id,
    width: segment.width,
    role: (segment.role ?? "carriageway") as StreetOwnerRole,
    kind: segment.kind as StreetOwnerKind,
  };
}

/**
 * §1 — every steep face the network must descend, and the demands that must
 * descend it.
 *
 * Demand-driven by construction (§7.5): if the router drew nothing across a
 * cliff, no descent exists and the cliff stays a cliff. Making the router
 * *want* a crossing it never asked for is a separate design.
 */
export function recognizeDescents(input: DescentRecognitionInput): DescentRecognition {
  const { region, h, graph, datum } = input;
  const { seed, mask } = scarpMask(region, h);
  let seeds = 0;
  for (const v of seed) if (v === 1) seeds += 1;

  const faces: ScarpFace[] = [];
  const refusals: { faceId: number; reason: "face-too-large"; columns: number }[] = [];
  const faceOf = new Int32Array(region.width * region.depth).fill(-1);
  for (const piece of componentsOf(region, mask)) {
    const id = piece[0] as number;
    if (piece.length > FACE_MAX_COLUMNS) {
      // M2's a-priori bound, enforced as a refusal rather than as a slow solve.
      refusals.push({ faceId: id, reason: "face-too-large", columns: piece.length });
      continue;
    }
    const faceMask = new Uint8Array(region.width * region.depth);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const k of piece) {
      faceMask[k] = 1;
      faceOf[k] = id;
      const y = h[k] as number;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    faces.push({ id, columns: piece, mask: faceMask, relief: hi - lo });
  }

  /* --- the demands ------------------------------------------------------- */
  const demands: DescentDemand[] = [];
  for (const segment of graph.segments) {
    const role = segment.role ?? "carriageway";
    if (role === "channel" || segment.path.length < 2) continue;
    // Which face does this path cross, and where does it enter and leave it?
    // A path crossing two faces is two demands — one per face — which is what
    // "every steep demand crossing the same face" is a statement about.
    const byFace = new Map<number, number[]>();
    for (const [i, cell] of segment.path.entries()) {
      const k = descentIndex(region, cell.x, cell.z);
      if (k < 0) continue;
      const face = faceOf[k] as number;
      if (face < 0) continue;
      const run = byFace.get(face);
      if (run === undefined) byFace.set(face, [i]);
      else run.push(i);
    }
    // D2's test needs the segment's own graded profile: a riser of `≥ 2` at a
    // station inside the face is T12's break-into-steps case caught where it
    // fires rather than where it was intended.
    const levels = datum.bySegment.get(segment.id);
    for (const faceId of [...byFace.keys()].sort((a, b) => a - b)) {
      const inside = byFace.get(faceId) as number[];
      const first = inside[0] as number;
      const last = inside[inside.length - 1] as number;
      let source: "D1" | "D2";
      if (role === "steps" || role === "cart") source = "D1";
      else {
        if (levels === undefined) continue;
        let breaks = false;
        for (let i = first; i <= last && i + 1 < segment.path.length; i++) {
          const a = segment.path[i] as { x: number; z: number };
          const b = segment.path[i + 1] as { x: number; z: number };
          const ka = descentIndex(region, a.x, a.z);
          const kb = descentIndex(region, b.x, b.z);
          if (ka < 0 || kb < 0 || datum.band[ka] !== 1 || datum.band[kb] !== 1) continue;
          if (Math.abs((datum.columnY[ka] as number) - (datum.columnY[kb] as number)) >= SCARP_RISER_MIN) {
            breaks = true;
            break;
          }
        }
        if (!breaks) continue;
        source = "D2";
      }
      // §1.3's terminals: the last banded column of the path on the high side
      // of the face and the first on the low side, at their datum levels.
      //
      // **Whose band, and why the distinction is the whole of S5a.** A `steps`
      // segment is banded along its own length — `gradeStreetDatum` grades it
      // like any other run — and that grading is exactly the artefact this
      // design exists to replace: on Troy's west cliff the flight's own datum
      // stands **ten blocks** above its natural ground at the foot, because a
      // 1-Lipschitz profile cannot fall 19 blocks in five columns. Reading the
      // terminals off it would pin the search to mid-air and refuse every
      // legal descent, which is S5a with the sign flipped.
      //
      // So the band a terminal is read from is the band of *the network the
      // demand arrives at*, and the two sources say where that is:
      //
      // - **D1** — a flight exists only to cross the face, so its terminals are
      //   its own extreme banded columns, which are the streets at either end:
      //   `compareStreetRank` gives those shared columns to the wider street,
      //   so the level read there is the street's, not the flight's.
      // - **D2** — a carriageway crosses a face in the middle of a run that is
      //   a street on both sides of it, so the face boundary is the terminal,
      //   exactly as written.
      const outward = source === "D1";
      const terminal = (from: number, step: -1 | 1): { readonly idx: number; readonly at: number } | undefined => {
        let best: { idx: number; at: number } | undefined;
        for (let i = from; i >= 0 && i < segment.path.length; i += step) {
          const cell = segment.path[i] as { x: number; z: number };
          const k = descentIndex(region, cell.x, cell.z);
          if (k < 0) continue;
          if (datum.band[k] !== 1) continue;
          best = { idx: k, at: i };
          if (!outward) break;
        }
        return best;
      };
      const before = terminal(first, -1);
      const after = terminal(last, 1);
      if (before === undefined || after === undefined || before.idx === after.idx) continue;
      const beforeY = datum.columnY[before.idx] as number;
      const afterY = datum.columnY[after.idx] as number;
      if (beforeY === afterY) continue;
      const upper = beforeY > afterY ? before : after;
      const lower = beforeY > afterY ? after : before;
      const topY = Math.max(beforeY, afterY);
      const bottomY = Math.min(beforeY, afterY);
      // R1 — the drop needing at least one retaining wall to be a face at all.
      if (topY - bottomY < DESCENT_DROP_MIN) continue;
      // R2 — the same ratio the walkability audit decides an earned drop with.
      const u = columnAt(region, upper.idx);
      const v = columnAt(region, lower.idx);
      if (chebyshev(u, v) >= DESCENT_EARN_RATIO * (topY - bottomY)) continue;
      // The heading is the direction of travel *arriving* at the upper
      // terminal, so the first move out of it is a continuation rather than a
      // free turn.
      const prev = segment.path[Math.max(0, upper.at - (upper === before ? 1 : -1))] as
        | { x: number; z: number }
        | undefined;
      const heading = headingOf(prev, u);
      demands.push({
        segmentId: segment.id,
        source,
        faceId,
        top: upper.idx,
        topY,
        bottom: lower.idx,
        bottomY,
        heading,
        // The search domain is the face **plus the demand's own path between
        // its terminals**: a terminal outside the face has to be reachable
        // from it, and the line the router drew is the one corridor the
        // network has already agreed to spend columns on.
        corridorHint: pathBetween(region, segment, before.at, after.at),
        width: segment.width,
        rank: rankOf(segment),
      });
    }
  }
  demands.sort((a, b) => compareStreetRank(a.rank, b.rank));

  /* --- §1.4's grouping --------------------------------------------------- */
  // Single-linkage over the **upper** terminals in ascending region-index
  // order, with `DESCENT_SHARE_SPAN` the only clustering parameter there is.
  const groups: DescentDemand[][] = [];
  for (const face of faces) {
    const here = demands.filter((d) => d.faceId === face.id);
    if (here.length === 0) continue;
    const order = [...here].sort((a, b) => a.top - b.top);
    const parent = order.map((_, i) => i);
    const find = (i: number): number => {
      let r = i;
      while ((parent[r] as number) !== r) r = parent[r] as number;
      return r;
    };
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = columnAt(region, (order[i] as DescentDemand).top);
        const b = columnAt(region, (order[j] as DescentDemand).top);
        if (chebyshev(a, b) > DESCENT_SHARE_SPAN) continue;
        const ra = find(i);
        const rb = find(j);
        if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
    const byRoot = new Map<number, DescentDemand[]>();
    for (let i = 0; i < order.length; i++) {
      const r = find(i);
      const bucket = byRoot.get(r);
      if (bucket === undefined) byRoot.set(r, [order[i] as DescentDemand]);
      else bucket.push(order[i] as DescentDemand);
    }
    for (const r of [...byRoot.keys()].sort((a, b) => a - b)) {
      const bucket = byRoot.get(r) as DescentDemand[];
      // T14 inside the group: the senior demand is the trunk (§2.5).
      bucket.sort((a, b) => compareStreetRank(a.rank, b.rank));
      groups.push(bucket);
    }
  }

  return { faces, demands, groups, refusals, seeds };
}

/** Every in-region column of a segment's path between two path indices. */
function pathBetween(region: Region, segment: StreetSegment, a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const cell = segment.path[i] as { x: number; z: number } | undefined;
    if (cell === undefined) continue;
    const k = descentIndex(region, cell.x, cell.z);
    if (k >= 0) out.push(k);
  }
  return out;
}

/** The {@link STEP4} index of the step from `a` to `b`; north where unknown. */
function headingOf(a: { x: number; z: number } | undefined, b: { x: number; z: number }): number {
  if (a === undefined) return 0;
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  for (const [i, [sx, sz]] of STEP4.entries()) if (sx === dx && sz === dz) return i;
  return 0;
}

/* -------------------------------------------------------------------------- */
/* §2 — the solve                                                              */
/* -------------------------------------------------------------------------- */

/** §2.3's six terms, summed over the chosen path — §2.7's explanation record. */
export interface DescentCost {
  readonly run: number;
  readonly cut: number;
  readonly fill: number;
  readonly scarp: number;
  readonly climb: number;
  readonly turn: number;
  readonly total: number;
}

/** One 4-connected centre line with one integer stand level per column. */
export interface DescentRun {
  readonly demandId: string;
  /** `"trunk"` for the senior demand's run, `"branch"` for a joiner. */
  readonly kind: "trunk" | "branch";
  /** Region indices, in walking order from the upper terminal down. */
  readonly columns: readonly number[];
  /** The stand level at each column of {@link columns}. */
  readonly levels: readonly number[];
  /** `s` at each column — a landing is `s === DESCENT_LANDING_MIN`. */
  readonly rest: readonly number[];
  readonly cost: DescentCost;
  /** Columns whose step down into them is a riser. */
  readonly risers: number;
  /** Maximal level runs of the run — §2.5's landings. */
  readonly landings: readonly { readonly from: number; readonly to: number }[];
  readonly longestLevelRun: number;
  /** Present when the run joined the trunk rather than the street: where. */
  readonly joinedAt?: number;
  readonly width: number;
}

/** §2.1's object: a rooted tree of runs over one face. */
export interface SolvedDescent {
  readonly faceId: number;
  readonly faceColumns: number;
  readonly runs: readonly DescentRun[];
  /** Demands the search could not serve, with §2.7's reason. */
  readonly refused: readonly { readonly demandId: string; readonly reason: "unreachable" }[];
  /** The best path constrained to the straight fall line, for §2.7's marginal. */
  readonly straight?: DescentCost;
  readonly states: number;
}

/** What {@link solveDescent} needs beyond §1's recognition. */
export interface DescentSolveInput {
  readonly region: Region;
  readonly h: Int32Array;
  readonly face: ScarpFace;
  readonly group: readonly DescentDemand[];
  /**
   * **T4** — is this column one a descent may take at all?
   *
   * The tier-A classes a descent may never take are hard-forbidden here (fluid,
   * building footprint, precinct ground, foreign linework), which is what makes
   * §3.2's subtraction safe. A caller with nothing to forbid passes nothing.
   */
  readonly legal?: (idx: number) => boolean;
}

/**
 * A binary heap ordered by `(cost, key)` — M1.
 *
 * The key tie-break is not decoration: it is what makes the optimum **unique**
 * by construction rather than by a comparator somebody has to remember.
 */
class StateQueue {
  private cost: number[] = [];
  private key: number[] = [];

  get size(): number {
    return this.cost.length;
  }

  push(cost: number, key: number): void {
    this.cost.push(cost);
    this.key.push(key);
    let i = this.cost.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(i, p)) {
        this.swap(i, p);
        i = p;
      } else break;
    }
  }

  pop(): { readonly cost: number; readonly key: number } {
    const cost = this.cost[0] as number;
    const key = this.key[0] as number;
    const lastCost = this.cost.pop() as number;
    const lastKey = this.key.pop() as number;
    if (this.cost.length > 0) {
      this.cost[0] = lastCost;
      this.key[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.cost.length && this.less(l, best)) best = l;
        if (r < this.cost.length && this.less(r, best)) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return { cost, key };
  }

  private less(a: number, b: number): boolean {
    const ca = this.cost[a] as number;
    const cb = this.cost[b] as number;
    if (ca !== cb) return ca < cb;
    return (this.key[a] as number) < (this.key[b] as number);
  }

  private swap(a: number, b: number): void {
    const c = this.cost[a] as number;
    this.cost[a] = this.cost[b] as number;
    this.cost[b] = c;
    const k = this.key[a] as number;
    this.key[a] = this.key[b] as number;
    this.key[b] = k;
  }
}

/**
 * The search domain of one group: the face, its demands' paths and terminals,
 * **dilated by one landing**.
 *
 * The dilation is WP-D1's second addition to §2.2, and it is a measurement
 * rather than a preference. A face is the scarp mask dilated 2, so it is the
 * *steep* ground and nothing else — and a switchback's landing is by
 * construction the flattest part of the shape, which on Troy's west cliff lies
 * on the plateau one column outside the face. Without the room the search finds
 * only paths that walk back down the line they came up, and those are refused
 * as stacked; with `DESCENT_LANDING_MIN` columns of room the switchback is
 * expressible. The bound is unchanged in form — `|domain|` for `|F|` — and
 * `FACE_MAX_COLUMNS` still caps it a priori.
 */
function domainOf(input: DescentSolveInput): { readonly columns: number[]; readonly slot: Map<number, number> } {
  const { region } = input;
  const core = new Set<number>();
  const add = (k: number): void => {
    if (k >= 0) core.add(k);
  };
  for (const k of input.face.columns) add(k);
  for (const demand of input.group) {
    for (const k of demand.corridorHint) add(k);
    add(demand.top);
    add(demand.bottom);
  }
  const seen = new Set<number>();
  const columns: number[] = [];
  for (const k of core) {
    const i = k % region.width;
    const j = (k - i) / region.width;
    for (let dj = -DESCENT_LANDING_MIN; dj <= DESCENT_LANDING_MIN; dj++) {
      for (let di = -DESCENT_LANDING_MIN; di <= DESCENT_LANDING_MIN; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
        const n = jj * region.width + ii;
        if (seen.has(n)) continue;
        seen.add(n);
        columns.push(n);
      }
    }
  }
  columns.sort((a, b) => a - b);
  const slot = new Map<number, number>();
  for (const [i, k] of columns.entries()) slot.set(k, i);
  return { columns, slot };
}

/**
 * §2 — solve one group as **one object**.
 *
 * The senior demand's path is the **trunk**; each remaining demand is solved
 * with its goal set enlarged by the trunk's landings, and only its landings, so
 * two stairs down one cliff **meet, at a landing, on a level tread** — or the
 * second runs to the street on its own and never touches the first. They cannot
 * cross: a branch that reached a trunk column reached a *goal*, so no state
 * past it is ever expanded.
 */
export function solveDescent(input: DescentSolveInput): SolvedDescent {
  const { region, h, face, group } = input;
  const legal = input.legal ?? ((): boolean => true);
  const { columns, slot } = domainOf(input);
  const runs: DescentRun[] = [];
  const refused: { demandId: string; reason: "unreachable" }[] = [];
  let states = 0;
  /** Trunk landing states, as `column · LEVELS + (Ytop − y)` of the *branch's* frame. */
  let trunkLandings: readonly { readonly column: number; readonly y: number }[] = [];
  let straight: DescentCost | undefined;

  for (const demand of group) {
    // The trunk's landings, and only its landings — empty until a trunk exists,
    // so the senior demand is solved against the street alone (§2.5).
    const answer = search({ region, h, columns, slot, legal, demand, goals: trunkLandings });
    states += answer.states;
    if (answer.run === undefined) {
      refused.push({ demandId: demand.segmentId, reason: "unreachable" });
      continue;
    }
    // The senior demand's run is the trunk — and where the senior refuses, the
    // next demand that can be built becomes one, because a group with a branch
    // and no trunk is not an object.
    const run: DescentRun = {
      ...answer.run,
      demandId: demand.segmentId,
      kind: runs.length === 0 ? "trunk" : "branch",
      width: demand.width,
    };
    runs.push(run);
    if (run.kind === "trunk") {
      trunkLandings = run.columns
        .map((column, i) => ({ column, y: run.levels[i] as number, rest: run.rest[i] as number }))
        .filter((s) => s.rest === DESCENT_LANDING_MIN)
        .map((s) => ({ column: s.column, y: s.y }));
      // §2.7's marginal: the same search restricted to the straight fall line,
      // so "why did it switchback here" is answerable from the record.
      straight = search({
        region,
        h,
        columns,
        slot,
        legal,
        demand,
        goals: [],
        straightOnly: true,
      }).run?.cost;
    }
  }

  return {
    faceId: face.id,
    faceColumns: face.columns.length,
    runs,
    refused,
    ...(straight === undefined ? {} : { straight }),
    states,
  };
}

/** One demand's search — §2.2's state space, §2.3's cost, §2.4's method. */
function search(args: {
  readonly region: Region;
  readonly h: Int32Array;
  readonly columns: readonly number[];
  readonly slot: ReadonlyMap<number, number>;
  readonly legal: (idx: number) => boolean;
  readonly demand: DescentDemand;
  readonly goals: readonly { readonly column: number; readonly y: number }[];
  readonly straightOnly?: boolean;
}): { readonly run?: Omit<DescentRun, "demandId" | "kind" | "width">; readonly states: number } {
  const { region, h, columns, slot, legal, demand, goals } = args;
  const { topY, bottomY } = demand;
  const span = topY - bottomY;
  const levels = span + 1;
  const rests = DESCENT_LANDING_MIN + 1;
  const size = columns.length * levels * 4 * rests;
  if (size <= 0) return { states: 0 };

  const key = (c: number, y: number, d: number, s: number): number =>
    ((c * levels + (topY - y)) * 4 + d) * rests + s;

  // Integer costs, integer distances: every term of §2.3 is a small
  // non-negative integer and a path is bounded by the domain, so `int32` is a
  // statement about the objective rather than a micro-optimisation — **no float
  // anywhere** (§2.4).
  const INF = 0x7fff_ffff;
  const dist = new Int32Array(size).fill(INF);
  const from = new Int32Array(size).fill(-1);
  const settled = new Uint8Array(size);
  const queue = new StateQueue();

  const start = slot.get(demand.top);
  const goalColumn = slot.get(demand.bottom);
  if (start === undefined || goalColumn === undefined) return { states: 0 };
  /** The extra goals, as `(column slot, y)` pairs of this frame. */
  const goalSet = new Set<number>();
  goalSet.add(goalColumn * levels + (topY - bottomY));
  for (const g of goals) {
    const c = slot.get(g.column);
    if (c === undefined || g.y > topY || g.y < bottomY) continue;
    goalSet.add(c * levels + (topY - g.y));
  }

  const startKey = key(start, topY, demand.heading, DESCENT_LANDING_MIN);
  dist[startKey] = 0;
  queue.push(0, startKey);

  const straightOnly = args.straightOnly === true;
  let visited = 0;
  let hit = -1;
  while (queue.size > 0) {
    const { cost, key: k } = queue.pop();
    if (settled[k] === 1) continue;
    if ((dist[k] as number) !== cost) continue;
    settled[k] = 1;
    visited += 1;
    const s = k % rests;
    const rest = (k - s) / rests;
    const d = rest % 4;
    const cy = (rest - d) / 4;
    const yOff = cy % levels;
    const c = (cy - yOff) / levels;
    const y = topY - yOff;
    if (goalSet.has(c * levels + yOff)) {
      hit = k;
      break;
    }
    const idx = columns[c] as number;
    const at = columnAt(region, idx);
    for (const [d2, [dx, dz]] of STEP4.entries()) {
      // T3 — a turn is legal only when the step is a tread and `s` has
      // saturated; it then resets `s`. Every direction change therefore sits
      // inside a level run of at least `DESCENT_LANDING_MIN` columns.
      const turning = d2 !== d;
      if (turning && (s !== DESCENT_LANDING_MIN || straightOnly)) continue;
      // **A reversal is not a turn, it is the same column twice.** T2 makes the
      // level dimension a DAG, so a path that walks back along the line it came
      // down arrives at its own columns *at a lower level* — two treads in one
      // column, which is not a thing a hill can hold. A real switchback turns
      // ninety degrees, runs its landing, and turns again onto the line beside
      // the one it came down; that shape is still reachable, and the stacked
      // one is not. (The design's T3 does not name this case; it is the one
      // addition WP-D1 makes to the state space, and it is a restriction.)
      if (d2 === (d + 2) % 4) continue;
      const nIdx = descentIndex(region, at.x + dx, at.z + dz);
      if (nIdx < 0) continue;
      const c2 = slot.get(nIdx);
      if (c2 === undefined) continue;
      // T4 — the classes a descent may never take.
      if (!legal(nIdx)) continue;
      const gA = h[idx] as number;
      const gB = h[nIdx] as number;
      // T2 — a step changes `y` by 0 (a tread) or −1 (a riser); never +1.
      for (const drop of turning ? [0] : [0, 1]) {
        const y2 = y - drop;
        if (y2 < bottomY) continue;
        // T1 — a tread is masonry on the hill within the courses a flight may
        // carry.
        if (y2 < gB - MAX_TREAD_CUT || y2 > gB + STREET_STAIR_MAX_FILL) continue;
        const s2 = turning ? 0 : drop === 1 ? 0 : Math.min(s + 1, DESCENT_LANDING_MIN);
        const step =
          DESCENT_RUN_W +
          CUT_W * Math.max(0, gB - y2) +
          FILL_W * Math.max(0, y2 - gB) +
          DESCENT_SCARP_W * Math.max(0, gA - gB - 1) +
          DESCENT_CLIMB_W * Math.max(0, gB - gA) +
          (turning ? DESCENT_TURN_W : 0);
        const k2 = key(c2, y2, d2, s2);
        const next = cost + step;
        if (next >= (dist[k2] as number)) continue;
        dist[k2] = next;
        from[k2] = k;
        queue.push(next, k2);
      }
    }
  }

  if (hit < 0) return { states: visited };

  /* --- unpack ------------------------------------------------------------- */
  const chain: number[] = [];
  for (let k = hit; k >= 0; k = from[k] as number) chain.push(k);
  chain.reverse();
  const outColumns: number[] = [];
  const outLevels: number[] = [];
  const outRest: number[] = [];
  let run = 0;
  let cut = 0;
  let fill = 0;
  let scarp = 0;
  let climb = 0;
  let turn = 0;
  let risers = 0;
  for (const [i, k] of chain.entries()) {
    const s = k % rests;
    const rest = (k - s) / rests;
    const d = rest % 4;
    const cy = (rest - d) / 4;
    const yOff = cy % levels;
    const c = (cy - yOff) / levels;
    const idx = columns[c] as number;
    const y = topY - yOff;
    outColumns.push(idx);
    outLevels.push(y);
    outRest.push(s);
    if (i === 0) continue;
    const prev = chain[i - 1] as number;
    const ps = prev % rests;
    const prest = (prev - ps) / rests;
    const pd = prest % 4;
    const pcy = (prest - pd) / 4;
    const pyOff = pcy % levels;
    const pc = (pcy - pyOff) / levels;
    const pIdx = columns[pc] as number;
    const gA = h[pIdx] as number;
    const gB = h[idx] as number;
    run += DESCENT_RUN_W;
    cut += CUT_W * Math.max(0, gB - y);
    fill += FILL_W * Math.max(0, y - gB);
    scarp += DESCENT_SCARP_W * Math.max(0, gA - gB - 1);
    climb += DESCENT_CLIMB_W * Math.max(0, gB - gA);
    if (d !== pd) turn += DESCENT_TURN_W;
    if (y < (outLevels[i - 1] as number)) risers += 1;
  }
  // §2.5's landings: the **maximal level runs** of the run, and nothing else.
  // The invariant that kills the S9 orphan class — *a landing exists iff the
  // run it belongs to exists* — is a statement about this list.
  const landings: { from: number; to: number }[] = [];
  let longest = 0;
  let open = 0;
  for (let i = 1; i <= outLevels.length; i++) {
    if (i < outLevels.length && (outLevels[i] as number) === (outLevels[i - 1] as number)) continue;
    const length = i - open;
    if (length > longest) longest = length;
    if (length >= DESCENT_LANDING_MIN) landings.push({ from: open, to: i - 1 });
    open = i;
  }
  // **No column twice.** With the reversal banned a stacked run is already
  // nearly unreachable, but "nearly" is not a law: a run that visits one column
  // at two levels would publish two treads in one place, so it is refused
  // whole, exactly as T11's own refusal is (M3). A refusal is a statement about
  // the face; half a staircase is not.
  const once = new Set(outColumns);
  if (once.size !== outColumns.length) return { states: visited };

  const joined = (outColumns[outColumns.length - 1] as number) !== demand.bottom;
  return {
    run: {
      columns: outColumns,
      levels: outLevels,
      rest: outRest,
      cost: { run, cut, fill, scarp, climb, turn, total: run + cut + fill + scarp + climb + turn },
      risers,
      landings,
      longestLevelRun: longest,
      ...(joined ? { joinedAt: outColumns[outColumns.length - 1] as number } : {}),
    },
    states: visited,
  };
}

/**
 * The a-priori state bound — M2, as a function so a test can assert the solve
 * never exceeds it rather than trusting the arithmetic in a comment.
 */
export function descentStateBound(faceColumns: number, span: number): number {
  return faceColumns * (span + MAX_TREAD_CUT + STREET_STAIR_MAX_FILL + 1) * 4 * (DESCENT_LANDING_MIN + 1);
}
