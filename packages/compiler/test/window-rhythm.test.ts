/**
 * `grammar.windowRhythm` — the motif that had nowhere to land.
 *
 * ## The defect
 *
 * `intent.character.motifs.windowRhythm` validated, resolved, and was read by
 * nobody: no fan-out row consumed it, so Troy (P3 c5) — which asks for
 * `windowRhythm: "sparse"` — compiled every facade and every terrace bay on the
 * grammar's own `regular` grid. A dial the author turns and the world ignores is
 * the failure this project names by name.
 *
 * ## What is pinned here
 *
 * 1. The row exists under the id the structure pass calls, declares what it
 *    reads, and is **total**: no motif is `ctx.today`, which is the byte-identity
 *    argument for every document that never mentions windows.
 * 2. Every value of the spec's `WINDOW_RHYTHMS` passes through the row
 *    unchanged — the vocabulary is the spec's, not a private one.
 * 3. In a compiled world the resolved rhythm reaches **both** building paths:
 *    the per-lot infill house and the terrace street wall.
 * 4. A world with no `intent` compiles the same facades it always did.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WINDOW_RHYTHMS } from "@terrainist/spec";

import { fanOut, fanOutRow, installFanOutRows, intentFor, resolveIntents } from "../src/intent/index.js";
import { STRUCTURE_ROWS } from "../src/structures/themes-intent.js";
import type { StructurePassResult } from "../src/structures/index.js";
import { compileTerrain } from "../src/terrain/compile.js";

beforeAll(() => {
  installFanOutRows();
});

const ROW = "grammar.windowRhythm";

function scope(intent: unknown) {
  return intentFor(resolveIntents({ intent: intent as never, root: { id: "world" } }), "world");
}

function rhythm(intent: unknown, today: string | undefined = undefined): string | undefined {
  return fanOut<string | undefined>(ROW, scope(intent), { nodePath: "world", today });
}

/* -------------------------------------------------------------------------- */
/* the row                                                                     */
/* -------------------------------------------------------------------------- */

describe("the row", () => {
  it("is registered under exactly the id the structure pass calls", () => {
    expect(fanOutRow(ROW)).toBeDefined();
    expect(STRUCTURE_ROWS.windowRhythm).toBe(ROW);
  });

  it("declares what it reads, for the registry dump", () => {
    // `era` joined `character` on 2026-08-19: the row grew a last rung that
    // fills the hole an era-blind `"regular"` default used to fill. See
    // `RHYTHM_BY_ERA` in themes-intent.ts and the Troy block below.
    expect(fanOutRow(ROW)?.reads).toEqual(["era", "character"]);
    expect(fanOutRow(ROW)?.status).toBe("today");
    expect((fanOutRow(ROW)?.drives ?? "").length).toBeGreaterThan(20);
  });
});

describe("grammar.windowRhythm is total", () => {
  it("has no opinion for an intent that declares nothing", () => {
    expect(rhythm(undefined)).toBeUndefined();
    expect(rhythm(undefined, "paired")).toBe("paired");
  });

  it("has no opinion for an intent that declares every dial but this motif", () => {
    const busy = {
      wealth: 0.9,
      formality: 0.8,
      decline: 0.3,
      character: { label: "old town", urbanForm: "grown", motifs: { roofType: "flat", ornamentDensity: 0.3 } },
    };
    expect(rhythm(busy)).toBeUndefined();
    expect(rhythm(busy, "dense")).toBe("dense");
  });

  /* ---------------------------------------------------------------------- */
  /* the era hole-filler — the Troy "modern houses" defect, 2026-08-19        */
  /* ---------------------------------------------------------------------- */

  it("fills a pre-modern facade's empty rhythm rather than leaving it the modern grid", () => {
    // Nothing else spoke: no node param, no archetype identity. Before this
    // rung the grammar's own default `"regular"` — an evenly spaced grid on
    // every storey, the strongest modern tell a wall has — landed on a Bronze
    // Age citadel. Now the era answers.
    expect(rhythm({ era: "ancient" })).toBe("sparse");
    expect(rhythm({ era: "bronze age" })).toBe("sparse");
    expect(rhythm({ era: "medieval" })).toBe("sparse");
    expect(rhythm({ era: "stone age" })).toBe("none");
  });

  it("leaves every era from the Renaissance on exactly where it was", () => {
    // The regular grid *is* their answer, so the row stays silent and those
    // documents are byte-identical, not merely equivalent.
    for (const era of ["renaissance", "industrial", "modern", "far future"]) {
      expect(rhythm({ era })).toBeUndefined();
      expect(rhythm({ era }, "dense")).toBe("dense");
    }
  });

  it("never speaks over the node or the archetype, in any era", () => {
    // `today` is the node's own param, else the archetype's intrinsic facade.
    // A church keeps its bay lights in 1200 BC exactly as in 1900.
    expect(rhythm({ era: "ancient" }, "regular")).toBe("regular");
    expect(rhythm({ era: "ancient" }, "dense")).toBe("dense");
  });

  it("lets the author's motif beat the era, so a deliberate combination stands", () => {
    // A modern quarter inside an ancient city is legal and must stay sayable:
    // the motif is intent, the era table is only a default.
    expect(rhythm({ era: "ancient", character: { motifs: { windowRhythm: "regular" } } })).toBe("regular");
    expect(rhythm({ era: "ancient", character: { motifs: { windowRhythm: "dense" } } }, "none")).toBe("dense");
  });

  it("speaks the spec's vocabulary and nothing else", () => {
    for (const value of WINDOW_RHYTHMS) {
      expect(rhythm({ character: { motifs: { windowRhythm: value } } })).toBe(value);
      // And it outranks whatever the node itself said, exactly as roofForm does.
      expect(rhythm({ character: { motifs: { windowRhythm: value } } }, "paired")).toBe(value);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* a compiled world — the two building paths                                   */
/* -------------------------------------------------------------------------- */

function doc(intent: unknown): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "window_rhythm_fixture", worldSeed: 20260812 },
    ...(intent === undefined ? {} : { intent }),
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 4, baseHeight: 76, seaLevel: 62, octaves: 3, frequency: 0.004 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [200, 200] },
          params: { fabric: "grid", density: "high", blockSize: 60, mix: ["cottage", "hall", "shop_row"] },
          constraints: [
            { zone: "center" },
            { terrain_conform: "flatten", reference: "median", blend: 6 },
          ],
        },
      ],
    },
  };
}

/** One compiled building, reduced to the two facts this file is about. */
interface Facade {
  readonly archetype: string;
  readonly rhythm: string | undefined;
}

/** Every building a compile produced, split by which path built it. */
interface Facades {
  readonly infill: readonly Facade[];
  readonly terrace: readonly Facade[];
}

describe("a compiled quarter", () => {
  let root: string;
  const built = new Map<string, Facades>();

  async function compile(key: string, intent: unknown): Promise<Facades> {
    const cached = built.get(key);
    if (cached !== undefined) return cached;
    const out = path.join(root, key);
    const compiled = await compileTerrain(doc(intent), { outDir: out });
    if (!compiled.ok) {
      throw new Error(compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; "));
    }
    const structures = compiled.report.layout?.structures as StructurePassResult;
    const infill: Facade[] = [];
    const terrace: Facade[] = [];
    for (const b of structures.buildings) {
      const facade: Facade = {
        archetype: String(b.meta.params.archetype),
        rhythm: b.meta.params.windowRhythm as string | undefined,
      };
      (b.nodePath.includes(".terrace_") ? terrace : infill).push(facade);
    }
    const facades: Facades = { infill, terrace };
    built.set(key, facades);
    return facades;
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "terrainist-window-rhythm-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** The rhythms one archetype came out with, in build order. */
  function of(f: Facades, archetype: string): (string | undefined)[] {
    return [...f.infill, ...f.terrace].filter((b) => b.archetype === archetype).map((b) => b.rhythm);
  }

  it("builds all three cases in the fixture, so the assertions below mean something", async () => {
    const plain = await compile("plain", undefined);
    // A cottage and a hall (no intrinsic facade), a shop row (one of
    // its own), and the terrace street wall — the three cases the row treats
    // differently.
    expect(of(plain, "cottage").length + of(plain, "hall").length).toBeGreaterThan(0);
    expect(of(plain, "shop_row").length).toBeGreaterThan(0);
    expect(plain.terrace.length).toBeGreaterThan(0);
  }, 240_000);

  it("leaves a document with no intent exactly where it was", async () => {
    // Identity: with nothing declared the row hands `ctx.today` straight back,
    // so a cottage is on the grammar's own `regular` grid, the shop row
    // keeps the dense glazing its archetype asks for, and the street wall is
    // exactly the wall it always built.
    const plain = await compile("plain", undefined);
    for (const got of of(plain, "cottage")) expect(got).toBe("regular");
    for (const got of of(plain, "shop_row")) expect(got).toBe("dense");
    for (const got of plain.terrace) expect(got.rhythm).toBe("regular");
    const again = await compile("plain2", undefined);
    expect(again.infill).toEqual(plain.infill);
    expect(again.terrace).toEqual(plain.terrace);
  }, 240_000);

  it("carries each declared rhythm to the terrace street wall and to plain infill", async () => {
    for (const value of ["sparse", "dense", "banded"] as const) {
      const laid = await compile(value, { character: { motifs: { windowRhythm: value } } });
      // The street wall is what Troy's walk saw: every terrace, no exceptions,
      // because `terrace` has no intrinsic facade of its own. `banded` is spec
      // vocabulary the grammar has not written, and collapses to `regular`
      // rather than throwing or leaving a wall blank.
      const want = value === "banded" ? "regular" : value;
      expect(laid.terrace.length).toBeGreaterThan(0);
      for (const got of laid.terrace) expect(got.rhythm).toBe(want);
      // And the houses that stated nothing now state it.
      const houses = [...of(laid, "cottage"), ...of(laid, "hall")];
      expect(houses.length).toBeGreaterThan(0);
      for (const got of houses) expect(got).toBe(want);
    }
  }, 480_000);

  it("leaves an archetype's own facade alone: a motif never glazes a blank wall", async () => {
    // `archetypeFacadeDefaults` is character, not a hole for the settlement to
    // fill: a shop row's dense glazing survives a `sparse` town.
    const laid = await compile("sparse", { character: { motifs: { windowRhythm: "sparse" } } });
    const shops = of(laid, "shop_row");
    expect(shops.length).toBeGreaterThan(0);
    for (const got of shops) expect(got).toBe("dense");
  }, 240_000);
}, 900_000);
