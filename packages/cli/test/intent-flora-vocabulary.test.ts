/**
 * The classifier's flora vocabulary against the compiler's (FLORA-GRAMMAR-v0
 * §6.1, WP-D).
 *
 * The pre-pass hand-lists the nine character keywords and the nine shape
 * programs, because `@terrainist/agents` deliberately does not depend on
 * `@terrainist/compiler` — a classifier talks to the spec, not to the
 * scatterer. The CLI depends on both, so this is the one place the two lists
 * can be held against each other.
 *
 * Why it matters, and it is the `INTENT_GROUND_UNKNOWN` lesson aword
 * the classifier is taught but the compiler does not ground is a dial that
 * reports success and changes nothing, and a word the compiler grounds but the
 * classifier is never shown is a feature no prompt can reach.
 */

import { describe, expect, it } from "vitest";

import {
  FANTASY_FLORA_IDS,
  FLORA_CHARACTER_WORDS,
  FLORA_PROGRAM_WORDS,
  INTENT_CLASSIFIER_PROMPT
} from "@terrainist/agents";
import {
  FLORA_KEYWORDS,
  FLORA_KIND_WORDS,
  FLORA_PROGRAM_WORDS as COMPILER_FLORA_PROGRAM_WORDS,
  isFloraWord
} from "@terrainist/compiler";
import { FLORA_SPECIES_IDS } from "@terrainist/spec/ir";

describe("the classifier's flora vocabulary", () => {
  it("teaches exactly the keywords the compiler grounds", () => {
    expect([...FLORA_CHARACTER_WORDS]).toEqual([...FLORA_KEYWORDS]);
  });

  it("teaches exactly the shape programs the compiler grounds", () => {
    // `SHAPE_PROGRAMS`' own key order, and note that `ancient` and `fungal`
    // are each both a program and a keyword — which is why this compares
    // against the registry rather than against a set difference.
    expect([...FLORA_PROGRAM_WORDS].sort()).toEqual([...COMPILER_FLORA_PROGRAM_WORDS].sort());
  });

  it("every word it teaches grounds, and every word that grounds is taught", () => {
    for (const word of [...FLORA_CHARACTER_WORDS, ...FLORA_PROGRAM_WORDS, ...FANTASY_FLORA_IDS]) {
      expect(isFloraWord(word), word).toBe(true);
    }
    for (const word of FLORA_KIND_WORDS) {
      expect(INTENT_CLASSIFIER_PROMPT, word).toContain(word);
    }
  });

  it("names the fantasy pair as the gate, and the compiler agrees they are gated", () => {
    expect([...FANTASY_FLORA_IDS]).toEqual(["glowcap", "crystal_spire"]);
    for (const id of FANTASY_FLORA_IDS) {
      expect((FLORA_SPECIES_IDS as readonly string[]).includes(id), id).toBe(true);
    }
  });
});
