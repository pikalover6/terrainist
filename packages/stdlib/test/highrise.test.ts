/**
 * High-rise grammar tests.
 *
 * The centrepiece is {@link walkable}: a traversal simulation over the op list,
 * mirroring the rules `compiler/src/emit/physics.ts` walks a finished world
 * with — level steps, a half-block rise onto the front of a bottom stair, a
 * drop of up to three, ladders — and nothing else. A tower is mostly
 * circulation, so "can a player get to every floor" is not one property among
 * many here; it is the property, and it is asserted at unit speed against the
 * ops rather than at world-build speed against a region file.
 *
 * The physics lint still runs over the dev world's four tall rows in
 * `compiler/test/physics.test.ts`, and that is the real check. This one is the
 * fast one that says *which* geometry broke.
 */

import { describe, expect, it } from "vitest";

import {
  HIGHRISE_ARCHETYPES,
  HIGHRISE_MAX_FLOORS,
  HIGHRISE_STOREY_HEIGHT,
  MODERN_CITY_THEME,
  MODERN_CITY_THEME_ID,
  archetypeOfTags,
  assignMaterials,
  coreDepthFor,
  generateBuilding,
  highriseArchetypeOfTags,
  isHighriseArchetype,
  nodeSeed,
  pickTheme,
  type BuildingResult,
  type LocalVoxelOp,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

function build(
  archetype: string,
  size: readonly [number, number, number],
  floors: number,
  floorHeight = HIGHRISE_STOREY_HEIGHT,
): BuildingResult {
  const seed = nodeSeed(0x7a11n, `world.${archetype}`);
  const theme = pickTheme(seed, MODERN_CITY_THEME_ID);
  const materials = assignMaterials(theme, 1, seed)[0];
  return generateBuilding({
    size,
    seed,
    materials,
    params: { archetype, floors, floorHeight },
  });
}

/** Block name at a cell, or `undefined` for air. */
function indexOps(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  return new Map(ops.map((o) => [`${o.x},${o.y},${o.z}`, o]));
}

/**
 * The walking agent's block vocabulary, restated.
 *
 * Copied from `physics.ts` on purpose rather than imported: `stdlib` sits below
 * `compiler` and must not depend on it, and a *copy* that drifts is caught by
 * the dev-world physics run, which is the authority. Only the blocks this
 * grammar can actually emit need to be classified correctly.
 */
const PARTIAL = /(_slab|_stairs|_pane|_fence|_wall|iron_bars|_door|ladder|_bed|lantern|torch|_trapdoor|_sign|_carpet)$/;
const BODY_BLOCKING = /(_slab|_stairs|_fence|_wall|_bed|_pane|iron_bars|_gate|lantern|barrel|chest)$/;
const STANDABLE_PARTIAL = /(_slab|_stairs)$/;
const STEP: Readonly<Record<string, readonly [number, number]>> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

interface World {
  at(x: number, y: number, z: number): LocalVoxelOp | undefined;
}

function makeWorld(ops: readonly LocalVoxelOp[]): World {
  const map = indexOps(ops);
  return { at: (x, y, z) => map.get(`${x},${y},${z}`) };
}

function passable(w: World, x: number, y: number, z: number): boolean {
  const op = w.at(x, y, z);
  if (op === undefined) return true;
  if (!PARTIAL.test(op.block)) return false;
  return !BODY_BLOCKING.test(op.block);
}

function support(w: World, x: number, y: number, z: number): boolean {
  const op = w.at(x, y, z);
  if (op === undefined) return false;
  if (!PARTIAL.test(op.block)) return true;
  return STANDABLE_PARTIAL.test(op.block);
}

function standable(w: World, x: number, y: number, z: number): boolean {
  return support(w, x, y - 1, z) && passable(w, x, y, z) && passable(w, x, y + 1, z);
}

/** Half-block rise onto the front of a bottom stair (or onto a bottom slab). */
function halfStep(w: World, x: number, y: number, z: number, dx: number, dz: number): boolean {
  const op = w.at(x, y, z);
  if (op === undefined || !PARTIAL.test(op.block)) return false;
  if (op.block.endsWith("_slab")) return op.props?.["type"] === "bottom";
  if (!op.block.endsWith("_stairs")) return false;
  if (op.props?.["half"] !== "bottom") return false;
  const [fx, fz] = STEP[op.props?.["facing"] ?? "north"] ?? [0, -1];
  if (dx === fx && dz === fz) return true;
  if (dx * fx + dz * fz !== 0) return false;
  return passable(w, x - fx, y + 1, z - fz);
}

/** Flood the cells a walking player reaches from `start`. */
function walkable(w: World, start: { x: number; y: number; z: number }): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y},${start.z}`]);
  const queue = [start];
  const visit = (x: number, y: number, z: number): void => {
    const key = `${x},${y},${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push({ x, y, z });
  };
  for (let head = 0; head < queue.length; head++) {
    const { x, y, z } = queue[head] as { x: number; y: number; z: number };
    if (w.at(x, y, z)?.block === "ladder") {
      if (w.at(x, y + 1, z)?.block === "ladder") visit(x, y + 1, z);
      if (w.at(x, y - 1, z)?.block === "ladder" || standable(w, x, y - 1, z)) visit(x, y - 1, z);
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (
        halfStep(w, nx, y, nz, dx, dz) &&
        passable(w, x, y + 2, z) &&
        passable(w, nx, y + 1, nz) &&
        passable(w, nx, y + 2, nz)
      ) {
        visit(nx, y + 1, nz);
      }
      for (let ny = y; ny >= y - 3; ny--) {
        if (!passable(w, nx, ny, nz) || !passable(w, nx, ny + 1, nz)) break;
        if (support(w, nx, ny - 1, nz) || w.at(nx, ny, nz)?.block === "ladder") {
          visit(nx, ny, nz);
          break;
        }
      }
    }
  }
  return seen;
}

/** The cell just inside the front door — where the physics lint starts too. */
function doorApproach(result: BuildingResult): { x: number; y: number; z: number } {
  const door = result.meta.door;
  expect(door, "a tall building always has a door").not.toBeNull();
  const w = makeWorld(result.ops);
  const d = door as NonNullable<typeof door>;
  for (const [dx, dz] of [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const x = d.x + dx;
    const z = d.z + dz;
    const { interior } = result.meta;
    if (x < interior.x0 || x > interior.x1 || z < interior.z0 || z > interior.z1) continue;
    if (standable(w, x, 1, z)) return { x, y: 1, z };
  }
  throw new Error("no standable cell inside the door");
}

/** Every interior cell a player could stand on, on every storey. */
function standableFloorCells(result: BuildingResult): { x: number; y: number; z: number }[] {
  const w = makeWorld(result.ops);
  const out: { x: number; y: number; z: number }[] = [];
  for (const level of result.meta.floorLevels) {
    for (const cell of result.meta.floorCells) {
      const y = level + 1;
      if (standable(w, cell.x, y, cell.z)) out.push({ x: cell.x, y, z: cell.z });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the cases                                                                   */
/* -------------------------------------------------------------------------- */

interface Case {
  readonly archetype: string;
  readonly size: readonly [number, number, number];
  readonly floors: number;
}

/**
 * A spread across the range the grammar is meant to cover.
 *
 * The narrow ones are not padding: `[9, …, 9]` is below the switchback's
 * footprint, so it exercises the ladder core, and a one-storey tower exercises
 * the case with no vertical circulation at all.
 */
const CASES: readonly Case[] = [
  { archetype: "skyscraper", size: [17, 60, 17], floors: 12 },
  { archetype: "skyscraper", size: [21, 40, 19], floors: 7 },
  { archetype: "office", size: [15, 30, 15], floors: 6 },
  { archetype: "office", size: [11, 20, 13], floors: 3 },
  { archetype: "hotel", size: [19, 40, 21], floors: 8 },
  { archetype: "hotel", size: [17, 24, 17], floors: 4 },
  { archetype: "apartment_block", size: [17, 30, 17], floors: 6 },
  { archetype: "apartment_block", size: [13, 20, 15], floors: 3 },
  // Below the core's footprint: the ladder fallback.
  { archetype: "skyscraper", size: [9, 16, 9], floors: 3 },
  // No vertical circulation at all.
  { archetype: "office", size: [13, 12, 13], floors: 1 },
  // The degenerate envelope the base dev grid hands every archetype.
  { archetype: "hotel", size: [7, 8, 7], floors: 2 },
];

describe("tall archetypes", () => {
  it("is reachable by tag, ahead of the greedier older tables", () => {
    expect(highriseArchetypeOfTags(["skyscraper"])).toBe("skyscraper");
    expect(highriseArchetypeOfTags(["tower_block"])).toBe("skyscraper");
    expect(highriseArchetypeOfTags(["flats"])).toBe("apartment_block");
    expect(highriseArchetypeOfTags(["nothing_here"])).toBeNull();
    // `tower` alone is still the watchtower; `tower_block` is not.
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    expect(archetypeOfTags(["tower_block"])).toBe("skyscraper");
    // `lodging` used to fall through to the inn.
    expect(archetypeOfTags(["lodging"])).toBe("hotel");
    expect(archetypeOfTags(["inn"])).toBe("inn");
    for (const archetype of HIGHRISE_ARCHETYPES) expect(isHighriseArchetype(archetype)).toBe(true);
    expect(isHighriseArchetype("cottage")).toBe(false);
  });

  it("caps storeys per archetype and never builds past the cap", () => {
    for (const archetype of HIGHRISE_ARCHETYPES) {
      const cap = HIGHRISE_MAX_FLOORS[archetype];
      const { meta } = build(archetype, [17, 200, 17], cap + 8);
      expect(meta.params.floors, archetype).toBe(cap);
      expect(meta.wallTop, archetype).toBe(cap * HIGHRISE_STOREY_HEIGHT);
      expect(meta.floorLevels, archetype).toHaveLength(cap);
    }
  });

  it("is deterministic: the same request twice is the same op list", () => {
    for (const c of CASES.slice(0, 4)) {
      const a = build(c.archetype, c.size, c.floors);
      const b = build(c.archetype, c.size, c.floors);
      expect(JSON.stringify(a.ops), `${c.archetype} ${c.size.join("x")}`).toBe(JSON.stringify(b.ops));
    }
  });

  it("emits one op per cell, and the canonical order", () => {
    for (const c of CASES) {
      const { ops } = build(c.archetype, c.size, c.floors);
      const keys = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      expect(keys.size, `${c.archetype} ${c.size.join("x")}`).toBe(ops.length);
      for (let i = 1; i < ops.length; i++) {
        const p = ops[i - 1] as LocalVoxelOp;
        const q = ops[i] as LocalVoxelOp;
        expect(p.y < q.y || (p.y === q.y && (p.z < q.z || (p.z === q.z && p.x < q.x)))).toBe(true);
      }
    }
  });
});

describe("the switchback core", () => {
  /**
   * The whole point of the file, asserted the way a player would find out.
   *
   * A failure here means somebody upstairs is stranded, and the message names
   * the storey — which is what the first version of this grammar needed, when
   * it ran both flights up one column and every floor above the first came back
   * unreachable.
   */
  it("walks from the front door to every standable cell on every storey", () => {
    for (const c of CASES) {
      const label = `${c.archetype} ${c.size.join("x")} × ${c.floors}`;
      const result = build(c.archetype, c.size, c.floors);
      const w = makeWorld(result.ops);
      const reached = walkable(w, doorApproach(result));
      const cells = standableFloorCells(result);
      expect(cells.length, `${label}: standable cells`).toBeGreaterThan(4);
      const stranded = cells.filter((cell) => !reached.has(`${cell.x},${cell.y},${cell.z}`));
      expect(
        stranded.slice(0, 6).map((s) => `${s.x},${s.y},${s.z}`),
        `${label}: stranded cells`,
      ).toEqual([]);
      // …and every storey really was visited, so the assertion above cannot
      // pass by there being nothing above the ground floor to reach.
      for (const level of result.meta.floorLevels) {
        expect(
          cells.some((cell) => cell.y === level + 1),
          `${label}: storey at ${level} has somewhere to stand`,
        ).toBe(true);
      }
    }
  });

  it("puts the two flights in two columns, one per direction", () => {
    const { ops, meta } = build("skyscraper", [17, 60, 17], 6);
    const stairs = ops.filter((o) => o.block.endsWith("_stairs") && o.y <= meta.wallTop);
    const columns = new Set(stairs.map((o) => o.x));
    expect(columns.size, "one column per direction").toBe(2);
    expect([...columns].sort((a, b) => a - b)).toEqual([meta.interior.x0, meta.interior.x0 + 1]);
    const facings = new Set(stairs.map((o) => o.props?.["facing"]));
    expect(facings).toEqual(new Set(["south", "north"]));
    // One flight per inter-storey gap, each `storeyHeight` treads long.
    expect(meta.stairRuns).toHaveLength(5);
    expect(stairs).toHaveLength(5 * HIGHRISE_STOREY_HEIGHT);
  });

  it("falls back to a ladder when the footprint is shorter than a flight", () => {
    const shallow = coreDepthFor(HIGHRISE_STOREY_HEIGHT) + 1; // interior one short
    const { ops } = build("office", [11, 20, shallow], 3);
    expect(ops.some((o) => o.block === "ladder")).toBe(true);
    expect(ops.some((o) => o.block.endsWith("_stairs"))).toBe(false);
  });

  it("gives every storey a floor plate and a light", () => {
    const { ops, meta } = build("office", [15, 40, 15], 8);
    expect(meta.floorLevels).toHaveLength(8);
    expect(meta.lanternCount).toBe(8);
    for (const level of meta.floorLevels.slice(1)) {
      const plate = ops.filter((o) => o.y === level && o.x > 0 && o.x < 14 && o.z > 0 && o.z < 14);
      expect(plate.length, `plate at ${level}`).toBeGreaterThan(100);
    }
    // A lantern hangs from the plane above it, which every storey has because
    // the roof deck closed the top one.
    const at = indexOps(ops);
    for (const lantern of ops.filter((o) => o.block === "lantern" && o.props?.["hanging"] === "true")) {
      expect(at.get(`${lantern.x},${lantern.y + 1},${lantern.z}`), "something to hang from").toBeDefined();
    }
  });
});

describe("the facade and the cap", () => {
  it("glazes the curtain wall in bays, with mullions and a spandrel band", () => {
    const { ops, meta } = build("office", [17, 40, 17], 6);
    expect(meta.windowCount).toBeGreaterThan(50);
    const panes = ops.filter((o) => o.block === "glass_pane");
    expect(panes.length).toBe(meta.windowCount);
    // Never in the spandrel course at the foot of a storey, and never in the
    // floor band at its head: those two are what make it read as storeys.
    for (const pane of panes) {
      const inStorey = pane.y % HIGHRISE_STOREY_HEIGHT;
      expect(inStorey === 1 || inStorey === 0, `pane at y ${pane.y}`).toBe(false);
    }
    // Every pane carries its connection flags, so the emit pass has nothing to
    // repair and `connection.stale` stays quiet.
    for (const pane of panes) expect(Object.keys(pane.props ?? {}).length).toBe(2);
  });

  it("caps the tower with a parapet, a roof deck and a plant room", () => {
    const { ops, meta } = build("skyscraper", [19, 60, 19], 8);
    expect(meta.roofTop).toBeGreaterThan(meta.wallTop + 2);
    const deck = ops.filter((o) => o.y === meta.wallTop && o.x > 0 && o.x < 18 && o.z > 0 && o.z < 18);
    expect(deck.length, "a closed roof deck").toBeGreaterThan(200);
    const parapetCap = ops.filter((o) => o.y === meta.wallTop + 2 && o.block.endsWith("_slab"));
    expect(parapetCap.length, "a parapet coping all the way round").toBeGreaterThan(60);
    // The plant room, and the light on top of its vent.
    expect(ops.some((o) => o.y === meta.wallTop + 4)).toBe(true);
    expect(ops.some((o) => o.block === "lantern" && o.y === meta.roofTop)).toBe(true);
  });

  it("hangs a double door in an opaque opening", () => {
    const { ops, meta } = build("hotel", [19, 40, 19], 6);
    const leaves = ops.filter((o) => o.block.endsWith("_door"));
    // Two leaves, two halves each.
    expect(leaves).toHaveLength(4);
    expect(new Set(leaves.map((o) => o.props?.["hinge"]))).toEqual(new Set(["left", "right"]));
    const door = meta.door as NonNullable<typeof meta.door>;
    const head = ops.find((o) => o.x === door.x && o.z === door.z && o.y === 4);
    expect(head?.block, "the course above the head is wall, not glass").not.toBe("glass_pane");
  });
});

describe("the fit-outs", () => {
  it("partitions a hotel into bays and lays a whole bed in each", () => {
    const { ops, meta } = build("hotel", [19, 40, 21], 6);
    const beds = ops.filter((o) => o.block.endsWith("_bed"));
    expect(beds.length).toBeGreaterThan(6);
    expect(beds.length % 2).toBe(0);
    const feet = beds.filter((o) => o.props?.["part"] === "foot");
    const heads = beds.filter((o) => o.props?.["part"] === "head");
    expect(feet).toHaveLength(heads.length);
    for (const foot of feet) {
      const match = heads.find(
        (h) =>
          h.props?.["facing"] === foot.props?.["facing"] &&
          h.y === foot.y &&
          Math.abs(h.x - foot.x) + Math.abs(h.z - foot.z) === 1,
      );
      expect(match, `head for the foot at ${foot.x},${foot.y},${foot.z}`).toBeDefined();
    }
    // A partition is wall, so its columns are not counted as floor — which is
    // the whole reason a full-height room divider is legal at all.
    const floor = new Set(meta.floorCells.map((c) => `${c.x},${c.z}`));
    const interiorArea =
      (meta.interior.x1 - meta.interior.x0 + 1) * (meta.interior.z1 - meta.interior.z0 + 1);
    expect(floor.size).toBeLessThan(interiorArea);
  });

  it("hangs balconies off an apartment block, and off nothing else", () => {
    const flats = build("apartment_block", [17, 40, 17], 6);
    const apron = flats.ops.filter((o) => o.x < 0 || o.z < 0 || o.x > 16 || o.z > 16);
    expect(apron.length, "balcony decks and rails").toBeGreaterThan(6);
    expect(flats.meta.apronOps).toBeGreaterThan(6);
    // Every deck slab has the floor band it hangs off beside it, and every rail
    // stands on a deck slab: nothing here is floating.
    const at = indexOps(flats.ops);
    for (const rail of flats.ops.filter((o) => o.block === "iron_bars")) {
      expect(at.get(`${rail.x},${rail.y - 1},${rail.z}`), "a rail stands on its deck").toBeDefined();
    }
    const office = build("office", [17, 40, 17], 6);
    // The office's only apron ops are the two canopy slabs over the doorstep.
    expect(office.meta.apronOps).toBeLessThanOrEqual(2);
  });

  it("puts a counter in the lobby and desks on an office plate", () => {
    const office = build("office", [17, 40, 17], 5);
    expect(office.meta.furnitureCount).toBeGreaterThan(3);
  });
});

describe("the modern city palette", () => {
  it("is reachable by name but is not in the village draw", () => {
    expect(pickTheme(nodeSeed(1n, "a"), MODERN_CITY_THEME_ID).id).toBe(MODERN_CITY_THEME_ID);
    // Twenty draws without an override never turn one up: the pool is the
    // three village themes, exactly as it was.
    for (let i = 0; i < 20; i++) {
      expect(pickTheme(nodeSeed(BigInt(i), `n${i}`)).id).not.toBe(MODERN_CITY_THEME_ID);
    }
  });

  it("builds a tower out of concrete, quartz and glass", () => {
    expect(MODERN_CITY_THEME.woods.length).toBeGreaterThan(1);
    const { ops } = build("skyscraper", [17, 40, 17], 5);
    const names = new Set(ops.map((o) => o.block));
    expect([...names].some((n) => n.endsWith("_concrete")), "concrete").toBe(true);
    expect([...names].some((n) => n.includes("quartz")), "quartz").toBe(true);
    expect(names.has("glass_pane"), "curtain glazing").toBe(true);
  });
});
