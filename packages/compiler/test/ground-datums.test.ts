/**
 * WP-G3 — the superset property (v1 §1.7).
 *
 * > **The superset property is the test**: no column that ends up
 * > `street.network`-owned with `role: "carriageway"` lies inside a
 * > `quarter.plane` claim.
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
 * subtraction is the construction, and a test of a construction tests the
 * construction, not the default. `corridors: []` makes the mask a *subset* of
 * production's, which makes this the harder assertion of the two.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { compileArtifacts } from "../src/terrain/compile.js";
import { declarePads } from "../src/layout/ground-declarers.js";
import { solvedCarriagewayMask } from "../src/layout/solved-carriageway.js";
import type { GroundIntent } from "../src/layout/ground-contract.js";

const scratch: string[] = [];

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

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
          fileURLToPath(new URL(`fixtures/examples/${name}.loam.json`, import.meta.url)),
          "utf8",
        ),
      ) as Record<string, unknown>;
      const root = await mkdtemp(path.join(tmpdir(), "terrainist-superset-"));
      scratch.push(root);
      const out = await compileArtifacts(doc, {});
      if (!out.ok) throw new Error(`${name} did not compile`);
      const layout = out.report.layout;
      if (layout === undefined) throw new Error(`${name} produced no layout`);

      const region = out.report.stats.region;
      const districts = layout.districts ?? [];
      const cities = layout.cities ?? [];
      const band = solvedCarriagewayMask(region, districts, cities, []);
      const shared = {
        region,
        padEdits: layout.padEdits,
        districts,
        cities,
        corridors: []
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
