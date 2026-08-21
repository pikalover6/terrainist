/**
 * WP-G1 — the pristine baseline, measured and unused (ground contract v1 §1.2,
 * §6, §8's G1 row).
 *
 * The compiler now snapshots the height field **before the first
 * `applyPadEdits`** and, behind `groundEquivalence`, builds a second
 * `ColumnPlan` from that pristine field with every other `buildColumnPlan`
 * input held identical. Nothing consumes the result: this stage exists to put
 * a number on the single largest unknown in the rewrite — *how far do the
 * layout stage's pads move the ground the plan reports?* — and to prove the
 * audit's inventory of pad writers is complete.
 *
 * Three claims, in order of what they'd catch:
 *
 * 1. **Containment.** Every column whose ground moved lies inside the pad set
 *    (the columns whose *field* value the pads changed). Containment only one
 *    way: a sub-block float edit floors to the same integer ground, so the pad
 *    set is properly larger. A column outside it would be a sixth height
 *    authority the audit did not find, and is a hard failure.
 * 2. **Non-triviality.** A hill village's pads must move *something*. A zero
 *    here would mean the measurement is wired to the wrong field, not that the
 *    world is flat — which is exactly the failure mode a golden of `{}` hides.
 * 3. **The golden itself**, inline and exact, plus determinism across two
 *    compiles of the same document.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileTerrain } from "../src/terrain/compile.js";
import { declarePads } from "../src/layout/ground-declarers.js";
import { solvedCarriagewayMask } from "../src/layout/solved-carriageway.js";
import type { GroundIntent } from "../src/layout/ground-contract.js";
import type { GroundPristineMeasurement } from "../src/layout/ground-equivalence.js";

const scratch: string[] = [];

async function measure(name: string): Promise<GroundPristineMeasurement> {
  const doc = JSON.parse(
    await readFile(fileURLToPath(new URL(`../../../examples/${name}.loam.json`, import.meta.url)), "utf8"),
  ) as Record<string, unknown>;
  const root = await mkdtemp(path.join(tmpdir(), "terrainist-ground-datums-"));
  scratch.push(root);
  const out = await compileTerrain(doc, {
    outDir: path.join(root, name),
    skipEmit: true,
    groundEquivalence: true,
  });
  if (!out.ok) {
    throw new Error(`${name} did not compile: ${out.diagnostics.map((d) => d.name).join(", ")}`);
  }
  const pristine = out.groundEquivalence?.pristine;
  if (pristine === undefined) {
    throw new Error(`${name} compiled without WP-G1's measurement — is \`groundEquivalence\` on?`);
  }
  return pristine;
}

/** Two compiles of `hillside-village`; the second is the determinism witness. */
let first: GroundPristineMeasurement;
let second: GroundPristineMeasurement;
/** The flat control: no pads at all, so nothing may move. */
let hamlet: GroundPristineMeasurement;

beforeAll(async () => {
  first = await measure("hillside-village");
  second = await measure("hillside-village");
  hamlet = await measure("hilltop-crypt-hamlet");
}, 900_000);

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

describe("WP-G1: the pad displacement of the column plan", () => {
  it("moves no column outside the pad set", () => {
    // v1 §6/G1's real deliverable. `outsidePadSet` carries raw column indices,
    // capped at 64, so a failure prints where to look.
    expect(first.outsidePadSet).toEqual([]);
    expect(hamlet.outsidePadSet).toEqual([]);
  });

  it("moves something on a hill village", () => {
    // Guards the measurement, not the world: if this is 0 the second plan is
    // being built from the padded field and the whole stage measures nothing.
    expect(first.diffCount).toBeGreaterThan(0);
    expect(first.padSetSize).toBeGreaterThan(first.diffCount);
  });

  it("records G1's golden for hillside-village", () => {
    // **G1's golden** — the measured pad displacement, ratified as the number
    // WP-G7 is designed against. 4,029 field columns edited by pads; 438 of
    // them change the plan's integer ground; the rest are sub-block float
    // edits that floor to the same value.
    expect(first.padSetSize).toBe(4029);
    expect(first.diffCount).toBe(438);
    // Signed `plan.ground − pristinePlan.ground` → column count. Overwhelmingly
    // positive and short-tailed: the pads *raise* the hill village's ground, by
    // one to fourteen blocks, with a 17-column cut at −1.
    expect(first.histogram).toEqual({
      1: 80,
      2: 52,
      3: 60,
      4: 42,
      5: 43,
      6: 36,
      7: 34,
      8: 16,
      9: 15,
      10: 11,
      11: 15,
      12: 7,
      13: 8,
      14: 2,
      "-1": 17,
    });
  });

  it("records G1's golden for hilltop-crypt-hamlet — no pads, no motion", () => {
    // The control the byte-identity proof was taken on: this document's layout
    // emits no pad edits at all, so pristine and padded plans coincide.
    expect(hamlet.padSetSize).toBe(0);
    expect(hamlet.diffCount).toBe(0);
    expect(hamlet.histogram).toEqual({});
  });

  it("is deterministic across compiles", () => {
    expect(second.padSetSize).toBe(first.padSetSize);
    expect(second.diffCount).toBe(first.diffCount);
    expect(second.histogram).toEqual(first.histogram);
    // Key order too: the golden above is pinned as written, and a reordering
    // would make it a set comparison rather than a serialisable record.
    expect(Object.keys(second.histogram)).toEqual(Object.keys(first.histogram));
  });
});

/* -------------------------------------------------------------------------- */
/* WP-G3 — the superset property (v1 §1.7, §8's G3 row)                        */
/* -------------------------------------------------------------------------- */

/**
 * > **The superset property is the test** (v0 §13.2a rule 6, verbatim): no
 * > column that ends up `street.network`-owned with `role: "carriageway"` lies
 * > inside a `quarter.plane` claim.
 *
 * The property has two halves and they live in two files, because they are
 * about two different things:
 *
 * 1. **The band is a superset of the finished carriageway.** That is a
 *    statement about `solvedCarriagewayMask` against a *surfaced* street graph,
 *    and `test/linework.test.ts` already holds it exactly — every column of
 *    every `role: "carriageway"` segment `surfaceStreetGraph` produced, checked
 *    against the mask, with "none" rather than "few" as the bar. `quarter.plane`
 *    subtracts the same mask from the same module, so it inherits that half
 *    whole; duplicating it here would be a second rasterizer's worth of the
 *    same argument.
 * 2. **The quarter's plane subtracts the band, on real documents.** That is
 *    what is new at G3 and what is asserted below, on the form skeletons that
 *    cut platforms: the claim set is disjoint from the band, the subtraction
 *    removes only band columns, and — on a document whose quarters actually cut
 *    — it removes some.
 *
 * Run with `subtractCarriageway: true` rather than at the flag's default: the
 * subtraction ships gated with the rank it defends (see `ground-declarers.ts`),
 * and a test of a construction tests the construction, not the default.
 * `corridors: []` makes the mask a *subset* of production's, which makes this
 * the harder assertion of the two.
 */
describe("WP-G3: no carriageway column lies inside a quarter.plane claim", () => {
  const SKELETONS = ["hillside-village", "site-plan-hillside", "site-plan-hillside-steep"] as const;

  /** Every column a `quarter.plane` intent in this set names. */
  const planedColumns = (intents: readonly GroundIntent[]): Set<number> => {
    const out = new Set<number>();
    for (const it of intents) {
      if (it.sourceClass !== "quarter.plane") continue;
      for (const claim of it.columns) out.add(claim.idx);
    }
    return out;
  };

  it.each(SKELETONS)(
    "%s: the quarter's plane claims no column of the solved band",
    async (name) => {
      const doc = JSON.parse(
        await readFile(
          fileURLToPath(new URL(`../../../examples/${name}.loam.json`, import.meta.url)),
          "utf8",
        ),
      ) as Record<string, unknown>;
      const root = await mkdtemp(path.join(tmpdir(), "terrainist-superset-"));
      scratch.push(root);
      const out = await compileTerrain(doc, {
        outDir: path.join(root, name),
        skipEmit: true,
        groundEquivalence: true,
      });
      if (!out.ok) throw new Error(`${name} did not compile`);
      const layout = out.report.layout;
      const ge = out.groundEquivalence;
      if (layout === undefined || ge === undefined) throw new Error(`${name} produced no layout`);

      const region = ge.baseline.region;
      const districts = layout.districts ?? [];
      const cities = layout.cities ?? [];
      const band = solvedCarriagewayMask(region, districts, cities, []);
      const shared = {
        region,
        padEdits: layout.padEdits,
        districts,
        cities,
        corridors: [],
      } as const;

      const planed = planedColumns(declarePads({ ...shared, subtractCarriageway: true }));
      const unsubtracted = planedColumns(declarePads({ ...shared, subtractCarriageway: false }));

      // The property. A single column here is a plane over a lane, which at
      // rank 15 is the lane losing its own surface.
      for (const idx of planed) expect(band[idx]).toBe(0);
      // …and the subtraction removed *only* band columns: a plane that lost a
      // column the band does not name would be the mask reaching past the road.
      for (const idx of unsubtracted) {
        if (!planed.has(idx)) expect(band[idx]).toBe(1);
      }
      expect(planed.size).toBeLessThanOrEqual(unsubtracted.size);

      // A document with no platform runs at all would pass the two loops above
      // vacuously, so say which case this document is rather than letting the
      // distinction go unrecorded. The two site-plan skeletons declare
      // `stepped`/`terraced` quarters and must bite; `hillside-village` is the
      // organic control and may legitimately claim nothing.
      if (name === "hillside-village") expect(unsubtracted.size).toBeGreaterThanOrEqual(0);
      else {
        expect(unsubtracted.size).toBeGreaterThan(0);
        expect(planed.size).toBeLessThan(unsubtracted.size);
      }
    },
    900_000,
  );
});
