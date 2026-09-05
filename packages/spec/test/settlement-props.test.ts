/**
 * `prop.place@0` in the settlement profile's validator.
 *
 * The one thing these tests are really about is the *fix hint*. An author who
 * writes `"prop": "canoe"` has made a spelling mistake, and the difference
 * between a validator that says "unknown prop" and one that says "unknown
 * prop; here are the nine you may have meant" is the difference between an
 * author who fixes it and one who gives up — and the LLM authoring these
 * documents is exactly such an author.
 */

import { describe, expect, it } from "vitest";

import { SETTLEMENT_PROP_NAMES, validateSettlementDocument } from "../src/ir.js";

function doc(extras: unknown[] = []): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "hollow_dale", worldSeed: 42 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        ...extras
      ]
    }
  };
}

function prop(params: Record<string, unknown>, patch: Record<string, unknown> = {}): unknown {
  return { id: "dock_boat", kind: "generator", generator: "prop.place@0", params, ...patch };
}

function names(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.name);
}

describe("prop.place@0 — validation", () => {
  it("accepts a prop node with only a prop name", () => {
    const result = validateSettlementDocument(doc([prop({ prop: "rowboat" })]));
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("accepts every prop in the catalog", () => {
    for (const name of SETTLEMENT_PROP_NAMES) {
      expect(validateSettlementDocument(doc([prop({ prop: name })])).diagnostics).toEqual([]);
    }
  });

  it("accepts the coarse placement vocabulary and per-prop geometry", () => {
    const result = validateSettlementDocument(
      doc([
        prop({ prop: "pier", zone: "north", length: 12, width: 3 }),
        prop({ prop: "rowboat", at: "pier", yaw: 90 }, { id: "moored" }),
        prop({ prop: "rail_line", length: 20, curve: true, grade: 2, platform: false }, { id: "halt" })
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects an unknown prop name and lists every valid one", () => {
    const result = validateSettlementDocument(doc([prop({ prop: "canoe" })]));
    const bad = result.diagnostics.find((d) => d.name === "STRUCTURE_PARAM");
    expect(bad).toBeDefined();
    expect(bad?.message).toContain("canoe");
    for (const name of SETTLEMENT_PROP_NAMES) expect(bad?.fix).toContain(name);
    expect(result.document).toBeUndefined();
  });

  it("rejects a prop node with no prop param", () => {
    const result = validateSettlementDocument(doc([prop({})]));
    const bad = result.diagnostics.find((d) => d.name === "STRUCTURE_PARAM");
    expect(bad?.fix).toContain("rowboat");
  });

  it("rejects params outside the generator's vocabulary", () => {
    expect(names(doc([prop({ prop: "cart", colour: "red" })]))).toContain("UNKNOWN_KEY");
    expect(names(doc([prop({ prop: "rail_line", grade: 9 })]))).toContain("PARAM_OUT_OF_RANGE");
    expect(names(doc([prop({ prop: "cart", yaw: 45 })]))).toContain("STRUCTURE_PARAM");
    expect(names(doc([prop({ prop: "cart", zone: "up" })]))).toContain("BAD_ENUM");
    expect(names(doc([prop({ prop: "rowboat", on: "lava" })]))).toContain("STRUCTURE_PARAM");
    expect(names(doc([prop({ prop: "rowboat", at: 12 })]))).toContain("STRUCTURE_PARAM");
  });

  it("rejects children on a prop node", () => {
    const result = validateSettlementDocument(
      doc([prop({ prop: "gazebo" }, { children: [{ id: "x", kind: "primitive" }] })]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("STRUCTURE_NODE_SHAPE");
  });

  it("names prop.place@0 in the not-in-profile fix hint", () => {
    const result = validateSettlementDocument(
      doc([{ id: "caves", kind: "generator", generator: "cave.carver@0", params: {} }]),
    );
    expect(result.diagnostics[0]?.fix).toContain("prop.place@0");
  });
});
