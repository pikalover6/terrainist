/**
 * Archetype wave five A: twelve military buildings and outposts, held to the
 * earlier waves' contract.
 *
 * The tests are deliberately the *same* tests the earlier waves were held to,
 * because a new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and the two near misses that matter,
 *   `castle` → the keep and `gate`/`barbican` → the gatehouse, are asserted;
 * - it puts something in the room it built, and the room stays walkable **from
 *   the door** — the shared detector, across one and two storeys and three
 *   envelope sizes, plus the lantern-column variant;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the same seed gives the same ops, forever.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  GARRISON_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  garrisonFacadeDefaults,
  generateBuilding,
  isGarrisonArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x6a2215012n, "world.garrison");
const OTHER = nodeSeed(0x6a2215012n, "world.garrison.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 17, 19];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 13, 15], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = garrisonFacadeDefaults(archetype);
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

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("garrison archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isGarrisonArchetype(a)).toBe(true);
    }
    expect(isGarrisonArchetype("cottage")).toBe(false);
    expect(isGarrisonArchetype("keep")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["fortress"])).toBe("castle");
    expect(archetypeOfTags(["stronghold"])).toBe("castle");
    expect(archetypeOfTags(["outer_gate"])).toBe("barbican");
    expect(archetypeOfTags(["gateworks"])).toBe("barbican");
    expect(archetypeOfTags(["bastion"])).toBe("bastion");
    expect(archetypeOfTags(["armory"])).toBe("armory");
    expect(archetypeOfTags(["armoury"])).toBe("armory");
    expect(archetypeOfTags(["arsenal"])).toBe("arsenal");
    expect(archetypeOfTags(["bunker"])).toBe("bunker");
    expect(archetypeOfTags(["pillbox"])).toBe("pillbox");
    expect(archetypeOfTags(["guard_post"])).toBe("guard_post");
    expect(archetypeOfTags(["sentry_post"])).toBe("guard_post");
    expect(archetypeOfTags(["checkpoint"])).toBe("checkpoint");
    expect(archetypeOfTags(["beacon_tower"])).toBe("beacon_tower");
    expect(archetypeOfTags(["gravedigger_hut"])).toBe("gravedigger_hut");
    expect(archetypeOfTags(["gravedigger"])).toBe("gravedigger_hut");
    expect(archetypeOfTags(["shepherds_bothy"])).toBe("shepherds_bothy");
    expect(archetypeOfTags(["bothy"])).toBe("shepherds_bothy");
  });

  /**
   * The near misses, stated as the tags this wave deliberately did **not**
   * reach for. The first two are the ones that shaped its vocabulary.
   */
  it("leaves the tags the earlier tables already claim", () => {
    // The breadth keep keeps the obvious four.
    expect(archetypeOfTags(["castle"])).toBe("keep");
    expect(archetypeOfTags(["citadel"])).toBe("keep");
    expect(archetypeOfTags(["keep"])).toBe("keep");
    expect(archetypeOfTags(["donjon"])).toBe("keep");
    // The gatehouse claimed `barbican` in wave three and keeps it.
    expect(archetypeOfTags(["gate"])).toBe("gatehouse");
    expect(archetypeOfTags(["gatehouse"])).toBe("gatehouse");
    expect(archetypeOfTags(["barbican"])).toBe("gatehouse");
    // The barracks keeps `garrison`, and the watchtower `tower`.
    expect(archetypeOfTags(["garrison"])).toBe("barracks");
    expect(archetypeOfTags(["barracks"])).toBe("barracks");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    // `hut` is the residential track's and `house` still falls to a cottage.
    expect(archetypeOfTags(["hut"])).toBe("hut");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      const facade = garrisonFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(garrisonFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("hut").roof).toBe("gable");
    expect(archetypeFacadeDefaults("igloo").roof).toBe("hip");
  });

  it("is claimed by the catalog, and stamped as wave five", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(5);
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
    // The two outbuildings keep the categories they were catalogued under.
    expect(structureById("gravedigger_hut")?.category).toBe("memorial");
    expect(structureById("shepherds_bothy")?.category).toBe("residential");
    expect(structureById("castle")?.category).toBe("military");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("garrison buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  /**
   * The shared detector, not a private 4-connectivity harness: it walks a 1x2
   * body from the cell inside the front door, so head-height blocks, stair
   * mounts and drops are all modelled, and a region connected to itself but
   * not to the way in fails.
   */
  it("leaves every ground floor walkable from the door, with no pockets", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const report = assertNoPockets(result, { label });
          expect(report.reachable.length, label).toBeGreaterThan(3);
        }
      }
    }
  });

  /**
   * The lantern lesson, as a property: deleting the column the shell hangs its
   * light in must leave the rest of the floor reachable.
   */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
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
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
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
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
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

  it("builds the thing each archetype is for", () => {
    expect(has(build("castle"), "red_wall_banner"), "the heraldry").toBe(true);
    expect(has(build("castle"), "anvil"), "the armoury corner").toBe(true);
    expect(has(build("barbican"), "stone_brick_stairs"), "the arch and machicolation").toBe(true);
    expect(has(build("barbican"), "cauldron"), "the guard room").toBe(true);
    expect(has(build("bastion"), "barrel"), "the powder store").toBe(true);
    expect(has(build("armory"), "smithing_table"), "the smith's corner").toBe(true);
    expect(has(build("armory"), "iron_block"), "the armour read").toBe(true);
    expect(has(build("arsenal"), "iron_bars"), "the barred partition").toBe(true);
    expect(has(build("arsenal"), "barrel"), "the powder store").toBe(true);
    expect(has(build("bunker"), "gray_concrete"), "the concrete re-clad").toBe(true);
    expect(has(build("bunker"), "gray_bed"), "the cot corner").toBe(true);
    expect(has(build("pillbox"), "gray_concrete"), "the concrete re-clad").toBe(true);
    expect(has(build("pillbox"), "iron_block"), "the mount").toBe(true);
    expect(has(build("guard_post"), "bell"), "the alarm bell").toBe(true);
    expect(has(build("guard_post"), "campfire"), "the brazier").toBe(true);
    expect(has(build("checkpoint"), "lantern"), "the lantern posts").toBe(true);
    expect(has(build("checkpoint"), "lectern"), "the register").toBe(true);
    expect(has(build("beacon_tower"), "orange_wall_banner"), "the signal banners").toBe(true);
    expect(has(build("beacon_tower"), "campfire"), "the fire basket").toBe(true);
    expect(has(build("gravedigger_hut"), "composter"), "the lime store").toBe(true);
    expect(has(build("gravedigger_hut"), "lantern"), "the comfort").toBe(true);
    expect(has(build("shepherds_bothy"), "white_wool"), "the fleece bales").toBe(true);
    expect(has(build("shepherds_bothy"), "white_bed"), "the cot").toBe(true);
  });

  /**
   * The beacon's fire basket, as a measurement: it stands on something solid,
   * it is at the middle of the plan, and it is inside the height budget.
   */
  it("stands the beacon's fire on a solid pedestal inside the budget", () => {
    const result = build("beacon_tower", [11, 19, 11]);
    const at = indexOf(result.ops);
    const fires = result.ops.filter(
      (op) => op.block === "campfire" && op.props?.["signal_fire"] === "true",
    );
    expect(fires.length).toBe(1);
    const fire = fires[0] as LocalVoxelOp;
    expect(fire.y).toBeLessThanOrEqual(result.meta.roofTop + ROOF_FLOURISH_RISE);
    const under = at.get(`${fire.x},${fire.y - 1},${fire.z}`);
    expect(under, "the pedestal").toBeDefined();
    expect(under?.block).not.toBe("air");
    // Nothing clipped over it.
    const over = at.get(`${fire.x},${fire.y + 1},${fire.z}`);
    expect(over === undefined || over.block === "air", "clear above the fire").toBe(true);
  });

  /**
   * The checkpoint's doorstep, as a property: the barrier arm may not stand on
   * the cell a player opens the door from, which is where the lint's walk
   * starts.
   */
  it("never lays the checkpoint's barrier over its own doorstep", () => {
    for (const size of SIZES) {
      const result = build("checkpoint", size);
      const door = result.meta.door;
      expect(door, `${size.join("x")} door`).not.toBeNull();
      const report = walkabilityReport(result);
      expect(report.start, `${size.join("x")} has a way in`).not.toBeNull();
    }
  });

  /**
   * The seat rule, checked geometrically rather than by block name.
   *
   * A stair's `facing` names its **high half** — the backrest. A seat standing
   * on a wall row therefore never faces *into* the room, or the sitter has
   * their back to it.
   */
  it("turns a seat's backrest to the wall it stands on", () => {
    for (const a of ["armory", "arsenal", "castle", "shepherds_bothy"]) {
      const result = build(a, [15, 15, 19]);
      const it = result.meta.interior;
      const seats = result.ops.filter(
        (op) =>
          op.y === 1 &&
          op.block.endsWith("_stairs") &&
          op.props?.["half"] === "bottom" &&
          (op.x === it.x0 || op.x === it.x1),
      );
      for (const seat of seats) {
        expect(seat.props?.["facing"], `${a} seat at ${seat.x},${seat.z}`).not.toBe(
          seat.x === it.x0 ? "east" : "west",
        );
      }
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks, and no `chain`: the 1.21.11 table has no entry for one. */
  it("never places a sign or a chain", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(
          result.ops.some((op) => op.block.endsWith("_sign")),
          `${a} ${size.join("x")} sign`,
        ).toBe(false);
        expect(
          result.ops.some((op) => op.block === "chain"),
          `${a} ${size.join("x")} chain`,
        ).toBe(false);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of GARRISON_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});
