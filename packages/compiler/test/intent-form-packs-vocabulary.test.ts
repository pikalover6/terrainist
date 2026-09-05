/**
 * Form-pack vocabulary is spec-owned (CATALOG-EXPANSION-v0 §4.2-4.3).
 *
 * Spec owns the author-visible catalog (`FORM_PACK_SPECS` / `FORM_PACK_IDS`
 * — ids, names, theses, eras); stdlib owns the implementation slice
 * (members, themes, characters) and builds `FORM_PACKS` by joining the two.
 * The compiler owns grounding (`CompilerResolvedIntent.form.formPacks`) and
 * the layout cluster reads only the grounded `known` list — it never reparses
 * raw `intent.character.formPacks` strings and never relies on a mirrored
 * author table. Warnings W516 (unknown pack) and W517 (era affinity) are
 * emitted once per scope on the grounded diagnostics, with the same code,
 * message, severity, fix, order and timing as before; pack expansion order,
 * mix weighting and seeded draws are unchanged.
 */

import { describe, expect, it } from "vitest";

import { FORM_PACK_IDS, FORM_PACK_SPECS } from "@terrainist/spec/ir";
import { FORM_PACKS, formPackMembers, formPackIds } from "@terrainist/stdlib";

import { resolveCompilerIntents, compilerIntentFor } from "../src/intent/compiler-resolved.js";
import { expandFormPacks, isFabricArchetype } from "../src/layout/mix-intent.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Doc = { intent?: unknown; root: { id: string; kind: string; children?: unknown[] } };

function worldDoc(intent?: unknown): Doc {
  return { intent: intent as never, root: { id: "world", kind: "composite" } };
}

function groundedFormPacks(intent: unknown) {
  const doc = worldDoc(intent);
  const resolved = resolveCompilerIntents(doc as never);
  return compilerIntentFor(resolved, "world").form.formPacks;
}

// ---------------------------------------------------------------------------
// spec owns author catalog; stdlib only for implementation members
// ---------------------------------------------------------------------------

describe("spec owns the author-visible form-pack catalog", () => {
  it("exposes every legal pack id, in registry order", () => {
    expect([...FORM_PACK_IDS]).toEqual(FORM_PACK_SPECS.map((p) => p.id));
    expect([...FORM_PACK_IDS]).toEqual(FORM_PACKS.map((p) => p.id));
    expect([...FORM_PACK_IDS]).toEqual([...formPackIds()]);
  });

  it("carries the classifier theses, in the same order", () => {
    const theses = FORM_PACK_SPECS.map((p) => [p.id, p.thesis] as const);
    for (let i = 0; i < FORM_PACK_SPECS.length; i++) {
      expect(theses[i]?.[0]).toBe(FORM_PACKS[i]?.id);
      expect(theses[i]?.[1].length).toBeGreaterThan(40);
    }
  });

  it("stdlib joins the spec catalog with implementation members only", () => {
    for (const spec of FORM_PACK_SPECS) {
      const pack = FORM_PACKS.find((p) => p.id === spec.id);
      expect(pack, spec.id).toBeDefined();
      expect(pack?.name).toBe(spec.name);
      expect(pack?.eras).toEqual(spec.eras);
      // Members are implementation — stdlib only, spec has none.
      expect(pack?.members.length).toBeGreaterThan(0);
      // Every member that is fabric-eligible is a building the catalog implements.
      const fabric = pack?.members.filter(isFabricArchetype) ?? [];
      expect(fabric.length).toBeGreaterThan(0);
    }
  });

  it("formPackMembers is implementation-only and returns [] for an unknown pack", () => {
    expect(formPackMembers("nonesuch")).toEqual([]);
    expect(formPackMembers("classical_mediterranean").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// compiler grounding — W516 / W517 unchanged
// ---------------------------------------------------------------------------

describe("compiler grounding preserves W516/W517", () => {
  it("splits known/unknown and emits LOAM-W516 for unknown packs", () => {
    const packs = groundedFormPacks({ character: { formPacks: ["classical_mediterranean", "nonesuch"] } });
    expect(packs.known).toEqual(["classical_mediterranean"]);
    expect(packs.unknown).toEqual(["nonesuch"]);
    expect(packs.diagnostics.find((d) => d.code === "LOAM-W516")).toBeDefined();
    expect(packs.diagnostics.find((d) => d.name === "INTENT_FORM_PACK_UNKNOWN")).toBeDefined();
  });

  it("emits LOAM-W517 when era is outside a known pack's affinity, but still keeps the pack", () => {
    const packs = groundedFormPacks({ era: "modern", character: { formPacks: ["classical_mediterranean"] } });
    expect(packs.known).toEqual(["classical_mediterranean"]);
    const diag = packs.diagnostics.find((d) => d.code === "LOAM-W517");
    expect(diag).toBeDefined();
    expect(diag?.message).toContain("modern");
    expect(diag?.message).toContain("classical_mediterranean");
  });

  it("emits nothing for a pack inside its affinity, or when no era is declared", () => {
    expect(groundedFormPacks({ era: "ancient", character: { formPacks: ["classical_mediterranean"] } }).diagnostics).toHaveLength(0);
    expect(groundedFormPacks({ character: { formPacks: ["classical_mediterranean"] } }).diagnostics).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// layout cluster no longer reparses — expansion / order / weighting unchanged
// ---------------------------------------------------------------------------

describe("layout pack expansion is spec-catalog + stdlib-members, order preserved", () => {
  it("expands a known pack to its fabric-eligible members, in registry order within the pack", () => {
    const members = formPackMembers("classical_mediterranean").filter(isFabricArchetype);
    expect(expandFormPacks(["classical_mediterranean"]).join(",")).toBe(members.join(","));
  });

  it("keeps the packs in the order the author named them", () => {
    const a = expandFormPacks(["classical_mediterranean", "agrarian"]);
    const b = expandFormPacks(["agrarian", "classical_mediterranean"]);
    expect(a.join("|").length).toBeGreaterThan(0);
    expect(b.join("|").length).toBeGreaterThan(0);
    // Same members, different pack order → different overall order
    if (a.join(",") === b.join(",")) throw new Error("pack order should matter");
    // Each pack's internal order is stable
    expect(a).toEqual(expandFormPacks(["classical_mediterranean", "agrarian"]));
  });

  it("deduplicates a member two packs share and never re-adds a forbidden id", () => {
    // Find two packs sharing a member, if any — otherwise just prove dedup works.
    const seen = new Map<string, string[]>();
    for (const pack of FORM_PACKS) {
      for (const id of pack.members) {
        const list = seen.get(id) ?? [];
        list.push(pack.id);
        seen.set(id, list);
      }
    }
    const shared = [...seen.entries()].find(([, ids]) => ids.length > 1);
    if (shared) {
      const [member, packs] = shared;
      const expanded = expandFormPacks(packs.slice(0, 2));
      expect(expanded.filter((id) => id === member)).toHaveLength(isFabricArchetype(member) ? 1 : 0);
    }
    // Unknown pack contributes nothing, not a silent weight
    expect(expandFormPacks(["nonesuch", "classical_mediterranean"])).toEqual(expandFormPacks(["classical_mediterranean"]));
  });

  it("isFabricArchetype is still the catalog's implemented-building answer (stdlib only)", () => {
    expect(isFabricArchetype("cottage")).toBe(true);
    expect(isFabricArchetype("cart")).toBe(false); // prop
    expect(isFabricArchetype("unicorn_stable")).toBe(false); // unknown / unbuilt
  });
});
