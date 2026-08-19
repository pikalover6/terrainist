/**
 * **A doorstep flight has to land somewhere** — `structures/doorsteps.ts`'s
 * `footLands`.
 *
 * Walked in Troy, 2026-08-19: stone-brick treads let into the raw face of a
 * terrace, climbing a bank and stopping against it. The cause is a seam that was
 * refused a retaining wall (LOAM-W411 — the drop is past `RETAIN_MAX`, so the
 * terrace grades raw), and a doorstep pass that measured only the *fall* from a
 * threshold and never asked what the bottom of the flight arrives at. A flight
 * whose foot stands on the brink of that face is masonry decorating a wall.
 *
 * So the pass proposes and then gates: the column a walker's foot lands in
 * coming off the bottom stair must be within {@link DOORSTEP_FOOT_STEP} of the
 * stair, and the column beyond *that* must be within the same step of it — the
 * two columns that tell a landing from a brink. Refused means nothing is built:
 * the door keeps a plain sill, and `traversal.unreachable` is left free to
 * report it, which is the honest outcome for a door with no way to it.
 *
 * Measured on `battery/candidates/p3-tie2/trojan_horse_in_troy.loam.json`:
 * 46 stepped doorsteps before, 42 after, 4 refused, and the physics traversal
 * rules stay at zero findings either way — the stairs were decorating faces the
 * lint had no complaint about. `examples/hillside-village.loam.json` is
 * byte-identical: its eleven flights all land on real ground.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { ResolvedPort } from "../src/layout/types.js";
import type { BuiltBuilding } from "../src/structures/buildings.js";
import { DOORSTEP_FOOT_STEP, buildDoorsteps } from "../src/structures/doorsteps.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";

const SIZE = 32;
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

/**
 * One house on the west side of the region with its door facing east.
 *
 * The footprint is small and the door sits on its east wall, so every column
 * the flight walks is unclaimed ground and the only thing under test is what
 * that ground does.
 */
function house(floorY: number): BuiltBuilding {
  return {
    nodePath: "world.house",
    footprint: { x0: 4, z0: 12, x1: 8, z1: 16 },
    floorY,
  } as unknown as BuiltBuilding;
}

/** The door in that east wall, at `floorY`, facing east. */
function door(floorY: number): ResolvedPort {
  return {
    nodePath: "world.house",
    ref: "door",
    type: "door",
    position: [8, floorY, 14],
    outwardNormal: [1, 0, 0],
  } as unknown as ResolvedPort;
}

describe("a doorstep flight is refused unless its foot lands on something walkable", () => {
  let stack: PrismarineStack;
  let palette: ReturnType<typeof resolvePalette>["palette"];
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
  });

  const run = (plan: ColumnPlan, floorY: number) =>
    buildDoorsteps({
      buildings: [house(floorY)],
      ports: [door(floorY)],
      plan,
      palette,
      stack,
    });

  it("builds on genuinely flat ground — the ordinary seam the pass exists for", () => {
    // Ground one block under the floor everywhere: a step out, no jump in.
    const plan = planOf(stack, () => 69);
    const result = run(plan, 70);
    expect(result.stepped).toBe(1);
    expect(result.refused).toBe(0);
    expect(result.blocks.length).toBeGreaterThan(0);
    // Every block it laid stands outside the house, on the approach.
    for (const b of result.blocks) expect(b.x).toBeGreaterThan(8);
  });

  it("builds on a declared paving plane — a lot or a street, level where it meets the foot", () => {
    // What makes a paved approach paved, as this pass can see it, is that the
    // plan's ground is a plane: the road pass has already cut it. A four-block
    // fall onto that plane is a flight of four stairs, and it is built.
    const plan = planOf(stack, (x) => (x > 8 ? 66 : 69));
    const result = run(plan, 70);
    expect(result.stepped).toBe(1);
    expect(result.refused).toBe(0);
    const stairs = result.blocks.filter((b) => b.x > 8);
    expect(stairs.length).toBeGreaterThan(0);
  });

  it("refuses a flight whose foot lands on a bank face", () => {
    // The LOAM-W411 shape: the lot is a bench at 69 and the terrace beyond it
    // grades raw, four blocks per column. The flight steps out onto the bench
    // and the next column is the face — nothing a walker can take.
    const plan = planOf(stack, (x) => (x <= 9 ? 69 : 69 - (x - 9) * 4));
    const result = run(plan, 70);
    expect(result.refused).toBe(1);
    expect(result.stepped).toBe(0);
    // Refused means *nothing shipped*: no masonry and no claim on the ground in
    // front of the door either, so a later ground treatment is free to have it.
    expect(result.blocks).toEqual([]);
    expect(result.touched.some((v) => v === 1)).toBe(false);
  });

  it("refuses a flight that dead-ends in mid-bank air", () => {
    // A door high on a face that keeps falling: the flight spends its reach
    // descending and its bottom stair is still metres above the ground ahead.
    const plan = planOf(stack, (x) => (x <= 8 ? 79 : 79 - (x - 8) * 3));
    const result = run(plan, 80);
    expect(result.refused).toBe(1);
    expect(result.blocks).toEqual([]);
  });

  it("takes the threshold boundary at DOORSTEP_FOOT_STEP", () => {
    expect(DOORSTEP_FOOT_STEP).toBe(1);
    // A one-block drop beyond the landing is a step, and the flight is built.
    const step = planOf(stack, (x) => (x <= 10 ? 69 : 69 - DOORSTEP_FOOT_STEP));
    expect(run(step, 70).stepped).toBe(1);
    // One block deeper is a fall, and the same flight is refused. Nothing else
    // about the two fixtures differs.
    const brink = planOf(stack, (x) => (x <= 10 ? 69 : 69 - DOORSTEP_FOOT_STEP - 1));
    expect(run(brink, 70).refused).toBe(1);
  });

  it("counts an edge and a neighbour's wall as arrival, not as a cliff", () => {
    // A flight that reaches the region edge or another building's footprint has
    // arrived at something; only a bank face is nowhere.
    const plan = planOf(stack, () => 69);
    const result = buildDoorsteps({
      buildings: [house(70), { ...house(70), nodePath: "world.neighbour", footprint: { x0: 10, z0: 12, x1: 14, z1: 16 } } as unknown as BuiltBuilding],
      ports: [door(70)],
      plan,
      palette,
      stack,
    });
    expect(result.stepped).toBe(1);
    expect(result.refused).toBe(0);
  });
});
