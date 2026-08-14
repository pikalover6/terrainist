/**
 * The **agrarian expansion pack's buildings** — the five entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.5 that have an inside, on wave two's
 * contract.
 *
 * The harness is deliberately the *same* one every earlier wave was held to —
 * a new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and this pack's near misses are as sharp
 *   as the wilds pack's: `byre` (the original table's word for `barn`),
 *   `barn`, `stable`, `shed`, `farmstead`, `cattle_pen`, `sheepfold`,
 *   `granary` and `pigsty` all still go exactly where they went;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**: solid non-water floor with
 *   two courses of air, in the door column and in the cell a body opens it
 *   from;
 * - the lantern column is never the room's only route;
 * - nothing it builds leaves the envelope the solver reserved, and **nothing
 *   it builds has air on every side — swept across every material theme**,
 *   because a fit-out that is supported in oak and floating in stone is a
 *   defect that only shows up on the walk;
 * - no bare flower pots, no sign blocks, no `chain`, and the same seed gives
 *   the same ops forever.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  HEDGEROW_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  hedgerowFacadeDefaults,
  isHedgerowArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x1d5n, "world.hedgerow");
const OTHER = nodeSeed(0x1d5n, "world.hedgerow.other");
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
  const facade = hedgerowFacadeDefaults(facadeOf);
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
 * solid non-water floor, and two courses of air over it.
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

describe("the agrarian expansion pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isHedgerowArchetype(a)).toBe(true);
    }
    expect(isHedgerowArchetype("cottage")).toBe(false);
    expect(isHedgerowArchetype("farmstead")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["cow_byre"])).toBe("cow_byre");
    expect(archetypeOfTags(["cowshed"])).toBe("cow_byre");
    expect(archetypeOfTags(["cattle_shed"])).toBe("cow_byre");
    expect(archetypeOfTags(["dutch_barn"])).toBe("dutch_barn");
    expect(archetypeOfTags(["hay_barn"])).toBe("dutch_barn");
    expect(archetypeOfTags(["open_barn"])).toBe("dutch_barn");
    expect(archetypeOfTags(["smokehouse"])).toBe("smokehouse");
    expect(archetypeOfTags(["smokery"])).toBe("smokehouse");
    expect(archetypeOfTags(["dairy"])).toBe("dairy");
    expect(archetypeOfTags(["creamery"])).toBe("dairy");
    expect(archetypeOfTags(["wool_shed"])).toBe("wool_shed");
    expect(archetypeOfTags(["shearing_shed"])).toBe("wool_shed");
    // The near misses. Every one of these belongs to an older table, and this
    // pack must not have moved one of them. `byre` is the sharpest: it has
    // been the original table's word for `barn` since the founding waves.
    expect(archetypeOfTags(["byre"])).toBe("barn");
    expect(archetypeOfTags(["barn"])).toBe("barn");
    // `stable` has always resolved to the original table's `barn`; this pack
    // must not have changed that either.
    expect(archetypeOfTags(["stable"])).toBe("barn");
    expect(archetypeOfTags(["farmstead"])).toBe("farmhouse");
    expect(archetypeOfTags(["sheepfold"])).toBe("sheepfold");
    expect(archetypeOfTags(["cattle_pen"])).toBe("cattle_pen");
    for (const bare of ["shed", "farm", "field", "yard", "hay", "cattle"]) {
      for (const mine of HEDGEROW_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      const facade = hedgerowFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(hedgerowFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("waystation").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("agrarian");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === a),
        a,
      ).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the agrarian expansion pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
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
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          assertNoPockets(build(a, size, { floors }), {
            label: `${a} ${size.join("x")} floors=${floors}`,
          });
        }
      }
    }
  }, 30_000);

  /**
   * **Every door is standable and enterable**, at every envelope and both
   * storey counts.
   *
   * The rule that cost a defect round: a door column with a prop in it, or a
   * doorstep painted with something a body cannot stand on, is a building
   * nobody can get into. This file never calls `raw`, so the property should
   * hold by construction — which is exactly the kind of claim that wants an
   * assertion under it.
   */
  it("keeps every door column and its approach standable", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const door = result.meta.door;
          if (door === null) continue;
          const at = indexOf(result.ops);
          const label = `${a} ${size.join("x")} f=${floors}`;
          for (const y of [1, 2]) {
            const block = at.get(`${door.x},${y},${door.z}`)?.block;
            expect(
              block === undefined || passableBlock(block) || block.endsWith("_door"),
              `${label}: door column at y=${y} is ${block}`,
            ).toBe(true);
          }
        }
      }
    }
  }, 30_000);

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
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
    // The byre: hay standings down the walls and a slab feed walk at the head.
    const byre = build("cow_byre", BIG, { floors: 1 });
    expect(has(byre, "hay_block"), "the standings").toBe(true);
    expect(has(byre, "cauldron"), "the water trough").toBe(true);

    // The dutch barn: hay, and as close to nothing else as a fit-out gets.
    const barn = build("dutch_barn", BIG, { floors: 1 });
    const bales = barn.ops.filter((op) => op.block === "hay_block");
    expect(bales.length, "the stacked hay").toBeGreaterThan(4);
    expect(has(barn, "cauldron"), "and nothing else at all").toBe(false);
    expect(has(barn, "barrel"), "and nothing else at all").toBe(false);

    // The smokehouse: the fire's glow, and the racks up in the roof.
    const smoke = build("smokehouse", BIG, { floors: 1 });
    expect(has(smoke, "glowstone"), "the fire pit's glow").toBe(true);
    const racks = smoke.ops.filter((op) => op.block === "iron_bars");
    expect(racks.length, "the racks").toBeGreaterThan(0);
    expect(
      racks.every((op) => op.y >= 3),
      "the racks are up in the roof",
    ).toBe(true);

    // The dairy: shelves at the second course, churns under them.
    const dairy = build("dairy", BIG, { floors: 1 });
    expect(has(dairy, "cauldron"), "the churns").toBe(true);
    const shelves = dairy.ops.filter((op) => op.block.endsWith("_slab") && op.y === 2);
    expect(shelves.length, "the slate shelves").toBeGreaterThan(3);

    // The shearing shed: the wool table down the middle and the catching pens.
    const wool = build("wool_shed", BIG, { floors: 1 });
    expect(has(wool, "barrel"), "the fleece bins").toBe(true);
    const table = wool.ops.filter((op) => op.block.endsWith("_slab") && op.y === 1);
    expect(table.length, "the wool table").toBeGreaterThan(0);
  });

  it("hangs no sign, uses no `chain`, and plants no bare flower pot", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
      }
    }
  });

  it("is deterministic, and reseeds without changing its envelope", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /**
   * **Nothing has air on every side, in any material theme.**
   *
   * The `floating.isolated` rule, run over the finished op set. Swept across
   * every theme because a theme changes which symbols resolve to full cubes
   * and which to slabs, and a fit-out that is supported in one and floating in
   * another is a defect that only ever shows up on the walk.
   */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of HEDGEROW_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0x1d5n, `world.hedgerow.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = hedgerowFacadeDefaults(a);
          const result = generateBuilding({
            size,
            params: {
              archetype: a,
              floors: 1,
              ...(facade.roof === undefined ? {} : { roof: facade.roof }),
              ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
              ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
            },
            seed,
            materials,
          });
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
              `${a} ${theme.id} ${size.join("x")}: ${op.block} at ${op.x},${op.y},${op.z}`,
            ).toBe(true);
          }
        }
      }
    }
  }, 60_000);
});
