/**
 * **The layout stage's declarers** — the ground contract v1 §1.5, §1.7, and
 * §4 item 10.
 *
 * Until WP-G3 the solver's and the fabric's `PadEdit` list reached the contract
 * as one rank-150 `pad.record` intent per pad (`structures/ground-declare.ts`,
 * deleted with this module's arrival). That claim was bookkeeping and the audit
 * said so: the field already carried its answer, `buildColumnPlan` materialised
 * it, and the contract's baseline inherited it. A claim resolved against a
 * baseline that already contains it cannot lose, and cannot be said to have won.
 *
 * v1 §1.2 states the consequence plainly — *"a lot pad, a platform run and a
 * precinct apron are now claims that can lose"* — and this module is where the
 * claims are written. Three declarers, one per thing a pad actually is:
 *
 * | pad | class | rank | level |
 * | --- | --- | --- | --- |
 * | a per-lot pad's footprint | `building.footprint` | 10 | `SeatDatum`'s seat |
 * | a bench run / a derived platform | `quarter.plane` | 15 | `PlatformDatum`'s elected level |
 * | the solver's node-scale pads | `building.footprint` | 10 | `padFor`'s target |
 *
 * The fourth row of §1.5's tier A — `precinct.ground` — is not here: it has had
 * a real declarer since WP-4 (`structures/precincts.ts`), and WP-G3's change to
 * it is that its level travels as a {@link PlaneDatum}.
 */

import type { Region } from "@terrainist/stdlib";

import { index, inside } from "../structures/sweep.js";

import type { RouteCorridor } from "./corridors.js";
import type { GroundClaim, GroundIntent, GroundSourceClass } from "./ground-contract.js";
import {
  solvedCarriagewayMask,
  type CarriagewayCity,
  type CarriagewayDistrict,
} from "./solved-carriageway.js";
import { type PadEdit } from "./types.js";

/** What {@link declarePads} needs to know about the solved layout. */
export interface PadDeclarationInput {
  readonly region: Region;
  /** The whole pad list, in application order — solver pads first. */
  readonly padEdits: readonly PadEdit[];
  /** The solved district street skeletons, for §1.7's band. */
  readonly districts: readonly CarriagewayDistrict[];
  /** The solved city plans, for their arterials. */
  readonly cities: readonly CarriagewayCity[];
  /** Corridors registered at substage 3b. */
  readonly corridors: readonly RouteCorridor[];
  /**
   * Whether `quarter.plane` subtracts §1.7's band. Defaults to
   * the pads' real ranks, and the default is the whole of the argument
   * below; a test passes `true` to assert the superset property against the
   * construction that has to hold it.
   */
  readonly subtractCarriageway?: boolean;
  /**
 * **§1.7's third subtraction** —
   *
   * > **3. `quarter.plane` subtracts the solved descent corridors.**
   *
   * 1 on every column of a solved descent's corridor, row-major over
   * {@link PadDeclarationInput.region} — `DescentDatum.corridor`, which is each
   * run's cross-section at `streetStairGeometry`'s width dilated 1 Chebyshev,
   * the same construction rule 1 uses for the carriageway band.
   *
   * The crossing law is a **subtraction, not an arbitration**, and the
   * difference from `064c2d5`'s rejected pin-and-refuse is causal rather than
   * quantitative: *there is no notch to meet.* The contested columns leave the
   * plane's claim **before the plane is declared**, so the ground under a
   * descent is the pristine baseline the search already solved against, the
   * resolver never arbitrates those columns, and the severance that orphaned
   * 271 hillside / 3,421 steep stair columns is impossible rather than won.
   *
   * Absent — which is every caller while `DESCENT_SOLVE` is off, and every flat
   * town for ever — and this is §1.7 with two rules, unchanged.
   */
  readonly descentCorridor?: Uint8Array;
}

/**
 * The class a pad's level becomes a claim of.
 *
 * An absent {@link PadEdit.claimClass} is the solver's own pad — `padFor`
 * emitted it under one placed node, which is a footprint whatever kit stands on
 * it. §1.5's `building.footprint` row says so in as many words ("plus the
 * solver's landmark pads").
 */
function classOf(pad: PadEdit): Extract<GroundSourceClass, "building.footprint" | "quarter.plane"> {
  return pad.claimClass ?? "building.footprint";
}

/**
 * Every intent the layout stage's pads declare (§1.5, §1.7).
 *
 * Returned rather than committed, so the caller decides where in the pipeline
 * they land and the function stays pure enough to test without a compile — the
 * discipline `layout/solved-carriageway.ts` and `structures/street-owner.ts`
 * already keep.
 *
 * Order is the pad list's own order, which is the application order
 * `applyPadEdits` used, which is what `subRank` encodes. Determinism needs no
 * further argument.
 */
export function declarePads(input: PadDeclarationInput): GroundIntent[] {
  const { region, padEdits } = input;
  // §1.7 rule 1. A tier-A claim laid over a carriageway would take the lane, so
  // the quarter's plane subtracts the band **before** it declares — the same
  // construction, from the same module, that `structure.linework` (25) already
  // subtracts. At rank 15 a plane outranks the street that crosses it, so the
  // subtraction protects the lane.
  //
  // Built once for the whole list, and only when there is a plane to subtract
  // it from: a flat town declares no `quarter.plane` and pays nothing.
  const subtractCarriageway = input.subtractCarriageway ?? true;
  const anyPlane = subtractCarriageway && padEdits.some((p) => classOf(p) === "quarter.plane");
  const carriageway = anyPlane
    ? solvedCarriagewayMask(region, input.districts, input.cities, input.corridors)
    : undefined;

  // §3.2's third subtraction. Unlike rule 1 it is *not* gated on the rank: the
  // corridor only exists at all when `DESCENT_SOLVE` is on, so the caller's
  // absent mask is the flag's off state and there is nothing to defend.
  const descent = input.descentCorridor;

  const out: GroundIntent[] = [];
  for (const [i, pad] of padEdits.entries()) {
    const sourceClass = classOf(pad);
    const subtract = sourceClass === "quarter.plane" ? carriageway : undefined;
    const subtractDescent = sourceClass === "quarter.plane" ? descent : undefined;
    const columns: GroundClaim[] = [];
    for (let z = pad.footprint.z0; z <= pad.footprint.z1; z++) {
      for (let x = pad.footprint.x0; x <= pad.footprint.x1; x++) {
        if (!inside(region, x, z)) continue;
        const idx = index(region, x, z);
        if (subtract !== undefined && subtract[idx] === 1) continue;
        if (subtractDescent !== undefined && subtractDescent[idx] === 1) continue;
        columns.push({ idx, y: pad.targetY });
      }
    }
    if (columns.length === 0) continue;
    const source = `${pad.nodePath}#pad@${i}`;
    out.push({
      source,
      sourceClass,
      kind: "platform",
      columns,
      transition: "ramp",
      subRank: -i,
    });
    if (sourceClass === "building.footprint") {
      // §1.5's `building.footprint` row, second half: "one `platform` intent per
      // building rect at `SeatDatum`'s level, **plus `preserve` over the whole
      // rect**". The guard is what makes the floor plane a plane — a doorstep,
      // a prop pad or a verge that grades one column of a footprint is the
      // defect I4 and I5 were written about, and a `preserve` names it as a
      // conflict instead of letting it through silently.
      //
      // A `preserve` guards against claims of lower rank than its own.
      out.push({
        source: `${source}#preserve`,
        sourceClass,
        kind: "preserve",
        columns,
        // `ramp`, not `none`. A filter proposes no level, so it never owns a
        // column and its request is never the one §2.5 consults — but `none`
        // *on either side* suppresses a transition, and a `none` over every
        // building rect is one refactor away from suppressing exactly the
        // boundary v1 §3.1's third refinement exists to build (`built`, whose
        // builder is the foundation skirt). It asks for what the platform half
        // asks for.
        transition: "ramp",
        subRank: -i,
      });
    }
  }
  return out;
}
