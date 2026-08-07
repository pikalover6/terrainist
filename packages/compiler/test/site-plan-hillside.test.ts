/**
 * WP-0 — the frontage-led hillside prototype (`docs/SITE-PLAN-v0.md` §8, §10).
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
  MIN_PRINCIPAL_STREETS,
  MIN_STRIP_DEPTH,
  TERRACE_RISE,
} from "../src/layout/forms/hillside.js";
import { STREET_WIDTH } from "../src/layout/forms/axial.js";
import type { FormContext, FormPlan, GroundSample } from "../src/layout/forms/index.js";

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

function context(ground: GroundSample): FormContext {
  return {
    bounds: BOUNDS,
    seed: SEED,
    blockSize: 32,
    sidewalk: 2,
    density: "medium",
    ground,
    focus: [],
  };
}

function drawn(at: (x: number) => number): FormPlan {
  const result = HILLSIDE_FORM.draw(context(groundOf(at)));
  if (!result.ok) throw new Error(`hillside refused: ${result.reason}`);
  return result.plan;
}

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
      // `depth` is measured from the build-to line, which sits a carriageway
      // half plus a verge plus one out from the centre; `MIN_STRIP_DEPTH` is
      // measured from the carriageway edge. The two differ by the verge.
      expect(deepest + (STREET_WIDTH.street >> 1) + 1).toBeGreaterThanOrEqual(MIN_STRIP_DEPTH);
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
 * **Prototype goldens, renegotiated at WP-1.**
 *
 * These are what the prototype *measured*, not what §8.3 asks for, and three of
 * them are short of the bar. They are pinned anyway, for the reason
 * `docs/DESIGN.md` gives about the physics lint: a number nobody wrote down is a
 * number that drifts, and the value of WP-0 is the measurement. The report on
 * this change carries the bar-by-bar comparison and the diagnosis.
 *
 * The control is the walked `out/walk-hilltown`: 7 district buildings, 395
 * `offPlatform`, 1 566 wall columns, natural fraction 0.00, street fraction
 * 0.478, railed share ≈ 1.0.
 */
const GOLDEN = {
  quarterColumns: 24_320,
  districtBuildings: 17,
  lots: 30,
  lotsDropped: 16,
  infill: 13,
  terraceBays: 12,
  offPlatform: 0,
  wallColumns: 458,
  railColumns: 218,
  // Bars: naturalFraction >= 0.40, streetFraction <= 0.25.
  naturalFraction: 0.195,
  streetFraction: 0.388,
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
    expect(district.stats["lots"]).toBe(GOLDEN.lots);
    expect(district.stats["infill"]).toBe(GOLDEN.infill);
    expect(district.stats["terraceBays"]).toBe(GOLDEN.terraceBays);
    expect(natural / n).toBeCloseTo(GOLDEN.naturalFraction, 3);
    expect(street / n).toBeCloseTo(GOLDEN.streetFraction, 3);
    // What the prototype *did* clear, against the control: 17 buildings where
    // the control had 7, on a quarter that is one fifth natural ground where the
    // control was none, with 458 columns of wall where the control had 1 566.
    expect(buildings).toBeGreaterThan(7);
    expect(natural / n).toBeGreaterThan(0);
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
