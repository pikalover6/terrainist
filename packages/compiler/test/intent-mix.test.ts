/**
 * `grammar.mix` — the archetype-bias row 1).
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
  weightCap
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

});

/* -------------------------------------------------------------------------- */
/* the Troy walk, 2026-08-19 — what the mix is, and what it is not             */
/* -------------------------------------------------------------------------- */

/**
 * Kai walked `trojan_horse_in_troy` (battery p3-tie2) and reported modern
 * houses in a Bronze Age citadel. The first suspect was this row, so the first
 * thing pinned here is that **the row is not the leak**: the doc's own intent,
 * replayed against its own `params.mix`, produces a mix with nothing modern in
 * it, and the compiled world's 44 lot draws came back classical to the last
 * one. The modern read was a *facade* — the grammar's era-blind `"regular"`
 * window grid on an archetype with no intrinsic facade — and it is pinned in
 * `window-rhythm.test.ts`.
 *
 * These cases stay because the next walk that says "modern houses" should be
 * able to rule the mix out in one test run rather than one compile.
 */
describe("an ancient document's mix (the Troy regression)", () => {
  /** The doc's own intent, transcribed. */
  const TROY = {
    era: "ancient",
    character: {
      formPacks: ["classical_mediterranean"],
      archetypes: {
        prefer: ["peristyle_house", "megaron", "stoa", "peripteral_temple", "palaestra", "olive_press"],
        forbid: ["townhouse", "terraced_row", "shop_row", "office", "apartment_block"]
      }
    }
  };

  /** The doc's own `params.mix` for the citadel quarter. */
  const CITADEL = ["peristyle_house", "megaron", "courtyard_house", "hall", "stoa"] as const;

  /** Words whose vocabulary is unmistakably modern. */
  const MODERN = [
    "office",
    "apartment_block",
    "shop_row",
    "townhouse",
    "terraced_row",
    "office_tower",
    "strip_mall",
    "parking_garage",
    "gas_station",
    "supermarket"
  ];

  it("draws zero modern-vocabulary archetypes", () => {
    const mix = ask(TROY, CITADEL);
    for (const word of MODERN) expect(mix).not.toContain(word);
    expect(mix.length).toBeGreaterThan(CITADEL.length);
  });

});
