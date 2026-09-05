/**
 * `params.hover` — the placement knob that floats a thing off the ground.
 *
 * The claims:
 *
 * 1. An integer 8..256 on a landmark node validates clean, in both profiles.
 * 2. Anything else — a float, a string, 4, 400 — is a precise error, not a
 *    silently ignored key.
 * 3. `scatter.program@0` takes the same key, with the same range and the same
 *    exclusion against `seat` — a live run lost a field of hovering saucers to
 *    an UNKNOWN_KEY here.
 * 4. `hoverOf` / `hoverOfParams` are the blessed readers and agree with the
 *    validator.
 */

import { describe, expect, it } from "vitest";

import {
  hoverOf,
  hoverOfParams,
  validateSettlementDocument,
  validateTerrainDocument
} from "../src/ir.js";

const REQUEST = {
  id: "mothership",
  mode: "landmark",
  brief: "a city-sized hull hanging over the town",
  envelope: [64, 24, 64]
};

const SCATTER_REQUEST = {
  id: "saucer",
  mode: "plugin",
  brief: "a small disc with a lit underside",
  envelope: [21, 13, 21]
};

function settlement(node: Record<string, unknown>): unknown {
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
        node
      ]
    }
  };
}

function terrain(node: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "hollow_moor", worldSeed: 42 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        node
      ]
    }
  };
}

function landmark(params: unknown): Record<string, unknown> {
  return {
    id: "the_ship",
    kind: "generator",
    generator: "authored:mothership",
    constraints: [{ zone: "center" }],
    params: { brief: "a bespoke thing the world asked for", ...(params === undefined ? {} : (params as object)) }
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

  it("still accepts a landmark node with only its brief", () => {
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
      "UNKNOWN_KEY@world.the_ship.params"
    ]);
  });

  it("rejects hover and seat together — a thing that floats does not land", () => {
    const out = validateSettlementDocument(settlement(landmark({ hover: 48, seat: "embed" })));
    const bad = out.diagnostics.find((d) => d.nodePath === "world.the_ship.params.seat");
    expect(bad?.name).toBe("PROGRAM_SCHEMA");
    expect(bad?.severity).toBe("error");
  });
});

/* -------------------------------------------------------------------------- */
/* the plugin spelling                                                        */
/* -------------------------------------------------------------------------- */

function scatter(params: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "pods",
    kind: "generator",
    generator: "scatter.program@0",
    params: { program: "saucer", brief: "one of many", count: 12, area: { all: true }, spacing: 40, ...params }
  };
}

describe("params.hover on a scatter.program@0 node", () => {
  it("accepts an integer inside 8..256, in both profiles", () => {
    for (const hover of [8, 48, 256]) {
      expect(errors(settlement(scatter({ hover })))).toEqual([]);
      expect(errors(terrain(scatter({ hover })), "terrain")).toEqual([]);
    }
  });

  it("still accepts a scatter with no hover at all", () => {
    expect(errors(settlement(scatter({})))).toEqual([]);
  });

  it("rejects a hover outside the range, a float, and a non-number", () => {
    for (const hover of [4, 400, 12.5, "48", null]) {
      expect(errors(settlement(scatter({ hover })))).toEqual([
        "PARAM_OUT_OF_RANGE@world.pods.params.hover"
      ]);
    }
  });

  it("names the instance, not the landmark, in the fix text", () => {
    const out = validateSettlementDocument(settlement(scatter({ hover: 4 })));
    const bad = out.diagnostics.find((d) => d.name === "PARAM_OUT_OF_RANGE");
    expect(bad?.fix).toContain("instance");
  });

  it("rejects hover and seat together, exactly as a landmark does", () => {
    for (const seat of ["pad", "embed", "drape"]) {
      const out = validateSettlementDocument(settlement(scatter({ hover: 40, seat })));
      const bad = out.diagnostics.find((d) => d.nodePath === "world.pods.params.seat");
      expect(bad?.name).toBe("PROGRAM_SCHEMA");
      expect(bad?.severity).toBe("error");
      expect(bad?.message).toContain("floats");
    }
  });

  it("still rejects an unknown key beside hover", () => {
    expect(errors(settlement(scatter({ hover: 40, drift: 3 })))).toEqual([
      "UNKNOWN_KEY@world.pods.params"
    ]);
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

  it("reads the plugin spelling out of a bare params object", () => {
    expect(hoverOfParams({ hover: 40 })).toBe(40);
    expect(hoverOfParams({ hover: 7 })).toBeUndefined();
    expect(hoverOfParams({})).toBeUndefined();
    expect(hoverOfParams(null)).toBeUndefined();
    expect(hoverOfParams(undefined)).toBeUndefined();
  });
});
