/**
 * The **nautical & pirate pack's buildings** — the two entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.2 that have an inside, on wave two's
 * contract.
 *
 * The harness is deliberately the *same* one every earlier wave was held to —
 * a new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and this pack's near misses are real
 *   ones: `crane`, `salt`, `warehouse`, `store`, `shipyard`, `boathouse` and
 *   `dock` all still go where they went;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - the lantern column is never the room's only route;
 * - nothing it builds leaves the envelope the solver reserved, and nothing it
 *   builds has air on every side;
 * - no bare flower pots, no sign blocks, and the same seed gives the same ops
 *   forever.
 *
 * Plus the two this pack exists to prove:
 *
 * - **the wheel is a wheel.** Its ring is 4-connected from the floor up and
 *   round again, which is what keeps every bone of it out of the
 *   `floating.isolated` rule, and it only appears where there is room for it —
 *   the small envelopes get the windlass, and the smallest get the cargo;
 * - **the salt is against the walls.** A store whose heaps wander into the
 *   middle of the floor is a store with a pocket in it, so the lane down the
 *   middle is carpet and the middle of the room is left alone.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  BRINE_BUILDING_ARCHETYPES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  brineFacadeDefaults,
  generateBuilding,
  isBrineArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xb21n, "world.brine");
const OTHER = nodeSeed(0xb21n, "world.brine.other");
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
  const facade = brineFacadeDefaults(facadeOf);
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
 * The ground floor's **standable** cells, as the physics lint reads them:
 * solid non-water floor, and two courses of air over it. The classical pack's
 * lesson, kept — a version of this that only looked up would call a basin
 * free floor and pass a building the terrarium then rejected.
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

describe("the brine pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isBrineArchetype(a)).toBe(true);
    }
    expect(isBrineArchetype("cottage")).toBe(false);
    expect(isBrineArchetype("warehouse")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["salt_house"])).toBe("salt_house");
    expect(archetypeOfTags(["salt_store"])).toBe("salt_house");
    expect(archetypeOfTags(["saltern"])).toBe("salt_house");
    expect(archetypeOfTags(["treadwheel_crane"])).toBe("treadwheel_crane");
    expect(archetypeOfTags(["harbour_crane"])).toBe("treadwheel_crane");
    // The near misses. Every one of these belongs to an older table or to no
    // table at all, and this pack must not have moved one of them.
    expect(archetypeOfTags(["warehouse"])).toBe("warehouse");
    expect(archetypeOfTags(["shipyard"])).toBe("shipyard");
    expect(archetypeOfTags(["boathouse"])).toBe("boathouse");
    expect(archetypeOfTags(["lighthouse"])).toBe("lighthouse");
    for (const bare of ["crane", "salt", "store", "dock", "wharf", "quay", "harbour"]) {
      expect(archetypeOfTags([bare]), bare).not.toBe("salt_house");
      expect(archetypeOfTags([bare]), bare).not.toBe("treadwheel_crane");
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      const facade = brineFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(brineFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("church")).not.toEqual(brineFacadeDefaults("salt_house"));
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("nautical_pirate");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
    expect(structureById("salt_house")?.category).toBe("industrial");
    expect(structureById("treadwheel_crane")?.category).toBe("industrial");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the brine pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
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

  /** The lint's own walk, from the door, at every envelope. */
  it("is reachable from its own door, with no pocket", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          assertNoPockets(build(a, size, { floors }), {
            label: `${a} ${size.join("x")} floors=${floors}`,
          });
        }
      }
    }
  }, 30_000);

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
        const free = freeCells(result).filter((k) => k !== lamp);
        expect(oneRegion(free), `${a} ${size.join("x")} without the lantern cell`).toBe(true);
      }
    }
  }, 30_000);

  it("builds the thing each archetype is for", () => {
    // The salt house: white heaps in bays, and a raked lane between them.
    const salt = build("salt_house", BIG, { floors: 1 });
    expect(has(salt, "white_concrete") || has(salt, "calcite"), "the salt").toBe(true);
    expect(has(salt, "light_gray_carpet"), "the raked lane").toBe(true);

    // The crane: a wheel standing on the floor of the back row, a jib out of
    // its head along the room, and the fall hanging off the end of it — none of
    // it reaching the floor.
    const crane = build("treadwheel_crane", BIG, { floors: 1 });
    const at = indexOf(crane.ops);
    const it = crane.meta.interior;
    const rim = crane.ops.filter(
      (op) => op.z === it.z0 && op.y >= 1 && op.y <= 5 && op.block.includes("log"),
    );
    expect(rim.length, "the great wheel's rim").toBe(16);
    const wx = Math.round(rim.reduce((n, op) => n + op.x, 0) / rim.length);
    // A rim, not a disc: the middle of the wheel is air.
    expect(at.get(`${wx},3,${it.z0}`), "the wheel is a rim").toBeUndefined();
    expect(at.get(`${wx},1,${it.z0}`)?.block, "the wheel on the floor").toBeDefined();
    expect(at.get(`${wx},5,${it.z0}`)?.block, "the wheel's head").toBeDefined();
    // The jib, unbroken from the wheel's head to the far wall.
    for (let z = it.z0 + 1; z <= it.z1; z++) {
      expect(at.get(`${wx},5,${z}`)?.block, `the jib at ${z}`).toBeDefined();
    }
    const fall = crane.ops.filter((op) => op.block === "iron_bars");
    expect(fall.length, "the fall").toBeGreaterThan(0);
    expect(
      fall.every((op) => op.y >= 2),
      "the fall stops at head height",
    ).toBe(true);
  });

  /**
   * **The machine follows the room it is in.**
   *
   * The generous envelope gets the great wheel; the middle one has no bay clear
   * of the hearth and the stair wide enough for it and gets the small wheel;
   * the tight one gets the windlass. Every one of them is furniture, so the
   * room is never empty whatever it was handed — a fit-out that assumed its
   * envelope is the oldest bug in the catalog.
   */
  it("scales the machine to the housing it was given", () => {
    const rimOf = (r: ReturnType<typeof generateBuilding>): readonly LocalVoxelOp[] => {
      const itr = r.meta.interior;
      return r.ops.filter(
        (op) => op.z === itr.z0 && op.y >= 1 && op.y <= 5 && op.block.includes("log"),
      );
    };
    const great = rimOf(build("treadwheel_crane", BIG, { floors: 1 }));
    const small = rimOf(build("treadwheel_crane", [13, 13, 13], { floors: 1 }));
    expect(great.length, "the great wheel").toBe(16);
    expect(Math.max(...great.map((o) => o.y)), "five courses of it").toBe(5);
    expect(small.length, "the small wheel").toBe(8);
    expect(Math.max(...small.map((o) => o.y)), "three courses of it").toBe(3);
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        expect(
          build("treadwheel_crane", size, { floors }).meta.furnitureCount,
          `${size.join("x")} f=${floors}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  /**
   * **The wheel is 4-connected, or it is not built.**
   *
   * The property the whole fit-out turns on, asserted the lint's way: every
   * full block over the floor plane has a solid orthogonal neighbour. A wheel
   * drawn as an annulus fails this on its diagonal steps, which is the bug
   * this shape was chosen against.
   */
  it("leaves nothing it writes with air on every side", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const at = indexOf(result.ops);
          const solid = (x: number, y: number, z: number): boolean => {
            const block = at.get(`${x},${y},${z}`)?.block;
            return block !== undefined && block !== "air";
          };
          for (const op of result.ops) {
            if (op.block === "air") continue;
            const touching =
              solid(op.x + 1, op.y, op.z) ||
              solid(op.x - 1, op.y, op.z) ||
              solid(op.x, op.y, op.z + 1) ||
              solid(op.x, op.y, op.z - 1) ||
              solid(op.x, op.y + 1, op.z) ||
              solid(op.x, op.y - 1, op.z);
            expect(
              touching,
              `${a} ${size.join("x")} f=${floors}: ${op.block} at ${op.x},${op.y},${op.z}`,
            ).toBe(true);
          }
        }
      }
    }
  }, 30_000);

  it("keeps everything inside the envelope the solver reserved", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        for (const op of result.ops) {
          expect(op.x, `${a} x`).toBeGreaterThanOrEqual(-1);
          expect(op.x, `${a} x`).toBeLessThanOrEqual(size[0]);
          expect(op.z, `${a} z`).toBeGreaterThanOrEqual(-1);
          expect(op.z, `${a} z`).toBeLessThanOrEqual(size[2]);
          expect(op.y, `${a} y`).toBeLessThanOrEqual(result.meta.roofTop + 3);
        }
      }
    }
  });

  it("hangs no sign and pots nothing bare, and repeats exactly", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      const once = build(a);
      expect(JSON.stringify(build(a).ops)).toBe(JSON.stringify(once.ops));
      for (const op of once.ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} bare pot`).not.toBe("flower_pot");
        expect(op.block, `${a} chain`).not.toBe("chain");
      }
      // A different seed is a different building, not a different footprint.
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size).toEqual(once.meta.size);
    }
  });

  /**
   * **No column of any room is solid from its floor to its ceiling** —
   * `interior.blocked_column` in the lint's own words. Swept over the storey
   * heights, because the defect only appears where a fit-out's height and the
   * band's height meet.
   */
  it("leaves air in every interior column, floor to ceiling", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
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
                `${a} ${size.join("x")} h=${storyHeight} floors=${floors}: column ${cell.x},${cell.z} is solid`,
              ).toBe(true);
            }
          }
        }
      }
    }
  }, 60_000);

  /** **The way up is left exactly as the shell built it.** */
  it("never writes into a stair column", () => {
    for (const a of BRINE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const storyHeight of [3, 4, 5]) {
          for (const floors of [1, 2, 3]) {
            const mine = build(a, size, { floors, storyHeight });
            const shell = build("cottage", size, { floors, storyHeight }, S, a);
            const columns = mine.meta.stairColumns ?? new Set<string>();
            const at = indexOf(mine.ops);
            const base = indexOf(shell.ops);
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
});
