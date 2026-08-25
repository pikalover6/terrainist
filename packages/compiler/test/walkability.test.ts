/**
 * The walkability audit, pointed at the two hillside fixtures.
 *
 * **Every number in `HILLSIDE` and `STEEP` below is a defect golden.** They are
 * not targets and they are not a specification; they are a measurement of how
 * badly this compiler's passes add up on a hill, first taken on 2026-08-07
 * against `bbcefde` and re-taken after every change that claims to help, so that
 * the next person to touch the flights, the balustrade or the hillside planner
 * can see in one run whether they did. **They must go DOWN.**
 * A change that moves one of them up is either a regression or a decision, and
 * either way it has to be argued for in the diff rather than absorbed by a
 * `toBeLessThan`.
 *
 * Why these numbers and not a pass/fail bar: the defects Kai walked are not the
 * failure of any one pass, so there is no pass whose test could have caught
 * them. Every fix of the last three rounds verified green on the metric its own
 * pass owns. What was missing was a ruler laid across the *sum* — the whole
 * paved network as one graph — and the interesting thing about that ruler is
 * that on this world it read, on the day it was built:
 *
 * - **the town is 54 disconnected pieces**, of which the largest holds 31% of
 *   the paving;
 * - **22% of every column an emitter declared as walkable surface has masonry
 *   standing on it**, and nine tenths of that is the stair balustrade standing
 *   on its own flight;
 * - **clutter at junctions runs 1.5× the solo baseline** and 4× it at the worst
 *   four, every one of which is a flight crossing another flight — but the
 *   *worst single solo location* (1.193) is nearly the worst junction (1.283),
 *   and that is the finding, not a spoiled experiment: the co-location story is
 *   only half right. A flight's own cross-section is already a maze on its own
 *   (one column of tread between two continuous wall courses), and the
 *   junctions then multiply it. So there are two levers, not one;
 * - **26 of 30 mid-town face runs are unserved** — no walkable route from the
 *   foot of the drop to its head within a reasonable walk.
 *
 * **The second lever was pulled the same day** (`street-stairs.ts`): the whole
 * carriageway of a flight is tread now, the balustrade stands on the verge line
 * outside it, and it is only built where the ground beyond the verge falls two
 * blocks or more. Buried columns fell 1054 → 157, the solo control 0.299 →
 * 0.076, the junction number 0.456 → 0.188, and the pieces 54 → 16. The rows
 * below carry the new numbers and each says what moved it. The two rows still
 * waiting for their lever are the pieces — sixteen is not one — and the faces.
 *
 * **Re-taken again after the 2026-08-07 evening wave**, and every row below
 * names which of its three commits moved it: the **causeway landing**
 * (`b90f87a` — the lowest street stops throwing connectors into open field),
 * the **flight-floor fix** (`eb93a54` — a flight lies *in* the ground, and band
 * ends close over voids), and **junction steps** (`4b18ef5`). The headline is
 * the entrance share on `site-plan-hillside`: **0.844 → 0.998**. The rows that
 * went the wrong way — the steep fixture's components, dead ends and sheer
 * faces, and one unserved face on the hillside — are the causeway landing's
 * price, and each says so where it stands.
 *
 * The last one is the row to read most carefully, because the rule behind it is
 * Kai's and it is not "faces are too tall". A six-block terrace is what a hill
 * town is. A connection between two levels has to **earn its drop with run**,
 * and `EARN_RATIO` is that rule as a number.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileTerrain } from "../src/terrain/compile.js";
import {
  FURNITURE_REACH,
  PLATFORM_BAND,
  PLINTH_MIN_RUN,
  SHEER_DROP,
  SHEER_RUN,
} from "../src/emit/dressing.js";
import {
  EARN_RATIO,
  LEVEL_SLACK,
  MIN_DANGLE,
  SERVICE_REACH,
  type WalkabilityReport,
} from "../src/emit/walkability.js";

const EXAMPLES = fileURLToPath(new URL("../../../examples/", import.meta.url));

/** One fixture's goldens. Every field is a defect measurement. */
interface Goldens {
  /** Laid columns that resolved to a cell a player can stand in. */
  readonly columns: number;
  /** …and those that did not, because something is standing on them. */
  readonly buried: number;
  /** Connected pieces of the pedestrian network. One is the target. */
  readonly components: number;
  /** Columns outside the largest piece. */
  readonly orphans: number;
  /** Network columns a traveller who walks in can reach, and their share. */
  readonly entranceReachable: number;
  readonly entranceReachableShare: number;
  /** All standable columns they can reach, and their share of the region. */
  readonly groundReachable: number;
  readonly groundReachableShare: number;
  /** Flights and streets whose far end joins nothing. */
  readonly deadEnds: number;
  /** Courses per walkable column, aggregated over junctions… */
  readonly junctionDensity: number;
  /** …and over places where exactly one emitter operates. The control. */
  readonly soloDensity: number;
  /** Mid-town face runs, and those whose drop no route earns. */
  readonly faceRuns: number;
  readonly unservedFaces: number;
}

/**
 * Both fixtures were remeasured on 2026-08-07 after **three** changes landed
 * together, and every comment below says which of them moved the number:
 *
 * - **the balustrade** came off the flight's own carriageway onto its verge
 *   line, and is built only where the ground beyond that verge falls away
 *   (`structures/street-stairs.ts`);
 * - **the tread law learned to cap the fall** — `synthesizeTreads` may now cut a
 *   bounded slot into the platform above rather than ride it to the edge and
 *   drop the whole terrace in one riser (`structures/sweep.ts`);
 * - **the carriage spine stopped sprouting stair-alleys** of its own
 *   (`layout/forms/hillside.ts`).
 *
 * They are reported as one set because they were measured as one: the fixtures
 * compile once and the audit reads the sum, which is the whole premise of this
 * module.
 */
/**
 * **The 8F flip is the one change behind every row below that moved**, on both
 * fixtures, and it is worth stating once rather than fourteen times.
 *
 * `FRONTAGE_TIE` went true (`docs/GROUND-UNIFICATION-v0.md` §1.8 wave 8F). On
 * *these two* documents the flip does **not** move a single building: both
 * quarters are site-planned, both carry `GroundLevels`, and F1 puts the
 * platform branch ahead of the tie in `layDistrict`'s `??` chain — a quarter
 * that declared its own platforms has already answered the question the tie
 * asks. Measured: the nine seated lots on `site-plan-hillside` and the six on
 * the steep fixture sit at exactly the levels they sat at before the flip, and
 * `LOAM-T238`'s counters are 0/0 on both because the tie never arbitrates here.
 *
 * What *does* change is the **carriageway**. `layDistrict` now grades a
 * `StreetDatum` (F2) and `surfaceStreetGraph` consumes it as its profile
 * instead of re-grading (F8), under F9's `STREET_CUT_MAX = 2` — and F9 caps the
 * **cut only**. Where the old surfacer dug a street into a rise, the datum's
 * 1-Lipschitz profile now holds it up and breaks instead. So the street stands
 * one block higher in places, and every row that moved is that one block seen
 * through a different instrument. Each says which below.
 *
 * `LOAM-T237` is **absent on both fixtures**: no segment was surfaced above its
 * datum at any station, so the datum and the surfacer are one grader, which is
 * the property F8 exists to have.
 *
 * The direction rule still stands and is not suspended by a wave: `plinth*` and
 * `sunkenLamps` went **UP**, they are argued for at their rows, and §7 lists 8F
 * as a walk gate precisely so Kai judges this trade rather than a golden diff.
 */
/**
 * **The 11F flip is the one change behind every row below that moved**, on both
 * fixtures, and — as with 8F — it is worth stating once rather than thirty times.
 *
 * `SEAM_TIERS` went true (`docs/GROUND-UNIFICATION-v0.md` §4.4 wave 11F), and
 * three mechanisms move numbers here, all of them Part IV's laws doing what
 * they say:
 *
 * 1. **S1/S2, the tier stack.** A seam past `RETAIN_MAX` is no longer graded
 *    into a 45° bank; it is `ceil(drop / RETAIN_MAX)` faces of masonry with a
 *    tread between. `site-plan-hillside-steep` builds seven revetted stacks
 *    over fourteen faces and 265 columns. Ground that used to be a ramp of raw
 *    earth is now level tread, which is why the paved network grows on both
 *    fixtures (`columns`) and why more of the hill reads as face run
 *    (`faceRuns`).
 * 2. **11A's split, gone.** `treatmentForEdge` now chooses on every quarter,
 *    not only on one a site planner drew, so §5.2's cut-side rule 8 — *the
 *    unbuilt answer uphill is the hill's own rock* — fires town-wide for the
 *    first time. It moves no ground: it **dresses** the cut face and attributes
 *    it to `retaining`. The dressing audit counts an attributed worked face as
 *    built, so the steep fixture's `sheerFaces` rise is largely this: hillside
 *    that was always there, now owned and named.
 * 3. **S9's stairs.** Six flights are cut through the served seams of the steep
 *    fixture and registered as `steps` segments before surfacing, which adds
 *    junction dressing where they meet streets (`junctionColumns`).
 *
 * **Rows that went UP are marked and argued at their row**, per this module's
 * standing rule, and §8's walk-gate table lists 11F precisely so Kai judges the
 * trade on a walk rather than on a golden diff. The two honest ones to read
 * first are the steep fixture's `unservedFaces` (0 → 3) and its `sheerFaces`
 * (2 → 6).
 *
 * **One real bug was found by this flip and fixed at the source, not pinned**:
 * `buildTieredSeam` built an upper tier's course over columns whose lower tier
 * could not be placed, and the sweep ran that face down to the natural ground —
 * eleven columns of a *nine-block single face* of cobblestone standing over the
 * street on this fixture, past the `RETAIN_MAX` ceiling S2 calls a hard law,
 * while §13.8's histogram reported it as two faces of five and four. Support is
 * now carried across the stack per column and the uncovered seam columns are
 * reported by `LOAM-W413`. That fix is worth 28 of the steep fixture's sheer
 * columns on its own (81 → 53).
 */
/**
 * **Re-pinned wholesale at WP-G4's flip (`GROUND_V1_SEAMS` on) — attribution:
 * the G4 seam builders.**
 *
 * Every golden in the four blocks below that moved, moved for one mechanism:
 * `finishSeams` is now the terminal builder for every transition the resolver
 * derives, and on these two hill towns that is 30 and 56 derived transitions
 * that nothing built before. Each one lands treads, copings, cut faces and
 * graded bank in the middle of the town, so the *denominators* rise (`columns`,
 * `halfTreads`, `junctionColumns`) and so do most of the defects measured
 * against them.
 *
 * Three rows are the walk gate and are called out here rather than left to be
 * found: **`orphans`** (41 → 271 and 666 → 3,318), a tread published as a
 * landing that no flight reaches; **`cutoffColumns` / `undressedCutoffs`**
 * (9 → 44 and 23 → 63), the sunken cut this stage cuts five times as much of;
 * and **`unservedFaces`** (1 → 2 and 3 → 10), a terrace you can see and cannot
 * get onto. All three have the same lever and it is S9's stair, not the stack —
 * the terraces got their walls, and now they need their steps. None of them is
 * fixed by making a face shorter.
 *
 * Two rows went the right way and are worth as much: `buried` fell by one on
 * the hillside and `strandedTreads` went to zero there.
 */
/**
 * **Re-pinned wholesale at WP-G6's flip (`GROUND_V1_FREEZE` on) — attribution:
 * the freeze, and nothing else.**
 *
 * Every golden in the four blocks below moved at `46118f7` and was left red
 * there; this is the re-pin, taken after the fact and **measured against the
 * flag rather than asserted**. The method is worth stating because it is what
 * makes the attribution a fact instead of a story: the same two fixtures were
 * compiled in an isolated worktree at the same commit with
 * `GROUND_V1_FREEZE = false`, and that run reproduces the *previous* goldens
 * on every one of the forty-odd rows, exactly. So the flag is the whole cause,
 * every row below is `flag-off -> flag-on`, and no other change is hiding in
 * the diff.
 *
 * Two mechanisms account for all of it, and the second one is the interesting
 * one:
 *
 * 1. **The ground is the resolver's, and nothing moves it afterwards.** Troy's
 *    247 after-the-fact ground moves went to zero; on these fixtures the same
 *    thing shows up as the paving landing where the contract put it rather than
 *    where the last writer left it. `buried` falls hard on both (21 -> 17 and
 *    **156 -> 49**), `sheerFaces` on the steep fixture falls 9 -> 2 and
 *    `sheerColumns` 74 -> 7, and `halfTreads` moves because the tread mix is
 *    decided once.
 * 2. **The junction pass is dead on-flag** (`structures/junction-steps.ts`,
 *    WP-G6's second landing). `junctionColumns` is **16 -> 0 and 85 -> 0**, and
 *    that single fact is the whole of the rows that went the wrong way. The
 *    pass used to lay a stair, a nosing or a lift at every seam between two
 *    surfaces *after* the ground was written; with the ground frozen it has no
 *    licence to and does not run. So the seams it used to dress are now
 *    reported raw, by three different instruments:
 *    - `undressedCutoffs` 17 -> 31 and 13 -> **80** — the cuts it used to nose;
 *    - `plinthColumns` 34 -> 40 and `stepPlinthColumns` 9 -> 15 / 6 -> **86** —
 *      a column reads *proud* when the ground on both sides of it is open, and
 *      a junction stair beside it used to make that side dressed. The longest
 *      *run* on the hillside does not move (5 -> 5): the six new columns are
 *      isolated, which is dressing withdrawing at six places and is not a road
 *      standing up anywhere;
 *    - `faceRuns` on the steep fixture 19 -> **26** — seven more mid-town edges
 *      read as bare face runs for the same reason, and this is a *denominator*:
 *      `unservedFaces` went **10 -> 6**, DOWN, on the same fixture and in the
 *      same run.
 *
 *    Their orders of magnitude agree, which is the check that makes this an
 *    attribution rather than a coincidence: 85 junction columns vanish from the
 *    steep fixture and +67 undressed cutoffs, +80 step-plinth columns and +7
 *    face runs appear.
 *
 * **`blindStairs`, `strandedTreads`, `kerbStairs` and `cascadeLargest` all read
 * 0 on both fixtures now, and not one of them was fixed.** They are subsets of
 * `junctionColumns`, and their denominator went to zero. They are pinned at 0
 * so that a junction pass which comes back has to argue its defects again, and
 * this paragraph is here so nobody reads the zeroes as progress.
 *
 * ## The orphans, and a hypothesis this round refuted
 *
 * `orphans` is the headline defect on both fixtures and the freeze barely
 * touched it: **271 -> 271** on the hillside, 3,318 -> 3,421 on the steep one.
 * The standing explanation — written at WP-G4's flip, three blocks up — was "a
 * tread published as a landing that no flight reaches", with S9's stair named as
 * the lever. **That is wrong, and it was measured wrong at the column.** The
 * orphan columns are not landings and the seam builders do not publish them:
 * 97% of them stand at *exactly* the level their own emitter declared, and they
 * are attributed to `street:segment:*` — whole streets and whole flights.
 *
 * What actually severs them is a handful of columns per fixture, and the
 * mechanism is the ground contract's rank order:
 *
 * > A flight declares its tread band as `street.network` — rank 80, tier C. A
 * > quarter's platform plane is `quarter.plane` — **rank 15, tier A**. Where the
 * > two overlap the flight always loses, so the level it publishes on that
 * > column is a level it never gets, and what ships is a flight with a notch cut
 * > through it. The segment still publishes the station at its own level, so no
 * > instrument downstream can see the notch — only this audit can, and only as
 * > two components where there should be one.
 *
 * Proved at the column on `site-plan-hillside`: the carriage spine `sp0`
 * declares y = 111 across z = 56…60; the resolver's winner at (94…100, 58) is
 * `world.hill_town#pad@26`, `quarter.plane`, at **109**. Seven columns, two
 * blocks down, and they orphan **223 columns of spine** — the largest single
 * piece on the fixture. The same shape accounts for `dn1_96` (5), `dn1_32` (2)
 * and, on the steep fixture, the 4-block break in `dn2_32` at (23, 28…29) that
 * separates two 600-column terraces.
 *
 * **Two candidate fixes were built and measured this round, and both were
 * rejected on the numbers**; they are recorded here so the next attempt does not
 * pay for them again:
 *
 * - *Pin the tread law to the decided columns and refuse the run that cannot
 *   meet them* (`GroundDriver.decided`, `synthesizeTreads`' `pinAt`). It works:
 *   hillside orphans **271 -> 9**, `unservedFaces` -> 0 on both. It is also not
 *   shippable — a one-column notch two blocks deep is infeasible by arithmetic,
 *   so nearly every contested flight refuses whole, and the steep fixture loses
 *   a third of its paving (4,369 -> 2,927 columns; the tread mix 323 -> 35
 *   half-treads). That is deleting the fabric, which this module's own rule
 *   forbids reading as a win.
 * - *Bend where you can, keep today's answer where you cannot.* Monotone and
 *   safe, and worth **nothing**: measured, the hillside does not move one
 *   column and the steep fixture moves three. There is no bend — 111, 109, 111
 *   is a two-block riser whichever way a 1-Lipschitz law is bent.
 *
 * So the lever is neither the stair nor the tread law. It is upstream, and it is
 * a design decision rather than a patch: either a quarter's plane yields where a
 * street crosses it, or the street router does not route across a plane it
 * cannot match. Until one of those is chosen, `orphans` is pinned where it
 * stands and this note is the reason it did not go down.
 */
const HILLSIDE: Goldens = {
  // 5120 → 3972. Down, and down is not a loss here: the causeway landing
  // (b90f87a) stopped the lowest street throwing 495 declared columns of
  // connector into open field, and the flight-floor fix (eb93a54) closed band
  // ends over voids rather than paving them. Fewer columns, almost all of them
  // reachable — see `entranceReachableShare`.
  //
  // **3972 → 3973** at the 8F flip: one column. A carriageway cell the old
  // surfacer had dug below its neighbours now sits level with them and resolves
  // to a standable cell instead of a buried one. The denominator, moving by
  // 0.03%.
  columns: 3781, // G6 freeze: 4010 -> 4009, the denominator, one column. ROAD_SOVEREIGN flip: 4009 -> 3832 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 3832 -> 3799 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 3799 -> 3781 — saturated authority re-levels more cliff columns; the denominator follows.
  // 120 → 19. **The flight-floor fix (eb93a54)** — a flight lies in the ground
  // rather than on it, so the rail no longer stands on its own carriageway
  // anywhere. What is left is nine columns on the spine, the plaza's six, and
  // four on the terrace lanes.
  buried: 58, // G6 freeze: 21 -> 17, DOWN: the ground is the resolver's, so four columns of coping no longer stand on declared lane. ROAD_SOVEREIGN flip: 17 -> 7 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 7 -> 40 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 40 -> 58 — full authority cuts deeper; the unfeathered cut faces (the named debt) bury more road edge. MUST COME DOWN when the shoulders return.
  // 15 → 10, and 797 → **9**. **The causeway landing (b90f87a).** This is the
  // lever the old comment on `deadEnds` said had been implemented, measured and
  // reverted because it broke the steep fixture's §5.5 planning; it landed for
  // real this wave, and it reads exactly what that measurement predicted:
  // ten components, nine orphan columns, 0.2% of the paving.
  components: 10, // G6 freeze: 14 -> 14, unmoved. ROAD_PULL flip: 14 -> 10 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade.
  orphans: 9, // G6 freeze: 271 -> 271, UNMOVED — see the note above for the mechanism and for the two fixes that were built and rejected. MUST GO DOWN, and not by S9's stair. ROAD_SOVEREIGN flip: 271 -> 2591 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 2591 -> 9 — ROAD-PULL-v0 §5 named the sovereign fragmentation number as this design's report card, and the blend hands it back: on the cliffs the roads regain a graded (still stair-free) profile, so the terraces are joined again.
  // 0.998 → **1.000** (domain fix, 2026-08-07): the flood now runs over all
  // standable ground rather than over declared paving alone, so the nine
  // orphan columns that a walker reaches across two blocks of grass are
  // reached. Every laid column but one is reachable on foot from the entrance.
  //
  // **3971 → 3972** at the 8F flip, which is `columns` above moving with its
  // numerator: the one new standable column is reachable like the rest of them,
  // and the share is still 1. The invariant this row is really for — "every
  // laid column but one" — is unchanged.
  entranceReachable: 3780, // G6 freeze: 4007 -> 4008, the numerator, with the share. ROAD_SOVEREIGN flip: 4008 -> 3831 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 3831 -> 3798 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 3798 -> 3780, following `columns`.
  entranceReachableShare: 1, // G6 freeze: 0.999 -> 1.000, UP, which is this row's direction: every laid column but one is walked to from the entrance again.
  // The terrain control: 71% of the region's standable columns. The remainder
  // is the hill's own cliffs and the ground beyond them — nobody's to serve.
  //
  // **185662 → 185695** with the archetype-bias wiring (2026-08-11): this
  // fixture's `character.archetypes.prefer: ["cottage", "church"]` had never
  // been read; now it prepends into the mix, different shells take the lots,
  // and 33 more ground columns fall reachable. BY DESIGN.
  //
  // **185695 → 185667** at the 8F flip, −28 columns on a share that does not
  // move off 0.709. A street held up rather than dug in presents a one-block
  // step to the natural ground on its uphill side at a handful of places, and a
  // walker crossing there no longer floods through. Twenty-eight columns of
  // hillside out of 185,000 — the control doing its job, and reporting nothing.
  groundReachable: 185770, // fragment-dressing gate (2026-08-21): 185719 -> 185727, UP by eight — the open-patch furniture now refuses a sliver, and the eight columns a market stall and a crate heap stood on are standable ground again. G6 freeze: 185755 -> 185723, the terrain control, following the frozen ground. flip-debt round (2026-08-21): 185723 -> 185719, four columns, and they are the two extra lamp posts below standing on ground rather than over it — a column with a post on it is not a standable one. ROAD_SOVEREIGN flip: 185727 -> 185756 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 185756 -> 185765 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 185765 -> 185770 — the control follows the steepened tail: five columns the shallower cut left unstandable are ground again.
  groundReachableShare: 0.709, // G6 freeze: unmoved at 0.709.
  // 5 → 3. Same commit: the dangling connectors *were* the dead ends.
  deadEnds: 5, // G6 freeze: 5 -> 5, unmoved.
  // 0.188 → 0.175, and 0.075 → 0.048 (eb93a54, junction steps 4b18ef5). The
  // solo control fell by a third again; junctions remain the lever.
  //
  // **0.175 → 0.176** with the stoop fix (2026-08-07): four lane columns beside
  // doorsteps are no longer *raised* to meet the side of a stoop, so four
  // courses of ground that used to be part of the paving are not, and the same
  // clutter divides by a slightly smaller walkable count. The numerator did not
  // move. MUST GO DOWN.
  //
  // **0.176 → 0.175** with the archetype-bias wiring (2026-08-11): the same
  // mix shift as `groundReachable` above, dividing by a slightly larger
  // walkable count. BY DESIGN.
  //
  // **0.175 → 0.171 and 0.048 → 0.042** at the 8F flip, and both DOWN — the
  // direction this pair is supposed to move, for the reason F2 exists. A
  // junction where two streets used to arrive from two independent gradings now
  // arrives from one datum, so there is less to reconcile and fewer courses of
  // dressing land at the meeting. The solo control fell too, and fell *further*
  // in proportion — which is the reading the row's own rule warns about, so:
  // this is not the town getting emptier, it is 12 fewer courses over a
  // denominator that moved by one column. The numerator is the whole of it.
  junctionDensity: 0.139, // G6 freeze: 0.167 -> 0.170, UP by three thousandths on a denominator that shrank by one column; the junction pass's own dressing is gone, so what is counted here is other passes' courses. MUST GO DOWN. flip-debt round (2026-08-21): 0.170 -> 0.171, one thousandth, the two restored lamp posts being counted as the clutter they are — they were in the world before too, hanging over it where this instrument could not see them. ROAD_SOVEREIGN flip: 0.171 -> 0.139 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0.139 -> 0.141 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 0.141 -> 0.139 — two thousandths, road claims landing at the new levels changing which meetings count.
  soloDensity: 0.038, // G6 freeze: 0.048 -> 0.046, the control, DOWN. flip-debt round (2026-08-21): 0.046 -> 0.047, the two restored posts, counted in the control exactly as they are in the junction number one line above — which is the pair working: both rose together, so this is dressing that came back, not a meeting that got worse. ROAD_SOVEREIGN flip: 0.047 -> 0.04 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0.04 -> 0.038 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 0.038 -> 0.039, a thousandth on a shrunk denominator. n9 retune (tail exponent + closing, 2026-08-23): 0.039 -> 0.038 — the control moves with `junctionDensity`, a thousandth on the shifted denominator.
  // Unmoved at 4 runs, and **0 → 1**: one mid-town face run now goes unearned,
  // at (5, 44) — drop 3 over run 5, earned 1.667 against `EARN_RATIO` 2. It is
  // a *new* row in the wrong direction and it is recorded as such rather than
  // absorbed: the causeway landing removed the connector network that happened
  // to serve that face's foot. MUST GO DOWN, back to 0.
  //
  // **4 → 1 runs and 1 → 0 unserved**, with the terminus landing (2026-08-07,
  // `structures/roads.ts`' `terminusLandings`) — Kai's Option A after the walk:
  // where a street stands two blocks or more above the flight corridor beside
  // it, the *street* yields its terminal columns and steps down onto the
  // treads, one block per column, `drop − 1` columns of them. Three of the four
  // runs were that one situation at three places on this fixture: the unearned
  // three-block riser at (5, 44), the pair at (−29, 40), and the served
  // three-block run at (−1, 43) that was the flight's own head. All three are
  // now staircases and not faces at all, which is why the *denominator* fell
  // with the defect. The one run left is (93, 37), drop 2 — unrelated, and
  // under the drop `unservedFaces` counts.
  faceRuns: 6, // G6 freeze: 9 -> 9, unmoved on this fixture. ROAD_PULL flip: 9 -> 6 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade.
  unservedFaces: 3, // G6 freeze: 2 -> 2, unmoved. MUST GO DOWN, by a flight that reaches, never by a shorter face. ROAD_SOVEREIGN flip: 2 -> 6 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 6 -> 2 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 2 -> 3 — one more mid-town face whose drop no route earns, at the new road levels. MUST GO DOWN.
};

const STEEP: Goldens = {
  // 4453 → 4216 (b90f87a, eb93a54), 211 → 110 — the same two levers, and the
  // same direction, at two thirds the effect: this fixture's flights are longer
  // so more of the buried count was rail on carriageway.
  columns: 4102, // G6 freeze: 4262 -> 4369, the denominator: 107 more columns resolve to a standable cell rather than to masonry (see `buried`). ROAD_SOVEREIGN flip: 4369 -> 4202 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 4202 -> 4193 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 4193 -> 4109 — the denominator follows the steepened tail — more of the steep fixture resolves to masonry rather than to a standable cell (see `buried`). cross verdict (PULL_CROSS, 2026-08-23): 4109 -> 4102 — the denominator follows the re-levelled rows: cross-fall joins the pull verdict, so the side-sloping streets level and seven fewer columns resolve to a standable cell.
  buried: 106, // G6 freeze: 156 -> 49, DOWN by two thirds and the largest good move of the flip: the coping that used to stand on declared lane is decided once, with the lane, instead of written over it. ROAD_SOVEREIGN flip: 49 -> 6 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 6 -> 15 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 15 -> 99 — the named shoulder debt scaling with the dial: full tail authority cuts the terraces deeper and the unfeathered cut faces bury that much more road edge. MUST COME DOWN when the verge/shoulder revival lands. cross verdict (PULL_CROSS, 2026-08-23): 99 -> 106 — the re-levelling cuts the tilted shelves flat, and the unfeathered cut faces bury that much more road edge. MUST COME DOWN when the verge/shoulder revival lands.
  // 9 → **12** and 941 → 649. The count went UP and the area went down, and
  // both are the causeway landing (b90f87a): refusing the lowest street's
  // connectors splits off three small pieces that the causeways used to bridge,
  // while removing 292 columns of paving that led nowhere. This is a decision,
  // not a regression — but the component count is a row that MUST come back
  // DOWN, and on this fixture the entrance share below says why it matters.
  components: 36, // G6 freeze: 22 -> 22, unmoved. ROAD_SOVEREIGN flip: 22 -> 23 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 23 -> 28 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 28 -> 34 — more pieces as the road claims move; MUST GO DOWN towards 1. cross verdict (PULL_CROSS, 2026-08-23): 34 -> 36 — two more pieces as the levelled rows land at new heights; MUST GO DOWN towards 1.
  orphans: 3248, // G6 freeze: 3318 -> 3421, UP by 103, and 78% of this fixture's paving. The mechanism is the note above the hillside block — the terraces are severed from each other by columns their flights lost to `quarter.plane`. MUST GO DOWN. ROAD_SOVEREIGN flip: 3421 -> 3174 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: unmoved — this fixture's severing is `quarter.plane` terraces rather than roads, so the pull owes it nothing. n9 retune (tail exponent + closing, 2026-08-23): 3174 -> 3255 — more paving cut off as the road claims move. MUST GO DOWN. cross verdict (PULL_CROSS, 2026-08-23): 3255 -> 3248 — seven fewer, the levelled rows connecting a shade better. MUST GO DOWN.
  // 0.150 → **1.000**, and this row is why the domain was fixed. Kai walked
  // `hillside_town_steep-5` on 2026-08-07 and reached 100% of the town on foot
  // by intended paths; the instrument said 15%. It was the instrument: the
  // flood ran over declared paving only, so the natural terrace ground that
  // bridges these flights everywhere was not in the graph and the town read as
  // path-islands. Over all standable ground, every laid column but one is
  // reachable. `components` below stays network-scoped by design.
  entranceReachable: 3963, // G6 freeze: 4258 -> 4352, following `columns`. ROAD_SOVEREIGN flip: 4352 -> 4190 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 4190 -> 3892 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 3892 -> 4012 — the honest win: the closing keeps a climb's mid-bench under the grader, and most of the n8 entrance-reach regression comes back. cross verdict (PULL_CROSS, 2026-08-23): 4012 -> 3963 — down with the re-cut terraces on this fixture, whose severing is `quarter.plane` rather than roads. MUST GO UP.
  entranceReachableShare: 0.966, // G6 freeze: 0.999 -> 0.996, DOWN: seventeen of the newly-standable columns are not walked to from the entrance. MUST GO UP. ROAD_SOVEREIGN flip: 0.996 -> 0.997 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0.997 -> 0.928 — the blend rejoins the cliff roads but re-cuts this fixture's `quarter.plane` severings; MUST GO BACK UP, and the walk judges the trade. n9 retune (tail exponent + closing, 2026-08-23): 0.928 -> 0.976 — UP with `entranceReachable` — the honest win: the closing keeps a climb's mid-bench under the grader and most of the n8 regression comes back. cross verdict (PULL_CROSS, 2026-08-23): 0.976 -> 0.966 — DOWN with `entranceReachable` as the re-cut `quarter.plane` terraces sever again. MUST GO BACK UP.
  // **136343 → 136349** with the archetype-bias wiring (2026-08-11), same
  // cause as the hillside fixture. BY DESIGN.
  groundReachable: 135313, // fragment-dressing gate (2026-08-21): 136414 -> 136456, UP by forty-two, the same release on the steeper hill, where more of the leftover ground is sliver. G6 freeze: 136386 -> 136408, the control. flip-debt round (2026-08-21): 136408 -> 136414, UP by six — six columns a prop or a post used to stand on from the pristine baseline, released back to the ground now that the re-seat puts each of them where the resolver did. ROAD_SOVEREIGN flip: 136456 -> 136594 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 136594 -> 136009 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 136009 -> 135889 — deeper cuts on the steep fixture take back ground half-authority left standable. n9 retune (tail exponent + closing, 2026-08-23): 135889 -> 136138 — the ground control follows the closing: benches inside climbs stay standable instead of being cut away. cross verdict (PULL_CROSS, 2026-08-23): 136138 -> 135313 — the control moving with the re-levelled rows, which cut and fill the hill's own ground.
  groundReachableShare: 0.749, // fragment-dressing gate (2026-08-21): 0.754 -> 0.755, the forty-two released columns. G6 freeze: 0.755 -> 0.754. ROAD_PULL flip: 0.755 -> 0.752, the control following `groundReachable` above. n9 retune (tail exponent + closing, 2026-08-23): 0.752 -> 0.753 — the control following `groundReachable` above. cross verdict (PULL_CROSS, 2026-08-23): 0.753 -> 0.749 — the control following `groundReachable`, four thousandths.
  // 7 → **10**, up, and the same trade as `components`: the refused causeways
  // leave the streets they used to terminate hanging. MUST GO DOWN.
  deadEnds: 21, // G6 freeze: 14 -> 15, UP by one. MUST GO DOWN. ROAD_SOVEREIGN flip: 15 -> 14 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 14 -> 18 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. cross verdict (PULL_CROSS, 2026-08-23): 18 -> 21 — three more far ends hanging at the new levels. MUST GO DOWN.
  // 0.142 → 0.124, 0.082 → 0.043 (eb93a54, 4b18ef5). **0.124 → 0.125** with
  // the stoop fix (2026-08-07), for the reason the hillside row gives: three
  // fewer lifts, a marginally smaller denominator, an unmoved numerator.
  // **0.125 → 0.126** at wave close (2026-08-07, composed tree): the relief
  // redesign's dressed landings shave the walkable denominator once more;
  // the clutter numerator has not moved since the stoop fix.
  junctionDensity: 0.065, // G6 freeze: 0.167 -> 0.112, DOWN — and read it with the control below before calling it a win: the junction pass's 85 columns of dressing are simply not laid. Less clutter because less was built, not because the meeting got tidier. ROAD_SOVEREIGN flip: 0.112 -> 0.063 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0.063 -> 0.064 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 0.064 -> 0.065 — a thousandth, following the road claims at the new levels.
  // 0.043 → 0.044 at wave close, the same denominator shave as the row above.
  soloDensity: 0.018, // G6 freeze: 0.049 -> 0.021, the control, DOWN further in proportion — which is exactly the reading this pair exists to expose. The town is emptier of dressing; it is not less of a maze. flip-debt round (2026-08-21): 0.021 -> 0.022, one thousandth, on a walkable denominator that moved by six columns. ROAD_SOVEREIGN flip: 0.022 -> 0.017 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0.017 -> 0.018 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 0.018 -> 0.017 — the control follows the junction number, a thousandth. cross verdict (PULL_CROSS, 2026-08-23): 0.017 -> 0.018 — the control, a thousandth on the shifted denominator.
  // 3 → 4 runs, and 0 unserved still. The extra run is a face the causeway
  // removal exposed; every one of the four is earned.
  faceRuns: 36, // G6 freeze: 19 -> 26, UP by seven: seven mid-town edges the junction pass used to dress now read as bare face runs. A denominator — see `unservedFaces`. ROAD_SOVEREIGN flip: 26 -> 15 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 15 -> 24 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 24 -> 34 — more mid-town faces at the new road levels. MUST GO DOWN, by flights that reach, never by shorter faces. cross verdict (PULL_CROSS, 2026-08-23): 34 -> 36 — two more mid-town faces where the levelled rows meet the hill. MUST GO DOWN, by flights that reach, never by shorter faces.
  unservedFaces: 22, // G6 freeze: 10 -> 6, DOWN by four on a denominator that rose, which is the honest direction: more faces found, fewer of them unearned. ROAD_SOVEREIGN flip: 6 -> 7 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 7 -> 9 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 9 -> 11 — two more cut faces at full authority, no flight to earn them; the shoulder debt again. n9 retune (tail exponent + closing, 2026-08-23): 11 -> 19 — more faces whose drop no route earns at the new road levels. MUST GO DOWN. cross verdict (PULL_CROSS, 2026-08-23): 19 -> 22 — three more cut faces with no flight to earn them — the shoulder debt again. MUST GO DOWN.
};

/**
 * The **dressing** goldens — `emit/dressing.ts`, the four defect classes Kai
 * walked on 2026-08-07 that the pedestrian graph above is blind to.
 *
 * Same discipline, same direction: every number is a measurement of what is
 * wrong today and **must go DOWN**. Two of the four came out very much smaller
 * than the walk suggested and that is a finding, not a failure of the
 * instrument — see the comments on each row, which say what the number *is* as
 * well as what it reads. Each is a single named constant so a fix wave can
 * re-pin it in one line.
 *
 * **Read the whole block through the `ROAD_SOVEREIGN` flip.** Most of these
 * rows are populations of *stair dressing* — half treads, open sides, plinths
 * under flights — and a sovereign road lays no stair at all: the descent solve
 * is not run, `deriveSeamStairs` is not called, junction steps are unreachable,
 * and a `steps` run is surfaced as plain draped carriageway. So they go to
 * nought together, and nought here is an absence and not a fix. What the rows
 * still hold is the two populations that survive the flag — the lamps and the
 * cutoffs — plus the guarantee that if the stairs ever come back, they come
 * back measured. The trade the flip makes (draped roads inherit the terrain's
 * risers; no stairs, by Kai's directive) is the walk's to judge, not this
 * file's; these numbers exist to make it visible.
 */
interface DressingGoldens {
  /** Walkable top-half treads on the ground plane — the population. */
  readonly halfTreads: number;
  /** …with the underside open sideways at all. */
  readonly openSided: number;
  /** …with **soil** at the bottom of the opening: Kai's floating slab. */
  readonly openOverSoil: number;
  /** …with two cells or more of air under the tread. */
  readonly floatingDressing: number;
  /** Lamps with paving within two columns, and those standing below it. */
  readonly streetLamps: number;
  readonly sunkenLamps: number;
  readonly deeplySunkenLamps: number;
  /** Paved columns two or more blocks under the paving beside them. */
  readonly cutoffColumns: number;
  readonly undressedCutoffs: number;
  /** Columns carrying a stair the junction pass laid — the 2c denominator. */
  readonly junctionColumns: number;
  /** …with no low side and nothing one step up in front of them. */
  readonly blindStairs: number;
  /** …laid into natural ground on both sides of their own axis. */
  readonly strandedTreads: number;
  /** The largest connected patch of junction dressing, in columns. */
  readonly cascadeLargest: number;
  /** Carriageway proud of open ground on both sides, and the longest such run. */
  readonly plinthColumns: number;
  readonly plinthLongestRun: number;
  /** The same over flights. */
  readonly stepPlinthColumns: number;
  readonly stepPlinthLongestRun: number;
  /** Built faces five blocks or taller over three columns or longer. */
  readonly sheerFaces: number;
  readonly sheerColumns: number;
  readonly sheerWorstDrop: number;
  /** Sunken stairs in the `kerb` bucket — nought is the bar (11F). */
  readonly kerbStairs: number;
}

const HILLSIDE_DRESSING: DressingGoldens = {
  // 1059 → 319 and 191 → 41: the denominators. The flight-floor fix (eb93a54)
  // lays a flight *in* the ground, so most of what used to be a half-height
  // tread over its own masonry is now full ground.
  //
  // **319 → 300 and 41 → 36** with the relief redesign (2026-08-07, Kai's
  // ratified "stairs + landings"). Both rows are *mix* rows and this wave
  // deliberately changes the mix, so they move and the direction is not the
  // point: 83 tread columns that used to be half-height slabs are now stair
  // blocks — a real riser where the flight descends — which takes them out of
  // the `halfTreads` population and out of `openSided` with them (a stair's
  // lower half is solid, so it has no underside to open). The row that carries
  // the judgement is `stepTreadsWithRelief`, 315 → 383 on this fixture, and
  // `openOverSoil`/`floatingDressing` below are still nought, which is the bar:
  // the mix changed, and nothing came loose with it.
  //
  // Re-pinned from the values HEAD actually produces (319/41 were stale before
  // this wave: HEAD measured 312/36 — the two rows were red on arrival and the
  // `openSided` assertion never ran, being shadowed by `halfTreads`).
  halfTreads: 0, // G6 freeze: 286 -> 272, the tread-mix denominator. ROAD_SOVEREIGN flip: 272 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  openSided: 0, // G6 freeze: 36 -> 32. ROAD_SOVEREIGN flip: 32 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  // **1 → 0.** The floating slab over exposed dirt is gone from this fixture,
  // and not by deleting the tread mix — `openSided` fell with it because the
  // flights sit lower, not because the slabs went away.
  openOverSoil: 0, // G6 freeze: 0 -> 0, held at the bar.
  // 3 → 0 (eb93a54).
  floatingDressing: 0, // G6 freeze: 0 -> 0, held at the bar.
  // 47 → 32 lamps stand within reach of paving, and **13 → 0** of them stand
  // below it; the deep three are gone too. The denominator fell because the
  // refused causeways took their lit stubs with them (b90f87a); the defect fell
  // to nought because the flights no longer sit a course above their own kerb.
  //
  // **32 → 30 and 0 → 3 at the 8F flip, and the defect row went UP.** The
  // argument, because a row that goes up has to carry one:
  //
  // The three lamps are at (−4, 62), (−2, 62) and (21, 65), all on
  // `streetscape:world.hill_town`, each `sunkenBy` exactly 1 and each reached
  // `viaCarriageway`. **Not one of them moved.** Probed column by column across
  // the flip, all three stand on ground 109 before and after; what moved is the
  // carriageway two columns away, 109 → 110 at (−2, 64…65) and at (18…19, 65).
  // So the instrument is right and its name is wrong here: no lamp sank, a
  // street rose out from under three of them. That is F9 — the datum caps the
  // *cut* at `STREET_CUT_MAX` and holds the profile up where the old surfacer
  // would have dug, and `FURNITURE_REACH` is 2, so a lamp on the outer sidewalk
  // column reads a carriageway that climbed without it.
  //
  // It is a **real** one-block seam between a carriageway and its own verge and
  // it MUST GO DOWN — the lever is the sidewalk band following the datum out to
  // the lamp line, not a wider `FURNITURE_REACH`. It is left standing at 8F on
  // purpose: §7 makes 8F a walk gate, the same one block is what `plinthColumns`
  // below counts from the other side, and whether it reads as a kerb or as a
  // defect is Kai's call on the walk and not a golden's.
  //
  // The denominator fell 32 → 30 with it: two lamp sites are no longer solid,
  // dry and paved by the pass at the moment it plants, so they get no post.
  //
  // **ATTRIBUTION FIX (2026-08-19): 30 → 16 lamps, 3 → 1 sunken, and no world
  // byte moved.** `lamp_post` is one fence mast carrying THREE lanterns — a head
  // at the top and two arms hanging off slabs, one column either side. The
  // census counted each lantern as a lamp and read the ground under the
  // lantern's *own* column, so each arm was measured over the graded verge
  // beside the sidewalk (`VERGE_FILL_FEATHER`, legitimately lower) while the
  // post it hangs off stood level: the sunken rows at (−4, 62) and (−2, 62) were
  // the two arms of the one post at (−3, 62). `lampFoot` now attributes a
  // hanging lantern to the mast column within Chebyshev 1 and measures the
  // mast's own lowest course, and a mast is counted once — so the denominator is
  // posts, not lanterns (30 lanterns ≈ 16 posts).
  //
  // The **residual is real and is the same seam as before**: one post at
  // (−4, 62) stands `sunkenBy` 1 with `viaCarriageway` true. That is the 8F kerb
  // above, unchanged in kind — the post did not sink, the carriageway two
  // columns away rose. It stays pinned at 1 for the reason argued above.
  streetLamps: 13, // G6 freeze: 16 -> 14, the denominator: two posts stand on ground the pass no longer finds solid, dry and paved at the moment it plants. flip-debt round (2026-08-21): **14 -> 16, back to the pre-flip number, and this row is why the round happened**. The pass plants in the building half now, so "the moment it plants" is past pass 5c and the ground it asks about is the resolved ground rather than the pristine baseline. Both posts are back, and `sunkenLamps` did not move with them. ROAD_SOVEREIGN flip: 16 -> 14 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 14 -> 13 — the denominator, one post: the closing moves the ground under a lamp site and the whole-prop rule refuses it.
  sunkenLamps: 1, // G6 freeze: 1 -> 3, UP by two, and the same kerb the 8F rows argue at length: no post sank, the carriageway two columns away stands where the contract put it. MUST GO DOWN, by the sidewalk band following the datum out to the lamp line. ROAD_SOVEREIGN flip: 3 -> 1 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  // **0 -> 1 at the flip-debt round (2026-08-21), and it is a real row, not a
  // reclassification: one of the two posts the flip had stopped planting is
  // back, and where it stands the pavement beside it is two or more blocks up.
  // It was in the world before the flip too — this instrument counted it at 0
  // only for the fortnight in which the post was not planted at all, which is
  // the least useful way there is to hold a defect at its bar. The honest
  // reading is that the hillside has had a deeply sunken lamp all along and the
  // freeze briefly hid it by dropping the lamp.
  //
  // MUST GO DOWN to 0, by the same fix the three `sunkenLamps` want: the
  // sidewalk band following the datum out to the lamp line, so the post and the
  // pavement it serves are graded together. Not by refusing to plant it.
  deeplySunkenLamps: 0, // ROAD_SOVEREIGN flip: 1 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  // 21 → 14 raw cuts, and **21 → 0 undressed**: the junction-step wave
  // (4b18ef5) dresses every one of the fourteen. `cutoffColumns` is the
  // denominator and is pinned so that a fix which merely stops cutting reads as
  // what it is.
  //
  // **14 → 18** with the stoop fix (2026-08-07), and the four are a *decision*.
  // They are lane columns beside a doorstep whose masonry stands two above
  // them: the pass used to climb that, which closed the cut and put a hump in
  // dead-flat pavement with a stair turned sideways on top of it — the pair
  // Kai walked at (−80, 177, −216). It now noses them where they stand, so the
  // cut is *counted* rather than absorbed and `undressedCutoffs` — the row that
  // matters — is still nought. The cheek of a stoop is architecture, not a
  // hole; MUST GO DOWN only by the doorstep and the lane arriving level, never
  // by climbing a step's side again.
  //
  // …and **18 → 12** with the terminus landing (2026-08-07), which is the other
  // direction and is the defect going away rather than being reclassified. Six
  // of the cuts were the street plane hanging over the head of the flight at
  // (−1 … 2, 44) — four of them a full three blocks, the deepest cutoffs on
  // either fixture, and the pair of drop-2 cuts at (−29 … −28, 41) and
  // (2, 43). The street now steps down onto those treads instead of ending
  // above them, so there is no bite left to dress. Measured in isolation the
  // landing takes this row 14 → 8; stacked on the stoop fix, 18 → 12.
  //
  // …and **0 → 5 undressed** with the 2026-08-08 walk fixes, which is a row
  // going the wrong way on purpose and the argument has to carry it. Five of the
  // twelve cuts are two or more blocks deep at a face the low side cannot climb
  // — the top of a lift run against a three-block bank, and lane columns beside
  // a stoop's upper tread. The pass used to lay a "kerb" on each: a stair at the
  // **foot** of a wall, its raised half against masonry nobody can climb, laid
  // flat in otherwise level pavement. Kai walked those on `hillside_town_steep-6`
  // as "random useless stairs", and they are the same block on this fixture.
  // A nosing is architecture on the side you *look over*; this pass only ever
  // dresses the low side, so it has no honest nosing to lay. It now says so, and
  // these five are the saying. They MUST GO DOWN — by the two surfaces arriving
  // at a level a step can bridge, or by a flight being built there — never by
  // going back to dressing a wall's foot.
  cutoffColumns: 9, // G6 freeze: 44 -> 48, the denominator. ROAD_SOVEREIGN flip: 48 -> 28 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 28 -> 9 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade.
  undressedCutoffs: 9, // G6 freeze: 17 -> 31, UP, and this is the junction pass dying: fourteen cuts it used to nose are reported raw. MUST GO DOWN, by the pass coming back inside the freeze or by the two surfaces arriving level. ROAD_SOVEREIGN flip: 31 -> 28 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 28 -> 9 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade.
  // The 2c rows (2026-08-08), pinned from the first compile that has them.
  // `blindStairs` and `strandedTreads` MUST GO DOWN, to 0. `junctionColumns` is
  // the denominator: a "fix" that stops laying junction dressing altogether
  // would take both defects with it and must not read as a win.
  //
  // The one blind stair left on this fixture is at `(50, 70, 227)` — a lane
  // tread facing a column that reads back as no surface at all, beside the
  // lower cottage's doorstep. It is the same site on both fixtures.
  junctionColumns: 0, // G6 freeze: 16 -> 0. The pass does not run on-flag. This is a denominator going to zero, and the three rows under it go with it.
  blindStairs: 0, // G6 freeze: 0 -> 0 — held, and now trivially, because nothing lays a junction stair. Not a fix.
  // `(75, 70, 244)`, both fixtures: a tread whose four neighbours all read back
  // as unstandable. The columns round it are declared paving that the audit
  // counts as `buried` — a defect of a different pass, showing up here.
  strandedTreads: 0, // G6 freeze: 0 -> 0, same reading as `blindStairs`.
  // A point seam is a handful of columns. Four.
  cascadeLargest: 0, // G6 freeze: 4 -> 0, same reading: no junction dressing, no patch of it.
  // 32 → **30**, longest run still two. Still the external road's own kerb,
  // still no run of plinth road on this fixture — two of the columns that read
  // proud were lane cells raised against a stoop, and they are not raised now
  // (2026-08-07).
  //
  // **30 → 49 columns and run 2 → 5 at the 8F flip. UP, and this is the row the
  // flip is really about.** F9 caps the cut at `STREET_CUT_MAX = 2` and caps
  // nothing on the fill: where the pre-8F surfacer dug a carriageway into a
  // rise, the datum's 1-Lipschitz profile now holds it up and breaks instead,
  // so nineteen more columns stand proud of the open ground on both sides. The
  // emitters say it plainly — the new length is on `street:segment:hs1_0` and
  // `hs0_0`, the quarter's own two streets, which are exactly the segments that
  // carry a datum; the `road:world.terrace_lanes` entries are the external
  // road's kerb and are the same ones as before, because `road.network@0` has
  // no datum and is provably unmoved (8D).
  //
  // **The mitigating measurement, and it is the one that matters:**
  // `PLINTH_MIN_RUN` is 6 and the longest run here is **5**, so `plinthRuns` is
  // still **0** — not one stretch of this is long enough to read as an
  // embankment rather than as a kerb, and `stepPlinthColumns` below is still
  // nought. Nineteen columns spread over 27 runs averaging under two columns
  // each is a street meeting a hillside, which is what §0.1 traded the lip for.
  //
  // It MUST GO DOWN, and the honest levers are two: `STREET_CUT_MAX` (§9.1's
  // sibling question — a deeper cut buys back the plinth and spends it on
  // retaining wall), or a fill cap on the datum path to match `ROAD_BERM_MAX`,
  // which is WP-10's territory and not this wave's. Neither is chosen here.
  // §7 lists 8F as a walk gate for exactly this: the trade is Kai's.
  //
  // **The walk came back: BROKEN, and 49 → 32 is the answer** (2026-08-19,
  // `glowcap_vale`). Kai walked the paths standing one block proud of the lawn
  // with a sharp vertical edge, and the mechanism turned out to be neither of
  // the two levers above — it is not on the carriageway at all. `blendShoulders`
  // filled a bank below the lane up to `y − k` at ring `k`, so ring 1 stopped
  // one block short of the road *by construction*: the verge built the kerb out
  // of its own fill, on every road in the compiler, datum or no datum. The
  // fill side now reaches one ring further in (`VERGE_FILL_FEATHER`), ring 1
  // arrives at the lane's own level and ring 2 one below it, and not one
  // carriageway block moved — so the datum, F1's inheritance and every seated
  // lot are untouched, which is why `sunkenLamps` below is unmoved at 3: that
  // one is the sidewalk band, and it is a different lever.
  //
  // 32 is two above the pre-flip 30, and those two are the honest residue: a
  // column that neighbours two road cells a block apart takes the **lower** of
  // them (§2.4's tie rule) and stays one under the higher. `plinthRuns` is
  // still 0. On `glowcap_vale` itself the same change reads 78 → 20 proud
  // columns, longest run 14 → 2.
  plinthColumns: 17, // G6 freeze: 34 -> 40, UP by six. The six are isolated (the longest run does not move), so this is junction dressing withdrawing at six places and NOT a carriageway standing up. MUST GO DOWN. ROAD_SOVEREIGN flip: 40 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0 -> 2 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 2 -> 14 — the grade lifts off the drape more often at full authority; runs stay short. The walk judges whether these read as causeway or as mistake. cross verdict (PULL_CROSS, 2026-08-23): 14 -> 17 — three more proud columns as the levelled rows lift off the drape; runs stay short. MUST COME DOWN when the verge/shoulder revival lands.
  plinthLongestRun: 2, // G6 freeze: 5 -> 5, unmoved, which is the half of this pair that carries the argument above. ROAD_SOVEREIGN flip: 5 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0 -> 2 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade.
  stepPlinthColumns: 0, // G6 freeze: 9 -> 15, UP, same cause on the flights. ROAD_SOVEREIGN flip: 15 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  stepPlinthLongestRun: 0, // G6 freeze: 3 -> 8, UP with it. MUST GO DOWN. ROAD_SOVEREIGN flip: 8 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  // 7 → **0**, 84 → 0. No built face on this fixture is five blocks or taller
  // over three columns any more (eb93a54's band-end closure plus the causeway
  // landing, which removed the fills those walls were retaining).
  sheerFaces: 0, // FACE_FINISH flip (2026-08-21): 0 -> 1 — a curb-footed pavement edge now READS as built masonry (geometry unchanged by hash; the painter guarantee); reclassification, not construction. ROAD_SOVEREIGN flip: 1 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  sheerColumns: 0, // FACE_FINISH flip: 0 -> 3, the footed pavement edge's run — reclassified, not constructed. ROAD_SOVEREIGN flip: 3 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  sheerWorstDrop: 0, // FACE_FINISH flip: 0 -> 5 — the reclassified footed edge's full drop; geometry unchanged by hash. ROAD_SOVEREIGN flip: 5 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  kerbStairs: 0, // G6 freeze: 0 -> 0, and trivially — see `junctionColumns`.
};

const STEEP_DRESSING: DressingGoldens = {
  // Same two levers, same direction: 1571 → 594, 551 → 178.
  //
  // **594 → 520 and 178 → 123** with the relief redesign (2026-08-07) — see the
  // hillside rows for the argument. This is the fixture the redesign was
  // diagnosed on: 1,409 flight columns, every one of them paved, and **one
  // stair block in the whole town**, because the tread law read a riser only
  // *ahead* and every flight here leaves its street going down. 126 of those
  // half-treads are now stairs facing back up the rise, which is what takes
  // both rows down. `stepTreadsWithRelief` 555 → 653; stair blocks 7 → 133.
  //
  // Re-pinned from the values HEAD actually produces (594/178 were stale before
  // this wave: HEAD measured 548/133).
  halfTreads: 0, // G6 freeze: 500 -> 323, the tread-mix denominator, decided once instead of rewritten. ROAD_SOVEREIGN flip: 323 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  openSided: 0, // G6 freeze: 112 -> 51. ROAD_SOVEREIGN flip: 51 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  // 2 → 0 and 2 → 0 (eb93a54).
  openOverSoil: 0, // G6 freeze: 0 -> 0, held at the bar.
  floatingDressing: 0, // G6 freeze: 0 -> 1, UP, and a real defect rather than a reclassification: one tread stands with two cells or more of air under it. MUST GO BACK DOWN to 0. ROAD_SOVEREIGN flip: 1 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  streetLamps: 11, // G6 freeze: 11 -> 11, unmoved. flip-debt round (2026-08-21): 11 -> 10. The other direction from the hillside's, same cause: siting against the resolved ground, one post's band column is no longer flat with its neighbours at the prop's own base, so the whole-prop rule refuses it rather than standing it on a step. A refused lamp is a lamp that is not there; a lamp on a step was one that read wrong. n9 retune (tail exponent + closing, 2026-08-23): 10 -> 11 — the denominator, one post: a lamp site the closing leaves flat enough for the whole-prop rule to accept.
  // **0 → 1 at the 8F flip**, one lamp at (8, 30), `sunkenBy` 1,
  // `viaCarriageway`. The same seam as the hillside fixture's three and the
  // same argument — see that row, which carries the column probe. The
  // denominator did not move here, so this fixture shows the effect clean: one
  // of seventeen lamps has a carriageway that climbed a block without it.
  //
  // **ATTRIBUTION FIX (2026-08-19): 17 → 9 lamps, `sunkenLamps` stays 1** — see
  // the hillside row for the rule. Here the arms of the one affected post used
  // to split the finding; now the post at (8, 30) reports once, `sunkenBy` 1,
  // `viaCarriageway`. Same defect, honestly attributed; audit-only, no world
  // bytes moved.
  sunkenLamps: 2, // G6 freeze: 2 -> 3, UP by one, same kerb as the hillside row. MUST GO DOWN. ROAD_SOVEREIGN flip: 3 -> 2 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  deeplySunkenLamps: 2, // G6 freeze: 0 -> 2, UP, and the worse of the two lamp rows: two posts stand two or more below the pavement beside them, which is the slot Kai walked. MUST GO DOWN to 0. ROAD_SOVEREIGN flip: 2 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 0 -> 2 — two lamp sites the deeper cut drops away under. MUST GO DOWN.
  // 11 → 13 cuts, **11 → 0 undressed** (4b18ef5). **13 → 16** with the stoop
  // fix (2026-08-07) — three lane columns beside doorsteps that are nosed where
  // they stand instead of climbing the side of a step. See the hillside row for
  // the argument; `undressedCutoffs` is still nought, which is the bar.
  //
  // **0 → 7 undressed** with the 2026-08-08 walk fixes — see the hillside row
  // for the full argument. This is the fixture Kai walked the defect on: the
  // seven are the treads that used to stand at the foot of a face they could not
  // climb, including the pair at the mangled corner where the carriage spine
  // `sp0` meets the terrace street `hs2_0` three blocks down.
  cutoffColumns: 88, // G6 freeze: 63 -> 106, the denominator. ROAD_SOVEREIGN flip: 106 -> 66 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 66 -> 91 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 91 -> 77 — fourteen fewer cut-off columns as the road claims land at the new levels. cross verdict (PULL_CROSS, 2026-08-23): 77 -> 88 — eleven more cut-off columns as the levelled rows land — the cut/fill debt moving with the re-levelling.
  undressedCutoffs: 88, // G6 freeze: 13 -> 80, UP by 67 — the junction pass's 85 columns, seen from the other side. MUST GO DOWN. ROAD_SOVEREIGN flip: 80 -> 66 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 66 -> 91 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 91 -> 77 — all of them still undressed — the count follows `cutoffColumns` exactly, which is the pair working. cross verdict (PULL_CROSS, 2026-08-23): 77 -> 88 — all of them still undressed — the count follows `cutoffColumns` exactly, which is the pair working. STAIR_DRESS cull fix (2026-08-24): 88 -> 70 — the first DOWN since the freeze: eighteen cutoff columns now carry a stair in their top course, the riser dressing reaching the lawful 1-step members of terraced chains; the pair `cutoffColumns` stays 88, which is the split the dressing was built to make. STAIR_DRESS off by walked verdict (2026-08-24): 70 -> 88 — the eighteen go back to bare, and bare is the ratified look: blocky risers read natural, stair texture does not; the number is the taste, not a regression.
  // The 2c rows (2026-08-08). See the hillside block for what each one is.
  //
  // `cascadeLargest` 31 → **24** is the mangled corner at `(53 … 65, 9 … 12)`,
  // where cobblestone, stone brick and polished andesite met in offset steps —
  // three surfaces' worth of material in a four-row terraced apron. The patch is
  // smaller because the treads that served nothing are gone; what is left is a
  // continuous tread line, which is the other half of the fix (the walked jog at
  // `(62 … 63, 12)` is filled by the alignment round). It MUST GO DOWN further,
  // and the lever is a *flight* between those two streets, not more dressing.
  //
  // **45 → 38 and 24 → 21 at the 8F flip, both DOWN, and this is F2's dividend
  // measured.** The mangled corner is where the carriage spine `sp0` meets the
  // terrace street `hs2_0`: two streets that used to be graded independently
  // and reconciled afterwards by dressing. They now arrive from one datum —
  // `gradeStreetDatum` pins a junction in `compareStreetRank` order, once — so
  // there are seven fewer columns of junction dressing and the worst patch is
  // three columns smaller. `blindStairs` and `strandedTreads`, the two rows
  // that are actually defects, are unmoved at 1 and 1: nothing was hidden, less
  // was needed. It still MUST GO DOWN further and the lever is still a flight.
  junctionColumns: 0, // G6 freeze: 85 -> 0. The pass does not run on-flag; the three rows under it are its subsets and go to zero with it.
  blindStairs: 0, // G6 freeze: 1 -> 0, and NOT a fix: the denominator is zero.
  strandedTreads: 0, // G6 freeze: 1 -> 0, same reading.
  cascadeLargest: 0, // G6 freeze: 21 -> 0, same reading.
  // 3 → 5 columns, longest run 1 → 2, and then **5 → 3, run 2 → 1** with the
  // stoop fix (2026-08-07): the lifts it withdrew were exactly the cells that
  // stood proud of the ground beside them. Small either way; a kerb detail,
  // well under `PLINTH_MIN_RUN`. Pinned so it cannot creep.
  //
  // **3 → 8 columns and run 1 → 3 at the 8F flip. UP** — the same F9 mechanism
  // the hillside fixture's row argues in full, at this fixture's smaller scale:
  // five more columns where the datum holds the carriageway up rather than
  // cutting it in, the longest of them a three-column stretch on
  // `street:segment:hs0_0` at (33, 54). Still less than half `PLINTH_MIN_RUN`,
  // so `plinthRuns` is 0 and `stepPlinthColumns` is still nought on the
  // fixture with 1,409 flight columns. A kerb detail on a steep hill; it did
  // creep, and this is the saying so. MUST GO DOWN — see the hillside row for
  // the two honest levers, neither of which is this wave's.
  //
  // **8 → 5 columns, run 3 → 1** with the verge feather (2026-08-19,
  // `VERGE_FILL_FEATHER`) — see the hillside row for the walked defect and the
  // mechanism. The three-column stretch on `hs0_0` is gone entirely; what is
  // left is five isolated columns, each one beside a road cell that steps.
  plinthColumns: 34, // G6 freeze: 4 -> 2, DOWN. ROAD_SOVEREIGN flip: 2 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0 -> 11 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade. pull retune (boost/peak-keep/sat, 2026-08-22): 11 -> 8, DOWN — the saturated backstop levels runs that half-authority left standing proud. n9 retune (tail exponent + closing, 2026-08-23): 8 -> 34 — the named proud debt scaling with the dial: the steepened tail lifts the grade off the drape far more often. MUST COME DOWN when the verge/shoulder revival lands.
  plinthLongestRun: 8, // G6 freeze: 2 -> 1, DOWN. ROAD_SOVEREIGN flip: 1 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. ROAD_PULL flip: 0 -> 8 — the blend gives cliff roads a graded (still stair-free) profile again; the walk judges this trade.
  // 8 → **0**, and with it the four-column stair-head plinth that was the only
  // plinth with any length on either fixture. The flight-floor fix (eb93a54).
  stepPlinthColumns: 0, // G6 freeze: 6 -> 86, UP by 80, and the largest single move of the flip on this fixture: the flights stand proud where the junction pass used to blend them. MUST GO DOWN. flip-debt round (2026-08-21): 86 -> 88, two more, and they are two flight columns whose neighbouring dressing moved down onto the resolved ground and stopped covering that side. Same defect, two columns wider; the junction pass is still the cause and still the fix. ROAD_SOVEREIGN flip: 88 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  stepPlinthLongestRun: 0, // G6 freeze: 3 -> 17, UP with it, and a seventeen-column run is a length you see. MUST GO DOWN. flip-debt round (2026-08-21): 17 -> 18, one column, the run reaching one further along the same flight as `stepPlinthColumns`' two. Same defect, same cause, same fix. ROAD_SOVEREIGN flip: 18 -> 0 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade.
  // 7 → **2** faces, 73 → **24** columns, worst drop 9 → **6** — the composite
  // gate (`structures/retaining.ts`, 2026-08-07). Six of the seven runs were a
  // *composite*: a face that stacked past `RETAIN_MAX` while every seam obeyed
  // its own limit. Five of them were one 90-column skirt reporting `drop: 6` —
  // the component's **median** — with thirteen columns standing over ground
  // seven blocks down; `facesOf` measures the face the wall would present
  // rather than the summary, and the seam is benched. The other two were walls
  // whose *foot* a later pass dug out — a prop pad four blocks into the
  // hillside, a road shoulder blended down by one — and the wall now declares
  // the ground at its foot so nothing lower-ranked can take it.
  //
  // The two that remain are **both** `clause 9`: single-seam walls at exactly
  // `RETAIN_MAX`, sanctioned on purpose, which is the half of this that is
  // Kai's aesthetic call after a walk and not a compiler's. The compile report
  // now carries "built faces by finished drop" so that call has numbers behind
  // it. They still MUST GO DOWN, but only by a decision, not by a fix.
  sheerFaces: 7, // G6 freeze: 9 -> 2, DOWN by seven, and the best row of the flip: the seam builder no longer runs a face down to a ground a later pass moved. ROAD_SOVEREIGN flip: 2 -> 1 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 1 -> 2 — one more sanctioned single-seam face at the new road levels. cross verdict (PULL_CROSS, 2026-08-23): 2 -> 7 — five more sanctioned single-seam faces where the levelled streets cut the hill; read it beside `sheerColumns`. MUST COME DOWN with the shoulder revival.
  sheerColumns: 163, // FACE_FINISH flip: 7 -> 9 — two pavement-edge columns joined by the underbelly footing; same reclassification as the hillside row. ROAD_SOVEREIGN flip: 9 -> 4 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 4 -> 112 — the steepened tail leaves far more built face standing sheer — pinned beside `sheerFaces` so the scale is not hidden. MUST COME DOWN with the shoulder revival. cross verdict (PULL_CROSS, 2026-08-23): 112 -> 163 — the re-levelled rows leave more built face standing sheer — pinned beside `sheerFaces` so the scale is not hidden. MUST COME DOWN with the shoulder revival.
  sheerWorstDrop: 25, // FACE_FINISH flip: 6 -> 7 — the deepest reclassified pavement edge; geometry unchanged by hash. ROAD_SOVEREIGN flip: 7 -> 5 — draped roads inherit terrain risers; stairs off by ratified directive; the walk judges this trade. n9 retune (tail exponent + closing, 2026-08-23): 5 -> 25 — the deepest sheer face the steepened tail leaves; a twenty-five-block drop is a length you see. MUST COME DOWN with the shoulder revival.
  // 11F: 0 -> 1, UP, and a defect: see the assertion in `DEFECT GOLDEN 2c`.
  kerbStairs: 0, // G6 freeze: 1 -> 0, and trivially — see `junctionColumns`.
};

const scratch: string[] = [];
afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

async function audit(example: string, name: string): Promise<WalkabilityReport> {
  const doc = JSON.parse(await readFile(path.join(EXAMPLES, example), "utf8")) as unknown;
  const root = await mkdtemp(path.join(tmpdir(), "terrainist-walk-"));
  scratch.push(root);
  const compiled = await compileTerrain(doc, {
    outDir: path.join(root, name),
    walkability: { worstJunctions: 40 },
  });
  if (!compiled.ok) throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
  const report = compiled.walkability;
  if (report === undefined) throw new Error("the audit did not run");
  return report;
}

describe("the walkability audit", () => {
  let hillside: WalkabilityReport;
  let steep: WalkabilityReport;

  beforeAll(async () => {
    [hillside, steep] = await Promise.all([
      audit("site-plan-hillside.loam.json", "hillside_town"),
      audit("site-plan-hillside-steep.loam.json", "hillside_town_steep"),
    ]);
  }, 240_000);

  /* --- the constants are judgements, and a reader should see them --------- */

  it("states its own rules as numbers", () => {
    // Two columns of run per block of fall: a comfortable outdoor stair, and
    // Kai's rule that a connection must earn its drop.
    expect(EARN_RATIO).toBe(2);
    // Far enough to walk round a block looking for the way up.
    expect(SERVICE_REACH).toBeGreaterThanOrEqual(3 * 16);
    // A stub of one or two columns is a kerb detail, not a path into a field.
    expect(MIN_DANGLE).toBe(3);
    // A tread, a course of dressing over it, a landing cut under it.
    expect(LEVEL_SLACK).toBe(3);
    // A lamp stands on the outer sidewalk column, so its own carriageway is two
    // columns away; anything further is a different street, and measuring
    // against it turns a hill into a defect.
    expect(FURNITURE_REACH).toBe(2);
    // Carriageway, kerb, footway and a column of slack for a building's apron.
    expect(PLATFORM_BAND).toBe(5);
    // Six columns of both-sides plinth is a run you see; two is a kerb.
    expect(PLINTH_MIN_RUN).toBe(6);
    // Below `RETAIN_MAX` on purpose: the tallest wall the compiler will build is
    // already taller than Kai wants to walk past, so a detector pinned at the
    // sanctioned ceiling would read zero and prove nothing.
    expect(SHEER_DROP).toBeLessThan(6);
    expect(SHEER_RUN).toBe(3);
  });

  /* --- the goldens -------------------------------------------------------- */

  for (const [name, golden, dressed, get] of [
    ["site-plan-hillside", HILLSIDE, HILLSIDE_DRESSING, (): WalkabilityReport => hillside],
    ["site-plan-hillside-steep", STEEP, STEEP_DRESSING, (): WalkabilityReport => steep],
  ] as const) {
    describe(name, () => {
      it("measures the paved network at the size it was measured at", () => {
        expect(get().columns).toBe(golden.columns);
      });

      it("DEFECT GOLDEN — columns declared walkable that something stands on", () => {
        // MUST GO DOWN. Fixing the flight cross-section is the lever.
        expect(get().buried).toBe(golden.buried);
      });

      it("DEFECT GOLDEN — the network is in pieces", () => {
        // MUST GO DOWN, towards 1. The target is one component holding the
        // entrance, every street, every flight and every doorstep.
        expect(get().components.length).toBe(golden.components);
        expect(get().orphanColumns).toBe(golden.orphans);
      });

      it("DEFECT GOLDEN — how much of the town a traveller who walks in reaches", () => {
        // MUST GO UP, towards 1 on both fixtures.
        expect(get().entranceReachable).toBe(golden.entranceReachable);
        expect(get().entranceReachableShare).toBeCloseTo(golden.entranceReachableShare, 3);
        // The ground control, added with the domain fix (2026-08-07).
        expect(get().groundReachable).toBe(golden.groundReachable);
        expect(get().groundReachableShare).toBeCloseTo(golden.groundReachableShare, 3);
      });

      it("DEFECT GOLDEN — flights and streets whose far end joins nothing", () => {
        // MUST GO DOWN, towards 0.
        expect(get().deadEnds.length).toBe(golden.deadEnds);
      });

      it("DEFECT GOLDEN — clutter, at junctions and at solo locations", () => {
        // The junction number MUST GO DOWN. The solo number is the control: a
        // fix that lowers both equally has made the town emptier rather than
        // less of a maze, which is not what anybody asked for.
        expect(get().junctionDensity).toBeCloseTo(golden.junctionDensity, 3);
        expect(get().soloDensity).toBeCloseTo(golden.soloDensity, 3);
      });

      it("DEFECT GOLDEN — mid-town faces whose drop no route earns", () => {
        // MUST GO DOWN, towards 0 — and **not** by making the faces shorter.
        // A six-block face with a twelve-column stair passes this test.
        expect(get().faceRuns).toBe(golden.faceRuns);
        expect(get().unservedFaces).toBe(golden.unservedFaces);
      });

      /* --- the dressing audit ------------------------------------------- */

      it("DEFECT GOLDEN 1 — dressing cantilevered over open ground", () => {
        // `openOverSoil` MUST GO DOWN, to 0. `halfTreads` and `openSided` are
        // the denominators and are pinned so that a fix which lowers the defect
        // by deleting the tread mix is visible as such rather than as a win.
        expect(get().dressing.halfTreads).toBe(dressed.halfTreads);
        expect(get().dressing.openSided).toBe(dressed.openSided);
        expect(get().dressing.openOverSoil).toBe(dressed.openOverSoil);
        expect(get().dressing.floatingDressing).toBe(dressed.floatingDressing);
      });

      it("DEFECT GOLDEN 2 — sunken furniture and undressed cuts", () => {
        // `sunkenLamps` and `undressedCutoffs` MUST GO DOWN, to 0.
        // `streetLamps` is the denominator: a fix that stops planting lamps
        // would take the defect with it and must not read as a success.
        expect(get().dressing.streetLamps).toBe(dressed.streetLamps);
        expect(get().dressing.sunkenLamps).toBe(dressed.sunkenLamps);
        expect(get().dressing.deeplySunkenLamps).toBe(dressed.deeplySunkenLamps);
        expect(get().dressing.cutoffColumns).toBe(dressed.cutoffColumns);
        expect(get().dressing.undressedCutoffs).toBe(dressed.undressedCutoffs);
      });

      it("DEFECT GOLDEN 2c — the junction pass inside its own remit", () => {
        // `blindStairs` and `strandedTreads` MUST GO DOWN, to 0.
        // `junctionColumns` is the denominator and `cascadeLargest` is the
        // scale: a reconciliation pass fixes seams, so its largest connected
        // patch of dressing is a junction and not a hillside.
        expect(get().dressing.junctionColumns).toBe(dressed.junctionColumns);
        expect(get().dressing.blindStairs).toBe(dressed.blindStairs);
        expect(get().dressing.strandedTreads).toBe(dressed.strandedTreads);
        expect(get().dressing.cascadeLargest).toBe(dressed.cascadeLargest);
        // Every stair the pass laid that has no low side is either a step up out
        // of flat pavement — the one honest shape — or a defect. The `kerb`
        // bucket stood at nought on both fixtures until **11F**, when the steep
        // fixture gained one: a stair laid against the coping of a tier stack,
        // which is a kerb with a wall behind it. Pinned per fixture rather than
        // asserted at zero, because zero-on-both is no longer true and hiding
        // that behind a shared assertion would be the exact dishonesty the rest
        // of this module exists to prevent. It MUST GO BACK DOWN to 0.
        expect(get().dressing.sunkenStairCensus["kerb"] ?? 0).toBe(dressed.kerbStairs);
      });

      it("DEFECT GOLDEN 3 — road standing proud of the ground on both sides", () => {
        // MUST GO DOWN. Both fixtures read close to nought today, which is the
        // finding: the plinth Kai walked is not a carriageway phenomenon on
        // these two documents. The rows are pinned anyway, because a fix aimed
        // at the *other* three defects is exactly the kind of change that would
        // create this one.
        expect(get().dressing.plinthColumns).toBe(dressed.plinthColumns);
        expect(get().dressing.plinthLongestRun).toBe(dressed.plinthLongestRun);
        expect(get().dressing.stepPlinthColumns).toBe(dressed.stepPlinthColumns);
        expect(get().dressing.stepPlinthLongestRun).toBe(dressed.stepPlinthLongestRun);
      });

      it("DEFECT GOLDEN 4 — sheer built faces with no bench", () => {
        // MUST GO DOWN, to 0 — and by benching or shortening the face, not by
        // hiding it: `sheerColumns` is pinned beside the run count so that
        // splitting one long face into three short ones cannot read as progress.
        expect(get().dressing.sheerFaces).toBe(dressed.sheerFaces);
        expect(get().dressing.sheerColumns).toBe(dressed.sheerColumns);
        expect(get().dressing.sheerWorstDrop).toBe(dressed.sheerWorstDrop);
      });

      it("names the pass that built every sheer face it lists", () => {
        // The finding has to be actionable: a face with no owner is a complaint.
        //
        // **Re-pinned at WP-G4's flip: `retaining` → `seam-finish`.** The
        // diagnosis is unchanged and the name of the builder is the whole of the
        // change — every sheer run on the steep fixture is now the terminal seam
        // builder's, because the skirt it used to come from is absorbed and
        // `finishSeams` builds the derived complement. Both names are accepted
        // rather than the new one alone: the flag-off fallback still attributes
        // to `retaining`, and a face attributed to a *third* pass would be a
        // finding either way, which is what this assertion is for.
        for (const face of get().dressing.worstSheer) {
          const owners = Object.keys(face.byEmitter);
          if (owners.length === 0) continue;
          // Re-pinned at the FACE_FINISH flip (2026-08-21): the underbelly clause
          // foots paved edges in curb material, so a pavement's face now reads
          // as street-built masonry — which it is. 'streets' joins the accepted
          // emitters; a FOURTH name would still be a finding.
          expect(["retaining", "seam-finish", "streets"]).toContain(owners[0]);
        }
      });
    });
  }

  /* --- what the audit is *for*: the meta-diagnosis, as an assertion ------- */

  it("finds clutter concentrated where two emitters meet — and not only there", () => {
    // The claim this module was built to test: the defects are emergent at
    // co-locations. On the hillside fixture the worst junctions do run several
    // times the solo baseline, and every one of the worst four is a flight
    // crossing another flight — a pair of passes, each individually correct.
    expect(hillside.junctionDensity).toBeGreaterThan(hillside.soloDensity);
    const worst = hillside.junctions.slice(0, 4);
    expect(worst).toHaveLength(4);
    for (const junction of worst) {
      expect(junction.density).toBeGreaterThan(3 * hillside.soloDensity);
      expect(junction.meets.length).toBeGreaterThanOrEqual(2);
    }
    // …and the half of the claim the instrument refuted on 2026-08-06: the worst
    // *solo* place was then within a tenth of the worst junction (1.193 against
    // 1.283), so one pass on its own was already nearly as bad as two meeting.
    //
    // **That half is now fixed.** The solo defect *was* the flight's own
    // cross-section, and with the balustrade off the carriageway the worst solo
    // place is 0.559 against a worst junction of 0.806 — comfortably below it.
    // Pinned in the direction it now runs, so a change that lets a single pass
    // clutter its own width again is caught: the co-location story is once more
    // the whole story, and junctions are the remaining lever.
    //
    // **Re-pinned at the `ROAD_SOVEREIGN` flip, and the half that was fixed is
    // back.** 0.559 against 0.806 becomes 0.600 against 0.646 — the worst solo
    // place is within a tenth of the worst junction again, exactly the shape
    // the instrument refuted on 2026-08-06. The mechanism is not a regression
    // in the flight's cross-section: the flights are gone. A draped road
    // inherits the terrain's risers and lays no stair, so the clutter that
    // remains is one street's own dressing over its own width, and there is
    // less of it *everywhere* — both densities fell (junction 0.171 → 0.139,
    // solo 0.047 → 0.040). The ratio is pinned at its measured value rather
    // than at a bar the flag cannot clear, so the row still fails on a change
    // that moves it; whether a town this bare reads better is the walk's call.
    expect(hillside.soloWorstDensity).toBeCloseTo(0.621, 3);
    expect(hillside.worstDensity).toBeCloseTo(0.646, 3);
  });

  it("attributes every course it counts to the pass that placed it", () => {
    // No `unattributed` bucket anywhere: the block spans cover the whole list,
    // which is the property that makes a finding actionable rather than a
    // complaint.
    for (const junction of [...hillside.junctions, ...steep.junctions]) {
      const attributed = Object.values(junction.byEmitter).reduce((a, b) => a + b, 0);
      expect(attributed).toBe(junction.courses);
    }
  });

  it("names what is left standing on the flights, now that it is nearly nothing", () => {
    // This assertion used to say "the balustrade owns nine tenths of `buried`",
    // at 1054 columns and then at 120. **The flight-floor fix (eb93a54) took the
    // denominator to 19**, and at 19 columns an ownership share is noise: eleven
    // are on `street:segment:*` (the spine's nine, `dn1_64`'s two), six are the
    // plaza's and two the terrace lanes'. It reads 0.579.
    //
    // So the test is re-pinned as what it can still honestly assert: the flights
    // are no longer the dominant owner, and the absolute count on them is small.
    // Both bounds MUST hold as `buried` falls further. If a change puts the
    // flights back above 0.85 of a *large* `buried`, the count bound catches it.
    const bySteps = Object.entries(hillside.buriedByEmitter).filter(([e]) =>
      /segment:(dn|sp)/.test(e),
    );
    const onSteps = bySteps.reduce((sum, [, n]) => sum + n, 0);
    //
    // **11F**: `buried` went 19 → 22 — three columns of a tier stack's coping
    // standing on declared lane — so the count bound moves with it and the
    // flights' share bound does not. The flights are still not the owner: their
    // eleven are unchanged, which is the half of this test that is load-bearing.
    // ROAD_PULL flip: 11 -> 34 and 22 -> 40 — a road pulled off the drape
    // towards the graded profile stands over more of what the audit declares
    // walkable; re-pinned at the measured flag-on bounds, and the walk judges it.
    // pull retune (boost/peak-keep/sat, 2026-08-22): 34 -> 52 and 40 -> 58 —
    // full authority grades harder, and the unfeathered cut faces (the named
    // shoulder debt) bury more of the audit's walkable edge. MUST COME DOWN
    // when the shoulders return.
    expect(onSteps).toBeLessThanOrEqual(52);
    expect(hillside.buried).toBeLessThanOrEqual(58);
  });
});
