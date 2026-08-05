/**
 * Fan-out rows owned by the layout passes.
 *
 * The *urban* half of the Phase 0 table: block size, street width, density,
 * fabric, and the prominence field's storey multiplier. Same two laws as every
 * other row file — owned here, registered through the seam, and total.
 */

import {
  COURTYARD_SHARE_MAX,
  COURTYARD_SHARE_MIN,
  DISTRICT_FABRICS,
  DISTRICT_GROUND_POLICIES,
  type DistrictDensity,
  type DistrictFabric,
  type DistrictGroundPolicy,
} from "@terrainist/spec";

import { registerFanOut } from "../intent/fanout.js";
import { registerCityFanOut } from "./city-intent.js";

/** Row ids owned by the layout passes. */
export const LAYOUT_ROWS = {
  blockSize: "layout.blockSize",
  streetWidth: "layout.streetWidth",
  density: "layout.density",
  fabric: "layout.fabric",
  storeyMultiplier: "layout.storeyMultiplier",
  courtyardShare: "layout.courtyardShare",
  groundPolicy: "layout.groundPolicy",
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

  /* --- character → courtyard share --------------------------------------- */
  registerFanOut<number>({
    id: LAYOUT_ROWS.courtyardShare,
    reads: ["era", "formality", "character"],
    status: "today",
    drives: "share of eligible blocks that close around a courtyard (layout/courtyards.ts)",
    resolve(intent, ctx) {
      // `era` and `formality` are declared as read and deliberately do not
      // speak (`docs/COURTYARDS-AND-LEVELS-v0.md` §5.2). A mapping from era to
      // courtyards is a guess the compiler would make on *every*
      // intent-carrying document, and it would move every world that has an
      // `era`. The guess lives in the classifier pre-pass, where a human can
      // read the answer before the expensive call. They stay in `reads` so the
      // registry dump says which dials were considered and declined.
      const share = intent.intent.character?.courtyards;
      if (share === undefined) return ctx.today;
      // Out of range is not clamped: the grounding pass has already warned
      // (`INTENT_GROUND_UNKNOWN`), and a clamp would honour half of a request
      // the author can see was refused. The quarter keeps the share it had.
      if (!Number.isFinite(share)) return ctx.today;
      if (share < COURTYARD_SHARE_MIN || share > COURTYARD_SHARE_MAX) return ctx.today;
      return share;
    },
  });

  /* --- character → ground policy ------------------------------------------ */
  registerFanOut<DistrictGroundPolicy>({
    id: LAYOUT_ROWS.groundPolicy,
    reads: ["character"],
    status: "today",
    drives: "how a quarter prepares its ground: one pad, its own benches, or platforms and retaining walls (layout/district.ts)",
    resolve(intent, ctx) {
      const named = intent.intent.character?.ground;
      if (named !== undefined && (DISTRICT_GROUND_POLICIES as readonly string[]).includes(named)) {
        return named;
      }
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
