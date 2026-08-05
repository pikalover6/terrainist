/**
 * Fan-out rows owned by the layout passes.
 *
 * The *urban* half of the Phase 0 table: block size, street width, density,
 * fabric, and the prominence field's storey multiplier. Same two laws as every
 * other row file — owned here, registered through the seam, and total.
 */

import { DISTRICT_FABRICS, type DistrictDensity, type DistrictFabric } from "@terrainist/spec";

import { registerFanOut } from "../intent/fanout.js";
import { registerCityFanOut } from "./city-intent.js";

/** Row ids owned by the layout passes. */
export const LAYOUT_ROWS = {
  blockSize: "layout.blockSize",
  streetWidth: "layout.streetWidth",
  density: "layout.density",
  fabric: "layout.fabric",
  storeyMultiplier: "layout.storeyMultiplier",
} as const;

/** Register every layout-owned row. */
export function registerLayoutFanOut(): void {
  // The city pass owns `layout.cellForms` and defines it beside itself, in the
  // same spirit fan-out law 1 states: the row lives with the subsystem it
  // drives. It is pulled in here rather than through `intent/seam.ts` because
  // the seam's job is one entry point per *package*, and this is the layout
  // package's.
  registerCityFanOut();

  /* --- wealth → block size ------------------------------------------------ */
  registerFanOut<number>({
    id: LAYOUT_ROWS.blockSize,
    reads: ["wealth", "formality"],
    status: "today",
    drives: "block size between street centre lines (layout/streets.ts)",
    resolve(intent, ctx) {
      const wealth = intent.intent.wealth;
      if (wealth === undefined) return ctx.today;
      // A rich quarter has bigger lots and therefore bigger blocks; a poor one
      // packs tighter. ±25 % about today's value at the extremes, rounded to a
      // whole column because a block size is a count of columns.
      const scaled = ctx.today * (1 + (wealth - 0.5) * 0.5);
      return Math.max(8, Math.round(scaled));
    },
  });

  /* --- wealth → street width --------------------------------------------- */
  registerFanOut<number>({
    id: LAYOUT_ROWS.streetWidth,
    reads: ["wealth", "formality"],
    status: "today",
    drives: "sidewalk band width beside a street (layout/streets.ts)",
    resolve(intent, ctx) {
      const wealth = intent.intent.wealth;
      const formality = intent.intent.formality;
      if (wealth === undefined && formality === undefined) return ctx.today;
      const lift = ((wealth ?? 0.5) - 0.5) + ((formality ?? 0.5) - 0.5);
      return Math.max(0, Math.round(ctx.today + lift));
    },
  });

  /* --- wealth → built density -------------------------------------------- */
  registerFanOut<DistrictDensity>({
    id: LAYOUT_ROWS.density,
    reads: ["wealth", "decline"],
    status: "today",
    drives: "how much of a district's lot supply is actually built on",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      // Only abandonment moves density, and only downward: a rich quarter is
      // not a *denser* one (that is what storeys are for), but an abandoned one
      // genuinely has fewer standing buildings.
      if (decline === undefined || decline < 0.66) return ctx.today;
      return ctx.today === "high" ? "medium" : "low";
    },
  });

  /* --- formality → fabric ------------------------------------------------- */
  registerFanOut<DistrictFabric>({
    id: LAYOUT_ROWS.fabric,
    reads: ["formality", "character"],
    status: "today",
    drives: "district urban form: the street-skeleton generator (layout/forms/)",
    resolve(intent, ctx) {
      // `character.urbanForm` first, and it is the *only* branch that can name
      // one of the five forms this phase added. A document written before the
      // urban-form registry existed cannot carry the key, so the widened row is
      // byte-identical on every such document — which is what makes the identity
      // test total rather than merely a spot check.
      const named = intent.intent.character?.urbanForm;
      if (named !== undefined && DISTRICT_FABRICS.includes(named)) return named;

      const formality = intent.intent.formality;
      if (formality === undefined) return ctx.today;
      // Only the ends of the dial speak. The middle is "no strong opinion",
      // and an author who wrote a fabric in `params` outranks a middling dial.
      if (formality >= 0.75) return "grid";
      if (formality <= 0.25) return "organic";
      return ctx.today;
    },
  });

  /* --- wealth + era → storeys -------------------------------------------- */
  registerFanOut<number>({
    id: LAYOUT_ROWS.storeyMultiplier,
    reads: ["wealth", "era"],
    status: "today",
    drives: "storey multiplier into the prominence field (layout/prominence.ts)",
    resolve(intent, ctx) {
      const wealth = intent.intent.wealth;
      if (wealth === undefined) return ctx.today;
      return ctx.today * (1 + (wealth - 0.5) * 0.4);
    },
  });
}
