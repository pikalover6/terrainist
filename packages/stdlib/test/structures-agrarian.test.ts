/**
 * The **agrarian pack** — the eight rural yards and the marketplace, held to
 * the earlier waves' contract.
 *
 * Deliberately the *same* tests wave four D was held to, because a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table claims — bare `farm`, `market`, `stable`, `mill` and
 *   `house` all still go exactly where they went;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes, and with the
 *   lantern column deleted;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, no sign blocks, no open fluid, no `level` on a
 *   cauldron, and the same seed gives the same ops forever;
 * - **nothing it adds floats or stands unsupported, in any theme** — the
 *   differential sweep the classical-b pack established, because every fit-out
 *   here writes into the apron and the apron is where floating props come
 *   from.
 *
 * Plus the two this pack owns, both of which are the reason it exists:
 *
 * - **a pen is open-topped and has a way in.** Nothing is ever written over an
 *   apron cell's ring courses, the doorstep gap is left open, and a closed
 *   gate stands somewhere in the ring;
 * - **the doorstep stays standable** — air at `y+1` and `y+2` outside every
 *   door — which is the physics reading of "enterable" and the one thing a
 *   pen ring in the apron could plausibly have broken.
 */

import { describe, expect, it } from "vitest";

import {
  AGRARIAN_BUILDING_ARCHETYPES,
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  agrarianFacadeDefaults,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isAgrarianArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa6a1n, "world.agrarian");
const OTHER = nodeSeed(0xa6a1n, "world.agrarian.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 18, 15];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 14, 13], [9, 12, 9]];

/** The pens — the four archetypes that ring their apron. */
const PENS = ["pigsty", "sheepfold", "cattle_pen"] as const;

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = agrarianFacadeDefaults(archetype);
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

describe("agrarian archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isAgrarianArchetype(a)).toBe(true);
    }
    expect(isAgrarianArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["grange"])).toBe("farmstead");
    expect(archetypeOfTags(["croft"])).toBe("farmstead");
    expect(archetypeOfTags(["pigsty"])).toBe("pigsty");
    expect(archetypeOfTags(["pig_pen"])).toBe("pigsty");
    expect(archetypeOfTags(["sheepfold"])).toBe("sheepfold");
    expect(archetypeOfTags(["sheep_pen"])).toBe("sheepfold");
    expect(archetypeOfTags(["cattle_pen"])).toBe("cattle_pen");
    expect(archetypeOfTags(["corral"])).toBe("cattle_pen");
    expect(archetypeOfTags(["paddock"])).toBe("cattle_pen");
    expect(archetypeOfTags(["orchard"])).toBe("orchard");
    expect(archetypeOfTags(["fruit_grove"])).toBe("orchard");
    expect(archetypeOfTags(["vineyard"])).toBe("vineyard");
    expect(archetypeOfTags(["winery"])).toBe("vineyard");
    expect(archetypeOfTags(["terraced_field"])).toBe("terraced_field");
    expect(archetypeOfTags(["rice_terrace"])).toBe("terraced_field");
    expect(archetypeOfTags(["threshing_floor"])).toBe("threshing_floor");
    expect(archetypeOfTags(["winnowing"])).toBe("threshing_floor");
    expect(archetypeOfTags(["marketplace"])).toBe("marketplace");
    expect(archetypeOfTags(["market_square"])).toBe("marketplace");
    // The near misses. Each is a word this pack deliberately did not claim,
    // and each would have been a silent theft from a table above or below it.
    expect(archetypeOfTags(["farmstead"])).toBe("farmhouse");
    expect(archetypeOfTags(["market"])).toBe("market_stall");
    expect(archetypeOfTags(["stall"])).toBe("market_stall");
    expect(archetypeOfTags(["bazaar"])).toBe("spice_market");
    expect(archetypeOfTags(["stable"])).toBe("barn");
    expect(archetypeOfTags(["barn"])).toBe("barn");
    expect(archetypeOfTags(["mill"])).toBe("windmill");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      const facade = agrarianFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(agrarianFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through or precedes.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("stable").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hanok").roof).toBe("hip");
  });

  it("is claimed by the catalog, implemented and noted", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("agrarian buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
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

  /** The lantern lesson, as a property: the room walks without that column. */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
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
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
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
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
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
    expect(has(build("farmstead"), "cobblestone"), "the plinth").toBe(true);
    expect(has(build("farmstead"), "hay_block"), "the yard bales").toBe(true);
    expect(has(build("pigsty"), "packed_mud"), "the mud walls").toBe(true);
    expect(has(build("pigsty"), "packed_mud"), "the wallow").toBe(true);
    expect(has(build("sheepfold"), "white_wool"), "the fleeces").toBe(true);
    expect(has(build("sheepfold"), "cobblestone_wall"), "the dry-stone fold").toBe(true);
    expect(has(build("cattle_pen"), "stripped_spruce_log"), "the corner posts").toBe(true);
    expect(has(build("cattle_pen"), "oak_fence"), "the rails").toBe(true);
    expect(has(build("orchard"), "oak_log"), "the trunks").toBe(true);
    expect(has(build("orchard"), "oak_leaves"), "the crowns").toBe(true);
    expect(has(build("vineyard"), "sweet_berry_bush"), "the fruit").toBe(true);
    expect(has(build("vineyard"), "stone_bricks"), "the vintner's shed").toBe(true);
    expect(has(build("terraced_field"), "farmland"), "the soil").toBe(true);
    expect(has(build("terraced_field"), "wheat"), "the crop").toBe(true);
    expect(has(build("threshing_floor"), "smooth_stone"), "the swept floor").toBe(true);
    expect(has(build("threshing_floor"), "hay_block"), "the sheaves").toBe(true);
    expect(has(build("marketplace"), "oak_fence"), "the arcade").toBe(true);
    expect(has(build("marketplace"), "barrel"), "the stalls").toBe(true);
  });

  /**
   * The precinct rhyme, as an assertion: the crops this pack sows are spelled
   * exactly the way `compiler/src/structures/farm.ts` spells them, so a
   * terraced field beside a farm precinct's parcels reads as the same holding.
   */
  it("speaks the farm precinct's crop vocabulary", () => {
    const field = build("terraced_field");
    const soil = field.ops.filter((op) => op.block === "farmland");
    expect(soil.length).toBeGreaterThan(0);
    for (const op of soil) expect(op.props?.["moisture"]).toBe("0");
    const wheat = field.ops.filter((op) => op.block === "wheat");
    expect(wheat.length).toBeGreaterThan(0);
    for (const op of wheat) expect(op.props?.["age"]).toBe("7");
    const berries = build("vineyard").ops.filter((op) => op.block === "sweet_berry_bush");
    expect(berries.length).toBeGreaterThan(0);
    for (const op of berries) expect(op.props?.["age"]).toBe("3");
  });

  /**
   * **A pen is open-topped, and it has a way in.**
   *
   * The rule this pack owns. The ring stands in the apron; nothing is ever
   * written over its top course, so an animal in it is under the sky; the
   * doorstep cell of the apron is left empty, which is the entrance; and a
   * closed gate stands somewhere in the ring, so it reads as a pen from
   * outside rather than as a garden wall.
   */
  it("rings every pen open-topped, with a gate and an entrance", () => {
    for (const a of PENS) {
      for (const size of SIZES) {
        const result = build(a, size);
        const at = indexOf(result.ops);
        const [sx, , sz] = result.meta.size;
        const inApron = (x: number, z: number): boolean =>
          x === -1 || x === sx || z === -1 || z === sz;
        // The ring, and only the ring: the apron also carries the shell's
        // eave, its porch lamp and its roof overhang, none of which are ours.
        const ringBlock = /(fence|_wall$|_log$)/;
        const ring = result.ops.filter(
          (op) => inApron(op.x, op.z) && op.y >= 1 && op.y <= 2 && ringBlock.test(op.block),
        );
        expect(ring.length, `${a} ${size.join("x")} ring`).toBeGreaterThan(8);
        // Open-topped: the highest ring course has nothing above it.
        for (const op of ring) {
          const above = at.get(`${op.x},${op.y + 1},${op.z}`);
          const stillRing = above !== undefined && above.block !== "air";
          const twoAbove = at.get(`${op.x},${op.y + 2},${op.z}`);
          expect(
            !stillRing || twoAbove === undefined || twoAbove.block === "air",
            `${a} ${size.join("x")} ring is more than two courses at ${op.x},${op.z}`,
          ).toBe(true);
        }
        // The gate.
        expect(
          ring.some((op) => op.block.endsWith("_fence_gate")),
          `${a} ${size.join("x")} gate`,
        ).toBe(true);
        // The entrance: the doorstep is not in the ring.
        const door = result.meta.door;
        expect(door, a).not.toBeNull();
        if (door !== null) {
          const step = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[door.face] as
            | [number, number];
          const sx0 = door.x + step[0];
          const sz0 = door.z + step[1];
          const onStep = ring.filter((op) => op.x === sx0 && op.z === sz0);
          expect(onStep, `${a} ${size.join("x")} doorstep`).toEqual([]);
        }
      }
    }
  });

  /**
   * **The doorstep stays standable**: air at `y+1` and `y+2` outside the door.
   *
   * The physics reading of "enterable", and the one thing a ring of posts in
   * the apron could plausibly have broken.
   */
  it("leaves a standable cell outside every door", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const at = indexOf(result.ops);
        const door = result.meta.door;
        if (door === null) continue;
        const step = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[door.face] as
          | [number, number];
        const x = door.x + step[0];
        const z = door.z + step[1];
        for (const y of [door.y ?? 1, (door.y ?? 1) + 1]) {
          const block = at.get(`${x},${y},${z}`)?.block;
          expect(
            block === undefined || block === "air",
            `${a} ${size.join("x")} doorstep ${x},${y},${z} is ${String(block)}`,
          ).toBe(true);
        }
      }
    }
  });

  /**
   * **Every cell of every floor plane this pack paints is standable.**
   *
   * The other half of the same regression, and the half that names it: the
   * walking agent has to *reach* every interior cell, not merely start
   * somewhere, so one non-standable block anywhere in a repainted floor is a
   * finding waiting for the envelope that puts it under the door. Raw `mud` is
   * the block that did it — fifteen sixteenths tall, and neither a full cube
   * nor one of the four partials `physics.ts` allows.
   */
  it("paints no floor plane with a block the walking agent cannot stand on", () => {
    const banned = /^(mud|soul_sand|soul_soil|powder_snow|honey_block|slime_block)$/;
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const at = indexOf(result.ops);
        for (const cell of result.meta.floorCells) {
          const floor = at.get(`${cell.x},0,${cell.z}`)?.block;
          expect(
            floor !== undefined && !banned.test(floor),
            `${a} ${size.join("x")} floor at ${cell.x},${cell.z} is ${String(floor)}`,
          ).toBe(true);
        }
      }
    }
  });

  /**
   * **The way in survives the fit-out**, at every envelope the theme sweep
   * builds — the regression this pack shipped and had to fix.
   *
   * The sweep's pigsty cell is a 12x8x9 box at two storeys, and the wallow was
   * written as raw `mud`. The physics lint's walking agent stands on
   * `isFullCube` plus slabs, stairs, `dirt_path` and `farmland`; `mud` is none
   * of those, so on a room that small the door's approach column had nowhere
   * else to be and the whole building had no start — `traversal.no_start`,
   * identically in all seven themes, which is what a floor-plane repaint over
   * the way in buys you.
   *
   * So this asserts the property the lint actually checks, in the lint's own
   * terms and over the sweep's own gradient: a lower door exists, and one of
   * its four neighbours has a **standable** floor under it — full cube, slab,
   * stair, path or farmland — with two courses of air above.
   */
  it("keeps a door, and a standable cell just inside it, at every sweep envelope", () => {
    // The sweep's own gradient, small end included, plus this file's three.
    const envelopes: readonly (readonly [number, number, number])[] = [
      [12, 8, 9],
      [11, 8, 9],
      [13, 9, 11],
      [9, 8, 9],
      [8, 9, 8],
      ...SIZES,
    ];
    /** What `physics.ts` will stand a player on, and nothing else. */
    const standableFloor = (block?: string): boolean => {
      if (block === undefined || block === "air" || block === "water") return false;
      if (/(_slab|_stairs)$/.test(block)) return true;
      if (block === "dirt_path" || block === "farmland") return true;
      // Everything else this pack lays in a floor plane must be a full cube.
      return !/(^mud$|_fence$|fence_gate$|_wall$|_trapdoor$|^ladder$|_carpet$|berry|^wheat$)/.test(
        block,
      );
    };
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      for (const size of envelopes) {
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
              if (!standableFloor(at.get(`${x},${door.y - 1},${z}`)?.block)) return false;
              return (
                open(at.get(`${x},${door.y},${z}`)?.block) &&
                open(at.get(`${x},${door.y + 1},${z}`)?.block)
              );
            }),
          );
          expect(standable, `${label}: a standable cell inside the door`).toBe(true);
        }
      }
    }
  }, 30_000);

  /**
   * **Nothing this pack writes floats or stands unsupported**, in any theme.
   *
   * The classical-b differential sweep, because this pack's whole budget goes
   * into the apron and the apron is exactly where floating props come from. It
   * compares against the **cottage fit-out on the same shell, seed and
   * materials**, so it reports what this file did and never what `core.ts` did.
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
        if (!/(_wall$|fence|^lantern$|_leaves$|berry|^wheat$)/.test(op.block)) continue;
        if (op.props?.["hanging"] === "true") continue;
        if (!solid(op.x, op.y - 1, op.z)) {
          out.push(`unsupported ${op.block} @ ${op.x},${op.y},${op.z}`);
        }
      }
      return out;
    };
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0xa6a1n, `world.agrarian.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = agrarianFacadeDefaults(a);
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
          // The comparison is by **shape**, not by position: `core.ts` seats
          // the door — and the porch lamp post beside it — from the archetype,
          // so the shell's own findings move by a cell or two between the two
          // runs while being the same finding. Keying on kind, block and
          // height keeps every real regression visible (a new block, or an old
          // one at a new height) and drops that noise.
          const shape = (f: string): string => f.replace(/@ -?\d+,(-?\d+),-?\d+/, "@y$1");
          const baseline = new Set(suspects(shell).map(shape));
          const added = suspects(mine).filter((f) => !baseline.has(shape(f)));
          expect(added, `${a} ${theme.id} ${size.join("x")}`).toEqual([]);
        }
      }
    }
  }, 60_000);

  /** No open water anywhere: a trough is not a pool. */
  it("writes no open fluid at all", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "water"), `${a} ${size.join("x")}`).toBe(false);
        expect(has(build(a, size), "lava"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** A `cauldron` has no `level`: the vessel with levels is `water_cauldron`. */
  it("puts no properties on a cauldron", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        if (op.block !== "cauldron") continue;
        expect(op.props, `${a} cauldron props`).toBeUndefined();
      }
    }
  });

  /** No bare pots, no signs. */
  it("never places a bare flower pot or a sign block", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(has(result, "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
        expect(
          result.ops.filter((op) => op.block.endsWith("_sign")),
          `${a} ${size.join("x")}`,
        ).toEqual([]);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of AGRARIAN_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
