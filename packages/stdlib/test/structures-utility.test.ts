/**
 * Wave 6C — the ten waterworks and energy archetypes, plus the wave's two
 * props, held to the earlier waves' contract.
 *
 * The battery is deliberately the *same* one wave 5C was held to, because a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about:
 *
 * - it registers, resolves and reads off a node's tags without stealing one an
 *   earlier table already claims;
 * - it puts something in the room it built, and the room stays **walkable from
 *   the door** — measured with the shared pocket detector, across one and two
 *   storeys and three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever.
 *
 * Plus the field lessons, one test each — the lantern column, no bare pots, no
 * signs, no chains, no plain mud, no head-height obstruction on a three-course
 * storey — and four this wave adds, one per thing that could go wrong in it:
 *
 * - the **cistern's containment, cell for cell**: every water block boxed in on
 *   all four sides and stood on something, which is the bathhouse predicate
 *   this archetype copies verbatim, plus the walkway it must leave clear;
 * - the **water tower's drum continuity**: every course of the tank rests on
 *   the course below it or on the deck;
 * - the **coal tipple's trestle continuity**: every apron column reaches the
 *   ground, and the bin rests on the beam;
 * - the **turbine's mast and rotor**: a continuous column from the pad, and no
 *   blade block that does not touch the one inboard of it.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ENERGY_PROP_EXHIBIT_PLAN,
  ENERGY_PROP_NAMES,
  PROP_NAMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  TURBINE_HEIGHT_DEFAULT,
  UTILITY_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  energyPropFootprint,
  generateBuilding,
  generateProp,
  isEnergyProp,
  isUtilityArchetype,
  nodeSeed,
  propFootprint,
  resolveArchetype,
  rotateOps,
  structureById,
  utilityFacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x7111n, "world.utility");
const OTHER = nodeSeed(0x7111n, "world.utility.other");
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
  const facade = utilityFacadeDefaults(archetype);
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

describe("wave-6C utility archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(UTILITY_BUILDING_ARCHETYPES).toHaveLength(10);
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isUtilityArchetype(a)).toBe(true);
    }
    expect(isUtilityArchetype("cottage")).toBe(false);
    expect(isUtilityArchetype("refinery")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["water_tower"])).toBe("water_tower");
    expect(archetypeOfTags(["watertower"])).toBe("water_tower");
    expect(archetypeOfTags(["cistern"])).toBe("cistern");
    expect(archetypeOfTags(["reservoir"])).toBe("cistern");
    expect(archetypeOfTags(["well"])).toBe("well");
    expect(archetypeOfTags(["well_house"])).toBe("well");
    expect(archetypeOfTags(["pumping_station"])).toBe("pumping_station");
    expect(archetypeOfTags(["pump_house"])).toBe("pumping_station");
    expect(archetypeOfTags(["waterworks"])).toBe("pumping_station");
    expect(archetypeOfTags(["substation"])).toBe("substation");
    expect(archetypeOfTags(["transformer_station"])).toBe("substation");
    expect(archetypeOfTags(["gasworks"])).toBe("gasworks");
    expect(archetypeOfTags(["gasholder"])).toBe("gasworks");
    expect(archetypeOfTags(["gasometer"])).toBe("gasworks");
    expect(archetypeOfTags(["steam_plant"])).toBe("steam_plant");
    expect(archetypeOfTags(["powerhouse"])).toBe("steam_plant");
    expect(archetypeOfTags(["biomass_shed"])).toBe("biomass_shed");
    expect(archetypeOfTags(["biomass"])).toBe("biomass_shed");
    expect(archetypeOfTags(["battery_shed"])).toBe("battery_shed");
    expect(archetypeOfTags(["battery"])).toBe("battery_shed");
    expect(archetypeOfTags(["coal_tipple"])).toBe("coal_tipple");
    expect(archetypeOfTags(["tipple"])).toBe("coal_tipple");
    // The near misses. Every one is a tag an earlier table owns, and claiming
    // any of them would have been a silent theft.
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["baths"])).toBe("bathhouse");
    expect(archetypeOfTags(["gas_station"])).toBe("gas_station");
    expect(archetypeOfTags(["refinery"])).toBe("refinery");
    expect(archetypeOfTags(["barn"])).toBe("barn");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      const facade = utilityFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      // The dispatch chain: `archetypeFacadeDefaults` must fall through to us.
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(utilityFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("refinery").roof).toBe("flat");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(6);
      expect(entry?.kind, a).toBe("building");
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("wave-6C utility buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
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
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
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
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
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
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
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
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
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
    // Waterworks.
    expect(has(build("water_tower"), "iron_block"), "the tank banding").toBe(true);
    expect(has(build("water_tower"), "ladder"), "the shell ladder").toBe(true);
    expect(has(build("water_tower"), "cauldron"), "the valve house").toBe(true);
    expect(has(build("cistern"), "water"), "the stored water").toBe(true);
    expect(has(build("cistern"), "smooth_stone"), "the rim").toBe(true);
    expect(has(build("well"), "water_cauldron"), "the draw hole").toBe(true);
    expect(has(build("pumping_station"), "polished_andesite"), "the flywheel post").toBe(true);
    expect(has(build("pumping_station"), "iron_block"), "the pump rods").toBe(true);
    // Energy.
    expect(has(build("substation"), "lightning_rod"), "the transformer tanks").toBe(true);
    expect(has(build("substation"), "yellow_wall_banner"), "the warning banners").toBe(true);
    expect(has(build("gasworks"), "iron_block"), "the holder banding").toBe(true);
    expect(has(build("gasworks"), "furnace"), "the retort bench").toBe(true);
    expect(has(build("steam_plant"), "furnace"), "the boiler bank").toBe(true);
    expect(has(build("steam_plant"), "waxed_copper_block"), "the steam header").toBe(true);
    expect(has(build("biomass_shed"), "coarse_dirt"), "the chip bays").toBe(true);
    expect(has(build("biomass_shed"), "hopper"), "the intake").toBe(true);
    expect(has(build("battery_shed"), "waxed_copper_block"), "the cells").toBe(true);
    expect(has(build("battery_shed"), "light_gray_concrete"), "the plate grid").toBe(true);
    expect(has(build("coal_tipple"), "coal_block"), "the coal bays").toBe(true);
    expect(has(build("coal_tipple"), "deepslate_bricks"), "the bin").toBe(true);
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /**
   * No lava, and no water outside the cistern.
   *
   * The cistern is the one archetype in this wave allowed a fluid at all, and
   * it earns it by following the bathhouse pool predicate verbatim — tested
   * cell for cell below. Everything else that holds a liquid holds it in a
   * `cauldron`, which is a container rather than a source.
   */
  it("never writes lava, and never writes water outside the cistern", () => {
    const FLUID = new Set(["lava", "flowing_lava", "water", "flowing_water"]);
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const fluids = result.ops.filter((op) => FLUID.has(op.block)).map((op) => op.block);
          if (a === "cistern") {
            expect(new Set(fluids), label).toEqual(fluids.length === 0 ? new Set() : new Set(["water"]));
          } else {
            expect(fluids, label).toEqual([]);
          }
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
   * No sign blocks, no chains, and no plain mud.
   *
   * A sign is a paired block entity the local op stream cannot carry, so all
   * signage here is a wall banner; `chain` is absent from the 1.21.11 block
   * table this emitter is pinned to, so anything hanging is `iron_bars`; and
   * `mud` proper is a block a body sinks into, so every wet bay is `packed_mud`.
   */
  it("never writes a sign block, a chain or a plain mud floor", () => {
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const bad = build(a, size)
          .ops.filter(
            (op) => op.block.endsWith("_sign") || op.block === "chain" || op.block === "mud",
          )
          .map((op) => op.block);
        expect(bad, `${a} ${size.join("x")}`).toEqual([]);
      }
    }
  });

  /**
   * Nothing at head height on a three-course storey.
   *
   * The shell hangs its lantern at `y = 2`, which is where a walking body's head
   * goes, and under a three-course storey that band is the *only* one a body
   * occupies. Every dial, banner, drum and shelf in this file is gated on
   * `storyHeight >= 4`; this is that gate, asserted from the outside.
   */
  it("writes nothing at head height over an open floor on a short storey", () => {
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      const result = build(a, BIG, { floors: 2, floorHeight: 3 });
      const it = result.meta.interior;
      const at = indexOf(result.ops);
      for (const op of result.ops) {
        if (op.y !== 2) continue;
        if (op.x < it.x0 || op.x > it.x1 || op.z < it.z0 || op.z > it.z1) continue;
        // The shell's own circulation is not this file's to answer for: the
        // stair flight, the ladder and the hanging lantern are placed by
        // `core.ts` and guarded by it.
        if (/_stairs$|^ladder$|lantern$|_door$/.test(op.block)) continue;
        // Legal only where something stands under it: a shelf on a crate is a
        // stack, not an obstruction in the walking band.
        const below = at.get(`${op.x},1,${op.z}`);
        expect(
          below !== undefined && below.block !== "air",
          `${a}: ${op.block} floats at head height over ${op.x},${op.z}`,
        ).toBe(true);
      }
    }
  });

  /**
   * The cistern's water is boxed in, cell for cell.
   *
   * The bathhouse predicate, verbatim and re-derived here so a change to the
   * basin fails in the grammar's own suite rather than three packages
   * downstream: every water block has something solid under it, and either more
   * water or something solid on all four sides. The walkway is checked too —
   * the ring the inset leaves carries nothing, which is what keeps a one-wide
   * lane a lane.
   */
  it("boxes in every block of the cistern's water, and leaves its walkway clear", () => {
    for (const size of [BIG, [15, 15, 17], [11, 13, 13], [9, 11, 9]] as const) {
      const result = build("cistern", size);
      const at = indexOf(result.ops);
      const label = `cistern ${size.join("x")}`;
      const solid = (x: number, y: number, z: number): boolean => {
        const op = at.get(`${x},${y},${z}`);
        return op !== undefined && op.block !== "air";
      };
      const water = result.ops.filter((op) => op.block === "water");
      for (const cell of water) {
        expect(cell.y, `${label} water above the floor plane`).toBe(0);
        expect(solid(cell.x, cell.y - 1, cell.z), `${label} under ${cell.x},${cell.z}`).toBe(true);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          expect(
            solid(cell.x + dx, cell.y, cell.z + dz),
            `${label} beside ${cell.x},${cell.z} at ${cell.x + dx},${cell.z + dz}`,
          ).toBe(true);
        }
        // And nothing ever stands on a pool cell: the water is walked into,
        // not climbed over.
        const above = at.get(`${cell.x},1,${cell.z}`);
        expect(above, `${label} prop over water at ${cell.x},${cell.z}`).toBeUndefined();
      }
      // The walkway: the interior ring outside the pool carries nothing at
      // `y = 1` that a body cannot walk through.
      const it = result.meta.interior;
      const pool = new Set(water.map((op) => `${op.x},${op.z}`));
      if (pool.size > 0) {
        for (let x = it.x0; x <= it.x1; x++) {
          for (const z of [it.z0, it.z1]) {
            const op = at.get(`${x},1,${z}`);
            if (op === undefined) continue;
            expect(
              /_carpet$|_button$|_pressure_plate$|^air$/.test(op.block),
              `${label} walkway blocked at ${x},${z} by ${op.block}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  /**
   * The water tower's tank is continuous, and it closes on a solid cap.
   *
   * A tank whose lowest course hangs in air is a floating box. Every block of
   * the drum has a block directly under it, and the top course is a full cube —
   * never a slab, a stair, a wall or a fence.
   */
  it("stands every course of the water tower's tank on the one below it", () => {
    for (const size of [[15, 21, 15], [13, 19, 13]] as const) {
      const result = build("water_tower", size);
      const at = indexOf(result.ops);
      const label = `water_tower ${size.join("x")}`;
      const above = result.ops.filter((op) => op.y > result.meta.wallTop && op.block !== "air");
      expect(above.length, `${label} something over the plate`).toBeGreaterThan(20);
      for (const op of above) {
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(
          under !== undefined && under.block !== "air",
          `${label} ${op.block} at ${op.x},${op.y},${op.z} rests on nothing`,
        ).toBe(true);
        expect(
          /(_slab|_stairs|_wall|_fence|_carpet)$/.test(op.block),
          `${label} ${op.block} at ${op.x},${op.y},${op.z} is a partial block in the tank`,
        ).toBe(false);
      }
      // And the legs reach the ground.
      const [sx, , sz] = result.meta.size;
      for (const [x, z] of [
        [0, 0],
        [sx - 1, 0],
        [0, sz - 1],
        [sx - 1, sz - 1],
      ] as const) {
        const foot = at.get(`${x},0,${z}`);
        expect(foot !== undefined && foot.block !== "air", `${label} leg at ${x},${z}`).toBe(true);
      }
    }
  });

  /**
   * The coal tipple's trestle reaches the ground, everywhere.
   *
   * Every block of it either has a block under it or touches a block of the run
   * either side at the same height — the beam idiom. Nothing hangs.
   */
  it("grounds the coal tipple's trestle and rests its bin on the beam", () => {
    for (const size of [BIG, [15, 15, 17]] as const) {
      const result = build("coal_tipple", size);
      const at = indexOf(result.ops);
      const [sx, , sz] = result.meta.size;
      const label = `coal_tipple ${size.join("x")}`;
      const trestle = result.ops.filter((op) => op.x === sx && op.y >= 1 && op.block !== "air");
      expect(trestle.length, `${label} trestle`).toBeGreaterThan(10);
      for (const op of trestle) {
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        const beside =
          at.get(`${op.x},${op.y},${op.z - 1}`) !== undefined ||
          at.get(`${op.x},${op.y},${op.z + 1}`) !== undefined;
        expect(
          (under !== undefined && under.block !== "air") || beside,
          `${label} ${op.block} at ${op.x},${op.y},${op.z} floats`,
        ).toBe(true);
      }
      // The posts themselves are unbroken columns from the ground up.
      const posts = new Map<number, number[]>();
      for (const op of trestle) {
        const ys = posts.get(op.z) ?? [];
        ys.push(op.y);
        posts.set(op.z, ys);
      }
      for (const [z, ys] of posts) {
        if (z < 0 || z > sz - 1) continue;
        const foot = at.get(`${sx},0,${z}`);
        expect(
          foot !== undefined || Math.min(...ys) > 1,
          `${label} column at z=${z} starts in the air`,
        ).toBe(true);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of UTILITY_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the two props                                                               */
/* -------------------------------------------------------------------------- */

const PSEED = nodeSeed(0x7111n, "world.energy");

/** Params worth exercising, per prop. */
const CASES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  wind_turbine: [{}, { height: 7 }, { height: 21 }],
  solar_array: [{}, { rows: 1 }, { rows: 8 }],
};

function casesFor(prop: string): readonly Record<string, unknown>[] {
  return CASES[prop] ?? [{}];
}

describe("wave-6C energy props", () => {
  it("registers both of them, once", () => {
    expect(ENERGY_PROP_NAMES).toHaveLength(2);
    for (const p of ENERGY_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isEnergyProp(p)).toBe(true);
    }
    expect(isEnergyProp("well_head")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as a prop, at wave 6, with a note", () => {
    for (const p of ENERGY_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect(entry?.wave, p).toBe(6);
      expect(entry?.note, p).toBeDefined();
    }
    // And the tags the wave was told to leave alone.
    expect(structureById("windpump")?.kind).toBe("prop");
    expect(structureById("well_head")).toBeDefined();
  });

  it("declares the box it builds in, and fills all four sides of it", () => {
    for (const p of ENERGY_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const declared = propFootprint(p, params);
        expect(declared, p).toEqual(energyPropFootprint(p, params));
        const result = generateProp({ prop: p, seed: PSEED, params });
        expect(result.meta.size, p).toEqual(declared.size);
        expect(result.ops.length, p).toBeGreaterThan(5);
        const xs = result.ops.map((o) => o.x);
        const zs = result.ops.map((o) => o.z);
        expect(Math.min(...xs), `${p} min x`).toBe(0);
        expect(Math.min(...zs), `${p} min z`).toBe(0);
        expect(Math.max(...xs), `${p} max x`).toBe(declared.size[0] - 1);
        expect(Math.max(...zs), `${p} max z`).toBe(declared.size[2] - 1);
        for (const op of result.ops) {
          expect(op.y, `${p} y`).toBeGreaterThanOrEqual(declared.minY);
          expect(op.y, `${p} y`).toBeLessThan(declared.minY + declared.size[1]);
        }
      }
    }
  });

  /**
   * The support rule, in miniature: the world lint's predicate run over one
   * prop. A blade with nothing inboard of it is a floating block wherever it
   * ends up in the world.
   */
  it("stands every block on something: ground, itself, or a block beside it", () => {
    for (const p of ENERGY_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const ops = generateProp({ prop: p, seed: PSEED, params }).ops;
        const cells = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
        const at = (x: number, y: number, z: number): boolean => cells.has(`${x},${y},${z}`);
        for (const op of ops) {
          if (op.y === 0) continue;
          const supported =
            at(op.x, op.y - 1, op.z) ||
            at(op.x, op.y + 1, op.z) ||
            at(op.x + 1, op.y, op.z) ||
            at(op.x - 1, op.y, op.z) ||
            at(op.x, op.y, op.z + 1) ||
            at(op.x, op.y, op.z - 1);
          expect(supported, `${p} ${op.block} at ${op.x},${op.y},${op.z} floats`).toBe(true);
        }
      }
    }
  });

  /** The mast is one unbroken column, and the rotor hangs off nothing. */
  it("runs the turbine's mast from the pad to the hub without a gap", () => {
    for (const height of [TURBINE_HEIGHT_DEFAULT, 7, 21]) {
      const ops = generateProp({ prop: "wind_turbine", seed: PSEED, params: { height } }).ops;
      const cells = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      for (let y = 0; y <= height + 1; y++) {
        expect(cells.has(`2,${y},1`), `mast gap at y=${y} (height ${height})`).toBe(true);
      }
      // Three arms: one up, two out, each two blocks long from the hub.
      const hub = height + 1;
      expect(cells.has(`2,${hub + 1},1`), "the upward blade").toBe(true);
      expect(cells.has(`2,${hub + 2},1`), "its tip").toBe(true);
      for (const x of [0, 1, 3, 4]) {
        expect(cells.has(`${x},${hub},1`), `the blade block at x=${x}`).toBe(true);
      }
    }
  });

  /** The array's panels are real blocks, one per plinth, with a lane between rows. */
  it("stands a panel on every plinth of a solar array", () => {
    for (const rows of [1, 3, 8]) {
      const ops = generateProp({ prop: "solar_array", seed: PSEED, params: { rows } }).ops;
      const panels = ops.filter((o) => o.block === "daylight_detector");
      expect(panels, `rows=${rows}`).toHaveLength(rows * 5);
      const cells = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      for (const panel of panels) {
        expect(cells.has(`${panel.x},1,${panel.z}`), "the plinth under the panel").toBe(true);
        // The service lane behind every row is empty.
        expect(cells.has(`${panel.x},1,${panel.z + 1}`), "the service lane").toBe(false);
      }
    }
  });

  it("writes no fluid, no sign, no chain", () => {
    for (const p of ENERGY_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const ops = generateProp({ prop: p, seed: PSEED, params }).ops;
        for (const op of ops) {
          expect(["water", "lava", "flowing_water", "flowing_lava", "chain"], p).not.toContain(
            op.block,
          );
          expect(op.block.endsWith("_sign"), `${p} ${op.block}`).toBe(false);
        }
      }
    }
  });

  it("survives every quarter turn with its box intact, and is deterministic", () => {
    for (const p of ENERGY_PROP_NAMES) {
      const result = generateProp({ prop: p, seed: PSEED, params: {} });
      const once = JSON.stringify(result.ops);
      expect(JSON.stringify(generateProp({ prop: p, seed: PSEED, params: {} }).ops), p).toBe(once);
      const [sx, , sz] = result.meta.size;
      for (const yaw of [90, 180, 270] as const) {
        const turned = rotateOps(result.ops, yaw, sx, sz);
        expect(turned, `${p} yaw ${yaw}`).toHaveLength(result.ops.length);
        const xs = turned.map((o) => o.x);
        const zs = turned.map((o) => o.z);
        expect(Math.min(...xs), `${p} yaw ${yaw} min x`).toBe(0);
        expect(Math.min(...zs), `${p} yaw ${yaw} min z`).toBe(0);
      }
    }
  });

  it("exhibits both of them, at yaw 0 at least once", () => {
    const seen = new Set<string>();
    for (const row of ENERGY_PROP_EXHIBIT_PLAN) {
      for (const cell of row.cells) {
        if (cell.params["yaw"] === 0) seen.add(cell.prop);
        expect(ENERGY_PROP_NAMES as readonly string[]).toContain(cell.prop);
      }
    }
    expect([...seen].sort()).toEqual([...ENERGY_PROP_NAMES].sort());
  });
});
