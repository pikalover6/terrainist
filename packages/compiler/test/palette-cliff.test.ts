/**
 * `LOAM-I525` — `ground.cliff` is a world palette, not a settlement palette.
 *
 * The forensic case: a Troy that set `ground.cliff` to its own masonry mix and
 * painted 3,701 columns of a wooded ridge sixty to a hundred blocks out in city
 * stone. The note changes no block; it counts the columns nobody meant.
 */

import { describe, expect, it } from "vitest";

import { SurfaceClass, centeredRegion, type Region } from "@terrainist/stdlib";
import type { TerrainStyle } from "@terrainist/spec/ir";

import {
  CLIFF_PALETTE_COLUMNS,
  CLIFF_PALETTE_FAR,
  cliffPaletteNote,
  isWorkedMaterial
} from "../src/terrain/palette.js";

const REGION: Region = centeredRegion(256, 256);

/** A cliff band `count` columns wide, laid along the region's far north edge. */
function classesWithCliffs(region: Region, count: number): Uint8Array {
  const classes = new Uint8Array(region.width * region.depth);
  classes.fill(SurfaceClass.SOIL);
  for (let k = 0; k < count; k++) classes[k] = SurfaceClass.CLIFF;
  return classes;
}

/** A footprint in the region's south — far from the northern cliff band. */
const SOUTH = [
  { x0: region0(), z0: REGION.z0 + REGION.depth - 20, x1: region0() + 20, z1: REGION.z0 + REGION.depth - 1 }
];
function region0(): number {
  return REGION.x0;
}

const MASONRY: TerrainStyle = {
  palettes: {
    "ground.cliff": { mix: [["minecraft:sandstone", 3], ["minecraft:terracotta", 1]] }
  }
};

describe("isWorkedMaterial", () => {
  it("knows quarried rock from a hillside", () => {
    for (const natural of [
      "minecraft:stone",
      "minecraft:deepslate",
      "minecraft:tuff",
      "minecraft:andesite",
      "minecraft:sandstone",
      "minecraft:gravel"
    ]) {
      expect(isWorkedMaterial(natural)).toBe(false);
    }
    for (const worked of [
      "minecraft:cut_sandstone",
      "minecraft:smooth_stone",
      "minecraft:chiseled_stone_bricks",
      "minecraft:polished_andesite",
      "minecraft:stone_bricks",
      "minecraft:deepslate_tiles",
      "minecraft:terracotta",
      "minecraft:white_terracotta",
      "minecraft:brick"
    ]) {
      expect(isWorkedMaterial(worked)).toBe(true);
    }
  });
});

describe("the regional cliff-palette note (LOAM-I525)", () => {
  const call = (style: TerrainStyle | undefined, cliffColumns: number) =>
    cliffPaletteNote({
      style,
      region: REGION,
      classes: classesWithCliffs(REGION, cliffColumns),
      footprints: SOUTH,
      nodePath: "world"
    });

  it("says nothing when the document left `ground.cliff` alone", () => {
    expect(call(undefined, 5_000)).toBeUndefined();
    expect(call({ palettes: {} }, 5_000)).toBeUndefined();
  });

  it("says nothing about a cliff dressed in more rock", () => {
    expect(call({ palettes: { "ground.cliff": "minecraft:deepslate" } }, 5_000)).toBeUndefined();
  });

  it("fires on a worked mix painting a distant ridge", () => {
    const d = call(MASONRY, 5_000);
    expect(d?.code).toBe("LOAM-I525");
    expect(d?.severity).toBe("note");
    expect(d?.message).toContain("minecraft:terracotta");
    expect(d?.message).toContain("5000 cliff column(s)");
    expect(d?.fix).toContain('"ground.cliff" is a world palette, not a settlement palette');
  });

  it("stays quiet when the worked cliffs are few", () => {
    expect(call(MASONRY, CLIFF_PALETTE_COLUMNS - 1)).toBeUndefined();
    expect(call(MASONRY, CLIFF_PALETTE_COLUMNS)?.code).toBe("LOAM-I525");
  });

  it("stays quiet when every painted cliff is the settlement's own", () => {
    const nearby = cliffPaletteNote({
      style: MASONRY,
      region: REGION,
      classes: classesWithCliffs(REGION, 5_000),
      // A footprint sitting on the cliff band itself: those cliffs are the
      // ones the author was dressing, and dressing them is the point.
      footprints: [
        { x0: REGION.x0, z0: REGION.z0, x1: REGION.x0 + REGION.width - 1, z1: REGION.z0 + CLIFF_PALETTE_FAR }
      ],
      nodePath: "world"
    });
    expect(nearby).toBeUndefined();
  });
});
