/**
 * The urban-form registry and the one dispatch (`docs/URBAN-FORMS-v0.md` §2.4,
 * §2.5).
 *
 * The shape is the intent fan-out registry's, deliberately: one seam function
 * imports every form module and lets it register, the consumer imports the seam,
 * and **no consumer imports a form**. `installUrbanForms()` is called from
 * `layDistrict` the way `ensureFanOutRows()` is.
 *
 * `drawFabric` is the only entry point the fabric pass calls. Adding a form is
 * adding a module and one line here; it is never editing a switch.
 */

import { warning, type LoamDiagnostic, type DistrictFabric } from "@terrainist/spec";

import { CANAL_FORM } from "./canal.js";
import { GRID_FORM } from "./grid.js";
import { GROWN_FORM } from "./grown.js";
import { HILLSIDE_FORM } from "./hillside.js";
import { LINEAR_FORM } from "./linear.js";
import { ORGANIC_FORM } from "./organic.js";
import { RADIAL_FORM } from "./radial.js";
import { TERRACED_FORM } from "./terraced.js";
import type { FormContext, FormPlan, UrbanForm } from "./types.js";

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

const FORMS = new Map<DistrictFabric, UrbanForm>();
let installed = false;

/** Register (or replace) one form, by id. */
export function registerForm(form: UrbanForm): void {
  FORMS.set(form.id, form);
}

/** The form with this id, or `undefined` if none is registered. */
export function urbanForm(id: DistrictFabric): UrbanForm | undefined {
  return FORMS.get(id);
}

/** Every registered form, sorted by id — a fixed order for `terrainist forms`. */
export function urbanForms(): readonly UrbanForm[] {
  return [...FORMS.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Register every form the compiler ships with. Idempotent and cheap.
 *
 * The one seam: this is the only function allowed to import a form module.
 */
export function installUrbanForms(): void {
  if (installed) return;
  registerForm(CANAL_FORM);
  registerForm(GRID_FORM);
  registerForm(GROWN_FORM);
  registerForm(HILLSIDE_FORM);
  registerForm(LINEAR_FORM);
  registerForm(ORGANIC_FORM);
  registerForm(RADIAL_FORM);
  registerForm(TERRACED_FORM);
  installed = true;
}

/** Empty the registry — test-only, so a test can prove the seam is the seam. */
export function clearUrbanForms(): void {
  FORMS.clear();
  installed = false;
}

/* -------------------------------------------------------------------------- */
/* dispatch                                                                    */
/* -------------------------------------------------------------------------- */

/** What {@link drawFabric} is asked for: a {@link FormContext} plus who wants it. */
export interface FabricRequest extends FormContext {
  /** The form the document (or the fan-out row) asked for. */
  readonly fabric: DistrictFabric;
  /** The district's dotted path, for the diagnostic. */
  readonly nodePath: string;
}

/** A drawn plan and whatever the attempt had to say about itself. */
export interface FabricOutcome {
  readonly plan: FormPlan;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Why the whole quarter was refused — the caller turns this into
 * `DISTRICT_TOO_SMALL`, exactly as it does today.
 */
export interface FabricRefusal {
  readonly reason: string;
  readonly fix: string;
}

/** A drawn fabric, or the measured reason there is none. */
export type FabricResult =
  | { readonly ok: true; readonly outcome: FabricOutcome }
  | { readonly ok: false; readonly refusal: FabricRefusal };

/**
 * Draw the requested form, or the announced fallback.
 *
 * 1. look the form up;
 * 2. check `requires` against the request — span, relief, levelling, polygon;
 * 3. on a miss, or on an `ok: false` from `draw`, emit **one** `DISTRICT_FORM`
 *    diagnostic naming the requested form, the measurement that failed and the
 *    fix, then draw the declared fallback;
 * 4. never fall back twice — a fallback that itself fails refuses the quarter.
 *
 * Two deliberate readings of §2.5, both of them in service of byte-identity:
 *
 * - **A requirement miss whose fallback is `null` still calls `draw`.** The form
 *   is the thing that can phrase its own measurement (`grid` has said the same
 *   sentence about `blockSize` and `envelope.size` since fabric v2), and the
 *   caller's `DISTRICT_TOO_SMALL` is the diagnostic the author already gets. A
 *   second warning on top of it would be new output for an unchanged document.
 * - **An id with no registered form throws.** Every id in `DISTRICT_FABRICS`
 *   has a module and a test asserts both directions of that, so a missing form
 *   is a compiler bug rather than an authoring error; the validator has already
 *   refused anything outside the vocabulary.
 */
export function drawFabric(request: FabricRequest): FabricResult {
  installUrbanForms();
  const diagnostics: LoamDiagnostic[] = [];
  const attempt = attemptForm(request, request.fabric, diagnostics, true);
  if ("graph" in attempt) return { ok: true, outcome: { plan: attempt, diagnostics } };
  return { ok: false, refusal: attempt };
}

/**
 * One attempt at one form: a plan, or the measurement that refused the quarter.
 *
 * `mayFallBack` is false on the second call, which is how "never fall back
 * twice" is enforced structurally rather than by a counter.
 */
function attemptForm(
  request: FabricRequest,
  id: DistrictFabric,
  diagnostics: LoamDiagnostic[],
  mayFallBack: boolean,
): FormPlan | FabricRefusal {
  const form = urbanForm(id);
  if (form === undefined) {
    // Every id in the vocabulary now has a module, and a test asserts both
    // directions of that (`forms-vocabulary.test.ts`). So an id with no form is
    // a compiler bug either way: the validator has already refused anything
    // outside `DISTRICT_FABRICS`, and anything inside it is registered.
    throw new Error(
      `no urban form is registered for "${id}" — every id in DISTRICT_FABRICS has a module, so this is a compiler bug, not an authoring error`,
    );
  }

  const miss = unmetRequirement(form, request);
  if (miss !== null && form.requires.fallback !== null && mayFallBack) {
    diagnostics.push(
      warning("DISTRICT_FORM", request.nodePath, describeMiss(id, miss, form.requires.fallback), miss.fix),
    );
    return withFallbackRecord(
      attemptForm(request, form.requires.fallback, diagnostics, false),
      id,
      miss.reason,
    );
  }

  const drawn = form.draw(request);
  if (drawn.ok) return drawn.plan;

  if (mayFallBack && drawn.fallback !== null) {
    diagnostics.push(
      warning(
        "DISTRICT_FORM",
        request.nodePath,
        `the "${id}" urban form cannot be drawn here — ${drawn.reason} — so this quarter is drawn as "${drawn.fallback}" instead`,
        drawn.fix,
      ),
    );
    return withFallbackRecord(
      attemptForm(request, drawn.fallback, diagnostics, false),
      id,
      drawn.reason,
    );
  }

  return { reason: drawn.reason, fix: drawn.fix };
}

/** Stamp "this is not what was asked for" onto a fallback's record. */
function withFallbackRecord(
  plan: FormPlan | FabricRefusal,
  requested: DistrictFabric,
  because: string,
): FormPlan | FabricRefusal {
  if (!("graph" in plan)) return plan;
  return {
    ...plan,
    record: { ...plan.record, requested, fellBackBecause: because },
  };
}

/** One unmet requirement, in the author's terms. */
interface RequirementMiss {
  readonly reason: string;
  readonly fix: string;
}

/** The first requirement the request does not meet, in a fixed order. */
function unmetRequirement(form: UrbanForm, ctx: FormContext): RequirementMiss | null {
  const width = ctx.bounds.x1 - ctx.bounds.x0 + 1;
  const depth = ctx.bounds.z1 - ctx.bounds.z0 + 1;
  const span = Math.min(width, depth);
  if (span < form.requires.minSpan) {
    return {
      reason: `it needs ${form.requires.minSpan} blocks on its short axis and this quarter is ${width} × ${depth}`,
      fix: `grow "envelope.size" to at least [${form.requires.minSpan}, ${form.requires.minSpan}], or lower "params.blockSize" so more of the plan fits`,
    };
  }
  const minRelief = form.requires.minRelief ?? 0;
  if (minRelief > 0 && ctx.ground.relief < minRelief) {
    return {
      reason: `it lays its streets along the contours of the ground, and the ground under this quarter has ${ctx.ground.relief} blocks of relief where it needs at least ${minRelief}`,
      fix: 'move the quarter onto a slope with a "zone" or "at" constraint, or drop "terrain_conform"',
    };
  }
  if (form.requires.unlevelled === true && ctx.ground.levelled) {
    return {
      reason: "the ground under this quarter was levelled before the fabric was drawn, so there are no contours left to follow",
      fix: 'drop "terrain_conform" from this district — a contour-led quarter levels itself, one bench at a time',
    };
  }
  if (!form.requires.polygon && (ctx.mask !== undefined || (ctx.orientation ?? 0) % 360 !== 0)) {
    return {
      reason: "it can only be drawn on a rectangle drawn to the world axes, and this quarter is a clipped, rotated cell of a city plan",
      fix: "write this quarter as its own \"district\" node beside the city rather than as a city character",
    };
  }
  return null;
}

/** The sentence a requirement miss prints. */
function describeMiss(id: DistrictFabric, miss: RequirementMiss, fallback: DistrictFabric): string {
  return `the "${id}" urban form cannot be drawn here — ${miss.reason} — so this quarter is drawn as "${fallback}" instead`;
}

