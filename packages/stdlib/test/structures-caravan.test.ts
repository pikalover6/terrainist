/**
 * The **desert_caravanserai pack's buildings** — the thirteen entries of that
 * pack that have an inside, held to the same harness every earlier wave was
 * held to. A new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about, so almost nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack's near misses start with
 *   the one it lost: `caravanserai` is the *commerce* wave's, word for word,
 *   which is why the anchor ships as `serai_court`. `gate`, `arch`, `well`,
 *   `warehouse`, `bazaar`, `souk`, `market`, `stable`, `granary`, `cistern`,
 *   `kiln`, `glassworks`, `shrine`, `minaret`, `tower` and `watchtower` must
 *   every one of them still go exactly where they went;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme**, because a fit-out supported in oak and floating in stone is a
 *   defect that only shows up on the walk — and the shrine's dome, the pack's
 *   only exterior work, is exactly the shape that gets that wrong;
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, no lit fire —
 *   and the same seed gives the same ops forever.
 *
 * Two checks **are** this pack's own, because two of its claims are:
 *
 * - **POOL STABILITY.** Every water cell this pack writes is closed. It sits in
 *   the floor plane, every one of its four horizontal neighbours is water or a
 *   solid block written in that same plane, and there is air over it and never
 *   a body-blocking prop. That is the closure argument the water works made
 *   about terrain, restated at building scale;
 * - **HANGER CLOSURE.** `chain` is not in the pinned 1.21.11 block table;
 *   `iron_chain` is. The wellhead's draw rope has something solid directly
 *   above it and **nothing hanging under it** — a chain is not a full cube, so
 *   anything with `attachment: ceiling` beneath one is `unsupported.chain` in
 *   waiting. That is the tide-bell lesson, asserted rather than remembered.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  CARAVAN_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  caravanFacadeDefaults,
  generateBuilding,
  isCaravanArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xca4a7an, "world.oasis");
const OTHER = nodeSeed(0xca4a7an, "world.oasis.other");
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
const WET = ["serai_court", "qanat_wellhead", "serai_cistern", "oasis_shrine"] as const;

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = caravanFacadeDefaults(archetype);
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

describe("the desert_caravanserai pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(CARAVAN_BUILDING_ARCHETYPES).toHaveLength(13);
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isCaravanArchetype(a)).toBe(true);
    }
    expect(isCaravanArchetype("cottage")).toBe(false);
    expect(isCaravanArchetype("caravanserai")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["serai_court"])).toBe("serai_court");
    expect(archetypeOfTags(["serai"])).toBe("serai_court");
    expect(archetypeOfTags(["oasis_serai"])).toBe("serai_court");
    expect(archetypeOfTags(["caravan_gatehouse"])).toBe("caravan_gatehouse");
    expect(archetypeOfTags(["caravan_gate"])).toBe("caravan_gatehouse");
    expect(archetypeOfTags(["qanat_wellhead"])).toBe("qanat_wellhead");
    expect(archetypeOfTags(["qanat"])).toBe("qanat_wellhead");
    expect(archetypeOfTags(["windcatcher_house"])).toBe("windcatcher_house");
    expect(archetypeOfTags(["badgir"])).toBe("windcatcher_house");
    expect(archetypeOfTags(["spice_godown"])).toBe("spice_godown");
    expect(archetypeOfTags(["godown"])).toBe("spice_godown");
    expect(archetypeOfTags(["camel_lines"])).toBe("camel_lines");
    expect(archetypeOfTags(["camel_stable"])).toBe("camel_lines");
    expect(archetypeOfTags(["shade_arcade_row"])).toBe("shade_arcade_row");
    expect(archetypeOfTags(["shade_arcade"])).toBe("shade_arcade_row");
    expect(archetypeOfTags(["date_store_tower"])).toBe("date_store_tower");
    expect(archetypeOfTags(["date_store"])).toBe("date_store_tower");
    expect(archetypeOfTags(["serai_cistern"])).toBe("serai_cistern");
    expect(archetypeOfTags(["sand_cistern"])).toBe("serai_cistern");
    expect(archetypeOfTags(["dye_yard"])).toBe("dye_yard");
    expect(archetypeOfTags(["indigo_yard"])).toBe("dye_yard");
    expect(archetypeOfTags(["desert_glass_kiln"])).toBe("desert_glass_kiln");
    expect(archetypeOfTags(["glass_kiln"])).toBe("desert_glass_kiln");
    expect(archetypeOfTags(["oasis_shrine"])).toBe("oasis_shrine");
    expect(archetypeOfTags(["desert_shrine"])).toBe("oasis_shrine");
    expect(archetypeOfTags(["watch_minaret"])).toBe("watch_minaret");
    expect(archetypeOfTags(["watchtower_minaret"])).toBe("watch_minaret");

    // **The negative sweep.** Every one of these belongs to an older table and
    // this pack must not have moved a single one of them. The first is the
    // word this pack actually lost, and losing it is why the anchor is called
    // what it is called.
    expect(archetypeOfTags(["caravanserai"])).toBe("caravanserai");
    expect(archetypeOfTags(["khan"])).toBe("caravanserai");
    expect(archetypeOfTags(["souk"])).toBe("spice_market");
    expect(archetypeOfTags(["bazaar"])).toBe("spice_market");
    expect(archetypeOfTags(["cistern"])).toBe("cistern");
    expect(archetypeOfTags(["minaret"])).toBe("minaret");
    expect(archetypeOfTags(["mudbrick_granary"])).toBe("mudbrick_granary");
    for (const bare of [
      "gate",
      "gatehouse",
      "arch",
      "triumphal_arch",
      "well",
      "warehouse",
      "market",
      "spice_market",
      "arcade",
      "stoa",
      "stable",
      "stables",
      "paddock",
      "corral",
      "granary",
      "reservoir",
      "kiln",
      "glassworks",
      "glassblower",
      "shrine",
      "roadside_shrine",
      "chapel",
      "tower",
      "watchtower",
      "courtyard",
      "courtyard_house",
      "house",
      "workshop",
      "tannery",
    ]) {
      for (const mine of CARAVAN_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      const facade = caravanFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(caravanFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: a mudbrick town roofs flat, and the shrine
    // is the one round thing in it.
    expect(caravanFacadeDefaults("oasis_shrine").roof).toBe("hip");
    expect(caravanFacadeDefaults("serai_court").roof).toBe("flat");
    expect(caravanFacadeDefaults("spice_godown").windowRhythm).toBe("none");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hypostyle_hall").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("desert_caravanserai");
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

describe("the desert_caravanserai pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
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
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
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
    // The gatehouse lands its lintel on the pier head, so on three courses the
    // arch was one course high — a gate no body walks under and, because the
    // lintel spans the bay, a wall across the room. It cost the terrarium five
    // `traversal.unreachable` findings while every size here passed.
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      for (const floors of [1, 2]) {
        assertNoPockets(build(a, LOW, { floors }), {
          label: `${a} ${LOW.join("x")} floors=${floors}`,
        });
      }
    }
  }, 60_000);

  it("keeps every door column and its approach standable", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
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
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
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
    // The court: the arcade, the niches and the basin.
    const court = build("serai_court", BIG, { floors: 1 });
    expect(has(court, "cut_sandstone"), "the arcade").toBe(true);
    expect(has(court, "glowstone"), "the lamp niches").toBe(true);
    expect(has(court, "chiseled_sandstone"), "the niches' surround").toBe(true);
    expect(has(court, "water"), "the court's basin").toBe(true);

    // The gatehouse: exactly one arch bay — two piers, and no more.
    const gate = build("caravan_gatehouse", BIG, { floors: 1 });
    const piers = gate.ops.filter((op) => op.block === "cut_sandstone" && op.y === 1);
    expect(piers.length, "one bay: two piers, and no more").toBe(2);

    // The wellhead: the channel, and the rope on `iron_chain` over dry floor.
    const well = build("qanat_wellhead", BIG, { floors: 1 });
    expect(has(well, "water"), "the channel").toBe(true);
    expect(has(well, "iron_chain"), "the draw rope").toBe(true);

    // The badgir: the vent grilles, and never at a body's height.
    const badgir = build("windcatcher_house", BIG, { floors: 1 });
    const vents = badgir.ops.filter((op) => op.block === "iron_bars");
    expect(vents.length, "the vents").toBeGreaterThan(0);
    expect(
      vents.every((op) => op.y >= 3),
      "vented over head height",
    ).toBe(true);

    // The godown: the sacks, up on the plinth and never on the floor.
    const godown = build("spice_godown", BIG, { floors: 1 });
    const sacks = godown.ops.filter((op) => op.block.endsWith("_terracotta"));
    expect(sacks.length, "the sack ranks").toBeGreaterThan(0);
    expect(
      sacks.every((op) => op.y >= 2),
      "never on a floor that gets swept",
    ).toBe(true);

    // The camel lines: the fodder, up on the plinth.
    const lines = build("camel_lines", BIG, { floors: 1 });
    const fodder = lines.ops.filter((op) => op.block === "hay_block");
    expect(fodder.length, "the fodder").toBeGreaterThan(0);
    expect(
      fodder.every((op) => op.y >= 2),
      "never trodden into the ground",
    ).toBe(true);
    expect(has(lines, "cauldron"), "the troughs").toBe(true);

    // The arcade: the awning slabs, springing off a column that reached them.
    const arcade = build("shade_arcade_row", BIG, { floors: 1 });
    expect(has(arcade, "cut_sandstone"), "the columns").toBe(true);
    const at = indexOf(arcade.ops);
    const columns = new Set(
      arcade.ops.filter((op) => op.block === "cut_sandstone").map((op) => `${op.x},${op.y},${op.z}`),
    );
    // Interior cells only: the shell's own eave slabs live outside the room
    // and are not this fit-out's to answer for.
    const ai = arcade.meta.interior;
    const awnings = arcade.ops.filter(
      (op) =>
        op.block.endsWith("_slab") &&
        op.y >= 3 &&
        op.x >= ai.x0 &&
        op.x <= ai.x1 &&
        op.z >= ai.z0 &&
        op.z <= ai.z1,
    );
    expect(awnings.length, "the awning").toBeGreaterThan(0);
    for (const op of awnings) {
      const beside =
        columns.has(`${op.x + 1},${op.y},${op.z}`) || columns.has(`${op.x - 1},${op.y},${op.z}`);
      expect(beside, `awning at ${op.x},${op.y},${op.z} springs off nothing`).toBe(true);
    }
    expect(at.size, "an index of the whole room").toBeGreaterThan(100);

    // The date store: the bins, and the press at the head.
    const dates = build("date_store_tower", BIG, { floors: 1 });
    expect(has(dates, "brown_terracotta"), "the pressed dates").toBe(true);
    expect(has(dates, "smooth_sandstone"), "the press").toBe(true);

    // The cistern: the water, and the drawing steps round it.
    const cistern = build("serai_cistern", BIG, { floors: 1 });
    expect(has(cistern, "water"), "the cistern").toBe(true);
    const steps = cistern.ops.filter((op) => op.block.endsWith("_stairs") && op.y === 1);
    expect(steps.length, "the drawing steps").toBeGreaterThan(3);

    // The dye yard: the vats, the cloth over them — and NOT ONE CELL OF WATER.
    const dye = build("dye_yard", BIG, { floors: 1 });
    expect(has(dye, "cauldron"), "the vats").toBe(true);
    expect(has(dye, "loom"), "the loom").toBe(true);
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        expect(
          has(build("dye_yard", size, { floors }), "water"),
          `the dye yard is dry: ${size.join("x")} f=${floors}`,
        ).toBe(false);
      }
    }

    // The kiln: cold, and its stock up off the floor.
    const kiln = build("desert_glass_kiln", BIG, { floors: 1 });
    expect(has(kiln, "blast_furnace"), "the kiln").toBe(true);
    for (const op of kiln.ops) {
      if (op.block !== "blast_furnace") continue;
      expect(op.props?.["lit"], "a lit kiln in a sealed room").toBe("false");
    }
    const sand = kiln.ops.filter((op) => op.block === "sandstone" && op.y >= 2);
    expect(sand.length, "the stock").toBeGreaterThan(0);

    // The shrine: the dome, and the oculus in it.
    const shrine = build("oasis_shrine", BIG, { floors: 1 });
    const dome = shrine.ops.filter(
      (op) => op.block.includes("mud_brick") && op.y > shrine.meta.wallTop,
    );
    expect(dome.length, "the dome").toBeGreaterThan(20);
    expect(
      shrine.ops.some((op) => op.block === "glowstone" && op.y > shrine.meta.wallTop),
      "the oculus",
    ).toBe(true);
    expect(has(shrine, "water"), "the ablution basin").toBe(true);

    // The minaret: the open rail, and the brazier.
    const minaret = build("watch_minaret", BIG, { floors: 1 });
    expect(has(minaret, "glowstone"), "the signal brazier").toBe(true);
  });

  /**
   * **The dome is a filled mass, and only the shrine has one.**
   *
   * Every course of it is a filled disc standing on the filled disc below it; a
   * dome written as a ring per course leaves its outermost cells with air below
   * and beside them, which is `floating.isolated` in its oldest clothes. The
   * check that catches that is the theme sweep at the end of this file — this
   * one pins the *positive* claim, that the shrine is the only building in the
   * pack that touches a cell above the eave plate.
   */
  it("rebuilds a dome over the shrine, and over nothing else", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      const result = build(a, BIG, { floors: 1 });
      const domed = a === "oasis_shrine";
      const brick = result.ops.filter(
        (op) => op.block.includes("mud_brick") && op.y > result.meta.wallTop,
      );
      expect(brick.length > 0, `${a} dome`).toBe(domed);
    }
  });

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} farmland`).not.toBe("farmland");
        expect(op.block, `${a} fire`).not.toBe("fire");
        expect(op.props?.["lit"], `${a} lit ${op.block}`).not.toBe("true");
      }
    }
  });

  it("is deterministic, and reseeds without changing its envelope", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0xca4a7an, `world.oasis.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = caravanFacadeDefaults(a);
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

describe("the desert_caravanserai pack's pools", () => {
  /**
   * **Every water cell this pack writes is closed on every side.**
   *
   * The predicate, in full:
   *
   * - the water is in the **floor plane** (`y = 0`) and never above it — a
   *   water cell at `y = 1` is a body-blocking cell in the middle of a room
   *   *and* a fluid with a free face on four sides;
   * - each of its **four horizontal neighbours in that plane** is either more
   *   water or a written solid block. Air beside a source block is where it
   *   flows on the first tick, and a flowing world is a world the lint fails
   *   with `LOAM-T110`;
   * - **nothing stands on it**: no op at `y = 1` in a water cell, ever. That is
   *   guaranteed upstream by claiming the cells through `take` before a drop is
   *   written, and asserted here because the guarantee is what matters.
   *
   * Swept across every archetype, every envelope and both storey counts,
   * because a basin that closes on a fifteen-wide plan and opens on a nine-wide
   * one is a bug that ships.
   */
  it("closes every water cell it writes, on every envelope", () => {
    for (const a of CARAVAN_BUILDING_ARCHETYPES) {
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
/* HANGER CLOSURE                                                              */
/* -------------------------------------------------------------------------- */

describe("the wellhead's draw rope", () => {
  /**
   * **`iron_chain`, with something over it and nothing under it.**
   *
   * `chain` is not in the pinned 1.21.11 block table — that is the rename
   * lesson. The closure is top-down: a cap course, the chain under it, and then
   * air, because a chain is **not a full cube** and `attachment: ceiling`
   * demands one. The Atlantean pack learned that with a bell; this pack simply
   * never hangs anything from its rope.
   */
  it("caps every chain from above and hangs nothing from it", () => {
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        const result = build("qanat_wellhead", size, { floors });
        const at = indexOf(result.ops);
        const label = `${size.join("x")} f=${floors}`;
        for (const op of result.ops) {
          expect(op.block, `${label}: chain`).not.toBe("chain");
          if (op.block !== "iron_chain") continue;
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
        // The rope is over dry floor, never over the channel: a rope over
        // water is a rope nobody can stand under to pull.
        for (const op of result.ops) {
          if (op.block !== "iron_chain") continue;
          expect(at.get(`${op.x},0,${op.z}`)?.block, `${label}: rope over`).not.toBe("water");
        }
      }
    }
  });
});
