/**
 * **A road that runs off the far edge of a terrace is a crossing, not a
 * planning failure** — `structures/retaining.ts`'s `walkBack`, and
 * `docs/SITE-PLAN-v0.md` §3.4 rule 2 / §5.5.
 *
 * `walkBack` walks perpendicular into the upper platform looking for the column
 * a wall may stand on, and that walk is the whole of how a street running
 * *along* a seam is told from one *crossing* it. Along, the walk leaves the
 * carriageway after a few columns and the wall lands at the back of the
 * pavement. Across, the walk is street for its whole length and comes back
 * empty, so the seam stays open — there the street *is* the connection between
 * the two levels.
 *
 * The walk used to end at the platform's edge as well as at
 * `RETAIN_FACE_SETBACK`, and answered `offPlatform` when it did — §5.5's
 * compiler-bug error. On a terrace shallower than the setback a crossing runs
 * off the *far* edge before the setback expires, so the same street, on the
 * same seam, was refused `street` where the terrace was deep and `offPlatform`
 * three columns along where it was not. Measured on `harbour_city` (seed 202,
 * `world.old_town`): a nine-column crossing of a 56-column seam, six columns
 * refused `street` and three raising `LOAM-E497`, with no wall built either way.
 *
 * The two fixtures below are that geometry and its opposite: a road *crossing*
 * a nine-column terrace, and a road *along* a five-column one with nothing
 * behind it. The first must not error; the second must, because there the
 * planner really did claim a station that cannot hold its street and one column
 * of standing room, and §5.5 exists to say so.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { groundLevelsOf, levelSeams } from "../src/layout/levels.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { buildRetainingWalls, RETAIN_FACE_SETBACK } from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

const SIZE = 40;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const BOUNDS = { x0: 0, z0: 0, x1: SIZE - 1, z1: SIZE - 1 } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** The upper terrace, the lower terrace, and the natural hill above them. */
const UPPER_Y = 70;
const LOWER_Y = 66;
const HILL_Y = 74;
const SEAM_Z = 17;

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
 * Two terraces a storey apart, the upper one `depth` columns deep, and a
 * carriageway wherever `road` says there is one.
 *
 * `plannedEdges` is present and empty on purpose: its **presence** is §5.5's
 * gate, so these fixtures are quarters a site planner drew, which is the only
 * kind on which `offPlatform` is an error rather than a number.
 */
function quarter(depth: number, road: (x: number, z: number) => boolean) {
  const upperZ0 = SEAM_Z - depth;
  const benches: FormBench[] = [
    { id: "upper", runs: [{ x0: 0, z0: upperZ0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
    { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
  ];
  const levels = groundLevelsOf(BOUNDS, benches);
  if (levels === null) throw new Error("fixture has no platforms");
  const carriageway = new Uint8Array(SIZE * SIZE);
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) if (road(x, z)) carriageway[at(x, z)] = 1;
  }
  return {
    district: {
      nodePath: "world.quarter",
      bounds: BOUNDS,
      carriageway,
      sidewalk: new Uint8Array(SIZE * SIZE),
      levels,
      seams: levelSeams(levels),
      plannedEdges: [],
    },
    height: (x: number, z: number): number =>
      z < upperZ0 ? HILL_Y : z < SEAM_Z ? UPPER_Y : LOWER_Y,
  };
}

describe("walkBack tells a road crossing a terrace from a terrace too narrow for its road", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  const themed = (): ReturnType<typeof resolvePalette>["palette"] => {
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    return palette;
  };

  const run = (fixture: ReturnType<typeof quarter>) => {
    const plan = planOf(stack, fixture.height);
    return buildRetainingWalls({
      districts: [fixture.district],
      plan,
      palette: themed(),
      stack,
    });
  };

  it("refuses the crossing as `street` where the terrace is shallower than the setback", () => {
    // Nine columns of terrace — shallower than the setback, which is the whole
    // of the bug — with a nine-wide road crossing it from the hill above to the
    // terrace below.
    const depth = 9;
    expect(depth).toBeLessThan(RETAIN_FACE_SETBACK);
    const result = run(quarter(depth, (x) => x >= 18 && x <= 26));
    expect(result.unfaced.offPlatform).toBe(0);
    expect(result.unfaced.street).toBeGreaterThan(0);
    expect(result.diagnostics.map((d) => d.name)).not.toContain("SITE_PLAN_FAILED");
    // The seam is still walled where the road is not on it: the crossing stays
    // open, and everything either side of it is a wall.
    expect(result.walls).toBeGreaterThan(0);
  });

  it("still raises §5.5 where the road covers the terrace and stops at its back edge", () => {
    // The same nine-column terrace and the same nine-wide road, changed in one
    // respect: the road **stops at the terrace's back edge** instead of running
    // on up the hill. Nothing crosses anything; the road simply covers the
    // whole depth of the station and there is no column of the platform left to
    // stand a wall on — §3.4 rule 2's guarantee, broken, and §5.5's error is the
    // right answer. This is the case the latch must still catch, and it is one
    // predicate away from the fixture above.
    const result = run(quarter(9, (x, z) => x >= 18 && x <= 26 && z >= SEAM_Z - 9));
    expect(result.unfaced.offPlatform).toBeGreaterThan(0);
    expect(result.diagnostics.map((d) => d.name)).toContain("SITE_PLAN_FAILED");
  });
});
