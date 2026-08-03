/**
 * The **bridge kit** — a crossing built from one cross-section.
 *
 * ## Why this is its own module
 *
 * A bridge used to be two passes that had to agree and did not: `roads.ts`
 * `buildBridgeDeck` laid a deck one column wider each side than the lane with a
 * fence rail on that extra column, and `setpieces.ts` dressed it with pylons,
 * lamps and a bank balustrade. C4's first draft of the dressing put its parapet
 * at `half` — inboard of the deck's own rail — narrowing the road and asking
 * `solidAt` for support on a top slab that reports none. The fix at the time
 * was to read the other half of the kit; the fix now is that there is only one
 * source of truth for where the rail is, and both halves read it:
 * {@link bridgeOffsets} over {@link BRIDGE_PROFILE}.
 *
 * ## What the kit adds over a plank deck
 *
 * Kai's screenshot criticism of the shipped bridge was that it is a bare plank
 * with a stub tower at each end. Three things answer that, and all three are
 * profile data rather than new geometry:
 *
 * 1. **Pier rhythm.** Piers stood only at the two abutments, so a long span had
 *    nothing under it. The `pier` interval feature drops a founded column every
 *    {@link BRIDGE_PIER_PITCH} columns of span, phase-locked to the first wet
 *    column of the run so recompiling never moves them.
 * 2. **Founded, not floating.** Every pier is grown from the bed — the top
 *    *occupied* voxel of its own column — up to the deck, which is the same
 *    probe discipline `setpieces.topOccupied` uses and the reason the last
 *    `unsupported.chain` finding on a bridge went away.
 * 3. **Approach.** The parapet is carried {@link BRIDGE_APPROACH_RUN} columns
 *    onto each bank so the line does not stop at the waterline, and the deck's
 *    two abutment columns are decked dry-side as a landing.
 *
 * ## SEAM(sweep)
 *
 * This is the bridge client of the `SweptProfile` engine
 * (`docs/DESIGN.md` §3). {@link buildBridgeKit} keeps `buildBridgeDeck`'s exact
 * signature, so the integration is a one-line swap at each of its two call
 * sites in `structures/roads.ts`; when `structures/sweep.ts` lands, the body
 * becomes a single `sweep()` call with `crossing: "bridge"` and this file keeps
 * only the palette wiring. Nothing else in the compiler imports it, and it
 * imports nothing from `roads.ts` except the two grid helpers, so the two
 * tracks cannot collide in one file.
 */

import type { ColumnPlan } from "../terrain/columns.js";

import type { StructureBlock } from "./buildings.js";
import {
  BRIDGE_APPROACH_RUN,
  BRIDGE_PROFILE,
  bridgeOffsets,
  featureHits,
  featureOf,
} from "./profiles.js";
import { index, inside } from "./roads.js";

/** The region shape both helpers above take. Restated to avoid a type import cycle. */
interface Region {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
}

/** The block states a bridge draws from. A structural subset of `RoadStates`. */
export interface BridgeStates {
  /** Deck: a top slab, flush with the lane at both banks. */
  readonly deck: number;
  /** The rail on the parapet column. */
  readonly post: number;
  /** The pier column dropped from the deck to the bed. */
  readonly pier: number;
}

/** One instance of an interval feature the kit placed, for the dressing pass. */
export interface BridgeFeature {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BridgeKitResult {
  readonly blocks: readonly StructureBlock[];
  readonly features: readonly BridgeFeature[];
}

/** Unit heading at path index `i`, and the perpendicular the band walks. */
function headingAt(
  path: readonly { x: number; z: number }[],
  i: number,
): { px: number; pz: number } {
  const a = path[Math.max(0, i - 1)] as { x: number; z: number };
  const b = path[Math.min(path.length - 1, i + 1)] as { x: number; z: number };
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  return dx === 0 && dz === 0 ? { px: 0, pz: 1 } : { px: dx, pz: -dz };
}

/**
 * Arc length along each wet run, restarting at every dry column.
 *
 * Phase-locked to the span, not to the road: DESIGN §3 rule 5. Counting from
 * the path start would give the same river a different pier rhythm depending on
 * how long the approach happened to be.
 */
export function spanArcs(
  wet: readonly boolean[],
): Int32Array {
  const arcs = new Int32Array(wet.length);
  let arc = 0;
  for (const [i, isWet] of wet.entries()) {
    if (!isWet) {
      arc = 0;
      arcs[i] = -1;
      continue;
    }
    arcs[i] = arc;
    arc += 1;
  }
  return arcs;
}

/** Do the piers of a span of `length` columns fall where a designer would put them? */
export function pierArcs(length: number): number[] {
  const pier = featureOf(BRIDGE_PROFILE, "pier");
  const arcs: number[] = [];
  for (let arc = 0; arc < length; arc++) {
    if (arc === 0 || arc === length - 1 || featureHits(pier, arc)) arcs.push(arc);
  }
  return arcs;
}

/**
 * Build the deck, the rail, the piers and the approach landings of a crossing.
 *
 * Nothing here touches the column plan. Every block is emitted as a structure
 * block over water the terrain pass already settled, so a bridge cannot
 * destabilize a fluid — the validator reads the plan, and the plan still says
 * "river". The piers do replace water in their own columns, which is what a
 * pier is and is harmless: a full column of solid has no exposed face for its
 * neighbours to flow into.
 */
export function buildBridgeKit(
  region: Region,
  plan: ColumnPlan,
  path: readonly { x: number; z: number; y: number }[],
  width: number,
  states: BridgeStates,
  water: Uint8Array,
): BridgeKitResult {
  const { rail: outer } = bridgeOffsets(width);
  const blocks: StructureBlock[] = [];
  const features: BridgeFeature[] = [];
  const wetAt = (x: number, z: number): boolean =>
    inside(region, x, z) && water[index(region, x, z)] === 1;

  const wet = path.map((cell) => wetAt(cell.x, cell.z));
  const arcs = spanArcs(wet);
  // Run length per index, so `pierArcs`' "last column of the span" is knowable
  // before the run has been walked.
  const runEnd = new Int32Array(path.length);
  for (let i = path.length - 1; i >= 0; i--) {
    runEnd[i] = wet[i] === true ? ((runEnd[i + 1] ?? 0) as number) + 1 : 0;
  }

  for (const [i, cell] of path.entries()) {
    if (wet[i] !== true) continue;
    const heading = headingAt(path, i);
    const arc = arcs[i] as number;
    const length = arc + (runEnd[i] as number);
    const isPier = pierArcs(length).includes(arc);

    for (let o = -outer; o <= outer; o++) {
      const x = cell.x + heading.pz * o;
      const z = cell.z + heading.px * o;
      if (!wetAt(x, z)) continue;
      blocks.push({ x, y: cell.y, z, stateId: states.deck });
      if (Math.abs(o) !== outer) continue;
      blocks.push({ x, y: cell.y + 1, z, stateId: states.post });
      if (!isPier) continue;
      // Founded: grown from the bed of *this* column up to the deck. `ground`
      // is the top occupied voxel, so the first pier block always has
      // something under it and the last always meets the deck.
      const bed = plan.ground[index(region, x, z)] as number;
      for (let y = bed + 1; y < cell.y; y++) {
        blocks.push({ x, y, z, stateId: states.pier });
      }
      features.push({ id: "pier", x, y: cell.y, z });
    }
  }

  return { blocks, features };
}

/**
 * The columns of bank the parapet is carried across at each end of a span.
 *
 * Pure, and shared with the dressing pass so the balustrade stops exactly where
 * the kit says it does rather than running the whole length of whatever path
 * the set-piece plan happened to hand over.
 */
export function approachIndices(wet: readonly boolean[]): number[] {
  const out: number[] = [];
  for (const [i, isWet] of wet.entries()) {
    if (isWet) continue;
    for (let d = 1; d <= BRIDGE_APPROACH_RUN; d++) {
      if (wet[i - d] === true || wet[i + d] === true) {
        out.push(i);
        break;
      }
    }
  }
  return out;
}
