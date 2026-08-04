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
}

/** What the program hands back for the solver and the later passes. */
export interface ProgramResult {
  readonly name: string;
  /** Node-local Y of the plane that meets the ground. Usually 0. */
  readonly seatY: number;
  /** Named points published into the node's anchor namespace (§5.5 / §7.3). */
  readonly anchors?: Readonly<Record<string, readonly [number, number, number]>>;
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
export const LANDMARK_PARAM_KEYS = ["hover"] as const;

/** `params.hover` bounds, inclusive. Below the floor it reads as clutter. */
export const HOVER_RANGE = Object.freeze({ min: 8, max: 256 });

/**
 * The hover height a landmark node asks for, or `undefined`.
 *
 * The one blessed reader: compiler code never pokes at `params.hover` itself,
 * so "is this node airborne" has exactly one answer everywhere. Anything the
 * validator would have rejected (non-integer, out of range) reads as
 * `undefined` here rather than as a nonsense altitude.
 */
export function hoverOf(node: unknown): number | undefined {
  if (typeof node !== "object" || node === null) return undefined;
  const params = (node as { params?: unknown }).params;
  if (typeof params !== "object" || params === null) return undefined;
  const hover = (params as { hover?: unknown }).hover;
  if (typeof hover !== "number" || !Number.isInteger(hover)) return undefined;
  if (hover < HOVER_RANGE.min || hover > HOVER_RANGE.max) return undefined;
  return hover;
}
