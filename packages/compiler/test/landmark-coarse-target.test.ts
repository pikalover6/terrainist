/**
 * Where a bespoke landmark stands when the document said where.
 *
 * The walked defect (Gemini P1 regen, 2026-08-15): a colossus authored
 * `"constraints": [{ "at": [0.62, 0.38] }, { "facing": "pirate_haven" }]` —
 * the fractions of a bluff the same document raised for it — was built 316
 * blocks away, 59 from the *other* island's centre, with nothing in the compile
 * log about either constraint. Two separate faults, one placement:
 *
 * 1. Every candidate on the bluff was `too_steep`, the veto a **building** is
 *    measured by, so the cheapest feasible candidate was the flattest ground in
 *    the region — and a soft coarse cost of 1.6 was the only trace.
 * 2. A `facing` constraint cannot turn a landmark (its yaw comes from
 *    `params.face`, decided before its box is reserved), so the only way for
 *    the solver to reduce that cost was to *move* it, which it did, silently.
 *
 * The claims:
 *
 * 1. A landmark carrying `{ "at": [fx, fz] }` seats in its at-neighbourhood
 *    even when the ground there is steep, and says so (`LOAM-W520`).
 * 2. A junk/facing entry in a landmark's `constraints` draws `LOAM-W519`
 *    naming the key and pointing at `params.face` — and is never fatal.
 * 3. The terrain profile, which has no solver at all, reads the same hint.
 * 4. Reach: a landmark with no coarse constraint is placed exactly where it
 *    always was — the region's centre, then the ordinary scatter walk.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion, nodeSeed } from "@terrainist/stdlib";
import type { AuthoredProgramRecord } from "@terrainist/spec";
import { validateSettlementDocument, validateTerrainDocument } from "@terrainist/spec";

import { gateDoubleRun, planLandmarkSite, sourceHashOf } from "../src/programs/index.js";
import { coarseHintArea } from "../src/programs/place.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { compileTerrain } from "../src/terrain/compile.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = loadPrismarine("1.21.11");
const region = centeredRegion(192, 192);
const plan = devColumnPlan(region, stack);

function record(id: string): AuthoredProgramRecord {
  const source = readFileSync(path.join(here, "fixtures", "programs", "tower.js"), "utf8");
  const draft: AuthoredProgramRecord = {
    mode: "landmark",
    envelope: [17, 34, 17],
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
  return { ...draft, outputHash: gateDoubleRun(id, draft, 0n).outputHash };
}

/** The point `[fx, fz]` names in a 256×256 region centred on the origin. */
const AT: readonly [number, number] = [0.7, 0.3];
const SIZE = 256;

function pointOf(size: number, [fx, fz]: readonly [number, number]): { x: number; z: number } {
  const x0 = -Math.floor(size / 2);
  return { x: x0 + Math.round(fx * (size - 1)), z: x0 + Math.round(fz * (size - 1)) };
}

/**
 * A document with one steep hill and one landmark pointed at it — the shape of
 * the walked failure, at test scale.
 */
function document(constraints: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "colossus_bluff", worldSeed: 4242 },
    programs: { tower: record("tower") },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [SIZE, SIZE] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 6, seaLevel: 63, baseHeight: 78, erosionPasses: 1 },
          children: [
            {
              id: "bluff",
              kind: "generator",
              generator: "terrain.edit@0",
              params: { verb: "peak", at: AT, radius: 34, height: 30, profile: "rounded" },
            },
          ],
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "colossus",
          kind: "generator",
          generator: "authored:tower",
          constraints,
          tags: ["landmark"],
        },
      ],
    },
  };
}

describe("a landmark's coarse `at` target", () => {
  it("is validated, warned about, and never fatal", () => {
    const result = validateSettlementDocument(
      document([{ at: AT }, { facing: "nothing_in_particular" }]),
    );
    const w519 = result.diagnostics.filter((d) => d.code === "LOAM-W519");
    expect(w519).toHaveLength(1);
    expect(w519[0]?.name).toBe("LANDMARK_CONSTRAINT_IGNORED");
    expect(w519[0]?.nodePath).toBe("world.colossus.constraints[1]");
    expect(w519[0]?.message).toContain("facing");
    expect(w519[0]?.fix).toContain('"face"');
    expect(w519[0]?.fix).toContain("nothing_in_particular");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("seats the landmark on the bluff it names, and says the ground was steep", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-colossus-"));
    try {
      const result = await compileTerrain(document([{ at: AT }, { facing: "world" }]), {
        outDir: path.join(dir, "colossus_bluff"),
      });
      expect(result.ok).toBe(true);
      const report = result.report;
      expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

      const placement = (report.layout?.placements ?? []).find(
        (p) => p.nodePath === "world.colossus",
      );
      expect(placement).toBeDefined();
      const target = pointOf(SIZE, AT);
      const anchor = placement?.anchor as { x: number; z: number };
      // Inside the at-neighbourhood: the solver's zero-cost disc is 5% of the
      // region's half-diagonal, and the footprint may hang half its width past
      // the target's column.
      const tolerance = 0.05 * 0.5 * Math.sqrt(2) * SIZE + 17;
      expect(Math.abs(anchor.x - target.x)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(anchor.z - target.z)).toBeLessThanOrEqual(tolerance);

      // …and the two diagnostics that make the placement legible.
      const node = (report.layout?.report.nodes ?? []).find(
        (n) => n.nodePath === "world.colossus",
      );
      expect(node?.appliedRungs).toContain("landmark_coarse_seat");
      expect(report.diagnostics.some((d) => d.code === "LOAM-W520")).toBe(true);
      expect(report.diagnostics.some((d) => d.code === "LOAM-W519")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 300_000);
});

describe("the terrain profile, which has no solver", () => {
  const hinted = { constraints: [{ at: [0.75, 0.25] as const }] };

  it("steers the landmark's ground search with the hint", () => {
    const hint = coarseHintArea(hinted, region);
    expect(hint).toBeDefined();
    const site = planLandmarkSite({ envelope: [17, 34, 17], plan, seed: nodeSeed(4242n, "world.monument", ""), hint });
    expect(site).toBeDefined();
    const target = {
      x: region.x0 + Math.round(0.75 * (region.width - 1)),
      z: region.z0 + Math.round(0.25 * (region.depth - 1)),
    };
    const cx = ((site?.footprint.x0 as number) + (site?.footprint.x1 as number)) / 2;
    const cz = ((site?.footprint.z0 as number) + (site?.footprint.z1 as number)) / 2;
    const radius = 0.05 * 0.5 * Math.sqrt(2) * region.width + 17;
    expect(Math.abs(cx - target.x)).toBeLessThanOrEqual(radius);
    expect(Math.abs(cz - target.z)).toBeLessThanOrEqual(radius);
  });

  it("names what it cannot act on, and reads `at` as fractions", () => {
    const doc = {
      loam: "0.1",
      profile: "terrain",
      meta: { name: "monument_field", worldSeed: 7 },
      programs: { tower: record("tower") },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [192, 192] },
        children: [
          {
            id: "terrain",
            kind: "generator",
            generator: "terrain.heightfield@0",
            params: { amplitude: 6, seaLevel: 63, baseHeight: 78, erosionPasses: 1 },
          },
          {
            id: "climate",
            kind: "generator",
            generator: "terrain.climate@0",
            params: { forceTheme: "temperate" },
          },
          {
            id: "monument",
            kind: "generator",
            generator: "authored:tower",
            constraints: [
              { at: [0.75, 0.25] },
              { facing: "terrain" },
              { distance: { to: "terrain", max: 10 } },
              { at: "somewhere nice" },
            ],
          },
        ],
      },
    };
    const result = validateTerrainDocument(doc);
    const warned = result.diagnostics.filter((d) => d.code === "LOAM-W519");
    // The `at` that reads as fractions is the only entry with nothing to say.
    expect(warned.map((d) => d.nodePath)).toEqual([
      "world.monument.constraints[1]",
      "world.monument.constraints[2]",
      "world.monument.constraints[3]",
    ]);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("reach: a landmark that says nothing about where it goes", () => {
  it("is centred on the region, exactly as before the hint existed", () => {
    const withoutHint = planLandmarkSite({ envelope: [17, 34, 17], plan, seed: nodeSeed(4242n, "world.monument", "") });
    const centred = planLandmarkSite({
      envelope: [17, 34, 17],
      plan,
      seed: nodeSeed(4242n, "world.monument", ""),
      hint: { all: true },
    });
    expect(coarseHintArea({ constraints: [{ zone: "not_a_zone" }] }, region)).toBeUndefined();
    expect(coarseHintArea({}, region)).toBeUndefined();
    const cx = region.x0 + Math.floor((region.width - 17) / 2);
    expect(withoutHint?.footprint.x0).toBe(cx);
    expect(centred?.footprint.x0).toBe(cx);
  });
});
