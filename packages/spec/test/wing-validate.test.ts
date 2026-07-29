/**
 * `building.grammar@0` → `wing` — the L/T plan param.
 *
 * A separate file from `settlement-validate.test.ts` on purpose: the wing is a
 * self-contained addition to the param vocabulary, and keeping its tests
 * together with its rules makes both readable.
 *
 * Every rejection here is asserted to carry a fix hint, because a validator
 * that tells an authoring model "that is wrong" without telling it what to
 * write instead costs a whole extra round trip.
 */

import { describe, expect, it } from "vitest";

import { validateSettlementDocument } from "../src/index.js";

function doc(wing: unknown): unknown {
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
        {
          id: "town_hall",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [13, 9, 13] },
          params: { floors: 2, wing },
        },
      ],
    },
  };
}

/** Diagnostics about the wing, and nothing else. */
function wingErrors(wing: unknown) {
  return validateSettlementDocument(doc(wing)).diagnostics.filter(
    (d) => d.nodePath.includes("wing") || d.message.includes("wing"),
  );
}

const GOOD = { size: [5, 4], side: "south", offset: 0 };

describe("building.grammar@0 wing param", () => {
  it("accepts a well-formed wing", () => {
    expect(wingErrors(GOOD)).toEqual([]);
    expect(wingErrors({ size: [4, 5], side: "west", offset: 4 })).toEqual([]);
    // `offset` is optional — a flush L is the default.
    expect(wingErrors({ size: [5, 4], side: "north" })).toEqual([]);
  });

  it("accepts a document with no wing at all", () => {
    expect(wingErrors(undefined)).toEqual([]);
  });

  it("refuses a wing that is not an object", () => {
    for (const bad of [4, "south", [5, 4], true]) {
      const found = wingErrors(bad);
      expect(found.length, JSON.stringify(bad)).toBeGreaterThan(0);
      expect(found[0]?.name).toBe("STRUCTURE_PARAM");
    }
  });

  it("refuses an unknown key inside it", () => {
    const found = wingErrors({ ...GOOD, height: 4 });
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.message.includes("height"))).toBe(true);
  });

  it("requires a side, and one of the four", () => {
    expect(wingErrors({ size: [5, 4], offset: 0 })[0]?.message).toContain("side");
    const bad = wingErrors({ size: [5, 4], side: "up", offset: 0 });
    expect(bad[0]?.message).toContain("side");
    expect(bad[0]?.fix).toContain("south");
  });

  it("requires an integer size pair", () => {
    for (const size of [undefined, [5], [5, 4, 3], [5.5, 4], "5x4", [0, 4]]) {
      const found = wingErrors({ size, side: "south", offset: 0 });
      expect(found.length, JSON.stringify(size)).toBeGreaterThan(0);
    }
  });

  it("refuses an overlap too short to be a doorway, and says how to fix it", () => {
    const found = wingErrors({ size: [2, 4], side: "south", offset: 0 });
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("doorway");
    expect(found[0]?.fix).toContain("3");
    // The same wing on an east side reads its run off the other axis.
    const east = wingErrors({ size: [4, 2], side: "east", offset: 0 });
    expect(east).toHaveLength(1);
    expect(east[0]?.message).toContain("doorway");
  });

  it("refuses a wing too shallow to be a room", () => {
    const found = wingErrors({ size: [5, 2], side: "south", offset: 0 });
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("buttress");
    expect(found[0]?.fix).toContain("deepen");
  });

  it("refuses a negative offset — straight edges only", () => {
    const found = wingErrors({ size: [5, 4], side: "south", offset: -2 });
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("offset");
    expect(found[0]?.fix).toContain("overhang");
  });

  it("refuses a non-integer offset", () => {
    const found = wingErrors({ size: [5, 4], side: "south", offset: 1.5 });
    expect(found).toHaveLength(1);
    expect(found[0]?.fix).toContain("min corner");
  });

  it("gives every wing diagnostic a fix hint", () => {
    for (const bad of [
      4,
      { size: [2, 4], side: "south", offset: 0 },
      { size: [5, 2], side: "south", offset: 0 },
      { size: [5, 4], side: "up", offset: 0 },
      { size: [5, 4], side: "south", offset: -1 },
      { size: "wide", side: "south", offset: 0 },
    ]) {
      for (const d of wingErrors(bad)) {
        expect(d.fix, JSON.stringify(bad)).toBeTruthy();
        expect(d.severity).toBe("error");
      }
    }
  });
});
