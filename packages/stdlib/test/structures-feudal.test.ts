/**
 * The **feudal_japanese pack's buildings** — the thirteen entries of that pack
 * that have an inside, held to the same harness every earlier wave was held to.
 * A new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about, so almost nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack lost nearly every word it
 *   wanted, because the east-asian pack got there first: `torii`, `pagoda`,
 *   `zen_garden`, `tenshu_keep`, `moon_gate`, `paifang`, `shoji_teahouse`,
 *   `stone_lantern` and `drum_tower` are all its, and `machiya`, `tea_house`,
 *   `smithy`, `bathhouse`, `keep`, `castle`, `granary`, `gatehouse` and
 *   `watchtower` are older tables', and every one of them must still go exactly
 *   where it went;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme**, because a fit-out supported in oak and floating in stone is a
 *   defect that only shows up on the walk — and the pagoda's tiers and mast,
 *   the pack's only roof rebuild, are exactly the shapes that get that wrong;
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, no lit fire —
 *   and the same seed gives the same ops forever.
 *
 * Four checks **are** this pack's own, because four of its claims are:
 *
 * - **POOL STABILITY.** Every water cell this pack writes is closed. It sits in
 *   the floor plane, every one of its four horizontal neighbours is water or a
 *   solid block written in that same plane, and there is air over it and never
 *   a body-blocking prop;
 * - **THE HANG.** The turret's bell has a FULL CUBE directly above it and the
 *   chain has one too, with nothing hanging under the chain — a chain is not a
 *   full cube, and `attachment: ceiling` demands one. That is the tide-bell
 *   lesson, asserted rather than remembered;
 * - **THE ARCH OWES FOUR COURSES.** Both gates land their lintel on the pier
 *   head, so on a three-course storey the way through would be one course high
 *   — a gate no body walks under and, because the lintel spans the bay, a wall
 *   across the room. It cost the terrarium five `traversal.unreachable`
 *   findings on the Himalayan pack's gatehouse while every generous size
 *   passed, which is why `LOW` is in the sweep;
 * - **THE BATTER.** The keep re-clads its wall ring from the ground to the
 *   plate and **touches no course above it**, so nothing the shell hung from
 *   its ceiling plane is ever stranded by this pack's one wall job.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  FEUDAL_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  feudalFacadeDefaults,
  generateBuilding,
  isFeudalArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xfeed5n, "world.castle");
const OTHER = nodeSeed(0xfeed5n, "world.castle.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 16, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

/**
 * The lowest storey these archetypes are asked for in anger: `wallTop` 4, so
 * three courses of clear air. The review world's exhibit plan, and a course
 * shorter than anything in {@link SIZES} — the envelope both gates must decline
 * to build an arch on.
 */
const LOW: readonly [number, number, number] = [7, 8, 7];

/** The archetype that writes a curbed basin when the room has room for one. */
const WET = ["onsen_bathhouse"] as const;

/** The two archetypes that build an arch bay. */
const GATES = ["sando_torii", "masugata_gate"] as const;

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = feudalFacadeDefaults(archetype);
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

describe("the feudal_japanese pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(FEUDAL_BUILDING_ARCHETYPES).toHaveLength(13);
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isFeudalArchetype(a)).toBe(true);
    }
    expect(isFeudalArchetype("cottage")).toBe(false);
    expect(isFeudalArchetype("tenshu_keep")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["yamashiro_tenshu"])).toBe("yamashiro_tenshu");
    expect(archetypeOfTags(["yamashiro"])).toBe("yamashiro_tenshu");
    expect(archetypeOfTags(["yamashiro_keep"])).toBe("yamashiro_tenshu");
    expect(archetypeOfTags(["machiya_shop_row"])).toBe("machiya_shop_row");
    expect(archetypeOfTags(["nagaya_row"])).toBe("machiya_shop_row");
    expect(archetypeOfTags(["gojunoto_pagoda"])).toBe("gojunoto_pagoda");
    expect(archetypeOfTags(["gojunoto"])).toBe("gojunoto_pagoda");
    expect(archetypeOfTags(["sando_torii"])).toBe("sando_torii");
    expect(archetypeOfTags(["sando"])).toBe("sando_torii");
    expect(archetypeOfTags(["dojo_hall"])).toBe("dojo_hall");
    expect(archetypeOfTags(["dojo"])).toBe("dojo_hall");
    expect(archetypeOfTags(["kendo_dojo"])).toBe("dojo_hall");
    expect(archetypeOfTags(["onsen_bathhouse"])).toBe("onsen_bathhouse");
    expect(archetypeOfTags(["onsen"])).toBe("onsen_bathhouse");
    expect(archetypeOfTags(["noh_stage"])).toBe("noh_stage");
    expect(archetypeOfTags(["noh_butai"])).toBe("noh_stage");
    expect(archetypeOfTags(["karesansui_court"])).toBe("karesansui_court");
    expect(archetypeOfTags(["karesansui"])).toBe("karesansui_court");
    expect(archetypeOfTags(["kura_storehouse"])).toBe("kura_storehouse");
    expect(archetypeOfTags(["rice_kura"])).toBe("kura_storehouse");
    expect(archetypeOfTags(["chashitsu_teahouse"])).toBe("chashitsu_teahouse");
    expect(archetypeOfTags(["chashitsu"])).toBe("chashitsu_teahouse");
    expect(archetypeOfTags(["kaji_forge"])).toBe("kaji_forge");
    expect(archetypeOfTags(["kaji_smithy"])).toBe("kaji_forge");
    expect(archetypeOfTags(["yagura_watchtower"])).toBe("yagura_watchtower");
    expect(archetypeOfTags(["yagura"])).toBe("yagura_watchtower");
    expect(archetypeOfTags(["masugata_gate"])).toBe("masugata_gate");
    expect(archetypeOfTags(["masugata"])).toBe("masugata_gate");

    // **The negative sweep.** Every one of these belongs to an older table and
    // this pack must not have moved a single one of them. Most of them are
    // words this pack actually wanted, and losing them is why every id here is
    // a compound.
    expect(archetypeOfTags(["tenshu_keep"])).toBe("tenshu_keep");
    expect(archetypeOfTags(["machiya"])).toBe("machiya");
    expect(archetypeOfTags(["kora_gatehouse"])).toBe("kora_gatehouse");
    expect(archetypeOfTags(["caravan_gatehouse"])).toBe("caravan_gatehouse");
    expect(archetypeOfTags(["stilt_granary"])).toBe("stilt_granary");
    for (const bare of [
      "torii",
      "pagoda",
      "zen_garden",
      "moon_gate",
      "paifang",
      "shoji_teahouse",
      "stone_lantern",
      "drum_tower",
      "castle_base_wall",
      "bell_pavilion",
      "keep",
      "castle",
      "tea_house",
      "teahouse",
      "smithy",
      "bathhouse",
      "granary",
      "mudbrick_granary",
      "staddle_granary",
      "gate",
      "gatehouse",
      "arch",
      "triumphal_arch",
      "city_gate",
      "watchtower",
      "tower",
      "palisade_watchtower",
      "hall",
      "town_hall",
      "guildhall",
      "dance_hall",
      "courtyard",
      "courtyard_house",
      "memorial_garden",
      "shop_row",
      "terraced_row",
      "workshop",
      "shrine",
      "house",
    ]) {
      for (const mine of FEUDAL_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      const facade = feudalFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(feudalFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: the hipped tiled roof is the silhouette of
    // the whole vernacular, and the garden court is roofed by the sky.
    expect(feudalFacadeDefaults("yamashiro_tenshu").roof).toBe("hip");
    expect(feudalFacadeDefaults("gojunoto_pagoda").roof).toBe("hip");
    expect(feudalFacadeDefaults("karesansui_court").roof).toBe("flat");
    expect(feudalFacadeDefaults("kura_storehouse").roof).toBe("gable");
    expect(feudalFacadeDefaults("kura_storehouse").windowRhythm).toBe("none");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("chorten_shrine").roof).toBe("hip");
    expect(archetypeFacadeDefaults("dzong_hall").roof).toBe("flat");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("feudal_japanese");
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

describe("the feudal_japanese pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
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
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
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
    // Both gates land their lintel on the pier head, so on three courses the
    // arch would be one course high — a gate no body walks under and, because
    // the lintel spans the bay, a wall across the room.
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      for (const floors of [1, 2]) {
        assertNoPockets(build(a, LOW, { floors }), {
          label: `${a} ${LOW.join("x")} floors=${floors}`,
        });
      }
    }
  }, 60_000);

  it("keeps every door column and its approach standable", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
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
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
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
    // The keep: the batter outside, the posts and the lamps inside.
    const keep = build("yamashiro_tenshu", BIG, { floors: 1 });
    expect(has(keep, "smooth_quartz"), "the plaster").toBe(true);
    expect(has(keep, "dark_oak_planks"), "the timber band").toBe(true);
    expect(has(keep, "deepslate_tiles"), "the tiled course").toBe(true);
    expect(has(keep, "dark_oak_log"), "the pillar rows").toBe(true);
    expect(has(keep, "glowstone"), "the andon lamps").toBe(true);

    // The shop row: the noren, up over head height and never on the floor.
    const shops = build("machiya_shop_row", BIG, { floors: 1 });
    const noren = shops.ops.filter((op) => op.block.endsWith("_wool"));
    expect(noren.length, "the noren").toBeGreaterThan(0);
    expect(
      noren.every((op) => op.y >= 3),
      "noren over a walker's head",
    ).toBe(true);

    // The pagoda: the tiers, and the mast standing on the crown.
    const pagoda = build("gojunoto_pagoda", BIG, { floors: 1 });
    const tiers = pagoda.ops.filter(
      (op) => op.block === "deepslate_tiles" && op.y > pagoda.meta.wallTop,
    );
    expect(tiers.length, "the tiers").toBeGreaterThan(20);
    expect(
      pagoda.ops.some((op) => op.block === "gold_block" && op.y > pagoda.meta.wallTop),
      "the mast's finial",
    ).toBe(true);

    // The bathhouse: the bath, and never a lit anything.
    const bath = build("onsen_bathhouse", BIG, { floors: 1 });
    expect(has(bath, "water"), "the bath").toBe(true);
    expect(has(bath, "cauldron"), "the buckets").toBe(true);

    // The dojo: the racks, over head height.
    const dojo = build("dojo_hall", BIG, { floors: 1 });
    const racks = dojo.ops.filter((op) => op.block === "iron_bars");
    expect(racks.length, "the weapon racks").toBeGreaterThan(0);
    expect(
      racks.every((op) => op.y >= 3),
      "racked over head height",
    ).toBe(true);

    // The stage: the boards and the pine panel over them.
    const stage = build("noh_stage", BIG, { floors: 1 });
    expect(has(stage, "dark_oak_planks"), "the kagami-ita panel").toBe(true);

    // The dry garden: the raking, IN THE FLOOR PLANE and nowhere else, and
    // never one grain of gravel.
    const garden = build("karesansui_court", BIG, { floors: 1 });
    const gi = garden.meta.interior;
    const raked = garden.ops.filter(
      (op) =>
        op.block === "quartz_block" &&
        op.x >= gi.x0 &&
        op.x <= gi.x1 &&
        op.z >= gi.z0 &&
        op.z <= gi.z1,
    );
    expect(raked.length, "the raked bands").toBeGreaterThan(0);
    expect(
      raked.every((op) => op.y === 0),
      "raking above the floor plane",
    ).toBe(true);
    expect(has(garden, "gravel"), "a falling block in a garden").toBe(false);

    // The store: the bales, up on the stilts.
    const kura = build("kura_storehouse", BIG, { floors: 1 });
    const bales = kura.ops.filter((op) => op.block === "hay_block");
    expect(bales.length, "the bales").toBeGreaterThan(0);
    expect(
      bales.every((op) => op.y >= 2),
      "up off the damp",
    ).toBe(true);

    // The tea room: a kettle and one lamp.
    const tea = build("chashitsu_teahouse", BIG, { floors: 1 });
    expect(has(tea, "cauldron"), "the kettle").toBe(true);
    expect(has(tea, "glowstone"), "the one lamp").toBe(true);

    // The forge: cold, always.
    const forge = build("kaji_forge", BIG, { floors: 1 });
    expect(has(forge, "blast_furnace"), "the furnace").toBe(true);
    for (const op of forge.ops) {
      if (op.block !== "blast_furnace") continue;
      expect(op.props?.["lit"], "a lit furnace in a sealed room").toBe("false");
    }

    // The turret: there is always a bell, however short the storey.
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        expect(
          has(build("yagura_watchtower", size, { floors }), "bell"),
          `a turret with no bell: ${size.join("x")} f=${floors}`,
        ).toBe(true);
      }
    }

    // The gates: exactly one arch bay — two piers, and no more.
    const torii = build("sando_torii", BIG, { floors: 1 });
    const posts = torii.ops.filter((op) => op.block === "red_terracotta" && op.y === 1);
    expect(posts.length, "one bay: two vermilion piers, and no more").toBe(2);
    const gate = build("masugata_gate", BIG, { floors: 1 });
    const piers = gate.ops.filter((op) => op.block === "polished_deepslate" && op.y === 1);
    expect(piers.length, "one bay: two piers, and no more").toBe(2);
  });

  /**
   * **THE ARCH OWES FOUR COURSES.**
   *
   * `archBay` refuses outright below four courses of headroom, and that refusal
   * is the reason `LOW` walks clean above. Asserted directly here rather than
   * inferred from the walk, because the walk is a slow and indirect way to
   * learn that a number changed.
   */
  it("declines to build an arch on a storey with no room under the lintel", () => {
    for (const a of GATES) {
      const low = build(a, LOW, { floors: 1 });
      const pier = a === "sando_torii" ? "red_terracotta" : "polished_deepslate";
      expect(
        low.ops.some((op) => op.block === pier && op.y === 1),
        `${a} built an arch on three courses`,
      ).toBe(false);
    }
  });

  /**
   * **The tiers are a filled mass, and only the pagoda has one.**
   *
   * Every course of it is a filled disc standing on the filled disc below it; a
   * tier written as a ring per course leaves its outermost cells with air below
   * and beside them, which is `floating.isolated` in its oldest clothes. The
   * check that catches that is the theme sweep at the end of this file — this
   * one pins the *positive* claim, that the pagoda is the only building in the
   * pack that touches a cell above the eave plate.
   */
  it("rebuilds tiers over the pagoda, and over nothing else", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      const result = build(a, BIG, { floors: 1 });
      const tiered = a === "gojunoto_pagoda";
      const crown = result.ops.filter(
        (op) => op.block === "deepslate_tiles" && op.y > result.meta.wallTop,
      );
      expect(crown.length > 0, `${a} tiers`).toBe(tiered);
    }
  });

  /**
   * **THE BATTER stops at the plate.**
   *
   * The keep's one piece of exterior work is a wall re-clad, and a re-clad that
   * reached above the eave plate would be deleting the volume the shell hangs
   * its ceiling lantern from — the defect the Mesoamerican pack wrote its hanger
   * guard for. This one simply never goes up there.
   */
  it("keeps the keep's re-clad at or below the eave plate", () => {
    for (const size of SIZES) {
      const result = build("yamashiro_tenshu", size, { floors: 1 });
      const plate = result.meta.wallTop;
      for (const op of result.ops) {
        if (op.block !== "smooth_quartz" && op.block !== "polished_deepslate") continue;
        expect(op.y, `${op.block} above the plate at ${op.x},${op.y},${op.z}`).toBeLessThanOrEqual(
          plate,
        );
      }
    }
  });

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
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
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0xfeed5n, `world.castle.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = feudalFacadeDefaults(a);
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

describe("the feudal_japanese pack's pools", () => {
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
    for (const a of FEUDAL_BUILDING_ARCHETYPES) {
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

  /** The pack's water is a *bath*, not a flood: the room stays crossable. */
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

  /** On the plan it was designed for, the wet archetype is actually wet. */
  it("actually fills its basins on a plan with room for them", () => {
    for (const a of WET) {
      expect(has(build(a, BIG, { floors: 1 }), "water"), `${a} on the big plan`).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* THE HANG                                                                    */
/* -------------------------------------------------------------------------- */

describe("the turret's hang", () => {
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
        const result = build("yagura_watchtower", size, { floors });
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

  /** However short the storey, the turret has a bell in it. */
  it("stands the bell on its frame when the storey will not give the height", () => {
    const short = build("yagura_watchtower", [9, 8, 9], { floors: 1 });
    expect(has(short, "bell"), "a turret with no bell").toBe(true);
  });
});
