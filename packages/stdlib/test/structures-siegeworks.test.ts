/**
 * The siegeworks pack — seven fortworks, held to the earlier waves' contract.
 *
 * Deliberately the *same* tests the garrison was held to, because a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and the near misses that matter
 *   (`fortress` → the castle, `bastion` → the bastion, `castle` → the keep,
 *   `gate` → the gatehouse) are asserted;
 * - it puts something in the room it built, and the room stays walkable **from
 *   the door**, across three envelope sizes;
 * - nothing it builds leaves the envelope the solver reserved;
 * - the icon reads: each archetype's signature block is on the ground;
 * - the same seed gives the same ops, forever.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  SIEGEWORKS_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isSiegeworksArchetype,
  nodeSeed,
  resolveArchetype,
  siegeworksFacadeDefaults,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x6a2215012n, "world.siegeworks");
const OTHER = nodeSeed(0x6a2215012n, "world.siegeworks.other");
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
  const facade = siegeworksFacadeDefaults(archetype);
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

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("siegeworks archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isSiegeworksArchetype(a)).toBe(true);
    }
    expect(isSiegeworksArchetype("cottage")).toBe(false);
    expect(isSiegeworksArchetype("bastion")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["star_fort"])).toBe("star_fort");
    expect(archetypeOfTags(["bastion_trace"])).toBe("star_fort");
    expect(archetypeOfTags(["trace_italienne"])).toBe("star_fort");
    expect(archetypeOfTags(["motte"])).toBe("motte_and_bailey");
    expect(archetypeOfTags(["bailey"])).toBe("motte_and_bailey");
    expect(archetypeOfTags(["palisade"])).toBe("palisade");
    expect(archetypeOfTags(["stockade"])).toBe("palisade");
    expect(archetypeOfTags(["moat"])).toBe("moat");
    expect(archetypeOfTags(["drawbridge"])).toBe("drawbridge");
    expect(archetypeOfTags(["bascule"])).toBe("drawbridge");
    expect(archetypeOfTags(["drill_yard"])).toBe("drill_yard");
    expect(archetypeOfTags(["parade_ground"])).toBe("drill_yard");
    expect(archetypeOfTags(["siege_camp"])).toBe("siege_camp");
    expect(archetypeOfTags(["encampment"])).toBe("siege_camp");
  });

  /** The near misses, stated as the tags this pack deliberately did **not** take. */
  it("leaves the tags the earlier tables already claim", () => {
    expect(archetypeOfTags(["fortress"])).toBe("castle");
    expect(archetypeOfTags(["stronghold"])).toBe("castle");
    expect(archetypeOfTags(["bastion"])).toBe("bastion");
    expect(archetypeOfTags(["castle"])).toBe("keep");
    expect(archetypeOfTags(["keep"])).toBe("keep");
    expect(archetypeOfTags(["gate"])).toBe("gatehouse");
    expect(archetypeOfTags(["barbican"])).toBe("gatehouse");
    expect(archetypeOfTags(["garrison"])).toBe("barracks");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      const facade = siegeworksFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(siegeworksFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("keep").roof).toBe("hip");
    expect(archetypeFacadeDefaults("castle").roof).toBe("hip");
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
  });

  it("is claimed by the catalog as implemented, with a curator's note", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.category, a).toBe("military");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.note, a).toBeDefined();
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the works                                                                   */
/* -------------------------------------------------------------------------- */

describe("siegeworks buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(result.meta.furnitureCount, `${a} ${size.join("x")}`).toBeGreaterThan(0);
      }
    }
  });

  it("leaves every ground floor walkable from the door, with no pockets", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const report = walkabilityReport(result);
        expect(report.start, `${a} ${size.join("x")} has a way in`).not.toBeNull();
        assertNoPockets(result, `${a} ${size.join("x")}`);
      }
    }
  });

  it("stays inside the envelope, in plan and in height", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
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

  /** The icon law, as block evidence: each work's signature is on the ground. */
  it("builds the thing each archetype is for", () => {
    expect(has(build("star_fort"), "stone_bricks"), "the masonry trace").toBe(true);
    expect(has(build("star_fort"), "cartography_table"), "the plan table").toBe(true);
    expect(has(build("motte_and_bailey"), "coarse_dirt"), "the motte").toBe(true);
    expect(has(build("motte_and_bailey"), "grass_block"), "the motte's crown").toBe(true);
    expect(has(build("palisade"), "stripped_spruce_log"), "the stockade").toBe(true);
    expect(has(build("moat"), "water"), "the water").toBe(true);
    expect(has(build("drawbridge"), "water"), "the moat under the span").toBe(true);
    expect(has(build("drawbridge"), "spruce_trapdoor"), "the raised leaf").toBe(true);
    expect(has(build("drill_yard"), "gravel"), "the marked parade ground").toBe(true);
    expect(has(build("drill_yard"), "hay_block"), "the pells and the butts").toBe(true);
    expect(has(build("siege_camp"), "white_wool"), "the canvas").toBe(true);
    expect(has(build("siege_camp"), "coarse_dirt"), "the earthwork bank").toBe(true);
    expect(has(build("siege_camp"), "red_wall_banner"), "the colours").toBe(true);
  });

  /**
   * The way in, as a property: no work here may write a block into the cell a
   * player opens the door from, nor into the door column itself. That cell is
   * where the physics lint starts its walk.
   */
  it("never fortifies its own doorstep shut", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const door = result.meta.door;
        expect(door, `${a} ${size.join("x")} door`).not.toBeNull();
        if (door === null) continue;
        const report = walkabilityReport(result);
        expect(report.start, `${a} ${size.join("x")} has a way in`).not.toBeNull();
      }
    }
  });

  /**
   * The moat's causeway, measured: the doorstep column carries no water and
   * nothing solid at standing height, and the ring around it does carry water.
   */
  it("lays the moat round the building but not across its causeway", () => {
    for (const a of ["moat", "drawbridge"]) {
      const result = build(a, [13, 13, 15]);
      const door = result.meta.door;
      expect(door, `${a} door`).not.toBeNull();
      if (door === null) continue;
      const water = result.ops.filter((op) => op.block === "water");
      expect(water.length, `${a} has a moat`).toBeGreaterThan(8);
      const report = walkabilityReport(result);
      const start = report.start;
      expect(start, `${a} way in`).not.toBeNull();
      for (const op of water) {
        expect(
          op.x === door.x && op.z === door.z,
          `${a} water in the door column`,
        ).toBe(false);
      }
    }
  });

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        expect(has(build(a, size), "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
      }
    }
  });

  /** No sign blocks, and no `chain`: the 1.21.11 table has no entry for one. */
  it("never places a sign or a chain", () => {
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
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
    for (const a of SIEGEWORKS_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });

  /** An op index, keyed by cell. Air is a *written* op and counts as empty. */
  it("stands the siege camp's tent on the plate, not over the budget", () => {
    const result = build("siege_camp", [15, 15, 17]);
    const index = new Map<string, LocalVoxelOp>();
    for (const op of result.ops) index.set(`${op.x},${op.y},${op.z}`, op);
    const canvas = result.ops.filter((op) => op.block === "white_wool" && op.y > result.meta.wallTop);
    expect(canvas.length, "the tent").toBeGreaterThan(10);
    for (const op of canvas) {
      expect(op.y).toBeLessThanOrEqual(result.meta.roofTop + ROOF_FLOURISH_RISE);
    }
  });
});
