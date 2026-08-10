import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "@terrainist/compiler";
import { describe, expect, it } from "vitest";

import { biomeNamesById } from "../src/biome-registry.js";
import {
  BIOME_TINTS,
  DEFAULT_TINT,
  applyBiomeTint,
  biomeTint,
  tintKindOf,
} from "../src/biome-tint.js";
import { blockColor } from "../src/block-colors.js";
import { VoxelGrid } from "../src/voxel/grid.js";
import { renderTopDown as renderVoxelTopDown } from "../src/voxel/orthographic.js";

describe("tintKindOf", () => {
  it("classifies the colormap blocks", () => {
    expect(tintKindOf("minecraft:grass_block")).toBe("grass");
    expect(tintKindOf("short_grass")).toBe("grass");
    expect(tintKindOf("minecraft:oak_leaves[persistent=true]")).toBe("foliage");
    expect(tintKindOf("minecraft:vine")).toBe("foliage");
    expect(tintKindOf("minecraft:water")).toBe("water");
  });

  it("leaves fixed-colour blocks alone", () => {
    for (const leaf of ["birch_leaves", "spruce_leaves", "cherry_leaves", "pale_oak_leaves"]) {
      expect(tintKindOf(`minecraft:${leaf}`), leaf).toBeUndefined();
    }
    expect(tintKindOf("minecraft:stone")).toBeUndefined();
    expect(tintKindOf("minecraft:oak_planks")).toBeUndefined();
  });
});

describe("biomeTint", () => {
  it("falls back to the temperate default for unknown biomes", () => {
    expect(biomeTint(undefined)).toEqual(DEFAULT_TINT);
    expect(biomeTint("minecraft:not_a_biome")).toEqual(DEFAULT_TINT);
  });

  it("accepts namespaced and bare names alike", () => {
    expect(biomeTint("minecraft:swamp")).toBe(biomeTint("swamp"));
    expect(biomeTint("swamp").water).toBe(0x617b64);
  });

  it("covers every overworld biome in the pinned registry", () => {
    const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
    for (const name of biomeNamesById(EMIT_MINECRAFT_VERSION).values()) {
      expect(mc.hasBiome(name), name).toBe(true);
    }
    // Not a coverage assertion on end/void biomes, which have no colormap; the
    // ones the compiler can actually paint must all be present.
    for (const name of ["plains", "forest", "taiga", "swamp", "desert", "snowy_plains", "river"]) {
      expect(BIOME_TINTS[name], name).toBeDefined();
    }
  });
});

describe("applyBiomeTint", () => {
  it("is the identity for untinted blocks", () => {
    const stone = blockColor("minecraft:stone");
    expect(applyBiomeTint(stone, "minecraft:stone", "minecraft:swamp")).toEqual(stone);
  });

  it("is the identity in the reference biome family", () => {
    const grass = blockColor("minecraft:grass_block");
    expect(applyBiomeTint(grass, "minecraft:grass_block", "minecraft:lush_caves")).toEqual(grass);
  });

  it("shifts grass towards the biome tint", () => {
    const grass = blockColor("minecraft:grass_block");
    const swamp = applyBiomeTint(grass, "minecraft:grass_block", "minecraft:swamp");
    const desert = applyBiomeTint(grass, "minecraft:grass_block", "minecraft:desert");
    expect(swamp).not.toEqual(grass);
    expect(desert).not.toEqual(grass);
    expect(swamp).not.toEqual(desert);
    // Swamp is the murky end, savanna/desert the yellow one.
    expect(swamp[1] / (swamp[2] || 1)).toBeLessThan(desert[1] / (desert[2] || 1));
  });

  it("gives frozen water a colder blue than warm water", () => {
    const water = blockColor("minecraft:water");
    const frozen = applyBiomeTint(water, "minecraft:water", "minecraft:frozen_ocean");
    const warm = applyBiomeTint(water, "minecraft:water", "minecraft:warm_ocean");
    expect(frozen[2] - frozen[1]).toBeGreaterThan(warm[2] - warm[1]);
  });

  it("is deterministic", () => {
    const grass = blockColor("minecraft:grass_block");
    expect(applyBiomeTint(grass, "minecraft:grass_block", "minecraft:jungle")).toEqual(
      applyBiomeTint(grass, "minecraft:grass_block", "minecraft:jungle"),
    );
  });
});

describe("biomeNamesById", () => {
  it("round-trips against the emit registry", () => {
    const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const names = biomeNamesById(EMIT_MINECRAFT_VERSION);
    expect(names.size).toBeGreaterThan(40);
    for (const [id, name] of names) {
      expect(mc.biomeIdByName(name), name).toBe(id);
    }
  });
});

describe("VoxelGrid biomes", () => {
  const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 7, maxY: 0, maxZ: 7 };

  function grassGrid(): VoxelGrid {
    const grid = new VoxelGrid(bounds);
    for (let z = 0; z <= 7; z++) {
      for (let x = 0; x <= 7; x++) grid.set(x, 0, z, "minecraft:grass_block");
    }
    return grid;
  }

  it("stores and reads a column biome", () => {
    const grid = grassGrid();
    expect(grid.hasBiomes).toBe(false);
    expect(grid.biomeAt(0, 0)).toBeUndefined();
    grid.setColumnBiome(3, 4, "minecraft:swamp");
    expect(grid.hasBiomes).toBe(true);
    expect(grid.biomeAt(3, 4)).toBe("minecraft:swamp");
    expect(grid.biomeAt(0, 0)).toBeUndefined();
    expect(grid.biomeAt(99, 99)).toBeUndefined();
  });

  it("makes a biome boundary visible in the voxel top-down render", () => {
    const grid = grassGrid();
    for (let z = 0; z <= 7; z++) {
      for (let x = 0; x <= 7; x++) {
        grid.setColumnBiome(x, z, x < 4 ? "minecraft:swamp" : "minecraft:desert");
      }
    }
    const canvas = renderVoxelTopDown(grid, { scale: 1 });
    const at = (x: number, z: number): number[] => {
      const offset = (z * canvas.width + x) * 4;
      return [canvas.data[offset]!, canvas.data[offset + 1]!, canvas.data[offset + 2]!];
    };
    expect(at(0, 0)).toEqual(at(3, 0));
    expect(at(4, 0)).toEqual(at(7, 0));
    expect(at(3, 0)).not.toEqual(at(4, 0));
  });
});
