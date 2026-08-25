/**
 * **The transition generator — `docs/GROUND-CONTRACT-v1.md` §3.3's G6 amendment.**
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
import type { DerivedSeam } from "./ground-resolver.js";
import {
  MIN_RETAIN_RUN,
  SEAM_TIER_MAX,
  bankRun,
  blendedBankFall,
  seamDressing,
  tierCountOf,
  tiersOf,
  type SeamTier,
} from "./levels.js";

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
  /** `gradeBank`'s and `buildTieredSeam`'s `open()`, off the owner map. */
  const open = (k: number): boolean => {
    if ((fluidKind[k] as number) !== FluidKind.NONE) return false;
    const c = classOf(k);
    return c === null || !BLOCKING_CLASSES.has(c);
  };
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
  for (const [job, t] of transitions.entries()) {
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
    if (t.refined === "bank") {
      const easedRun = t.blendRun;
      if (easedRun === 0 && t.availableRun < bankRun(t.drop) && t.side === "fill") {
        // §3.3's refusal column: S5 re-dresses the stack `revetted`, which always
        // fits, and only a stack that finds no ground at all is refused.
        if (tierCountOf(t.drop) <= SEAM_TIER_MAX) {
          pushTiers(out, `${source}/tier`, t, above, "revetted", input, open, standsAbove);
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
      const ownedLow = (owner[t.cells[0] as number] as number) !== -1;
      if (ownedLow && tierCountOf(t.drop) === 1) {
        pushTiers(out, `${source}/tier`, t, above, "revetted", input, open, standsAbove);
      }
      continue;
    }

    const dressing = seamDressing(t.pressedShare, t.availableRun, tierCountOf(t.drop));
    pushTiers(out, `${source}/tier`, t, above, dressing, input, open, standsAbove);
  }
  return out;
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
    for (const k of t.cells) if ((built[k] as number) === 1) served++;
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
      if ((owner[m] as number) !== t.above) continue;
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
  let frontier: number[] = [];
  for (const k of t.cells) {
    if (seen[k] === 1) continue;
    seen[k] = 1;
    frontier.push(k);
  }
  frontier.sort((a, b) => a - b);
  const columns: GroundClaim[] = [];
  for (let ring = 0; ring < steps && frontier.length > 0; ring++) {
    const target = eased
      ? top - blendedBankFall(ring + 1, drop, steps)
      : top - Math.ceil((ring + 1) / APRON_RUN_PER_BLOCK);
    if (target <= floor) break;
    const next: number[] = [];
    for (const k of frontier) {
      if (open(k) && target > (ground[k] as number)) columns.push({ idx: k, y: target });
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      for (const [dx, dz] of NEIGHBOURS) {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < region.x0 || zz < region.z0) continue;
        if (xx >= region.x0 + region.width || zz >= region.z0 + region.depth) continue;
        const m = (zz - region.z0) * region.width + (xx - region.x0);
        if (seen[m] === 1) continue;
        // Only outward, into the ground below. The platform above is already there.
        if (hill[m] === 1) continue;
        seen[m] = 1;
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
