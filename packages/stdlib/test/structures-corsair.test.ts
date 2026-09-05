/**
 * The **nautical & pirate pack**, first half: four shore buildings and five
 * shore props, on the alien pack's harness.
 *
 * The harness is deliberately the same one every earlier wave was held to — a
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about — so this file re-walks all of it: registration, tag
 * resolution without theft, a furnished room that stays one walkable region,
 * the door standable over every envelope, the lantern column never being the
 * only route, the envelope itself, no bare pots or signs or lit fire,
 * determinism, and no full block with six air faces in any theme at any shape.
 *
 * Plus the properties this half exists to prove, every one of them a
 * *silhouette* property, because the pack's thesis is that a pirate haven is
 * named from across the bay:
 *
 * - **the flag is a jolly roger.** A black field with a white skull in it, in
 *   every palette, hung off a yard that crosses a mast — and the skull is
 *   never written through the spar;
 * - **the magazine is buttressed, windowless and lit from outside.** Its
 *   lights stand on the buttress caps in the apron and there is not one lit
 *   block indoors;
 * - **the sea tower is chamfered and has a gun on it.** A square drum is a
 *   keep; the four corners come off above the batter, and the platform carries
 *   a piece pointing the way the door looks;
 * - **the loft hoists.** A beam out of the gable with a fall off the end of it;
 * - **the wreck is open and the careened hull is heeled.** Ribs with nothing
 *   between them, and a section that is not symmetric — a symmetric one is a
 *   boat sitting upright on a beach.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  CORSAIR_BUILDING_ARCHETYPES,
  CORSAIR_PROP_NAMES,
  PROP_NAMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  corsairFacadeDefaults,
  generateBuilding,
  generateProp,
  isCorsairArchetype,
  isCorsairProp,
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

const S = nodeSeed(0xc025_a12bn, "world.corsair");
const OTHER = nodeSeed(0xc025_a12bn, "world.corsair.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [15, 16, 17];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

function paramsOf(archetype: string, extra: Record<string, unknown>): Record<string, unknown> {
  const facade = corsairFacadeDefaults(archetype);
  return {
    archetype,
    ...(facade.roof === undefined ? {} : { roof: facade.roof }),
    ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
    ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
    ...extra,
  };
}

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  return generateBuilding({ size, params: paramsOf(archetype, extra), seed, style: PINNED });
}

/** The same building, but dealt one theme's materials instead of the pinned style. */
function buildIn(
  archetype: string,
  themeId: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
): ReturnType<typeof generateBuilding> {
  const label = `${themeId}.${archetype}.${size.join("x")}.${JSON.stringify(extra)}`;
  const seed = nodeSeed(0xc025_a12bn, `world.corsair.${label}`);
  const materials = assignMaterials(pickTheme(seed, themeId), 1, seed)[0] as BuildingMaterials;
  return generateBuilding({ size, params: paramsOf(archetype, extra), seed, materials });
}

/**
 * The **shape-varying** axis of the input space, beyond the envelope.
 *
 * The alien pack's scar, inherited whole: the dev grid and the pack's exhibit
 * row build every archetype under roof shapes, storey counts and window
 * rhythms this file's own harness never asks for, and three of these four
 * derive their massing from exactly those — the magazine's vault from the room
 * between the plate and the allowance, the tower's parapet from the same, the
 * loft's hoist from the eave height. A roof shape it was never built under is
 * a **different building**, not the same building in a hat.
 */
const SHAPES: readonly Record<string, unknown>[] = Object.freeze([
  { roof: "gable", floors: 1 },
  { roof: "hip", floors: 1 },
  { roof: "flat", floors: 1 },
  { roof: "pyramid", floors: 1 },
  { roof: "gable", floors: 2 },
  { roof: "flat", floors: 2 },
  { roof: "hip", floors: 1, windowShape: "single", windowRhythm: "none" },
  { roof: "gable", floors: 2, windowShape: "tall", windowRhythm: "regular" },
]);

/** Envelopes the dev grid and the pack's exhibit row actually use. */
const GRID_SIZES: readonly (readonly [number, number, number])[] = Object.freeze([
  [7, 8, 7],
  [9, 8, 9],
  [11, 8, 8],
  [13, 8, 7],
  [15, 16, 17],
  [19, 14, 19],
]);

/** Every lit block this pack writes — the ones the support rules police. */
function lights(result: ReturnType<typeof generateBuilding>): LocalVoxelOp[] {
  return result.ops.filter((op) => op.block === "glowstone" || op.block.endsWith("lantern"));
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

/** The ground floor's free cells, as the physics lint would read them. */
function freeCells(result: ReturnType<typeof generateBuilding>): string[] {
  const at = indexOf(result.ops);
  const free: string[] = [];
  for (const cell of result.meta.floorCells) {
    if (!passableBlock(at.get(`${cell.x},1,${cell.z}`)?.block)) continue;
    if (!passableBlock(at.get(`${cell.x},2,${cell.z}`)?.block)) continue;
    free.push(`${cell.x},${cell.z}`);
  }
  return free;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/** Every solid op on one course. */
function course(result: ReturnType<typeof generateBuilding>, y: number): LocalVoxelOp[] {
  return result.ops.filter((op) => op.y === y && op.block !== "air");
}

/**
 * Every block this op set writes that has six air faces.
 *
 * Checked from `y = 1` up, not from the eave plate up — the alien pack's
 * widening, and for its reason: `floating.isolated` does not care which half of
 * the building a full cube is in. `y = 0` is exempt, and only `y = 0`: the
 * floor plane and the apron's ground course rest on the pad, which is terrain
 * rather than an op.
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

describe("the nautical pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isCorsairArchetype(a)).toBe(true);
    }
    expect(isCorsairArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
    expect(CORSAIR_BUILDING_ARCHETYPES).toHaveLength(4);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["powder_magazine"])).toBe("powder_magazine");
    expect(archetypeOfTags(["magazine"])).toBe("powder_magazine");
    expect(archetypeOfTags(["powder_house"])).toBe("powder_magazine");
    expect(archetypeOfTags(["powder_store"])).toBe("powder_magazine");
    expect(archetypeOfTags(["martello_tower"])).toBe("martello_tower");
    expect(archetypeOfTags(["martello"])).toBe("martello_tower");
    expect(archetypeOfTags(["sea_tower"])).toBe("martello_tower");
    expect(archetypeOfTags(["gun_tower"])).toBe("martello_tower");
    expect(archetypeOfTags(["chandlery"])).toBe("chandlery");
    expect(archetypeOfTags(["chandler"])).toBe("chandlery");
    expect(archetypeOfTags(["ships_stores"])).toBe("chandlery");
    expect(archetypeOfTags(["sail_loft"])).toBe("sail_loft");
    expect(archetypeOfTags(["sailmaker"])).toBe("sail_loft");
    expect(archetypeOfTags(["rigging_loft"])).toBe("sail_loft");
    // THE NEAR MISSES. Every one of these belongs to an older table, and this
    // pack owning shore *ids* must not have moved one of the shore *words*.
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["lighthouse"])).toBe("lighthouse");
    expect(archetypeOfTags(["shipyard"])).toBe("shipyard");
    expect(archetypeOfTags(["ropewalk"])).toBe("ropewalk");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["shop"])).toBe("general_store");
    expect(archetypeOfTags(["depot"])).toBe("warehouse");
    expect(archetypeOfTags(["arsenal"])).toBe("arsenal");
    expect(archetypeOfTags(["battery"])).toBe("battery_shed");
    // And the words this pack's PROPS are named by are claimed by nobody: a
    // node tagged `gallows` must not silently become a building.
    for (const word of ["gallows", "gibbet", "jolly_roger", "wreck", "careening"]) {
      expect(archetypeOfTags([word]), word).toBe("cottage");
    }
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      const facade = corsairFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(corsairFacadeDefaults("cottage")).toEqual({});
    // The magazine has no windows at all: the note's refusal, in a param.
    expect(corsairFacadeDefaults("powder_magazine").windowRhythm).toBe("none");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("stoa").roof).toBe("gable");
    expect(archetypeFacadeDefaults("xeno_spire").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.note, a).toBeDefined();
      expect(entry?.tags, a).toContain("nautical_pirate");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === a),
        a,
      ).toHaveLength(1);
    }
    expect(structureById("powder_magazine")?.category).toBe("military");
    expect(structureById("martello_tower")?.category).toBe("military");
    expect(structureById("chandlery")?.category).toBe("commercial");
    expect(structureById("sail_loft")?.category).toBe("industrial");
    for (const p of CORSAIR_PROP_NAMES) {
      expect(structureById(p)?.status, p).toBe("implemented");
      expect(structureById(p)?.tags, p).toContain("nautical_pirate");
    }
    // The careening beach is §3.2's one `infrastructure` row realised as a
    // prop, and the row is left saying so — the `curtain_wall` precedent. The
    // shore battery, the other one, is a sweep client and is now `INFRA_ENTRIES`'
    // own (W2): it belongs to `infra.entry@0` and to neither registry here.
    expect(structureById("careening_beach")?.kind).toBe("infrastructure");
    expect(structureById("cannon_battery")?.status).toBe("implemented");
    expect(BUILDING_ARCHETYPES as readonly string[]).not.toContain("cannon_battery");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the nautical pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
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
  }, 30_000);

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
        const free = freeCells(result).filter((k) => k !== lamp);
        expect(oneRegion(free), `${a} ${size.join("x")} without the lantern cell`).toBe(true);
      }
    }
  }, 30_000);

  /** THE DOOR RULE: a way in you cannot stand in is a texture, not a door. */
  it("leaves the door standable and the ground floor reachable from it", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
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
          expect(passableBlock(at.get(`${inX},1,${inZ}`)?.block), label).toBe(true);
          expect(passableBlock(at.get(`${inX},2,${inZ}`)?.block), label).toBe(true);
          expect(freeCells(result), label).toContain(`${inX},${inZ}`);
          // …and the doorstep, the cell OUTSIDE it, is standable too: the
          // magazine's buttresses and the tower's batter both build in the
          // apron, and a pier written across the way in is a door nobody can
          // reach.
          const outX = door.x - step[0];
          const outZ = door.z - step[1];
          expect(passableBlock(at.get(`${outX},1,${outZ}`)?.block), `${label} doorstep`).toBe(true);
          expect(passableBlock(at.get(`${outX},2,${outZ}`)?.block), `${label} doorstep`).toBe(true);
        }
      }
    }
  }, 60_000);

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
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
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
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
  }, 30_000);

  /**
   * The forms themselves — one claim per building, and each one is the thing a
   * stranger would name the building by.
   */
  it("builds the thing each archetype is for", () => {
    // THE MAGAZINE. Buttressed, vaulted, and lit from OUTSIDE.
    const mag = build("powder_magazine", BIG, { floors: 1 });
    const at = indexOf(mag.ops);
    const [msx, , msz] = mag.meta.size;
    const apron = mag.ops.filter(
      (op) =>
        op.block !== "air" &&
        (op.x === -1 || op.x === msx || op.z === -1 || op.z === msz) &&
        op.y > 2,
    );
    expect(apron.length, "the buttresses stand proud of the wall").toBeGreaterThan(6);
    // Every **standing** lantern is outside the wall, and high up: the pack's
    // own lights are the ones on the buttress caps. (The shell's hanging
    // lantern in the middle of the room is the grammar's, not this file's —
    // `PRESERVE` protects it and the walkability guard routes round it — so
    // the claim is about standing lights, which is what "lanterns outside the
    // wall only" means when the grammar always hangs one from the ceiling.)
    const lamps = mag.ops.filter(
      (op) => op.block.endsWith("lantern") && op.props?.["hanging"] !== "true",
    );
    expect(lamps.length, "the lights").toBeGreaterThan(0);
    let onCaps = 0;
    for (const lamp of lamps) {
      const outside = lamp.x === -1 || lamp.x === msx || lamp.z === -1 || lamp.z === msz;
      expect(outside, `a light at ${lamp.x},${lamp.y},${lamp.z} is outside the wall`).toBe(true);
      // …and it stands on what is under it, which is the lint's own rule.
      expect(at.get(`${lamp.x},${lamp.y - 1},${lamp.z}`), "on a cap").toBeDefined();
      if (lamp.y > 3) onCaps++;
    }
    expect(onCaps, "lights on the buttress caps").toBeGreaterThan(0);
    // The vault: an arc, so the roof narrows course by course over the plate.
    const vBase = mag.meta.wallTop + 1;
    expect(course(mag, vBase + 1).length, "the vault's springing").toBeGreaterThan(
      course(mag, mag.meta.roofTop + ROOF_FLOURISH_RISE).length,
    );

    // THE SEA TOWER. Chamfered, battered, and armed.
    const tower = build("martello_tower", BIG, { floors: 1 });
    const tAt = indexOf(tower.ops);
    const [tsx, , tsz] = tower.meta.size;
    let cut = 0;
    for (const [x, z] of [
      [0, 0],
      [tsx - 1, 0],
      [0, tsz - 1],
      [tsx - 1, tsz - 1],
    ] as const) {
      if (tAt.get(`${x},${tower.meta.wallTop},${z}`)?.block === "air") cut++;
    }
    expect(cut, "the four corners come off").toBeGreaterThan(2);
    // The batter: the apron carries masonry at its second course all round.
    expect(
      tower.ops.filter((op) => op.y === 2 && op.block !== "air" && (op.x === -1 || op.x === tsx))
        .length,
      "the battered foot",
    ).toBeGreaterThan(4);
    expect(has(tower, "polished_blackstone"), "the gun").toBe(true);
    expect(has(tower, "ladder"), "the way up the outside").toBe(true);

    // THE CHANDLERY. An awning over the street and a counter under the goods.
    const shop = build("chandlery", BIG, { floors: 1 });
    const awning = shop.ops.filter(
      (op) => op.block.endsWith("_trapdoor") && op.props?.["open"] === "true",
    );
    expect(awning.length, "the awning").toBeGreaterThan(2);
    expect(has(shop, "barrel"), "the stores").toBe(true);
    expect(has(shop, "cauldron"), "the tar").toBe(true);
    expect(has(shop, "glowstone"), "the light over the shelving").toBe(true);
    // The glow is bracketed, never hanging: the lint's rule fires on the NAME,
    // so this pack's indoor light is a full cube standing on the crate under it.
    const sAt = indexOf(shop.ops);
    for (const op of shop.ops) {
      if (op.block !== "glowstone") continue;
      expect(
        sAt.get(`${op.x},${op.y - 1},${op.z}`),
        `a shelf light at ${op.x},${op.y},${op.z} stands on something`,
      ).toBeDefined();
    }

    // THE LOFT. A hoist beam out of the gable with a fall off the end of it.
    const loft = build("sail_loft", BIG, { floors: 2 });
    const [lsx, , lsz] = loft.meta.size;
    const beam = loft.ops.filter(
      (op) => op.block !== "air" && (op.x === -1 || op.x === lsx || op.z === -1 || op.z === lsz),
    );
    expect(beam.length, "something is cantilevered out of the gable").toBeGreaterThan(0);
    // …and it is not a lucky envelope: the hoist searches the gable's bays for
    // a column the shell left solid, because the middle one carries a window
    // about half the time and a sail loft with no hoist is a shed.
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        const one = build("sail_loft", size, { floors });
        const [ox, , oz] = one.meta.size;
        const out = one.ops.filter(
          (op) => op.block !== "air" && (op.x === -1 || op.x === ox || op.z === -1 || op.z === oz),
        );
        expect(
          out.some((op) => op.block === "iron_bars"),
          `the fall at ${size.join("x")} floors=${floors}`,
        ).toBe(true);
      }
    }
    expect(has(loft, "iron_bars"), "the fall").toBe(true);
    expect(
      loft.ops.some((op) => op.block.endsWith("_carpet")),
      "the cloth on the loft floor",
    ).toBe(true);
    expect(
      loft.ops.some((op) => op.block.endsWith("_wool")),
      "the bolts of cloth",
    ).toBe(true);
  });

  /**
   * Nothing this pack builds floats — anywhere in it, in any theme, at any
   * shape.
   *
   * The alien pack's scar test, inherited whole: the guard is the *product* of
   * every shape the grid cycles × every envelope either grid uses × every
   * registered theme, because an envelope is not the whole input space and the
   * finding that taught the repo so lived at a cell whose only difference from
   * a passing one was its params.
   */
  it("leaves no full block with six air faces, at any shape, in any theme", () => {
    const found: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of CORSAIR_BUILDING_ARCHETYPES) {
        for (const size of GRID_SIZES) {
          for (const shape of SHAPES) {
            const result = buildIn(a, theme.id, size, shape);
            for (const op of floaters(result)) {
              found.push(
                `${theme.id} / ${a} ${size.join("x")} ${JSON.stringify(shape)}: ` +
                  `${op.block} at ${op.x},${op.y},${op.z}`,
              );
            }
          }
        }
      }
    }
    expect(found.slice(0, 20)).toEqual([]);
  }, 300_000);

  /**
   * THE GLOW STANDS ON SOMETHING.
   *
   * The lint's `unsupported.lantern` rule fires on any block whose name ends
   * in `lantern` and asks for a floor under it or a chain over it; the pack's
   * indoor light is `glowstone`, which is a full cube and answers to
   * `floating.isolated` instead. One assertion covers both: every lit block
   * this pack writes touches something.
   */
  it("never writes a lit block that is not riding the structure", () => {
    let seen = 0;
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of CORSAIR_BUILDING_ARCHETYPES) {
        for (const size of GRID_SIZES) {
          const result = buildIn(a, theme.id, size);
          const at = indexOf(result.ops);
          const solid = (x: number, y: number, z: number): boolean => {
            const block = at.get(`${x},${y},${z}`)?.block;
            return block !== undefined && block !== "air";
          };
          for (const op of lights(result)) {
            seen++;
            const where = `${theme.id} / ${a} ${size.join("x")}: ${op.block} at ${op.x},${op.y},${op.z}`;
            // A lantern is held to the lint's own question — is there
            // something UNDER it — because that is the rule it answers to.
            if (op.block.endsWith("lantern")) {
              // The lint's own question, and it depends on the state: a
              // hanging lantern wants something above it, a standing one
              // something below.
              const hanging = op.props?.["hanging"] === "true";
              expect(
                hanging ? solid(op.x, op.y + 1, op.z) : solid(op.x, op.y - 1, op.z),
                where,
              ).toBe(true);
              continue;
            }
            expect(
              solid(op.x + 1, op.y, op.z) ||
                solid(op.x - 1, op.y, op.z) ||
                solid(op.x, op.y, op.z + 1) ||
                solid(op.x, op.y, op.z - 1) ||
                solid(op.x, op.y + 1, op.z) ||
                solid(op.x, op.y - 1, op.z),
              where,
            ).toBe(true);
          }
        }
      }
    }
    // …and the guard has not simply stopped placing lights.
    expect(seen, "lit blocks across the sweep").toBeGreaterThan(100);
  }, 180_000);

  /** And the room stays walkable in every theme too — the same cross-product. */
  it("leaves every ground floor one region, in any theme", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of CORSAIR_BUILDING_ARCHETYPES) {
        const result = buildIn(a, theme.id);
        const free = freeCells(result);
        expect(free.length, `${theme.id} / ${a}`).toBeGreaterThan(3);
        expect(oneRegion(free), `${theme.id} / ${a} is one region`).toBe(true);
      }
    }
  }, 60_000);

  /** Every pot has a plant in it, and nothing here hangs a sign. */
  it("never places a bare flower pot, and hangs no signs", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        expect(has(result, "flower_pot"), `${a} ${size.join("x")}`).toBe(false);
        expect(
          result.ops.filter((op) => op.block.endsWith("_sign")),
          `${a} ${size.join("x")}`,
        ).toEqual([]);
      }
    }
  }, 30_000);

  /** A powder magazine with a fire in it is a crater. */
  it("lights no fire, and none at all indoors in the magazine", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) {
        if (op.block.endsWith("_candle")) expect(op.props?.["lit"], `${a} candle`).toBe("false");
        if (op.block === "campfire") expect(op.props?.["lit"], `${a} campfire`).toBe("false");
      }
    }
    // …and the magazine's fit-out puts nothing lit in the room. The one lit
    // block inside it is the shell's own ceiling lantern, which the grammar
    // hangs in every building it builds and which `PRESERVE` protects: it is
    // *hanging*, so the exemption is exactly one state and not a hole.
    const mag = build("powder_magazine");
    const it = mag.meta.interior;
    for (const op of mag.ops) {
      if (op.x < it.x0 || op.x > it.x1 || op.z < it.z0 || op.z > it.z1) continue;
      if (op.block.endsWith("lantern") && op.props?.["hanging"] === "true") continue;
      expect(
        /lantern|torch|glowstone|shroomlight|campfire|_fire$/.test(op.block),
        `a light indoors at ${op.x},${op.y},${op.z}: ${op.block}`,
      ).toBe(false);
    }
  }, 30_000);

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of CORSAIR_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the props                                                                   */
/* -------------------------------------------------------------------------- */

describe("the nautical pack's props", () => {
  const make = (prop: string, seed = S): ReturnType<typeof generateProp> =>
    generateProp({ prop, seed });

  it("registers, and declares a box each stays inside", () => {
    for (const p of CORSAIR_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isCorsairProp(p)).toBe(true);
      const result = make(p);
      const [sx, sy, sz] = result.meta.size;
      for (const op of result.ops) {
        expect(op.x, p).toBeGreaterThanOrEqual(0);
        expect(op.x, p).toBeLessThan(sx);
        expect(op.z, p).toBeGreaterThanOrEqual(0);
        expect(op.z, p).toBeLessThan(sz);
        expect(op.y, p).toBeGreaterThanOrEqual(result.meta.minY);
        expect(op.y, p).toBeLessThan(result.meta.minY + sy);
      }
    }
    expect(isCorsairProp("gazebo")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  /** THE ICON: a black flag with a white skull, hung off a yard that crosses. */
  it("flies a jolly roger, in one piece, off a mast with a yard on it", () => {
    const mast = make("jolly_roger_mast");
    const at = indexOf(mast.ops);
    const field = mast.ops.filter((op) => op.block === "black_wool");
    const mark = mast.ops.filter((op) => op.block === "white_wool");
    expect(field.length, "the black field").toBeGreaterThan(12);
    expect(mark.length, "the skull and bones").toBeGreaterThan(8);
    // The flag is ONE plane and it is whole: every cell of it hangs from the
    // cell above, and the top row hangs off the yard.
    const flag = [...field, ...mark];
    const planes = new Set(flag.map((op) => op.z));
    expect(planes.size, "the flag is one plane").toBe(1);
    for (const op of flag) {
      const above = at.get(`${op.x},${op.y + 1},${op.z}`);
      const beside =
        at.get(`${op.x - 1},${op.y},${op.z}`) ?? at.get(`${op.x + 1},${op.y},${op.z}`);
      expect(
        above !== undefined || beside !== undefined,
        `flag cell at ${op.x},${op.y},${op.z} is attached`,
      ).toBe(true);
    }
    // Not one cell of the flag was written through the spar — the whole reason
    // the mast stands to one side of its own box.
    const mastCells = mast.ops.filter((op) => op.props?.["axis"] === "y");
    const mastX = (mastCells[0] as LocalVoxelOp).x;
    for (const op of flag) expect(op.x, "the flag flies abaft the mast").toBeGreaterThan(mastX);
    // The yard crosses the mast, and it is what makes a pole read as a ship.
    const yard = mast.ops.filter((op) => op.props?.["axis"] === "x");
    expect(yard.length, "the yard").toBeGreaterThan(4);
    expect(new Set(yard.map((op) => op.y)).size, "the yard is one spar").toBe(1);
    // And it is tall: a short one is a flagpole, which the catalog already has.
    expect(mast.meta.size[1]).toBeGreaterThan(15);
    expect(mast.ops.some((op) => op.block === "ladder"), "the ratlines").toBe(true);
  });

  /** The gate shape, the drop and the deck. */
  it("builds a gallows with two posts, a beam and a noose under it", () => {
    const gal = make("gallows");
    const at = indexOf(gal.ops);
    const posts = gal.ops.filter((op) => op.props?.["axis"] === "y");
    expect(new Set(posts.map((op) => op.x)).size, "two uprights").toBe(2);
    const beam = gal.ops.filter((op) => op.props?.["axis"] === "x");
    expect(beam.length, "the crossbeam").toBeGreaterThan(3);
    const beamY = (beam[0] as LocalVoxelOp).y;
    const noose = gal.ops.filter((op) => op.block === "iron_bars");
    expect(noose.length, "the noose").toBeGreaterThan(1);
    for (const link of noose) expect(link.y, "the noose hangs from the beam").toBeLessThan(beamY);
    expect(at.get(`${(noose[0] as LocalVoxelOp).x},${beamY},${(noose[0] as LocalVoxelOp).z}`), "under the beam").toBeDefined();
    // The trap, in a deck a body can get onto.
    expect(gal.ops.some((op) => op.block.endsWith("_trapdoor")), "the trap").toBe(true);
    expect(gal.ops.some((op) => op.block.endsWith("_stairs")), "the step up").toBe(true);
  });

  /** Small, cheap, and unmistakable. */
  it("builds a gibbet you could afford three of", () => {
    const gib = make("gibbet_cage");
    expect(gib.meta.size[0]).toBeLessThanOrEqual(3);
    expect(gib.meta.size[2]).toBeLessThanOrEqual(3);
    expect(gib.ops.length, "cheap").toBeLessThan(40);
    const bars = gib.ops.filter((op) => op.block === "iron_bars");
    expect(bars.length, "the cage").toBeGreaterThan(2);
    expect(gib.ops.some((op) => op.block === "bone_block"), "what is in it").toBe(true);
    // The arm: a log lying across the top of the post, which is what makes the
    // cage hang rather than stand.
    expect(gib.ops.some((op) => op.props?.["axis"] === "x"), "the arm").toBe(true);
  });

  /** A wreck is OPEN: ribs with nothing between them. */
  it("drives a hull up the strand with its ribs open to the sky", () => {
    const wreck = make("beached_wreck");
    const [sx, , sz] = wreck.meta.size;
    expect(sz, "a wreck is read by its length").toBeGreaterThan(sx);
    // The ribs stand out of the keel line, and they are ranked: several
    // separate stations along the hull, not one continuous side.
    const ribs = wreck.ops.filter((op) => op.y >= 2);
    expect(new Set(ribs.map((op) => op.z)).size, "the rib stations").toBeGreaterThan(3);
    // Open: the hull's own courses are far short of a filled box.
    const above = wreck.ops.filter((op) => op.y >= 1).length;
    expect(above, "nothing decked over").toBeLessThan(sx * sz);
    // The break: the far third carries wreckage rather than hull, so the
    // tallest thing back there is lower than the tallest thing forward.
    const brk = Math.floor((sz * 2) / 3);
    const bow = Math.max(...wreck.ops.filter((op) => op.z < brk).map((op) => op.y));
    const stern = Math.max(...wreck.ops.filter((op) => op.z >= brk).map((op) => op.y));
    expect(stern, "the stern half is gone").toBeLessThan(bow);
    expect(wreck.ops.some((op) => op.block === "sand"), "the spill up the tideline").toBe(true);
  });

  /** A careened hull is HEELED: the section is not symmetric. */
  it("heaves a hull down on her side with the tackle still on her", () => {
    const beach = make("careening_beach");
    const [sx] = beach.meta.size;
    const mid = (sx - 1) >> 1;
    const low = beach.ops.filter((op) => op.x < mid && op.y >= 2).length;
    const high = beach.ops.filter((op) => op.x > mid && op.y >= 2).length;
    expect(low === high, "a symmetric section is a boat, not a careened hull").toBe(false);
    expect(beach.ops.some((op) => op.block === "iron_bars"), "the tackle").toBe(true);
    // The fires under her are fires that are OUT, and they are in the base
    // plane, where a campfire's support rule wants them.
    for (const op of beach.ops) {
      if (op.block !== "campfire") continue;
      expect(op.props?.["lit"], "a careening fire").toBe("false");
      expect(op.y, "on the sand").toBe(0);
    }
  });

  /** Nothing floats: everything rests on the base plane or on its own kind. */
  it("leaves nothing standing on air", () => {
    for (const p of CORSAIR_PROP_NAMES) {
      const result = make(p);
      const at = indexOf(result.ops);
      const solid = (x: number, y: number, z: number): boolean => {
        const block = at.get(`${x},${y},${z}`)?.block;
        return block !== undefined && block !== "air";
      };
      for (const op of result.ops) {
        if (op.y === 0) continue;
        const touching =
          solid(op.x, op.y - 1, op.z) ||
          solid(op.x, op.y + 1, op.z) ||
          solid(op.x + 1, op.y, op.z) ||
          solid(op.x - 1, op.y, op.z) ||
          solid(op.x, op.y, op.z + 1) ||
          solid(op.x, op.y, op.z - 1);
        expect(touching, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(true);
      }
    }
  });

  /** Everything on the ground-chain list reaches the ground. */
  it("stands every carpet, campfire and fence on something", () => {
    for (const p of CORSAIR_PROP_NAMES) {
      const result = make(p);
      const at = indexOf(result.ops);
      for (const op of result.ops) {
        if (!/(_carpet|_fence|campfire|lantern|torch)$/.test(op.block)) continue;
        if (op.y === 0) continue;
        expect(
          at.get(`${op.x},${op.y - 1},${op.z}`),
          `${p}: ${op.block} at ${op.x},${op.y},${op.z} has nothing under it`,
        ).toBeDefined();
      }
    }
  });

  it("is deterministic, and keeps its box when the seed changes", () => {
    for (const p of CORSAIR_PROP_NAMES) {
      expect(JSON.stringify(make(p).ops), p).toBe(JSON.stringify(make(p).ops));
      const other = make(p, OTHER);
      expect(other.meta.size, p).toEqual(make(p).meta.size);
      expect(other.ops.length, p).toBeGreaterThan(5);
    }
  });

  /** The flag never changes, whatever the seed: a jolly roger is a constant. */
  it("draws the dressing from the seed and the flag from nothing", () => {
    const skulls = new Set<string>();
    const dressings = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const seed = nodeSeed(0xc025_a12bn, `world.flag_${i}`);
      const ops = generateProp({ prop: "jolly_roger_mast", seed }).ops;
      skulls.add(
        JSON.stringify(
          ops
            .filter((op) => op.block === "white_wool" || op.block === "black_wool")
            .map((op) => `${op.x},${op.y},${op.z},${op.block}`)
            .sort(),
        ),
      );
      dressings.add(JSON.stringify(ops.filter((op) => op.block === "brown_carpet").length));
    }
    expect(skulls.size, "one flag, always").toBe(1);
    expect(dressings.size, "the quay is dressed differently").toBeGreaterThan(1);
  });
});
