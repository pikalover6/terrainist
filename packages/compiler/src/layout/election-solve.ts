/**
 * **The election solve** —.
 *
 * One objective, and no more thresholds. A block is partitioned into **atoms**
 * before any level exists (§3.1), every atom's ground, frontage and seams are
 * priced by one convex integer objective (§1.2), and the assignment that
 * minimises it is found *exactly* by Ishikawa's reduction to a single s–t
 * min-cut solved with Dinic (§3.4). Adjacent atoms that come out at the same
 * level coalesce into one platform; that is how the terrace count is decided,
 * which is why no splitter and no merger survives the flip.
 *
 * Everything here is integer and deterministic: the partition walks row-major,
 * atoms are ordered canonically `(descending column count, ascending minimum
 * region index)`, levels ascend, pairs are `(a < b)`, no float ever enters the
 * solve, and the cut taken is the **source-side reachable set of the final
 * residual graph** — the unique *minimal* min-cut — oriented so that minimal
 * means **lowest**. Ties therefore break to the lower level by construction
 * rather than by a comparator someone has to remember (§3.4 S3).
 *
 * The file is a **datum** : a pure
 * function of the pristine baseline, the solved layout and `StreetDatum`. It
 * proposes levels and declares nothing, and it imports no resolver, no driver
 * and no plan.
 */

import { RETAIN_MAX, SEAM_TIER_MAX } from "./levels.js";
import {
  ATOM_MAX,
  CUT_W,
  DOMAIN_MAX,
  EDGE_DITCH,
  EDGE_KERB,
  EDGE_STEP,
  FILL_W,
  FRONT_BURY,
  FRONT_KERB,
  FRONT_LIP,
} from "./types.js";

/**
 * **H1's bar** — `|L_a − L_b| ≤ SEAM_TIER_MAX · RETAIN_MAX`, §2.1.
 *
 * A seam past what `tiersOf` dresses is not a seam a town builds. Stated as a
 * hard constraint *inside* the decision rather than as `dissolveTallPairs`'
 * repair of a finished one, so no platform ever gives its level back.
 */
export const SEAM_DROP_MAX = SEAM_TIER_MAX * RETAIN_MAX;

/* -------------------------------------------------------------------------- */
/* §1.3 — the terms                                                            */
/* -------------------------------------------------------------------------- */

/**
 * §1.3.2 — the drop between two atoms, per contact column.
 *
 * `0, 1, 3, 7, 13, 21, 31, …`; increments `1, 2, 4, 6, 8, …`, non-decreasing,
 * so `EDGE` is **convex** — the property §3.4's exactness rests on. A kerb is
 * cheap and a ditch is dear, superlinearly. There is no separate terrace-count
 * term and there must not be one: churn *is* `EDGE(1)`, priced by the boundary
 * it actually adds.
 */
export function EDGE(d: number): number {
  const a = d < 0 ? -d : d;
  if (a === 0) return 0;
  return EDGE_KERB + EDGE_STEP * (a - 1) + EDGE_DITCH * (a - 1) * (a - 1);
}

/**
 * §1.3.3 — one frontage column's price for a plane `s − L` below its own
 * street (`g ≥ 1`) and `L − s` above it.
 *
 * `…, 7, 1, 0, 4, 8, …` as `L` rises past `s`; increments `−6, −1, +4, +4`,
 * non-decreasing, so this too is convex. One below its pavement is a kerb you
 * step down off, nearly free; two or more below is the buried door; above is
 * the lip Kai walked four times — dear, but linear, because a plinth is a
 * mistake and not a hole.
 */
export function FRONTAGE(level: number, street: number): number {
  if (level === street) return 0;
  if (level > street) return FRONT_LIP * (level - street);
  return FRONT_KERB + FRONT_BURY * (street - level - 1);
}

/** §1.3.1 — one ground column's price against its own pristine height. */
export function GROUND(level: number, pristine: number): number {
  return level < pristine ? CUT_W * (pristine - level) : FILL_W * (level - pristine);
}

/* -------------------------------------------------------------------------- */
/* the interface                                                               */
/* -------------------------------------------------------------------------- */

/** Everything {@link electBlock} reads. Pure in, integers out. */
export interface ElectionInput {
  /** A stable name for the block — the elected atoms' ids are built from it. */
  readonly id: string;
  /** The raster the cell indices below are taken over. */
  readonly width: number;
  readonly depth: number;
  /** The block's own cells, **ascending** — `platforms.ts`' `component`. */
  readonly block: readonly number[];
  /** §1.2's `p_c`: the pristine height of a column, by the `floor` rule. */
  readonly pristineAt: (k: number) => number;
  /** A1's seed field: `floor(blur(pristine))` at `SMOOTH_RADIUS`/`PASSES`. */
  readonly stepAt: (k: number) => number;
  /** §1.2's `s_f`, or `undefined` where no banded column is within `reach`. */
  readonly frontageAt: (k: number) => number | undefined;
  /** H3's bar — `MIN_PLATFORM_COLUMNS`, passed rather than imported (no cycle). */
  readonly minColumns: number;
  /** H2's floor. Absent ⇒ no hydrology to answer to. */
  readonly waterFloor?: number;
  /**
   * **A5 — is this *column* water rather than the ground beside it?**
   *
   * Per column, not per atom, because wetness is a **partition invariant**
   * (§3.1 A1/A3/A4): the channel and its banks are never the same atom, so
   * "mostly water" and "all water" are the same question by the time anything
   * asks it. A per-atom `mostlyWater` exemption could only skip H2's floor; it
   * could not stop the *objective* electing the bank's level across a channel
   * that had been swallowed whole by a bank atom, and a 16-wide river inside a
   * ~1,700-column block is exactly that (WP-E3: 1,951 wet columns → 718).
   *
   * **A5 is one law with three clauses, and the river needs all three** —
   * each was measured on the compiled river quarter and each is a statement
   * about what the town does *not* build over water:
   *
   * 1. **No floor.** H2 does not raise a wet atom to the waterline; the water
   *    is already at the waterline. (The clause that shipped before WP-E3, and
   *    on its own it is worth nothing — 718 wet columns.)
   * 2. **No frontage.** `F(i)` is empty for a wet atom: §1.3.3 prices a plane's
   *    agreement with the pavement that serves it, and a riverbed has no door
   *    to bury. Without this the bank roads either side of a 16-wide channel
   *    are both within `reach` of its middle and `FRONT_BURY` reads the river
   *    as a trench of buried doorsteps. (Alone: 1,341.)
   * 3. **No seam.** A pair with one wet endpoint is not a pair: §1.3.2 prices
   *    retaining tiers and H1 refuses a drop deeper than `tiersOf` dresses,
   *    and a riverbank is neither — nobody retains a river. (Alone: 718.)
   *
   * All three: **1,995 wet columns and 16 dry cross-sections**, against the
   * pre-election fallback path's 1,951 and 16.
   */
  readonly wetAt?: (k: number) => boolean;
}

/** One atom, as the solve elected it. */
interface ElectedAtom {
  readonly id: string;
  /** The atom's cells, ascending. */
  readonly cells: readonly number[];
  /** The elected level. */
  readonly level: number;
}

/** §3.6 — one atom's line of the explanation record. */
interface AtomRecord {
  readonly id: string;
  readonly columns: number;
  readonly pristineMedian: number;
  /** `[lo, hi]`, §3.3's `D`. */
  readonly domain: readonly [number, number];
  /** Frontage columns — the size of `F(i)`. */
  readonly frontageColumns: number;
  readonly level: number;
  /** The three cost terms at the chosen level **and at chosen ± 1** (§3.6). */
  readonly terms: readonly TermLine[];
}

/** The objective, decomposed, at one candidate level for one atom. */
interface TermLine {
  readonly level: number;
  readonly cut: number;
  readonly fill: number;
  readonly frontageLow: number;
  readonly frontageHigh: number;
  /** `Σ n_ab · EDGE(|L − L_b|)` with every neighbour held at its own answer. */
  readonly edge: number;
  readonly total: number;
  /** Which of `cut`/`fill`/`frontageLow`/`frontageHigh`/`edge` is largest. */
  readonly dominant: string;
}

/** §3.6 — one block's line of the explanation record. */
interface BlockRecord {
  readonly id: string;
  readonly atoms: readonly AtomRecord[];
  /** A3 absorptions — slivers folded into a neighbour before levels existed. */
  readonly a3Merges: number;
  /** A4 merges — the atom cap biting (§7.4). */
  readonly a4Merges: number;
  /** §3.3 — did this block's span exceed `DOMAIN_MAX` and get truncated? */
  readonly overSpan: boolean;
  /** Interior nodes of the cut graph: `atoms · (|D| − 1)`, §3.5's assertion. */
  readonly nodes: number;
  readonly domain: readonly [number, number];
}

/** What {@link electBlock} returns: the answer and the reason for it. */
export interface BlockElection {
  readonly atoms: readonly ElectedAtom[];
  readonly record: BlockRecord;
}

/** §3.6's per-quarter payload, accumulated by the caller. */
export interface QuarterElection {
  blocks: BlockRecord[];
  atoms: number;
  a3Merges: number;
  a4Merges: number;
  overSpan: number;
  /** `LOAM-T242`'s histogram, re-read per §2.2: `L_i − s_f` over every `F(i)`. */
  residuals: Map<number, number>;
}

/* -------------------------------------------------------------------------- */
/* §3.1 — the partition                                                        */
/* -------------------------------------------------------------------------- */

/** One atom of the partition — the unit of assignment (§1.1). */
interface Atom {
  cells: number[];
  /** A1's step floor. A merge keeps the **absorbing** atom's floor. */
  floor: number;
  /**
   * A5's wetness — **invariant** across the atom, and across every merge.
   *
   * A1 seeds on `(floor, wet)` and A3/A4 refuse every merge that would cross
   * it, so this is a property of the atom rather than a majority vote over it.
   */
  wet: boolean;
  /** The atom's lowest cell index — every tie in §3.1 ends here. */
  minIdx: number;
  dead: boolean;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * A1–A4, in order, all integer and all deterministic.
 *
 * A2 is the absence of a line here: **no criterion and no predicate**. Every
 * block is partitioned, and one platform or seven is decided by the levels.
 */
function partitionBlock(input: ElectionInput): {
  readonly atoms: Atom[];
  readonly a3Merges: number;
  readonly a4Merges: number;
} {
  const { width, depth, block, stepAt, minColumns } = input;
  const cells = width * depth;
  const owner = new Int32Array(cells).fill(-1);
  const member = new Uint8Array(cells);
  for (const k of block) member[k] = 1;
  /** A5, per column. No hydrology ⇒ the whole block is dry and A1 is unchanged. */
  const wetAt = (k: number): boolean => input.wetAt !== undefined && input.wetAt(k);

  /* --- A1: 4-connected components of constant `(floor(blur(pristine)), wet)` */
  // Wetness joins the step floor in the seed key because the alternative — a
  // per-atom exemption applied after the fact — cannot separate a channel from
  // the bank that has already absorbed it (§3.1 A5). The blur runs over the
  // *pristine* field, so a 16-wide channel's bed and its banks can share a step
  // floor near the lip; the water mask cannot be blurred away.
  const atoms: Atom[] = [];
  const seen = new Uint8Array(cells);
  for (const start of block) {
    if (seen[start] === 1) continue;
    const floor = stepAt(start);
    const wet = wetAt(start);
    const out: number[] = [];
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
        if (seen[n] === 1 || member[n] !== 1 || stepAt(n) !== floor || wetAt(n) !== wet) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    out.sort((a, b) => a - b);
    const idx = atoms.length;
    for (const k of out) owner[k] = idx;
    atoms.push({ cells: out, floor, wet, minIdx: out[0] as number, dead: false });
  }

  /** Contact columns between `i` and every atom it touches. */
  const contactsOf = (i: number): Map<number, number> => {
    const out = new Map<number, number>();
    for (const k of (atoms[i] as Atom).cells) {
      const ci = k % width;
      const cj = (k - ci) / width;
      for (const [di, dj] of NEIGHBOURS) {
        const ii = ci + di;
        const jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
        const o = owner[jj * width + ii] as number;
        if (o < 0 || o === i) continue;
        out.set(o, (out.get(o) ?? 0) + 1);
      }
    }
    return out;
  };
  /**
   * A3/A4's refusal: no merge may cross wetness (§3.1 A5).
   *
   * The invariant is enforced here rather than by trusting the callers, so a
   * later merge rule inherits it for free.
   */
  const joinable = (i: number, o: number): boolean => (atoms[i] as Atom).wet === (atoms[o] as Atom).wet;
  const absorb = (into: number, gone: number): void => {
    const target = atoms[into] as Atom;
    const source = atoms[gone] as Atom;
    for (const k of source.cells) owner[k] = into;
    target.cells = [...target.cells, ...source.cells].sort((a, b) => a - b);
    target.minIdx = target.cells[0] as number;
    source.cells = [];
    source.dead = true;
  };

  /* --- A3: granularity (H3), before levels exist --------------------------- */
  let a3Merges = 0;
  const stuck = new Set<number>();
  for (;;) {
    let small = -1;
    for (const [i, atom] of atoms.entries()) {
      if (atom.dead || stuck.has(i) || atom.cells.length >= minColumns) continue;
      const best = small < 0 ? null : (atoms[small] as Atom);
      if (best === null || atom.cells.length < best.cells.length) small = i;
    }
    if (small < 0) break;
    const contacts = contactsOf(small);
    const mine = atoms[small] as Atom;
    let best = -1;
    let bestCount = -1;
    let bestFloorGap = Number.POSITIVE_INFINITY;
    for (const o of [...contacts.keys()].sort((a, b) => a - b)) {
      if (!joinable(small, o)) continue;
      const count = contacts.get(o) as number;
      const gap = Math.abs((atoms[o] as Atom).floor - mine.floor);
      const better =
        best < 0 ||
        count > bestCount ||
        (count === bestCount &&
          (gap < bestFloorGap ||
            (gap === bestFloorGap && (atoms[o] as Atom).minIdx < (atoms[best] as Atom).minIdx)));
      if (better) {
        best = o;
        bestCount = count;
        bestFloorGap = gap;
      }
    }
    if (best < 0) {
      // A sliver with no neighbour it may join — either a block that came out
      // as one atom, or (A5) a thread of water with nothing but bank around it.
      // Kept, exactly as `mergeSlivers` kept it: levelled ground with a small
      // platform in it is honest, natural ground inside levelled ground is not
      // — and a puddle absorbed into its bank is the dam this rule exists to
      // refuse, whatever it costs in granularity.
      stuck.add(small);
      continue;
    }
    absorb(best, small);
    a3Merges += 1;
  }

  /* --- A4: the atom cap (§7.4) --------------------------------------------- */
  let a4Merges = 0;
  for (;;) {
    const live = atoms.filter((a) => !a.dead);
    if (live.length <= ATOM_MAX) break;
    let bestA = -1;
    let bestB = -1;
    let bestKey: readonly [number, number, number, number] | null = null;
    for (const [i, atom] of atoms.entries()) {
      if (atom.dead) continue;
      for (const [o, count] of [...contactsOf(i).entries()].sort((x, y) => x[0] - y[0])) {
        if (o < i || !joinable(i, o)) continue;
        const a = atom.minIdx <= (atoms[o] as Atom).minIdx ? i : o;
        const b = a === i ? o : i;
        const key = [
          Math.abs(atom.floor - (atoms[o] as Atom).floor),
          -count,
          (atoms[a] as Atom).minIdx,
          (atoms[b] as Atom).minIdx,
        ] as const;
        if (bestKey === null || lexLess(key, bestKey)) {
          bestKey = key;
          bestA = a;
          bestB = b;
        }
      }
    }
    // No legal merge left — every remaining adjacency crosses wetness (§3.1
    // A5). The cap yields to the invariant: a block over `ATOM_MAX` costs a
    // larger cut graph, a dammed river costs the river.
    if (bestKey === null) break;
    absorb(bestA, bestB);
    a4Merges += 1;
  }

  /* --- canonical order (§3.4 S2) ------------------------------------------- */
  const live = atoms.filter((a) => !a.dead);
  live.sort((a, b) => b.cells.length - a.cells.length || a.minIdx - b.minIdx);
  return { atoms: live, a3Merges, a4Merges };
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (const [i, av] of a.entries()) {
    const bv = b[i] as number;
    if (av !== bv) return av < bv;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* the solve                                                                   */
/* -------------------------------------------------------------------------- */

/** One block's problem, after §3.1's partition and §3.3's domain. */
export interface BlockProblem {
  readonly atoms: readonly Atom[];
  /** Per atom, `pristine height → column count`. */
  readonly ground: readonly ReadonlyMap<number, number>[];
  /** Per atom, `s_f → column count` over `F(i)`. */
  readonly front: readonly ReadonlyMap<number, number>[];
  readonly pairs: readonly { a: number; b: number; nab: number }[];
  readonly wet: readonly boolean[];
  readonly lo: number;
  readonly hi: number;
  readonly overSpan: boolean;
  readonly a3Merges: number;
  readonly a4Merges: number;
  readonly blockMedian: number;
}

/**
 * §3.1 + §3.3 — the partition, the histograms, the adjacency and the domain.
 *
 * Split out of {@link electBlock} because §3.4 S4's brute-force oracle has to
 * be handed *the same problem* the cut solves, never a second construction of
 * it: a mismatch must be the solver's, not the fixture's.
 */
export function buildProblem(input: ElectionInput): BlockProblem {
  const { width, depth, block, pristineAt, frontageAt, waterFloor } = input;
  const { atoms, a3Merges, a4Merges } = partitionBlock(input);
  const n = atoms.length;

  /* --- per-atom histograms ------------------------------------------------- */
  const ground: Map<number, number>[] = [];
  const front: Map<number, number>[] = [];
  const wet: boolean[] = [];
  let A = Number.POSITIVE_INFINITY;
  let B = Number.NEGATIVE_INFINITY;
  const allPristine: number[] = [];
  for (const atom of atoms) {
    const g = new Map<number, number>();
    const f = new Map<number, number>();
    for (const k of atom.cells) {
      const p = pristineAt(k);
      g.set(p, (g.get(p) ?? 0) + 1);
      allPristine.push(p);
      if (p < A) A = p;
      if (p > B) B = p;
      // **A5 — water has no frontage.** §1.3.3 prices the agreement between a
      // plane and the pavement that serves it: a kerb to step off, a door not
      // buried, no plinth. A riverbed is served by nothing and no door opens
      // onto it, so `F(i)` is empty for a wet atom and the whole term is
      // silent. Without this the channel's own columns sit within `reach` of
      // the bank roads either side (a 16-wide channel is inside the lot tie's
      // reach from both banks at once), `FRONT_BURY` reads ten blocks of
      // riverbed as ten blocks of buried doorstep, and the solve buys its way
      // out by filling the river to the road — the dam again, wearing the
      // frontage term instead of the partition (WP-E3, measured: 4,158 of one
      // wet atom's cost was frontage it cannot have).
      if (atom.wet) continue;
      const s = frontageAt(k);
      if (s === undefined) continue;
      f.set(s, (f.get(s) ?? 0) + 1);
      if (s < A) A = s;
      if (s > B) B = s;
    }
    ground.push(g);
    front.push(f);
    // A5 — read off the partition, never re-measured: §3.1's invariant makes
    // the atom uniformly wet or uniformly dry, so there is no majority to take.
    wet.push(atom.wet);
  }
  allPristine.sort((a, b) => a - b);
  const blockMedian = allPristine.length === 0 ? 0 : (allPristine[allPristine.length >> 1] as number);
  const anyDry = wet.some((w) => !w);
  if (!Number.isFinite(A)) {
    A = blockMedian;
    B = blockMedian;
  }
  if (waterFloor !== undefined && anyDry && waterFloor > B) B = waterFloor;

  /* --- §3.3: the domain ---------------------------------------------------- */
  let lo = A - 1;
  let hi = B + 1;
  let overSpan = false;
  if (hi - lo + 1 > DOMAIN_MAX) {
    overSpan = true;
    lo = blockMedian - (DOMAIN_MAX >> 1);
    hi = lo + DOMAIN_MAX - 1;
    if (waterFloor !== undefined && anyDry && waterFloor > hi) {
      hi = waterFloor;
      lo = hi - DOMAIN_MAX + 1;
    }
  }

  /* --- §1.2: the pairs ----------------------------------------------------- */
  const owner = new Int32Array(width * depth).fill(-1);
  for (const [i, atom] of atoms.entries()) for (const k of atom.cells) owner[k] = i;
  const contact = new Map<number, number>();
  for (const k of block) {
    const a = owner[k] as number;
    if (a < 0) continue;
    const ci = k % width;
    const cj = (k - ci) / width;
    for (const [di, dj] of NEIGHBOURS) {
      const ii = ci + di;
      const jj = cj + dj;
      if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
      const b = owner[jj * width + ii] as number;
      if (b < 0 || b === a) continue;
      // **A5 — water forms no seam.** §1.3.2 prices the drop between two
      // atoms as the retaining tiers a town has to build across it, and §2.1's
      // H1 refuses a drop deeper than `tiersOf` can dress. Neither is a
      // statement about a riverbank: nobody retains a river, the bank is the
      // terrain's own scarp, and a channel eight deep is not an unserviceable
      // seam, it is a channel eight deep. `dissolveTallPairs` says the same
      // thing on the fallback path — a tall pair over water is left alone
      // rather than levelled into the bed — and this is that rule stated once,
      // inside the decision. Dropping the pair drops `EDGE` **and** H1
      // together, because `solveIshikawa` derives both from this list.
      //
      // Measured (WP-E3, the compiled river quarter): with the seam priced,
      // the channel is pulled to the bank whatever else is done — 718 wet
      // columns and 86 dry cross-sections, the dam entire. With A5's three
      // clauses — no floor, no frontage, no seam — the election reproduces the
      // pre-election river and then some: **1,995 wet columns, 16 dry**
      // against the fallback path's 1,951 and 16.
      if ((atoms[a] as Atom).wet !== (atoms[b] as Atom).wet) continue;
      const key = Math.min(a, b) * n + Math.max(a, b);
      contact.set(key, (contact.get(key) ?? 0) + 1);
    }
  }
  // Each unordered pair is counted twice by the walk above (once from each
  // side) and both counts are the same set of column pairs: halve, so `n_ab` is
  // the shared 4-neighbour column pairs §1.2 names.
  const pairs: { a: number; b: number; nab: number }[] = [];
  for (const key of [...contact.keys()].sort((x, y) => x - y)) {
    const a = Math.floor(key / n);
    const b = key % n;
    pairs.push({ a, b, nab: (contact.get(key) as number) / 2 });
  }

  return { atoms, ground, front, pairs, wet, lo, hi, overSpan, a3Merges, a4Merges, blockMedian };
}

/**
 * **One block, elected.** §3.1's partition, §3.3's domain, §3.4's exact
 * minimisation, §3.6's record.
 */
export function electBlock(input: ElectionInput): BlockElection {
  const problem = buildProblem(input);
  const { atoms, ground, front, pairs, wet, lo, hi, overSpan, a3Merges, a4Merges } = problem;
  const n = atoms.length;
  const K = hi - lo + 1;

  /* --- §1.2: the unary terms ----------------------------------------------- */
  const unary: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(K);
    const g = ground[i] as ReadonlyMap<number, number>;
    const f = front[i] as ReadonlyMap<number, number>;
    for (let j = 0; j < K; j++) {
      const L = lo + j;
      let cost = 0;
      for (const [p, cnt] of g) cost += cnt * GROUND(L, p);
      for (const [s, cnt] of f) cost += cnt * FRONTAGE(L, s);
      row[j] = cost;
    }
    unary.push(row);
  }

  const levels =
    K <= 1 || n === 0
      ? new Array<number>(n).fill(lo)
      : solveIshikawa(n, K, lo, unary, pairs, wet, input.waterFloor);

  /* --- §3.6: the record ---------------------------------------------------- */
  const records: AtomRecord[] = [];
  for (const [i, atom] of atoms.entries()) {
    const chosen = levels[i] as number;
    const g = ground[i] as ReadonlyMap<number, number>;
    const f = front[i] as ReadonlyMap<number, number>;
    let frontageColumns = 0;
    for (const cnt of f.values()) frontageColumns += cnt;
    const med = atom.cells.map(input.pristineAt).sort((x, y) => x - y);
    const terms: TermLine[] = [];
    for (const L of [chosen - 1, chosen, chosen + 1]) {
      let cut = 0;
      let fill = 0;
      for (const [p, cnt] of g) {
        if (L < p) cut += cnt * CUT_W * (p - L);
        else fill += cnt * FILL_W * (L - p);
      }
      let low = 0;
      let high = 0;
      for (const [s, cnt] of f) {
        if (L < s) low += cnt * FRONTAGE(L, s);
        else if (L > s) high += cnt * FRONTAGE(L, s);
      }
      let edge = 0;
      for (const p of pairs) {
        if (p.a === i) edge += p.nab * EDGE(L - (levels[p.b] as number));
        else if (p.b === i) edge += p.nab * EDGE(L - (levels[p.a] as number));
      }
      const parts: readonly (readonly [string, number])[] = [
        ["cut", cut],
        ["fill", fill],
        ["frontage.low", low],
        ["frontage.high", high],
        ["edge", edge],
      ];
      let dominant = "none";
      let bestV = -1;
      for (const [name, v] of parts) if (v > bestV) ((bestV = v), (dominant = v > 0 ? name : "none"));
      terms.push({
        level: L,
        cut,
        fill,
        frontageLow: low,
        frontageHigh: high,
        edge,
        total: cut + fill + low + high + edge,
        dominant,
      });
    }
    records.push({
      id: `${input.id}.${i}`,
      columns: atom.cells.length,
      pristineMedian: med.length === 0 ? 0 : (med[med.length >> 1] as number),
      domain: [lo, hi],
      frontageColumns,
      level: chosen,
      terms,
    });
  }

  return {
    atoms: atoms.map((atom, i) => ({
      id: `${input.id}.${i}`,
      cells: atom.cells,
      level: levels[i] as number,
    })),
    record: {
      id: input.id,
      atoms: records,
      a3Merges,
      a4Merges,
      overSpan,
      nodes: n * (K - 1),
      domain: [lo, hi],
    },
  };
}

/**
 * **The exact minimisation** — §3.4 S1–S3.
 *
 * Node `(i, l)` encodes `L_i > l`; source side means the bit is set, so a
 * *smaller* source set is a *lower* assignment and the minimal min-cut is the
 * lowest optimum. The unary column's capacities are `U_i`'s successive
 * differences, the pairwise arcs are `EDGE`'s **second** differences — which
 * are non-negative exactly because `EDGE` is convex — and both are carried in
 * units of ½ (the whole graph is scaled by 2) so every capacity is an integer.
 *
 * The unary carries a compensating term per incident pair: writing `θ` for
 * `n_ab·EDGE`, the double sum of second differences over the two chains equals
 * `2θ(L_a − L_b)` **less** `θ(K−1−j) + θ(j)` for each endpoint and **plus**
 * `2θ(K−1)`; those corrections are themselves convex in `j`, so folding them
 * into the unary column preserves the construction.
 */
function solveIshikawa(
  n: number,
  K: number,
  lo: number,
  unary: readonly (readonly number[])[],
  pairs: readonly { a: number; b: number; nab: number }[],
  wet: readonly boolean[],
  waterFloor: number | undefined,
): number[] {
  const rows = K - 1;
  const nodeOf = (i: number, l: number): number => i * rows + l;
  const S = n * rows;
  const T = S + 1;
  const nodes = T + 1;

  /** `EDGE`'s second difference, scaled by 2 — an integer, and `≥ 0`. */
  const g2 = (t: number): number => EDGE(t + 1) - 2 * EDGE(t) + EDGE(t - 1);

  // Two passes: finite capacities first (so `INF` can exceed their sum), then
  // the constraint arcs (§3.4 S1: "no legal assignment pays one").
  const from: number[] = [];
  const to: number[] = [];
  const finite: number[] = [];
  const infinite: boolean[] = [];
  let finiteSum = 0;
  const arc = (u: number, v: number, cap: number, inf: boolean): void => {
    if (cap === 0 && !inf) return;
    from.push(u);
    to.push(v);
    finite.push(cap);
    infinite.push(inf);
    finiteSum += cap;
  };

  /* --- unary, with the pairwise compensation folded in --------------------- */
  const scaled: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(K);
    for (let j = 0; j < K; j++) {
      let v = 2 * ((unary[i] as readonly number[])[j] as number);
      for (const p of pairs) {
        if (p.a !== i && p.b !== i) continue;
        v += p.nab * (EDGE(K - 1 - j) + EDGE(j));
      }
      row[j] = v;
    }
    scaled.push(row);
  }
  for (let i = 0; i < n; i++) {
    const row = scaled[i] as number[];
    for (let l = 0; l < rows; l++) {
      const d = (row[l + 1] as number) - (row[l] as number);
      if (d >= 0) arc(nodeOf(i, l), T, d, false);
      else arc(S, nodeOf(i, l), -d, false);
    }
  }

  /* --- pairwise ------------------------------------------------------------ */
  for (const p of pairs) {
    for (let l = 0; l < rows; l++) {
      for (let m = 0; m < rows; m++) {
        arc(nodeOf(p.a, l), nodeOf(p.b, m), p.nab * g2(l - m), false);
        arc(nodeOf(p.b, m), nodeOf(p.a, l), p.nab * g2(m - l), false);
      }
    }
  }

  const INF = 1 + finiteSum;

  /* --- monotonicity down each atom's column -------------------------------- */
  for (let i = 0; i < n; i++) for (let l = 0; l + 1 < rows; l++) arc(nodeOf(i, l + 1), nodeOf(i, l), 0, true);

  /* --- H1: serviceability -------------------------------------------------- */
  for (const p of pairs) {
    for (let l = 0; l < rows; l++) {
      for (let m = 0; m < rows; m++) {
        if (l - m >= SEAM_DROP_MAX) arc(nodeOf(p.a, l), nodeOf(p.b, m), 0, true);
        if (m - l >= SEAM_DROP_MAX) arc(nodeOf(p.b, m), nodeOf(p.a, l), 0, true);
      }
    }
  }

  /* --- H2: the waterline floor, on dry atoms only -------------------------- */
  if (waterFloor !== undefined) {
    for (let i = 0; i < n; i++) {
      if (wet[i] === true) continue;
      const forced = Math.min(rows, waterFloor - lo);
      for (let l = 0; l < forced; l++) arc(S, nodeOf(i, l), 0, true);
    }
  }

  /* --- Dinic --------------------------------------------------------------- */
  const m = from.length;
  const head = new Int32Array(nodes).fill(-1);
  const next = new Int32Array(2 * m);
  const dest = new Int32Array(2 * m);
  const cap = new Float64Array(2 * m);
  let arcs = 0;
  const push = (u: number, v: number, c: number): void => {
    dest[arcs] = v;
    cap[arcs] = c;
    next[arcs] = head[u] as number;
    head[u] = arcs++;
    dest[arcs] = u;
    cap[arcs] = 0;
    next[arcs] = head[v] as number;
    head[v] = arcs++;
  };
  for (let e = 0; e < m; e++) {
    push(from[e] as number, to[e] as number, (finite[e] as number) + (infinite[e] === true ? INF : 0));
  }

  const level = new Int32Array(nodes);
  const iter = new Int32Array(nodes);
  const queue = new Int32Array(nodes);
  const bfs = (): boolean => {
    level.fill(-1);
    let head0 = 0;
    let tail = 0;
    level[S] = 0;
    queue[tail++] = S;
    while (head0 < tail) {
      const u = queue[head0++] as number;
      for (let e = head[u] as number; e >= 0; e = next[e] as number) {
        const v = dest[e] as number;
        if ((cap[e] as number) <= 0 || (level[v] as number) >= 0) continue;
        level[v] = (level[u] as number) + 1;
        queue[tail++] = v;
      }
    }
    return (level[T] as number) >= 0;
  };
  const dfs = (u: number, f: number): number => {
    if (u === T) return f;
    for (let e = iter[u] as number; e >= 0; e = next[e] as number) {
      iter[u] = e;
      const v = dest[e] as number;
      if ((cap[e] as number) <= 0 || (level[v] as number) !== (level[u] as number) + 1) continue;
      const d = dfs(v, Math.min(f, cap[e] as number));
      if (d > 0) {
        cap[e] = (cap[e] as number) - d;
        cap[e ^ 1] = (cap[e ^ 1] as number) + d;
        return d;
      }
    }
    iter[u] = -1;
    return 0;
  };
  for (let guard = 0; bfs() && guard < 4 * nodes + 64; guard++) {
    for (let u = 0; u < nodes; u++) iter[u] = head[u] as number;
    for (;;) {
      const f = dfs(S, Number.POSITIVE_INFINITY);
      if (f <= 0) break;
    }
  }

  /* --- S3: the minimal cut is the source-side reachable set ---------------- */
  const reach = new Uint8Array(nodes);
  {
    let head0 = 0;
    let tail = 0;
    reach[S] = 1;
    queue[tail++] = S;
    while (head0 < tail) {
      const u = queue[head0++] as number;
      for (let e = head[u] as number; e >= 0; e = next[e] as number) {
        const v = dest[e] as number;
        if ((cap[e] as number) <= 0 || reach[v] === 1) continue;
        reach[v] = 1;
        queue[tail++] = v;
      }
    }
  }
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let j = 0;
    for (let l = 0; l < rows; l++) if (reach[nodeOf(i, l)] === 1) j += 1;
    out[i] = lo + j;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the oracle — §3.4 S4                                                        */
/* -------------------------------------------------------------------------- */

/** The objective of §1.2, evaluated directly. Used by the brute-force oracle. */
export function objectiveOf(
  levels: readonly number[],
  ground: readonly ReadonlyMap<number, number>[],
  front: readonly ReadonlyMap<number, number>[],
  pairs: readonly { a: number; b: number; nab: number }[],
): number {
  let total = 0;
  for (const [i, L] of levels.entries()) {
    for (const [p, cnt] of ground[i] as ReadonlyMap<number, number>) total += cnt * GROUND(L, p);
    for (const [s, cnt] of front[i] as ReadonlyMap<number, number>) total += cnt * FRONTAGE(L, s);
  }
  for (const p of pairs) total += p.nab * EDGE((levels[p.a] as number) - (levels[p.b] as number));
  return total;
}
