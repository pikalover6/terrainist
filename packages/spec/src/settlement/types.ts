/**
 * Settlement-profile document types.
 *
 * `"profile": "settlement"` is a **superset** of the terrain profile: every
 * terrain construct is legal and carries exactly the terrain profile's
 * restrictions (no constraints, no ports, edits only under the heightfield,
 * one heightfield and one climate node). On top of that the root may carry
 * **structure nodes** — `building.grammar@0` and `road.network@0` generators —
 * and at most one `plaza` primitive, all of which go through the layout solver.
 *
 * Like the terrain types, these are the *validated* shapes: a value typed
 * {@link SettlementDocument} has already been through
 * {@link validateSettlementDocument}.
 */

import type {
  ClimateNode,
  ForestNode,
  HeightfieldNode,
  RegionEnvelope,
  TerrainMeta,
  TerrainStyle,
} from "../terrain/types.js";
import type { CanonicalConstraint } from "./constraints.js";
import type { ProgramMap } from "../programs/types.js";

/** Generators the settlement profile adds on top of the terrain set. */
export const STRUCTURE_GENERATORS = [
  "building.grammar@0",
  "road.network@0",
  // The precinct kits (F3). They are structure nodes in every sense the solver
  // cares about — a box, a yaw, a footprint it reserves like any other — and
  // differ only in what the structure pass does with the box once it is placed:
  // a whole compound of ground works, props and buildings, laid out
  // deterministically rather than solved.
  "precinct.airport@0",
  "precinct.harbour@0",
  // F17's holding (`docs/FARM-PLAN-v0.md` §3). It joins the precinct *family* —
  // one node is one whole compound laid out deterministically from one
  // envelope — but deliberately **not** {@link PRECINCT_GENERATORS}: that set
  // is the two kits that level their envelope and declare `precinct.ground`,
  // and a farm must never level its envelope (§3.2's caveat). It also takes a
  // *region* envelope rather than a box, because a holding is a piece of
  // ground.
  "precinct.farm@0",
] as const;

/**
 * The `precinct.*@0` kits that level an envelope and lay a compound in it.
 *
 * `precinct.farm@0` is in the family and not in this set — see the comment on
 * {@link STRUCTURE_GENERATORS}.
 */
export const PRECINCT_GENERATORS = ["precinct.airport@0", "precinct.harbour@0"] as const;

/** The F17 holding generator (`docs/FARM-PLAN-v0.md`). */
export const FARM_GENERATOR = "precinct.farm@0";

/** True for a `precinct.farm@0` node. */
export function isFarmGenerator(generator: string): generator is "precinct.farm@0" {
  return generator === FARM_GENERATOR;
}

/** A precinct generator id. */
export type PrecinctGenerator = (typeof PRECINCT_GENERATORS)[number];

/** True for a node that is one of the precinct kits. */
export function isPrecinctGenerator(generator: string): generator is PrecinctGenerator {
  return (PRECINCT_GENERATORS as readonly string[]).includes(generator);
}

/** A structure generator id. */
export type StructureGenerator = (typeof STRUCTURE_GENERATORS)[number];

/**
 * Terrain-profile generators the settlement profile does **not** inherit.
 *
 * `cave.carver@0` is excluded because it has no occupancy to respect yet: the
 * v0.2 `protectTags` param — the field that keeps a cave from eating a town's
 * foundations — is unimplemented, so a cave under a settlement would be a
 * lottery on whether the smithy still has a floor. It comes back when
 * `protectTags` does.
 */
export const SETTLEMENT_EXCLUDED_GENERATORS = ["cave.carver@0"] as const;

/**
 * Port types the profile implements. Other v0.2 types parse with `LOAM-T206`.
 *
 * `tunnel_stub` joined the set with the underground connective pass: it is the
 * one port type whose *position* is not on the node's above-ground shell, so it
 * is resolved by the tunnel pass against the building's cellar rather than by
 * the generic port geometry — but it is resolved, and a document that declares
 * one gets the opening it asked for.
 */
export const PORT_TYPES = ["door", "road_stub", "tunnel_stub"] as const;

/** A port type the profile implements. */
export type PortType = (typeof PORT_TYPES)[number];

/** Every port type Loam v0.2 §5.3 defines — the set that parses without error. */
export const V02_PORT_TYPES = [
  "door",
  "gate",
  "arch",
  "window",
  "road_stub",
  "path_stub",
  "tunnel_stub",
  "bridge_stub",
  "rail_stub",
  "dock",
  "canal_stub",
  "stair_top",
  "stair_bottom",
  "shaft",
  "socket",
  "interior",
] as const;

/** The four horizontal faces the solver can place a port on. */
export const HORIZONTAL_FACES = ["north", "south", "east", "west"] as const;

/** A horizontal face. */
export type HorizontalFace = (typeof HORIZONTAL_FACES)[number];

/** Every `face` value v0.2 §5.1 allows. */
export const V02_FACES = [...HORIZONTAL_FACES, "up", "down", "any", "auto"] as const;

/** A declared face. */
export type PortFace = (typeof V02_FACES)[number];

/** A declared port (§5.1 subset). */
export interface PortDeclaration {
  readonly type: string;
  readonly face?: PortFace;
  /** `"center"` or `[u, v]` along/up the face. */
  readonly at?: "center" | readonly [number, number];
  readonly width?: number;
  readonly height?: number;
  readonly tags?: readonly string[];
  readonly note?: string;
}

/** The yaw values the solver may choose. */
export const YAWS = [0, 90, 180, 270] as const;

/** A quantized yaw. */
export type Yaw = (typeof YAWS)[number];

/** A box envelope (§3.3 subset): a requested volume with no position. */
export interface BoxEnvelope {
  readonly shape: "box";
  readonly size: readonly [number, number, number];
  readonly minSize?: readonly [number, number, number];
  readonly maxSize?: readonly [number, number, number];
  readonly flexible?: boolean;
  readonly rotations?: readonly Yaw[];
  readonly padding?: number;
}

/**
 * A `precinct.farm@0` envelope: a piece of ground, so two numbers.
 *
 * `docs/FARM-PLAN-v0.md` §3.3 — required, `"shape": "region"`, floor 40 × 40.
 * A holding is not a box: it levels its own yard and each of its fields
 * separately and leaves the rest of the envelope alone, so there is no height
 * to reserve.
 */
export interface FarmEnvelope {
  readonly shape: "region";
  readonly size: readonly [number, number];
  readonly padding?: number;
}

/** Smallest holding envelope: one yard, one parcel and the setbacks (§3.3). */
export const FARM_MIN_ENVELOPE = Object.freeze([40, 40] as const);

/** The crop ids `params.crops` may name (`docs/FARM-PLAN-v0.md` §6.2). */
export const FARM_CROPS = [
  "wheat",
  "carrots",
  "potatoes",
  "beetroots",
  "pumpkin",
  "berries",
  "pasture",
] as const;

/** A crop id. */
export type FarmCrop = (typeof FARM_CROPS)[number];

/** The `params.edge` vocabulary (§3.3). */
export const FARM_EDGES = ["fence", "wall", "none"] as const;

/** A parcel boundary treatment. */
export type FarmEdge = (typeof FARM_EDGES)[number];

/** Farmstead archetypes `farmstead: "auto"` draws from (§7.2). */
export const FARMSTEAD_ARCHETYPES = [
  "farmhouse",
  "barn",
  "granary",
  "stable",
  "chicken_coop",
  "silo",
  "windmill",
  "dovecote",
  "apiary",
] as const;

/** `precinct.farm@0` params, defaulted (`docs/FARM-PLAN-v0.md` §3.3). */
export interface FarmParams {
  readonly parcels?: number;
  readonly parcelSize?: number;
  readonly crops?: readonly string[];
  readonly farmstead?: "auto" | "none" | readonly string[];
  readonly edge?: FarmEdge;
  readonly fallow?: number;
}

/** The param defaults §3.3 states, in one place so nothing re-derives them. */
export const FARM_PARAM_DEFAULTS = Object.freeze({
  parcels: 4,
  parcelSize: 16,
  edge: "fence" as FarmEdge,
  fallow: 0,
});

/** The ranges §3.3 states; `LOAM-T226` names them back at an author. */
export const FARM_PARAM_RANGES = Object.freeze({
  parcels: Object.freeze({ min: 1, max: 24 }),
  parcelSize: Object.freeze({ min: 10, max: 28 }),
  fallow: Object.freeze({ min: 0, max: 1 }),
});

/** Fields every structure-ish node shares. */
interface StructureBase {
  readonly id: string;
  readonly constraints?: readonly CanonicalConstraint[];
  readonly ports?: Readonly<Record<string, PortDeclaration>>;
  readonly optional?: boolean;
  readonly seedSalt?: string;
  readonly tags?: readonly string[];
  readonly label?: string;
  readonly note?: string;
}

/**
 * A `building.grammar@0` / `road.network@0` / `precinct.*@0` node under the
 * root.
 *
 * The envelope is a box for every generator but `precinct.farm@0`, whose
 * envelope is a {@link FarmEnvelope} — a holding is ground, not a volume. Read
 * it through {@link farmEnvelopeOf} rather than by casting.
 */
export interface StructureNode extends StructureBase {
  readonly kind: "generator";
  readonly generator: StructureGenerator;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly envelope?: BoxEnvelope | FarmEnvelope;
}

/** A node's envelope when it is a farm's region envelope, else `undefined`. */
export function farmEnvelopeOf(node: {
  readonly generator: string;
  readonly envelope?: BoxEnvelope | FarmEnvelope;
}): FarmEnvelope | undefined {
  if (!isFarmGenerator(node.generator)) return undefined;
  const envelope = node.envelope;
  return envelope !== undefined && envelope.shape === "region" ? envelope : undefined;
}

/** A node's envelope when it is a box — every generator but the farm. */
export function boxEnvelopeOf(node: {
  readonly envelope?: BoxEnvelope | FarmEnvelope;
}): BoxEnvelope | undefined {
  const envelope = node.envelope;
  return envelope !== undefined && envelope.shape === "box" ? envelope : undefined;
}

/**
 * A node that invokes an authored program (spec v0.2 §7.6).
 *
 * Two spellings, one type: `"generator": "authored:<id>"` invokes the program
 * once against the envelope the program declares, and `"scatter.program@0"`
 * scatters it. Deliberately outside {@link SettlementChildNode}: the validator
 * checks both spellings against the document's `programs` map, and the passes
 * that care reach for them by generator string.
 */
export interface ProgramNode extends StructureBase {
  readonly kind: "generator";
  /** `authored:<id>`, or `scatter.program@0`. */
  readonly generator: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly envelope?: BoxEnvelope;
}

/**
 * A `prop.place@0` node under the root.
 *
 * Its own type rather than a third {@link StructureGenerator}, because it is
 * not one: a prop takes no part in the layout solve. It carries the *coarse*
 * placement vocabulary in its params (`zone`, `at`, `jitter`, `yaw`) and is
 * resolved against the finished ground by the structure pass, which is the
 * only stage that knows where the water and the lanes ended up.
 */
export interface PropNode extends StructureBase {
  readonly kind: "generator";
  readonly generator: "prop.place@0";
  readonly params?: Readonly<Record<string, unknown>>;
  readonly envelope?: BoxEnvelope;
}

/** True for a `prop.place@0` node. */
export function isPropNode(node: SettlementChildNode): node is PropNode {
  return node.kind === "generator" && node.generator === "prop.place@0";
}

/** The optional single plaza: a primitive holding a region of open ground. */
export interface PlazaNode extends StructureBase {
  readonly kind: "primitive";
  readonly envelope: RegionEnvelope;
  readonly params?: Readonly<Record<string, unknown>>;
}

/* -------------------------------------------------------------------------- */
/* districts (fabric v2, F1)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How a district's street skeleton is drawn — the **urban form** vocabulary.
 *
 * Seven ids, one idea each about how a settlement is organised, and the wire
 * key stays `params.fabric`: renaming it to `params.form` would have cost every
 * committed document, every kit example and every golden and bought a better
 * noun (`docs/URBAN-FORMS-v0.md` §6.1). The prose calls the concept an urban
 * form; the key stays where the model already knows to look.
 *
 * `grid` and `organic` are frozen — `organic` is a grid that has been let go of,
 * it is what four city characters map to and what half the goldens are built on,
 * and `grown` is the real unplanned town. Every id here is checked against the
 * compiler's form registry by a test, in both directions — **except an id in
 * {@link DISTRICT_FABRIC_ALIASES}**, which is a legal spelling of another id
 * rather than a form of its own.
 */
export const DISTRICT_FABRICS = [
  "grid",
  "organic",
  "grown",
  "radial",
  "canal",
  // An **alias** since the `docs/SITE-PLAN-v0.md` §7.1 cutover (2026-08-08):
  // still legal to write, and it draws `hillside`. See
  // {@link DISTRICT_FABRIC_ALIASES}.
  "terraced",
  "linear",
  // `docs/SITE-PLAN-v0.md` §7.1: the site planner, and since the cutover the
  // one form a hill-town prompt reaches.
  "hillside",
] as const;

/** A street-skeleton fabric — an urban form id. */
export type DistrictFabric = (typeof DISTRICT_FABRICS)[number];

/**
 * Ids that are a **legal spelling of another id**, not a form of their own
 * (`docs/SITE-PLAN-v0.md` §7.1).
 *
 * The reach law: a document that names a retired form keeps compiling. When the
 * site planner replaced the bench-field construction at the 2026-08-08 cutover,
 * `terraced` was not deleted from the vocabulary — deleting it would have turned
 * every document, every kit example and every model that learned the old id into
 * a validation error for a rename. It resolves to `hillside` at the registry
 * lookup, which is the single place the compiler turns a fabric id into a form,
 * and the compiler emits one informational diagnostic naming the alias so the
 * substitution is never silent.
 *
 * An alias is **not offered** anywhere an id is taught: the classifier's hint
 * table and the settlement kit both key off this map to exclude it, so nothing
 * generated reaches the old spelling and only a document that already carries it
 * does.
 */
export const DISTRICT_FABRIC_ALIASES = Object.freeze({
  terraced: "hillside",
} as const) satisfies Readonly<Partial<Record<DistrictFabric, DistrictFabric>>>;

/** An id that is a spelling of another id. */
export type DistrictFabricAlias = keyof typeof DISTRICT_FABRIC_ALIASES;

/** The fabric this id draws — itself, unless it is an alias. */
export function resolveDistrictFabricAlias(id: DistrictFabric): DistrictFabric {
  const aliases = DISTRICT_FABRIC_ALIASES as Readonly<Record<string, DistrictFabric | undefined>>;
  return aliases[id] ?? id;
}

/** Every fabric id that is a form of its own — the vocabulary minus the aliases. */
export const URBAN_FORM_IDS: readonly DistrictFabric[] = DISTRICT_FABRICS.filter(
  (id) => resolveDistrictFabricAlias(id) === id,
);

/** How much of a district's lot supply is actually built on. */
export const DISTRICT_DENSITIES = ["low", "medium", "high"] as const;

/** A district density. */
export type DistrictDensity = (typeof DISTRICT_DENSITIES)[number];

/**
 * How a quarter's ground is prepared (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.2).
 *
 * - `"pad"` — one plane for the whole quarter. The solver levels it. Today's
 *   default for every form but `terraced`, and unchanged.
 * - `"benched"` — the form cuts its own level platforms, the fabric pass founds
 *   buildings on them, and the solver lays no pad. This is what `terraced` has
 *   always done; it is declared by the form, so an author rarely writes it.
 * - `"stepped"` — `"benched"`, *plus* derived platforms where the form declares
 *   none, plus seam treatment: retaining walls between the levels, derived
 *   stairs, and the rule that a platform you cannot reach is not a platform.
 *   This is the key an author writes for a hill town.
 *
 * Omitted means "what the form implies", which is `"pad"` everywhere but
 * `terraced`. Nothing here names a height, a wall or a step count: an author
 * says *how the ground behaves*, never where a wall goes.
 */
export const DISTRICT_GROUND_POLICIES = ["pad", "benched", "stepped"] as const;

/** A ground policy. */
export type DistrictGroundPolicy = (typeof DISTRICT_GROUND_POLICIES)[number];

/** Bounds on `params.courtyards` — a share of the *eligible* blocks. */
export const COURTYARD_SHARE_MIN = 0;
export const COURTYARD_SHARE_MAX = 1;

/* -------------------------------------------------------------------------- */
/* circumvallation (`infra.wall@0`)                                            */
/* -------------------------------------------------------------------------- */

/**
 * The wall styles `infra.wall@0` implements.
 *
 * Three, and each is a different *construction* rather than a different
 * palette: a masonry curtain with a crenellated cap, a timber palisade with a
 * hoarding, and an earthwork rampart with a revetted crest. A style that was
 * only a material swap would be a `palettes` entry, not a style.
 */
export const WALL_STYLES = ["masonry", "palisade", "earthwork"] as const;

/** A wall style. */
export type WallStyle = (typeof WALL_STYLES)[number];

/** Bounds on {@link WallOptions}, restated by the compiler's course pass. */
export const WALL_MIN_MARGIN = 4;
export const WALL_MAX_MARGIN = 64;
export const WALL_MIN_TOWER_PITCH = 16;
export const WALL_MAX_TOWER_PITCH = 128;
export const WALL_MIN_HEIGHT = 4;
export const WALL_MAX_HEIGHT = 14;

/**
 * `walls` — the settlement's circumvallation, opted into by a `district` or a
 * `city`.
 *
 * Deliberately **not** a course. There is no key here that names a coordinate,
 * a vertex or a length, for exactly the reason {@link CityParams} carries no
 * list of quarters: a ring an author enumerates is the rectangle problem again
 * with more typing, and it cannot follow ground it has never seen. The course
 * is derived by the compiler from the settlement's own finished footprint —
 * see `packages/compiler/src/structures/wall-course.ts` — and everything the
 * author gets to say is *how thick, how tall, how often a tower, how far out*.
 */
export interface WallOptions {
  /** Default `"masonry"`. */
  readonly style?: WallStyle;
  /**
   * Columns the course stands **outward** of the built extent.
   * {@link WALL_MIN_MARGIN}..{@link WALL_MAX_MARGIN}; default 10.
   */
  readonly margin?: number;
  /**
   * Columns of arc length between towers.
   * {@link WALL_MIN_TOWER_PITCH}..{@link WALL_MAX_TOWER_PITCH}; default 40.
   */
  readonly towerPitch?: number;
  /**
   * Blocks from the ground to the wall-walk.
   * {@link WALL_MIN_HEIGHT}..{@link WALL_MAX_HEIGHT}; default 6.
   */
  readonly height?: number;
  /**
   * Open a gate wherever a road crosses the course. Default `true`.
   *
   * `false` is a siege wall, not a city wall: the roads are cut. It exists
   * because "the wall the river town abandoned" is a thing to author, and
   * because a gate with nothing behind it is worse than no gate.
   */
  readonly gates?: boolean;
  /**
   * Blocks to build the curtain from, overriding what the settlement's own
   * material theme gives.
   *
   * **Almost always leave this out.** A `masonry` wall with no `materials`
   * takes the theme's built-ground roles — the same stone the retaining walls,
   * the kerbs and the plinths of that town are cut from — which is what stops a
   * grey circuit standing round a mud-brick city. This key exists for the one
   * case the theme cannot say: a wall that is deliberately *not* the town's own
   * stone (a conqueror's citadel, an older ruin the town grew around).
   *
   * Partial: a named role overrides, an omitted one keeps the derived block.
   */
  readonly materials?: WallMaterialOverrides;
}

/**
 * Per-role block overrides for {@link WallOptions.materials}.
 *
 * The five roles the curtain is built from. Every one must be a **full cube**:
 * a slab or a fence in a curtain is a hole a mob paths through, and the
 * crenellation reads from the gap rather than from the block shape.
 */
export interface WallMaterialOverrides {
  /** The body of the curtain, and its footing. */
  readonly core?: string;
  /** The wall-walk's top course — what a player stands on. */
  readonly walk?: string;
  /** The parapet band either side of the walk. */
  readonly parapet?: string;
  /** The merlon course on top of the parapet. */
  readonly merlon?: string;
  /** A tower's body. */
  readonly tower?: string;
}

/** Params a `district` node carries. */
export interface DistrictParams {
  readonly fabric: DistrictFabric;
  readonly density: DistrictDensity;
  /** Archetype names the auto-infill draws from, in declaration order. */
  readonly mix: readonly string[];
  /** Preferred block size between street centre lines, in blocks. A hint. */
  readonly blockSize?: number;
  /**
   * What the plan is *about*: `"plaza"`, or the id of one of this district's
   * own `children`.
   *
   * Read by the `radial` form, which puts it in the hub and runs everything
   * else at it. Written on a quarter whose form does not read it, it is a note
   * saying which form does — never a silent no-op.
   */
  readonly focus?: string;
  /** Leave one central block unbuilt as a square. */
  readonly plaza?: boolean;
  /**
   * The share of *eligible* blocks that close around a courtyard, 0..1.
   *
   * A courtyard block is an introverted block: the buildings enclose a shared
   * interior — a well, a tree, a cloister walk — reached through an arched
   * passage cut under a building, and the street wall is unbroken. Eligibility
   * is measured (`docs/COURTYARDS-AND-LEVELS-v0.md` §4.2), so this is a share
   * of the blocks that *can*, not of all of them; a quarter where none can
   * reports `COURTYARD_NONE` rather than silently building nothing.
   *
   * Default 0, which is what makes every document written before Phase 4.2
   * byte-identical. Courtyards are **not** a form: `grid`, `grown`, `radial`
   * and `terraced` can all have them.
   */
  readonly courtyards?: number;
  /**
   * How this quarter's ground is prepared. See {@link DistrictGroundPolicy}.
   *
   * Omitted means "what the resolved urban form implies".
   */
  readonly ground?: DistrictGroundPolicy;
  /** Ring the finished quarter with a wall. See {@link WallOptions}. */
  readonly walls?: WallOptions;
}

/**
 * A `district`: a composite whose *void* is authored and whose solid follows.
 *
 * Unlike every other node in the profile, a district is not a thing that is
 * placed among other things — it is a piece of ground that gets a street
 * skeleton first, then blocks, then lots, and only then buildings. Its
 * `children` are **landmarks**: ordinary `building.grammar@0` nodes that claim
 * the lots big enough to hold them. Everything else on the block is infilled
 * from {@link DistrictParams.mix}.
 *
 * The node itself goes through the ordinary layout solve as a single footprint,
 * so `zone`, `at`, `distance` and the rest still say *where the district is*.
 * What the solver never sees is anything inside it.
 */
export interface DistrictNode extends StructureBase {
  readonly kind: "district";
  readonly envelope: RegionEnvelope;
  readonly params: DistrictParams;
  /** Landmark buildings, in document order. */
  readonly children?: readonly StructureNode[];
}

/** True for a `district` node. */
export function isDistrictNode(node: SettlementChildNode): node is DistrictNode {
  return node.kind === "district";
}

/* -------------------------------------------------------------------------- */
/* cities (fabric v3, C1)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The eight characters a district cell can take.
 *
 * The same list the compiler's `DistrictCharacter` union spells (C1's pinned
 * `CityPlan` contract); it is restated here because the *author* may address a
 * character by name — `params.characters.industrial` names the mix a port
 * quarter builds from — and the spec package cannot import the compiler.
 * `packages/spec/test/settlement-validate.test.ts` holds the two in step.
 */
export const DISTRICT_CHARACTERS = [
  "core",
  "grid",
  "rowhouse",
  "lanes",
  "industrial",
  "civic",
  "park",
  "waterfront",
] as const;

/** A district-cell character. */
export type DistrictCharacterName = (typeof DISTRICT_CHARACTERS)[number];

/** How much city the plan draws. */
export const CITY_SIZES = ["small", "medium", "large"] as const;

/** A city size. */
export type CitySize = (typeof CITY_SIZES)[number];

/** Most diagonals a city plan will cut through its own fabric. */
export const CITY_MAX_DIAGONALS = 2;

/**
 * Params a `city` node carries.
 *
 * Deliberately *not* a list of districts. An author says "a medium coastal
 * city, one diagonal, these landmarks" and the plan layer answers with an
 * armature and whatever cells fall out of it — which is the whole inversion C1
 * exists for. Pinning a particular quarter by hand is still available and
 * unchanged: write an ordinary `district` node beside the city.
 */
export interface CityParams {
  readonly size: CitySize;
  /** Archetypes the ordinary infill draws from, in declaration order. */
  readonly mix: readonly string[];
  /**
   * Per-character mix overrides. A character the author does not name builds
   * from {@link CityParams.mix}.
   */
  readonly characters?: Readonly<Partial<Record<DistrictCharacterName, readonly string[]>>>;
  /**
   * Per-character urban form, exactly parallel to {@link CityParams.characters}.
   *
   * A character the author does not name keeps the compiler's own table, which
   * is frozen at `grid`/`organic` — so a city with no `forms` key is exactly the
   * city it was before the form registry existed (§5.5, §10.6).
   */
  readonly forms?: Readonly<Partial<Record<DistrictCharacterName, DistrictFabric>>>;
  /**
   * Draw a shoreline drive. Omitted means "if the footprint has a coast" —
   * `false` suppresses the drive even on the water, `true` asks for one and
   * reports a note when there is no shore to follow.
   */
  readonly coastal?: boolean;
  /** Diagonals cut through the fabric, 0..{@link CITY_MAX_DIAGONALS}. */
  readonly diagonals?: number;
  /** Draw a ring road. Omitted means "if the footprint is big enough". */
  readonly ring?: boolean;
  /** Preferred block size between street centre lines. A hint; cells drift. */
  readonly blockSize?: number;
  /**
   * {@link DistrictParams.courtyards}, applied to every cell that gets a
   * fabric. A cell is a compiler-chosen quarter with no `params` of its own,
   * so this is the only way to ask a whole city for courtyards.
   */
  readonly courtyards?: number;
  /** {@link DistrictParams.ground}, applied to every cell that gets a fabric. */
  readonly ground?: DistrictGroundPolicy;
  /**
   * The set pieces (C4): the handful of anchors placed for their *relationship*
   * to the plan rather than sprinkled through it.
   *
   * Omitted means "seat what the ground offers", which is the intended default
   * — a boulevard that ends on nothing is the thing this exists to fix, and an
   * author should not have to ask. `false` suppresses the track outright.
   */
  readonly setPieces?: boolean | CitySetPieces;
  /** Ring the finished city with a wall. See {@link WallOptions}. */
  readonly walls?: WallOptions;
}

/** The five kinds of anchor a city seats. */
export const SET_PIECE_KINDS = [
  "landmark",
  "bridge",
  "promenade",
  "stair",
  "square",
] as const;

/** One set-piece kind, as the authoring surface spells it. */
export type SetPieceKindName = (typeof SET_PIECE_KINDS)[number];

/** Most anchors one city may seat. */
export const SET_PIECE_MAX_COUNT = 6;

/** Fewest anchors it is worth asking for. */
export const SET_PIECE_MIN_COUNT = 1;

/** The long spelling of {@link CityParams.setPieces}. */
export interface CitySetPieces {
  /** Cap on anchors of every kind together, 1..{@link SET_PIECE_MAX_COUNT}. */
  readonly max?: number;
  /** When present, only these kinds are considered. Declaration order is free. */
  readonly kinds?: readonly SetPieceKindName[];
}

/**
 * Arterial kinds a landmark's `params.vista` may name.
 *
 * A ring is deliberately absent: it is a closed loop, so it has no end to stand
 * at and look down, and `Arterial.termini` is empty for one. Naming it is an
 * authoring error with a fix rather than a request that silently does nothing.
 */
export const VISTA_ARTERIALS = ["spine", "boulevard", "diagonal", "drive"] as const;

/** An arterial kind a vista pin may name. */
export type VistaArterialName = (typeof VISTA_ARTERIALS)[number];

/**
 * A `city`: **arterials first, districts as the residue.**
 *
 * One level of inversion above {@link DistrictNode}. A district authors a
 * rectangle and fills it with a grid; a city authors nothing but its ground and
 * its landmarks, and the plan layer draws a drive along the real shoreline, a
 * spine along the long axis, a diagonal through the middle and a ring where
 * there is room for one — then takes the faces of that armature as its
 * districts. Those faces are arbitrary polygons meeting at whatever angle the
 * arterial that borders them runs at, which is what a rectangle can never be.
 *
 * `children` are the things that *must* exist: landmark buildings, and precinct
 * kits (a harbour, an airport) that each claim a whole cell.
 */
export interface CityNode extends StructureBase {
  readonly kind: "city";
  readonly envelope: RegionEnvelope;
  readonly params: CityParams;
  /** Landmarks and precincts, in document order. */
  readonly children?: readonly StructureNode[];
}

/** True for a `city` node. */
export function isCityNode(node: SettlementChildNode): node is CityNode {
  return node.kind === "city";
}

/** Any node the settlement profile allows below the root. */
export type SettlementChildNode =
  | HeightfieldNode
  | ClimateNode
  | ForestNode
  | StructureNode
  | PropNode
  | PlazaNode
  | DistrictNode
  | CityNode;

/** True for the nodes the layout solver places. */
export function isPlaceableNode(
  node: SettlementChildNode,
): node is StructureNode | PlazaNode | DistrictNode | CityNode {
  if (node.kind === "primitive") return true;
  // A district is placed as one footprint — the fabric pass then subdivides
  // what the solver reserved. See {@link DistrictNode}.
  if (node.kind === "district") return true;
  // …and a city likewise, one level up: the solver reserves the ground, the
  // city plan draws the arterials across it and the cells are the residue.
  if (node.kind === "city") return true;
  // A prop node is deliberately not placeable: it is resolved coarsely by the
  // structure pass against the finished ground, not by the solver.
  return (STRUCTURE_GENERATORS as readonly string[]).includes(node.generator);
}

/** The root composite of a settlement document. */
export interface SettlementRootNode {
  readonly id: string;
  readonly kind: "composite";
  readonly envelope: RegionEnvelope;
  readonly children: readonly SettlementChildNode[];
  readonly tags?: readonly string[];
  readonly seedSalt?: string;
  readonly label?: string;
  readonly note?: string;
}

/** A validated settlement-profile document. */
export interface SettlementDocument {
  readonly loam: string;
  readonly profile: "settlement";
  readonly meta: TerrainMeta;
  readonly style?: TerrainStyle;
  /** The authored-program map (§7.6); the passes resolve every reference here. */
  readonly programs?: ProgramMap;
  readonly root: SettlementRootNode;
}
