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
  | "landmark_coarse_seat"
  /**
   * Not a v0.2 rung either: a landmark moved to the nearest feasible site to a
   * coarse target nothing could stand on ({@link LANDMARK_COARSE_RING}).
   */
  | "landmark_coarse_ring";

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
  /**
   * **Which v1 ground class this pad's level becomes a claim of** — the
   * contract v1 §2's `PadEdit` row, as a discriminator rather than as a guess.
   *
   * WP-G3 turns the pad list into real declarations, and the three fabric pad
   * sites in `layout/district.ts` mean three different things: a bench run and a
   * derived platform are a **quarter's plane** (rank 15), a per-lot pad is a
   * **building's footprint** (rank 10). Nothing outside the list can tell them
   * apart — a bench pad and a lot pad differ only in whose `nodePath` they carry
   * — so the pass that knows says so here.
   *
   * Omitted on the solver's own pads (`padFor`), which is exactly the reading
   * `layout/ground-declarers.ts` gives an absent field: a node-scale pad under a
   * placed structure, i.e. `building.footprint`.
   */
  readonly claimClass?: "building.footprint" | "quarter.plane";
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

/* -------------------------------------------------------------------------- */
/* the ground-plane tie — `docs/GROUND-UNIFICATION-v0.md` Part V               */
/* -------------------------------------------------------------------------- */

/**
 * The master switch for the ground-plane tie (G1): a town block's platform is
 * elected on **the plane of the street that fronts it** — the datum
 * {@link FRONTAGE_TIE} already grades — rather than on `min(free ground)` under
 * its own columns, so a carriageway and the ground beside it are one storey
 * lattice instead of two computations that disagree.
 *
 * **`false` from wave 12A; flipped to `true` at 12F** on Kai's walk verdict and
 * nothing else (§11.4). While it was false every construction behind it was
 * either unbuilt or dead, and every world compiled byte-identically — a world
 * hash that moved before 12F was a bug, not a golden update.
 *
 * What it gates, precisely:
 * - **12B, the block-anchored lattice** (`layout/platforms.ts`,
 *   `layout/district.ts`): whether `derivePlatforms` reads a
 *   `PlatformInput.datum` and anchors each block's base on the nearest banded
 *   carriageway column within `tieReach` (G2), congruent to the datum modulo
 *   `FLOOR_HEIGHT`; whether a block whose perimeter datum spans more than
 *   {@link GROUND_TIE_SPAN} is **split** rather than averaged (G4). A block with
 *   no banded column in reach is untied and keeps exactly today's number (G3).
 * - **12D, the plane-edge service** (`structures/retaining.ts`): whether a
 *   claimed non-district plane — a `precinct.*` quay, a platform pad — measures
 *   and serves **its own** edges (R1, R2), the fill side as the existing skirt
 *   (R3) and the cut side as a revetted face, never a ramp (R4).
 *
 * The per-call fields (`PlatformInput.datum`, `RetainingPassInput.planes`)
 * default to this constant and are how a test asks for either world without
 * moving the switch — the same shape `PlatformInput.tiered` and
 * `RetainingDistrict.tiered` already have. A fixture that wants the untied
 * election must now say so: silence means the flag, and the flag is on.
 *
 * **Acceptance is a measurement, not a claim of zero**, and it was taken
 * (§11.11): `tools/worlds/street-probe.mjs` over the pirates document,
 * recompiled either side of this line. The +1 road-to-terrain count falls
 * **178 → 11** inside the citadel box and **414 → 35** map-wide, the ≥ +4 tail
 * **107 → 44**, and `LOAM-T242` is **0** on `world.unicorn_citadel` — the
 * quarter §11.0 measured as one flat +1 bar. What is left is where the streets
 * themselves fall: 1,265 columns on `world.pirate_cove_town`, 13,305 on Troy's
 * acropolis. Physics is clean on all three battery documents.
 */
export const GROUND_PLANE_TIE = true;

/**
 * How far the datum may span along one block's perimeter before that block is
 * **split** rather than elected as one platform — G4.
 *
 * Derived, not tuned: a block that straddles more than one storey of street
 * cannot be a single platform without one of its streets being wrong about it,
 * and one storey is the unit `layout/platforms.ts` is quantised in (§11.9.6
 * weighed `2` and chose the derivation). It is the value of
 * `FLOOR_HEIGHT` (`layout/district.ts`), written here as a literal only because
 * `district.ts` imports this module and the reverse edge would be a cycle; a
 * test pins the two together.
 *
 * Dead while {@link GROUND_PLANE_TIE} is off: no block reads a perimeter datum,
 * so `if (hi - lo <= FLOOR_HEIGHT)` never gains its second clause. Live from
 * 12F, when the flag was flipped.
 */
export const GROUND_TIE_SPAN = 4;

/* -------------------------------------------------------------------------- */
/* the +1 road lip — post-election street harmonization                        */
/* -------------------------------------------------------------------------- */

/**
 * **The street may agree with the election it made agree with it.**
 *
 * The agreement between a carriageway and the ground beside it is, today, one
 * way round. The street datum is graded on pristine terrain *before* the
 * election ({@link FRONTAGE_TIE}, `layout/street-datum.ts`); the election then
 * pays a frontage cost to agree with the datum
 * (`docs/ELECTION-SOLVE-v0.md` §1.3.3, §5) — but a street never reciprocates,
 * so where the whole neighbourhood elects one block lower than the natural
 * grade its street was graded from, the street stands proud of it and the
 * quarter carries a lip nothing can repair downstream.
 *
 * Kai's walked evidence (n3 Troy, station 1): the road through the traced
 * shape `x 105…116, z −187…−197` sits at its natural grade while the planes
 * flanking it chose one lower; a building on the north side is `+1` submerged
 * by the road's own sidewalk and the meeting on the south is a two-block
 * dropoff. His verified counterfactual is the whole of this flag: *"if that
 * entire traced shape was one block lower it would look much better."*
 *
 * What it gates, precisely (`harmonizeStreetDatum`, `layout/street-datum.ts`,
 * called from `layDistrict` once the election is finished): a **run of
 * stations** whose flanking planes on *both* sides elected below the street is
 * **re-graded** one block lower — never lifted, and never by a raw offset. The
 * drop is applied to the sampled ground and the datum is graded again through
 * the same `gradeProfile` machinery, so F9's `STREET_CUT_MAX` floor, the water
 * floor, the junction pins and the one-block grade cap all still hold, and a
 * stretch whose neighbours or whose own cut cap will not let it move simply
 * does not.
 *
 * **A station, not a segment**, because the segment is the wrong unit and that
 * is measured: the citadel's east–west road is one segment 168 stations long
 * whose flank medians over that length are 0, and Kai's lip is forty stations
 * of it.
 *
 * Bounded on purpose: **one block, downhill, both sides, a run, or nothing.**
 * It is a measured repair of a named defect, not a second grader.
 *
 * `false` is byte-identical: `layDistrict` never calls the harmonizer, no
 * datum carries a `StreetDatumInput.lower` map, and every world hashes
 * as it does today.
 */
export const STREET_PLANE_HARMONIZE = true;

/**
 * How many columns beyond the sidewalk's outer lane the harmonizer reads the
 * elected planes over — the flank band, per side.
 *
 * Three, which is `frontageReach`'s neighbourhood without its slack: far
 * enough that a lot's platform is sampled rather than the verge between it and
 * the kerb, near enough that the columns read are the ones a walker sees
 * against the road. Dead while {@link STREET_PLANE_HARMONIZE} is off.
 */
export const STREET_PLANE_FLANK_PROBE = 3;

/**
 * Elected columns one side of one **station** must offer before that side has
 * an opinion at all.
 *
 * A station's flank band is {@link STREET_PLANE_FLANK_PROBE} columns deep, so
 * two is "most of the band elected something" and one is "a corner of a
 * platform clipped the probe". A station where either side is under quorum
 * asks for nothing, which is what makes a junction — where the flank is
 * another street and not a platform at all — silent rather than wrong. Dead
 * while {@link STREET_PLANE_HARMONIZE} is off.
 */
export const STREET_PLANE_MIN_FLANK = 2;

/**
 * Consecutive asking stations a stretch needs before the re-grade honours it.
 *
 * The lip this repairs is a *stretch* of road standing over its neighbourhood,
 * tens of stations long; a two-station agreement is noise in the election's
 * block boundaries, and moving the road for it would trade a lip for a
 * wobble. Four is the shortest run at which the one-block grade cap can drop
 * and recover without the drop being nothing but its own ramps. Dead while
 * {@link STREET_PLANE_HARMONIZE} is off.
 */
export const STREET_PLANE_MIN_RUN = 4;

/* -------------------------------------------------------------------------- */
/* the ground contract v1 flag ladder — `docs/GROUND-CONTRACT-v1.md` §6         */
/* -------------------------------------------------------------------------- */

/**
 * **WP-G3's switch: the pads arbitrate at their real ranks.**
 *
 * v1 §1.5 fills the two empty classes. A lot pad's footprint half declares
 * `building.footprint` (rank 10) at its seat level; a quarter's platform runs
 * declare the new `quarter.plane` (rank 15) at the elected level, less the
 * solved carriageway band (§1.7). Both carry those names from the moment they
 * are written — the report and the probe read the truth either way.
 *
 * What this gates is only **where those names sit in the order**
 * (`rankOf`, `layout/ground-contract.ts`):
 *
 * - **`false`** — the fallback, and the state WP-G3 shipped in. Both classes
 *   arbitrate at `DEFERRED_PAD_RANK` (150), the position `declarePadEdits`'
 *   deleted `pad.record` record held, so nothing wins differently and every
 *   world is byte-identical to WP-G2. §6/G3's off-state acceptance.
 * - **`true`** — **the shipped state, from WP-G4's flip.** 10 and 15. A pad
 *   stops being bookkeeping over a decision already baked into the baseline and
 *   becomes a claim that can take a column from a seam, a sidewalk or a verge —
 *   and, being tier A, one that a street cannot take back. §6/G3's on-state
 *   comparison, ratified by the G4 flip's measurements.
 *
 * **The ladder is ordered and the order is a test** (§6): {@link GROUND_V1_SEAMS},
 * `GROUND_V1_FREEZE` and `GROUND_V1_PRISTINE` each imply this one, exactly as
 * {@link GROUND_PLANE_TIE} implies {@link FRONTAGE_TIE}. The implications live
 * in `test/ground-contract.test.ts` beside this one's.
 */
export const GROUND_V1_RANKS = true;

/**
 * **WP-G4's switch: `finishSeams` builds the transitions the resolver derived.**
 *
 * **On is the shipped state, from WP-G4's flip half.** `finishSeams` builds the
 * complement of what the other passes report built, `planeSeams`/`skirtSeams`
 * are absorbed, and the r22 probe targets of §6/G4's table — as amended by the
 * flip's own measurements — are the acceptance. Implies
 * {@link GROUND_V1_RANKS} (the ladder test).
 *
 * **Off is the fallback**, and it is the state WP-G4's derive half shipped in.
 * With the flag off the whole v1 seam path *derives and reports* and builds
 * nothing: `deriveGroundSeams` enumerates every boundary, §3.2's coverage
 * invariant runs on every settlement compile, `LOAM-I497 GROUND_STAGE` records
 * the counts, and every world is byte-identical to the one before the stage.
 * That was §6/WP-G4's front-loaded comparison — the risky question answered by
 * a diff before a block moved.
 */
export const GROUND_V1_SEAMS = true;

/**
 * **WP-G6's switch: tier-ordered declaration, five resolves, the frozen ground.**
 *
 * `docs/GROUND-CONTRACT-v1.md` §1.4, §1.6 and §6/WP-G6. Four things flip
 * together because none of them is sound without the others:
 *
 * 1. **Declaration runs in tier order.** A→B→C→D, with one prefix resolve after
 *    each tier, so `view(tier)` can be §1.4's typed prefix view — "the resolved
 *    level where a claim in a tier strictly above *n* owns it, the pristine
 *    baseline level otherwise" — with no third case and no approximation. Two
 *    reorders change worlds: `digCanals` (tier A, rank 0) declares *before*
 *    `buildRetainingWalls` (tier B) instead of after it, and the infra-entry
 *    sweeps (tier C, rank 110) declare before the doorsteps (tier D).
 * 2. **The write-through and `record` are deleted.** Nothing writes
 *    `plan.ground` any more, so nothing needs to; `stats.ground.resolves` is 5
 *    on the settlement path and 0 on a terrain profile.
 * 3. **The freeze.** `plan.ground`/`.fluidTop`/`.fluidKind` become the fifth
 *    resolve's arrays at pass 5c, Group C is re-derived from `resolved.wet` and
 *    the snow rule becomes v0 §1.3's `moved` mask at pass 5d, and `buildGrounds`
 *    becomes the total painter over `moved` — a cut lot's floor is a column the
 *    resolver moved that no material loop covers.
 * 4. **`floorY` is `resolved.ground[k] + 1`.** The seat stops being
 *    `Placement.foundationY` and becomes what the resolver said; a footprint
 *    that did not win its whole rect at one level is `LOAM-W494
 *    GROUND_SEAT_NONPLANAR` and the building is refused.
 *
 * Implies {@link GROUND_V1_SEAMS} (the ladder test). `false` is byte-identical
 * to WP-G5.
 */
// FLIPPED 2026-08-21 (night run, iteration 2): on = shipped. Measured at the
// flip: resolves exactly 5 on all six acceptance docs, written-vs-resolved 0,
// troy finalPlanVsWritten 247→0, hellenist 68/239→0, E495/E494 0, physics
// readback clean, byte-identity was 6/6 in the off state. PENDING (the
// collapse round, itemised in ground-probe-baselines/preflip-g6/README.md
// alongside both acceptance tables): 5c readonly aliases, 5d Group C from
// resolved.wet, buildGrounds-as-total-painter, floorY=view("B")+LOAM-W494
// (any docstring above claiming those land WITH the flag predates this note),
// and the I12 row (zero flag-on; removable only when the off path dies).
export const GROUND_V1_FREEZE = true;

/* -------------------------------------------------------------------------- */
/* terraces from the terrain — the T4/T5/T6 fix                                */
/* -------------------------------------------------------------------------- */

/**
 * **The split criterion reads the hill, not the datum's span.**
 *
 * The defect, measured on Troy r22g4 at `x∈[88,142] z∈[-218,-158]`: natural
 * terrain steps 85→86→87→88 toward the citadel crest and the streets follow it
 * flush, one column per step, which is correct. But the quarter's *planes*
 * elected one level at the lower median of each block's street-perimeter datum
 * and the pad then cut the whole block flat there — the east strip 86→85, the
 * citadel interior 86/87→84. What a walker reads as "the street ramps +1/+2/+3
 * over flat ground" is not a ramp at all: the ground beside it is an
 * excavation, and every building on a plane's uphill rim seats three or four
 * blocks below the street band in front of its own door (the citadel's 27
 * refused seams are exactly those rims).
 *
 * The root cause is that {@link GROUND_TIE_SPAN} reads the **span** of the
 * perimeter datum — `max − min` — and a block crossing three natural steps
 * spans 3, which is inside the threshold of 4. So the block that most needs to
 * be two terraces is precisely the block the criterion lets through as one deep
 * cut. Kai's walk-calibrated law (`memory: hill-town-aesthetic-calibration`) is
 * "flattened terraces following the hill's shape are correct": *more, shallower*
 * terraces on a stepped hill **is** that law, and one deep cut is its violation.
 *
 * So this flag adds a **second split criterion** to the same splitter (T5 is
 * unchanged — a block still splits, never averages; T4's lower-median anchor is
 * unchanged; T6 is what this finally delivers): a block whose own perimeter
 * crosses {@link TERRACE_STEP_SPAN} or more distinct **pristine** ground levels
 * is cut at the natural step lines, and each terrace re-anchors on the lower
 * median of *its own* share of the perimeter — the street it actually fronts.
 * `dissolveTallPairs` still gets the last word.
 *
 * It also gates the **uphill-rim seat exception** ({@link RIM_SEAT_MAX_DROP}),
 * which is the same defect seen from the lot rather than from the block.
 *
 * Independent of the {@link GROUND_V1_RANKS} ladder — it changes what a
 * claimant *asks for*, not where the answer arbitrates — but it **implies**
 * {@link GROUND_PLANE_TIE}, because both halves read the street datum: with no
 * datum there is no per-terrace anchor and no `frontageSeat` to compare a plane
 * against, and the whole construction is dead. A test asserts that implication
 * the way §6's ladder asserts its own.
 *
 * `false` is byte-identical to WP-G5.
 *
 * **Subsumed, and therefore moot, since {@link ELECTION_SOLVE} shipped**
 * (`docs/ELECTION-SOLVE-v0.md` §4). It stays `true` because it still governs
 * the fallback path this flag pair leaves reachable — but with the solve on,
 * *nothing consults this value*: `derivePlatforms` computes `terraceOn` and
 * then returns from the `electionOn` branch before the criterion is read, and
 * the one other reader, `seatOnPlane`'s uphill-rim exception, is short-circuited
 * by the solve (§5's seat is `planeY` with no exception). Do not tune it, do not
 * read a walk verdict into it: the levels decide whether atoms coalesce now.
 */
export const TERRACE_BY_TERRAIN = true;

/**
 * How many distinct **pristine** ground levels a block's perimeter must cross
 * before {@link TERRACE_BY_TERRAIN} cuts it into terraces.
 *
 * Three, and the number is the defect's own: two distinct levels are one step,
 * and one step is what a kerb, a doorstep and `FRONTAGE_RISE` already absorb —
 * cutting there would put a seam through every gently rolling block in every
 * world. Three distinct levels is the first case where a single plane must be
 * wrong about at least one of the block's own streets by two or more, which is
 * the depth at which a door is buried rather than stepped up to.
 *
 * Counted as *distinct levels*, not as a span, deliberately: the span is what
 * {@link GROUND_TIE_SPAN} already reads and the span is what missed this — a
 * block crossing 85→86→87→88 spans 3 and passes a threshold of 4, while its
 * distinct count is 4 and trips this one.
 *
 * Fallback-only since {@link ELECTION_SOLVE} shipped: it is one of the three
 * near-miss thresholds the objective replaced (§0), and the solve never reads it.
 */
export const TERRACE_STEP_SPAN = 3;

/**
 * How far **below** its own frontage a lot's plane may sit before the lot takes
 * the frontage instead — the uphill-rim exception, gated on
 * {@link TERRACE_BY_TERRAIN}.
 *
 * A building on the uphill rim of a plane is straddling a terrace: its plane is
 * the block's, its door is on the street, and where the two disagree by more
 * than a step-and-a-kerb the door is *underground*. Two, because
 * `FRONTAGE_RISE` already lifts a tied seat one above its carriageway and a
 * one-block kerb down off a pavement is a thing towns do — a drop of three or
 * more is not a kerb, it is a hole.
 *
 * Narrow on purpose, and both narrowings matter: it fires only where a frontage
 * exists (F6's no-frontage cases are untouched, and they are the ones with no
 * street to be wrong about), and only in the too-deep direction (a plane
 * *above* its frontage is F5's kerb and stays the plane's).
 *
 * Fallback-only since {@link ELECTION_SOLVE} shipped (§5): frontage agreement
 * is a term in the objective now, so a plane can no longer sit three below the
 * door it serves and the exception has nothing left to catch.
 */
export const RIM_SEAT_MAX_DROP = 2;

/* -------------------------------------------------------------------------- */
/* the election solve — `docs/ELECTION-SOLVE-v0.md`                            */
/* -------------------------------------------------------------------------- */

/**
 * **The switch: the block election stops guessing and starts wanting.**
 * **On — `true` is what ships** (flipped at WP-E3, once A5 made wetness a
 * partition invariant and the river stopped being dammed by its own bank).
 *
 * `true` — the shipped construction, `layout/election-solve.ts`. A block is
 * partitioned into atoms before any level exists, one convex integer objective
 * prices every column's cut, every frontage column's agreement with its own
 * street and every seam's drop, and the assignment minimising it is found
 * exactly by one s–t min-cut. The anchor was a median; the objective is a sum.
 *
 * `false` — the **fallback path**: the pre-election procedure, with
 * {@link TERRACE_BY_TERRAIN} still true, byte-identical to WP-E1. It is kept
 * live rather than deleted so the flip is one flag away from being undone
 * while the walk verdict is outstanding; §4's deletions land at their own
 * collapse packet once the objective has been walked, not here.
 *
 * It **subsumes** {@link TERRACE_BY_TERRAIN}: with this on, the terrace
 * criterion, {@link TERRACE_STEP_SPAN}, {@link GROUND_TIE_SPAN},
 * {@link RIM_SEAT_MAX_DROP}, the lower-median anchor, the storey bucket, the
 * sliver merge and the tall-pair dissolve are never consulted on the live path
 * — the solve returns before the block walk reaches any of them
 * (`platforms.ts`, the `electionOn` branch) and `seatOnPlane` is the
 * plane, unconditionally (§5). They are reachable only through this flag being
 * `false`.
 *
 * It **implies** {@link GROUND_PLANE_TIE}: the frontage term reads
 * `StreetDatum`, and with no datum every `F(i)` is empty and §1.3.3 — the whole
 * of what the anchor was for — says nothing.
 */
export const ELECTION_SOLVE = true;

/**
 * §1.3.1 — what one column of **cut** below its pristine height costs.
 *
 * Cut is worse than fill, 3:2. Every walked complaint names a cut — the west
 * flank cut 2, the citadel interior cut 3, the r22g4 rims that are the 27
 * `LOAM-W413` refusals — and none names a fill: a cut destroys the pristine
 * surface and buries whatever stands on the uphill rim, a fill is ground the
 * dressing already finishes. 3:2 and not 5:1 so a terrace still sits *in* the
 * hill rather than on a podium above it.
 */
export const CUT_W = 3;

/** §1.3.1 — what one column of **fill** above its pristine height costs. */
export const FILL_W = 2;

/** §1.3.2 — the first block of drop between two atoms. A kerb is cheap. */
export const EDGE_KERB = 1;

/** §1.3.2 — the linear part of a deeper drop. */
export const EDGE_STEP = 1;

/**
 * §1.3.2 — the **superlinear** part: a ditch is dear, quadratically.
 *
 * Fixed by the walked fixture, not tuned: for the smallest legal atom (9
 * columns, ~12 contact) one block of cut saves 27 and costs `12·ΔEDGE`;
 * `ΔEDGE(0→1) = 12` and `ΔEDGE(1→2) = 24` are under it, `ΔEDGE(2→3) = 48` is
 * over. A sliver follows the hill to a relative drop of 2 and then joins its
 * neighbour — precisely the walked boundary, out of two weights, with no size
 * threshold anywhere.
 */
export const EDGE_DITCH = 1;

/** §1.3.3 — a plane **one** below its own pavement: a kerb, nearly free. */
export const FRONT_KERB = 1;

/**
 * §1.3.3 — every further block below its own frontage: the buried door.
 *
 * {@link RIM_SEAT_MAX_DROP}'s content as a price instead of a threshold, the
 * jump `1 → 7` being where "more than 2" used to live.
 */
export const FRONT_BURY = 6;

/**
 * §1.3.3 — every block a plane stands **above** its own pavement.
 *
 * Dear, but linear, because a plinth is a mistake and not a hole. This is the
 * +1 lip Kai walked four times.
 */
export const FRONT_LIP = 4;

/**
 * §3.1 A4 — the most atoms one block's solve may carry.
 *
 * The one place the design deliberately loses fidelity (§7.4): an acropolis
 * block with 32 blocks of relief gets 12 terraces, not 32 — a monumental
 * terraced acropolis with ~3-block risers, well inside H1. It bounds the solve
 * a priori: the cut graph is `ATOM_MAX · (DOMAIN_MAX − 1)` nodes at worst.
 */
export const ATOM_MAX = 12;

/**
 * §3.3 — the most levels one block's domain may hold.
 *
 * A block whose span exceeds it is a block the fabric should not have drawn at
 * that `blockSize`. The domain truncates to the 48 values centred on the
 * block's pristine median, the result is optimal within the truncation, and the
 * block is counted `overSpan` in the explanation record. Measured: Troy's
 * citadel spans 29 across the *whole quarter*, so nothing reaches this today.
 */
export const DOMAIN_MAX = 48;

/**
 * A **landmark whose coarse target holds no feasible site** is seated at the
 * *nearest* feasible site to that target, not at whichever random candidate
 * the pool happened to sample.
 *
 * **The walked defect (Kai, r22 deck, `pirates_vs_unicorns`):** the prompt's
 * two protagonists — the pirates' skull fort and the unicorns' crystal
 * colossus — were authored `at [0.22, 0.18]` and `at [0.78, 0.82]`, one per
 * faction. Both targets landed *inside* their own district's 160 × 150
 * envelope, so every candidate drawn from the coarse zero-cost region was
 * refused by the sibling-overlap veto. `buildCandidates` draws
 * `COARSE_SAMPLE_SHARE` of the pool from that region and the rest
 * uniformly over the whole domain — so the placement fell to ~29 uniform dice
 * rolls across 512², and `candidateAt`'s frame clamp piles those rolls onto
 * the region border. The fort landed at (-243, -34) and the colossus at
 * (242, 210): both on the map edge, 163 and 110 blocks from the sites the
 * document named, with the pirate fort nowhere near the pirate island. Moving
 * the `at` had *no effect at all* on where either finished — measured across
 * four variants of the archived document, the winner never moved one block.
 *
 * `landmarkCoarseSeat` (`LOAM-W520`) already rescues the case
 * where the ground alone refused the target. This is the other half: when the
 * target is refused by anything the *solver* put there — a sibling footprint,
 * a clearance ring, a corridor reservation — the answer is still "as close to
 * what the document asked for as the world allows", not a lottery. The solver
 * searches outward from the target's centre in {@link COARSE_RING_STEP}-block
 * square rings up to {@link COARSE_RING_MAX} and takes the cheapest feasible
 * site on the first ring that holds one, and only when that site is strictly
 * nearer the target than the candidate the ordinary pass found.
 *
 * Narrow by construction, and therefore cheap in byte-identity terms: only a
 * `landmark`, only one that **declared** a coarse `at`/`zone`, only when the
 * ordinary answer finished outside it, and only when the ring beats it on
 * distance. A world whose landmarks already sit on their targets — or that
 * declares none — cannot reach this code.
 *
 * `false` restores the r22 behaviour exactly.
 */
export const LANDMARK_COARSE_RING = true;

/** Ring spacing for {@link LANDMARK_COARSE_RING}, in blocks. */
export const COARSE_RING_STEP = 4;

/** How far {@link LANDMARK_COARSE_RING} will search out from the target. */
export const COARSE_RING_MAX = 224;

/**
 * A harbour's **quay sheds are seated behind their own frontage**, not behind
 * the whole quay's deepest one.
 *
 * **The walked defect (Kai, r22 deck, `pirates_vs_unicorns`):** "a couple of
 * houses partially underwater". `layOutHarbour` laid its warehouse and
 * boathouse in one band, `maxOf(shore) - QUAY_DEPTH - 12` — measured from the
 * single shoreline column that reached furthest **seaward** anywhere along the
 * quay. On a straight beach that is harmless. On the ragged bank this world's
 * strait actually produced, it is a band drawn from a headland and applied to
 * a bay: every line whose own waterline cut further inland than the headland's
 * had its share of the shed standing *seaward* of it, over open water, with
 * the shed floor pinned at `quayTop` and the sea lapping through its lower
 * courses. The quay pavement never covered them — that is claimed per line,
 * `QUAY_DEPTH` columns behind each line's *own* `shore[u]` — so the fault is
 * the one band the sheds share, and nothing else.
 *
 * With this on, each shed measures the **most landward** waterline across the
 * columns it actually spans and sits behind that, so its seaward face lands
 * one column inside the quay band on its worst line. A shed with no room
 * behind its own frontage is not built rather than built into the water.
 *
 * `false` restores the r22 behaviour exactly.
 */
export const QUAY_SHED_OWN_SHORE = true;

/* -------------------------------------------------------------------------- */
/* the face finish — a coherent treatment for the faces the ground decisions   */
/* leave behind                                                                */
/* -------------------------------------------------------------------------- */

/**
 * **Every resolved vertical face is finished, not only the ones a quarter
 * declared.**
 *
 * **The walked defect (Kai, n3 Troy, stations S7 and S8):** terrace risers and
 * fill faces read as *exposed geology* — alternating soil and stone strata
 * standing as the vertical face of every step, sandstone pavement sitting on a
 * visible dirt underbelly, and a bluff crown that alternates masonry with bare
 * soil notches. S7's verdict was "miles better but still has an issue", and the
 * issue is the faces; S8's was "kinda, I guess".
 *
 * The mechanism behind it is that a `ColumnPlan` carries **one** subsurface
 * state per column, so a column's *face* is whatever its *top* last agreed to
 * be made of. `finishCutFaces` already states what a cut is made of, but it
 * only ever looks inside a quarter that declared platform `levels` (or a plane
 * that declared itself), and it only looks at columns that are on a platform or
 * on that quarter's own cut ring. The faces the walk complained about are the
 * ones outside that filter: a bank shoulder, a pad edge two passes later cut
 * beside a street the quarter never claimed, the underside of a sidewalk that
 * a street graded flush over ground that fell away.
 *
 * With this on, one materials-only painter runs after `finishCutFaces` over the
 * whole region and finishes **every** face with at least one owned side, in
 * three clauses (`structures/retaining.ts`' `finishFaces`):
 *
 * 1. **Striping** — a raw face of `EXPOSED_FACE_DROP` or more is the hill's own
 *    rock to its full depth, exactly as `faceCuts` finishes a declared cut. A
 *    one-block step is a kerb, which the street pass already copes, and is left
 *    alone.
 * 2. **The pavement underbelly** — a *paved* face column gets one course of the
 *    theme's foundation material under the paving instead of the dirt band the
 *    terrain gave it, and the stone body below that. A pavement that reads as
 *    laid on a footing rather than floating on soil.
 * 3. **Crown coherence** — a face column whose top is a lone notch inside a run
 *    of one other material takes that material, so a dressed crown stops
 *    alternating with the soil the mix speckled into it. Theme-free by
 *    construction: the material is read off the run's own ends, never from a
 *    palette key this pass would have to guess.
 *
 * **Materials only.** The pass writes `plan.subsurface`, `plan.soil` and
 * `plan.surface` and never a level, a fluid or a footprint — the ground freeze
 * is absolute, and the acceptance for the flip is that `plan.ground` is
 * byte-identical on and off. `false` restores the r22 behaviour exactly.
 */
export const FACE_FINISH = true;

/**
 * How far {@link FACE_FINISH}'s crown clause looks along a face for the run it
 * is closing, in columns.
 *
 * Three. A notch of one or two columns inside a coherent run is the speckle a
 * surface *mix* leaves on a crown; a gap longer than that is a place where the
 * face genuinely changes material, and closing it would be this pass inventing
 * a run rather than finishing one.
 */
export const FACE_CROWN_GAP = 3;

/* -------------------------------------------------------------------------- */
/* the descent solve — `docs/DESCENT-SOLVE-v0.md`                              */
/* -------------------------------------------------------------------------- */

/**
 * **The switch: one cliff, one descent, solved against the resolved field.**
 * **Off — `false` is what ships** while WP-D1 is measured; the flip is WP-D3.
 *
 * `true` — `layout/descent-datum.ts` recognizes every steep face the street
 * network must descend (§1), solves each as **one object** by an exact integer
 * Dijkstra over the tread law's own state space (§2), and the quarter's plane
 * **subtracts** the solved corridor (§3.2) so the rank severance that orphaned
 * 271 hillside / 3,421 steep columns is impossible rather than won.
 *
 * `false` — the shipped construction, byte-for-byte: the router draws a
 * `steps` segment, `streetStairLevels` grades it alone against a frozen
 * `natural`, `terminusLandings` negotiates its foot, `deriveSeamStairs` may cut
 * another flight through the same cliff, and the rank table arbitrates what
 * none of them negotiated. Every consumer below is behind an explicit input
 * that defaults to this constant, so the off state reads the same code path it
 * always did.
 *
 * It **implies** {@link ELECTION_SOLVE} — it needs the plane's declarer to
 * subtract a corridor, which is §1.7's construction and lives with the rank —
 * which in turn implies `GROUND_V1_FREEZE`. The ladder is asserted in
 * `test/descent-solve.test.ts`.
 */
export const DESCENT_SOLVE = false;

/**
 * §1.2 S1 — the riser that seeds the scarp mask, in blocks.
 *
 * Two, because one is a kerb (`ELECTION-SOLVE-v0.md` §1.3.3) and
 * `STREET_STAIR_RAIL_DROP = 2` is already the first drop a player can fall
 * down. **A hillside falling one block per column seeds nothing** — the
 * gentle-slope false positive is answered in the mask rather than by a guard.
 */
export const SCARP_RISER_MIN = 2;

/**
 * §1.2 S2 — how far the scarp mask is dilated, in Chebyshev columns.
 *
 * Two, `SEAM_SETBACK`/`SEAM_TREAD`'s order: it makes a stepped scarp — riser,
 * tread, riser — one face instead of three, so anything a tier stack would
 * dress as one stack is one face here.
 */
export const SCARP_DILATE = 2;

/**
 * §1.3 R1 — the datum drop a demand must lose across a face before a descent
 * exists at all. `RETAIN_MAX`, the drop needing at least one retaining wall to
 * be a face at all.
 *
 * Held here rather than imported so the descent's own recognition threshold has
 * one home and one knob (§6.3's last-but-one row); `test/descent-solve.test.ts`
 * asserts it equals `levels.ts`' `RETAIN_MAX`, so the two cannot drift.
 */
export const DESCENT_DROP_MIN = 6;

/**
 * §1.3 R2 — the run a drop must be earned in before a street simply grades it.
 *
 * The same ratio `emit/walkability.ts` audits routes with: a demand is steep
 * iff `chebyshev(u, v) < DESCENT_EARN_RATIO · (Ytop − Ybot)`. At or above it a
 * street grades, which is what a street is for.
 */
export const DESCENT_EARN_RATIO = 2;

/**
 * §1 as amended at WP-D3 — how far from a face a network station may stand and
 * still be one of that face's **terminals**, in Chebyshev columns.
 *
 * Twelve, and the number is R2's own budget rather than a taste: a demand is
 * steep iff `chebyshev(u, v) < DESCENT_EARN_RATIO · drop`, and R1 admits no
 * drop under {@link DESCENT_DROP_MIN}, so the *smallest* pair R1 and R2 can
 * both accept spans `2 · 6 = 12` columns end to end. A reach wider than that
 * can only add pairs R2 is about to throw away; a reach narrower than it would
 * throw away pairs R2 accepts, which is a second, silent threshold on the same
 * quantity. So: `DESCENT_EARN_RATIO · DESCENT_DROP_MIN`, asserted in
 * `test/descent-solve.test.ts` so the three cannot drift apart.
 */
export const DESCENT_REACH = 12;

/**
 * §1 as amended — the width of a solved flight, in columns.
 *
 * Three, `STREET_WIDTH`'s lane: a descent is the flight the router would have
 * drawn across the face, and every flight the router draws is a lane. It is
 * deliberately *not* the width of the streets it joins — a stair as wide as a
 * five-column avenue is a paved cliff, and the terminals' own carriageways go
 * on owning their own columns either side of it (T5 is an equality about a
 * level, not about a cross-section).
 */
export const DESCENT_FLIGHT_WIDTH = 3;

/**
 * §1 as amended — how many stations one face may offer the pairing, at most.
 *
 * The pairing is quadratic in the stations of a single face, so it needs an
 * a-priori bound for the same reason {@link FACE_MAX_COLUMNS} is one. 64 is an
 * order above anything measured (Troy's busiest face offers single digits) and
 * the survivors are the ones **nearest the face**, which is the population the
 * face is about; ties break by ascending region index, never by iteration
 * order.
 */
export const DESCENT_FACE_STATIONS_MAX = 64;

/**
 * §2.5 — how many demands one descent object may carry: a trunk and one joiner.
 *
 * §6.2's S4 row is "**exactly one** descent object claims the face; ≤ 1
 * branch", and this is that row stated where it can be true by construction
 * rather than checked after the fact. The demands a group drops are the junior
 * ones under `compareStreetRank`, so what survives is the senior pair — and a
 * third street wanting down the same cliff within {@link DESCENT_SHARE_SPAN}
 * columns of the other two is asking for a stair beside a stair, which is the
 * defect this design exists to remove.
 */
export const DESCENT_GROUP_DEMANDS_MAX = 2;

/**
 * §1.4 — how far apart two demands' **upper** terminals must be, in Chebyshev
 * columns, before one face is two descent problems.
 *
 * 32: `SEAM_STAIR_JOIN`'s argument taken at cliff scale — past six columns a
 * flight "is not arriving at the street, it is a second street drawn beside
 * it", and a whole descent is measured in tens rather than units. Grouping is
 * single-linkage over the upper terminals in ascending region-index order, so
 * this is the only clustering parameter there is.
 */
export const DESCENT_SHARE_SPAN = 32;

/**
 * §2.2 T3 — the columns of level run a direction change sits inside.
 *
 * `CART_TREAD_RUN`, three. The state's `s` saturates here, a turn is legal only
 * at `s = DESCENT_LANDING_MIN`, and a turn resets it — so **a switchback's
 * landings are a property of the state space, not a special case.**
 */
export const DESCENT_LANDING_MIN = 3;

/**
 * §2.4 M2 — the face above which recognition refuses outright (`LOAM-W412`).
 *
 * The a-priori bound on the state count is `|F| · (span + 1) · 4 ·
 * (LANDING_MIN + 1)`, so a cap on `|F|` is a cap on the solve. 4,096 columns is
 * a 64×64 cliff, an order above anything Troy carries.
 */
export const FACE_MAX_COLUMNS = 4096;

/**
 * §2.3 — what one column of run costs. The unit the other five are priced in.
 */
export const DESCENT_RUN_W = 1;

/**
 * §2.3 — ground falling under a tread faster than the flight is carrying it.
 *
 * Two, pinned by the walked S5a section (y 87–91): a flight riding a scarp with
 * void beneath it prices the drop it is *not* taking, so the path prefers the
 * traverse that walks the fall down at 1:1 — the side-hug shape, out of one
 * weight rather than out of an alignment mode.
 */
export const DESCENT_SCARP_W = 2;

/**
 * §2.3 — ground **rising** under a descent.
 *
 * Eight, above {@link DESCENT_TURN_W} on purpose: rounding a bulge is cheaper
 * than climbing it at any bulge under eight blocks.
 */
export const DESCENT_CLIMB_W = 8;

/**
 * §2.3 — a bend in the flight.
 *
 * Six, pinned by S4's verdict ("jagged", two lines that never meet): a bend
 * costs six columns of run, so a fold wins only where the straight line is
 * infeasible or ~18 columns longer. **This is the term that makes a flight read
 * as one staircase** (§6.3's first row).
 */
export const DESCENT_TURN_W = 6;
