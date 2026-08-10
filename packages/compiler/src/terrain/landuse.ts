/**
 * The biome / snow land-use clamp — "land use owns its ground".
 *
 * The observed defect this exists to remove: **snow falling on part of a
 * city**. Biome and snow are painted per column by `biomeForColumn` and the
 * snow rule in `columns.ts`, from the field as it stood *before* anything was
 * built. The structure pass then levels a pad and builds on it without telling
 * the terrain what the ground became, so a quarter above the snow line keeps
 * `snowy_slopes` and a snow layer while the quarter beside it does not. No
 * amount of tuning the snow line fixes that, because nothing represented
 * "this is a town".
 *
 * The compiler invariant (docs/DESIGN.md, "Upgrade push — Phase 0 contracts",
 * §4 "Biome authorship — land use owns its ground"):
 *
 * 1. After placement is final and before emit, every claimed footprint
 *    contributes to a **land-use mask** with one settlement-derived biome.
 * 2. Over that mask the compiler **clamps**: one biome across the whole
 *    footprint, plus a {@link DEFAULT_FEATHER}-column feather band blending
 *    outward to whatever the terrain said. Snow cover over the mask is set by
 *    the settlement's snow policy, not by the column's altitude.
 * 3. It happens in the pass that writes biome data; the only place it shows is
 *    the emitted chunk biome array and the snow layer.
 * 4. Snow already placed on a clamped column is removed. The clamp never
 *    *adds* snow except where policy resolves to `always`.
 *
 * **Determinism.** Everything here is a pure function of the finished
 * placement: the mask is built from footprints, the vote runs over a fixed
 * column order, the feather uses an ordered dither indexed by world
 * coordinates, and **no RNG is drawn**. A document with no settlement produces
 * an empty mask and emits byte-identically — `clampLandUse` returns its inputs
 * untouched when the mask is empty.
 *
 * The clamp runs *after* the field is finished, so **field-hash goldens are
 * unaffected**; only the biome array and the snow layer move.
 */

import { SurfaceClass } from "@terrainist/stdlib";
import { type LoamDiagnostic, note, warning } from "@terrainist/spec";

import {
  COLD_TEMPERATURE,
  PROFILE_BIOMES,
  type ProfileBiome,
  TAIGA_TEMPERATURE,
  isTintedLandBiome,
  snowConsistentBiome,
} from "./biomes.js";

/**
 * The edge of a stored biome cell, in columns.
 *
 * **This number is why the feather had to be rebuilt.** Anvil stores biomes at
 * 4×4×4 resolution, and `terrain/emit.ts#paintBiomes` writes one id per cell by
 * sampling a single column of it (the one at `cell*4 + 1` on each axis). A
 * per-*column* dither therefore never reaches the game: fifteen of every
 * sixteen decisions are discarded at storage time, and the sixteenth is read at
 * a fixed stride-4 phase of an 8×8 matrix, which collapses the ordered pattern
 * to four thresholds. The band came out chunky and the transition read as a
 * step. So the dither runs **per cell** now, and the band is measured in cells.
 */
export const BIOME_CELL = 4;

/** Columns of blend band outside the footprint, per the contract's default. */
export const DEFAULT_FEATHER = 24;

/** Narrowest and widest the size-scaled feather band may get, in **cells**. */
export const MIN_FEATHER_CELLS = 6;
export const MAX_FEATHER_CELLS = 10;

/** The same bounds in columns — what {@link featherForPerimeter} returns. */
export const MIN_FEATHER = MIN_FEATHER_CELLS * BIOME_CELL;
export const MAX_FEATHER = MAX_FEATHER_CELLS * BIOME_CELL;

/**
 * Feather width for a footprint, scaled by its perimeter — in columns, always
 * a whole number of {@link BIOME_CELL} cells.
 *
 * A band only reads as a gradient if it spans enough *stored cells* to carry
 * distinguishable mix ratios: six cells is the floor at which the dither has
 * room to thin out, and ten is as wide as a city edge needs. `clamp(6,
 * perimeter/64, 10)` cells keeps a hut's band tight while giving a city a band
 * you have to walk to cross. On top of this the client blends grass tint over a
 * few blocks of its own, so the seam Kai walked is gone in both directions.
 */
export function featherForPerimeter(perimeter: number): number {
  const cells = Math.max(
    MIN_FEATHER_CELLS,
    Math.min(MAX_FEATHER_CELLS, Math.round(perimeter / 64)),
  );
  return cells * BIOME_CELL;
}

/**
 * Columns of pre-clamp ambient sampled outside the footprint for the vote.
 *
 * Wider than the feather on purpose: the ring must read the terrain the
 * settlement is *sitting in*, not the columns the feather is about to repaint.
 */
export const AMBIENT_RING = 12;

/** Least ring columns that make an ambient vote worth trusting. */
export const AMBIENT_RING_MIN_VOTES = 24;

/** Share of the ring the winner needs; below this the ambient is "hopelessly mixed". */
export const AMBIENT_RING_MAJORITY = 0.4;

/**
 * How a settlement's snow cover is decided.
 *
 * `auto` takes the **majority vote of the footprint's own pre-clamp columns**
 * — majority vote rather than a centre sample, because a city on a slope has
 * no single centre column. It resolves to `always` or `never`; there is no
 * third outcome, which is what gives the footprint *one snow story* instead of
 * a seam through the middle of it.
 */
export type SnowPolicy = "auto" | "never" | "always";

/**
 * Explicit author intent about the ground's climate — precedence rung 1.
 *
 * **Phase 2 seam.** This is the shape `SemanticIntent.climate` will resolve to
 * (`intent.climate.biome` / `.snow` at the nearest enclosing scope, or a
 * matching `style.biomeThemes` entry). Nothing in the compiler produces one
 * yet: {@link LandUseClampInput.intent} is left `undefined` by today's caller,
 * and Phase 2 fills it in without touching anything below. Wiring it is
 * deliberately the only change this file will need.
 */
export interface ClimateIntent {
  /** A biome id. Ids outside {@link PROFILE_BIOMES} raise `LOAM-W472`. */
  readonly biome?: string;
  readonly snow?: SnowPolicy;
}

/** Everything the clamp reads. One entry per column, row-major over the region. */
export interface LandUseClampInput {
  readonly width: number;
  readonly depth: number;
  /** World coordinate of column 0 on each axis — the dither is world-locked. */
  readonly x0: number;
  readonly z0: number;
  /** 1 on every column a settlement footprint claims. */
  readonly mask: Uint8Array;
  /** The climate-derived biome per column — precedence rung 3, as it stands. */
  readonly base: readonly ProfileBiome[];
  /** 1 where a snow layer sits, pre-clamp. Not mutated; a new array comes back. */
  readonly snow: Uint8Array;
  readonly surfaceClass: ArrayLike<number>;
  readonly temperature: ArrayLike<number>;
  /** 1 where a forest node considers the column plantable. */
  readonly forested: Uint8Array;
  /** Blend band width; defaults to {@link DEFAULT_FEATHER}. */
  readonly feather?: number;
  /** Precedence rung 1. See {@link ClimateIntent} — Phase 2 fills this in. */
  readonly intent?: ClimateIntent;
  /** Node path diagnostics are reported against. */
  readonly nodePath: string;
}

/** What the clamp did. */
export interface LandUseClampResult {
  /** The biome per column, clamped. Identical to `base` when the mask is empty. */
  readonly biome: readonly ProfileBiome[];
  /** The snow layer per column, clamped. */
  readonly snow: Uint8Array;
  /** The biome the footprint took, or undefined when nothing was clamped. */
  readonly clampedBiome?: ProfileBiome;
  /** The resolved policy — never `auto`; undefined when nothing was clamped. */
  readonly snowPolicy?: "never" | "always";
  /** Columns inside the footprint whose biome the clamp wrote. */
  readonly footprintColumns: number;
  /** Columns in the feather band whose biome the clamp wrote. */
  readonly featherColumns: number;
  /** Columns that had a snow layer and lost it. */
  readonly snowSuppressed: number;
  /** Columns that gained a snow layer (policy `always` only). */
  readonly snowAdded: number;
  /** The `auto` vote, for the report: snowy columns of land columns voted. */
  readonly vote: { readonly snowy: number; readonly total: number };
  /**
   * The ambient ring vote: the winning pre-clamp biome around the footprint,
   * its share, and how many ring columns voted. `winner` is undefined when the
   * ring was empty or too mixed and the clamp fell back to the derived biome.
   */
  readonly ambient: {
    readonly winner?: ProfileBiome;
    readonly share: number;
    readonly total: number;
  };
  /** The feather width actually used — size-scaled unless the caller pinned it. */
  readonly feather: number;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * An 8×8 ordered (Bayer) dither matrix, normalized to `(0, 1)`.
 *
 * The feather has to break up deterministically: a hard ring eight columns out
 * is the same seam one column further away, and any random dither would put
 * RNG into a pass the contract says draws none. An ordered matrix indexed by
 * **world** coordinates gives a stable, seed-free, translation-locked blend —
 * recompiling the same document twice paints the same columns.
 */
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60,
  28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47,
  7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
] as const;

/**
 * The dither threshold in `(0, 1)` for a stored **biome cell**.
 *
 * Indexed by cell coordinates, not column coordinates: see {@link BIOME_CELL}.
 * Still world-locked and seed-free — `cellX = floor(worldX / 4)` is an absolute
 * quantity, so recompiling the same document paints the same cells.
 */
export function ditherAtCell(cellX: number, cellZ: number): number {
  const i = (((cellZ % 8) + 8) % 8) * 8 + (((cellX % 8) + 8) % 8);
  return ((BAYER_8[i] as number) + 0.5) / 64;
}

/** Floor-divide a world coordinate to its stored biome cell. */
function cellOf(v: number): number {
  return Math.floor(v / BIOME_CELL);
}

/** Clamp `v` into `[lo, hi]`. */
function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** True when the column is dry ground the clamp may own. */
function isLand(surfaceClass: number): boolean {
  return surfaceClass !== SurfaceClass.UNDERWATER;
}

const PROFILE_BIOME_SET: ReadonlySet<string> = new Set<string>(PROFILE_BIOMES);

/**
 * Apply the land-use clamp.
 *
 * Pure, allocation-only: neither `input.snow` nor `input.base` is mutated. An
 * empty mask short-circuits to the inputs, which is what keeps a document with
 * no settlement byte-identical.
 */
export function clampLandUse(input: LandUseClampInput): LandUseClampResult {
  const { width, depth, mask, base, snow, surfaceClass, temperature, forested } = input;
  const n = width * depth;
  const empty: LandUseClampResult = {
    biome: base,
    snow,
    footprintColumns: 0,
    featherColumns: 0,
    snowSuppressed: 0,
    snowAdded: 0,
    vote: { snowy: 0, total: 0 },
    ambient: { share: 0, total: 0 },
    feather: 0,
    diagnostics: [],
  };

  // --- the vote, over the footprint's own pre-clamp columns ----------------
  let snowy = 0;
  let voted = 0;
  let beachish = 0;
  let forestish = 0;
  let tempSum = 0;
  for (let idx = 0; idx < n; idx++) {
    if (mask[idx] !== 1) continue;
    const sc = surfaceClass[idx] as number;
    if (!isLand(sc)) continue;
    voted++;
    tempSum += temperature[idx] as number;
    if (snow[idx] === 1 || sc === SurfaceClass.SNOW) snowy++;
    if (sc === SurfaceClass.BEACH || sc === SurfaceClass.LAKESHORE) beachish++;
    if (forested[idx] === 1) forestish++;
  }
  if (voted === 0) return empty;

  const diagnostics: LoamDiagnostic[] = [];
  const meanTemperature = tempSum / voted;

  // --- precedence rung 1: explicit author intent ---------------------------
  const intent = input.intent;
  let intentBiome: ProfileBiome | undefined;
  if (intent?.biome !== undefined) {
    if (PROFILE_BIOME_SET.has(intent.biome)) {
      intentBiome = intent.biome as ProfileBiome;
    } else {
      diagnostics.push(
        warning(
          "BIOME_INTENT_UNKNOWN",
          input.nodePath,
          `climate intent names the biome "${intent.biome}", which this emitter's table does not carry; falling back to the land-use clamp's derived biome`,
          // The whole table, in one line, because the model's next move is to
          // pick the nearest neighbour and it can only do that if it can see
          // the neighbours. Sand-, mud- and ice-floored biomes (desert,
          // badlands, mangrove_swamp, mushroom_fields, ice_spikes) are absent
          // on purpose: this emitter paints tint and fog, not ground material.
          `name one of the ${PROFILE_BIOMES.length} biomes this emitter paints: ${PROFILE_BIOMES.join(", ")}. Biomes whose signature is ground material (desert, badlands, mangrove_swamp, mushroom_fields, ice_spikes) are not carried — ask for that ground with terrain, not with a climate intent.`,
        ),
      );
    }
  }

  // --- the resolved snow policy -------------------------------------------
  // `auto` is a majority vote and resolves to one of the two absolutes, so the
  // footprint gets one snow story rather than a seam through the middle of it.
  const requested: SnowPolicy = intent?.snow ?? "auto";
  const policy: "never" | "always" =
    requested === "auto" ? (snowy * 2 > voted ? "always" : "never") : requested;

  // --- the feather, scaled by how big the thing being blended is -----------
  const feather =
    input.feather !== undefined
      ? Math.max(0, input.feather)
      : featherForPerimeter(maskPerimeter(mask, width, depth));

  // --- the mask's distance transform, out past the feather to the ring -----
  const distance = chebyshevDistance(mask, width, depth, Math.max(feather, AMBIENT_RING));

  // --- precedence rung 2: the settlement-derived biome ---------------------
  // The ambient majority first — a footprint should take the ground it sits
  // in, so the only edge left is the one the feather dissolves. The dominant
  // surface-class derivation is the fallback for a ring that says nothing.
  const ambient = ambientVote(distance, base, surfaceClass, n);
  const ambientBiome =
    ambient.winner !== undefined && ambient.share >= AMBIENT_RING_MAJORITY
      ? snowConsistentBiome(ambient.winner, policy)
      : undefined;
  const clampedBiome =
    intentBiome ??
    ambientBiome ??
    derivedBiome(policy, beachish, forestish, voted, meanTemperature);

  const outBiome = base.slice();
  const outSnow = Uint8Array.from(snow);
  let footprintColumns = 0;
  let featherColumns = 0;
  let snowSuppressed = 0;
  let snowAdded = 0;

  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      const d = distance[idx] as number;
      if (d < 0 || d > feather) continue;
      // Land use owns the *ground* it claims: an ocean column inside a
      // harbour's envelope stays ocean, and stays wet.
      if (!isLand(surfaceClass[idx] as number)) continue;
      const inside = d === 0;
      if (!inside) {
        if (feather === 0) continue;
        // Ordered dither at **stored-cell** granularity, gradient-weighted: one
        // decision per 4×4 cell, taken from the cell's own dither threshold and
        // the distance at the very column `paintBiomes` will sample. Every
        // column of a cell therefore agrees with what the game will store, so
        // the mix ratio survives emit and thins out smoothly across the band
        // instead of collapsing into a chunky step.
        const cellX = cellOf(input.x0 + i);
        const cellZ = cellOf(input.z0 + j);
        const sx = clampTo(cellX * BIOME_CELL + 1, input.x0, input.x0 + width - 1);
        const sz = clampTo(cellZ * BIOME_CELL + 1, input.z0, input.z0 + depth - 1);
        const dSample = distance[(sz - input.z0) * width + (sx - input.x0)] as number;
        const dCell = dSample >= 0 ? dSample : d;
        if (ditherAtCell(cellX, cellZ) >= featherWeight(dCell, feather)) continue;
        featherColumns++;
      } else {
        footprintColumns++;
      }
      outBiome[idx] = clampedBiome;
      if (policy === "always") {
        if (outSnow[idx] !== 1) {
          outSnow[idx] = 1;
          snowAdded++;
        }
      } else if (outSnow[idx] === 1) {
        outSnow[idx] = 0;
        snowSuppressed++;
      }
    }
  }

  diagnostics.push(
    note(
      "BIOME_CLAMPED",
      input.nodePath,
      `land use clamped ${footprintColumns} footprint column${footprintColumns === 1 ? "" : "s"} (plus ${featherColumns} feathered over ${feather} columns) to ${clampedBiome}, ${
        intentBiome !== undefined
          ? "named by climate intent"
          : ambientBiome !== undefined
            ? `from the ambient majority (${ambient.winner}, ${Math.round(ambient.share * 100)}% of ${ambient.total} ring columns)`
            : `derived from the footprint's surface classes (the ${ambient.total}-column ambient ring was empty or too mixed)`
      }; snow policy ${requested} resolved to "${policy}" on a ${snowy}/${voted} vote`,
      'no change needed — set "intent.climate.biome" or "intent.climate.snow" to override the derived ground',
    ),
  );
  if (snowSuppressed > 0) {
    diagnostics.push(
      note(
        "SNOW_SUPPRESSED",
        input.nodePath,
        `removed the snow layer from ${snowSuppressed} column${snowSuppressed === 1 ? "" : "s"} of settlement ground, which the pre-settlement climate had put above the snow line`,
        'no change needed — set "intent.climate.snow" to "always" to keep the settlement under snow',
      ),
    );
  }

  return {
    biome: outBiome,
    snow: outSnow,
    clampedBiome,
    snowPolicy: policy,
    footprintColumns,
    featherColumns,
    snowSuppressed,
    snowAdded,
    vote: { snowy, total: voted },
    ambient:
      ambientBiome === undefined
        ? { share: ambient.share, total: ambient.total }
        : { winner: ambient.winner as ProfileBiome, share: ambient.share, total: ambient.total },
    feather,
    diagnostics,
  };
}

/**
 * The gradient weight of a feather column: the share of columns at that
 * distance the clamp paints.
 *
 * `1` just outside the footprint, `0` at the rim, smoothstepped between — a
 * linear ramp still ends on a step at the inner edge, where the mix goes from
 * "all clamp" to "nearly all clamp" in one column.
 */
export function featherWeight(d: number, feather: number): number {
  if (feather <= 0) return 0;
  const t = Math.min(1, Math.max(0, (d - 0.5) / feather));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Columns on the mask's boundary — its perimeter, in columns.
 *
 * 4-connectivity: a mask column counts when any orthogonal neighbour is off the
 * mask or off the region.
 */
export function maskPerimeter(mask: Uint8Array, width: number, depth: number): number {
  let perimeter = 0;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      if (mask[idx] !== 1) continue;
      if (
        i === 0 ||
        i === width - 1 ||
        j === 0 ||
        j === depth - 1 ||
        mask[idx - 1] !== 1 ||
        mask[idx + 1] !== 1 ||
        mask[idx - width] !== 1 ||
        mask[idx + width] !== 1
      ) {
        perimeter++;
      }
    }
  }
  return perimeter;
}

/**
 * The ambient majority: a plurality vote over the pre-clamp biome of the land
 * columns in a ring *around* the footprint.
 *
 * Voting outside rather than under the footprint is the whole point — under it
 * the climate rule has already been distorted by the pad the structure pass
 * levelled, while the ring still carries what the island actually is. Water,
 * river and volcanic ash abstain: none of them carries a grass tint, so none of
 * them can tell the clamp what colour the settlement's ground should be.
 */
function ambientVote(
  distance: Int32Array,
  base: readonly ProfileBiome[],
  surfaceClass: ArrayLike<number>,
  n: number,
): { winner?: ProfileBiome; share: number; total: number } {
  const tally = new Map<ProfileBiome, number>();
  let total = 0;
  for (let idx = 0; idx < n; idx++) {
    const d = distance[idx] as number;
    if (d <= 0 || d > AMBIENT_RING) continue;
    if (!isLand(surfaceClass[idx] as number)) continue;
    const b = base[idx] as ProfileBiome;
    if (!isTintedLandBiome(b)) continue;
    tally.set(b, (tally.get(b) ?? 0) + 1);
    total++;
  }
  if (total < AMBIENT_RING_MIN_VOTES) return { share: 0, total };
  // Deterministic tie-break: PROFILE_BIOMES order, which is fixed source order.
  let winner: ProfileBiome | undefined;
  let best = 0;
  for (const candidate of PROFILE_BIOMES) {
    const count = tally.get(candidate) ?? 0;
    if (count > best) {
      best = count;
      winner = candidate;
    }
  }
  if (winner === undefined) return { share: 0, total };
  return { winner, share: best / total, total };
}

/**
 * The settlement-derived biome, from the footprint's dominant surface class and
 * its resolved snow policy.
 *
 * "A snowbound alpine mining town still gets `snowy_plains` and a snow policy
 * of `always` — the fix is **coherence**, not 'no snow'."
 */
function derivedBiome(
  policy: "never" | "always",
  beachish: number,
  forestish: number,
  voted: number,
  meanTemperature: number,
): ProfileBiome {
  if (policy === "always") return "minecraft:snowy_plains";
  if (beachish * 2 > voted) {
    return meanTemperature < COLD_TEMPERATURE ? "minecraft:snowy_beach" : "minecraft:beach";
  }
  if (forestish * 2 > voted) {
    return meanTemperature < TAIGA_TEMPERATURE ? "minecraft:taiga" : "minecraft:forest";
  }
  return "minecraft:plains";
}

/**
 * Chebyshev distance from the mask, capped at `limit`.
 *
 * `0` on the mask, `1..limit` in the feather band, `-1` everywhere else. A
 * plain multi-source BFS over 8-connectivity: the band is a few columns wide,
 * so a full distance transform would be work nobody reads.
 */
export function chebyshevDistance(
  mask: Uint8Array,
  width: number,
  depth: number,
  limit: number,
): Int32Array {
  const out = new Int32Array(width * depth).fill(-1);
  let frontier: number[] = [];
  for (let idx = 0; idx < width * depth; idx++) {
    if (mask[idx] === 1) {
      out[idx] = 0;
      frontier.push(idx);
    }
  }
  for (let d = 1; d <= limit && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const idx of frontier) {
      const i = idx % width;
      const j = (idx - i) / width;
      for (let dj = -1; dj <= 1; dj++) {
        const nj = j + dj;
        if (nj < 0 || nj >= depth) continue;
        for (let di = -1; di <= 1; di++) {
          const ni = i + di;
          if (ni < 0 || ni >= width) continue;
          const nIdx = nj * width + ni;
          if (out[nIdx] !== -1) continue;
          out[nIdx] = d;
          next.push(nIdx);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Mask construction                                                          */
/* -------------------------------------------------------------------------- */

/** An inclusive world-space rectangle. */
export interface MaskRect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/** The region the mask is built over. */
export interface MaskRegion {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
}

/**
 * Everything that contributes a claimed footprint.
 *
 * **Ratified disposition 8** (docs/DESIGN.md §12 open question 8): the clamp
 * covers settlement footprints and **camp cores only — not farmland**. Farm
 * masks are much larger and much softer than a settlement footprint, and a
 * feather band over a floodplain reads worse than the seam it replaces, so
 * farmland is left to the climate-derived rule. `campCores` is the seam that
 * keeps that distinction explicit: a camp contributes the rect of its core and
 * nothing of its outfields.
 */
export interface LandUseSources {
  /** District and city cell bounds. */
  readonly cells?: readonly MaskRect[];
  /** Precinct envelopes and building pads. */
  readonly pads?: readonly MaskRect[];
  /** Camp **cores** only. Never a camp's outfields, and never farmland. */
  readonly campCores?: readonly MaskRect[];
  /**
   * Column masks already row-major over the region — road/arterial/street
   * `claimed` masks and the plaza's paving.
   */
  readonly columns?: readonly Uint8Array[];
}

/** Union every source into one row-major land-use mask over `region`. */
export function buildLandUseMask(region: MaskRegion, sources: LandUseSources): Uint8Array {
  const { x0, z0, width, depth } = region;
  const mask = new Uint8Array(width * depth);
  for (const rect of [...(sources.cells ?? []), ...(sources.pads ?? []), ...(sources.campCores ?? [])]) {
    const i0 = Math.max(0, rect.x0 - x0);
    const i1 = Math.min(width - 1, rect.x1 - x0);
    const j0 = Math.max(0, rect.z0 - z0);
    const j1 = Math.min(depth - 1, rect.z1 - z0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) mask[j * width + i] = 1;
    }
  }
  for (const columns of sources.columns ?? []) {
    const len = Math.min(columns.length, mask.length);
    for (let idx = 0; idx < len; idx++) {
      if (columns[idx] === 1) mask[idx] = 1;
    }
  }
  return mask;
}
