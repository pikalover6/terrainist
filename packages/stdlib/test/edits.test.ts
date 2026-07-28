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
  footprintHas,
  makeCorridorShape,
  monotonicDescent,
  polylineDistance,
  refineCourse,
  resolveCenter,
  resolveOpenBasins,
  resolvePondChains,
  stableFluidColumns,
  POND_MIN_COLUMNS,
  type EditComposition,
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
        meander: 0,
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
    applyEdits(field, [{ id: "p", verb: "peak", at: [0.5, 0.5], radius: 50, height: 70, irregularity: 0 }], ctx());
    expect(field.at(0, 0)).toBeCloseTo(150, 6);
    expect(field.at(25, 0)).toBeCloseTo(115, 6); // sharp = linear
    expect(field.at(50, 0)).toBe(80);
  });

  it("island raises a rounded dome", () => {
    const field = flatField();
    applyEdits(field, [{ id: "i", verb: "island", at: [0.5, 0.5], irregularity: 0 }], ctx());
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
      [{ id: "mesa", verb: "plateau", at: [0.5, 0.5], radius: 64, height: 25, rim: 8, irregularity: 0 }],
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
      [
        {
          id: "fuji",
          verb: "volcano",
          at: [0.5, 0.5],
          radius: 64,
          height: 80,
          calderaDepth: 12,
          irregularity: 0,
        },
      ],
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
      [{ id: "v", verb: "volcano", at: [0.5, 0.5], caldera: false, irregularity: 0 }],
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
          meander: 0,
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
          meander: 0,
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

  it("river only ever lowers the field, never raises it", () => {
    // Ground already far below sea level: the channel is cut relative to the
    // local descent profile, so it deepens — but no column may come out higher.
    const field = flatField(20);
    const before = Float64Array.from(field.values);
    applyEdits(
      field,
      [{ id: "r", verb: "river", course: [[0.1, 0.5], [0.9, 0.5]], meander: 0 }],
      ctx(),
    );
    let lowered = 0;
    for (let k = 0; k < field.values.length; k++) {
      expect(field.values[k]!).toBeLessThanOrEqual(before[k]! + 1e-9);
      if (field.values[k]! < before[k]! - 1e-9) lowered++;
    }
    expect(lowered).toBeGreaterThan(0);
  });

  it("basin carves a bowl and reports water when the rim is closed", () => {
    const field = flatField(100);
    const out = applyEdits(
      field,
      [
        { id: "lake", verb: "basin", at: [0.5, 0.5], radius: 56, depth: 20, water: true, irregularity: 0 },
      ],
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
      [{ id: "lake", verb: "basin", at: [0.02, 0.02], radius: 56, water: true, irregularity: 0 }],
      ctx(),
    );
    expect(out.basins[0]!.waterY).toBeNull();
    expect(out.diagnostics[0]!.code).toBe("LOAM-T105");
  });

  it("fills an open-rim basin to the highest fluid-stable level it can hold", () => {
    // A bowl whose rim ring dips to the bowl floor on one side, but whose
    // *surroundings* stand high: the old rule reported "interior does not sit
    // below its rim" and left it dry.
    const region: Region = centeredRegion(64, 64);
    const field = flatField(100, region);
    const columns: number[] = [];
    for (let j = 20; j < 44; j++) {
      for (let i = 20; i < 44; i++) {
        const idx = j * 64 + i;
        field.values[idx] = 80;
        columns.push(idx);
      }
    }
    const out = {
      markers: [],
      calderas: [],
      basins: [
        {
          editId: "lake",
          centerX: 0,
          centerZ: 0,
          radius: 12,
          waterY: null as number | null,
          columns: Int32Array.from(columns),
        },
      ],
      diagnostics: [{ code: "LOAM-T105", editId: "lake", message: "basin rim is not closed" }],
      order: ["lake"],
      footprints: [],
      noFlood: new Uint8Array(64 * 64),
    };
    resolveOpenBasins(field, out);

    // One block of bank below the surrounding ground, and the whole bowl wet.
    expect(out.basins[0]!.waterY).toBe(99);
    expect(out.basins[0]!.columns.length).toBe(columns.length);
    // ...and the diagnostic is now an informational note naming the level.
    expect(out.diagnostics[0]!.severity).toBe("note");
    expect(out.diagnostics[0]!.message).toContain("y=99");
    expect(out.diagnostics[0]!.code).toBe("LOAM-T105");
  });

  it("only fills as high as the lowest real spillway, and stays dry with none", () => {
    const region: Region = centeredRegion(64, 64);
    const field = flatField(100, region);
    const columns: number[] = [];
    for (let j = 20; j < 44; j++) {
      for (let i = 20; i < 44; i++) {
        const idx = j * 64 + i;
        field.values[idx] = 80;
        columns.push(idx);
      }
    }
    // A notch in the wall at y=90 drains everything above 90.
    for (let i = 20; i < 44; i++) field.values[19 * 64 + i] = 90;
    const basin = {
      editId: "lake",
      centerX: 0,
      centerZ: 0,
      radius: 12,
      waterY: null as number | null,
      columns: Int32Array.from(columns),
    };
    const out = {
      markers: [],
      calderas: [],
      basins: [basin],
      diagnostics: [],
      order: ["lake"],
      footprints: [],
      noFlood: new Uint8Array(64 * 64),
    };
    resolveOpenBasins(field, out);
    expect(basin.waterY).toBe(90);

    // A bowl on a slope has no stable level at all, and stays dry.
    const slope = new HeightField(region);
    for (let j = 0; j < 64; j++) {
      for (let i = 0; i < 64; i++) slope.values[j * 64 + i] = 100 - j;
    }
    const dry = {
      ...out,
      basins: [{ ...basin, waterY: null as number | null, columns: Int32Array.from(columns) }],
    };
    resolveOpenBasins(slope, dry);
    expect(dry.basins[0]!.waterY).toBeNull();
  });

  it("leaves a basin the sea already reaches to the ocean", () => {
    const region: Region = centeredRegion(64, 64);
    const field = flatField(100, region);
    const columns: number[] = [];
    for (let j = 20; j < 44; j++) {
      for (let i = 20; i < 44; i++) {
        const idx = j * 64 + i;
        field.values[idx] = 40;
        columns.push(idx);
      }
    }
    const oceanMask = new Uint8Array(64 * 64);
    for (const idx of columns) oceanMask[idx] = 1;
    const basin = {
      editId: "lake",
      centerX: 0,
      centerZ: 0,
      radius: 12,
      waterY: null as number | null,
      columns: Int32Array.from(columns),
    };
    resolveOpenBasins(
      field,
      {
        markers: [],
        calderas: [],
        basins: [basin],
        diagnostics: [],
        order: ["lake"],
        footprints: [],
        noFlood: new Uint8Array(64 * 64),
      },
      { seaLevel: SEA, oceanMask },
    );
    expect(basin.waterY).toBeNull();
  });

  it("basin without water requests no fill at all", () => {
    const field = flatField(100);
    const out = applyEdits(field, [{ id: "b", verb: "basin", at: [0.5, 0.5], irregularity: 0 }], ctx());
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
    const edit: TerrainEdit = { id: "p", verb: "peak", at: [0.5, 0.5], radius: 50, height: 70, irregularity: 0 };
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

// ---------------------------------------------------------------------------
// G2.5a — organic shaping
// ---------------------------------------------------------------------------

/** Columns of `field` that differ from `base`, as a plain index set. */
function touched(field: HeightField, base: Float64Array): number[] {
  const out: number[] = [];
  for (let k = 0; k < field.values.length; k++) {
    if (Math.abs(field.values[k]! - base[k]!) > 1e-9) out.push(k);
  }
  return out;
}

/** Distance from the region centre to each touched column, in blocks. */
function radii(field: HeightField, base: Float64Array): number[] {
  const { x0, z0, width } = field.region;
  return touched(field, base).map((idx) => {
    const x = x0 + (idx % width);
    const z = z0 + Math.floor(idx / width);
    return Math.sqrt(x * x + z * z);
  });
}

describe("organic radial falloff", () => {
  const RADIAL: readonly TerrainEdit["verb"][] = ["peak", "volcano", "island", "plateau", "basin"];

  it("irregularity 0 leaves every radial verb a perfect circle", () => {
    for (const verb of RADIAL) {
      const field = flatField(120);
      const base = Float64Array.from(field.values);
      applyEdits(field, [{ id: verb, verb, at: [0.5, 0.5], radius: 60, irregularity: 0 }], ctx());
      const r = radii(field, base);
      expect(r.length).toBeGreaterThan(0);
      // every touched column is inside the nominal radius, and the extreme ones
      // reach it — a disc, to within the grid's own quantization
      expect(Math.max(...r)).toBeLessThan(60);
      expect(Math.max(...r)).toBeGreaterThan(59);
    }
  });

  it("irregularity pushes the outline off the circle in both directions", () => {
    for (const verb of RADIAL) {
      const field = flatField(120);
      const base = Float64Array.from(field.values);
      applyEdits(field, [{ id: verb, verb, at: [0.5, 0.5], radius: 60, irregularity: 0.3 }], ctx());
      const r = radii(field, base);
      // the boundary now reaches beyond the nominal radius somewhere...
      expect(Math.max(...r)).toBeGreaterThan(60);
      // ...and falls short of it somewhere else, which a circle cannot do
      const boundary = boundaryRadiusByOctant(field, base);
      expect(Math.min(...boundary)).toBeLessThan(58);
      expect(Math.max(...boundary)).toBeGreaterThan(62);
    }
  });

  it("gives two features with different ids different outlines", () => {
    const outline = (id: string): number[] => {
      const field = flatField(120);
      const base = Float64Array.from(field.values);
      applyEdits(field, [{ id, verb: "peak", at: [0.5, 0.5], radius: 60 }], ctx());
      return boundaryRadiusByOctant(field, base);
    };
    expect(outline("alpha")).not.toEqual(outline("beta"));
    expect(outline("alpha")).toEqual(outline("alpha"));
  });

  it("keeps a modulated volcano's caldera concentric with its cone", () => {
    const field = flatField(80);
    const out = applyEdits(
      field,
      [
        {
          id: "krak",
          verb: "volcano",
          at: [0.5, 0.5],
          radius: 64,
          height: 80,
          calderaDepth: 12,
          irregularity: 0.35,
        },
      ],
      ctx(),
    );
    const cal = out.calderas[0]!;
    // the rim is still a rim: every interior column sits below it, and the
    // truncation height is the same all the way round despite the lobes
    expect(cal.columns.length).toBeGreaterThan(0);
    for (const idx of cal.columns) expect(field.values[idx]!).toBeLessThan(cal.rimY);
    expect(cal.lavaY).toBeLessThan(cal.rimY);
    // the crater sits well inside the cone, not spilling out of a narrow lobe
    for (const idx of cal.columns) {
      const x = REGION.x0 + (idx % REGION.width);
      const z = REGION.z0 + Math.floor(idx / REGION.width);
      expect(Math.sqrt(x * x + z * z)).toBeLessThan(64 * 0.28 * 1.5);
    }
  });
});

/** The outermost touched radius in each of 32 angular sectors. */
const SECTORS = 32;
function boundaryRadiusByOctant(field: HeightField, base: Float64Array): number[] {
  const { x0, z0, width } = field.region;
  const best = new Array<number>(SECTORS).fill(0);
  for (const idx of touched(field, base)) {
    const x = x0 + (idx % width);
    const z = z0 + Math.floor(idx / width);
    const r = Math.sqrt(x * x + z * z);
    const a = Math.floor(
      ((Math.atan2(z, x) / (2 * Math.PI)) * SECTORS + SECTORS) % SECTORS,
    );
    if (r > best[a]!) best[a] = r;
  }
  return best;
}

describe("organic corridors", () => {
  const straight: TerrainEdit["course"] = [
    [0.1, 0.5],
    [0.9, 0.5],
  ];

  it("meanders the centreline away from the straight course", () => {
    const field = flatField(120);
    const base = Float64Array.from(field.values);
    applyEdits(
      field,
      [{ id: "wander", verb: "valley", course: straight, width: 24, depth: 20, meander: 1 }],
      ctx(),
    );
    // the trough's centre of mass drifts off z = 0 along its length
    const offsets: number[] = [];
    for (let x = -50; x <= 50; x += 10) {
      let bestZ = 0;
      let bestDrop = 0;
      for (let z = -60; z <= 60; z++) {
        const drop = base[field.clampedIndex(x, z)]! - field.at(x, z);
        if (drop > bestDrop) {
          bestDrop = drop;
          bestZ = z;
        }
      }
      offsets.push(bestZ);
    }
    expect(Math.max(...offsets.map(Math.abs))).toBeGreaterThan(4);
    // and it is not a constant sideways shift — it actually wanders
    expect(new Set(offsets).size).toBeGreaterThan(2);
  });

  it("varies the carve width along the course", () => {
    const field = flatField(120);
    const base = Float64Array.from(field.values);
    applyEdits(
      field,
      [{ id: "w", verb: "valley", course: straight, width: 40, depth: 20, meander: 0.001 }],
      ctx(),
    );
    const widths: number[] = [];
    for (let x = -50; x <= 50; x += 5) {
      let n = 0;
      for (let z = -60; z <= 60; z++) {
        if (base[field.clampedIndex(x, z)]! - field.at(x, z) > 1e-9) n++;
      }
      widths.push(n);
    }
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
    // within the documented ±30%
    expect(Math.max(...widths)).toBeLessThanOrEqual(Math.ceil(40 * 1.3) + 2);
  });

  it("tapers the ends instead of stopping at a blunt wall", () => {
    const field = flatField(120);
    const base = Float64Array.from(field.values);
    applyEdits(
      field,
      [{ id: "t", verb: "valley", course: straight, width: 30, depth: 30 }],
      ctx(),
    );
    const depthAt = (x: number): number => {
      let deepest = 0;
      for (let z = -60; z <= 60; z++) {
        const d = base[field.clampedIndex(x, z)]! - field.at(x, z);
        if (d > deepest) deepest = d;
      }
      return deepest;
    };
    const head = Math.round(REGION.x0 + 0.1 * REGION.width);
    // the carve is shallow at the mouth of the course and full depth well inside
    expect(depthAt(head + 2)).toBeLessThan(depthAt(head + 45));
    expect(depthAt(head + 45)).toBeGreaterThan(25);
  });

  it("keeps a meandered river descending monotonically to its mouth", () => {
    // sloping ground, high in the west, so the river has somewhere to run
    const field = new HeightField(REGION);
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) {
        field.values[j * REGION.width + i] = 180 - i * 0.5;
      }
    }
    const before = field.clone();
    applyEdits(
      field,
      [
        {
          id: "run",
          verb: "river",
          course: [
            [0.1, 0.3],
            [0.5, 0.6],
            [0.9, 0.4],
          ],
          width: 12,
          depth: 6,
          meander: 1,
        },
      ],
      ctx(),
    );
    // Re-derive the displaced curve exactly as the kernel did, then check the
    // bed it left behind never climbs on the way to the mouth.
    const seed = nodeSeed(813205n, "world.terrain.run");
    const shape = makeCorridorShape(refineCourse(REGION, [[0.1, 0.3], [0.5, 0.6], [0.9, 0.4]]), seed, 12, 1);
    const { elevations, reversed } = monotonicDescent(shape.samples, before);
    for (let k = 1; k < elevations.length; k++) {
      if (reversed) expect(elevations[k - 1]!).toBeGreaterThanOrEqual(elevations[k]! - 1e-9);
      else expect(elevations[k]!).toBeLessThanOrEqual(elevations[k - 1]! + 1e-9);
    }
    // and the carved channel itself descends from head to mouth, over the
    // stretch where the kernel runs at full amplitude (the tapered last
    // 1.5×width at each end is deliberately only partly cut)
    const bed: number[] = [];
    for (let k = 0; k < shape.samples.length; k += 20) {
      if (shape.taper[k]! < 0.999) continue;
      // the channel floor near the sample, not the single rounded column —
      // the meandered centreline does not land on grid points
      const p = shape.samples[k]!;
      let floor = Number.POSITIVE_INFINITY;
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const h = field.at(Math.round(p.x) + dx, Math.round(p.z) + dz);
          if (h < floor) floor = h;
        }
      }
      bed.push(floor);
    }
    const ordered = reversed ? bed.slice().reverse() : bed;
    for (let k = 1; k < ordered.length; k++) {
      // half a block of slack: the bed is continuous, the grid is not
      expect(ordered[k]!).toBeLessThanOrEqual(ordered[k - 1]! + 0.5);
    }
  });
});

describe("feature footprints", () => {
  it("records one footprint per edit, tagged by verb and id", () => {
    const field = flatField();
    const out = applyEdits(
      field,
      [
        { id: "cone", verb: "peak", at: [0.3, 0.3], radius: 40 },
        { id: "cut", verb: "valley", course: [[0.1, 0.7], [0.9, 0.7]] },
      ],
      ctx(),
    );
    expect(out.footprints.map((f) => f.editId)).toEqual(["cone", "cut"]);
    expect(out.footprints.map((f) => f.verb)).toEqual(["peak", "valley"]);
    for (const fp of out.footprints) {
      expect(fp.count).toBeGreaterThan(0);
      expect(fp.bits.length).toBe((REGION.width * REGION.depth + 7) >> 3);
    }
  });

  it("marks exactly the columns the edit changed", () => {
    const field = flatField();
    const base = Float64Array.from(field.values);
    const out = applyEdits(field, [{ id: "cone", verb: "peak", at: [0.5, 0.5], radius: 40 }], ctx());
    const fp = out.footprints[0]!;
    let marked = 0;
    for (let idx = 0; idx < field.values.length; idx++) {
      const changed = Math.abs(field.values[idx]! - base[idx]!) > 1e-9;
      if (footprintHas(fp, idx)) marked++;
      // every changed column is in the footprint (the converse allows the
      // zero-amplitude boundary ring)
      if (changed) expect(footprintHas(fp, idx)).toBe(true);
    }
    expect(marked).toBe(fp.count);
  });

  it("collects flooded:\"never\" carve columns into the noFlood mask", () => {
    const field = flatField();
    const out = applyEdits(
      field,
      [
        { id: "dry", verb: "valley", course: [[0.1, 0.5], [0.9, 0.5]], flooded: "never" },
        { id: "wet", verb: "valley", course: [[0.1, 0.8], [0.9, 0.8]] },
      ],
      ctx(),
    );
    const dry = out.footprints.find((f) => f.editId === "dry")!;
    const wet = out.footprints.find((f) => f.editId === "wet")!;
    let flagged = 0;
    for (let idx = 0; idx < out.noFlood.length; idx++) {
      if (out.noFlood[idx] === 1) {
        flagged++;
        expect(footprintHas(dry, idx)).toBe(true);
        expect(footprintHas(wet, idx)).toBe(false);
      }
    }
    expect(flagged).toBe(dry.count);
  });
});

/* -------------------------------------------------------------------------- */
/* pond chains — the sealess-river demotion                                    */
/* -------------------------------------------------------------------------- */

describe("resolvePondChains", () => {
  const W = 96;
  const CHANNEL_Z0 = 40;
  const CHANNEL_Z1 = 44;
  /** Where the three dips start along the channel, in grid i. */
  const DIPS = [15, 35, 55];

  /**
   * A landlocked channel: a plain at 100 with a five-wide bed cut to 90 and
   * three 5×5 dips in it at 85 — the shape a river carve leaves on a map that
   * never reaches sea level.
   */
  function channel(): { field: HeightField; out: EditComposition; ocean: Uint8Array } {
    const region: Region = centeredRegion(W, W);
    const field = flatField(100, region);
    const bits = new Uint8Array((W * W + 7) >> 3);
    const set = (idx: number): void => {
      bits[idx >> 3] = (bits[idx >> 3] as number) | (1 << (idx & 7));
    };
    let count = 0;
    for (let j = CHANNEL_Z0; j <= CHANNEL_Z1; j++) {
      for (let i = 8; i < W - 8; i++) {
        const idx = j * W + i;
        field.values[idx] = 90;
        set(idx);
        count++;
      }
    }
    for (const start of DIPS) {
      for (let j = CHANNEL_Z0; j <= CHANNEL_Z1; j++) {
        for (let i = start; i < start + 5; i++) field.values[j * W + i] = 85;
      }
    }

    const samples = [];
    for (let i = 8; i < W - 8; i++) {
      samples.push({ x: region.x0 + i, z: region.z0 + CHANNEL_Z0 + 2 });
    }

    const out: EditComposition = {
      markers: [],
      calderas: [],
      basins: [],
      courses: [{ editId: "riv", verb: "river", flooded: "auto", samples }],
      diagnostics: [],
      order: ["riv"],
      footprints: [{ editId: "riv", verb: "river", bits, count }],
      noFlood: new Uint8Array(W * W),
    };
    return { field, out, ocean: new Uint8Array(W * W) };
  }

  it("beads a landlocked river into one pond per local minimum", () => {
    const { field, out, ocean } = channel();
    const result = resolvePondChains(field, out, { seaLevel: SEA, oceanMask: ocean });
    expect(result).toHaveLength(1);
    expect(result[0]!.editId).toBe("riv");
    expect(result[0]!.ponds).toBe(DIPS.length);
    expect(out.basins).toHaveLength(DIPS.length);
    for (const basin of out.basins) {
      expect(basin.waterY).not.toBeNull();
      expect(basin.columns.length).toBeGreaterThanOrEqual(POND_MIN_COLUMNS);
    }
  });

  it("reports what it did as an informational note naming the count", () => {
    const { field, out, ocean } = channel();
    resolvePondChains(field, out, { seaLevel: SEA, oceanMask: ocean });
    const note = out.diagnostics.find((d) => d.code === "LOAM-T112");
    expect(note?.severity).toBe("note");
    expect(note?.editId).toBe("riv");
    expect(note?.message).toContain(`${DIPS.length} ponds`);
  });

  it("leaves the stretches between the ponds dry", () => {
    const { field, out, ocean } = channel();
    resolvePondChains(field, out, { seaLevel: SEA, oceanMask: ocean });
    const wet = new Set<number>();
    for (const basin of out.basins) for (const idx of basin.columns) wet.add(idx);
    // The bed halfway between the first two dips is bare channel floor.
    const between = (CHANNEL_Z0 + 2) * W + Math.floor((DIPS[0]! + DIPS[1]!) / 2 + 3);
    expect(wet.has(between)).toBe(false);
    // ...and no two ponds share a column.
    expect(wet.size).toBe(out.basins.reduce((n, b) => n + b.columns.length, 0));
  });

  it("records only levels the fluid settle proves stable", () => {
    const { field, out, ocean } = channel();
    resolvePondChains(field, out, { seaLevel: SEA, oceanMask: ocean });
    const floorAt = (idx: number): number => Math.floor(field.values[idx] as number);
    for (const basin of out.basins) {
      const settled = stableFluidColumns({
        width: W,
        depth: W,
        columns: basin.columns,
        level: basin.waterY as number,
        floorAt,
        topAt: floorAt,
      });
      // Every recorded column survives its own settle: zero unstable fluid.
      expect(settled.count).toBe(basin.columns.length);
    }
  });

  it("leaves a river that reaches the sea entirely alone", () => {
    const { field, out, ocean } = channel();
    ocean[(CHANNEL_Z0 + 2) * W + 20] = 1;
    const result = resolvePondChains(field, out, { seaLevel: SEA, oceanMask: ocean });
    expect(result).toEqual([]);
    expect(out.basins).toEqual([]);
    expect(out.diagnostics).toEqual([]);
  });

  it('leaves a "never" river alone — the author asked for a dry channel', () => {
    const { field, out, ocean } = channel();
    out.courses = [{ ...(out.courses[0] as (typeof out.courses)[number]), flooded: "never" }];
    expect(resolvePondChains(field, out, { seaLevel: SEA, oceanMask: ocean })).toEqual([]);
    expect(out.basins).toEqual([]);
  });

  it("never touches the heightfield", () => {
    const { field, out, ocean } = channel();
    const before = Float64Array.from(field.values);
    resolvePondChains(field, out, { seaLevel: SEA, oceanMask: ocean });
    expect([...field.values]).toEqual([...before]);
  });

  it("is byte-identical run twice", () => {
    const a = channel();
    const b = channel();
    resolvePondChains(a.field, a.out, { seaLevel: SEA, oceanMask: a.ocean });
    resolvePondChains(b.field, b.out, { seaLevel: SEA, oceanMask: b.ocean });
    expect(JSON.stringify(a.out.basins, replacer)).toBe(JSON.stringify(b.out.basins, replacer));
  });
});

/** JSON replacer that renders typed arrays as plain arrays. */
function replacer(_key: string, value: unknown): unknown {
  return value instanceof Int32Array ? [...value] : value;
}
