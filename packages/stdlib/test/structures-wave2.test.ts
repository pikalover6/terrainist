/**
 * Archetype wave two: nine buildings, held to the earlier waves' contract.
 *
 * The tests are deliberately the *same* tests the breadth wave was held to,
 * because a new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever.
 *
 * Plus three that are new, one per field lesson this wave was written against:
 *
 * - **the lantern column.** The shell hangs a light over the middle of the
 *   room at head height. Removing that column from the floor must leave the
 *   remainder one region, or the room's only route runs through a light;
 * - **the seat rule.** A stair's `facing` is its high half — the backrest. The
 *   courthouse gallery therefore faces *away* from the bench;
 * - **no bare pots.** `flower_pot` renders empty. Every pot is a `potted_*`.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  WAVE2_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isWave2Archetype,
  nodeSeed,
  pottedAt,
  resolveArchetype,
  structureById,
  wave2FacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa11e2n, "world.wave2");
const OTHER = nodeSeed(0xa11e2n, "world.wave2.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 17, 15];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 13, 13], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = wave2FacadeDefaults(archetype);
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

/** The ground floor's free cells, as the physics lint would read them. */
function freeCells(result: ReturnType<typeof generateBuilding>): string[] {
  const at = indexOf(result.ops);
  const free: string[] = [];
  for (const cell of result.meta.floorCells) {
    const standing = at.get(`${cell.x},1,${cell.z}`);
    if (standing !== undefined && standing.block !== "air") continue;
    free.push(`${cell.x},${cell.z}`);
  }
  return free;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("wave-two archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isWave2Archetype(a)).toBe(true);
    }
    expect(isWave2Archetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["tudor_row"])).toBe("tudor_row");
    expect(archetypeOfTags(["half_timber"])).toBe("tudor_row");
    expect(archetypeOfTags(["villa"])).toBe("mediterranean_villa");
    expect(archetypeOfTags(["trullo"])).toBe("trullo");
    expect(archetypeOfTags(["court"])).toBe("courthouse");
    expect(archetypeOfTags(["tribunal"])).toBe("courthouse");
    expect(archetypeOfTags(["post"])).toBe("post_office");
    expect(archetypeOfTags(["clinic"])).toBe("infirmary");
    expect(archetypeOfTags(["sawmill"])).toBe("sawmill");
    expect(archetypeOfTags(["lumber_mill"])).toBe("sawmill");
    expect(archetypeOfTags(["kiln"])).toBe("kiln");
    expect(archetypeOfTags(["tanner"])).toBe("tannery");
    // The tables above and below still win the tags that are theirs. Each of
    // these is a near miss this wave deliberately did not claim.
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["gate"])).toBe("gatehouse");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["temple"])).toBe("church");
    // `hospital` is a catalog id with no generator; it must stay unclaimed.
    expect(archetypeOfTags(["hospital"])).toBe("cottage");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      const facade = wave2FacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      // The dispatch chain: `archetypeFacadeDefaults` must fall through to us.
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(wave2FacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(2);
    }
    // The near miss, restated as data: `hospital` is in the catalog and is not
    // implemented, because nothing builds it.
    expect(structureById("hospital")?.status).not.toBe("implemented");
    expect(STRUCTURE_CATALOG.filter((e) => e.id === "kiln")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("wave-two buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const free = freeCells(result);
          const label = `${a} ${size.join("x")} floors=${floors}`;
          expect(free.length, label).toBeGreaterThan(3);
          expect(oneRegion(free), `${label} is one region`).toBe(true);
        }
      }
    }
  });

  /**
   * The lantern lesson, as a property.
   *
   * `core.ts` hangs a lantern over the middle column of the room at head
   * height, so that column is not walk-through. A fit-out whose only route
   * crosses it has built a room with a wall in the middle of it — which is
   * exactly what a walkthrough of the earlier waves found. Deleting the column
   * from the free set must leave the rest connected.
   */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
        const free = freeCells(result).filter((k) => k !== lamp);
        expect(oneRegion(free), `${a} ${size.join("x")} without the lantern cell`).toBe(true);
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
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
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
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
    // Vernacular.
    expect(has(build("tudor_row", BIG, { floors: 2 }), "dark_oak_log"), "studwork").toBe(true);
    expect(has(build("tudor_row"), "white_terracotta"), "plaster").toBe(true);
    expect(has(build("mediterranean_villa"), "smooth_sandstone"), "stucco").toBe(true);
    expect(has(build("mediterranean_villa"), "sandstone_wall"), "parapet").toBe(true);
    expect(has(build("mediterranean_villa"), "terracotta"), "cornice").toBe(true);
    expect(has(build("trullo"), "chiseled_stone_bricks"), "capstone").toBe(true);
    expect(has(build("trullo"), "white_bed"), "the one room").toBe(true);
    // Civic.
    expect(has(build("courthouse"), "lectern"), "the bench").toBe(true);
    expect(has(build("post_office"), "white_banner"), "the standard").toBe(true);
    expect(has(build("post_office"), "barrel"), "pigeonholes").toBe(true);
    expect(has(build("infirmary"), "white_bed"), "cots").toBe(true);
    expect(has(build("infirmary"), "brewing_stand"), "the apothecary").toBe(true);
    expect(has(build("infirmary"), "white_banner"), "the screens").toBe(true);
    // Industrial.
    expect(has(build("sawmill"), "stonecutter"), "the saw run").toBe(true);
    expect(has(build("kiln"), "bricks"), "the kiln core").toBe(true);
    expect(has(build("tannery"), "brown_terracotta"), "the vats").toBe(true);
    expect(has(build("tannery"), "cauldron"), "the liquor").toBe(true);
  });

  /**
   * The corbel, as a measurement rather than as a block name.
   *
   * A trullo's cone rises one course per inset. Counting distinct courses of
   * masonry above the eave plate is what distinguishes it from a hip roof
   * dropped on a stone box.
   */
  it("corbels a trullo cone over the drum", () => {
    const result = build("trullo", [11, 20, 11]);
    const base = result.meta.wallTop + 1;
    const courses = new Set(
      result.ops.filter((op) => op.y >= base && op.block !== "air").map((op) => op.y),
    );
    expect(courses.size).toBeGreaterThanOrEqual(3);
  });

  /**
   * The seat rule, stated the only way it can be checked: geometrically.
   *
   * A stair's `facing` names its **high half** — the backrest. So a gallery
   * bench looking at a bench on the north wall carries `facing: "south"`. The
   * old, wrong convention would put the whole public with its back to the
   * judge, and it is invisible in a block list; this asserts the direction.
   */
  it("turns courtroom benches away from the bench they face", () => {
    const result = build("courthouse", [11, 13, 17]);
    const it = result.meta.interior;
    const door = result.meta.door;
    expect(door).not.toBeNull();
    // The dais is at the end furthest from the door; the gallery looks at it.
    const daisNorth = (door?.z ?? it.z1) > (it.z0 + it.z1) / 2;
    const expected = daisNorth ? "south" : "north";
    const benches = result.ops.filter(
      (op) => op.y === 1 && op.block.endsWith("_stairs") && op.props?.["half"] === "bottom",
    );
    expect(benches.length).toBeGreaterThan(4);
    for (const bench of benches) {
      expect(bench.props?.["facing"], `bench at ${bench.x},${bench.z}`).toBe(expected);
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
    // And the chooser only ever names a real potted block.
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) expect(pottedAt(x, z)).toMatch(/^potted_[a-z_]+$/);
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of WAVE2_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
