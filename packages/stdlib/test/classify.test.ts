import { describe, expect, it } from "vitest";

import {
  SNOW_LAPSE_RATE,
  SNOW_TEMPERATURE_THRESHOLD,
  SURFACE_CLASS_NAMES,
  SurfaceClass,
  classify,
  effectiveTemperature,
  computeLakeMask,
  computeOceanMask,
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
import { footprintHas } from "../src/edits/index.js";
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
    expect(SURFACE_CLASS_NAMES[SurfaceClass.LAKESHORE]).toBe("lakeshore");
    expect(SURFACE_CLASS_NAMES).toHaveLength(6);
  });

  it("classifies by height then slope, in rule order", () => {
    // a ramp from y=40 (deep water) to y=200 (snow), gentle everywhere
    const f = fieldFrom(200, 4, (x) => 40 + x * 0.8);
    const c = classify(f, PARAMS);
    // sea level 63 → first land column is x = 29
    expect(c.classes[28]).toBe(SurfaceClass.UNDERWATER);
    expect(c.classes[29]).toBe(SurfaceClass.BEACH);
    // beachWidth 4 caps *both* the height band and the distance from the water,
    // so the beach reaches four columns inland and no further.
    expect(c.classes[32]).toBe(SurfaceClass.BEACH);
    expect(c.classes[33]).toBe(SurfaceClass.SOIL);
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

// ---------------------------------------------------------------------------
// G2.5a — hydrology and the classifier rules that depend on it
// ---------------------------------------------------------------------------

/**
 * One hand-built 40×40 plateau at y=80 holding all three hydrology cases:
 *
 * - an **open fjord**: a below-sea channel cut in from the west edge;
 * - a **landlocked gorge**: an equally deep below-sea pocket with no path out;
 * - a **closed basin**: a shallow bowl that a `water: true` basin pools.
 *
 * A lone 200-high spire in the corner carries the snow line clear of the
 * plateau, so these cases are read on their own terms rather than through a
 * snow cap.
 */
function hydrologyField(): HeightField {
  const f = fieldFrom(40, 40, () => 80);
  const set = (x: number, z: number, y: number): void => {
    f.values[z * 40 + x] = y;
  };
  for (let x = 0; x <= 14; x++) for (let z = 5; z <= 7; z++) set(x, z, 50); // fjord
  for (let x = 25; x <= 34; x++) for (let z = 20; z <= 22; z++) set(x, z, 50); // gorge
  for (let x = 6; x <= 12; x++) for (let z = 28; z <= 33; z++) set(x, z, 72); // bowl
  for (let x = 0; x <= 14; x++) for (const z of [4, 8]) set(x, z, 65); // fjord shore
  set(39, 0, 200); // lifts the snow line off the plateau
  return f;
}

describe("ocean connectivity", () => {
  it("floods a fjord that opens to the map edge and nothing else", () => {
    const f = hydrologyField();
    const { mask } = computeOceanMask(f, 63);
    // the fjord is water all the way to its inland head
    expect(mask[6 * 40 + 0]).toBe(1);
    expect(mask[6 * 40 + 14]).toBe(1);
    // the landlocked gorge is just as deep, and stays dry
    expect(f.values[21 * 40 + 30]).toBeLessThan(63);
    expect(mask[21 * 40 + 30]).toBe(0);
    // and dry land is dry land
    expect(mask[0]).toBe(0);
  });

  it("counts every flooded column as connected, and no column above sea", () => {
    const f = hydrologyField();
    const { mask, overriddenNoFlood } = computeOceanMask(f, 63);
    let wet = 0;
    for (let idx = 0; idx < mask.length; idx++) {
      if (mask[idx] === 1) {
        wet++;
        expect(f.values[idx]!).toBeLessThan(63);
      }
    }
    expect(wet).toBe(15 * 3); // the fjord channel only
    expect(overriddenNoFlood).toBe(0);
  });

  it("honours flooded:\"never\" where it can, and floods anyway where it must", () => {
    const f = hydrologyField();
    const noFlood = new Uint8Array(40 * 40);
    // plug the middle of the fjord: the sea still reaches the plug
    for (let x = 8; x <= 10; x++) for (let z = 5; z <= 7; z++) noFlood[z * 40 + x] = 1;
    const { mask, overriddenNoFlood } = computeOceanMask(f, 63, noFlood);
    // the barrier touches the open sea, so physics wins and it fills
    expect(overriddenNoFlood).toBeGreaterThan(0);
    expect(mask[6 * 40 + 0]).toBe(1);

    // a barrier over the landlocked gorge costs nothing — it was dry anyway
    const inland = new Uint8Array(40 * 40);
    for (let x = 25; x <= 34; x++) for (let z = 20; z <= 22; z++) inland[z * 40 + x] = 1;
    const dry = computeOceanMask(f, 63, inland);
    expect(dry.overriddenNoFlood).toBe(0);
    expect(dry.mask[21 * 40 + 30]).toBe(0);
  });

  it("marks a closed basin pool as lake water, separate from the ocean", () => {
    const f = hydrologyField();
    const columns: number[] = [];
    for (let x = 6; x <= 12; x++) for (let z = 28; z <= 33; z++) columns.push(z * 40 + x);
    const lake = computeLakeMask(f, [
      {
        editId: "pond",
        centerX: 9,
        centerZ: 30,
        radius: 4,
        waterY: 78,
        columns: Int32Array.from(columns),
      },
    ]);
    expect(lake[30 * 40 + 9]).toBe(1);
    expect(lake[0]).toBe(0);
    // a basin whose rim never closed contributes nothing
    expect(
      computeLakeMask(f, [
        { editId: "x", centerX: 9, centerZ: 30, radius: 4, waterY: null, columns: Int32Array.from(columns) },
      ]).every((v) => v === 0),
    ).toBe(true);
  });
});

describe("water-aware classification", () => {
  it("puts beach only next to ocean water, never around an inland hollow", () => {
    const f = hydrologyField();
    const c = classify(f, PARAMS);
    // the fjord's low shore is beach
    expect(c.classes[4 * 40 + 10]).toBe(SurfaceClass.BEACH);
    expect(c.classes[8 * 40 + 10]).toBe(SurfaceClass.BEACH);
    // the landlocked gorge floor is dry land, and its lip is not a beach
    expect(c.classes[21 * 40 + 30]).not.toBe(SurfaceClass.UNDERWATER);
    for (let x = 24; x <= 35; x++) {
      expect(c.classes[19 * 40 + x]).not.toBe(SurfaceClass.BEACH);
      expect(c.classes[23 * 40 + x]).not.toBe(SurfaceClass.BEACH);
    }
  });

  it("classifies the ground around a basin pool as lakeshore", () => {
    const f = hydrologyField();
    const columns: number[] = [];
    for (let x = 6; x <= 12; x++) for (let z = 28; z <= 33; z++) columns.push(z * 40 + x);
    const c = classify(f, PARAMS, {
      basins: [
        {
          editId: "pond",
          centerX: 9,
          centerZ: 30,
          radius: 4,
          waterY: 78,
          columns: Int32Array.from(columns),
        },
      ],
    });
    expect(c.classes[30 * 40 + 9]).toBe(SurfaceClass.UNDERWATER);
    expect(c.classes[30 * 40 + 13]).toBe(SurfaceClass.LAKESHORE);
    // far away is ordinary soil
    expect(c.classes[30 * 40 + 25]).toBe(SurfaceClass.SOIL);
  });

  it("never puts snow inside a volcano footprint", () => {
    const request = {
      region: centeredRegion(160, 160),
      worldSeed: 4242,
      nodePath: "world.terrain",
      params: { amplitude: 10, baseHeight: 80 },
      edits: [
        { id: "cone", verb: "volcano" as const, at: [0.5, 0.5] as const, radius: 50, height: 120 },
      ],
    };
    const r = buildTerrainField(request);
    const fp = r.edits.footprints.find((p) => p.verb === "volcano");
    expect(fp).toBeDefined();
    expect(fp!.count).toBeGreaterThan(0);

    let insideSnow = 0;
    for (let idx = 0; idx < r.classification.classes.length; idx++) {
      if (footprintHas(fp!, idx) && r.classification.classes[idx] === SurfaceClass.SNOW) {
        insideSnow++;
      }
    }
    expect(insideSnow).toBe(0);

    // and the suppression is doing real work: without the footprint the same
    // field snow-caps the cone.
    const bare = classify(r.field, r.params, {});
    let bareSnow = 0;
    for (let idx = 0; idx < bare.classes.length; idx++) {
      if (footprintHas(fp!, idx) && bare.classes[idx] === SurfaceClass.SNOW) bareSnow++;
    }
    expect(bareSnow).toBeGreaterThan(0);
  });
});

describe("the snow climate gate", () => {
  /** A cone from sea level up to `peak`, so relief always yields a snow line. */
  function cone(peak: number): HeightField {
    return fieldFrom(64, 64, (x, z) => {
      const d = Math.sqrt((x - 32) ** 2 + (z - 32) ** 2);
      return Math.max(60, peak - 2.2 * d);
    });
  }

  const uniform = (n: number, t: number): Float32Array => new Float32Array(n).fill(t);
  const snowCount = (c: { classes: Uint8Array }): number =>
    c.classes.reduce((acc, v) => acc + (v === SurfaceClass.SNOW ? 1 : 0), 0);

  it("keeps the snow line on a cold, high-relief world", () => {
    const f = cone(210);
    const n = f.values.length;
    const relief = classify(f, PARAMS, {});
    const cold = classify(f, PARAMS, { temperature: uniform(n, 0.18) });
    expect(snowCount(relief)).toBeGreaterThan(0);
    // A boreal world at these heights is unaffected: the relief line still rules.
    expect(snowCount(cold)).toBe(snowCount(relief));
  });

  it("puts no snow at all on a warm, low world", () => {
    const f = cone(96);
    const n = f.values.length;
    expect(snowCount(classify(f, PARAMS, {}))).toBeGreaterThan(0);
    expect(snowCount(classify(f, PARAMS, { temperature: uniform(n, 0.88) }))).toBe(0);
    // ...and a temperate one of the same shape is bare too — 96 is not a summit.
    expect(snowCount(classify(f, PARAMS, { temperature: uniform(n, 0.5) }))).toBe(0);
  });

  it("applies a lapse rate: the same temperature snows high and not low", () => {
    const f = cone(210);
    const n = f.values.length;
    const c = classify(f, PARAMS, { temperature: uniform(n, 0.5) });
    // Every snow column is above the altitude where the lapse alone crosses the
    // threshold, and the summit — the same temperature, higher up — is snow.
    const breakEven =
      PARAMS.seaLevel + (0.5 - SNOW_TEMPERATURE_THRESHOLD) / SNOW_LAPSE_RATE;
    expect(snowCount(c)).toBeGreaterThan(0);
    for (let idx = 0; idx < c.classes.length; idx++) {
      if (c.classes[idx] !== SurfaceClass.SNOW) continue;
      expect(f.values[idx]!).toBeGreaterThanOrEqual(breakEven);
    }
    // The summit is snow; a column of the same temperature 90 blocks lower is not.
    const summit = c.classes[32 * 64 + 32];
    expect(summit).toBe(SurfaceClass.SNOW);
    expect(effectiveTemperature(0.5, 210, PARAMS.seaLevel)).toBeLessThan(
      SNOW_TEMPERATURE_THRESHOLD,
    );
    expect(effectiveTemperature(0.5, 120, PARAMS.seaLevel)).toBeGreaterThan(
      SNOW_TEMPERATURE_THRESHOLD,
    );
  });

  it("is an AND with the relief snow line, never a replacement", () => {
    // Freezing everywhere still does not snow below the relief line.
    const f = cone(210);
    const c = classify(f, PARAMS, { temperature: new Float32Array(f.values.length).fill(-5) });
    for (let idx = 0; idx < c.classes.length; idx++) {
      if (c.classes[idx] !== SurfaceClass.SNOW) continue;
      expect(f.values[idx]!).toBeGreaterThanOrEqual(c.snowLine);
    }
  });
});
