/**
 * Theme and form vocabulary — spec is the single owner.
 *
 * The structure cluster used to hand-copy the material-theme and form-pack
 * catalogs (`materialThemeIds()` wrapping `ALL_MATERIAL_THEMES`, `formPackIds()`
 * wrapping stdlib) and re-ground every free string inside its own fan-out rows
 * and its late `checkIntentVocabulary` walk. Phase 3 makes the spec the single
 * source for `MATERIAL_THEME_IDS` / `FORM_PACK_SPECS` and the compiler the
 * single resolver via `CompilerResolvedIntent`; stdlib keeps the implementation
 * (`ALL_MATERIAL_THEMES`, `FORM_PACKS` joined from the spec) and the palette
 * derivation.
 *
 * These tests pin the cutover:
 * - the spec catalogs are the canonical order,
 * - stdlib's implementation follows them,
 * - the compiler's grounded view preserves the exact diagnostic codes/messages,
 * - the structure fan-out rows consume the grounded ids rather than re-parsing.
 */

import { describe, expect, it } from "vitest";

import { FORM_PACK_IDS, MATERIAL_THEME_IDS } from "@terrainist/spec/ir";
import { ALL_MATERIAL_THEMES, FORM_PACKS } from "@terrainist/stdlib";

import { compilerIntentFor, resolveCompilerIntents } from "../src/intent/compiler-resolved.js";

function worldDoc(intent?: unknown, children: unknown[] = []): unknown {
  return {
    ...(intent === undefined ? {} : { intent: intent as never }),
    root: { id: "world", kind: "composite", children }
  } as unknown as never;
}

describe("spec is the single owner for theme/form catalogs", () => {
  it("MATERIAL_THEME_IDS is the canonical order and stdlib follows it", () => {
    expect([...MATERIAL_THEME_IDS]).toEqual(ALL_MATERIAL_THEMES.map((t) => t.id));
  });

  it("FORM_PACK_IDS is the canonical order and stdlib follows it", () => {
    expect([...FORM_PACK_IDS]).toEqual(FORM_PACKS.map((p) => p.id));
  });
});

describe("compiler-resolved theme/form grounding preserves diagnostics", () => {
  it("unknown materialTheme warns with LOAM-W484, same message as vocabulary", () => {
    const doc = worldDoc({ character: { materialTheme: "obsidian_nightmare" } });
    const resolved = resolveCompilerIntents(doc as never);
    const root = compilerIntentFor(resolved, "world");
    expect(root.form.materialTheme).toBeUndefined();
    const diag = root.form.materialThemeDiagnostic ?? root.diagnostics.find((d) => d.name === "INTENT_THEME_UNKNOWN");
    expect(diag?.code).toBe("LOAM-W484");
    expect(diag?.name).toBe("INTENT_THEME_UNKNOWN");
    expect(diag?.fix).toContain(MATERIAL_THEME_IDS[0] as string);
  });

  it("known materialTheme grounds and the structure theme row would consume it", () => {
    const doc = worldDoc({ character: { materialTheme: "sun_clay" } });
    const root = compilerIntentFor(resolveCompilerIntents(doc as never), "world");
    expect(root.form.materialTheme).toBe("sun_clay");
    expect(root.diagnostics.find((d) => d.name === "INTENT_THEME_UNKNOWN")).toBeUndefined();
  });

  it("unknown formPacks warn with LOAM-W516 and era affinity with LOAM-W517", () => {
    const doc = worldDoc({ era: "modern", character: { formPacks: ["classical_mediterranean", "nonesuch"] } });
    const root = compilerIntentFor(resolveCompilerIntents(doc as never), "world");
    expect(root.form.formPacks.known).toEqual(["classical_mediterranean"]);
    expect(root.form.formPacks.unknown).toEqual(["nonesuch"]);
    expect(root.form.formPacks.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_UNKNOWN")?.code).toBe("LOAM-W516");
    expect(root.form.formPacks.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_ERA")?.code).toBe("LOAM-W517");
    // same diagnostics are on the per-scope cache
    expect(root.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_UNKNOWN")?.code).toBe("LOAM-W516");
  });

});

describe("farm climate is read from the grounded intent", () => {
  it("warm biome and temperature are visible on the grounded climate", () => {
    const doc = worldDoc({ climate: { biome: "desert", temperature: 0.9 } });
    const root = compilerIntentFor(resolveCompilerIntents(doc as never), "world");
    expect(root.climate.biome).toBe("desert");
    expect(root.climate.temperature).toBe(0.9);
  });

  it("cold biome is visible on the grounded climate", () => {
    const doc = worldDoc({ climate: { biome: "snowy_tundra", temperature: -0.9 } });
    const root = compilerIntentFor(resolveCompilerIntents(doc as never), "world");
    expect(root.climate.biome).toBe("snowy_tundra");
    expect(root.climate.temperature).toBe(-0.9);
  });
});
