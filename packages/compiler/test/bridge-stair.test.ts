/**
 * The compile gate for the bridge kit and the tread law.
 *
 * `profiles.test.ts` proves the geometry against a fixture; this proves that a
 * world which actually *carries* a crossing and a public stair still compiles
 * and still lints **zero on every physics rule** — the only check that can see
 * a slab laid where a player needed a block, or a parapet standing on a deck
 * that is not there.
 *
 * C1's harbourtown is the world with the set pieces in it: the C4 pass runs per
 * city, and this example is the one whose plan closes an axis with a bridge and
 * a hillside stair.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";

const EXAMPLE = fileURLToPath(new URL("fixtures/examples/c1-harbourtown.loam.json", import.meta.url));

let root: string;
let stack: PrismarineStack;
let report: PhysicsReport;
let compiled: TerrainCompileReport;

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-bridge-stair-"));
  const dir = path.join(root, "harbourtown");
  const doc = JSON.parse(await readFile(EXAMPLE, "utf8")) as unknown;
  const result = await compileTerrain(doc, { outDir: dir });
  if (!result.ok) throw new Error("harbourtown compile failed");
  compiled = result.report;
  const structures = (compiled as unknown as {
    layout?: { structures?: { buildings?: unknown[]; roads?: { routes?: unknown[] }; props?: unknown[] } };
  }).layout?.structures;
  report = await lintWorldPhysics(dir, stack, {
    buildings: (structures?.buildings ?? []) as never,
    roads: (structures?.roads?.routes ?? []) as never,
    props: (structures?.props ?? []) as never
  });
}, 600_000);

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

describe("a bridge- and stair-bearing world", () => {
  it("compiles", () => {
    expect(report.examined).toBeGreaterThan(100_000);
  });

  it("lints zero on every physics rule", () => {
    const summary = report.findings
      .slice(0, 12)
      .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
      .join("\n");
    expect(summary).toBe("");
    for (const rule of PHYSICS_RULES) {
      expect(report.counts[rule], rule).toBe(0);
    }
  });
});
