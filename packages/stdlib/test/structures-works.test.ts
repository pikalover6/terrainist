/**
 * Wave 3B — the twelve works, held to the earlier waves' contract.
 *
 * The tests are deliberately the *same* tests wave two was held to, because a
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one an
 *   earlier table already claims;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever.
 *
 * Plus the field lessons, one test each: the lantern column, the seat rule, no
 * bare pots — and one this genre adds, that a works never writes a fluid.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  WORKS_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isWorksArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  worksFacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa11e3n, "world.works");
const OTHER = nodeSeed(0xa11e3n, "world.works.other");
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
  const facade = worksFacadeDefaults(archetype);
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

describe("wave-3B works archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isWorksArchetype(a)).toBe(true);
    }
    expect(isWorksArchetype("cottage")).toBe(false);
    expect(isWorksArchetype("sawmill")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["brewery"])).toBe("brewery");
    expect(archetypeOfTags(["brewhouse"])).toBe("brewery");
    expect(archetypeOfTags(["distillery"])).toBe("distillery");
    expect(archetypeOfTags(["still"])).toBe("distillery");
    expect(archetypeOfTags(["butcher"])).toBe("butchery");
    expect(archetypeOfTags(["teahouse"])).toBe("tea_house");
    expect(archetypeOfTags(["trading_post"])).toBe("trading_post");
    expect(archetypeOfTags(["outpost"])).toBe("trading_post");
    expect(archetypeOfTags(["pawn"])).toBe("pawnshop");
    expect(archetypeOfTags(["cooper"])).toBe("cooperage");
    expect(archetypeOfTags(["glassblower"])).toBe("glassworks");
    expect(archetypeOfTags(["paper_mill"])).toBe("papermill");
    expect(archetypeOfTags(["weaver"])).toBe("textile_mill");
    expect(archetypeOfTags(["loom"])).toBe("textile_mill");
    expect(archetypeOfTags(["cannery"])).toBe("cannery");
    expect(archetypeOfTags(["casting"])).toBe("foundry");
    // The near misses. Every one of these is a tag an earlier table owns, and
    // claiming any of them would have been a silent theft.
    expect(archetypeOfTags(["trade"])).toBe("inn");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["shop"])).toBe("general_store");
    expect(archetypeOfTags(["grocer"])).toBe("general_store");
    expect(archetypeOfTags(["market"])).toBe("market_stall");
    expect(archetypeOfTags(["stall"])).toBe("market_stall");
    expect(archetypeOfTags(["vendor"])).toBe("market_stall");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["sawmill"])).toBe("sawmill");
    expect(archetypeOfTags(["lumber_mill"])).toBe("sawmill");
    expect(archetypeOfTags(["kiln"])).toBe("kiln");
    expect(archetypeOfTags(["tanner"])).toBe("tannery");
    expect(archetypeOfTags(["craft"])).toBe("smithy");
    expect(archetypeOfTags(["smithy"])).toBe("smithy");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
      const facade = worksFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      // The dispatch chain: `archetypeFacadeDefaults` must fall through to us.
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(worksFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("tannery").roof).toBe("gable");
    expect(archetypeFacadeDefaults("trullo").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
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

describe("wave-3B works buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
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

  /**
   * The lantern lesson, as a property.
   *
   * `core.ts` hangs a lantern over the middle column of the room at head
   * height, so that column is not walk-through. A fit-out whose only route
   * crosses it has built a room with a wall in the middle of it. Deleting the
   * column from the free set must leave the rest connected.
   */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
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
    for (const a of WORKS_BUILDING_ARCHETYPES) {
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
    for (const a of WORKS_BUILDING_ARCHETYPES) {
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
    // Commercial.
    expect(has(build("brewery"), "brewing_stand"), "the brewhouse bench").toBe(true);
    expect(has(build("brewery"), "hay_block"), "the grain").toBe(true);
    expect(has(build("distillery"), "waxed_copper_block"), "the still").toBe(true);
    expect(has(build("distillery"), "lightning_rod"), "the condenser arm").toBe(true);
    expect(has(build("butchery"), "smoker"), "the smoke house").toBe(true);
    expect(has(build("butchery"), "iron_bars"), "the hanging rack").toBe(true);
    expect(has(build("tea_house"), "cauldron"), "the kettle").toBe(true);
    expect(has(build("trading_post"), "white_banner"), "the standard").toBe(true);
    expect(has(build("trading_post"), "hay_block"), "mixed goods").toBe(true);
    expect(has(build("pawnshop"), "iron_bars"), "the grille").toBe(true);
    expect(has(build("pawnshop"), "bookshelf"), "the pledges").toBe(true);
    // Industrial.
    expect(has(build("cooperage"), "smithing_table"), "the hoop bench").toBe(true);
    expect(has(build("cooperage"), "barrel"), "the casks").toBe(true);
    expect(has(build("glassworks"), "glass"), "the finished stock").toBe(true);
    expect(has(build("glassworks"), "sand"), "the sand store").toBe(true);
    expect(has(build("papermill"), "cartography_table"), "the press").toBe(true);
    expect(has(build("papermill"), "quartz_slab"), "the reams").toBe(true);
    expect(has(build("textile_mill"), "loom"), "the looms").toBe(true);
    expect(has(build("textile_mill"), "white_wool"), "the fleece").toBe(true);
    expect(has(build("cannery"), "furnace"), "the sealing line").toBe(true);
    expect(has(build("cannery"), "iron_block"), "the tin stock").toBe(true);
    expect(has(build("foundry"), "blast_furnace"), "the bank").toBe(true);
    expect(has(build("foundry"), "anvil"), "the anvils").toBe(true);
  });

  /**
   * The seat rule, stated the only way it can be checked: geometrically.
   *
   * A stair's `facing` names its **high half** — the backrest. The tea house
   * seats a pair either side of a table along z, so the one to the north of the
   * table carries `facing: "north"` and the one to the south `facing: "south"`:
   * each has its back to the wall behind it and its face to the table.
   */
  it("turns tea-house seats away from the table they face", () => {
    const result = build("tea_house", [13, 13, 15]);
    const at = indexOf(result.ops);
    const it = result.meta.interior;
    // Only the two table bays: the shell's own staircase is a bottom stair on
    // the ground floor too, and it stands on a wall column rather than in a bay.
    const bays = new Set([it.x0 + 1, it.x1 - 1]);
    const seats = result.ops.filter(
      (op) =>
        op.y === 1 &&
        op.block.endsWith("_stairs") &&
        op.props?.["half"] === "bottom" &&
        bays.has(op.x),
    );
    expect(seats.length).toBeGreaterThan(1);
    for (const seat of seats) {
      const facing = seat.props?.["facing"];
      expect(["north", "south"], `seat at ${seat.x},${seat.z}`).toContain(facing);
      // The table is the cell on the far side from the backrest.
      const dz = facing === "north" ? 1 : -1;
      const table = at.get(`${seat.x},1,${seat.z + dz}`);
      expect(table, `table in front of the seat at ${seat.x},${seat.z}`).toBeDefined();
      expect(table?.block, `table in front of the seat at ${seat.x},${seat.z}`).not.toBe("air");
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /**
   * A works never writes a fluid.
   *
   * The physics lint has a zero-unstable-fluids rule, and every liquid in this
   * genre — liquor, brine, pulp, dye, quench — is a `cauldron` instead, which
   * is a container rather than a source block.
   */
  it("never writes water, lava or a waterlogged prop", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        for (const op of result.ops) {
          expect(op.block, `${a} ${size.join("x")}`).not.toBe("water");
          expect(op.block, `${a} ${size.join("x")}`).not.toBe("lava");
          if (op.props?.["waterlogged"] !== undefined) {
            expect(op.props["waterlogged"], `${a} ${op.block}`).toBe("false");
          }
        }
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of WORKS_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
