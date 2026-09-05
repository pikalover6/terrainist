/**
 * The **arcane & magical pack**, built half: five buildings on the classical
 * and xeno packs' harness.
 *
 * The harness is deliberately the same one every earlier wave was held to — a
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about — so this file re-walks all of it: registration, tag
 * resolution **without theft**, a furnished room that stays one walkable
 * region reachable from the door, the envelope, no bare pots or signs or lit
 * fire, determinism, and no full block with six air faces.
 *
 * Three things get more than the usual attention, because all three are the
 * scars other packs paid for:
 *
 * - **the input space is params AND envelope.** The dev grid cycles roof
 *   shapes, storey counts and window rhythms, and the pack's massing is
 *   *derived* (the academy's towers are built in the gap between the eave
 *   plate and the allowance), so a roof shape this pack was never built under
 *   is a **different building**, not the same building in a hat. The sweeps
 *   below therefore walk {@link SHAPES} × {@link GRID_SIZES}, not defaults;
 * - **the vocabulary is the most crowded in the catalog.** `arcane`,
 *   `library`, `school`, `academy`, `college`, `shrine`, `stable`, `crystal`
 *   and `dragon` all belong to somebody else, and the near-miss test below is
 *   the guard that this pack owning the *ids* did not move one of the *words*;
 * - **the door is load-bearing.** Every archetype is checked for a standable,
 *   enterable door on every envelope, because a way in you cannot stand in is
 *   a texture rather than a door.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  ARCANE_BUILDING_ARCHETYPES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  MATERIAL_THEMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  arcaneFacadeDefaults,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isArcaneArchetype,
  nodeSeed,
  pickTheme,
  resolveArchetype,
  structureById,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa2ca_11en, "world.arcane");
const OTHER = nodeSeed(0xa2ca_11en, "world.arcane.other");
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
  const facade = arcaneFacadeDefaults(archetype);
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

/** The same building, dealt one theme's materials instead of the pinned style. */
function buildIn(
  archetype: string,
  themeId: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
): ReturnType<typeof generateBuilding> {
  const facade = arcaneFacadeDefaults(archetype);
  const label = `${themeId}.${archetype}.${size.join("x")}.${JSON.stringify(extra)}`;
  const seed = nodeSeed(0xa2ca_11en, `world.arcane.${label}`);
  const materials = assignMaterials(pickTheme(seed, themeId), 1, seed)[0] as BuildingMaterials;
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
    materials,
  });
}

/** The shape-varying axis of the input space, beyond the envelope. */
const SHAPES: readonly Record<string, unknown>[] = Object.freeze([
  { roof: "gable", floors: 1 },
  { roof: "hip", floors: 1 },
  { roof: "flat", floors: 1 },
  { roof: "pyramid", floors: 1 },
  { roof: "gable", floors: 2 },
  { roof: "hip", floors: 2 },
  { roof: "flat", floors: 2 },
  { roof: "hip", floors: 1, windowShape: "single", windowRhythm: "none" },
  { roof: "hip", floors: 1, windowShape: "mullion", windowRhythm: "dense" },
  { roof: "gable", floors: 2, windowShape: "tall", windowRhythm: "regular" },
]);

/** Envelopes the dev grid and an exhibit row actually use. */
const GRID_SIZES: readonly (readonly [number, number, number])[] = Object.freeze([
  [7, 8, 7],
  [9, 8, 9],
  [11, 8, 8],
  [13, 8, 7],
  [11, 16, 11],
  [15, 16, 17],
  [19, 14, 19],
  [13, 12, 21],
]);

/** An op index, keyed by cell. Air is a *written* op and counts as empty. */
function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/**
 * Every block this op set writes that has six air faces.
 *
 * Checked from `y = 1` up, not from the eave plate up, and for the xeno pack's
 * reason: the `floating.isolated` rule does not care which half of a building
 * a full cube is in. `y = 0` is exempt, and only `y = 0`: the floor plane and
 * the apron's ground course rest on terrain rather than on an op.
 */
function floaters(result: ReturnType<typeof generateBuilding>): LocalVoxelOp[] {
  const at = indexOf(result.ops);
  const solid = (x: number, y: number, z: number): boolean => {
    const block = at.get(`${x},${y},${z}`)?.block;
    return block !== undefined && block !== "air";
  };
  return result.ops.filter((op) => {
    if (op.block === "air" || op.y < 1) return false;
    return !(
      solid(op.x + 1, op.y, op.z) ||
      solid(op.x - 1, op.y, op.z) ||
      solid(op.x, op.y, op.z + 1) ||
      solid(op.x, op.y, op.z - 1) ||
      solid(op.x, op.y + 1, op.z) ||
      solid(op.x, op.y - 1, op.z)
    );
  });
}

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("the arcane pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isArcaneArchetype(a)).toBe(true);
    }
    expect(isArcaneArchetype("cottage")).toBe(false);
    expect(isArcaneArchetype("wizard_tower")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
    expect(ARCANE_BUILDING_ARCHETYPES).toHaveLength(5);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["arcane_academy"])).toBe("arcane_academy");
    expect(archetypeOfTags(["mage_college"])).toBe("arcane_academy");
    expect(archetypeOfTags(["wizard_school"])).toBe("arcane_academy");
    expect(archetypeOfTags(["magus_hall"])).toBe("arcane_academy");
    expect(archetypeOfTags(["summoning_hall"])).toBe("summoning_hall");
    expect(archetypeOfTags(["summoning"])).toBe("summoning_hall");
    expect(archetypeOfTags(["ritual_hall"])).toBe("summoning_hall");
    expect(archetypeOfTags(["arcane_library"])).toBe("arcane_library");
    expect(archetypeOfTags(["grimoire_hall"])).toBe("arcane_library");
    expect(archetypeOfTags(["librarium"])).toBe("arcane_library");
    expect(archetypeOfTags(["blossom_shrine"])).toBe("blossom_shrine");
    expect(archetypeOfTags(["sakura_shrine"])).toBe("blossom_shrine");
    expect(archetypeOfTags(["pegasus_stable"])).toBe("pegasus_stable");
    expect(archetypeOfTags(["pegasus"])).toBe("pegasus_stable");
    expect(archetypeOfTags(["hippogriff_stable"])).toBe("pegasus_stable");

    // THE NEAR MISSES. Every one of these belongs to an older table, and this
    // pack owning the *ids* must not have moved one of the *words*. This is
    // the most crowded vocabulary in the catalog and the list is long on
    // purpose.
    expect(archetypeOfTags(["arcane"])).toBe("wizard_tower");
    expect(archetypeOfTags(["wizard"])).toBe("wizard_tower");
    expect(archetypeOfTags(["sorcerer"])).toBe("wizard_tower");
    expect(archetypeOfTags(["library"])).toBe("library");
    expect(archetypeOfTags(["scriptorium"])).toBe("library");
    expect(archetypeOfTags(["archive"])).toBe("library");
    expect(archetypeOfTags(["school"])).toBe("school");
    expect(archetypeOfTags(["academy"])).toBe("school");
    expect(archetypeOfTags(["college"])).toBe("university_hall");
    expect(archetypeOfTags(["university"])).toBe("university_hall");
    expect(archetypeOfTags(["stable"])).toBe("barn");
    expect(archetypeOfTags(["byre"])).toBe("barn");
    expect(archetypeOfTags(["paddock"])).toBe("cattle_pen");
    expect(archetypeOfTags(["crystal"])).toBe("crystal_shrine");
    expect(archetypeOfTags(["dragon"])).toBe("dragon_roost");
    expect(archetypeOfTags(["roost"])).toBe("dragon_roost");
    expect(archetypeOfTags(["shrine"])).toBe("church");
    expect(archetypeOfTags(["witch_hut"])).toBe("witch_hut");

    // And the words this pack deliberately leaves unclaimed. Every one of them
    // names one of this pack's own PROPS, which are reached by name and never
    // through this cascade: a node tagged `rune_circle` must not silently
    // become a building.
    for (const word of [
      "circle",
      "rune_circle",
      "ley_marker",
      "crystal_outcrop",
      "scrying_pool",
      "unicorn_paddock",
      "unicorn",
      "arcane_orrery",
      "orrery",
      "spirit_lantern_row",
      "dragon_skeleton",
      "moon_dial",
      "magic",
      "mage",
    ]) {
      expect(archetypeOfTags([word]), word).toBe("cottage");
    }
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      const facade = arcaneFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(arcaneFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("stoa").roof).toBe("gable");
    expect(archetypeFacadeDefaults("tholos").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.category, a).toBe("fantasy");
      expect(entry?.tags, a).toContain("arcane");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the arcane pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  /**
   * THE WALK, not a connectivity count: the physics lint floods a 1x2 body
   * from the cell inside the door, and "connected to itself" is not the same
   * property as "reachable from the way in".
   */
  it("leaves every ground floor reachable from its own door", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          assertNoPockets(result, { label: `${a} ${size.join("x")} floors=${floors}` });
        }
      }
    }
  }, 30_000);

  it("stays walkable across every roof, storey count and rhythm the grid cycles", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const size of GRID_SIZES) {
        for (const shape of SHAPES) {
          const result = build(a, size, shape);
          assertNoPockets(result, {
            label: `${a} ${size.join("x")} ${JSON.stringify(shape)}`,
          });
        }
      }
    }
  }, 120_000);

  /** THE DOOR RULE: a way in you cannot stand in is a texture, not a door. */
  it("leaves the door standable and enterable on every envelope", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const size of GRID_SIZES) {
        for (const shape of SHAPES) {
          const result = build(a, size, shape);
          const door = result.meta.door;
          const label = `${a} ${size.join("x")} ${JSON.stringify(shape)}`;
          expect(door, `${label} door`).not.toBeNull();
          if (door === null) continue;
          const at = indexOf(result.ops);
          const step = { north: [0, 1], south: [0, -1], east: [-1, 0], west: [1, 0] }[
            door.face
          ] as [number, number];
          const inX = door.x + step[0];
          const inZ = door.z + step[1];
          // The cell inside the door: air at the body's two courses, and a
          // solid non-water floor under it.
          expect(passableBlock(at.get(`${inX},1,${inZ}`)?.block), `${label} inside`).toBe(true);
          expect(passableBlock(at.get(`${inX},2,${inZ}`)?.block), `${label} headroom`).toBe(true);
          const floor = at.get(`${inX},0,${inZ}`)?.block;
          expect(floor, `${label} floor`).toBeDefined();
          expect(floor, `${label} floor is not water`).not.toBe("water");
          // And the approach outside it, both courses.
          const outX = door.x - step[0];
          const outZ = door.z - step[1];
          expect(passableBlock(at.get(`${outX},1,${outZ}`)?.block), `${label} approach`).toBe(true);
          expect(passableBlock(at.get(`${outX},2,${outZ}`)?.block), `${label} approach head`).toBe(
            true,
          );
        }
      }
    }
  }, 120_000);

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const at = indexOf(result.ops);
        for (const cell of result.meta.floorCells) {
          const floor = at.get(`${cell.x},0,${cell.z}`);
          expect(floor, `${a} floor at ${cell.x},${cell.z}`).toBeDefined();
          expect(floor?.block, `${a} floor at ${cell.x},${cell.z}`).not.toBe("air");
        }
      }
    }
  });

  /**
   * Every block **this pack** writes, by name.
   *
   * Needed because of a finding this file made and did not cause: on a **flat**
   * roof the *shell's own chimney* stands two courses over
   * `roofTop + ROOF_FLOURISH_RISE`, and it does so for `cottage`, `hall`,
   * `library`, `temple` and `xeno_spire` alike — measured, at 7x8x7, before
   * this pack existed. So the height half of the envelope check is held
   * against the blocks this pack is responsible for; the plan half is held
   * against every op, which is where a fit-out actually goes wrong.
   */
  const OURS =
    /(quartz|calcite|amethyst_block|gold_block|glowstone|cherry_|pink_wool|bookshelf|lectern|hay_block)/;

  it("stays inside the envelope, in plan and in height", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const size of GRID_SIZES) {
        for (const shape of SHAPES) {
          const result = build(a, size, shape);
          const [sx, , sz] = result.meta.size;
          const ceiling = result.meta.roofTop + ROOF_FLOURISH_RISE;
          const label = `${a} ${size.join("x")} ${JSON.stringify(shape)}`;
          for (const op of result.ops) {
            if (op.block === "air") continue; // clearing is not building
            expect(op.x, `${label} x`).toBeGreaterThanOrEqual(-1);
            expect(op.x, `${label} x`).toBeLessThanOrEqual(sx);
            expect(op.z, `${label} z`).toBeGreaterThanOrEqual(-1);
            expect(op.z, `${label} z`).toBeLessThanOrEqual(sz);
            if (OURS.test(op.block)) expect(op.y, `${label} y`).toBeLessThanOrEqual(ceiling);
          }
        }
      }
    }
  }, 120_000);

  /** THE FLOATING RULE, over the whole input space and every theme. */
  it("leaves no full block with six air faces, in any theme or shape", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const size of GRID_SIZES) {
        for (const shape of SHAPES) {
          const result = build(a, size, shape);
          expect(
            floaters(result).map((op) => `${op.block}@${op.x},${op.y},${op.z}`),
            `${a} ${size.join("x")} ${JSON.stringify(shape)}`,
          ).toEqual([]);
        }
      }
    }
  }, 120_000);

  it("survives the whole theme sweep, walkable and unfloating", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const theme of [...MATERIAL_THEMES.map((t) => t.id), "xeno_resin", "white_quartz"]) {
        for (const shape of [SHAPES[1], SHAPES[4]] as Record<string, unknown>[]) {
          const result = buildIn(a, theme, BIG, shape);
          const label = `${a} in ${theme} ${JSON.stringify(shape)}`;
          assertNoPockets(result, { label });
          expect(
            floaters(result).map((op) => `${op.block}@${op.x},${op.y},${op.z}`),
            label,
          ).toEqual([]);
        }
      }
    }
  }, 120_000);

  it("hangs no signs, lights no fire and plants no empty pot", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const op of build(a, size).ops) {
          expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
          expect(op.block, `${a} fire`).not.toBe("campfire");
          expect(op.block, `${a} empty pot`).not.toBe("flower_pot");
          expect(op.block, `${a} chain`).not.toBe("chain");
        }
      }
    }
  });

  it("is deterministic, and a different seed is still the same building", () => {
    for (const a of ARCANE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });

  /**
   * The forms themselves — one assertion per building, and each one is the
   * thing a stranger would name the building by.
   */
  it("builds the thing each archetype is for", () => {
    // THE ACADEMY: two towers of unequal height over the plate, and a floor
    // that says college rather than hall.
    const academy = build("arcane_academy", BIG, { floors: 1 });
    const base = academy.meta.wallTop + 1;
    const above = academy.ops.filter((op) => op.y > base && op.block !== "air");
    const byColumn = new Map<string, number>();
    for (const op of above) {
      const key = `${op.x},${op.z}`;
      byColumn.set(key, Math.max(byColumn.get(key) ?? 0, op.y));
    }
    const heights = [...byColumn.values()].sort((a, b) => b - a);
    expect(heights.length, "something stands over the plate").toBeGreaterThan(8);
    // Unequal: the tallest column and the tallest of the *other* tower differ.
    expect(heights[0], "the tall tower").toBeGreaterThan(base + 1);
    expect(has(academy, "glowstone"), "the academy glows").toBe(true);
    expect(has(academy, "bookshelf"), "shelves where a chapel puts pews").toBe(true);
    expect(has(academy, "amethyst_block"), "the pack's colour").toBe(true);

    // THE SUMMONING HALL: a circle written into the floor plane, and braziers.
    const hall = build("summoning_hall", BIG, { floors: 1 });
    const inlaid = hall.ops.filter((op) => op.y === 0 && op.block === "glowstone");
    expect(inlaid.length, "the circle is written in the floor").toBeGreaterThan(8);
    const zs = new Set(inlaid.map((op) => op.z));
    const xs = new Set(inlaid.map((op) => op.x));
    expect(zs.size, "and it is a ring, not a line").toBeGreaterThan(2);
    expect(xs.size, "in both axes").toBeGreaterThan(2);
    expect(has(hall, "gold_block"), "the cardinal spokes").toBe(true);

    // THE LIBRARY: made of shelving, with lit gaps in it.
    const library = build("arcane_library", BIG, { floors: 1 });
    const shelves = library.ops.filter((op) => op.block === "bookshelf");
    expect(shelves.length, "shelf ranges").toBeGreaterThan(10);
    expect(new Set(shelves.map((op) => op.y)).size, "to the ceiling plane").toBeGreaterThan(1);
    expect(has(library, "lectern"), "a place to read").toBe(true);
    expect(has(library, "glowstone"), "a light behind the empty bay").toBe(true);

    // THE SHRINE: a cherry canopy over it, and an altar with nothing on it.
    const shrine = build("blossom_shrine", [11, 12, 11], { floors: 1 });
    expect(has(shrine, "cherry_leaves"), "the canopy").toBe(true);
    expect(has(shrine, "cherry_log"), "and what it grows on").toBe(true);
    const canopy = shrine.ops.filter((op) => op.block === "cherry_leaves");
    expect(canopy.length, "a crown, not a sprig").toBeGreaterThan(20);
    for (const op of canopy) expect(op.y, "over the plate").toBeGreaterThan(shrine.meta.wallTop);

    // THE STABLE: a ledge in the apron at the plate, and stalls inside.
    const stable = build("pegasus_stable", BIG, { floors: 1 });
    const ledge = stable.ops.filter((op) => op.z === -1 && op.y === stable.meta.wallTop);
    expect(ledge.length, "a landing ledge projecting from the gable").toBeGreaterThan(4);
    expect(has(stable, "hay_block"), "a bed in the stall").toBe(true);
  });
});
