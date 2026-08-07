/**
 * Two dressing-audit defects, at the geometry that causes them.
 *
 * Both were diagnosed on 2026-08-07 against the hillside fixtures, and both are
 * about a flight's *relationship to the ground beside it* rather than about the
 * flight itself — which is why neither could be seen by a test that walks one
 * flight in isolation, and why the tests below are written from the defect
 * outward instead of from the implementation inward:
 *
 * 1. **A slab band ending over a void.** `dressStreetStairs` lays `type: top`
 *    slabs *into* the flight's own top course, so the lower half of the cell is
 *    empty. Where the band ends at a platform edge and the column beside it is
 *    two or more blocks lower, that empty half opens sideways and the tread
 *    reads as cantilevered over bare earth. Measured at (101, 110, 69).
 * 2. **A stair-head plinth.** `need[k] ≥ ground[k] + 1` is a course of masonry
 *    laid on the surface of the hill, so a flight crossing ground that is flat
 *    across its own width stands exactly one block proud of the field on both
 *    sides — the dressing audit's `stepPlinth`, four and five columns of it on
 *    the steep fixture. `floorAtGrade` lays the flight *into* the top course
 *    instead, and the two tests below pin the two halves of that: the levels
 *    come down, and no riser gets taller for it.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  dressStreetStairs,
  streetStairGeometry,
  streetStairLevels,
} from "../src/structures/street-stairs.js";
import { synthesizeTreads } from "../src/structures/sweep.js";
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
      caveAir: 0,
    },
  } as unknown as ColumnPlan;
}

describe("a flight's slab band never ends over a void", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  /**
   * A flat platform with a cliff along one side, which is the shape the defect
   * needs: the flight's band runs *along* the edge, so its outermost tread
   * columns look sideways into a drop rather than at the next tread down.
   *
   * `drop` is how far the ground falls beyond the edge — one block is a kerb
   * and is meant to keep its slab, two is the defect.
   */
  function dress(drop: number) {
    const plan = planOf(stack, (_x, z) => (z >= 22 ? 70 - drop : 70));
    const n = SIZE * SIZE;
    const path = Array.from({ length: 16 }, (_, i) => ({ x: 8 + i, z: 20 }));
    // The verge on the low side belongs to somebody else — a plaza, a lot — so
    // the flight's band *ends* at z = 21 and its outermost tread looks straight
    // out over the drop. That is the geometry the defect needs; a flight whose
    // own verge is there levels the verge with it and never shows an underside.
    const paved = new Uint8Array(n);
    for (let x = 0; x < SIZE; x++) paved[at(x, 22)] = 1;
    const geometry = streetStairGeometry({
      region: REGION,
      plan,
      blocked: new Uint8Array(n),
      paved,
      water: new Uint8Array(n),
      path,
      width: 3,
    });
    expect(geometry.refusedBecause).toBeUndefined();
    const levels = streetStairLevels(geometry, (x, z) => plan.ground[at(x, z)] as number);
    // The driver commits the flight's levels before the dressing runs.
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
      job: 7,
    });
    const slabs = new Set(
      result.blocks
        .filter((b) => (stack.blockNameByStateId(b.stateId) ?? "").endsWith("_slab"))
        .map((b) => `${b.x},${b.z}`),
    );
    // The tread columns nearest the edge, which is where the band ends.
    const edge = geometry.columns.filter((c) => c.role === "tread" && c.z === 21);
    expect(edge.length).toBeGreaterThan(0);
    return { slabs, edge, blocks: result.blocks };
  }

  it("closes a band end that would hang over a two-block drop", () => {
    const { slabs, edge } = dress(2);
    for (const column of edge) expect(slabs.has(`${column.x},${column.z}`)).toBe(false);
  });

  it("keeps the half-tread where the step beside it is the ordinary one", () => {
    // The counter-test, and the one that matters: the cure for a floating slab
    // must not be "stop laying slabs". A one-block step down off the edge of a
    // stair is what a stair looks like, and the slabs stay.
    const { slabs, edge } = dress(1);
    expect(edge.some((column) => slabs.has(`${column.x},${column.z}`))).toBe(true);
  });
});

describe("a flight laid at grade, not on a plinth", () => {
  /** Flat ground, in the stand units `synthesizeTreads` takes. */
  const flat = Array.from({ length: 12 }, () => 70);

  it("without the option, a flight rides one course above its own ground", () => {
    const run = synthesizeTreads(flat);
    expect(run.levels).not.toBeNull();
    // The defect, stated as the behaviour it comes from: every column one proud.
    expect(run.levels).toEqual(flat.map(() => 71));
  });

  it("with it, the interior comes down to grade", () => {
    const run = synthesizeTreads(flat, { floorAtGrade: true });
    expect(run.levels).not.toBeNull();
    const levels = run.levels as readonly number[];
    // The endpoints are landings — the columns another segment owns, or the
    // ground the flight starts and finishes on — and they are never cut.
    expect(levels[0]).toBe(71);
    expect(levels[levels.length - 1]).toBe(71);
    for (let k = 1; k < levels.length - 1; k++) expect(levels[k]).toBe(70);
  });

  it("never buys the drop with a taller step", () => {
    // The ratified principle, as an assertion: a connection earns its drop with
    // run. Whatever the ease does to the levels, no riser may exceed the grade.
    for (const ground of [
      flat,
      [70, 70, 70, 71, 72, 73, 74, 74, 74, 74],
      [80, 79, 79, 78, 77, 77, 76, 75, 75, 75],
    ]) {
      const run = synthesizeTreads(ground, { floorAtGrade: true });
      expect(run.levels).not.toBeNull();
      const levels = run.levels as readonly number[];
      for (let k = 1; k < levels.length; k++) {
        expect(Math.abs((levels[k] as number) - (levels[k - 1] as number))).toBeLessThanOrEqual(1);
      }
      // And it is still a flight standing on the hill rather than a trench:
      // one course of cut, never more.
      for (const [k, level] of levels.entries()) {
        expect(level).toBeGreaterThanOrEqual((ground[k] as number) - 1);
      }
    }
  });

  it("is bit-for-bit the old function when the option is absent", () => {
    for (const ground of [flat, [70, 71, 73, 74, 74, 78, 79, 80, 80, 81]]) {
      expect(synthesizeTreads(ground).levels).toEqual(
        synthesizeTreads(ground, { floorAtGrade: false }).levels,
      );
    }
  });
});
