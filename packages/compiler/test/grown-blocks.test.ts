/**
 * A block is its own ground — `blocksOf`'s inscribed rectangle.
 *
 * `blocksOf` reduces every connected component of unblocked ground to the
 * largest free axis-aligned rectangle inside its *bounding box*, and everything
 * downstream — the frontage probe, the subdivision, the terrace runs, the
 * courtyard test — treats that rectangle as the block. On a `grid` fabric the
 * distinction is invisible, because a component fills its own bounding box. On
 * `grown` the streets curve, so a component's bounding box straddles the lane
 * beside it and contains columns of the *next* component. Measuring "largest
 * free rectangle" against the district's `blocked` mask therefore let one
 * block's rectangle reach into its neighbour's ground, two components
 * subdivided the same columns, and at `high` density — where coverage is 1 and
 * every lot builds — the two terraces were emitted through each other.
 *
 * Measured on `out/court-oldquarter` (`grown` × `high` × `stepped`): exactly one
 * such pair, a 19×8 range and an 11×16 one sharing a 9×2 corner, and that one
 * pair was the whole of the world's 46 `interior.blocked_column`, 142
 * `traversal.unreachable` and its single `traversal.no_start` — the ground floor
 * of the first building filled solid with the second building's walls, its door
 * bricked up and its upper storeys unreachable.
 *
 * The invariant is therefore stated where it can be checked without a world:
 * **no two blocks' rectangles overlap, and no two buildings' footprints
 * overlap**. The compiled half is here as well, because the composition is what
 * failed and a composition is what has to be walked.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HeightField, centeredRegion, type Region } from "@terrainist/stdlib";
import { validateSettlementDocument } from "@terrainist/spec";

import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import { solveDistricts } from "../src/layout/district.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";

const QUARTER = 96;
const REGION_SIZE = QUARTER * 2;
const BOUNDS: Rect = { x0: -QUARTER / 2, z0: -QUARTER / 2, x1: QUARTER / 2 - 1, z1: QUARTER / 2 - 1 };

/**
 * Two seeds, because the two halves see two different fields.
 *
 * The layout half lays the fabric over a synthetic ramp, so it needs a seed
 * whose *ramped* fabric overlapped; the compiled half runs the real terrain
 * generator, so it needs one whose *generated* fabric did. Both were found by
 * sweeping seeds against the pre-fix `blocksOf`, and both reproduce the defect
 * with the fix reverted — one overlapping pair in the first, two in the second.
 */
const LAID_SEED = 8045704n;
const COMPILED_SEED = 8227841n;

/** The old quarter, cut down to what reproduces: `grown` × `high` × `stepped`. */
const OLD_QUARTER = {
  fabric: "grown",
  density: "high",
  ground: "stepped",
  blockSize: 48,
  mix: ["apartment_block"],
  courtyards: 0.7,
};

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
}

/** Every pair of rectangles in `rects` that share a column, as a description. */
function overlappingPairs(rects: readonly Rect[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as Rect;
      const b = rects[j] as Rect;
      if (overlaps(a, b)) out.push(`${JSON.stringify(a)} ∩ ${JSON.stringify(b)}`);
    }
  }
  return out;
}

function quarterDoc(params: Record<string, unknown>, seed: bigint): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "grown_quarter", worldSeed: String(seed) },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [REGION_SIZE, REGION_SIZE] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          // Real relief: `stepped` derives platforms from the ground, and a
          // quarter on one plane has one platform and tests nothing.
          params: {
            seaLevel: 63,
            baseHeight: 72,
            amplitude: 18,
            octaves: 5,
            frequency: 0.004,
            gain: 0.5,
            erosionPasses: 2,
            soilDepth: 3,
          },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "old_quarter",
          kind: "district",
          envelope: { shape: "region", size: [QUARTER, QUARTER] },
          params,
          constraints: [
            { zone: "center" },
            { terrain_conform: "flatten", reference: "median", blend: 8, strength: "soft" },
          ],
        },
      ],
    },
  };
}

function layFabric(params: Record<string, unknown>) {
  const validated = validateSettlementDocument(quarterDoc(params, LAID_SEED));
  const doc = validated.document;
  if (doc === undefined) {
    throw new Error(
      `fixture did not validate: ${validated.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  const region: Region = centeredRegion(REGION_SIZE, REGION_SIZE);
  const field = new HeightField(region);
  // A gentle real slope, so the quarter derives more than one platform without
  // the cost of running the terrain generator.
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      field.values[j * region.width + i] = 72 + Math.floor((i + j) / 12);
    }
  }
  const placement: Placement = {
    nodePath: "world.old_quarter",
    id: "old_quarter",
    translation: [BOUNDS.x0, 72, BOUNDS.z0],
    yaw: 0,
    mirror: false,
    size: [QUARTER, 1, QUARTER],
    footprint: BOUNDS,
    anchor: { x: 0, z: 0 },
    foundationY: 72,
  };
  return solveDistricts({ doc, worldSeed: LAID_SEED, field, placements: [placement] });
}

describe("a grown quarter's blocks own disjoint ground", () => {
  const laid = layFabric(OLD_QUARTER);

  it("lays a fabric worth measuring", () => {
    expect(laid.placements.length).toBeGreaterThan(4);
  });

  it("never seats two buildings through each other", () => {
    expect(overlappingPairs(laid.placements.map((p) => p.footprint))).toEqual([]);
  });

  it("holds for the grid fabric too, which is where it always held", () => {
    const grid = layFabric({ ...OLD_QUARTER, fabric: "grid" });
    expect(overlappingPairs(grid.placements.map((p) => p.footprint))).toEqual([]);
  });

  it("lays the same fabric twice, footprint for footprint", () => {
    const again = layFabric(OLD_QUARTER);
    expect(JSON.stringify(again.placements.map((p) => p.footprint))).toBe(
      JSON.stringify(laid.placements.map((p) => p.footprint)),
    );
  });
});

describe("a medieval old town on a hill, compiled", () => {
  let root: string;
  let dir: string;
  let stack: PrismarineStack;
  let structures: StructurePassResult;
  let physics: PhysicsReport;
  let plan: ColumnPlan;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-grown-"));
    dir = path.join(root, "grown_quarter");
    const compiled = await compileTerrain(quarterDoc(OLD_QUARTER, COMPILED_SEED), {
      outDir: dir,
      onColumnPlan: (p) => {
        plan = p;
      },
    });
    if (!compiled.ok) {
      throw new Error(
        `fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    structures = compiled.report.layout?.structures as StructurePassResult;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: structures.buildings as never,
      roads: (structures.roads?.routes ?? []) as never,
      props: (structures.props ?? []) as never,
      tunnels: [],
      terrainTop: {
        x0: plan.region.x0,
        z0: plan.region.z0,
        width: plan.region.width,
        depth: plan.region.depth,
        ground: plan.ground,
        entrances: new Uint8Array(plan.region.width * plan.region.depth),
      },
    });
  }, 600_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("builds a quarter worth walking", () => {
    expect(structures.buildings.length).toBeGreaterThan(4);
    expect(physics.examined).toBeGreaterThan(100_000);
  });

  it("seats no building inside another", () => {
    expect(overlappingPairs(structures.buildings.map((b) => b.footprint))).toEqual([]);
  });

  it("finds nothing wrong under any physics rule", () => {
    for (const rule of PHYSICS_RULES) {
      expect(physics.counts[rule], rule).toBe(0);
    }
  });
});
