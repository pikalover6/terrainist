import { describe, expect, it } from "vitest";

import {
  SURFACE_CLASS_NAMES,
  SurfaceClass,
  classify,
  computeSlopes,
  findHighestPoint,
  findLargestFlat,
  sampleCoastPoints,
} from "../src/classify/index.js";
import {
  HeightField,
  centeredRegion,
  resolveHeightfieldParams,
  type Region,
} from "../src/field/index.js";
import { buildTerrainField } from "../src/index.js";

const PARAMS = resolveHeightfieldParams({});

function fieldFrom(width: number, depth: number, fn: (x: number, z: number) => number): HeightField {
  const region: Region = { x0: 0, z0: 0, width, depth };
  const f = new HeightField(region);
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) f.values[j * width + i] = fn(i, j);
  }
  return f;
}

describe("slope", () => {
  it("is zero on flat ground", () => {
    const s = computeSlopes(fieldFrom(8, 8, () => 70));
    for (const v of s) expect(v).toBe(0);
  });

  it("reads a 1:1 ramp as 45 degrees", () => {
    const s = computeSlopes(fieldFrom(8, 8, (x) => 70 + x));
    expect(s[3 * 8 + 4]).toBeCloseTo(45, 9);
  });

  it("reads a 2:1 ramp as ~63.4 degrees and is direction-agnostic", () => {
    const alongX = computeSlopes(fieldFrom(8, 8, (x) => 70 + 2 * x));
    const alongZ = computeSlopes(fieldFrom(8, 8, (_x, z) => 70 + 2 * z));
    expect(alongX[3 * 8 + 4]).toBeCloseTo(63.43494882292201, 9);
    expect(alongZ[4 * 8 + 3]).toBeCloseTo(63.43494882292201, 9);
  });

  it("uses one-sided differences at the border without inflating the slope", () => {
    const s = computeSlopes(fieldFrom(8, 8, (x) => 70 + x));
    expect(s[0]).toBeCloseTo(45, 9);
    expect(s[7]).toBeCloseTo(45, 9);
  });
});

describe("surface classes", () => {
  it("names every class", () => {
    expect(SURFACE_CLASS_NAMES[SurfaceClass.UNDERWATER]).toBe("underwater");
    expect(SURFACE_CLASS_NAMES[SurfaceClass.SNOW]).toBe("snow");
    expect(SURFACE_CLASS_NAMES).toHaveLength(5);
  });

  it("classifies by height then slope, in rule order", () => {
    // a ramp from y=40 (deep water) to y=200 (snow), gentle everywhere
    const f = fieldFrom(200, 4, (x) => 40 + x * 0.8);
    const c = classify(f, PARAMS);
    // sea level 63 → first land column is x = 29
    expect(c.classes[28]).toBe(SurfaceClass.UNDERWATER);
    expect(c.classes[29]).toBe(SurfaceClass.BEACH);
    // beachWidth 4 → beach up to y = 67, i.e. x ≤ 33
    expect(c.classes[33]).toBe(SurfaceClass.BEACH);
    expect(c.classes[34]).toBe(SurfaceClass.SOIL);
    // snow line = 63 + 0.8 * (max - 63)
    expect(c.snowLine).toBeCloseTo(63 + 0.8 * (c.maxHeight - 63), 9);
    const snowStart = c.classes.indexOf(SurfaceClass.SNOW);
    expect(snowStart).toBeGreaterThan(34);
    expect(f.values[snowStart]!).toBeGreaterThanOrEqual(c.snowLine);
  });

  it("classifies steep land as cliff, ahead of the snow rule", () => {
    const f = fieldFrom(40, 4, (x) => 70 + x * 3); // ~71.6°, above cliffThreshold 55
    const c = classify(f, PARAMS);
    expect(c.classes[2 * 40 + 20]).toBe(SurfaceClass.CLIFF);
  });

  it("never grows a snow cap on a flat world", () => {
    const f = fieldFrom(16, 16, () => 70);
    const c = classify(f, PARAMS);
    for (const v of c.classes) expect(v).toBe(SurfaceClass.SOIL);
    expect(c.relief.every((r) => r === 0)).toBe(true);
  });

  it("reports relief normalized to sea level and the maximum", () => {
    const f = fieldFrom(16, 4, (x) => 63 + x);
    const c = classify(f, PARAMS);
    expect(c.relief[0]).toBe(0);
    expect(c.relief[15]).toBeCloseTo(1, 12);
    expect(c.minHeight).toBe(63);
    expect(c.maxHeight).toBe(78);
  });
});

describe("markers", () => {
  it("finds the highest point, breaking ties row-major", () => {
    const f = fieldFrom(8, 8, (x, z) => (x === 5 && z === 3 ? 200 : 70));
    const m = findHighestPoint(f);
    expect(m).toMatchObject({ id: "highest_point", x: 5, z: 3, y: 200 });

    const flat = fieldFrom(4, 4, () => 70);
    expect(findHighestPoint(flat)).toMatchObject({ x: 0, z: 0 });
  });

  it("finds the largest connected flat area and puts the marker on it", () => {
    // Two flat plateaus separated by a steep wall; the right one is larger.
    const f = fieldFrom(40, 20, (x) => {
      if (x < 10) return 80;
      if (x < 14) return 80 + (x - 10) * 20;
      return 160;
    });
    const slopes = computeSlopes(f);
    const flat = findLargestFlat(f, slopes, 63, 5);
    expect(flat).not.toBeNull();
    expect(flat!.area).toBeGreaterThan(20 * 20);
    expect(flat!.marker.x).toBeGreaterThan(14);
    expect(flat!.marker.y).toBe(160);
    // the marker column really is flat
    expect(slopes[flat!.marker.z * 40 + flat!.marker.x]!).toBeLessThan(5);
  });

  it("returns no flat marker when nothing is flat land", () => {
    const f = fieldFrom(16, 16, (x, z) => 70 + x * 5 + z * 5);
    expect(findLargestFlat(f, computeSlopes(f), 63, 5)).toBeNull();
    const drowned = fieldFrom(16, 16, () => 20);
    expect(findLargestFlat(drowned, computeSlopes(drowned), 63, 5)).toBeNull();
  });

  it("is deterministic across repeated runs", () => {
    const f = fieldFrom(64, 64, (x, z) => 70 + ((x * 7 + z * 13) % 5));
    const a = findLargestFlat(f, computeSlopes(f), 63, 5);
    const b = findLargestFlat(f, computeSlopes(f), 63, 5);
    expect(a).toEqual(b);
  });

  it("samples coast points on the land side of the boundary", () => {
    const f = fieldFrom(64, 64, (x) => (x < 32 ? 50 : 80));
    const pts = sampleCoastPoints(f, 63, 64);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.length).toBeLessThanOrEqual(64);
    for (const p of pts) {
      expect(p.name).toBe("coast_points");
      expect(p.x).toBe(32); // the first land column
      expect(p.y).toBeGreaterThanOrEqual(63);
    }
    expect(sampleCoastPoints(f, 63, 64)).toEqual(pts);
  });

  it("returns no coast points for an all-land or all-ocean field", () => {
    expect(sampleCoastPoints(fieldFrom(16, 16, () => 90), 63, 64)).toEqual([]);
    expect(sampleCoastPoints(fieldFrom(16, 16, () => 20), 63, 64)).toEqual([]);
  });

  it("caps the coast sample and spreads it by striding", () => {
    const f = fieldFrom(64, 64, (x) => (x < 32 ? 50 : 80));
    const pts = sampleCoastPoints(f, 63, 8);
    expect(pts.length).toBeLessThanOrEqual(8);
    const zs = pts.map((p) => p.z);
    expect(new Set(zs).size).toBe(zs.length); // no duplicates
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(30);
  });
});

describe("classification over a real field", () => {
  it("produces all three heightfield markers", () => {
    const r = buildTerrainField({
      region: centeredRegion(128, 128),
      worldSeed: 813205,
      nodePath: "world.terrain",
      params: {
        ridged: true,
        amplitude: 72,
        continentalness: { frequency: 0.0015, seaFraction: 0.45 },
      },
    });
    const names = new Set(r.classification.markers.map((m) => m.name));
    expect(names.has("highest_point")).toBe(true);
    expect(names.has("largest_flat")).toBe(true);
    expect(names.has("coast_points")).toBe(true);
    expect(r.classification.slopes).toHaveLength(128 * 128);
    expect(r.classification.classes).toHaveLength(128 * 128);
  });
});
