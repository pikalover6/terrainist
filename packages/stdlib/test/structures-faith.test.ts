/**
 * Archetype wave 4B: twelve faith and memorial buildings, on wave two's
 * contract.
 *
 * The harness is deliberately the *same* one every earlier wave was held to,
 * because a new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and the near misses here are sharper
 *   than any wave's before it, because `temple`, `shrine`, `chapel` and
 *   `worship` all mean **church**, `tomb` and `sepulchre` mean **mausoleum**
 *   and `tower` means **watchtower**;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - the lantern column is never the room's only route;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, and the same seed gives the same ops forever.
 *
 * Plus the two this wave exists to prove:
 *
 * - **the seat rule, in both directions.** The abbey's choir stalls are two
 *   ranks facing *each other* across the aisle, so the west rank's backrest is
 *   west and the east rank's is east. A file that got the rule half right
 *   would pass a one-rank test and fail this one;
 * - **the stupa's ring lane.** The core stands in the middle of the floor and
 *   the circumambulation is the ring round it, so the floor must stay one
 *   region with the core in place — which is what makes it a lane rather than
 *   a blockage.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  FAITH_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  faithFacadeDefaults,
  generateBuilding,
  isFaithArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xfa17n, "world.faith");
const OTHER = nodeSeed(0xfa17n, "world.faith.other");
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
  const facade = faithFacadeDefaults(archetype);
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

describe("wave-4B faith archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isFaithArchetype(a)).toBe(true);
    }
    expect(isFaithArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["cathedral"])).toBe("cathedral");
    expect(archetypeOfTags(["basilica"])).toBe("cathedral");
    expect(archetypeOfTags(["monastery"])).toBe("monastery");
    expect(archetypeOfTags(["friary"])).toBe("monastery");
    expect(archetypeOfTags(["abbey"])).toBe("abbey");
    expect(archetypeOfTags(["cloister"])).toBe("cloister");
    expect(archetypeOfTags(["garth"])).toBe("cloister");
    expect(archetypeOfTags(["hermitage"])).toBe("hermitage");
    expect(archetypeOfTags(["mosque"])).toBe("mosque");
    expect(archetypeOfTags(["masjid"])).toBe("mosque");
    expect(archetypeOfTags(["synagogue"])).toBe("synagogue");
    expect(archetypeOfTags(["shul"])).toBe("synagogue");
    expect(archetypeOfTags(["stupa"])).toBe("stupa");
    expect(archetypeOfTags(["ziggurat"])).toBe("ziggurat");
    expect(archetypeOfTags(["bell_tower"])).toBe("bell_tower");
    expect(archetypeOfTags(["campanile"])).toBe("bell_tower");
    expect(archetypeOfTags(["belfry"])).toBe("bell_tower");
    expect(archetypeOfTags(["minaret"])).toBe("minaret");
    // The tomb's id is ours; the *word* is the mausoleum's, so the archetype
    // is reached by the two tags nothing else claims.
    expect(archetypeOfTags(["burial_chamber"])).toBe("tomb");
    expect(archetypeOfTags(["cist"])).toBe("tomb");
    // The near misses. Every one of these belongs to an older table and this
    // wave must not have moved it — they are the whole risk of a faith wave.
    expect(archetypeOfTags(["temple"])).toBe("church");
    expect(archetypeOfTags(["shrine"])).toBe("church");
    expect(archetypeOfTags(["chapel"])).toBe("church");
    expect(archetypeOfTags(["worship"])).toBe("church");
    expect(archetypeOfTags(["church"])).toBe("church");
    expect(archetypeOfTags(["tomb"])).toBe("mausoleum");
    expect(archetypeOfTags(["sepulchre"])).toBe("mausoleum");
    expect(archetypeOfTags(["mausoleum"])).toBe("mausoleum");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["pagoda"])).toBe("pagoda");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
      const facade = faithFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(faithFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("igloo").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(4);
      expect(entry?.note, a).toBeDefined();
    }
    // The tomb is the memorial category's, not the religious one's.
    expect(structureById("tomb")?.category).toBe("memorial");
    expect(structureById("tomb")?.kind).toBe("building");
    expect(STRUCTURE_CATALOG.filter((e) => e.id === "stupa")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("wave-4B faith buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
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

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
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
    for (const a of FAITH_BUILDING_ARCHETYPES) {
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
    for (const a of FAITH_BUILDING_ARCHETYPES) {
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
    // Twelve archetypes at three envelopes, every op of every one of them
    // checked: the sweep is honest rather than fast, so it gets its own budget.
  }, 30_000);

  it("builds the thing each archetype is for", () => {
    expect(has(build("cathedral"), "red_carpet"), "the nave").toBe(true);
    expect(has(build("cathedral"), "chiseled_stone_bricks"), "the altar").toBe(true);
    expect(has(build("monastery"), "lectern"), "the scriptorium").toBe(true);
    expect(has(build("abbey"), "red_carpet"), "the aisle").toBe(true);
    expect(has(build("cloister"), "grass_block"), "the garth").toBe(true);
    expect(has(build("cloister"), "cauldron"), "the well head").toBe(true);
    expect(has(build("hermitage"), "white_bed"), "the cot").toBe(true);
    expect(has(build("hermitage"), "chiseled_stone_bricks"), "the niche").toBe(true);
    expect(has(build("mosque"), "green_carpet"), "the prayer rows").toBe(true);
    expect(has(build("synagogue"), "lectern"), "the bimah").toBe(true);
    expect(has(build("stupa"), "chiseled_stone_bricks"), "the core").toBe(true);
    expect(has(build("ziggurat"), "orange_carpet"), "the processional").toBe(true);
    expect(has(build("bell_tower"), "bell"), "the bell").toBe(true);
    expect(has(build("minaret"), "end_rod"), "the crescent spike").toBe(true);
    expect(has(build("tomb"), "gray_candle"), "the mourning candles").toBe(true);
  });

  /**
   * No figural decor in the mosque, and no sign block anywhere.
   *
   * The sign rule is the whole wave's: a sign block is a defect in every
   * building here, banner or not.
   */
  it("hangs no signs, and puts nothing figural in the mosque", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const signs = result.ops.filter((op) => op.block.endsWith("_sign"));
        expect(signs, `${a} ${size.join("x")}`).toEqual([]);
      }
    }
    const mosque = build("mosque");
    // Banners and paintings only: the potted plants at the sills are the
    // *shell's* window dressing, not this fit-out's, and a flower is not a
    // figure.
    const figural = mosque.ops.filter(
      (op) => op.block.endsWith("_banner") || op.block === "painting",
    );
    expect(figural).toEqual([]);
  });

  /**
   * The seat rule, **both ways**.
   *
   * An abbey's choir is two ranks looking at each other across the aisle. A
   * stair's `facing` is its high half — its backrest — so the rank west of the
   * aisle carries `facing: "west"` and the rank east of it `facing: "east"`.
   * Asserting only one rank would pass with the rule inverted; asserting both
   * cannot.
   */
  it("turns both ranks of choir stalls to face each other", () => {
    const result = build("abbey", [13, 15, 19]);
    const it = result.meta.interior;
    const mid = Math.floor((it.x0 + it.x1) / 2);
    const stalls = result.ops.filter(
      (op) => op.y === 1 && op.block.endsWith("_stairs") && op.props?.["half"] === "bottom",
    );
    const west = stalls.filter((op) => op.x === mid - 2);
    const east = stalls.filter((op) => op.x === mid + 2);
    expect(west.length, "the west rank").toBeGreaterThan(2);
    expect(east.length, "the east rank").toBeGreaterThan(2);
    for (const op of west) expect(op.props?.["facing"], `west stall at ${op.z}`).toBe("west");
    for (const op of east) expect(op.props?.["facing"], `east stall at ${op.z}`).toBe("east");
  });

  /** A cathedral's pews all look at the altar, and the aisle is three wide. */
  it("seats a cathedral facing its altar across a three-column aisle", () => {
    const result = build("cathedral", [15, 17, 21]);
    const it = result.meta.interior;
    const mid = Math.floor((it.x0 + it.x1) / 2);
    const door = result.meta.door;
    expect(door).not.toBeNull();
    const altarNorth = (door?.z ?? it.z1) > (it.z0 + it.z1) / 2;
    const expected = altarNorth ? "south" : "north";
    const pews = result.ops.filter(
      (op) => op.y === 1 && op.block.endsWith("_stairs") && op.props?.["half"] === "bottom",
    );
    expect(pews.length).toBeGreaterThan(6);
    for (const pew of pews) {
      expect(pew.props?.["facing"], `pew at ${pew.x},${pew.z}`).toBe(expected);
      // And none of them stands in the aisle.
      expect(Math.abs(pew.x - mid) > 1, `pew at ${pew.x},${pew.z} is out of the aisle`).toBe(true);
    }
  });

  /**
   * The stupa's circumambulation, as a property rather than as a block list.
   *
   * The core stands in the middle of the floor; the lane is the ring round it.
   * So the floor must stay one region *with* the core in place — that is the
   * whole difference between a lane and a blockage — and the lane must be wide
   * enough to have cells on all four sides of the core.
   */
  it("keeps a clear ring lane round the stupa's core", () => {
    for (const size of [BIG, [13, 17, 13]] as const) {
      const result = build("stupa", size);
      const it = result.meta.interior;
      const free = new Set(freeCells(result));
      expect(oneRegion([...free]), `${size.join("x")} lane is one region`).toBe(true);
      const mx = Math.floor((it.x0 + it.x1) / 2);
      const mz = Math.floor((it.z0 + it.z1) / 2);
      // A cell of lane on each side of the core: north, south, east and west.
      for (const [lx, lz] of [
        [mx, it.z0],
        [mx, it.z1],
        [it.x0, mz],
        [it.x1, mz],
      ] as const) {
        expect(free.has(`${lx},${lz}`), `${size.join("x")} lane at ${lx},${lz}`).toBe(true);
      }
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of FAITH_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
