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

import { describe, expect, it } from "vitest";

import { FORM_PACK_THESES, INTENT_CLASSIFIER_PROMPT } from "@terrainist/agents";
import { FORM_PACKS, formPackById, formPackIds } from "@terrainist/stdlib";

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

  it("tells the model the pack is a default vocabulary and affinity is advice", () => {
    expect(INTENT_CLASSIFIER_PROMPT).toContain("DEFAULT vocabulary");
    expect(INTENT_CLASSIFIER_PROMPT).toContain("Affinity is advice");
  });
});
