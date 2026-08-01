/**
 * Fabric v3, C1 — the city plan: arterials first, districts as the residue.
 *
 * Four layers, in increasing cost:
 *
 * 1. **Rotation without trigonometry** — the 15° table and the two functions
 *    built on it. Cheap, and everything geometric downstream depends on them
 *    agreeing bit for bit between runtimes.
 * 2. **The clipped skeleton** — `buildStreetGraph` with a mask and an
 *    orientation. The dead ends it produces are asserted *as a feature*, and
 *    the back-compat case (neither field passed) is pinned against a digest so
 *    a future change to the clipped path cannot silently move an authored
 *    rectangular district.
 * 3. **The plan** — `buildCityPlan` over a synthetic bay. Cells tile, cells do
 *    not overlap, a diagonal really does leave non-rectangular cells, and two
 *    runs from one seed agree byte for byte.
 * 4. **The authoring surface** — the `city` node through the real validator.
 *
 * A compiled, physics-linted city is deliberately *not* here: it costs a minute
 * and `fabric.test.ts` already owns that shape of test for a district. C1's
 * compiled world is the probe in the track's report.
 */

import { describe, expect, it } from "vitest";

import { HeightField, centeredRegion, nodeSeed, type Region } from "@terrainist/stdlib";
import { DISTRICT_CHARACTERS, validateSettlementDocument } from "@terrainist/spec";

import {
  ARTERIAL_WIDTH,
  arterialAt,
  buildCityPlan,
  cellContains,
  junctionsOf,
  type CityPlan,
  type DistrictCell,
  type DistrictCharacter,
} from "../src/layout/city.js";
import {
  TRIG_15,
  boundaryEndpoints,
  buildStreetGraph,
  densify4,
  quantizeHeading,
  rotateOffset,
  type StreetGraph,
} from "../src/layout/streets.js";
import type { Point2, Rect } from "../src/layout/frames.js";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const CITY_BOUNDS: Rect = { x0: -160, z0: -150, x1: 159, z1: 149 };

/**
 * A synthetic bay: flat land above a shoreline that runs across the south of
 * the footprint with a bite taken out of it, so the drive has something with a
 * shape to follow rather than a straight edge.
 */
function bayField(region: Region): { field: HeightField; water: Uint8Array } {
  const field = new HeightField(region);
  const water = new Uint8Array(region.width * region.depth);
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      const k = j * region.width + i;
      // The shore: a straight coast at z = 96, pushed north to z = 40 in a bay
      // between x = -40 and x = 40.
      const inlet = x > -40 && x < 40;
      const shore = inlet ? 40 : 96;
      if (z >= shore) {
        water[k] = 1;
        field.values[k] = 58;
      } else {
        // A gentle rise inland, so the spine has a gradient to prefer.
        field.values[k] = 72 + Math.floor((shore - z) / 60);
      }
    }
  }
  return { field, water };
}

function planFixture(overrides: Record<string, unknown> = {}): CityPlan {
  const region = centeredRegion(384, 384);
  const { field, water } = bayField(region);
  const result = buildCityPlan({
    bounds: CITY_BOUNDS,
    field,
    water,
    seaLevel: 62,
    seed: nodeSeed(20260801n, "world.harbourtown", ""),
    params: { size: "large", coastal: true, diagonals: 1, ...overrides },
  });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}

/** A plan's cells as `"x,z"` key sets, one per cell. */
function cellKeys(cell: DistrictCell): Set<string> {
  const out = new Set<string>();
  const b = cell.bounds;
  for (let z = b.z0; z <= b.z1; z++) {
    for (let x = b.x0; x <= b.x1; x++) {
      if (cellContains(cell, x, z)) out.add(`${x},${z}`);
    }
  }
  return out;
}

/** A stable digest of a value, for the back-compat pin. */
function digest(value: unknown): string {
  const text = JSON.stringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + text.charCodeAt(i), 2654435761) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}-${text.length}`;
}

/* -------------------------------------------------------------------------- */
/* 1. rotation, without trigonometry                                           */
/* -------------------------------------------------------------------------- */

describe("15° rotation", () => {
  it("has 24 unit-ish entries, all of the same magnitude", () => {
    expect(TRIG_15).toHaveLength(24);
    for (const [sin, cos] of TRIG_15) {
      const magnitude = sin * sin + cos * cos;
      // (4096 ± ½)² = 16 777 216 ± 4096.
      expect(Math.abs(magnitude - 4096 * 4096)).toBeLessThan(9000);
    }
  });

  it("reads a cardinal heading off a direction vector", () => {
    expect(quantizeHeading(0, 1)).toBe(0); // +Z
    expect(quantizeHeading(1, 0)).toBe(90); // +X
    expect(quantizeHeading(0, -1)).toBe(180);
    expect(quantizeHeading(-1, 0)).toBe(270);
    expect(quantizeHeading(1, 1)).toBe(45);
    expect(quantizeHeading(0, 0)).toBe(0);
  });

  it("quantises a near-diagonal to the nearest fifteenth", () => {
    // 1 : 4 is 14.04°, which is nearer 15 than 0.
    expect(quantizeHeading(1, 4)).toBe(15);
    // 1 : 12 is 4.8°, which is nearer 0.
    expect(quantizeHeading(1, 12)).toBe(0);
  });

  it("turns the local v axis onto the heading", () => {
    expect(rotateOffset(0, 1, 0)).toEqual({ x: 0, z: 1 });
    expect(rotateOffset(0, 100, 90)).toEqual({ x: 100, z: 0 });
    expect(rotateOffset(100, 0, 90)).toEqual({ x: 0, z: -100 });
    // 45° on a 100-long arm: 100·cos45 = 70.7 → 71.
    expect(rotateOffset(0, 100, 45)).toEqual({ x: 71, z: 71 });
  });

  it("is a pure integer table — the same answer every call", () => {
    for (let k = 0; k < 24; k++) {
      expect(rotateOffset(37, -19, k * 15)).toEqual(rotateOffset(37, -19, k * 15));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the clipped, rotated skeleton                                            */
/* -------------------------------------------------------------------------- */

describe("the clipped street skeleton", () => {
  const BOUNDS: Rect = { x0: 0, z0: 0, x1: 159, z1: 159 };

  /** A wedge: everything below the anti-diagonal, which is not a rectangle. */
  function wedge(): Uint8Array {
    const mask = new Uint8Array(160 * 160);
    for (let z = 0; z < 160; z++) {
      for (let x = 0; x < 160; x++) {
        if (x + z < 150) mask[z * 160 + x] = 1;
      }
    }
    return mask;
  }

  const plain = (extra: Record<string, unknown> = {}): StreetGraph => {
    const result = buildStreetGraph({
      bounds: BOUNDS,
      fabric: "grid",
      seed: nodeSeed(20260801n, "world.cell", ""),
      blockSize: 40,
      sidewalk: 2,
      ...extra,
    });
    if (!result.ok) throw new Error(result.reason);
    return result.graph;
  };

  it("is byte-identical to fabric v2 when neither field is passed", () => {
    // The pin. `buildStreetGraph` on a bare rectangle must keep producing what
    // it produced before C1 existed; if this digest moves, an authored
    // rectangular district moved with it, and that is a decision, not a tweak.
    expect(digest(plain())).toBe("65853e5f-99a825ab-27980");
  });

  it("treats orientation 0 and no orientation as the same request", () => {
    expect(JSON.stringify(plain())).toBe(JSON.stringify(plain({ orientation: 0 })));
  });

  it("keeps every clipped street inside the mask", () => {
    const mask = wedge();
    for (const segment of plain({ mask }).segments) {
      for (const cell of segment.path) {
        expect(mask[cell.z * 160 + cell.x], `${cell.x},${cell.z} is outside the cell`).toBe(1);
      }
    }
  });

  it("lays a 4-connected polyline even when the frame is turned", () => {
    for (const orientation of [15, 30, 45, 60, 75]) {
      for (const segment of plain({ orientation, mask: wedge() }).segments) {
        for (let i = 1; i < segment.path.length; i++) {
          const a = segment.path[i - 1] as Point2;
          const b = segment.path[i] as Point2;
          expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
        }
      }
    }
  });

  it("ends a street where it leaves the cell — the dead ends are the point", () => {
    const mask = wedge();
    const graph = plain({ mask });
    const interior = (p: Point2): boolean =>
      p.x > BOUNDS.x0 && p.x < BOUNDS.x1 && p.z > BOUNDS.z0 && p.z < BOUNDS.z1;
    let deadEnds = 0;
    for (const segment of graph.segments) {
      for (const end of [segment.path[0], segment.path[segment.path.length - 1]]) {
        if (end === undefined || !interior(end)) continue;
        // An interior end must be against the mask edge, never in mid-block.
        const outside = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dz]) => {
          const x = end.x + (dx as number);
          const z = end.z + (dz as number);
          return x < 0 || z < 0 || x > 159 || z > 159 || mask[z * 160 + x] !== 1;
        });
        expect(outside, `${end.x},${end.z} stops in mid-block`).toBe(true);
        deadEnds++;
      }
    }
    expect(deadEnds, "a wedge should cut several streets short").toBeGreaterThan(4);
  });

  it("offers every one of those ends to the road pass as an anchor", () => {
    const mask = wedge();
    const graph = plain({ mask });
    const anchors = new Set(boundaryEndpoints(graph, BOUNDS, mask).map((p) => `${p.x},${p.z}`));
    for (const segment of graph.segments) {
      for (const end of [segment.path[0], segment.path[segment.path.length - 1]]) {
        if (end === undefined) continue;
        expect(anchors.has(`${end.x},${end.z}`), `${end.x},${end.z} is unreachable`).toBe(true);
      }
    }
  });

  it("turns the whole grid when asked, and not otherwise", () => {
    const straight = plain({ mask: wedge(), orientation: 0 });
    const turned = plain({ mask: wedge(), orientation: 30 });
    const diagonalSteps = (graph: StreetGraph): number => {
      let turns = 0;
      for (const segment of graph.segments) {
        for (let i = 2; i < segment.path.length; i++) {
          const a = segment.path[i - 2] as Point2;
          const b = segment.path[i] as Point2;
          if (a.x !== b.x && a.z !== b.z) turns++;
        }
      }
      return turns;
    };
    expect(diagonalSteps(straight)).toBe(0);
    expect(diagonalSteps(turned)).toBeGreaterThan(50);
  });

  it("refuses a cell the clip leaves nothing of, without throwing", () => {
    const sliver = new Uint8Array(160 * 160);
    for (let z = 0; z < 160; z++) sliver[z * 160] = 1;
    const result = buildStreetGraph({
      bounds: BOUNDS,
      fabric: "grid",
      seed: nodeSeed(1n, "world.sliver", ""),
      blockSize: 40,
      sidewalk: 2,
      mask: sliver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fix).toMatch(/ground treatment|envelope/);
  });
});

describe("densify4", () => {
  it("inserts the orthogonal cell a diagonal step skipped", () => {
    expect(densify4([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ]);
  });

  it("drops repeats without dropping the run", () => {
    expect(densify4([{ x: 3, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 4 }])).toEqual([
      { x: 3, z: 3 },
      { x: 3, z: 4 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the plan                                                                 */
/* -------------------------------------------------------------------------- */

describe("the city plan", () => {
  const plan = planFixture();

  it("draws a drive on the real shoreline, a spine, a diagonal and a ring", () => {
    const kinds = plan.arterials.map((a) => a.kind);
    expect(kinds).toContain("drive");
    expect(kinds).toContain("spine");
    expect(kinds).toContain("diagonal");
    expect(kinds).toContain("ring");
  });

  it("makes every arterial wider than any street and 4-connected", () => {
    for (const arterial of plan.arterials) {
      expect(arterial.width).toBe(ARTERIAL_WIDTH[arterial.kind]);
      expect(arterial.width).toBeGreaterThanOrEqual(9);
      expect(arterial.width).toBeLessThanOrEqual(13);
      expect(arterial.path.length).toBeGreaterThan(20);
      for (let i = 1; i < arterial.path.length; i++) {
        const a = arterial.path[i - 1] as Point2;
        const b = arterial.path[i] as Point2;
        expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
      }
      for (const terminus of arterial.termini) {
        expect(terminus.heading % 15).toBe(0);
        expect(terminus.heading).toBeGreaterThanOrEqual(0);
        expect(terminus.heading).toBeLessThan(360);
      }
    }
  });

  it("meets itself at real junctions", () => {
    expect(junctionsOf(plan.arterials).length).toBeGreaterThanOrEqual(3);
  });

  it("indexes its arterial mask over its own bounds", () => {
    let marked = 0;
    for (const arterial of plan.arterials) {
      for (const cell of arterial.path) {
        if (arterialAt(plan, cell.x, cell.z)) marked++;
      }
    }
    const total = plan.arterials.reduce((sum, a) => sum + a.path.length, 0);
    // Every centre-line cell inside the bounds is on the mask; a handful run
    // off the edge, where the band is clipped away.
    expect(marked / total).toBeGreaterThan(0.98);
    expect(arterialAt(plan, CITY_BOUNDS.x0 - 5, CITY_BOUNDS.z0 - 5)).toBe(false);
  });

  it("tiles the settlement area: no two cells share a column, none is on a road", () => {
    const seen = new Map<string, string>();
    for (const cell of plan.cells) {
      for (const key of cellKeys(cell)) {
        const other = seen.get(key);
        expect(other, `${key} is in both ${cell.id} and ${other}`).toBeUndefined();
        seen.set(key, cell.id);
        const [x, z] = key.split(",").map(Number) as [number, number];
        expect(x).toBeGreaterThanOrEqual(CITY_BOUNDS.x0);
        expect(x).toBeLessThanOrEqual(CITY_BOUNDS.x1);
        expect(z).toBeGreaterThanOrEqual(CITY_BOUNDS.z0);
        expect(z).toBeLessThanOrEqual(CITY_BOUNDS.z1);
        expect(arterialAt(plan, x, z), `${key} is on a carriageway`).toBe(false);
      }
    }
  });

  it("keeps a cell's mask row-major over the cell's own bounds", () => {
    for (const cell of plan.cells) {
      const width = cell.bounds.x1 - cell.bounds.x0 + 1;
      const depth = cell.bounds.z1 - cell.bounds.z0 + 1;
      expect(cell.mask.length).toBe(width * depth);
      let count = 0;
      for (const v of cell.mask) if (v === 1) count++;
      expect(count).toBe(cell.area);
      // Tight: every edge of the box is touched by the mask.
      const row = (z: number): boolean => {
        for (let x = cell.bounds.x0; x <= cell.bounds.x1; x++) if (cellContains(cell, x, z)) return true;
        return false;
      };
      const column = (x: number): boolean => {
        for (let z = cell.bounds.z0; z <= cell.bounds.z1; z++) if (cellContains(cell, x, z)) return true;
        return false;
      };
      expect(row(cell.bounds.z0) && row(cell.bounds.z1)).toBe(true);
      expect(column(cell.bounds.x0) && column(cell.bounds.x1)).toBe(true);
    }
  });

  it("leaves non-rectangular cells where the diagonal cut through", () => {
    // The shape of the mask, not the count of cells: a plan could produce ten
    // cells and still be ten rectangles, which is the thing C1 exists to stop.
    const wedges = plan.cells.filter((cell) => {
      const width = cell.bounds.x1 - cell.bounds.x0 + 1;
      const depth = cell.bounds.z1 - cell.bounds.z0 + 1;
      return cell.area / (width * depth) < 0.8;
    });
    expect(wedges.length, "no cell is anything but its own bounding box").toBeGreaterThan(0);

    // …and at least one of them has a genuinely oblique edge: a boundary that
    // steps in x and in z over the same short run, which a rectangle cannot do.
    const oblique = plan.cells.some((cell) => {
      let steps = 0;
      for (let z = cell.bounds.z0; z < cell.bounds.z1; z++) {
        let firstHere = -1;
        let firstNext = -1;
        for (let x = cell.bounds.x0; x <= cell.bounds.x1; x++) {
          if (firstHere < 0 && cellContains(cell, x, z)) firstHere = x;
          if (firstNext < 0 && cellContains(cell, x, z + 1)) firstNext = x;
        }
        if (firstHere >= 0 && firstNext >= 0 && firstHere !== firstNext) steps++;
      }
      return steps > 20;
    });
    expect(oblique, "no cell has a sloping edge").toBe(true);
  });

  it("turns at least one quarter off the world axes", () => {
    const orientations = new Set(plan.cells.map((c) => c.orientation));
    for (const o of orientations) {
      expect(o % 15).toBe(0);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(90);
    }
    expect(orientations.size, "every quarter shares one global grid").toBeGreaterThan(1);
  });

  it("gives the quarters different characters, and the water ones waterfront", () => {
    const characters = new Set(plan.cells.map((c) => c.character));
    expect(characters.size).toBeGreaterThanOrEqual(4);
    expect(characters.has("core")).toBe(true);
    // The shore has to be *somebody's*: a promenade, or the port quarter that
    // takes the same frontage when the cell is out on the edge.
    expect(
      plan.cells.some((c) => c.character === "waterfront" || c.character === "industrial"),
      "nothing on the plan faces the water",
    ).toBe(true);
    for (const cell of plan.cells) {
      expect(DISTRICT_CHARACTERS as readonly string[]).toContain(cell.character);
      expect(["low", "medium", "high"]).toContain(cell.density);
      expect(cell.blockSize).toBeGreaterThanOrEqual(16);
      expect(cell.paletteSalt).toContain(cell.character);
    }
    // Two cells of the same character must still differ somewhere, or the
    // fabric does not change as the player walks between them.
    const salts = new Set(plan.cells.map((c) => c.paletteSalt));
    expect(salts.size).toBe(plan.cells.length);
  });

  it("plans the same city twice from one seed", () => {
    const encode = (p: CityPlan): string =>
      JSON.stringify({
        bounds: p.bounds,
        arterials: p.arterials,
        mask: [...p.arterialMask],
        cells: p.cells.map((c) => ({ ...c, mask: [...c.mask] })),
      });
    expect(encode(planFixture())).toBe(encode(planFixture()));
  });

  it("draws no diagonal when the author asks for none", () => {
    const none = planFixture({ diagonals: 0 });
    expect(none.arterials.some((a) => a.kind === "diagonal")).toBe(false);
  });

  it("draws no drive inland", () => {
    const region = centeredRegion(384, 384);
    const field = new HeightField(region);
    field.values.fill(74);
    const result = buildCityPlan({
      bounds: CITY_BOUNDS,
      field,
      seaLevel: 62,
      seed: nodeSeed(20260801n, "world.inland", ""),
      params: { size: "medium" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.coastal).toBe(false);
    expect(result.plan.arterials.some((a) => a.kind === "drive")).toBe(false);
    expect(result.plan.cells.length).toBeGreaterThan(1);
  });

  it("refuses a footprint too small to hold an armature, and says what to change", () => {
    const region = centeredRegion(128, 128);
    const field = new HeightField(region);
    field.values.fill(74);
    const result = buildCityPlan({
      bounds: { x0: -20, z0: -20, x1: 19, z1: 19 },
      field,
      seaLevel: 62,
      seed: nodeSeed(1n, "world.pocket", ""),
      params: { size: "small" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fix).toMatch(/district/);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. the authoring surface                                                    */
/* -------------------------------------------------------------------------- */

describe("the city node", () => {
  const cityDoc = (params: unknown, children: unknown[] = []): unknown => ({
    loam: "0.1",
    profile: "settlement",
    meta: { name: "city_fixture", worldSeed: 20260801 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [512, 512] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 6, baseHeight: 74, seaLevel: 62, octaves: 3, frequency: 0.004 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "harbourtown",
          kind: "city",
          envelope: { shape: "region", size: [360, 320] },
          params,
          constraints: [{ zone: "center" }],
          children,
        },
      ],
    },
  });

  const codes = (doc: unknown): string[] =>
    validateSettlementDocument(doc)
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.name);

  it("accepts a well-formed city", () => {
    const result = validateSettlementDocument(
      cityDoc({ size: "medium", mix: ["office", "apartment_block", "shop_row"] }),
    );
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("accepts landmarks and precinct kits as children", () => {
    const result = validateSettlementDocument(
      cityDoc({ size: "large", mix: ["office"] }, [
        {
          id: "spire",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [21, 78, 19] },
          params: { archetype: "skyscraper", floors: 18 },
        },
        {
          id: "port",
          kind: "generator",
          generator: "precinct.harbour@0",
          envelope: { shape: "box", size: [96, 24, 72] },
          params: {},
        },
      ]),
    );
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("rejects a nested district, and names what to write instead", () => {
    const result = validateSettlementDocument(
      cityDoc({ size: "medium", mix: ["office"] }, [
        { id: "quarter", kind: "district", envelope: { shape: "region", size: [80, 80] } },
      ]),
    );
    const bad = result.diagnostics.find((d) => d.severity === "error");
    expect(bad?.name).toBe("STRUCTURE_NODE_SHAPE");
    expect(bad?.fix).toMatch(/building\.grammar@0/);
  });

  it("requires a size and a mix, with a fix that names the field", () => {
    expect(codes(cityDoc({}))).toEqual(expect.arrayContaining(["CITY_PARAM"]));
    const missing = validateSettlementDocument(cityDoc({ size: "medium" }));
    const bad = missing.diagnostics.find((d) => d.name === "CITY_PARAM");
    expect(bad?.message).toMatch(/"mix" is required/);
    expect(bad?.fix).toMatch(/archetype names/);
  });

  it("rejects an unknown size, an out-of-range diagonal count and a bad mix name", () => {
    expect(codes(cityDoc({ size: "enormous", mix: ["office"] }))).toContain("CITY_PARAM");
    expect(codes(cityDoc({ size: "medium", mix: ["office"], diagonals: 5 }))).toContain(
      "PARAM_OUT_OF_RANGE",
    );
    const typo = validateSettlementDocument(cityDoc({ size: "medium", mix: ["ofice"] }));
    const bad = typo.diagnostics.find((d) => d.name === "CITY_PARAM");
    expect(bad?.fix).toMatch(/did you mean/);
  });

  it("rejects a character key outside the eight, and lists them", () => {
    const result = validateSettlementDocument(
      cityDoc({ size: "medium", mix: ["office"], characters: { industral: ["warehouse"] } }),
    );
    const bad = result.diagnostics.find((d) => d.severity === "error");
    expect(bad?.message).toMatch(/industral/);
  });

  it("accepts a per-character mix for every one of the eight", () => {
    const characters: Record<string, string[]> = {};
    for (const name of DISTRICT_CHARACTERS) characters[name] = ["cottage"];
    const result = validateSettlementDocument(
      cityDoc({ size: "medium", mix: ["office"], characters }),
    );
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("refuses a footprint below the city floor, and points at the district node", () => {
    const doc = cityDoc({ size: "small", mix: ["office"] }) as {
      root: { children: { envelope?: { size: number[] } }[] };
    };
    (doc.root.children[2] as { envelope: { size: number[] } }).envelope.size = [120, 120];
    const bad = validateSettlementDocument(doc).diagnostics.find((d) => d.name === "CITY_TOO_SMALL");
    expect(bad).toBeDefined();
    expect(bad?.fix).toMatch(/"kind": "district"/);
  });

  it("spells the same eight characters the compiler's union does", () => {
    // A compile-time assertion in both directions: the spec's runtime list and
    // the compiler's pinned union are the cross-track surface, and a name added
    // to one and not the other is a silently-ignored per-character mix.
    const each: readonly DistrictCharacter[] = DISTRICT_CHARACTERS;
    const back: readonly (typeof DISTRICT_CHARACTERS)[number][] = [
      "core",
      "grid",
      "rowhouse",
      "lanes",
      "industrial",
      "civic",
      "park",
      "waterfront",
    ] satisfies readonly DistrictCharacter[];
    expect([...each].sort()).toEqual([...back].sort());
  });
});
