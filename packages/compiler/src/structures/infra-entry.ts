/**
 * `infra.entry@0` — **the infrastructure host**, W0).
 *
 * Sixty-eight catalog rows are not an object at a place: they are a line over
 * ground nobody owns, a face between two levels, or a treatment of a plane
 * somebody else made. Exactly one of them was built — `curtain_wall` — by a
 * bespoke three-file pass, and the lesson of that pass is that **all three of
 * its parts generalise and none of them is the entry**: `deriveWallCourse` is a
 * route form, `sweepCourse` is the engine every client already shares, and what
 * belongs to the curtain wall alone is its cross-section and its material
 * table. So the host is one node kind, one pass, and one registry of
 * cross-sections, and adding an entry is a row in
 * `stdlib/structures/infra-entries.ts` plus a profile function.
 *
 * This file is the pass. Two halves:
 *
 * 1. **{@link resolveInfraRoute}** — the five coordinate-free route forms, each
 *    derived against the *finished placement* exactly as a wall course is. An
 *    author never writes a coordinate; they name something the compiler placed
 *    and say how far out, how far to the side, or how long a run.
 * 2. **{@link buildInfraEntries}** — the registry-to-`sweepCourse` driver, run
 *    in the wall's slot for the wall's reason (§3.8): it is the only point at
 *    which the carriageway a crossing is found against is finished.
 *
 * ## Determinism
 *
 * The route is a pure function of the finished placement: integer or
 * exact-rational arithmetic over a fixed iteration order, no RNG, no clock.
 * The one new hazard the design names is that `across` and `into` *pick a
 * bearing*, so both break ties by a stated total order — for `across` the
 * narrowest span, then the lowest `z`, then the lowest `x`; for `into` the
 * steepest outward rise, then the lowest `z`, then the lowest `x` of the far
 * end. Both orders are asserted in `test/infra-entry.test.ts`, because an
 * unstated tie-break is two runs disagreeing.
 *
 * ## Ground contract (§3.5)
 *
 * **No new `GroundSourceClass`.** An entry declares `sweep.run` (rank 110, tier
 * C), `retaining.seam`, `fluid.channel`, `structure.linework` — or nothing.
 *
 * A registry row naming `structure.linework` is still refused **from this
 * slot**, and the refusal is now a signpost rather than a scope line: rank 25 is
 * tier A, it declares against the baseline, and this pass runs after the streets
 * by design. What changed on 2026-08-17 is that there is somewhere for it to go.
 * `structures/linework.ts` runs between `buildPrecincts` and `pavePlaza`, finds
 * its crossings in the **solved** layout rather than in the finished
 * carriageway, and hands this pass a {@link LineworkBeds} record: node path →
 * the bed's columns and the levels the resolver arbitrated for them. So a
 * linework row reaching this pass *with* its bed is built here — the materials
 * were always meant to stay in the wall's slot with the rest of the host — and
 * one reaching it *without* one is the refusal, re-pointed
 * rule 9, §13.2f step 3).
 *
 * Most entries write no level at all — the wall's own construction, blocks
 * through `life.ts`'s `Planter` on the ground they find. The two that *are* a
 * statement about the ground (`crash_furrow` cuts below it, `crop_circle`
 * flattens it) take {@link declareRun} / {@link stampArea}'s declaring path
 * instead: commit the levels as a `sweep.run` intent, let the resolver
 * arbitrate them against every other claim on those columns, and lay the
 * materials on the answer. Never on the level the entry asked for — that is
 * §9a.1 rule 2, and it is why a furrow crossing a plaza comes out interrupted
 * rather than cutting one in half.
 *
 * ## What W1 had to change here, and why (the design's acceptance test)
 *
 * states its own test: *adding an entry must
 * not cost a line of `structures/` code*. Three of W1's four entries met it
 * whole; the claim is **not** exactly true, and the four places it failed are
 * named here rather than smoothed over, because a design's own test is worth
 * something only if its failures are legible.
 *
 * 1. **Interval features were seated and then dropped.** `sweepCourse` returns
 *    them, W0's driver had nowhere to send them, and "a floodlight mast every
 *    fifth panel" is in the entry's one-line description in the catalog.
 *    {@link seatFittings} is the cheap half of §3.3's promised hand-off: a
 *    column of blocks per feature, through the same `Planter`. The prop-id
 *    hand-off to `buildProps` is still unexercised and still the right answer
 *    for anything with a footprint.
 * 2. **`gap` left the whole crossing open.** With one crossing — which is
 *    exactly what an `across` route has — "block everything but the widest
 *    gate" and "leave the road alone" are the same instruction, so a barricade
 *    was a pile of rubble on the verges either side of an untouched street.
 *    The gap is now a *doorway inside* the chosen crossing
 *    ({@link INFRA_GAP_WIDTH}), which is what §3.6's sentence means and what
 *    makes the walkability claim true.
 * 3. **A below-datum band could not be built.** {@link infraColumnOps} refused
 *    a column whose top was under the ground, so `ditch` — a band role the
 *    vocabulary already names, and the one §2's family-A note says
 *    `crash_furrow` needs — was unreachable. The declaring path above is the
 *    answer, and it is the ground contract's own machinery rather than a
 *    second way to move terrain.
 * 4. **An areal stamp was one block over a whole mask.** That builds
 *    `stump_field`; it cannot build a *figure*, and a crop circle is nothing
 *    but a figure. `InfraAreaStamp.cell` gives the registry a per-column say in
 *    centre-relative coordinates — the only geometry an entry computes for
 *    itself, and still not a world coordinate (§5).
 */

import {
  INFRA_ENTRY_GENERATOR,
  note,
  warning,
  type LoamDiagnostic,
} from "@terrainist/spec/ir";
import type {
  InfraAreaCell,
  InfraEntryDef,
  InfraRouteForm,
  InfraSpanDef,
} from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { GroundClaim } from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import { type ColumnPlan } from "../terrain/columns.js";

import type { StructureBlock } from "./buildings.js";
import type { InfraSiting, InfraSitings } from "./infra-entry-declare.js";
import {
  INFRA_GAP_WIDTH,
  asGroundSourceClass,
  asSweptProfile,
  centroid,
  contextOf,
  crossingOpenings,
  gradeCapOf,
  nearStandingWater,
  rasterize,
  resolveInfraRoute,
  type InfraCourse,
  type InfraEntryJob,
  type InfraPlacementView,
  type InfraResolution,
} from "./infra-route.js";
import { Planter, buildLifeWorld, op, type LifeOp, type LifeWorld, type PlaceRule } from "./life.js";
import type { LineworkBed, LineworkBeds } from "./linework.js";
import { index, inside } from "./sweep.js";
import { profileSpan } from "./sweep.js";
import {
  WATERCOURSE_FLANK,
  barrierLine,
  declareWaterWorks,
  drownPool,
  findWatercourse,
  planWaterWorks,
  type WaterWorks,
} from "./water-works.js";
import type { CoursePoint, WallGate } from "./wall-course.js";
import { normalAt, sweepCourse, type SweptColumn } from "./wall-sweep-seam.js";

/**
 * **The route geometry lives in `infra-route.ts`** (§6a.3, WP-G6a) — re-exported
 * here so every existing importer of this module, and every test that already
 * names a route form, goes on reading one name for one thing.
 */
export * from "./infra-route.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Courses of footing one entry column will sink to reach the ground. */
const INFRA_MAX_FILL = 12;

/**
 * How far down a retaining profile clads the face it declared. A profile that
 * reads the ground it retains (`datumOffset`) raises the ground contract's
 * columns to the terrace's level, and the contract fills them with terrain;
 * the outermost column of its `core` band is the face a walker sees, and this
 * many courses of it, from the ground outside up to the walk, are the band's
 * own fill — a revetment, not a cliff with a lip.
 */
const INFRA_REVETMENT_MAX = 24;
const NEIGHBOURS4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A generous ceiling on recipes, in the shape `WALL_BUDGET` has. */
const INFRA_BUDGET = 60_000;

/**
 * The share of a resolved route that may be lost before `LOAM-T234` fires.
 *
 * A fence loses columns to collisions and to unbuildable ground, and a few is
 * normal — the course is derived, not negotiated. Past a third of the run the
 * author is looking at a fence full of holes and would rather read it than walk
 * into it.
 */
export const INFRA_REFUSAL_FRACTION = 1 / 3;

/**
 * The entry's own place rule — the wall's, verbatim.
 *
 * `requireFreeColumn` is on and stays on: it is the construction that makes
 * `infra.wall@0` physics-lint-clean without a second opinion about occupancy,
 * and a column the entry cannot claim in full is skipped whole (the
 * `SweptProfile` contract's rule 7, which is also the life pass's rule).
 */
const INFRA_RULE: PlaceRule = { requireFreeColumn: true, requireEmptyVoxel: true };

/** The rule an entry crossing a carriageway on purpose (`block`) writes under. */
const INFRA_CROSSING_RULE: PlaceRule = {
  requireFreeColumn: true,
  requireEmptyVoxel: true,
  onCarriageway: true,
};

/**
 * The rule a **declaring** entry writes under.
 *
 * `requireEmptyVoxel` is off because the whole job is to re-materialise the top
 * course of a column the resolver already decided — the same disposition an
 * areal treatment has always had, for the same reason. `requireFreeColumn`
 * stays **on**: a scar may cut the ground and may not cut a building, and the
 * column rule is what says so without this pass having to know what a building
 * is.
 */
const INFRA_DECLARED_RULE: PlaceRule = {
  requireFreeColumn: true,
  requireEmptyVoxel: false,
  onCarriageway: true,
};

/* -------------------------------------------------------------------------- */
/* the driver                                                                  */
/* -------------------------------------------------------------------------- */

/** Everything {@link buildInfraEntries} reads. */
export interface InfraEntryPassInput {
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly jobs: readonly InfraEntryJob[];
  readonly view: InfraPlacementView;
  /** Every block written so far, in emit order — the occupancy view. */
  readonly existing?: readonly StructureBlock[];
  /**
   * The pipeline's one ground driver, for the entries that declare levels
   * (`InfraEntryDef.declaresLevels` — W1's furrow and crop circle).
   *
   * Optional, and absent for every caller that is not the world pipeline: the
   * terrarium, the exhibits and the unit tests that sweep an entry on a bare
   * plan have no accumulated prefix to arbitrate against, and an entry that
   * declares without one falls back to building on the ground it finds rather
   * than failing (§3.12's disposition, which every converted pass already has).
   */
  readonly ground?: GroundDriver;
  /**
   * The linework slot's handoff (`GROUND-CONTRACT` §13.2a rule 9).
   *
   * **Declare early, build late.** A row whose `sourceClass` is
   * `structure.linework` declared its levels in `structures/linework.ts`, long
   * before this pass; the resolver arbitrated them; and the plan already holds
   * the answer. This is the record that says which columns those were, so the
   * materials can be laid on them here, against `plan.ground` and never against
   * the level the entry asked for.
   *
   * Absent for every caller that is not the world pipeline, and absent for a
   * pipeline whose document has no linework node — in which case a linework row
   * arriving here is refused, which is the whole of the re-pointed refusal.
   */
  readonly lineworkBeds?: LineworkBeds;
  /**
   * **What the declaring half already sited** (§6a.3, WP-G6a).
   *
   * Present only for the world pipeline with `GROUND_V1_FREEZE` on, and then
   * only for the *declaring* rows: `structures/infra-entry-declare.ts` ran at
   * each row's own tier, resolved its route against the solved layout, and
   * committed its levels. This pass consumes that — the course, the openings,
   * the gates, the water plan — and re-derives **nothing** on it.
   *
   * A row with no siting here is a painter (§6a.2): it declares nothing, has no
   * tier, is not governed by §1.4, and is sited from the finished world exactly
   * as it always was, in the branch below. With the flag off there are no
   * sitings at all and every row takes that branch, which is the whole of the
   * byte-identity claim.
   */
  readonly sitings?: InfraSitings;
}

/** One entry, as built. */
interface BuiltInfraEntry {
  readonly nodePath: string;
  readonly entry: string;
  readonly form: InfraRouteForm;
  /** Route columns the sweep claimed and the planter accepted. */
  readonly columns: number;
  /** Route columns refused — collision, unbuildable ground, or too deep. */
  readonly skipped: number;
  /** Openings the crossing behaviour left in the run. */
  readonly openings: number;
  /** Interval fittings seated — masts, markers, crates, debris. */
  readonly fittings: number;
  /** Columns whose level went through the ground contract, or 0. */
  readonly declared: number;
  /**
   * Columns of water this entry impounded, and the head it holds.
   *
   * Present only on a water mover, and `0`/`0` on one whose pool did not close
   * at any head — which is a dam built as dry sculpture, and is reported rather
   * than hidden (`LOAM-T233`).
   */
  readonly impounded?: number;
  readonly head?: number;
}

/** What {@link buildInfraEntries} produced. */
export interface InfraEntryPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly entries: readonly BuiltInfraEntry[];
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: Readonly<Record<string, number>>;
}

/**
 * Build every entry that asked for one.
 *
 * Total on an empty job list, which is the byte-identity claim made structural:
 * a document with no `infra.entry@0` node produces no jobs, the caller never
 * constructs the pass, and nothing about this file can reach the world.
 */
export function buildInfraEntries(input: InfraEntryPassInput): InfraEntryPassResult {
  if (input.jobs.length === 0) {
    return { blocks: [], entries: [], diagnostics: [], stats: {} };
  }
  const diagnostics: LoamDiagnostic[] = [];
  const entries: BuiltInfraEntry[] = [];
  const view = input.view;

  const world = buildLifeWorld({
    plan: input.plan,
    stack: input.stack,
    ...(input.existing === undefined ? {} : { existing: input.existing }),
  });
  const planter = new Planter(
    world,
    input.stack,
    () => false,
    // The carriageway veto is per job, not per pass: an `open` entry must not
    // write in a road and a `block` entry must. It is applied at the rule.
    () => false,
    new Set<string>(),
    INFRA_BUDGET,
  );

  for (const job of input.jobs) {
    // §6a.3's hand-off. A declaring row was sited and declared at its own tier
    // in `infra-entry-declare.ts`; this is that answer, and where it is present
    // nothing below re-derives a route, a crossing or a level. A painter has
    // none and is sited here from the finished world, as it always was.
    const siting = input.sitings?.get(job.nodePath);
    // **Replaced, not deleted** (§13.2f step 3). The wall's slot still refuses
    // the class *from its own position* — a tier-A claim declared here would be
    // arbitrated against a prefix that already contains the streets, and rule 8
    // says a rank-25 bed does not move masonry a lower-ranked pass has already
    // emitted. What changed is where the answer is: the linework slot, which
    // ran before any of that and left its bed on the input.
    const bed = input.lineworkBeds?.get(job.nodePath);
    if (job.def.sourceClass === "structure.linework" && bed === undefined) {
      diagnostics.push(
        warning(
          "INFRA_ENTRY_PARAM",
          job.nodePath,
          `"${job.def.id}" declares structure.linework (ground-contract rank 25, tier A) and no bed reached this pass: a tier-A declarer declares against the baseline, before the streets exist, and this pass runs after them so that a crossing is found against the finished carriageway`,
          "declare it from the linework slot — `structures/linework.ts` runs between buildPrecincts and pavePlaza and finds its crossings in the solved layout",
        ),
      );
      continue;
    }

    // The water movers fork before the route forms, and they have to
 //. `across` finds a chord
    // over a *carriageway*; a dam is a line across a **watercourse**, and the
    // water is in the column plan rather than in the placement view. Everything
    // else about the entry — the profile, the theme, the planter, the refusal
    // diagnostics — is the host's as it stands.
    if (job.def.water !== undefined) {
      entries.push(buildWaterEntry(planter, world, input, job, diagnostics, siting));
      continue;
    }

    const resolved =
      siting === undefined
        ? resolveInfraRoute(job.route, view, { gradeCap: gradeCapOf(job) })
        : siting.resolution;
    if (resolved.kind === "unanchored") {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_UNANCHORED",
          job.nodePath,
          `the "${job.route.form}" route names "${job.route.target}": ${resolved.detail}`,
          'name a node the compiler placed — a district, a holding, a precinct or a road — in the route form, e.g. "route": { "ring": "north_holding", "margin": 12 }',
        ),
      );
      continue;
    }
    if (resolved.kind === "empty") {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_EMPTY",
          job.nodePath,
          `the "${job.route.form}" route resolved to nothing: ${resolved.detail}`,
          "give the anchor more room, or reduce the route's margin/offset so the line stands inside the world region",
        ),
      );
      continue;
    }
    if (resolved.kind === "area") {
      entries.push(stampArea(planter, world, input, job, resolved.columns, siting));
      continue;
    }

    const course = resolved.course;
    if (course.path.length < job.def.minRun) {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_EMPTY",
          job.nodePath,
          `the "${job.route.form}" route resolved to ${course.path.length} column(s), and "${job.def.id}" refuses anything shorter than ${job.def.minRun}`,
          "point the route at something larger, or widen its margin so the derived line is long enough to read as what it is",
        ),
      );
      continue;
    }

    // A span is not a sweep and never was: its geometry is a chord between two
    // heads rather than a cross-section carried along a datum, so it forks
    // before the sweep is ever constructed.
    if (job.def.geometry.kind === "span") {
      // The approaches first, then the span. A carried span's abutment stands
      // on its anchor column and the embankment stands *outside* it, so the two
      // never contend for a voxel — but laying the ground the deck is met on
      // before the deck is what makes the `Planter`'s refusals read in the
      // direction a walker does.
      const paved = bed === undefined ? 0 : layLineworkBed(planter, world, input, job, bed);
      entries.push(buildSpan(planter, world, view, job, course));
      const built = entries[entries.length - 1] as BuiltInfraEntry;
      if (paved > 0) {
        entries[entries.length - 1] = { ...built, declared: paved };
      }
      if (built.columns === 0) {
        diagnostics.push(
          warning(
            "INFRA_ROUTE_EMPTY",
            job.nodePath,
            `a corridor was found for "${job.def.id}" (${course.path.length} columns) and neither end could be built on`,
            "something else already owns both anchors — usually a road, a quay or a building. Name anchors with clear ground at their centres",
          ),
        );
      } else if (built.impounded === 0) {
        // A carried channel whose trough could not be sealed comes out dry, and
        // that is reported rather than hidden — the same disposition a dam
        // whose pool did not close has. Dry is a walk; leaking is `LOAM-T110`.
        diagnostics.push(
          note(
            "INFRA_RUN_REFUSED",
            job.nodePath,
            `"${job.def.id}" built its arcade and no water: the trough could not be closed along the whole run, so it was left dry rather than written with a hole in it`,
            "no change needed if a dry channel reads on a walk — otherwise move the run clear of what its deck is crossing by naming anchors with more air between them",
          ),
        );
      }
      continue;
    }

    // The crossing behaviour, from the siting where there is one: a declaring
    // row found its gates in the **solved** carriageway at its own tier, and
    // re-finding them here against the surfaced one is precisely the read §1.4
    // forbids. A painter finds them here, in the finished world, as before.
    const { openings, gates } =
      siting === undefined
        ? crossingOpenings(job, course, view)
        : { openings: new Set<number>(siting.openings), gates: siting.gates };
    const profile = asSweptProfile(
      job.def.geometry.kind === "route"
        ? job.def.geometry.profile(contextOf(job))
        : // Unreachable: an area registry row resolves to an area route form.
          // Stated rather than thrown, because a registry typo must not take a
          // world down.
          { id: job.def.id, bands: [], follow: "step", maxGrade: 1, crossing: "stop" },
    );
    const swept = sweepCourse({
      profile,
      path: course.path,
      closed: course.closed,
      rise: job.height ?? job.def.rise,
      ground: (x, z) => (inside(input.plan.region, x, z) ? world.standY(x, z) : undefined),
      skip: (i) => openings.has(i),
      bends: course.bends,
      ...(course.reach === undefined ? {} : { reach: course.reach }),
    });

    // Declare → resolve → build, for the entries whose levels *are* the entry
    // (§3.5's declaring path). Before a block is laid, so that every column
    // below reads `standY` as the ground the resolver decided rather than the
    // ground this pass wished for.
    // The water veto. An entry that is not a water mover (`def.water`) has no
    // business standing *in* standing water: a ring course whose hull happens
    // to clip a lake would otherwise declare its own level across the water and
    // fill it from the bed up, cutting the lake in two with a wall of stone.
    // A terrace stops at the shore, and the run reads as a run that met a lake.
    // The veto is applied to the sweep itself rather than to the build loop
    // alone, because a declaring entry drowns a lake through the *ground
    // contract* — the blocks are only the visible half.
    const dryColumns =
      job.def.water === undefined
        ? swept.columns.filter((c) => !nearStandingWater(input.plan, c.x, c.z))
        : swept.columns;
    const vetoed = swept.columns.length - dryColumns.length;

    // The declaration already happened at this row's tier when a siting is
    // present (§6a.3): its columns are in the plan, and declaring them a second
    // time from the build half is the very thing WP-G6a exists to end.
    const declared =
      siting !== undefined
        ? siting.declared
        : job.def.declaresLevels === true
          ? declareRun(input, world, job, dryColumns)
          : 0;

    // `block` and `gap` write through the carriageway on purpose — a hedgerow
    // does not open for a cart track, and a barricade's whole point is that it
    // stops one. `open` is the wall's rule: the road keeps its surface, and the
    // skip set has already taken the gate indices out of the sweep.
    const rule =
      job.def.declaresLevels === true
        ? INFRA_DECLARED_RULE
        : job.def.crossings === "open"
          ? INFRA_RULE
          : INFRA_CROSSING_RULE;
    let placed = 0;
    let skipped = vetoed;
    const own = new Set(dryColumns.map((c) => `${c.x},${c.z}`));
    for (const column of dryColumns) {
      // The carriageway is an absolute veto for the two behaviours that leave
      // the road its surface. `open` skipped the gate indices already; this
      // catches a band column thrown sideways into a lane the skip did not
      // cover, which is the wall's `avoid` predicate said per column.
      if (job.def.crossings === "open" && view.onRoad(column.x, column.z)) {
        skipped++;
        continue;
      }
      const base = world.standY(column.x, column.z);
      if (base === undefined) {
        skipped++;
        continue;
      }
      // A declaring entry paints the top course of the ground it was given,
      // exactly as an areal treatment does: the level is already in the plan,
      // so filling up to it from below would be filling a hole this entry dug.
      const ops =
        job.def.declaresLevels === true
          ? declaredColumnOps(column)
          : infraColumnOps(column, base);
      if (ops === undefined) {
        skipped++;
        continue;
      }
      if (job.def.declaresLevels === true && profile.datumOffset !== undefined) {
        // A retaining profile clads every side it exposes: from the lowest
        // ground beside this column that is not the entry's own, up to the
        // walk, in the band's fill (INFRA_REVETMENT_MAX courses) — the outer
        // face to the town, and the step down to a lower terrace inside.
        let outside: number | undefined;
        for (const [dx, dz] of NEIGHBOURS4) {
          const ox = column.x + dx;
          const oz = column.z + dz;
          if (own.has(`${ox},${oz}`)) continue;
          let stand = world.standY(ox, oz);
          if (stand === undefined) {
            // Water: the face goes down to the bed, as a quay does.
            const floor = base - 1 - INFRA_REVETMENT_MAX;
            let y = base - 2;
            while (y > floor && !world.solidAt(ox, y, oz)) y--;
            if (y > floor) stand = y + 1;
          }
          if (stand !== undefined && (outside === undefined || stand < outside)) outside = stand;
        }
        if (outside !== undefined && outside < base - 1) {
          const from = Math.max(outside, base - 1 - INFRA_REVETMENT_MAX);
          for (let y = from; y <= base - 2; y++) ops.push(op(0, y - base, 0, column.fill));
        }
      }
      if (
        planter.place(
          "infra_entry",
          ops,
          column.x,
          base,
          column.z,
          rule,
          job.def.declaresLevels !== true,
        )
      ) {
        placed++;
      } else skipped++;
    }

    const fittings = seatFittings(planter, world, view, job, swept.features);

    entries.push({
      nodePath: job.nodePath,
      entry: job.def.id,
      form: job.route.form,
      columns: placed,
      skipped,
      openings: gates.length,
      fittings,
      declared,
    });
    if (placed === 0) {
      diagnostics.push(
        warning(
          "INFRA_ROUTE_EMPTY",
          job.nodePath,
          `a route was derived for "${job.def.id}" (${course.path.length} columns) and not one column of it could be built`,
          "something else already owns the line — usually a road shoulder, a building or a scatter. Move the route out with a larger margin or offset",
        ),
      );
    } else if (skipped > (placed + skipped) * INFRA_REFUSAL_FRACTION) {
      diagnostics.push(
        note(
          "INFRA_RUN_REFUSED",
          job.nodePath,
          `"${job.def.id}" built ${placed} of ${placed + skipped} route columns — ${skipped} were refused by collision or unbuildable ground`,
          "no change needed if the gaps read as a worn line on a walk — otherwise move the route clear of what it is crossing with a larger margin or offset",
        ),
      );
    }
  }

  return {
    blocks: planter.blocks,
    entries,
    diagnostics,
    stats: {
      infraEntries: entries.length,
      infraEntryColumns: entries.reduce((s, e) => s + e.columns, 0),
      infraEntryColumnsSkipped: entries.reduce((s, e) => s + e.skipped, 0),
      infraEntryOpenings: entries.reduce((s, e) => s + e.openings, 0),
      infraEntryFittings: entries.reduce((s, e) => s + e.fittings, 0),
      infraEntryDeclared: entries.reduce((s, e) => s + e.declared, 0),
      infraEntryImpounded: entries.reduce((s, e) => s + (e.impounded ?? 0), 0),
      infraEntryBlocks: planter.blocks.length,
    },
  };
}

/**
 * The grade cap a `between` route uses for this job — **the entry's own**,
 * which is §3.2's exact wording.
 *
 * Every geometry kind already states it: a swept profile's `maxGrade` is the
 * steepest step its cross-section may take, and a span's is how steep a line of
 * sight between two anchors may be. Reading it off the geometry rather than
 * adding a fourth field to the registry row is what keeps a route form from
 * becoming a place where an entry states the same number twice and the two
 * disagree.
 */

/**
 * One column of entry: footing from the ground up to the band top, then the
 * band's own surface, then the cap.
 *
 * `undefined` when the footing would be deeper than {@link INFRA_MAX_FILL} or
 * the column's top is already at or below the ground — both mean the line
 * crossed something this entry has no business spanning, and both are better
 * reported as a skipped column than built. The wall's `wallColumnOps` with its
 * merlon parity taken out: a crenellation is the curtain wall's, and a registry
 * that wants one writes it into its own cap.
 */
function infraColumnOps(column: SweptColumn, base: number): LifeOp[] | undefined {
  const height = column.top - base;
  if (height < 0 || height > INFRA_MAX_FILL) return undefined;
  const ops: LifeOp[] = [];
  for (let dy = 0; dy < height; dy++) ops.push(op(0, dy, 0, column.fill));
  ops.push(op(0, height, 0, column.surface));
  const cap = column.cap;
  if (cap !== undefined) {
    for (let c = 1; c <= cap.height; c++) ops.push(op(0, height + c, 0, cap.block));
  }
  return ops;
}

/**
 * One column of a **declaring** entry: the resolved ground's top course,
 * re-materialised, and whatever the band carries above it.
 *
 * Anchored on the column's stand height, so `dy = -1` is the topmost solid
 * block — the same anchor {@link stampArea} uses, and for the same reason. The
 * band's `level` is not read here at all: it was read by {@link declareRun},
 * committed, arbitrated, and is already in the plan. Reading it twice is how a
 * pass ends up painting at a level the resolver refused.
 */
function declaredColumnOps(column: SweptColumn): LifeOp[] {
  const ops: LifeOp[] = [op(0, -1, 0, column.surface)];
  const cap = column.cap;
  if (cap !== undefined) {
    for (let c = 0; c < cap.height; c++) ops.push(op(0, c, 0, cap.block));
  }
  return ops;
}

/**
 * Lay an approach embankment's materials on the ground the resolver gave it
 * (`GROUND-CONTRACT` §13.2a rule 9 — **declare early, build late**).
 *
 * The levels went in at rank 25 in the linework slot, long before this pass; the
 * resolver arbitrated them against every other claim on those columns; the
 * driver wrote the answer into the plan. So there is nothing left to decide
 * here, and this function is careful to decide nothing: it re-materialises the
 * **top course of the ground it was given** through {@link declaredColumnOps},
 * anchored on `world.standY`, exactly as a declaring sweep does. The bed's own
 * `y` is not read at all — reading it would be laying masonry at the level the
 * entry *asked* for, which is the mistake §9a.1 rule 2 exists to forbid, and on
 * a column the resolver refused it is precisely the mistake that leaves a plank
 * of approach hanging in the air over a lane.
 *
 * A column whose level the resolver moved elsewhere therefore comes out as
 * ordinary ground with the entry's paving on it, which is the honest read: the
 * road that took it is the surface there.
 */
function layLineworkBed(
  planter: Planter,
  world: LifeWorld,
  input: InfraEntryPassInput,
  job: InfraEntryJob,
  bed: LineworkBed,
): number {
  const geometry = job.def.geometry;
  if (geometry.kind !== "span") return 0;
  const carry = geometry.span(contextOf(job)).carry;
  if (carry === undefined) return 0;
  const region = input.plan.region;
  let placed = 0;
  // Ascending region index — the order the handoff already carries, restated
  // here because the `Planter`'s first-claim-wins disposition makes write order
  // observable where two beds overlap.
  for (const column of bed.columns) {
    if (!inside(region, column.x, column.z)) continue;
    const base = world.standY(column.x, column.z);
    if (base === undefined) continue;
    const ops = declaredColumnOps({
      x: column.x,
      z: column.z,
      pathIndex: 0,
      offset: 0,
      bandId: "approach",
      role: "carriageway",
      // `top` is unread by `declaredColumnOps` and is stated as the stand height
      // rather than as the bed's declared level, so a later reader cannot mine a
      // refused level out of this object.
      top: base,
      surface: carry.deck,
      fill: carry.pier,
    });
    if (planter.place("infra_linework", ops, column.x, base, column.z, INFRA_DECLARED_RULE, false)) {
      placed++;
    }
  }
  return placed;
}

/**
 * Commit a declaring run's levels to the ground contract (§3.13, §9).
 *
 * `sweep.run`, rank 110, tier C: the run outranks a field and a prop pad and
 * yields to every built thing, which is exactly the disposition a gouge across
 * a farm should have. Columns another pass has already written in are left out
 * of the claim entirely — a furrow that lowered the ground under a road would
 * leave the road hanging over it, and the honest answer is a scar that stops
 * where the town starts.
 *
 * Returns the number of columns declared; `0` when there is no driver, which is
 * every caller that is not the world pipeline.
 */
function declareRun(
  input: InfraEntryPassInput,
  world: LifeWorld,
  job: InfraEntryJob,
  columns: readonly SweptColumn[],
): number {
  const driver = input.ground;
  if (driver === undefined) return 0;
  const region = input.plan.region;
  const claims: GroundClaim[] = [];
  const seen = new Set<number>();
  for (const c of columns) {
    if (!inside(region, c.x, c.z)) continue;
    if (world.taken(c.x, c.z)) continue;
    const idx = index(region, c.x, c.z);
    if (seen.has(idx)) continue;
    seen.add(idx);
    // The sweep's datum is a **stand** height — the first air block, because
    // that is what every entry that stands on the ground needs — and a ground
    // level is the topmost *solid* block. One block apart, and the conversion
    // belongs here rather than in the profile: a registry row says `level: -2`
    // and means two blocks into the earth, which is the only reading of it
    // anybody would defend.
    claims.push({ idx, y: c.top - 1 });
  }
  if (claims.length === 0) return 0;
  // Ascending column index: the claim list is a fact about the region, not
  // about the order the sweep happened to visit its bands in.
  claims.sort((a, b) => a.idx - b.idx);
  const source = `${job.nodePath}#run`;
  const sourceClass = asGroundSourceClass(job.def.sourceClass ?? "sweep.run");
 // Family B — "a declared `face` between two
  // levels". A retaining entry is not a run that follows the ground; it is the
  // step, so it commits the kind only `retaining.seam` and `retaining.skirt`
  // may commit (`LEGAL_KINDS`), with `transition: "wall"` — the face *is* the
  // transition, the retaining pass's own words at `retaining.ts` §3.3b — and a
  // `preserve` over the same columns for the same reason that pass pairs the
  // two: nothing may be left standing over ground a later claim dropped. Both
  // in one commit, because the resolver has to see them together.
  if (sourceClass === "retaining.seam" || sourceClass === "retaining.skirt") {
    driver.commit([
      { source, sourceClass, kind: "face", columns: claims, transition: "wall" },
      { source, sourceClass, kind: "preserve", columns: claims, transition: "none" },
    ]);
    return claims.length;
  }
  driver.commit([
    {
      source,
      sourceClass,
      kind: "profile",
      columns: claims,
      transition: "ramp",
    },
  ]);
  return claims.length;
}

/* -------------------------------------------------------------------------- */
/* the water movers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Build one water-moving entry: `dam`, `weir` or `canal_lock`
 *
 * **Declare, then sweep — in that order, and the order is the whole design.**
 * Every other entry in this file sweeps a profile over the ground it finds. A
 * water mover cannot: the ground it is being built on is *under a river*, and
 * `LifeWorld.standY` returns `undefined` on a wet column, so a dam swept first
 * would refuse every column that was the point of it. So the fluid declaration
 * goes in first, at rank 0; the driver's resolve raises the barrier's columns
 * to the crest and drops the fluid off them; and only then is the profile swept
 * over ground that is now dry, flat and exactly as high as the entry asked.
 *
 * Where no head closes the entry still builds — a dry masonry line across the
 * water, which is what a dam looks like from downstream anyway — and says so.
 * Refusing to build at all would leave an author with a silent node.
 */
function buildWaterEntry(
  planter: Planter,
  world: LifeWorld,
  input: InfraEntryPassInput,
  job: InfraEntryJob,
  diagnostics: LoamDiagnostic[],
  siting?: InfraSiting,
): BuiltInfraEntry {
  const spec = job.def.water as NonNullable<InfraEntryDef["water"]>;
  const empty: BuiltInfraEntry = {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: 0,
    skipped: 0,
    openings: 0,
    fittings: 0,
    declared: 0,
    impounded: 0,
    head: 0,
  };

  // The anchor: a node's own fabric, or — for a node whose extent is a line
  // rather than an area — the corridor it published. Either way it is a *name
  // the compiler placed*, which is §5's rule and the reason no coordinate
  // appears anywhere below.
  // Sited at tier A when a siting is present (§6a.3): the crossing and the
  // closed plan came back from `declareInfraEntries`, and this half is masonry
  // over them. Without one this is the pass as it always was.
  const extent =
    siting !== undefined
      ? undefined
      : (input.view.extentOf(job.route.target) ?? input.view.corridorOf(job.route.target));
  const found =
    siting?.crossing !== undefined
      ? ({ kind: "crossing" as const, ...siting.crossing })
      : extent === undefined
        ? { kind: "none" as const, detail: `"${job.route.target}" named nothing the compiler placed` }
        : findWatercourse(input.plan, input.view.bounds, extent);
  if (found.kind === "none") {
    diagnostics.push(
      warning(
        "INFRA_ROUTE_UNANCHORED",
        job.nodePath,
        `"${job.def.id}" is thrown across a watercourse and none was found at "${job.route.target}": ${found.detail}`,
        'name a node the compiler placed that stands on running water — a riverside district, a mill holding, a canal quarter — e.g. "route": { "across": "mill_holding" }',
      ),
    );
    return empty;
  }
  if (found.span < job.def.minRun) {
    diagnostics.push(
      warning(
        "INFRA_ROUTE_EMPTY",
        job.nodePath,
        `the narrowest crossing at "${job.route.target}" is ${found.span} column(s) of water, and "${job.def.id}" refuses anything narrower than ${job.def.minRun}`,
        "point the route at a place the water is wider, or use a smaller waterwork — a weir crosses what a dam will not",
      ),
    );
    return empty;
  }

  const profile = asSweptProfile(
    job.def.geometry.kind === "route"
      ? job.def.geometry.profile(contextOf(job))
      : { id: job.def.id, bands: [], follow: "step", maxGrade: 1, crossing: "stop" },
  );
  const span = profileSpan(profile);
  const halfSpan = Math.max(Math.abs(span.lo), Math.abs(span.hi));
  const line = barrierLine(found, WATERCOURSE_FLANK);

  const works: WaterWorks =
    siting?.works ??
    planWaterWorks({
      plan: input.plan,
      crossing: found,
      spec,
      halfSpan,
      taken: (x, z) => world.taken(x, z),
      flank: WATERCOURSE_FLANK,
    });
  if (siting === undefined && works.refusal !== undefined) {
    diagnostics.push(
      note(
        "INFRA_RUN_REFUSED",
        job.nodePath,
        `"${job.def.id}" holds no water at "${job.route.target}": ${works.refusal} — it is built as a dry structure across the water`,
        "move it to a narrower, steeper place, or leave it: a barrier that impounds nothing still reads as one from the bank",
      ),
    );
  }
  // The level went through the contract at tier A when a siting is present, so
  // this is the material half alone (§6a.7 step 4's `drownPool` note): a column
  // that has just gone under loses its top course, its soil and its snow.
  if (siting === undefined) declareWaterWorks(input.ground, job.nodePath, works);
  drownPool(input.plan, works);

  // --- the masonry ---------------------------------------------------------
  // One profile, swept once per gate. A lock's two gates are the same object
  // and writing them from one row is what stops them drifting apart.
  const offsets = works.gateOffset === 0 ? [0] : [0, works.gateOffset];
  const painted = new Set<number>();
  let placed = 0;
  let skipped = 0;
  for (const offset of offsets) {
    const path = line.map((c) => ({
      x: c.x + offset * found.up.dx,
      z: c.z + offset * found.up.dz,
    }));
    const swept = sweepCourse({
      profile,
      path,
      closed: false,
      rise: job.height ?? job.def.rise,
      ground: (x, z) => (inside(input.plan.region, x, z) ? world.standY(x, z) : undefined),
      bends: [],
    });
    for (const column of swept.columns) {
      const base = world.standY(column.x, column.z);
      if (base === undefined) {
        skipped++;
        continue;
      }
      // The dressed face: courses of the entry's own masonry cut into the mass
      // under the crest, on the outermost lanes alone. The mass itself is the
      // terrain body — everything below a declared ground level is stone by
      // construction, which is what makes the barrier watertight without this
      // pass having to build a wall — so this is a facing and never a fill.
      const dressed = Math.abs(column.offset) === halfSpan ? spec.face : 0;
      const ops: LifeOp[] = [op(0, -1, 0, column.surface)];
      for (let c = 2; c <= dressed + 1; c++) ops.push(op(0, -c, 0, column.surface));
      const cap = column.cap;
      if (cap !== undefined) {
        for (let c = 0; c < cap.height; c++) ops.push(op(0, c, 0, cap.block));
      }
      if (planter.place("infra_entry", ops, column.x, base, column.z, INFRA_DECLARED_RULE, false)) {
        placed++;
        painted.add(index(input.plan.region, column.x, column.z));
      } else skipped++;
    }
  }

  // A lock's chamber walls are declared ground that no gate's cross-section
  // reaches. They are the coping of the outermost band, laid on the level the
  // resolver gave, which is the same disposition every declaring entry has.
  const coping = profile.bands[profile.bands.length - 1]?.surface;
  if (coping !== undefined) {
    for (const k of works.barrier.keys()) {
      if (painted.has(k)) continue;
      const i = k % input.plan.region.width;
      const x = input.plan.region.x0 + i;
      const z = input.plan.region.z0 + (k - i) / input.plan.region.width;
      const base = world.standY(x, z);
      if (base === undefined) continue;
      if (planter.place("infra_entry", [op(0, -1, 0, coping)], x, base, z, INFRA_DECLARED_RULE, false)) {
        placed++;
        painted.add(k);
      }
    }
  }

  if (placed === 0) {
    diagnostics.push(
      warning(
        "INFRA_ROUTE_EMPTY",
        job.nodePath,
        `a crossing was found for "${job.def.id}" (${found.span} columns of water) and not one column of it could be built`,
        "something else already owns both banks — move the route to a reach of water nothing is standing on",
      ),
    );
  }

  return {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: placed,
    skipped,
    openings: 0,
    fittings: 0,
    declared: works.barrier.size + works.pool.size,
    impounded: works.pool.size,
    head: works.head,
  };
}

/**
 * Seat the profile's interval features as fittings — a column of blocks each.
 *
 * The features are already placed: `sweepCourse` seated them by arc length off
 * the true line, phase-locked to the path's start, so two compiles put the
 * masts in the same places. All this adds is what stands there, and it re-reads
 * the ground under each one rather than trusting the datum: a mast is off the
 * line by a column or two, and a column or two sideways on a slope is a
 * different stand height.
 */
function seatFittings(
  planter: Planter,
  world: LifeWorld,
  view: InfraPlacementView,
  job: InfraEntryJob,
  features: readonly { readonly id: string; readonly x: number; readonly z: number }[],
): number {
  const table = job.def.fittings;
  if (table === undefined) return 0;
  let seated = 0;
  for (const feature of features) {
    const fitting = table[feature.id];
    if (fitting === undefined || fitting.stack.length === 0) continue;
    // The carriageway veto the column loop applies, applied to the furniture:
    // a floodlight mast in the middle of the gate is the gate's problem.
    if (job.def.crossings === "open" && view.onRoad(feature.x, feature.z)) continue;
    const base = world.standY(feature.x, feature.z);
    if (base === undefined) continue;
    const ops = fitting.stack.map((block, k) => op(0, k, 0, block));
    if (planter.place("infra_fitting", ops, feature.x, base, feature.z, INFRA_RULE)) seated++;
  }
  return seated;
}

/* -------------------------------------------------------------------------- */
/* the span — two towers and a hanging curve                                   */
/* -------------------------------------------------------------------------- */

/** Terms of the `cosh` series. Past this the addend is under 1e-17 for |x| ≤ 4. */
const COSH_TERMS = 20;

/** The largest argument {@link cosh} is asked for; beyond it the curve is flat. */
const COSH_LIMIT = 4;

/**
 * `cosh`, as a series in `+`, `*` and `/` alone.
 *
 * **Not `Math.cosh`.** determinism rule and `stdlib`'s §6.5
 * rule 6 say the same thing about the transcendental library: `Math.cosh`,
 * `Math.exp` and friends are not exactly specified by IEEE 754, so two engines
 * may return neighbouring doubles for the same input — and a world that
 * disagreed with itself by one block of chain sag between two machines would
 * break the byte-identity claim silently, for some users only. The Taylor
 * series is `+`, `*` and `/`, every one of which *is* exactly specified, so a
 * fixed term count is a bit-identical answer everywhere.
 *
 * Converges fast over the range a catenary ever asks for: the argument is
 * half-span over the catenary parameter, which for any sag a chain has is under
 * two, and it is clamped at {@link COSH_LIMIT} so a degenerate solve cannot
 * walk out of the series' comfortable range.
 */
export function cosh(x: number): number {
  const t = Math.min(Math.abs(x), COSH_LIMIT);
  const xx = t * t;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < COSH_TERMS; k++) {
    term = (term * xx) / ((2 * k - 1) * (2 * k));
    sum += term;
  }
  return sum;
}

/** Halvings the catenary solve takes. Fixed, because a tolerance is a clock. */
const CATENARY_STEPS = 64;

/**
 * The catenary parameter `a` whose curve sags `sag` blocks over a chord of
 * `span` blocks.
 *
 * The real thing, not a parabola: a hanging chain is `y = a·cosh(s/a)`, its sag
 * at mid-span is `a·(cosh(span/2a) − 1)`, and that expression is strictly
 * *decreasing* in `a` — a taut chain is a large `a` and a slack one a small
 * one. Strictly monotone means bisection, and bisection with a **fixed** step
 * count is the deterministic root-finder: a loop that stopped on a tolerance
 * would stop after a machine-dependent number of iterations at exactly the
 * inputs where the two machines disagreed.
 *
 * Sixty-four halvings of a bracket that starts at four decades takes the
 * interval below 1e-17 of its width, which is past the point where the rounded
 * block heights could differ.
 */
export function catenaryParameter(span: number, sag: number): number {
  const want = Math.max(sag, 1e-9);
  let lo = span / 10_000;
  let hi = span * 1_000;
  for (let i = 0; i < CATENARY_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const at = mid * (cosh(span / (2 * mid)) - 1);
    if (at > want) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The height of every column of a hanging span, tower head to tower head.
 *
 * Three things happen here and the order of them is the whole of the geometry:
 *
 * 1. **The curve.** The chord between the two heads, interpolated linearly,
 *    minus the catenary's own dip — which is zero at both ends and `sag·span`
 *    at mid-span. Unequal heads are handled by carrying the dip on the chord
 *    rather than by solving an asymmetric catenary, which is the standard
 *    reading and is exact when the heads are level (the case a harbour mouth
 *    actually is).
 * 2. **The floor.** Every column is lifted to `clearance` blocks above whatever
 *    stands under it, so the chain is *slung across* the water rather than
 *    lying in it — and never lifted above the chord, because a chain that rose
 *    over its own supports is not hanging.
 * 3. **The hang.** From the low point outward to each tower the heights are
 *    forced non-decreasing, by **raising**, capped at that side's head. Raising
 *    rather than lowering is what keeps step 2's clearance: a repair that
 *    lowered would put back the block in the water that step 2 just took out.
 *    Without this step a floor that lifted one column and not its neighbour
 *    would leave a chain block with nothing above it and nothing beside it,
 *    which is the one thing a hanging member may never be.
 */
export function spanHeights(
  headA: number,
  headB: number,
  span: number,
  sag: number,
  floorAt: (i: number) => number | undefined,
): number[] {
  const n = span + 1;
  if (n < 2) return [headA];
  const a = catenaryParameter(span, Math.max(0, sag) * span);
  const mid = span / 2;
  const crest = cosh(mid / a);
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const chord = headA + ((headB - headA) * i) / span;
    const dip = a * (crest - cosh((i - mid) / a));
    y.push(Math.round(chord - dip));
  }
  y[0] = headA;
  y[n - 1] = headB;

  // The floor. Interior columns only: a tower head is where it is.
  for (let i = 1; i < n - 1; i++) {
    const floor = floorAt(i);
    if (floor === undefined) continue;
    const chord = Math.round(headA + ((headB - headA) * i) / span);
    y[i] = Math.min(chord, Math.max(y[i] as number, floor));
  }

  // The hang, from the lowest column outward. Ties to the lowest index, which
  // is a stated order over an index rather than over a height.
  let low = 0;
  for (let i = 1; i < n; i++) if ((y[i] as number) < (y[low] as number)) low = i;
  for (let i = low - 1; i >= 1; i--) y[i] = Math.min(Math.max(y[i] as number, y[i + 1] as number), headA);
  for (let i = low + 1; i < n - 1; i++) {
    y[i] = Math.min(Math.max(y[i] as number, y[i - 1] as number), headB);
  }
  return y;
}

/**
 * The vertical run of member each column carries, as `[bottom, top]`.
 *
 * A hanging curve rendered one block per column is not a curve: where the
 * heights step by more than one, the two blocks touch at a corner and nothing
 * else, and a chain block whose only neighbour is diagonal is hanging from
 * nothing. So each column is filled **up to the level of the neighbour nearer
 * its tower**, which is exactly how a real chain behaves — it goes down
 * vertically and along horizontally, never diagonally — and it makes the whole
 * member one 6-connected set anchored at both heads. That connectivity is the
 * invariant `test/infra-entry.test.ts` asserts, because it is the physics claim:
 * every block hangs from the tower or from a block of chain above or beside it.
 */
export function spanRuns(y: readonly number[]): { lo: number; hi: number }[] {
  const n = y.length;
  let low = 0;
  for (let i = 1; i < n; i++) if ((y[i] as number) < (y[low] as number)) low = i;
  const runs: { lo: number; hi: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      // The heads: the tower is the block there, and the curve does not repeat it.
      runs.push({ lo: y[i] as number, hi: (y[i] as number) - 1 });
      continue;
    }
    const left = y[i - 1] as number;
    const right = y[i + 1] as number;
    const hi = i < low ? left : i > low ? right : Math.max(left, right);
    runs.push({ lo: y[i] as number, hi: Math.max(hi, y[i] as number) });
  }
  return runs;
}

/** The rule the hanging member writes under — it owns air, not a column. */
const INFRA_CABLE_RULE: PlaceRule = {
  // A span's whole point is that it crosses ground it does not own: a quay, a
  // mole, a lane, open water. Demanding a free column would delete the chain
  // over every one of them, which is the opposite of what a chain across a
  // harbour mouth is for. The voxel rule stays on — the member takes air and
  // never a block somebody else wrote — and it is what keeps the claim honest
  // without a second opinion about who owns the seabed.
  requireFreeColumn: false,
  requireEmptyVoxel: true,
  padAbove: false,
  onCarriageway: true,
};

/**
 * A **span**: two towers on the ends of a resolved corridor, and a catenary
 * hung between their heads (family E's `harbour_chain_tower`).
 *
 * The chain is strung on the **straight chord** between the two towers rather
 * than along the router's corridor, and the difference is the point: the
 * corridor is what answers *can these two anchors see each other on ground
 * something could stand on* — that is why `between` runs the cost field at all,
 * and it is what refuses a pair of moles with a headland between them — but a
 * chain hangs on the shortest line between its ends, because that is what
 * gravity does. Bending a chain round a valley would be a rope on pulleys.
 */
function buildSpan(
  planter: Planter,
  world: LifeWorld,
  view: InfraPlacementView,
  job: InfraEntryJob,
  course: InfraCourse,
): BuiltInfraEntry {
  const def: InfraSpanDef =
    job.def.geometry.kind === "span"
      ? job.def.geometry.span(contextOf(job))
      : // Unreachable: the driver dispatches on the same discriminant. Stated
        // rather than thrown, for the reason every fallback in this file is.
        { id: job.def.id, tower: [], cable: "iron_chain", sag: 0, clearance: 0, maxGrade: 1 };

  // A carried run is the other thing two anchors can have between them, and it
  // forks here rather than deeper: nothing below this line is about a member
  // that stands, and a shared function pretending otherwise would be two
  // geometries wearing one name.
  if (def.carry !== undefined) return buildCarriedSpan(planter, world, view, job, course, def);

  const path = course.path;
  let placed = 0;
  let skipped = 0;

  // --- the supports --------------------------------------------------------
  // Two for a single span; every `pitch` columns for a pole line. Both ends are
  // always in the set, because the run is fixed to the anchors the author
  // named and to nothing else.
  const at = supportIndices(path.length, def.pitch);
  const poles: { index: number; head: number }[] = [];
  const heads = new Map<number, number | undefined>();
  for (const i of at) {
    const c = path[i] as CoursePoint;
    const base = world.standY(c.x, c.z);
    let head: number | undefined;
    // The carriageway veto the route path applies, applied to the supports: a
    // chain tower planted in a lane is the lane's problem, and refusing it is
    // the same disposition every `open` entry has about the road. A *dropped*
    // pole is not a hole in a pole line — the wire either side of it joins
    // across the gap below, which is what a line does at a junction.
    const barred = base === undefined || (job.def.crossings === "open" && view.onRoad(c.x, c.z));
    if (!barred) {
      const stack = def.tower ?? [];
      const ops = stack.map((block, k) => op(0, k, 0, block));
      if (ops.length > 0 && planter.place("infra_tower", ops, c.x, base as number, c.z, INFRA_RULE)) {
        head = (base as number) + stack.length - 1;
      }
    }
    heads.set(i, head);
    if (head === undefined) skipped++;
    else {
      placed++;
      poles.push({ index: i, head });
    }
  }

  // A span with one tower is a tower, and a pole line with no pole at one end
  // is fixed to nothing. The member is refused whole rather than left hanging
  // off the end that did get built — "ships as a pair or not at all" is the
  // catalog's own sentence about the first client of this geometry.
  const first = heads.get(at[0] as number);
  const last = heads.get(at[at.length - 1] as number);
  if (first === undefined || last === undefined || poles.length < 2) {
    return {
      nodePath: job.nodePath,
      entry: job.def.id,
      form: job.route.form,
      columns: placed,
      skipped,
      openings: 0,
      fittings: 0,
      declared: 0,
    };
  }

  // --- the curve, bay by bay ----------------------------------------------
  for (let k = 0; k + 1 < poles.length; k++) {
    const a = poles[k] as { index: number; head: number };
    const b = poles[k + 1] as { index: number; head: number };
    const bay = stringMember(
      planter,
      world,
      def,
      path[a.index] as CoursePoint,
      path[b.index] as CoursePoint,
      a.head,
      b.head,
    );
    placed += bay.placed;
    skipped += bay.skipped;
  }

  return {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: placed,
    skipped,
    openings: 0,
    fittings: 0,
    declared: 0,
  };
}

/**
 * Where a span's supports stand, as path indices.
 *
 * Both ends, always, and every `pitch` columns between them when the row states
 * one. The last interior index is dropped when it lands within half a pitch of
 * the far end, because two poles a stride apart is the one rhythm error a
 * regular interval can make and it is visible from a mile away.
 */
export function supportIndices(length: number, pitch: number | undefined): number[] {
  const last = length - 1;
  if (last <= 0) return [0];
  if (pitch === undefined || pitch <= 0) return [0, last];
  const out = [0];
  for (let i = pitch; i < last; i += pitch) {
    if (last - i < pitch / 2) break;
    out.push(i);
  }
  out.push(last);
  return out;
}

/**
 * One bay of a hanging member: the curve between two support heads.
 *
 * The member is strung on the **straight chord** between the two supports
 * rather than along the router's corridor, and the difference is the point: the
 * corridor is what answers *can these two anchors see each other on ground
 * something could stand on*, but a chain hangs on the shortest line between its
 * ends, because that is what gravity does.
 */
function stringMember(
  planter: Planter,
  world: LifeWorld,
  def: InfraSpanDef,
  a: CoursePoint,
  b: CoursePoint,
  headA: number,
  headB: number,
): { placed: number; skipped: number } {
  const chord = rasterize([a, b]);
  const span = chord.length - 1;
  let placed = 0;
  let skipped = 0;
  if (span < 1) return { placed, skipped };
  const y = spanHeights(headA, headB, span, def.sag ?? 0, (i) => {
    const c = chord[i] as CoursePoint;
    const stand = world.standY(c.x, c.z);
    return stand === undefined ? undefined : stand + Math.max(0, def.clearance);
  });
  const runs = spanRuns(y);
  const cable = def.cable ?? "iron_chain";
  for (let i = 1; i < chord.length - 1; i++) {
    const c = chord[i] as CoursePoint;
    const run = runs[i] as { lo: number; hi: number };
    const ops: LifeOp[] = [];
    // `axis: "y"` said out loud. Every block of the member is part of a
    // vertical run by construction — the curve goes down and along, never
    // diagonally — and a chain left on its default state is the `connection.
    // stale` family of defect one block wide. A member with no axis of its own
    // (a wire of bars) resolves through the name and takes its state from the
    // emitter's connection pass instead.
    for (let level = run.lo; level <= run.hi; level++) {
      ops.push(op(0, level - run.lo, 0, cable, { axis: "y" }));
    }
    if (ops.length === 0) {
      skipped++;
      continue;
    }
    // `anchorsGround` off: the member is in the air by construction, and the
    // stand-height check exists for recipes that stand on the ground.
    if (planter.place("infra_cable", ops, c.x, run.lo, c.z, INFRA_CABLE_RULE, false)) placed++;
    else skipped++;
  }
  return { placed, skipped };
}

/* -------------------------------------------------------------------------- */
/* the carried span — a level deck on piers                                    */
/* -------------------------------------------------------------------------- */

/** The rule a carried deck writes under — it crosses ground it does not own. */
const INFRA_DECK_RULE: PlaceRule = {
  // The cable rule's argument, one storey down: an arcade's whole point is that
  // it strides over a lane, a field, a river. The voxel rule stays on, so the
  // deck takes air and never a block somebody else wrote.
  requireFreeColumn: false,
  requireEmptyVoxel: true,
  padAbove: false,
  onCarriageway: true,
};

/** One column of a carried cross-section, as the host classified it. */
interface CarryCell {
  readonly x: number;
  readonly z: number;
  /** Columns off the line, signed; the sign is the normal's left hand. */
  readonly t: number;
  /** The chord index this column was reached from — which bay it is in. */
  readonly i: number;
}

const carryKey = (x: number, z: number): string => `${x},${z}`;

/**
 * A **carried span**: a level deck on regular piers, between two anchors.
 *
 * Three claims, and the order below is all three of them:
 *
 * 1. **The deck is level.** One course, from the higher of the two anchors'
 *    ground plus the row's clearance, end to end. An aqueduct whose water
 *    followed the ground would be a river, and a guideway that followed it
 *    would be a road.
 * 2. **The ground keeps its passage.** Piers stand every `pitch` columns and
 *    are `pierHalf` wide, so between one and the next there is open ground at
 *    grade — the arch opening, which is the one thing an arcade must not take
 *    away from what it crosses. A bay whose ground is further down than
 *    `maxPier` is left open rather than filled with a leg.
 * 3. **The water cannot flow.** Every water column is floored, every water
 *    column's non-water neighbour is walled, and the body is written **whole or
 *    not at all** — one `Planter` claim, so a trough that could not be sealed
 *    comes out dry rather than leaking. That is the same argument `canals.ts`
 *    makes on the column plan, made here over placed blocks because the plan
 *    cannot see nine blocks of air.
 */
function buildCarriedSpan(
  planter: Planter,
  world: LifeWorld,
  view: InfraPlacementView,
  job: InfraEntryJob,
  course: InfraCourse,
  def: InfraSpanDef,
): BuiltInfraEntry {
  const carry = def.carry as NonNullable<InfraSpanDef["carry"]>;
  const ends = [course.path[0] as CoursePoint, course.path[course.path.length - 1] as CoursePoint];
  const nothing: BuiltInfraEntry = {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: 0,
    skipped: 1,
    openings: 0,
    fittings: 0,
    declared: 0,
  };
  const baseA = world.standY(ends[0]?.x as number, ends[0]?.z as number);
  const baseB = world.standY(ends[1]?.x as number, ends[1]?.z as number);
  if (baseA === undefined || baseB === undefined) return nothing;

  const deckY = Math.max(baseA, baseB) + Math.max(1, def.clearance);
  const chord = rasterize([ends[0] as CoursePoint, ends[1] as CoursePoint]);
  const n = chord.length;
  if (n < 3) return nothing;

  // --- the cross-section, as a set of columns ------------------------------
  // A Map keyed by column rather than a per-index list, because a rasterized
  // diagonal reaches the same column from two indices and the deck is a *set*:
  // the closure argument the water rests on is over 4-neighbours in the world,
  // and it can only be made once each column has exactly one classification.
  // Ties go to the column nearest the line, which is a stated total order.
  const cells = new Map<string, CarryCell>();
  for (let i = 0; i < n; i++) {
    const c = chord[i] as CoursePoint;
    const nrm = normalAt(chord, i, false);
    for (let t = -carry.half; t <= carry.half; t++) {
      const x = c.x + Math.round(nrm.nx * t);
      const z = c.z + Math.round(nrm.nz * t);
      const key = carryKey(x, z);
      const held = cells.get(key);
      if (held !== undefined && Math.abs(held.t) <= Math.abs(t)) continue;
      cells.set(key, { x, z, t, i });
    }
  }

  const isEnd = (cell: CarryCell): boolean => cell.i === 0 || cell.i === n - 1;
  const channel = carry.channel;
  const water = new Map<string, CarryCell>();
  if (channel !== undefined) {
    for (const [key, cell] of cells) {
      if (!isEnd(cell) && Math.abs(cell.t) <= channel.half) water.set(key, cell);
    }
  }
  // The closure: every 4-neighbour of a water column that is not itself water
  // must hold the water in, whether or not the deck reached that far. This is
  // what makes a diagonal run watertight — the rasterization is under no
  // obligation to tile, and the closure does not care.
  const wall = new Map<string, { x: number; z: number }>();
  for (const cell of water.values()) {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = cell.x + dx;
      const z = cell.z + dz;
      const key = carryKey(x, z);
      if (water.has(key) || wall.has(key)) continue;
      wall.set(key, { x, z });
    }
  }

  let placed = 0;
  let skipped = 0;
  /** Columns that ended up with a solid block at the water's own course. */
  const sealed = new Set<string>();
  /** Columns that ended up with a solid floor under the water's course. */
  const floored = new Set<string>();

  const stand = (x: number, z: number): number | undefined => world.standY(x, z);
  const column = (
    kind: string,
    x: number,
    z: number,
    from: number,
    to: number,
    block: string,
    rule: PlaceRule,
  ): boolean => {
    const ops: LifeOp[] = [];
    for (let y = from; y <= to; y++) ops.push(op(0, y - from, 0, block));
    if (ops.length === 0) return false;
    return planter.place(kind, ops, x, from, z, rule, false);
  };

  // --- 1. the two abutments ------------------------------------------------
  // Full width, ground to the top of the section: the end of an arcade is a
  // mass of masonry, and for a channel it is also what caps the trough.
  const top = channel === undefined ? deckY + (carry.rail === undefined ? 0 : 1) : deckY + 2;
  for (const cell of cells.values()) {
    if (!isEnd(cell)) continue;
    const base = stand(cell.x, cell.z);
    if (base === undefined || deckY - base > carry.maxPier) {
      skipped++;
      continue;
    }
    if (column("infra_abutment", cell.x, cell.z, base, top, carry.pier, INFRA_RULE)) {
      placed++;
      sealed.add(carryKey(cell.x, cell.z));
      floored.add(carryKey(cell.x, cell.z));
    } else skipped++;
  }

  // --- 2. the piers, and the haunch either side of each --------------------
  const pitch = Math.max(1, def.pitch ?? Math.max(1, n - 1));
  for (const cell of cells.values()) {
    if (isEnd(cell) || Math.abs(cell.t) > carry.pierHalf) continue;
    const onPier = cell.i % pitch === 0;
    const onHaunch = (cell.i + 1) % pitch === 0 || (cell.i - 1) % pitch === 0;
    if (!onPier && !onHaunch) continue;
    // A pier standing in a lane is the lane's problem, exactly as a tower in
    // one is: the bay is left open and the deck strides over it.
    if (job.def.crossings === "open" && view.onRoad(cell.x, cell.z)) {
      skipped++;
      continue;
    }
    const base = stand(cell.x, cell.z);
    if (base === undefined) {
      skipped++;
      continue;
    }
    const from = onPier ? base : deckY - 1;
    if (onPier && deckY - 1 - base > carry.maxPier) {
      // Too far down to stand a leg: the arch opening becomes the whole bay,
      // which is the honest answer over a gorge.
      skipped++;
      continue;
    }
    if (from > deckY - 1) {
      skipped++;
      continue;
    }
    if (column("infra_pier", cell.x, cell.z, from, deckY - 1, carry.pier, INFRA_RULE)) placed++;
    else skipped++;
  }

  // --- 3. the deck floor ---------------------------------------------------
  for (const [key, cell] of cells) {
    // A trough wall carries its own floor, in one claim from the deck course
    // up: the `Planter` refuses a voxel this pass already owns, so a floor laid
    // under a wall column *before* the wall is what would leave the trough
    // open on that hand.
    if (isEnd(cell) || wall.has(key)) continue;
    const block = water.has(key) ? (channel as { lining: string }).lining : carry.deck;
    if (column("infra_deck", cell.x, cell.z, deckY, deckY, block, INFRA_DECK_RULE)) {
      placed++;
      floored.add(key);
    } else skipped++;
  }

  // --- 4. the trough walls, or the guideway's rails ------------------------
  if (channel !== undefined) {
    for (const [key, at] of wall) {
      const cell = cells.get(key);
      if (cell !== undefined && isEnd(cell)) continue;
      // Two courses: one holds the water, the one over it is the kerb that
      // stops a walker on the maintenance path stepping into the channel.
      if (column("infra_trough", at.x, at.z, deckY, deckY + 2, channel.lining, INFRA_DECK_RULE)) {
        placed++;
        sealed.add(key);
        floored.add(key);
      } else skipped++;
    }
    // The maintenance walk: every deck column that is neither water nor wall.
    for (const [key, cell] of cells) {
      if (isEnd(cell) || water.has(key) || wall.has(key)) continue;
      if (column("infra_walk", cell.x, cell.z, deckY + 1, deckY + 1, carry.deck, INFRA_DECK_RULE)) {
        placed++;
        sealed.add(key);
      } else skipped++;
    }
  } else if (carry.rail !== undefined) {
    for (const [, cell] of cells) {
      if (isEnd(cell) || Math.abs(cell.t) !== carry.half) continue;
      if (column("infra_rail", cell.x, cell.z, deckY + 1, deckY + 1, carry.rail, INFRA_DECK_RULE)) {
        placed++;
      } else skipped++;
    }
  }

  // --- 5. the water, whole or not at all -----------------------------------
  let impounded = 0;
  if (channel !== undefined && water.size > 0) {
    // Liveness by removal, to a fixed point: a water column survives only if it
    // has a floor and every one of its four neighbours is either another
    // surviving water column or a column this pass actually sealed. Anything
    // that fails takes its neighbours with it, so the answer is the largest
    // provably-closed body — and the loop is bounded by the body's own size,
    // which is a fixed iteration count rather than a tolerance.
    const live = new Set<string>();
    for (const [key] of water) if (floored.has(key)) live.add(key);
    for (let pass = 0; pass <= water.size; pass++) {
      const doomed: string[] = [];
      for (const key of live) {
        const cell = water.get(key) as CarryCell;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nk = carryKey(cell.x + dx, cell.z + dz);
          if (live.has(nk) || sealed.has(nk)) continue;
          doomed.push(key);
          break;
        }
      }
      if (doomed.length === 0) break;
      for (const key of doomed) live.delete(key);
    }
    // One claim for the whole body: `Planter.place` is all-or-nothing, so a
    // column it would refuse leaves the trough dry rather than holed. A dry
    // aqueduct is a walk; a holed one is `LOAM-T110` on the first tick.
    const ops: LifeOp[] = [];
    const origin = water.get([...live][0] ?? "") as CarryCell | undefined;
    if (origin !== undefined) {
      for (const key of live) {
        const cell = water.get(key) as CarryCell;
        ops.push(op(cell.x - origin.x, 0, cell.z - origin.z, "water", { level: "0" }));
      }
      if (planter.place("infra_water", ops, origin.x, deckY + 1, origin.z, INFRA_DECK_RULE, false)) {
        impounded = ops.length;
        placed += ops.length;
      } else skipped++;
    }
  }

  return {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: placed,
    skipped,
    openings: 0,
    fittings: 0,
    declared: 0,
    ...(channel === undefined ? {} : { impounded }),
  };
}

/**
 * An areal treatment: the top course of ground it does not own (family C).
 *
 * Two shapes, and the registry row says which. **A treatment** writes no level
 * and no block above the surface — that is what a treatment *is*, and it is why
 * the class table has nothing for it to declare. **A declaring treatment** —
 * `crop_circle`, per the ratified Q2 — additionally levels its own footprint
 * through the ground contract and presses the standing crop flat, because a
 * figure that only repaints the soil reads as paint from the air and as nothing
 * from the ground.
 *
 * The accepted risk §5 names lives in the first shape: material ownership is
 * unprotected by the ground contract, so the mitigation is pass order (this
 * runs after everything that could move the ground) plus the generated-world
 * assertion that a treated column's emitted top block is the treatment's.
 */
function stampArea(
  planter: Planter,
  world: LifeWorld,
  input: InfraEntryPassInput,
  job: InfraEntryJob,
  columns: readonly CoursePoint[],
  siting?: InfraSiting,
): BuiltInfraEntry {
  const stamp =
    job.def.geometry.kind === "area"
      ? job.def.geometry.stamp(contextOf(job, extentOf(columns)))
      : { id: job.def.id, surface: "dirt" };
  const depth = Math.max(0, stamp.depth ?? 0);
  const flattens = job.def.declaresLevels === true;

  // --- which columns the figure covers, and what each becomes ---------------
  // The mask says where the pass *may* write; the stamp's own geometry says
  // what the pattern is. Centre-relative, because the registry may never see a
  // world coordinate (§5), and rounded once here so every cell is measured
  // from the same origin.
  const centre = centroid(columns);
  const covered: { readonly c: CoursePoint; readonly cell: InfraAreaCell }[] = [];
  for (const c of columns) {
    const cell =
      stamp.cell === undefined
        ? ({ surface: stamp.surface } satisfies InfraAreaCell)
        : stamp.cell(c.x - centre.x, c.z - centre.z);
    if (cell === undefined) continue;
    const stand = world.standY(c.x, c.z);
    if (stand === undefined) continue;
    // A column carrying something taller than the treatment clears is not
    // wheat: it is a barn, a scarecrow's post, a tree. Skipped whole, so a
    // flattening figure never takes the top off a building.
    if (flattens && world.solidAt(c.x, stand + Math.max(0, cell.clear ?? 0), c.z)) continue;
    covered.push({ c, cell });
  }

  // A sited figure declared its one level at its own tier; this half presses
  // the crop flat on the answer and counts what the declarer committed.
  let declared = siting?.declared ?? 0;
  if (siting === undefined && flattens && input.ground !== undefined && covered.length > 0) {
    declared = declareFlat(input, world, job, covered.map((e) => e.c));
  }

  // --- the materials, on the ground the resolver gave ------------------------
  let placed = 0;
  let skipped = 0;
  for (const { c, cell } of covered) {
    const stand = world.standY(c.x, c.z);
    if (stand === undefined) {
      skipped++;
      continue;
    }
    const ops: LifeOp[] = [];
    if (cell.surface !== undefined) {
      for (let d = 0; d <= depth; d++) ops.push(op(0, -1 - d, 0, cell.surface));
    }
    // Pressing the crop: only where something is actually standing, so a
    // treatment over bare soil costs no blocks at all.
    for (let up = 0; up < Math.max(0, cell.clear ?? 0); up++) {
      if (!world.emptyAt(c.x, stand + up, c.z)) ops.push(op(0, up, 0, "air"));
    }
    if (ops.length === 0) continue;
    // `requireEmptyVoxel` is off and only here: the whole point of a treatment
    // is to *replace* the top course of a column somebody else decided. The
    // column rule stays on for a treatment that only paints and comes off for
    // one that flattens — flattening a field means taking down what stood in
    // it, and the tall-column test above is what keeps that honest.
    if (
      planter.place(
        "infra_area",
        ops,
        c.x,
        stand,
        c.z,
        { requireFreeColumn: !flattens, requireEmptyVoxel: false },
        false,
      )
    ) {
      placed++;
    } else skipped++;
  }
  return {
    nodePath: job.nodePath,
    entry: job.def.id,
    form: job.route.form,
    columns: placed,
    skipped,
    openings: 0,
    fittings: 0,
    declared,
  };
}

/**
 * Commit a flattening treatment's one level (§3.13, §9).
 *
 * **One** level, and the *median* of the ground it covers: a figure pressed
 * into a field is flat, and a median moves half the columns down and half up by
 * the least it can, which on a farm — where the parcels are already levelled
 * platforms — usually moves nothing at all. The alternatives are both worse: the
 * minimum digs a pit in sloping ground, and the maximum builds a plinth.
 */
function declareFlat(
  input: InfraEntryPassInput,
  world: LifeWorld,
  job: InfraEntryJob,
  columns: readonly CoursePoint[],
): number {
  const driver = input.ground;
  if (driver === undefined) return 0;
  const region = input.plan.region;
  const levels: number[] = [];
  const claims: GroundClaim[] = [];
  for (const c of columns) {
    if (!inside(region, c.x, c.z)) continue;
    const stand = world.standY(c.x, c.z);
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

/** The bounding span of an area's columns, for the stamp's own sizing. */
function extentOf(columns: readonly CoursePoint[]): { width: number; depth: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of columns) {
    if (c.x < x0) x0 = c.x;
    if (c.x > x1) x1 = c.x;
    if (c.z < z0) z0 = c.z;
    if (c.z > z1) z1 = c.z;
  }
  return columns.length === 0 ? { width: 0, depth: 0 } : { width: x1 - x0 + 1, depth: z1 - z0 + 1 };
}
