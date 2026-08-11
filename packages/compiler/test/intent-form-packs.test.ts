/**
 * `character.formPacks` — grounding, expansion and precedence
 * (docs/CATALOG-EXPANSION-v0.md §4.2 / §4.3).
 *
 * Three things are proved here, and the first is the one that matters most:
 *
 * 1. **The reach law.** A document that names no pack compiles byte-identically
 *    — the row hands back the very array it was given, by reference.
 * 2. **The order**, and it is one order: `archetypes.forbid` > explicit
 *    `archetypes.prefer` > `formPacks` expansion > the mix the quarter was
 *    about to use.
 * 3. **A pack whose members are all unbuilt is a first-class case.** Every
 *    shipped pack was `not_started` the day this landed, so the expansion is
 *    proved against an injected member lookup naming ids that are implemented
 *    *today* — a test bound to the shipped registry could only ever assert that
 *    nothing happened, which is the assertion that would still pass if the wire
 *    were cut.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { FORM_PACKS, formPackMembers } from "@terrainist/stdlib";

import { installFanOutRows } from "../src/intent/index.js";
import { intentFor, resolveIntents } from "../src/intent/resolve.js";
import {
  applyArchetypeBias,
  biasedMix,
  expandFormPacks,
  isFabricArchetype,
} from "../src/layout/mix-intent.js";
import { checkFormPacks, checkScopeVocabulary, isFormPackId } from "../src/structures/vocabulary.js";

import type { LoamDiagnostic } from "@terrainist/spec";

beforeAll(() => {
  installFanOutRows();
});

const TODAY = ["cottage", "smithy", "warehouse"] as const;

/**
 * A stand-in pack whose members are implemented today.
 *
 * `church` and `inn` are real, implemented buildings; `cart` is a prop and
 * `unicorn_stable` is nothing at all — both are in the list precisely so the
 * eligibility filter has something to refuse.
 */
const TEST_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  test_pack: ["church", "cart", "unicorn_stable", "inn"],
  other_pack: ["inn", "chapel"],
  unbuilt_pack: ["stoa", "megaron", "peristyle_house"],
};
const members = (pack: string): readonly string[] => TEST_MEMBERS[pack] ?? formPackMembers(pack);

function scope(intent: unknown) {
  return intentFor(resolveIntents({ intent: intent as never, root: { id: "world" } }), "world");
}

describe("the reach law", () => {
  it("hands back the same array when no scope names a pack", () => {
    expect(biasedMix(scope(undefined), "world.d", TODAY)).toBe(TODAY);
    expect(biasedMix(scope({ era: "ancient" }), "world.d", TODAY)).toBe(TODAY);
    expect(biasedMix(scope({ character: { label: "Troy" } }), "world.d", TODAY)).toBe(TODAY);
    // An empty list is a declaration of nothing, and answers likewise.
    expect(biasedMix(scope({ character: { formPacks: [] } }), "world.d", TODAY)).toBe(TODAY);
  });

  it("grounds nothing, and warns about nothing, when no pack is named", () => {
    expect(checkFormPacks(undefined, "ancient", "world")).toEqual([]);
    expect(checkFormPacks([], "ancient", "world")).toEqual([]);
  });
});

describe("expansion", () => {
  it("adds a pack's fabric-eligible buildings, in registry order", () => {
    expect(expandFormPacks(["test_pack"], members)).toEqual(["church", "inn"]);
  });

  it("refuses props, unbuilt entries and words no catalog carries", () => {
    expect(isFabricArchetype("cart")).toBe(false); // a prop
    expect(isFabricArchetype("unicorn_stable")).toBe(false); // nothing
    expect(expandFormPacks(["test_pack"], members)).not.toContain("cart");
  });

  it("never repeats a member two packs share — a duplicate is a silent weight", () => {
    expect(expandFormPacks(["test_pack", "other_pack"], members)).toEqual([
      "church",
      "inn",
      "chapel",
    ]);
  });

  it("puts the expansion ahead of the mix the quarter was about to use", () => {
    expect(
      applyArchetypeBias([...TODAY], {}, "world.d", undefined, { packs: ["test_pack"], members }),
    ).toEqual(["church", "inn", ...TODAY]);
  });

  it("reads the packs off the resolved scope, and inherits them", () => {
    const resolution = resolveIntents({
      intent: { character: { formPacks: ["classical_mediterranean"] } } as never,
      root: { id: "world", children: [{ id: "town", kind: "district" }] } as never,
    });
    const inherited = intentFor(resolution, "world.town");
    expect(inherited.intent.character?.formPacks).toEqual(["classical_mediterranean"]);
    // The real pack is entirely unbuilt, so the mix is the mix — see below.
    expect(biasedMix(inherited, "world.town", TODAY)).toEqual([...TODAY]);
  });
});

describe("an all-unbuilt pack", () => {
  it("contributes nothing, and is not an error of any kind", () => {
    expect(expandFormPacks(["unbuilt_pack"], members)).toEqual([]);
    const sink: LoamDiagnostic[] = [];
    const answer = biasedMix(
      scope({ character: { formPacks: ["classical_mediterranean"] } }),
      "world.d",
      TODAY,
      sink,
    );
    expect(answer).toEqual([...TODAY]);
    expect(sink).toEqual([]);
  });

  it("still grounds without a warning — the pack is legal, its members are pending", () => {
    for (const pack of FORM_PACKS) {
      expect(isFormPackId(pack.id)).toBe(true);
      expect(checkFormPacks([pack.id], undefined, "world")).toEqual([]);
    }
  });
});

describe("precedence", () => {
  const bias = (extra: Record<string, unknown>) =>
    applyArchetypeBias([...TODAY], extra, "world.d", undefined, {
      packs: ["test_pack"],
      members,
    });

  it("forbid beats a pack member", () => {
    const answer = bias({ forbid: ["church"] });
    expect(answer).not.toContain("church");
    expect(answer).toEqual(["inn", ...TODAY]);
  });

  it("an explicit prefer outranks the pack's position for the same word", () => {
    // `inn` is the pack's *second* eligible member; preferring it puts it
    // first, and the pack does not give it a second occurrence.
    const answer = bias({ prefer: ["inn"] });
    expect(answer).toEqual(["inn", "church", ...TODAY]);
    expect(answer.filter((id) => id === "inn")).toHaveLength(1);
  });

  it("puts every explicit preference ahead of every pack member", () => {
    const answer = bias({ prefer: ["chapel"] });
    expect(answer.indexOf("chapel")).toBeLessThan(answer.indexOf("church"));
  });

  it("is forbid > prefer > pack > today, all four at once", () => {
    const answer = applyArchetypeBias(
      [...TODAY],
      { prefer: ["chapel", "church"], forbid: ["church", "warehouse"] },
      "world.d",
      undefined,
      { packs: ["test_pack", "other_pack"], members },
    );
    // `church` is preferred AND forbidden AND a pack member: forbid wins.
    expect(answer).toEqual(["chapel", "inn", "cottage", "smithy"]);
  });
});

describe("grounding", () => {
  it("warns once for every word no pack carries, naming the legal packs", () => {
    const out = checkFormPacks(["classical_mediterranean", "atlantean", "steamy"], undefined, "world");
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("LOAM-W516");
    expect(out[0]?.name).toBe("INTENT_FORM_PACK_UNKNOWN");
    expect(out[0]?.severity).toBe("warning");
    expect(out[0]?.message).toContain('"atlantean"');
    expect(out[0]?.message).toContain('"steamy"');
    expect(out[0]?.message).not.toContain("classical_mediterranean");
  });

  it("suggests the near miss when the word shares one", () => {
    const out = checkFormPacks(["east_asia"], undefined, "world");
    expect(out).toHaveLength(1);
    expect(out[0]?.fix).toContain("east_asian");
  });

  it("points at the pack list when nothing is near", () => {
    const out = checkFormPacks(["zzzz_nothing"], undefined, "world");
    expect(out[0]?.fix).toContain("classical_mediterranean");
    expect(out[0]?.fix).toContain("nile_egypt");
  });

  it("accepts the spellings a classifier writes", () => {
    expect(checkFormPacks(["Classical Mediterranean"], undefined, "world")).toEqual([]);
  });

  it("runs from the scope check, beside the other three lists", () => {
    const out = checkScopeVocabulary(
      scope({ character: { formPacks: ["not_a_pack"], props: { prefer: ["moored pirate ships"] } } }),
    );
    expect(out.map((d) => d.name).sort()).toEqual([
      "INTENT_FORM_PACK_UNKNOWN",
      "INTENT_PROP_UNKNOWN",
    ]);
  });
});

describe("era affinity", () => {
  it("warns, naming both, when the era is outside the pack's affinity", () => {
    const out = checkFormPacks(["classical_mediterranean"], "modern", "world");
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("LOAM-W517");
    expect(out[0]?.name).toBe("INTENT_FORM_PACK_ERA");
    expect(out[0]?.message).toContain("modern");
    expect(out[0]?.message).toContain("classical_mediterranean");
    expect(out[0]?.message).toContain("ancient");
  });

  it("is never fatal — a modern Hellenist city is the legal case", () => {
    const out = checkScopeVocabulary(
      scope({ era: "modern", character: { formPacks: ["classical_mediterranean"] } }),
    );
    expect(out.every((d) => d.severity === "warning")).toBe(true);
    // …and the pack is used as written: the mix is untouched by the finding.
    expect(
      applyArchetypeBias([...TODAY], {}, "world.d", undefined, { packs: ["test_pack"], members }),
    ).toContain("church");
  });

  it("says nothing when the era is inside the affinity", () => {
    expect(checkFormPacks(["classical_mediterranean"], "ancient", "world")).toEqual([]);
    // …and an alias resolves first: "greek" is `ancient`.
    expect(checkFormPacks(["classical_mediterranean"], "greek", "world")).toEqual([]);
  });

  it("says nothing when the scope has no era, or an era nothing recognises", () => {
    expect(checkFormPacks(["nile_egypt"], undefined, "world")).toEqual([]);
    expect(checkFormPacks(["nile_egypt"], "swashbuckling", "world")).toEqual([]);
  });

  it("aggregates every mismatched pack into one diagnostic", () => {
    const out = checkFormPacks(["nile_egypt", "east_asian", "alien_scifi"], "far_future", "world");
    expect(out).toHaveLength(1);
    expect(out[0]?.message).toContain("nile_egypt");
    expect(out[0]?.message).toContain("east_asian");
    expect(out[0]?.message).not.toContain("alien_scifi");
  });
});
