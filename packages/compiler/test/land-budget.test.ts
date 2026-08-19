/**
 * The land budget — `LOAM-W526 SETTLEMENT_LAND_SHORT`.
 *
 * The walked defect: a document authored "a grand coastal metropolis with a
 * wide harbour" as a full `city` node with a 340 × 240 envelope, and authored a
 * heightfield with `baseHeight` nine blocks *below* `seaLevel`. The world shipped
 * as open ocean with two islets and three buildings on them, and the compile
 * said nothing — because `groundFeasible` judges a ground-scale footprint by its
 * **median**, so an envelope that is nine-tenths sea is perfectly feasible as
 * long as its middle column is dry. No candidate is vetoed, no rung of the
 * ladder is climbed, and `E406` never fires.
 *
 * What is pinned here: the column-level measurement, the threshold on both
 * sides of the line, and the fact that only settlement-bearing nodes are asked
 * the question at all.
 */

import { describe, expect, it } from "vitest";

import {
  HeightField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams,
  type Classification,
  type Region,
} from "@terrainist/stdlib";

import { buildableColumns } from "../src/layout/fitness.js";
import {
  solveLayout,
  type LayoutNodeInput,
  type LayoutRequest,
} from "../src/layout/index.js";

const SEA_LEVEL = 63;
const REGION: Region = centeredRegion(96, 96);

/**
 * A synthetic world striped with water along x: period 20 columns, of which
 * `waterWidth` are two blocks under the sea and the rest four blocks over it.
 *
 * Striped rather than blobbed on purpose. A 60-wide footprint spans exactly
 * three periods wherever the solver puts it, so the land share under the
 * envelope is the same number at every candidate position — which is what lets
 * a test sit either side of a threshold without the placement being the thing
 * under test. The steps are 6 blocks over 2 columns, far under the 82° city
 * slope veto, so the water is the only thing refusing ground.
 */
function stripedWorld(waterWidth: number): { field: HeightField; classification: Classification } {
  const field = new HeightField(REGION);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      const phase = i % 20;
      field.values[j * REGION.width + i] = phase < waterWidth ? SEA_LEVEL - 2 : SEA_LEVEL + 4;
    }
  }
  const params = resolveHeightfieldParams({ seaLevel: SEA_LEVEL });
  return { field, classification: classify(field, params, {}) };
}

/** Dry land everywhere, gently rolling. */
function dryWorld(): { field: HeightField; classification: Classification } {
  const field = new HeightField(REGION);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      field.values[j * REGION.width + i] = SEA_LEVEL + 8 + (((i * 7 + j * 13) % 5) - 2);
    }
  }
  const params = resolveHeightfieldParams({ seaLevel: SEA_LEVEL });
  return { field, classification: classify(field, params, {}) };
}

function hazards(classification: Classification): Uint8Array {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  for (let k = 0; k < mask.length; k++) {
    if (classification.oceanMask[k] === 1 || classification.lakeMask[k] === 1) mask[k] = 1;
  }
  return mask;
}

function settlement(
  id: string,
  size: [number, number, number],
  kind: LayoutNodeInput["kind"],
): LayoutNodeInput {
  return {
    id,
    nodePath: `world.${id}`,
    kind,
    ...(kind === "generator" ? { generator: "building.grammar@0" } : {}),
    size,
    flexible: false,
    padding: 0,
    rotations: [0],
    constraints: [],
    ports: {},
    optional: false,
    tags: [],
    seed: nodeSeed(1234n, `world.${id}`, ""),
  };
}

function request(nodes: LayoutNodeInput[], world: ReturnType<typeof dryWorld>): LayoutRequest {
  return {
    region: REGION,
    field: world.field,
    classification: world.classification,
    seaLevel: SEA_LEVEL,
    rootPath: "world",
    nodes,
    hazardMask: hazards(world.classification),
  };
}

function landShort(nodes: LayoutNodeInput[], world: ReturnType<typeof dryWorld>) {
  return solveLayout(request(nodes, world)).diagnostics.filter(
    (d) => d.code === "LOAM-W526",
  );
}

describe("buildableColumns", () => {
  const whole = { x0: REGION.x0, z0: REGION.z0, x1: REGION.x0 + 59, z1: REGION.z0 + 59 };

  it("counts every column of dry, gentle ground", () => {
    const world = dryWorld();
    const count = buildableColumns(
      world.field,
      world.classification,
      whole,
      hazards(world.classification),
      SEA_LEVEL + 1,
      82,
    );
    expect(count.columns).toBe(3600);
    expect(count.buildable).toBe(3600);
    expect(count.dry).toBe(3600);
  });

  it("counts a drowned rectangle as the land that is left", () => {
    const world = stripedWorld(9);
    const count = buildableColumns(
      world.field,
      world.classification,
      whole,
      hazards(world.classification),
      SEA_LEVEL + 1,
      82,
    );
    // Three periods of 20 across the 60-wide rect, nine columns of water each.
    expect(count.columns).toBe(3600);
    expect(count.dry).toBe(3600 - 60 * 27);
    expect(count.buildable).toBe(count.dry);
  });

  it("separates water from slope: a cliff is dry and unbuildable", () => {
    const world = dryWorld();
    const count = buildableColumns(
      world.field,
      world.classification,
      whole,
      hazards(world.classification),
      SEA_LEVEL + 1,
      // A slope limit no real ground clears — the same rectangle, no water in it.
      -1,
    );
    expect(count.dry).toBe(3600);
    expect(count.buildable).toBe(0);
  });

  it("counts columns outside the region as unbuildable, not as absent", () => {
    const world = dryWorld();
    const count = buildableColumns(
      world.field,
      world.classification,
      { x0: REGION.x0 - 30, z0: REGION.z0, x1: REGION.x0 + 29, z1: REGION.z0 + 59 },
      hazards(world.classification),
      SEA_LEVEL + 1,
      82,
    );
    expect(count.columns).toBe(3600);
    expect(count.buildable).toBe(1800);
  });
});

describe("LOAM-W526 SETTLEMENT_LAND_SHORT", () => {
  it("fires on a city envelope that is mostly open water", () => {
    // 45% of every candidate footprint is sea, whichever one the solver picks.
    const found = landShort([settlement("metropolis", [60, 20, 60], "city")], stripedWorld(9));
    expect(found).toHaveLength(1);
    const d = found[0] as { severity: string; nodePath: string; message: string; fix: string };
    expect(d.severity).toBe("warning");
    expect(d.nodePath).toBe("world.metropolis");
    expect(d.message).toContain("60 × 60 envelope covers 3600 columns");
    expect(d.message).toContain("1980 of them are buildable ground (55%)");
    expect(d.message).toContain("under water");
    expect(d.fix).toContain("a settlement needs land");
  });

  it("stays silent when the envelope is mostly land", () => {
    // 25% water: a town with a bay in it, which is a town.
    expect(landShort([settlement("metropolis", [60, 20, 60], "city")], stripedWorld(5))).toEqual(
      [],
    );
  });

  it("stays silent on ground with no water in it at all", () => {
    expect(landShort([settlement("quarter", [60, 20, 60], "district")], dryWorld())).toEqual([]);
  });

  it("asks the question of a district as well as a city", () => {
    const found = landShort([settlement("quarter", [60, 20, 60], "district")], stripedWorld(9));
    expect(found).toHaveLength(1);
    expect((found[0] as { message: string }).message).toContain("this quarter's");
  });

  it("never asks it of a building: a house stands on the land it found", () => {
    // The same drowned world, and a `generator` node the ground vetoes are
    // already answering for.
    expect(landShort([settlement("cottage", [9, 7, 9], "generator")], stripedWorld(9))).toEqual([]);
  });

  it("names the region's own land budget, so the author knows which repair", () => {
    const found = landShort([settlement("metropolis", [60, 20, 60], "city")], stripedWorld(9));
    // 55% of a 96 × 96 region is 5069 columns, which is more than the 3600 the
    // envelope wanted: this world wants the city moved, not the sea drained.
    expect((found[0] as { message: string }).message).toContain("there is ground for it somewhere");
  });
});
