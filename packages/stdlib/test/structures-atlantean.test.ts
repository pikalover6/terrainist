/**
 * The **Atlantean pack's buildings** — the thirteen entries of that pack that
 * have an inside, held to the same harness every earlier wave was held to. A
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about, so almost nothing here is invented:
 *
 * - it registers, resolves and reads off a node's tags **without stealing one
 *   an earlier table already claims** — and this pack's near misses are the
 *   sharpest in the catalog, because a risen-city vocabulary brushes against
 *   the most crowded corner of it: `palace`, `temple`, `shrine`, `rotunda`,
 *   `amphitheater`, `theater`, `arena`, `hall`, `stable`, `gate`, `arch`,
 *   `court`, `garden`, `academy`, `bathhouse`, `baths`, `archive`, `library`,
 *   `bell_tower`, `belfry`, `tower` and `pool` must every one of them still go
 *   exactly where they went;
 * - it puts something in the room it built, and the room stays **one walkable
 *   region** — across one and two storeys and three envelope sizes;
 * - **every door stays standable and enterable**;
 * - the lantern column is never the room's only route;
 * - nothing it builds has air on every side, **swept across every material
 *   theme**, because a fit-out supported in oak and floating in stone is a
 *   defect that only shows up on the walk — and the oracle's dome, the pack's
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
 *   about terrain, restated at building scale — and it is the only reason a
 *   pack about a drowned city is allowed water indoors at all;
 * - **BELL-CHAIN CLOSURE.** `chain` is not in the pinned 1.21.11 block table;
 *   `iron_chain` is. Every chain the bell tower writes has something solid
 *   directly above it and the bell hangs directly under one — because
 *   `unsupported.chain` walks a hanger's support upward, and finds air on the
 *   walk rather than here.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  ATLANTEAN_BUILDING_ARCHETYPES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  atlanteanFacadeDefaults,
  generateBuilding,
  isAtlanteanArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa71a17n, "world.atlantis");
const OTHER = nodeSeed(0xa71a17n, "world.atlantis.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 16, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

/** The archetypes that write a curbed basin when the room has room for one. */
const WET = [
  "sea_oracle_rotunda",
  "pearl_diver_hall",
  "hippocamp_stable",
  "tide_gate_arch",
  "coral_garden_court",
  "salt_bath_terme",
  "moon_pool_shrine",
] as const;

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = atlanteanFacadeDefaults(archetype);
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

describe("the Atlantean pack's building registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    expect(ATLANTEAN_BUILDING_ARCHETYPES).toHaveLength(13);
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isAtlanteanArchetype(a)).toBe(true);
    }
    expect(isAtlanteanArchetype("cottage")).toBe(false);
    expect(isAtlanteanArchetype("rotunda")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["tidal_palace"])).toBe("tidal_palace");
    expect(archetypeOfTags(["atlantean_palace"])).toBe("tidal_palace");
    expect(archetypeOfTags(["sunken_palace"])).toBe("tidal_palace");
    expect(archetypeOfTags(["trident_temple"])).toBe("trident_temple");
    expect(archetypeOfTags(["poseidon_temple"])).toBe("trident_temple");
    expect(archetypeOfTags(["sea_oracle_rotunda"])).toBe("sea_oracle_rotunda");
    expect(archetypeOfTags(["sea_oracle"])).toBe("sea_oracle_rotunda");
    expect(archetypeOfTags(["oracle_rotunda"])).toBe("sea_oracle_rotunda");
    expect(archetypeOfTags(["conch_amphitheater"])).toBe("conch_amphitheater");
    expect(archetypeOfTags(["conch_theater"])).toBe("conch_amphitheater");
    expect(archetypeOfTags(["shell_amphitheater"])).toBe("conch_amphitheater");
    expect(archetypeOfTags(["pearl_diver_hall"])).toBe("pearl_diver_hall");
    expect(archetypeOfTags(["pearl_hall"])).toBe("pearl_diver_hall");
    expect(archetypeOfTags(["hippocamp_stable"])).toBe("hippocamp_stable");
    expect(archetypeOfTags(["seahorse_stable"])).toBe("hippocamp_stable");
    expect(archetypeOfTags(["tide_gate_arch"])).toBe("tide_gate_arch");
    expect(archetypeOfTags(["tidal_arch"])).toBe("tide_gate_arch");
    expect(archetypeOfTags(["coral_garden_court"])).toBe("coral_garden_court");
    expect(archetypeOfTags(["coral_court"])).toBe("coral_garden_court");
    expect(archetypeOfTags(["navigator_academy"])).toBe("navigator_academy");
    expect(archetypeOfTags(["star_chart_hall"])).toBe("navigator_academy");
    expect(archetypeOfTags(["salt_bath_terme"])).toBe("salt_bath_terme");
    expect(archetypeOfTags(["terme"])).toBe("salt_bath_terme");
    expect(archetypeOfTags(["drowned_archive"])).toBe("drowned_archive");
    expect(archetypeOfTags(["tide_library"])).toBe("drowned_archive");
    expect(archetypeOfTags(["tide_bell_tower"])).toBe("tide_bell_tower");
    expect(archetypeOfTags(["sea_bell_tower"])).toBe("tide_bell_tower");
    expect(archetypeOfTags(["moon_pool_shrine"])).toBe("moon_pool_shrine");
    expect(archetypeOfTags(["moon_pool"])).toBe("moon_pool_shrine");

    // **The negative sweep.** Every one of these belongs to an older table and
    // this pack must not have moved a single one of them. This is the longest
    // such list any pack has shipped, and it is longest because the white-stone
    // vocabulary was already spoken for twice over.
    expect(archetypeOfTags(["rotunda"])).toBe("tholos");
    expect(archetypeOfTags(["amphitheater"])).toBe("amphitheater");
    expect(archetypeOfTags(["arena"])).toBe("arena");
    expect(archetypeOfTags(["archive"])).toBe("library");
    expect(archetypeOfTags(["colossus"])).toBe("colossus");
    for (const bare of [
      "palace",
      "temple",
      "shrine",
      "chapel",
      "theater",
      "theatre",
      "amphitheatre",
      "stadium",
      "hall",
      "great_hall",
      "stable",
      "stables",
      "paddock",
      "pegasus_stable",
      "gate",
      "gatehouse",
      "arch",
      "triumphal_arch",
      "memorial_arch",
      "court",
      "courtyard",
      "garden",
      "academy",
      "school",
      "university",
      "library",
      "bathhouse",
      "baths",
      "bell_tower",
      "belfry",
      "campanile",
      "watchtower",
      "tower",
      "lookout",
      "pool",
      "swimming_pool",
      "scrying_pool",
      "moon_gate",
      "statue",
      "altar",
      "fountain",
    ]) {
      for (const mine of ATLANTEAN_BUILDING_ARCHETYPES) {
        expect(archetypeOfTags([bare]), `${bare} → ${mine}`).not.toBe(mine);
      }
    }
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      const facade = atlanteanFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(atlanteanFacadeDefaults("cottage")).toEqual({});
    // The pack's exterior argument: the oracle is round, and a risen classical
    // city terraces rather than pitches.
    expect(atlanteanFacadeDefaults("sea_oracle_rotunda").roof).toBe("hip");
    expect(atlanteanFacadeDefaults("tidal_palace").roof).toBe("flat");
    expect(atlanteanFacadeDefaults("drowned_archive").windowRhythm).toBe("none");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hypostyle_hall").windowRhythm).toBe("sparse");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
      expect(entry?.tags, a).toContain("atlantean");
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

describe("the Atlantean pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
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
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
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
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
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
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
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
    // The palace: the colonnade, the motifs and the dais.
    const palace = build("tidal_palace", BIG, { floors: 1 });
    expect(has(palace, "quartz_pillar"), "the colonnade").toBe(true);
    expect(has(palace, "sea_lantern"), "the shell motifs").toBe(true);
    expect(has(palace, "dark_prismarine"), "the motifs' surround").toBe(true);
    const dais = palace.ops.filter((op) => op.block.endsWith("_slab") && op.y === 1);
    expect(dais.length, "the dais").toBeGreaterThan(3);

    // The temple: three prongs on the head row, tied across at head height.
    const temple = build("trident_temple", BIG, { floors: 1 });
    const prongs = temple.ops.filter((op) => op.block === "quartz_pillar" && op.y === 1);
    expect(prongs.length, "the prongs").toBe(3);
    const tie = temple.ops.filter((op) => op.block === "iron_bars");
    expect(tie.length, "the tie").toBeGreaterThan(0);
    expect(
      tie.every((op) => op.y >= 3),
      "tied over head height",
    ).toBe(true);

    // The oracle: the dome, and the oculus in it.
    const oracle = build("sea_oracle_rotunda", BIG, { floors: 1 });
    const dome = oracle.ops.filter(
      (op) => op.block.startsWith("prismarine") && op.y > oracle.meta.wallTop,
    );
    expect(dome.length, "the dome").toBeGreaterThan(20);
    expect(
      oracle.ops.some((op) => op.block === "sea_lantern" && op.y > oracle.meta.wallTop),
      "the oculus",
    ).toBe(true);

    // The amphitheatre: the bank, and a floor left BARE. The whole fit-out at
    // `y = 1` is against a wall or one cell in at a corner — the middle is the
    // point of the room.
    const conch = build("conch_amphitheater", BIG, { floors: 1 });
    const bank = conch.ops.filter((op) => op.block.endsWith("_stairs") && op.y === 1);
    expect(bank.length, "the bank").toBeGreaterThan(5);
    const ci = conch.meta.interior;
    expect(
      bank.every(
        (op) => op.x === ci.x0 || op.x === ci.x1 || op.x === ci.x0 + 1 || op.x === ci.x1 - 1,
      ),
      "the bank hugs the wall, curving in only at the corners",
    ).toBe(true);

    // The divers' hall: the lines overhead, and the rinse basin.
    const divers = build("pearl_diver_hall", BIG, { floors: 1 });
    const lines = divers.ops.filter((op) => op.block === "iron_bars");
    expect(lines.length, "the dive lines").toBeGreaterThan(0);
    expect(
      lines.every((op) => op.y >= 3),
      "hung over head height",
    ).toBe(true);
    expect(has(divers, "cauldron"), "the rinse cauldrons").toBe(true);

    // The stable: dried kelp on the plinth, never on the floor.
    const stable = build("hippocamp_stable", BIG, { floors: 1 });
    const kelp = stable.ops.filter((op) => op.block === "dried_kelp_block");
    expect(kelp.length, "the fodder").toBeGreaterThan(0);
    expect(
      kelp.every((op) => op.y >= 2),
      "never on a wet floor",
    ).toBe(true);

    // The tide gate: the channel and exactly one arch bay over it.
    const gate = build("tide_gate_arch", BIG, { floors: 1 });
    expect(has(gate, "water"), "the channel").toBe(true);
    const piers = gate.ops.filter((op) => op.block === "prismarine_bricks" && op.y === 1);
    expect(piers.length, "one bay: two piers, and no more").toBe(2);

    // The coral court: dead coral, dry, standing on the kerb.
    const court = build("coral_garden_court", BIG, { floors: 1 });
    const coral = court.ops.filter((op) => op.block.includes("coral"));
    expect(coral.length, "the planting").toBeGreaterThan(0);
    for (const op of coral) {
      expect(op.block.startsWith("dead_"), `live coral: ${op.block}`).toBe(true);
      expect(op.y, "up on the kerb").toBeGreaterThanOrEqual(2);
    }

    // The academy: the charts, the armillary and the lodestone.
    const academy = build("navigator_academy", BIG, { floors: 1 });
    expect(has(academy, "bookshelf"), "the charts").toBe(true);
    expect(has(academy, "lodestone"), "the lodestone").toBe(true);
    const arm = academy.ops.filter((op) => op.block === "iron_bars");
    expect(
      arm.every((op) => op.y >= 3),
      "the armillary turns overhead",
    ).toBe(true);

    // The baths: the bath, and the brine.
    const terme = build("salt_bath_terme", BIG, { floors: 1 });
    expect(has(terme, "water"), "the bath").toBe(true);
    expect(has(terme, "cauldron"), "the brine").toBe(true);

    // The archive: the books, the tide line — and NOT ONE CELL OF WATER.
    const archive = build("drowned_archive", BIG, { floors: 1 });
    expect(has(archive, "bookshelf"), "the books").toBe(true);
    const line = archive.ops.filter((op) => op.block === "dark_prismarine" && op.y === 2);
    expect(line.length, "the tide line").toBeGreaterThan(0);
    expect(has(archive, "cobweb"), "the web").toBe(true);
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        expect(
          has(build("drowned_archive", size, { floors }), "water"),
          `the archive is dry: ${size.join("x")} f=${floors}`,
        ).toBe(false);
      }
    }

    // The bell tower: a bell, always.
    const bell = build("tide_bell_tower", BIG, { floors: 1 });
    expect(has(bell, "bell"), "the bell").toBe(true);
    expect(has(bell, "iron_chain"), "the chain").toBe(true);

    // The moon pool: the pool, and the four posts of the light well.
    const moon = build("moon_pool_shrine", BIG, { floors: 1 });
    expect(has(moon, "water"), "the pool").toBe(true);
    expect(has(moon, "quartz_pillar"), "the light well").toBe(true);
  });

  /**
   * **The dome is a filled mass, and only the oracle has one.**
   *
   * Every course of it is a filled disc standing on the filled disc below it; a
   * dome written as a ring per course leaves its outermost cells with air below
   * and beside them, which is `floating.isolated` in its oldest clothes. The
   * check that catches that is the theme sweep at the end of this file — this
   * one pins the *positive* claim, that the oracle is the only building in the
   * pack that touches a cell above the eave plate.
   */
  it("rebuilds a dome over the oracle, and over nothing else", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      const result = build(a, BIG, { floors: 1 });
      const domed = a === "sea_oracle_rotunda";
      const sea = result.ops.filter(
        (op) => op.block.startsWith("prismarine") && op.y > result.meta.wallTop,
      );
      expect(sea.length > 0, `${a} dome`).toBe(domed);
    }
  });

  it("hangs no sign, uses no `chain`, plants no bare pot, lays no mud", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
        expect(op.block, `${a} chain`).not.toBe("chain");
        expect(op.block, `${a} pot`).not.toBe("flower_pot");
        expect(op.block, `${a} mud`).not.toBe("mud");
        expect(op.block, `${a} farmland`).not.toBe("farmland");
        expect(op.block, `${a} campfire`).not.toBe("campfire");
        expect(op.block, `${a} fire`).not.toBe("fire");
        expect(op.props?.["lit"], `${a} lit ${op.block}`).not.toBe("true");
      }
    }
  });

  it("plants no live coral anywhere in the pack", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const op of build(a, size).ops) {
          if (!op.block.includes("coral")) continue;
          expect(op.block.startsWith("dead_"), `${a}: live ${op.block}`).toBe(true);
        }
      }
    }
  }, 30_000);

  /**
   * **Every lantern in the finished building still has its support.**
   *
   * The lint's lantern rule fires on any block whose name ends `lantern` —
   * which in this pack means `sea_lantern`, a full cube — and wants a solid
   * floor under it or something to hang from over it. The claim worth asserting
   * is not "we placed none", it is that **we did not strand one**: the dome
   * rebuild deletes and re-lays the whole volume over the ceiling plane the
   * shell hangs from, which is exactly how `unsupported.lantern` gets found on
   * the walk instead of here.
   */
  it("strands no lantern, its own or the shell's", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
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
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
    }
  });

  /** The `floating.isolated` rule, run over the finished op set, every theme. */
  it("leaves nothing it writes with air on every side, in every theme", () => {
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
      for (const theme of ALL_MATERIAL_THEMES) {
        for (const size of SIZES) {
          const seed = nodeSeed(0xa71a17n, `world.atlantis.${a}.${theme.id}.${size.join("x")}`);
          const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
          const facade = atlanteanFacadeDefaults(a);
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

describe("the Atlantean pack's pools", () => {
  /**
   * **Every water cell this pack writes is closed on every side.**
   *
   * The predicate, in full, and it is the one the water-works closure argument
   * taught this project to write down rather than to hope for:
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
    for (const a of ATLANTEAN_BUILDING_ARCHETYPES) {
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
/* BELL-CHAIN CLOSURE                                                          */
/* -------------------------------------------------------------------------- */

describe("the tide bell's hang", () => {
  /**
   * **`iron_chain`, and everything in the stack has something over it.**
   *
   * `chain` is not in the pinned 1.21.11 block table — that is the rename
   * lesson, and this building exists partly to say it out loud. The closure is
   * top-down: a cap course, the chain under it, the bell under the chain.
   * `unsupported.chain` walks a hanger's support upward and fails it the moment
   * the cell above is air.
   */
  it("hangs the bell on `iron_chain`, with nothing in the stack over air", () => {
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        const result = build("tide_bell_tower", size, { floors });
        const at = indexOf(result.ops);
        const label = `${size.join("x")} f=${floors}`;

        // There is a bell, on every envelope, always. A bell tower with no bell
        // in it is not a shorter bell tower, it is a mistake.
        const bells = result.ops.filter((op) => op.block === "bell");
        expect(bells.length, `${label}: the bell`).toBeGreaterThan(0);

        for (const op of result.ops) {
          expect(op.block, `${label}: chain`).not.toBe("chain");
          if (op.block !== "iron_chain") continue;
          const over = at.get(`${op.x},${op.y + 1},${op.z}`)?.block;
          expect(
            over !== undefined && over !== "air",
            `${label}: chain at ${op.x},${op.y},${op.z} hangs from ${over}`,
          ).toBe(true);
        }

        for (const bell of bells) {
          if (bell.props?.["attachment"] === "floor") {
            const under = at.get(`${bell.x},${bell.y - 1},${bell.z}`)?.block;
            expect(
              under === undefined || under !== "air",
              `${label}: standing bell over ${under}`,
            ).toBe(true);
            continue;
          }
          expect(bell.props?.["attachment"], `${label}: how the bell hangs`).toBe("ceiling");
          // The physics lint demands a FULL CUBE at y+1 for attachment=ceiling
          // — iron_chain is not one, which was this pack's one dormant defect
          // (exposed by the first exhibit tower tall enough to hang, fixed
          // 2026-08-17). The bell hangs on the solid cap; the chain is the
          // pull-rope one column toward the head wall, itself closed top-down.
          const over = at.get(`${bell.x},${bell.y + 1},${bell.z}`)?.block;
          expect(
            over !== undefined && over !== "air" && over !== "iron_chain",
            `${label}: the bell hangs on a full cube, got ${over}`,
          ).toBe(true);
        }
      }
    }
  });
});
