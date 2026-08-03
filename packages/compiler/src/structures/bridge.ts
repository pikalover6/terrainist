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
import { sweptColumns } from "./sweep.js";

/**
 * The shortest wet run that gets a bridge, in columns of span.
 *
 * Below this a crossing is not a bridge — it is a **ford**, and the honest
 * build is nothing at all. The defect this closes was a lane skirting a lake
 * shore on a diagonal: the route dipped a toe in the water every few columns,
 * and each of those one- and two-column "spans" got its own square of deck,
 * two fence posts and a log pier. Two dozen of them read, correctly, as a
 * collapsed pier — plank fragments at three heights, connected to nothing.
 *
 * A ford leaves the road's own columns as the terrain pass settled them, which
 * across one or two columns of shallow water is a crossing a player walks
 * through without noticing. A four-block plank island is not.
 */
export const BRIDGE_MIN_SPAN = 3;

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

/** The maximal runs of consecutive wet path indices, in path order. */
export function wetRuns(wet: readonly boolean[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i <= wet.length; i++) {
    if (wet[i] === true) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) runs.push({ start, end: i - 1 });
    start = -1;
  }
  return runs;
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
 *
 * ## The span is the unit, not the column
 *
 * A route is not "a bridge": it is a road that happens to be wet in places, and
 * a lane running along a lake shore is wet in *many* places, none of them a
 * crossing. Two defects followed from building per wet column, and both are
 * closed here by making a **wet run** the thing that is built or refused:
 *
 * 1. **Fragments.** Every isolated wet column got a deck square, two posts and
 *    a pier. Runs shorter than {@link BRIDGE_MIN_SPAN} are now nothing at all
 *    — a ford — and a run that cannot deck every one of its arcs is dropped
 *    **whole**, which is the all-or-nothing law this pass had been exempt from.
 * 2. **The diagonal dither.** The band used to be walked as `±o` along the
 *    *rasterized* cell's local perpendicular, which on a 45° route puts
 *    consecutive offsets √2 apart and leaves a checkerboard of deck and open
 *    water — the same bug `blendShoulders` documents and solved by dilating.
 *    The band is now {@link sweptColumns} over the span's own sub-path, which
 *    tests perpendicular distance to the *true* line and so covers a diagonal
 *    with one continuous surface.
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
  for (const run of wetRuns(wet)) {
    const span = buildSpan(region, plan, path.slice(run.start, run.end + 1), outer, states, wetAt);
    if (span === null) continue;
    blocks.push(...span.blocks);
    features.push(...span.features);
  }
  return { blocks, features };
}

/**
 * One crossing, built whole or refused whole.
 *
 * Returns `null` for a run too short to be a bridge and for a run whose band
 * cannot cover every arc of its own span — a deck with a hole in it is the
 * fragment defect wearing a longer name.
 */
function buildSpan(
  region: Region,
  plan: ColumnPlan,
  span: readonly { x: number; z: number; y: number }[],
  outer: number,
  states: BridgeStates,
  wetAt: (x: number, z: number) => boolean,
): BridgeKitResult | null {
  const length = span.length;
  if (length < BRIDGE_MIN_SPAN) return null;

  const piers = new Set(pierArcs(length));
  const columns = sweptColumns(
    region,
    span.map((cell) => ({ x: cell.x, z: cell.z })),
    { lo: -outer, hi: outer },
  );
  const blocks: StructureBlock[] = [];
  const features: BridgeFeature[] = [];
  const covered = new Set<number>();

  for (const column of columns) {
    if (!wetAt(column.x, column.z)) continue;
    const arc = Math.min(length - 1, Math.max(0, column.index));
    const deckY = (span[arc] as { y: number }).y;
    covered.add(arc);
    blocks.push({ x: column.x, y: deckY, z: column.z, stateId: states.deck });
    if (Math.abs(column.lane) !== outer) continue;
    blocks.push({ x: column.x, y: deckY + 1, z: column.z, stateId: states.post });
    if (!piers.has(arc)) continue;
    // Founded: grown from the bed of *this* column up to the deck. `ground`
    // is the top occupied voxel, so the first pier block always has
    // something under it and the last always meets the deck.
    const bed = plan.ground[index(region, column.x, column.z)] as number;
    for (let y = bed + 1; y < deckY; y++) {
      blocks.push({ x: column.x, y, z: column.z, stateId: states.pier });
    }
    features.push({ id: "pier", x: column.x, y: deckY, z: column.z });
  }

  // All or nothing: every arc of the span carries deck, or there is no bridge.
  if (covered.size < length) return null;
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
