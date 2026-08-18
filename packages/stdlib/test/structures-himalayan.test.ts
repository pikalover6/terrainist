/**
 * The **himalayan_monastery pack's buildings** — the thirteen entries of that
 * pack that have an inside, held to the same harness every earlier wave was
 * held to. A new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about, so almost nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack lost most of the words it
 *   wanted: `monastery`, `stupa`, `bell_pavilion`, `granary`, `kiln`,
 *   `library`, `cairn`, `courtyard`, `hermitage`, `byre`, `gatehouse` and
 *   `teahouse` are every one of them somebody else's, and must all still go
 *   exactly where they went;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme**, because a fit-out supported in oak and floating in stone is a
 *   defect that only shows up on the walk — and the chorten's dome and spire,
 *   the pack's only roof rebuild, are exactly the shapes that get that wrong;
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, no lit fire —
 *   and the same seed gives the same ops forever.
 *
 * Three checks **are** this pack's own, because three of its claims are:
 *
 * - **POOL STABILITY.** Every water cell this pack writes is closed. It sits in
 *   the floor plane, every one of its four horizontal neighbours is water or a
 *   solid block written in that same plane, and there is air over it and never
 *   a body-blocking prop;
 * - **THE HANG.** The bell cote's bell has a FULL CUBE directly above it and
 *   the chain has one too, with nothing hanging under the chain — a chain is
 *   not a full cube, and `attachment: ceiling` demands one. That is the
 *   tide-bell lesson, asserted rather than remembered;
 * - **THE BATTER.** The hall re-clads its wall ring from the ground to the
 *   plate and **touches no course above it**, so nothing the shell hung from
 *   its ceiling plane is ever stranded by this pack's one wall job.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  HIMALAYAN_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  himalayanFacadeDefaults,
  isHimalayanArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xd20a6n, "world.ridge");
const OTHER = nodeSeed(0xd20a6n, "world.ridge.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 16, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

/**
 * The lowest storey these archetypes are asked for in anger: `wallTop` 4, so
 * three courses of clear air. The review world's exhibit plan, and a course
 * shorter than anything in {@link SIZES}.
 */
const LOW: readonly [number, number, number] = [7, 8, 7];

/** The archetypes that write a curbed basin when the room has room for one. */
const WET = ["chorten_shrine", "butter_tea_kitchen"] as const;

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = himalayanFacadeDefaults(archetype);
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

describe("the himalayan_monastery pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(HIMALAYAN_BUILDING_ARCHETYPES).toHaveLength(13);
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isHimalayanArchetype(a)).toBe(true);
    }
    expect(isHimalayanArchetype("cottage")).toBe(false);
    expect(isHimalayanArchetype("monastery")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["dzong_hall"])).toBe("dzong_hall");
    expect(archetypeOfTags(["dzong"])).toBe("dzong_hall");
    expect(archetypeOfTags(["dzong_keep"])).toBe("dzong_hall");
    expect(archetypeOfTags(["prayer_wheel_gallery"])).toBe("prayer_wheel_gallery");
    expect(archetypeOfTags(["prayer_wheels"])).toBe("prayer_wheel_gallery");
    expect(archetypeOfTags(["chorten_shrine"])).toBe("chorten_shrine");
    expect(archetypeOfTags(["chorten"])).toBe("chorten_shrine");
    expect(archetypeOfTags(["butter_tea_kitchen"])).toBe("butter_tea_kitchen");
    expect(archetypeOfTags(["butter_kitchen"])).toBe("butter_tea_kitchen");
    expect(archetypeOfTags(["monk_cell_row"])).toBe("monk_cell_row");
    expect(archetypeOfTags(["monk_cells"])).toBe("monk_cell_row");
    expect(archetypeOfTags(["scripture_library"])).toBe("scripture_library");
    expect(archetypeOfTags(["sutra_library"])).toBe("scripture_library");
    expect(archetypeOfTags(["yak_byre"])).toBe("yak_byre");
    expect(archetypeOfTags(["yak_shed"])).toBe("yak_byre");
    expect(archetypeOfTags(["dzong_bell_cote"])).toBe("dzong_bell_cote");
    expect(archetypeOfTags(["prayer_bell_cote"])).toBe("dzong_bell_cote");
    expect(archetypeOfTags(["debate_courtyard"])).toBe("debate_courtyard");
    expect(archetypeOfTags(["debate_yard"])).toBe("debate_courtyard");
    expect(archetypeOfTags(["hermit_retreat"])).toBe("hermit_retreat");
    expect(archetypeOfTags(["meditation_cell"])).toBe("hermit_retreat");
    expect(archetypeOfTags(["kora_gatehouse"])).toBe("kora_gatehouse");
    expect(archetypeOfTags(["kora_gate"])).toBe("kora_gatehouse");
    expect(archetypeOfTags(["stilt_granary"])).toBe("stilt_granary");
    expect(archetypeOfTags(["raised_granary"])).toBe("stilt_granary");
    expect(archetypeOfTags(["incense_kiln"])).toBe("incense_kiln");
    expect(archetypeOfTags(["juniper_kiln"])).toBe("incense_kiln");

    // **The negative sweep.** Every one of these belongs to an older table and
    // this pack must not have moved a single one of them. Most of them are
    // words this pack actually wanted, and losing them is why every id here is
    // a compound.
    expect(archetypeOfTags(["caravan_gatehouse"])).toBe("caravan_gatehouse");
    expect(archetypeOfTags(["mudbrick_granary"])).toBe("mudbrick_granary");
    for (const bare of [
      "monastery",
      "abbey",
      "cloister",
      "stupa",
      "shrine",
      "roadside_shrine",
      "chapel",
      "bell_pavilion",
      "bell_tower",
      "bellcote",
      "library",
      "archive",
      "granary",
      "staddle_granary",
      "kiln",
      "pottery_kiln",
      "hop_kiln",
      "byre",
      "cow_byre",
      "stable",
      "stables",
      "paddock",
      "corral",
      "courtyard",
      "courtyard_house",
      "hermitage",
      "hermit_grotto",
      "gate",
      "gatehouse",
      "arch",
      "triumphal_arch",
      "tea_house",
      "teahouse",
      "field_kitchen",
      "house",
      "workshop",
      "tower",
      "watchtower",
    ]) {
      for (const mine of HIMALAYAN_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      const facade = himalayanFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(himalayanFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: a dzong roofs flat over battered walls, and
    // the chorten is the one round thing in it.
    expect(himalayanFacadeDefaults("chorten_shrine").roof).toBe("hip");
    expect(himalayanFacadeDefaults("dzong_hall").roof).toBe("flat");
    expect(himalayanFacadeDefaults("yak_byre").roof).toBe("gable");
    expect(himalayanFacadeDefaults("scripture_library").windowRhythm).toBe("none");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("oasis_shrine").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("himalayan_monastery");
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

describe("the himalayan_monastery pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
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
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          assertNoPockets(build(a, size, { floors }), {
            label: `${a} ${size.join("x")} floors=${floors}`,
          });
        }
      }
    }
  }, 60_000);

  it("is reachable on a three-course storey too — no one-course arch", () => {
    // The envelope the review world actually hands these archetypes, and the
    // one no size in SIZES reaches: `LOW` is `wallTop` 4, three courses of air.
    // The kora gate lands its lintel on the pier head, so on three courses the
    // arch was one course high — a gate no body walks under and, because the
    // lintel spans the bay, a wall across the room. It cost the terrarium five
    // `traversal.unreachable` findings while every size here passed.
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      for (const floors of [1, 2]) {
        assertNoPockets(build(a, LOW, { floors }), {
          label: `${a} ${LOW.join("x")} floors=${floors}`,
        });
      }
    }
  }, 60_000);

  it("keeps every door column and its approach standable", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
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
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
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
    // The hall: the batter outside, the pillars and the lamps inside.
    const hall = build("dzong_hall", BIG, { floors: 1 });
    expect(has(hall, "calcite"), "the whitewash").toBe(true);
    expect(has(hall, "dark_oak_planks"), "the timber band").toBe(true);
    expect(has(hall, "gold_block"), "the gold trim").toBe(true);
    expect(has(hall, "dark_oak_log"), "the pillar rows").toBe(true);
    expect(has(hall, "glowstone"), "the butter lamps").toBe(true);

    // The gallery: every wheel STANDS. Nothing in it is a hanger.
    const gallery = build("prayer_wheel_gallery", BIG, { floors: 1 });
    const drums = gallery.ops.filter((op) => op.block === "cut_copper");
    expect(drums.length, "the wheels").toBeGreaterThan(0);
    const gat = indexOf(gallery.ops);
    for (const op of drums) {
      const under = gat.get(`${op.x},${op.y - 1},${op.z}`)?.block;
      expect(
        under !== undefined && under !== "air",
        `wheel at ${op.x},${op.y},${op.z} stands on ${under}`,
      ).toBe(true);
    }
    expect(has(gallery, "iron_chain"), "a gallery hangs nothing").toBe(false);

    // The chorten: the dome, and the spire standing on its crown.
    const chorten = build("chorten_shrine", BIG, { floors: 1 });
    const dome = chorten.ops.filter(
      (op) => op.block === "calcite" && op.y > chorten.meta.wallTop,
    );
    expect(dome.length, "the dome").toBeGreaterThan(20);
    expect(
      chorten.ops.some((op) => op.block === "gold_block" && op.y > chorten.meta.wallTop),
      "the finial",
    ).toBe(true);
    expect(has(chorten, "water"), "the ablution basin").toBe(true);

    // The kitchen: the churns, the trough, and a COLD range.
    const kitchen = build("butter_tea_kitchen", BIG, { floors: 1 });
    expect(has(kitchen, "cauldron"), "the churns").toBe(true);
    expect(has(kitchen, "smoker"), "the range").toBe(true);
    for (const op of kitchen.ops) {
      if (op.block !== "smoker") continue;
      expect(op.props?.["lit"], "a lit range in a sealed room").toBe("false");
    }
    expect(has(kitchen, "water"), "the trough").toBe(true);

    // The cells: the bedding roll, up on the bunk and never on the floor. And
    // never a bed block, which is two cells that must both land or neither.
    const cells = build("monk_cell_row", BIG, { floors: 1 });
    const bedding = cells.ops.filter((op) => op.block.endsWith("_wool"));
    expect(bedding.length, "the bedding").toBeGreaterThan(0);
    expect(
      bedding.every((op) => op.y >= 2),
      "never on a floor that gets swept",
    ).toBe(true);
    expect(
      cells.ops.some((op) => op.block.endsWith("_bed")),
      "no bed block anywhere",
    ).toBe(false);

    // The library: the ranks and the lectern.
    const library = build("scripture_library", BIG, { floors: 1 });
    expect(has(library, "bookshelf"), "the pecha racks").toBe(true);
    expect(has(library, "lectern"), "the reading lectern").toBe(true);

    // The byre: the fodder, up on the plinth.
    const byre = build("yak_byre", BIG, { floors: 1 });
    const fodder = byre.ops.filter((op) => op.block === "hay_block");
    expect(fodder.length, "the fodder").toBeGreaterThan(0);
    expect(
      fodder.every((op) => op.y >= 2),
      "never trodden into the ground",
    ).toBe(true);
    expect(has(byre, "cauldron"), "the troughs").toBe(true);

    // The bell cote: there is always a bell, however short the storey.
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        expect(
          has(build("dzong_bell_cote", size, { floors }), "bell"),
          `a bell cote with no bell: ${size.join("x")} f=${floors}`,
        ).toBe(true);
      }
    }

    // The debating yard: the awning slabs, springing off a column that reached
    // them.
    const yard = build("debate_courtyard", BIG, { floors: 1 });
    const columns = new Set(
      yard.ops.filter((op) => op.block === "dark_oak_log").map((op) => `${op.x},${op.y},${op.z}`),
    );
    expect(columns.size, "the columns").toBeGreaterThan(0);
    const yi = yard.meta.interior;
    const awnings = yard.ops.filter(
      (op) =>
        op.block.endsWith("_slab") &&
        op.y >= 3 &&
        op.x >= yi.x0 &&
        op.x <= yi.x1 &&
        op.z >= yi.z0 &&
        op.z <= yi.z1,
    );
    expect(awnings.length, "the awning").toBeGreaterThan(0);
    for (const op of awnings) {
      const beside =
        columns.has(`${op.x + 1},${op.y},${op.z}`) || columns.has(`${op.x - 1},${op.y},${op.z}`);
      expect(beside, `awning at ${op.x},${op.y},${op.z} springs off nothing`).toBe(true);
    }

    // The retreat: a bench, a shelf and one lamp. Nothing else.
    const retreat = build("hermit_retreat", BIG, { floors: 1 });
    expect(has(retreat, "glowstone"), "the one lamp").toBe(true);

    // The kora gate: exactly one arch bay — two piers, and no more.
    const gate = build("kora_gatehouse", BIG, { floors: 1 });
    const piers = gate.ops.filter((op) => op.block === "polished_deepslate" && op.y === 1);
    expect(piers.length, "one bay: two piers, and no more").toBe(2);
    expect(has(gate, "chiseled_deepslate"), "the mani stones").toBe(true);

    // The granary: the bins, up on the stilts.
    const granary = build("stilt_granary", BIG, { floors: 1 });
    const bins = granary.ops.filter((op) => op.block === "hay_block");
    expect(bins.length, "the bins").toBeGreaterThan(0);
    expect(
      bins.every((op) => op.y >= 2),
      "up off the damp",
    ).toBe(true);

    // The kiln: cold, and its rods over head height.
    const kiln = build("incense_kiln", BIG, { floors: 1 });
    expect(has(kiln, "blast_furnace"), "the kiln").toBe(true);
    for (const op of kiln.ops) {
      if (op.block !== "blast_furnace") continue;
      expect(op.props?.["lit"], "a lit kiln in a sealed room").toBe("false");
    }
    const rods = kiln.ops.filter((op) => op.block === "iron_bars");
    expect(rods.length, "the drying rods").toBeGreaterThan(0);
    expect(
      rods.every((op) => op.y >= 3),
      "rodded over head height",
    ).toBe(true);
  });

  /**
   * **The dome is a filled mass, and only the chorten has one.**
   *
   * Every course of it is a filled disc standing on the filled disc below it; a
   * dome written as a ring per course leaves its outermost cells with air below
   * and beside them, which is `floating.isolated` in its oldest clothes. The
   * check that catches that is the theme sweep at the end of this file — this
   * one pins the *positive* claim, that the chorten is the only building in the
   * pack that touches a cell above the eave plate.
   */
  it("rebuilds a dome over the chorten, and over nothing else", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      const result = build(a, BIG, { floors: 1 });
      const domed = a === "chorten_shrine";
      const crown = result.ops.filter(
        (op) => op.block === "calcite" && op.y > result.meta.wallTop,
      );
      expect(crown.length > 0, `${a} dome`).toBe(domed);
    }
  });

  /**
   * **THE BATTER stops at the plate.**
   *
   * The hall's one piece of exterior work is a wall re-clad, and a re-clad that
   * reached above the eave plate would be deleting the volume the shell hangs
   * its ceiling lantern from — the defect the Mesoamerican pack wrote its hanger
   * guard for. This one simply never goes up there.
   */
  it("keeps the hall's re-clad at or below the eave plate", () => {
    for (const size of SIZES) {
      const result = build("dzong_hall", size, { floors: 1 });
      const plate = result.meta.wallTop;
      for (const op of result.ops) {
        if (op.block !== "calcite" && op.block !== "polished_deepslate") continue;
        expect(op.y, `${op.block} above the plate at ${op.x},${op.y},${op.z}`).toBeLessThanOrEqual(
          plate,
        );
      }
    }
  });

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} snow`).not.toBe("snow");
        expect(op.block, `${a} farmland`).not.toBe("farmland");
        expect(op.block, `${a} fire`).not.toBe("fire");
        expect(op.props?.["lit"], `${a} lit ${op.block}`).not.toBe("true");
      }
    }
  });

  it("is deterministic, and reseeds without changing its envelope", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0xd20a6n, `world.ridge.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = himalayanFacadeDefaults(a);
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
  }, 180_000);
});

/* -------------------------------------------------------------------------- */
/* POOL STABILITY — the pack's load-bearing claim                              */
/* -------------------------------------------------------------------------- */

describe("the himalayan_monastery pack's pools", () => {
  /**
   * **Every water cell this pack writes is closed on every side.**
   *
   * The predicate, in full: the water is in the **floor plane** (`y = 0`) and
   * never above it; each of its **four horizontal neighbours in that plane** is
   * either more water or a written solid block; and **nothing stands on it**.
   * That last is guaranteed upstream by claiming the cells through `take`
   * before a drop is written, and asserted here because the guarantee is what
   * matters.
   */
  it("closes every water cell it writes, on every envelope", () => {
    for (const a of HIMALAYAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const at = indexOf(result.ops);
          const label = `${a} ${size.join("x")} f=${floors}`;
          for (const op of result.ops) {
            if (op.block !== "water") continue;
            expect(op.y, `${label}: water above the floor plane`).toBe(0);
            for (const [dx, dz] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const side = at.get(`${op.x + dx},0,${op.z + dz}`)?.block;
              expect(
                side !== undefined && side !== "air",
                `${label}: water at ${op.x},${op.z} has an open face toward ${dx},${dz} (${side})`,
              ).toBe(true);
            }
            const over = at.get(`${op.x},1,${op.z}`)?.block;
            expect(
              over === undefined || over === "air",
              `${label}: ${over} standing on the water at ${op.x},${op.z}`,
            ).toBe(true);
          }
        }
      }
    }
  }, 90_000);

  /** The pack's water is a *pool*, not a flood: the room stays crossable. */
  it("keeps every room with a pool in it walkable round the pool", () => {
    for (const a of WET) {
      for (const size of SIZES) {
        const result = build(a, size, { floors: 1 });
        const free = freeCells(result);
        expect(free.length, `${a} ${size.join("x")}`).toBeGreaterThan(3);
        expect(oneRegion(free), `${a} ${size.join("x")} walks round its pool`).toBe(true);
      }
    }
  }, 60_000);

  /** On the plan they were designed for, the wet archetypes are actually wet. */
  it("actually fills its basins on a plan with room for them", () => {
    for (const a of WET) {
      expect(has(build(a, BIG, { floors: 1 }), "water"), `${a} on the big plan`).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* THE HANG                                                                    */
/* -------------------------------------------------------------------------- */

describe("the bell cote's hang", () => {
  /**
   * **A full cube over the bell, a full cube over the chain, and nothing under
   * the chain.**
   *
   * `chain` is not in the pinned 1.21.11 block table — that is the rename
   * lesson. The closure is top-down: a cap course, the thing under it, and then
   * air, because a chain is **not a full cube** and `attachment: ceiling`
   * demands one. The Atlantean pack found that defect with a bell on
   * 2026-08-17; this pack asserts it rather than remembering it.
   *
   * Swept over every envelope and both storey counts, and over a **tall** one
   * besides, because the hang only happens on a storey with five courses of
   * headroom and a sweep that never reached one would never walk the branch.
   */
  it("caps every hanger from above and hangs nothing from a chain", () => {
    const plans: (readonly [number, number, number])[] = [...SIZES, [9, 22, 9], [7, 26, 7]];
    for (const size of plans) {
      for (const floors of [1, 2, 3]) {
        const result = build("dzong_bell_cote", size, { floors });
        const at = indexOf(result.ops);
        const label = `${size.join("x")} f=${floors}`;
        for (const op of result.ops) {
          expect(op.block, `${label}: chain`).not.toBe("chain");
          if (op.block === "iron_chain") {
            const over = at.get(`${op.x},${op.y + 1},${op.z}`)?.block;
            expect(
              over !== undefined && over !== "air",
              `${label}: chain at ${op.x},${op.y},${op.z} hangs from ${over}`,
            ).toBe(true);
            const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
            expect(
              under === undefined || under === "air" || under === "iron_chain",
              `${label}: ${under} hangs from a chain, which is not a full cube`,
            ).toBe(true);
          }
          if (op.block !== "bell") continue;
          if (op.props?.["attachment"] !== "ceiling") continue;
          const over = at.get(`${op.x},${op.y + 1},${op.z}`)?.block;
          expect(
            over !== undefined && over !== "air" && over !== "iron_chain",
            `${label}: ceiling bell at ${op.x},${op.y},${op.z} hangs from ${over}`,
          ).toBe(true);
        }
      }
    }
  }, 60_000);

  /** However short the storey, the cote has a bell in it. */
  it("stands the bell on its frame when the storey will not give the height", () => {
    const short = build("dzong_bell_cote", [9, 8, 9], { floors: 1 });
    expect(has(short, "bell"), "a bell cote with no bell").toBe(true);
  });
});
