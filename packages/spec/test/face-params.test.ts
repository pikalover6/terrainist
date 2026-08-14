/**
 * `params.face` — which way a bespoke program's declared front points.
 *
 * The claims:
 *
 * 1. Both senses validate clean on a landmark node and on
 *    `scatter.program@0`, in both profiles, against every selector spelling a
 *    document is allowed to use.
 * 2. A relation that is not one relation — neither sense, both senses, a key
 *    that is neither — is a precise error naming the exact path.
 * 3. Whether the selector names anything is *not* checked here: a facing hint
 *    can never be the reason a world fails to build, so an id no node carries
 *    validates and the compiler warns (`LOAM-W518`) where the placements are.
 * 4. `faceOf` is the blessed reader and refuses to half-read a broken relation.
 */

import { describe, expect, it } from "vitest";

import {
  FACE_SENSES,
  faceOf,
  faceOfParams,
  validateSettlementDocument,
  validateTerrainDocument,
} from "../src/index.js";

const REQUEST = {
  id: "sentinel",
  mode: "both",
  brief: "a sentinel that watches something",
  envelope: [11, 12, 21],
};

function document(profile: "settlement" | "terrain", node: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile,
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

function landmark(params: unknown): Record<string, unknown> {
  return {
    id: "the_watcher",
    kind: "generator",
    generator: "authored:sentinel",
    constraints: [{ zone: "center" }],
    ...(params === undefined ? {} : { params }),
  };
}

function scatter(params: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "watchers",
    kind: "generator",
    generator: "scatter.program@0",
    params: { program: "sentinel", count: 12, area: { all: true }, ...params },
  };
}

function errors(doc: unknown, profile: "settlement" | "terrain" = "settlement"): string[] {
  const result =
    profile === "settlement" ? validateSettlementDocument(doc) : validateTerrainDocument(doc);
  return result.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.name}@${d.nodePath}`);
}

describe("params.face on a bespoke invocation", () => {
  it("accepts either sense, on both spellings, in both profiles", () => {
    for (const sense of FACE_SENSES) {
      const face = { [sense]: "old_town" };
      expect(errors(document("settlement", landmark({ face })))).toEqual([]);
      expect(errors(document("terrain", landmark({ face })), "terrain")).toEqual([]);
      expect(errors(document("settlement", scatter({ face })))).toEqual([]);
      expect(errors(document("terrain", scatter({ face })), "terrain")).toEqual([]);
    }
  });

  it("accepts every selector spelling a document may write", () => {
    for (const target of ["old_town", "^.old_town", "world.old_town", "#tag:civic", "root"]) {
      expect(errors(document("settlement", landmark({ face: { toward: target } })))).toEqual([]);
    }
  });

  it("takes a target no node carries — the compiler warns, the world still builds", () => {
    expect(errors(document("settlement", landmark({ face: { toward: "atlantis" } })))).toEqual([]);
  });

  it("rejects a relation that is not one relation", () => {
    for (const face of [{}, { toward: "a", away_from: "b" }]) {
      expect(errors(document("settlement", landmark({ face })))).toEqual([
        "PROGRAM_SCHEMA@world.the_watcher.params.face",
      ]);
    }
  });

  it("rejects a relation that is not an object at all", () => {
    for (const face of ["toward old_town", 3, null, ["old_town"]]) {
      expect(errors(document("settlement", landmark({ face })))).toEqual([
        "PROGRAM_SCHEMA@world.the_watcher.params.face",
      ]);
    }
  });

  it("rejects a sense the vocabulary does not carry", () => {
    expect(errors(document("settlement", landmark({ face: { at: "old_town" } })))).toEqual([
      "UNKNOWN_KEY@world.the_watcher.params.face",
      "PROGRAM_SCHEMA@world.the_watcher.params.face",
    ]);
  });

  it("rejects a selector that is not a selector", () => {
    for (const target of [7, "", "   ", null]) {
      expect(errors(document("settlement", scatter({ face: { toward: target } })))).toEqual([
        "PROGRAM_SCHEMA@world.watchers.params.face.toward",
      ]);
    }
  });
});

describe("faceOf, the blessed reader", () => {
  it("reads a well-formed relation off either spelling", () => {
    expect(faceOf({ params: { face: { toward: "old_town" } } })).toEqual({
      sense: "toward",
      target: "old_town",
    });
    expect(faceOfParams({ face: { away_from: " harbour " } })).toEqual({
      sense: "away_from",
      target: "harbour",
    });
  });

  it("has no answer for anything the validator would have rejected", () => {
    for (const params of [
      undefined,
      {},
      { face: null },
      { face: {} },
      { face: { toward: "a", away_from: "b" } },
      { face: { toward: "" } },
      { face: { toward: 7 } },
      { face: "toward old_town" },
    ]) {
      expect(faceOfParams(params)).toBeUndefined();
      expect(faceOf({ params })).toBeUndefined();
    }
    expect(faceOf(null)).toBeUndefined();
  });
});
