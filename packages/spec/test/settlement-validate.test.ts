import { describe, expect, it } from "vitest";

import {
  CONSTRAINT_REGISTRY,
  canonicalize,
  resolveTypeKey,
  strengthOf,
  validateSettlementDocument,
  weightOf,
} from "../src/index.js";

/** A minimal settlement document; `patch` replaces `root.children` extras. */
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
        ...extras,
      ],
    },
  };
}

function building(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "town_hall",
    kind: "generator",
    generator: "building.grammar@0",
    envelope: { shape: "box", size: [12, 9, 10] },
    params: { floors: 2 },
    ...patch,
  };
}

/** Codes of every diagnostic produced. */
function codes(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.code);
}

/** Names of every diagnostic produced. */
function names(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.name);
}

describe("settlement profile — document shape", () => {
  it("accepts a terrain-only document under the settlement profile", () => {
    const result = validateSettlementDocument(doc());
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("accepts a building, a road network and a plaza", () => {
    const result = validateSettlementDocument(
      doc([
        building(),
        { id: "streets", kind: "generator", generator: "road.network@0", params: { anchors: ["town_hall"] } },
        { id: "plaza", kind: "primitive", envelope: { shape: "region", size: [24, 24] } },
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("rejects a document whose profile is not settlement", () => {
    const bad = doc() as { profile: string };
    bad.profile = "terrain";
    expect(names(bad)).toContain("BAD_DOCUMENT");
  });

  it("rejects a generator outside the settlement profile", () => {
    const result = validateSettlementDocument(
      doc([{ id: "caves", kind: "generator", generator: "cave.carver@0", params: {} }]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("STRUCTURE_GENERATOR_NOT_IN_PROFILE");
    expect(result.diagnostics[0]?.code).toBe("LOAM-T200");
  });

  it("allows at most one plaza", () => {
    const result = validateSettlementDocument(
      doc([
        { id: "market", kind: "primitive", envelope: { shape: "region", size: [24, 24] } },
        { id: "green", kind: "primitive", envelope: { shape: "region", size: [16, 16] } },
      ]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("PLAZA_CARDINALITY");
  });

  it("rejects children of a structure node", () => {
    expect(names(doc([building({ children: [] })]))).toContain("STRUCTURE_NODE_SHAPE");
  });

  it("keeps the terrain profile's restrictions on terrain nodes", () => {
    const result = validateSettlementDocument(
      doc([
        {
          id: "trees",
          kind: "generator",
          generator: "scatter.forest@0",
          params: { species: [{ id: "oak", shape: "oak_round" }] },
          constraints: [{ zone: "north" }],
        },
      ]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("CONSTRAINTS_NOT_ALLOWED");
  });

  it("still requires exactly one heightfield and one climate node", () => {
    const bare = {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "x", worldSeed: 1 },
      root: { id: "world", kind: "composite", envelope: { shape: "region", size: [64, 64] }, children: [building()] },
    };
    expect(names(bare).filter((n) => n === "GENERATOR_CARDINALITY")).toHaveLength(2);
  });
});

describe("settlement profile — envelopes", () => {
  it("rejects a two-element box size with LOAM-E153", () => {
    expect(codes(doc([building({ envelope: { shape: "box", size: [12, 10] } })]))).toContain("LOAM-E153");
  });

  it("coerces a three-element region size with LOAM-W152", () => {
    const result = validateSettlementDocument(
      doc([{ id: "plaza", kind: "primitive", envelope: { shape: "region", size: [24, 4, 24] } }]),
    );
    const coerced = result.diagnostics.find((d) => d.code === "LOAM-W152");
    expect(coerced?.severity).toBe("warning");
    // A warning must not stop the compile.
    expect(result.document).toBeDefined();
  });

  it("rejects a non-box structure envelope", () => {
    expect(names(doc([building({ envelope: { shape: "cylinder", size: [8, 8, 8] } })]))).toContain("BAD_ENVELOPE");
  });

  it("rejects minSize larger than size", () => {
    const result = validateSettlementDocument(
      doc([building({ envelope: { shape: "box", size: [10, 8, 10], minSize: [12, 8, 10], flexible: true } })]),
    );
    expect(result.diagnostics.map((d) => d.message).join()).toMatch(/wrong side/);
  });

  it("warns when minSize is set without flexible", () => {
    const result = validateSettlementDocument(
      doc([building({ envelope: { shape: "box", size: [10, 8, 10], minSize: [8, 8, 8] } })]),
    );
    expect(result.diagnostics.some((d) => d.severity === "warning" && d.name === "BAD_ENVELOPE")).toBe(true);
    expect(result.document).toBeDefined();
  });

  it("rejects an unquantized yaw in rotations", () => {
    expect(names(doc([building({ envelope: { shape: "box", size: [8, 8, 8], rotations: [45] } })]))).toContain(
      "BAD_ENVELOPE",
    );
  });
});

describe("settlement profile — constraints", () => {
  it("accepts every tier-1 constraint in shorthand", () => {
    const result = validateSettlementDocument(
      doc([
        { id: "well", kind: "generator", generator: "building.grammar@0", envelope: { shape: "box", size: [3, 3, 3] }, params: {} },
        building({
          constraints: [
            { zone: "north" },
            { at: [0.4, 0.4], mode: "contain", radius: 40 },
            { adjacent_to: "well", gap: [0, 2] },
            { distance: "well", min: 4, max: 40 },
            { facing: "well", tolerance: 45 },
            { not_overlapping: "well" },
            { clearance: 3 },
            { terrain_conform: "cut_fill", reference: "median", blend: 4 },
          ],
        }),
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("passes a valid but unimplemented v0.2 constraint through as LOAM-W407", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ within: "root" }] })]));
    const w407 = result.diagnostics.find((d) => d.code === "LOAM-W407");
    expect(w407?.name).toBe("CONSTRAINT_NOT_IMPLEMENTED");
    expect(w407?.severity).toBe("warning");
    expect(w407?.fix).toMatch(/zone, at, adjacent_to/);
    // A W407 never stops the compile — that is the whole contract.
    expect(result.document).toBeDefined();
  });

  it("passes every non-tier-1 registry type through as W407, and none of tier 1", () => {
    for (const type of CONSTRAINT_REGISTRY) {
      const result = validateSettlementDocument(doc([building({ constraints: [{ type }] })]));
      const hasW407 = result.diagnostics.some((d) => d.code === "LOAM-W407");
      const tier1 = ["zone", "at", "adjacent_to", "distance", "facing", "not_overlapping", "clearance", "terrain_conform"];
      expect(hasW407).toBe(!tier1.includes(type));
    }
  });

  it("errors on a constraint type outside the v0.2 registry", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ after: "well" }] })]));
    const e104 = result.diagnostics.find((d) => d.code === "LOAM-E104");
    expect(e104?.name).toBe("UNKNOWN_CONSTRAINT_TYPE");
    expect(e104?.severity).toBe("error");
    expect(result.document).toBeUndefined();
  });

  it("errors on an ambiguous shorthand", () => {
    expect(codes(doc([building({ constraints: [{ zone: "north", clearance: 2 }] })]))).toContain("LOAM-E169");
  });

  it("errors on an unknown zone token", () => {
    expect(codes(doc([building({ constraints: [{ zone: "up" }] })]))).toContain("LOAM-E162");
  });

  it("errors on an out-of-range coarse coordinate", () => {
    expect(codes(doc([building({ constraints: [{ at: [1.4, 0.2] }] })]))).toContain("LOAM-E166");
  });

  it("warns that a terrain-anchor `at` is not resolved yet", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ at: "@terrain:peak" }] })]));
    expect(result.diagnostics.some((d) => d.code === "LOAM-W407")).toBe(true);
    expect(result.document).toBeDefined();
  });

  it("rejects an unknown field on a constraint", () => {
    expect(names(doc([building({ constraints: [{ zone: "north", bearing: 12 }] })]))).toContain("UNKNOWN_KEY");
  });

  it("rejects a bad strength", () => {
    expect(names(doc([building({ constraints: [{ zone: "north", strength: "medium" }] })]))).toContain("BAD_CONSTRAINT");
  });

  it("requires a target on a relational constraint", () => {
    expect(names(doc([building({ constraints: [{ type: "distance", min: 4 }] })]))).toContain("BAD_CONSTRAINT");
  });

  it("warns that terrain_conform drape makes no ground adjustment yet", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ terrain_conform: "drape" }] })]));
    expect(result.diagnostics.some((d) => d.code === "LOAM-W407")).toBe(true);
  });
});

describe("settlement profile — ports", () => {
  it("accepts door and road_stub ports on the four horizontal faces", () => {
    const result = validateSettlementDocument(
      doc([
        building({
          ports: {
            main_door: { type: "door", face: "south", at: "center", tags: ["primary"] },
            north_road: { type: "road_stub", face: "north", width: 5 },
          },
        }),
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("errors on a port type outside Loam v0.2", () => {
    const result = validateSettlementDocument(doc([building({ ports: { p: { type: "portcullis" } } })]));
    expect(result.diagnostics.find((d) => d.code === "LOAM-E105")?.severity).toBe("error");
  });

  it("warns on a valid v0.2 port type the profile does not resolve", () => {
    const result = validateSettlementDocument(doc([building({ ports: { cellar: { type: "tunnel_stub", face: "north" } } })]));
    const w = result.diagnostics.find((d) => d.code === "LOAM-T206");
    expect(w?.name).toBe("PORT_FEATURE_NOT_IMPLEMENTED");
    expect(result.document).toBeDefined();
  });

  it("warns on a vertical face and errors on an unknown one", () => {
    expect(codes(doc([building({ ports: { hatch: { type: "door", face: "up" } } })]))).toContain("LOAM-T206");
    expect(names(doc([building({ ports: { hatch: { type: "door", face: "sideways" } } })]))).toContain("BAD_PORT");
  });

  it("rejects an out-of-range port `at`", () => {
    expect(names(doc([building({ ports: { d: { type: "door", face: "south", at: [1.2, 0] } } })]))).toContain("BAD_PORT");
  });

  it("rejects a port name that is not a Loam id", () => {
    expect(names(doc([building({ ports: { "Front Door": { type: "door" } } })]))).toContain("BAD_ID");
  });
});

describe("settlement profile — generator params", () => {
  it("rejects an out-of-range building param", () => {
    expect(names(doc([building({ params: { floors: 99 } })]))).toContain("PARAM_OUT_OF_RANGE");
  });

  it("rejects an unknown building param", () => {
    expect(names(doc([building({ params: { storeys: 3 } })]))).toContain("UNKNOWN_KEY");
  });

  it("requires anchors on a road network", () => {
    const result = validateSettlementDocument(
      doc([{ id: "streets", kind: "generator", generator: "road.network@0", params: {} }]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("STRUCTURE_PARAM");
  });

  it("checks the road hierarchy entries", () => {
    const result = validateSettlementDocument(
      doc([
        {
          id: "streets",
          kind: "generator",
          generator: "road.network@0",
          params: { anchors: ["town_hall"], hierarchy: [{ width: 7 }] },
        },
      ]),
    );
    expect(result.diagnostics.map((d) => d.message).join()).toMatch(/needs a string "class"/);
  });

  it("accepts the profile's road shorthands", () => {
    const result = validateSettlementDocument(
      doc([
        {
          id: "streets",
          kind: "generator",
          generator: "road.network@0",
          params: { anchors: ["town_hall"], width: 3, lanterns: false, lanternSpacing: 12 },
        },
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("range-checks the road shorthands", () => {
    const names = (params: Record<string, unknown>): string[] =>
      validateSettlementDocument(
        doc([{ id: "streets", kind: "generator", generator: "road.network@0", params }]),
      ).diagnostics.map((d) => d.name);
    expect(names({ anchors: ["town_hall"], width: 9 })).toContain("PARAM_OUT_OF_RANGE");
    expect(names({ anchors: ["town_hall"], width: 1 })).toContain("PARAM_OUT_OF_RANGE");
    expect(names({ anchors: ["town_hall"], lanternSpacing: 2 })).toContain("PARAM_OUT_OF_RANGE");
    expect(names({ anchors: ["town_hall"], lanterns: "yes" })).toContain("BAD_TYPE");
  });
});

describe("constraint registry", () => {
  it("resolves `along` before `at`, per registry order", () => {
    const resolved = resolveTypeKey({ along: "main_road", at: 0.5 });
    expect(resolved.ok && resolved.type).toBe("along");
  });

  it("resolves a bare `at` to the at constraint", () => {
    const resolved = resolveTypeKey({ at: [0.3, 0.7] });
    expect(resolved.ok && resolved.type).toBe("at");
  });

  it("desugars shorthand into the type's primary argument", () => {
    const c = canonicalize({ distance: "well", min: 6 }, "distance", true);
    expect(c).toEqual({ type: "distance", target: "well", min: 6 });
  });

  it("applies per-type default strengths and weights", () => {
    expect(strengthOf({ type: "facing", target: "x" })).toBe("soft");
    expect(strengthOf({ type: "distance", target: "x" })).toBe("hard");
    expect(strengthOf({ type: "zone", zone: "north" })).toBe("soft");
    expect(strengthOf({ type: "zone", zone: "north", mode: "contain" })).toBe("hard");
    expect(weightOf({ type: "facing", target: "x" })).toBe(2);
    expect(weightOf({ type: "align", target: "x" })).toBe(1);
    expect(weightOf({ type: "facing", target: "x", weight: 5 })).toBe(5);
  });
});
