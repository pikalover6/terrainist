import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { emitWorld, loadSpikeDocument } from "@terrainist/compiler";
import type { EmitSummary } from "@terrainist/compiler";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyBiomeTint } from "../src/biome-tint.js";
import { blockColor } from "../src/block-colors.js";
import { renderTopDown } from "../src/top-down.js";
import type { TopDownRender } from "../src/top-down.js";

const SPEC_PATH = fileURLToPath(new URL("../../../examples/pyramid.spike.json", import.meta.url));

const SCALE = 4;
/** The biome `emitWorld` paints a world with when the spec asks for none. */
const EMIT_BIOME = "minecraft:plains";
/** The example world: 64x64 platform at y=63, hollow pyramid up to y=71. */
const PLATFORM_MIN_Y = 63;
const APEX_Y = 71;

const scratch: string[] = [];

let summary: EmitSummary;
let render: TopDownRender;
let pixels: PNG;

/** Read the RGBA at a world block coordinate (sampling the block's top-left pixel). */
function sampleBlock(x: number, z: number): [number, number, number, number] {
  const px = (x - render.bounds.minX) * render.scale;
  const pz = (z - render.bounds.minZ) * render.scale;
  const offset = (pz * pixels.width + px) * 4;
  const rgba = [
    pixels.data[offset],
    pixels.data[offset + 1],
    pixels.data[offset + 2],
    pixels.data[offset + 3],
  ];
  expect(rgba.every((c) => c !== undefined), `pixel (${px}, ${pz}) is out of range`).toBe(true);
  return rgba as [number, number, number, number];
}

/**
 * Colour a block reads as at a given surface height, given the render's y
 * range. The example world is emitted entirely in the default biome, so grass
 * and foliage carry that biome's tint.
 */
function expectedShade(blockName: string, y: number): [number, number, number] {
  const { minY, maxY } = render.bounds;
  const span = maxY - minY;
  const brightness = span === 0 ? 1 : 0.6 + (0.4 * (y - minY)) / span;
  const [r, g, b] = applyBiomeTint(blockColor(blockName), blockName, EMIT_BIOME);
  return [
    Math.round(r * brightness),
    Math.round(g * brightness),
    Math.round(b * brightness),
  ];
}

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "terrainist-render-"));
  scratch.push(dir);
  const doc = await loadSpikeDocument(SPEC_PATH);
  summary = await emitWorld(doc, path.join(dir, "glass-pyramid"));
  render = await renderTopDown(summary.worldDir, { scale: SCALE });
  pixels = PNG.sync.read(render.png);
}, 180_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("renderTopDown", () => {
  it("covers the emitted chunks and sizes the image from the bounds", () => {
    // 64x64 platform => chunks (-2..1)^2 => blocks -32..31 on both axes.
    expect(render.bounds).toEqual({
      minX: -32,
      maxX: 31,
      minZ: -32,
      maxZ: 31,
      minY: PLATFORM_MIN_Y,
      maxY: APEX_Y,
    });

    const blocksWide = render.bounds.maxX - render.bounds.minX + 1;
    const blocksTall = render.bounds.maxZ - render.bounds.minZ + 1;
    expect(render.width).toBe(blocksWide * SCALE);
    expect(render.height).toBe(blocksTall * SCALE);
    expect([pixels.width, pixels.height]).toEqual([render.width, render.height]);
    // Every platform column is a surface column.
    expect(render.columnCount).toBe(blocksWide * blocksTall);
  });

  it("paints the platform as shaded grass", () => {
    // (-20, -20) is bare platform: outside the pyramid, inside the slab.
    const [r, g, b, a] = sampleBlock(-20, -20);
    expect(a).toBe(255);
    expect([r, g, b]).toEqual(expectedShade("grass_block", PLATFORM_MIN_Y));
  });

  it("paints the pyramid apex as the brightest glass", () => {
    const [r, g, b, a] = sampleBlock(0, 0);
    expect(a).toBe(255);
    // The apex is the highest surface in the world, so brightness is 1.0.
    expect([r, g, b]).toEqual(blockColor("glass"));
    expect([r, g, b]).toEqual(expectedShade("glass", APEX_Y));
  });

  it("shades by height: the apex reads brighter than the pyramid base ring", () => {
    const apex = sampleBlock(0, 0);
    const baseRing = sampleBlock(7, 0); // y = 64, the lowest glass ring
    const platform = sampleBlock(-20, -20);
    const luma = ([r, g, b]: readonly number[]): number =>
      (r as number) + (g as number) + (b as number);
    expect(luma(apex)).toBeGreaterThan(luma(baseRing));
    expect(luma(baseRing)).toBeGreaterThan(luma(expectedShade("glass", PLATFORM_MIN_Y)));
    expect(platform[3]).toBe(255);
  });

  it("is fully opaque, because the platform exactly fills its chunks", () => {
    // 64x64 starting at -32 lands on chunk boundaries, so every column in the
    // image has a block under it. (Transparency is exercised by the sparse
    // world below, where most columns are empty.)
    expect(sampleBlock(31, 31)[3]).toBe(255);
    expect(sampleBlock(-32, -32)[3]).toBe(255);
    let opaque = 0;
    for (let offset = 3; offset < pixels.data.length; offset += 4) {
      if (pixels.data[offset] === 255) opaque++;
    }
    expect(opaque).toBe(render.width * render.height);
  });

  it("is byte-identical across runs", async () => {
    const again = await renderTopDown(summary.worldDir, { scale: SCALE });
    expect(again.png.equals(render.png)).toBe(true);
  }, 120_000);
});

describe("renderTopDown on a sparse world", () => {
  let sparse: TopDownRender;
  let sparsePixels: PNG;

  beforeAll(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-render-sparse-"));
    scratch.push(dir);
    // Two single-block pillars two chunks apart: most columns are empty, so the
    // render must be mostly transparent.
    sparse = await renderSparseWorld(dir);
    sparsePixels = PNG.sync.read(sparse.png);
  }, 180_000);

  it("renders empty columns as transparent", () => {
    expect(sparse.bounds).toEqual({
      minX: 0,
      maxX: 47,
      minZ: 0,
      maxZ: 15,
      minY: 64,
      maxY: 70,
    });
    expect(sparse.columnCount).toBe(2);

    const at = (x: number, z: number): number[] => {
      const offset = ((z - sparse.bounds.minZ) * sparse.scale * sparsePixels.width +
        (x - sparse.bounds.minX) * sparse.scale) * 4;
      return [...sparsePixels.data.subarray(offset, offset + 4)];
    };

    // The stone pillar (low) and the sand pillar (high) are opaque...
    expect(at(1, 1)[3]).toBe(255);
    expect(at(33, 1)[3]).toBe(255);
    // ...and a column with nothing in it is fully transparent.
    expect(at(20, 8)).toEqual([0, 0, 0, 0]);
  });
});

async function renderSparseWorld(dir: string): Promise<TopDownRender> {
  const worldDir = path.join(dir, "sparse");
  await emitWorld(
    {
      format: "terrainist-spike-0",
      name: "sparse",
      spawn: { x: 0, y: 65, z: 0 },
      palette: { S: "minecraft:stone", D: "minecraft:sand" },
      ops: [
        { op: "fill", block: "S", from: [1, 64, 1], to: [1, 64, 1] },
        { op: "fill", block: "D", from: [33, 70, 1], to: [33, 70, 1] },
      ],
    },
    worldDir,
  );
  return renderTopDown(worldDir, { scale: 2 });
}
