/**
 * The **terminus landing** — `structures/roads.ts`' `terminusLandings`, and
 * Kai's Option A of 2026-08-07 stated as a unit.
 *
 * The defect it exists for was walked on `hillside_town` and diagnosed to the
 * column: a terrace street's band pinches out one column short of the flight
 * running down past it, and the verge line between them carries the whole
 * terrace riser in one step — three blocks at (5, 44), which the walkability
 * audit calls an **unserved face** because no route earns that drop with run.
 * A previous round proved it is not fixable on the verge: the street's edge and
 * the flight's treads are two 1-Lipschitz lines falling in *parallel*, so no
 * work on the column between them makes them meet. Kai's ruling is that the
 * street gives ground, and this is that rule.
 *
 * The tests below are written against the shape of the answer rather than
 * against the fixture, because the whole point of doing it here rather than
 * with a coordinate patch is that the same situation anywhere gets the same
 * landing. `test/walkability.test.ts` carries the fixture's numbers.
 */

import { describe, expect, it } from "vitest";
import type { Region } from "@terrainist/stdlib";

import {
  LANDING_MIN_DROP,
  LANDING_RUN_MAX,
  terminusLandings,
} from "../src/structures/roads.js";

const WIDTH = 12;
const DEPTH = 12;
const REGION: Region = { x0: 0, z0: 0, width: WIDTH, depth: DEPTH } as Region;

const idx = (x: number, z: number): number => z * WIDTH + x;

/** A job list shaped the way the rule reads it: role only. */
const JOBS = [
  { role: "carriageway" as const }, // 0 — the street
  { role: "steps" as const }, // 1 — the flight
  { role: "cart" as const }, // 2 — a carriage spine
];

interface Scene {
  readonly owner: Int32Array;
  readonly columnY: Int32Array;
  readonly blocked: Uint8Array;
  readonly paved: Uint8Array;
  readonly water: Uint8Array;
}

function scene(): Scene {
  return {
    owner: new Int32Array(WIDTH * DEPTH).fill(-1),
    columnY: new Int32Array(WIDTH * DEPTH),
    blocked: new Uint8Array(WIDTH * DEPTH),
    paved: new Uint8Array(WIDTH * DEPTH),
    water: new Uint8Array(WIDTH * DEPTH),
  };
}

const run = (s: Scene, jobs: readonly { readonly role: "carriageway" | "steps" | "cart" }[] = JOBS) =>
  terminusLandings(REGION, jobs, s.owner, s.columnY, s.blocked, s.paved, s.water);

/**
 * The walked geometry, reduced: a flight in column `x = 1` falling one block per
 * row, an **unowned verge** at `x = 2` beside it, and a street plane at 116 from
 * `x = 3` east. The verge is what makes this the hard case — the column between
 * the two is nobody's, so a rule that seeded on flight *ownership* alone would
 * never fire at the one place it is needed.
 */
function terraceAgainstFlight(streetY = 116): Scene {
  const s = scene();
  for (let z = 0; z < DEPTH; z++) {
    s.owner[idx(1, z)] = 1;
    s.columnY[idx(1, z)] = streetY - z;
    for (let x = 3; x < WIDTH; x++) {
      s.owner[idx(x, z)] = 0;
      s.columnY[idx(x, z)] = streetY;
    }
  }
  return s;
}

describe("the terminus landing", () => {
  it("yields drop − 1 columns, one block per column, down onto the flight", () => {
    const s = terraceAgainstFlight();
    // Row 3: the flight is at 113 and the street at 116 — the three-block riser
    // the walk found, and the row the landing has to open.
    expect(s.columnY[idx(1, 3)]).toBe(113);
    const landing = run(s);
    expect(landing.get(idx(3, 3))).toBe(114);
    expect(landing.get(idx(4, 3))).toBe(115);
    // …and the column behind them is already at the level the stair arrives at,
    // so the terrace does not move. `drop − 1` is the whole rule: the run is
    // derived from the geometry, never from a constant.
    expect(landing.has(idx(5, 3))).toBe(false);
  });

  it("never raises, and never steps more than a block at a time", () => {
    const s = terraceAgainstFlight();
    const landing = run(s);
    expect(landing.size).toBeGreaterThan(0);
    for (const [k, y] of landing) {
      expect(y).toBeLessThan(s.columnY[k] as number);
      const x = k % WIDTH;
      const z = (k - x) / WIDTH;
      // Every 4-neighbour that is also street ends up within one block: the
      // landing is a staircase joined to the plane it cuts into, which is what
      // stops it trading an unserved face for an orphan.
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= WIDTH || nz >= DEPTH) continue;
        const n = idx(nx, nz);
        if (s.owner[n] !== 0) continue;
        const there = landing.get(n) ?? (s.columnY[n] as number);
        expect(Math.abs(there - y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("leaves a drop under the threshold alone", () => {
    const s = scene();
    for (let z = 0; z < DEPTH; z++) {
      s.owner[idx(1, z)] = 1;
      s.columnY[idx(1, z)] = 116 - (LANDING_MIN_DROP - 1);
      for (let x = 3; x < WIDTH; x++) {
        s.owner[idx(x, z)] = 0;
        s.columnY[idx(x, z)] = 116;
      }
    }
    expect(run(s).size).toBe(0);
  });

  it("is not spent on a carriage spine, which meets its streets at junctions", () => {
    const s = terraceAgainstFlight();
    for (let z = 0; z < DEPTH; z++) s.owner[idx(1, z)] = 2; // cart, not steps
    expect(run(s).size).toBe(0);
  });

  it("does nothing at all in a town with no flight in it", () => {
    const s = terraceAgainstFlight();
    for (let z = 0; z < DEPTH; z++) {
      s.owner[idx(1, z)] = -1;
      s.columnY[idx(1, z)] = 0;
    }
    // The early out is what keeps a flat world byte-identical: no flight, no
    // corridor, no walk, no map.
    expect(run(s).size).toBe(0);
  });

  it("cuts no deeper than the tread law may, and clamps rather than refuses", () => {
    // A cliff of a riser: the flight is far below the street. The landing is
    // still laid, and it still stops at `LANDING_RUN_MAX` — the remainder
    // belongs to the wall that was always going to hold it. Refusing instead of
    // clamping is what would cut a cliff of the rule's own, beside the landing
    // it declined to lay.
    const s = scene();
    for (let z = 0; z < DEPTH; z++) {
      s.owner[idx(1, z)] = 1;
      s.columnY[idx(1, z)] = 116 - LANDING_RUN_MAX - 4;
      for (let x = 3; x < WIDTH; x++) {
        s.owner[idx(x, z)] = 0;
        s.columnY[idx(x, z)] = 116;
      }
    }
    const landing = run(s);
    expect(landing.size).toBeGreaterThan(0);
    for (const y of landing.values()) expect(116 - y).toBeLessThanOrEqual(LANDING_RUN_MAX);
  });

  it("never moves ground this pass may not move", () => {
    const s = terraceAgainstFlight();
    for (let z = 0; z < DEPTH; z++) s.blocked[idx(3, z)] = 1;
    const landing = run(s);
    for (const k of landing.keys()) expect(s.blocked[k]).toBe(0);
    // A footprint against the verge stops the landing dead rather than routing
    // round it: the column beside the flight is the only seed, and it is not a
    // column this pass owns the ground under.
    expect(landing.size).toBe(0);
  });
});
