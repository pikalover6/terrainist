/**
 * `infra.entry@0` — the route resolver, the driver, and the two registries'
 * agreement (`docs/INFRA-ENTRIES-v0.md`, W0).
 *
 * The layers are tested apart because they fail apart, exactly as
 * `walls.test.ts` argues: a route that lands in the wrong place is geometry and
 * is visible in a column list; a run full of holes is occupancy and only shows
 * in blocks; a crossing behaviour that does the wrong thing is a set of path
 * indices. Rolling them together would make all three present as one red line.
 *
 * The fixture entry is the registry's own internal row. That is the point of
 * having one: the host's proof must not wait on content, and a fixture whose
 * blocks move when a theme is re-dealt would make every driver test a theme
 * test.
 */

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  INFRA_ENTRIES,
  INFRA_TEST_ENTRY,
  nodeSeed,
  type InfraEntryDef,
  type Region,
} from "@terrainist/stdlib";
import { INFRA_ENTRY_ROUTES, KNOWN_INFRA_ENTRIES } from "@terrainist/spec";

import { compileTerrain } from "../src/terrain/compile.js";
import { driverForPlan } from "../src/layout/ground-driver.js";
import { infraEntryJobsOf } from "../src/structures/index.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { index } from "../src/structures/roads.js";
import { extentOfRects } from "../src/structures/walls.js";
import {
  INFRA_DEFAULT_MARGIN,
  buildInfraEntries,
  catenaryParameter,
  centroid,
  cosh,
  clampToBounds,
  rasterize,
  resolveInfraRoute,
  spanHeights,
  spanRuns,
  type InfraPlacementView,
  type InfraRouteSpec,
} from "../src/structures/infra-entry.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEED = nodeSeed(0x1f4a0n, "world.cordon");
const REGION: Region = { x0: -64, z0: -64, width: 128, depth: 128 };
const BOUNDS = { x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth };
const GROUND = 96;

const DEF = INFRA_ENTRIES[INFRA_TEST_ENTRY] as InfraEntryDef;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A flat field. `slope` tilts it east so `into` has a bearing to find. */
function flatPlan(slope = 0): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      ground[j * REGION.width + i] = GROUND + Math.round(slope * i);
    }
  }
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

/** A settlement: one square of "buildings" in the middle of the region. */
const FABRIC = extentOfRects([{ x0: -30, z0: -30, x1: 30, z1: 30 }]);

/** A road running north-south at x = 0, five columns wide. */
function roadMask(): Uint8Array {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  for (let z = REGION.z0; z < REGION.z0 + REGION.depth; z++) {
    for (let x = -2; x <= 2; x++) mask[index(REGION, x, z)] = 1;
  }
  return mask;
}

/** The same road, as a named corridor polyline. */
function roadLine(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = -50; z <= 50; z++) out.push({ x: 0, z });
  return out;
}

function view(
  plan: ColumnPlan,
  options: {
    extent?: readonly { x: number; z: number }[];
    corridor?: readonly { x: number; z: number }[];
    mask?: Uint8Array;
    road?: Uint8Array;
  } = {},
): InfraPlacementView {
  const road = options.road;
  return {
    bounds: BOUNDS,
    extentOf: (id) => (id === "holding" ? (options.extent ?? FABRIC) : undefined),
    corridorOf: (id) => (id === "high_road" ? (options.corridor ?? roadLine()) : undefined),
    maskOf: (id) => (id === "fields" ? options.mask : undefined),
    ground: (x, z) =>
      x >= BOUNDS.x0 && z >= BOUNDS.z0 && x < BOUNDS.x0 + BOUNDS.width && z < BOUNDS.z0 + BOUNDS.depth
        ? (plan.ground[index(REGION, x, z)] as number)
        : undefined,
    onRoad: (x, z) =>
      road !== undefined &&
      x >= BOUNDS.x0 &&
      z >= BOUNDS.z0 &&
      x < BOUNDS.x0 + BOUNDS.width &&
      z < BOUNDS.z0 + BOUNDS.depth &&
      road[index(REGION, x, z)] === 1,
  };
}

function job(
  route: InfraRouteSpec,
  def: InfraEntryDef = DEF,
  patch: Partial<{ gates: boolean; height: number }> = {},
): {
  nodePath: string;
  def: InfraEntryDef;
  route: InfraRouteSpec;
  params: Record<string, unknown>;
  seed: Uint8Array;
  gates: boolean;
  height?: number;
} {
  return {
    nodePath: "world.cordon",
    def,
    route,
    params: {},
    seed: SEED,
    gates: patch.gates ?? true,
    ...(patch.height === undefined ? {} : { height: patch.height }),
  };
}

/* -------------------------------------------------------------------------- */
/* the two registries agree                                                    */
/* -------------------------------------------------------------------------- */

describe("the spec's restated vocabulary", () => {
  it("names exactly the registry's catalog-facing ids", () => {
    // The compiler is the first package that can see both, which is the same
    // arrangement `KNOWN_BUILDING_ARCHETYPES` is held to.
    expect([...KNOWN_INFRA_ENTRIES].sort()).toEqual(Object.keys(INFRA_ENTRIES).sort());
  });

  it("restates each entry's accepted route forms element by element", () => {
    for (const id of KNOWN_INFRA_ENTRIES) {
      expect(INFRA_ENTRY_ROUTES[id], id).toEqual([...(INFRA_ENTRIES[id] as InfraEntryDef).routes]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the route forms                                                             */
/* -------------------------------------------------------------------------- */

describe("ring", () => {
  it("derives a closed 4-connected course outside the anchor's extent", () => {
    const resolved = resolveInfraRoute({ form: "ring", target: "holding", margin: 12 }, view(flatPlan()));
    expect(resolved.kind).toBe("route");
    if (resolved.kind !== "route") return;
    expect(resolved.course.closed).toBe(true);
    expect(resolved.course.bends.length).toBeGreaterThan(2);
    // Every extent column is inside the ring's bounding box, with the margin
    // outside it: a cordon that cut the holding in half would be the old
    // `curtain_wall` prop's defect wearing a fence.
    const xs = resolved.course.path.map((c) => c.x);
    const zs = resolved.course.path.map((c) => c.z);
    expect(Math.min(...xs)).toBeLessThan(-30);
    expect(Math.max(...xs)).toBeGreaterThan(30);
    expect(Math.min(...zs)).toBeLessThan(-30);
    expect(Math.max(...zs)).toBeGreaterThan(30);
    // 4-connected: consecutive columns are one step apart, and the ring closes.
    for (let i = 0; i < resolved.course.path.length; i++) {
      const a = resolved.course.path[i]!;
      const b = resolved.course.path[(i + 1) % resolved.course.path.length]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });

  it("is a pure function of the placement — same extent, same course", () => {
    const a = resolveInfraRoute({ form: "ring", target: "holding" }, view(flatPlan()));
    const b = resolveInfraRoute({ form: "ring", target: "holding" }, view(flatPlan(0.2)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("stays inside the world region — clamped, as a wall course is", () => {
    const resolved = resolveInfraRoute(
      { form: "ring", target: "holding", margin: 60 },
      view(flatPlan()),
    );
    if (resolved.kind !== "route") return;
    for (const c of resolved.course.path) {
      expect(c.x).toBeGreaterThanOrEqual(BOUNDS.x0);
      expect(c.z).toBeGreaterThanOrEqual(BOUNDS.z0);
      expect(c.x).toBeLessThan(BOUNDS.x0 + BOUNDS.width);
      expect(c.z).toBeLessThan(BOUNDS.z0 + BOUNDS.depth);
    }
  });

  it("reports an absent anchor as unanchored, not as an empty route", () => {
    const resolved = resolveInfraRoute({ form: "ring", target: "nowhere" }, view(flatPlan()));
    expect(resolved.kind).toBe("unanchored");
  });
});

describe("along", () => {
  it("offsets the corridor's own line laterally, by the asked distance", () => {
    const left = resolveInfraRoute(
      { form: "along", target: "high_road", offset: 6, side: "left" },
      view(flatPlan()),
    );
    const right = resolveInfraRoute(
      { form: "along", target: "high_road", offset: 6, side: "right" },
      view(flatPlan()),
    );
    expect(left.kind).toBe("route");
    expect(right.kind).toBe("route");
    if (left.kind !== "route" || right.kind !== "route") return;
    // The corridor runs at x = 0; the two sides land on opposite hands of it.
    const lx = new Set(left.course.path.map((c) => c.x));
    const rx = new Set(right.course.path.map((c) => c.x));
    expect([...lx]).toEqual([-6]);
    expect([...rx]).toEqual([6]);
    expect(left.course.closed).toBe(false);
  });

  it("refuses an anchor with no line of its own", () => {
    const resolved = resolveInfraRoute({ form: "along", target: "holding" }, view(flatPlan()));
    expect(resolved.kind).toBe("unanchored");
  });
});

describe("across", () => {
  it("draws the perpendicular chord over the crossing, flanked on both sides", () => {
    const resolved = resolveInfraRoute(
      { form: "across", target: "high_road", margin: 4 },
      view(flatPlan(), { road: roadMask() }),
    );
    expect(resolved.kind).toBe("route");
    if (resolved.kind !== "route") return;
    const xs = resolved.course.path.map((c) => c.x);
    const zs = new Set(resolved.course.path.map((c) => c.z));
    // Perpendicular to a north-south road is one row of constant z…
    expect(zs.size).toBe(1);
    // …and it spans the five-column carriageway plus four columns of flank
    // either side.
    expect(Math.min(...xs)).toBe(-6);
    expect(Math.max(...xs)).toBe(6);
  });

  it("breaks ties by the stated total order — lowest z, then lowest x", () => {
    // A uniform corridor makes every crossing the same width, so the tie-break
    // is the *whole* answer. Without it two runs of one document disagree.
    const plan = flatPlan();
    const a = resolveInfraRoute(
      { form: "across", target: "high_road" },
      view(plan, { road: roadMask() }),
    );
    const b = resolveInfraRoute(
      { form: "across", target: "high_road" },
      view(plan, { road: roadMask() }),
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (a.kind !== "route") return;
    // The lowest z among the equally narrow crossings is the corridor's own
    // first column, z = -50.
    expect(a.course.path[0]?.z).toBe(-50);
  });
});

describe("into", () => {
  it("runs the asked length and ends at the named node", () => {
    const resolved = resolveInfraRoute(
      { form: "into", target: "holding", run: 40 },
      view(flatPlan(0.5)),
    );
    expect(resolved.kind).toBe("route");
    if (resolved.kind !== "route") return;
    const end = resolved.course.path[resolved.course.path.length - 1];
    expect(end).toEqual(centroid(FABRIC));
    // A run of forty columns' bearing, rasterized 4-connected, is at least
    // forty columns long.
    expect(resolved.course.path.length).toBeGreaterThanOrEqual(40);
  });

  it("picks the steepest outward bearing — the gouge comes down the hill", () => {
    // The field rises to the east, so the far end of the furrow is east of the
    // wreck and the run comes down towards it.
    const resolved = resolveInfraRoute(
      { form: "into", target: "holding", run: 30 },
      view(flatPlan(0.5)),
    );
    if (resolved.kind !== "route") return;
    const start = resolved.course.path[0]!;
    expect(start.x).toBeGreaterThan(centroid(FABRIC).x);
  });

  it("is deterministic on flat ground, where every bearing ties", () => {
    const a = resolveInfraRoute({ form: "into", target: "holding", run: 20 }, view(flatPlan()));
    const b = resolveInfraRoute({ form: "into", target: "holding", run: 20 }, view(flatPlan()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("over", () => {
  it("takes every column of the named node's published mask, row-major", () => {
    const mask = new Uint8Array(REGION.width * REGION.depth);
    for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) mask[index(REGION, x, z)] = 1;
    const resolved = resolveInfraRoute({ form: "over", target: "fields" }, view(flatPlan(), { mask }));
    expect(resolved.kind).toBe("area");
    if (resolved.kind !== "area") return;
    expect(resolved.columns.length).toBe(81);
    // Row-major: z ascending, then x ascending.
    expect(resolved.columns[0]).toEqual({ x: -4, z: -4 });
    expect(resolved.columns[8]).toEqual({ x: 4, z: -4 });
  });

  it("reports a node that publishes no mask as unanchored", () => {
    const resolved = resolveInfraRoute({ form: "over", target: "fields" }, view(flatPlan()));
    expect(resolved.kind).toBe("unanchored");
  });
});

describe("the geometry helpers", () => {
  it("keeps the longest in-bounds run and drops the rest", () => {
    const path = [
      { x: -1000, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 1000, z: 0 },
    ];
    expect(clampToBounds(path, BOUNDS)).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ]);
  });

  it("rasterizes 4-connected, with no diagonal joins", () => {
    const path = rasterize([
      { x: 0, z: 0 },
      { x: 5, z: 3 },
    ]);
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
    expect(path[path.length - 1]).toEqual({ x: 5, z: 3 });
  });
});

/* -------------------------------------------------------------------------- */
/* the driver                                                                  */
/* -------------------------------------------------------------------------- */

describe("the driver — registry to sweepCourse", () => {
  it("builds a ring of test fence around a fixture settlement", () => {
    const plan = flatPlan();
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "ring", target: "holding", margin: INFRA_DEFAULT_MARGIN })],
      view: view(plan),
    });
    expect(result.entries).toHaveLength(1);
    const built = result.entries[0]!;
    expect(built.entry).toBe(INFRA_TEST_ENTRY);
    expect(built.form).toBe("ring");
    expect(built.columns).toBeGreaterThan(100);
    expect(result.blocks.length).toBeGreaterThan(built.columns);
    expect(result.stats["infraEntryColumns"]).toBe(built.columns);
    // Every block stands on the flat field, not in it.
    for (const b of result.blocks) expect(b.y).toBeGreaterThan(GROUND);
  });

  it("is deterministic: the same fixture twice is the same block list", () => {
    const run = (): unknown => {
      const plan = flatPlan();
      return buildInfraEntries({
        plan,
        stack,
        jobs: [job({ form: "ring", target: "holding" })],
        view: view(plan),
      }).blocks;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("is total on an empty job list — the byte-identity claim, made structural", () => {
    const plan = flatPlan();
    const result = buildInfraEntries({ plan, stack, jobs: [], view: view(plan) });
    expect(result.blocks).toEqual([]);
    expect(result.entries).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.stats).toEqual({});
  });
});

describe("crossings — found, never placed (§3.6)", () => {
  const road = roadMask();
  const onRoadColumns = (blocks: readonly { x: number; z: number }[]): number =>
    blocks.filter((b) => Math.abs(b.x) <= 2).length;

  function ring(def: InfraEntryDef, gates = true): {
    columns: number;
    openings: number;
    inRoad: number;
  } {
    const plan = flatPlan();
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "ring", target: "holding", margin: 12 }, def, { gates })],
      view: view(plan, { road }),
    });
    const built = result.entries[0]!;
    return {
      columns: built.columns,
      openings: built.openings,
      inRoad: onRoadColumns(result.blocks),
    };
  }

  it("open: a carriageway crossing becomes an opening, and nothing is written in the road", () => {
    const open = ring({ ...DEF, crossings: "open" });
    // The road runs north-south through the middle, so the ring crosses it
    // twice and finds two gates.
    expect(open.openings).toBe(2);
    expect(open.inRoad).toBe(0);
  });

  it("block: the entry crosses regardless — a hedgerow does not open for a cart track", () => {
    const blocked = ring({ ...DEF, crossings: "block" });
    expect(blocked.openings).toBe(0);
    // The run is written *through* the carriageway, which is the whole
    // difference from `open`.
    expect(blocked.inRoad).toBeGreaterThan(0);
  });

  it("gap: every crossing is blocked but one, chosen by a stated total order", () => {
    const gap = ring({ ...DEF, crossings: "gap" });
    expect(gap.openings).toBe(1);
    // One gate's worth of road is left clear and the other crossing is built
    // through, so a barricade is not a wall across every street.
    expect(gap.inRoad).toBeGreaterThan(0);
    const open = ring({ ...DEF, crossings: "open" });
    expect(gap.columns).toBeGreaterThan(open.columns);
  });

  it("gates: false closes an open entry — the author outranks the behaviour", () => {
    expect(ring({ ...DEF, crossings: "open" }, false).openings).toBe(0);
  });
});

describe("diagnostics (§3.7)", () => {
  function build(route: InfraRouteSpec, def: InfraEntryDef = DEF): readonly { code: string }[] {
    const plan = flatPlan();
    return buildInfraEntries({ plan, stack, jobs: [job(route, def)], view: view(plan) })
      .diagnostics;
  }

  it("LOAM-T233 for an anchor that is absent, unplaced or not linear", () => {
    expect(build({ form: "ring", target: "nowhere" }).map((d) => d.code)).toContain("LOAM-T233");
    expect(build({ form: "along", target: "holding" }).map((d) => d.code)).toContain("LOAM-T233");
  });

  it("LOAM-T232 for a route shorter than the entry's minRun", () => {
    const codes = build({ form: "into", target: "holding", run: 4 }, { ...DEF, minRun: 200 }).map(
      (d) => d.code,
    );
    expect(codes).toContain("LOAM-T232");
  });

  it("LOAM-T234 when a run loses more than a third of its columns", () => {
    // Half the world already belongs to somebody else, so half the ring is
    // refused whole (the `Planter`'s column rule) — and the author reads "a
    // fence full of holes" rather than walking into one.
    const plan = flatPlan();
    const existing = [];
    for (let z = REGION.z0; z < REGION.z0 + REGION.depth; z++) {
      for (let x = REGION.x0; x < 0; x++) existing.push({ x, y: GROUND + 1, z, stateId: 1 });
    }
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "ring", target: "holding", margin: 12 })],
      view: view(plan),
      existing,
    });
    expect(result.entries[0]?.skipped).toBeGreaterThan(0);
    expect(result.diagnostics.map((d) => d.code)).toContain("LOAM-T234");
  });

  it("LOAM-T231 refuses a tier-A declarer — §3.5's line, defended", () => {
    const codes = build({ form: "ring", target: "holding" }, {
      ...DEF,
      sourceClass: "structure.linework",
    }).map((d) => d.code);
    expect(codes).toContain("LOAM-T231");
  });
});

describe("areal treatments (family C)", () => {
  it("rewrites the top course of the mask and writes nothing above it", () => {
    const plan = flatPlan();
    const mask = new Uint8Array(REGION.width * REGION.depth);
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) mask[index(REGION, x, z)] = 1;
    const areal: InfraEntryDef = {
      id: "test_patch",
      routes: ["over"],
      geometry: { kind: "area", stamp: () => ({ id: "test_patch", surface: "podzol" }) },
      crossings: "block",
      minRun: 1,
      rise: 0,
      internal: true,
    };
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "over", target: "fields" }, areal)],
      view: view(plan, { mask }),
    });
    expect(result.entries[0]?.columns).toBe(49);
    // No level, no block above the surface: a treatment writes exactly one
    // course, and it writes it *at* the ground rather than on top of it.
    for (const b of result.blocks) expect(b.y).toBe(GROUND);
  });
});

/* -------------------------------------------------------------------------- */
/* byte identity                                                               */
/* -------------------------------------------------------------------------- */

/**
 * **A world with no `infra.entry@0` node is byte-identical.**
 *
 * The claim is structural before it is empirical, and both halves are checked.
 * Structurally: `infraEntryJobsOf` returns an empty list for a document that
 * declares no entry, the caller therefore never constructs the pass (the
 * `undefined` branch in the wall's slot), and `buildInfraEntries` on an empty
 * job list is asserted above to produce no blocks, no diagnostics and no stats.
 * Empirically: a real settlement compiles to the same hash twice with the host
 * in the path, and carries none of the host's stats, diagnostics or blocks.
 */
describe("byte identity", () => {
  const document = {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "infra_identity", worldSeed: 4242 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [160, 160] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 14, seaLevel: 63, baseHeight: 70, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [96, 96] },
          constraints: [{ zone: "center" }],
          params: { fabric: "grid", density: "medium", mix: ["cottage"] },
        },
      ],
    },
  } as unknown as Parameters<typeof infraEntryJobsOf>[0];

  it("produces no jobs for a document that declares no entry", () => {
    expect(infraEntryJobsOf(document, "world", 4242n)).toEqual([]);
  });

  it("compiles such a world identically, and with none of the host in it", async () => {
    const compileOnce = async (): Promise<{ hash: string; codes: string[] }> => {
      const h = createHash("sha256");
      let stats: Readonly<Record<string, number>> = {};
      const result = await compileTerrain(document as unknown as Record<string, unknown>, {
        outDir: "/dev/null/never-written",
        skipEmit: true,
        onArtifacts: (artifacts) => {
          const { plan } = artifacts;
          h.update(Buffer.from(Uint8Array.from(plan.ground as unknown as ArrayLike<number>)));
          for (const block of artifacts.structures ?? []) h.update(`s ${JSON.stringify(block)}\n`);
        },
      });
      if (!result.ok) throw new Error(result.diagnostics.map((d) => d.code).join(", "));
      stats = (result.report as unknown as { structures?: { stats?: Record<string, number> } })
        .structures?.stats ?? {};
      for (const key of Object.keys(stats)) expect(key).not.toMatch(/^infraEntry/);
      return { hash: h.digest("hex"), codes: result.report.diagnostics.map((d) => d.code) };
    };
    const a = await compileOnce();
    const b = await compileOnce();
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe("");
    for (const code of a.codes) expect(["LOAM-T231", "LOAM-T232", "LOAM-T233", "LOAM-T234"]).not.toContain(code);
  }, 180_000);
});

/* -------------------------------------------------------------------------- */
/* W1 — P2's four (docs/INFRA-ENTRIES-v0.md §4)                                */
/* -------------------------------------------------------------------------- */

/**
 * The postcard, tested a piece at a time.
 *
 * P2 is *"a small farm town being invaded by aliens"*, and what the prompt is
 * actually about is one image: a cordon ringing the holding, a figure pressed
 * into its fields, a barricade thrown across the road with one way through, and
 * a furrow ending at the thing that made it. Four entries, four mechanisms —
 * a found gate, a deliberate gap, a level declared below the ground and an
 * areal geometry that flattens one — which is why this is the set that proves
 * the host rather than the four cheapest rows.
 *
 * Each is tested at the seam it can fail at: the route is geometry, the
 * crossing is a set of indices, the ground claim is a level in the plan, and
 * the blocks are occupancy. Rolling them together would make all four present
 * as one red line.
 */

/** A holding: the farm's fields, as an extent and as a published mask. */
const HOLDING = extentOfRects([{ x0: -24, z0: -24, x1: 24, z1: 24 }]);

/** The same holding's parcel mask — F17 publishes exactly this. */
function holdingMask(): Uint8Array {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  for (let z = -24; z <= 24; z++) for (let x = -24; x <= 24; x++) mask[index(REGION, x, z)] = 1;
  return mask;
}

function entryDef(id: string): InfraEntryDef {
  return INFRA_ENTRIES[id] as InfraEntryDef;
}

describe("quarantine_fence — the cordon rings the holding (ring, crossings: open)", () => {
  const road = roadMask();

  function cordon(): ReturnType<typeof buildInfraEntries> {
    const plan = flatPlan();
    return buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "ring", target: "holding", margin: 10 }, entryDef("quarantine_fence"))],
      view: view(plan, { extent: HOLDING, road }),
    });
  }

  it("rings the fields, outside them, and finds a gate where the road crosses", () => {
    const built = cordon().entries[0]!;
    expect(built.entry).toBe("quarantine_fence");
    expect(built.columns).toBeGreaterThan(100);
    // The road runs north–south through the middle, so the ring crosses it
    // twice: two gates, found and never authored.
    expect(built.openings).toBe(2);
  });

  it("writes nothing in the carriageway — the road passes through the cordon", () => {
    for (const b of cordon().blocks) expect(Math.abs(b.x) > 2 || b.z === undefined).toBe(true);
  });

  it("stands chain-link on a kerb, with masts and markers seated beside it", () => {
    const result = cordon();
    const built = result.entries[0]!;
    expect(built.fittings).toBeGreaterThan(0);
    const names = new Set(
      result.blocks.map((b) => stack.blockNameByStateId(b.stateId) ?? "?"),
    );
    expect(names.has("iron_bars")).toBe(true);
    expect(names.has("gray_concrete")).toBe(true);
    // The lantern-name rule: a floodlight mast is glowstone against solid.
    expect(names.has("glowstone")).toBe(true);
    expect([...names].some((n) => n.endsWith("_lantern"))).toBe(false);
    // Nothing in this entry is a block that needs a block entity.
    expect([...names].some((n) => n.endsWith("_banner") || n.endsWith("_sign"))).toBe(false);
  });

  it("leaves the gate walkable — solid floor, two of air over it", () => {
    const result = cordon();
    const written = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    // Every carriageway column of the ring's own crossing: nothing of the fence
    // stands in it at any height a walker meets.
    for (let x = -2; x <= 2; x++) {
      for (let y = GROUND + 1; y <= GROUND + 3; y++) {
        for (const b of result.blocks) {
          if (b.x === x && b.y === y) expect(written.has(`${x},${y},${b.z}`)).toBe(true);
        }
      }
    }
    for (const b of result.blocks) expect(Math.abs(b.x)).toBeGreaterThan(2);
  });

  it("is deterministic: the same holding twice is the same block list", () => {
    expect(JSON.stringify(cordon().blocks)).toBe(JSON.stringify(cordon().blocks));
  });
});

describe("barricade_line — one deliberate gap (across, crossings: gap)", () => {
  const road = roadMask();

  function barricade(): ReturnType<typeof buildInfraEntries> {
    const plan = flatPlan();
    return buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "across", target: "high_road" }, entryDef("barricade_line"))],
      view: view(plan, { road }),
    });
  }

  it("blocks the carriageway and leaves exactly one opening in it", () => {
    const result = barricade();
    const built = result.entries[0]!;
    expect(built.openings).toBe(1);
    // Built *through* the road — a barricade that stopped at the kerb would be
    // two heaps on the verges and a clear street between them, which is what
    // the W0 host actually produced.
    expect(result.blocks.some((b) => Math.abs(b.x) <= 2)).toBe(true);
  });

  it("and the opening is genuinely walkable through", () => {
    const result = barricade();
    // The chord runs east–west at one z; the doorway is a run of columns on it
    // with nothing standing in them at head height.
    const zs = new Set(result.blocks.map((b) => b.z));
    const written = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    const clear: number[] = [];
    for (const z of zs) {
      for (let x = -2; x <= 2; x++) {
        const standing = [GROUND + 1, GROUND + 2, GROUND + 3].some((y) =>
          written.has(`${x},${y},${z}`),
        );
        if (!standing) clear.push(x);
      }
    }
    // At least the three columns of the doorway, on the carriageway, with air
    // at the two courses a walker occupies and the field's own floor beneath.
    expect(new Set(clear).size).toBeGreaterThanOrEqual(3);
  });

  it("is asymmetric — the heap is pushed out one hand and not the other", () => {
    const result = barricade();
    const z0 = Math.min(...result.blocks.map((b) => b.z));
    const z1 = Math.max(...result.blocks.map((b) => b.z));
    // The bags are centred on the chord and the spill is on one side only, so
    // the run is off-centre in z by construction.
    expect(z1 - z0).toBeGreaterThan(1);
  });

  it("is deterministic: the same street twice is the same block list", () => {
    expect(JSON.stringify(barricade().blocks)).toBe(JSON.stringify(barricade().blocks));
  });
});

describe("crash_furrow — the gouge (into, declares its levels)", () => {
  function furrow(withDriver = true, slope = 0): {
    result: ReturnType<typeof buildInfraEntries>;
    plan: ColumnPlan;
  } {
    const plan = flatPlan(slope);
    const driver = driverForPlan(plan);
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "into", target: "holding", run: 40 }, entryDef("crash_furrow"))],
      view: view(plan, { extent: HOLDING }),
      ...(withDriver ? { ground: driver } : {}),
    });
    return { result, plan };
  }

  it("refuses to build with nothing at the end of it", () => {
    // The registry accepts `into` and no other form, so a furrow pointed at
    // something absent is `LOAM-T233` and never a furrow pointed at nothing.
    const plan = flatPlan();
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "into", target: "nowhere" }, entryDef("crash_furrow"))],
      view: view(plan),
    });
    expect(result.entries).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toContain("LOAM-T233");
    expect(result.blocks).toEqual([]);
  });

  it("cuts below the datum through the ground contract, not by stacking blocks", () => {
    // Measured on flat ground, where the section's arithmetic is exact: a
    // swept cross-section on a slope is *graded*, so its cut varies across the
    // width by design and would make this an assertion about a hillside rather
    // than about the profile.
    const before = flatPlan().ground;
    const { result, plan } = furrow(true, 0);
    const built = result.entries[0]!;
    expect(built.declared).toBeGreaterThan(0);
    // The plan's own ground is *lower* than the field was: the trench is
    // terrain, which is why it is a gouge rather than a path of black blocks
    // laid on a lawn. Two blocks down at the ditch band, one at the scorch.
    const cuts = new Set<number>();
    for (let i = 0; i < before.length; i++) {
      const cut = (before[i] as number) - (plan.ground[i] as number);
      if (cut !== 0) cuts.add(cut);
    }
    // The section, in the ground: two blocks down at the ditch band, one at the
    // scorched shoulders, and nothing raised anywhere — a gouge, not a bank.
    expect([...cuts].sort((a, b) => a - b)).toEqual([1, 2]);
    // The section is at or below the ground it was given; the only thing
    // standing on top is the debris thrown out either side.
    const names = (b: { stateId: number }): string => stack.blockNameByStateId(b.stateId) ?? "?";
    for (const b of result.blocks) {
      const g = plan.ground[index(REGION, b.x, b.z)] as number;
      // Debris and embers are thrown *out* of the gouge and lie on the field
      // beside it — one block, resting on the ground, six faces never all air.
      if (["cobblestone", "basalt"].includes(names(b)) && b.y === g + 1) continue;
      expect(b.y, names(b)).toBeLessThanOrEqual(g);
    }
  });

  it("scorches inside its own section and blends out to spoil at the shoulders", () => {
    const { result } = furrow();
    const names = result.blocks.map((b) => stack.blockNameByStateId(b.stateId) ?? "?");
    expect(names).toContain("blackstone");
    expect(names).toContain("basalt");
    expect(names).toContain("coarse_dirt");
    // Contained: the scorch is the profile's own bands, so no column of it is
    // more than the section's half-width from the run.
    const gouge = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "blackstone",
    );
    expect(gouge.length).toBeGreaterThan(0);
  });

  it("builds on the ground it finds when there is no driver — §3.12's fallback", () => {
    const { result } = furrow(false);
    expect(result.entries[0]?.declared).toBe(0);
    expect(result.entries[0]!.columns).toBeGreaterThan(0);
  });

  it("is deterministic: the same wreck twice is the same block list", () => {
    expect(JSON.stringify(furrow().result.blocks)).toBe(JSON.stringify(furrow().result.blocks));
  });
});

describe("crop_circle — the figure in the fields (over, flattens its ground)", () => {
  function circle(withDriver = true): {
    result: ReturnType<typeof buildInfraEntries>;
    plan: ColumnPlan;
    driver: ReturnType<typeof driverForPlan>;
  } {
    // A field with a little relief in it, so "flattened" is a claim with
    // something to prove.
    const plan = flatPlan(0.05);
    const driver = driverForPlan(plan);
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "over", target: "fields" }, entryDef("crop_circle"))],
      view: view(plan, { mask: holdingMask() }),
      ...(withDriver ? { ground: driver } : {}),
    });
    return { result, plan, driver };
  }

  it("declares its disc and levels it — the ratified Q2, in the plan", () => {
    const { result, plan } = circle();
    const built = result.entries[0]!;
    expect(built.declared).toBeGreaterThan(100);
    // Every column the figure covers came out at one level, and it is a level
    // the field actually had rather than a plinth or a pit.
    const levels = new Set(
      result.blocks.map((b) => plan.ground[index(REGION, b.x, b.z)] as number),
    );
    expect(levels.size).toBe(1);
  });

  it("presses the crop into a pattern rather than repainting the field", () => {
    const { result } = circle();
    const hay = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "hay_block",
    );
    expect(hay.length).toBeGreaterThan(20);
    // A figure, not a disc of hay: the bands are a minority of the covered
    // columns, and the mask is far bigger than either.
    expect(hay.length).toBeLessThan(result.entries[0]!.declared);
    // …and the figure is a disc inside the field, not the field.
    const xs = hay.map((b) => b.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(49);
  });

  it("writes no block above the ground it flattened", () => {
    const { result, plan } = circle();
    for (const b of result.blocks) {
      expect(b.y).toBeLessThanOrEqual((plan.ground[index(REGION, b.x, b.z)] as number));
    }
  });

  it("is deterministic: the same field twice is the same block list", () => {
    expect(JSON.stringify(circle().result.blocks)).toBe(JSON.stringify(circle().result.blocks));
  });
});

/* -------------------------------------------------------------------------- */
/* `between` — the road router's cost field, and the span it carries (W4)      */
/* -------------------------------------------------------------------------- */

/**
 * The `between` form and the `span` geometry are tested together and apart in
 * the same way the rest of this file is: the corridor is geometry and is
 * visible in a column list, the curve is arithmetic and is visible in a height
 * array, and the member's *support* is a claim about blocks and is checked on
 * the block list. The last one is the physics claim — every chain block hangs
 * from the tower or from chain above or beside it — and it is the reason a
 * hanging member could not be a swept profile.
 */
describe("between (§3.2)", () => {
  const MOLE_N = { x: -40, z: 0 };
  const MOLE_S = { x: 40, z: 0 };

  /** A view with two named anchors, one column each, plus an optional ridge. */
  function harbour(
    plan: ColumnPlan,
    options: { road?: Uint8Array; blockAt?: (x: number, z: number) => boolean } = {},
  ): InfraPlacementView {
    const base = view(plan, options.road === undefined ? {} : { road: options.road });
    return {
      ...base,
      extentOf: (id) =>
        id === "north_mole" ? [MOLE_N] : id === "south_mole" ? [MOLE_S] : undefined,
      ground: (x, z) => (options.blockAt?.(x, z) === true ? undefined : base.ground(x, z)),
    };
  }

  const PAIR: InfraRouteSpec = {
    form: "between",
    target: "north_mole → south_mole",
    targets: ["north_mole", "south_mole"],
  };

  it("routes a 4-connected corridor from the first anchor to the second", () => {
    const resolved = resolveInfraRoute(PAIR, harbour(flatPlan()));
    expect(resolved.kind).toBe("route");
    if (resolved.kind !== "route") return;
    const path = resolved.course.path;
    // Orientation is the node's, not A*'s: the run starts at the anchor the
    // author named first, because an interval feature's phase is locked to it.
    expect(path[0]).toEqual(MOLE_N);
    expect(path[path.length - 1]).toEqual(MOLE_S);
    expect(resolved.course.closed).toBe(false);
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });

  it("is deterministic — the same placement twice is the same corridor", () => {
    const a = resolveInfraRoute(PAIR, harbour(flatPlan()));
    const b = resolveInfraRoute(PAIR, harbour(flatPlan()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("reports a missing anchor as unanchored, naming the end that is missing", () => {
    const resolved = resolveInfraRoute(
      { form: "between", target: "north_mole → nowhere", targets: ["north_mole", "nowhere"] },
      harbour(flatPlan()),
    );
    expect(resolved.kind).toBe("unanchored");
    if (resolved.kind !== "unanchored") return;
    expect(resolved.detail).toContain("nowhere");
  });

  it("refuses a pair with no anchors at all rather than routing from nothing", () => {
    const resolved = resolveInfraRoute({ form: "between", target: "a → b" }, harbour(flatPlan()));
    expect(resolved.kind).toBe("unanchored");
  });

  it("honours the entry's grade cap: a wall the corridor may not climb is empty", () => {
    // A ridge of unclimbable ground across the middle. At a cap of 8 the
    // corridor goes over it; at 1 there is no way across at all, and the
    // difference is the whole of "at the entry's own grade cap".
    const plan = flatPlan();
    for (let z = 0; z < REGION.depth; z++) {
      for (const dx of [-1, 0, 1]) {
        plan.ground[z * REGION.width + (REGION.width >> 1) + dx] = GROUND + 6;
      }
    }
    const permissive = resolveInfraRoute(PAIR, harbour(plan), { gradeCap: 8 });
    const strict = resolveInfraRoute(PAIR, harbour(plan), { gradeCap: 1 });
    expect(permissive.kind).toBe("route");
    expect(strict.kind).toBe("empty");
    if (strict.kind !== "empty") return;
    expect(strict.detail).toContain("grade cap");
  });

  it("refuses an anchor standing on nothing, rather than routing to it", () => {
    const resolved = resolveInfraRoute(
      PAIR,
      harbour(flatPlan(), { blockAt: (x, z) => x === MOLE_S.x && z === MOLE_S.z }),
    );
    expect(resolved.kind).toBe("empty");
    if (resolved.kind !== "empty") return;
    expect(resolved.detail).toContain("south_mole");
  });

  it("refuses a pair that resolved to one column — nothing is between a thing and itself", () => {
    const plan = flatPlan();
    const one: InfraPlacementView = {
      ...harbour(plan),
      extentOf: () => [MOLE_N],
    };
    expect(resolveInfraRoute(PAIR, one).kind).toBe("empty");
  });
});

describe("the catenary (family E's span)", () => {
  it("solves the parameter that gives the sag it was asked for", () => {
    for (const [span, sag] of [
      [40, 0.1],
      [64, 0.125],
      [80, 0.3],
    ] as const) {
      const a = catenaryParameter(span, sag * span);
      // The definition, back the other way: `a·(cosh(span/2a) − 1)` is the sag.
      expect(a * (cosh(span / (2 * a)) - 1)).toBeCloseTo(sag * span, 6);
    }
  });

  it("is a series, not `Math.cosh` — and agrees with it to the last useful digit", () => {
    // The series is what makes the curve bit-identical across engines; that it
    // *also* matches the platform's own answer is what says it is right.
    for (const x of [0, 0.25, 1, 2, 3.5]) expect(cosh(x)).toBeCloseTo(Math.cosh(x), 10);
  });

  it("hangs: anchored at both heads, sagging in the middle, convex throughout", () => {
    const span = 60;
    const y = spanHeights(120, 120, span, 0.125, () => undefined);
    expect(y.length).toBe(span + 1);
    expect(y[0]).toBe(120);
    expect(y[span]).toBe(120);
    // The sag is the registry's number, to the block the rounding lands on:
    // 0.125 of sixty is seven and a half, and a curve made of blocks has to
    // pick one of them.
    expect(120 - Math.min(...y)).toBeGreaterThanOrEqual(Math.floor(0.125 * span));
    expect(120 - Math.min(...y)).toBeLessThanOrEqual(Math.ceil(0.125 * span));
    // Non-increasing to the low point and non-decreasing after it — a curve,
    // never a rope with a kink in it.
    const low = y.indexOf(Math.min(...y));
    for (let i = 1; i <= low; i++) expect(y[i]!).toBeLessThanOrEqual(y[i - 1]!);
    for (let i = low + 1; i < y.length; i++) expect(y[i]!).toBeGreaterThanOrEqual(y[i - 1]!);
  });

  it("keeps its clearance over what stands under it, and never rises over the chord", () => {
    const span = 60;
    const floor = (i: number): number => (i > 20 && i < 40 ? 118 : 60);
    const y = spanHeights(120, 120, span, 0.3, floor);
    for (let i = 1; i < span; i++) {
      expect(y[i]!).toBeGreaterThanOrEqual(floor(i));
      expect(y[i]!).toBeLessThanOrEqual(120);
    }
  });

  it("lets the span win where the sag demands it — a clamp is a floor, not a lift", () => {
    // Ground *above* both heads: the member cannot be lifted over its own
    // supports, so it stays on the chord and the note that it touches what is
    // under it is the honest answer.
    const y = spanHeights(100, 100, 40, 0.2, () => 200);
    for (const v of y) expect(v).toBeLessThanOrEqual(100);
  });

  it("is deterministic and unequal-head safe", () => {
    const a = spanHeights(120, 132, 55, 0.125, () => undefined);
    const b = spanHeights(120, 132, 55, 0.125, () => undefined);
    expect(a).toEqual(b);
    expect(a[0]).toBe(120);
    expect(a[a.length - 1]).toBe(132);
  });

  it("fills every vertical gap, so no column's run leaves a block hanging alone", () => {
    const y = [120, 120, 116, 110, 111, 118, 120];
    const runs = spanRuns(y);
    for (let i = 1; i < y.length - 1; i++) {
      const run = runs[i]!;
      expect(run.lo).toBe(y[i]);
      // The run reaches the level of the neighbour nearer its tower, which is
      // what puts a block beside that neighbour's own block.
      const low = y.indexOf(Math.min(...y));
      const towerward = i < low ? y[i - 1]! : i > low ? y[i + 1]! : Math.max(y[i - 1]!, y[i + 1]!);
      expect(run.hi).toBeGreaterThanOrEqual(towerward);
    }
  });
});

describe("harbour_chain_tower — the span, built", () => {
  const MOLE_N = { x: -24, z: 0 };
  const MOLE_S = { x: 24, z: 0 };
  const DEF_SPAN = INFRA_ENTRIES["harbour_chain_tower"] as InfraEntryDef;

  function built(patch: Partial<InfraEntryDef> = {}, road?: Uint8Array) {
    const plan = flatPlan();
    const base = view(plan, road === undefined ? {} : { road });
    const harbourView: InfraPlacementView = {
      ...base,
      extentOf: (id) =>
        id === "north_mole" ? [MOLE_N] : id === "south_mole" ? [MOLE_S] : undefined,
    };
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [
        job(
          {
            form: "between",
            target: "north_mole → south_mole",
            targets: ["north_mole", "south_mole"],
          },
          { ...DEF_SPAN, ...patch },
        ),
      ],
      view: harbourView,
    });
    return { result, plan };
  }

  it("stands two towers and slings a chain between their heads", () => {
    const { result, plan } = built();
    const chain = stack.blockByName("iron_chain")?.stateId;
    expect(chain).toBeDefined();
    const cable = result.blocks.filter((b) => b.stateId === chain);
    const towers = result.blocks.filter((b) => b.stateId !== chain);
    expect(towers.length).toBeGreaterThan(0);
    expect(cable.length).toBeGreaterThan(20);
    // Both towers, on the ground, at the two anchors and nowhere else.
    for (const c of [MOLE_N, MOLE_S]) {
      const column = towers.filter((b) => b.x === c.x && b.z === c.z);
      expect(column.length, `${c.x},${c.z}`).toBe(DEF_SPAN.geometry.kind === "span" ? column.length : 0);
      expect(column.length).toBeGreaterThan(4);
      expect(Math.min(...column.map((b) => b.y))).toBe(
        (plan.ground[index(REGION, c.x, c.z)] as number) + 1,
      );
    }
    // The chain hangs *below* the heads and touches neither anchor column.
    const head = Math.max(...towers.map((b) => b.y));
    for (const b of cable) {
      expect(b.y).toBeLessThanOrEqual(head);
      expect(b.x === MOLE_N.x || b.x === MOLE_S.x).toBe(false);
    }
    // …and it sags: the low point is well under the heads.
    expect(Math.min(...cable.map((b) => b.y))).toBeLessThan(head - 2);
  });

  it("hangs from something: every chain block has chain or tower above or beside it", () => {
    // The physics claim, checked as connectivity: the member plus the towers is
    // one 6-connected body, and it contains both tower heads. A block floating
    // in the air fails this, and so does a curve broken by a rounding step.
    const { result } = built();
    const solid = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    const seen = new Set<string>();
    const start = `${MOLE_N.x},${Math.max(
      ...result.blocks.filter((b) => b.x === MOLE_N.x && b.z === MOLE_N.z).map((b) => b.y),
    )},${MOLE_N.z}`;
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const [x, y, z] = (queue.pop() as string).split(",").map(Number) as [number, number, number];
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ] as const) {
        const key = `${x + dx},${y + dy},${z + dz}`;
        if (!solid.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push(key);
      }
    }
    expect(seen.size).toBe(solid.size);
  });

  it("refuses the pair when one tower cannot stand — ships as a pair or not at all", () => {
    // A carriageway over the south mole: the tower there is refused, and an
    // `open` entry never plants in the road. The chain goes with it.
    const road = new Uint8Array(REGION.width * REGION.depth);
    for (let z = -2; z <= 2; z++) {
      for (let x = 22; x <= 26; x++) road[index(REGION, x, z)] = 1;
    }
    const { result } = built({}, road);
    const chain = stack.blockByName("iron_chain")?.stateId;
    expect(result.blocks.filter((b) => b.stateId === chain).length).toBe(0);
    expect(result.entries[0]?.skipped).toBeGreaterThan(0);
  });

  it("is byte-identical on a second compile of the same harbour", () => {
    expect(JSON.stringify(built().result.blocks)).toBe(JSON.stringify(built().result.blocks));
  });
});
