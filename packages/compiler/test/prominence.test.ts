/**
 * Fabric v3, C2 — the skyline field.
 *
 * The properties that matter are distributional, not per-column: any single
 * storey count is defensible, and what makes a skyline is the *shape* of the
 * whole set. So these tests sample the field over a downtown-sized district and
 * assert four things a mesa could not satisfy:
 *
 * 1. it is deterministic, and keyed on nothing but its declared inputs;
 * 2. it peaks — the mean near the core clears the mean at the edge by a wide
 *    margin, in both directions of the composition;
 * 3. its tall tail is rare and clustered, rather than sprinkled;
 * 4. an archetype's own nature wins: a shop row stays a shop row at the peak.
 */

import { describe, expect, it } from "vitest";

import { HeightField, HIGHRISE_MAX_FLOORS, centeredRegion, nodeSeed } from "@terrainist/stdlib";

import {
  ARTERIAL_SHARE,
  LOWRISE_CEILING,
  PROMINENCE_TAIL,
  STOREY_RANGE,
  archetypeCeiling,
  buildProminenceField,
  shapeProminence,
  type ProminenceInput,
} from "../src/layout/prominence.js";
import type { Rect } from "../src/layout/frames.js";

const BOUNDS: Rect = { x0: 0, z0: 0, x1: 199, z1: 169 };
const SEED = nodeSeed(4242n, "world.downtown", "");

function field(extra: Partial<ProminenceInput> = {}) {
  return buildProminenceField({ bounds: BOUNDS, seed: SEED, ...extra });
}

/** Every lot-sized column of the district, on a 7-column lattice. */
function lattice(step = 7): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = BOUNDS.z0; z <= BOUNDS.z1; z += step) {
    for (let x = BOUNDS.x0; x <= BOUNDS.x1; x += step) out.push({ x, z });
  }
  return out;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

/** A field with a river down the western third, for the frontage term. */
function waterField(): { field: HeightField; seaLevel: number } {
  const region = centeredRegion(320, 320);
  const heights = new HeightField(region);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      heights.values[j * region.width + i] = x < BOUNDS.x0 - 6 ? 50 : 70;
    }
  }
  return { field: heights, seaLevel: 63 };
}

describe("the skyline field — determinism", () => {
  it("gives the same answer twice from the same input", () => {
    const a = field();
    const b = field();
    for (const { x, z } of lattice(13)) {
      expect(b.at(x, z)).toBe(a.at(x, z));
      expect(b.storeys(x, z, { density: "high", archetype: "office" })).toBe(
        a.storeys(x, z, { density: "high", archetype: "office" }),
      );
    }
  });

  it("gives a different surface from a different seed", () => {
    const a = field();
    const b = field({ seed: nodeSeed(4242n, "world.downtown", "reroll") });
    const differences = lattice(13).filter((p) => a.at(p.x, p.z) !== b.at(p.x, p.z));
    expect(differences.length).toBeGreaterThan(0);
  });

  it("does not depend on the order landmarks were listed in", () => {
    const marks = [
      { x: 60, z: 40 },
      { x: 150, z: 120 },
      { x: 90, z: 150 },
    ];
    const a = field({ landmarks: marks });
    const b = field({ landmarks: [...marks].reverse() });
    for (const { x, z } of lattice(13)) expect(b.at(x, z)).toBe(a.at(x, z));
  });

  it("works with no city plan at all — a plain authored district", () => {
    const plain = field();
    for (const { x, z } of lattice(23)) {
      const v = plain.at(x, z);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      const s = plain.storeys(x, z, { density: "high", archetype: "office" });
      expect(Number.isInteger(s)).toBe(true);
    }
  });
});

describe("the skyline field — it peaks", () => {
  const near = (p: { x: number; z: number }): boolean => {
    const dx = p.x - 100;
    const dz = p.z - 85;
    return dx * dx + dz * dz <= 45 * 45;
  };
  const far = (p: { x: number; z: number }): boolean => {
    const dx = p.x - 100;
    const dz = p.z - 85;
    return dx * dx + dz * dz >= 95 * 95;
  };

  it("scores the core well above the edge", () => {
    const f = field();
    const points = lattice();
    const core = mean(points.filter(near).map((p) => f.at(p.x, p.z)));
    const edge = mean(points.filter(far).map((p) => f.at(p.x, p.z)));
    expect(core).toBeGreaterThan(edge * 2);
  });

  it("builds taller near the core than at the edge, by a clear margin", () => {
    const f = field();
    const points = lattice();
    const storeysAt = (p: { x: number; z: number }): number =>
      f.storeys(p.x, p.z, { density: "high", archetype: "office" });
    const core = mean(points.filter(near).map(storeysAt));
    const edge = mean(points.filter(far).map(storeysAt));
    expect(core).toBeGreaterThan(edge + 4);
    expect(core).toBeGreaterThan(edge * 2);
  });

  it("lifts the ground around a landmark", () => {
    const bare = field();
    const spiked = field({ landmarks: [{ x: 40, z: 40, weight: 1, radius: 30 }] });
    expect(spiked.at(40, 40)).toBeGreaterThan(bare.at(40, 40) + 0.1);
    // …and only around it: a hundred columns away the spike is spent.
    expect(spiked.at(180, 150) - bare.at(180, 150)).toBeLessThan(0.02);
  });

  it("lifts a waterfront column above an identical inland one", () => {
    const dry = field();
    const wet = field({ water: waterField() });
    expect(wet.at(BOUNDS.x0 + 2, 85)).toBeGreaterThan(dry.at(BOUNDS.x0 + 2, 85) + 0.05);
    // The far side of the district never sees the river.
    expect(wet.at(BOUNDS.x1 - 2, 85)).toBe(dry.at(BOUNDS.x1 - 2, 85));
  });

  it("lifts an arterial frontage, and by less than the water", () => {
    const dry = field();
    const path = [];
    for (let z = BOUNDS.z0; z <= BOUNDS.z1; z++) path.push({ x: 100, z });
    const onRoad = field({ arterials: [path] });
    const lift = onRoad.at(100, 85) - dry.at(100, 85);
    expect(lift).toBeGreaterThan(0);
    const wet = field({ water: waterField() });
    const waterLift = wet.at(BOUNDS.x0 + 2, 85) - dry.at(BOUNDS.x0 + 2, 85);
    expect(lift).toBeLessThan(waterLift / ARTERIAL_SHARE + 1e-9);
  });
});

describe("the skyline field — the tall tail", () => {
  const sample = (): number[] => {
    const f = field({
      water: waterField(),
      landmarks: [{ x: 96, z: 80 }],
    });
    return lattice(5).map((p) => f.storeys(p.x, p.z, { density: "high", archetype: "skyscraper" }));
  };

  it("keeps the bulk of the city low and the towers rare", () => {
    const storeys = sample();
    const [, hi] = STOREY_RANGE.high;
    const share = (test: (s: number) => boolean): number =>
      storeys.filter(test).length / storeys.length;
    // Most of a city is small buildings…
    expect(share((s) => s <= 6)).toBeGreaterThan(0.55);
    // …a minority is mid-rise…
    expect(share((s) => s > 6 && s < hi * 0.5)).toBeGreaterThan(0.08);
    // …and the tall tail is a tail. Sampled over a *generous* field — water
    // down one whole flank and a landmark on the core — so these bounds are
    // looser than a plain district's, which comes in around 12 % and 5 %.
    expect(share((s) => s >= hi * 0.5)).toBeLessThan(0.25);
    expect(share((s) => s >= hi * 0.75)).toBeLessThan(0.1);
    // But it exists: a skyline with no tower on it is the mesa again.
    expect(storeys.some((s) => s >= hi * 0.6)).toBe(true);
  });

  it("keeps a plain district's tail tighter still", () => {
    const f = field();
    const storeys = lattice(5).map((p) =>
      f.storeys(p.x, p.z, { density: "high", archetype: "skyscraper" }),
    );
    const [, hi] = STOREY_RANGE.high;
    const share = (test: (s: number) => boolean): number =>
      storeys.filter(test).length / storeys.length;
    expect(share((s) => s <= 6)).toBeGreaterThan(0.6);
    expect(share((s) => s >= hi * 0.5)).toBeLessThan(0.18);
    expect(share((s) => s >= hi * 0.75)).toBeLessThan(0.08);
  });

  it("clusters the tall buildings instead of sprinkling them", () => {
    const f = field({ water: waterField(), landmarks: [{ x: 96, z: 80 }] });
    const step = 7;
    const tall = (x: number, z: number): boolean =>
      f.storeys(x, z, { density: "high", archetype: "skyscraper" }) >= 10;
    const points = lattice(step);
    const tallPoints = points.filter((p) => tall(p.x, p.z));
    expect(tallPoints.length).toBeGreaterThan(4);
    // A tall column's four neighbours are tall far more often than a column
    // drawn at random is — which is the difference between a district of towers
    // and one tower per block.
    const baseRate = tallPoints.length / points.length;
    let neighbours = 0;
    let tallNeighbours = 0;
    for (const p of tallPoints) {
      for (const [dx, dz] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ] as const) {
        const x = p.x + dx;
        const z = p.z + dz;
        if (x < BOUNDS.x0 || z < BOUNDS.z0 || x > BOUNDS.x1 || z > BOUNDS.z1) continue;
        neighbours++;
        if (tall(x, z)) tallNeighbours++;
      }
    }
    expect(tallNeighbours / neighbours).toBeGreaterThan(baseRate * 1.8);
  });

  it("is a rarity curve, not a ramp, and never saturates", () => {
    expect(shapeProminence(0)).toBe(0);
    expect(shapeProminence(1)).toBe(1);
    // Monotone…
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const v = shapeProminence(i / 100);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
    // …far below linear over the whole plausible range…
    expect(shapeProminence(0.3)).toBeLessThan(0.1);
    expect(shapeProminence(0.5)).toBeLessThan(0.4);
    // …and short of the top wherever a real column can actually score, so a
    // whole waterfront does not come out at exactly the tallest storey count.
    expect(shapeProminence(0.75)).toBeLessThan(0.98);
    expect(PROMINENCE_TAIL).toBeGreaterThan(1);
  });
});

describe("the skyline field — what an archetype will and will not become", () => {
  it("never turns a shop row into a tower, anywhere", () => {
    const f = field({ water: waterField(), landmarks: [{ x: 100, z: 85 }] });
    for (const { x, z } of lattice(5)) {
      expect(f.storeys(x, z, { density: "high", archetype: "shop_row" })).toBeLessThanOrEqual(
        LOWRISE_CEILING,
      );
    }
  });

  it("caps every archetype at what the grammar will actually build", () => {
    for (const [name, cap] of Object.entries(HIGHRISE_MAX_FLOORS)) {
      expect(archetypeCeiling(name)).toBe(cap);
    }
    expect(archetypeCeiling("shop_row")).toBe(LOWRISE_CEILING);
    expect(archetypeCeiling("something_nobody_declared")).toBe(LOWRISE_CEILING);
  });

  it("holds a low-density district low and a high-density one tall", () => {
    const f = field({ landmarks: [{ x: 100, z: 85 }] });
    const low = f.storeys(100, 85, { density: "low", archetype: "office" });
    const high = f.storeys(100, 85, { density: "high", archetype: "office" });
    expect(low).toBeLessThanOrEqual(STOREY_RANGE.low[1]);
    expect(high).toBeGreaterThan(low);
  });

  it("lets the character veto the height the field asked for", () => {
    const f = field({ landmarks: [{ x: 100, z: 85 }] });
    const core = f.storeys(100, 85, { density: "high", character: "core", archetype: "office" });
    const rows = f.storeys(100, 85, {
      density: "high",
      character: "rowhouse",
      archetype: "office",
    });
    const park = f.storeys(100, 85, { density: "high", character: "park", archetype: "office" });
    expect(core).toBeGreaterThan(rows);
    expect(rows).toBeGreaterThanOrEqual(park);
  });

  it("stays inside the declared range for every density", () => {
    const f = field({ water: waterField(), landmarks: [{ x: 100, z: 85 }] });
    for (const density of ["low", "medium", "high"] as const) {
      const [lo, hi] = STOREY_RANGE[density];
      for (const { x, z } of lattice(11)) {
        const s = f.storeys(x, z, { density, archetype: "skyscraper" });
        expect(s).toBeGreaterThanOrEqual(lo);
        expect(s).toBeLessThanOrEqual(hi);
      }
    }
  });
});
