/**
 * **The mixture-period driver** —
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
 * and the last one is `resolveGround` over the final set — the same call and the
 * same arguments, which is what makes the staged driver deterministic and
 * catches a driver which mutated an intent, dropped one, or exhausted a
 * generator.
 *
 * WP-6 deletes `commit`'s write-through and `record` entirely, and keeps the
 * accumulate-and-resolve half: that is the per-tier machinery §1.4 and §13.7 ask
 * for, and it would have to be built anyway.
 *
 * ---
 *
 * **WP-G6 built that staged machinery**.
 * This object is v1's `GroundStage`: `commit` and `record` accumulate and
 * write nothing, {@link GroundDriver.view} is the typed prefix view of §1.4,
 * {@link GroundDriver.enterTier} seals one prefix resolve per tier boundary, and
 * {@link GroundDriver.freeze} is pass 5c.
 *
 * **Every declarer is across the WP-G5 seam** as of G6a and §7.1: the
 * infra-entry water works and sweeps, the doorstep walk, and — last of all —
 * the authored programs' siting and their `prop.pad` claims, which G6-r4 moved
 * to pass 5b″ (`declarePrograms`). The tier-order assertion in
 * {@link AccumulatingDriver.absorb} is what found each of them in turn, and it
 * found them by throwing: a silently non-prefix prefix is the one failure this
 * whole construction exists to make impossible, so it is the one failure that
 * is loud.
 */

import type { ColumnPlan } from "../terrain/columns.js";

import {
  GROUND_TIERS,
  type ReadonlyUint8Array,
  type GroundBaseline,
  type GroundClaim,
  type GroundIntent,
  type GroundTier,
  type GroundView,
  type ResolvedGround,
} from "./ground-contract.js";
import { resolveGround } from "./ground-resolver.js";

/**
 * The five tiers as an index, so "strictly above" is `<` (v1 §1.4).
 *
 * A is 0 and E is 4, which is the same direction the ranks ascend in — the
 * property §1.4's first bullet rests on ("rank order and tier order ascend
 * together"), written down once so the prefix arithmetic below cannot invert it.
 */
const TIER_ORDER: readonly GroundTier[] = Object.freeze(["A", "B", "C", "D", "E"] as const);

/** 0…4 for A…E. */
export function tierIndex(tier: GroundTier): number {
  const at = TIER_ORDER.indexOf(tier);
  /* c8 ignore next */
  if (at < 0) throw new Error(`unknown ground tier ${tier}`);
  return at;
}

/** The one thing that writes a level during the mixture (§9a.1). */
export interface GroundDriver {
  /** The materialised ground the whole resolve is against. Never changes. */
  readonly baseline: GroundBaseline;
  /** Every intent contributed so far, in pipeline order. */
  readonly intents: readonly GroundIntent[];
  /**
   * How many full `resolveGround` calls this driver has made — v1 §7.3's budget,
   * reported as `stats.ground.resolves`. Exactly 5 on a settlement path under
   * the freeze; the mixture's twenty-plus before it.
   */
  readonly resolves: number;

  /**
   * **True when this driver is the compile's ground stage** — the one §1.6
   * governs, with a pass 5c in it. False for a {@link driverForPlan} driver,
   * which is one pass's private accumulator and keeps v0's write-through.
   *
   * Read by the build half wherever "has the seal happened?" decides behaviour,
   * so that question is answered by *the stage in hand* rather than by a global
   * that is right for the pipeline and wrong for everybody else.
   */
  readonly staged: boolean;

  /** An unconverted pass's shadow declaration. Accumulates; writes nothing. */
  record(intents: readonly GroundIntent[]): void;
  /**
   * **A builder's built-set** (§3.3), for the resolve that generates.
   *
   * Called once, by the retaining pass's declaring half, with the served-seam
   * mask it publishes. The generator inside the fifth resolve must skip exactly
   * the runs `finishSeams` will skip, and the mask is the only evidence of that
   * either of them has — see {@link ResolveOptions.built}.
   *
   * **Copied on receipt**, and that is not defensive tidiness: `retaining.seam`
   * is also a *sink* — `buildDerivedSeams` sets a bit for every column of
   * masonry it lays in the building half — so a mask held by reference would
   * mean the fifth resolve and the equivalence shim's re-resolve of the same
   * intents were computed against two different built-sets. Measured, on the
   * first attempt: troy's `written vs resolved` went 0 → 862 with 772 of the
   * mismatches on `verge` columns, which are precisely the generator's own
   * ramp rings deciding differently the second time.
   */
  reportBuilt(mask: ReadonlyUint8Array): void;
  /** The built-set {@link reportBuilt} was given, for the equivalence shim. */
  readonly built: ReadonlyUint8Array | undefined;
  /** A converted pass's claims. Accumulates, resolves, and writes them through. */
  commit(intents: readonly GroundIntent[]): void;
  /**
   * **The one legal read** — v1 §1.4, generalised.
   *
   * > `view(n)` returns, per column: the resolved level where a claim in a tier
   * > strictly above *n* owns it, and the pristine baseline level otherwise.
   *
   * Since the freeze that is exactly what comes back: the
   * memoised prefix resolve over tiers `A…n−1`, which is the final resolve
   * restricted to the columns that prefix owns (the resolver is first-writer-wins
   * in rank order, and rank order ascends with tier order), and the baseline
   * everywhere else. There is no third case.
   *
   * With the flag off this is v0 §9a.4's view — the plan's three arrays at the
   * pass's own pipeline position — and `tier` is ignored, which is what keeps
   * the off state byte-identical while the call sites migrate.
   *
   * `tier` is optional for the callers that are not the settlement pipeline: a
   * `driverForPlan` test driver has no prefix, so its answer is the baseline
   * either way.
   */
  view(tier?: GroundTier): GroundView;
  /**
   * The stage moves on to `tier` (§1.6): seal every prefix up to it, and answer
   * a tier-less {@link view} there from now on. A no-op with the flag off.
   */
  enterTier(tier: GroundTier): void;
  /**
   * **Pass 5c, the freeze.** The fifth resolve, with its three arrays written
   * over `plan.ground`/`.fluidTop`/`.fluidKind` and v0 §1.3's snow rule applied
   * over `moved`. Idempotent-by-memo through {@link finish}; with the flag off it
   * is `finish()` and nothing else.
   */
  freeze(): ResolvedGround;
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
  return new AccumulatingDriver(baseline, plan, true);
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
 *
 * **Detached, and therefore not frozen** — see {@link AccumulatingDriver.staged}.
 * This driver has no pass 5c, because there is no pipeline to put one in, so it
 * keeps v0's write-through: its one pass declares, the resolver arbitrates, and
 * the answer goes into the plan before the call returns. That is the same
 * ground contract, applied to a one-pass compile; what it is *not* is the
 * five-tier stage, and the freeze governs the stage.
 */
export function driverForPlan(plan: ColumnPlan): GroundDriver {
  return new AccumulatingDriver(
    {
      region: plan.region,
      ground: Int32Array.from(plan.ground),
      fluidTop: Int32Array.from(plan.fluidTop),
      fluidKind: Uint8Array.from(plan.fluidKind),
      seaLevel: plan.seaLevel,
    },
    plan,
    false,
  );
}

/**
 * **A plan at one tier's prefix** — v1 §1.4's view, in the shape the passes
 * that were never converted still ask for.
 *
 * A converted pass takes a {@link GroundView} and reads `view.ground`. A pass
 * the contract governs but has not typed — the authored-program siting, whose
 * `planProgramSites`, `conformSeatPlane` and `nodeLocalHeight` all reach into a
 * `ColumnPlan` — takes the plan itself, and under the freeze the plan's arrays
 * are the *baseline* until pass 5c writes them. Handing such a pass `plan`
 * would have it site against ground three tiers out of date; handing it this
 * alias hands it exactly what §1.4 entitles it to.
 *
 * Everything but the three arrays is the plan's own object, live and shared:
 * `surface`, `subsurface`, `snow` and `occupancy` are material, not level, and
 * the contract has nothing to say about them.
 *
 * The one cast in the ground stage, and it is here so it is in one place: a
 * `GroundView` hands its arrays out `readonly` precisely so a holder cannot
 * write through its own read, and a `ColumnPlan` field is a mutable
 * `Int32Array`. The alias is handed only to the **declaring** half of a pass,
 * which writes no level by construction — that is what "declaring half" means —
 * and §10's typed `ColumnPlan.ground` is what removes the cast for good.
 */
export function planAt(plan: ColumnPlan, view: GroundView): ColumnPlan {
  return {
    ...plan,
    ground: view.ground as Int32Array,
    fluidTop: view.fluidTop as Int32Array,
    fluidKind: view.fluidKind as Uint8Array,
  };
}

/**
 * A resolve's three arrays as a {@link GroundView} — §1.4's two cases in one
 * object.
 *
 * The resolver already writes the baseline into every column no intent won
 * (`resolveGround` starts from a copy of the baseline), so "the resolved level
 * where a higher tier owns it, the baseline otherwise" needs no second pass and
 * no owner test here: it is what the arrays hold.
 */
function viewOf(resolved: ResolvedGround, baseline: GroundBaseline): GroundView {
  // {@link GroundView.held}: the prefix's decisions, as a mask. Read by the
  // road pass under `ROUTE_PINS_HELD_GROUND`; computed unconditionally because
  // it is one pass over `owner` and a view is built once per tier.
  const held = new Uint8Array(resolved.owner.length);
  for (let k = 0; k < held.length; k++) if (resolved.owner[k] !== -1) held[k] = 1;
  return {
    region: baseline.region,
    ground: resolved.ground,
    fluidTop: resolved.fluidTop,
    fluidKind: resolved.fluidKind,
    seaLevel: baseline.seaLevel,
    held,
  };
}

class AccumulatingDriver implements GroundDriver {
  readonly baseline: GroundBaseline;
  private readonly plan: ColumnPlan;
  /**
   * **Is this driver the compile's ground stage?** — the scope of the freeze,
   * made explicit.
   *
   * §1.6 governs *one* object: the single `GroundDriver` `terrain/compile.ts`
   * threads through pass 5b, seals at 5c and hands to 5e. Everything the freeze
   * deletes — the write-through, the tier-order assertion, the tier-less
   * `view()`'s prefix answer — is deleted *because that stage has a 5c*: the
   * plan becomes the fifth resolve there, so nothing needs to write it earlier.
   *
   * A {@link driverForPlan} driver has no 5c. It is made inside a pass, for a
   * caller that runs that pass alone (a unit test, an exhibit, the
   * `input.ground ?? driverForPlan(plan)` fallback in nine passes), and it dies
   * when the call returns. Reading the global flag there was the flip's one
   * scope error: those callers kept declaring and stopped being written to, so a
   * canal dug no water, a bank raised no ground and a dam impounded nothing —
   * silently, because a `commit` that writes nothing throws nothing. Measured at
   * the flip: 46 tests across 21 files, every one of them green flag-off.
   *
   * So a detached driver keeps v0's mixture semantics, which is exactly what
   * such a caller had at G5 and exactly what its assertions were pinned against.
   * The pipeline is untouched: `StructureInput.ground` is mandatory, so no
   * production path ever reaches the fallback.
   */
  readonly staged: boolean;
  private readonly accumulated: GroundIntent[] = [];
  /** Memoised only for {@link finish}; a `commit` invalidates it. */
  private final: ResolvedGround | undefined;
  private readonly handed: GroundView;
  /** v1 §7.3's counter — every `resolveGround` call this driver has made. */
  resolves = 0;
  /**
   * The prefix resolves of §1.6, memoised by tier index: `prefix[i]` is
   * `resolveGround(baseline, intents in tiers strictly above TIER_ORDER[i])`,
   * i.e. the answer `view(TIER_ORDER[i])` hands out. `prefix[0]` is the empty
   * prefix and is the baseline itself, which costs no resolve.
   */
  private readonly prefixes: (GroundView | undefined)[] = [];
  /**
   * The highest tier any `view` has been taken at. Declaration runs in tier
   * order (§1.6), so an intent arriving in a tier a prefix has already been
   * sealed over would silently invalidate that prefix — the one way to get a
   * "prefix" that is not a prefix, which is the assertion §6/WP-G6 names.
   */
  private sealedThrough = -1;
  /** Which tier the stage is declaring — the default a tier-less `view()` takes. */
  private currentTier = 0;
  /** True once {@link freeze} has aliased the plan onto the fifth resolve. */
  private frozen = false;
  /** §3.3's built-set, or `undefined` until a builder publishes one. */
  built: ReadonlyUint8Array | undefined;

  constructor(baseline: GroundBaseline, plan: ColumnPlan, staged: boolean) {
    this.baseline = baseline;
    this.plan = plan;
    this.staged = staged;
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

  reportBuilt(mask: ReadonlyUint8Array): void {
    this.built = Uint8Array.from(mask);
  }

  commit(intents: readonly GroundIntent[]): void {
    const start = this.accumulated.length;
    this.absorb(intents);
    if (this.accumulated.length === start) return;
    // §1.6: "`record()` and `commit()`'s write-through are deleted — nothing
    // writes `plan.ground` any more, so nothing needs to." Under the freeze both
    // methods are pure accumulation and the two names survive only so the flag's
    // off state can keep the mixture's behaviour at every call site.
    if (this.staged) return;
    // §9a.1 rule 3 — the whole prefix, re-resolved. Never incrementally patched:
    // that is what makes every intermediate answer the contract applied to a
    // prefix rather than an approximation of the contract.
    const resolved = this.resolve(this.accumulated);
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
  view(tier?: GroundTier): GroundView {
    if (!this.staged) return this.handed;
    // Past the freeze the plan's three arrays *are* the fifth resolve's arrays
    // (§1.6 pass 5c), so a build-half reader asking for "the ground" gets the
    // ground. Before it, a caller that named no tier is answered at
    // `currentTier` — which, today, is always the first tier: `enterTier` has
    // no caller, so the stage never advances and a bare pre-freeze `view()`
    // is the baseline, not "its own pass's legal prefix" as this once claimed
    // (the Stocktake Run's census, class 2.1, 2026-08-25). Calling `enterTier`
    // at each tier is the M-sized half of the declare/build migration.
    if (tier === undefined) return this.frozen ? this.handed : this.prefixFor(this.currentTier);
    return this.prefixFor(tierIndex(tier));
  }

  /**
   * §1.6's prefix resolve for one tier, memoised.
   *
   * `i === 0` is tier A, whose prefix is empty: §1.4's "the pristine baseline
   * level otherwise" with no owned columns at all, which is the baseline and
   * costs no resolve. Every other index is one `resolveGround` over the intents
   * in tiers strictly above it — which, because the resolver is
   * first-writer-wins in rank order and rank order ascends with tier order, is
   * the final resolve restricted to the columns that prefix owns.
   */
  private prefixFor(i: number): GroundView {
    const cached = this.prefixes[i];
    if (cached !== undefined) return cached;
    if (i > this.sealedThrough) this.sealedThrough = i;
    if (i === 0) {
      const base = this.baselineView();
      this.prefixes[0] = base;
      return base;
    }
    const prefix = this.accumulated.filter((it) => tierIndex(GROUND_TIERS[it.sourceClass]) < i);
    const answer = viewOf(this.resolve(prefix), this.baseline);
    this.prefixes[i] = answer;
    return answer;
  }

  enterTier(tier: GroundTier): void {
    const at = tierIndex(tier);
    /* c8 ignore next */
    if (at < this.currentTier) throw new Error(`ground stage: tier ${tier} declared out of order`);
    this.currentTier = at;
    // Seal every tier up to and including this one, so the resolve happens at
    // the boundary rather than at whichever pass happens to read first. §1.6's
    // "one resolve after each tier" is this line.
    if (this.staged) this.prefixFor(at);
  }

  freeze(): ResolvedGround {
    const resolved = this.finish();
    if (!this.staged) return resolved;
    // §1.6 pass 5c. Copied in rather than re-pointed: a dozen passes captured
    // `plan.ground` by reference on their way past, and the contract's promise
    // is that from here on those references hold the resolver's answer — which
    // a copy delivers and a reassignment would silently not.
    this.plan.ground.set(resolved.ground);
    this.plan.fluidTop.set(resolved.fluidTop);
    this.plan.fluidKind.set(resolved.fluidKind);
    // §2's `plan.snow` row and v0 §1.3's rule, landed at last: the eleven
    // `plan.snow[idx] = 0` lines become one moved-mask sweep, because there is
    // no longer a mixture in which that rule is wrong.
    for (let k = 0; k < resolved.moved.length; k++) {
      if (resolved.moved[k] === 1) this.plan.snow[k] = 0;
    }
    this.frozen = true;
    return resolved;
  }

  private baselineView(): GroundView {
    return {
      region: this.baseline.region,
      ground: this.baseline.ground,
      fluidTop: this.baseline.fluidTop,
      fluidKind: this.baseline.fluidKind,
      seaLevel: this.baseline.seaLevel,
    };
  }

  private resolve(intents: readonly GroundIntent[], generate = false): ResolvedGround {
    this.resolves++;
    return resolveGround(this.baseline, intents, {
      generate,
      ...(this.built === undefined ? {} : { built: this.built }),
    });
  }

  finish(): ResolvedGround {
    if (this.final !== undefined) return this.final;
    // §1.6: "five resolves; the fifth is `resolveGround(baseline, all)`." The
    // four before it are the prefixes, and they are forced here rather than left
    // to whichever passes happened to ask for a view — so the count the report
    // carries is a property of the design (one resolve per tier boundary) and
    // not of which subsystems a particular document happened to instantiate.
    if (this.staged) for (let i = 1; i < TIER_ORDER.length; i++) this.prefixFor(i);
    // §3.3's G6 amendment: the fifth resolve is the one that generates. The four
    // prefixes above never do — see {@link ResolveOptions.generate}.
    this.final = this.resolve(this.accumulated, this.staged);
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
      // §1.6's ordering invariant, asserted where it can be violated rather than
      // trusted: a claim arriving in a tier some prefix has already been sealed
      // over is exactly "a prefix resolve that is not a prefix", and it would
      // show up a hundred passes later as a claim that stopped winning.
      if (this.staged && this.sealedThrough >= 0) {
        const at = tierIndex(GROUND_TIERS[intent.sourceClass]);
        if (at < this.sealedThrough) {
          throw new Error(
            `ground stage: ${intent.sourceClass} (tier ${GROUND_TIERS[intent.sourceClass]}) declared after tier ${TIER_ORDER[this.sealedThrough] as string} was read — declaration must run in tier order (v1 §1.6)`,
          );
        }
      }
      const columns: readonly GroundClaim[] = Object.freeze([...intent.columns]);
      this.accumulated.push({ ...intent, columns });
    }
  }
}
