/**
 * The **wilds & camps pack's buildings** — the three entries of
 * that have an inside, on wave two's
 * contract.
 *
 * The harness is deliberately the *same* one every earlier wave was held to —
 * a new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and this pack's near misses are the
 *   sharpest in the catalog: `tower`, `watchtower`, `beacon_tower`, `lookout`,
 *   `lodge`, `ski_lodge`, `shelter`, `hut`, `cabin`, `camp` and `sawmill` all
 *   still go exactly where they went;
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
  STRUCTURE_CATALOG,
  WILDS_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isWildsArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  wildsFacadeDefaults,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x1d5n, "world.wilds");
const OTHER = nodeSeed(0x1d5n, "world.wilds.other");
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
  const facade = wildsFacadeDefaults(facadeOf);
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

describe("the wilds pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of WILDS_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isWildsArchetype(a)).toBe(true);
    }
    expect(isWildsArchetype("cottage")).toBe(false);
    expect(isWildsArchetype("watchtower")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["fire_lookout"])).toBe("fire_lookout_tower");
    expect(archetypeOfTags(["fire_lookout_tower"])).toBe("fire_lookout_tower");
    expect(archetypeOfTags(["lookout_tower"])).toBe("fire_lookout_tower");
    expect(archetypeOfTags(["ranger_tower"])).toBe("fire_lookout_tower");
    expect(archetypeOfTags(["waystation"])).toBe("waystation");
    expect(archetypeOfTags(["way_station"])).toBe("waystation");
    expect(archetypeOfTags(["road_shelter"])).toBe("waystation");
    expect(archetypeOfTags(["hunting_lodge"])).toBe("hunting_lodge");
    expect(archetypeOfTags(["hunters_lodge"])).toBe("hunting_lodge");
    expect(archetypeOfTags(["trophy_hall"])).toBe("hunting_lodge");
    // The near misses. Every one of these belongs to an older table, and this
    // pack must not have moved one of them.
    expect(archetypeOfTags(["watchtower"])).toBe("watchtower");
    expect(archetypeOfTags(["ski_lodge"])).toBe("ski_lodge");
    expect(archetypeOfTags(["sawmill"])).toBe("sawmill");
    for (const bare of ["tower", "beacon_tower", "lookout", "lodge", "shelter", "camp"]) {
      for (const mine of WILDS_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of WILDS_BUILDING_ARCHETYPES) {
      const facade = wildsFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(wildsFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("salt_house").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of WILDS_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("wilds_camps");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === a),
        a,
      ).toHaveLength(1);
    }
    expect(structureById("fire_lookout_tower")?.category).toBe("civic");
    expect(structureById("hunting_lodge")?.category).toBe("leisure");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the wilds pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of WILDS_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of WILDS_BUILDING_ARCHETYPES) {
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
    for (const a of WILDS_BUILDING_ARCHETYPES) {
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
    for (const a of WILDS_BUILDING_ARCHETYPES) {
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
    for (const a of WILDS_BUILDING_ARCHETYPES) {
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
    // The lookout: the map table and the fire-finder's glow, no lantern of its
    // own making.
    const cab = build("fire_lookout_tower", BIG, { floors: 1 });
    expect(has(cab, "cartography_table"), "the map table").toBe(true);
    expect(has(cab, "glowstone"), "the fire-finder's glow").toBe(true);

    // The waystation: a hearth with the glow set into it, a bench, and a
    // woodpile of split log against the wall.
    const way = build("waystation", BIG, { floors: 1 });
    expect(has(way, "glowstone"), "the hearth's fire").toBe(true);
    const benches = way.ops.filter((op) => op.block.endsWith("_stairs") && op.y === 1);
    expect(benches.length, "the bench").toBeGreaterThan(1);

    // The lodge: the great hearth, and antlers up on the beam.
    const lodge = build("hunting_lodge", BIG, { floors: 1 });
    expect(has(lodge, "glowstone"), "the great fire").toBe(true);
    expect(has(lodge, "bone_block"), "the antlers").toBe(true);
    const antlers = lodge.ops.filter((op) => op.block === "bone_block");
    expect(
      antlers.every((op) => op.y >= 3),
      "the antlers are up on the beam",
    ).toBe(true);
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
    for (const a of WILDS_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0x1d5n, `world.wilds.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = wildsFacadeDefaults(a);
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
  }, 120_000);

  it("keeps everything inside the envelope the solver reserved", () => {
    for (const a of WILDS_BUILDING_ARCHETYPES) {
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
    for (const a of WILDS_BUILDING_ARCHETYPES) {
      const once = build(a);
      expect(JSON.stringify(build(a).ops)).toBe(JSON.stringify(once.ops));
      for (const op of once.ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} bare pot`).not.toBe("flower_pot");
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} mud`).not.toBe("mud");
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
    for (const a of WILDS_BUILDING_ARCHETYPES) {
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
    for (const a of WILDS_BUILDING_ARCHETYPES) {
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
