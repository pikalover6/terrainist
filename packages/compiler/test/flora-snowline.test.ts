/**
 * Per-species `snowLine` (FLORA-GRAMMAR-v0 §9.6).
 *
 * `snowLine` was accepted by the validator, range-checked, typed on
 * `ForestParams` and documented in the kit as "absolute Y above which this
 * species stops" — and **nothing read it**: DESIGN.md's second failure mode, a
 * legal authoring pattern the compiler silently declined, on a key the kit
 * teaches a model to write. §9.6 resolved it per-species: the key moves onto the
 * species entry and the node-level value stays as the default.
 *
 * The fixture is a gentle ramp, because a ceiling on a flat world is either
 * everything or nothing.
 */

import { describe, expect, it } from "vitest";

import {
  HeightField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams
} from "@terrainist/stdlib";
import type { ForestParams } from "@terrainist/spec/ir";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import { buildColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";
import { scatterForests, type ForestNodeInput } from "../src/terrain/vegetation.js";

/**
 * A dry, plantable ramp rising west to east.
 *
 * Half a block of rise per column — ~26°, inside the default `maxSlope` of 35 —
 * so every column is eligible and height is the only thing that varies.
 */
function rampWorld(size: number, base: number) {
  const region = centeredRegion(size, size);
  const field = new HeightField(region);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      field.values[j * region.width + i] = base + Math.floor(i / 2);
    }
  }
  const classification = classify(field, resolveHeightfieldParams({}));
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const seed = nodeSeed(7n, "world");
  const { palette } = resolvePalette(stack, undefined, seed);
  const plan = buildColumnPlan({
    field,
    classification,
    palette,
    seaLevel: 63,
    calderas: [],
    basins: [],
    seed
  });
  return { region, field, classification, plan, palette, seed };
}

function node(params: ForestParams): ForestNodeInput {
  return { id: "woods", nodePath: "world.woods", seed: nodeSeed(7n, "world.woods"), params };
}

const BASE: ForestParams = {
  species: [
    { id: "spruce", weight: 1, shape: "spruce_tall" },
    { id: "birch", weight: 1, shape: "birch_slim" }
  ],
  density: 0.2,
  // The ramp climbs ~48 blocks over 96 columns, so the band has to be wide
  // enough that `elevation` is not the thing doing the cutting.
  elevation: [1, 200]
};

const world = rampWorld(96, 70);

/** The ground Y a tree stands on — `baseY` is the first log, one above ground. */
function groundOf(t: { baseY: number }): number {
  return t.baseY - 1;
}

describe("flora §9.6: snowLine is read", () => {
  it("the node-level key is a ceiling, and without it the wood climbs past it", () => {
    const open = scatterForests([node(BASE)], world.plan, world.classification, world.palette);
    const capped = scatterForests(
      [node({ ...BASE, snowLine: 90 })],
      world.plan,
      world.classification,
      world.palette,
    );
    // Exercised, not vacuous: the uncapped wood really does stand above 90.
    expect(open.trees.some((t) => groundOf(t) > 90)).toBe(true);
    expect(capped.trees.every((t) => groundOf(t) <= 90)).toBe(true);
    expect(capped.trees.length).toBeGreaterThan(0);
    // A stop, not a re-roll: every tree the ceiling leaves standing is the tree
    // the uncapped wood put there, unchanged.
    expect(capped.trees).toEqual(open.trees.filter((t) => groundOf(t) <= 90));
  });

  it("a species' own key wins over the node default, per species", () => {
    const scatter = scatterForests(
      [
        node({
          ...BASE,
          snowLine: 110,
          species: [
            { id: "spruce", weight: 1, shape: "spruce_tall" },
            { id: "birch", weight: 1, shape: "birch_slim", snowLine: 85 }
          ]
        })
      ],
      world.plan,
      world.classification,
      world.palette,
    );
    const birch = scatter.trees.filter((t) => t.speciesId === "birch");
    const spruce = scatter.trees.filter((t) => t.speciesId === "spruce");
    expect(birch.length).toBeGreaterThan(0);
    expect(spruce.length).toBeGreaterThan(0);
    // The birch stops at its own line; the spruce keeps going to the node's,
    // which is the treeline this key exists to draw.
    expect(birch.every((t) => groundOf(t) <= 85)).toBe(true);
    expect(spruce.some((t) => groundOf(t) > 85)).toBe(true);
    expect(spruce.every((t) => groundOf(t) <= 110)).toBe(true);
  });

  it("every stratum obeys it, not just the canopy", () => {
    const params: ForestParams = {
      ...BASE,
      snowLine: 88,
      strata: { emergent: "default", understory: "default", canopy: "default" }
    };
    const climate = {
      temperature: new Float32Array(world.plan.ground.length).fill(0.5),
      humidity: new Float32Array(world.plan.ground.length).fill(0.5),
      centers: { boreal: [0.18, 0.55], temperate: [0.5, 0.5], arid: [0.82, 0.15], tropical: [0.88, 0.82] } as const,
      themes: ["boreal", "temperate", "arid", "tropical"] as const
    };
    const scatter = scatterForests(
      [node(params)],
      world.plan,
      world.classification,
      world.palette,
      undefined,
      climate,
    );
    for (const stratum of ["emergent", "canopy", "understory"] as const) {
      const layer = scatter.trees.filter((t) => t.stratum === stratum);
      expect(layer.length, `${stratum} placed nothing, so the assertion is vacuous`).toBeGreaterThan(0);
      expect(layer.every((t) => groundOf(t) <= 88), `${stratum} above the snow line`).toBe(true);
    }
  });

  it("the reach law: a document that writes neither key is untouched", () => {
    const a = scatterForests([node(BASE)], world.plan, world.classification, world.palette);
    const b = scatterForests([node(BASE)], world.plan, world.classification, world.palette);
    expect(b.trees).toEqual(a.trees);
    expect(a.trees.length).toBeGreaterThan(0);
  });
});
