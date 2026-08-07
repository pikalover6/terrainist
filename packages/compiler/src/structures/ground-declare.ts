/**
 * **What is left of the shadow declarers** — `docs/GROUND-CONTRACT-v0.md` §8.1
 * item 2, §9a.7.
 *
 * WP-2 recomputed, from what each unconverted pass handed back, the
 * `GroundIntent`s it *would* declare after conversion, so the equivalence shim
 * could resolve the whole world's declaration set beside the mutating pipeline.
 * **Each shadow declarer dies at its own pass's conversion, not at WP-6**
 * (§9a.7) — and with WP-3, WP-4 and WP-5 landed there are no unconverted passes
 * left. Every one of the eleven declares for itself now, from its own code path,
 * and hands its intents to `GroundDriver.commit`; `declareAll` and the
 * `groundDeclarers` bundle went with them, because there is one accumulator, in
 * one order, and §3's inventory is a list of call sites rather than a list of
 * arguments.
 *
 * What remains here is the one declaration whose "pass" is not a structure pass
 * at all — {@link declarePadEdits}, the layout solver's `PadEdit` list, which
 * records before the first structure pass because the field already carries its
 * answer (§3.12) — plus the two helpers the shim reads the declaration set
 * with. All three go at WP-6 with the shim itself (§10).
 */

import type { PadEdit } from "../layout/types.js";
import type { GroundClaim, GroundIntent } from "../layout/ground-contract.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { index, inside } from "./roads.js";

/* -------------------------------------------------------------------------- */
/* §3.12 the solver's pads                                                     */
/* -------------------------------------------------------------------------- */

/**
 * §3.12, first bullet — the `PadEdit` list as `platform`, class `pad.record`.
 *
 * Advisory, at the bottom of the built ranks: the field already carries the
 * answer, so this costs nothing, and it is what makes a building's floor plane
 * visible to conflict detection rather than baked in — the thing that lets
 * inversion I1 catch the fourth walked defect, *"a building's `apron: 2` ramped
 * away the seam a retaining wall stood on"*.
 *
 * Only the footprint is declared, never the apron: whether the apron should
 * become a declared transition is §13.3, and answering it here would be deciding
 * an open question by implementation.
 */
export function declarePadEdits(
  plan: ColumnPlan,
  padEdits: readonly PadEdit[],
): GroundIntent[] {
  const region = plan.region;
  const out: GroundIntent[] = [];
  for (const [i, pad] of padEdits.entries()) {
    const columns: GroundClaim[] = [];
    for (let z = pad.footprint.z0; z <= pad.footprint.z1; z++) {
      for (let x = pad.footprint.x0; x <= pad.footprint.x1; x++) {
        if (!inside(region, x, z)) continue;
        columns.push({ idx: index(region, x, z), y: pad.targetY });
      }
    }
    if (columns.length === 0) continue;
    out.push({
      source: `${pad.nodePath}#pad@${i}`,
      sourceClass: "pad.record",
      kind: "platform",
      columns,
      transition: "ramp",
      // Application order, later-wins, exactly as `applyPadEdits` composes them:
      // inside a footprint `applyLevelPad` writes `targetY` outright, so where
      // two footprints overlap the field carries the **last** pad's level. Left
      // to the class's default the two would be ordered by `source` string, and
      // on `c1-harbourtown` 162 columns would then be decided by whether a node
      // path happens to sort before another — right by luck, and the same luck
      // could as easily run the other way. Negative because lower wins (§4.1).
      subRank: -i,
    });
  }
  return out;
}

/**
 * Every column any *level* claim in a set names, with the levels proposed for
 * it — §8.3's partition, minus the two answers it is not allowed to look at.
 *
 * Filters and level claims are told apart here rather than by the caller because
 * §2.2 is where that distinction lives: `clearance` and `preserve` propose no
 * level of their own, so a column named only by those two is `UNCLAIMED`.
 */
export function levelClaimsByColumn(
  intents: readonly GroundIntent[],
): Map<number, Set<number>> {
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
