/**
 * Courtyard blocks (Phase 4.2, WP-C) — `docs/COURTYARDS-AND-LEVELS-v0.md` §4.
 *
 * Three layers, and the third is the one that matters. Phase 4.1 shipped three
 * defects that passed every unit test in this directory and were exposed only by
 * compiling a real world: the piece was right and the *composition* was not. A
 * courtyard is enclosed ground reached through a hole in a building, so the way
 * it fails is exactly the way no unit test can see — the passage roofed shut,
 * the perimeter closed with no way in, the arch built where there was no wall to
 * spring from. §8.2's W2 is therefore a compiled world with the 26-rule physics
 * lint at zero **and a walking BFS that has to get inside**.
 *
 * 1. **Selection** — each of §4.2's four criteria rejects for that reason and no
 *    other, and the draw is positional.
 * 2. **The fabric** — a selected block's perimeter closes, its streetless ranges
 *    face inward, and the gaps in it are the passages it asked for.
 * 3. **A compiled world** — every physics rule at zero, every courtyard interior
 *    reachable on foot from the street, and every roofed arch standing on walls
 *    that are actually there.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HeightField, centeredRegion, streamSeed, nodeSeed, type Region } from "@terrainist/stdlib";
import { validateSettlementDocument } from "@terrainist/spec";

import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import {
  COURTYARD_CEILING,
  COURTYARD_FILL,
  MIN_COURT_SIDE,
  PASSAGE_HEAD,
  planCourtyard,
  isCourtyardPlan,
  splitIndexNearest,
  type CourtyardPlanInput,
} from "../src/layout/courtyards.js";
import { LOT_DEPTH, TERRACE_MAX_FRONTAGE, solveDistricts } from "../src/layout/district.js";
import type { DistrictPassResult } from "../src/layout/district.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const BOUNDS: Rect = { x0: -100, z0: -100, x1: 99, z1: 99 };
const SEED = 20260804n;

function flatField(region: Region, height = 72): HeightField {
  const field = new HeightField(region);
  field.values.fill(height);
  return field;
}

function districtDoc(params: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "courtyard_fixture", worldSeed: 20260804 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 4, baseHeight: 76, seaLevel: 62, octaves: 3, frequency: 0.004 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "old_quarter",
          kind: "district",
          envelope: { shape: "region", size: [200, 200] },
          params,
          constraints: [
            { zone: "center" },
            { terrain_conform: "flatten", reference: "median", blend: 6 },
          ],
        },
      ],
    },
  };
}

function layFabric(params: Record<string, unknown>): DistrictPassResult {
  const validated = validateSettlementDocument(districtDoc(params));
  const doc = validated.document;
  if (doc === undefined) {
    throw new Error(
      `fixture did not validate: ${validated.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  const region = centeredRegion(256, 256);
  const placement: Placement = {
    nodePath: "world.old_quarter",
    id: "old_quarter",
    translation: [BOUNDS.x0, 72, BOUNDS.z0],
    yaw: 0,
    mirror: false,
    size: [200, 1, 200],
    footprint: BOUNDS,
    anchor: { x: 0, z: 0 },
    foundationY: 72,
  };
  return solveDistricts({ doc, worldSeed: SEED, field: flatField(region), placements: [placement] });
}

/** The medina fixture: big blocks, dense, every eligible block closing. */
const MEDINA = {
  fabric: "grid",
  density: "high",
  blockSize: 60,
  mix: ["townhouse", "shop_row", "machine_shop"],
  courtyards: 1,
};

/* -------------------------------------------------------------------------- */
/* 1. selection                                                                */
/* -------------------------------------------------------------------------- */

describe("choosing which blocks close", () => {
  /** A block that passes every criterion, for one criterion at a time to fail. */
  const eligible = (over: Partial<CourtyardPlanInput> = {}): CourtyardPlanInput => ({
    rect: { x0: 0, z0: 0, x1: 59, z1: 59 },
    columns: 60 * 60,
    density: "high",
    share: 1,
    depth: LOT_DEPTH.high,
    perimeter: true,
    fronts: new Set(["north", "south", "west", "east"] as const),
    primary: "north",
    maxFrontage: TERRACE_MAX_FRONTAGE.high,
    stream: streamSeed(nodeSeed(SEED, "world.old_quarter", ""), "courtyard"),
    ...over,
  });

  const reasonFor = (over: Partial<CourtyardPlanInput>): string => {
    const out = planCourtyard(eligible(over));
    return isCourtyardPlan(out) ? "accepted" : out.rejected;
  };

  it("accepts a block that meets all four criteria", () => {
    expect(reasonFor({})).toBe("accepted");
  });

  it("refuses a share of zero, which is the default and the whole of §6", () => {
    expect(reasonFor({ share: 0 })).toBe("share");
  });

  it("never closes a block in a village: the gardens are the interior", () => {
    expect(COURTYARD_CEILING.low).toBe(0);
    expect(reasonFor({ density: "low" })).toBe("density");
  });

  it("refuses a block too thin for two opposite strips", () => {
    expect(reasonFor({ perimeter: false })).toBe("perimeter");
  });

  it("refuses a core that is a light well rather than a place", () => {
    // Exactly one column short on one axis, so it is the core test that fails
    // and not the fill test that fails first.
    const side = 2 * LOT_DEPTH.high + MIN_COURT_SIDE - 1;
    const rect = { x0: 0, z0: 0, x1: side - 1, z1: side - 1 };
    expect(reasonFor({ rect, columns: side * side })).toBe("core");
    const wide = { x0: 0, z0: 0, x1: side, z1: side - 1 };
    expect(reasonFor({ rect: wide, columns: (side + 1) * side })).toBe("core");
  });

  it("refuses a ragged block whose inscribed rectangle is not most of it", () => {
    // §9.1: `blocksOf` reduces a block to its largest inscribed rectangle, and
    // the perimeter would close around *that* — leaving the ragged margin as an
    // open hole in a wall that is supposed to be unbroken.
    const columns = Math.ceil((60 * 60) / COURTYARD_FILL) + 1;
    expect(reasonFor({ columns })).toBe("fill");
    // …and one column the other side of the line is fine.
    expect(reasonFor({ columns: Math.floor((60 * 60) / COURTYARD_FILL) - 1 })).toBe("accepted");
  });

  it("draws positionally, so a block's decision depends only on its own corner", () => {
    // The same rectangle at the same corner decides the same way whatever the
    // share of the *quarter* — the draw is against the share, so a lower share
    // may refuse, but two identical calls never disagree.
    for (let i = 0; i < 8; i++) {
      const rect = { x0: i * 64, z0: -i * 64, x1: i * 64 + 59, z1: -i * 64 + 59 };
      const a = planCourtyard(eligible({ rect }));
      const b = planCourtyard(eligible({ rect }));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("puts one passage on a short block and two, opposed, on a long one", () => {
    const short = planCourtyard(eligible({ maxFrontage: 200 }));
    expect(isCourtyardPlan(short) && short.passageFaces).toEqual(["north"]);
    const long = planCourtyard(eligible({}));
    expect(isCourtyardPlan(long) && long.passageFaces).toEqual(["north", "south"]);
  });

  it("prefers the cut nearest the middle of the face, and ties break low", () => {
    expect(splitIndexNearest([0, 10, 20, 30, 40, 50], 26, 2)).toBe(3);
    expect(splitIndexNearest([0, 10, 20, 30, 40, 50], 25, 2)).toBe(2);
    // Two lots each side is the minimum a terrace is cut from; a four-lot run
    // has exactly one legal split and a three-lot run has none.
    expect(splitIndexNearest([0, 10, 20, 30], 99, 2)).toBe(2);
    expect(splitIndexNearest([0, 10, 20], 5, 2)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the fabric                                                               */
/* -------------------------------------------------------------------------- */

describe("a block that closes", () => {
  const laid = layFabric(MEDINA);
  const product = laid.districts[0];
  const courts = product?.courtyards ?? [];

  it("closes blocks when the quarter asks, and none when it does not", () => {
    expect(courts.length).toBeGreaterThan(0);
    const off = layFabric({ ...MEDINA, courtyards: 0 }).districts[0];
    expect(off?.courtyards).toBeUndefined();
  });

  it("gives every courtyard a core at least MIN_COURT_SIDE on both axes", () => {
    for (const court of courts) {
      expect(court.core.x1 - court.core.x0 + 1).toBeGreaterThanOrEqual(MIN_COURT_SIDE);
      expect(court.core.z1 - court.core.z0 + 1).toBeGreaterThanOrEqual(MIN_COURT_SIDE);
    }
  });

  it("gives every courtyard one or two passages, each inside its own block", () => {
    for (const court of courts) {
      expect(court.passages.length).toBeGreaterThanOrEqual(1);
      expect(court.passages.length).toBeLessThanOrEqual(2);
      for (const passage of court.passages) {
        expect(passage.block).toBe(court.block);
        expect(passage.rect.x0).toBeGreaterThanOrEqual(court.rect.x0);
        expect(passage.rect.x1).toBeLessThanOrEqual(court.rect.x1);
        expect(passage.rect.z0).toBeGreaterThanOrEqual(court.rect.z0);
        expect(passage.rect.z1).toBeLessThanOrEqual(court.rect.z1);
      }
      // Two passages are on opposite faces, never adjacent ones: a courtyard
      // with two ways through at right angles is a corner, not a block.
      if (court.passages.length === 2) {
        const [a, b] = court.passages;
        const pair = [a?.face, b?.face].sort().join("+");
        expect(["north+south", "east+west"]).toContain(pair);
      }
    }
  });

  it("closes the perimeter: every gap in a face is a passage it asked for", () => {
    // The buildings this quarter placed, as columns; then, for each courtyard
    // block, the runs of *unbuilt* ground along the middle of each range. Every
    // such run wider than one column has to be a passage — an unbuilt lot in a
    // courtyard perimeter is a hole in the wall (§4.3), and this is the
    // assertion that says the coverage override actually reached the lots.
    const covered = new Set<string>();
    for (const placement of laid.placements) {
      const f = placement.footprint;
      for (let z = f.z0; z <= f.z1; z++) {
        for (let x = f.x0; x <= f.x1; x++) covered.add(`${x},${z}`);
      }
    }
    for (const court of courts) {
      const depth = Math.floor((court.core.z0 - court.rect.z0 + court.core.x0 - court.rect.x0) / 2);
      const inset = Math.max(1, Math.floor(depth / 2));
      const gaps: number[] = [];
      // Walk the middle line of the north range: the one that is furthest from
      // any street and therefore only built if the range was built.
      const z = court.rect.z0 + inset;
      let run = 0;
      for (let x = court.core.x0; x <= court.core.x1; x++) {
        if (covered.has(`${x},${z}`)) {
          if (run > 0) gaps.push(run);
          run = 0;
        } else run++;
      }
      if (run > 0) gaps.push(run);
      const wide = gaps.filter((g) => g > 1);
      const declared = court.passages.filter((p) => p.face === "north").length;
      expect(wide.length, `block ${court.block} north range`).toBeLessThanOrEqual(declared);
    }
  });

  it("names the measurement when the author asks and gets nothing", () => {
    // Blocks far too small to hold a core: accepted, reported, still compiles.
    const cramped = layFabric({ ...MEDINA, blockSize: 40 });
    expect(cramped.districts[0]?.courtyards).toBeUndefined();
    const none = cramped.diagnostics.filter((d) => d.code === "LOAM-T224");
    expect(none).toHaveLength(1);
    expect(none[0]?.severity).not.toBe("error");
    expect(none[0]?.message).toMatch(new RegExp(`core narrower than ${MIN_COURT_SIDE}`));
    expect(none[0]?.fix).toMatch(/blockSize/);
  });

  it("says nothing at all when nobody asked", () => {
    expect(layFabric({ ...MEDINA, blockSize: 40, courtyards: 0 }).diagnostics.map((d) => d.code)).not.toContain(
      "LOAM-T224",
    );
  });

  it("lays the same fabric twice, block for block", () => {
    const a = layFabric(MEDINA).districts[0]?.courtyards;
    const b = layFabric(MEDINA).districts[0]?.courtyards;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* -------------------------------------------------------------------------- */
/* 3. a compiled world — W2                                                    */
/* -------------------------------------------------------------------------- */

describe("an old quarter, compiled", () => {
  let root: string;
  let dir: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let stack: PrismarineStack;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-courtyard-"));
    dir = path.join(root, "old_quarter");
    const compiled = await compileTerrain(districtDoc(MEDINA), {
      outDir: dir,
      onColumnPlan: (p) => {
        plan = p;
      },
    });
    if (!compiled.ok) {
      throw new Error(
        `fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: structures.buildings as never,
      roads: (structures.roads?.routes ?? []) as never,
      tunnels: [],
      terrainTop: {
        x0: plan.region.x0,
        z0: plan.region.z0,
        width: plan.region.width,
        depth: plan.region.depth,
        ground: plan.ground,
        entrances: new Uint8Array(plan.region.width * plan.region.depth),
      },
    });
  }, 600_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("compiles without a single error diagnostic", () => {
    expect(report.diagnostics.filter((d) => d.severity === "error").map((d) => d.message)).toEqual([]);
  });

  it("actually built courtyards, and furnished every one of them", () => {
    const pass = structures.courtyards;
    expect(pass).toBeDefined();
    const courts = pass?.courtyards ?? [];
    expect(courts.length).toBeGreaterThan(0);
    for (const court of courts) {
      expect(court.paved).toBeGreaterThan(MIN_COURT_SIDE * MIN_COURT_SIDE - 1);
      expect(court.passages).toBeGreaterThanOrEqual(1);
      expect(court.roofed).toBeLessThanOrEqual(court.passages);
    }
  });

  it("finds nothing wrong under any physics rule", () => {
    expect(
      physics.findings
        .slice(0, 12)
        .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
        .join("\n"),
    ).toBe("");
    for (const rule of PHYSICS_RULES) {
      expect(physics.counts[rule], rule).toBe(0);
    }
  });

  it("lets a walker off the street into every courtyard", () => {
    // The assertion W2 exists for (§8.2). It catches "the passage got roofed
    // shut", "the perimeter closed with no way in" and "the arch was built
    // where there was no wall to spring from", and no unit test can see any of
    // the three. The walk is over the *world* — the finished ground plus every
    // emitted block — not over the street graph, which by design knows nothing
    // about a passage.
    const walk = walkable(plan, structures);
    const district = report.layout?.districts?.[0];
    const start = firstStreetColumn(plan, district as never, walk);
    expect(start).not.toBeNull();
    const reached = flood(plan, walk, start as number);
    for (const court of structures.courtyards?.courtyards ?? []) {
      const cx = Math.floor((court.core.x0 + court.core.x1) / 2);
      const cz = Math.floor((court.core.z0 + court.core.z1) / 2);
      // The middle 3×3 may hold the well or the tree trunk; a courtyard counts
      // as reached when any column of its core is.
      let inside = 0;
      for (let z = court.core.z0; z <= court.core.z1; z++) {
        for (let x = court.core.x0; x <= court.core.x1; x++) {
          if (reached.has(key(plan, x, z))) inside++;
        }
      }
      const area = (court.core.x1 - court.core.x0 + 1) * (court.core.z1 - court.core.z0 + 1);
      expect(inside, `courtyard at ${cx},${cz} is enclosed but unreachable`).toBeGreaterThan(
        area / 4,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the walk                                                                    */
/* -------------------------------------------------------------------------- */

function key(plan: ColumnPlan, x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

/**
 * 1 where a player standing on the finished ground has two blocks of headroom.
 *
 * Built from the column plan and every emitted structure block, which between
 * them are the world: a building's walls, a passage's arch and a cloister's
 * pillars are all in the block list, and the ground under them is in the plan.
 */
function walkable(plan: ColumnPlan, structures: StructurePassResult): Uint8Array {
  const cells = plan.region.width * plan.region.depth;
  const out = new Uint8Array(cells);
  const solid = new Map<number, Set<number>>();
  for (const b of structures.blocks) {
    const k = key(plan, b.x, b.z);
    if (k < 0 || k >= cells) continue;
    let column = solid.get(k);
    if (column === undefined) {
      column = new Set<number>();
      solid.set(k, column);
    }
    column.add(b.y);
  }
  for (let k = 0; k < cells; k++) {
    if (plan.fluidKind[k] !== 0) continue;
    const y = plan.ground[k] as number;
    const column = solid.get(k);
    if (column !== undefined && (column.has(y + 1) || column.has(y + 2))) continue;
    out[k] = 1;
  }
  return out;
}

/** Any walkable carriageway column of the quarter, as a BFS start. */
function firstStreetColumn(
  plan: ColumnPlan,
  district: { bounds: Rect; carriageway: Uint8Array },
  walk: Uint8Array,
): number | null {
  const width = district.bounds.x1 - district.bounds.x0 + 1;
  for (let i = 0; i < district.carriageway.length; i++) {
    if (district.carriageway[i] !== 1) continue;
    const x = district.bounds.x0 + (i % width);
    const z = district.bounds.z0 + Math.floor(i / width);
    const k = key(plan, x, z);
    if (walk[k] === 1) return k;
  }
  return null;
}

/** Flood the walkable ground, stepping at most one block up or down. */
function flood(plan: ColumnPlan, walk: Uint8Array, start: number): Set<number> {
  const { width, depth } = plan.region;
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const k = stack.pop() as number;
    const i = k % width;
    const j = Math.floor(k / width);
    const y = plan.ground[k] as number;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + dx;
      const nj = j + dz;
      if (ni < 0 || nj < 0 || ni >= width || nj >= depth) continue;
      const n = nj * width + ni;
      if (seen.has(n) || walk[n] !== 1) continue;
      if (Math.abs((plan.ground[n] as number) - y) > 1) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen;
}

/* -------------------------------------------------------------------------- */
/* 4. the cloister — the one genuinely new geometry in §4                      */
/* -------------------------------------------------------------------------- */

describe("a monastic quarter, compiled", () => {
  let root: string;
  let dir: string;
  let plan: ColumnPlan;
  let stack: PrismarineStack;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-cloister-"));
    dir = path.join(root, "abbey_quarter");
    const compiled = await compileTerrain(
      districtDoc({ ...MEDINA, mix: ["monastery", "abbey", "hermitage"] }),
      {
        outDir: dir,
        onColumnPlan: (p) => {
          plan = p;
        },
      },
    );
    if (!compiled.ok) throw new Error("cloister fixture failed to compile");
    structures = compiled.report.layout?.structures as StructurePassResult;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: structures.buildings as never,
      roads: (structures.roads?.routes ?? []) as never,
      tunnels: [],
      terrainTop: {
        x0: plan.region.x0,
        z0: plan.region.z0,
        width: plan.region.width,
        depth: plan.region.depth,
        ground: plan.ground,
        entrances: new Uint8Array(plan.region.width * plan.region.depth),
      },
    });
  }, 600_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("gives a block of chapels a cloister, without anybody writing it down", () => {
    const courts = structures.courtyards?.courtyards ?? [];
    expect(courts.length).toBeGreaterThan(0);
    for (const court of courts) expect(court.treatment).toBe("cloister");
  });

  it("finds nothing wrong under any physics rule", () => {
    // The colonnade is a roof carried on pillars over walkable ground, which is
    // exactly the shape `floating.slab` and the walking agent are there to
    // catch. A cloister a player cannot get under is a hedge.
    for (const rule of PHYSICS_RULES) {
      expect(physics.counts[rule], rule).toBe(0);
    }
  });

  it("still lets a walker off the street into every cloister garth", () => {
    const walk = walkable(plan, structures);
    const district = structures.districts[0];
    const start = firstStreetColumn(plan, district as never, walk);
    const reached = flood(plan, walk, start as number);
    for (const court of structures.courtyards?.courtyards ?? []) {
      let inside = 0;
      for (let z = court.core.z0; z <= court.core.z1; z++) {
        for (let x = court.core.x0; x <= court.core.x1; x++) {
          if (reached.has(key(plan, x, z))) inside++;
        }
      }
      expect(inside, `cloister at block ${court.block}`).toBeGreaterThan(0);
    }
  });
});

/** Referenced so the head-height constant is asserted rather than assumed. */
it("keeps a storey of headroom under a passage arch", () => {
  expect(PASSAGE_HEAD).toBe(4);
});
