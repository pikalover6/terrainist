/**
 * The ground contract's resolver — `docs/GROUND-CONTRACT-v0.md` §5.
 *
 * **Nothing may modify the ground after the ground is decided.** Eleven passes
 * write `plan.ground` after materialisation today, each reading whatever the
 * previous ones left, with no arbitration beyond array-write order. This module
 * is the arbitration: one pure function that takes the materialised baseline and
 * the whole declaration set and returns the ground, the transitions between its
 * platforms, a report of who got what, and the diagnostics for everything that
 * had to give way.
 *
 * The algorithm is §5.2's pseudocode in its **interleaved form** (§5.2's closing
 * paragraph, normative): the level claims and the guards are ingested in one walk
 * over `compareIntent` order, so a `preserve` at rank *r* is installed before any
 * level claim at a rank past *r* is seen. That is what lets `GROUND_CONFLICT`
 * fire during ingestion rather than in a deferred second pass, and it is what
 * makes a guard's own rank mean something: a `preserve` cannot protect a column
 * against a *higher*-ranked claim, and must not pretend to.
 *
 * Three properties are load-bearing and each is asserted in
 * `test/ground-resolver.test.ts`:
 *
 * 1. **Agreement is not conflict** (§5.3). A losing claim that proposes the
 *    winner's exact level is `satisfied`, silently. This is what makes flat
 *    worlds byte-identical through the rewrite.
 * 2. **Transitions are derived, never declared** (§5.6), grouped **8-connected**
 *    because a contour on a lattice is a staircase — grouping the same 2,495
 *    seam columns 4-connected gave 1,010 components of which 714 were one or two
 *    columns long, and the pass then built a stub of wall at each.
 * 3. **Iteration order is never observable** (§5.7). `columns` is an `Iterable`,
 *    so a declarer may hand over a generator, an array or a `Set`; every internal
 *    grouping sorts on region index and intent index before it is walked.
 */

import { error, note, warning, type LoamDiagnostic } from "@terrainist/spec";
import type { Region } from "@terrainist/stdlib";

import { WORLD_MIN_Y } from "../emit/prismarine.js";
import { FluidKind, WORLD_MAX_Y } from "../terrain/columns.js";

import {
  INTENT_RANK,
  compareIntent,
  type GroundBaseline,
  type GroundClaim,
  type GroundClaimRow,
  type GroundIntent,
  type GroundReport,
  type GroundSourceClass,
  type GroundTransition,
  type GroundTransitionKind,
  type ReadonlyInt32Array,
  type ReadonlyUint8Array,
  type ResolvedGround,
} from "./ground-contract.js";
import {
  EDGE_PRESSED_SHARE,
  MIN_RETAIN_RUN,
  RETAIN_MAX,
  WALL_DEMAND_RANGE,
  bankRun,
  blendedBankRun,
  treatmentForDrop,
  treatmentForEdge,
  treatmentForSeam,
  type EdgeContext,
  type EdgeUse,
  type SeamTreatment,
} from "./levels.js";

/** The four-neighbourhood a boundary column is found in (§5.6 step 1). */
const EDGE_NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * The eight-neighbourhood a boundary run is *grouped* in (§5.6 step 3).
 *
 * Not optional, and not the same neighbourhood as {@link EDGE_NEIGHBOURS}: a
 * seam *column* is found 4-connected (that is the definition of a face), but the
 * run those columns form is a contour, and along a 45° boundary consecutive
 * lower-side columns are diagonal neighbours and never edge neighbours. This is
 * the third appearance of that lesson; the first two were both found by walking.
 */
const RUN_NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** `SeamTreatment` → the contract's vocabulary (§5.6's mapping table). */
const TREATMENT_KIND: Readonly<Record<string, GroundTransitionKind>> = Object.freeze({
  kerb: "step",
  retaining: "wall",
  bank: "ramp",
  built: "none",
});

/** One substitution row, before it is deduplicated and sorted. */
interface Substitution {
  readonly source: string;
  readonly requested: string;
  readonly built: string;
  readonly why: "MIN_RETAIN_RUN" | "RETAIN_MAX" | "faced" | "none-side";
}

/**
 * Reconcile a whole declaration set into one ground (§5.1).
 *
 * A **pure function**: it reads nothing but its arguments, writes nothing but its
 * return value, allocates region-sized typed arrays sized from `baseline.region`,
 * and calls no clock and no unseeded RNG. Same inputs → identical outputs, byte
 * for byte, including the diagnostic list and the report row order.
 */
export function resolveGround(
  baseline: GroundBaseline,
  intents: readonly GroundIntent[],
): ResolvedGround {
  const { region } = baseline;
  const width = region.width;
  const depth = region.depth;
  const n = width * depth;

  const ground = Int32Array.from(baseline.ground);
  const fluidTop = Int32Array.from(baseline.fluidTop);
  const fluidKind = Uint8Array.from(baseline.fluidKind);
  const owner = new Int32Array(n).fill(-1);
  const ceiling = new Int32Array(n).fill(WORLD_MAX_Y);
  const ceilingSource = new Int32Array(n).fill(-1);
  const guarded = new Int32Array(n).fill(-1);
  const isFace = new Uint8Array(n);

  const diagnostics: LoamDiagnostic[] = [];
  const conflicts: {
    guard: string;
    loser: string;
    x: number;
    z: number;
    guardY: number;
    askedY: number;
  }[] = [];
  const rows: GroundClaimRow[] = [];

  const xOf = (idx: number): number => region.x0 + (idx % width);
  const zOf = (idx: number): number => region.z0 + Math.floor(idx / width);
  const at = (idx: number): string => `${xOf(idx)},${zOf(idx)}`;

  const invariant = (source: string, message: string, fix: string): void => {
    diagnostics.push(error("GROUND_INVARIANT", source, `ground invariant: ${message}`, fix));
  };

  // The one ordering the algorithm is allowed to depend on (§4.1, §5.7).
  const order = intents.map((_, j) => j).sort((a, b) => {
    const c = compareIntent(intents[a] as GroundIntent, intents[b] as GroundIntent);
    return c !== 0 ? c : a - b;
  });

  // §4.5 — ties do not exist by construction, and the resolver asserts it rather
  // than trusting the construction. Two intents from the same source in the same
  // class is a declarer bug.
  for (let i = 1; i < order.length; i++) {
    const a = intents[order[i - 1] as number] as GroundIntent;
    const b = intents[order[i] as number] as GroundIntent;
    if (compareIntent(a, b) === 0) {
      invariant(
        b.source,
        `\`${a.source}\` and \`${b.source}\` compare equal in class ` +
          `\`${b.sourceClass}\` — the precedence order is not total over them`,
        "Declare the two claims under distinct sources " +
          "(`<nodePath>#carriageway`, `<nodePath>#verge`), or give them distinct `subRank`s.",
      );
    }
  }

  /**
   * Walk an intent's columns exactly once (§5.7.3), rejecting a column the same
   * intent names twice. Returns `null` for a duplicate, which the caller skips.
   */
  const seenPerIntent = (intent: GroundIntent): ((c: GroundClaim) => boolean) => {
    const seen = new Set<number>();
    return (c: GroundClaim): boolean => {
      if (c.idx < 0 || c.idx >= n) {
        invariant(
          intent.source,
          `\`${intent.source}\` declares column index ${c.idx}, outside the ` +
            `region's 0..${n - 1}`,
          "Compute the column index as `(z - region.z0) * region.width + (x - region.x0)` " +
            "and drop claims outside the region before declaring.",
        );
        return false;
      }
      if (seen.has(c.idx)) {
        invariant(
          intent.source,
          `\`${intent.source}\` declares column ${at(c.idx)} twice`,
          "Deduplicate the claim's columns before declaring; one intent names each column once.",
        );
        return false;
      }
      seen.add(c.idx);
      return true;
    };
  };

  // --- pass 1: the ceilings, before any level is chosen ----------------------
  // Composed by minimum over every clearance on the column, **regardless of
  // rank** (§5.5.2): a ceiling is a statement about physical room, and the
  // lowest one is the true one.
  for (const j of order) {
    const intent = intents[j] as GroundIntent;
    if (intent.kind !== "clearance") continue;
    const fresh = seenPerIntent(intent);
    for (const c of intent.columns) {
      if (!fresh(c)) continue;
      if (!(c.y > WORLD_MIN_Y && c.y <= WORLD_MAX_Y)) {
        invariant(
          intent.source,
          `\`${intent.source}\` declares a clearance at y=${c.y} at ${at(c.idx)}, ` +
            `outside ${WORLD_MIN_Y + 1}..${WORLD_MAX_Y}`,
          "Clamp the clearance to the world's build range before declaring it.",
        );
        continue;
      }
      if (c.y < (ceiling[c.idx] as number)) {
        ceiling[c.idx] = c.y;
        ceilingSource[c.idx] = j;
      }
    }
  }

  // --- pass 2 + 3, interleaved: the level claims and the guards --------------
  for (const j of order) {
    const intent = intents[j] as GroundIntent;

    if (intent.kind === "preserve") {
      const fresh = seenPerIntent(intent);
      for (const c of intent.columns) {
        if (!fresh(c)) continue;
        const held = owner[c.idx] as number;
        if (held === -1 || (intents[held] as GroundIntent).source !== intent.source) {
          const holder = held === -1 ? "the baseline" : `\`${(intents[held] as GroundIntent).source}\``;
          invariant(
            intent.source,
            `\`${intent.source}\` preserves column ${at(c.idx)}, which it does not own — ` +
              `${holder} holds it`,
            "Declare `preserve` only over columns the same source's level claim won; " +
              "a guard is declared alongside the claim it protects, over a subset of its columns.",
          );
          continue;
        }
        guarded[c.idx] = j;
      }
      continue;
    }

    if (intent.kind !== "platform" && intent.kind !== "profile" && intent.kind !== "face") {
      continue; // clearance — already ingested in pass 1.
    }

    let declared = 0;
    let satisfied = 0;
    let adjusted = 0;
    let refused = 0;
    let maxDelta = 0;
    const refusedTo = new Map<string, number>();
    const fresh = seenPerIntent(intent);

    for (const c of intent.columns) {
      if (!fresh(c)) continue;

      // §1.3's invariants, each violation exactly one LOAM-E494. A violating
      // column is not counted at all, so `satisfied + adjusted + refused ===
      // declared` stays an arithmetic identity rather than a near-miss.
      if (!(c.y > WORLD_MIN_Y && c.y <= WORLD_MAX_Y)) {
        invariant(
          intent.source,
          `\`${intent.source}\` declares y=${c.y} at ${at(c.idx)}, outside the world's ` +
            `${WORLD_MIN_Y + 1}..${WORLD_MAX_Y}`,
          "Clamp the declared level to the world's build range before declaring it.",
        );
        continue;
      }
      if (c.fluid !== undefined && c.fluid.top < c.y) {
        invariant(
          intent.source,
          `\`${intent.source}\` declares fluidTop=${c.fluid.top} below ground=${c.y} at ${at(c.idx)}`,
          "A fluid surface is at or above the column's ground; declare `fluid.top >= y`.",
        );
        continue;
      }

      declared += 1;

      const held = owner[c.idx] as number;
      if (held !== -1) {
        // Someone above already decided this column.
        if (c.y === (ground[c.idx] as number)) {
          satisfied += 1; // agreement, not conflict (§5.3)
          continue;
        }
        refused += 1;
        const winner = (intents[held] as GroundIntent).source;
        refusedTo.set(winner, (refusedTo.get(winner) ?? 0) + 1);
        const delta = Math.abs(c.y - (ground[c.idx] as number));
        if (delta > maxDelta) maxDelta = delta;
        const guard = guarded[c.idx] as number;
        if (guard !== -1) {
          const guardSource = (intents[guard] as GroundIntent).source;
          const guardY = ground[c.idx] as number;
          conflicts.push({
            guard: guardSource,
            loser: intent.source,
            x: xOf(c.idx),
            z: zOf(c.idx),
            guardY,
            askedY: c.y,
          });
          diagnostics.push(
            warning(
              "GROUND_CONFLICT",
              intent.source,
              `ground conflict at ${at(c.idx)}: \`${guardSource}\` holds this column at ` +
                `y=${guardY} and \`${intent.source}\` asked for y=${c.y} (${delta} blocks)`,
              `Move \`${intent.source}\` off this column, or raise its precedence class ` +
                `above \`${guardSource}\`'s if it really is the more important level.`,
            ),
          );
        }
        continue;
      }

      let y = c.y;
      const cap = ceiling[c.idx] as number;
      if (y > cap) {
        // Clamped, never refused (§5.5.3): a clamped column is walkable and
        // audible; a refused one is a hole.
        const capper = ceilingSource[c.idx] as number;
        const capSource = capper === -1 ? "a clearance" : `\`${(intents[capper] as GroundIntent).source}\``;
        diagnostics.push(
          warning(
            "GROUND_CLEARANCE_VIOLATED",
            intent.source,
            `ground clearance at ${at(c.idx)}: ${capSource} requires nothing above y=${cap} ` +
              `and \`${intent.source}\` asked for y=${y}; clamped to ${cap}`,
            `Lower \`${intent.source}\`'s level here, or move it out from under ${capSource}.`,
          ),
        );
        y = cap;
        adjusted += 1;
      } else {
        satisfied += 1;
      }
      owner[c.idx] = j;
      ground[c.idx] = y;
      fluidTop[c.idx] = c.fluid !== undefined ? c.fluid.top : y;
      fluidKind[c.idx] = c.fluid !== undefined ? c.fluid.kind : FluidKind.NONE;
      if (intent.kind === "face") isFace[c.idx] = 1;
    }

    // Winner source → columns taken, by count desc then source (§7).
    const attributed = [...refusedTo.entries()].sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    );

    if (refused > 0) {
      // Aggregated per claim, **never per column** (§6): a hill town would
      // otherwise produce thousands, and a note that fires on every world is a
      // report nobody reads.
      const top = attributed[0] as [string, number];
      diagnostics.push(
        note(
          "GROUND_CLAIM_ADJUSTED",
          intent.source,
          `ground: \`${intent.source}\` declared ${declared} columns and got ` +
            `${satisfied + adjusted}; ${top[1]} went to \`${top[0]}\` ` +
            `(worst difference ${maxDelta} blocks)`,
          "Nothing, if the precedence is right; otherwise move the claim or change its class.",
        ),
      );
    }

    const minColumns = intent.minColumns ?? 1;
    if (satisfied + adjusted < minColumns) {
      const rest =
        attributed.length > 0 ? `; the rest went to \`${(attributed[0] as [string, number])[0]}\`` : "";
      diagnostics.push(
        warning(
          "GROUND_CLAIM_REFUSED",
          intent.source,
          `ground: \`${intent.source}\` needed ${minColumns} columns and kept ` +
            `${satisfied + adjusted}${rest}`,
          `Move \`${intent.source}\` somewhere it is not contested, or lower its ` +
            "`minColumns` if a partial run is still worth building.",
        ),
      );
    }

    rows.push({
      source: intent.source,
      sourceClass: intent.sourceClass,
      kind: intent.kind,
      rank: INTENT_RANK[intent.sourceClass],
      declared,
      satisfied,
      adjusted,
      refused,
      refusedTo: Object.fromEntries(attributed),
      maxDelta,
    });
  }

  // --- pass 4: the transitions ----------------------------------------------
  const substitutions: Substitution[] = [];
  const transitions = deriveTransitions(
    { width, depth, ground, owner, isFace, intents },
    substitutions,
  );

  // --- pass 5: the derived masks --------------------------------------------
  const moved = new Uint8Array(n);
  const wet = new Uint8Array(n);
  let movedCount = 0;
  let claimed = 0;
  for (let k = 0; k < n; k++) {
    if ((ground[k] as number) !== (baseline.ground[k] as number)) {
      moved[k] = 1;
      movedCount += 1;
    }
    if ((fluidKind[k] as number) !== FluidKind.NONE) wet[k] = 1;
    if ((owner[k] as number) !== -1) claimed += 1;
  }

  const counts = { ramp: 0, step: 0, wall: 0 };
  for (const t of transitions) {
    const kind = TREATMENT_KIND[t.treatment] as GroundTransitionKind;
    if (kind === "ramp") counts.ramp += 1;
    else if (kind === "step") counts.step += 1;
    else if (kind === "wall") counts.wall += 1;
  }

  const substituted = dedupeSubstitutions(substitutions);
  if (transitions.length > 0 || substituted.length > 0) {
    const tail =
      substituted.length === 0
        ? ""
        : `; ${substituted.length} request${substituted.length === 1 ? "" : "s"} substituted (` +
          substituted.map((s) => `${s.requested}→${s.built} under ${s.why}`).join(", ") +
          ")";
    diagnostics.push(
      note(
        "GROUND_TRANSITION",
        "",
        `ground transitions: ${counts.wall} walls, ${counts.step} steps, ${counts.ramp} ramps${tail}`,
        "Nothing — the drop and the run decide the treatment, not the request.",
      ),
    );
  }

  const report: GroundReport = {
    columns: n,
    claimed,
    moved: movedCount,
    claims: rows,
    transitions: { ...counts, substituted },
    conflicts,
  };

  return {
    ground,
    fluidTop,
    fluidKind,
    moved,
    wet,
    owner,
    transitions,
    report,
    diagnostics,
  };
}

/* -------------------------------------------------------------------------- */
/* 5.6 transition generation                                                   */
/* -------------------------------------------------------------------------- */

interface TransitionInput {
  readonly width: number;
  readonly depth: number;
  readonly ground: Int32Array;
  readonly owner: Int32Array;
  readonly isFace: Uint8Array;
  readonly intents: readonly GroundIntent[];
}

/**
 * Every boundary run between two winners at different levels (§5.6).
 *
 * Derived, never declared, for the reason `levels.ts` already states about
 * seams: "a form that declared its own seams could get one wrong, and a wrong
 * seam is a cliff through a town".
 */
function deriveTransitions(input: TransitionInput, substitutions: Substitution[]): GroundTransition[] {
  const { intents } = input;
  const sourceOf = sourceReader(intents);
  const requestOf = requestReader(intents);

  const components = groupBoundaryRuns(input, substitutions);

  const out: GroundTransition[] = [];
  for (const { above, below: belowOwner, cells: component, drop } of components) {
    const treatment = treatmentForSeam(drop, component.length);
    const built = TREATMENT_KIND[treatment] as GroundTransitionKind;
    const requested = { above: requestOf(above), below: requestOf(belowOwner) };
    for (const [side, req] of [
      [above, requested.above],
      [belowOwner, requested.below],
    ] as const) {
      if (req === built) continue;
      // Only §2.5's two named causes are recorded. A request the drop table
      // simply disagrees with at kerb scale is not a *substitution*, it is the
      // table being authoritative, and `why`'s closed union has no word for it.
      if (drop > RETAIN_MAX) {
        substitutions.push({ source: sourceOf(side), requested: req, built, why: "RETAIN_MAX" });
      } else if (treatmentForDrop(drop) === "retaining" && component.length < MIN_RETAIN_RUN) {
        substitutions.push({ source: sourceOf(side), requested: req, built, why: "MIN_RETAIN_RUN" });
      }
    }
    out.push({
      above,
      below: belowOwner,
      aboveSource: sourceOf(above),
      belowSource: sourceOf(belowOwner),
      cells: component,
      drop,
      treatment,
      requested,
    });
  }

  // 5: row-major by first cell, then by the owner pair, so the list is a pure
  // function of the field.
  out.sort(byFirstCellThenPair);
  return out;
}

/** The winning claim's source on one side of a boundary, or `"baseline"`. */
function sourceReader(intents: readonly GroundIntent[]): (o: number) => string {
  return (o: number): string => (o === -1 ? "baseline" : (intents[o] as GroundIntent).source);
}

/**
 * What one side of a boundary asked for.
 *
 * The baseline asked for nothing, so it is read as `"ramp"`: unclaimed ground
 * grades out to whatever meets it, which is what `blendShoulders` does today.
 * Reading it as `"none"` would suppress every platform-against-natural-ground
 * transition in the world, which is the opposite of what the field says.
 */
function requestReader(
  intents: readonly GroundIntent[],
): (o: number) => GroundTransitionKind {
  return (o: number): GroundTransitionKind =>
    o === -1 ? "ramp" : (intents[o] as GroundIntent).transition;
}

/** Row-major by first cell, then by the owner pair (§5.6 step 5). */
function byFirstCellThenPair(
  a: { readonly above: number; readonly below: number; readonly cells: readonly number[] },
  b: { readonly above: number; readonly below: number; readonly cells: readonly number[] },
): number {
  const ac = a.cells[0] as number;
  const bc = b.cells[0] as number;
  if (ac !== bc) return ac - bc;
  if (a.above !== b.above) return a.above - b.above;
  return a.below - b.below;
}

/** One 8-connected boundary run, before any treatment table has been asked. */
interface BoundaryRun {
  readonly above: number;
  readonly below: number;
  readonly cells: number[];
  readonly drop: number;
}

/**
 * §5.6 steps 1–4: every lower-side boundary column, grouped 8-connected within
 * its owner pair.
 *
 * **The one home for the grouping** — `docs/GROUND-CONTRACT-v1.md` §3.1 requires
 * that `deriveTransitions` be "unchanged in algorithm … verbatim, never
 * reimplemented", and the v1 refinements are a second *reading* of the same
 * runs, not a second enumeration of them. Both {@link deriveTransitions} and
 * {@link deriveGroundSeams} call this and differ only in what they ask of each
 * run afterwards.
 *
 * `substitutions` is `null` for a caller that is only measuring: the faced and
 * none-side rows belong to the resolver's own report and must not be recorded
 * twice.
 */
function groupBoundaryRuns(
  input: TransitionInput,
  substitutions: Substitution[] | null,
): BoundaryRun[] {
  const { width, depth, ground, owner, isFace, intents } = input;
  const span = intents.length + 2; // owners are −1..intents.length−1

  const sourceOf = sourceReader(intents);
  const requestOf = requestReader(intents);

  // 1 + 2: lower-side boundary columns, per ordered (above, below) pair.
  const pairs = new Map<number, Map<number, number>>(); // key → (cell → drop)
  const cellOf = (i: number, j: number): number => j * width + i;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = cellOf(i, j);
      const below = owner[k] as number;
      const y = ground[k] as number;
      for (const [di, dj] of EDGE_NEIGHBOURS) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
        const m = cellOf(ii, jj);
        const above = owner[m] as number;
        if (above === below) continue;
        const ny = ground[m] as number;
        if (ny <= y) continue; // `k` is the lower side, strictly.

        if (isFace[k] === 1 || isFace[m] === 1) {
          // A face IS the transition (§2.2). The other side's request is
          // recorded as overridden rather than lost.
          const faced = isFace[k] === 1 ? above : below;
          const req = requestOf(faced);
          if (req !== "none") {
            substitutions?.push({ source: sourceOf(faced), requested: req, built: "none", why: "faced" });
          }
          continue;
        }
        if (requestOf(above) === "none" || requestOf(below) === "none") {
          const other = requestOf(above) === "none" ? below : above;
          const req = requestOf(other);
          if (req !== "none") {
            substitutions?.push({
              source: sourceOf(other),
              requested: req,
              built: "none",
              why: "none-side",
            });
          }
          continue;
        }

        const key = (above + 1) * span + (below + 1);
        let cells = pairs.get(key);
        if (cells === undefined) {
          cells = new Map<number, number>();
          pairs.set(key, cells);
        }
        const drop = ny - y;
        const prior = cells.get(k);
        if (prior === undefined || drop > prior) cells.set(k, drop);
      }
    }
  }

  // 3 + 4: 8-connected components within each pair.
  const out: BoundaryRun[] = [];
  for (const key of [...pairs.keys()].sort((a, b) => a - b)) {
    const cells = pairs.get(key) as Map<number, number>;
    const above = Math.floor(key / span) - 1;
    const belowOwner = (key % span) - 1;
    const ordered = [...cells.keys()].sort((a, b) => a - b);
    const seen = new Set<number>();
    for (const start of ordered) {
      if (seen.has(start)) continue;
      const queue = [start];
      seen.add(start);
      const component: number[] = [];
      for (let head = 0; head < queue.length; head++) {
        const k = queue[head] as number;
        component.push(k);
        const i = k % width;
        const j = (k - i) / width;
        for (const [di, dj] of RUN_NEIGHBOURS) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
          const nk = cellOf(ii, jj);
          if (!cells.has(nk) || seen.has(nk)) continue;
          seen.add(nk);
          queue.push(nk);
        }
      }
      component.sort((a, b) => a - b);
      // One number per component, read at its row-major-first cell: a component
      // never mixes owner pairs, so this is the pair's drop.
      const drop = cells.get(component[0] as number) as number;
      out.push({ above, below: belowOwner, cells: component, drop });
    }
  }
  return out;
}

/**
 * Substitutions, deduplicated and sorted.
 *
 * `GroundReport.transitions.substituted` carries no count field, so a hill town's
 * ten thousand identical `none-side` rows would be ten thousand copies of one
 * sentence. One row per distinct `(source, requested, built, why)` says the same
 * thing and keeps the report readable — the `SWEEP_FEATURES_PLACED` lesson.
 */
function dedupeSubstitutions(rows: readonly Substitution[]): Substitution[] {
  const byKey = new Map<string, Substitution>();
  for (const r of rows) {
    const key = `${r.source} ${r.requested} ${r.built} ${r.why}`;
    if (!byKey.has(key)) byKey.set(key, r);
  }
  return [...byKey.keys()].sort().map((k) => byKey.get(k) as Substitution);
}

/* -------------------------------------------------------------------------- */
/* v1 §3 — the refined derivation and the coverage invariant                   */
/* -------------------------------------------------------------------------- */

/**
 * Columns of the upper side a `depthAfter` walk looks through — `retaining.ts`'s
 * `RETAIN_FACE_SETBACK · 2`, restated here for the reason `MIN_EDGE_DEPTH` is
 * restated in `levels.ts`: this module sits upstream of the pass that owns the
 * constant, and `ground-transitions.test.ts` asserts the two agree.
 */
const V1_DEPTH_REACH = 24;

/**
 * How a winning claim's class reads as an {@link EdgeUse}.
 *
 * The owner map's answer to `retaining.ts`'s `street`/`occupied` masks. Rule 3
 * asks *is anybody using the ground this bank would spread over*, and a class is
 * the only thing about a winner the resolver knows — which is exactly enough:
 * the four street classes are the carriageway family, and the built classes are
 * the ones that put a floor plane on the ground somebody stands on.
 *
 * `pad.record` is in the built family **at HEAD only**. WP-G3 gives
 * `building.footprint` its own declarer and the lot pads stop arriving as
 * records; the row survives as the answer for a document compiled before that
 * flip, and the class's own retirement (§4) deletes it.
 */
const CLASS_USE: Readonly<Partial<Record<string, EdgeUse>>> = Object.freeze({
  "fluid.channel": "natural",
  "building.footprint": "lot",
  // A block's own levelled ground is used ground, but it is not a lot and it is
  // not carriageway: nobody is standing on it in the way rule 3 means, so it
  // presses on nothing. WP-G3 mints it; the row is here so that landing WP-G3
  // does not silently reclassify every terrace boundary in a hill town.
  "quarter.plane": "civic",
  "precinct.ground": "civic",
  "structure.linework": "civic",
  "plaza.ground": "civic",
  "plaza.well": "civic",
  "courtyard.floor": "lot",
  "retaining.seam": "natural",
  "retaining.skirt": "natural",
  "street.network": "street",
  "street.sidewalk": "street",
  "road.network": "street",
  "sweep.run": "street",
  "doorstep.landing": "street",
  "farm.parcel": "lot",
  "prop.pad": "lot",
  // The street's own planted strip: street ground, and a bank graded across it
  // is a bank graded across the street below.
  verge: "street",
  "pad.record": "lot",
});

/**
 * `CLASS_USE`'s default, and why the table is `Partial`.
 *
 * The rewrite mints and retires classes stage by stage — `quarter.plane` arrives
 * at WP-G3, `pad.record` leaves with it — so an exhaustive `Record` over
 * `GroundSourceClass` would make this file fail to compile in the middle of
 * somebody else's stage. Totality is asserted where it belongs instead:
 * `ground-transitions.test.ts` walks `GROUND_SOURCE_CLASSES` and requires an
 * explicit row for every member, which is the same guarantee arrived at without
 * the coupling.
 */
const CLASS_USE_DEFAULT: EdgeUse = "natural";

/** The classes whose winner is a building's own floor plane (§3.1 refinement 3). */
const BUILT_CLASSES: ReadonlySet<string> = new Set<string>([
  "building.footprint",
  // At HEAD the lot pads are the building rects, declared as records by
  // `declarePadEdits`. G3's `building.footprint` class sharpens this to the
  // rect itself; until then a record over a seated footprint is the only data
  // that says "a building already stands on this face".
  "pad.record",
]);

/**
 * One boundary run, as v1 §3.1 reads it.
 *
 * A superset of {@link GroundTransition}: the same run, the same cells and the
 * same `treatment` the resolver's own list carries, plus the three refinements —
 * the levels the run was measured at, the context S5 selects a dressing from,
 * and the treatment that context chooses.
 */
export interface DerivedSeam extends GroundTransition {
  /** `resolved.ground` on the lower side. Never `GroundLevels.levelY` (§3.1.1). */
  readonly belowY: number;
  /** `resolved.ground` on the upper side — `belowY + drop`, by construction. */
  readonly aboveY: number;
  /** §3.1.2 — the share of the run something is using the ground beyond. */
  readonly pressedShare: number;
  /** §3.1.2 — unclaimed columns a bank could be graded into, median over the run. */
  readonly availableRun: number;
  /** §3.1.3 — the share of the face a building already stands on. */
  readonly builtShare: number;
  /** §5.4: the fill edge is the downhill one, the cut edge the uphill one. */
  readonly side: "cut" | "fill";
  /**
   * What the **context** chooses — `treatmentForEdge` with §3.1's three
   * refinements measured, against `treatment`'s drop-and-run-only answer.
   *
   * Nothing builds from this at WP-G4: `GROUND_V1_SEAMS` is off and
   * `finishSeams` reports. It is the golden the flag-on half is diffed against.
   */
  readonly refined: SeamTreatment;
  /**
   * §7.2's natural blend — the eased bank's run in columns, or `0` where the
   * policy does not apply (the boundary is pressed, or the ground beside it
   * cannot afford even the 1:2 ramp).
   *
   * Derived here rather than at the builder because report and build must agree:
   * the number is {@link blendedBankRun}'s and the profile it implies is
   * {@link blendedBankFall}'s, and neither has a second home.
   */
  readonly blendRun: number;
}

/** How a boundary pair was accounted for (§3.2's four clauses). */
export interface SeamCoverage {
  /** Boundary pairs the invariant considered, after the two named exclusions. */
  readonly pairs: number;
  /** Clause 1 — a derived transition whose cells contain the lower column. */
  readonly transition: number;
  /** Clause 2 — either side declared `transition: "none"`. */
  readonly request: number;
  /** Clause 3 — either side is a face, and a face *is* the transition. */
  readonly face: number;
  /** Clause 4 — a one-block drop the kerb course builds as a material. */
  readonly kerb: number;
  /** Excluded: both sides unowned. The hillside, and it must stay. */
  readonly natural: number;
  /** Excluded: a fluid on either side. A shore is not a seam. */
  readonly water: number;
  /** Pairs matching none of the four, or matching two — every one a `LOAM-E495`. */
  readonly uncovered: number;
}

/** What {@link deriveGroundSeams} hands back. */
export interface SeamDerivation {
  readonly transitions: readonly DerivedSeam[];
  readonly coverage: SeamCoverage;
  /** `LOAM-E495 GROUND_SEAM_UNCOVERED`, at most one per compile. */
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** What the refined derivation reads. Everything is the *resolved* field (§3.1.1). */
export interface SeamDerivationInput {
  readonly region: Region;
  readonly ground: ReadonlyInt32Array;
  readonly owner: ReadonlyInt32Array;
  readonly fluidKind: ReadonlyUint8Array;
  readonly intents: readonly GroundIntent[];
  /**
   * 1 where a seated building's footprint stands, if the caller has it.
   *
   * The structure pass does (`occupancyOf(region, footprints)`), and it is a
   * sharper answer than {@link BUILT_CLASSES}: a lot pad is declared over the
   * rect the *solver* reserved, and the building is seated inside it. Absent, the
   * class table answers.
   */
  readonly occupied?: ReadonlyUint8Array;
  /** The maximum number of `LOAM-E495` witnesses named in the diagnostic. */
  readonly witnesses?: number;
}

/**
 * v1 §3 — every boundary the resolved field holds, refined and checked.
 *
 * Two things in one walk, because they are two readings of one enumeration:
 *
 * 1. **§3.1's three refinements.** `above`/`below` measured from
 *    `resolved.ground`; `pressedShare` and `availableRun` measured off the
 *    resolved field and the owner map, with no `plannedEdges` gate — the whole
 *    field is the context, which is the first time both halves have been
 *    available in one place; and `built` as a real classification, for a run
 *    whose upper side a building already stands on.
 * 2. **§3.2's coverage invariant.** Every boundary pair accounted for exactly
 *    once, by exactly one of the four clauses, with the two named exclusions.
 *    A pair matching none is `LOAM-E495`, and *the derivation is what is wrong* —
 *    an exclusion is never widened to make it quiet.
 *
 * Pure: it reads its argument and allocates its answer, and calls nothing that
 * is not a pure function of it.
 */
export function deriveGroundSeams(input: SeamDerivationInput): SeamDerivation {
  const { region, ground, owner, fluidKind, intents } = input;
  const width = region.width;
  const depth = region.depth;

  // §2.2's faces, recovered from the winners: `resolveGround` sets `isFace` for
  // exactly the columns a `face` intent won, so the owner map carries it.
  const isFace = new Uint8Array(width * depth);
  for (let k = 0; k < isFace.length; k++) {
    const o = owner[k] as number;
    if (o !== -1 && (intents[o] as GroundIntent).kind === "face") isFace[k] = 1;
  }

  const plain = { width, depth, ground: ground as Int32Array, owner: owner as Int32Array, isFace, intents };
  const runs = groupBoundaryRuns(plain, null);
  const sourceOf = sourceReader(intents);
  const requestOf = requestReader(intents);
  const classOf = (o: number): GroundSourceClass | null =>
    o === -1 ? null : (intents[o] as GroundIntent).sourceClass;
  const useOf = (o: number): EdgeUse => {
    const c = classOf(o);
    return c === null ? "natural" : (CLASS_USE[c] ?? CLASS_USE_DEFAULT);
  };
  const builtAt = (k: number): boolean => {
    if (input.occupied !== undefined && input.occupied[k] === 1) return true;
    const c = classOf(owner[k] as number);
    return c !== null && BUILT_CLASSES.has(c);
  };

  const transitions: DerivedSeam[] = [];
  /** Clause 1's index: cell → the pairs it is the lower side of. */
  const covered = new Map<number, Set<number>>();
  const span = intents.length + 2;
  for (const run of runs) {
    const seam = refineRun(run, {
      width,
      depth,
      ground,
      owner,
      fluidKind,
      isFace,
      useOf,
      builtAt,
      sourceOf,
      requestOf,
    });
    transitions.push(seam);
    const key = (run.above + 1) * span + (run.below + 1);
    for (const k of run.cells) {
      let keys = covered.get(k);
      if (keys === undefined) {
        keys = new Set<number>();
        covered.set(k, keys);
      }
      keys.add(key);
    }
  }
  transitions.sort(byFirstCellThenPair);

  const coverage = checkCoverage({
    width,
    depth,
    ground,
    owner,
    fluidKind,
    isFace,
    requestOf,
    covered,
    span,
  });

  const diagnostics: LoamDiagnostic[] = [];
  if (coverage.report.uncovered > 0) {
    const limit = input.witnesses ?? 4;
    const named = coverage.witnesses
      .slice(0, limit)
      .map((w) => `${region.x0 + (w.cell % width)},${region.z0 + Math.floor(w.cell / width)} (${w.why})`)
      .join("; ");
    diagnostics.push(
      error(
        "GROUND_SEAM_UNCOVERED",
        "",
        `ground seams: ${coverage.report.uncovered} of ${coverage.report.pairs} boundary ` +
          `pair(s) are accounted for by no transition and no suppression — ${named}`,
        "The derivation is incomplete: find the boundary the enumeration missed. " +
          "Never widen §3.2's exclusions to silence this — the two exclusions are " +
          "natural-against-natural and water, and nothing else.",
      ),
    );
  }

  return { transitions, coverage: coverage.report, diagnostics };
}

/** Everything {@link refineRun} measures a run against. */
interface RefineContext {
  readonly width: number;
  readonly depth: number;
  readonly ground: ReadonlyInt32Array;
  readonly owner: ReadonlyInt32Array;
  readonly fluidKind: ReadonlyUint8Array;
  readonly isFace: Uint8Array;
  readonly useOf: (o: number) => EdgeUse;
  readonly builtAt: (k: number) => boolean;
  readonly sourceOf: (o: number) => string;
  readonly requestOf: (o: number) => GroundTransitionKind;
}

/**
 * One run, measured — `retaining.ts`'s `edgeContextOf`, asked of the owner map
 * instead of one district's `GroundLevels` (§3.1 refinement 2).
 *
 * Same three measurements, same low-side rule, same medians; the only thing that
 * changes is what stands in for `levels.at()`, `street` and `occupied`, and that
 * is the whole of "`EdgeContext` stops being gated on `district.plannedEdges`":
 * the field's own owner map answers for every boundary in the world, including
 * the ones no site planner planned.
 *
 * The measurement is **not** what the build path reads at this stage. WP-G4
 * ships with `GROUND_V1_SEAMS` off, so the retaining pass goes on measuring its
 * own hillside-only context and every world is byte-identical; this is the
 * comparison the flag-on half is diffed against.
 */
function refineRun(run: BoundaryRun, ctx: RefineContext): DerivedSeam {
  const { width, depth, ground, owner, fluidKind } = ctx;
  const above = run.above;
  const drop = run.drop;
  const reach = bankRun(drop);
  const inBounds = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < width && j < depth;

  /** The 4-neighbour direction from a run cell towards the face it presents. */
  const faceDir = (i: number, j: number): readonly [number, number] | null => {
    for (const [di, dj] of EDGE_NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (!inBounds(ii, jj)) continue;
      const k = jj * width + ii;
      if ((owner[k] as number) === above && (ground[k] as number) > (ground[j * width + i] as number)) {
        return [di, dj];
      }
    }
    return null;
  };

  const free: number[] = [];
  const behind: number[] = [];
  let builtFace = 0;
  let facedCells = 0;
  let pressedCells = 0;
  let use: EdgeUse = "natural";
  let publicGround = false;

  for (const cell of run.cells) {
    const i = cell % width;
    const j = (cell - i) / width;
    const dir = faceDir(i, j);
    if (dir === null) continue;
    const [di, dj] = dir;
    facedCells++;
    // Rule 2, as a share (§3.1.3).
    if (ctx.builtAt((j + dj) * width + (i + di))) builtFace++;
    // `availableRun` — unclaimed columns straight out from the face. Straight
    // and never around, for `walkBack`'s reason: a search free to detour
    // measures somebody else's ground. A claimed column stops the walk whoever
    // claimed it: grading a bank across a neighbour's level would bury it.
    let run0 = 0;
    for (let step = 1; step <= reach; step++) {
      const ii = i - di * step;
      const jj = j - dj * step;
      if (!inBounds(ii, jj)) break;
      const k = jj * width + ii;
      if ((owner[k] as number) !== -1) break;
      if ((fluidKind[k] as number) !== FluidKind.NONE) break;
      run0++;
    }
    free.push(run0);
    // Rule 6's `depthAfter` — the upper side behind the face, straight in.
    let deep = 0;
    for (let step = 1; step <= V1_DEPTH_REACH; step++) {
      const ii = i + di * step;
      const jj = j + dj * step;
      if (!inBounds(ii, jj)) break;
      if ((owner[jj * width + ii] as number) !== above) break;
      deep++;
    }
    behind.push(deep);
    // Rule 3's land pressure, on the low side only — §5.2's rule measured where
    // `edgeContextOf` measures it, and for the same reason: asked of the
    // platform side every terrace in a hill town is pressed and rule 3 never
    // discriminates.
    let pressed = false;
    for (let ddj = -WALL_DEMAND_RANGE; ddj <= WALL_DEMAND_RANGE; ddj++) {
      for (let ddi = -WALL_DEMAND_RANGE; ddi <= WALL_DEMAND_RANGE; ddi++) {
        const ii = i + ddi;
        const jj = j + ddj;
        if (!inBounds(ii, jj)) continue;
        const k = jj * width + ii;
        if ((owner[k] as number) === above) continue;
        const u = ctx.useOf(owner[k] as number);
        if (u === "street") {
          use = "street";
          publicGround = true;
          pressed = true;
        } else if (u === "lot" || ctx.builtAt(k)) {
          if (use !== "street") use = "lot";
          pressed = true;
        }
      }
    }
    if (pressed) pressedCells++;
  }

  const median = (list: number[]): number => {
    if (list.length === 0) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[sorted.length >> 1] as number;
  };
  // §5.4: an unowned upper side is the hill itself, and a boundary against it is
  // a **cut**; anything else is ground a claim raised, which is a fill face.
  const side: "cut" | "fill" = above === -1 ? "cut" : "fill";
  const belowY = ground[run.cells[0] as number] as number;
  const context: EdgeContext = {
    drop,
    run: run.cells.length,
    availableRun: median(free),
    adjacentUse: use,
    access: publicGround ? "public" : "private",
    depthAfter: median(behind) - 1,
    side,
    // The district's masonry ration is the *builder*'s to spend (§3.3's refusal
    // column): a derivation that priced it would make the enumeration depend on
    // the order the quarters were walked in, which §5.7 forbids.
    budget: Number.POSITIVE_INFINITY,
    builtShare: facedCells === 0 ? 0 : builtFace / facedCells,
    pressedShare: facedCells === 0 ? 0 : pressedCells / facedCells,
  };
  const chosen = treatmentForEdge(context);
  // `"replan"` collapses exactly as `treatmentForSeam` collapses it: there is no
  // planner still running to narrow the claim, so the answer is the unbuilt one.
  const refined: SeamTreatment = chosen === "replan" ? (side === "fill" ? "bank" : "rock") : chosen;
  // **§7.2's natural blend, as treatment *and* geometry.** `treatmentForEdge`
  // rule 3 already prefers the bank on an unpressed fill edge with the room for
  // one — that is the policy's first half, and it is not restated here. What is
  // decided here is the second half: the run the bank actually spends and the
  // profile it spends it on. A pressed edge keeps its face (S5 unchanged), and a
  // treatment that is not a bank has nothing to ease.
  const blendRun =
    refined === "bank" && side === "fill" && context.pressedShare < EDGE_PRESSED_SHARE
      ? blendedBankRun(drop, context.availableRun)
      : 0;

  return {
    above,
    below: run.below,
    aboveSource: ctx.sourceOf(above),
    belowSource: ctx.sourceOf(run.below),
    cells: run.cells,
    drop,
    treatment: treatmentForSeam(drop, run.cells.length),
    requested: { above: ctx.requestOf(above), below: ctx.requestOf(run.below) },
    belowY,
    aboveY: belowY + drop,
    pressedShare: context.pressedShare,
    availableRun: context.availableRun,
    builtShare: context.builtShare,
    side,
    refined,
    blendRun,
  };
}

/** A boundary pair the invariant could not account for. */
interface CoverageWitness {
  readonly cell: number;
  readonly why: string;
}

/**
 * §3.2, executed.
 *
 * The four clauses are checked in the order §3.2 states them and a pair is
 * accounted for by the first that answers. Two of the four overlap **by
 * design** and neither overlap is a violation:
 *
 * - clause 4 subsumes into clause 1 wherever a one-block drop was long enough to
 *   be grouped into a run — the kerb course and the derived `kerb` transition are
 *   the same fact, said twice;
 * - clauses 2 and 3 never overlap clause 1, because the enumeration skips a
 *   suppressed pair before it reaches the grouping. A pair that is *both* in a
 *   transition and suppressed is therefore a real derivation bug and is counted
 *   as uncovered with `double` as its reason, which is §3.2's "or matching two".
 */
function checkCoverage(args: {
  readonly width: number;
  readonly depth: number;
  readonly ground: ReadonlyInt32Array;
  readonly owner: ReadonlyInt32Array;
  readonly fluidKind: ReadonlyUint8Array;
  readonly isFace: Uint8Array;
  readonly requestOf: (o: number) => GroundTransitionKind;
  readonly covered: Map<number, Set<number>>;
  readonly span: number;
}): { readonly report: SeamCoverage; readonly witnesses: CoverageWitness[] } {
  const { width, depth, ground, owner, fluidKind, isFace, requestOf, covered, span } = args;
  let pairs = 0;
  let transition = 0;
  let request = 0;
  let face = 0;
  let kerb = 0;
  let natural = 0;
  let water = 0;
  let uncovered = 0;
  const witnesses: CoverageWitness[] = [];

  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const b = j * width + i;
      const belowOwner = owner[b] as number;
      const y = ground[b] as number;
      for (const [di, dj] of EDGE_NEIGHBOURS) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
        const a = jj * width + ii;
        const aboveOwner = owner[a] as number;
        if ((ground[a] as number) <= y) continue; // `b` is the lower side, strictly.
        // Exclusion 1 — the hillside against itself. Counted before the
        // owner-difference test rather than after, because §3.2's definition
        // already excludes it (`owner[a] !== owner[b]` cannot hold when both are
        // −1) and the census would otherwise always read zero. It is the guard
        // number of §6/WP-G4's acceptance table — "this stage must not touch the
        // hillside" — so it is worth reporting rather than defining away.
        if (aboveOwner === -1 && belowOwner === -1) {
          natural++;
          continue;
        }
        if (aboveOwner === belowOwner) continue;
        // Exclusion 2 — a shore is not a seam; `fluid.channel`'s `preserve`
        // governs it.
        if (
          (fluidKind[a] as number) !== FluidKind.NONE ||
          (fluidKind[b] as number) !== FluidKind.NONE
        ) {
          water++;
          continue;
        }
        pairs++;

        const inRun = covered.get(b)?.has((aboveOwner + 1) * span + (belowOwner + 1)) === true;
        const suppressedByRequest =
          requestOf(aboveOwner) === "none" || requestOf(belowOwner) === "none";
        const suppressedByFace = isFace[a] === 1 || isFace[b] === 1;
        if (inRun && (suppressedByRequest || suppressedByFace)) {
          uncovered++;
          if (witnesses.length < 32) witnesses.push({ cell: b, why: "double" });
          continue;
        }
        if (inRun) transition++;
        else if (suppressedByRequest) request++;
        else if (suppressedByFace) face++;
        else if ((ground[a] as number) - y === 1) kerb++;
        else {
          uncovered++;
          if (witnesses.length < 32) witnesses.push({ cell: b, why: "no clause" });
        }
      }
    }
  }

  return {
    report: { pairs, transition, request, face, kerb, natural, water, uncovered },
    witnesses,
  };
}

/**
 * `CLASS_USE`, for the test that asserts it is total over
 * `GROUND_SOURCE_CLASSES`. Not for a consumer: use is read through
 * `deriveGroundSeams`.
 */
export const SEAM_CLASS_USE = CLASS_USE;
