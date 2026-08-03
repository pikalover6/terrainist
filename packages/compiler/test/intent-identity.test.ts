/**
 * The intent layer's acceptance test: **defaults are identity**.
 *
 * Fan-out law 2 says every row is total — a row must answer for an intent that
 * declares nothing, and the answer must be the value the code produces today.
 * The consequence is the claim this file exists to hold: *a document with no
 * `intent` compiles byte-identically whether the intent machinery is in the
 * path or not.*
 *
 * The proof compiles one real example twice:
 *
 * 1. **With** the registry installed — the shipped configuration, every row
 *    live, each one handed today's value and expected to hand it back.
 * 2. **Without** — the registry cleared, which makes `fanOut` the identity
 *    function and therefore takes the layer out of the path entirely.
 *
 * Both runs stop at `skipEmit` and hash the finished pipeline output: the
 * column plan's arrays, every tree, every decoration and every structure block.
 * That is strictly more than the emitted region files carry, so equal hashes
 * here imply equal worlds on disk.
 */

import { createHash } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { compileTerrain, type CompileArtifacts } from "../src/terrain/compile.js";
import { clearFanOut, fanOutRows, installFanOutRows } from "../src/intent/index.js";
import { resolveIntents, intentFor, merge } from "../src/intent/resolve.js";

/**
 * A settlement small enough to compile in a test and large enough to exercise
 * every row that is wired: a district (block size, density, fabric, streets),
 * buildings (material theme, roof form) and roads (wear).
 */
function document(intent?: unknown): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "identity_dale", worldSeed: 4242 },
    ...(intent === undefined ? {} : { intent }),
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [192, 192] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 18, seaLevel: 63, baseHeight: 70, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [96, 96] },
          constraints: [{ zone: "center" }],
          params: { fabric: "grid", density: "medium", mix: ["cottage", "workshop"] },
        },
      ],
    },
  };
}

/** Everything the pipeline produced, as one hash. */
function hashArtifacts(a: CompileArtifacts): string {
  const h = createHash("sha256");
  const { plan } = a;
  h.update(`region ${plan.region.x0} ${plan.region.z0} ${plan.region.width} ${plan.region.depth}\n`);
  for (const [name, array] of [
    ["ground", plan.ground],
    ["snow", plan.snow],
  ] as const) {
    h.update(name);
    h.update(Buffer.from(Uint8Array.from(array as ArrayLike<number>)));
  }
  for (const tree of a.trees) h.update(`t ${JSON.stringify(tree)}\n`);
  for (const decor of a.decor) h.update(`d ${JSON.stringify(decor)}\n`);
  for (const block of a.structures ?? []) h.update(`s ${JSON.stringify(block)}\n`);
  h.update(`spawn ${a.spawn.x},${a.spawn.y},${a.spawn.z}`);
  return h.digest("hex");
}

async function compileOnce(doc: Record<string, unknown>): Promise<{
  hash: string;
  diagnostics: readonly { code: string }[];
}> {
  let hash = "";
  const result = await compileTerrain(doc, {
    outDir: "/dev/null/never-written",
    skipEmit: true,
    onArtifacts: (artifacts) => {
      hash = hashArtifacts(artifacts);
    },
  });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  }
  return { hash, diagnostics: result.report.diagnostics };
}

afterAll(() => {
  // Whatever this file did to the registry, the process gets it back.
  installFanOutRows();
});

describe("fan-out law 2 — every row is total", () => {
  it("answers an intent that declares nothing with today's value, for every row", () => {
    installFanOutRows();
    const nothing = intentFor(resolveIntents({ root: { id: "world" } }), "world");
    expect(nothing.declared).toBe(false);
    const sentinel = Symbol("today");
    for (const row of fanOutRows()) {
      const answer = row.resolve(nothing, {
        nodePath: "world",
        today: sentinel as never,
      });
      expect(answer, `row ${row.id} is not total`).toBe(sentinel);
    }
  });

  it("registers every reserved row with the phase that will implement it", () => {
    installFanOutRows();
    for (const row of fanOutRows().filter((r) => r.status === "reserved")) {
      expect(row.phase, `reserved row ${row.id} names no phase`).toBeTruthy();
    }
    expect(fanOutRows().some((r) => r.status === "today")).toBe(true);
  });
});

describe("byte identity", () => {
  it("compiles a document with no intent identically with and without the layer", async () => {
    installFanOutRows();
    const withLayer = await compileOnce(document());

    clearFanOut();
    expect(fanOutRows()).toEqual([]);
    const withoutLayer = await compileOnce(document());

    installFanOutRows();
    expect(withLayer.hash).toBe(withoutLayer.hash);
    expect(withLayer.hash).not.toBe("");
  }, 180_000);

  it("emits no intent diagnostics for a document that declares none", async () => {
    installFanOutRows();
    const { diagnostics } = await compileOnce(document());
    expect(diagnostics.filter((d) => d.code.startsWith("LOAM-W48"))).toEqual([]);
  }, 180_000);
});

describe("inheritance (§2.8)", () => {
  const doc = {
    intent: {
      era: "medieval",
      wealth: 0.5,
      character: { materialTheme: "temperate_timber", archetypes: { prefer: ["cottage"] } },
    },
    root: {
      id: "world",
      kind: "composite",
      children: [
        {
          id: "isle",
          kind: "composite",
          intent: {
            wealth: 0.9,
            character: { label: "unicorn glade", archetypes: { prefer: ["chapel"] } },
          },
          children: [
            { id: "quarter", kind: "district", params: {} },
            { id: "house", kind: "generator", generator: "building.grammar@0" },
          ],
        },
      ],
    },
  };

  it("replaces scalars, merges objects and replaces arrays whole", () => {
    const resolved = resolveIntents(doc);
    const isle = intentFor(resolved, "world.isle");
    expect(isle.intent.wealth).toBe(0.9);
    expect(isle.intent.era).toBe("medieval");
    // Object merged key by key: the world's theme survived the child's label.
    expect(isle.intent.character?.materialTheme).toBe("temperate_timber");
    expect(isle.intent.character?.label).toBe("unicorn glade");
    // Array replaced whole — accumulating makes "no oak here" unexpressible.
    expect(isle.intent.character?.archetypes?.prefer).toEqual(["chapel"]);
  });

  it("hands a leaf node its nearest enclosing scope", () => {
    const resolved = resolveIntents(doc);
    // A leaf carries no intent of its own, and a synthetic path the solver
    // invented under it still resolves to the region that encloses it.
    expect(intentFor(resolved, "world.isle.house").intent.wealth).toBe(0.9);
    expect(intentFor(resolved, "world.isle.quarter.infill_7").intent.wealth).toBe(0.9);
    expect(intentFor(resolved, "world").intent.wealth).toBe(0.5);
  });

  it("dispatches an unknown era to medieval and says so", () => {
    const resolved = resolveIntents({ intent: { era: "hyperbaroque" }, root: { id: "world" } });
    expect(resolved.root.eraClass).toBe("medieval");
    expect(resolved.diagnostics.map((d) => d.code)).toContain("LOAM-W480");
  });

  it("merges two intents outside any tree", () => {
    expect(merge({ wealth: 0.2, era: "modern" }, { wealth: 0.8 })).toEqual({
      era: "modern",
      wealth: 0.8,
    });
  });
});
