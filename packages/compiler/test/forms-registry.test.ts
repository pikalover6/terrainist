/**
 * The urban-form contract (WP-0.
 *
 * Three things, and only three, because the forms themselves land in the four
 * packages behind this one:
 *
 * 1. **The registry answers**, with the two forms this package ships, through
 *    the seam and never by importing a form module.
 * 2. **The move is a move.** `buildStreetGraph` — the pre-registry entry point,
 *    which every existing caller and every existing test still uses — produces
 *    exactly what `axialGraph` produces, so nothing about the graph moved when
 *    the construction did. `fabric.test.ts` and `city.test.ts` are the rest of
 *    this argument, unmodified.
 * 3. **A fallback is announced and recorded**, which is what makes it legible
 *    in the final compile report rather than only in a feedback round.
 */

import { describe, expect, it } from "vitest";

import { DISTRICT_FABRICS, URBAN_FORM_IDS } from "@terrainist/spec/ir";
import { nodeSeed } from "@terrainist/stdlib";

import {
  axialGraph,
  drawFabric,
  flatGround,
  installUrbanForms,
  urbanForm,
  urbanForms,
  type FormContext,
  type FormResult,
  type UrbanForm
} from "../src/layout/forms/index.js";
import { buildStreetGraph } from "../src/layout/streets.js";
import { registerForm } from "../src/layout/forms/registry.js";

const BOUNDS = { x0: 0, z0: 0, x1: 199, z1: 179 };
const SEED = nodeSeed(20260804n, "world.downtown", "");

const context = (): FormContext => ({
  bounds: BOUNDS,
  seed: SEED,
  blockSize: 34,
  sidewalk: 2,
  density: "medium",
  ground: flatGround(),
  focus: []
});

describe("the urban form registry", () => {
  it("answers with every form the vocabulary carries", () => {
    installUrbanForms();
    // The registry and the authoring vocabulary must agree in *both*
    // directions. An id in `DISTRICT_FABRICS` with no module is a document the
    // validator accepts and the compiler cannot draw; a module whose id is not
    // in the vocabulary is a form no author can ask for. This assertion was
    // one-directional only while the vocabulary was widened ahead of the
    // registry, between the contract landing and the forms filling it in.
    //
    // Measured against `URBAN_FORM_IDS` rather than `DISTRICT_FABRICS` since the
 // cutover: an **alias** is a legal spelling of
    // another form's id, not a module of its own, and `urbanForm` resolves it.
    expect(urbanForms().map((f) => f.id).sort()).toEqual([...URBAN_FORM_IDS].sort());
  });

  it("registers only ids the authoring vocabulary carries", () => {
    installUrbanForms();
    for (const form of urbanForms()) {
      expect(DISTRICT_FABRICS as readonly string[]).toContain(form.id);
    }
  });

  it("resolves every id in the vocabulary to a form, alias or not", () => {
    installUrbanForms();
    // The reach law (§7.1): a document that names a retired form keeps
    // compiling. Every id an author may legally write must therefore answer.
    for (const id of DISTRICT_FABRICS) expect(urbanForm(id)).toBeDefined();
  });

  it("describes every form it carries, for `terrainist forms`", () => {
    installUrbanForms();
    for (const form of urbanForms()) {
      expect(form.describe.length).toBeGreaterThan(40);
      expect(form.requires.polygon).toBe(true);
    }
  });
});

describe("the move into forms/axial.ts", () => {
  it("draws through the registry exactly what the axial construction draws", () => {
    for (const fabric of ["grid", "organic"] as const) {
      const direct = axialGraph({ bounds: BOUNDS, fabric, seed: SEED, blockSize: 34, sidewalk: 2 });
      const wrapped = buildStreetGraph({ bounds: BOUNDS, fabric, seed: SEED, blockSize: 34, sidewalk: 2 });
      expect(direct.ok && wrapped.ok).toBe(true);
      if (!direct.ok || !wrapped.ok) return;
      expect(JSON.stringify(wrapped.graph)).toBe(JSON.stringify(direct.graph));
    }
  });

  it("keeps the unclipped path when no mask and no rotation are given", () => {
    // Every segment spans the district edge to edge, which is only true of the
    // construction fabric v2 shipped — the clipped path cuts runs instead.
    const drawn = drawFabric({ ...context(), fabric: "grid", nodePath: "world.downtown" });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.outcome.diagnostics).toEqual([]);
    expect(drawn.outcome.plan.record).toEqual({ id: "grid", requested: "grid", adapted: [], ignored: [] });
    expect(drawn.outcome.plan.lotMask).toBeUndefined();
  });

  it("refuses a domain too small for a grid, with no diagnostic of its own", () => {
    // A `null` fallback is the caller's `DISTRICT_TOO_SMALL`, and the form is
    // what phrases the measurement — the sentence it has printed since fabric v2.
    const drawn = drawFabric({
      ...context(),
      bounds: { x0: 0, z0: 0, x1: 29, z1: 29 },
      fabric: "grid",
      nodePath: "world.pocket"
    });
    expect(drawn.ok).toBe(false);
    if (drawn.ok) return;
    expect(drawn.refusal.reason).toMatch(/at least/);
    expect(drawn.refusal.fix).toMatch(/envelope\.size/);
  });
});

describe("the announced fallback", () => {
  /** A form that always refuses, so the fallback path can be exercised alone. */
  const REFUSER: UrbanForm = {
    id: "grown",
    requires: { minSpan: 38, polygon: true, fallback: "organic" },
    describe: "A test double that refuses every domain it is offered, so the fallback path can be measured.",
    draw(): FormResult {
      return {
        ok: false,
        reason: "the ground under this quarter has 3 blocks of relief and needs at least 8",
        fix: 'move the quarter onto a slope with a "zone" constraint',
        fallback: "organic"
      };
    }
  };

  it("warns naming the measurement and the fix, and draws the declared fallback", () => {
    installUrbanForms();
    registerForm(REFUSER);
    const drawn = drawFabric({ ...context(), fabric: "grown", nodePath: "world.hill_town" });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;

    expect(drawn.outcome.diagnostics).toHaveLength(1);
    const [warned] = drawn.outcome.diagnostics;
    expect(warned?.name).toBe("DISTRICT_FORM");
    expect(warned?.code).toBe("LOAM-T222");
    expect(warned?.severity).toBe("warning");
    expect(warned?.nodePath).toBe("world.hill_town");
    expect(warned?.message).toMatch(/3 blocks of relief/);
    expect(warned?.message).toMatch(/organic/);
    expect(warned?.fix).toMatch(/zone/);

    // …and the record says so, which is how the report says so.
    expect(drawn.outcome.plan.record.id).toBe("organic");
    expect(drawn.outcome.plan.record.requested).toBe("grown");
    expect(drawn.outcome.plan.record.fellBackBecause).toMatch(/relief/);

    // The fallback is what was actually drawn, cell for cell.
    const organic = axialGraph({ bounds: BOUNDS, fabric: "organic", seed: SEED, blockSize: 34, sidewalk: 2 });
    expect(organic.ok).toBe(true);
    if (!organic.ok) return;
    expect(JSON.stringify(drawn.outcome.plan.graph)).toBe(JSON.stringify(organic.graph));
  });

  it("never falls back twice", () => {
    installUrbanForms();
    registerForm(REFUSER);
    // `organic` refuses a 29² domain and has no fallback of its own, so the
    // quarter is refused rather than a third form being tried.
    const drawn = drawFabric({
      ...context(),
      bounds: { x0: 0, z0: 0, x1: 29, z1: 29 },
      fabric: "grown",
      nodePath: "world.pocket"
    });
    expect(drawn.ok).toBe(false);
  });

  // The "a vocabulary id with no module draws a grid and warns" case was a
  // deliberately temporary branch: the vocabulary was widened to all seven ids
  // by the contract package, before the modules that fill them existed, so a
  // legal document had to stay compilable in between. Every id now has a
  // module — asserted above, in both directions — so the branch is unreachable
  // and the test that pinned it would only pin dead code.

  it("throws on an id the vocabulary does not carry — that is a compiler bug", () => {
    installUrbanForms();
    expect(() =>
      drawFabric({ ...context(), fabric: "canaal" as never, nodePath: "world.q" }),
    ).toThrow(/compiler bug/);
  });
});
