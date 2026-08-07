/**
 * WP-0/WP-1 — the frontage-led hillside planner (`docs/SITE-PLAN-v0.md` §8, §10).
 *
 * **Every number below was written from the document before the code existed**,
 * except the block explicitly labelled *prototype goldens*, which is the §8.3
 * acceptance table filled in with what the prototype actually measured — some of
 * it short of the bar, and the report says which and why. §10's prohibition is
 * the reason for the split: a test written by reading the implementation is a
 * test that asserts the bug, and this repo has paid for that twice.
 *
 * The rows §10 asks WP-0 for:
 *
 * 1. **Determinism.** The same document and seed give the same plan twice.
 * 2. **§3.4's two rules**, asserted directly on a synthetic slope. This is
 *    check 3's proof and §10 calls it the single most important unit test here.
 * 3. **Natural ground is preserved** — every column no strip claimed keeps
 *    `NO_PLATFORM`, which is the sentence the whole document exists to make true.
 * 4. **No classifier reachability.** `hillside` is registered and the classifier
 *    cannot choose it (§7.1, until Kai accepts the prototype).
 * 5. **`TERRACE_RISE === RETAIN_MAX`**, which §3.8 says a test MUST assert.
 * 6. **The planner is not a second layout solver** (§11.3): it imports nothing
 *    from `layout/solve.ts`.
 * 7. **The compiled fixture's composition**, as goldens.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PHYSICS_RULES, lintWorldPhysics } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain } from "../src/terrain/compile.js";

import { nodeSeed } from "@terrainist/stdlib";
import { DISTRICT_FABRICS } from "@terrainist/spec";

import { NO_PLATFORM, RETAIN_MAX, groundLevelsOf } from "../src/layout/levels.js";
import type { Rect } from "../src/layout/frames.js";
import { carriagewayCells } from "../src/layout/streets.js";
import {
  HILLSIDE_FORM,
  MAX_PRINCIPAL_STREETS,
  MIN_BUILDABLE_DEPTH,
  MIN_PRINCIPAL_STREETS,
  REAR_MARGIN,
  TERRACE_RISE,
  minStripDepth,
} from "../src/layout/forms/hillside.js";
import {
  COMPOSITION_GATES,
  MAX_REPLAN_ROUNDS,
  MIN_INFILL_SIDE,
  compositionOf,
  planQuarter,
} from "../src/layout/district.js";
import type {
  FormContext,
  FormPlan,
  GroundSample,
  PlanAttempt,
} from "../src/layout/forms/index.js";

/* -------------------------------------------------------------------------- */
/* a hill, and a quarter on it                                                 */
/* -------------------------------------------------------------------------- */

const scratch: string[] = [];
afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

const QUARTER = 160;
const BOUNDS: Rect = { x0: -QUARTER / 2, z0: -QUARTER / 2, x1: QUARTER / 2 - 1, z1: QUARTER / 2 - 1 };
const SEED = nodeSeed(20260807n, "world.hill_town", "");

/**
 * A slope that falls along **x only**, so the contours are straight and the
 * fixture tests the rule rather than the raster — the same reason
 * `terraced-stride.test.ts` gives for its own straight hill.
 *
 * The **shelf** is the case §3.4 exists for: a broad ledge in the middle of a
 * cliff. Beside the shelf a station can claim its full depth; on the cliff it
 * can claim nothing, and rule 1 says it must therefore claim nothing at all
 * rather than a three-column ledge for a wall to fall off eight passes later.
 */
function shelfAt(x: number): number {
  if (x < -30) return 70 + Math.round((x + 30) / 1.2) + 30;
  if (x <= 10) return 100;
  return 100 + Math.round((x - 10) / 1.2);
}

/** A plain, even hillside: 1 in 4, so a full-depth strip fits either side. */
const evenAt = (x: number): number => 80 + Math.round(x / 4);

function groundOf(at: (x: number) => number): GroundSample {
  return {
    height: (x) => at(x),
    water: () => false,
    slope: (x) => Math.abs(at(x + 1) - at(x)),
    relief: at(BOUNDS.x1) - at(BOUNDS.x0),
    levelled: false,
    waterReach: Number.POSITIVE_INFINITY,
  };
}

const SIDEWALK = 2;

function context(ground: GroundSample, attempt?: PlanAttempt): FormContext {
  return {
    bounds: BOUNDS,
    seed: SEED,
    blockSize: 32,
    sidewalk: SIDEWALK,
    density: "medium",
    ground,
    focus: [],
    ...(attempt === undefined ? {} : { attempt }),
  };
}

function drawn(at: (x: number) => number, attempt?: PlanAttempt): FormPlan {
  const result = HILLSIDE_FORM.draw(context(groundOf(at), attempt));
  if (!result.ok) throw new Error(`hillside refused: ${result.reason}`);
  return result.plan;
}

/** A slope of about 1 in 2.5 — the gradient of the walked hill town's site. */
const steepAt = (x: number): number => 80 + Math.round((x + QUARTER / 2) / 2.5);

const index = (x: number, z: number): number =>
  (z - BOUNDS.z0) * QUARTER + (x - BOUNDS.x0);

/* -------------------------------------------------------------------------- */
/* 1 — determinism (§3.1)                                                      */
/* -------------------------------------------------------------------------- */

describe("the planner is a pure function of its ground", () => {
  it("draws the same plan twice, segment for segment and column for column", () => {
    const a = drawn(evenAt);
    const b = drawn(evenAt);
    expect(b.graph.segments.map((s) => s.id)).toEqual(a.graph.segments.map((s) => s.id));
    expect(JSON.stringify(b.graph.segments)).toBe(JSON.stringify(a.graph.segments));
    expect(b.benches?.map((x) => x.level)).toEqual(a.benches?.map((x) => x.level));
    for (const [i, strip] of (b.strips ?? []).entries()) {
      expect([...strip.columns]).toEqual([...(a.strips ?? [])[i]!.columns]);
    }
  });

  it("lays between two and four principal streets, and no more", () => {
    const plan = drawn(evenAt);
    const principals = plan.graph.segments.filter((s) => s.kind === "street");
    expect(principals.length).toBeGreaterThanOrEqual(MIN_PRINCIPAL_STREETS);
    // One chosen contour may be cut into more than one run by the mask or by a
    // station that lays no street, so the ceiling is on *contours*, not runs;
    // the bench count is one per surviving run and is what the composition sees.
    expect(new Set(principals.map((s) => s.id.split("_")[0])).size).toBeLessThanOrEqual(
      MAX_PRINCIPAL_STREETS,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — §3.4's two rules, the proof of check 3                                  */
/* -------------------------------------------------------------------------- */

describe("a strip is a terrace, not a stamp", () => {
  /**
   * Rule 1: **a station whose claim is shallower than `MIN_STRIP_DEPTH` claims
   * nothing.** Cutting a three-column ledge because a contour passed through is
   * exactly what produces an `offPlatform` wall eight passes later.
   *
   * Measured as the property it buys rather than by re-deriving the probe: no
   * claimed column of any strip lies further from its street than a full-depth
   * claim allows, and every strip that exists is at least `MIN_STRIP_DEPTH`
   * deep somewhere along it. A strip made of three-column ledges could not
   * satisfy the second.
   */
  it("keeps no claim shallower than MIN_STRIP_DEPTH", () => {
    const plan = drawn(shelfAt);
    expect(plan.strips?.length).toBeGreaterThan(0);
    for (const strip of plan.strips ?? []) {
      let deepest = 0;
      for (let k = 0; k < strip.columns.length; k++) {
        if (strip.columns[k] !== 1) continue;
        deepest = Math.max(deepest, (strip.depth[k] as number) + 1);
      }
      // **One datum** (WP-1, finding 2). `depth` is measured back from the
      // build-to line; `minStripDepth` is measured from the carriageway edge,
      // and the two differ by the verge — which is exactly the confusion §3.8's
      // constant 8 encoded. Adding the verge back is what states them against
      // one datum, and the floor now carries it.
      expect(deepest + SIDEWALK + 1).toBeGreaterThanOrEqual(minStripDepth(SIDEWALK));
    }
  });

  /**
   * Rule 2: **a station that cannot hold `carriageway + sidewalk + 1` lays no
   * street.** This is what makes `offPlatform` unrepresentable — the condition
   * `walkBack` discovers four passes downstream is checked in the planner, where
   * it can still be acted on.
   *
   * The assertion is the guarantee itself: **every carriageway column of a
   * principal street stands on a platform**, with a column of that platform's
   * own ground beyond the verge for a wall to stand on.
   */
  it("lays no principal street across ground that cannot hold it", () => {
    const plan = drawn(shelfAt);
    const levels = groundLevelsOf(BOUNDS, plan.benches ?? []);
    expect(levels).not.toBeNull();
    const principals = plan.graph.segments.filter((s) => s.kind === "street");
    expect(principals.length).toBeGreaterThan(0);
    let off = 0;
    for (const cell of carriagewayCells(
      { ...plan.graph, segments: principals },
      BOUNDS,
    )) {
      if (levels!.at(cell.x, cell.z) === NO_PLATFORM) off++;
    }
    expect(off).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 — the rest of the hill stays hill (§3.6)                                  */
/* -------------------------------------------------------------------------- */

describe("everything no use asked for stays natural slope", () => {
  it("leaves NO_PLATFORM on every column outside a claim", () => {
    const plan = drawn(evenAt);
    const levels = groundLevelsOf(BOUNDS, plan.benches ?? []);
    expect(levels).not.toBeNull();
    // A platform column is either inside a strip or inside the street band its
    // own strip fronts; nothing else may be levelled.
    let platform = 0;
    for (let z = BOUNDS.z0; z <= BOUNDS.z1; z++) {
      for (let x = BOUNDS.x0; x <= BOUNDS.x1; x++) {
        if (levels!.at(x, z) !== NO_PLATFORM) platform++;
      }
    }
    expect(platform).toBeGreaterThan(0);
    expect(platform).toBeLessThan(QUARTER * QUARTER);

    // And the lot mask never offers ground the planner did not claim.
    const claimed = new Uint8Array(QUARTER * QUARTER);
    for (const strip of plan.strips ?? []) {
      for (let k = 0; k < claimed.length; k++) if (strip.columns[k] === 1) claimed[k] = 1;
    }
    for (let k = 0; k < claimed.length; k++) {
      if (plan.lotMask?.[k] === 1) expect(claimed[k]).toBe(1);
    }
    void index;
  });
});

/* -------------------------------------------------------------------------- */
/* 3b — the constants stand against one datum (WP-1, finding 2)                */
/* -------------------------------------------------------------------------- */

describe("a station that clears the floor yields a lot the grammar keeps", () => {
  /**
   * §3.8 wrote `MIN_STRIP_DEPTH` as the constant 8 — `MIN_INFILL_SIDE` plus one
   * — and measured `D_target` from the carriageway edge while `MIN_INFILL_SIDE`
   * is measured from the build-to line. The two differ by the sidewalk, so at
   * `sidewalk = 2` a station could clear the rule with six buildable columns
   * and the frontage walk would drop every lot on it.
   */
  it("carries the verge in the floor, so the two are one measurement", () => {
    expect(minStripDepth(SIDEWALK)).toBe(SIDEWALK + MIN_INFILL_SIDE + REAR_MARGIN);
    expect(MIN_BUILDABLE_DEPTH).toBe(MIN_INFILL_SIDE);
    // The old constant is what a zero-verge street would ask for, and no street
    // this compiler draws has one.
    expect(minStripDepth(0)).toBe(8);
    expect(minStripDepth(SIDEWALK)).toBeGreaterThan(8);
  });

  it("keeps every strip deep enough to build on, measured from the build-to line", () => {
    for (const at of [evenAt, shelfAt, steepAt]) {
      for (const strip of drawn(at).strips ?? []) {
        let deepest = 0;
        for (let k = 0; k < strip.columns.length; k++) {
          if (strip.columns[k] === 1) deepest = Math.max(deepest, (strip.depth[k] as number) + 1);
        }
        expect(deepest).toBeGreaterThanOrEqual(MIN_INFILL_SIDE);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3c — the steep regime (§3.7; WP-0 finding 6)                                */
/* -------------------------------------------------------------------------- */

describe("ground the walked hill town was actually built on", () => {
  /**
   * WP-0 read `STRIP_DEPTH_MIN = 16` as a requirement and concluded that a
   * terrace rise of 6 needs ground no steeper than about 1:3, while the walked
   * site is 1:2.5. `STRIP_DEPTH_MIN` is a **target**; what refuses a station is
   * `minStripDepth`, and ten columns stay inside one terrace rise on anything
   * gentler than about 1:1.7. So a 1:2.5 quarter plans — with shallower claims,
   * which is the sparse town the narrow arm was asked for.
   */
  it("plans a town on a 1:2.5 slope rather than refusing one", () => {
    const plan = drawn(steepAt);
    expect(plan.graph.segments.filter((sg) => sg.kind === "street").length).toBeGreaterThanOrEqual(
      MIN_PRINCIPAL_STREETS,
    );
    expect((plan.strips ?? []).length).toBeGreaterThan(0);
    // Shallower than the same plan on a 1 in 4: the claim is cut by the terrace
    // rise, not by the target, and that is the whole of the steep regime.
    const deepest = (p: FormPlan): number => {
      let d = 0;
      for (const strip of p.strips ?? []) {
        for (let k = 0; k < strip.columns.length; k++) {
          if (strip.columns[k] === 1) d = Math.max(d, (strip.depth[k] as number) + 1);
        }
      }
      return d;
    };
    expect(deepest(plan)).toBeLessThan(deepest(drawn(evenAt)));
  });

  it("honours narrowBy as a composition lever, on any ground", () => {
    // §6.3's other rung, exercised directly: a shallower `D_target` claims
    // strictly less ground. It is not a feasibility response — narrowing can
    // only lower a candidate's score — and this is the property that makes it
    // worth keeping anyway.
    const claimed = (p: FormPlan): number => {
      let n = 0;
      for (const strip of p.strips ?? []) {
        for (let k = 0; k < strip.columns.length; k++) if (strip.columns[k] === 1) n++;
      }
      return n;
    };
    const wide = drawn(evenAt);
    const narrow = drawn(evenAt, { round: 2, dropStreets: 0, narrowBy: 6 });
    expect(claimed(narrow)).toBeLessThan(claimed(wide));
  });
});

/* -------------------------------------------------------------------------- */
/* 3d — the replan ladder (§6.3)                                               */
/* -------------------------------------------------------------------------- */

describe("the ladder is deterministic, bounded and monotone", () => {
  const streets = (p: FormPlan): number =>
    new Set(p.graph.segments.filter((sg) => sg.kind === "street").map((sg) => sg.id.split("_")[0]))
      .size;

  it("lays no more principal contours than the rung allows", () => {
    for (let round = 0; round < MAX_REPLAN_ROUNDS; round++) {
      const plan = drawn(evenAt, { round, dropStreets: round, narrowBy: 0 });
      expect(streets(plan)).toBeLessThanOrEqual(MAX_PRINCIPAL_STREETS - round);
      expect(streets(plan)).toBeGreaterThanOrEqual(MIN_PRINCIPAL_STREETS);
    }
  });

  it("floors at two, so the ladder has exactly three rungs", () => {
    // Asking for more than the ceiling drop cannot go below Sol's floor.
    const floored = drawn(evenAt, { round: 9, dropStreets: 9, narrowBy: 0 });
    expect(streets(floored)).toBe(MIN_PRINCIPAL_STREETS);
    expect(MAX_REPLAN_ROUNDS).toBe(MAX_PRINCIPAL_STREETS - MIN_PRINCIPAL_STREETS + 1);
  });

  it("draws the same rung twice, column for column", () => {
    const attempt: PlanAttempt = { round: 1, dropStreets: 1, narrowBy: 0 };
    const a = drawn(evenAt, attempt);
    const b = drawn(evenAt, attempt);
    expect(JSON.stringify(b.graph.segments)).toBe(JSON.stringify(a.graph.segments));
  });

  it("leaves more hillside and less road at every rung down", () => {
    // The measured curve §3.8's justification did not have, and the reason the
    // ladder is worth having: fewer streets is monotonically more hillside.
    let previous: { natural: number; street: number } | null = null;
    for (let round = 0; round < MAX_REPLAN_ROUNDS; round++) {
      const plan = drawn(evenAt, { round, dropStreets: round, narrowBy: 0 });
      const c = compositionOf(plan, BOUNDS, SIDEWALK);
      if (previous !== null) {
        expect(c.naturalFraction).toBeGreaterThan(previous.natural);
        expect(c.streetFraction).toBeLessThan(previous.street);
      }
      previous = { natural: c.naturalFraction, street: c.streetFraction };
    }
  });

  it("ships the best rung and says what it missed when none of them passes", () => {
    // §10: "a gate nobody has seen fire is a gate nobody has tested." A quarter
    // half the size carries the same street cross-section over a quarter of the
    // ground, so its road share cannot come under the bar at any rung — and the
    // ladder must then ship the *best* composition with a diagnostic naming the
    // measurement, rather than shipping the first plan or abandoning the town.
    const half: Rect = { x0: -48, z0: -48, x1: 47, z1: 47 };
    const planned = planQuarter(
      {
        ...context(groundOf(evenAt)),
        bounds: half,
        fabric: "hillside",
        nodePath: "world.small_hill_town",
      },
      SIDEWALK,
    );
    expect(planned.drawn.ok).toBe(true);
    expect(planned.rounds).toBe(MAX_REPLAN_ROUNDS);
    expect(planned.composition).not.toBeNull();
    expect(planned.note).not.toBeNull();
    const [message, fix] = planned.note as readonly [string, string];
    expect(message).toContain("world.small_hill_town");
    expect(message).toContain("principal street");
    expect(message).toMatch(/road|hillside/);
    expect(fix).toContain("zone");
    // Never the failing first plan: the best rung is the one that ships.
    const shipped = planned.composition as { naturalFraction: number; streetFraction: number };
    const first = compositionOf(
      (HILLSIDE_FORM.draw({ ...context(groundOf(evenAt)), bounds: half }) as { plan: FormPlan })
        .plan,
      half,
      SIDEWALK,
    );
    expect(shipped.streetFraction).toBeLessThanOrEqual(first.streetFraction);
    expect(shipped.naturalFraction).toBeGreaterThanOrEqual(first.naturalFraction);
  });

  it("states its gates as §6.1 states them", () => {
    expect(COMPOSITION_GATES.naturalFraction).toBe(0.4);
    expect(COMPOSITION_GATES.streetFraction).toBe(0.25);
  });
});

/* -------------------------------------------------------------------------- */
/* 4 — registered, and unreachable from the classifier (§7.1)                  */
/* -------------------------------------------------------------------------- */

const AGENTS = fileURLToPath(new URL("../../agents/src/intent-prepass.ts", import.meta.url));
const KIT = fileURLToPath(new URL("../../../docs/kits/settlement-author.md", import.meta.url));

describe("hillside is registered and nothing can reach it by accident", () => {
  it("is in the fabric vocabulary, so a document may name it", () => {
    expect(DISTRICT_FABRICS as readonly string[]).toContain("hillside");
    expect(HILLSIDE_FORM.id).toBe("hillside");
  });

  it("is absent from the classifier's urban-form table", async () => {
    const source = await readFile(AGENTS, "utf8");
    // The hint table is what the classifier is shown; a form with no line in it
    // is a form no prompt can ever be classified into.
    const table = source.slice(
      source.indexOf("const URBAN_FORM_HINTS"),
      source.indexOf("const URBAN_FORM_LINES"),
    );
    expect(table).not.toContain("hillside:");
    expect(source).toContain('UNOFFERED_FORMS');
  });

  it("is absent from the settlement author kit's fabric vocabulary", async () => {
    // The word "hillside" appears in the kit's prose about slopes; what must
    // not appear is the *id*, in the row that lists what `params.fabric` takes.
    const kit = await readFile(KIT, "utf8");
    const row = kit.split("\n").find((line) => line.includes("`params.fabric`") && line.includes("`terraced`"));
    expect(row).toBeDefined();
    expect(row).not.toContain("`hillside`");
  });
});

/* -------------------------------------------------------------------------- */
/* 5, 6 — the constants and the scope boundary                                 */
/* -------------------------------------------------------------------------- */

describe("the constants cannot drift apart", () => {
  it("ties TERRACE_RISE to the tallest drop a wall is built for", () => {
    // §3.8: a terrace whose face is taller than any wall we build is a cliff
    // with houses on it.
    expect(TERRACE_RISE).toBe(RETAIN_MAX);
  });

  it("declares the relief a hill town needs as two terraces of it", () => {
    expect(HILLSIDE_FORM.requires.minRelief).toBe(2 * TERRACE_RISE);
    expect(HILLSIDE_FORM.requires.unlevelled).toBe(true);
    expect(HILLSIDE_FORM.requires.fallback).toBe("grown");
  });
});

describe("the planner is not a second layout solver (§11.3)", () => {
  it("imports nothing from layout/solve.ts", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/layout/forms/hillside.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain("solve.js");
    expect(source).not.toContain("solve.ts");
  });
});

/* -------------------------------------------------------------------------- */
/* 7 — the refusal, which is the other half of §7.2                            */
/* -------------------------------------------------------------------------- */

describe("flat ground cannot select this form", () => {
  it("refuses a quarter with less relief than two terraces", () => {
    const result = HILLSIDE_FORM.draw(context(groundOf((x) => 80 + Math.round(x / 60))));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback).toBe("grown");
      expect(result.reason).toContain("relief");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 8 — the compiled fixture, and §8.3's table                                  */
/* -------------------------------------------------------------------------- */

/**
 * **The goldens, renegotiated at WP-1** — the WP-0 block they replace is in git
 * history, and the report on this change carries the bar-by-bar comparison.
 *
 * WP-0 pinned what the prototype measured at four principal streets: 17
 * buildings, natural 0.195, street 0.388, 458 columns of wall. Three things
 * moved them, all of them measured rather than tuned:
 *
 * 1. **§6.3's replan ladder** now runs. Round 0 (four streets) measures
 *    0.199 / 0.379, round 1 (three) 0.326 / 0.331, round 2 (two)
 *    **0.481 / 0.249** — the first rung that clears both of §6.1's bars, and the
 *    one that ships. That is the curve WP-0 measured, consumed the way §6.3 says
 *    to consume it, and it is what makes the two bars satisfiable at all.
 * 2. **One datum for the strip floor** (finding 2): a station now has to hold
 *    its verge as well as its building, so the shallowest stations pinch out
 *    where before they produced lots the grammar dropped.
 * 3. **The platform is closed and opened** before it is declared, and the street
 *    band comes off the raster rather than off the arithmetic (finding 5) — the
 *    two together take `offPlatform` to zero and hold it there.
 *
 * The town is **smaller and the hillside is a hillside**: nine buildings holding
 * **seventeen dwellings** (a terrace's bays are homes — the number §8.3 check 2
 * should have been counting), on a quarter that is 48% uncut ground with 156
 * columns of wall, against the walked control's 7 buildings, 0% and 1,566.
 * §8.3's check 2 (≥ 30 buildings) is **not** met and cannot be met at two
 * principal streets: it and the composition bars are in tension, and that
 * tension is this package's finding rather than something to tune away.
 */
const GOLDEN = {
  quarterColumns: 24_320,
  districtBuildings: 9,
  /** A terrace is one building with `bays` front doors. This is the town's size. */
  dwellings: 17,
  lots: 15,
  lotsDropped: 7,
  infill: 7,
  terraceBays: 10,
  offPlatform: 0,
  wallColumns: 156,
  /** Rungs of §6.3's ladder walked, and where it landed. */
  replanRounds: 3,
  principalStreets: 2,
  // Bars: naturalFraction >= 0.40, streetFraction <= 0.25. Both cleared.
  naturalFraction: 0.4813,
  streetFraction: 0.2486,
} as const;

describe("the fixture hill town, compiled", () => {
  let district: {
    bounds: Rect;
    stats: Record<string, number>;
    carriageway: Record<string, number>;
    sidewalk: Record<string, number>;
    levels?: { index: Record<string, number> };
    form: { id: string; requested: string };
  };
  let sweep: string;
  let buildings: number;
  let worldDir: string;
  let lintInput: { buildings: unknown[]; roads: unknown[]; props: unknown[] };

  beforeAll(async () => {
    const doc = JSON.parse(
      await readFile(
        fileURLToPath(new URL("../../../examples/site-plan-hillside.loam.json", import.meta.url)),
        "utf8",
      ),
    ) as unknown;
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-siteplan-"));
    scratch.push(root);
    const compiled = await compileTerrain(doc, { outDir: path.join(root, "hillside_town") });
    if (!compiled.ok) throw new Error("fixture compile failed");
    const report = compiled.report as unknown as {
      layout: { districts: (typeof district)[] };
      stats: { structures: { districtBuildings: number } };
      diagnostics: readonly { name: string; message: string }[];
    };
    worldDir = path.join(root, "hillside_town");
    const structures = (compiled.report as unknown as {
      layout?: { structures?: { buildings?: unknown[]; roads?: { routes?: unknown[] }; props?: unknown[] } };
    }).layout?.structures;
    lintInput = {
      buildings: structures?.buildings ?? [],
      roads: structures?.roads?.routes ?? [],
      props: structures?.props ?? [],
    };
    district = report.layout.districts[0] as typeof district;
    buildings = report.stats.structures.districtBuildings;
    sweep = report.diagnostics.find((d) => d.name === "SWEEP_FEATURES_PLACED")?.message ?? "";
  }, 300_000);

  it("drew the form the document asked for, rather than a fallback", () => {
    expect(district.form.requested).toBe("hillside");
    expect(district.form.id).toBe("hillside");
  });

  it("is not seated flush against the region boundary (§8.2)", () => {
    // The control was at `x1 = 255`, the region's east edge, and its blocks were
    // sliced by it; a comparison against that measures the wrong thing.
    for (const v of [district.bounds.x0, district.bounds.z0]) expect(v).toBeGreaterThan(-256 + 32);
    for (const v of [district.bounds.x1, district.bounds.z1]) expect(v).toBeLessThan(256 - 32);
  });

  it("reports zero offPlatform — check 3, and it is not negotiable (§5.5)", () => {
    expect(sweep).not.toContain("offPlatform");
  });

  it("builds fewer than 600 columns of wall — check 4", () => {
    const walls = Number(/over (\d+) column\(s\)/.exec(sweep)?.[1] ?? -1);
    expect(walls).toBe(GOLDEN.wallColumns);
    expect(walls).toBeLessThan(600);
  });

  it("measures the composition the prototype actually produced", () => {
    const b = district.bounds;
    const w = b.x1 - b.x0 + 1;
    const d = b.z1 - b.z0 + 1;
    const n = w * d;
    expect(n).toBe(GOLDEN.quarterColumns);
    let street = 0;
    let natural = 0;
    for (let k = 0; k < n; k++) {
      const paved = district.carriageway[String(k)] === 1 || district.sidewalk[String(k)] === 1;
      if (paved) street++;
      else if ((district.levels?.index[String(k)] ?? -1) === NO_PLATFORM) natural++;
    }
    expect(buildings).toBe(GOLDEN.districtBuildings);
    expect(district.stats["dwellings"]).toBe(GOLDEN.dwellings);
    expect(district.stats["lots"]).toBe(GOLDEN.lots);
    expect(district.stats["infill"]).toBe(GOLDEN.infill);
    expect(district.stats["terraceBays"]).toBe(GOLDEN.terraceBays);
    expect(district.stats["replanRounds"]).toBe(GOLDEN.replanRounds);
    expect(district.stats["principalStreets"]).toBe(GOLDEN.principalStreets);
    expect(natural / n).toBeCloseTo(GOLDEN.naturalFraction, 3);
    expect(street / n).toBeCloseTo(GOLDEN.streetFraction, 3);
    // The metrics the district reports are the metrics measured off the world:
    // §6.1 is computed before a structure exists and must still describe the
    // quarter that was built, or the gate is guarding something else.
    expect(district.stats["naturalFraction"]).toBeCloseTo(natural / n, 6);
    expect(district.stats["streetFraction"]).toBeCloseTo(street / n, 6);
    // **The gates the ladder was run against** (§6.1, §6.2 as amended).
    expect(natural / n).toBeGreaterThanOrEqual(COMPOSITION_GATES.naturalFraction);
    expect(street / n).toBeLessThanOrEqual(COMPOSITION_GATES.streetFraction);
    // Against the walked control: 9 buildings holding 17 dwellings where the
    // control had 7 of each, on a quarter that is 48% natural ground where the
    // control was 0%, with 156 columns of wall where the control had 1 566.
    expect(buildings).toBeGreaterThan(7);
    expect(district.stats["dwellings"]).toBeGreaterThan(7);
  });

  // Check 9, and §8.3 says it is not negotiable and is not traded against any
  // of the others: a prettier world with a floating block is a regression.
  it("lints zero on all 26 physics rules", async () => {
    const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const report = await lintWorldPhysics(worldDir, stack, {
      buildings: lintInput.buildings as never,
      roads: lintInput.roads as never,
      props: lintInput.props as never,
    });
    expect(report.examined).toBeGreaterThan(1_000_000);
    expect(
      report.findings
        .slice(0, 12)
        .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
        .join("\n"),
    ).toBe("");
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  }, 300_000);
});

/* -------------------------------------------------------------------------- */
/* 9 — the steep fixture: 1:2.5, the gradient of the walked hill town's site   */
/* -------------------------------------------------------------------------- */

/**
 * **The steep goldens.** Same document as the gentle fixture on a cone twice as
 * steep — 208 blocks over 520, about 1 in 2.5, which is the ground the walked
 * hill town of §1 was actually built on. WP-0 read §3.8's `STRIP_DEPTH_MIN` as a
 * requirement and concluded this regime was out of reach until v1's stepped
 * rows; measured, it plans.
 *
 * It plans **sparsely**, and the numbers say so honestly: four buildings holding
 * seven dwellings on a quarter that is 63% uncut hillside. Two things make it
 * sparse and neither is a defect in the planner. The claims are cut short by the
 * terrace rise — thirteen columns rather than nineteen — so a strip holds fewer
 * and smaller lots; and §6.1's `streetFraction` bar takes the ladder all the way
 * down to two principal streets, where the same quarter at four measures
 * natural 0.418 / street 0.369 and holds a good deal more town. That trade is
 * the open question this package hands to WP-5's calibration, not a knob to
 * turn here.
 *
 * The summit chapel of the gentle fixture is **absent**, deliberately: on a cone
 * this steep its `flatten` doorstep fails `traversal.no_start` wherever it is
 * put, which is a building-on-extreme-slope defect a quarter away from the
 * district and nothing to do with the planner. Keeping it would have made this
 * fixture assert someone else's bug.
 */
const STEEP = {
  quarterColumns: 24_320,
  districtBuildings: 4,
  dwellings: 7,
  lots: 11,
  infill: 3,
  terraceBays: 4,
  wallColumns: 161,
  replanRounds: 3,
  naturalFraction: 0.6278,
  streetFraction: 0.2439,
} as const;

describe("the steep fixture hill town, compiled", () => {
  let district: {
    bounds: Rect;
    stats: Record<string, number>;
    carriageway: Record<string, number>;
    sidewalk: Record<string, number>;
    levels?: { index: Record<string, number> };
    form: { id: string; requested: string };
  };
  let sweep: string;
  let buildings: number;
  let worldDir: string;
  let lintInput: { buildings: unknown[]; roads: unknown[]; props: unknown[] };

  beforeAll(async () => {
    const doc = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL("../../../examples/site-plan-hillside-steep.loam.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as unknown;
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-siteplan-steep-"));
    scratch.push(root);
    const compiled = await compileTerrain(doc, { outDir: path.join(root, "hillside_town_steep") });
    if (!compiled.ok) throw new Error("steep fixture compile failed");
    const report = compiled.report as unknown as {
      layout: { districts: (typeof district)[] };
      stats: { structures: { districtBuildings: number } };
      diagnostics: readonly { name: string; message: string }[];
    };
    worldDir = path.join(root, "hillside_town_steep");
    const structures = (
      compiled.report as unknown as {
        layout?: {
          structures?: { buildings?: unknown[]; roads?: { routes?: unknown[] }; props?: unknown[] };
        };
      }
    ).layout?.structures;
    lintInput = {
      buildings: structures?.buildings ?? [],
      roads: structures?.roads?.routes ?? [],
      props: structures?.props ?? [],
    };
    district = report.layout.districts[0] as typeof district;
    buildings = report.stats.structures.districtBuildings;
    sweep = report.diagnostics.find((d) => d.name === "SWEEP_FEATURES_PLACED")?.message ?? "";
  }, 300_000);

  it("plans a hill town on 1:2.5 ground rather than falling back", () => {
    expect(district.form.requested).toBe("hillside");
    expect(district.form.id).toBe("hillside");
  });

  it("reports zero offPlatform on ground twice as steep — check 3", () => {
    expect(sweep).not.toContain("offPlatform");
  });

  it("measures the composition steep ground produces", () => {
    const b = district.bounds;
    const n = (b.x1 - b.x0 + 1) * (b.z1 - b.z0 + 1);
    expect(n).toBe(STEEP.quarterColumns);
    let street = 0;
    let natural = 0;
    for (let k = 0; k < n; k++) {
      const paved = district.carriageway[String(k)] === 1 || district.sidewalk[String(k)] === 1;
      if (paved) street++;
      else if ((district.levels?.index[String(k)] ?? -1) === NO_PLATFORM) natural++;
    }
    expect(buildings).toBe(STEEP.districtBuildings);
    expect(district.stats["dwellings"]).toBe(STEEP.dwellings);
    expect(district.stats["lots"]).toBe(STEEP.lots);
    expect(district.stats["infill"]).toBe(STEEP.infill);
    expect(district.stats["terraceBays"]).toBe(STEEP.terraceBays);
    expect(district.stats["replanRounds"]).toBe(STEEP.replanRounds);
    expect(natural / n).toBeCloseTo(STEEP.naturalFraction, 3);
    expect(street / n).toBeCloseTo(STEEP.streetFraction, 3);
    expect(natural / n).toBeGreaterThanOrEqual(COMPOSITION_GATES.naturalFraction);
    expect(street / n).toBeLessThanOrEqual(COMPOSITION_GATES.streetFraction);
    const walls = Number(/over (\d+) column\(s\)/.exec(sweep)?.[1] ?? -1);
    expect(walls).toBe(STEEP.wallColumns);
    expect(walls).toBeLessThan(600);
  });

  it("lints zero on all 26 physics rules", async () => {
    const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const report = await lintWorldPhysics(worldDir, stack, {
      buildings: lintInput.buildings as never,
      roads: lintInput.roads as never,
      props: lintInput.props as never,
    });
    expect(report.examined).toBeGreaterThan(1_000_000);
    expect(
      report.findings
        .slice(0, 12)
        .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
        .join("\n"),
    ).toBe("");
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  }, 600_000);
});
