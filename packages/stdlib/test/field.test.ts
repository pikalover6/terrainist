import { describe, expect, it } from "vitest";

import { nodeSeed } from "../src/determinism/index.js";
import { deriveNoiseSeeds } from "../src/noise/index.js";
import {
  HEIGHTFIELD_DEFAULTS,
  HeightField,
  buildBaseField,
  buildBaseFieldForNode,
  centeredRegion,
  evaluateBase,
  fractionalToWorld,
  resolveHeightfieldParams,
} from "../src/field/index.js";
import { buildTerrainField } from "../src/index.js";

const node = nodeSeed(813205n, "world.terrain");
const seeds = deriveNoiseSeeds(node);
const region = centeredRegion(96, 96);

describe("region helpers", () => {
  it("centres a region on the origin", () => {
    expect(centeredRegion(512, 512)).toEqual({ x0: -256, z0: -256, width: 512, depth: 512 });
  });

  it("maps fractional coordinates to world blocks", () => {
    expect(fractionalToWorld(region, 0, 0)).toEqual([-48, -48]);
    expect(fractionalToWorld(region, 0.5, 0.5)).toEqual([0, 0]);
    expect(fractionalToWorld(region, 1, 1)).toEqual([48, 48]);
  });
});

describe("parameter resolution", () => {
  it("adds the classification defaults", () => {
    const p = resolveHeightfieldParams({});
    expect(p.cliffThreshold).toBe(55);
    expect(p.soilDepth).toBe(3);
    expect(p.beachWidth).toBe(4);
    expect(p.snowLineFraction).toBe(0.8);
    expect(p).toEqual(HEIGHTFIELD_DEFAULTS);
  });
});

describe("HeightField", () => {
  it("indexes row-major and clamps at the border", () => {
    const f = new HeightField({ x0: 0, z0: 0, width: 3, depth: 2 });
    f.values.set([0, 1, 2, 3, 4, 5]);
    expect(f.index(2, 1)).toBe(5);
    expect(f.index(3, 1)).toBe(-1);
    expect(f.at(-10, -10)).toBe(0);
    expect(f.at(100, 100)).toBe(5);
    f.set(1, 0, 9);
    expect(f.at(1, 0)).toBe(9);
    f.set(99, 0, 1000);
    expect(f.extent().max).toBe(9);
  });

  it("interpolates bilinearly between integer columns", () => {
    const f = new HeightField({ x0: 0, z0: 0, width: 2, depth: 2 });
    f.values.set([0, 10, 20, 30]);
    expect(f.heightAt(0.5, 0)).toBe(5);
    expect(f.heightAt(0, 0.5)).toBe(10);
    expect(f.heightAt(0.5, 0.5)).toBe(15);
  });

  it("clones deeply", () => {
    const f = new HeightField({ x0: 0, z0: 0, width: 2, depth: 1 });
    f.values.set([1, 2]);
    const c = f.clone();
    c.values[0] = 99;
    expect(f.values[0]).toBe(1);
  });
});

describe("heightAt ≡ the materialized grid", () => {
  const cases: Array<[string, Parameters<typeof resolveHeightfieldParams>[0]]> = [
    ["defaults", {}],
    ["ridged + warp", { ridged: true, warp: { amount: 24, frequency: 0.01 } }],
    ["eroded", { erosionPasses: 4 }],
    [
      "continental + curve",
      {
        continentalness: { frequency: 0.0015, seaFraction: 0.4 },
        curve: [
          [0, 0],
          [0.5, 0.3],
          [1, 1],
        ],
      },
    ],
  ];

  for (const [label, params] of cases) {
    it(`agrees at every integer column (${label})`, () => {
      const { field } = buildBaseFieldForNode(region, params, node);
      for (let j = 0; j < region.depth; j++) {
        for (let i = 0; i < region.width; i++) {
          const x = region.x0 + i;
          const z = region.z0 + j;
          expect(field.heightAt(x, z)).toBe(field.values[j * region.width + i]);
        }
      }
    });
  }

  it("agrees after edits are composed, too", () => {
    const { field } = buildTerrainField({
      region,
      worldSeed: 42,
      nodePath: "world.terrain",
      params: { erosionPasses: 2 },
      edits: [
        { id: "p", verb: "peak", zone: "center" },
        { id: "r", verb: "river", course: [[0.1, 0.1], [0.9, 0.9]] },
      ],
    });
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        expect(field.heightAt(region.x0 + i, region.z0 + j)).toBe(
          field.values[j * region.width + i],
        );
      }
    }
  });
});

describe("pointwise base stack ≡ grid when erosion is off", () => {
  it("matches exactly with erosionPasses = 0", () => {
    const params = resolveHeightfieldParams({
      ridged: true,
      warp: { amount: 20, frequency: 0.01 },
      continentalness: { frequency: 0.0012, seaFraction: 0.45 },
      erosionPasses: 0,
    });
    const field = buildBaseField({ region, params, seeds });
    for (let j = 0; j < region.depth; j += 3) {
      for (let i = 0; i < region.width; i += 3) {
        const x = region.x0 + i;
        const z = region.z0 + j;
        expect(evaluateBase(seeds, params, x, z)).toBe(field.values[j * region.width + i]);
      }
    }
  });

  it("legitimately diverges once erosion runs — which is why heightAt reads the grid", () => {
    const params = resolveHeightfieldParams({ erosionPasses: 4, ridged: true });
    const field = buildBaseField({ region, params, seeds });
    let differences = 0;
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const x = region.x0 + i;
        const z = region.z0 + j;
        if (evaluateBase(seeds, params, x, z) !== field.values[j * region.width + i]) {
          differences++;
        }
      }
    }
    expect(differences).toBeGreaterThan(0);
  });
});

describe("field construction", () => {
  it("is independent of the region window (same world coordinates, same heights)", () => {
    const params = resolveHeightfieldParams({ ridged: true });
    const wide = buildBaseField({ region: centeredRegion(128, 128), params, seeds });
    const narrow = buildBaseField({
      region: { x0: -10, z0: -10, width: 20, depth: 20 },
      params,
      seeds,
    });
    for (let z = -10; z < 10; z++) {
      for (let x = -10; x < 10; x++) {
        expect(narrow.at(x, z)).toBe(wide.at(x, z));
      }
    }
  });

  it("scales relief with amplitude", () => {
    const small = buildBaseFieldForNode(region, { amplitude: 10 }, node).field.extent();
    const large = buildBaseFieldForNode(region, { amplitude: 80 }, node).field.extent();
    expect(large.max - large.min).toBeGreaterThan(small.max - small.min);
  });

  it("centres land on baseHeight when there is no continental mask", () => {
    const { field } = buildBaseFieldForNode(region, { amplitude: 20, baseHeight: 100 }, node);
    const { min, max } = field.extent();
    expect(min).toBeGreaterThanOrEqual(80 - 1e-9);
    expect(max).toBeLessThanOrEqual(120 + 1e-9);
  });
});
