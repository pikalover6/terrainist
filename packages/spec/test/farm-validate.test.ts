/**
 * `precinct.farm@0` validation — `docs/FARM-PLAN-v0.md` §3.3 and §12 (WP-1).
 *
 * The holding's envelope is a *region*, not a box, which is the one place this
 * generator leaves the structure-node path; and its params are the kit's
 * contract with an author, so every range in §3.3's table is checked back.
 */

import { describe, expect, it } from "vitest";

import { validateSettlementDocument } from "../src/index.js";

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

function farm(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "east_farm",
    kind: "generator",
    generator: "precinct.farm@0",
    envelope: { shape: "region", size: [96, 80] },
    params: { parcels: 6, parcelSize: 18, crops: ["wheat", "potatoes"] },
    ...patch,
  };
}

function names(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.name);
}

describe("precinct.farm@0 — the node", () => {
  it("accepts a holding with a region envelope and no diagnostics", () => {
    const result = validateSettlementDocument(doc([farm()]));
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("accepts every param the kit defines, and every crop id", () => {
    const result = validateSettlementDocument(
      doc([
        farm({
          params: {
            parcels: 24,
            parcelSize: 10,
            crops: ["wheat", "carrots", "potatoes", "beetroots", "pumpkin", "berries", "pasture"],
            farmstead: ["farmhouse", "barn"],
            edge: "wall",
            fallow: 0.25,
          },
        }),
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("accepts the ports and constraints the kit teaches", () => {
    const result = validateSettlementDocument(
      doc([
        farm({
          ports: { gate: { type: "road_stub", face: "auto", tags: ["primary"] } },
          // `docs/FARM-PLAN-v0.md` §3.1 writes `"conform"` here; the v0.2 vocabulary
          // has no such mode, and `"drape"` is the one that means "leave the ground
          // alone", which is what the plan's §11 kit line asks for.
          constraints: [{ terrain_conform: "drape" }],
          tags: ["farm", "rural"],
        }),
      ]),
    );
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("precinct.farm@0 — the envelope (LOAM-T225)", () => {
  it("refuses a box envelope", () => {
    expect(names(doc([farm({ envelope: { shape: "box", size: [96, 24, 80] } })]))).toContain(
      "FARM_TOO_SMALL",
    );
  });

  it("refuses a missing envelope", () => {
    const node = farm();
    delete node["envelope"];
    expect(names(doc([node]))).toContain("FARM_TOO_SMALL");
  });

  it("refuses an envelope below the 40 × 40 floor, either axis", () => {
    expect(names(doc([farm({ envelope: { shape: "region", size: [39, 80] } })]))).toContain(
      "FARM_TOO_SMALL",
    );
    expect(names(doc([farm({ envelope: { shape: "region", size: [80, 39] } })]))).toContain(
      "FARM_TOO_SMALL",
    );
  });

  it("accepts exactly the floor", () => {
    expect(names(doc([farm({ envelope: { shape: "region", size: [40, 40] } })]))).toEqual([]);
  });

  it("refuses a three-element size", () => {
    expect(names(doc([farm({ envelope: { shape: "region", size: [96, 24, 80] } })]))).toContain(
      "FARM_TOO_SMALL",
    );
  });
});

describe("precinct.farm@0 — the params (LOAM-T226, LOAM-W502)", () => {
  it("names the range for a parcel count outside 1..24", () => {
    for (const parcels of [0, 25, 2.5, "six"]) {
      expect(names(doc([farm({ params: { parcels } })]))).toContain("FARM_PARAM");
    }
  });

  it("names the range for a parcelSize outside 10..28", () => {
    for (const parcelSize of [9, 29]) {
      expect(names(doc([farm({ params: { parcelSize } })]))).toContain("FARM_PARAM");
    }
  });

  it("names the range for a fallow share outside 0..1", () => {
    for (const fallow of [-0.1, 1.1]) {
      expect(names(doc([farm({ params: { fallow } })]))).toContain("FARM_PARAM");
    }
    expect(names(doc([farm({ params: { fallow: 0.5 } })]))).toEqual([]);
  });

  it("warns, and does not fail, on a crop id outside the table", () => {
    const result = validateSettlementDocument(doc([farm({ params: { crops: ["wheat", "rice"] } })]));
    const bad = result.diagnostics.filter((d) => d.name === "FARM_CROP_UNKNOWN");
    expect(bad).toHaveLength(1);
    expect(bad[0]?.severity).toBe("warning");
    expect(bad[0]?.fix).toContain("beetroots");
    // A warning is not fatal: the holding still compiles.
    expect(result.document).toBeDefined();
  });

  it("refuses a malformed edge, farmstead or crops list", () => {
    expect(names(doc([farm({ params: { edge: "hedge" } })]))).toContain("FARM_PARAM");
    expect(names(doc([farm({ params: { farmstead: 3 } })]))).toContain("FARM_PARAM");
    expect(names(doc([farm({ params: { crops: [] } })]))).toContain("FARM_PARAM");
  });

  it("refuses an unknown param key", () => {
    expect(names(doc([farm({ params: { hedgerows: true } })]))).toContain("UNKNOWN_KEY");
  });
});
