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
  HIGHRISE_MAX_WIDTH,
  HIGHRISE_MIN_WIDTH,
  TERRACE_MIN_FRONTAGE,
  isHighriseArchetype,
  nodeSeed,
  planTerrace,
  positionFloat,
  positionInt,
  streamSeed,
  terraceMinDepth,
  type HeightField,
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
  type DistrictParams,
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
import { derivePlatforms } from "./platforms.js";
import { LAYOUT_ROWS } from "./streets-intent.js";
import type { Point2, Rect } from "./frames.js";
import {
  drawFabric,
  installUrbanForms,
  urbanForm,
  type FormChannel,
  type FormFocus,
  type FormRecord,
  type GroundSample,
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
} from "./streets.js";
import type { LayoutNodeInput, PadEdit, Placement, ResolvedPort } from "./types.js";

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
  /** Lots inside the reserved central block, when `params.plaza` is set. */
  readonly plazaLots: number;
  readonly carriagewayColumns: number;
  readonly sidewalkColumns: number;
  /** Blocks that closed around a courtyard. Absent when none did. */
  readonly courtyards?: number;
  /**
   * Why the others did not, by §4.2's criteria — the measurement behind
   * `COURTYARD_NONE`, and the number to look at before touching
   * {@link COURTYARD_FILL}. Absent when nobody asked for a courtyard.
   */
  readonly courtyardRejects?: Readonly<Partial<Record<CourtyardReject, number>>>;
}

/** One district's fabric, as the compile report carries it. */
export interface DistrictProduct {
  readonly nodePath: string;
  /** The footprint the solver placed — the fabric's whole world. */
  readonly bounds: Rect;
  /** The pinned F4 / road-pass contract. */
  readonly streets: StreetGraph;
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
  const p = cell === undefined ? node.params : { ...node.params, density: cell.density };
  // The intent layer's three urban rows, each handed the value this pass was
  // about to use. With no intent anywhere on this node's path every one of
  // them returns that value unchanged — see `intent/fanout.ts`, law 2.
  ensureFanOutRows();
  const intent = intentFor(resolveIntents(input.doc), nodePath);
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
  const drawn = drawFabric({
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
  });
  if (!drawn.ok) {
    diagnostics.push(error("DISTRICT_TOO_SMALL", nodePath, drawn.refusal.reason, drawn.refusal.fix));
    return null;
  }
  diagnostics.push(...drawn.outcome.diagnostics);
  const plan = drawn.outcome.plan;
  const graph = plan.graph;

  // --- the void ------------------------------------------------------------
  const grid = new Grid(bounds);
  const carriageway = new Uint8Array(grid.cells);
  for (const cell of carriagewayCells(graph, bounds)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) carriageway[k] = 1;
  }
  const sidewalk = dilate(grid, carriageway, sidewalkWidth);

  // --- blocks --------------------------------------------------------------
  const blocked = new Uint8Array(grid.cells);
  for (let k = 0; k < grid.cells; k++) blocked[k] = carriageway[k] === 1 || sidewalk[k] === 1 ? 1 : 0;
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
  const declared = plan.benches ?? [];
  const derived =
    groundPolicy === "stepped" && declared.length === 0
      ? derivePlatforms({ bounds, blocked, field: input.field })
      : [];
  const levels = groundLevelsOf(bounds, declared.length > 0 ? declared : derived);
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
  const blocks = blocksOf(grid, blocked, declared.length > 0);

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
    });
  }

  // --- the skyline field (C2) ----------------------------------------------
  // Built here, between the landmarks and the infill, because it reads the
  // landmarks and every infill lot reads it. Keyed on the district's bounds,
  // its seed, the terrain and the *authored* children — never on the lots, so
  // one more infill building cannot move the height of any other.
  const prominence = buildProminenceField({
    bounds,
    seed,
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
  );
  let terraceBays = 0;
  let terraceLots = 0;
  for (const terrace of terraces) {
    for (const lot of terrace.lots) claimed.add(lot.id);
    terraceLots += terrace.lots.length;
    terraceBays += terrace.bays;
    built.push(terrace.built);
  }

  let infilled = 0;
  for (const lot of lots) {
    if (claimed.has(lot.id)) continue;
    // The coverage draw comes first and is *not* a drop: a lot the density left
    // open is open ground, which is a decision, not a failure to build.
    // …unless the lot is in a courtyard perimeter, where coverage is 1 (§4.3).
    if (
      !lot.courtyard &&
      positionFloat(infillStream, lot.rect.x0, 0, lot.rect.z0) >= (LOT_COVERAGE[p.density] as number)
    ) {
      continue;
    }
    const filled = infillLot(lot, p, infillStream, prominence, cell?.minBuilding ?? MIN_INFILL_SIDE);
    if (filled === null) {
      dropped++;
      continue;
    }
    infilled++;
    built.push({
      nodePath: `${nodePath}.${filled.id}`,
      id: filled.id,
      rect: filled.rect,
      face: lot.face,
      size: filled.size,
      ports: INFILL_PORTS,
      params: filled.params,
      tags: filled.tags,
      seed: nodeSeed(input.worldSeed, `${nodePath}.${filled.id}`, ""),
      frontPort: undefined,
    });
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
      padEdits.push({ nodePath, footprint: run, targetY: bench.level, apron: 0 });
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
      const targetY = levels.levelY[platform] as number;
      for (const run of runs) padEdits.push({ nodePath, footprint: run, targetY, apron: 0 });
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
    const foundationY =
      levels !== null && platform !== NO_PLATFORM
        ? (levels.levelY[platform] as number)
        : cell?.foundationY ?? medianGround(input.field, rect);
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
    });
    params.set(item.nodePath, item.params);
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
      form: plan.record,
      ...(plan.channels === undefined || plan.channels.length === 0
        ? {}
        : { channels: plan.channels }),
      carriageway,
      sidewalk,
      ...(courtyardBlocks.length === 0 ? {} : { courtyards: courtyardBlocks }),
      // The platforms and their seams, for the retaining pass — the one
      // consumer that runs on the column plan rather than on the layout, and so
      // the one that cannot re-derive them. Both are omitted unless this
      // quarter is `"stepped"` and actually stepped, so the product a quarter
      // written before this phase carries is the object it carried before.
      ...(levels === null || groundPolicy !== "stepped" ? {} : { levels, seams }),
      stats: {
        blocks: blocks.length,
        lots: lots.length,
        landmarks: landmarks.length - unplaced,
        landmarksUnplaced: unplaced,
        infill: infilled,
        terraces: terraces.length,
        terraceBays,
        terraceLots,
        lotsDropped: dropped,
        plazaLots,
        carriagewayColumns,
        sidewalkColumns,
        ...(courtyardBlocks.length === 0 ? {} : { courtyards: courtyardBlocks.length }),
        ...(courtyardShare <= 0
          ? {}
          : { courtyardRejects: Object.fromEntries([...courtyardRejects].sort()) }),
      },
    },
  };
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

/** The `rings`-deep band around a mask, excluding the mask itself. */
function dilate(grid: Grid, mask: Uint8Array, rings: number): Uint8Array {
  const out = new Uint8Array(grid.cells);
  let frontier = mask;
  const claimed = new Uint8Array(mask);
  for (let ring = 0; ring < rings; ring++) {
    const next = new Uint8Array(grid.cells);
    for (let j = 0; j < grid.depth; j++) {
      for (let i = 0; i < grid.width; i++) {
        const k = j * grid.width + i;
        if (frontier[k] !== 1) continue;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= grid.width || jj >= grid.depth) continue;
            const n = jj * grid.width + ii;
            if (claimed[n] === 1) continue;
            claimed[n] = 1;
            next[n] = 1;
            out[n] = 1;
          }
        }
      }
    }
    frontier = next;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* blocks                                                                      */
/* -------------------------------------------------------------------------- */

/** One face of the street graph: the ground between the streets. */
interface Block {
  readonly rect: Rect;
  readonly columns: number;
}

/** Connected components of the unclaimed ground, in row-major discovery order. */
function blocksOf(grid: Grid, blocked: Uint8Array, split: boolean): Block[] {
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
    // One rectangle per block, unless the form cut its own benches — see
    // `rectsOf`, which is where the whole of that "unless" is argued.
    if (!split) {
      const rect = largestFreeRect(grid, member, { x0, z0, x1, z1 });
      if (rect === null) continue;
      out.push({ rect, columns });
      continue;
    }
    for (const rect of rectsOf(grid, member, { x0, z0, x1, z1 })) {
      out.push({ rect, columns: (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1) });
    }
  }
  return out;
}

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
 * **Only for a form that cut its own benches**, which today is `terraced` and
 * nothing else. Not because it would be wrong elsewhere but because it would
 * move every organic and grown world in the repository, and a quarter that did
 * not ask to move should not move. The gate is `plan.benches`, the same flag
 * everything else about a benched quarter hangs off.
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
  // A block too small or too thin for even one whole-building rectangle still
  // gets today's answer: the largest rectangle in it, whatever its size. It is
  // where the infill slivers come from and dropping it here would be a second,
  // unrelated change.
  if (out.length === 0) {
    const rect = largestFreeRect(grid, member, bounds);
    if (rect !== null) out.push(rect);
  }
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
}

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
    const [lo, hi] = INFILL_FLOORS[density];
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
  return Math.round(heights[heights.length >> 1] as number);
}
