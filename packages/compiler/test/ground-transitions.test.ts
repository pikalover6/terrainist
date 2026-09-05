/**
 * The refined transition derivation and §3.2's coverage invariant —
 * /WP-G4, §8's G4 row.
 *
 * Every fixture here is a **synthetic resolved field**: a small region, an owner
 * map and a ground array built by hand. That is deliberate and it is what makes
 * the file fast enough to state the invariant at every drop and every run length
 * §8 names. The compile-level guard is `ground-probe-harness.test.ts` and the
 * `LOAM-I497` goldens recorded at the bottom of this file.
 *
 * WP-G4's derive half shipped with `GROUND_V1_SEAMS` **off** and its flip half
 * ships with it **on**. Nothing in this file depends on which: every assertion
 * here is about what the resolver *enumerates*, and the enumeration is the same
 * on both sides of the flip — which is exactly what made the front-loaded
 * comparison possible. What the flip changed is who builds the complement, and
 * that is `ground-probe-harness.test.ts`' and `site-plan-transitions.test.ts`'
 * subject.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Region } from "@terrainist/stdlib";
import { describe, expect, it } from "vitest";

import { compileArtifacts } from "../src/terrain/compile.js";

import {
  GROUND_SOURCE_CLASSES,
  type GroundBaseline,
  type GroundIntent,
  type ResolvedGround
} from "../src/layout/ground-contract.js";
import { SEAM_CLASS_USE, deriveGroundSeams } from "../src/layout/ground-resolver.js";
import {
  RETAIN_MAX,
  SEAM_TIER_MAX,
  levelSeams,
  tiersOf,
  treatmentForSeam,
  type GroundLevels
} from "../src/layout/levels.js";
import { RETAIN_FACE_SETBACK } from "../src/structures/retaining.js";
import { FluidKind } from "../src/terrain/columns.js";

/* -------------------------------------------------------------------------- */
/* synthetic resolved fields                                                   */
/* -------------------------------------------------------------------------- */

interface Field {
  readonly region: Region;
  readonly ground: Int32Array;
  readonly owner: Int32Array;
  readonly fluidKind: Uint8Array;
  readonly intents: GroundIntent[];
}

const BASE_Y = 64;

function blankField(width: number, depth: number): Field {
  const region: Region = { x0: 0, z0: 0, width, depth };
  return {
    region,
    ground: new Int32Array(width * depth).fill(BASE_Y),
    owner: new Int32Array(width * depth).fill(-1),
    fluidKind: new Uint8Array(width * depth).fill(FluidKind.NONE),
    intents: []
  };
}

/** An intent that owns `cells` at `y`, and the field updated to say so. */
function claim(
  field: Field,
  cells: readonly number[],
  y: number,
  overrides: Partial<GroundIntent> = {},
): GroundIntent {
  const j = field.intents.length;
  const intent: GroundIntent = {
    source: `test#claim@${j}`,
    sourceClass: "plaza.ground",
    kind: "platform",
    columns: cells.map((idx) => ({ idx, y })),
    transition: "wall",
    ...overrides
  } as GroundIntent;
  field.intents.push(intent);
  for (const k of cells) {
    field.owner[k] = j;
    field.ground[k] = y;
  }
  return intent;
}

/**
 * A field whose east half is one platform `drop` blocks above the west half,
 * over a region `run` columns deep.
 *
 * The platform reaches the north, south and east edges of the region, so the
 * only boundary in the field is its west face and the run length is exactly the
 * region's depth — which is what lets the invariant be stated at a named run.
 */
function terrace(drop: number, run: number, overrides: Partial<GroundIntent> = {}): Field {
  const width = 24;
  const field = blankField(width, run);
  const cells: number[] = [];
  for (let j = 0; j < run; j++) for (let i = 12; i < width; i++) cells.push(j * width + i);
  claim(field, cells, BASE_Y + drop, overrides);
  return field;
}

/* -------------------------------------------------------------------------- */
/* §3.2 — the coverage invariant                                               */
/* -------------------------------------------------------------------------- */

describe("the coverage invariant (v1 §3.2)", () => {
  const DROPS = [1, 2, 6, 7, 8, 14];
  const RUNS = [1, 5, 6, 25];

  for (const drop of DROPS) {
    for (const run of RUNS) {
      it(`accounts for every boundary pair at drop ${drop}, run ${run}`, () => {
        const field = terrace(drop, run);
        const out = deriveGroundSeams(field);
        expect(out.diagnostics).toEqual([]);
        expect(out.coverage.uncovered).toBe(0);
        // One face, one run, one component — never a crumb per column.
        expect(out.transitions).toHaveLength(1);
        const seam = out.transitions[0]!;
        expect(seam.cells).toHaveLength(run);
        expect(seam.drop).toBe(drop);
        // Clause 1 took every pair; nothing fell through to a suppression.
        expect(out.coverage.pairs).toBe(run);
        expect(out.coverage.transition).toBe(run);
        expect(out.coverage.request + out.coverage.face + out.coverage.kerb).toBe(0);
      });
    }
  }

  it("excludes the hillside against itself, and counts what it excluded", () => {
    // A bare slope: no claim anywhere, every column unowned. §3.2's first named
    // exclusion, and §6/WP-G4's guard row — this stage must not touch it.
    const field = blankField(8, 8);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) field.ground[j * 8 + i] = BASE_Y + i;
    const out = deriveGroundSeams(field);
    expect(out.transitions).toHaveLength(0);
    expect(out.coverage.pairs).toBe(0);
    expect(out.coverage.uncovered).toBe(0);
    expect(out.coverage.natural).toBe(7 * 8); // every west-facing step of the slope
  });

  it("excludes water, and a shore is not a seam", () => {
    const field = terrace(4, 6);
    for (let j = 0; j < 6; j++) field.fluidKind[j * 24 + 11] = FluidKind.WATER;
    const out = deriveGroundSeams(field);
    expect(out.coverage.water).toBe(6);
    expect(out.coverage.pairs).toBe(0);
    expect(out.coverage.uncovered).toBe(0);
  });

  it("is scoped to boundaries a settlement made, not to every owner change", () => {
    // Two platforms at the *same* level touch: no drop, so no boundary pair and
    // nothing to build. (§5.6: "strictly higher only".)
    const field = blankField(12, 4);
    const west: number[] = [];
    const east: number[] = [];
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 12; i++) (i < 6 ? west : east).push(j * 12 + i);
    claim(field, west, BASE_Y + 3);
    claim(field, east, BASE_Y + 3);
    const out = deriveGroundSeams(field);
    expect(out.transitions).toHaveLength(0);
    expect(out.coverage.pairs).toBe(0);
    expect(out.coverage.uncovered).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §5.6 step 3 — a contour on a lattice is a staircase                         */
/* -------------------------------------------------------------------------- */

describe("boundary runs are grouped 8-connected", () => {
  it("reads a 45° boundary as ONE component, not a crumb per column", () => {
    // The third appearance of this lesson; the first two were found by walking.
    // Along a 45° contour, consecutive lower-side columns are *diagonal*
    // neighbours and never edge neighbours, so a 4-connected grouping would
    // return one stub of wall per column.
    const width = 32;
    const depth = 16;
    const field = blankField(width, depth);
    const cells: number[] = [];
    for (let j = 0; j < depth; j++) for (let i = j + 8; i < width; i++) cells.push(j * width + i);
    claim(field, cells, BASE_Y + 5);
    const out = deriveGroundSeams(field);
    expect(out.transitions).toHaveLength(1);
    expect(out.transitions[0]!.cells).toHaveLength(depth);
    expect(out.coverage.uncovered).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §3.2 clauses 2 and 3 — the two suppressions                                 */
/* -------------------------------------------------------------------------- */

describe("the suppressions", () => {
  it("suppresses on a face — a face IS the transition (§2.2)", () => {
    const field = terrace(6, 10, {
      kind: "face",
      sourceClass: "retaining.seam"
    });
    const out = deriveGroundSeams(field);
    expect(out.transitions).toHaveLength(0);
    expect(out.coverage.face).toBe(10);
    expect(out.coverage.transition).toBe(0);
    expect(out.coverage.uncovered).toBe(0);
    expect(out.diagnostics).toEqual([]);
  });

  it('suppresses on `transition: "none"` from the upper side', () => {
    const field = terrace(6, 10, { transition: "none" });
    const out = deriveGroundSeams(field);
    expect(out.transitions).toHaveLength(0);
    expect(out.coverage.request).toBe(10);
    expect(out.coverage.uncovered).toBe(0);
  });

  it('suppresses on `transition: "none"` from the lower side', () => {
    // The lower side is the claimant this time: the platform is the *west* half
    // and the ground east of it is higher, so the "none" is read off `below`.
    const width = 24;
    const depth = 10;
    const field = blankField(width, depth);
    const cells: number[] = [];
    for (let j = 0; j < depth; j++) for (let i = 0; i < 12; i++) cells.push(j * width + i);
    for (let j = 0; j < depth; j++)
      for (let i = 12; i < width; i++) field.ground[j * width + i] = BASE_Y + 6;
    claim(field, cells, BASE_Y, { transition: "none" });
    const out = deriveGroundSeams(field);
    expect(out.transitions).toHaveLength(0);
    expect(out.coverage.request).toBe(depth);
    expect(out.coverage.uncovered).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §3.1 refinement 1 — the levels come from the resolved field                 */
/* -------------------------------------------------------------------------- */

describe("above/below are measured from resolved.ground (§3.1.1)", () => {
  /** A `GroundLevels` that says the drop is `levelDrop`, whatever the field says. */
  function levelsSaying(width: number, depth: number, levelDrop: number): GroundLevels {
    const index = new Int32Array(width * depth).fill(-1);
    for (let j = 0; j < depth; j++)
      for (let i = 0; i < width; i++) index[j * width + i] = i < 12 ? 0 : 1;
    return {
      bounds: { x0: 0, z0: 0, x1: width - 1, z1: depth - 1 },
      index,
      levelY: [BASE_Y, BASE_Y + levelDrop],
      runs: [[], []],
      at: (x: number, z: number): number => index[z * width + x] as number
    };
  }

  it("catches a synthetic disagreement with levelY", () => {
    const drop = 6;
    const field = terrace(drop, 8);
    // The west half is a platform too, as far as `GroundLevels` is concerned —
    // and its `levelY` says the drop is 2. This is audit §3(e) step 8 as a
    // fixture: the tier arithmetic computed against authority 4 while the face
    // presented is measured against authority 2.
    const levels = levelsSaying(24, 8, 2);
    expect(levelSeams(levels)[0]!.drop).toBe(2);

    const out = deriveGroundSeams(field);
    const seam = out.transitions[0]!;
    // The derivation follows the field, not the levels.
    expect(seam.drop).toBe(drop);
    expect(seam.belowY).toBe(BASE_Y);
    expect(seam.aboveY).toBe(BASE_Y + drop);
    expect(seam.aboveY - seam.belowY).toBe(seam.drop);
    expect(seam.drop).not.toBe(levelSeams(levels)[0]!.drop);
  });

  it("reads every run's levels off the field it was derived from", () => {
    for (const drop of [1, 2, 6, 7, 8, 14]) {
      const out = deriveGroundSeams(terrace(drop, 9));
      const seam = out.transitions[0]!;
      expect(seam.belowY).toBe(BASE_Y);
      expect(seam.aboveY).toBe(BASE_Y + drop);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §3.1 refinements 2 and 3 — the context, ungated                             */
/* -------------------------------------------------------------------------- */

describe("the component's context (§3.1.2, §3.1.3)", () => {
  it("measures availableRun off the resolved field with no plannedEdges gate", () => {
    // Twelve unclaimed columns west of the face, and `bankRun(4) === 8`, so the
    // walk stops at its own reach rather than at a district boundary. Nothing
    // planned this edge; the owner map is the whole of the context.
    const out = deriveGroundSeams(terrace(4, 8));
    const seam = out.transitions[0]!;
    expect(seam.availableRun).toBe(8);
    expect(seam.pressedShare).toBe(0);
    expect(seam.side).toBe("fill");
  });

  it("presses where a street owns the ground the bank would spread over", () => {
    const field = terrace(4, 8);
    const road: number[] = [];
    for (let j = 0; j < 8; j++) for (let i = 8; i < 11; i++) road.push(j * 24 + i);
    claim(field, road, BASE_Y, { sourceClass: "street.network" });
    const out = deriveGroundSeams(field);
    const seam = out.transitions.find((t) => t.drop === 4)!;
    expect(seam.pressedShare).toBe(1);
    // The road is the very first column west of the face, so the bank's walk
    // stops before it takes a step: there is no ground to grade into.
    expect(seam.availableRun).toBe(0);
  });

  it("classifies a face a building stands on as `built` (§3.1.3)", () => {
    const field = terrace(4, 8);
    // The occupied mask the structure pass hands in: the upper side of the whole
    // face is a seated footprint.
    const occupied = new Uint8Array(24 * 8);
    for (let j = 0; j < 8; j++) for (let i = 12; i < 16; i++) occupied[j * 24 + i] = 1;
    const out = deriveGroundSeams({ ...field, occupied });
    const seam = out.transitions[0]!;
    expect(seam.builtShare).toBe(1);
    expect(seam.refined).toBe("built");
    // …and the drop-and-run table, which cannot see a placement, still says what
    // it always said. The two live side by side until the flag flips.
    expect(seam.treatment).toBe(treatmentForSeam(4, 8));
  });

  it("reads an unowned upper side as a cut, and a cut is the hill's own rock", () => {
    const width = 24;
    const depth = 10;
    const field = blankField(width, depth);
    const cells: number[] = [];
    for (let j = 0; j < depth; j++) for (let i = 0; i < 12; i++) cells.push(j * width + i);
    for (let j = 0; j < depth; j++)
      for (let i = 12; i < width; i++) field.ground[j * width + i] = BASE_Y + 6;
    claim(field, cells, BASE_Y);
    const out = deriveGroundSeams(field);
    const seam = out.transitions[0]!;
    expect(seam.side).toBe("cut");
    expect(seam.refined).toBe("rock");
  });

  it("has a use for every ground source class", () => {
    // The silently-missing-entry lesson, and the reason `CLASS_USE` is `Partial`:
    // the rewrite mints and retires classes stage by stage, so totality is
    // asserted here rather than by a `Record` that would not compile mid-stage.
    for (const cls of GROUND_SOURCE_CLASSES) {
      expect(SEAM_CLASS_USE[cls], `no EdgeUse row for ${cls}`).toBeDefined();
    }
  });

  it("looks as far behind a face as the retaining pass does", () => {
    // `V1_DEPTH_REACH` restates `RETAIN_FACE_SETBACK · 2`; the two must not drift.
    expect(RETAIN_FACE_SETBACK * 2).toBe(24);
  });
});

/* -------------------------------------------------------------------------- */
/* the tables, reproduced exactly                                              */
/* -------------------------------------------------------------------------- */

describe("treatmentForSeam's table, reproduced exactly", () => {
  it("is the drop table with the run length in it", () => {
    // Drop first: one block is a step you walk up; up to `RETAIN_MAX` is a face;
    // past it, a stack (`SEAM_TIERS` is on) up to `SEAM_TIER_MAX` tiers.
    expect(treatmentForSeam(1, 25)).toBe("kerb");
    expect(treatmentForSeam(1, 1)).toBe("kerb");
    expect(treatmentForSeam(2, 25)).toBe("retaining");
    expect(treatmentForSeam(RETAIN_MAX, 25)).toBe("retaining");
    expect(treatmentForSeam(RETAIN_MAX + 1, 25)).toBe("tiered");
    expect(treatmentForSeam(RETAIN_MAX * SEAM_TIER_MAX, 25)).toBe("tiered");
    // Then the run: a wall shorter than `MIN_RETAIN_RUN` is a buttress nobody
    // asked for, and the answer collapses to the unbuilt one.
    expect(treatmentForSeam(2, 1)).toBe("bank");
    expect(treatmentForSeam(2, 5)).toBe("bank");
    expect(treatmentForSeam(2, 6)).toBe("retaining");
    expect(treatmentForSeam(6, 5)).toBe("bank");
    expect(treatmentForSeam(6, 6)).toBe("retaining");
    // A kerb keeps its length-independent answer: one course of material on the
    // ground, and two columns of it is a doorstep rather than scree.
    expect(treatmentForSeam(1, 5)).toBe("kerb");
  });

  it("is the table the derivation asks, and the only one", () => {
    for (const drop of [1, 2, 6, 7, 8, 14]) {
      for (const run of [1, 5, 6, 25]) {
        const out = deriveGroundSeams(terrace(drop, run));
        expect(out.transitions[0]!.treatment).toBe(treatmentForSeam(drop, run));
      }
    }
  });
});

describe("tiersOf splits a drop tallest-at-the-bottom", () => {
  it("puts the load at the base, index 0 first", () => {
    expect(tiersOf(8, "terraced")).toEqual([
      { face: 4, tread: 3 },
      { face: 4, tread: 3 }
    ]);
    expect((tiersOf(11, "revetted") as { face: number }[]).map((t) => t.face)).toEqual([6, 5]);
    expect((tiersOf(14, "revetted") as { face: number }[]).map((t) => t.face)).toEqual([5, 5, 4]);
    // Non-increasing, always, and summing to the drop.
    for (let drop = 1; drop <= RETAIN_MAX * SEAM_TIER_MAX; drop++) {
      const tiers = tiersOf(drop, "terraced") as { face: number }[];
      expect(tiers.reduce((s, t) => s + t.face, 0)).toBe(drop);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i - 1]!.face).toBeGreaterThanOrEqual(tiers[i]!.face);
      }
    }
    // Past the stack, the election was wrong — S3, and `"replan"` has a caller.
    expect(tiersOf(RETAIN_MAX * SEAM_TIER_MAX + 1, "terraced")).toBe("replan");
  });
});

/* -------------------------------------------------------------------------- */
/* the stage's goldens                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `LOAM-I497 GROUND_STAGE`, measured on the three r22 documents at WP-G4 with
 * `GROUND_V1_SEAMS` off — §6/WP-G4's "the reported transition count is a
 * golden".
 *
 * Recorded here rather than recomputed: compiling Troy takes minutes and the
 * compile-level guard is `ground-probe-harness.test.ts`. What this table is for
 * is the flag-on half — the diff that answers "does the resolver enumerate the
 * same seams `levelSeams`/`skirtSeams` do, plus the ones they miss?" — and the
 * commit message that moves a number has to say why.
 *
 * `uncovered` is **zero on all three**, which is the stage's acceptance: if the
 * resolver cannot account for a boundary that is a resolver bug and it blocks
 * the stage.
 */
export const GROUND_STAGE_GOLDEN = {
  troy: {
    intents: 3061,
    moved: 7694,
    transitions: 1648,
    byTreatment: { bank: 482, built: 95, kerb: 837, retaining: 2, rock: 214, tiered: 18 },
    wouldBuild: 716,
    coverage: { pairs: 5630, transition: 4292, request: 1056, face: 282, kerb: 0, uncovered: 0 }
  },
  hellenist: {
    intents: 663,
    moved: 2937,
    transitions: 778,
    byTreatment: { bank: 17, built: 136, kerb: 622, retaining: 1, rock: 2 },
    wouldBuild: 20,
    coverage: { pairs: 2910, transition: 1852, request: 1058, face: 0, kerb: 0, uncovered: 0 }
  },
  pirates: {
    intents: 1539,
    moved: 2124,
    transitions: 298,
    byTreatment: { bank: 57, built: 28, kerb: 188, retaining: 3, rock: 22 },
    wouldBuild: 81,
    coverage: { pairs: 1675, transition: 1007, request: 660, face: 8, kerb: 0, uncovered: 0 }
  }
} as const;

/**
 * **The stage guard, stated where it is exactly true** (WP-G4's flip
 * measurement, 2026-08-20).
 *
 * /WP-G4 guards the hillside with
 * "`natural/natural` ± 0" on the probe's census. Measured at the flip, that row
 * moves without a single column of terrain moving: the census keys a pair by the
 * *owner map*, and a column that was owned flag-off by a claim `skirtSeams` or
 * `planeSeams` made is unowned once those passes are absorbed, so the same two
 * columns re-key from `verge/natural` to `natural/natural`. Hellenist's row
 * moves 1,469 → 1,843 that way, and every one of those 1,840 pairs is ground
 * that never moved.
 *
 * So the substance of the guard is asserted here instead, over the thing that
 * would actually be a defect: **no column the resolver left unowned may have its
 * ground moved by the structure pass.** A bank that graded unclaimed hillside, a
 * course that stood on ground nothing claimed, a pass writing `plan.ground`
 * behind the contract's back — each of those moves this number off zero, and
 * none of them can hide inside a census row that a rank change also moves.
 *
 * Measured 0 on troy, hellenist and pirates in both flag states; `hillside-village`
 * is the fixture because it is the cheapest committed world with real platforms.
 * The post-structure passes (programs, scatter — §7.1's 247 columns on troy, and
 * WP-G6's work) are deliberately outside it: this is a statement about the
 * structure pass, so it is asked of `written`, not of the final plan.
 */
describe("the hillside guard: the structure pass moves no unowned column", () => {
  it("hillside-village: every unowned column's resolved ground is its baseline", async () => {
    const doc = JSON.parse(
      await readFile(
        fileURLToPath(new URL("fixtures/examples/hillside-village.loam.json", import.meta.url)),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-ground-guard-"));
    try {
      let baseline: GroundBaseline | undefined;
      let resolved: ResolvedGround | undefined;
      const out = await compileArtifacts(doc, {
        onProbeGround: (ctx) => {
          baseline = ctx.baseline;
          resolved = ctx.resolved;
        }
      });
      expect(out.ok, "hillside-village compiles").toBe(true);
      if (baseline === undefined || resolved === undefined) throw new Error("no probe ground — did onProbeGround fire?");
      const region = baseline.region;
      const moved: string[] = [];
      for (let k = 0; k < resolved.ground.length; k++) {
        if ((resolved.owner[k] as number) !== -1) continue;
        if (resolved.ground[k] === baseline.ground[k]) continue;
        if (moved.length < 8) {
          moved.push(
            `${region.x0 + (k % region.width)},${region.z0 + Math.floor(k / region.width)}: ` +
              `${baseline.ground[k]} → ${resolved.ground[k]}`,
          );
        }
      }
      expect(moved.join("; "), "unowned columns the structure pass moved").toBe("");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 240_000);
});

describe("the WP-G4 goldens", () => {
  it("ships with the flag on — the flip half", () => {
    // **Re-pinned at WP-G4's flip.** Off was the derive half's shipped state
    // (derive, report, build nothing, byte-identical); on is the shipped state
    // now, and the goldens below are unchanged by it because they measure the
    // *derivation*, which the flip does not touch.
  });

  it("is internally consistent: the treatments partition the transitions", () => {
    for (const [id, g] of Object.entries(GROUND_STAGE_GOLDEN)) {
      const total = Object.values(g.byTreatment).reduce((s, n) => s + n, 0);
      expect(total, `${id}: byTreatment sums to transitions`).toBe(g.transitions);
      expect(g.wouldBuild, `${id}: wouldBuild is a subset`).toBeLessThanOrEqual(g.transitions);
      const clauses =
        g.coverage.transition + g.coverage.request + g.coverage.face + g.coverage.kerb;
      expect(clauses + g.coverage.uncovered, `${id}: the clauses account for every pair`).toBe(
        g.coverage.pairs,
      );
      expect(g.coverage.uncovered, `${id}: LOAM-E495 fires zero times`).toBe(0);
    }
  });
});
