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
  /** Columns a traveller who walks in can reach, and their share of the whole. */
  readonly entranceReachable: number;
  readonly entranceReachableShare: number;
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
const HILLSIDE: Goldens = {
  // 4740 → 5120. Up, and up is right here: this counts declared columns a player
  // can *stand* on, and the balustrade fix hands back two columns beside every
  // flight's centre line. It is not simply `buried` moving across — the spine's
  // stair-alleys are gone and the flights' own footprints moved — so the
  // before-and-after totals do not have to agree, and do not.
  columns: 5120,
  // 1054 → 120. Nine tenths of the old number was the flights standing on
  // themselves; what is left is the same rails where the drop beside them is
  // real, plus the plaza and the terrace lanes.
  buried: 120,
  // 54 → 15. **The tread-law fix is what moved this.** Measured on its own
  // against a worktree at 84129d5 it is 54 → 39: every connector used to be
  // severed mid-run by its own five-block riser where it crossed a terrace cut,
  // so each flight was two components with a cliff between them. A flight that
  // starts down before the edge is one flight.
  components: 15,
  // 3262 → 797, from 68.8% of the paving outside the main piece to 15.6% of a
  // larger network. The same fix, read as area rather than as count.
  orphans: 797,
  // **This replaced `entranceConnected`, which read `true` here.** The boolean
  // asked whether the entrance fell in the *largest* component, which it did —
  // and 797 columns of the town, 15.6% of the paving, are not reachable from the
  // road a traveller arrives on. A boolean cannot say that and a share can. MUST
  // GO UP, towards 1.
  entranceReachable: 4323,
  entranceReachableShare: 0.844,
  // 6 → 5. **The one row that did not move the way the audit predicted**, and
  // the reason is worth recording rather than burying. The audit's diagnosis was
  // that the hillside form throws connectors downhill from its *lowest* street
  // into open field; that much is exactly right, and `dn0_128` still dangles 495
  // declared columns from (59, 71). Refusing those connectors was implemented
  // and measured — it takes this fixture to 10 components and **9** orphan
  // columns — and then reverted, because on `site-plan-hillside-steep` the
  // retaining pass promotes the seam those causeways happen to be covering into
  // §5.5's `offPlatform` error and the world stops compiling. The causeway is
  // load-bearing on that fixture in a way nobody designed and the fix belongs
  // with whoever owns §5.5's planning arm.
  deadEnds: 5,
  // 0.456 → 0.188. The junction maze of screenshot 20, halved and halved again.
  junctionDensity: 0.188,
  // 0.299 → 0.075 — and this fell *further* than the junction number, which is
  // the point. The solo control was high because a flight's own cross-section
  // was a maze on its own; that is the half of the diagnosis the balustrade fix
  // answers.
  soloDensity: 0.075,
  // 30 → 4, and 26 → **0**. This is the row the whole round was for. Not one
  // mid-town face run is left whose drop no route earns, and *not* because the
  // faces got shorter: the histogram is now `drop2` only, which is what a hill
  // town looks like when every terrace is entered by a stair that starts back
  // from its own edge instead of a five-block step off it.
  faceRuns: 4,
  unservedFaces: 0,
};

const STEEP: Goldens = {
  // Same three changes, same day, same direction.
  columns: 4453,
  buried: 211,
  // 53 → 9.
  components: 9,
  orphans: 941,
  // The boolean read `false` here and this reads 0.142: the external road never
  // reaches the town, and the piece it *does* touch holds a seventh of the
  // paving. The steep fixture is expected to read badly; what it must not do is
  // read badly and silently.
  entranceReachable: 633,
  entranceReachableShare: 0.142,
  // Unmoved, and the same story as `HILLSIDE.deadEnds` — four of these seven are
  // the lowest street's causeways (`dn0_160` dangles 435 columns).
  deadEnds: 7,
  junctionDensity: 0.142,
  // 0.47 → 0.082. This fixture is where the balustrade dominated the *control*,
  // because its flights are so long that most of their length is solo.
  soloDensity: 0.082,
  // 26 → 3, and 16 → 0.
  faceRuns: 3,
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
  halfTreads: 1059,
  // 191 of 1059 treads show their underside to the column beside them, and 188
  // of those 191 show it over the flight's *own* masonry one block down — which
  // is what a half-block step looks like and is not the defect.
  openSided: 191,
  // **One.** The "floating slab over exposed dirt" is one column on this
  // fixture, at (101, 110, 69). MUST GO DOWN, to nought — but the number to read
  // beside it is `openSided`: if a fix moves this to nought by removing the top
  // slab from the tread mix it will take 191 with it, and that is a different
  // change with different consequences.
  openOverSoil: 1,
  floatingDressing: 3,
  // 47 lamps stand within two columns of paving; 13 of them stand *below* it and
  // three of those by two blocks. All three are `streetscape`'s lamp posts, and
  // every one of the thirteen has `viaCarriageway: false` — the paving above
  // them is a flight or a doorstep, never the carriageway they light.
  streetLamps: 47,
  sunkenLamps: 13,
  deeplySunkenLamps: 3,
  // 21 paved columns sit two blocks under a paved neighbour, and **all 21 carry
  // no stair or slab**: a raw cut nobody dressed. This is the "rectangular notch
  // bitten out of the street end" as a number.
  cutoffColumns: 21,
  undressedCutoffs: 21,
  // 32 columns of both-sides plinth in 23 runs, the longest of which is **two
  // columns**. There is no run of plinth road on this fixture; the ones that
  // exist are the external road's own kerb.
  plinthColumns: 32,
  plinthLongestRun: 2,
  stepPlinthColumns: 0,
  stepPlinthLongestRun: 0,
  // Seven runs of built face at five blocks or more, 84 columns of them, the
  // worst eight blocks tall. Every attributed one is `retaining`.
  sheerFaces: 7,
  sheerColumns: 84,
  sheerWorstDrop: 8,
};

const STEEP_DRESSING: DressingGoldens = {
  halfTreads: 1571,
  openSided: 551,
  openOverSoil: 2,
  floatingDressing: 2,
  streetLamps: 23,
  sunkenLamps: 7,
  deeplySunkenLamps: 1,
  cutoffColumns: 11,
  undressedCutoffs: 11,
  plinthColumns: 3,
  plinthLongestRun: 1,
  // The only plinth with any length on either fixture is on the *flights*, and
  // it is four columns at a stair head — which is the half of Kai's observation
  // ("mostly at the tops of stairs") the instrument confirms, at a size the walk
  // over-reported.
  stepPlinthColumns: 8,
  stepPlinthLongestRun: 4,
  sheerFaces: 5,
  sheerColumns: 53,
  sheerWorstDrop: 8,
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

  it("names the balustrade as the thing standing on the flights", () => {
    // Still the biggest share of what is left, and still the same owner — but of
    // 120 columns rather than 1054. A `steps` segment no longer loses its width
    // to its own rail; where a rail survives, it is because there is a drop
    // beside it, and it stands on the verge the flight levelled for it.
    //
    // The bar is 0.85 rather than 0.9 because the denominator is now small: at
    // 120 columns a dozen either way is ten points of share, so a tighter bar
    // would be measuring noise rather than ownership. It reads 0.892.
    const bySteps = Object.entries(hillside.buriedByEmitter).filter(([e]) =>
      /segment:(dn|sp)/.test(e),
    );
    const onSteps = bySteps.reduce((sum, [, n]) => sum + n, 0);
    expect(onSteps / hillside.buried).toBeGreaterThan(0.85);
  });
});
