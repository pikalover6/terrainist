/**
 * The **Steppe Nomad pack's buildings** — the twelve entries of that pack that
 * have an inside, held to the same harness every earlier wave was held to. A
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about, so nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack's near misses are as
 *   sharp as the Norse pack's, because the steppe vocabulary brushes against
 *   words older tables own: `yurt` (a PROP, and the sharpest of the lot),
 *   `tent`, `camp`, `stable`, `paddock`, `corral`, `caravanserai`,
 *   `watchtower`, `arena` and `drying_rack` must all still go exactly where
 *   they went;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme**, because a fit-out supported in oak and floating in stone is a
 *   defect that only shows up on the walk — and the felt dome, which is the
 *   only exterior work in the pack, is exactly the shape that gets that wrong;
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, no lantern by
 *   name, no lit fire — and the same seed gives the same ops forever.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  STEPPE_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isSteppeArchetype,
  nodeSeed,
  resolveArchetype,
  steppeFacadeDefaults,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x57e77en, "world.steppe");
const OTHER = nodeSeed(0x57e77en, "world.steppe.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 16, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

/** The four tent types — the only ones in the pack that rebuild anything. */
const DOMED = ["ger_round_tent", "khans_ger", "cart_ger", "kumis_tent"] as const;

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = steppeFacadeDefaults(archetype);
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

describe("the Steppe Nomad pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(STEPPE_BUILDING_ARCHETYPES).toHaveLength(12);
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isSteppeArchetype(a)).toBe(true);
    }
    expect(isSteppeArchetype("cottage")).toBe(false);
    expect(isSteppeArchetype("yurt")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["ger_round_tent"])).toBe("ger_round_tent");
    expect(archetypeOfTags(["ger"])).toBe("ger_round_tent");
    expect(archetypeOfTags(["round_tent"])).toBe("ger_round_tent");
    expect(archetypeOfTags(["khans_ger"])).toBe("khans_ger");
    expect(archetypeOfTags(["great_ger"])).toBe("khans_ger");
    expect(archetypeOfTags(["cart_ger"])).toBe("cart_ger");
    expect(archetypeOfTags(["wagon_ger"])).toBe("cart_ger");
    expect(archetypeOfTags(["kumis_tent"])).toBe("kumis_tent");
    expect(archetypeOfTags(["kumis"])).toBe("kumis_tent");
    expect(archetypeOfTags(["airag_tent"])).toBe("kumis_tent");
    expect(archetypeOfTags(["horse_line"])).toBe("horse_line");
    expect(archetypeOfTags(["picket_line"])).toBe("horse_line");
    expect(archetypeOfTags(["felt_workshop"])).toBe("felt_workshop");
    expect(archetypeOfTags(["felt_house"])).toBe("felt_workshop");
    expect(archetypeOfTags(["bowyer_tent"])).toBe("bowyer_tent");
    expect(archetypeOfTags(["bowyer"])).toBe("bowyer_tent");
    expect(archetypeOfTags(["bow_maker"])).toBe("bowyer_tent");
    expect(archetypeOfTags(["caravan_rest"])).toBe("caravan_rest");
    expect(archetypeOfTags(["caravan_halt"])).toBe("caravan_rest");
    expect(archetypeOfTags(["wrestling_ground"])).toBe("wrestling_ground");
    expect(archetypeOfTags(["bokh_ring"])).toBe("wrestling_ground");
    expect(archetypeOfTags(["watch_platform_steppe"])).toBe("watch_platform_steppe");
    expect(archetypeOfTags(["steppe_lookout"])).toBe("watch_platform_steppe");
    expect(archetypeOfTags(["borts_rack"])).toBe("borts_rack");
    expect(archetypeOfTags(["borts"])).toBe("borts_rack");
    expect(archetypeOfTags(["meat_rack"])).toBe("borts_rack");
    expect(archetypeOfTags(["winter_corral"])).toBe("winter_corral");
    expect(archetypeOfTags(["stock_shelter"])).toBe("winter_corral");

    // The near misses. Every one of these belongs to an older table and this
    // pack must not have moved a single one of them. `yurt` is the sharpest:
    // it is the wayside pack's PROP and a document that writes it in a props
    // list must keep getting it, which is exactly why the tent is a `ger`.
    expect(archetypeOfTags(["camp"])).toBe("siege_camp");
    expect(archetypeOfTags(["encampment"])).toBe("siege_camp");
    expect(archetypeOfTags(["corral"])).toBe("cattle_pen");
    expect(archetypeOfTags(["paddock"])).toBe("cattle_pen");
    expect(archetypeOfTags(["watchtower"])).toBe("watchtower");
    expect(archetypeOfTags(["lookout"])).toBe("watchtower");
    expect(archetypeOfTags(["arena"])).toBe("arena");
    for (const bare of [
      "yurt",
      "tent",
      "stable",
      "caravanserai",
      "brewery",
      "dairy",
      "workshop",
      "smithy",
      "fletcher",
      "drying_rack",
      "drying_rack_yard",
      "tower",
      "stadium",
      "amphitheater",
      "stele",
      "cairn",
    ]) {
      for (const mine of STEPPE_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      const facade = steppeFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(steppeFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: the tents are round and the lookout has a
    // deck rather than a ridge.
    expect(STEPPE_BUILDING_ARCHETYPES.filter((a) => steppeFacadeDefaults(a).roof === "hip")).toEqual(
      [...DOMED],
    );
    expect(steppeFacadeDefaults("watch_platform_steppe").roof).toBe("flat");
    for (const a of DOMED) expect(steppeFacadeDefaults(a).windowRhythm, a).toBe("none");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hypostyle_hall").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("steppe_nomad");
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

describe("the Steppe Nomad pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
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
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
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
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
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
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
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
    // The ger: the felt skin, the crown, the fire and the bed platform.
    const ger = build("ger_round_tent", BIG, { floors: 1 });
    expect(has(ger, "white_wool"), "the felt").toBe(true);
    expect(has(ger, "glowstone"), "the hearth under the crown").toBe(true);
    const beds = ger.ops.filter((op) => op.block.endsWith("_slab") && op.y === 1);
    expect(beds.length, "the bed platform").toBeGreaterThan(3);

    // The khan's ger: the dais of slabs across the head.
    const khan = build("khans_ger", BIG, { floors: 1 });
    const dais = khan.ops.filter((op) => op.block.endsWith("_slab") && op.y === 1);
    expect(dais.length, "the dais").toBeGreaterThan(3);
    expect(has(khan, "white_wool"), "the felt").toBe(true);

    // The cart ger: the axle logs, laid across the floor.
    const cart = build("cart_ger", BIG, { floors: 1 });
    const axles = cart.ops.filter((op) => op.y === 1 && op.props?.["axis"] === "x");
    expect(axles.length, "the axles").toBeGreaterThan(0);

    // The kumis tent: the churns, and the bags hung well over head height.
    const kumis = build("kumis_tent", BIG, { floors: 1 });
    expect(has(kumis, "cauldron"), "the churns").toBe(true);
    const bags = kumis.ops.filter((op) => op.block === "iron_bars");
    expect(bags.length, "the skin bags").toBeGreaterThan(0);
    expect(
      bags.every((op) => op.y >= 3),
      "hung over head height",
    ).toBe(true);

    // The horse line: troughs and fodder, and NO stall.
    const line = build("horse_line", BIG, { floors: 1 });
    expect(has(line, "cauldron"), "the troughs").toBe(true);
    expect(has(line, "hay_block"), "the fodder").toBe(true);

    // The felt works: the bales, up on the plinth off the damp floor.
    const felt = build("felt_workshop", BIG, { floors: 1 });
    const bales = felt.ops.filter((op) => op.block.endsWith("_wool"));
    expect(bales.length, "the bales").toBeGreaterThan(0);
    expect(
      bales.every((op) => op.y >= 2),
      "never on the damp floor",
    ).toBe(true);

    // The bowyer: the seasoning racks, and the glue pot.
    const bow = build("bowyer_tent", BIG, { floors: 1 });
    expect(has(bow, "cauldron"), "the glue pot").toBe(true);
    const racks = bow.ops.filter((op) => op.block === "iron_bars");
    expect(racks.length, "the racks").toBeGreaterThan(0);
    expect(
      racks.every((op) => op.y >= 3),
      "up under the boards",
    ).toBe(true);

    // The caravan halt: the cargo, off the ground.
    const halt = build("caravan_rest", BIG, { floors: 1 });
    const cargo = halt.ops.filter((op) => op.block === "barrel");
    expect(cargo.length, "the cargo").toBeGreaterThan(0);
    expect(has(halt, "hay_block"), "the fodder").toBe(true);

    // The wrestling ground: the bank, and a floor left BARE. Nothing this
    // fit-out writes at `y = 1` may be off the wall ring — the ring is the
    // whole building and the middle is the point of it.
    const ring = build("wrestling_ground", BIG, { floors: 1 });
    const bank = ring.ops.filter((op) => op.block.endsWith("_stairs") && op.y === 1);
    expect(bank.length, "the bank").toBeGreaterThan(3);
    const ri = ring.meta.interior;
    expect(
      bank.every((op) => op.x === ri.x0 || op.x === ri.x1),
      "every seat is against a wall",
    ).toBe(true);

    // The watch platform: the brazier, and a rail that is never a solid run.
    const watch = build("watch_platform_steppe", BIG, { floors: 1 });
    expect(has(watch, "glowstone"), "the signal brazier").toBe(true);

    // The borts rack: the strips, hung at head height and never lower.
    const borts = build("borts_rack", BIG, { floors: 1 });
    const strips = borts.ops.filter((op) => op.block === "iron_bars");
    expect(strips.length, "the strips").toBeGreaterThan(0);
    expect(
      strips.every((op) => op.y >= 3),
      "never in a body's face",
    ).toBe(true);

    // The winter corral: the fodder, up off frozen ground.
    const corral = build("winter_corral", BIG, { floors: 1 });
    const hay = corral.ops.filter((op) => op.block === "hay_block");
    expect(hay.length, "the fodder").toBeGreaterThan(0);
    expect(
      hay.every((op) => op.y >= 2),
      "never on frozen ground",
    ).toBe(true);
  });

  /**
   * **The felt dome is a filled mass, and only the tents have one.**
   *
   * Rule 3 in one assertion. Every course of the dome is a filled disc standing
   * on the filled disc below it; a dome written as a ring per course leaves its
   * outermost cells with air below and beside them, which is
   * `floating.isolated` in its oldest clothes. The check that catches that is
   * the sweep below — this one pins the *positive* claim, that the four tents
   * are the only buildings in the pack that touch a cell above the eave plate.
   */
  it("rebuilds a dome over the tents, and over nothing else", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      const result = build(a, BIG, { floors: 1 });
      const domed = (DOMED as readonly string[]).includes(a);
      const felt = result.ops.filter((op) => op.block === "white_wool" && op.y > result.meta.wallTop);
      expect(felt.length > 0, `${a} dome`).toBe(domed);
    }
  });

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} farmland`).not.toBe("farmland");
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
   * the dome rebuild deletes and re-lays the whole volume over the ceiling
   * plane the shell hangs from, which is exactly how `unsupported.lantern` gets
   * found on the walk instead of here.
   */
  it("strands no lantern the shell hung", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
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
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of STEPPE_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0x57e77en, `world.steppe.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = steppeFacadeDefaults(a);
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
