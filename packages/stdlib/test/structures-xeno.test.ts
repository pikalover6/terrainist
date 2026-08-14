/**
 * The **alien & sci-fi pack**, organic half: three buildings, two props and a
 * material theme, on the classical pack's harness.
 *
 * The harness is deliberately the same one every earlier wave was held to — a
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about — so this file re-walks all of it: registration, tag
 * resolution without theft, a furnished room that stays one walkable region,
 * the lantern column never being the only route, the envelope, no bare pots or
 * signs or lit fire, determinism, and no full block over the eave plate with
 * six air faces.
 *
 * Plus the properties this half exists to prove, which are all *silhouette*
 * properties, because the pack's whole thesis is that an invasion needs fabric
 * a stranger can name from a street corner:
 *
 * - **the spire is grown.** It tapers — every course narrower than the one
 *   under it — and its axis *moves*, so the point is not over the middle of
 *   the plan it stands on. A tapering tower whose axis is plumb is a steeple;
 * - **the mound has three ways in**, and every one of them is a cell a body
 *   fits through: air at `y = 1` **and** `y = 2`, on both sides of the wall;
 * - **the mound is low.** Its crest is a fraction of its span, or it is a
 *   dome-roofed hall;
 * - **the bay glows and grows**: trays, lamps clear of the trays, and water;
 * - **the wreck is asymmetric.** One leg under, one thrown out — a fallen
 *   machine with two matching legs is a chassis on its side.
 *
 * And the theme, which is the reason the buildings are legible at all: a
 * palette that was **grown**, checked here for shape and for id stability, and
 * checked for block existence by the compiler's theme sweep.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  MATERIAL_THEMES,
  PROP_NAMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  XENO_BUILDING_ARCHETYPES,
  XENO_PROP_NAMES,
  XENO_RESIN_THEME,
  XENO_RESIN_THEME_ID,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  generateProp,
  isXenoArchetype,
  isXenoProp,
  nodeSeed,
  pickTheme,
  resolveArchetype,
  structureById,
  xenoFacadeDefaults,
  type BuildingMaterials,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xa11e_5ce7n, "world.xeno");
const OTHER = nodeSeed(0xa11e_5ce7n, "world.xeno.other");
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
  const facade = xenoFacadeDefaults(archetype);
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

/** The same building, but dealt one theme's materials instead of the pinned style. */
function buildIn(
  archetype: string,
  themeId: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
): ReturnType<typeof generateBuilding> {
  const facade = xenoFacadeDefaults(archetype);
  const label = `${themeId}.${archetype}.${size.join("x")}.${JSON.stringify(extra)}`;
  const seed = nodeSeed(0xa11e_5ce7n, `world.xeno.${label}`);
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

/**
 * The **shape-varying** axis of the input space, beyond the envelope.
 *
 * The theme sweep does not build these buildings the way this file's own
 * harness does: the dev-world grid hands every archetype a *cycle* of roof
 * shapes, storey counts and window rhythms, and the pack's own exhibit row
 * hands them a different set again. That matters here more than in most packs,
 * because the spire's massing is derived — the taper from the room between the
 * plate and the allowance, the curl's quadrant from a hash of the envelope and
 * the eave height — so a roof shape it was never built under is a **different
 * spire**, not the same spire in a hat.
 *
 * The isolated `shroomlight` the sweep found lived at exactly such a cell.
 * This list is the input space that cell came from, reproduced here so the
 * finding is caught in the fast gate rather than in a four-minute world
 * readback: every roof the grid cycles, both storey counts, and the two window
 * rhythms that change how much wall a seam has to land on.
 */
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

/**
 * Envelopes the dev grid and the pack's exhibit row actually use.
 *
 * The grid's row runs 7×8×7 up to 13×8×7 in one-cell steps; the exhibit row
 * asks for the big ones. Both ends matter: the small ones are where the
 * derivations degrade, the big ones are where there is room to get it wrong.
 */
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

/** Every lit block this pack writes — the ones the support rules police. */
function lights(result: ReturnType<typeof generateBuilding>): LocalVoxelOp[] {
  return result.ops.filter((op) => op.block === "shroomlight" || op.block === "glowstone");
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
 * **Checked from `y = 1` up, not from the eave plate up**, and that widening
 * is a scar. The first version of this helper looked only above `wallTop`,
 * because the lesson it was written from was the sanctum pack's stepped-roof
 * one — and the theme sweep then found a `shroomlight` at `y = 3` in a spire's
 * brood, hung two courses over its pod with a clear cell between. The
 * `floating.isolated` rule does not care which half of the building a full
 * cube is in, and neither does this any more.
 *
 * `y = 0` is exempt, and only `y = 0`: the floor plane and the apron's ground
 * course rest on the pad, which is terrain rather than an op.
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

describe("the alien pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isXenoArchetype(a)).toBe(true);
    }
    expect(isXenoArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
    expect(XENO_BUILDING_ARCHETYPES).toHaveLength(3);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["xeno_spire"])).toBe("xeno_spire");
    expect(archetypeOfTags(["xeno"])).toBe("xeno_spire");
    expect(archetypeOfTags(["alien_spire"])).toBe("xeno_spire");
    expect(archetypeOfTags(["xeno_tower"])).toBe("xeno_spire");
    expect(archetypeOfTags(["hive_mound"])).toBe("hive_mound");
    expect(archetypeOfTags(["hive"])).toBe("hive_mound");
    expect(archetypeOfTags(["alien_hive"])).toBe("hive_mound");
    expect(archetypeOfTags(["brood_mound"])).toBe("hive_mound");
    expect(archetypeOfTags(["hydroponics_bay"])).toBe("hydroponics_bay");
    expect(archetypeOfTags(["hydroponics"])).toBe("hydroponics_bay");
    expect(archetypeOfTags(["vertical_farm"])).toBe("hydroponics_bay");
    // THE NEAR MISSES. Every one of these belongs to an older table, and this
    // pack owning the *ids* must not have moved one of the *words*.
    expect(archetypeOfTags(["spire"])).toBe("beacon_spire");
    expect(archetypeOfTags(["greenhouse"])).toBe("greenhouse");
    // And the two words this pack deliberately leaves alone: bare `alien` is
    // the *palette's* (the compiler's `THEME_ALIASES`), and bare `mound` is a
    // barrow as often as a hive.
    expect(archetypeOfTags(["alien"])).toBe("cottage");
    expect(archetypeOfTags(["mound"])).toBe("cottage");
    // The two prop names are claimed by nobody: a node tagged `mech` must not
    // silently become a building.
    expect(archetypeOfTags(["mech"])).toBe("cottage");
    expect(archetypeOfTags(["derelict_mech"])).toBe("cottage");
    expect(archetypeOfTags(["bio_pod"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
      const facade = xenoFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(xenoFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("stoa").roof).toBe("gable");
    expect(archetypeFacadeDefaults("tholos").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.note, a).toBeDefined();
      expect(entry?.tags, a).toContain("alien_scifi");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === a),
        a,
      ).toHaveLength(1);
    }
    expect(structureById("xeno_spire")?.category).toBe("fantasy");
    expect(structureById("hive_mound")?.category).toBe("fantasy");
    expect(structureById("hydroponics_bay")?.category).toBe("science");
    for (const p of XENO_PROP_NAMES) {
      expect(structureById(p)?.kind, p).toBe("prop");
      expect(structureById(p)?.status, p).toBe("implemented");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the theme                                                                   */
/* -------------------------------------------------------------------------- */

describe("the xeno-resin theme", () => {
  it("is reachable by name and deliberately outside the seeded draw", () => {
    expect(XENO_RESIN_THEME.id).toBe(XENO_RESIN_THEME_ID);
    expect(ALL_MATERIAL_THEMES.map((t) => t.id)).toContain(XENO_RESIN_THEME_ID);
    // The whole reason it is named-only: a member added to `MATERIAL_THEMES`
    // rerolls every seeded theme draw ever taken, and therefore every shipped
    // world. Same argument as `modern_city`, `white_quartz` and `sun_clay`.
    expect(MATERIAL_THEMES.map((t) => t.id)).not.toContain(XENO_RESIN_THEME_ID);
    expect(pickTheme(S, XENO_RESIN_THEME_ID).id).toBe(XENO_RESIN_THEME_ID);
    expect(MATERIAL_THEMES.map((t) => t.id)).toContain(pickTheme(S).id);
  });

  it("has the shape every theme has, and says the two things it must not", () => {
    expect(XENO_RESIN_THEME.woods.length).toBeGreaterThanOrEqual(3);
    expect(XENO_RESIN_THEME.stones.length).toBeGreaterThanOrEqual(2);
    expect(XENO_RESIN_THEME.roofs.length).toBeGreaterThanOrEqual(2);
    // Not a dry country — a hive has none of its own, and it lands on a farm
    // town or in wet overgrown ruins. See the doc comment.
    expect(XENO_RESIN_THEME.aridAmbient).toBeUndefined();
    // No curtain: a hive does not build a city wall, and silence keeps the
    // derived circuit byte for byte.
    expect(XENO_RESIN_THEME.curtain).toBeUndefined();
    for (const w of XENO_RESIN_THEME.woods) {
      for (const role of Object.values(w)) expect(typeof role).toBe("string");
      // The `wood()` trap: an id that IS a plank family makes the theme sweep
      // demand a whole derived set that the nether woods do not have.
      expect(w.id.endsWith("_planks")).toBe(false);
    }
  });

  it("reads alien: nothing in it is a block a mason would recognise", () => {
    const surfaces = XENO_RESIN_THEME.woods.map((w) => w.planks);
    expect(surfaces).toContain("nether_wart_block");
    expect(surfaces).toContain("warped_wart_block");
    for (const s of surfaces) {
      expect(s.endsWith("_planks"), s).toBe(false);
      expect(s.includes("cobblestone"), s).toBe(false);
    }
  });

  it("deals a whole distinct triple to a dozen buildings", () => {
    const dealt = assignMaterials(XENO_RESIN_THEME, 12, S);
    expect(dealt).toHaveLength(12);
    const keys = new Set(dealt.map((m) => `${m.wood.id}|${m.stone.id}|${m.roof.id}`));
    expect(keys.size).toBe(12);
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the alien pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
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
    for (const a of XENO_BUILDING_ARCHETYPES) {
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
    for (const a of XENO_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const door = result.meta.door;
        expect(door, `${a} ${size.join("x")} door`).not.toBeNull();
        if (door === null) continue;
        const at = indexOf(result.ops);
        // The cell straight inside the door, both courses of it, and it must
        // be part of the floor the fit-out left walkable.
        const step = { north: [0, 1], south: [0, -1], east: [-1, 0], west: [1, 0] }[door.face] as [
          number,
          number,
        ];
        const inX = door.x + step[0];
        const inZ = door.z + step[1];
        const label = `${a} ${size.join("x")} inside the door at ${inX},${inZ}`;
        expect(passableBlock(at.get(`${inX},1,${inZ}`)?.block), label).toBe(true);
        expect(passableBlock(at.get(`${inX},2,${inZ}`)?.block), label).toBe(true);
        expect(freeCells(result), label).toContain(`${inX},${inZ}`);
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
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
    for (const a of XENO_BUILDING_ARCHETYPES) {
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
   * The forms themselves — one assertion per building, and each one is the
   * thing a stranger would name the building by.
   */
  it("builds the thing each archetype is for", () => {
    // THE SPIRE. Two claims, and they are the pack's headline between them.
    const spire = build("xeno_spire", BIG, { floors: 1 });
    const base = spire.meta.wallTop + 1;
    const top = spire.meta.roofTop + ROOF_FLOURISH_RISE;
    // 1. it TAPERS: the neck is narrower than the foot, and the head narrower
    //    than the neck. A mass that does not narrow is a second storey.
    const foot = course(spire, base + 1).length;
    const neck = course(spire, base + Math.floor((top - base) / 2)).length;
    const head = course(spire, top).length;
    expect(foot, "the stalk's foot").toBeGreaterThan(neck);
    expect(neck, "the stalk's neck").toBeGreaterThan(head);
    expect(head, "the stalk's head").toBeGreaterThan(0);
    // 2. it TWISTS: the point is not over the middle of the plan it stands on.
    //    This is the single line between "grown" and "steeple".
    const crown = course(spire, top)[0] as LocalVoxelOp;
    const mx = (spire.meta.size[0] - 1) >> 1;
    const mz = (spire.meta.size[2] - 1) >> 1;
    expect(crown.x !== mx || crown.z !== mz, "the axis leans").toBe(true);
    // …and the shell is the hive's own, in any palette: fibre, not masonry.
    expect(has(spire, "nether_wart_block"), "the chitin").toBe(true);
    expect(has(spire, "shroomlight"), "the glow").toBe(true);
    expect(has(spire, "crimson_stem"), "the ribs").toBe(true);

    // THE MOUND: low, and with three standable ways in.
    const mound = build("hive_mound", BIG, { floors: 1 });
    const mBase = mound.meta.wallTop + 1;
    const crest = Math.max(...mound.ops.filter((o) => o.block !== "air").map((o) => o.y));
    expect(crest - mBase, "the mound's rise over the plate").toBeLessThan(mound.meta.size[0]);
    expect(course(mound, mBase + 1).length, "the mound's first course").toBeGreaterThan(
      course(mound, crest).length,
    );
    expect(mouths(mound), "the three tunnel mouths").toBeGreaterThanOrEqual(3);

    // THE BAY: trays, a lamp that is not sitting on a tray, and water.
    const bay = build("hydroponics_bay", BIG, { floors: 1 });
    expect(has(bay, "composter"), "the racked trays").toBe(true);
    expect(has(bay, "glowstone"), "the grow lamps").toBe(true);
    expect(has(bay, "water"), "the water plant").toBe(true);
    // A grow lamp is bracketed off the wall, never hung in mid air and never
    // sitting on the tray it lights. Both halves cost a theme sweep to learn:
    // a lamp ON a tray is `interior.blocked_column`, and `sea_lantern` two
    // courses over one is `unsupported.lantern` — the rule fires on any name
    // ending in `lantern`, which is why the block here is glowstone.
    const at = indexOf(bay.ops);
    const solid = (x: number, y: number, z: number): boolean => {
      const block = at.get(`${x},${y},${z}`)?.block;
      return block !== undefined && block !== "air";
    };
    let lamps = 0;
    for (const op of bay.ops) {
      if (op.block !== "glowstone") continue;
      lamps++;
      const where = `a grow lamp at ${op.x},${op.y},${op.z}`;
      expect(at.get(`${op.x},${op.y - 1},${op.z}`)?.block, where).not.toBe("composter");
      expect(
        solid(op.x + 1, op.y, op.z) ||
          solid(op.x - 1, op.y, op.z) ||
          solid(op.x, op.y, op.z + 1) ||
          solid(op.x, op.y, op.z - 1),
        `${where} is bracketed to something`,
      ).toBe(true);
    }
    expect(lamps, "the grow lamps").toBeGreaterThan(1);
  });

  /** Every mouth is a standable cell on both sides of the wall. */
  it("cuts no tunnel mouth a body cannot walk through", () => {
    for (const size of SIZES) {
      const mound = build("hive_mound", size, { floors: 1 });
      expect(mouths(mound), `${size.join("x")} ways in`).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * Nothing this pack builds floats — **anywhere in it, in any theme**.
   *
   * The physics lint's `floating.*` rules police a full cube with six air
   * faces, and the sanctum pack's lesson — "a stepped shell hangs its steps on
   * nothing" — is that rule met the hard way. Run across every theme, because
   * a theme is only as tested as the archetypes that used it and this pack
   * ships one of its own.
   */
  it("leaves no full block with six air faces, in any theme", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of XENO_BUILDING_ARCHETYPES) {
        for (const size of SIZES) {
          const result = buildIn(a, theme.id, size);
          expect(
            floaters(result).map((op) => `${op.block} at ${op.x},${op.y},${op.z}`),
            `${theme.id} / ${a} ${size.join("x")}`,
          ).toEqual([]);
        }
      }
    }
  }, 60_000);

  /**
   * …and nothing floats at any **shape** either, not just any envelope.
   *
   * THE SCAR THIS TEST IS. The envelope-only sweep above passed while the
   * theme sweep failed, because an envelope is not the whole input: the
   * dev-world grid and the pack's exhibit row build these three under roof
   * shapes, storey counts and window rhythms this file's own harness never
   * asked for, and the spire's massing is derived from exactly those. The
   * finding was a `shroomlight` in a spire's brood with air on all six faces,
   * at a cell whose only difference from the passing one was its params.
   *
   * So the guard is the *product*: every shape the grid cycles × every
   * envelope either grid uses × every registered theme. It is the same claim
   * the four-minute world readback makes, made in seconds against the op list.
   */
  it("leaves no full block with six air faces, at any shape, in any theme", () => {
    const found: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of XENO_BUILDING_ARCHETYPES) {
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
  }, 180_000);

  /**
   * THE GLOW RIDES THE STRUCTURE.
   *
   * The rule the last finding turned into a law: a light in this pack is a
   * full cube, so it is only ever written where the shell it belongs to is
   * already touching it. Asserted directly rather than only through
   * {@link floaters}, because the intent — a hive's lights are *part of the
   * hive* — is what a future edit needs told, and because a seam light that
   * quietly stopped being placed at all would slip past a floating check.
   */
  it("never writes a lit block that is not riding the structure", () => {
    let seen = 0;
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of XENO_BUILDING_ARCHETYPES) {
        for (const size of GRID_SIZES) {
          for (const shape of SHAPES) {
            const result = buildIn(a, theme.id, size, shape);
            const at = indexOf(result.ops);
            const solid = (x: number, y: number, z: number): boolean => {
              const block = at.get(`${x},${y},${z}`)?.block;
              return block !== undefined && block !== "air";
            };
            for (const op of lights(result)) {
              seen++;
              expect(
                solid(op.x + 1, op.y, op.z) ||
                  solid(op.x - 1, op.y, op.z) ||
                  solid(op.x, op.y, op.z + 1) ||
                  solid(op.x, op.y, op.z - 1) ||
                  solid(op.x, op.y + 1, op.z) ||
                  solid(op.x, op.y - 1, op.z),
                `${theme.id} / ${a} ${size.join("x")}: ${op.block} at ${op.x},${op.y},${op.z}`,
              ).toBe(true);
            }
          }
        }
      }
    }
    // …and the guard has not simply stopped placing lights: the hive glows.
    expect(seen, "lit blocks across the sweep").toBeGreaterThan(500);
  }, 180_000);

  /** And the room stays walkable in every theme too — the same cross-product. */
  it("leaves every ground floor one region, in any theme", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of XENO_BUILDING_ARCHETYPES) {
        const result = buildIn(a, theme.id);
        const free = freeCells(result);
        expect(free.length, `${theme.id} / ${a}`).toBeGreaterThan(3);
        expect(oneRegion(free), `${theme.id} / ${a} is one region`).toBe(true);
      }
    }
  }, 60_000);

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot, and hangs no signs", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
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

  /** Nothing here is alight: the glow is a block, never a fire. */
  it("lights no fire", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) {
        if (op.block.endsWith("_candle")) expect(op.props?.["lit"], `${a} candle`).toBe("false");
        if (op.block === "campfire") expect(op.props?.["lit"], `${a} campfire`).toBe("false");
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of XENO_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});

/**
 * How many separate standable ways into this building there are.
 *
 * Counted the way a walking agent would, and counted as **contiguous runs**
 * rather than as columns: a three-wide tunnel mouth is one way in, not three,
 * and a test that counted columns would have passed on a single wide hole.
 * A column is a way in when the wall cell is clear at `y = 1` and `y = 2` and
 * so is the apron cell straight outside it.
 */
function mouths(result: ReturnType<typeof generateBuilding>): number {
  const at = indexOf(result.ops);
  const [sx, , sz] = result.meta.size;
  const open = (x: number, y: number, z: number): boolean => {
    const block = at.get(`${x},${y},${z}`)?.block;
    return block === undefined || block === "air" || block.endsWith("_door");
  };
  const wayIn = (x: number, z: number, ox: number, oz: number): boolean =>
    open(x, 1, z) &&
    open(x, 2, z) &&
    open(x + ox, 1, z + oz) &&
    open(x + ox, 2, z + oz);
  const faces: readonly (readonly (readonly [number, number, number, number])[])[] = [
    Array.from({ length: sx }, (_, x) => [x, 0, 0, -1] as const),
    Array.from({ length: sx }, (_, x) => [x, sz - 1, 0, 1] as const),
    Array.from({ length: sz }, (_, z) => [0, z, -1, 0] as const),
    Array.from({ length: sz }, (_, z) => [sx - 1, z, 1, 0] as const),
  ];
  let runs = 0;
  for (const face of faces) {
    let inRun = false;
    for (const [x, z, ox, oz] of face) {
      const here = wayIn(x, z, ox, oz);
      if (here && !inRun) runs++;
      inRun = here;
    }
  }
  return runs;
}

/* -------------------------------------------------------------------------- */
/* the props                                                                   */
/* -------------------------------------------------------------------------- */

describe("the alien pack's props", () => {
  const make = (prop: string, seed = S): ReturnType<typeof generateProp> =>
    generateProp({ prop, seed });

  it("registers, and declares a box each stays inside", () => {
    for (const p of XENO_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isXenoProp(p)).toBe(true);
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
    expect(isXenoProp("gazebo")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  /** The huddle: glowing pods, exactly two split, and a stain under them. */
  it("builds a huddle of glowing pods with two of them split open", () => {
    const cluster = make("bio_pod_cluster");
    const at = indexOf(cluster.ops);
    const cores = cluster.ops.filter((op) => op.block === "shroomlight");
    expect(cores.length, "the glowing pods").toBeGreaterThan(2);
    // A closed pod is a shell with the glow on top; a split one is the glow at
    // the foot with stairs peeled back round it. Exactly two split, always.
    const split = cores.filter((op) => op.y === 1);
    expect(split, "the split pods").toHaveLength(2);
    expect(
      cluster.ops.some((op) => op.block.endsWith("_stairs")),
      "the peeled shell",
    ).toBe(true);
    // The stain: every pod stands on it, so no egg is standing on air.
    expect(cluster.ops.some((op) => op.block === "sculk"), "the stain").toBe(true);
    for (const op of cluster.ops) {
      if (op.y !== 1) continue;
      expect(at.get(`${op.x},0,${op.z}`), `pod foot at ${op.x},${op.z}`).toBeDefined();
    }
  });

  /** The wreck: a hull, a dark cockpit, and legs that do not match. */
  it("builds a fallen machine with one leg under it and one thrown out", () => {
    const mech = make("derelict_mech");
    const [sx, , sz] = mech.meta.size;
    expect(mech.ops.some((op) => op.block === "tinted_glass"), "the dark canopy").toBe(true);
    // The cockpit is DARK: the only lamp in the wreck is unlit.
    for (const op of mech.ops) {
      if (op.block === "redstone_lamp") expect(op.props?.["lit"], "the cockpit").toBe("false");
    }
    // The plates are sprung, not shut.
    const plates = mech.ops.filter((op) => op.block === "iron_trapdoor");
    expect(plates.length, "the opened hull plates").toBeGreaterThan(1);
    for (const p of plates) expect(p.props?.["open"], "a sprung plate").toBe("true");
    // The pose is a FALL, not a chassis: the two flanks carry different mass.
    const mid = (sx - 1) >> 1;
    const left = mech.ops.filter((op) => op.x < mid).length;
    const right = mech.ops.filter((op) => op.x > mid).length;
    expect(left, "the flanks differ").not.toBe(right);
    // And it is long: a walker is read by its length on the ground.
    expect(sz).toBeGreaterThan(sx);
  });

  /** No block of either prop floats: everything rests on the base plane or its own kind. */
  it("leaves nothing standing on air", () => {
    for (const p of XENO_PROP_NAMES) {
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
          solid(op.x + 1, op.y, op.z) ||
          solid(op.x - 1, op.y, op.z) ||
          solid(op.x, op.y, op.z + 1) ||
          solid(op.x, op.y, op.z - 1);
        expect(touching, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(true);
      }
    }
  });

  it("is deterministic, and keeps its box when the seed changes", () => {
    for (const p of XENO_PROP_NAMES) {
      expect(JSON.stringify(make(p).ops), p).toBe(JSON.stringify(make(p).ops));
      const other = make(p, OTHER);
      expect(other.meta.size, p).toEqual(make(p).meta.size);
      expect(other.ops.length, p).toBeGreaterThan(5);
    }
  });

  /** The wreck falls a different way on a different seed — the pose is drawn. */
  it("draws the wreck's pose from the seed", () => {
    const poses = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const seed = nodeSeed(0xa11e_5ce7n, `world.wreck_${i}`);
      const ops = generateProp({ prop: "derelict_mech", seed }).ops;
      const plate = ops.find((op) => op.block === "iron_trapdoor");
      poses.add(plate === undefined ? "none" : String(plate.props?.["facing"]));
    }
    expect(poses.size, "both flanks fall").toBeGreaterThan(1);
  });
});
