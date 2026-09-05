/**
 * `params.decay` on a `building.grammar@0` node — RUINS-PLAN-v0 §4.3, §9 (WP-2).
 *
 * The one authoring surface for ruining a **named** building: a broken
 * watchtower on a ridge, without a district and without a second grammar. A
 * district says the same thing at scale with `intent.decline`, and a landmark
 * declared as a child is deliberately never ruined by that roll — which is
 * exactly why this key has to exist and has to be legible.
 *
 * `LOAM-T227 DECAY_PARAM` is an error rather than a clamp-and-carry-on: a
 * document that says `"decay": 80` meant `0.8`, and an author would far rather
 * be told the range than handed an intact building.
 */

import { describe, expect, it } from "vitest";

import { validateSettlementDocument } from "../src/ir.js";

function doc(params: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "ruin_test", worldSeed: 42 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "watchtower",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [9, 14, 9] },
          params
        }
      ]
    }
  };
}

function diags(params: Record<string, unknown>): { name: string; code: string }[] {
  return validateSettlementDocument(doc(params)).diagnostics.map((d) => ({
    name: d.name,
    code: d.code
  }));
}

describe("params.decay (LOAM-T227)", () => {
  it("accepts the dial's whole range", () => {
    for (const decay of [0, 0.35, 0.5, 0.85, 1]) {
      expect(diags({ decay }), `decay=${decay}`).toEqual([]);
    }
  });

  it("is a key the validator knows — not an unknown param", () => {
    expect(diags({ decay: 0.8 }).map((d) => d.name)).not.toContain("UNKNOWN_PARAM");
  });

  it("refuses a value outside 0..1, and names the code", () => {
    for (const decay of [-0.1, 1.5, 80]) {
      const found = diags({ decay });
      expect(found.map((d) => d.name), `decay=${decay}`).toContain("DECAY_PARAM");
      expect(found.find((d) => d.name === "DECAY_PARAM")?.code).toBe("LOAM-T227");
    }
  });

  it("refuses a non-number", () => {
    for (const decay of ["0.8", true, null, { intensity: 0.8 }]) {
      expect(diags({ decay }).map((d) => d.name), JSON.stringify(decay)).toContain("DECAY_PARAM");
    }
  });

  it("leaves a document that never mentions decay alone", () => {
    expect(diags({})).toEqual([]);
  });
});
