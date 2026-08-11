/**
 * WP-C: `character.flora` (FLORA-GRAMMAR-v0 §6, §8.1).
 *
 * The row that would break the intent layer's byte-identity law if anything
 * would, because it is the first row that reaches into the *terrain* scatter —
 * so law 2 is asserted here as well as in `intent-identity.test.ts`, and the
 * fantasy gate is asserted against the tables rather than trusted.
 */

import { describe, expect, it } from "vitest";

import { emptyResolvedIntent, fanOut, ensureFanOutRows } from "../src/intent/index.js";
import {
  FLORA_ALIASES,
  FLORA_KEYWORDS,
  FLORA_ROWS,
  NO_FLORA_BIAS,
  floraBiasFrom,
  isNeutralFlora,
  resolveFloraWord,
  type FloraBias,
} from "../src/terrain/flora-intent.js";
import { checkScopeVocabulary } from "../src/structures/vocabulary.js";
import { CLIMATE_STRATA, FLORA_SPECIES } from "../src/terrain/vegetation.js";
import type { SemanticIntent } from "@terrainist/spec";

ensureFanOutRows();

function scope(intent: SemanticIntent, nodePath = "world.wood") {
  return { ...emptyResolvedIntent(nodePath), intent, declared: true };
}

function ask(intent: SemanticIntent): FloraBias {
  return fanOut<FloraBias>(FLORA_ROWS.composition, scope(intent), {
    nodePath: "world.wood",
    today: NO_FLORA_BIAS,
  });
}

const FANTASY = Object.values(FLORA_SPECIES)
  .filter((def) => def.fantasy === true)
  .map((def) => def.id);

describe("character.flora: the row is total", () => {
  it("no character.flora → ctx.today, exactly", () => {
    expect(ask({})).toBe(NO_FLORA_BIAS);
    expect(ask({ era: "medieval" })).toBe(NO_FLORA_BIAS);
    expect(ask({ character: {} })).toBe(NO_FLORA_BIAS);
  });

  it("a character.flora whose every word grounded nowhere is the same as none", () => {
    expect(ask({ character: { flora: { prefer: ["pastel meadows"] } } })).toBe(NO_FLORA_BIAS);
  });

  it("the neutral bias really is neutral", () => {
    expect(isNeutralFlora(NO_FLORA_BIAS)).toBe(true);
    expect(isNeutralFlora(floraBiasFrom([], []))).toBe(true);
  });
});

describe("character.flora: the fantasy gate", () => {
  it("no climate table reaches a fantasy species", () => {
    for (const rows of Object.values(CLIMATE_STRATA)) {
      for (const row of Object.values(rows)) {
        for (const id of row) expect(FANTASY).not.toContain(id);
      }
    }
  });

  it("no keyword but glow and crystal admits a fantasy species", () => {
    for (const keyword of FLORA_KEYWORDS) {
      const bias = floraBiasFrom([keyword], []);
      const admitted = bias.admit.filter((id) => FANTASY.includes(id));
      if (keyword === "glow") expect(admitted).toEqual(["glowcap"]);
      else if (keyword === "crystal") expect(admitted).toEqual(["crystal_spire"]);
      else expect(admitted, `${keyword} admitted a fantasy species`).toEqual([]);
    }
  });

  it("a program word admits the family but never its fantasy members", () => {
    // `columnar` is the sharp case: `larch_columnar` and `crystal_spire` share
    // a program, and only one of them is a tree.
    const bias = floraBiasFrom(["columnar"], []);
    expect(bias.admit).toContain("larch_columnar");
    expect(bias.admit).not.toContain("crystal_spire");
    const fungalWord = floraBiasFrom(["fungal"], []);
    expect(fungalWord.admit).not.toContain("glowcap");
  });

  it("no alias reaches a fantasy species except through the glow and crystal words", () => {
    for (const [alias, canonical] of Object.entries(FLORA_ALIASES)) {
      const bias = floraBiasFrom([alias], []);
      const admitted = bias.admit.filter((id) => FANTASY.includes(id));
      if (canonical === "glow" || canonical === "crystal") expect(admitted.length).toBe(1);
      else expect(admitted, `alias ${alias}`).toEqual([]);
    }
  });

  it("naming a fantasy species outright admits it — and only it", () => {
    const bias = floraBiasFrom(["glowcap"], []);
    expect(bias.admit).toEqual(["glowcap"]);
    expect(bias.weights["glowcap"]).toBe(3);
    expect(bias.floor).toBeUndefined();
  });

  it("forbid outranks every admission", () => {
    const bias = floraBiasFrom(["glow"], ["glowcap"]);
    expect(bias.admit).not.toContain("glowcap");
    expect(bias.forbid).toContain("glowcap");
  });
});

describe("character.flora: every keyword changes something measurable", () => {
  it("each of the nine moves the bias off neutral, and no two agree", () => {
    // The `INTENT_GROUND_UNKNOWN` lesson: a row that reports success and
    // changes nothing is worse than no row at all.
    const seen = new Map<string, string>();
    for (const keyword of FLORA_KEYWORDS) {
      const bias = floraBiasFrom([keyword], []);
      expect(isNeutralFlora(bias), `${keyword} changed nothing`).toBe(false);
      const shape = JSON.stringify(bias);
      const twin = seen.get(shape);
      expect(twin, `${keyword} is indistinguishable from ${twin}`).toBeUndefined();
      seen.set(shape, keyword);
    }
  });

  it("the keywords mean what §6.1 says they mean", () => {
    expect(floraBiasFrom(["old_growth"], []).emergent).toBe(true);
    expect(floraBiasFrom(["old_growth"], []).understory).toBeGreaterThan(0);
    expect(floraBiasFrom(["old_growth"], []).weights["beech_giant"]).toBe(3);
    expect(floraBiasFrom(["ancient"], []).weights["spruce_ancient"]).toBe(4);
    expect(floraBiasFrom(["ancient"], []).ageShift).toBeGreaterThan(0);
    expect(floraBiasFrom(["emergent"], []).emergent).toBe(true);
    expect(floraBiasFrom(["understory"], []).understory).toBe(1.5);
    expect(floraBiasFrom(["deadwood"], []).deadwood).toBe(2);
    expect(floraBiasFrom(["sparse"], []).canopyDensity).toBe(0.5);
    // "fewer trees, the same landmarks" — the emergent budget is untouched.
    expect(floraBiasFrom(["sparse"], []).emergent).toBe(false);
    expect(floraBiasFrom(["fungal"], []).floor).toBe("fungal");
    expect(floraBiasFrom(["fungal"], []).admit).toContain("mushroom_giant_red");
    expect(floraBiasFrom(["glow"], []).floor).toBe("glow");
  });

  it("the alias table resolves the near misses, and nothing else", () => {
    expect(resolveFloraWord("mossy")).toBe("old_growth");
    expect(resolveFloraWord("bioluminescent")).toBe("glow");
    expect(resolveFloraWord("mycelial")).toBe("fungal");
    expect(resolveFloraWord("beech_giant")).toBe("beech_giant");
    expect(resolveFloraWord("giant")).toBe("giant");
    // A string metric would happily call these synonyms; a hand-written table
    // does not, which is the whole reason the table is hand-written.
    expect(resolveFloraWord("coastal")).toBeUndefined();
    expect(resolveFloraWord("crystal_clear")).toBeUndefined();
  });
});

describe("character.flora: grounding", () => {
  it("an ungrounded word warns with LOAM-W486 and names the legal kinds", () => {
    const diagnostics = checkScopeVocabulary(
      scope({ character: { flora: { prefer: ["pastel meadows", "beech_giant"] } } }),
    );
    const warn = diagnostics.find((d) => d.code === "LOAM-W486");
    expect(warn).toBeDefined();
    expect(warn?.message).toContain("pastel meadows");
    // The grounded entry is never complained about.
    expect(warn?.message).not.toContain("beech_giant");
    expect(warn?.fix).toContain("species ids");
    for (const keyword of FLORA_KEYWORDS) expect(warn?.fix).toContain(keyword);
  });

  it("says nothing about a flora list that grounds entirely — species, programs, keywords, aliases", () => {
    const diagnostics = checkScopeVocabulary(
      scope({
        character: {
          flora: {
            prefer: ["old_growth", "giant", "kapok_emergent", "mossy", "glowcap"],
            forbid: ["birch_slim", "conifer"],
          },
        },
      }),
    );
    expect(diagnostics.filter((d) => d.code === "LOAM-W486")).toEqual([]);
  });
});
