/**
 * **P2's postcard, compiled.** — `docs/INFRA-ENTRIES-v0.md` W1.
 *
 * `infra-entry.test.ts` tests the host at its seams: a route is geometry, a
 * crossing is a set of indices, a claim is a level in a plan. This file asks
 * the one question those cannot — *can the four entries be reached from a
 * document at all?* — by compiling one world with all four in it and looking at
 * what came out.
 *
 * It is the reachability half of the wave, and it earns its compile twice over:
 * the last two defects W1 found were both invisible to a unit test. `across`
 * bound only to `road.network@0`'s arriving lanes, which a world whose roads
 * are internal simply has none of, so a barricade could not be authored at all;
 * and a cordon hulled off a farm's *buildings* rings the barn and leaves the
 * crop outside. Both are one line of wiring in `structures/index.ts` and
 * neither would ever have shown up in a fixture.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";

/**
 * A small farm town being invaded: a town, a holding beside it, and the four
 * entries — the cordon rings the fields, the figure is pressed into them, the
 * barricade goes across the town's own high street and the furrow comes down
 * into the town.
 */
const POSTCARD = {
  loam: "0.1",
  profile: "settlement",
  meta: { name: "cordon_dale", worldSeed: 90210 },
  root: {
    id: "world",
    kind: "composite",
    envelope: { shape: "region", size: [320, 320] },
    children: [
      {
        id: "terrain",
        kind: "generator",
        generator: "terrain.heightfield@0",
        params: { amplitude: 16, seaLevel: 62, baseHeight: 72, erosionPasses: 2 },
      },
      {
        id: "climate",
        kind: "generator",
        generator: "terrain.climate@0",
        params: { forceTheme: "temperate" },
      },
      {
        id: "town",
        kind: "district",
        envelope: { shape: "region", size: [96, 96] },
        constraints: [{ zone: "west" }],
        params: {
          fabric: "grown",
          density: "medium",
          mix: ["cottage", "farmhouse", "tavern", "chapel"],
        },
      },
      {
        id: "north_holding",
        kind: "generator",
        generator: "precinct.farm@0",
        envelope: { shape: "region", size: [96, 96] },
        constraints: [{ zone: "east" }],
        params: { parcels: 6, parcelSize: 18 },
      },
      {
        id: "cordon",
        kind: "generator",
        generator: "infra.entry@0",
        params: { entry: "quarantine_fence", route: { ring: "north_holding", margin: 10 } },
      },
      {
        id: "figure",
        kind: "generator",
        generator: "infra.entry@0",
        params: { entry: "crop_circle", route: { over: "north_holding" } },
      },
      {
        id: "barricade",
        kind: "generator",
        generator: "infra.entry@0",
        params: { entry: "barricade_line", route: { across: "town" } },
      },
      {
        id: "impact_scar",
        kind: "generator",
        generator: "infra.entry@0",
        params: { entry: "crash_furrow", route: { into: "town", run: 48 } },
      },
    ],
  },
} as const;

let root: string;
let stack: PrismarineStack;
let report: PhysicsReport;
let compiled: TerrainCompileReport;
let stats: Record<string, number>;

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-infra-postcard-"));
  const dir = path.join(root, "cordon_dale");
  const result = await compileTerrain(POSTCARD as unknown as Record<string, unknown>, {
    outDir: dir,
  });
  if (!result.ok) throw new Error(result.diagnostics.map((d) => d.code).join(", "));
  compiled = result.report;
  const layout = (compiled as unknown as {
    layout?: {
      structures?: {
        stats?: Record<string, number>;
        buildings?: unknown[];
        roads?: { routes?: unknown[] };
        props?: unknown[];
      };
    };
  }).layout;
  stats = layout?.structures?.stats ?? {};
  report = await lintWorldPhysics(dir, stack, {
    buildings: (layout?.structures?.buildings ?? []) as never,
    roads: (layout?.structures?.roads?.routes ?? []) as never,
    props: (layout?.structures?.props ?? []) as never,
  });
}, 600_000);

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

describe("P2's postcard", () => {
  it("builds three of four entries, and says out loud why the fourth is not", () => {
    // Four nodes: nothing may be *silently* dropped, which is the failure this
    // file exists to catch. A route that cannot be anchored is a `LOAM-T233` and
    // an entry that is never built is not.
    //
    // **Re-pinned at the GROUND_V1_FREEZE flip — a named debt, not a re-pin of
    // taste.** `world.figure` is a `crop_circle` routed `over: north_holding`.
    // Its class declares ground, so under §1.6 it is sited in the declaring half
    // at its own tier; the farm's parcels are packed at **tier D**, and the
    // layout view's `maskOf` is answered from `ParcelDatum`, which is therefore
    // still empty when the figure asks. `structures/index.ts` says this in the
    // `parcelDatum` docstring and calls the outcome "the honest report until
    // `packHolding` itself moves up to pass 4" — so the assertion is that the
    // compiler says it, by node path and by code, and that the other three are
    // whole. **The remainder is named: §6a.5's `packHolding` → pass 4, not this
    // round's work.** When it lands this goes back to four with no T233 at all.
    expect(stats["infraEntries"]).toBe(3);
    expect(stats["infraEntryColumns"]).toBeGreaterThan(500);
    const unanchored = compiled.diagnostics.filter((d) => d.code === "LOAM-T233");
    expect(unanchored.map((d) => d.nodePath)).toEqual(["world.figure"]);
    expect(`${unanchored[0]?.message}`).toContain("publishes no column mask");
    for (const code of compiled.diagnostics.map((d) => d.code)) {
      expect(["LOAM-T231", "LOAM-T232"]).not.toContain(code);
    }
  });

  it("leaves the barricade exactly one way through", () => {
    // The barricade is the only entry here that finds a crossing (the cordon's
    // ring meets no carriageway in this world), so the whole opening count is
    // its one deliberate gap.
    expect(stats["infraEntryOpenings"]).toBe(1);
  });

  it("seats the cordon's masts and markers", () => {
    expect(stats["infraEntryFittings"]).toBeGreaterThan(20);
  });

  it("puts the furrow's and the figure's levels through the ground contract", () => {
    // The two declaring entries: a disc of flattened field and a trench. Both
    // are ground, not blocks stacked on it.
    expect(stats["infraEntryDeclared"]).toBeGreaterThan(200);
  });

  it("lints zero on every physics rule", () => {
    const summary = report.findings
      .slice(0, 12)
      .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
      .join("\n");
    expect(summary).toBe("");
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  });
});
