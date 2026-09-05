/**
 * **The fifth datum** —
 * datum law.
 *
 * `solveDescents` runs in pass 4, after `gradeStreetDatum` and **before**
 * `derivePlatforms`, and produces a {@link DescentDatum}: pure over the
 * pristine baseline, the `StreetGraph`, the `StreetDatum` and the solver's
 * occupancy; reading no plan and no resolver output, declaring nothing. It
 * joins the four datums under the §1.3 purity test unchanged, and
 * `derivePlatforms` consumes its corridor as `blocked` (§3.2).
 *
 * *Why an alignment solved against the pristine baseline is exact against the
 * resolved field:* **because it reserves its own columns.** Every tier-A class
 * that could have moved that ground is either hard-forbidden by T4 or
 * subtracted by §3.2, so on a descent corridor *resolved ground = pristine
 * baseline*, provably — and the search's `h` is the field the flight is built
 * on.
 *
 * Two things live here and nowhere else:
 *
 * 1. **The corridor** (§3.2). The union over solved descents of each run's
 *    cross-section at `streetStairGeometry`'s width, dilated 1 Chebyshev — the
 *    construction §1.7 rule 1 uses for the carriageway band, from the same
 *    module discipline. It is what `quarter.plane` subtracts, which is why the
 *    resolver never arbitrates a descent's columns: *the severance is
 *    impossible rather than won.*
 * 2. **The explanation record** (§2.7). `LOAM-I499 STREET_DESCENT`, one per
 *    descent, with the six cost terms of the chosen path *and* of the best path
 *    constrained to the straight fall line — the marginal that makes "why did
 *    it switchback here" answerable. **Without this record the design is not
 *    maintainable and must not ship**: a procedure can be debugged by reading
 *    it, an optimum cannot.
 *
 * Everything is behind `DESCENT_SOLVE`. With the flag off no caller builds one
 * of these at all, which is what makes the off state byte-identical.
 */

import type { HeightField, Region } from "@terrainist/stdlib";

import { STAIR_PROFILE } from "../structures/profiles.js";

import {
  descentIndex,
  recognizeDescents,
  solveDescent,
  type DescentDemand,
  type DescentRecognition,
  type DescentRun,
  type ScarpFace,
  type SolvedDescent,
} from "./descent-solve.js";
import type { StreetGraph } from "./streets.js";
import { materialisedGround, type StreetDatum } from "./street-datum.js";
import { DESCENT_REACH, DESCENT_SOLVE, ROAD_SOVEREIGN } from "./types.js";

/** What {@link solveDescents} needs. Everything, and nothing else (§4.1). */
export interface DescentDatumInput {
  /** The raster every mask below is indexed over — the terrain field's. */
  readonly region: Region;
  /** The district's street skeleton, exactly as `buildStreetGraph` drew it. */
  readonly graph: StreetGraph;
  /**
   * The **pristine baseline** field, sampled by the materialisation rule — the
   * same array `gradeStreetDatum` samples, so the descent and the street datum
   * never disagree about the hill by one block (§1.1).
   */
  readonly field: HeightField;
  /** That grading's answer. */
  readonly datum: StreetDatum;
  /**
   * **T4** — 1 where a descent may never go: fluid, a building footprint, a
   * precinct's ground, foreign linework. The tier-A classes §3.2's subtraction
   * is safe *because* they are hard-forbidden here.
   *
   * Absent means "nothing is forbidden", which is every unit fixture.
   */
  readonly forbidden?: Uint8Array;
  /**
   * The switch. Defaults to {@link DESCENT_SOLVE}; the parameter exists so a
   * test may exercise the solve without moving a compile-time constant the
   * whole compiler reads — the shape `PlatformInput.electionSolve` already has.
   */
  readonly descentSolve?: boolean;
}

/** §2.7's record, one per solved descent. */
export interface DescentRecord {
  readonly faceId: number;
  readonly faceColumns: number;
  /** World bounds of the face — `[x0, z0, x1, z1]`, so a record is walkable. */
  readonly at: readonly [number, number, number, number];
  readonly demands: readonly {
    readonly id: string;
    readonly source: "D1" | "D2";
    readonly top: readonly [number, number];
    readonly topY: number;
    readonly bottom: readonly [number, number];
    readonly bottomY: number;
  }[];
  readonly trunkColumns: number;
  readonly branchColumns: number;
  readonly risers: number;
  readonly landings: number;
  readonly longestLevelRun: number;
  /** The six terms of the chosen path — §2.3, and §6.3's calibration table. */
  readonly cost: DescentRun["cost"];
  /** …and of the best path constrained to the straight fall line, where one exists. */
  readonly straight?: DescentRun["cost"];
  readonly states: number;
}

/** The fifth datum — §4.1's artifact. */
export interface DescentDatum {
  readonly region: Region;
  /** Every recognized face, whether or not a demand claimed it. */
  readonly faces: readonly ScarpFace[];
  /** 1 on a column of a face a solved descent **claims** — §5's scope. */
  readonly claimed: Uint8Array;
  /** 1 on a column of the solved corridor — what `quarter.plane` subtracts. */
  readonly corridor: Uint8Array;
  readonly descents: readonly SolvedDescent[];
  readonly records: readonly DescentRecord[];
  /** `LOAM-W412 DESCENT_REFUSED`, with the demand or face that lost. */
  readonly refusals: readonly {
    readonly reason: "unreachable" | "face-too-large" | "terminal-drift";
    readonly what: string;
  }[];
  /** Segment id → the runs that segment's demand was solved into. */
  readonly bySegment: ReadonlyMap<string, readonly DescentRun[]>;
  /** §1's own census rows, for WP-D0's harness. */
  readonly recognition: DescentRecognition;
  /**
   * Total states settled over every face — §7.4's cost witness.
   *
   * A **count**, deliberately, and not the `descentMs` §7.4 asks for: this
   * compiler's first ground rule is that nothing reads a clock, and a datum is
   * the last place to start. The state count is the quantity the a-priori bound
   * `descentStateBound` is stated in, so it is also the quantity a test can
   * assert against; wall-time belongs to the stage that calls this, where a
   * clock is a report line rather than an input to an answer.
   */
  readonly states: number;
}

/** The empty datum — what a flat town, and every flag-off caller, gets. */
export function noDescents(region: Region): DescentDatum {
  const cells = region.width * region.depth;
  return {
    region,
    faces: [],
    claimed: new Uint8Array(cells),
    corridor: new Uint8Array(cells),
    descents: [],
    records: [],
    refusals: [],
    bySegment: new Map(),
    recognition: { faces: [], demands: [], groups: [], refusals: [], seeds: 0 },
    states: 0,
  };
}

/**
 * Columns of tread the profile lays, read lazily — `street-stairs.ts`'
 * `treadWidth`, which cannot be imported without closing a cycle through
 * `roads.ts`.
 */
function treadWidth(): number {
  return STAIR_PROFILE.bands.find((b) => b.id === "tread")?.width ?? 5;
}

/**
 * The corridor of one run — `streetStairGeometry`'s own cross-section rule,
 * stated over the centre line alone.
 *
 * The geometry pass takes `verge = min(treadWidth >> 1, (width − 1) >> 1) + 1`
 * columns either side of the line; this is that span, without the masks,
 * because a corridor is what the plane must *not* claim and a column the
 * geometry would later drop for a footprint is a column the plane may not have
 * either — it is the flight's own band whether or not the flight paves it.
 */
function corridorOf(region: Region, run: DescentRun, into: Uint8Array): void {
  if (run.columns.length < 2) return;
  const tread = Math.min(treadWidth() >> 1, (run.width - 1) >> 1);
  const verge = tread + 1;
  for (const [i, idx] of run.columns.entries()) {
    const a = idx % region.width;
    const x = region.x0 + a;
    const z = region.z0 + (idx - a) / region.width;
    // The 4-connected step taken *at* this column; the last column reuses the
    // one before it, exactly as `stepAt` does.
    const j = Math.min(i, run.columns.length - 2);
    const from = run.columns[Math.max(0, j)] as number;
    const to = run.columns[Math.max(0, j) + 1] as number;
    const fa = from % region.width;
    const ta = to % region.width;
    const dx = Math.sign(ta - fa);
    const dz = Math.sign((to - ta) / region.width - (from - fa) / region.width);
    const px = dx !== 0 ? 0 : 1;
    const pz = dx !== 0 ? 1 : 0;
    for (let s = -verge; s <= verge; s++) {
      const k = descentIndex(region, x + px * s, z + pz * s);
      if (k >= 0) into[k] = 1;
    }
  }
}

/** Dilate a mask by one Chebyshev column, in place over a copy — §1.7 rule 1's rule. */
function dilate1(region: Region, mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      if (mask[j * region.width + i] !== 1) continue;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
          out[jj * region.width + ii] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * **Solve every descent this quarter's network must make** — §4.1's pass-4
 * datum.
 *
 * Returns {@link noDescents} unchanged while the flag is off, so a caller may
 * wire it unconditionally and still be byte-identical.
 */
export function solveDescents(input: DescentDatumInput): DescentDatum {
  const { region, graph, field, datum } = input;
  // `ROAD_SOVEREIGN` treats the solve as off without moving `DESCENT_SOLVE`'s
  // own value (§3 of the flag's own note): a sovereign road never carries a
  // stair, so recognizing a face the network must descend has nothing to build
  // and the corridor it would subtract from the plane must not exist either.
  // Only the *default* is conjoined, so a fixture that names `descentSolve`
  // explicitly still exercises the solver under either flag.
  if ((input.descentSolve ?? (DESCENT_SOLVE && !ROAD_SOVEREIGN)) !== true) return noDescents(region);
  const cells = region.width * region.depth;
  const h = materialisedGround(region, field);
  const recognition = recognizeDescents({ region, h, graph, datum });

  const forbidden = input.forbidden;
  const legal = forbidden === undefined ? undefined : (idx: number): boolean => forbidden[idx] !== 1;

  const claimed = new Uint8Array(cells);
  const raw = new Uint8Array(cells);
  const descents: SolvedDescent[] = [];
  const records: DescentRecord[] = [];
  const refusals: { reason: "unreachable" | "face-too-large" | "terminal-drift"; what: string }[] = [];
  const bySegment = new Map<string, DescentRun[]>();

  for (const refusal of recognition.refusals) {
    refusals.push({ reason: refusal.reason, what: `face ${refusal.faceId} (${refusal.columns} columns)` });
  }

  const faceById = new Map<number, ScarpFace>();
  for (const face of recognition.faces) faceById.set(face.id, face);

  /**
   * **Columns a descent has already taken** — §6.2's "no colliding independent
   * stairs", made impossible rather than measured.
   *
   * A group is one object and its branches join its trunk's landings, so
   * nothing inside a group can collide. Two *groups* on one long face are two
   * objects — §1.4's whole point, a cliff two hundred columns long serving two
   * quarters — and nothing in the search stops the second from walking across
   * the first. So it does: a solved descent's columns join T4's forbiddance for
   * every group after it, in `recognition.groups`' own order, which is
   * ascending face id and then ascending senior terminal. The order is a fact
   * about the recognition, so the answer is still a pure function of the input.
   */
  const taken = new Uint8Array(cells);
  let anyTaken = false;

  for (const group of recognition.groups) {
    const face = faceById.get((group[0] as DescentDemand).faceId);
    if (face === undefined) continue;
    const blocked =
      legal === undefined && !anyTaken
        ? undefined
        : (idx: number): boolean => (legal === undefined || legal(idx)) && taken[idx] !== 1;
    const solved = solveDescent({
      region,
      h,
      face,
      group,
      ...(blocked === undefined ? {} : { legal: blocked }),
    });
    for (const run of solved.runs) {
      for (const k of run.columns) {
        taken[k] = 1;
        anyTaken = true;
      }
    }
    descents.push(solved);
    for (const refusal of solved.refused) {
      refusals.push({ reason: refusal.reason, what: `demand ${refusal.demandId} on face ${face.id}` });
    }
    if (solved.runs.length === 0) continue;
    // A face is **claimed** only where a descent was actually built: §5's
    // deletions are scoped to claimed faces, and a face whose every demand
    // refused must keep the procedures it always had.
    //
    // **And only along the stretch it was built on** — WP-D4's one correction
    // to §5's scope, forced by the amendment. §5.3 silences `deriveSeamStairs`
    // on a claimed face because *the descent is the only producer of a flight
    // or a landing there*; that sentence is true of the cliff the descent came
    // down and false of a face four thousand columns long which happens to be
    // one 4-connected component of the scarp mask. Measured on Troy: claiming
    // the whole component took `LOAM-I414` from **12 derived flights to zero**
    // across the quarter — one descent silencing every seam stack in the
    // citadel, which is not a scoping, it is a deletion. The halo is
    // `DESCENT_SHARE_SPAN`, the span past which §1.4 already calls two demands
    // two problems — no: `DESCENT_SHARE_SPAN` was measured too and it is too
    // wide, silencing a seam stack thirty-two columns from the flight that was
    // supposed to replace it (Troy's S5a window lost its stairs and got nothing
    // back). The halo is `DESCENT_REACH`, the same distance recognition uses to
    // decide whether a station belongs to a face at all: inside it a stack is
    // this descent's business, outside it the stack belongs to a stretch of
    // cliff no descent was asked about.
    for (const k of face.columns) {
      const i = k % region.width;
      const x = region.x0 + i;
      const z = region.z0 + (k - i) / region.width;
      let near = false;
      for (const run of solved.runs) {
        for (const c of run.columns) {
          const ci = c % region.width;
          const cx = region.x0 + ci;
          const cz = region.z0 + (c - ci) / region.width;
          if (Math.abs(cx - x) <= DESCENT_REACH && Math.abs(cz - z) <= DESCENT_REACH) {
            near = true;
            break;
          }
        }
        if (near) break;
      }
      if (near) claimed[k] = 1;
    }
    for (const run of solved.runs) {
      corridorOf(region, run, raw);
      const list = bySegment.get(run.demandId);
      if (list === undefined) bySegment.set(run.demandId, [run]);
      else list.push(run);
    }
    let x0 = Number.POSITIVE_INFINITY;
    let z0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let z1 = Number.NEGATIVE_INFINITY;
    for (const k of face.columns) {
      const i = k % region.width;
      const x = region.x0 + i;
      const z = region.z0 + (k - i) / region.width;
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    const trunk = solved.runs.find((r) => r.kind === "trunk") as DescentRun;
    const world = (k: number): readonly [number, number] => {
      const i = k % region.width;
      return [region.x0 + i, region.z0 + (k - i) / region.width];
    };
    records.push({
      faceId: face.id,
      faceColumns: face.columns.length,
      at: [x0, z0, x1, z1],
      demands: group.map((d) => ({
        id: d.segmentId,
        source: d.source,
        top: world(d.top),
        topY: d.topY,
        bottom: world(d.bottom),
        bottomY: d.bottomY,
      })),
      trunkColumns: trunk.columns.length,
      branchColumns: solved.runs
        .filter((r) => r.kind === "branch")
        .reduce((n, r) => n + r.columns.length, 0),
      risers: solved.runs.reduce((n, r) => n + r.risers, 0),
      landings: solved.runs.reduce((n, r) => n + r.landings.length, 0),
      longestLevelRun: solved.runs.reduce((n, r) => Math.max(n, r.longestLevelRun), 0),
      cost: trunk.cost,
      ...(solved.straight === undefined ? {} : { straight: solved.straight }),
      states: solved.states,
    });
  }

  return {
    region,
    faces: recognition.faces,
    claimed,
    corridor: dilate1(region, raw),
    descents,
    records,
    refusals,
    bySegment,
    recognition,
    states: descents.reduce((n, d) => n + d.states, 0),
  };
}

/**
 * Every quarter's solved corridor, translated into one mask over `region` —
 * what `declarePads` subtracts from the `quarter.plane` claim (§3.2).
 *
 * A `DescentDatum` is indexed over its own **quarter**; a pad declaration is
 * indexed over the whole plan. This is that translation, written once, in the
 * module the corridor belongs to rather than at the call site — the discipline
 * `layout/solved-carriageway.ts` keeps for §1.7's first subtraction.
 *
 * `undefined` when no quarter solved a descent, which is every compile while
 * `DESCENT_SOLVE` is off: `declarePads` then declares §1.7 with two rules,
 * unchanged, and allocates nothing.
 */
export function descentCorridorMask(
  region: Region,
  descents: readonly (DescentDatum | undefined)[],
): Uint8Array | undefined {
  let out: Uint8Array | undefined;
  for (const datum of descents) {
    if (datum === undefined || datum.descents.length === 0) continue;
    if (out === undefined) out = new Uint8Array(region.width * region.depth);
    const dr = datum.region;
    for (let j = 0; j < dr.depth; j++) {
      const rj = dr.z0 + j - region.z0;
      if (rj < 0 || rj >= region.depth) continue;
      for (let i = 0; i < dr.width; i++) {
        if (datum.corridor[j * dr.width + i] !== 1) continue;
        const ri = dr.x0 + i - region.x0;
        if (ri < 0 || ri >= region.width) continue;
        out[rj * region.width + ri] = 1;
      }
    }
  }
  return out;
}

/** Every landing column of every built run — the invariant's other half. */
export function descentLandings(datum: DescentDatum): number[] {
  const out: number[] = [];
  for (const descent of datum.descents) {
    for (const run of descent.runs) {
      for (const landing of run.landings) {
        for (let i = landing.from; i <= landing.to; i++) out.push(run.columns[i] as number);
      }
    }
  }
  out.sort((a, b) => a - b);
  return out;
}
