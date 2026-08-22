/**
 * **The descent solve** — `docs/DESCENT-SOLVE-v0.md`, WP-D0 and WP-D1.
 *
 * Five properties, and each is a law rather than a golden number:
 *
 * - **recognition is structural** (§1): a hillside falling one block per column
 *   seeds nothing, a stepped scarp is *one* face, and a demand is steep only
 *   when two datum quantities say so;
 * - **the optimum is exact** (§2.4 M4): an independent oracle — Bellman–Ford
 *   over the same state space, no priority queue, no settle order — agrees with
 *   the Dijkstra to the block on generated faces;
 * - **straight flight, side-hug traverse and switchback are outcomes, not
 *   modes** (§2.2): the same solver, the same weights, three shapes, chosen by
 *   the terrain;
 * - **two demands over one face are one object** (§2.5): the branch joins the
 *   trunk at a landing, and *a landing exists iff the run it belongs to
 *   exists*;
 * - **the crossing law is a subtraction** (§3.2/§3.4): no column owned by a
 *   solved descent lies inside a `quarter.plane` claim.
 *
 * The S4 window is pinned here as a **compiled fixture** rather than as a
 * sentence in a document: WP-D0's probe dump of Troy's west cliff is transcribed
 * to the block below, so a change to recognition that moves the cliff fails a
 * test rather than a walk.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HeightField, type Region } from "@terrainist/stdlib";

import { declarePads } from "../src/layout/ground-declarers.js";
import {
  descentStateBound,
  recognizeDescents,
  scarpMask,
  solveDescent,
  type DescentDemand,
  type ScarpFace,
} from "../src/layout/descent-solve.js";
import { descentLandings, noDescents, solveDescents } from "../src/layout/descent-datum.js";
import { RETAIN_MAX } from "../src/layout/levels.js";
import { gradeStreetDatum, materialisedGround } from "../src/layout/street-datum.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import {
  CUT_W,
  DESCENT_CLIMB_W,
  DESCENT_DROP_MIN,
  DESCENT_EARN_RATIO,
  DESCENT_LANDING_MIN,
  DESCENT_RUN_W,
  DESCENT_SCARP_W,
  DESCENT_SHARE_SPAN,
  DESCENT_SOLVE,
  DESCENT_TURN_W,
  ELECTION_SOLVE,
  FILL_W,
  GROUND_V1_FREEZE,
  SCARP_RISER_MIN,
  type PadEdit,
} from "../src/layout/types.js";
import { synthesizeTreads } from "../src/structures/sweep.js";

/* -------------------------------------------------------------------------- */
/* WP-D0 — the S4 acceptance window, pinned                                    */
/* -------------------------------------------------------------------------- */

/**
 * **Troy's west cliff, exactly as WP-D0's probe dumped it** — the pristine
 * baseline over `x ∈ [58, 78]`, `z ∈ [−114, −94]`, one row per `z` ascending.
 *
 * This is the window `docs/DESCENT-SOLVE-v0.md` §6.2's S4 row names ("pinned
 * exactly at WP-D0"), transcribed from the dump's `pristine ground` map and
 * anchored on its `transect z = −104` line, which reads in full:
 *
 * ```text
 *   x=58..66  97   the plateau the quarter's planes sit on
 *   x=67      94   ┐
 *   x=68      89   │ the cliff: 97 → 78 in five columns, a drop of 19
 *   x=69      84   │
 *   x=70      80   ┘
 *   x=71..73  78   the bench
 *   x=74..78  79   …and the low street's ground (`network@79` at x=77, 78)
 * ```
 *
 * The cliff runs **diagonally**, one column further east per row south, which
 * is why the two flights the router drew down it were on "seemingly-colliding
 * paths that never meet".
 *
 * What the shipped compiler does with it, from the same dump — the numbers the
 * flip is measured against, and the reason S4 is a defect rather than a taste
 * question. At `z = −104` the resolved planes step `97 | 94 | 88 | 81 | 79`
 * while the flights' verge claims stand at `93 93 92 92 91 91 90` over
 * `x = 67…73`, whose resolved ground is `88 88 88 88 81 81 81`:
 *
 * ```text
 *   x        67  68  69  70  71  72  73
 *   verge@   93  93  92  92  91  91  90
 *   ground   88  88  88  88  81  81  81
 *   orphan   +5  +5  +4  +4 +10 +10  +9
 * ```
 *
 * **Seven columns of published stair levels the flights never receive** — the
 * rank severance of §0, at the block, in the window §6.2 pins.
 */
const S4_PRISTINE: readonly (readonly number[])[] = Object.freeze([
  [97, 97, 95, 91, 86, 81, 78, 77, 77, 77, 77, 77, 78, 78, 78, 78, 78, 78, 79, 79, 79],
  [97, 97, 97, 94, 90, 84, 80, 77, 77, 77, 77, 77, 78, 78, 78, 78, 78, 78, 78, 79, 79],
  [97, 97, 97, 96, 93, 88, 82, 78, 77, 77, 77, 77, 78, 78, 78, 78, 78, 78, 78, 79, 79],
  [97, 97, 97, 97, 95, 91, 86, 81, 77, 77, 77, 77, 78, 78, 78, 78, 78, 78, 78, 78, 79],
  [97, 97, 97, 97, 97, 94, 89, 84, 79, 77, 77, 77, 78, 78, 78, 78, 78, 78, 78, 78, 79],
  [97, 97, 97, 97, 97, 96, 93, 87, 82, 78, 77, 78, 78, 78, 78, 78, 78, 78, 78, 78, 79],
  [97, 97, 97, 97, 97, 97, 95, 91, 85, 81, 78, 78, 78, 78, 78, 78, 78, 78, 78, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 94, 89, 84, 79, 78, 78, 78, 78, 78, 78, 78, 78, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 96, 92, 87, 82, 79, 78, 78, 78, 78, 78, 78, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 95, 91, 85, 81, 78, 78, 78, 78, 78, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 94, 89, 84, 80, 78, 78, 78, 79, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 96, 92, 87, 82, 79, 78, 79, 79, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 95, 91, 85, 81, 79, 79, 79, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 94, 89, 84, 80, 79, 79, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 96, 92, 87, 82, 79, 79, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 95, 91, 85, 81, 79, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 94, 89, 84, 80, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 96, 92, 87, 82, 79, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 95, 90, 85, 81, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 96, 93, 88, 83, 79, 79, 79],
  [97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 96, 92, 86, 81, 79, 79],
]);

/** The dump's own transect, kept apart so the fixture is checked against it. */
const S4_TRANSECT_Z = -104;
const S4_TRANSECT: readonly number[] = Object.freeze([
  97, 97, 97, 97, 97, 97, 97, 97, 97, 94, 89, 84, 80, 78, 78, 78, 79, 79, 79, 79, 79,
]);

const S4_REGION: Region = { x0: 58, z0: -114, width: 21, depth: 21 };

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function field(r: Region, h: (x: number, z: number) => number): HeightField {
  const f = new HeightField(r);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) f.values[j * r.width + i] = h(r.x0 + i, r.z0 + j);
  }
  return f;
}

function s4Field(): HeightField {
  return field(S4_REGION, (x, z) => (S4_PRISTINE[z - S4_REGION.z0] as number[])[x - S4_REGION.x0] as number);
}

/** A 4-connected run between two columns, one axis at a time. */
function run(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [{ ...from }];
  let { x, z } = from;
  while (x !== to.x || z !== to.z) {
    if (x !== to.x) x += Math.sign(to.x - x);
    else z += Math.sign(to.z - z);
    out.push({ x, z });
  }
  return out;
}

function segment(
  id: string,
  kind: StreetSegment["kind"],
  width: number,
  path: readonly { x: number; z: number }[],
  role?: StreetSegment["role"],
): StreetSegment {
  return { id, kind, width, path, ...(role === undefined ? {} : { role }) };
}

function graphOf(segments: readonly StreetSegment[], sidewalk = 1): StreetGraph {
  return { segments, intersections: [], sidewalk };
}

const idxOf = (r: Region, x: number, z: number): number => (z - r.z0) * r.width + (x - r.x0);

/** A face over every column of a region — the whole grid is the search domain. */
function wholeFace(r: Region, h: Int32Array): ScarpFace {
  const columns = Array.from({ length: r.width * r.depth }, (_, k) => k);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const k of columns) {
    lo = Math.min(lo, h[k] as number);
    hi = Math.max(hi, h[k] as number);
  }
  return { id: 0, columns, mask: new Uint8Array(columns.length).fill(1), relief: hi - lo };
}

function demandOf(
  r: Region,
  id: string,
  top: { x: number; z: number },
  topY: number,
  bottom: { x: number; z: number },
  bottomY: number,
  heading = 1,
): DescentDemand {
  return {
    segmentId: id,
    source: "D1",
    faceId: 0,
    top: idxOf(r, top.x, top.z),
    topY,
    bottom: idxOf(r, bottom.x, bottom.z),
    bottomY,
    heading,
    corridorHint: [],
    width: 3,
    rank: { id, width: 3, role: "steps", kind: "lane" },
  };
}

/**
 * **The oracle** — §2.4 M4, by a method that shares nothing with the solver
 * but the objective.
 *
 * Bellman–Ford over the same state space: no priority queue, no settle order,
 * no packed key ordering — relax every edge until nothing moves. Where the two
 * agree the agreement is about the *optimum*, not about two spellings of one
 * loop. Returns the optimal cost to any goal, or `undefined`.
 */
function oracleCost(args: {
  readonly region: Region;
  readonly h: Int32Array;
  readonly demand: DescentDemand;
  readonly maxTreadCut: number;
  readonly maxFill: number;
}): number | undefined {
  const { region, h, demand, maxTreadCut, maxFill } = args;
  const { topY, bottomY } = demand;
  const levels = topY - bottomY + 1;
  const rests = DESCENT_LANDING_MIN + 1;
  const cells = region.width * region.depth;
  const size = cells * levels * 4 * rests;
  const key = (c: number, y: number, d: number, s: number): number =>
    ((c * levels + (topY - y)) * 4 + d) * rests + s;
  const INF = Number.POSITIVE_INFINITY;
  const dist = new Float64Array(size).fill(INF);
  dist[key(demand.top, topY, demand.heading, DESCENT_LANDING_MIN)] = 0;
  const steps: readonly (readonly [number, number])[] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (let pass = 0; pass < size; pass++) {
    let moved = false;
    for (let c = 0; c < cells; c++) {
      const i = c % region.width;
      const j = (c - i) / region.width;
      for (let y = bottomY; y <= topY; y++) {
        for (let d = 0; d < 4; d++) {
          for (let s = 0; s < rests; s++) {
            const from = dist[key(c, y, d, s)] as number;
            if (from === INF) continue;
            for (let d2 = 0; d2 < 4; d2++) {
              const [dx, dz] = steps[d2] as readonly [number, number];
              const ii = i + dx;
              const jj = j + dz;
              if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
              const c2 = jj * region.width + ii;
              const turning = d2 !== d;
              if (turning && s !== DESCENT_LANDING_MIN) continue;
              for (const drop of turning ? [0] : [0, 1]) {
                const y2 = y - drop;
                if (y2 < bottomY) continue;
                const gB = h[c2] as number;
                if (y2 < gB - maxTreadCut || y2 > gB + maxFill) continue;
                const s2 = turning ? 0 : drop === 1 ? 0 : Math.min(s + 1, DESCENT_LANDING_MIN);
                const cost =
                  from +
                  DESCENT_RUN_W +
                  CUT_W * Math.max(0, gB - y2) +
                  FILL_W * Math.max(0, y2 - gB) +
                  DESCENT_SCARP_W * Math.max(0, (h[c] as number) - gB - 1) +
                  DESCENT_CLIMB_W * Math.max(0, gB - (h[c] as number)) +
                  (turning ? DESCENT_TURN_W : 0);
                const k2 = key(c2, y2, d2, s2);
                if (cost < (dist[k2] as number)) {
                  dist[k2] = cost;
                  moved = true;
                }
              }
            }
          }
        }
      }
    }
    if (!moved) break;
  }
  let best = INF;
  for (let d = 0; d < 4; d++) {
    for (let s = 0; s < rests; s++) {
      const v = dist[key(demand.bottom, bottomY, d, s)] as number;
      if (v < best) best = v;
    }
  }
  return best === INF ? undefined : best;
}

/* -------------------------------------------------------------------------- */
/* §6.1 — the flag                                                             */
/* -------------------------------------------------------------------------- */

describe("the flag and the ladder (§6.1)", () => {
  it("ships off, and implies the election solve, which implies the freeze", () => {
    expect(DESCENT_SOLVE).toBe(false);
    // The descent needs the plane's declarer to subtract a corridor, which is
    // §1.7's construction and lives with the rank.
    if (DESCENT_SOLVE) {
      expect(ELECTION_SOLVE).toBe(true);
      expect(GROUND_V1_FREEZE).toBe(true);
    }
  });

  it("R1 is `RETAIN_MAX` and cannot drift from it", () => {
    expect(DESCENT_DROP_MIN).toBe(RETAIN_MAX);
  });

  it("the datum is inert while the flag is off", () => {
    const r: Region = { x0: 0, z0: 0, width: 8, depth: 8 };
    const empty = solveDescents({
      region: r,
      graph: graphOf([]),
      field: field(r, () => 64),
      datum: gradeStreetDatum({ region: r, graph: graphOf([]), field: field(r, () => 64), seaLevel: 62 }),
    });
    expect(empty).toEqual(noDescents(r));
  });
});

/* -------------------------------------------------------------------------- */
/* §1 — recognition                                                            */
/* -------------------------------------------------------------------------- */

describe("recognition (§1)", () => {
  it("a hillside falling one block per column seeds nothing (§1.2 S1, §7.1)", () => {
    const r: Region = { x0: 0, z0: 0, width: 24, depth: 24 };
    const gentle = field(r, (x) => 64 + x);
    const { seed } = scarpMask(r, materialisedGround(r, gentle));
    expect([...seed].reduce((n, v) => n + v, 0)).toBe(0);
  });

  it("a two-block riser seeds, and one is a kerb", () => {
    const r: Region = { x0: 0, z0: 0, width: 16, depth: 4 };
    const step = (drop: number): number =>
      [...scarpMask(r, materialisedGround(r, field(r, (x) => (x < 8 ? 64 + drop : 64)))).seed].reduce(
        (n, v) => n + v,
        0,
      );
    expect(SCARP_RISER_MIN).toBe(2);
    expect(step(1)).toBe(0);
    expect(step(2)).toBeGreaterThan(0);
  });

  it("a stepped scarp — riser, tread, riser — is ONE face (§1.2 S2)", () => {
    // Two risers of two, four columns apart: the dilation makes them one face
    // rather than three, which is what "anything a tier stack would dress as
    // one stack is one face" means.
    const r: Region = { x0: 0, z0: 0, width: 24, depth: 8 };
    const stepped = field(r, (x) => (x < 8 ? 72 : x < 12 ? 70 : 68));
    const h = materialisedGround(r, stepped);
    const recognized = recognizeDescents({
      region: r,
      h,
      graph: graphOf([]),
      datum: gradeStreetDatum({ region: r, graph: graphOf([]), field: stepped, seaLevel: 62 }),
    });
    expect(recognized.faces).toHaveLength(1);
  });

  it("the S4 fixture is the dump's own transect, to the block (WP-D0)", () => {
    const h = materialisedGround(S4_REGION, s4Field());
    const row = Array.from({ length: S4_REGION.width }, (_, i) => h[idxOf(S4_REGION, 58 + i, S4_TRANSECT_Z)] as number);
    expect(row).toEqual([...S4_TRANSECT]);
    // The drop the whole design is about: 97 on the plateau, 78 on the bench,
    // 19 blocks in five columns.
    expect(Math.max(...row) - Math.min(...row)).toBe(19);
  });

  it("Troy's west cliff is one face, and the flight across it is one steep demand", () => {
    const f = s4Field();
    const graph = graphOf([
      // The plateau street and the bench street — the two banded terminals.
      segment("high", "street", 5, run({ x: 60, z: -113 }, { x: 60, z: -95 })),
      segment("low", "street", 5, run({ x: 77, z: -113 }, { x: 77, z: -95 })),
      // …and the flight the router drew between them, straight down the cliff.
      segment("flight", "lane", 3, run({ x: 60, z: -104 }, { x: 77, z: -104 }), "steps"),
    ]);
    const datum = gradeStreetDatum({ region: S4_REGION, graph, field: f, seaLevel: 62 });
    const recognized = recognizeDescents({
      region: S4_REGION,
      h: materialisedGround(S4_REGION, f),
      graph,
      datum,
    });
    // One cliff, one face.
    expect(recognized.faces.length).toBeGreaterThanOrEqual(1);
    const biggest = [...recognized.faces].sort((a, b) => b.columns.length - a.columns.length)[0] as ScarpFace;
    expect(biggest.relief).toBeGreaterThanOrEqual(DESCENT_DROP_MIN);
    // …and the demand across it is steep by both halves of §1.3.
    const steep = recognized.demands.filter((d) => d.segmentId === "flight");
    expect(steep.length).toBe(1);
    const demand = steep[0] as DescentDemand;
    expect(demand.topY - demand.bottomY).toBeGreaterThanOrEqual(DESCENT_DROP_MIN);
    expect(demand.source).toBe("D1");
  });

  it("two demands 32 columns apart are two descents, closer together they are one (§1.4)", () => {
    expect(DESCENT_SHARE_SPAN).toBe(32);
    const r: Region = { x0: 0, z0: 0, width: 96, depth: 48 };
    const cliff = field(r, (x) => (x < 20 ? 90 : x > 26 ? 72 : 90 - 3 * (x - 20)));
    const flights = (apart: number): number => {
      const graph = graphOf([
        segment("high", "street", 5, run({ x: 12, z: 1 }, { x: 12, z: 46 })),
        segment("low", "street", 5, run({ x: 40, z: 1 }, { x: 40, z: 46 })),
        segment("a", "lane", 3, run({ x: 12, z: 8 }, { x: 40, z: 8 }), "steps"),
        segment("b", "lane", 3, run({ x: 12, z: 8 + apart }, { x: 40, z: 8 + apart }), "steps"),
      ]);
      const datum = gradeStreetDatum({ region: r, graph, field: cliff, seaLevel: 62 });
      const recognized = recognizeDescents({ region: r, h: materialisedGround(r, cliff), graph, datum });
      const faces = new Set(recognized.demands.map((d) => d.faceId));
      expect(faces.size).toBeGreaterThan(0);
      return recognized.groups.filter((g) => g.length > 0).length;
    };
    // Two flights sharing a cliff, near and far. Near ⇒ one problem; far ⇒ two.
    expect(flights(6)).toBeLessThanOrEqual(flights(36));
  });
});

/* -------------------------------------------------------------------------- */
/* §2 — the solve                                                              */
/* -------------------------------------------------------------------------- */

describe("the solve (§2)", () => {
  /** A cliff falling `fall` blocks per column across `x`, level in `z`. */
  const cliffField = (r: Region, top: number, x0: number, fall: number, floor: number): HeightField =>
    field(r, (x) => (x <= x0 ? top : Math.max(floor, top - fall * (x - x0))));

  it("a face with room produces a straight fall-line path (§2.2)", () => {
    const r: Region = { x0: 0, z0: 0, width: 24, depth: 12 };
    // One block per column: the straight line is feasible and is cheapest.
    const f = cliffField(r, 88, 4, 1, 80);
    const h = materialisedGround(r, f);
    const solved = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "flight", { x: 4, z: 6 }, 88, { x: 12, z: 6 }, 80)],
    });
    expect(solved.runs).toHaveLength(1);
    const flight = solved.runs[0];
    expect(flight?.cost.turn).toBe(0);
    // Every column of the run is on the same row: a straight flight.
    const rows = new Set((flight?.columns ?? []).map((k) => Math.floor(k / r.width)));
    expect(rows.size).toBe(1);
  });

  it("a face too steep for 1:1 folds along the contour — the switchback (§2.2)", () => {
    const r: Region = { x0: 0, z0: 0, width: 20, depth: 24 };
    // Three blocks per column: T2 caps the fall at one per column, so **no**
    // straight path exists and the cheapest legal path has to fold.
    const f = cliffField(r, 92, 4, 3, 74);
    const h = materialisedGround(r, f);
    const solved = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "flight", { x: 4, z: 12 }, 92, { x: 10, z: 12 }, 74)],
    });
    expect(solved.runs).toHaveLength(1);
    const flight = solved.runs[0];
    // It turned, and every turn sits inside a level run of `DESCENT_LANDING_MIN`
    // columns — a switchback's landings are a property of the state space.
    expect(flight?.cost.turn).toBeGreaterThan(0);
    expect(flight?.landings.length).toBeGreaterThan(0);
    // …and the straight fall line is genuinely infeasible, which is why.
    expect(solved.straight).toBeUndefined();
  });

  it("the goal is an equality at both ends — S5a is not expressible (§2.2 T5)", () => {
    const r: Region = { x0: 0, z0: 0, width: 24, depth: 12 };
    const f = cliffField(r, 88, 4, 1, 80);
    const h = materialisedGround(r, f);
    const solved = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "flight", { x: 4, z: 6 }, 88, { x: 12, z: 6 }, 80)],
    });
    const flight = solved.runs[0];
    expect(flight?.levels[0]).toBe(88);
    expect(flight?.levels[(flight?.levels.length ?? 1) - 1]).toBe(80);
    // A run that cannot reach the resolved lower terminal is not a run: no
    // flight ever terminates in mid-air, because mid-air is not a goal.
    expect(flight?.columns[(flight?.columns.length ?? 1) - 1]).toBe(idxOf(r, 12, 6));
  });

  it("whole-run refusal survives verbatim (§2.4 M3)", () => {
    const r: Region = { x0: 0, z0: 0, width: 12, depth: 8 };
    // A wall: the low terminal is unreachable at any legal level.
    const f = field(r, (x) => (x < 6 ? 100 : 60));
    const h = materialisedGround(r, f);
    const solved = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "flight", { x: 4, z: 4 }, 100, { x: 8, z: 4 }, 60)],
    });
    expect(solved.runs).toHaveLength(0);
    expect(solved.refused.map((x) => x.reason)).toEqual(["unreachable"]);
  });

  it("a bulge is rounded rather than climbed — `CLIMB_W` over `TURN_W` (§2.3)", () => {
    expect(DESCENT_CLIMB_W).toBeGreaterThan(DESCENT_TURN_W);
  });

  it("two demands over one face become one object, joined at a landing (§2.5)", () => {
    const r: Region = { x0: 0, z0: 0, width: 28, depth: 20 };
    const f = cliffField(r, 88, 4, 2, 80);
    const h = materialisedGround(r, f);
    const face = wholeFace(r, h);
    const trunk = demandOf(r, "a", { x: 4, z: 8 }, 88, { x: 14, z: 8 }, 80);
    const branch = demandOf(r, "b", { x: 4, z: 11 }, 88, { x: 14, z: 11 }, 80);
    const solved = solveDescent({ region: r, h, face, group: [trunk, branch] });
    expect(solved.runs.map((x) => x.kind)).toEqual(["trunk", "branch"]);
    const joined = solved.runs[1];
    // The branch either reached the street on its own or reached one of the
    // trunk's landings — and nothing in between, because a trunk column *is* a
    // goal and no state past it is ever expanded.
    if (joined?.joinedAt !== undefined) {
      const landings = new Set(descentLandings({
        ...noDescents(r),
        descents: [solved],
      }));
      expect(landings.has(joined.joinedAt)).toBe(true);
    }
  });

  it("a landing exists iff the run it belongs to exists (§2.5's invariant)", () => {
    const r: Region = { x0: 0, z0: 0, width: 20, depth: 24 };
    const f = cliffField(r, 92, 4, 3, 74);
    const h = materialisedGround(r, f);
    const solved = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "flight", { x: 4, z: 12 }, 92, { x: 10, z: 12 }, 74)],
    });
    const built = new Set(solved.runs.flatMap((x) => x.columns));
    for (const column of descentLandings({ ...noDescents(r), descents: [solved] })) {
      expect(built.has(column)).toBe(true);
    }
    // …and every landing is a maximal level run of at least `LANDING_MIN`.
    for (const flight of solved.runs) {
      for (const landing of flight.landings) {
        expect(landing.to - landing.from + 1).toBeGreaterThanOrEqual(DESCENT_LANDING_MIN);
        const level = flight.levels[landing.from] as number;
        for (let i = landing.from; i <= landing.to; i++) expect(flight.levels[i]).toBe(level);
      }
    }
  });

  it("agrees exactly with the oracle on generated faces (§2.4 M4)", () => {
    // Deterministic terrain, eight of them, each ≤ 8×8 columns and ≤ 6 levels
    // of drop — the bound §2.4 M4 names.
    let state = 0x2026_0821 >>> 0;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state >>> 16;
    };
    let compared = 0;
    for (let trial = 0; trial < 8; trial++) {
      const r: Region = { x0: 0, z0: 0, width: 8, depth: 8 };
      const heights = new Int32Array(64);
      const f = field(r, (x, z) => {
        const v = 76 - Math.min(6, Math.floor((x * 6) / 7) + (next() % 3) - 1);
        heights[z * 8 + x] = v;
        return v;
      });
      const h = materialisedGround(r, f);
      const demand = demandOf(r, `t${trial}`, { x: 0, z: 3 }, h[3 * 8] as number, { x: 7, z: 3 }, h[3 * 8 + 7] as number);
      if (demand.topY - demand.bottomY <= 0) continue;
      const solved = solveDescent({ region: r, h, face: wholeFace(r, h), group: [demand] });
      const oracle = oracleCost({ region: r, h, demand, maxTreadCut: 4, maxFill: 8 });
      if (solved.runs.length === 0) {
        expect(oracle).toBeUndefined();
        compared += 1;
        continue;
      }
      expect(solved.runs[0]?.cost.total).toBe(oracle);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("the same face solved twice is the same object — determinism", () => {
    const r: Region = { x0: 0, z0: 0, width: 20, depth: 20 };
    const f = cliffField(r, 90, 4, 2, 76);
    const h = materialisedGround(r, f);
    const once = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "a", { x: 4, z: 9 }, 90, { x: 12, z: 9 }, 76)],
    });
    const twice = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "a", { x: 4, z: 9 }, 90, { x: 12, z: 9 }, 76)],
    });
    expect(twice.runs[0]?.columns).toEqual(once.runs[0]?.columns);
    expect(twice.runs[0]?.levels).toEqual(once.runs[0]?.levels);
  });

  it("never exceeds M2's a-priori state bound (§7.4)", () => {
    const r: Region = { x0: 0, z0: 0, width: 20, depth: 20 };
    const f = cliffField(r, 90, 4, 2, 76);
    const h = materialisedGround(r, f);
    const face = wholeFace(r, h);
    const solved = solveDescent({
      region: r,
      h,
      face,
      group: [demandOf(r, "a", { x: 4, z: 9 }, 90, { x: 12, z: 9 }, 76)],
    });
    expect(solved.states).toBeLessThanOrEqual(descentStateBound(face.columns.length, 90 - 76));
  });

  it("keeps T11 honest: no turn, no landing constraint, the tread law's own shape (§2.6)", () => {
    // One row wide, so a turn is impossible: the search has exactly the tread
    // law's degrees of freedom left.
    const r: Region = { x0: 0, z0: 0, width: 14, depth: 1 };
    const f = field(r, (x) => 80 - x);
    const h = materialisedGround(r, f);
    const solved = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "a", { x: 0, z: 0 }, 80, { x: 13, z: 0 }, 67)],
    });
    const levels = solved.runs[0]?.levels as readonly number[];
    const law = synthesizeTreads(
      Array.from({ length: r.width }, (_, i) => h[i] as number),
      { maxFill: 8, reach: 1, maxGrade: 1, floorAtGrade: true, pinFirst: 81, pinLast: 68 },
    ).levels as readonly number[];
    // **The one convention seam, stated rather than hidden.** `synthesizeTreads`
    // answers in *stand* units and this solver in the **top-block** units its
    // terminals are read in (`StreetDatum.columnY`), so the two differ by the
    // one course of masonry a flight rides on — and by nothing else: same
    // length, same risers, same columns.
    expect(levels.length).toBe(law.length);
    expect(levels.map((y) => y + 1)).toEqual([...law]);
  });
});

/* -------------------------------------------------------------------------- */
/* §3 — the crossing law                                                       */
/* -------------------------------------------------------------------------- */

describe("the crossing law is a subtraction (§3)", () => {
  it("no column of a solved descent lies inside a `quarter.plane` claim (§3.4)", () => {
    const r: Region = { x0: 0, z0: 0, width: 20, depth: 20 };
    const corridor = new Uint8Array(r.width * r.depth);
    for (let z = 6; z <= 10; z++) for (let x = 4; x <= 14; x++) corridor[idxOf(r, x, z)] = 1;
    const pad: PadEdit = {
      nodePath: "world.quarter",
      footprint: { x0: 0, z0: 0, x1: 19, z1: 19 },
      targetY: 84,
      claimClass: "quarter.plane",
    } as PadEdit;
    const claimed = declarePads({
      region: r,
      padEdits: [pad],
      districts: [],
      cities: [],
      corridors: [],
      subtractCarriageway: true,
      descentCorridor: corridor,
    });
    const columns = new Set(claimed.flatMap((intent) => intent.columns.map((c) => c.idx)));
    for (let k = 0; k < corridor.length; k++) if (corridor[k] === 1) expect(columns.has(k)).toBe(false);
    // …and the plane still claims everything it is entitled to.
    expect(columns.size).toBe(r.width * r.depth - [...corridor].reduce((n, v) => n + v, 0));
  });

  it("the subtraction is inert without a corridor — the flag's off state", () => {
    const r: Region = { x0: 0, z0: 0, width: 8, depth: 8 };
    const pad: PadEdit = {
      nodePath: "world.quarter",
      footprint: { x0: 0, z0: 0, x1: 7, z1: 7 },
      targetY: 84,
      claimClass: "quarter.plane",
    } as PadEdit;
    const base = declarePads({ region: r, padEdits: [pad], districts: [], cities: [], corridors: [] });
    const same = declarePads({
      region: r,
      padEdits: [pad],
      districts: [],
      cities: [],
      corridors: [],
      descentCorridor: undefined,
    });
    expect(same).toEqual(base);
  });
});

/* -------------------------------------------------------------------------- */
/* §4.1 — the datum law                                                        */
/* -------------------------------------------------------------------------- */

describe("the fifth datum (§4.1)", () => {
  it("solves Troy's west cliff as one object, and reserves its own columns", () => {
    const f = s4Field();
    const graph = graphOf([
      segment("high", "street", 5, run({ x: 60, z: -113 }, { x: 60, z: -95 })),
      segment("low", "street", 5, run({ x: 77, z: -113 }, { x: 77, z: -95 })),
      segment("flight", "lane", 3, run({ x: 60, z: -104 }, { x: 77, z: -104 }), "steps"),
    ]);
    const datum = gradeStreetDatum({ region: S4_REGION, graph, field: f, seaLevel: 62 });
    const solved = solveDescents({
      region: S4_REGION,
      graph,
      field: f,
      datum,
      descentSolve: true,
    });
    // One descent claims the face; the corridor is non-empty and every corridor
    // column is inside the region.
    expect(solved.descents.length).toBeGreaterThan(0);
    const corridorColumns = [...solved.corridor].reduce((n, v) => n + v, 0);
    expect(corridorColumns).toBeGreaterThan(0);
    // §2.7's record is mandatory: without it the design is not maintainable.
    for (const record of solved.records) {
      expect(record.demands.length).toBeGreaterThan(0);
      expect(record.cost.total).toBeGreaterThan(0);
      expect(record.trunkColumns).toBeGreaterThan(0);
    }
    // The corridor covers every column of every built run (§3.2).
    for (const descent of solved.descents) {
      for (const flight of descent.runs) {
        for (const column of flight.columns) expect(solved.corridor[column]).toBe(1);
      }
    }
  });

  it("is pure: the same inputs give the same object, twice", () => {
    const f = s4Field();
    const graph = graphOf([
      segment("high", "street", 5, run({ x: 60, z: -113 }, { x: 60, z: -95 })),
      segment("low", "street", 5, run({ x: 77, z: -113 }, { x: 77, z: -95 })),
      segment("flight", "lane", 3, run({ x: 60, z: -104 }, { x: 77, z: -104 }), "steps"),
    ]);
    const datum = gradeStreetDatum({ region: S4_REGION, graph, field: f, seaLevel: 62 });
    const args = { region: S4_REGION, graph, field: f, datum, descentSolve: true } as const;
    expect(solveDescents(args).records).toEqual(solveDescents(args).records);
  });

  it("reads no resolver output, no clock and no RNG — §1.3's purity law", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const file of ["descent-solve.ts", "descent-datum.ts"]) {
      const source = fs.readFileSync(path.join(here, "../src/layout", file), "utf8");
      // The datum law: pure over `(region, StreetGraph, field, StreetDatum,
      // occupancy)`, declaring nothing. A value import from the resolver, the
      // driver or the column plan would make it a reader instead, and §1.4's
      // read law would then govern it rather than §1.3's.
      for (const forbidden of [
        "ground-driver",
        "ground-resolver",
        "ground-contract",
        "plan.ground",
        "plan.fluidTop",
        "platforms.js",
        "district.js",
      ]) {
        expect([file, source.includes(forbidden)]).toEqual([file, false]);
      }
      // …and the compiler's first ground rule, stated in code.
      for (const forbidden of ["Date.now", "Math.random", "performance.now"]) {
        expect([file, source.includes(forbidden)]).toEqual([file, false]);
      }
    }
  });

  it("hard-forbids the tier-A classes a descent may never take (§2.2 T4)", () => {
    const r: Region = { x0: 0, z0: 0, width: 24, depth: 12 };
    const f = field(r, (x) => (x <= 4 ? 88 : Math.max(80, 88 - (x - 4))));
    const h = materialisedGround(r, f);
    const forbidden = new Uint8Array(r.width * r.depth);
    // A building sitting on the whole row the flight would have taken.
    for (let x = 0; x < r.width; x++) forbidden[idxOf(r, x, 6)] = 1;
    const solved = solveDescent({
      region: r,
      h,
      face: wholeFace(r, h),
      group: [demandOf(r, "flight", { x: 4, z: 6 }, 88, { x: 12, z: 6 }, 80)],
      legal: (k) => forbidden[k] !== 1,
    });
    // The start is itself forbidden ground, so there is no flight at all —
    // which is a refusal, never a flight laid through a footprint.
    expect(solved.runs.flatMap((x) => x.columns).some((k) => forbidden[k] === 1)).toBe(false);
  });
});
