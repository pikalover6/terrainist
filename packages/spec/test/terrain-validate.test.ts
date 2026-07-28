import { describe, expect, it } from "vitest";

import { TERRAIN_DIAGNOSTICS, formatDiagnostic, validateTerrainDocument } from "../src/index.js";
import type { LoamDiagnostic, TerrainDiagnosticName } from "../src/index.js";

/** A minimal document that validates cleanly; tests mutate copies of it. */
function baseDocument(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "test_world", worldSeed: 7, prompt: "a test", spawn: { zone: "center" } },
    style: { palettes: { "ground.beach": "minecraft:sand" } },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 30, seaLevel: 63 },
          children: [
            {
              id: "the_divide",
              kind: "generator",
              generator: "terrain.edit@0",
              params: { verb: "ridge", course: [[0.1, 0.5], [0.9, 0.5]], width: 30, height: 20 },
            },
          ],
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "woods",
          kind: "generator",
          generator: "scatter.forest@0",
          params: { area: { all: true }, density: 0.1, species: [{ id: "spruce", shape: "spruce_tall" }] },
        },
      ],
    },
  };
}

/** Walk to the heightfield node of a mutable document copy. */
function heightfield(doc: Record<string, unknown>): Record<string, unknown> {
  const root = doc["root"] as { children: Record<string, unknown>[] };
  return root.children[0] as Record<string, unknown>;
}

function codesOf(diagnostics: readonly LoamDiagnostic[]): string[] {
  return diagnostics.map((d) => d.name);
}

function expectDiagnostic(doc: unknown, name: TerrainDiagnosticName): LoamDiagnostic {
  const { diagnostics, document } = validateTerrainDocument(doc);
  const found = diagnostics.find((d) => d.name === name);
  expect(found, `expected ${name}, got ${codesOf(diagnostics).join(", ") || "no diagnostics"}`).toBeDefined();
  expect(document).toBeUndefined();
  return found as LoamDiagnostic;
}

describe("validateTerrainDocument", () => {
  it("accepts a well-formed terrain document", () => {
    const { diagnostics, document } = validateTerrainDocument(baseDocument());
    expect(diagnostics).toEqual([]);
    expect(document?.meta.name).toBe("test_world");
  });

  it("every diagnostic carries a code, a node path and a fix hint", () => {
    const doc = baseDocument();
    doc["loam"] = "0.2";
    const { diagnostics } = validateTerrainDocument(doc);
    for (const d of diagnostics) {
      expect(d.code).toMatch(/^LOAM-T\d{3}$/);
      expect(d.fix.length).toBeGreaterThan(10);
      expect(typeof d.nodePath).toBe("string");
      expect(formatDiagnostic(d)).toContain(d.code);
    }
  });

  it("LOAM-T000 rejects a non-object or a wrong header", () => {
    expectDiagnostic("not a document", "BAD_DOCUMENT");
    const doc = baseDocument();
    doc["profile"] = "building";
    expectDiagnostic(doc, "BAD_DOCUMENT");
  });

  it("LOAM-T001 rejects a generator outside the profile", () => {
    const doc = baseDocument();
    const root = doc["root"] as { children: Record<string, unknown>[] };
    root.children.push({ id: "caves", kind: "generator", generator: "cave.carver@0", params: {} });
    const d = expectDiagnostic(doc, "GENERATOR_NOT_IN_PROFILE");
    expect(d.code).toBe(TERRAIN_DIAGNOSTICS.GENERATOR_NOT_IN_PROFILE);
    expect(d.fix).toContain("terrain.heightfield@0");
  });

  it("LOAM-T002 rejects non-empty constraints or ports", () => {
    const doc = baseDocument();
    heightfield(doc)["constraints"] = [{ type: "after", target: "^.climate" }];
    expectDiagnostic(doc, "CONSTRAINTS_NOT_ALLOWED");

    const withPorts = baseDocument();
    heightfield(withPorts)["ports"] = [{ id: "north" }];
    expectDiagnostic(withPorts, "CONSTRAINTS_NOT_ALLOWED");
  });

  it("LOAM-T002 tolerates empty constraint arrays", () => {
    const doc = baseDocument();
    heightfield(doc)["constraints"] = [];
    heightfield(doc)["ports"] = [];
    expect(validateTerrainDocument(doc).diagnostics).toEqual([]);
  });

  it("LOAM-T003 requires exactly one heightfield and one climate node", () => {
    const noClimate = baseDocument();
    const root = noClimate["root"] as { children: unknown[] };
    root.children = [root.children[0]];
    expect(expectDiagnostic(noClimate, "GENERATOR_CARDINALITY").message).toContain("climate");

    const twoFields = baseDocument();
    const root2 = twoFields["root"] as { children: Record<string, unknown>[] };
    root2.children.push({
      id: "terrain2",
      kind: "generator",
      generator: "terrain.heightfield@0",
      params: {},
    });
    expect(expectDiagnostic(twoFields, "GENERATOR_CARDINALITY").message).toContain("2 terrain.heightfield@0");
  });

  it("LOAM-T004 rejects a non-edit child of the heightfield", () => {
    const doc = baseDocument();
    (heightfield(doc)["children"] as Record<string, unknown>[]).push({
      id: "nested",
      kind: "generator",
      generator: "scatter.forest@0",
      params: { species: [] },
    });
    expectDiagnostic(doc, "EDIT_NOT_UNDER_HEIGHTFIELD");
  });

  it("LOAM-T004 rejects an edit that hangs off the root", () => {
    const doc = baseDocument();
    const root = doc["root"] as { children: Record<string, unknown>[] };
    root.children.push({
      id: "stray",
      kind: "generator",
      generator: "terrain.edit@0",
      params: { verb: "peak", zone: "center" },
    });
    expectDiagnostic(doc, "EDIT_NOT_UNDER_HEIGHTFIELD");
  });

  it("LOAM-T005 rejects a tree deeper than three levels", () => {
    const doc = baseDocument();
    const edits = heightfield(doc)["children"] as Record<string, unknown>[];
    (edits[0] as Record<string, unknown>)["children"] = [
      { id: "deeper", kind: "generator", generator: "terrain.edit@0", params: { verb: "peak", zone: "center" } },
    ];
    expectDiagnostic(doc, "DEPTH_EXCEEDED");
  });

  it("LOAM-T006 rejects ids that break the id pattern", () => {
    const doc = baseDocument();
    heightfield(doc)["id"] = "Terrain-Field";
    const d = expectDiagnostic(doc, "BAD_ID");
    expect(d.fix).toContain("^[a-z][a-z0-9_]{0,62}$");
  });

  it("LOAM-T007 rejects duplicate sibling ids", () => {
    const doc = baseDocument();
    const edits = heightfield(doc)["children"] as Record<string, unknown>[];
    edits.push({ ...(edits[0] as Record<string, unknown>) });
    expectDiagnostic(doc, "DUPLICATE_ID");
  });

  it("LOAM-T008 rejects unknown keys but always allows label and note", () => {
    const doc = baseDocument();
    heightfield(doc)["colour"] = "blue";
    const d = expectDiagnostic(doc, "UNKNOWN_KEY");
    expect(d.message).toContain("colour");

    const annotated = baseDocument();
    heightfield(annotated)["label"] = "the massif";
    heightfield(annotated)["note"] = "reviewed by hand";
    expect(validateTerrainDocument(annotated).diagnostics).toEqual([]);
  });

  it("LOAM-T009 reports a missing required key", () => {
    const doc = baseDocument();
    delete (doc["meta"] as Record<string, unknown>)["worldSeed"];
    expectDiagnostic(doc, "MISSING_KEY");
  });

  it("LOAM-T010 reports a wrongly typed value", () => {
    const doc = baseDocument();
    (heightfield(doc)["params"] as Record<string, unknown>)["ridged"] = "yes";
    expectDiagnostic(doc, "BAD_TYPE");
  });

  it("LOAM-T100 rejects fractional coordinates outside [0,1]", () => {
    const doc = baseDocument();
    const edit = (heightfield(doc)["children"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    (edit["params"] as Record<string, unknown>)["course"] = [[-0.4, 0.5], [1.6, 0.5]];
    const d = expectDiagnostic(doc, "FRACTIONAL_OUT_OF_RANGE");
    expect(d.fix).toContain("fractions of the root region");
  });

  it("LOAM-T101 rejects unknown enum values", () => {
    const doc = baseDocument();
    const edit = (heightfield(doc)["children"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    (edit["params"] as Record<string, unknown>)["verb"] = "canyon";
    expectDiagnostic(doc, "BAD_ENUM");

    const badZone = baseDocument();
    (badZone["meta"] as Record<string, unknown>)["spawn"] = { zone: "middle" };
    expectDiagnostic(badZone, "BAD_ENUM");

    const badTheme = baseDocument();
    const root = badTheme["root"] as { children: Record<string, unknown>[] };
    (root.children[1] as Record<string, unknown>)["params"] = { forceTheme: "swampy" };
    expectDiagnostic(badTheme, "BAD_ENUM");
  });

  it("LOAM-T102 rejects the wrong placement form for a verb", () => {
    const radialWithCourse = baseDocument();
    (heightfield(radialWithCourse)["children"] as Record<string, unknown>[])[0] = {
      id: "summit",
      kind: "generator",
      generator: "terrain.edit@0",
      params: { verb: "peak", course: [[0.1, 0.1], [0.9, 0.9]] },
    };
    expect(expectDiagnostic(radialWithCourse, "BAD_PLACEMENT").fix).toContain('"at"');

    const linearWithZone = baseDocument();
    (heightfield(linearWithZone)["children"] as Record<string, unknown>[])[0] = {
      id: "spine",
      kind: "generator",
      generator: "terrain.edit@0",
      params: { verb: "ridge", zone: "center" },
    };
    expect(expectDiagnostic(linearWithZone, "BAD_PLACEMENT").fix).toContain('"course"');

    const both = baseDocument();
    const edit = (heightfield(both)["children"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    (edit["params"] as Record<string, unknown>)["zone"] = "center";
    expectDiagnostic(both, "BAD_PLACEMENT");
  });

  it("LOAM-T103 rejects courses with too few or too many waypoints", () => {
    const doc = baseDocument();
    const edit = (heightfield(doc)["children"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    (edit["params"] as Record<string, unknown>)["course"] = [[0.5, 0.5]];
    expectDiagnostic(doc, "BAD_COURSE");

    const tooMany = baseDocument();
    const edit2 = (heightfield(tooMany)["children"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    (edit2["params"] as Record<string, unknown>)["course"] = Array.from({ length: 9 }, (_, i) => [i / 9, 0.5]);
    expectDiagnostic(tooMany, "BAD_COURSE");
  });

  it("LOAM-T104 rejects out-of-range params and knobs from the wrong verb", () => {
    const doc = baseDocument();
    (heightfield(doc)["params"] as Record<string, unknown>)["gain"] = 4;
    expectDiagnostic(doc, "PARAM_OUT_OF_RANGE");

    const wrongKnob = baseDocument();
    const edit = (heightfield(wrongKnob)["children"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    (edit["params"] as Record<string, unknown>)["calderaDepth"] = 12;
    const d = expectDiagnostic(wrongKnob, "PARAM_OUT_OF_RANGE");
    expect(d.message).toContain('not a parameter of verb "ridge"');
  });

  it("LOAM-T106 rejects malformed palettes", () => {
    const doc = baseDocument();
    (doc["style"] as { palettes: Record<string, unknown> }).palettes["ground.surface"] = {
      mix: [["minecraft:dirt", 0]],
    };
    expectDiagnostic(doc, "BAD_PALETTE");

    const wrongShape = baseDocument();
    (wrongShape["style"] as { palettes: Record<string, unknown> }).palettes["ground.surface"] = 42;
    expectDiagnostic(wrongShape, "BAD_PALETTE");
  });

  it("accepts the shipped misty-fjords example", async () => {
    const { readFile } = await import("node:fs/promises");
    const url = new URL("../../../examples/misty-fjords.loam.json", import.meta.url);
    const parsed: unknown = JSON.parse(await readFile(url, "utf8"));
    const { diagnostics, document } = validateTerrainDocument(parsed);
    expect(diagnostics).toEqual([]);
    expect(document?.meta.prompt).toBe("misty fjords with a black-sand coast");
  });
});

describe("G2.5a organic-shape params", () => {
  /** Replace the heightfield's single edit with `params`. */
  function withEdit(params: Record<string, unknown>): Record<string, unknown> {
    const doc = baseDocument();
    (heightfield(doc)["children"] as Record<string, unknown>[])[0] = {
      id: "feature",
      kind: "generator",
      generator: "terrain.edit@0",
      params,
    };
    return doc;
  }

  it("accepts irregularity on radial verbs and meander on corridor verbs", () => {
    for (const params of [
      { verb: "peak", at: [0.5, 0.5], irregularity: 0.3 },
      { verb: "volcano", zone: "north", irregularity: 0 },
      { verb: "island", at: [0.2, 0.2], irregularity: 0.5 },
      { verb: "plateau", at: [0.5, 0.5], irregularity: 0.1 },
      { verb: "basin", at: [0.5, 0.5], irregularity: 0.25, flooded: "never" },
      { verb: "ridge", course: [[0.1, 0.5], [0.9, 0.5]], meander: 1 },
      { verb: "valley", course: [[0.1, 0.5], [0.9, 0.5]], meander: 0, flooded: "auto" },
      { verb: "river", course: [[0.1, 0.5], [0.9, 0.5]], meander: 0.5, flooded: "never" },
    ]) {
      const { diagnostics, document } = validateTerrainDocument(withEdit(params));
      expect(codesOf(diagnostics), JSON.stringify(params)).toEqual([]);
      expect(document).toBeDefined();
    }
  });

  it("range-checks irregularity and meander with a fix hint", () => {
    const tooRound = expectDiagnostic(
      withEdit({ verb: "peak", at: [0.5, 0.5], irregularity: 0.9 }),
      "PARAM_OUT_OF_RANGE",
    );
    expect(tooRound.fix).toBeTruthy();
    expectDiagnostic(
      withEdit({ verb: "river", course: [[0.1, 0.5], [0.9, 0.5]], meander: -1 }),
      "PARAM_OUT_OF_RANGE",
    );
  });

  it("rejects flooded values that are not auto or never", () => {
    const d = expectDiagnostic(
      withEdit({ verb: "river", course: [[0.1, 0.5], [0.9, 0.5]], flooded: "sometimes" }),
      "BAD_ENUM",
    );
    expect(d.fix).toContain("auto");
  });

  it("rejects the params on verbs they do not belong to", () => {
    // meander is a corridor knob; irregularity and flooded are not ridge knobs
    expectDiagnostic(withEdit({ verb: "peak", at: [0.5, 0.5], meander: 0.5 }), "PARAM_OUT_OF_RANGE");
    expectDiagnostic(
      withEdit({ verb: "ridge", course: [[0.1, 0.5], [0.9, 0.5]], irregularity: 0.2 }),
      "PARAM_OUT_OF_RANGE",
    );
    expectDiagnostic(
      withEdit({ verb: "ridge", course: [[0.1, 0.5], [0.9, 0.5]], flooded: "never" }),
      "PARAM_OUT_OF_RANGE",
    );
  });
});
