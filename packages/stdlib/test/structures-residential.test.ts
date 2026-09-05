/**
 * Archetype wave four A: twelve dwellings, held to wave two's contract.
 *
 * The tests are deliberately the *same* tests the earlier waves were held to,
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
 * Plus the three field lessons, restated as properties: the lantern column
 * stays walk-around, a seat's `facing` is its backrest, and no pot is bare.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  RESIDENTIAL_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isResidentialArchetype,
  nodeSeed,
  residentialFacadeDefaults,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x4e51den, "world.residential");
const OTHER = nodeSeed(0x4e51den, "world.residential.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 17, 19];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 13, 15], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = residentialFacadeDefaults(archetype);
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

describe("residential archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isResidentialArchetype(a)).toBe(true);
    }
    expect(isResidentialArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["farmhouse"])).toBe("farmhouse");
    expect(archetypeOfTags(["farmstead"])).toBe("farmhouse");
    expect(archetypeOfTags(["townhouse"])).toBe("townhouse");
    expect(archetypeOfTags(["terraced_row"])).toBe("terraced_row");
    expect(archetypeOfTags(["terrace"])).toBe("terraced_row");
    expect(archetypeOfTags(["manor"])).toBe("manor_house");
    expect(archetypeOfTags(["mansion"])).toBe("mansion");
    expect(archetypeOfTags(["longhouse"])).toBe("longhouse");
    expect(archetypeOfTags(["mead_hall"])).toBe("longhouse");
    expect(archetypeOfTags(["bungalow"])).toBe("bungalow");
    expect(archetypeOfTags(["hut"])).toBe("hut");
    expect(archetypeOfTags(["shack"])).toBe("hut");
    expect(archetypeOfTags(["log_cabin"])).toBe("log_cabin");
    expect(archetypeOfTags(["cabin"])).toBe("log_cabin");
    expect(archetypeOfTags(["courtyard_house"])).toBe("courtyard_house");
    expect(archetypeOfTags(["courtyard"])).toBe("courtyard_house");
    expect(archetypeOfTags(["dormitory"])).toBe("dormitory");
    expect(archetypeOfTags(["dorm"])).toBe("dormitory");
    expect(archetypeOfTags(["almshouse"])).toBe("almshouse");
    expect(archetypeOfTags(["hospice"])).toBe("almshouse");
    // The near misses. Every one of these is a tag an older table owns and
    // this wave deliberately did not reach for.
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["hall"])).toBe("hall");
    expect(archetypeOfTags(["villa"])).toBe("mediterranean_villa");
    expect(archetypeOfTags(["riad"])).toBe("riad");
    expect(archetypeOfTags(["apartment"])).toBe("apartment_block");
    expect(archetypeOfTags(["flats"])).toBe("apartment_block");
    expect(archetypeOfTags(["lodging"])).toBe("hotel");
    expect(archetypeOfTags(["barn"])).toBe("barn");
    expect(archetypeOfTags(["chalet"])).toBe("alpine_chalet");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
      const facade = residentialFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(residentialFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("igloo").roof).toBe("hip");
  });

  it("is claimed by the catalog, and stamped as wave four", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(4);
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
    // The terraced row keeps the tags it was stamped with.
    expect(structureById("terraced_row")?.tags).toContain("row");
    expect(structureById("terraced_row")?.tags).toContain("urban");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("residential buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
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
   * The lantern lesson, as a property: deleting the column the shell hangs its
   * light in must leave the rest of the floor connected.
   */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
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
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
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
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
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
    expect(has(build("farmhouse"), "smoker"), "the range").toBe(true);
    expect(has(build("farmhouse"), "hay_block"), "the larder").toBe(true);
    expect(has(build("townhouse"), "bricks"), "the brick front").toBe(true);
    expect(has(build("townhouse"), "bookshelf"), "the parlour").toBe(true);
    expect(has(build("terraced_row"), "stone_bricks"), "the party piers").toBe(true);
    expect(has(build("manor_house"), "lectern"), "the study").toBe(true);
    expect(has(build("manor_house"), "bookshelf"), "the study shelves").toBe(true);
    expect(has(build("mansion"), "red_carpet"), "the galleries").toBe(true);
    expect(has(build("mansion"), "lectern"), "the state end").toBe(true);
    expect(has(build("longhouse"), "red_banner"), "the shields").toBe(true);
    expect(has(build("longhouse"), "campfire"), "the hearth").toBe(true);
    expect(has(build("bungalow"), "light_blue_bed"), "the bedroom").toBe(true);
    expect(has(build("hut"), "brown_bed"), "the cot").toBe(true);
    expect(has(build("hut"), "chest"), "the tool chest").toBe(true);
    expect(has(build("log_cabin"), "white_carpet"), "the furs").toBe(true);
    expect(has(build("courtyard_house"), "cauldron"), "the well").toBe(true);
    expect(has(build("dormitory"), "white_bed"), "the bunks").toBe(true);
    expect(has(build("dormitory"), "barrel"), "the lockers").toBe(true);
    expect(has(build("almshouse"), "white_bed"), "the cells").toBe(true);
    expect(has(build("almshouse"), "furnace"), "the common hearth").toBe(true);
  });

  /**
   * The log cabin's whole read, as a measurement: horizontal logs.
   *
   * A log with `axis: "y"` is a post. A cabin is stacked *timber*, so every
   * wall log this fit-out lays carries an x or a z axis.
   */
  it("lays the cabin's logs horizontally", () => {
    const result = build("log_cabin", [11, 13, 13]);
    const logs = result.ops.filter(
      (op) => op.block.endsWith("_log") && op.y >= 2 && op.props?.["axis"] !== undefined,
    );
    expect(logs.length).toBeGreaterThan(20);
    for (const log of logs) expect(["x", "z"]).toContain(log.props?.["axis"]);
  });

  /**
   * The courtyard house's court is what is *not* built: the middle of the room
   * and every cell touching it stay bare floor.
   */
  it("leaves the courtyard house's court empty", () => {
    const result = build("courtyard_house", [13, 13, 13]);
    const it = result.meta.interior;
    const free = new Set(freeCells(result));
    const mx = Math.floor((it.x0 + it.x1) / 2);
    const mz = Math.floor((it.z0 + it.z1) / 2);
    for (let x = mx - 1; x <= mx + 1; x++) {
      for (let z = mz - 1; z <= mz + 1; z++) {
        expect(free.has(`${x},${z}`), `court cell ${x},${z}`).toBe(true);
      }
    }
    // And it is planted: a pot at each of the four interior corners.
    const pots = result.ops.filter((op) => op.block.startsWith("potted_"));
    expect(pots.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * The seat rule, checked geometrically rather than by block name.
   *
   * A stair's `facing` names its **high half** — the backrest. A mead bench on
   * the west wall therefore faces `west`, so the drinker looks east, into the
   * hall. The wrong convention seats the whole hall facing the wall, and it is
   * invisible in a block list.
   */
  it("turns mead benches' backrests to the wall they stand on", () => {
    const result = build("longhouse", [11, 13, 21]);
    const it = result.meta.interior;
    const benches = result.ops.filter(
      (op) =>
        op.y === 1 &&
        op.block.endsWith("_stairs") &&
        op.props?.["half"] === "bottom" &&
        (op.x === it.x0 || op.x === it.x1),
    );
    expect(benches.length).toBeGreaterThan(4);
    for (const bench of benches) {
      // Stated as the defect it guards against, so the shell's own stair
      // flight — which also stands on a wall row — cannot fail it: no seat on
      // a wall row ever has its backrest turned into the room.
      expect(bench.props?.["facing"], `bench at ${bench.x},${bench.z}`).not.toBe(
        bench.x === it.x0 ? "east" : "west",
      );
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks: a sign is a block entity the op stream cannot carry. */
  it("never places a sign", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(
          result.ops.some((op) => op.block.endsWith("_sign")),
          `${a} ${size.join("x")}`,
        ).toBe(false);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of RESIDENTIAL_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
