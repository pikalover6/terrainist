/**
 * **The transition generator — G6 amendment.**
 *
 * > **Resolution (a): the transition generator is part of the fifth resolve.**
 * > `deriveGroundSeams` stops being a describer: inside `resolveGround`'s final
 * > pass it materialises ramp rings, eased blends and tread levels directly into
 * > the resolved arrays — constrained exactly as the derivation already computes
 * > (`availableRun` against the owner map; a transition may shape only columns no
 * > higher-ranked claim owns), determinism unchanged.
 *
 * This module is the geometry half of that sentence, and it is deliberately *not*
 * a second arbitration: it computes the same ring targets `gradeBank` computes
 * and the same tread bands `buildTieredSeam` computes, and hands them back as
 * ordinary {@link GroundIntent}s at the classes those builders always filed
 * (`verge` for a ramp, `retaining.skirt` for a stack). `resolveGround` then
 * ingests them through the same pass 2/3 loop every declared claim goes through,
 * so "a transition shapes only columns no higher-ranked claim owns" is enforced
 * by the precedence table itself rather than by a second hand-written guard list
 * — which is exactly how the same geometry was arbitrated before the freeze, when
 * `finishSeams` declared it from the build half.
 *
 * **The arithmetic is reused, never re-derived.** `bankRun`, `blendedBankFall`,
 * `tiersOf`, `treadOf`, `tierCountOf`, `seamDressing` and `MIN_RETAIN_RUN` all
 * come from `layout/levels.ts`, so the drop table still has one home. What is
 * restated here — and only here — is the *shape* of the two walks (a ring BFS
 * outward from the run, a distance-banded stack outward from the run), because
 * `structures/retaining.ts` sits downstream of this layer and cannot be imported
 * from it.
 *
 * Pure and order-independent: every walk is seeded from the run's own row-major
 * cells, every frontier is sorted on region index, and nothing reads a clock or
 * an RNG.
 */

import { APRON_RUN_PER_BLOCK, type Region } from "@terrainist/stdlib";

import { FluidKind } from "../terrain/columns.js";

import type {
  GroundClaim,
  GroundIntent,
  GroundSourceClass,
  ReadonlyInt32Array,
  ReadonlyUint8Array,
} from "./ground-contract.js";
import { isAboveOf, rankOf } from "./ground-contract.js";
import type { DerivedSeam } from "./ground-resolver.js";
import {
  MIN_RETAIN_RUN,
  SEAM_SETBACK,
  SEAM_TIER_FACE,
  SEAM_TIER_MAX,
  bankRun,
  blendedBankFall,
  seamDressing,
  tierCountOf,
  tiersOf,
  type SeamTier,
} from "./levels.js";

/** What a generated tier claim can take: every class ranked at or after it. */
const SKIRT_RANK = rankOf("retaining.skirt" as GroundSourceClass);

/** The 4-neighbourhood every walk here uses — `retaining.ts`'s `NEIGHBOURS`. */
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * The classes whose ground a seam construction may not stand on.
 *
 * `retaining.ts`'s `SEAM_BLOCKING_CLASSES`, restated for the reason
 * `V1_DEPTH_REACH` is restated in `ground-resolver.ts`: this module sits upstream
 * of the pass that owns the constant, and `ground-transitions.test.ts` asserts
 * the two agree. Together with the footprint classes and the fluid mask these are
 * `gradeBank`'s and `buildTieredSeam`'s `street` / `occupied` / `fluidKind`
 * guards, asked of the owner map.
 */
const BLOCKING_CLASSES: ReadonlySet<string> = new Set<string>([
  "street.network",
  "street.sidewalk",
  "road.network",
  "sweep.run",
  "doorstep.landing",
  "building.footprint",
  // `"pad.record"` was listed here and is not: no intent carries that class
  // (the Stocktake Run's census, class 2, 2026-08-25 — verified by payload sha
  // on the fourteen law-5 worlds).
]);

/** The classes the retaining pass itself declares — its own built-set, by owner. */
const RETAINING_CLASSES: ReadonlySet<string> = new Set<string>([
  "retaining.seam",
  "retaining.skirt",
]);

/** Everything the generator reads. All of it is the *resolved* field. */
export interface SeamGeometryInput {
  readonly region: Region;
  readonly ground: ReadonlyInt32Array;
  readonly fluidTop: ReadonlyInt32Array;
  readonly fluidKind: ReadonlyUint8Array;
  readonly owner: ReadonlyInt32Array;
  readonly intents: readonly GroundIntent[];
  /** The derivation, in its canonical row-major order. */
  readonly transitions: readonly DerivedSeam[];
  /**
   * §3.3's **built-set**: 1 on every column a builder reports standing on.
   * See {@link ResolveOptions.built} for why it is handed in rather than read
   * off the owner map, and what reading the owner map cost.
   */
  readonly built?: ReadonlyUint8Array;
  /**
   * The job number of `transitions[0]` — the index every source here is keyed
   * by (`#transition@<job>/…`). Zero, the default, for the derivation; the
   * banks' ends ({@link bankEnds}) are numbered after it, so a job names one
   * run in the generator, in `resolved.seams` and in the terminal builder.
   */
  readonly firstJob?: number;
}

/**
 * The geometry every transition in the list wants, as claims.
 *
 * One dispatch, and it is `buildDerivedSeams`' own — a bank grades, a face or a
 * stack treads, a kerb and a `built` face shape nothing, and a run shorter than
 * `MIN_RETAIN_RUN` is absorbed under S7 rather than built. What is *not* here is
 * the masonry: the courses, the coping, the rails and the rock finish stay in
 * `retaining.ts`, which is §3.1's "builders place blocks only".
 */
export function generateSeamGeometry(input: SeamGeometryInput): GroundIntent[] {
  const { region, ground, owner, fluidKind, intents, transitions } = input;
  const classOf = (k: number): string | null => {
    const o = owner[k] as number;
    return o === -1 ? null : (intents[o] as GroundIntent).sourceClass;
  };
  const open = openOf(input);
  const inBounds = (x: number, z: number): boolean =>
    x >= region.x0 &&
    z >= region.z0 &&
    x < region.x0 + region.width &&
    z < region.z0 + region.depth;
  const idxOf = (x: number, z: number): number =>
    (z - region.z0) * region.width + (x - region.x0);
  const xOf = (k: number): number => region.x0 + (k % region.width);
  const zOf = (k: number): number => region.z0 + Math.floor(k / region.width);
  /** T13's waterline cap, held exactly where `buildTieredSeam` holds it. */
  const standsAbove = (k: number, y: number): boolean => {
    const x = xOf(k);
    const z = zOf(k);
    for (const [dx, dz] of NEIGHBOURS) {
      if (!inBounds(x + dx, z + dz)) continue;
      const m = idxOf(x + dx, z + dz);
      if ((fluidKind[m] as number) === FluidKind.NONE) continue;
      if ((input.fluidTop[m] as number) > y) return false;
    }
    return true;
  };

  const out: GroundIntent[] = [];
  for (const [i, t] of transitions.entries()) {
    const job = (input.firstJob ?? 0) + i;
    if (t.refined === "kerb" || t.refined === "built") continue;
    // S7's absorption, verbatim: a run shorter than `MIN_RETAIN_RUN` is a step in
    // the ground, never a construction that failed to fit.
    if (t.cells.length < MIN_RETAIN_RUN) continue;
    // §3.3's built-set: where a builder already stands on a majority of the run,
    // the generator would be shaping ground that is about to have masonry laid
    // on it — and `finishSeams` filters its complement by the same test, so the
    // two halves cover the transition list exactly once between them.
    if (alreadyRetained(t, input.built, classOf)) continue;

    const above = upperSideOf(t, input);
    if (above === null) continue;

    const source = `#transition@${job}`;
    // **The cut side, whatever its refinement — R4's deferred mirror (§11.2),
    // landed by the Groundwork Run (C2; its frozen example is a 13-block cut
    // left raw beside a citadel street).** Every stack below stands on the
    // *low* side, and on a cut the low side is the claim — a street the tread
    // may not occupy — so a one-tier rock cut was a course refused on the
    // pavement, a taller one was the hill's rock, and a bank-refined cut went
    // to `pushRings`, which grades ground *up* to a face and so laid nothing
    // (hillside-village's slot canyon, 12 deep both sides, measured 2026-08-27).
    // The mirror steps the other way: the tiers are cut **back into the high
    // side**, one face per course, and the low side keeps every column it
    // owns. See {@link pushCutTiers}. Nothing on the fill side moves.
    if (
      t.side === "cut" &&
      (owner[t.cells[0] as number] as number) !== -1 &&
      tierCountOf(t.drop) >= 1 &&
      tierCountOf(t.drop) <= SEAM_TIER_MAX
    ) {
      pushCutTiers(out, `${source}/cut`, t, input, open, standsAbove);
      continue;
    }

    if (t.refined === "bank") {
      const easedRun = t.blendRun;
      // A bank whose first ring is held — every column at the run's foot a
      // street, a footprint or water — has nowhere to start: rings beyond the
      // gap would be a hump across the street, not a bank against the face
      // (walled city /tp -172 90 -65: an eased bank of 36, a lane at its foot).
      if (t.side === "fill" && ((easedRun === 0 && t.availableRun < bankRun(t.drop)) || footHeld(t, input, open))) {
        // §3.3's refusal column: S5 re-dresses the stack `revetted`, which always
        // fits, and only a stack that finds no ground at all is refused.
        if (tierCountOf(t.drop) <= SEAM_TIER_MAX) {
          const before = out.length;
          pushTiers(out, `${source}/tier`, t, above, "revetted", input, open, standsAbove);
          // **The fill's own edge, stepped (Groundwork Run unit 10).** Bank and
          // stack both want the *low* side, and where that is a street, a
          // footprint or water neither has a column to stand on: a verge or a
          // skirt then stood 16 over a lane as one earth face (walled city
          // /tp -172 90 -65). The cut geometry serves it from the other side —
          // the fill's edge columns are lowered course by course, exactly as a
          // hill's rim is — for every fill class the skirt outranks; a plane,
          // a plaza or a footprint above keeps its ground (rank), a street is
          // never moved (`open`). Only where the stack declared nothing, so
          // every fill a stack serves is byte-identical.
          // …or fewer tiers than the drop needs (one course at the foot of a
          // twenty-block fill, the next tier's ground not open — g1's pirate
          // isles), the rest of the face is the fill's own edge, cut in courses.
          if (out.length - before < tierCountOf(t.drop)) {
            pushCutTiers(out, `${source}/cut`, t, input, open, standsAbove);
          }
        }
        continue;
      }
      pushRings(out, `${source}/bank`, t, above, easedRun, input, open);
      continue;
    }

    if (t.refined === "rock") {
      // R4's second answer, verbatim: a cut whose low side a claim owns and whose
      // drop is one tier tall is one revetted course. Everything taller is the
      // hill's own rock, and rock moves no ground at all.
      // Every cut with an owned low side took the mirror above; what reaches
      // here is a cut no claim stands under, which moves no ground at all.
      const ownedLow = (owner[t.cells[0] as number] as number) !== -1;
      if (ownedLow && tierCountOf(t.drop) === 1) {
        pushTiers(out, `${source}/tier`, t, above, "revetted", input, open, standsAbove);
      }
      continue;
    }

    const dressing = seamDressing(t.pressedShare, t.availableRun, tierCountOf(t.drop));
    const before = out.length;
    pushTiers(out, `${source}/tier`, t, above, dressing, input, open, standsAbove);
    // A fill's stack that found no ground on the low side: its own edge is
    // stepped instead (see the bank branch above).
    if (out.length - before < tierCountOf(t.drop) && t.side === "fill" && tierCountOf(t.drop) <= SEAM_TIER_MAX) {
      pushCutTiers(out, `${source}/cut`, t, input, open, standsAbove);
    }
  }
  return out;
}

/** `gradeBank`'s and `buildTieredSeam`'s `open()`, off the owner map. */
function openOf(
  field: Pick<SeamGeometryInput, "owner" | "fluidKind" | "intents">,
): (k: number) => boolean {
  const { owner, fluidKind, intents } = field;
  return (k: number): boolean => {
    if ((fluidKind[k] as number) !== FluidKind.NONE) return false;
    const o = owner[k] as number;
    return o === -1 || !BLOCKING_CLASSES.has((intents[o] as GroundIntent).sourceClass);
  };
}

/** A generated bank's own claim: `#transition@<job>/bank`. */
const BANK_SOURCE = /^#transition@\d+\/bank$/;

/**
 * **Where a bank's rings end against held ground — the banks' ends (Groundwork
 * Run unit 10, C2's fill side).**
 *
 * {@link pushRings} grades a fill's bank outward into open ground, and its
 * rings spread *around* the run's end as well as away from it: where the run
 * stops beside a lane, a footprint or water, the rings raise the natural
 * ground hard against that held column to whatever the eased curve says —
 * walled city `/tp -172 90 -65`: seam 202's bank, a drop of 18 eased over
 * 36, stands 16 over a lane at its south end as one raw earth face, and no
 * seam in the derivation names it, because the derivation ran before the
 * rings existed and the held column never moved.
 *
 * The answer is a second derivation over the shaped field, filtered to the
 * runs the banks themselves made: a `fill` run whose every upper owner is a
 * generated bank and whose foot is held ({@link footHeld} — a street, a
 * footprint or water on every column below it, so neither a bank nor a stack
 * has a column to stand on). Those are handed back through the same dispatch
 * every derived seam takes, numbered after the derivation's own jobs, and the
 * only branch that can serve them is {@link pushCutTiers}: the bank's own edge
 * is stepped down to the held ground in courses of at most `SEAM_TIER_FACE`,
 * lowering `verge` columns only (rank), never a held one, and the terminal
 * builder dresses the courses it finds (`buildCutStack`).
 *
 * Everything else the second derivation sees is left alone — a run with a
 * declared claim above it was the first derivation's, and one whose foot is
 * open ground is the bank's own toe, already at grade — so a bank that spreads
 * into open ground is byte-identical.
 */
export function bankEnds(
  transitions: readonly DerivedSeam[],
  field: Pick<SeamGeometryInput, "region" | "owner" | "fluidKind" | "intents">,
): DerivedSeam[] {
  const open = openOf(field);
  const isBank = (o: number): boolean =>
    o !== -1 && BANK_SOURCE.test((field.intents[o] as GroundIntent).source);
  return transitions.filter((t) => {
    if (t.side !== "fill" || t.refined === "kerb" || t.refined === "built") return false;
    const uppers = t.aboveOwners !== undefined && t.aboveOwners.length > 0 ? t.aboveOwners : [t.above];
    if (!uppers.every(isBank)) return false;
    return footHeld(t, field, open);
  });
}

/**
 * Whether the run's foot — every column one step outward from the run that is
 * not the upper side's — is held, so neither a bank's first ring nor a stack's
 * bottom tier has a column to stand on. Shared by the builder's bank branch.
 */
export function footHeld(
  t: DerivedSeam,
  input: Pick<SeamGeometryInput, "region" | "owner">,
  open: (k: number) => boolean,
): boolean {
  const { region } = input;
  const inRun = new Set<number>(t.cells);
  for (const k of t.cells) {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    for (const [dx, dz] of NEIGHBOURS) {
      const xx = x + dx;
      const zz = z + dz;
      if (xx < region.x0 || zz < region.z0) continue;
      if (xx >= region.x0 + region.width || zz >= region.z0 + region.depth) continue;
      const m = (zz - region.z0) * region.width + (xx - region.x0);
      if (inRun.has(m) || isAboveOf(t, input.owner[m] as number)) continue;
      if (open(m)) return false;
    }
  }
  return true;
}

/**
 * Whether some builder already stands on this run — `reportedBuilt`'s question,
 * asked of the same mask and by the same **majority** rule (a wall clipping the
 * end of a hundred-column contour has not served it).
 *
 * **G6-r4's reconciliation.** r3 asked the *owner map* instead, on the argument
 * that the retaining pass declares every column it stands on. It does — but a
 * declared column is not a won one: a footprint at rank 10 or a plaza at 30
 * takes columns a skirt at 70 asked for, and on those the owner map says
 * `building.footprint` and the generator files a bank across ground a wall is
 * already standing in. `finishSeams` then correctly refuses to build the run a
 * second time (it filters on the mask), so the geometry stands alone and the
 * masonry the mask promised never arrives — the two halves disagreeing about
 * the same set. Pirates measured it exactly: `retaining.skirt`-owned cliff pairs
 * 106 → 29 with the town's ground pairs rising 343 → 482.
 *
 * The mask is authoritative when it is present. The owner-map reading survives
 * as the fallback for a caller with no built-set to hand in — the unit tests and
 * any resolve outside the settlement pipeline — where it is the only evidence
 * there is.
 */
function alreadyRetained(
  t: DerivedSeam,
  built: ReadonlyUint8Array | undefined,
  classOf: (k: number) => string | null,
): boolean {
  let served = 0;
  if (built !== undefined) {
    // A served mask cannot vouch for a drop the serving could never have
    // covered: a road that piles its verge twenty high beside a terrace whose
    // six-block seam was served earlier is a new face (the Groundwork Run's
    // C2, g1's pirate isles), not a served one.
    if (t.drop > SEAM_TIER_FACE * SEAM_TIER_MAX) return false;
    // The mask carries the courses standing on each column (unit 14). A cell
    // is served when what stands there reaches the face or a whole tier of it:
    // a six-course wall at the foot of eighteen is a stack's first tier and
    // serves; two courses at the foot of eleven are a skirt that stopped short
    // (the sweep's first finding — pirates_k1, troy_k1, troy_r22), and the run
    // goes on to the generator and the builder's hooks.
    const reach = Math.min(t.drop - 1, SEAM_TIER_FACE);
    for (const k of t.cells) if ((built[k] as number) >= Math.max(1, reach)) served++;
  } else {
    for (const k of t.cells) {
      const c = classOf(k);
      if (c !== null && RETAINING_CLASSES.has(c)) served++;
    }
  }
  return served * 2 >= t.cells.length;
}

/**
 * The upper side's own columns — `adaptSeam`'s `highRuns`, as a mask.
 *
 * The 4-neighbours of the run the upper side *owns and stands over*. `null`
 * where there are none, which is a run against the region edge with no face to
 * build, and is `adaptSeam`'s own `null`.
 */
function upperSideOf(t: DerivedSeam, input: SeamGeometryInput): Uint8Array | null {
  const { region, ground, owner } = input;
  const cells = region.width * region.depth;
  const inRun = new Uint8Array(cells);
  for (const k of t.cells) inRun[k] = 1;
  const hill = new Uint8Array(cells);
  let found = 0;
  for (const k of t.cells) {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    const y = ground[k] as number;
    for (const [dx, dz] of NEIGHBOURS) {
      const xx = x + dx;
      const zz = z + dz;
      if (xx < region.x0 || zz < region.z0) continue;
      if (xx >= region.x0 + region.width || zz >= region.z0 + region.depth) continue;
      const m = (zz - region.z0) * region.width + (xx - region.x0);
      if (hill[m] === 1 || inRun[m] === 1) continue;
      if (!isAboveOf(t, owner[m] as number)) continue;
      if ((ground[m] as number) <= y) continue;
      hill[m] = 1;
      found++;
    }
  }
  return found === 0 ? null : hill;
}

/**
 * **`gradeBank`'s ring walk, as claims** — S8's 1:2 ramp, or §7.2's eased blend.
 *
 * One `verge` profile claim over every ring column the ramp raises, at the target
 * it raises it to. Identical arithmetic to the builder's: the same `steps`, the
 * same `target` per ring, the same "past the floor the bank is the ground" stop,
 * and the same outward-only frontier that never walks into the platform above.
 *
 * **The top is per column — the bank drapes (Groundwork Run unit 11).** A
 * seam's `aboveY` is one number for the run (`refineRun`: the first cell's
 * ground plus the run's tallest drop), and a street climbs along its run:
 * montfort `/tp 90 94 24`, seam 52, `aboveY` 94 over a sidewalk that stands
 * at 90 by z 18..24 — every ring hung from 94, four above the pavement it
 * banked from and nine over the natural ground beyond. Each run cell's top
 * is now its station (`DerivedSeam.stations`, via {@link drapeOf}: the
 * tallest upper-side neighbour, never above `aboveY`), carried outward ring
 * by ring as the max over a column's parents, so the curve falls from the
 * station beside it. The walk, `steps`, `drop` and the floor stop are the
 * run's, unchanged: on a level platform every station is `aboveY` and the
 * bank is byte-identical.
 */
function pushRings(
  out: GroundIntent[],
  source: string,
  t: DerivedSeam,
  hill: Uint8Array,
  easedRun: number,
  input: SeamGeometryInput,
  open: (k: number) => boolean,
): void {
  const { region, ground } = input;
  const cells = region.width * region.depth;
  const top = t.aboveY;
  const floor = t.belowY;
  const drop = t.drop;
  const eased = easedRun > 0;
  const steps = eased ? easedRun : bankRun(drop);
  const seen = new Uint8Array(cells);
  /** The ring a column was reached on, and the station its top follows. */
  const ringOf = new Int32Array(cells).fill(-1);
  const topOf = drapeOf(t, region);
  let frontier: number[] = [];
  for (const k of t.cells) {
    if (seen[k] === 1) continue;
    seen[k] = 1;
    ringOf[k] = 0;
    frontier.push(k);
  }
  frontier.sort((a, b) => a - b);
  const columns: GroundClaim[] = [];
  for (let ring = 0; ring < steps && frontier.length > 0; ring++) {
    const fall = eased ? blendedBankFall(ring + 1, drop, steps) : Math.ceil((ring + 1) / APRON_RUN_PER_BLOCK);
    if (top - fall <= floor) break;
    const next: number[] = [];
    for (const k of frontier) {
      const target = (topOf[k] as number) - fall;
      if (open(k) && target > (ground[k] as number)) columns.push({ idx: k, y: target });
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      for (const [dx, dz] of NEIGHBOURS) {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < region.x0 || zz < region.z0) continue;
        if (xx >= region.x0 + region.width || zz >= region.z0 + region.depth) continue;
        const m = (zz - region.z0) * region.width + (xx - region.x0);
        if (seen[m] === 1) {
          // A second parent on the same ring: the column follows the taller station.
          if ((ringOf[m] as number) === ring + 1 && (topOf[k] as number) > (topOf[m] as number)) topOf[m] = topOf[k] as number;
          continue;
        }
        // Only outward, into the ground below. The platform above is already there.
        if (hill[m] === 1) continue;
        seen[m] = 1;
        ringOf[m] = ring + 1;
        topOf[m] = topOf[k] as number;
        next.push(m);
      }
    }
    next.sort((a, b) => a - b);
    frontier = next;
  }
  if (columns.length === 0) return;
  columns.sort((a, b) => a.idx - b.idx);
  out.push({
    source,
    sourceClass: "verge" as GroundSourceClass,
    kind: "profile",
    columns,
    transition: "ramp",
  });
}

/**
 * **A bank's drape** — the top each run cell's rings fall from, as a
 * region-sized array filled at the run's cells, for the ring walks to carry
 * outward. The seam's station ({@link DerivedSeam.stations}: the tallest
 * upper-side column beside the cell), **never above the run's `aboveY`**:
 * a station the first cell's summary overshoots is lowered to the platform
 * beside it; one it undershoots keeps the bank the run always had there.
 * Lowering only — a raise lengthens the toe's face over the ground beyond,
 * because the walk stays the run's (walled city measured two new bare toes
 * from it); the per-station run and floor that a raise needs is a further
 * unit, and it moves every bank over uneven ground. Shared by `pushRings`
 * and `gradeBank`, so the two halves read one set of numbers.
 */
export function drapeOf(t: DerivedSeam, region: Region): Int32Array {
  const topOf = new Int32Array(region.width * region.depth);
  for (const [i, k] of t.cells.entries()) topOf[k] = Math.min(t.aboveY, t.stations?.[i] ?? t.aboveY);
  return topOf;
}

/**
 * **`buildTieredSeam`'s bands, as claims** — S4's "the tread is the tier's own
 * ground, and it is declared as such".
 *
 * The distance field, the tier bands, the waterline cap and the support carry are
 * all the builder's, verbatim; what is dropped is everything that lays a block.
 * A tier whose course found no open column is `unplaced` and declares nothing,
 * exactly as it does in the builder — the check runs before the commit there too.
 */
function pushTiers(
  out: GroundIntent[],
  source: string,
  t: DerivedSeam,
  hill: Uint8Array,
  dressing: "revetted" | "terraced",
  input: SeamGeometryInput,
  open: (k: number) => boolean,
  standsAbove: (k: number, y: number) => boolean,
): void {
  const { region } = input;
  const cells = region.width * region.depth;
  const tiers = tiersOf(t.drop, dressing);
  if (tiers === "replan" || tiers.length === 0) return;
  const n = tiers.length;
  const tread = (tiers[0] as SeamTier).tread;
  const maxDist = tread * (n - 1);
  const floor = t.belowY;

  const dist = new Int32Array(cells).fill(-1);
  let frontier: number[] = [];
  for (const k of t.cells) {
    if ((dist[k] as number) >= 0) continue;
    dist[k] = 0;
    frontier.push(k);
  }
  frontier.sort((a, b) => a - b);
  for (let d = 1; d <= maxDist && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const k of frontier) {
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      for (const [dx, dz] of NEIGHBOURS) {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < region.x0 || zz < region.z0) continue;
        if (xx >= region.x0 + region.width || zz >= region.z0 + region.depth) continue;
        const m = (zz - region.z0) * region.width + (xx - region.x0);
        if ((dist[m] as number) >= 0) continue;
        // Never into the platform the stack holds.
        if (hill[m] === 1) continue;
        dist[m] = d;
        next.push(m);
      }
    }
    next.sort((a, b) => a - b);
    frontier = next;
  }

  const tierAt = (d: number): number => (d <= 0 ? n - 1 : n - 1 - Math.ceil(d / tread));
  const courseDist = (k: number): number => (n - 1 - k) * tread;
  const levelOf: number[] = [];
  {
    let running = floor;
    for (const tier of tiers) {
      running += tier.face;
      levelOf.push(running);
    }
  }
  const openAt = (k: number, d: number): boolean =>
    open(k) && standsAbove(k, levelOf[tierAt(d)] as number);

  // S2's support carry: outermost first, and support crosses the stack rather
  // than running along it.
  const held = new Uint8Array(cells);
  for (let d = maxDist; d >= 0; d--) {
    for (let c = 0; c < cells; c++) {
      if ((dist[c] as number) !== d || !openAt(c, d)) continue;
      if (d === maxDist) {
        held[c] = 1;
        continue;
      }
      const x = region.x0 + (c % region.width);
      const z = region.z0 + Math.floor(c / region.width);
      for (const [dx, dz] of NEIGHBOURS) {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < region.x0 || zz < region.z0) continue;
        if (xx >= region.x0 + region.width || zz >= region.z0 + region.depth) continue;
        const m = (zz - region.z0) * region.width + (xx - region.x0);
        if ((dist[m] as number) === d + 1 && held[m] === 1) {
          held[c] = 1;
          break;
        }
      }
    }
  }

  for (let k = 0; k < n; k++) {
    const y = levelOf[k] as number;
    const band: number[] = [];
    let courseColumns = 0;
    for (let c = 0; c < cells; c++) {
      const d = dist[c] as number;
      if (d < 0 || tierAt(d) !== k || !openAt(c, d)) continue;
      if (held[c] !== 1) continue;
      band.push(c);
      if (d === courseDist(k)) courseColumns++;
    }
    // S1's one honest refusal: a tier with no course is not placed, and an
    // unplaced tier declares nothing.
    if (courseColumns === 0 || band.length === 0) continue;
    const tierSource = `${source}/${k}`;
    const columns: readonly GroundClaim[] = band.map((c) => ({ idx: c, y }));
    // The `face` claim only. S4's companion `preserve` is what stopped a *later*
    // pass pulling the ground out from under a tread, and the generator is the
    // last thing the fifth resolve ingests: there is no later claim for a guard
    // to hold off, and a guard sharing its claim's source would be a tie the
    // precedence order is not total over (§4.5).
    out.push({
      source: tierSource,
      sourceClass: "retaining.skirt" as GroundSourceClass,
      kind: "face",
      columns,
      transition: "wall",
    });
  }
}

/**
 * **The cut side's stack, as claims** —
 * §11.2 R4's "mirror geometry", which that document deferred by name and the
 * Groundwork Run landed against C2's frozen example.
 *
 * ## The geometry, as a section (revetted, three tiers, a street on the right)
 *
 * ```
 *  hill ####                                   <- natural, untouched
 *           ####  face 2  (the hill's own column: the TOP course, never lowered)
 *              |
 *              ====  face 1  (dist 2, cut down to floor + f0 + f1)
 *                  |
 *                  ====  face 0  (dist 1, cut down to floor + f0)
 *                      |
 *                      ------------  the street, at `floor`, every column kept
 * ```
 *
 * {@link pushTiers} walks *outward* from the run into the ground below it and
 * raises bands; this walks *inward*, into the ground the upper side owns, and
 * **lowers** them — a cut only ever removes ground. Tier `k`'s band is the
 * columns at distance `k·tread + 1 … (k+1)·tread` from the run, and its course
 * is the band's *innermost* column — the one facing the street — so a revetted
 * stack (setback 1) is `n − 1` cut columns and reads as one battered wall
 * stepping back into the hill. The top course is the hill's own column at
 * distance `(n − 1)·tread + 1`: it is never lowered, and its face is whatever
 * the hill presents over the last tread, which the terminal builder dresses.
 *
 * ## Per column, not per run
 *
 * The tiers are sized from each column's **own** drop — the rim column's fall to
 * the street column it stands beside, inherited inward along the walk — rather
 * than from the run's median. A street climbs along its cut, so a per-run floor
 * would trench the terrace below the pavement at the run's high end and leave a
 * cliff at its low end. Where the local drop is one tier the rim is the top
 * course and nothing is cut; where it is past {@link SEAM_TIER_MAX} tiers the
 * column is left to the hill's rock, which is what R4's first answer always was.
 *
 * ## Two refusals, and no third
 *
 * - A column is cut only where the hill stands **at or above** the level asked
 *   for: a tread is ground removed, never ground added, so a dip in the hill
 *   ends the stack there. Support is carried outward from the run, one band at
 *   a time, exactly as the fill stack carries it inward.
 * - A tread may not leave a face taller than {@link SEAM_TIER_FACE} behind it —
 *   that would move the cliff back three columns and call it fixed. Validated
 *   from the back of the stack forward, and a column that fails un-holds the
 *   column in front of it, until what remains is a stack every face of which is
 *   a course's height or the whole line falls back to rock.
 *
 * Every claim is a `face` at `retaining.skirt`, ingested by the same precedence
 * table as the fill's, so a column a street, a footprint or water owns is never
 * touched: the walk only enters columns the upper side (`t.above`) owns, and on
 * a cut that is the hill (`-1`). Pure and order-independent: row-major seeds,
 * sorted frontiers, region-index tie-breaks.
 */
function pushCutTiers(
  out: GroundIntent[],
  source: string,
  t: DerivedSeam,
  input: SeamGeometryInput,
  open: (k: number) => boolean,
  standsAbove: (k: number, y: number) => boolean,
): void {
  const { region, ground, owner, fluidKind, intents } = input;
  const cells = region.width * region.depth;
  const tread = SEAM_SETBACK;
  /** The deepest band the generator shapes: tier `SEAM_TIER_MAX − 2`'s. */
  const maxDist = tread * (SEAM_TIER_MAX - 1);
  const xOf = (k: number): number => region.x0 + (k % region.width);
  const zOf = (k: number): number => region.z0 + Math.floor(k / region.width);
  const inBounds = (x: number, z: number): boolean =>
    x >= region.x0 && z >= region.z0 && x < region.x0 + region.width && z < region.z0 + region.depth;
  const idxOf = (x: number, z: number): number => (z - region.z0) * region.width + (x - region.x0);
  /** Ground the stack may cut into: the upper side's own, and dry. */
  // On a fill the "hill" is the fill's own edge, and only a class the skirt's
  // claims outrank may be lowered — the precedence table is the arbiter, read
  // here so the walk never asks for a plane's or a plaza's column (which the
  // resolve would refuse anyway) and never steps *through* one.
  const lowerable = (k: number): boolean => {
    const o = owner[k] as number;
    return o === -1 || rankOf((intents[o] as GroundIntent).sourceClass) >= SKIRT_RANK;
  };
  const hillside = (k: number): boolean =>
    isAboveOf(t, owner[k] as number) && lowerable(k) && (fluidKind[k] as number) === FluidKind.NONE;

  // --- the walk, inward from the run's own cells ------------------------------
  const dist = new Int32Array(cells).fill(-1);
  /** The lowest street column any line of the stack through this column stands beside. */
  const floorOf = new Int32Array(cells);
  /** The tallest fall to that floor the stack has to climb along any line through it. */
  const dropOf = new Int32Array(cells);
  let frontier: number[] = [];
  for (const k of t.cells) {
    if ((dist[k] as number) >= 0) continue;
    dist[k] = 0;
    floorOf[k] = ground[k] as number;
    frontier.push(k);
  }
  frontier.sort((a, b) => a - b);
  // One column past the deepest band, so the back-face check below can see the
  // hill the last tread stands against.
  for (let d = 1; d <= maxDist + 1 && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const k of frontier) {
      const x = xOf(k);
      const z = zOf(k);
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inBounds(x + dx, z + dz)) continue;
        const m = idxOf(x + dx, z + dz);
        if ((dist[m] as number) >= 0 || !hillside(m)) continue;
        dist[m] = d;
        next.push(m);
      }
    }
    next.sort((a, b) => a - b);
    frontier = next;
  }

  // --- the bands, outward: which columns are cut, and to what --------------------
  const held = new Uint8Array(cells);
  const levelAt = new Int32Array(cells);
  const tierOf = new Int32Array(cells).fill(-1);
  const tierAt = (d: number): number => Math.floor((d - 1) / tread);
  // **Lines meet at corners, and a corner is where the hill climbs.** A
  // column's floor and drop are not one parent's: it stands beside every line
  // in front of it, so it takes the *lowest* floor and the *tallest* drop of
  // its front neighbours — and its own height over that floor, because the
  // hill behind a rim is often taller than the rim (hillside-village's canyon
  // mouth: a rim of 14 with 84 behind it over a floor of 67). Its level is
  // then clamped to a course above every held column in front of it, so two
  // lines a block apart in floor never show a seventh block between their
  // treads. The drop also counts the hill one column *behind*: a line sized
  // for its rim alone leaves the column behind standing a seventh block over
  // the tread, and the back-face check would then throw the whole corner to
  // rock. All of it is min/max over a set: no dependence on walk order.
  for (let d = 1; d <= maxDist; d++) {
    for (let c = 0; c < cells; c++) {
      if ((dist[c] as number) !== d) continue;
      const x = xOf(c);
      const z = zOf(c);
      let floor = Number.POSITIVE_INFINITY;
      let drop = 0;
      let cap = Number.POSITIVE_INFINITY;
      let supported = false;
      /** The hill one column behind: the stack has to climb that too. */
      let behind = Number.NEGATIVE_INFINITY;
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inBounds(x + dx, z + dz)) continue;
        const m = idxOf(x + dx, z + dz);
        if ((dist[m] as number) === d + 1) {
          if ((ground[m] as number) > behind) behind = ground[m] as number;
          continue;
        }
        if ((dist[m] as number) !== d - 1) continue;
        if ((floorOf[m] as number) < floor) floor = floorOf[m] as number;
        if ((dropOf[m] as number) > drop) drop = dropOf[m] as number;
        if (d === 1 || held[m] === 1) {
          supported = true;
          const front = d === 1 ? (ground[m] as number) : (levelAt[m] as number);
          if (front + SEAM_TIER_FACE < cap) cap = front + SEAM_TIER_FACE;
        }
      }
      if (floor === Number.POSITIVE_INFINITY) continue;
      const own = (ground[c] as number) - floor;
      if (own > drop) drop = own;
      if (behind - floor > drop) drop = behind - floor;
      floorOf[c] = floor;
      dropOf[c] = drop;
      if (!supported) continue;
      const n = tierCountOf(drop);
      if (n < 2 || n > SEAM_TIER_MAX) continue;
      const k = tierAt(d);
      // The top course and everything behind it are the hill's own.
      if (k > n - 2) continue;
      const tiers = tiersOf(drop, "revetted");
      if (tiers === "replan") continue;
      let level = floor;
      for (let i = 0; i <= k; i++) level += (tiers[i] as SeamTier).face;
      if (level > cap) level = cap;
      if ((ground[c] as number) < level) continue;
      if (!open(c) || !standsAbove(c, level)) continue;
      held[c] = 1;
      levelAt[c] = level;
      tierOf[c] = k;
    }
  }

  // --- the back-face check, from the back of the stack forward ---------------
  // A held column's back neighbours are either held (at their own tread level)
  // or the hill (at its own ground); neither may stand more than a course's
  // height over this tread. Un-holding a column changes what stands behind the
  // column in front of it, so the pass repeats until nothing moves — bounded,
  // because every repeat un-holds at least one column.
  for (let changed = true; changed; ) {
    changed = false;
    for (let d = maxDist; d >= 1; d--) {
      for (let c = 0; c < cells; c++) {
        if ((dist[c] as number) !== d || held[c] !== 1) continue;
        const x = xOf(c);
        const z = zOf(c);
        let ok = true;
        for (const [dx, dz] of NEIGHBOURS) {
          if (!inBounds(x + dx, z + dz)) continue;
          const m = idxOf(x + dx, z + dz);
          if ((dist[m] as number) !== d + 1) continue;
          const behind = held[m] === 1 ? (levelAt[m] as number) : (ground[m] as number);
          if (behind - (levelAt[c] as number) > SEAM_TIER_FACE) {
            ok = false;
            break;
          }
        }
        if (ok) continue;
        held[c] = 0;
        changed = true;
      }
    }
    if (!changed) break;
    // Support re-carried: a column whose front was un-held has nothing to stand
    // on either.
    for (let d = 2; d <= maxDist; d++) {
      for (let c = 0; c < cells; c++) {
        if ((dist[c] as number) !== d || held[c] !== 1) continue;
        const x = xOf(c);
        const z = zOf(c);
        let supported = false;
        for (const [dx, dz] of NEIGHBOURS) {
          if (!inBounds(x + dx, z + dz)) continue;
          const m = idxOf(x + dx, z + dz);
          if ((dist[m] as number) === d - 1 && held[m] === 1) {
            supported = true;
            break;
          }
        }
        if (!supported) held[c] = 0;
      }
    }
  }

  // --- the claims, one per tier, lowering only ---------------------------------
  for (let k = 0; k < SEAM_TIER_MAX - 1; k++) {
    const columns: GroundClaim[] = [];
    for (let c = 0; c < cells; c++) {
      if (held[c] !== 1 || (tierOf[c] as number) !== k) continue;
      if ((ground[c] as number) <= (levelAt[c] as number)) continue;
      columns.push({ idx: c, y: levelAt[c] as number });
    }
    if (columns.length === 0) continue;
    out.push({
      source: `${source}/${k}`,
      sourceClass: "retaining.skirt" as GroundSourceClass,
      kind: "face",
      columns,
      transition: "wall",
    });
  }
}
