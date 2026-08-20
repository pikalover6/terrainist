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
