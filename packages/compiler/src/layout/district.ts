/**
 * The district fabric pass — fabric v2, F1.
 *
 * A `district` is the one node in the profile whose interior the layout solver
 * never sees. The solver places the district itself, exactly as it places a
 * plaza: one footprint, chosen against `zone`/`at`/`distance` and the ground.
 * From there this pass takes over, and it works in the opposite direction to
 * everything else in the compiler:
 *
 * 1. **streets** — {@link buildStreetGraph} draws the skeleton across the
 *    footprint (`streets.ts`, and the graph is the F4 contract);
 * 2. **blocks** — the faces of that skeleton, i.e. the connected components of
 *    the ground the carriageway and its sidewalks did not take;
 * 3. **lots** — each block's street-facing perimeter, subdivided into frontages
 *    at a depth the density chooses, with the corners assigned to one side;
 * 4. **landmarks** — the district's own children, largest first, each claiming
 *    the run of lots that wastes the least ground;
 * 5. **the street wall** — every maximal run of consecutive unclaimed lots on
 *    one block face becomes a *terrace*: one node of N bays sharing party
 *    walls, which is what a dense block is actually made of. See
 *    {@link terraceRuns};
 * 6. **infill** — every lot the terraces left, filled from `mix` until the
 *    coverage matches the density.
 *
 * Every building this pass produces is an ordinary {@link Placement} with an
 * ordinary `building.grammar@0` node behind it, so it flows through the
 * buildings pass, the doorsteps, the occupancy grid, the canopy clip and the
 * physics lint with nothing special done for it. The *only* thing the fabric
 * does differently is decide where and which way round — and that decision is
 * frontage, not cost.
 *
 * Determinism: the skeleton is seeded from `nodeSeed(worldSeed, districtPath)`;
 * every per-lot decision (which archetype, whether it is built at all, how many
 * floors) is a **positional** draw keyed on the lot's own street-facing corner,
 * so it does not depend on iteration order, on how many lots came before, or on
 * anything the author later adds elsewhere in the document. The same holds one
 * scale up: a terrace's bay widths, storeys and materials are hashes of the
 * run's own start column and of the offset along it, never of a counter or of
 * an index into a list of runs.
 */

import {
  DECAY_BANDS,
  HIGHRISE_MAX_WIDTH,
  HIGHRISE_MIN_WIDTH,
  RUIN_ONSET,
  bandForDecline,
  TERRACE_MIN_FRONTAGE,
  isHighriseArchetype,
  nodeSeed,
  planTerrace,
  positionFloat,
  positionInt,
  streamSeed,
  terraceMinDepth,
  type DecayBand,
  type HeightField,
  type Region,
  type Seed256,
  type TerraceBay,
} from "@terrainist/stdlib";
import {
  error,
  note,
  warning,
  isDistrictNode,
  type DistrictDensity,
  type DistrictFabric,
  type DistrictGroundPolicy,
  type DistrictNode,
  DEFAULT_ERA_CLASS,
  type DistrictParams,
  type EraClass,
  type HorizontalFace,
  type LoamDiagnostic,
  type PortDeclaration,
  type SettlementDocument,
  type StructureNode,
  type Yaw,
} from "@terrainist/spec";

import {
  ensureFanOutRows,
  fanOut,
  intentFor,
  resolveIntents,
  type ResolvedIntent,
} from "../intent/index.js";
import {
  COURTYARD_FILL,
  MIN_COURT_SIDE,
  isCourtyardPlan,
  planCourtyard,
  splitIndexNearest,
  type CourtyardBlock,
  type CourtyardPassage,
  type CourtyardPlan,
  type CourtyardReject,
} from "./courtyards.js";
import {
  NO_PLATFORM,
  groundLevelsOf,
  levelSeams,
  type GroundLevels,
  type LevelSeam,
} from "./levels.js";
import {
  noDescents,
  solveDescents,
  type DescentDatum,
  type DescentRecord,
} from "./descent-datum.js";
import { largestRect } from "./masks.js";
import {
  submergedBenches,
  DISSOLVE_DROP_MAX,
  damsWater,
  derivePlatforms,
  dissolveTallPairs,
  type PlatformTieReport,
} from "./platforms.js";
import { biasedMix } from "./mix-intent.js";
import { LAYOUT_ROWS } from "./streets-intent.js";
import type { Point2, Rect } from "./frames.js";
import { walkLine } from "./forms/radial.js";
import {
  densify4,
  MAX_PRINCIPAL_STREETS,
  MIN_PRINCIPAL_STREETS,
  STREET_WIDTH,
  dilateMask,
  drawFabric,
  installUrbanForms,
  urbanForm,
  type FabricRequest,
  type FabricResult,
  type FormChannel,
  type FormFocus,
  type FormPlan,
  type FormRecord,
  type FormStrip,
  type GroundSample,
  type PlannedEdge,
  type PlanAttempt,
} from "./forms/index.js";
import { frontFace, resolvePorts, rotatedSize } from "./ports.js";
import {
  buildProminenceField,
  type ProminenceField,
  type ProminenceLandmark,
} from "./prominence.js";
import {
  BLOCK_SIZE_BY_DENSITY,
  SIDEWALK_BY_DENSITY,
  carriagewayCells,
  type StreetGraph,
  type StreetSegment,
} from "./streets.js";
import {
  gradeStreetDatum,
  harmonizeStreetDatum,
  type HarmonizedSegment,
  type StreetDatum,
  type StreetDatumInput,
} from "./street-datum.js";
import {
  SUBMERGED_BENCH_UNGRADED,
  CORNER_TOLERANCE,
  DESCENT_SOLVE,
  ELECTION_SOLVE,
  FRONTAGE_RISE,
  FRONTAGE_TIE,
  GROUND_PLANE_TIE,
  RIM_SEAT_MAX_DROP,
  SEAM_TIERS,
  STREET_PLANE_FLANK_PROBE,
  STREET_PLANE_HARMONIZE,
  STREET_PLANE_MIN_FLANK,
  STREET_PLANE_MIN_RUN,
  TERRACE_BY_TERRAIN,
  type LayoutNodeInput,
  type PadEdit,
  type Placement,
  type ResolvedPort,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/* the knobs the density turns                                                 */
/* -------------------------------------------------------------------------- */

/** Lot depth back from the build-to line, in blocks. */
export const LOT_DEPTH: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 17,
  medium: 16,
  low: 15,
});

/** Target frontage per lot, in blocks. Downtown parcels are narrow. */
export const LOT_FRONTAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 13,
  medium: 15,
  low: 19,
});

/** Share of unclaimed lots the infill actually builds on. */
export const LOT_COVERAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 0.94,
  medium: 0.62,
  low: 0.32,
});

/** Blocks of daylight left between an infill building and its lot's edges. */
export const LOT_SIDE_GAP: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});

/**
 * Storeys the infill built, per density — **superseded by C2**.
 *
 * The flat band is what built a mesa: every lot in a downtown drawing 3..8
 * uniformly, so the only tall things were the landmarks. `prominence.ts` owns
 * the storey count now ({@link ProminenceField.storeys}, and `STOREY_RANGE`
 * there is the range this table used to be). Kept exported because it states
 * what the fabric used to do and one or two documents still reason about it.
 */
export const INFILL_FLOORS: Readonly<Record<DistrictDensity, readonly [number, number]>> =
  Object.freeze({
    high: [3, 8] as const,
    medium: [2, 4] as const,
    low: [1, 2] as const,
  });

/** Blocks per storey, matching the profile's default. */
export const FLOOR_HEIGHT = 4;

/**
 * Columns of blend around a building's pad.
 *
 * Two, unchanged: `applyLevelPad` ramps the ground to the pad's level with a
 * smoothstep across it, so a district whose own apron did not quite reach still
 * meets its own ground. It is named here because the platform-seam guard has to
 * ask about exactly this reach — see `touchesSeam`.
 */
export const BUILDING_APRON = 2;

/** Smallest footprint axis this pass will hand the grammar. */
export const MIN_INFILL_SIDE = 7;

/** Deepest a building goes back from its build-to line. */
export const MAX_INFILL_DEPTH = 16;

/** Longest run of lots one landmark may merge. */
export const MAX_LANDMARK_RUN = 4;

/** How far past the sidewalk a block looks for the street it fronts. */
export const STREET_PROBE_SLACK = 10;

/* -------------------------------------------------------------------------- */
/* the deep block, and the alley that cures it                                 */
/* -------------------------------------------------------------------------- */

/**
 * Widest a **leaf** block may be across its short axis before an alley is cut
 * through it — and the number is **measured**, not derived from taste.
 *
 * `subdivide` cuts *rim* frontage: a strip {@link LOT_DEPTH} deep against each
 * side that has a street behind it, and whatever is left in the middle is the
 * block's core, which is F2's ground treatment and never a lot. On a block much
 * wider than two lot depths that core is land inside the fabric no house can
 * ever stand on, and the repair is a street through the middle of it.
 *
 * **The obvious cap is wrong, and the measurement says so.** "Rim-only by
 * construction" argues for `2 · LOT_DEPTH + MIN_COURT_SIDE` — 41 at `medium`,
 * the widest block whose core is still a *court*. Built at that gate and
 * compiled against `trojan_horse_in_troy` (`grown` × `medium` × 220 × 200,
 * `battery/candidates/p3-tie2`), it cuts two blocks and the quarter gets
 * **worse**: 42 buildings over 7 604 footprint columns become 42 buildings over
 * 6 594 — built ground per envelope column falls 0.173 → 0.150 — while the
 * dwelling count rises 46 → 52. The alley is not free and the arithmetic says
 * why. Cutting a 63-wide block costs 7 columns to the lane and its two verges,
 * and it drops every lot on both halves from 16 deep to 13, because
 * `subdivide`'s depth is `min(LOT_DEPTH, ⌊(shortest − 2) / 2⌋)` and the halves
 * are 28 across. Against that, the core it recovers on a 63 × 64 block is only
 * 31 × 32 — a quarter of the block, not the half the shape suggests, because
 * the north and south strips already run the block's **full width**.
 *
 * So the cap is the width at which the alley cannot shallow a lot: each half
 * must still hold two full-depth strips and the two columns between them
 * (`2 · LOT_DEPTH + 2`), plus the lane and its verges. At `medium` with a
 * two-column sidewalk that is `2 · 34 + 7 = 75`. Past it the alley is pure
 * gain — a 76-wide block's rim leaves a 44-wide core, and cutting it gives two
 * 34-wide blocks that are 94 % frontage. Under it the block keeps its core,
 * which is an honest answer: the core of a 63-wide block is not what is wrong
 * with a sparse quarter, and `LOAM-W527` is what says what is.
 *
 * A grid fabric's blocks are its centre-line spacing less a carriageway and two
 * sidewalks — 33 at the default `medium` spacing of 42 — so no pitch-laid
 * quarter can reach even the rejected gate, let alone this one. The forms that
 * reach it are the ones that split a *domain*: `grown` terminates a region once
 * its long axis is under `1.8 · blockSize`, a legal leaf 76 columns across at
 * `blockSize` 42.
 */
export function leafBlockCap(density: DistrictDensity, sidewalkWidth: number): number {
  return 2 * (2 * LOT_DEPTH[density] + 2) + STREET_WIDTH.lane + 2 * sidewalkWidth;
}

/**
 * Rounds of alley cutting.
 *
 * One round halves a block's short axis, so from the widest leaf any form can
 * produce — under `2 · blockSize`, and `blockSize` is bounded by the profile —
 * two rounds already reach the cap. Three is slack; it is a termination bound
 * rather than a shape decision, and the pass stops on its own as soon as a
 * round finds nothing to cut.
 */
export const MAX_ALLEY_ROUNDS = 3;

/**
 * Built ground per column of block land, under which a **walled** quarter is
 * reported (`LOAM-W527`).
 *
 * Half, and it is a floor rather than a target. The two ends of the measured
 * range: the walked-good `medium` grid quarter builds 0.61 of its block land,
 * and `trojan_horse_in_troy` — the quarter Kai walked twice and called empty —
 * built 0.34. Half sits between them with room either side, so an ordinary
 * quarter with a plaza, a market and a few open lots does not trip it and a
 * quarter whose blocks are mostly field does.
 *
 * Only walled quarters are measured, and that restriction is the whole of why
 * this can be a warning at all: a wall is a claim about what is inside it.
 * A village at 0.34 is a village.
 */
export const WALLED_COVERAGE_FLOOR = 0.5;

/* -------------------------------------------------------------------------- */
/* the empty-block law                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What a bare block inside a walled quarter becomes.
 *
 * Four purposes, and every one of them is a thing a real walled town puts on
 * the ground it has not built on: an **orchard** (fruit trees in rows), a
 * **market** (stall rows on trodden ground), a **garden** (beds, planters and a
 * bench under a tree), a **paddock** (a railed enclosure with a trough). None
 * of them is a new block id or a new archetype — each is drawn by the life pass
 * out of the vocabulary it already carries (`structures/life.ts` §2a).
 */
export type BlockDressing = "orchard" | "market" | "garden" | "paddock";

/**
 * Shortest side a dressed remainder may have, in columns.
 *
 * Nine. Under it the ground is a verge rather than a place: an orchard needs
 * two rows to read as rows, a market needs an aisle and the stalls either side
 * of it, and a paddock needs an inside. `MIN_INFILL_SIDE` is 7 and is the width
 * at which a *building* stops fitting, which is the wrong question — the
 * remainder tier exists precisely where no building fits.
 */
export const DRESSING_MIN_SIDE = 9;

/**
 * Least area a dressed remainder may have, in columns.
 *
 * A 9 × 14 strip or better. Under about this the dressing is one tree and two
 * crates, which reads as clutter dropped on a verge rather than as a decision;
 * over it there is room for the module — rows, aisles, beds — that makes the
 * ground look laid out.
 */
export const DRESSING_MIN_AREA = 130;

/**
 * One block that ended the pass with no building on it, and what it became.
 *
 * The layout decides *what*; the life pass decides where inside it each object
 * stands. So this carries a rectangle and a purpose and nothing about objects.
 */
export interface DressedBlock {
  /** Index into the quarter's own block list. */
  readonly block: number;
  /** The block's rectangle — the whole of it; the dressing insets itself. */
  readonly rect: Rect;
  readonly kind: BlockDressing;
}

/**
 * The menu a pre-industrial quarter draws from.
 *
 * The order is fixed, because the draw is an index into it: reordering these
 * would be a different world for the same seed.
 */
export const DRESSINGS_EARLY: readonly BlockDressing[] = Object.freeze([
  "orchard",
  "market",
  "garden",
  "paddock",
]);

/**
 * The menu an industrial-or-later quarter draws from.
 *
 * The paddock is the one purpose the era takes away: a railed livestock
 * enclosure between two streets is a pre-industrial town, and a modern one puts
 * a garden there. Everything else is era-neutral, which is why the two menus
 * share a prefix rather than being two unrelated lists.
 */
export const DRESSINGS_LATE: readonly BlockDressing[] = Object.freeze([
  "orchard",
  "market",
  "garden",
]);

/** Which menu an era class reads from. */
export function dressingsFor(era: EraClass): readonly BlockDressing[] {
  return era === "industrial" || era === "modern" || era === "far_future"
    ? DRESSINGS_LATE
    : DRESSINGS_EARLY;
}

/**
 * Which block a built rectangle stands on, or `-1`.
 *
 * Keyed on the rectangle's **centre**, because a seated building is grown out
 * of a lot and then rotated: its rect can overhang the block's inscribed
 * rectangle at the eaves, and a containment test would then call a built block
 * bare. The centre of a building on a block is on that block.
 */
export function blockOf(blocks: readonly Block[], rect: Rect): number {
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cz = Math.floor((rect.z0 + rect.z1) / 2);
  for (const [i, block] of blocks.entries()) {
    const r = block.rect;
    if (cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1) return i;
  }
  return -1;
}

/**
 * Did this quarter ask to be walled?
 *
 * Both spellings, because the document has two and they mean the same thing:
 * `params.walls` on the node, and `intent.character.fortification: "walled"`
 * on any intent that reaches it (`structures/walls-intent.ts`). Troy uses the
 * second, which is exactly why reading only the first would have left the guard
 * silent on the world it was written for.
 */
function walledQuarter(params: DistrictParams, intent: ResolvedIntent): boolean {
  if (params.walls !== undefined) return true;
  return intent.intent.character?.fortification === "walled";
}

/* -------------------------------------------------------------------------- */
/* the street wall                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Longest terrace, in columns of frontage, per density.
 *
 * Downtown the cap is architectural rather than structural: past about forty
 * columns a single unbroken run stops reading as a street and starts reading as
 * a wall, so a longer face is cut into two terraces with a passage between them
 * (see {@link TERRACE_PASSAGE}). At `medium` the cap is shorter because the
 * quarter it describes is a row-house neighbourhood, where a run of two or
 * three houses and then a gap is the actual grain.
 *
 * `low` is 0, which reads as "never": a village is detached houses in gardens,
 * and a street wall through one would be a town centre dropped into a hamlet.
 */
export const TERRACE_MAX_FRONTAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 46,
  medium: 27,
  low: 0,
});

/**
 * Columns left between two terraces cut from the same block face.
 *
 * Three, and deliberately readable as something rather than as a mistake: at
 * three columns with buildings four or more storeys either side it is a
 * pedestrian passage / light well, which is exactly what a gap in a real street
 * wall is. One column would be a crack and seven would be a missing building.
 */
export const TERRACE_PASSAGE = 3;

/** Fewest lots a terrace is cut from; one lot on its own is just a building. */
export const TERRACE_MIN_LOTS = 2;

/**
 * Share of terraces the fabric actually builds, per density.
 *
 * High density is a continuous street wall by definition. At medium the run
 * that was *not* built is what makes the next one read as a terrace rather than
 * as the whole block — and the lots it gives back are not wasted: they fall
 * through to the ordinary per-lot infill, with its own coverage draw and its
 * own side gaps, which is a detached house between two rows.
 */
export const TERRACE_COVERAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 1,
  medium: 0.72,
  low: 0,
});

/* -------------------------------------------------------------------------- */
/* products                                                                    */
/* -------------------------------------------------------------------------- */

/** What one district's fabric came to. */
export interface DistrictStats {
  readonly blocks: number;
  readonly lots: number;
  readonly landmarks: number;
  /** Landmarks that found no lot run big enough. */
  readonly landmarksUnplaced: number;
  readonly infill: number;
  /** Terraces cut from runs of consecutive lots on one block face. */
  readonly terraces: number;
  /** Bays across every terrace — the buildings a player counts on the street. */
  readonly terraceBays: number;
  /** Lots the terraces claimed; they are *not* also counted in `infill`. */
  readonly terraceLots: number;
  /**
   * **Homes, not buildings.** A terrace is *one* building with `bays` front
   * doors, and a player walking the street counts the doors: the site-planned
   * fixture's nine buildings include two terraces of ten bays between them, so
   * it holds **seventeen** dwellings, not nine.
   *
   * Counted beside `districtBuildings` rather than instead of it
   * (`docs/SITE-PLAN-v0.md` §8.3 check 2 is a count of *buildings*, and this is
   * the number that answers "how big is this town"). Additive: every quarter
   * carries it, and for a quarter with no terrace it equals the building count.
   */
  readonly dwellings: number;
  /**
   * Parcels the pass could not build on: off the envelope, cut through by an
   * organic street, or narrower than {@link MIN_INFILL_SIDE} after the side gap.
   *
   * A lot the *density* left open is not counted here — that is a decision, and
   * `lots - infill` already says how many. Dropped silently as far as the author
   * is concerned (a lot is an internal subdivision, and there is nothing in the
   * document to fix) but counted, because a district that drops most of its
   * parcels is a district whose `blockSize` is fighting its `density`.
   */
  readonly lotsDropped: number;
  /** Columns the frontage lots grew. Absent unless the form planned strips. */
  readonly lotColumns?: number;
  /** Columns their seated rectangles took. Absent unless `lotColumns` is. */
  readonly seatedColumns?: number;
  /** Lots inside the reserved central block, when `params.plaza` is set. */
  readonly plazaLots: number;
  readonly carriagewayColumns: number;
  readonly sidewalkColumns: number;
  /** Blocks that closed around a courtyard. Absent when none did. */
  readonly courtyards?: number;
  /**
   * § the empty-block law, measured rather than assumed, and the three numbers
   * are one sentence: `bareBlocks` ended the infill pass with no building on
   * them, `blocksRedrawn` of those built on the relaxed re-draw, and
   * `blocksDressed` of them became an orchard, a market, a garden or a paddock.
   * `bareBlocks === blocksRedrawn + blocksDressed` is the law. A `blocksDressed`
   * that is not zero is not a defect; it is the second tier working.
   *
   * Absent on every quarter the law does not reach — anything unwalled — so a
   * village's stats are the object they were.
   */
  readonly bareBlocks?: number;
  readonly blocksRedrawn?: number;
  readonly blocksDressed?: number;
  /**
   * §6.1's composition, and how many rungs of §6.3's ladder it took to get it.
   *
   * Absent for every quarter but a site-planned one: the numbers are measured
   * from planned platforms, and a quarter with none has nothing to say about
   * how much of itself it left as hillside.
   */
  readonly naturalFraction?: number;
  readonly streetFraction?: number;
  readonly platformFraction?: number;
  readonly replanRounds?: number;
  readonly principalStreets?: number;
  /**
   * Why the others did not, by §4.2's criteria — the measurement behind
   * `COURTYARD_NONE`, and the number to look at before touching
   * {@link COURTYARD_FILL}. Absent when nobody asked for a courtyard.
   */
  readonly courtyardRejects?: Readonly<Partial<Record<CourtyardReject, number>>>;
  /**
   * The ground-plane tie's own numbers, as `LOAM-T241`/`LOAM-T242` measure them
   * (`docs/GROUND-UNIFICATION-v0.md` §11.4, wave 12C).
   *
   * **Absent while `GROUND_PLANE_TIE` is off** — the datum is not handed to the
   * election at all then, so there is nothing measured and no report golden
   * moves. Present on every quarter the tie reached, whether or not either
   * diagnostic fired, because "zero untied, zero drift" is exactly the number
   * 12F's write-up has to be able to quote.
   *
   * Report-only: nothing downstream reads it and no block moves because of it,
   * the way {@link ProgramNodeStats.sites} is report-only.
   */
  readonly planeTie?: GroundPlaneTieStats;
  /**
   * What the post-election street harmonization did on this quarter —
   * `STREET_PLANE_HARMONIZE`, the +1 road lip.
   *
   * Absent while the flag is off, and absent on a quarter where no segment's
   * flanks asked for a drop, so a report golden only moves where the world
   * does. Report-only, exactly as {@link DistrictStats.planeTie} is.
   */
  readonly streetHarmonize?: StreetHarmonizeStats;
  /**
   * **§2.7's explanation record**, per quarter —
   * `docs/DESCENT-SOLVE-v0.md`'s "without this record the design is not
   * maintainable and must not ship".
   *
   * A procedure can be debugged by reading it; an optimum cannot. What is here
   * is what a walk verdict has to be able to quote back: the recognition census
   * (seeds, faces, demands, groups), one {@link DescentRecord} per solved
   * descent — its face, its terminals, its trunk and branch lengths, its risers
   * and landings, and **the six cost terms of the chosen path beside those of
   * the best path down the straight fall line**, which is the marginal that
   * answers "why did it switchback here" — and every refusal with its reason.
   *
   * Report-only, exactly as {@link DistrictStats.planeTie} is. **Absent while
   * `DESCENT_SOLVE` is off**, so no report golden moves.
   */
  readonly descents?: DescentStats;
}

/**
 * What the fifth datum did on one quarter (§2.7).
 *
 * The recognition half is published whether or not anything was solved,
 * deliberately: §7.1's suspect population is *faces that carried no demand*,
 * and a report that only spoke about the descents it built could not name one.
 */
export interface DescentStats {
  /** §1.2 S1's scarp seeds over this quarter. */
  readonly seeds: number;
  /** §1.2 S2's faces — 4-connected components of the dilated mask. */
  readonly faces: number;
  /** §1.3's steep demands, after R1 and R2. */
  readonly demands: number;
  /** §1.4's groups — one descent problem each. */
  readonly groups: number;
  /** Descents with at least one built run. */
  readonly built: number;
  /** Columns of the solved corridor `quarter.plane` subtracts (§3.2). */
  readonly corridorColumns: number;
  /** §7.4's cost witness: states settled over every face of this quarter. */
  readonly states: number;
  readonly records: readonly DescentRecord[];
  readonly refusals: readonly { readonly reason: string; readonly what: string }[];
}

/**
 * The harmonizer's numbers on one quarter — how many **stations** both flanks
 * asked to drop, how many the re-grade actually moved, and one record per
 * segment that had an asked stretch in it.
 *
 * `asked − moved` is the interesting number: those are the stations F9's cut
 * cap, the water floor or a junction pin refused, and a quarter where it is
 * large is a quarter whose lip is not a datum problem.
 */
export interface StreetHarmonizeStats {
  readonly asked: number;
  readonly moved: number;
  /** Every segment the re-grade touched, in graph order. */
  readonly segments: readonly HarmonizedSegment[];
}

/**
 * What the anchored platform election did on one quarter — the tie's standing
 * number, so a probe reads it off the report instead of instrumenting a build.
 *
 * Four of these are `PlatformTieReport` verbatim (the election's own counters,
 * filled in place by `derivePlatforms`); the rest are `LOAM-T242`'s post-hoc
 * measurement of the finished election against the datum that claims those very
 * columns.
 */
export interface GroundPlaneTieStats {
  /** Blocks the election looked at. */
  readonly blocks: number;
  /** Blocks that found a graded carriageway in reach and anchored on it. */
  readonly tied: number;
  /** Blocks with no banded column in reach of any perimeter column (G3). */
  readonly untied: number;
  /** Blocks split because their *perimeter* datum spanned a storey (G4). */
  readonly spanSplit: number;
  /**
   * Platform columns within `reach` of a graded carriageway — the population
   * `LOAM-T242` is measured over. `measured === onLattice + drift`.
   */
  readonly measured: number;
  /** Of those, columns a whole number of storeys from the street's own level. */
  readonly onLattice: number;
  /** Of those, columns that are not — **this should be 0** once the anchor holds. */
  readonly drift: number;
  /** The largest-magnitude off-lattice residual, signed; 0 when none drifted. */
  readonly worstDrift: number;
  /** The reach the measurement probed with, in columns — `frontageReach`. */
  readonly reach: number;
  /**
   * §11.0's attribution as a distribution rather than a claim: `levelY − nearest
   * datum level`, in columns, keyed by the signed residual. Before the anchor
   * the citadel's whole histogram was one bar at `+1` (4,180 columns); what it
   * becomes is what 12F publishes. Sort the keys numerically to read the bars in
   * order — JS enumerates the non-negative ones first.
   */
  readonly residuals: Readonly<Record<string, number>>;
}

/** One district's fabric, as the compile report carries it. */
export interface DistrictProduct {
  readonly nodePath: string;
  /** The footprint the solver placed — the fabric's whole world. */
  readonly bounds: Rect;
  /** The pinned F4 / road-pass contract. */
  readonly streets: StreetGraph;
  /**
   * The graded elevation of those streets — `docs/GROUND-UNIFICATION-v0.md` F2,
   * and **the way the datum crosses the stage boundary** (wave 8D).
   *
   * The datum is computed here, in `layDistrict`, at the moment the graph is
   * drawn; the surfacer two stages later has to *consume* it rather than
   * re-derive one (F8). It rides on the product because the product is already
   * the one thing the fabric hands forward: `terrain/compile.ts` collects it
   * into `layoutOutcome.districts` and passes that straight into
   * `buildStructures`, which lines the datums up with `graphs` for
   * `surfaceStreetGraph`. No new parameter crosses the boundary, and no second
   * copy of the graph-to-district correspondence exists to drift.
   *
   * **Absent while `FRONTAGE_TIE` is off**, which is every compile today: the
   * datum is not even graded, the product is the object it has always been, and
   * the surfacer's datum path is unreachable.
   */
  readonly datum?: StreetDatum;
  /**
   * **The fifth datum** — every descent this quarter's network makes
   * (`docs/DESCENT-SOLVE-v0.md` §4.1), solved in pass 4 against the very field
   * `gradeStreetDatum` graded — §1.1's rule, and the reason the descent and the
   * street datum cannot disagree about the hill by a block — and before the
   * election ever saw the ground.
   *
   * It rides the product for the reason {@link DistrictProduct.datum} does, and
   * it crosses the stage boundary by the same route: `terrain/compile.ts`
   * collects it into `layoutOutcome.districts`, and `buildStructures` lines the
   * descents up with `graphs` for `surfaceStreetGraph` (§4.2's registration),
   * with `deriveSeamStairs` (§5.3's scoping), and with `declarePads` (§3.2's
   * subtraction). One correspondence, no second copy of it to drift.
   *
   * **Absent while `DESCENT_SOLVE` is off** — the datum is the empty one then,
   * and an empty descent is no descent, so the product is the object it has
   * always been and every consumer below takes the path it always took.
   */
  readonly descent?: DescentDatum;
  /**
   * Which urban form drew this quarter, and whether it is the one that was
   * asked for.
   *
   * This is how a fallback reaches the **final** compile report rather than only
   * a compile-feedback round: `form.id !== form.requested` with
   * `form.fellBackBecause` set is the whole story, per quarter, in the artifact
   * that ships beside the world.
   */
  readonly form: FormRecord;
  /** Dug water this quarter declared, for the canal pass. Usually absent. */
  readonly channels?: readonly FormChannel[];
  /** 1 for a carriageway column, row-major over {@link DistrictProduct.bounds}. */
  readonly carriageway: Uint8Array;
  /** 1 for a sidewalk column, row-major over {@link DistrictProduct.bounds}. */
  readonly sidewalk: Uint8Array;
  /**
   * The blocks that closed around a courtyard, and the passages through them
   * (`docs/COURTYARDS-AND-LEVELS-v0.md` §4). Absent — not empty — for every
   * quarter that did not ask, which is every document written before Phase 4.2.
   *
   * The street graph deliberately knows nothing about a passage: it is drawn by
   * the form before blocks exist, and threading a three-column stub back into
   * it would perturb the form contract for no gain. The physics lint's walking
   * agent walks the *world*, so it finds the passage if the passage is
   * walkable, which is the only property that matters.
   */
  readonly courtyards?: readonly CourtyardBlock[];
  /**
   * Blocks that elected no building and were given a purpose instead
   * (§ the empty-block law). Absent — not empty — for every quarter that is not
   * walled and for every walled quarter that built on all of its blocks, which
   * is what keeps an unwalled village byte-identical.
   */
  readonly dressed?: readonly DressedBlock[];
  /**
   * This quarter's ground as a set of level platforms, when it has more than
   * one (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.1).
   *
   * Absent for every quarter whose ground policy is not `"stepped"`, and for a
   * `"stepped"` quarter that came out as one plane. Carried on the product
   * because the retaining pass runs on the *column plan*, two stages later, and
   * re-deriving the platforms there would be the same construction with a
   * second chance to differ.
   */
  readonly levels?: GroundLevels;
  /** The seams between those platforms, in a fixed order. Absent with `levels`. */
  readonly seams?: readonly LevelSeam[];
  /**
   * This quarter was drawn by a **site planner**, so most of its ground is
   * natural slope and its platforms are cut *into* the hill
   * (`docs/SITE-PLAN-v0.md` §5.4).
   *
   * The uphill edge of such a platform is a face nothing owns today: `levelSeams`
   * ignores it (natural ground is not a platform), `skirtSeams` ignores it (it
   * only claims neighbours whose ground is *below* the platform top), and
   * `faceCuts` ignores it (its members must themselves be on a platform, and the
   * column presenting an uphill face is natural hillside). On a quarter with
   * 100 % platform coverage that was invisible; take the coverage away and it
   * would ship as a vertical band of raw soil behind every terrace.
   *
   * Setting this lets `faceCuts` finish the one ring of natural columns that
   * stand above a platform, in the hill's own rock — the treatment §5.2 rule 8
   * gives an unwalled cut, reached through the pass that already paints it.
   * **Absent for every other quarter**, so nothing that did not ask moves.
   */
  readonly naturalCuts?: boolean;
  /**
   * The transitions the site planner declared (`docs/SITE-PLAN-v0.md` §5.4).
   *
   * v0 carries the **cut** edges: the uphill faces nothing owned. Their presence
   * is also the gate on §5's context-aware treatment of the *fill* edges the
   * retaining pass measures, and on §5.5's promotion of `offPlatform` to an
   * error — both of which are promises only a planned quarter makes.
   */
  readonly plannedEdges?: readonly PlannedEdge[];
  /**
   * Columns of masonry this quarter may spend (§5.2 rule 7, §6.1's
   * `wallPerBuilding`).
   *
   * Absent — unlimited — for every quarter no planner drew, which is what makes
   * the ration hillside-gated and every other world byte-identical.
   */
  readonly wallBudget?: number;
  readonly stats: DistrictStats;
}

/** What the fabric pass hands back to the compiler. */
export interface DistrictPassResult {
  /** Synthetic solver nodes, one per building the fabric produced. */
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  /** `building.grammar@0` params per node path, for the structure pass. */
  readonly params: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly districts: readonly DistrictProduct[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Everything {@link solveDistricts} reads. */
export interface DistrictPassInput {
  readonly doc: SettlementDocument;
  readonly worldSeed: bigint;
  /**
   * The **levelled** master field.
   *
   * A district's own pad edit has already been composed by the time this runs,
   * which is the whole reason the pass is cheap: the ground inside a district
   * is flat, so a foundation elevation is one number and street grading is a
   * formality. Running before the pads would put every building on the terrain
   * the district was about to erase.
   */
  readonly field: HeightField;
  /**
   * The composed sea level, when the document has terrain.
   *
   * Read by the skyline field (C2) and nothing else: a column whose ground is
   * below it is water, and water is a view. Optional because a district is
   * perfectly well-defined without one — the frontage term simply goes to zero.
   */
  readonly seaLevel?: number;
  /** The solver's placements, in document order. */
  readonly placements: readonly Placement[];
  /**
   * 1 where a column holds water, row-major over `field.region`.
   *
   * Read only by C1's city pass, which routes a shoreline drive and has to know
   * where the shore is. There is no column plan this early, so the caller
   * unions the classification's ocean and lake masks — the same two the column
   * pass turns into `fluidKind` a few stages later.
   */
  readonly water?: Uint8Array;
  /**
   * **The pure terrain** — `docs/GROUND-CONTRACT-v1.md` §1.2's pristine
   * baseline, taken before the first `applyPadEdits`.
   *
   * {@link field} is the levelled master field and stays the authority for
   * every seat and every relief this pass measures; this is a second, narrower
   * answer to one question the padded field cannot answer honestly — *where
   * does the hill under this block step* — because by the time the pass runs
   * the solver's pads are already composed into `field`. Read by
   * `PlatformInput.pristine` (T7) and nowhere else.
   *
   * Optional: a fixture with no terrain stage has none, and the terrain
   * criterion is simply off without it.
   */
  readonly pristine?: HeightField;
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** Lay the fabric of every district in the document. */
export function solveDistricts(input: DistrictPassInput): DistrictPassResult {
  const rootPath = input.doc.root.id;
  const byPath = new Map(input.placements.map((p) => [p.nodePath, p] as const));

  const nodes: LayoutNodeInput[] = [];
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  const params = new Map<string, Readonly<Record<string, unknown>>>();
  const districts: DistrictProduct[] = [];
  const diagnostics: LoamDiagnostic[] = [];

  for (const child of input.doc.root.children) {
    if (!isDistrictNode(child)) continue;
    const nodePath = `${rootPath}.${child.id}`;
    const placement = byPath.get(nodePath);
    if (placement === undefined) continue; // dropped by the solver; already reported.
    const laid = layDistrict(child, nodePath, placement, input, diagnostics);
    if (laid === null) continue;
    nodes.push(...laid.nodes);
    placements.push(...laid.placements);
    ports.push(...laid.ports);
    padEdits.push(...laid.padEdits);
    for (const [path, p] of laid.params) params.set(path, p);
    districts.push(laid.product);
  }

  return { nodes, placements, ports, padEdits, params, districts, diagnostics };
}

/**
 * A city cell's overrides, when this "district" is one face of a {@link CityPlan}.
 *
 * C1 reuses the whole of this pass rather than growing a second fabric: a cell
 * *is* a district, just one whose outline is an arbitrary polygon at an
 * arbitrary angle and whose knobs were decided by where it sits rather than by
 * an author. Everything below — blocks, lots, landmarks, infill, frontage
 * seating — is untouched by the distinction.
 */
export interface CellFabric {
  /** 1 inside the cell, row-major over the placement's footprint. */
  readonly mask: Uint8Array;
  /**
   * The same mask pulled back by the sidewalk band.
   *
   * Streets are clipped to `mask` so they run right up to the arterial and can
   * be picked up as anchors there; *lots* are held inside `lotMask` so a facade
   * is never built hard against a boulevard's carriageway.
   */
  readonly lotMask: Uint8Array;
  /** Degrees about the footprint centre, quantised to 15. */
  readonly orientation: number;
  readonly blockSize: number;
  readonly density: DistrictDensity;
  /**
   * One foundation level for the whole cell, overriding the per-building median.
   *
   * A city has no city-wide pad — levelling one would raise the sea bed inside
   * its own bay — so without this each building takes its own median and two
   * neighbours on a gentle slope end up a block apart. At `LOT_SIDE_GAP.high`
   * of zero those two share a wall column, the second one built wins it, and
   * the first is left with a ladder attached to nothing and a flower pot
   * hanging in the air. A quarter is one terrace; the *city* is the thing that
   * steps.
   */
  readonly foundationY?: number;
  /**
   * Smallest footprint axis the auto-infill will build on, overriding
   * {@link MIN_INFILL_SIDE}.
   *
   * A city plan produces blocks of every shape, including the narrow ones an
   * authored `blockSize` never asks for, and the grammar has a bug at that
   * end: a seven- or eight-block building with three storeys in it comes out
   * with interior pockets its own stair cannot reach — reproducible on
   * `showcase-bayline.loam.json` with nothing changed but `blockSize: 33`,
   * which lints 62 `traversal.unreachable`. Until that is fixed where it lives,
   * a city declines the parcel rather than shipping the building.
   */
  readonly minBuilding?: number;
  /**
   * Where the cell's landmark children hang in the node tree.
   *
   * The author wrote them as children of the *city*, so that is where their
   * node paths — and every diagnostic naming one — must stay, even though the
   * cell they landed in is what actually placed them.
   */
  readonly landmarkBase?: string;
  /**
   * Points this cell's plan may organise itself around, in a fixed order.
   *
   * The city pass knows things a district never can: which corner of the cell
   * meets an arterial, which set piece was seated beside it, where the water is.
   * A form that has no use for them ignores them and says so in its record.
   */
  readonly focus?: readonly FormFocus[];
  /** A route corridor crossing the cell, clipped to it. Read by `linear`. */
  readonly corridor?: readonly Point2[];
}

/** One district's fabric. */
export interface LaidDistrict {
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  readonly params: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly product: DistrictProduct;
}

/**
 * The urban form a district will be drawn with — **resolved twice, on purpose.**
 *
 * Once here, from `from-document.ts`, *before* the solve, because a contour-led
 * form has to stop the solver levelling the ground it was going to read
 * (`LayoutNodeInput.groundPolicy` → `padFor`); and once inside {@link layDistrict},
 * to actually draw. Two resolutions of one value is exactly the shape of defect
 * `DESIGN.md` warns about, so this is the *only* function that answers the
 * question: both call sites hand it the same node, the same `nodePath` and the
 * same document, so they cannot disagree.
 */
export function resolveDistrictFabric(
  doc: SettlementDocument,
  node: DistrictNode,
  nodePath: string,
): DistrictFabric {
  ensureFanOutRows();
  const intent = intentFor(resolveIntents(doc), nodePath);
  return fanOut<DistrictFabric>(LAYOUT_ROWS.fabric, intent, { nodePath, today: node.params.fabric });
}

/**
 * How a district prepares its ground — **resolved twice, for the same reason
 * {@link resolveDistrictFabric} is**, and by the same single function.
 *
 * Once from `from-document.ts` before the solve, because a node that levels its
 * own ground must stop the solver laying a pad under it (`padFor`); and once
 * inside {@link layDistrict}, to found buildings on the platforms and treat the
 * seams between them. Both call sites hand this the same document, node and
 * `nodePath`, so they cannot disagree — and `sampleGround` now asks *this*
 * rather than re-deriving an answer of its own (§9.9).
 *
 * Precedence, and it is the standing one: an explicit `params.ground` outranks
 * `intent.character.ground`, which outranks what the form implies. The form's
 * implication is `"benched"` exactly when the resolved form declares
 * `requires.unlevelled` — the form registry is the one place that knows, so
 * nothing here enumerates form ids — and `"pad"` otherwise.
 *
 * `"benched"` is what this function returned as `"stepped"` before Phase 4.2.
 * The rename is what keeps `terraced` byte-identical: `padFor` returns null for
 * both, and the *new* `"stepped"` — derived platforms, retaining walls, derived
 * stairs — is a thing a document asks for by name
 * (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.2).
 */
export function districtGroundPolicy(
  doc: SettlementDocument,
  node: DistrictNode,
  nodePath: string,
  site?: GroundSite,
): DistrictGroundPolicy {
  installUrbanForms();
  const form = urbanForm(resolveDistrictFabric(doc, node, nodePath));
  const implied: DistrictGroundPolicy = form?.requires.unlevelled === true ? "benched" : "pad";
  const named = node.params.ground;
  if (named !== undefined) return named;
  ensureFanOutRows();
  const intent = intentFor(resolveIntents(doc), nodePath);
  // The row id is spelled out rather than imported from `LAYOUT_ROWS` because
  // WP-D owns that file and registers the row there; `fanOut` returns `today`
  // for a row nobody has written yet, which is exactly the behaviour this
  // package wants and fan-out law 2 requires.
  const resolved = fanOut<DistrictGroundPolicy>(GROUND_POLICY_ROW, intent, {
    nodePath,
    today: implied,
  });
  // **The relief election.** It sits *below* `params.ground` and below
  // `intent.character.ground` — both return above — and it refines the *form's
  // implication*, which is the only thing left. That placement is the whole
  // argument: a document that named a ground gets it however steep the hill,
  // and a document that named none gets the ground its site actually has
  // rather than the ground the form guessed at from nothing.
  //
  // It can only ever turn `"pad"` into `"stepped"`. `"benched"` is a form that
  // already cuts its own platforms and `"stepped"` is already the answer, so
  // there is nothing to double-apply and nothing to fight: `terraced` resolves
  // `"stepped"` a line above and never reaches here.
  if (resolved !== "pad" || site === undefined) return resolved;
  if (namedIntentGround(intent) !== undefined) return resolved;
  return reliefOf(site.field, site.footprint) >= STEP_RELIEF ? "stepped" : "pad";
}

/**
 * The ground a district was actually placed on — what the relief election reads.
 *
 * Handed in by the two call sites that know the footprint: `padFor`, which is
 * where the solver decides whether to lay a pad, and {@link layDistrict}, which
 * is where the platforms are derived. Both read the *same* field object at the
 * same footprint and therefore cannot disagree — which is the whole point, and
 * it is self-correcting either way round: elect `"stepped"` and no pad is laid,
 * so the fabric pass measures the same natural relief and elects `"stepped"`
 * again; elect `"pad"` and the pad is laid, so the fabric pass measures a
 * flattened footprint, whose relief is 0, and elects `"pad"` again.
 */
export interface GroundSite {
  readonly field: HeightField;
  /** The placed footprint, in world columns. */
  readonly footprint: Rect;
}

/**
 * Relief, in blocks, at which a quarter that named no ground steps instead of
 * being levelled.
 *
 * **Measured, not chosen.** The number has to clear three bars at once:
 *
 * - it must be above the relief of every quarter that reads as flat, or a world
 *   that did not ask to move moves and the byte-identity law is broken;
 * - it must be high enough that `derivePlatforms` actually finds two distinct
 *   storeys, because a quarter that elects `"stepped"` and comes out as one
 *   platform gets no pad *and* no platforms — the one genuinely bad outcome
 *   available here. A block median quantises to `FLOOR_HEIGHT` (4), so two
 *   distinct storeys need the block medians to straddle a multiple of 4;
 *   `2 · FLOOR_HEIGHT` is the smallest relief for which that is reliable
 *   rather than a coin toss on where the medians happen to land;
 * - it must be low enough that ordinary rolling ground is caught, because a
 *   threshold nothing reaches is the defect being fixed with extra steps.
 *
 * Measured over every committed example (`tools/…` is not needed; the numbers
 * are in the report on this change): quarters that read as flat sit at 0–5
 * blocks of relief and quarters that read as "a flat plane cobbled into
 * terrain" sit at 12 and above, with nothing in between. Ten — `2 ·
 * FLOOR_HEIGHT + 2` — is inside that gap and clears all three bars.
 */
export const STEP_RELIEF = 10;

/** `intent.character.ground`, when it names a policy this compiler knows. */
function namedIntentGround(intent: ResolvedIntent): string | undefined {
  const named: unknown = intent.intent.character?.ground;
  return typeof named === "string" && GROUND_POLICIES.has(named) ? named : undefined;
}

const GROUND_POLICIES: ReadonlySet<string> = new Set(["pad", "benched", "stepped"]);

/**
 * Whether this quarter's `"pad"` is a *default* rather than a request.
 *
 * The solver has to answer the same question {@link districtGroundPolicy} does
 * — a quarter that will step must not be padded first — but it asks it from
 * `padFor`, which sees a `LayoutNodeInput` and not a document. So the document
 * side is answered once, here, before the solve, and travels on the node as
 * {@link LayoutNodeInput.groundElectable}; `padFor` then does the one thing
 * only it can, which is measure the relief of the footprint it just chose.
 *
 * False the moment anything *asked* for a ground — `params.ground`,
 * `intent.character.ground`, or a form that cuts its own benches — because an
 * answered question is not re-opened by the terrain.
 */
export function districtGroundElectable(
  doc: SettlementDocument,
  node: DistrictNode,
  nodePath: string,
): boolean {
  if (node.params.ground !== undefined) return false;
  if (districtGroundPolicy(doc, node, nodePath) !== "pad") return false;
  ensureFanOutRows();
  return namedIntentGround(intentFor(resolveIntents(doc), nodePath)) === undefined;
}

/** `layout.groundPolicy` — registered by WP-D in `layout/streets-intent.ts`. */
const GROUND_POLICY_ROW = "layout.groundPolicy";

/**
 * `layout.courtyardShare` — registered by WP-D in `layout/streets-intent.ts`.
 *
 * Spelled out rather than imported for the same reason `GROUND_POLICY_ROW` is:
 * WP-D owns that file, and `fanOut` returns `today` for a row nobody has
 * written yet, which is exactly what fan-out law 2 requires.
 */
const COURTYARD_SHARE_ROW = "layout.courtyardShare";

/**
 * The archetype most of a block's ranges were built as, or `undefined`.
 *
 * A terrace carries its bays' archetypes rather than one of its own, so both
 * are counted; ties break on the lexicographically smaller name, which is what
 * makes the choice a pure function of what was built.
 */
function dominantArchetype(built: readonly BuiltLot[], rect: Rect): string | undefined {
  const counts = new Map<string, number>();
  const bump = (name: unknown, by: number): void => {
    if (typeof name !== "string" || name === "" || name === "terrace") return;
    counts.set(name, (counts.get(name) ?? 0) + by);
  };
  for (const item of built) {
    const r = item.rect;
    if (r.x1 < rect.x0 || r.x0 > rect.x1 || r.z1 < rect.z0 || r.z0 > rect.z1) continue;
    bump(item.params["archetype"], 1);
    const bays = item.params["bays"];
    if (Array.isArray(bays)) {
      for (const bay of bays) bump((bay as { archetype?: unknown }).archetype, 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [name, count] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }
  return best;
}

/** The `COURTYARD_NONE` diagnostic, naming the measurement that refused. */
function courtyardNone(
  nodePath: string,
  blocks: number,
  rejects: ReadonlyMap<CourtyardReject, number>,
  density: DistrictDensity,
): LoamDiagnostic {
  const order: readonly CourtyardReject[] = ["core", "fill", "perimeter", "density", "draw"];
  let worst: CourtyardReject = "draw";
  let count = 0;
  for (const reason of order) {
    const n = rejects.get(reason) ?? 0;
    if (n > count) {
      worst = reason;
      count = n;
    }
  }
  const measured: Readonly<Record<CourtyardReject, string>> = {
    share: "the share is zero",
    density: `"density": "${density}" never closes a block — a village is detached houses in gardens`,
    perimeter: `are too thin for two opposite rows of lots`,
    core: `have a core narrower than ${MIN_COURT_SIDE} columns`,
    fill: `are too ragged: their largest inscribed rectangle is under ${COURTYARD_FILL} of the block, so the perimeter would close around a hole`,
    draw: "the positional draw came in over the share on every eligible block",
  };
  return warning(
    "COURTYARD_NONE",
    nodePath,
    `no block in "${nodePath}" can hold a courtyard: ${count} of ${blocks} ${measured[worst]}`,
    density === "low"
      ? `raise "density" to "medium" or "high" — a courtyard block needs a continuous street wall around it`
      : `raise "params.blockSize" so a block is at least ${2 * LOT_DEPTH[density] + MIN_COURT_SIDE} columns across, or raise "density" to "high" so the perimeter builds a continuous street wall`,
  );
}

export function layDistrict(
  node: DistrictNode,
  nodePath: string,
  placement: Placement,
  input: DistrictPassInput,
  diagnostics: LoamDiagnostic[],
  cell?: CellFabric,
): LaidDistrict | null {
  const declaredParams = cell === undefined ? node.params : { ...node.params, density: cell.density };
  // The intent layer's urban rows, each handed the value this pass was about
  // to use. With no intent anywhere on this node's path every one of them
  // returns that value unchanged — see `intent/fanout.ts`, law 2.
  ensureFanOutRows();
  const intent = intentFor(resolveIntents(input.doc), nodePath);
  // `character.archetypes` → the mix every archetype draw in this quarter takes
  // (`layout/mix-intent.ts`). This is the single point: both the terrace runs
  // and the per-lot infill read `params.mix` from here.
  const biased = biasedMix(intent, nodePath, declaredParams.mix, diagnostics);
  const p = biased === declaredParams.mix ? declaredParams : { ...declaredParams, mix: biased };
  const density = fanOut<DistrictDensity>(LAYOUT_ROWS.density, intent, {
    nodePath,
    today: p.density,
  });
  const bounds = placement.footprint;
  const seed = nodeSeed(input.worldSeed, nodePath, node.seedSalt ?? "");
  const sidewalkWidth = fanOut<number>(LAYOUT_ROWS.streetWidth, intent, {
    nodePath,
    today: SIDEWALK_BY_DENSITY[density] ?? 1,
  });

  // The urban form registry (Phase 4.1). `drawFabric` is the only entry point:
  // it looks the form up, checks what the form needs against what this quarter
  // is, and draws either the requested form or its announced fallback — and
  // says which, in a diagnostic *and* in the `FormRecord` the report carries.
  installUrbanForms();
  // How this quarter's ground is prepared, from the one function that answers
  // that question. It is resolved *here* rather than re-derived from the form,
  // the relief or a constraint, because two answers to one question is the
  // defect class `DESIGN.md` names — `sampleGround` below is the case in point.
  //
  // The `site` argument is what lets a quarter that named no ground *elect*
  // stepped ground from the relief it was actually placed on (`STEP_RELIEF`).
  // A city cell is deliberately not offered one: a cell already gets no pad —
  // `padFor` returns null for the whole city — so its ground is already
  // natural, and electing platforms inside one is a second, larger change than
  // the one this is.
  const groundPolicy = districtGroundPolicy(
    input.doc,
    node,
    nodePath,
    cell === undefined ? { field: input.field, footprint: bounds } : undefined,
  );
  const requested = fanOut<DistrictFabric>(LAYOUT_ROWS.fabric, intent, {
    nodePath,
    // Resolved a second time here; `resolveDistrictFabric` is the shared answer
    // and this call is deliberately identical to it. See that function.
    today: p.fabric,
  });
  const replanned = planQuarter(
    {
      bounds,
      fabric: requested,
      nodePath,
      seed,
      blockSize: fanOut<number>(LAYOUT_ROWS.blockSize, intent, {
        nodePath,
        today: cell?.blockSize ?? p.blockSize ?? (BLOCK_SIZE_BY_DENSITY[density] as number),
      }),
      sidewalk: sidewalkWidth,
      density,
      ground: sampleGround(input, bounds, node, cell !== undefined, groundPolicy),
      focus: cell?.focus ?? [],
      ...(cell?.corridor === undefined ? {} : { corridor: cell.corridor }),
      ...(cell === undefined ? {} : { mask: cell.mask, orientation: cell.orientation }),
    },
    sidewalkWidth,
  );
  const drawn = replanned.drawn;
  if (!drawn.ok) {
    diagnostics.push(error("DISTRICT_TOO_SMALL", nodePath, drawn.refusal.reason, drawn.refusal.fix));
    return null;
  }
  diagnostics.push(...drawn.outcome.diagnostics);
  if (replanned.note !== null) diagnostics.push(note("SITE_COMPOSITION", nodePath, ...replanned.note));
  const plan = drawn.outcome.plan;
  // `let`, for one reason and no other: the leaf cap below may append its own
  // alleys, and the graph the product carries has to be the graph the quarter
  // was actually lotted against. It is reassigned exactly once, there.
  let graph = plan.graph;

  // --- the street datum (F2) ------------------------------------------------
  // Right after the graph is drawn, because F2 is exactly that: "a carriageway's
  // elevation profile is computed once, at the moment its graph is drawn". The
  // kernel is pure — `(region, graph, field, seaLevel)` and nothing else — so
  // this line adds no order dependence to the phase.
  //
  // Built **only** while {@link FRONTAGE_TIE} is on. Grading a datum nobody
  // reads is a per-district raster and a full sweep of every segment, and 8B's
  // contract is byte-identical *and* free with the flag off.
  //
  // A closure rather than an expression because the leaf cap below may append
  // alleys to the graph, and a lot that fronts an alley has to tie to a datum
  // that graded it. Regraded exactly once, and only for a quarter that was cut.
  //
  // Split in two — the input, then the grading — for one reason: the
  // post-election harmonization below re-grades this same input with a drop
  // map, and it must re-grade *this* input rather than a second copy of it
  // that could drift from it (`STREET_PLANE_HARMONIZE`).
  const datumInput = (against: StreetGraph): StreetDatumInput | null =>
    FRONTAGE_TIE
    ? ({
        region: {
          x0: bounds.x0,
          z0: bounds.z0,
          width: bounds.x1 - bounds.x0 + 1,
          depth: bounds.z1 - bounds.z0 + 1,
        },
        graph: against,
        field: input.field,
        seaLevel: input.seaLevel ?? 63,
        // 8E, the city cell, as corrected at 8F: a quarter that was handed one
        // foundation level *is* one terrace, and its own streets are that
        // terrace — not a second plane graded from the hillside the pad is
        // about to erase, and not a floor under one either. The lot branch
        // below already reads `cell?.foundationY` *before* the tie, so this is
        // the same law told to the carriageway: one plane per cell, and the
        // datum agrees with it instead of competing with it.
        //
        // 8E passed this as `floorY`, which only lifted the datum where the
        // hillside sat below the plane and left it standing where the hillside
        // sat above — over exactly the columns `maskRuns` was about to cut down
        // to the plane. The measurement, and why a pin is the right operator,
        // is on `StreetDatumInput.planeY`.
        ...(cell?.foundationY === undefined ? {} : { planeY: cell.foundationY }),
      })
    : null;
  const gradeDatum = (against: StreetGraph): StreetDatum | null => {
    const base = datumInput(against);
    return base === null ? null : gradeStreetDatum(base);
  };
  let datum: StreetDatum | null = gradeDatum(graph);
  const tieReach = frontageReach(sidewalkWidth);
  // F6/T238's counters. Both stay 0 while the flag is off.
  let tiedLots = 0;
  let untiedLots = 0;

  // --- the void ------------------------------------------------------------
  const grid = new Grid(bounds);
  const carriageway = new Uint8Array(grid.cells);
  for (const cell of carriagewayCells(graph, bounds)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) carriageway[k] = 1;
  }
  // `let` for the same one reason `graph` is: the leaf cap re-dilates the verge
  // once it has added its alleys, so that the product's masks describe the
  // quarter that was built rather than the one before the alleys.
  let sidewalk = dilate(grid, carriageway, sidewalkWidth);

  // --- the fifth datum: the descent solve -----------------------------------
  // `docs/DESCENT-SOLVE-v0.md` §4.1. **Pass 4, after `gradeStreetDatum` and
  // before `derivePlatforms`** — that window is the whole timing argument, and
  // this is the only place in the compiler that is inside it.
  //
  // Pure over `(region, StreetGraph, field, StreetDatum, occupancy)`, declaring
  // nothing: it recognizes every steep face the network must descend (§1) and
  // solves each as **one object** (§2). What comes back is consumed twice here
  // — the corridor joins `blocked` below (§3.2) and the whole datum rides the
  // product forward to the surfacer and to S9 (§4.2, §5.3) — and nowhere else.
  //
  // The region is the quarter's own, and it must be: recognition reads
  // `datum.band` and `datum.columnY`, which are row-major over exactly this
  // rectangle, and a descent that indexed the hill differently from the street
  // datum would disagree with it about the hill by a whole quarter.
  //
  // `field` is the same array `gradeStreetDatum` was handed, so §1.1's "the
  // descent and the street datum never disagree about the hill by one block"
  // is true by construction rather than by care.
  //
  // The flag lives in `solveDescents`, which returns `noDescents` while it is
  // off: with `DESCENT_SOLVE` false every mask below is a zero array nobody
  // ever finds a 1 in, and the quarter is byte-for-byte the one that shipped.
  const descentRegion: Region = {
    x0: bounds.x0,
    z0: bounds.z0,
    width: bounds.x1 - bounds.x0 + 1,
    depth: bounds.z1 - bounds.z0 + 1,
  };
  // **T4's hard forbiddance, as much of it as pass 4 can honestly know.** Water
  // is `fluid.channel` at rank 0 and is the one tier-A class that exists as a
  // mask this early; a building footprint inside *this* quarter is not placed
  // until 400 lines below, and it is kept off the corridor from the other side
  // — the corridor is in `blocked`, so no lot contains one. Absent when the
  // caller has no water mask, which is every terrain-less fixture.
  const descentForbidden = ((): Uint8Array | undefined => {
    if (!DESCENT_SOLVE || input.water === undefined) return undefined;
    const fr = input.field.region;
    const out = new Uint8Array(grid.cells);
    for (let j = 0; j < descentRegion.depth; j++) {
      const fj = bounds.z0 + j - fr.z0;
      if (fj < 0 || fj >= fr.depth) continue;
      for (let i = 0; i < descentRegion.width; i++) {
        const fi = bounds.x0 + i - fr.x0;
        if (fi < 0 || fi >= fr.width) continue;
        if (input.water[fj * fr.width + fi] === 1) out[j * descentRegion.width + i] = 1;
      }
    }
    return out;
  })();
  const descent: DescentDatum =
    datum === null
      ? noDescents(descentRegion)
      : solveDescents({
          region: descentRegion,
          graph,
          field: input.field,
          datum,
          ...(descentForbidden === undefined ? {} : { forbidden: descentForbidden }),
        });

  // --- blocks --------------------------------------------------------------
  const blocked = new Uint8Array(grid.cells);
  for (let k = 0; k < grid.cells; k++) blocked[k] = carriageway[k] === 1 || sidewalk[k] === 1 ? 1 : 0;
  // §3.2's third subtraction, at the one place the mask it subtracts from is
  // built. "The election's atoms are cut around a descent exactly as they are
  // cut around a street" — and `blocked` is *how* they are cut around a street,
  // so a descent joins it in the same line rather than in a second mechanism.
  // The plane therefore never asks for a descent's columns and the resolver
  // never arbitrates them: **the severance is impossible rather than won.**
  //
  // Guarded on there being a descent at all, so the flag's off state does not
  // walk a zero array once per quarter.
  if (descent.descents.length > 0) {
    for (let k = 0; k < grid.cells; k++) if (descent.corridor[k] === 1) blocked[k] = 1;
  }
  // Ground outside the cell is somebody else's — the boulevard's, the bay's, or
  // the next quarter's. Blocking it here is what makes a lot stop at the cell
  // edge without the subdivision knowing anything about city plans.
  if (cell !== undefined) {
    for (let k = 0; k < grid.cells; k++) if (cell.lotMask[k] !== 1) blocked[k] = 1;
  }
  // The form's own lot mask, ANDed with the caller's. Absent means "anywhere the
  // streets left free", which is what every form but `linear` says — so this is
  // a no-op for a document that names no new form.
  if (plan.lotMask !== undefined) {
    for (let k = 0; k < grid.cells; k++) if (plan.lotMask[k] !== 1) blocked[k] = 1;
  }
  // A reservation is a hole in the mask rather than a veto downstream, for the
  // reason `withoutReserved` states: after this the quarter subdivides, and the
  // subdivision has no vocabulary for ground that is spoken for.
  for (const reservation of plan.reservations ?? []) {
    for (let z = Math.max(bounds.z0, reservation.rect.z0); z <= Math.min(bounds.z1, reservation.rect.z1); z++) {
      for (let x = Math.max(bounds.x0, reservation.rect.x0); x <= Math.min(bounds.x1, reservation.rect.x1); x++) {
        const k = grid.index(x, z);
        if (k >= 0) blocked[k] = 1;
      }
    }
  }

  // --- the ground, as a set of level platforms ------------------------------
  // `docs/COURTYARDS-AND-LEVELS-v0.md` §3. The form's benches *are* the
  // platforms; every form but `terraced` declares none and `groundLevelsOf`
  // returns `null`, so the ordinary path allocates nothing and branches once —
  // the shape `benchLevels` already had, and why this is byte-identical.
  //
  // WP-B, filled: when the policy is `"stepped"` and the form declared no
  // benches, `layout/platforms.ts` derives them from the blocks' own medians
  // (§3.3) and they arrive here as ordinary `FormBench`es. A derived platform
  // and a declared one are the same thing to everything downstream, which is
  // why `groundLevelsOf` needs no second entry point and `foundationY` no
  // second branch. `derivePlatforms` returns an empty list when the ground is
  // flat enough that every block quantises to one storey — one platform is no
  // platform — so a `"stepped"` quarter on the level is exactly a `"pad"` one.
  // The water the election may not fill (`PlatformInput.water`). The floor may
  // *reclaim* — a fringe of shallow bay levelled to the waterline is a quay, and
  // Troy's citadel depends on it — but it may not **dam**: raise the bed of a
  // river running through the quarter and every reach above it stops being
  // water at all, because the flood-fill floods only what the map edge reaches.
  // So the water is handed to the election exactly when this quarter would cut
  // some of it off, and the election is otherwise the one WP-11F-fix shipped.
  // Computed only where it can be read — both consumers are gated on
  // `"stepped"` — so a quarter with no derived platforms pays for no floods.
  const protectedWater =
    groundPolicy !== "stepped" ||
    input.water === undefined ||
    !damsWater({ mask: input.water, region: input.field.region }, bounds)
      ? undefined
      : { mask: input.water, region: input.field.region };
  const declared = plan.benches ?? [];
  // --- the ground-plane tie (G2) --------------------------------------------
  // The datum is graded ~100 lines above and, until this wave, was simply not
  // handed on: `derivePlatforms` anchored its storey lattice on
  // `min(free ground)` with the streets *excluded* by `blocked`, so the
  // carriageway's own level was not a mark on the lattice at all (§11.0a P3/P4 —
  // citadel streets at 90, elected levels 91 and 87, and 90 mod 4 is neither).
  // Handing it over is the whole of G2.
  //
  // Gated on {@link GROUND_PLANE_TIE}, and G9's implication is why the datum is
  // also checked for `null`: `gradeDatum` returns `null` while `FRONTAGE_TIE` is
  // off, so with the frontage tie off there is nothing to anchor on and the
  // election is exactly today's.
  const planeTie: boolean = GROUND_PLANE_TIE;
  const tieDatum = planeTie ? datum : null;
  const platformTie: PlatformTieReport = {
    blocks: 0,
    tied: 0,
    untied: 0,
    spanSplit: 0,
    terraceSplit: 0,
    terraceAreaOnly: 0,
  };
  const derived =
    groundPolicy === "stepped" && declared.length === 0
      ? derivePlatforms({
          bounds,
          blocked,
          field: input.field,
          // T7's pure terrain (`TERRACE_BY_TERRAIN`). Handed over whenever the
          // caller has it, and read only by the terrain criterion: `input.field`
          // is the padded master field and "where does the hill step" is a
          // question about the ground the world came with.
          ...(input.pristine === undefined ? {} : { pristine: input.pristine }),
          // §3.2, stated to the election in its own vocabulary as well as
          // through `blocked`. Handed over only where a descent was solved, so
          // the flag's off state calls this function with exactly the argument
          // object it has always been called with — and `derivePlatforms` then
          // takes the caller's `blocked` by reference, without a copy.
          ...(descent.descents.length === 0 ? {} : { descentCorridor: descent.corridor }),
          ...(tieDatum === null
            ? {}
            : { datum: { street: tieDatum, reach: tieReach }, report: platformTie }),
          // The waterline the election may not elect below. A district levels
          // its own ground by editing the field, and the field is *reclassified*
          // after a pad edit — so a platform elected under the sea does not
          // merely sit low, it becomes ocean, and the fabric is laid on the
          // lake it made. See `PlatformInput.waterFloor`.
          ...(input.seaLevel === undefined ? {} : { waterFloor: input.seaLevel }),
          // …and the water that is already there, so the floor never fills it:
          // a channel through the quarter is not ground to be lifted to the
          // waterline, it is the river (`PlatformInput.water`).
          ...(protectedWater === undefined ? {} : { water: protectedWater }),
        })
      : [];
  const elected = declared.length > 0 ? declared : derived;
  // S6 rule 3 (`docs/GROUND-UNIFICATION-v0.md` §4.1): the election may not elect
  // a pair whose seam it would not pay for. A pair past
  // `SEAM_TIER_MAX · RETAIN_MAX` dissolves — the higher platform gives its level
  // back to the lower — and the quarter ships with fewer levels rather than with
  // a level nothing can serve. This is the first caller `LOAM-W410` has ever had.
  const election =
    SEAM_TIERS && groundPolicy === "stepped" && elected.length > 1
      ? dissolveTallPairs(
          bounds,
          elected,
          input.seaLevel,
          protectedWater,
        )
      : { benches: elected, dissolved: [] };
  for (const gone of election.dissolved) {
    diagnostics.push(
      warning(
        "LEVEL_DISSOLVED",
        nodePath,
        `platform "${gone.id}" in "${nodePath}" stood ${gone.drop} block(s) above "${gone.into}", past the ${DISSOLVE_DROP_MAX} a tier stack can serve, so it gave its level back and took its neighbour's`,
        `Split the difference across more platforms — raise "params.blockSize" so the quarter steps in smaller pieces — or move the quarter onto ground whose relief a retained face can hold.`,
      ),
    );
  }
  // A bench that is mostly water is not graded (`SUBMERGED_BENCH_UNGRADED`,
  // Kai 2026-08-24). The floor exempted it so a river keeps its bed, and the
  // quarter then *graded* it to that bed — and a pad edit over water drains the
  // water, so a bay inside a quarter shipped as a dry trench two below the sea.
  // The bench stays in the election and in `levels`: the fabric's lookups,
  // the seams and the lot seating read it exactly as before (a bench with a
  // level is what keeps lots and verges out of the water — dropping it put
  // them in the river). Only its `quarter.plane` pad edits are withheld, so
  // its columns keep the pristine terrain and the water on it. Read straight
  // off the classification's water, not off `protectedWater`, which is only
  // computed where the quarter would dam: whether a bench *is* water does not
  // depend on whether grading it would dam.
  const submergedPlatforms: readonly boolean[] =
    SUBMERGED_BENCH_UNGRADED && input.water !== undefined && election.benches.length > 0
      ? submergedBenches(election.benches, { mask: input.water, region: input.field.region })
      : election.benches.map(() => false);
  for (const [i, bench] of election.benches.entries()) {
    if (submergedPlatforms[i] !== true) continue;
    diagnostics.push(
      note(
        "PLATFORM_SUBMERGED",
        nodePath,
        `platform "${bench.id ?? String(i)}" in "${nodePath}" is mostly water and is not graded: its columns keep the pristine terrain and the water on it`,
        `nothing to change if the quarter meets the water there; if the water was not meant to be inside the quarter, move or shrink the district's envelope off it`,
      ),
    );
  }
  const levels = groundLevelsOf(bounds, election.benches);

  // --- the street harmonization (`STREET_PLANE_HARMONIZE`) -------------------
  // **The call point, and why it is here.** The datum grades ~200 lines above,
  // at the moment the graph is drawn (F2), which is a full substage before the
  // election exists — that is the whole mechanism behind Kai's walked lip: the
  // election pays a frontage cost to agree with the street
  // (`docs/ELECTION-SOLVE-v0.md` §1.3.3) and the street never reciprocates. So
  // the harmonization goes exactly here: after `dissolveTallPairs` has settled
  // which levels the quarter actually ships (a dissolved pair is not a plane a
  // street should chase) and `groundLevelsOf` has rasterised them, and *before*
  // anything reads the datum — the seams below, the lots' frontage tie, and the
  // product the surfacer re-grades from all come after this line.
  //
  // It does **not** re-run the election. The planes are the answer; only the
  // street moves, by at most one block, downward, and only where both flanks
  // asked (see `harmonizeStreetDatum`). Running the election again against the
  // moved street would be the two-grader loop F2 exists to forbid.
  //
  // `LOAM-T242`'s residual histogram below then measures the *harmonized*
  // datum, because that is the datum this quarter ships and the one the columns
  // it measures will actually stand beside.
  // A holder rather than a `let`, so the report the closure writes is the
  // report the product reads: TypeScript narrows a `let` at its use site
  // without seeing the assignment inside a callback.
  const harmonizeReport: { value: StreetHarmonizeStats | null } = { value: null };
  const harmonize = (against: StreetGraph, d: StreetDatum | null): StreetDatum | null => {
    if (!STREET_PLANE_HARMONIZE || d === null || levels === null) return d;
    const base = datumInput(against);
    if (base === null) return d;
    const out = harmonizeStreetDatum({
      base,
      datum: d,
      // The election's own answer, read as a pure lookup — `NO_PLATFORM` is
      // "this column elected nothing", which is silence, not a level.
      planeAt: (x: number, z: number): number | undefined => {
        const platform = levels.at(x, z);
        return platform === NO_PLATFORM ? undefined : (levels.levelY[platform] as number);
      },
      probe: STREET_PLANE_FLANK_PROBE,
      minFlank: STREET_PLANE_MIN_FLANK,
      minRun: STREET_PLANE_MIN_RUN,
    });
    // Replaced, never accumulated: the alley re-grade below grades the whole
    // graph again from pristine ground, so its records supersede the first
    // pass's rather than adding to them.
    harmonizeReport.value =
      out.segments.length === 0 ? null : { asked: out.asked, moved: out.moved, segments: out.segments };
    return out.datum;
  };
  datum = harmonize(graph, datum);
  /** The datum `LOAM-T242` measures against — harmonized where it moved. */
  const statsDatum = planeTie ? datum : null;

  // --- G3's report (`LOAM-T241`) --------------------------------------------
  // `LOAM-T238 FRONTAGE_UNTIED`'s mirror for the platform, and a note for the
  // same reason: an untied block is a *legal* outcome — the interior of a very
  // large quarter, a block against the district boundary, a block behind a
  // plaza — and G3 says it keeps exactly the number it has today. What is worth
  // reporting is a quarter where *every* block is untied, because that is the
  // fabric and the grader disagreeing about where the streets are. Dead while
  // the flag is off: nothing hands the report over.
  if (platformTie.untied > 0) {
    diagnostics.push(
      note(
        "GROUND_PLANE_UNTIED",
        nodePath,
        `${platformTie.untied} of ${platformTie.blocks} block(s) in "${nodePath}" found no graded carriageway within ${tieReach} block(s) of any perimeter column, and kept the quarter's own floor`,
        `Nothing to change in the document if these are interior or boundary blocks — that is the designed outcome. A quarter where *every* block is untied means its streets were drawn but not graded: report it.`,
      ),
    );
  }
  // --- G1's alarm (`LOAM-T242`) ---------------------------------------------
  // Measured post hoc, from the finished election against the datum that claims
  // those very columns: a platform column within reach of a carriageway whose
  // elected level is neither the datum's own nor a whole storey from it. **This
  // should be 0** once the anchor holds; before the anchor it was 4,180 citadel
  // columns at exactly +1, one bar and not a distribution (§11.0).
  //
  // Only measured with the tie on, so a report golden does not move before the
  // world does. The note names the worst residual; 12C publishes the histogram
  // it came out of on `DistrictStats.planeTie`, so a probe reads §11.0's
  // attribution off the report rather than out of an instrumented build.
  //
  // The counters travel whenever the tie ran; the *residual* half is empty on a
  // quarter that elected no platform at all (`levels === null`), which is a
  // legal outcome and not a hole in the report.
  let planeTieStats: GroundPlaneTieStats | null = null;
  if (statsDatum !== null) {
    let drift = 0;
    let worst = 0;
    let onLattice = 0;
    /** Signed residual → columns, collected in one pass and sorted at the end. */
    const residuals = new Map<number, number>();
    if (levels !== null) {
      for (let z = bounds.z0; z <= bounds.z1; z++) {
        for (let x = bounds.x0; x <= bounds.x1; x++) {
          const platform = levels.at(x, z);
          if (platform === NO_PLATFORM) continue;
          const near = statsDatum.levelNear(x, z, tieReach);
          if (near === undefined) continue;
          const residual = (levels.levelY[platform] as number) - near;
          residuals.set(residual, (residuals.get(residual) ?? 0) + 1);
          if (residual % FLOOR_HEIGHT === 0) {
            onLattice += 1;
            continue;
          }
          drift += 1;
          if (Math.abs(residual) > Math.abs(worst)) worst = residual;
        }
      }
    }
    planeTieStats = {
      blocks: platformTie.blocks,
      tied: platformTie.tied,
      untied: platformTie.untied,
      spanSplit: platformTie.spanSplit,
      measured: drift + onLattice,
      onLattice,
      drift,
      worstDrift: worst,
      reach: tieReach,
      // Built in ascending residual order. JS then orders integer-like keys
      // ahead of the negative ones when the object is enumerated, which is
      // deterministic but is not the histogram's order: a reader that wants the
      // bars in order sorts the keys numerically. The *values* are the point.
      residuals: Object.fromEntries(
        [...residuals.entries()].sort((a, b) => a[0] - b[0]).map(([r, n]) => [String(r), n]),
      ),
    };
    if (drift > 0) {
      diagnostics.push(
        note(
          "GROUND_PLANE_DRIFT",
          nodePath,
          `${drift} of ${drift + onLattice} platform column(s) in "${nodePath}" within ${tieReach} block(s) of a graded carriageway stand off the street's own storey lattice, the worst by ${worst} block(s)`,
          `Nothing to change in the document — a document cannot move its own storey lattice. A non-zero count is a compiler finding: the anchor did not hold on this quarter.`,
        ),
      );
    }
  }
  // Never accepted and quietly not met (§5.3): a document that asked for
  // stepped ground and got one plane is told so, in the terms it asked in, and
  // the quarter still compiles — as the `"pad"` it turned out to be.
  if (groundPolicy === "stepped" && declared.length === 0 && derived.length === 0) {
    const relief = reliefOf(input.field, bounds);
    diagnostics.push(
      note(
        "DISTRICT_GROUND",
        nodePath,
        `"${nodePath}" asked for stepped ground and came out as one platform: the ground under it holds ${relief} block(s) of relief, and a step needs ${FLOOR_HEIGHT}`,
        `Move the quarter onto steeper ground, enlarge "envelope.size" so it spans more of the slope, or drop "params.ground" and let it be the flat quarter it is.`,
      ),
    );
  }
  // Seam *treatment* is gated on `"stepped"`, which is the new and therefore
  // opt-in policy (§3.2, §6.2). A `"benched"` quarter — every `terraced` quarter
  // written before this phase — has platforms and gets its `foundationY` from
  // them, exactly as it always did, but nothing here treats the faces between
  // them: the `blocked` mask below and the pad apron further down both stay
  // today's, so the quarter is byte-identical. It is gated rather than proved a
  // no-op because `terraced`'s bench field partitions the *whole* quarter,
  // streets included, so its platforms are genuinely 4-adjacent and every one
  // of its bench boundaries is a seam.
  const seams = levels === null || groundPolicy !== "stepped" ? [] : levelSeams(levels);

  // **The platform boundary goes into `blocked` before `blocksOf` runs** —
  // §3.3 step 4, and the single placement the rest of the phase rests on. It is
  // one loop here and it is what makes the rest fall out rather than be built:
  // a split block becomes *two* blocks that subdivide independently, so no lot
  // spans two platforms and no terrace run does (`terraceRuns` groups by
  // `block:face`); two neighbours at `LOT_SIDE_GAP.high === 0` are never a
  // storey apart, because the seam column is between them; a courtyard block is
  // therefore never split-level; and the blocked columns are exactly where a
  // retaining wall will stand. Do not reinvent any of that elsewhere.
  //
  // `seams` is empty unless the policy is `"stepped"`, so this is a no-op for
  // every quarter that did not opt in — which is the second half of the
  // byte-identity argument (the first is that `levelY[at()]` equals
  // `benchLevels`' answer, column for column).
  for (const seam of seams) {
    for (const point of seam.cells) {
      const k = grid.index(point.x, point.z);
      if (k >= 0) blocked[k] = 1;
    }
  }
  // A form that cut its own benches hands the subdivision curved bands; see
  // `rectsOf`. Everything else keeps one rectangle per block, unchanged.
  //
  // **Unless the form planned its own frontage** (`docs/SITE-PLAN-v0.md` §4.1).
  // For columns inside a planned strip the chain `blocksOf` → `rectsOf` →
  // `largestFreeRect` → `subdivide` is replaced by {@link frontageLots}, and
  // outside strips there are no blocks at all, because there is no platform and
  // no ground a lot may take. The gate is `plan.strips`, which only `hillside`
  // sets, so no other form moves.
  const planned = plan.strips;

  // --- the leaf cap ---------------------------------------------------------
  // Every block that is too deep for `subdivide` to reach the middle of gets an
  // alley through it, recursively, until none is (see {@link leafBlockCap}).
  // Skipped whole on the planned path, where the planner cut the frontage
  // itself and there are no blocks; and a no-op — not one column moved, not one
  // segment added — for every quarter already under the cap, which is every
  // pitch-laid fabric in the repository.
  const multiRect = BLOCK_MULTI_RECT || declared.length > 0;
  const alleys =
    planned === undefined
      ? cutDeepBlocks({
          grid,
          carriageway,
          blocked,
          split: multiRect,
          density,
          sidewalkWidth,
          bounds,
        })
      : { lanes: [], rounds: 0, sidewalk: null };
  if (alleys.sidewalk !== null) sidewalk = alleys.sidewalk;
  if (alleys.lanes.length > 0) {
    graph = { ...graph, segments: [...graph.segments, ...alleys.lanes] };
    // The datum is the frontage authority and an alley is frontage; a lot that
    // fronts an ungraded segment is an untied lot (`LOAM-T238`) seated on its
    // own median, which is exactly the drift F2 exists to prevent.
    // …and harmonized again, for the same reason it was harmonized above: the
    // re-grade throws the harmonized datum away and grades the *whole* graph,
    // alleys included, from pristine ground again. The election has not moved —
    // `levels` is the same rasterised answer — so this is the same decision
    // taken over a graph with more segments in it, not a second opinion.
    datum = harmonize(graph, gradeDatum(graph));
    diagnostics.push(
      note(
        "DISTRICT_BLOCK_ALLEY",
        nodePath,
        `${alleys.lanes.length} block(s) in "${nodePath}" were wider than the ${leafBlockCap(density, sidewalkWidth)} columns past which an alley pays for itself at "${density}", and were cut by one so their cores became frontage`,
        `Nothing to change in the document — an alley through an over-deep block is the intended repair. Lower "params.blockSize" if you would rather the fabric drew the streets itself.`,
      ),
    );
  }

  const blocks = planned === undefined ? blocksOf(grid, blocked, multiRect) : [];

  // --- the reserved square -------------------------------------------------
  // `plaza: true` keeps one block open. The block nearest the district's centre
  // is chosen because that is what a square *is*; ties break on the block's own
  // ordering, which is row-major over the footprint.
  let plazaBlock = -1;
  if (p.plaza === true && blocks.length > 0) {
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cz = (bounds.z0 + bounds.z1) / 2;
    let best = Number.POSITIVE_INFINITY;
    for (const [i, block] of blocks.entries()) {
      const dx = (block.rect.x0 + block.rect.x1) / 2 - cx;
      const dz = (block.rect.z0 + block.rect.z1) / 2 - cz;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        plazaBlock = i;
      }
    }
  }

  // --- lots ----------------------------------------------------------------
  const owner = segmentOwners(grid, graph);
  const lots: Lot[] = [];
  const blockSites: BlockSite[] = [];
  let dropped = 0;
  let plazaLots = 0;
  /** §4.2's recovery, measured rather than assumed. Null off the planned path. */
  let frontage: FrontageWalk | null = null;
  // --- courtyard blocks (Phase 4.2, §4) ------------------------------------
  // The share of *eligible* blocks that close around a courtyard. Default 0,
  // which is what makes the whole feature byte-identical for a document that
  // names neither the param nor the intent key: `planCourtyard` returns a
  // refusal before it measures anything, so `subdivide` walks the code it
  // walked before this phase.
  const courtyardShare = fanOut<number>(COURTYARD_SHARE_ROW, intent, {
    nodePath,
    today: p.courtyards ?? 0,
  });
  const courtyardStream = streamSeed(seed, "courtyard");
  const courtyardPlans = new Map<number, CourtyardPlan>();
  const courtyardRejects = new Map<CourtyardReject, number>();
  const courtyardPassages: CourtyardPassage[] = [];
  const preferAt = new Map<string, number>();
  for (const [i, block] of blocks.entries()) {
    const cut = subdivide(
      block,
      i,
      density,
      grid,
      blocked,
      owner,
      sidewalkWidth,
      { share: courtyardShare, stream: courtyardStream },
      declared.length > 0,
    );
    dropped += cut.dropped;
    if (cut.rejected !== null) {
      courtyardRejects.set(cut.rejected, (courtyardRejects.get(cut.rejected) ?? 0) + 1);
    }
    if (i === plazaBlock) {
      plazaLots += cut.lots.length;
      continue;
    }
    if (cut.courtyard !== null) {
      courtyardPlans.set(i, cut.courtyard);
      for (const [face, at] of cut.courtyard.preferAt) preferAt.set(`${i}:${face}`, at);
    }
    lots.push(...cut.lots);
    if (cut.front !== null && cut.lots.length > 0) blockSites.push(cut.front);
  }
  if (planned !== undefined) {
    const walked = frontageLots(planned, grid, blocked, density);
    lots.push(...walked.lots);
    blockSites.push(...walked.sites);
    dropped += walked.dropped;
    frontage = walked;
  }
  lots.sort((a, b) => (a.rect.z0 !== b.rect.z0 ? a.rect.z0 - b.rect.z0 : a.rect.x0 - b.rect.x0));

  // --- landmarks, then infill ----------------------------------------------
  const claimed = new Set<string>();
  const built: BuiltLot[] = [];
  const landmarks = landmarksOf(node, cell?.landmarkBase ?? nodePath, input.worldSeed, diagnostics);
  let unplaced = 0;
  for (const landmark of landmarks) {
    const site = claimSite(lots, blockSites, claimed, landmark);
    if (site === null) {
      unplaced++;
      diagnostics.push(
        warning(
          "CANNOT_FIT",
          landmark.nodePath,
          `no lot or block in "${nodePath}" is big enough for this landmark's ${landmark.size[0]} × ${landmark.size[2]} footprint`,
          `shrink "envelope.size", raise the district's "params.blockSize" so its blocks are bigger, or move this building out of the district and let the solver place it`,
        ),
      );
      continue;
    }
    for (const lot of site.lots) claimed.add(lot.id);
    built.push({
      nodePath: landmark.nodePath,
      id: landmark.id,
      rect: site.rect,
      face: site.face,
      size: landmark.size,
      ports: landmark.ports,
      params: landmark.params,
      tags: landmark.tags,
      seed: landmark.seed,
      frontPort: undefined,
      ...frontageOf(site.rect, site.face, site.lots),
    });
  }

  // --- the skyline field (C2) ----------------------------------------------
  // Built here, between the landmarks and the infill, because it reads the
  // landmarks and every infill lot reads it. Keyed on the district's bounds,
  // its seed, the terrain and the *authored* children — never on the lots, so
  // one more infill building cannot move the height of any other.
  // `layout.storeyCeiling`: what the era says nothing in this quarter may build
  // past. `undefined` is "no opinion", which every document without an `era`
  // gets and which leaves the field and the street wall exactly as they were.
  const storeyCeiling = fanOut<number | undefined>(LAYOUT_ROWS.storeyCeiling, intent, {
    nodePath,
    today: undefined,
  });
  const prominence = buildProminenceField({
    bounds,
    seed,
    ...(storeyCeiling === undefined ? {} : { storeyCeiling }),
    // `layout.storeyMultiplier`: a wealthy quarter builds taller on the same
    // lots. 1 is "today", so a district with no intent is unmoved.
    storeyMultiplier: fanOut<number>(LAYOUT_ROWS.storeyMultiplier, intent, {
      nodePath,
      today: 1,
    }),
    landmarks: built.map(
      (b): ProminenceLandmark => ({
        x: Math.floor((b.rect.x0 + b.rect.x1) / 2),
        z: Math.floor((b.rect.z0 + b.rect.z1) / 2),
        // A tall landmark bulges harder than a squat one: the spike exists so a
        // spire is the peak of a cluster rather than a lone chimney.
        weight: Math.min(1, Math.max(0.35, b.size[1] / (16 * FLOOR_HEIGHT))),
      }),
    ),
    ...(input.seaLevel === undefined
      ? {}
      : { water: { field: input.field, seaLevel: input.seaLevel } }),
  });

  const infillStream = streamSeed(seed, "repeat");

  // --- the street wall ------------------------------------------------------
  // Between the landmarks and the per-lot infill, and both halves of that are
  // load-bearing. After the landmarks, because a terrace may not eat the lot
  // the cathedral wanted. Before the infill, because every lot a terrace claims
  // is a lot the per-lot path must not also build on — and a terrace is the
  // *default* for a dense face, not a special case of it.
  const terraces = terraceRuns(
    lots,
    claimed,
    p,
    nodePath,
    input.worldSeed,
    seed,
    preferAt,
    courtyardPassages,
    storeyCeiling,
  );
  let terraceBays = 0;
  let terraceLots = 0;
  for (const terrace of terraces) {
    for (const lot of terrace.lots) claimed.add(lot.id);
    terraceLots += terrace.lots.length;
    terraceBays += terrace.bays;
    built.push(terrace.built);
  }

  // --- the ruin roll (RUINS-PLAN-v0 WP-3, §4.2) ----------------------------
  // `decay.ruinShare` is total and reads `today = 0`, so a district with no
  // `decline` — and every district with a `decline` below `RUIN_ONSET` — rolls
  // nothing and compiles byte-identically to before this row existed.
  const share = fanOut<number>(LAYOUT_ROWS.ruinShare, intent, { nodePath, today: 0 });
  const declineOf = intent.intent.decline ?? 0;
  /** Lots rolled / ruined, and the band histogram, for `LOAM-I512`. */
  let rolled = 0;
  let ruined = 0;
  const bandCounts = new Map<DecayBand, number>();
  let infilled = 0;
  /**
   * Build one lot, or say why not.
   *
   * Lifted verbatim out of the loop below so the empty-block law's re-draw
   * (§ the empty-block law) runs *the same* draw on a lot the coverage roll
   * left open rather than a second implementation of it. `relaxed` skips the
   * coverage roll and nothing else: the size floor, the prominence field, the
   * decay roll and the seat are the ordinary path, character for character.
   */
  const tryInfill = (lot: Lot, relaxed: boolean): boolean => {
    if (claimed.has(lot.id)) return false;
    // The coverage draw comes first and is *not* a drop: a lot the density left
    // open is open ground, which is a decision, not a failure to build.
    // …unless the lot is in a courtyard perimeter, where coverage is 1 (§4.3).
    if (
      !relaxed &&
      !lot.courtyard &&
      positionFloat(infillStream, lot.rect.x0, 0, lot.rect.z0) >= (LOT_COVERAGE[p.density] as number)
    ) {
      return false;
    }
    const filled = infillLot(lot, p, infillStream, prominence, cell?.minBuilding ?? MIN_INFILL_SIDE);
    if (filled === null) {
      if (!relaxed) dropped++;
      return false;
    }
    infilled++;
    rolled++;
    // The per-lot roll. Positional, clustered, and keyed exactly the way
    // `infillLot`'s own draws are — on the lot's min corner, never on a
    // counter — so adding a landmark somewhere else in the district leaves the
    // same lots ruined and the same lots standing.
    const decay = ruinDecayOf(
      lot,
      blocks[lot.block] as Block | undefined,
      infillStream,
      share,
      declineOf,
    );
    if (decay !== null) {
      ruined++;
      bandCounts.set(decay.band, (bandCounts.get(decay.band) ?? 0) + 1);
    }
    built.push({
      nodePath: `${nodePath}.${filled.id}`,
      id: filled.id,
      rect: filled.rect,
      face: lot.face,
      size: filled.size,
      ports: INFILL_PORTS,
      params: decay === null ? filled.params : { ...filled.params, decay: decay.intensity },
      tags: filled.tags,
      seed: nodeSeed(input.worldSeed, `${nodePath}.${filled.id}`, ""),
      frontPort: undefined,
      ...frontageOf(lot.rect, lot.face, [lot]),
    });
    // The lot is spoken for. Nothing downstream read `claimed` after this point
    // before the law existed; the re-draw does, and a lot built twice is two
    // buildings standing through each other.
    claimed.add(lot.id);
    return true;
  };
  for (const lot of lots) tryInfill(lot, false);

  // --- the empty-block law --------------------------------------------------
  // **Inside a walled quarter, an elected block is never bare.** Troy was
  // walked twice and called empty, and the measurement said why: coverage rose
  // 34 % → 58 % and the rest of the quarter was still *whole blocks* that
  // elected nothing — scrubby grass squares framed by streets. `LOAM-W527`
  // measures the ratio; this is the repair, and it has two tiers in this order:
  //
  // 1. **Re-draw the block.** A block with no building is not a block the
  //    density decided to leave open — the density decides per *lot*, and a
  //    whole block of open lots is the coverage roll landing the same way six
  //    times over. So every unclaimed lot on a bare block is offered the same
  //    infill draw with the coverage roll skipped. This is the answer whenever
  //    the block had a lot at all, and it moves `LOAM-W527`, because it builds.
  // 2. **Dress what is left.** A block that still built nothing has no lot the
  //    grammar can stand a building on — too thin, too cut about, or no street
  //    behind any face. That block becomes a deliberate *something* instead: an
  //    orchard, a market ground, a garden or a paddock, drawn from the
  //    vocabulary the life pass already carries and built by it (§2a there).
  //
  // Outside a walled quarter neither tier runs, and that is the design: a loose
  // village wants meadows between its houses, and the wall is what makes
  // emptiness a defect — the same predicate `LOAM-W527` measures on.
  const dressedBlocks: DressedBlock[] = [];
  /** Blocks that ended the infill pass with no building on them. */
  let bareBlocks = 0;
  /** …of those, the ones the relaxed re-draw built on. */
  let redrawnBlocks = 0;
  if (walledQuarter(p, intent) && planned === undefined && blocks.length > 0) {
    const menu = dressingsFor(intent.eraDeclared ? intent.eraClass : DEFAULT_ERA_CLASS);
    const dressStream = streamSeed(seed, "dress");
    const occupied = new Uint8Array(blocks.length);
    for (const item of built) {
      const i = blockOf(blocks, item.rect);
      if (i >= 0) occupied[i] = 1;
    }
    // The free mask, built once over the whole quarter: 1 where a column is
    // inside some block and no building (plus its apron) stands on it. This is
    // the same `member` mask `blocksOf` hands `largestFreeRect`, one pass later
    // in the story — which is why the remainder tier needs no geometry of its
    // own.
    const free = new Uint8Array(grid.cells);
    for (const block of blocks) {
      for (let z = block.rect.z0; z <= block.rect.z1; z++) {
        for (let x = block.rect.x0; x <= block.rect.x1; x++) {
          const k = grid.index(x, z);
          if (k >= 0 && blocked[k] !== 1) free[k] = 1;
        }
      }
    }
    // Masked incrementally: the re-draw below adds buildings while this loop is
    // running, and re-walking the whole list per block would be quadratic in a
    // quarter's building count for no gain.
    let masked = 0;
    const maskBuilt = (): void => {
      for (; masked < built.length; masked++) {
        const item = built[masked] as BuiltLot;
        for (let z = item.rect.z0 - BUILDING_APRON; z <= item.rect.z1 + BUILDING_APRON; z++) {
          for (let x = item.rect.x0 - BUILDING_APRON; x <= item.rect.x1 + BUILDING_APRON; x++) {
            const k = grid.index(x, z);
            if (k >= 0) free[k] = 0;
          }
        }
      }
    };
    maskBuilt();
    for (const [i, block] of blocks.entries()) {
      // The reserved square is *meant* to be empty ground — that is what a
      // plaza is, and the plaza pass furnishes it — and a courtyard block's
      // middle is already somebody's job (§4.5).
      if (i === plazaBlock || courtyardPlans.has(i)) continue;
      if (occupied[i] !== 1) {
        bareBlocks++;
        // Tier 1, and only for a block with *no* building: a block that built
        // its rim and left a core is not a block the coverage roll emptied.
        let gained = false;
        for (const lot of lots) {
          if (lot.block !== i) continue;
          if (tryInfill(lot, true)) gained = true;
        }
        if (gained) {
          redrawnBlocks++;
          occupied[i] = 1;
          // The mask has to hear about what the re-draw built, or the ground it
          // just took is still free ground to the remainder tier below.
          maskBuilt();
        }
      }
      // Tier 2, over the block's **remainder**: the largest rectangle of it
      // that no building stands on. On a bare block that is the block; on a
      // block that built its street rim it is the core, which is the other half
      // of what Kai walked — a town whose blocks are built round the edge and
      // scrubby in the middle reads exactly as empty as one that built nothing.
      const remainder = largestFreeRect(grid, free, block.rect);
      if (remainder === null) continue;
      const w = remainder.x1 - remainder.x0 + 1;
      const d = remainder.z1 - remainder.z0 + 1;
      // Two floors, because the two cases are two different claims. A block
      // that built **nothing** is a hole in the town and the law is absolute:
      // anything the fabric was willing to call a block (`MIN_INFILL_SIDE` on
      // its short axis) is dressed, however small. A block that built its rim
      // and left a core is already a town block, and its remainder has to be
      // big enough to be a *place* before the dressing claims it — under that,
      // the back of a house is allowed to be the back of a house.
      const bare = occupied[i] !== 1;
      const minSide = bare ? MIN_INFILL_SIDE : DRESSING_MIN_SIDE;
      const minArea = bare ? MIN_INFILL_SIDE * MIN_INFILL_SIDE : DRESSING_MIN_AREA;
      if (Math.min(w, d) < minSide || w * d < minArea) continue;
      // Positional, on the remainder's own min corner — never on `i` — so one
      // more building somewhere else in the quarter cannot turn an orchard into
      // a market.
      const draw = positionFloat(dressStream, remainder.x0, 0, remainder.z0);
      const kind = menu[Math.min(menu.length - 1, Math.floor(draw * menu.length))] as BlockDressing;
      dressedBlocks.push({ block: i, rect: remainder, kind });
    }
  }

  // --- the ruins record (RUINS-PLAN §9, `LOAM-I512`) ------------------------
  // Never optional, and never suppressed by a zero: "the district ruined 0 of
  // 84 lots because `decline` never reached the row" is exactly the sentence
  // DESIGN's second failure mode hides. It is only silent when the district has
  // no opinion at all — no `decline`, no row, nothing to say.
  if (share > 0 || declineOf > 0) {
    const histogram = ["light", "heavy", "total"]
      .map((band) => `${band} ${bandCounts.get(band as DecayBand) ?? 0}`)
      .join(", ");
    diagnostics.push(
      note(
        "DISTRICT_RUINS",
        nodePath,
        `decline ${declineOf.toFixed(2)} gives a ruin share of ${share.toFixed(2)}: ` +
          `${ruined} of ${rolled} infill lots roll into ruined shells (${histogram})`,
        share === 0
          ? `decline is below the ruin onset of ${RUIN_ONSET} — below it decline is wear, not ruin; raise it to ruin buildings`
          : "raise or lower intent.decline on this district to move the share; landmarks you declared are exempt unless they carry params.decay",
      ),
    );
  }

  // --- the courtyard records ------------------------------------------------
  // What the structure pass needs and nothing more: the core to furnish, the
  // gaps to roof, and the dominant archetype the treatment is chosen from
  // (§4.5). Built here, after the ranges exist, because the archetype is a
  // property of what was actually built rather than of what the mix listed.
  const courtyardBlocks: CourtyardBlock[] = [];
  for (const [i, plan] of [...courtyardPlans].sort((a, b) => a[0] - b[0])) {
    const rect = (blocks[i] as Block).rect;
    const archetype = dominantArchetype(built, rect);
    courtyardBlocks.push({
      block: i,
      rect,
      core: plan.core,
      passages: courtyardPassages.filter((pg) => pg.block === i),
      ...(archetype === undefined ? {} : { archetype }),
    });
  }
  // Never accepted and quietly not met (§5.3): the author asked for courtyards
  // and got none, so say which measurement refused and what to change.
  if (courtyardShare > 0 && courtyardBlocks.length === 0 && blocks.length > 0) {
    diagnostics.push(courtyardNone(nodePath, blocks.length, courtyardRejects, density));
  }

  // --- turn every claimed lot into a placement ------------------------------
  const nodes: LayoutNodeInput[] = [];
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  const params = new Map<string, Readonly<Record<string, unknown>>>();

  // The form's benches, if it cut any. Each becomes one flat pad per run — the
  // only way to level a curved platform with an API that takes rectangles — and
  // every building whose lot falls on a bench is founded at that bench's level,
  // so no building is ever seated across a step. A form that cuts none (every
  // form but `terraced`) leaves both of these empty and nothing below changes.
  for (const bench of plan.benches ?? []) {
    for (const run of bench.runs) {
      padEdits.push({
        nodePath,
        footprint: run,
        targetY: bench.level,
        apron: 0,
        // v1 §1.5: a bench run *is* the quarter's decided plane.
        claimClass: "quarter.plane",
      });
    }
  }
  // The **derived** platforms of a `"stepped"` quarter (§3.3). Levelled from
  // `levels.runs` rather than from the bench list, because those runs are
  // re-derived from the *resolved* field: a pad list built from the
  // declarations would level an overlapped column twice, at two heights, in
  // list order. `apron: 0` for the reason the bench pads have it — an apron is
  // a smoothstep ramp, and a ramp across a platform edge is the wall not being
  // there. Empty unless this quarter derived platforms, so nothing that did not
  // opt in gains a pad.
  if (derived.length > 0 && levels !== null) {
    for (const [platform, runs] of levels.runs.entries()) {
      // `SUBMERGED_BENCH_UNGRADED`: the water keeps its bed; see the election.
      if (submergedPlatforms[platform] === true) continue;
      const targetY = levels.levelY[platform] as number;
      for (const run of runs) {
        padEdits.push({
          nodePath,
          footprint: run,
          targetY,
          apron: 0,
          // …and so is a derived platform: `PlatformDatum`'s elected level.
          claimClass: "quarter.plane",
        });
      }
    }
  }

  // Columns a seam runs through. A building whose lot touches one gets
  // `apron: 0` below: `applyLevelPad` blends an apron with a smoothstep lerp,
  // which on a platform edge smears two columns of the seam into a ramp and
  // undoes the wall that is supposed to stand there (§3.6, §9.2). Empty for
  // every quarter that declared no platforms, so the ordinary path is a `Set`
  // of size zero and one `has` per building.
  const seamColumns = new Set<number>();
  for (const seam of seams) {
    for (const point of seam.cells) {
      const k = grid.index(point.x, point.z);
      if (k >= 0) seamColumns.add(k);
    }
  }
  // The rect **plus its apron**, not the rect. A seam column is in `blocked`
  // (§3.3 step 4), so no lot contains one and no building rect can — testing
  // the rect alone made this guard true nowhere the platforms were derived,
  // which is exactly the half of §9.2 that matters: the apron is what reaches
  // the seam, so the apron is what has to be asked about.
  const touchesSeam = (rect: Rect): boolean => {
    if (seamColumns.size === 0) return false;
    for (let z = rect.z0 - BUILDING_APRON; z <= rect.z1 + BUILDING_APRON; z++) {
      for (let x = rect.x0 - BUILDING_APRON; x <= rect.x1 + BUILDING_APRON; x++) {
        const k = grid.index(x, z);
        if (k >= 0 && seamColumns.has(k)) return true;
      }
    }
    return false;
  };

  for (const item of built) {
    const yaw = yawFacing(frontFace(item.ports, item.frontPort), item.face);
    const [rw, rh, rd] = rotatedSize(item.size, yaw);
    const rect = seat(item.rect, item.face, rw, rd);
    // One expression, three fallbacks, and the last two are exactly today's
    // (§3.6). `foundationY` is *the level of the platform this lot sits on* —
    // which for a `terraced` quarter is the number `benchLevels` returned,
    // column for column, because `groundLevelsOf` fills from the same
    // `FormBench.runs` in the same order. The bench branch is subsumed, not
    // duplicated.
    const platform = levels === null ? NO_PLATFORM : levels.at(rect.x0, rect.z0);
    // The tie (F1/F4/F5/F6), ahead of the median and behind the platforms: a
    // quarter that declared its own platforms has already answered the question
    // this asks, and two answers to one question is the defect class. So the
    // tied branch replaces only the **last** fallback — the median of the
    // building's own footprint, which is the lip generator of §0.1.
    //
    // `datum` is `null` while {@link FRONTAGE_TIE} is off, so `tied` is
    // `undefined`, the `??` chain below is character-for-character today's
    // expression, and this whole branch is dead code.
    const tied =
      datum === null || item.street === ""
        ? undefined
        : frontageSeat({
            // `item.rect` is the **parcel**, which is what touches the sidewalk;
            // `rect` above is the seated building inside it. `item.frontAnchor`
            // is `frontAnchorOf(item.rect, item.face)` and is what this resolves
            // to for a non-corner lot.
            rect: item.rect,
            face: item.face,
            corner: item.corner,
            datum,
            reach: tieReach,
          });
    if (datum !== null && levels === null && cell?.foundationY === undefined) {
      if (tied === undefined) untiedLots++;
      else tiedLots++;
    }
    // The platform branch, with T7's uphill-rim exception inside it
    // ({@link seatOnPlane}). `undefined` where this lot is on no platform, so
    // the `??` chain below is character-for-character the one that shipped.
    const planeY = levels !== null && platform !== NO_PLATFORM ? (levels.levelY[platform] as number) : undefined;
    const foundationY =
      seatOnPlane(planeY, tied) ?? cell?.foundationY ?? tied ?? medianGround(input.field, rect);
    const made: Placement = {
      nodePath: item.nodePath,
      id: item.id,
      translation: [rect.x0, foundationY, rect.z0],
      yaw,
      mirror: false,
      size: [rw, rh, rd],
      footprint: rect,
      anchor: { x: rect.x0 + ((rw - 1) >> 1), z: rect.z0 + ((rd - 1) >> 1) },
      foundationY,
    };
    const solverNode: LayoutNodeInput = {
      id: item.id,
      nodePath: item.nodePath,
      kind: "generator",
      generator: "building.grammar@0",
      size: item.size,
      flexible: false,
      padding: 0,
      rotations: [yaw],
      constraints: [],
      ports: item.ports,
      optional: false,
      tags: item.tags,
      seed: item.seed,
    };
    nodes.push(solverNode);
    placements.push(made);
    ports.push(...resolvePorts(made, item.size, item.ports));
    // A pad on already-levelled ground is a no-op; it is emitted anyway so a
    // district whose apron did not quite reach still meets its own ground. The
    // apron is dropped to 0 on a lot that touches a platform seam — see
    // `touchesSeam`.
    padEdits.push({
      nodePath: item.nodePath,
      footprint: rect,
      targetY: foundationY,
      apron: touchesSeam(rect) ? 0 : BUILDING_APRON,
      // v1 §1.5: the footprint half of the lot pad, at `SeatDatum`'s level.
      claimClass: "building.footprint",
    });
    params.set(item.nodePath, item.params);
  }

  // --- F6's report (`LOAM-T238`) --------------------------------------------
  // A note, never a warning: an untied lot is a *legal* outcome — a
  // district-boundary lot, a plaza-side lot, a lot the fabric drew off the
  // network — and F6 says it keeps exactly the seat it has today. What is worth
  // reporting is a district where the fabric drew streets and the datum could
  // grade none of them in reach of any lot, because that is the fabric and the
  // grader disagreeing about where the streets are. Dead while the flag is off.
  if (datum !== null && untiedLots > 0) {
    diagnostics.push(
      note(
        "FRONTAGE_UNTIED",
        nodePath,
        `${untiedLots} of ${untiedLots + tiedLots} seated lot(s) in "${nodePath}" found no graded carriageway within ${tieReach} block(s) of their front edge, and were seated on the median of their own footprint`,
        `Nothing to change in the document if these are boundary or plaza-side lots — that is the designed outcome. A district where *every* lot is untied means its streets were drawn but not graded: report it.`,
      ),
    );
  }

  // --- the walled coverage floor (`LOAM-W527`) ------------------------------
  // The guard that should have caught the deep-block defect before two walks.
  // Measured at the end of the pass, from what was actually built against the
  // land the blocks actually held — the one ratio that can tell "a walled town"
  // from "a wall round a field", and the one nothing else in the report says.
  if (walledQuarter(p, intent) && planned === undefined && blocks.length > 0) {
    let blockLand = 0;
    for (const block of blocks) blockLand += block.columns;
    let builtColumns = 0;
    for (const item of built) {
      builtColumns += (item.rect.x1 - item.rect.x0 + 1) * (item.rect.z1 - item.rect.z0 + 1);
    }
    const coverage = blockLand === 0 ? 0 : builtColumns / blockLand;
    if (coverage < WALLED_COVERAGE_FLOOR) {
      diagnostics.push(
        warning(
          "WALLED_QUARTER_SPARSE",
          nodePath,
          `"${nodePath}" is walled and built ${builtColumns} of its ${blockLand} block column(s) — ${Math.round(coverage * 100)} %, under the ${Math.round(WALLED_COVERAGE_FLOOR * 100)} % a walled quarter needs before the circuit reads as a town wall rather than as a fence round open ground`,
          `Raise "density", lower "params.blockSize" so the fabric draws more streets and shallower blocks, or shrink "envelope.size" so the wall encloses the fabric that was actually built.`,
        ),
      );
    }
  }

  let carriagewayColumns = 0;
  let sidewalkColumns = 0;
  for (let k = 0; k < grid.cells; k++) {
    if (carriageway[k] === 1) carriagewayColumns++;
    if (sidewalk[k] === 1) sidewalkColumns++;
  }

  return {
    nodes,
    placements,
    ports,
    padEdits,
    params,
    product: {
      nodePath,
      bounds,
      streets: graph,
      // F2's artifact, handed forward to its consumer. `null` — the flag-off
      // case — omits the key entirely, so the product is byte-for-byte the one
      // a quarter carried before wave 8D.
      ...(datum === null ? {} : { datum }),
      // §4.1's artifact, handed forward to its three consumers. Omitted whole
      // when nothing was solved — which is every quarter while the flag is off
      // and every flat town for ever — so the product a quarter carried before
      // this work packet is the object it carries now.
      ...(descent.descents.length === 0 ? {} : { descent }),
      form: plan.record,
      ...(plan.channels === undefined || plan.channels.length === 0
        ? {}
        : { channels: plan.channels }),
      carriageway,
      sidewalk,
      ...(courtyardBlocks.length === 0 ? {} : { courtyards: courtyardBlocks }),
      ...(dressedBlocks.length === 0 ? {} : { dressed: dressedBlocks }),
      // The platforms and their seams, for the retaining pass — the one
      // consumer that runs on the column plan rather than on the layout, and so
      // the one that cannot re-derive them. Both are omitted unless this
      // quarter is `"stepped"` and actually stepped, so the product a quarter
      // written before this phase carries is the object it carried before.
      ...(levels === null || groundPolicy !== "stepped" ? {} : { levels, seams }),
      ...(planned === undefined ? {} : { naturalCuts: true }),
      // §5: the planner's own declaration, and the masonry ration measured from
      // it. Both are absent for every quarter no planner drew, which is the
      // whole of the byte-identity argument for this work package.
      ...(planned === undefined || plan.edges === undefined ? {} : { plannedEdges: plan.edges }),
      ...(planned === undefined
        ? {}
        : {
            wallBudget:
              WALL_COLUMNS_PER_DWELLING * Math.max(1, built.length - terraces.length + terraceBays),
          }),
      stats: {
        blocks: planned === undefined ? blocks.length : planned.length,
        lots: lots.length,
        landmarks: landmarks.length - unplaced,
        landmarksUnplaced: unplaced,
        infill: infilled,
        terraces: terraces.length,
        terraceBays,
        terraceLots,
        // A terrace's bays are homes; the terrace is one `built` item. See
        // `DistrictStats.dwellings`.
        dwellings: built.length - terraces.length + terraceBays,
        lotsDropped: dropped,
        plazaLots,
        carriagewayColumns,
        sidewalkColumns,
        ...(courtyardBlocks.length === 0 ? {} : { courtyards: courtyardBlocks.length }),
        ...(bareBlocks === 0 && dressedBlocks.length === 0
          ? {}
          : { bareBlocks, blocksRedrawn: redrawnBlocks, blocksDressed: dressedBlocks.length }),
        // §6.1, measured from the plan the ladder settled on.
        ...(replanned.composition === null
          ? {}
          : {
              naturalFraction: replanned.composition.naturalFraction,
              streetFraction: replanned.composition.streetFraction,
              platformFraction: replanned.composition.platformFraction,
              spineFraction: replanned.composition.spineFraction,
              spineColumns: replanned.composition.spineColumns,
              replanRounds: replanned.rounds,
              principalStreets: graph.segments.filter((sg) => sg.kind === "street").length,
            }),
        // §4.2's 45 %-recovery claim, measured rather than assumed: the columns
        // the lots grew against the columns their seated rectangles took.
        ...(frontage === null
          ? {}
          : { lotColumns: frontage.lotColumns, seatedColumns: frontage.seatedColumns }),
        ...(courtyardShare <= 0
          ? {}
          : { courtyardRejects: Object.fromEntries([...courtyardRejects].sort()) }),
        // 12C. Absent — and therefore invisible to every report golden — while
        // `GROUND_PLANE_TIE` is off, because `tieDatum` is `null` then and
        // nothing was measured.
        ...(planeTieStats === null ? {} : { planeTie: planeTieStats }),
        // The +1 road lip. Absent while `STREET_PLANE_HARMONIZE` is off, and
        // absent on a quarter where no segment's flanks asked, so no report
        // golden moves before a world does.
        ...(harmonizeReport.value === null ? {} : { streetHarmonize: harmonizeReport.value }),
        // §2.7. Published whenever recognition saw *anything* — a face with no
        // demand is the population §7.1 calls the suspect one, and a report
        // that spoke only about the descents it built could not name one.
        // Absent, and so invisible to every report golden, while the flag is
        // off: `noDescents` seeds nothing and recognizes nothing.
        ...(descent.recognition.seeds === 0 && descent.descents.length === 0
          ? {}
          : {
              descents: {
                seeds: descent.recognition.seeds,
                faces: descent.recognition.faces.length,
                demands: descent.recognition.demands.length,
                groups: descent.recognition.groups.length,
                built: descent.descents.filter((d) => d.runs.length > 0).length,
                corridorColumns: descent.corridor.reduce((n, v) => n + v, 0),
                states: descent.states,
                records: descent.records,
                refusals: descent.refusals,
              },
            }),
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* §6 — composition metrics and the replan ladder                              */
/* -------------------------------------------------------------------------- */

/**
 * Rungs of the ladder, and the bound `docs/SITE-PLAN-v0.md` §3.8 states.
 *
 * Three, because the ceiling is four principal streets and the floor is two:
 * the ladder is `4 → 3 → 2` and there is nowhere below two to go. Derived from
 * the two rather than written as 3, so a ceiling that moves takes the ladder
 * with it — §12.5 is still open about whether a large quarter wants more.
 */
export const MAX_REPLAN_ROUNDS = MAX_PRINCIPAL_STREETS - MIN_PRINCIPAL_STREETS + 1;

/**
 * The two gates the planner can actually discharge, with §6.1's thresholds.
 *
 * §6.2 names four hard gates — `naturalFraction`, `platformPerBuilding`,
 * `wallPerBuilding` and `offPlatform` — and it is right about all four as
 * *acceptance* checks and wrong about two of them as *replan* gates, which is
 * the amendment WP-1 records in that document:
 *
 * - `offPlatform` is not a gate here because the planner makes it
 *   unrepresentable (§3.4 rule 2, §5.5); a non-zero count is a compiler bug and
 *   is raised as one, not replanned around.
 * - `platformPerBuilding` and `wallPerBuilding` are counted from buildings and
 *   walls, and neither exists when the plan is drawn. Replanning on them means
 *   re-entering the whole district pass — landmarks, terraces, coverage draws —
 *   three times per quarter, and §6.2's own sequencing says their thresholds
 *   are calibrated at WP-5 from an accepted world rather than guessed now.
 * - `streetFraction` §6.2 lists as a report metric because "the streetscape's
 *   dilation" is not the planner's. The dilation is a fixed ring count; what
 *   moves this number by twenty points is **how many streets the planner laid**,
 *   which is precisely what the ladder changes. It is the ladder's other gate,
 *   and §8.3 check 6 already treats it as a bar.
 */
export const COMPOSITION_GATES = Object.freeze({
  /** §6.1: uncut, unpaved ground inside the quarter. Most of a hillside is hillside. */
  naturalFraction: 0.4,
  /**
   * §6.1, §8.3 check 6: carriageway plus sidewalk, **net of the carriage
   * spine** (§3.6a; amendment 2026-08-07).
   *
   * The bar is unchanged at 0.25. What changed is what it measures: the spine's
   * columns are infrastructure the town needs — its length is
   * `SPINE_GRADE_RUN × drop`, a number the ladder cannot move, because dropping
   * a contour street does not shorten the road up the hill — so counting them
   * as street sprawl charged the ladder for a road it could not shorten.
   */
  streetFraction: 0.25,
});

/**
 * Columns of retaining wall a site-planned quarter may spend per dwelling —
 * §6.1's `wallPerBuilding` target, turned from an acceptance check into the
 * ration §5.2 rule 7 reads.
 *
 * Forty, verbatim from §6.1's table, against the walked hill town's measured
 * **224**. Counted in **dwellings** rather than in buildings for WP-1's reason:
 * a terrace is one `BuiltBuilding` with `bays` front doors and a player walking
 * the street counts the doors, so a row of six houses is entitled to six houses'
 * worth of masonry rather than one's.
 *
 * A budget rather than a cap: rule 7 hands the *next* edge a bank once the
 * quarter has spent, so what runs out is the marginal wall on the least-pressed
 * face — the edges the town is actually built against are the ones seen first.
 */
export const WALL_COLUMNS_PER_DWELLING = 40;

/** §6.1's metrics, as far as they can be measured from a plan alone. */
export interface Composition {
  readonly quarterColumns: number;
  readonly streetColumns: number;
  readonly naturalColumns: number;
  readonly platformColumns: number;
  readonly naturalFraction: number;
  readonly streetFraction: number;
  readonly platformFraction: number;
  /**
   * Columns of {@link Composition.streetColumns} the carriage spine accounts for
   * (`docs/SITE-PLAN-v0.md` §3.6a).
   *
   * **Subtracted from {@link Composition.streetFraction}, which is why it
   * exists.** The open question that section ended on — raise the gate by one
   * spine's worth, or measure net of it — was settled net of it (Kai,
   * 2026-08-07), the bar staying 0.25. So `streetColumns` is every paved column
   * and `streetFraction` is `(streetColumns - spineColumns) / quarterColumns`:
   * the two are deliberately *not* a ratio of each other.
   */
  readonly spineColumns: number;
  readonly spineFraction: number;
}

/**
 * Measure a drawn plan's composition (§6.1).
 *
 * The street raster and the sidewalk dilation are the **same two constructions**
 * `layDistrict` performs below, in the same order — which is why this can run
 * before the district is built and still describe the district that will be
 * built.
 */
export function compositionOf(plan: FormPlan, bounds: Rect, sidewalkWidth: number): Composition {
  const grid = new Grid(bounds);
  const carriageway = new Uint8Array(grid.cells);
  for (const cell of carriagewayCells(plan.graph, bounds)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) carriageway[k] = 1;
  }
  const verge = dilate(grid, carriageway, sidewalkWidth);
  // The spine's own share, by the same two constructions over its own segments.
  const spineWay = new Uint8Array(grid.cells);
  const spineOnly = { ...plan.graph, segments: plan.graph.segments.filter((s) => s.role === "cart") };
  for (const cell of carriagewayCells(spineOnly, bounds)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) spineWay[k] = 1;
  }
  const spineVerge = dilate(grid, spineWay, sidewalkWidth);
  const levels = groundLevelsOf(bounds, plan.benches ?? []);
  let street = 0;
  let natural = 0;
  let platform = 0;
  let spine = 0;
  for (let k = 0; k < grid.cells; k++) {
    const paved = carriageway[k] === 1 || verge[k] === 1;
    if (paved && (spineWay[k] === 1 || spineVerge[k] === 1)) spine++;
    const onPlatform =
      levels !== null && levels.at(grid.x(k), grid.z(k)) !== NO_PLATFORM;
    if (paved) street++;
    if (onPlatform) platform++;
    if (!paved && !onPlatform) natural++;
  }
  const n = grid.cells;
  return {
    quarterColumns: n,
    streetColumns: street,
    naturalColumns: natural,
    platformColumns: platform,
    naturalFraction: natural / n,
    // Net of the spine: see COMPOSITION_GATES.streetFraction. `Math.max` is
    // belt and braces — every spine column is a paved column by construction.
    streetFraction: Math.max(0, street - spine) / n,
    platformFraction: platform / n,
    spineColumns: spine,
    spineFraction: spine / n,
  };
}

/** How many of {@link COMPOSITION_GATES} this composition clears. */
function gatesPassed(c: Composition): number {
  return (
    (c.naturalFraction >= COMPOSITION_GATES.naturalFraction ? 1 : 0) +
    (c.streetFraction <= COMPOSITION_GATES.streetFraction ? 1 : 0)
  );
}

/** One rung: what was asked for, and what came back. */
interface Rung {
  readonly attempt: PlanAttempt;
  readonly drawn: FabricResult;
  readonly composition: Composition | null;
}

/** A plan, the rounds it took, and what to say about the ones that failed. */
export interface PlannedQuarter {
  readonly drawn: FabricResult;
  readonly rounds: number;
  readonly composition: Composition | null;
  /** `[message, fix]` for a `SITE_COMPOSITION` note, or null when none is due. */
  readonly note: readonly [string, string] | null;
}

/**
 * Draw a quarter, and **replan it smaller if its composition fails a gate**
 * (`docs/SITE-PLAN-v0.md` §6.3).
 *
 * > A district that fails a hard gate replans smaller. It never ships the
 * > failing composition, and it never grows to fix one.
 *
 * The ladder is `dropStreets = 0, 1, 2` — a ceiling of four principal streets,
 * then three, then two — and it stops at the **first** rung that clears both
 * gates. The rung that is dropped each time is by construction the street
 * commanding the least frontage, because selection is greedy on that score.
 *
 * Two things it deliberately does **not** do, both amendments this package
 * records in the document:
 *
 * - It does not ladder any form but `hillside`. The gate is `plan.strips`, so a
 *   `grid` or a `grown` quarter — and a `hillside` that fell back to one — is
 *   drawn exactly once, with exactly today's arguments.
 * - **Exhausting the ladder does not fall back to `grown`.** §6.3 step 4 says it
 *   does; §6.2 says in the same breath that these thresholds are calibrated at
 *   WP-5 from a world Kai has accepted, and §11.5 names "over-tight gates turn
 *   every hill town into `grown`" as a risk of exactly this ordering. Until the
 *   thresholds are measured rather than quoted, a ladder that abandons the plan
 *   would abandon it on a number nobody has confirmed — including on the
 *   accepted WP-0 prototype, which misses `streetFraction` by five thousandths.
 *   So the best rung ships and the miss is reported in the author's terms.
 */
export function planQuarter(request: FabricRequest, sidewalkWidth: number): PlannedQuarter {
  const rungs: Rung[] = [];
  for (let round = 0; round < MAX_REPLAN_ROUNDS; round++) {
    const attempt: PlanAttempt = { round, dropStreets: round, narrowBy: 0 };
    const drawn = drawFabric({ ...request, attempt });
    if (!drawn.ok) return { drawn, rounds: round + 1, composition: null, note: null };
    const plan = drawn.outcome.plan;
    // Not a planned quarter: one draw, today's arguments, nothing measured.
    if (plan.strips === undefined) {
      return { drawn, rounds: round + 1, composition: null, note: null };
    }
    const composition = compositionOf(plan, request.bounds, sidewalkWidth);
    rungs.push({ attempt, drawn, composition });
    if (gatesPassed(composition) === 2) {
      return { drawn, rounds: rungs.length, composition, note: null };
    }
  }
  // Nobody passed. Take the best composition by a total order — gates cleared,
  // then the most hillside left, then the least road — and say what it missed.
  // Ties break on the earlier round, which is the larger town.
  const best = rungs.reduce((a, b) => (better(b.composition!, a.composition!) ? b : a));
  const c = best.composition as Composition;
  const missed: string[] = [];
  if (c.naturalFraction < COMPOSITION_GATES.naturalFraction) {
    missed.push(
      `${(c.naturalFraction * 100).toFixed(1)}% of it is uncut hillside where the plan asks for ${COMPOSITION_GATES.naturalFraction * 100}%`,
    );
  }
  if (c.streetFraction > COMPOSITION_GATES.streetFraction) {
    missed.push(
      `${(c.streetFraction * 100).toFixed(1)}% of it is road other than the carriage spine, where the plan asks for at most ${COMPOSITION_GATES.streetFraction * 100}%`,
    );
  }
  return {
    drawn: best.drawn,
    rounds: rungs.length,
    composition: c,
    note: [
      `"${request.nodePath}" was planned ${rungs.length} time(s), down to ${MAX_PRINCIPAL_STREETS - best.attempt.dropStreets} principal street(s), and the best of them is still more engineering than town: ${missed.join(", and ")}`,
      `Move the quarter onto a broader, gentler slope with a "zone" constraint, or give it a smaller footprint so it sits across fewer contours.`,
    ],
  };
}

/** §6.3's total order over compositions: gates, then hillside, then road. */
function better(a: Composition, b: Composition): boolean {
  const ga = gatesPassed(a);
  const gb = gatesPassed(b);
  if (ga !== gb) return ga > gb;
  if (a.naturalFraction !== b.naturalFraction) return a.naturalFraction > b.naturalFraction;
  return a.streetFraction < b.streetFraction;
}

/* -------------------------------------------------------------------------- */
/* the grid                                                                    */
/* -------------------------------------------------------------------------- */

/** Row-major addressing over a district footprint. */
export class Grid {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
  readonly cells: number;

  constructor(bounds: Rect) {
    this.x0 = bounds.x0;
    this.z0 = bounds.z0;
    this.width = bounds.x1 - bounds.x0 + 1;
    this.depth = bounds.z1 - bounds.z0 + 1;
    this.cells = this.width * this.depth;
  }

  /** Cell index, or `-1` outside the footprint. */
  index(x: number, z: number): number {
    const i = x - this.x0;
    const j = z - this.z0;
    if (i < 0 || j < 0 || i >= this.width || j >= this.depth) return -1;
    return j * this.width + i;
  }

  x(index: number): number {
    return this.x0 + (index % this.width);
  }

  z(index: number): number {
    return this.z0 + Math.floor(index / this.width);
  }
}

/**
 * The `rings`-deep band around a mask, excluding the mask itself.
 *
 * **Delegated to `forms/contour-lines.ts`'s `dilateMask`**, unchanged line for
 * line, so that the site planner's street band and this sidewalk are one
 * computation rather than two agreeing implementations
 * (`docs/SITE-PLAN-v0.md` finding 5). A ring walk reaches a full column further
 * on a diagonal than width arithmetic does, and a planner that believed the
 * arithmetic left the outermost verge column off its own platform.
 */
function dilate(grid: Grid, mask: Uint8Array, rings: number): Uint8Array {
  return dilateMask(mask, grid.width, grid.depth, rings);
}

/* -------------------------------------------------------------------------- */
/* blocks                                                                      */
/* -------------------------------------------------------------------------- */

/** One face of the street graph: the ground between the streets. */
export interface Block {
  readonly rect: Rect;
  readonly columns: number;
}

/** Connected components of the unclaimed ground, in row-major discovery order. */
export function blocksOf(grid: Grid, blocked: Uint8Array, split: boolean): Block[] {
  const seen = new Uint8Array(grid.cells);
  const out: Block[] = [];
  const stack: number[] = [];
  // Membership of the component currently being flooded. `largestFreeRect`
  // reads it as its own `blocked`, so the inscribed rectangle is a rectangle of
  // *this* block rather than one of unblocked ground — see below.
  const member = new Uint8Array(grid.cells);
  const flooded: number[] = [];

  for (let start = 0; start < grid.cells; start++) {
    if (blocked[start] === 1 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    for (const k of flooded) member[k] = 0;
    flooded.length = 0;
    member[start] = 1;
    flooded.push(start);
    let x0 = grid.x(start);
    let x1 = x0;
    let z0 = grid.z(start);
    let z1 = z0;
    let columns = 0;

    while (stack.length > 0) {
      const k = stack.pop() as number;
      columns++;
      const x = grid.x(k);
      const z = grid.z(k);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      for (const [dx, dz] of NEIGHBOURS) {
        const n = grid.index(x + dx, z + dz);
        if (n < 0 || seen[n] === 1 || blocked[n] === 1) continue;
        seen[n] = 1;
        member[n] = 1;
        flooded.push(n);
        stack.push(n);
      }
    }
    // One rectangle per block, unless the block is cut into several — see
    // `rectsOf` and {@link BLOCK_MULTI_RECT}, which is where the whole of that
    // "unless" is argued.
    if (!split) {
      const rect = largestFreeRect(grid, member, { x0, z0, x1, z1 });
      if (rect === null) continue;
      // **A component too thin for one whole building is not a block.** The
      // same rule `rectsOf` applies inside its loop, applied here to the one
      // rectangle the ordinary path takes — see the note there for the
      // measurement. A rectangle under `MIN_INFILL_SIDE` on its short axis
      // cannot hold a lot the grammar will build on however it is subdivided
      // (`CELL_MIN_BUILDING` is the same number), so what it produced was a
      // block with no lots: land that counted as fabric and could never be it.
      if (Math.min(rect.x1 - rect.x0 + 1, rect.z1 - rect.z0 + 1) < MIN_INFILL_SIDE) continue;
      out.push({ rect, columns });
      continue;
    }
    for (const rect of rectsOf(grid, member, { x0, z0, x1, z1 })) {
      out.push({ rect, columns: (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1) });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the leaf cap                                                                */
/* -------------------------------------------------------------------------- */

/** What the alley pass added, and what it had to work with. */
export interface AlleyPass {
  /** The lanes cut, in the order they were cut. Empty is the ordinary case. */
  readonly lanes: readonly StreetSegment[];
  /** Rounds that found something to cut. 0 for every quarter under the cap. */
  readonly rounds: number;
}

/**
 * Cut an alley through every block too deep to be rim frontage — {@link leafBlockCap}.
 *
 * **The block is the leaf, so the leaf is what has to be capped.** The forms
 * that split a domain rather than lay a pitch (`grown`, and any future form
 * that recurses) terminate on their own floor, which bounds the block's *long*
 * axis at some multiple of `blockSize` and says nothing at all about whether
 * `subdivide` can reach the middle of it. This is the missing half of that
 * contract, and it is enforced here — after the fabric, the platform seams and
 * every mask are in `blocked` — rather than inside a form, because it is a
 * property of the finished block and every form has to hold it.
 *
 * The alley is a **real street**, not a gap:
 *
 * - it is a `lane` {@link StreetSegment} appended to the quarter's own graph, so
 *   `segmentOwners` maps its carriageway, `streetBehind` finds it behind the two
 *   new blocks' facing sides, and every lot it creates carries its id in
 *   `Lot.street` — which is what the frontage tie, the doorstep and the
 *   carriageway surfacer all dispatch on. A lane with no identity would give
 *   `street: ""`, and a lot that fronts nothing is a lot seated on its own
 *   median with its door onto whatever the next pass puts there;
 * - it **reaches the street it came off**. Each end walks outward from the
 *   block's rectangle until it meets paved ground and stops one column inside
 *   it, so the alley is connected to the fabric by construction rather than by
 *   an overrun constant that would plough through the next block when the
 *   bounding street is close.
 *
 * Deterministic: blocks arrive in row-major discovery order, the cut is the
 * block's own middle column, and the pass stops when a round finds nothing.
 *
 * Byte-identical for every quarter whose blocks are already under the cap —
 * which is every `grid`, `radial` and `linear` quarter in the repository, since
 * a pitch-laid block is its spacing less a carriageway and two sidewalks.
 */
export function cutDeepBlocks(args: {
  readonly grid: Grid;
  /** Mutated: the alley's carriageway is added. */
  readonly carriageway: Uint8Array;
  /** Mutated in place, and the caller's `sidewalk` is replaced from it. */
  readonly blocked: Uint8Array;
  readonly split: boolean;
  readonly density: DistrictDensity;
  readonly sidewalkWidth: number;
  readonly bounds: Rect;
}): AlleyPass & { readonly sidewalk: Uint8Array | null } {
  const { grid, carriageway, blocked, split, density, sidewalkWidth, bounds } = args;
  const cap = leafBlockCap(density, sidewalkWidth);
  const lanes: StreetSegment[] = [];
  let sidewalk: Uint8Array | null = null;
  let rounds = 0;

  for (let round = 0; round < MAX_ALLEY_ROUNDS; round++) {
    const cuts: StreetSegment[] = [];
    for (const [k, block] of blocksOf(grid, blocked, split).entries()) {
      const width = block.rect.x1 - block.rect.x0 + 1;
      const depth = block.rect.z1 - block.rect.z0 + 1;
      if (Math.min(width, depth) <= cap) continue;
      const path = alleyThrough(block.rect, grid, carriageway, sidewalkWidth);
      if (path === null) continue;
      cuts.push({
        id: `alley${round}_${k}`,
        kind: "lane",
        width: STREET_WIDTH.lane,
        path,
      });
    }
    if (cuts.length === 0) break;
    rounds++;
    lanes.push(...cuts);
    for (const cell of carriagewayCells({ segments: cuts, intersections: [], sidewalk: sidewalkWidth }, bounds)) {
      const k = grid.index(cell.x, cell.z);
      if (k >= 0) carriageway[k] = 1;
    }
    // Recomputed over the *whole* carriageway rather than dilated off the new
    // lanes alone, so the verge stays the one construction `layDistrict` made:
    // a band around the paved mask that excludes the paved mask itself.
    sidewalk = dilate(grid, carriageway, sidewalkWidth);
    for (let k = 0; k < grid.cells; k++) {
      if (carriageway[k] === 1 || sidewalk[k] === 1) blocked[k] = 1;
    }
  }

  return { lanes, rounds, sidewalk };
}

/**
 * The alley's centre line through one block rectangle, or `null`.
 *
 * Parallel to the block's **long** axis at the middle of its short one, which
 * is the cut that halves the axis the cap is about. Each end is walked outward
 * until it meets paved ground and stopped one column inside it; an end that
 * reaches neither paved ground nor the district edge inside
 * `sidewalkWidth + STREET_PROBE_SLACK` — the same reach `streetBehind` probes —
 * stops there, which is the honest answer for a block whose own rectangle sits
 * well inside a curved component.
 */
function alleyThrough(
  rect: Rect,
  grid: Grid,
  paved: Uint8Array,
  sidewalkWidth: number,
): Point2[] | null {
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  // Ties (a square block) cut along z, which is the row-major reading order.
  const shortIsX = width <= depth;
  const at = shortIsX
    ? Math.floor((rect.x0 + rect.x1) / 2)
    : Math.floor((rect.z0 + rect.z1) / 2);
  const limit = sidewalkWidth + STREET_PROBE_SLACK;

  /** How far this end may run: one column into the first paved ground it meets. */
  const reach = (from: number, step: -1 | 1): number => {
    let last = from;
    for (let n = 1; n <= limit; n++) {
      const along = from + step * n;
      const k = shortIsX ? grid.index(at, along) : grid.index(along, at);
      if (k < 0) return last;
      last = along;
      if (paved[k] === 1) return along;
    }
    return last;
  };

  const lo = reach(shortIsX ? rect.z0 : rect.x0, -1);
  const hi = reach(shortIsX ? rect.z1 : rect.x1, 1);
  if (hi - lo + 1 < MIN_INFILL_SIDE) return null;

  const path: Point2[] = [];
  for (let along = lo; along <= hi; along++) {
    path.push(shortIsX ? { x: at, z: along } : { x: along, z: at });
  }
  return path;
}

/**
 * Cut **every** block into as many rectangles as it holds, not just a benched
 * one — the measured cure for the deep-block deficit.
 *
 * This is the one that moved the number. `blocksOf` hands `subdivide` one
 * inscribed rectangle per component, and for a pitch-laid grid that *is* the
 * block, column for column. For a fabric whose streets curve or whose platform
 * seams cut across it, it is a chord: the rest of the component is ground
 * inside the town that no lot is ever cut from, and it is invisible in every
 * statistic the report carries. {@link rectsOf} has taken the *rest* of that
 * component since the terraces landed; it was gated on `terraced` only so that
 * no world would move.
 *
 * Measured, `trojan_horse_in_troy` (`grown` × `medium` × `stepped`,
 * 220 × 200, `battery/candidates/p3-tie2`), against the same seed and document:
 *
 * | | blocks | lots | dwellings | building columns | built / envelope |
 * |---|---|---|---|---|---|
 * | one rectangle | 20 | 68 | 46 | 7 604 | 0.173 |
 * | every rectangle | 33 | 85 | 60 | 9 754 | **0.222** |
 *
 * The two ends of the walked range are 0.173 (Kai: "near-empty") and the grid
 * quarter he called good. This closes most of the distance and it does it by
 * building on ground the quarter already had.
 *
 * **A grid quarter cannot move**, and the reason is structural rather than
 * empirical: a pitch-laid component fills its own bounding box, so the first
 * rectangle is the whole component and the second pass has nothing left to
 * find. Verified byte-for-byte on `examples/showcase-bayline` and
 * `examples/site-plan-hillside`; `examples/c1-harbourtown`, whose cells are not
 * pitch-laid, gains 21 buildings.
 *
 * A named constant rather than a silent edit because it is the kind of change
 * that wants one line to undo — the same shape `FRONTAGE_TIE` and `SEAM_TIERS`
 * have. `false` restores the `terraced`-only gate exactly.
 */
export const BLOCK_MULTI_RECT = true;

/**
 * Most rectangles a curved block is cut into. `subdivide` is cheap and
 * `largestFreeRect` is O(area), so this is a guard against a pathological
 * component rather than a shape decision.
 */
const MAX_BLOCK_RECTS = 8;

/**
 * A curved block as **several** inscribed rectangles rather than one.
 *
 * `largestFreeRect` deliberately hands `subdivide` the largest rectangle that
 * lies entirely inside one block, and for a grid block that *is* the block. For
 * a **terrace** it is nowhere near: a bench is a band that follows a contour
 * round a hill, and the largest rectangle inside a curved band is a chord of it.
 * Measured on `stepped_hilltown` once the contour streets were thinned: 59
 * blocks holding 13 868 columns whose inscribed rectangles came to 6 232 — 45 %
 * — and since every lot is cut from a rectangle, 55 % of the town's ground could
 * not hold a house whatever else was fixed. It is the largest single loss in the
 * quarter and it is invisible in every statistic the report carries.
 *
 * So: take the largest rectangle, take it *out*, and take the largest rectangle
 * of what is left, until what is left cannot hold a building. Each rectangle
 * becomes its own `Block` and subdivides independently against its own frontage
 * probe, exactly as two blocks either side of a street already do. They are
 * disjoint by construction, so the interpenetration failure `largestFreeRect`
 * documents — two components lotting the same ground — stays unrepresentable.
 *
 * **Now for every fabric** — see {@link BLOCK_MULTI_RECT}, which carries the
 * measurement and the argument. It used to be gated on `plan.benches`, i.e. on
 * `terraced` alone, "not because it would be wrong elsewhere but because it
 * would move every organic and grown world in the repository". That gate is
 * lifted: the world it was protecting is the one Kai walked twice and called
 * empty, and the ground it was declining to lot is the deficit.
 *
 * Deterministic: `largestFreeRect` breaks every tie on the earlier row and the
 * earlier column, so the sequence of rectangles is a function of the block.
 *
 * Exported for the same reason `benchFieldOf` is: the property that matters —
 * disjoint rectangles covering most of a curved band — is invisible in every
 * statistic downstream, and a test that re-derived the band by hand would be
 * testing its own arithmetic.
 */
export function rectsOf(grid: Grid, member: Uint8Array, bounds: Rect): Rect[] {
  const out: Rect[] = [];
  const left = Uint8Array.from(member);
  for (let n = 0; n < MAX_BLOCK_RECTS; n++) {
    const rect = largestFreeRect(grid, left, bounds);
    if (rect === null) break;
    const w = rect.x1 - rect.x0 + 1;
    const d = rect.z1 - rect.z0 + 1;
    // A rectangle no building fits in is not a block; stop rather than shave.
    if (Math.min(w, d) < MIN_INFILL_SIDE) break;
    out.push(rect);
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const k = grid.index(x, z);
        if (k >= 0) left[k] = 0;
      }
    }
  }
  // **A component too thin for one whole building is not a block.**
  //
  // It used to get the largest rectangle in it whatever its size — a 4 × 9
  // ribbon between two contour streets, emitted as a `Block`, subdivided into
  // nothing, and counted. Measured on `trojan_horse_in_troy`: 121 such
  // rectangles under 100 columns each, every one of them a block with no lots,
  // which is the statistic that made a walled quarter's block land look
  // healthy while a third of it could never hold a house.
  //
  // Dropping it is not a loss of ground: the columns stay exactly where they
  // are and become the quarter's open ground — the platform, the verge, the
  // green the F2 treatment lays — rather than a parcel nobody can build on. It
  // is a loss of a *lie* in the count.
  //
  // `MIN_INFILL_SIDE` is the gate above and the gate here for one reason: it is
  // the smallest side the grammar will accept, so a rectangle under it cannot
  // hold a single lot however the subdivision is asked.
  return out;
}

/**
 * The largest axis-aligned rectangle of **this block** inside its bounding box.
 *
 * `member` is the flood-fill membership of the one component being measured,
 * not the district's `blocked` mask, and that distinction is the whole of a
 * measured defect. A block's bounding box is not the block: on a `grown`
 * fabric the streets curve, so one component's bounding box straddles the lane
 * beside it and contains columns of the *next* block. Those columns are
 * unblocked, so a histogram sweep over `blocked` will happily return a
 * rectangle that lies partly in a neighbour — two components then subdivide
 * the same ground, and at `high` density, where every lot builds, the two
 * terraces are emitted through each other. Measured on `old_quarter`
 * (`grown` × `high` × `stepped`): one such pair, whose interpenetration cost
 * 46 `interior.blocked_column`, 142 `traversal.unreachable` and the one
 * `traversal.no_start` in the world. Confining the sweep to the component
 * makes the overlap unrepresentable.
 *
 * On a `grid` fabric a component fills its own bounding box, so `member` and
 * "not `blocked`" agree column for column and the result is unchanged.
 *
 * A grid block *is* its bounding box, and this returns exactly that. An organic
 * block is not — its streets curve, so the bounding box clips a sidewalk at
 * every bow — and the choice is between subdividing a rectangle that is partly
 * road (then dropping most of the lots it cuts) and subdividing the biggest
 * rectangle that is entirely block. This takes the second, which is why an
 * organic district has ragged margins of unbuilt ground: that ground is F2's
 * treatment, not a failure.
 *
 * The standard maximal-rectangle-under-a-histogram sweep — O(area), with every
 * tie broken by the earlier row and the earlier column, so it is stable.
 */
function largestFreeRect(grid: Grid, member: Uint8Array, bounds: Rect): Rect | null {
  const width = bounds.x1 - bounds.x0 + 1;
  const heights = new Int32Array(width);
  let best: Rect | null = null;
  let bestArea = 0;

  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let i = 0; i < width; i++) {
      const k = grid.index(bounds.x0 + i, z);
      heights[i] = k < 0 || member[k] !== 1 ? 0 : (heights[i] as number) + 1;
    }
    const stack: number[] = [];
    for (let i = 0; i <= width; i++) {
      const h = i === width ? 0 : (heights[i] as number);
      while (stack.length > 0 && (heights[stack[stack.length - 1] as number] as number) >= h) {
        const top = stack.pop() as number;
        const height = heights[top] as number;
        const left = stack.length === 0 ? 0 : (stack[stack.length - 1] as number) + 1;
        const area = height * (i - left);
        if (height > 0 && area > bestArea) {
          bestArea = area;
          best = { x0: bounds.x0 + left, z0: z - height + 1, x1: bounds.x0 + i - 1, z1: z };
        }
      }
      stack.push(i);
    }
  }
  return best;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const);

/* -------------------------------------------------------------------------- */
/* lots                                                                        */
/* -------------------------------------------------------------------------- */

/** One parcel, fronting one street. */
interface Lot {
  readonly id: string;
  readonly rect: Rect;
  /** The direction from the lot towards its street — where its door points. */
  readonly face: HorizontalFace;
  /**
   * Which side of the block the lot's strip was cut from.
   *
   * Equal to {@link Lot.face} for every lot the ordinary subdivision cuts, and
   * *opposite* to it on a courtyard block's streetless face, where the range
   * turns its door into the court (§4.3). Runs are grouped by `side`, never by
   * `face`, so a north strip facing south and a south strip facing south stay
   * two strips rather than collapsing into one.
   */
  readonly side: HorizontalFace;
  /** The segment id it fronts; `""` when it fronts the district boundary. */
  readonly street: string;
  readonly block: number;
  /** Frontage index within the strip, for run detection. */
  readonly order: number;
  readonly corner: boolean;
  /**
   * True on a lot in a courtyard block's perimeter. Its coverage draws — the
   * terrace one and the per-lot one — are forced to 1: an unbuilt lot in a
   * courtyard perimeter is a hole in the wall, and the whole point of the form
   * is that the wall is unbroken (§4.3).
   */
  readonly courtyard: boolean;
}

/** The four sides of a block, in the fixed order the subdivision walks them. */
const SIDES: readonly HorizontalFace[] = Object.freeze(["north", "south", "west", "east"] as const);

/**
 * Which segment claims the ground just outside one side of a block.
 *
 * A block side with no street behind it is the district boundary, and a lot may
 * not front it: a door onto the outside of the district is a door onto whatever
 * the next pass happens to put there.
 */
function segmentOwners(grid: Grid, graph: StreetGraph): (string | undefined)[] {
  const out = new Array<string | undefined>(grid.cells);
  // No bounds argument: `grid.index` already refuses anything off the district,
  // and this map is only ever read through it.
  for (const cell of carriagewayCells(graph)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) out[k] = cell.segment;
  }
  return out;
}

/** What one block's subdivision produced. */
interface Subdivision {
  readonly lots: readonly Lot[];
  readonly dropped: number;
  /** The block's own frontage, for a landmark that wants the whole block. */
  readonly front: BlockSite | null;
  /** The courtyard this block closes around, when it was selected (§4.2). */
  readonly courtyard: CourtyardPlan | null;
  /** Why it was not selected. `null` when it was. */
  readonly rejected: CourtyardReject | null;
}

/** A whole block, offered to a landmark no run of lots can hold. */
interface BlockSite {
  readonly block: number;
  readonly rect: Rect;
  readonly face: HorizontalFace;
  readonly street: string;
}

/**
 * Cut a block's street-facing perimeter into lots.
 *
 * The scheme is the classic one and its corners are settled by fiat: the north
 * and south strips run the block's full width and own the four corner parcels;
 * the east and west strips take what is left in the middle. Anything inside all
 * four strips is a courtyard, which this pass leaves alone — a block's core is
 * F2's ground treatment, not a building site.
 *
 * A block too thin to hold two opposite strips gets a single row of lots
 * spanning its whole depth, facing the first of its sides (in the fixed order
 * north, south, west, east) that has a street behind it. That is the case that
 * keeps a narrow block between two avenues from dissolving into nothing.
 *
 * Lot depth is the density's preference narrowed to half the block's shorter
 * axis, so the two opposite strips can never meet: `2 · depth ≤ shortest − 2`
 * by construction, which is why no two lots of a block overlap and why the core
 * always has at least two columns in it.
 */
function subdivide(
  block: Block,
  index: number,
  density: DistrictDensity,
  grid: Grid,
  blockedMask: Uint8Array,
  owner: (string | undefined)[],
  sidewalkWidth: number,
  courtyards: { readonly share: number; readonly stream: Seed256 },
  benched: boolean,
): Subdivision {
  const frontage = LOT_FRONTAGE[density];
  const { rect } = block;
  const width = rect.x1 - rect.x0 + 1;
  const span = rect.z1 - rect.z0 + 1;
  // Lot depth is the density's *preference*, narrowed to what the block can
  // actually give two opposite rows of. A fixed depth is what turns a 28-block
  // block into one building the size of the block — which is the failure this
  // whole pass exists to avoid, one scale down.
  const shortest = Math.min(width, span);
  const perimeter = shortest >= 2 * MIN_INFILL_SIDE + 2;
  const depth = perimeter
    ? Math.min(LOT_DEPTH[density], Math.floor((shortest - 2) / 2))
    : shortest;

  const fronts = new Map<HorizontalFace, string>();
  for (const side of SIDES) {
    const street = streetBehind(rect, side, grid, owner, sidewalkWidth);
    if (street !== undefined) fronts.set(side, street);
  }
  if (fronts.size === 0) {
    return { lots: [], dropped: 0, front: null, courtyard: null, rejected: "perimeter" };
  }
  const primary = bestSide(fronts, benched ? { width, span } : undefined);
  const front: BlockSite = {
    block: index,
    rect,
    face: primary,
    street: fronts.get(primary) as string,
  };

  // Does this block close around a courtyard? §4.2, and every criterion is a
  // number this function already computed. A share of 0 — the default — short
  // circuits inside `planCourtyard`, so a document that names no new key walks
  // exactly the code it walked before this phase.
  const decision = planCourtyard({
    rect,
    columns: block.columns,
    density,
    share: courtyards.share,
    depth,
    perimeter,
    fronts: new Set(fronts.keys()),
    primary,
    maxFrontage: TERRACE_MAX_FRONTAGE[density],
    stream: courtyards.stream,
  });
  const plan = isCourtyardPlan(decision) ? decision : null;
  const rejected = plan === null ? (decision as { rejected: CourtyardReject }).rejected : null;

  const lots: Lot[] = [];
  let dropped = 0;
  const emit = (
    strip: Rect,
    side: HorizontalFace,
    street: string,
    cornerFirst: boolean,
    cornerLast: boolean,
    face: HorizontalFace = side,
  ): void => {
    const along = side === "north" || side === "south";
    const length = along ? strip.x1 - strip.x0 + 1 : strip.z1 - strip.z0 + 1;
    if (length < MIN_INFILL_SIDE) {
      dropped++;
      return;
    }
    const count = Math.max(1, Math.round(length / frontage));
    const base = Math.floor(length / count);
    const extra = length - base * count;
    let cursor = along ? strip.x0 : strip.z0;
    for (let k = 0; k < count; k++) {
      const size = base + (k < extra ? 1 : 0);
      const lot: Rect = along
        ? { x0: cursor, z0: strip.z0, x1: cursor + size - 1, z1: strip.z1 }
        : { x0: strip.x0, z0: cursor, x1: strip.x1, z1: cursor + size - 1 };
      cursor += size;
      if (!isFree(grid, blockedMask, lot)) {
        dropped++;
        continue;
      }
      lots.push({
        id: `b${index}${side[0]}${k}`,
        rect: lot,
        face,
        side,
        street,
        block: index,
        order: k,
        corner: (k === 0 && cornerFirst) || (k === count - 1 && cornerLast),
        courtyard: plan !== null,
      });
    }
  };

  if (!perimeter) {
    // Too shallow for two rows: one row of lots spanning the whole block,
    // facing whichever side has a street, in the fixed side order.
    emit(rect, primary, front.street, true, true);
    return { lots, dropped, front, courtyard: null, rejected };
  }

  if (plan !== null) {
    // A courtyard block cuts **all four** strips, including the sides with no
    // street behind them (§4.3). The rule that a lot may not front the district
    // boundary is kept rather than broken: the streetless range's door does not
    // go on the outside, it goes on the courtyard, so its `face` is the inward
    // direction and `yawFacing` turns it into the court. What is left outside
    // is a blank wall on the district edge, which is what a medina looks like
    // from outside.
    const inward: Readonly<Record<HorizontalFace, HorizontalFace>> = {
      north: "south",
      south: "north",
      west: "east",
      east: "west",
    };
    const innerZ0c = rect.z0 + depth;
    const innerZ1c = rect.z1 - depth;
    for (const side of SIDES) {
      const street = fronts.get(side);
      const face = street === undefined ? (inward[side] as HorizontalFace) : side;
      const strip: Rect =
        side === "north"
          ? { ...rect, z1: rect.z0 + depth - 1 }
          : side === "south"
            ? { ...rect, z0: rect.z1 - depth + 1 }
            : side === "west"
              ? { x0: rect.x0, z0: innerZ0c, x1: rect.x0 + depth - 1, z1: innerZ1c }
              : { x0: rect.x1 - depth + 1, z0: innerZ0c, x1: rect.x1, z1: innerZ1c };
      const ends = side === "north" || side === "south";
      emit(strip, side, street ?? front.street, ends, ends, face);
    }
    return { lots, dropped, front, courtyard: plan, rejected: null };
  }

  const north = fronts.get("north");
  const south = fronts.get("south");
  const west = fronts.get("west");
  const east = fronts.get("east");

  if (north !== undefined) {
    emit({ ...rect, z1: rect.z0 + depth - 1 }, "north", north, west !== undefined, east !== undefined);
  }
  if (south !== undefined) {
    emit({ ...rect, z0: rect.z1 - depth + 1 }, "south", south, west !== undefined, east !== undefined);
  }
  const innerZ0 = north === undefined ? rect.z0 : rect.z0 + depth;
  const innerZ1 = south === undefined ? rect.z1 : rect.z1 - depth;
  // A side strip shallower than a building is a courtyard, not a lost lot: the
  // two long sides took the frontage and what is left is the block's core.
  if (innerZ1 - innerZ0 + 1 >= MIN_INFILL_SIDE) {
    if (west !== undefined) {
      emit({ x0: rect.x0, z0: innerZ0, x1: rect.x0 + depth - 1, z1: innerZ1 }, "west", west, false, false);
    }
    if (east !== undefined) {
      emit({ x0: rect.x1 - depth + 1, z0: innerZ0, x1: rect.x1, z1: innerZ1 }, "east", east, false, false);
    }
  }

  return { lots, dropped, front, courtyard: null, rejected };
}

/* -------------------------------------------------------------------------- */
/* lots from frontage                                                          */
/* -------------------------------------------------------------------------- */

/** What one strip's frontage walk produced. */
interface FrontageWalk {
  readonly lots: readonly Lot[];
  readonly sites: readonly BlockSite[];
  readonly dropped: number;
  /** Columns the lots claimed — the numerator of §4.2's recovery measurement. */
  readonly lotColumns: number;
  /** Columns the seated rectangles took — the denominator's other half. */
  readonly seatedColumns: number;
}

/**
 * How many lots a frontage of `length` columns is cut into, and how wide each is
 * (`docs/SITE-PLAN-v0.md` §4.2 step 2).
 *
 * **The same allocation `subdivide`'s `emit` uses**, extracted so that the
 * frontage rhythm of a hill town and a grid town are the same rhythm and there
 * is one place to change it: `count = max(1, round(len / target))`, sizes
 * `floor(len / count)` with the first `len − count · base` lots one column
 * wider.
 */
export function allocateFrontage(length: number, target: number): number[] {
  const count = Math.max(1, Math.round(length / target));
  const base = Math.floor(length / count);
  const extra = length - base * count;
  return Array.from({ length: count }, (_, k) => base + (k < extra ? 1 : 0));
}

/**
 * Lots walked off a planned strip's own frontage (`docs/SITE-PLAN-v0.md` §4.2).
 *
 * The measured reason this exists rather than `largestFreeRect`: a curved band's
 * largest inscribed rectangle is a *chord* of it, and on the walked hill town
 * that discarded roughly 45 % of block ground — 66 blocks holding 13 868 columns
 * yielding 7 573 columns of rectangle. Lots are cut from rectangles, so 61 of 63
 * lots were dropped.
 *
 * So the rectangle stays and *what it is inscribed in* changes. Each lot is a
 * **column set**, grown inward from its own span of the build-to line through
 * the strip's mask, with an irregular rear boundary; the building is then seated
 * in **that lot's** largest inscribed rectangle, which is a locally near-
 * rectangular parcel of about 15 × 17 rather than a whole ragged contour band.
 *
 * v0 keeps **rectangular buildings** (§4.2 step 4). The grammar takes a
 * rectangle and changing that is a phase of its own; the recovery is measured
 * rather than assumed, which is what {@link FrontageWalk.lotColumns} and
 * {@link FrontageWalk.seatedColumns} are for.
 *
 * Deterministic: no draw of any kind. `largestRect` breaks every tie on the
 * earlier row and the earlier column, and the strips arrive in a fixed order.
 */
function frontageLots(
  strips: readonly FormStrip[],
  grid: Grid,
  blocked: Uint8Array,
  density: DistrictDensity,
): FrontageWalk {
  const bounds: Rect = {
    x0: grid.x0,
    z0: grid.z0,
    x1: grid.x0 + grid.width - 1,
    z1: grid.z0 + grid.depth - 1,
  };
  const lots: Lot[] = [];
  const sites: BlockSite[] = [];
  let dropped = 0;
  let lotColumns = 0;
  let seatedColumns = 0;
  // One column belongs to one lot, across every strip: two lots sharing ground
  // is the interpenetration failure `largestFreeRect` documents, and here it is
  // made unrepresentable rather than argued about.
  const taken = new Uint8Array(grid.cells);

  for (const strip of strips) {
    if (strip.stations === 0) continue;
    const sizes = allocateFrontage(strip.stations, LOT_FRONTAGE[density] as number);
    const stripRect = new Uint8Array(grid.cells);
    // Every claimed column, by the station of the build-to line it belongs to.
    // Built once per strip: the lots partition the stations, so their column
    // sets are disjoint by construction and two lots can never take one column.
    const byStation: number[][] = Array.from({ length: strip.stations }, () => []);
    for (let c = 0; c < grid.cells; c++) {
      if (strip.columns[c] !== 1 || blocked[c] === 1 || taken[c] === 1) continue;
      const st = strip.station[c] as number;
      if (st < 0 || st >= strip.stations) continue;
      // Step 3: within `MAX_INFILL_DEPTH` of the frontage. Past that the ground
      // is the terrace's back, not the lot's.
      if ((strip.depth[c] as number) >= MAX_INFILL_DEPTH) continue;
      (byStation[st] as number[]).push(c);
    }
    let cursor = 0;
    for (const [k, size] of sizes.entries()) {
      const from = cursor;
      cursor += size;
      // **Grow inward through the platform mask** (§4.2 step 3). Seeded from
      // this lot's own span of the build-to line and grown as a *connected*
      // parcel through ground no other lot has taken — which is what the step
      // says, and it matters: partitioning the strip by nearest station instead
      // cuts every parcel into a thin slice along the street's normal, and the
      // largest inscribed **axis-aligned** rectangle of a thin diagonal slice is
      // nothing. The rectangle is what the grammar builds on, so the parcel has
      // to be a blob.
      const member = new Uint8Array(grid.cells);
      const frontier: number[] = [];
      for (let st = from; st < from + size && st < strip.stations; st++) {
        for (const c of byStation[st] as number[]) {
          if (member[c] === 1 || (strip.depth[c] as number) > 1) continue;
          member[c] = 1;
          frontier.push(c);
        }
      }
      let columns = frontier.length;
      const budget = size * MAX_INFILL_DEPTH;
      for (let head = 0; head < frontier.length && columns < budget; head++) {
        const c = frontier[head] as number;
        const x = grid.x(c);
        const z = grid.z(c);
        for (const [dx, dz] of NEIGHBOURS) {
          const n = grid.index(x + dx, z + dz);
          if (n < 0 || member[n] === 1) continue;
          if (strip.columns[n] !== 1 || blocked[n] === 1 || taken[n] === 1) continue;
          if ((strip.depth[n] as number) >= MAX_INFILL_DEPTH) continue;
          member[n] = 1;
          columns++;
          frontier.push(n);
        }
      }
      if (columns === 0) {
        dropped++;
        continue;
      }
      // Step 4: seat the building in **this lot's** own largest inscribed
      // rectangle, over a set of at most a lot's frontage by the strip's depth.
      const rect = largestRect(bounds, member);
      if (rect === null || Math.min(rect.x1 - rect.x0 + 1, rect.z1 - rect.z0 + 1) < MIN_INFILL_SIDE) {
        dropped++;
        continue;
      }
      lotColumns += columns;
      seatedColumns += (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
      for (let z = rect.z0; z <= rect.z1; z++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          const c = grid.index(x, z);
          if (c >= 0) {
            taken[c] = 1;
            stripRect[c] = 1;
          }
        }
      }
      // Every column this lot grew is spoken for, whether or not the seated
      // rectangle reached it: a neighbour growing through it would put two
      // buildings' gardens inside one another.
      for (let c = 0; c < grid.cells; c++) if (member[c] === 1) taken[c] = 1;
      const face = faceOf(
        strip.outward[Math.min(from + (size >> 1), strip.stations - 1)] as Point2,
      );
      lots.push({
        id: `s${strip.index}f${k}`,
        rect,
        face,
        side: face,
        street: strip.street,
        block: strip.index,
        order: k,
        corner: k === 0 || k === sizes.length - 1,
        courtyard: false,
      });
    }
    // The whole strip, offered to a landmark no run of lots can hold. Its face
    // is the strip's own outward normal at its midpoint, so a church seated on
    // it still puts its door on the street.
    const site = largestRect(bounds, stripRect);
    if (site !== null) {
      sites.push({
        block: strip.index,
        rect: site,
        face: faceOf(strip.outward[strip.stations >> 1] as Point2),
        street: strip.street,
      });
    }
  }
  return { lots, sites, dropped, lotColumns, seatedColumns };
}

/**
 * The face a lot shows the street, from the strip's outward normal.
 *
 * `Lot.face` is the direction from the lot **towards** its street, and `outward`
 * points away from it, so this is the dominant axis of the negated normal. Ties
 * — a normal at exactly 45° — go to the x axis, which is arbitrary and is the
 * point: an arbitrary rule is still a rule, and a deterministic one.
 */
function faceOf(outward: Point2): HorizontalFace {
  const dx = -outward.x;
  const dz = -outward.z;
  if (Math.abs(dx) >= Math.abs(dz)) return dx < 0 ? "west" : "east";
  return dz < 0 ? "north" : "south";
}

/**
 * The frontage side to use when a block only gets one.
 *
 * Fixed side order, which is arbitrary and is the point: for a block with two
 * fronts the choice has to be *a* rule, and an arbitrary one leaves every
 * quarter drawn before it exactly where it was.
 *
 * **Unless the block is a terrace.** A bench block is a long thin band with a
 * stair-alley across each *end*, so the fixed order hands it a nine-column face
 * on the short side and `subdivide`'s single-row branch cuts one lot the length
 * of the terrace — one building forty blocks long where a row of houses belongs.
 * Given the block's dimensions this takes the **longest** face instead, ties on
 * the fixed order, and the row runs along the terrace as it should. Passed in
 * only for a form that cut its own benches, so no other quarter moves.
 */
export function bestSide(
  fronts: ReadonlyMap<HorizontalFace, string>,
  size?: { readonly width: number; readonly span: number },
): HorizontalFace {
  if (size !== undefined) {
    let best: HorizontalFace | undefined;
    let bestLength = 0;
    for (const side of SIDES) {
      if (!fronts.has(side)) continue;
      const length = side === "north" || side === "south" ? size.width : size.span;
      if (length > bestLength) {
        bestLength = length;
        best = side;
      }
    }
    if (best !== undefined) return best;
  }
  for (const side of SIDES) {
    if (fronts.has(side)) return side;
  }
  return "north";
}

/**
 * The street behind one side of a block, or `undefined` for the district edge.
 *
 * Probed outward from the middle of the side, which is where a carriageway is
 * if there is one at all. The reach allows for {@link STREET_PROBE_SLACK}
 * columns of block ground before the sidewalk starts: an organic block's
 * inscribed rectangle does not touch its own streets, and a probe stopping at
 * the sidewalk band would report every one of its sides as the district edge.
 */
function streetBehind(
  rect: Rect,
  side: HorizontalFace,
  grid: Grid,
  owner: (string | undefined)[],
  sidewalkWidth: number,
): string | undefined {
  const midX = Math.floor((rect.x0 + rect.x1) / 2);
  const midZ = Math.floor((rect.z0 + rect.z1) / 2);
  for (let step = 1; step <= sidewalkWidth + STREET_PROBE_SLACK; step++) {
    const x = side === "west" ? rect.x0 - step : side === "east" ? rect.x1 + step : midX;
    const z = side === "north" ? rect.z0 - step : side === "south" ? rect.z1 + step : midZ;
    const k = grid.index(x, z);
    if (k < 0) return undefined;
    const found = owner[k];
    if (found !== undefined) return found;
  }
  return undefined;
}

/** True when every column of `rect` is buildable ground inside the district. */
function isFree(grid: Grid, blockedMask: Uint8Array, rect: Rect): boolean {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const k = grid.index(x, z);
      if (k < 0 || blockedMask[k] === 1) return false;
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* landmarks                                                                   */
/* -------------------------------------------------------------------------- */

/** A district child, ready to claim a lot. */
interface Landmark {
  readonly id: string;
  readonly nodePath: string;
  readonly size: readonly [number, number, number];
  readonly params: Readonly<Record<string, unknown>>;
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly tags: readonly string[];
  readonly seed: Seed256;
}

/** A lot that has been claimed and will become a building. */
interface BuiltLot {
  readonly nodePath: string;
  readonly id: string;
  /** The parcel the building is seated in, not the building itself. */
  readonly rect: Rect;
  readonly face: HorizontalFace;
  readonly size: readonly [number, number, number];
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly params: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
  readonly seed: Seed256;
  readonly frontPort: string | undefined;
  /**
   * The segment id this thing fronts; `""` when it fronts the district boundary
   * or was claimed off a block site that names no street.
   *
   * `docs/GROUND-UNIFICATION-v0.md` §0.3c: the frontage relation already exists
   * on {@link Lot} and the tie needs no new geometry — only the *level* of that
   * segment at the moment the lot is seated. This field is what carries the
   * relation across the claim, where the lot itself stops existing. A terrace
   * carries its **first** lot's street, which is the run's street: `terraceRuns`
   * groups by `block:face` and a run never spans two of them.
   */
  readonly street: string;
  /** True when the thing stands on (or starts/ends on) a corner lot — F5. */
  readonly corner: boolean;
  /**
   * The midpoint of the parcel's {@link BuiltLot.face} edge — F4's `frontAnchor`,
   * the point the datum is asked for a level at.
   *
   * The **parcel's** edge, not the seated building's: the parcel is what touches
   * the sidewalk band, and a building set back inside its lot must still take
   * its street's level rather than the level of whatever is beside it halfway up
   * the hill.
   */
  readonly frontAnchor: Point2;
}

/* -------------------------------------------------------------------------- */
/* the frontage tie — `docs/GROUND-UNIFICATION-v0.md` Part I                    */
/* -------------------------------------------------------------------------- */

/**
 * The midpoint of `rect`'s `face` edge — F4's `frontAnchor`.
 *
 * Integer, and the same `floor` midpoint {@link streetBehind} probes from, so a
 * lot that has a street by the fabric's reckoning is asked about at the column
 * the fabric asked about.
 */
export function frontAnchorOf(rect: Rect, face: HorizontalFace): Point2 {
  const midX = Math.floor((rect.x0 + rect.x1) / 2);
  const midZ = Math.floor((rect.z0 + rect.z1) / 2);
  return {
    x: face === "west" ? rect.x0 : face === "east" ? rect.x1 : midX,
    z: face === "north" ? rect.z0 : face === "south" ? rect.z1 : midZ,
  };
}

/**
 * The reach the datum is probed with — F4.
 *
 * `graph.sidewalk + STREET_PROBE_SLACK`, which is exactly {@link streetBehind}'s
 * reach: a lot that has a street by the fabric's reckoning has one by the
 * datum's, and F6's "no frontage, no tie" therefore never fires on a lot the
 * fabric believes is on a street.
 */
export function frontageReach(sidewalkWidth: number): number {
  return sidewalkWidth + STREET_PROBE_SLACK;
}

/** What {@link frontageSeat} needs. Pure in, integer out. */
export interface FrontageSeatInput {
  readonly rect: Rect;
  readonly face: HorizontalFace;
  /** F5: a corner lot also asks its flanks, and may take the lower answer. */
  readonly corner: boolean;
  readonly datum: StreetDatum;
  readonly reach: number;
}

/**
 * The level a tied lot seats at — F4 and F5 — or `undefined` when it is untied.
 *
 * F4: `datum.levelNear(frontAnchor, reach) + FRONTAGE_RISE`.
 *
 * F5: a corner lot ties to its **front** street and never to its flank, except
 * where the two disagree by more than {@link CORNER_TOLERANCE}, in which case it
 * takes the **lower** of the two. Taking the higher would put the front door
 * above its own pavement, which is the defect; taking the lower puts the flank
 * pavement above the lot — a step-up along the side wall, which is what a real
 * corner building on a hill does. Both flanks are asked and the lower of any
 * answer wins, because `Lot.corner` says *that* the lot is a corner and never
 * which of its two sides the flank is on.
 *
 * F6: no banded column within `reach` of the front edge is **not** a tie — the
 * caller keeps the seat it has today. A flank with no datum is simply silent;
 * it can never create a tie the front did not.
 */
export function frontageSeat(input: FrontageSeatInput): number | undefined {
  const { rect, face, corner, datum, reach } = input;
  const anchor = frontAnchorOf(rect, face);
  const front = datum.levelNear(anchor.x, anchor.z, reach);
  if (front === undefined) return undefined;
  let seatY = front;
  if (corner) {
    for (const flankFace of FLANKS_OF[face]) {
      const flankAnchor = frontAnchorOf(rect, flankFace);
      const flank = datum.levelNear(flankAnchor.x, flankAnchor.z, reach);
      if (flank === undefined) continue;
      if (Math.abs(flank - front) > CORNER_TOLERANCE) seatY = Math.min(seatY, flank);
    }
  }
  return seatY + FRONTAGE_RISE;
}

/**
 * **The platform branch of the seat, with the uphill-rim exception** — T7,
 * {@link RIM_SEAT_MAX_DROP}. `undefined` means "this lot is on no platform",
 * which is the caller's signal to fall through to the rest of its `??` chain.
 *
 * The plane wins this branch because a quarter that elected platforms has
 * already answered "what is the ground here", and two answers to one question
 * is the defect class. That holds while the lot is *on* its plane.
 *
 * A lot on the plane's **uphill rim** is not on it. Its own street is three or
 * four blocks above the plane it stands on — that is the terrace defect seen
 * from the lot rather than from the block — so seating it on the plane buries
 * its door in the terrace it straddles. Where the disagreement is that big the
 * street is the thing a walker is standing on, so the street wins.
 *
 * Narrow in both directions, on purpose:
 *
 * - only where a frontage exists. `tied` is `undefined` for F6's no-frontage
 *   lots, and those are exactly the lots with no street to be wrong about.
 * - only where the plane is too **low**. A plane *above* its frontage is F5's
 *   kerb — a step up off a pavement, which is a thing towns do — and it keeps
 *   the plane.
 *
 * Dead while {@link TERRACE_BY_TERRAIN} is off: the exception cannot fire, the
 * function is `planeY`, and every world is byte-identical.
 *
 * **…and dead while {@link ELECTION_SOLVE} is on, which is the shipped
 * configuration** — `docs/ELECTION-SOLVE-v0.md` §5, the seat simplification.
 * The exception existed because a lower-median anchor could seat a block three
 * below a street on its own rim; the objective prices that disagreement per
 * column (§1.3.3's frontage term), so the plane a lot stands on is already the
 * answer the lot's own street argued for, and a second answer here would be the
 * defect class the design set out to remove. The seat is therefore
 * `planeY ?? cell?.foundationY ?? tied ?? medianGround(…)` with no exception and
 * no tied override of a plane: **`levelY`, then the fallbacks** — `frontageSeat`
 * itself is untouched and still seats pad quarters and lots on no platform.
 *
 * A lot that straddles two atoms and is therefore wrong about one of them is
 * `LOAM-W494 GROUND_SEAT_NONPLANAR`, which the acceptance holds at 0; it is a
 * missing *term* if it ever fires (§7.1), never a re-armed exception here.
 *
 * The flag is read rather than passed for the same reason it always was: this
 * is a compile-time constant the whole compiler reads, and the tests that
 * exercise the exception exercise it through the constant.
 */
export function seatOnPlane(planeY: number | undefined, tied: number | undefined): number | undefined {
  if (planeY === undefined) return undefined;
  if (ELECTION_SOLVE) return planeY;
  if (TERRACE_BY_TERRAIN && tied !== undefined && tied - planeY > RIM_SEAT_MAX_DROP) return tied;
  return planeY;
}

/** The frontage record a {@link BuiltLot} carries away from the lots it claimed. */
export interface FrontageRecord {
  readonly street: string;
  readonly corner: boolean;
  readonly frontAnchor: Point2;
}

/**
 * What a claim keeps of the frontage its lots knew — §0.3c.
 *
 * One function at all three construction sites (landmark, terrace, infill) so
 * that a run of lots and a single lot answer the same way:
 *
 * - **street** is the *first* lot's, which is the run's: `terraceRuns` groups by
 *   `block:face` and a run therefore never spans two streets. `""` — the
 *   district boundary — survives as `""` and is F6's untied case.
 * - **corner** is true if *any* claimed lot is a corner: a terrace that turns a
 *   corner has a corner's problem even though most of its bays do not.
 * - **frontAnchor** is taken from the claim's own rect, which is the union of
 *   the lots' rects, so the anchor is the middle of the whole frontage rather
 *   than the middle of one bay of it.
 */
export function frontageOf(
  rect: Rect,
  face: HorizontalFace,
  lots: readonly Pick<Lot, "street" | "corner">[],
): FrontageRecord {
  return {
    street: lots[0]?.street ?? "",
    corner: lots.some((lot) => lot.corner),
    frontAnchor: frontAnchorOf(rect, face),
  };
}

/** The two sides perpendicular to a face — a corner lot's candidate flanks. */
const FLANKS_OF: Readonly<Record<HorizontalFace, readonly HorizontalFace[]>> = Object.freeze({
  north: Object.freeze(["west", "east"] as const),
  south: Object.freeze(["west", "east"] as const),
  west: Object.freeze(["north", "south"] as const),
  east: Object.freeze(["north", "south"] as const),
});

/** The door every infill building declares — the front, on the local south. */
const INFILL_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
  door: Object.freeze({ type: "door", face: "south", tags: Object.freeze(["primary"]) }),
});

/**
 * The district's children, biggest footprint first.
 *
 * Biggest first because a landmark is the thing the district was built around:
 * if the cathedral and the corner shop compete for the one deep lot, the
 * cathedral wins, and "wins" has to be decided before either is placed rather
 * than by whichever the document happened to list first. Ties break on document
 * order, which is what makes the choice reproducible.
 */
function landmarksOf(
  node: DistrictNode,
  nodePath: string,
  worldSeed: bigint,
  diagnostics: LoamDiagnostic[],
): Landmark[] {
  const out: Landmark[] = [];
  for (const child of node.children ?? []) {
    const structure = child as StructureNode;
    const childPath = `${nodePath}.${structure.id}`;
    const size = envelopeSize(structure);
    if ((structure.constraints ?? []).length > 0) {
      diagnostics.push(
        warning(
          "CONSTRAINT_NOT_IMPLEMENTED",
          childPath,
          "a district landmark is placed by frontage, not by the solver, so the constraints on this node are ignored",
          "delete the constraints — a landmark's position comes from the lot it claims; move the node out of the district if you need constraint-driven placement",
        ),
      );
    }
    out.push({
      id: structure.id,
      nodePath: childPath,
      size,
      params: structure.params ?? {},
      ports: structure.ports ?? INFILL_PORTS,
      tags: structure.tags ?? [],
      seed: nodeSeed(worldSeed, childPath, structure.seedSalt ?? ""),
    });
  }
  return out
    .map((l, index) => ({ l, index }))
    .sort((a, b) => {
      const areaA = a.l.size[0] * a.l.size[2];
      const areaB = b.l.size[0] * b.l.size[2];
      return areaA !== areaB ? areaB - areaA : a.index - b.index;
    })
    .map((e) => e.l);
}

/** The unrotated footprint a landmark asks for. */
function envelopeSize(node: StructureNode): readonly [number, number, number] {
  const declared = node.envelope?.size;
  if (declared !== undefined && declared.length === 3) return declared as readonly [number, number, number];
  const params = node.params ?? {};
  const floors = typeof params["floors"] === "number" ? params["floors"] : 2;
  return [11, Math.max(4, Math.round(floors * FLOOR_HEIGHT)), 11];
}

/** A run of adjacent lots a landmark may take. */
interface LotRun {
  readonly lots: readonly Lot[];
  readonly rect: Rect;
  readonly face: HorizontalFace;
}

/**
 * The cheapest site for a landmark: a run of unclaimed lots, or failing that a
 * whole free block.
 *
 * "Cheapest" is least wasted ground, which is what stops a nine-block chapel
 * eating the lot the tower needed. Runs are scanned in lot order and ties break
 * on the first lot's position, so the same document always produces the same
 * claim.
 *
 * The whole-block tier is not a nicety. A downtown lot is thirteen blocks deep
 * by construction, and a landmark is a landmark precisely because it is bigger
 * than that — a cathedral or a tower on its own block is the normal case, not
 * the exceptional one. It is a *fallback* rather than a preference because a
 * landmark that fits a frontage should take a frontage: a block given over to a
 * building half its size is a hole in the street wall.
 */
function claimSite(
  lots: readonly Lot[],
  blocks: readonly BlockSite[],
  claimed: ReadonlySet<string>,
  landmark: Landmark,
): LotRun | null {
  const run = claimRun(lots, claimed, landmark);
  if (run !== null) return run;

  for (const block of blocks) {
    const mine = lots.filter((l) => l.block === block.block);
    if (mine.length === 0 || mine.some((l) => claimed.has(l.id))) continue;
    const yaw = yawFacing(frontFace(landmark.ports, undefined), block.face);
    const [rw, , rd] = rotatedSize(landmark.size, yaw);
    if (rw > block.rect.x1 - block.rect.x0 + 1 || rd > block.rect.z1 - block.rect.z0 + 1) continue;
    return { lots: mine, rect: block.rect, face: block.face };
  }
  return null;
}

/** The cheapest run of adjacent unclaimed lots that fits a landmark. */
function claimRun(lots: readonly Lot[], claimed: ReadonlySet<string>, landmark: Landmark): LotRun | null {
  let best: LotRun | null = null;
  let bestWaste = Number.POSITIVE_INFINITY;

  for (let start = 0; start < lots.length; start++) {
    const first = lots[start] as Lot;
    if (claimed.has(first.id)) continue;
    let run: Lot[] = [first];
    for (let length = 1; length <= MAX_LANDMARK_RUN; length++) {
      if (length > 1) {
        const next = lots[start + length - 1];
        if (
          next === undefined ||
          claimed.has(next.id) ||
          next.block !== first.block ||
          next.face !== first.face ||
          next.order !== (run[run.length - 1] as Lot).order + 1
        ) {
          break;
        }
        run = [...run, next];
      }
      const rect = unionRect(run.map((l) => l.rect));
      const yaw = yawFacing(frontFace(landmark.ports, undefined), first.face);
      const [rw, , rd] = rotatedSize(landmark.size, yaw);
      const w = rect.x1 - rect.x0 + 1;
      const d = rect.z1 - rect.z0 + 1;
      if (rw > w || rd > d) continue;
      const waste = w * d - rw * rd;
      if (waste < bestWaste) {
        bestWaste = waste;
        best = { lots: run, rect, face: first.face };
      }
    }
  }
  return best;
}

function unionRect(rects: readonly Rect[]): Rect {
  let out = rects[0] as Rect;
  for (const r of rects.slice(1)) {
    out = {
      x0: Math.min(out.x0, r.x0),
      z0: Math.min(out.z0, r.z0),
      x1: Math.max(out.x1, r.x1),
      z1: Math.max(out.z1, r.z1),
    };
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the street wall                                                             */
/* -------------------------------------------------------------------------- */

/** One terrace, ready to be pushed onto the built list. */
interface Terrace {
  readonly lots: readonly Lot[];
  readonly bays: number;
  readonly built: BuiltLot;
}

/**
 * Group the unclaimed lots into terraces — the continuous street wall.
 *
 * ## Why this exists at all
 *
 * At `high` density {@link LOT_SIDE_GAP} is zero, so the per-lot path built
 * every lot's building flush to its lot edge. That is the right *position* and
 * the wrong *building*: each one was an independent shell with its own four
 * walls, so two neighbours came out as two boxes with their walls back to back.
 * Kai walked the first Bayline and reported exactly that. A dense block is not
 * detached boxes at zero spacing; it is one terrace of N bays sharing party
 * walls, and that is a different generator ({@link planTerrace},
 * `stdlib/structures/terrace.ts`), not a different gap.
 *
 * ## What a run is
 *
 * A maximal sequence of consecutive unclaimed lots on the **same block face** —
 * same `block`, same `face`, consecutive `order`. Grouping by face rather than
 * by position in the lot list matters: the list is sorted row-major over the
 * whole district, so two strips of different blocks can interleave in it.
 *
 * A run longer than {@link TERRACE_MAX_FRONTAGE} is cut into two or more
 * terraces with {@link TERRACE_PASSAGE} columns between them, which reads as a
 * pedestrian passage rather than as a missing building. A chunk too short or
 * too shallow for the terrace grammar is simply not claimed, and falls through
 * to the per-lot infill exactly as it would have before.
 *
 * ## Determinism
 *
 * Every draw is positional and keyed on the run's **own** geometry: the node
 * seed is `hash(worldSeed, "…terrace_<x>_<z>")` off the chunk's min corner, and
 * the bay pitches, storeys, archetypes and doors inside it are hashes of that
 * seed and of the offset along the run. Nothing is keyed on a counter or on an
 * index into a list of runs, so adding a landmark elsewhere in the district
 * leaves every terrace it does not touch byte-identical.
 */
function terraceRuns(
  lots: readonly Lot[],
  claimed: ReadonlySet<string>,
  params: DistrictParams,
  nodePath: string,
  worldSeed: bigint,
  districtSeed: Seed256,
  /**
   * Where a courtyard block wants its perimeter cut, keyed `block:side`
   * (§4.4). The gap the cut opens *is* the passage, so this is the difference
   * between a passage the block asked for and one it got by accident from a
   * frontage cap.
   */
  preferAt: ReadonlyMap<string, number>,
  /** Filled with the passages actually cut. */
  passages: CourtyardPassage[],
  /**
   * `layout.storeyCeiling` — how tall the era lets a street wall build, or
   * `undefined` for "no opinion", which is every document that declares no
   * `era` and every era class the table stays quiet about.
   *
   * The terrace run draws its storeys from `INFILL_FLOORS[density]` and has
   * never asked the prominence field, so the ceiling has to arrive here
   * separately: capping the field alone would leave the street wall — the
   * tallest thing in an ordinary quarter — exactly as tall as it was.
   */
  storeyCeiling: number | undefined,
): Terrace[] {
  const density = params.density;
  const maxFrontage = TERRACE_MAX_FRONTAGE[density];
  if (maxFrontage <= 0) return [];
  const coverage = TERRACE_COVERAGE[density];
  const stream = streamSeed(districtSeed, "repeat");

  // Group by block face, in the lot list's own order so the grouping is a pure
  // function of the subdivision rather than of a hash iteration.
  const faces = new Map<string, Lot[]>();
  for (const lot of lots) {
    if (claimed.has(lot.id)) continue;
    // Keyed on the *side* the strip was cut from, not on the face its doors
    // point at: on a courtyard block a streetless north range faces south, and
    // grouping by face would merge it with the south range into one run whose
    // `order` indices collide. For every lot the ordinary subdivision cuts the
    // two are the same value, so this is byte-identical there.
    const key = `${lot.block}:${lot.side}`;
    const group = faces.get(key);
    if (group === undefined) faces.set(key, [lot]);
    else group.push(lot);
  }

  const out: Terrace[] = [];
  for (const group of faces.values()) {
    const strip = [...group].sort((a, b) => a.order - b.order);
    // Maximal consecutive-`order` runs: a landmark in the middle of a face
    // breaks the street wall, which is exactly what a landmark is for.
    let run: Lot[] = [];
    const flush = (): void => {
      if (run.length >= TERRACE_MIN_LOTS) out.push(...cutRun(run));
      run = [];
    };
    for (const lot of strip) {
      const last = run[run.length - 1];
      if (last !== undefined && lot.order !== last.order + 1) flush();
      run.push(lot);
    }
    flush();
  }
  return out;

  /** Cut one run into terraces short enough to read as a street. */
  function cutRun(run: readonly Lot[]): Terrace[] {
    const first = run[0] as Lot;
    const along = first.side === "north" || first.side === "south";
    const width = (lot: Lot): number =>
      along ? lot.rect.x1 - lot.rect.x0 + 1 : lot.rect.z1 - lot.rect.z0 + 1;

    /** Chunk one contiguous part by the frontage cap, the way this always has. */
    const byFrontage = (part: readonly Lot[]): Lot[][] => {
      const out: Lot[][] = [];
      let chunk: Lot[] = [];
      let span = 0;
      for (const lot of part) {
        const w = width(lot);
        if (chunk.length > 0 && span + w > maxFrontage) {
          out.push(chunk);
          chunk = [];
          span = 0;
        }
        chunk.push(lot);
        span += w;
      }
      if (chunk.length > 0) out.push(chunk);
      return out;
    };

    // A courtyard block asks for a cut *here* — at the lot boundary nearest the
    // middle of its primary face — rather than taking whatever the frontage cap
    // gives (§4.4). Everything else about the cut is unchanged, including the
    // three columns the second run gives up, which is the gap.
    const prefer = preferAt.get(`${first.block}:${first.side}`);
    const starts = run.map((lot) => (along ? lot.rect.x0 : lot.rect.z0));
    const at =
      prefer === undefined ? null : splitIndexNearest(starts, prefer, TERRACE_MIN_LOTS);

    const chunks: Lot[][] =
      at === null
        ? byFrontage(run)
        : [...byFrontage(run.slice(0, at)), ...byFrontage(run.slice(at))];
    // Which chunk starts the asked-for passage: the first of the second part.
    const asked = at === null ? -1 : byFrontage(run.slice(0, at)).length;

    const made: Terrace[] = [];
    let before: Terrace | null = null;
    for (const [i, part] of chunks.entries()) {
      const terrace =
        part.length < TERRACE_MIN_LOTS ? null : makeTerrace(part, along, i > 0);
      if (terrace === null) {
        before = null;
        continue;
      }
      // The passage is only recorded when there is a building on *both* sides
      // of it: a gap with nothing flanking it is not a pend, it is a missing
      // building, and the structure pass would have nothing for an arch to
      // spring from. The readback in `structures/courtyards.ts` is the second
      // half of that check and the one that catches a terrace that refused
      // downstream.
      if (i === asked && before !== null) {
        const whole = unionRect(part.map((l) => l.rect));
        passages.push({
          block: first.block,
          face: first.side,
          rect: along
            ? { ...whole, x1: whole.x0 + TERRACE_PASSAGE - 1 }
            : { ...whole, z1: whole.z0 + TERRACE_PASSAGE - 1 },
        });
      }
      before = terrace;
      made.push(terrace);
    }
    return made;
  }

  /** Turn one chunk of lots into a terrace node, or `null` when it cannot be. */
  function makeTerrace(chunk: readonly Lot[], along: boolean, passage: boolean): Terrace | null {
    const face = (chunk[0] as Lot).face;
    const whole = unionRect(chunk.map((l) => l.rect));
    // The passage: the second and later terraces of a cut run give up their
    // low-side columns, so the gap lands *between* the two runs rather than
    // being shared out by the centring in `seat`.
    const rect: Rect = !passage
      ? whole
      : along
        ? { ...whole, x0: whole.x0 + TERRACE_PASSAGE }
        : { ...whole, z0: whole.z0 + TERRACE_PASSAGE };

    const gap = LOT_SIDE_GAP[density] as number;
    const frontage = (along ? rect.x1 - rect.x0 : rect.z1 - rect.z0) + 1;
    const depth = (along ? rect.z1 - rect.z0 : rect.x1 - rect.x0) + 1;
    const across = frontage - 2 * gap;
    const back = Math.min(depth - gap, MAX_INFILL_DEPTH);
    if (across < TERRACE_MIN_FRONTAGE || back < terraceMinDepth(FLOOR_HEIGHT)) return null;

    const id = `terrace_${rect.x0}_${rect.z0}`;
    const path = `${nodePath}.${id}`;
    const seed = nodeSeed(worldSeed, path, "");
    // Coverage goes to 1 on a courtyard block: an unbuilt range is a hole in a
    // wall that is supposed to be unbroken (§4.3).
    const closes = chunk[0]?.courtyard === true;
    if (!closes && coverage < 1 && positionFloat(stream, rect.x0, 2, rect.z0) >= coverage) {
      return null;
    }

    // Phase one: where the party walls fall. Seeded from this terrace's own
    // node seed, which is a hash of its own min corner — so the frontage is cut
    // the same way whenever a run starts at the same world column.
    const skeleton = planTerrace({
      sx: across,
      storeyHeight: FLOOR_HEIGHT,
      floors: 1,
      stream: streamSeed(seed, "terrace"),
      ...(chunk[0]?.corner === true ? { cornerStart: true } : {}),
      ...(chunk[chunk.length - 1]?.corner === true ? { cornerEnd: true } : {}),
    });
    if (skeleton.bays.length === 0) return null;

    // Phase two: what each bay is and how tall. The storeys are drawn around
    // one height for the whole run rather than independently per bay — a street
    // wall is a *wall*, and independent draws over a five-storey range give a
    // skyline of teeth. The generator's cornice snap then merges the neighbours
    // that came out within one of each other, so what survives is a few long
    // cornice lines with deliberate steps between them.
    const [rangeLo, rangeHi] = INFILL_FLOORS[density];
    // The era's ceiling clips the top of the range, and the bottom follows it
    // down rather than crossing it: a two-storey minimum under a one-storey
    // ceiling would draw `lo > hi` and the `min`/`max` pair below would return
    // the ceiling anyway. Stating it here keeps the draw a range.
    const hi = storeyCeiling === undefined ? rangeHi : Math.max(1, Math.min(rangeHi, storeyCeiling));
    const lo = Math.min(rangeLo, hi);
    const startCol = along ? rect.x0 : rect.z0;
    const otherCol = along ? rect.z0 : rect.x0;
    const base = positionInt(stream, startCol, 3, otherCol, lo, hi);
    const bays: TerraceBay[] = skeleton.bays.map((bay) => {
      const col = startCol + bay.wall0;
      const interior = bay.x1 - bay.x0 + 1;
      const floors = Math.min(hi, Math.max(lo, base + positionInt(stream, col, 4, otherCol, -1, 2)));
      const archetype = pickArchetype(params.mix, interior, stream, col, otherCol);
      return {
        width: bay.wall1 - bay.wall0,
        floors,
        ...(archetype === null ? {} : { archetype }),
      };
    });

    const tallest = bays.reduce((m, b) => Math.max(m, b.floors), 1);
    // Height the envelope reserves. The parapet, the party-wall upstands and a
    // corner finial all stand over the eave line, and the solver's box has to
    // hold them: a node whose ops leave its own envelope is a node the
    // occupancy grid, the canopy clip and the pad all disagree with.
    const height = tallest * FLOOR_HEIGHT + 12;

    return {
      lots: chunk,
      bays: bays.length,
      built: {
        nodePath: path,
        id,
        rect,
        face,
        size: [across, height, back],
        ports: terracePorts(skeleton, across),
        params: {
          archetype: "terrace",
          face,
          bays,
          floorHeight: FLOOR_HEIGHT,
          ...(chunk[0]?.corner === true ? { cornerStart: true } : {}),
          ...(chunk[chunk.length - 1]?.corner === true ? { cornerEnd: true } : {}),
        },
        tags: ["district", "terrace", "street_wall"],
        seed,
        frontPort: "door",
        ...frontageOf(rect, face, chunk),
      },
    };
  }
}

/**
 * One door port per bay, on the street face.
 *
 * The terrace grammar puts a door in every bay, and a door the doorstep pass
 * cannot see is a door with a one-block step in front of it — which is a jump.
 * So every one of them is declared, at the column {@link planTerrace} chose,
 * and the two callers agree because they call the same planner with the same
 * seed rather than each deriving the columns their own way.
 *
 * `at[0]` is a fraction of the face, and the half-column offset is what makes
 * the round trip exact: `resolvePort` takes `floor(u · (sx − 1))`, so aiming at
 * the middle of the column survives any float error a division introduces.
 */
function terracePorts(
  plan: ReturnType<typeof planTerrace>,
  sx: number,
): Readonly<Record<string, PortDeclaration>> {
  const span = Math.max(1, sx - 1);
  const out: Record<string, PortDeclaration> = {};
  for (const [i, bay] of plan.bays.entries()) {
    const u = Math.min(1, (bay.doorX + 0.5) / span);
    out[i === 0 ? "door" : `door_${i}`] = {
      type: "door",
      face: "south",
      at: [u, 0],
      ...(i === 0 ? { tags: ["primary"] } : {}),
    };
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* infill                                                                      */
/* -------------------------------------------------------------------------- */

/** What one infilled lot came to. */
interface Infill {
  readonly id: string;
  readonly rect: Rect;
  readonly size: readonly [number, number, number];
  readonly params: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
}

/**
 * Fill one lot from the mix, or return `null` when the parcel cannot hold a
 * building at all. Whether the lot is built *by choice* is the caller's
 * coverage draw, not this function's.
 *
 * Every draw is keyed on the lot's min corner, never on a counter: which
 * archetype it takes and how many storeys it runs to are independent positional
 * hashes of the same column. That is what makes adding a landmark somewhere
 * else in the district leave the rest of the street exactly as it was.
 */
function infillLot(
  lot: Lot,
  params: DistrictParams,
  stream: Seed256,
  prominence: ProminenceField,
  minSide: number = MIN_INFILL_SIDE,
): Infill | null {
  const density = params.density;
  const x = lot.rect.x0;
  const z = lot.rect.z0;
  const gap = LOT_SIDE_GAP[density] as number;
  const along = lot.face === "north" || lot.face === "south";
  const frontage = (along ? lot.rect.x1 - lot.rect.x0 : lot.rect.z1 - lot.rect.z0) + 1;
  const depth = (along ? lot.rect.z1 - lot.rect.z0 : lot.rect.x1 - lot.rect.x0) + 1;

  let across = frontage - 2 * gap;
  let back = Math.min(depth - gap, MAX_INFILL_DEPTH);
  if (across < minSide || back < minSide) return null;

  const archetype = pickArchetype(params.mix, across, stream, x, z);
  if (archetype === null) return null;
  if (isHighriseArchetype(archetype)) {
    across = Math.min(across, HIGHRISE_MAX_WIDTH);
    back = Math.min(back, HIGHRISE_MAX_WIDTH);
  }

  const floors = prominence.storeys(x, z, { density, archetype });
  // The unrotated envelope is stated in the *lot's* frame: `across` runs along
  // the street and `back` away from it, which is what the yaw then rotates into
  // world axes. Stating it any other way would make the door's face depend on
  // which side of the block the lot happened to be on.
  const size: [number, number, number] = [across, Math.max(4, floors * FLOOR_HEIGHT + 2), back];

  return {
    id: `infill_${x}_${z}`,
    rect: lot.rect,
    size,
    params: { archetype, floors, floorHeight: FLOOR_HEIGHT },
    tags: ["district", "infill", archetype, ...(lot.corner ? ["corner"] : [])],
  };
}

/* -------------------------------------------------------------------------- */
/* the ruin roll (RUINS-PLAN-v0 §4.2)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Channels 41–49 are **reserved for the ruins feature**.
 *
 * Reusing an existing channel would correlate ruin with something else — `2` is
 * the archetype draw, and the prominence field owns others — which is a bug you
 * would only ever find by noticing that every tavern in the world is intact.
 */
const RUIN_ROLL_CHANNEL = 41;
/** Keyed on the **block's** min corner, not the lot's: whole blocks go. */
const RUIN_CLUSTER_CHANNEL = 42;
/** The band jitter, so a street is not uniformly derelict (§6). */
const RUIN_BAND_CHANNEL = 43;

/**
 * How far a block may lean away from the district's share.
 *
 * Independent per-lot rolls give salt and pepper; a real ruined city has whole
 * blocks gone and pockets standing. One extra positional draw at block scale
 * buys that, deterministically, for nothing — and it is clamped, so a block can
 * lean but never invert.
 */
const RUIN_CLUSTER_AMPLITUDE = 0.5;

/** What the roll decided for one lot: its band, and the dial the grammar takes. */
interface RuinRoll {
  readonly band: DecayBand;
  readonly intensity: number;
}

/**
 * Roll one infill lot into a ruin, or `null` to leave it standing.
 *
 * Every draw is keyed on a min corner and nothing else — no counter, no pass
 * order, no wall clock — which is `infillLot`'s own discipline and is what
 * makes the roll survive a landmark being added elsewhere in the district.
 *
 * The band travels to the grammar as `params.decay`, the same 0..1 scalar
 * §4.3 gives an author for ruining one named building. One authoring surface,
 * one seam, and the band table on the far side of it.
 */
function ruinDecayOf(
  lot: Lot,
  block: Block | undefined,
  stream: Seed256,
  share: number,
  decline: number,
): RuinRoll | null {
  if (share <= 0) return null;
  const cluster =
    block === undefined
      ? 0.5
      : positionFloat(stream, block.rect.x0, RUIN_CLUSTER_CHANNEL, block.rect.z0);
  // The lean, windowed so it cannot fight the ends of the dial. A raw
  // `clamp01(share + A · (cluster − 0.5))` leaves a low-cluster block standing
  // at `decline: 1.0` — five of sixty-four shells intact in a "dead city",
  // which is exactly the literal truth Kai's no-survivor-cap ruling asked for
  // and did not get. `4 · share · (1 − share)` is 1 in the middle of the dial,
  // where clustering is the whole read, and 0 at both ends, where the dial has
  // already said what it wants: nothing ruined, or nothing standing.
  const window = 4 * share * (1 - share);
  const local = Math.min(
    1,
    Math.max(0, share + RUIN_CLUSTER_AMPLITUDE * window * (cluster - 0.5)),
  );
  const roll = positionFloat(stream, lot.rect.x0, RUIN_ROLL_CHANNEL, lot.rect.z0);
  if (roll >= local) return null;
  const jitter = positionFloat(stream, lot.rect.x0, RUIN_BAND_CHANNEL, lot.rect.z0);
  const band = bandForDecline(decline, jitter);
  return { band, intensity: DECAY_BANDS[band].intensity };
}

/**
 * The archetype a lot takes: a positional draw over the mix, in declaration
 * order, skipping anything the lot is too narrow to build.
 *
 * The skip matters. A tall archetype on a nine-block frontage is a chimney, and
 * the grammar would build it — so the mix is walked from the drawn index
 * forward until something fits, and a lot that fits nothing is left open rather
 * than given a building it cannot hold.
 */
function pickArchetype(
  mix: readonly string[],
  across: number,
  stream: Seed256,
  x: number,
  z: number,
): string | null {
  if (mix.length === 0) return null;
  const start = positionInt(stream, x, 2, z, 0, mix.length - 1);
  for (let k = 0; k < mix.length; k++) {
    const name = mix[(start + k) % mix.length] as string;
    if (isHighriseArchetype(name) && across < HIGHRISE_MIN_WIDTH) continue;
    return name;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* seating a building on its lot                                               */
/* -------------------------------------------------------------------------- */

/** Face order for rotation: yaw 90 advances one step (north→east→south→west). */
const FACE_ORDER: readonly HorizontalFace[] = Object.freeze(["north", "east", "south", "west"] as const);

/**
 * The yaw that turns a node's front face towards `target`.
 *
 * This is the whole of "frontage-aligned": the solver's yaw was a free choice
 * scored against `facing`; here it is determined, because a lot has exactly one
 * street and the door goes on it.
 */
export function yawFacing(front: HorizontalFace, target: HorizontalFace): Yaw {
  const steps = (FACE_ORDER.indexOf(target) - FACE_ORDER.indexOf(front) + 4) % 4;
  return ((steps * 90) % 360) as Yaw;
}

/**
 * Seat a `w × d` footprint against the lot's build-to line.
 *
 * The build-to line is the lot edge on the street side, one sidewalk band off
 * the carriageway: the facade sits *on* it, which is what makes a street wall
 * rather than a row of houses at random setbacks. Along the frontage the
 * building is centred, and centred with `floor` so two neighbours never
 * disagree about which column the seam falls on.
 */
export function seat(lot: Rect, face: HorizontalFace, w: number, d: number): Rect {
  const lotW = lot.x1 - lot.x0 + 1;
  const lotD = lot.z1 - lot.z0 + 1;
  const cx = lot.x0 + Math.floor((lotW - w) / 2);
  const cz = lot.z0 + Math.floor((lotD - d) / 2);
  switch (face) {
    case "north":
      return { x0: cx, z0: lot.z0, x1: cx + w - 1, z1: lot.z0 + d - 1 };
    case "south":
      return { x0: cx, z0: lot.z1 - d + 1, x1: cx + w - 1, z1: lot.z1 };
    case "west":
      return { x0: lot.x0, z0: cz, x1: lot.x0 + w - 1, z1: cz + d - 1 };
    default:
      return { x0: lot.x1 - w + 1, z0: cz, x1: lot.x1, z1: cz + d - 1 };
  }
}

/* -------------------------------------------------------------------------- */
/* the ground, as a form reads it                                              */
/* -------------------------------------------------------------------------- */

/** `terrain_conform` modes that level the ground under a footprint. */
const LEVELLING_MODES: ReadonlySet<string> = new Set(["flatten", "cut_fill", "terrace"]);

/** Whether the solver's pad has already flattened this district's ground. */
function conformLevels(node: DistrictNode): boolean {
  let mode = "cut_fill";
  for (const c of node.constraints ?? []) {
    const raw = c as unknown as Record<string, unknown>;
    if (raw["type"] !== "terrain_conform" && !("terrain_conform" in raw)) continue;
    const named = raw["mode"] ?? raw["terrain_conform"];
    if (typeof named === "string") mode = named;
  }
  return LEVELLING_MODES.has(mode);
}

/**
 * The ground under a domain, as a {@link GroundSample}.
 *
 * Built **once** by the caller and handed to the form, which is the whole point
 * of the accessor: the field's region, the plan's region and the district's
 * bounds are three different coordinate domains, `city.ts` carries a comment
 * about how expensive that confusion is, and one object built here removes the
 * index bug from six form modules. Outside the domain every accessor clamps to
 * the edge, so a form that reads one column past its own boundary gets a
 * plausible answer rather than a zero.
 */
export function sampleGround(
  input: DistrictPassInput,
  bounds: Rect,
  node: DistrictNode,
  cell: boolean,
  groundPolicy: DistrictGroundPolicy,
): GroundSample {
  const region = input.field.region;
  const at = (x: number, z: number): number => {
    const i = Math.min(region.width - 1, Math.max(0, x - region.x0));
    const j = Math.min(region.depth - 1, Math.max(0, z - region.z0));
    return input.field.values[j * region.width + i] as number;
  };
  const clampX = (x: number): number => Math.min(bounds.x1, Math.max(bounds.x0, x));
  const clampZ = (z: number): number => Math.min(bounds.z1, Math.max(bounds.z0, z));
  const height = (x: number, z: number): number => Math.round(at(clampX(x), clampZ(z)));
  const wet = (x: number, z: number): boolean => {
    if (input.water === undefined) return false;
    const i = Math.min(region.width - 1, Math.max(0, clampX(x) - region.x0));
    const j = Math.min(region.depth - 1, Math.max(0, clampZ(z) - region.z0));
    return input.water[j * region.width + i] === 1;
  };

  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let waterReach = Number.POSITIVE_INFINITY;
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cz = (bounds.z0 + bounds.z1) / 2;
  const half = Math.max((bounds.x1 - bounds.x0) / 2, (bounds.z1 - bounds.z0) / 2);
  // One sweep of a generous box around the domain: the height range inside it,
  // and the Chebyshev distance from the domain's edge out to the nearest water.
  const margin = 24;
  for (let z = bounds.z0 - margin; z <= bounds.z1 + margin; z++) {
    for (let x = bounds.x0 - margin; x <= bounds.x1 + margin; x++) {
      const inside = x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;
      if (inside) {
        const h = Math.round(at(x, z));
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
      if (!wet(x, z)) continue;
      const d = Math.max(0, Math.round(Math.max(Math.abs(x - cx), Math.abs(z - cz)) - half));
      if (d < waterReach) waterReach = d;
    }
  }
  const relief = lo === Number.POSITIVE_INFINITY ? 0 : hi - lo;

  return {
    height,
    water: wet,
    slope: (x, z) =>
      Math.max(
        Math.abs(height(x + 1, z) - height(x, z)),
        Math.abs(height(x - 1, z) - height(x, z)),
        Math.abs(height(x, z + 1) - height(x, z)),
        Math.abs(height(x, z - 1) - height(x, z)),
      ),
    relief,
    // A *cell* of a city plan is drawn before its own pads reach the field (a
    // city gets no city-wide pad at all), so its ground is the real ground. An
    // authored district's has already been levelled by the solver — unless its
    // `terrain_conform` says otherwise, or its ground policy told `padFor` to
    // lay no pad at all.
    //
    // That last clause **reads the resolved policy** rather than re-deriving it
    // from `relief <= 1` (§9.9). The old test got the right answer by accident,
    // because real slope has relief above 1 — but it was a second answer to a
    // question `districtGroundPolicy` already answers, and a `"stepped"` quarter
    // that happened to be flat would have been told its ground was levelled when
    // no pad had been laid under it. One question, one answer.
    levelled: !cell && groundPolicy === "pad" && conformLevels(node),
    waterReach,
    ...(input.seaLevel === undefined ? {} : { seaLevel: input.seaLevel }),
  };
}

/** Median ground height under a rectangle of the composed field. */
/**
 * The relief of the ground under a rectangle, in blocks.
 *
 * Two callers, and they are the same measurement: the `DISTRICT_GROUND` note,
 * which has to say *what was measured* rather than "the ground was flat"; and
 * the relief election (`STEP_RELIEF`), from both {@link districtGroundPolicy}
 * and `padFor`. Max minus min over the rect, rounded per column — the crudest
 * statistic that answers "is this one plane or a hillside", and deliberately
 * not a gradient: a quarter is levelled or stepped as a whole, so the question
 * is about the whole.
 */
export function reliefOf(field: HeightField, rect: Rect): number {
  const region = field.region;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      const h = Math.round(field.values[j * region.width + i] as number);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return hi < lo ? 0 : hi - lo;
}

export function medianGround(field: HeightField, rect: Rect): number {
  const region = field.region;
  const heights: number[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      heights.push(field.values[j * region.width + i] as number);
    }
  }
  if (heights.length === 0) return 0;
  heights.sort((a, b) => a - b);
  // floor, not round: the materialisation rule. Rounding the continuous median
  // up on a half-block field seated the quarter's pads and open ground one
  // above the street datum (the 8F report named this line "itself a one-block
  // lip generator"); the solver's referenceY made the same move in e29b0b9.
  return Math.floor(heights[heights.length >> 1] as number);
}

/* -------------------------------------------------------------------------- */
/* S9 — a served seam publishes its landings, and the stair belongs to the seam */
/* -------------------------------------------------------------------------- */

/**
 * One **landing** of a served seam — `docs/GROUND-UNIFICATION-v0.md` §4.1 S9.
 *
 * A tier stack's treads, and a wall's own top and foot, are the ground a body
 * can stand on and walk off inside a seam. They are published rather than
 * re-derived because the two consumers below cannot compute them: the stair
 * derivation would have to re-run the stack's distance field, and the doorstep
 * foot gate would have to guess a tread apart from a bank face by its height,
 * which is exactly the guess S10 exists to remove.
 *
 * World columns, not region indices: the producer works in the plan region, the
 * stair derivation works in the quarter's own bounds, and the foot gate works in
 * the region again. One coordinate system all three already speak.
 */
export interface SeamLanding {
  /**
   * The landing's level, in the plan's own convention — the same number a
   * `GroundClaim` carries and the same number the ground view reports, so a
   * consumer compares it against `view.ground` without a conversion.
   */
  readonly y: number;
  /** The landing's columns, ascending row-major over the plan region. */
  readonly columns: readonly Point2[];
}

/**
 * Every landing one served seam published, **bottom landing first**.
 *
 * A tier stack's is its foot, then one entry per tread, then the platform it
 * holds; a single wall's is its foot and its top, which is the same list with
 * nothing between. So `landings[0]` is always the low side and
 * `landings[landings.length - 1]` always the high one, and a flight is derived
 * from the two ends without knowing which construction served the seam.
 */
export interface SeamLandingStack {
  /** `<nodePath>#tiers@<job>` — the producer's own claim source. */
  readonly source: string;
  readonly nodePath: string;
  readonly landings: readonly SeamLanding[];
}

/** What a served seam publishes: `RetainingPassResult.landings` (S9). */
export type SeamLandings = readonly SeamLandingStack[];

/**
 * Flights derived per quarter, at most — `docs/COURTYARDS-AND-LEVELS-v0.md`
 * §3.5 step 2's cap, which has never had an implementation to bound.
 *
 * Twelve because `intersectionsOf` is O(n²) in segments and a quarter's graph is
 * already tens of them; and because a quarter that needs more than twelve
 * derived flights has a level election problem, not a stair problem, and S6's
 * dissolve is the answer to that one.
 */
export const MAX_DERIVED_STAIRS = 12;

/**
 * How far from a landing a street column may stand and still be the thing the
 * flight lands on.
 *
 * Six, `DOORSTEP_REACH`'s number for the same reason: past six columns the
 * flight is not arriving at the street, it is a second street drawn beside it.
 * Where a street is in reach the flight's path is carried onto it, so the tread
 * law gets a **pin** at that end and the flight lands at the street's own level
 * rather than at whatever the ground under its last tread happened to be.
 */
export const SEAM_STAIR_JOIN = 6;

/** Everything {@link deriveSeamStairs} reads. */
export interface SeamStairInput {
  readonly nodePath: string;
  /** {@link SeamLandings} — what the retaining pass published for this quarter. */
  readonly landings: SeamLandings;
  /** True on a column the quarter's street network already owns. */
  readonly onStreet: (x: number, z: number) => boolean;
  /**
   * True on a column of a face a **solved descent claims** —
   * `docs/DESCENT-SOLVE-v0.md` §5.3.
   *
   * > S9 may **not** cut a flight through a claimed face. Where a landing
   * > stack's two ends sit on opposite sides of one, the demand belongs to the
   * > descent as a branch (§2.5) and S9 emits nothing for that stack; every
   * > other stack is unchanged and {@link MAX_DERIVED_STAIRS} is unaffected.
   *
   * The orphan class then dies **by construction** rather than by a guard: §2.5's
   * invariant is *a landing exists iff the run it belongs to exists*, and on a
   * claimed face the descent is the only producer of either. A landing stack S9
   * publishes a flight for and the rank table then severs is exactly the
   * "stairs to nowhere" defect — and on a claimed face there is now no second
   * producer left to publish one.
   *
   * A predicate rather than a mask because a `DescentDatum` is per quarter and
   * this pass is per quarter: the caller closes over its own datum, and nothing
   * here has to know how a descent is indexed. Absent — which is every caller
   * while `DESCENT_SOLVE` is off — and the pass is byte-for-byte the shipped
   * one: not one column is asked about.
   */
  readonly claimed?: (x: number, z: number) => boolean;
  /**
   * Per-district flag, defaulting to the compile-time {@link SEAM_TIERS}.
   *
   * The field exists for the reason `PlatformInput.tiered` exists: a test asks
   * one quarter for the flag-on world without flipping the world's flag, which
   * 11F does on a walk verdict and nothing else.
   */
  readonly tiered?: boolean;
}

/** What {@link deriveSeamStairs} cut. */
export interface SeamStairResult {
  /**
   * The derived flights, as ordinary `role: "steps"` segments — appended to the
   * quarter's graph **before surfacing**, which is the whole of S9's mechanism.
   */
  readonly segments: readonly StreetSegment[];
  /** Flights cut. */
  readonly cut: number;
  /** Stacks the {@link MAX_DERIVED_STAIRS} cap refused a flight. */
  readonly refused: number;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * The landing column a flight starts or ends on: **the one nearest a street
 * column**, and the street column it is nearest to.
 *
 * Row-major over the landing's own columns and ties broken on the first, which
 * is the determinism rule every other seam walk in the compiler uses. The
 * street search is a diamond of radius {@link SEAM_STAIR_JOIN} rather than a
 * BFS because the answer only has to be *a* nearest street column, and Manhattan
 * distance over a diamond is the same order as the reach it is capped at.
 */
function landingAnchor(
  landing: SeamLanding,
  onStreet: (x: number, z: number) => boolean,
): { readonly at: Point2; readonly street: Point2 | null } | null {
  let best: { at: Point2; street: Point2 | null } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const column of landing.columns) {
    for (let d = 0; d <= SEAM_STAIR_JOIN && d < bestDistance; d++) {
      let found: Point2 | null = null;
      for (let dz = -d; dz <= d && found === null; dz++) {
        const dx = d - Math.abs(dz);
        for (const sx of dx === 0 ? [0] : [-dx, dx]) {
          const p = { x: column.x + sx, z: column.z + dz };
          if (onStreet(p.x, p.z)) {
            found = p;
            break;
          }
        }
      }
      if (found === null) continue;
      best = { at: column, street: found };
      bestDistance = d;
      break;
    }
    if (best === null) best = { at: column, street: null };
  }
  return best;
}

/**
 * **S9** — one flight per served seam, registered as a street segment.
 *
 * The flight runs from the bottom landing to the top one, at the tread column
 * nearest a street column on each side, carried onto those street columns where
 * they are within {@link SEAM_STAIR_JOIN}. That is the whole derivation, and it
 * deliberately adds **no stair code at all**: what comes back is an ordinary
 * `role: "steps"` segment, so `structures/street-stairs.ts` lays it under its
 * existing tread law (`need[k] = max(g[k] + 1, need[k+1] − 1)`) and refuses it
 * whole where it cannot be made climbable. Half a staircase ending in a
 * two-block hop is worse than no staircase, and that judgement already has one
 * implementation.
 *
 * Pure and order-independent: the stacks arrive in the retaining pass's own
 * row-major seam order, every anchor is the first column at the minimum
 * distance, and the cap takes a prefix of that order. Empty — and allocating
 * nothing — for every quarter whose seams published no landings, which is every
 * quarter until {@link SEAM_TIERS} flips.
 */
export function deriveSeamStairs(input: SeamStairInput): SeamStairResult {
  const empty = { segments: [], cut: 0, refused: 0, diagnostics: [] };
  if (!(input.tiered ?? SEAM_TIERS)) return empty;
  if (input.landings.length === 0) return empty;

  const segments: StreetSegment[] = [];
  let refused = 0;
  for (const [n, stack] of input.landings.entries()) {
    // A seam with one landing is a kerb or a face nothing stands on: there is
    // nothing to climb between, and a one-landing "flight" is a paved patch.
    if (stack.landings.length < 2) continue;
    const first = stack.landings[0] as SeamLanding;
    const last = stack.landings[stack.landings.length - 1] as SeamLanding;
    if (first.columns.length === 0 || last.columns.length === 0) continue;
    if (segments.length >= MAX_DERIVED_STAIRS) {
      refused++;
      continue;
    }
    const foot = landingAnchor(first, input.onStreet);
    const head = landingAnchor(last, input.onStreet);
    if (foot === null || head === null) continue;
    if (foot.at.x === head.at.x && foot.at.z === head.at.z) continue;
    const raw: Point2[] = [
      ...(foot.street === null ? [] : walkLine(foot.street, foot.at)),
      ...walkLine(foot.at, head.at),
      ...(head.street === null ? [] : walkLine(head.at, head.street)),
    ];
    const path = densify4(raw);
    if (path.length < 2) continue;
    // §5.3. A flight that touches a claimed face is a second staircase down a
    // cliff that already has one, drawn by a pass that cannot see the cliff —
    // the exact shape of S4's defect. The descent owns that demand (as its
    // trunk or as a branch joining at a landing), so S9 emits nothing for this
    // stack. The cap is untouched: a stack that yields here never became a
    // flight, so it never spent one.
    if (input.claimed !== undefined && path.some((c) => input.claimed?.(c.x, c.z) === true)) continue;
    segments.push({
      id: `sst${n}`,
      kind: "lane",
      width: STREET_WIDTH.lane,
      path,
      role: "steps",
    });
  }

  const diagnostics: LoamDiagnostic[] = [];
  if (segments.length + refused > 0) {
    diagnostics.push(
      note(
        "SEAM_STAIR_CUT",
        input.nodePath,
        `${segments.length} flight(s) cut through the served seams of "${input.nodePath}" and registered as "steps" segments before surfacing` +
          (refused === 0
            ? ""
            : `; ${refused} more stack(s) got none — the ${MAX_DERIVED_STAIRS}-flight cap`),
        refused === 0
          ? "No action needed."
          : `No action needed, unless a platform came out unreachable on a walk: a quarter needing more than ${MAX_DERIVED_STAIRS} derived flights is stepping more times than its ground can carry, and "params.blockSize" is the knob that changes that.`,
      ),
    );
  }
  return { segments, cut: segments.length, refused, diagnostics };
}
