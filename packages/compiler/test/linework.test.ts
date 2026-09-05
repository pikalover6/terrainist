/**
 * **The linework declaration slot** —
 * test list, one describe per item.
 *
 * The class this file covers is the one the ground contract carried for its
 * whole life as a *reserved* rank: `structure.linework`, 25, tier A, with no
 * client and a driver that refused any row naming it. §13.2's 2026-08-17
 * reopening found the conflation that kept it there — the **solved layout**
 * knows where a carriageway is from the moment placement is done, and only the
 * *level* it holds waits for the street pass — and everything below is that
 * distinction made falsifiable.
 *
 * The load-bearing one is the first: **rule 6's superset property**. Everything
 * else in the contract is arithmetic that either works or does not; the superset
 * is the assertion standing between a rank-25 bed and a bed under a lane, and it
 * has to hold against a rasterizer this module deliberately does not run.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import { driverForPlan } from "../src/layout/ground-driver.js";
import {
  bandRadius,
  isCarriagewaySegment,
  solvedCarriagewayMask,
  type CarriagewayDistrict
} from "../src/layout/solved-carriageway.js";
import { buildStreetGraph, type StreetGraph, type StreetSegment } from "../src/layout/streets.js";
import { INFRA_ENTRIES } from "@terrainist/stdlib";
import { surfaceStreetGraph } from "../src/structures/roads.js";
import { index } from "../src/structures/sweep.js";
import { componentCount, declareLinework } from "../src/structures/linework.js";
import type { InfraEntryJob, InfraPlacementView } from "../src/structures/infra-entry.js";
import type { CoursePoint } from "../src/structures/wall-course.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 192): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, height: (x: number, z: number) => number = () => 70): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const k = j * r.width + i;
      ground[k] = height(r.x0 + i, r.z0 + j);
      fluidTop[k] = ground[k] as number;
    }
  }
  return {
    region: r,
    ground,
    fluidTop,
    fluidKind: new Uint8Array(n).fill(FluidKind.NONE),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 }
  };
}

/** A quarter's skeleton, drawn by the real form registry at real params. */
function quarter(fabric: "grid" | "organic", size: number, salt: string): StreetGraph {
  const half = size / 2;
  const result = buildStreetGraph({
    bounds: { x0: -half, z0: -half, x1: half - 1, z1: half - 1 },
    fabric,
    seed: nodeSeed(20260817n, `world.${salt}`, ""),
    blockSize: 32,
    sidewalk: 2
  });
  if (!result.ok) throw new Error(`fixture "${salt}" drew no skeleton: ${result.reason}`);
  return result.graph;
}

/** A north–south lane crossing an east–west avenue, on a diagonal-heavy slope. */
function crossroads(): StreetGraph {
  const avenue: { x: number; z: number }[] = [];
  const diagonal: { x: number; z: number }[] = [];
  for (let x = -60; x <= 60; x++) avenue.push({ x, z: 0 });
  // A true 45° run, which is where a perpendicular cross-section throws its
  // widest and where a 4-connected dilation would leak.
  for (let t = -40; t <= 40; t++) diagonal.push({ x: t, z: t });
  const segments: StreetSegment[] = [
    { id: "b-diagonal", kind: "street", width: 5, path: diagonal },
    { id: "a-avenue", kind: "avenue", width: 7, path: avenue }
  ];
  return {
    segments,
    intersections: [{ x: 0, z: 0, segments: ["a-avenue", "b-diagonal"] }],
    sidewalk: 2
  };
}

/* -------------------------------------------------------------------------- */
/* 1. rule 6 — the band is a superset of the finished carriageway              */
/* -------------------------------------------------------------------------- */

/**
 * **The assertion that stands between a rank-25 bed and a bed under a lane.**
 *
 * §13.2f asks for this "on both hill-town fixtures and one generated world".
 * The two named hill-town fixtures — `hillside-village` and
 * `hilltop-crypt-hamlet` — turn out to carry **no `district` node at all**:
 * their carriageway is `road.network@0`'s lanes, which reach the mask through
 * rule 5's *third* bullet (the registered corridor) rather than through a street
 * graph, so there is no `StreetGraph` in either document for the mask to be a
 * superset of. What the property is actually *about* is the disagreement
 * between two rasterizers, so it is asserted where that disagreement lives: over
 * real skeletons drawn by the form registry, surfaced by the real
 * `surfaceStreetGraph`, comparing its own `role: "carriageway"` declarations —
 * the columns that end up `street.network`-owned, verbatim — against the mask.
 *
 * The diagonal fixture is the one that would fail first: a 45° run is where a
 * perpendicular cross-section throws widest, and it is why the dilation is
 * Chebyshev rather than Manhattan.
 */
describe("rule 6 — the crossing set is a superset of the finished carriageway", () => {
  const worlds: readonly { name: string; graph: StreetGraph }[] = [
    { name: "a grid quarter", graph: quarter("grid", 160, "grid_quarter") },
    { name: "an organic quarter", graph: quarter("organic", 160, "organic_quarter") },
    { name: "an avenue crossed on the diagonal", graph: crossroads() }
  ];

  for (const world of worlds) {
    it(`holds on ${world.name}`, () => {
      const r = region();
      const p = plan(r, (x, z) => 70 + Math.round((x + z) / 24));
      const surfaced = surfaceStreetGraph({
        graphs: [world.graph],
        plan: p,
        palette: emptyPalette,
        stack,
        placements: [],
        buildingPaths: new Set<string>(),
        seed: nodeSeed(11n, "world.quarter"),
        theme: "medieval_village"
      });
      const mask = solvedCarriagewayMask(r, [{ streets: world.graph }], []);

      const outside: string[] = [];
      let checked = 0;
      for (const segment of surfaced.declaration.segments) {
        if (segment.role !== "carriageway") continue;
        for (const column of segment.columns) {
          checked++;
          if (mask[column.idx] !== 1) outside.push(`${segment.id}@${column.idx}`);
        }
      }
      expect(checked).toBeGreaterThan(200);
      // Not "few". None: a single column outside the set is a bed under a lane.
      expect(outside).toEqual([]);
    });
  }

  it("does NOT swallow the dressing — a sidewalk is not in the superset", () => {
    // Deliberate, and §13.2a rule 6's second paragraph: a sidewalk (rank 90), a
    // verge (140) or a doorstep landing (120) losing a column to a bed is the
    // rank order working; a *carriageway* losing one is the defect. A mask that
    // covered the dressing too would quietly stop being a statement about lanes.
    const graph = crossroads();
    const r = region();
    const mask = solvedCarriagewayMask(r, [{ streets: graph }], []);
    let claimed = 0;
    for (let k = 0; k < mask.length; k++) claimed += mask[k] as number;
    expect(claimed).toBeLessThan(r.width * r.depth);
  });

  it("takes an arterial at its own width and a junction at the widest limb's", () => {
    const r = region();
    const graph = crossroads();
    const streetsOnly = solvedCarriagewayMask(r, [{ streets: graph }], []);
    const withArterial = solvedCarriagewayMask(
      r,
      [{ streets: graph }],
      [{ plan: { arterials: [{ width: 13, path: [{ x: -60, z: 40 }, { x: 60, z: 40 }] }] } }],
    );
    // The boulevard's own band, and it is wider than any street's.
    expect(withArterial[index(r, 0, 40 + bandRadius(13))]).toBe(1);
    expect(streetsOnly[index(r, 0, 40 + bandRadius(13))]).toBe(0);
    // The junction is stamped out to the widest limb (7), not to the narrow one.
    expect(streetsOnly[index(r, 0, bandRadius(7))]).toBe(1);
  });

  it("reads an absent `role` as `carriageway`, and skips a channel", () => {
    expect(isCarriagewaySegment({ id: "s", kind: "lane", width: 3, path: [] })).toBe(true);
    expect(
      isCarriagewaySegment({ id: "s", kind: "lane", width: 3, path: [], role: "carriageway" }),
    ).toBe(true);
    // A channel is water and a flight of steps is not a lane; a bed that met a
    // canal loses to `fluid.channel` at rank 0 anyway, silently and correctly.
    expect(
      isCarriagewaySegment({ id: "s", kind: "lane", width: 3, path: [], role: "channel" }),
    ).toBe(false);
    expect(isCarriagewaySegment({ id: "s", kind: "lane", width: 3, path: [], role: "steps" })).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 2. §13.2b — the subtraction is order-independent                            */
/* -------------------------------------------------------------------------- */

describe("§13.2b — determinism", () => {
  it("gives the same mask however the districts are ordered", () => {
    const r = region();
    const districts: CarriagewayDistrict[] = [
      { streets: quarter("grid", 96, "a") },
      { streets: quarter("organic", 96, "b") },
      { streets: crossroads() }
    ];
    const forward = solvedCarriagewayMask(r, districts, []);
    const shuffled = solvedCarriagewayMask(r, [...districts].reverse(), []);
    expect([...shuffled]).toEqual([...forward]);
  });

  it("gives the same bed, column for column, however the districts are ordered", () => {
    const forward = viaductBed({ districts: "forward" });
    const reversed = viaductBed({ districts: "reverse" });
    expect(forward.columns.length).toBeGreaterThan(0);
    // Element for element, not by set: `columns` is what becomes an intent's
    // `columns`, and §5.7 rule 2 makes its order part of the answer.
    expect(reversed.columns.map((c) => `${c.idx}@${c.y}`)).toEqual(
      forward.columns.map((c) => `${c.idx}@${c.y}`),
    );
  });

  it("hands the resolver a strictly ascending, duplicate-free column list", () => {
    const bed = viaductBed();
    for (let i = 1; i < bed.columns.length; i++) {
      expect(bed.columns[i]?.idx).toBeGreaterThan(bed.columns[i - 1]?.idx as number);
    }
  });

  it("breaks a self-crossing tie by the lower level, then the lower chord", () => {
    // §13.2b's stated tie-break, exercised through `componentCount`'s sibling
    // property: a column claimed twice at two levels would be `LOAM-E494`, and
    // the bed above is proven duplicate-free, so the merge happened. The
    // direction of the merge is what this asserts — a viaduct whose two
    // approaches overlap keeps the *lower* of the two levels, which is the one
    // that meets grade rather than the one that stands on air.
    const bed = viaductBed({ shortRun: true });
    const byColumn = new Map<string, number>();
    for (const c of bed.columns) {
      const key = `${c.x},${c.z}`;
      expect(byColumn.has(key)).toBe(false);
      byColumn.set(key, c.y);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. §13.2c — the two diagnostics                                             */
/* -------------------------------------------------------------------------- */

describe("§13.2c — LOAM-T235 and LOAM-T236", () => {
  it("T236: the bed is declared and reported when a lane cuts it in two", () => {
    const built = runLinework({ roadAcrossApproach: true });
    expect(built.result.diagnostics.map((d) => d.code)).toContain("LOAM-T236");
    // A note, not a warning: the entry is built.
    expect(built.result.diagnostics.find((d) => d.code === "LOAM-T236")?.severity).toBe("note");
    expect(built.result.beds.size).toBe(1);
  });

  it("T236's message names both subtractions, because they are different news", () => {
    const built = runLinework({ roadAcrossApproach: true });
    const message = built.result.diagnostics.find((d) => d.code === "LOAM-T236")?.message ?? "";
    expect(message).toContain("solved carriageway");
    expect(message).toContain("water");
  });

  it("T235: no bed at all when the subtraction takes it below one cross-section", () => {
    // Both approaches paved over: there is nowhere left for an embankment, so
    // the run is built on the ground it finds and the refusal says which of the
    // two subtractions took it.
    const built = runLinework({ roadEverywhere: true });
    const codes = built.result.diagnostics.map((d) => d.code);
    expect(codes).toContain("LOAM-T235");
    expect(codes).not.toContain("LOAM-T236");
    expect(built.result.beds.size).toBe(0);
    expect(built.result.diagnostics.find((d) => d.code === "LOAM-T235")?.severity).toBe("warning");
  });

  it("T235's message names both subtractions, always", () => {
    // §13.2c: "the message names the count and which of the two subtractions
    // took them — because *my viaduct has no approach* and *my viaduct is in a
    // river* are different news". Both counts are always printed, including the
    // zero, so an author reading the code once learns which question to ask.
    const built = runLinework({ roadEverywhere: true });
    const message = built.result.diagnostics.find((d) => d.code === "LOAM-T235")?.message ?? "";
    expect(message).toContain("solved carriageway");
    expect(message).toContain("water");
    expect(message).toMatch(/kept \d+ of \d+ approach columns/);
  });

  it("declares silently when nothing is in the way", () => {
    const built = runLinework({});
    expect(built.result.diagnostics).toEqual([]);
    expect(built.result.beds.size).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. rule 5 — the crossing columns receive NO claim of any kind               */
/* -------------------------------------------------------------------------- */

describe("rule 5 — the road passes through by declaration, not by rank", () => {
  it("leaves every carriageway column unclaimed, at every level", () => {
    const built = runLinework({ roadAcrossApproach: true });
    const bed = [...built.result.beds.values()][0];
    expect(bed).toBeDefined();
    for (const column of bed?.columns ?? []) {
      expect(built.carriageway[column.idx]).toBe(0);
    }
    // And the ground under the lane is exactly what it was: nothing at rank 25
    // ever named it, so nothing at rank 80 had to win it back.
    for (let k = 0; k < built.carriageway.length; k++) {
      if (built.carriageway[k] !== 1) continue;
      expect(built.plan.ground[k]).toBe(built.baseline[k]);
    }
  });

  it("keeps off water by reading the baseline rather than waiting for the canal", () => {
    const built = runLinework({ wideBand: true });
    for (const bed of built.result.beds.values()) {
      for (const column of bed.columns) {
        expect(built.plan.fluidKind[column.idx]).toBe(FluidKind.NONE);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5. rule 1 — the grep-shaped test                                            */
/* -------------------------------------------------------------------------- */

describe("rule 1 — one declarer, and the grep that keeps it that way", () => {
  it("no module outside `structures/linework.ts` constructs a rank-25 intent", async () => {
    // The `agent-defs.test.ts` tradition, and it is here for that file's exact
    // reason: a second declarer appearing at a later slot is precisely the
    // failure this contract exists to prevent, and it would look exactly like
    // "rank 25 is broken". A grep is the only check that catches it, because
    // the type system is perfectly happy with a second declarer.
    const { readdir, readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");

    const root = fileURLToPath(new URL("../src", import.meta.url));
    const offenders: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        const rel = path.relative(root, full);
        if (rel === path.join("structures", "linework.ts")) continue;
        const source = await readFile(full, "utf8");
        // The construction, not the mention: `sourceClass: "structure.linework"`
        // is the only way an intent joins the class, and the union member and
        // the rank table have to keep being writable.
        if (/sourceClass:\s*"structure\.linework"/.test(source)) offenders.push(rel);
      }
    };
    await walk(root);
    expect(offenders).toEqual([]);
  });

  it("the registry names exactly one row in the class", () => {
    const rows = Object.values(INFRA_ENTRIES).filter(
      (def) => def.sourceClass === "structure.linework",
    );
    expect(rows.map((r) => r.id)).toEqual(["viaduct"]);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. rule 10 — the reach law                                                  */
/* -------------------------------------------------------------------------- */

describe("rule 10 — the reach law", () => {
  it("is total on an empty job list, and constructs nothing", () => {
    const r = region(32);
    const p = plan(r);
    const driver = driverForPlan(p);
    const before = [...p.ground];
    const result = declareLinework({
      region: r,
      jobs: [],
      view: emptyView(r),
      ground: driver,
      carriageway: new Uint8Array(r.width * r.depth),
      fluidKind: driver.baseline.fluidKind
    });
    expect(result.beds.size).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.stats).toEqual({});
    expect(driver.intents).toEqual([]);
    expect([...p.ground]).toEqual(before);
  });

  it("is total on a job list of entries that declare something else", () => {
    const r = region(32);
    const p = plan(r);
    const driver = driverForPlan(p);
    const fence = INFRA_ENTRIES["quarantine_fence"];
    expect(fence?.sourceClass).toBe("sweep.run");
    const result = declareLinework({
      region: r,
      jobs: [
        {
          nodePath: "world.cordon",
          def: fence as NonNullable<typeof fence>,
          route: { form: "ring", target: "holding" },
          params: {},
          seed: nodeSeed(1n, "world.cordon", ""),
          gates: true
        }
      ],
      view: emptyView(r),
      ground: driver,
      carriageway: new Uint8Array(r.width * r.depth),
      fluidKind: driver.baseline.fluidKind
    });
    expect(result.beds.size).toBe(0);
    expect(driver.intents).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* the harness                                                                 */
/* -------------------------------------------------------------------------- */

function emptyView(r: Region): InfraPlacementView {
  return {
    bounds: { x0: r.x0, z0: r.z0, width: r.width, depth: r.depth },
    extentOf: () => undefined,
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: () => 70,
    onRoad: () => false
  };
}

/** A 3×3 patch of ground a route may name. */
function patch(cx: number, cz: number): CoursePoint[] {
  const columns: CoursePoint[] = [];
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) columns.push({ x, z });
  }
  return columns;
}

interface LineworkCase {
  readonly roadAcrossApproach?: boolean;
  readonly roadEverywhere?: boolean;
  readonly wideBand?: boolean;
  readonly shortRun?: boolean;
  readonly districts?: "forward" | "reverse";
}

/**
 * One viaduct, declared through the real slot on a synthetic band.
 *
 * A ravine between two shoulders, so the run has a reason to be an arcade and
 * the approaches have a slope to meet.
 */
function runLinework(spec: LineworkCase) {
  const r = region(160);
  // A ravine between two shoulders, its walls at two courses a column so the
  // `between` router's grade cap of four still finds a corridor across rather
  // than round, and a slope on the west so the two approaches differ in length.
  const p = plan(r, (x) => {
    const base = 70 + Math.max(0, Math.min(6, Math.floor((x + 60) / 8)));
    const into = 16 - Math.abs(x);
    return into > 0 ? base - Math.min(16, into * 2) : base;
  });
  const baseline = [...p.ground];
  const n = r.width * r.depth;

  const carriageway = new Uint8Array(n);
  const paint = (x0: number, x1: number): void => {
    for (let z = r.z0; z < r.z0 + r.depth; z++) {
      for (let x = x0; x <= x1; x++) carriageway[index(r, x, z)] = 1;
    }
  };
    // Outside the west abutment, which is where an *approach* is: the arcade
  // itself sits between the anchors, and a lane under a bay is not a lane
  // across an embankment.
  if (spec.roadAcrossApproach === true) paint(-76, -73);
  if (spec.roadEverywhere === true) {
    paint(-80, -60);
    paint(60, 79);
  }
  const flood = (x0: number, x1: number): void => {
    for (let z = r.z0; z < r.z0 + r.depth; z++) {
      for (let x = x0; x <= x1; x++) {
        const k = index(r, x, z);
        p.fluidKind[k] = FluidKind.WATER;
        p.fluidTop[k] = (p.ground[k] as number) + 1;
      }
    }
  };
  // One strip across the west approach: the bed survives, and not one of its
  // columns is wet.
  if (spec.wideBand === true) flood(-76, -73);

  const a = spec.shortRun === true ? -30 : -68;
  const b = spec.shortRun === true ? 30 : 68;
  const extents = new Map<string, CoursePoint[]>([
    ["west_yard", patch(a, 0)],
    ["east_yard", patch(b, 0)]
  ]);
  const view: InfraPlacementView = {
    bounds: { x0: r.x0, z0: r.z0, width: r.width, depth: r.depth },
    extentOf: (id) => extents.get(id),
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: (x, z) => {
      if (x < r.x0 || z < r.z0 || x >= r.x0 + r.width || z >= r.z0 + r.depth) return undefined;
      const k = index(r, x, z);
      if (p.fluidKind[k] !== FluidKind.NONE) return undefined;
      return p.ground[k] as number;
    },
    onRoad: (x, z) => carriageway[index(r, x, z)] === 1
  };

  const def = INFRA_ENTRIES["viaduct"];
  if (def === undefined) throw new Error('the registry has no "viaduct" row');
  const job: InfraEntryJob = {
    nodePath: "world.viaduct",
    def,
    route: { form: "between", target: "west_yard → east_yard", targets: ["west_yard", "east_yard"] },
    params: {},
    seed: nodeSeed(20260817n, "world.viaduct", ""),
    gates: true
  };

  const driver = driverForPlan(p);
  const result = declareLinework({
    region: r,
    jobs: [job],
    view,
    ground: driver,
    carriageway,
    fluidKind: driver.baseline.fluidKind
  });
  return { result, plan: p, baseline, carriageway, region: r };
}

/** The one bed a clean run declares. */
function viaductBed(spec: LineworkCase = {}) {
  const built = runLinework(spec);
  const bed = [...built.result.beds.values()][0];
  if (bed === undefined) throw new Error("the fixture declared no bed");
  return bed;
}

/* -------------------------------------------------------------------------- */
/* the component counter, on its own                                           */
/* -------------------------------------------------------------------------- */

describe("componentCount — 8-connected, for the resolver's own reason", () => {
  const column = (x: number, z: number) => ({ x, z, idx: z * 100 + x, y: 70 });

  it("counts a diagonal staircase as one run", () => {
    // 4-connected grouping would report every diagonal approach as interrupted,
    // which is a note that fires on every world.
    expect(componentCount([column(0, 0), column(1, 1), column(2, 2)])).toBe(1);
  });

  it("counts two separated runs as two", () => {
    expect(componentCount([column(0, 0), column(1, 0), column(9, 0), column(10, 0)])).toBe(2);
  });

  it("counts nothing as nothing", () => {
    expect(componentCount([])).toBe(0);
  });
});
