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
  type GroundTransition,
  type GroundTransitionKind,
  type ResolvedGround,
} from "./ground-contract.js";
import { MIN_RETAIN_RUN, RETAIN_MAX, treatmentForDrop, treatmentForSeam } from "./levels.js";

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
  const { width, depth, ground, owner, isFace, intents } = input;
  const span = intents.length + 2; // owners are −1..intents.length−1

  const sourceOf = (o: number): string => (o === -1 ? "baseline" : (intents[o] as GroundIntent).source);
  // The baseline asked for nothing, so it is read as `"ramp"`: unclaimed ground
  // grades out to whatever meets it, which is what `blendShoulders` does today.
  // Reading it as `"none"` would suppress every platform-against-natural-ground
  // transition in the world, which is the opposite of what the field says.
  const requestOf = (o: number): GroundTransitionKind =>
    o === -1 ? "ramp" : (intents[o] as GroundIntent).transition;

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
            substitutions.push({ source: sourceOf(faced), requested: req, built: "none", why: "faced" });
          }
          continue;
        }
        if (requestOf(above) === "none" || requestOf(below) === "none") {
          const other = requestOf(above) === "none" ? below : above;
          const req = requestOf(other);
          if (req !== "none") {
            substitutions.push({
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
  const out: GroundTransition[] = [];
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
  }

  // 5: row-major by first cell, then by the owner pair, so the list is a pure
  // function of the field.
  out.sort((a, b) => {
    const ac = a.cells[0] as number;
    const bc = b.cells[0] as number;
    if (ac !== bc) return ac - bc;
    if (a.above !== b.above) return a.above - b.above;
    return a.below - b.below;
  });
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
