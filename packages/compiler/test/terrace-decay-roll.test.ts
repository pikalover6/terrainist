/**
 * P6 part two (Stocktake Run, unit 37): terrace runs roll for ruin.
 *
 * The k1 metropolis (`decline 0.92`, ruin share 0.85) lays 132 of its 142
 * lots as 66 party-wall terrace runs; before `TERRACE_DECAY_ROLL` every one
 * stood whole and `LOAM-I512` said so. With the roll on, each run rolls once
 * (its first lot, its block) and a ruined run's job carries `decay`, which
 * the terrace emitter applies bay by bay and reports as `meta.decay`. The
 * test compiles the real document and holds in either state of the switch.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TERRACE_DECAY_ROLL } from "../src/layout/district.js";
import { compileTerrain } from "../src/terrain/compile.js";

const DOC = "../../../docs/decks/overgrown_metropolis_hideout_k1/overgrown_metropolis_hideout.loam.json";

describe("terrace runs roll for ruin (P6 part two)", () => {
  it("k1 metropolis: LOAM-I512 counts the terrace runs, and a ruined run's shell carries its decay report", async () => {
    const doc = JSON.parse(await readFile(fileURLToPath(new URL(DOC, import.meta.url)), "utf8"));
    const root = await mkdtemp(path.join(tmpdir(), "terrace-decay-roll-"));
    try {
      const c = await compileTerrain(doc, { outDir: path.join(root, "w") });
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      const i512 = c.report.diagnostics.find((d) => d.name === "DISTRICT_RUINS");
      expect(i512).toBeDefined();
      if (i512 === undefined) return;
      const buildings = c.report.layout?.structures?.buildings ?? [];
      const terraces = buildings.filter((b) => b.meta.terraceBays !== undefined);
      expect(terraces.length).toBe(66);
      if (TERRACE_DECAY_ROLL) {
        const m = /(\d+) of (\d+) terrace runs \((\d+) lots\) roll into ruined shells, bay by bay/.exec(i512.message);
        expect(m).not.toBeNull();
        if (m === null) return;
        expect(Number(m[2])).toBe(66);
        expect(Number(m[3])).toBe(132);
        // A ruined run decays only when it has an interior to decay into
        // (`hasInterior` in the emitter); the roll's count bounds the reports.
        const ruined = terraces.filter((b) => b.meta.decay !== undefined);
        expect(ruined.length).toBeGreaterThan(0);
        expect(ruined.length).toBeLessThanOrEqual(Number(m[1]));
        expect(ruined.some((b) => (b.meta.decay?.written ?? 0) > 0)).toBe(true);
      } else {
        expect(i512.message).toContain("132 terrace lots in 66 terraces are outside the roll");
        expect(terraces.every((b) => b.meta.decay === undefined)).toBe(true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
