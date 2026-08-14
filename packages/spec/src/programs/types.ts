/**
 * `AuthoredProgram` — the bespoke tier (Phase 0 contract 2).
 *
 * One contract, two invocation modes: a **landmark** program is invoked once
 * against a fixed envelope; a **plugin** program is invoked N times through
 * `scatter.program@0` with per-instance seeds. Nothing else differs — one
 * sandbox, one artifact format, one gate.
 *
 * This file owns the *shape*: what a `programs` map entry looks like, what the
 * sandbox hands a program, what a program hands back, and the numeric limits
 * both the authoring gate and the compile gate enforce. Execution lives in
 * `@terrainist/compiler`'s `programs/` directory.
 */

/** Document key carrying the program map. */
export const PROGRAMS_KEY = "programs";

/** Generator-reference prefix for an authored program (spec v0.2 §7.6). */
export const AUTHORED_PREFIX = "authored:";

/** The plugin-mode scatter generator. */
export const PROGRAM_SCATTER_GENERATOR = "scatter.program@0";

/** How a document is allowed to invoke a program. */
export const PROGRAM_MODES = ["landmark", "plugin", "both"] as const;

/** One of {@link PROGRAM_MODES}. */
export type ProgramMode = (typeof PROGRAM_MODES)[number];

/** Keys of a `programs` map entry. */
export const PROGRAM_KEYS = [
  "mode",
  "envelope",
  "source",
  "sourceHash",
  "outputHash",
] as const;

/**
 * The limits of the contract's table.
 *
 * They are starting points chosen with a reason attached, not measurements.
 * Every one of them is enforced identically at authoring time and at compile
 * time, because a program that passes one gate and fails the other is a bug in
 * this file.
 */
export const PROGRAM_LIMITS = Object.freeze({
  /** Source text, in bytes of UTF-8. */
  maxSourceBytes: 64 * 1024,
  /** Fuel units per instance. See the compiler's `fuel.ts` for what a unit is. */
  maxInstanceFuel: 20_000_000,
  /** Fuel units summed over every instance of every program in a document. */
  maxDocumentFuel: 200_000_000,
  /** `api.set` calls that land inside the envelope, per instance. */
  maxInstanceWrites: 200_000,
  /** …and per document. */
  maxDocumentWrites: 4_000_000,
  /** Heap ceiling per instance, in bytes. */
  maxInstanceHeapBytes: 64 * 1024 * 1024,
  /** Largest declared envelope edge, in blocks. */
  maxEnvelopeEdge: 384,
  /** Largest declared envelope volume, in blocks³. */
  maxEnvelopeVolume: 4_000_000,
  /** Fraction of writes allowed to fall outside the envelope before `W331`. */
  clipTolerance: 0.01,
  /** Components below this volume are dropped before the connectivity test. */
  minIslandVolume: 12,
  /** Nonsense guard: solid voxels a program must place. */
  minSolidVoxels: 500,
  /** Nonsense guard: blocks of height a program must reach. */
  minHeight: 8,
  /** Fraction of a plugin's instances allowed to fail before the node fails. */
  maxInstanceFailureFraction: 0.25,
  /** Instance indices the plugin-mode `outputHash` covers. */
  verificationInstances: Object.freeze([0, 1, 7]) as readonly number[],
});

/** A `programs` map entry, as it appears in a document. */
export interface AuthoredProgramRecord {
  readonly mode: ProgramMode;
  /** Node-local `[w, h, d]` the program declares it needs. */
  readonly envelope: readonly [number, number, number];
  /** The program text; ≤ 64 KiB. */
  readonly source: string;
  /** `b3:<hex>` of the normalized source. A mismatch is `E333`. */
  readonly sourceHash: string;
  /** `b3:<hex>` of the canonical op stream. A mismatch is `E334`. */
  readonly outputHash: string;
}

/** The validated `programs` map. */
export type ProgramMap = Readonly<Record<string, AuthoredProgramRecord>>;

/* -------------------------------------------------------------------------- */
/* the API a program sees                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything a program is handed. Nothing else is reachable.
 *
 * The API is the determinism boundary, not a creative vocabulary: there is no
 * shape library, no arch helper, no stair kit. If the program wants a dome it
 * computes a dome.
 */
export interface ProgramApi {
  /**
   * The only way to write. `block` is a full block string, states included:
   * `"minecraft:stone_bricks"`, `"minecraft:oak_stairs[facing=north,half=top]"`.
   */
  set(x: number, y: number, z: number, block: string): void;
  /** Node-local envelope bounds. Origin `(0,0,0)` is the min corner. */
  readonly size: readonly [number, number, number];
  /** Which of N this call is; `{index: 0, count: 1}` in landmark mode. */
  readonly instance: { readonly index: number; readonly count: number };
  /** Injected seeded PRNG. The only source of randomness that exists. */
  random(): number;
  /** Node-local terrain, for a program that wants to sit on real ground. */
  heightAt(x: number, z: number): number;
  /** Diagnostics only; never affects output. */
  log(msg: string): void;
  /**
   * The world's resolved material theme, as blocks. Read-only and frozen.
   *
   * A program that invents its own palette builds a thing that is *in* the
   * world without being *of* it — the walked defect this exists to end was a
   * band of sandstone-and-wool hideouts scattered through a sun-clay city. So
   * the roles the rest of the compiler already builds from (the ground roles
   * the streets and the retaining walls take, the wood/stone/roof sets the
   * building grammar deals, the curtain wall's five) are handed to the program
   * verbatim, and a program that wants to belong takes them.
   *
   * Deterministic: the theme is dealt from `hash(worldSeed, rootPath)` long
   * before any program runs, so this is a *read* and never a draw. In the
   * authoring gate — which knows no world — it is the pinned verification
   * theme, which is why a theme-reading program's `outputHash` still means
   * something: the hash pins the program, never the world it lands in.
   */
  readonly theme: ProgramTheme;
}

/**
 * The material theme a program sees.
 *
 * Every value is a full block string (`"minecraft:mud_bricks"`). The names are
 * the compiler's own role vocabulary, not a parallel one invented for programs:
 * `ground` is `GroundMaterials`, `wood`/`stone`/`roof` are the building
 * grammar's `WoodSet`/`StoneSet`/`RoofSet`, and `wall` is the curtain wall's
 * `WallMaterials`. A role that reads oddly for an icon is still the role the
 * town beside it is built from, which is the point.
 */
export interface ProgramTheme {
  /** The theme id — `"temperate_timber"`, `"sun_clay"`, … */
  readonly id: string;
  /** The built-ground roles: what a mason would name. */
  readonly ground: ProgramGroundRoles;
  /** The theme's lead timber family. */
  readonly wood: ProgramWoodRoles;
  /** The theme's lead masonry family. */
  readonly stone: ProgramStoneRoles;
  /** The theme's lead roofing family. */
  readonly roof: ProgramRoofRoles;
  /** What a curtain wall of this theme is built from. */
  readonly wall: ProgramWallRoles;
}

/** `GroundMaterials`, as a program sees it. */
export interface ProgramGroundRoles {
  /** The walking band beside a carriageway. */
  readonly pavement: string;
  /** The edge course between carriageway and pavement. */
  readonly kerb: string;
  /** What a flight of steps is paved with. */
  readonly tread: string;
  /** The face of masonry that holds earth. */
  readonly revetment: string;
  /** The dressed course capping that masonry. */
  readonly coping: string;
  /** A base course, and the face of a platform something sits on. */
  readonly plinth: string;
  /** The aged, damp course a revetment weeps through. */
  readonly weep: string;
  /** The balustrade above a drop — a `_wall` block. */
  readonly rail: string;
  /** A tread's nosing — a `_stairs` block. */
  readonly stairs: string;
  /** A half course — a `_slab` block. */
  readonly slab: string;
  /** Earth a graded cut face is finished with. */
  readonly bank: string;
  /** The loose toe of that bank. */
  readonly scree: string;
}

/** `WoodSet`, as a program sees it. */
export interface ProgramWoodRoles {
  readonly id: string;
  readonly planks: string;
  readonly log: string;
  readonly stripped: string;
  readonly stairs: string;
  readonly slab: string;
  readonly fence: string;
  readonly door: string;
  readonly trapdoor: string;
}

/** `StoneSet`, as a program sees it. */
export interface ProgramStoneRoles {
  readonly id: string;
  readonly primary: string;
  readonly accent: string;
  readonly stairs: string;
  readonly slab: string;
  readonly wall: string;
}

/** `RoofSet`, as a program sees it. */
export interface ProgramRoofRoles {
  readonly id: string;
  readonly stairs: string;
  readonly slab: string;
  readonly solid: string;
}

/** `WallMaterials`, as a program sees it. */
export interface ProgramWallRoles {
  readonly core: string;
  readonly walk: string;
  readonly parapet: string;
  readonly merlon: string;
  readonly tower: string;
}

/**
 * A room the program hollowed and the compiler is asked to furnish.
 *
 * Node-local, inclusive at both corners, and `min.y` is the **lowest standable
 * cell** — the floor plane the program laid is one below it. `kind` is a free
 * word ("hall", "bridge", "quarters", "nave", "vault"): a hint the building
 * grammar's fit-out reads, never a command it must obey.
 */
export interface InteriorVolume {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly kind?: string;
}

/** Bounds on a program's declared interiors. */
export const INTERIOR_LIMITS = Object.freeze({
  /** Volumes one instance may declare. A landmark is not a hotel. */
  maxCount: 16,
  /** Smallest edge, in blocks: below this there is no room to furnish. */
  minEdge: 3,
});

/** What the program hands back for the solver and the later passes. */
export interface ProgramResult {
  readonly name: string;
  /** Node-local Y of the plane that meets the ground. Usually 0. */
  readonly seatY: number;
  /** Named points published into the node's anchor namespace (§5.5 / §7.3). */
  readonly anchors?: Readonly<Record<string, readonly [number, number, number]>>;
  /**
   * Rooms the program hollowed, for the compiler to furnish (Phase 0 contract
   * 2, v2). The program builds the shell and the void; the fit-out puts the
   * beds, tables, lights and shelves in — a program that furnishes itself is
   * spending tokens on physics violations the grammar already knows to avoid.
   */
  readonly interiors?: readonly InteriorVolume[];
}

/** The program: one pure function, plus a declared envelope. */
export type AuthoredProgram = (api: ProgramApi) => ProgramResult;

/* -------------------------------------------------------------------------- */
/* plugin mode — `scatter.program@0`                                           */
/* -------------------------------------------------------------------------- */

/** Keys of `scatter.program@0`'s params. */
export const PROGRAM_SCATTER_KEYS = [
  "program",
  "count",
  "area",
  "spacing",
  "maxSlope",
  "maxRelief",
  "avoidTags",
  "elevation",
  "hover",
  "seat",
  "embedDepth",
  "face",
] as const;

/**
 * Params of `scatter.program@0`.
 *
 * Placement is declared exactly the way the other scatter generators declare
 * it — a coarse `area`, a `spacing`, an eligibility band — so a program never
 * learns where it is, which is how the no-absolute-coordinates law survives
 * contact with model-written code.
 */
export interface ProgramScatterParams {
  /** Key into the document's `programs` map. */
  readonly program: string;
  /** Instances asked for. The placer may return fewer. */
  readonly count: number;
  readonly area?: ProgramScatterArea;
  /** Minimum blocks between two instance footprints. */
  readonly spacing?: number;
  /** Degrees of ground slope an instance site tolerates. */
  readonly maxSlope?: number;
  /** Blocks of ground relief across the footprint an instance site tolerates. */
  readonly maxRelief?: number;
  /** Occupancy tags an instance refuses to land on. */
  readonly avoidTags?: readonly string[];
  /** `[yMin, yMax]` absolute ground band instances may sit in. */
  readonly elevation?: readonly [number, number];
  /**
   * Blocks every instance floats above the highest ground under its own
   * footprint. Mutually exclusive with {@link ProgramScatterParams.seat}.
   */
  readonly hover?: number;
  /** How each instance meets the ground; see {@link SEAT_POLICIES}. */
  readonly seat?: SeatPolicy;
  /** `seat: "embed"` only — blocks the instance sinks below the ground plane. */
  readonly embedDepth?: number;
  /** Which way the program's declared front points; see {@link ProgramFace}. */
  readonly face?: ProgramFace;
}

/** Coarse area for a program scatter — the terrain profile's `ScatterArea`. */
export type ProgramScatterArea =
  | { readonly zone: string }
  | { readonly at: readonly [number, number]; readonly radius: number }
  | { readonly all: true };

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** True for a generator reference of the form `authored:<id>`. */
export function isAuthoredGenerator(generator: unknown): generator is string {
  return typeof generator === "string" && generator.startsWith(AUTHORED_PREFIX);
}

/** The program id an `authored:<id>` reference names, or `undefined`. */
export function authoredProgramId(generator: unknown): string | undefined {
  if (!isAuthoredGenerator(generator)) return undefined;
  const id = generator.slice(AUTHORED_PREFIX.length);
  return id.length === 0 ? undefined : id;
}

/** True when `mode` permits invoking the program once, against one envelope. */
export function allowsLandmark(mode: ProgramMode): boolean {
  return mode === "landmark" || mode === "both";
}

/** True when `mode` permits `scatter.program@0`. */
export function allowsPlugin(mode: ProgramMode): boolean {
  return mode === "plugin" || mode === "both";
}

/* -------------------------------------------------------------------------- */
/* landmark invocation params                                                  */
/* -------------------------------------------------------------------------- */

/** Keys an `authored:<id>` landmark node may carry in `params`. */
export const LANDMARK_PARAM_KEYS = ["hover", "seat", "embedDepth", "face"] as const;

/**
 * How a ground-seated program meets the terrain.
 *
 * - `"pad"` (the default) — the compiler seats the program's own seat plane on
 *   a robust ground plane under the footprint and raises the low columns to
 *   meet it, fill-only. A building on a plinth.
 * - `"embed"` — the same seating, then sunk `embedDepth` blocks further. No
 *   terrain is cut: the ground simply stands over the buried part, which is
 *   what a *crashed* thing wants rather than one resting on a lawn.
 * - `"drape"` — no pad and no re-seat. The program conforms itself, column by
 *   column, through `api.heightAt`.
 * - `"wade"` — this thing stands *in the water*. The seat plane goes on the
 *   seabed, the solid ground under the fluid, and no pad is laid: filling a
 *   bay with dirt to make a plinth is the one thing a wading landmark must
 *   never do. Nothing about the geometry is faked — the waterline simply cuts
 *   the structure wherever its own height puts it, which is what makes
 *   "half-submerged" fall out rather than be described. It also lifts the
 *   solver's freeboard veto, so a candidate footprint may reach below sea
 *   level at all.
 */
export const SEAT_POLICIES = ["pad", "embed", "drape", "wade"] as const;

/** One of {@link SEAT_POLICIES}. */
export type SeatPolicy = (typeof SEAT_POLICIES)[number];

/** `params.embedDepth` bounds, inclusive. */
export const EMBED_DEPTH_RANGE = Object.freeze({ min: 1, max: 32 });

/** Blocks an `"embed"` seat sinks by when the node named no `embedDepth`. */
export const DEFAULT_EMBED_DEPTH = 3;

/** A resolved seating decision — what {@link seatPolicyOf} hands the compiler. */
export interface SeatDecision {
  readonly policy: SeatPolicy;
  /** Meaningful for `"embed"` only; already defaulted. */
  readonly embedDepth: number;
}

/** `params.hover` bounds, inclusive. Below the floor it reads as clutter. */
export const HOVER_RANGE = Object.freeze({ min: 8, max: 256 });

/**
 * The hover height a node asks for, or `undefined`.
 *
 * The one blessed reader: compiler code never pokes at `params.hover` itself,
 * so "is this node airborne" has exactly one answer everywhere. Anything the
 * validator would have rejected (non-integer, out of range) reads as
 * `undefined` here rather than as a nonsense altitude.
 *
 * Both invocation modes spell it the same way. On an `authored:<id>` landmark
 * it floats the one instance; on `scatter.program@0` it floats *every*
 * instance, each above its own footprint.
 */
export function hoverOf(node: unknown): number | undefined {
  if (typeof node !== "object" || node === null) return undefined;
  return hoverOfParams((node as { params?: unknown }).params);
}

/** {@link hoverOf} for a params object — `scatter.program@0`'s spelling. */
export function hoverOfParams(params: unknown): number | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const hover = (params as { hover?: unknown }).hover;
  if (typeof hover !== "number" || !Number.isInteger(hover)) return undefined;
  if (hover < HOVER_RANGE.min || hover > HOVER_RANGE.max) return undefined;
  return hover;
}

/**
 * How this node seats on the ground, or `undefined` when it does not seat at
 * all because it hovers.
 *
 * The counterpart of {@link hoverOf}, and blessed the same way: compiler code
 * never reads `params.seat` itself, so "how does this meet the ground" has one
 * answer everywhere. `hover` and `seat` are mutually exclusive (the validator
 * rejects both together), and hovering wins here so a document that slipped
 * past validation still floats rather than being seated *and* floated.
 * Anything the validator would have rejected reads as the `"pad"` default.
 */
export function seatPolicyOf(node: unknown): SeatDecision | undefined {
  if (hoverOf(node) !== undefined) return undefined;
  if (typeof node !== "object" || node === null) return { policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH };
  const params = (node as { params?: unknown }).params;
  return seatOfParams(params);
}

/** {@link seatPolicyOf} for a params object — `scatter.program@0`'s spelling. */
export function seatOfParams(params: unknown): SeatDecision {
  const fallback: SeatDecision = { policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH };
  if (typeof params !== "object" || params === null) return fallback;
  const seat = (params as { seat?: unknown }).seat;
  if (typeof seat !== "string" || !(SEAT_POLICIES as readonly string[]).includes(seat)) return fallback;
  const raw = (params as { embedDepth?: unknown }).embedDepth;
  const depth =
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= EMBED_DEPTH_RANGE.min &&
    raw <= EMBED_DEPTH_RANGE.max
      ? raw
      : DEFAULT_EMBED_DEPTH;
  return { policy: seat as SeatPolicy, embedDepth: depth };
}

/* -------------------------------------------------------------------------- */
/* which way the thing faces                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The anchor a program publishes to say **it has a front**.
 *
 * A program is authored in its own envelope and knows nothing about where the
 * world will put it, so a subject with a meaningful front — a face, a prow, a
 * door, a direction of travel — builds that front toward local **−Z (north)**
 * and publishes this anchor on it. Publishing it is the whole declaration: the
 * compiler rotates the finished instance so the front points where the document
 * asked, and a program that publishes no `front` is **never rotated**, which is
 * why every world authored before this existed still compiles to the same
 * blocks.
 *
 * The point itself is not wasted: after rotation it is the road-approach point
 * as well, so a landmark named in `road.network@0`'s `anchors` is reached at
 * its front rather than at whichever edge happened to be nearest.
 */
export const FRONT_ANCHOR = "front";

/** The two senses a `face` relation can be written in. */
export const FACE_SENSES = ["toward", "away_from"] as const;

/** One of {@link FACE_SENSES}. */
export type FaceSense = (typeof FACE_SENSES)[number];

/**
 * A bespoke invocation's `face` relation, as a document writes it.
 *
 * Coordinate-free by construction, like every other placement statement in
 * Loam: it names *another node*, never a direction and never an angle, and the
 * compiler resolves it against where that node actually landed. `"toward"` for
 * invaders coming out of the sea at a city; `"away_from"` for a carriage
 * leaving one.
 */
export type ProgramFace =
  | { readonly toward: string }
  | { readonly away_from: string };

/** A resolved `face` relation — what {@link faceOf} hands the compiler. */
export interface FaceRelation {
  readonly sense: FaceSense;
  /** A §4.2 selector naming the node or region the front is measured against. */
  readonly target: string;
}

/**
 * The `face` relation a node declares, or `undefined`.
 *
 * The blessed reader, exactly as {@link hoverOf} is: compiler code never pokes
 * at `params.face` itself. Anything the validator would have rejected — a
 * relation naming both senses, an empty selector — reads as `undefined` here
 * rather than as half a relation, so a document that slipped past validation
 * falls back to the default rule instead of facing nowhere.
 */
export function faceOf(node: unknown): FaceRelation | undefined {
  if (typeof node !== "object" || node === null) return undefined;
  return faceOfParams((node as { params?: unknown }).params);
}

/** {@link faceOf} for a params object — `scatter.program@0`'s spelling. */
export function faceOfParams(params: unknown): FaceRelation | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const face = (params as { face?: unknown }).face;
  if (typeof face !== "object" || face === null) return undefined;
  const written = FACE_SENSES.filter(
    (sense) => (face as Record<string, unknown>)[sense] !== undefined,
  );
  if (written.length !== 1) return undefined;
  const sense = written[0] as FaceSense;
  const target = (face as Record<string, unknown>)[sense];
  if (typeof target !== "string" || target.trim().length === 0) return undefined;
  return { sense, target: target.trim() };
}
