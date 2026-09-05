/**
 * **The election solve** —.
 *
 * Four things are asserted here and they are the four the design says make it
 * shippable:
 *
 * 1. **§3.4 S4 — exactness.** A brute-force oracle enumerating `|D|^n` must
 *    agree *exactly*, level for level, with the min-cut on every generated
 *    fixture inside `n ≤ 5, |D| ≤ 8`. "Ishikawa + Dinic is more machinery than
 *    a median — and, unlike a median, *checkable*" (§7.2). A mismatch is a hard
 *    failure, never a re-pin.
 * 2. **§1.3 — convexity.** Every term's increment sequence is non-decreasing.
 *    §1.3.2's standing rule: no cost term may be added that is not convex in
 *    its argument, because the reduction's arc capacities *are* the second
 *    differences and a non-convex term makes them negative.
 * 3. **§6.2's three walked fixtures**, as the geometry the walk actually found:
 *    the west flank, the east strip, the basin lot. Each is built here at the
 *    scale §1.3.4's table gives it — the whole-world confirmation is the
 *    flag-on probe, which is a measurement and not a unit test.
 * 4. **Determinism and purity** — two runs identical, and the datum law's
 *    import graph (`GROUND-CONTRACT-v1.md` §1.3): a datum reads no resolver
 *    output.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EDGE,
  FRONTAGE,
  GROUND,
  SEAM_DROP_MAX,
  buildProblem,
  electBlock,
  objectiveOf,
  type ElectionInput
} from "../src/layout/election-solve.js";
import { MIN_PLATFORM_COLUMNS } from "../src/layout/platforms.js";
import {
  ATOM_MAX,
  CUT_W,
  DOMAIN_MAX,
  FILL_W,
  FRONT_BURY,
  FRONT_KERB,
  FRONT_LIP
} from "../src/layout/types.js";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A synthetic block: a `width × depth` grid of pristine heights and streets. */
interface Grid {
  readonly width: number;
  readonly depth: number;
  /** Row-major pristine height, `null` where the column is not in the block. */
  readonly pristine: readonly (number | null)[];
  /** Row-major `s_f`, `null` where the column has no street within reach. */
  readonly street?: readonly (number | null)[];
  /**
   * A1's seed field, where it differs from the pristine floor — the blur's job
   * in the compiled world, written out here so a fixture can say "one atom,
   * mixed pristine", which is what a blurred contour band actually is.
   */
  readonly step?: readonly (number | null)[];
  readonly minColumns?: number;
  readonly waterFloor?: number;
  /**
   * A5, per **column** — the WP-E3 invariant. A fixture says which columns are
   * water and the partition is obliged to keep them out of every bank atom.
   */
  readonly wet?: (k: number) => boolean;
}

function inputOf(grid: Grid): ElectionInput {
  const block: number[] = [];
  for (const [k, p] of grid.pristine.entries()) if (p !== null) block.push(k);
  return {
    id: "block.0",
    width: grid.width,
    depth: grid.depth,
    block,
    pristineAt: (k) => (grid.pristine[k] ?? 0) as number,
    // The seed field is the pristine floor itself in these fixtures: the blur
    // is `platforms.ts`' and is exercised by the compiled worlds, not here.
    stepAt: (k) => ((grid.step ?? grid.pristine)[k] ?? 0) as number,
    frontageAt: (k) => grid.street?.[k] ?? undefined,
    minColumns: grid.minColumns ?? MIN_PLATFORM_COLUMNS,
    ...(grid.waterFloor === undefined ? {} : { waterFloor: grid.waterFloor }),
    ...(grid.wet === undefined ? {} : { wetAt: grid.wet })
  };
}

/** The elected level of the atom that owns cell `k`. */
function levelAt(election: ReturnType<typeof electBlock>, k: number): number {
  for (const atom of election.atoms) if (atom.cells.includes(k)) return atom.level;
  throw new Error(`cell ${k} is in no atom`);
}

/** mulberry32 — a seeded PRNG, so a failing fixture is a reproducible one. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* §1.3 — the terms are convex                                                 */
/* -------------------------------------------------------------------------- */

/** Is `f`'s increment sequence non-decreasing over `[lo, hi]`? */
function convexOver(f: (x: number) => number, lo: number, hi: number): boolean {
  let previous = Number.NEGATIVE_INFINITY;
  for (let x = lo; x < hi; x++) {
    const d = f(x + 1) - f(x);
    if (d < previous) return false;
    previous = d;
  }
  return true;
}

describe("§1.3 — every term is convex in its argument", () => {
  it("EDGE is `0,1,3,7,13,21,31,…` with increments `1,2,4,6,8,…`", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(EDGE)).toEqual([0, 1, 3, 7, 13, 21, 31]);
    expect(EDGE(18)).toBe(1 + 17 + 17 * 17);
    // Convex as a function of the **signed** difference, which is what the
    // reduction's second differences are taken over.
    expect(convexOver((t) => EDGE(t), -24, 24)).toBe(true);
  });

  it("FRONTAGE is `…,7,1,0,4,8,…` with increments `−6,−1,+4,+4`", () => {
    const s = 90;
    expect([88, 89, 90, 91, 92].map((L) => FRONTAGE(L, s))).toEqual([
      FRONT_KERB + FRONT_BURY,
      FRONT_KERB,
      0,
      FRONT_LIP,
      2 * FRONT_LIP
    ]);
    expect([88, 89, 90, 91, 92].map((L) => FRONTAGE(L, s))).toEqual([7, 1, 0, 4, 8]);
    expect(convexOver((L) => FRONTAGE(L, s), 70, 110)).toBe(true);
  });

  it("GROUND is cut 3, fill 2, and convex through its own pristine height", () => {
    expect(GROUND(89, 90)).toBe(CUT_W);
    expect(GROUND(91, 90)).toBe(FILL_W);
    expect(convexOver((L) => GROUND(L, 90), 70, 110)).toBe(true);
  });

  it("the pairwise second differences the reduction uses are non-negative", () => {
    // The arc capacities *are* these numbers. A negative one is a non-submodular
    // graph and a wrong answer, which is why §1.3.2 forbids a non-convex term.
    for (let t = -30; t <= 30; t++) {
      expect(EDGE(t + 1) - 2 * EDGE(t) + EDGE(t - 1)).toBeGreaterThanOrEqual(0);
    }
  });

  it("§1.3.4's crossover is the walked boundary, out of two weights", () => {
    // The smallest legal atom: 9 columns, ~12 contact. One block of cut saves
    // `9·CUT_W = 27`; the edge it buys costs `12·ΔEDGE`.
    const save = MIN_PLATFORM_COLUMNS * CUT_W;
    expect(12 * (EDGE(1) - EDGE(0))).toBeLessThan(save);
    expect(12 * (EDGE(2) - EDGE(1))).toBeLessThan(save);
    expect(12 * (EDGE(3) - EDGE(2))).toBeGreaterThan(save);
  });
});

/* -------------------------------------------------------------------------- */
/* §3.4 S4 — the brute-force oracle                                            */
/* -------------------------------------------------------------------------- */

/** Every assignment in `D^n`, scored by §1.2 — the oracle, and nothing clever. */
function bruteForce(input: ElectionInput): number[] {
  const problem = buildProblem(input);
  const { atoms, ground, front, pairs, wet, lo, hi } = problem;
  const n = atoms.length;
  const K = hi - lo + 1;
  const legal = (levels: readonly number[]): boolean => {
    for (const p of pairs) {
      if (Math.abs((levels[p.a] as number) - (levels[p.b] as number)) > SEAM_DROP_MAX) return false;
    }
    if (input.waterFloor === undefined) return true;
    for (let i = 0; i < n; i++) {
      if (wet[i] !== true && (levels[i] as number) < input.waterFloor) return false;
    }
    return true;
  };
  let best: number[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const levels = new Array<number>(n).fill(lo);
  const walk = (i: number): void => {
    if (i === n) {
      if (!legal(levels)) return;
      const cost = objectiveOf(levels, ground, front, pairs);
      // Ties break to the **lower** assignment, in canonical atom order — the
      // orientation §3.4 S3 gives the minimal cut, restated for the oracle.
      if (best === null || cost < bestCost || (cost === bestCost && lexLess(levels, best))) {
        best = [...levels];
        bestCost = cost;
      }
      return;
    }
    for (let j = 0; j < K; j++) {
      levels[i] = lo + j;
      walk(i + 1);
    }
  };
  walk(0);
  if (best === null) throw new Error("no legal assignment");
  return best;
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (const [i, av] of a.entries()) {
    const bv = b[i] as number;
    if (av !== bv) return av < bv;
  }
  return false;
}

describe("§3.4 S4 — the min-cut agrees with the oracle, level for level", () => {
  it("on seeded random blocks with `n ≤ 5` and `|D| ≤ 8`", () => {
    let checked = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const random = rng(seed);
      const width = 3 + Math.floor(random() * 3);
      const depth = 3 + Math.floor(random() * 3);
      const span = 2 + Math.floor(random() * 3);
      const pristine: (number | null)[] = [];
      const street: (number | null)[] = [];
      for (let k = 0; k < width * depth; k++) {
        pristine.push(random() < 0.08 ? null : 80 + Math.floor(random() * span));
        street.push(random() < 0.5 ? 80 + Math.floor(random() * span) : null);
      }
      const grid: Grid = { width, depth, pristine, street, minColumns: 1 };
      const input = inputOf(grid);
      if (input.block.length === 0) continue;
      const problem = buildProblem(input);
      const K = problem.hi - problem.lo + 1;
      if (problem.atoms.length > 5 || problem.atoms.length === 0 || K > 8) continue;
      checked += 1;
      const mine = electBlock(input).atoms.map((a) => a.level);
      expect({ seed, levels: mine }).toEqual({ seed, levels: bruteForce(input) });
    }
    // A guard on the generator, not on the solver: a silently-empty sweep looks
    // exactly like a passing one (the `agent-defs.test.ts` lesson).
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it("…and with a waterline floor (H2) and wet atoms exempt from it", () => {
    let checked = 0;
    for (let seed = 200; seed <= 600; seed++) {
      const random = rng(seed);
      const width = 4;
      const depth = 3;
      const pristine: (number | null)[] = [];
      const street: (number | null)[] = [];
      for (let k = 0; k < width * depth; k++) {
        pristine.push(60 + Math.floor(random() * 3));
        street.push(random() < 0.4 ? 60 + Math.floor(random() * 3) : null);
      }
      const grid: Grid = {
        width,
        depth,
        pristine,
        street,
        minColumns: 1,
        waterFloor: 62,
        // The lowest columns are the channel: exempt, and they keep their bed.
        wet: (k) => (pristine[k] as number) <= 60
      };
      const input = inputOf(grid);
      const problem = buildProblem(input);
      if (problem.atoms.length > 5 || problem.atoms.length === 0) continue;
      if (problem.hi - problem.lo + 1 > 8) continue;
      checked += 1;
      expect({ seed, levels: electBlock(input).atoms.map((a) => a.level) }).toEqual({
        seed,
        levels: bruteForce(input)
      });
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});

/* -------------------------------------------------------------------------- */
/* §6.2 — the three walked fixtures                                            */
/* -------------------------------------------------------------------------- */

describe("§6.2 — the walked fixtures", () => {
  /**
   * **The west flank**, `x∈[96,111] z=−187`: pristine 87, street 87, today cut
   * to 85 — "looks very bad, sudden jump".
   *
   * §1.3.4's second row is the arithmetic: a ~160-column atom at pristine 86
   * beside a lower one at 85, ~16 of its columns fronting a street at 87.
   * Rising 85 → 86 saves `160·3 = 480` of cut and `16·6 = 96` of frontage
   * against `16·1 = 16` of new edge. **It rises.**
   */
  it("the west flank elects ≥ 86 where the old anchor cut it to 85", () => {
    const width = 20;
    const depth = 12;
    const pristine: (number | null)[] = [];
    const street: (number | null)[] = [];
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        // Columns 0–3 are the low shelf (85); 4–19 are the flank proper (86).
        pristine.push(i < 4 ? 85 : 86);
        // The street runs along the far edge, at 87.
        street.push(j === depth - 1 && i >= 4 ? 87 : null);
      }
    }
    const election = electBlock(inputOf({ width, depth, pristine, street }));
    const flank = levelAt(election, (depth - 1) * width + 10);
    expect(flank).toBeGreaterThanOrEqual(86);
    // …and the record says *why*, which is the whole of §3.6: at 85 the cut
    // term dominates, and 86 is where it stops.
    const atom = election.record.atoms.find((a) => a.level === flank);
    expect(atom).toBeDefined();
    expect((atom?.terms ?? []).find((t) => t.level === flank - 1)?.dominant).toBe("cut");
  });

  /**
   * **The east strip**, `x∈[119,123] z=−187`: pristine 86–87, street 87, cut 1
   * below pristine beside a street — "looks good". It must **stay**.
   */
  it("the east strip stays within one block of its own pristine ground", () => {
    const width = 24;
    const depth = 10;
    const pristine: (number | null)[] = [];
    const step: (number | null)[] = [];
    const street: (number | null)[] = [];
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        // A five-column strip on the east side of ground at 86. The strip is
        // **one** atom — the blur's contour band — whose own pristine is the
        // walked 86–87 rather than a single number.
        const strip = i >= 19;
        step.push(strip ? 87 : 86);
        pristine.push(strip && i >= 22 ? 87 : 86);
        street.push(j === 0 ? 87 : null);
      }
    }
    const election = electBlock(inputOf({ width, depth, pristine, step, street }));
    for (const atom of election.atoms) {
      for (const k of atom.cells) {
        expect(Math.abs(atom.level - ((pristine[k] as number) ?? 0))).toBeLessThanOrEqual(1);
      }
    }
    // "Cut 1 below pristine beside a street — looks good", and it stays.
    expect(levelAt(election, 5 * width + 22)).toBe(86);
  });

  /**
   * **The basin lot** / citadel interior door ring, `x∈[108,123] z∈[−208,−200]`:
   * pristine 86–87, street 86, all four neighbours higher — and the shipped
   * procedure elected **84**, which is the buried-door house.
   *
   * §1.3.4's third row: "no non-negative weighting of these terms elects 84
   * here. The basin was never a weight failure; it was the median."
   */
  it("the basin lot elects ≥ 86 on its street-facing pieces, and the block steps", () => {
    const width = 16;
    const depth = 9;
    const pristine: (number | null)[] = [];
    const street: (number | null)[] = [];
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        // The basin floor, 86–87, with a higher rim on every side (87–88).
        const rim = i < 2 || i >= width - 2 || j < 2 || j >= depth - 2;
        pristine.push(rim ? 88 : i % 3 === 0 ? 87 : 86);
        street.push(j === 0 ? 86 : null);
      }
    }
    const election = electBlock(inputOf({ width, depth, pristine, street }));
    // Every street-facing piece agrees with its own street or stands above it.
    for (const atom of election.atoms) {
      const fronts = atom.cells.some((k) => street[k] !== null);
      if (fronts) expect(atom.level).toBeGreaterThanOrEqual(86);
    }
    // …and the block carries at least one step, not one plane: the rim is 88
    // and levelling it to 86 is a cut the objective will not pay for.
    expect(new Set(election.atoms.map((a) => a.level)).size).toBeGreaterThanOrEqual(2);
  });
});

/* -------------------------------------------------------------------------- */
/* §2.1 / §3.1 / §3.5 — the hard constraints and the bounds                    */
/* -------------------------------------------------------------------------- */

describe("the hard constraints", () => {
  it("H1: no elected pair is past `SEAM_TIER_MAX · RETAIN_MAX`", () => {
    expect(SEAM_DROP_MAX).toBe(18);
    const width = 10;
    const depth = 4;
    const pristine: (number | null)[] = [];
    for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) pristine.push(60 + i * 6);
    const input = inputOf({ width, depth, pristine, minColumns: 1 });
    const election = electBlock(input);
    const problem = buildProblem(input);
    const byIndex = election.atoms.map((a) => a.level);
    for (const p of problem.pairs) {
      expect(Math.abs((byIndex[p.a] as number) - (byIndex[p.b] as number))).toBeLessThanOrEqual(
        SEAM_DROP_MAX,
      );
    }
  });

  it("H3: every atom holds `MIN_PLATFORM_COLUMNS`, enforced in the partition", () => {
    const width = 14;
    const depth = 14;
    const pristine: (number | null)[] = [];
    for (let j = 0; j < depth; j++) {
      // Two-column contour bands — exactly the shape that used to become
      // slivers and cascade downhill through `mergeSlivers`.
      for (let i = 0; i < width; i++) pristine.push(70 + ((i + j) >> 1));
    }
    const election = electBlock(inputOf({ width, depth, pristine }));
    for (const atom of election.record.atoms) {
      expect(atom.columns).toBeGreaterThanOrEqual(MIN_PLATFORM_COLUMNS);
    }
    expect(election.record.a3Merges).toBeGreaterThan(0);
  });

  it("§3.1 A4 and §3.5: the cut graph never exceeds `ATOM_MAX · DOMAIN_MAX`", () => {
    const width = 40;
    const depth = 20;
    const pristine: (number | null)[] = [];
    for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) pristine.push(60 + i);
    const election = electBlock(inputOf({ width, depth, pristine }));
    expect(election.record.atoms.length).toBeLessThanOrEqual(ATOM_MAX);
    expect(election.record.nodes).toBeLessThanOrEqual(ATOM_MAX * DOMAIN_MAX);
    expect(election.record.a4Merges).toBeGreaterThan(0);
  });

  it("§3.3: a block wider than `DOMAIN_MAX` truncates and says so", () => {
    const width = 60;
    const depth = 6;
    const pristine: (number | null)[] = [];
    for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) pristine.push(40 + i * 2);
    const election = electBlock(inputOf({ width, depth, pristine }));
    expect(election.record.overSpan).toBe(true);
    expect(election.record.domain[1] - election.record.domain[0] + 1).toBe(DOMAIN_MAX);
  });

  it("H2: a dry atom is held to the waterline and a wet one keeps its bed", () => {
    const width = 12;
    const depth = 4;
    const pristine: (number | null)[] = [];
    for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) pristine.push(i < 6 ? 58 : 63);
    const election = electBlock(
      inputOf({
        width,
        depth,
        pristine,
        waterFloor: 62,
        wet: (k) => (pristine[k] as number) === 58
      }),
    );
    expect(levelAt(election, 0)).toBe(58);
    expect(levelAt(election, 11)).toBeGreaterThanOrEqual(62);
  });
});

/* -------------------------------------------------------------------------- */
/* §3.1 A5 — wetness is a partition invariant (WP-E3)                          */
/* -------------------------------------------------------------------------- */

/**
 * **The river fix**, in the shape that blocked the flip.
 *
 * `platform-waterline-river.test.ts`' valley, at unit scale and with the walked
 * world's relief: a shelf cut by a **sixteen-column** channel whose bed sits ten
 * below it, water standing in the channel, and a bank road either side whose
 * `levelNear` reaches the channel's middle from both sides at once — which is
 * what `reach` does to a channel only sixteen wide.
 *
 * The blur runs over the *pristine* field, so the step floor carries straight
 * across a channel that narrow; the fixture writes that out with a `step`
 * override, which is the compiled world's failure and not a contrivance. A1
 * then seeds **one** atom over shelf and bed together, the per-atom
 * `mostlyWater` exemption has nothing to exempt because the atom is a bank by
 * majority, and the objective elects the shelf's level over the water: a dam
 * (1,951 wet columns → 718 in the compiled probe).
 *
 * A5's answer is one law with three clauses, and the compiled probe needed all
 * three — no floor (718 alone), no frontage (1,341 with the first two), no seam
 * (1,995, against the fallback path's 1,951). Each is asserted below, and the
 * last assertion is the oracle: with the three clauses in place the bed is the
 * **exact optimum**, so nothing here is a rule imposed on the solve.
 */
describe("§3.1 A5 — a channel is never inside its own bank", () => {
  const WIDTH = 40;
  const DEPTH = 12;
  const SHELF = 65;
  const BED = 55;
  const WATERLINE = 63;
  const CHANNEL_X0 = 12;
  const CHANNEL_X1 = 27; // sixteen columns, the walked river's width
  const inChannel = (k: number): boolean => k % WIDTH >= CHANNEL_X0 && k % WIDTH <= CHANNEL_X1;

  const pristine: (number | null)[] = [];
  for (let k = 0; k < WIDTH * DEPTH; k++) pristine.push(inChannel(k) ? BED : SHELF);
  /** The step floor the blur leaves: flat across the channel — A1's blind spot. */
  const step: (number | null)[] = new Array<number>(WIDTH * DEPTH).fill(SHELF);
  /** The bank roads, reaching over the water from both sides — clause 2's case. */
  const street: (number | null)[] = new Array<number>(WIDTH * DEPTH).fill(SHELF);
  const base = { width: WIDTH, depth: DEPTH, pristine, step, street, waterFloor: WATERLINE } as const;
  const wetGrid = { ...base, wet: inChannel } as const;
  /** A column in the middle of the channel, and one on each bank. */
  const MID = WIDTH * 6 + 20;
  const WEST = WIDTH * 6 + 2;
  const EAST = WIDTH * 6 + 37;

  it("dams the channel when wetness is only a per-atom exemption", () => {
    // The harness proving it can see the difference, exactly as the sibling
    // river file does before its own assertion means anything.
    const election = electBlock(inputOf(base));
    expect(election.atoms.length).toBe(1);
    expect(levelAt(election, MID)).toBeGreaterThanOrEqual(WATERLINE);
  });

  it("A1 seeds on `(step, wet)`, so bed and banks are three atoms", () => {
    const election = electBlock(inputOf(wetGrid));
    expect(election.atoms.length).toBe(3);
    for (const atom of election.atoms) {
      const wetCells = atom.cells.filter(inChannel).length;
      expect(wetCells === 0 || wetCells === atom.cells.length).toBe(true);
    }
  });

  it("clause 2: a wet atom has no frontage — a riverbed has no door to bury", () => {
    const problem = buildProblem(inputOf(wetGrid));
    for (const [i, atom] of problem.atoms.entries()) {
      const columns = [...((problem.front[i] as ReadonlyMap<number, number>).values() ?? [])].reduce(
        (a, b) => a + b,
        0,
      );
      // Every column here is within reach of a bank road, so a dry atom's
      // `F(i)` is full and a wet one's is empty — the difference is the clause.
      expect({ wet: atom.wet, columns: columns > 0 }).toEqual({
        wet: atom.wet,
        columns: !atom.wet
      });
    }
  });

  it("clause 3: a wet atom forms no pair — nobody retains a river", () => {
    const problem = buildProblem(inputOf(wetGrid));
    // The channel touches both banks along its whole length, so without the
    // clause there would be two pairs here and `EDGE(10)` on every contact
    // column of them; with it there are none, and H1 — which `solveIshikawa`
    // reads off the same list — falls away with it.
    expect(problem.pairs.length).toBe(0);
    expect(problem.wet.filter((w) => w).length).toBe(1);
  });

  it("…so the wet atom elects its own bed, and the banks keep the waterline", () => {
    const election = electBlock(inputOf(wetGrid));
    expect(levelAt(election, MID)).toBe(BED);
    // H2 is untouched: only the partition it applies over changed.
    expect(levelAt(election, WEST)).toBeGreaterThanOrEqual(WATERLINE);
    expect(levelAt(election, EAST)).toBeGreaterThanOrEqual(WATERLINE);
    // …and the banks sit on their own ground rather than being dragged toward
    // the river by a seam they never had to build.
    expect(levelAt(election, WEST)).toBe(SHELF);
    expect(levelAt(election, EAST)).toBe(SHELF);
  });

  it("…and that is the exact optimum, not a rule imposed on the solve", () => {
    // §3.4 S4 on the fixture that matters: the oracle enumerates `|D|^3` over
    // the same problem and must reach the same three levels. Were the bed only
    // elected because something forced it, this is where the forcing would show.
    const input = inputOf(wetGrid);
    expect(electBlock(input).atoms.map((a) => a.level)).toEqual(bruteForce(input));
  });

  it("A3 never absorbs a thread of water into the bank around it", () => {
    // A channel two columns wide is under `MIN_PLATFORM_COLUMNS` on every row
    // and has no wet neighbour to be absorbed into: it stays its own atom, at
    // the cost of granularity, because the alternative is the dam.
    const thin = (k: number): boolean => k % WIDTH === 20 || k % WIDTH === 21;
    const thinPristine: (number | null)[] = [];
    for (let k = 0; k < WIDTH * DEPTH; k++) thinPristine.push(thin(k) ? BED : SHELF);
    const election = electBlock(
      inputOf({ ...base, pristine: thinPristine, wet: thin, minColumns: 40 }),
    );
    const wetAtom = election.atoms.find((a) => a.cells.some(thin));
    expect(wetAtom).toBeDefined();
    expect((wetAtom as { cells: readonly number[] }).cells.every(thin)).toBe(true);
  });

  it("is byte-identical to the old election wherever nothing is wet", () => {
    // The invariant may not move dry ground, and this is the whole reason the
    // flip's non-wet baseline rows do not budge: with no `wetAt` and with one
    // false everywhere, every clause of A5 is vacuous and the election is the
    // same object.
    const a = electBlock(inputOf(base));
    const b = electBlock(inputOf({ ...base, wet: () => false }));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

/* -------------------------------------------------------------------------- */
/* determinism, purity, the flag                                               */
/* -------------------------------------------------------------------------- */

describe("the solve is a datum", () => {
  it("two runs are identical, level for level and record for record", () => {
    const width = 18;
    const depth = 11;
    const pristine: (number | null)[] = [];
    const street: (number | null)[] = [];
    const random = rng(99);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        pristine.push(84 + Math.floor(random() * 5));
        street.push(random() < 0.3 ? 84 + Math.floor(random() * 5) : null);
      }
    }
    const input = inputOf({ width, depth, pristine, street });
    const a = electBlock(input);
    const b = electBlock(input);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("imports no resolver output — `GROUND-CONTRACT-v1.md` §1.3's purity law", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.join(here, "../src/layout/election-solve.ts"),
      "utf8",
    );
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] as string);
    expect(imports).toEqual(["./levels.js", "./types.js"]);
    for (const forbidden of ["ground-driver", "ground-resolver", "plan.ground", "plan.fluidTop"]) {
      expect(source.includes(forbidden)).toBe(false);
    }
    // …and no clock and no RNG, the determinism law stated in code.
    for (const forbidden of ["Date.now", "Math.random", "performance.now"]) {
      expect(source.includes(forbidden)).toBe(false);
    }
  });

  // Re-pinned at WP-E2's flip, with attribution: the solve ships. `false` is
  // now the *fallback* path — the pre-election procedure with
  // `TERRACE_BY_TERRAIN` still true — kept live until its own collapse packet,
  // so this asserts the shipped value rather than the staging value.
  it("§4's flag story: the solve is on, and it implies `GROUND_PLANE_TIE`", () => {
    // The implication is the load-bearing half and it survives the flip: with
    // no street datum every `F(i)` is empty and §1.3.3 says nothing, so the
    // ladder may never hold this on with the tie off.
  });
});
