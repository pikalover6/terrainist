import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { emitWorld, loadSpikeDocument } from "@terrainist/compiler";
import type { EmitSummary } from "@terrainist/compiler";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderIsometric } from "../src/voxel/isometric.js";
import { renderWorldViews } from "../src/voxel/views.js";
import type { VoxelGrid } from "../src/voxel/grid.js";
import { worldToGrid } from "../src/world-grid.js";

const SPEC_PATH = fileURLToPath(new URL("../../../examples/pyramid.spike.json", import.meta.url));

const scratch: string[] = [];

let summary: EmitSummary;
let grid: VoxelGrid;

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "terrainist-voxel-"));
  scratch.push(dir);
  const doc = await loadSpikeDocument(SPEC_PATH);
  summary = await emitWorld(doc, path.join(dir, "glass-pyramid"));
  grid = await worldToGrid(summary.worldDir);
}, 180_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("worldToGrid", () => {
  it("reads back the emitted world into a tightly bounded grid", () => {
    const [minX, minY, minZ] = summary.bounds.min;
    const [maxX, maxY, maxZ] = summary.bounds.max;
    expect(grid.bounds).toEqual({ minX, minY, minZ, maxX, maxY, maxZ });
    expect([grid.sizeX, grid.sizeY, grid.sizeZ]).toEqual([64, 9, 64]);
  });

  it("interns the world's blocks, air first", () => {
    expect(grid.palette[0]).toBe("minecraft:air");
    expect(grid.palette).toContain("minecraft:glass");
    expect(grid.palette).toContain("minecraft:grass_block");
    // Nothing else is in this world.
    expect(grid.palette).toHaveLength(3);
  });

  it("places the platform, the pyramid shell and its hollow interior", () => {
    expect(grid.blockAt(0, 63, 0)).toBe("minecraft:grass_block");
    expect(grid.blockAt(0, 71, 0)).toBe("minecraft:glass"); // apex
    expect(grid.blockAt(7, 64, 7)).toBe("minecraft:glass"); // base ring corner
    expect(grid.blockAt(0, 65, 0)).toBe("minecraft:air"); // hollow inside
    // Every emitted block is present, and nothing extra.
    let filled = 0;
    for (const cell of grid.cells) if (cell !== 0) filled++;
    expect(filled).toBe(summary.blockCount);
  });
});

describe("renderIsometric", () => {
  it("produces a sanely sized canvas for the projection", () => {
    const canvas = renderIsometric(grid, "east-south", { scale: 4 });
    // 2:1 dimetric: width = (spanX + spanZ) * scale, height adds the y span.
    expect(canvas.width).toBe((grid.sizeX + grid.sizeZ) * 4 + 2);
    expect(canvas.height).toBe((grid.sizeX + grid.sizeZ) * 2 + grid.sizeY * 4 + 2 * 4 + 2);
    expect(canvas.data).toHaveLength(canvas.width * canvas.height * 4);

    const png = PNG.sync.read(canvas.toPng());
    expect([png.width, png.height]).toEqual([canvas.width, canvas.height]);
  });

  it("is deterministic across runs", () => {
    const first = renderIsometric(grid, "east-south", { scale: 4 }).toPng();
    const second = renderIsometric(grid, "east-south", { scale: 4 }).toPng();
    expect(first.equals(second)).toBe(true);
  });

  it("draws the world rather than an empty background", () => {
    const canvas = renderIsometric(grid, "east-south", { scale: 4 });
    const background = [16, 18, 22];
    let painted = 0;
    for (let i = 0; i < canvas.data.length; i += 4) {
      if (
        canvas.data[i] !== background[0] ||
        canvas.data[i + 1] !== background[1] ||
        canvas.data[i + 2] !== background[2]
      ) {
        painted++;
      }
    }
    // The platform alone covers most of the frame.
    expect(painted).toBeGreaterThan(canvas.width * canvas.height * 0.4);
  });
});

describe("renderWorldViews", () => {
  it("names the standard view set, adding the underground map only with surfaceY", () => {
    const plain = renderWorldViews(grid, { isoScale: 2, orthoScale: 2 }).map((view) => view.name);
    expect(plain).toEqual([
      "iso-east-south",
      "iso-east-north",
      "iso-west-north",
      "iso-west-south",
      "map-top",
      "cutaway-x",
      "cutaway-z",
      "section-z",
      "section-x",
    ]);

    const withSurface = renderWorldViews(grid, {
      isoScale: 2,
      orthoScale: 2,
      surfaceY: 63,
    }).map((view) => view.name);
    expect(withSurface).toContain("map-underground");
    expect(withSurface).toHaveLength(plain.length + 1);
  });

  it("gives every view a non-empty canvas that encodes to a PNG", () => {
    const views = renderWorldViews(grid, { isoScale: 2, orthoScale: 2, surfaceY: 63 });
    for (const view of views) {
      expect(view.canvas.width, view.name).toBeGreaterThan(0);
      expect(view.canvas.height, view.name).toBeGreaterThan(0);
      const png = PNG.sync.read(view.canvas.toPng());
      expect([png.width, png.height], view.name).toEqual([view.canvas.width, view.canvas.height]);
    }
  });
});
