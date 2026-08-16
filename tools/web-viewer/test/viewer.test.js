/**
 * The viewer's testable half.
 *
 * Everything the page does that is not "talk to WebGL" lives in modules with
 * no three.js import, so it can be run here: the wire format, the world index,
 * the appearance table and the mesher. What is deliberately *not* tested is
 * whether the result looks right — that is a judgement made by walking it.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { encodeChunk, encodeRle } from "../../../packages/compiler/src/export/web.js";

import { CHUNK_WIDTH, WorldView, cellOffset, decodeChunk, decodeRle } from "../src/format.js";
import { colorOf, fallbackColor, resolvePalette, shapeOf, texturesFor } from "../src/appearance.js";
import { CELL, TILE, WHITE, atlasLayout, cellOf } from "../src/atlas.js";
import { resolveFaces, textureOf } from "../src/textures.js";
import { blockNameUniverse } from "../tools/block-names.mjs";

const TEXTURE_DIR = path.resolve(import.meta.dirname, "../textures/refi");
const WORLDS_DIR = path.resolve(import.meta.dirname, "../worlds");
import {
  AO_LEVELS,
  FACES,
  meshSection,
  mergeAlong,
  packAo,
  unpackAo,
  vertexAo,
} from "../src/mesher.js";

/* -------------------------------------------------------------------------- */
/* the wire format                                                             */
/* -------------------------------------------------------------------------- */

describe("format", () => {
  it("decodes what the exporter encodes", () => {
    const cells = new Uint16Array(600);
    for (let i = 0; i < cells.length; i++) cells[i] = i % 17;
    expect(Array.from(decodeRle(encodeRle(cells, 1), 1, cells.length))).toEqual(Array.from(cells));
  });

  it("decodes a whole chunk the exporter wrote", () => {
    const height = 24;
    const cells = new Uint16Array(CHUNK_WIDTH * CHUNK_WIDTH * height);
    cells[cellOffset(3, 5, 7, height)] = 9;
    const encoded = encodeChunk({ chunkX: 2, chunkZ: -4, minY: -64, height, cells }, 1);
    const decoded = decodeChunk(encoded);
    expect(decoded).toMatchObject({ chunkX: 2, chunkZ: -4, minY: -64, height });
    expect(decoded.cells[cellOffset(3, 5, 7, height)]).toBe(9);
  });

  it("reads absent chunks and out-of-range y as air", () => {
    const height = 8;
    const cells = new Uint16Array(CHUNK_WIDTH * CHUNK_WIDTH * height);
    cells[cellOffset(0, 0, 0, height)] = 4;
    const world = new WorldView({ palette: ["air", "a", "b", "c", "d"] });
    world.put({ chunkX: 0, chunkZ: 0, minY: 10, height, cells });
    expect(world.indexAt(0, 10, 0)).toBe(4);
    expect(world.indexAt(0, 9, 0)).toBe(0);
    expect(world.indexAt(0, 18, 0)).toBe(0);
    expect(world.indexAt(-1, 10, 0)).toBe(0);
    world.drop(0, 0);
    expect(world.indexAt(0, 10, 0)).toBe(0);
  });

  it("indexes negative world coordinates into the right chunk", () => {
    const height = 4;
    const cells = new Uint16Array(CHUNK_WIDTH * CHUNK_WIDTH * height);
    cells[cellOffset(15, 15, 0, height)] = 2;
    const world = new WorldView({});
    world.put({ chunkX: -1, chunkZ: -1, minY: 0, height, cells });
    expect(world.indexAt(-1, 0, -1)).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* appearance                                                                  */
/* -------------------------------------------------------------------------- */

describe("appearance", () => {
  it("gives block families the colours the table promises", () => {
    expect(colorOf("water")[2]).toBeGreaterThan(colorOf("water")[0]); // blue-dominant
    expect(colorOf("oak_planks")).toEqual(colorOf("oak_stairs"));
    expect(colorOf("spruce_slab")).toEqual(colorOf("spruce_planks"));
    expect(colorOf("cherry_leaves")[0]).toBeGreaterThan(200); // pink, not green
    const green = colorOf("grass_block");
    expect(green[1]).toBeGreaterThan(green[0]);
    expect(colorOf("blue_wool")).toEqual(colorOf("blue_carpet"));
  });

  it("gives an unlisted block a stable pastel rather than nothing", () => {
    const first = colorOf("some_block_nobody_listed");
    expect(first).toEqual(colorOf("some_block_nobody_listed"));
    expect(first).toEqual(fallbackColor("some_block_nobody_listed"));
    expect(first).not.toEqual(colorOf("another_unlisted_block"));
    for (const channel of first) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it("shapes partial blocks so they never cull their neighbours", () => {
    expect(shapeOf("stone", true)).toMatchObject({ occludes: true });
    expect(shapeOf("oak_slab", false).box[4]).toBe(0.5);
    expect(shapeOf("oak_slab", false).occludes).toBe(false);
    expect(shapeOf("oak_fence", false).occludes).toBe(false);
    expect(shapeOf("water", false)).toMatchObject({ occludes: false, sameCulls: true });
    expect(shapeOf("short_grass", false).box[3]).toBeLessThan(1);
  });

  it("resolves a palette into per-index entries with air at 0", () => {
    const resolved = resolvePalette(["air", "stone", "water", "lantern"], [false, true, false, false]);
    expect(resolved[0].air).toBe(true);
    expect(resolved[1].occludes).toBe(true);
    expect(resolved[2].alpha).toBeLessThan(1);
    expect(resolved[3].emissive).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* the mesher                                                                  */
/* -------------------------------------------------------------------------- */

/** Every face's winding must produce the outward normal it declares. */
describe("mesher", () => {
  it("winds every face so its geometric normal faces out", () => {
    for (const face of FACES) {
      const [p0, p1, p2] = face.corners;
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
      const cross = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      expect(cross.map((value) => value + 0)).toEqual(face.normal);
    }
  });

  it("darkens a corner by its neighbours, and closes it when both sides are solid", () => {
    expect(vertexAo(false, false, false)).toBe(3);
    expect(vertexAo(true, false, false)).toBe(2);
    expect(vertexAo(true, false, true)).toBe(1);
    expect(vertexAo(true, true, false)).toBe(0);
    expect(vertexAo(true, true, true)).toBe(0);
    expect(AO_LEVELS[0]).toBeLessThan(AO_LEVELS[3]);
  });

  const palette = resolvePalette(["air", "stone", "water", "short_grass"], [false, true, false, false]);

  /** A sampler over a sparse map, so a test can state a world in four lines. */
  function samplerOf(blocks) {
    const map = new Map(blocks.map(([x, y, z, index]) => [`${x},${y},${z}`, index]));
    return (x, y, z) => map.get(`${x},${y},${z}`) ?? 0;
  }

  it("draws six faces for a lone cube and none for an enclosed one", () => {
    const lone = meshSection(samplerOf([[0, 0, 0, 1]]), palette, 0, 0, 0);
    expect(lone.opaque.triangles).toBe(12); // 6 faces, 2 triangles each
    expect(lone.transparent.triangles).toBe(0);

    const buried = meshSection(
      samplerOf([
        [1, 1, 1, 1],
        [0, 1, 1, 1],
        [2, 1, 1, 1],
        [1, 0, 1, 1],
        [1, 2, 1, 1],
        [1, 1, 0, 1],
        [1, 1, 2, 1],
      ]),
      palette,
      0,
      0,
      0,
    );
    // The centre block is fully enclosed and contributes nothing; each of its
    // six neighbours loses exactly the face pointing at it.
    const shellOnly = meshSection(
      samplerOf([
        [0, 1, 1, 1],
        [2, 1, 1, 1],
        [1, 0, 1, 1],
        [1, 2, 1, 1],
        [1, 1, 0, 1],
        [1, 1, 2, 1],
      ]),
      palette,
      0,
      0,
      0,
    );
    expect(shellOnly.opaque.triangles).toBe(6 * 12);
    expect(buried.opaque.triangles).toBe(shellOnly.opaque.triangles - 6 * 2);
  });

  it("hides the shared face between two cubes, both ways", () => {
    const pair = meshSection(samplerOf([[0, 0, 0, 1], [1, 0, 0, 1]]), palette, 0, 0, 0, {
      merge: false,
    });
    expect(pair.opaque.triangles).toBe(2 * 12 - 2 * 2);
    // Merged, the pair is a 2x1x1 box: six quads, whatever it is made of.
    const merged = meshSection(samplerOf([[0, 0, 0, 1], [1, 0, 0, 1]]), palette, 0, 0, 0);
    expect(merged.opaque.quads).toBe(6);
  });

  it("keeps a non-cube from hiding the block behind it", () => {
    const behindGrass = meshSection(samplerOf([[0, 0, 0, 1], [1, 0, 0, 3]]), palette, 0, 0, 0);
    // The stone keeps all six faces; the grass tuft adds its own six.
    expect(behindGrass.opaque.triangles).toBe(12 + 12);
  });

  it("routes translucent blocks into their own buffer and merges their shared faces", () => {
    const pool = meshSection(samplerOf([[0, 0, 0, 2], [1, 0, 0, 2]]), palette, 0, 0, 0, {
      merge: false,
    });
    expect(pool.opaque.triangles).toBe(0);
    expect(pool.transparent.triangles).toBe(2 * 12 - 2 * 2);
  });

  it("emits positions inside the section, a colour per vertex and a valid index buffer", () => {
    const built = meshSection(samplerOf([[3, 4, 5, 1]]), palette, 0, 0, 0);
    const vertices = built.opaque.position.length / 3;
    expect(built.opaque.color.length / 3).toBe(vertices);
    for (const value of built.opaque.index) expect(value).toBeLessThan(vertices);
    for (let i = 0; i < built.opaque.position.length; i += 3) {
      expect(built.opaque.position[i]).toBeGreaterThanOrEqual(3);
      expect(built.opaque.position[i]).toBeLessThanOrEqual(4);
    }
    for (const value of built.opaque.color) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("darkens a face's occluded corner relative to its open one", () => {
    // A slab of stone with one block standing on it: the top face of the
    // neighbour tile picks up AO from the standing block.
    const sample = samplerOf([
      [0, 0, 0, 1],
      [1, 0, 0, 1],
      [1, 1, 0, 1],
    ]);
    const built = meshSection(sample, palette, 0, 0, 0);
    let brightest = 0;
    let darkest = 1;
    for (let i = 0; i < built.opaque.color.length; i += 3) {
      const value = built.opaque.color[i];
      if (value > brightest) brightest = value;
      if (value < darkest) darkest = value;
    }
    expect(darkest).toBeLessThan(brightest);
  });

  it("meshes only the section it was given", () => {
    const outside = meshSection(samplerOf([[20, 0, 0, 1]]), palette, 0, 0, 0);
    expect(outside.opaque.triangles).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* greedy merging                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Merging is the one change in here that can be wrong in a way nobody sees
 * until they are standing in the world: a quad that spans a gap looks like a
 * wall, and a quad that stops short looks like a hole. Both are invisible in a
 * triangle count, so every fixture below asserts *coverage* — the number of
 * cell-faces the quads account for — against a naive mesh of the same world,
 * and only then asserts that the merged mesh got there with fewer triangles.
 */
describe("greedy merging", () => {
  const names = ["air", "stone", "water", "short_grass", "oak_fence", "grass_block"];
  const solid = [false, true, false, false, false, true];
  const merged = resolvePalette(names, solid);

  function samplerOf(blocks) {
    const map = new Map(blocks.map(([x, y, z, index]) => [`${x},${y},${z}`, index]));
    return (x, y, z) => map.get(`${x},${y},${z}`) ?? 0;
  }

  /** Walk a buffer four vertices at a time — the mesher emits quad by quad. */
  function quadsOf(part) {
    const quads = [];
    for (let q = 0; q * 4 < part.position.length / 3; q++) {
      const positions = [];
      const uvs = [];
      for (let k = 0; k < 4; k++) {
        const v = q * 4 + k;
        positions.push([part.position[v * 3], part.position[v * 3 + 1], part.position[v * 3 + 2]]);
        uvs.push([part.uv[v * 2], part.uv[v * 2 + 1]]);
      }
      quads.push({ positions, uvs });
    }
    return quads;
  }

  /** How many single-block faces a buffer's quads stand for, from their UVs. */
  function coverage(part) {
    let total = 0;
    for (const quad of quadsOf(part)) {
      const us = quad.uvs.map((uv) => uv[0]);
      const vs = quad.uvs.map((uv) => uv[1]);
      total += (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    }
    return total;
  }

  /** Total surface area, in blocks². A merge over a gap would inflate this. */
  function area(part) {
    let total = 0;
    for (const quad of quadsOf(part)) {
      const extents = [0, 1, 2].map((axis) => {
        const values = quad.positions.map((point) => point[axis]);
        return Math.max(...values) - Math.min(...values);
      });
      const spread = extents.filter((value) => value > 1e-9);
      total += spread.length === 2 ? spread[0] * spread[1] : 0;
    }
    return total;
  }

  function bothWays(sample, size = 16) {
    return {
      naive: meshSection(sample, merged, 0, 0, 0, { size, merge: false }),
      greedy: meshSection(sample, merged, 0, 0, 0, { size, merge: true }),
    };
  }

  it("turns a solid 16³ block of stone into six quads", () => {
    const cells = [];
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) cells.push([x, y, z, 1]);
      }
    }
    const { naive, greedy } = bothWays(samplerOf(cells));
    expect(naive.opaque.quads).toBe(6 * 16 * 16);
    expect(naive.opaque.triangles).toBe(6 * 16 * 16 * 2);
    expect(greedy.opaque.quads).toBe(6);
    expect(greedy.opaque.triangles).toBe(12);
    expect(coverage(greedy.opaque)).toBeCloseTo(naive.opaque.quads, 6);
    expect(area(greedy.opaque)).toBeCloseTo(area(naive.opaque), 6);
  });

  it("merges a heightfield's faces without covering or dropping one", () => {
    const cells = [];
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const height = 4 + ((x * 7 + z * 3) % 5);
        for (let y = 0; y < height; y++) cells.push([x, y, z, y === height - 1 ? 5 : 1]);
      }
    }
    const { naive, greedy } = bothWays(samplerOf(cells));
    expect(coverage(greedy.opaque)).toBeCloseTo(naive.opaque.quads, 6);
    expect(area(greedy.opaque)).toBeCloseTo(area(naive.opaque), 6);
    // Deliberately noisy ground: every step in the height field breaks a run
    // and every riser casts AO, so a quarter off is a fair floor for terrain.
    expect(greedy.opaque.quads).toBeLessThan(naive.opaque.quads * 0.8);
  });

  it("merges a flat sea surface and leaves the water's short sides alone", () => {
    const cells = [];
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        cells.push([x, 0, z, 1]);
        for (let y = 1; y < 5; y++) cells.push([x, y, z, 2]);
      }
    }
    const { naive, greedy } = bothWays(samplerOf(cells));
    expect(coverage(greedy.transparent)).toBeCloseTo(naive.transparent.quads, 6);
    expect(area(greedy.transparent)).toBeCloseTo(area(naive.transparent), 6);
    // Water's box stops at 0.9, so its side faces merge across but never up:
    // four walls of four courses each, plus the one surface. There is no floor
    // quad — the stone under the sea culls it.
    expect(greedy.transparent.quads).toBe(4 * 4 + 1);
  });

  it("never merges two fence posts sideways across the gap between them", () => {
    const cells = [];
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 4; y++) cells.push([x, y, 0, 4]);
    }
    const { naive, greedy } = bothWays(samplerOf(cells));
    expect(coverage(greedy.opaque)).toBeCloseTo(naive.opaque.quads, 6);
    // The give-away: a sideways merge would sweep the empty space between the
    // posts into the quad and the area would jump.
    expect(area(greedy.opaque)).toBeCloseTo(area(naive.opaque), 6);
    expect(greedy.opaque.quads).toBeLessThan(naive.opaque.quads);
  });

  it("merges nothing when no two neighbouring faces look the same", () => {
    const cells = [];
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) {
          if ((x + y + z) % 2 === 0) cells.push([x, y, z, 1]);
        }
      }
    }
    const { naive, greedy } = bothWays(samplerOf(cells));
    expect(greedy.opaque.quads).toBe(naive.opaque.quads);
    expect(coverage(greedy.opaque)).toBeCloseTo(naive.opaque.quads, 6);
  });

  it("refuses to merge across a difference in ambient occlusion", () => {
    // A row of stone with one block standing at its end: the top faces near the
    // riser are darker, so the run must break where the shading changes.
    const flat = [];
    for (let x = 0; x < 8; x++) flat.push([x, 0, 0, 1]);
    const open = meshSection(samplerOf(flat), merged, 0, 0, 0);
    const shadowed = meshSection(samplerOf([...flat, [8, 0, 0, 1], [8, 1, 0, 1]]), merged, 0, 0, 0);
    expect(shadowed.opaque.quads).toBeGreaterThan(open.opaque.quads);
    expect(packAo([3, 3, 3, 3])).toBe(255);
    expect(unpackAo(packAo([0, 1, 2, 3]))).toEqual([0, 1, 2, 3]);
  });

  it("only grows a face along an axis its box fills", () => {
    const stone = merged[1];
    const fence = merged[4];
    const water = merged[2];
    expect(mergeAlong(stone, 0)).toBe(true);
    expect(mergeAlong(stone, 1)).toBe(true);
    expect(mergeAlong(fence, 0)).toBe(false); // 0.34..0.66 in x
    expect(mergeAlong(fence, 1)).toBe(true); // full height
    expect(mergeAlong(water, 1)).toBe(false); // stops at 0.9
    expect(mergeAlong(water, 2)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* the texture atlas                                                           */
/* -------------------------------------------------------------------------- */

describe("atlas", () => {
  it("reserves slot zero for white and puts every cell inside the sheet", () => {
    const layout = atlasLayout(["a.png", "b.png", "c.png", "a.png"]);
    expect(layout.slots[0]).toBe(WHITE);
    expect(layout.slots).toHaveLength(4); // white plus three distinct files
    expect(layout.width).toBe(layout.columns * CELL);
    for (const file of layout.slots) {
      const [u0, v0, du, dv] = cellOf(layout, file);
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v0).toBeGreaterThanOrEqual(0);
      expect(u0 + du).toBeLessThanOrEqual(1);
      expect(v0 + dv).toBeLessThanOrEqual(1);
      expect(du).toBeCloseTo(TILE / layout.width, 10);
    }
  });

  it("pads every cell by half a tile on each side, so a mip cannot cross it", () => {
    const layout = atlasLayout(["a.png", "b.png"]);
    expect(layout.pad).toBe(TILE / 2);
    expect(CELL).toBe(TILE * 2);
    const [u0] = cellOf(layout, "a.png");
    // The used rectangle starts a pad in, never at the cell's own edge.
    expect(u0 * layout.width % CELL).toBeCloseTo(layout.pad, 6);
  });

  it("hands an unmapped name the white cell rather than nothing", () => {
    const layout = atlasLayout(["a.png"]);
    expect(cellOf(layout, "never-vendored.png")).toEqual(cellOf(layout, WHITE));
  });

  it("lays the same files out the same way every time", () => {
    const files = ["z.png", "a.png", "m.png"];
    expect(atlasLayout(files).slots).toEqual(atlasLayout([...files]).slots);
  });
});

/* -------------------------------------------------------------------------- */
/* the texture mapping                                                         */
/* -------------------------------------------------------------------------- */

const vendored = new Set(
  existsSync(TEXTURE_DIR) ? readdirSync(TEXTURE_DIR).filter((file) => file.endsWith(".png")) : [],
);

describe("texture mapping", () => {
  it("names six faces, or none at all", () => {
    for (const name of ["stone", "grass_block", "oak_log", "water", "red_wool", "quartz_stairs"]) {
      const faces = resolveFaces(textureOf(name));
      expect(faces, name).toHaveLength(6);
      for (const file of faces) expect(typeof file, `${name}`).toBe("string");
    }
    expect(textureOf("a_block_nobody_has_a_texture_for")).toBeUndefined();
    expect(resolveFaces(undefined)).toBeUndefined();
  });

  it("gives a block's top, sides and bottom the faces they deserve", () => {
    const grass = resolveFaces(textureOf("grass_block"));
    expect(grass[2]).not.toBe(grass[0]); // top is not the side
    expect(grass[3]).not.toBe(grass[2]); // bottom is not the top
    expect(grass[0]).toBe(grass[1]);
    expect(grass[0]).toBe(grass[4]);

    const log = resolveFaces(textureOf("oak_log"));
    expect(log[2]).toBe(log[3]); // both ends, one end grain
    expect(log[2]).not.toBe(log[0]);

    expect(resolveFaces(textureOf("stone")).every((file, _, all) => file === all[0])).toBe(true);
  });

  it("inherits a shape's texture from the block it is cut from", () => {
    for (const [shape, block] of [
      ["cobblestone_stairs", "cobblestone"],
      ["stone_brick_wall", "stone_bricks"],
      ["deepslate_tile_slab", "deepslate_tiles"],
      ["oak_fence", "oak_planks"],
      ["exposed_cut_copper_slab", "exposed_cut_copper"],
      ["quartz_stairs", "quartz_block"],
    ]) {
      expect(resolveFaces(textureOf(shape)), shape).toEqual(resolveFaces(textureOf(block)));
    }
  });

  it("tints a shared texture where the pack has one file and we have sixteen", () => {
    const red = textureOf("red_bed");
    const blue = textureOf("blue_bed");
    expect(red.all).toBe(blue.all);
    expect(red.tint).not.toEqual(blue.tint);
    // Wool is the opposite case: sixteen real files, so no tint at all.
    expect(textureOf("red_wool").tint).toBeUndefined();
    expect(textureOf("red_wool").all).not.toBe(textureOf("blue_wool").all);
  });

  it.skipIf(vendored.size === 0)("only names textures that were vendored", () => {
    const missing = new Set();
    for (const name of blockNameUniverse()) {
      const faces = resolveFaces(textureOf(name));
      if (faces === undefined) continue;
      for (const file of faces) if (file !== undefined && !vendored.has(file)) missing.add(file);
    }
    expect([...missing]).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* palettes, textured and not                                                  */
/* -------------------------------------------------------------------------- */

describe("resolving a palette against an atlas", () => {
  const names = ["air", "stone", "grass_block", "a_block_nobody_has_a_texture_for", "red_bed"];
  const solid = [false, true, true, true, false];

  it("leaves an atlas-less palette exactly as it was before textures", () => {
    for (const entry of resolvePalette(names, solid)) {
      expect(entry.faces).toBeUndefined();
      expect(entry.tint).toEqual(entry.color);
    }
  });

  it("gives a mapped block cells and a white tint, and an unmapped one neither", () => {
    const layout = atlasLayout(texturesFor(names));
    const resolved = resolvePalette(names, solid, layout);
    expect(resolved[1].faces).toHaveLength(6);
    expect(resolved[1].tint).toEqual([255, 255, 255]);
    // Six cells, but the top one differs from the sides: grass, textured.
    expect(resolved[2].faces[2]).not.toEqual(resolved[2].faces[0]);
    // Unmapped: no cells at all, and the flat colour survives untouched.
    expect(resolved[3].faces).toBeUndefined();
    expect(resolved[3].tint).toEqual(colorOf("a_block_nobody_has_a_texture_for"));
    // Tinted: a real cell and a real tint.
    expect(resolved[4].faces).toHaveLength(6);
    expect(resolved[4].tint).toEqual(textureOf("red_bed").tint);
  });

  /**
   * Coverage, on whatever worlds are on disk.
   *
   * `worlds/` is gitignored, so this reports rather than gatekeeps below the
   * floor: a fresh checkout has nothing to measure and must not go red for it.
   * What it does assert is that a world present is at least nine-tenths
   * textured, because falling off that quietly is exactly the failure mode a
   * mapping table has.
   */
  it("puts a texture on nearly every block an exported world uses", () => {
    const worlds = existsSync(WORLDS_DIR)
      ? readdirSync(WORLDS_DIR).filter((name) =>
          existsSync(path.join(WORLDS_DIR, name, "manifest.json")),
        )
      : [];
    for (const world of worlds) {
      const manifest = JSON.parse(
        readFileSync(path.join(WORLDS_DIR, world, "manifest.json"), "utf8"),
      );
      const blocks = manifest.palette.filter((name) => name !== "air");
      const flat = blocks.filter((name) => resolveFaces(textureOf(name)) === undefined);
      const textured = blocks.length - flat.length;
      const percent = Math.round((textured / blocks.length) * 100);
      console.log(
        `[coverage] ${world}: ${textured}/${blocks.length} blocks textured (${percent}%)` +
          (flat.length === 0 ? "" : `; flat: ${flat.join(", ")}`),
      );
      expect(percent, world).toBeGreaterThanOrEqual(90);
    }
  });
});
