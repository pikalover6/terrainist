/**
 * The walled guard sees the planned path, and a dissolved strip says so.
 *
 * `LOAM-W527 WALLED_QUARTER_SPARSE` was gated `planned === undefined` and so
 * never fired on a `hillside` quarter — the form every walled hill town gets —
 * while montfort_hill_k1 shipped a keep and a handful of houses inside a full
 * circuit. specified one `SITE_STRIP_DISSOLVED`
 * note per strip given back to natural ground, which the planner never wrote.
 * Both landed in the Stocktake Run (2026-08-25); this pins them on the walked
 * document. Diagnostics only: the world is payload-identical either way.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileTerrain } from "../src/terrain/compile.js";
import type { TerrainCompileReport } from "../src/index.js";

const DOC = fileURLToPath(
  new URL("fixtures/examples/montfort_hill.loam.json", import.meta.url),
);

let report: TerrainCompileReport;

describe("a walled hill town answers for its coverage", () => {
  it(
    "compiles montfort_hill_k1",
    async () => {
      const doc = JSON.parse(await readFile(DOC, "utf8")) as unknown;
      const root = await mkdtemp(path.join(tmpdir(), "terrainist-walled-planned-"));
      try {
        const result = await compileTerrain(doc, { outDir: path.join(root, "montfort") });
        expect(result.ok).toBe(true);
        if (result.ok) report = result.report;
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it("fires WALLED_QUARTER_SPARSE on the planned path, against the land inside the streets", () => {
    const sparse = report.diagnostics.filter((d) => d.code === "LOAM-W527");
    expect(sparse.length).toBeGreaterThanOrEqual(1);
    expect(sparse[0]?.message).toMatch(/column\(s\) of land inside the streets/);
  });

  it("names every strip the site plan dissolved, with its measurement and its cost", () => {
    const notes = report.diagnostics.filter((d) => d.code === "LOAM-I499");
    expect(notes.length).toBeGreaterThanOrEqual(1);
    for (const n of notes) {
      expect(n.message).toMatch(/held \d+ usable station\(s\) against the \d+ two lots need/);
      expect(n.message).toMatch(/gave \d+ column\(s\) of claimed terrace back/);
    }
  });
});
