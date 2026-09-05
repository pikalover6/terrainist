/**
 * **A balustrade is a course** — `structures/street-stairs.ts`'s
 * `streetStairRail`.
 *
 * The rail used to be a per-column decision: emit a wall wherever the finished
 * ground is exactly one below the level the flight asked for, skip otherwise.
 * On the hillside prototype 234 of 1,316 parapet columns failed that test,
 * scattered along the flights, and each failure punched a hole in a run a
 * player reads as one object. What shipped was cobblestone wall blocks standing
 * apart on the landings — the "rubble beside the lantern" the walk of
 * 2026-08-06 photographed, and the same lattice lesson as `faceCuts`: *a course
 * on a lattice is a row of posts unless something makes it a course.*
 *
 * These tests are about the course. The fixture is one straight flight whose
 * ground is deliberately not a clean ramp, so the eligibility test really does
 * fail on some columns.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import {
  STREET_STAIR_MIN_RAIL_RUN,
  streetStairGeometry,
  streetStairLevels,
  streetStairRail
} from "../src/structures/street-stairs.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const SIZE = 40;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** A dry plan of grass over dirt whose ground is whatever `height` says. */
function planOf(stack: PrismarineStack, height: (x: number, z: number) => number): ColumnPlan {
  const n = SIZE * SIZE;
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  const ground = new Int32Array(n);
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) ground[at(x, z)] = height(x, z);
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n).fill(grass),
    subsurface: new Int32Array(n).fill(dirt),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 62,
    stoneSeed: 1,
    states: {
      bedrock: 0,
      stone: 0,
      deepslate: 0,
      water: stack.blockByName("minecraft:water")?.stateId ?? 0,
      lava: 0,
      snowLayer: 0,
      caveAir: 0
    }
  } as unknown as ColumnPlan;
}

describe("streetStairRail builds a course, not a row of posts", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  /** One straight flight up a bank, laid and levelled, ready for its rail. */
  function flight(plan: ColumnPlan) {
    const path = Array.from({ length: 24 }, (_, i) => ({ x: 8 + i, z: 20 }));
    const n = SIZE * SIZE;
    const geometry = streetStairGeometry({
      region: REGION,
      plan,
      blocked: new Uint8Array(n),
      paved: new Uint8Array(n),
      water: new Uint8Array(n),
      path,
      width: 5
    });
    expect(geometry.refusedBecause).toBeUndefined();
    const levels = streetStairLevels(geometry, (x, z) => plan.ground[at(x, z)] as number);
    expect(levels.levels.length).toBeGreaterThan(0);
    return { geometry, levels };
  }

  /**
   * The rail's wall blocks, grouped into 4-connected runs along one side.
   *
   * A run is what a player sees as one balustrade; a run of one or two is what
   * they see as rubble.
   */
  function runsOf(blocks: readonly { x: number; y: number; z: number }[]): number[] {
    const columns = new Set(blocks.map((b) => `${b.x},${b.z}`));
    const seen = new Set<string>();
    const sizes: number[] = [];
    for (const key of [...columns].sort()) {
      if (seen.has(key)) continue;
      seen.add(key);
      const queue = [key];
      let size = 0;
      for (let head = 0; head < queue.length; head++) {
        const [x, z] = (queue[head] as string).split(",").map(Number) as [number, number];
        size++;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ] as const) {
          const n = `${x + dx},${z + dz}`;
          if (!columns.has(n) || seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      sizes.push(size);
    }
    return sizes;
  }

  /**
   * The pipeline's own state: the driver has committed the flight's levels, so
   * every column the flight owns stands at `level − 1` before the rail is
   * emitted. `landing` is a stretch of centre indices some *other* segment owns
   * — a street crossing the flight — left at its own height, which is the one
   * thing the rail's eligibility test is there to notice.
   */
  function settle(
    plan: ColumnPlan,
    geometry: ReturnType<typeof flight>["geometry"],
    levels: ReturnType<typeof flight>["levels"],
    landing: (k: number) => boolean = () => false,
  ): void {
    for (const column of geometry.columns) {
      const level = levels.levels[column.k] as number;
      plan.ground[column.idx] = landing(column.k) ? 64 : level - 1;
    }
  }

  /** A clean bank: a block of rise per column of path. */
  const bank = (x: number): number => 64 + Math.min(Math.max(x - 8, 0), 23);

  /**
   * The same bank with a **drop off its north side**, four blocks down, one
   * column outside the flight's verge (the flight is width 5, so `verge` is 3
   * and the column that decides exposure is `z = 16`).
   *
   * Without it there is nothing to fall off and — since 2026-08-07 — nothing to
   * rail: the old fixture's flight ran across ground that was level with it on
   * both sides and got two full-length balustrades anyway, which is exactly the
   * defect the exposure gate removes.
   */
  const cliff = (x: number, z: number): number => (z <= 16 ? bank(x) - 4 : bank(x));

  it("builds no rail at all where there is nothing to fall off", () => {
    // The interior flight: it crosses ground that is level with it on both
    // sides, so both balustrades are walls in the middle of a walkable place.
    // Two of these crossing is the junction maze of screenshot 20.
    const plan = planOf(stack, (x) => bank(x));
    const { geometry, levels } = flight(plan);
    settle(plan, geometry, levels);
    const blocks = streetStairRail(geometry, levels, {
      region: REGION,
      plan,
      stack,
      lantern: stack.blockByName("minecraft:lantern")?.stateId ?? 0
    });
    expect(blocks).toEqual([]);
  });

  it("rails the exposed side and leaves the other side open", () => {
    const plan = planOf(stack, cliff);
    const { geometry, levels } = flight(plan);
    settle(plan, geometry, levels);
    const blocks = streetStairRail(geometry, levels, {
      region: REGION,
      plan,
      stack,
      lantern: stack.blockByName("minecraft:lantern")?.stateId ?? 0
    });
    expect(blocks.length).toBeGreaterThan(0);
    // `verge` is 3, so the two candidate lines are z = 17 and z = 23; only the
    // one above the drop carries anything.
    expect(new Set(blocks.map((b) => b.z))).toEqual(new Set([17]));
  });

  it("leaves no run shorter than the shortest rail worth building", () => {
    // A landing six columns wide — wider than the gap the rail is carried
    // across — three columns from the foot of the flight. The rail below it is
    // a two-column stub, and a two-column stub is two full-height posts.
    const plan = planOf(stack, cliff);
    const { geometry, levels } = flight(plan);
    settle(plan, geometry, levels, (k) => k >= 2 && k <= 7);
    const blocks = streetStairRail(geometry, levels, {
      region: REGION,
      plan,
      stack,
      lantern: stack.blockByName("minecraft:lantern")?.stateId ?? 0
    });
    expect(blocks.length).toBeGreaterThan(0);
    const runs = runsOf(blocks);
    expect(runs.length).toBeGreaterThan(0);
    for (const size of runs) expect(size).toBeGreaterThanOrEqual(STREET_STAIR_MIN_RAIL_RUN);
  });

  it("bridges a short landing rather than stopping at it", () => {
    // Three columns — inside `STREET_STAIR_RAIL_GAP_BRIDGE` — so the two halves
    // of each side's rail must come out as one run rather than as four stubs.
    const plan = planOf(stack, cliff);
    const { geometry, levels } = flight(plan);
    settle(plan, geometry, levels, (k) => k >= 10 && k <= 12);
    const blocks = streetStairRail(geometry, levels, {
      region: REGION,
      plan,
      stack,
      lantern: stack.blockByName("minecraft:lantern")?.stateId ?? 0
    });
    const runs = runsOf(blocks);
    // Two sides, one continuous run each — never a run per stretch of stair.
    expect(runs.length).toBeLessThanOrEqual(2);
    expect(runs.length).toBeGreaterThan(0);
    for (const size of runs) expect(size).toBeGreaterThanOrEqual(STREET_STAIR_MIN_RAIL_RUN);
  });

  it("stands nothing over a column the flight never levelled", () => {
    // Every emitted block sits on the ground actually under it: the rule that
    // kept the balustrade off a column a later segment had lowered, and it has
    // to survive the gap bridging.
    const plan = planOf(stack, cliff);
    const { geometry, levels } = flight(plan);
    settle(plan, geometry, levels, (k) => k >= 10 && k <= 12);
    const blocks = streetStairRail(geometry, levels, {
      region: REGION,
      plan,
      stack,
      lantern: stack.blockByName("minecraft:lantern")?.stateId ?? 0
    });
    const lowest = new Map<string, number>();
    for (const b of blocks) {
      const key = `${b.x},${b.z}`;
      lowest.set(key, Math.min(lowest.get(key) ?? Infinity, b.y));
    }
    for (const [key, y] of lowest) {
      const [x, z] = key.split(",").map(Number) as [number, number];
      expect(y, `column ${key}`).toBe(plan.ground[at(x, z)] as number);
    }
  });
});
