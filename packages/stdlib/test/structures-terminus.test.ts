/**
 * Archetype wave 6A: twelve transport buildings.
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
 * Plus the wave's own five:
 *
 * - **the seat rule.** Every seat in the terminal's departure bank faces *away*
 *   from the check-in counter — a stair's `facing` is its backrest;
 * - **flat banks.** No seat is a riser: nothing in a bank sits above `y = 1`;
 * - **the slip predicate, cell for cell.** Every water cell the boathouse writes
 *   is in the floor plane, has written floor under it and pool-or-solid on all
 *   four sides, and carries nothing at all above it. Nothing else in the wave
 *   writes a fluid;
 * - **no `chain`, no plain `mud`.** Neither belongs in this stack — one is
 *   missing from the pinned 1.21.11 block table, the other has a sub-full
 *   hitbox and cannot be a floor plane;
 * - **the turret lesson.** Every topper the lighthouse and the control tower
 *   put in the air stands on a continuous column down to the roof deck.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  TERMINUS_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isTerminusArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  terminusFacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x6a07a11n, "world.terminus");
const OTHER = nodeSeed(0x6a07a11n, "world.terminus.other");
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
  const facade = terminusFacadeDefaults(archetype);
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

describe("wave 6A archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isTerminusArchetype(a)).toBe(true);
    }
    expect(isTerminusArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["train_station"])).toBe("train_station");
    expect(archetypeOfTags(["railway_station"])).toBe("train_station");
    // Bare `station` was left free by wave 5D on purpose; this is the claim.
    expect(archetypeOfTags(["station"])).toBe("train_station");
    expect(archetypeOfTags(["signal_box"])).toBe("signal_box");
    expect(archetypeOfTags(["signal_cabin"])).toBe("signal_box");
    // Bare `roundhouse` is the ENGINE shed's, which is what the catalog id has
    // always meant; the hut answers to `thatched_roundhouse`.
    expect(archetypeOfTags(["roundhouse"])).toBe("roundhouse");
    expect(archetypeOfTags(["engine_shed"])).toBe("roundhouse");
    expect(archetypeOfTags(["engine_roundhouse"])).toBe("roundhouse");
    expect(archetypeOfTags(["thatched_roundhouse"])).toBe("thatched_roundhouse");
    expect(archetypeOfTags(["wattle"])).toBe("thatched_roundhouse");
    expect(archetypeOfTags(["coach_house"])).toBe("coach_house");
    expect(archetypeOfTags(["carriage_house"])).toBe("coach_house");
    expect(archetypeOfTags(["toll_house"])).toBe("toll_house");
    expect(archetypeOfTags(["tollbooth"])).toBe("toll_house");
    expect(archetypeOfTags(["transit_hub"])).toBe("transit_hub");
    expect(archetypeOfTags(["bus_station"])).toBe("transit_hub");
    expect(archetypeOfTags(["hub"])).toBe("transit_hub");
    expect(archetypeOfTags(["control_tower"])).toBe("control_tower");
    expect(archetypeOfTags(["air_traffic_control"])).toBe("control_tower");
    expect(archetypeOfTags(["airport_terminal"])).toBe("airport_terminal");
    expect(archetypeOfTags(["terminal"])).toBe("airport_terminal");
    expect(archetypeOfTags(["airport"])).toBe("airport_terminal");
    expect(archetypeOfTags(["boathouse"])).toBe("boathouse");
    expect(archetypeOfTags(["boat_shed"])).toBe("boathouse");
    expect(archetypeOfTags(["shipyard"])).toBe("shipyard");
    expect(archetypeOfTags(["drydock"])).toBe("shipyard");
    expect(archetypeOfTags(["lighthouse"])).toBe("lighthouse");
    expect(archetypeOfTags(["pharos"])).toBe("lighthouse");
    expect(archetypeOfTags(["climbing_wall"])).toBe("climbing_wall");
    expect(archetypeOfTags(["bouldering"])).toBe("climbing_wall");
    // The near misses, every one of them deliberate and every one of them a
    // theft this table would otherwise have committed.
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["tower_block"])).toBe("skyscraper");
    expect(archetypeOfTags(["depot"])).toBe("warehouse");
    expect(archetypeOfTags(["weather_station"])).toBe("weather_station");
    expect(archetypeOfTags(["field_station"])).toBe("field_station");
    expect(archetypeOfTags(["research_station"])).toBe("field_station");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      const facade = terminusFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(terminusFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("embassy").roof).toBe("hip");
    expect(archetypeFacadeDefaults("planetarium").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(6);
      expect(entry?.note, a).toBeDefined();
      // Eleven of the twelve sit in prop-kind transport groups; the catalog
      // entry overrides the group's kind, as the curtain wall does the other
      // way round. All twelve must read as buildings.
      expect(entry?.kind, a).toBe("building");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("wave 6A buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
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
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
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
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
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
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
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
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
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
    // Rail.
    expect(has(build("train_station"), "rail"), "the platform track").toBe(true);
    expect(has(build("train_station"), "yellow_terracotta"), "the platform edge").toBe(true);
    expect(has(build("signal_box"), "furnace"), "the signalman's stove").toBe(true);
    expect(has(build("roundhouse"), "rail"), "the engine stubs").toBe(true);
    expect(has(build("roundhouse"), "polished_blackstone"), "the inspection pit").toBe(true);
    expect(has(build("roundhouse"), "anvil"), "the fitter's bench").toBe(true);
    // Road.
    expect(has(build("coach_house"), "hay_block"), "the hay corner").toBe(true);
    expect(has(build("coach_house"), "packed_mud"), "the bay floor").toBe(true);
    expect(has(build("toll_house"), "iron_bars"), "the strongbox grille").toBe(true);
    expect(has(build("transit_hub"), "yellow_concrete"), "the bay markers").toBe(true);
    expect(has(build("transit_hub"), "green_wall_banner"), "the route wall").toBe(true);
    // Air.
    expect(has(build("control_tower"), "gray_concrete"), "the shaft").toBe(true);
    expect(has(build("control_tower"), "daylight_detector"), "the radar dish").toBe(true);
    expect(has(build("airport_terminal"), "light_blue_concrete"), "the gates").toBe(true);
    expect(has(build("airport_terminal"), "lectern"), "the check-in desk").toBe(true);
    // Water, and the wall.
    expect(has(build("boathouse"), "water"), "the slip").toBe(true);
    expect(has(build("boathouse"), "smooth_stone"), "the coping").toBe(true);
    expect(has(build("shipyard"), "stripped_oak_log"), "the keel and ribs").toBe(true);
    expect(has(build("lighthouse"), "red_terracotta"), "the bands").toBe(true);
    expect(has(build("lighthouse"), "sea_lantern"), "the lamp").toBe(true);
    expect(has(build("climbing_wall"), "stone_button"), "the holds").toBe(true);
    expect(has(build("climbing_wall"), "blue_wool"), "the crash mats").toBe(true);
  });

  /**
   * The seat rule, geometrically, on the one building here with a bank in it.
   *
   * A stair's `facing` names its **high half** — the backrest. So a seat looking
   * at a check-in counter on the north wall carries `facing: "south"`.
   */
  it("turns the departure bank away from the thing it faces", () => {
    const result = build("airport_terminal", [15, 14, 21]);
    const it = result.meta.interior;
    const door = result.meta.door;
    expect(door).not.toBeNull();
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
    expect(seats.length, "the terminal has a bank").toBeGreaterThan(4);
    for (const seat of seats) {
      expect(seat.props?.["facing"], `seat at ${seat.x},${seat.z}`).toBe(expected);
    }
  });

  /** Flat banks, never raked: a riser is a stair a body has to stand on. */
  it("never rakes a seat bank", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
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
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks anywhere: a departure board and a rate board are banners. */
  it("never places a sign block", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) expect(op.block.endsWith("_sign"), a).toBe(false);
    }
  });

  /**
   * `chain` is missing from the pinned 1.21.11 table, and plain `mud` has a
   * sub-full hitbox — neither belongs in this stack at all.
   */
  it("never places a chain, and never plain mud", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(has(result, "chain"), `${a} ${size.join("x")} chain`).toBe(false);
        expect(has(result, "mud"), `${a} ${size.join("x")} mud`).toBe(false);
      }
    }
  });

  /**
   * The slip predicate, cell for cell.
   *
   * The boathouse writes water into the floor plane inset one cell from the
   * interior on every side and rims it with a coping course, so every water cell
   * has written floor under it and pool-or-solid on all four sides, and nothing
   * ever stands on one. Nothing else in this wave writes a fluid at all.
   */
  it("boxes in every water cell the boathouse writes, and writes none elsewhere", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const label = `${a} ${size.join("x")}`;
        const fluid = result.ops.filter((op) => op.block === "water" || op.block === "lava");
        if (a !== "boathouse") {
          expect(fluid.map((op) => op.block), label).toEqual([]);
          continue;
        }
        expect(fluid.every((op) => op.block === "water"), label).toBe(true);
        const at = indexOf(result.ops);
        const water = new Set(fluid.map((op) => `${op.x},${op.z}`));
        for (const cell of fluid) {
          expect(cell.y, `${label}: the slip is in the floor plane`).toBe(0);
          // Beside: pool, or a floor cell written solid.
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = cell.x + dx;
            const nz = cell.z + dz;
            if (water.has(`${nx},${nz}`)) continue;
            const beside = at.get(`${nx},0,${nz}`);
            expect(beside, `${label}: beside the slip at ${cell.x},${cell.z}`).toBeDefined();
            expect(beside?.block, `${label}: beside the slip at ${cell.x},${cell.z}`).not.toBe(
              "air",
            );
          }
          // Above: nothing at all. No prop ever stands on a slip cell.
          const over = at.get(`${cell.x},1,${cell.z}`);
          expect(
            over === undefined || over.block === "air",
            `${label}: something stands on the slip at ${cell.x},${cell.z} (${over?.block})`,
          ).toBe(true);
        }
      }
    }
  });

  /** Nothing is waterlogged: the slip is a floor plane, not a wet prop. */
  it("never waterlogs a block", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        for (const op of result.ops) {
          expect(
            op.props?.["waterlogged"] ?? "false",
            `${a} ${size.join("x")} at ${op.x},${op.y},${op.z}`,
          ).toBe("false");
        }
      }
    }
  });

  /**
   * The turret lesson: a single-block topper stands on a continuous column.
   *
   * The lighthouse's lamp and the control tower's dish are both raised from a
   * solid roof deck, so the cell directly under each of them is written and is
   * not air, all the way down to the deck course.
   */
  it("stands every roof topper on a continuous column", () => {
    for (const [a, topper] of [
      ["lighthouse", "sea_lantern"],
      ["control_tower", "daylight_detector"],
    ] as const) {
      const result = build(a, [13, 20, 13]);
      const at = indexOf(result.ops);
      const tops = result.ops.filter((op) => op.block === topper);
      expect(tops.length, `${a} has a topper`).toBeGreaterThan(0);
      for (const top of tops) {
        for (let y = top.y - 1; y >= result.meta.wallTop + 1; y--) {
          const under = at.get(`${top.x},${y},${top.z}`);
          expect(under, `${a} column at ${top.x},${y},${top.z}`).toBeDefined();
          expect(under?.block, `${a} column at ${top.x},${y},${top.z}`).not.toBe("air");
        }
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of TERMINUS_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
