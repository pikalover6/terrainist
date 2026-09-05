/**
 * The trade wave: a tavern, a general store and an apothecary.
 *
 * Deliberately the *same* tests the earlier waves were held to, because a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing a tag
 *   an older, greedier table already owns;
 * - it puts something in the room it built, and the room stays one walkable
 *   region;
 * - nothing it builds leaves the envelope the solver reserved — in plan, the
 *   footprint plus the one-block apron; in height, the shell's roof top plus
 *   `ROOF_FLOURISH_RISE`;
 * - each one emits the blocks that make it the thing it is;
 * - the same seed gives the same ops, forever.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  TRADE_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isTradeArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  tradeFacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x7ade5n, "world.trade");
const OTHER = nodeSeed(0x7ade5n, "world.trade.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 13, 13];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = SEED,
): ReturnType<typeof generateBuilding> {
  const facade = tradeFacadeDefaults(archetype);
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

describe("trade archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of TRADE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isTradeArchetype(a)).toBe(true);
      expect(structureById(a)?.status, a).toBe("implemented");
    }
    expect(isTradeArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["tavern"])).toBe("tavern");
    expect(archetypeOfTags(["pub"])).toBe("tavern");
    expect(archetypeOfTags(["alehouse"])).toBe("tavern");
    expect(archetypeOfTags(["general_store"])).toBe("general_store");
    expect(archetypeOfTags(["shop"])).toBe("general_store");
    expect(archetypeOfTags(["grocer"])).toBe("general_store");
    expect(archetypeOfTags(["emporium"])).toBe("general_store");
    expect(archetypeOfTags(["apothecary"])).toBe("apothecary");
    expect(archetypeOfTags(["pharmacy"])).toBe("apothecary");
    expect(archetypeOfTags(["herbalist"])).toBe("apothecary");
    expect(archetypeOfTags(["alchemist"])).toBe("apothecary");
    // The greedy tables still win every tag that was theirs before this one
    // existed. These four are the ones a trade wave would have been most
    // tempted to take.
    expect(archetypeOfTags(["trade"])).toBe("inn");
    expect(archetypeOfTags(["inn"])).toBe("inn");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["market"])).toBe("market_stall");
    expect(archetypeOfTags(["arcane"])).toBe("wizard_tower");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency of its own, reachable from the shared dispatch", () => {
    for (const a of TRADE_BUILDING_ARCHETYPES) {
      const facade = tradeFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowShape, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(tradeFacadeDefaults("cottage")).toEqual({});
  });

  it("puts something in every room it builds", () => {
    for (const a of TRADE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of TRADE_BUILDING_ARCHETYPES) {
      for (const floors of [1, 2]) {
        const result = build(a, BIG, { floors });
        const at = indexOf(result.ops);
        const free: string[] = [];
        for (const cell of result.meta.floorCells) {
          const standing = at.get(`${cell.x},1,${cell.z}`);
          if (standing !== undefined && standing.block !== "air") continue;
          free.push(`${cell.x},${cell.z}`);
        }
        expect(free.length, `${a} floors=${floors}`).toBeGreaterThan(3);
        expect(oneRegion(free), `${a} floors=${floors} is one region`).toBe(true);
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of TRADE_BUILDING_ARCHETYPES) {
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
    for (const a of TRADE_BUILDING_ARCHETYPES) {
      for (const size of [BIG, [9, 12, 9], [7, 9, 7]] as const) {
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
    const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
      result.ops.some((op) => op.block === block);

    const tavern = build("tavern");
    expect(has(tavern, "oak_pressure_plate"), "table tops").toBe(true);
    expect(has(tavern, "oak_fence"), "trestles and stools").toBe(true);
    expect(has(tavern, "barrel"), "the stock").toBe(true);
    expect(has(tavern, "campfire"), "the hearth").toBe(true);
    // The wainscot: the roof's own timber, standing in the wall ring at the
    // plinth line, where the shell would have put wall.
    const wainscot = tavern.ops.filter(
      (op) => op.y === 1 && op.block === "dark_oak_planks" && (op.x === 0 || op.z === 0),
    );
    expect(wainscot.length, "wainscot band").toBeGreaterThan(0);

    const store = build("general_store");
    expect(has(store, "bookshelf"), "stock shelves").toBe(true);
    expect(has(store, "chest"), "stock chests").toBe(true);
    expect(has(store, "barrel"), "crates").toBe(true);
    // The awning: upturned stairs in the apron ring, and nowhere else.
    const [sx, , sz] = store.meta.size;
    const apron = store.ops.filter(
      (op) =>
        op.props?.["half"] === "top" &&
        op.block.endsWith("_stairs") &&
        (op.x === -1 || op.x === sx || op.z === -1 || op.z === sz),
    );
    expect(apron.length, "shop awning").toBeGreaterThan(0);

    const apothecary = build("apothecary");
    expect(has(apothecary, "brewing_stand"), "the stills").toBe(true);
    expect(has(apothecary, "cauldron"), "the cauldron").toBe(true);
    expect(has(apothecary, "flower_pot"), "the herbs").toBe(true);
    expect(has(apothecary, "white_candle"), "the bottles").toBe(true);
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of TRADE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
