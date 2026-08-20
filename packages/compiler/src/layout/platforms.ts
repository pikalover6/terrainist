/**
 * **Platforms from blocks** — `docs/COURTYARDS-AND-LEVELS-v0.md` §3.3.
 *
 * `terraced` cuts its own benches from the contours. Every other form cuts
 * none, so under `params.ground: "stepped"` the fabric pass has to derive them,
 * and the construction is deliberately *not* contour-led — contours are
 * `terraced`'s idea and this has to work under `grid`, `grown` and `radial`
 * too:
 *
 * 1. **The platform is the block.** Blocks are already the connected components
 *    of the ground the carriageway and its verge did not take, so a block
 *    boundary is already a street and a street already grades itself. Every
 *    block is levelled to its own **median** natural height.
 * 2. **Quantise to a storey.** `levelY = base + round((median − base) /
 *    FLOOR_HEIGHT) · FLOOR_HEIGHT`. Neighbouring blocks therefore differ by
 *    whole storeys, so a cornice line and a party wall step cleanly rather than
 *    by three blocks. It is the same number `BENCH_HEIGHT` encodes and for the
 *    same reason.
 * 3. **Split a block that cannot be one platform.** A block whose own relief
 *    exceeds `FLOOR_HEIGHT` is cut by the same construction `terraced` uses —
 *    a 5-column box blur applied twice, then a bucket per storey — and each
 *    4-connected piece of a bucket is a platform of its own. That is the
 *    split-level block, and it costs no new algorithm.
 * 4. **Blocks are re-derived after step 3.** Not here: the caller puts the
 *    seams into `blocked` before `blocksOf` runs, which is the one line the
 *    rest of §3 rests on.
 *
 * Nothing in this file is random and nothing reads a clock: the blur is an
 * integer box filter, every component walk is row-major, and every list comes
 * back in the order the field produced it. Same field in, same benches out.
 */

import type { HeightField } from "@terrainist/stdlib";

import { FLOOR_HEIGHT } from "./district.js";
import type { Rect } from "./frames.js";
import type { FormBench } from "./forms/types.js";
import { RETAIN_MAX, SEAM_TIER_MAX } from "./levels.js";
import { maskRuns } from "./masks.js";
// `import type` only, and it must stay that way: `layout/street-datum.ts`
// reaches into `structures/sweep.js` and `structures/street-owner.js`, and a
// value import from here would close a cycle that does not exist today
// (`docs/GROUND-UNIFICATION-v0.md` §11.3, "one import note for 12B").
import type { StreetDatum } from "./street-datum.js";
import { GROUND_TIE_SPAN, SEAM_TIERS } from "./types.js";

/**
 * S6 rule 3's threshold: a platform pair whose seam would need more faces than
 * the stack has is not a pair the election may make.
 */
export const DISSOLVE_DROP_MAX = SEAM_TIER_MAX * RETAIN_MAX;

/** Half-width of the box blur applied before a block is split, in columns. */
const SMOOTH_RADIUS = 2;

/** How many times the blur is applied. The same two passes `terraced` uses. */
const SMOOTH_PASSES = 2;

/**
 * Columns a derived platform must hold to be worth having.
 *
 * A sliver of a bucket at the corner of a block is not a terrace, it is a
 * rounding artefact of the blur, and levelling it would put a two-column step
 * in the middle of a garden. A fragment below this keeps its natural ground —
 * `NO_PLATFORM` — so it is founded the way it was before this phase and takes
 * part in no seam.
 */
export const MIN_PLATFORM_COLUMNS = 9;

/** Everything {@link derivePlatforms} reads. */
export interface PlatformInput {
  /** The quarter's footprint; `blocked` is row-major over it. */
  readonly bounds: Rect;
  /** 1 where the ground is street, verge, reservation or outside the cell. */
  readonly blocked: Uint8Array;
  /** The **natural** field — a `"stepped"` quarter is not pad-levelled. */
  readonly field: HeightField;
  /**
   * S6's election rules (`docs/GROUND-UNIFICATION-v0.md` §4.1): level from the
   * bucket, and merge the slivers. Defaults to {@link SEAM_TIERS}; the
   * parameter exists so a test may exercise the flag-on election without
   * flipping a compile-time constant the whole compiler reads.
   */
  readonly tiered?: boolean;
  /**
   * The lowest level a platform may take: **the water surface beside it.**
   *
   * A platform is finished ground the town stands on, and the compiler's
   * standing rule is that nothing seats below the waterline — the solver's
   * ground rules refuse water, `infra.entry` refuses a waterline for a
   * frontage, and a basin is curbed before it is poured. A level *below* the
   * surface of the water next door is none of those: it is a hole the sea
   * pours into. Grading it lowers the field, the reclassification that follows
   * a pad edit calls the result ocean, and the quarter ships as a lake with
   * lots elected on it (`LOAM-T110 UNSTABLE_FLUID` at the first doorstep cut
   * into the bank beside it).
   *
   * So every level this returns is raised to the floor. Level *at* the floor is
   * legal and is the quay case — a surface flush with the water beside it has
   * no face for the water to flow over.
   *
   * Optional: a quarter with no terrain under it (a fixture, a devworld) has no
   * water surface to answer to, and the election is unchanged without one.
   *
   * See {@link PlatformInput.water}: the floor lifts a platform out of water it
   * would *make*, and never fills water that is already there.
   */
  readonly waterFloor?: number;
  /**
   * The water that is **already there** — 1 where a column holds water, the
   * classification's ocean ∪ lake mask, row-major over {@link field}'s region.
   *
   * {@link waterFloor} says "no platform under the waterline", and it says it
   * because grading dry ground *down* below the sea makes a lake and the fabric
   * is then laid on it. Raising a platform whose own ground is water is the
   * mirror image and is just as wrong: the piece is not ground the quarter
   * stands on, it is the river running through it, and a level at the waterline
   * grades the bed *up* to the surface. That is a dam — the reach above it is
   * cut off from the sea, the ocean flood-fill (which floods only what the map
   * edge can reach) leaves it dry, and the quarter ships with half a river and
   * a lot elected in the bed.
   *
   * So a platform whose columns are mostly water is exempt from the floor and
   * keeps the level its own ground gives it. Nothing else changes: a bank piece
   * with a few wet columns is land, and land is held to the floor.
   *
   * Optional, and the floor behaves exactly as it did before this field existed
   * when it is absent — a fixture with no hydrology has no water to preserve.
   */
  readonly water?: WaterMask;
  /**
   * **The street plane the lattice is anchored on** — G2,
   * `docs/GROUND-UNIFICATION-v0.md` §11.1.
   *
   * Present ⇔ the ground-plane tie is on. `layout/district.ts` hands it over
   * only while {@link GROUND_PLANE_TIE} is true, and a test hands it over
   * directly to exercise the anchored election without moving a compile-time
   * constant the whole compiler reads — the same shape {@link tiered} has.
   *
   * Absent, every expression below is character-for-character the arithmetic
   * that shipped: the quarter-wide `min(free ground)` base, `storey(base, …)`,
   * and the bucket taken against that base. That is what makes 12B
   * byte-identical while the flag is off.
   */
  readonly datum?: PlatformDatum;
  /**
   * G3's counters, filled in place when {@link datum} is present so the caller
   * can report `LOAM-T241 GROUND_PLANE_UNTIED` without this function growing a
   * second return value (every downstream reader wants `FormBench[]` and
   * nothing else).
   */
  readonly report?: PlatformTieReport;
}

/**
 * The datum and the reach it is probed with, together because neither answers
 * anything alone.
 *
 * `reach` is `frontageReach(sidewalkWidth)` — **the same reach the lot tie
 * already probes with** (G2), so a block that has a street by the fabric's
 * reckoning has one by the plane's. No new constant.
 */
export interface PlatformDatum {
  /** The graded carriageway plane, exactly as `gradeStreetDatum` built it. */
  readonly street: StreetDatum;
  /** `frontageReach(sidewalkWidth)`, in columns. */
  readonly reach: number;
}

/** What the anchored election did, per quarter — G3's report, `LOAM-T241`. */
export interface PlatformTieReport {
  /** Blocks the election looked at. */
  blocks: number;
  /** Blocks that found a graded carriageway in reach and anchored on it. */
  tied: number;
  /** Blocks with no banded column in reach of any perimeter column (G3). */
  untied: number;
  /** Blocks split because their *perimeter* datum spanned a storey (G4). */
  spanSplit: number;
}

/** A column mask with the region it is indexed over. */
export interface WaterMask {
  /** 1 where the column holds water, row-major over {@link region}. */
  readonly mask: Uint8Array;
  /** The mask's own region — {@link PlatformInput.field}'s. */
  readonly region: { readonly x0: number; readonly z0: number; readonly width: number; readonly depth: number };
}

/**
 * **Would levelling the water inside `bounds` cut the water beyond it off from
 * the sea?** — the one question that separates reclaiming from damming.
 *
 * {@link PlatformInput.waterFloor} raises a platform to the waterline, and over
 * a shallow shelf that is *reclamation*: the quarter fills a fringe of its own
 * bay and builds a quay on it, which is what the Troy fix is for and what
 * `platform-waterline.test.ts` pins. Over a river running through the quarter it
 * is a **dam**, because water is only water where the map edge can reach it
 * (`computeOceanMask`): fill the channel and the whole reach above it stops
 * being water at all, which is how a walked world came back with half a river.
 *
 * The test is the flood-fill itself, run twice: once with the quarter's own
 * water passable and once with it blocked. If the second run reaches every
 * outside column the first one did, the quarter is reclaiming — nothing beyond
 * it depends on the water it is standing in. If it reaches fewer, the quarter is
 * a dam and its water is protected instead.
 *
 * Blocked rather than filled on purpose: a landlocked lake is unreachable in
 * *both* runs and so is never mistaken for a reach this quarter stranded.
 *
 * Pure: two row-major floods over the mask, no allocation per call beyond them.
 */
export function damsWater(water: WaterMask, bounds: Rect): boolean {
  const { region, mask } = water;
  const { width, depth } = region;
  const inBounds = (i: number, j: number): boolean => {
    const x = region.x0 + i;
    const z = region.z0 + j;
    return x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;
  };
  /** Wet columns outside `bounds` the map edge can reach, with the quarter's own water passable or not. */
  const reachOutside = (throughQuarter: boolean): number => {
    const seen = new Uint8Array(width * depth);
    const queue = new Int32Array(width * depth);
    let head = 0;
    let tail = 0;
    let outside = 0;
    const push = (i: number, j: number): void => {
      if (i < 0 || j < 0 || i >= width || j >= depth) return;
      const k = j * width + i;
      if (seen[k] === 1 || mask[k] !== 1) return;
      const own = inBounds(i, j);
      if (own && !throughQuarter) return;
      seen[k] = 1;
      queue[tail++] = k;
      if (!own) outside += 1;
    };
    for (let i = 0; i < width; i++) {
      push(i, 0);
      push(i, depth - 1);
    }
    for (let j = 0; j < depth; j++) {
      push(0, j);
      push(width - 1, j);
    }
    while (head < tail) {
      const k = queue[head++] as number;
      const i = k % width;
      const j = (k - i) / width;
      push(i - 1, j);
      push(i + 1, j);
      push(i, j - 1);
      push(i, j + 1);
    }
    return outside;
  };
  return reachOutside(false) < reachOutside(true);
}

/**
 * Is this set of columns water rather than ground? A strict majority, so a bank
 * with its toes wet is still a bank and a channel is still a channel.
 */
function mostlyWater(water: WaterMask, columns: Iterable<readonly [number, number]>): boolean {
  const { region, mask } = water;
  let n = 0;
  let wet = 0;
  for (const [x, z] of columns) {
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
    n += 1;
    if (mask[j * region.width + i] === 1) wet += 1;
  }
  return n > 0 && wet * 2 > n;
}

/** The world columns a bench covers. */
function* benchColumns(bench: FormBench): Generator<readonly [number, number]> {
  for (const run of bench.runs) {
    for (let z = run.z0; z <= run.z1; z++) for (let x = run.x0; x <= run.x1; x++) yield [x, z];
  }
}

/**
 * The platforms a quarter's blocks describe, as benches.
 *
 * `FormBench` is the wire format on purpose (§3.1): a derived platform and a
 * declared one are the same thing to everything downstream, so `groundLevelsOf`
 * needs no second entry point and `foundationY` needs no second branch.
 *
 * Returns an empty list when the ground under the quarter is flat enough that
 * every block quantises to one storey — one platform is no platform, and the
 * caller reports `DISTRICT_GROUND` rather than shipping a `"stepped"` quarter
 * that stepped nowhere.
 */
export function derivePlatforms(input: PlatformInput): FormBench[] {
  const { bounds, blocked, field } = input;
  const tiered = input.tiered ?? SEAM_TIERS;
  // The waterline floor (`PlatformInput.waterFloor`). Applied where a level is
  // *computed* rather than to the finished benches, so the sliver merge — which
  // breaks ties to the lower level — reasons about levels that exist: a level
  // under the water is not a lower level, it is not a level at all.
  // …and never a licence to fill (`PlatformInput.water`): a piece that is
  // itself water keeps the level its own bed gives it, because raising it is
  // damming the river rather than lifting the town out of a lake it made.
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const cells = width * depth;
  if (cells <= 0 || blocked.length < cells) return [];

  const region = field.region;
  const heightAt = (k: number): number => {
    const x = bounds.x0 + (k % width);
    const z = bounds.z0 + Math.floor(k / width);
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return 0;
    // floor, not round: the materialisation rule (`terrain/columns.ts`,
    // `street-datum.ts` materialisedGround). Rounding here put the quarter's
    // ground plane one above the street datum on any half-block field — the
    // walked "streets sunken one block" (unicorn island, r22: 209 of 402
    // road edges at exactly +1).
    return Math.floor(field.values[j * region.width + i] as number);
  };
  const columnAt = (k: number): readonly [number, number] => [
    bounds.x0 + (k % width),
    bounds.z0 + Math.floor(k / width),
  ];
  const dry = (level: number, cells: readonly number[]): number => {
    if (input.waterFloor === undefined) return level;
    if (input.water !== undefined && mostlyWater(input.water, cells.map(columnAt))) return level;
    return Math.max(level, input.waterFloor);
  };

  // The quarter's datum: the lowest column any block stands on. Measured over
  // the *free* ground only, so a street cut down to a river does not drag the
  // whole quantisation with it.
  let base = Number.POSITIVE_INFINITY;
  for (let k = 0; k < cells; k++) {
    if (blocked[k] === 1) continue;
    const h = heightAt(k);
    if (h < base) base = h;
  }
  if (base === Number.POSITIVE_INFINITY) return [];

  const raw = new Float64Array(cells);
  for (let k = 0; k < cells; k++) raw[k] = heightAt(k);
  const smooth = boxBlur(raw, width, depth, SMOOTH_RADIUS, SMOOTH_PASSES);

  // G2 — the anchor. A block is already street-bounded (rule 1 of this file's
  // header: "a block boundary is already a street and a street already grades
  // itself"), so the block's own perimeter is the authority for the block's
  // plane: the levels the datum reports within `reach` of each perimeter
  // column, and the **lower** median of them.
  //
  // Lower, and this is F5's corner rule wearing different clothes: where the
  // streets around a block disagree, the plane goes low. A plane one below its
  // pavement is a kerb you step down off; a plane one above it is the defect
  // Kai walked four times.
  //
  // Deterministic: `component` returns its cells in ascending index order, the
  // perimeter is read in that order, `levelNear` is documented as
  // ascending-region-index with ties to the lowest, and the sort is numeric.
  const datum = input.datum;
  const perimeterLevels = (piece: readonly number[], owns: (k: number) => boolean): number[] => {
    const out: number[] = [];
    if (datum === undefined) return out;
    for (const k of piece) {
      const i = k % width;
      const j = (k - i) / width;
      let edge = false;
      for (const [di, dj] of NEIGHBOURS) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= width || jj >= depth) {
          edge = true;
          break;
        }
        if (!owns(jj * width + ii)) {
          edge = true;
          break;
        }
      }
      if (!edge) continue;
      const level = datum.street.levelNear(bounds.x0 + i, bounds.z0 + j, datum.reach);
      if (level !== undefined) out.push(level);
    }
    out.sort((a, b) => a - b);
    return out;
  };
  /** The lower median of a sorted list, or `undefined` — G3's "no frontage, no tie". */
  const anchorOf = (levels: readonly number[]): number | undefined =>
    levels.length === 0 ? undefined : (levels[(levels.length - 1) >> 1] as number);
  const benches: FormBench[] = [];
  const seen = new Uint8Array(cells);
  for (let start = 0; start < cells; start++) {
    if (blocked[start] === 1 || seen[start] === 1) continue;
    const block = component(start, cells, width, depth, seen, (k) => blocked[k] !== 1);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const k of block) {
      const h = heightAt(k);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    // The block's own membership mask — needed for the perimeter walk, and the
    // same mask the split branch below calls `inner`. Allocated only when it is
    // read, so the flag-off path allocates exactly what it allocated before.
    let inner: Uint8Array | null = null;
    const blockMask = (): Uint8Array => {
      if (inner !== null) return inner;
      const mask = new Uint8Array(cells);
      for (const k of block) mask[k] = 1;
      inner = mask;
      return mask;
    };
    let blockBase = base;
    let perimeterSpan = 0;
    if (datum !== undefined) {
      const mask = blockMask();
      const levels = perimeterLevels(block, (k) => mask[k] === 1);
      const anchor = anchorOf(levels);
      // G3: a block with no banded column within reach of any perimeter column
      // is not tied and keeps exactly the base it has today. Inventing a street
      // for a block that has none is how a courtyard ends up on a road's plane.
      blockBase = anchor ?? base;
      perimeterSpan =
        levels.length === 0 ? 0 : (levels[levels.length - 1] as number) - (levels[0] as number);
      if (input.report !== undefined) {
        input.report.blocks += 1;
        if (anchor === undefined) input.report.untied += 1;
        else input.report.tied += 1;
        if (perimeterSpan > GROUND_TIE_SPAN) input.report.spanSplit += 1;
      }
    }
    // G4: a block whose *perimeter* datum spans more than one storey of street
    // cannot be one platform without one of its streets being wrong about it,
    // so it takes the split the interior-relief case already takes. The second
    // clause is vacuously true with no datum — `perimeterSpan` is 0.
    if (hi - lo <= FLOOR_HEIGHT && perimeterSpan <= GROUND_TIE_SPAN) {
      push(
        benches,
        bounds,
        block,
        dry(storey(blockBase, medianOf(block, heightAt)), block),
        `block.${start}`,
      );
      continue;
    }
    // Split. The bucket is the blurred storey, and each 4-connected piece of a
    // bucket is its own platform: two lobes of one bucket either side of a
    // ridge are two terraces, not one with a hole in it.
    const bucket = new Int32Array(cells).fill(-1);
    for (const k of block) {
      // floor(smooth), matching heightAt: since 11C the bucket IS the level,
      // so the partition must sample by the same materialisation rule.
      bucket[k] = Math.floor((Math.floor(smooth[k] as number) - blockBase) / FLOOR_HEIGHT);
    }
    const membership = blockMask();
    const split = new Uint8Array(cells);
    const pieces: SplitPiece[] = [];
    for (const k of block) {
      if (split[k] === 1) continue;
      const b = bucket[k] as number;
      const piece = component(
        k,
        cells,
        width,
        depth,
        split,
        (n) => membership[n] === 1 && bucket[n] === b,
      );
      pieces.push({ bucket: b, level: 0, cells: piece });
    }
    // S6 rule 1: the level comes from the bucket that defined the piece, not
    // from the raw median of its columns. Partitioning on one quantity and
    // levelling by another is what let two 4-adjacent pieces one bucket apart
    // stand two storeys apart (§4.0a M4); under the flag they never can.
    //
    // **Every piece of a block sits on the block's one lattice**, so the split
    // pieces step from each other in whole storeys and the congruence law —
    // *every elected level is congruent to its block's anchor modulo
    // FLOOR_HEIGHT* — is a property of the whole quarter rather than of one
    // piece at a time. G4's "each piece re-anchors on the datum along its own
    // share of the perimeter" was built and measured on the r22 pirates world
    // first: re-anchoring per piece moved **14 columns** of `LOAM-T242` the
    // wrong way (1,265 → 1,279) because two pieces of one block can then be
    // incongruent with each other, which is M4 again wearing the anchor's
    // clothes. One lattice per block is the version that holds the law the wave
    // is asserted on.
    for (const piece of pieces) {
      piece.level = dry(
        tiered
          ? blockBase + piece.bucket * FLOOR_HEIGHT
          : storey(blockBase, medianOf(piece.cells, heightAt)),
        piece.cells,
      );
    }
    if (!tiered) {
      for (const piece of pieces) {
        if (piece.cells.length < MIN_PLATFORM_COLUMNS) continue;
        push(benches, bounds, piece.cells, piece.level, `block.${start}.${piece.bucket}`);
      }
      continue;
    }
    // S6 rule 2: a sliver merges rather than staying natural. Leaving it at
    // `NO_PLATFORM` puts natural ground *inside* levelled ground — the quarry's
    // grass stubs (§4.0a M5).
    for (const piece of mergeSlivers(pieces, width, depth, cells)) {
      push(benches, bounds, piece.cells, piece.level, `block.${start}.${piece.bucket}`);
    }
  }

  // One platform is no platform: it is a pad with extra words, and the caller
  // says so with `DISTRICT_GROUND` rather than building a seamless "stepped"
  // quarter. Two platforms at one level are the same statement.
  const distinct = new Set(benches.map((b) => b.level));
  if (distinct.size <= 1) return [];
  return benches;
}

/** One 4-connected piece of one bucket, before the sliver merge. */
interface SplitPiece {
  readonly bucket: number;
  level: number;
  cells: number[];
}

/**
 * S6 rule 2 — every piece under {@link MIN_PLATFORM_COLUMNS} joins the
 * neighbouring piece it touches most; ties break to the **lower** level, then
 * to the earlier piece.
 *
 * Repeated to a fixed point, because a sliver's best neighbour may itself be a
 * sliver, and merging two of them can make a platform worth having. A sliver
 * with no neighbour at all — a block that came out as one piece — is kept
 * rather than dropped: levelled ground with a small platform in it is the
 * honest answer, natural ground inside levelled ground is not.
 *
 * Deterministic throughout: pieces are visited in index order, contacts are
 * counted row-major, and every tie has a total order.
 */
export function mergeSlivers(
  pieces: readonly SplitPiece[],
  width: number,
  depth: number,
  cells: number,
): SplitPiece[] {
  const live = pieces.map((p) => ({ bucket: p.bucket, level: p.level, cells: [...p.cells] }));
  const dead = new Uint8Array(live.length);
  const owner = new Int32Array(cells).fill(-1);
  for (const [i, piece] of live.entries()) for (const k of piece.cells) owner[k] = i;

  for (let guard = 0; guard <= live.length; guard++) {
    let merged = false;
    for (const [i, piece] of live.entries()) {
      if (dead[i] === 1 || piece.cells.length >= MIN_PLATFORM_COLUMNS) continue;
      const contacts = new Map<number, number>();
      for (const k of piece.cells) {
        const ci = k % width;
        const cj = (k - ci) / width;
        for (const [di, dj] of NEIGHBOURS) {
          const ii = ci + di;
          const jj = cj + dj;
          if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
          const n = jj * width + ii;
          const o = owner[n] as number;
          if (o < 0 || o === i || dead[o] === 1) continue;
          contacts.set(o, (contacts.get(o) ?? 0) + 1);
        }
      }
      let best = -1;
      let bestCount = 0;
      for (const [o, count] of [...contacts.entries()].sort((a, b) => a[0] - b[0])) {
        const bestPiece = best < 0 ? null : (live[best] as SplitPiece);
        const better =
          bestPiece === null ||
          count > bestCount ||
          (count === bestCount && (live[o] as SplitPiece).level < bestPiece.level);
        if (better) {
          best = o;
          bestCount = count;
        }
      }
      if (best < 0) continue;
      const target = live[best] as SplitPiece;
      for (const k of piece.cells) owner[k] = best;
      target.cells = [...target.cells, ...piece.cells].sort((a, b) => a - b);
      piece.cells = [];
      dead[i] = 1;
      merged = true;
    }
    if (!merged) break;
  }
  return live.filter((_, i) => dead[i] !== 1);
}

/** One platform pair the election could not pay for, as S6 rule 3 dissolved it. */
export interface DissolvedLevel {
  /** The higher platform, which gave its level back. */
  readonly id: string;
  /** The lower platform it took its level from. */
  readonly into: string;
  /** The drop the seam between them would have had to serve. */
  readonly drop: number;
}

/**
 * S6 rule 3 — **a pair past {@link DISSOLVE_DROP_MAX} dissolves.**
 *
 * The tier stack serves `SEAM_TIER_MAX` faces of `RETAIN_MAX`; a seam past that
 * is not a seam a town builds, it is a dam, and the design's answer is that the
 * *election* was wrong rather than the construction. The higher platform gives
 * its level back to the lower one and the quarter ships with fewer levels.
 *
 * `COURTYARDS-AND-LEVELS` §3.5 step 3, moved from a post-hoc repair into the
 * election, and the first thing that ever emits `LOAM-W410 LEVEL_DISSOLVED`.
 *
 * Pure: adjacency is 4-connected over the benches' own masks, pairs are visited
 * in `(higher index, lower index)` order, and the walk repeats to a fixed point
 * so a chain of three dissolves the same way whichever end it is entered from.
 *
 * `waterFloor` is {@link PlatformInput.waterFloor}, and the dissolve honours it
 * for the same reason the election does: giving a level back is still electing
 * one, and a platform may not take a level below the surface of the water
 * beside it. Without this a plateau adjacent to a shore piece dissolves *into
 * the sea* — the whole quarter is graded under the waterline, the pad edit's
 * reclassification floods it, and the fabric is laid on a lake.
 *
 * `water` is {@link PlatformInput.water} and carries the same exemption: a
 * platform that *is* water — a river channel through the quarter — keeps its
 * own bed's level, dissolving or not, because raising it to the waterline dams
 * the river instead of draining a lake.
 */
export function dissolveTallPairs(
  bounds: Rect,
  benches: readonly FormBench[],
  waterFloor?: number,
  water?: WaterMask,
): { readonly benches: FormBench[]; readonly dissolved: DissolvedLevel[] } {
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const cells = width * depth;
  const dissolved: DissolvedLevel[] = [];
  if (cells <= 0 || benches.length < 2) return { benches: [...benches], dissolved };

  const owner = new Int32Array(cells).fill(-1);
  for (const [i, bench] of benches.entries()) {
    for (const run of bench.runs) {
      for (let z = run.z0; z <= run.z1; z++) {
        const j = z - bounds.z0;
        if (j < 0 || j >= depth) continue;
        for (let x = run.x0; x <= run.x1; x++) {
          const ii = x - bounds.x0;
          if (ii < 0 || ii >= width) continue;
          owner[j * width + ii] = i;
        }
      }
    }
  }
  // Which benches are the water rather than the ground beside it.
  const submerged =
    water === undefined
      ? benches.map(() => false)
      : benches.map((b) => mostlyWater(water, benchColumns(b)));
  const dry = (level: number, bench: number): number =>
    waterFloor === undefined || submerged[bench] === true ? level : Math.max(level, waterFloor);
  const levels = benches.map((b, i) => dry(b.level, i));
  // Every 4-adjacent pair, once, as `a < b` on index.
  const pairs = new Set<number>();
  for (let k = 0; k < cells; k++) {
    const a = owner[k] as number;
    if (a < 0) continue;
    const i = k % width;
    const j = (k - i) / width;
    for (const [di, dj] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
      const b = owner[jj * width + ii] as number;
      if (b < 0 || b === a) continue;
      pairs.add(Math.min(a, b) * benches.length + Math.max(a, b));
    }
  }
  const ordered = [...pairs].sort((x, y) => x - y);
  for (let guard = 0; guard <= benches.length; guard++) {
    let changed = false;
    for (const key of ordered) {
      const a = Math.floor(key / benches.length);
      const b = key % benches.length;
      const drop = Math.abs((levels[a] as number) - (levels[b] as number));
      if (drop <= DISSOLVE_DROP_MAX) continue;
      const high = (levels[a] as number) > (levels[b] as number) ? a : b;
      const low = high === a ? b : a;
      levels[high] = dry(levels[low] as number, high);
      dissolved.push({
        id: benches[high]?.id ?? `${high}`,
        into: benches[low]?.id ?? `${low}`,
        drop,
      });
      changed = true;
    }
    if (!changed) break;
  }
  return {
    benches: benches.map((bench, i) => ({ ...bench, level: levels[i] as number })),
    dissolved,
  };
}

/** §3.3 step 2: a median, quantised to whole storeys above the quarter's base. */
function storey(base: number, median: number): number {
  return base + Math.round((median - base) / FLOOR_HEIGHT) * FLOOR_HEIGHT;
}

function medianOf(cells: readonly number[], heightAt: (k: number) => number): number {
  const heights = cells.map(heightAt).sort((a, b) => a - b);
  return heights[heights.length >> 1] as number;
}

function push(
  out: FormBench[],
  bounds: Rect,
  cells: readonly number[],
  level: number,
  id: string,
): void {
  const mask = new Uint8Array((bounds.x1 - bounds.x0 + 1) * (bounds.z1 - bounds.z0 + 1));
  for (const k of cells) mask[k] = 1;
  const runs = maskRuns(bounds, mask);
  if (runs.length === 0) return;
  out.push({ id, runs, level });
}

/** 4-connected component from `start`, row-major, marking `seen` as it goes. */
function component(
  start: number,
  cells: number,
  width: number,
  depth: number,
  seen: Uint8Array,
  member: (k: number) => boolean,
): number[] {
  const out: number[] = [];
  if (seen[start] === 1 || !member(start)) return out;
  seen[start] = 1;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    out.push(k);
    const i = k % width;
    const j = (k - i) / width;
    for (const [di, dj] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
      const n = jj * width + ii;
      if (n < 0 || n >= cells || seen[n] === 1 || !member(n)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * A separable box blur, `passes` times, clamped at the edge.
 *
 * Integer window, no transcendentals, no RNG: the same field in gives the same
 * field out on every runtime, which is the determinism law stated in code. It
 * is `terraced`'s blur, re-stated rather than imported, because that one is
 * private to a form and this file is not allowed to reach into one.
 */
function boxBlur(
  field: Float64Array,
  width: number,
  depth: number,
  radius: number,
  passes: number,
): Float64Array {
  let current = Float64Array.from(field);
  for (let pass = 0; pass < passes; pass++) {
    const rows = new Float64Array(current.length);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) {
          const ii = Math.min(width - 1, Math.max(0, i + d));
          sum += current[j * width + ii] as number;
        }
        rows[j * width + i] = sum / (2 * radius + 1);
      }
    }
    const both = new Float64Array(current.length);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) {
          const jj = Math.min(depth - 1, Math.max(0, j + d));
          sum += rows[jj * width + i] as number;
        }
        both[j * width + i] = sum / (2 * radius + 1);
      }
    }
    current = both;
  }
  return current;
}
