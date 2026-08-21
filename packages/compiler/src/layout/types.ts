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
export const GROUND_V1_FREEZE = false;

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
