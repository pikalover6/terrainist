/**
 * Vocabulary and identity — §8.3.
 *
 * The forms are a **closed vocabulary with two spellings** — `DISTRICT_FABRICS`
 * in the spec, the registry in the compiler — and the whole authoring surface
 * rests on the two agreeing. So:
 *
 * 1. **Registry ↔ spec, both directions.** Every id in `DISTRICT_FABRICS` has a
 *    registered form *and* every registered form's id is in `DISTRICT_FABRICS`.
 *    WP-0 could only assert one direction, because the vocabulary was widened
 *    ahead of the modules; now that every form is registered, an id with no
 *    module is a compiler bug and the dispatch throws rather than degrading.
 * 2. **Grounding.** An unknown `params.fabric` is an error listing the legal
 *    ids; an unknown `intent.character.urbanForm` is a `LOAM-W487` warning
 *    listing them, and the quarter keeps the form it would have had.
 * 3. **Byte-identity.** Both new fan-out branches are keyed on
 *    `character.urbanForm`, which no document written before this phase can
 *    carry, so an intent without it returns `ctx.today` exactly — the frozen
 *    formality branches for a district, and the frozen `CELL_FABRIC` table for
 *    a city.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  DISTRICT_FABRICS,
  URBAN_FORM_IDS,
  validateSettlementDocument
} from "@terrainist/spec/ir";

import { nodeSeed } from "@terrainist/stdlib";

import { installFanOutRows, intentFor, resolveIntents } from "../src/intent/index.js";
import { drawFabric, flatGround, installUrbanForms, urbanForm, urbanForms } from "../src/layout/forms/index.js";
import { checkScopeVocabulary } from "../src/structures/vocabulary.js";

beforeAll(() => {
  installFanOutRows();
  installUrbanForms();
});

/** The resolved record for one world-scope intent. */
function scope(intent: unknown) {
  return intentFor(resolveIntents({ intent: intent as never, root: { id: "world" } }), "world");
}

/** Today's frozen city table, restated here so the row is measured against it. */

/* -------------------------------------------------------------------------- */
/* registry ↔ spec                                                             */
/* -------------------------------------------------------------------------- */

describe("the form vocabulary is one vocabulary", () => {
  it("registers a form for every id the spec's vocabulary carries", () => {
    const registered = urbanForms().map((f) => f.id);
    for (const id of URBAN_FORM_IDS) expect(registered).toContain(id);
  });

  it("registers no form the spec's vocabulary does not carry", () => {
    for (const form of urbanForms()) {
      expect(DISTRICT_FABRICS as readonly string[]).toContain(form.id);
    }
  });

  it("is exactly the forms the design names", () => {
 // Seven minus `terraced`, which the
    // §7.1 cutover retired into `hillside` (2026-08-08) — its module is deleted
    // and its id is an alias.
    expect(urbanForms().map((f) => f.id).sort()).toEqual(
      ["canal", "grid", "grown", "hillside", "linear", "organic", "radial"],
    );
  });

  it("gives every form a description an author can read", () => {
    for (const form of urbanForms()) {
      expect(form.describe.length).toBeGreaterThan(40);
      expect(form.requires.polygon).toBe(true);
    }
  });

  it("declares only fallbacks that are themselves registered", () => {
    const registered = new Set(urbanForms().map((f) => f.id));
    for (const form of urbanForms()) {
      if (form.requires.fallback === null) continue;
      expect(registered.has(form.requires.fallback)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* grounding                                                                   */
/* -------------------------------------------------------------------------- */

describe("grounding — an ungrounded word is named, never dropped", () => {
  it("refuses an unknown params.fabric with the legal ids", () => {
    const result = validateSettlementDocument({
      version: "0.2",
      seed: 1,
      root: {
        id: "world",
        kind: "composite",
        children: [
          {
            id: "town",
            kind: "district",
            envelope: { shape: "region", size: [200, 180] },
            params: { fabric: "canaal", density: "medium", mix: ["cottage"] }
          }
        ]
      }
    });
    const bad = result.diagnostics.find((d) => d.message.includes("canaal"));
    expect(bad).toBeDefined();
    expect(bad?.severity).toBe("error");
    for (const id of DISTRICT_FABRICS) expect(bad?.message).toContain(id);
  });

});

/* -------------------------------------------------------------------------- */
/* the two rows                                                                */
/* -------------------------------------------------------------------------- */

