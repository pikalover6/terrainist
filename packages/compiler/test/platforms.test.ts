/**
 * **The election pays for its own seams** — `docs/GROUND-UNIFICATION-v0.md`
 * §4.1 S6, wave 11C.
 *
 * Three rules, one per describe block:
 *
 * 1. a piece's level comes from the **bucket that defined it**, so two
 *    4-adjacent pieces are never more than one storey apart (§4.0a M4);
 * 2. a sliver under `MIN_PLATFORM_COLUMNS` **merges** into the neighbour it
 *    touches most instead of staying natural ground inside levelled ground
 *    (§4.0a M5);
 * 3. a pair past `SEAM_TIER_MAX · RETAIN_MAX` **dissolves**, and that is the
 *    first caller `LOAM-W410 LEVEL_DISSOLVED` has ever had (§4.0a M7).
 *
 * Everything here is off the global flag: `derivePlatforms` takes a `tiered`
 * parameter so the flag-on election can be exercised without flipping
 * `SEAM_TIERS`, which stays `false` until 11F's walk verdict. The first test
 * below is the standing rule in code — **prove the harness can see a difference
 * before trusting that it saw none**: flag-on and flag-off disagree on the same
 * field, so the byte-identity claim is a measurement rather than a hope.
 */

import { describe, expect, it } from "vitest";

import type { HeightField } from "@terrainist/stdlib";

import { FLOOR_HEIGHT } from "../src/layout/district.js";
import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import {
  DISSOLVE_DROP_MAX,
  MIN_PLATFORM_COLUMNS,
  derivePlatforms,
  dissolveTallPairs,
} from "../src/layout/platforms.js";
import { SEAM_TIERS } from "../src/layout/types.js";

/* -------------------------------------------------------------------------- */
/* a quarter on a ramp                                                         */
/* -------------------------------------------------------------------------- */

const SIDE = 40;
const BOUNDS: Rect = { x0: 0, z0: 0, x1: SIDE - 1, z1: SIDE - 1 };

/**
 * A hill with a ridge down it: two flanks falling away from `x = 20` and a
 * gentler fall along `z`, which is the shape §3.3's blur was written for and
 * the one that produces both findings at once — buckets whose raw medians
 * disagree with them, and thin bucket fragments along the ridge line.
 */
function ramp(): HeightField {
  const values = new Float64Array(SIDE * SIDE);
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      values[j * SIDE + i] = 64 + Math.abs(20 - i) * 1.1 + Math.abs(20 - j) * 0.4;
    }
  }
  return {
    region: { x0: 0, z0: 0, width: SIDE, depth: SIDE },
    values,
  } as unknown as HeightField;
}

/** One block spanning the whole footprint: nothing is street. */
function free(): Uint8Array {
  return new Uint8Array(SIDE * SIDE);
}

/** Every column a bench owns, as `z * SIDE + x` over {@link BOUNDS}. */
function columnsOf(bench: FormBench): number[] {
  const out: number[] = [];
  for (const run of bench.runs) {
    for (let z = run.z0; z <= run.z1; z++) {
      for (let x = run.x0; x <= run.x1; x++) out.push(z * SIDE + x);
    }
  }
  return out;
}

/** The level at every levelled column, `-1` where the ground stayed natural. */
function levelField(benches: readonly FormBench[]): Int32Array {
  const field = new Int32Array(SIDE * SIDE).fill(-1);
  for (const bench of benches) for (const k of columnsOf(bench)) field[k] = bench.level;
  return field;
}

/* -------------------------------------------------------------------------- */

describe("the flag is off, and the harness can see that it matters", () => {
  it("ships with SEAM_TIERS false — 11F flips it, on a walk verdict and nothing else", () => {
    expect(SEAM_TIERS).toBe(false);
  });

  it("elects a different set of platforms with the rules on than with them off", () => {
    const input = { bounds: BOUNDS, blocked: free(), field: ramp() };
    const off = derivePlatforms({ ...input, tiered: false });
    const on = derivePlatforms({ ...input, tiered: true });
    expect(off.length).toBeGreaterThan(0);
    expect(JSON.stringify(on)).not.toEqual(JSON.stringify(off));
  });

  it("is the flag, not the parameter, that the compiler reads by default", () => {
    const input = { bounds: BOUNDS, blocked: free(), field: ramp() };
    expect(derivePlatforms(input)).toEqual(derivePlatforms({ ...input, tiered: SEAM_TIERS }));
  });
});

describe("S6 rule 1 — a piece's level comes from the bucket that defined it", () => {
  it("never leaves two 4-adjacent columns more than one storey apart", () => {
    const field = levelField(
      derivePlatforms({ bounds: BOUNDS, blocked: free(), field: ramp(), tiered: true }),
    );
    let worst = 0;
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const a = field[j * SIDE + i] as number;
        if (a < 0) continue;
        for (const [di, dj] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const ii = i + di;
          const jj = j + dj;
          if (ii >= SIDE || jj >= SIDE) continue;
          const b = field[jj * SIDE + ii] as number;
          if (b < 0) continue;
          worst = Math.max(worst, Math.abs(a - b));
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(FLOOR_HEIGHT);
  });

  it("puts every level on a whole storey of the quarter's own datum", () => {
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: free(),
      field: ramp(),
      tiered: true,
    });
    const levels = [...new Set(benches.map((b) => b.level))].sort((a, b) => a - b);
    expect(levels.length).toBeGreaterThan(1);
    for (const level of levels) {
      expect((level - (levels[0] as number)) % FLOOR_HEIGHT).toBe(0);
    }
  });
});

describe("S6 rule 2 — a sliver merges rather than staying natural", () => {
  it("leaves no natural column inside the levelled ground", () => {
    const blocked = free();
    const benches = derivePlatforms({ bounds: BOUNDS, blocked, field: ramp(), tiered: true });
    const field = levelField(benches);
    let natural = 0;
    for (let k = 0; k < SIDE * SIDE; k++) if (blocked[k] !== 1 && field[k] === -1) natural++;
    expect(natural).toBe(0);
  });

  it("leaves natural columns inside the levelled ground with the rules off — the finding", () => {
    const blocked = free();
    const field = levelField(
      derivePlatforms({ bounds: BOUNDS, blocked, field: ramp(), tiered: false }),
    );
    let natural = 0;
    for (let k = 0; k < SIDE * SIDE; k++) if (blocked[k] !== 1 && field[k] === -1) natural++;
    expect(natural).toBeGreaterThan(0);
  });

  it("ships no platform under MIN_PLATFORM_COLUMNS that had a neighbour to join", () => {
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: free(),
      field: ramp(),
      tiered: true,
    });
    for (const bench of benches) {
      expect(columnsOf(bench).length).toBeGreaterThanOrEqual(MIN_PLATFORM_COLUMNS);
    }
  });

  it("is deterministic: the same field elects the same platforms twice", () => {
    const once = derivePlatforms({ bounds: BOUNDS, blocked: free(), field: ramp(), tiered: true });
    const twice = derivePlatforms({ bounds: BOUNDS, blocked: free(), field: ramp(), tiered: true });
    expect(JSON.stringify(once)).toEqual(JSON.stringify(twice));
  });
});

describe("S6 rule 3 — a pair past SEAM_TIER_MAX · RETAIN_MAX dissolves", () => {
  const bounds: Rect = { x0: 0, z0: 0, x1: 9, z1: 3 };
  const pair = (high: number): FormBench[] => [
    { id: "low", runs: [{ x0: 0, z0: 0, x1: 4, z1: 3 }], level: 64 },
    { id: "high", runs: [{ x0: 5, z0: 0, x1: 9, z1: 3 }], level: 64 + high },
  ];

  it("carries the design's threshold: three faces of RETAIN_MAX", () => {
    expect(DISSOLVE_DROP_MAX).toBe(18);
  });

  it("leaves a pair at the threshold alone", () => {
    const out = dissolveTallPairs(bounds, pair(DISSOLVE_DROP_MAX));
    expect(out.dissolved).toEqual([]);
    expect(out.benches.map((b) => b.level)).toEqual([64, 64 + DISSOLVE_DROP_MAX]);
  });

  it("dissolves one block past it — the higher gives its level back to the lower", () => {
    const out = dissolveTallPairs(bounds, pair(DISSOLVE_DROP_MAX + 1));
    expect(out.dissolved).toEqual([{ id: "high", into: "low", drop: DISSOLVE_DROP_MAX + 1 }]);
    expect(out.benches.map((b) => b.level)).toEqual([64, 64]);
  });

  it("ignores a pair that is not 4-adjacent: no seam, nothing to pay for", () => {
    const apart: FormBench[] = [
      { id: "low", runs: [{ x0: 0, z0: 0, x1: 3, z1: 3 }], level: 64 },
      { id: "high", runs: [{ x0: 6, z0: 0, x1: 9, z1: 3 }], level: 64 + 40 },
    ];
    expect(dissolveTallPairs(bounds, apart).dissolved).toEqual([]);
  });

  it("settles a chain of three to a fixed point", () => {
    const chain: FormBench[] = [
      { id: "a", runs: [{ x0: 0, z0: 0, x1: 2, z1: 3 }], level: 64 },
      { id: "b", runs: [{ x0: 3, z0: 0, x1: 5, z1: 3 }], level: 64 + 30 },
      { id: "c", runs: [{ x0: 6, z0: 0, x1: 9, z1: 3 }], level: 64 + 60 },
    ];
    const out = dissolveTallPairs(bounds, chain);
    expect(out.dissolved.length).toBeGreaterThan(0);
    for (const bench of out.benches) {
      for (const other of out.benches) {
        expect(Math.abs(bench.level - other.level)).toBeLessThanOrEqual(DISSOLVE_DROP_MAX);
      }
    }
  });
});
