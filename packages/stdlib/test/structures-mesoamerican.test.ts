/**
 * The **Mesoamerican jungle pack** — fifteen archetypes on the Nile pack's
 * harness.
 *
 * The harness is deliberately the one every earlier wave was held to — a new
 * archetype that needs a new kind of guarantee is a new archetype nobody can
 * reason about — so this file re-walks all of it: registration, tag resolution
 * without theft, a furnished room that stays one walkable region, the door
 * standable over every envelope, the lantern column never being the only
 * route, the envelope itself, determinism, and nothing hanging from air.
 *
 * Plus the properties this pack exists to prove:
 *
 * - **the stair is climbable.** A Mesoamerican pyramid *is* its stair, and a
 *   stack of full blocks with no tread is a wall with a texture on it. Every
 *   riser is a real stair block with two courses of air over it;
 * - **no interior column reaches the ceiling**, because this pack raises
 *   stelae and hot stones on purpose and `interior.blocked_column` is the
 *   rule that punishes one;
 * - **no `mud` and no `farmland`** — both are fifteen sixteenths of a cube,
 *   and the milpa's beds are whole blocks;
 * - **no `*lantern`, no `chain`, no sign, no vine**, in any theme.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  MESOAMERICAN_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isMesoamericanArchetype,
  mesoamericanFacadeDefaults,
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

const S = nodeSeed(0x0e11_e5a2n, "world.meso");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [17, 18, 19];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 13, 13], [9, 11, 9]];

/** Roof shapes and storey counts the dev grid and the exhibit rows use. */
const SHAPES: readonly Record<string, unknown>[] = Object.freeze([
  { roof: "gable", floors: 1 },
  { roof: "hip", floors: 1 },
  { roof: "flat", floors: 1 },
  { roof: "pyramid", floors: 1 },
  { roof: "gable", floors: 2 },
  { roof: "hip", floors: 1, windowShape: "single", windowRhythm: "none" },
]);

/** Envelopes the dev grid actually uses. */
const GRID_SIZES: readonly (readonly [number, number, number])[] = Object.freeze([
  [7, 8, 7],
  [9, 8, 9],
  [11, 8, 8],
  [13, 8, 7],
  [17, 18, 19],
]);

function paramsOf(archetype: string, extra: Record<string, unknown>): Record<string, unknown> {
  const facade = mesoamericanFacadeDefaults(archetype);
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

/** The same building, dealt one theme's materials instead of the pinned style. */
function buildIn(
  archetype: string,
  themeId: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
): ReturnType<typeof generateBuilding> {
  const label = `${themeId}.${archetype}.${size.join("x")}.${JSON.stringify(extra)}`;
  const seed = nodeSeed(0x0e11_e5a2n, `world.meso.${label}`);
  const materials = assignMaterials(pickTheme(seed, themeId), 1, seed)[0] as BuildingMaterials;
  return generateBuilding({ size, params: paramsOf(archetype, extra), seed, materials });
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

describe("the Mesoamerican jungle pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isMesoamericanArchetype(a)).toBe(true);
    }
    expect(isMesoamericanArchetype("cottage")).toBe(false);
    expect(isMesoamericanArchetype("pyramid")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
    expect(MESOAMERICAN_BUILDING_ARCHETYPES).toHaveLength(15);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["step_pyramid"])).toBe("step_pyramid");
    expect(archetypeOfTags(["teocalli"])).toBe("step_pyramid");
    expect(archetypeOfTags(["jaguar_temple"])).toBe("jaguar_temple");
    expect(archetypeOfTags(["serpent_stair"])).toBe("serpent_stair");
    expect(archetypeOfTags(["stela_plaza"])).toBe("stela_plaza");
    expect(archetypeOfTags(["ball_court"])).toBe("ball_court");
    expect(archetypeOfTags(["pok_ta_pok"])).toBe("ball_court");
    expect(archetypeOfTags(["caracol"])).toBe("round_observatory");
    expect(archetypeOfTags(["palace_range"])).toBe("palace_range");
    expect(archetypeOfTags(["ramada"])).toBe("market_ramada");
    expect(archetypeOfTags(["tzompantli"])).toBe("tzompantli_rack");
    expect(archetypeOfTags(["chultun"])).toBe("chultun_cistern");
    expect(archetypeOfTags(["sacbe"])).toBe("sacbe_terminus");
    expect(archetypeOfTags(["milpa"])).toBe("milpa_terrace");
    expect(archetypeOfTags(["canoe_landing"])).toBe("canoe_landing");
    expect(archetypeOfTags(["na_house"])).toBe("thatch_dwelling");
    expect(archetypeOfTags(["temazcal"])).toBe("temazcal_bath");
    // THE NEAR MISSES. Every one of these belongs to an older table, and this
    // pack owning Mesoamerica's *ids* must not have moved one of the older
    // *words*.
    expect(archetypeOfTags(["temple"])).not.toBe("jaguar_temple");
    expect(archetypeOfTags(["shrine"])).not.toBe("jaguar_temple");
    expect(archetypeOfTags(["observatory"])).not.toBe("round_observatory");
    expect(archetypeOfTags(["market"])).not.toBe("market_ramada");
    expect(archetypeOfTags(["terrace"])).not.toBe("milpa_terrace");
    expect(archetypeOfTags(["ziggurat"])).toBe("ziggurat");
    // And bare `pyramid` is still claimed by NOBODY: it names the Nile pack's
    // prop and is a roof value in `core.ts` besides.
    expect(archetypeOfTags(["pyramid"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
      const facade = mesoamericanFacadeDefaults(a);
      expect(facade.roof, a).toBe("hip");
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(mesoamericanFacadeDefaults("cottage")).toEqual({});
    const blind = MESOAMERICAN_BUILDING_ARCHETYPES.filter(
      (a) => mesoamericanFacadeDefaults(a).windowRhythm === "none",
    );
    expect(blind).toHaveLength(13);
    // …and it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("mastaba").windowRhythm).toBe("none");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.note, a).toBeDefined();
      expect(entry?.tags, a).toContain("mesoamerican_jungle");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === a),
        a,
      ).toHaveLength(1);
    }
    expect(structureById("step_pyramid")?.category).toBe("religious");
    expect(structureById("milpa_terrace")?.category).toBe("rural");
    expect(structureById("round_observatory")?.category).toBe("science");
    // The three rows whose curator kind is not `building` are realised as
    // buildings and say so — the `careening_beach` precedent.
    for (const id of ["chultun_cistern", "sacbe_terminus", "canoe_landing"]) {
      expect(structureById(id)?.kind, id).toBe("building");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the Mesoamerican jungle pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
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

  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
        const free = freeCells(result).filter((k) => k !== lamp);
        expect(oneRegion(free), `${a} ${size.join("x")} without the lantern cell`).toBe(true);
      }
    }
  }, 60_000);

  /** THE DOOR RULE: a way in you cannot stand in is a texture, not a door. */
  it("leaves the door standable and the doorstep clear", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
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
          const outX = door.x - step[0];
          const outZ = door.z - step[1];
          expect(passableBlock(at.get(`${outX},1,${outZ}`)?.block), `${label} doorstep`).toBe(true);
          expect(passableBlock(at.get(`${outX},2,${outZ}`)?.block), `${label} doorstep`).toBe(true);
        }
      }
    }
  }, 120_000);

  /** RULE 5: no interior column is solid floor to ceiling. */
  it("caps every interior column short of the ceiling", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
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
  }, 60_000);

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
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
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
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
  }, 60_000);

  it("writes no block with six air faces, at any shape", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
      for (const size of GRID_SIZES) {
        for (const shape of SHAPES) {
          const stray = floaters(build(a, size, shape));
          expect(
            stray.map((op) => `${a} ${size.join("x")}: ${op.block} at ${op.x},${op.y},${op.z}`),
          ).toEqual([]);
        }
      }
    }
  }, 120_000);

  /** THE BANNED SUBSTANCES, rules 9 and 10, in every theme. */
  it("places no `mud`, no `farmland`, no lantern, no chain, no sign, no vine", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
        for (const op of buildIn(a, theme.id).ops) {
          const label = `${theme.id} / ${a} / ${op.block}`;
          expect(op.block, label).not.toBe("mud");
          expect(op.block, label).not.toBe("farmland");
          expect(op.block, label).not.toBe("chain");
          expect(op.block, label).not.toBe("vine");
          expect(op.block.endsWith("_sign"), label).toBe(false);
        }
      }
    }
  }, 60_000);

  /**
   * THE HANGER RULE, inherited from the Nile pack: `unsupported.chain` walks a
   * hanging block's support upward and fails it the moment the cell above is
   * air, and every archetype here re-lays the volume over the ceiling plane
   * the shell hangs its lantern from.
   */
  it("leaves nothing hanging from air, at any shape, in any theme", () => {
    const stranded: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
        for (const size of GRID_SIZES) {
          for (const shape of SHAPES) {
            const result = buildIn(a, theme.id, size, shape);
            const at = indexOf(result.ops);
            for (const op of result.ops) {
              if (op.props?.["hanging"] !== "true") continue;
              const above = at.get(`${op.x},${op.y + 1},${op.z}`);
              if (above !== undefined && above.block !== "air") continue;
              stranded.push(
                `${theme.id} / ${a} ${size.join("x")}: ${op.block} at ${op.x},${op.y},${op.z}`,
              );
            }
          }
        }
      }
    }
    expect(stranded.slice(0, 12)).toEqual([]);
  }, 240_000);

  it("is deterministic: the same seed builds the same building", () => {
    for (const a of MESOAMERICAN_BUILDING_ARCHETYPES) {
      const one = build(a);
      const two = build(a);
      expect(JSON.stringify(two.ops), a).toBe(JSON.stringify(one.ops));
    }
  }, 30_000);

  /**
   * RULE 8, and the pack's own scar: **the stair is the building.**
   *
   * Every riser the pyramid and the serpent stair write is a real stair block
   * standing on the tier below it, with the two courses over its tread left
   * air — which is what "climbable" means to a body rather than to a render.
   */
  it("builds a stair a body can actually climb", () => {
    for (const a of ["step_pyramid", "serpent_stair"]) {
      const result = build(a, BIG, { floors: 1 });
      const at = indexOf(result.ops);
      const base = result.meta.wallTop + 1;
      const risers = result.ops.filter((op) => op.y > base && op.block.endsWith("_stairs"));
      expect(risers.length, `${a} has a flight`).toBeGreaterThan(1);
      for (const step of risers) {
        const under = at.get(`${step.x},${step.y - 1},${step.z}`)?.block;
        expect(under, `${a} riser at ${step.x},${step.y},${step.z} stands on something`).toBeDefined();
        expect(under, `${a} riser at ${step.x},${step.y},${step.z}`).not.toBe("air");
        for (const dy of [1, 2]) {
          const over = at.get(`${step.x},${step.y + dy},${step.z}`)?.block;
          expect(
            over === undefined || over === "air",
            `${a} headroom over ${step.x},${step.y},${step.z} (+${dy} is ${over ?? "nothing"})`,
          ).toBe(true);
        }
      }
      // …and the flight rises: more than one distinct course carries a riser.
      expect(new Set(risers.map((op) => op.y)).size, `${a} flight rises`).toBeGreaterThan(1);
    }
  });

  /** The forms themselves — one claim per building a stranger would name it by. */
  it("builds the thing each archetype is for", () => {
    // THE STEP PYRAMID. Tiers that shrink as they rise, and a carved crown.
    const pyramid = build("step_pyramid", BIG, { floors: 1 });
    const pBase = pyramid.meta.wallTop + 1;
    expect(course(pyramid, pBase).length, "the lid").toBeGreaterThan(50);
    expect(
      course(pyramid, pBase + 2).length,
      "each tier is smaller than the one under it",
    ).toBeLessThan(course(pyramid, pBase + 1).length);
    expect(has(pyramid, "chiseled_stone_bricks"), "the carved crown").toBe(true);

    // THE JAGUAR TEMPLE. A roof comb: a thin wall on the ridge, one cell thick.
    const temple = build("jaguar_temple", BIG, { floors: 1 });
    // Read a course ABOVE the cornice ring, where only the comb stands.
    const comb = course(temple, temple.meta.wallTop + 3);
    expect(comb.length, "the comb exists").toBeGreaterThan(0);
    expect(new Set(comb.map((op) => op.x)).size, "…and it is one cell thick").toBe(1);

    // THE BALL COURT. Two banks with an alley between them.
    const court = build("ball_court", BIG, { floors: 1 });
    const bank = course(court, court.meta.wallTop + 2);
    expect(bank.length, "the banks").toBeGreaterThan(0);
    const xs = bank.map((op) => op.x);
    expect(Math.max(...xs) - Math.min(...xs), "…stand apart").toBeGreaterThan(4);

    // THE OBSERVATORY. A round drum: its course is narrower at the corners.
    const caracol = build("round_observatory", BIG, { floors: 1 });
    const drum = course(caracol, caracol.meta.wallTop + 2);
    expect(drum.length, "the drum").toBeGreaterThan(4);
    const [osx, , osz] = caracol.meta.size;
    expect(
      drum.some((op) => op.x === 0 && op.z === 0),
      "a disc has no corner",
    ).toBe(false);
    expect(
      drum.some((op) => op.x === osx - 1 && op.z === osz - 1),
      "a disc has no corner",
    ).toBe(false);
    expect(has(caracol, "glowstone"), "the sightline light").toBe(true);

    // THE PALACE RANGE. A colonnade standing proud of the wall.
    const palace = build("palace_range", BIG, { floors: 1 });
    const [psx, , psz] = palace.meta.size;
    expect(
      palace.ops.filter(
        (op) =>
          op.block !== "air" &&
          (op.x === -1 || op.x === psx || op.z === -1 || op.z === psz) &&
          op.y > 2,
      ).length,
      "the colonnade",
    ).toBeGreaterThan(4);

    // THE SKULL RACK. Posts and beams in the apron, and NOTHING that is a head.
    const rack = build("tzompantli_rack", BIG, { floors: 1 });
    const [rsx, , rsz] = rack.meta.size;
    expect(
      rack.ops.filter(
        (op) =>
          op.block !== "air" &&
          (op.x === -1 || op.x === rsx || op.z === -1 || op.z === rsz) &&
          op.y > 1,
      ).length,
      "the frame",
    ).toBeGreaterThan(4);
    for (const op of rack.ops) {
      expect(op.block.includes("skull"), "restraint").toBe(false);
      expect(op.block.includes("head"), "restraint").toBe(false);
    }

    // THE MILPA. Beds written into the floor plane, in whole blocks.
    const milpa = build("milpa_terrace", BIG, { floors: 1 });
    expect(
      milpa.ops.some((op) => op.y === 0 && (op.block === "moss_block" || op.block === "coarse_dirt")),
      "the beds",
    ).toBe(true);

    // THE CHULTUN. A curbed mouth with water in it.
    const chultun = build("chultun_cistern", BIG, { floors: 1 });
    expect(has(chultun, "cauldron"), "the cistern's water").toBe(true);

    // THE SACBE TERMINUS. Steps all round the apron, facing out.
    const sacbe = build("sacbe_terminus", BIG, { floors: 1 });
    const [ssx, , ssz] = sacbe.meta.size;
    expect(
      sacbe.ops.filter(
        (op) =>
          op.y === 1 &&
          op.block.endsWith("_stairs") &&
          (op.x === -1 || op.x === ssx || op.z === -1 || op.z === ssz),
      ).length,
      "the steps",
    ).toBeGreaterThan(8);

    // THE THATCH DWELLING and THE TEMAZCAL. A mass over the plate, both.
    for (const a of ["thatch_dwelling", "temazcal_bath"]) {
      const hut = build(a, BIG, { floors: 1 });
      expect(course(hut, hut.meta.wallTop + 2).length, `${a} roof mass`).toBeGreaterThan(0);
    }
  });
});
