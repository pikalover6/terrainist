/**
 * The r22 pirates-versus-unicorns walk defects, pinned.
 *
 * Kai walked `examples/pirates_r22.loam.json` and
 * reported three things: the unicorn set-piece was at the back of the island,
 * the skull landmark was in the wrong place, and a couple of houses stood
 * partially under water. Two of the three are one mechanism and one is another,
 * and this file is the regression for both.
 *
 * 1. **The coarse ring.** Both landmarks declared an `at` that fell
 *    *inside* their own district's envelope, so every candidate drawn from the
 *    coarse zero-cost region was refused by the sibling-overlap veto and the
 *    placement fell through to the uniformly-sampled tail of the pool — 29 dice
 *    rolls over 512², clamped onto the region border by `candidateAt`. The
 *    fort finished at (-243, -34) and the colossus at (242, 210), both on the
 *    map edge, 163 and 110 blocks from the sites the document named. Measured
 *    at the time: moving the `at` did not move either landmark one block. Its
 *    `LANDMARK_COARSE_RING` switch was deleted with its dead off-path by the
 *    Deslop Run (unit 25); `landmarkCoarseRing` always runs now.
 *
 * 2. **A quay shed behind its own shore.** The harbour's warehouse and
 *    boathouse were
 *    seated in a band measured from the single shoreline column that reached
 *    furthest seaward anywhere along the quay, so on a ragged bank they stood
 *    over open water with their floor pinned at `quayTop`. Its
 *    `QUAY_SHED_OWN_SHORE` switch was deleted with its dead off-path by the
 *    Deslop Run (unit 21); each shed measures its own span now.
 *
 * The assertions are deliberately about *properties* — how far the landmark
 * finished from the site its document named, and which waterline a shed's band
 * is measured off — not about exact coordinates, so the file survives an
 * ordinary re-tune. The shipped world's exact bytes, quay included, are pinned
 * separately by `tools/worlds/ground-probe-baselines/pirates.json`.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileArtifacts } from "../src/terrain/compile.js";
import { QUAY_DEPTH, minShoreOver } from "../src/structures/precincts.js";

const DOC = fileURLToPath(
  new URL("fixtures/examples/pirates_r22.loam.json", import.meta.url),
);

/** How far the r22 build put each landmark from the site its document named. */
const R22_AWAY = { "world.skull_rock_fort": 163, "world.alicorn_colossus": 110 } as const;

describe("the r22 pirates walk defects", () => {
  it("keeps both named set-pieces nearer their declared target than r22 did, and off the map edge", async () => {
    const doc = JSON.parse(await readFile(DOC, "utf8")) as unknown;
    const res = await compileArtifacts(doc, {
      allowUnstable: true
    });
    expect(res.ok, "the archived document still compiles").toBe(true);
    if (!res.ok) return;
    const outcome = res.report.layout;
    expect(outcome, "a settlement document has a layout outcome").toBeDefined();
    const nodes = outcome?.report.nodes ?? [];
    const region = res.report.stats.region;

    for (const [nodePath, r22] of Object.entries(R22_AWAY)) {
      const node = nodes.find((n) => n.nodePath === nodePath);
      expect(node, nodePath).toBeDefined();
      const target = node?.coarse?.[0]?.targetPoint;
      expect(target, `${nodePath} declares a coarse target`).toBeDefined();
      const [tx, tz] = target as readonly [number, number];
      const t = node?.translation as readonly [number, number, number];
      const size = node?.size as readonly [number, number, number];
      const ax = t[0] + ((size[0] - 1) >> 1);
      const az = t[2] + ((size[2] - 1) >> 1);
      const away = Math.round(Math.sqrt((ax - tx) ** 2 + (az - tz) ** 2));
      // Nearer than the lottery managed, by a margin no ordinary re-tune erases.
      expect(away, `${nodePath} is ${away} blocks from its target (r22: ${r22})`).toBeLessThan(
        r22 - 20,
      );
      // …and never pinned against the region border, which is what the tail of
      // the candidate pool kept doing.
      expect(t[0], `${nodePath} left the west edge`).toBeGreaterThan(region.x0);
      expect(t[2], `${nodePath} left the north edge`).toBeGreaterThan(region.z0);
      expect(t[0] + size[0], `${nodePath} left the east edge`).toBeLessThan(region.x0 + region.width);
      expect(t[2] + size[2], `${nodePath} left the south edge`).toBeLessThan(
        region.z0 + region.depth,
      );
    }
  }, 180_000);

  it("seats a quay shed behind the most landward waterline it spans", () => {
    // v decreases landward, so a shed spanning a headland (s = 40) and a bay
    // (s = 24) must be seated off the bay, not off the headland — the r22 band
    // used the whole quay's maximum and hung the shed over the bay's water.
    const ragged = Int32Array.from([40, 38, 24, 33, 40]);
    expect(minShoreOver(ragged, 0, 4)).toBe(24);
    expect(minShoreOver(ragged, 3, 4)).toBe(33);
    // A shed's seaward face lands one column inside the quay band on its worst
    // line: `v + 11 === ownShore - QUAY_DEPTH - 1`.
    const v = minShoreOver(ragged, 0, 4) - QUAY_DEPTH - 12;
    expect(v + 11).toBe(24 - QUAY_DEPTH - 1);
    // Lines with no waterline at all are skipped, and a span with none says so.
    expect(minShoreOver(Int32Array.from([-1, -1]), 0, 1)).toBe(-1);
    expect(minShoreOver(Int32Array.from([-1, 30, -1]), 0, 2)).toBe(30);
  });
});
