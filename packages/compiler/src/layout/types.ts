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
} from "@terrainist/spec/ir";

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

/**
 * The one mint for a {@link Placement}.
 *
 * Every site that used to write the literal agreed on two things: the key
 * order above, and `translation === [footprint.x0, foundationY, footprint.z0]`
 * — so those are the two the helper owns. Everything else is passed, because
 * the anchor rule is genuinely not shared (`(size - 1) >> 1` off the min corner
 * in the fabric, the solver's own candidate anchor in `solve.ts`, the rect
 * midpoint in `precincts`/`farm`). Byte-identical by construction: the object
 * it returns has the same keys in the same order with the same values as the
 * literals it replaced (census:.
 */
export function makePlacement(fields: {
  readonly nodePath: string;
  readonly id: string;
  readonly yaw: Yaw;
  readonly mirror: false;
  readonly size: readonly [number, number, number];
  readonly footprint: Rect;
  readonly anchor: { readonly x: number; readonly z: number };
  readonly foundationY: number;
}): Placement {
  return {
    nodePath: fields.nodePath,
    id: fields.id,
    translation: [fields.footprint.x0, fields.foundationY, fields.footprint.z0],
    yaw: fields.yaw,
    mirror: fields.mirror,
    size: fields.size,
    footprint: fields.footprint,
    anchor: fields.anchor,
    foundationY: fields.foundationY,
  };
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
   * coarse target the solver refused (`landmarkCoarseRing`).
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
 * The frontage tie wants a pad whose
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
/* the frontage tie — Part I */
/* -------------------------------------------------------------------------- */

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
 * The frontage tie is unconditional, so quarters do grade datums and this reach is
 * probed; it goes unused only on a compile where nothing graded one.
 */
export const SITE_FRONTAGE_REACH = 12;

/* -------------------------------------------------------------------------- */
/* the served seam — Part IV */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* the ground-plane tie — Part V */
/* -------------------------------------------------------------------------- */

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
 * Read by every block's perimeter datum since 12F:
 * so `if (hi - lo <= FLOOR_HEIGHT)` never gains its second clause. Live from
 * 12F, when the flag was flipped.
 */
export const GROUND_TIE_SPAN = 4;

/* -------------------------------------------------------------------------- */
/* the +1 road lip — post-election street harmonization                        */
/* -------------------------------------------------------------------------- */

/**
 * How many columns beyond the sidewalk's outer lane the harmonizer reads the
 * elected planes over — the flank band, per side.
 *
 * Three, which is `frontageReach`'s neighbourhood without its slack: far
 * enough that a lot's platform is sampled rather than the verge between it and
 * the kerb, near enough that the columns read are the ones a walker sees
 * against the road.
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
 * another street and not a platform at all — silent rather than wrong.
 */
export const STREET_PLANE_MIN_FLANK = 2;

/**
 * Consecutive asking stations a stretch needs before the re-grade honours it.
 *
 * The lip this repairs is a *stretch* of road standing over its neighbourhood,
 * tens of stations long; a two-station agreement is noise in the election's
 * block boundaries, and moving the road for it would trade a lip for a
 * wobble. Four is the shortest run at which the one-block grade cap can drop
 * and recover without the drop being nothing but its own ramps.
 */
export const STREET_PLANE_MIN_RUN = 4;

/* -------------------------------------------------------------------------- */
/* the ground contract v1 flag ladder — */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* terraces from the terrain — the T4/T5/T6 fix                                */
/* -------------------------------------------------------------------------- */

/**
 * How many distinct **pristine** ground levels a block's perimeter must cross
 * before `TERRACE_BY_TERRAIN` cuts it into terraces.
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
 * Fallback-only since the election shipped: it is one of the three
 * near-miss thresholds the objective replaced (§0), and the solve never reads it.
 */
export const TERRACE_STEP_SPAN = 3;

/* -------------------------------------------------------------------------- */
/* the election solve — */
/* -------------------------------------------------------------------------- */

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
 * `RIM_SEAT_MAX_DROP`'s content as a price instead of a threshold, the
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

/** Ring spacing for {@link landmarkCoarseRing}'s search, in blocks. */
export const COARSE_RING_STEP = 4;

/** How far {@link landmarkCoarseRing} will search out from the target. */
export const COARSE_RING_MAX = 224;

/* -------------------------------------------------------------------------- */
/* the face finish — a coherent treatment for the faces the ground decisions   */
/* leave behind                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How far `FACE_FINISH`'s crown clause looks along a face for the run it
 * is closing, in columns.
 *
 * Three. A notch of one or two columns inside a coherent run is the speckle a
 * surface *mix* leaves on a crown; a gap longer than that is a place where the
 * face genuinely changes material, and closing it would be this pass inventing
 * a run rather than finishing one.
 */
export const FACE_CROWN_GAP = 3;

/* -------------------------------------------------------------------------- */
/* the descent solve — */
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
 * It needed the election — the plane's declarer has to
 * subtract a corridor, which is §1.7's construction and lives with the rank —
 * which in turn implies `GROUND_V1_FREEZE`. The ladder is asserted in
 * `test/descent-solve.test.ts`.
 */
export const DESCENT_SOLVE = true;

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

/* -------------------------------------------------------------------------- */
/* the sovereign road — LAW I, applied to roads */
/* -------------------------------------------------------------------------- */

/**
 * **The switch: a road is the terrain's top block, re-materialed.**
 * **Off — `false` is what ships**; the off state is proven byte-identical on
 * the battery docs, which is what every line below is written to make true.
 *
 * `true` — four behaviours, one flag, because they are one idea and any three
 * of them without the fourth is a worse world than none of them:
 *
 * 1. **Roads drape.** No street, arterial or lane declares a graded profile.
 *    Every surfaced column takes the ground oracle's own answer — `view("C")`,
 *    the plan's single ground answer as the street family inherits it — so the
 *    claim it files is numerically the ground that was already there. There is
 *    no pavement above grade, no built-up road bed, no cut: the road **is** the
 *    terrain's top block with a different material on it, which is LAW I's one
 *    sanctioned exception (a surface swap at the surface's own level) and
 *    nothing else.
 * 2. **Roads are rank one.** The surfaced ribbon and its border are a mask, and
 *    at the end of the build no other writer's block may stand in a road
 *    column's surface position or in the three blocks of headroom above it.
 *    A retaining course crossing a road severs the road; a bridge that spans it
 *    with headroom does not, and stays.
 * 3. **No stairs on the ground.** The descent solve is not run, `deriveSeamStairs`
 *    is not called, `junction-steps` is not reachable, and the router's `steps`
 *    and `cart` runs are surfaced as plain draped carriageway rather than by the
 *    tread law. Building roofs and building-internal stairs are not roads and
 *    are untouched.
 * 4. **A stone-brick border.** One column of `stone_bricks` each side of the
 *    ribbon, itself a replacement of the terrain's top block at its own
 *    column's ground. Where another road's surface claims a border cell the
 *    surface wins, so a border can never sever a crossing.
 *
 * It does **not** change {@link DESCENT_SOLVE}'s value: `solveDescents` reads
 * the conjunction, so a fixture that asks for the solve explicitly still gets
 * it and the descent code stays alive and tested.
 */
export const ROAD_SOVEREIGN = true;

/* -------------------------------------------------------------------------- */
/* the pulled road —, authority proportional to need */
/* -------------------------------------------------------------------------- */

/**
 * **The switch: the grader's authority is the terrain's own verdict.**
 * **On — `true` is what ships** (flipped 2026-08-22, landed off at the prior
 * commit with the off state proven byte-identical on the battery docs).
 *
 * `true` **implies {@link ROAD_SOVEREIGN}** — every consumer reads the
 * conjunction, so a fixture that forces `sovereign: false` still gets the
 * graded pass whole and this flag is a no-op on it. That is the
 * {@link DESCENT_SOLVE} ladder pattern, one rung higher.
 *
 * The law, per station `s` of a run and per column `col` of its cross-section:
 *
 * ```
 * y(col) = round( y_drape(col) + pull(s) · ( y_n5(s) − y_drape(col) ) )
 * ```
 *
 * — the homotopy between the two shipped laws. `y_drape` is `ROAD_SOVEREIGN`
 * item 1's oracle, the ground's own answer at the column; `y_n5` is the graded
 * arc level the surfacer consumed before the sovereign flip, which is still
 * computed and which the flip merely stopped reading. At `pull = 0` the row is
 * the drape verbatim, byte for byte; at `pull = 1` it is the graded profile
 * verbatim — level across its width and 1-Lipschitz along the run, with the
 * stairs still off.
 *
 * Kai's ratification, off the n6 walk: *"as long as the terrain was relatively
 * flat, roads looked fine. Generators on this type of terrain should have zero
 * influence on the final position. For steep cliffs they need a ton of
 * authority, essentially to the point of being able to fully decide."*
 *
 * Nothing upstream moves: the street datum, the election and every claim rank
 * are untouched, `ROAD_SOVEREIGN` items 2–4 (the supremacy mask, the headroom,
 * the stone-brick border) ride the blended levels, and the stairs stay off.
 */
export const ROAD_PULL = true;

/**
 * `ROAD-PULL-v0` §2 — the grade at which the grader's authority is still
 * exactly zero, in blocks of rise per block of ground.
 *
 * One riser per four blocks or gentler is the flat quarter the n6 walk called
 * fine, and on it the road is the drape and nothing else.
 */
export const PULL_R_FLAT = 0.25;

/**
 * `ROAD-PULL-v0` §2 — the grade at which the grader decides outright.
 *
 * Three risers per four blocks or steeper is a cliff face, and there the road
 * is the n5 profile verbatim.
 */
export const PULL_R_CLIFF = 0.75;

/**
 * `ROAD-PULL-v0` §2 — the window, in blocks along the run, the grade is
 * measured over, centred on the station and clamped at the run's ends.
 *
 * Thirteen with a P95 rather than a max: one noisy pit inside the window does
 * not summon the grader, and a real cliff fills the window and does.
 */
export const PULL_WINDOW = 13;

/** `ROAD-PULL-v0` §2 — the moving average, in stations, applied to `raw`. */
export const PULL_SMOOTH = 9;

/**
 * `ROAD-PULL-v0` §2 — the ramp limit: `1 / PULL_RAMP` is the most `pull` may
 * change per block of ground.
 *
 * Six, so authority fades in over at least six blocks: a regime change is a
 * transition and never a pop.
 */
export const PULL_RAMP = 6;

/*
 * The n7 walk retune (Kai, 2026-08-22): flats perfect, moderate slopes
 * basically perfect, very steep still too weak. The probe found two causes —
 * troy's real cliffs measure a P95 grade rate of ~0.6–0.7, under `PULL_R_CLIFF`,
 * so smoothstep never commits (the east cliff run held 0.8–0.99 for 22 straight
 * stations and never reached 1); and the moving average plus a lowering-only
 * ramp limiter eroded what peaks there were to a few stations' width. The three
 * levers below are that diagnosis, one mechanism each. Each has a neutral value
 * that reproduces the pre-retune pass byte for byte.
 */

/**
 * The nonlinear boost: `t` becomes `t · (1 + PULL_BOOST · t^PULL_BOOST_POW)`
 * before the smoothstep, so extra authority *compounds with steepness* instead
 * of lifting the whole curve. Flats (`t = 0`) gain exactly nothing, a moderate
 * slope barely moves, and the curve saturates near the grade rate troy's cliff
 * faces actually measure instead of `PULL_R_CLIFF`'s 0.75.
 *
 * `0` is the neutral value: the unboosted `ROAD-PULL-v0` §2 curve, exactly.
 */
export const PULL_BOOST = 2.2;

/**
 * The n8 walk retune (Kai, 2026-08-23): the x=200 avenue — 25 blocks of climb —
 * proved the tail too shallow: a mid-climb bench read as moderate and took
 * authority back mid-ascent. Raising the boost's *exponent* steepens exactly
 * the tail: with `POW = 2, BOOST = 2.2` the moderate reference (`t = 0.3`) is
 * today's value to three decimals and everything below it moves ±0.01, while
 * grade 0.5 goes 0.74 → 0.87 and saturation arrives at grade ~0.54 instead of
 * ~0.59. `1` is the neutral value: with `BOOST = 0.66` it is the n8 curve
 * bit for bit.
 */
export const PULL_BOOST_POW = 2;

/**
 * Commitment through the breather (the n8 walk's x=200 avenue): a flat
 * morphological closing along the run, in blocks. An authority dip *between
 * two high-pull walls* narrower than this fills to the lower wall, so a
 * ludicrous climb's local bench cannot hand the terrain back mid-ascent —
 * the 13-block grade window standing on the bench honestly reads "moderate",
 * and this is the instrument that sees the climb through it. Outer
 * transitions are untouched by construction (a closing never raises anything
 * outside the walls), and a flat quarter has no walls to close between.
 *
 * `0` is the neutral value: no closing, the prior pipeline exactly.
 */
export const PULL_CLOSE = 21;

/**
 * The backstop saturation point: §3.1's Lipschitz relaxation applies each
 * correction scaled by `min(1, pull / PULL_SAT)` instead of by `pull`, so the
 * riser-killer works at FULL strength from `pull = PULL_SAT` up rather than
 * leaving a 15% terrain residue at `pull = 0.85` — which on a five-block scarp
 * rounds back into the very steps the backstop exists to remove. Where `pull`
 * is 0 the scale is still exactly 0: the flat quarters stay the drape to the
 * bit. `1` is the neutral value: scaling by `pull` itself, the §3.1 original.
 */
export const PULL_SAT = 0.7;

/**
 * The committed road's grade ceiling: one riser per `PULL_TREAD` blocks of
 * ground. The n9/n11 walks proved the pull *field* was no longer the
 * bottleneck on extreme slopes — pull is already 1 there, and at 1 the graded
 * profile's own ceiling was 1:1, which is the terrain's shape too: a riser
 * chain, indistinguishable from the drape with the stairs banned. This is the
 * lever that makes a fully-pulled climb an engineered ramp instead — landings
 * between risers, the divergence absorbed as cut and fill. Feasibility is the
 * bound: a run must still span its climb, so `total rise / run length` puts a
 * hard floor under `1 / PULL_TREAD` for any given street.
 *
 * `1` is the neutral value: the 1:1 ceiling, the prior backstop exactly.
 */
export const PULL_TREAD = 1;

/**
 * The stair dressing (Kai, 2026-08-23) — the gate of the stair saga: the
 * flight-object mini-project proceeds only if this demonstration walks well.
 *
 * Every street or road column that stands exactly one block above a paved
 * neighbour it faces gets its **top course swapped for a stair block facing
 * the rise** — `structures/road-risers.ts`. The pass moves NO level, claims
 * NO column and lifts NOTHING: the pull field already chose every riser
 * (`ROAD-PULL-v0`, riser law: never more than one riser per block where the
 * blend holds), so this is `COHERENT-SOURCE-v0` LAW I's one sanctioned
 * exception — a surface swap at the surface's own level — and deliberately
 * not a revival of `junction-steps.ts`, whose lifting is what made it a
 * grader and got it retired. A two-block face stays bare and honest, the
 * class the street cliff census counts (26 on troy at n13).
 *
 * `false` is the neutral value: bare full-block risers, exactly the n13 pass.
 *
 * **OFF by Kai's walk verdict (2026-08-24, n14b):** the gate PASSED — the
 * dressing was coherent, refusals honest, no new defect class — and the
 * *taste* verdict retired it anyway: "minecraft is a voxel game, anyone
 * accepts blocky; stairs read as stairs and feel less natural." The lesson
 * carries into the flight object: stairs are ARCHITECTURE for real drops
 * (junction cliffs, terrace connections, monumental approaches), never
 * texture for a road's own risers. The pass stays in-tree as the proven
 * vocabulary the flight dresser will reuse.
 */
export const STAIR_DRESS = false;
