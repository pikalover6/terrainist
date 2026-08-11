/**
 * The **sanctum pack**: ten buildings the icon law asks for by name, on wave
 * two's contract.
 *
 * The harness is deliberately the *same* one every earlier wave was held to,
 * because a new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and this pack's near misses are the
 *   sharpest in the catalog, because it owns the **ids** `temple`, `chapel`
 *   and `shrine` and owns **none of those three words**;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - the lantern column is never the room's only route;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, no sign blocks, and the same seed gives the same ops
 *   forever.
 *
 * Plus the three this pack exists to prove, all of which are *silhouette*
 * properties rather than furniture ones:
 *
 * - **the temple's peristyle stands on the ground.** A colonnade whose feet
 *   are air is a colonnade the support walk fails, and the apron is not always
 *   at `y = 1`;
 * - **the bowl's seats look inward.** A stair's `facing` is its backrest, so
 *   every seat in a cavea faces *away* from the middle. Asserting one side of
 *   the bowl would pass with the rule inverted; asserting the four compass
 *   points cannot;
 * - **nothing above the plate floats.** Every cell this pack writes over the
 *   eave has a neighbour among the pack's own blocks or the shell's — which is
 *   the property the "a stepped shell hangs its steps on nothing" lesson is
 *   about, checked here rather than left to the emit-time lint.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  SANCTUM_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isSanctumArchetype,
  nodeSeed,
  resolveArchetype,
  sanctumFacadeDefaults,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x5a2cn, "world.sanctum");
const OTHER = nodeSeed(0x5a2cn, "world.sanctum.other");
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
): ReturnType<typeof generateBuilding> {
  const facade = sanctumFacadeDefaults(archetype);
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

describe("the sanctum pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isSanctumArchetype(a)).toBe(true);
    }
    expect(isSanctumArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["classical_temple"])).toBe("temple");
    expect(archetypeOfTags(["greek_temple"])).toBe("temple");
    expect(archetypeOfTags(["peristyle"])).toBe("temple");
    expect(archetypeOfTags(["parthenon"])).toBe("temple");
    expect(archetypeOfTags(["wayside_chapel"])).toBe("chapel");
    expect(archetypeOfTags(["oratory"])).toBe("chapel");
    expect(archetypeOfTags(["votive_shrine"])).toBe("shrine");
    expect(archetypeOfTags(["roadside_shrine"])).toBe("shrine");
    expect(archetypeOfTags(["altar_stone"])).toBe("altar_stone");
    expect(archetypeOfTags(["altar"])).toBe("altar_stone");
    expect(archetypeOfTags(["wayside_cross"])).toBe("wayside_cross");
    expect(archetypeOfTags(["calvary"])).toBe("wayside_cross");
    expect(archetypeOfTags(["obelisk"])).toBe("obelisk");
    expect(archetypeOfTags(["stele"])).toBe("obelisk");
    expect(archetypeOfTags(["colossus"])).toBe("colossus");
    expect(archetypeOfTags(["colossal_statue"])).toBe("colossus");
    expect(archetypeOfTags(["amphitheater"])).toBe("amphitheater");
    expect(archetypeOfTags(["amphitheatre"])).toBe("amphitheater");
    expect(archetypeOfTags(["odeon"])).toBe("amphitheater");
    expect(archetypeOfTags(["arena"])).toBe("arena");
    expect(archetypeOfTags(["colosseum"])).toBe("arena");
    expect(archetypeOfTags(["stadium"])).toBe("stadium");
    expect(archetypeOfTags(["hippodrome"])).toBe("stadium");
    // The near misses. Every one of these belongs to an older table, and this
    // pack owning the *ids* must not have moved one of the *words*.
    expect(archetypeOfTags(["temple"])).toBe("church");
    expect(archetypeOfTags(["shrine"])).toBe("church");
    expect(archetypeOfTags(["chapel"])).toBe("church");
    expect(archetypeOfTags(["worship"])).toBe("church");
    expect(archetypeOfTags(["cathedral"])).toBe("cathedral");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["tomb"])).toBe("mausoleum");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
      const facade = sanctumFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(sanctumFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("minaret").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
    expect(structureById("temple")?.category).toBe("religious");
    expect(structureById("amphitheater")?.category).toBe("leisure");
    expect(structureById("stadium")?.category).toBe("leisure");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the sanctum pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
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
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
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
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
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
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
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
  }, 30_000);

  it("builds the thing each archetype is for", () => {
    // The colonnade and the pediment: a temple's whole read is the count of
    // full blocks standing outside its walls.
    const temple = build("temple", [15, 16, 21], { floors: 1 });
    const columns = temple.ops.filter((op) => op.x === -1 && op.y > 1 && op.y < temple.meta.wallTop);
    expect(columns.length, "the peristyle").toBeGreaterThan(3);
    expect(has(temple, "orange_carpet"), "the processional").toBe(true);
    expect(has(build("chapel", [9, 11, 13], { floors: 1 }), "bell"), "the bellcote").toBe(true);
    expect(has(build("shrine", [9, 11, 9], { floors: 1 }), "lantern"), "the canopy light").toBe(true);
    expect(has(build("altar_stone", [9, 11, 9], { floors: 1 }), "chiseled_stone_bricks"), "the table").toBe(true);
    expect(has(build("wayside_cross", [9, 14, 9]), "gray_carpet"), "the path").toBe(true);
    expect(has(build("obelisk", [7, 22, 7]), "end_rod"), "the spike").toBe(true);
    expect(has(build("colossus", [15, 12, 15]), "torch"), "the raised arm").toBe(true);
    expect(has(build("arena", [17, 15, 17]), "sand"), "the arena floor").toBe(true);
    expect(has(build("stadium", [15, 13, 21]), "green_carpet"), "the pitch").toBe(true);
    expect(has(build("stadium", [15, 13, 21]), "sea_lantern"), "the floodlights").toBe(true);
  });

  /**
   * The peristyle stands on the ground.
   *
   * Wave 4B's cathedral lesson, and the reason `footing` exists: the apron is
   * not always at `y = 1`, so a column that starts at `y = 1` starts in mid
   * air wherever the shell left the ground course empty. Every apron column
   * cell of a temple must therefore have something under it.
   */
  it("stands the temple's colonnade on something", () => {
    for (const size of [BIG, [15, 16, 21]] as const) {
      const result = build("temple", size, { floors: 1 });
      const at = indexOf(result.ops);
      const [sx, , sz] = result.meta.size;
      for (const op of result.ops) {
        const apron = op.x === -1 || op.x === sx || op.z === -1 || op.z === sz;
        if (!apron || op.y !== 1 || op.block === "air") continue;
        const under = at.get(`${op.x},0,${op.z}`);
        expect(under?.block, `${size.join("x")} column foot at ${op.x},${op.z}`).toBeDefined();
        expect(under?.block, `${size.join("x")} column foot at ${op.x},${op.z}`).not.toBe("air");
      }
    }
  });

  /**
   * The bowl looks inward, on all four sides.
   *
   * A stair's `facing` is its **backrest**, so a seat in a cavea faces away
   * from the middle. Checking one side of the ring would pass with the rule
   * inverted, so this checks the seat nearest each of the four compass points
   * of the arena's full ellipse.
   */
  it("turns every seat of the bowl in toward the middle", () => {
    const result = build("arena", [17, 15, 17]);
    const [sx, , sz] = result.meta.size;
    const mx = (sx - 1) >> 1;
    const mz = (sz - 1) >> 1;
    const seats = result.ops.filter(
      (op) => op.block.endsWith("_stairs") && op.y > result.meta.wallTop,
    );
    expect(seats.length, "the bank").toBeGreaterThan(20);
    // One cell in from each compass point: the four points themselves carry
    // the velarium masts, whose seats are swapped for full blocks so a post
    // has something to stand on.
    const expected: readonly (readonly [number, number, string])[] = [
      [mx, 1, "north"],
      [mx, sz - 2, "south"],
      [1, mz, "west"],
      [sx - 2, mz, "east"],
    ];
    for (const [x, z, facing] of expected) {
      const there = seats.filter((op) => op.x === x && op.z === z);
      expect(there.length, `a seat at ${x},${z}`).toBeGreaterThan(0);
      for (const op of there) expect(op.props?.["facing"], `seat at ${x},${z}`).toBe(facing);
    }
  });

  /**
   * Nothing this pack builds over the eave plate floats.
   *
   * The physics lint's `floating.*` rule polices a full cube with six air
   * faces, and the lesson this pack was written against — "a stepped shell
   * hangs its steps on nothing" — is exactly that rule met the hard way. The
   * check is the rule itself, run against the finished op set rather than
   * against a list of the shapes that went wrong.
   */
  it("leaves no full block above the plate with six air faces", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
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

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot, and hangs no signs", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
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

  /** Nothing on an altar is alight: the candles and the campfires are unlit. */
  it("lights no fire on an altar", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) {
        if (op.block.endsWith("_candle")) expect(op.props?.["lit"], `${a} candle`).toBe("false");
        if (op.block === "campfire") expect(op.props?.["lit"], `${a} campfire`).toBe("false");
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of SANCTUM_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
