/**
 * The breadth blitz: ten archetypes and fifteen props.
 *
 * The contract is the one every earlier wave was held to, and the tests are
 * deliberately the *same* tests, because a new archetype that needs a new
 * kind of guarantee is a new archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags;
 * - it puts something in the room it built, and the room stays one walkable
 *   region;
 * - nothing it builds leaves the envelope the solver reserved — in plan, the
 *   footprint plus the one-block apron; in height, the shell's roof top plus
 *   {@link ROOF_FLOURISH_RISE};
 * - the same seed gives the same ops, forever.
 *
 * Plus the one property that is new in this round and is worth a test of its
 * own: **the pool's water is boxed in**. Every water block it writes has
 * something solid under it and on all four sides, which is exactly the
 * predicate the compiler's `checkPropFluidSafety` re-derives from the emitted
 * blocks. Asserting it here as well means a change to the basin fails in the
 * grammar's own suite rather than three packages downstream.
 */

import { describe, expect, it } from "vitest";

import {
  BLITZ_BUILDING_ARCHETYPES,
  BLITZ_PROP_NAMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  POOL_FLOOR_Y,
  POOL_WATER_Y,
  PROP_NAMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeOfTags,
  blitzFacadeDefaults,
  blitzPropFootprint,
  generateBuilding,
  generateProp,
  isBlitzArchetype,
  isBlitzProp,
  nodeSeed,
  propFootprint,
  resolveArchetype,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xb1112n, "world.blitz");
const OTHER = nodeSeed(0xb1112n, "world.blitz.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 17, 13];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = SEED,
): ReturnType<typeof generateBuilding> {
  const facade = blitzFacadeDefaults(archetype);
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

/* -------------------------------------------------------------------------- */
/* archetypes                                                                  */
/* -------------------------------------------------------------------------- */

describe("breadth archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of BLITZ_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isBlitzArchetype(a)).toBe(true);
    }
    expect(isBlitzArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["castle"])).toBe("keep");
    expect(archetypeOfTags(["gatehouse"])).toBe("gatehouse");
    expect(archetypeOfTags(["garrison"])).toBe("barracks");
    expect(archetypeOfTags(["pagoda"])).toBe("pagoda");
    expect(archetypeOfTags(["wizard"])).toBe("wizard_tower");
    expect(archetypeOfTags(["observatory"])).toBe("observatory");
    expect(archetypeOfTags(["glasshouse"])).toBe("greenhouse");
    expect(archetypeOfTags(["gym"])).toBe("gym");
    expect(archetypeOfTags(["mausoleum"])).toBe("mausoleum");
    expect(archetypeOfTags(["windpump"])).toBe("windpump");
    // The greedy tables below still win the tags that are theirs.
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["temple"])).toBe("church");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency of its own", () => {
    for (const a of BLITZ_BUILDING_ARCHETYPES) {
      const facade = blitzFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
    }
    expect(blitzFacadeDefaults("cottage")).toEqual({});
  });

  it("puts something in every room it builds", () => {
    for (const a of BLITZ_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of BLITZ_BUILDING_ARCHETYPES) {
      for (const floors of [1, 2]) {
        const result = build(a, BIG, { floors });
        const at = indexOf(result.ops);
        const free: string[] = [];
        for (const cell of result.meta.floorCells) {
          const standing = at.get(`${cell.x},1,${cell.z}`);
          // Air is written by the roof clear, never on the floor plane, so a
          // cell with an op on it is a cell something is standing in.
          if (standing !== undefined && standing.block !== "air") continue;
          free.push(`${cell.x},${cell.z}`);
        }
        expect(free.length, `${a} floors=${floors}`).toBeGreaterThan(3);
        expect(oneRegion(free), `${a} floors=${floors} is one region`).toBe(true);
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    // The roof rebuilds write air; if one of them ever reached the floor, the
    // building would have a hole in it that no other test would see.
    for (const a of BLITZ_BUILDING_ARCHETYPES) {
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
    for (const a of BLITZ_BUILDING_ARCHETYPES) {
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

    // The military set shares one battlement, and every one of them wears it:
    // a masonry course above the eave plate with gaps in it.
    for (const a of ["keep", "gatehouse"] as const) {
      const result = build(a);
      const merlons = result.ops.filter(
        (op) => op.y > result.meta.wallTop + 1 && op.block !== "air",
      );
      expect(merlons.length, `${a} merlons`).toBeGreaterThan(4);
    }
    expect(has(build("keep"), "anvil"), "keep arms").toBe(true);
    expect(has(build("gatehouse"), "iron_bars"), "portcullis").toBe(true);
    expect(has(build("barracks"), "white_bed"), "bunks").toBe(true);
    expect(has(build("pagoda"), "red_carpet"), "shrine runner").toBe(true);
    expect(has(build("wizard_tower"), "glowstone"), "glowing accents").toBe(true);
    expect(has(build("wizard_tower"), "brewing_stand"), "the workshop").toBe(true);
    expect(has(build("observatory"), "end_rod"), "the eyepiece").toBe(true);
    expect(has(build("greenhouse"), "glass"), "glazing").toBe(true);
    expect(has(build("greenhouse"), "farmland"), "crop beds").toBe(true);
    expect(has(build("gym"), "glass"), "mirrors").toBe(true);
    expect(has(build("gym"), "blue_wool"), "mats").toBe(true);
    expect(has(build("gym"), "anvil"), "the iron").toBe(true);
    expect(has(build("mausoleum"), "chiseled_stone_bricks"), "the tomb").toBe(true);
    expect(has(build("windpump"), "piston"), "the pump head").toBe(true);
  });

  it("stacks three or more eave tiers on a pagoda", () => {
    const result = build("pagoda", [15, 20, 15]);
    const base = result.meta.wallTop + 1;
    // A tier is a course above the plate carrying upturned roof stairs — the
    // flare. Three of them at least, which is what makes it a pagoda.
    const tiers = new Set(
      result.ops
        .filter((op) => op.y >= base && op.props?.["half"] === "top" && op.block.endsWith("_stairs"))
        .map((op) => op.y),
    );
    expect(tiers.size).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of BLITZ_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      // A different seed is a different building only in the draws.
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* props                                                                       */
/* -------------------------------------------------------------------------- */

describe("breadth props", () => {
  it("registers every one of them, once", () => {
    for (const p of BLITZ_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isBlitzProp(p)).toBe(true);
    }
    expect(isBlitzProp("rowboat")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of BLITZ_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(blitzPropFootprint(p, {}));
      const result = generateProp({ prop: p, seed: SEED });
      expect(result.meta.size, p).toEqual(declared.size);
      for (const op of result.ops) {
        expect(op.x, `${p} x`).toBeGreaterThanOrEqual(0);
        expect(op.x, `${p} x`).toBeLessThan(declared.size[0]);
        expect(op.z, `${p} z`).toBeGreaterThanOrEqual(0);
        expect(op.z, `${p} z`).toBeLessThan(declared.size[2]);
        expect(op.y, `${p} y`).toBeGreaterThanOrEqual(declared.minY);
        expect(op.y, `${p} y`).toBeLessThan(declared.minY + declared.size[1]);
      }
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of BLITZ_PROP_NAMES) {
      const result = generateProp({ prop: p, seed: SEED });
      const [sx, , sz] = result.meta.size;
      for (const yaw of [90, 180, 270] as const) {
        const rotated = rotateOps(result.ops, yaw, sx, sz);
        expect(rotated.length, `${p} @${yaw}`).toBe(result.ops.length);
        const [w, d] = yaw === 180 ? [sx, sz] : [sz, sx];
        for (const op of rotated) {
          expect(op.x, `${p} @${yaw} x`).toBeGreaterThanOrEqual(0);
          expect(op.x, `${p} @${yaw} x`).toBeLessThan(w);
          expect(op.z, `${p} @${yaw} z`).toBeGreaterThanOrEqual(0);
          expect(op.z, `${p} @${yaw} z`).toBeLessThan(d);
        }
      }
    }
  });

  it("gives the same ops for the same seed, every time", () => {
    for (const p of BLITZ_PROP_NAMES) {
      const once = JSON.stringify(generateProp({ prop: p, seed: SEED }).ops);
      expect(JSON.stringify(generateProp({ prop: p, seed: SEED }).ops), p).toBe(once);
    }
  });

  it("scales the curtain wall with its length param and keeps its stair", () => {
    for (const length of [6, 16, 32]) {
      const result = generateProp({ prop: "curtain_wall", seed: SEED, params: { length } });
      expect(result.meta.size[0], `length ${length}`).toBe(length);
      const stairs = result.ops.filter((op) => op.block.endsWith("_stairs"));
      expect(stairs.length, `length ${length} stair`).toBeGreaterThanOrEqual(3);
      // The merlon course exists at every length.
      expect(result.ops.some((op) => op.y === 5), `length ${length} merlons`).toBe(true);
    }
  });

  it("boxes the swimming pool's water in on five faces", () => {
    const result = generateProp({ prop: "swimming_pool", seed: SEED });
    const at = indexOf(result.ops);
    const water = result.ops.filter((op) => op.block === "water");
    expect(water.length).toBeGreaterThan(50);
    const solid = (x: number, y: number, z: number): boolean => {
      const op = at.get(`${x},${y},${z}`);
      return op !== undefined && op.block !== "air";
    };
    for (const cell of water) {
      // Down, and all four sides: the predicate `checkPropFluidSafety` runs.
      expect(solid(cell.x, cell.y - 1, cell.z), `under ${cell.x},${cell.y},${cell.z}`).toBe(true);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        expect(
          solid(cell.x + dx, cell.y, cell.z + dz),
          `beside ${cell.x},${cell.y},${cell.z}`,
        ).toBe(true);
      }
      // …and the surface is where the pool says it is.
      expect(cell.y).toBeGreaterThan(POOL_FLOOR_Y);
      expect(cell.y).toBeLessThanOrEqual(POOL_WATER_Y);
    }
    // The pieces that make it a pool rather than a tank.
    expect(result.ops.some((op) => op.block === "ladder"), "ladder").toBe(true);
    expect(
      result.ops.some((op) => op.block.endsWith("_stained_glass")),
      "lane ropes",
    ).toBe(true);
    expect(result.ops.some((op) => op.y === 2 && op.block.endsWith("_slab")), "board").toBe(true);
  });

  it("grows the treehouse a trunk, a deck and a way up it", () => {
    const result = generateProp({ prop: "treehouse", seed: SEED });
    const at = indexOf(result.ops);
    // A continuous ladder from the ground to the deck, every rung backed by
    // the trunk column the `facing` names.
    for (let y = 0; y <= 9; y++) {
      const rung = at.get(`2,${y},4`);
      expect(rung?.block, `rung at y ${y}`).toBe("ladder");
      const backing = at.get(`3,${y},4`);
      expect(backing, `backing at y ${y}`).toBeDefined();
      expect(backing?.block.endsWith("_log"), `backing at y ${y} is trunk`).toBe(true);
    }
    expect(result.ops.some((op) => op.block.endsWith("_leaves")), "canopy").toBe(true);
  });

  it("lays a graveyard out as a yard: fence, path, plots and a mausoleum", () => {
    const result = generateProp({ prop: "graveyard", seed: SEED });
    const kinds = new Set(result.ops.map((op) => op.block));
    expect([...kinds].some((k) => k.endsWith("_fence")), "fence").toBe(true);
    expect(kinds.has("podzol"), "grave mounds").toBe(true);
    expect(kinds.has("chiseled_stone_bricks"), "the sarcophagus").toBe(true);
    // Headstone variety: the four shapes are drawn, so more than one of the
    // stone families appears above the ground plane.
    const above = new Set(result.ops.filter((op) => op.y >= 1).map((op) => op.block));
    expect(above.size).toBeGreaterThan(3);
  });

  it("camps a campsite: two tents, a caravan and a fire between them", () => {
    const result = generateProp({ prop: "campsite", seed: SEED });
    const kinds = result.ops.map((op) => op.block);
    expect(kinds).toContain("campfire");
    expect(kinds.some((k) => k.endsWith("_wool")), "canvas").toBe(true);
    expect(kinds.some((k) => k === "glass_pane"), "the caravan's window").toBe(true);
    expect(result.ops.filter((op) => op.block === "white_carpet").length, "bedrolls").toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

describe("the catalog, against this round", () => {
  it("claims every new archetype and prop as implemented, and nothing else", () => {
    for (const id of [...BLITZ_BUILDING_ARCHETYPES, ...BLITZ_PROP_NAMES]) {
      const entry = structureById(id);
      expect(entry, `${id} is missing from the catalog`).toBeDefined();
      expect(entry?.status, id).toBe("implemented");
    }
  });

  it("spread the round across many categories, which was the point", () => {
    const round = new Set<string>([...BLITZ_BUILDING_ARCHETYPES, ...BLITZ_PROP_NAMES]);
    const categories = new Set(
      STRUCTURE_CATALOG.filter((e) => round.has(e.id)).map((e) => e.category),
    );
    expect(categories.size).toBeGreaterThanOrEqual(10);
  });
});
