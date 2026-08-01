/**
 * The transport-air and transport-water props, where they meet a world.
 *
 * The grammar's own properties are held in `stdlib/test/vehicles.test.ts`; what
 * is checked here is everything that needs the block table or the column plan:
 *
 * - **the palette resolves.** Every one of these craft is drawn in blocks the
 *   older props never used — concrete, quartz, stained glass, iron bars — and a
 *   name that does not exist in the pinned 1.21.11 table is silently dropped
 *   with a `BAD_PALETTE` warning. Zero diagnostics is therefore a real claim
 *   about the fleet and not a formality;
 * - **the fleet floats.** Every hull is placed on real water and the emitted
 *   blocks are run back through `checkPropFluidSafety`, which re-derives the
 *   no-leak argument from the blocks rather than from the grammar's comment.
 *   `checkFluidStability` has to stay at zero on the plan as well;
 * - **the grounded craft stand on something.** The op-list version of this is
 *   in the stdlib; here it is asked of *world* blocks with the real
 *   `isFullCube`, which is the predicate the readback lint uses.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  AIRCRAFT6_PROP_NAMES,
  AIRCRAFT_PROP_NAMES,
  RAILCRAFT_PROP_NAMES,
  SHIP6_PROP_NAMES,
  SHIP_PROP_NAMES,
  nodeSeed,
  propFootprint,
} from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { DEV_GROUND_Y, devColumnPlan } from "../src/devworld.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { checkFluidStability } from "../src/terrain/validate.js";
import {
  buildProps,
  checkPropFluidSafety,
  planPropPlacement,
  type PropJob,
} from "../src/structures/props.js";
import { buildVehicleExhibits, planVehicleExhibits } from "../src/exhibits/vehicles.js";

let stack: PrismarineStack;

beforeAll(() => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
});

/** A plain big enough for the whole grid, with an optional basin in it. */
function plainPlan(width: number, depth: number, pond?: { x0: number; z0: number; x1: number; z1: number }): ColumnPlan {
  const plan = devColumnPlan({ x0: -32, z0: -32, width, depth }, stack);
  if (pond === undefined) return plan;
  for (let z = pond.z0; z <= pond.z1; z++) {
    for (let x = pond.x0; x <= pond.x1; x++) {
      const idx = (z + 32) * width + (x + 32);
      plan.ground[idx] = DEV_GROUND_Y - 4;
      plan.fluidTop[idx] = DEV_GROUND_Y - 1;
      plan.fluidKind[idx] = FluidKind.WATER;
    }
  }
  return plan;
}

/* -------------------------------------------------------------------------- */

describe("the vehicle grid", () => {
  it("shows every craft this round added, and lays its rows out without overlap", () => {
    const grid = planVehicleExhibits();
    const shown = new Set(grid.exhibits.map((e) => e.prop));
    for (const name of [
      ...AIRCRAFT_PROP_NAMES,
      ...SHIP_PROP_NAMES,
      ...AIRCRAFT6_PROP_NAMES,
      ...SHIP6_PROP_NAMES,
      ...RAILCRAFT_PROP_NAMES,
    ]) {
      expect(shown.has(name), name).toBe(true);
    }
    for (const row of grid.rows) {
      for (let i = 1; i < row.cells.length; i++) {
        const prev = row.cells[i - 1] as (typeof row.cells)[number];
        const cell = row.cells[i] as (typeof row.cells)[number];
        expect(cell.x).toBeGreaterThan(prev.x);
        expect(cell.z).toBe(prev.z);
      }
    }
    expect(grid.width).toBeGreaterThan(100);
  });

  it("puts the rolling stock on a land row, since a train brings its own rail", () => {
    const rows = planVehicleExhibits().rows;
    const rail = rows.find((r) => r.row === "rolling stock");
    expect(rail).toBeDefined();
    // No pad concept the grid did not already have: `railcraft.ts` draws the
    // ballast and the rail as part of each craft, so the row is dry.
    expect((rail as { water: boolean }).water).toBe(false);
    expect((rail as { pond?: unknown }).pond).toBeUndefined();
    expect((rail as { cells: readonly unknown[] }).cells.length).toBe(5);
    // …and the two wave-6 fleets that do float are on wet rows.
    for (const name of ["river craft", "container terminal"]) {
      const row = rows.find((r) => r.row === name);
      expect(row, name).toBeDefined();
      expect((row as { water: boolean }).water, name).toBe(true);
      expect((row as { pond?: unknown }).pond, name).toBeDefined();
    }
  });

  it("gives every water row a basin wider than the craft in it", () => {
    for (const row of planVehicleExhibits().rows) {
      if (!row.water) {
        expect(row.pond).toBeUndefined();
        continue;
      }
      const pond = row.pond as { x0: number; z0: number; x1: number; z1: number };
      for (const cell of row.cells) {
        expect(cell.x).toBeGreaterThan(pond.x0);
        expect(cell.z).toBeGreaterThan(pond.z0);
      }
    }
  });
});

describe("the fleet in a world", () => {
  const grid = planVehicleExhibits();
  const width = grid.width + 96;
  const depth = grid.depth + 96;

  it("builds every craft, with no block the pinned table does not have", () => {
    const plan = plainPlan(width, depth);
    const result = buildVehicleExhibits(plan, stack, 20260729n, 0, 0);
    // Every cell placed, and nothing dropped for want of a block.
    expect(result.diagnostics.map((d) => `${d.code} ${d.message}`)).toEqual([]);
    expect(result.placed.length).toBe(grid.exhibits.length);
    for (const placed of result.placed) expect(placed.blockCount).toBeGreaterThan(10);
  });

  it("leaves the water exactly as stable as it found it", () => {
    const plan = plainPlan(width, depth);
    const result = buildVehicleExhibits(plan, stack, 20260729n, 0, 0);
    expect(result.pondColumns).toBeGreaterThan(0);
    expect(checkFluidStability(plan).unstable).toBe(0);
    const fluid = checkPropFluidSafety(result.blocks, plan, stack);
    expect(fluid.leaks).toEqual([]);
    // The claim is stronger than "no leaks": no hull writes water at all.
    expect(fluid.waterBlocks).toBe(0);
  });

  it("floats every hull at the water line, and never below the second course", () => {
    const plan = plainPlan(width, depth);
    const result = buildVehicleExhibits(plan, stack, 20260729n, 0, 0);
    for (const placed of result.placed) {
      if (placed.base !== "water") continue;
      expect(placed.baseY, placed.prop).toBe(DEV_GROUND_Y - 1);
    }
    const deepest = Math.min(...result.blocks.map((b) => b.y));
    expect(deepest).toBeGreaterThanOrEqual(DEV_GROUND_Y - 2);
  });

  it("stands every grounded craft on a block the lint would call solid", () => {
    const plan = plainPlan(width, depth);
    const result = buildVehicleExhibits(plan, stack, 20260729n, 0, 0);
    const occupied = new Map(result.blocks.map((b) => [`${b.x},${b.y},${b.z}`, b.stateId]));
    const solid = (x: number, y: number, z: number): boolean => {
      const id = occupied.get(`${x},${y},${z}`);
      if (id !== undefined) return stack.isFullCube(id);
      return y <= DEV_GROUND_Y; // the plain itself
    };
    const offenders: string[] = [];
    for (const block of result.blocks) {
      const decoded = stack.blockStateProps(block.stateId);
      const name = decoded?.name ?? "";
      const hanging = name.endsWith("lantern") && decoded?.props["hanging"] === "true";
      if (hanging) {
        // A hung lantern is the mirror rule: it needs something above it.
        expect(
          solid(block.x, block.y + 1, block.z),
          `${name} at ${block.x},${block.y},${block.z} hangs from air`,
        ).toBe(true);
        continue;
      }
      const standing = name.endsWith("_fence") || name.endsWith("lantern");
      if (!standing) continue;
      // The lint's own rule, applied to the pass output: walk the chain down
      // through anything that stands on the block below it.
      let y = block.y - 1;
      let carried = false;
      for (let step = 0; step < 32; step++) {
        if (solid(block.x, y, block.z)) {
          carried = true;
          break;
        }
        const below = occupied.get(`${block.x},${y},${block.z}`);
        const belowName = below === undefined ? "" : (stack.blockNameByStateId(below) ?? "");
        if (!belowName.endsWith("_fence")) break;
        y--;
      }
      if (!carried) offenders.push(`${name} at ${block.x},${block.y},${block.z}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("placement of the large craft", () => {
  it("refuses a galleon a pond that is one column too narrow", () => {
    const foot = propFootprint("galleon", {});
    const [sizeX, , sizeZ] = foot.size;
    const width = sizeX + 96;
    const depth = sizeZ + 96;
    const narrow = plainPlan(width, depth, { x0: 0, z0: 0, x1: sizeX - 1, z1: sizeZ - 2 });
    expect(
      planPropPlacement({
        prop: "galleon",
        params: { at: { x: 0, z: 0 }, yaw: 0 },
        seed: nodeSeed(1n, "world.galleon", ""),
        plan: narrow,
      }),
    ).toBeUndefined();
    const exact = plainPlan(width, depth, { x0: 0, z0: 0, x1: sizeX - 1, z1: sizeZ - 1 });
    const site = planPropPlacement({
      prop: "galleon",
      params: { at: { x: 0, z: 0 }, yaw: 0 },
      seed: nodeSeed(1n, "world.galleon", ""),
      plan: exact,
    });
    expect(site?.footprint).toEqual({ x0: 0, z0: 0, x1: sizeX - 1, z1: sizeZ - 1 });
  });

  it("wants flat ground under an airliner, and finds some", () => {
    const foot = propFootprint("airliner", {});
    const plan = plainPlan(foot.size[0] + 96, foot.size[2] + 96);
    const jobs: PropJob[] = [
      {
        nodePath: "world.airliner",
        prop: "airliner",
        params: { at: { x: 0, z: 0 }, yaw: 0 },
        seed: nodeSeed(1n, "world.airliner", ""),
      },
    ];
    const result = buildProps({ jobs, plan, stack });
    expect(result.diagnostics).toEqual([]);
    const placed = result.placed[0] as (typeof result.placed)[number];
    expect(placed.baseY).toBe(DEV_GROUND_Y + 1);
    expect(placed.footprint).toEqual({
      x0: 0,
      z0: 0,
      x1: foot.size[0] - 1,
      z1: foot.size[2] - 1,
    });
    expect(placed.blockCount).toBeGreaterThan(1000);
  });
});
