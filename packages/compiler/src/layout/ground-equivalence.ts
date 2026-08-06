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

import { levelClaimsByColumn } from "../structures/ground-declare.js";

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
  /** What each self-inverting pass wrote, per column. See {@link SelfWrites}. */
  readonly selfWrites: readonly SelfWrites[];
}

/**
 * A pass that under the contract wins its own columns **at a different level**
 * than it wrote — §8.5's I6, the one row whose winner and loser are one class.
 *
 * The declaration set alone cannot attribute such a divergence: the declarer
 * declares the contract level and nothing declares the written one, so §8.3's
 * "the claim whose level equals `plan.ground[k]`" finds either nothing or, worse,
 * an unrelated claim that happens to sit at the old number. This carries the
 * pass's own record of what it wrote, so a self-inversion is attributed on
 * per-column evidence rather than by elimination.
 */
export interface SelfWrites {
  readonly sourceClass: GroundSourceClass;
  /** Column → the level the pass actually wrote there. */
  readonly wrote: ReadonlyMap<number, number>;
}

/* -------------------------------------------------------------------------- */
/* §8.5 the tolerated divergences                                              */
/* -------------------------------------------------------------------------- */

/** §8.5's row ids. */
export type InversionId = "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7";

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
  const { baseline, intents, resolved, written, selfWrites } = outcome;
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

  /** Is this row §8.5's one self-row — winner and loser the same class? */
  const isSelfRow = (r: ToleratedInversion): boolean =>
    r.winners.length === 1 && r.losers.length === 1 && r.winners[0] === r.losers[0];

  /**
   * The §8.5 row that explains one divergence, or `undefined`.
   *
   * Two shapes, and the difference is §8.5's own: an ordinary row is a pair of
   * *classes*, matched against the claim that asked for the level the pipeline
   * wrote; the self-row is matched against the winning pass's own record of what
   * it wrote there, because on a self-inversion no claim carries that level.
   */
  const attribute = (
    k: number,
    winnerClass: GroundSourceClass,
    writtenY: number,
    losers: readonly GroundSourceClass[] | undefined,
  ): ToleratedInversion | undefined =>
    TOLERATED_INVERSIONS.find((r) => {
      if (!r.winners.includes(winnerClass)) return false;
      if (isSelfRow(r)) {
        const own = selfWrites.find((s) => s.sourceClass === winnerClass);
        return own !== undefined && own.wrote.get(k) === writtenY;
      }
      return losers !== undefined && losers.some((c) => r.losers.includes(c));
    });

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
  const byInversion: Record<InversionId, number> = {
    I1: 0,
    I2: 0,
    I3: 0,
    I4: 0,
    I5: 0,
    I6: 0,
    I7: 0,
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
      // A self-inversion with no second claimant lands here rather than in
      // CONFLICT (see `cleanDivergences`). Only the ground can be inverted: a
      // fluid the two answers genuinely disagree about is a mismatch, always —
      // §8.5 has no row for one.
      const owner = minimal.get(k) as { intent: number; y: number };
      const winner = intents[owner.intent] as GroundIntent;
      const row = fluidAgrees(resolved, written, k)
        ? attribute(k, winner.sourceClass, written.ground[k] as number, undefined)
        : undefined;
      if (row !== undefined) {
        divergences += 1;
        cleanDivergences += 1;
        credit(row, k, Math.abs((resolved.ground[k] as number) - (written.ground[k] as number)));
        continue;
      }
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
    const row = attribute(k, winner.sourceClass, written.ground[k] as number, losers);
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
