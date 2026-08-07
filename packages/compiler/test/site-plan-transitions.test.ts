/**
 * **WP-3 — transitions by context, not by drop alone** (`docs/SITE-PLAN-v0.md`
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
  bankRun,
  benchedRun,
  seamContext,
  treatmentForEdge,
  treatmentForSeam,
  type EdgeContext,
} from "../src/layout/levels.js";
import { MIN_BUILDABLE_DEPTH } from "../src/layout/forms/hillside.js";
import { MIN_INFILL_SIDE, WALL_COLUMNS_PER_DWELLING } from "../src/layout/district.js";
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
    ...over,
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
    expect(treatmentForSeam(RETAIN_MAX + 1, 100)).toBe("bank");
  });

  it("never answers a bare seam with a treatment only a planner can ask for", () => {
    for (let drop = 0; drop <= 12; drop++) {
      for (const run of [1, 6, 40]) {
        expect(["kerb", "retaining", "bank", "built"]).toContain(treatmentForSeam(drop, run));
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
    expect(treatmentForEdge(edge({ drop: RETAIN_MAX + 1 }))).toBe("replan");
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
      { budget: 0, adjacentUse: "street" },
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
const STEEP_EDGES = {
  /**
   * Goldens, re-measured 2026-08-07 (evening) after the causeway landing
   * (`b90f87a`) and the flight-floor fix (`eb93a54`). The planner now declares
   * **952** edge columns where it declared 542: refusing the lowest street's
   * causeways hands the seams they were covering back to §5, so there is much
   * more edge to treat and it is treated.
   */
  fillColumns: 537, // 273 → 537 (405 bank, 132 retaining)
  cutColumns: 415, // 269 → 415 (377 retaining, 38 rock)
  // 10 → 11 (2026-08-07, the composite gate). The extra bank is the 90-column
  // skirt that reported `drop: 6` — a face rule 9 sanctions — while thirteen of
  // its columns stood over ground seven blocks down, six of them contiguous.
  // `structures/retaining.ts`' `facesOf` measures the face rather than the
  // summary and the seam is benched like any other face past `RETAIN_MAX`.
  benchedBanks: 11, // 1 → 10 → 11
  plannedColumns: 952,
  /** Unmoved: the seven-block terrace face WP-3 was given, still 183 columns. */
  tallDropSeamColumns: 183,
  /**
   * 13 refusals in all, of which **8** are benched rather than stubs — 7 → 8
   * with the composite gate, which is `benchedBanks`' own +1 and the same seam.
   */
  benchedFaceRefusals: 8,
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
          new URL("../../../examples/site-plan-hillside-steep.loam.json", import.meta.url),
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

  it("partitions the edge columns exactly — every column once (§5.4)", () => {
    const seen = new Set<string>();
    let total = 0;
    for (const e of edges) {
      // Every declared edge carries a treatment. None is left untreated, which
      // is the sentence §5.4 makes normative.
      expect(["kerb", "retaining", "bank", "built", "rock"]).toContain(e.treatment);
      for (const c of e.cells) {
        const key = `${c.x},${c.z}`;
        expect(seen.has(key), `column ${key} treated twice`).toBe(false);
        seen.add(key);
        total++;
      }
    }
    expect(seen.size).toBe(total);
    expect(total).toBe(STEEP_EDGES.cutColumns);
  });

  it("treats every tall seam column instead of counting them as unwalled", () => {
    const multi = sweep.find((m) => m.includes("multi-level ground")) ?? "";
    expect(multi).not.toContain("tallDrop");
    expect(multi).not.toContain("shortRun");
    const transitions = sweep.find((m) => m.includes("transitions by context")) ?? "";
    expect(transitions).toContain(`fill ${STEEP_EDGES.fillColumns}`);
    expect(transitions).toContain(`cut ${STEEP_EDGES.cutColumns}`);
    expect(transitions).toContain(`${STEEP_EDGES.benchedBanks} bank(s) benched`);
    expect(transitions).toContain(`${STEEP_EDGES.plannedColumns} planned edge column(s)`);
  });

  it("answers the seven-block face as several short faces with soil between", () => {
    // **Re-pinned 2026-08-07 (evening), and the re-pin is a lesson.** The
    // original body did `sweep.find(m => m.includes("RETAINING_REFUSED"))` and
    // asserted against the one message that existed. After the causeway landing
    // (`b90f87a`) there are **13** refusals on this fixture — six under
    // `MIN_RETAIN_RUN` (a stub, graded into a bank) and seven past `RETAIN_MAX`
    // (benched) — and `find` returned an arbitrary one. The seven-block face is
    // still there, still 183 columns; the test simply stopped looking at it.
    // It now selects by the property it is about.
    const benched = sweep.filter((m) => m.includes("benched bank"));
    expect(benched.length).toBe(STEEP_EDGES.benchedFaceRefusals);
    const seven = benched.find((m) =>
      m.includes(`over ${STEEP_EDGES.tallDropSeamColumns} column(s)`),
    );
    expect(seven, "the seven-block face is no longer reported").toBeDefined();
    expect(seven).toContain(
      `${Math.ceil(7 / BENCH_FACE)} face(s) of ${BENCH_FACE} block(s) with ${BENCH_TREAD} column(s) of soil between`,
    );
    expect(seven).toContain(`over ${benchedRun(7)} column(s) of run`);
  });

  it("measures the finished face, not the seam's summary of it (the composite)", () => {
    // **The defect this closes.** Every rule in §5.2 reads one `drop` per seam,
    // and a skirt's is the component's *median* — deliberately, so one column of
    // gully cannot bank a hundred-column terrace. What nothing measured was the
    // other tail: on this fixture a 90-column skirt reported `drop: 6`, which
    // rule 9 sanctions, while thirteen of its columns stood over ground seven
    // blocks down and six of those were contiguous. What got built there was a
    // seven-block sheer face no rule had ever looked at.
    const composite = sweep.filter((m) => m.includes("the face it would have presented"));
    expect(composite.length).toBe(1);
    expect(composite[0]).toContain("benched bank");
    // …and it is benched for the face, not for the summary: a seven-block fall
    // answered with six blocks' worth of benches leaves the last block as a step
    // no bench reaches, which is the sheer face one block shorter.
    expect(composite[0]).toContain(`${Math.ceil(7 / BENCH_FACE)} face(s) of ${BENCH_FACE} block(s)`);
  });

  it("reports its built faces by finished drop, and none of them past RETAIN_MAX", () => {
    // `docs/GROUND-CONTRACT-v0.md` §13.8's measurement, carried on every world
    // this compiler builds. The bar it asserts is the one the composite gate
    // exists to hold: a built face past the ceiling is not a wall, it is a bank.
    const line = sweep.find((m) => m.includes("built faces by finished drop"));
    expect(line, "the §13.8 line is missing from the report").toBeDefined();
    const drops = [...(line as string).matchAll(/\d+ at (\d+)/g)].map((m) => Number(m[1]));
    expect(drops.length).toBeGreaterThan(0);
    for (const drop of drops) {
      expect(drop).toBeGreaterThan(0);
      expect(drop).toBeLessThanOrEqual(RETAIN_MAX);
    }
  });

  it("reports zero offPlatform, and would have raised it as an error (§5.5)", () => {
    expect(sweep.join("\n")).not.toContain("offPlatform");
    expect(sweep.some((m) => m.includes("SITE_PLAN_FAILED"))).toBe(false);
  });
});
