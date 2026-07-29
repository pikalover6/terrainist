/**
 * The Loam v0.2 §4 constraint vocabulary, as far as the settlement profile
 * needs it.
 *
 * Two things live here:
 *
 * 1. **The registry** — every v0.2 constraint type, in §4.1 registry order.
 *    Order is load-bearing: shorthand resolution scans it and takes the first
 *    type whose name appears as a key, which is what makes
 *    `{"along": "main_road", "at": 0.5}` unambiguously an `along`.
 * 2. **The tier split** — which of those types this compiler actually solves.
 *    Anything in the registry but outside tier 1 must *parse* and produce
 *    `LOAM-W407 CONSTRAINT_NOT_IMPLEMENTED`, never an error: a document that is
 *    legal v0.2 stays legal here, it just gets less than it asked for. Only a
 *    type outside the registry entirely is `LOAM-E104`.
 */

/** A canonical constraint: `type` plus that type's fields. */
export interface CanonicalConstraint {
  readonly type: string;
  readonly strength?: "hard" | "soft";
  readonly weight?: number;
  readonly tolerance?: number;
  readonly [field: string]: unknown;
}

/**
 * §4.1 registry order. Adding a type to the end can never make an existing
 * document ambiguous, which is the whole point of fixing the order here.
 */
export const CONSTRAINT_REGISTRY = [
  "within",
  "adjacent_to",
  "facing",
  "along",
  "beside",
  "distance",
  "connected",
  "align",
  "orientation",
  "clearance",
  "terrain_conform",
  "zone",
  "at",
  "course",
  "on",
  "not_overlapping",
  "elevation",
  "slope",
  "spread",
  "cluster",
  "inside_shell",
  "above",
  "below",
  "centered_in",
  "on_axis",
  "visible_from",
  "avoid",
] as const;

/** A constraint type name known to Loam v0.2. */
export type ConstraintType = (typeof CONSTRAINT_REGISTRY)[number];

/** The types the layout solver v1 implements. Everything else is W407. */
export const TIER1_CONSTRAINTS = [
  "zone",
  "at",
  "adjacent_to",
  "distance",
  "facing",
  "not_overlapping",
  "clearance",
  "terrain_conform",
  // §4.4 `on`: a domain restriction against a terrain product, applied at
  // substage 3c beside `within` and demotable at ladder step 5. The solver
  // realizes it outright — there is no later pass that has anything to add —
  // so it is tier 1 rather than tier 2.
  "on",
] as const;

/** A constraint type the solver understands. */
export type Tier1Constraint = (typeof TIER1_CONSTRAINTS)[number];

/**
 * Tier 2: types the solver scores but does not *realize* on its own.
 *
 * `connected` is the archetype, and it is here rather than in tier 1 because
 * satisfying it is two jobs in two passes (§4 `connected`, pass 3 vs pass 6):
 * at solve time it is a **soft proximity cost** — pull the pair together so the
 * connector has a short run — and the connector itself is built by the
 * connective pass long after placement is frozen. A type that is only half
 * solved by the solver would be a lie in the tier-1 list.
 *
 * `along` and `beside` join it for exactly the same reason, and §4.9.6 says so
 * in as many words: a building binds to a **frozen route corridor** registered
 * at substage 3b, and the centreline inside that corridor is only settled by the
 * pass-6 router. The solver's half is real and load-bearing — the corridor is
 * reserved, the lateral offset is costed, the footprint is oriented to the
 * line — but the lane the author pictures is drawn later.
 *
 * `beside` is not a primitive at all: it is `along` with a wider default band
 * and no `faceRoad`, desugared before the solver ever sees it (§4.4).
 */
export const TIER2_CONSTRAINTS = ["connected", "along", "beside"] as const;

/**
 * The `@terrain:` products an `on` constraint resolves against here (§4.2).
 *
 * All three are *derived*, not authored: `coastline` from the finished ocean
 * mask, `ridge` from every `terrain.edit@0` running the `ridge` verb, `peak`
 * from the summit marker each `peak`/`volcano` edit emits. Nothing else in the
 * §4.2 product vocabulary is derived yet, so nothing else is offered.
 */
export const ON_TARGET_PRODUCTS = ["coastline", "ridge", "peak"] as const;

/** An `on` target this compiler resolves. */
export type OnTargetProduct = (typeof ON_TARGET_PRODUCTS)[number];

/** Strip a `@terrain:` prefix from an `on` / `along` target selector. */
export function bareProduct(target: string): string {
  const t = target.trim();
  return t.startsWith("@terrain:") ? t.slice("@terrain:".length) : t;
}

/** True when `target` names a terrain product this compiler derives. */
export function isOnTargetProduct(target: string): target is OnTargetProduct {
  return (ON_TARGET_PRODUCTS as readonly string[]).includes(bareProduct(target));
}

/** A constraint type the solver costs but the connective pass realizes. */
export type Tier2Constraint = (typeof TIER2_CONSTRAINTS)[number];

/** True when the solver scores `type` but a later pass realizes it. */
export function isTier2(type: string): type is Tier2Constraint {
  return (TIER2_CONSTRAINTS as readonly string[]).includes(type);
}

/** True when some pass of this compiler acts on `type` at all. */
export function isImplementedConstraint(type: string): boolean {
  return isTier1(type) || isTier2(type);
}

/**
 * The `connected.via` kinds this compiler realizes.
 *
 * Everything else in the §4 `via` vocabulary stays a `LOAM-W407`
 * pass-through — `road` above all, because a `road.network@0` node already
 * connects doors and a second, constraint-driven road router would fight it.
 */
export const CONNECTED_VIA_IMPLEMENTED = ["tunnel"] as const;

/** True when `via` names a connector kind the connective pass builds. */
export function isImplementedVia(via: string): boolean {
  return (CONNECTED_VIA_IMPLEMENTED as readonly string[]).includes(via);
}

/** True when `type` is a v0.2 constraint type. */
export function isConstraintType(type: string): type is ConstraintType {
  return (CONSTRAINT_REGISTRY as readonly string[]).includes(type);
}

/** True when the solver implements `type`. */
export function isTier1(type: string): type is Tier1Constraint {
  return (TIER1_CONSTRAINTS as readonly string[]).includes(type);
}

/** Per-type primary argument, for shorthand desugaring (§4.4). */
export const PRIMARY_ARG: Readonly<Record<ConstraintType, string>> = Object.freeze({
  within: "target",
  adjacent_to: "target",
  facing: "target",
  along: "target",
  beside: "target",
  distance: "target",
  connected: "to",
  align: "target",
  orientation: "value",
  clearance: "amount",
  terrain_conform: "mode",
  zone: "zone",
  at: "at",
  course: "course",
  on: "target",
  not_overlapping: "target",
  elevation: "range",
  slope: "range",
  spread: "target",
  cluster: "target",
  inside_shell: "target",
  above: "target",
  below: "target",
  centered_in: "target",
  on_axis: "target",
  visible_from: "target",
  avoid: "target",
});

/** Per-type default strength (§4.5). */
export const DEFAULT_STRENGTH: Readonly<Record<ConstraintType, "hard" | "soft">> = Object.freeze({
  within: "hard",
  adjacent_to: "hard",
  facing: "soft",
  along: "hard",
  beside: "hard",
  distance: "hard",
  connected: "hard",
  align: "soft",
  orientation: "hard",
  clearance: "hard",
  terrain_conform: "hard",
  zone: "soft",
  at: "soft",
  course: "hard",
  on: "hard",
  not_overlapping: "hard",
  elevation: "hard",
  slope: "hard",
  spread: "soft",
  cluster: "soft",
  inside_shell: "hard",
  above: "hard",
  below: "hard",
  centered_in: "soft",
  on_axis: "soft",
  visible_from: "soft",
  avoid: "hard",
});

/** Per-type default soft weight (§4.4; 1.0 unless the reference says otherwise). */
export const DEFAULT_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  facing: 2.0,
  zone: 2.0,
  at: 2.0,
  centered_in: 3.0,
});

/**
 * Fields each type declares, beyond the four common ones. Used both to check
 * for unknown keys and to resolve the §4.1 shadowing rules, so it must list a
 * type's fields even where the solver ignores them.
 */
export const CONSTRAINT_FIELDS: Readonly<Record<ConstraintType, readonly string[]>> = Object.freeze({
  within: ["target", "inset", "partial"],
  adjacent_to: ["target", "gap", "face", "overlap", "share"],
  facing: ["target", "frontPort", "strict"],
  along: ["target", "offset", "side", "faceRoad", "spacing", "at"],
  beside: ["target", "offset", "side", "faceRoad", "spacing", "at"],
  distance: ["target", "min", "max", "measure", "axis", "aggregate"],
  // `oreChamber` is this compiler's own: a mine gallery may widen into a
  // working face near its far end, which is a property of the connector and so
  // belongs on the constraint that declares it.
  connected: ["to", "from", "via", "style", "width", "height", "maxGrade", "maxLength", "prefer", "bidirectional", "oreChamber"],
  align: ["target", "axis", "mode"],
  orientation: ["value", "axis"],
  clearance: ["amount", "direction", "of", "against"],
  terrain_conform: ["mode", "reference", "blend", "maxSlope", "step", "skirt"],
  zone: ["zone", "of", "mode", "jitter", "inset", "partial"],
  at: ["at", "of", "mode", "radius"],
  course: ["course", "of", "width", "descend"],
  on: ["target", "band", "partial", "side"],
  not_overlapping: ["target", "margin", "overlapAllowed"],
  elevation: ["range", "datum"],
  slope: ["range"],
  spread: ["target"],
  cluster: ["target"],
  inside_shell: ["target"],
  above: ["target", "gap"],
  below: ["target", "gap"],
  centered_in: ["target"],
  on_axis: ["target"],
  visible_from: ["target"],
  avoid: ["target", "margin"],
});

/** Fields every constraint may carry (§4.1). */
export const COMMON_CONSTRAINT_FIELDS = ["type", "strength", "weight", "tolerance", "note"] as const;

/** The outcome of resolving a constraint object's type key. */
export type TypeKeyResolution =
  | { readonly ok: true; readonly type: ConstraintType; readonly shorthand: boolean; readonly shadowed: readonly string[] }
  | { readonly ok: false; readonly reason: "none" | "ambiguous" | "unknown"; readonly detail: string };

/**
 * Resolve which constraint type an object declares (§4.1).
 *
 * Canonical form (`{"type": "distance", …}`) wins outright. Otherwise the
 * registry is scanned in order and the first type name present as a key is the
 * type; any *other* registry name present must be a declared field of that type
 * (`{"along": …, "at": …}`) or the shorthand is ambiguous.
 */
export function resolveTypeKey(obj: Readonly<Record<string, unknown>>): TypeKeyResolution {
  const declared = obj["type"];
  if (declared !== undefined) {
    if (typeof declared !== "string") {
      return { ok: false, reason: "unknown", detail: String(declared) };
    }
    if (!isConstraintType(declared)) return { ok: false, reason: "unknown", detail: declared };
    return { ok: true, type: declared, shorthand: false, shadowed: [] };
  }

  const present = CONSTRAINT_REGISTRY.filter((name) => obj[name] !== undefined);
  if (present.length === 0) return { ok: false, reason: "none", detail: Object.keys(obj).join(", ") };

  const type = present[0] as ConstraintType;
  const fields = CONSTRAINT_FIELDS[type];
  const shadowed: string[] = [];
  for (const other of present.slice(1)) {
    if (fields.includes(other)) continue;
    // Neither declares the other: two independent constraints in one object.
    if (!CONSTRAINT_FIELDS[other].includes(type)) {
      return { ok: false, reason: "ambiguous", detail: `${type} + ${other}` };
    }
    shadowed.push(other);
  }
  return { ok: true, type, shorthand: true, shadowed };
}

/** Desugar a resolved shorthand into canonical form. */
export function canonicalize(
  obj: Readonly<Record<string, unknown>>,
  type: ConstraintType,
  shorthand: boolean,
): CanonicalConstraint {
  if (!shorthand) return { ...obj, type } as CanonicalConstraint;
  const { [type]: primary, ...rest } = obj;
  return { ...rest, type, [PRIMARY_ARG[type]]: primary } as CanonicalConstraint;
}

/** Effective strength of a canonical constraint, honouring the per-type default. */
export function strengthOf(constraint: CanonicalConstraint): "hard" | "soft" {
  if (constraint.strength === "hard" || constraint.strength === "soft") return constraint.strength;
  const type = constraint.type as ConstraintType;
  // Coarse containment flips hard (§4.5): `mode: "contain"` is a domain.
  if ((type === "zone" || type === "at") && constraint["mode"] === "contain") return "hard";
  return DEFAULT_STRENGTH[type] ?? "hard";
}

/** Effective soft weight of a canonical constraint. */
export function weightOf(constraint: CanonicalConstraint): number {
  if (typeof constraint.weight === "number" && constraint.weight > 0) return constraint.weight;
  return DEFAULT_WEIGHT[constraint.type] ?? 1.0;
}
