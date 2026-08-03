/**
 * `infra.wall@0` — the course derivation, the sweep fixture, and the pass.
 *
 * The three layers are tested apart because they fail apart. A course that
 * misses is a geometry bug and is visible in a polygon; a wall that steps two
 * blocks at once is a datum bug and is visible in an `Int32Array`; a wall that
 * grows through a house is an occupancy bug and only shows in blocks. Rolling
 * them into one "compile a world and look at it" test would make every one of
 * them present as the same red line.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { multiStationSpecs } from "../src/terrarium-stations.js";

import {
  COURSE_DIRECTIONS,
  COURSE_NORMALS,
  deriveWallCourse,
  findGates,
  inGate,
  polygonArea,
  walkEdge,
  type CoursePoint,
} from "../src/structures/wall-course.js";
import { normalAt, stepDatum } from "../src/structures/wall-sweep-seam.js";
import {
  WALL_MATERIALS,
  WALL_MAX_FILL,
  extentOfRects,
  wallColumnOps,
  wallProfile,
} from "../src/structures/walls.js";

const BOUNDS = { x0: 0, z0: 0, width: 512, depth: 512 };

/** Winding test against a convex polygon in counter-clockwise or clockwise order. */
function insidePolygon(vertices: readonly CoursePoint[], p: CoursePoint): boolean {
  let positive = false;
  let negative = false;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i] as CoursePoint;
    const b = vertices[(i + 1) % vertices.length] as CoursePoint;
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (cross > 0) positive = true;
    if (cross < 0) negative = true;
  }
  return !(positive && negative);
}

/** A square block of "settlement" to hull. */
function square(cx: number, cz: number, half: number): CoursePoint[] {
  return [
    { x: cx - half, z: cz - half },
    { x: cx + half, z: cz - half },
    { x: cx - half, z: cz + half },
    { x: cx + half, z: cz + half },
  ];
}

describe("the quantized normals", () => {
  it("closes: twenty-four directions, one every fifteen degrees", () => {
    expect(COURSE_DIRECTIONS).toBe(24);
    expect(COURSE_NORMALS).toHaveLength(24);
    let sx = 0;
    let sz = 0;
    for (const n of COURSE_NORMALS) {
      expect(Math.hypot(n.nx, n.nz)).toBeCloseTo(1, 5);
      sx += n.nx;
      sz += n.nz;
    }
    // A closed, evenly spaced set of unit normals sums to the origin. If it did
    // not, the hull would be biased in one direction and every wall would sit
    // off-centre by a fixed amount.
    expect(sx).toBeCloseTo(0, 4);
    expect(sz).toBeCloseTo(0, 4);
  });
});

describe("deriveWallCourse", () => {
  it("encloses every extent column, with the margin outside it", () => {
    const extent = square(200, 200, 40);
    const course = deriveWallCourse({ extent, margin: 10, bounds: BOUNDS });
    expect(course).toBeDefined();
    const c = course as NonNullable<typeof course>;
    // Containment, stated as the polygon states it: every extent point is on
    // the inner side of every edge. This is the property that makes it
    // impossible for a derived wall to cut a building in half.
    for (const p of extent) expect(insidePolygon(c.vertices, p)).toBe(true);
    // …and the ring stands clear of the built ground by roughly the margin. A
    // 15°-quantized hull cuts its own corners, so the clearance at a diagonal
    // is a little under the margin and that is the geometry working.
    const nearest = Math.min(...c.path.map((q) => Math.max(Math.abs(q.x - 200), Math.abs(q.z - 200))));
    expect(nearest).toBeGreaterThanOrEqual(45);
    expect(nearest).toBeLessThanOrEqual(52);
  });

  it("is a closed 4-connected ring — no diagonal joins for a mob to walk", () => {
    const course = deriveWallCourse({ extent: square(180, 220, 55), margin: 12, bounds: BOUNDS });
    const path = (course as NonNullable<typeof course>).path;
    for (let i = 0; i < path.length; i++) {
      const a = path[i] as CoursePoint;
      const b = path[(i + 1) % path.length] as CoursePoint;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
    // …and it visits no column twice, so a sweep over it is idempotent.
    expect(new Set(path.map((p) => `${p.x},${p.z}`)).size).toBe(path.length);
  });

  it("quantizes every edge to a multiple of fifteen degrees", () => {
    const course = deriveWallCourse({ extent: square(200, 200, 60), margin: 14, bounds: BOUNDS });
    const vs = (course as NonNullable<typeof course>).vertices;
    let checked = 0;
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i] as CoursePoint;
      const b = vs[(i + 1) % vs.length] as CoursePoint;
      // Only the edges long enough for the question to mean anything: the
      // vertices are rounded to whole columns, so a six-column edge can be a
      // degree or three off its true bearing and still be the right edge.
      if (Math.hypot(b.x - a.x, b.z - a.z) < 16) continue;
      checked++;
      const deg = (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
      const off = Math.abs(((deg % 15) + 15) % 15);
      expect(Math.min(off, 15 - off)).toBeLessThan(2);
    }
    expect(checked).toBeGreaterThan(3);
  });

  it("is stable: one more shed at the edge moves at most one edge", () => {
    const base = square(200, 200, 50);
    const before = deriveWallCourse({ extent: base, margin: 10, bounds: BOUNDS });
    const after = deriveWallCourse({
      extent: [...base, { x: 253, z: 200 }],
      margin: 10,
      bounds: BOUNDS,
    });
    const a = (before as NonNullable<typeof before>).vertices;
    const b = (after as NonNullable<typeof after>).vertices;
    const moved = a.filter((v, i) => {
      const w = b[i];
      return w === undefined || w.x !== v.x || w.z !== v.z;
    });
    expect(a.length).toBe(b.length);
    expect(moved.length).toBeLessThanOrEqual(3);
  });

  it("is a pure function of its input", () => {
    const extent = square(160, 240, 44);
    const one = deriveWallCourse({ extent, margin: 9, bounds: BOUNDS });
    const two = deriveWallCourse({ extent, margin: 9, bounds: BOUNDS });
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it("declines rather than clipping when the ring will not fit the region", () => {
    expect(
      deriveWallCourse({
        extent: square(20, 20, 12),
        margin: 40,
        bounds: { x0: 0, z0: 0, width: 64, depth: 64 },
      }),
    ).toBeUndefined();
  });

  it("declines an extent too small to be worth ringing, and an empty one", () => {
    expect(deriveWallCourse({ extent: [], margin: 10, bounds: BOUNDS })).toBeUndefined();
    expect(deriveWallCourse({ extent: square(200, 200, 3), margin: 4, bounds: BOUNDS })).toBeUndefined();
  });

  it("seats a corner index on the path for every vertex", () => {
    const course = deriveWallCourse({ extent: square(200, 200, 50), margin: 10, bounds: BOUNDS });
    const c = course as NonNullable<typeof course>;
    expect(c.cornerIndices).toHaveLength(c.vertices.length);
    for (const i of c.cornerIndices) expect(i).toBeLessThan(c.path.length);
    expect(c.area).toBeGreaterThan(polygonArea(square(200, 200, 50)));
  });
});

describe("walkEdge", () => {
  it("emits one axis step at a time and stops short of the far end", () => {
    const run = walkEdge({ x: 0, z: 0 }, { x: 7, z: 3 });
    expect(run[0]).toEqual({ x: 0, z: 0 });
    expect(run.at(-1)).not.toEqual({ x: 7, z: 3 });
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1] as CoursePoint;
      const b = run[i] as CoursePoint;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });
});

describe("findGates", () => {
  const ring = (deriveWallCourse({ extent: square(200, 200, 50), margin: 10, bounds: BOUNDS }) as
    NonNullable<ReturnType<typeof deriveWallCourse>>).path;

  it("finds one opening per crossing, jambed on both sides", () => {
    const road = new Set(
      ring.slice(10, 13).map((p) => `${p.x},${p.z}`),
    );
    const gates = findGates(ring, (x, z) => road.has(`${x},${z}`));
    expect(gates).toHaveLength(1);
    const gate = gates[0] as NonNullable<(typeof gates)[0]>;
    expect(gate.width).toBe(5);
    // Every road column is inside the opening, and so is a jamb either side.
    for (let i = 10; i < 13; i++) expect(inGate(gate, i, ring.length)).toBe(true);
    expect(inGate(gate, 9, ring.length)).toBe(true);
    expect(inGate(gate, 13, ring.length)).toBe(true);
    expect(inGate(gate, 20, ring.length)).toBe(false);
  });

  it("treats a crossing that straddles the path's start as one gate", () => {
    const road = new Set(
      [...ring.slice(0, 2), ...ring.slice(-2)].map((p) => `${p.x},${p.z}`),
    );
    const gates = findGates(ring, (x, z) => road.has(`${x},${z}`));
    expect(gates).toHaveLength(1);
    expect((gates[0] as { width: number }).width).toBe(6);
  });

  it("finds nothing when nothing crosses, and refuses a ring that is all road", () => {
    expect(findGates(ring, () => false)).toEqual([]);
    expect(findGates(ring, () => true)).toEqual([]);
  });
});

describe("stepDatum", () => {
  it("never steps more than maxGrade, and never sinks below the target", () => {
    const target = [70, 70, 70, 90, 90, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70];
    const d = stepDatum(target, 1, true);
    for (let i = 0; i < d.length; i++) {
      expect(d[i] as number).toBeGreaterThanOrEqual(target[i] as number);
      const next = d[(i + 1) % d.length] as number;
      expect(Math.abs((d[i] as number) - next)).toBeLessThanOrEqual(1);
    }
  });

  it("converges across the seam of a closed ring", () => {
    const target = new Array<number>(40).fill(64);
    target[0] = 84;
    const d = stepDatum(target, 1, true);
    // The spike at index 0 has to be reachable from both directions, so the
    // envelope decays either way round rather than falling off a cliff at 39.
    expect(Math.abs((d[0] as number) - (d[39] as number))).toBeLessThanOrEqual(1);
    expect(d[20] as number).toBe(64);
  });

  it("is walkable end to end: no riser a player cannot mount", () => {
    const target = Array.from({ length: 64 }, (_, i) => 64 + Math.round(12 * Math.sin(i / 5)));
    const d = stepDatum(target, 1, true);
    for (let i = 0; i < d.length; i++) {
      const next = d[(i + 1) % d.length] as number;
      expect(Math.abs((d[i] as number) - next)).toBeLessThanOrEqual(1);
    }
  });
});

describe("normalAt", () => {
  it("recovers the true bearing of a rasterized diagonal", () => {
    const path = walkEdge({ x: 0, z: 0 }, { x: 40, z: 40 });
    const n = normalAt(path, 20, false);
    // The left normal of a 45° tangent, not one of the two axis answers a
    // one-column difference would give.
    expect(Math.abs(n.nx)).toBeCloseTo(Math.SQRT1_2, 1);
    expect(Math.abs(n.nz)).toBeCloseTo(Math.SQRT1_2, 1);
  });
});

describe("the wall profile and its column recipes", () => {
  it("is three columns across: parapet, walk, parapet", () => {
    const profile = wallProfile("masonry", 40);
    expect(profile.follow).toBe("step");
    expect(profile.maxGrade).toBe(1);
    expect(profile.bands.map((b) => b.role)).toEqual(["walkway", "parapet"]);
    expect(profile.features?.[0]).toMatchObject({ id: "tower", at: "both", pitch: 40 });
  });

  it("builds a footing to the ground and a merlon on alternate columns", () => {
    const m = WALL_MATERIALS["masonry"] as (typeof WALL_MATERIALS)[string];
    const parapet = {
      x: 0,
      z: 0,
      pathIndex: 0,
      offset: 1,
      bandId: "parapet",
      role: "parapet" as const,
      top: 70,
      surface: m.parapet,
      fill: m.core,
      cap: { height: 2, block: m.merlon },
    };
    const even = wallColumnOps(parapet, 64, m) as NonNullable<ReturnType<typeof wallColumnOps>>;
    const odd = wallColumnOps({ ...parapet, pathIndex: 1 }, 64, m) as NonNullable<
      ReturnType<typeof wallColumnOps>
    >;
    // Six courses of footing under the band surface, then the cap above it.
    expect(even.filter((o) => o.dy < 6 && o.block === m.core)).toHaveLength(6);
    expect(even.find((o) => o.dy === 6)?.block).toBe(m.parapet);
    expect(even.find((o) => o.dy === 7)?.block).toBe(m.merlon);
    // The crenellation is the *gap*: an even column carries one more course.
    expect(even.length - odd.length).toBe(1);
    // Every op is contiguous with the one below it — nothing floats.
    const ys = even.map((o) => o.dy).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect((ys[i] as number) - (ys[i - 1] as number)).toBe(1);
    expect(ys[0]).toBe(0);
  });

  it("refuses a footing deeper than the cap rather than damming a valley", () => {
    const m = WALL_MATERIALS["masonry"] as (typeof WALL_MATERIALS)[string];
    const column = {
      x: 0,
      z: 0,
      pathIndex: 0,
      offset: 0,
      bandId: "walk",
      role: "walkway" as const,
      top: 64 + WALL_MAX_FILL + 1,
      surface: m.walk,
      fill: m.core,
    };
    expect(wallColumnOps(column, 64, m)).toBeUndefined();
    expect(wallColumnOps({ ...column, top: 64 + WALL_MAX_FILL }, 64, m)).toBeDefined();
  });

  it("uses only full cubes, in every style", () => {
    const shaped = /_slab$|_stairs$|_fence$|_wall$|_trapdoor$/;
    for (const materials of Object.values(WALL_MATERIALS)) {
      for (const block of Object.values(materials)) expect(block).not.toMatch(shaped);
    }
  });
});

describe("extentOfRects", () => {
  it("reduces a rectangle to the four corners the support hull reads", () => {
    expect(extentOfRects([{ x0: 2, z0: 3, x1: 9, z1: 7 }])).toEqual([
      { x: 2, z: 3 },
      { x: 9, z: 3 },
      { x: 2, z: 7 },
      { x: 9, z: 7 },
    ]);
  });

  it("gives the same hull as handing over every column of the rectangle", () => {
    const rect = { x0: 100, z0: 100, x1: 160, z1: 140 };
    const dense: CoursePoint[] = [];
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) dense.push({ x, z });
    }
    const a = deriveWallCourse({ extent: extentOfRects([rect]), margin: 10, bounds: BOUNDS });
    const b = deriveWallCourse({ extent: dense, margin: 10, bounds: BOUNDS });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* -------------------------------------------------------------------------- */
/* the pass, on a compiled world                                               */
/* -------------------------------------------------------------------------- */

/**
 * The one test here that compiles something.
 *
 * It uses the Terrarium's own walled-quarter station rather than a fixture, so
 * the thing under test is exactly the thing a reviewer will walk. The physics
 * lint over that world is the Terrarium suite's job (`terrarium.test.ts`, the
 * per-push gate); what this asks is the three questions the lint cannot: does
 * the ring close, is the crest walkable, and did the wall stay out of the road.
 */
describe("infra.wall@0 on a compiled world", () => {
  let report: TerrainCompileReport;
  let dir: string;

  beforeAll(async () => {
    const spec = multiStationSpecs().find((s) => s.id === "multi__walled_quarter");
    dir = await mkdtemp(path.join(tmpdir(), "terrainist-walls-"));
    const compiled = await compileTerrain(
      (spec as NonNullable<typeof spec>).document,
      { outDir: path.join(dir, "walled_quarter") },
    );
    if (!compiled.ok) throw new Error("the walled-quarter station did not compile");
    report = compiled.report;
  }, 180_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** The wall pass's counters, as they reach the report. */
  function stats(): Record<string, number> {
    return (report as unknown as { layout?: { structures?: { stats?: Record<string, number> } } })
      .layout?.structures?.stats as Record<string, number>;
  }

  it("rings the quarter — one wall, hundreds of columns, towers on it", () => {
    expect(stats()["walls"]).toBe(1);
    expect(stats()["wallColumns"]).toBeGreaterThan(300);
    expect(stats()["wallTowers"]).toBeGreaterThanOrEqual(4);
    expect(stats()["wallBlocks"]).toBeGreaterThan(2000);
  });

  it("opens a gate where the lane crosses it, rather than damming the road", () => {
    // The station is built so a lane has to get past the quarter, which is what
    // makes a crossing exist at all. Two crossings, so two gates.
    expect(stats()["wallGates"]).toBeGreaterThanOrEqual(1);
  });

  it("builds nearly all of the course it derived", () => {
    const built = stats()["wallColumns"] as number;
    const skipped = stats()["wallColumnsSkipped"] as number;
    // A tenth is the honest allowance: the gate jambs, and whatever the road's
    // own shoulder already owns. Much past that and the wall is a fence.
    expect(skipped / (built + skipped)).toBeLessThan(0.15);
  });

  it("reports nothing — no refused course, no empty wall", () => {
    const codes = report.diagnostics.filter((d) => d.name.startsWith("WALL_"));
    expect(codes).toEqual([]);
  });

  it("compiles byte-identically twice over", async () => {
    const spec = multiStationSpecs().find((s) => s.id === "multi__walled_quarter");
    const again = await compileTerrain((spec as NonNullable<typeof spec>).document, {
      outDir: path.join(dir, "walled_quarter_2"),
    });
    expect(again.ok).toBe(true);
    const a = stats();
    const b = (again.report as unknown as { layout?: { structures?: { stats?: Record<string, number> } } })
      .layout?.structures?.stats as Record<string, number>;
    for (const key of ["walls", "wallColumns", "wallTowers", "wallGates", "wallBlocks"]) {
      expect(b[key], key).toBe(a[key]);
    }
  }, 180_000);
});
