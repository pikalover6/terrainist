/**
 * Archetype wave 4C: twelve leisure, modern and science interiors.
 *
 * Held to wave two's contract, verbatim, because a new archetype that needs a
 * new kind of guarantee is a new archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever;
 * - it never routes the floor through the lantern column, and it never places
 *   a bare `flower_pot`.
 *
 * Plus three this wave adds:
 *
 * - **the seat rule, twice.** Every seat in every bank faces *away* from the
 *   stage, the screen or the lectern — a stair's `facing` is its backrest;
 * - **flat banks.** No seat is a riser: nothing in a bank sits above `y = 1`;
 * - **the sauna is dry.** Not one water cell, not one waterlogged block.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  LEISURE_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isLeisureArchetype,
  leisureFacadeDefaults,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x1e15e4cn, "world.leisure");
const OTHER = nodeSeed(0x1e15e4cn, "world.leisure.other");
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
  const facade = leisureFacadeDefaults(archetype);
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
  // Physics-true: a carpet or plate is a route, and a cell whose head course
  // is blocked (a low-slung lantern, the flight's second step) is no demand.
  for (const cell of result.meta.floorCells) {
    if (!passableBlock(at.get(`${cell.x},1,${cell.z}`)?.block)) continue;
    if (!passableBlock(at.get(`${cell.x},2,${cell.z}`)?.block)) continue;
    free.push(`${cell.x},${cell.z}`);
  }
  return free;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("wave 4C archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isLeisureArchetype(a)).toBe(true);
    }
    expect(isLeisureArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["theater"])).toBe("theater");
    expect(archetypeOfTags(["theatre"])).toBe("theater");
    expect(archetypeOfTags(["opera"])).toBe("opera_house");
    expect(archetypeOfTags(["movie_theater"])).toBe("cinema");
    expect(archetypeOfTags(["ballroom"])).toBe("dance_hall");
    expect(archetypeOfTags(["boxing"])).toBe("boxing_gym");
    expect(archetypeOfTags(["dry_sauna"])).toBe("sauna");
    expect(archetypeOfTags(["sweat_lodge"])).toBe("sauna");
    expect(archetypeOfTags(["ski_lodge"])).toBe("ski_lodge");
    expect(archetypeOfTags(["club"])).toBe("clubhouse");
    expect(archetypeOfTags(["glass_pavilion"])).toBe("glass_pavilion");
    expect(archetypeOfTags(["corner_shop"])).toBe("convenience_store");
    expect(archetypeOfTags(["lab"])).toBe("laboratory");
    expect(archetypeOfTags(["auditorium"])).toBe("lecture_hall");
    // The near misses, every one of them deliberate. `sauna` is the
    // BATHHOUSE's — the town wave claimed it first, and it is the wetter
    // building; `gym` and `fitness` are the blitz gym's; `store`, `shop` and
    // `grocer` belong to the granary and the general store; `lodging` is the
    // high-rise hotel's; bare `hall` still means a great hall.
    expect(archetypeOfTags(["sauna"])).toBe("bathhouse");
    expect(archetypeOfTags(["baths"])).toBe("bathhouse");
    expect(archetypeOfTags(["gym"])).toBe("gym");
    expect(archetypeOfTags(["fitness"])).toBe("gym");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["shop"])).toBe("general_store");
    expect(archetypeOfTags(["lodging"])).toBe("hotel");
    expect(archetypeOfTags(["hall"])).toBe("hall");
    expect(archetypeOfTags(["school"])).toBe("school");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      const facade = leisureFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(leisureFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("bathhouse").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(4);
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("wave 4C buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
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

  /** The lantern lesson, as a property: the light's column is not the route. */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const it = result.meta.interior;
          const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
          const free = freeCells(result).filter((k) => k !== lamp);
          expect(
            oneRegion(free),
            `${a} ${size.join("x")} floors=${floors} without the lantern cell`,
          ).toBe(true);
        }
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
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
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const [sx, , sz] = result.meta.size;
        const ceiling = result.meta.roofTop + ROOF_FLOURISH_RISE;
        // Collected rather than asserted per op: these envelopes run to tens
        // of thousands of ops apiece, and one `expect` per op per axis is a
        // test that times out rather than a test that fails.
        const outside = result.ops.filter(
          (op) =>
            op.block !== "air" && // clearing is not building
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
    // Leisure.
    expect(has(build("theater"), "red_wall_banner"), "wing curtains").toBe(true);
    expect(has(build("opera_house"), "quartz_block"), "the proscenium").toBe(true);
    expect(has(build("opera_house"), "red_concrete"), "the runner").toBe(true);
    expect(has(build("cinema"), "white_concrete"), "the screen").toBe(true);
    expect(has(build("cinema"), "black_concrete"), "the screen's trim").toBe(true);
    expect(has(build("dance_hall"), "jukebox"), "the band").toBe(true);
    expect(has(build("dance_hall"), "note_block"), "the band").toBe(true);
    expect(has(build("boxing_gym"), "red_wool"), "the mats").toBe(true);
    expect(has(build("sauna"), "campfire"), "the hot stones").toBe(true);
    expect(has(build("ski_lodge"), "stripped_spruce_log"), "the mantel").toBe(true);
    expect(has(build("ski_lodge"), "brown_wool"), "the furs").toBe(true);
    expect(has(build("clubhouse"), "gold_block"), "the trophy").toBe(true);
    // Modern.
    expect(has(build("glass_pavilion"), "glass"), "the glazing").toBe(true);
    expect(has(build("convenience_store"), "iron_trapdoor"), "the cold cabinets").toBe(true);
    expect(has(build("convenience_store"), "iron_bars"), "the counter grille").toBe(true);
    // Science.
    expect(has(build("laboratory"), "brewing_stand"), "the glassware").toBe(true);
    expect(has(build("laboratory"), "black_concrete"), "the board").toBe(true);
    expect(has(build("lecture_hall"), "lectern"), "the lectern").toBe(true);
    expect(has(build("lecture_hall"), "black_concrete"), "the board").toBe(true);
  });

  /**
   * The seat rule, geometrically, on every building with a bank in it.
   *
   * A stair's `facing` names its **high half** — the backrest. So a seat
   * looking at a stage on the north wall carries `facing: "south"`. The wrong
   * convention is invisible in a block list and sits the whole house with its
   * back to the show; this asserts the direction.
   */
  it("turns every seat bank away from the thing it faces", () => {
    for (const a of ["theater", "opera_house", "cinema", "lecture_hall"]) {
      const result = build(a, [13, 14, 19]);
      const it = result.meta.interior;
      const door = result.meta.door;
      expect(door, a).not.toBeNull();
      const stageNorth = (door?.z ?? it.z1) > (it.z0 + it.z1) / 2;
      const expected = stageNorth ? "south" : "north";
      // The bank only: the opera house's box seats are on the two wall
      // columns and look *across* the room at the stage, which is a different
      // seat with a different rule.
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

  /**
   * Flat banks, never raked.
   *
   * A riser is a stair a body stands **on**, and a stander needs
   * `floors < 2 || storyHeight >= 4`. Every seat in this wave therefore sits
   * on the floor plane: no interior stair above `y = 1`.
   */
  it("never rakes a seat bank", () => {
    for (const a of ["theater", "opera_house", "cinema", "lecture_hall"]) {
      for (const size of SIZES) {
        const result = build(a, size);
        // A riser is a seat standing **on** another seat, so the signature is
        // a column with a bottom-half stair at `y = 1` and another above it.
        // The shell's own inter-storey flight climbs a reserved column no
        // fit-out may write into, so it cannot produce this pair.
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

  /** The sauna is the bathhouse's DRY cousin: not one water cell. */
  it("never puts water in the sauna", () => {
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        const result = build("sauna", size, { floors });
        const label = `sauna ${size.join("x")} floors=${floors}`;
        for (const op of result.ops) {
          expect(op.block, label).not.toBe("water");
          expect(op.props?.["waterlogged"] ?? "false", `${label} at ${op.x},${op.y},${op.z}`).toBe(
            "false",
          );
          if (op.block === "cauldron") expect(op.props?.["level"], label).toBe("0");
        }
      }
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks anywhere: a marquee is a banner row. */
  it("never places a sign block", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) expect(op.block.endsWith("_sign"), a).toBe(false);
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of LEISURE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
