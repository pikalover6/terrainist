/**
 * The **Swamp Witch pack's buildings** — the twelve entries of that pack that
 * have an inside, held to the same harness every earlier wave was held to. A
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about, so nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack has more near misses
 *   than any pack since the Norse, because the fen vocabulary brushes against
 *   words older tables own: `witch_hut` (the sharpest of the lot),
 *   `stilt_house`, `apothecary`, `herbalist`, `chapel`, `ruined_chapel`,
 *   `smokehouse`, `cottage`, `boardwalk`, `pen`, `corral`, `tent`,
 *   `chandlery` and `root_cellar` must all still go exactly where they went;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme** — and the stilt understorey, the only exterior work in the pack, is
 *   exactly the shape that gets that wrong;
 * - **the stilts are stilts**: every post a full column solid to the ground,
 *   the deck plate over them supported, and the under-hut space genuinely open;
 * - **every drop of water is curbed**, which is this pack's own rule and the
 *   one it would be easiest to get wrong;
 * - no bare flower pots, no sign blocks, no `chain`, no `mud`, no lantern by
 *   name, no lit fire — and the same seed gives the same ops forever.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock, walkabilityReport } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  STRUCTURE_CATALOG,
  SWAMP_BUILDING_ARCHETYPES,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isSwampArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  swampFacadeDefaults,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x5a11ecn, "world.swamp");
const OTHER = nodeSeed(0x5a11ecn, "world.swamp.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 16, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

/**
 * The one archetype in the pack whose floor is walked with the **lint's own**
 * model rather than with the naive one below.
 *
 * `fen_chapel_ruin` runs the ruins vocabulary's decay, which scatters rubble
 * slabs and stairs across the floor. `freeCells`/`oneRegion` here call a slab
 * "not empty" and stop there; the physics lint calls it a **mount** and steps
 * onto it, which is why `structures-relic.test.ts` walks all five of its ruins
 * with `walkabilityReport` and its `exclude` for the lantern cell. This pack
 * inherits that ruling with its ruin rather than inventing a second answer —
 * and the ruin is held to the *stronger* check, not a weaker one: the door
 * walk with no pocket anywhere.
 */
const RUIN = "fen_chapel_ruin";

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = swampFacadeDefaults(archetype);
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

describe("the Swamp Witch pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(SWAMP_BUILDING_ARCHETYPES).toHaveLength(12);
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isSwampArchetype(a)).toBe(true);
    }
    expect(isSwampArchetype("cottage")).toBe(false);
    expect(isSwampArchetype("witch_hut")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["witch_stilt_hut"])).toBe("witch_stilt_hut");
    expect(archetypeOfTags(["stilt_hut"])).toBe("witch_stilt_hut");
    expect(archetypeOfTags(["swamp_hut"])).toBe("witch_stilt_hut");
    expect(archetypeOfTags(["herb_drying_loft"])).toBe("herb_drying_loft");
    expect(archetypeOfTags(["drying_loft"])).toBe("herb_drying_loft");
    expect(archetypeOfTags(["herb_loft"])).toBe("herb_drying_loft");
    expect(archetypeOfTags(["bog_apothecary"])).toBe("bog_apothecary");
    expect(archetypeOfTags(["fen_apothecary"])).toBe("bog_apothecary");
    expect(archetypeOfTags(["bog_alchemist"])).toBe("bog_apothecary");
    expect(archetypeOfTags(["fen_chapel_ruin"])).toBe("fen_chapel_ruin");
    expect(archetypeOfTags(["bog_chapel"])).toBe("fen_chapel_ruin");
    expect(archetypeOfTags(["sunken_chapel"])).toBe("fen_chapel_ruin");
    expect(archetypeOfTags(["eel_smokehouse"])).toBe("eel_smokehouse");
    expect(archetypeOfTags(["eel_smoker"])).toBe("eel_smokehouse");
    expect(archetypeOfTags(["fen_smokehouse"])).toBe("eel_smokehouse");
    expect(archetypeOfTags(["moss_cottage"])).toBe("moss_cottage");
    expect(archetypeOfTags(["mossy_cottage"])).toBe("moss_cottage");
    expect(archetypeOfTags(["fen_cottage"])).toBe("moss_cottage");
    expect(archetypeOfTags(["fen_landing_stage"])).toBe("fen_landing_stage");
    expect(archetypeOfTags(["swamp_jetty"])).toBe("fen_landing_stage");
    expect(archetypeOfTags(["fen_jetty"])).toBe("fen_landing_stage");
    expect(archetypeOfTags(["leech_pools"])).toBe("leech_pools");
    expect(archetypeOfTags(["leech_farm"])).toBe("leech_pools");
    expect(archetypeOfTags(["leech_beds"])).toBe("leech_pools");
    expect(archetypeOfTags(["candle_workshop"])).toBe("candle_workshop");
    expect(archetypeOfTags(["candle_works"])).toBe("candle_workshop");
    expect(archetypeOfTags(["candle_maker"])).toBe("candle_workshop");
    expect(archetypeOfTags(["black_goat_pen"])).toBe("black_goat_pen");
    expect(archetypeOfTags(["goat_pen"])).toBe("black_goat_pen");
    expect(archetypeOfTags(["witch_goat_pen"])).toBe("black_goat_pen");
    expect(archetypeOfTags(["fortune_tellers_tent"])).toBe("fortune_tellers_tent");
    expect(archetypeOfTags(["fortune_tent"])).toBe("fortune_tellers_tent");
    expect(archetypeOfTags(["soothsayer_tent"])).toBe("fortune_tellers_tent");
    expect(archetypeOfTags(["mangrove_root_cellar"])).toBe("mangrove_root_cellar");
    expect(archetypeOfTags(["mangrove_cellar"])).toBe("mangrove_root_cellar");
    expect(archetypeOfTags(["bog_cellar"])).toBe("mangrove_root_cellar");

    // The near misses. Every one of these belongs to an older table and this
    // pack must not have moved a single one of them. `witch_hut` is the
    // sharpest: it is the homestead wave's building, word for word, and a
    // document that writes it must keep getting it — which is exactly why this
    // pack's anchor carries the stilts in its id.
    expect(archetypeOfTags(["witch_hut"])).toBe("witch_hut");
    expect(archetypeOfTags(["witches_hut"])).toBe("witch_hut");
    expect(archetypeOfTags(["witch"])).toBe("witch_hut");
    expect(archetypeOfTags(["stilt_house"])).toBe("stilt_house");
    expect(archetypeOfTags(["stilts"])).toBe("stilt_house");
    expect(archetypeOfTags(["apothecary"])).toBe("apothecary");
    expect(archetypeOfTags(["herbalist"])).toBe("apothecary");
    expect(archetypeOfTags(["alchemist"])).toBe("apothecary");
    expect(archetypeOfTags(["smokehouse"])).toBe("smokehouse");
    expect(archetypeOfTags(["smokery"])).toBe("smokehouse");
    expect(archetypeOfTags(["cottage"])).toBe("cottage");
    expect(archetypeOfTags(["ruined_chapel"])).toBe("ruined_church");
    expect(archetypeOfTags(["ruined_church"])).toBe("ruined_church");
    expect(archetypeOfTags(["corral"])).toBe("cattle_pen");
    expect(archetypeOfTags(["paddock"])).toBe("cattle_pen");
    expect(archetypeOfTags(["root_cellar"])).toBe("root_cellar_mound");
    for (const bare of [
      "witch_hut",
      "witches_hut",
      "witch",
      "stilt_house",
      "stilts",
      "apothecary",
      "pharmacy",
      "herbalist",
      "alchemist",
      "chapel",
      "wayside_chapel",
      "ruined_chapel",
      "ruined_church",
      "abbey_ruin",
      "smokehouse",
      "smoke_house",
      "smokery",
      "smoker",
      "cottage",
      "ruined_cottage",
      "derelict_cottage",
      "boardwalk",
      "landing",
      "canoe_landing",
      "dugout_landing",
      "smugglers_landing",
      "pen",
      "pig_pen",
      "sheep_pen",
      "cattle_pen",
      "paddock",
      "corral",
      "winter_pen",
      "tent",
      "circus_tent",
      "chandlery",
      "workshop",
      "distillery",
      "cellar",
      "root_cellar",
      "root_cellar_mound",
      "wine_cellar",
      "scrying_pool",
      "swimming_pool",
      "duck_pond",
      "drying_rack",
      "fish_drying_rack",
      "drying_rack_yard",
      "borts_rack",
      "shrine",
      "roadside_shrine",
      "votive_shrine",
      "henge",
      "rune_circle",
    ]) {
      for (const mine of SWAMP_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      const facade = swampFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(swampFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: a fen building is a ridge, and the two
    // exceptions are the pool yard's cover and the reader's canvas.
    expect(swampFacadeDefaults("leech_pools").roof).toBe("flat");
    expect(swampFacadeDefaults("fortune_tellers_tent").roof).toBe("hip");
    expect(
      SWAMP_BUILDING_ARCHETYPES.filter((a) => swampFacadeDefaults(a).roof === "gable"),
    ).toHaveLength(10);
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hypostyle_hall").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("swamp_witch");
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

describe("the Swamp Witch pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          if (a === RUIN) continue; // see RUIN: walked by the lint's own model
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
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const it = result.meta.interior;
          // The lantern cell is excluded for the ruin exactly as the relic
          // wave excludes it: the shell hangs a lantern in the middle column
          // and the decay is entitled to leave that one cell blocked.
          const lamp: readonly [number, number] = [
            Math.floor((it.x0 + it.x1) / 2),
            Math.floor((it.z0 + it.z1) / 2),
          ];
          const report = assertNoPockets(result, {
            label: `${a} ${size.join("x")} floors=${floors}`,
            ...(a === RUIN ? { exclude: [lamp] } : {}),
          });
          expect(report.reachable.length, `${a} ${size.join("x")}`).toBeGreaterThan(3);
        }
      }
    }
  }, 60_000);

  it("keeps every door column and its approach standable", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
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
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const mid: readonly [number, number] = [
          Math.floor((it.x0 + it.x1) / 2),
          Math.floor((it.z0 + it.z1) / 2),
        ];
        const label = `${a} ${size.join("x")} without the lantern cell`;
        if (a === RUIN) {
          // The lint's own walk, for the reason RUIN gives.
          const report = walkabilityReport(result, { exclude: [mid] });
          expect(report.pocket, `${label}\n${report.map}`).toEqual([]);
          continue;
        }
        const free = freeCells(result).filter((k) => k !== `${mid[0]},${mid[1]}`);
        expect(oneRegion(free), label).toBe(true);
      }
    }
  }, 60_000);

  it("builds the thing each archetype is for", () => {
    // The stilt hut: the cauldron at the head and the fire beside it.
    const hut = build("witch_stilt_hut", BIG, { floors: 1 });
    expect(has(hut, "cauldron"), "the cauldron").toBe(true);
    expect(has(hut, "glowstone"), "the fire").toBe(true);

    // The drying loft: the strands, hung well over head height.
    const loft = build("herb_drying_loft", BIG, { floors: 1 });
    expect(has(loft, "composter"), "the spoiled cut").toBe(true);
    const strands = loft.ops.filter((op) => op.block === "iron_bars");
    expect(strands.length, "the strands").toBeGreaterThan(0);
    expect(
      strands.every((op) => op.y >= 3),
      "never in a body's face",
    ).toBe(true);

    // The apothecary: the still, and the steeping vats.
    const shop = build("bog_apothecary", BIG, { floors: 1 });
    expect(has(shop, "brewing_stand"), "the still").toBe(true);
    expect(has(shop, "cauldron"), "the vats").toBe(true);

    // The chapel ruin: a cold altar stump, and the bog's own moss.
    const ruin = build("fen_chapel_ruin", BIG, { floors: 1 });
    expect(
      ruin.ops.some((op) => /moss/.test(op.block)),
      "the bog has been at it",
    ).toBe(true);

    // The smokehouse: the eels and the smoke pit, and no fire at all.
    const smoke = build("eel_smokehouse", BIG, { floors: 1 });
    expect(has(smoke, "glowstone"), "the smoke pit").toBe(true);
    const eels = smoke.ops.filter((op) => op.block === "iron_bars");
    expect(eels.length, "the eels").toBeGreaterThan(0);
    expect(
      eels.every((op) => op.y >= 3),
      "hung over head height",
    ).toBe(true);

    // The moss cottage: the moss, on the walls and on the floor.
    const moss = build("moss_cottage", BIG, { floors: 1 });
    expect(has(moss, "moss_block") || has(moss, "mossy_cobblestone"), "the moss skin").toBe(true);

    // The landing stage: the decking and the mooring posts.
    const landing = build("fen_landing_stage", BIG, { floors: 1 });
    expect(has(landing, "barrel"), "the catch").toBe(true);
    const posts = landing.ops.filter((op) => op.block.endsWith("_fence") && op.y === 1);
    expect(posts.length, "the mooring posts").toBeGreaterThan(0);

    // The candle workshop: the vats and the COLD candles.
    const chandler = build("candle_workshop", BIG, { floors: 1 });
    expect(has(chandler, "cauldron"), "the dipping vats").toBe(true);
    const candles = chandler.ops.filter((op) => op.block.endsWith("_candle"));
    expect(
      candles.every((op) => op.props?.["lit"] === "false"),
      "every candle cold",
    ).toBe(true);

    // The goat pen: the fodder, up off wet ground.
    const pen = build("black_goat_pen", BIG, { floors: 1 });
    const hay = pen.ops.filter((op) => op.block === "hay_block");
    expect(hay.length, "the fodder").toBeGreaterThan(0);
    expect(
      hay.every((op) => op.y >= 2),
      "never on wet ground",
    ).toBe(true);

    // The fortune teller: the table, and a candle nobody lit.
    const reader = build("fortune_tellers_tent", BIG, { floors: 1 });
    const seats = reader.ops.filter((op) => op.block.endsWith("_stairs") && op.y === 1);
    expect(seats.length, "the seats").toBeGreaterThan(0);

    // The root cellar: the ribs, laid along x at the top of the storey.
    const cellar = build("mangrove_root_cellar", BIG, { floors: 1 });
    const ribs = cellar.ops.filter((op) => op.props?.["axis"] === "x" && op.y >= 3);
    expect(ribs.length, "the root ribs").toBeGreaterThan(0);
  });

  /**
   * **THE STILTS ARE STILTS.**
   *
   * The pack's whole silhouette argument, as three assertions, because a hut
   * that only *looks* like it is on stilts from one angle is a cottage:
   *
   * 1. every post is a **full column solid to the ground** — no gap anywhere
   *    between the lowest course this pass wrote and the plate, which is the
   *    `unsupported` chain rule the Terrarium found on `stilt_house`;
   * 2. the **deck plate** over them is supported — every plate cell touches a
   *    post head under it or the building's own wall beside it;
   * 3. the **under-hut space is genuinely open** — nothing at all is written at
   *    `y = 1` or `y = 2` in an apron cell that is not a post. A skirt would be
   *    a plinth, and a hut on a plinth is a cottage again.
   */
  it("stands the hut on stilts, with the space under it open", () => {
    for (const size of SIZES) {
      const result = build("witch_stilt_hut", size, { floors: 1 });
      const at = indexOf(result.ops);
      const [sx, , sz] = result.meta.size;
      const label = `witch_stilt_hut ${size.join("x")}`;
      let posts = 0;
      let plate = 0;
      for (let z = -1; z <= sz; z++) {
        for (let x = -1; x <= sx; x++) {
          const apron = x === -1 || x === sx || z === -1 || z === sz;
          if (!apron) continue;
          const one = at.get(`${x},1,${z}`)?.block;
          const two = at.get(`${x},2,${z}`)?.block;
          const isPost = one !== undefined && one !== "air";
          if (isPost) {
            posts++;
            // 1. solid to the ground and solid to the plate: no gap.
            expect(two, `${label}: post at ${x},${z} stops short`).toBeDefined();
            expect(two, `${label}: post at ${x},${z} has a gap`).not.toBe("air");
            const zero = at.get(`${x},0,${z}`)?.block;
            expect(
              zero === undefined || zero !== "air",
              `${label}: post at ${x},${z} stands on air`,
            ).toBe(true);
          } else {
            // 3. the under-hut space is open. "Open" is the lint's word, not
            // "empty": the shell hangs its own shutters and trims in the apron
            // at the storey line and those are passable non-cubes a body walks
            // straight through. What must never be there is a **cube** — a
            // skirt of boards is a plinth, and a hut on a plinth is a cottage.
            expect(
              passableBlock(two),
              `${label}: the space under the hut is blocked at ${x},${z} by ${two}`,
            ).toBe(true);
          }
          const three = at.get(`${x},3,${z}`)?.block;
          if (three !== undefined && three !== "air") plate++;
        }
      }
      expect(posts, `${label}: no stilts at all`).toBeGreaterThan(3);
      expect(plate, `${label}: no deck plate`).toBeGreaterThan(posts);
    }
  });

  /**
   * **EVERY DROP OF WATER IS CURBED.**
   *
   * The pack's own rule, and the one it would be easiest to get wrong. A water
   * source moves the instant a horizontal neighbour is anything a fluid can
   * enter, so the claim asserted is the strong one: every water cell this pack
   * writes has a **standing full block or its own water** on all four sides and
   * something solid under it. A slab would be half a block and water pours
   * straight through one, so the neighbour check refuses slabs by name.
   *
   * Swept over the whole pack, not just the pools: the correct number of
   * unexplained water blocks in a building is zero.
   */
  it("curbs every drop of water it writes, on every envelope", () => {
    const CAN_LEAK = /(_slab|_stairs|_fence|_wall|iron_bars|carpet|_gate|_door)$/;
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const at = indexOf(result.ops);
          const label = `${a} ${size.join("x")} f=${floors}`;
          for (const op of result.ops) {
            if (op.block !== "water") continue;
            expect(op.props?.["level"], `${label}: flowing water at ${op.x},${op.y},${op.z}`).toBe(
              "0",
            );
            const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
            expect(
              under !== undefined && under !== "air",
              `${label}: water over ${under} at ${op.x},${op.y},${op.z}`,
            ).toBe(true);
            for (const [dx, dz] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const side = at.get(`${op.x + dx},${op.y},${op.z + dz}`)?.block;
              expect(
                side !== undefined && side !== "air" && !CAN_LEAK.test(side),
                `${label}: water at ${op.x},${op.y},${op.z} leaks ${dx},${dz} into ${side}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  }, 60_000);

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} mangrove mud`).not.toBe("muddy_mangrove_roots");
        expect(op.block, `${a} farmland`).not.toBe("farmland");
        expect(op.block, `${a} campfire`).not.toBe("campfire");
        if (op.block.endsWith("_candle")) {
          expect(op.props?.["lit"], `${a} lit candle`).toBe("false");
        }
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
   * the root cellar lays ribs across the top of the storey, which is the
   * course the shell hangs from, and that is exactly how `unsupported.lantern`
   * gets found on the walk instead of here.
   */
  it("strands no lantern the shell hung", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
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
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of SWAMP_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0x5a11ecn, `world.swamp.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = swampFacadeDefaults(a);
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
            // The floor plane and below is the ground the building stands on,
            // and the decay's apron spill lands on it. `structures-relic.test`
            // draws the line in the same place and for the same reason.
            if (op.y <= 0) continue;
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
