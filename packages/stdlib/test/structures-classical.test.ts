/**
 * The **classical Mediterranean pack**, first half: eleven buildings and one
 * prop, on the sanctum pack's harness.
 *
 * The harness is deliberately the same one every earlier wave was held to — a
 * new archetype that needs a new kind of guarantee is a new archetype nobody
 * can reason about — so this file re-walks all of it:
 *
 * - it registers, resolves and reads off a node's tags without stealing a word
 *   an earlier table already claims. This pack's near misses are as sharp as
 *   the sanctum's: it owns the **ids** `odeon` and `peristyle_house` and owns
 *   **neither of those words**;
 * - it puts something in the room it built, and the room stays one walkable
 *   region — across one and two storeys and three envelope sizes;
 * - the lantern column is never the room's only route;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, no sign blocks, no lit fire, and the same seed gives
 *   the same ops forever;
 * - nothing over the eave plate has six air faces.
 *
 * Plus the properties this pack exists to prove, all of them *silhouette*
 * properties, because Troy's lesson was that a right palette on a borrowed
 * form is a borrowed building:
 *
 * - **the colonnades stand on the ground.** A column whose foot is air is a
 *   column the support walk fails, and the apron is not always at `y = 1`;
 * - **the peripteral temple is peripteral** — a column on all four sides, not
 *   a porch on one;
 * - **the court buildings have a hole in the roof.** A peristyle house whose
 *   compluvium closed over is a cottage with columns in it;
 * - **the stoa's street face is open.** Two ranks of column and a walk
 *   between them, or it is a shed.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  CLASSICAL_BUILDING_ARCHETYPES,
  CLASSICAL_PROP_NAMES,
  PROP_NAMES,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  archetypeFacadeDefaults,
  archetypeOfTags,
  classicalFacadeDefaults,
  generateBuilding,
  generateProp,
  isClassicalArchetype,
  isClassicalProp,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xc1a5n, "world.classical");
const OTHER = nodeSeed(0xc1a5n, "world.classical.other");
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
  const facade = classicalFacadeDefaults(archetype);
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

/** Solid apron cells of one face, between the ground and the eave plate. */
function apronColumns(
  result: ReturnType<typeof generateBuilding>,
  face: "north" | "south" | "east" | "west",
): LocalVoxelOp[] {
  const [sx, , sz] = result.meta.size;
  return result.ops.filter((op) => {
    if (op.block === "air") return false;
    if (op.y < 2 || op.y >= result.meta.wallTop) return false;
    if (face === "west") return op.x === -1;
    if (face === "east") return op.x === sx;
    if (face === "north") return op.z === -1;
    return op.z === sz;
  });
}

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("the classical pack's registry", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isClassicalArchetype(a)).toBe(true);
    }
    expect(isClassicalArchetype("cottage")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
    expect(CLASSICAL_BUILDING_ARCHETYPES).toHaveLength(11);
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["stoa"])).toBe("stoa");
    expect(archetypeOfTags(["portico"])).toBe("stoa");
    expect(archetypeOfTags(["peristyle_house"])).toBe("peristyle_house");
    expect(archetypeOfTags(["domus"])).toBe("peristyle_house");
    expect(archetypeOfTags(["megaron"])).toBe("megaron");
    expect(archetypeOfTags(["anaktoron"])).toBe("megaron");
    expect(archetypeOfTags(["propylaea"])).toBe("propylaea");
    expect(archetypeOfTags(["propylon"])).toBe("propylaea");
    expect(archetypeOfTags(["bouleuterion"])).toBe("bouleuterion");
    expect(archetypeOfTags(["council_house"])).toBe("bouleuterion");
    expect(archetypeOfTags(["peripteral_temple"])).toBe("peripteral_temple");
    expect(archetypeOfTags(["doric_temple"])).toBe("peripteral_temple");
    expect(archetypeOfTags(["tholos"])).toBe("tholos");
    expect(archetypeOfTags(["round_temple"])).toBe("tholos");
    expect(archetypeOfTags(["rotunda"])).toBe("tholos");
    expect(archetypeOfTags(["sanctuary_treasury"])).toBe("sanctuary_treasury");
    expect(archetypeOfTags(["thesauros"])).toBe("sanctuary_treasury");
    expect(archetypeOfTags(["palaestra"])).toBe("palaestra");
    expect(archetypeOfTags(["gymnasion"])).toBe("gymnasion");
    expect(archetypeOfTags(["xystos"])).toBe("gymnasion");
    expect(archetypeOfTags(["odeion"])).toBe("odeon");
    expect(archetypeOfTags(["concert_hall"])).toBe("odeon");
    // THE NEAR MISSES. Every one of these belongs to an older table, and this
    // pack owning the *ids* must not have moved one of the *words*.
    expect(archetypeOfTags(["odeon"])).toBe("amphitheater");
    expect(archetypeOfTags(["peristyle"])).toBe("temple");
    expect(archetypeOfTags(["classical_temple"])).toBe("temple");
    expect(archetypeOfTags(["temple"])).toBe("church");
    expect(archetypeOfTags(["courtyard"])).toBe("courtyard_house");
    expect(archetypeOfTags(["courtyard_house"])).toBe("courtyard_house");
    expect(archetypeOfTags(["gymnasium"])).toBe("gym");
    expect(archetypeOfTags(["hippodrome"])).toBe("stadium");
    expect(archetypeOfTags(["amphitheatre"])).toBe("amphitheater");
    // `treasury` is deliberately unclaimed: it is a room in a bank as often as
    // it is a building in a sanctuary.
    expect(archetypeOfTags(["treasury"])).toBe("cottage");
    expect(archetypeOfTags(["nothing_in_particular"])).toBe("cottage");
  });

  it("gives every archetype a facade tendency, reachable from the shared entry", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      const facade = classicalFacadeDefaults(a);
      expect(facade.roof, a).toBeDefined();
      expect(facade.windowRhythm, a).toBeDefined();
      expect(archetypeFacadeDefaults(a), a).toEqual(facade);
    }
    expect(classicalFacadeDefaults("cottage")).toEqual({});
    // And it must not have broken the waves it falls through.
    expect(archetypeFacadeDefaults("church").roof).toBe("gable");
    expect(archetypeFacadeDefaults("temple").roof).toBe("gable");
    expect(archetypeFacadeDefaults("minaret").roof).toBe("hip");
  });

  it("is claimed by the catalog, and only where a generator answers", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.kind, a).toBe("building");
      expect(entry?.note, a).toBeDefined();
      expect(entry?.tags, a).toContain("classical_mediterranean");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
    expect(structureById("peripteral_temple")?.category).toBe("religious");
    expect(structureById("stoa")?.category).toBe("commercial");
    expect(structureById("palaestra")?.category).toBe("leisure");
    expect(structureById("hippodrome_spina")?.kind).toBe("prop");
    expect(structureById("hippodrome_spina")?.status).toBe("implemented");
  });
});

/* -------------------------------------------------------------------------- */
/* the buildings                                                               */
/* -------------------------------------------------------------------------- */

describe("the classical pack's buildings", () => {
  it("puts something in every room it builds", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
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
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp = `${Math.floor((it.x0 + it.x1) / 2)},${Math.floor((it.z0 + it.z1) / 2)}`;
        const free = freeCells(result).filter((k) => k !== lamp);
        expect(oneRegion(free), `${a} ${size.join("x")} without the lantern cell`).toBe(true);
      }
    }
  }, 30_000);

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
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
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
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
    // The stoa: a colonnade in the apron of the door's face, and the wall
    // behind it opened into a walk.
    const stoa = build("stoa", [15, 13, 21], { floors: 1 });
    expect(apronColumns(stoa, "south").length, "the outer rank").toBeGreaterThan(3);
    const [, , stoaSz] = stoa.meta.size;
    const opened = stoa.ops.filter(
      (op) => op.block === "air" && op.z === stoaSz - 1 && op.y > 0 && op.y < stoa.meta.wallTop,
    );
    expect(opened.length, "the opened street face").toBeGreaterThan(3);

    // The peristyle house: a hole in the middle of the roof.
    const house = build("peristyle_house", BIG, { floors: 1 });
    const hbase = house.meta.wallTop + 1;
    const hIndex = indexOf(house.ops);
    const hx = Math.floor((house.meta.interior.x0 + house.meta.interior.x1) / 2);
    const hz = Math.floor((house.meta.interior.z0 + house.meta.interior.z1) / 2);
    expect(hIndex.get(`${hx},${hbase},${hz}`)?.block, "the compluvium").toBe("air");
    expect(has(house, "light_gray_carpet"), "the stylobate band").toBe(true);

    // The megaron: an unlit hearth on the floor of one long room.
    const megaron = build("megaron", BIG, { floors: 1 });
    expect(has(megaron, "campfire"), "the hearth").toBe(true);
    expect(has(megaron, "red_carpet"), "the hall's carpet").toBe(true);

    // The propylaea: a passage cut clean through both ends.
    const gate = build("propylaea", BIG, { floors: 1 });
    const gIndex = indexOf(gate.ops);
    const gmid = (gate.meta.size[0] - 1) >> 1;
    expect(gIndex.get(`${gmid},2,0`)?.block, "the north end of the passage").toBe("air");
    // The south end is where the shell put its door, and the cut goes *round*
    // anything PRESERVE names — so the door survives standing in the middle of
    // an opened wall, and the bays either side of it are the passage.
    expect(gIndex.get(`${gmid},2,${gate.meta.size[2] - 1}`)?.block, "the door").toContain("door");
    expect(gIndex.get(`${gmid - 1},2,${gate.meta.size[2] - 1}`)?.block, "the south end").toBe(
      "air",
    );

    // The bouleuterion and the odeon: banks of seats.
    for (const a of ["bouleuterion", "odeon"] as const) {
      const room = build(a, BIG, { floors: 1 });
      const seats = room.ops.filter((op) => op.block.endsWith("_stairs") && op.y <= 2);
      expect(seats.length, `${a} seating`).toBeGreaterThan(5);
    }

    // The peripteral temple: a column on ALL FOUR sides. A porch on one side
    // is the sanctum temple, and this test is the line between them.
    const temple = build("peripteral_temple", [15, 16, 21], { floors: 1 });
    for (const face of ["north", "south", "east", "west"] as const) {
      expect(apronColumns(temple, face).length, `the peristyle on the ${face}`).toBeGreaterThan(1);
    }

    // The tholos: a cone that narrows, and closes on a solid cap.
    const tholos = build("tholos", [15, 16, 15], { floors: 1 });
    const tBase = tholos.meta.wallTop + 1;
    const widthAt = (y: number): number =>
      tholos.ops.filter((op) => op.y === y && op.block !== "air").length;
    expect(widthAt(tBase + 1), "the cone's first course").toBeGreaterThan(widthAt(tBase + 3));
    expect(has(tholos, "chiseled_stone_bricks"), "the finial").toBe(true);

    // The treasury: two columns and a pediment, at doll's-house scale.
    const treasury = build("sanctuary_treasury", [9, 11, 9], { floors: 1 });
    expect(apronColumns(treasury, "south").length, "the distyle porch").toBeGreaterThan(1);

    // The palaestra and the gymnasion: a sand court under an open roof.
    for (const a of ["palaestra", "gymnasion"] as const) {
      const yard = build(a, [15, 13, 21], { floors: 1 });
      expect(has(yard, "sand"), `${a} court`).toBe(true);
    }
    // And the gymnasion's flanks carry more column than the palaestra's, which
    // is the one thing that makes it read as the longer building.
    const palaestra = build("palaestra", [15, 13, 21], { floors: 1 });
    const gym = build("gymnasion", [15, 13, 21], { floors: 1 });
    expect(
      apronColumns(gym, "west").length,
      "the gymnasion's long colonnade",
    ).toBeGreaterThan(apronColumns(palaestra, "west").length);
  });

  /**
   * Every colonnade stands on the ground.
   *
   * Wave 4B's cathedral lesson, and the reason `footing` exists: the apron is
   * not always at `y = 1`, so a column that starts at `y = 1` starts in mid
   * air wherever the shell left the ground course empty.
   */
  it("stands every colonnade on something", () => {
    for (const a of ["stoa", "peripteral_temple", "palaestra", "megaron", "tholos"] as const) {
      for (const size of [BIG, [15, 16, 21]] as const) {
        const result = build(a, size, { floors: 1 });
        const at = indexOf(result.ops);
        const [sx, , sz] = result.meta.size;
        for (const op of result.ops) {
          const apron = op.x === -1 || op.x === sx || op.z === -1 || op.z === sz;
          if (!apron || op.y !== 1 || op.block === "air") continue;
          const under = at.get(`${op.x},0,${op.z}`);
          expect(under?.block, `${a} ${size.join("x")} foot at ${op.x},${op.z}`).toBeDefined();
          expect(under?.block, `${a} ${size.join("x")} foot at ${op.x},${op.z}`).not.toBe("air");
        }
      }
    }
  });

  /**
   * Nothing this pack builds over the eave plate floats.
   *
   * The physics lint's `floating.*` rule polices a full cube with six air
   * faces, and the sanctum pack's lesson — "a stepped shell hangs its steps on
   * nothing" — is that rule met the hard way. The check is the rule itself,
   * run against the finished op set.
   */
  it("leaves no full block above the plate with six air faces", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const at = indexOf(result.ops);
        const solid = (x: number, y: number, z: number): boolean => {
          const block = at.get(`${x},${y},${z}`)?.block;
          return block !== undefined && block !== "air";
        };
        for (const op of result.ops) {
          if (op.block === "air" || op.y <= result.meta.wallTop) continue;
          const touching =
            solid(op.x + 1, op.y, op.z) ||
            solid(op.x - 1, op.y, op.z) ||
            solid(op.x, op.y, op.z + 1) ||
            solid(op.x, op.y, op.z - 1) ||
            solid(op.x, op.y + 1, op.z) ||
            solid(op.x, op.y - 1, op.z);
          expect(touching, `${a} ${size.join("x")}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(
            true,
          );
        }
      }
    }
  }, 30_000);

  /** Every pot has a plant in it: a bare `flower_pot` renders empty. */
  it("never places a bare flower pot, and hangs no signs", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
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

  /** Nothing here is alight: the candles and the hearths are all unlit. */
  it("lights no fire", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      const result = build(a);
      for (const op of result.ops) {
        if (op.block.endsWith("_candle")) expect(op.props?.["lit"], `${a} candle`).toBe("false");
        if (op.block === "campfire") expect(op.props?.["lit"], `${a} campfire`).toBe("false");
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of CLASSICAL_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the prop                                                                    */
/* -------------------------------------------------------------------------- */

describe("the classical pack's prop", () => {
  const spina = (): ReturnType<typeof generateProp> =>
    generateProp({ prop: "hippodrome_spina", seed: S });

  it("registers, and declares a box it stays inside", () => {
    for (const p of CLASSICAL_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isClassicalProp(p)).toBe(true);
    }
    expect(isClassicalProp("gazebo")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);

    const result = spina();
    const [sx, sy, sz] = result.meta.size;
    for (const op of result.ops) {
      expect(op.x).toBeGreaterThanOrEqual(0);
      expect(op.x).toBeLessThan(sx);
      expect(op.z).toBeGreaterThanOrEqual(0);
      expect(op.z).toBeLessThan(sz);
      expect(op.y).toBeGreaterThanOrEqual(result.meta.minY);
      expect(op.y).toBeLessThan(result.meta.minY + sy);
    }
  });

  it("builds a barrier with a post at each end and a point in the middle", () => {
    const result = spina();
    const at = indexOf(result.ops);
    const [sx, , sz] = result.meta.size;
    const mid = (sx - 1) >> 1;
    // The plinth runs the whole length.
    for (let z = 0; z < sz; z++) {
      expect(at.get(`0,0,${z}`)?.block, `plinth at ${z}`).toBeDefined();
    }
    // A meta at each end, taller than the plinth.
    expect(at.get(`${mid},4,1`)?.block, "the north meta").toBeDefined();
    expect(at.get(`${mid},4,${sz - 2}`)?.block, "the south meta").toBeDefined();
    // The obelisk, and its point.
    expect(result.ops.some((op) => op.block === "end_rod"), "the obelisk's point").toBe(true);
  });

  /** No block of it floats: every cell rests on the plinth or on its own kind. */
  it("leaves nothing standing on air", () => {
    const result = spina();
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
      expect(touching, `${op.block} at ${op.x},${op.y},${op.z}`).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(spina().ops)).toBe(JSON.stringify(spina().ops));
  });
});
