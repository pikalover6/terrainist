/**
 * **`infra.entry@0`'s declaring half** —,
 * WP-G6a.
 *
 * ## Why this file exists
 *
 * Three passes used to declare from the *build* half, downstream of higher
 * tiers: `declareWaterWorks` (tier A, rank 0), `declareRun` (tier C, rank 110)
 * and `declareFlat`, all reached from `buildInfraEntries` in the wall's slot,
 * long after the streets and the farms. §1.6 makes declaration run in **tier
 * order**, so a rank-0 fluid claim arriving after a tier-D read is not a late
 * claim, it is a prefix resolve that is not a prefix — which is the one failure
 * the whole stage exists to make impossible, and the reason `GROUND_V1_FREEZE`
 * could not flip.
 *
 * **The split is by declaration, not by entry** (§6a.2). A row that declares
 * nothing — `declaresLevels !== true` and no `water`: `barricade_line`,
 * `boardwalk`, `dry_stone_wall`, `hedgerow`, `quarantine_fence`,
 * `cannon_battery` and the rest — has no tier at all, so §1.4 does not govern
 * it: it is a painter in G5's sense, it may read the finished world exactly as
 * `buildGrounds` and `dressLife` do, and it stays in the build half untouched.
 * Only the declaring rows move, each to its own class's tier —
 * `fluid.channel`/`structure.linework` to A, `retaining.seam`/`.skirt` to B,
 * `sweep.run` to C.
 *
 * ## What this file may read, and what it may not
 *
 * It is `declareLinework`'s shape generalised (`structures/index.ts`, the
 * linework slot), on INFRA-ENTRIES-v0 §3.5's ratified argument: *where a
 * carriageway crosses my line* is a fact about the **solved layout**, *what
 * level it holds there* a fact about the **surfaced street** — and a declarer
 * needs the first and never the second. So:
 *
 * - no `LifeWorld`, no `Planter`, no `StructureBlock`, no emitted geometry —
 *   asserted by a static import scan in `test/infra-entry-declare.test.ts`,
 *   the same guard `ground-freeze.test.ts` carries;
 * - the only ground it sees is `above`, §1.4's tier prefix, taken as
 *   `driver.view(tier)`;
 * - the carriageway it finds crossings against is the **solved** mask
 *   (§6a.4, v0 §13.2a rule 5), never the surfaced one, which does not exist
 *   yet;
 * - a farm's parcels come from `ParcelDatum` — the packer's own rects, a datum
 *   under §1.3 — and never from `farms.parcelMask`, which is stamped from
 *   *resolved* tier-D ownership (§6a.5).
 *
 * What comes back is an {@link InfraSitings}: the sited course, the openings,
 * the gates and the water plan, per node path. The build half **consumes** it
 * and re-derives nothing on it; `sweepCourse` still runs there, over
 * `siting.course` against frozen ground, which is re-materialisation and not
 * re-siting — and is exactly why `declaredColumnOps` never reads a band's
 * `level`.
 */

import { type LoamDiagnostic, note } from "@terrainist/spec";
import {
  GROUND_TIERS,
  type GroundBaseline,
  type GroundClaim,
  type GroundTier,
} from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import type { OccupancyGrid } from "../layout/types.js";
import type { Region } from "@terrainist/stdlib";

import {
  asGroundSourceClass,
  asSweptProfile,
  centroid,
  contextOf,
  crossingOpenings,
  gradeCapOf,
  nearStandingWater,
  resolveInfraRoute,
  type InfraCourse,
  type InfraEntryJob,
  type InfraPlacementView,
  type InfraResolution,
} from "./infra-route.js";
import { index, inside } from "./sweep.js";
import { profileSpan } from "./sweep.js";
import {
  WATERCOURSE_FLANK,
  barrierLine,
  declareWaterWorks,
  findWatercourse,
  planWaterWorks,
  type WatercourseCrossing,
  type WaterWorks,
} from "./water-works.js";
import type { CoursePoint, WallGate } from "./wall-course.js";
import { sweepCourse } from "./wall-sweep-seam.js";

/* -------------------------------------------------------------------------- */
/* the parcel datum (§6a.5)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * **The parcel layout as a datum, not a claim** (§1.3, §6a.5).
 *
 * `crop_circle` sites `over` a farm and the fabric hull folds a holding's
 * fields into every `ring`; both used to read `farms.parcelMask`, which is
 * stamped from *resolved* ownership at `farm.ts`'s commit and is therefore a
 * tier-**D** product. §1.4 forbids a tier-B or tier-C declarer from reading it
 * and inverting the tiers is not available — a fence must yield to a street.
 *
 * The way out is §1.3's datum law, the same construction that seats a rank-10
 * frontage tie at a rank-80 claimant's level: `packHolding` decides
 * `sow.parcels[].rect` and `sow.yard` from the holding footprint, its ports and
 * the baseline, *before* `input.ground.commit` — so those rects are a pure
 * function of the layout, plan-free, and readable by any tier. An entry is
 * sited against **the field as laid out**, not as it survived arbitration,
 * which is the linework slot's substitution verbatim.
 */
export interface ParcelDatum {
  /** Node path → the holding's parcel and yard rectangles, in packing order. */
  readonly rectsByPath: ReadonlyMap<string, readonly ParcelRect[]>;
}

/** One laid-out rectangle of a holding — a parcel, or the farmstead yard. */
export interface ParcelRect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/** An empty datum, for a document with no holding. */
export const EMPTY_PARCEL_DATUM: ParcelDatum = { rectsByPath: new Map() };

/** Every column a holding's laid-out rects cover, as a region mask. */
export function parcelMaskOf(
  datum: ParcelDatum,
  nodePath: string,
  region: Region,
): Uint8Array | undefined {
  const rects = datum.rectsByPath.get(nodePath);
  if (rects === undefined || rects.length === 0) return undefined;
  const mask = new Uint8Array(region.width * region.depth);
  for (const r of rects) {
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (inside(region, x, z)) mask[index(region, x, z)] = 1;
      }
    }
  }
  return mask;
}

/** The corner columns of a holding's laid-out rects — a `ring`'s extent. */
export function parcelExtentOf(
  datum: ParcelDatum,
  nodePath: string,
): readonly CoursePoint[] | undefined {
  const rects = datum.rectsByPath.get(nodePath);
  if (rects === undefined || rects.length === 0) return undefined;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const r of rects) {
    if (r.x0 < x0) x0 = r.x0;
    if (r.z0 < z0) z0 = r.z0;
    if (r.x1 > x1) x1 = r.x1;
    if (r.z1 > z1) z1 = r.z1;
  }
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

/* -------------------------------------------------------------------------- */
/* the siting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One declaring entry, **sited** — everything the build half would otherwise
 * have had to decide for itself.
 *
 * It rides on `StructurePlan` beside `linework`, and the build half re-derives
 * nothing on it: the course is the course, the openings are the openings, the
 * works are the works. What the build half still does is lay materials on the
 * ground the resolver gave, which is the half that belongs at 5e.
 */
export interface InfraSiting {
  readonly nodePath: string;
  /** What the route form decided against the **layout** view. */
  readonly resolution: InfraResolution;
  /** Path indices the crossing behaviour leaves open (§3.6). */
  readonly openings: readonly number[];
  /** The gates those openings came from, for the entry's own count. */
  readonly gates: readonly WallGate[];
  /** Columns whose level went through the ground contract from this slot. */
  readonly declared: number;
  /** The water mover's closed plan (`def.water` rows only). */
  readonly works?: WaterWorks;
  /** The crossing that plan was made across. */
  readonly crossing?: WatercourseCrossing;
}

/** Node path → siting, for every **declaring** row. Painters are absent. */
export type InfraSitings = ReadonlyMap<string, InfraSiting>;

/** Everything {@link declareInfraEntries} reads (§6a.4). */
export interface DeclareInfraInput {
  readonly region: Region;
  /**
   * The materialised ground the whole resolve is against — `nearStandingWater`
   * and `planWaterWorks`' two inputs, by name (§6a.1).
   */
  readonly baseline: GroundBaseline;
  /** Every `infra.entry@0` job, painters included; the tier filter is here. */
  readonly jobs: readonly InfraEntryJob[];
  /** The pipeline's one driver. Absent for a caller that is not the pipeline. */
  readonly ground?: GroundDriver;
  /** §13.2a rule 5's **solved** carriageway, never the surfaced one. */
  readonly solvedCarriageway: Uint8Array;
  /**
   * The solver's reservations, as the water plan's refusal input (§6a.6).
   *
   * This is what `world.taken` becomes on the water half: at tier A the grid
   * holds exactly the solver's reservations — placements, precincts, tunnel
   * mouths — and it is a *refusal* input that walks the head down a block at a
   * time, so dropping it would let a pool declare over a reserved lot.
   */
  readonly occupancy?: OccupancyGrid;
  /** The layout view — `structures/index.ts` fills it from layout data alone. */
  readonly view: InfraPlacementView;
}

/** What {@link declareInfraEntries} produced at one tier. */
export interface DeclareInfraResult {
  readonly sitings: InfraSitings;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** True for a row that declares levels, and therefore has a tier at all. */
export function declaresGround(job: InfraEntryJob): boolean {
  return job.def.declaresLevels === true || job.def.water !== undefined;
}

/**
 * The tier a declaring row belongs to — its own class's, and nothing else.
 *
 * §6a.2's rejected option (c) is worth restating here, because the one-line
 * alternative looks so cheap: re-tiering the water claims costs zero bytes on
 * every shipped world (no document uses a water mover) and all of the
 * correctness. Rank 0 is what makes a barrier hold — `firstLeak` is a
 * precondition on the *declared* crest, and a street at 80 taking one barrier
 * column re-opens the face the retry loop closed and fires `LOAM-T110`.
 */
export function tierOf(job: InfraEntryJob): GroundTier {
  if (job.def.water !== undefined) return GROUND_TIERS["fluid.channel"];
  return GROUND_TIERS[asGroundSourceClass(job.def.sourceClass ?? "sweep.run")];
}

/**
 * Site and declare every declaring entry whose class sits in `tier`.
 *
 * Called once per tier from the declaring half, at that tier's slot. Total on a
 * job list with nothing in the tier, which is what makes a document with no
 * declaring entry cost exactly nothing.
 */
export function declareInfraEntries(
  input: DeclareInfraInput,
  tier: GroundTier,
): DeclareInfraResult {
  const sitings = new Map<string, InfraSiting>();
  const diagnostics: LoamDiagnostic[] = [];
  const jobs = input.jobs.filter((job) => declaresGround(job) && tierOf(job) === tier);
  if (jobs.length === 0) return { sitings, diagnostics };

  // §1.4's escape hatch, and the only ground this half may see: the tier
  // prefix. Wet is `undefined`, exactly as `LifeWorld.standY` reports it, so a
  // route form asking "may anything stand here" gets the same answer from the
  // layout as it would from the finished world.
  const above = input.ground?.view(tier);
  const region = input.region;
  const standAt = (x: number, z: number): number | undefined => {
    if (above === undefined) return undefined;
    if (!inside(region, x, z)) return undefined;
    const k = index(region, x, z);
    if (above.fluidKind[k] !== 0) return undefined;
    return (above.ground[k] as number) + 1;
  };

  for (const job of jobs) {
    if (job.def.water !== undefined) {
      sitings.set(job.nodePath, declareWaterEntry(input, job, diagnostics));
      continue;
    }
    const resolved = resolveInfraRoute(job.route, input.view, { gradeCap: gradeCapOf(job) });
    if (resolved.kind === "unanchored" || resolved.kind === "empty") {
      // Reported by the build half, from the siting, so a document's diagnostic
      // list is in the order it always was. Recorded here so the build half
      // knows the row was sited and refused rather than never sited at all.
      sitings.set(job.nodePath, {
        nodePath: job.nodePath,
        resolution: resolved,
        openings: [],
        gates: [],
        declared: 0,
      });
      continue;
    }
    if (resolved.kind === "area") {
      const declared = declareFlat(input, job, resolved.columns, standAt);
      sitings.set(job.nodePath, {
        nodePath: job.nodePath,
        resolution: resolved,
        openings: [],
        gates: [],
        declared,
      });
      continue;
    }
    const course = resolved.course;
    const { openings, gates } =
      course.path.length < job.def.minRun
        ? { openings: new Set<number>(), gates: [] as readonly WallGate[] }
        : crossingOpenings(job, course, input.view);
    const declared =
      course.path.length < job.def.minRun ? 0 : declareRoute(input, job, course, openings, standAt);
    sitings.set(job.nodePath, {
      nodePath: job.nodePath,
      resolution: resolved,
      openings: [...openings].sort((a, b) => a - b),
      gates,
      declared,
    });
  }
  return { sitings, diagnostics };
}

/**
 * Sweep a declaring route against the tier prefix and commit its levels.
 *
 * The sweep here is a **siting** sweep, not the material one: it exists to say
 * which columns the run's bands cover and how high each sits, so the levels can
 * be arbitrated. The build half sweeps the same course again at 5e against the
 * frozen ground and lays blocks on the answer — that is re-materialisation, and
 * it is why the two sweeps disagreeing about a column's `top` is not a defect.
 */
function declareRoute(
  input: DeclareInfraInput,
  job: InfraEntryJob,
  course: InfraCourse,
  openings: ReadonlySet<number>,
  standAt: (x: number, z: number) => number | undefined,
): number {
  const driver = input.ground;
  if (driver === undefined) return 0;
  const geometry = job.def.geometry;
  if (geometry.kind !== "route") return 0;
  const profile = asSweptProfile(geometry.profile(contextOf(job)));
  const swept = sweepCourse({
    profile,
    path: course.path,
    closed: course.closed,
    rise: job.height ?? job.def.rise,
    ground: standAt,
    skip: (i) => openings.has(i),
    bends: course.bends,
    ...(course.reach === undefined ? {} : { reach: course.reach }),
  });

  // The water veto, unchanged in meaning: an entry that is not a water mover
  // has no business standing *in* standing water, and a declaring entry drowns
  // a lake through the ground contract rather than through its blocks — the
  // veto has to be applied to the declaration or it is not applied at all.
  const region = input.region;
  const claims: GroundClaim[] = [];
  const seen = new Set<number>();
  for (const c of swept.columns) {
    if (!inside(region, c.x, c.z)) continue;
    if (nearStandingWater(input.baseline, c.x, c.z)) continue;
    const idx = index(region, c.x, c.z);
    // **The carriageway subtraction, third instance** (§1.7, v0 §13.2a rule 5).
    // A declaring entry whose row says `crossings: "open"` subtracts the
    // *solved* carriageway before declaring; `block` and `gap` rows subtract
    // nothing, because they mean it — a dam's crest, a furrow, a flight of
    // terrace steps. This replaces `world.taken`, which at 5b would be a read
    // of an emitted block list that does not exist (§6a.6): a furrow that
    // lowered the ground under a road is what the *resolver* prevents now,
    // `sweep.run` at 110 losing the column to `road.network` at 100 by rank.
    if (job.def.crossings === "open" && input.solvedCarriageway[idx] === 1) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    // The sweep's datum is a **stand** height — the first air block — and a
    // ground level is the topmost solid block. One block apart, and the
    // conversion belongs here: a registry row says `level: -2` and means two
    // blocks into the earth.
    claims.push({ idx, y: c.top - 1 });
  }
  if (claims.length === 0) return 0;
  claims.sort((a, b) => a.idx - b.idx);
  const source = `${job.nodePath}#run`;
  const sourceClass = asGroundSourceClass(job.def.sourceClass ?? "sweep.run");
  // Family B — INFRA-ENTRIES-v0 §2's "a declared `face` between two levels". A
  // retaining entry is not a run that follows the ground; it *is* the step, so
  // it commits the kind only `retaining.seam`/`.skirt` may commit, with
  // `transition: "wall"`, and a `preserve` over the same columns: nothing may
  // be left standing over ground a later claim dropped. Both in one commit,
  // because the resolver has to see them together.
  if (sourceClass === "retaining.seam" || sourceClass === "retaining.skirt") {
    driver.commit([
      { source, sourceClass, kind: "face", columns: claims, transition: "wall" },
      { source, sourceClass, kind: "preserve", columns: claims, transition: "none" },
    ]);
    return claims.length;
  }
  driver.commit([{ source, sourceClass, kind: "profile", columns: claims, transition: "ramp" }]);
  return claims.length;
}

/**
 * Commit a flattening treatment's one level (§3.13, §9) — `declareFlat`, moved.
 *
 * **One** level, and the *median* of the ground it covers: a figure pressed
 * into a field is flat, and a median moves half the columns down and half up by
 * the least it can. The alternatives are both worse — the minimum digs a pit in
 * sloping ground, and the maximum builds a plinth.
 *
 * The tall-column test that used to sit beside it (`world.solidAt`, "a column
 * carrying something taller than the treatment clears is not wheat") does not
 * come with it and must not: it is a question about emitted blocks, it belongs
 * at 5e, and it stays there, on the material half.
 */
function declareFlat(
  input: DeclareInfraInput,
  job: InfraEntryJob,
  columns: readonly CoursePoint[],
  standAt: (x: number, z: number) => number | undefined,
): number {
  const driver = input.ground;
  if (driver === undefined) return 0;
  const region = input.region;
  const levels: number[] = [];
  const claims: GroundClaim[] = [];
  for (const c of columns) {
    if (!inside(region, c.x, c.z)) continue;
    const stand = standAt(c.x, c.z);
    if (stand === undefined) continue;
    levels.push(stand - 1);
    claims.push({ idx: index(region, c.x, c.z), y: 0 });
  }
  if (claims.length === 0) return 0;
  levels.sort((a, b) => a - b);
  const level = levels[levels.length >> 1] as number;
  const levelled = claims.map((claim) => ({ idx: claim.idx, y: level }));
  levelled.sort((a, b) => a.idx - b.idx);
  driver.commit([
    {
      source: `${job.nodePath}#figure`,
      sourceClass: asGroundSourceClass(job.def.sourceClass ?? "sweep.run"),
      kind: "platform",
      columns: levelled,
      transition: "step",
    },
  ]);
  return levelled.length;
}

/**
 * Plan and declare one water mover — `dam`, `weir`, `canal_lock` — at tier A.
 *
 * **Declare, then sweep**, and the order was always the design: the ground a
 * dam is built on is *under a river*, so a profile swept first refuses every
 * column that was the point of it. What G6a changes is only *where* the
 * declaration happens: rank 0, tier A, against the baseline, which is the tier
 * the class always named and never ran at.
 *
 * `world.taken` becomes `occupancy` here rather than being deleted (§6a.6): on
 * this half it is not redundant, it is the refusal input that walks the head
 * down a block at a time, and at tier A the grid holds exactly the solver's
 * reservations. The consequence is stated rather than hidden — a dam no longer
 * backs off a farm parcel or a prop pad inside its pool; rank 0 and the pool's
 * `preserve` take those columns.
 */
function declareWaterEntry(
  input: DeclareInfraInput,
  job: InfraEntryJob,
  diagnostics: LoamDiagnostic[],
): InfraSiting {
  const spec = job.def.water as NonNullable<InfraEntryDefWater>;
  const empty: InfraSiting = {
    nodePath: job.nodePath,
    resolution: { kind: "empty", detail: "no watercourse" },
    openings: [],
    gates: [],
    declared: 0,
  };
  const extent =
    input.view.extentOf(job.route.target) ?? input.view.corridorOf(job.route.target);
  const found =
    extent === undefined
      ? { kind: "none" as const, detail: `"${job.route.target}" named nothing the compiler placed` }
      : findWatercourse(input.baseline, input.view.bounds, extent);
  if (found.kind === "none") {
    return {
      ...empty,
      resolution: { kind: "unanchored", detail: found.detail },
    };
  }
  if (found.span < job.def.minRun) {
    return {
      ...empty,
      resolution: {
        kind: "empty",
        detail: `the narrowest crossing at "${job.route.target}" is ${found.span} column(s) of water, and "${job.def.id}" refuses anything narrower than ${job.def.minRun}`,
      },
      crossing: found,
    };
  }

  const geometry = job.def.geometry;
  const profile = asSweptProfile(
    geometry.kind === "route"
      ? geometry.profile(contextOf(job))
      : { id: job.def.id, bands: [], follow: "step", maxGrade: 1, crossing: "stop" },
  );
  const span = profileSpan(profile);
  const halfSpan = Math.max(Math.abs(span.lo), Math.abs(span.hi));
  const occupancy = input.occupancy;
  const region = input.region;
  const works = planWaterWorks({
    plan: input.baseline,
    crossing: found,
    spec,
    halfSpan,
    taken: (x, z) =>
      occupancy !== undefined && inside(region, x, z) && occupancy.mask[index(region, x, z)] === 1,
    flank: WATERCOURSE_FLANK,
  });
  if (works.refusal !== undefined) {
    diagnostics.push(
      note(
        "INFRA_RUN_REFUSED",
        job.nodePath,
        `"${job.def.id}" holds no water at "${job.route.target}": ${works.refusal} — it is built as a dry structure across the water`,
        "move it to a narrower, steeper place, or leave it: a barrier that impounds nothing still reads as one from the bank",
      ),
    );
  }
  declareWaterWorks(input.ground, job.nodePath, works);
  // The barrier's own line, sited here so the build half sweeps the course it
  // was given rather than deriving one from a crossing all over again.
  const line = barrierLine(found, WATERCOURSE_FLANK);
  return {
    nodePath: job.nodePath,
    resolution: { kind: "route", course: { path: line, closed: false, bends: [] } },
    openings: [],
    gates: [],
    declared: works.barrier.size + works.pool.size,
    works,
    crossing: found,
  };
}

/** The registry's water spec, named once so the cast above reads. */
type InfraEntryDefWater = NonNullable<InfraEntryJob["def"]["water"]>;
