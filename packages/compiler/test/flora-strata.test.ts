/**
 * Strata composition (FLORA-GRAMMAR-v0 §5, §8.1).
 *
 * The reach law is the first assertion and the most important one: a node that
 * declares no `strata` produces the identical placement list, tree for tree and
 * field for field.
 */

import { describe, expect, it } from "vitest";

import {
  HeightField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams,
} from "@terrainist/stdlib";
import type { ForestParams } from "@terrainist/spec";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { buildColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";
import {
  EMERGENT_AREA,
  EMERGENT_EXCLUSION,
  EMERGENT_MAX,
  climateThemeAt,
  nodeClimateTheme,
  resolveStrata,
  scatterForests,
  speciesFor,
  treeBlocks,
  treeCanopyRadius,
  type ForestNodeInput,
  type TreePlacement,
} from "../src/terrain/vegetation.js";

/** A flat, dry, fully plantable world: the cleanest possible scatter fixture. */
function flatWorld(size: number, height: number) {
  const region = centeredRegion(size, size);
  const field = new HeightField(region);
  field.values.fill(height);
  const classification = classify(field, resolveHeightfieldParams({}));
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const seed = nodeSeed(7n, "world");
  const { palette } = resolvePalette(stack, undefined, seed);
  const plan = buildColumnPlan({
    field,
    classification,
    palette,
    seaLevel: 63,
    soilDepth: 3,
    calderas: [],
    basins: [],
    seed,
  });
  return { region, field, classification, plan, palette, stack, seed };
}

function node(params: ForestParams): ForestNodeInput {
  return { id: "woods", nodePath: "world.woods", seed: nodeSeed(7n, "world.woods"), params };
}

const LEGACY: ForestParams = {
  species: [
    { id: "spruce", weight: 1, shape: "spruce_tall" },
    { id: "squat", weight: 1, shape: "spruce_squat" },
    { id: "oak", weight: 1, shape: "oak_round" },
    { id: "birch", weight: 1, shape: "birch_slim" },
  ],
  density: 0.15,
  spacing: 3,
  clumping: 0,
  edgeFalloff: 0,
};

/** A temperate climate everywhere, so the default tables are predictable. */
function temperate(n: number) {
  return {
    temperature: new Float32Array(n).fill(0.5),
    humidity: new Float32Array(n).fill(0.5),
    centers: { boreal: [0.18, 0.55], temperate: [0.5, 0.5], arid: [0.82, 0.15], tropical: [0.88, 0.82] } as const,
    themes: ["boreal", "temperate", "arid", "tropical"] as const,
  };
}

describe("flora: the reach law at the scatter level", () => {
  const world = flatWorld(96, 80);
  it("absent strata, the placement list is identical", () => {
    const a = scatterForests([node(LEGACY)], world.plan, world.classification, world.palette);
    const b = scatterForests([node(LEGACY)], world.plan, world.classification, world.palette, undefined, temperate(world.plan.ground.length));
    expect(b.trees).toEqual(a.trees);
    expect(a.strata).toEqual([]);
    // No strata means no stratum tag — the layer machinery did not run.
    expect(a.trees.every((t) => t.stratum === undefined)).toBe(true);
  });

  /**
   * **Amended by orchestrator ruling, WP-D.**
   *
   * This case used to read *"a no-strata placement carries no `programSeed`"*,
   * and that assertion had a reason rather than a value: **the legacy shapes
   * never draw**, so a seed on the plain path could only be dead weight. WP-C
   * found what it also was — a landmine. A species whose program *does* draw
   * (`broadleaf`, `giant`, `ancient`, `umbrella`, `weeping`, `fungal`,
   * `columnar` with deco) crashed on the missing seed the moment it was named
   * in a plain `species` list with no `strata`, which is exactly what a
   * Luna-authored document writes once the kit teaches it a species name.
   *
   * So the plain path now carries the seed, and the reason survives as the
   * narrower assertion it always was: the two legacy programs never call the
   * RNG, so their blocks are byte-identical whether a seed is present or not.
   * That is checked here directly, and by the world-level byte-identity gate.
   */
  it("the legacy shapes never draw, so a seed on the plain path moves nothing", () => {
    const scatter = scatterForests([node(LEGACY)], world.plan, world.classification, world.palette);
    expect(scatter.trees.length).toBeGreaterThan(0);
    for (const tree of scatter.trees) {
      expect(speciesFor(tree.shape).program === "conifer" || speciesFor(tree.shape).program === "blob").toBe(true);
      // With the seed, and with it removed: element for element the same list.
      const { programSeed, ...seedless } = tree;
      expect(programSeed).toBeDefined();
      expect(treeBlocks(seedless)).toEqual(treeBlocks(tree));
    }
  });

  it("a plain species list may name a species whose program draws", () => {
    // The regression WP-C reported and WP-D fixes: no `strata`, a species
    // named outright, and it grows instead of throwing. Two species, because
    // they fail differently — `oak_spreading` draws its limb count on the
    // first block and threw *"broadleaf drew from the RNG with no program
    // seed"* (measured against the pre-fix compiler on a 128² document), while
    // `mushroom_shelf_brown` never draws and instead has to prove that a
    // mushroom actually comes up: stem and cap, in a plain list.
    const drawer = scatterForests(
      [node({ ...LEGACY, species: [{ id: "spreading", weight: 1, shape: "oak_spreading" }] })],
      world.plan,
      world.classification,
      world.palette,
    );
    expect(drawer.trees.length).toBeGreaterThan(0);
    for (const tree of drawer.trees) expect(() => treeBlocks(tree)).not.toThrow();
    expect(treeBlocks(drawer.trees[0] as TreePlacement).some((b) => b.part === "branch")).toBe(true);

    const scatter = scatterForests(
      [node({ ...LEGACY, species: [{ id: "shelf", weight: 1, shape: "mushroom_shelf_brown" }] })],
      world.plan,
      world.classification,
      world.palette,
    );
    expect(scatter.trees.length).toBeGreaterThan(0);
    const blocks = treeBlocks(scatter.trees[0] as TreePlacement);
    expect(blocks.some((b) => b.part === "stem")).toBe(true);
    expect(blocks.some((b) => b.part === "cap")).toBe(true);
  });
});

describe("flora: the emergent budget and its exclusion radius", () => {
  it("resolveStrata expands the one-word form", () => {
    expect(resolveStrata(true)).toEqual({ emergent: "default", understory: "default", canopy: "authored", floor: "default" });
    expect(resolveStrata(undefined)).toBeUndefined();
  });

  it("the budget follows the area formula", () => {
    for (const size of [64, 170, 512]) {
      const expected = Math.max(0, Math.min(EMERGENT_MAX, Math.round((size * size) / (EMERGENT_AREA * EMERGENT_AREA))));
      const world = flatWorld(size, 80);
      const scatter = scatterForests(
        [node({ ...LEGACY, strata: { emergent: "default", understory: "none" } })],
        world.plan,
        world.classification,
        world.palette,
        undefined,
        temperate(world.plan.ground.length),
      );
      expect(scatter.strata[0]?.budget, `size ${size}`).toBe(expected);
      expect(scatter.strata[0]?.theme).toBe("temperate");
    }
  });

  it("placed <= budget, and no two emergents are closer than the exclusion radius", () => {
    const world = flatWorld(384, 80);
    const scatter = scatterForests(
      [node({ ...LEGACY, strata: { emergent: "default", understory: "none" } })],
      world.plan,
      world.classification,
      world.palette,
      undefined,
      temperate(world.plan.ground.length),
    );
    const row = scatter.strata[0];
    const emergents = scatter.trees.filter((t) => t.stratum === "emergent");
    expect(row?.placed).toBe(emergents.length);
    expect(emergents.length).toBeLessThanOrEqual(row?.budget as number);
    expect(emergents.length).toBeGreaterThan(0);
    for (const a of emergents) {
      for (const b of emergents) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d, "two emergents inside the exclusion radius").toBeGreaterThanOrEqual(EMERGENT_EXCLUSION);
      }
    }
    // The temperate emergent row is the beech giant.
    expect(new Set(emergents.map((t) => t.shape))).toEqual(new Set(["beech_giant"]));
  });

  it("a mask too small to hold its budget reports the shortfall rather than forcing trees", () => {
    const world = flatWorld(96, 80);
    const scatter = scatterForests(
      [node({ ...LEGACY, strata: { emergent: { budget: 8 }, understory: "none" } })],
      world.plan,
      world.classification,
      world.palette,
      undefined,
      temperate(world.plan.ground.length),
    );
    const row = scatter.strata[0];
    expect(row?.budget).toBe(8);
    expect(row?.placed).toBeLessThan(8);
    expect(row?.placed).toBeGreaterThan(0);
  });
});

describe("flora: spacing across strata", () => {
  const world = flatWorld(256, 80);
  const scatter = scatterForests(
    [node({ ...LEGACY, strata: true })],
    world.plan,
    world.classification,
    world.palette,
    undefined,
    temperate(world.plan.ground.length),
  );

  it("all three strata are populated", () => {
    for (const stratum of ["emergent", "canopy", "understory"] as const) {
      expect(scatter.trees.some((t) => t.stratum === stratum), stratum).toBe(true);
    }
  });

  it("trunk-to-trunk clearance holds across strata", () => {
    const spacing = 3;
    const cells = new Map<string, { x: number; z: number }[]>();
    for (const t of scatter.trees) {
      const k = `${t.x >> 3},${t.z >> 3}`;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          for (const o of cells.get(`${(t.x >> 3) + di},${(t.z >> 3) + dj}`) ?? []) {
            const d2 = (o.x - t.x) ** 2 + (o.z - t.z) ** 2;
            expect(d2, `trunks at ${t.x},${t.z} and ${o.x},${o.z}`).toBeGreaterThanOrEqual(spacing * spacing);
          }
        }
      }
      const bucket = cells.get(k);
      if (bucket === undefined) cells.set(k, [{ x: t.x, z: t.z }]);
      else bucket.push({ x: t.x, z: t.z });
    }
  });

  it("an understory tree may stand under an emergent crown", () => {
    const emergents = scatter.trees.filter((t) => t.stratum === "emergent");
    const under = scatter.trees.filter(
      (t) =>
        t.stratum === "understory" &&
        emergents.some((e) => Math.hypot(e.x - t.x, e.z - t.z) <= treeCanopyRadius(e)),
    );
    expect(under.length, "no understory tree under any emergent crown").toBeGreaterThan(0);
  });

  it("the understory draws from the climate table's understory row", () => {
    for (const t of scatter.trees) {
      if (t.stratum !== "understory") continue;
      expect(speciesFor(t.shape).stratum).toBe("understory");
    }
  });
});

describe("flora: determinism and the mega-spruce subsumption", () => {
  const world = flatWorld(192, 80);
  const run = (params: ForestParams) =>
    scatterForests(
      [node(params)],
      world.plan,
      world.classification,
      world.palette,
      undefined,
      temperate(world.plan.ground.length),
    );

  it("strata composition is traversal-independent: two runs agree exactly", () => {
    const a = run({ ...LEGACY, strata: true });
    const b = run({ ...LEGACY, strata: true });
    expect(b.trees).toEqual(a.trees);
  });

  it("mega spruces are suppressed exactly when an emergent stratum is live", () => {
    const withEmergent = run({ ...LEGACY, strata: { emergent: "default", understory: "none" } });
    const withoutEmergent = run({ ...LEGACY, strata: { emergent: "none", understory: "none" } });
    expect(withEmergent.trees.some((t) => t.mega)).toBe(false);
    // With nothing to subsume it, the 3% draw survives untouched.
    expect(withoutEmergent.trees.some((t) => t.mega)).toBe(true);
  });

  it("a node with no strata still draws mega spruces", () => {
    expect(run(LEGACY).trees.some((t) => t.mega)).toBe(true);
  });
});

describe("flora: climate resolution", () => {
  const centers = { boreal: [0.18, 0.55], temperate: [0.5, 0.5], arid: [0.82, 0.15], tropical: [0.88, 0.82] } as const;
  const themes = ["boreal", "temperate", "arid", "tropical"];

  it("climateThemeAt picks the nearest centre", () => {
    expect(climateThemeAt(0.18, 0.55, centers, themes)).toBe("boreal");
    expect(climateThemeAt(0.85, 0.8, centers, themes)).toBe("tropical");
    expect(climateThemeAt(0.8, 0.1, centers, themes)).toBe("arid");
  });

  it("a node takes one theme by ambient majority, not one per column", () => {
    const n = 100;
    const temperature = new Float32Array(n);
    const humidity = new Float32Array(n);
    const mask = new Uint8Array(n).fill(1);
    // 60 boreal columns, 40 arid: the node is boreal, whole.
    for (let k = 0; k < n; k++) {
      const boreal = k < 60;
      temperature[k] = boreal ? 0.18 : 0.82;
      humidity[k] = boreal ? 0.55 : 0.15;
    }
    expect(nodeClimateTheme(mask, { temperature, humidity, centers, themes })).toBe("boreal");
  });
});
