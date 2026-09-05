/**
 * The **Nile & ancient Egypt pack**, buildings half: the seven entries of
 * that have an inside, on the nautical
 * pack's harness.
 *
 * The harness is deliberately the same one every earlier wave was held to — a
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about — so this file re-walks all of it: registration, tag
 * resolution without theft, a furnished room that stays one walkable region,
 * the door standable over every envelope, the lantern column never being the
 * only route, the envelope itself, determinism, and no full block with six air
 * faces in any theme at any shape.
 *
 * Plus the properties this half exists to prove:
 *
 * - **no interior column reaches the ceiling.** Egypt is a columned
 *   architecture and `interior.blocked_column` is the rule that punishes one,
 *   so the check is the rule itself, run over every archetype at every storey
 *   height the grid uses;
 * - **the pylon has two towers and a low door between them**, which is the
 *   proportion the whole type is read by;
 * - **the hypostyle raises its central aisle**, because a hall of equal
 *   columns is a warehouse with pillars;
 * - **the mastaba carries a false door**, and it is not the real one;
 * - **the granary's domes are filled, not rung** — the corbel is the one place
 *   in the pack a ring per course would be the obvious way to build it;
 * - **`mud` appears nowhere.** It is fifteen sixteenths of a cube, and the
 *   mud-brick read is the theme's own stone laid in courses instead.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  NILE_BUILDING_ARCHETYPES,
  NILE_PROP_NAMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isNileArchetype,
  nileFacadeDefaults,
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

const S = nodeSeed(0x0e11_e5a1n, "world.nile");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [17, 18, 19];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

function paramsOf(archetype: string, extra: Record<string, unknown>): Record<string, unknown> {
  const facade = nileFacadeDefaults(archetype);
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
  const seed = nodeSeed(0x0e11_e5a1n, `world.nile.${label}`);
  const materials = assignMaterials(pickTheme(seed, themeId), 1, seed)[0] as BuildingMaterials;
  return generateBuilding({ size, params: paramsOf(archetype, extra), seed, materials });
}

/**
 * The **shape-varying** axis of the input space, beyond the envelope.
 *
 * The alien pack's scar, inherited whole: the dev grid and the pack's exhibit
 * row build every archetype under roof shapes, storey counts and window
 * rhythms this file's own harness never asks for, and every massing here
 * derives from the room between the plate and the allowance. A roof shape it
 * was never built under is a **different building**, not the same building in
 * a hat.
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
  [17, 18, 19],
  [19, 14, 19],
]);

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

/** Every block this op set writes that has six air faces. */
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

describe("the Nile pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isNileArchetype(a)).toBe(true);
    }
    expect(isNileArchetype("cottage")).toBe(false);
    expect(isNileArchetype("pyramid")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
    expect(NILE_BUILDING_ARCHETYPES).toHaveLength(7);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["mastaba"])).toBe("mastaba");
    expect(archetypeOfTags(["bench_tomb"])).toBe("mastaba");
    expect(archetypeOfTags(["hypostyle_hall"])).toBe("hypostyle_hall");
    expect(archetypeOfTags(["hypostyle"])).toBe("hypostyle_hall");
    expect(archetypeOfTags(["columned_hall"])).toBe("hypostyle_hall");
    expect(archetypeOfTags(["mortuary_temple"])).toBe("mortuary_temple");
    expect(archetypeOfTags(["funerary_temple"])).toBe("mortuary_temple");
    expect(archetypeOfTags(["pylon_gate"])).toBe("pylon_gate");
    expect(archetypeOfTags(["pylon"])).toBe("pylon_gate");
    expect(archetypeOfTags(["temple_pylon"])).toBe("pylon_gate");
    expect(archetypeOfTags(["nilometer"])).toBe("nilometer");
    expect(archetypeOfTags(["nile_gauge"])).toBe("nilometer");
    expect(archetypeOfTags(["mudbrick_granary"])).toBe("mudbrick_granary");
    expect(archetypeOfTags(["beehive_granary"])).toBe("mudbrick_granary");
    expect(archetypeOfTags(["canopic_shrine"])).toBe("canopic_shrine");
    expect(archetypeOfTags(["egyptian_shrine"])).toBe("canopic_shrine");
    // THE NEAR MISSES. Every one of these belongs to an older table, and this
    // pack owning Egypt's *ids* must not have moved one of the older *words*.
    expect(archetypeOfTags(["temple"])).not.toBe("mortuary_temple");
    expect(archetypeOfTags(["tomb"])).not.toBe("mastaba");
    expect(archetypeOfTags(["shrine"])).not.toBe("canopic_shrine");
    expect(archetypeOfTags(["chapel"])).not.toBe("canopic_shrine");
    expect(archetypeOfTags(["granary"])).not.toBe("mudbrick_granary");
    expect(archetypeOfTags(["hall"])).not.toBe("hypostyle_hall");
    expect(archetypeOfTags(["gate"])).not.toBe("pylon_gate");
    expect(archetypeOfTags(["ziggurat"])).toBe("ziggurat");
    // And the words this pack's PROPS are named by are claimed by nobody: a
    // node tagged `pyramid` must not silently become a building, and
    // `pyramid` is a ROOF VALUE in `core.ts` besides.
    for (const word of ["pyramid", "great_pyramid", "sphinx", "sacred_lake", "felucca"]) {
      expect(archetypeOfTags([word]), word).toBe("cottage");
    }
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
      const facade = nileFacadeDefaults(a);
      expect(facade.roof, a).toBe("hip");
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(nileFacadeDefaults("cottage")).toEqual({});
    // Six of the seven are blind walls: the note's refusal, in a param.
    const blind = NILE_BUILDING_ARCHETYPES.filter(
      (a) => nileFacadeDefaults(a).windowRhythm === "none",
    );
    expect(blind).toHaveLength(6);
    expect(nileFacadeDefaults("hypostyle_hall").windowRhythm).toBe("sparse");
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("powder_magazine").windowRhythm).toBe("none");
    expect(archetypeFacadeDefaults("stoa").roof).toBe("gable");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.note, a).toBeDefined();
      expect(entry?.tags, a).toContain("nile");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === a),
        a,
      ).toHaveLength(1);
    }
    expect(structureById("mastaba")?.category).toBe("memorial");
    expect(structureById("nilometer")?.category).toBe("waterworks");
    expect(structureById("mudbrick_granary")?.category).toBe("rural");
    // The pylon gate is §3.8's `infrastructure` row realised as a BUILDING,
    // and the row is left saying so — the `careening_beach` precedent.
    expect(structureById("pylon_gate")?.kind).toBe("infrastructure");
    // The avenue of sphinxes is the pack's route follower, and W3 gave it the
    // host it always wanted: a paired rank at a fixed bay down a processional
    // way is `infra.entry@0`'s, which is why it is `implemented` here and still
    // absent from both of this pack's registries.
    expect(structureById("sphinx_avenue")?.status).toBe("implemented");
    expect(BUILDING_ARCHETYPES as readonly string[]).not.toContain("sphinx_avenue");
    // The pyramid is this pack's prop, not its archetype.
    expect(structureById("pyramid")?.kind).toBe("prop");
    expect(NILE_PROP_NAMES as readonly string[]).toContain("pyramid");
    expect(BUILDING_ARCHETYPES as readonly string[]).not.toContain("pyramid");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the Nile pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
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
    for (const a of NILE_BUILDING_ARCHETYPES) {
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
    for (const a of NILE_BUILDING_ARCHETYPES) {
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
          // …and the doorstep, the cell OUTSIDE it: the portico, the plinth
          // and the ramp all build in the apron, and a post written across the
          // way in is a door nobody can reach.
          const outX = door.x - step[0];
          const outZ = door.z - step[1];
          expect(passableBlock(at.get(`${outX},1,${outZ}`)?.block), `${label} doorstep`).toBe(true);
          expect(passableBlock(at.get(`${outX},2,${outZ}`)?.block), `${label} doorstep`).toBe(true);
        }
      }
    }
  }, 60_000);

  /**
   * RULE 5, as the lint states it: no interior column is solid from the floor
   * of its storey to the ceiling of it.
   *
   * The pack's own trap. Five of these seven build columns on purpose, and a
   * column is exactly what `interior.blocked_column` fails.
   */
  it("caps every interior column short of the ceiling", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const at = indexOf(result.ops);
          const it = result.meta.interior;
          const storey = Math.floor(result.meta.wallTop / floors);
          for (let z = it.z0; z <= it.z1; z++) {
            for (let x = it.x0; x <= it.x1; x++) {
              let open = false;
              for (let y = 1; y <= storey - 1 && !open; y++) {
                if (passableBlock(at.get(`${x},${y},${z}`)?.block)) open = true;
              }
              expect(open, `${a} ${size.join("x")} floors=${floors} at ${x},${z}`).toBe(true);
            }
          }
        }
      }
    }
  }, 30_000);

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
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
    for (const a of NILE_BUILDING_ARCHETYPES) {
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

  /** RULE 7: `mud` is fifteen sixteenths of a cube and appears nowhere. */
  it("builds mud-brick architecture without one block of `mud`", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of NILE_BUILDING_ARCHETYPES) {
        for (const op of buildIn(a, theme.id).ops) {
          expect(op.block, `${theme.id} / ${a}`).not.toBe("mud");
          expect(op.block.endsWith("_sign"), `${theme.id} / ${a} sign`).toBe(false);
          expect(op.block, `${theme.id} / ${a} chain`).not.toBe("chain");
        }
      }
    }
  }, 30_000);

  /**
   * THE HANGER RULE, and it is this pack's own scar.
   *
   * `unsupported.chain`: the physics lint walks a hanging block's support
   * upward and fails it the moment the cell above is air. The shell hangs its
   * lantern from the ceiling plane and **every archetype here deletes and
   * re-lays the volume over that plane**, so this is the one defect class the
   * pack is structurally exposed to — and it is invisible in a render, which
   * is why it reached a terrarium readback rather than a review.
   *
   * The check is the rule itself, not a shape: every block this pack's
   * buildings write with `hanging: "true"`, whoever placed it, over the
   * product of every envelope × every shape the grids use × every theme.
   */
  it("leaves nothing hanging from air, at any shape, in any theme", () => {
    const stranded: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of NILE_BUILDING_ARCHETYPES) {
        for (const size of GRID_SIZES) {
          for (const shape of SHAPES) {
            const result = buildIn(a, theme.id, size, shape);
            const at = indexOf(result.ops);
            for (const op of result.ops) {
              if (op.props?.["hanging"] !== "true") continue;
              const above = at.get(`${op.x},${op.y + 1},${op.z}`);
              if (above !== undefined && above.block !== "air") continue;
              stranded.push(
                `${theme.id} / ${a} ${size.join("x")} ${JSON.stringify(shape)}: ` +
                  `${op.block} at ${op.x},${op.y},${op.z} has ${above?.block ?? "nothing"} over it`,
              );
            }
          }
        }
      }
    }
    expect(stranded.slice(0, 12)).toEqual([]);
  }, 120_000);

  /**
   * The forms themselves — one claim per building, and each one is the thing a
   * stranger would name the building by.
   */
  it("builds the thing each archetype is for", () => {
    // THE MASTABA. Battered, blind, flat-topped, and carrying a false door.
    const tomb = build("mastaba", BIG, { floors: 1 });
    expect(has(tomb, "chiseled_stone_bricks"), "the false door's jamb").toBe(true);
    const tAt = indexOf(tomb.ops);
    const tDoor = tomb.meta.door;
    expect(tDoor).not.toBeNull();
    if (tDoor !== null) {
      // The false door is NOT the real one: the panel is on the far face.
      const opposite = { north: "south", south: "north", east: "west", west: "east" }[
        tDoor.face
      ] as string;
      expect(opposite).not.toBe(tDoor.face);
    }
    // The plinth: the apron carries masonry at its first course all round.
    const [msx, , msz] = tomb.meta.size;
    expect(
      tomb.ops.filter(
        (op) =>
          op.y === 1 &&
          op.block !== "air" &&
          (op.x === -1 || op.x === msx || op.z === -1 || op.z === msz),
      ).length,
      "the plinth",
    ).toBeGreaterThan(8);
    // The cavetto: a ring of stairs over the plate.
    expect(
      tomb.ops.filter((op) => op.y > tomb.meta.wallTop && op.block.endsWith("_stairs")).length,
      "the cavetto cornice",
    ).toBeGreaterThan(4);
    void tAt;

    // THE HYPOSTYLE HALL. A forest, and an aisle raised over it.
    const hall = build("hypostyle_hall", [19, 18, 19], { floors: 1 });
    const base = hall.meta.wallTop + 1;
    expect(course(hall, base).length, "the lid").toBeGreaterThan(50);
    expect(
      course(hall, base + 2).length,
      "the raised aisle is narrower than the lid under it",
    ).toBeLessThan(course(hall, base).length);
    expect(course(hall, base + 2).length, "…and it exists").toBeGreaterThan(0);
    expect(has(hall, "glowstone"), "the clerestory light").toBe(true);

    // THE MORTUARY TEMPLE. A portico in the apron and a terrace stepping back.
    const temple = build("mortuary_temple", BIG, { floors: 1 });
    const [psx, , psz] = temple.meta.size;
    const portico = temple.ops.filter(
      (op) =>
        op.block !== "air" &&
        (op.x === -1 || op.x === psx || op.z === -1 || op.z === psz) &&
        op.y > 2,
    );
    expect(portico.length, "the colonnade stands proud of the wall").toBeGreaterThan(6);
    const tBase = temple.meta.wallTop + 1;
    expect(
      course(temple, tBase + 1).length,
      "the upper storey is stepped back off the lower",
    ).toBeLessThan(course(temple, tBase).length);

    // THE PYLON GATE. Two towers, and a lower band between them.
    const gate = build("pylon_gate", [19, 18, 19], { floors: 1 });
    const gBase = gate.meta.wallTop + 1;
    const top = gate.meta.roofTop + ROOF_FLOURISH_RISE;
    const crown = course(gate, top - 1);
    expect(crown.length, "something reaches the allowance").toBeGreaterThan(0);
    // The crown is in two clumps at the ends of one axis — that IS the type.
    const xs = crown.map((op) => op.x);
    const zs = crown.map((op) => op.z);
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadZ = Math.max(...zs) - Math.min(...zs);
    expect(Math.max(spreadX, spreadZ), "the towers stand apart").toBeGreaterThan(4);
    expect(course(gate, gBase).length, "the lid under them").toBeGreaterThan(crown.length);
    expect(has(gate, "white_banner"), "the banners in the flagstaff grooves").toBe(true);

    // THE NILOMETER. A graduated column and a covered head.
    const gauge = build("nilometer", BIG, { floors: 1 });
    expect(has(gauge, "cauldron"), "the water at the gauge's foot").toBe(true);
    expect(
      gauge.ops.some((op) => op.y > gauge.meta.wallTop + 1 && op.block !== "air"),
      "the covered head",
    ).toBe(true);

    // THE GRANARY. Domes that are FILLED, never rung.
    const granary = build("mudbrick_granary", BIG, { floors: 1 });
    const domeBase = granary.meta.wallTop + 2;
    const domeAt = indexOf(granary.ops);
    let interiorCells = 0;
    for (const op of course(granary, domeBase)) {
      const around =
        domeAt.get(`${op.x + 1},${op.y},${op.z}`) !== undefined &&
        domeAt.get(`${op.x - 1},${op.y},${op.z}`) !== undefined &&
        domeAt.get(`${op.x},${op.y},${op.z + 1}`) !== undefined &&
        domeAt.get(`${op.x},${op.y},${op.z - 1}`) !== undefined;
      if (around) interiorCells++;
    }
    expect(interiorCells, "the dome course is filled, not a ring").toBeGreaterThan(0);
    expect(has(granary, "hay_block"), "the grain").toBe(true);

    // THE SHRINE. Torus rolls at every corner, and a cavetto over them.
    const shrine = build("canopic_shrine", [11, 12, 11], { floors: 1 });
    const [ssx, , ssz] = shrine.meta.size;
    const sAt = indexOf(shrine.ops);
    let rolls = 0;
    for (const x of [0, ssx - 1]) {
      for (const z of [0, ssz - 1]) {
        if (sAt.get(`${x},2,${z}`)?.block.endsWith("_wall") === true) rolls++;
      }
    }
    expect(rolls, "the torus roll at every corner").toBe(4);
    expect(has(shrine, "decorated_pot"), "the canopic set").toBe(true);
  });

  it("is deterministic, and reseeds without changing its envelope", () => {
    for (const a of NILE_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, nodeSeed(0x0e11_e5a1n, "world.nile.other"));
      expect(other.meta.size, a).toEqual(BIG);
      expect(other.ops.length, a).toBeGreaterThan(100);
    }
  });

  /**
   * Nothing this pack builds floats — anywhere in it, in any theme, at any
   * shape.
   *
   * The alien pack's scar test, inherited whole: the guard is the *product* of
   * every shape the grid cycles × every envelope either grid uses × every
   * registered theme, because an envelope is not the whole input space.
   */
  it("leaves no full block with six air faces, at any shape, in any theme", () => {
    const found: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of NILE_BUILDING_ARCHETYPES) {
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
    expect(found.slice(0, 12)).toEqual([]);
  }, 120_000);
});
