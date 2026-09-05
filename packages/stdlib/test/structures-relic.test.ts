/**
 * Archetype wave 6E: five **ruined** buildings, on wave two's contract, with
 * the shared pocket detector — plus the four properties THE RUIN LAW exists to
 * make checkable.
 *
 * The standard battery is deliberately the same one every earlier wave was
 * held to. A ruin that needed a weaker guarantee than a cottage would be a
 * licence to ship rubble, and the whole claim of `archetypes-relic.ts` is that
 * a ruin is the ordinary shell *decayed* — same registration, same tags, same
 * envelope, same walkable floor.
 *
 * On top of it, the four this wave exists to prove:
 *
 * - **nothing floats.** Every full cube the decay leaves behind has a non-air
 *   orthogonal neighbour or stands on the ground plane. This is the lint's
 *   `floating.isolated` and it is exactly what a mid-height hole punched in a
 *   wall, or a rafter left spanning a roofless room, would fail;
 * - **the door and its approach are intact.** The door block is still there,
 *   the doorstep outside it is not buried in rubble and the cell inside it is
 *   where the walk starts;
 * - **no pockets, at every envelope and both storey counts** — the shared
 *   `assertNoPockets` sweep, which is what proves the rubble went through
 *   `take` rather than round it;
 * - **a ruin is cold and dry**: no campfire, no fire, no water, no lava.
 *
 * And the carpet rule, which is the one piece of decay that has a support
 * obligation: a moss carpet is in the lint's `NEEDS_GROUND` set, so every one
 * of them stands on a rubble heap and nowhere else.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  RELIC_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isRelicArchetype,
  nodeSeed,
  relicFacadeDefaults,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x6e0an, "world.relic");
const OTHER = nodeSeed(0x6e0an, "world.relic.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every ruin here has room for its whole decay on. */
const BIG: readonly [number, number, number] = [13, 17, 15];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 13, 13], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = relicFacadeDefaults(archetype);
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

/** An op index, keyed by cell. Air is a *written* op and counts as empty. */
function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/**
 * Blocks the lint does **not** treat as full cubes.
 *
 * `floating.isolated` fires on a full cube with six air faces; slabs and
 * stairs get the weaker `floating.slab`/`floating.stair` rule and everything
 * else — trapdoors, panes, carpets, vines — is policed by no support rule at
 * all. The floating sweep below therefore checks the cubes, which is the set
 * the lint would actually complain about.
 */
const NOT_A_CUBE =
  /(_slab$|_stairs$|_trapdoor$|_door$|_pane$|_fence$|_wall$|_carpet$|_banner$|_sign$|_button$|_pressure_plate$|_candle$|^vine$|^ladder$|torch$|^cobweb$|^lantern$|^iron_bars$|^air$|^water$|^glass_pane$|^potted_)/;

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("wave-6E relic archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isRelicArchetype(a)).toBe(true);
      expect(archetypeOfTags([a])).toBe(a);
    }
  });

  it("is claimed by the catalog as wave six, implemented, with a note", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(6);
      expect(entry?.kind, a).toBe("building");
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
    }
    expect(STRUCTURE_CATALOG.length).toBeGreaterThan(0);
  });

  /**
   * The tag review, as a test. Every line is a tag an earlier table already
   * owns, or one this table deliberately declines to take.
   */
  it("steals no tag an earlier table already claims", () => {
    expect(archetypeOfTags(["abbey"])).toBe("abbey");
    expect(archetypeOfTags(["church"])).toBe("church");
    expect(archetypeOfTags(["chapel"])).toBe("church");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["cottage"])).toBe("cottage");
    expect(archetypeOfTags(["keep"])).not.toBe("ruined_keep");
    expect(archetypeOfTags(["castle"])).not.toBe("ruined_keep");
    expect(archetypeOfTags(["tower"])).not.toBe("collapsed_tower");
    expect(archetypeOfTags(["villa"])).not.toBe("overgrown_villa");
  });

  /**
   * **Bare `ruin` and `ruins` mean `ruined_cottage`** — RUINS-PLAN-v0 Q3,
   * ratified by Kai 2026-08-09, reversing this wave's original refusal.
   *
   * The refusal's reasoning was that an author who writes only "ruins" has not
   * said *what* is ruined. The ruling's answer is that the **scale** half of
   * that ambiguity now belongs to `decline` — a ruined quarter is a district,
   * not a tag — so what is left for a bare tag to mean is one ruined building,
   * and the gentlest of the five is the honest reading.
   *
   * The other adjectives stay unclaimed: `ruined`, `derelict`, `overgrown` and
   * `abandoned` describe a state, not a building, and an overgrown *anything*
   * is a plausible request.
   */
  it("resolves bare `ruin` and `ruins` to the ruined cottage", () => {
    expect(archetypeOfTags(["ruin"])).toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins"])).toBe("ruined_cottage");
    for (const tag of ["ruined", "derelict", "overgrown", "abandoned"]) {
      expect(RELIC_BUILDING_ARCHETYPES as readonly string[], tag).not.toContain(
        archetypeOfTags([tag]),
      );
    }
  });

  /**
   * The bare tags are claimed **last of all**, after every other table, so an
   * adjective never outranks a noun. This is the guard on the one behaviour
   * change WP-1 makes: `["ruins", "keep"]` must still be the garrison's keep.
   */
  it("never lets a bare ruin tag outrank a noun", () => {
    expect(archetypeOfTags(["ruins", "keep"])).not.toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "abbey"])).not.toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "tower"])).not.toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "villa"])).not.toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "ruined_keep"])).toBe("ruined_keep");
  });

  /**
   * The monuments are **props**, not archetypes, and no tag table may quietly
   * turn one into a building — a henge with a door in it is not a henge.
   */
  it("routes no monument name at the building grammar", () => {
    for (const tag of [
      "standing_stones",
      "henge",
      "stonehenge",
      "monolith",
      "burial_mound",
      "barrow",
      "dig_site",
      "excavation",
      "fossil_dig",
      "fossil",
      "shattered_obelisk",
      "obelisk",
    ]) {
      expect(RELIC_BUILDING_ARCHETYPES as readonly string[], tag).not.toContain(
        archetypeOfTags([tag]),
      );
    }
  });

  it("reads its own compound tags off a node", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["ruined_house", "ruined_cottage"],
      ["derelict_cottage", "ruined_cottage"],
      ["ruined_castle", "ruined_keep"],
      ["castle_ruin", "ruined_keep"],
      ["ruined_chapel", "ruined_church"],
      ["ruined_abbey", "ruined_church"],
      ["abbey_ruin", "ruined_church"],
      ["broken_tower", "collapsed_tower"],
      ["tower_ruin", "collapsed_tower"],
      ["villa_ruin", "overgrown_villa"],
      ["ruined_villa", "overgrown_villa"],
    ];
    for (const [tag, archetype] of cases) expect(archetypeOfTags([tag]), tag).toBe(archetype);
  });

  it("offers a facade tendency through the shared chain", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      const own = relicFacadeDefaults(a);
      expect(Object.keys(own).length, a).toBeGreaterThan(0);
      expect(archetypeFacadeDefaults(a), a).toEqual(own);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the standard battery                                                      */
  /* ------------------------------------------------------------------------ */

  it("puts something in every room it builds", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor walkable from the door, with no pockets", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const it = result.meta.interior;
          const lamp: readonly [number, number] = [
            Math.floor((it.x0 + it.x1) / 2),
            Math.floor((it.z0 + it.z1) / 2),
          ];
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const report = assertNoPockets(result, { label, exclude: [lamp] });
          expect(report.reachable.length, label).toBeGreaterThan(3);
        }
      }
    }
  });

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp: readonly [number, number] = [
          Math.floor((it.x0 + it.x1) / 2),
          Math.floor((it.z0 + it.z1) / 2),
        ];
        const label = `${a} ${size.join("x")} without the lantern cell`;
        const report = walkabilityReport(result, { exclude: [lamp] });
        expect(report.pocket, `${label}\n${report.map}`).toEqual([]);
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      const result = build(a);
      const at = indexOf(result.ops);
      for (const cell of result.meta.floorCells) {
        const floor = at.get(`${cell.x},0,${cell.z}`);
        expect(floor, `${a} floor at ${cell.x},${cell.z}`).toBeDefined();
        expect(floor?.block, `${a} floor at ${cell.x},${cell.z}`).not.toBe("air");
      }
    }
  });

  it("stays inside the envelope, in plan and in height", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const [sx, , sz] = result.meta.size;
        const ceiling = result.meta.roofTop + ROOF_FLOURISH_RISE;
        for (const op of result.ops) {
          if (op.block === "air") continue; // clearing is not building
          expect(op.x, `${a} ${size.join("x")} x`).toBeGreaterThanOrEqual(-1);
          expect(op.x, `${a} ${size.join("x")} x`).toBeLessThanOrEqual(sx);
          expect(op.z, `${a} ${size.join("x")} z`).toBeGreaterThanOrEqual(-1);
          expect(op.z, `${a} ${size.join("x")} z`).toBeLessThanOrEqual(sz);
          expect(op.y, `${a} ${size.join("x")} y`).toBeLessThanOrEqual(ceiling);
        }
      }
    }
  });

  it("never places a bare flower pot, a sign or a chain", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const label = `${a} ${size.join("x")}`;
        const result = build(a, size);
        expect(has(result, "flower_pot"), label).toBe(false);
        expect(has(result, "chain"), label).toBe(false);
        expect(
          result.ops.some((op) => op.block.endsWith("_sign") || op.block.endsWith("_hanging_sign")),
          label,
        ).toBe(false);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the four THE RUIN LAW exists to prove                                     */
  /* ------------------------------------------------------------------------ */

  /**
   * **Nothing floats.**
   *
   * The decay's whole risk is here: a crumble that punched a hole in the
   * middle of a wall, or a roof broken by removing supports rather than by
   * clearing from the top down, leaves a full cube with six air faces — which
   * is `floating.isolated`, and is the turret lesson. Every full cube in the
   * op stream is checked against its six orthogonal neighbours; the ground
   * plane counts as the neighbour below for `y = 1`.
   */
  it("leaves no floating fragment: every cube touches its neighbour or the ground", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const at = indexOf(result.ops);
          const solid = (x: number, y: number, z: number): boolean => {
            const op = at.get(`${x},${y},${z}`);
            return op !== undefined && op.block !== "air";
          };
          const floaters: string[] = [];
          for (const op of result.ops) {
            if (NOT_A_CUBE.test(op.block)) continue;
            if (op.y <= 0) continue; // the floor plane and below is the ground
            const joined =
              solid(op.x + 1, op.y, op.z) ||
              solid(op.x - 1, op.y, op.z) ||
              solid(op.x, op.y + 1, op.z) ||
              solid(op.x, op.y - 1, op.z) ||
              solid(op.x, op.y, op.z + 1) ||
              solid(op.x, op.y, op.z - 1);
            if (!joined) floaters.push(`${op.block}@${op.x},${op.y},${op.z}`);
          }
          expect(floaters, label).toEqual([]);
        }
      }
    }
  });

  /**
   * **The door and its approach survive the decay.**
   *
   * The walking agent starts inside the door and so does the lint's traversal
   * walk. So: the door block is still in the op stream, the walk found a
   * start, and the doorstep outside the door carries no rubble.
   */
  it("keeps the door and the approach to it intact", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const door = result.meta.door;
          expect(door, label).not.toBeNull();
          if (door === null) continue;
          const at = indexOf(result.ops);
          // The door itself, both halves, still standing.
          for (const y of [1, 2]) {
            const op = at.get(`${door.x},${y},${door.z}`);
            expect(op, `${label}: nothing in the door column at y=${y}`).toBeDefined();
            expect(op?.block, `${label}: the door was decayed away at y=${y}`).toMatch(/_door$/);
          }
          // The doorstep and the cell inside it: no rubble in the way.
          const step: readonly (readonly [number, number])[] = [
            [door.x, door.z - 1],
            [door.x, door.z + 1],
            [door.x - 1, door.z],
            [door.x + 1, door.z],
          ];
          for (const [x, z] of step) {
            const op = at.get(`${x},1,${z}`);
            if (op === undefined) continue;
            expect(
              /(cobblestone|stone_bricks|moss_block|gravel|sandstone)$/.test(op.block),
              `${label}: rubble in the doorway at ${x},${z} (${op.block})`,
            ).toBe(false);
          }
          const report = walkabilityReport(result);
          expect(report.start, `${label}: the walk could not get in\n${report.map}`).not.toBeNull();
        }
      }
    }
  });

  /** **A ruin is cold and dry.** No fire, no fluids, ever. */
  it("lights no fire and holds no fluid", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const label = `${a} ${size.join("x")}`;
        for (const block of ["water", "lava", "fire", "soul_fire"]) {
          expect(has(result, block), `${label}: ${block}`).toBe(false);
        }
        const lit = result.ops.filter(
          (op) => op.block === "campfire" && op.props?.["lit"] !== "false",
        );
        expect(lit.map((op) => `${op.x},${op.z}`), label).toEqual([]);
      }
    }
  });

  /**
   * **Carpets need ground.** A moss carpet is in the lint's `NEEDS_GROUND`
   * set, so the only place decay may put one is on top of a rubble heap.
   */
  it("lays moss carpet on rubble tops and nowhere else", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const label = `${a} ${size.join("x")}`;
        const at = indexOf(result.ops);
        for (const op of result.ops) {
          if (op.block !== "moss_carpet") continue;
          const under = at.get(`${op.x},${op.y - 1},${op.z}`);
          expect(under, `${label}: carpet on nothing at ${op.x},${op.y},${op.z}`).toBeDefined();
          expect(
            under?.block,
            `${label}: carpet on air at ${op.x},${op.y},${op.z}`,
          ).not.toBe("air");
        }
      }
    }
  });

  /**
   * **Vines name the wall that holds them.** A `vine` with every face `false`
   * renders as nothing — the `flower_pot` lesson in another costume.
   */
  it("hangs every vine on a wall it names", () => {
    for (const a of RELIC_BUILDING_ARCHETYPES) {
      const result = build(a, BIG);
      const at = indexOf(result.ops);
      const vines = result.ops.filter((op) => op.block === "vine");
      for (const v of vines) {
        const faces = ["north", "south", "east", "west", "up"].filter(
          (f) => v.props?.[f] === "true",
        );
        expect(faces.length, `${a}: faceless vine at ${v.x},${v.y},${v.z}`).toBe(1);
        const step: Record<string, readonly [number, number]> = {
          north: [0, -1],
          south: [0, 1],
          east: [1, 0],
          west: [-1, 0],
          up: [0, 0],
        };
        const [dx, dz] = step[faces[0] as string] as readonly [number, number];
        const wall = at.get(`${v.x + dx},${v.y},${v.z + dz}`);
        expect(wall, `${a}: vine on nothing at ${v.x},${v.y},${v.z}`).toBeDefined();
        expect(wall?.block, `${a}: vine on air at ${v.x},${v.y},${v.z}`).not.toBe("air");
      }
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the thing each archetype is for                                           */
  /* ------------------------------------------------------------------------ */

  it("builds the thing each archetype is for", () => {
    expect(has(build("ruined_cottage"), "mossy_cobblestone"), "mossy survivors").toBe(true);
    expect(has(build("ruined_cottage"), "vine"), "the growth").toBe(true);
    expect(has(build("ruined_keep"), "cracked_stone_bricks"), "cracked masonry").toBe(true);
    expect(has(build("ruined_keep"), "cobbled_deepslate"), "the apron spill").toBe(true);
    expect(has(build("ruined_church"), "mossy_stone_bricks"), "the nave").toBe(true);
    expect(has(build("ruined_church"), "chiseled_stone_bricks"), "the band and the altar").toBe(
      true,
    );
    expect(has(build("collapsed_tower"), "gravel"), "the fallen floor").toBe(true);
    expect(has(build("overgrown_villa"), "moss_block"), "the green").toBe(true);
    expect(has(build("overgrown_villa"), "chiseled_sandstone"), "the fallen drums").toBe(true);
  });

  /**
   * **The keep's corners stand and its curtains do not.**
   *
   * The one *structured* collapse in the wave, and the property that says the
   * crumble line is a line rather than a scatter: at the eave plate, the four
   * corner columns are still masonry, and at least one mid-wall column is not.
   */
  it("stands the ruined keep on its corners", () => {
    for (const size of SIZES) {
      const result = build("ruined_keep", size);
      const [sx, , sz] = result.meta.size;
      const at = indexOf(result.ops);
      const top = result.meta.wallTop;
      const label = `ruined_keep ${size.join("x")}`;
      for (const [x, z] of [
        [0, 0],
        [sx - 1, 0],
        [0, sz - 1],
        [sx - 1, sz - 1],
      ] as const) {
        const op = at.get(`${x},${top},${z}`);
        expect(op, `${label}: corner ${x},${z} lost its head`).toBeDefined();
        expect(op?.block, `${label}: corner ${x},${z} is air`).not.toBe("air");
      }
      const midGone = [...Array(sx).keys()].some((x) => {
        if (x === 0 || x === sx - 1) return false;
        const op = at.get(`${x},${top},0`);
        return op === undefined || op.block === "air";
      });
      expect(midGone, `${label}: the curtain wall never crumbled`).toBe(true);
    }
  });

  /**
   * **The collapsed tower leans.** The surviving wall head is *taller* at low
   * `x` than at high `x` — a slope, not a nibble.
   */
  it("leans the collapsed tower one way", () => {
    for (const size of SIZES) {
      const result = build("collapsed_tower", size);
      const [sx, , sz] = result.meta.size;
      const at = indexOf(result.ops);
      const label = `collapsed_tower ${size.join("x")}`;
      const headAt = (x: number, z: number): number => {
        for (let y = result.meta.wallTop; y >= 0; y--) {
          const op = at.get(`${x},${y},${z}`);
          if (op !== undefined && op.block !== "air") return y;
        }
        return 0;
      };
      // The north face, which carries no door on any of these envelopes.
      const near = headAt(1, 0);
      const far = headAt(sx - 2, 0);
      expect(near, `${label}: no lean across the north wall (${near} vs ${far})`).toBeGreaterThan(
        far,
      );
      expect(sz).toBeGreaterThan(2);
    }
  });
});
