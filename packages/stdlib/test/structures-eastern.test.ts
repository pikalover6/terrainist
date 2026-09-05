/**
 * The **East Asian pack**, built half: four buildings on the arcane and
 * classical packs' harness.
 *
 * The harness is deliberately the same one every earlier wave was held to — a
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about — so this file re-walks all of it: registration, tag
 * resolution **without theft**, a furnished room that stays one walkable
 * region reachable from the door, the envelope, no bare pots or signs or lit
 * fire, determinism, and no full block with six air faces.
 *
 * Three things get more than the usual attention:
 *
 * - **the input space is params AND envelope.** This pack's whole silhouette
 *   is *derived* — the tiers are built in the gap between the eave plate and
 *   the allowance — so a roof shape it was never built under is a **different
 *   building**, not the same building in a hat. The sweeps below walk
 *   {@link SHAPES} × {@link GRID_SIZES}, not defaults;
 * - **the drum tower's passage.** A gate tower whose way through is not
 *   standable is a wall with a picture of a gate on it, so the passage line
 *   from the door across the plan is checked as hard as the door itself;
 * - **the vocabulary is already spoken for.** `pagoda`, `tea_house`, `hanok`,
 *   `machiya`, `keep`, `castle`, `bell`, `bell_tower`, `pavilion`, `tower` and
 *   `gate` all belong to somebody else, and the near-miss test below is the
 *   guard that this pack owning the *ids* did not move one of the *words*.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, passableBlock } from "./helpers/walkability.js";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  EASTERN_BUILDING_ARCHETYPES,
  MATERIAL_THEMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  easternFacadeDefaults,
  generateBuilding,
  isEasternArchetype,
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

const S = nodeSeed(0xea57_00den, "world.eastern");
const OTHER = nodeSeed(0xea57_00den, "world.eastern.other");
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
  const facade = easternFacadeDefaults(archetype);
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
  const facade = easternFacadeDefaults(archetype);
  const label = `${themeId}.${archetype}.${size.join("x")}.${JSON.stringify(extra)}`;
  const seed = nodeSeed(0xea57_00den, `world.eastern.${label}`);
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

/**
 * Every block this op set writes that has six air faces.
 *
 * Checked from `y = 1` up, for the arcane and xeno packs' reason: `y = 0` is
 * exempt, and only `y = 0` — the floor plane and the apron's ground course
 * rest on terrain rather than on an op.
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

describe("the East Asian pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isEasternArchetype(a)).toBe(true);
    }
    expect(isEasternArchetype("cottage")).toBe(false);
    expect(isEasternArchetype("pagoda")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
    expect(EASTERN_BUILDING_ARCHETYPES).toHaveLength(4);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["tenshu_keep"])).toBe("tenshu_keep");
    expect(archetypeOfTags(["tenshu"])).toBe("tenshu_keep");
    expect(archetypeOfTags(["castle_keep"])).toBe("tenshu_keep");
    expect(archetypeOfTags(["japanese_castle"])).toBe("tenshu_keep");
    expect(archetypeOfTags(["drum_tower"])).toBe("drum_tower");
    expect(archetypeOfTags(["drum"])).toBe("drum_tower");
    expect(archetypeOfTags(["shoji_teahouse"])).toBe("shoji_teahouse");
    expect(archetypeOfTags(["shoji"])).toBe("shoji_teahouse");
    expect(archetypeOfTags(["tea_pavilion"])).toBe("shoji_teahouse");
    expect(archetypeOfTags(["garden_teahouse"])).toBe("shoji_teahouse");
    expect(archetypeOfTags(["bell_pavilion"])).toBe("bell_pavilion");
    expect(archetypeOfTags(["shoro"])).toBe("bell_pavilion");

    // THE NEAR MISSES. Every one of these belongs to an older table, and the
    // four houses this pack complements are the sharpest of them: a document
    // that says "pagoda" or "tea house" must keep getting the building it
    // already got before §3.9 existed.
    expect(archetypeOfTags(["pagoda"])).toBe("pagoda");
    expect(archetypeOfTags(["tea_house"])).toBe("tea_house");
    expect(archetypeOfTags(["hanok"])).toBe("hanok");
    expect(archetypeOfTags(["machiya"])).toBe("machiya");
    expect(archetypeOfTags(["keep"])).toBe("keep");
    expect(archetypeOfTags(["donjon"])).toBe("keep");
    expect(archetypeOfTags(["bell_tower"])).toBe("bell_tower");
    expect(archetypeOfTags(["belfry"])).toBe("bell_tower");
    expect(archetypeOfTags(["campanile"])).toBe("bell_tower");
    expect(archetypeOfTags(["shrine"])).toBe("church");
    expect(archetypeOfTags(["temple"])).toBe("church");

    // And the words this pack deliberately leaves unclaimed. Every one of them
    // names one of this pack's own PROPS or one of its infrastructure entries,
    // none of which is reached through this cascade: a node tagged `torii`
    // must not silently become a building.
    for (const word of [
      "torii",
      "zen_garden",
      "stone_lantern",
      "dragon_boat",
      "moon_gate",
      "paifang",
      "spirit_wall",
      "castle_base_wall",
      "pavilion",
    ]) {
      expect(archetypeOfTags([word]), word).toBe("cottage");
    }
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
      const facade = easternFacadeDefaults(a);
      expect(facade.roof, a).toBe("hip");
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(easternFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("blossom_shrine").roof).toBe("hip");
    expect(archetypeFacadeDefaults("stoa").roof).toBe("gable");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.tags, a).toContain("east_asian");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the East Asian pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
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
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          assertNoPockets(result, { label: `${a} ${size.join("x")} floors=${floors}` });
        }
      }
    }
  }, 30_000);

  it("stays walkable across every roof, storey count and rhythm the grid cycles", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
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
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
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
          expect(passableBlock(at.get(`${inX},1,${inZ}`)?.block), `${label} inside`).toBe(true);
          expect(passableBlock(at.get(`${inX},2,${inZ}`)?.block), `${label} headroom`).toBe(true);
          const floor = at.get(`${inX},0,${inZ}`)?.block;
          expect(floor, `${label} floor`).toBeDefined();
          expect(floor, `${label} floor is not water`).not.toBe("water");
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

  /**
   * THE PASSAGE RULE, which is the drum tower's whole claim: the line from the
   * door straight across the plan is a street, and **this fit-out writes
   * nothing on it**.
   *
   * Stated as "nothing of ours", not as "clear": the *shell* reserves a hearth
   * cell of its own and may put it anywhere on the ground floor, this pack's
   * fit-out never sees that decision, and the general walk
   * ({@link assertNoPockets}) is what proves the room stays crossable
   * regardless. What this file is responsible for is that the podium, the
   * paint, the drum stand and the arch soffit all stay off the through line.
   */
  it("writes nothing of its own on the drum tower's through passage", () => {
    for (const size of GRID_SIZES) {
      for (const shape of SHAPES) {
        const result = build("drum_tower", size, shape);
        const door = result.meta.door;
        if (door === null) continue;
        const label = `drum_tower ${size.join("x")} ${JSON.stringify(shape)}`;
        const at = indexOf(result.ops);
        const alongX = door.face === "east" || door.face === "west";
        for (const cell of result.meta.floorCells) {
          if (alongX ? cell.z !== door.z : cell.x !== door.x) continue;
          // The floor is there and it is not water — a passage is walked on.
          const floor = at.get(`${cell.x},0,${cell.z}`)?.block;
          expect(floor, `${label} floor at ${cell.x},${cell.z}`).toBeDefined();
          expect(floor, `${label} floor at ${cell.x},${cell.z}`).not.toBe("water");
          expect(OURS.test(floor as string), `${label} paint at ${cell.x},${cell.z}`).toBe(false);
          for (const y of [1, 2]) {
            const block = at.get(`${cell.x},${y},${cell.z}`)?.block;
            if (block === undefined) continue;
            expect(OURS.test(block), `${label} ours at ${cell.x},${y},${cell.z}`).toBe(false);
          }
        }
      }
    }
  }, 60_000);

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
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
   * The height half of the envelope check is held against the blocks this pack
   * is responsible for, for the arcane pack's measured reason: on a **flat**
   * roof the shell's own chimney stands two courses over
   * `roofTop + ROOF_FLOURISH_RISE` for every archetype in the catalog. The
   * plan half is held against every op, which is where a fit-out actually goes
   * wrong.
   */
  const OURS = /(deepslate_tile|red_concrete|white_terracotta|stone_bricks|bamboo|gold_block|glowstone)/;

  it("stays inside the envelope, in plan and in height", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
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

  /** THE FLOATING RULE, over the whole input space. */
  it("leaves no full block with six air faces, in any shape", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
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
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
      for (const theme of [...MATERIAL_THEMES.map((t) => t.id), "white_quartz"]) {
        for (const shape of [SHAPES[1], SHAPES[4]] as Record<string, unknown>[]) {
          const result = buildIn(a, theme, [13, 13, 13], shape);
          const label = `${a} ${theme} ${JSON.stringify(shape)}`;
          assertNoPockets(result, { label });
          expect(floaters(result).map((op) => op.block), label).toEqual([]);
        }
      }
    }
  }, 120_000);

  /**
   * THE HANGER CLOSURE, and the defect that bought it: the shell hangs its
   * lantern from the ceiling plane at `wallTop`, three of this pack's four
   * fit-outs delete and re-lay the volume over that plane, and the bell
   * pavilion — an *open* pavilion whose whole fit-out is above the plate —
   * shipped nine `unsupported.chain` findings at five of seven terrarium
   * stations in one row and none at the others. Envelope-dependent, so the
   * sweep is over the whole matrix in every theme, not over a default.
   */
  it("leaves nothing hanging from air, at any shape, in any theme", () => {
    const stranded: string[] = [];
    for (const theme of [...MATERIAL_THEMES.map((t) => t.id), "white_quartz"]) {
      for (const a of EASTERN_BUILDING_ARCHETYPES) {
        for (const size of GRID_SIZES) {
          for (const shape of SHAPES) {
            const result = buildIn(a, theme, size, shape);
            const at = indexOf(result.ops);
            for (const op of result.ops) {
              if (op.props?.["hanging"] !== "true") continue;
              const above = at.get(`${op.x},${op.y + 1},${op.z}`);
              if (above !== undefined && above.block !== "air") continue;
              stranded.push(
                `${theme} / ${a} ${size.join("x")} ${JSON.stringify(shape)}: ` +
                  `${op.block} at ${op.x},${op.y},${op.z} has ${above?.block ?? "nothing"} over it`,
              );
            }
          }
        }
      }
    }
    expect(stranded.slice(0, 12)).toEqual([]);
  }, 240_000);

  it("hangs no signs, lights no fire and plants no empty pot", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const op of build(a, size).ops) {
          expect(op.block, `${a} pot`).not.toBe("flower_pot");
          expect(op.block, `${a} fire`).not.toBe("campfire");
          expect(op.block.endsWith("_sign"), `${a} sign`).toBe(false);
          expect(op.block, `${a} chain`).not.toBe("chain");
        }
      }
    }
  });

  it("is deterministic, and reseeds without changing its envelope", () => {
    for (const a of EASTERN_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.size, a).toEqual(build(a).meta.size);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the forms                                                                   */
/* -------------------------------------------------------------------------- */

describe("the East Asian pack's forms", () => {
  /** The silhouette is the eave, and the eave is above the plate. */
  it("stacks tiers over the keep's eave plate, in tile", () => {
    const result = build("tenshu_keep");
    const above = result.ops.filter(
      (op) => op.y > result.meta.wallTop && op.block.startsWith("deepslate_tile"),
    );
    expect(above.length, "the keep is a stack of roofs").toBeGreaterThan(40);
    // And it flares: stairs, not just a lid of tiles.
    expect(above.some((op) => op.block === "deepslate_tile_stairs"), "the eave flares").toBe(true);
  });

  it("hangs the bell pavilion's bell from something solid", () => {
    const result = build("bell_pavilion");
    const at = indexOf(result.ops);
    const bell = result.ops.find((op) => op.block === "bell");
    expect(bell, "there is a bell").toBeDefined();
    if (bell === undefined) return;
    expect(bell.props?.["attachment"], "hung from the ceiling").toBe("ceiling");
    const above = at.get(`${bell.x},${bell.y + 1},${bell.z}`)?.block;
    expect(above, "the lid over the bell").toBeDefined();
    expect(above, "the lid is not air").not.toBe("air");
  });

  /**
   * The tea pavilion's note asks for a low crawl-in entry, and this fit-out
   * deliberately does not build one: the way in must stay standable. The
   * lintel that reads as one goes *beside* the door, never in it.
   */
  it("never narrows the tea pavilion's own doorway", () => {
    for (const size of GRID_SIZES) {
      const result = build("shoji_teahouse", size);
      const door = result.meta.door;
      if (door === null) continue;
      const at = indexOf(result.ops);
      for (const y of [1, 2]) {
        const cell = at.get(`${door.x},${y},${door.z}`)?.block;
        if (cell === undefined) continue;
        expect(
          /door/.test(cell) || passableBlock(cell),
          `${size.join("x")}: door column at y=${y} is ${cell}`,
        ).toBe(true);
      }
    }
  });
});
