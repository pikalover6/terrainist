/**
 * Wave four D: the twelve homestead buildings, held to the earlier waves'
 * contract.
 *
 * Deliberately the *same* tests wave two and wave three were held to, because
 * a new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table claims — bare `stable` still reaches the extended barn,
 *   bare `mill` the windmill, bare `kiln` the pottery kiln, and `house` still
 *   falls through to a cottage;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes, and with the
 *   lantern column deleted;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, no sign blocks, and the same seed gives the same ops
 *   forever.
 *
 * Plus two this wave owns. **The mushroom cap is solid**: the corbelled dome
 * closes on whole blocks, never on a slab or a fence over the hollow. And
 * **every apiary skep stands on the ground**: each pedestal column has
 * something under it, which is the stilt/veranda lesson stated as a property.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  HOMESTEAD_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  homesteadFacadeDefaults,
  isHomesteadArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xf00d4n, "world.homestead");
const OTHER = nodeSeed(0xf00d4n, "world.homestead.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 18, 15];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 14, 13], [9, 12, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = homesteadFacadeDefaults(archetype);
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

describe("homestead archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isHomesteadArchetype(a)).toBe(true);
    }
    expect(isHomesteadArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["horse_stable"])).toBe("stable");
    expect(archetypeOfTags(["stalls"])).toBe("stable");
    expect(archetypeOfTags(["silo"])).toBe("silo");
    expect(archetypeOfTags(["dovecote"])).toBe("dovecote");
    expect(archetypeOfTags(["pigeon_loft"])).toBe("dovecote");
    expect(archetypeOfTags(["coop"])).toBe("chicken_coop");
    expect(archetypeOfTags(["apiary"])).toBe("apiary");
    expect(archetypeOfTags(["oast"])).toBe("hop_kiln");
    expect(archetypeOfTags(["cider_press"])).toBe("cider_press");
    expect(archetypeOfTags(["root_cellar"])).toBe("root_cellar_mound");
    expect(archetypeOfTags(["witch_hut"])).toBe("witch_hut");
    expect(archetypeOfTags(["mushroom"])).toBe("mushroom_house");
    expect(archetypeOfTags(["hobbit"])).toBe("hobbit_hole");
    expect(archetypeOfTags(["burrow"])).toBe("hobbit_hole");
    expect(archetypeOfTags(["gingerbread"])).toBe("gingerbread_cottage");
    // The near misses. Each is a tag this wave deliberately did not claim, and
    // each would have been a silent theft from a table above or below it.
    expect(archetypeOfTags(["stable"])).toBe("barn");
    expect(archetypeOfTags(["byre"])).toBe("barn");
    expect(archetypeOfTags(["barn"])).toBe("barn");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["kiln"])).toBe("kiln");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      const facade = homesteadFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(homesteadFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through or precedes.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("igloo").roof).toBe("hip");
    expect(archetypeFacadeDefaults("hanok").roof).toBe("hip");
  });

  it("is claimed by the catalog, stamped wave four", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(4);
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("homestead buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
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

  /** The lantern lesson, as a property: the room walks without that column. */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
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
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
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
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
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
    expect(has(build("stable"), "spruce_planks"), "the stable boarding").toBe(true);
    expect(has(build("stable"), "hay_block"), "the feed").toBe(true);
    expect(has(build("silo"), "stone_bricks"), "the bin").toBe(true);
    expect(has(build("silo"), "hay_block"), "the grain").toBe(true);
    expect(has(build("dovecote"), "stone_bricks"), "the tower").toBe(true);
    expect(has(build("dovecote"), "ladder"), "the way up").toBe(true);
    expect(has(build("chicken_coop"), "birch_planks"), "the coop boarding").toBe(true);
    expect(has(build("apiary"), "honeycomb_block"), "the honey band").toBe(true);
    expect(has(build("apiary"), "beehive"), "the hives").toBe(true);
    expect(has(build("hop_kiln"), "bricks"), "the kiln").toBe(true);
    expect(has(build("hop_kiln"), "white_wool"), "the cowl").toBe(true);
    expect(has(build("cider_press"), "cauldron"), "the catching vessel").toBe(true);
    expect(has(build("root_cellar_mound"), "grass_block"), "the turf mound").toBe(true);
    expect(has(build("witch_hut"), "spruce_stairs"), "the crooked roof").toBe(true);
    expect(has(build("witch_hut"), "cauldron"), "the cauldron").toBe(true);
    expect(has(build("mushroom_house"), "mushroom_stem"), "the stem walls").toBe(true);
    expect(has(build("mushroom_house"), "red_mushroom_block"), "the cap").toBe(true);
    expect(has(build("hobbit_hole"), "stripped_oak_log"), "the door ring").toBe(true);
    expect(has(build("hobbit_hole"), "grass_block"), "the turf roof").toBe(true);
    expect(has(build("gingerbread_cottage"), "brown_terracotta"), "the biscuit").toBe(true);
    expect(has(build("gingerbread_cottage"), "white_concrete"), "the icing").toBe(true);
    expect(has(build("gingerbread_cottage"), "cake"), "the sweets counter").toBe(true);
  });

  /**
   * The corbel-cap lesson, as a property this wave owns.
   *
   * The mushroom cap is a dome corbelled over the room's hollow, and every
   * block of it must be **whole**: a slab, a fence or a wall in the middle of
   * the cap rect has nothing under it but air and fails the support-chain
   * rule. So nothing partial appears anywhere above the eave plate.
   */
  it("closes the mushroom cap on solid blocks only", () => {
    for (const size of SIZES) {
      const result = build("mushroom_house", size);
      const base = result.meta.wallTop + 1;
      const partial = /(_slab$|_fence$|_wall$|_stairs$|^ladder$|_trapdoor$|_carpet$)/;
      for (const op of result.ops) {
        if (op.y < base || op.block === "air") continue;
        expect(partial.test(op.block), `${size.join("x")} ${op.block} at y=${op.y}`).toBe(false);
      }
      // And it is genuinely a corbel: distinct courses above the plate.
      const courses = new Set(
        result.ops.filter((op) => op.y >= base && op.block !== "air").map((op) => op.y),
      );
      expect(courses.size, size.join("x")).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * The apron-post ground rule, as a property this wave owns.
   *
   * Every skep pedestal and every beehive the apiary writes into the apron
   * ring has something under it — either the ground the terrain gave it or the
   * support course the fit-out filled. A prop standing on air is the
   * stilt/veranda bug, and it comes back the moment nobody measures it.
   */
  it("stands every apiary skep on something", () => {
    for (const size of SIZES) {
      const result = build("apiary", size);
      const at = indexOf(result.ops);
      const [sx, , sz] = result.meta.size;
      const inApron = (x: number, z: number): boolean =>
        x === -1 || x === sx || z === -1 || z === sz;
      const props = result.ops.filter(
        (op) =>
          inApron(op.x, op.z) &&
          op.y >= 1 &&
          (op.block === "beehive" || op.block === "hay_block" || op.block.endsWith("_fence")),
      );
      expect(props.length, `${size.join("x")} skeps`).toBeGreaterThan(0);
      for (const op of props) {
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(
          under !== undefined && under.block !== "air",
          `${size.join("x")} support under ${op.block} at ${op.x},${op.y},${op.z}`,
        ).toBe(true);
      }
    }
  });

  /** No open water anywhere in this wave: a cauldron is not a pool. */
  it("writes no open fluid at all", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "water"), `${a} ${size.join("x")}`).toBe(false);
        expect(has(build(a, size), "lava"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks: a sign needs a block entity the op stream cannot carry. */
  it("never places a sign block", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.ops.some((op) => op.block.endsWith("_sign")), a).toBe(false);
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of HOMESTEAD_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
