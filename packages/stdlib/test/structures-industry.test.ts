/**
 * Wave 5C — the twelve industry and modern archetypes, held to the earlier
 * waves' contract.
 *
 * The battery is deliberately the *same* one wave two and wave 3B were held
 * to, because a new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about:
 *
 * - it registers, resolves and reads off a node's tags without stealing one an
 *   earlier table already claims;
 * - it puts something in the room it built, and the room stays **walkable from
 *   the door** — measured with the shared pocket detector, across one and two
 *   storeys and three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever.
 *
 * Plus the field lessons, one test each: the lantern column, no bare pots, no
 * sign blocks, no chains — and three this wave adds, one per archetype that
 * paid for it: **no lava anywhere**, the charcoal burner's **solid mound cap**,
 * and the gas station's **grounded canopy posts**.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  INDUSTRY_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  industryFacadeDefaults,
  isIndustryArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa11e5n, "world.industry");
const OTHER = nodeSeed(0xa11e5n, "world.industry.other");
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
  const facade = industryFacadeDefaults(archetype);
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

/** An op index, keyed by cell. Later ops win, exactly as emit writes them. */
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

describe("wave-5C industry archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isIndustryArchetype(a)).toBe(true);
    }
    expect(isIndustryArchetype("cottage")).toBe(false);
    expect(isIndustryArchetype("foundry")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["brickworks"])).toBe("brickworks");
    expect(archetypeOfTags(["brickyard"])).toBe("brickworks");
    expect(archetypeOfTags(["blast_furnace_works"])).toBe("blast_furnace_works");
    expect(archetypeOfTags(["blast_furnace"])).toBe("blast_furnace_works");
    expect(archetypeOfTags(["factory_hall"])).toBe("factory_hall");
    expect(archetypeOfTags(["factory"])).toBe("factory_hall");
    expect(archetypeOfTags(["machine_shop"])).toBe("machine_shop");
    expect(archetypeOfTags(["machinist"])).toBe("machine_shop");
    expect(archetypeOfTags(["refinery"])).toBe("refinery");
    expect(archetypeOfTags(["oil_refinery"])).toBe("refinery");
    expect(archetypeOfTags(["charcoal_burner"])).toBe("charcoal_burner");
    expect(archetypeOfTags(["charcoal"])).toBe("charcoal_burner");
    expect(archetypeOfTags(["collier"])).toBe("charcoal_burner");
    expect(archetypeOfTags(["ropewalk"])).toBe("ropewalk");
    expect(archetypeOfTags(["ropery"])).toBe("ropewalk");
    expect(archetypeOfTags(["parking_garage"])).toBe("parking_garage");
    expect(archetypeOfTags(["car_park"])).toBe("parking_garage");
    expect(archetypeOfTags(["gas_station"])).toBe("gas_station");
    expect(archetypeOfTags(["filling_station"])).toBe("gas_station");
    expect(archetypeOfTags(["petrol_station"])).toBe("gas_station");
    expect(archetypeOfTags(["data_center"])).toBe("data_center");
    expect(archetypeOfTags(["datacenter"])).toBe("data_center");
    expect(archetypeOfTags(["server_farm"])).toBe("data_center");
    expect(archetypeOfTags(["conference_center"])).toBe("conference_center");
    expect(archetypeOfTags(["convention_center"])).toBe("conference_center");
    expect(archetypeOfTags(["brutalist_block"])).toBe("brutalist_block");
    expect(archetypeOfTags(["brutalist"])).toBe("brutalist_block");
    // The near misses. Every one is a tag an earlier table owns, and claiming
    // any of them would have been a silent theft.
    expect(archetypeOfTags(["kiln"])).toBe("kiln");
    expect(archetypeOfTags(["foundry"])).toBe("foundry");
    expect(archetypeOfTags(["casting"])).toBe("foundry");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["craft"])).toBe("smithy");
    expect(archetypeOfTags(["shop"])).toBe("general_store");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["auditorium"])).toBe("lecture_hall");
    expect(archetypeOfTags(["hall"])).toBe("hall");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
      const facade = industryFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      // The dispatch chain: `archetypeFacadeDefaults` must fall through to us.
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(industryFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("foundry").roof).toBe("hip");
    expect(archetypeFacadeDefaults("cinema").windowRhythm).toBeDefined();
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
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

describe("wave-5C industry buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  /**
   * The shared pocket detector, not a local `freeCells` harness: it walks a 1x2
   * body from the cell inside the door, so head-height blocks, stair mounts and
   * drops are all modelled, and a region connected to itself but not to the way
   * in fails where plain 4-connectivity passed it.
   */
  it("leaves every ground floor walkable from the door, with no pockets", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
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

  /**
   * The lantern lesson, as a property.
   *
   * `core.ts` hangs a lantern over the middle column of the room at head
   * height, so that column is not walk-through. A fit-out whose only route
   * crosses it has built a room with a wall in the middle of it.
   */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
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
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
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
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
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
    // Industrial.
    expect(has(build("brickworks"), "bricks"), "the kiln core").toBe(true);
    expect(has(build("brickworks"), "packed_mud"), "the clay bays").toBe(true);
    expect(has(build("blast_furnace_works"), "blast_furnace"), "the bank").toBe(true);
    expect(has(build("blast_furnace_works"), "waxed_copper_block"), "the tuyeres").toBe(true);
    expect(has(build("factory_hall"), "smithing_table"), "the machine rows").toBe(true);
    expect(has(build("factory_hall"), "lectern"), "the clocking desk").toBe(true);
    expect(has(build("machine_shop"), "stonecutter"), "the lathes").toBe(true);
    expect(has(build("machine_shop"), "anvil"), "the bench end").toBe(true);
    expect(has(build("refinery"), "waxed_copper_block"), "the pipe run").toBe(true);
    expect(has(build("refinery"), "lever"), "the control desk").toBe(true);
    expect(has(build("charcoal_burner"), "coarse_dirt"), "the burn pile").toBe(true);
    expect(has(build("charcoal_burner"), "podzol"), "the clearing").toBe(true);
    expect(has(build("ropewalk"), "white_wool"), "the rope lines").toBe(true);
    expect(has(build("ropewalk"), "iron_bars"), "the winding drums").toBe(true);
    // Modern.
    expect(has(build("parking_garage"), "white_concrete"), "the bay stripes").toBe(true);
    expect(has(build("parking_garage"), "iron_bars"), "the barrier arm").toBe(true);
    expect(has(build("gas_station"), "iron_block"), "the pumps").toBe(true);
    expect(has(build("gas_station"), "yellow_wall_banner"), "the price board").toBe(true);
    expect(has(build("data_center"), "iron_block"), "the racks").toBe(true);
    expect(has(build("data_center"), "light_gray_concrete"), "the raised floor").toBe(true);
    expect(has(build("conference_center"), "blue_wall_banner"), "the house banners").toBe(true);
    expect(has(build("conference_center"), "oak_stairs"), "the seat bank").toBe(true);
    expect(has(build("brutalist_block"), "gray_concrete"), "the concrete field").toBe(true);
    expect(has(build("brutalist_block"), "polished_andesite"), "the fins").toBe(true);
  });

  /**
   * The seat rule, stated the only way it can be checked: geometrically.
   *
   * A stair's `facing` names its **high half** — the backrest — so a seat
   * looking at the stage carries the cardinal pointing *away* from the stage.
   */
  it("turns conference seats away from the stage they face", () => {
    const result = build("conference_center", [15, 15, 19]);
    const it = result.meta.interior;
    const door = result.meta.door;
    const stageNorth = door === null ? true : door.z > (it.z0 + it.z1) / 2;
    // The backrest points away from the stage: stage north means the sitter
    // looks north, so the stair faces south.
    const expected = stageNorth ? "south" : "north";
    const lampX = Math.floor((it.x0 + it.x1) / 2);
    const seats = result.ops.filter(
      (op) =>
        op.y === 1 &&
        op.block === "oak_stairs" &&
        op.props?.["half"] === "bottom" &&
        Math.abs(op.x - lampX) > 1 &&
        op.x > it.x0 &&
        op.x < it.x1,
    );
    expect(seats.length).toBeGreaterThan(3);
    for (const seat of seats) {
      expect(seat.props?.["facing"], `seat at ${seat.x},${seat.z}`).toBe(expected);
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /**
   * No lava. Anywhere. Ever.
   *
   * Half this wave is a furnace of some kind, and the temptation to pour a
   * source block into a blast-furnace works or a refinery is exactly the one
   * the physics lint's zero-unstable-fluids rule exists to refuse. Every
   * liquid here is a `cauldron`, which is a container rather than a source, and
   * every fire is a `campfire` on a solid pedestal on a wall row.
   */
  it("never writes lava, water, or a waterlogged prop", () => {
    const FLUID = new Set(["lava", "flowing_lava", "water", "flowing_water"]);
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const fluids = result.ops.filter((op) => FLUID.has(op.block)).map((op) => op.block);
          expect(fluids, label).toEqual([]);
          const wet = result.ops
            .filter((op) => op.props?.["waterlogged"] !== undefined)
            .filter((op) => op.props?.["waterlogged"] !== "false")
            .map((op) => op.block);
          expect(wet, label).toEqual([]);
        }
      }
    }
  });

  /**
   * No sign blocks and no chains.
   *
   * A sign is a paired block entity the local op stream cannot carry, so all
   * signage here is a wall banner; `chain` is absent from the 1.21.11 block
   * table this emitter is pinned to, so anything hanging is `iron_bars`.
   */
  it("never writes a sign block or a chain", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const bad = build(a, size)
          .ops.filter((op) => op.block.endsWith("_sign") || op.block === "chain")
          .map((op) => op.block);
        expect(bad, `${a} ${size.join("x")}`).toEqual([]);
      }
    }
  });

  /**
   * The charcoal burner's mound closes on a **solid** cap.
   *
   * The homestead's corbel lesson: a partial block in the middle of a mound is
   * a hole a body drops into. The top course of the burn pile is a full block —
   * never a slab, a stair, a wall or a fence.
   */
  it("caps the charcoal burner's mound with a solid block", () => {
    for (const size of SIZES) {
      const result = build("charcoal_burner", size);
      const at = indexOf(result.ops);
      const it = result.meta.interior;
      const lampX = Math.floor((it.x0 + it.x1) / 2);
      const mound = result.ops.filter((op) => op.y === 1 && op.block === "coarse_dirt");
      expect(mound.length, `${size.join("x")} burn pile`).toBeGreaterThan(0);
      // Whatever stands over any mound cell must be solid, and the cap over the
      // pile's own column must be one too.
      for (const cell of mound) {
        const above = at.get(`${cell.x},2,${cell.z}`);
        if (above === undefined || above.block === "air") continue;
        expect(
          /(_slab|_stairs|_wall|_fence|_carpet|_trapdoor|_pane)$/.test(above.block),
          `${size.join("x")} cap at ${cell.x},2,${cell.z} is ${above.block}`,
        ).toBe(false);
      }
      // On a storey with the course to spare, the cap is actually built.
      if (size === BIG) {
        const caps = result.ops.filter((op) => op.y === 2 && op.block === "grass_block");
        expect(caps.length, "the turf cap").toBe(1);
        expect((caps[0] as LocalVoxelOp).x, "the cap sits over the pile").toBe(lampX);
      }
    }
  });

  /**
   * The gas station's canopy stands on the **actual ground**.
   *
   * The apron is not always at `y = 1`. Every column the forecourt writes above
   * ground level has something under it at `y = 0`, or its foot is air and the
   * support-chain rule fails.
   */
  it("grounds every gas-station canopy post", () => {
    for (const size of SIZES) {
      const result = build("gas_station", size);
      const at = indexOf(result.ops);
      const [sx, , sz] = result.meta.size;
      // The forecourt's own *columns*, and only those: the shell writes into
      // the apron too (eaves, shutters) and those hang off the wall, and the
      // canopy deck itself spans between posts rather than standing on ground.
      const COLUMNS = new Set(["polished_andesite", "iron_block", "lever"]);
      const inApron = (op: LocalVoxelOp): boolean =>
        op.x === -1 || op.x === sx || op.z === -1 || op.z === sz;
      const apron = result.ops.filter((op) => op.y >= 1 && COLUMNS.has(op.block) && inApron(op));
      expect(apron.length, `${size.join("x")} forecourt`).toBeGreaterThan(0);
      for (const op of apron) {
        const foot = at.get(`${op.x},0,${op.z}`);
        expect(
          foot !== undefined && foot.block !== "air",
          `${size.join("x")} apron ${op.block} at ${op.x},${op.y},${op.z} stands on air`,
        ).toBe(true);
      }
      // And the deck those posts hold up is actually there.
      const deck = result.ops.filter((op) => op.block === "smooth_stone_slab" && inApron(op));
      expect(deck.length, `${size.join("x")} canopy deck`).toBeGreaterThan(0);
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of INDUSTRY_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
