/**
 * **The relief redesign** (Kai's ratified choice, 2026-08-07): a flight reads as
 * a staircase because of its *shape*, so every riser is a real stair block and
 * every landing is dressed.
 *
 * The defect these tests are written from was measured on
 * `examples/site-plan-hillside-steep.loam.json`: 1,409 flight columns, all of
 * them paved, none of them on soil — and **one stair block in the entire town**.
 * The tread law read a riser only *ahead* of the walker, and every flight on
 * that hill leaves its street going *down*, so no column ever qualified. The
 * paving was all there; the staircase was camouflaged.
 *
 * Two halves, and they are tested as two:
 *
 * 1. the law ({@link treadPlan}'s `relief`) now names a descending riser
 *    `"fall"`, the mirror of `"stair"`;
 * 2. the dressing lays that as the same stair block with its `facing`
 *    **reversed**, because a stair's facing is the direction of the *rise* and
 *    not the direction of travel. The two coincide going up and are opposite
 *    coming down, which is precisely the bug — the same class the stoop fix
 *    found in `junction-steps.ts` — so the test asserts against the ground
 *    either side of each stair rather than against the code that placed it.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { treadPlan, treadSurfaces, worstRise } from "../src/structures/profiles.js";
import {
  dressStreetStairs,
  streetStairGeometry,
  streetStairLevels
} from "../src/structures/street-stairs.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const SIZE = 40;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** A dry plan of stone over stone — no soil, so no lip rule fires. */
function planOf(stack: PrismarineStack, height: (x: number, z: number) => number): ColumnPlan {
  const n = SIZE * SIZE;
  const stone = stack.blockByName("minecraft:stone")?.stateId ?? 0;
  const ground = new Int32Array(n);
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) ground[at(x, z)] = height(x, z);
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n).fill(stone),
    subsurface: new Int32Array(n).fill(stone),
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

describe("the tread law reads a riser in both directions", () => {
  const relief = { relief: true } as const;

  it("names every descending riser a fall and every ascending one a stair", () => {
    const down = [80, 79, 78, 77, 76];
    const up = [76, 77, 78, 79, 80];
    // The head column has nothing behind it, so it is the flight's landing and
    // not a riser — every column after it is one.
    expect(treadPlan(down, down, relief)).toEqual(["slab", "fall", "fall", "fall", "fall"]);
    expect(treadPlan(up, up, relief)).toEqual(["stair", "stair", "stair", "stair", "slab"]);
  });

  it("is the defect, stated: the old law saw none of the descending ones", () => {
    const down = [80, 79, 78, 77, 76];
    // Every column of a descending flight came out flat — no stair, anywhere,
    // which is the one-stair town as four lines of arithmetic.
    expect(treadPlan(down, down).filter((s) => s === "stair")).toEqual([]);
  });

  it("dresses the landings a flight laid at grade used to leave bare", () => {
    // `floorAtGrade` lays a flight *into* the top course of the hill, so a flat
    // column's `level − ground` is nought and the old law read that as "no
    // masonry here, leave it alone" — 480 columns of it on the steep fixture.
    const flat = [70, 70, 70, 70];
    expect(treadPlan(flat, flat)).toEqual(["landing", "landing", "landing", "landing"]);
    expect(treadPlan(flat, flat, relief)).toEqual(["slab", "slab", "slab", "slab"]);
  });

  it("still moves no level and still climbs", () => {
    // The whole law is decoration over levels the engine chose (DESIGN §3 rule
    // 2). The proof obligation is unchanged: no transition the mix produces is
    // worse than the all-full-blocks construction it replaces.
    for (const levels of [
      [80, 79, 78, 77, 76],
      [70, 71, 72, 72, 72, 71, 70, 70, 71],
      [70, 70, 71, 71, 70, 69, 69, 70],
      [64, 65, 65, 65, 64, 64, 63, 62, 62]
    ]) {
      const shapes = treadPlan(levels, levels, relief);
      expect(worstRise(levels, shapes)).toBeLessThanOrEqual(1);
      // …and never below the column's own ground: every dressing sits in the
      // top course, so a walker's foot is never further than half a block from
      // the level the engine committed.
      for (const [k, s] of treadSurfaces(levels, shapes).entries()) {
        expect(s.arrive).toBeGreaterThanOrEqual((levels[k] as number) - 0.5);
        expect(s.depart).toBeGreaterThanOrEqual((levels[k] as number) - 0.5);
      }
    }
  });

  it("leaves the law the set-piece stair reads exactly as it was", () => {
    for (const ground of [
      [70, 70, 70, 71, 72, 73, 74, 74],
      [80, 79, 79, 78, 77, 77, 76, 75]
    ]) {
      const need = ground.map((g) => g + 1);
      expect(treadPlan(need, ground)).toEqual(
        // The old three rules, restated here so a change to them fails this
        // test rather than silently re-dressing `structures/setpieces.ts`.
        need.map((level, k) => {
          const ahead = k + 1 < need.length ? (need[k + 1] as number) - level : 0;
          const behind = k > 0 ? level - (need[k - 1] as number) : 1;
          return ahead >= 1 ? "stair" : behind >= 1 ? "landing" : "slab";
        }),
      );
    }
  });
});

describe("a descending flight is dressed as stairs facing the rise", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  /** A flight walked in +x down a bank that falls one block per column. */
  function dress(fall: number) {
    const plan = planOf(stack, (x) => 90 - fall * x);
    const n = SIZE * SIZE;
    const path = Array.from({ length: 16 }, (_, i) => ({ x: 8 + i, z: 20 }));
    const geometry = streetStairGeometry({
      region: REGION,
      plan,
      blocked: new Uint8Array(n),
      paved: new Uint8Array(n),
      water: new Uint8Array(n),
      path,
      width: 3
    });
    expect(geometry.refusedBecause).toBeUndefined();
    const levels = streetStairLevels(geometry, (x, z) => plan.ground[at(x, z)] as number);
    expect(levels.refusedBecause).toBeUndefined();
    const owner = new Int32Array(n).fill(-1);
    for (const column of geometry.columns) {
      owner[column.idx] = 7;
      plan.ground[column.idx] = (levels.levels[column.k] as number) - 1;
    }
    const result = dressStreetStairs(geometry, levels, {
      region: REGION,
      plan,
      road: new Uint8Array(n),
      roadY: new Int32Array(n),
      states: { step: 1, subsurface: 1 },
      stack,
      owner,
      job: 7
    });
    const named = result.blocks.map((b) => ({
      ...b,
      name: stack.blockNameByStateId(b.stateId) ?? "",
      props: stack.blockStateProps(b.stateId)?.props ?? {}
    }));
    return { levels, geometry, blocks: named, plan };
  }

  it("builds a stair at every riser, where it used to build none", () => {
    const { blocks, geometry } = dress(1);
    const dressed = blocks.filter((b) => /_slab$|_stairs$/.test(b.name));
    const stairs = blocks.filter((b) => b.name.endsWith("_stairs"));
    const treads = geometry.columns.filter((c) => c.role === "tread");
    // Every tread column is dressed, and every one of them but the flight's own
    // head — which has nothing behind it to descend from — is a riser and so a
    // stair. The old law built **none** of these.
    expect(dressed.length).toBe(treads.length);
    const heads = treads.filter((c) => c.k === 0).length;
    expect(stairs.length).toBe(treads.length - heads);
  });

  it("faces them **up** the flight, not along it", () => {
    // The ground falls with +x, so the rise behind a walker heading +x is to the
    // **west**. A stair facing east would be the travel-direction bug: its tall
    // half would stand under thin air on the downhill side.
    const { blocks } = dress(1);
    const stairs = blocks.filter((b) => b.name.endsWith("_stairs"));
    expect(stairs.length).toBeGreaterThan(0);
    for (const stair of stairs) expect(stair.props["facing"]).toBe("west");
  });

  it("and the other way up the same bank, which is the mirror", () => {
    // Same hill, path laid the other way: now the walker climbs, the riser is
    // ahead, and the stair faces the way it always did.
    const plan = planOf(stack, (x) => 74 + x);
    const n = SIZE * SIZE;
    const path = Array.from({ length: 16 }, (_, i) => ({ x: 8 + i, z: 20 }));
    const geometry = streetStairGeometry({
      region: REGION,
      plan,
      blocked: new Uint8Array(n),
      paved: new Uint8Array(n),
      water: new Uint8Array(n),
      path,
      width: 3
    });
    const levels = streetStairLevels(geometry, (x, z) => plan.ground[at(x, z)] as number);
    const owner = new Int32Array(n).fill(-1);
    for (const column of geometry.columns) {
      owner[column.idx] = 7;
      plan.ground[column.idx] = (levels.levels[column.k] as number) - 1;
    }
    const result = dressStreetStairs(geometry, levels, {
      region: REGION,
      plan,
      road: new Uint8Array(n),
      roadY: new Int32Array(n),
      states: { step: 1, subsurface: 1 },
      stack,
      owner,
      job: 7
    });
    const stairs = result.blocks
      .map((b) => ({ ...b, name: stack.blockNameByStateId(b.stateId) ?? "" }))
      .filter((b) => b.name.endsWith("_stairs"));
    expect(stairs.length).toBeGreaterThan(0);
    for (const stair of stairs) {
      expect(stack.blockStateProps(stair.stateId)?.props["facing"]).toBe("east");
    }
  });

  it("dresses the flat treads of a level flight instead of leaving them bare", () => {
    const { blocks, geometry } = dress(0);
    const slabs = blocks.filter((b) => b.name.endsWith("_slab"));
    const dressed = blocks.filter((b) => /_slab$|_stairs$/.test(b.name));
    const treads = geometry.columns.filter((c) => c.role === "tread").length;
    // Stone either side, so nothing is vetoed by the lip rules: every tread
    // column of a flat flight now reads as a laid course, where the old law
    // dressed none of them — `floorAtGrade` cuts the interior to grade, and
    // `level − ground` of nought used to mean "leave it alone".
    expect(dressed.length).toBe(treads);
    // Two of those columns are the ease back up to the flight's own ends, which
    // is a riser apiece and so a stair; the rest of the run is landing.
    expect(slabs.length).toBe(treads - 6);
  });

  it("never dresses a verge, which is what the balustrade stands on", () => {
    const { blocks, geometry } = dress(1);
    const verges = new Set(
      geometry.columns.filter((c) => c.role === "verge").map((c) => `${c.x},${c.z}`),
    );
    for (const block of blocks) {
      if (!/_slab$|_stairs$/.test(block.name)) continue;
      expect(verges.has(`${block.x},${block.z}`)).toBe(false);
    }
  });
});
