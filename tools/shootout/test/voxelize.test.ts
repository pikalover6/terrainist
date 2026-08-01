import { describe, expect, it } from "vitest";

import { parseBlocksDoc } from "../blocks.ts";
import {
  BAND_PALETTE,
  MAX_TARGET,
  clampTarget,
  gridIndex,
  parseGlb,
  voxelizeGlb,
  voxelizeTriangles,
} from "../voxelize.ts";
import { sphereMesh, torusMesh, writeGlb } from "./glb-fixture.ts";

describe("parseGlb", () => {
  it("reads positions and indices out of a GLB", () => {
    const mesh = sphereMesh(1, 8, 6);
    const soup = parseGlb(writeGlb(mesh));
    expect(soup.length).toBe(mesh.indices.length * 3);
    for (let i = 0; i < soup.length; i += 3) {
      expect(Math.hypot(soup[i]!, soup[i + 1]!, soup[i + 2]!)).toBeCloseTo(1, 4);
    }
  });

  it("applies node translation and scale", () => {
    const soup = parseGlb(writeGlb(sphereMesh(1, 8, 6), { translation: [10, 0, 0], scale: [2, 2, 2] }));
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < soup.length; i += 3) {
      minX = Math.min(minX, soup[i]!);
      maxX = Math.max(maxX, soup[i]!);
    }
    expect(minX).toBeCloseTo(8, 3);
    expect(maxX).toBeCloseTo(12, 3);
  });

  it("rejects a non-GLB", () => {
    expect(() => parseGlb(new Uint8Array([1, 2, 3, 4]))).toThrow(/not a GLB/);
  });
});

describe("voxelizeTriangles", () => {
  it("fills a sphere solid at the requested scale", () => {
    const grid = voxelizeTriangles(parseGlb(writeGlb(sphereMesh())), { target: 32 });
    expect(grid.sx).toBe(33);
    expect(grid.sy).toBe(33);
    expect(grid.sz).toBe(33);

    // Centre is interior (flood fill could not reach it), corner is outside.
    expect(grid.solid[gridIndex(grid, 16, 16, 16)]).toBe(1);
    expect(grid.solid[gridIndex(grid, 0, 0, 0)]).toBe(0);

    // Volume within 15% of 4/3 pi r^3 at r = 16.
    const filled = grid.solid.reduce<number>((sum, v) => sum + v, 0);
    const expected = (4 / 3) * Math.PI * 16 ** 3;
    expect(Math.abs(filled - expected) / expected).toBeLessThan(0.15);
  });

  it("keeps a torus's hole open", () => {
    const grid = voxelizeTriangles(parseGlb(writeGlb(torusMesh(1, 0.3))), { target: 40 });
    const midY = Math.floor(grid.sy / 2);
    const cx = Math.floor(grid.sx / 2);
    const cz = Math.floor(grid.sz / 2);
    // Hole through the middle...
    expect(grid.solid[gridIndex(grid, cx, midY, cz)]).toBe(0);
    // ...ring solid where the tube passes.
    expect(grid.solid[gridIndex(grid, 1, midY, cz)]).toBe(1);
  });

  it("is deterministic", () => {
    const glb = writeGlb(torusMesh());
    const a = voxelizeTriangles(parseGlb(glb), { target: 24 });
    const b = voxelizeTriangles(parseGlb(glb), { target: 24 });
    expect(Array.from(a.solid)).toEqual(Array.from(b.solid));
  });
});

describe("voxelizeGlb", () => {
  it("produces a contract-valid blocks document with a banded palette", () => {
    const doc = voxelizeGlb(writeGlb(sphereMesh()), "sphere", { target: 24 });
    expect(() => parseBlocksDoc(doc, "sphere")).not.toThrow();
    expect(doc.size[0]).toBe(25);
    expect(doc.blocks.length).toBeGreaterThan(1000);

    const used = new Set(doc.blocks.map((b) => b.id));
    for (const id of used) expect(BAND_PALETTE).toContain(id);
    expect(used.size).toBe(BAND_PALETTE.length);

    // Bottom band is the deepslate, top band the calcite.
    const top = doc.size[1] - 1;
    expect(doc.blocks.find((b) => b.y === 0)!.id).toBe(BAND_PALETTE[0]);
    expect(doc.blocks.find((b) => b.y === top)!.id).toBe(BAND_PALETTE[BAND_PALETTE.length - 1]);

    // Min corner at the origin on every axis.
    expect(Math.min(...doc.blocks.map((b) => b.x))).toBe(0);
    expect(Math.min(...doc.blocks.map((b) => b.y))).toBe(0);
    expect(Math.min(...doc.blocks.map((b) => b.z))).toBe(0);
  });
});

describe("clampTarget", () => {
  it("accepts the documented range and rejects outside it", () => {
    expect(clampTarget(48)).toBe(48);
    expect(clampTarget(MAX_TARGET)).toBe(MAX_TARGET);
    expect(() => clampTarget(MAX_TARGET + 1)).toThrow(/capped/);
    expect(() => clampTarget(2)).toThrow(/at least 4/);
  });
});
