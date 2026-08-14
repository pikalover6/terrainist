/**
 * The **frontier West pack's buildings** — the nine entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.7 that have an inside, on the same
 * contract every earlier wave was held to.
 *
 * The harness is deliberately the *same* one — a new archetype that needs a
 * new kind of guarantee is a new archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and this pack's near misses are as sharp
 *   as the wilds pack's: `tavern`, `inn`, `church`, `chapel`, `adobe_pueblo`,
 *   `stable`, `sawmill`, `smithy`, `prison`, `bank`, `post_office`,
 *   `general_store` and `sod_house` all still go exactly where they went;
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
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, and the same
 *   seed gives the same ops forever.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  FRONTIER_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  frontierFacadeDefaults,
  generateBuilding,
  isFrontierArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x1d5n, "world.frontier");
const OTHER = nodeSeed(0x1d5n, "world.frontier.other");
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
  const facade = frontierFacadeDefaults(facadeOf);
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

describe("the frontier West pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isFrontierArchetype(a)).toBe(true);
    }
    expect(isFrontierArchetype("cottage")).toBe(false);
    expect(isFrontierArchetype("tavern")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["saloon"])).toBe("false_front_saloon");
    expect(archetypeOfTags(["false_front"])).toBe("false_front_saloon");
    expect(archetypeOfTags(["false_front_saloon"])).toBe("false_front_saloon");
    expect(archetypeOfTags(["western_saloon"])).toBe("false_front_saloon");
    expect(archetypeOfTags(["assay"])).toBe("assay_office");
    expect(archetypeOfTags(["assay_office"])).toBe("assay_office");
    expect(archetypeOfTags(["assayer"])).toBe("assay_office");
    expect(archetypeOfTags(["stamp_mill"])).toBe("stamp_mill");
    expect(archetypeOfTags(["stamp_battery"])).toBe("stamp_mill");
    expect(archetypeOfTags(["ore_mill"])).toBe("stamp_mill");
    expect(archetypeOfTags(["telegraph"])).toBe("telegraph_office");
    expect(archetypeOfTags(["telegraph_office"])).toBe("telegraph_office");
    expect(archetypeOfTags(["telegraph_station"])).toBe("telegraph_office");
    expect(archetypeOfTags(["livery"])).toBe("livery_stable");
    expect(archetypeOfTags(["livery_stable"])).toBe("livery_stable");
    expect(archetypeOfTags(["wagon_shop"])).toBe("wagon_shop");
    expect(archetypeOfTags(["wagonwright"])).toBe("wagon_shop");
    expect(archetypeOfTags(["wheelwright"])).toBe("wagon_shop");
    expect(archetypeOfTags(["mission"])).toBe("mission_church");
    expect(archetypeOfTags(["mission_church"])).toBe("mission_church");
    expect(archetypeOfTags(["adobe_church"])).toBe("mission_church");
    expect(archetypeOfTags(["cantina"])).toBe("cantina");
    expect(archetypeOfTags(["dugout"])).toBe("dugout_shanty");
    expect(archetypeOfTags(["dugout_shanty"])).toBe("dugout_shanty");
    expect(archetypeOfTags(["shanty"])).toBe("dugout_shanty");
    expect(archetypeOfTags(["bank_dugout"])).toBe("dugout_shanty");
    // The near misses. Every one of these belongs to an older table, and this
    // pack must not have moved one of them.
    // `stable` has read as the barn since the founding table, and still does.
    expect(archetypeOfTags(["stable"])).toBe("barn");
    expect(archetypeOfTags(["sawmill"])).toBe("sawmill");
    expect(archetypeOfTags(["bank"])).toBe("bank");
    expect(archetypeOfTags(["post_office"])).toBe("post_office");
    expect(archetypeOfTags(["general_store"])).toBe("general_store");
    expect(archetypeOfTags(["tavern"])).toBe("tavern");
    expect(archetypeOfTags(["jail"])).toBe("prison");
    expect(archetypeOfTags(["adobe"])).toBe("adobe_pueblo");
    for (const bare of ["bar", "mill", "forge", "shack", "cathedral"]) {
      for (const mine of FRONTIER_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    for (const older of ["church", "chapel", "hut", "cabin", "smithy", "sod_house", "inn"]) {
      const got = archetypeOfTags([older]);
      expect(
        FRONTIER_BUILDING_ARCHETYPES as readonly string[],
        `${older} → ${String(got)}`,
      ).not.toContain(got);
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      const facade = frontierFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(frontierFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("cow_byre").windowRhythm).toBeDefined();
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("frontier_west");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === a),
        a,
      ).toHaveLength(1);
    }
    expect(structureById("false_front_saloon")?.category).toBe("commercial");
    expect(structureById("mission_church")?.category).toBe("religious");
  });

  /**
   * The pack's two route-following entries are the linework engine's, not this
   * registry's, and both stay out of `BUILDING_ARCHETYPES` whatever their
   * status: the boardwalk is `infra.entry@0`'s as of W3, and the sluice box is
   * still open — a fall-following trough is a route form the host does not
   * have (`docs/INFRA-ENTRIES-v0.md` §4, and the note over the W2/W3 rows).
   */
  it("leaves the pack's route-following entries alone", () => {
    for (const id of ["boardwalk", "sluice_box"]) {
      expect(BUILDING_ARCHETYPES as readonly string[], id).not.toContain(id);
    }
    expect(structureById("boardwalk")?.status).toBe("implemented");
    expect(structureById("sluice_box")?.status).toBe("not_started");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the frontier West pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
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
  }, 60_000);

  /** The lint's own walk, from the door, at every envelope. */
  it("is reachable from its own door, with no pocket", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          assertNoPockets(build(a, size, { floors }), {
            label: `${a} ${size.join("x")} floors=${floors}`,
          });
        }
      }
    }
  }, 60_000);

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
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
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
  }, 60_000);

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
        const free = freeCells(result).filter((k) => k !== lamp);
        expect(oneRegion(free), `${a} ${size.join("x")} without the lantern cell`).toBe(true);
      }
    }
  }, 60_000);

  it("builds the thing each archetype is for", () => {
    // The saloon: the back bar's glow, the long counter and the piano.
    const saloon = build("false_front_saloon", BIG, { floors: 1 });
    expect(has(saloon, "glowstone"), "the back bar's glow").toBe(true);
    expect(has(saloon, "note_block"), "the piano").toBe(true);

    // The assay office: the grille over the counter and the furnace.
    const assay = build("assay_office", BIG, { floors: 1 });
    expect(has(assay, "iron_bars"), "the counter grille").toBe(true);
    expect(has(assay, "blast_furnace"), "the furnace").toBe(true);
    const grille = assay.ops.filter((op) => op.block === "iron_bars");
    expect(
      grille.every((op) => op.y >= 2),
      "the grille stands on the counter",
    ).toBe(true);

    // The stamp mill: the battery of stamps, up over their bedplates.
    const mill = build("stamp_mill", BIG, { floors: 1 });
    expect(has(mill, "iron_block"), "the stamps").toBe(true);

    // The telegraph office: the key desk and the wire coming down onto it.
    const wire = build("telegraph_office", BIG, { floors: 1 });
    expect(has(wire, "iron_bars"), "the wire").toBe(true);
    expect(has(wire, "cartography_table"), "the message rack").toBe(true);

    // The livery: mangers of hay, and an aisle nothing stands in.
    const livery = build("livery_stable", BIG, { floors: 1 });
    expect(has(livery, "hay_block"), "the mangers").toBe(true);

    // The wagon shop: the forge and the wheels on the wall.
    const wagon = build("wagon_shop", BIG, { floors: 1 });
    expect(has(wagon, "blast_furnace"), "the forge").toBe(true);
    expect(has(wagon, "iron_bars"), "the wheels").toBe(true);

    // The mission: the altar's glow at the head of the room.
    const mission = build("mission_church", BIG, { floors: 1 });
    expect(has(mission, "glowstone"), "the altar").toBe(true);
    const pews = mission.ops.filter((op) => op.block.endsWith("_stairs") && op.y === 1);
    expect(pews.length, "the benches").toBeGreaterThan(3);

    // The cantina: the terracotta jars on the bar's shelf.
    const cantina = build("cantina", BIG, { floors: 1 });
    expect(has(cantina, "terracotta"), "the jars").toBe(true);

    // The dugout: the bank of earth, and never mud.
    const dugout = build("dugout_shanty", BIG, { floors: 1 });
    expect(has(dugout, "coarse_dirt") || has(dugout, "rooted_dirt"), "the bank").toBe(true);
    expect(has(dugout, "smoker"), "the stove").toBe(true);
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
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0x1d5n, `world.frontier.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = frontierFacadeDefaults(a);
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
  }, 240_000);

  it("keeps everything inside the envelope the solver reserved", () => {
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
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
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
      const once = build(a);
      expect(JSON.stringify(build(a).ops)).toBe(JSON.stringify(once.ops));
      for (const op of once.ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} bare pot`).not.toBe("flower_pot");
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} path`).not.toBe("dirt_path");
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
    for (const a of FRONTIER_BUILDING_ARCHETYPES) {
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
                `${a} ${size.join("x")} h=${storyHeight} f=${floors}: column ${cell.x},${cell.z}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  }, 120_000);
});
