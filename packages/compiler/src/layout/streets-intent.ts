/**
 * Fan-out rows owned by the layout passes.
 *
 * The *urban* half of the Phase 0 table: block size, street width, density,
 * fabric, and the prominence field's storey multiplier. Same two laws as every
 * other row file — owned here, registered through the seam, and total.
 */

import {
  type DistrictDensity,
  type DistrictGroundPolicy,
  type EraClass,
} from "@terrainist/spec/ir";
import { ruinShare } from "@terrainist/stdlib";

import { registerFanOut } from "../intent/fanout.js";

/** Row ids owned by the layout passes. */
export const LAYOUT_ROWS = {
  blockSize: "layout.blockSize",
  streetWidth: "layout.streetWidth",
  density: "layout.density",
  storeyMultiplier: "layout.storeyMultiplier",
  storeyCeiling: "layout.storeyCeiling",
  groundPolicy: "layout.groundPolicy",
  ruinShare: "decay.ruinShare",
} as const;

/**
 * The id `layout/district.ts` spells out by hand.
 *
 * `districtGroundPolicy` cannot import `LAYOUT_ROWS` — this file is owned by
 * the package that registers the row, and that package lands after the one
 * that calls it — so it holds a local copy of the string. The two must be the
 * same string or the dial silently does nothing (`fanOut` returns `today` for
 * an unregistered id, which is fan-out law 2 and is exactly what an
 * unregistered row looks like from the outside). `courtyards-vocabulary.test.ts`
 * asserts the id is registered under this exact spelling.
 */
export const GROUND_POLICY_ROW_ID = "layout.groundPolicy";

/**
 * How tall ordinary fabric may build, by era class — the `layout.storeyCeiling`
 * row's whole opinion.
 *
 * ## Why this exists
 *
 * Kai walked Troy (P3 c5, 2026-08-12) and reported "modern building types
 * alongside the appropriate ones": four-storey flat-fronted street walls with a
 * regular window grid standing among two-storey flat-roofed Aegean houses. The
 * archetypes were right — the bays were `megaron` and `peristyle_house` out of
 * the `classical_mediterranean` pack — and the *height* was what read modern.
 * A sixteen-block wall of evenly spaced windows is an apartment block whatever
 * blocks it is made of.
 *
 * The terrace run drew its storeys from `INFILL_FLOORS[density]` (medium is
 * `[2, 4]`) with nothing between it and the eye but density, so an ancient
 * quarter at medium density built the same street wall a modern one would.
 *
 * ## Why only these classes
 *
 * A ceiling is a claim about what a period actually built, and we only make the
 * claim where it is safe: pre-classical and classical fabric is two to three
 * storeys and the exceptions (Rome's insulae) are not what a walk reads. Every
 * other class is **absent, not high** — the row returns `ctx.today` for it and
 * those worlds are byte-identical. Raising a hand for `medieval` is a taste
 * call for Kai, not a fact this table gets to assert on its own.
 */
export const ERA_STOREY_CEILING: Readonly<Partial<Record<EraClass, number>>> = Object.freeze({
  ancient: 3,
});

/** Register every layout-owned row. */
export function registerLayoutFanOut(): void {
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

  /* --- era → the storey ceiling ------------------------------------------- */
  registerFanOut<number | undefined>({
    id: LAYOUT_ROWS.storeyCeiling,
    reads: ["era"],
    status: "today",
    drives:
      "hard ceiling on how many storeys ordinary fabric builds — the prominence field and the terrace run (layout/prominence.ts, layout/district.ts)",
    resolve(intent, ctx) {
      // Law 2, and the whole of the gate: no `era`, no ceiling, and an era
      // whose class is not in the table keeps whatever ceiling it had. Only the
      // classes {@link ERA_STOREY_CEILING} names can move a world.
      if (!intent.eraDeclared) return ctx.today;
      const ceiling = ERA_STOREY_CEILING[intent.eraClass];
      if (ceiling === undefined) return ctx.today;
      // The lower of the two, never the higher: an author or a later row that
      // already asked for something shorter keeps it.
      return ctx.today === undefined ? ceiling : Math.min(ctx.today, ceiling);
    },
  });

  /* --- decline → the share of lots built as ruins ------------------------- */
  registerFanOut<number>({
    id: LAYOUT_ROWS.ruinShare,
    reads: ["decline"],
    status: "today",
    drives: "the share of a district's infill lots built as ruins (layout/district.ts)",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      if (decline === undefined) return ctx.today;
      // The onset curve (RUINS-PLAN §4.1), shared with `decay.coverage`'s
      // square so that ground decay and building ruin rise together — one dial,
      // one curve — with the step at `RUIN_ONSET` that keeps a merely tired
      // town from getting one fallen-in house on an otherwise kept street.
      //
      // `today` is 0 and a `decline` below the onset returns exactly 0, which
      // is the reach law: no `decline`, no ruins, and a modest `decline` is
      // still wear rather than ruin.
      return Math.max(ctx.today, ruinShare(decline));
    },
  });

  /* --- character → ground policy ------------------------------------------ */
  registerFanOut<DistrictGroundPolicy>({
    id: LAYOUT_ROWS.groundPolicy,
    reads: [],
    status: "today",
    drives: "how a quarter prepares its ground: one pad, its own benches, or platforms and retaining walls (layout/district.ts)",
    resolve(_intent, ctx) {
      // **The one authorised movement in Phase 4.2 WP-D.** `ctx.today` is
      // `"benched"` exactly when the resolved form declares
      // `requires.unlevelled`, which today is `terraced` and nothing else — so
      // this branch reads "a form that cuts its own benches wants the seams
      // between them treated". A hill town's blocks *are* split-level; leaving
      // the flagship hill-town form on one plane per block means the form
      // cannot express the thing it exists for, and a `terraced` quarter would
      // keep the raw dirt banks this phase exists to end.
      //
      // Kai overruled §10 open question 4 towards this on 2026-08-05. It moves
      // `terraced` worlds and nothing else: `"pad"` is returned unchanged, an
      // explicit `params.ground` never reaches this row at all
      // (`districtGroundPolicy` returns before asking), and `"stepped"` is
      // already `"stepped"`.
      if (ctx.today === "benched") return "stepped";
      return ctx.today;
    },
  });
}
