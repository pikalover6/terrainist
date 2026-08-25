/**
 * Candidate-menu tests.
 *
 * The menu is context injected into an expensive call, so the properties that
 * matter are the ones a reader of the prompt cannot check: that every id on it
 * names something a generator answers *today*, that the same request produces
 * the same bytes, and that the two failures the model-behavior audit measured —
 * a named pack that never reaches its members, and `acropolis_terrace` used
 * zero times in ten Troy rolls — are structurally impossible once the menu is
 * on.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  DEFAULT_MENU_ENTRIES,
  FORM_PACKS,
  INFRA_ENTRY_IDS,
  NON_NODE_IMPLEMENTED,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  buildCandidateMenu,
  candidateMenuForIntent,
  structureById,
} from "../src/index.js";

/** The same live-registry set `catalog.test.ts` holds the catalog against. */
const REAL_GENERATORS = new Set<string>([
  ...BUILDING_ARCHETYPES,
  ...PROP_NAMES,
  ...NON_NODE_IMPLEMENTED,
  ...INFRA_ENTRY_IDS,
]);

const troy = { era: "classical", formPacks: ["classical_mediterranean"] };
const pirate = { era: "renaissance", formPacks: ["nautical_pirate"] };

describe("the candidate menu", () => {
  it("shows only ids a generator answers today", () => {
    for (const request of [troy, pirate, { era: "medieval" }, { era: "far_future" }]) {
      const menu = buildCandidateMenu(request);
      expect(menu.ids.length, JSON.stringify(request)).toBeGreaterThan(0);
      for (const id of menu.ids) {
        expect(structureById(id)?.status, id).toBe("implemented");
        expect(REAL_GENERATORS.has(id), `${id} names no live generator`).toBe(true);
      }
    }
  });

  it("never shows an unbuilt entry, whatever the prompt asks for", () => {
    const unbuilt = new Set(
      STRUCTURE_CATALOG.filter((entry) => entry.status !== "implemented").map((e) => e.id),
    );
    expect(unbuilt.size).toBeGreaterThan(0);
    for (const pack of FORM_PACKS) {
      const menu = buildCandidateMenu({ era: pack.eras[0] ?? "", formPacks: [pack.id] });
      for (const id of menu.ids) expect(unbuilt.has(id), id).toBe(false);
    }
  });

  it("opens the unbuilt half only when a caller asks for it by name", () => {
    const closed = buildCandidateMenu({ ...troy });
    const opened = buildCandidateMenu({ ...troy, statuses: ["implemented", "not_started"] });
    expect(opened.ids.length).toBeGreaterThanOrEqual(closed.ids.length);
    const arcane = buildCandidateMenu({
      formPacks: ["arcane_magical"],
      statuses: ["not_started"],
    });
    expect(arcane.ids.length).toBeGreaterThan(0);
    for (const id of arcane.ids) expect(structureById(id)?.status).toBe("not_started");
  });

  it("is deterministic — the same request is the same bytes", () => {
    for (const request of [troy, pirate, {}]) {
      expect(buildCandidateMenu(request).text).toBe(buildCandidateMenu(request).text);
      expect(buildCandidateMenu(request).ids).toEqual(buildCandidateMenu(request).ids);
    }
  });

  it("spends a named pack whole before it spends anything else", () => {
    const menu = buildCandidateMenu(troy);
    const pack = FORM_PACKS.find((p) => p.id === "classical_mediterranean");
    const implemented = (pack?.members ?? []).filter(
      (id) => structureById(id)?.status === "implemented",
    );
    expect(implemented.length).toBeGreaterThan(0);
    for (const id of implemented) expect(menu.ids, id).toContain(id);
    // Unrationed means first, too: the pack occupies the head of the menu.
    expect(menu.ids.slice(0, implemented.length).slice().sort()).toEqual(
      implemented.slice().sort(),
    );
  });

  it("surfaces acropolis_terrace for a Troy prompt — the audit's zero", () => {
    const menu = candidateMenuForIntent({
      era: "classical",
      character: { formPacks: ["classical_mediterranean"] },
    });
    expect(menu.ids).toContain("acropolis_terrace");
    expect(menu.text).toContain("acropolis_terrace");
    // And the megaron the citadel question is really about.
    expect(menu.ids).toContain("megaron");
  });

  it("surfaces nautical_pirate members for a pirate prompt — 0/20 today", () => {
    const menu = candidateMenuForIntent({
      era: "renaissance",
      character: { formPacks: ["nautical_pirate"] },
    });
    const pack = FORM_PACKS.find((p) => p.id === "nautical_pirate");
    const implemented = (pack?.members ?? []).filter(
      (id) => structureById(id)?.status === "implemented",
    );
    for (const id of implemented) expect(menu.ids, id).toContain(id);
    expect(menu.text).toContain("jolly_roger_mast");
  });

  it("rations the era tier round-robin, so one pack cannot eat the budget", () => {
    // Ancient pulls six affine packs; a pack-by-pack fill would show one or two.
    const menu = buildCandidateMenu({ era: "ancient" });
    const packs = new Set(
      menu.entries.filter((entry) => entry.source === "era").map((entry) => entry.pack),
    );
    expect(packs.size).toBeGreaterThanOrEqual(4);
  });

  it("respects the entry budget and reports its own size", () => {
    const menu = buildCandidateMenu({ ...troy });
    expect(menu.entries.length).toBeLessThanOrEqual(DEFAULT_MENU_ENTRIES);
    expect(menu.chars).toBe(menu.text.length);
    expect(menu.estimatedTokens).toBe(Math.round(menu.text.length / 4));
    const small = buildCandidateMenu({ ...troy, maxEntries: 7 });
    expect(small.entries.length).toBe(7);
    expect(small.chars).toBeLessThan(menu.chars);
  });

  it("keeps every blurb inside its budget", () => {
    const menu = buildCandidateMenu({ ...troy, blurbChars: 60 });
    for (const entry of menu.entries) expect(entry.blurb.length, entry.id).toBeLessThanOrEqual(61);
  });

  it("answers an unclassifiable prompt with an empty menu, not an error", () => {
    for (const request of [{}, { era: "" }, { formPacks: ["no_such_pack"] }, { maxEntries: 0 }]) {
      const menu = buildCandidateMenu(request);
      expect(menu.entries, JSON.stringify(request)).toEqual([]);
      expect(menu.text).toBe("");
      expect(menu.estimatedTokens).toBe(0);
    }
    expect(candidateMenuForIntent(undefined).text).toBe("");
    // An unknown pack beside a known one must not take the known one down.
    expect(buildCandidateMenu({ formPacks: ["no_such_pack", "nile_egypt"] }).ids).toContain(
      "pylon_gate",
    );
  });

  it("renders a table a model can read, with the era and the pack named", () => {
    const menu = buildCandidateMenu(troy);
    expect(menu.text).toContain("CANDIDATE STRUCTURES");
    expect(menu.text).toContain("Classical Mediterranean");
    expect(menu.text).toContain("the ancient era");
    expect(menu.packs).toEqual(["classical_mediterranean"]);
    expect(menu.eraClass).toBe("ancient");
    // The whole point of the exercise: it is small next to the 70k-token kit.
    expect(menu.estimatedTokens).toBeLessThan(3000);
  });
});
