/**
 * F32 (Stocktake Run, unit 43): frozen water. The fixture is probe pass 5's
 * viking document as the model wrote it — `intent.climate.snow: "always"`, a
 * fjord, a town that could not seat on it. Every water column's surface is
 * ice and `LOAM-I527 FROZEN_WATER` counts them; without the policy the water
 * stays water and the note is absent. The `ICE_ON_FROZEN_WATER` switch was
 * deleted with its dead off-path by the Deslop Run (unit 23); the freeze is
 * unconditional now.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { countFrozenColumns } from "../src/terrain/columns.js";
import { compileTerrain } from "../src/terrain/compile.js";

const FIXTURE = "./fixtures/frozen-fjord.loam.json";

async function fixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(fileURLToPath(new URL(FIXTURE, import.meta.url)), "utf8"));
}

describe("frozen water (F32)", () => {
  it("snow always: every water column's surface is ice, and LOAM-I527 counts them", async () => {
    const doc = await fixture();
    const root = await mkdtemp(path.join(tmpdir(), "frozen-water-"));
    try {
      const c = await compileTerrain(doc, { outDir: path.join(root, "w") });
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      const note = c.report.diagnostics.find((d) => d.name === "FROZEN_WATER");
      {
        expect(note).toBeDefined();
        const m = /(\d+) columns? of water carry ice/.exec(note?.message ?? "");
        expect(m).not.toBeNull();
        expect(Number(m?.[1])).toBeGreaterThan(1000);
        expect(c.report.stats.landFraction).toBeLessThan(1);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 300_000);

  it("without the policy the water stays water and no note is raised", async () => {
    const doc = await fixture();
    const intent = doc.intent as { climate?: { snow?: string } };
    if (intent.climate !== undefined) delete intent.climate.snow;
    const root = await mkdtemp(path.join(tmpdir(), "frozen-water-off-"));
    try {
      const c = await compileTerrain(doc, { outDir: path.join(root, "w") });
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      expect(c.report.diagnostics.find((d) => d.name === "FROZEN_WATER")).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 300_000);

  it("countFrozenColumns is zero on a plan with no freeze rule", () => {
    expect(
      countFrozenColumns({
        fluidKind: new Uint8Array([1, 1]),
        fluidTop: new Int32Array([70, 70]),
        ground: new Int32Array([60, 60])
      } as unknown as Parameters<typeof countFrozenColumns>[0]),
    ).toBe(0);
  });
});
