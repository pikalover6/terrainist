/**
 * Vocabulary and identity — §8.3 of `docs/URBAN-FORMS-v0.md`.
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

import { DISTRICT_FABRICS, validateIntentValue, validateSettlementDocument, type DistrictFabric } from "@terrainist/spec";

import { CITY_ROWS, type CellFormTable } from "../src/layout/city-intent.js";
import { fanOut, installFanOutRows, intentFor, resolveIntents } from "../src/intent/index.js";
import { installUrbanForms, urbanForms } from "../src/layout/forms/index.js";
import { LAYOUT_ROWS } from "../src/layout/streets-intent.js";
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
const FROZEN_CELLS = Object.freeze({
  core: "grid",
  grid: "grid",
  rowhouse: "grid",
  lanes: "organic",
  industrial: "grid",
  civic: "grid",
  park: "organic",
  waterfront: "organic",
}) as CellFormTable;

/* -------------------------------------------------------------------------- */
/* registry ↔ spec                                                             */
/* -------------------------------------------------------------------------- */

describe("the form vocabulary is one vocabulary", () => {
  it("registers a form for every id the spec's vocabulary carries", () => {
    const registered = urbanForms().map((f) => f.id);
    for (const id of DISTRICT_FABRICS) expect(registered).toContain(id);
  });

  it("registers no form the spec's vocabulary does not carry", () => {
    for (const form of urbanForms()) {
      expect(DISTRICT_FABRICS as readonly string[]).toContain(form.id);
    }
  });

  it("is exactly the forms the design names", () => {
    // Seven from `docs/URBAN-FORMS-v0.md` §3, plus `hillside` — the site
    // planner of `docs/SITE-PLAN-v0.md` §3, registered and deliberately absent
    // from the classifier and the kit until Kai accepts the §8 prototype (§7.1).
    expect(urbanForms().map((f) => f.id).sort()).toEqual(
      ["canal", "grid", "grown", "hillside", "linear", "organic", "radial", "terraced"],
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
            params: { fabric: "canaal", density: "medium", mix: ["cottage"] },
          },
        ],
      },
    });
    const bad = result.diagnostics.find((d) => d.message.includes("canaal"));
    expect(bad).toBeDefined();
    expect(bad?.severity).toBe("error");
    for (const id of DISTRICT_FABRICS) expect(bad?.message).toContain(id);
  });

  it("warns on an unknown intent.character.urbanForm and lists the legal values", () => {
    const found = checkScopeVocabulary(scope({ character: { urbanForm: "canaal" } }));
    const warned = found.find((d) => d.name === "INTENT_FORM_UNKNOWN");
    expect(warned).toBeDefined();
    expect(warned?.severity).toBe("warning");
    expect(warned?.code).toBe("LOAM-W487");
    for (const id of DISTRICT_FABRICS) expect(warned?.fix).toContain(id);
  });

  it("says nothing about a form the registry can draw", () => {
    for (const id of DISTRICT_FABRICS) {
      const found = checkScopeVocabulary(scope({ character: { urbanForm: id } }));
      expect(found.find((d) => d.name === "INTENT_FORM_UNKNOWN")).toBeUndefined();
    }
  });

  it("takes a legal urbanForm through the validator without a diagnostic", () => {
    const validated = validateIntentValue({ character: { urbanForm: "canal" } });
    expect(validated.intent?.character?.urbanForm).toBe("canal");
    expect(validated.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* the two rows                                                                */
/* -------------------------------------------------------------------------- */

describe("layout.fabric — the district row", () => {
  it("returns today's value for an intent that names no form", () => {
    for (const today of DISTRICT_FABRICS) {
      expect(
        fanOut<DistrictFabric>(LAYOUT_ROWS.fabric, scope(undefined), { nodePath: "world", today }),
      ).toBe(today);
      expect(
        fanOut<DistrictFabric>(LAYOUT_ROWS.fabric, scope({ character: { label: "old town" } }), {
          nodePath: "world",
          today,
        }),
      ).toBe(today);
    }
  });

  it("keeps the frozen formality branches exactly", () => {
    expect(fanOut<DistrictFabric>(LAYOUT_ROWS.fabric, scope({ formality: 0.9 }), { nodePath: "world", today: "organic" })).toBe("grid");
    expect(fanOut<DistrictFabric>(LAYOUT_ROWS.fabric, scope({ formality: 0.1 }), { nodePath: "world", today: "grid" })).toBe("organic");
    expect(fanOut<DistrictFabric>(LAYOUT_ROWS.fabric, scope({ formality: 0.5 }), { nodePath: "world", today: "grid" })).toBe("grid");
  });

  it("lets character.urbanForm outrank the formality dial", () => {
    const answer = fanOut<DistrictFabric>(
      LAYOUT_ROWS.fabric,
      scope({ formality: 0.9, character: { urbanForm: "canal" } }),
      { nodePath: "world", today: "organic" },
    );
    expect(answer).toBe("canal");
  });

  it("ignores an urbanForm outside the vocabulary rather than guessing", () => {
    const answer = fanOut<DistrictFabric>(
      LAYOUT_ROWS.fabric,
      scope({ character: { urbanForm: "canaal" } }),
      { nodePath: "world", today: "organic" },
    );
    expect(answer).toBe("organic");
  });
});

describe("layout.cellForms — the city row", () => {
  it("returns the frozen table for an intent that names no form", () => {
    const answer = fanOut<CellFormTable>(CITY_ROWS.cellForms, scope(undefined), {
      nodePath: "world.city",
      today: FROZEN_CELLS,
    });
    expect(answer).toEqual(FROZEN_CELLS);
  });

  it("re-maps every built character, and leaves park alone", () => {
    const answer = fanOut<CellFormTable>(CITY_ROWS.cellForms, scope({ character: { urbanForm: "grown" } }), {
      nodePath: "world.city",
      today: FROZEN_CELLS,
    });
    expect(answer.core).toBe("grown");
    expect(answer.lanes).toBe("grown");
    expect(answer.waterfront).toBe("grown");
    expect(answer.park).toBe(FROZEN_CELLS.park);
  });

  it("keeps the frozen table for a form the registry cannot draw", () => {
    const answer = fanOut<CellFormTable>(CITY_ROWS.cellForms, scope({ character: { urbanForm: "canaal" } }), {
      nodePath: "world.city",
      today: FROZEN_CELLS,
    });
    expect(answer).toEqual(FROZEN_CELLS);
  });
});
