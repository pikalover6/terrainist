/**
 * The vernacular wave: three regional houses.
 *
 * Deliberately the *same* tests the breadth blitz was held to, because a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about:
 *
 * - it registers, resolves, and reads off a node's tags — without stealing a
 *   tag a greedier table already answers to;
 * - it puts something in the room it built, and the room stays one walkable
 *   region;
 * - nothing it builds leaves the envelope the solver reserved — in plan, the
 *   footprint plus the one-block apron; in height, the shell's roof top plus
 *   {@link ROOF_FLOURISH_RISE};
 * - the same seed gives the same ops, forever.
 *
 * Plus the one property that is new in this wave and worth a test of its own:
 * **the saltbox roof is actually asymmetric.** A saltbox whose two slopes are
 * the same length is a gable, and every other assertion here would still pass.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  VERNACULAR_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isVernacularArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  vernacularFacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xbe7an, "world.vernacular");
const OTHER = nodeSeed(0xbe7an, "world.vernacular.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 17, 15];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = SEED,
): ReturnType<typeof generateBuilding> {
  const facade = vernacularFacadeDefaults(archetype);
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

describe("vernacular archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isVernacularArchetype(a)).toBe(true);
    }
    expect(isVernacularArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("is in the catalog as implemented, with a note", () => {
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.note, a).toBeDefined();
    }
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["chalet"])).toBe("alpine_chalet");
    expect(archetypeOfTags(["alpine"])).toBe("alpine_chalet");
    expect(archetypeOfTags(["saltbox"])).toBe("saltbox_house");
    expect(archetypeOfTags(["dutch_gable"])).toBe("dutch_gable_house");
    expect(archetypeOfTags(["canal_house"])).toBe("dutch_gable_house");
    expect(archetypeOfTags(["stepped_gable"])).toBe("dutch_gable_house");
    // The tables either side of this one still win every tag that is theirs.
    expect(archetypeOfTags(["castle"])).toBe("keep");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["temple"])).toBe("church");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency of its own, reachable from the front door", () => {
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
      const facade = vernacularFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      // …and the shared dispatch delegates to it, which is the seam that
      // actually gets called by the exhibits and the settlement kit.
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(vernacularFacadeDefaults("cottage")).toEqual({});
  });

  it("puts something in every room it builds", () => {
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
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
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
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
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
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

    const chalet = build("alpine_chalet");
    expect(has(chalet, "spruce_log"), "boxed corners").toBe(true);
    expect(has(chalet, "stripped_spruce_log"), "banded courses").toBe(true);
    expect(has(chalet, "spruce_stairs"), "the deep eave").toBe(true);
    expect(has(chalet, "campfire"), "the hearth").toBe(true);

    const saltbox = build("saltbox_house");
    expect(has(saltbox, "stripped_oak_wood"), "clapboard courses").toBe(true);
    expect(has(saltbox, "loom"), "the colonial interior").toBe(true);

    const dutch = build("dutch_gable_house");
    expect(has(dutch, "bricks"), "the brick re-clad").toBe(true);
    expect(has(dutch, "cartography_table"), "the merchant's ledger").toBe(true);
  });

  it("throws the saltbox ridge forward, so one slope runs long", () => {
    const result = build("saltbox_house", [11, 16, 17]);
    const base = result.meta.wallTop + 1;
    const [, , sz] = result.meta.size;
    // Ridge = the deepest column of the new roof. It has to sit well forward
    // of the middle, or the "saltbox" is a plain gable.
    let ridgeZ = 0;
    let ridgeY = -1;
    for (const op of result.ops) {
      if (op.y < base || op.block === "air") continue;
      if (op.x < 0 || op.x >= result.meta.size[0]) continue;
      if (op.y > ridgeY) {
        ridgeY = op.y;
        ridgeZ = op.z;
      }
    }
    expect(ridgeY).toBeGreaterThan(base);
    expect(ridgeZ, "the ridge sits forward of centre").toBeLessThan((sz - 1) / 2);
    // …and the two slopes really are different lengths.
    expect(sz - 1 - ridgeZ).toBeGreaterThan(ridgeZ);
  });

  it("stands the Dutch parapet proud of its own roof plane", () => {
    const result = build("dutch_gable_house", [11, 18, 13]);
    const [, , sz] = result.meta.size;
    const at = indexOf(result.ops);
    const base = result.meta.wallTop + 1;
    // Somewhere along the front face there is a brick course above the highest
    // roof cell one step behind it: that overhang *is* the stepped gable.
    let proud = 0;
    for (let x = 0; x < result.meta.size[0]; x++) {
      let gable = -1;
      let roof = -1;
      for (let y = base; y <= result.meta.roofTop + ROOF_FLOURISH_RISE; y++) {
        if ((at.get(`${x},${y},0`)?.block ?? "air") !== "air") gable = y;
        if ((at.get(`${x},${y},1`)?.block ?? "air") !== "air") roof = y;
      }
      expect(gable, `column ${x} of the front gable`).toBeGreaterThanOrEqual(base);
      if (gable > roof) proud++;
    }
    expect(proud, "the parapet stands over the roof").toBeGreaterThan(2);
    expect(sz).toBeGreaterThan(2);
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of VERNACULAR_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
