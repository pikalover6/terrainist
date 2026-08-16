/**
 * The viewer's testable half.
 *
 * Everything the page does that is not "talk to WebGL" lives in modules with
 * no three.js import, so it can be run here: the wire format, the world index,
 * the appearance table and the mesher. What is deliberately *not* tested is
 * whether the result looks right — that is a judgement made by walking it.
 */

import { describe, expect, it } from "vitest";

import { encodeChunk, encodeRle } from "../../../packages/compiler/src/export/web.js";

import { CHUNK_WIDTH, WorldView, cellOffset, decodeChunk, decodeRle } from "../src/format.js";
import { colorOf, fallbackColor, resolvePalette, shapeOf } from "../src/appearance.js";
import { AO_LEVELS, FACES, meshSection, vertexAo } from "../src/mesher.js";

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
    const pair = meshSection(samplerOf([[0, 0, 0, 1], [1, 0, 0, 1]]), palette, 0, 0, 0);
    expect(pair.opaque.triangles).toBe(2 * 12 - 2 * 2);
  });

  it("keeps a non-cube from hiding the block behind it", () => {
    const behindGrass = meshSection(samplerOf([[0, 0, 0, 1], [1, 0, 0, 3]]), palette, 0, 0, 0);
    // The stone keeps all six faces; the grass tuft adds its own six.
    expect(behindGrass.opaque.triangles).toBe(12 + 12);
  });

  it("routes translucent blocks into their own buffer and merges their shared faces", () => {
    const pool = meshSection(samplerOf([[0, 0, 0, 2], [1, 0, 0, 2]]), palette, 0, 0, 0);
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
