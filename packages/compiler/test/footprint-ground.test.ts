/**
 * The slop census's class-3 D3 (Stocktake unit 24): `foundationY` vs the
 * frozen ground. #18 (`placements[].foundationY`) never re-reads #17 (the
 * resolve), and nothing asserted the two agree. Probed on the thirteen
 * anchors and fixtures (`scratchpad/d3/probe.mjs`): every declared
 * `building.footprint` column is satisfied — adjusted 0, refused 0 — on
 * every document; the only footprints whose ground differs from their
 * foundation are not pads (quays, precinct regions, a citadel's whole
 * region). This pins that on one fixture through the resolver's own report,
 * and pins that the note which would say otherwise (`LOAM-I501
 * FOOTPRINT_GROUND_LOST`) stays silent.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileTerrain } from "../src/terrain/compile.js";

describe("a building's footprint gets the ground it declared", () => {
  it("hillside-village: every footprint column satisfied, none adjusted or refused, no LOAM-I501", async () => {
    const doc = JSON.parse(
      await readFile(fileURLToPath(new URL("fixtures/examples/hillside-village.loam.json", import.meta.url)), "utf8"),
    );
    const root = await mkdtemp(path.join(tmpdir(), "footprint-ground-"));
    try {
      const c = await compileTerrain(doc, { outDir: path.join(root, "w") });
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      const rows = c.report.stats.ground?.claims.filter((r) => r.sourceClass === "building.footprint") ?? [];
      expect(rows.length).toBeGreaterThan(0);
      const sum = (k: "declared" | "satisfied" | "adjusted" | "refused"): number => rows.reduce((n, r) => n + r[k], 0);
      expect(sum("declared")).toBeGreaterThan(1000);
      expect(sum("satisfied")).toBe(sum("declared"));
      expect(sum("adjusted")).toBe(0);
      expect(sum("refused")).toBe(0);
      expect(c.report.diagnostics.filter((d) => d.name === "FOOTPRINT_GROUND_LOST")).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stats.ground is on the product path: the frozen resolve's report ships on every settlement compile", async () => {
    const doc = JSON.parse(
      await readFile(fileURLToPath(new URL("fixtures/examples/hillside-village.loam.json", import.meta.url)), "utf8"),
    );
    const root = await mkdtemp(path.join(tmpdir(), "stats-ground-"));
    try {
      const c = await compileTerrain(doc, { outDir: path.join(root, "w") });
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      const ground = c.report.stats.ground;
      expect(ground).toBeDefined();
      if (ground === undefined) return;
      expect(ground.columns).toBe(c.report.stats.columns);
      expect(ground.claims.length).toBeGreaterThan(0);
      expect(ground.claims.some((r) => r.sourceClass === "building.footprint" && r.declared > 0)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
