/**
 * The skyline field — fabric v3, C2.
 *
 * `INFILL_FLOORS.high = [3, 8]` is a uniform band, and a uniform band over a
 * whole downtown builds a **mesa**: every building roughly the same height,
 * everywhere, with the only tall things the landmarks an author placed by hand.
 * A real city's height is not a draw, it is a *field* — it peaks somewhere, it
 * falls off, it bulges at the water and along the big roads, and the towers
 * stand in clusters rather than one per block.
 *
 * So this module is one pure positional function, `at(x, z) → 0..1`, composed
 * of four terms:
 *
 * - **the core term**, an inverse-quadratic decay in the *squared* distance to
 *   the city core. Dominant by weight ({@link W_CORE}), because the thing that
 *   makes a skyline read as a skyline is that it has a peak and the peak is in
 *   one place;
 * - **the frontage term**, a bonus for a column that faces water or sits on an
 *   arterial — towers cluster on the good views and the big roads;
 * - **landmark spikes**, a local lift around each author-placed landmark, so a
 *   thirty-storey spire is not a lone chimney in a field of four-storey infill
 *   but the tallest of a cluster that steps down to it;
 * - **a cluster term and per-lot noise**, positional hashes at two scales. The
 *   cluster term is quantised to {@link CLUSTER_SIZE} columns so tall buildings
 *   arrive in groups; the noise is per-column and small, so the surface is not a
 *   smooth cone.
 *
 * `storeys(x, z, ctx)` maps the field to an actual storey count against the
 * density, the district character and the archetype — a `shop_row` is a shop
 * row wherever it stands, and only the tall archetypes reach the top of the
 * range.
 *
 * ## Determinism, and what the field is keyed on
 *
 * Every draw is a positional hash of the column, exactly as the rest of the
 * fabric pass works: no counters, no iteration order, no wall-clock. There is
 * no transcendental arithmetic anywhere — the decays are rational functions of
 * *squared* integer distances, and the frontage proximity is an integer
 * breadth-first distance on a coarse grid.
 *
 * The important invariant is **what the field is a function of**, because it is
 * a global function evaluated per lot and the fabric's rule is that a change
 * somewhere else in the district leaves the rest of the street byte-identical.
 * The field depends on:
 *
 * - the bounds it was built over, and the seed it was given;
 * - the core point and radius (defaults: the bounds centre, and a fraction of
 *   the bounds' shorter axis);
 * - the terrain height field and the sea level, read only to find water;
 * - the arterial / frontage centre lines it was handed;
 * - the landmark anchors it was handed — i.e. the district's **authored**
 *   children.
 *
 * It does **not** depend on the lot subdivision, on which lots were built, on
 * how many were built, or on the order they were visited in. Adding one more
 * infill building somewhere therefore cannot move the height of any other lot.
 * Adding or moving a *landmark* does move the field near it, which is the
 * intended consequence: a landmark is a peak.
 */

import { positionFloat, streamSeed, type HeightField, type Seed256 } from "@terrainist/stdlib";
import type { DistrictDensity } from "@terrainist/spec";

import type { Rect } from "./frames.js";

/* -------------------------------------------------------------------------- */
/* the pinned contract                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What a district cell is *for*.
 *
 * The C1 contract (`city.ts`, `docs/DESIGN.md`) owns this union; it is declared
 * here because C2 ships first and the two must agree exactly. When `city.ts`
 * lands it should import this type rather than restate it.
 */
export type DistrictCharacter =
  | "core"
  | "grid"
  | "rowhouse"
  | "lanes"
  | "industrial"
  | "civic"
  | "park"
  | "waterfront";

export interface ProminenceField {
  /** 0..1. Drives storeys, setbacks, rooftop kit and facade richness. */
  at(x: number, z: number): number;
  /** Storeys for a lot or bay whose street corner is (x, z). */
  storeys(
    x: number,
    z: number,
    ctx: {
      readonly density: "low" | "medium" | "high";
      readonly character?: DistrictCharacter;
      readonly archetype: string;
    },
  ): number;
}

/** One author-placed anchor the field bulges around. */
export interface ProminenceLandmark {
  readonly x: number;
  readonly z: number;
  /** Lift at the centre, 0..1. Defaults to 1. */
  readonly weight?: number;
  /** Columns at which the lift has fallen to a quarter. Defaults to {@link LANDMARK_RADIUS}. */
  readonly radius?: number;
}

/** Everything {@link buildProminenceField} reads. */
export interface ProminenceInput {
  /** The region the field is defined over — a district footprint or a city. */
  readonly bounds: Rect;
  /** The field's only entropy. Usually the district's or the city's node seed. */
  readonly seed: Seed256;
  /** The character of the whole field, when it is built for one district. */
  readonly character?: DistrictCharacter;
  /** The peak. Defaults to the centre of {@link bounds}. */
  readonly core?: { readonly x: number; readonly z: number };
  /** Columns at which the core term has fallen to a quarter. Defaults from `bounds`. */
  readonly coreRadius?: number;
  /** Author-placed anchors. */
  readonly landmarks?: readonly ProminenceLandmark[];
  /**
   * Where the water is. Read only through {@link HeightField.values}; a column
   * whose ground is below `seaLevel` is water.
   */
  readonly water?: { readonly field: HeightField; readonly seaLevel: number };
  /**
   * Arterial centre lines — the same 4-connected `path` shape C1's `Arterial`
   * carries, so a `CityPlan` can be handed straight in. A column near one of
   * these gets the same frontage bonus as a waterfront column, scaled by
   * {@link ARTERIAL_SHARE}.
   */
  readonly arterials?: readonly (readonly { readonly x: number; readonly z: number }[])[];
  /**
   * Multiplier on the storey ceiling every lot is measured against — the
   * `layout.storeyMultiplier` fan-out row's landing place.
   *
   * A rich quarter builds taller on the same lots. It scales the *ceiling*,
   * never the floor, so the density's minimum still holds and the archetype's
   * own cap still wins. Absent (or 1) is exactly today's field.
   */
  readonly storeyMultiplier?: number;
  /**
   * A hard ceiling on storeys — the `layout.storeyCeiling` fan-out row's
   * landing place, and the era's veto over everything above.
   *
   * Applied **after** the character ceiling, the multiplier and the archetype
   * cap, because it is not a preference: a document that says its world is
   * ancient is saying no lot in it builds a tower, whatever the field, the
   * wealth or the character asked for. The density's floor still wins over it —
   * a ceiling below `lo` clamps to one storey rather than to zero, and a lot
   * that cannot hold a building is the infill pass's decision, not this one's.
   *
   * Absent is exactly today's field, which is what makes every document with no
   * `era` — and every era class the table has no opinion about — byte-identical.
   */
  readonly storeyCeiling?: number;
}

/* -------------------------------------------------------------------------- */
/* the knobs                                                                   */
/* -------------------------------------------------------------------------- */

/** Weight of the distance-to-core term. Dominant, deliberately. */
export const W_CORE = 0.56;
/** Weight of the waterfront / arterial frontage bonus. */
export const W_FRONTAGE = 0.14;
/** Weight of the landmark spikes. */
export const W_SPIKE = 0.16;
/** Weight of the coarse cluster term. */
export const W_CLUSTER = 0.09;
/** Weight of the per-column noise. Small: this is grain, not shape. */
export const W_NOISE = 0.05;

/** Side of a cluster cell, in columns — roughly one city block. */
export const CLUSTER_SIZE = 40;

/** Default radius of a landmark's spike, in columns. */
export const LANDMARK_RADIUS = 36;

/** How far the frontage bonus reaches from water or an arterial, in columns. */
export const FRONTAGE_REACH = 48;

/** Coarse grid stride for the frontage distance transform, in columns. */
export const FRONTAGE_STRIDE = 4;

/** An arterial's frontage bonus, as a share of a waterfront's. */
export const ARTERIAL_SHARE = 0.6;

/**
 * Storeys the field spans, per density: the floor of the range and the tallest
 * a tall archetype at the very peak may reach.
 */
export const STOREY_RANGE: Readonly<Record<DistrictDensity, readonly [number, number]>> =
  Object.freeze({
    high: [3, 28] as const,
    medium: [2, 9] as const,
    low: [1, 3] as const,
  });

/** Storeys anything that is not a tall archetype builds, whatever the field says. */
export const LOWRISE_CEILING = 3;

/**
 * The share of the density's range a character may reach.
 *
 * A rowhouse quarter with a tower in it is not a rowhouse quarter, and a park
 * is not a building site — the field is the same everywhere, the *ceiling* is
 * what the character sets.
 */
export const CHARACTER_CEILING: Readonly<Record<DistrictCharacter, number>> = Object.freeze({
  core: 1,
  grid: 0.8,
  waterfront: 0.75,
  civic: 0.5,
  lanes: 0.35,
  rowhouse: 0.3,
  industrial: 0.3,
  park: 0.2,
});

/**
 * How hard the rarity curve is weighted against height. Higher is rarer.
 */
export const PROMINENCE_TAIL = 1.8;

/**
 * The rarity curve: `p³ / (p³ + k(1 − p)³)`.
 *
 * Three properties, and each one is load-bearing.
 *
 * **It is not linear.** A linear map spreads storeys evenly over the range,
 * which is a cone rather than a skyline. This one keeps the bulk of the
 * distribution in the low single digits and leaves the top of the range for the
 * few columns that score on nearly every term at once — near the core, on the
 * water, beside a landmark, in a cluster cell that came up high. That is what
 * makes the tall tail both rare and *clustered* rather than sprinkled: the core
 * and cluster terms are spatially smooth, so the columns that clear the bar are
 * neighbours.
 *
 * **It does not saturate.** The obvious curve — normalise against the score a
 * good column actually reaches, then cube — pins every column past that score
 * to the top of the range, and a tenth of a waterfront downtown all at exactly
 * twenty-eight storeys is the mesa again, moved upstairs. This form reaches 1
 * only at `p = 1`, which nothing reaches.
 *
 * **It is rational.** No exponential, no power function: §6.5 rule 6 bans them
 * because their last bits are not specified, and a world has to be
 * reproducible bit for bit on someone else's machine.
 */
export function shapeProminence(p: number): number {
  const t = clamp01(p);
  const hi = t * t * t;
  const lo = (1 - t) * (1 - t) * (1 - t);
  const total = hi + PROMINENCE_TAIL * lo;
  return total <= 0 ? 1 : hi / total;
}

/* -------------------------------------------------------------------------- */
/* the field                                                                   */
/* -------------------------------------------------------------------------- */

/** Build the skyline field. Pure; the result is a closure over precomputed grids. */
export function buildProminenceField(input: ProminenceInput): ProminenceField {
  const bounds = input.bounds;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;

  const coreX = input.core?.x ?? Math.floor((bounds.x0 + bounds.x1) / 2);
  const coreZ = input.core?.z ?? Math.floor((bounds.z0 + bounds.z1) / 2);
  // Half the shorter axis by default, so the core term is down to a quarter of
  // its peak at the near edge and near zero at the far corner — a district-wide
  // gradient with an unmistakable middle, not a spotlight and not a plateau.
  const coreRadius = Math.max(8, Math.round(input.coreRadius ?? Math.min(width, depth) / 2));
  const coreR2 = coreRadius * coreRadius;

  const landmarks = input.landmarks ?? [];
  const clusterStream = streamSeed(input.seed, "layout");
  const noiseStream = streamSeed(input.seed, "noise");
  const frontage = buildFrontage(input, bounds);

  const at = (x: number, z: number): number => {
    const dx = x - coreX;
    const dz = z - coreZ;
    const d2 = dx * dx + dz * dz;
    // Inverse-quadratic, squared: 1 at the core, ¼ at `coreRadius`, and a long
    // rational tail rather than a cliff. No exponential, no square root.
    const t = coreR2 / (coreR2 + d2);
    const core = t * t;

    let spike = 0;
    for (const l of landmarks) {
      const lx = x - l.x;
      const lz = z - l.z;
      const r = l.radius ?? LANDMARK_RADIUS;
      const r2 = r * r;
      const s = (l.weight ?? 1) * (r2 / (r2 + lx * lx + lz * lz));
      if (s > spike) spike = s;
    }

    const cluster = positionFloat(
      clusterStream,
      floorDiv(x, CLUSTER_SIZE),
      7,
      floorDiv(z, CLUSTER_SIZE),
    );
    const noise = positionFloat(noiseStream, x, 0, z);

    return clamp01(
      W_CORE * core +
        W_FRONTAGE * frontage(x, z) +
        W_SPIKE * spike +
        W_CLUSTER * cluster +
        W_NOISE * noise,
    );
  };

  const storeys = (
    x: number,
    z: number,
    ctx: {
      readonly density: "low" | "medium" | "high";
      readonly character?: DistrictCharacter;
      readonly archetype: string;
    },
  ): number => {
    const [lo, hi] = STOREY_RANGE[ctx.density];
    const character = ctx.character ?? input.character;
    const byCharacter =
      character === undefined ? hi : Math.max(lo, Math.round(hi * CHARACTER_CEILING[character]));
    // Intent's storey multiplier, applied to the ceiling only. Rounding a
    // multiplier of exactly 1 is the identity, which is what the byte-identity
    // law needs.
    const multiplier = input.storeyMultiplier ?? 1;
    const lifted = multiplier === 1 ? byCharacter : Math.max(lo, Math.round(byCharacter * multiplier));
    // The era's veto, last and lowest: see `ProminenceInput.storeyCeiling`.
    const era = input.storeyCeiling;
    const cap = Math.min(
      lifted,
      archetypeCeiling(ctx.archetype),
      era === undefined ? Number.POSITIVE_INFINITY : era,
    );
    if (cap <= lo) return Math.max(1, cap);
    const shaped = shapeProminence(at(x, z));
    return clamp(lo + Math.round(shaped * (cap - lo)), lo, cap);
  };

  return { at, storeys };
}

/**
 * Storeys an archetype may reach whatever the field says.
 *
 * The tall archetypes carry their own cap in the grammar
 * (`HIGHRISE_MAX_FLOORS`); everything else is a cottage-grammar building, and a
 * cottage with fourteen storeys is a chimney with windows. Held here as a table
 * rather than imported so the layout package does not take a value dependency
 * on the structure grammar for one number per name.
 */
export function archetypeCeiling(archetype: string): number {
  return HIGHRISE_CEILING[archetype] ?? LOWRISE_CEILING;
}

/**
 * Storeys per tall archetype. Mirrors `HIGHRISE_MAX_FLOORS` in
 * `@terrainist/stdlib`, and `packages/compiler/test/prominence.test.ts` asserts
 * the two agree, so a change there cannot silently drift from this.
 */
const HIGHRISE_CEILING: Readonly<Record<string, number>> = Object.freeze({
  skyscraper: 28,
  office: 20,
  hotel: 14,
  apartment_block: 10,
});

/* -------------------------------------------------------------------------- */
/* the frontage term                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Proximity to water or to an arterial, as a 0..1 bonus.
 *
 * A multi-source breadth-first distance on a coarse grid — integer steps, so it
 * is exactly reproducible — over the bounds grown by {@link FRONTAGE_REACH},
 * because a district's waterfront is at its edge and the water itself is
 * outside it. The bonus is `(1 − d / reach)²`, which is a shoreline band rather
 * than a gradient across the whole district.
 *
 * Returns a constant zero when the input carries neither water nor arterials —
 * which is the plain authored district's case, and costs nothing.
 */
function buildFrontage(
  input: ProminenceInput,
  bounds: Rect,
): (x: number, z: number) => number {
  const hasWater = input.water !== undefined;
  const hasArterials = (input.arterials?.length ?? 0) > 0;
  if (!hasWater && !hasArterials) return () => 0;

  const stride = FRONTAGE_STRIDE;
  const margin = FRONTAGE_REACH;
  const gx0 = bounds.x0 - margin;
  const gz0 = bounds.z0 - margin;
  const gw = Math.ceil((bounds.x1 + margin - gx0 + 1) / stride);
  const gd = Math.ceil((bounds.z1 + margin - gz0 + 1) / stride);
  const cellOf = (x: number, z: number): number => {
    const i = floorDiv(x - gx0, stride);
    const j = floorDiv(z - gz0, stride);
    if (i < 0 || j < 0 || i >= gw || j >= gd) return -1;
    return j * gw + i;
  };

  // Two independent distance fields rather than one with weighted sources: an
  // arterial one cell nearer than the river should not *hide* the river, and
  // taking the better of the two bonuses says that directly.
  const waterSeeds: number[] = [];
  if (input.water !== undefined) {
    const { field, seaLevel } = input.water;
    const region = field.region;
    for (let j = 0; j < gd; j++) {
      for (let i = 0; i < gw; i++) {
        const x = gx0 + i * stride + (stride >> 1);
        const z = gz0 + j * stride + (stride >> 1);
        const ci = x - region.x0;
        const cj = z - region.z0;
        if (ci < 0 || cj < 0 || ci >= region.width || cj >= region.depth) continue;
        if ((field.values[cj * region.width + ci] as number) < seaLevel) waterSeeds.push(j * gw + i);
      }
    }
  }
  const arterialSeeds: number[] = [];
  for (const path of input.arterials ?? []) {
    for (const cell of path) {
      const k = cellOf(cell.x, cell.z);
      if (k >= 0) arterialSeeds.push(k);
    }
  }

  const waterDist = distanceField(waterSeeds, gw, gd, stride);
  const arterialDist = distanceField(arterialSeeds, gw, gd, stride);

  return (x: number, z: number): number => {
    const k = cellOf(x, z);
    if (k < 0) return 0;
    const w = decay(waterDist[k] as number, stride);
    const a = ARTERIAL_SHARE * decay(arterialDist[k] as number, stride);
    return w > a ? w : a;
  };
}

/**
 * Multi-source breadth-first distance in coarse cells, `-1` where unreached.
 *
 * Plain BFS on a 4-connected grid: every source starts at zero, so the frontier
 * is monotone and the result does not depend on the order the seeds were listed
 * in. Stops once the frontier is past {@link FRONTAGE_REACH}, which is what
 * keeps it cheap on a city-sized bounds.
 */
function distanceField(
  seeds: readonly number[],
  gw: number,
  gd: number,
  stride: number,
): Int32Array {
  const dist = new Int32Array(gw * gd).fill(-1);
  if (seeds.length === 0) return dist;
  const queue: number[] = [];
  for (const k of seeds) {
    if (dist[k] === 0) continue;
    dist[k] = 0;
    queue.push(k);
  }
  const limit = Math.ceil(FRONTAGE_REACH / stride);
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    const d = (dist[k] as number) + 1;
    if (d > limit) continue;
    const i = k % gw;
    const j = (k - i) / gw;
    for (const [di, dj] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= gw || jj >= gd) continue;
      const n = jj * gw + ii;
      if (dist[n] !== -1) continue;
      dist[n] = d;
      queue.push(n);
    }
  }
  return dist;
}

/** `(1 − d/reach)²`, and zero once the reach is spent. */
function decay(coarseDistance: number, stride: number): number {
  if (coarseDistance < 0) return 0;
  const d = coarseDistance * stride;
  if (d >= FRONTAGE_REACH) return 0;
  const t = (FRONTAGE_REACH - d) / FRONTAGE_REACH;
  return t * t;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const);

/* -------------------------------------------------------------------------- */
/* small arithmetic                                                            */
/* -------------------------------------------------------------------------- */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Floor division that stays floor for negative coordinates. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}
