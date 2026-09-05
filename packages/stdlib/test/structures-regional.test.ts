/**
 * Wave three C: the twelve regional houses, held to the earlier waves' contract.
 *
 * Deliberately the *same* tests wave two was held to, because a new archetype
 * that needs a new kind of guarantee is a new archetype nobody can reason
 * about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — `barn` still reaches the barn and
 *   `house` still falls through to a cottage;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes, and with the
 *   lantern column deleted;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, and the same seed gives the same ops forever.
 *
 * Plus one that is this wave's own: **the riad's basin is boxed in**. Every
 * water block it writes has something solid under it and either solid or more
 * water on all four sides — the bathhouse predicate, restated for a basin.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  REGIONAL_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isRegionalArchetype,
  nodeSeed,
  regionalFacadeDefaults,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa11e3n, "world.regional");
const OTHER = nodeSeed(0xa11e3n, "world.regional.other");
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
  const facade = regionalFacadeDefaults(archetype);
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

describe("regional archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isRegionalArchetype(a)).toBe(true);
    }
    expect(isRegionalArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["hanok"])).toBe("hanok");
    expect(archetypeOfTags(["machiya"])).toBe("machiya");
    expect(archetypeOfTags(["riad"])).toBe("riad");
    expect(archetypeOfTags(["cycladic"])).toBe("cycladic_house");
    expect(archetypeOfTags(["whitewash"])).toBe("cycladic_house");
    expect(archetypeOfTags(["adobe"])).toBe("adobe_pueblo");
    expect(archetypeOfTags(["pueblo"])).toBe("adobe_pueblo");
    expect(archetypeOfTags(["stilts"])).toBe("stilt_house");
    expect(archetypeOfTags(["sod"])).toBe("sod_house");
    expect(archetypeOfTags(["turf"])).toBe("sod_house");
    expect(archetypeOfTags(["igloo"])).toBe("igloo");
    expect(archetypeOfTags(["wattle"])).toBe("thatched_roundhouse");
    expect(archetypeOfTags(["veranda"])).toBe("colonial_veranda_house");
    expect(archetypeOfTags(["colonial"])).toBe("colonial_veranda_house");
    expect(archetypeOfTags(["hacienda"])).toBe("hacienda");
    expect(archetypeOfTags(["fachwerk"])).toBe("fachwerk_barn");
    // The near misses. Each is a tag this wave deliberately did not claim, and
    // each would have been a silent theft from a table above or below it.
    expect(archetypeOfTags(["barn"])).toBe("barn");
    expect(archetypeOfTags(["stable"])).toBe("barn");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["villa"])).toBe("mediterranean_villa");
    expect(archetypeOfTags(["half_timber"])).toBe("tudor_row");
    expect(archetypeOfTags(["trullo"])).toBe("trullo");
    expect(archetypeOfTags(["chalet"])).toBe("alpine_chalet");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
      const facade = regionalFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(regionalFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("trullo").roof).toBe("hip");
    expect(archetypeFacadeDefaults("tudor_row").roof).toBe("gable");
  });

  it("is claimed by the catalog, stamped wave three", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(3);
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
    // The stilt house keeps the tags it was catalogued with.
    expect(structureById("stilt_house")?.tags).toContain("water");
    expect(structureById("stilt_house")?.tags).toContain("tropical");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("regional buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
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
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
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
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
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
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
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
    expect(has(build("hanok"), "dark_oak_log"), "the frame").toBe(true);
    expect(has(build("hanok"), "deepslate_tiles"), "the giwa").toBe(true);
    expect(has(build("machiya"), "stripped_spruce_log"), "the frontage").toBe(true);
    expect(has(build("riad"), "sandstone"), "the plain street wall").toBe(true);
    expect(has(build("riad"), "water"), "the basin").toBe(true);
    expect(has(build("cycladic_house"), "white_concrete"), "the whitewash").toBe(true);
    expect(has(build("cycladic_house"), "blue_terracotta"), "the blue band").toBe(true);
    expect(has(build("adobe_pueblo"), "orange_terracotta"), "the render").toBe(true);
    expect(has(build("adobe_pueblo"), "stripped_spruce_log"), "the vigas").toBe(true);
    expect(has(build("stilt_house"), "jungle_planks"), "the timber").toBe(true);
    expect(has(build("sod_house"), "grass_block"), "the turf roof").toBe(true);
    expect(has(build("sod_house"), "coarse_dirt"), "the sod walls").toBe(true);
    expect(has(build("igloo"), "snow_block"), "the dome").toBe(true);
    expect(has(build("igloo"), "packed_ice"), "the cap").toBe(true);
    expect(has(build("thatched_roundhouse"), "hay_block"), "the thatch").toBe(true);
    expect(has(build("thatched_roundhouse"), "packed_mud"), "the wattle").toBe(true);
    expect(has(build("colonial_veranda_house"), "birch_planks"), "the clapboard").toBe(true);
    expect(has(build("hacienda"), "terracotta"), "the tiled eave").toBe(true);
    expect(has(build("fachwerk_barn"), "dark_oak_log"), "the bracing").toBe(true);
    expect(has(build("fachwerk_barn"), "white_terracotta"), "the infill").toBe(true);
    expect(has(build("fachwerk_barn"), "hay_block"), "the loft").toBe(true);
  });

  /**
   * The igloo's material choice, as a test rather than as a comment.
   *
   * Ice melts under the light the shell's own lanterns supply, and a house
   * that puddles is a bug with a long fuse. The dome is snow and *packed* ice.
   */
  it("builds the igloo out of nothing that melts", () => {
    for (const size of SIZES) {
      const result = build("igloo", size);
      expect(result.ops.some((op) => op.block === "ice"), size.join("x")).toBe(false);
      expect(result.ops.some((op) => op.block === "blue_ice"), size.join("x")).toBe(false);
    }
  });

  /**
   * The corbel, as a measurement rather than a block name: an igloo's dome
   * rises in distinct courses above the eave plate, which is what makes it a
   * dome rather than a hip roof dropped on a snow box.
   */
  it("corbels a dome over the igloo drum", () => {
    const result = build("igloo", [11, 20, 11]);
    const base = result.meta.wallTop + 1;
    const courses = new Set(
      result.ops.filter((op) => op.y >= base && op.block !== "air").map((op) => op.y),
    );
    expect(courses.size).toBeGreaterThanOrEqual(3);
  });

  /**
   * The fluid predicate, restated for a basin.
   *
   * Every water block the riad writes has something solid under it and either
   * solid or more water on all four sides. It is the same test the bathhouse's
   * pool is held to, and it is what makes a basin a basin rather than a leak.
   */
  it("boxes in every block of the riad's basin", () => {
    for (const size of SIZES) {
      const result = build("riad", size);
      const at = indexOf(result.ops);
      const solidAt = (x: number, y: number, z: number): boolean => {
        const op = at.get(`${x},${y},${z}`);
        return op !== undefined && op.block !== "air";
      };
      const water = result.ops.filter((op) => op.block === "water");
      for (const cell of water) {
        expect(
          solidAt(cell.x, cell.y - 1, cell.z),
          `${size.join("x")} floor under ${cell.x},${cell.z}`,
        ).toBe(true);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const side = at.get(`${cell.x + dx},${cell.y},${cell.z + dz}`);
          expect(side, `${size.join("x")} beside ${cell.x},${cell.z}`).toBeDefined();
          expect(side?.block, `${size.join("x")} beside ${cell.x},${cell.z}`).not.toBe("air");
        }
      }
      if (size[0] >= 11) expect(water.length, `${size.join("x")} basin`).toBeGreaterThan(0);
    }
  });

  /** Water anywhere else in this wave would be a defect: the stilt house is dry. */
  it("gives the stilt house no open water at all", () => {
    for (const size of SIZES) {
      expect(has(build("stilt_house", size), "water"), size.join("x")).toBe(false);
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks: a sign needs a block entity the op stream cannot carry. */
  it("never places a sign block", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.ops.some((op) => op.block.endsWith("_sign")), a).toBe(false);
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of REGIONAL_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
