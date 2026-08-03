/**
 * The two anti-dither rules, tested at the level they are stated.
 *
 * `cluster.ts` answers "where does this column sample its material?" and
 * `thickenCourse` answers "is this one-column course a line?". Both are pure
 * geometry, so both can be pinned without compiling a world — and both have
 * an identity case that matters more than the interesting one: flat ground and
 * an axis-aligned course must come out exactly as they did before.
 */

import { describe, expect, it } from "vitest";

import {
  CLUSTER_WAVELENGTH,
  clusterCell,
  isSteepGround,
  materialCell,
  reliefAt,
} from "../src/terrain/cluster.js";
import { thickenCourse } from "../src/structures/sweep.js";

const region = { x0: 0, z0: 0, width: 16, depth: 16 } as const;

/** A ground field from a height function. */
function ground(f: (x: number, z: number) => number): Int32Array {
  const out = new Int32Array(region.width * region.depth);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) out[j * region.width + i] = f(i, j);
  }
  return out;
}

describe("clusterCell", () => {
  it("maps a whole lattice cell to one representative", () => {
    const w = CLUSTER_WAVELENGTH;
    const a = clusterCell(0, 0);
    for (let dz = 0; dz < w; dz++) {
      for (let dx = 0; dx < w; dx++) expect(clusterCell(dx, dz)).toEqual(a);
    }
    expect(clusterCell(w, 0)).not.toEqual(a);
  });

  it("is correct on negative coordinates — no fold at the origin", () => {
    const w = CLUSTER_WAVELENGTH;
    expect(clusterCell(-1, -1)).toEqual({ x: -w, z: -w });
    expect(clusterCell(-w, -w)).toEqual({ x: -w, z: -w });
    expect(clusterCell(-w - 1, 0)).toEqual({ x: -2 * w, z: 0 });
  });
});

describe("materialCell", () => {
  it("is the identity on flat ground", () => {
    const g = ground(() => 64);
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) expect(materialCell(region, g, x, z)).toEqual({ x, z });
    }
  });

  it("is the identity across a single one-block step", () => {
    // The commonest feature in rolling ground and in a graded street: it must
    // not trip the clustering, or every existing surface changes.
    const g = ground((x) => (x < 8 ? 64 : 65));
    for (let x = 0; x < 16; x++) expect(materialCell(region, g, x, 8)).toEqual({ x, z: 8 });
  });

  it("clusters on a face steeper than 1:1", () => {
    const g = ground((x) => 64 + 2 * x);
    expect(isSteepGround(region, g, 8, 8)).toBe(true);
    expect(materialCell(region, g, 8, 8)).toEqual(clusterCell(8, 8));
    // Adjacent columns on the face agree, which is the whole point: the mix
    // draw lands on connected patches instead of alternating column by column.
    expect(materialCell(region, g, 6, 8)).toEqual(materialCell(region, g, 7, 8));
  });

  it("reports relief over the eight neighbours and clamps at the border", () => {
    const g = ground((x, z) => (x === 8 && z === 8 ? 70 : 64));
    expect(reliefAt(region, g, 7, 7)).toBe(6);
    expect(reliefAt(region, g, 0, 0)).toBe(0);
    expect(reliefAt(region, g, -5, -5)).toBe(0);
  });
});

describe("thickenCourse", () => {
  const all = (): boolean => true;

  /** Mark `cells` in a fresh mask. */
  function mask(cells: readonly (readonly [number, number])[]): Uint8Array {
    const out = new Uint8Array(region.width * region.depth);
    for (const [x, z] of cells) out[z * region.width + x] = 1;
    return out;
  }

  it("leaves an axis-aligned course alone", () => {
    const cells: [number, number][] = [];
    for (let z = 2; z < 12; z++) cells.push([5, z]);
    const course = mask(cells);
    const before = Uint8Array.from(course);
    expect(thickenCourse(region, course, all, () => 0)).toBe(0);
    expect(course).toEqual(before);
  });

  it("closes a diagonal course into a 4-connected line", () => {
    const cells: [number, number][] = [];
    for (let k = 2; k < 12; k++) cells.push([k, k]);
    const course = mask(cells);
    expect(thickenCourse(region, course, all, () => 0)).toBeGreaterThan(0);

    // Every column of the course now has an orthogonal neighbour in it.
    for (let z = 0; z < region.depth; z++) {
      for (let x = 0; x < region.width; x++) {
        if (course[z * region.width + x] !== 1) continue;
        const touching = ([
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const).some(([dx, dz]) => {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) return false;
          return course[nz * region.width + nx] === 1;
        });
        expect(touching).toBe(true);
      }
    }
  });

  it("thickens to the side `outward` prefers, and never past `eligible`", () => {
    // A 45° course; the bridging columns at each corner are (x+1, z) and
    // (x, z+1). Score the first higher and only those may be recruited.
    const cells: [number, number][] = [];
    for (let k = 2; k < 8; k++) cells.push([k, k]);
    const course = mask(cells);
    thickenCourse(
      region,
      course,
      all,
      (_idx, x, z) => (x > z ? 1 : 0),
    );
    for (let k = 2; k < 7; k++) {
      expect(course[k * region.width + (k + 1)]).toBe(1);
      expect(course[(k + 1) * region.width + k]).toBe(0);
    }
  });

  it("adds nothing when no bridging column is eligible", () => {
    const cells: [number, number][] = [];
    for (let k = 2; k < 8; k++) cells.push([k, k]);
    const course = mask(cells);
    const before = Uint8Array.from(course);
    expect(thickenCourse(region, course, () => false, () => 0)).toBe(0);
    expect(course).toEqual(before);
  });
});
