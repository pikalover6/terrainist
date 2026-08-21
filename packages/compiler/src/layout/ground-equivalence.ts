/**
 * **The equivalence shim** — `docs/GROUND-CONTRACT-v0.md` §8.
 *
 * > "the resolver runs, its output is compared against the mutating pipeline's,
 * > and a test asserts they agree. **That equivalence test is the safety net for
 * > the whole rewrite.**"
 *
 * This module is the comparison half. `terrain/compile.ts` snapshots the ground
 * as materialised (the *baseline*), runs the eleven mutating passes exactly as it
 * always has, snapshots the result (the *written* answer), and hands both, plus
 * the shadow declarers' whole intent set and `resolveGround`'s answer, to
 * {@link assertGroundEquivalence}.
 *
 * The one thing worth being pedantic about: **the partition is computed from the
 * declaration set alone** (§8.3), never from the two answers. A partition that
 * could see the answers could be tuned until the test passed, and then it would
 * be measuring nothing. So `levelClaimsByColumn` runs first, the three sets are
 * fixed, and only then is either array read.
 *
 * It lives in `src/` rather than in `test/` for three reasons: the outcome type
 * is what `compileTerrain` hands back, so it has to ship anyway;
 * {@link TOLERATED_INVERSIONS} is §8.5's table, which is spec, not fixture; and
 * WP-3 through WP-6 convert passes one at a time with this function as the gate,
 * so it belongs beside the resolver it guards. Nothing in the production path
 * imports it — `compileTerrain` only references the types.
 */

import type { Region } from "@terrainist/stdlib";

import { levelClaimsByColumn } from "./ground-declarers.js";

import {
  GROUND_TIERS,
  GROUND_SOURCE_CLASSES,
  compareIntent,
  type GroundBaseline,
  type GroundIntent,
  type GroundSourceClass,
  type ResolvedGround,
} from "./ground-contract.js";

/* -------------------------------------------------------------------------- */
/* what the compiler hands over                                               */
/* -------------------------------------------------------------------------- */

/** The three frozen arrays, copied at one instant. */
export interface GroundSnapshot {
  readonly ground: Int32Array;
  readonly fluidTop: Int32Array;
  readonly fluidKind: Uint8Array;
}

/**
 * Everything one compile's shim produced (§8.1).
 *
 * `written` is a *copy* taken at the same instant the resolver was run, not the
 * live `ColumnPlan`: later passes (the authored programs, the scatter, the
 * biomes) go on mutating the plan, and a comparison against a moving array would
 * be attributing their writes to the eleven.
 */
export interface GroundEquivalenceOutcome {
  readonly baseline: GroundBaseline;
  readonly intents: readonly GroundIntent[];
  readonly resolved: ResolvedGround;
  /** The mutating pipeline's answer, after the structure pass. */
  readonly written: GroundSnapshot;
  /**
   * `GroundDriver.finish()` — the last answer of the accumulating prefix (§9a.5).
   *
   * Compared against {@link GroundEquivalenceOutcome.resolved}, which the shim
   * computes for itself over the same intent set. The two must be equal element
   * for element: that is the proof that the incremental prefix-resolve is not a
   * second resolver, and it is the assertion that catches a driver which mutated
   * an intent, dropped one, or exhausted a generator (§9a.1, rule 4).
   */
  readonly driver: ResolvedGround;
  /**
   * v1 §7.3's budget — every `resolveGround` call the driver made.
   *
   * **5** on a settlement path under `GROUND_V1_FREEZE` (one per tier boundary,
   * plus the final resolve); the mixture's twenty-plus with the flag off. Read
   * off the driver *after* `finish()`, which forces the four prefixes, so the
   * number is a property of the stage rather than of which subsystems a
   * particular document happened to instantiate.
   */
  readonly resolves: number;
  /**
   * WP-G1 (ground contract v1 §1.2, §6). The displacement between the plan as
   * built — from the **padded** field — and a second plan materialised from the
   * pure-terrain baseline with every other `buildColumnPlan` input held equal.
   *
   * Measurement only: nothing in the pipeline consumes it, and a world compiles
   * byte-identically whether it is taken or not. Present only when the compile
   * asked for the shim *and* it ran on the settlement path.
   */
  readonly pristine?: GroundPristineMeasurement;
}

/** {@link GroundEquivalenceOutcome.pristine} — WP-G1's four numbers. */
export interface GroundPristineMeasurement {
  /** `|{k : padded[k] !== pristine[k]}|` over the height field. */
  readonly padSetSize: number;
  /** `|{k : plan.ground[k] !== pristinePlan.ground[k]}|`. */
  readonly diffCount: number;
  /**
   * Signed `plan.ground − pristinePlan.ground`, delta → column count, keyed by
   * the decimal delta and ordered numerically.
   */
  readonly histogram: Readonly<Record<string, number>>;
  /**
   * v1 §6/G1's assertion: the plan diff must be a **subset** of the pad set —
   * the converse need not hold, since a sub-block float edit floors to the same
   * integer ground. So this must be empty; a column here is a height authority
   * the audit did not find. Capped at 64 entries, since one is already a bug.
   */
  readonly outsidePadSet: readonly number[];
}

/* -------------------------------------------------------------------------- */
/* §8.5 the tolerated divergences                                              */
/* -------------------------------------------------------------------------- */

/** §8.5's row ids. */
export type InversionId =
  | "I1"
  | "I2"
  | "I3"
  | "I4"
  | "I5"
  | "I6"
  | "I7"
  // The ground contract v1 §6/WP-G3's four rows. Allocated in that document so
  // two concurrent waves cannot pick the same id, exactly as §8's diagnostic
  // codes are.
  | "I8"
  | "I9"
  | "I10"
  | "I11"
  // WP-G4's flip found the one tier-A-over-tier-A pair G3 did not foresee.
  | "I12";

/** One row of §8.5's table. A table, deliberately, and not a predicate. */
export interface ToleratedInversion {
  readonly id: InversionId;
  /** What §4.4 says the row is, in one line, for the failure message. */
  readonly what: string;
  readonly winners: readonly GroundSourceClass[];
  /** The class whose level the mutating pipeline wrote. */
  readonly losers: readonly GroundSourceClass[];
  /** I7: listed because it removes two special cases, and must move nothing. */
  readonly expectZero?: boolean;
  /** I6: the measured size of the defect it fixes. A larger move fails. */
  readonly maxDelta?: number;
}

/** Tiers A–C, as I4 and I5 name them (§4.2's tier column, as data). */
const TIERS_ABC: readonly GroundSourceClass[] = GROUND_SOURCE_CLASSES.filter(
  (c) => GROUND_TIERS[c] === "A" || GROUND_TIERS[c] === "B" || GROUND_TIERS[c] === "C",
);

/** Tiers B–D — everything a tier-A claim outranks. I8, I9 and I10 (v1 §6/G3). */
const TIERS_BCD: readonly GroundSourceClass[] = GROUND_SOURCE_CLASSES.filter(
  (c) => GROUND_TIERS[c] === "B" || GROUND_TIERS[c] === "C" || GROUND_TIERS[c] === "D",
);

/**
 * §8.5, verbatim. Order matters only for attribution: a divergence is credited
 * to the **first** row it matches, and the rows are disjoint enough that the
 * order is the doc's rather than a tie-break — I7's winner (`plaza.ground`)
 * appears in no other row's winner list.
 */
export const TOLERATED_INVERSIONS: readonly ToleratedInversion[] = Object.freeze([
  {
    id: "I1",
    what: "a face beats a street, a sidewalk and a verge",
    winners: Object.freeze(["retaining.seam", "retaining.skirt"] as const),
    losers: Object.freeze(["street.network", "street.sidewalk", "verge"] as const),
  },
  {
    id: "I2",
    what: "a street beats a road",
    winners: Object.freeze(["street.network"] as const),
    losers: Object.freeze(["road.network"] as const),
  },
  {
    id: "I3",
    what: "a street beats a doorstep",
    winners: Object.freeze(["street.network", "street.sidewalk"] as const),
    losers: Object.freeze(["doorstep.landing"] as const),
  },
  {
    id: "I4",
    what: "everything built beats a prop pad",
    winners: TIERS_ABC,
    losers: Object.freeze(["prop.pad"] as const),
  },
  {
    id: "I5",
    what: "verges and banks are last",
    winners: TIERS_ABC,
    losers: Object.freeze(["verge"] as const),
  },
  {
    // WP-3 converted `paveSidewalks`, so the band's level now comes from the
    // flanking carriageway's `ArcLevels` and the pass writes what it declares:
    // there is no self-inversion left to attribute, and the row's count is zero
    // on every world. It stays in the table because the table **is** §8.5 and a
    // row removed to make a world pass is the failure mode §8.5's closing line
    // exists to prevent — and because a divergence of this shape reappearing is
    // a finding, not a tolerance. The `selfWrites` evidence it used to be
    // matched on is gone with it (§9a.5, last paragraph).
    id: "I6",
    what: "the sidewalk stops re-levelling from plan.ground",
    winners: Object.freeze(["street.sidewalk"] as const),
    losers: Object.freeze(["street.sidewalk"] as const),
    maxDelta: 7,
  },
  {
    id: "I7",
    what: "the plaza's immovability becomes a rank",
    winners: Object.freeze(["plaza.ground"] as const),
    losers: Object.freeze(["street.network", "road.network"] as const),
    expectZero: true,
  },
  {
    // v1 §6/G3. The lot pad's footprint half is a real claim now, and a tier-A
    // one. While `GROUND_V1_RANKS` is off it arbitrates at `DEFERRED_PAD_RANK`
    // and this row's count is zero on every world; the row is written with the
    // rows it belongs beside rather than added at the flip, because a row added
    // to make a world pass is §8.5's named failure mode.
    id: "I8",
    what: "a building's footprint beats the dressing laid around it",
    winners: Object.freeze(["building.footprint"] as const),
    losers: TIERS_BCD,
  },
  {
    id: "I9",
    what: "a quarter's plane beats what is laid on it",
    winners: Object.freeze(["quarter.plane"] as const),
    losers: TIERS_BCD,
  },
  {
    // …and the plane's level now comes from `PlaneDatum` rather than from a pad
    // already sitting in the baseline (§1.5's `precinct.ground` row).
    id: "I10",
    what: "a precinct's plane beats what is laid on it, at PlaneDatum's level",
    winners: Object.freeze(["precinct.ground"] as const),
    losers: TIERS_BCD,
  },
  {
    // §4 item 10, as an inversion: `pad.record` is gone, so a column the record
    // used to own is now owned by whatever really claimed it — or by nobody.
    // There is no class left to name on either side, which is why this row
    // carries no winners and no losers and matches nothing: it is the table
    // saying, in the place a reader will look, that the row's subject was
    // deleted rather than forgotten.
    id: "I11",
    what: "pad.record is gone; a pad is its own class now",
    winners: Object.freeze([] as const),
    losers: Object.freeze([] as const),
    expectZero: true,
  },
  {
    /**
     * **v1 §6/WP-G4's flip, and the one pair G3 did not foresee.**
     *
     * I8 and I9 were written at G3 against tiers B–D, because a lot's footprint
     * and the plane it stands on *agreed* on every world measured then: the pad
     * was seated at the platform's own level, so rank 10 over rank 15 decided
     * nothing and no divergence appeared. The flip's plane is not that plane —
     * §1.7's carriageway band is subtracted from it with the rank, and its level
     * is `PlaneDatum`'s — and on `c1-harbourtown` the vista train station's pad
     * sits **three blocks above** the plaza plane its block elected. The
     * footprint wins at 76, the pipeline writes the plane's 73, and the pair
     * `building.footprint` over `quarter.plane` matches no row above.
     *
     * It is an inversion of exactly I8's kind and not a defect in the order: §1.5
     * puts the footprint at rank 10 and the plane at 15 deliberately — "a pad
     * stops being bookkeeping and becomes a claim a street cannot take back" —
     * and the resolver's 76 is the answer a seat is supposed to get. What
     * diverges is *when* it is written: the platform run writes the plane after
     * the pad, and until `GROUND_V1_FREEZE` makes the resolve the write (WP-G6)
     * the pipeline's answer is the later writer's. That is the definition of a
     * tolerated inversion, and it is why this row is a row and not a fix.
     *
     * The count is a golden per world (15 on `c1-harbourtown`, zero everywhere
     * else). It goes to zero at G6 with the rest of the table.
     */
    id: "I12",
    what: "a building's footprint beats the plane it stands on",
    winners: Object.freeze(["building.footprint"] as const),
    losers: Object.freeze(["quarter.plane"] as const),
  },
] as const);

/* -------------------------------------------------------------------------- */
/* the report                                                                  */
/* -------------------------------------------------------------------------- */

/** Per-inversion divergence counts — the golden a later WP has to restate. */
export type InversionCounts = Readonly<Record<InversionId, number>>;

/** What one world's comparison found (§8.3). */
export interface GroundEquivalenceReport {
  readonly columns: number;
  /** §8.3's three sets, sized. */
  readonly unclaimed: number;
  readonly clean: number;
  readonly conflict: number;
  /**
   * **The declaration gaps.** A column no level claim names whose written level
   * is not the materialised one: a pass wrote ground it did not declare, which
   * is a hole in §3's inventory and the assertion most likely to fail first.
   */
  readonly gaps: number;
  /** CLEAN columns where the resolver and the pipeline disagree, unexplained. */
  readonly cleanMismatches: number;
  /**
   * CLEAN columns whose disagreement **is** a named inversion.
   *
   * §8.3 puts every divergence in `CONFLICT`, and for six of §8.5's seven rows
   * that holds: they are two subsystems wanting one column. I6 is not — it is one
   * subsystem winning its own column at a level it did not write — so an I6
   * column with no second claimant partitions as `CLEAN` while diverging. These
   * are counted here and in {@link GroundEquivalenceReport.byInversion}; they are
   * attributed on the same per-column evidence and held to the same 7-block cap,
   * never waved through.
   */
  readonly cleanDivergences: number;
  /**
   * CONFLICT columns whose *water* the two answers disagree about — a different
   * `fluidKind`, or a wet surface at a different height. Never an inversion: §8.5
   * has no row for a fluid, and §1.3's freeze is what makes that safe to say.
   */
  readonly fluidMismatches: number;
  /** CONFLICT columns where the resolver did not pick the rank-minimal claim. */
  readonly precedenceMismatches: number;
  /** CONFLICT columns where the two answers differ. */
  readonly divergences: number;
  /** Divergences per §8.5 row. The golden. */
  readonly byInversion: InversionCounts;
  /** Divergences no row explains. Any at all is a failure. */
  readonly unattributable: number;
  /** Worst |resolved − written| over I6's self-divergences. Caps at 7. */
  readonly maxSidewalkDelta: number;
  /**
   * Columns where `driver.finish()` and the shim's own one-shot resolve differ
   * (§9a.5). **Zero is contract, on every world and at every work package**: the
   * driver calls `resolveGround` on the whole accumulated array every time and
   * never patches incrementally, so its last answer *is* the one-shot resolve.
   */
  readonly driverMismatches: number;
  /**
   * Every failed assertion, one readable line each, in column order and capped
   * per category so a broken world produces a report rather than a core dump.
   * **The test asserts this is empty**; the function returns rather than throws
   * so the counts above survive a failure and can be read beside it.
   */
  readonly failures: readonly string[];
}

/** `FluidKind.NONE`, without importing the terrain module for one constant. */
const FLUID_NONE = 0;

/**
 * Do the two answers agree about this column's water?
 *
 * Not an array comparison, because `fluidTop` carries no information on a dry
 * column: `ColumnPlan` defines it as "the topmost fluid block, **or `ground`
 * when the column has no fluid**", so on a dry column that diverged in *ground*
 * the two `fluidTop`s differ by exactly the ground's difference and say nothing
 * of their own. Comparing them raw would report every I6 column twice — once as
 * the inversion it is, once as a fluid defect it is not. So: the kinds must
 * match; a wet column's surface must match outright; a dry column's must follow
 * its own side's ground, which is the invariant actually worth asserting.
 */
function fluidAgrees(resolved: GroundSnapshot, written: GroundSnapshot, k: number): boolean {
  const kind = resolved.fluidKind[k] as number;
  if (kind !== (written.fluidKind[k] as number)) return false;
  if (kind !== FLUID_NONE) return (resolved.fluidTop[k] as number) === (written.fluidTop[k] as number);
  return (
    (resolved.fluidTop[k] as number) === (resolved.ground[k] as number) &&
    (written.fluidTop[k] as number) === (written.ground[k] as number)
  );
}

/** How many messages of one kind are worth printing before the count says it. */
const MAX_MESSAGES = 12;

/** How far a gap's message looks for a claim to name. Chebyshev rings. */
const NEAREST_CLAIM_RADIUS = 96;

/**
 * Compare the resolver's ground against the mutating pipeline's (§8.3).
 *
 * Returns the three-way partition's sizes, the per-inversion divergence counts,
 * and one line per failed assertion. It never throws: a caller that finds
 * `failures` non-empty has both the messages and the counts, and on a hill world
 * the counts are most of the diagnosis.
 */
export function assertGroundEquivalence(
  outcome: GroundEquivalenceOutcome,
): GroundEquivalenceReport {
  const { baseline, intents, resolved, written, driver } = outcome;
  const region = baseline.region;
  const n = baseline.ground.length;

  const claims = levelClaimsByColumn(intents);

  // The rank-minimal level claim per column, and the classes claiming each
  // level there — both from the declaration set, both before an answer is read.
  const { minimal, classesByColumnLevel, sourceOfColumn } = indexClaims(intents);

  const at = (k: number): string =>
    `${region.x0 + (k % region.width)},${region.z0 + Math.floor(k / region.width)}`;

  const failures: string[] = [];
  const counted = new Map<string, number>();
  /** Push a message, capped per category; the category's count is exact. */
  const fail = (category: string, message: string): void => {
    const seen = (counted.get(category) ?? 0) + 1;
    counted.set(category, seen);
    if (seen <= MAX_MESSAGES) failures.push(message);
    else if (seen === MAX_MESSAGES + 1) failures.push(`…and more ${category}`);
  };

  /**
   * The §8.5 row that explains one divergence, or `undefined`.
   *
   * A row is a pair of *classes*, matched against the claim that asked for the
   * level the pipeline wrote. §8.5's one self-row (I6) used to be matched instead
   * against the winning pass's own record of what it wrote, because on a
   * self-inversion no claim carries that level; WP-3 converted the sidewalk, so
   * the pass writes what it declares and there is no such column left. A
   * divergence of that shape now falls through to `unattributable`, which is the
   * right answer: the evidence for tolerating it is gone with the defect.
   */
  const attribute = (
    winnerClass: GroundSourceClass,
    losers: readonly GroundSourceClass[] | undefined,
  ): ToleratedInversion | undefined =>
    TOLERATED_INVERSIONS.find(
      (r) =>
        r.winners.includes(winnerClass) &&
        losers !== undefined &&
        losers.some((c) => r.losers.includes(c)),
    );

  /** Bank one attributed divergence, and hold it to the row's delta cap. */
  const credit = (row: ToleratedInversion, k: number, delta: number): void => {
    byInversion[row.id] += 1;
    if (row.id === "I6" && delta > maxSidewalkDelta) maxSidewalkDelta = delta;
    if (row.maxDelta !== undefined && delta > row.maxDelta) {
      fail(
        `${row.id} deltas past ${row.maxDelta}`,
        `${row.id} (${row.what}) moved ${at(k)} by ${delta} blocks, past the measured ` +
          `${row.maxDelta} — "the sidewalk moved" must not quietly become "the sidewalk moved a lot"`,
      );
    }
  };

  let unclaimed = 0;
  let clean = 0;
  let conflict = 0;
  let gaps = 0;
  let cleanMismatches = 0;
  let cleanDivergences = 0;
  let fluidMismatches = 0;
  let precedenceMismatches = 0;
  let divergences = 0;
  let unattributable = 0;
  let maxSidewalkDelta = 0;
  let driverMismatches = 0;
  const byInversion: Record<InversionId, number> = {
    I1: 0,
    I2: 0,
    I3: 0,
    I4: 0,
    I5: 0,
    I6: 0,
    I7: 0,
    I8: 0,
    I9: 0,
    I10: 0,
    I11: 0,
    I12: 0,
  };

  for (let k = 0; k < n; k++) {
    const levels = claims.get(k);

    // ---- UNCLAIMED ---------------------------------------------------------
    if (levels === undefined) {
      unclaimed += 1;
      if ((resolved.ground[k] as number) !== (baseline.ground[k] as number)) {
        fail(
          "resolver moves on unclaimed columns",
          `resolver moved unclaimed column ${at(k)}: baseline y=${baseline.ground[k]}, ` +
            `resolved y=${resolved.ground[k]} — the resolver may only move a column something claimed`,
        );
      }
      if ((written.ground[k] as number) !== (baseline.ground[k] as number)) {
        gaps += 1;
        fail(
          "declaration gaps",
          `declaration gap at ${at(k)}: the pipeline wrote y=${written.ground[k]} over a ` +
            `materialised y=${baseline.ground[k]} and no claim names this column ` +
            `(nearest claim: ${nearestClaim(region, sourceOfColumn, k, at)}) — ` +
            "a pass writes ground it does not declare; §3's inventory has a hole",
        );
      } else if (
        // Only when the ground held: a dry column's `fluidTop` follows its
        // ground, so a moved column would otherwise be reported twice.
        (written.fluidTop[k] as number) !== (baseline.fluidTop[k] as number) ||
        (written.fluidKind[k] as number) !== (baseline.fluidKind[k] as number)
      ) {
        gaps += 1;
        fail(
          "declaration gaps",
          `declaration gap at ${at(k)}: the pipeline wrote fluid ` +
            `(top ${baseline.fluidTop[k]}→${written.fluidTop[k]}, ` +
            `kind ${baseline.fluidKind[k]}→${written.fluidKind[k]}) and no claim names this column ` +
            `(nearest claim: ${nearestClaim(region, sourceOfColumn, k, at)})`,
        );
      }
      continue;
    }

    // ---- CLEAN -------------------------------------------------------------
    if (levels.size === 1) {
      clean += 1;
      const declared = [...levels][0] as number;
      const sameGround = (resolved.ground[k] as number) === (written.ground[k] as number);
      if (sameGround && fluidAgrees(resolved, written, k)) continue;
      // An I6 column with a single claimant used to land here rather than in
      // CONFLICT and was credited to the self-row (`cleanDivergences`). WP-3
      // converted the sidewalk, so the pass writes what it declares and there is
      // nothing left of that shape; `cleanDivergences` stays at zero and a CLEAN
      // column the two answers disagree about is a declarer bug, always.
      cleanMismatches += 1;
      fail(
        "clean mismatches",
        `clean mismatch at ${at(k)}: \`${sourceOfColumn.get(k) ?? "?"}\` declared y=${declared}; ` +
          `resolver wrote (${resolved.ground[k]}, fluid ${resolved.fluidTop[k]}/${resolved.fluidKind[k]}) ` +
          `and the pipeline wrote (${written.ground[k]}, fluid ${written.fluidTop[k]}/${written.fluidKind[k]}) ` +
          "— the pass wrote a level different from the one it declared",
      );
      continue;
    }

    // ---- CONFLICT ----------------------------------------------------------
    conflict += 1;
    const win = minimal.get(k) as { intent: number; y: number };
    const winner = intents[win.intent] as GroundIntent;
    if ((resolved.ground[k] as number) !== win.y) {
      precedenceMismatches += 1;
      fail(
        "precedence mismatches",
        `precedence mismatch at ${at(k)}: the rank-minimal claim is \`${winner.source}\` ` +
          `(${winner.sourceClass}) at y=${win.y}, and the resolver wrote y=${resolved.ground[k]}`,
      );
      continue;
    }
    if (!fluidAgrees(resolved, written, k)) {
      fluidMismatches += 1;
      fail(
        "fluid mismatches",
        `fluid mismatch at ${at(k)}: \`${winner.source}\` (${winner.sourceClass}) won; resolver ` +
          `wrote fluid ${resolved.fluidTop[k]}/${resolved.fluidKind[k]} over ground ` +
          `${resolved.ground[k]} and the pipeline wrote ${written.fluidTop[k]}/${written.fluidKind[k]} ` +
          `over ground ${written.ground[k]} — no §8.5 row inverts a fluid`,
      );
    }
    if ((resolved.ground[k] as number) === (written.ground[k] as number)) continue;

    divergences += 1;
    const losers = classesByColumnLevel.get(k)?.get(written.ground[k] as number);
    const row = attribute(winner.sourceClass, losers);
    if (row === undefined) {
      unattributable += 1;
      fail(
        "unattributable divergences",
        `unattributable divergence at ${at(k)}: \`${winner.source}\` (${winner.sourceClass}) won ` +
          `at y=${resolved.ground[k]} and the pipeline wrote y=${written.ground[k]}, ` +
          (losers === undefined
            ? "which no claim on this column asked for"
            : `asked for by ${losers.map((c) => `\`${c}\``).join(" / ")} — ` +
              "no row of §8.5 covers that pair"),
      );
      continue;
    }
    credit(row, k, Math.abs((resolved.ground[k] as number) - (written.ground[k] as number)));
  }

  // §9a.5's new assertion: `driver.finish()` **is** the one-shot resolve. The
  // shim computed `resolved` itself, over `driver.intents`; if the accumulating
  // prefix were a second resolver — an intent mutated, one dropped, a generator
  // exhausted after the first of a dozen resolves — this is where it shows.
  for (let k = 0; k < n; k++) {
    if (
      (driver.ground[k] as number) === (resolved.ground[k] as number) &&
      (driver.fluidTop[k] as number) === (resolved.fluidTop[k] as number) &&
      (driver.fluidKind[k] as number) === (resolved.fluidKind[k] as number)
    ) {
      continue;
    }
    driverMismatches += 1;
    fail(
      "driver mismatches",
      `driver mismatch at ${at(k)}: the accumulating prefix finished at ` +
        `(${driver.ground[k]}, fluid ${driver.fluidTop[k]}/${driver.fluidKind[k]}) and the ` +
        `one-shot resolve over the same intents says ` +
        `(${resolved.ground[k]}, fluid ${resolved.fluidTop[k]}/${resolved.fluidKind[k]}) — ` +
        "the driver is not a second resolver, and §9a.1 rule 4 is the usual cause",
    );
  }

  for (const row of TOLERATED_INVERSIONS) {
    if (row.expectZero === true && byInversion[row.id] > 0) {
      fail(
        `${row.id} divergences`,
        `${row.id} (${row.what}) is expected to move no column on any world and moved ` +
          `${byInversion[row.id]} — a tolerated divergence with an expected count is how the ` +
          "table stops being a rubber stamp",
      );
    }
  }

  return {
    columns: n,
    unclaimed,
    clean,
    conflict,
    gaps,
    cleanMismatches,
    cleanDivergences,
    fluidMismatches,
    precedenceMismatches,
    divergences,
    byInversion,
    unattributable,
    maxSidewalkDelta,
    driverMismatches,
    failures,
  };
}

/* -------------------------------------------------------------------------- */
/* the declaration-side indexes                                                */
/* -------------------------------------------------------------------------- */

interface ClaimIndex {
  /** The `compareIntent`-minimal level claim on each claimed column. */
  readonly minimal: Map<number, { intent: number; y: number }>;
  /** column → level → the classes that asked for it, in rank order. */
  readonly classesByColumnLevel: Map<number, Map<number, GroundSourceClass[]>>;
  /** column → the rank-minimal claim's source, for a message to name. */
  readonly sourceOfColumn: Map<number, string>;
}

/**
 * Everything §8.3 needs from the declaration set, in one walk over it in
 * `compareIntent` order — so "the minimal claim" is simply the first one seen,
 * by the same comparator the resolver used and with the same tie-break on the
 * declaration index.
 */
function indexClaims(intents: readonly GroundIntent[]): ClaimIndex {
  const order = intents
    .map((_, j) => j)
    .sort((a, b) => {
      const c = compareIntent(intents[a] as GroundIntent, intents[b] as GroundIntent);
      return c !== 0 ? c : a - b;
    });

  const minimal = new Map<number, { intent: number; y: number }>();
  const classesByColumnLevel = new Map<number, Map<number, GroundSourceClass[]>>();
  const sourceOfColumn = new Map<number, string>();

  for (const j of order) {
    const intent = intents[j] as GroundIntent;
    if (intent.kind !== "platform" && intent.kind !== "profile" && intent.kind !== "face") {
      continue;
    }
    for (const claim of intent.columns) {
      if (!minimal.has(claim.idx)) {
        minimal.set(claim.idx, { intent: j, y: claim.y });
        sourceOfColumn.set(claim.idx, intent.source);
      }
      let byLevel = classesByColumnLevel.get(claim.idx);
      if (byLevel === undefined) {
        byLevel = new Map<number, GroundSourceClass[]>();
        classesByColumnLevel.set(claim.idx, byLevel);
      }
      const classes = byLevel.get(claim.y);
      if (classes === undefined) byLevel.set(claim.y, [intent.sourceClass]);
      else if (!classes.includes(intent.sourceClass)) classes.push(intent.sourceClass);
    }
  }

  return { minimal, classesByColumnLevel, sourceOfColumn };
}

/**
 * The nearest claimed column's source, for a gap's message.
 *
 * A declaration gap is only findable if the message says *which* pass was
 * nearby: "column 41,-7 moved and nobody declared it" sends a reader through
 * eleven files, and "…nearest claim `world.town.high_street#carriageway` at
 * 39,-7" sends them to one.
 */
function nearestClaim(
  region: Region,
  sourceOfColumn: Map<number, string>,
  k: number,
  at: (k: number) => string,
): string {
  const x = k % region.width;
  const z = Math.floor(k / region.width);
  for (let r = 1; r <= NEAREST_CLAIM_RADIUS; r++) {
    for (let dz = -r; dz <= r; dz++) {
      const zz = z + dz;
      if (zz < 0 || zz >= region.depth) continue;
      const edge = Math.abs(dz) === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r) {
        const xx = x + dx;
        if (xx < 0 || xx >= region.width) continue;
        const source = sourceOfColumn.get(zz * region.width + xx);
        if (source !== undefined) return `\`${source}\` at ${at(zz * region.width + xx)}`;
      }
    }
  }
  return `none within ${NEAREST_CLAIM_RADIUS} columns`;
}
