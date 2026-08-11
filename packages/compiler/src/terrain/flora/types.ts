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
  /**
   * For `"branch"`: a **dead** limb, which takes the species' `deadSymbol`
   * (a stripped log) instead of its trunk symbol.
   *
   * The flag is needed because `part` alone cannot carry the distinction: an
   * `ancient` grows live and dead limbs on the same tree, and §3.2's rule is
   * that the palette symbol decides the block. A live branch takes the trunk
   * state; a dead one takes {@link FloraStates.branch}.
   */
  readonly dead?: boolean;
  /**
   * For `"branch"`: this block is part of a **buttress root ridge** (§3.7.1),
   * not a limb.
   *
   * A buttress is wood at and just above grade, and it is deliberately built
   * from horizontal-axis logs so its exposed top face reads as bark rather than
   * as the ring texture a vertical log shows (Kai's walk, 2026-08-07: the old
   * flat flare "doesn't look great… my instinct is a procedural root
   * generator"). The flag carries two consequences the geometry cannot express
   * through `part` alone: `capWood` must not put a leaf on top of a ridge (a
   * root is not a mast), and the law-1 matrix reads it as the enumerated
   * exception rather than as a defect.
   *
   * The emitter ignores it: a buttress is a `branch`, takes the trunk state and
   * takes its own `axis`, so nothing in `parts.ts` has to know it exists.
   */
  readonly buttress?: boolean;
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
  /** Which layer of a composed forest this species is (§5). */
  readonly stratum?: "emergent" | "canopy" | "understory";
  /** Climate affinity for the default composition tables (§5.2). */
  readonly climates?: readonly string[];
  /** §2: never reachable from a climate default, only by being named. */
  readonly fantasy?: boolean;
  /** `age` envelope for the `ancient` program, drawn per tree. */
  readonly age?: readonly [number, number];
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

/** The height a mega draw adds to a trunk (`vegetation.ts`, `scatterOne`). */
export const MEGA_HEIGHT_BONUS = 4;

/**
 * How far a plant stands **above its own species' envelope**, as a ratio ≥ 1.
 *
 * A species' knobs — `radius`, `spread`, `squash` — describe a tree at the size
 * the species table says it grows to. Nothing forced the two to agree: an
 * author may write `minHeight`/`maxHeight` on a `species` entry, and the kit
 * teaches exactly that, so a document can ask for an `oak_round` of 24 blocks
 * against a table envelope of 5–7. Until 2026-08-10 the crown knobs were
 * *absolute*, so the extra 17 blocks were all trunk: measured on
 * `overgrown_hideout` (Kai's walk), the median oak stood **13 blocks with its
 * lowest leaf at 11** — 80 percent bare pole under a four-layer, two-block-wide
 * puck — and the birch beside it, at the same height with the same
 * height-independent crown, was the *same silhouette*. Two authored species,
 * one tree. Kai: *"the trees are almost entirely converged on some tall, skinny
 * with a small mullet for leaves at the top design."*
 *
 * So a tree grown past its envelope grows its crown too, and this ratio is what
 * the programs scale by. It is exactly 1 for every tree inside its own
 * envelope — including the `mega` draw's `+4`, which is part of the envelope
 * rather than an author's override — which is what makes the law inert for
 * every document that never overrode a height. Every committed example is such
 * a document; the geometry there is byte-identical.
 */
export function overgrowth(v: FloraVariation, def: FloraSpeciesDef): number {
  const ceiling = def.height[1] + (v.mega ? MEGA_HEIGHT_BONUS : 0);
  return ceiling > 0 && v.height > ceiling ? v.height / ceiling : 1;
}

/** The wood family, for law 1 and law 2: what a canopy may hang from. */
export const WOOD_PARTS: ReadonlySet<FloraPart> = new Set<FloraPart>(["log", "branch", "stem"]);

/** The canopy family: the parts law 2 and law 6 constrain. */
export const CANOPY_PARTS: ReadonlySet<FloraPart> = new Set<FloraPart>(["leaves", "cap"]);
