/**
 * Bespoke-program **requests** — the node is the request.
 *
 * The claims:
 *
 * 1. An `authored:<id>` node with `params.brief` requests a landmark program;
 *    a `scatter.program@0` node with `params.brief` requests a plugin program;
 *    the same id invoked both ways is requested as `"both"`.
 * 2. A document that references a program it has only *requested* validates
 *    clean — the `programs` map is attached by a later phase.
 * 3. A reference with neither a map entry nor a brief is an error, and a bad
 *    brief is an error.
 */

import { describe, expect, it } from "vitest";

import {
  collectPendingPrograms,
  collectProgramRequests,
  slugProgramId,
  validateSettlementDocument,
  validateTerrainDocument
} from "../src/ir.js";

function doc(extras: unknown[], profile: "settlement" | "terrain" = "settlement"): unknown {
  return {
    loam: "0.1",
    profile,
    meta: { name: "hollow_dale", worldSeed: 42 },
    intent: { era: "victorian" },
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

const LANDMARK = {
  id: "barricade",
  kind: "generator",
  generator: "authored:street_barricades",
  envelope: { shape: "box", size: [12, 6, 12] },
  params: { brief: "a heaped barricade of carts and doors" },
  constraints: [{ zone: "center" }]
};

const SCATTER = {
  id: "circles",
  kind: "generator",
  generator: "scatter.program@0",
  params: {
    program: "crop_circles",
    brief: "flattened rings pressed into the wheat",
    envelope: [16, 2, 16],
    count: 6,
    area: { all: true }
  }
};

function errorsOf(input: unknown, profile: "settlement" | "terrain" = "settlement"): string[] {
  const result = profile === "settlement" ? validateSettlementDocument(input) : validateTerrainDocument(input);
  return result.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.name}@${d.nodePath}`);
}

describe("collectProgramRequests — the nodes are the requests", () => {
  it("harvests a landmark and a scatter, with their briefs, envelopes and counts", () => {
    const requests = collectProgramRequests(doc([LANDMARK, SCATTER]));
    expect(requests).toEqual([
      { id: "street_barricades", mode: "landmark", brief: "a heaped barricade of carts and doors", envelope: [12, 6, 12] },
      { id: "crop_circles", mode: "plugin", brief: "flattened rings pressed into the wheat", envelope: [16, 2, 16], count: 6 }
    ]);
  });

  it("slugs ids the way the map key is spelled", () => {
    expect(slugProgramId("Mothership Wreck")).toBe("mothership_wreck");
    const requests = collectProgramRequests(
      doc([{ ...LANDMARK, generator: "authored:Mothership Wreck" }]),
    );
    expect(requests[0]?.id).toBe("mothership_wreck");
  });

  it("requests an id invoked both ways as both", () => {
    const both = collectProgramRequests(
      doc([
        LANDMARK,
        { ...SCATTER, id: "more", params: { ...SCATTER.params, program: "street_barricades", brief: "the same, many times" } }
      ]),
    );
    expect(both).toHaveLength(1);
    expect(both[0]?.mode).toBe("both");
    expect(both[0]?.brief).toBe("a heaped barricade of carts and doors");
    expect(both[0]?.count).toBe(6);
  });

  it("ignores a node with no brief — that is a reference, not a request", () => {
    const { params: _params, ...bare } = LANDMARK;
    expect(collectProgramRequests(doc([bare]))).toEqual([]);
    expect(collectPendingPrograms(doc([LANDMARK, SCATTER]))).toEqual(
      new Map([
        ["street_barricades", "landmark"],
        ["crop_circles", "plugin"]
      ]),
    );
  });
});

describe("references to a requested-but-not-yet-authored program", () => {
  it("validates a settlement document with both, and no programs map at all", () => {
    expect(errorsOf(doc([LANDMARK, SCATTER]))).toEqual([]);
  });

  it("works the same in the terrain profile", () => {
    expect(errorsOf(doc([LANDMARK, SCATTER], "terrain"), "terrain")).toEqual([]);
  });

  it("still checks the requesting node's constraints", () => {
    const bad = { ...LANDMARK, constraints: [{ zone: "sideways" }] };
    expect(errorsOf(doc([bad]))).toContain("UNKNOWN_ZONE@world.barricade.constraints[0]");
  });

  it("rejects a reference with neither a map entry nor a brief", () => {
    const { params: _params, ...bare } = LANDMARK;
    const errors = errorsOf(doc([bare]));
    expect(errors).toContain("PROGRAM_SCHEMA@world.barricade");
    const { brief: _brief, ...scatterParams } = SCATTER.params;
    expect(errorsOf(doc([{ ...SCATTER, params: scatterParams }]))).toContain(
      "PROGRAM_SCHEMA@world.circles.params.program",
    );
  });

  it("rejects an empty brief and a bad suggested envelope", () => {
    // A blank brief is no request at all, so the reference has nothing to stand on.
    expect(errorsOf(doc([{ ...LANDMARK, params: { brief: "  " } }]))).toContain("PROGRAM_SCHEMA@world.barricade");
    expect(
      errorsOf(doc([{ ...SCATTER, params: { ...SCATTER.params, envelope: [0, 2, 16] } }])),
    ).toContain("PROGRAM_SCHEMA@world.circles.params.envelope");
  });

  it("rejects scattering a program only ever requested as a landmark by a node with no brief", () => {
    const scatterNoBrief = { ...SCATTER, params: { program: "street_barricades", count: 3, area: { all: true } } };
    expect(errorsOf(doc([LANDMARK, scatterNoBrief]))).toContain("PROGRAM_SCHEMA@world.circles.params.program");
  });
});
