/**
 * Archetype wave 5B: twelve commerce and civic interiors.
 *
 * Held to wave two's contract, verbatim, because a new archetype that needs a
 * new kind of guarantee is a new archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims;
 * - it puts something in the room it built, and the room stays walkable **from
 *   the door** — asserted with the shared detector in `helpers/walkability.ts`,
 *   which walks a 1x2 body the way the physics lint does, across one and two
 *   storeys and three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever;
 * - it never routes the floor through the lantern column, and it never places
 *   a bare `flower_pot`.
 *
 * Plus the wave's own three:
 *
 * - **the seat rule.** Every seat in every bank faces *away* from the rostrum
 *   or the lectern — a stair's `facing` is its backrest;
 * - **flat banks.** No seat is a riser: nothing in a bank sits above `y = 1`;
 * - **no `chain`.** It is missing from the pinned 1.21.11 block table; a
 *   hanging bunch here is `iron_bars` or a wall trapdoor.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  COMMERCE_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  commerceFacadeDefaults,
  generateBuilding,
  isCommerceArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x5b0c0e3n, "world.commerce");
const OTHER = nodeSeed(0x5b0c0e3n, "world.commerce.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 17, 19];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 15], [9, 11, 11]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = commerceFacadeDefaults(archetype);
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

/** An op index, keyed by cell. Air is a *written* op and counts as empty. */
function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("wave 5B archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isCommerceArchetype(a)).toBe(true);
    }
    expect(isCommerceArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["shopping_mall"])).toBe("shopping_mall");
    expect(archetypeOfTags(["mall"])).toBe("shopping_mall");
    expect(archetypeOfTags(["department_store"])).toBe("department_store");
    expect(archetypeOfTags(["food_court"])).toBe("food_court");
    expect(archetypeOfTags(["auction"])).toBe("auction_house");
    expect(archetypeOfTags(["caravanserai"])).toBe("caravanserai");
    expect(archetypeOfTags(["khan"])).toBe("caravanserai");
    expect(archetypeOfTags(["souk"])).toBe("spice_market");
    expect(archetypeOfTags(["bazaar"])).toBe("spice_market");
    expect(archetypeOfTags(["parade"])).toBe("shop_row");
    expect(archetypeOfTags(["university"])).toBe("university_hall");
    expect(archetypeOfTags(["college"])).toBe("university_hall");
    expect(archetypeOfTags(["consulate"])).toBe("embassy");
    expect(archetypeOfTags(["council"])).toBe("council_chamber");
    expect(archetypeOfTags(["lodging_house"])).toBe("boarding_house");
    expect(archetypeOfTags(["gate_lodge"])).toBe("gate_lodge");
    expect(archetypeOfTags(["gatekeepers_lodge"])).toBe("gate_lodge");
    // The near misses, every one of them deliberate and every one of them a
    // theft this table would otherwise have committed.
    expect(archetypeOfTags(["market"])).toBe("market_stall");
    expect(archetypeOfTags(["stall"])).toBe("market_stall");
    expect(archetypeOfTags(["shop"])).toBe("general_store");
    expect(archetypeOfTags(["grocer"])).toBe("general_store");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["trade"])).toBe("inn");
    expect(archetypeOfTags(["inn"])).toBe("inn");
    expect(archetypeOfTags(["hall"])).toBe("hall");
    expect(archetypeOfTags(["court"])).toBe("courthouse");
    expect(archetypeOfTags(["academy"])).toBe("school");
    expect(archetypeOfTags(["hospice"])).toBe("almshouse");
    expect(archetypeOfTags(["lodging"])).toBe("hotel");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      const facade = commerceFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(commerceFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("cinema").roof).toBe("flat");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(5);
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("wave 5B buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  /**
   * The shared detector, not a local `freeCells` harness: it walks a 1x2 body
   * from the cell inside the front door, so head-height blocks, stair mounts
   * and drops are all modelled, and a region connected to itself but not to
   * the way in fails where 4-connectivity of the empty cells would pass it.
   */
  it("leaves every ground floor walkable from the door, with no pockets", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const report = assertNoPockets(result, { label });
          expect(report.reachable.length, label).toBeGreaterThan(3);
        }
      }
    }
  });

  /** The lantern lesson, as a property: the light's column is not the route. */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const it = result.meta.interior;
          const lamp: readonly [number, number] = [
            Math.floor((it.x0 + it.x1) / 2),
            Math.floor((it.z0 + it.z1) / 2),
          ];
          const label = `${a} ${size.join("x")} floors=${floors} without the lantern cell`;
          const report = walkabilityReport(result, { exclude: [lamp] });
          expect(report.pocket, `${label}\n${report.map}`).toEqual([]);
        }
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
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
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const [sx, , sz] = result.meta.size;
        const ceiling = result.meta.roofTop + ROOF_FLOURISH_RISE;
        const outside = result.ops.filter(
          (op) =>
            op.block !== "air" &&
            (op.x < -1 || op.x > sx || op.z < -1 || op.z > sz || op.y > ceiling),
        );
        expect(
          outside.slice(0, 4).map((op) => `${op.block}@${op.x},${op.y},${op.z}`),
          `${a} ${size.join("x")} outside the envelope`,
        ).toEqual([]);
      }
    }
  });

  it("builds the thing each archetype is for", () => {
    // Commerce.
    expect(has(build("shopping_mall"), "smooth_quartz"), "the promenade").toBe(true);
    expect(has(build("shopping_mall"), "loom"), "a shop bay").toBe(true);
    expect(has(build("department_store"), "smithing_table"), "a department").toBe(true);
    expect(has(build("department_store"), "white_wool"), "a mannequin").toBe(true);
    expect(has(build("food_court"), "smoker"), "the stalls").toBe(true);
    expect(has(build("food_court"), "orange_wall_banner"), "the menu").toBe(true);
    expect(has(build("auction_house"), "lectern"), "the rostrum").toBe(true);
    expect(has(build("auction_house"), "red_wall_banner"), "the sold-banners").toBe(true);
    expect(has(build("caravanserai"), "hay_block"), "the hay store").toBe(true);
    expect(has(build("caravanserai"), "red_carpet"), "the pack tack").toBe(true);
    expect(has(build("spice_market"), "orange_terracotta"), "the sacks").toBe(true);
    expect(has(build("spice_market"), "iron_bars"), "the hanging bunches").toBe(true);
    expect(has(build("shop_row"), "stone_bricks"), "the shopfront piers").toBe(true);
    // Civic.
    expect(has(build("university_hall"), "bookshelf"), "the book wall").toBe(true);
    expect(has(build("university_hall"), "lectern"), "the dais").toBe(true);
    expect(has(build("embassy"), "blue_wall_banner"), "the flag wall").toBe(true);
    expect(has(build("embassy"), "iron_trapdoor"), "the records room").toBe(true);
    expect(has(build("council_chamber"), "lectern"), "the speaker").toBe(true);
    expect(has(build("council_chamber"), "purple_wall_banner"), "the chamber banner").toBe(true);
    // Residential.
    expect(has(build("boarding_house"), "white_bed"), "the rooms").toBe(true);
    expect(has(build("boarding_house"), "brown_wall_banner"), "the house rules").toBe(true);
    expect(has(build("gate_lodge"), "crafting_table"), "the gatekeeper's bench").toBe(true);
  });

  /**
   * The seat rule, geometrically, on every building with a bank in it.
   *
   * A stair's `facing` names its **high half** — the backrest. So a seat
   * looking at a rostrum on the north wall carries `facing: "south"`.
   */
  it("turns every seat bank away from the thing it faces", () => {
    for (const a of ["auction_house", "university_hall", "food_court"]) {
      const result = build(a, [13, 14, 19]);
      const it = result.meta.interior;
      const door = result.meta.door;
      expect(door, a).not.toBeNull();
      const headNorth = (door?.z ?? it.z1) > (it.z0 + it.z1) / 2;
      const expected = headNorth ? "south" : "north";
      const seats = result.ops.filter(
        (op) =>
          op.y === 1 &&
          op.block.endsWith("_stairs") &&
          op.props?.["half"] === "bottom" &&
          op.x > it.x0 &&
          op.x < it.x1,
      );
      expect(seats.length, `${a} has a bank`).toBeGreaterThan(4);
      for (const seat of seats) {
        expect(seat.props?.["facing"], `${a} seat at ${seat.x},${seat.z}`).toBe(expected);
      }
    }
  });

  /** Flat banks, never raked: a riser is a stair a body has to stand on. */
  it("never rakes a seat bank", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const at = new Set(
          result.ops
            .filter((op) => op.block.endsWith("_stairs") && op.props?.["half"] === "bottom")
            .map((op) => `${op.x},${op.y},${op.z}`),
        );
        const raised = [...at].filter((k) => {
          const [x, y, z] = k.split(",").map(Number) as [number, number, number];
          return y >= 2 && at.has(`${x},${y - 1},${z}`);
        });
        expect(raised.length, `${a} ${size.join("x")} raked rows`).toBe(0);
      }
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks anywhere: a menu, a flag and a house rule are banners. */
  it("never places a sign block", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) expect(op.block.endsWith("_sign"), a).toBe(false);
    }
  });

  /** `chain` is missing from the pinned 1.21.11 table: a bunch is iron bars. */
  it("never places a chain", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "chain"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No loose fluid: a cauldron or nothing. */
  it("never writes a loose fluid or a waterlogged block", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const label = `${a} ${size.join("x")}`;
        for (const op of result.ops) {
          expect(op.block, label).not.toBe("water");
          expect(op.block, label).not.toBe("lava");
          expect(op.props?.["waterlogged"] ?? "false", `${label} at ${op.x},${op.y},${op.z}`).toBe(
            "false",
          );
        }
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of COMMERCE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
