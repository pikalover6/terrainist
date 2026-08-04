/**
 * Bespoke-program **requests** — the §9e authoring shape, and the reference
 * catch-22 it used to walk into.
 *
 * The claims:
 *
 * 1. `intent.character.programs` accepts the kit's array of request objects,
 *    tolerates a single bare object, and still accepts the legacy
 *    `{ landmarks, plugins, briefs }` counts object.
 * 2. A document that references a program it has only *requested* validates
 *    clean — the `programs` map is attached by a later phase, so demanding it
 *    up front made faithful documents fail and the authoring model delete the
 *    feature.
 * 3. Wrong-mode and never-requested references still fail.
 */

import { describe, expect, it } from "vitest";

import {
  collectPendingPrograms,
  slugProgramId,
  validateSettlementDocument,
  validateTerrainDocument,
} from "../src/index.js";

const REQUEST = {
  id: "crop_circles",
  mode: "plugin",
  brief: "flattened rings pressed into the wheat",
  envelope: [16, 2, 16],
  count: 6,
};

const LANDMARK_REQUEST = {
  id: "street_barricades",
  mode: "landmark",
  brief: "a heaped barricade of carts and doors",
};

function doc(character: unknown, extras: unknown[] = []): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "hollow_dale", worldSeed: 42 },
    intent: { era: "victorian", character },
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

function codes(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.code);
}

function errorsOf(input: unknown): string[] {
  return validateSettlementDocument(input)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.name}@${d.nodePath}`);
}

describe("intent.character.programs — the §9e request shape", () => {
  it("accepts an array of request objects", () => {
    expect(codes(doc({ programs: [REQUEST, LANDMARK_REQUEST] }))).toEqual([]);
  });

  it("tolerates a single request object, the way the normaliser does", () => {
    expect(codes(doc({ programs: LANDMARK_REQUEST }))).toEqual([]);
  });

  it("still accepts the legacy counts-and-briefs object", () => {
    expect(codes(doc({ programs: { landmarks: 1, plugins: 2, briefs: ["a kraken statue"] } }))).toEqual([]);
  });

  it("still rejects a malformed legacy object", () => {
    expect(codes(doc({ programs: { landmarks: 99 } }))).toEqual(["LOAM-T104"]);
    expect(codes(doc({ programs: { briefs: [7] } }))).toEqual(["LOAM-T010"]);
  });

  it("rejects a request with no id and no brief, precisely", () => {
    const result = validateSettlementDocument(doc({ programs: [{ mode: "plugin" }] }));
    const paths = result.diagnostics.map((d) => d.nodePath);
    expect(paths).toContain("intent.character.programs[0].id");
    expect(paths).toContain("intent.character.programs[0].brief");
    expect(result.diagnostics.every((d) => d.fix.length > 0)).toBe(true);
  });

  it("rejects a bad mode, envelope, count and unknown key", () => {
    const result = validateSettlementDocument(
      doc({
        programs: [
          { ...LANDMARK_REQUEST, mode: "statue" },
          { ...REQUEST, envelope: [16, 2] },
          { ...REQUEST, id: "c2", count: 0 },
          { ...REQUEST, id: "c3", size: 4 },
        ],
      }),
    );
    const names = result.diagnostics.map((d) => `${d.name}@${d.nodePath}`);
    expect(names).toContain("BAD_ENUM@intent.character.programs[0].mode");
    expect(names).toContain("BAD_TYPE@intent.character.programs[1].envelope");
    expect(names).toContain("PARAM_OUT_OF_RANGE@intent.character.programs[2].count");
    expect(names).toContain("UNKNOWN_KEY@intent.character.programs[3]");
    expect(
      result.diagnostics.find((d) => d.name === "UNKNOWN_KEY")?.message,
    ).toContain('"size"');
  });

  it("rejects a non-object, non-array programs value with the array hint", () => {
    const result = validateSettlementDocument(doc({ programs: "a statue" }));
    expect(result.diagnostics[0]?.name).toBe("BAD_TYPE");
    expect(result.diagnostics[0]?.fix).toContain('"id"');
  });
});

describe("collectPendingPrograms", () => {
  it("slugs ids the way the program author does", () => {
    expect(slugProgramId("Crop Circles!")).toBe("crop_circles");
    expect(slugProgramId("  ---  ")).toBe("program");
  });

  it("finds requests at every scope, first request per id winning", () => {
    const pending = collectPendingPrograms(
      doc({ programs: [REQUEST] }, [
        {
          id: "quarter",
          kind: "district",
          intent: { character: { programs: [LANDMARK_REQUEST, { ...REQUEST, mode: "landmark" }] } },
        },
      ]),
    );
    expect(pending.get("crop_circles")).toBe("plugin");
    expect(pending.get("street_barricades")).toBe("landmark");
  });

  it("ignores entries missing id or brief", () => {
    expect(collectPendingPrograms({ intent: { character: { programs: [{ id: "x" }] } } }).size).toBe(0);
  });
});

describe("references to a requested-but-not-yet-authored program", () => {
  const landmarkNode = {
    id: "barricade",
    kind: "generator",
    generator: "authored:street_barricades",
    envelope: { shape: "box", size: [10, 4, 10] },
  };
  const scatterNode = {
    id: "circles",
    kind: "generator",
    generator: "scatter.program@0",
    params: { program: "crop_circles", count: 6, spacing: 40 },
  };

  it("validates a settlement document with both, and no programs map at all", () => {
    const result = validateSettlementDocument(
      doc({ programs: [REQUEST, LANDMARK_REQUEST] }, [landmarkNode, scatterNode]),
    );
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("does not warn PROGRAM_ENVELOPE_OVERRIDDEN for a pending reference", () => {
    const result = validateSettlementDocument(doc({ programs: [LANDMARK_REQUEST] }, [landmarkNode]));
    expect(result.diagnostics.map((d) => d.name)).not.toContain("PROGRAM_ENVELOPE_OVERRIDDEN");
  });

  it("still checks the pending node's constraints", () => {
    const result = validateSettlementDocument(
      doc({ programs: [LANDMARK_REQUEST] }, [
        { ...landmarkNode, constraints: [{ type: "not_a_constraint" }] },
      ]),
    );
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("rejects a landmark reference to a plugin-only request", () => {
    expect(
      errorsOf(doc({ programs: [REQUEST] }, [{ ...landmarkNode, generator: "authored:crop_circles" }])),
    ).toContain("PROGRAM_SCHEMA@world.barricade");
  });

  it("rejects scattering a landmark-only request", () => {
    expect(
      errorsOf(
        doc({ programs: [LANDMARK_REQUEST] }, [
          { ...scatterNode, params: { ...scatterNode.params, program: "street_barricades" } },
        ]),
      ),
    ).toContain("PROGRAM_SCHEMA@world.circles.params.program");
  });

  it("still rejects a reference in neither the map nor the requests", () => {
    expect(errorsOf(doc({ programs: [REQUEST] }, [landmarkNode]))).toContain(
      "PROGRAM_SCHEMA@world.barricade",
    );
    expect(
      errorsOf(
        doc({}, [{ ...scatterNode, params: { ...scatterNode.params, program: "nope" } }]),
      ),
    ).toContain("PROGRAM_SCHEMA@world.circles.params.program");
  });

  it("works the same in the terrain profile", () => {
    const terrain = {
      loam: "0.1",
      profile: "terrain",
      meta: { name: "moor", worldSeed: 7 },
      intent: { character: { programs: [LANDMARK_REQUEST] } },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [256, 256] },
        children: [
          { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
          { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
          landmarkNode,
        ],
      },
    };
    expect(validateTerrainDocument(terrain).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
