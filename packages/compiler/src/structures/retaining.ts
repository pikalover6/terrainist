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
import { APRON_RUN_PER_BLOCK, type Region } from "@terrainist/stdlib";

import type { SeamLanding, SeamLandingStack, SeamLandings } from "../layout/district.js";
import type { Point2, Rect } from "../layout/frames.js";
import type { GroundClaim, GroundIntent, ResolvedGround } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import { GROUND_V1_SEAMS } from "../layout/types.js";
import {
  deriveGroundSeams,
  type DerivedSeam,
  type SeamCoverage,
} from "../layout/ground-resolver.js";
import {
  BENCH_FACE,
  BENCH_TREAD,
  BUILT_SHARE,
  NO_PLATFORM,
  RETAIN_MAX,
  RETAIN_RAIL,
  MIN_RETAIN_RUN,
  SEAM_TIER_MAX,
  WALL_DEMAND_RANGE,
  bankRun,
  benchedRun,
  blendedBankFall,
  groundLevelsOf,
  seamDressing,
  tierCountOf,
  tieredRun,
  tiersOf,
  treatmentForEdge,
  treatmentForSeam,
  type EdgeChoice,
  type EdgeContext,
  type EdgeUse,
  type GroundLevels,
  type LevelSeam,
  type SeamDressing,
  type SeamTier,
  type SeamTreatment,
} from "../layout/levels.js";
import type { FormBench, PlannedEdge } from "../layout/forms/types.js";
import { GROUND_PLANE_TIE, SEAM_TIERS } from "../layout/types.js";
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
  /**
   * Whether this quarter's seams may be served by a **tier stack**
   * (`docs/GROUND-UNIFICATION-v0.md` §4.1 S2), and whether its edge context may
   * choose the treatment at all.
   *
   * Defaults to {@link SEAM_TIERS}, the compile-time flag 11F flips on Kai's
   * walk verdict. The field exists for the reason `PlatformInput.tiered` exists
   * in `layout/platforms.ts`: a test must be able to build the flag-on world for
   * one quarter without flipping a constant the whole compiler reads, and the
   * pipeline never sets it.
   */
  readonly tiered?: boolean;
}

/**
 * A **claimed plane** — levelled ground that no quarter drew.
 *
 * > **R1 — every pass that levels ground to a plane owes the boundary between
 * > that plane and the ground it did not level.**
 * > (`docs/GROUND-UNIFICATION-v0.md` §11.2)
 *
 * A `precinct.*` quay, a forecourt, an airport apron: each flattens a patch of
 * hillside to one Y and then stops, and inside a quarter the platform election
 * owes that boundary (Part IV) while outside one **nobody does**. That is not a
 * missing feature, it is the bug — the pirate haven's quay commits
 * `transition: "ramp"`, promises in its own comment that it *"walks out to its
 * own ground rather than ending at a cut face"*, and ends at a 4–6 block raw
 * grass face over 73 columns, because all three passes that could have caught
 * it are scoped to `RetainingDistrict[]`.
 *
 * So a plane is handed to this pass as *itself*, and the pass measures its
 * edges off the finished ground (R2) rather than reading the claim's own word
 * for them — *"a form that declared its own seams could get one wrong, and a
 * wrong seam is a cliff through a town"*.
 */
export interface RetainingPlane {
  readonly nodePath: string;
  /**
   * The columns the plane levelled, as the producing pass recorded them —
   * `precincts.ts`' `OneResult.claims`, handed straight on (§11.3, wave 12E).
   *
   * Only `idx` is read: a plane is a plane, and its one level is
   * {@link planeY}. A claim outside the region is skipped.
   */
  readonly columns: readonly GroundClaim[];
  /** The walking level every column of the plane was cut or filled to. */
  readonly planeY: number;
  /**
   * Whether this plane's own edges are served at all.
   *
   * Defaults to {@link GROUND_PLANE_TIE}, the compile-time flag 12F flips on
   * Kai's walk verdict. The field exists for the reason
   * {@link RetainingDistrict.tiered} exists: a test must be able to build the
   * flag-on world for one plane without flipping a constant the whole compiler
   * reads (§11.4).
   */
  readonly tiered?: boolean;
}

/** Everything {@link buildRetainingWalls} reads. */
export interface RetainingPassInput {
  readonly districts: readonly RetainingDistrict[];
  /**
   * The claimed planes, if any (R1). Absent for every document with no
   * `precinct.*` node, which is what makes R6's byte-identity hold: no plane
   * means no job list and no allocation.
   */
  readonly planes?: readonly RetainingPlane[];
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
  /**
   * Seams served by a **tier stack** — S2's answer to a drop past
   * {@link RETAIN_MAX}: `ceil(drop / RETAIN_MAX)` faces, none of them past the
   * ceiling, with a tread between them.
   *
   * Zero on every world until {@link SEAM_TIERS} flips at 11F.
   */
  readonly stacks: number;
  /** …of them, by the dressing S5 chose (`pressedShare` against `EDGE_PRESSED_SHARE`). */
  readonly stacksByDressing: Readonly<Record<SeamDressing, number>>;
  /** Faces built across every stack — `Σ tiers`, never `Σ 1`. */
  readonly stackTiers: number;
  /** Columns of stack face, the {@link wallColumns} of a stack. */
  readonly stackColumns: number;
  /** Columns of tread levelled and declared as the tier's own ground (S4). */
  readonly treadColumns: number;
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
   * **S8's landform mask**: 1 for every column a bank raised, row-major over the
   * plan's region (`docs/GROUND-UNIFICATION-v0.md` §4.1 S8).
   *
   * *A bank is a landform, and a landform carries nothing.* Nothing may
   * terminate on these columns — no doorstep flight, no stair, no path — which
   * is what {@link terminatesOnBank} answers and what S10's foot gate consults
   * instead of guessing from ground heights. A door that opens onto a bank
   * keeps a plain sill and the physics lint reports it as unreachable, which it
   * honestly is; masonry built up a slope to a door you still cannot use is
   * worse than the missing step.
   *
   * Measured on every world, flag or no flag — it says what the bank *took*,
   * and nothing in this wave reads it, so nothing moves.
   */
  readonly bank: Uint8Array;
  /**
   * **S9's published landings**, one stack per served seam, in the pass's own
   * seam order — see {@link SeamLandings}.
   *
   * Empty on every world no tier stack served, which is every world until
   * {@link SEAM_TIERS} flips or a fixture asks one quarter for `tiered: true`.
   */
  readonly landings: SeamLandings;
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
   * **What the claimed planes' own cut edges became** (R4), in columns.
   *
   * Kept apart from {@link treated}/{@link treatedCut}, which partition the
   * edges of a *quarter*: a plane is not a quarter, its cut side is answered by
   * R4's own three-way rule rather than by §5.2's context table, and folding the
   * two would make the §5 partition stop adding up. The plane's **fill** side is
   * in `treated`, because R3 serves it as an ordinary skirt and it really is one.
   *
   * All zeroes for every document with no served plane, which is every document
   * until {@link GROUND_PLANE_TIE} flips.
   */
  readonly planeEdges: PlaneEdgeTally;
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

/**
 * R4's three answers on the cut side of a claimed plane, plus what deferred.
 *
 * - `absorbed` — the run is under {@link MIN_RETAIN_RUN}, so S7's construction
 *   applies verbatim and nothing of its own is built there;
 * - `revetted` — `tierCountOf(drop) === 1`, so one course stands at the back of
 *   the plane and {@link buildTieredSeam} spends `maxDist = 0` columns of it.
 *   **100 % of the walked evidence** is here: every face the r22 world produced
 *   is drop ≤ 6;
 * - `rock` — everything taller, finished by {@link finishCutFaces} in the hill's
 *   own rock and reported by `LOAM-I417`, because stepping *back into the hill*
 *   is the mirror of {@link buildTieredSeam}'s geometry and is deferred behind
 *   its own measurement (§11.2 R4).
 *
 * There is deliberately no `ramp`: a ramp on the cut side is a
 * post-materialisation cut of a hillside, which deletes the vegetation, the snow
 * and the soil depth standing on it — §0.3a's reason the late family is
 * fill-only, and what `treatmentForEdge` already encodes as
 * `soft = side === "fill" ? "bank" : "rock"`. The quay's own claim asks for a
 * `ramp`; asking is not enough.
 */
export interface PlaneEdgeTally {
  /** Columns of face left to S7's absorption. */
  readonly absorbed: number;
  /** Columns of face held by one revetted course. */
  readonly revetted: number;
  /** Columns of face handed to the hill's own rock. */
  readonly rock: number;
  /** Faces deferred to rock because they ran past one course — `LOAM-I417`. */
  readonly deferredFaces: number;
  /** The deepest of those, in blocks; 0 when none deferred. */
  readonly deepestDeferred: number;
  /** Planes whose edges were measured at all — one `LOAM-I416` each. */
  readonly planes: number;
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
  /** S8's landform mask — see {@link RetainingPassResult.bank}. */
  const bank = new Uint8Array(cells);
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
  let stacks = 0;
  let stackTiers = 0;
  let stackColumns = 0;
  let treadColumns = 0;
  /** Set for any quarter whose seams the tier stack was allowed to serve. */
  let tieredAnywhere = false;
  const stacksByDressing: Record<SeamDressing, number> = { revetted: 0, terraced: 0 };
  const facesByDrop = new Array<number>(RETAIN_MAX + 1).fill(0);
  const treated: Record<SeamTreatment, number> = {
    kerb: 0,
    retaining: 0,
    bank: 0,
    built: 0,
    tiered: 0,
    rock: 0,
  };
  const treatedCut: Record<SeamTreatment, number> = {
    kerb: 0,
    retaining: 0,
    bank: 0,
    built: 0,
    tiered: 0,
    rock: 0,
  };
  const declaredWalls: RetainingDeclaration["walls"][number][] = [];
  /** S9 — see {@link RetainingPassResult.landings}. */
  const landings: SeamLandingStack[] = [];
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
  const planeEdges = {
    absorbed: 0,
    revetted: 0,
    rock: 0,
    deferredFaces: 0,
    deepestDeferred: 0,
    planes: 0,
  };

  // **R1's job list.** A plane whose flag is off is not measured at all: R6's
  // byte-identity is "a document with no `precinct.*` node compiles
  // byte-identically", and a document *with* one compiles byte-identically too
  // until 12F flips the constant.
  // §4 item 21 again: with `GROUND_V1_SEAMS` on, a plane's boundary is a
  // `GroundTransition` like any other and `finishSeams` builds it, so the
  // plane's own job list — and the two-bench coercion `planeSeams` needs to
  // express it — is absorbed with the skirt.
  const planeJobs = (GROUND_V1_SEAMS ? [] : (input.planes ?? []))
    .filter((plane) => plane.tiered ?? GROUND_PLANE_TIE)
    .map((plane) => ({ plane, extent: planeExtent(region, plane) }))
    .filter((job): job is { plane: RetainingPlane; extent: PlaneExtent } => job.extent !== null);

  // **R3 — the fill side is the skirt, unchanged.** Where the plane stands
  // *above* the natural ground its edge is exactly what `skirtSeams` already
  // derives for a quarter's platform, so the plane is handed to the loop below
  // as a one-bench quarter and every rule in it applies verbatim: `edgeContextOf`
  // measures the context, `treatmentForEdge` chooses, and S5's dressing, S7's
  // absorption and S8's bank answer as they do everywhere else. Nothing is
  // duplicated and no branch in that loop knows a plane from a quarter — which
  // is R2's whole point, that the adapter is the only new thing.
  const planeDistricts: RetainingDistrict[] = planeJobs.map(({ plane, extent }) => ({
    nodePath: plane.nodePath,
    bounds: extent.bounds,
    carriageway: new Uint8Array(extent.cells),
    sidewalk: new Uint8Array(extent.cells),
    levels: extent.levels,
    tiered: true,
  }));

  const relevant = [...input.districts.filter((d) => d.levels !== undefined), ...planeDistricts];
  if (relevant.length === 0) {
    return {
      blocks,
      seam,
      walls,
      wallColumns,
      railColumns,
      kerbs,
      banks,
      stacks,
      stacksByDressing,
      stackTiers,
      stackColumns,
      treadColumns,
      built,
      banked,
      bank,
      landings,
      treated,
      treatedCut,
      planeEdges,
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
    //
    // **What the field still gates, after WP-11 wave 11A.** It gates the cut
    // edges below, §5.5's error at the end of the pass, and — until
    // {@link SEAM_TIERS} is flipped — whether the edge's context is allowed to
    // *choose* the treatment. It no longer gates whether the context is
    // *measured*: `plannedEdges` is produced by exactly one form
    // (`layout/forms/hillside.ts`), so gating the measurement on it meant the
    // whole of §5 was off on every `grown`, `grid` and `radial` quarter, and
    // the report could not even say so — `docs/GROUND-UNIFICATION-v0.md`
    // §4.0a M2. Measuring is honest; building is what the flag holds.
    const planned = district.plannedEdges !== undefined;
    /**
     * The served seam, for this quarter (§4.1 S1–S5). The compile-time flag,
     * unless a caller — only ever a test — asked for the flag-on world here.
     */
    const tiered = district.tiered ?? SEAM_TIERS;
    if (tiered) tieredAnywhere = true;
    /** Whether context *chooses* here — the flag's whole job at 11A. */
    const chooses = planned || tiered;
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
    //
    // **Absorbed at WP-G4's flip** (§4 item 21). With `GROUND_V1_SEAMS` on the
    // skirt is not derived here at all: the resolver enumerates the same face —
    // and the ones this construction misses — and `finishSeams` builds it from
    // the transition list, against the *resolved* field rather than against a
    // plan four passes still have to edit. Off, this is the shipped derivation
    // and every world is byte-identical.
    if (!GROUND_V1_SEAMS) {
      jobs.push(...skirtSeams(region, plan, levels, tiered).map((j) => ({ ...j, measured: true })));
    }

    for (const [jobIndex, { seam: record, floorY, measured }] of jobs.entries()) {
      // **§5.2, and the whole of WP-3.** On a quarter no planner drew the
      // treatment is the one `levelSeams` derived from drop and run, exactly as
      // before; on a planned one it is chosen from everything the edge knows —
      // the room beyond it, what is pressing on it, what the terrace has left
      // once the treatment is paid for, and what the district can still afford
      // in masonry. `"replan"` reaches here as a benched bank: the planner
      // settled eight passes upstream and its ladder ran on the composition, so
      // what is left is to put something on the face that is not a cliff.
      //
      // The context is measured on **every** quarter (11A); `chooses` decides
      // whether the measurement is allowed to answer.
      const context = { ...edgeContextOf(region, plan, levels, record, street, occupied, budget), tiered };
      const wanted = chooses ? treatmentForEdge(context) : record.treatment;
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
      // **The drop the answer has to get down**, which for a composite is *not*
      // `record.drop`: benching a seven-block face in six blocks' worth of
      // benches leaves the last block as a step the bench never reaches, and a
      // stack sized for the summary would leave the same one. See `facesOf`.
      const measuredDrop = overCeiling ? Math.max(record.drop, ...faces) : record.drop;
      // **The composite, under S2** (§4.2's last paragraph). Today a composite
      // past the ceiling converts a wall to a benched bank; under the tier stack
      // it converts a wall to a *stack sized for the measured face* — the same
      // measurement spent on a better construction. Past `SEAM_TIER_MAX` tiers
      // even the stack has no answer and the bank stands, benched.
      const stacked =
        tiered && overCeiling && wanted === "retaining" && tierCountOf(measuredDrop) <= SEAM_TIER_MAX;
      const answer: EdgeChoice = stacked ? "tiered" : overCeiling ? "replan" : wanted;
      const treatment: SeamTreatment = answer === "replan" ? "bank" : answer;
      // A face past the tallest wall we build is banked in **benches** rather
      // than ramped 1:1 — §5.2 rule 5's honest downstream answer, and the reason
      // the walked town had sheer platform-to-platform dropoffs mid-town. A
      // composite past the ceiling is the same face by a different arithmetic
      // and gets the same answer.
      // 11A: `context !== null` used to stand here, which meant *only a
      // hillside quarter* ever benched a tall bank. The condition is now the
      // flag — until {@link SEAM_TIERS} flips, a `grown` or `stepped` quarter
      // keeps the 1:1 ramp it shipped with, and the world is byte-identical.
      const bench = (chooses && record.drop > RETAIN_MAX) || overCeiling;
      if (overCeiling && !stacked) compositeBanks++;
      // Accounting, and unconditional since 11A: `treated` says what every
      // seam *became*, on every quarter, which is what makes the
      // `transitions by context (§5)` note below fire outside a site plan.
      treated[treatment] += record.cells.length;
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
          measuredDrop,
          // S8's 1:2 re-key, held by the same flag as everything else in WP-11.
          tiered,
          bank,
        );
        if (ringTargets.length > 0) {
          declaredBanks.push({
            source: `${district.nodePath}#bank@${jobIndex}`,
            columns: ringTargets,
          });
        }
        const short = record.cells.length < MIN_RETAIN_RUN;
        // On a quarter whose context chooses, a bank is a **treatment**,
        // counted in `treated`, and not a wall that failed: `unfaced` answers
        // "why no wall" and the answer there is "because a bank is what this
        // edge wanted".
        if (!chooses) unfaced[short ? "shortRun" : "tallDrop"] += record.cells.length;
        // **S1's retirement, and where it actually happens** (§4.1, §7).
        //
        // The design says `LOAM-W411 RETAINING_REFUSED` is retired and replaced
        // by `LOAM-I412 SEAM_SERVED`, and 11A/11B built that retirement the way
        // every other world change in Part IV was built: as a flag, not as a
        // deletion. So the warning survives on the **untiered** path — where a
        // bank really is a wall that failed, and where the accounting above
        // still counts it as unfaced — and goes dark at 11F, when `SEAM_TIERS`
        // empties that path. Under the flip a bank is S8's deliberate landform,
        // counted in `treated` and named once per quarter by `SEAM_SERVED`:
        // *"fifty-six warnings that say we did the other thing is a report
        // nobody can act on; one note that says 12 walls, 6 stacks, 3 banks, 41
        // absorbed is."* The one refusal a served seam can still report is
        // `LOAM-W413`, and it means something else entirely — a treatment that
        // was chosen and could not be placed.
        if (tiered) continue;
        diagnostics.push(
          warning(
            "RETAINING_REFUSED",
            district.nodePath,
            short
              ? `a seam in "${district.nodePath}" drops ${record.drop} blocks over only ${record.cells.length} column(s), shorter than the ${MIN_RETAIN_RUN} columns a wall needs to read as a wall rather than as a stub, so the two platforms were graded into each other as a bank`
              : bench
                ? `a seam in "${district.nodePath}" drops ${record.drop} blocks over ${record.cells.length} column(s)` +
                  (overCeiling
                    ? ` — a drop a wall is built for, but the face it would have presented falls up to ${measuredDrop} block(s) over a run of ${composite} column(s), which is`
                    : `,`) +
                  ` past the ${RETAIN_MAX_TEXT} a retaining wall is built for, so it was cut back as a benched bank — ${Math.ceil(measuredDrop / BENCH_FACE)} face(s) of ${BENCH_FACE} block(s) with ${BENCH_TREAD} column(s) of soil between, over ${benchedRun(measuredDrop)} column(s) of run`
                : `a seam in "${district.nodePath}" drops ${record.drop} blocks over ${record.cells.length} column(s), past the ${RETAIN_MAX_TEXT} a retaining wall is built for, so the two platforms were graded into each other as a bank`,
            "Raise the quarter's density so the blocks are smaller and each one steps less, or leave it: a bank is a bank, not an unbuilt cliff.",
          ),
        );
        continue;
      }
      if (treatment === "tiered") {
        // **S2, S4 and S5, in one call.** The arithmetic is `tiersOf`'s and the
        // dressing is `seamDressing`'s; everything below the call is accounting.
        // Nothing here can run until {@link SEAM_TIERS} flips (or a test asks
        // for one quarter's flag-on world), which is what makes wave 11B
        // byte-identical.
        const dressing = seamDressing(
          context.pressedShare,
          context.availableRun,
          tierCountOf(measuredDrop),
        );
        const laid = buildTieredSeam({
          region,
          plan,
          driver,
          source: `${district.nodePath}#tiers@${jobIndex}`,
          nodePath: district.nodePath,
          measured,
          levels,
          record,
          drop: measuredDrop,
          dressing,
          street,
          occupied,
          states,
          palette,
          stack,
          blocks,
          seam,
          diagnostics,
          declaredWalls,
        });
        stacks++;
        if (laid.landings.length > 0) {
          landings.push({
            source: `${district.nodePath}#tiers@${jobIndex}`,
            nodePath: district.nodePath,
            landings: laid.landings,
          });
        }
        stacksByDressing[dressing]++;
        stackTiers += laid.tiers.length;
        stackColumns += laid.faceColumns;
        treadColumns += laid.treadColumns;
        railColumns += laid.railColumns;
        // §13.8's histogram, kept by construction: every face of a stack is at
        // most `RETAIN_MAX` because `tiersOf` cannot produce a taller one.
        for (const face of laid.faces) {
          const bucket = face < 1 ? 1 : face > RETAIN_MAX ? RETAIN_MAX : face;
          facesByDrop[bucket] = (facesByDrop[bucket] as number) + 1;
        }
        // S1's one honest refusal: the treatment was chosen and could not be
        // *placed*, because a street, a footprint or water owns the ground.
        if (laid.unplaced > 0 || laid.unsupportedColumns > 0) {
          diagnostics.push(
            warning(
              "SEAM_UNSERVED",
              district.nodePath,
              `a seam in "${district.nodePath}" drops ${measuredDrop} blocks over ${record.cells.length} column(s) and was served by a ${dressing} stack of ${laid.tiers.length} tier(s) (faces ${laid.tiers.map((t) => t.face).join("+")}), but ${laid.unplaced} of those tier(s) found no ground to stand on and ${laid.unsupportedColumns} seam column(s) were left uncovered because the tier beneath them could not be placed — a street, a footprint or water owns the ground the stack would have stepped down onto`,
              "Nothing in the document names the columns directly: widen the block so the stack has room to step down, or lower the quarter's density so the two platforms are closer together.",
            ),
          );
        }
        continue;
      }

      // §5.2 rule 9 was reached, so this edge spends from the quarter's masonry
      // ration. Charged on the seam's own length before the face is walked,
      // because the ration has to be decided in the same order the edges are
      // seen or it is not a ration.
      budget -= record.cells.length;

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

  // --- R4: the cut side of every claimed plane -------------------------------
  //
  // The half no existing producer has. `skirtSeams` only ever claims a
  // neighbour whose ground is *below* the platform top, so the loop above found
  // the plane's fill edges and nothing else; `planeSeams` is its mirror, and
  // between them the plane's boundary is partitioned. Run after the quarters so
  // a plane cut into a hillside a quarter also holds sees that quarter's walls
  // already standing — the same reason this pass runs after the buildings.
  for (const { plane, extent } of planeJobs) {
    planeEdges.planes++;
    const street = new Uint8Array(cells);
    const answers: Record<PlaneEdgeAnswer, number> = { absorbed: 0, revetted: 0, rock: 0 };
    let faces = 0;
    let deferred = 0;
    let deepest = 0;
    for (const [jobIndex, job] of planeSeams(region, plan, extent, plane.planeY).entries()) {
      const record = job.seam;
      const run = record.cells.length;
      faces++;
      answers[job.answer] += run;
      if (job.answer === "absorbed") continue;
      if (job.answer === "rock") {
        // Nothing is built and no level moves; `finishCutFaces` states what the
        // face is made of, and `LOAM-I417` says how much of the world is
        // waiting on the mirror geometry.
        deferred++;
        if (record.drop > deepest) deepest = record.drop;
        continue;
      }
      // **One revetted course at the back of the plane.** `tierCountOf` is 1
      // here by construction, so `tiersOf` returns a single tier, `maxDist` is
      // 0, and the stack's whole footprint is the seam's own columns — the
      // plane pays one column of its own width and not a block more. The
      // dressing is not `seamDressing`'s choice: a one-tier stack has no tread
      // to dress, and `revetted` is what a face held against a hill is.
      const laid = buildTieredSeam({
        region,
        plan,
        driver,
        source: `${plane.nodePath}#plane@${jobIndex}`,
        nodePath: plane.nodePath,
        // Measured from the finished ground, never read from the claim (R2).
        measured: true,
        levels: job.levels,
        record,
        drop: record.drop,
        dressing: "revetted",
        street,
        occupied,
        states,
        palette,
        stack,
        blocks,
        seam,
        diagnostics,
        declaredWalls,
      });
      stacks++;
      tieredAnywhere = true;
      stacksByDressing.revetted++;
      stackTiers += laid.tiers.length;
      stackColumns += laid.faceColumns;
      treadColumns += laid.treadColumns;
      railColumns += laid.railColumns;
      if (laid.landings.length > 0) {
        landings.push({
          source: `${plane.nodePath}#plane@${jobIndex}`,
          nodePath: plane.nodePath,
          landings: laid.landings,
        });
      }
      for (const face of laid.faces) {
        const bucket = face < 1 ? 1 : face > RETAIN_MAX ? RETAIN_MAX : face;
        facesByDrop[bucket] = (facesByDrop[bucket] as number) + 1;
      }
      // S1's one honest refusal, on a plane exactly as on a quarter: the
      // treatment was chosen and could not be *placed*.
      if (laid.unplaced > 0 || laid.unsupportedColumns > 0) {
        diagnostics.push(
          warning(
            "SEAM_UNSERVED",
            plane.nodePath,
            `the plane "${plane.nodePath}" meets ground ${record.drop} block(s) above it over ${run} column(s) and was served by a revetted course, but ${laid.unplaced} tier(s) found no ground to stand on and ${laid.unsupportedColumns} column(s) were left uncovered — a street, a footprint or water owns the ground the course would have stood on`,
            "Nothing in the document names the columns directly: move the plane off the ground something else already owns, or shrink it so its edge falls clear.",
          ),
        );
      }
    }
    planeEdges.absorbed += answers.absorbed;
    planeEdges.revetted += answers.revetted;
    planeEdges.rock += answers.rock;
    planeEdges.deferredFaces += deferred;
    if (deepest > planeEdges.deepestDeferred) planeEdges.deepestDeferred = deepest;

    // **R1's receipt, once per plane.**
    diagnostics.push(
      note(
        "PLANE_EDGE_SERVED",
        plane.nodePath,
        faces === 0
          ? `the plane "${plane.nodePath}" meets no ground standing over it: nothing to serve on the cut side (§11.2 R1)`
          : `the plane "${plane.nodePath}" owes ${faces} cut edge(s), ${answers.absorbed + answers.revetted + answers.rock} column(s) in all: ` +
            `${answers.revetted} revetted, ${answers.absorbed} absorbed, ${answers.rock} faced in the hill's own rock (§11.2 R4)`,
        "No action needed.",
      ),
    );
    if (deferred > 0) {
      diagnostics.push(
        note(
          "PLANE_EDGE_DEFERRED",
          plane.nodePath,
          `${deferred} cut face(s) of the plane "${plane.nodePath}", ${answers.rock} column(s) in all, run past the ${RETAIN_MAX_TEXT} one revetted course is built for — the deepest by ${deepest} block(s) — and were finished in the hill's own rock: the mirror stack that steps back *into* the hill is new geometry and is deferred behind this measurement (§11.2 R4)`,
          "No action needed — rock is an honest answer for a hillside that outruns a revetment.",
        ),
      );
    }
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

  // **S1, reported: what every seam became.** One note, naming the
  // constructions rather than the refusals — the reversal §4.1 S1 asks for, and
  // the answer to a report of fifty-six warnings that all say "we did the other
  // thing". Emitted only where the tier stack is switched on, because until it
  // is, this note and `LOAM-W411` would be two accounts of one seam and the
  // second of them would only move report bytes; `LOAM-W411`'s retirement rides
  // with the flag at 11F (§4.1 S1, §7).
  if (tieredAnywhere && walls + kerbs + banks + built + stacks > 0) {
    const dressed = (Object.keys(stacksByDressing) as SeamDressing[])
      .sort()
      .filter((d) => stacksByDressing[d] > 0)
      .map((d) => `${stacksByDressing[d]} ${d}`)
      .join(", ");
    diagnostics.push(
      note(
        "SEAM_SERVED",
        relevant[0]?.nodePath ?? "world",
        `seams served (S1): ${walls} wall(s), ${stacks} tier stack(s)` +
          (dressed === "" ? "" : ` (${dressed})`) +
          ` over ${stackTiers} face(s) and ${stackColumns} column(s), ${banks} bank(s), ${kerbs} kerb seam(s), and ${built} seam(s) a building already stood on` +
          (treadColumns === 0 ? "" : `; ${treadColumns} column(s) of tread declared as the tier's own ground`),
        "No action needed.",
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
        relevant.find((d) => d.plannedEdges !== undefined)?.nodePath ??
          relevant[0]?.nodePath ??
          "world",
        `transitions by context (§5): ${fill.total + cut.total} edge column(s) — ` +
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
    stacks,
    stacksByDressing,
    stackTiers,
    stackColumns,
    treadColumns,
    built,
    banked,
    bank,
    landings,
    treated,
    treatedCut,
    planeEdges,
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
  /**
   * The claimed planes (R1), if any — **the widened filter**.
   *
   * `finishCutFaces` is the pass that states what an unwalled cut is made of,
   * and its district filter was the only thing standing between it and a plane's
   * own cut face (§11.2 R4). A plane enters as what it is: a one-bench quarter
   * whose platforms are cut into a hillside that is mostly still there, which is
   * `naturalCuts` exactly. Absent, or with {@link GROUND_PLANE_TIE} off, this
   * pass is byte-for-byte the one that shipped.
   */
  readonly planes?: readonly RetainingPlane[];
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
  // The plane jobs, as one-bench quarters that declare `naturalCuts` — R4's
  // "the hill's own rock for everything taller", and the same synthesis
  // `buildRetainingWalls` makes for the fill side.
  const planeDistricts: RetainingDistrict[] = [];
  for (const plane of input.planes ?? []) {
    if (!(plane.tiered ?? GROUND_PLANE_TIE)) continue;
    const extent = planeExtent(region, plane);
    if (extent === null) continue;
    planeDistricts.push({
      nodePath: plane.nodePath,
      bounds: extent.bounds,
      carriageway: new Uint8Array(extent.cells),
      sidewalk: new Uint8Array(extent.cells),
      levels: extent.levels,
      naturalCuts: true,
    });
  }
  const relevant = [...input.districts.filter((d) => d.levels !== undefined), ...planeDistricts];
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
  tiered: boolean,
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
          // **The district's `tiered`, not the compile-time flag.** A skirt is
          // the seam list this pass derives for itself, so it has to be derived
          // at the same setting `levelSeams` used for the district's own seams;
          // otherwise a quarter that asked for the untiered world is handed a
          // `"tiered"` treatment and — because `chooses` is false there, so the
          // record's own word stands — builds a stack it never asked for. Found
          // at 11F, when flipping `SEAM_TIERS` made the two disagree.
          treatment: treatmentForSeam(drop, queue.length, { tiered }),
        },
        floorY,
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the plane edge — `docs/GROUND-UNIFICATION-v0.md` §11.2, R1–R4               */
/* -------------------------------------------------------------------------- */

/** R4's answer for one cut edge of a claimed plane. See {@link PlaneEdgeTally}. */
type PlaneEdgeAnswer = "absorbed" | "revetted" | "rock";

/**
 * A claimed plane, as this pass needs it: the mask, the frame, and the
 * one-bench {@link GroundLevels} R3 hands straight to the skirt.
 */
interface PlaneExtent {
  /** 1 on every column the plane levelled, row-major over the **region**. */
  readonly claimed: Uint8Array;
  /**
   * The plane's own frame, **grown by one column** and clipped to the region.
   *
   * One column, because the whole of R2 happens in the ring immediately outside
   * the plane: the natural ground standing over it is the upper bench, and a
   * bench clipped away by the frame is a bench `levels.at` cannot see.
   */
  readonly bounds: Rect;
  /** `bounds`' column count — what a synthetic quarter's masks are sized to. */
  readonly cells: number;
  /** The plane's runs, as {@link groundLevelsOf} wants them. */
  readonly runs: readonly Rect[];
  /** One bench: the plane, at its own level. */
  readonly levels: GroundLevels;
}

/**
 * A claimed plane's frame and platform field, or `null` when it claimed nothing
 * inside the region.
 */
function planeExtent(region: Region, plane: RetainingPlane): PlaneExtent | null {
  const cells = region.width * region.depth;
  const claimed = new Uint8Array(cells);
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const claim of plane.columns) {
    const k = claim.idx;
    if (k < 0 || k >= cells || claimed[k] === 1) continue;
    claimed[k] = 1;
    any = true;
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (!any) return null;
  const bounds: Rect = {
    x0: Math.max(region.x0, x0 - 1),
    z0: Math.max(region.z0, z0 - 1),
    x1: Math.min(region.x0 + region.width - 1, x1 + 1),
    z1: Math.min(region.z0 + region.depth - 1, z1 + 1),
  };
  // One 1×1 rect per column: `groundLevelsOf` rebuilds the maximal horizontal
  // runs off the *resolved* field anyway, so handing it the coarse form and
  // handing it the merged one give the same `GroundLevels`, and the coarse form
  // cannot get the merge wrong.
  const runs: Rect[] = [];
  for (let k = 0; k < cells; k++) {
    if (claimed[k] !== 1) continue;
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    runs.push({ x0: x, z0: z, x1: x, z1: z });
  }
  const levels = groundLevelsOf(bounds, [{ id: "plane", runs, level: plane.planeY }]);
  if (levels === null) return null;
  return {
    claimed,
    bounds,
    cells: (bounds.x1 - bounds.x0 + 1) * (bounds.z1 - bounds.z0 + 1),
    runs,
    levels,
  };
}

/** One measured cut edge of a plane, with the adapter that lets Part IV build it. */
interface PlaneCutSeam {
  /**
   * **R2's two-bench synthetic `GroundLevels`** — index 0 the claimed plane,
   * index 1 the natural ground standing over *this* face — so that
   * {@link buildTieredSeam} reads `top = levelY[above]` and `floor = top − drop`
   * exactly as it does for a quarter, and every existing function applies
   * unchanged.
   *
   * One per face rather than one per plane, and that is forced by the wire
   * format rather than chosen: a `FormBench` carries **one** level, and two
   * faces of the same quay meet the hill at two different heights. The plane's
   * own bench is identical in every one of them, so index 0 means the same thing
   * everywhere and `record.below` is always 0.
   */
  readonly levels: GroundLevels;
  /** `above = 1`, `below = 0`, and the cells are the plane's own edge columns. */
  readonly seam: LevelSeam;
  readonly answer: PlaneEdgeAnswer;
}

/**
 * The cut edges of a claimed plane — **the seam is measured, never declared**
 * (R2), and the mirror of {@link skirtSeams}.
 *
 * `skirtSeams` claims a neighbour whose ground is *below* the platform top and
 * hands back the neighbour's columns; a plane's cut edge is the same
 * construction run the other way — the neighbour's ground stands *above* the
 * plane, and the columns handed back are the **plane's own**, because that is
 * where a face at the back of a quay stands. Everything else is shared word for
 * word: the two-block floor (*"a one-block lip is a kerb the street pass already
 * copes with"*), the 8-connected grouping (*"a contour on a lattice is a
 * staircase"*), and the **median** height (*"a wall is built for the face it
 * presents, and one column of gully at the end of a run is not that face"*).
 *
 * The one deviation from §11.2's sketched signature: no `occupied`. S1's
 * `open()` inside {@link buildTieredSeam} already owns *"somebody else's ground"*
 * at build time, and subtracting those columns from the **measurement** would
 * move the median off the face the plane actually presents — which is exactly
 * why `skirtSeams` takes no `occupied` either.
 *
 * Pure and order-independent: members are collected in region order, components
 * are flooded from them in that order, and every component's columns are sorted
 * by region index before anything reads them.
 */
function planeSeams(
  region: Region,
  plan: ColumnPlan,
  extent: PlaneExtent,
  planeY: number,
): PlaneCutSeam[] {
  const cells = region.width * region.depth;
  const claimed = extent.claimed;
  /** The tallest dry natural neighbour standing over this plane column; −1 if none. */
  const faceTop = new Int32Array(cells).fill(-1);
  const members: number[] = [];
  /** The natural neighbours of a plane column that qualify, as region indices. */
  const overOf = (k: number): number[] => {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    const out: number[] = [];
    for (const [dx, dz] of NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      const n = index(region, x + dx, z + dz);
      if (claimed[n] === 1) continue;
      // Water is not a face — the seaward edge of a quay is the harbour, and
      // `skirtSeams` skips fluid for the same reason.
      if (plan.fluidKind[n] !== FluidKind.NONE) continue;
      if ((plan.ground[n] as number) < planeY + 2) continue;
      out.push(n);
    }
    return out;
  };
  for (let k = 0; k < cells; k++) {
    if (claimed[k] !== 1) continue;
    const over = overOf(k);
    if (over.length === 0) continue;
    let top = -1;
    for (const n of over) {
      const g = plan.ground[n] as number;
      if (g > top) top = g;
    }
    faceTop[k] = top;
    members.push(k);
  }
  if (members.length === 0) return [];

  const member = new Set(members);
  const seen = new Set<number>();
  const out: PlaneCutSeam[] = [];
  for (const start of members) {
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
        if (!member.has(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    queue.sort((a, b) => a - b);
    const heights = queue.map((k) => faceTop[k] as number).sort((a, b) => a - b);
    const top = heights[heights.length >> 1] as number;
    const drop = top - planeY;
    if (drop < 2) continue;
    // The upper bench: the natural ground standing over *this* face, deduplicated
    // and in region order so the bench is a pure function of the component.
    const overSeen = new Uint8Array(cells);
    const overRuns: Rect[] = [];
    for (const k of queue) {
      for (const n of overOf(k)) {
        if (overSeen[n] === 1) continue;
        overSeen[n] = 1;
        const x = region.x0 + (n % region.width);
        const z = region.z0 + Math.floor(n / region.width);
        overRuns.push({ x0: x, z0: z, x1: x, z1: z });
      }
    }
    overRuns.sort((a, b) => (a.z0 === b.z0 ? a.x0 - b.x0 : a.z0 - b.z0));
    const levels = groundLevelsOf(extent.bounds, [
      { id: "plane", runs: extent.runs, level: planeY },
      { id: "hill", runs: overRuns, level: top },
    ]);
    if (levels === null) continue;
    const run = queue.length;
    // **R4's three-way rule**, decided here so the record's own word and the
    // pass's answer cannot disagree — `treatmentForSeam` is not asked, because
    // its table is §5.2's and §5.2 answers a *quarter's* edge.
    const answer: PlaneEdgeAnswer =
      run < MIN_RETAIN_RUN ? "absorbed" : tierCountOf(drop) === 1 ? "revetted" : "rock";
    out.push({
      levels,
      answer,
      seam: {
        above: 1,
        below: 0,
        cells: queue.map((k) => ({
          x: region.x0 + (k % region.width),
          z: region.z0 + Math.floor(k / region.width),
        })),
        drop,
        treatment: answer === "revetted" ? "tiered" : "rock",
      },
    });
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
  /**
   * **S8 — a bank is a landform** (`docs/GROUND-UNIFICATION-v0.md` §4.1).
   *
   * The unbenched ramp above falls one block per column: a 45° face of raw
   * earth, which from below is the cliff the wall refused to be. Lifted, it
   * falls at {@link APRON_RUN_PER_BLOCK} — 1:2, the apron ratio every pad in
   * the tree already grades at and the ratio {@link bankRun} has always said a
   * bank *reserves* — so the run is `bankRun(drop)` columns and the geometry
   * §5.2 rule 3 granted the bank is the geometry the bank actually spends.
   *
   * *The §13.10.3 ledger note, and it travels with this law.*
   * `docs/GROUND-CONTRACT-v0.md` §13.10.3 says WP-10's bed skirt becomes
   * redundant **if and only if** `gradeBank` is re-keyed from 1:1 to the
   * lift-keyed ratio. This is that re-key — and the skirt is *not* deleted
   * here and must not be, because nothing yet reads `resolved.transitions` to
   * build (§3.2 fact 1), so the skirt's columns are not this function's
   * columns. S8 is the precondition WP-6 was waiting for, not the deletion.
   *
   * Defaults to false, which is the 1:1 ramp every world shipped with, so the
   * world is byte-identical until {@link SEAM_TIERS} flips at 11F.
   */
  lifted = false,
  /**
   * S8's published mask: every column this bank raised, set to 1.
   *
   * *A landform carries nothing.* Nothing may terminate on a bank — no doorstep
   * flight, no stair, no path — and this is the mask that says which columns
   * those are ({@link terminatesOnBank}). It is filled on every world, flag or
   * no flag: it is a *measurement* of what the bank took, and measuring is
   * honest even where nothing consults it yet.
   */
  bank: Uint8Array | undefined = undefined,
  /**
   * **§7.2's natural blend**, as a run: the eased bank spends `easedRun` columns
   * and falls on {@link blendedBankFall}'s quantised curve rather than on the
   * straight 1:2 ramp.
   *
   * Zero — the default, and every caller but `finishSeams`' flag-on half — is
   * the shipped geometry, so nothing moves until `GROUND_V1_SEAMS` flips.
   */
  easedRun = 0,
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
  const eased = easedRun > 0;
  const steps = eased ? easedRun : benched ? benchedRun(drop) : lifted ? bankRun(drop) : drop;
  for (let ring = 0; ring < steps && frontier.length > 0; ring++) {
    // One block per column, or one bench of `BENCH_FACE` blocks every
    // `BENCH_TREAD` columns. The benched profile is clamped one block above the
    // floor rather than cut off at it, so the last face is a kerb and never a
    // step the bench does not reach.
    const target = eased
      ? top - blendedBankFall(ring + 1, drop, steps)
      : benched
        ? Math.max(floor + 1, top - BENCH_FACE * (Math.floor(ring / BENCH_TREAD) + 1))
        : lifted
          ? top - Math.ceil((ring + 1) / APRON_RUN_PER_BLOCK)
          : top - ring - 1;
    // The eased profile reaches the floor at its last ring by construction, so
    // the same stop applies to it: past that column the bank is the ground.
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
          if (bank !== undefined) bank[k] = 1;
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
 * **S8's refusal**: does a claim landing on this column land on a bank?
 *
 * The one question {@link RetainingPassResult.bank} exists to answer, and the
 * one S10's doorstep foot gate asks: a flight, a stair or a path may not
 * *terminate* on a bank face, because a bank is a landform and a landform
 * carries nothing. It is deliberately a predicate over the published mask and
 * not a second measurement of the ground — the whole point of publishing the
 * mask is that nothing downstream has to guess from heights again.
 *
 * Out of region is not a bank: a claim nothing measured is refused for its own
 * reasons, elsewhere.
 */
export function terminatesOnBank(
  bank: Uint8Array,
  region: Region,
  x: number,
  z: number,
): boolean {
  if (!inside(region, x, z)) return false;
  return bank[index(region, x, z)] === 1;
}

/* -------------------------------------------------------------------------- */
/* the tier stack — `docs/GROUND-UNIFICATION-v0.md` §4.1 S2–S5, §4.2           */
/* -------------------------------------------------------------------------- */

/** Everything {@link buildTieredSeam} reads, and the sinks it writes into. */
export interface TieredSeamInput {
  readonly region: Region;
  readonly plan: ColumnPlan;
  readonly driver: GroundDriver;
  /** `<nodePath>#tiers@<job>` — every claim and every sweep is `<source>/<tier>`. */
  readonly source: string;
  readonly nodePath: string;
  /** A skirt is *measured* from the finished ground; a seam is declared. */
  readonly measured: boolean;
  readonly levels: GroundLevels;
  readonly record: LevelSeam;
  /**
   * The fall the stack has to get down, which for a **composite** face is not
   * `record.drop` — see {@link facesOf}. The stack is built for the face it
   * actually presents.
   */
  readonly drop: number;
  readonly dressing: SeamDressing;
  readonly street: Uint8Array;
  readonly occupied: Uint8Array;
  readonly states: RetainingStates;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Sinks, all appended to. */
  readonly blocks: StructureBlock[];
  readonly seam: Uint8Array;
  readonly diagnostics: LoamDiagnostic[];
  readonly declaredWalls: RetainingDeclaration["walls"][number][];
}

/** What one stack came to. */
export interface TieredSeamResult {
  /** The arithmetic {@link tiersOf} answered with, bottom tier first. */
  readonly tiers: readonly SeamTier[];
  readonly dressing: SeamDressing;
  /** The finished face of every course column built, for §13.8's histogram. */
  readonly faces: readonly number[];
  /** Columns of masonry face, over every tier. */
  readonly faceColumns: number;
  readonly railColumns: number;
  /** Columns of tread levelled and declared as the tier's own ground (S4). */
  readonly treadColumns: number;
  /**
   * Tiers whose course found no ground to stand on — the only honest refusal
   * S1 leaves, and what `LOAM-W413 SEAM_UNSERVED` reports.
   */
  readonly unplaced: number;
  /**
   * Seam columns the stack left uncovered because no tier beneath them could be
   * placed — the per-column half of {@link unplaced}, and the number `LOAM-W413`
   * reports (11F). Zero on a stack that stepped all the way down.
   */
  readonly unsupportedColumns: number;
  /**
   * **S9's ground a body can stand on**, bottom landing first: the seam floor,
   * then one entry per tier's tread, then the platform the stack holds.
   *
   * Published rather than re-derived because neither consumer can compute it —
   * see {@link SeamLanding}. Empty when no tier was placed.
   */
  readonly landings: readonly SeamLanding[];
}

/**
 * Build a seam as a **stack of faces** — S2's answer to a drop past
 * {@link RETAIN_MAX}, and §4.2's "one function and one loop; nothing about the
 * sweep changes".
 *
 * ## The geometry, as a section
 *
 * The stack steps **outward** from the seam, into the ground below it, one band
 * per tier. Distance is measured from the seam's own cells — the lower
 * platform's columns that touch the upper one — and never crosses into the
 * platform the stack holds:
 *
 * ```
 *  upper platform, at `top`
 *  ####                       <- tier n−1's course: the seam's own cells, at `top`
 *      \  face n−1
 *       ====####              <- tier n−2's tread, then its course, at `top − face n−1`
 *              \  face n−2
 *               ====####      <- and so on, tallest face at the BOTTOM
 *                      \  face 0
 *                       ----  the lower platform, at `floor`
 * ```
 *
 * A band is `tread` columns wide and its outermost column is the tier's masonry
 * course, so a `revetted` stack ({@link SEAM_SETBACK} = 1) is `n` columns of
 * masonry and reads as one battered wall with setbacks, while a `terraced` one
 * ({@link SEAM_TREAD} = 3) is a course with two columns of the theme's bank
 * earth behind it, which is a tread the flora pass can plant. **One arithmetic,
 * two dressings** — S5, and the only branch on `dressing` in the whole function
 * is the finish at the end.
 *
 * The low-side run this spends is `1 + tread · (n − 1)` columns, which is at
 * most {@link tieredRun}'s `n · (1 + tread)`: the topmost tread is the upper
 * platform the stack holds, and the stack does not have to buy it.
 *
 * ## What it reuses, and what it does not add
 *
 * §4.2 step 2, verbatim: `thickenCourse` → `chainsOf` → `orient` → `sweep`
 * (`RETAINING_PROFILE`) → {@link deepen} → the coping structure block. Every one
 * of those is what the single-wall path above calls and not one of them changes.
 * Two things are per-tier rather than per-seam and both are deliberate:
 *
 * - {@link deepen} is given the **tier's own face**, not the seam's drop, so a
 *   tier is as deep as it is tall and no deeper;
 * - {@link railRun} is called on the **top tier only**. A balustrade on every
 *   tier is a battlement, which is the reading `RETAINING_PROFILE`'s own comment
 *   warns about.
 *
 * S4's other half is the level claim: each band is committed as a `face` plus a
 * `preserve` at the tier's own level, at `retaining.seam`/`retaining.skirt`, so
 * a later pass may not pull the ground out from under a tread — the
 * `unsupported.chain` finding that survived four rounds.
 *
 * Pure and order-independent: the distance field is a row-major BFS, every band
 * is enumerated in region order, and every tie breaks on region index.
 */
export function buildTieredSeam(input: TieredSeamInput): TieredSeamResult {
  const { region, plan, driver, levels, record, street, occupied, states, dressing } = input;
  const cells = region.width * region.depth;
  const top = levels.levelY[record.above] as number;
  const drop = input.drop;
  const floor = top - drop;
  const tiers = tiersOf(drop, dressing);
  if (tiers === "replan" || tiers.length === 0) {
    return {
      tiers: [],
      dressing,
      faces: [],
      faceColumns: 0,
      railColumns: 0,
      treadColumns: 0,
      unplaced: 0,
      unsupportedColumns: 0,
      landings: [],
    };
  }
  const n = tiers.length;
  const tread = (tiers[0] as SeamTier).tread;
  const maxDist = tread * (n - 1);
  const sourceClass = input.measured ? ("retaining.skirt" as const) : ("retaining.seam" as const);

  /** Ground a stack may stand on: not the street's, not a building's, not water. */
  const open = (k: number): boolean =>
    street[k] !== 1 && occupied[k] !== 1 && plan.fluidKind[k] === FluidKind.NONE;

  // --- the distance field, outward from the seam's own cells ----------------
  // 4-connected and row-major, so the bands are a pure function of the field.
  // Never into the platform the stack holds: that ground is already there, and
  // it is the thing being retained.
  const dist = new Int32Array(cells).fill(-1);
  let frontier: number[] = [];
  for (const point of record.cells) {
    if (!inside(region, point.x, point.z)) continue;
    const k = index(region, point.x, point.z);
    if ((dist[k] as number) >= 0) continue;
    dist[k] = 0;
    frontier.push(k);
  }
  frontier.sort((a, b) => a - b);
  for (let d = 1; d <= maxDist && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const k of frontier) {
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const m = index(region, x + dx, z + dz);
        if ((dist[m] as number) >= 0) continue;
        // Never into the platform the stack holds, and never onto a *third*
        // platform: that ground is somebody else's level, and a tier raising it
        // would bury the terrace next door — `edgeContextOf`'s own rule about
        // what `availableRun` may count, one construction over.
        const platform = levels.at(x + dx, z + dz);
        if (platform === record.above) continue;
        if (platform !== NO_PLATFORM && platform !== record.below) continue;
        dist[m] = d;
        next.push(m);
      }
    }
    next.sort((a, b) => a - b);
    frontier = next;
  }

  /** The tier a column at outward distance `d` belongs to; bottom tier is 0. */
  const tierAt = (d: number): number => (d <= 0 ? n - 1 : n - 1 - Math.ceil(d / tread));
  /** The distance at which a tier's masonry course stands: its band's outer edge. */
  const courseDist = (k: number): number => (n - 1 - k) * tread;
  /** Walking level of each tier, a running sum from the floor; the last is `top`. */
  const levelOf: number[] = [];
  {
    let running = floor;
    for (const tier of tiers) {
      running += tier.face;
      levelOf.push(running);
    }
  }

  /**
   * **The waterline is a cap on cutting, never a licence to fill** (§13 T13) —
   * held on the stack, because from WP-G4's flip the stack is what reaches the
   * shore.
   *
   * `open` already refuses a column the water *owns*. That is not the whole
   * rule: a **dry** column 4-adjacent to water may not be levelled below that
   * water's surface either, because the tier's own tread is then a hole in the
   * bank with the sea in the wall of it, and the sea flows into it on the first
   * tick — `LOAM-T110 UNSTABLE_FLUID`, fatal, which is exactly what the flip
   * measured on `platform-waterline`'s shelf town (a derived `retaining.skirt`
   * stack cut 68,-3 from 65 to 60 with the sea standing at 63 one column east).
   * Flag-off nothing derived a transition down to a shore, so the case could not
   * arise; flag-on the resolver enumerates every boundary a settlement made and
   * some of them end at the water.
   *
   * This is the same law the platform election (`waterFloor`, §4 item 29) and
   * the street's W1 floor already carry, stated for the one construction that
   * did not have it. A column refused here is refused the way every other
   * `open` refusal is: no course, `LOAM-W413` where it was a seam column, and
   * the ground it already had.
   */
  const standsAbove = (k: number, y: number): boolean => {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    for (const [dx, dz] of NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      const m = index(region, x + dx, z + dz);
      if (plan.fluidKind[m] === FluidKind.NONE) continue;
      if ((plan.fluidTop[m] as number) > y) return false;
    }
    return true;
  };
  /** {@link open}, at the level the column would actually be levelled to. */
  const openAt = (k: number, d: number): boolean =>
    open(k) && standsAbove(k, levelOf[tierAt(d)] as number);

  const faces: number[] = [];
  let faceColumns = 0;
  let railColumns = 0;
  let treadColumns = 0;
  let unplaced = 0;
  /**
   * **S9's landings**, filled bottom tier first as the one loop below runs.
   *
   * `treads[k]` is tier `k`'s band minus its course — the ground the tier
   * levelled and declared as its own (S4) and the only part of a tier a body
   * stands on. The top tier's is empty by construction (its band *is* its
   * course, at `top`), which is exactly why the platform it holds is published
   * as a landing of its own below.
   */
  const treads: { y: number; columns: number[] }[] = [];
  /** Tier 0's band, so the seam floor's landing can be found beside it. */
  let bottomBand: readonly number[] = [];
  /**
   * **S2 as a hard law, held per column rather than per stack** (11F).
   *
   * `tiersOf` guarantees no tier is *sized* past {@link RETAIN_MAX}, and until
   * the flip nothing tested what the finished masonry did. It does not follow:
   * a tier's face stands on the tread of the tier below it, so where that tier
   * could not be placed — `open` is false because a street, a footprint or
   * water owns the ground one column out — the face above it has nothing to
   * stand on and the sweep runs it down to the natural ground instead. Measured
   * on `site-plan-hillside-steep` at the flip: five seams whose lower tier
   * found two open columns out of thirteen, and eleven columns of a *nine-block
   * single face* of cobblestone standing over the street at the foot — taller
   * than any wall this compiler is allowed to build, and reported as two faces
   * of five and four by §13.8's histogram, which counts the tier's declared
   * face and not the one the world got.
   *
   * So support is carried up the stack: the outermost band stands on the seam
   * floor and is supported wherever it is open; every band above it is
   * supported only where it can be reached, **inside its own band**, from a
   * column 4-adjacent to the supported band below. A seam column left
   * unsupported gets no course at all — it keeps the ground the rest of the
   * pass gives it, which is what it had before Part IV — and is counted in
   * {@link TieredSeamResult.unsupportedColumns} for `LOAM-W413` to report.
   * Nothing here relaxes S1: the honest refusal is *named*, and it is the only
   * thing that is ever left unbuilt.
   */
  const held = new Uint8Array(cells);
  {
    // Outermost first: a column at the far edge of the stack stands on the seam
    // floor, so it is held wherever it is open. Every column inward is held only
    // where the column one step *further out* is held — support crosses the
    // stack, it does not run along it. A flood inside a band would defeat the
    // whole check: thirteen columns of a run are 4-connected to each other, so
    // two footed columns would vouch for eleven that stand on nothing.
    for (let d = maxDist; d >= 0; d--) {
      for (let c = 0; c < cells; c++) {
        if ((dist[c] as number) !== d || !openAt(c, d)) continue;
        if (d === maxDist) {
          held[c] = 1;
          continue;
        }
        const x = region.x0 + (c % region.width);
        const z = region.z0 + Math.floor(c / region.width);
        for (const [dx, dz] of NEIGHBOURS) {
          if (!inside(region, x + dx, z + dz)) continue;
          const m = index(region, x + dx, z + dz);
          if ((dist[m] as number) === d + 1 && held[m] === 1) {
            held[c] = 1;
            break;
          }
        }
      }
    }
  }
  let unsupportedColumns = 0;

  // --- one loop, bottom up (§4.2) -------------------------------------------
  // Bottom up because that is the order the ground is built in: a tier's face
  // stands on the tread of the tier below it, and the sweep reads its datum from
  // the ground as it stands.
  for (let k = 0; k < n; k++) {
    const tier = tiers[k] as SeamTier;
    const y = levelOf[k] as number;
    const band: number[] = [];
    const course = new Uint8Array(cells);
    let courseColumns = 0;
    for (let c = 0; c < cells; c++) {
      const d = dist[c] as number;
      if (d < 0 || tierAt(d) !== k || !openAt(c, d)) continue;
      if (held[c] !== 1) {
        // A column of this tier's band with nothing under it. On the top tier
        // that is a seam column left unserved, which is what W413 reports.
        if (k === n - 1) unsupportedColumns++;
        continue;
      }
      band.push(c);
      if (d === courseDist(k)) {
        course[c] = 1;
        courseColumns++;
      }
    }
    if (courseColumns === 0) {
      // S1's one honest refusal: the treatment was chosen and could not be
      // placed, because somebody else owns every column it would have used.
      unplaced++;
      continue;
    }
    treadColumns += band.length - courseColumns;
    if (k === 0) bottomBand = band;

    // **S4 — the tread is the tier's own ground, and it is declared as such.**
    // One commit per tier, before its course is swept, so the sweep's datum is
    // the tier's own level rather than the ground the hill happened to have.
    const tierSource = `${input.source}/${k}`;
    const claims: GroundClaim[] = band.map((c) => ({ idx: c, y }));
    driver.commit([
      { source: tierSource, sourceClass, kind: "face", columns: claims, transition: "wall" },
      { source: tierSource, sourceClass, kind: "preserve", columns: claims, transition: "none" },
    ]);

    // A one-column course on a diagonal is a sawtooth, for the fifth time in
    // this compiler. Thickened inside the tier's own band and nowhere else.
    thickenCourse(
      region,
      course,
      (idx) =>
        (dist[idx] as number) >= 0 &&
        tierAt(dist[idx] as number) === k &&
        openAt(idx, dist[idx] as number),
      (idx) => cells - idx,
    );
    const columns: number[] = [];
    for (let c = 0; c < cells; c++) if (course[c] === 1) columns.push(c);
    // S9, after the thickening: what is left of the band once the masonry has
    // taken its columns is the tread, and the tread is the landing.
    treads.push({ y, columns: band.filter((c) => course[c] !== 1) });
    // The sweep owns this tier's **course** and nothing else. Not the whole
    // band: the profile's `verge` lane would pave a tread with sidewalk, and a
    // terraced tread is earth you plant, not a pavement.
    const avoid = new Uint8Array(cells).fill(1);
    for (const c of columns) avoid[c] = 0;

    let chainIndex = -1;
    for (const chain of chainsOf(region, columns)) {
      chainIndex++;
      // The verge belongs on the tier's own ground: the platform above for the
      // top tier — which is what the single-wall path means by it — and the
      // tier's own tread for every tier below.
      const path =
        k === n - 1
          ? orient(region, chain, levels, record.above, street, occupied)
          : orient(region, chain, levels, record.above, street, occupied, (x, z) => {
              const c = index(region, x, z);
              return (dist[c] as number) >= 0 && tierAt(dist[c] as number) === k && course[c] !== 1;
            });
      const source = `${tierSource}/${chainIndex}`;
      const result = sweep({
        profile: states.profile,
        path,
        plan,
        palette: input.palette,
        stack: input.stack,
        nodePath: input.nodePath,
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
      input.blocks.push(...result.blocks);
      for (const d of result.diagnostics) {
        if (d.code === TERRAIN_DIAGNOSTICS.SWEEP_FEATURES_PLACED) continue;
        if (d.code === TERRAIN_DIAGNOSTICS.SWEEP_COLUMNS_SKIPPED) continue;
        input.diagnostics.push(d);
      }
      for (let c = 0; c < cells; c++) if (result.claimed[c] === 1) input.seam[c] = 1;
      const declared = [...((result.intent?.columns ?? []) as Iterable<GroundClaim>)];
      if (declared.length > 0) {
        input.declaredWalls.push({ source, measured: input.measured, columns: declared });
      }
      // A tier is as deep as it is tall, and no deeper.
      for (const cell of path) {
        const c = index(region, cell.x, cell.z);
        if (result.claimed[c] !== 1) continue;
        deepen(plan, c, tier.face);
      }
      for (const cell of path) {
        const c = index(region, cell.x, cell.z);
        if (result.claimed[c] !== 1) continue;
        input.blocks.push({
          x: cell.x,
          y: plan.ground[c] as number,
          z: cell.z,
          stateId: states.coping,
        });
        faces.push(tier.face);
        faceColumns++;
      }
      // The parapet, on the **top tier only**: a balustrade on every tier is a
      // battlement (§4.2 step 4).
      if (k === n - 1) {
        railColumns += railRun(
          region,
          plan,
          path,
          result.claimed,
          levels,
          record.above,
          tier.face,
          street,
          states,
          input.blocks,
        );
      }
      for (const feature of result.features) {
        if (feature.id !== "weep") continue;
        const wy = feature.at.y - 2;
        if (!inside(region, feature.at.x, feature.at.z)) continue;
        const c = index(region, feature.at.x, feature.at.z);
        if (result.claimed[c] !== 1) continue;
        if (wy <= (plan.ground[c] as number) - tier.face) continue;
        input.blocks.push({ x: feature.at.x, y: wy, z: feature.at.z, stateId: states.weep });
      }
    }

    // **S5's dressing, and the only branch on it.** A terraced tread is the
    // theme's bank earth to the depth of the face below it — `gradeBank`'s own
    // finish, one construction over — and its *surface* is untouched, which is
    // what makes it ground you plant rather than a build.
    if (dressing === "terraced") {
      for (const c of band) {
        if (course[c] === 1) continue;
        plan.subsurface[c] = states.bank;
        plan.soil[c] = Math.min(255, Math.max(plan.soil[c] as number, tier.face));
      }
    }
  }

  // --- S9's landings, bottom first ------------------------------------------
  // Neither end tier owns the ground at its own end: tier 0 stands *on* the
  // seam floor and the top tier's tread *is* the platform it holds. Both are
  // published beside the treads so a flight is derived from floor to platform
  // without knowing how many faces are in between.
  const point = (c: number): Point2 => ({
    x: region.x0 + (c % region.width),
    z: region.z0 + Math.floor(c / region.width),
  });
  /** Columns of `platform`, 4-adjacent to `beside`, row-major and deduplicated. */
  const rimOf = (beside: readonly Point2[], platform: number): Point2[] => {
    const seen = new Uint8Array(cells);
    for (const p of beside) {
      if (!inside(region, p.x, p.z)) continue;
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inside(region, p.x + dx, p.z + dz)) continue;
        const m = index(region, p.x + dx, p.z + dz);
        if (seen[m] === 1) continue;
        // Never a column the stack itself took: a landing is ground beside the
        // construction, not the construction.
        if ((dist[m] as number) >= 0) continue;
        if (levels.at(p.x + dx, p.z + dz) !== platform) continue;
        seen[m] = 1;
      }
    }
    const out: Point2[] = [];
    for (let c = 0; c < cells; c++) if (seen[c] === 1) out.push(point(c));
    return out;
  };
  const landings: SeamLanding[] = [];
  if (treads.length > 0) {
    landings.push({ y: floor, columns: rimOf(bottomBand.map(point), record.below) });
    for (const tread of treads) {
      if (tread.columns.length === 0) continue;
      landings.push({ y: tread.y, columns: tread.columns.map(point) });
    }
    landings.push({ y: top, columns: rimOf(record.cells, record.above) });
  }

  return {
    tiers,
    dressing,
    faces,
    faceColumns,
    railColumns,
    treadColumns,
    unplaced,
    unsupportedColumns,
    landings,
  };
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
  /**
   * What counts as "the ground this course holds", when it is not the upper
   * platform.
   *
   * A tier of a stack ({@link buildTieredSeam}) holds its own tread rather than
   * the platform at the top of the seam, so the side the verge belongs on is a
   * different set of columns. Omitted — which is every call the single-wall path
   * makes — the test is the one it always was, character for character, so the
   * shipped world does not move.
   */
  holds?: (x: number, z: number) => boolean,
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
    const own =
      holds === undefined ? levels.at(column.x, column.z) === above : holds(column.x, column.z);
    if (own && free) onPlatform++;
    else off++;
  }
  return off > onPlatform ? [...path].reverse() : path;
}

/* -------------------------------------------------------------------------- */
/* WP-G4 — `finishSeams`, the terminal transition consumer                     */
/* -------------------------------------------------------------------------- */

/** What {@link finishSeams} reads. */
export interface SeamFinishInput {
  readonly plan: ColumnPlan;
  /** The pipeline's one driver — `finish()` is the resolved field §3.1 measures. */
  readonly ground: GroundDriver;
  /** The seated buildings' footprints, for §3.1's `built` classification. */
  readonly footprints: readonly Rect[];
  /**
   * The retaining pass's served-seam mask: the columns it reports standing on.
   *
   * The only built-set any pass publishes at HEAD. WP-G5 gives every builder a
   * built-or-refused report and this argument becomes that union.
   */
  readonly seam?: Uint8Array;
  /** The node the `LOAM-I497` note is attributed to. */
  readonly nodePath?: string;
  /**
   * The palette and stack the builders resolve their masonry from.
   *
   * Optional for the reason the flag is: with `GROUND_V1_SEAMS` off this pass
   * builds nothing and needs neither, and every test that only wants the
   * derivation may go on calling it with three arguments.
   */
  readonly palette?: Palette;
  readonly stack?: PrismarineStack;
  /** Sink for the masonry the flag-on half emits. Appended to, never read. */
  readonly blocks?: StructureBlock[];
  /** The quarters, so §3.4's `LOAM-W413` can be aggregated per quarter. */
  readonly quarters?: readonly { readonly nodePath: string; readonly bounds: Rect }[];
}

/** What the flag-on half built, per §3.3's table. */
export interface SeamBuildTally {
  /** Transitions the complement walk actually put something on. */
  readonly built: number;
  /** …by the treatment that built them, ascending by treatment. */
  readonly byTreatment: Readonly<Record<string, number>>;
  /** Runs under `MIN_RETAIN_RUN`, absorbed by S7 rather than built or refused. */
  readonly absorbed: number;
  /** Transitions refused with `LOAM-W413`, per §3.3's refusal column. */
  readonly refused: number;
  /** …the same count keyed by quarter, which is the budget §6/WP-G4 sets. */
  readonly refusalsByQuarter: Readonly<Record<string, number>>;
  /** Columns of masonry face, graded bank and painted rock, respectively. */
  readonly faceColumns: number;
  readonly bankColumns: number;
  readonly rockColumns: number;
  /** …of the banks, the ones §7.2's eased profile shaped. */
  readonly blended: number;
}

/** The `LOAM-I497 GROUND_STAGE` numbers, as a value a test can assert on. */
export interface GroundStageCounts {
  /** Intents declared, by `GroundSourceClass`, ascending by class name. */
  readonly intentsByClass: Readonly<Record<string, number>>;
  readonly intents: number;
  /** Resolves this compile performed that the stage can see. Five at WP-G6. */
  readonly resolves: number;
  /** Columns the resolve moved off the baseline. */
  readonly moved: number;
  /** Derived transitions by §3.1's refined treatment, ascending by treatment. */
  readonly byTreatment: Readonly<Record<string, number>>;
  readonly transitions: number;
  /** …of them, the ones no existing pass reports building. */
  readonly wouldBuild: number;
  /** §3.2's accounting, for the invariant's own report. */
  readonly coverage: SeamCoverage;
}

export interface SeamFinishResult {
  readonly transitions: readonly DerivedSeam[];
  readonly stage: GroundStageCounts;
  readonly diagnostics: readonly LoamDiagnostic[];
  /** What the flag-on half built; all zeroes with `GROUND_V1_SEAMS` off. */
  readonly tally: SeamBuildTally;
  /** The masonry, for the caller to lay. Empty with the flag off. */
  readonly blocks: readonly StructureBlock[];
}

/**
 * The terminal transition consumer — `docs/GROUND-CONTRACT-v1.md` §3.3, §6/WP-G4.
 *
 * > `finishSeams` replaces `finishCutFaces` and is the **terminal** transition
 * > builder: it walks `resolved.transitions`, skips every one another pass
 * > reported built, and builds the rest.
 *
 * **This is the flag-off half, and it builds nothing.** With
 * {@link GROUND_V1_SEAMS} off it derives — §3.1's three refinements over the
 * resolved field — checks §3.2's coverage invariant, and reports: `LOAM-E495`
 * where a boundary is unaccounted for, and `LOAM-I497 GROUND_STAGE` with the
 * counts. Every world is byte-identical, and the risky question ("does the
 * resolver enumerate the same seams `levelSeams`/`skirtSeams` do, plus the ones
 * they miss?") is answered by a diff rather than by a walk. {@link finishCutFaces}
 * is untouched; absorbing it is the flag-on half.
 *
 * The invariant runs **here**, not inside `resolveGround`: the resolver is
 * called on every prefix of the declaration set (`ground-driver.ts`'s `commit`),
 * and a prefix is *supposed* to have boundaries the passes after it will
 * account for. §3.2 is a statement about the finished field, so it is checked
 * where the field is finished — which is also why it runs on every settlement
 * compile regardless of the flag.
 */
export function finishSeams(input: SeamFinishInput): SeamFinishResult {
  const plan = input.plan;
  const region = plan.region;
  const resolved = input.ground.finish();
  const intents = input.ground.intents;
  const occupied = occupancyOf(region, input.footprints);

  const derivation = deriveGroundSeams({
    region,
    ground: resolved.ground,
    owner: resolved.owner,
    fluidKind: resolved.fluidKind,
    intents,
    occupied,
  });

  const seamMask = input.seam;
  let wouldBuild = 0;
  const byTreatment = new Map<string, number>();
  /** §3.3's complement: the transitions no other pass reports having built. */
  const complement: DerivedSeam[] = [];
  for (const t of derivation.transitions) {
    byTreatment.set(t.refined, (byTreatment.get(t.refined) ?? 0) + 1);
    if (!reportedBuilt(t, seamMask)) {
      wouldBuild++;
      complement.push(t);
    }
  }

  // **WP-G4's flag-on half — §3.3, the terminal builder.** Off, the block below
  // does not run and the world is the shipped one; on, every transition the
  // complement holds is built through the construction §3.3's table names for
  // its treatment, and a refusal is `LOAM-W413 SEAM_UNSERVED`.
  const built: StructureBlock[] = input.blocks ?? [];
  const buildDiagnostics: LoamDiagnostic[] = [];
  let tally: SeamBuildTally = {
    built: 0,
    byTreatment: {},
    absorbed: 0,
    refused: 0,
    refusalsByQuarter: {},
    faceColumns: 0,
    bankColumns: 0,
    rockColumns: 0,
    blended: 0,
  };
  if (GROUND_V1_SEAMS && input.palette !== undefined && input.stack !== undefined) {
    tally = buildDerivedSeams({
      region,
      plan,
      driver: input.ground,
      resolved,
      intents,
      occupied,
      transitions: complement,
      states: resolveStates(input.palette, input.stack),
      palette: input.palette,
      stack: input.stack,
      blocks: built,
      seam: seamMask ?? new Uint8Array(region.width * region.depth),
      diagnostics: buildDiagnostics,
      nodePath: input.nodePath ?? "world",
      quarters: input.quarters ?? [],
    });
  }

  const intentsByClass = new Map<string, number>();
  for (const intent of intents) {
    intentsByClass.set(intent.sourceClass, (intentsByClass.get(intent.sourceClass) ?? 0) + 1);
  }
  let moved = 0;
  for (let k = 0; k < resolved.moved.length; k++) if (resolved.moved[k] === 1) moved++;

  const stage: GroundStageCounts = {
    intentsByClass: sortedCounts(intentsByClass),
    intents: intents.length,
    // One: the `finish()` above. WP-G6's five tier resolves are what this
    // number becomes, and `ground-stage.test.ts` is where it is asserted.
    resolves: 1,
    moved,
    byTreatment: sortedCounts(byTreatment),
    transitions: derivation.transitions.length,
    wouldBuild,
    coverage: derivation.coverage,
  };

  const diagnostics: LoamDiagnostic[] = [...derivation.diagnostics];
  diagnostics.push(
    note(
      "GROUND_STAGE",
      input.nodePath ?? "",
      `ground stage: ${stage.intents} intent(s) (${describe(stage.intentsByClass)}), ` +
        `${stage.resolves} resolve(s), ${stage.moved} column(s) moved, ` +
        `${stage.transitions} transition(s) (${describe(stage.byTreatment)}), ` +
        `${stage.wouldBuild} of them unbuilt by any pass; ` +
        `coverage ${derivation.coverage.pairs} boundary pair(s) — ` +
        `${derivation.coverage.transition} in a transition, ` +
        `${derivation.coverage.request} suppressed by request, ` +
        `${derivation.coverage.face} by a face, ` +
        `${derivation.coverage.kerb} a kerb, ` +
        `${derivation.coverage.uncovered} uncovered ` +
        `(excluded: ${derivation.coverage.natural} natural, ${derivation.coverage.water} wet)`,
      "Nothing — this is the stage's own golden, and it is a note so that a " +
        "count moving is visible in a diff before a block moves in a world.",
    ),
  );
  if (tally.built + tally.refused > 0) {
    diagnostics.push(
      note(
        "SEAM_SERVED",
        input.nodePath ?? "world",
        `terminal seam builder (§3.3): ${tally.built} derived transition(s) built ` +
          `(${describe(tally.byTreatment)}) over ${tally.faceColumns} column(s) of face, ` +
          `${tally.bankColumns} of graded bank (${tally.blended} eased under §7.2's ` +
          `natural blend) and ${tally.rockColumns} finished in the hill's own rock; ` +
          `${tally.absorbed} absorbed under S7, ${tally.refused} refused`,
        "No action needed.",
      ),
    );
  }
  diagnostics.push(...buildDiagnostics);
  return { transitions: derivation.transitions, stage, diagnostics, tally, blocks: built };
}

/* -------------------------------------------------------------------------- */
/* §3.3 — the complement, built                                                */
/* -------------------------------------------------------------------------- */

/** Everything {@link buildDerivedSeams} reads, and the sinks it appends to. */
interface DerivedBuildInput {
  readonly region: Region;
  readonly plan: ColumnPlan;
  readonly driver: GroundDriver;
  readonly resolved: ResolvedGround;
  readonly intents: readonly GroundIntent[];
  readonly occupied: Uint8Array;
  readonly transitions: readonly DerivedSeam[];
  readonly states: RetainingStates;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  readonly blocks: StructureBlock[];
  readonly seam: Uint8Array;
  readonly diagnostics: LoamDiagnostic[];
  readonly nodePath: string;
  /**
   * The quarters, for §3.4's "aggregated per quarter" — a refusal is attributed
   * to the quarter whose bounds hold the run's first cell, and to the root when
   * the run falls outside every quarter (a plane's edge, or open country).
   */
  readonly quarters: readonly { readonly nodePath: string; readonly bounds: Rect }[];
}

/**
 * The classes whose ground a seam construction may not stand on — the owner
 * map's answer to `buildRetainingWalls`' hand-built `street` mask.
 *
 * §3.3's refusal column names three owners a course or a bank may not take: a
 * street, a footprint, or water. The first is this set, the second is
 * `occupied`, and the third is `fluidKind`. Reading it off the resolved owner
 * map rather than off a district's `carriageway`/`sidewalk` rasters is the whole
 * of "`EdgeContext` stops being gated on `plannedEdges`", applied to the build
 * half: every street in the world answers, including the ones no site planner
 * drew.
 */
const SEAM_BLOCKING_CLASSES: ReadonlySet<string> = new Set<string>([
  "street.network",
  "street.sidewalk",
  "road.network",
  "sweep.run",
  "doorstep.landing",
]);

/**
 * **§3.3, executed** — every derived transition no other pass built, built.
 *
 * One dispatch, five rows, and not one new construction: `buildTieredSeam` for a
 * face (`retaining` and `tiered` alike — a single face *is* a one-tier stack, and
 * routing both through one builder is what stops the wall path and the stack path
 * from being two answers to one question), `gradeBank` for a ramp, `faceCuts` for
 * the hill's own rock, and nothing at all for a kerb or a built face, which
 * {@link reportedBuilt} has already accounted for.
 *
 * The adapter is the only new thing, and it is the one `planeSeams` already
 * writes down: a **two-bench synthetic `GroundLevels`** — index 0 the run's own
 * columns at `belowY`, index 1 the upper side at `aboveY` — so that every
 * existing builder reads `top = levelY[record.above]`, `floor = top − drop` and
 * `levels.at` exactly as it does for a quarter. §4 item 21's absorption is
 * therefore a *move*, not a deletion: the coercion stops being `planeSeams`'
 * private trick and becomes the one adapter between the resolver's list and the
 * constructions.
 *
 * Deterministic: the transition list is already sorted row-major by first cell,
 * every synthetic bench is built in region order, and nothing here reads a clock
 * or an RNG.
 */
function buildDerivedSeams(input: DerivedBuildInput): SeamBuildTally {
  const { region, plan, driver, resolved, intents, occupied, states, seam } = input;
  const cells = region.width * region.depth;

  // The street mask, off the owner map (§3.3's refusal column).
  const street = new Uint8Array(cells);
  for (let k = 0; k < cells; k++) {
    const o = resolved.owner[k] as number;
    if (o === -1) continue;
    if (SEAM_BLOCKING_CLASSES.has((intents[o] as GroundIntent).sourceClass)) street[k] = 1;
  }

  const byTreatment = new Map<string, number>();
  let builtCount = 0;
  let refused = 0;
  let faceColumns = 0;
  let bankColumns = 0;
  let rockColumns = 0;
  let blended = 0;
  let absorbed = 0;
  const declaredWalls: RetainingDeclaration["walls"][number][] = [];
  const bankMask = new Uint8Array(cells);
  /** §3.4's aggregation: quarter → the refusals inside it. */
  const refusals = new Map<string, string[]>();

  for (const [jobIndex, t] of input.transitions.entries()) {
    if (t.refined === "kerb" || t.refined === "built") continue;
    // **T9, and it is not a refusal.** "A run shorter than `MIN_RETAIN_RUN` is
    // absorbed, never graded" (§5's pinned taste, S7): a two-block drop over one
    // column is a step in the ground, not a construction that failed to fit, and
    // reporting it as `LOAM-W413` would bury the refusals that mean something
    // under a thousand that do not — the `SWEEP_FEATURES_PLACED` lesson, and the
    // reason §6/WP-G4 budgets five per quarter rather than five hundred.
    if (t.cells.length < MIN_RETAIN_RUN) {
      absorbed++;
      continue;
    }
    const adapted = adaptSeam(region, t, resolved);
    if (adapted === null) continue;
    const { levels, record } = adapted;
    const source = `${input.nodePath}#seam@${jobIndex}`;

    if (t.refined === "rock") {
      // **R4, whole** — and R4 has two answers, not one. The hill's own rock is
      // what a cut against *natural* ground is made of; a cut whose low side a
      // claim owns is a plane or a bench standing against the hill, and
      // `docs/GROUND-UNIFICATION-v0.md` §11.2 R4 answers that with **one revetted
      // course** wherever `tierCountOf(drop) === 1` — the construction
      // `planeSeams` used to reach through its own job list and which this stage
      // absorbed (§4 item 21). Absorbing a pass may not lose its second answer,
      // so the condition is R4's verbatim: one course, `revetted`, and rock for
      // everything taller (the mirror geometry §11.2 defers by name).
      const ownedLow = (resolved.owner[t.cells[0] as number] as number) !== -1;
      if (ownedLow && t.cells.length >= MIN_RETAIN_RUN && tierCountOf(t.drop) === 1) {
        const laid = buildTieredSeam({
          region,
          plan,
          driver,
          source,
          nodePath: input.nodePath,
          measured: true,
          levels,
          record: { ...record, treatment: "tiered" },
          drop: t.drop,
          dressing: "revetted",
          street,
          occupied,
          states,
          palette: input.palette,
          stack: input.stack,
          blocks: input.blocks,
          seam,
          diagnostics: input.diagnostics,
          declaredWalls,
        });
        faceColumns += laid.faceColumns;
        if (laid.faceColumns > 0) {
          builtCount++;
          byTreatment.set("revetted", (byTreatment.get("revetted") ?? 0) + 1);
          continue;
        }
      }
      // Materials only: the face is the hill, and what it is made of is rock.
      rockColumns += faceCuts(region, plan, levels, states, seam, street, occupied, true);
      builtCount++;
      byTreatment.set("rock", (byTreatment.get("rock") ?? 0) + 1);
      continue;
    }

    if (t.refined === "bank") {
      // §7.2's blend where the boundary is unpressed and the ground affords it;
      // S8's 1:2 ramp everywhere else. One arithmetic either way — `gradeBank`
      // is the only thing that grades.
      const easedRun = t.blendRun;
      if (easedRun === 0 && t.availableRun < bankRun(t.drop) && t.side === "fill") {
        // **§3.3's refusal column, in full**: "`LOAM-W413` where
        // `availableRun < bankRun(drop)` — **and S5 then re-dresses the stack
        // `revetted`, which always fits**." The re-dressing is the sentence that
        // matters: a bank with no room is not a hole in the ground, it is a face,
        // and a revetted stack spends `SEAM_SETBACK` columns rather than `2·drop`.
        // Only where even that finds no ground to stand on is anything refused.
        if (tierCountOf(t.drop) <= SEAM_TIER_MAX) {
          const laid = buildTieredSeam({
            region,
            plan,
            driver,
            source,
            nodePath: input.nodePath,
            measured: true,
            levels,
            record: { ...record, treatment: "tiered" },
            drop: t.drop,
            dressing: "revetted",
            street,
            occupied,
            states,
            palette: input.palette,
            stack: input.stack,
            blocks: input.blocks,
            seam,
            diagnostics: input.diagnostics,
            declaredWalls,
          });
          faceColumns += laid.faceColumns;
          if (laid.faceColumns > 0) {
            builtCount++;
            byTreatment.set("revetted", (byTreatment.get("revetted") ?? 0) + 1);
            continue;
          }
        }
        refused++;
        refuse(
          refusals,
          quarterOf(input, t.cells[0] as number),
          `a derived bank at ${describeCell(region, t.cells[0] as number)} falls ${t.drop} block(s) over ${t.cells.length} column(s), but only ${t.availableRun} column(s) of open ground stand beyond it where a 1:2 bank wants ${bankRun(t.drop)}, and the revetted stack S5 re-dresses it as found no ground to stand on either`,
        );
        continue;
      }
      const ringTargets: GroundClaim[] = [];
      const raised = gradeBank(
        region,
        plan,
        driver,
        source,
        levels,
        record,
        t.belowY,
        street,
        occupied,
        states,
        ringTargets,
        false,
        t.drop,
        true,
        bankMask,
        easedRun,
      );
      bankColumns += raised;
      if (easedRun > 0) blended++;
      if (raised > 0) {
        builtCount++;
        byTreatment.set("bank", (byTreatment.get("bank") ?? 0) + 1);
      }
      continue;
    }

    // `retaining` and `tiered`: one face or several, one builder.
    const dressing = seamDressing(t.pressedShare, t.availableRun, tierCountOf(t.drop));
    const laid = buildTieredSeam({
      region,
      plan,
      driver,
      source,
      nodePath: input.nodePath,
      // Measured from the resolved field, never read from a claim (R2, §3.1.1).
      measured: true,
      levels,
      record,
      drop: t.drop,
      dressing,
      street,
      occupied,
      states,
      palette: input.palette,
      stack: input.stack,
      blocks: input.blocks,
      seam,
      diagnostics: input.diagnostics,
      declaredWalls,
    });
    faceColumns += laid.faceColumns;
    if (laid.faceColumns > 0) {
      builtCount++;
      byTreatment.set(t.refined, (byTreatment.get(t.refined) ?? 0) + 1);
    }
    if (laid.unplaced > 0 || laid.unsupportedColumns > 0 || laid.faceColumns === 0) {
      refused++;
      refuse(
        refusals,
        quarterOf(input, t.cells[0] as number),
        `a derived ${t.refined} seam at ${describeCell(region, t.cells[0] as number)} drops ${t.drop} block(s) over ${t.cells.length} column(s) and was served by a ${dressing} stack of ${laid.tiers.length} tier(s), but ${laid.unplaced} tier(s) found no ground to stand on and ${laid.unsupportedColumns} column(s) were left uncovered — a street, a footprint or water owns the ground the course needed`,
      );
    }
  }

  for (const quarter of [...refusals.keys()].sort()) {
    const rows = refusals.get(quarter) as string[];
    input.diagnostics.push(
      warning(
        "SEAM_UNSERVED",
        quarter,
        `${rows.length} derived transition(s) in "${quarter}" were chosen and could not be placed: ` +
          rows.slice(0, 3).join("; ") +
          (rows.length > 3 ? `; and ${rows.length - 3} more` : ""),
        "Nothing in the document names the columns directly: widen the block so the construction has room, or lower the quarter's density so the two levels are closer together.",
      ),
    );
  }

  return {
    built: builtCount,
    byTreatment: sortedCounts(byTreatment),
    absorbed,
    refusalsByQuarter: Object.fromEntries([...refusals.keys()].sort().map((q) => [q, (refusals.get(q) as string[]).length])),
    refused,
    faceColumns,
    bankColumns,
    rockColumns,
    blended,
  };
}

/** `x,z` for a region index — the witness a refusal names. */
function describeCell(region: Region, k: number): string {
  return `${region.x0 + (k % region.width)},${region.z0 + Math.floor(k / region.width)}`;
}

/**
 * §3.3's refusal, **aggregated per quarter** the way §3.4's lint table asks.
 *
 * `LOAM-W413 SEAM_UNSERVED` and no new code: §7.5 allocates `W494` to WP-G6's
 * non-planar seat and nothing else to this stage, and §3.3's table names W413
 * for exactly this — a treatment that was chosen and could not be placed.
 *
 * One warning per quarter, with a count and three witnesses, rather than one per
 * transition: §3.4 says "aggregated per quarter", and the `SEAM_SERVED` lesson
 * says why — fifty warnings that each name one column is a report nobody acts
 * on, and the budget §6/WP-G4 sets (five per quarter) is only readable if the
 * report is keyed the way the budget is.
 */
function refuse(rows: Map<string, string[]>, quarter: string, message: string): void {
  let list = rows.get(quarter);
  if (list === undefined) {
    list = [];
    rows.set(quarter, list);
  }
  list.push(message);
}

/** The quarter a run belongs to — its first cell's, or the root's. */
function quarterOf(input: DerivedBuildInput, cell: number): string {
  const region = input.region;
  const x = region.x0 + (cell % region.width);
  const z = region.z0 + Math.floor(cell / region.width);
  for (const q of input.quarters) {
    const b = q.bounds;
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return q.nodePath;
  }
  return input.nodePath;
}

/**
 * One derived transition, as the existing builders want it — §4 item 21's
 * coercion, moved from `planeSeams` to the one place it belongs.
 *
 * `null` where the upper side presents no column inside the region, which is a
 * run against the region edge and has no face to build.
 */
function adaptSeam(
  region: Region,
  t: DerivedSeam,
  resolved: ResolvedGround,
): { readonly levels: GroundLevels; readonly record: LevelSeam } | null {
  const cells = region.width * region.depth;
  const lowRuns: Rect[] = [];
  const points: Point2[] = [];
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  const grow = (x: number, z: number): void => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  };
  for (const k of t.cells) {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    lowRuns.push({ x0: x, z0: z, x1: x, z1: z });
    points.push({ x, z });
    grow(x, z);
  }
  // The upper bench: the 4-neighbours of the run the *upper side owns and stands
  // over*, in region order and deduplicated, exactly as `planeSeams` builds its
  // `hill`. The owner test is not decoration — a neighbour that is merely higher
  // is the next column of the same hillside, and calling it the bench would tell
  // every builder the face is somewhere it is not.
  const inRun = new Uint8Array(cells);
  for (const k of t.cells) inRun[k] = 1;
  const seen = new Uint8Array(cells);
  const highRuns: Rect[] = [];
  for (const k of t.cells) {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    const y = resolved.ground[k] as number;
    for (const [dx, dz] of NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      const n = index(region, x + dx, z + dz);
      if (seen[n] === 1 || inRun[n] === 1) continue;
      if ((resolved.owner[n] as number) !== t.above) continue;
      if ((resolved.ground[n] as number) <= y) continue;
      seen[n] = 1;
      highRuns.push({ x0: x + dx, z0: z + dz, x1: x + dx, z1: z + dz });
      grow(x + dx, z + dz);
    }
  }
  highRuns.sort((a, b) => (a.z0 === b.z0 ? a.x0 - b.x0 : a.z0 - b.z0));
  if (highRuns.length === 0) return null;
  // The frame is the run plus everything a construction may spend beside it: a
  // stack steps `tieredRun` columns out and a bank grades `blendedBankRun`, and
  // a bench clipped away by the frame is a bench `levels.at` cannot see.
  const reach = Math.max(t.blendRun, bankRun(t.drop), tieredRun(SEAM_TIER_MAX, "terraced")) + 1;
  const bounds: Rect = {
    x0: Math.max(region.x0, x0 - reach),
    z0: Math.max(region.z0, z0 - reach),
    x1: Math.min(region.x0 + region.width - 1, x1 + reach),
    z1: Math.min(region.z0 + region.depth - 1, z1 + reach),
  };
  const levels = groundLevelsOf(bounds, [
    { id: "below", runs: lowRuns, level: t.belowY },
    { id: "above", runs: highRuns, level: t.aboveY },
  ]);
  if (levels === null) return null;
  return {
    levels,
    record: {
      above: 1,
      below: 0,
      cells: points,
      drop: t.drop,
      treatment: t.refined,
    },
  };
}

/**
 * Whether some pass already reports building this transition (§3.3's built-set).
 *
 * At HEAD only two builders report anything, so only two answers are available
 * and both are stated here rather than guessed at the call site:
 *
 * - a `kerb` is a course of material the streetscape lays and §3.3's table says
 *   it is *never* refused, so a kerb is always served;
 * - a run the retaining pass stood on is in its `seam` mask. **A majority of the
 *   run**, not a single column: a wall clipping the end of a hundred-column
 *   contour has not served it, which is the same argument `BUILT_SHARE` makes
 *   about a building clipping a face.
 *
 * Everything else is what `finishSeams` would have to build, and that count is
 * this stage's headline number.
 */
function reportedBuilt(t: DerivedSeam, seam: Uint8Array | undefined): boolean {
  if (t.refined === "kerb") return true;
  if (t.refined === "built" && t.builtShare >= BUILT_SHARE) return true;
  if (seam === undefined) return false;
  let served = 0;
  for (const k of t.cells) if (seam[k] === 1) served++;
  return served * 2 >= t.cells.length;
}

/** A count map as a plain object, ascending by key, so the note is a golden. */
function sortedCounts(counts: Map<string, number>): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) out[key] = counts.get(key) as number;
  return out;
}

/** `a 3, b 1` — a count map as one deterministic phrase. */
function describe(counts: Readonly<Record<string, number>>): string {
  const parts = Object.entries(counts).map(([k, v]) => `${k} ${v}`);
  return parts.length === 0 ? "none" : parts.join(", ");
}
