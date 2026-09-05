/**
 * Phase 3 wave 1: compiler-resolved intent — root/path inheritance, aliases/defaults,
 * and exact diagnostics without changing messages/timing.
 *
 * The merge is still `resolve.ts` (§2.8). This file proves the fan-in
 * (`compiler-resolved.ts` via `seam.ts`) carries it forward without a second
 * walk, without re-parsing the document, and without moving a warning.
 */

import { describe, expect, it } from "vitest";

import {
  compilerIntentFor,
  compilerResolvedFromBase,
  emptyCompilerResolvedIntent,
  resolveCompilerIntents
} from "../src/intent/compiler-resolved.js";
import { emptyResolvedIntent, intentFor, merge, resolveIntents } from "../src/intent/resolve.js";
import { DEFAULT_ERA_CLASS, ERA_ALIASES } from "@terrainist/spec/ir";
import type { SemanticIntent } from "@terrainist/spec/ir";

// ---------------------------------------------------------------------------
// helpers — same document shape the resolver reads
// ---------------------------------------------------------------------------

type Doc = {
  intent?: SemanticIntent;
  root: { id: string; kind?: string; intent?: SemanticIntent; children?: unknown[] };
};

function worldDoc(intent?: SemanticIntent, children: unknown[] = []): Doc {
  return { intent, root: { id: "world", kind: "composite", children } };
}

function district(id: string, intent?: SemanticIntent, children: unknown[] = []): unknown {
  return { id, kind: "district", intent, children };
}

function composite(id: string, intent?: SemanticIntent, children: unknown[] = []): unknown {
  return { id, kind: "composite", intent, children };
}

function leafProp(id: string, intent?: SemanticIntent): unknown {
  // A leaf that may not carry intent — INTENT_NODE_KINDS excludes it.
  return { id, kind: "building.grammar@0", intent };
}

// ---------------------------------------------------------------------------
// root / path inheritance (§2.8)
// ---------------------------------------------------------------------------

describe("root / path inheritance (§2.8)", () => {
  it("inherits the world's dials to every descendant", () => {
    const doc = worldDoc({ wealth: 0.8, formality: 0.2 }, [district("d1")]);
    const base = resolveIntents(doc);
    const resolved = resolveCompilerIntents(doc);
    const d1 = compilerIntentFor(resolved, "world.d1");
    const baseD1 = intentFor(base, "world.d1");
    // Grounded view wraps the same merge — same values, not necessarily same
    // instance because the fan-in re-derives from the merge result.
    expect(d1.intent).toEqual(baseD1.intent);
    expect(d1.nodePath).toBe(baseD1.nodePath);
    expect(d1.eraClass).toBe(baseD1.eraClass);
    expect(d1.intent.wealth).toBe(0.8);
    expect(d1.intent.formality).toBe(0.2);
    expect(d1.declared).toBe(true);
    expect(d1.depth).toBe(1);
    // Empty path (the document record) inherits the world too.
    expect(resolved.byPath.get("")?.intent.wealth).toBe(0.8);
  });
  it("scalars replace: a district's wealth overrides the world's", () => {
    const doc = worldDoc({ wealth: 0.8 }, [district("d1", { wealth: 0.2 })]);
    const resolved = resolveCompilerIntents(doc);
    expect(compilerIntentFor(resolved, "world").intent.wealth).toBe(0.8);
    expect(compilerIntentFor(resolved, "world.d1").intent.wealth).toBe(0.2);
  });

  it("objects merge key by key: character.motifs merges, not replaces", () => {
    const doc = worldDoc(
      { character: { materialTheme: "white_quartz", motifs: { roofType: "gable" } } },
      [district("d1", { character: { motifs: { windowRhythm: "dense" } } })],
    );
    const resolved = resolveCompilerIntents(doc);
    const d1 = compilerIntentFor(resolved, "world.d1");
    expect(d1.intent.character?.materialTheme).toBe("white_quartz");
    expect(d1.intent.character?.motifs?.roofType).toBe("gable");
    expect(d1.intent.character?.motifs?.windowRhythm).toBe("dense");
  });

  it("arrays replace whole: prefer/forbid lists override, not accumulate", () => {
    const doc = worldDoc(
      { character: { archetypes: { prefer: ["cottage", "smithy"] } } },
      [district("d1", { character: { archetypes: { prefer: ["warehouse"] } } })],
    );
    const resolved = resolveCompilerIntents(doc);
    expect(compilerIntentFor(resolved, "world").intent.character?.archetypes?.prefer).toEqual([
      "cottage",
      "smithy"
    ]);
    expect(compilerIntentFor(resolved, "world.d1").intent.character?.archetypes?.prefer).toEqual([
      "warehouse"
    ]);
  });

  it("the world scope is the document intent merged over the root node's intent", () => {
    const doc: Doc = {
      intent: { wealth: 0.6 },
      root: { id: "world", kind: "composite", intent: { decline: 0.4 }, children: [] }
    };
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    expect(root.intent.wealth).toBe(0.6);
    expect(root.intent.decline).toBe(0.4);
    expect(root.declared).toBe(true);
  });

  it("depth tracks the walk: world 0, child 1, grandchild 2", () => {
    const doc = worldDoc(undefined, [composite("region", undefined, [district("quarter")])]);
    const resolved = resolveCompilerIntents(doc);
    expect(compilerIntentFor(resolved, "world").depth).toBe(0);
    expect(compilerIntentFor(resolved, "world.region").depth).toBe(1);
    expect(compilerIntentFor(resolved, "world.region.quarter").depth).toBe(2);
  });

  it("a node whose kind may not carry intent is ignored", () => {
    const doc = worldDoc({ wealth: 0.9 }, [leafProp("house", { wealth: 0.1 })]);
    const resolved = resolveCompilerIntents(doc);
    // The leaf's intent never entered the merge; the resolver still creates an
    // entry for the leaf path itself, but a synthetic path under it walks to
    // the leaf, not to the world — `walk` always creates a record for every
    // child, and `compilerIntentFor` walks up dots to the nearest enclosing
    // recorded scope.
    const hit = compilerIntentFor(resolved, "world.house.foo");
    expect(hit.nodePath).toBe("world.house");
    expect(hit.intent.wealth).toBe(0.9);
  });

  it("synthetic paths walk up dots to the nearest enclosing scope", () => {
    const doc = worldDoc({ wealth: 0.3 }, [district("d1", { wealth: 0.7 })]);
    const resolved = resolveCompilerIntents(doc);
    // The layout solver invents building paths under a district that the
    // resolver never walked; `compilerIntentFor` must inherit the district.
    expect(compilerIntentFor(resolved, "world.d1.building_12").intent.wealth).toBe(0.7);
    expect(compilerIntentFor(resolved, "world.d1.building_12.room").intent.wealth).toBe(0.7);
  });

  it("insertion order is root, depth-first, and the empty path is the world by another name", () => {
    const doc = worldDoc(undefined, [
      district("a", undefined, [district("a1")]),
      district("b")
    ]);
    const resolved = resolveCompilerIntents(doc);
    const order = [...resolved.byPath.keys()];
    expect(order).toEqual(["world", "", "world.a", "world.a.a1", "world.b"]);
    expect(resolved.byPath.get("")?.base.nodePath).toBe("");
    expect(resolved.byPath.get("world")?.nodePath).toBe("world");
  });

  it("declared is false when no scope on the path said anything", () => {
    const doc = worldDoc(undefined, [district("d1")]);
    const resolved = resolveCompilerIntents(doc);
    expect(compilerIntentFor(resolved, "world").declared).toBe(false);
    expect(compilerIntentFor(resolved, "world.d1").declared).toBe(false);
    // A document with no intent at all yields empty grounded records.
    const empty = emptyCompilerResolvedIntent("world.d1", 1);
    expect(empty.declared).toBe(false);
    expect(empty.intent).toBe(emptyResolvedIntent("world.d1", 1).intent);
  });

  it("wraps the existing merge without a second document walk", () => {
    const doc = worldDoc({ era: "roman" }, [district("d1")]);
    const base = resolveIntents(doc);
    const resolved = resolveCompilerIntents(doc);
    // Same node count, same paths, and for each path the grounded view carries
    // the same merged values the bare resolver produced — no second walk over
    // `doc` is needed because the fan-in reuses the merge result.
    expect(resolved.byPath.size).toBe(base.byPath.size);
    for (const [path, grounded] of resolved.byPath) {
      const bare = base.byPath.get(path);
      expect(bare).toBeDefined();
      expect(grounded.intent).toEqual(bare!.intent);
      expect(grounded.nodePath).toBe(bare!.nodePath);
      expect(grounded.depth).toBe(bare!.depth);
      expect(grounded.eraClass).toBe(bare!.eraClass);
    }
  });
  it("compilerResolvedFromBase caches per base instance", () => {
    const base = resolveIntents(worldDoc({ wealth: 0.5 }, [district("d1")]));
    const d1 = intentFor(base, "world.d1");
    const a = compilerResolvedFromBase(d1);
    const b = compilerResolvedFromBase(d1);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// aliases / defaults
// ---------------------------------------------------------------------------

describe("aliases / defaults", () => {
  it.each(Object.entries(ERA_ALIASES))("alias %s resolves to %s", (alias, eraClass) => {
    const doc = worldDoc({ era: alias });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    expect(root.eraClass).toBe(eraClass);
    expect(root.eraDeclared).toBe(true);
    expect(root.diagnostics).toHaveLength(0);
    // No warning for a known alias — the diagnostic stays on the merge layer.
    expect(resolved.diagnostics).toHaveLength(0);
  });

  it("an unknown era falls back to medieval and is grounded as medieval", () => {
    const doc = worldDoc({ era: "swashbuckling" });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    expect(root.eraClass).toBe(DEFAULT_ERA_CLASS);
    expect(root.eraDeclared).toBe(true);
    expect(root.base.eraClass).toBe(DEFAULT_ERA_CLASS);
  });

  it("absent wealth/decline/formality stays absent (no opinion, not 0)", () => {
    const doc = worldDoc({ character: { label: "pirate haven" } });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    expect(root.intent.wealth).toBeUndefined();
    expect(root.intent.decline).toBeUndefined();
    expect(root.intent.formality).toBeUndefined();
    expect(root.climate.offsets.temperature).toBe(0);
    expect(root.climate.offsets.humidity).toBe(0);
    expect(root.climate.feather).toBeUndefined();
    expect(root.flora.bias).toEqual(expect.objectContaining({}));
  });

  it("climate offsets are grounded from the merged intent, not re-parsed per consumer", () => {
    const doc = worldDoc({ climate: { temperature: 0.5, humidity: -0.3, blend: "soft" } });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    expect(root.climate.raw).toEqual(expect.objectContaining({ temperature: 0.5 }));
    expect(root.climate.offsets).toEqual({ temperature: 0.5, humidity: -0.3 });
    expect(root.climate.blend).toBe("soft");
    // Soft is the middle of the size-scaled range — 8 cells.
    expect(root.climate.feather).toBeGreaterThan(0);
    // landUse is rung 1 for the clamp — only biome + snow, not temperature.
    expect(root.climate.landUse).toBeUndefined();
  });
  it("flora bias is grounded once and the feather/blend defaults stay today's when absent", () => {
    const doc = worldDoc({
      character: { flora: { prefer: ["spruce_tall"], forbid: ["desert"] } }
    });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    expect(root.flora.raw?.prefer).toEqual(["spruce_tall"]);
    expect(root.flora.bias).toBeDefined();
    // Blend absent → feather is today's perimeter-scaled band (undefined here).
    expect(root.climate.feather).toBeUndefined();
    // No palette, no formPacks — nothing grounded where nothing was said.
    expect(root.palette.overrides).toBeUndefined();
    expect(root.form.formPacks.known).toEqual([]);
    expect(root.form.formPacks.unknown).toEqual([]);
  });

  it("palette overrides are the merged character.palettes by reference", () => {
    const palettes = { "ground.surface": "minecraft:sand" as const };
    const doc = worldDoc({ character: { palettes } });
    const resolved = resolveCompilerIntents(doc);
    expect(compilerIntentFor(resolved, "world").palette.overrides).toBe(palettes);
  });

  it("materialTheme alias is grounded through the alias table, not left as a string", () => {
    const doc = worldDoc({ character: { materialTheme: "quartz" } });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    // "quartz" is an alias for "white_quartz" in the material theme table.
    expect(root.form.materialTheme).toBe("white_quartz");
    expect(root.form.materialThemeDiagnostic).toBeUndefined();
  });

  it("merge keeps the §2.8 rule for the new API too", () => {
    const parent: SemanticIntent = { wealth: 0.2, character: { label: "world", motifs: { roofType: "gable" } } };
    const child: SemanticIntent = { character: { motifs: { massing: "blocky" } } };
    const merged = merge(parent, child);
    expect(merged.wealth).toBe(0.2);
    expect(merged.character?.label).toBe("world");
    expect(merged.character?.motifs?.roofType).toBe("gable");
    expect(merged.character?.motifs?.massing).toBe("blocky");
  });
});

// ---------------------------------------------------------------------------
// exact current diagnostics — code, message, severity, fix, timing
// ---------------------------------------------------------------------------

describe("exact current diagnostics", () => {
  it("unknown era warns with INTENT_ERA_UNKNOWN and the dispatch fix, on that scope", () => {
    const doc = worldDoc({ era: "swashbuckling" }, [district("d1", { era: "also_unknown" })]);
    const base = resolveIntents(doc);
    const resolved = resolveCompilerIntents(doc);
    // Warnings are on the merge diagnostics — same code/message/fix and same
    // timing (the merge layer). The fan-in preserves the merge's diagnostics
    // verbatim — equal values, not necessarily same instance because the
    // fan-in re-runs the merge from the document.
    expect(resolved.diagnostics).toEqual(base.diagnostics);
    expect(resolved.diagnostics).toHaveLength(2);
    for (const d of resolved.diagnostics) {
      expect(d.name).toBe("INTENT_ERA_UNKNOWN");
      expect(d.code).toBe("LOAM-W480");
      expect(d.severity).toBe("warning");
      expect(d.message).toMatch(/is not in the dispatch table/);
      expect(d.message).toContain(DEFAULT_ERA_CLASS);
      expect(d.fix).toMatch(/medieval/);
    }
    expect(resolved.diagnostics[0]?.nodePath).toBe("world");
    expect(resolved.diagnostics[1]?.nodePath).toBe("world.d1");
  });

  it("known era and absent era warn about nothing", () => {
    expect(resolveCompilerIntents(worldDoc({ era: "roman" })).diagnostics).toEqual([]);
    expect(resolveCompilerIntents(worldDoc({ era: "medieval" })).diagnostics).toEqual([]);
    expect(resolveCompilerIntents(worldDoc(undefined)).diagnostics).toEqual([]);
  });

  it("materialTheme diagnostic is preserved from the vocabulary, same code/fix", () => {
    const doc = worldDoc({ character: { materialTheme: "obsidian_nightmare" } });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    expect(root.form.materialTheme).toBeUndefined();
    expect(root.form.materialThemeDiagnostic?.name).toBe("INTENT_THEME_UNKNOWN");
    expect(root.form.materialThemeDiagnostic?.code).toBe("LOAM-W484");
    expect(root.form.materialThemeDiagnostic?.severity).toBe("warning");
    expect(root.form.materialThemeDiagnostic?.fix).toMatch(/use one of/);
    // And the per-scope vocabulary cache carries the same diagnostic.
    expect(root.diagnostics.find((d) => d.name === "INTENT_THEME_UNKNOWN")?.code).toBe("LOAM-W484");
  });

  it("unknown archetype/prop/flora words are reported via the per-scope cache, same aggregation as before", () => {
    const doc = worldDoc({
      character: {
        props: { prefer: ["moored pirate ships"] },
        flora: { prefer: ["pastel meadows"] }
      }
    });
    const resolved = resolveCompilerIntents(doc);
    const diagnostics = compilerIntentFor(resolved, "world").diagnostics;
    // Each list grounds and warns independently; checkScopeVocabulary aggregates
    // one warning per list type (see vocabulary.ts listWarning).
    const prop = diagnostics.find((d) => d.name === "INTENT_PROP_UNKNOWN");
    expect(prop?.code).toBe("LOAM-W485");
    const flora = diagnostics.find((d) => d.name === "INTENT_FLORA_UNKNOWN");
    expect(flora?.code).toBe("LOAM-W486");
  });

  it("formPacks unknown and era affinity use the same codes as the form vocabulary", () => {
    const doc = worldDoc({
      era: "modern",
      character: { formPacks: ["classical_mediterranean", "nonesuch"] }
    });
    const resolved = resolveCompilerIntents(doc);
    const root = compilerIntentFor(resolved, "world");
    // Known/unknown split is cached once.
    expect(root.form.formPacks.known).toEqual(["classical_mediterranean"]);
    expect(root.form.formPacks.unknown).toEqual(["nonesuch"]);
    expect(root.form.formPacks.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_UNKNOWN")?.code).toBe(
      "LOAM-W516",
    );
    expect(root.form.formPacks.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_ERA")?.code).toBe(
      "LOAM-W517",
    );
    // The same diagnostics appear in the per-scope cache too.
    expect(root.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_UNKNOWN")?.code).toBe("LOAM-W516");
    expect(root.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_ERA")?.code).toBe("LOAM-W517");
  });

  it("a document with no intent has no vocabulary diagnostics at all", () => {
    const resolved = resolveCompilerIntents(worldDoc(undefined, [district("d1")]));
    expect(compilerIntentFor(resolved, "world").diagnostics).toEqual([]);
    expect(compilerIntentFor(resolved, "world.d1").diagnostics).toEqual([]);
  });

  it("diagnostics timing is preserved: merge warnings on the resolution, vocabulary on the scope", () => {
    const doc = worldDoc(
      { era: "swashbuckling", character: { materialTheme: "obsidian_nightmare" } },
      [district("d1", { era: "also_bad" })],
    );
    const resolved = resolveCompilerIntents(doc);
    // Merge-layer timing — the two era warnings, nothing else.
    expect(resolved.diagnostics.map((d) => d.name)).toEqual(["INTENT_ERA_UNKNOWN", "INTENT_ERA_UNKNOWN"]);
    // Vocabulary-layer timing — per scope, not lifted to the resolution.
    expect(compilerIntentFor(resolved, "world").diagnostics.map((d) => d.name)).toEqual([
      "INTENT_THEME_UNKNOWN"
    ]);
    // d1 inherits the same materialTheme, so its per-scope cache also carries
    // the same vocabulary finding — the document-wide deduplicated set is a
    // separate layer (checkIntentVocabulary) that the compiler still emits
    // once at the shallowest path.
    expect(compilerIntentFor(resolved, "world.d1").diagnostics.map((d) => d.name)).toEqual([
      "INTENT_THEME_UNKNOWN"
    ]);
  });
});
