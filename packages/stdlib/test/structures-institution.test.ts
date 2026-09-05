/**
 * Archetype wave three A: the twelve institutions, on wave two's contract.
 *
 * Deliberately the *same* tests the earlier waves were held to — a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the lantern column is never the only route;
 * - a seat's `facing` is its backrest;
 * - no pot is a bare `flower_pot`, and no signage is a sign block;
 * - the same seed gives the same ops, forever.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  INSTITUTION_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  institutionFacadeDefaults,
  isInstitutionArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x1a5717n, "world.institution");
const OTHER = nodeSeed(0x1a5717n, "world.institution.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 17, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 13, 13], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = institutionFacadeDefaults(archetype);
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

describe("institution archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isInstitutionArchetype(a)).toBe(true);
    }
    expect(isInstitutionArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["museum"])).toBe("museum");
    expect(archetypeOfTags(["gallery"])).toBe("museum");
    expect(archetypeOfTags(["guildhall"])).toBe("guildhall");
    expect(archetypeOfTags(["guild"])).toBe("guildhall");
    expect(archetypeOfTags(["jail"])).toBe("prison");
    expect(archetypeOfTags(["gaol"])).toBe("prison");
    expect(archetypeOfTags(["police"])).toBe("police_station");
    expect(archetypeOfTags(["constabulary"])).toBe("police_station");
    expect(archetypeOfTags(["firehouse"])).toBe("fire_station");
    expect(archetypeOfTags(["hospital"])).toBe("hospital");
    expect(archetypeOfTags(["ward"])).toBe("hospital");
    expect(archetypeOfTags(["poorhouse"])).toBe("workhouse");
    expect(archetypeOfTags(["orphanage"])).toBe("orphanage");
    expect(archetypeOfTags(["coinage"])).toBe("mint");
    expect(archetypeOfTags(["customs"])).toBe("customs_house");
    expect(archetypeOfTags(["bank"])).toBe("bank");
    expect(archetypeOfTags(["strongroom"])).toBe("bank");
    expect(archetypeOfTags(["countinghouse"])).toBe("counting_house");
    // The near misses. Each of these belongs to a table this wave did not
    // touch, and claiming any of them would have been a silent theft.
    expect(archetypeOfTags(["hall"])).toBe("hall");
    expect(archetypeOfTags(["court"])).toBe("courthouse");
    expect(archetypeOfTags(["clinic"])).toBe("infirmary");
    expect(archetypeOfTags(["archive"])).toBe("library");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["gate"])).toBe("gatehouse");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
      const facade = institutionFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(institutionFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the links it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("trullo").roof).toBe("hip");
    expect(archetypeFacadeDefaults("courthouse").roof).toBe("hip");
  });

  it("is claimed by the catalog, as wave three and implemented", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(3);
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("institution buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
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

  /** The lantern lesson, as a property: its column is never the only route. */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
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
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
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
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
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
    expect(has(build("museum"), "chiseled_stone_bricks"), "plinths").toBe(true);
    expect(has(build("guildhall"), "yellow_banner"), "the colours").toBe(true);
    expect(has(build("guildhall"), "lectern"), "the warden's book").toBe(true);
    expect(has(build("prison"), "iron_bars"), "the cell fronts").toBe(true);
    expect(has(build("police_station"), "cartography_table"), "the front desk").toBe(true);
    expect(has(build("police_station"), "iron_bars"), "the one cell").toBe(true);
    expect(has(build("fire_station"), "bell"), "the muster bell").toBe(true);
    expect(has(build("fire_station"), "cauldron"), "the water butts").toBe(true);
    expect(has(build("hospital"), "white_bed"), "the wards").toBe(true);
    expect(has(build("hospital"), "brewing_stand"), "the dispensary").toBe(true);
    expect(has(build("workhouse"), "loom"), "the work benches").toBe(true);
    expect(has(build("workhouse"), "brown_bed"), "the meagre cots").toBe(true);
    expect(has(build("orphanage"), "red_bed"), "the small beds").toBe(true);
    expect(has(build("orphanage"), "white_carpet"), "the play mat").toBe(true);
    expect(has(build("mint"), "anvil"), "the presses").toBe(true);
    expect(has(build("mint"), "iron_block"), "the strongroom trim").toBe(true);
    expect(has(build("customs_house"), "barrel"), "the bonded store").toBe(true);
    // Iron bars, not `chain` — the 1.21.11 block table has no chain entry.
    expect(has(build("customs_house", BIG, { floors: 1 }), "iron_bars"), "the scales").toBe(true);
    expect(has(build("bank"), "iron_bars"), "the grille").toBe(true);
    expect(has(build("bank"), "iron_block"), "the strongroom").toBe(true);
    expect(has(build("counting_house"), "lectern"), "the master's ledger").toBe(true);
    expect(has(build("counting_house"), "bookshelf"), "the ledgers").toBe(true);
  });

  /**
   * The seat rule, stated the only way it can be checked: geometrically.
   *
   * A stair's `facing` names its **high half** — the backrest. A clerk reading
   * a ledger at the far end of the room therefore carries the cardinal *away*
   * from it, and the old, wrong convention is invisible in a block list.
   */
  it("turns counting-house stools away from the desks they read", () => {
    const result = build("counting_house", [13, 11, 17]);
    const it = result.meta.interior;
    const door = result.meta.door;
    expect(door).not.toBeNull();
    const farNorth = (door?.z ?? it.z1) > (it.z0 + it.z1) / 2;
    const expected = farNorth ? "south" : "north";
    const stools = result.ops.filter(
      (op) => op.y === 1 && op.block.endsWith("_stairs") && op.props?.["half"] === "bottom",
    );
    expect(stools.length).toBeGreaterThan(2);
    for (const stool of stools) {
      expect(stool.props?.["facing"], `stool at ${stool.x},${stool.z}`).toBe(expected);
    }
  });

  /** Every pot has a plant in it, and no signage is a sign block. */
  it("never places a bare flower pot or a sign", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(has(result, "flower_pot"), `${a} ${size.join("x")} pot`).toBe(false);
        expect(
          result.ops.some((op) => op.block.endsWith("_sign")),
          `${a} ${size.join("x")} sign`,
        ).toBe(false);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of INSTITUTION_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
