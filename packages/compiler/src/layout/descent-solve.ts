/**
 * **The descent solve** —
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
  DESCENT_FACE_STATIONS_MAX,
  DESCENT_FLIGHT_WIDTH,
  DESCENT_GROUP_DEMANDS_MAX,
  DESCENT_LANDING_MIN,
  DESCENT_REACH,
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

/**
 * The eight steps — the neighbourhood {@link DESCENT_REACH} is measured in.
 *
 * Chebyshev, because that is the metric R2 already compares a drop against, and
 * a reach in one metric and an earn ratio in another would be two thresholds
 * wearing one name.
 */
const STEP8: readonly (readonly [number, number])[] = Object.freeze([
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]);

function chebyshev(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

/**
 * The 4-connected digital line between two columns — one axis at a time, never
 * diagonally, because a descent walks in {@link STEP4} and a hint the search
 * cannot follow is not a hint.
 *
 * Used twice and for two different things: as the "do these two stations sit on
 * **opposite sides** of the face" test (§1 as amended), and as the demand's
 * `corridorHint`, which is the search domain's connective tissue between two
 * terminals that may both lie outside the face.
 */
function line4(region: Region, from: number, to: number): number[] {
  const a = columnAt(region, from);
  const b = columnAt(region, to);
  let { x, z } = a;
  const dx = Math.abs(b.x - x);
  const dz = Math.abs(b.z - z);
  const sx = Math.sign(b.x - x);
  const sz = Math.sign(b.z - z);
  let err = dx - dz;
  const out: number[] = [];
  const push = (): void => {
    const k = descentIndex(region, x, z);
    if (k >= 0) out.push(k);
  };
  push();
  // Bounded by `dx + dz`, so the loop terminates on any input the region holds.
  for (let guard = 0; guard <= dx + dz && (x !== b.x || z !== b.z); guard++) {
    const e2 = 2 * err;
    if (e2 > -dz && x !== b.x) {
      err -= dz;
      x += sx;
    } else if (z !== b.z) {
      err += dx;
      z += sz;
    }
    push();
  }
  return out;
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
 * **One end a demand can have** — a banded network column standing within
 * {@link DESCENT_REACH} of a face.
 *
 * The amendment's whole subject. A demand used to be *a segment the router had
 * already drawn across the face*, which measured zero on every real document
 * for two structural reasons (the datum is 1-Lipschitz, so a carriageway can
 * never present a 2-riser; and the flights that race real cliffs are S9's seam
 * stairs, born a pass after recognition closes). A demand is now **a face
 * together with opposing network terminals** — and a terminal is one of these.
 */
interface FaceStation {
  /** The column, region-indexed. Banded by construction. */
  readonly idx: number;
  /** Its datum level — the level T5 makes the flight's own end an equality to. */
  readonly y: number;
  /** Chebyshev distance to the face, `0` on it. Decides the representative. */
  readonly dist: number;
  /** The segment that put it there — how D1 and D2 tell each other apart. */
  readonly segmentId: string;
  readonly rank: DescentDemand["rank"];
}

/**
 * **T12's break stations**, per segment — the D2 signal, read where the datum
 * already marks it.
 *
 * `ArcLevels.steps` is the flag the surfacer dresses a stepped station with
 * (`roads.ts:1769`, `:3778`): a station whose graded level differs from the one
 * before it is a street that **broke into steps rather than digging**, which is
 * T12 verbatim. WP-D3 measured the alternative — a 2-riser between adjacent
 * *path cells* — at exactly zero on every document, and could not have measured
 * anything else: `gradeProfile` is a lower envelope of unit cones, so
 * consecutive stations differ by at most one. The step flag is the signal; the
 * riser never was.
 */
function breakStations(region: Region, graph: StreetGraph, datum: StreetDatum): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const segment of graph.segments) {
    const levels = datum.bySegment.get(segment.id);
    if (levels === undefined) continue;
    const marks: number[] = [];
    for (let s = 1; s < levels.y.length; s++) {
      if ((levels.y[s] as number) === (levels.y[s - 1] as number)) continue;
      const p = levels.frame.stations[s] as { x: number; z: number } | undefined;
      if (p === undefined) continue;
      const k = descentIndex(region, Math.round(p.x), Math.round(p.z));
      if (k >= 0) marks.push(k);
    }
    if (marks.length > 0) out.set(segment.id, marks);
  }
  return out;
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
  //
  // **§1's demand definition, as amended at WP-D3: recognition is
  // connectivity, not segments.**
  //
  // > *a D1 demand is a face together with opposing network terminals — street
  // > / carriageway stations within `DESCENT_REACH` of the face on both sides
  // > at datum levels differing by the steep test — whether or not any stair
  // > yet exists; the solver PROVIDES the connection S9 would otherwise
  // > improvise. D2 demands read the break stations.*
  //
  // The old definition asked "which segment did the router already draw across
  // this face", and measured zero on every real document, for two reasons that
  // are both about *where a stair comes from* rather than about the solve: the
  // flights that race real cliffs are `deriveSeamStairs`' (pass 5b, after
  // recognition closes), and a carriageway's graded datum cannot present the
  // 2-riser the old D2 looked for. So the question is asked the other way
  // round, in the design's own original language — "the set of streets wanting
  // through" — and a stair the network does not yet have is exactly the case
  // the descent exists to serve.
  const breaks = breakStations(region, graph, datum);
  const demands: DescentDemand[] = [];
  // Chebyshev distance to the face under consideration, `-1` off it. One
  // allocation for the whole recognition; only the columns a face touched are
  // reset, so the cost is `O(Σ |face| · reach)` rather than `O(faces · cells)`.
  const reachDist = new Int32Array(region.width * region.depth).fill(-1);
  /**
   * **A street's reach is measured from its kerb, not from its centre line.**
   *
   * A path cell is a *centre* line; what stands beside the cliff is the band —
   * the carriageway's own half-width plus the sidewalk, which is precisely the
   * span `gradeStreetDatum` marks banded around that cell. A five-column avenue
   * with its kerb on the scarp has its centre line three columns back, and
   * measuring the reach to the centre would put that kerb out of the face's
   * world for want of three columns. So each segment is credited its own band
   * half-width, and the BFS runs far enough for the widest of them.
   */
  const creditOf = (segment: StreetSegment): number => ((segment.width - 1) >> 1) + graph.sidewalk;
  let widestCredit = 0;
  for (const segment of graph.segments) widestCredit = Math.max(widestCredit, creditOf(segment));
  for (const face of faces) {
    /* --- how far is every column from this face? ------------------------- */
    const touched: number[] = [];
    let frontier: number[] = [];
    for (const k of face.columns) {
      reachDist[k] = 0;
      touched.push(k);
      frontier.push(k);
    }
    for (let d = 1; d <= DESCENT_REACH + widestCredit && frontier.length > 0; d++) {
      const next: number[] = [];
      for (const k of frontier) {
        const i = k % region.width;
        const j = (k - i) / region.width;
        for (const [dx, dz] of STEP8) {
          const ii = i + dx;
          const jj = j + dz;
          if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
          const n = jj * region.width + ii;
          if ((reachDist[n] as number) >= 0) continue;
          reachDist[n] = d;
          touched.push(n);
          next.push(n);
        }
      }
      frontier = next;
    }

    /* --- the stations this face is offered ------------------------------- */
    //
    // One per **maximal run** of a segment's near-and-banded path cells, and
    // the representative is the cell of that run *nearest the face*: a street
    // running past a cliff for forty columns is one approach to it, not forty,
    // and the end that matters is the end the flight would leave from.
    //
    // `steps` segments are deliberately not station sources. A flight's own
    // band is graded by `streetStairLevels` against a frozen `natural`, and on
    // Troy's west cliff that grading stands **ten blocks** above its own ground
    // at the foot — the artefact this design exists to replace. Reading a
    // terminal off it would pin the search to mid-air, which is S5a with the
    // sign flipped. A face a router's flight crosses is still recognized: the
    // *streets at either end of that flight* are its stations.
    const stations: FaceStation[] = [];
    for (const segment of graph.segments) {
      const role = segment.role ?? "carriageway";
      if (role === "channel" || role === "steps" || segment.path.length < 2) continue;
      const rank = rankOf(segment);
      const reach = DESCENT_REACH + creditOf(segment);
      let best: FaceStation | undefined;
      let held = 0;
      const flush = (): void => {
        if (best !== undefined) stations.push(best);
        best = undefined;
        held = 0;
      };
      for (const cell of segment.path) {
        const k = descentIndex(region, cell.x, cell.z);
        if (k < 0 || (reachDist[k] as number) < 0 || (reachDist[k] as number) > reach || datum.band[k] !== 1) {
          flush();
          continue;
        }
        // **A long approach offers several stations, one every
        // `DESCENT_SHARE_SPAN` columns.** One per maximal run is right for a
        // street that touches a cliff and turns away; it is wrong for a street
        // that runs *along* a four-thousand-column face for eighty columns,
        // because then the one station it offers sits wherever the run happens
        // to come nearest, and the street on the other side offers its own
        // somewhere else entirely — two stations eighty columns apart, which R2
        // then correctly throws away, leaving the cliff unserved. Chunking at
        // the span past which §1.4 already calls two demands two problems keeps
        // the pairing local without adding a threshold: a pair either sits
        // inside one descent's span or it is two descents.
        if (held >= DESCENT_SHARE_SPAN) flush();
        held += 1;
        const here: FaceStation = {
          idx: k,
          y: datum.columnY[k] as number,
          dist: reachDist[k] as number,
          segmentId: segment.id,
          rank,
        };
        if (
          best === undefined ||
          here.dist < best.dist ||
          (here.dist === best.dist && here.idx < best.idx)
        ) {
          best = here;
        }
      }
      flush();
    }
    // M2's discipline applied to the pairing, which is quadratic in this list:
    // nearest first, ties by ascending region index, and never more than the
    // bound. Sorted unconditionally so the pairing order is a pure function of
    // the face rather than of `graph.segments`' order.
    stations.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.idx - b.idx));
    if (stations.length > DESCENT_FACE_STATIONS_MAX) stations.length = DESCENT_FACE_STATIONS_MAX;

    /* --- the pairs that are demands -------------------------------------- */
    const pairs: { readonly a: number; readonly b: number; readonly span: number; readonly drop: number }[] = [];
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        const u = stations[i] as FaceStation;
        const v = stations[j] as FaceStation;
        const drop = Math.abs(u.y - v.y);
        // R1 — the drop needing at least one retaining wall to be a face at all.
        if (drop < DESCENT_DROP_MIN) continue;
        // R2 — the same ratio the walkability audit decides an earned drop with.
        const span = chebyshev(columnAt(region, u.idx), columnAt(region, v.idx));
        if (span >= DESCENT_EARN_RATIO * drop) continue;
        // **Opposing.** The face has to lie *between* them, or the two stations
        // are two points on one side of a cliff and the drop between them is
        // somebody else's. The 4-connected line is the test and, below, the
        // demand's own corridor hint — one construction, so a pair that passed
        // the test always hands the search a domain it can cross.
        const between = line4(region, u.idx, v.idx);
        let crosses = false;
        for (let n = 1; n + 1 < between.length; n++) {
          if (face.mask[between[n] as number] === 1) {
            crosses = true;
            break;
          }
        }
        if (!crosses) continue;
        // **D2, and why it is a restriction rather than a second search.** Two
        // stations of *the same segment* are a connection the network already
        // has: the street goes round, and a stair beside a working street is
        // the thing §5.3 deletes. Unless the street's own datum carries T12's
        // break markers inside the face — in which case what it "has" is a
        // carriageway broken into a staircase by the grader, which is exactly
        // the case the design named D2 and asked the solver to take over.
        if (u.segmentId === v.segmentId) {
          const marks = breaks.get(u.segmentId);
          if (marks === undefined || !marks.some((k) => face.mask[k] === 1)) continue;
        }
        pairs.push({ a: i, b: j, span, drop });
      }
    }
    // Greedy over the pairs, closest first — a **matching**, so no station is
    // two demands' terminal and a face with four approaches produces two
    // descents rather than six. Ties break by drop (the steeper pair is the one
    // the cliff is about) and then by region index, so the answer is a pure
    // function of the face.
    pairs.sort(
      (p, q) =>
        p.span - q.span ||
        q.drop - p.drop ||
        (stations[p.a] as FaceStation).idx - (stations[q.a] as FaceStation).idx ||
        (stations[p.b] as FaceStation).idx - (stations[q.b] as FaceStation).idx,
    );
    const spent = new Uint8Array(stations.length);
    for (const pair of pairs) {
      if (spent[pair.a] === 1 || spent[pair.b] === 1) continue;
      spent[pair.a] = 1;
      spent[pair.b] = 1;
      const u = stations[pair.a] as FaceStation;
      const v = stations[pair.b] as FaceStation;
      const upper = u.y > v.y ? u : v;
      const lower = u.y > v.y ? v : u;
      const from = columnAt(region, upper.idx);
      const to = columnAt(region, lower.idx);
      // The heading a demand starts in. A connectivity demand has no "direction
      // of travel arriving at the top" — nobody was travelling; a street was
      // standing beside a cliff. So it is the demand's **own** direction, taken
      // on the dominant axis, which is the one heading whose first step is not
      // a turn the flight has to pay for before it has begun.
      const heading = headingOf(
        from,
        Math.abs(to.x - from.x) >= Math.abs(to.z - from.z)
          ? { x: from.x + Math.sign(to.x - from.x), z: from.z }
          : { x: from.x, z: from.z + Math.sign(to.z - from.z) },
      );
      demands.push({
        segmentId: `descent:${face.id}:${upper.idx}-${lower.idx}`,
        source: u.segmentId === v.segmentId ? "D2" : "D1",
        faceId: face.id,
        top: upper.idx,
        topY: upper.y,
        bottom: lower.idx,
        bottomY: lower.y,
        heading,
        // The search domain is the face **plus the line between the terminals**
        // — both of which may stand off it by up to `DESCENT_REACH` columns, so
        // without the line the domain is not connected and every demand refuses
        // `unreachable`.
        corridorHint: line4(region, upper.idx, lower.idx),
        width: DESCENT_FLIGHT_WIDTH,
        // T14's key. The **streets'** rank, not the flight's: which of two
        // demands over one face is the trunk is a question about which network
        // wanted through more, and a flight that does not exist yet has no
        // width to be senior by. The id keeps the order total.
        rank: {
          id: `descent:${face.id}:${upper.idx}-${lower.idx}`,
          width: Math.min(upper.rank.width, lower.rank.width),
          role: upper.rank.role,
          kind: upper.rank.kind,
        },
      });
    }

    for (const k of touched) reachDist[k] = -1;
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
      // §6.2's S4 row, made true by construction: one object, at most one
      // branch. The demands this drops are the junior ones, and a third street
      // wanting down the same cliff within `DESCENT_SHARE_SPAN` of the other
      // two is asking for a stair beside a stair.
      groups.push(bucket.slice(0, DESCENT_GROUP_DEMANDS_MAX));
    }
  }

  return { faces, demands, groups, refusals, seeds };
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
interface DescentCost {
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
  /**
   * The width class the run is surfaced as — the senior terminal's.
   *
   * Carried on the run rather than looked up at the surfacer because, since the
   * WP-D3 amendment, **a run need not belong to a segment at all**: a demand is
   * a face plus two stations, so the flight the descent builds is one nothing
   * else in the graph has ever named. What the surfacer needs off it — a width,
   * a role, a width class — travels with it.
   */
  readonly widthClass: StreetOwnerKind;
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
      widthClass: demand.rank.kind,
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
}): { readonly run?: Omit<DescentRun, "demandId" | "kind" | "width" | "widthClass">; readonly states: number } {
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
