/**
 * Constraint evaluation — Loam v0.2 §4.4/§4.9.4 for the tier-1 vocabulary.
 *
 * Every constraint reduces to the same two questions: *is this candidate
 * allowed* (hard) and *how much does it cost* (soft). Keeping both behind one
 * interface is what §4.7's "expressible as costs + domain restrictions, so a
 * better solver is a drop-in" asks for.
 *
 * Soft costs are normalized by `frameNorm` — the frame's half-diagonal — so a
 * cost of 1 means "a frame away" whatever the region size, and the terrain
 * cost (also 0..1) is comparable with them.
 */

import {
  isImplementedConstraint,
  isTier2,
  strengthOf,
  weightOf,
  type CanonicalConstraint,
  type HorizontalFace,
  type Yaw,
} from "@terrainist/spec/ir";

import {
  corridorHit,
  resolveCorridor,
  type RouteCorridor,
} from "./corridors.js";
import {
  distanceToRect,
  intersectRect,
  isZoneToken,
  jitteredZonePoint,
  zoneRect,
  type Frame,
  type Point2,
  type Rect,
} from "./frames.js";
import { frontFace, rotateFace } from "./ports.js";
import { productSideAt, type TerrainProductIndex } from "./products.js";
import type { LayoutNodeInput, Placement } from "./types.js";

/** A candidate placement being scored. */
export interface Candidate {
  readonly rect: Rect;
  readonly anchor: Point2;
  readonly yaw: Yaw;
}

/** What constraint evaluation needs to know about the rest of the world. */
export interface EvalContext {
  readonly frame: Frame;
  readonly frameNorm: number;
  readonly self: LayoutNodeInput;
  /** Placements so far, keyed by node id. */
  readonly placed: ReadonlyMap<string, Placement>;
  /** Every node the solver knows about, keyed by id — for tag selectors. */
  readonly nodes: readonly LayoutNodeInput[];
  /** Route corridors frozen at substage 3b (§4.9.6) — what `along` binds to. */
  readonly corridors?: readonly RouteCorridor[];
  /** Derived `@terrain:` products — what `on` restricts against (§4.2). */
  readonly products?: TerrainProductIndex;
}

/** The verdict on one constraint against one candidate. */
export interface ConstraintEval {
  /** False only for a *hard* constraint the candidate violates. */
  readonly feasible: boolean;
  /** Weighted, normalized soft cost. Zero for a satisfied constraint. */
  readonly cost: number;
  /** True when the constraint's own predicate holds, whatever its strength. */
  readonly satisfied: boolean;
}

const OK: ConstraintEval = { feasible: true, cost: 0, satisfied: true };

/**
 * Resolve a §4.2 selector to sibling node ids.
 *
 * v0.2 §4.2: not yet — absolute paths, `@terrain:*` products, `@theme:*`,
 * `@world:*` anchors and port refs are not resolved; those selectors yield no
 * targets and their constraint is reported unsatisfied rather than enforced.
 */
export function resolveTargets(
  selector: string,
  self: LayoutNodeInput,
  nodes: readonly LayoutNodeInput[],
): string[] {
  const sel = selector.trim();
  if (sel === "self") return [self.id];
  if (sel.startsWith("#tag:")) {
    const tag = sel.slice(5);
    return nodes.filter((n) => n.tags.includes(tag) && n.id !== self.id).map((n) => n.id);
  }
  const bare = sel.startsWith("^.") ? sel.slice(2) : sel;
  if (bare === "^" || bare === "parent" || bare === "root") return [];
  const withoutPort = bare.split("#")[0] as string;
  const leaf = withoutPort.includes(".")
    ? (withoutPort.split(".").pop() as string)
    : withoutPort;
  const match = nodes.find((n) => n.id === leaf);
  return match === undefined ? [] : [match.id];
}

/**
 * The relational constraint types whose target is resolved by
 * {@link resolveTargets} — the ones an unresolvable selector can silence.
 */
const NODE_TARGET_TYPES: ReadonlySet<string> = new Set([
  "distance",
  "adjacent_to",
  "facing",
  "connected",
]);

/** The node selector a relational constraint aims at, or `undefined`. */
export function constraintTargetSelector(
  constraint: CanonicalConstraint,
): string | undefined {
  if (!NODE_TARGET_TYPES.has(constraint.type)) return undefined;
  const field = constraint.type === "connected" ? constraint["to"] : constraint["target"];
  return typeof field === "string" ? field : undefined;
}

/**
 * A selector that names something and resolves to **nothing** (LOAM-W523).
 *
 * Deliberately narrower than `resolveTargets(...) === []`. That is also the
 * answer for `self` (never a real target), for the relative anchors `^`,
 * `parent` and `root`, and for the `@…` namespaces §4.2 does not resolve yet —
 * all of which are known, documented silences. What is left is the one case
 * nobody knows about: an ordinary id, or a `#tag:` selector, matching no node
 * the solver has ever heard of.
 */
export function isUnresolvableTarget(
  selector: string,
  self: LayoutNodeInput,
  nodes: readonly LayoutNodeInput[],
): boolean {
  const sel = selector.trim();
  if (sel === "" || sel === "self" || sel.startsWith("@")) return false;
  const bare = sel.startsWith("^.") ? sel.slice(2) : sel;
  if (bare === "^" || bare === "parent" || bare === "root") return false;
  return resolveTargets(sel, self, nodes).length === 0;
}

/** Evaluate one constraint against one candidate. */
export function evaluateConstraint(
  constraint: CanonicalConstraint,
  index: number,
  candidate: Candidate,
  ctx: EvalContext,
  demoted: boolean,
): ConstraintEval {
  if (!isImplementedConstraint(constraint.type)) return OK;
  // §4 `connected`: pass 3 contributes a *soft* proximity cost whatever the
  // declared strength, because the thing the strength governs — the connector
  // existing — is decided in pass 6, not here. Treating the declared `hard`
  // as a domain restriction would veto every placement in the region.
  const hard = !demoted && !isTier2(constraint.type) && strengthOf(constraint) === "hard";
  const weight = weightOf(constraint);

  switch (constraint.type) {
    case "zone":
      return coarseEval(coarseZoneRegion(constraint, index, ctx), candidate, hard, weight, ctx);
    case "at":
      return coarseEval(coarseAtRegion(constraint, ctx), candidate, hard, weight, ctx);
    case "distance":
      return distanceEval(constraint, candidate, ctx, hard, weight);
    case "adjacent_to":
      return adjacentEval(constraint, candidate, ctx, hard, weight);
    case "facing":
      return facingEval(constraint, candidate, ctx, hard, weight);
    case "connected":
      return connectedEval(constraint, candidate, ctx, weight);
    case "along":
      return alongEval(constraint, candidate, ctx, weight);
    case "on":
      return onEval(constraint, candidate, ctx, hard, weight);
    // `not_overlapping`, `clearance` and `terrain_conform` are enforced
    // structurally by the solver (overlap tests, pad edits), not as costs.
    default:
      return OK;
  }
}

/* -------------------------------------------------------------------------- */
/* coarse placement (§4.9.4)                                                   */
/* -------------------------------------------------------------------------- */

/** The zero-cost region of a coarse constraint, plus the seeded search point. */
export interface CoarseRegion {
  readonly region: Rect | null;
  readonly seedPoint: Point2;
  readonly mode: "center" | "contain";
}

/** Resolve a `zone` constraint's cell and jittered seed point. */
export function coarseZoneRegion(
  constraint: CanonicalConstraint,
  index: number,
  ctx: EvalContext,
): CoarseRegion {
  const token = constraint["zone"];
  const mode = constraint["mode"] === "contain" ? "contain" : "center";
  if (typeof token !== "string" || !isZoneToken(token)) {
    return { region: null, seedPoint: { x: ctx.frame.x0, z: ctx.frame.z0 }, mode };
  }
  const rect = zoneRect(ctx.frame, token);
  const jitter = typeof constraint["jitter"] === "number" ? constraint["jitter"] : 0.1;
  const seedPoint = jitteredZonePoint(ctx.frame, token, jitter, ctx.self.seed, index);
  return { region: rect, seedPoint, mode };
}

/** Resolve an `at` constraint's tolerance disc (as its bounding rect) and point. */
export function coarseAtRegion(constraint: CanonicalConstraint, ctx: EvalContext): CoarseRegion {
  const value = constraint["at"];
  const mode = constraint["mode"] === "contain" ? "contain" : "center";
  if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") {
    // A terrain-anchor `at` (string form) — reported W407 by the validator.
    return { region: null, seedPoint: { x: ctx.frame.x0, z: ctx.frame.z0 }, mode };
  }
  const point = {
    x: ctx.frame.x0 + Math.floor((value[0] as number) * ctx.frame.width),
    z: ctx.frame.z0 + Math.floor((value[1] as number) * ctx.frame.depth),
  };
  const tolerance =
    typeof constraint.tolerance === "number"
      ? constraint.tolerance
      : typeof constraint["radius"] === "number"
        ? (constraint["radius"] as number)
        : 0.05 * ctx.frameNorm;
  const r = Math.max(0, Math.floor(tolerance));
  const rect: Rect = { x0: point.x - r, z0: point.z - r, x1: point.x + r, z1: point.z + r };
  return { region: rect, seedPoint: point, mode };
}

/**
 * The §4.9.4 cost, with its deadzone: **exactly zero anywhere inside the
 * target region**, growing with distance outside it.
 *
 * The deadzone is the whole point. A cost measured to the cell *centre* would
 * pull every zoned feature onto a 3×3 lattice and make every world look
 * gridded; the author meant "somewhere in the north", and the cost function has
 * to say so.
 */
function coarseEval(
  coarse: CoarseRegion,
  candidate: Candidate,
  hard: boolean,
  weight: number,
  ctx: EvalContext,
): ConstraintEval {
  if (coarse.region === null) return OK;
  if (coarse.mode === "contain") {
    // A domain restriction (§4.9.4): the footprint lies inside the cell.
    const clipped = intersectRect(coarse.region, candidate.rect);
    const inside =
      clipped !== null &&
      clipped.x0 === candidate.rect.x0 &&
      clipped.x1 === candidate.rect.x1 &&
      clipped.z0 === candidate.rect.z0 &&
      clipped.z1 === candidate.rect.z1;
    if (inside) return OK;
    if (hard) return { feasible: false, cost: 0, satisfied: false };
    const d = distanceToRect(coarse.region, candidate.anchor.x, candidate.anchor.z);
    return { feasible: true, cost: (weight * d) / ctx.frameNorm, satisfied: false };
  }
  const d = distanceToRect(coarse.region, candidate.anchor.x, candidate.anchor.z);
  if (d === 0) return OK;
  const cost = (weight * d) / ctx.frameNorm;
  return { feasible: !hard, cost: hard ? 0 : cost, satisfied: false };
}

/* -------------------------------------------------------------------------- */
/* relational constraints                                                      */
/* -------------------------------------------------------------------------- */

/** Nearest-face horizontal gap between two rectangles; 0 when they touch or overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = b.x0 > a.x1 ? b.x0 - a.x1 - 1 : a.x0 > b.x1 ? a.x0 - b.x1 - 1 : 0;
  const dz = b.z0 > a.z1 ? b.z0 - a.z1 - 1 : a.z0 > b.z1 ? a.z0 - b.z1 - 1 : 0;
  if (dx === 0 && dz === 0) return 0;
  return Math.sqrt(dx * dx + dz * dz);
}

function centerOf(rect: Rect): Point2 {
  return { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
}

function distanceEval(
  constraint: CanonicalConstraint,
  candidate: Candidate,
  ctx: EvalContext,
  hard: boolean,
  weight: number,
): ConstraintEval {
  const target = constraint["target"];
  if (typeof target !== "string") return OK;
  const ids = resolveTargets(target, ctx.self, ctx.nodes);
  const rects = ids
    .map((id) => ctx.placed.get(id))
    .filter((p): p is Placement => p !== undefined)
    .map((p) => p.footprint);
  // Nothing placed yet: the constraint is evaluated in full during the
  // local-improvement pass, when every sibling has a position.
  if (rects.length === 0) return OK;

  const measure = constraint["measure"] === "center" ? "center" : "surface";
  // v0.2 §4.4 `distance`: not yet — `axis: "3d"`/`"vertical"` fall back to the
  // horizontal measure; the solver has no vertical freedom to trade off.
  const distances = rects.map((r) =>
    measure === "center"
      ? euclid(centerOf(r).x - candidate.anchor.x, centerOf(r).z - candidate.anchor.z)
      : rectGap(candidate.rect, r),
  );

  const aggregate = constraint["aggregate"];
  const min = typeof constraint["min"] === "number" ? constraint["min"] : 0;
  const max = typeof constraint["max"] === "number" ? constraint["max"] : Number.POSITIVE_INFINITY;

  const violations = distances.map((d) => Math.max(0, min - d, d === Number.POSITIVE_INFINITY ? 0 : d - max));
  let violation: number;
  if (aggregate === "any") violation = Math.min(...violations);
  else if (aggregate === "nearest") violation = violations[indexOfMin(distances)] as number;
  else violation = Math.max(...violations);

  if (violation === 0) return OK;
  if (hard) return { feasible: false, cost: 0, satisfied: false };
  return { feasible: true, cost: (weight * violation) / ctx.frameNorm, satisfied: false };
}

function adjacentEval(
  constraint: CanonicalConstraint,
  candidate: Candidate,
  ctx: EvalContext,
  hard: boolean,
  weight: number,
): ConstraintEval {
  const target = constraint["target"];
  if (typeof target !== "string") return OK;
  const ids = resolveTargets(target, ctx.self, ctx.nodes);
  const rects = ids
    .map((id) => ctx.placed.get(id))
    .filter((p): p is Placement => p !== undefined)
    .map((p) => p.footprint);
  if (rects.length === 0) return OK;

  const gapField = constraint["gap"];
  const [gapMin, gapMax] = Array.isArray(gapField)
    ? [gapField[0] as number, gapField[1] as number]
    : typeof gapField === "number"
      ? [gapField, gapField]
      : [0, 1];
  const overlapWanted =
    constraint["overlap"] === "full"
      ? Number.POSITIVE_INFINITY
      : typeof constraint["overlap"] === "number"
        ? (constraint["overlap"] as number)
        : 2;

  let best = Number.POSITIVE_INFINITY;
  for (const r of rects) {
    const gap = rectGap(candidate.rect, r);
    const shared = sharedFaceLength(candidate.rect, r);
    const wanted = overlapWanted === Number.POSITIVE_INFINITY ? faceExtent(candidate.rect, r) : overlapWanted;
    const gapViolation = Math.max(0, gapMin - gap, gap - gapMax);
    const overlapViolation = Math.max(0, wanted - shared);
    best = Math.min(best, gapViolation + overlapViolation);
  }
  if (best === 0) return OK;
  if (hard) return { feasible: false, cost: 0, satisfied: false };
  return { feasible: true, cost: (weight * best) / ctx.frameNorm, satisfied: false };
}

/** Length of the shared face between two rectangles along their touching axis. */
function sharedFaceLength(a: Rect, b: Rect): number {
  const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
  const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) + 1;
  if (xOverlap > 0 && zOverlap <= 0) return xOverlap;
  if (zOverlap > 0 && xOverlap <= 0) return zOverlap;
  return Math.max(0, Math.max(xOverlap, zOverlap));
}

/** The most face two rectangles could possibly share. */
function faceExtent(a: Rect, b: Rect): number {
  return Math.min(
    Math.min(a.x1 - a.x0 + 1, b.x1 - b.x0 + 1),
    Math.min(a.z1 - a.z0 + 1, b.z1 - b.z0 + 1),
  );
}

/**
 * `connected` — the pass-3 half of a connector (§4 `connected`).
 *
 * A tunnel is dug, block by block, between two cellars, so its length is a real
 * cost: every block of it is stone removed, lining laid and a walk the player
 * has to make. The solver cannot dig it — that is pass 6 — but it *can* stop
 * putting the two ends at opposite corners of the map, and that is all this
 * term does: a normalized nearest-face distance, weighted, exactly comparable
 * with `distance` and the coarse terms.
 *
 * Deliberately not a hard bound. `maxLength` belongs to the router, which is
 * the only thing that knows the route the ground actually allows; failing a
 * placement here for a distance the router might have managed would trade a
 * buildable world for a demotion diagnostic.
 */
function connectedEval(
  constraint: CanonicalConstraint,
  candidate: Candidate,
  ctx: EvalContext,
  weight: number,
): ConstraintEval {
  const target = constraint["to"];
  if (typeof target !== "string") return OK;
  const ids = resolveTargets(target, ctx.self, ctx.nodes);
  const rects = ids
    .map((id) => ctx.placed.get(id))
    .filter((p): p is Placement => p !== undefined)
    .map((p) => p.footprint);
  // The other end is not placed yet; the local-improvement pass scores this in
  // full once it is, exactly as `distance` does.
  if (rects.length === 0) return OK;

  let nearest = Number.POSITIVE_INFINITY;
  for (const r of rects) nearest = Math.min(nearest, rectGap(candidate.rect, r));
  if (nearest === 0) return OK;
  return { feasible: true, cost: (weight * nearest) / ctx.frameNorm, satisfied: true };
}

/* -------------------------------------------------------------------------- */
/* `along` / `beside` (§4.4, §4.9.6)                                           */
/* -------------------------------------------------------------------------- */

/** Default lateral band of an `along` constraint, in blocks (§4.4). */
export const ALONG_DEFAULT_OFFSET: readonly [number, number] = [1, 4];

/** Default lateral band of a `beside`, which is a wider `along` (§4.4). */
export const BESIDE_DEFAULT_OFFSET: readonly [number, number] = [2, 8];

/**
 * `along` — the pass-3 half of a corridor binding (§4.4, §4.9.6).
 *
 * Everything is measured against the **corridor**, never against a centreline:
 * the polygon is frozen at 3b and the line inside it is still the router's to
 * choose, so a cost read off the line would be a cost read off a number that is
 * going to change. `corridorHit` returns the distance to the centreline and
 * `clearance` is that minus the half-width — the distance to the corridor's
 * *edge*, which is what §4.4's `offset` is defined against.
 *
 * Four terms, all in blocks, all normalized by `frameNorm` like every other
 * soft cost in this file:
 *
 * 1. **offset** — how far outside `[min, max]` the lateral clearance falls;
 * 2. **side** — a flat miss of the band's own width when the footprint is on
 *    the wrong side of the line, which is never satisfiable by moving closer;
 * 3. **`at`** — how far along the run the closest point is, against the
 *    declared normalized stretch, converted back to blocks by the run length;
 * 4. **orientation** — for an elongated footprint, whether its long axis runs
 *    with the corridor. A hall built across the street rather than along it is
 *    the single most visible way to get this constraint wrong, and yaw is
 *    quantized to 90°, so the test is just "is the long axis the same axis the
 *    line mostly runs on". Charged as the footprint's own long extent, so a
 *    barn cares about it more than a shed does.
 *
 * Scored soft whatever the declared strength, exactly as `connected` is, and
 * for the same reason: §4.9.6 hands the last word to a pass-6 re-route and a
 * bounded nudge. Vetoing placements at 3d against a corridor drawn from coarse
 * anchor points would be this compiler pretending to a precision it does not
 * have until pass 6.
 */
function alongEval(
  constraint: CanonicalConstraint,
  candidate: Candidate,
  ctx: EvalContext,
  weight: number,
): ConstraintEval {
  const target = constraint["target"];
  if (typeof target !== "string") return OK;
  const corridor = resolveCorridor(target, ctx.corridors ?? []);
  // Nothing registered a corridor by that name. Reported unsatisfied — the
  // author asked for something the document does not contain — but never a
  // veto: an unresolvable target must not delete the node from the world.
  if (corridor === null) return { feasible: true, cost: 0, satisfied: false };

  const hit = corridorHit(corridor, candidate.anchor.x, candidate.anchor.z);
  const fallback = constraint["desugaredFrom"] === "beside" ? BESIDE_DEFAULT_OFFSET : ALONG_DEFAULT_OFFSET;
  const [near, far] = offsetRange(constraint["offset"], fallback);

  let violation = Math.max(0, near - hit.clearance, hit.clearance - far);

  const side = constraint["side"];
  if ((side === "left" || side === "right") && hit.side !== 0) {
    const want = side === "left" ? 1 : -1;
    if (hit.side !== want) violation += far - near + 1;
  }

  const at = constraint["at"];
  if (at !== undefined) {
    const [lo, hi] = Array.isArray(at)
      ? [at[0] as number, at[1] as number]
      : typeof at === "number"
        ? [at, at]
        : [0, 1];
    const miss = Math.max(0, lo - hit.position, hit.position - hi);
    violation += miss * corridor.length;
  }

  let cost = (weight * violation) / ctx.frameNorm;
  const satisfied = violation === 0;

  // --- orientation ---------------------------------------------------------
  const w = candidate.rect.x1 - candidate.rect.x0 + 1;
  const d = candidate.rect.z1 - candidate.rect.z0 + 1;
  const longExtent = Math.max(w, d);
  const shortExtent = Math.min(w, d);
  if (longExtent >= ALONG_ELONGATION * shortExtent) {
    const lineAxis = Math.abs(hit.tangent.x) >= Math.abs(hit.tangent.z) ? "x" : "z";
    const longAxis = w >= d ? "x" : "z";
    if (longAxis !== lineAxis) cost += (weight * longExtent) / ctx.frameNorm;
  }

  // --- faceRoad ------------------------------------------------------------
  // §4.4: `faceRoad` defaults true on `along` and false on `beside`, and the
  // desugaring has already written the right default into the constraint.
  if (constraint["faceRoad"] === true) {
    const local = frontFace(ctx.self.ports, undefined);
    const world = rotateFace(local, candidate.yaw);
    const angle = faceAngleTo(world, candidate.anchor, {
      x: Math.floor(hit.closest.x),
      z: Math.floor(hit.closest.z),
    });
    if (angle > 0) cost += (weight * angle) / 180;
  }

  return { feasible: true, cost, satisfied };
}

/** Aspect ratio at which a footprint counts as elongated enough to orient. */
export const ALONG_ELONGATION = 1.5;

/** Read an `offset` field: a number, a `[min, max]` pair, or the type's default. */
function offsetRange(value: unknown, fallback: readonly [number, number]): [number, number] {
  if (typeof value === "number") return [value, value];
  if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") {
    return [value[0] as number, value[1] as number];
  }
  return [fallback[0] as number, fallback[1] as number];
}

/* -------------------------------------------------------------------------- */
/* `on` (§4.4)                                                                 */
/* -------------------------------------------------------------------------- */

/** `on.band` — how far a point or polyline product widens into a domain. */
export const ON_DEFAULT_BAND = 8;

/** `on.partial` — the fraction of the footprint that must lie in the band. */
export const ON_DEFAULT_PARTIAL = 0.5;

/**
 * `on` — the footprint sits on a terrain product (§4.4).
 *
 * A **domain restriction**, applied here rather than as a pull: hard by
 * default, so a candidate that misses the band is infeasible and the ladder
 * demotes the constraint (step 5) if nothing else works. That is exactly what
 * §4.9's "hard coarse constraints" paragraph asks for, and it is the difference
 * between "the lighthouse is on the coast" and "the lighthouse would rather be
 * on the coast".
 *
 * The measure is the fraction of the footprint's columns inside the widened
 * product, compared against `partial`. Soft cost, when demoted, is the shortfall
 * in that fraction scaled to blocks by the footprint's own diagonal — so it is
 * in the same units as every other term and a near miss reads as a near miss.
 */
function onEval(
  constraint: CanonicalConstraint,
  candidate: Candidate,
  ctx: EvalContext,
  hard: boolean,
  weight: number,
): ConstraintEval {
  const target = constraint["target"];
  if (typeof target !== "string") return OK;
  const products = ctx.products;
  if (products === undefined) return OK;
  const product = products.get(target);
  // The document names a product this terrain did not produce — no coast in a
  // landlocked region, no ridge edit anywhere. Unsatisfied, never a veto: an
  // empty domain would delete every candidate and the node with it.
  if (product === null) return { feasible: true, cost: 0, satisfied: false };

  const band = typeof constraint["band"] === "number" ? constraint["band"] : ON_DEFAULT_BAND;
  const mask = products.band(target, band);
  if (mask === null) return { feasible: true, cost: 0, satisfied: false };

  const wantPartial = typeof constraint["partial"] === "number" ? constraint["partial"] : ON_DEFAULT_PARTIAL;
  const side = constraint["side"];
  const wantSide = side === "left" ? 1 : side === "right" ? -1 : 0;
  const { region } = products;

  let inside = 0;
  let total = 0;
  for (let z = candidate.rect.z0; z <= candidate.rect.z1; z++) {
    const j = z - region.z0;
    for (let x = candidate.rect.x0; x <= candidate.rect.x1; x++) {
      total++;
      const i = x - region.x0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      if (mask[j * region.width + i] !== 1) continue;
      if (wantSide !== 0 && productSideAt(product, x, z) !== wantSide) continue;
      inside++;
    }
  }
  const fraction = total === 0 ? 0 : inside / total;
  if (fraction >= wantPartial) return OK;
  if (hard) return { feasible: false, cost: 0, satisfied: false };

  const dx = candidate.rect.x1 - candidate.rect.x0 + 1;
  const dz = candidate.rect.z1 - candidate.rect.z0 + 1;
  const diagonal = Math.sqrt(dx * dx + dz * dz);
  return {
    feasible: true,
    cost: (weight * (wantPartial - fraction) * diagonal) / ctx.frameNorm,
    satisfied: false,
  };
}

/**
 * `facing` — the node's front points at the target (§4.4).
 *
 * Because yaw is quantized, `tolerance: 45` means "the nearest cardinal is
 * good enough", which is nearly always achievable; that is exactly why the
 * constraint is soft by default.
 */
function facingEval(
  constraint: CanonicalConstraint,
  candidate: Candidate,
  ctx: EvalContext,
  hard: boolean,
  weight: number,
): ConstraintEval {
  // A bespoke landmark's yaw is not the solver's: it was decided from
  // `params.face` before its (already turned) box was reserved, and
  // `rotations` is `[0]`. So the only way this constraint could ever be
  // "satisfied" is by *moving* the landmark until its frozen front happens to
  // point the right way — which is how a colossus authored onto one island
  // ends up on another. It is named at validation (`LOAM-W519`) and costs
  // nothing here.
  if (ctx.self.landmark === true) return OK;
  const target = constraint["target"];
  if (typeof target !== "string") return OK;
  const ids = resolveTargets(target, ctx.self, ctx.nodes);
  const placements = ids.map((id) => ctx.placed.get(id)).filter((p): p is Placement => p !== undefined);
  if (placements.length === 0) return OK;
  const goal = placements[0] as Placement;

  const frontPort = typeof constraint["frontPort"] === "string" ? (constraint["frontPort"] as string) : undefined;
  const local = frontFace(ctx.self.ports, frontPort);
  const world = rotateFace(local, candidate.yaw);
  const angle = faceAngleTo(world, candidate.anchor, goal.anchor);

  const strict = constraint["strict"] === true;
  const tolerance = strict ? 0 : typeof constraint.tolerance === "number" ? constraint.tolerance : 45;
  if (angle <= tolerance) return OK;
  if (hard) return { feasible: false, cost: 0, satisfied: false };
  return { feasible: true, cost: (weight * (angle - tolerance)) / 180, satisfied: false };
}

/**
 * Angle in degrees between a face's outward direction and the bearing to a
 * point, quantized to the cardinals: 0, 90 or 180.
 *
 * Quantization is not an approximation here, it is the honest answer. Yaw is
 * quantized to 90°, so the only question the solver can act on is "does this
 * face point at the nearest cardinal to the target"; and computing a real
 * angle would need `acos`, which §6.5 rule 6 forbids because its last bits
 * vary by engine.
 */
export function faceAngleTo(face: HorizontalFace, from: Point2, to: { x: number; z: number }): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) return 0;
  // Ties (|dx| === |dz|) resolve to the X axis, deterministically.
  const nearest: HorizontalFace =
    Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? "east" : "west") : dz >= 0 ? "south" : "north";
  if (face === nearest) return 0;
  return OPPOSITE[nearest] === face ? 180 : 90;
}

const OPPOSITE: Readonly<Record<HorizontalFace, HorizontalFace>> = Object.freeze({
  north: "south",
  south: "north",
  east: "west",
  west: "east",
});

/** Euclidean length. `Math.sqrt` is IEEE-exact; `Math.hypot` is not (§6.5). */
function euclid(dx: number, dz: number): number {
  return Math.sqrt(dx * dx + dz * dz);
}

function indexOfMin(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if ((values[i] as number) < (values[best] as number)) best = i;
  }
  return best;
}
