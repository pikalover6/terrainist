/**
 * The water veto: an infra entry that is not a water mover stops at the shore.
 *
 * `world.unicorn_defense_terrace` in `pirate_unicorn_war` is an `infra.entry`
 * whose ring course crossed a hilltop lake. Because the entry declares its own
 * levels (`retaining.seam`), every swept column over the water raised the
 * ground from the lakebed to the terrace's level: 208 of the lake's water
 * columns became solid stone, and the lake was cut in two. A run that meets a
 * lake should stop at its edge — with a one-column margin, so it does not
 * paddle either.
 */

import { describe, expect, it } from "vitest";

import type { Region } from "@terrainist/stdlib";

import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { nearStandingWater } from "../src/structures/infra-entry.js";

const SEA = 63;

function region(size = 32): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

/** A hilltop plan at y=100 with a small tarn (surface y=98) over `wet`. */
function plan(r: Region, wet: (x: number, z: number) => boolean): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n).fill(100);
  const fluidTop = new Int32Array(n).fill(100);
  const fluidKind = new Uint8Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const k = j * r.width + i;
      if (!wet(r.x0 + i, r.z0 + j)) continue;
      fluidKind[k] = FluidKind.WATER;
      fluidTop[k] = 98;
      ground[k] = 94;
    }
  }
  return {
    region: r,
    ground,
    fluidTop,
    fluidKind,
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
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 },
  };
}

describe("nearStandingWater", () => {
  const r = region(32);
  // A four-by-four tarn at the middle of the map.
  const lake = plan(r, (x, z) => x >= 0 && x <= 3 && z >= 0 && z <= 3);

  it("vetoes a column standing in the water", () => {
    for (let z = 0; z <= 3; z++) {
      for (let x = 0; x <= 3; x++) expect(nearStandingWater(lake, x, z)).toBe(true);
    }
  });

  it("vetoes the one-column shore margin around it", () => {
    expect(nearStandingWater(lake, -1, -1)).toBe(true);
    expect(nearStandingWater(lake, 4, 4)).toBe(true);
    expect(nearStandingWater(lake, 1, -1)).toBe(true);
  });

  it("lets a run cross dry ground two columns clear of the shore", () => {
    expect(nearStandingWater(lake, -2, -2)).toBe(false);
    expect(nearStandingWater(lake, 5, 1)).toBe(false);
    expect(nearStandingWater(lake, 12, 12)).toBe(false);
  });

  it("leaves the open sea to the entries that cross it", () => {
    // Water whose surface is *at* sea level is the ocean, and a mole meeting
    // the ocean is doing what it was asked to. Only impounded water vetoes.
    const ocean = plan(r, (x, z) => x >= 0 && x <= 3 && z >= 0 && z <= 3);
    for (let k = 0; k < ocean.fluidTop.length; k++) {
      if (ocean.fluidKind[k] !== FluidKind.NONE) ocean.fluidTop[k] = SEA;
    }
    expect(nearStandingWater(ocean, 1, 1)).toBe(false);
  });

  it("a swept course over the lake keeps only its dry columns", () => {
    // The build loop's filter, as the pass applies it: a straight run west to
    // east through the tarn keeps the two ends and drops the crossing.
    const course = Array.from({ length: 12 }, (_, i) => ({ x: i - 4, z: 2 }));
    const dry = course.filter((c) => !nearStandingWater(lake, c.x, c.z));
    expect(dry.map((c) => c.x)).toEqual([-4, -3, -2, 5, 6, 7]);
  });
});
