/**
 * A pad's foundation and the street datum must materialise ground by **the same
 * rule**, and that rule is `clampY(Math.floor(field))`.
 *
 * `referenceY` used to answer `Math.round(stats.median)`. On dead flat ground
 * whose surface block is 93 the continuous field sits anywhere in [93, 94), so
 * roughly half of all flat sites rounded *up* to 94 and the node shipped
 * standing on a one-block plinth with no ramp to it — the defect Kai condemned
 * on two walks (the Trojan horse, the unicorn monument).
 *
 * These tests assert the rule against `clampY` and against
 * `materialisedGround` — the street datum's own sampler — rather than against a
 * copied constant, so pads and streets cannot drift apart.
 */

import { describe, expect, it } from "vitest";

import {
  HeightField,
  SurfaceClass,
  type Classification,
  type Region,
} from "@terrainist/stdlib";

import { referenceY } from "../src/layout/solve.js";
import { materialisedGround } from "../src/layout/street-datum.js";
import { footprintStats } from "../src/layout/fitness.js";
import { clampY } from "../src/terrain/columns.js";
import type { LayoutNodeInput } from "../src/layout/types.js";
import type { FootprintStats } from "../src/layout/fitness.js";

function region(size = 32): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function field(r: Region, h: (x: number, z: number) => number): HeightField {
  const f = new HeightField(r);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      f.values[j * r.width + i] = h(r.x0 + i, r.z0 + j);
    }
  }
  return f;
}

function landClassification(r: Region): Classification {
  const n = r.width * r.depth;
  const classes = new Uint8Array(n).fill(SurfaceClass.LAND);
  return {
    region: r,
    classes,
    slopes: new Float32Array(n),
  } as unknown as Classification;
}

function node(reference?: string): LayoutNodeInput {
  return {
    id: "n",
    nodePath: "world.n",
    kind: "generator",
    generator: "building.grammar@0",
    size: [8, 8, 8],
    constraints:
      reference === undefined
        ? []
        : [{ type: "terrain_conform", reference } as never],
  } as unknown as LayoutNodeInput;
}

function statsOf(over: Partial<FootprintStats>): FootprintStats {
  return {
    median: 0,
    mean: 0,
    min: 0,
    max: 0,
    deviation: 0,
    meanSlope: 0,
    maxSlope: 0,
    hazard: false,
    outOfRegion: false,
    columns: 1,
    ...over,
  } as FootprintStats;
}

describe("pad foundation: the materialisation rule", () => {
  it("floors a fractional statistic instead of rounding it", () => {
    // 93.6 is a column whose surface block is 93. The old `Math.round` said 94
    // and that one block is the plinth.
    expect(referenceY(node(), statsOf({ median: 93.6 }))).toBe(93);
    expect(referenceY(node(), statsOf({ median: 93.0 }))).toBe(93);
    expect(referenceY(node(), statsOf({ median: 93.999 }))).toBe(93);
  });

  it("uses the same rule for every `reference` mode", () => {
    const s = statsOf({ median: 70.7, mean: 71.4, min: 68.9, max: 75.5 });
    expect(referenceY(node("median"), s)).toBe(70);
    expect(referenceY(node("mean"), s)).toBe(71);
    expect(referenceY(node("min"), s)).toBe(68);
    expect(referenceY(node("max"), s)).toBe(75);
  });

  it("is `clampY(Math.floor(v))` and not a copy of it", () => {
    for (const v of [-1e6, -64.2, 0.5, 63.5, 93.5, 1e6]) {
      expect(referenceY(node(), statsOf({ median: v }))).toBe(clampY(Math.floor(v)));
    }
  });

  it("seats a pad on flat ground at the block the terrain pass writes there", () => {
    // Dead flat: every column's field value is 93.6, every surface block 93.
    const r = region();
    const f = field(r, () => 93.6);
    const ground = materialisedGround(r, f);
    const stats = footprintStats(f, landClassification(r), {
      x0: -4,
      z0: -4,
      x1: 3,
      z1: 3,
    });
    const y = referenceY(node(), stats);
    // The datum's sampler and the pad's foundation agree exactly — no plinth.
    for (const g of ground) expect(g).toBe(y);
  });
});
