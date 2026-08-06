/**
 * **The mixture-period driver** — `docs/GROUND-CONTRACT-v0.md` §9a.
 *
 * §9 step 2 says a converted pass "computes a level and yields a `GroundClaim`".
 * Between WP-2 and WP-6 there is nowhere for that claim to go: the declaration
 * set is not complete until the last pass has run, so a single end-of-pipeline
 * `resolveGround` cannot be what puts a converted pass's level in the plan — and
 * the plan is where an unconverted downstream pass will look for it, at its own
 * pipeline position, because that is the only place it has ever looked. Eleven
 * passes converted in three parallel work packages means that for most of the
 * rewrite roughly half the pipeline declares and half still writes, and **the
 * half that still writes must not be able to tell the difference**.
 *
 * This module is that mechanism, and nothing else. It is one object with four
 * methods:
 *
 * - `record` — an unconverted pass's shadow declaration. Accumulates; writes
 *   nothing. The pass has already written by hand.
 * - `commit` — a converted pass's claims. Accumulates, re-resolves the **whole**
 *   accumulated prefix, and writes that answer back over the columns of *its own*
 *   intents.
 * - `view` — the one legal read (§1.4), as it stands at this pipeline position.
 * - `finish` — the final `ResolvedGround`, which §6 and §7 are fed from.
 *
 * **The driver is not a second resolver.** `resolveGround` is called on the whole
 * accumulated array every time and never incrementally patched, so every
 * intermediate answer is literally `resolveGround` over a prefix of the final set
 * and the last one is `resolveGround` over the final set — the same call, the
 * same arguments and the same result the equivalence shim computes for itself.
 * `test/ground-equivalence.test.ts` asserts exactly that, element for element,
 * and it is the assertion that catches a driver which mutated an intent, dropped
 * one, or exhausted a generator.
 *
 * WP-6 deletes `commit`'s write-through and `record` entirely, and keeps the
 * accumulate-and-resolve half: that is the per-tier machinery §1.4 and §13.7 ask
 * for, and it would have to be built anyway.
 */

import type { ColumnPlan } from "../terrain/columns.js";

import type {
  GroundBaseline,
  GroundClaim,
  GroundIntent,
  GroundView,
  ResolvedGround,
} from "./ground-contract.js";
import { resolveGround } from "./ground-resolver.js";

/** The one thing that writes a level during the mixture (§9a.1). */
export interface GroundDriver {
  /** The materialised ground the whole resolve is against. Never changes. */
  readonly baseline: GroundBaseline;
  /** Every intent contributed so far, in pipeline order. */
  readonly intents: readonly GroundIntent[];

  /** An unconverted pass's shadow declaration. Accumulates; writes nothing. */
  record(intents: readonly GroundIntent[]): void;
  /** A converted pass's claims. Accumulates, resolves, and writes them through. */
  commit(intents: readonly GroundIntent[]): void;
  /** The one legal read (§1.4), as it stands at this pipeline position. */
  view(): GroundView;
  /** After the last pass: the final `ResolvedGround`, its report, its diagnostics. */
  finish(): ResolvedGround;
}

/**
 * The driver for one compile, over one plan.
 *
 * `baseline` must be the three arrays as materialised — the copy
 * `terrain/compile.ts` takes immediately after `buildColumnPlan`, before the
 * first structure pass touches one. Handing in a later snapshot would make every
 * resolve answer a different question from the one the contract asks.
 */
export function createGroundDriver(baseline: GroundBaseline, plan: ColumnPlan): GroundDriver {
  return new AccumulatingDriver(baseline, plan);
}

/**
 * A driver for a pass dressed on its own, with the plan as it stands as its
 * baseline.
 *
 * The world pipeline threads **one** driver through every pass (`buildStructures`
 * requires it), which is the whole point of §9a: one accumulator, in one order.
 * This exists for the callers that are not the pipeline — the unit tests that
 * surface a street graph on a bare `ColumnPlan`, and nothing else. Such a caller
 * has no earlier passes to arbitrate against, so "the plan as it stands" *is* the
 * materialised ground for the one pass it runs, and the answer is the same one it
 * would get from a pipeline driver with an empty prefix.
 */
export function driverForPlan(plan: ColumnPlan): GroundDriver {
  return createGroundDriver(
    {
      region: plan.region,
      ground: Int32Array.from(plan.ground),
      fluidTop: Int32Array.from(plan.fluidTop),
      fluidKind: Uint8Array.from(plan.fluidKind),
      seaLevel: plan.seaLevel,
    },
    plan,
  );
}

class AccumulatingDriver implements GroundDriver {
  readonly baseline: GroundBaseline;
  private readonly plan: ColumnPlan;
  private readonly accumulated: GroundIntent[] = [];
  /** Memoised only for {@link finish}; a `commit` invalidates it. */
  private final: ResolvedGround | undefined;
  private readonly handed: GroundView;

  constructor(baseline: GroundBaseline, plan: ColumnPlan) {
    this.baseline = baseline;
    this.plan = plan;
    // One object, handed out from every `view()`: the arrays are the plan's own,
    // live, so a pass that holds the view across a commit sees the plan at *its*
    // position rather than a stale copy. The `readonly` typing is what stops it
    // writing through the read.
    this.handed = {
      region: plan.region,
      ground: plan.ground,
      fluidTop: plan.fluidTop,
      fluidKind: plan.fluidKind,
      seaLevel: plan.seaLevel,
    };
  }

  get intents(): readonly GroundIntent[] {
    return this.accumulated;
  }

  record(intents: readonly GroundIntent[]): void {
    this.absorb(intents);
  }

  commit(intents: readonly GroundIntent[]): void {
    const start = this.accumulated.length;
    this.absorb(intents);
    if (this.accumulated.length === start) return;
    // §9a.1 rule 3 — the whole prefix, re-resolved. Never incrementally patched:
    // that is what makes every intermediate answer the contract applied to a
    // prefix rather than an approximation of the contract.
    const resolved = resolveGround(this.baseline, this.accumulated);
    this.final = undefined;

    // §9a.1 rule 2 — the union of *this commit's* own columns, every kind,
    // ascending. `clearance` and `preserve` columns are in it deliberately: a
    // clearance recorded after a level claim was already written must still clamp
    // it, and the commit that declares the clearance is the only one that will
    // revisit the column.
    const touched = new Set<number>();
    for (let j = start; j < this.accumulated.length; j++) {
      for (const claim of (this.accumulated[j] as GroundIntent).columns) touched.add(claim.idx);
    }

    for (const k of [...touched].sort((a, b) => a - b)) {
      const owner = resolved.owner[k] as number;
      // Nobody won it — a column named only by a `clearance` — so it is not ours,
      // and writing the resolver's answer (the baseline) would erase an
      // unconverted pass's work.
      if (owner === -1) continue;
      this.plan.ground[k] = resolved.ground[k] as number;
      this.plan.fluidTop[k] = resolved.fluidTop[k] as number;
      this.plan.fluidKind[k] = resolved.fluidKind[k] as number;
      // §9a.6's snow rule: bit-for-bit the eleven `plan.snow[idx] = 0` lines, and
      // deliberately **not** §1.3's `moved`-mask superset — which on a flat snowy
      // world clears nothing and leaves a snow layer on fresh pavement. A claimed
      // column this commit lost still ends snowless, because its winner clears it.
      if (owner >= start) this.plan.snow[k] = 0;
    }
  }

  /**
   * §9a.1's cost rule is "at most one resolve per `commit`, and one per `view()`
   * that follows a `record`". This does **none**, and satisfies the bound the
   * only way that is sound: §9a.4 defines the view as *the plan's three arrays*,
   * and `record` — by its own definition, "accumulates; writes nothing" — cannot
   * change them. There is nothing for a resolve to bring the view up to date
   * with. The moment `view()` stops being the plan (WP-6's tier mask, §9a.7) that
   * stops being true and the lazy resolve has to appear here.
   */
  view(): GroundView {
    return this.handed;
  }

  finish(): ResolvedGround {
    if (this.final === undefined) this.final = resolveGround(this.baseline, this.accumulated);
    return this.final;
  }

  /**
   * §9a.1 rule 4 — materialise each intent's `columns` into a frozen array on
   * receipt.
   *
   * §5.7.3 lets a declarer generate `columns` lazily because the resolver
   * consumes them exactly once; the driver calls the resolver a dozen times over
   * the same array, so a generator is exhausted after the first. This is the
   * single most likely way to get the driver subtly wrong: a lazily-declared
   * intent silently contributes nothing from the second resolve on, which reads
   * as "my pass's claims stopped winning halfway down the pipeline".
   */
  private absorb(intents: readonly GroundIntent[]): void {
    for (const intent of intents) {
      const columns: readonly GroundClaim[] = Object.freeze([...intent.columns]);
      this.accumulated.push({ ...intent, columns });
    }
  }
}
