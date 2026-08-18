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
  columns: 3973,
  // 120 → 19. **The flight-floor fix (eb93a54)** — a flight lies in the ground
  // rather than on it, so the rail no longer stands on its own carriageway
  // anywhere. What is left is nine columns on the spine, the plaza's six, and
  // four on the terrace lanes.
  buried: 19,
  // 15 → 10, and 797 → **9**. **The causeway landing (b90f87a).** This is the
  // lever the old comment on `deadEnds` said had been implemented, measured and
  // reverted because it broke the steep fixture's §5.5 planning; it landed for
  // real this wave, and it reads exactly what that measurement predicted:
  // ten components, nine orphan columns, 0.2% of the paving.
  components: 10,
  orphans: 9,
  // 0.998 → **1.000** (domain fix, 2026-08-07): the flood now runs over all
  // standable ground rather than over declared paving alone, so the nine
  // orphan columns that a walker reaches across two blocks of grass are
  // reached. Every laid column but one is reachable on foot from the entrance.
  //
  // **3971 → 3972** at the 8F flip, which is `columns` above moving with its
  // numerator: the one new standable column is reachable like the rest of them,
  // and the share is still 1. The invariant this row is really for — "every
  // laid column but one" — is unchanged.
  entranceReachable: 3972,
  entranceReachableShare: 1,
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
  groundReachable: 185667,
  groundReachableShare: 0.709,
  // 5 → 3. Same commit: the dangling connectors *were* the dead ends.
  deadEnds: 3,
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
  junctionDensity: 0.171,
  soloDensity: 0.042,
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
  faceRuns: 1,
  unservedFaces: 0,
};

const STEEP: Goldens = {
  // 4453 → 4216 (b90f87a, eb93a54), 211 → 110 — the same two levers, and the
  // same direction, at two thirds the effect: this fixture's flights are longer
  // so more of the buried count was rail on carriageway.
  columns: 4216,
  buried: 110,
  // 9 → **12** and 941 → 649. The count went UP and the area went down, and
  // both are the causeway landing (b90f87a): refusing the lowest street's
  // connectors splits off three small pieces that the causeways used to bridge,
  // while removing 292 columns of paving that led nowhere. This is a decision,
  // not a regression — but the component count is a row that MUST come back
  // DOWN, and on this fixture the entrance share below says why it matters.
  components: 12,
  orphans: 649,
  // 0.150 → **1.000**, and this row is why the domain was fixed. Kai walked
  // `hillside_town_steep-5` on 2026-08-07 and reached 100% of the town on foot
  // by intended paths; the instrument said 15%. It was the instrument: the
  // flood ran over declared paving only, so the natural terrace ground that
  // bridges these flights everywhere was not in the graph and the town read as
  // path-islands. Over all standable ground, every laid column but one is
  // reachable. `components` below stays network-scoped by design.
  entranceReachable: 4215,
  entranceReachableShare: 1,
  // **136343 → 136349** with the archetype-bias wiring (2026-08-11), same
  // cause as the hillside fixture. BY DESIGN.
  groundReachable: 136349,
  groundReachableShare: 0.755,
  // 7 → **10**, up, and the same trade as `components`: the refused causeways
  // leave the streets they used to terminate hanging. MUST GO DOWN.
  deadEnds: 10,
  // 0.142 → 0.124, 0.082 → 0.043 (eb93a54, 4b18ef5). **0.124 → 0.125** with
  // the stoop fix (2026-08-07), for the reason the hillside row gives: three
  // fewer lifts, a marginally smaller denominator, an unmoved numerator.
  // **0.125 → 0.126** at wave close (2026-08-07, composed tree): the relief
  // redesign's dressed landings shave the walkable denominator once more;
  // the clutter numerator has not moved since the stoop fix.
  junctionDensity: 0.126,
  // 0.043 → 0.044 at wave close, the same denominator shave as the row above.
  soloDensity: 0.044,
  // 3 → 4 runs, and 0 unserved still. The extra run is a face the causeway
  // removal exposed; every one of the four is earned.
  faceRuns: 4,
  unservedFaces: 0,
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
  halfTreads: 300,
  openSided: 36,
  // **1 → 0.** The floating slab over exposed dirt is gone from this fixture,
  // and not by deleting the tread mix — `openSided` fell with it because the
  // flights sit lower, not because the slabs went away.
  openOverSoil: 0,
  // 3 → 0 (eb93a54).
  floatingDressing: 0,
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
  streetLamps: 30,
  sunkenLamps: 3,
  deeplySunkenLamps: 0,
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
  cutoffColumns: 12,
  undressedCutoffs: 5,
  // The 2c rows (2026-08-08), pinned from the first compile that has them.
  // `blindStairs` and `strandedTreads` MUST GO DOWN, to 0. `junctionColumns` is
  // the denominator: a "fix" that stops laying junction dressing altogether
  // would take both defects with it and must not read as a win.
  //
  // The one blind stair left on this fixture is at `(50, 70, 227)` — a lane
  // tread facing a column that reads back as no surface at all, beside the
  // lower cottage's doorstep. It is the same site on both fixtures.
  junctionColumns: 11,
  blindStairs: 1,
  // `(75, 70, 244)`, both fixtures: a tread whose four neighbours all read back
  // as unstandable. The columns round it are declared paving that the audit
  // counts as `buried` — a defect of a different pass, showing up here.
  strandedTreads: 1,
  // A point seam is a handful of columns. Four.
  cascadeLargest: 4,
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
  plinthColumns: 49,
  plinthLongestRun: 5,
  stepPlinthColumns: 0,
  stepPlinthLongestRun: 0,
  // 7 → **0**, 84 → 0. No built face on this fixture is five blocks or taller
  // over three columns any more (eb93a54's band-end closure plus the causeway
  // landing, which removed the fills those walls were retaining).
  sheerFaces: 0,
  sheerColumns: 0,
  sheerWorstDrop: 0,
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
  halfTreads: 520,
  openSided: 123,
  // 2 → 0 and 2 → 0 (eb93a54).
  openOverSoil: 0,
  floatingDressing: 0,
  streetLamps: 17,
  // **0 → 1 at the 8F flip**, one lamp at (8, 30), `sunkenBy` 1,
  // `viaCarriageway`. The same seam as the hillside fixture's three and the
  // same argument — see that row, which carries the column probe. The
  // denominator did not move here, so this fixture shows the effect clean: one
  // of seventeen lamps has a carriageway that climbed a block without it.
  sunkenLamps: 1,
  deeplySunkenLamps: 0,
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
  cutoffColumns: 16,
  undressedCutoffs: 7,
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
  junctionColumns: 38,
  blindStairs: 1,
  strandedTreads: 1,
  cascadeLargest: 21,
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
  plinthColumns: 8,
  plinthLongestRun: 3,
  // 8 → **0**, and with it the four-column stair-head plinth that was the only
  // plinth with any length on either fixture. The flight-floor fix (eb93a54).
  stepPlinthColumns: 0,
  stepPlinthLongestRun: 0,
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
  sheerFaces: 2,
  sheerColumns: 24,
  sheerWorstDrop: 6,
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
        // of flat pavement — the one honest shape — or a defect. Nothing lives
        // in the `kerb` bucket any more: the pass stopped laying them.
        expect(get().dressing.sunkenStairCensus["kerb"] ?? 0).toBe(0);
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
        // Every attributed run on both fixtures is `retaining`'s, which is the
        // diagnosis — this is `treatmentForEdge` rule 9 doing what it is written
        // to do, plus faces that *stack* past `RETAIN_MAX` because the wall's own
        // foot sits on another drop.
        for (const face of get().dressing.worstSheer) {
          const owners = Object.keys(face.byEmitter);
          if (owners.length === 0) continue;
          expect(owners[0]).toBe("retaining");
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
    expect(hillside.soloWorstDensity).toBeLessThan(0.8 * hillside.worstDensity);
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
    expect(onSteps).toBeLessThanOrEqual(11);
    expect(hillside.buried).toBeLessThanOrEqual(19);
  });
});
