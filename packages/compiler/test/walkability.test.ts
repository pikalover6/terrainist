/**
 * The walkability audit, pointed at the two hillside fixtures.
 *
 * **Every number in `HILLSIDE` and `STEEP` below is a defect golden.** They are
 * not targets and they are not a specification; they are a measurement of how
 * badly this compiler's passes add up on a hill, taken on 2026-08-07 against
 * `bbcefde`, so that the next person to touch the flights, the balustrade or the
 * hillside planner can see in one run whether they helped. **They must go DOWN.**
 * A change that moves one of them up is either a regression or a decision, and
 * either way it has to be argued for in the diff rather than absorbed by a
 * `toBeLessThan`.
 *
 * Why these numbers and not a pass/fail bar: the defects Kai walked are not the
 * failure of any one pass, so there is no pass whose test could have caught
 * them. Every fix of the last three rounds verified green on the metric its own
 * pass owns. What was missing was a ruler laid across the *sum* — the whole
 * paved network as one graph — and the interesting thing about that ruler is
 * that on this world it reads:
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
  /** Can a traveller walk in from the external road? */
  readonly entranceConnected: boolean;
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

const HILLSIDE: Goldens = {
  columns: 4740,
  // 1054 — of which 1050 are the ten `steps` segments, whose balustrade stands
  // on the flight's own declared carriageway (`street-stairs.ts`'s `parapet`
  // offset). See the diagnosis in the module note: at `lane` width the tread
  // band is one column and the parapet takes the two beside it.
  buried: 1054,
  components: 54,
  orphans: 3262,
  entranceConnected: true,
  deadEnds: 6,
  junctionDensity: 0.456,
  soloDensity: 0.299,
  faceRuns: 30,
  unservedFaces: 26,
};

const STEEP: Goldens = {
  columns: 3588,
  buried: 1185,
  components: 53,
  orphans: 2500,
  // The steep fixture's road never reaches the town at all, which is the
  // starkest single reading either of these worlds produces.
  entranceConnected: false,
  deadEnds: 7,
  junctionDensity: 0.389,
  // Higher than its own junction density, and the one place the two fixtures
  // disagree: on the steep hill the flights are so long that most of their
  // length is *solo*, so the balustrade dominates the control too.
  soloDensity: 0.47,
  faceRuns: 26,
  unservedFaces: 16,
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
  });

  /* --- the goldens -------------------------------------------------------- */

  for (const [name, golden, get] of [
    ["site-plan-hillside", HILLSIDE, (): WalkabilityReport => hillside],
    ["site-plan-hillside-steep", STEEP, (): WalkabilityReport => steep],
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

      it("DEFECT GOLDEN — whether a traveller can walk into town", () => {
        // MUST GO UP, to true on both fixtures.
        expect(get().entranceConnected).toBe(golden.entranceConnected);
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
    // …and the half of the claim that the instrument refutes, pinned so nobody
    // reads the line above as the whole story: the worst *solo* place is within
    // a tenth of the worst junction. Something one pass does on its own is
    // already this bad, and the junctions compound it rather than cause it.
    expect(hillside.soloWorstDensity).toBeGreaterThan(0.9 * hillside.worstDensity);
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
    // The single biggest number in the report, and its owner. Every `steps`
    // segment loses most of its declared width to its own parapet.
    const bySteps = Object.entries(hillside.buriedByEmitter).filter(([e]) =>
      /segment:(dn|sp)/.test(e),
    );
    const onSteps = bySteps.reduce((sum, [, n]) => sum + n, 0);
    expect(onSteps / hillside.buried).toBeGreaterThan(0.9);
  });
});
