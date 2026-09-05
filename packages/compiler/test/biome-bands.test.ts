/**
 * F20: the biome bands carry absolute scale, and `forested` means trees.
 *
 * Two derivation bugs shipped together and produced a world whose whole land
 * sat within 22 blocks of the sea and which came out 29% "high rock", 30%
 * "forest" and 3% plains:
 *
 * 1. the land bands keyed on span-normalized `relief` alone, which is
 *    scale-*inverting* — the flatter the world, the larger the share of
 *    columns clearing 0.6 of a short span;
 * 2. forest coverage keyed on eligibility, so a `{all:true}` node at density
 *    0.012 (scattered trees over open country) painted the whole map `forest`.
 *
 * Both are asserted here on synthetic fixtures, because the point of each fix
 * is a threshold and a hand-built column is the only way to sit exactly on it.
 */

import { describe, expect, it } from "vitest";

import { SurfaceClass, nodeSeed, type Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import {
  HIGH_ROCK_RELIEF,
  HIGH_ROCK_RISE,
  PROFILE_BIOMES,
  UPLAND_RELIEF,
  UPLAND_RISE,
  biomeForColumn,
  type BiomeInput
} from "../src/terrain/biomes.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";
import { FOREST_COVERAGE_DENSITY, scatterForests } from "../src/terrain/vegetation.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;

function column(over: Partial<BiomeInput>): BiomeInput {
  return {
    surfaceClass: SurfaceClass.SOIL,
    groundY: SEA + 10,
    relief: 1,
    seaLevel: SEA,
    temperature: 0.7,
    forested: false,
    ...over
  };
}

function region(size = 128): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, height = 70): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n).fill(height);
  const fluidTop = new Int32Array(n).fill(height);
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
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 1, lava: 2, snowLayer: 0 }
  };
}

function flatClassification(r: Region) {
  const n = r.width * r.depth;
  return {
    slopes: new Float64Array(n),
    classes: new Uint8Array(n).fill(SurfaceClass.SOIL),
    relief: new Float64Array(n),
    minHeight: 70,
    maxHeight: 70,
    snowLine: 200,
    oceanMask: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    overriddenNoFlood: 0,
    markers: []
  };
}

describe("land biome bands carry absolute scale", () => {
  /**
   * The shipped failure, reduced: a world with 20 blocks of span reads
   * `relief = 1` at its highest land, which used to be enough for bare rock 14
   * blocks above the waterline.
   */
  it("keeps a low-relief world on plains and forest", () => {
    const span = 20;
    for (let y = SEA; y <= SEA + span; y++) {
      const relief = (y - SEA) / span;
      expect(biomeForColumn(column({ groundY: y, relief }))).toBe("minecraft:plains");
      expect(biomeForColumn(column({ groundY: y, relief, forested: true }))).toBe(
        "minecraft:forest",
      );
    }
  });

  it("never labels soil as bare rock, however high it stands", () => {
    for (const y of [SEA + 40, SEA + 100, SEA + 250]) {
      expect(biomeForColumn(column({ groundY: y, relief: 1 }))).toBe("minecraft:windswept_hills");
    }
  });

  it("still reaches upland and high rock on a genuinely mountainous fixture", () => {
    // Sea level to y=250: the hill_town shape. Relief and rise both clear.
    const high = column({
      surfaceClass: SurfaceClass.CLIFF,
      groundY: SEA + 150,
      relief: 0.9
    });
    expect(biomeForColumn(high)).toBe("minecraft:stony_peaks");
    expect(
      biomeForColumn(column({ groundY: SEA + UPLAND_RISE, relief: UPLAND_RELIEF })),
    ).toBe("minecraft:windswept_hills");
  });

  it("requires both conditions at each band's edge", () => {
    // Relief clears, rise does not.
    expect(
      biomeForColumn(column({ groundY: SEA + UPLAND_RISE - 1, relief: 1 })),
    ).toBe("minecraft:plains");
    expect(
      biomeForColumn(
        column({
          surfaceClass: SurfaceClass.CLIFF,
          groundY: SEA + HIGH_ROCK_RISE - 1,
          relief: 1
        }),
      ),
    ).toBe("minecraft:windswept_hills");
    // Rise clears, relief does not.
    expect(
      biomeForColumn(
        column({
          surfaceClass: SurfaceClass.CLIFF,
          groundY: SEA + 200,
          relief: HIGH_ROCK_RELIEF - 0.01
        }),
      ),
    ).toBe("minecraft:windswept_hills");
    expect(biomeForColumn(column({ groundY: SEA + 200, relief: UPLAND_RELIEF - 0.01 }))).toBe(
      "minecraft:plains",
    );
  });

  it("leaves the derived-biome prefix of PROFILE_BIOMES where F21 pinned it", () => {
    // `ambientVote`'s tie-break walks this array in source order.
    expect(PROFILE_BIOMES.indexOf("minecraft:ocean")).toBe(0);
    expect(PROFILE_BIOMES.indexOf("minecraft:dark_forest")).toBe(15);
  });
});

describe("forest coverage means there are woods here", () => {
  it("does not paint forest for a trace-density all-region node", () => {
    const r = region();
    const p = plan(r);
    const out = scatterForests(
      [
        {
          id: "wilderness_fill",
          nodePath: "world.wilderness_fill",
          seed: nodeSeed(11n, "world.wilderness_fill"),
          params: {
            area: { all: true } as const,
            density: FOREST_COVERAGE_DENSITY / 2,
            species: [{ id: "b", shape: "oak_round" as const }]
          }
        }
      ],
      p,
      flatClassification(r),
      palette,
    );
    // The trees are still planted — this is a real, if sparse, scatter.
    expect(out.trees.length).toBeGreaterThan(0);
    expect(out.coverage.reduce<number>((a, b) => a + b, 0)).toBe(0);
  });

  it("still paints forest for a real wood", () => {
    const r = region();
    const p = plan(r);
    const out = scatterForests(
      [
        {
          id: "wood",
          nodePath: "world.wood",
          seed: nodeSeed(11n, "world.wood"),
          params: {
            area: { all: true } as const,
            density: 0.15,
            species: [{ id: "b", shape: "oak_round" as const }]
          }
        }
      ],
      p,
      flatClassification(r),
      palette,
    );
    expect(out.trees.length).toBeGreaterThan(50);
    expect(out.coverage.reduce<number>((a, b) => a + b, 0)).toBeGreaterThan(
      r.width * r.depth * 0.5,
    );
  });
});
