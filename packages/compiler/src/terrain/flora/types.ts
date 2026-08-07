/**
 * The flora grammar's type vocabulary (FLORA-GRAMMAR-v0 §3).
 *
 * A **shape program** is a deterministic function from a variation record, a
 * species definition and an injected RNG to a block list — the generalisation
 * of the `conifer`/`blob` closures `vegetation.ts` used to carry inline. The
 * program sees nothing else: no globals, no wall-clock, no reads of the plan
 * (law 5).
 */

/** A horizontal direction, as the ancient program's lean. */
export interface FloraVec2 {
  readonly x: number;
  readonly z: number;
}

/** How one plant's geometry differs from its species' baseline. */
export interface FloraVariation {
  /** Trunk height, drawn from the species envelope. */
  readonly height: number;
  /** Canopy jitter in `-1..+1`. */
  readonly radiusDelta: number;
  /** A 2×2-trunk giant. Kept for compatibility; WP-B's giants use species tiers. */
  readonly mega: boolean;
  /** Unit-ish trunk drift per 4 blocks of rise (ancients). */
  readonly lean?: FloraVec2;
  /** `0..1`; drives gnarl, deadwood share and canopy thinning. */
  readonly age?: number;
}

/**
 * What a block of a plant *is*, independently of which block it becomes.
 *
 * The split matters because the emitter derives orientation from the part and
 * the plant's own block set (§3.2) — never from the world.
 */
export type FloraPart =
  | "log"
  | "branch"
  | "root"
  | "leaves"
  | "cap"
  | "stem"
  | "hanging"
  | "deco";

/** One block of a generated plant, relative to the trunk base. */
export interface FloraBlock {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly part: FloraPart;
  /** For `"branch"`: the log axis the emitter maps to an oriented log state. */
  readonly axis?: "x" | "y" | "z";
}

/**
 * A species: shape program, parameter envelope, palette symbols.
 *
 * WP-A carries only the fields the two transcribed programs and the parts
 * emitter read; WP-B fills in stratum, climates and the catalog.
 */
export interface FloraSpeciesDef {
  readonly id: string;
  readonly program: string;
  readonly height: readonly [number, number];
  readonly trunkSymbol: string;
  readonly leafSymbol: string;
  /** Program knobs — only the ones the program reads; see §3's tables. */
  readonly knobs?: Readonly<Record<string, number | readonly [number, number] | string>>;
  readonly rootSymbol?: string;
  readonly stemSymbol?: string;
  readonly capSymbol?: string;
  readonly hangingSymbol?: string;
  readonly decoSymbol?: string;
  readonly deadSymbol?: string;
  /** Share of this species that comes up as a 2×2 giant. Only `spruce_tall` has one. */
  readonly megaShare?: number;
}

/** A deterministic shape program. */
export interface FloraProgram {
  readonly id: string;
  /**
   * Horizontal reach, in blocks. Clip pre-rejection, the shade map and §5's
   * spacing all rely on it bounding the block list.
   */
  canopyRadius(v: FloraVariation, def: FloraSpeciesDef): number;
  /** The blocks of one plant, trunk base at the origin. */
  blocks(v: FloraVariation, def: FloraSpeciesDef, rng: () => number): FloraBlock[];
}

/** Read a numeric knob, falling back to the program's own default. */
export function knob(def: FloraSpeciesDef, name: string, fallback: number): number {
  const value = def.knobs?.[name];
  return typeof value === "number" ? value : fallback;
}

/** The wood family, for law 1 and law 2: what a canopy may hang from. */
export const WOOD_PARTS: ReadonlySet<FloraPart> = new Set<FloraPart>(["log", "branch", "stem"]);

/** The canopy family: the parts law 2 and law 6 constrain. */
export const CANOPY_PARTS: ReadonlySet<FloraPart> = new Set<FloraPart>(["leaves", "cap"]);
