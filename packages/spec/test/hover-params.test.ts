/**
 * `params.hover` — the one placement knob an `authored:<id>` landmark carries.
 *
 * The claims:
 *
 * 1. An integer 8..256 on a landmark node validates clean, in both profiles.
 * 2. Anything else — a float, a string, 4, 400 — is a precise error, not a
 *    silently ignored key.
 * 3. `hover` is landmark-only: `scatter.program@0` rejects it as an unknown
 *    key, so nobody can float a scatter by accident.
 * 4. `hoverOf` is the blessed reader and agrees with the validator.
 */

import { describe, expect, it } from "vitest";

import { hoverOf, validateSettlementDocument, validateTerrainDocument } from "../src/index.js";

const REQUEST = {
  id: "mothership",
  mode: "landmark",
  brief: "a city-sized hull hanging over the town",
  envelope: [64, 24, 64],
};

function settlement(node: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "hollow_dale", worldSeed: 42 },
    intent: { era: "modern", character: { programs: [REQUEST] } },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        node,
      ],
    },
  };
}

function terrain(node: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "hollow_moor", worldSeed: 42 },
    intent: { era: "modern", character: { programs: [REQUEST] } },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        node,
      ],
    },
  };
}

function landmark(params: unknown): Record<string, unknown> {
  return {
    id: "the_ship",
    kind: "generator",
    generator: "authored:mothership",
    constraints: [{ zone: "center" }],
    ...(params === undefined ? {} : { params }),
  };
}

function errors(doc: unknown, profile: "settlement" | "terrain" = "settlement"): string[] {
  const result =
    profile === "settlement" ? validateSettlementDocument(doc) : validateTerrainDocument(doc);
  return result.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.name}@${d.nodePath}`);
}

describe("params.hover on an authored landmark", () => {
  it("accepts an integer inside 8..256", () => {
    for (const hover of [8, 48, 256]) {
      expect(errors(settlement(landmark({ hover })))).toEqual([]);
      expect(errors(terrain(landmark({ hover })), "terrain")).toEqual([]);
    }
  });

  it("still accepts a landmark node with no params at all", () => {
    expect(errors(settlement(landmark(undefined)))).toEqual([]);
  });

  it("rejects a hover below the ground-clutter floor", () => {
    const out = validateSettlementDocument(settlement(landmark({ hover: 4 })));
    const bad = out.diagnostics.find((d) => d.name === "PARAM_OUT_OF_RANGE");
    expect(bad?.nodePath).toBe("world.the_ship.params.hover");
    expect(bad?.severity).toBe("error");
    expect(bad?.message).toContain("8..256");
  });

  it("rejects a hover above the ceiling, a float, and a non-number", () => {
    for (const hover of [400, 12.5, "48", null]) {
      expect(errors(settlement(landmark({ hover })))).toEqual(["PARAM_OUT_OF_RANGE@world.the_ship.params.hover"]);
    }
  });

  it("rejects an unknown key beside hover", () => {
    expect(errors(settlement(landmark({ hover: 48, drift: 3 })))).toEqual([
      "UNKNOWN_KEY@world.the_ship.params",
    ]);
  });

  it("rejects hover on a scatter.program@0 node — floating is landmark-only", () => {
    const scatter = {
      id: "pods",
      kind: "generator",
      generator: "scatter.program@0",
      params: { program: "mothership", count: 3, area: { all: true }, hover: 48 },
    };
    const codes = errors(settlement(scatter));
    expect(codes).toContain("UNKNOWN_KEY@world.pods.params");
  });
});

describe("hoverOf — the blessed reader", () => {
  it("reads a valid hover and refuses everything the validator would", () => {
    expect(hoverOf({ params: { hover: 48 } })).toBe(48);
    expect(hoverOf({ params: { hover: 8 } })).toBe(8);
    expect(hoverOf({ params: { hover: 256 } })).toBe(256);
    for (const bad of [7, 257, 12.5, "48", null, undefined]) {
      expect(hoverOf({ params: { hover: bad } })).toBeUndefined();
    }
    expect(hoverOf({ params: {} })).toBeUndefined();
    expect(hoverOf({})).toBeUndefined();
    expect(hoverOf(null)).toBeUndefined();
    expect(hoverOf("nope")).toBeUndefined();
  });
});
