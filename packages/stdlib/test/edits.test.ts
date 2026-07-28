import { describe, expect, it } from "vitest";

import { nodeSeed } from "../src/determinism/index.js";
import { HeightField, centeredRegion, type Region } from "../src/field/index.js";
import {
  CARVE_VERBS,
  EDIT_DEFAULTS,
  RAISE_VERBS,
  ZONE_FRACTIONS,
  applyEdits,
  editGroup,
  falloff,
  monotonicDescent,
  polylineDistance,
  refineCourse,
  resolveCenter,
  type EditContext,
  type TerrainEdit,
} from "../src/edits/index.js";

const REGION: Region = centeredRegion(256, 256);
const SEA = 63;

function flatField(height = 80, region: Region = REGION): HeightField {
  const f = new HeightField(region);
  f.values.fill(height);
  return f;
}

function ctx(region: Region = REGION): EditContext {
  return { region, worldSeed: 813205n, parentPath: "world.terrain", seaLevel: SEA };
}

describe("verb taxonomy", () => {
  it("splits the eight verbs into raise and carve groups", () => {
    expect(RAISE_VERBS).toEqual(["ridge", "peak", "volcano", "plateau", "island"]);
    expect(CARVE_VERBS).toEqual(["valley", "river", "basin"]);
    expect(editGroup("ridge")).toBe("raise");
    expect(editGroup("river")).toBe("carve");
  });

  it("carries the profile's documented defaults", () => {
    expect(EDIT_DEFAULTS.ridge).toMatchObject({ width: 48, height: 50, profile: "rounded" });
    expect(EDIT_DEFAULTS.peak).toMatchObject({ radius: 56, height: 70, profile: "sharp" });
    expect(EDIT_DEFAULTS.volcano).toMatchObject({
      radius: 64,
      height: 80,
      caldera: true,
      calderaDepth: 12,
      lava: true,
    });
    expect(EDIT_DEFAULTS.plateau).toMatchObject({ radius: 64, height: 25, rim: 8 });
    expect(EDIT_DEFAULTS.island).toMatchObject({ radius: 48, height: 30 });
    expect(EDIT_DEFAULTS.valley).toMatchObject({ width: 40, depth: 30 });
    expect(EDIT_DEFAULTS.river).toMatchObject({ width: 10, depth: 6 });
    expect(EDIT_DEFAULTS.basin).toMatchObject({ radius: 56, depth: 20, water: false });
  });
});

describe("falloff profiles", () => {
  it("is a linear cone for sharp and a Hermite dome for rounded", () => {
    expect(falloff("sharp", 1)).toBe(1);
    expect(falloff("sharp", 0)).toBe(0);
    expect(falloff("sharp", 0.5)).toBe(0.5);
    expect(falloff("rounded", 0.5)).toBe(0.5);
    // rounded is flatter near the top and the foot
    expect(falloff("rounded", 0.9)).toBeGreaterThan(falloff("sharp", 0.9));
    expect(falloff("rounded", 0.1)).toBeLessThan(falloff("sharp", 0.1));
    expect(falloff("rounded", 5)).toBe(1);
    expect(falloff("sharp", -1)).toBe(0);
  });
});

describe("placement resolution", () => {
  it("places the nine zones on the nine-grid, north at −Z", () => {
    expect(ZONE_FRACTIONS.center).toEqual([0.5, 0.5]);
    expect(ZONE_FRACTIONS.north[1]).toBeLessThan(0.5);
    expect(ZONE_FRACTIONS.south[1]).toBeGreaterThan(0.5);
    expect(ZONE_FRACTIONS.east[0]).toBeGreaterThan(0.5);
    expect(ZONE_FRACTIONS.west[0]).toBeLessThan(0.5);
  });

  it("uses `at` verbatim", () => {
    const seed = nodeSeed(1n, "world.terrain.p");
    const c = resolveCenter({ id: "p", verb: "peak", at: [0.25, 0.75] }, REGION, seed);
    expect(c).toEqual({ x: -64, z: 64 });
  });

  it("jitters a zone by at most ±10% of the region, deterministically", () => {
    const seed = nodeSeed(1n, "world.terrain.p");
    const edit: TerrainEdit = { id: "p", verb: "peak", zone: "northeast" };
    const a = resolveCenter(edit, REGION, seed);
    const b = resolveCenter(edit, REGION, seed);
    expect(a).toEqual(b);
    const base = { x: -128 + (5 / 6) * 256, z: -128 + (1 / 6) * 256 };
    expect(Math.abs(a.x - base.x)).toBeLessThanOrEqual(25.6);
    expect(Math.abs(a.z - base.z)).toBeLessThanOrEqual(25.6);
    expect(a.x).not.toBe(base.x);
  });

  it("rejects a radial verb with no placement", () => {
    expect(() => resolveCenter({ id: "p", verb: "peak" }, REGION, nodeSeed(1n, "p"))).toThrow(
      /'at' or 'zone'/,
    );
  });
});

describe("course refinement", () => {
  it("passes through the first and last waypoints", () => {
    const pts = refineCourse(REGION, [
      [0.1, 0.5],
      [0.5, 0.4],
      [0.9, 0.6],
    ]);
    expect(pts[0]).toEqual({ x: -128 + 0.1 * 256, z: -128 + 0.5 * 256 });
    expect(pts[pts.length - 1]).toEqual({ x: -128 + 0.9 * 256, z: -128 + 0.6 * 256 });
  });

  it("produces a dense, smooth, deterministic polyline", () => {
    const way = [
      [0.1, 0.5],
      [0.5, 0.4],
      [0.9, 0.6],
    ] as const;
    const a = refineCourse(REGION, way);
    const b = refineCourse(REGION, way);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(150);
    for (let i = 1; i < a.length; i++) {
      const dx = a[i]!.x - a[i - 1]!.x;
      const dz = a[i]!.z - a[i - 1]!.z;
      expect(Math.sqrt(dx * dx + dz * dz)).toBeLessThan(2);
    }
  });

  it("curves rather than staying on the chord (Catmull-Rom, not a polyline)", () => {
    const pts = refineCourse(REGION, [
      [0, 0],
      [0.5, 1],
      [1, 0],
    ]);
    const mid = pts[Math.floor(pts.length / 4)]!;
    // a straight segment from (0,0) to (0.5,1) would have z = 2x + const
    const chordZ = -128 + ((mid.x + 128) / 128) * 256;
    expect(Math.abs(mid.z - chordZ)).toBeGreaterThan(0.5);
  });

  it("rejects fewer than two waypoints", () => {
    expect(() => refineCourse(REGION, [[0.5, 0.5]])).toThrow(/2–8 waypoints/);
  });

  it("measures distance to the polyline", () => {
    const line = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ];
    expect(polylineDistance(5, 3, line).distance).toBeCloseTo(3, 12);
    expect(polylineDistance(15, 0, line).distance).toBeCloseTo(5, 12);
  });
});

describe("monotonic descent (river)", () => {
  it("forces the sampled profile to never climb toward the mouth", () => {
    const region: Region = { x0: 0, z0: 0, width: 32, depth: 4 };
    const f = new HeightField(region);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 32; i++) {
        // descending ramp with a bump in the middle
        f.values[j * 32 + i] = 100 - i + (i > 14 && i < 18 ? 20 : 0);
      }
    }
    const samples = Array.from({ length: 32 }, (_, i) => ({ x: i, z: 2 }));
    const { elevations, reversed } = monotonicDescent(samples, f);
    expect(reversed).toBe(false);
    for (let i = 1; i < elevations.length; i++) {
      expect(elevations[i]!).toBeLessThanOrEqual(elevations[i - 1]!);
    }
  });

  it("detects a reversed course (mouth at the first waypoint)", () => {
    const region: Region = { x0: 0, z0: 0, width: 16, depth: 4 };
    const f = new HeightField(region);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 16; i++) f.values[j * 16 + i] = 60 + i;
    const samples = Array.from({ length: 16 }, (_, i) => ({ x: i, z: 2 }));
    expect(monotonicDescent(samples, f).reversed).toBe(true);
  });
});

describe("raise kernels", () => {
  it("ridge raises the field along its course and leaves the rest alone", () => {
    const field = flatField();
    const edits: TerrainEdit[] = [
      {
        id: "the_divide",
        verb: "ridge",
        course: [
          [0.15, 0.5],
          [0.5, 0.5],
          [0.85, 0.5],
        ],
        width: 48,
        height: 60,
        profile: "sharp",
      },
    ];
    const out = applyEdits(field, edits, ctx());
    // on the crest
    expect(field.at(0, 0)).toBeCloseTo(140, 6);
    // half-way out the falloff
    expect(field.at(0, 12)).toBeGreaterThan(80);
    expect(field.at(0, 12)).toBeLessThan(140);
    // beyond the half-width
    expect(field.at(0, 25)).toBe(80);
    // far from the course entirely
    expect(field.at(0, 120)).toBe(80);
    expect(out.markers.map((m) => m.name).sort()).toEqual(["head", "mouth", "peak"]);
  });

  it("peak raises a cone with its apex at the centre", () => {
    const field = flatField();
    applyEdits(field, [{ id: "p", verb: "peak", at: [0.5, 0.5], radius: 50, height: 70 }], ctx());
    expect(field.at(0, 0)).toBeCloseTo(150, 6);
    expect(field.at(25, 0)).toBeCloseTo(115, 6); // sharp = linear
    expect(field.at(50, 0)).toBe(80);
  });

  it("island raises a rounded dome", () => {
    const field = flatField();
    applyEdits(field, [{ id: "i", verb: "island", at: [0.5, 0.5] }], ctx());
    expect(field.at(0, 0)).toBeCloseTo(110, 6); // default height 30
    expect(field.at(48, 0)).toBe(80);
  });

  it("plateau is flat inside its rim", () => {
    // Sloping ground, so a merely-additive kernel could not produce a flat top.
    const field = new HeightField(REGION);
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) field.values[j * REGION.width + i] = 70 + i * 0.05;
    }
    applyEdits(
      field,
      [{ id: "mesa", verb: "plateau", at: [0.5, 0.5], radius: 64, height: 25, rim: 8 }],
      ctx(),
    );
    const centre = field.at(0, 0);
    for (let dz = -40; dz <= 40; dz += 8) {
      for (let dx = -40; dx <= 40; dx += 8) {
        if (dx * dx + dz * dz > 55 * 55) continue;
        expect(field.at(dx, dz)).toBeCloseTo(centre, 9);
      }
    }
    // and it falls back to the base terrain outside the radius
    expect(field.at(70, 0)).toBeLessThan(centre);
  });

  it("plateau never digs below the existing ground", () => {
    const field = new HeightField(REGION);
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) field.values[j * REGION.width + i] = 70 + j * 2;
    }
    const before = Float64Array.from(field.values);
    applyEdits(field, [{ id: "mesa", verb: "plateau", at: [0.5, 0.5] }], ctx());
    for (let k = 0; k < field.values.length; k++) {
      expect(field.values[k]!).toBeGreaterThanOrEqual(before[k]! - 1e-9);
    }
  });

  it("volcano digs a caldera below its rim and marks the interior", () => {
    const field = flatField();
    const out = applyEdits(
      field,
      [{ id: "fuji", verb: "volcano", at: [0.5, 0.5], radius: 64, height: 80, calderaDepth: 12 }],
      ctx(),
    );
    expect(out.calderas).toHaveLength(1);
    const cal = out.calderas[0]!;
    expect(cal.editId).toBe("fuji");
    expect(cal.lava).toBe(true);
    expect(cal.columns.length).toBeGreaterThan(0);
    // the summit is depressed relative to the rim
    // rim height = cone height at the caldera radius; the axis sits calderaDepth below it
    const rimAdd = 80 * (1 - (64 * 0.28) / 64);
    const summit = field.at(0, 0);
    expect(summit).toBeLessThan(cal.rimY);
    expect(summit).toBeCloseTo(80 + rimAdd - 12, 4);
    expect(cal.rimY).toBeCloseTo(80 + rimAdd, 0);
    // outside the caldera the cone keeps descending
    expect(field.at(40, 0)).toBeLessThan(cal.rimY);
    expect(field.at(40, 0)).toBeGreaterThan(80);
    // lava must sit strictly below the rim so it cannot spill
    expect(cal.lavaY).toBeLessThan(cal.rimY);
    for (const idx of cal.columns) {
      expect(field.values[idx]!).toBeLessThan(cal.rimY);
    }
    expect(out.markers.some((m) => m.name === "caldera")).toBe(true);
  });

  it("volcano without a caldera is a plain cone", () => {
    const field = flatField();
    const out = applyEdits(
      field,
      [{ id: "v", verb: "volcano", at: [0.5, 0.5], caldera: false }],
      ctx(),
    );
    expect(out.calderas).toHaveLength(0);
    expect(field.at(0, 0)).toBeCloseTo(160, 6);
  });
});

describe("carve kernels", () => {
  it("valley cuts a trough along its course", () => {
    const field = flatField();
    applyEdits(
      field,
      [
        {
          id: "v",
          verb: "valley",
          course: [
            [0.1, 0.5],
            [0.9, 0.5],
          ],
          width: 40,
          depth: 30,
        },
      ],
      ctx(),
    );
    expect(field.at(0, 0)).toBeCloseTo(50, 6);
    expect(field.at(0, 25)).toBe(80);
  });

  it("river carves below sea level to a bed at seaLevel - depth", () => {
    const field = flatField(90);
    const out = applyEdits(
      field,
      [
        {
          id: "inlet",
          verb: "river",
          course: [
            [0.1, 0.5],
            [0.9, 0.5],
          ],
          width: 10,
          depth: 6,
        },
      ],
      ctx(),
    );
    const bed = field.at(0, 0);
    expect(bed).toBeCloseTo(SEA - 6, 6);
    expect(bed).toBeLessThan(SEA);
    expect(field.at(0, 20)).toBe(90);
    expect(out.markers.map((m) => m.name).sort()).toEqual(["head", "mouth"]);
  });

  it("river never raises ground that is already below its bed", () => {
    const field = flatField(20); // already far below sea level
    const before = Float64Array.from(field.values);
    applyEdits(
      field,
      [{ id: "r", verb: "river", course: [[0.1, 0.5], [0.9, 0.5]] }],
      ctx(),
    );
    expect(Array.from(field.values)).toEqual(Array.from(before));
  });

  it("basin carves a bowl and reports water when the rim is closed", () => {
    const field = flatField(100);
    const out = applyEdits(
      field,
      [{ id: "lake", verb: "basin", at: [0.5, 0.5], radius: 56, depth: 20, water: true }],
      ctx(),
    );
    expect(field.at(0, 0)).toBeCloseTo(80, 6);
    expect(out.basins).toHaveLength(1);
    const basin = out.basins[0]!;
    expect(basin.waterY).not.toBeNull();
    expect(basin.waterY!).toBeLessThan(100);
    expect(basin.columns.length).toBeGreaterThan(0);
    expect(out.diagnostics).toHaveLength(0);
  });

  it("basin reports LOAM-T105 and no water when the rim is open", () => {
    const field = flatField(100);
    const out = applyEdits(
      field,
      [{ id: "lake", verb: "basin", at: [0.02, 0.02], radius: 56, water: true }],
      ctx(),
    );
    expect(out.basins[0]!.waterY).toBeNull();
    expect(out.diagnostics[0]!.code).toBe("LOAM-T105");
  });

  it("basin without water requests no fill at all", () => {
    const field = flatField(100);
    const out = applyEdits(field, [{ id: "b", verb: "basin", at: [0.5, 0.5] }], ctx());
    expect(out.basins).toHaveLength(0);
    expect(field.at(0, 0)).toBeCloseTo(80, 6);
  });
});

describe("composition", () => {
  it("applies all raise verbs before all carve verbs, each in document order", () => {
    const field = flatField();
    const out = applyEdits(
      field,
      [
        { id: "carve_first", verb: "valley", course: [[0.1, 0.5], [0.9, 0.5]] },
        { id: "raise_second", verb: "peak", at: [0.5, 0.5] },
        { id: "carve_third", verb: "basin", at: [0.5, 0.5] },
        { id: "raise_fourth", verb: "island", at: [0.5, 0.5] },
      ],
      ctx(),
    );
    expect(out.order).toEqual(["raise_second", "raise_fourth", "carve_first", "carve_third"]);
  });

  it("gives the same field regardless of how the author interleaved the nodes", () => {
    const a = flatField();
    const b = flatField();
    const raise: TerrainEdit = { id: "p", verb: "peak", at: [0.5, 0.5] };
    const carve: TerrainEdit = { id: "v", verb: "valley", course: [[0.1, 0.5], [0.9, 0.5]] };
    applyEdits(a, [raise, carve], ctx());
    applyEdits(b, [carve, raise], ctx());
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
  });

  it("scales kernels by strength, and strength 0 is a no-op", () => {
    const full = flatField();
    const half = flatField();
    const none = flatField();
    const edit: TerrainEdit = { id: "p", verb: "peak", at: [0.5, 0.5], radius: 50, height: 70 };
    applyEdits(full, [edit], ctx());
    applyEdits(half, [{ ...edit, strength: 0.5 }], ctx());
    applyEdits(none, [{ ...edit, strength: 0 }], ctx());
    expect(full.at(0, 0) - 80).toBeCloseTo(70, 6);
    expect(half.at(0, 0) - 80).toBeCloseTo(35, 6);
    expect(none.at(0, 0)).toBe(80);
  });

  it("seeds each edit from its own nodePath, so ids drive the jitter", () => {
    const a = flatField();
    const b = flatField();
    applyEdits(a, [{ id: "alpha", verb: "peak", zone: "center" }], ctx());
    applyEdits(b, [{ id: "beta", verb: "peak", zone: "center" }], ctx());
    expect(Array.from(a.values)).not.toEqual(Array.from(b.values));
  });

  it("emits center / peak / foot markers for radial verbs", () => {
    const field = flatField();
    const out = applyEdits(field, [{ id: "p", verb: "peak", at: [0.5, 0.5] }], ctx());
    expect(out.markers.map((m) => m.id)).toEqual(["p.center", "p.peak", "p.foot"]);
    expect(out.markers[0]!.x).toBe(0);
    expect(out.markers[2]!.x).toBe(56);
  });
});
