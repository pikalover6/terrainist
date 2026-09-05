/**
 * `intent` — the schema, and where it is legal to write one.
 *
 * The claims: a well-formed intent validates; a malformed dial is rejected with
 * a fix hint; an unknown era is a *warning* that still resolves; and intent on a
 * node kind that carries none is ignored with `LOAM-W481` rather than costing
 * the document its compile.
 */

import { describe, expect, it } from "vitest";

import {
  BLEND_WIDTHS,
  DEFAULT_ERA_CLASS,
  eraClassOf,
  validateIntentValue,
  validateSettlementDocument,
  validateTerrainDocument
} from "../src/ir.js";

const FULL = {
  era: "victorian",
  wealth: 0.8,
  decline: 0.2,
  formality: 0.9,
  event: { kind: "fire", severity: 0.5, recency: 0.4 },
  climate: { biome: "minecraft:jungle", temperature: 0.3, humidity: -0.2, snow: "never" },
  character: {
    label: "pirate haven",
    materialTheme: "weathered_timber",
    palettes: { "ground.beach": "minecraft:sand" },
    props: { prefer: ["barrel"] },
    flora: { forbid: ["oak"] },
    motifs: { roofType: "gable", massing: "blocky", windowRhythm: "sparse", ornamentDensity: 0.4 }
  }
};

function terrainDoc(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "isle", worldSeed: 7 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} }
      ]
    },
    ...extra
  };
}

describe("intent schema", () => {
  it("accepts a fully populated intent", () => {
    const { diagnostics, intent } = validateIntentValue(FULL);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(intent?.character?.label).toBe("pirate haven");
  });

  it("accepts an empty intent — absent is 'no opinion', not an error", () => {
    expect(validateIntentValue({}).intent).toEqual({});
  });

  it("rejects a dial outside 0..1 with a usable fix hint", () => {
    const { diagnostics } = validateIntentValue({ wealth: 4 });
    const d = diagnostics.find((x) => x.nodePath === "intent.wealth");
    expect(d?.severity).toBe("error");
    expect(d?.fix).toContain("no opinion");
  });

  it("rejects unknown keys, bad enums and non-scalar tokens", () => {
    const codes = validateIntentValue({
      mood: "spooky",
      event: { kind: "plague", severity: 0.5, recency: 0 },
      character: { motifs: { roofType: "thatched" } },
      climate: "cold"
    }).diagnostics.map((d) => d.name);
    expect(codes).toContain("UNKNOWN_KEY");
    expect(codes).toContain("BAD_ENUM");
    expect(codes).toContain("BAD_TYPE");
  });

  it("warns on an era outside the dispatch table but keeps the document", () => {
    const { diagnostics, intent } = validateIntentValue({ era: "hyperbaroque" });
    expect(diagnostics.map((d) => d.code)).toContain("LOAM-W480");
    expect(intent).toBeDefined();
    expect(eraClassOf("hyperbaroque")).toBeUndefined();
  });

  it("dispatches era strings case- and separator-insensitively", () => {
    expect(eraClassOf("Wild West")).toBe("industrial");
    expect(eraClassOf("far-future")).toBe("far_future");
    expect(eraClassOf("pirate")).toBe("renaissance");
    expect(DEFAULT_ERA_CLASS).toBe("medieval");
  });
});

describe("where intent is legal", () => {
  it("takes intent on the document root", () => {
    const result = validateTerrainDocument(terrainDoc({ intent: { era: "medieval" } }));
    expect(result.document).toBeDefined();
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("takes intent on the root composite node", () => {
    const doc = terrainDoc();
    (doc["root"] as Record<string, unknown>)["intent"] = { wealth: 0.3 };
    expect(validateTerrainDocument(doc).document).toBeDefined();
  });

  it("ignores intent on a generator node with LOAM-W481, not an error", () => {
    const doc = terrainDoc();
    const children = (doc["root"] as { children: Record<string, unknown>[] }).children;
    (children[0] as Record<string, unknown>)["intent"] = { wealth: 0.3 };
    const result = validateTerrainDocument(doc);
    expect(result.document).toBeDefined();
    const d = result.diagnostics.find((x) => x.code === "LOAM-W481");
    expect(d?.severity).toBe("warning");
  });

  it("takes intent on a district node in a settlement document", () => {
    const doc = {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "port", worldSeed: 3 },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [256, 256] },
        children: [
          { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
          { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
          {
            id: "quarter",
            kind: "district",
            envelope: { shape: "region", size: [96, 96] },
            params: { fabric: "grid", density: "medium", mix: ["cottage"] },
            intent: { character: { label: "pirate haven" } }
          }
        ]
      }
    };
    const result = validateSettlementDocument(doc);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("reports a malformed intent inside a district", () => {
    const doc = {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "port", worldSeed: 3 },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [256, 256] },
        children: [
          { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
          { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
          {
            id: "quarter",
            kind: "district",
            envelope: { shape: "region", size: [96, 96] },
            params: { fabric: "grid", density: "medium", mix: ["cottage"] },
            intent: { wealth: "lots" }
          }
        ]
      }
    };
    const result = validateSettlementDocument(doc);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.some((d) => d.nodePath === "world.quarter.intent.wealth")).toBe(true);
  });
});
