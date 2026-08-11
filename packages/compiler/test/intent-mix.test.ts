/**
 * `grammar.mix` — the archetype-bias row (docs/CATALOG-EXPANSION-v0.md §4.1 B1).
 *
 * The row's whole contract is an order: forbid, then prefer, then weights, then
 * whatever is left of the mix the quarter was about to use. Each case below
 * states the mix the subsystem would have used and asserts what the row does
 * with it; the byte-identity half of the law lives in `intent-identity.test.ts`,
 * which walks every registered row with a sentinel `today`.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { fanOut, installFanOutRows } from "../src/intent/index.js";
import { intentFor, resolveIntents } from "../src/intent/resolve.js";
import {
  MIX_ROWS,
  applyArchetypeBias,
  biasedMix,
  isFabricArchetype,
  weightCap,
} from "../src/layout/mix-intent.js";

import type { LoamDiagnostic } from "@terrainist/spec";

beforeAll(() => {
  installFanOutRows();
});

/** The resolved record for one world-scope intent. */
function scope(intent: unknown) {
  return intentFor(resolveIntents({ intent: intent as never, root: { id: "world" } }), "world");
}

const TODAY = ["cottage", "smithy", "warehouse"] as const;

function ask(intent: unknown, today: readonly string[] = TODAY, sink?: LoamDiagnostic[]) {
  return biasedMix(scope(intent), "world.district", today, sink);
}

describe("totality", () => {
  it("returns the mix unchanged when nothing declares character.archetypes", () => {
    expect(ask(undefined)).toBe(TODAY);
    expect(ask({ era: "medieval", wealth: 0.8 })).toBe(TODAY);
    expect(ask({ character: { label: "a port" } })).toBe(TODAY);
    // An empty bias object is a declaration of nothing, and answers likewise.
    expect(ask({ character: { archetypes: {} } })).toBe(TODAY);
  });

  it("is registered under its own id and answers through the registry", () => {
    expect(
      fanOut<readonly string[]>(MIX_ROWS.mix, scope(undefined), { nodePath: "w", today: TODAY }),
    ).toBe(TODAY);
  });
});

describe("forbid", () => {
  it("removes a forbidden id, including one written into params.mix", () => {
    expect(ask({ character: { archetypes: { forbid: ["warehouse"] } } })).toEqual([
      "cottage",
      "smithy",
    ]);
  });

  it("outranks prefer for the same word", () => {
    expect(
      ask({ character: { archetypes: { prefer: ["warehouse"], forbid: ["warehouse"] } } }),
    ).toEqual(["cottage", "smithy"]);
  });

  it("falls back to today's mix, with a diagnostic, when it empties the mix", () => {
    const sink: LoamDiagnostic[] = [];
    const answer = ask({ character: { archetypes: { forbid: [...TODAY] } } }, TODAY, sink);
    expect(answer).toEqual([...TODAY]);
    expect(sink).toHaveLength(1);
    expect(sink[0]?.code).toBe("LOAM-W515");
    expect(sink[0]?.name).toBe("INTENT_ARCHETYPE_MIX_EMPTY");
    expect(sink[0]?.severity).toBe("warning");
  });

  it("still falls back when no sink is offered", () => {
    expect(ask({ character: { archetypes: { forbid: [...TODAY] } } })).toEqual([...TODAY]);
  });
});

describe("prefer", () => {
  it("prepends in declaration order — position is weight", () => {
    expect(ask({ character: { archetypes: { prefer: ["church", "inn"] } } })).toEqual([
      "church",
      "inn",
      ...TODAY,
    ]);
  });

  it("skips a word that is not a fabric-eligible building archetype", () => {
    // `unicorn_stable` is nothing; `cart` is a prop, not a building. W483 has
    // already warned about the first, and neither may enter a lot draw.
    expect(isFabricArchetype("unicorn_stable")).toBe(false);
    expect(isFabricArchetype("cottage")).toBe(true);
    expect(
      ask({ character: { archetypes: { prefer: ["unicorn_stable", "church"] } } }),
    ).toEqual(["church", ...TODAY]);
  });

  it("does not prepend the same word twice", () => {
    expect(ask({ character: { archetypes: { prefer: ["church", "church"] } } })).toEqual([
      "church",
      ...TODAY,
    ]);
  });
});

describe("weights", () => {
  it("multiplies an id's occurrences, integer-rounded", () => {
    const answer = applyArchetypeBias(
      ["cottage", "smithy", "warehouse", "inn"],
      { weights: { cottage: 2 } },
      "world.district",
    );
    expect(answer.filter((id) => id === "cottage")).toHaveLength(2);
    expect(answer.filter((id) => id === "smithy")).toHaveLength(1);
    expect(answer).toHaveLength(5);
  });

  it("caps one id at half the mix length, so it cannot take the whole quarter", () => {
    expect(weightCap(4)).toBe(2);
    expect(weightCap(1)).toBe(1);
    const answer = applyArchetypeBias(
      ["cottage", "smithy", "warehouse", "inn"],
      { weights: { cottage: 99 } },
      "world.district",
    );
    expect(answer.filter((id) => id === "cottage")).toHaveLength(2);
  });

  it("never drops an id below one occurrence, and ignores an id not in the mix", () => {
    const answer = applyArchetypeBias(
      [...TODAY],
      { weights: { cottage: 0.1, pagoda: 5 } },
      "world.district",
    );
    expect(answer.filter((id) => id === "cottage")).toHaveLength(1);
    expect(answer).not.toContain("pagoda");
  });

  it("weights a preferred id too, since prefer runs first", () => {
    const answer = ask({
      character: { archetypes: { prefer: ["church"], weights: { church: 3 } } },
    });
    // Mix is 4 long after the prepend, so the cap is 2.
    expect(answer.filter((id) => id === "church")).toHaveLength(2);
  });
});

describe("scope inheritance", () => {
  it("reads the bias through the resolved scope, like every other character dial", () => {
    const resolution = resolveIntents({
      intent: { character: { archetypes: { forbid: ["warehouse"] } } } as never,
      root: {
        id: "world",
        children: [{ id: "town", kind: "district", params: { fabric: "grid", density: "medium", mix: ["cottage"] } }],
      } as never,
    });
    const inherited = intentFor(resolution, "world.town");
    expect(biasedMix(inherited, "world.town", TODAY)).toEqual(["cottage", "smithy"]);
  });
});
