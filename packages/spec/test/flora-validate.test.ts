/**
 * The document surface of the flora grammar (FLORA-GRAMMAR-v0 §5.1, §8.1).
 *
 * The rule under test is DESIGN.md's risk 3, twice: never let a legal authoring
 * pattern draw an error, and never let a dropped feature be silent.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FLORA_SPECIES_IDS, validateTerrainDocument } from "../src/ir.js";

/** Diagnostic kinds, as the codes they are actually reported under. */
const CODE = {
  MISSING_KEY: "LOAM-T009",
  BAD_TYPE: "LOAM-T010",
  BAD_ENUM: "LOAM-T101",
  PARAM_OUT_OF_RANGE: "LOAM-T104"
} as const;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.resolve(HERE, "../../compiler/test/fixtures/examples");

/** A minimal terrain document with one forest node, whose params we vary. */
function doc(forestParams: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "flora_probe", worldSeed: 1 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { seaLevel: 63, baseHeight: 68, amplitude: 20 }
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "wood",
          kind: "generator",
          generator: "scatter.forest@0",
          params: { species: [{ id: "oak", shape: "oak_round" }], ...forestParams }
        }
      ]
    }
  };
}

const diagnose = (params: Record<string, unknown>) => validateTerrainDocument(doc(params)).diagnostics;

describe("flora: the strata param validates", () => {
  it("strata: true and every legal object form validate clean", () => {
    for (const strata of [
      true,
      { emergent: "default" },
      { emergent: "none", understory: "none" },
      { canopy: "authored" },
      { canopy: "default" },
      { canopy: { species: [{ id: "big_oak", shape: "oak_spreading" }] } },
      { floor: "fungal" },
      { floor: "glow" },
      {
        emergent: { species: [{ id: "great_beech", shape: "beech_giant" }] },
        understory: { species: [{ id: "hazel", shape: "hazel_shrub" }] }
      }
    ]) {
      expect(diagnose({ strata }), JSON.stringify(strata)).toEqual([]);
    }
  });

  it("every new species id is accepted as a shape", () => {
    for (const shape of FLORA_SPECIES_IDS) {
      expect(diagnose({ species: [{ id: "s", shape }] }), shape).toEqual([]);
    }
  });

  it("strata must be true or an object, and says so", () => {
    const [d] = diagnose({ strata: "yes" });
    expect(d?.code).toBe(CODE.BAD_TYPE);
    expect(d?.fix).toContain('"strata": true');
  });

  it("an unknown stratum name is reported", () => {
    const codes = diagnose({ strata: { canopyy: "default" } }).map((d) => d.code);
    expect(codes.length).toBeGreaterThan(0);
  });

  it("a bad stratum keyword names the legal values", () => {
    const [d] = diagnose({ strata: { emergent: "always" } });
    expect(d?.code).toBe(CODE.BAD_ENUM);
    expect(d?.fix).toContain("default");
    expect(d?.fix).toContain("none");
  });

  it("a bad floor keyword names the legal values", () => {
    const [d] = diagnose({ strata: { floor: "mossy" } });
    expect(d?.code).toBe(CODE.BAD_ENUM);
    expect(d?.fix).toContain("fungal");
  });

  it("a bad species shape inside a stratum names the legal shapes, with one vocabulary", () => {
    const d = diagnose({ strata: { emergent: { species: [{ id: "x", shape: "megatree" }] } } }).find(
      (x) => x.code === CODE.BAD_ENUM,
    );
    expect(d?.nodePath).toContain("strata.emergent.species[0]");
    expect(d?.fix).toContain("beech_giant");
    // The same diagnostic a top-level species entry would draw.
    const [top] = diagnose({ species: [{ id: "x", shape: "megatree" }] });
    expect(d?.fix).toBe(top?.fix);
  });

  it('an empty species list inside a stratum says to use "none"', () => {
    const [d] = diagnose({ strata: { understory: { species: [] } } });
    expect(d?.code).toBe(CODE.MISSING_KEY);
    expect(d?.fix).toContain('"none"');
  });

  it("params.species stays required and non-empty in every strata form", () => {
    const bad = validateTerrainDocument(
      doc({ strata: true, species: [] }) as unknown,
    ).diagnostics;
    expect(bad.some((d) => d.code === CODE.MISSING_KEY)).toBe(true);
  });

});

describe("flora: every legacy document still validates", () => {
  const files = fs
    .readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".loam.json"))
    .sort();

  it("the examples directory is non-empty", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${file} draws no error`, () => {
      const input: unknown = JSON.parse(fs.readFileSync(path.join(EXAMPLES, file), "utf8"));
      if ((input as { profile?: string }).profile !== "terrain") return;
      const { diagnostics } = validateTerrainDocument(input);
      expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    });
  }
});
