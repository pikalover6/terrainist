/**
 * The **classical Mediterranean pack's buildings** — the three entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.1 that have an inside, on wave two's
 * contract.
 *
 * The harness is deliberately the *same* one every earlier wave was held to —
 * a new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and this pack's near misses are real
 *   ones: `shed`, `boat_shed`, `slipway`, `fountain`, `mill` and `press` all
 *   still go where they went;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - the lantern column is never the room's only route;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, no sign blocks, and the same seed gives the same ops
 *   forever.
 *
 * Plus the three this half of the pack exists to prove, each of which cost a
 * design pass:
 *
 * - **nothing here writes above the eave plate.** These are three buildings
 *   whose whole read is at eye level — an opening, a screen, a beam — so the
 *   exterior budget is spent at the plate and below. Asserted against a
 *   *baseline shell* rather than against a height, so it stays true if the
 *   roof shapes change;
 * - **the open front is an opening, not damage**: the ship shed's front wall
 *   comes out between corner piers and under the plate course, and the room
 *   behind it is still one region;
 * - **a beam is not a wall.** The press's beam goes at `y = 3` or not at all:
 *   the physics reading of a walkable cell is air at `y = 1` *and* `y = 2`, so
 *   a beam across the room at head height cuts the floor in two however
 *   walkable each half is. That is the bug this file was written against.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  CLASSICAL_B_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  classicalBFacadeDefaults,
  generateBuilding,
  isClassicalBArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xc1a5n, "world.classical");
const OTHER = nodeSeed(0xc1a5n, "world.classical.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 16, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
  facadeOf = archetype,
): ReturnType<typeof generateBuilding> {
  const facade = classicalBFacadeDefaults(facadeOf);
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

/**
 * The ground floor's **standable** cells, as the physics lint reads them.
 *
 * Two courses of air and — the clause every earlier wave could take for
 * granted and this one cannot — **something solid to stand on**. A cell whose
 * floor is water is air at head height and at knee height and is still not a
 * cell a walking agent can be in, so a version of this helper that only looked
 * up would call the nymphaeum's basin free floor and would have passed every
 * shape of that building the terrarium then rejected. It is written the lint's
 * way here so the connectivity tests below mean what they say.
 */
function freeCells(result: ReturnType<typeof generateBuilding>): string[] {
  const at = indexOf(result.ops);
  const free: string[] = [];
  for (const cell of result.meta.floorCells) {
    const floor = at.get(`${cell.x},0,${cell.z}`)?.block;
    if (floor === undefined || floor === "air" || floor === "water") continue;
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

describe("the classical pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isClassicalBArchetype(a)).toBe(true);
    }
    expect(isClassicalBArchetype("cottage")).toBe(false);
    expect(isClassicalBArchetype("boathouse")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["ship_shed"])).toBe("ship_shed");
    expect(archetypeOfTags(["neosoikos"])).toBe("ship_shed");
    expect(archetypeOfTags(["nymphaeum"])).toBe("nymphaeum");
    expect(archetypeOfTags(["monumental_fountain"])).toBe("nymphaeum");
    expect(archetypeOfTags(["olive_press"])).toBe("olive_press");
    expect(archetypeOfTags(["oil_press"])).toBe("olive_press");
    expect(archetypeOfTags(["olive_mill"])).toBe("olive_press");
    // The near misses. Every one of these belongs to an older table or to no
    // table at all, and this pack must not have moved one of them.
    expect(archetypeOfTags(["shed"])).toBe("cottage");
    expect(archetypeOfTags(["boat_shed"])).toBe("boathouse");
    expect(archetypeOfTags(["boathouse"])).toBe("boathouse");
    expect(archetypeOfTags(["slipway"])).toBe("cottage");
    expect(archetypeOfTags(["shipyard"])).toBe("shipyard");
    expect(archetypeOfTags(["fountain"])).toBe("cottage");
    expect(archetypeOfTags(["well"])).toBe("well");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["press"])).toBe("cottage");
    // The arch is this pack's *prop*, and the word stays the memorial's.
    expect(archetypeOfTags(["triumphal_arch"])).toBe("remembrance_arch");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      const facade = classicalBFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(classicalBFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("boathouse")).not.toEqual(
      classicalBFacadeDefaults("ship_shed"),
    );
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("classical_mediterranean");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
    expect(structureById("ship_shed")?.category).toBe("transport-water");
    expect(structureById("nymphaeum")?.category).toBe("waterworks");
    expect(structureById("olive_press")?.category).toBe("rural");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the classical pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
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
  }, 30_000);

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
        const free = freeCells(result).filter((k) => k !== lamp);
        expect(oneRegion(free), `${a} ${size.join("x")} without the lantern cell`).toBe(true);
      }
    }
  }, 30_000);

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      const result = build(a);
      const at = indexOf(result.ops);
      for (const cell of result.meta.floorCells) {
        const floor = at.get(`${cell.x},0,${cell.z}`);
        expect(floor, `${a} floor at ${cell.x},${cell.z}`).toBeDefined();
        expect(floor?.block, `${a} floor at ${cell.x},${cell.z}`).not.toBe("air");
      }
    }
  });

  it("stays inside the envelope in plan, apron included", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const [sx, , sz] = result.meta.size;
        for (const op of result.ops) {
          if (op.block === "air") continue; // clearing is not building
          expect(op.x, `${a} ${size.join("x")} x`).toBeGreaterThanOrEqual(-1);
          expect(op.x, `${a} ${size.join("x")} x`).toBeLessThanOrEqual(sx);
          expect(op.z, `${a} ${size.join("x")} z`).toBeGreaterThanOrEqual(-1);
          expect(op.z, `${a} ${size.join("x")} z`).toBeLessThanOrEqual(sz);
        }
      }
    }
  }, 30_000);

  /**
   * Nothing in this half of the pack writes above the eave plate.
   *
   * These three are read at eye level — an open front, a screen, a beam — so
   * the whole exterior budget goes at the plate and below, and the roof is the
   * shell's own. Checked against a **baseline shell** (the same envelope, the
   * same params, the plain cottage fit-out) rather than against a height, so
   * it keeps meaning if the roof shapes ever change: every op over the plate
   * must be one the shell itself already wrote, block for block.
   */
  it("writes nothing at all above the eave plate", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const mine = build(a, size, { floors: 1 });
        const shell = build("cottage", size, { floors: 1 }, S, a);
        const key = (op: LocalVoxelOp): string => `${op.x},${op.y},${op.z}|${op.block}`;
        const base = new Set(shell.ops.filter((op) => op.y > mine.meta.wallTop).map(key));
        const extra = mine.ops
          .filter((op) => op.y > mine.meta.wallTop && !base.has(key(op)))
          .map(key);
        expect(extra, `${a} ${size.join("x")} over the plate`).toEqual([]);
      }
    }
  }, 30_000);

  /**
   * No full block over the plate with six air faces.
   *
   * The physics lint's `floating.*` family, run against the finished op set.
   * This pack adds nothing up there, so what this really holds is that it did
   * not *take* anything away that the shell's own roof was standing on.
   */
  it("leaves no full block above the plate with six air faces", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const at = indexOf(result.ops);
        const solid = (x: number, y: number, z: number): boolean => {
          const block = at.get(`${x},${y},${z}`)?.block;
          return block !== undefined && block !== "air";
        };
        for (const op of result.ops) {
          if (op.block === "air" || op.y <= result.meta.wallTop) continue;
          const touching =
            solid(op.x + 1, op.y, op.z) ||
            solid(op.x - 1, op.y, op.z) ||
            solid(op.x, op.y, op.z + 1) ||
            solid(op.x, op.y, op.z - 1) ||
            solid(op.x, op.y + 1, op.z) ||
            solid(op.x, op.y - 1, op.z);
          expect(touching, `${a} ${size.join("x")}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(
            true,
          );
        }
      }
    }
  }, 30_000);

  it("builds the thing each archetype is for", () => {
    // The ship shed: a front that is a hole, and a lane down the floor plane.
    const shed = build("ship_shed", [13, 14, 21], { floors: 1 });
    const opened = shed.ops.filter((op) => op.block === "air" && op.y >= 1 && op.y < shed.meta.wallTop);
    expect(opened.length, "the open front").toBeGreaterThan(8);
    const [sx, , sz] = shed.meta.size;
    for (const op of opened) {
      const onRing = op.x === 0 || op.x === sx - 1 || op.z === 0 || op.z === sz - 1;
      expect(onRing, `the opening is in the wall ring, not the room`).toBe(true);
    }
    expect(shed.meta.furnitureCount, "the rollers and the cradle").toBeGreaterThan(0);

    // The nymphaeum: water in the floor plane, and a lit niche over it.
    const fountain = build("nymphaeum", [13, 13, 13], { floors: 1 });
    const water = fountain.ops.filter((op) => op.block === "water");
    expect(water.length, "the basins").toBeGreaterThan(3);
    for (const op of water) expect(op.y, "the water is the floor plane").toBe(0);
    expect(has(fountain, "smooth_stone"), "the screen").toBe(true);
    expect(
      fountain.ops.filter((op) => op.block === "lantern" && op.y === 1).length,
      "the niche lights",
    ).toBeGreaterThan(0);

    // The olive press: the beam, and the jars ranked along the far wall.
    const press = build("olive_press", BIG, { floors: 1 });
    expect(
      press.ops.filter((op) => op.y === 3 && op.props?.["axis"] === "x").length,
      "the beam",
    ).toBeGreaterThan(2);
    expect(has(press, "chiseled_stone_bricks"), "the weight stone").toBe(true);
    expect(has(press, "decorated_pot") || has(press, "cauldron"), "the jars").toBe(true);
  });

  /**
   * The nymphaeum's water is boxed in by construction.
   *
   * The bathhouse's fluid argument, asserted rather than assumed: every water
   * cell has the shell's foundation under it and pool or written floor on all
   * four sides, so no water can run out of the room it is in.
   */
  it("boxes every cell of the nymphaeum's water in", () => {
    for (const size of SIZES) {
      const result = build("nymphaeum", size, { floors: 1 });
      const at = indexOf(result.ops);
      const wet = result.ops.filter((op) => op.block === "water");
      for (const op of wet) {
        const under = at.get(`${op.x},-1,${op.z}`) ?? at.get(`${op.x},0,${op.z}`);
        expect(under, `${size.join("x")} under the water at ${op.x},${op.z}`).toBeDefined();
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const beside = at.get(`${op.x + dx},0,${op.z + dz}`);
          expect(
            beside?.block,
            `${size.join("x")} beside the water at ${op.x},${op.z}`,
          ).toBeDefined();
          expect(beside?.block).not.toBe("air");
        }
      }
    }
  });

  /**
   * **The way in survives the fit-out.** The regression this file exists for.
   *
   * The ship shed's open front used to be cut in the door's *own* wall, which
   * took the door block out with it — and the physics lint's walking agent
   * does not read the plan, it reads the **world**: it looks for a lower door
   * block inside the footprint and walks in from whichever neighbour is
   * standable. No door block, no start, `traversal.no_start` on every exhibit
   * cell, and the finding names whatever happened to be at the interior corner
   * (a cauldron, in the report), which is why it reads as a furniture bug and
   * is not one.
   *
   * So this asserts the property the lint actually checks, in the lint's own
   * terms and at the exhibit's own envelopes: a lower door exists, and one of
   * its four neighbours has solid non-water floor under it and two courses of
   * air above.
   */
  it("keeps a door, and a standable cell just inside it", () => {
    const envelopes: readonly (readonly [string, readonly [number, number, number]])[] = [
      // The classical exhibit's own gradient, which is where this broke.
      ["ship_shed", [13, 14, 21]],
      ["ship_shed", [14, 15, 23]],
      ["ship_shed", [13, 16, 25]],
      ["ship_shed", [14, 17, 27]],
      ["nymphaeum", [13, 13, 13]],
      ["nymphaeum", [14, 14, 13]],
      ["nymphaeum", [15, 15, 13]],
      ["nymphaeum", [16, 16, 13]],
      ["olive_press", [11, 12, 11]],
      ["olive_press", [12, 13, 11]],
      ["olive_press", [11, 14, 11]],
      ["olive_press", [12, 15, 11]],
      ...SIZES.flatMap(
        (size) =>
          CLASSICAL_B_BUILDING_ARCHETYPES.map((a) => [a, size] as const) as readonly (readonly [
            string,
            readonly [number, number, number],
          ])[],
      ),
    ];
    for (const [a, size] of envelopes) {
      for (const floors of [1, 2]) {
        const result = build(a, size, { floors });
        const at = indexOf(result.ops);
        const label = `${a} ${size.join("x")} floors=${floors}`;
        const doors = result.ops.filter(
          (op) => op.block.endsWith("_door") && op.props?.["half"] === "lower",
        );
        expect(doors.length, `${label}: a door in the world`).toBeGreaterThan(0);
        const open = (block?: string): boolean => block === undefined || block === "air";
        const standable = doors.some((door) =>
          (
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const
          ).some(([dx, dz]) => {
            const x = door.x + dx;
            const z = door.z + dz;
            const floor = at.get(`${x},0,${z}`)?.block;
            if (floor === undefined || floor === "air" || floor === "water") return false;
            return open(at.get(`${x},1,${z}`)?.block) && open(at.get(`${x},2,${z}`)?.block);
          }),
        );
        expect(standable, `${label}: a standable cell inside the door`).toBe(true);
      }
    }
  }, 30_000);

  /**
   * **The way up is left exactly as the shell built it.**
   *
   * The third finding of the same terrarium run, and the subtlest: the
   * nymphaeum's screen is the one thing in the pack that writes standing
   * masonry without going through `PropCounter`, and the shell puts its stair
   * against a **wall** — so on a two-storey plan the screen was built over the
   * bottom of the flight and the whole upper floor became unreachable
   * (`traversal.unreachable`, one finding per cell up there).
   *
   * The assertion is exact rather than statistical: every cell of
   * `meta.stairColumns`, at every **standing** course of the building, must
   * hold precisely what the plain cottage fit-out left in it on the same shell
   * and seed. The floor plane at `y = 0` is deliberately excluded and is the
   * one thing this pack may repaint under a stair: the nymphaeum's coping is
   * floor paint on a cell the shell already wrote solid, and a stair cares
   * about what stands *in* its column, not what colour the floor under it is.
   * The water — which would matter — is guarded in the fit-out instead, by the
   * same `free` the screen now asks.
   */
  it("never writes into a stair column", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const storyHeight of [3, 4, 5]) {
          for (const floors of [1, 2, 3]) {
            const mine = build(a, size, { floors, storyHeight });
            const shell = build("cottage", size, { floors, storyHeight }, S, a);
            const columns = mine.meta.stairColumns ?? new Set<string>();
            const at = indexOf(mine.ops);
            const base = indexOf(shell.ops);
            // …and the foot of the flight can be walked up to. A stair whose
            // every neighbour is water or masonry is a stair nobody reaches,
            // and the storey over it is unreachable however intact it is.
            const standable = new Set(freeCells(mine));
            for (const key of columns) {
              const [sx, sz] = key.split(",").map(Number) as [number, number];
              const reachable = (
                [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ] as const
              ).some(([dx, dz]) => standable.has(`${sx + dx},${sz + dz}`));
              expect(
                reachable,
                `${a} ${size.join("x")} h=${storyHeight} f=${floors}: stair column ${key} has no standable neighbour`,
              ).toBe(true);
            }
            for (const key of columns) {
              const [x, z] = key.split(",").map(Number) as [number, number];
              for (let y = 1; y <= mine.meta.wallTop; y++) {
                const cell = `${x},${y},${z}`;
                expect(
                  at.get(cell)?.block,
                  `${a} ${size.join("x")} h=${storyHeight} f=${floors}: stair cell ${cell}`,
                ).toBe(base.get(cell)?.block);
              }
            }
          }
        }
      }
    }
  }, 60_000);

  /**
   * **No column of any room is solid from its floor to its ceiling.**
   *
   * `interior.blocked_column` in the lint's own words, and the third defect
   * this file was written against: the nymphaeum's screen was built
   * `storyHeight - 1` courses high, which is exactly the band the rule reads
   * — `floor + 1` up to `floor + storyHeight - 1` — so every non-niche bay of
   * it was a pillar through the room. It did not matter that the screen is
   * furniture and reads as furniture; the rule is about the column, not the
   * intention, and `PropCounter` only guards the props that go *through* it.
   *
   * So the check is the rule, over every cell of every floor: somewhere in the
   * storey band there has to be air. **The storey height is swept explicitly**
   * — the defect only appears where the screen's height and the band's height
   * meet, and the three default envelopes did not happen to produce that
   * storey; the terrarium's did.
   */
  it("leaves air in every interior column, floor to ceiling", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const storyHeight of [3, 4, 5, 6]) {
          for (const floors of [1, 2]) {
            const result = build(a, size, { floors, storyHeight });
            const at = indexOf(result.ops);
            const top = result.meta.params.storyHeight - 1;
            for (const cell of result.meta.floorCells) {
              let air = false;
              for (let y = 1; y <= top && !air; y++) {
                const block = at.get(`${cell.x},${y},${cell.z}`)?.block;
                if (block === undefined || block === "air") air = true;
              }
              expect(
                air,
                `${a} ${size.join("x")} h=${storyHeight} floors=${floors}: column ${cell.x},${cell.z} is solid from 1 to ${top}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  }, 60_000);

  /**
   * **Nothing this pack writes has air on every side** — at any height, in any
   * theme, and measured against the shell it was handed.
   *
   * The second half of the same terrarium failure: a slab cornice copied from
   * the sanctum temple, laid in the *apron* at the eave course. The temple's
   * lands on the entablature its peristyle carried up there; these three have
   * no colonnade, so it was a ring of slabs floating one block off the wall —
   * `floating.slab`, "air on every side", once per exhibit cell and once per
   * theme's slab block.
   *
   * The check is differential on purpose: it compares this pack's fit-out
   * against the **cottage fit-out on the same shell, seed and materials**, so
   * it reports what this file did and never what `core.ts` did. It also runs
   * over every material theme, because the block ids in the findings were
   * themed ones and a default-palette test would not have seen them.
   */
  it("adds no floating block and no unsupported fixture, in any theme", () => {
    const suspects = (result: ReturnType<typeof generateBuilding>): string[] => {
      const at = indexOf(result.ops);
      const solid = (x: number, y: number, z: number): boolean => {
        const block = at.get(`${x},${y},${z}`)?.block;
        return block !== undefined && block !== "air";
      };
      const out: string[] = [];
      for (const op of result.ops) {
        if (op.block === "air") continue;
        const touching =
          solid(op.x + 1, op.y, op.z) ||
          solid(op.x - 1, op.y, op.z) ||
          solid(op.x, op.y, op.z + 1) ||
          solid(op.x, op.y, op.z - 1) ||
          solid(op.x, op.y + 1, op.z) ||
          solid(op.x, op.y - 1, op.z);
        if (!touching) out.push(`floating ${op.block} @ ${op.x},${op.y},${op.z}`);
        // The support chain: a wall, a fence or a standing lantern needs a
        // floor, and "the apron" is not one.
        if (!/(_wall$|fence|^lantern$)/.test(op.block)) continue;
        if (op.props?.["hanging"] === "true") continue;
        if (!solid(op.x, op.y - 1, op.z)) {
          out.push(`unsupported ${op.block} @ ${op.x},${op.y},${op.z}`);
        }
      }
      return out;
    };
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0xc1a5n, `world.classical.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = classicalBFacadeDefaults(a);
          const params = {
            floors: 1,
            ...(facade.roof === undefined ? {} : { roof: facade.roof }),
            ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
            ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
          };
          const mine = generateBuilding({
            size,
            params: { ...params, archetype: a },
            seed,
            materials,
          });
          const shell = generateBuilding({
            size,
            params: { ...params, archetype: "cottage" },
            seed,
            materials,
          });
          const baseline = new Set(suspects(shell));
          const added = suspects(mine).filter((f) => !baseline.has(f));
          expect(added, `${a} ${theme.id} ${size.join("x")}`).toEqual([]);
        }
      }
    }
  }, 30_000);

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot, and hangs no signs", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(has(result, "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
        expect(
          result.ops.filter((op) => op.block.endsWith("_sign")),
          `${a} ${size.join("x")}`,
        ).toEqual([]);
      }
    }
  }, 30_000);

  /** A `cauldron` has no `level`: the vessel with levels is `water_cauldron`. */
  it("puts no properties on a cauldron", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) {
        if (op.block !== "cauldron") continue;
        expect(op.props, `${a} cauldron`).toBeUndefined();
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of CLASSICAL_B_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
