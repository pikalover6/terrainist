/**
 * Archetype wave 6D: six spectacle buildings — the ones you go *into* to be
 * amazed — on wave two's contract, with the shared pocket detector.
 *
 * The harness is deliberately the same one every earlier wave was held to:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one an
 *   earlier table already claims — and the near misses are the whole review,
 *   because bare `tent` means the nomadic vocabulary's, bare `hall` means the
 *   **great hall**, bare `arcade` means the leisure wave's, bare `pavilion` the
 *   leisure and arcana pavilions', bare `museum` and `zoo` the institution
 *   wave's, and `labyrinth` an underground catalog entry;
 * - it puts something in the room it built, and the room stays walkable **from
 *   the door**, by `assertNoPockets`, across one and two storeys and three
 *   envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, no signs, no `chain`, no plain `mud`, and the same
 *   seed gives the same ops forever.
 *
 * Plus the three this wave exists to prove:
 *
 * - **the maze is walkable by construction.** Two of these six put a wall field
 *   inside the room — the hedge maze in leaves, the hall of mirrors in glass —
 *   and the comb's whole promise is that no single blocked cell can strand
 *   anything. The pocket detector is the judge, at every envelope;
 * - **the aquarium's pool containment**, cell for cell: every water cell has
 *   something solid under it and pool-or-solid on all four sides, no prop ever
 *   stands on one, and — the decision this archetype exists to make — there is
 *   **no other fluid in the building**, because the wall tanks are glass over
 *   blue concrete rather than water that cannot be proved sealed;
 * - **the big top closes on a solid cap**, and its king poles are inside the
 *   crown rather than through the room.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  SPECTACLE_BUILDING_ARCHETYPES,
  archetypeOfTags,
  generateBuilding,
  isSpectacleArchetype,
  nodeSeed,
  resolveArchetype,
  spectacleFacadeDefaults,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x6d0an, "world.spectacle");
const OTHER = nodeSeed(0x6d0an, "world.spectacle.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 17, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 13, 13], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = spectacleFacadeDefaults(archetype);
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

describe("wave-6D spectacle archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isSpectacleArchetype(a)).toBe(true);
      expect(archetypeOfTags([a])).toBe(a);
    }
    expect(isSpectacleArchetype("bathing_pavilion")).toBe(false);
  });

  it("is claimed by the catalog as wave six, implemented, with a note", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(6);
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
    }
  });

  it("steals no tag an earlier table already owns", () => {
    // Each of these means something else, and each would have been a silent
    // theft: a document tagged `tent` would have been rethemed as a big top,
    // one tagged `hall` would have stopped being a great hall, and so on.
    expect(archetypeOfTags(["hall"])).toBe("hall");
    expect(archetypeOfTags(["tent"])).not.toBe("big_top");
    expect(archetypeOfTags(["arcade"])).not.toBe("funhouse");
    expect(archetypeOfTags(["pavilion"])).not.toBe("dodgems_pavilion");
    expect(archetypeOfTags(["museum"])).not.toBe("aquarium");
    expect(archetypeOfTags(["zoo"])).not.toBe("aquarium");
    expect(archetypeOfTags(["labyrinth"])).not.toBe("hedge_maze");
    // And each answers to its own synonyms.
    expect(archetypeOfTags(["circus_tent"])).toBe("big_top");
    expect(archetypeOfTags(["mirror_maze"])).toBe("hall_of_mirrors");
    expect(archetypeOfTags(["fun_house"])).toBe("funhouse");
    expect(archetypeOfTags(["bumper_cars"])).toBe("dodgems_pavilion");
    expect(archetypeOfTags(["oceanarium"])).toBe("aquarium");
    expect(archetypeOfTags(["hedges"])).toBe("hedge_maze");
  });

  it("gives every one of them a facade tendency", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      expect(Object.keys(spectacleFacadeDefaults(a)).length, a).toBeGreaterThan(0);
    }
    expect(spectacleFacadeDefaults("cottage")).toEqual({});
  });

  /* ------------------------------------------------------------------------ */
  /* the contract                                                              */
  /* ------------------------------------------------------------------------ */

  it("puts something in every room it builds", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(result.ops.length, `${a} @${size.join("x")}`).toBeGreaterThan(50);
      }
    }
  });

  it("leaves the storey walkable from the door, at every envelope", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2] as const) {
          const result = build(a, size, { floors });
          assertNoPockets(result, { label: `${a} @${size.join("x")} f${floors}` });
        }
      }
    }
  });

  it("stays inside the envelope the solver reserved", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        for (const op of result.ops) {
          const where = `${a} ${op.block} at ${op.x},${op.y},${op.z}`;
          // The apron ring is one cell outside the footprint, which the eave
          // already uses; nothing may go further.
          expect(op.x, where).toBeGreaterThanOrEqual(-1);
          expect(op.x, where).toBeLessThanOrEqual(size[0]);
          expect(op.z, where).toBeGreaterThanOrEqual(-1);
          expect(op.z, where).toBeLessThanOrEqual(size[2]);
          // `air` is an *erasure* — the roof rebuild clearing what the shell
          // put there — rather than something built, and it reaches two courses
          // past the flourish allowance by design (wave 4D's `clearRoof`).
          if (op.block === "air") continue;
          expect(op.y, where).toBeLessThanOrEqual(size[1] + ROOF_FLOURISH_RISE + 2);
        }
      }
    }
  });

  it("places no sign, no chain, no bare pot and no plain mud", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const op of build(a, size).ops) {
          const where = `${a} ${op.block} at ${op.x},${op.y},${op.z}`;
          expect(op.block, where).not.toMatch(/_sign$/);
          expect(op.block, where).not.toBe("chain");
          expect(op.block, where).not.toBe("flower_pot");
          expect(op.block, where).not.toBe("mud");
        }
      }
    }
  });

  it("is a pure function of its seed", () => {
    for (const a of SPECTACLE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      // A different node seed is allowed to differ; it must not throw.
      expect(() => build(a, BIG, {}, OTHER)).not.toThrow();
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the three this wave exists to prove                                       */
  /* ------------------------------------------------------------------------ */

  it("keeps the aquarium's pool contained, and puts NO other fluid in it", () => {
    for (const size of SIZES) {
      for (const floors of [1, 2] as const) {
        const result = build("aquarium", size, { floors });
        const at = indexOf(result.ops);
        const label = `aquarium @${size.join("x")} f${floors}`;
        const water = result.ops.filter((op) => op.block === "water");
        expect(water.length, `${label}: a tank worth the name`).toBeGreaterThan(3);
        for (const cell of water) {
          const where = `${label} water at ${cell.x},${cell.y},${cell.z}`;
          // Water only ever goes into the floor plane.
          expect(cell.y, where).toBe(0);
          // Solid under it: the shell's own foundation skirt.
          const under = at.get(`${cell.x},${cell.y - 1},${cell.z}`);
          expect(under === undefined || under.block !== "air", where).toBe(true);
          // Pool or solid on all four sides.
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const side = at.get(`${cell.x + dx},${cell.y},${cell.z + dz}`);
            expect(side, `${where} side ${dx},${dz}`).toBeDefined();
            expect(side?.block, `${where} side ${dx},${dz}`).not.toBe("air");
          }
          // Nothing standing on it.
          const above = at.get(`${cell.x},1,${cell.z}`);
          expect(above === undefined || above.block === "air", `${where} has a prop on it`).toBe(
            true,
          );
        }
        // The decision: no lava anywhere, and the wall tanks are not water.
        expect(has(result, "lava"), `${label}: no lava`).toBe(false);
        expect(has(result, "blue_concrete"), `${label}: tanks that are not fluid`).toBe(true);
        expect(has(result, "glass"), `${label}: the tank fronts`).toBe(true);
      }
    }
  });

  it("closes the big top on a solid cap and keeps its poles out of the room", () => {
    const result = build("big_top", BIG);
    const at = indexOf(result.ops);
    expect(has(result, "red_wool") && has(result, "white_wool"), "the stripes").toBe(true);
    expect(has(result, "sand"), "the ring").toBe(true);
    expect(
      result.ops.some((op) => op.block.endsWith("_banner")),
      "the finial flag",
    ).toBe(true);
    // The king poles are stripped logs, and every one of them is above the
    // eave plate: a column from the floor to the cap is a blocked column.
    const poles = result.ops.filter((op) => op.block === "stripped_dark_oak_log");
    expect(poles.length, "the king poles").toBeGreaterThan(0);
    for (const pole of poles) {
      expect(pole.y, `king pole at ${pole.x},${pole.y},${pole.z} is in the room`).toBeGreaterThan(4);
    }
    // The cap is solid: the cone's own top course has no hole at its middle.
    const capY = Math.max(...result.ops.filter((op) => op.block === "white_wool").map((o) => o.y));
    expect(at.get(`${(BIG[0] - 1) >> 1},${capY},${(BIG[2] - 1) >> 1}`), "a solid cap").toBeDefined();
  });

  it("draws a maze in each of the two that have one, and both stay walkable", () => {
    for (const [a, block] of [
      ["hedge_maze", "oak_leaves"],
      ["hall_of_mirrors", "glass_pane"],
    ] as const) {
      for (const size of SIZES) {
        const result = build(a, size);
        const walls = result.ops.filter((op) => op.block === block && op.y === 1);
        expect(walls.length, `${a} @${size.join("x")}: a maze worth the name`).toBeGreaterThan(2);
        assertNoPockets(result, { label: `${a} maze @${size.join("x")}` });
      }
    }
    // The hedge is persistent, or it decays and the maze becomes a lawn.
    for (const op of build("hedge_maze", BIG).ops) {
      if (op.block !== "oak_leaves") continue;
      expect(op.props?.["persistent"], "the hedge must be persistent").toBe("true");
    }
    expect(has(build("hedge_maze", BIG), "coarse_dirt"), "the beds").toBe(true);
  });

  /* ------------------------------------------------------------------------ */
  /* character                                                                 */
  /* ------------------------------------------------------------------------ */

  it("builds the thing each archetype is for", () => {
    const mirrors = build("hall_of_mirrors", BIG);
    expect(has(mirrors, "black_concrete") && has(mirrors, "white_concrete"), "the checkers")
      .toBe(true);
    expect(has(mirrors, "light_gray_concrete"), "the pale backing").toBe(true);

    const fun = build("funhouse", BIG);
    expect(has(fun, "magenta_concrete"), "the bright stripes").toBe(true);
    expect(
      ["red_wool", "blue_wool", "yellow_wool"].every((b) => has(fun, b)),
      "the spinning tunnel's rings",
    ).toBe(true);
    expect(has(fun, "purple_concrete") || has(fun, "lime_concrete"), "the distorted trim")
      .toBe(true);

    const dodgems = build("dodgems_pavilion", BIG);
    expect(has(dodgems, "polished_blackstone"), "the arena floor").toBe(true);
    expect(has(dodgems, "yellow_concrete"), "the kerb").toBe(true);
    expect(has(dodgems, "stripped_spruce_log"), "the power grid at the plate").toBe(true);
    expect(
      dodgems.ops.some((op) => op.block.endsWith("_stairs") && op.y === 1),
      "the parked cars",
    ).toBe(true);

    const tank = build("aquarium", BIG);
    expect(has(tank, "dark_prismarine"), "the rim").toBe(true);
    expect(
      tank.ops.some((op) => op.block.endsWith("_wall_banner")),
      "specimen labels are wall banners, never signs",
    ).toBe(true);
    expect(
      tank.ops.some((op) => op.block.endsWith("_coral_block")),
      "the specimens",
    ).toBe(true);

    const maze = build("hedge_maze", BIG);
    expect(has(maze, "mossy_stone_bricks") || has(maze, "mossy_cobblestone"), "the garden wall")
      .toBe(true);
  });
});
