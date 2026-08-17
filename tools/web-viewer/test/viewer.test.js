/**
 * The viewer's testable half.
 *
 * Everything the page does that is not "talk to WebGL" lives in modules with
 * no three.js import, so it can be run here: the wire format, the world index,
 * the appearance table and the mesher. What is deliberately *not* tested is
 * whether the result looks right — that is a judgement made by walking it.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { encodeChunk, encodeRle } from "../../../packages/compiler/src/export/web.js";

import { CHUNK_WIDTH, WorldView, cellOffset, decodeChunk, decodeRle } from "../src/format.js";
import {
  collisionHeight,
  colorOf,
  fallbackColor,
  isFoliage,
  resolvePalette,
  shapeOf,
  texturesFor,
} from "../src/appearance.js";
import { CELL, TILE, WHITE, atlasLayout, cellOf } from "../src/atlas.js";
import { resolveFaces, textureOf } from "../src/textures.js";
import {
  PLAYER,
  boxCollides,
  eyePosition,
  groundSnap,
  newPlayer,
  step,
} from "../src/physics.js";
import { blockNameUniverse } from "../tools/block-names.mjs";

const TEXTURE_DIR = path.resolve(import.meta.dirname, "../textures/refi");
const WORLDS_DIR = path.resolve(import.meta.dirname, "../worlds");
import {
  AO_LEVELS,
  FACES,
  FLAG_CROSS,
  FLAG_EMISSIVE,
  FLAG_FOLIAGE,
  FLAG_WATER,
  blockFlags,
  meshSection,
  mergeAlong,
  packAo,
  plantOffset,
  unpackAo,
  vertexAo,
} from "../src/mesher.js";
import { cloudField, cloudNoise } from "../src/noise.js";
import {
  QUALITY_MODES,
  nextQuality,
  qualitySettings,
  resolveQuality,
} from "../src/quality.js";
import { fitSunCamera, sunBasis } from "../src/shadow.js";
import {
  AZIMUTH_SPREAD,
  SUN_AZIMUTH,
  SUN_ELEVATION,
  equirectUv,
  sunDirection,
  worldAzimuth,
} from "../src/sky.js";
import {
  ANIM_GLSL,
  BLOCK_FRAGMENT,
  BLOCK_VERTEX,
  DEPTH_FRAGMENT,
  DEPTH_VERTEX,
  GOD_RAYS_SHADER,
  GRADE_SHADER,
  blockDefines,
  blockUniforms,
  declaredUniforms,
  depthDefines,
} from "../src/shaders.js";
import { WATER_AMPLITUDE, plantSway, waterHeight } from "../src/wave.js";

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
    expect(shapeOf("short_grass", false).render).toBe("cross");
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
    // The stone keeps all six faces; the grass tuft adds a cross — two planes,
    // each wound both ways, so four quads.
    expect(behindGrass.opaque.triangles).toBe(12 + 8);
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

/* -------------------------------------------------------------------------- */
/* plants                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A plant is not a box, and every property that follows from that is checked
 * here: two crossed planes rather than six faces, never merged with the plant
 * next to it, never culling or culled, and never in anybody's way.
 */
describe("plants", () => {
  const names = ["air", "stone", "short_grass", "poppy", "pink_petals", "water", "seagrass"];
  const solid = [false, true, false, false, false, false, false];
  const palette = resolvePalette(names, solid);

  function samplerOf(blocks) {
    const map = new Map(blocks.map(([x, y, z, index]) => [`${x},${y},${z}`, index]));
    return (x, y, z) => map.get(`${x},${y},${z}`) ?? 0;
  }

  /** Every quad in a buffer as four points. */
  function quadsOf(part) {
    const quads = [];
    for (let q = 0; q * 4 < part.position.length / 3; q++) {
      const points = [];
      const uvs = [];
      for (let k = 0; k < 4; k++) {
        const v = q * 4 + k;
        points.push([part.position[v * 3], part.position[v * 3 + 1], part.position[v * 3 + 2]]);
        uvs.push([part.uv[v * 2], part.uv[v * 2 + 1]]);
      }
      quads.push({ points, uvs });
    }
    return quads;
  }

  it("calls every plant a cross and every ground cover a flat", () => {
    for (const name of [
      "short_grass",
      "tall_grass",
      "fern",
      "large_fern",
      "poppy",
      "dandelion",
      "cornflower",
      "azure_bluet",
      "oxeye_daisy",
      "allium",
      "lily_of_the_valley",
      "red_tulip",
      "dead_bush",
      "oak_sapling",
      "cherry_sapling",
      "sweet_berry_bush",
      "brown_mushroom",
      "red_mushroom",
      "seagrass",
      "tall_seagrass",
      "kelp",
      "kelp_plant",
      "vine",
      "sugar_cane",
    ]) {
      expect(shapeOf(name, false), name).toMatchObject({ render: "cross", occludes: false });
    }
    expect(shapeOf("pink_petals", false).render).toBe("flat");
    // A cube is still a cube: the plant rules must not reach a block.
    expect(shapeOf("grass_block", true).render).toBe("box");
    expect(shapeOf("mushroom_stem", true).render).toBe("box");
    expect(shapeOf("moss_carpet", false).render).toBe("box");
    // …and a plant nobody listed is a cross with its flat colour, not a cube.
    expect(shapeOf("scorched_grass_tuft", false).render).toBe("cross");
  });

  it("draws a plant as two crossed planes, each wound both ways", () => {
    const built = meshSection(samplerOf([[3, 0, 5, 2]]), palette, 0, 0, 0);
    const quads = quadsOf(built.opaque);
    expect(quads).toHaveLength(4);
    expect(built.opaque.triangles).toBe(8);
    expect(built.transparent.triangles).toBe(0);

    // Two distinct planes, each appearing exactly twice (front and back).
    const planes = new Set(
      quads.map((quad) =>
        quad.points
          .map((point) => point.map((value) => value.toFixed(3)).join(":"))
          .sort()
          .join("|"),
      ),
    );
    expect(planes.size).toBe(2);

    for (const quad of quads) {
      const xs = quad.points.map((point) => point[0]);
      const ys = quad.points.map((point) => point[1]);
      const zs = quad.points.map((point) => point[2]);
      // A full-height diagonal that stays inside its own cell, jitter included.
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1, 6);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.8);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.8);
      expect(Math.min(...xs)).toBeGreaterThan(3 - 0.2);
      expect(Math.max(...xs)).toBeLessThan(4 + 0.2);
      expect(Math.min(...zs)).toBeGreaterThan(5 - 0.2);
      expect(Math.max(...zs)).toBeLessThan(6 + 0.2);
      // UVs: the whole tile, once, with v = 1 at the ground.
      const ground = quad.points
        .map((point, k) => [point[1], quad.uvs[k][1]])
        .filter(([y]) => y < 0.5);
      for (const [, v] of ground) expect(v).toBe(1);
      expect(new Set(quad.uvs.map((uv) => uv.join(","))).size).toBe(4);
    }

    // Both windings: the two triangles of a plane face opposite ways.
    const index = Array.from(built.opaque.index);
    expect(index).toHaveLength(24);
  });

  it("never merges one plant into the next, however many stand in a row", () => {
    const row = [];
    for (let x = 0; x < 8; x++) row.push([x, 0, 0, 2]);
    const built = meshSection(samplerOf(row), palette, 0, 0, 0);
    expect(built.opaque.quads).toBe(8 * 4);
  });

  it("gives every plant its own offset, and the same one every time", () => {
    const built = meshSection(samplerOf([[1, 0, 1, 2], [2, 0, 1, 2]]), palette, 0, 0, 0);
    const again = meshSection(samplerOf([[1, 0, 1, 2], [2, 0, 1, 2]]), palette, 0, 0, 0);
    expect(Array.from(built.opaque.position)).toEqual(Array.from(again.opaque.position));
    const first = plantOffset(1, 1);
    const second = plantOffset(2, 1);
    expect(first).not.toEqual(second);
    for (const value of [...first, ...second]) expect(Math.abs(value)).toBeLessThanOrEqual(0.14);
  });

  it("lets a plant hide nothing and be hidden by nothing", () => {
    // A plant walled in on all six sides still draws, and the stone around it
    // keeps every face that looks at it.
    const cells = [[1, 1, 1, 2]];
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      cells.push([1 + dx, 1 + dy, 1 + dz, 1]);
    }
    const built = meshSection(samplerOf(cells), palette, 0, 0, 0);
    // Six cubes, each keeping all six faces (nothing culls against a plant),
    // plus the plant's own four quads.
    expect(built.opaque.quads).toBe(6 * 6 + 4);
  });

  it("draws ground cover as one flat quad on the floor, both ways up", () => {
    const built = meshSection(samplerOf([[0, 4, 0, 4]]), palette, 0, 0, 0);
    const quads = quadsOf(built.opaque);
    expect(quads).toHaveLength(2);
    for (const quad of quads) {
      for (const point of quad.points) expect(point[1]).toBeCloseTo(4.0625, 6);
    }
  });

  /**
   * The survey Kai asked for: every plant in every world on disk, named, with
   * the shape and the texture it will actually wear. It prints the table and
   * fails on a plant that is still a cube — which is the bug that started this.
   */
  it("leaves no plant in any exported world drawn as a cube", () => {
    const PLANT = new Set([
      "short_grass",
      "grass",
      "tall_grass",
      "fern",
      "large_fern",
      "seagrass",
      "tall_seagrass",
      "kelp",
      "kelp_plant",
      "dead_bush",
      "sweet_berry_bush",
      "brown_mushroom",
      "red_mushroom",
      "poppy",
      "dandelion",
      "cornflower",
      "azure_bluet",
      "oxeye_daisy",
      "allium",
      "blue_orchid",
      "lily_of_the_valley",
      "wither_rose",
      "red_tulip",
      "orange_tulip",
      "white_tulip",
      "pink_tulip",
      "sugar_cane",
      "vine",
      "glow_lichen",
      "pink_petals",
    ]);
    const worlds = existsSync(WORLDS_DIR)
      ? readdirSync(WORLDS_DIR).filter((name) =>
          existsSync(path.join(WORLDS_DIR, name, "manifest.json")),
        )
      : [];
    for (const world of worlds) {
      const manifest = JSON.parse(
        readFileSync(path.join(WORLDS_DIR, world, "manifest.json"), "utf8"),
      );
      const rows = [];
      manifest.palette.forEach((name, index) => {
        const plant = PLANT.has(name) || name.endsWith("_sapling");
        const shape = shapeOf(name, manifest.solid?.[index] === true);
        if (!plant && shape.render === "box") return;
        const faces = resolveFaces(textureOf(name));
        rows.push(`${name} → ${shape.render} / ${faces?.[0] ?? "flat colour"}`);
        expect(shape.render, `${world}: ${name}`).not.toBe("box");
        expect(collisionHeight(name, shape), `${world}: ${name}`).toBe(0);
      });
      console.log(`[plants] ${world}: ${rows.length}\n  ${rows.join("\n  ")}`);
    }
  });

  it("draws a waterlogged plant in the opaque pass, inside the water's own", () => {
    const built = meshSection(samplerOf([[0, 0, 0, 5], [0, 0, 1, 5], [0, 0, 0, 6]]), palette, 0, 0, 0);
    // The seagrass replaced the water in its cell; what matters is that a
    // cutout plant never lands in the translucent buffer, where it would be
    // sorted against the sea it stands in.
    expect(built.opaque.quads).toBe(4);
    expect(built.transparent.quads).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* the player                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The controller, run headless.
 *
 * A world here is a set of solid block coordinates and a set of fluid ones, and
 * a "walk" is a few hundred ticks at a fixed 60 Hz. That is enough to catch
 * every kind of bug this thing has: falling through a floor, climbing a wall
 * that should hold, sticking on a slab, and drowning on the way to a beach.
 */
describe("the player", () => {
  const TICK = 1 / 60;

  /**
   * A world of cells. `[x, y, z]` is a full cube; `[x, y, z, h]` is a block `h`
   * tall — a slab is 0.5, a carpet 0.08, a plant 0, exactly as `appearance.js`
   * hands them to the viewer.
   */
  function worldOf(solids, fluids = []) {
    const solid = new Map(solids.map((cell) => [cell.slice(0, 3).join(","), cell[3] ?? 1]));
    const fluid = new Set(fluids.map((cell) => cell.slice(0, 3).join(",")));
    return {
      solidAt: (x, y, z) => solid.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? 0,
      fluidAt: (x, y, z) => fluid.has(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`),
    };
  }

  /** A 16×16 floor at y = 0, its top surface at y = 1. */
  function floor(y = 0, size = 16, block = undefined) {
    const cells = [];
    for (let x = -size; x < size; x++) {
      for (let z = -size; z < size; z++) cells.push([x, y, z]);
    }
    return block === undefined ? cells : cells.concat(block);
  }

  function standing(x = 0.5, z = 0.5, y = 1) {
    const player = newPlayer();
    player.frozen = false;
    player.position.x = x;
    player.position.y = y;
    player.position.z = z;
    player.onGround = true;
    return player;
  }

  const NOTHING = { forward: 0, strafe: 0, jump: false, sink: false, sprint: false, sneak: false };
  const input = (extra) => ({ ...NOTHING, ...extra });

  function run(player, world, ticks, keys = NOTHING, each) {
    for (let i = 0; i < ticks; i++) {
      step(player, typeof keys === "function" ? keys(i) : keys, world, TICK);
      each?.(player, i);
    }
    return player;
  }

  it("holds a frozen player exactly where he is, gravity and all", () => {
    const player = standing();
    player.frozen = true;
    player.position.y = 30;
    run(player, worldOf(floor()), 120, input({ forward: 1 }));
    expect(player.position.y).toBe(30);
    expect(player.position.x).toBe(0.5);
  });

  it("falls onto the floor and stops flush on top of it", () => {
    const player = standing(0.5, 0.5, 12);
    player.onGround = false;
    run(player, worldOf(floor()), 120);
    expect(player.position.y).toBeCloseTo(1, 2);
    expect(player.onGround).toBe(true);
    expect(player.velocity.y).toBe(0);
  });

  it("walks at the speed on the tin, and sprints faster", () => {
    const world = worldOf(floor());
    const walker = run(standing(), world, 180, input({ forward: 1 }));
    const sprinter = run(standing(), world, 180, input({ forward: 1, sprint: true }));
    // Facing yaw 0 is −z, and one second of the run is the tail of three.
    const walked = -walker.position.z - 0.5;
    const sprinted = -sprinter.position.z - 0.5;
    expect(walked / 3).toBeGreaterThan(PLAYER.walkSpeed * 0.9);
    expect(walked / 3).toBeLessThan(PLAYER.walkSpeed * 1.02);
    expect(sprinted).toBeGreaterThan(walked * 1.2);
    // …and sneaking is slower than either.
    const sneaker = run(standing(), world, 180, input({ forward: 1, sneak: true }));
    expect(-sneaker.position.z - 0.5).toBeLessThan(walked * 0.6);
  });

  it("stops within a few frames of the key coming up", () => {
    const world = worldOf(floor());
    const player = run(standing(), world, 60, input({ forward: 1 }));
    const moving = Math.abs(player.velocity.z);
    expect(moving).toBeGreaterThan(4);
    run(player, world, 12);
    expect(Math.abs(player.velocity.z)).toBeLessThan(moving * 0.15);
  });

  it("jumps about a block and a quarter, and no higher", () => {
    const world = worldOf(floor());
    const player = standing();
    let peak = player.position.y;
    run(player, world, 90, (tick) => input({ jump: tick < 3 }), (state) => {
      peak = Math.max(peak, state.position.y);
    });
    expect(peak - 1).toBeGreaterThan(1.15);
    expect(peak - 1).toBeLessThan(1.4);
    expect(player.position.y).toBeCloseTo(1, 2);
  });

  it("steps up a slab, and needs a jump for a whole block", () => {
    // Facing −x: a pavement of slabs from x = −7 to −3, and a wall of whole
    // blocks at x = −8.
    const cells = [];
    for (let z = -3; z <= 3; z++) {
      for (let x = -7; x <= -3; x++) cells.push([x, 1, z, 0.5]);
      cells.push([-8, 1, z], [-8, 2, z]);
    }
    const world = worldOf(floor().concat(cells));

    const walker = standing();
    walker.yaw = Math.PI / 2; // −x
    run(walker, world, 180, input({ forward: 1 }));
    // Up onto the slabs without a jump, across them, and stopped by the wall.
    expect(walker.position.y).toBeCloseTo(1.5, 2);
    expect(walker.position.x).toBeCloseTo(-7 + PLAYER.width / 2, 1);
  });

  it("clears a whole block with a jump and never without one", () => {
    const wall = [];
    for (let z = -3; z <= 3; z++) wall.push([-3, 1, z]);
    const world = worldOf(floor().concat(wall));

    const walker = standing();
    walker.yaw = Math.PI / 2;
    run(walker, world, 120, input({ forward: 1 }));
    expect(walker.position.x).toBeCloseTo(-2 + PLAYER.width / 2, 1);
    expect(walker.position.y).toBeCloseTo(1, 2);

    const jumper = standing();
    jumper.yaw = Math.PI / 2;
    run(jumper, world, 180, (tick) => input({ forward: 1, jump: tick % 30 === 0 }));
    expect(jumper.position.x).toBeLessThan(-3.5);
  });

  it("refuses to step up anything taller than 0.6", () => {
    const ledges = [];
    for (let z = -3; z <= 3; z++) ledges.push([-3, 1, z, 0.7]);
    const world = worldOf(floor().concat(ledges));
    const walker = standing();
    walker.yaw = Math.PI / 2;
    run(walker, world, 120, input({ forward: 1 }));
    expect(walker.position.y).toBeCloseTo(1, 2);
    expect(walker.position.x).toBeCloseTo(-2 + PLAYER.width / 2, 1);
  });

  it("walks up a flight of half-block steps without ever leaving the ground", () => {
    // Column tops at 1.5, 2.0, 2.5 … one step of 0.5 per block travelled.
    const cells = [];
    for (let z = -3; z <= 3; z++) {
      for (let s = 1; s <= 8; s++) {
        const top = 1 + s * 0.5;
        const x = -2 - s;
        for (let y = 1; y + 1 <= top; y++) cells.push([x, y, z]);
        if (top % 1 !== 0) cells.push([x, Math.floor(top), z, 0.5]);
      }
    }
    const world = worldOf(floor().concat(cells));
    const walker = standing();
    walker.yaw = Math.PI / 2;
    let airborne = 0;
    run(walker, world, 150, input({ forward: 1 }), (state) => {
      if (!state.onGround) airborne++;
    });
    expect(walker.position.y).toBeGreaterThan(4.5);
    // Eight half-steps climbed, and not one frame of it in the air.
    expect(airborne).toBe(0);
  });

  it("walks up a staircase of cubes, because the world calls them climbable", () => {
    // Stairs are drawn as full cubes, so they are a full block tall; the world
    // flags them, and the controller gives a flagged block a step of its own.
    const stairs = [];
    for (let z = -3; z <= 3; z++) {
      for (let s = 1; s <= 5; s++) {
        for (let y = 1; y <= s; y++) stairs.push([-2 - s, y, z]);
      }
    }
    const flagged = new Set(stairs.map((cell) => cell.slice(0, 3).join(",")));
    const base = worldOf(floor().concat(stairs));
    const world = {
      ...base,
      climbAt: (x, y, z) => flagged.has(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`),
    };

    const walker = standing();
    walker.yaw = Math.PI / 2;
    run(walker, world, 100, input({ forward: 1 }));
    expect(walker.position.y).toBeGreaterThan(5);
    expect(walker.onGround).toBe(true);

    // Without the flag the same cubes are a wall, exactly as a cliff should be.
    const blocked = standing();
    blocked.yaw = Math.PI / 2;
    run(blocked, base, 100, input({ forward: 1 }));
    expect(blocked.position.y).toBeCloseTo(1, 2);
  });

  it("takes its collision box from the palette, plants and water included", () => {
    const resolved = resolvePalette(
      ["air", "stone", "oak_slab", "short_grass", "water", "oak_stairs", "glass"],
      [false, true, false, false, false, true, false],
    );
    expect(resolved[0].collide).toBe(0);
    expect(resolved[1].collide).toBe(1);
    expect(resolved[2].collide).toBe(0.5);
    expect(resolved[3].collide).toBe(0); // a plant is not in the way
    expect(resolved[4].collide).toBe(0); // and neither is water
    expect(resolved[5].collide).toBe(1);
    expect(resolved[5].climb).toBe(true);
    expect(resolved[6].collide).toBe(1); // glass is see-through, not walk-through
    expect(resolved[1].climb).toBe(false);
  });

  it("never walks through a wall, however fast it is hit", () => {
    const wall = [];
    for (let y = 1; y <= 3; y++) wall.push([-4, y, 0], [-4, y, -1], [-4, y, 1]);
    const world = worldOf(floor().concat(wall));
    const player = run(standing(), world, 300, input({ strafe: -1, sprint: true }));
    expect(player.position.x).toBeGreaterThan(-3.5 + PLAYER.width / 2 - 0.01);
    expect(player.velocity.x).toBe(0);
  });

  it("does not tunnel through a thin floor at terminal velocity", () => {
    const player = standing(0.5, 0.5, 400);
    player.onGround = false;
    run(player, worldOf(floor()), 60 * 20);
    expect(player.position.y).toBeCloseTo(1, 2);
  });

  it("bumps its head instead of standing inside the ceiling", () => {
    const world = worldOf(floor().concat([[0, 3, 0]]));
    const player = standing();
    run(player, world, 90, (tick) => input({ jump: tick < 3 }));
    expect(player.position.y).toBeLessThan(3 - PLAYER.height + 0.01);
    expect(player.position.y).toBeCloseTo(1, 2);
  });

  it("floats in water rather than sinking like a stone, and rises on the key", () => {
    const fluids = [];
    for (let y = 1; y <= 6; y++) {
      for (let x = -4; x <= 4; x++) {
        for (let z = -4; z <= 4; z++) fluids.push([x, y, z]);
      }
    }
    const world = worldOf(floor(), fluids);
    const sinking = standing(0.5, 0.5, 5);
    sinking.onGround = false;
    run(sinking, world, 60);
    expect(sinking.inWater).toBe(true);
    // A second of sinking, not a second of falling.
    expect(5 - sinking.position.y).toBeLessThan(PLAYER.swimSink * 1.2);

    const rising = standing(0.5, 0.5, 3);
    rising.onGround = false;
    run(rising, world, 60, input({ jump: true }));
    expect(rising.position.y).toBeGreaterThan(3.5);
  });

  it("walks out of the water and onto the beach", () => {
    // A sea at x < 0 six blocks deep, and a beach at x >= 0 whose surface is
    // the same height as the sea's.
    const solids = [];
    const fluids = [];
    for (let x = -8; x < 24; x++) {
      for (let z = -8; z < 8; z++) {
        solids.push([x, 0, z]);
        if (x >= 2) {
          solids.push([x, 1, z]);
        } else {
          fluids.push([x, 1, z]);
        }
      }
    }
    const world = worldOf(solids, fluids);
    const swimmer = standing(-2.5, 0.5, 1);
    swimmer.onGround = false;
    swimmer.yaw = -Math.PI / 2; // facing +x
    // Holding the swim key only while wet: out of the water it would be a hop,
    // and this test is about arriving, not about bouncing.
    run(swimmer, world, 60 * 4, () => input({ forward: 1, jump: swimmer.inWater }));
    expect(swimmer.position.x).toBeGreaterThan(2);
    expect(swimmer.position.y).toBeCloseTo(2, 1);
    expect(swimmer.inWater).toBe(false);
  });

  it("stands on the ground at spawn, whether the spawn is buried or floating", () => {
    const world = worldOf(floor().concat(floor(1)));
    // Above it: snapped down onto the surface.
    expect(groundSnap(world.solidAt, 0.5, 40, 0.5)).toBeCloseTo(2, 2);
    // Inside it: pushed up, not left in the rock.
    expect(groundSnap(world.solidAt, 0.5, 0, 0.5)).toBeCloseTo(2, 2);
    // …and standing there is standing, not falling.
    const player = standing(0.5, 0.5, groundSnap(world.solidAt, 0.5, 40, 0.5));
    run(player, world, 60);
    expect(player.position.y).toBeCloseTo(2, 2);
    expect(player.onGround).toBe(true);
  });

  it("walks straight through a meadow, because a plant is not a box", () => {
    const palette = resolvePalette(["air", "stone", "short_grass"], [false, true, false]);
    const plants = new Set();
    for (let x = -8; x < 8; x++) plants.add(`${x},1,0`);
    const solid = new Set(floor().map((cell) => cell.join(",")));
    const world = {
      solidAt: (x, y, z) => {
        const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        if (plants.has(key)) return palette[2].occludes; // false, and that is the point
        return solid.has(key);
      },
      fluidAt: () => false,
    };
    const player = standing(0.5, 0.5);
    player.yaw = Math.PI / 2; // facing −x
    run(player, world, 120, input({ forward: 1 }));
    expect(player.position.x).toBeLessThan(-4);
    expect(player.position.y).toBeCloseTo(1, 2);
  });

  it("flies free of the world, and lands walking when the mode comes off", () => {
    const world = worldOf(floor().concat(floor(1), floor(2)));
    const player = standing(0.5, 0.5, 3);
    player.fly = true;
    run(player, world, 60, input({ sink: true }));
    expect(player.position.y).toBeLessThan(0); // straight through the rock
    player.fly = false;
    player.position.y = 8;
    run(player, world, 180);
    expect(player.position.y).toBeCloseTo(3, 2);
    expect(player.onGround).toBe(true);
  });

  /**
   * The one test that touches a real export: spawn, snap, and stand.
   *
   * Every other test here builds its world by hand, which proves the rules and
   * proves nothing about the worlds Kai actually walks. This one takes the
   * manifest's spawn, decodes the chunks around it exactly as the worker does,
   * and checks that the player ends the first second of the demo standing on
   * the ground rather than falling through it or buried in it.
   */
  it("stands on the ground at the spawn of every world on disk", () => {
    const worlds = existsSync(WORLDS_DIR)
      ? readdirSync(WORLDS_DIR).filter((name) =>
          existsSync(path.join(WORLDS_DIR, name, "manifest.json")),
        )
      : [];
    expect(worlds.length).toBeGreaterThan(0);
    for (const name of worlds) {
      const dir = path.join(WORLDS_DIR, name);
      const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
      const palette = resolvePalette(manifest.palette, manifest.solid);
      const view = new WorldView(manifest);
      const [sx, , sz] = manifest.spawn;
      const cx = Math.floor(sx / CHUNK_WIDTH);
      const cz = Math.floor(sz / CHUNK_WIDTH);
      for (const entry of manifest.chunks) {
        if (Math.abs(entry.x - cx) > 1 || Math.abs(entry.z - cz) > 1) continue;
        view.put(decodeChunk(gunzipSync(readFileSync(path.join(dir, entry.file)))));
      }
      const world = {
        solidAt: (x, y, z) => palette[view.indexAt(x, y, z)]?.collide ?? 0,
        fluidAt: (x, y, z) => {
          const block = palette[view.indexAt(x, y, z)];
          return block !== undefined && (block.name === "water" || block.name === "lava");
        },
        climbAt: (x, y, z) => palette[view.indexAt(x, y, z)]?.climb === true,
      };

      const player = newPlayer();
      player.frozen = false;
      player.position.x = sx + 0.5;
      player.position.z = sz + 0.5;
      player.position.y = groundSnap(world.solidAt, sx + 0.5, manifest.spawn[1] + 2, sz + 0.5);
      const landed = player.position.y;
      run(player, world, 60);
      expect(player.position.y, name).toBeCloseTo(landed, 2);
      expect(player.onGround || player.inWater, name).toBe(true);
      // Standing on it, not in it: the feet are clear of solid rock.
      expect(boxCollides(world.solidAt, player.position.x, player.position.y, player.position.z), name)
        .toBe(false);
      console.log(`[spawn] ${name}: feet at y=${landed.toFixed(3)} (manifest ${manifest.spawn[1]})`);
    }
  });

  it("puts the eye 1.62 above the feet and the box 0.6 wide", () => {
    const player = standing(4.5, 2.5, 7);
    expect(eyePosition(player)).toMatchObject({ x: 4.5, y: 7 + PLAYER.eye, z: 2.5 });
    expect(PLAYER.width).toBe(0.6);
    expect(PLAYER.height).toBe(1.8);
    expect(PLAYER.eye).toBeCloseTo(1.62, 6);
    expect(boxCollides(() => true, 0, 0, 0)).toBe(true);
    expect(boxCollides(() => false, 0, 0, 0)).toBe(false);
  });
});

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

/* -------------------------------------------------------------------------- */
/* the shader pack                                                             */
/* -------------------------------------------------------------------------- */

describe("the sun", () => {
  it("points at a low warm angle and stays a unit vector", () => {
    const sun = sunDirection();
    expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 12);
    // 11.5° above the horizon: low enough to rake, high enough to light.
    expect(sun.y).toBeCloseTo(Math.sin((SUN_ELEVATION * Math.PI) / 180), 12);
    expect(sun.y).toBeGreaterThan(0);
    expect(sun.y).toBeLessThan(0.3);
  });

  it("turns azimuth the way the viewer turns yaw: 0 is −Z, 90 is +X", () => {
    const north = sunDirection(0, 0);
    expect(north.z).toBeCloseTo(-1, 12);
    expect(north.x).toBeCloseTo(0, 12);
    const east = sunDirection(90, 0);
    expect(east.x).toBeCloseTo(1, 12);
    expect(east.z).toBeCloseTo(0, 12);
  });

  it("gives every world a stable bearing inside the spread", () => {
    const names = ["unicorn_pirate_isles", "isles_of_war", "", "a"];
    for (const name of names) {
      const azimuth = worldAzimuth(name);
      expect(worldAzimuth(name)).toBe(azimuth);
      expect(Math.abs(azimuth - SUN_AZIMUTH)).toBeLessThanOrEqual(AZIMUTH_SPREAD);
    }
    expect(worldAzimuth("isles_of_war")).not.toBe(worldAzimuth("unicorn_pirate_isles"));
  });

  it("maps a direction onto the sky texture the way three's own sampler does", () => {
    // Straight up is the top row, straight down the bottom, whatever the
    // bearing. Getting this flipped puts the painted sun where the god rays
    // are not.
    expect(equirectUv({ x: 0, y: 1, z: 0 })[1]).toBeCloseTo(1, 12);
    expect(equirectUv({ x: 0, y: -1, z: 0 })[1]).toBeCloseTo(0, 12);
    expect(equirectUv({ x: 1, y: 0, z: 0 })[0]).toBeCloseTo(0.5, 12);
    const [u] = equirectUv(sunDirection(SUN_AZIMUTH));
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThanOrEqual(1);
  });
});

describe("the cloud field", () => {
  it("is the same field every time it is generated", () => {
    const a = cloudField({ size: 32 });
    const b = cloudField({ size: 32 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(a.data.length).toBe(32 * 32);
  });

  it("tiles: the far edge continues into the near one", () => {
    // A seam would be a hard line of shade running across the world, so the
    // wrap is checked as a *continuity*, not as an equality: u=1 is u=0.
    for (const v of [0, 0.25, 0.5, 0.75]) {
      expect(cloudNoise(0.999, v)).toBeCloseTo(cloudNoise(-0.001, v), 6);
      expect(cloudNoise(v, 0.999)).toBeCloseTo(cloudNoise(v, -0.001), 6);
      expect(cloudNoise(0, v)).toBeCloseTo(cloudNoise(1, v), 12);
    }
  });

  it("stays inside the byte it is stored as, and is not flat", () => {
    const { data } = cloudField({ size: 64 });
    let min = 255;
    let max = 0;
    for (const value of data) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(255);
    expect(max - min).toBeGreaterThan(80); // there are actually clouds in it
  });
});

describe("the quality switch", () => {
  it("cycles ultra → high → off → ultra", () => {
    expect(nextQuality("ultra")).toBe("high");
    expect(nextQuality("high")).toBe("off");
    expect(nextQuality("off")).toBe("ultra");
    expect(nextQuality("nonsense")).toBe(QUALITY_MODES[0]);
  });

  it("lets the query beat the stored choice, and never stores the query", () => {
    expect(resolveQuality({ query: "off", stored: "ultra" })).toEqual({ mode: "off" });
    expect(resolveQuality({ query: "OFF " }).mode).toBe("off");
    expect(resolveQuality({ query: "nonsense", stored: "high" }).mode).toBe("high");
    expect(resolveQuality({}).mode).toBe("ultra");
    expect(resolveQuality({ coarse: true }).mode).toBe("high");
  });

  it("turns everything off in off, and nothing halfway", () => {
    const off = qualitySettings("off");
    expect(off.post).toBe(false);
    expect(off.shadowMap).toBe(0);
    expect(off.rays).toBe(0);
    expect(off.bloom).toBe(0);
    expect(off.preset).toBe("day");
    for (const flag of [off.water, off.wind, off.grade, off.cloudShadows, off.softShadows]) {
      expect(flag).toBe(false);
    }
  });

  it("makes high cheaper than ultra on every axis that costs anything", () => {
    const high = qualitySettings("high");
    const ultra = qualitySettings("ultra");
    expect(high.shadowMap).toBeLessThan(ultra.shadowMap);
    expect(high.rays).toBeLessThan(ultra.rays);
    expect(high.shadowRadius).toBeLessThan(ultra.shadowRadius);
    expect(high.softShadows).toBe(false);
    expect(high.cloudShadows).toBe(false);
    expect(high.preset).toBe("golden");
  });
});

describe("the sun's camera", () => {
  const sun = sunDirection();
  const fit = (center, mapSize = 2048) =>
    fitSunCamera({ center, radius: 150, sun, mapSize });

  it("stands behind the world along the light and looks down it", () => {
    const camera = fit({ x: 0, y: 64, z: 0 });
    const toTarget = {
      x: camera.target.x - camera.eye.x,
      y: camera.target.y - camera.eye.y,
      z: camera.target.z - camera.eye.z,
    };
    const length = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
    // The camera looks the way the light travels: the opposite of "at the sun".
    expect(toTarget.x / length).toBeCloseTo(-sun.x, 6);
    expect(toTarget.y / length).toBeCloseTo(-sun.y, 6);
    expect(toTarget.z / length).toBeCloseTo(-sun.z, 6);
    expect(camera.far).toBeGreaterThan(camera.near + 300);
    expect(camera.halfExtent).toBe(150);
  });

  it("snaps to its own texel grid, so shadow edges do not crawl", () => {
    // A step of a fraction of a texel must not move the camera at all: this is
    // the entire anti-shimmer mechanism, and it is invisible in a screenshot.
    const still = fit({ x: 100, y: 70, z: -40 });
    const nudged = fit({ x: 100.001, y: 70, z: -40.002 });
    expect(nudged.eye.x).toBeCloseTo(still.eye.x, 9);
    expect(nudged.eye.y).toBeCloseTo(still.eye.y, 9);
    expect(nudged.eye.z).toBeCloseTo(still.eye.z, 9);

    // …and a step of many texels does move it, or the cascade would not follow.
    const walked = fit({ x: 140, y: 70, z: -40 });
    expect(Math.hypot(walked.eye.x - still.eye.x, walked.eye.z - still.eye.z)).toBeGreaterThan(1);
  });

  it("has a finer texel on the bigger map", () => {
    expect(fit({ x: 0, y: 0, z: 0 }, 2048).texel).toBeLessThan(fit({ x: 0, y: 0, z: 0 }, 1024).texel);
    expect(fit({ x: 0, y: 0, z: 0 }, 2048).texel).toBeCloseTo(300 / 2048, 12);
  });

  it("builds an orthonormal frame whichever way the sun points", () => {
    for (const direction of [sunDirection(0, 5), sunDirection(200, 60), { x: 0, y: 1, z: 0 }]) {
      const { right, up, forward } = sunBasis(direction);
      for (const axis of [right, up, forward]) {
        expect(Math.hypot(axis.x, axis.y, axis.z)).toBeCloseTo(1, 9);
      }
      expect(right.x * up.x + right.y * up.y + right.z * up.z).toBeCloseTo(0, 9);
      expect(right.x * forward.x + right.y * forward.y + right.z * forward.z).toBeCloseTo(0, 9);
    }
  });
});

describe("wind and water", () => {
  it("keeps the swell inside the gap water leaves under its own surface", () => {
    // `appearance.js` stops a water block at 0.9, and the surface must not
    // punch through the block above it.
    for (let i = 0; i < 400; i++) {
      const x = (i % 20) * 3.7 - 30;
      const z = Math.floor(i / 20) * 2.3 - 20;
      for (const t of [0, 1.7, 33.3, 900.5]) {
        expect(Math.abs(waterHeight(x, z, t))).toBeLessThanOrEqual(WATER_AMPLITUDE);
      }
    }
  });

  it("moves the water at all, and differently in different places", () => {
    expect(waterHeight(0, 0, 0)).not.toBe(waterHeight(0, 0, 1.3));
    expect(waterHeight(0, 0, 4)).not.toBe(waterHeight(9, 0, 4));
  });

  it("sways continuously in space, so a merged quad cannot tear", () => {
    const t = 12.5;
    const [ax, az] = plantSway(10, 10, t);
    const [bx, bz] = plantSway(10.0001, 10, t);
    expect(bx).toBeCloseTo(ax, 4);
    expect(bz).toBeCloseTo(az, 4);
    // …and bounded, or a meadow walks away from its own roots.
    for (let i = 0; i < 200; i++) {
      const [dx, dz] = plantSway(i * 1.3, i * 0.7, i * 0.11);
      expect(Math.abs(dx)).toBeLessThan(0.3);
      expect(Math.abs(dz)).toBeLessThan(0.2);
    }
  });
});

describe("the shaders", () => {
  const sources = {
    "block vertex": BLOCK_VERTEX,
    "block fragment": BLOCK_FRAGMENT,
    "depth vertex": DEPTH_VERTEX,
    "depth fragment": DEPTH_FRAGMENT,
    "god rays": GOD_RAYS_SHADER.fragmentShader,
    "grade": GRADE_SHADER.fragmentShader,
  };

  it("declares no uniform the page does not supply", () => {
    // The one check a node test can make about GLSL: a name that exists in the
    // shader and not in `blockUniforms` is a uniform nobody ever sets.
    const supplied = new Set(Object.keys(blockUniforms()));
    for (const source of [BLOCK_VERTEX, BLOCK_FRAGMENT, DEPTH_VERTEX, DEPTH_FRAGMENT]) {
      for (const name of declaredUniforms(source)) expect(supplied).toContain(name);
    }
    for (const [name, shader] of [
      ["god rays", GOD_RAYS_SHADER],
      ["grade", GRADE_SHADER],
    ]) {
      const declared = declaredUniforms(shader.fragmentShader);
      for (const uniform of declared) expect(Object.keys(shader.uniforms), name).toContain(uniform);
    }
  });

  it("balances its braces and parentheses", () => {
    for (const [name, source] of Object.entries(sources)) {
      const count = (character) => source.split(character).length - 1;
      expect(count("{"), name).toBe(count("}"));
      expect(count("("), name).toBe(count(")"));
    }
  });

  it("never shadows a built-in it also calls", () => {
    // `vec2 step = …` next to `step(edge, x)` compiles nowhere. Found by
    // reading, kept by testing.
    for (const [name, source] of Object.entries(sources)) {
      for (const builtin of [
        "step",
        "mix",
        "length",
        "texture",
        "cross",
        "reflect",
        "clamp",
        "distance",
        "smoothstep",
      ]) {
        expect(source, `${name} declares a variable named ${builtin}`).not.toMatch(
          new RegExp(`(float|vec2|vec3|vec4|int)\\s+${builtin}\\s*[=;]`),
        );
      }
    }
  });

  it("compiles the original program when the switch is off", () => {
    const off = blockDefines(qualitySettings("off"), { cutout: true });
    expect(Object.keys(off)).toEqual(["CUTOUT"]);
    expect(blockDefines(qualitySettings("off"), {})).toEqual({});
    expect(depthDefines(qualitySettings("off"))).toEqual({});
  });

  it("gates every effect behind its own define", () => {
    const ultra = blockDefines(qualitySettings("ultra"), { cutout: true });
    for (const define of ["CUTOUT", "LIT", "LINEAR_OUTPUT", "SHADOWS", "SOFT_SHADOWS", "CLOUD_SHADOWS", "WIND", "WATER_FX"]) {
      expect(Object.keys(ultra)).toContain(define);
    }
    const high = blockDefines(qualitySettings("high"), { cutout: true });
    expect(Object.keys(high)).toContain("SHADOWS");
    expect(Object.keys(high)).not.toContain("SOFT_SHADOWS");
    expect(Object.keys(high)).not.toContain("CLOUD_SHADOWS");
  });

  it("keeps the GLSL animation spelling the same constants as its JS twin", () => {
    // `wave.js` is what the tests can run; `ANIM_GLSL` is what the GPU runs.
    // They are only worth anything as a pair.
    for (const constant of ["0.045", "0.030", "0.73", "0.28", "0.19", "0.35", "1.7", "3.1"]) {
      expect(ANIM_GLSL).toContain(constant);
    }
    expect(GOD_RAYS_SHADER.defines.RAY_SAMPLES).toBeGreaterThan(0);
  });

  it("writes sRGB exactly once, at the end of whichever path is running", () => {
    // Graded frames go through the composer in linear light and are encoded by
    // the grade pass; an off frame is encoded by three's own include. Doing
    // both would gamma the world twice.
    expect(BLOCK_FRAGMENT).toContain("#ifndef LINEAR_OUTPUT");
    expect(BLOCK_FRAGMENT).toContain("#include <colorspace_fragment>");
    expect(GRADE_SHADER.fragmentShader).toContain("linearToSrgb");
  });
});

describe("material classes", () => {
  const names = ["air", "stone", "water", "short_grass", "oak_leaves", "glowstone"];
  const palette = resolvePalette(names, [false, true, false, false, true, true]);
  const entryOf = (name) => palette[names.indexOf(name)];

  it("gives every kind of surface its own bit", () => {
    expect(blockFlags(entryOf("stone"))).toBe(0);
    expect(blockFlags(entryOf("water"))).toBe(FLAG_WATER);
    expect(blockFlags(entryOf("short_grass"))).toBe(FLAG_CROSS);
    expect(blockFlags(entryOf("oak_leaves"))).toBe(FLAG_FOLIAGE);
    expect(blockFlags(entryOf("glowstone"))).toBe(FLAG_EMISSIVE);
    expect(blockFlags(undefined)).toBe(0);
  });

  it("calls leaves foliage and calls nothing structural foliage", () => {
    for (const name of ["oak_leaves", "spruce_leaves", "azalea_leaves", "cherry_leaves"]) {
      expect(isFoliage(name), name).toBe(true);
    }
    for (const name of ["oak_planks", "stone", "grass_block", "oak_log", "short_grass"]) {
      expect(isFoliage(name), name).toBe(false);
    }
  });

  it("puts one flag on every vertex the mesher emits", () => {
    const sampler = (x, y, z) =>
      x === 0 && y === 0 && z === 0 ? 1 : x === 2 && y === 0 && z === 0 ? 2 : x === 4 && y === 0 && z === 0 ? 3 : 0;
    const built = meshSection(sampler, palette, 0, 0, 0);
    for (const part of [built.opaque, built.transparent]) {
      expect(part.flags.length).toBe(part.position.length / 3);
    }
    // The stone cube is unflagged, the grass carries the cross bit, and the
    // water — which is the whole translucent buffer here — carries water's.
    expect(new Set(built.transparent.flags)).toEqual(new Set([FLAG_WATER]));
    expect(new Set(built.opaque.flags)).toEqual(new Set([0, FLAG_CROSS]));
  });
});
