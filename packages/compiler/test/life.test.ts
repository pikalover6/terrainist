/**
 * C3 — the life pass, against a hand-built city block.
 *
 * The fixture is a single street with a terrace of shops down one side and a
 * row of houses down the other, built the way `streetscape.test.ts` builds its
 * plan: a flat field, an explicit `StreetGraph`, and buildings expressed as the
 * flat {@link LifeBuilding} view the pass actually reads. Everything is chosen
 * to provoke one property — the reserved walk lane runs the length of the
 * street so "nothing lands on it" is testable at every column, and the shop
 * side is one continuous run so "clustering happens" is a statement about
 * adjacency rather than about a total.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { index } from "../src/structures/roads.js";
import type { StructureBlock } from "../src/structures/buildings.js";
import {
  buildStreetMasks,
  dressStreets,
  type StreetGraph,
} from "../src/structures/streetscape.js";
import {
  classifyFrontage,
  dressLife,
  frontageRuns,
  type LifeBuilding,
  type LifeStreets,
} from "../src/structures/life.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEED = nodeSeed(0x11fe0n, "world");
const REGION: Region = { x0: -64, z0: -64, width: 128, depth: 128 };
const GROUND = 100;
const FLOOR = GROUND + 1;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function flatPlan(): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n).fill(GROUND);
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 1,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0, caveAir: 0 },
  } as unknown as ColumnPlan;
}

/** One street running east-west at z = 0, seven wide, two-column sidewalks. */
function fixtureGraph(): StreetGraph {
  return {
    sidewalk: 2,
    segments: [
      {
        id: "high-street",
        kind: "street" as const,
        width: 7,
        path: [
          { x: -40, z: 0 },
          { x: 40, z: 0 },
        ],
      },
    ],
    intersections: [],
  };
}

/**
 * A terrace: `count` units of `unit` columns each, all fronting the street.
 *
 * `zNear` is the wall column nearest the carriageway, so the caller decides
 * which side of the street the terrace stands on and how far back it is.
 */
function terrace(
  prefix: string,
  archetype: string,
  x0: number,
  count: number,
  unit: number,
  zNear: number,
  depth: number,
  storeys: number,
): LifeBuilding[] {
  const out: LifeBuilding[] = [];
  const dz = zNear < 0 ? -1 : 1;
  for (let k = 0; k < count; k++) {
    const cells = new Set<string>();
    const interior = new Set<string>();
    const bx0 = x0 + k * unit;
    for (let i = 0; i < unit; i++) {
      for (let j = 0; j < depth; j++) {
        const x = bx0 + i;
        const z = zNear + dz * j;
        cells.add(`${x},${z}`);
        if (i > 0 && i < unit - 1 && j > 0 && j < depth - 1) interior.add(`${x},${z}`);
      }
    }
    const z0 = Math.min(zNear, zNear + dz * (depth - 1));
    const z1 = Math.max(zNear, zNear + dz * (depth - 1));
    out.push({
      nodePath: `world.${prefix}_${k}`,
      footprint: { x0: bx0, z0, x1: bx0 + unit - 1, z1 },
      cells,
      interiorCells: interior,
      floorY: FLOOR,
      wallTopY: FLOOR + 4 * storeys,
      floorLevels: Array.from({ length: storeys }, (_, s) => FLOOR + 4 * s),
      archetype,
      tags: [],
    });
  }
  return out;
}

/**
 * The whole fixture city: plan, streetscape masks, buildings and the block
 * list the earlier passes would have written.
 *
 * The buildings are emitted as solid shells so the voxel checks in the pass
 * have something real to bracket to — an awning needs a wall behind it, and a
 * fixture made of empty rectangles would silently test nothing.
 */
function city(): {
  plan: ColumnPlan;
  districts: LifeStreets[];
  buildings: LifeBuilding[];
  existing: StructureBlock[];
} {
  const plan = flatPlan();
  const graph = fixtureGraph();
  // Run the real streetscape so the masks, the walk lane and the paving are
  // the ones the pass will see in production rather than a hand-drawn guess.
  const dressed = dressStreets(graph, { plan, stack, seed: SEED, furniture: "downtown" });
  const buildings = [
    ...terrace("shop", "shop_row", -36, 6, 8, -6, 10, 3),
    ...terrace("house", "townhouse", -36, 6, 8, 6, 10, 3),
  ];
  const wall = stack.blockByName("stone_bricks")?.stateId ?? 1;
  const existing: StructureBlock[] = [...dressed.blocks];
  for (const b of buildings) {
    for (const cellKey of b.cells) {
      const [x, z] = cellKey.split(",").map(Number) as [number, number];
      const interior = b.interiorCells?.has(cellKey) === true;
      for (let y = b.floorY; y <= b.wallTopY; y++) {
        // Walls solid, rooms hollow with a deck every four courses, so the
        // interior lighting rule has a real ceiling to find.
        if (interior && (y - b.floorY) % 4 !== 0) continue;
        existing.push({ x, y, z, stateId: wall });
      }
    }
  }
  return {
    plan,
    districts: [
      { nodePath: "world.downtown", bounds: { x0: -44, z0: -24, x1: 44, z1: 24 }, graph, masks: dressed.masks },
    ],
    buildings,
    existing,
  };
}

function run(): ReturnType<typeof dressLife> {
  const c = city();
  return dressLife({
    plan: c.plan,
    stack,
    seed: SEED,
    nodePath: "world",
    buildings: c.buildings,
    districts: c.districts,
    existing: c.existing,
  });
}

/* -------------------------------------------------------------------------- */
/* determinism                                                                 */
/* -------------------------------------------------------------------------- */

describe("life pass determinism", () => {
  it("two runs over identical inputs produce identical output", () => {
    const a = run();
    const b = run();
    expect(a.blocks).toEqual(b.blocks);
    expect(a.stats).toEqual(b.stats);
  });

  it("plants a real amount of incident on a single block of frontage", () => {
    const { stats } = run();
    expect(stats["lifeTotal"] as number).toBeGreaterThan(60);
    expect(stats["awning"] as number).toBeGreaterThan(10);
  });
});

/* -------------------------------------------------------------------------- */
/* the reserved geometry                                                       */
/* -------------------------------------------------------------------------- */

describe("the life pass respects what it does not own", () => {
  it("writes nothing into the reserved walk lane, at any height", () => {
    const c = city();
    const result = dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      buildings: c.buildings,
      districts: c.districts,
      existing: c.existing,
    });
    const masks = (c.districts[0] as LifeStreets).masks;
    let lane = 0;
    for (let i = 0; i < masks.walkLane.length; i++) if (masks.walkLane[i] === 1) lane++;
    expect(lane).toBeGreaterThan(100);
    for (const b of result.blocks) {
      expect(masks.walkLane[index(REGION, b.x, b.z)]).not.toBe(1);
    }
  });

  it("never overwrites a block an earlier pass wrote", () => {
    const c = city();
    const before = new Set(c.existing.map((b) => `${b.x},${b.y},${b.z}`));
    const result = dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      buildings: c.buildings,
      districts: c.districts,
      existing: c.existing,
    });
    for (const b of result.blocks) {
      expect(before.has(`${b.x},${b.y},${b.z}`)).toBe(false);
    }
  });

  it("never writes inside a building's own footprint, except a room light", () => {
    const c = city();
    const claimed = new Set<string>();
    for (const b of c.buildings) for (const k of b.cells) claimed.add(k);
    const interior = new Set<string>();
    for (const b of c.buildings) for (const k of b.interiorCells ?? []) interior.add(k);
    const result = dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      buildings: c.buildings,
      districts: c.districts,
      existing: c.existing,
    });
    for (const b of result.blocks) {
      const k = `${b.x},${b.z}`;
      if (!claimed.has(k)) continue;
      // The one documented exemption: a lantern hung in a room's ceiling void.
      expect(interior.has(k)).toBe(true);
      expect(stack.blockNameByStateId(b.stateId)).toBe("lantern");
    }
  });

  it("never writes into a carriageway column that is not a parking lane", () => {
    const c = city();
    const masks = (c.districts[0] as LifeStreets).masks;
    const result = dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      buildings: c.buildings,
      districts: c.districts,
      existing: c.existing,
    });
    const carriageway = result.blocks.filter(
      (b) => masks.carriageway[index(REGION, b.x, b.z)] === 1,
    );
    // Whatever is out there is a parked car, and a parked car is two columns
    // wide against the kerb — never in the middle of the road.
    const half = 3;
    for (const b of carriageway) {
      expect(stack.blockNameByStateId(b.stateId)).toMatch(/_concrete$|_stained_glass$/);
      expect(Math.abs(b.z)).toBeGreaterThanOrEqual(half - 1);
    }
  });

  it("keeps a stable diagnostic-free result on a city it can dress", () => {
    expect(run().diagnostics).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* clustering                                                                  */
/* -------------------------------------------------------------------------- */

describe("the dressing clusters", () => {
  it("puts awnings on a run of adjacent bays, not a sprinkle", () => {
    const result = run();
    const awnings = new Set<number>();
    for (const b of result.blocks) {
      // The shop terrace fronts the street from the north; its awning band is
      // the one course at floor + 3 over the sidewalk column in front of it.
      if (b.y !== FLOOR + 3) continue;
      const name = stack.blockNameByStateId(b.stateId) ?? "";
      if (!name.endsWith("_slab") && !name.endsWith("_stairs")) continue;
      if (b.z > 0) continue;
      awnings.add(b.x);
    }
    expect(awnings.size).toBeGreaterThan(20);
    // The property that matters: a long unbroken run exists. A per-column
    // hash at the same total count would give runs of one and two.
    const xs = [...awnings].sort((a, b) => a - b);
    let best = 1;
    let current = 1;
    for (let i = 1; i < xs.length; i++) {
      current = (xs[i] as number) === (xs[i - 1] as number) + 1 ? current + 1 : 1;
      if (current > best) best = current;
    }
    expect(best).toBeGreaterThanOrEqual(6);
  });

  it("dresses a shopping street far harder than a residential one", () => {
    const c = city();
    const result = dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      buildings: c.buildings,
      districts: c.districts,
      existing: c.existing,
    });
    // The shop terrace is north of the street (z < 0), the houses south.
    let shopSide = 0;
    let houseSide = 0;
    for (const b of result.blocks) {
      if (b.y !== FLOOR + 3) continue;
      const name = stack.blockNameByStateId(b.stateId) ?? "";
      if (!name.endsWith("_slab") && !name.endsWith("_stairs")) continue;
      if (b.z < 0) shopSide++;
      else houseSide++;
    }
    expect(shopSide).toBeGreaterThan(houseSide * 4);
  });
});

/* -------------------------------------------------------------------------- */
/* frontage                                                                    */
/* -------------------------------------------------------------------------- */

describe("frontage classification and runs", () => {
  it("reads the archetype, then the tags, then gives up", () => {
    expect(classifyFrontage("shop_row")).toBe("shop");
    expect(classifyFrontage("townhouse")).toBe("residential");
    expect(classifyFrontage("skyscraper")).toBe("office");
    expect(classifyFrontage("museum")).toBe("civic");
    expect(classifyFrontage("warehouse")).toBe("industrial");
    expect(classifyFrontage(undefined, ["shop"])).toBe("shop");
    expect(classifyFrontage("mausoleum")).toBe("plain");
  });

  it("splits a footprint into one maximal run per side", () => {
    const [b] = terrace("t", "shop_row", 0, 1, 8, -6, 10, 2) as [LifeBuilding];
    const runs = frontageRuns(b, () => false);
    expect(runs).toHaveLength(4);
    for (const r of runs) {
      expect(r.wall.length === 8 || r.wall.length === 10).toBe(true);
      expect(r.street).toBe(false);
    }
  });

  it("calls a run a street frontage only when a street is in front of it", () => {
    // Cells run z = -6 (nearest the street) back to z = -15, so the run that
    // faces the street is the +Z one.
    const [b] = terrace("t", "shop_row", 0, 1, 8, -6, 10, 2) as [LifeBuilding];
    const runs = frontageRuns(b, (_x, z) => z >= -5 && z <= -3);
    const streetRuns = runs.filter((r) => r.street);
    expect(streetRuns).toHaveLength(1);
    expect(streetRuns[0]?.dir.name).toBe("south");
    // The flanks brush the street band at their near end but are not frontage:
    // a run is a street run only when *most* of it faces one.
    expect(runs.filter((r) => r.dir.name === "east")[0]?.street).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* the empty case                                                              */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* back courts belong to a building                                            */
/* -------------------------------------------------------------------------- */

/**
 * The service-clutter half of the hill town's prop spam.
 *
 * `openPatches` flood-fills every unclaimed column inside a district, which on
 * a grid is the inside of a block and on a terraced quarter is also the strip
 * between two benches and the shelf above a retaining wall. Dressing all of
 * them made clutter a function of leftover ground: half the hill town's 124
 * crates and pallets stood in courts no house could see.
 */
describe("open ground with nobody on it", () => {
  /** A walled-off court south of the town: no street touches it. */
  const COURT = { x0: -20, z0: 30, x1: 20, z1: 44 };

  /**
   * The fixture city plus that court as a district of its own, optionally with
   * a shed standing in it.
   */
  const withCourt = (shed: boolean): ReturnType<typeof dressLife> => {
    const c = city();
    const extra = shed ? terrace("shed", "warehouse", -4, 1, 6, 26, 4, 1) : [];
    return dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      nodePath: "world",
      buildings: [...c.buildings, ...extra],
      districts: [
        ...c.districts,
        { nodePath: "world.court", bounds: COURT, graph: c.districts[0]!.graph, masks: c.districts[0]!.masks },
      ],
      existing: c.existing,
    });
  };

  const inCourt = (r: ReturnType<typeof dressLife>): number =>
    r.blocks.filter((b) => b.x >= COURT.x0 && b.x <= COURT.x1 && b.z >= COURT.z0 && b.z <= COURT.z1)
      .length;

  it("plants no service clutter in a court no building stands near", () => {
    // Before the `BACK_COURT_REACH` rule this empty field was a back court like
    // any other and got its heap of crates.
    expect(inCourt(withCourt(false))).toBe(0);
  });

  it("still dresses a court a building actually stands behind", () => {
    expect(inCourt(withCourt(true))).toBeGreaterThan(0);
  });
});

describe("degenerate inputs", () => {
  it("does nothing, quietly, with no buildings", () => {
    const result = dressLife({ plan: flatPlan(), stack, seed: SEED, buildings: [] });
    expect(result.blocks).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("says so when every candidate column was already claimed", () => {
    const c = city();
    const result = dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      nodePath: "world",
      // Interior lighting is the one stage that does not ask the column
      // question, so a building with no declared rooms is what makes "every
      // candidate was claimed" actually mean every candidate.
      buildings: c.buildings.map((b) => ({ ...b, interiorCells: new Set<string>() })),
      districts: c.districts,
      existing: c.existing,
      avoid: () => true,
    });
    expect(result.stats["lifeTotal"]).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    // Its own informational code, not the author-actionable CANNOT_FIT: what
    // this reports is a pass-ordering defect, and the authoring loop treats
    // LOAM-E170 as something the model should rewrite the document to fix.
    expect(result.diagnostics[0]?.code).toBe("LOAM-T212");
    expect(result.diagnostics[0]?.severity).toBe("note");
  });

  it("street masks alone, with no buildings, plant nothing on the pavement", () => {
    const plan = flatPlan();
    const graph = fixtureGraph();
    const masks = buildStreetMasks(graph, REGION);
    const result = dressLife({
      plan,
      stack,
      seed: SEED,
      buildings: [],
      districts: [
        { nodePath: "d", bounds: { x0: -44, z0: -24, x1: 44, z1: 24 }, graph, masks },
      ],
    });
    // The kerbside stage still runs — it belongs to the street, not to a
    // building — but nothing it plants may be on the walk lane.
    for (const b of result.blocks) {
      expect(masks.walkLane[index(REGION, b.x, b.z)]).not.toBe(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the era gate                                                                */
/* -------------------------------------------------------------------------- */

describe("modern fittings are era-gated", () => {
  /** The kinds that date a street to the twentieth century. */
  const MODERN = [
    "acUnit",
    "satelliteDish",
    "hydrant",
    "phone_box",
    "newspaperBox",
    "dumpster",
    "mailbox",
    "bicycle_rack",
    "bus_shelter",
    "parkedCar",
    // Spray-paint graffiti: a glazed panel on a wall is as modern as a
    // dumpster, and it used to ship on medieval back walls as a stray block.
    "mural",
  ] as const;

  const dress = (modernFittings?: boolean): ReturnType<typeof dressLife> => {
    const c = city();
    return dressLife({
      plan: c.plan,
      stack,
      seed: SEED,
      nodePath: "world",
      buildings: c.buildings,
      districts: c.districts,
      existing: c.existing,
      ...(modernFittings === undefined ? {} : { modernFittings }),
    });
  };

  const modernCount = (r: ReturnType<typeof dressLife>): number =>
    MODERN.reduce((n, k) => n + ((r.stats[k] as number | undefined) ?? 0), 0);

  it("an absent gate is today's behaviour, byte for byte", () => {
    // The intent layer's law: a document with no `era` compiles identically.
    // `true` is the value the fan-out row hands back as `today`, so the two
    // must agree block for block, not merely in count.
    const absent = dress(undefined);
    const on = dress(true);
    expect(on.blocks).toEqual(absent.blocks);
    expect(on.stats).toEqual(absent.stats);
    expect(modernCount(absent)).toBeGreaterThan(0);
  });

  it("a pre-modern era plants none of them", () => {
    const off = dress(false);
    for (const kind of MODERN) expect(off.stats[kind] ?? 0).toBe(0);
  });

  it("plants no glazed terracotta on a pre-modern back wall", () => {
    // The regression: graffiti bypassed the gate, so a medieval village shipped
    // single glazed-terracotta blocks stuck to exterior walls.
    const off = dress(false);
    const named = (r: ReturnType<typeof dressLife>): string[] =>
      r.blocks.map((b) => stack.blockNameByStateId(b.stateId) ?? "");
    for (const name of named(off)) expect(name).not.toContain("glazed_terracotta");
    expect(named(dress(true)).some((n) => n.includes("glazed_terracotta"))).toBe(true);
  });

  it("still dresses the street: the gate substitutes, it does not empty", () => {
    const off = dress(false);
    const on = dress(true);
    // A pre-modern street loses the parking lane and the wall plant outright,
    // so it is lighter — but it is still a dressed street, not a bare one.
    expect(off.stats["lifeTotal"] as number).toBeGreaterThan(
      (on.stats["lifeTotal"] as number) * 0.5,
    );
  });
});
