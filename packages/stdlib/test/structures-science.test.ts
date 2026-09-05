/**
 * Archetype wave 5D: twelve science and modern-living interiors.
 *
 * Held to the standing contract every wave since wave two has been held to,
 * because a new archetype that needs a new kind of guarantee is a new archetype
 * nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one an
 *   earlier table already claims;
 * - it puts something in the room it built, and the room stays **walkable from
 *   the door** — asserted with the shared detector in
 *   `test/helpers/walkability.ts`, across one and two storeys and three
 *   envelope sizes, and again with the lantern column excluded;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever;
 * - it never places a bare `flower_pot`, never a sign block and never a `chain`.
 *
 * Plus the two this wave adds:
 *
 * - **the dome cap is solid.** Both corbel domes finish on a filled rect, with
 *   no slit cut through the crown — a hole in the cap is a hole in the roof;
 * - **the planetarium's ring faces inward.** A stair's `facing` is its
 *   backrest, so every seat in the ring carries the cardinal pointing *away*
 *   from the projector, which is how a sitter ends up looking *at* it.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  SCIENCE_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isScienceArchetype,
  nodeSeed,
  resolveArchetype,
  scienceFacadeDefaults,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x5c1e4cen, "world.science");
const OTHER = nodeSeed(0x5c1e4cen, "world.science.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 20, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 14, 15], [9, 11, 11]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = scienceFacadeDefaults(archetype);
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

describe("wave 5D archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isScienceArchetype(a)).toBe(true);
    }
    expect(isScienceArchetype("cottage")).toBe(false);
    expect(isScienceArchetype("laboratory")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["telescope_dome"])).toBe("telescope_dome");
    expect(archetypeOfTags(["dome_observatory"])).toBe("telescope_dome");
    expect(archetypeOfTags(["planetarium"])).toBe("planetarium");
    expect(archetypeOfTags(["star_dome"])).toBe("planetarium");
    expect(archetypeOfTags(["alchemy_lab"])).toBe("alchemy_lab");
    expect(archetypeOfTags(["alchemy"])).toBe("alchemy_lab");
    expect(archetypeOfTags(["herbarium"])).toBe("herbarium");
    expect(archetypeOfTags(["aviary"])).toBe("aviary");
    expect(archetypeOfTags(["birdhouse"])).toBe("aviary");
    expect(archetypeOfTags(["botanical_garden"])).toBe("botanical_garden");
    expect(archetypeOfTags(["botanic"])).toBe("botanical_garden");
    expect(archetypeOfTags(["arboretum"])).toBe("botanical_garden");
    expect(archetypeOfTags(["seed_vault"])).toBe("seed_vault");
    expect(archetypeOfTags(["genebank"])).toBe("seed_vault");
    expect(archetypeOfTags(["weather_station"])).toBe("weather_station");
    expect(archetypeOfTags(["met_station"])).toBe("weather_station");
    expect(archetypeOfTags(["field_station"])).toBe("field_station");
    expect(archetypeOfTags(["research_station"])).toBe("field_station");
    expect(archetypeOfTags(["penthouse"])).toBe("penthouse");
    expect(archetypeOfTags(["atrium_block"])).toBe("atrium_block");
    expect(archetypeOfTags(["atrium"])).toBe("atrium_block");
    expect(archetypeOfTags(["modern_villa"])).toBe("modern_villa");
    expect(archetypeOfTags(["minimalist"])).toBe("modern_villa");
    // The near misses, every one of them deliberate. `observatory`,
    // `telescope` and `astronomy` are the BLITZ observatory's — this wave's
    // dome is the modern one and answers only to its own compounds;
    // `alchemist` is the trade apothecary's; `lab` and `laboratory` are wave
    // 4C's laboratory's; bare `villa` is the Mediterranean villa's.
    expect(archetypeOfTags(["observatory"])).toBe("observatory");
    expect(archetypeOfTags(["telescope"])).toBe("observatory");
    expect(archetypeOfTags(["astronomy"])).toBe("observatory");
    expect(archetypeOfTags(["alchemist"])).toBe("apothecary");
    expect(archetypeOfTags(["lab"])).toBe("laboratory");
    expect(archetypeOfTags(["laboratory"])).toBe("laboratory");
    expect(archetypeOfTags(["villa"])).toBe("mediterranean_villa");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
      const facade = scienceFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(scienceFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("observatory").roof).toBeDefined();
    expect(archetypeFacadeDefaults("laboratory").roof).toBe("gable");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
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

describe("wave 5D buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  /**
   * The shared detector, which walks a 1x2 body from the door cell — so
   * head-height blocks, stair mounts and drops are all modelled, and a region
   * connected to itself but not to the way in fails where 4-connectivity of the
   * empty cells passed it.
   */
  it("leaves every ground floor walkable from the door, with no pockets", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
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
   * height, so that column is not walk-through. Deleting it from the free set
   * must leave the rest connected — a fit-out whose only route crosses it has
   * built a room with a wall in the middle of it.
   */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
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
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
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
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const [sx, , sz] = result.meta.size;
        const ceiling = result.meta.roofTop + ROOF_FLOURISH_RISE;
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

  it("is deterministic: the same seed gives the same ops", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
      const one = build(a);
      const two = build(a);
      expect(two.ops, a).toEqual(one.ops);
      const other = build(a, BIG, {}, OTHER);
      expect(other.ops.length, a).toBeGreaterThan(0);
    }
  });

  it("never places a bare flower pot, a sign block or a chain", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const bad = result.ops.filter(
          (op) => op.block === "flower_pot" || op.block === "chain" || op.block.endsWith("_sign"),
        );
        expect(
          bad.slice(0, 4).map((op) => `${op.block}@${op.x},${op.y},${op.z}`),
          `${a} ${size.join("x")}`,
        ).toEqual([]);
      }
    }
  });

  it("builds the thing each archetype is for", () => {
    // Science.
    expect(has(build("telescope_dome"), "smooth_quartz"), "the white dome").toBe(true);
    expect(has(build("telescope_dome"), "cartography_table"), "the control desk").toBe(true);
    expect(has(build("planetarium"), "glowstone"), "the stars").toBe(true);
    expect(has(build("planetarium"), "deepslate_tiles"), "the dark shell").toBe(true);
    expect(has(build("alchemy_lab"), "brewing_stand"), "the benches").toBe(true);
    expect(has(build("alchemy_lab"), "calcite"), "the chalk circle").toBe(true);
    expect(has(build("herbarium"), "bookshelf"), "the presses").toBe(true);
    expect(has(build("aviary"), "iron_bars"), "the cage").toBe(true);
    expect(has(build("botanical_garden"), "glass"), "the glazing").toBe(true);
    expect(has(build("botanical_garden"), "moss_block"), "the planters").toBe(true);
    expect(has(build("seed_vault"), "packed_ice"), "the frost band").toBe(true);
    expect(has(build("seed_vault"), "iron_block"), "the vault door face").toBe(true);
    expect(has(build("weather_station"), "lightning_rod"), "the rod").toBe(true);
    expect(has(build("weather_station"), "orange_banner"), "the windsock").toBe(true);
    expect(has(build("field_station"), "cartography_table"), "the map table").toBe(true);
    expect(has(build("field_station"), "observer"), "the radio").toBe(true);
    // Modern.
    expect(has(build("penthouse"), "quartz_slab"), "the terrace parapet").toBe(true);
    expect(has(build("atrium_block"), "polished_andesite"), "the court").toBe(true);
    expect(has(build("modern_villa"), "white_concrete"), "the white re-clad").toBe(true);
  });

  /**
   * THE CAP IS SOLID.
   *
   * The corbel idiom's one hard rule: a dome finishes on a filled rect, because
   * a partial block in the middle of a hollow has nothing under it and a hole
   * in the crown is a hole in the roof. Both this wave's domes are checked the
   * same way — take the highest non-air course over the eave plate, and assert
   * that every cell of the rect it spans is written and solid.
   */
  it("closes both corbel domes on a solid cap", () => {
    for (const a of ["telescope_dome", "planetarium"]) {
      const result = build(a, [15, 22, 15]);
      const base = result.meta.wallTop + 1;
      const solid = result.ops.filter((op) => op.y >= base && op.block !== "air");
      expect(solid.length, `${a} has a dome`).toBeGreaterThan(20);
      const courses = new Set(solid.map((op) => op.y));
      // A dome, not a lid: more than a couple of distinct courses over the
      // plate, insetting as it rises.
      expect(courses.size, `${a} corbel courses`).toBeGreaterThanOrEqual(3);

      const capY = Math.max(...courses);
      const cap = solid.filter((op) => op.y === capY);
      const x0 = Math.min(...cap.map((op) => op.x));
      const x1 = Math.max(...cap.map((op) => op.x));
      const z0 = Math.min(...cap.map((op) => op.z));
      const z1 = Math.max(...cap.map((op) => op.z));
      const written = new Set(cap.map((op) => `${op.x},${op.z}`));
      const holes: string[] = [];
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!written.has(`${x},${z}`)) holes.push(`${x},${z}`);
        }
      }
      expect(holes, `${a} cap at y=${capY} is not solid`).toEqual([]);
      // And nothing partial in it: a slab or a stair up there has nothing but
      // the dome's hollow under it.
      const partial = cap.filter((op) => /_slab$|_stairs$|_fence$/.test(op.block));
      expect(partial.map((op) => op.block), `${a} cap is partial`).toEqual([]);
    }
  });

  /**
   * The inward ring — the seat rule turned round.
   *
   * A stair's `facing` names its **high half**, the backrest. In an auditorium
   * that means every seat carries the cardinal pointing *away* from the stage.
   * A planetarium's audience looks at a projector in the *middle* of the room,
   * so every seat in the ring must carry the cardinal pointing *outward*, away
   * from the hub — the same rule, applied to a different geometry, and
   * invisible in a block list either way.
   */
  it("turns the planetarium's ring inward, by facing every seat outward", () => {
    const result = build("planetarium", [15, 22, 15]);
    const it = result.meta.interior;
    const lamp = {
      x: Math.floor((it.x0 + it.x1) / 2),
      z: Math.floor((it.z0 + it.z1) / 2),
    };
    // The hub is the lantern column offset by one — the projector's cell.
    const hub =
      lamp.x + 1 <= it.x1 - 1
        ? { x: lamp.x + 1, z: lamp.z }
        : lamp.z + 1 <= it.z1 - 1
          ? { x: lamp.x, z: lamp.z + 1 }
          : lamp;

    // The ring only. The shell builds its own flight of stairs up to the next
    // storey, and those are circulation rather than seating — Chebyshev radius
    // two off the hub is what tells one from the other.
    const seats = result.ops.filter(
      (op) =>
        op.y === 1 &&
        op.block.endsWith("_stairs") &&
        op.props?.["half"] === "bottom" &&
        Math.max(Math.abs(op.x - hub.x), Math.abs(op.z - hub.z)) === 2,
    );
    expect(seats.length, "the ring exists").toBeGreaterThan(3);
    for (const seat of seats) {
      const dx = seat.x - hub.x;
      const dz = seat.z - hub.z;
      // Never a corner of the square ring: those are the aisles in.
      expect(Math.abs(dx) === 2 && Math.abs(dz) === 2, `seat at ${seat.x},${seat.z}`).toBe(false);
      const expected =
        Math.abs(dx) >= Math.abs(dz)
          ? dx >= 0
            ? "east"
            : "west"
          : dz >= 0
            ? "south"
            : "north";
      expect(seat.props?.["facing"], `seat at ${seat.x},${seat.z} backrest`).toBe(expected);
    }
  });

  /**
   * The aviary's whole safety argument, as an assertion.
   *
   * A bar ring drawn round open floor is a pocket by construction. Every cell a
   * cage encloses is therefore filled with solid planting, and the walkability
   * test above would have caught the alternative — but the *reason* deserves
   * its own check, because a later edit that reorders core-then-ring is exactly
   * the edit that would break it silently.
   */
  it("never leaves an aviary cage enclosing open floor", () => {
    for (const size of SIZES) {
      const result = build("aviary", size);
      const at = indexOf(result.ops);
      const bars = result.ops.filter((op) => op.block === "iron_bars" && op.y === 1);
      for (const bar of bars) {
        // The cell each bar faces inward towards must not be empty floor.
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const inner = at.get(`${bar.x + dx},1,${bar.z + dz}`);
          if (inner === undefined) continue;
          expect(inner.block, `beside a bar at ${bar.x},${bar.z}`).not.toBe("air");
        }
      }
    }
  });

  /**
   * Fluids only through the boxed-pool predicate.
   *
   * The botanical pond is written into the floor plane inset from the interior
   * on every side and rimmed with a coping course, so every water cell has the
   * foundation under it and solid floor on all four sides. Nothing else in this
   * wave writes a fluid at all.
   */
  it("boxes in every water cell it writes, and writes none anywhere else", () => {
    for (const a of SCIENCE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const water = result.ops.filter((op) => op.block === "water" || op.block === "lava");
        if (a !== "botanical_garden") {
          expect(water.map((op) => op.block), `${a} ${size.join("x")}`).toEqual([]);
          continue;
        }
        const at = indexOf(result.ops);
        for (const cell of water) {
          expect(cell.y, "the pond is in the floor plane").toBe(0);
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const beside = at.get(`${cell.x + dx},0,${cell.z + dz}`);
            expect(beside, `beside the pond at ${cell.x},${cell.z}`).toBeDefined();
            expect(beside?.block, `beside the pond at ${cell.x},${cell.z}`).not.toBe("air");
          }
        }
      }
    }
  });
});
