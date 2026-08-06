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
import type { Classification, HeightField, Region, Seed256 } from "@terrainist/stdlib";
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
  | "unsatisfiable";

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
