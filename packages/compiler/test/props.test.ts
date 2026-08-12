/**
 * `prop.place@0` — placement, rail states and fluid safety.
 *
 * The grammar's own tests live in the stdlib; these are about what happens
 * when a prop meets a world:
 *
 * - a boat has to land on water deep enough to float in, a pier has to start
 *   dry and end wet, and a cart has to find flat ground — and all three have
 *   to do it from the coarse vocabulary an author actually writes;
 * - the rail-state pass has to derive straights, curves and ascents from
 *   nothing but the neighbourhood, including across a chunk boundary;
 * - nothing a prop emits may leave water able to flow.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  PROP_NAMES,
  generateProp,
  nodeSeed,
  type Seed256,
} from "@terrainist/stdlib";
import { SETTLEMENT_PROP_NAMES } from "@terrainist/spec";

import { applyConnectionStates, connectiveKindOf, railShape } from "../src/emit/connections.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { loadPrismarine, type EmitChunk, type PrismarineStack } from "../src/emit/prismarine.js";
import { DEV_GROUND_Y, devColumnPlan } from "../src/devworld.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { checkFluidStability } from "../src/terrain/validate.js";
import {
  PROP_MAX_RELIEF,
  buildProps,
  checkPropFluidSafety,
  groundBase,
  levelPropPad,
  planPropPlacement,
  propReliefTolerance,
  waterBase,
  type PropJob,
} from "../src/structures/props.js";
import { buildPropExhibits, planPropExhibits } from "../src/exhibits/props.js";

// Sized from the grid itself, the way `devworld.ts` sizes the real field — a
// fixed literal here silently strands new rows off the plan's south edge, and
// a stranded prop seeks back inside and squeezes into whatever gap is left
// (or CANNOT_FITs, if it is wide or wants water). +64 covers the 48-block
// seek radius with margin.
const PROP_TEST_GRID = planPropExhibits(0, 0);
const PROP_TEST_RECT = {
  x0: -16,
  z0: -16,
  width: Math.max(256, PROP_TEST_GRID.width + 64),
  depth: PROP_TEST_GRID.depth + 64,
};
import { planVehicleExhibits } from "../src/exhibits/vehicles.js";
import type { Region } from "@terrainist/stdlib";

let stack: PrismarineStack;

beforeAll(() => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
});

const REGION: Region = { x0: 0, z0: 0, width: 96, depth: 96 };

function seedOf(path: string): Seed256 {
  return nodeSeed(20260728n, path, "");
}

/** The flat dev plain, with an optional rectangular pond dug into it. */
function plainPlan(pond?: { x0: number; z0: number; x1: number; z1: number }): ColumnPlan {
  const plan = devColumnPlan(REGION, stack);
  if (pond === undefined) return plan;
  for (let z = pond.z0; z <= pond.z1; z++) {
    for (let x = pond.x0; x <= pond.x1; x++) {
      const idx = (z - REGION.z0) * REGION.width + (x - REGION.x0);
      plan.ground[idx] = DEV_GROUND_Y - 4;
      plan.fluidTop[idx] = DEV_GROUND_Y - 1;
      plan.fluidKind[idx] = FluidKind.WATER;
      plan.surface[idx] = stack.blockByName("sand")?.stateId ?? 0;
    }
  }
  return plan;
}

/* -------------------------------------------------------------------------- */

describe("the prop catalog and the validator agree", () => {
  it("lists exactly the same props on both sides of the compiler", () => {
    expect([...SETTLEMENT_PROP_NAMES]).toEqual([...PROP_NAMES]);
  });
});

describe("prop placement", () => {
  it("puts a land prop on flat, dry ground at the base plane", () => {
    const plan = plainPlan();
    const site = planPropPlacement({
      prop: "cart",
      params: { at: { x: 20, z: 20 }, yaw: 0 },
      seed: seedOf("world.cart"),
      plan,
    });
    expect(site).toBeDefined();
    expect(site?.footprint).toEqual({ x0: 20, z0: 20, x1: 23, z1: 22 });
    expect(site?.baseY).toBe(DEV_GROUND_Y + 1);
  });

  it("refuses ground that is not flat enough, and finds some that is", () => {
    const plan = plainPlan();
    // A one-column spike two blocks proud of the plain, under the target.
    plan.ground[(21 - REGION.z0) * REGION.width + (21 - REGION.x0)] = DEV_GROUND_Y + 3;
    expect(groundBase(plan, { x0: 20, z0: 20, x1: 23, z1: 22 })).toBeUndefined();
    const site = planPropPlacement({
      prop: "cart",
      params: { at: { x: 20, z: 20 }, yaw: 0 },
      seed: seedOf("world.cart"),
      plan,
    });
    expect(site).toBeDefined();
    // It moved off the spike rather than building over it.
    expect(site?.footprint.x0 === 20 && site?.footprint.z0 === 20).toBe(false);
  });

  it("floats a boat on water, at the water surface", () => {
    const plan = plainPlan({ x0: 30, z0: 30, x1: 60, z1: 60 });
    const site = planPropPlacement({
      prop: "rowboat",
      params: { at: { x: 40, z: 40 }, yaw: 0 },
      seed: seedOf("world.boat"),
      plan,
    });
    expect(site).toBeDefined();
    expect(site?.baseY).toBe(DEV_GROUND_Y - 1);
    expect(waterBase(plan, site?.footprint as never)).toBe(DEV_GROUND_Y - 1);
  });

  it("will not float a boat in a puddle one block deep", () => {
    const plan = plainPlan({ x0: 30, z0: 30, x1: 60, z1: 60 });
    for (let z = 30; z <= 60; z++) {
      for (let x = 30; x <= 60; x++) {
        plan.ground[(z - REGION.z0) * REGION.width + (x - REGION.x0)] = DEV_GROUND_Y - 2;
      }
    }
    expect(
      planPropPlacement({
        prop: "rowboat",
        params: { at: { x: 40, z: 40 } },
        seed: seedOf("world.boat"),
        plan,
      }),
    ).toBeUndefined();
  });

  it("gives up rather than placing a water prop on a dry world", () => {
    const plan = plainPlan();
    expect(
      planPropPlacement({
        prop: "fishing_sloop",
        params: { at: { x: 40, z: 40 } },
        seed: seedOf("world.sloop"),
        plan,
      }),
    ).toBeUndefined();
  });

  it("is a pure function of the plan and the target", () => {
    const params = { zone: "northeast" as const };
    const seed = seedOf("world.gazebo");
    const a = planPropPlacement({ prop: "gazebo", params, seed, plan: plainPlan() });
    const b = planPropPlacement({ prop: "gazebo", params, seed, plan: plainPlan() });
    expect(a).toEqual(b);
    expect(a).toBeDefined();
    // A zone token puts it in that ninth of the region, not in the middle.
    expect((a as { footprint: { x0: number } }).footprint.x0).toBeGreaterThan(REGION.width / 2);
  });

  it("resolves the coarse zone vocabulary to different corners", () => {
    const seed = seedOf("world.zoned");
    const sites = (["northwest", "southeast"] as const).map((zone) =>
      planPropPlacement({ prop: "statue_plinth", params: { zone }, seed, plan: plainPlan() }),
    );
    const [nw, se] = sites as [{ footprint: { x0: number; z0: number } }, { footprint: { x0: number; z0: number } }];
    expect(nw.footprint.x0).toBeLessThan(se.footprint.x0);
    expect(nw.footprint.z0).toBeLessThan(se.footprint.z0);
  });
});

describe("piers", () => {
  /** A pond filling the south half of the region: shore runs along z = 48. */
  function shorePlan(): ColumnPlan {
    return plainPlan({ x0: 0, z0: 48, x1: 95, z1: 95 });
  }

  it("starts on dry land and reaches the water", () => {
    const plan = shorePlan();
    const site = planPropPlacement({
      prop: "pier",
      params: { at: { x: 40, z: 47 }, length: 10, width: 2 },
      seed: seedOf("world.pier"),
      plan,
    });
    expect(site).toBeDefined();
    const rect = (site as { footprint: { x0: number; z0: number; x1: number; z1: number } }).footprint;
    const wet = (x: number, z: number): boolean =>
      plan.fluidKind[(z - REGION.z0) * REGION.width + (x - REGION.x0)] === FluidKind.WATER;
    // The landward end is dry, the seaward end is over water.
    expect(wet(rect.x0, rect.z0)).toBe(false);
    expect(wet(rect.x0, rect.z1)).toBe(true);
    expect(rect.z1 - rect.z0 + 1).toBe(10);
    expect((site as { yaw: number }).yaw).toBe(0); // +z local is seaward, and the water is south
  });

  it("faces the water when the water is the other way", () => {
    // The same pond, mirrored: water to the north, shore along z = 48.
    const plan = plainPlan({ x0: 0, z0: 0, x1: 95, z1: 47 });
    const site = planPropPlacement({
      prop: "pier",
      params: { at: { x: 40, z: 48 }, length: 8, width: 2 },
      seed: seedOf("world.pier"),
      plan,
    });
    expect(site).toBeDefined();
    expect((site as { yaw: number }).yaw).toBe(180);
  });

  it("drives its piles down to the bed", () => {
    const plan = shorePlan();
    const jobs: PropJob[] = [
      {
        nodePath: "world.pier",
        prop: "pier",
        params: { at: { x: 40, z: 47 }, length: 10, width: 2 },
        seed: seedOf("world.pier"),
      },
    ];
    const pass = buildProps({ jobs, plan, stack });
    expect(pass.diagnostics).toEqual([]);
    const placed = pass.placed[0] as NonNullable<(typeof pass.placed)[number]>;
    // A pile column over the deepest water reaches from the deck to the bed.
    const seaward = pass.blocks.filter((b) => b.z === placed.footprint.z1 && b.x === placed.footprint.x0);
    const lowest = Math.min(...seaward.map((b) => b.y));
    expect(lowest).toBe(DEV_GROUND_Y - 4 + 1);
  });

  it("lets a boat moor at the pier it just placed", () => {
    const plan = shorePlan();
    const jobs: PropJob[] = [
      {
        nodePath: "world.pier",
        prop: "pier",
        params: { at: { x: 40, z: 47 }, length: 10, width: 2 },
        seed: seedOf("world.pier"),
      },
      {
        nodePath: "world.boat",
        prop: "rowboat",
        params: { at: "pier", yaw: 0 },
        seed: seedOf("world.boat"),
      },
    ];
    const pass = buildProps({ jobs, plan, stack });
    expect(pass.placed).toHaveLength(2);
    const pier = pass.placed[0] as { anchor?: { x: number; z: number } };
    const boat = pass.placed[1] as { footprint: { x0: number; z0: number } };
    expect(pier.anchor).toBeDefined();
    const anchor = pier.anchor as { x: number; z: number };
    // Moored means "near the pier end", not "on top of it": the pier's own
    // footprint is claimed, so the boat is beside it.
    const distance = Math.abs(boat.footprint.x0 - anchor.x) + Math.abs(boat.footprint.z0 - anchor.z);
    expect(distance).toBeLessThan(12);
  });
});

describe("props that belong on the water seek the waterline", () => {
  /** A dry region with one pond in the far southeast corner, nowhere near NW. */
  function farPondPlan(): ColumnPlan {
    return plainPlan({ x0: 76, z0: 76, x1: 95, z1: 95 });
  }

  it("seats a ship whose coarse zone landed inland, and notes that it moved", () => {
    const plan = farPondPlan();
    const jobs: PropJob[] = [
      {
        nodePath: "world.longship",
        prop: "longship",
        params: { zone: "northwest", jitter: 0 },
        seed: seedOf("world.longship"),
      },
    ];
    const pass = buildProps({ jobs, plan, stack });
    expect(pass.placed).toHaveLength(1);
    const placed = pass.placed[0] as { footprint: { x0: number; z0: number }; baseY: number };
    expect(waterBase(plan, (pass.placed[0] as { footprint: never }).footprint)).toBe(placed.baseY);
    const note = pass.diagnostics.find((d) => d.name === "PROP_RESEATED");
    expect(note?.code).toBe("LOAM-T228");
    expect(pass.diagnostics.some((d) => d.name === "CANNOT_FIT")).toBe(false);
  });

  it("seats a pier whose coarse zone landed inland, on real coastline", () => {
    const plan = farPondPlan();
    const site = planPropPlacement({
      prop: "pier",
      params: { zone: "northwest", jitter: 0, length: 8, width: 2 },
      seed: seedOf("world.pier"),
      plan,
    });
    expect(site).toBeDefined();
    const rect = (site as { footprint: { x0: number; z0: number; x1: number; z1: number } }).footprint;
    const wet = (x: number, z: number): boolean =>
      plan.fluidKind[(z - REGION.z0) * REGION.width + (x - REGION.x0)] === FluidKind.WATER;
    // Landward end dry, seaward end wet — the same contract the local search
    // enforces, now met next to a pond 60 blocks from the node's target.
    const dry = [rect.x0, rect.x1].some((x) => !wet(x, rect.z0) || !wet(x, rect.z1));
    expect(dry).toBe(true);
    expect((site as { reseated?: unknown }).reseated).toBeDefined();
  });

  it("holds a pinned prop in place rather than sailing it to the far pond", () => {
    const plan = farPondPlan();
    expect(
      planPropPlacement({
        prop: "longship",
        params: { at: { x: 10, z: 10 } },
        seed: seedOf("world.longship"),
        plan,
      }),
    ).toBeUndefined();
  });

  it("leaves a land prop where it was asked for", () => {
    const plan = plainPlan();
    // A land prop never reseats: dry ground is where the target is, and the
    // waterline is not a better answer for a cart.
    const site = planPropPlacement({
      prop: "cart",
      params: { zone: "northwest", jitter: 0 },
      seed: seedOf("world.cart"),
      plan,
    });
    expect((site as { reseated?: unknown }).reseated).toBeUndefined();
  });
});

describe("the prop pass", () => {
  it("emits blocks for every prop, and diagnoses one it does not know", () => {
    const plan = plainPlan({ x0: 40, z0: 40, x1: 80, z1: 80 });
    const jobs: PropJob[] = [
      { nodePath: "w.cart", prop: "cart", params: { at: { x: 4, z: 4 } }, seed: seedOf("w.cart") },
      { nodePath: "w.bad", prop: "canoe", params: {}, seed: seedOf("w.bad") },
    ];
    const pass = buildProps({ jobs, plan, stack });
    expect(pass.placed).toHaveLength(1);
    expect(pass.blocks.length).toBeGreaterThan(20);
    const bad = pass.diagnostics.find((d) => d.severity === "error");
    expect(bad?.message).toContain("canoe");
    for (const name of PROP_NAMES) expect(bad?.fix).toContain(name);
  });

  it("never places two props on the same ground", () => {
    const plan = plainPlan();
    const jobs: PropJob[] = [0, 1, 2, 3].map((i) => ({
      nodePath: `w.cart_${i}`,
      prop: "cart",
      params: { at: { x: 20, z: 20 }, yaw: 0 },
      seed: seedOf(`w.cart_${i}`),
    }));
    const pass = buildProps({ jobs, plan, stack });
    expect(pass.placed).toHaveLength(4);
    const cells = new Set<string>();
    for (const p of pass.placed) {
      for (let z = p.footprint.z0; z <= p.footprint.z1; z++) {
        for (let x = p.footprint.x0; x <= p.footprint.x1; x++) {
          expect(cells.has(`${x},${z}`)).toBe(false);
          cells.add(`${x},${z}`);
        }
      }
    }
  });

  it("emits the same blocks twice for the same seed", () => {
    const jobs: PropJob[] = [
      { nodePath: "w.gaz", prop: "gazebo", params: { zone: "center" }, seed: seedOf("w.gaz") },
    ];
    const a = buildProps({ jobs, plan: plainPlan(), stack });
    const b = buildProps({ jobs, plan: plainPlan(), stack });
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
  });
});

describe("prop fluid safety", () => {
  it("finds no leak in a fountain, and the plan stays stable", () => {
    const plan = plainPlan();
    const jobs: PropJob[] = [
      { nodePath: "w.fountain", prop: "fountain", params: { at: { x: 20, z: 20 } }, seed: seedOf("w.f") },
    ];
    const pass = buildProps({ jobs, plan, stack });
    const report = checkPropFluidSafety(pass.blocks, plan, stack);
    expect(report.waterBlocks).toBe(24);
    expect(report.leaks).toEqual([]);
    expect(checkFluidStability(plan).unstable).toBe(0);
  });

  it("catches a fountain whose rim has been breached", () => {
    const plan = plainPlan();
    const pass = buildProps({
      jobs: [
        { nodePath: "w.fountain", prop: "fountain", params: { at: { x: 20, z: 20 } }, seed: seedOf("w.f") },
      ],
      plan,
      stack,
    });
    // Knock one rim block out — the failure this checker exists to catch.
    const water = pass.blocks.find(
      (b) => stack.blockNameByStateId(b.stateId) === "water",
    ) as (typeof pass.blocks)[number];
    const kept = pass.blocks.filter(
      (b) => !(b.y === water.y && Math.abs(b.x - water.x) + Math.abs(b.z - water.z) === 1),
    );
    expect(checkPropFluidSafety(kept, plan, stack).leaks.length).toBeGreaterThan(0);
  });

  it("writes no water at all for a boat, and never leaves a hole in the lake", () => {
    const plan = plainPlan({ x0: 30, z0: 30, x1: 60, z1: 60 });
    const before = checkFluidStability(plan).unstable;
    const pass = buildProps({
      jobs: [
        { nodePath: "w.boat", prop: "fishing_sloop", params: { at: { x: 40, z: 40 } }, seed: seedOf("w.b") },
        { nodePath: "w.row", prop: "rowboat", params: { at: { x: 50, z: 50 } }, seed: seedOf("w.r") },
      ],
      plan,
      stack,
    });
    expect(pass.placed).toHaveLength(2);
    const report = checkPropFluidSafety(pass.blocks, plan, stack);
    expect(report.waterBlocks).toBe(0);
    expect(report.leaks).toEqual([]);
    // The plan is untouched by the boats — they are blocks over it — so the
    // column-plan validator is as happy as it was before.
    expect(checkFluidStability(plan).unstable).toBe(before);
  });

  it("covers every hull column at and below the water line", () => {
    // The hull course and the deck occupy the same columns, so no water column
    // is left with a solid deck over an air pocket.
    const result = generateProp({ prop: "fishing_sloop", seed: seedOf("w.b") });
    const at = (y: number): Set<string> =>
      new Set(result.ops.filter((o) => o.y === y).map((o) => `${o.x},${o.z}`));
    expect(at(0)).toEqual(at(-1));
  });
});

describe("the rail-state pass", () => {
  const railState = (s: PrismarineStack): number =>
    s.blockStateOf("rail", { shape: "north_south", waterlogged: "false" }) as number;

  function chunks(): Map<string, EmitChunk> {
    return new Map([
      ["0,0", stack.createChunk()],
      ["1,0", stack.createChunk()],
      ["0,1", stack.createChunk()],
    ]);
  }

  function put(map: Map<string, EmitChunk>, x: number, y: number, z: number, state: number): void {
    (map.get(`${x >> 4},${z >> 4}`) as EmitChunk).setStateId(x & 15, y, z & 15, state);
  }

  function shapeAt(map: Map<string, EmitChunk>, x: number, y: number, z: number): string {
    const chunk = map.get(`${x >> 4},${z >> 4}`) as EmitChunk;
    return stack.blockStateProps(chunk.getBlockStateId(x & 15, y, z & 15))?.props["shape"] as string;
  }

  it("classifies the rail families", () => {
    expect(connectiveKindOf("rail")).toBe("rail");
    expect(connectiveKindOf("powered_rail")).toBe("straight_rail");
    expect(connectiveKindOf("detector_rail")).toBe("straight_rail");
    expect(connectiveKindOf("oak_planks")).toBeUndefined();
  });

  it("derives a straight run, and does it across a chunk boundary", () => {
    const map = chunks();
    const cells: { x: number; y: number; z: number }[] = [];
    for (let x = 12; x <= 20; x++) {
      put(map, x, 70, 5, railState(stack));
      cells.push({ x, y: 70, z: 5 });
    }
    applyConnectionStates(map, cells, stack);
    for (let x = 12; x <= 20; x++) expect(shapeAt(map, x, 70, 5), `x=${x}`).toBe("east_west");
  });

  it("derives a north-south run, and a lone rail's default", () => {
    const map = chunks();
    const cells: { x: number; y: number; z: number }[] = [];
    for (let z = 5; z <= 8; z++) {
      put(map, 5, 70, z, railState(stack));
      cells.push({ x: 5, y: 70, z });
    }
    put(map, 9, 70, 9, railState(stack));
    cells.push({ x: 9, y: 70, z: 9 });
    applyConnectionStates(map, cells, stack);
    for (let z = 5; z <= 8; z++) expect(shapeAt(map, 5, 70, z)).toBe("north_south");
    expect(shapeAt(map, 9, 70, 9)).toBe("north_south");
  });

  it("derives the curve at a corner", () => {
    const map = chunks();
    // An L: west arm along z = 5, then south from (7,5) to (7,7).
    const cells: { x: number; y: number; z: number }[] = [];
    for (const [x, z] of [
      [5, 5],
      [6, 5],
      [7, 5],
      [7, 6],
      [7, 7],
    ] as const) {
      put(map, x, 70, z, railState(stack));
      cells.push({ x, y: 70, z });
    }
    applyConnectionStates(map, cells, stack);
    expect(shapeAt(map, 6, 70, 5)).toBe("east_west");
    expect(shapeAt(map, 7, 70, 5)).toBe("south_west");
    expect(shapeAt(map, 7, 70, 6)).toBe("north_south");
  });

  it("derives ascending shapes on a grade", () => {
    const map = chunks();
    // A staircase east: (5,70) (6,71) (7,72).
    const cells: { x: number; y: number; z: number }[] = [];
    for (const [x, y] of [
      [5, 70],
      [6, 71],
      [7, 72],
    ] as const) {
      put(map, x, y, 5, railState(stack));
      cells.push({ x, y, z: 5 });
    }
    applyConnectionStates(map, cells, stack);
    expect(shapeAt(map, 5, 70, 5)).toBe("ascending_east");
    expect(shapeAt(map, 6, 71, 5)).toBe("ascending_east");
    // The top of the flight has a lower neighbour west and nothing east, so it
    // is a plain straight — there is nothing to climb to.
    expect(shapeAt(map, 7, 72, 5)).toBe("east_west");
  });

  it("keeps a straight-only rail straight where the flexible one would curve", () => {
    const map = chunks();
    const powered = stack.blockStateOf("powered_rail", {
      powered: "false",
      shape: "north_south",
      waterlogged: "false",
    }) as number;
    put(map, 5, 70, 5, powered);
    put(map, 4, 70, 5, railState(stack));
    put(map, 5, 70, 6, railState(stack));
    applyConnectionStates(
      map,
      [
        { x: 5, y: 70, z: 5 },
        { x: 4, y: 70, z: 5 },
        { x: 5, y: 70, z: 6 },
      ],
      stack,
    );
    expect(shapeAt(map, 5, 70, 5)).toBe("east_west");
  });

  it("is idempotent, and leaves a rail with no neighbours alone", () => {
    const map = chunks();
    put(map, 5, 70, 5, railState(stack));
    const cells = [{ x: 5, y: 70, z: 5 }];
    expect(applyConnectionStates(map, cells, stack).examined).toBe(1);
    expect(applyConnectionStates(map, cells, stack).rewritten).toBe(0);
  });

  it("computes the shape from the neighbourhood alone", () => {
    // The pure function, with no world at all: the pass is a thin wrapper on
    // it, so this is where the truth table lives.
    const none = () => false;
    expect(railShape({ x: 0, y: 0, z: 0 }, true, none)).toBe("north_south");
    const eastOnly = (dx: number, dy: number) => dx === 1 && dy === 0;
    expect(railShape({ x: 0, y: 0, z: 0 }, true, eastOnly)).toBe("east_west");
    const eastUp = (dx: number, dy: number) => dx === 1 && dy === 1;
    expect(railShape({ x: 0, y: 0, z: 0 }, true, eastUp)).toBe("ascending_east");
    const northEast = (dx: number, dy: number, dz: number) =>
      dy === 0 && ((dx === 1 && dz === 0) || (dx === 0 && dz === -1));
    expect(railShape({ x: 0, y: 0, z: 0 }, true, northEast)).toBe("north_east");
    expect(railShape({ x: 0, y: 0, z: 0 }, false, northEast)).toBe("east_west");
  });
});

describe("the prop exhibits", () => {
  it("shows every prop in the catalog at least once, across both grids", () => {
    // The transport families are big enough to need a grid of their own — see
    // `exhibits/vehicles.ts` — so the claim that every prop is exhibited is a
    // claim about the union of the two.
    const shown = new Set([
      ...planPropExhibits().exhibits.map((e) => e.prop),
      ...planVehicleExhibits().exhibits.map((e) => e.prop),
    ]);
    for (const name of PROP_NAMES) expect(shown.has(name), name).toBe(true);
  });

  it("lays cells out without overlapping, row by row", () => {
    const grid = planPropExhibits();
    for (const row of grid.rows) {
      for (let i = 1; i < row.cells.length; i++) {
        const prev = row.cells[i - 1] as (typeof row.cells)[number];
        const cell = row.cells[i] as (typeof row.cells)[number];
        expect(cell.x).toBeGreaterThan(prev.x);
        expect(cell.z).toBe(prev.z);
      }
    }
  });

  it("digs a stable pond for the harbour row and places every boat in it", () => {
    const plan = devColumnPlan(PROP_TEST_RECT, stack);
    const result = buildPropExhibits(plan, stack, 20260728n, 0, 0);
    expect(result.pondColumns).toBeGreaterThan(0);
    expect(checkFluidStability(plan).unstable).toBe(0);
    expect(checkPropFluidSafety(result.blocks, plan, stack).leaks).toEqual([]);
    const harbour = result.grid.rows.find((r) => r.row === "harbour");
    expect(harbour?.water).toBe(true);
    const placedIds = new Set(result.placed.map((p) => p.nodePath));
    for (const cell of harbour?.cells ?? []) {
      expect(placedIds.has(`dev.props.harbour.${cell.id}`), cell.id).toBe(true);
    }
  });

  it("places every exhibit, with no diagnostics, deterministically", () => {
    const build = (): ReturnType<typeof buildPropExhibits> =>
      buildPropExhibits(
        devColumnPlan(PROP_TEST_RECT, stack),
        stack,
        20260728n,
        0,
        0,
      );
    const first = build();
    expect(first.diagnostics).toEqual([]);
    expect(first.placed).toHaveLength(first.grid.exhibits.length);
    expect(JSON.stringify(build().blocks)).toBe(JSON.stringify(first.blocks));
  });

  it("gives the rail exhibits shapes the pass can resolve in a real chunk map", () => {
    const plan = devColumnPlan(PROP_TEST_RECT, stack);
    const result = buildPropExhibits(plan, stack, 20260728n, 0, 0);
    const map = new Map<string, EmitChunk>();
    const chunkAt = (x: number, z: number): EmitChunk => {
      const key = `${x >> 4},${z >> 4}`;
      let chunk = map.get(key);
      if (chunk === undefined) {
        chunk = stack.createChunk();
        map.set(key, chunk);
      }
      return chunk;
    };
    for (const block of result.blocks) {
      chunkAt(block.x, block.z).setStateId(block.x & 15, block.y, block.z & 15, block.stateId);
    }
    applyConnectionStates(map, result.blocks, stack);

    const shapes = new Set<string>();
    for (const block of result.blocks) {
      if (stack.blockNameByStateId(block.stateId) !== "rail") continue;
      const chunk = map.get(`${block.x >> 4},${block.z >> 4}`) as EmitChunk;
      const state = chunk.getBlockStateId(block.x & 15, block.y, block.z & 15);
      shapes.add(stack.blockStateProps(state)?.props["shape"] as string);
    }
    // The grid shows a straight line, a curve and a grade, so the pass has to
    // have produced all three families.
    expect(shapes.has("east_west")).toBe(true);
    expect([...shapes].some((s) => s.startsWith("ascending_"))).toBe(true);
    expect([...shapes].some((s) => ["south_west", "south_east", "north_west", "north_east"].includes(s))).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* a big prop on ground that is gently rolling rather than flat                */
/* -------------------------------------------------------------------------- */

describe("relief tolerance scales with the footprint", () => {
  /** The dev plain under a gentle slope: one block every `rise` blocks east. */
  function rollingPlan(rise: number): ColumnPlan {
    const plan = plainPlan();
    for (let z = 0; z < REGION.depth; z++) {
      for (let x = 0; x < REGION.width; x++) {
        const idx = z * REGION.width + x;
        // About one block per fifteen — a slope you would walk up without
        // noticing, and far too rough for a flat-to-one-block rule.
        plan.ground[idx] = DEV_GROUND_Y + Math.floor(x / rise);
        plan.fluidTop[idx] = plan.ground[idx] as number;
      }
    }
    return plan;
  }

  it("keeps a small prop on the old one-block rule", () => {
    expect(propReliefTolerance({ x0: 0, z0: 0, x1: 4, z1: 4 })).toBe(PROP_MAX_RELIEF);
    expect(propReliefTolerance({ x0: 0, z0: 0, x1: 11, z1: 2 })).toBe(PROP_MAX_RELIEF);
  });

  it("gives a long footprint one more block of tolerance every twelve", () => {
    expect(propReliefTolerance({ x0: 0, z0: 0, x1: 23, z1: 14 })).toBe(2);
    expect(propReliefTolerance({ x0: 0, z0: 0, x1: 33, z1: 14 })).toBe(3);
  });

  /**
   * The drydock, which is what found this.
   *
   * 34 × 15 on land: no natural outdoor site anywhere is level to one block
   * across it, so the placer rejected every column in its search radius and the
   * compile reported `LOAM-E170 CANNOT_FIT` with a "flatten the ground" hint no
   * author could act on.
   */
  it("places a drydock on gentle natural terrain, and levels what it stands on", () => {
    // One block in sixteen: gentler than most natural ground, and still two
    // blocks of relief across a 34-block cradle — which the old flat-to-one
    // rule rejected everywhere in the search radius.
    const plan = rollingPlan(16);
    const job: PropJob = {
      nodePath: "world.yard",
      prop: "drydock",
      // Yaw pinned so the cradle lies along the slope rather than across it.
      params: { zone: "center", yaw: 0 },
      seed: seedOf("world.yard"),
    };
    const result = buildProps({ jobs: [job], plan, stack });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.placed).toHaveLength(1);

    const { footprint } = result.placed[0] as { footprint: { x0: number; z0: number; x1: number; z1: number } };
    // Levelled: whatever the yaw came out as, the ground the cradle stands on
    // is now flat to within the small-prop rule.
    let lo = Infinity;
    let hi = -Infinity;
    for (let z = footprint.z0; z <= footprint.z1; z++) {
      for (let x = footprint.x0; x <= footprint.x1; x++) {
        const g = plan.ground[(z - REGION.z0) * REGION.width + (x - REGION.x0)] as number;
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
      }
    }
    expect(hi - lo).toBeLessThanOrEqual(PROP_MAX_RELIEF);
  });

  it("lays no pad at all for a site inside the small-prop tolerance", () => {
    const plan = plainPlan();
    const rect = { x0: 10, z0: 10, x1: 13, z1: 13 };
    const base = groundBase(plan, rect) as number;
    expect(levelPropPad(plan, rect, base)).toEqual([]);
  });
});
