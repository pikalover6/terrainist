/**
 * **`PlaneDatum`** — the fourth datum of the ground contract v1 (§1.3's table,
 * last row), formalised at WP-G3.
 *
 * > A *datum* is a pure function of `(the pristine baseline, the solved layout,
 * > the document)` that proposes levels and declares nothing.
 *
 * The other three datums *measure*: `StreetDatum` grades a profile off the
 * field, `PlatformDatum` elects a lattice off the street, `SeatDatum` seats a
 * lot off both. A plane does not. Its level comes from the precinct kit's own
 * geometry — `QUAY_DEPTH` under a waterline, the apron rect an airport needs to
 * be flat — and from `solveCities`' cell election, and v1 §1.3 says why that is
 * a distinction worth typing rather than a quibble: **these are decisions, not
 * measurements**, which is exactly why they *anchor* a datum rather than read
 * one (G8). Nothing here samples a field.
 *
 * So the module is deliberately thin. It is a name and a shape, and the value
 * of it is the same value `StreetDatum` has: the level a `precinct.ground`
 * claim asks for now travels as a datum with a type, so R1's "a claimed plane
 * owes its own edges" has one thing to point at when WP-G4 derives those edges
 * from the resolved field instead of from `RetainingPlane.planeY`.
 *
 * `structures/precincts.ts` builds one per precinct kit and declares from it;
 * `PrecinctDeclaration` **extends** it, so `structures/index.ts`'s
 * `RetainingPlane` construction reads the identical fields it read before and
 * the formalisation costs no wiring anywhere else.
 */

import type { GroundClaim } from "./ground-contract.js";

/**
 * One levelled plane nobody's quarter drew, as the thing that proposes its
 * level (§1.3).
 *
 * Purity, in the sense §1.3 makes testable: no field of this is derived from
 * `plan.ground`, from a `GroundView`, or from any resolver output — a precinct
 * kit computes `planeY` from its own geometry against the *baseline*, before
 * a single claim has been arbitrated.
 */
export interface PlaneDatum {
  /** The node whose kit levelled it. Becomes the claim's `source`. */
  readonly nodePath: string;
  /** The columns the kit graded, with the level each was graded to. */
  readonly columns: readonly GroundClaim[];
  /**
   * The plane's own level — the one number the kit decided.
   *
   * Every column of {@link columns} that the kit levelled holds it; a quay
   * whose strip steps is expressed as more than one datum rather than as a
   * range, because a plane with two levels is two planes and R1's edge duty is
   * owed by each.
   */
  readonly planeY: number;
}

/**
 * The level this datum proposes — trivially, and named anyway.
 *
 * A one-line accessor exists for the reason `StreetDatum.levelNear` exists: the
 * proposer calls the datum, never re-implements it (§1.3's "one arithmetic"),
 * and a call site that reads `datum.planeY` by hand today is a call site that
 * will quietly keep reading it when the plane learns to step.
 */
function planeLevel(datum: PlaneDatum): number {
  return datum.planeY;
}
