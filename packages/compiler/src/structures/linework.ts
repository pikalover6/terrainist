/**
 * **The linework declaration slot** — `docs/GROUND-CONTRACT-v0.md` §13.2a.
 *
 * `structure.linework` is rank 25, tier A, and for the whole life of the ground
 * contract it was *reserved*: a tier-A declarer must declare against the
 * baseline, and every infrastructure entry finds its crossings against the
 * finished carriageway, and both could not be true. §13.2's 2026-08-17
 * reopening found the conflation — the **solved layout** knows where a
 * carriageway is from the moment placement is done, and only the *level* it
 * holds waits for the street pass — and this file is the slot that fell out of
 * it.
 *
 * > **`structure.linework` is for a line whose own surface something else must
 * > walk onto.** The ground makes room for it and the streets join it; a line
 * > nothing walks onto refuses instead, and stays at `sweep.run`.
 *
 * ## What this pass does, and what it deliberately does not
 *
 * **Declare early, build late** (§13.2a rule 9). This pass runs between
 * `buildPrecincts` (rank 20) and `pavePlaza` (rank 30) — so pipeline order and
 * rank order agree from 0 through 30, which is what makes its view a legal
 * tier-A read rather than a convenient one — and it writes **not one block**. It
 * resolves the route, computes the bed, subtracts the crossings, and commits the
 * `profile` + `clearance` + `preserve` triple in one call, because companion
 * intents belong in one arbitration.
 *
 * The materials stay in the wall's slot with the rest of the infrastructure
 * host, laid against `plan.ground` — the resolver's answer — through the
 * existing `declaredColumnOps` path. The two slots are joined by
 * {@link LineworkBeds}: node path → the bed's columns and their declared levels,
 * nothing more.
 *
 * That split is not tidiness. A rank-25 bed does **not** move blocks a
 * lower-ranked pass has already emitted (§13.2a rule 8): `StructureBlock`s carry
 * an absolute Y, and `dressStreetStairs`, `buildRetainingWalls`,
 * `buildJunctionSteps` and the bridge kit all emit them. A bed committed after
 * those passes would leave their masonry at the old level — which is the hard
 * reason the slot is where it is.
 *
 * ## The crossing subtraction, which is the whole safety argument
 *
 * Before it declares, the declarer subtracts from **every claim of every kind**
 * the solved carriageway band (`layout/solved-carriageway.ts`) and every column
 * the baseline says is wet. Those columns receive no claim at all, so the road
 * passes through **by declaration rather than by rank** — §13.2's original
 * instruction for `infra.wall@0`'s gates, generalised to every client.
 *
 * ## Determinism (§13.2b)
 *
 * Jobs in document order; each bed's columns sorted ascending by region index
 * before they become an intent's `columns`; a self-crossing bed merged by a
 * stated tie-break — **the lower level wins, then the lower chord index** — so
 * a column claimed twice can never be `LOAM-E494`. `subRank` is unset and must
 * stay unset: two linework declarers order by `source`, which is the node path,
 * which is unique.
 */

import { note, warning, type LoamDiagnostic } from "@terrainist/spec";
import type { Region } from "@terrainist/stdlib";

import type { GroundClaim, ReadonlyUint8Array } from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import { FluidKind } from "../terrain/columns.js";

import {
  INFRA_REFUSAL_FRACTION,
  resolveInfraRoute,
  type InfraEntryJob,
  type InfraPlacementView,
} from "./infra-entry.js";
import { index, inside } from "./roads.js";
import type { CoursePoint } from "./wall-course.js";

/* -------------------------------------------------------------------------- */
/* the handoff                                                                 */
/* -------------------------------------------------------------------------- */

/** One column of a declared bed: where it is, and the level asked for it. */
export interface LineworkBedColumn {
  readonly x: number;
  readonly z: number;
  /** Region-major column index — what the intent carried. */
  readonly idx: number;
  /** The level declared: the Y of the topmost solid block. */
  readonly y: number;
}

/** One node's bed, as the late pass receives it. */
export interface LineworkBed {
  readonly nodePath: string;
  readonly entry: string;
  /** Ascending by {@link LineworkBedColumn.idx}, which is the intent's order. */
  readonly columns: readonly LineworkBedColumn[];
  /** The deck course this bed rises to — the level at each abutment. */
  readonly deckY: number;
}

/**
 * The handoff record of §13.2a rule 9: node path → the bed's columns and their
 * declared levels, **and nothing more**.
 *
 * Deliberately not the intents, not the resolver's answer and not the course: a
 * wider record is a second way for the late pass to find a level, and the one
 * rule this contract cannot afford to lose is that materials are laid against
 * `plan.ground` rather than against what the entry asked for.
 */
export type LineworkBeds = ReadonlyMap<string, LineworkBed>;

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cells of course averaged to find the outward bearing at an end.
 *
 * One cell is the rasterizer's last step and says more about the lattice than
 * about the line; the first six are the line. Fixed rather than proportional so
 * a long run and a short one take their bearing the same way.
 */
export const LINEWORK_BEARING_SPAN = 6;

/**
 * The furthest an approach embankment will reach out from its abutment.
 *
 * A ceiling on the arithmetic rather than a shape decision: at the entry's grade
 * cap the ramp is `ceil(rise / cap)` columns long, and a cap of 1 under a
 * twenty-course deck would otherwise walk an embankment across a quarter.
 */
export const LINEWORK_MAX_APPROACH = 48;

/**
 * Courses an approach embankment rises in one column.
 *
 * One, and the number is physics rather than taste: a player steps one block,
 * and the whole reason rank 25 exists is that *something walks onto this
 * surface*. A two-course ramp is a wall with a view.
 */
export const LINEWORK_APPROACH_GRADE = 1;

/* -------------------------------------------------------------------------- */
/* what the pass is handed                                                     */
/* -------------------------------------------------------------------------- */

/** Everything {@link declareLinework} reads. */
export interface LineworkPassInput {
  readonly region: Region;
  /** Every `infra.entry@0` job, in document order. The pass filters. */
  readonly jobs: readonly InfraEntryJob[];
  /** The finished placement, as the route resolver needs to see it. */
  readonly view: InfraPlacementView;
  /** The pipeline's one ground driver. Absent outside the world pipeline. */
  readonly ground?: GroundDriver;
  /** §13.2a rule 5's first bullet — `solvedCarriagewayMask`'s answer. */
  readonly carriageway: ReadonlyUint8Array;
  /** The baseline's fluid classification. A linework keeps off water by reading it. */
  readonly fluidKind: ReadonlyUint8Array;
}

/** What {@link declareLinework} decided. */
export interface LineworkPassResult {
  readonly beds: LineworkBeds;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: Readonly<Record<string, number>>;
}

/** True for a registry row that declares from this slot, and only from it. */
export function declaresLinework(job: InfraEntryJob): boolean {
  return job.def.sourceClass === "structure.linework";
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Declare every linework bed the document asked for.
 *
 * **Total on an empty job list** (§13.2a rule 10, the reach law): a document
 * with no linework-declaring node produces no jobs, the caller never constructs
 * the pass, and no world before this contract holds a `structure.linework`
 * claim — so the class's first exercise is byte-identity-free by construction.
 */
export function declareLinework(input: LineworkPassInput): LineworkPassResult {
  const jobs = input.jobs.filter(declaresLinework);
  const beds = new Map<string, LineworkBed>();
  const diagnostics: LoamDiagnostic[] = [];
  if (jobs.length === 0) return { beds, diagnostics, stats: {} };

  let declaredColumns = 0;
  let refusedColumns = 0;

  for (const job of jobs) {
    const built = declareOne(input, job, diagnostics);
    if (built === undefined) continue;
    beds.set(job.nodePath, built.bed);
    declaredColumns += built.bed.columns.length;
    refusedColumns += built.subtracted;
  }

  return {
    beds,
    diagnostics,
    stats: {
      lineworkBeds: beds.size,
      lineworkBedColumns: declaredColumns,
      lineworkBedColumnsSubtracted: refusedColumns,
    },
  };
}

/** One bed, or `undefined` where none was declared. */
function declareOne(
  input: LineworkPassInput,
  job: InfraEntryJob,
  diagnostics: LoamDiagnostic[],
): { bed: LineworkBed; subtracted: number } | undefined {
  const geometry = job.def.geometry;
  // A linework client is a carried span today, and the registry's typed adapter
  // is what will make a second shape a compile error rather than a silence.
  if (geometry.kind !== "span") return undefined;
  const span = geometry.span({
    theme: job.theme,
    params: job.params,
    seed: job.seed,
  });
  const carry = span.carry;
  if (carry === undefined) return undefined;

  const resolved = resolveInfraRoute(job.route, input.view, { gradeCap: span.maxGrade });
  // A route this pass cannot resolve is **silent here**: the late pass resolves
  // the same route against the same placement and reports `LOAM-T232`/`T233`
  // itself. Two voices on one mistake is the defect the coverage sweep exists
  // to avoid, not to duplicate.
  if (resolved.kind !== "route") return undefined;
  const path = resolved.course.path;
  if (path.length < job.def.minRun) return undefined;

  const ends: [CoursePoint, CoursePoint] = [
    path[0] as CoursePoint,
    path[path.length - 1] as CoursePoint,
  ];
  const groundA = input.view.ground(ends[0].x, ends[0].z);
  const groundB = input.view.ground(ends[1].x, ends[1].z);
  if (groundA === undefined || groundB === undefined) return undefined;

  // Derived exactly as `buildCarriedSpan` derives it, and the `+1` is the whole
  // care in the line: that function reads `LifeWorld.standY`, which is the first
  // **air** block, while `InfraPlacementView.ground` is the topmost **solid**
  // one. Two derivations of one number is how a bed ends up a course off the
  // deck it is supposed to meet.
  const deckY = Math.max(groundA, groundB) + 1 + Math.max(1, span.clearance);
  // §13.2e words this "at the entry's own grade cap", and the entry's cap is a
  // *routing* number: it is how steep a line of sight between two anchors may
  // be, and `maglev_pylon` sets it to 8 precisely because a guideway is
  // surveyed rather than walked. An approach embankment is the opposite case —
  // it exists **so a road can arrive on the deck** — and a ramp that rises more
  // than one course a column is not a road, it is a wall a player cannot climb.
  // So the cap is the entry's, floored at the one course a walker can step.
  const gradeCap = Math.max(1, Math.min(span.maxGrade, LINEWORK_APPROACH_GRADE));

  /* --- the two approach embankments, before any subtraction --------------- */
  // §13.2e: the viaduct declares its **approaches** and never a bed under the
  // arcade. The bays keep their ground at grade — that is the one thing an
  // arcade must not take away from what it crosses — and a viaduct that
  // levelled its own bays would be an embankment with holes in it.
  const wanted = new Map<number, { y: number; chord: number; x: number; z: number }>();
  /** §13.2b's tie-break: the lower level wins, then the lower chord index. */
  const want = (x: number, z: number, y: number, chord: number): void => {
    if (!inside(input.region, x, z)) return;
    const idx = index(input.region, x, z);
    const held = wanted.get(idx);
    if (held !== undefined && (held.y < y || (held.y === y && held.chord <= chord))) return;
    wanted.set(idx, { y, chord, x, z });
  };

  let chord = 0;
  for (const [end, inward] of [
    [ends[0], bearing(path, 0)],
    [ends[1], bearing(path, path.length - 1)],
  ] as const) {
    // Outward is away from the run: the embankment stands *outside* the
    // abutment, and the abutment itself is the span's own masonry.
    const step = { x: -inward.x, z: -inward.z };
    if (step.x === 0 && step.z === 0) continue;
    for (let i = 1; i <= LINEWORK_MAX_APPROACH; i++) {
      const level = deckY - i * gradeCap;
      const cx = end.x + step.x * i;
      const cz = end.z + step.z * i;
      if (!inside(input.region, cx, cz)) break;
      const natural = input.view.ground(cx, cz);
      // Met grade: the ramp has come down to the ground it started from, and a
      // bed that kept going would be a cutting nobody asked for.
      if (natural !== undefined && level <= natural) break;
      // The cross-section is a **Chebyshev half-disc**, and both halves of that
      // are load-bearing.
      //
      // *Disc*, not a line thrown along the normal, because of what a normal
      // does on a diagonal run: at 45° the offsets land on diagonal neighbours,
      // so a "seven wide" bed comes out as seven columns with air between them
      // — a row of pillars, not ground a cart crosses. A disc is solid by
      // construction on all eight bearings and is the same seven columns
      // wherever the run is axis-aligned.
      //
      // *Half*, clipped to the outward side, because a full disc on the first
      // step reaches back **past the abutment** and lays bed under the arcade —
      // which is the one thing §13.2e forbids outright, and which showed up as
      // a raised anchor the span's own router could no longer cross.
      for (let dz = -carry.half; dz <= carry.half; dz++) {
        for (let dx = -carry.half; dx <= carry.half; dx++) {
          if (dx * step.x + dz * step.z < 0) continue;
          want(cx + dx, cz + dz, level, chord);
        }
      }
      chord++;
    }
  }

  /* --- the crossing subtraction (§13.2a rule 5) --------------------------- */
  const bedColumns: LineworkBedColumn[] = [];
  let takenByCarriageway = 0;
  let takenByWater = 0;
  for (const [idx, cell] of wanted) {
    if (input.carriageway[idx] === 1) {
      takenByCarriageway++;
      continue;
    }
    if (input.fluidKind[idx] !== FluidKind.NONE) {
      takenByWater++;
      continue;
    }
    bedColumns.push({ x: cell.x, z: cell.z, idx, y: cell.y });
  }
  // §13.2b: the set's iteration order is never observable — the subtraction's
  // result is sorted ascending by column index before it becomes an intent's
  // `columns`, which is `declareRun`'s existing rule.
  bedColumns.sort((a, b) => a.idx - b.idx);

  const subtracted = takenByCarriageway + takenByWater;
  // A bed of fewer than one full cross-section is not an embankment; it is a
  // step. Stated as the entry's own width rather than as a constant, because a
  // three-wide deck and an eleven-wide one do not agree about "a few columns".
  const minColumns = carry.half * 2 + 1;

  if (bedColumns.length < minColumns) {
    // §13.2c — `LOAM-T235`. The message names the count **and which of the two
    // subtractions took them**, because "my viaduct has no approach" and "my
    // viaduct is in a river" are different news.
    diagnostics.push(
      warning(
        "LINEWORK_BED_REFUSED",
        job.nodePath,
        `"${job.def.id}" kept ${bedColumns.length} of ${wanted.size} approach columns after the crossing subtraction — ${takenByCarriageway} were taken by the solved carriageway and ${takenByWater} by water — which is under the ${minColumns} one full cross-section needs, so no bed was declared and the run is built on the ground it finds`,
        "name anchors whose approaches are clear of a lane and of water — an embankment may not be declared across a carriageway, because a road passing a viaduct joins it rather than being re-levelled by it",
      ),
    );
    return undefined;
  }

  // "Cut into more than one run" is **relative to the shape the bed already
  // had**, and it has to be: a viaduct declares two approach embankments, one
  // at each abutment, and they are two runs before any subtraction happens. A
  // note that counted them as an interruption would fire on every viaduct ever
  // built, which is the failure mode §13.6 keeps these codes out of
  // `FEEDBACK_CODES` for.
  const intended = componentCount([...wanted].map(([idx, cell]) => ({ ...cell, idx })));
  const runs = componentCount(bedColumns);
  if (runs > intended || subtracted > wanted.size * INFRA_REFUSAL_FRACTION) {
    // §13.2c — `LOAM-T236`. A note, not a warning: the entry is built, and the
    // honest recovery is reported the way `INFRA_RUN_REFUSED` reports its own.
    diagnostics.push(
      note(
        "LINEWORK_BED_INTERRUPTED",
        job.nodePath,
        `"${job.def.id}" declared its approaches over ${bedColumns.length} of ${wanted.size} columns in ${runs} run(s) where it wanted ${intended} — ${takenByCarriageway} columns went to the solved carriageway and ${takenByWater} to water`,
        "no change needed if the approach reads on a walk — otherwise move the anchors so the embankment meets grade clear of the lanes it crosses",
      ),
    );
  }

  /* --- the commit: one call, three kinds (§3.13) -------------------------- */
  const bed: LineworkBed = {
    nodePath: job.nodePath,
    entry: job.def.id,
    columns: Object.freeze(bedColumns),
    deckY,
  };

  const driver = input.ground;
  if (driver !== undefined) {
    const claims: GroundClaim[] = bedColumns.map((c) => ({ idx: c.idx, y: c.y }));
    // The clearance is the deck's **underside**: the deck floor sits at `deckY`,
    // so nothing may raise a bay's ground past the course below it. Declared
    // over the bays and never a level, which is the arcade's whole promise —
    // the ground under it keeps its grade.
    const ceiling: GroundClaim[] = [];
    const seen = new Set<number>();
    for (let i = 1; i + 1 < path.length; i++) {
      const c = path[i] as CoursePoint;
      for (let dz = -carry.half; dz <= carry.half; dz++) {
        for (let dx = -carry.half; dx <= carry.half; dx++) {
          const x = c.x + dx;
          const z = c.z + dz;
          if (!inside(input.region, x, z)) continue;
          const idx = index(input.region, x, z);
          if (seen.has(idx)) continue;
          // Rule 5 again, and for every kind: a column the solved carriageway
          // will hold receives **no claim at all**, a clearance included.
          if (input.carriageway[idx] === 1) continue;
          seen.add(idx);
          ceiling.push({ idx, y: deckY - 1 });
        }
      }
    }
    const source = `${job.nodePath}#linework`;
    driver.commit([
      {
        source,
        sourceClass: "structure.linework",
        kind: "profile",
        columns: claims,
        // Derived, never declared (§13.2a rule 7): the boundary between the bed
        // and the ground beside it becomes a `GroundTransition` under §5.6's
        // table, which is how a retaining wall arrives under a viaduct approach
        // without anybody having declared one.
        transition: "ramp",
        minColumns,
      },
      ...(ceiling.length === 0
        ? []
        : [
            {
              source,
              sourceClass: "structure.linework" as const,
              kind: "clearance" as const,
              columns: ceiling,
              transition: "none" as const,
            },
          ]),
      {
        source,
        sourceClass: "structure.linework",
        kind: "preserve",
        // A guard over the bed and nothing else: `preserve` is legal only over
        // columns the same source's level claim won (§5.4), which is also why a
        // water column the run bridges is **not** guarded here — the bed never
        // won one.
        columns: claims,
        transition: "none",
      },
    ]);
  }

  return { bed, subtracted };
}

/* -------------------------------------------------------------------------- */
/* geometry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The unit inward bearing at one end of a course.
 *
 * Averaged over {@link LINEWORK_BEARING_SPAN} cells and reduced to a sign pair,
 * so the step is one of the eight lattice directions and an embankment's
 * columns are the ones a rasterizer would have produced anyway.
 */
function bearing(path: readonly CoursePoint[], at: number): { x: number; z: number } {
  const other = at === 0
    ? path[Math.min(LINEWORK_BEARING_SPAN, path.length - 1)]
    : path[Math.max(0, path.length - 1 - LINEWORK_BEARING_SPAN)];
  const here = path[at] as CoursePoint;
  if (other === undefined) return { x: 0, z: 0 };
  return { x: Math.sign(other.x - here.x), z: Math.sign(other.z - here.z) };
}

/**
 * How many 8-connected runs the kept columns form.
 *
 * 8-connected for the reason the resolver's own transition grouping is
 * (§5.6 step 3): a contour on a lattice is a staircase, and consecutive columns
 * of a diagonal approach are diagonal neighbours and never edge neighbours.
 * Grouping 4-connected here would report every diagonal embankment as
 * interrupted, which is a note that fires on every world.
 */
export function componentCount(columns: readonly LineworkBedColumn[]): number {
  const key = (x: number, z: number): string => `${x},${z}`;
  const remaining = new Map<string, LineworkBedColumn>();
  for (const c of columns) remaining.set(key(c.x, c.z), c);
  let components = 0;
  // Seeded in the columns' own ascending index order, so the count is a fact
  // about the set rather than about the map's insertion order.
  for (const c of columns) {
    const start = key(c.x, c.z);
    if (!remaining.has(start)) continue;
    components++;
    const stack = [c];
    remaining.delete(start);
    while (stack.length > 0) {
      const cur = stack.pop() as LineworkBedColumn;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const k = key(cur.x + dx, cur.z + dz);
          const next = remaining.get(k);
          if (next === undefined) continue;
          remaining.delete(k);
          stack.push(next);
        }
      }
    }
  }
  return components;
}
