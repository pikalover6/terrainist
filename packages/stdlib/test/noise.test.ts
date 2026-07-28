import { describe, expect, it } from "vitest";

import { nodeSeed } from "../src/determinism/index.js";
import {
  NOISE_STACK_DEFAULTS,
  applyCurve,
  continentalnessAt,
  deriveNoiseSeeds,
  domainWarp,
  erode,
  evaluateBaseHeight,
  fbm2,
  gradientNoise2,
  resolveNoiseStackParams,
  ridged2,
} from "../src/noise/index.js";

const node = nodeSeed(813205n, "world.terrain");
const seeds = deriveNoiseSeeds(node);
const OCT = { octaves: 5, frequency: 0.01, lacunarity: 2, gain: 0.5 };

describe("gradient noise", () => {
  it("is zero on the lattice and pure in its arguments", () => {
    // Perlin-style noise vanishes at integer lattice points.
    for (let i = -3; i <= 3; i++) {
      expect(Math.abs(gradientNoise2(seeds.base, i, 2))).toBeLessThan(1e-12);
    }
    expect(gradientNoise2(seeds.base, 1.25, -3.5)).toBe(gradientNoise2(seeds.base, 1.25, -3.5));
  });

  it("stays in range and is continuous", () => {
    let min = Infinity;
    let max = -Infinity;
    let prev = gradientNoise2(seeds.base, 0, 0.5);
    for (let i = 1; i < 20000; i++) {
      const v = gradientNoise2(seeds.base, i / 37, 0.5);
      min = Math.min(min, v);
      max = Math.max(max, v);
      expect(Math.abs(v - prev)).toBeLessThan(0.4); // no discontinuities
      prev = v;
    }
    expect(min).toBeGreaterThan(-1.05);
    expect(max).toBeLessThan(1.05);
    expect(max - min).toBeGreaterThan(1); // and it actually varies
  });

  it("changes completely with the seed", () => {
    const a = gradientNoise2(seeds.base, 3.3, 7.7);
    const b = gradientNoise2(seeds.warpX, 3.3, 7.7);
    expect(a).not.toBe(b);
  });
});

describe("octave stacks", () => {
  it("keeps fBm normalized to roughly [-1, 1]", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 5000; i++) {
      const v = fbm2(seeds.base, i * 3.1, i * 1.7, OCT);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1.001);
    expect(max).toBeLessThanOrEqual(1.001);
  });

  it("keeps ridged output in [-1, 1] with crests near +1", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const v = ridged2(seeds.base, i * 0.7, i * 1.3, OCT);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1.001);
    expect(max).toBeLessThanOrEqual(1.001);
    expect(max).toBeGreaterThan(0.4);
  });

  it("respects the octave count", () => {
    const one = fbm2(seeds.base, 12.3, 45.6, { ...OCT, octaves: 1 });
    const five = fbm2(seeds.base, 12.3, 45.6, OCT);
    expect(one).not.toBe(five);
    expect(one).toBe(gradientNoise2(seeds.base, 12.3 * OCT.frequency, 45.6 * OCT.frequency));
  });
});

describe("domain warp", () => {
  it("is a no-op at amount 0", () => {
    const w = domainWarp(seeds.warpX, seeds.warpZ, 10, 20, { amount: 0, frequency: 0.01 });
    expect(w).toEqual({ x: 10, z: 20 });
  });

  it("displaces by at most `amount` on each axis", () => {
    for (let i = 0; i < 500; i++) {
      const w = domainWarp(seeds.warpX, seeds.warpZ, i, i * 2, { amount: 16, frequency: 0.02 });
      expect(Math.abs(w.x - i)).toBeLessThanOrEqual(16.1);
      expect(Math.abs(w.z - i * 2)).toBeLessThanOrEqual(16.1);
    }
  });
});

describe("curve remap", () => {
  it("is the identity when empty", () => {
    expect(applyCurve([], 0.37)).toBe(0.37);
  });

  it("interpolates linearly and clamps outside the control range", () => {
    const curve = [
      [0.2, 0],
      [0.8, 1],
    ] as const;
    expect(applyCurve(curve, 0.1)).toBe(0);
    expect(applyCurve(curve, 0.2)).toBe(0);
    expect(applyCurve(curve, 0.5)).toBeCloseTo(0.5, 12);
    expect(applyCurve(curve, 0.8)).toBe(1);
    expect(applyCurve(curve, 0.95)).toBe(1);
  });

  it("does not care about control-point declaration order", () => {
    const sorted = [
      [0, 0],
      [0.5, 0.9],
      [1, 1],
    ] as const;
    const jumbled = [
      [1, 1],
      [0, 0],
      [0.5, 0.9],
    ] as const;
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.99]) {
      expect(applyCurve(jumbled, t)).toBe(applyCurve(sorted, t));
    }
  });
});

describe("continentalness", () => {
  const params = resolveNoiseStackParams({
    continentalness: { frequency: 0.0015, seaFraction: 0.5 },
    amplitude: 50,
  });

  it("produces both ocean and land over a large region", () => {
    let below = 0;
    let above = 0;
    for (let z = -400; z < 400; z += 8) {
      for (let x = -400; x < 400; x += 8) {
        const h = evaluateBaseHeight(seeds, params, x, z);
        if (h < params.seaLevel) below++;
        else above++;
      }
    }
    expect(below).toBeGreaterThan(0);
    expect(above).toBeGreaterThan(0);
  });

  it("returns a mask in [0, 1] that rises with seaFraction lowered", () => {
    const low = { frequency: 0.0015, seaFraction: 0.2 };
    const high = { frequency: 0.0015, seaFraction: 0.8 };
    let lowSum = 0;
    let highSum = 0;
    for (let i = 0; i < 400; i++) {
      const lm = continentalnessAt(seeds, low, i * 13, i * 7);
      const hm = continentalnessAt(seeds, high, i * 13, i * 7);
      expect(lm).toBeGreaterThanOrEqual(0);
      expect(lm).toBeLessThanOrEqual(1);
      lowSum += lm;
      highSum += hm;
    }
    expect(lowSum).toBeGreaterThan(highSum);
  });

  it("is absent by default (all land)", () => {
    expect(NOISE_STACK_DEFAULTS.continentalness).toBeUndefined();
    expect(resolveNoiseStackParams(undefined).continentalness).toBeUndefined();
  });
});

describe("parameter resolution", () => {
  it("fills in the §7.5 defaults", () => {
    const p = resolveNoiseStackParams({});
    expect(p.seaLevel).toBe(63);
    expect(p.baseHeight).toBe(70);
    expect(p.amplitude).toBe(40);
    expect(p.octaves).toBe(5);
    expect(p.frequency).toBe(0.0035);
    expect(p.lacunarity).toBe(2);
    expect(p.gain).toBe(0.5);
    expect(p.ridged).toBe(false);
    expect(p.warp).toEqual({ amount: 0, frequency: 0.01 });
    expect(p.erosionPasses).toBe(0);
    expect(p.curve).toEqual([]);
  });

  it("clamps octaves to 1..10 and erosionPasses to 0..8", () => {
    expect(resolveNoiseStackParams({ octaves: 99 }).octaves).toBe(10);
    expect(resolveNoiseStackParams({ octaves: 0 }).octaves).toBe(1);
    expect(resolveNoiseStackParams({ erosionPasses: 50 }).erosionPasses).toBe(8);
    expect(resolveNoiseStackParams({ erosionPasses: -3 }).erosionPasses).toBe(0);
  });
});

describe("thermal erosion", () => {
  function spike(): Float64Array {
    const g = new Float64Array(9 * 9);
    g[4 * 9 + 4] = 40;
    return g;
  }

  it("moves material downhill and conserves total mass", () => {
    const g = spike();
    const before = g.reduce((a, b) => a + b, 0);
    erode(g, 9, 9, 3);
    const after = g.reduce((a, b) => a + b, 0);
    expect(after).toBeCloseTo(before, 9);
    expect(g[4 * 9 + 4]!).toBeLessThan(40);
    expect(g[4 * 9 + 3]!).toBeGreaterThan(0);
  });

  it("lowers the maximum slope", () => {
    const g = spike();
    erode(g, 9, 9, 8);
    expect(g[4 * 9 + 4]! - g[4 * 9 + 3]!).toBeLessThan(40);
  });

  it("is a no-op at zero passes", () => {
    const g = spike();
    const copy = Float64Array.from(g);
    erode(g, 9, 9, 0);
    expect(Array.from(g)).toEqual(Array.from(copy));
  });

  it("is independent of traversal order (double-buffered)", () => {
    // Running one pass twice must equal running two passes in one call.
    const a = spike();
    erode(a, 9, 9, 1);
    erode(a, 9, 9, 1);
    const b = spike();
    erode(b, 9, 9, 2);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
