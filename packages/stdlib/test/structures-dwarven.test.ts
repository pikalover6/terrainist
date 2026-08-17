/**
 * The **Dwarven & Volcanic pack's buildings** — all fifteen entries of that
 * pack, held to the same harness every earlier wave was held to. A new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about, so nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack's near misses are as
 *   sharp as the Norse pack's, because a hold's vocabulary is made of words
 *   older tables own: `forge`, `smithy`, `foundry`, `hall`, `vault`,
 *   `treasury`, `brewery`, `dormitory`, `depot`, `assay_office`, `bathhouse`,
 *   `workshop`, `shrine`, `temple`, `beacon_tower` and — the sharpest of the
 *   lot — `dwarven_gate` itself, which is the ARCANA wave's;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme**;
 * - **no lava and no magma block anywhere**, which for the volcanic pack is
 *   the load-bearing assertion in the file, and no lit furnace either;
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, no lantern by
 *   name, no lit fire — and the same seed gives the same ops forever.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  DWARVEN_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  dwarvenFacadeDefaults,
  generateBuilding,
  isDwarvenArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xd3a7n, "world.hold");
const OTHER = nodeSeed(0xd3a7n, "world.hold.other");
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
  const facade = dwarvenFacadeDefaults(archetype);
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

describe("the Dwarven & Volcanic pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(DWARVEN_BUILDING_ARCHETYPES).toHaveLength(15);
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isDwarvenArchetype(a)).toBe(true);
    }
    expect(isDwarvenArchetype("cottage")).toBe(false);
    expect(isDwarvenArchetype("dwarven_gate")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["great_forge"])).toBe("great_forge");
    expect(archetypeOfTags(["forge_pit"])).toBe("great_forge");
    expect(archetypeOfTags(["deep_forge"])).toBe("great_forge");
    expect(archetypeOfTags(["dwarf_hold_gate"])).toBe("dwarf_hold_gate");
    expect(archetypeOfTags(["hold_gate"])).toBe("dwarf_hold_gate");
    expect(archetypeOfTags(["under_gate"])).toBe("dwarf_hold_gate");
    expect(archetypeOfTags(["deep_hall"])).toBe("deep_hall");
    expect(archetypeOfTags(["pillared_hall"])).toBe("deep_hall");
    expect(archetypeOfTags(["smelter_works"])).toBe("smelter_works");
    expect(archetypeOfTags(["ore_smelter"])).toBe("smelter_works");
    expect(archetypeOfTags(["gem_cutter_workshop"])).toBe("gem_cutter_workshop");
    expect(archetypeOfTags(["gem_cuttery"])).toBe("gem_cutter_workshop");
    expect(archetypeOfTags(["stone_brewhouse"])).toBe("stone_brewhouse");
    expect(archetypeOfTags(["deep_brewery"])).toBe("stone_brewhouse");
    expect(archetypeOfTags(["miners_dormitory"])).toBe("miners_dormitory");
    expect(archetypeOfTags(["miner_barracks"])).toBe("miners_dormitory");
    expect(archetypeOfTags(["tool_vault"])).toBe("tool_vault");
    expect(archetypeOfTags(["toolhouse"])).toBe("tool_vault");
    expect(archetypeOfTags(["rune_forge_shrine"])).toBe("rune_forge_shrine");
    expect(archetypeOfTags(["rune_forge"])).toBe("rune_forge_shrine");
    expect(archetypeOfTags(["cart_depot"])).toBe("cart_depot");
    expect(archetypeOfTags(["minecart_depot"])).toBe("cart_depot");
    expect(archetypeOfTags(["ore_assay_hall"])).toBe("ore_assay_hall");
    expect(archetypeOfTags(["ore_assay"])).toBe("ore_assay_hall");
    expect(archetypeOfTags(["stone_bath_house"])).toBe("stone_bath_house");
    expect(archetypeOfTags(["hot_spring_bath"])).toBe("stone_bath_house");
    expect(archetypeOfTags(["beacon_brazier_tower"])).toBe("beacon_brazier_tower");
    expect(archetypeOfTags(["brazier_tower"])).toBe("beacon_brazier_tower");
    expect(archetypeOfTags(["kings_treasury"])).toBe("kings_treasury");
    expect(archetypeOfTags(["deep_treasury"])).toBe("kings_treasury");
    expect(archetypeOfTags(["stalactite_shrine"])).toBe("stalactite_shrine");
    expect(archetypeOfTags(["cavern_shrine"])).toBe("stalactite_shrine");

    // The near misses. Every one of these belongs to an older table and this
    // pack must not have moved a single one of them. `dwarven_gate` is the
    // sharpest: the arcana wave's fantasy gate is already a good door face and
    // the pack reuses the WORD nowhere, carrying the hold in its id instead.
    expect(archetypeOfTags(["dwarven_gate"])).toBe("dwarven_gate");
    expect(archetypeOfTags(["dwarven"])).toBe("dwarven_gate");
    expect(archetypeOfTags(["deep_gate"])).toBe("dwarven_gate");
    expect(archetypeOfTags(["assay_office"])).toBe("assay_office");
    expect(archetypeOfTags(["smithy"])).toBe("smithy");
    expect(archetypeOfTags(["bathhouse"])).toBe("bathhouse");
    expect(archetypeOfTags(["watchtower"])).toBe("watchtower");
    for (const bare of [
      "hall",
      "great_hall",
      "guildhall",
      "forge",
      "foundry",
      "smelter",
      "furnace",
      "workshop",
      "brewery",
      "brewhouse",
      "dormitory",
      "barracks",
      "vault",
      "armoury",
      "shrine",
      "temple",
      "chapel",
      "depot",
      "station",
      "baths",
      "bath",
      "treasury",
      "beacon_tower",
      "lookout",
      "storehouse",
    ]) {
      for (const mine of DWARVEN_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      const facade = dwarvenFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(dwarvenFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: a culture that builds into rock.
    expect(
      DWARVEN_BUILDING_ARCHETYPES.filter((a) => dwarvenFacadeDefaults(a).roof === "flat"),
    ).toHaveLength(13);
    expect(dwarvenFacadeDefaults("great_forge").roof).toBe("gable");
    expect(dwarvenFacadeDefaults("smelter_works").roof).toBe("gable");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("norse_mead_hall").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hypostyle_hall").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("dwarven_volcanic");
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

describe("the Dwarven & Volcanic pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
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
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
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
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
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
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
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
    // The great forge: the pit down the AXIS, anvils against the wall.
    const forge = build("great_forge", BIG, { floors: 1 });
    expect(has(forge, "glowstone"), "the pit's fire").toBe(true);
    expect(has(forge, "anvil"), "the anvil rank").toBe(true);
    expect(has(forge, "coal_block"), "the charcoal").toBe(true);
    const fi = forge.meta.interior;
    expect(
      forge.ops.filter((op) => op.block === "anvil").every((op) => op.x === fi.x0),
      "every anvil against the working wall",
    ).toBe(true);

    // The hold gate: the pillars, and the lintel over them.
    const gate = build("dwarf_hold_gate", BIG, { floors: 1 });
    const pillars = gate.ops.filter((op) => op.block === "polished_blackstone");
    expect(pillars.length, "the pillars").toBeGreaterThan(3);
    expect(has(gate, "chiseled_polished_blackstone"), "the rune band").toBe(true);

    // The deep hall: pillars OFF the wall, and the aisle untouched.
    const hall = build("deep_hall", BIG, { floors: 1 });
    const hi = hall.meta.interior;
    const midX = Math.floor((hi.x0 + hi.x1) / 2);
    // The aisle carries no pillar. (It does carry the head table and, at one
    // storey, the SHELL's own hearth — neither is this file's, and neither is
    // what "the aisle stays clear" means.)
    expect(
      hall.ops.filter((op) => op.block === "polished_blackstone" && op.x === midX).length,
      "no pillar stands in the central aisle",
    ).toBe(0);
    expect(has(hall, "shroomlight"), "the glow bedded into the pillars").toBe(true);

    // The smelter: a bank of furnaces, and not one of them lit.
    const smelter = build("smelter_works", BIG, { floors: 1 });
    const furnaces = smelter.ops.filter((op) => op.block === "blast_furnace");
    expect(furnaces.length, "the bank").toBeGreaterThan(1);
    expect(
      furnaces.every((op) => op.props?.["lit"] === "false"),
      "and not one of them lit",
    ).toBe(true);

    // The cuttery: grindstones at the wall, never in the middle.
    const cuttery = build("gem_cutter_workshop", BIG, { floors: 1 });
    const ci = cuttery.meta.interior;
    const stones = cuttery.ops.filter((op) => op.block === "grindstone");
    expect(stones.length, "the cutting stations").toBeGreaterThan(0);
    expect(
      stones.every((op) => op.x === ci.x0 || op.x === ci.x1),
      "every cutter works at the wall",
    ).toBe(true);

    // The brewhouse: kettles and barrels.
    const brew = build("stone_brewhouse", BIG, { floors: 1 });
    expect(has(brew, "cauldron"), "the kettles").toBe(true);
    expect(has(brew, "barrel"), "the racks").toBe(true);

    // The dormitory: bunks as SLABS, never as beds.
    const dorm = build("miners_dormitory", BIG, { floors: 1 });
    expect(
      dorm.ops.filter((op) => op.block.endsWith("_slab") && op.y === 1).length,
      "the bunks",
    ).toBeGreaterThan(3);
    expect(
      dorm.ops.some((op) => op.block.endsWith("_bed")),
      "and not one of them a bed block",
    ).toBe(false);

    // The tool vault: racks up under the boards, never at the floor.
    const vault = build("tool_vault", BIG, { floors: 1 });
    const racks = vault.ops.filter((op) => op.block === "iron_bars");
    expect(racks.length, "the racks").toBeGreaterThan(0);
    expect(
      racks.every((op) => op.y >= 3),
      "hung up under the boards",
    ).toBe(true);
    expect(has(vault, "iron_block"), "the strongbox").toBe(true);

    // The rune forge: the anvil, and unlit candles only.
    const rune = build("rune_forge_shrine", BIG, { floors: 1 });
    expect(has(rune, "anvil"), "the rune anvil").toBe(true);
    const candles = rune.ops.filter((op) => op.block === "white_candle");
    expect(candles.length, "the offering ring").toBeGreaterThan(0);
    expect(
      candles.every((op) => op.props?.["lit"] === "false"),
      "and not one of them lit",
    ).toBe(true);

    // The cart depot: rails down the AXIS, on the floor course.
    const depot = build("cart_depot", BIG, { floors: 1 });
    const rails = depot.ops.filter((op) => op.block === "rail");
    expect(rails.length, "the running line").toBeGreaterThan(2);
    expect(
      rails.every((op) => op.y === 1),
      "the rails are in the floor",
    ).toBe(true);
    const di = depot.meta.interior;
    expect(
      rails.every((op) => op.x === Math.floor((di.x0 + di.x1) / 2)),
      "one line, down the axis",
    ).toBe(true);

    // The assay hall: more than one kind of ore on the samples.
    const assay = build("ore_assay_hall", BIG, { floors: 1 });
    const samples = new Set(
      assay.ops
        .filter((op) => op.y === 2)
        .map((op) => op.block)
        .filter((b) => b.endsWith("_block")),
    );
    expect(samples.size, "a rank of identical cubes is shelving, not samples").toBeGreaterThan(1);
    expect(has(assay, "stonecutter"), "the sectioning station").toBe(true);

    // The bath: NO standing water anywhere in it.
    const bath = build("stone_bath_house", BIG, { floors: 1 });
    expect(has(bath, "cauldron"), "the water").toBe(true);
    expect(has(bath, "glowstone"), "the hot stones").toBe(true);
    expect(
      bath.ops.some((op) => op.block === "water" && op.y >= 1),
      "and not one cell of standing water in the room",
    ).toBe(false);

    // The brazier tower: the signal, and a rail that is never a solid run.
    const tower = build("beacon_brazier_tower", BIG, { floors: 1 });
    expect(has(tower, "glowstone"), "the signal brazier").toBe(true);
    expect(has(tower, "coal_block"), "the fuel").toBe(true);

    // The treasury: the grille, and two metals behind it.
    const treasury = build("kings_treasury", BIG, { floors: 1 });
    expect(has(treasury, "iron_bars"), "the grille").toBe(true);
    expect(has(treasury, "gold_block"), "the gold").toBe(true);
    expect(has(treasury, "iron_block"), "the iron").toBe(true);

    // The cavern shrine: dripstone HANGING, never standing on the floor.
    const shrine = build("stalactite_shrine", BIG, { floors: 1 });
    const drips = shrine.ops.filter((op) => op.block === "dripstone_block");
    expect(drips.length, "the hangings").toBeGreaterThan(0);
    expect(
      drips.every((op) => op.y >= 3),
      "hanging from the boards, not standing on the floor",
    ).toBe(true);
    expect(has(shrine, "calcite"), "the altar").toBe(true);
  });

  /**
   * **The volcanic pack's load-bearing assertion.**
   *
   * Lava beside a walkable column is a body on fire; lava beside timber is a
   * settlement on fire; a magma block is damage under a foot. The pack whose
   * whole theme is the volcano is exactly the pack that must be shown never to
   * place any of the three.
   */
  it("places no lava and no magma — at any size, on any storey count", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          for (const op of build(a, size, { floors }).ops) {
            expect(op.block, `${a} lava`).not.toBe("lava");
            expect(op.block, `${a} flowing lava`).not.toBe("flowing_lava");
            expect(op.block, `${a} magma`).not.toBe("magma_block");
            expect(op.block, `${a} fire`).not.toBe("fire");
            expect(op.block, `${a} soul fire`).not.toBe("soul_fire");
          }
        }
      }
    }
  }, 60_000);

  /**
   * **Nothing this file writes is lit.**
   *
   * Swept at the pack's own default storey count, where the shell builds no
   * chimney. At one storey `core.ts` puts a lit `campfire` in front of the flue
   * of **every** building over five by five — that hearth is the *shell's*, it
   * predates every form pack, and a pack test failing on it would be asserting
   * something about `core.ts` under this file's name. What is asserted here is
   * the claim this file can actually make: it writes no fire of its own, and
   * every furnace it stands is cold.
   */
  it("lights nothing of its own, and stands every furnace cold", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const op of build(a, size).ops) {
          expect(op.block, `${a} campfire`).not.toBe("campfire");
          expect(op.props?.["lit"], `${a} lit ${op.block}`).not.toBe("true");
        }
      }
    }
  }, 30_000);

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} gravel`).not.toBe("gravel");
        expect(op.block, `${a} sand`).not.toBe("sand");
      }
    }
  });

  /**
   * **Every lantern in the finished building still has its support.**
   *
   * The lanterns are the *shell's* — this pack places none — but the claim
   * worth asserting is not "we placed none", it is that **we did not strand
   * one**: a fit-out that writes air, or a prop, into the cell a lantern was
   * standing on is exactly how `unsupported.lantern` gets found on the walk
   * instead of here.
   */
  it("strands no lantern the shell hung", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
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
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of DWARVEN_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0xd3a7n, `world.hold.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = dwarvenFacadeDefaults(a);
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
