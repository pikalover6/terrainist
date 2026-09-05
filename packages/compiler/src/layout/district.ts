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
  yawBetween,
  type Cardinal,
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
} from "@terrainist/spec/ir";

import { fanOut } from "../intent/index.js";
import {
  compilerIntentFor,
  resolveCompilerIntents,
  type CompilerResolvedIntent,
} from "../intent/compiler-resolved.js";
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
import { Grid, dilateGrid } from "./district-grid.js";
import { deriveInfillStage, infillLot, ruinDecayOf } from "./district-infill.js";
import { LOT_DEPTH, LOT_FRONTAGE, LOT_COVERAGE, LOT_SIDE_GAP, INFILL_FLOORS, FLOOR_HEIGHT, BUILDING_APRON, MIN_INFILL_SIDE, MAX_INFILL_DEPTH, MAX_LANDMARK_RUN, STREET_PROBE_SLACK } from "./district-constants.js";
import { leafBlockCap, MAX_ALLEY_ROUNDS, WALLED_COVERAGE_FLOOR, blocksOf, cutDeepBlocks, SEAM_BLOCK_MIN_DROP, boundingSeams, rectsOf, largestFreeRect, deriveBlockStage } from "./district-blocks.js";
import type { Block } from "./district-blocks.js";
import { SIDES, LOT_PARCEL_OWN_STATIONS } from "./district-lots.js";
import type { Lot, BlockSite, Subdivision, FrontageWalk } from "./district-lots.js";
import { segmentOwners, subdivide, frontageLots, allocateFrontage, bestSide, inLotSpan, middleOut, subdivideLots } from "./district-lots.js";
import { type Landmark, type BuiltLot, frontAnchorOf, frontageOf, yawFacing, envelopeSize, seat, placeLandmarks } from "./district-landmarks.js";
import { TERRACE_MAX_FRONTAGE, TERRACE_PASSAGE, TERRACE_MIN_LOTS, TERRACE_COVERAGE, planTerraces } from "./district-terraces.js";
import type { Terrace } from "./district-terraces.js";
import { compositionOf, planQuarter, MAX_REPLAN_ROUNDS, COMPOSITION_GATES, WALL_COLUMNS_PER_DWELLING, type Composition, type PlannedQuarter } from "./district-replanning.js";




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
import { frontFace, rectAt, resolvePorts, rotatedSize } from "./ports.js";
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
  CORNER_TOLERANCE,
  DESCENT_SOLVE,
  FRONTAGE_RISE,
  STREET_PLANE_FLANK_PROBE,
  STREET_PLANE_MIN_FLANK,
  STREET_PLANE_MIN_RUN,
  makePlacement,
  type LayoutNodeInput,
  type PadEdit,
  type Placement,
  type ResolvedPort,
} from "./types.js";

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
 * compiled against the historical document `trojan_horse_in_troy`
 * (`grown` × `medium` × 220 × 200, tie2 generation), it cuts two blocks and the quarter gets
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
/* leafBlockCap, MAX_ALLEY_ROUNDS, WALLED_COVERAGE_FLOOR moved to district-blocks.ts — re-exported above */

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

/** Did this quarter ask to be walled? `params.walls` is the one spelling. */
function walledQuarter(params: DistrictParams): boolean {
  return params.walls !== undefined;
}

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
 * check 2 is a count of *buildings*, and this is
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
 * 12C).
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
   * the harmonizer's +1 road lip.
   *
   * Absent while the flag is off, and absent on a quarter where no segment's
   * flanks asked for a drop, so a report golden only moves where the world
   * does. Report-only, exactly as {@link DistrictStats.planeTie} is.
   */
  readonly streetHarmonize?: StreetHarmonizeStats;
  /**
   * **§2.7's explanation record**, per quarter —
 * "without this record the design is not
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
 * The graded elevation of those streets —,
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
   * `FRONTAGE_TIE` is on, so a quarter with a street graph grades a datum and
   * this field carries it into the surfacer. It is absent only where nothing was
   * graded — no street graph — and there the surfacer's datum path is unused.
   */
  readonly datum?: StreetDatum;
  /**
   * **The fifth datum** — every descent this quarter's network makes
 *, solved in pass 4 against the very field
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
 *. Absent — not empty — for every
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
 * one.
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
 * The transitions the site planner declared.
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
 * **The pure terrain** — pristine
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
   * True when the *city* this cell was cut from declared `params.walls`.
   *
   * The synthetic cell node carries no `walls` of its own — the circuit is the
   * city's — so without this the walled-coverage guard (`LOAM-W527`) saw a
   * city walled by `params.walls` only through the intent's `fortification`
   * (the Stocktake Run's census, class 1.17, 2026-08-25).
   */
  readonly walled?: boolean;
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
  _doc: SettlementDocument,
  node: DistrictNode,
  _nodePath: string,
): DistrictFabric {
  return node.params.fabric as DistrictFabric;
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
 * An explicit `params.ground` outranks what the form implies. The form's
 * implication is `"benched"` exactly when the resolved form declares
 * `requires.unlevelled` — the form registry is the one place that knows, so
 * nothing here enumerates form ids — and `"pad"` otherwise.
 *
 * `"benched"` is what this function returned as `"stepped"` before Phase 4.2.
 * The rename is what keeps `terraced` byte-identical: `padFor` returns null for
 * both, and the *new* `"stepped"` — derived platforms, retaining walls, derived
 * stairs — is a thing a document asks for by name
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
  // A form that cuts its own benches wants the seams between them treated
  // (benched → stepped); otherwise the relief election refines the implication.
  const resolved: DistrictGroundPolicy = implied === "benched" ? "stepped" : implied;
  if (resolved !== "pad" || site === undefined) return resolved;
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
 * False the moment anything *asked* for a ground — `params.ground`, or a form
 * that cuts its own benches — because an answered question is not re-opened by
 * the terrain.
 */
export function districtGroundElectable(
  doc: SettlementDocument,
  node: DistrictNode,
  nodePath: string,
): boolean {
  if (node.params.ground !== undefined) return false;
  return districtGroundPolicy(doc, node, nodePath) === "pad";
}


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
  // Grounded intent — spec owns author catalog (urbanForm, ground,
  // courtyards, fortification, formPacks) and stdlib only for members;
  // diagnostics W487/W488/W489/W516/W517 live on the grounded per-scope
  // record, not re-parsed here. Remaining rows (density, streetWidth,
  // blockSize, etc.) still fan out but from the same base intent.
  const grounded = compilerIntentFor(resolveCompilerIntents(input.doc), nodePath);
  // Reuse the same object for fanOut rows that still read raw dials (wealth,
  // formality, decline) — CompilerResolvedIntent extends ResolvedIntent.
  const intent: CompilerResolvedIntent = grounded;
  // `character.archetypes` → the mix every archetype draw in this quarter takes
  // (`layout/mix-intent.ts`). This is the single point: both the terrace runs
  // and the per-lot infill read `params.mix` from here, now via grounded packs.
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
  const requested = p.fabric as DistrictFabric;
  const replanned = planQuarter(
    {
      bounds,
      fabric: requested,
      nodePath,
      seed,
      blockSize: fanOut<number>(LAYOUT_ROWS.blockSize, intent, {
        nodePath,
        today: cell?.blockSize ?? p.blockSize ?? defaultBlockSize(density, p.courtyards),
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
  // Grading a datum nobody
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
  // that could drift from it (the street harmonization).
  const datumInput = (against: StreetGraph): StreetDatumInput =>
    ({
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
      });
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
  let sidewalk = dilateGrid(grid, carriageway, sidewalkWidth);

  // --- the fifth datum: the descent solve -----------------------------------
 // **Pass 4, after `gradeStreetDatum` and
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
 // The form's benches *are* the
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
  // The ground-plane tie is unconditional, and G9's implication is why the datum is
  // `gradeDatum` may still return `null` — a quarter with no street graph
  // grades no datum — and then there is nothing to anchor on.
  const planeTie = true;
  const tieDatum = datum;
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
 // S6 rule 3 : the election may not elect
  // a pair whose seam it would not pay for. A pair past
  // `SEAM_TIER_MAX · RETAIN_MAX` dissolves — the higher platform gives its level
  // back to the lower — and the quarter ships with fewer levels rather than with
  // a level nothing can serve. This is the first caller `LOAM-W410` has ever had.
  const election =
    groundPolicy === "stepped" && elected.length > 1
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
  // A bench that is mostly water is not graded — Kai's ruling, 2026-08-24.
  // The waterline floor exempted it so a river keeps its bed, and the quarter
  // then *graded* it to that bed; a pad edit over water drains the water, so a
  // bay inside a quarter shipped as a dry trench two below the sea (69 columns
  // at 61 against the sea at 63 on that troy, `LOAM-T110 UNSTABLE_FLUID`).
  // The bench stays in the election and in `levels`: the fabric's lookups,
  // the seams and the lot seating read it exactly as before (a bench with a
  // level is what keeps lots and verges out of the water — dropping it put
  // them in the river). Only its `quarter.plane` pad edits are withheld, so
  // its columns keep the pristine terrain and the water on it. Read straight
  // off the classification's water, not off `protectedWater`, which is only
  // computed where the quarter would dam: whether a bench *is* water does not
  // depend on whether grading it would dam.
  const submergedPlatforms: readonly boolean[] =
    input.water !== undefined && election.benches.length > 0
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

  // --- the street harmonization ---------------------------------------------
  // **The call point, and why it is here.** The datum grades ~200 lines above,
  // at the moment the graph is drawn (F2), which is a full substage before the
  // election exists — that is the whole mechanism behind Kai's walked lip: the
  // election pays a frontage cost to agree with the street
 // and the street never reciprocates. So
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
    if (d === null || levels === null) return d;
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
  //
  // A seam shallower than {@link SEAM_BLOCK_MIN_DROP} is dressed but does not
  // bound a block: a kerb is a step a lot walks over, not a wall between two
  // lots (see the constant).
  for (const seam of boundingSeams(seams)) {
    for (const point of seam.cells) {
      const k = grid.index(point.x, point.z);
      if (k >= 0) blocked[k] = 1;
    }
  }
  // A form that cut its own benches hands the subdivision curved bands; see
  // `rectsOf`. Everything else keeps one rectangle per block, unchanged.
  //
 // **Unless the form planned its own frontage**.
  // For columns inside a planned strip the chain `blocksOf` → `rectsOf` →
  // `largestFreeRect` → `subdivide` is replaced by {@link frontageLots}, and
  // outside strips there are no blocks at all, because there is no platform and
  // no ground a lot may take. The gate is `plan.strips`, which only `hillside`
  // sets, so no other form moves.
  const planned = plan.strips;
  // The form's own per-event notes (`FormPlan.notes`) — today the site plan's
  // `SITE_STRIP_DISSOLVED`, one per strip §3.7 gave back.
  for (const n of plan.notes ?? []) diagnostics.push(note(n.name, nodePath, n.message, n.fix));

  // --- the leaf cap ---------------------------------------------------------
  // Every block that is too deep for `subdivide` to reach the middle of gets an
  // alley through it, recursively, until none is (see {@link leafBlockCap}).
  // Skipped whole on the planned path, where the planner cut the frontage
  // itself and there are no blocks; and a no-op — not one column moved, not one
  // segment added — for every quarter already under the cap, which is every
  // pitch-laid fabric in the repository.
  // Every block is cut into as many rectangles as it holds, not just a benched
  // one — `rectsOf` takes the rest of a component that streets or platform
  // seams cut into an L, ground no lot was ever cut from (the deep-block
  // deficit; corrected at the Stocktake Run, 2026-08-25: a grid quarter on a
  // shelf moves too, so this is not pitch-laid-safe by construction).
  // --- block derivation stage (narrow input/result, ownership explicit) ---
  // `cutDeepBlocks` mutates carriageway/blocked in place per original contract;
  // ownership is handed through result without copying typed arrays.
  const blockResult = deriveBlockStage({ grid, carriageway, blocked, sidewalk, graph, density, sidewalkWidth, bounds, hasPlanned: planned !== undefined });
  const blocks = blockResult.blocks;
  graph = blockResult.graph;
  sidewalk = blockResult.sidewalk;
  if (blockResult.lanes.length > 0) {
    datum = harmonize(graph, gradeDatum(graph));
    diagnostics.push(
      note(
        "DISTRICT_BLOCK_ALLEY",
        nodePath,
        `${blockResult.lanes.length} block(s) in "${nodePath}" were wider than the ${leafBlockCap(density, sidewalkWidth)} columns past which an alley pays for itself at "${density}", and were cut by one so their cores became frontage`,
        `Nothing to change in the document — an alley through an over-deep block is the intended repair. Lower "params.blockSize" if you would rather the fabric drew the streets itself.`,
      ),
    );
  }

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

  // --- lot subdivision stage (narrow input/result, no shared mutable context) ---
  const __lotStage = (() => {
    const plazaBlockForLots = plazaBlock;
    const courtyardShareForLots = p.courtyards ?? 0;
    const courtyardStreamForLots = streamSeed(seed, "courtyard");
    const result = subdivideLots({
      blocks,
      grid,
      blocked,
      graph,
      density,
      sidewalkWidth,
      courtyardShare: courtyardShareForLots,
      courtyardStream: courtyardStreamForLots,
      benched: declared.length > 0,
      ...(planned === undefined ? {} : { plannedStrips: planned }),
      plazaBlock: plazaBlockForLots,
    });
    // Preserve original variable names expected downstream
    return result;
  })();
  const lots = __lotStage.lots as Lot[];
  const blockSites = __lotStage.blockSites as BlockSite[];
  const frontage = __lotStage.frontage;
  // Destructure stage diagnostics ownership (courtyard rejects etc. handled via result)
  const courtyardPlans = __lotStage.courtyardPlans;
  const courtyardRejects = __lotStage.courtyardRejects;
  const preferAt = __lotStage.preferAt;
  const courtyardShare = p.courtyards ?? 0;
  let dropped = __lotStage.dropped;
  let plazaLots = __lotStage.plazaLots;
  // --- landmark placement stage (narrow input/result, explicit ownership) ---
  const __landmarkStage = placeLandmarks({
    node,
    nodePath,
    worldSeed: input.worldSeed,
    lots,
    blockSites,
    claimed: new Set<string>(),
    built: [] as BuiltLot[],
    ...(cell?.landmarkBase === undefined ? {} : { landmarkBasePath: cell.landmarkBase }),
  });
  let claimed: Set<string> = __landmarkStage.claimed;
  // `built` is mutable for later terrace/infill stages; ownership handed through results
  let built: BuiltLot[] = __landmarkStage.built;
  // Diagnostics ownership explicit — stage returns diagnostics slice, preserve order
  diagnostics.push(...__landmarkStage.diagnostics);
  const unplaced = __landmarkStage.unplaced;
  // `landmarks` count for stats
  const landmarksCount = __landmarkStage.landmarks;

  const landmarks: readonly unknown[] = Array.from({ length: landmarksCount }, (_, i) => i);
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

  // --- terrace planning stage (narrow input/result, no mutable out-param for passages) ---
const __terraceStage = planTerraces({
    lots,
    claimed,
    params: p,
    nodePath,
    worldSeed: input.worldSeed,
    districtSeed: seed,
    preferAt,
    storeyCeiling,
    built,
  });
  const terraces = __terraceStage.terraces as typeof __terraceStage.terraces;
  const courtyardPassages = __terraceStage.passages;
  // Ownership handed through results without copying typed arrays
  claimed = __terraceStage.claimed;
  built = __terraceStage.built;
  let terraceBays = 0;
  let terraceLots = 0;
  for (const t of terraces) {
    terraceBays += t.bays;
    terraceLots += t.lots.length;
  }

  // --- the ruin roll (RUINS-PLAN-v0 WP-3, §4.2) ----------------------------
  // `decay.ruinShare` is total and reads `today = 0`, so a district with no
  // `decline` — and every district with a `decline` below `RUIN_ONSET` — rolls
  // nothing and compiles byte-identically to before this row existed.
  // --- infill stage (narrow, extracted wholesale) ---
  const _share = fanOut<number>(LAYOUT_ROWS.ruinShare, intent, { nodePath, today: 0 });
  const _declineOf = intent.intent.decline ?? 0;
  const infillResult = deriveInfillStage({
    lots,
    blocks,
    grid,
    blocked,
    claimed,
    built,
    p,
    infillStream,
    prominence,
    share: _share,
    declineOf: _declineOf,
    bandCounts: new Map<DecayBand, number>(),
    rolled: 0,
    ruined: 0,
    dropped,
    plazaBlock,
    courtyardPlans,
    hasPlanned: planned !== undefined,
    seed,
    intent,
    walled: walledQuarter(p),
    nodePath,
    worldSeed: input.worldSeed,
    terraces,
    ...(cell?.minBuilding === undefined ? {} : { minBuilding: cell.minBuilding }),
  });
  // Delete inline copy — this call is now single source
  const share = _share;
  const declineOf = _declineOf;
  let infilled: number = infillResult.infilled;
  let bareBlocks: number = infillResult.bareBlocks;
  let redrawnBlocks: number = infillResult.redrawnBlocks;
  const dressedBlocks: DressedBlock[] = infillResult.dressedBlocks;
  const bandCounts: Map<DecayBand, number> = infillResult.bandCounts;
  let rolled: number = infillResult.rolled;
  let ruined: number = infillResult.ruined;
  let terraceRuined: number = infillResult.terraceRuined;
  let terraceRolled: number = infillResult.terraceRolled;
  // Explicit ownership handoff for claimed/built/dropped — stage transfers owned mutable values, no copy
  claimed = infillResult.claimed;
  built = infillResult.built;
  dropped = infillResult.dropped;
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
          `${ruined} of ${rolled} infill lots roll into ruined shells (${histogram})` +
          // The denominator the sentence used to hide (Stocktake unit 26, F22):
          // the roll is per infill lot, and a grid district is mostly terraces,
          // which never roll — and whose archetype has no shell decay mode.
          (terraceLots > 0
            ? `; ${terraceRuined} of ${terraceRolled} terrace run${terraceRolled === 1 ? "" : "s"} (${terraceLots} lot${terraceLots === 1 ? "" : "s"}) roll into ruined shells, bay by bay`
            : ""),
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
      // A submerged bench is not graded: the water keeps its bed; see the election.
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
  // The guard protects a wall; a seam below {@link SEAM_BLOCK_MIN_DROP} has
  // none and may run under a lot, whose apron blends as any lot's does.
  for (const seam of boundingSeams(seams)) {
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

  /**
   * Whether a seated building footprint occupies water in the pristine
   * classification. A footprint pad replaces fluid with solid ground; if that
   * ground is below the waterline it opens the neighbouring water column on the
   * first tick. The classification, not the mutable plan, is the stable answer.
   */
  const footprintIsWet = (rect: Rect): boolean => {
    if (input.water === undefined) return false;
    const region = input.field.region;
    for (let z = rect.z0; z <= rect.z1; z++) {
      const j = z - region.z0;
      if (j < 0 || j >= region.depth) continue;
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = x - region.x0;
        if (i >= 0 && i < region.width && input.water[j * region.width + i] === 1) return true;
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
    // The frontage tie is unconditional, so `datum` is non-null for a quarter with a
    // street graph and `tied` is the frontage answer for a lot that fronts one.
    // `tied` stays `undefined` on the untied path — no datum, or a lot with no
    // street — and there the `??` chain below is the untied-lot expression,
    // character-for-character the one that shipped before the tie.
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
    const requestedFoundationY =
      seatOnPlane(planeY) ?? cell?.foundationY ?? tied ?? medianGround(input.field, rect);
    // Reclamation is legal; a dry hole below standing water is not. Holding
    // only wet footprints to the waterline leaves every inland seat unchanged.
    const foundationY =
      footprintIsWet(rect) && input.seaLevel !== undefined
        ? Math.max(requestedFoundationY, input.seaLevel)
        : requestedFoundationY;
    const made: Placement = makePlacement({
      nodePath: item.nodePath,
      id: item.id,
      yaw,
      mirror: false,
      size: [rw, rh, rd],
      footprint: rect,
      anchor: { x: rect.x0 + ((rw - 1) >> 1), z: rect.z0 + ((rd - 1) >> 1) },
      foundationY,
    });
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
  //
  // **On the planned path too** (the Stocktake Run, 2026-08-25): the guard was
  // gated `planned === undefined` and so blind on `hillside` — the form every
  // walled hill town gets — while montfort_hill_k1 shipped a keep and a
  // handful of houses inside a full circuit with this warning silent. A
  // planned quarter has no blocks; its land is every column the streets did
  // not take, natural ground included, because the natural ground inside the
  // wall is exactly the sparse part.
  if ((walledQuarter(p) || cell?.walled === true) && (planned === undefined ? blocks.length > 0 : true)) {
    let blockLand = 0;
    if (planned === undefined) {
      for (const block of blocks) blockLand += block.columns;
    } else {
      for (let k = 0; k < grid.cells; k++) {
        if (carriageway[k] !== 1 && sidewalk[k] !== 1) blockLand++;
      }
    }
    let builtColumns = 0;
    for (const item of built) {
      builtColumns += (item.rect.x1 - item.rect.x0 + 1) * (item.rect.z1 - item.rect.z0 + 1);
    }
    const coverage = blockLand === 0 ? 0 : builtColumns / blockLand;
    const land = planned === undefined ? "block column(s)" : "column(s) of land inside the streets";
    if (coverage < WALLED_COVERAGE_FLOOR) {
      diagnostics.push(
        warning(
          "WALLED_QUARTER_SPARSE",
          nodePath,
          `"${nodePath}" is walled and built ${builtColumns} of its ${blockLand} ${land} — ${Math.round(coverage * 100)} %, under the ${Math.round(WALLED_COVERAGE_FLOOR * 100)} % a walled quarter needs before the circuit reads as a town wall rather than as a fence round open ground`,
          (requested === "hillside"
            ? `The "hillside" form is village-scale by construction — two to four contour strips hold a few dozen lots however large the envelope — so a walled city cannot fill its circuit with it: draw the city with "grid" or "organic" fabric on its terraced plane (the compiler terraces a flattened quarter itself) and keep "hillside" for a quarter on the slopes outside the wall. Otherwise: `
            : "") +
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
        // The +1 road lip. Absent on a quarter where no segment's flanks
        // asked, so a report golden only moves where a world does.
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
/* helpers moved to deep district modules — blocks, lots, landmarks, terraces, replanning, grid, constants */
/* See district-blocks.ts, district-lots.ts, district-landmarks.ts, district-terraces.ts, district-replanning.ts, district-grid.ts, district-constants.ts */
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
/** The two sides perpendicular to a face — a corner lot's candidate flanks. */
const FLANKS_OF: Readonly<Record<HorizontalFace, readonly HorizontalFace[]>> = Object.freeze({
  north: Object.freeze(["west", "east"] as const),
  south: Object.freeze(["west", "east"] as const),
  west: Object.freeze(["north", "south"] as const),
  east: Object.freeze(["north", "south"] as const),
});

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
 * `RIM_SEAT_MAX_DROP`. `undefined` means "this lot is on no platform",
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
 * Dead since the election shipped: the exception cannot fire, the
 * function is `planeY`, and every world is byte-identical.
 *
 * **…because the election is the shipped
 * configuration** — seat simplification.
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
export function seatOnPlane(planeY: number | undefined): number | undefined {
  return planeY;
}



/* Restored helpers for explicit stage orchestration */
/** `terrain_conform` modes that level the ground under a footprint. */
const LEVELLING_MODES: ReadonlySet<string> = new Set(["flatten", "cut_fill", "terrace"]);

export function conformLevels(node: DistrictNode): boolean {
  let mode = "cut_fill";
  for (const c of node.constraints ?? []) {
    if (c.type !== "terrain_conform" && !("terrain_conform" in c)) continue;
    const named = c["mode"] ?? c["terrain_conform"];
    if (typeof named === "string") mode = named;
  }
  return LEVELLING_MODES.has(mode);
}

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
 * One **landing** of a served seam — S9.
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
 * Flights derived per quarter, at most —
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
   * Per-district flag, defaulting to `true`.
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
 * quarter before the served seam shipped at 11F.
 */
export function deriveSeamStairs(input: SeamStairInput): SeamStairResult {
  const empty = { segments: [], cut: 0, refused: 0, diagnostics: [] };
  if (!(input.tiered ?? true)) return empty;
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

/**
 * The block size a quarter draws at when the document names none.
 *
 * The density's own size — and, when the quarter asked for courtyards, a block
 * big enough to hold one: two lot depths, the smallest court, and the streets
 * round it. A courtyard is the author's request; the block that can close
 * around one is the compiler's arithmetic.
 */
function defaultBlockSize(density: DistrictDensity, courtyards: unknown): number {
  const base = BLOCK_SIZE_BY_DENSITY[density] as number;
  if (typeof courtyards !== "number" || courtyards <= 0) return base;
  return Math.max(base, 2 * LOT_DEPTH[density] + MIN_COURT_SIDE + 16);
}
