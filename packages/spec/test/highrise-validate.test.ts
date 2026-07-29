/**
 * The tall archetypes' envelope and storey rules.
 *
 * The rule under test is narrowing, and the narrowing is the interesting part:
 * it fires only on a node whose tags ask for a tall building, and every other
 * node keeps exactly the caps it had. Both halves are asserted, because a
 * validator that quietly tightened the rules for the whole village while
 * meaning to tighten them for towers would look identical from inside a
 * skyscraper test.
 *
 * Every rejection is checked for a fix hint. An authoring model that is told
 * "too tall" without being told what to write instead spends a round trip
 * guessing.
 */

import { describe, expect, it } from "vitest";

import { HIGHRISE_FLOOR_CAPS, HIGHRISE_WIDTH_RANGE, validateSettlementDocument } from "../src/index.js";

function doc(node: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "downtown", worldSeed: 7 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        { id: "tower", kind: "generator", generator: "building.grammar@0", ...node },
      ],
    },
  };
}

function errorsFor(node: Record<string, unknown>) {
  return validateSettlementDocument(doc(node)).diagnostics.filter((d) => d.severity === "error");
}

function allFor(node: Record<string, unknown>) {
  return validateSettlementDocument(doc(node)).diagnostics;
}

const TALL = {
  envelope: { shape: "box", size: [18, 52, 18] },
  tags: ["skyscraper"],
  params: { floors: 12 },
};

describe("tall-archetype envelopes", () => {
  it("accepts an envelope and storey count the tall grammar can build", () => {
    expect(errorsFor(TALL)).toEqual([]);
    expect(
      errorsFor({
        envelope: { shape: "box", size: [20, 44, 22] },
        tags: ["hotel"],
        params: { floors: 9 },
      }),
    ).toEqual([]);
  });

  it("raises the width cap well past what a cottage envelope ever needed", () => {
    const [lo, hi] = HIGHRISE_WIDTH_RANGE;
    expect(hi).toBeGreaterThan(lo);
    expect(
      errorsFor({
        envelope: { shape: "box", size: [hi, 60, hi] },
        tags: ["office"],
        params: { floors: 14 },
      }),
    ).toEqual([]);
  });

  it("refuses a footprint wider than the cap, with a hint", () => {
    const [, hi] = HIGHRISE_WIDTH_RANGE;
    const errors = errorsFor({
      envelope: { shape: "box", size: [hi + 6, 60, 18] },
      tags: ["skyscraper"],
      params: { floors: 12 },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("capped at");
    expect(errors[0]?.fix).toBeDefined();
  });

  it("refuses a footprint too narrow for a core, with a hint", () => {
    const [lo] = HIGHRISE_WIDTH_RANGE;
    const errors = errorsFor({
      envelope: { shape: "box", size: [lo - 2, 40, lo - 2] },
      tags: ["office"],
      params: { floors: 8 },
    });
    // One per horizontal axis — both are wrong, and saying so twice is more
    // useful than picking one.
    expect(errors).toHaveLength(2);
    for (const e of errors) {
      expect(e.message).toContain("stair core");
      expect(e.fix).toBeDefined();
    }
  });

  it("caps storeys per archetype, not with one shared number", () => {
    expect(HIGHRISE_FLOOR_CAPS["skyscraper"]).toBeGreaterThan(
      HIGHRISE_FLOOR_CAPS["apartment_block"] as number,
    );
    const flats = HIGHRISE_FLOOR_CAPS["apartment_block"] as number;
    // A storey count that is fine for a skyscraper and too much for flats.
    const node = {
      envelope: { shape: "box", size: [17, 90, 17] },
      params: { floors: flats + 5 },
    };
    expect(errorsFor({ ...node, tags: ["skyscraper"] })).toEqual([]);
    const errors = errorsFor({ ...node, tags: ["flats"] });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(`at most ${flats} storeys`);
    expect(errors[0]?.fix).toContain("skyscraper");
  });

  it("warns, rather than fails, when the envelope's Y is shorter than the storeys", () => {
    const diagnostics = allFor({
      envelope: { shape: "box", size: [17, 12, 17] },
      tags: ["office"],
      params: { floors: 9 },
    });
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const warn = diagnostics.find((d) => d.severity === "warning");
    expect(warn?.message).toContain("shorter than");
    expect(warn?.fix).toBeDefined();
  });

  it("leaves every other building's caps exactly as they were", () => {
    // The same envelope and storey count that a tall tag would have been
    // refused for: untagged, it is nobody's business.
    const [, hi] = HIGHRISE_WIDTH_RANGE;
    expect(
      errorsFor({
        envelope: { shape: "box", size: [hi + 10, 90, 4] },
        tags: ["cottage"],
        params: { floors: 20 },
      }),
    ).toEqual([]);
    // …and the general `floors` range still tops out at 24 for everyone.
    expect(
      errorsFor({
        envelope: { shape: "box", size: [13, 12, 11] },
        params: { floors: 25 },
      }).map((d) => d.message.includes("floors")),
    ).toContain(true);
  });
});
