/**
 * The **retaining pass** — what stands between two levels of ground.
 *
 * `docs/COURTYARDS-AND-LEVELS-v0.md` §3.4. `layout/levels.ts` derives *where*
 * two platforms touch and how far apart they are; this builds the face.
 *
 * ## Where this runs, and why it is not negotiable
 *
 * **After the buildings, before the canals and the street surfacing** (§3.4,
 * §9.8). After the buildings, because a seam a building already stands on is
 * `treatment: "built"` — the building's own foundation skirt is the wall and
 * nothing else may be built there. Before the surfacing, because the surfacer
 * must see the finished ground and a wall must not be cut into by a street
 * drawn before it existed.
 *
 * A street on the seam is *not* one answer. A street that **crosses** a seam is
 * the connection between its two levels and a wall across it would be a wall
 * across a road, so the crossing stays open. A street that **runs along** one is
 * the thing the wall holds the ground above, and skipping it was the measured
 * 85%: see {@link RETAIN_FACE_SETBACK}.
 *
 * ## The wall is a sweep
 *
 * {@link RETAINING_PROFILE} is the fifth client of `SweptProfile`. The path
 * runs along the **lowest row of the upper platform**, so the datum `sweep()`
 * reads is the upper level; the `face` band is that row and the `verge` band is
 * one column back into the platform the wall holds. `thickenCourse` is called
 * on the face course, because a one-column course on a diagonal cannot be
 * 4-connected — a unit-width band along a 45° line spans ≈1.41 lattice columns
 * — and a sawtooth retaining wall is worse than none. It thickens **outward**,
 * into the low side, so the wall never eats the platform it holds.
 *
 * ## The furnish bar
 *
 * §2.3's furnish phase does *not* mean "after every ground write" — WP-A
 * measured that and the doc now says so: `streetscape.ts`'s `paveSidewalks`
 * runs after `surfaceStreetGraph` entirely and re-levels the whole sidewalk
 * band. The invariant a furnished thing actually needs is **"no later pass
 * re-levels a column the surfacer owns"**, and this pass clears it three ways
 * rather than assuming phase order does:
 *
 * - the wall stands on the platform's own outermost *free* column — outside the
 *   carriageway and outside the sidewalk band the streetscape re-levels, which
 *   is measured rather than assumed: letting a wall stand on a sidewalk column
 *   built 1,520 columns on the hill town and 183 unsupported balustrade posts
 *   with them, because `paveSidewalks` pulled the ground back out from under
 *   the coping. The sidewalk mask is a hard stop for that reason and no other;
 * - {@link RetainingPassResult.seam} is handed to `surfaceStreetGraph`, which
 *   passes it to `blendShoulders` — a seam is a face, not a bank, and smoothing
 *   it would undo the wall (§2.4);
 * - the coping course under the balustrade is emitted as a **structure block**
 *   as well as being written into the plan, so a rail can never be left over a
 *   column something later dropped.
 */

import { TERRAIN_DIAGNOSTICS, error, note, warning, type LoamDiagnostic } from "@terrainist/spec";
import type { Region } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import type { GroundClaim, GroundIntent } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import {
  BENCH_FACE,
  BENCH_TREAD,
  BUILT_SHARE,
  NO_PLATFORM,
  RETAIN_MAX,
  RETAIN_RAIL,
  MIN_RETAIN_RUN,
  WALL_DEMAND_RANGE,
  bankRun,
  benchedRun,
  treatmentForEdge,
  treatmentForSeam,
  type EdgeChoice,
  type EdgeContext,
  type EdgeUse,
  type GroundLevels,
  type LevelSeam,
  type SeamTreatment,
} from "../layout/levels.js";
import type { PlannedEdge } from "../layout/forms/types.js";
import type { Palette } from "../terrain/palette.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { PrismarineStack } from "../emit/prismarine.js";

import type { StructureBlock } from "./buildings.js";
import { RETAINING_PROFILE } from "./profiles.js";
import type { SweptProfile } from "./sweep.js";
import { index, inside } from "./roads.js";
import { sweep, sweptColumns, thickenCourse, type Vec2 } from "./sweep.js";

/**
 * Columns of clearance a wall keeps from the street network.
 *
 * Zero: the wall stands on the *platform's* own outermost column, which is
 * inside the block and therefore outside the sidewalk band `paveSidewalks`
 * re-levels — the same construction the stair rail uses to clear WP-A's bar.
 * A column a street actually claims is still skipped: there the street is the
 * connection between the two levels, not a wall across it.
 */
export const RETAIN_STREET_CLEARANCE = 0;

/**
 * How far back into the upper platform a wall may step to get off the street.
 *
 * **Measured, 2026-08-05, and this is the 85%.** On `stepped_hilltown` the
 * classifier called 2,489 seam columns `retaining` and the pass built 365. The
 * sink was one line: the face — the lowest row of the *upper* platform — is
 * carriageway for **2,274 of 2,713** columns, because `terraced`'s bench field
 * partitions the whole quarter, streets included, so a contour street runs
 * straight down the bench boundary. The face was skipped whole, and what was
 * left standing beside the street was the raw 2-to-4-block dirt face the walk
 * reported.
 *
 * "A column a street claims is skipped" is right for a street that **crosses**
 * a seam — there the street is the connection and a wall across it is a wall
 * across a road — and wrong for a street that **runs along** one, where the
 * uphill side of the carriageway is exactly where a hill town puts masonry.
 * The two are told apart by stepping: the walk-back runs perpendicular to the
 * seam, so a street along the seam is left after a few columns and the wall
 * lands at the back of the pavement, while a stair climbing *through* the seam
 * is street for the whole walk and the seam stays open there. No new
 * classification, no new mask — just how far you are allowed to walk.
 *
 * Twelve columns: wider than any carriageway plus its sidewalk dilation in the
 * catalog, narrow enough that a wall never detaches from the face it holds.
 */
export const RETAIN_FACE_SETBACK = 12;

/**
 * Share of a seam's face that has to be built over before the *seam* is built
 * over.
 *
 * A seam clipped at one end by a corner of a house is still a seam and still
 * wants its wall; a seam a terrace stands along the length of is that terrace's
 * foundation skirt, and a second wall in front of it is a second wall.
 */
export const RETAIN_BUILT_SHARE = 0.5;

/**
 * A quarter, as this pass reads one.
 *
 * Structurally a `DistrictProduct`, declared narrowly so the pass depends on
 * the fields it reads rather than on the whole fabric product — the same shape
 * `CanalDistrict` has and for the same reason.
 */
export interface RetainingDistrict {
  readonly nodePath: string;
  readonly bounds: Rect;
  /** 1 for a carriageway column, row-major over {@link bounds}. */
  readonly carriageway: Uint8Array;
  /** 1 for a sidewalk column, row-major over {@link bounds}. */
  readonly sidewalk: Uint8Array;
  /** The quarter's platforms; absent unless it declared or derived any. */
  readonly levels?: GroundLevels;
  /** The seams between them; absent unless the ground policy is `"stepped"`. */
  readonly seams?: readonly LevelSeam[];
  /**
   * The quarter is mostly natural slope with platforms cut into it, so the
   * **uphill** edge of a platform is a real face and nothing else finishes it
   * (`docs/SITE-PLAN-v0.md` §5.4). See {@link faceCuts}.
   */
  readonly naturalCuts?: boolean;
  /**
   * The transitions the site planner declared (`docs/SITE-PLAN-v0.md` §5.4).
   *
   * Its **presence** is the gate on the whole of §5 in this pass: the cut edges
   * are read from it rather than rediscovered, the fill edges this pass measures
   * are treated by context rather than by drop alone, banks past
   * {@link RETAIN_MAX} are benched rather than ramped, and `offPlatform` becomes
   * an error (§5.5). Absent for every quarter no planner drew, which is what
   * makes all four hillside-gated.
   */
  readonly plannedEdges?: readonly PlannedEdge[];
  /** Columns of masonry this quarter may spend (§5.2 rule 7). Unlimited if absent. */
  readonly wallBudget?: number;
}

/** Everything {@link buildRetainingWalls} reads. */
export interface RetainingPassInput {
  readonly districts: readonly RetainingDistrict[];
  /** Mutated exactly as the road pass mutates it — materials only, given a driver. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * A wall's course is a `face` plus a `preserve` (§3.3b) and a bank's rings are
   * a `verge` profile; both go through `commit`, and the masonry is laid against
   * the answer. Omitted only by callers that are not the pipeline — the unit
   * tests that wall a seam on a bare plan — which then get a driver of their own
   * over the plan as it stands (`driverForPlan`).
   */
  readonly ground?: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Footprints of everything already built, for the `"built"` reclassification. */
  readonly footprints?: readonly Rect[];
}

/** What the pass built. */
export interface RetainingPassResult {
  readonly blocks: readonly StructureBlock[];
  /**
   * 1 on every column this pass holds at a level, row-major over the region.
   *
   * Handed to the street surfacer so `blendShoulders` never smooths a face
   * (§2.4). Empty — all zeroes — for every quarter that declared no platforms.
   */
  readonly seam: Uint8Array;
  /** Seams a wall was built along. */
  readonly walls: number;
  /** Columns of wall face. */
  readonly wallColumns: number;
  /**
   * Columns of **parapet** — the continuous balustrade course {@link railRun}
   * stands on the stretches of wall the public can walk up to.
   *
   * Reported because the ratio to {@link wallColumns} is the measurement the
   * fortress-maze walk was about: a wall top is coping, and a parapet is the
   * exception. Every wall top railed is a battlement.
   */
  readonly railColumns: number;
  /** Seams of one block, treated as a kerb course. */
  readonly kerbs: number;
  /** Seams too tall for a wall, graded into a bank. */
  readonly banks: number;
  /** Seams a building already stood on. */
  readonly built: number;
  /**
   * Every seam column classified `retaining` that got no wall, by reason.
   *
   * A column dropped for a reason nobody counted is a column nobody can find,
   * and 85% of this quarter's seam length was exactly that. The keys are the
   * whole of the accounting: `faced + Σ unfaced === ` the classifier's total.
   *
   * **This is no longer the same thing as "left as raw dirt".** Every reason
   * here is a legitimate reason not to build a *wall*; none of them is a reason
   * to leave the ground the cut exposed. {@link finishCutFaces} is what happens
   * instead, at the end of the structure pass.
   */
  readonly unfaced: Readonly<Record<UnfacedReason, number>>;
  /** Columns of graded bank finished as earth rather than as bare substrate. */
  readonly banked: number;
  /**
   * **Edge columns by the treatment §5.2 chose for them**, over every edge a
   * site planner's quarter has: the fill edges this pass measures and the cut
   * edges the planner declared.
   *
   * The measurement WP-3 exists to make. `unfaced` answers *"why did this seam
   * get no wall"*, which was the right question while a wall was the only
   * answer; this answers *"what did this edge get"*, which is the question once
   * a bank, a building's own back and the hill's own rock are answers too. Empty
   * — all zeroes — for every quarter no planner drew.
   */
  readonly treated: Readonly<Record<SeamTreatment, number>>;
  /**
   * The same count over the **cut** edges the planner declared (§5.4), kept
   * apart from the fill edges because they are answered by different machinery:
   * a fill edge is walled, kerbed or banked by this pass, and a cut edge is
   * stated to be rock by {@link finishCutFaces}. Added together they are every
   * edge column of the quarter, which is the partition §5.4 requires.
   */
  readonly treatedCut: Readonly<Record<SeamTreatment, number>>;
  /**
   * Edges whose bank was **benched** rather than ramped: a face past
   * {@link RETAIN_MAX} answered as several short faces with {@link BENCH_TREAD}
   * columns of soil between, rather than as one 1:1 slope of earth.
   */
  readonly benchedBanks: number;
  /**
   * …and how many of those were benched because the **composite** ran past
   * {@link RETAIN_MAX} where the seam's own drop did not (see `facesOf`).
   *
   * Kept apart from {@link benchedBanks} because the two answer different
   * questions: that one counts faces the planner drew too tall, this one counts
   * faces nothing measured until they were about to be built.
   */
  readonly compositeBanks: number;
  /**
   * The **face profile** of every wall this pass built, as a histogram of
   * finished drop indexed `0…RETAIN_MAX`, index 0 unused.
   *
   * `docs/GROUND-CONTRACT-v0.md` §13.8's measurement. One entry per column of
   * the seam a wall was built along — the low side, which is where a face
   * shows — bucketed by `facesOf`'s answer for that column. Every bucket past
   * {@link RETAIN_MAX} is empty by construction: a face that would land there
   * is a benched bank, which is the whole of the composite conversion.
   */
  readonly facesByDrop: readonly number[];
  readonly diagnostics: readonly LoamDiagnostic[];
  /**
   * What this pass declared under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.3b): the intents it handed to the driver,
   * kept as a return value for the report and the tests. Three things are in it
   * and two are not:
   * the wall runs (`face` + `preserve`, at the coping's own walking level), and
   * `gradeBank`'s ring targets (`verge`). `kerbSeam` and `faceCuts` declare
   * **nothing** — they are materials, and the contract does not protect
   * materials.
   */
  readonly declaration: RetainingDeclaration;
}

/** The raw material of §3.3b's intents. */
export interface RetainingDeclaration {
  /** One entry per swept chain of one seam: the thickened, chained course. */
  readonly walls: readonly {
    readonly source: string;
    /** `retaining.seam` for a declared seam, `retaining.skirt` for a measured one. */
    readonly measured: boolean;
    readonly columns: readonly GroundClaim[];
  }[];
  /** One entry per bank: `gradeBank`'s ring targets, as a `verge` profile. */
  readonly banks: readonly {
    readonly source: string;
    readonly columns: readonly GroundClaim[];
  }[];
}

/** Why a seam column classified `retaining` ended up with no wall. */
export type UnfacedReason =
  | "building" // a building stands on the face; its own skirt is the wall
  | "street" // the street owns the face for {@link RETAIN_FACE_SETBACK} columns — it crosses
  | "water" // the face is in a channel
  | "shortRun" // the seam is shorter than `MIN_RETAIN_RUN`, graded as a bank
  | "tallDrop" // the seam drops past `RETAIN_MAX`, graded as a bank
  | "builtSeam" // most of the seam's face is under one building
  | "offPlatform" // the upper bench is narrower than the road that runs on it
  | "noFace"; // the seam's upper platform presents no column at all

const UNFACED_REASONS: readonly UnfacedReason[] = [
  "building",
  "street",
  "water",
  "shortRun",
  "tallDrop",
  "builtSeam",
  "offPlatform",
  "noFace",
];

/** The block states the pass writes. */
interface RetainingStates {
  readonly coping: number;
  readonly weep: number;
  /** The balustrade block, emitted by {@link railRun} rather than by a cap. */
  readonly rail: number;
  /** The masonry a wall's body is made of. */
  readonly revetment: number;
  /**
   * The hill's own rock — what an **unwalled** cut face is made of.
   *
   * Not `ground.revetment`: dressing every cut in the theme's masonry was what
   * made the whole hillside read as built stonework rather than as a town
   * standing on a hill. `ground.stone` is the terrain pass's own deep-subsurface
   * symbol — literally what `buildColumnPlan` writes under a cliff — so a cut
   * face and the cliff beside it are made of the same thing, which is the point.
   */
  readonly rock: number;
  /** Earth a graded bank is finished with. */
  readonly bank: number;
  /**
   * The profile's own band symbols, already fallen back to real block names.
   *
   * `sweep`'s `stateOf` resolves a palette symbol *or* a Minecraft block name,
   * and a dotted symbol the theme's palette does not carry resolves to neither
   * — `blockByName("street.curb")` is `undefined`, which is state 0, which is
   * **air**. Measured: it painted the top course of every wall in this quarter
   * with air, and the lint found it as four unsupported fence posts on the
   * platform behind. So the fallback happens here, where a fallback can be
   * written down, rather than inside the engine.
   *
   */
  readonly profile: SweptProfile;
}

/**
 * The ground roles this pass writes, as palette symbols.
 *
 * Every one is defined by `defineGroundRoles` before the first pass runs, and
 * every one carries the block name the pass used *before* the roles existed as
 * its fallback — so a caller that built a palette by hand (every unit test that
 * sweeps a wall on a bare plan) still gets masonry rather than air.
 */
const ROLE_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  "ground.coping": "minecraft:stone_bricks",
  "ground.revetment": "minecraft:stone",
  "ground.plinth": "minecraft:stone_bricks",
  "ground.balustrade": "minecraft:stone_brick_wall",
  "ground.weep": "minecraft:mossy_stone_bricks",
  "ground.stone": "minecraft:stone",
  "ground.bank": "minecraft:coarse_dirt",
  "ground.scree": "minecraft:gravel",
  "street.sidewalk": "minecraft:smooth_stone",
});

function resolveStates(palette: Palette, stack: PrismarineStack): RetainingStates {
  const fallback = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  /** A role's palette symbol when it has one, else a block name that exists. */
  const symbol = (role: string): string =>
    palette.has(role) ? role : (ROLE_FALLBACKS[role] ?? role);
  const state = (role: string): number =>
    palette.has(role) ? palette.state(role) : fallback(ROLE_FALLBACKS[role] ?? role);
  const profile: SweptProfile = {
    ...RETAINING_PROFILE,
    bands: RETAINING_PROFILE.bands.map((band) => ({
      ...band,
      surface: symbol(band.surface),
      ...(band.fill === undefined ? {} : { fill: symbol(band.fill) }),
    })),
  };
  return {
    profile,
    coping: state("ground.coping"),
    revetment: state("ground.revetment"),
    rock: state("ground.stone"),
    bank: state("ground.bank"),
    // What makes a retaining wall read as *old* rather than as a slab, and it
    // is one block every nine columns.
    weep: state("ground.weep"),
    rail: state("ground.balustrade"),
  };
}

/**
 * Build every seam every quarter derived.
 *
 * Returns untouched — no blocks, an all-zero seam mask — when no quarter
 * declared platforms, which is every document written before this phase. That
 * is the same shape `digCanals` has and it is what makes §6.7 hold.
 */
export function buildRetainingWalls(input: RetainingPassInput): RetainingPassResult {
  const { plan, palette, stack } = input;
  const driver = input.ground ?? driverForPlan(plan);
  const region = plan.region;
  const cells = region.width * region.depth;
  const seam = new Uint8Array(cells);
  const blocks: StructureBlock[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  let walls = 0;
  let wallColumns = 0;
  let railColumns = 0;
  let kerbs = 0;
  let banks = 0;
  let built = 0;
  let banked = 0;
  let benchedBanks = 0;
  let compositeBanks = 0;
  const facesByDrop = new Array<number>(RETAIN_MAX + 1).fill(0);
  const treated: Record<SeamTreatment, number> = {
    kerb: 0,
    retaining: 0,
    bank: 0,
    built: 0,
    rock: 0,
  };
  const treatedCut: Record<SeamTreatment, number> = {
    kerb: 0,
    retaining: 0,
    bank: 0,
    built: 0,
    rock: 0,
  };
  const declaredWalls: RetainingDeclaration["walls"][number][] = [];
  const declaredBanks: RetainingDeclaration["banks"][number][] = [];
  const unfaced: Record<UnfacedReason, number> = {
    building: 0,
    street: 0,
    water: 0,
    shortRun: 0,
    tallDrop: 0,
    builtSeam: 0,
    offPlatform: 0,
    noFace: 0,
  };

  const relevant = input.districts.filter((d) => d.levels !== undefined);
  if (relevant.length === 0) {
    return {
      blocks,
      seam,
      walls,
      wallColumns,
      railColumns,
      kerbs,
      banks,
      built,
      banked,
      treated,
      treatedCut,
      benchedBanks,
      compositeBanks,
      facesByDrop,
      unfaced,
      diagnostics,
      declaration: { walls: [], banks: [] },
    };
  }
  const states = resolveStates(palette, stack);

  // Everything already standing. A seam most of whose face is under a building
  // is that building's foundation skirt, and a wall in front of it is a wall in
  // front of a wall.
  const occupied = occupancyOf(region, input.footprints);

  for (const district of relevant) {
    const levels = district.levels as GroundLevels;
    // §5's gate, and it is one field: a quarter a site planner drew declares its
    // cut edges, and nothing else in the compiler does.
    const planned = district.plannedEdges !== undefined;
    // §5.2 rule 7's ration, spent in the order the edges are seen.
    let budget = district.wallBudget ?? Number.POSITIVE_INFINITY;
    // The cut edges, as declared. Nothing is built on them — see
    // `finishCutFaces`, which states what they are made of — but they are edges
    // of this quarter and §5.4 requires the treatments to partition every edge
    // column, so they are counted here where the count lives.
    for (const edge of district.plannedEdges ?? []) {
      (edge.side === "cut" ? treatedCut : treated)[edge.treatment] += edge.cells.length;
    }

    // The street network of this quarter, dilated by the clearance. A wall the
    // streetscape would re-level is not a wall, it is 75 floating blocks — the
    // measurement WP-A made and the reason this ring exists.
    const street = streetMaskOf(region, district);

    const jobs: {
      readonly seam: LevelSeam;
      readonly floorY: number;
      /** A skirt is *measured* from the finished ground; a seam is declared. */
      readonly measured: boolean;
    }[] = [];
    for (const record of district.seams ?? []) {
      jobs.push({ seam: record, floorY: levels.levelY[record.below] as number, measured: false });
    }
    // **The skirt of a platform** — the other half of §3.4, and the half a
    // platform-to-platform seam cannot express. A block's platform is bounded
    // by its street, and a street is not a platform, so two blocks a storey
    // apart are never 4-adjacent and `levelSeams` finds nothing between them.
    // What is actually there is a cut face at the block's own edge: the pad
    // holds the block at its storey and the ground beside it is the street's.
    // That face is where a hill town's walls are — "the block across the street
    // is a storey down, and you see the wall that makes it so" (§4.6) — so it
    // is derived here, from the platform field and the finished ground, rather
    // than left as a bank of raw dirt.
    jobs.push(...skirtSeams(region, plan, levels).map((j) => ({ ...j, measured: true })));

    for (const [jobIndex, { seam: record, floorY, measured }] of jobs.entries()) {
      // **§5.2, and the whole of WP-3.** On a quarter no planner drew the
      // treatment is the one `levelSeams` derived from drop and run, exactly as
      // before; on a planned one it is chosen from everything the edge knows —
      // the room beyond it, what is pressing on it, what the terrace has left
      // once the treatment is paid for, and what the district can still afford
      // in masonry. `"replan"` reaches here as a benched bank: the planner
      // settled eight passes upstream and its ladder ran on the composition, so
      // what is left is to put something on the face that is not a cliff.
      const context = planned
        ? edgeContextOf(region, plan, levels, record, street, occupied, budget)
        : null;
      const wanted = context === null ? record.treatment : treatmentForEdge(context);
      // **The composite, measured before it is built** — see {@link facesOf}.
      // Every rule above reads the seam's one `drop`, and on a skirt that number
      // is the component's median: the columns below it get the same wall, at
      // the same level, standing on a deeper floor. So the face is measured
      // column by column and asked the question rule 5 asks — is this taller
      // than any wall we build — of the finished face rather than of the
      // summary. `composite` is the answer's evidence and it is reported.
      //
      // It is asked of a wall only. A bank, a kerb, a building's own back and
      // the hill's own rock all answer a tall face honestly already; it is
      // masonry that must not exceed the one ceiling masonry has.
      const faces = wanted === "retaining" ? facesOf(region, plan, levels, record) : [];
      const composite = wanted === "retaining" ? overCeilingRun(region, record, faces) : 0;
      const overCeiling = composite >= MIN_RETAIN_RUN;
      const answer: EdgeChoice = overCeiling ? "replan" : wanted;
      const treatment: SeamTreatment = answer === "replan" ? "bank" : answer;
      // A face past the tallest wall we build is banked in **benches** rather
      // than ramped 1:1 — §5.2 rule 5's honest downstream answer, and the reason
      // the walked town had sheer platform-to-platform dropoffs mid-town. A
      // composite past the ceiling is the same face by a different arithmetic
      // and gets the same answer.
      const bench = (context !== null && record.drop > RETAIN_MAX) || overCeiling;
      // The drop the benches have to get down, which for a composite is **not**
      // `record.drop`: benching a seven-block face in six blocks' worth of
      // benches leaves the last block as a step the bench never reaches.
      const benchDrop = overCeiling ? Math.max(record.drop, ...faces) : record.drop;
      if (overCeiling) compositeBanks++;
      if (context !== null) treated[treatment] += record.cells.length;
      if (treatment === "kerb") {
        kerbs += kerbSeam(region, plan, record, states, street, occupied) > 0 ? 1 : 0;
        continue;
      }
      if (treatment === "rock") {
        // The uphill answer, reached on a fill edge only when the planner asked
        // for it. Nothing is built and no level moves; `finishCutFaces` states
        // what the face is made of.
        continue;
      }
      if (treatment === "built") {
        built++;
        unfaced.builtSeam += record.cells.length;
        continue;
      }
      if (treatment === "bank") {
        banks++;
        if (bench) benchedBanks++;
        const ringTargets: GroundClaim[] = [];
        banked += gradeBank(
          region,
          plan,
          driver,
          `${district.nodePath}#bank@${jobIndex}`,
          levels,
          record,
          floorY,
          street,
          occupied,
          states,
          ringTargets,
          bench,
          benchDrop,
        );
        if (ringTargets.length > 0) {
          declaredBanks.push({
            source: `${district.nodePath}#bank@${jobIndex}`,
            columns: ringTargets,
          });
        }
        const short = record.cells.length < MIN_RETAIN_RUN;
        // On a planned quarter a bank is a **treatment**, counted in `treated`,
        // and not a wall that failed: `unfaced` answers "why no wall" and the
        // answer here is "because a bank is what this edge wanted".
        if (context === null) unfaced[short ? "shortRun" : "tallDrop"] += record.cells.length;
        diagnostics.push(
          warning(
            "RETAINING_REFUSED",
            district.nodePath,
            short
              ? `a seam in "${district.nodePath}" drops ${record.drop} blocks over only ${record.cells.length} column(s), shorter than the ${MIN_RETAIN_RUN} columns a wall needs to read as a wall rather than as a stub, so the two platforms were graded into each other as a bank`
              : bench
                ? `a seam in "${district.nodePath}" drops ${record.drop} blocks over ${record.cells.length} column(s)` +
                  (overCeiling
                    ? ` — a drop a wall is built for, but the face it would have presented falls up to ${benchDrop} block(s) over a run of ${composite} column(s), which is`
                    : `,`) +
                  ` past the ${RETAIN_MAX_TEXT} a retaining wall is built for, so it was cut back as a benched bank — ${Math.ceil(benchDrop / BENCH_FACE)} face(s) of ${BENCH_FACE} block(s) with ${BENCH_TREAD} column(s) of soil between, over ${benchedRun(benchDrop)} column(s) of run`
                : `a seam in "${district.nodePath}" drops ${record.drop} blocks over ${record.cells.length} column(s), past the ${RETAIN_MAX_TEXT} a retaining wall is built for, so the two platforms were graded into each other as a bank`,
            "Raise the quarter's density so the blocks are smaller and each one steps less, or leave it: a bank is a bank, not an unbuilt cliff.",
          ),
        );
        continue;
      }
      // §5.2 rule 9 was reached, so this edge spends from the quarter's masonry
      // ration. Charged on the seam's own length before the face is walked,
      // because the ration has to be decided in the same order the edges are
      // seen or it is not a ration.
      if (context !== null) budget -= record.cells.length;

      // --- a wall ---------------------------------------------------------
      // The face is the lowest row of the *upper* platform: the seam's own
      // cells are the low side, and a wall standing on them would eat the
      // platform below instead of holding the one above.
      const face: number[] = [];
      const chosen = new Uint8Array(cells);
      const inFace = new Uint8Array(cells);
      let blockedByBuilding = 0;
      const reasons: Record<UnfacedReason, number> = {
        building: 0,
        street: 0,
        water: 0,
        shortRun: 0,
        tallDrop: 0,
        builtSeam: 0,
        offPlatform: 0,
        noFace: 0,
      };
      for (const point of record.cells) {
        for (const [dx, dz] of NEIGHBOURS) {
          const x = point.x + dx;
          const z = point.z + dz;
          if (!inside(region, x, z)) continue;
          if (levels.at(x, z) !== record.above) continue;
          const k = index(region, x, z);
          if (inFace[k] === 1) continue;
          inFace[k] = 1;
          // Walk back into the platform until the ground is the platform's own
          // rather than the street's: one column for a free face; a handful for
          // a street running *along* the seam, which puts the wall at the back
          // of the pavement; nothing within the setback for a street *crossing*
          // it, which is a seam that stays open because there the street is the
          // connection, not a thing to wall off.
          const found = walkBack(
            region,
            x,
            z,
            dx,
            dz,
            levels,
            record.above,
            street,
            occupied,
            plan,
          );
          const landed = found.column;
          const why = found.why;
          if (landed < 0) {
            if (why === "building") blockedByBuilding++;
            reasons[why]++;
            continue;
          }
          if (chosen[landed] === 1) continue;
          chosen[landed] = 1;
          face.push(landed);
        }
      }
      let total = 0;
      for (let k = 0; k < cells; k++) total += inFace[k] === 1 ? 1 : 0;
      if (total === 0) {
        unfaced.noFace += record.cells.length;
        continue;
      }
      if (blockedByBuilding >= total * RETAIN_BUILT_SHARE) {
        built++;
        unfaced.builtSeam += record.cells.length;
        continue;
      }
      // The report is in *seam* columns and `reasons` counts *upper-platform*
      // ones, so each reason is scaled by the seam's own length over its face's.
      for (const reason of UNFACED_REASONS) {
        const n = reasons[reason];
        if (n > 0) unfaced[reason] += Math.round((n * record.cells.length) / total);
      }
      if (face.length === 0) continue;

      // A one-column course on a diagonal is a sawtooth. Thicken outward —
      // into the low side, never into the platform the wall holds.
      const course = new Uint8Array(cells);
      for (const k of face) course[k] = 1;
      // A one-column course on a diagonal is a sawtooth. The course may now sit
      // a few columns inside the platform (the setback above), so "thicken
      // outward, never into the platform" is no longer the test that keeps a
      // wall off ground it does not own — free ground is, and free ground is
      // exactly what the setback walk already looked for.
      thickenCourse(
        region,
        course,
        (idx) =>
          occupied[idx] !== 1 && street[idx] !== 1 && plan.fluidKind[idx] === FluidKind.NONE,
        (idx) => cells - idx,
      );
      const columns: number[] = [];
      for (let k = 0; k < cells; k++) if (course[k] === 1) columns.push(k);

      // What the sweep may write, as an inverted occupancy grid: the face
      // course and the platform the wall holds, and nothing else. The engine
      // clamps a column's lane into the profile's span, so a column half a
      // block off the negative edge of an asymmetric profile lands on band 0
      // and is written as face — which on a seam means one column of the
      // platform *below* raised to the platform above, held by nothing once a
      // later pass pulls its own ground back down. That is not a wall, it is
      // four floating fence posts, measured. So the sweep is told what it owns.
      const avoid = new Uint8Array(cells).fill(1);
      for (let k = 0; k < cells; k++) {
        if (course[k] === 1) avoid[k] = 0;
        else if (
          levels.at(region.x0 + (k % region.width), region.z0 + Math.floor(k / region.width)) ===
          record.above
        ) {
          avoid[k] = occupied[k] === 1 || street[k] === 1 ? 1 : 0;
        }
      }

      let anySwept = false;
      let chainIndex = -1;
      for (const chain of chainsOf(region, columns)) {
        chainIndex++;
        const path = orient(region, chain, levels, record.above, street, occupied);
        // §3.3b — the course is a `face` at the coping's own walking level, plus
        // a `preserve` over the same columns: a balustrade may never be left
        // standing over ground something else dropped, which is the
        // `unsupported.chain` finding that survived four rounds of fixes. Both
        // go in one commit, because the resolver has to see them together.
        // `transition: "wall"` — the face *is* the transition.
        const source = `${district.nodePath}#retaining@${jobIndex}/${chainIndex}`;
        const sourceClass = measured ? ("retaining.skirt" as const) : ("retaining.seam" as const);
        const result = sweep({
          profile: states.profile,
          path,
          plan,
          palette,
          stack,
          nodePath: district.nodePath,
          avoid: { region, mask: avoid, byTag: new Map<string, Uint8Array>() },
          declare: {
            sourceClass,
            kind: "face",
            source,
            transition: "wall",
            commit: (intent) => {
              const wall: GroundIntent[] = [intent];
              if ([...intent.columns].length > 0) {
                wall.push({
                  source,
                  sourceClass,
                  kind: "preserve",
                  columns: intent.columns,
                  transition: "none",
                });
              }
              driver.commit(wall);
            },
          },
        });
        blocks.push(...result.blocks);
        // `SWEEP_FEATURES_PLACED` is a note about lamps on a bridge; a weep
        // hole is not news, and one per nine columns of every wall in a hill
        // town is a report nobody reads.
        for (const d of result.diagnostics) {
          // Both of these are expected here rather than newsworthy: a weep
          // hole every nine columns is not a report, and a column the sweep
          // was told it does not own is the mechanism above working.
          if (d.code === TERRAIN_DIAGNOSTICS.SWEEP_FEATURES_PLACED) continue;
          if (d.code === TERRAIN_DIAGNOSTICS.SWEEP_COLUMNS_SKIPPED) continue;
          diagnostics.push(d);
        }
        // The seam mask is the *claimed* course — including a spanned column the
        // sweep deliberately left alone — because what it protects is geometry:
        // `blendShoulders` may not smooth a face, whether or not the face's own
        // column carried a level. The declaration is the levelled half, which is
        // what the sweep handed the driver.
        for (let k = 0; k < cells; k++) if (result.claimed[k] === 1) seam[k] = 1;
        const wallColumnsDeclared = [...((result.intent?.columns ?? []) as Iterable<GroundClaim>)];
        if (wallColumnsDeclared.length > 0) {
          declaredWalls.push({ source, measured, columns: wallColumnsDeclared });
        }
        // **The foot, declared** — the other half of the composite, and the half
        // no measurement taken in this pass can see.
        //
        // The face this pass builds is `top − foot`, and it chose to build it
        // because both halves of that subtraction were what they were when it
        // ran. `top` is then held by the wall's own `preserve`; the **foot was
        // held by nothing**, and four passes downstream move ground. Measured on
        // the steep fixture (2026-08-07): a prop levelled its pad four blocks
        // into the hillside directly under a five-block wall and left a
        // nine-block sheer face, and the road's shoulder blend took another one
        // down by a block. Neither pass did anything wrong by its own lights —
        // nobody had said the ground there was spoken for.
        //
        // So it is said, at the level the wall was built for and never at a new
        // one: the claim proposes the ground that is already there, so on its
        // own it moves nothing and cannot move anything (§5.3 — a claim that
        // agrees with the ground is satisfied in silence). What it does is give
        // the `preserve` beside it something to guard, because §5.2 lets a
        // source preserve only columns its own level claim won. Rank does the
        // rest: `retaining.seam`/`retaining.skirt` are tier B, and every pass
        // that cut a foot here — street, road, sweep, doorstep, prop, verge — is
        // tier C or D.
        const foot: GroundClaim[] = [];
        const footSeen = new Uint8Array(cells);
        for (let k = 0; k < cells; k++) {
          if (result.claimed[k] !== 1) continue;
          const x = region.x0 + (k % region.width);
          const z = region.z0 + Math.floor(k / region.width);
          for (const [dx, dz] of NEIGHBOURS) {
            if (!inside(region, x + dx, z + dz)) continue;
            const n = index(region, x + dx, z + dz);
            if (footSeen[n] === 1 || result.claimed[n] === 1) continue;
            // Only the low side: the platform the wall holds is the wall's own
            // ground and is already declared, and a column no lower than the
            // course is not a foot.
            if (levels.at(x + dx, z + dz) === record.above) continue;
            // Water is nobody's floor, and a building's ground is the
            // building's — §3.4's own rule, and the two classes that outrank
            // this one anyway, so claiming them would be claiming a column the
            // resolver would hand straight back.
            if (plan.fluidKind[n] !== FluidKind.NONE) continue;
            if (occupied[n] === 1) continue;
            if ((plan.ground[n] as number) >= (plan.ground[k] as number)) continue;
            footSeen[n] = 1;
            foot.push({ idx: n, y: plan.ground[n] as number });
          }
        }
        if (foot.length > 0) {
          const footSource = `${source}/foot`;
          driver.commit([
            { source: footSource, sourceClass, kind: "profile", columns: foot, transition: "none" },
            { source: footSource, sourceClass, kind: "preserve", columns: foot, transition: "none" },
          ]);
        }
        // **The wall is as deep as it is tall.** `sweep()` writes one course of
        // the `fill` band and leaves `soil` alone, so a six-block wall used to
        // be one course of masonry over five of whatever the hill is made of —
        // `minecraft:stone`, because the old fill symbol was literally
        // `ground.stone`. That is the "carved out of one monolith" reading in a
        // single line. Deepening the soil band to the drop is what turns it
        // into a wall somebody built.
        for (const cell of path) {
          const k = index(region, cell.x, cell.z);
          if (result.claimed[k] !== 1) continue;
          deepen(plan, k, record.drop);
        }
        // The coping, as a structure block as well as a plan column: a rail may
        // never be left standing over ground a later pass dropped.
        for (const cell of path) {
          const k = index(region, cell.x, cell.z);
          if (result.claimed[k] !== 1) continue;
          blocks.push({ x: cell.x, y: plan.ground[k] as number, z: cell.z, stateId: states.coping });
          wallColumns++;
          anySwept = true;
        }
        // The parapet, where there is anybody to keep off the drop. Emitted
        // here rather than as a profile cap, and along the chain rather than
        // over the band's raster, for the reason written up on
        // `RETAINING_PROFILE`: a cap on a contour is a row of disconnected
        // posts, which is a battlement.
        railColumns += railRun(
          region,
          plan,
          path,
          result.claimed,
          levels,
          record.above,
          record.drop,
          street,
          states,
          blocks,
        );
        // The weep courses, one below the coping so they read from the low side
        // rather than being buried under the walk on top.
        for (const feature of result.features) {
          if (feature.id !== "weep") continue;
          const y = feature.at.y - 2;
          if (!inside(region, feature.at.x, feature.at.z)) continue;
          const k = index(region, feature.at.x, feature.at.z);
          if (result.claimed[k] !== 1) continue;
          if (y <= (plan.ground[k] as number) - record.drop) continue;
          blocks.push({ x: feature.at.x, y, z: feature.at.z, stateId: states.weep });
        }
      }
      if (anySwept) {
        walls++;
        // **The distribution §13.8 asked for, and the number the walk needs.**
        // A single-seam wall at drop 5 or 6 with no bench is sanctioned by rule
        // 9 on purpose, and whether it should get a mid-bench is an aesthetic
        // call nobody can make from a compiler. What a compiler *can* do is say
        // how many there are: every column of face this pass actually built,
        // bucketed by the finished drop it presents. Clamped into 1…RETAIN_MAX
        // because the composite conversion above is what guarantees the bucket
        // exists — a column past the ceiling is a bank now, not a wall.
        for (const face of faces) {
          const bucket = face < 1 ? 1 : face > RETAIN_MAX ? RETAIN_MAX : face;
          facesByDrop[bucket] = (facesByDrop[bucket] as number) + 1;
        }
      }
    }

    // --- the finish ---------------------------------------------------------
    // Moved out. Everything above decides where a *wall* goes; deciding what
    // the rest of the cut is made of is {@link finishCutFaces}, and it runs at
    // the end of the structure pass rather than here, because the ground this
    // one sees is not the ground the emitter lays — see that function's own
    // doc comment for the measurement.
  }

  // §5.5 — `offPlatform` becomes an error on a quarter a planner drew.
  //
  // Not counted and survived, as it is today: §3.4 rule 2 refuses to claim a
  // station that cannot hold its street and one column of standing room, so
  // there is no ground on which this can legitimately happen and a non-zero
  // count is a compiler bug. It is raised as one because the guarantee is
  // checkable — the lesson `docs/DESIGN.md` records about a physics lint that
  // passed 395 columns of a planning failure green.
  if (relevant.some((d) => d.plannedEdges !== undefined) && unfaced.offPlatform > 0) {
    diagnostics.push(
      error(
        "SITE_PLAN_FAILED",
        relevant.find((d) => d.plannedEdges !== undefined)?.nodePath ?? "world",
        `the site planner drew a quarter whose retaining pass then found ${unfaced.offPlatform} seam column(s) with no platform to stand a wall on: the upper terrace is narrower there than the road running on it, which "docs/SITE-PLAN-v0.md" §3.4 rule 2 refuses to plan and §5.5 makes an error rather than a number`,
        "Nothing in the document can cause this — it is a compiler bug in the site planner's claim rule. File it with the quarter's node path and its seed.",
      ),
    );
  }

  const unfacedTotal = UNFACED_REASONS.reduce((sum, r) => sum + unfaced[r], 0);
  if (walls + kerbs + banks + built > 0) {
    const breakdown = UNFACED_REASONS.filter((r) => unfaced[r] > 0)
      .map((r) => `${unfaced[r]} ${r}`)
      .join(", ");
    diagnostics.push(
      note(
        "SWEEP_FEATURES_PLACED",
        relevant[0]?.nodePath ?? "world",
        `multi-level ground: ${walls} retaining wall(s) over ${wallColumns} column(s) (${railColumns} parapeted), ${kerbs} kerb seam(s), ${banks} bank(s), and ${built} seam(s) a building already stood on` +
          (breakdown === "" ? "" : `; ${unfacedTotal} seam column(s) got no wall (${breakdown})`) +
          `; ${banked} column(s) graded as bank`,
        "No action needed.",
      ),
    );
  }

  const tally = (of: Record<SeamTreatment, number>): { total: number; breakdown: string } => {
    const keys = (Object.keys(of) as SeamTreatment[]).sort();
    return {
      total: keys.reduce((sum, t) => sum + of[t], 0),
      breakdown: keys
        .filter((t) => of[t] > 0)
        .map((t) => `${of[t]} ${t}`)
        .join(", "),
    };
  };
  const fill = tally(treated);
  const cut = tally(treatedCut);
  if (fill.total + cut.total > 0) {
    diagnostics.push(
      note(
        "SWEEP_FEATURES_PLACED",
        relevant.find((d) => d.plannedEdges !== undefined)?.nodePath ?? "world",
        `transitions by context (§5): ${fill.total + cut.total} planned edge column(s) — ` +
          `fill ${fill.total} (${fill.breakdown === "" ? "none" : fill.breakdown}), ` +
          `cut ${cut.total} (${cut.breakdown === "" ? "none" : cut.breakdown})` +
          (benchedBanks === 0 ? "" : `; ${benchedBanks} bank(s) benched rather than ramped`) +
          (compositeBanks === 0
            ? ""
            : `, ${compositeBanks} of them because the face they would have presented ran past ${RETAIN_MAX_TEXT} where the seam's own drop did not`),
        "No action needed.",
      ),
    );
  }

  // **Built faces by finished drop** — `docs/GROUND-CONTRACT-v0.md` §13.8's
  // measurement, taken on the world rather than argued from the constants.
  // Every column of masonry face this pass built, bucketed by how far it
  // actually falls, so the question the composite conversion deliberately does
  // *not* answer — should a sanctioned five- or six-block wall get a mid-bench —
  // is a decision somebody can make from numbers after a walk.
  const facedColumns = facesByDrop.reduce((sum, n) => sum + n, 0);
  if (facedColumns > 0) {
    diagnostics.push(
      note(
        "SWEEP_FEATURES_PLACED",
        relevant[0]?.nodePath ?? "world",
        `built faces by finished drop (§13.8): ${facedColumns} face column(s) along the seams a wall was built on — ` +
          facesByDrop
            .map((n, drop) => [n, drop] as const)
            .filter(([n, drop]) => drop > 0 && n > 0)
            .map(([n, drop]) => `${n} at ${drop}`)
            .join(", "),
        "No action needed.",
      ),
    );
  }

  return {
    blocks,
    seam,
    walls,
    wallColumns,
    railColumns,
    kerbs,
    banks,
    built,
    banked,
    treated,
    treatedCut,
    benchedBanks,
    compositeBanks,
    facesByDrop,
    unfaced,
    diagnostics,
    declaration: { walls: declaredWalls, banks: declaredBanks },
  };
}

/* -------------------------------------------------------------------------- */
/* the cut-face finish, as its own late pass                                  */
/* -------------------------------------------------------------------------- */

/** Everything already standing, as a column mask. */
function occupancyOf(region: Region, footprints: readonly Rect[] | undefined): Uint8Array {
  const occupied = new Uint8Array(region.width * region.depth);
  for (const rect of footprints ?? []) {
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        if (inside(region, x, z)) occupied[index(region, x, z)] = 1;
      }
    }
  }
  return occupied;
}

/** A quarter's carriageway and sidewalk, dilated by {@link RETAIN_STREET_CLEARANCE}. */
function streetMaskOf(region: Region, district: RetainingDistrict): Uint8Array {
  const bounds = district.bounds;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const street = new Uint8Array(region.width * region.depth);
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      if (district.carriageway[k] !== 1 && district.sidewalk[k] !== 1) continue;
      for (let dj = -RETAIN_STREET_CLEARANCE; dj <= RETAIN_STREET_CLEARANCE; dj++) {
        for (let di = -RETAIN_STREET_CLEARANCE; di <= RETAIN_STREET_CLEARANCE; di++) {
          const x = bounds.x0 + i + di;
          const z = bounds.z0 + j + dj;
          if (inside(region, x, z)) street[index(region, x, z)] = 1;
        }
      }
    }
  }
  return street;
}

/** Everything {@link finishCutFaces} reads. */
export interface CutFaceFinishInput {
  readonly districts: readonly RetainingDistrict[];
  /** Mutated — **materials only**: `subsurface` and `soil`, never a level. */
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Footprints of everything built, so the finish never thickens under a house. */
  readonly footprints?: readonly Rect[];
  /**
   * {@link RetainingPassResult.seam} — the columns a wall's masonry stands on.
   *
   * Protected: a column a wall holds already has the wall's material and wants
   * only the depth, so the finish deepens it and leaves its subsurface alone.
   * Omitted (all zeroes) by callers with no wall pass in front of them.
   */
  readonly seam?: Uint8Array;
}

/** What the finish did. */
export interface CutFaceFinishResult {
  /**
   * Columns of **cut-face course** — the contour a cut leaves that no wall
   * stands on, faced in the hill's own rock.
   *
   * The answer to the second half of the retaining-wall walk: *"raw dirt faces
   * jut out underneath stone slabs in arbitrary patches."* A platform edge
   * nobody could wall was left showing the soil band the terrain pass gave it.
   *
   * Counted per column of the finished course, which is more than the columns
   * that answer the drop test on their own: {@link faceCuts} bridges the
   * one-column gaps in the contour and thickens it across the diagonal, because
   * a contour on a lattice is a staircase and a staircase of single blocks is
   * the artifact rather than the fix.
   */
  readonly revetted: number;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Finish every cut face in the town — **the last pass that touches the ground.**
 *
 * ## Why it is not part of `buildRetainingWalls`
 *
 * It used to be, and that was the bug behind the hillside walk's second
 * photograph: a street ending at a sheer drop, with a band of raw dirt showing
 * mid-face under the coping. `buildRetainingWalls` runs early — before the
 * canals, before the street surfacing, before the roads, the props and the
 * doorsteps — because a *wall* must exist before a street is graded over the
 * seam it holds. But four later passes still **cut fresh ground**:
 * `dressStreetStairs` drops each tread to `level − 1`, `buildDoorsteps` cuts a
 * landing outside every threshold, the road pass cuts its lanes and blends
 * their shoulders, and `buildProps` levels a plinth. Every one of those makes
 * an exposed face the finish never saw, and an unfinished face shows the soil
 * band — dirt.
 *
 * So the finish runs here instead, after the last pass that writes a level.
 *
 * ## Why moving it is safe under the ground contract
 *
 * This pass writes **materials only** — `plan.subsurface` and `plan.soil` — and
 * never a level or a surface. The ground contract protects *levels*, and its
 * ordering rules are about who commits which level when; materials are plain
 * last-write-wins over the column plan, so a materials-only pass may sit
 * anywhere in the order its inputs allow. Its inputs are the finished ground,
 * which is exactly what it now gets. `faceCuts` declares nothing to the driver,
 * before the move and after it.
 */
export function finishCutFaces(input: CutFaceFinishInput): CutFaceFinishResult {
  const { plan, palette, stack } = input;
  const region = plan.region;
  const relevant = input.districts.filter((d) => d.levels !== undefined);
  if (relevant.length === 0) return { revetted: 0, diagnostics: [] };

  const states = resolveStates(palette, stack);
  const occupied = occupancyOf(region, input.footprints);
  const seam = input.seam ?? new Uint8Array(region.width * region.depth);

  let revetted = 0;
  let declared = 0;
  /**
   * Declared cut columns whose treatment reached §5.2 rule 9 — masonry against
   * an **uphill** face — and were finished as rock instead.
   *
   * Named rather than swallowed. Building there needs the wall sweep to accept a
   * face whose upper side is natural ground: no platform index, no declared
   * level, no `LevelSeam` to hand it. That is a piece of work of its own and
   * §5.4's WP-3 amendment defers it by name; this is the number that says how
   * much of the town is waiting on it.
   */
  let deferred = 0;
  for (const district of relevant) {
    // **The planner's declaration, where there is one** (§5.4). Before WP-3 the
    // ring of natural columns standing above a platform was rediscovered here;
    // now a planned quarter states it, edge by edge, with a treatment on each,
    // and this pass finishes exactly the columns whose treatment is the hill's
    // own rock. A cut edge a building's back stands on is not painted, because
    // there is a building there. The two derivations agreed on the ratified
    // fixtures — which is the point of replacing one with the other rather than
    // keeping both.
    let ring: Uint8Array | undefined;
    if (district.plannedEdges !== undefined) {
      ring = new Uint8Array(region.width * region.depth);
      for (const edge of district.plannedEdges) {
        if (edge.side !== "cut") continue;
        // 1 declares the column, 2 withdraws it: a cut edge a lot's own back
        // wall stands on is that building's foundation skirt (§4.3) and nothing
        // else is painted there.
        const value = edge.treatment === "built" ? 2 : 1;
        if (value === 1) declared += edge.cells.length;
        if (edge.treatment === "retaining") deferred += edge.cells.length;
        for (const cell of edge.cells) {
          if (inside(region, cell.x, cell.z)) ring[index(region, cell.x, cell.z)] = value;
        }
      }
    }
    revetted += faceCuts(
      region,
      plan,
      district.levels as GroundLevels,
      states,
      seam,
      streetMaskOf(region, district),
      occupied,
      district.naturalCuts === true,
      ring,
    );
  }

  const diagnostics: LoamDiagnostic[] =
    revetted === 0
      ? []
      : [
          note(
            "SWEEP_FEATURES_PLACED",
            relevant[0]?.nodePath ?? "world",
            `every cut face finished: ${revetted} column(s) faced in the hill's own rock` +
              (declared === 0 ? "" : `, of which ${declared} were declared cut edges (§5.4)`) +
              (deferred === 0
                ? ""
                : `; ${deferred} of those wanted masonry (§5.2 rule 9) and got rock — an uphill wall is v1`),
            "No action needed.",
          ),
        ];
  return { revetted, diagnostics };
}

/* -------------------------------------------------------------------------- */
/* the parapet                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Columns from a wall's coping to the nearest public ground that still counts
 * as "somebody can walk up to this drop".
 *
 * Three: the width of the sidewalk band plus the column the wall stands on. A
 * wall at the back of a pavement gets a parapet; a wall at the bottom of
 * somebody's garden, or holding a bench nothing reaches, does not — it is a
 * retaining wall, and a retaining wall with a rail on top is a fortification.
 *
 * **Publicly accessible means street or sidewalk**, and only that: the district
 * product this pass reads carries `carriageway` and `sidewalk` masks and no
 * paved/plaza mask, so a plaza that reaches a wall edge is currently read as
 * private. Widening it is one mask away if a walk asks for it.
 */
export const RAIL_ACCESS_RANGE = 3;

/**
 * The longest inaccessible stretch a parapet is carried across.
 *
 * A parapet that stops for two columns and starts again is two parapets with a
 * hole in them; a parapet that runs the length of a wall nobody can reach is the
 * battlement this replaced. Four is a doorway's worth.
 */
export const RAIL_GAP_BRIDGE = 4;

/**
 * The shortest run of parapet worth building.
 *
 * Below this a "continuous course" is indistinguishable from the spaced posts
 * that made the town read as a fortress: one or two wall blocks on their own
 * render as full-height posts.
 */
export const MIN_RAIL_RUN = 3;

/**
 * Stand a **continuous** parapet on the stretches of a wall the public reaches.
 *
 * The chain is 4-connected by construction (`chainsOf` walks 4-neighbours), so
 * consecutive rail blocks connect into a low course rather than each rendering
 * as a post. That is the whole difference between a parapet and a battlement,
 * and it is why this runs over the chain and not over the swept band.
 *
 * Three passes over the chain, in order: eligibility (a claimed column with
 * public ground within {@link RAIL_ACCESS_RANGE} on the platform the wall
 * holds), gap closing ({@link RAIL_GAP_BRIDGE}), and run pruning
 * ({@link MIN_RAIL_RUN}). A rail is only ever emitted over a column the sweep
 * claimed, which is the same column the coping was emitted on as a structure
 * block — so a rail can never be left floating.
 */
function railRun(
  region: Region,
  plan: ColumnPlan,
  path: readonly Vec2[],
  claimed: Uint8Array,
  levels: GroundLevels,
  above: number,
  drop: number,
  street: Uint8Array,
  states: RetainingStates,
  blocks: StructureBlock[],
): number {
  if (drop < RETAIN_RAIL) return 0;
  const n = path.length;
  const eligible = new Uint8Array(n);
  const railed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const cell = path[i] as Vec2;
    if (!inside(region, cell.x, cell.z)) continue;
    if (claimed[index(region, cell.x, cell.z)] !== 1) continue;
    eligible[i] = 1;
    let reached = false;
    for (let dz = -RAIL_ACCESS_RANGE; dz <= RAIL_ACCESS_RANGE && !reached; dz++) {
      for (let dx = -RAIL_ACCESS_RANGE; dx <= RAIL_ACCESS_RANGE; dx++) {
        const x = cell.x + dx;
        const z = cell.z + dz;
        if (!inside(region, x, z)) continue;
        // On the platform the wall holds: the street *below* a retaining wall is
        // the thing you fall onto, not the thing you walk along the top of.
        if (levels.at(x, z) !== above) continue;
        if (street[index(region, x, z)] !== 1) continue;
        reached = true;
        break;
      }
    }
    if (reached) railed[i] = 1;
  }
  // The gaps, then the stubs. Both decided from the arrays as they stand at the
  // start of their pass, so neither depends on scan direction.
  const access = Uint8Array.from(railed);
  for (let i = 0; i < n; i++) {
    if (access[i] === 1) continue;
    let end = i;
    while (end < n && access[end] !== 1) end++;
    if (i > 0 && end < n && end - i <= RAIL_GAP_BRIDGE) {
      for (let k = i; k < end; k++) if (eligible[k] === 1) railed[k] = 1;
    }
    i = end;
  }
  const runs = Uint8Array.from(railed);
  for (let i = 0; i < n; i++) {
    if (runs[i] !== 1) continue;
    let end = i;
    while (end < n && runs[end] === 1) end++;
    if (end - i < MIN_RAIL_RUN) for (let k = i; k < end; k++) railed[k] = 0;
    i = end;
  }
  let stood = 0;
  for (let i = 0; i < n; i++) {
    if (railed[i] !== 1 || eligible[i] !== 1) continue;
    const cell = path[i] as Vec2;
    const k = index(region, cell.x, cell.z);
    blocks.push({
      x: cell.x,
      y: (plan.ground[k] as number) + 1,
      z: cell.z,
      stateId: states.rail,
    });
    stood++;
  }
  return stood;
}

/**
 * Deepen a column's soil band so its **face** is made of what its top is.
 *
 * `sweep()` writes `plan.subsurface` and sets `plan.soil` to 1 if it was 0 —
 * one course. That is right for a road, whose face nobody sees, and wrong for
 * anything standing on a slope: the second course down is the terrain's own
 * soil or stone, so a wall reads as a lid on the hill rather than as masonry.
 * The band is never *shortened*, because a column that already had deeper soil
 * had it for a reason.
 */
function deepen(plan: ColumnPlan, k: number, depth: number): void {
  const want = depth < 1 ? 1 : depth > 255 ? 255 : depth;
  if ((plan.soil[k] as number) < want) plan.soil[k] = want;
}

/**
 * Finish every cut face in a quarter that no wall stands on.
 *
 * > **The second half of the walk, and the one nobody had a mechanism for.**
 * > *"Retaining walls do not properly seal the cliffside. Raw dirt faces jut
 * > out underneath stone slabs in arbitrary patches. It looks like a WorldEdit
 * > cut/paste error where the generator sliced into the terrain without
 * > auto-completing the stone retaining facade."*
 *
 * It was not a paste error and the walls were not at fault. A platform is
 * levelled by a pad edit, which moves `plan.ground` and leaves the column's
 * *materials* alone — surface, then `soil` courses of `subsurface`, which for
 * ordinary ground is grass over dirt. Seen from above that is a lawn; seen from
 * the low side of a four-block cut it is four blocks of dirt. Every seam the
 * pass declined to wall — and each of the eight reasons is a good reason not to
 * build a wall — left exactly that.
 *
 * So the finish is not a wall and does not pretend to be one: it is a statement
 * about what the cut is **made of**. Nothing is emitted, no level moves, nothing
 * can float, and a column a wall already claimed keeps the wall's own material —
 * it is only deepened. The pass swaps materials and does nothing else, and that
 * property is what makes it safe to run over a whole quarter.
 *
 * ## A cut face is a course, not a per-column property
 *
 * > *Walked 2026-08-06: "raw dirt faces jut out underneath stone slabs in
 * > arbitrary patches", still, after the finish existed.*
 *
 * The first version of this asked one question of one column — *is your
 * 8-neighbour drop ≥ 2?* — and painted whichever columns said yes. On a diagonal
 * contour the set of columns that say yes is **itself a lattice staircase**, so
 * from the low side the revetment showed as isolated single blocks; wherever the
 * drop dipped to 1 the masonry was interrupted by a column of grass; and with no
 * coping every stone patch was capped by the lawn on top. It read as a broken
 * wall.
 *
 * This is the **third** appearance of one lesson — *a contour on a lattice is a
 * staircase* — after the 1,010 phantom seam runs (grouped 4-connected, fixed by
 * grouping 8-connected) and the chessboard paving of diagonal streets. The fix
 * is the one that worked both previous times: build the face as a **course along
 * the contour** and finish it as one.
 *
 * 1. **Members** are what the old test found: on a platform, dry, 8-neighbour
 *    drop ≥ 2. Two or more, because one block of step is a kerb — a course you
 *    walk up, which the street pass already copes and which a facing would turn
 *    into a wall you trip over. The same number `skirtSeams` uses.
 * 2. Members are **grouped 8-connected**, exactly as `skirtSeams` groups its
 *    own and for exactly the same reason.
 * 3. **Drop-1 gaps are bridged.** A dry platform column whose own drop is 1
 *    joins the course when it is 8-adjacent to *two or more* members of one
 *    component — the stone–gap–stone signature of a contour dipping to a single
 *    block. A longer run of drop-1 columns touches at most one member at each
 *    end and stays out: there the face legitimately fades to a kerb, which is
 *    the street's course, not this one's. Recruits are decided in one region-order
 *    scan and committed after it, so a recruit can never recruit its own
 *    neighbour and the result does not depend on scan direction.
 * 4. **`thickenCourse` closes the diagonal**, because a unit-width band along a
 *    45° line spans ≈1.41 lattice columns and only a 4-connected course reads as
 *    masonry. It thickens with the *higher* ground preferred, which is **into
 *    the platform behind the edge** — never out onto the low side, where a
 *    painted column would be a patch of stone lying in the grass below the cut.
 * 5. Every course column gets **the hill's own rock** (`ground.stone`, the same
 *    symbol `buildColumnPlan` writes under a cliff) and a soil band as deep as
 *    its own drop. Its **surface is not touched**: whatever the terrain, the
 *    climate and the streets agreed on stays.
 *
 * ## Rock, not masonry — ratified by Kai 2026-08-07
 *
 * This step used to paint `ground.revetment` and cope the top course, which
 * dressed *every* unwalled cut in the theme's masonry. Walked: the hillside came
 * out as continuous built stonework and the town read as a quarry with a fortress
 * on it. A wall a sweep built is masonry because somebody built it; a cut nobody
 * walled is the hill, and the hill is rock. The original defect was **dirt** — a
 * four-block soil band showing under a stone kerb — and rock answers that
 * without claiming the whole slope was quarried. `deepen` therefore stays: the
 * face is solid rock to its full drop.
 *
 * @returns columns of course — members, gap recruits and thicken recruits alike.
 */
function faceCuts(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
  states: RetainingStates,
  seam: Uint8Array,
  street: Uint8Array,
  occupied: Uint8Array,
  /**
   * The quarter was drawn by a site planner, so its platforms are cut *into* a
   * hillside that is mostly still there — `docs/SITE-PLAN-v0.md` §5.4, and the
   * gate on the one behaviour change in this function.
   */
  naturalCuts: boolean,
  /**
   * The cut-edge columns the planner declared (§5.4), when it did.
   *
   * Supplied, this **replaces** the derived ring below: the declaration is the
   * edge, and rediscovering it here would be the same construction with a second
   * chance to differ — the argument `levelSeams` makes about forms declaring
   * their own seams, one edge over.
   */
  declaredCut?: Uint8Array,
): number {
  const bounds = levels.bounds;
  const cells = region.width * region.depth;

  /** The tallest face a column presents to any 8-neighbour; -1 if ineligible. */
  const drops = new Int32Array(cells).fill(-1);
  const dropOf = (k: number): number => {
    const known = drops[k] as number;
    if (known >= 0) return known;
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    const top = plan.ground[k] as number;
    let drop = 0;
    for (const [dx, dz] of SEAM_NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      const n = index(region, x + dx, z + dz);
      const fall = top - (plan.ground[n] as number);
      if (fall > drop) drop = fall;
    }
    drops[k] = drop;
    return drop;
  };
  /**
   * The **cut** edge: a column of natural hillside standing above a platform
   * beside it (`docs/SITE-PLAN-v0.md` §5.4).
   *
   * Nothing owns this face today. `levelSeams` ignores it — natural ground is
   * not a platform and takes part in no seam; `skirtSeams` ignores it — it only
   * claims neighbours whose ground is *below* the platform top; and this
   * function ignored it, because its members had to be on a platform themselves.
   * On a quarter with 100 % platform coverage that was invisible: the uphill
   * side of every bench was the bench above, so the whole thing fell inside
   * `levelSeams`. Take the coverage away — which is exactly what a site planner
   * does — and the cut edge becomes the most common edge in the quarter with
   * nobody to finish it, and it ships as a vertical band of raw soil behind
   * every terrace.
   *
   * One ring is the whole face: a cut is vertical, so the drop happens in the
   * single column between the platform and the hill. `thickenCourse` closes the
   * diagonal from there, into the higher ground, which is the hill.
   *
   * Empty unless the district asked, so no quarter that did not ask moves.
   */
  const naturalCut = new Uint8Array(cells);
  if (naturalCuts) {
    for (let z = bounds.z0; z <= bounds.z1; z++) {
      for (let x = bounds.x0; x <= bounds.x1; x++) {
        if (!inside(region, x, z)) continue;
        if (levels.at(x, z) !== NO_PLATFORM) continue;
        const k = index(region, x, z);
        const top = plan.ground[k] as number;
        for (const [dx, dz] of SEAM_NEIGHBOURS) {
          const platform = levels.at(x + dx, z + dz);
          if (platform === NO_PLATFORM) continue;
          if (top <= (levels.levelY[platform] as number)) continue;
          naturalCut[k] = 1;
          break;
        }
      }
    }
  }
  // **The declaration, added to what the finished ground shows** (§5.4).
  //
  // Measured on the steep fixture: the planner declares 269 cut columns and the
  // finished ground presents 291, the 269 among them. The 22 it does not know
  // about are the ones four later passes cut — a stair tread, a doorstep
  // landing, a shoulder the road blended — which is the same reason this whole
  // function was moved to the end of the structure pass. So the declaration
  // governs the **treatment** of an edge and does not bound the **finish**: a
  // column the hill exposes after the plan was drawn is still a raw face and
  // still gets rock. A cut edge a building's own back stands on is the one
  // subtraction, because there is a building there.
  if (declaredCut !== undefined) {
    for (let k = 0; k < cells; k++) if (declaredCut[k] === 1) naturalCut[k] = 1;
    for (let k = 0; k < cells; k++) if (declaredCut[k] === 2) naturalCut[k] = 0;
  }

  /** On a platform of this quarter — or on its cut edge — and not under water. */
  const facing = (x: number, z: number, k: number): boolean =>
    (levels.at(x, z) !== NO_PLATFORM || naturalCut[k] === 1) &&
    plan.fluidKind[k] === FluidKind.NONE;

  // --- members ------------------------------------------------------------
  const course = new Uint8Array(cells);
  const members: number[] = [];
  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!inside(region, x, z)) continue;
      const k = index(region, x, z);
      if (!facing(x, z, k)) continue;
      // A corner column shows its diagonal, and a diagonal face left raw is the
      // "arbitrary patch" the walk described — so the drop is 8-connected.
      if (dropOf(k) < 2) continue;
      course[k] = 1;
      members.push(k);
    }
  }
  if (members.length === 0) return 0;

  // --- components, 8-connected --------------------------------------------
  const component = new Int32Array(cells).fill(-1);
  let nextComponent = 0;
  for (const start of members) {
    if ((component[start] as number) >= 0) continue;
    const id = nextComponent++;
    component[start] = id;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head] as number;
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      for (const [dx, dz] of SEAM_NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (course[n] !== 1 || (component[n] as number) >= 0) continue;
        component[n] = id;
        queue.push(n);
      }
    }
  }

  // --- the drop-1 gaps ----------------------------------------------------
  // Decided in one scan and committed after it: a recruit that could recruit
  // its neighbour would walk the course along the whole kerb line.
  const recruits: number[] = [];
  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!inside(region, x, z)) continue;
      const k = index(region, x, z);
      if (course[k] === 1) continue;
      if (!facing(x, z, k)) continue;
      if (dropOf(k) !== 1) continue;
      const touching = new Map<number, number>();
      for (const [dx, dz] of SEAM_NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (course[n] !== 1) continue;
        const id = component[n] as number;
        touching.set(id, (touching.get(id) ?? 0) + 1);
      }
      for (const count of touching.values()) {
        if (count >= 2) {
          recruits.push(k);
          break;
        }
      }
    }
  }
  for (const k of recruits) course[k] = 1;

  // --- the diagonal -------------------------------------------------------
  // Preferring the *higher* ground is what points the thickening inward: the
  // column behind the edge stands level with the face's top, the column in
  // front of it is the ground below, and a stone patch lying in the grass down
  // there is the artifact rather than the fix. Drop cannot make this call —
  // it measures only downward falls, so the column at the foot of the cut
  // scores the same 0 as a flat column behind the edge and region order would
  // decide the side.
  thickenCourse(
    region,
    course,
    (idx, x, z) =>
      facing(x, z, idx) && occupied[idx] !== 1 && street[idx] !== 1,
    (idx) => plan.ground[idx] as number,
  );

  // --- the materials ------------------------------------------------------
  let faced = 0;
  for (let k = 0; k < cells; k++) {
    if (course[k] !== 1) continue;
    // A column a wall stands on already has the wall's material; all it wants
    // is the depth, so the wall does not sit on a dirt plinth of its own.
    if (seam[k] !== 1) plan.subsurface[k] = states.rock;
    deepen(plan, k, dropOf(k));
    faced++;
  }
  return faced;
}

/* -------------------------------------------------------------------------- */
/* §5 — the context a planned edge carries                                     */
/* -------------------------------------------------------------------------- */

/**
 * Measure an edge's {@link EdgeContext} off the finished plan
 * (`docs/SITE-PLAN-v0.md` §5.1).
 *
 * ## Why the fill side is measured here and not planned upstream
 *
 * §5.1 says *"the planner calls `treatmentForEdge`; the retaining pass reads the
 * planner's answer"*, and that is right for the **cut** edge, which is pure
 * geometry the planner owns and which it now declares (§5.4). It cannot be right
 * for the **fill** edge, and this is WP-3's one substantive amendment to §5:
 * three of the nine clauses read state the planner does not have. Rule 2 needs
 * the building footprints, which are seated after the plan is drawn; rules 3 and
 * 6 need the *finished* ground, because half the fill edges in a hill town are
 * `skirtSeams` — a terrace's own edge against ground the streets, the pads and
 * the spine all moved after the planner ran. A planner answer here would be an
 * answer about ground that no longer exists.
 *
 * So the **table** is shared and the **context** is measured where it is
 * complete, which is what §5.1's real requirement is: *one* drop table, called
 * once per edge, never re-derived. `treatmentForEdge` is that table.
 *
 * ## The side every measurement is taken on
 *
 * All of it is measured on the **low side** — the side a bank would be graded
 * into — and never on the platform the face holds. §5.2 says `adjacentUse` is
 * "within `WALL_DEMAND_RANGE` columns of the edge" without saying which side of
 * it, and measured both ways the difference is the whole rule: every terrace
 * edge in a hill town has its own street two columns behind it, so asked of the
 * platform side rule 3 never fires and the inversion Sol asked for does not
 * happen. Asked of the low side it says the thing it means — *is anybody using
 * the ground this bank would spread over* — and a terrace backing onto open
 * hillside gets the bank while one backing onto the street below gets the wall.
 */
function edgeContextOf(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
  record: LevelSeam,
  street: Uint8Array,
  occupied: Uint8Array,
  budget: number,
): EdgeContext {
  const above = record.above;
  const drop = record.drop;
  const reach = bankRun(drop);
  /** The 4-neighbour direction from a seam cell towards the face it presents. */
  const faceDir = (x: number, z: number): readonly [number, number] | null => {
    for (const [dx, dz] of NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      if (levels.at(x + dx, z + dz) === above) return [dx, dz];
    }
    return null;
  };
  const free: number[] = [];
  const behind: number[] = [];
  let builtFace = 0;
  let facedCells = 0;
  let use: EdgeUse = "natural";
  let publicGround = false;
  let pressedCells = 0;
  for (const point of record.cells) {
    const dir = faceDir(point.x, point.z);
    if (dir === null) continue;
    const [dx, dz] = dir;
    facedCells++;
    // Rule 2, as a share: a seam clipped at one end by the corner of a house is
    // still a seam; a seam a terrace stands along the length of is that
    // terrace's own foundation skirt.
    const fk = index(region, point.x + dx, point.z + dz);
    if (occupied[fk] === 1) builtFace++;
    // `availableRun` — unclaimed columns straight out from the face, which is
    // the run §5.3 says a bank spends. Straight and never around, for
    // `walkBack`'s reason: a search free to detour measures somebody else's
    // ground.
    let run = 0;
    for (let step = 1; step <= reach; step++) {
      const x = point.x - dx * step;
      const z = point.z - dz * step;
      if (!inside(region, x, z)) break;
      const k = index(region, x, z);
      if (street[k] === 1 || occupied[k] === 1) break;
      if (plan.fluidKind[k] !== FluidKind.NONE) break;
      // A neighbouring platform is claimed ground, not spare hillside: grading
      // a bank across it would bury the terrace below.
      if (levels.at(x, z) !== NO_PLATFORM) break;
      run++;
    }
    free.push(run);
    // Rule 6's `depthAfter` — the terrace behind the face, straight in.
    let depth = 0;
    for (let step = 0; step < RETAIN_FACE_SETBACK * 2; step++) {
      const x = point.x + dx * (step + 1);
      const z = point.z + dz * (step + 1);
      if (!inside(region, x, z)) break;
      if (levels.at(x, z) !== above) break;
      depth++;
    }
    behind.push(depth);
    // Rule 3's land pressure, on the low side only.
    let pressed = false;
    for (let ddz = -WALL_DEMAND_RANGE; ddz <= WALL_DEMAND_RANGE; ddz++) {
      for (let ddx = -WALL_DEMAND_RANGE; ddx <= WALL_DEMAND_RANGE; ddx++) {
        const x = point.x + ddx;
        const z = point.z + ddz;
        if (!inside(region, x, z)) continue;
        if (levels.at(x, z) === above) continue;
        const k = index(region, x, z);
        if (street[k] === 1) {
          use = "street";
          publicGround = true;
          pressed = true;
        } else if (occupied[k] === 1) {
          if (use !== "street") use = "lot";
          pressed = true;
        }
      }
    }
    if (pressed) pressedCells++;
  }
  const median = (list: number[]): number => {
    if (list.length === 0) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[sorted.length >> 1] as number;
  };
  return {
    drop,
    run: record.cells.length,
    availableRun: median(free),
    adjacentUse: use,
    access: publicGround ? "public" : "private",
    // The wall stands on the platform's own outermost free column, so a
    // `retaining` answer costs the terrace one column (§5.3's table).
    depthAfter: median(behind) - 1,
    side: "fill",
    budget,
    builtShare: facedCells === 0 ? 0 : builtFace / facedCells,
    pressedShare: facedCells === 0 ? 0 : pressedCells / facedCells,
  };
}

/**
 * The nearest column of the upper platform a wall may actually stand on.
 *
 * A straight walk **perpendicular to the seam**, away from it, bounded by
 * {@link RETAIN_FACE_SETBACK}. Straight, and never around: that is the whole of
 * how a street running *along* a seam is told from one *crossing* it. Along,
 * the walk leaves the carriageway after a few columns and the wall lands at the
 * back of the pavement; across, the walk is street for its whole length and
 * comes back empty, so the crossing stays open — there the street is the
 * connection between the two levels, not a thing to wall off. A search free to
 * detour would find its way round a flight and wall the landing.
 *
 * A building and water are **stops**, not obstacles to walk past: what is
 * behind a building is the building's ground and its own foundation skirt is
 * the wall (§3.4).
 *
 * **The platform's edge is not a stop while the walk is still on street**
 * (2026-08-09). "Across, the walk is street for its whole length" was written
 * assuming the length that ends the walk is {@link RETAIN_FACE_SETBACK}; on a
 * terrace shallower than the setback the crossing runs off the *far* edge
 * first, and the walk answered `offPlatform` — §5.5's compiler-bug error — for
 * a street it had correctly refused to wall a few columns to either side. The
 * platform test is therefore asked of free ground only, and is latched so that
 * a walk which has left the platform can never come back and claim a column on
 * the other side of a road. See the loop for the measurement.
 */
function walkBack(
  region: Region,
  x0: number,
  z0: number,
  dx: number,
  dz: number,
  levels: GroundLevels,
  above: number,
  street: Uint8Array,
  occupied: Uint8Array,
  plan: ColumnPlan,
): { readonly column: number; readonly why: UnfacedReason } {
  let left = false;
  for (let step = 0; step < RETAIN_FACE_SETBACK; step++) {
    const x = x0 + dx * step;
    const z = z0 + dz * step;
    if (!inside(region, x, z)) break;
    const k = index(region, x, z);
    if (levels.at(x, z) !== above) left = true;
    // **The street's ground is the street's, on the platform or off it.** A
    // wall may not stand on a carriageway either way, so while the walk is
    // still inside street the platform question has no answer to give, and
    // asking it early is what conflated two different things: a terrace
    // *narrower than the road running along it* — §3.4 rule 2's guarantee, and
    // a planner bug — with a road *running off the far side of the terrace*,
    // which is the ordinary crossing this walk exists to recognise. Measured on
    // `harbour_city` (seed 202, `world.old_town`): one nine-column street
    // crossing a 56-column seam, whose six inner columns were refused `street`
    // and whose three outer ones were refused `offPlatform` and raised §5.5's
    // error. Same street, same crossing, same (correct) absence of a wall — the
    // only difference was that the terrace's far edge stood nine columns back
    // there rather than past the setback.
    if (street[k] === 1) continue;
    // Out of platform before out of street: the upper bench is narrower than
    // the road that runs on it, and there is no ground of its own to stand on.
    // Latched, and answered only here — past the platform's edge the walk may
    // confirm that the street goes on, but it may never come back and stand a
    // wall on ground the seam it faces no longer touches.
    if (left) return { column: -1, why: "offPlatform" };
    if (occupied[k] === 1) return { column: -1, why: "building" };
    if (plan.fluidKind[k] !== FluidKind.NONE) return { column: -1, why: "water" };
    return { column: k, why: "street" };
  }
  return { column: -1, why: "street" };
}

/** Text for the refusal, kept out of the template so the number has one home. */
const RETAIN_MAX_TEXT = "6 blocks";

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** `layout/levels.ts`'s SEAM_NEIGHBOURS, for grouping a skirt into one face. */
const SEAM_NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * The seams a platform makes with the ground that is **not** a platform.
 *
 * `levelSeams` derives the faces between two platforms, which is the right
 * construction and, on its own, finds almost nothing: a block's platform stops
 * at the street, and a street is not a platform, so two blocks a storey apart
 * are never 4-adjacent. The face that is actually in the world is the block's
 * own edge — the pad holds it at its storey and the ground one column out is
 * whatever the terrain and the street left. This measures that face on the
 * finished plan, groups it exactly as `levelSeams` groups its own, and hands it
 * back in the same shape, so one loop builds both.
 *
 * The `below` index is the platform's own, and the caller never reads it: a
 * skirt's floor is *measured*, not looked up, and it is returned beside the
 * record for that reason.
 */
function skirtSeams(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
): { readonly seam: LevelSeam; readonly floorY: number }[] {
  const cells = region.width * region.depth;
  const out: { seam: LevelSeam; floorY: number }[] = [];
  // Low-side columns per platform, in region order.
  const byPlatform = new Map<number, number[]>();
  const claimedBy = new Int32Array(cells).fill(-1);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const k = j * region.width + i;
      const x = region.x0 + i;
      const z = region.z0 + j;
      const platform = levels.at(x, z);
      if (platform === NO_PLATFORM) continue;
      const top = levels.levelY[platform] as number;
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (levels.at(x + dx, z + dz) !== NO_PLATFORM) continue;
        if (plan.fluidKind[n] !== FluidKind.NONE) continue;
        // A one-block lip is a kerb the street pass already copes with; below
        // that there is nothing to retain.
        if ((plan.ground[n] as number) > top - 2) continue;
        // One column belongs to one skirt: the highest platform it touches
        // wins, ties to the lower index, so the grouping is order-independent.
        const current = claimedBy[n] as number;
        if (current >= 0 && (levels.levelY[current] as number) >= top) continue;
        claimedBy[n] = platform;
      }
    }
  }
  for (let k = 0; k < cells; k++) {
    const platform = claimedBy[k] as number;
    if (platform < 0) continue;
    let list = byPlatform.get(platform);
    if (list === undefined) {
      list = [];
      byPlatform.set(platform, list);
    }
    list.push(k);
  }

  for (const platform of [...byPlatform.keys()].sort((a, b) => a - b)) {
    const list = byPlatform.get(platform) as number[];
    const top = levels.levelY[platform] as number;
    const member = new Set(list);
    const seen = new Set<number>();
    for (const start of list) {
      if (seen.has(start)) continue;
      seen.add(start);
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        const k = queue[head] as number;
        const x = region.x0 + (k % region.width);
        const z = region.z0 + Math.floor(k / region.width);
        // 8-connected, for `layout/levels.ts`'s SEAM_NEIGHBOURS reason: a
        // skirt is a contour too, and a contour on a lattice is a staircase
        // whose consecutive columns are diagonal neighbours.
        for (const [dx, dz] of SEAM_NEIGHBOURS) {
          if (!inside(region, x + dx, z + dz)) continue;
          const n = index(region, x + dx, z + dz);
          if (!member.has(n) || seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      queue.sort((a, b) => a - b);
      // The floor is the component's **median** ground, not its lowest column:
      // a wall is built for the face it presents, and one column of gully at
      // the end of a run is not that face.
      const heights = queue.map((k) => plan.ground[k] as number).sort((a, b) => a - b);
      const floorY = heights[heights.length >> 1] as number;
      const drop = top - floorY;
      if (drop < 2) continue;
      out.push({
        seam: {
          above: platform,
          below: platform,
          cells: queue.map((k) => ({
            x: region.x0 + (k % region.width),
            z: region.z0 + Math.floor(k / region.width),
          })),
          drop,
          treatment: treatmentForSeam(drop, queue.length),
        },
        floorY,
      });
    }
  }
  return out;
}

/**
 * The face a wall on this seam would actually present, column by column.
 *
 * > **The composite, and the hole `RETAIN_MAX` was falling through.**
 *
 * Every seam in this pass carries one `drop`, and every rule that has an
 * opinion about how tall a face may be reads that one number: rule 5 sends a
 * drop past {@link RETAIN_MAX} to a benched bank, rule 9 sanctions a wall at or
 * under it. But `drop` is a *summary*. A platform-to-platform seam's is exact,
 * because both sides are level by construction; a **skirt**'s is the component's
 * **median** ground, chosen deliberately — "a wall is built for the face it
 * presents, and one column of gully at the end of a run is not that face"
 * ({@link skirtSeams}) — and a median says nothing about the columns below it.
 *
 * Measured on the steep fixture (2026-08-07): one skirt of 90 columns reported
 * `drop: 6`, was sanctioned by rule 9, and thirteen of its columns stood over
 * ground seven blocks down. Six of those thirteen were contiguous. What got
 * built there was a seven-block sheer face that no rule in §5.2 ever looked at,
 * because every rule looked at the 6.
 *
 * So this measures the face the wall would present **per column** — the level it
 * is built to, less the ground its foot lands on — and {@link overCeilingRun}
 * asks the only question that matters about the profile: is there a stretch of
 * it past the ceiling long enough to read as a wall.
 */
function facesOf(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
  record: LevelSeam,
): number[] {
  const top = levels.levelY[record.above] as number;
  return record.cells.map((p) => top - (plan.ground[index(region, p.x, p.z)] as number));
}

/**
 * The longest 8-connected run of face past {@link RETAIN_MAX}, in columns.
 *
 * **Why a run and not a maximum, and why this run and not another number.** A
 * single column of gully under a hundred-column terrace is the thing
 * `skirtSeams`' median exists to ignore, and taking the profile's maximum would
 * bank a whole face because of it — the fixture where that matters is
 * `site-plan-hillside`, whose one long skirt has four such columns out of 191.
 * A *run* asks the question the walk asks: not "is any column too tall" but "is
 * there a piece of wall here that is too tall".
 *
 * Eight-connected for {@link SEAM_NEIGHBOURS}' reason, which is now on its
 * fourth appearance in this compiler: a contour on a lattice is a staircase, and
 * a run of it counted 4-connected is crumbs.
 *
 * The bar is {@link MIN_RETAIN_RUN}, and it is the same argument that constant
 * already makes read backwards. A stretch of face shorter than the tallest wall
 * we build is not a wall — that is why a short seam is graded rather than
 * walled — so a stretch of *over-ceiling* face shorter than that is not a
 * too-tall wall either. At or past it, it is.
 */
function overCeilingRun(
  region: Region,
  record: LevelSeam,
  faces: readonly number[],
): number {
  const over = new Set<number>();
  for (const [i, face] of faces.entries()) {
    if (face <= RETAIN_MAX) continue;
    const point = record.cells[i] as { x: number; z: number };
    over.add(index(region, point.x, point.z));
  }
  if (over.size === 0) return 0;
  const seen = new Set<number>();
  let longest = 0;
  for (const start of [...over].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    seen.add(start);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head] as number;
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      for (const [dx, dz] of SEAM_NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (!over.has(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    if (queue.length > longest) longest = queue.length;
  }
  return longest;
}

/**
 * A drop of one block is a kerb, not a wall.
 *
 * One course of the street's kerb material on the lower column, and the level
 * is not touched: a single block of step is something you walk up, and building
 * a wall for it would be building a wall you trip over.
 */
function kerbSeam(
  region: Region,
  plan: ColumnPlan,
  record: LevelSeam,
  states: RetainingStates,
  street: Uint8Array,
  occupied: Uint8Array,
): number {
  let laid = 0;
  for (const point of record.cells) {
    if (!inside(region, point.x, point.z)) continue;
    const k = index(region, point.x, point.z);
    if (street[k] === 1) continue;
    // The footprint mask, which `gradeBank` and the wall path both honour and
    // this one did not: a drop-1 seam running under a building would have laid
    // a course of kerb inside its ground floor.
    if (occupied[k] === 1) continue;
    if (plan.fluidKind[k] !== FluidKind.NONE) continue;
    plan.surface[k] = states.coping;
    laid++;
  }
  return laid;
}

/**
 * A drop past `RETAIN_MAX` is a bank: the two platforms are graded into each
 * other over `drop` columns and the record says so.
 *
 * Nothing is *built* — that is the point of the refusal — but nothing is left
 * as a cliff either. The ramp only ever raises the low side toward the face,
 * one block per column, and it never touches a street, a footprint or water.
 *
 * A raised column is also **finished**: its soil band becomes the theme's bank
 * earth. Without that the ramp is made of whatever the terrain pass put under
 * the old surface — on a cut platform that is frequently plain stone — and a
 * graded bank of masonry reads as a broken wall rather than as a slope. The
 * *surface* is deliberately untouched: it is the grass, podzol or path the
 * terrain and climate already agreed on, and it is what makes the bank read as
 * ground rather than as a build.
 *
 * @returns columns raised.
 */
function gradeBank(
  region: Region,
  plan: ColumnPlan,
  driver: GroundDriver,
  /** `<nodePath>#bank@<job>` — the `verge` claim's source, unique and stable. */
  source: string,
  levels: GroundLevels,
  record: LevelSeam,
  floorY: number,
  street: Uint8Array,
  occupied: Uint8Array,
  states: RetainingStates,
  /**
   * Sink for §3.3b's `verge` claim: every ring column this call raised, at the
   * target it raised it to. Write-only and never read.
   */
  declare: GroundClaim[] | undefined,
  /**
   * Grade the bank as **benches** rather than as one slope
   * (`docs/SITE-PLAN-v0.md` §5.2 rule 5's downstream answer).
   *
   * The ramp above falls one block per column — 45°, which from below is the
   * cliff the wall refused to be, and which is what the walk reported as "sheer
   * platform-to-platform dropoffs mid-town". Benched, the same fall is
   * `ceil(drop / BENCH_FACE)` faces of two blocks with two columns of soil
   * between them: `benchedRun(7) = 8` columns against the ramp's seven, so it
   * costs one more column of ground and reads as terracing rather than as a
   * spoil heap. The soil is `gradeBank`'s own — every raised column is finished
   * in the theme's bank earth, which is what a planting hook wants.
   *
   * False for every quarter no planner drew, so nothing else moves.
   */
  benched = false,
  /**
   * The fall the benches have to get down, when it is not `record.drop`.
   *
   * A **composite** face — a seam whose own drop is a summary and whose deepest
   * columns stand lower than it (see {@link facesOf}) — is benched for the face
   * it actually presents, not for the summary: `benchedRun(6)` over a
   * seven-block fall leaves the last block as a step no bench reaches, which is
   * the sheer face this conversion exists to remove, one block shorter.
   */
  drop = record.drop,
): number {
  const view = driver.view();
  const cells = region.width * region.depth;
  const top = levels.levelY[record.above] as number;
  const floor = floorY;
  const seen = new Uint8Array(cells);
  let frontier: number[] = [];
  for (const point of record.cells) {
    if (!inside(region, point.x, point.z)) continue;
    const k = index(region, point.x, point.z);
    if (seen[k] === 1) continue;
    seen[k] = 1;
    frontier.push(k);
  }
  let raised = 0;
  /** The ring targets, with the ground each was measured against (§9 step 2). */
  const rings: { readonly idx: number; readonly target: number; readonly g: number }[] = [];
  const steps = benched ? benchedRun(drop) : drop;
  for (let ring = 0; ring < steps && frontier.length > 0; ring++) {
    // One block per column, or one bench of `BENCH_FACE` blocks every
    // `BENCH_TREAD` columns. The benched profile is clamped one block above the
    // floor rather than cut off at it, so the last face is a kerb and never a
    // step the bench does not reach.
    const target = benched
      ? Math.max(floor + 1, top - BENCH_FACE * (Math.floor(ring / BENCH_TREAD) + 1))
      : top - ring - 1;
    if (!benched && target <= floor) break;
    const next: number[] = [];
    for (const k of frontier) {
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      if (street[k] !== 1 && occupied[k] !== 1 && view.fluidKind[k] === FluidKind.NONE) {
        const g = view.ground[k] as number;
        if (target > g) {
          declare?.push({ idx: k, y: target });
          rings.push({ idx: k, target, g });
          raised++;
        }
      }
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (seen[n] === 1) continue;
        // Only outward, into the platform below. The one above is already there.
        if (levels.at(x + dx, z + dz) === record.above) continue;
        seen[n] = 1;
        next.push(n);
      }
    }
    frontier = next;
  }

  // The rings are collected before anything is committed, which is sound because
  // a column belongs to exactly one ring: ring `k + 1` reads columns ring `k`
  // never claimed, so the answer is the one the interleaved form gave.
  //
  // §3.3b: `verge` is rank 140, the last built rank there is, so a bank can only
  // move ground nothing else claimed — inversion I5, which is the hand-written
  // guard list (street / footprint / water) restated as one rank. The guards
  // above stay for this round: deleting a defence the rank makes redundant is
  // §10's work, not a conversion's.
  if (rings.length === 0) return raised;
  driver.commit([
    {
      source,
      sourceClass: "verge",
      kind: "profile",
      columns: rings.map((r) => ({ idx: r.idx, y: r.target })),
      transition: "ramp",
    },
  ]);
  // §9 step 2's second loop, over the columns the bank **claimed**. Earth, and
  // enough of it to cover what the ramp raised: the face of a bank is the bank,
  // and it is not masonry. The depth follows the cut the claim asked for, whether
  // or not the rank let the bank have the column.
  for (const { idx, target, g } of rings) {
    plan.subsurface[idx] = states.bank;
    plan.soil[idx] = Math.min(255, Math.max(plan.soil[idx] as number, target - g + 1));
  }
  return raised;
}

/**
 * Order a set of columns into 4-connected chains a sweep can follow.
 *
 * `sweep()` wants a path, and a seam's face is a set. Each connected piece
 * contributes its **diameter** — the longest shortest-path in the piece, found
 * by the usual double BFS — and whatever the diameter did not cover is fed back
 * in and chained again, so a branch off a wall becomes its own short run rather
 * than a kink in the line the sweep projects onto. Every tie breaks on region
 * order, so the chains are a pure function of the set.
 */
function chainsOf(
  region: Region,
  columns: readonly number[],
): Vec2[][] {
  const remaining = new Set(columns);
  const out: Vec2[][] = [];
  const point = (k: number): Vec2 => ({
    x: region.x0 + (k % region.width),
    z: region.z0 + Math.floor(k / region.width),
  });
  const neighbours = (k: number): number[] => {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    const list: number[] = [];
    for (const [dx, dz] of NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      const n = index(region, x + dx, z + dz);
      if (remaining.has(n)) list.push(n);
    }
    return list.sort((a, b) => a - b);
  };
  // Bounded: every iteration removes at least one column.
  let guard = columns.length + 1;
  while (remaining.size > 0 && guard-- > 0) {
    let start = Number.POSITIVE_INFINITY;
    for (const k of remaining) if (k < start) start = k;
    const far = furthest(start, neighbours);
    const end = furthest(far.node, neighbours);
    const chain = end.path;
    for (const k of chain) remaining.delete(k);
    if (chain.length > 0) out.push(chain.map(point));
  }
  return out;
}

/** BFS from `start`, returning the furthest node and the path to it. */
function furthest(
  start: number,
  neighbours: (k: number) => number[],
): { readonly node: number; readonly path: number[] } {
  const from = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let last = start;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    last = k;
    for (const n of neighbours(k)) {
      if (from.has(n)) continue;
      from.set(n, k);
      queue.push(n);
    }
  }
  const path: number[] = [];
  for (let k: number | undefined = last; k !== undefined && k >= 0; k = from.get(k)) path.push(k);
  path.reverse();
  return { node: last, path };
}

/**
 * Point a chain so the profile's `verge` band falls **inside** the platform the
 * wall holds.
 *
 * `RETAINING_PROFILE` is asymmetric, so its bands run from the negative side of
 * the line to the positive one: lane 0 is the path itself (the face) and lane
 * +1 is the verge. Which world side lane +1 lands on depends on the direction
 * the path is walked, and that is not something a profile can declare. So it is
 * measured: sweep the span, count how many lane-1 columns are on the upper
 * platform, and reverse the path when the answer is "fewer than half". A tie
 * keeps the original order, so the choice is a pure function of the chain.
 */
function orient(
  region: Region,
  chain: readonly Vec2[],
  levels: GroundLevels,
  above: number,
  street: Uint8Array,
  occupied: Uint8Array,
): Vec2[] {
  const path = [...chain];
  if (path.length < 2) return path;
  let onPlatform = 0;
  let off = 0;
  for (const column of sweptColumns(region, path, { lo: 0, hi: 1 })) {
    if (column.lane !== 1) continue;
    const k = index(region, column.x, column.z);
    // Free ground of the platform the wall holds, not merely the platform: with
    // the setback both lanes can be on it, and the verge belongs on the side
    // that is walkable rather than on the side the carriageway owns.
    const free = street[k] !== 1 && occupied[k] !== 1;
    if (levels.at(column.x, column.z) === above && free) onPlatform++;
    else off++;
  }
  return off > onPlatform ? [...path].reverse() : path;
}
