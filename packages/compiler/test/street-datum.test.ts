/**
 * The datum kernel — `docs/GROUND-UNIFICATION-v0.md` Part I, F2/F3/F11.
 *
 * Four properties, and each is a law rather than a golden number:
 *
 * - the graded profile is **1-Lipschitz over arc length**, which is what makes
 *   a street walkable and is inherited by every lot that ties to it;
 * - **ownership order is honoured at a crossroads** — the avenue takes the
 *   shared column and the lane arrives at the avenue's level;
 * - the sampled ground is **exactly `clampY(Math.floor(field))`**, the
 *   materialisation rule of `terrain/columns.ts`, asserted against `clampY`
 *   itself so the two cannot drift;
 * - **shuffling the segment list changes nothing**, because every decision is
 *   taken in `compareStreetRank` order.
 */

import { describe, expect, it } from "vitest";

import { HeightField, type Region } from "@terrainist/stdlib";

import {
  gradeStreetDatum,
  materialisedGround,
  type StreetDatum,
} from "../src/layout/street-datum.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import type { ArcLevels } from "../src/structures/sweep.js";
import { clampY } from "../src/terrain/columns.js";
import { index } from "../src/structures/roads.js";

const SEA = 63;
const SIZE = 64;

function region(size = SIZE): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

/** A field whose height is `h(x, z)`, sampled at every integer column. */
function field(r: Region, h: (x: number, z: number) => number): HeightField {
  const f = new HeightField(r);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      f.values[j * r.width + i] = h(r.x0 + i, r.z0 + j);
    }
  }
  return f;
}

/** A straight run between two columns, 4-connected, one axis only. */
function run(
  from: { x: number; z: number },
  to: { x: number; z: number },
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const dx = Math.sign(to.x - from.x);
  const dz = Math.sign(to.z - from.z);
  let { x, z } = from;
  out.push({ x, z });
  while (x !== to.x || z !== to.z) {
    if (x !== to.x) x += dx;
    else z += dz;
    out.push({ x, z });
  }
  return out;
}

function segment(
  id: string,
  kind: StreetSegment["kind"],
  width: number,
  path: readonly { x: number; z: number }[],
): StreetSegment {
  return { id, kind, width, path };
}

/** An east-west avenue crossed by a north-south lane at the origin. */
function crossroads(): StreetGraph {
  return {
    segments: [
      segment("avenue", "avenue", 7, run({ x: -24, z: 0 }, { x: 24, z: 0 })),
      segment("lane", "lane", 3, run({ x: 0, z: -24 }, { x: 0, z: 24 })),
    ],
    intersections: [{ x: 0, z: 0, segments: ["avenue", "lane"] }],
    sidewalk: 2,
  };
}

function grade(graph: StreetGraph, h: (x: number, z: number) => number): StreetDatum {
  const r = region();
  return gradeStreetDatum({ region: r, graph, field: field(r, h), seaLevel: SEA });
}

describe("street datum: the grade law", () => {
  it("is 1-Lipschitz over arc length on every segment", () => {
    // A hillside steeper than the grade cap, so the envelope actually bites.
    const datum = grade(crossroads(), (x, z) => 80 + x * 0.9 + z * 1.7);
    expect(datum.bySegment.size).toBe(2);
    for (const [id, levels] of datum.bySegment) {
      expect(levels.y.length).toBeGreaterThan(40);
      for (let i = 1; i < levels.y.length; i++) {
        const step = Math.abs((levels.y[i] as number) - (levels.y[i - 1] as number));
        expect({ id, i, step }).toEqual({ id, i, step: Math.min(step, 1) });
      }
    }
  });

  it("holds the natural ground where the ground is already walkable", () => {
    // Half a block of rise per block: inside the cap, band 0, no water floor,
    // so the graded level is the sampled ground exactly.
    const r = region();
    const h = (x: number, _z: number): number => 90 + x * 0.5;
    const f = field(r, h);
    const graph: StreetGraph = {
      segments: [segment("s", "street", 5, run({ x: -20, z: 4 }, { x: 20, z: 4 }))],
      intersections: [],
      sidewalk: 1,
    };
    const datum = gradeStreetDatum({ region: r, graph, field: f, seaLevel: SEA });
    const ground = materialisedGround(r, f);
    const levels = datum.bySegment.get("s") as ArcLevels;
    expect(levels).toBeDefined();
    for (const [k, p] of levels.frame.stations.entries()) {
      const at = ground[index(r, p.x, p.z)] as number;
      expect(levels.y[k]).toBe(at);
    }
  });
});

describe("street datum: the materialisation rule", () => {
  it("samples ground as clampY(Math.floor(field)) at every column", () => {
    const r = region(16);
    // Fractional, negative and out-of-world values, so `floor` and `clamp` are
    // both exercised rather than agreed with by luck.
    const f = field(r, (x, z) => 70.5 + x * 1.25 - z * 0.75);
    f.values[0] = -1e6;
    f.values[1] = 1e6;
    const ground = materialisedGround(r, f);
    for (let k = 0; k < ground.length; k++) {
      expect(ground[k]).toBe(clampY(Math.floor(f.values[k] as number)));
    }
  });

  it("grades every station from that rule and not from a rounded one", () => {
    const r = region();
    // x.5 everywhere: `Math.round` would answer one block higher than
    // `Math.floor` on every single column, which is the lip this rule kills.
    const f = field(r, () => 90.5);
    const graph: StreetGraph = {
      segments: [segment("s", "street", 5, run({ x: -20, z: 0 }, { x: 20, z: 0 }))],
      intersections: [],
      sidewalk: 1,
    };
    const datum = gradeStreetDatum({ region: r, graph, field: f, seaLevel: SEA });
    const levels = datum.bySegment.get("s") as ArcLevels;
    for (const y of levels.y) expect(y).toBe(90);
    expect(datum.levelNear(0, 0, 2)).toBe(90);
  });
});

describe("street datum: ownership", () => {
  it("gives the crossroads column to the senior segment and pins the junior", () => {
    const h = (x: number, z: number): number => 90 + x * 0.4 + z * 0.9;
    const datum = grade(crossroads(), h);
    const r = datum.region;
    const k = index(r, 0, 0);
    expect(datum.band[k]).toBe(1);

    const avenue = datum.bySegment.get("avenue") as ArcLevels;
    const lane = datum.bySegment.get("lane") as ArcLevels;

    // The avenue is 7 wide against the lane's 3, so `compareStreetRank` puts it
    // first and it owns every column of the junction.
    const avenueAt = avenue.at(avenue.frame.pathArc[avenue.frame.pathArc.length >> 1] as number);
    expect(datum.columnY[k]).toBe(avenueAt);

    // ...and the lane *arrives* at that level rather than stepping at it.
    const laneAt = lane.at(lane.frame.pathArc[lane.frame.pathArc.length >> 1] as number);
    expect(laneAt).toBe(datum.columnY[k]);
  });

  it("bands the sidewalk beside the carriageway and stops there", () => {
    const datum = grade(crossroads(), () => 90);
    const r = datum.region;
    // avenue: half-width 3, plus a 2-column sidewalk each side.
    expect(datum.band[index(r, 10, 5)]).toBe(1);
    expect(datum.band[index(r, 10, 6)]).toBe(0);
    expect(datum.columnY[index(r, 10, 6)]).toBeLessThan(0);
    expect(datum.levelNear(10, 6, 1)).toBe(90);
    expect(datum.levelNear(10, 12, 2)).toBeUndefined();
  });
});

describe("street datum: determinism", () => {
  it("does not depend on the order of the segment list", () => {
    const h = (x: number, z: number): number => 88 + x * 0.7 - z * 1.3;
    const base = crossroads();
    const many: StreetSegment[] = [
      ...base.segments,
      segment("lane-b", "lane", 3, run({ x: -12, z: -20 }, { x: -12, z: 20 })),
      segment("street-a", "street", 5, run({ x: -24, z: 12 }, { x: 24, z: 12 })),
    ];

    const forward = grade({ ...base, segments: many }, h);
    const reversed = grade({ ...base, segments: [...many].reverse() }, h);
    // A rotation as well as a reversal: a stable sort could hide a reversal.
    const rotated = grade({ ...base, segments: [...many.slice(2), ...many.slice(0, 2)] }, h);

    for (const other of [reversed, rotated]) {
      expect(Array.from(other.columnY)).toEqual(Array.from(forward.columnY));
      expect(Array.from(other.band)).toEqual(Array.from(forward.band));
      expect([...other.bySegment.keys()].sort()).toEqual([...forward.bySegment.keys()].sort());
      for (const [id, levels] of forward.bySegment) {
        expect(Array.from((other.bySegment.get(id) as ArcLevels).y)).toEqual(
          Array.from(levels.y),
        );
      }
    }
  });
});
