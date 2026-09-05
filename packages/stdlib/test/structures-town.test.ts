/**
 * The town wave: a town hall, a school and a bathhouse.
 *
 * Deliberately the *same* tests every earlier wave was held to — a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an older table already answers to;
 * - it puts something in the room it built, and the room stays one walkable
 *   region;
 * - nothing it builds leaves the envelope the solver reserved — in plan, the
 *   footprint plus the one-block apron; in height, the shell's roof top plus
 *   `ROOF_FLOURISH_RISE`;
 * - the same seed gives the same ops, forever.
 *
 * Plus the property that is new in this round: **the bathhouse's water is
 * boxed in**. Every water block it writes has something solid under it and
 * either solid or more water on all four sides, which is the predicate the
 * compiler's fluid-stability rules re-derive from the emitted blocks.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  TOWN_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isTownArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  townFacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x70bn, "world.town");
const OTHER = nodeSeed(0x70bn, "world.town.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 17, 13];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = SEED,
): ReturnType<typeof generateBuilding> {
  const facade = townFacadeDefaults(archetype);
  return generateBuilding({
    size,
    params: {
      archetype,
      ...(facade.roof === undefined ? {} : { roof: facade.roof }),
      ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
      ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
      ...extra,
    },
    seed,
    style: PINNED,
  });
}

/** Is every cell of a set 4-reachable from every other one? */
function oneRegion(free: readonly string[]): boolean {
  if (free.length === 0) return true;
  const open = new Set(free);
  const seen = new Set([free[0] as string]);
  const queue = [free[0] as string];
  while (queue.length > 0) {
    const [x, z] = (queue.pop() as string).split(",").map(Number) as [number, number];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const k = `${x + dx},${z + dz}`;
      if (!open.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(k);
    }
  }
  return seen.size === open.size;
}

/** An op index, keyed by cell. Air is a *written* op and counts as empty. */
function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/* -------------------------------------------------------------------------- */
/* the wave                                                                    */
/* -------------------------------------------------------------------------- */

describe("town archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of TOWN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isTownArchetype(a)).toBe(true);
      // …and the catalog agrees it exists, which is the other half of the
      // registry ↔ catalog contract `catalog.test.ts` polices.
      expect(structureById(a)?.status, a).toBe("implemented");
    }
    expect(isTownArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["town_hall"])).toBe("town_hall");
    expect(archetypeOfTags(["townhall"])).toBe("town_hall");
    expect(archetypeOfTags(["moot_hall"])).toBe("town_hall");
    expect(archetypeOfTags(["city_hall"])).toBe("town_hall");
    expect(archetypeOfTags(["school"])).toBe("school");
    expect(archetypeOfTags(["schoolhouse"])).toBe("school");
    expect(archetypeOfTags(["academy"])).toBe("school");
    expect(archetypeOfTags(["bathhouse"])).toBe("bathhouse");
    expect(archetypeOfTags(["baths"])).toBe("bathhouse");
    expect(archetypeOfTags(["sauna"])).toBe("bathhouse");
    expect(archetypeOfTags(["hammam"])).toBe("bathhouse");
    // The tables around this one still win every tag that is theirs.
    expect(archetypeOfTags(["hall"])).toBe("hall");
    expect(archetypeOfTags(["archive"])).toBe("library");
    expect(archetypeOfTags(["temple"])).toBe("church");
    expect(archetypeOfTags(["castle"])).toBe("keep");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable through the front door", () => {
    for (const a of TOWN_BUILDING_ARCHETYPES) {
      const facade = townFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      // The dispatcher every caller actually uses has to reach this file.
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(townFacadeDefaults("cottage")).toEqual({});
  });

  it("puts something in every room it builds", () => {
    for (const a of TOWN_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of TOWN_BUILDING_ARCHETYPES) {
      for (const floors of [1, 2]) {
        const result = build(a, BIG, { floors });
        const at = indexOf(result.ops);
        const free: string[] = [];
        for (const cell of result.meta.floorCells) {
          const standing = at.get(`${cell.x},1,${cell.z}`);
          if (standing !== undefined && standing.block !== "air") continue;
          free.push(`${cell.x},${cell.z}`);
        }
        expect(free.length, `${a} floors=${floors}`).toBeGreaterThan(3);
        expect(oneRegion(free), `${a} floors=${floors} is one region`).toBe(true);
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of TOWN_BUILDING_ARCHETYPES) {
      const result = build(a);
      const at = indexOf(result.ops);
      for (const cell of result.meta.floorCells) {
        const floor = at.get(`${cell.x},0,${cell.z}`);
        expect(floor, `${a} floor at ${cell.x},${cell.z}`).toBeDefined();
        expect(floor?.block, `${a} floor at ${cell.x},${cell.z}`).not.toBe("air");
      }
    }
  });

  it("stays inside the envelope, in plan and in height", () => {
    for (const a of TOWN_BUILDING_ARCHETYPES) {
      for (const size of [BIG, [11, 13, 11], [7, 9, 7]] as const) {
        const result = build(a, size);
        const [sx, , sz] = result.meta.size;
        const ceiling = result.meta.roofTop + ROOF_FLOURISH_RISE;
        for (const op of result.ops) {
          if (op.block === "air") continue; // clearing is not building
          expect(op.x, `${a} ${size.join("x")} x`).toBeGreaterThanOrEqual(-1);
          expect(op.x, `${a} ${size.join("x")} x`).toBeLessThanOrEqual(sx);
          expect(op.z, `${a} ${size.join("x")} z`).toBeGreaterThanOrEqual(-1);
          expect(op.z, `${a} ${size.join("x")} z`).toBeLessThanOrEqual(sz);
          expect(op.y, `${a} ${size.join("x")} y`).toBeLessThanOrEqual(ceiling);
        }
      }
    }
  });

  it("builds the thing each archetype is for", () => {
    const hall = build("town_hall");
    expect(has(hall, "bell"), "the clock gable's bell").toBe(true);
    expect(has(hall, "quartz_block"), "the dial").toBe(true);
    expect(has(hall, "lectern"), "the chamber lectern").toBe(true);
    expect(has(hall, "blue_banner"), "the banners").toBe(true);
    // The trim: masonry above the plinth on a wall the shell built in timber.
    const trim = hall.ops.filter(
      (op) => op.y > 0 && op.y <= hall.meta.wallTop && op.block === "cobblestone",
    );
    expect(trim.length, "masonry trim").toBeGreaterThan(8);

    const school = build("school");
    expect(has(school, "black_concrete"), "the board").toBe(true);
    expect(has(school, "bell"), "the bell cote").toBe(true);
    expect(has(school, "lectern"), "the master's lectern").toBe(true);
    const desks = school.ops.filter((op) => op.y === 1 && op.block.endsWith("_slab"));
    expect(desks.length, "desks").toBeGreaterThan(3);

    const bath = build("bathhouse");
    expect(has(bath, "water"), "the pool").toBe(true);
    expect(has(bath, "smooth_stone"), "the coping and the cladding").toBe(true);
    expect(has(bath, "campfire"), "the steam braziers").toBe(true);
  });

  /**
   * The one new property in this wave.
   *
   * Every water block the bathhouse writes has something solid under it and
   * something solid — or more water — on all four sides. That is the same test
   * the compiler runs against the emitted blocks, asserted here so a change to
   * the basin fails in the grammar's own suite rather than three packages
   * downstream.
   */
  it("boxes in every block of the bathhouse's water", () => {
    for (const size of [BIG, [11, 13, 11], [9, 11, 9], [7, 9, 7]] as const) {
      const result = build("bathhouse", size);
      const at = indexOf(result.ops);
      const solid = (x: number, y: number, z: number): boolean => {
        const op = at.get(`${x},${y},${z}`);
        return op !== undefined && op.block !== "air";
      };
      const water = result.ops.filter((op) => op.block === "water");
      for (const cell of water) {
        expect(solid(cell.x, cell.y - 1, cell.z), `under ${cell.x},${cell.y},${cell.z}`).toBe(true);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          expect(
            solid(cell.x + dx, cell.y, cell.z + dz),
            `beside ${cell.x},${cell.y},${cell.z}`,
          ).toBe(true);
        }
      }
      // …and on a plan with room for one, there is a pool at all.
      if (size[0] >= 9) expect(water.length, `${size.join("x")} pool`).toBeGreaterThan(0);
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of TOWN_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
