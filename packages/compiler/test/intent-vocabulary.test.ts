/**
 * Grounding the intent layer's free strings.
 *
 * The defect these tests exist for: a village whose `character.materialTheme`
 * said `"white_quartz"` came out looking like every other village, and nothing
 * anywhere said why. Two halves to the fix, and one test each — the word
 * resolves against the *real* registry, and a word that resolves nowhere draws
 * a warning naming the legal values instead of vanishing.
 */

import { describe, expect, it } from "vitest";

import { emptyResolvedIntent } from "../src/intent/index.js";
import {
  FLORA_KINDS,
  checkScopeVocabulary,
  closeMatches,
  groundList,
  materialThemeIds,
  resolveMaterialTheme,
} from "../src/structures/vocabulary.js";
import type { SemanticIntent } from "@terrainist/spec";

function scope(intent: SemanticIntent, nodePath = "world.village") {
  return { ...emptyResolvedIntent(nodePath), intent, declared: true };
}

describe("material theme grounding", () => {
  it("takes a registered id exactly", () => {
    const r = resolveMaterialTheme("white_quartz", "world");
    expect(r.id).toBe("white_quartz");
    expect(r.exact).toBe(true);
    expect(r.diagnostic).toBeUndefined();
  });

  it("maps a near word through the alias table", () => {
    expect(resolveMaterialTheme("quartz", "world").id).toBe("white_quartz");
    expect(resolveMaterialTheme("Weathered Timber", "world").id).toBe("boreal_pine");
    expect(resolveMaterialTheme("half-timbered", "world").id).toBe("temperate_timber");
  });

  it("warns rather than falling back silently", () => {
    const r = resolveMaterialTheme("obsidian_nightmare", "world.village");
    expect(r.id).toBeUndefined();
    expect(r.diagnostic?.code).toBe("LOAM-W484");
    // The message has to *name the legal values*: a warning an authoring model
    // cannot act on is a warning that costs a revision round for nothing.
    for (const id of materialThemeIds()) expect(r.diagnostic?.fix).toContain(id);
  });
});

describe("prefer / forbid grounding", () => {
  it("splits a list into what the registry carries and what it does not", () => {
    const g = groundList(["fountain", "moored pirate ships"], (w) => w === "fountain");
    expect(g.known).toEqual(["fountain"]);
    expect(g.unknown).toEqual(["moored pirate ships"]);
  });

  it("suggests close matches by shared word", () => {
    expect(closeMatches("standing stones of the isle", ["standing_stones", "cart"])).toContain(
      "standing_stones",
    );
  });

  it("aggregates one warning per list, not one per word", () => {
    const diagnostics = checkScopeVocabulary(
      scope({
        character: {
          archetypes: { prefer: ["unicorns", "pirates", "cottage"] },
          props: { prefer: ["rainbow-hued crystal formations", "fountain"] },
          flora: { prefer: ["pastel meadows"] },
        },
      }),
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["LOAM-W483", "LOAM-W485", "LOAM-W486"]);
    // The grounded entries are never complained about.
    expect(diagnostics[0]?.message).not.toContain("cottage");
    expect(diagnostics[1]?.message).not.toContain("fountain");
    for (const kind of FLORA_KINDS) expect(diagnostics[2]?.fix).toContain(kind);
  });

  it("says nothing at all about an intent whose vocabulary is entirely real", () => {
    expect(
      checkScopeVocabulary(
        scope({
          character: {
            materialTheme: "white_quartz",
            archetypes: { prefer: ["cottage"] },
            props: { prefer: ["fountain"] },
            flora: { prefer: ["oak_round"] },
          },
        }),
      ),
    ).toEqual([]);
  });
});
