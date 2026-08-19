/**
 * Layout solver v1 — the data the solver consumes and produces.
 *
 * The shapes here are the interface G4b's `building.grammar@0` and
 * `road.network@0` generators build against, so they are deliberately more
 * explicit than the solver itself needs: a generator gets a placed footprint,
 * a foundation elevation, a yaw, and its ports already resolved to world
 * positions and outward normals.
 */

import type { LoamDiagnostic } from "@terrainist/spec";
import type { ApronBySide, Classification, HeightField, Region, Seed256 } from "@terrainist/stdlib";
import type {
  CanonicalConstraint,
  DistrictGroundPolicy,
  HorizontalFace,
  PortDeclaration,
  Yaw,
} from "@terrainist/spec";

import type { RouteCorridor } from "./corridors.js";
import type { Rect } from "./frames.js";
import type { TerrainProductIndex } from "./products.js";

/** What the solver is asked to place. */
export interface LayoutNodeInput {
  readonly id: string;
  /** Dotted path from the root, e.g. `"world.town_hall"`. */
  readonly nodePath: string;
  /**
   * `generator` for a structure node, `primitive` for the plaza, `district`
   * for a fabric quarter.
   *
   * The third value is load-bearing in exactly one place: the structure pass
   * finds the plaza by looking for the one `primitive`, and a district that
   * called itself one would be paved as a village green.
   */
  readonly kind: "generator" | "primitive" | "district" | "city";
  /** `building.grammar@0` / `road.network@0`; absent for the plaza. */
  readonly generator?: string;
  /**
   * The node may straddle the waterline: the freeboard veto is lifted, the
   * amphibious hazard mask is used, and no pad is laid under it. A harbour, a
   * city, and a `seat: "wade"` landmark program — nothing else.
   */
  readonly amphibious?: boolean;
  /**
   * This node is a **bespoke landmark** — an `authored:<id>` invocation.
   *
   * Two rules turn on it, and both exist because a landmark is not a building.
   * Its yaw is frozen before the solve (`programs/facing.ts`), so a `facing`
   * constraint here can only move it and is therefore not scored; and its
   * declared coarse target is honoured even on ground the building slope veto
   * refuses, because a padded sculpture stands on a bluff perfectly well and
   * the alternative is the flattest ground in the region, wherever that is.
   */
  readonly landmark?: boolean;
  /**
   * How this node's ground is prepared — `"pad"` (the default and today's
   * behaviour), `"benched"`, or `"stepped"`
   * (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.2).
   *
   * `"benched"` says *the node levels its own ground, in pieces*, so the solver
   * lays no pad under it: `padFor` returns `null`, exactly as it already does
   * for a city and for an amphibious node. Set by `from-document.ts` when a
   * district's resolved urban form reads contours — a `terraced` quarter handed
   * a billiard table by the compiler itself has nothing left to terrace. Its
   * benches are the levelling, and they reach the field through the same
   * `fabricPads` list a city cell's mask runs already use.
   *
   * **`"benched"` is what this key spelled `"stepped"` before Phase 4.2**, and
   * the rename is precisely what keeps `terraced` byte-identical: the form
   * still declares the old meaning under the new name, and the *new* meaning of
   * `"stepped"` — derived platforms where the form declares none, plus seam
   * treatment: retaining walls, derived stairs, the reachability rule — is a
   * thing a document has to ask for by name.
   *
   * `padFor` returns `null` for both.
   */
  readonly groundPolicy?: DistrictGroundPolicy;
  /**
   * This district's `"pad"` is a **default**, not a request, so the ground it
   * is placed on may still elect to step.
   *
   * A quarter that named no ground gets the ground its *site* has: above
   * `STEP_RELIEF` blocks of relief it derives platforms and steps down the
   * slope in storeys instead of being levelled to one plane. The relief cannot
   * be measured before the solve — there is no footprint yet — so the document
   * half of the question is answered in `from-document.ts` and carried here,
   * and `padFor` measures the footprint it has just chosen.
   *
   * Set by `from-document.ts` and read by `padFor` and by nothing else. Absent
   * whenever anything *asked* for a ground policy, because an answered question
   * is not re-opened by the terrain.
   */
  readonly groundElectable?: boolean;
  /**
   * …and it is *scored against* a candidate with no water in it. Separate from
   * {@link LayoutNodeInput.amphibious} because an inland city is allowed to
   * touch the water and must not be dragged towards it.
   */
  readonly wantsWater?: boolean;
  /** Requested footprint and height, in blocks. */
  readonly size: readonly [number, number, number];
  /** Smallest acceptable footprint when `flexible`; defaults to `size`. */
  readonly minSize?: readonly [number, number, number];
  readonly flexible: boolean;
  /** Keep-clear margin outside the envelope. */
  readonly padding: number;
  /** Yaws the solver may choose, in the order it tries them. */
  readonly rotations: readonly Yaw[];
  /** Canonical constraints in declaration order (index is load-bearing, §4.9.3). */
  readonly constraints: readonly CanonicalConstraint[];
  /** Declared ports, keyed by name. */
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly optional: boolean;
  readonly tags: readonly string[];
  /** `nodeSeed(worldSeed, nodePath, seedSalt)`. */
  readonly seed: Seed256;
}

/** A port resolved onto placed geometry (§5.2 resolved form). */
export interface ResolvedPort {
  /** `"world.town_hall#main_door"`. */
  readonly ref: string;
  readonly nodePath: string;
  readonly name: string;
  readonly type: string;
  /** Centre of the opening's inner face, in world coordinates. */
  readonly position: readonly [number, number, number];
  /** Unit vector pointing away from the node — the way a connector departs. */
  readonly outwardNormal: readonly [number, number, number];
  /** The face after the solved yaw was applied. */
  readonly face: HorizontalFace;
  readonly width: number;
  readonly height: number;
  readonly floorY: number;
}

/** Where a node ended up (§4.3). */
export interface Placement {
  readonly nodePath: string;
  readonly id: string;
  /** World position of the node-local origin — the footprint's min corner. */
  readonly translation: readonly [number, number, number];
  readonly yaw: Yaw;
  readonly mirror: false;
  /** World-space extents after rotation. */
  readonly size: readonly [number, number, number];
  /** Inclusive world footprint. */
  readonly footprint: Rect;
  /** Horizontal centre of the footprint — the anchor coarse constraints target. */
  readonly anchor: { readonly x: number; readonly z: number };
  /** Ground level the structure's floor sits on. */
  readonly foundationY: number;
}

/** One relaxation-ladder rung (§4.6). */
export type LadderRung =
  | "absorbed"
  | "tolerance_relaxed"
  | "envelope_shrunk"
  | "parent_grown"
  | "constraint_demoted"
  | "node_dropped"
  | "unsatisfiable"
  /**
   * Not a v0.2 rung: a landmark seated on its declared coarse target although
   * the building slope veto refused it (`LOAM-W520`). It sits here because the
   * report has one place where "why is this node where it is" is answered.
   */
  | "landmark_coarse_seat";

/** How one constraint fared, for the solver report. */
export interface ConstraintReport {
  /** Index in the node's `constraints` array. */
  readonly index: number;
  readonly type: string;
  readonly target?: string;
  readonly declaredStrength: "hard" | "soft";
  /** After any ladder demotion; `"ignored"` for a parsed-but-unimplemented type. */
  readonly effectiveStrength: "hard" | "soft" | "ignored";
  readonly weight: number;
  /** Final normalized cost contribution (0 when satisfied). */
  readonly cost: number;
  readonly satisfied: boolean;
  /**
   * The target selector resolved to no node at all, so this constraint was
   * never evaluated against anything (`LOAM-W523`). Not a satisfied constraint
   * and not a violated one — an unmeasured one.
   */
  readonly targetUnresolved?: true;
}

/** The coarse placement record §4.7 obligation 7 requires. */
export interface CoarseReport {
  readonly index: number;
  readonly type: "zone" | "at";
  readonly frame: Rect;
  /** The jittered seed point the search started from. */
  readonly targetPoint: readonly [number, number];
  /** The zero-cost region: the zone cell, or the `at` tolerance disc's bounds. */
  readonly targetRegion: Rect;
  readonly mode: "center" | "contain";
  readonly cost: number;
}

/** Per-node solver report. */
export interface SolverNodeReport {
  readonly nodePath: string;
  readonly placed: boolean;
  readonly translation?: readonly [number, number, number];
  readonly yaw?: Yaw;
  readonly size: readonly [number, number, number];
  /** Ladder rungs applied to this node, in the order they were tried. */
  readonly appliedRungs: readonly LadderRung[];
  readonly constraints: readonly ConstraintReport[];
  readonly coarse: readonly CoarseReport[];
  readonly score: { readonly terrain: number; readonly soft: number; readonly total: number };
  /** How many candidate (position, yaw) pairs were evaluated. */
  readonly candidatesConsidered: number;
  /**
   * Why the ground rejected each candidate, counted over the whole pool.
   *
   * Only present when the node ended `unsatisfiable`: it is the answer to "no
   * constraint of mine is violated, so why was nothing satisfiable?", which is
   * otherwise unanswerable from this report.
   */
  readonly terrainVeto?: {
    readonly out_of_region: number;
    readonly hazard: number;
    readonly underwater: number;
    readonly too_steep: number;
    readonly feasible: number;
  };
}

/** One frozen route corridor, as the solver report records it (§4.9.6). */
export interface CorridorReport {
  readonly nodePath: string;
  readonly id: string;
  readonly kind: "road" | "course";
  readonly verb?: string;
  readonly halfWidth: number;
  /** Coarse centreline waypoints, as registered and frozen at substage 3b. */
  readonly centerline: readonly (readonly [number, number])[];
  /** Columns of the region the reservation claims. */
  readonly reservedColumns: number;
}

/** The machine-readable solver report (§4.6: "a first-class artifact"). */
export interface SolverReport {
  readonly nodes: readonly SolverNodeReport[];
  readonly dropped: readonly string[];
  /**
   * Corridors registered at substage 3b, in registration order.
   *
   * §4.9.6 makes freezing the whole promise of `along`, and a promise nobody
   * can inspect is not one: this is what lets "why is my chapel three blocks
   * off the street" be answered with the street the solver actually reserved.
   */
  readonly corridors: readonly CorridorReport[];
  /** Local-improvement rounds actually run. */
  readonly improvementRounds: number;
  /** Nodes moved by the local-improvement pass. */
  readonly improvements: number;
}

/** A level-to terrain adjustment emitted for one placed structure. */
export interface PadEdit {
  readonly nodePath: string;
  /** The footprint levelled to `targetY`. */
  readonly footprint: Rect;
  readonly targetY: number;
  /** Falloff width outside the footprint, in blocks. */
  readonly apron: number;
  /**
   * Let the apron grow with the step it absorbs — `LevelPad.adaptiveApron`.
   *
   * Set by `padFor` on a node-scale pad and by nothing else. The fabric pass's
   * bench and lot pads keep the fixed apron they were given, because there the
   * apron is a detail between two things that are already at the right level;
   * this is for the one edge where a levelled quarter meets ground nobody cut.
   */
  readonly adaptiveApron?: boolean;
  /**
   * Per-side apron widths — `LevelPad.apronBySide`, passed straight through.
   *
   * The frontage tie (`docs/GROUND-UNIFICATION-v0.md` F7) wants a pad whose
   * street face has no apron at all — it is already at the carriageway's level,
   * so a smoothstep there can only manufacture the lip the tie removes — while
   * its other three faces keep the adaptive ramp back to the untouched hill.
   *
   * Omitted on every pad the compiler emits today, and an omitted field is
   * exactly the scalar `apron` on all four sides.
   */
  readonly apronBySide?: ApronBySide;
}

/**
 * Where structures (and, from G4b, road corridors) claim the ground.
 *
 * `mask` is the union — the scatter pass excludes it unconditionally, which is
 * what stops trees growing through walls. `byTag` lets a node opt out of a
 * narrower slice through `scatter.forest@0.avoidTags`.
 */
export interface OccupancyGrid {
  readonly region: Region;
  readonly mask: Uint8Array;
  readonly byTag: ReadonlyMap<string, Uint8Array>;
}

/** Everything the solver needs about the world it is placing into. */
export interface LayoutRequest {
  readonly region: Region;
  readonly field: HeightField;
  readonly classification: Classification;
  readonly seaLevel: number;
  /** Root node path, for report ids. */
  readonly rootPath: string;
  /** Nodes in document order — the solver's fixed iteration order (§4.7). */
  readonly nodes: readonly LayoutNodeInput[];
  /**
   * 1 where a column is unusable ground: ocean, lake, or lava. Built by the
   * caller from the classification and the edit composition, because the
   * solver runs before any block exists.
   */
  readonly hazardMask?: Uint8Array;
  /**
   * The same mask with the *water* taken out: 1 only where a column is lava or
   * caldera.
   *
   * Read by `precinct.harbour@0` and nothing else. A quay is built across the
   * waterline by definition, so the ordinary hazard mask — which calls every
   * ocean and lake column unusable ground — would veto every candidate a
   * harbour could possibly want. Lava is still lava.
   */
  readonly amphibiousHazardMask?: Uint8Array;
  /**
   * Route corridors registered at substage 3b (§4.9.6), in document order.
   *
   * Frozen by the time the solver sees them: it costs structures against them,
   * binds `along` / `beside` to them, and reports them — and never changes one.
   */
  readonly corridors?: readonly RouteCorridor[];
  /** Derived `@terrain:` products, for `on` (§4.2/§4.4). */
  readonly products?: TerrainProductIndex;
  /** Candidate positions sampled per node. Default {@link DEFAULT_CANDIDATES}. */
  readonly candidateCount?: number;
  /** Local-improvement rounds. Default {@link DEFAULT_IMPROVEMENT_ROUNDS}. */
  readonly improvementRounds?: number;
}

/** What the solver hands the rest of the compiler. */
export interface LayoutResult {
  readonly placements: readonly Placement[];
  readonly report: SolverReport;
  readonly occupancy: OccupancyGrid;
  readonly padEdits: readonly PadEdit[];
  readonly ports: readonly ResolvedPort[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Candidate positions sampled per node. */
export const DEFAULT_CANDIDATES = 96;

/** Local-improvement rounds (§4.9.6's spirit: bounded, deterministic). */
export const DEFAULT_IMPROVEMENT_ROUNDS = 2;

/** Ground slope (degrees) a structure tolerates when `terrain_conform` is silent. */
export const DEFAULT_MAX_SLOPE = 35;

/** Blend radius outside a footprint, when `terrain_conform.blend` is silent. */
export const DEFAULT_BLEND = 4;

/* -------------------------------------------------------------------------- */
/* the frontage tie — `docs/GROUND-UNIFICATION-v0.md` Part I                    */
/* -------------------------------------------------------------------------- */

/**
 * The master switch for the frontage tie (F1): a lot that fronts a street seats
 * at the level of that street rather than on the median of its own footprint.
 *
 * **`false` through wave 8E; `true` from wave 8F.** While it was false every
 * tied code path was dead: `layDistrict` seated on
 * `cell?.foundationY ?? medianGround(...)`, emitted the scalar-apron pad, and
 * every world compiled byte-identically. Wave 8F flipped it, regenerated the
 * deck and handed the look to Kai — the verdict on {@link FRONTAGE_RISE} and on
 * the rear terrace is his and only his (§7).
 */
export const FRONTAGE_TIE = true;

/**
 * Blocks a tied lot sits above its carriageway's level — F4.
 *
 * `0`: `buildings.ts` lays the floor block at `foundationY + 1`, so a lot flush
 * with its street puts its threshold exactly one block above the pavement — a
 * doorstep, which is what `buildDoorsteps` exists to dress. `1` (a plinth course
 * under every shopfront) is the obvious alternative and is a **taste**
 * parameter: it changes every settlement world and therefore lands only on a
 * walk.
 */
export const FRONTAGE_RISE = 0;

/**
 * Blocks of disagreement a corner lot tolerates between its front street and its
 * flank before it takes the **lower** of the two — F5.
 *
 * Taking the higher would put the front door above its own pavement, which is
 * the defect the tie exists to remove; taking the lower puts the flank pavement
 * above the lot, which is a step-up along the side wall — a real corner building
 * on a hill, and the ratified hill-town look.
 */
export const CORNER_TOLERANCE = 2;

/**
 * The deepest cut a tied lot may make into the hill behind its frontage — F7.
 *
 * Derived, not tuned: it is `RETAIN_MAX`, the deepest face the retaining table
 * is willing to build, so a tied lot can never ask for a wall the wall pass
 * refuses. Where it binds the rect is *not* deepened — the pad stops, the rear
 * apron goes to 0, and the hill stands against the back wall.
 */
export const FRONTAGE_CUT_MAX = 6;

/**
 * How far a claimant **with no sidewalk width of its own** probes the datum —
 * §1.6, the bespoke-site client of F1.
 *
 * A district lot asks `frontageReach(sidewalkWidth)` (`layout/district.ts`),
 * because a lot knows the band its own quarter drew. A bespoke site does not:
 * it is sited by the program placer against the finished ground, may stand in
 * any quarter or none, and the question §1.6 asks of it is "does this footprint
 * have a banded column within `SITE_FRONTAGE_REACH`". So the constant is the same
 * expression evaluated at the *widest* band the fabric ever draws —
 * `max(SIDEWALK_BY_DENSITY) + STREET_PROBE_SLACK` = `2 + 10` — which makes a
 * program beside a downtown avenue and a program beside a village lane ask the
 * same question, and never asks further than a lot on the same street would.
 *
 * Spelt `SITE_` rather than `FRONTAGE_REACH` (the name §1.6 uses) because
 * `layout/prominence.ts` already exports a `FRONTAGE_REACH` — a landmark's
 * prominence falloff, an unrelated quantity — and both are re-exported from
 * `layout/index.ts`. Two different numbers under one name in one barrel is the
 * ambiguity the compiler refuses and the reader should too.
 *
 * Dead while {@link FRONTAGE_TIE} is off: no quarter grades a datum, so nothing
 * is ever probed.
 */
export const SITE_FRONTAGE_REACH = 12;

/* -------------------------------------------------------------------------- */
/* the served seam — `docs/GROUND-UNIFICATION-v0.md` Part IV                    */
/* -------------------------------------------------------------------------- */

/**
 * The master switch for the served seam (S1): a seam leaves the retaining pass
 * with a *built* treatment — a wall, a tier stack, a landform bank, a kerb, the
 * hill's own rock or a building's own back — rather than falling through five
 * different refusals onto one word, `"bank"`, and a 45° ramp of raw earth.
 *
 * **`false` from wave 11A; flipped to `true` at 11F** on Kai's walk verdict and
 * nothing else (§4.4). While it was false the world was byte-identical to what
 * shipped:
 * every construction this part adds was either unbuilt or gated here, and the
 * only thing wave 11A changed unconditionally was the *report* — the seam
 * accounting behind the `transitions by context (§5)` note runs on every
 * quarter, not only on one a site planner drew (§4.0a M2). The risk table said
 * it in one line: report bytes move at 11A, and **a world hash that moved at
 * 11A was a bug, not a golden update.**
 *
 * What this flag gates, precisely, in `structures/retaining.ts`:
 * - whether an edge's `EdgeContext` is allowed to *choose* the
 *   treatment (`treatmentForEdge`) on a quarter with no
 *   `plannedEdges` — before the flip only a hillside form produced that field,
 *   so only a hillside quarter's seams were chosen from context;
 * - whether a tall bank is **benched** rather than ramped 1:1 on such a quarter
 *   (§4.3's `retaining.ts:582` row);
 * - whether a seam past `RETAIN_MAX` is served by a **tier stack** (S2) rather
 *   than graded, and whether a short run is **absorbed** (S7);
 * - whether `LOAM-W411 RETAINING_REFUSED` is still emitted. It fires on the
 *   untiered path only, so the flip retires it (§4.1 S1, §7): under the flag a
 *   bank is S8's deliberate landform, and `LOAM-I412 SEAM_SERVED` names what
 *   every seam became, once per quarter.
 *
 * The per-district / per-call `tiered` fields all default to this constant, and
 * they are how a test asks for either world without moving the switch. A fixture
 * that wants the untiered answer must now say so: silence means the flag, and
 * the flag is on.
 *
 * The context itself is computed for every district either way: measuring is
 * honest, and the report is built from the measurement.
 */
export const SEAM_TIERS = true;
