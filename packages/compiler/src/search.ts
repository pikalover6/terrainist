/**
 * Neutral Chebyshev ring enumeration — the shared deterministic placement
 * search used by city routing, radial projection, vista square seating,
 * and road hub/free-cell lookups.
 *
 * The order is the same everywhere: for radius r = start .. max step `step`,
 * visit the Chebyshev ring `max(|dx|,|dz|)==r` in z-then-x order
 * (`dz = -r..r` outer, `dx = -r..r` inner, skipping interior where
 * `max(|dx|,|dz|) != r`). Radius 0 yields only the origin. First-fit
 * short-circuits on the first eligible candidate; callers keep their own
 * fallback (return origin, return null, fall back to largest anchor, …).
 *
 * Determinism, integer arithmetic and allocation are preserved: no float
 * math, no sorting, no hash ordering, and the iteration order is fixed.
 * The helper hides only the nested-loop boilerplate; start radius, max
 * radius, step, bounds and eligibility remain explicit at each call site.
 *
 * ## Not unified (intentional)
 *
 * Four materially different searches keep their own implementations and
 * MUST NOT be migrated to this module:
 *
 * - `structures/props.ts` `spiral()` — squared-Euclidean distance,
 *   `d² = dx²+dz²` sorted with `z` then `x` tie-break; total order on
 *   columns rather than Chebyshev rings, so reordering would move props.
 * - `structures/farm.ts` lattice/parcel search — scans on a 2-column
 *   lattice, scores by parcel state and lattice parity, not first-fit rings.
 * - `layout/harbour` / coastal ranking — ranks candidates by shore
 *   heuristics rather than returning the first eligible ring.
 * - `programs/*` scatter / program seat search — eligibility depends on
 *   program budget, collision sets and per-program ranking; not a pure
 *   geometric ring search.
 *
 * A generic strategy DSL would hide these differences instead of deleting
 * duplication. Documenting the seam here keeps the boundary honest.
 */

import type { Point2 } from "./layout/frames.js";

/**
 * Enumerate Chebyshev rings around `origin` in the fixed order callers
 * previously hand-rolled. `startRadius`/`maxRadius` inclusive, `step`
 * defaults to 1. Yielded points are fresh `{x,z}` objects in
 * z-then-x order within each ring.
 */
export function* enumerateChebyshevRing(
  origin: Point2,
  startRadius: number,
  maxRadius: number,
  step = 1,
): Generator<Point2> {
  const s = step <= 0 ? 1 : step;
  for (let r = startRadius; r <= maxRadius; r += s) {
    if (r === 0) {
      yield { x: origin.x, z: origin.z };
      continue;
    }
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        yield { x: origin.x + dx, z: origin.z + dz };
      }
    }
  }
}

export interface ChebyshevSearchOptions {
  /** First ring radius, inclusive. */
  readonly startRadius: number;
  /** Last ring radius, inclusive. */
  readonly maxRadius: number;
  /** Ring step, default 1. `squareIn` uses 2. */
  readonly step?: number;
  /**
   * Optional bounds guard. When present, a candidate failing it is
   * skipped without calling `isEligible`. Keeps bounds explicit at the
   * call site rather than folded silently into eligibility. Allocation-free:
   * coordinates are passed as numbers, no Point2 object is created per probe.
   */
  readonly inBounds?: (x: number, z: number) => boolean;
  /**
   * Whether a candidate that passed `inBounds` is eligible (first-fit).
   * Coordinates are passed as numbers to avoid per-candidate allocation;
   * callers must not retain references to a temporary Point2.
   */
  readonly isEligible: (x: number, z: number) => boolean;
}

/**
 * First-fit search over Chebyshev rings. Returns the first candidate
 * that passes `inBounds` (if given) and `isEligible`, or `null` when
 * none is eligible within the radius window. Preserves the exact
 * radius sequence, within-ring z-then-x tie order and short-circuit
 * return semantics of the five inlined loops this replaces. No per-candidate
 * allocation: probes are integer coordinates, only the winner is boxed.
 */
export function findFirstOnChebyshevRing(
  origin: Point2,
  options: ChebyshevSearchOptions,
): Point2 | null {
  const { startRadius, maxRadius, step = 1, inBounds, isEligible } = options;
  const s = step <= 0 ? 1 : step;
  for (let r = startRadius; r <= maxRadius; r += s) {
    if (r === 0) {
      const x = origin.x;
      const z = origin.z;
      if (inBounds !== undefined && !inBounds(x, z)) continue;
      if (isEligible(x, z)) return { x, z };
      continue;
    }
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = origin.x + dx;
        const z = origin.z + dz;
        if (inBounds !== undefined && !inBounds(x, z)) continue;
        if (isEligible(x, z)) return { x, z };
      }
    }
  }
  return null;
}
