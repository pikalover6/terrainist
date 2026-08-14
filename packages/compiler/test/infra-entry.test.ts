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
import { infraEntryJobsOf } from "../src/structures/index.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { index } from "../src/structures/roads.js";
import { extentOfRects } from "../src/structures/walls.js";
import {
  INFRA_DEFAULT_MARGIN,
  buildInfraEntries,
  centroid,
  clampToBounds,
  rasterize,
  resolveInfraRoute,
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
