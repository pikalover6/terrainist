/**
 * The classifier's form-pack vocabulary against the registry
 * (CATALOG-EXPANSION-v0 §4.3).
 *
 * The pre-pass hand-lists the nine packs with their theses, because
 * `@terrainist/agents` deliberately does not depend on `@terrainist/stdlib` — a
 * classifier talks to the spec, not to the block palettes. The CLI depends on
 * both, so this is the one place the two lists can be held against each other.
 *
 * It matters more here than anywhere else the pattern is used: the classifier's
 * prompt is the *first reachability path* a pack has (§4.3), so a pack in the
 * registry that the prompt never names is a form vocabulary no prompt can
 * reach, and a pack the prompt names that the registry does not carry is a word
 * the model will write and the compiler will warn away.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FORM_PACK_THESES, INTENT_CLASSIFIER_PROMPT } from "@terrainist/agents";
import { FORM_PACKS, STRUCTURE_CATALOG, formPackById, formPackIds } from "@terrainist/stdlib";

describe("the classifier's form packs", () => {
  it("teaches exactly the packs the registry carries, in registry order", () => {
    expect(FORM_PACK_THESES.map(([id]) => id)).toEqual([...formPackIds()]);
  });

  it("teaches a word the grounding registry carries, for every pack", () => {
    // The compiler grounds `formPacks` against this registry, so a word that
    // finds a pack here is a word the compiler will not warn away.
    for (const [id] of FORM_PACK_THESES) expect(formPackById(id)?.id).toBe(id);
  });

  it("gives every pack a thesis, not a label", () => {
    for (const [, thesis] of FORM_PACK_THESES) expect(thesis.length).toBeGreaterThan(40);
  });

  it("names every pack in the prompt the model actually reads", () => {
    for (const pack of FORM_PACKS) expect(INTENT_CLASSIFIER_PROMPT).toContain(pack.id);
    expect(INTENT_CLASSIFIER_PROMPT).toContain('"formPacks"');
  });

  it("carries the Troy sentence — the palette and the forms are two axes", () => {
    expect(INTENT_CLASSIFIER_PROMPT).toContain("sun_clay is the palette");
    expect(INTENT_CLASSIFIER_PROMPT).toContain("classical_mediterranean is the FORMS");
    // …and the worked example writes both, so the lesson is shown, not only told.
    expect(INTENT_CLASSIFIER_PROMPT).toContain(
      'materialTheme sun_clay; formPacks ["classical_mediterranean"]',
    );
  });

  it("routes named antique places to era ancient by name, not by adjective", () => {
    for (const place of ["Troy", "Mycenae", "Athens", "Sparta", "Rome", "Babylon", "Giza"]) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(place);
    }
    expect(INTENT_CLASSIFIER_PROMPT).toContain('are\n  "era": "ancient"');
  });

  it("makes the pack reach the fabric: prefer names the pack's own forms", () => {
    // P3 final walked modern (2026-08-16) with a pack declared and an empty
    // `prefer`, so the classical nouns never won a lot draw. The teaching now
    // says a pack alone is not enough…
    expect(INTENT_CLASSIFIER_PROMPT).toContain('A PACK ON ITS OWN IS NOT ENOUGH');
    expect(INTENT_CLASSIFIER_PROMPT).toContain('"archetypes": { "prefer": [...] }');
    // …and the Troy worked example now writes the list it asks for.
    expect(INTENT_CLASSIFIER_PROMPT).toContain(
      'archetypes prefer ["peristyle_house", "megaron", "stoa",',
    );
    expect(INTENT_CLASSIFIER_PROMPT).toContain('forbid ["townhouse",');
  });

  it("only ever teaches prefer ids the lot draw can actually build", () => {
    // A prop or an infrastructure id in `prefer` is skipped by `pickArchetype`,
    // so every id the teaching recommends must be a fabric building.
    const taught = [
      "peristyle_house",
      "megaron",
      "stoa",
      "peripteral_temple",
      "palaestra",
      "olive_press",
      "gymnasion",
      "odeon",
      "nymphaeum",
      "ship_shed",
      "propylaea",
      "bouleuterion",
      "tholos",
      "sanctuary_treasury",
      "mastaba",
      "hypostyle_hall",
      "mortuary_temple",
      "mudbrick_granary",
      "nilometer",
      "canopic_shrine",
    ];
    for (const id of taught) {
      expect(INTENT_CLASSIFIER_PROMPT).toContain(id);
      const entry = STRUCTURE_CATALOG.find((e) => e.id === id);
      expect(entry, `${id} is not in the catalog`).toBeDefined();
      expect(entry?.kind, `${id} must be a building to be worth preferring`).toBe("building");
    }
    // …and the prompt names the prop/infrastructure trap explicitly.
    expect(INTENT_CLASSIFIER_PROMPT).toContain("Prefer BUILDINGS");
  });

  it("tells the model the pack is a default vocabulary and affinity is advice", () => {
    expect(INTENT_CLASSIFIER_PROMPT).toContain("DEFAULT vocabulary");
    expect(INTENT_CLASSIFIER_PROMPT).toContain("Affinity is advice");
  });
});

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const KIT = readFileSync(path.join(REPO, "docs/kits/settlement-author.md"), "utf8");

describe("the settlement kit's named-place pin", () => {
  it("warns that high density is a mid-rise street wall, not just crowding", () => {
    expect(KIT).toContain('`density: "high"` is a period claim');
    expect(KIT).toContain("A city\nfrom antiquity is `medium` at its densest");
  });

  it("pins era + pack + prefer together, with a worked Troy", () => {
    expect(KIT).toContain("A named historical or mythic place pins three things together");
    expect(KIT).toContain('"formPacks": ["classical_mediterranean"]');
    expect(KIT).toContain('"prefer": ["peristyle_house", "megaron", "stoa", "peripteral_temple",');
    expect(KIT).toContain('"forbid": ["townhouse", "terraced_row", "shop_row", "office"]');
  });

  it("recommends only ids the catalog actually carries, and only buildings", () => {
    const ids = [
      "peristyle_house",
      "megaron",
      "stoa",
      "peripteral_temple",
      "palaestra",
      "olive_press",
      "courtyard_house",
      "hall",
      "mastaba",
      "hypostyle_hall",
      "mortuary_temple",
      "mudbrick_granary",
      "nilometer",
      "canopic_shrine",
    ];
    for (const id of ids) {
      expect(KIT, `${id} should be taught`).toContain(id);
      expect(STRUCTURE_CATALOG.find((e) => e.id === id)?.kind, id).toBe("building");
    }
    expect(KIT).toContain("**buildings only**");
  });
});
