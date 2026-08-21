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
 *
 * ## What the flag gates, and what it does not
 *
 * `GROUND_V1_RANKS` is off in the shipped state, and while it is off `rankOf`
 * maps both new classes to `DEFERRED_PAD_RANK` (150) — the arbitration position
 * `pad.record` held. **The intents themselves are unconditional**: same columns,
 * same levels, same `subRank`, same order. That is what makes the flag-off state
 * byte-identical *and* makes the report, the probe and the cliff census read the
 * true class names a stage before the ranks move.
 *
 * ## `subRank`, and why it is the index in the whole list
 *
 * `applyPadEdits` composes the pads by application order, later-wins: inside a
 * footprint `applyLevelPad` writes `targetY` outright, so where two footprints
 * overlap the field carries the **last** pad's level. `pad.record` reproduced
 * that with `subRank: -i` over the whole list and measured the cost of not doing
 * so (162 columns on `c1-harbourtown` decided by node-path collation). The index
 * stays global here rather than per-class for exactly that reason: with the flag
 * off every pad ranks equal, and the tie-break must be the same one number it
 * was before or the flag's off-state is not byte-identical.
 */

import type { Region } from "@terrainist/stdlib";

import { index, inside } from "../structures/roads.js";

import type { RouteCorridor } from "./corridors.js";
import type { GroundClaim, GroundIntent, GroundSourceClass } from "./ground-contract.js";
import {
  solvedCarriagewayMask,
  type CarriagewayCity,
  type CarriagewayDistrict,
} from "./solved-carriageway.js";
import { GROUND_V1_RANKS, type PadEdit } from "./types.js";

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
   * {@link GROUND_V1_RANKS}, and the default is the whole of the argument
   * below; a test passes `true` to assert the superset property against the
   * construction that has to hold it.
   */
  readonly subtractCarriageway?: boolean;
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
  // subtracts.
  //
  // **Gated with the rank, and measured before it was.** §1.7's subtraction
  // exists for one reason: at rank 15 a plane outranks the street that crosses
  // it. At `DEFERRED_PAD_RANK` it outranks nothing, so the subtraction protects
  // a lane that is in no danger — and it is not free. Declared unconditionally
  // it costs troy 2,336 owned columns and moves the census rows §6/G3 says must
  // not move: `natural/natural` 4158 → 4181, `retaining.seam/natural` 323 →
  // 383, `street.sidewalk/natural` 6 → 170. Those columns are not *wrong* — a
  // column nobody claims resolves to the baseline, which is the same height —
  // but they are attribution moving in the flag's off state, which is the one
  // thing the off state exists to prevent. So the subtraction lands with the
  // rank it defends, in one flip, and `test/ground-datums.test.ts` asserts the
  // superset property against the construction rather than against the default.
  //
  // Built once for the whole list, and only when there is a plane to subtract
  // it from: a flat town declares no `quarter.plane` and pays nothing.
  const subtractCarriageway = input.subtractCarriageway ?? GROUND_V1_RANKS;
  const anyPlane = subtractCarriageway && padEdits.some((p) => classOf(p) === "quarter.plane");
  const carriageway = anyPlane
    ? solvedCarriagewayMask(region, input.districts, input.cities, input.corridors)
    : undefined;

  const out: GroundIntent[] = [];
  for (const [i, pad] of padEdits.entries()) {
    const sourceClass = classOf(pad);
    const subtract = sourceClass === "quarter.plane" ? carriageway : undefined;
    const columns: GroundClaim[] = [];
    for (let z = pad.footprint.z0; z <= pad.footprint.z1; z++) {
      for (let x = pad.footprint.x0; x <= pad.footprint.x1; x++) {
        if (!inside(region, x, z)) continue;
        const idx = index(region, x, z);
        if (subtract !== undefined && subtract[idx] === 1) continue;
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
      // Inert while the flag is off, and provably so: a `preserve` guards
      // against claims of *lower* rank than its own, and at
      // `DEFERRED_PAD_RANK` there is nothing below it.
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

/* -------------------------------------------------------------------------- */
/* the two helpers the equivalence shim reads a declaration set with           */
/* -------------------------------------------------------------------------- */

/**
 * Every column any *level* claim in a set names, with the levels proposed for
 * it — §8.3's partition, minus the two answers it is not allowed to look at.
 *
 * Filters and level claims are told apart here rather than by the caller because
 * §2.2 is where that distinction lives: `clearance` and `preserve` propose no
 * level of their own, so a column named only by those two is `UNCLAIMED`.
 *
 * Moved here verbatim from the deleted `structures/ground-declare.ts`, whose
 * one remaining declarer this module replaces. It goes with the shim at WP-G8.
 */
export function levelClaimsByColumn(intents: readonly GroundIntent[]): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const intent of intents) {
    if (intent.kind !== "platform" && intent.kind !== "profile" && intent.kind !== "face") {
      continue;
    }
    for (const claim of intent.columns) {
      let levels = out.get(claim.idx);
      if (levels === undefined) {
        levels = new Set<number>();
        out.set(claim.idx, levels);
      }
      levels.add(claim.y);
    }
  }
  return out;
}

/**
 * True when a claim asks the column to hold a fluid (§2.1).
 *
 * `fluid` omitted means "dry, and `fluidTop` follows `y`", which is every claim
 * but the canal's and the two wells' — and the type says so: `kind` is `1 | 2`,
 * so a *present* `fluid` is never `NONE`.
 */
export function isWetClaim(claim: GroundClaim): boolean {
  return claim.fluid !== undefined;
}
