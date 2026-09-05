/**
 * `params.seat` / `params.embedDepth` — how a grounded program meets the ground.
 *
 * The claims:
 *
 * 1. Every policy in `SEAT_POLICIES` validates clean on a landmark node, in
 *    both profiles, and `embedDepth` rides along with `"embed"`.
 * 2. A policy that is not one of the three, an out-of-range depth, and a depth
 *    without an embed are each a precise error rather than a silent key.
 * 3. `hover` and `seat` together are rejected: a thing either floats or it
 *    touches down.
 * 4. `scatter.program@0` takes the same two keys — a field of crashed pods is
 *    exactly the case that wants `"embed"`.
 * 5. `seatPolicyOf` is the blessed reader and agrees with the validator.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMBED_DEPTH,
  SEAT_POLICIES,
  seatPolicyOf,
  validateSettlementDocument,
  validateTerrainDocument
} from "../src/ir.js";

const REQUEST = {
  id: "saucer",
  mode: "both",
  brief: "a saucer that came down hard",
  envelope: [32, 12, 32]
};

function document(profile: "settlement" | "terrain", node: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile,
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

function landmark(params: unknown): Record<string, unknown> {
  return {
    id: "the_wreck",
    kind: "generator",
    generator: "authored:saucer",
    constraints: [{ zone: "center" }],
    params: { brief: "a bespoke thing the world asked for", ...(params === undefined ? {} : (params as object)) }
  };
}

function scatter(params: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "pods",
    kind: "generator",
    generator: "scatter.program@0",
    params: { program: "saucer", brief: "one of many", count: 12, area: { all: true }, ...params }
  };
}

function errors(doc: unknown, profile: "settlement" | "terrain" = "settlement"): string[] {
  const result =
    profile === "settlement" ? validateSettlementDocument(doc) : validateTerrainDocument(doc);
  return result.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.name}@${d.nodePath}`);
}

describe("params.seat on an authored landmark", () => {
  it("accepts every policy, in both profiles", () => {
    for (const seat of SEAT_POLICIES) {
      expect(errors(document("settlement", landmark({ seat })))).toEqual([]);
      expect(errors(document("terrain", landmark({ seat })), "terrain")).toEqual([]);
    }
  });

  it("accepts embedDepth 1..32 beside an embed", () => {
    for (const embedDepth of [1, 5, 32]) {
      expect(errors(document("settlement", landmark({ seat: "embed", embedDepth })))).toEqual([]);
    }
  });

  it("rejects a policy that is not one of the three", () => {
    for (const seat of ["sink", "PAD", 3, null]) {
      expect(errors(document("settlement", landmark({ seat })))).toEqual([
        "BAD_ENUM@world.the_wreck.params.seat"
      ]);
    }
  });

  it("rejects an out-of-range or fractional embedDepth", () => {
    for (const embedDepth of [0, 33, 2.5, "5"]) {
      expect(errors(document("settlement", landmark({ seat: "embed", embedDepth })))).toEqual([
        "PARAM_OUT_OF_RANGE@world.the_wreck.params.embedDepth"
      ]);
    }
  });

  it("rejects embedDepth without an embed — it would mean nothing", () => {
    expect(errors(document("settlement", landmark({ seat: "pad", embedDepth: 4 })))).toEqual([
      "PROGRAM_SCHEMA@world.the_wreck.params.embedDepth"
    ]);
    expect(errors(document("settlement", landmark({ embedDepth: 4 })))).toEqual([
      "PROGRAM_SCHEMA@world.the_wreck.params.embedDepth"
    ]);
  });

  it("rejects hover and seat together — a thing either floats or it lands", () => {
    expect(errors(document("settlement", landmark({ hover: 48, seat: "embed" })))).toEqual([
      "PROGRAM_SCHEMA@world.the_wreck.params.seat"
    ]);
  });
});

describe("seat on scatter.program@0", () => {
  it("accepts a seat and an embedDepth", () => {
    expect(errors(document("settlement", scatter({ seat: "embed", embedDepth: 4 })))).toEqual([]);
    expect(errors(document("settlement", scatter({ seat: "drape" })))).toEqual([]);
  });

  it("rejects the same nonsense the landmark node rejects", () => {
    expect(errors(document("settlement", scatter({ seat: "sink" })))).toContain(
      "BAD_ENUM@world.pods.params.seat",
    );
    expect(errors(document("settlement", scatter({ embedDepth: 4 })))).toContain(
      "PROGRAM_SCHEMA@world.pods.params.embedDepth",
    );
  });
});

describe("seatPolicyOf — the blessed reader", () => {
  it("defaults to pad, reads what the validator accepts, refuses what it does not", () => {
    expect(seatPolicyOf({ params: {} })).toEqual({ policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH });
    expect(seatPolicyOf({})).toEqual({ policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH });
    expect(seatPolicyOf({ params: { seat: "drape" } })).toEqual({
      policy: "drape",
      embedDepth: DEFAULT_EMBED_DEPTH
    });
    expect(seatPolicyOf({ params: { seat: "embed", embedDepth: 7 } })).toEqual({
      policy: "embed",
      embedDepth: 7
    });
    for (const bad of [0, 33, 2.5, "7", null]) {
      expect(seatPolicyOf({ params: { seat: "embed", embedDepth: bad } })).toEqual({
        policy: "embed",
        embedDepth: DEFAULT_EMBED_DEPTH
      });
    }
    expect(seatPolicyOf({ params: { seat: "sink" } })).toEqual({
      policy: "pad",
      embedDepth: DEFAULT_EMBED_DEPTH
    });
  });

  it("has no answer for something that hovers — it never meets the ground", () => {
    expect(seatPolicyOf({ params: { hover: 48 } })).toBeUndefined();
    // …and a hover the validator would reject is not a hover at all.
    expect(seatPolicyOf({ params: { hover: 4 } })).toEqual({
      policy: "pad",
      embedDepth: DEFAULT_EMBED_DEPTH
    });
  });
});
