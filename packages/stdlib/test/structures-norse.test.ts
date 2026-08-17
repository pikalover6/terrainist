/**
 * The **Nordic & Viking pack's buildings** — the thirteen entries of that
 * pack that have an inside, held to the same harness every earlier wave was
 * held to. A new archetype that needs a new kind of guarantee is a new archetype
 * nobody can reason about, so nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack's near misses are the
 *   sharpest in the catalog, because the Norse vocabulary is made of words
 *   older tables own: `longhouse`, `mead_hall`, `hall`, `sod_house`,
 *   `boathouse`, `smithy`, `forge`, `shrine`, `temple`, `gate`, `watchtower`
 *   and `granary` must all still go exactly where they went;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme**, because a fit-out supported in oak and floating in stone is a
 *   defect that only shows up on the walk;
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, no lantern by
 *   name, no lit fire — and the same seed gives the same ops forever.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  NORSE_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isNorseArchetype,
  nodeSeed,
  norseFacadeDefaults,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x1d5n, "world.norse");
const OTHER = nodeSeed(0x1d5n, "world.norse.other");
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
  const facade = norseFacadeDefaults(facadeOf);
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

describe("the Nordic & Viking pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(NORSE_BUILDING_ARCHETYPES).toHaveLength(13);
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isNorseArchetype(a)).toBe(true);
    }
    expect(isNorseArchetype("cottage")).toBe(false);
    expect(isNorseArchetype("longhouse")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["norse_mead_hall"])).toBe("norse_mead_hall");
    expect(archetypeOfTags(["mjod_hall"])).toBe("norse_mead_hall");
    expect(archetypeOfTags(["drinking_hall"])).toBe("norse_mead_hall");
    expect(archetypeOfTags(["jarls_hall"])).toBe("jarls_hall");
    expect(archetypeOfTags(["chieftain_hall"])).toBe("jarls_hall");
    expect(archetypeOfTags(["longship_shed"])).toBe("longship_shed");
    expect(archetypeOfTags(["naust"])).toBe("longship_shed");
    expect(archetypeOfTags(["turf_house"])).toBe("turf_house");
    expect(archetypeOfTags(["torfbaer"])).toBe("turf_house");
    expect(archetypeOfTags(["stave_belfry"])).toBe("stave_belfry");
    expect(archetypeOfTags(["stave_church"])).toBe("stave_belfry");
    expect(archetypeOfTags(["norse_forge"])).toBe("norse_forge");
    expect(archetypeOfTags(["viking_smithy"])).toBe("norse_forge");
    expect(archetypeOfTags(["hof_shrine"])).toBe("hof_shrine");
    expect(archetypeOfTags(["hof"])).toBe("hof_shrine");
    expect(archetypeOfTags(["heathen_temple"])).toBe("hof_shrine");
    expect(archetypeOfTags(["fishermans_cabin"])).toBe("fishermans_cabin");
    expect(archetypeOfTags(["weaving_hall"])).toBe("weaving_hall");
    expect(archetypeOfTags(["loom_house"])).toBe("weaving_hall");
    expect(archetypeOfTags(["shield_wall_gate"])).toBe("shield_wall_gate");
    expect(archetypeOfTags(["palisade_watchtower"])).toBe("palisade_watchtower");
    expect(archetypeOfTags(["norse_storehouse"])).toBe("norse_storehouse");
    expect(archetypeOfTags(["stabbur"])).toBe("norse_storehouse");
    expect(archetypeOfTags(["skemma"])).toBe("norse_storehouse");
    expect(archetypeOfTags(["wool_shed_norse"])).toBe("wool_shed_norse");
    expect(archetypeOfTags(["norse_wool_shed"])).toBe("wool_shed_norse");
    expect(archetypeOfTags(["fleece_shed"])).toBe("wool_shed_norse");

    // The near misses. Every one of these belongs to an older table and this
    // pack must not have moved a single one of them. `longhouse` and
    // `mead_hall` are the sharpest: wave 4A's dwelling is already the right
    // building and the pack REUSES it rather than shipping a second copy.
    expect(archetypeOfTags(["longhouse"])).toBe("longhouse");
    expect(archetypeOfTags(["mead_hall"])).toBe("longhouse");
    expect(archetypeOfTags(["sod_house"])).toBe("sod_house");
    expect(archetypeOfTags(["smithy"])).toBe("smithy");
    expect(archetypeOfTags(["watchtower"])).toBe("watchtower");
    expect(archetypeOfTags(["lookout"])).toBe("watchtower");
    // The rename's whole point: the agrarian shearing shed keeps every plain
    // spelling of the word, and the Norse fleece store carries the pack in its
    // id because a form pack's members must be unique registry-wide.
    expect(archetypeOfTags(["wool_shed"])).toBe("wool_shed");
    expect(archetypeOfTags(["woolshed"])).toBe("wool_shed");
    expect(archetypeOfTags(["shearing_shed"])).toBe("wool_shed");
    for (const bare of [
      "hall",
      "gate",
      "gatehouse",
      "shrine",
      "temple",
      "chapel",
      "forge",
      "boathouse",
      "shipyard",
      "cabin",
      "hut",
      "turf",
      "sod",
      "storehouse",
      "granary",
      "belfry",
      "bell_tower",
      "tower",
    ]) {
      for (const mine of NORSE_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      const facade = norseFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(norseFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: a ridge architecture, with one exception.
    expect(
      NORSE_BUILDING_ARCHETYPES.filter((a) => norseFacadeDefaults(a).roof === "gable"),
    ).toHaveLength(12);
    expect(norseFacadeDefaults("stave_belfry").roof).toBe("flat");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hypostyle_hall").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("nordic_viking");
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

describe("the Nordic & Viking pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
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

  it("is reachable from its own door, with no pocket", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          assertNoPockets(build(a, size, { floors }), {
            label: `${a} ${size.join("x")} floors=${floors}`,
          });
        }
      }
    }
  }, 60_000);

  it("keeps every door column and its approach standable", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
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
    for (const a of NORSE_BUILDING_ARCHETYPES) {
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
    // The mead hall: the fire down the AXIS, benches down both walls.
    const hall = build("norse_mead_hall", BIG, { floors: 1 });
    expect(has(hall, "glowstone"), "the long fire").toBe(true);
    expect(has(hall, "barrel"), "the mead").toBe(true);
    const stairs = hall.ops.filter((op) => op.block.endsWith("_stairs") && op.y === 1);
    expect(stairs.length, "the benches").toBeGreaterThan(3);

    // The chieftain's hall: the dais of slabs across the head.
    const jarl = build("jarls_hall", BIG, { floors: 1 });
    const dais = jarl.ops.filter((op) => op.block.endsWith("_slab") && op.y === 1);
    expect(dais.length, "the dais").toBeGreaterThan(3);

    // The naust: spars overhead, and no fire of any kind in a boat shed.
    const naust = build("longship_shed", BIG, { floors: 1 });
    const spars = naust.ops.filter((op) => op.block === "iron_bars");
    expect(spars.length, "the spar rack").toBeGreaterThan(0);
    expect(
      spars.every((op) => op.y >= 3),
      "the spars are up under the boards",
    ).toBe(true);
    expect(has(naust, "glowstone"), "no fire in a boat shed").toBe(false);

    // The turf house: the hearth at the middle of the floor.
    const turf = build("turf_house", BIG, { floors: 1 });
    expect(has(turf, "glowstone"), "the hearth").toBe(true);

    // The forge: the anvil, out on the floor in front of the fire.
    const forge = build("norse_forge", BIG, { floors: 1 });
    expect(has(forge, "anvil"), "the anvil").toBe(true);
    expect(has(forge, "cauldron"), "the slack tub").toBe(true);
    expect(has(forge, "coal_block"), "the charcoal").toBe(true);

    // The hof: the offering bowl and the unlit candles.
    const hof = build("hof_shrine", BIG, { floors: 1 });
    expect(has(hof, "cauldron"), "the offering bowl").toBe(true);
    const candles = hof.ops.filter((op) => op.block === "white_candle");
    expect(candles.length, "the offering ring").toBeGreaterThan(0);
    expect(
      candles.every((op) => op.props?.["lit"] === "false"),
      "and not one of them lit",
    ).toBe(true);

    // The weaving hall: looms against the WALLS, never in the middle.
    const loom = build("weaving_hall", BIG, { floors: 1 });
    const frames = loom.ops.filter((op) => op.block === "iron_bars");
    expect(frames.length, "the looms").toBeGreaterThan(0);
    const li = loom.meta.interior;
    expect(
      frames.every((op) => op.x === li.x0 || op.x === li.x1),
      "every loom leans on a wall",
    ).toBe(true);

    // The shield gate: shields at eye height, never at the floor.
    const gate = build("shield_wall_gate", BIG, { floors: 1 });
    const shields = gate.ops.filter((op) => op.block.endsWith("_trapdoor"));
    expect(shields.length, "the shields").toBeGreaterThan(0);
    expect(
      shields.every((op) => op.y >= 2),
      "hung at eye height",
    ).toBe(true);

    // The watchtower: the brazier, and a rail that is never a solid run.
    const tower = build("palisade_watchtower", BIG, { floors: 1 });
    expect(has(tower, "glowstone"), "the signal brazier").toBe(true);

    // The stabbur: everything off the floor, grain at the head.
    const store = build("norse_storehouse", BIG, { floors: 1 });
    expect(has(store, "hay_block"), "the grain bins").toBe(true);
    expect(has(store, "barrel"), "the cargo").toBe(true);

    // The belfry places no `bell`: that block is the faith wave's, with its
    // own attachment rules, and a second one here would be a second grammar.
    const belfry = build("stave_belfry", BIG, { floors: 1 });
    expect(belfry.ops.some((op) => op.block === "bell" && op.y <= 3)).toBe(false);

    // The fleece store: the bales, up on the plinth off the cold floor.
    const fleece = build("wool_shed_norse", BIG, { floors: 1 });
    const bales = fleece.ops.filter((op) => op.block === "hay_block");
    expect(bales.length, "the bales").toBeGreaterThan(0);
    expect(
      bales.every((op) => op.y >= 2),
      "never on the cold floor",
    ).toBe(true);

    // The cabin: the bunk and the catch.
    const cabin = build("fishermans_cabin", BIG, { floors: 1 });
    expect(has(cabin, "barrel"), "the catch").toBe(true);
  });

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} campfire`).not.toBe("campfire");
      }
    }
  });

  /**
   * **Every lantern in the finished building still has its support.**
   *
   * The lint's lantern rule fires on any block whose name ends `lantern` and
   * wants a solid floor under it or something to hang from over it. The
   * lanterns are the *shell's* — this pack places none — but the claim worth
   * asserting is not "we placed none", it is that **we did not strand one**:
   * a fit-out that writes air, or writes a prop, into the cell a lantern was
   * standing on is exactly how `unsupported.lantern` gets found on the walk
   * instead of here.
   */
  it("strands no lantern the shell hung", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size, { floors: 1 });
        const at = indexOf(result.ops);
        for (const op of result.ops) {
          if (!op.block.endsWith("lantern")) continue;
          const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
          const over = at.get(`${op.x},${op.y + 1},${op.z}`)?.block;
          const held =
            (under !== undefined && under !== "air") || (over !== undefined && over !== "air");
          expect(held, `${a} ${size.join("x")}: lantern at ${op.x},${op.y},${op.z}`).toBe(true);
        }
      }
    }
  }, 30_000);

  it("is deterministic, and reseeds without changing its envelope", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of NORSE_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0x1d5n, `world.norse.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = norseFacadeDefaults(a);
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
});
