/**
 * The classifier's **material theme** vocabulary against the real registry.
 *
 * The twin of `intent-flora-vocabulary.test.ts`, and it exists for the same
 * reason: `@terrainist/agents` hand-lists the theme ids because a classifier
 * talks to the *spec*, not to the block palettes, and the CLI is the one
 * package that depends on both the classifier and `@terrainist/stdlib`'s
 * theme table. Without this file the two lists can only drift.
 *
 * ## The failure mode it closes
 *
 * A theme is not one table, it is five: the stdlib theme itself, the street
 * materials, the ground roles, the classifier's list and the kit doc's row.
 * A theme added to some of them and not the others does not fail — it
 * *degrades*, silently, into whatever the missing table's fallback is (the
 * modern grey set, or a theme id no prompt can ever reach). So every one of
 * those tables is asserted to name every theme, here or in
 * `compiler/test/{ground-roles,terrain}.test.ts`, and a sixth theme with a
 * missing row is a red test rather than a grey town.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { INTENT_CLASSIFIER_PROMPT, MATERIAL_THEME_IDS } from "@terrainist/agents";
import { ALL_MATERIAL_THEMES } from "@terrainist/stdlib";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const KIT = readFileSync(path.join(REPO, "docs/kits/settlement-author.md"), "utf8");

describe("the classifier's material themes", () => {
  it("lists exactly the themes the registry carries, in the registry's order", () => {
    expect([...MATERIAL_THEME_IDS]).toEqual(ALL_MATERIAL_THEMES.map((t) => t.id));
  });

  it("teaches every one of them in the prompt", () => {
    for (const id of MATERIAL_THEME_IDS) {
      expect(INTENT_CLASSIFIER_PROMPT, id).toContain(id);
    }
  });

  it("names every one of them in the settlement kit the author reads", () => {
    // The kit is what a *model* is shown; a theme the registry has and the kit
    // does not is a palette no generated world can ask for.
    for (const id of ALL_MATERIAL_THEMES.map((t) => t.id)) {
      expect(KIT, id).toContain(id);
    }
  });

  it("keeps the antiquity palette distinct from the prestige one", () => {
    // The gap `sun_clay` was added to close, stated as a property: there is a
    // theme for ordinary antiquity, it is not the quartz one, and the prompt
    // says which is which. A future edit that folds the two together — or that
    // teaches white_quartz as the answer for "ancient" — fails here.
    expect(MATERIAL_THEME_IDS).toContain("sun_clay");
    expect(INTENT_CLASSIFIER_PROMPT).toMatch(/sun_clay is THE ANCIENT MEDITERRANEAN AND THE DESERT/);
    expect(INTENT_CLASSIFIER_PROMPT).toMatch(/ORDINARY\s+antiquity, not a prestige palette/);
  });
});
