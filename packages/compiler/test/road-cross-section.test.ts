/**
 * **A street's cross-section is level.**
 *
 * Three rounds of fixes to the surfacer left a walk of the hill town reporting
 * the same thing: streets rendered as a *chessboard* — alternating full blocks
 * and half slabs on a regular 2D lattice, across the whole width of a street, on
 * sloping ground. Not noise; a perfectly regular alternation.
 *
 * The cause was one line, and it was in the model rather than in the arithmetic.
 * `sweptColumns` had recovered the true centre line and decided *which* columns
 * a street owns from real geometry since the sweep engine landed. Nothing ever
 * decided **how high** they sit from real geometry: the elevation profile was one
 * entry per *rasterized path cell*, and each column read the entry of whichever
 * cell it projected nearest to. On an axis-aligned street those are the same
 * thing. On a diagonal they are not, in two compounding ways:
 *
 * 1. a 4-connected raster of a 45° line spends √2 cells per block of ground, so
 *    one block of street carries **two** raster cross-sections at two heights —
 *    and consecutive raster cross-sections *interleave* on the lattice, so every
 *    column's four neighbours are on the other one. That is the chessboard;
 * 2. the raster **zigzags across the contours**, so the ground it samples
 *    oscillates by the cross-slope every step, and `gradeProfile` — a lower
 *    envelope of unit cones — preserves a ±1 oscillation exactly.
 *
 * The fix is `ArcFrame`: the datum lives on stations one block of arc length
 * apart along the true line, sampled off the true line, and every column reads
 * the station its own arc falls in. Iso-height bands become perpendicular to the
 * centre line by construction, so a grade change is one clean step across the
 * full carriageway, and the 1-Lipschitz law finally means one block of rise per
 * block of ground rather than per raster cell.
 *
 * Every fixture below is **diagonal on a gradient**, which is the case every
 * existing fixture misses: `street-ownership.test.ts`, `roads.test.ts` and
 * `sweep.test.ts` all surface axis-aligned runs, and an axis-aligned run is
 * exactly the case in which the old model was right.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { surfaceStreetGraph } from "../src/structures/roads.js";
import { index } from "../src/structures/sweep.js";
import { dressStreets } from "../src/structures/streetscape.js";
import { arcFrame, carriagewaySpans, sweptColumns } from "../src/structures/sweep.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 128): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, height: (x: number, z: number) => number): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const k = j * r.width + i;
      ground[k] = height(r.x0 + i, r.z0 + j);
      fluidTop[k] = ground[k] as number;
    }
  }
  return {
    region: r,
    ground,
    fluidTop,
    fluidKind: new Uint8Array(n).fill(FluidKind.NONE),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    seaLevel: SEA,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 }
  };
}

/**
 * The 4-connected raster of a 45° line — the shape a fabric pass hands over for
 * any street that is not on an axis, and the shape `StreetSegment.path` pins.
 */
function diagonalPath(from: number, to: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [{ x: from, z: from }];
  for (let k = from; k < to; k++) {
    out.push({ x: k + 1, z: k });
    out.push({ x: k + 1, z: k + 1 });
  }
  return out;
}

function graphOf(segments: StreetSegment[]): StreetGraph {
  return { segments, intersections: [], sidewalk: 2 };
}

/**
 * Surface one graph under the **graded** law — `sovereign: false`, explicitly.
 *
 * Everything this file measures is a property of a carriageway that decides a
 * level of its own: level across its width, one station per block of ground, no
 * wash-boarding where the raster zigzags. A sovereign road decides no level —
 * it is draped on the resolved ground and inherits whatever the terrain does
 * across its width — so under `ROAD_SOVEREIGN` these sentences are not false,
 * they are about a machine that is not running. Named at the call the way
 * `descent-wiring.test.ts` names `descentSolve`: dormant under
 * `ROAD_SOVEREIGN`, kept tested for the flag's off-state and a possible revert.
 */
function surface(p: ColumnPlan, graph: StreetGraph) {
  return surfaceStreetGraph({
    sovereign: false,
    graphs: [graph],
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, "world.quarter"),
    theme: "medieval_village"
  });
}

/**
 * The spread of surfaced heights within each **cross-section** of a run.
 *
 * A cross-section is defined geometrically and independently of the code under
 * test: the swept columns whose projection onto the true centre line falls in
 * the same one-block slab of arc length. The metric is the same one the hill
 * town was measured with.
 */
function crossSectionSpreads(
  r: Region,
  p: ColumnPlan,
  path: readonly { x: number; z: number }[],
  width: number,
  road?: Uint8Array,
): number[] {
  const slabs = new Map<number, number[]>();
  for (const spot of sweptColumns(r, path, carriagewaySpans(width).lanes)) {
    if (road !== undefined && road[spot.idx] !== 1) continue;
    const k = Math.round(spot.arc);
    const held = slabs.get(k);
    if (held === undefined) slabs.set(k, [p.ground[spot.idx] as number]);
    else held.push(p.ground[spot.idx] as number);
  }
  return [...slabs.values()].map((ys) => Math.max(...ys) - Math.min(...ys));
}

/* -------------------------------------------------------------------------- */
/* 1. the frame itself                                                         */
/* -------------------------------------------------------------------------- */

describe("the arc frame", () => {
  it("is the old per-cell frame, exactly, for an axis-aligned run", () => {
    // The identity argument §6 of the levels doc rests on. A straight run's
    // simplified line is two vertices, its arc length is `path.length − 1`, and
    // one station per block of arc therefore *is* one station per path cell.
    const path = Array.from({ length: 40 }, (_, i) => ({ x: -20 + i, z: 7 }));
    const frame = arcFrame(path);
    expect(frame.spacing).toBe(1);
    expect(frame.stations).toEqual(path);
    expect(frame.pathArc.map((a) => Math.round(a * 1e9) / 1e9)).toEqual(
      path.map((_, i) => i),
    );
    for (const [i] of path.entries()) expect(frame.station(frame.pathArc[i] as number)).toBe(i);
  });

  it("gives a diagonal run one station per block of ground, not per raster cell", () => {
    const path = diagonalPath(0, 30);
    const frame = arcFrame(path);
    // 61 raster cells, but only 30·√2 ≈ 42 blocks of ground.
    expect(path).toHaveLength(61);
    expect(frame.total).toBeCloseTo(30 * Math.SQRT2, 6);
    expect(frame.spacing).toBe(1);
    expect(frame.stations.length).toBe(Math.floor(30 * Math.SQRT2) + 1);
  });

  it("never lets one step of the path cross more than one station", () => {
    // The walkability law. A datum that changes by a block per station is only
    // walkable if a single step of the path moves you by at most one station —
    // otherwise the player meets two blocks of rise in one move. An 8-connected
    // route's diagonal step covers √2 blocks, so its stations are √2 apart.
    const straight = Array.from({ length: 20 }, (_, i) => ({ x: i, z: 0 }));
    const eightConnected = Array.from({ length: 20 }, (_, i) => ({ x: i, z: i }));
    for (const path of [straight, eightConnected, diagonalPath(0, 20)]) {
      const frame = arcFrame(path);
      for (let i = 1; i < path.length; i++) {
        const a = frame.station(frame.pathArc[i - 1] as number);
        const b = frame.station(frame.pathArc[i] as number);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
    }
    expect(arcFrame(eightConnected).spacing).toBeCloseTo(Math.SQRT2, 6);
  });

  it("puts every column of one cross-section on one station", () => {
    const r = region();
    const path = diagonalPath(-20, 20);
    const frame = arcFrame(path);
    const byStation = new Map<number, number[]>();
    for (const spot of sweptColumns(r, path, carriagewaySpans(5).lanes)) {
      const s = frame.station(spot.arc);
      const held = byStation.get(s);
      if (held === undefined) byStation.set(s, [spot.arc]);
      else held.push(spot.arc);
    }
    // Every interior station's columns are within half a spacing of its own
    // arc: the grouping is a slab perpendicular to the line, not a raster row.
    // The two end stations are excluded because they are where the clamp lives —
    // the sweep admits a half block of column beyond either end of the run, and
    // those belong to the nearest station by definition.
    for (const [s, arcs] of byStation) {
      if (s === 0 || s === frame.stations.length - 1) continue;
      for (const arc of arcs) {
        expect(Math.abs(arc - s * frame.spacing)).toBeLessThanOrEqual(frame.spacing / 2 + 1e-9);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. a diagonal street on a gradient                                          */
/* -------------------------------------------------------------------------- */

describe("a diagonal street on a gradient", () => {
  /** Ground rising 1 in 2 **across** a north-east run — the chessboard case. */
  const crossSlope = (x: number, z: number): number => 80 + Math.floor((z - x) / 2);
  /** Ground rising 1 in 3 **along** a north-east run. */
  const alongSlope = (x: number, z: number): number => 80 + Math.floor((z + x) / 3);

  for (const [name, height] of [
    ["across the run", crossSlope],
    ["along the run", alongSlope]
  ] as const) {
    it(`is level across its width, everywhere, with the slope ${name}`, () => {
      const r = region();
      const p = plan(r, height);
      const path = diagonalPath(-24, 24);
      const result = surface(p, graphOf([{ id: "s", kind: "street", width: 5, path }]));
      const spreads = crossSectionSpreads(r, p, path, 5, result.road);
      expect(spreads.length).toBeGreaterThan(30);
      // Not "mostly level": every cross-section, exactly.
      expect(Math.max(...spreads)).toBe(0);
    });
  }

  it("does not wash-board where the raster zigzags across the contours", () => {
    // The second half of the defect. On a uniform cross-slope the raster's
    // east step drops and its north step rises, so the sampled ground alternates
    // ±1 and the lower envelope keeps it. The true line does not zigzag, so the
    // profile of a street laid along a contour is *flat*.
    const r = region();
    const p = plan(r, crossSlope);
    const path = diagonalPath(-24, 24);
    const result = surface(p, graphOf([{ id: "s", kind: "street", width: 5, path }]));
    const levels: number[] = [];
    const frame = arcFrame(path);
    const seen = new Set<number>();
    for (const spot of sweptColumns(r, path, carriagewaySpans(5).lanes)) {
      if (result.road[spot.idx] !== 1) continue;
      const s = frame.station(spot.arc);
      if (seen.has(s)) continue;
      seen.add(s);
      levels[s] = p.ground[spot.idx] as number;
    }
    const run = [...levels].filter((v) => v !== undefined);
    let reversals = 0;
    for (let i = 2; i < run.length; i++) {
      const a = Math.sign((run[i - 1] as number) - (run[i - 2] as number));
      const b = Math.sign((run[i] as number) - (run[i - 1] as number));
      if (a !== 0 && b !== 0 && a !== b) reversals++;
    }
    expect(reversals).toBe(0);
  });

  it("climbs by no more than a block per block of ground", () => {
    const r = region();
    const p = plan(r, (x, z) => 80 + Math.floor((z + x) / 2));
    const path = diagonalPath(-24, 24);
    const result = surface(p, graphOf([{ id: "s", kind: "street", width: 5, path }]));
    const frame = arcFrame(path);
    const byStation: number[] = [];
    for (const spot of sweptColumns(r, path, carriagewaySpans(5).lanes)) {
      if (result.road[spot.idx] !== 1) continue;
      byStation[frame.station(spot.arc)] = p.ground[spot.idx] as number;
    }
    for (let s = 1; s < byStation.length; s++) {
      const a = byStation[s - 1];
      const b = byStation[s];
      if (a === undefined || b === undefined) continue;
      // One block of rise per station, and a station is one block of ground.
      expect(Math.abs(b - a)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps an axis-aligned street on flat ground exactly where it was", () => {
    // The identity guard. This is the case the old model got right, and it must
    // stay bit-for-bit right: a levelled district pad is every world that never
    // asked for any of this.
    const r = region();
    const p = plan(r, () => 80);
    const path = Array.from({ length: 60 }, (_, i) => ({ x: -30 + i, z: 4 }));
    const result = surface(p, graphOf([{ id: "s", kind: "street", width: 5, path }]));
    for (const spot of sweptColumns(r, path, carriagewaySpans(5).lanes)) {
      if (result.road[spot.idx] !== 1) continue;
      expect(p.ground[spot.idx]).toBe(80);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. nothing later re-levels a column the surfacer owns                       */
/* -------------------------------------------------------------------------- */

describe("the streetscape and the surfacer agree on where the street is", () => {
  /**
   * The second defect the hill town's measurement found, and the larger one by
   * size: the surfacer asks each column for its perpendicular distance to the
   * true line, and `buildStreetMasks` walked the raster with a heading forced
   * onto an axis. On a diagonal the outer lanes of the carriageway fall outside
   * every axis-aligned bar the raster walk draws, so the dressing called them
   * *sidewalk* and re-levelled them — to the ground under a centre cell one or
   * two cross-sections away. Measured on the hill town, that turned a street the
   * surfacer had written level into one with up to seven blocks of step across
   * its own width.
   */
  function dressed(withMask: boolean): { moved: number; total: number } {
    const r = region();
    const p = plan(r, (x, z) => 80 + Math.floor((z + x) / 3));
    const path = diagonalPath(-24, 24);
    const graph = graphOf([{ id: "s", kind: "street", width: 5, path }]);
    const result = surface(p, graph);
    const before = Int32Array.from(p.ground);
    dressStreets(graph, {
      // The same explicit off-state `surface` names, for the same reason: the
      // sidewalk band re-levels itself off the flanking carriageway's arc only
      // under the graded law, and that re-levelling is the defect this pair of
      // rows exists to pin. Dormant under `ROAD_SOVEREIGN`; kept tested for the
      // flag's off-state and a possible revert.
      sovereign: false,
      plan: p,
      stack,
      seed: nodeSeed(11n, "world.quarter"),
      furniture: "none",
      ...(withMask ? { surfaced: result.road } : {})
    });
    let moved = 0;
    let total = 0;
    for (let k = 0; k < result.road.length; k++) {
      if (result.road[k] !== 1) continue;
      total++;
      if (p.ground[k] !== before[k]) moved++;
    }
    return { moved, total };
  }

  it("re-levels a diagonal carriageway when it is not told where the street is", () => {
    // The defect, asserted so the fix below cannot silently become vacuous.
    const { moved, total } = dressed(false);
    expect(total).toBeGreaterThan(100);
    expect(moved).toBeGreaterThan(0);
  });

  it("moves not one column the surfacer laid, when it is", () => {
    const { moved } = dressed(true);
    expect(moved).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. determinism                                                              */
/* -------------------------------------------------------------------------- */

describe("determinism", () => {
  it("surfaces a diagonal street identically twice over", () => {
    const build = (): string => {
      const r = region();
      const p = plan(r, (x, z) => 80 + Math.floor((z - x) / 2) + Math.floor((z + x) / 5));
      const path = diagonalPath(-24, 24);
      surface(p, graphOf([{ id: "s", kind: "street", width: 5, path }]));
      const r0 = region();
      return [...p.ground].join(",") + "|" + String(index(r0, 0, 0));
    };
    expect(build()).toBe(build());
  });
});
