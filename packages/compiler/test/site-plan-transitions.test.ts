/**
 * **WP-3 — transitions by context, not by drop alone**
 * §5, and §10's rows for this package).
 *
 * Kai's remaining complaint on the accepted `hillside` form was *sheer
 * platform-to-platform dropoffs mid-town*. §5's answer is that a transition is
 * chosen from what the edge knows — the room beyond it, what is pressing on it,
 * whether it is a cut or a fill, what the terrace has left once the treatment is
 * paid for, and what the district can still afford in masonry — and that the
 * drop, on its own, decides almost nothing.
 *
 * **Every property here is written from that document and not from the
 * implementation**, which §10 states as a prohibition and gives its reason: a
 * test written by reading the code once pinned a defect in place for weeks. The
 * numbers that are goldens are marked as goldens and say what they were measured
 * on.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileTerrain } from "../src/terrain/compile.js";
import {
  BENCH_FACE,
  BENCH_TREAD,
  BUILT_SHARE,
  EDGE_PRESSED_SHARE,
  MIN_EDGE_DEPTH,
  MIN_RETAIN_RUN,
  RETAIN_MAX,
  SEAM_TIER_MAX,
  bankRun,
  benchedRun,
  seamContext,
  treatmentForEdge,
  treatmentForSeam,
  type EdgeContext
} from "../src/layout/levels.js";
import { MIN_BUILDABLE_DEPTH } from "../src/layout/forms/hillside.js";
import { MIN_INFILL_SIDE } from "../src/layout/district-constants.js";
import { WALL_COLUMNS_PER_DWELLING } from "../src/layout/district-replanning.js";
import { RETAIN_BUILT_SHARE } from "../src/structures/retaining.js";

const scratch: string[] = [];
afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

/** An edge under no pressure at all, which every case below varies one field of. */
function edge(over: Partial<EdgeContext>): EdgeContext {
  return {
    drop: 4,
    run: 40,
    availableRun: 0,
    adjacentUse: "natural",
    access: "private",
    depthAfter: 20,
    side: "fill",
    budget: 1_000,
    builtShare: 0,
    pressedShare: 1,
    ...over
  };
}

/* -------------------------------------------------------------------------- */
/* §5.1 — one table, proven to be one table                                    */
/* -------------------------------------------------------------------------- */

describe("there is exactly one drop table and it stays that way (§5.1)", () => {
  it("reduces treatmentForEdge to treatmentForSeam with no context at all", () => {
    for (let drop = 0; drop <= 12; drop++) {
      for (const run of [1, 2, 5, 6, 7, 40, 400]) {
        const chosen = treatmentForEdge(seamContext(drop, run));
        expect(treatmentForSeam(drop, run), `drop ${drop} run ${run}`).toBe(
          chosen === "replan" ? "bank" : chosen,
        );
      }
    }
  });

  it("keeps the answers the ground resolver's own callers already get", () => {
    // `deriveTransitions` derives transitions for boundaries no planner planned
    // and must keep getting today's answer (§5.1). These four are that answer.
    expect(treatmentForSeam(1, 100)).toBe("kerb");
    expect(treatmentForSeam(4, 100)).toBe("retaining");
    expect(treatmentForSeam(4, MIN_RETAIN_RUN - 1)).toBe("bank");
    // Re-pinned at 11F, attributed to `GROUND-UNIFICATION` §4.1 S2: a drop past
    // `RETAIN_MAX` on a run worth building is served by a stack of faces, not
    // graded. The untiered table is unchanged and still reachable, and it is
    // asserted beside the new answer so §5.1's "one table" claim keeps a
    // control.
    expect(treatmentForSeam(RETAIN_MAX + 1, 100)).toBe("tiered");
    expect(treatmentForSeam(RETAIN_MAX + 1, 100, { tiered: false })).toBe("bank");
  });

  it("never answers a bare seam with a treatment only a planner can ask for", () => {
    for (let drop = 0; drop <= 12; drop++) {
      for (const run of [1, 6, 40]) {
        // `"tiered"` joined this list at 11F. It is *not* a planner-only word:
        // the stack is built by the same pass on a bare seam, with the same
        // arithmetic, and it is `"replan"` that a bare seam still cannot be
        // answered with — there is no planner left to act on it (§5.1).
        expect(["kerb", "retaining", "bank", "built", "tiered"]).toContain(
          treatmentForSeam(drop, run),
        );
        expect(treatmentForSeam(drop, run)).not.toBe("replan");
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §5.2 — the decision order                                                   */
/* -------------------------------------------------------------------------- */

describe("context beats drop (§5.2)", () => {
  it("gives one drop two different treatments on two different edges", () => {
    // The whole claim of §5, in one assertion: same face, same length, and the
    // answer turns on whether anything is using the ground beside it.
    const open = edge({ drop: 4, availableRun: bankRun(4), pressedShare: 0, adjacentUse: "natural" });
    const pressed = edge({ drop: 4, availableRun: bankRun(4), pressedShare: 1, adjacentUse: "street" });
    expect(treatmentForEdge(open)).toBe("bank");
    expect(treatmentForEdge(pressed)).toBe("retaining");
    expect(treatmentForEdge(open)).not.toBe(treatmentForEdge(pressed));
  });

  it("keeps the wall where a street runs along the face — that one is earned", () => {
    // Rule 3 is the inversion, and this is the case it deliberately does not
    // take: land pressure buys masonry.
    for (const use of ["street", "lot"] as const) {
      expect(
        treatmentForEdge(edge({ availableRun: 100, adjacentUse: use, pressedShare: 1 })),
      ).toBe("retaining");
    }
  });

  it("banks by default where there is space, whatever the length of the seam", () => {
    // "Today a long seam becomes a wall because it is long; here it becomes a
    // wall because something is pressing on it."
    for (const run of [MIN_RETAIN_RUN, 40, 400]) {
      expect(
        treatmentForEdge(edge({ run, availableRun: bankRun(4), pressedShare: 0 })),
      ).toBe("bank");
    }
  });

  it("needs the whole run a bank spends before it grants one", () => {
    expect(treatmentForEdge(edge({ availableRun: bankRun(4) - 1, pressedShare: 0 }))).toBe(
      "retaining",
    );
    expect(treatmentForEdge(edge({ availableRun: bankRun(4), pressedShare: 0 }))).toBe("bank");
  });

  it("reads land pressure as a share of the face, not as a yes or no", () => {
    // A stair-alley descending past a long terrace face presses on a few of its
    // columns; walling the face end to end for that is the fortress §5 exists to
    // stop. The threshold is a quarter of the run.
    const open = { availableRun: bankRun(4), adjacentUse: "street" as const };
    expect(treatmentForEdge(edge({ ...open, pressedShare: EDGE_PRESSED_SHARE }))).toBe("bank");
    expect(
      treatmentForEdge(edge({ ...open, pressedShare: EDGE_PRESSED_SHARE + 0.01 })),
    ).toBe("retaining");
  });

  it("hands a building's own back the seam it already stands on (rule 2)", () => {
    expect(treatmentForEdge(edge({ builtShare: BUILT_SHARE }))).toBe("built");
    // A seam clipped at one end by the corner of a house is still a seam.
    expect(treatmentForEdge(edge({ builtShare: BUILT_SHARE - 0.01 }))).not.toBe("built");
  });

  it("kerbs a single block of step whatever else is true of it (rule 1)", () => {
    expect(treatmentForEdge(edge({ drop: 1, builtShare: 1, budget: 0 }))).toBe("kerb");
    expect(treatmentForEdge(edge({ drop: 0 }))).toBe("kerb");
  });

  it("replans a face taller than any wall we build, and a terrace with no depth left", () => {
    expect(treatmentForEdge(edge({ drop: RETAIN_MAX }))).not.toBe("replan");
    // Re-pinned at 11F (§4.1 S2/S3): one face past `RETAIN_MAX` is still not
    // built, but the answer is a stack of faces until the stack itself runs out
    // at `SEAM_TIER_MAX`, and only past *that* is the election what was wrong.
    // The untiered edge keeps the old answer, which is this test's control.
    expect(treatmentForEdge(edge({ drop: RETAIN_MAX + 1, tiered: false }))).toBe("replan");
    expect(treatmentForEdge(edge({ drop: RETAIN_MAX + 1 }))).toBe("tiered");
    expect(treatmentForEdge(edge({ drop: SEAM_TIER_MAX * RETAIN_MAX + 1 }))).toBe("replan");
    expect(treatmentForEdge(edge({ depthAfter: MIN_EDGE_DEPTH }))).not.toBe("replan");
    expect(treatmentForEdge(edge({ depthAfter: MIN_EDGE_DEPTH - 1 }))).toBe("replan");
  });
});

describe("the budget bites (§5.2 rule 7)", () => {
  it("gives a quarter that has spent its masonry banks rather than walls", () => {
    const wanted = edge({ adjacentUse: "street", pressedShare: 1 });
    expect(treatmentForEdge({ ...wanted, budget: 1 })).toBe("retaining");
    expect(treatmentForEdge({ ...wanted, budget: 0 })).toBe("bank");
    expect(treatmentForEdge({ ...wanted, budget: -200 })).toBe("bank");
  });

  it("never spends the budget on an edge that was never going to be a wall", () => {
    // Rules 1 to 4 come first, so a kerb, a built seam and a short run are free.
    expect(treatmentForEdge(edge({ drop: 1, budget: 0 }))).toBe("kerb");
    expect(treatmentForEdge(edge({ builtShare: 1, budget: 0 }))).toBe("built");
  });
});

describe("the cut side (§5.4)", () => {
  it("makes an unpressed uphill cut the hill's own rock", () => {
    expect(treatmentForEdge(edge({ side: "cut", adjacentUse: "natural" }))).toBe("rock");
    expect(treatmentForEdge(edge({ side: "cut", adjacentUse: "civic" }))).toBe("rock");
  });

  it("reaches rule 9 where a street or a lot is pressed against the foot of it", () => {
    for (const use of ["street", "lot"] as const) {
      expect(treatmentForEdge(edge({ side: "cut", adjacentUse: use }))).toBe("retaining");
    }
  });

  it("never banks a cut, because a bank is ground added and a cut is ground removed", () => {
    // WP-3's amendment to §5.2 and §5.4: three of §5.2's clauses spell the
    // unbuilt answer `"bank"`, and on the cut side the unbuilt answer is rock.
    const cases: Partial<EdgeContext>[] = [
      { availableRun: 1_000, pressedShare: 0 },
      { run: MIN_RETAIN_RUN - 1 },
      { drop: RETAIN_MAX + 4 },
      { budget: 0, adjacentUse: "street" }
    ];
    for (const over of cases) {
      expect(treatmentForEdge(edge({ ...over, side: "cut" })), JSON.stringify(over)).not.toBe(
        "bank",
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the constants                                                               */
/* -------------------------------------------------------------------------- */

describe("the constants cannot drift apart", () => {
  it("states one buildable depth in three places (§5.2 rule 6, §3.8)", () => {
    expect(MIN_EDGE_DEPTH).toBe(MIN_INFILL_SIDE);
    expect(MIN_EDGE_DEPTH).toBe(MIN_BUILDABLE_DEPTH);
  });

  it("sizes a bank at two columns of run per block of difference (§3.8)", () => {
    for (const drop of [1, 2, 5, 7, 12]) expect(bankRun(drop)).toBe(2 * drop);
  });

  it("gets a benched bank down in fewer columns than the smooth ramp it replaces", () => {
    // Measured, and it is the reason a benched bank is affordable wherever a
    // ramp was: `ceil(drop / 2) · 2` against `2 · drop`.
    for (const drop of [3, 4, 7, 10]) {
      expect(benchedRun(drop)).toBe(Math.ceil(drop / BENCH_FACE) * BENCH_TREAD);
      expect(benchedRun(drop)).toBeLessThanOrEqual(bankRun(drop));
    }
    expect(benchedRun(7)).toBe(8);
  });

  it("states one built-over share in both places (§5.2 rule 2)", () => {
    // The decision and the pass that discovers it have to agree, or a seam is
    // classified `built` and then walled anyway.
    expect(BUILT_SHARE).toBe(RETAIN_BUILT_SHARE);
  });

  it("rations masonry at §6.1's own wallPerBuilding target", () => {
    expect(WALL_COLUMNS_PER_DWELLING).toBe(40);
  });

  it("keeps every bench face shorter than the tallest wall we build", () => {
    // A benched bank whose own faces were wall-height would be a stack of the
    // cliff it is answering.
    expect(BENCH_FACE).toBeLessThan(RETAIN_MAX);
    expect(BENCH_TREAD).toBeGreaterThanOrEqual(2);
  });
});

/* -------------------------------------------------------------------------- */
/* the steep fixture, compiled — §10's "what unit tests cannot see"            */
/* -------------------------------------------------------------------------- */

/**
 * **The acceptance measurement WP-3 was given.** Before this package the steep
 * fixture reported **183 seam columns unwalled as `tallDrop`** — a seven-block
 * face between two terraces, past the tallest wall we build, left to a 1:1 ramp
 * of raw earth and counted as a wall that failed. §5's answer is that a face
 * that tall is a benched bank, and that it is a *treatment* rather than a
 * refusal.
 */
/**
 * **Re-pinned at WP-G4's flip (`GROUND_V1_SEAMS` on), attribution: the seam
 * builders.**
 *
 * Every golden below that moved, moved for one reason: `skirtSeams` and
 * `planeSeams` are absorbed (§4 item 21), so the *district* pass's transition
 * note now covers only what `levelSeams` derives, and everything it used to
 * carry is enumerated by the resolver and built by `finishSeams` — which reports
 * on its own `LOAM-I412` line. Nothing here says less is built; it says the
 * numbers are on the other note. The two notes together are the composition, and
 * both are pinned.
 */
/**
 * **Re-pinned wholesale at the frontage-by-claim flip
 * (`STRIP_FRONTAGE_BY_CLAIM` true, `layout/forms/hillside.ts`, 2026-08-25) —
 * attribution: the flip, and nothing else.**
 *
 * The steep fixture seats 7 -> 14 buildings once a frontage station with
 * claimable depth counts as frontage, and every census below is that seen
 * through the transition instrument. **Not one row got worse per building**,
 * which is this block's whole reading: `cutColumns` and `plannedColumns` rise
 * in absolute (415 -> 460, 478 -> 496) and fall by half per building
 * (59.3 -> 32.9, 68.3 -> 35.4), while everything the builders have to answer
 * falls on both readings — `fillColumns` 63 -> 36, `derivedBuilt` 42 -> 36,
 * `derivedFaceColumns` 527 -> 393, `derivedBankColumns` 501 -> 284,
 * `stacks` 5 -> 3, `unservedSeams` 6 -> 4, `derivedRefusals` 9 -> 6.
 *
 * The mechanism is one sentence: a seated lot platforms the ground, so the
 * seam is a building's floor rather than a face for the terminal builder to
 * grade, revet or refuse. What the tests are *for* is unmoved — every declared
 * edge still carries a treatment, no face is built past `RETAIN_MAX`, no seam
 * is refused for being a composite, and every refusal that remains is still
 * `W413`'s one honest exception.
 */
const STEEP_EDGES = {
  /**
   * Goldens, re-measured 2026-08-07 (evening) after the causeway landing
   * (`b90f87a`) and the flight-floor fix (`eb93a54`). The planner now declares
   * **952** edge columns where it declared 542: refusing the lowest street's
   * causeways hands the seams they were covering back to §5, so there is much
   * more edge to treat and it is treated.
   */
  //
  // **Wave 11F re-measure.** `SEAM_TIERS` went true, so a fill face past
  // `RETAIN_MAX` is a tier stack instead of a benched bank (§4.1 S2) and 11A's
  // split is gone, so the context chooses on every quarter. Both rows below are
  // that, and each says which way.
  //
  // 537 → 530 fill columns, and the composition is the whole story: it was
  // 405 bank + 132 retaining, and it is now **234 bank, 42 retaining, 254
  // tiered**. Two hundred and fifty-four columns of 45° raw earth became
  // stepped masonry. The seven columns that left the fill total are seam
  // columns S7 absorbed into their neighbours.
  // **530 → 63 at WP-G4's flip, and all 63 are tiered.** The fill side was
  // mostly the platform *skirt*, and the skirt is absorbed: the resolver
  // enumerates those same faces and the terminal builder answers them, at
  // `derivedFaceColumns` + `derivedBankColumns` below. What is left on this note
  // is `levelSeams`' own fill, which was always the smaller half.
  fillColumns: 36, // frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 63 -> 36, DOWN 27, and 9.0 -> 2.6 per building: the seats the flip lands claim the low ground the sweep used to have to fill.
  cutColumns: 460, // 269 → 415 (377 retaining, 38 rock); unmoved at the 11F flip frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 415 -> 460, UP 45 in absolute; 59.3 -> 32.9 per building, BETTER by nearly half. Twice the buildings on 1:2.5 ground declare more cut edge between them, and less of it each.
  // 10 → 11 (2026-08-07, the composite gate). The extra bank is the 90-column
  // skirt that reported `drop: 6` — a face rule 9 sanctions — while thirteen of
  // its columns stood over ground seven blocks down, six of them contiguous.
  // `structures/retaining.ts`' `facesOf` measures the face rather than the
  // summary and the seam is benched like any other face past `RETAIN_MAX`.
  //
  // **11 → 1 at the 11F flip**, and this is S2's whole point measured on the
  // walked fixture: ten of the eleven benched banks are stacks now. The one
  // left is the 183-column seven-block face below, whose foot the street owns
  // for its whole run, so no tier can step down there.
  // **1 → 0 at WP-G4's flip**: the one benched bank left on this note was a
  // skirt, and the note omits the clause entirely at zero. The benched landform
  // did not stop being built — `derivedBankColumns` is where it is now.
  benchedBanks: 0,
  // 952 → 945 at the 11F flip (seven columns absorbed by S7); **945 → 478 at
  // WP-G4's**, which is `fillColumns`' 467 absorbed columns and nothing else —
  // the cut side is unmoved, to the column.
  plannedColumns: 496, // frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 478 -> 496, the denominator, +18: fill 36 + cut 460. Per building 68.3 -> 35.4.
  /** Unmoved: the seven-block terrace face WP-3 was given, still 183 columns. */
  tallDropSeamColumns: 183,
  /**
   * 13 refusals in all, of which **8** are benched rather than stubs — 7 → 8
   * with the composite gate, which is `benchedBanks`' own +1 and the same seam.
   */
  // **8 → 1 at the 11F flip**, the same seven seams as `benchedBanks` above.
  // **1 → 0 at WP-G4's flip**, the same absorbed seam as `benchedBanks`.
  benchedFaceRefusals: 0,
  /**
   * Seams the stack served but could not cover to the last column (W413).
   *
   * **7 → 6 at WP-G4's flip**, and the shape changed with the count: five are
   * the district pass's own, reported per seam as before, and the sixth is the
   * terminal builder's single per-quarter aggregate (§3.4's "aggregated per
   * quarter"), which carries nine derived refusals inside it.
   */
  unservedSeams: 4, // frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 6 -> 4, DOWN two; 0.86 -> 0.29 per building, BETTER by two thirds. The seats stand on ground a stack used to fail to step down onto.
  /**
   * Bank seams in the district `SEAM_SERVED` tally — the benched one plus eight
   * short ones. **9 → 0 at WP-G4's flip**: every one of them was a skirt.
   */
  banks: 0,
  /** The district pass's own stacks, after the absorption: 7 → 5 over 14 → 10 faces. */
  stacks: 3, // frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 5 -> 3, DOWN two: two of the district pass's stacks are ground a frontage lot now holds. Per building 0.71 -> 0.21.
  stackFaces: 6, // frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 10 -> 6, following `stacks` at two faces each.
  /**
   * **The other half of the composition, on the terminal builder's note.** What
   * the district pass stopped reporting did not stop being built: 56 derived
   * transitions, 365 columns of masonry face and 2,242 of graded bank — an order
   * of magnitude more earthwork than the note above ever carried, because the
   * resolver enumerates boundaries `skirtSeams` never saw.
   */
  //
  // **Re-pinned at the GROUND_V1_FREEZE flip, with attribution.** 56 → 34
  // built, 365 → 247 columns of face, 2,242 → 498 of graded bank. One cause,
  // and it is the flip's own thesis: `plan.ground` is the fifth resolve, so
  // `deriveTransitions` enumerates the boundaries of *the* ground once, where
  // before it enumerated the boundaries of a plan four pad passes had already
  // edited and each pass's edits made seams for the next one to find. The
  // composition of what survives is unchanged in kind — bank 10, retaining 6,
  // revetted 10, rock 1, tiered 7 — and S7 absorbs 242.
  //
  // **The bank collapse is a finding, and it is already written down.**
  // `structures/retaining.ts`'s `gradeBank` records it in full: past the seal a
  // bank declares nothing, so the ring columns keep their resolved level and the
  // bank's earth is painted on ground the resolver never raised. Fewer bank
  // columns is that, measured. The fixture lints zero on all 26 physics rules
  // either way and `walkability.test.ts`'s goldens for it were re-pinned at the
  // flip itself, so nothing here is a defect being pinned as an expectation —
  // but a hillside with a quarter of the earthwork *reads* differently, and how
  // it reads is Kai's call on a walk, not this file's.
  //
  // **Re-pinned at the `ROAD_SOVEREIGN` flip: 34 → 36 built, 247 → 271 columns
  // of face.** A sovereign road is draped on the resolved ground and blends no
  // shoulder (`blendShoulders` is off under the flag, since a draped road
  // leaves no cut face to feather), so the street family eases nothing on its
  // way across a terrace and the terminal builder meets the terrain's own face
  // instead of a graded one: two more transitions over twenty-four more columns.
  // The same twenty-four columns show up as `site-plan-hillside`'s steep
  // `wallColumns` 279 → 303. The trade — inherited risers, no stairs — is the
  // ratified one and the walk judges it.
  //
  // **Re-pinned at the `ROAD_PULL` flip: 36 → 37 built, 271 → 277 columns of
  // face.** Road claims now sit at blended levels between the drape and the n5
  // graded profile, which changes which seams the resolver derives on this steep
  // fixture — one more transition over six more columns.
  derivedBuilt: 30, // Groundwork C2 unit 11 (2026-08-27, the bank drapes along a climbing street; late transitions served): 27 -> 30, UP — late transitions the builder now sees; Groundwork C2 unit 9 (2026-08-27, boundary runs keyed by owner class — S7 absorbed 749 → 79 on montfort): 38 -> 27, DOWN — the same faces in fewer, longer runs; Groundwork C2 (2026-08-27, cut-side stack + road/street profiles ask `ramp`): 36 -> 38 — cut seams a stack can now serve; n9 retune (tail exponent + closing, 2026-08-23): 37 -> 39 — road claims at the new levels change which seams the resolver derives on this steep fixture. cross verdict (PULL_CROSS, 2026-08-23): 39 -> 42 — cross-fall joins the pull verdict and the side-sloping streets level, so three more seams derive at the new row heights. frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 42 -> 36, DOWN six; 6.0 -> 2.6 per building. Fewer transitions to derive where a lot is seated.
  derivedFaceColumns: 579, // Groundwork C2 unit 11 (2026-08-27, the bank drapes along a climbing street; late transitions served): 571 -> 579, UP; Groundwork C2 unit 9 (2026-08-27, boundary runs keyed by owner class — S7 absorbed 749 → 79 on montfort): 411 -> 571, UP — runs that were absorbed under S7 are served; Groundwork C2 (2026-08-27, cut-side stack + road/street profiles ask `ramp`): 393 -> 411 — the cut stacks' faces; n9 retune (tail exponent + closing, 2026-08-23): 277 -> 409 — the same census drift, over a much longer stretch of face. cross verdict (PULL_CROSS, 2026-08-23): 409 -> 527 — the same census drift, over a longer stretch of face: the re-levelled rows cut the tilted shelves flat and the terminal builder answers the cut. frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 527 -> 393, DOWN 134; 75.3 -> 28.1 per building, BETTER by nearly two thirds.
  derivedBankColumns: 68, // Groundwork C2 unit 11 (2026-08-27, the bank drapes along a climbing street; late transitions served): 84 -> 68, DOWN — banks fall from their own stations; Groundwork C2 unit 9 (2026-08-27, boundary runs keyed by owner class — S7 absorbed 749 → 79 on montfort): 284 -> 84, DOWN — banks became stacks where the runs merged; n9 retune (tail exponent + closing, 2026-08-23): 498 -> 501 — the graded-bank side follows. frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 501 -> 284, DOWN 217; 71.6 -> 20.3 per building. Graded bank is what the flip's seats replace with platform.
  /**
   * Derived transitions the stack served but could not cover (the terminal
   * builder's per-quarter aggregate). **9 → 10 at the `GROUND_V1_FREEZE` flip**:
   * one more, and the message names each one's cause — a street, a footprint or
   * water owning the ground a course needed.
   *
   * **10 → 7 at the `ROAD_SOVEREIGN` flip.** The cause is the same sentence read
   * the other way: a draped street claims the ground it stands on and no more,
   * so three of the courses that could not find ground to stand on now can. Not
   * a fix — the same street, moved.
   */
  derivedRefusals: 9, // Groundwork C2 unit 11 (2026-08-27, the bank drapes along a climbing street; late transitions served): 10 -> 9, DOWN, the right way; Groundwork C2 unit 9 (2026-08-27, boundary runs keyed by owner class — S7 absorbed 749 → 79 on montfort): 9 -> 10, UP by one; MUST GO DOWN; Groundwork C2 (2026-08-27, cut-side stack + road/street profiles ask `ramp`): 6 -> 9, UP by three — cut seams now chosen (they were rock before) whose rim a street or footprint holds; MUST GO DOWN; n9 retune (tail exponent + closing, 2026-08-23): 7 -> 10 — more derived courses find a street, a footprint or water already owning the ground they needed. cross verdict (PULL_CROSS, 2026-08-23): 10 -> 9 — one fewer derived course finds its ground already owned, the levelled rows connecting a little better. frontage-by-claim flip (STRIP_FRONTAGE_BY_CLAIM, 2026-08-25): 9 -> 6, DOWN three; 1.29 -> 0.43 per building, BETTER by two thirds.
} as const;

describe("the steep fixture's transitions, compiled", () => {
  let sweep: string[];
  let edges: {
    side: string;
    treatment: string;
    drop: number;
    cells: { x: number; z: number }[];
  }[];

  beforeAll(async () => {
    const doc = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL("fixtures/examples/site-plan-hillside-steep.loam.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as unknown;
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-transitions-"));
    scratch.push(root);
    const compiled = await compileTerrain(doc, { outDir: path.join(root, "hillside_town_steep") });
    if (!compiled.ok) throw new Error("steep fixture compile failed");
    const report = compiled.report as unknown as {
      layout: { districts: { plannedEdges?: typeof edges }[] };
      diagnostics: readonly { name: string; severity: string; message: string }[];
    };
    sweep = report.diagnostics.map((d) => `${d.severity} ${d.name} ${d.message}`);
    edges = report.layout.districts[0]?.plannedEdges ?? [];
  }, 300_000);

  it("declares a cut edge for the quarter's terraces (§5.4)", () => {
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) expect(e.side).toBe("cut");
  });







  it("reports zero offPlatform, and would have raised it as an error (§5.5)", () => {
    expect(sweep.join("\n")).not.toContain("offPlatform");
    expect(sweep.some((m) => m.includes("SITE_PLAN_FAILED"))).toBe(false);
  });
});
