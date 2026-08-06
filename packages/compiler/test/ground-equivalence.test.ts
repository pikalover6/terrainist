/**
 * **The safety net** — `docs/GROUND-CONTRACT-v0.md` §8 and §11.
 *
 * > "the resolver runs, its output is compared against the mutating pipeline's,
 * > and a test asserts they agree. **That equivalence test is the safety net for
 * > the whole rewrite.**"
 *
 * Each world here is compiled **once**, in `beforeAll`, with
 * `groundEquivalence: true` and `skipEmit: true` — the shim runs before the
 * emitter and the world folder is not the product here — and every assertion
 * reads that one comparison. Nothing is skipped: a document that will not
 * compile fails loudly rather than quietly not being measured.
 *
 * What the assertions are for, in order of what they would catch:
 *
 * - **declaration gaps** (§8.3, UNCLAIMED). A column no claim names whose level
 *   the pipeline moved: a pass writes ground it does not declare, which is a hole
 *   in §3's inventory. **Zero on every world**, and it is the assertion that
 *   proves the inventory complete.
 * - **clean columns match exactly** (§8.3, CLEAN) — one declared level, so the
 *   two answers have nothing to disagree about.
 * - **every divergence is attributable** (§8.3, CONFLICT) to a row of §8.5, with
 *   the per-inversion counts pinned as a golden so a later work package that
 *   moves a world has to say so, and with I7 held to zero and I6's step held to
 *   the seven blocks it was measured at.
 *
 * The goldens are **measurements, not targets**. Where one is not what §8.4
 * predicted, the comment says so and says why — see `PAD_APRON_MISMATCHES`, which
 * is this round's one open finding.
 */

import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  TOLERATED_INVERSIONS,
  assertGroundEquivalence,
  type GroundEquivalenceReport,
  type InversionCounts,
} from "../src/layout/ground-equivalence.js";
import { compileTerrain } from "../src/terrain/compile.js";

/* -------------------------------------------------------------------------- */
/* the worlds                                                                  */
/* -------------------------------------------------------------------------- */

/** Zero everywhere unless a world's golden says otherwise. */
const NONE: InversionCounts = { I1: 0, I2: 0, I3: 0, I4: 0, I5: 0, I6: 0, I7: 0 };

interface WorldCase {
  readonly name: string;
  /** A committed example, or a fixture document built here. */
  readonly doc?: () => Record<string, unknown>;
  /** §8.4's golden: divergences per §8.5 row. */
  readonly inversions: InversionCounts;
  /**
   * CLEAN columns the two answers disagree about. **Zero is the contract**; a
   * non-zero entry is an open finding and carries its explanation at the
   * constant it refers to.
   */
  readonly cleanMismatches?: number;
}

/**
 * The **one open finding** of WP-2, recorded here rather than tolerated
 * silently — see the report and `docs/GROUND-CONTRACT-v0.md` §3.12 / §13.3.
 *
 * `declarePadEdits` declares a building pad's whole footprint at `targetY`, on
 * §3.12's premise that "the field already carries the answer". On two worlds the
 * premise is false: a **later** `PadEdit`'s *apron* — which §3.12 deliberately
 * does not declare, because whether the apron is a declared transition is open
 * question §13.3 — grades across an earlier pad's footprint and leaves the field
 * 1–3 blocks below that pad's target. Measured on `c1-harbourtown`: 217 footprint
 * columns disagree with the baseline, 162 of them inside a later pad's *footprint*
 * (both pads declare, the column is CONFLICT, and application order decides it —
 * see `declarePadEdits`' `subRank`) and **55** reached only by a later pad's
 * apron, where the earlier pad's is the only claim and the column partitions
 * CLEAN. `showcase-deltamere` has 61 of the same.
 *
 * It matters because under WP-6 the resolver would *act* on that claim: nothing
 * else claims those columns, so `pad.record` wins them and the ground rises by up
 * to three blocks under a building's floor plane the fabric had graded away. It
 * is not tolerated — no row of §8.5 covers it and none was added — and it is not
 * fixed here, because both candidate fixes (declare the apron's profile; declare
 * only what the edit achieved) decide §13.3 by implementation. **WP-3 should
 * settle §13.3 before the buildings pass is converted.**
 */
const PAD_APRON_MISMATCHES = { "c1-harbourtown": 55 } as const;

/**
 * **WP-3's finding, recorded at the golden it moved.**
 *
 * §9a.5 says a divergence count that *grows* is never a golden update: it is a
 * finding with exactly two legitimate causes, and the cause has to be written
 * down before the number is changed. This is cause 1 — "the declaration set
 * moved" — and the declarer it moved for is not the one §9a.3 predicts.
 *
 * §9a.3 names `prop.pad` as "the one declarer whose *column* set is a function of
 * the ground it is declared against", because `levelPropPad` selects with
 * `if (g >= want) continue`. **`doorstep.landing` is a second.**
 * `buildDoorsteps` cuts a landing only where the ground stands *above* the
 * threshold line, so converting the sidewalk — which is what I6 does, on 9,921
 * columns of `c1-harbourtown` and 4,169 of `showcase-bayline` — changes which
 * doors get a `dropped` outcome at all. Measured: `doorstepsDropped` 0 → 12 on
 * `c1-harbourtown` and 7 → 3 on `showcase-bayline`, and every one of the new
 * landings that lands on a street column is an I3 divergence, attributable and
 * counted. I3 therefore grows at WP-3 and goes to **zero at WP-4**, where §9a.3's
 * table already puts it — the same shape §9a.3 predicts for I4 shrinking at WP-3
 * and reaching zero at WP-5, in the other direction.
 *
 * The doc gets amended; the golden is not bent to hide it.
 */
const DOORSTEP_RESELECTION = { "c1-harbourtown": 12, "showcase-bayline": 6 } as const;

/**
 * §8.4's flat controls. `showcase-*`, `demo-*` and `c1-harbourtown`: the worlds
 * §12's byte-identity argument is about.
 *
 * §8.4 predicts "zero of everything" for these, and that is very nearly what they
 * measure — but not exactly, and the goldens say so rather than the test being
 * bent to fit. `demo-deltaport` inverts 20 columns under I4 (a prop pad losing to
 * something built, which §4.4 calls the direct fix for `road.proud`), and
 * `c1-harbourtown` — a city, with a full street fabric on ground that is flat
 * only by comparison — inverts 9,921 under I6.
 */
const CONTROLS: readonly WorldCase[] = [
  {
    name: "c1-harbourtown",
    // WP-3 converted the street family. **I6: 9,921 → 0** — the largest single
    // movement in the rewrite, and the whole of it: the sidewalk's level now
    // comes from the flanking carriageway's `ArcLevels` rather than from a second
    // read of `plan.ground`, so the pass writes what it declares and there is
    // nothing left to diverge. **I3: 0 → 12** — see `DOORSTEP_RESELECTION`; it
    // goes to zero at WP-4.
    inversions: { ...NONE, I3: DOORSTEP_RESELECTION["c1-harbourtown"] },
    cleanMismatches: PAD_APRON_MISMATCHES["c1-harbourtown"],
  },
  { name: "showcase-ironvale", inversions: { ...NONE, I4: 41 } },
  { name: "demo-deltaport", inversions: { ...NONE, I4: 20 } },
];

/**
 * §8.4's hill worlds, plus the stepped fixture.
 *
 * §8.4's third entry is "one generated world with a `terraced`/`stepped`
 * quarter", generated by `terrainist generate` from a text prompt. A unit test
 * cannot call a model, and the walked hill towns were generated live and not
 * committed, so the substitute is `levels.test.ts`' `steppedWorld()` — the one
 * **committed** document known to derive platforms, copied here rather than
 * imported so a change to that test cannot silently move this golden.
 */
const HILLS: readonly WorldCase[] = [
  { name: "hillside-village", inversions: NONE },
  { name: "hilltop-crypt-hamlet", inversions: NONE },
  {
    // Not flat, despite the `showcase-` prefix §8.4 files under its controls: a
    // quarter on a slope, and the world with the richest inversion mix in the
    // repo — the only committed example that exercises I1, I2 and I3 at once.
    name: "showcase-bayline",
    // WP-3, and the world where three of the four land at once (§9a.3's table):
    // **I1: 3 → 0** — the street/sidewalk/verge side of "a face beats a street"
    // is the *loser's* conversion, and the loser is WP-3's; the wall is still
    // written by hand and still wins. **I2: 2 → 0** — a street beats a road, both
    // of them inside WP-3's own family. **I6: 4,169 → 0**. **I3: 3 → 6** — see
    // `DOORSTEP_RESELECTION`. §9a.3 splits I1 between WP-3 and WP-4 ("except any
    // column whose last writer is `gradeBank`"); measured, `showcase-bayline`'s
    // share is entirely WP-3's — there is no `gradeBank` remainder here.
    inversions: { ...NONE, I3: DOORSTEP_RESELECTION["showcase-bayline"] },
  },
  {
    name: "levels_scarp",
    doc: steppedWorld,
    // **I6: 52 → 0** at WP-3. The one doorstep landing cut into a column a
    // street owns stays, unmoved: I3 is WP-4's. That this count did *not* grow
    // where the two city worlds' did is what makes `DOORSTEP_RESELECTION` a
    // reselection — a door here and a door there whose approach the sidewalk's
    // new level pushed across the threshold line — rather than a systematic
    // shift the conversion introduced.
    inversions: { ...NONE, I3: 1 },
  },
];

const ALL = [...CONTROLS, ...HILLS];

/* -------------------------------------------------------------------------- */
/* one compile per document                                                    */
/* -------------------------------------------------------------------------- */

const scratch: string[] = [];
const reports = new Map<string, GroundEquivalenceReport>();

beforeAll(async () => {
  for (const world of ALL) {
    const doc =
      world.doc !== undefined
        ? world.doc()
        : (JSON.parse(
            await readFile(
              fileURLToPath(new URL(`../../../examples/${world.name}.loam.json`, import.meta.url)),
              "utf8",
            ),
          ) as Record<string, unknown>);
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-ground-eq-"));
    scratch.push(root);
    const out = await compileTerrain(doc, {
      outDir: path.join(root, world.name),
      skipEmit: true,
      groundEquivalence: true,
    });
    if (!out.ok) {
      throw new Error(
        `${world.name} did not compile: ${out.diagnostics.map((d) => d.name).join(", ")}`,
      );
    }
    if (out.groundEquivalence === undefined) {
      throw new Error(`${world.name} compiled without the shim — \`groundEquivalence\` is off`);
    }
    reports.set(world.name, assertGroundEquivalence(out.groundEquivalence));
  }
}, 900_000);

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

/** The one comparison for a world, or a failure that says which is missing. */
function reportFor(name: string): GroundEquivalenceReport {
  const report = reports.get(name);
  if (report === undefined) throw new Error(`no comparison for ${name} — did \`beforeAll\` run?`);
  return report;
}

/** Every failure whose message names a category, so a diff reads. */
function failuresOf(name: string, category: string): readonly string[] {
  return reportFor(name).failures.filter((f) => f.includes(category));
}

/* -------------------------------------------------------------------------- */
/* §11's assertions                                                            */
/* -------------------------------------------------------------------------- */

describe("the ground contract's equivalence shim", () => {
  describe.each(ALL.map((w) => [w.name, w] as const))("%s", (name, world) => {
    it("zero declaration gaps — no pass writes ground it does not declare", () => {
      expect(failuresOf(name, "declaration gap").join("\n")).toBe("");
      expect(reportFor(name).gaps).toBe(0);
    });

    it("the resolver moves nothing nobody claimed", () => {
      expect(failuresOf(name, "resolver moved unclaimed").join("\n")).toBe("");
    });

    it("clean columns match exactly", () => {
      const report = reportFor(name);
      const expected = world.cleanMismatches ?? 0;
      if (expected === 0) expect(failuresOf(name, "clean mismatch").join("\n")).toBe("");
      // A golden, not a tolerance: see `PAD_APRON_MISMATCHES`. It must not grow,
      // and a work package that shrinks it has to say so here.
      expect(report.cleanMismatches).toBe(expected);
    });

    it("the two answers agree about the water", () => {
      expect(failuresOf(name, "fluid mismatch").join("\n")).toBe("");
      expect(reportFor(name).fluidMismatches).toBe(0);
    });

    it("every conflicted column goes to the rank-minimal claim", () => {
      expect(failuresOf(name, "precedence mismatch").join("\n")).toBe("");
      expect(reportFor(name).precedenceMismatches).toBe(0);
    });

    it("every divergence is attributable to a named inversion", () => {
      expect(failuresOf(name, "unattributable divergence").join("\n")).toBe("");
      expect(reportFor(name).unattributable).toBe(0);
    });

    it("the per-inversion counts are the committed golden", () => {
      expect(reportFor(name).byInversion).toEqual(world.inversions);
    });

    it("I7 produces no divergence — the plaza's rank is a pure refactor", () => {
      expect(reportFor(name).byInversion.I7).toBe(0);
    });

    it("I6's step never exceeds the seven blocks it was measured at", () => {
      expect(reportFor(name).maxSidewalkDelta).toBeLessThanOrEqual(7);
    });

    it("the driver's answer is the one-shot resolve", () => {
      // §9a.5's new assertion, and §9a.1 rule 3's proof: `resolveGround` is
      // called on the whole accumulated array every time and never patched, so
      // the last intermediate answer *is* the final one. Zero here is what
      // catches an intent the driver mutated, dropped, or — rule 4, the most
      // likely way to get this wrong — whose `columns` were a generator, which is
      // exhausted after the first of a dozen resolves.
      expect(failuresOf(name, "driver mismatch").join("\n")).toBe("");
      expect(reportFor(name).driverMismatches).toBe(0);
    });

    it("no CLEAN column diverges — the sidewalk's self-inversion is gone", () => {
      // §9a.5: `cleanDivergences` was I6's single-claimant columns, credited to
      // the self-row and held to seven blocks. WP-3 converted the sidewalk, so
      // the pass writes what it declares; the count is zero and the `selfWrites`
      // machinery went with it.
      expect(reportFor(name).cleanDivergences).toBe(0);
    });

    it("the partition covers the region exactly once", () => {
      const r = reportFor(name);
      expect(r.unclaimed + r.clean + r.conflict).toBe(r.columns);
    });
  });

  it("the flat controls conflict on almost nothing", () => {
    // §8.4 asks for `CONFLICT` empty on the controls. It is not quite empty —
    // `c1-harbourtown` is a city — so what is asserted is the shape of the claim
    // rather than the wish: a control's conflicted columns are a rounding error
    // against its region, and every one of them is attributable above.
    for (const world of CONTROLS) {
      const r = reportFor(world.name);
      expect(r.conflict / r.columns, world.name).toBeLessThan(0.05);
    }
  });

  it("the tolerated table is §8.5's, and no row was added to make a world pass", () => {
    expect(TOLERATED_INVERSIONS.map((r) => r.id)).toEqual([
      "I1",
      "I2",
      "I3",
      "I4",
      "I5",
      "I6",
      "I7",
    ]);
    expect(TOLERATED_INVERSIONS.find((r) => r.id === "I7")?.expectZero).toBe(true);
    expect(TOLERATED_INVERSIONS.find((r) => r.id === "I6")?.maxDelta).toBe(7);
  });
});

/* -------------------------------------------------------------------------- */
/* the stepped fixture                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `levels.test.ts`' stepped quarter, copied verbatim.
 *
 * The one committed document known to derive platforms — §8.4 wanted a generated
 * one and a unit test cannot generate. Copied rather than imported so a change
 * over there cannot move this world's golden without a diff here.
 */
function steppedWorld(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "levels_scarp", worldSeed: 4242 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [176, 176] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 26, seaLevel: 63, baseHeight: 74, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [104, 104] },
          constraints: [{ zone: "center" }],
          params: {
            fabric: "grid",
            density: "medium",
            mix: ["townhouse", "cottage"],
            ground: "stepped",
          },
        },
      ],
    },
  };
}
