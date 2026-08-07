/**
 * **The cut face is a course** — `structures/retaining.ts`'s `faceCuts`.
 *
 * The finish that answers *"raw dirt faces jut out underneath stone slabs in
 * arbitrary patches"* used to ask one question of one column: *is your
 * 8-neighbour drop ≥ 2?* On a diagonal contour the set of columns that say yes
 * is itself a lattice staircase, so the masonry showed as isolated single
 * blocks, interrupted wherever the drop dipped to 1, and capped by grass because
 * nothing coped it. Walked 2026-08-06, and the third appearance of one lesson:
 * *a contour on a lattice is a staircase.*
 *
 * **What the course is made of changed on 2026-08-07, ratified by Kai after the
 * fortress-maze walk.** The construction below — members, 8-connected grouping,
 * drop-1 bridging, `thickenCourse` — is unchanged and is what these tests are
 * for. What it *paints* is not: a cut nobody walled is the hill's own rock, with
 * no coping course, because dressing every cut in the theme's revetment made the
 * whole hillside read as built stonework rather than as a town on a hill.
 *
 * These tests are about the course, not about the wall: every fixture below is
 * one platform covering the whole region with no seams declared, so the wall
 * path is inert and what is measured is the finish alone.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { groundLevelsOf } from "../src/layout/levels.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { buildRetainingWalls } from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

const SIZE = 32;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const BOUNDS = { x0: 0, z0: 0, x1: SIZE - 1, z1: SIZE - 1 } as const;
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
 * One platform over the whole region, and no seams.
 *
 * The whole region on one platform means `skirtSeams` finds no `NO_PLATFORM`
 * neighbour to skirt, so no wall is ever built and the only thing that writes
 * anything is the finish. That is the point: these are tests of the course.
 */
function district(carriageway = new Uint8Array(SIZE * SIZE)) {
  const benches: FormBench[] = [{ id: "all", runs: [{ ...BOUNDS }], level: 70 }];
  const levels = groundLevelsOf(BOUNDS, benches);
  return {
    nodePath: "world.quarter",
    bounds: BOUNDS,
    carriageway,
    sidewalk: new Uint8Array(SIZE * SIZE),
    levels: levels as NonNullable<typeof levels>,
    seams: [],
  };
}

describe("faceCuts builds a course, not a lattice of single blocks", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  const themed = (): ReturnType<typeof resolvePalette>["palette"] => {
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    return palette;
  };

  /** The columns the finish faced, as a set of indices. */
  function facedOf(plan: ColumnPlan, rock: number): Set<number> {
    const out = new Set<number>();
    for (let k = 0; k < SIZE * SIZE; k++) if (plan.subsurface[k] === rock) out.add(k);
    return out;
  }

  it("closes the diagonal: the faced course is 4-connected", () => {
    // A 45° edge. Per column, the set with an 8-neighbour drop ≥ 2 is itself a
    // staircase, and a staircase of single blocks is the artifact.
    const plan = planOf(stack, (x, z) => (x + z >= SIZE ? 70 : 66));
    const palette = themed();
    const result = buildRetainingWalls({
      districts: [district()],
      plan,
      palette,
      stack,
    });
    expect(result.walls).toBe(0);
    expect(result.revetted).toBeGreaterThan(0);
    const coped = facedOf(plan, palette.state("ground.stone"));
    expect(coped.size).toBeGreaterThan(10);
    // One 4-connected piece: flood the set orthogonally from its first column
    // and it must swallow the lot. A course a player can see through the gaps
    // in is the defect this replaced.
    const first = [...coped].sort((a, b) => a - b)[0] as number;
    const seen = new Set([first]);
    const queue = [first];
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head] as number;
      const x = k % SIZE;
      const z = Math.floor(k / SIZE);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
        const n = at(nx, nz);
        if (!coped.has(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    expect(seen.size).toBe(coped.size);
  });

  it("bridges a one-column dip in the contour rather than showing grass through it", () => {
    // A straight contour at x === 16 whose drop reads 3,3,1,3,3 along z. The
    // dip is one column: stone–grass–stone is a broken wall, and the column
    // touches two members of the same course, which is the signature.
    const plan = planOf(stack, (x, z) => {
      if (x >= 16) return 70;
      return z === 5 ? 69 : 67;
    });
    const palette = themed();
    const result = buildRetainingWalls({
      districts: [district()],
      plan,
      palette,
      stack,
    });
    expect(result.walls).toBe(0);
    // **Intent changed, ratified by Kai 2026-08-07 after the fortress-maze
    // walk**: an unwalled cut is the hill's own rock, not the theme's masonry,
    // and it carries no coping — every unwalled cut dressed in revetment plus a
    // coping course is what made the hillside read as built stonework.
    const rock = palette.state("ground.stone");
    const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
    const dip = at(16, 5);
    expect(plan.subsurface[dip]).toBe(rock);
    expect(plan.surface[dip]).toBe(grass);
    // …and its neighbours along the contour, so it really is one course.
    for (const z of [4, 5, 6]) expect(plan.subsurface[at(16, z)], `z=${z}`).toBe(rock);
  });

  it("leaves a kerb line alone — a one-block step is the street's course", () => {
    const plan = planOf(stack, (x) => (x >= 16 ? 70 : 69));
    const palette = themed();
    const before = { surface: Int32Array.from(plan.surface), sub: Int32Array.from(plan.subsurface) };
    const result = buildRetainingWalls({
      districts: [district()],
      plan,
      palette,
      stack,
    });
    expect(result.revetted).toBe(0);
    for (let k = 0; k < SIZE * SIZE; k++) {
      expect(plan.surface[k], `column ${k}`).toBe(before.surface[k]);
      expect(plan.subsurface[k], `column ${k}`).toBe(before.sub[k]);
    }
  });

  it("touches no surface at all — the cut is rock and the top is what it was", () => {
    // **Intent changed 2026-08-07.** The finish used to lay a coping course
    // along the top edge of every cut, withheld only over a street or a
    // footprint. It now writes nothing to any surface: the top of an unwalled
    // cut is grass, path or pavement, whatever the terrain and the surfacer
    // gave it, and only the *face* changes.
    const plan = planOf(stack, (x) => (x >= 16 ? 70 : 66));
    const carriageway = new Uint8Array(SIZE * SIZE);
    for (let z = 10; z <= 14; z++) for (let x = 16; x <= 20; x++) carriageway[at(x, z)] = 1;
    const palette = themed();
    const surfaceBefore = Int32Array.from(plan.surface);
    const result = buildRetainingWalls({
      districts: [district(carriageway)],
      plan,
      palette,
      stack,
    });
    expect(result.walls).toBe(0);
    expect(result.revetted).toBeGreaterThan(0);
    for (let k = 0; k < SIZE * SIZE; k++) {
      expect(plan.surface[k], `column ${k}`).toBe(surfaceBefore[k]);
    }
    // The face is still finished, and it is rock rather than the theme's
    // masonry — the hill's own material, the same symbol the terrain pass
    // writes under a cliff.
    expect(plan.subsurface[at(16, 0)]).toBe(palette.state("ground.stone"));
    expect(palette.state("ground.stone")).not.toBe(palette.state("ground.revetment"));
    expect(plan.soil[at(16, 0)] as number).toBeGreaterThanOrEqual(4);
  });

  it("leaves a column a wall stands on to the wall, and only deepens it", () => {
    // The wall path's own seam mask is what guards this, so the fixture is the
    // stepped quarter with a real wall on it: whatever the sweep claimed keeps
    // the sweep's material and gains nothing but depth.
    const top = 70;
    const plan = planOf(stack, (x) => (x >= 16 ? top : top - 4));
    const benches: FormBench[] = [
      { id: "low", runs: [{ x0: 0, z0: 0, x1: 15, z1: SIZE - 1 }], level: top - 4 },
      { id: "high", runs: [{ x0: 16, z0: 0, x1: SIZE - 1, z1: SIZE - 1 }], level: top },
    ];
    const levels = groundLevelsOf(BOUNDS, benches) as NonNullable<
      ReturnType<typeof groundLevelsOf>
    >;
    const palette = themed();
    const result = buildRetainingWalls({
      districts: [
        {
          nodePath: "world.quarter",
          bounds: BOUNDS,
          carriageway: new Uint8Array(SIZE * SIZE),
          sidewalk: new Uint8Array(SIZE * SIZE),
          levels,
          // The seam as `levelSeams` would derive it: the low side of the step.
          seams: [
            {
              above: 1,
              below: 0,
              cells: Array.from({ length: SIZE }, (_, z) => ({ x: 15, z })),
              drop: 4,
              treatment: "retaining" as const,
            },
          ],
        },
      ],
      plan,
      palette,
      stack,
    });
    expect(result.wallColumns).toBeGreaterThan(0);
    const coping = palette.state("ground.coping");
    const sidewalk = palette.state("street.sidewalk");
    // The face band's own materials are `ground.coping` over `ground.revetment`
    // — the same two the finish writes — so "the wall kept its material" cannot
    // be told from "the finish rewrote it" on the face. The **verge** band can:
    // it is `street.sidewalk`, one column back into the platform, and the
    // finish's coping guard is the only thing that leaves it standing.
    let verges = 0;
    for (let k = 0; k < SIZE * SIZE; k++) {
      if (result.seam[k] !== 1) continue;
      if (plan.surface[k] === sidewalk) {
        verges++;
        continue;
      }
      expect(plan.surface[k], `column ${k}`).toBe(coping);
      // The body is as deep as the wall is tall — a wall must not sit on a
      // dirt plinth of its own.
      expect(plan.soil[k] as number, `column ${k}`).toBeGreaterThanOrEqual(4);
    }
    expect(verges).toBeGreaterThan(0);
  });
});
