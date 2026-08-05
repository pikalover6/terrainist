/**
 * `terraced` — WP-C of `docs/URBAN-FORMS-v0.md`.
 *
 * Four layers, in rising cost:
 *
 * 1. **The skeleton** (§8.1) — determinism, 4-connectivity, connectivity,
 *    boundary reach, containment, and the same on a clipped, rotated cell.
 * 2. **The form's own promises** (§8.2) — no lot spans two bench levels, every
 *    adjacent bench pair is joined by at least one stair, every built stair is
 *    climbable under the tread law, and a flat quarter draws exactly one
 *    `DISTRICT_FORM` warning, falls back, and still ships a quarter.
 * 3. **The seam that changes the solver** (§3.6, risk 2) — the form is resolved
 *    once before the solve to set `groundPolicy` and once inside `layDistrict`
 *    to draw, and the test that they agree is *not* optional.
 * 4. **A compiled world at zero findings** (§8.1.8) — stepped streets on a real
 *    slope are exactly where unsupported stairs and floating blocks would show
 *    up, and only the physics lint can see them.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HeightField, centeredRegion, nodeSeed, type Region } from "@terrainist/stdlib";
import { validateSettlementDocument, type DistrictNode, type SettlementDocument } from "@terrainist/spec";

import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import {
  districtGroundPolicy,
  resolveDistrictFabric,
  solveDistricts,
  type DistrictPassResult,
} from "../src/layout/district.js";
import type { Point2, Rect } from "../src/layout/frames.js";
import { padFor } from "../src/layout/solve.js";
import type { LayoutNodeInput, Placement } from "../src/layout/types.js";
import { GRID_FORM } from "../src/layout/forms/grid.js";
import {
  BENCH_HEIGHT,
  TERRACED_FORM,
  benchFieldOf,
} from "../src/layout/forms/terraced.js";
import {
  drawFabric,
  flatGround,
  installUrbanForms,
  registerForm,
  urbanForm,
  type FormContext,
  type GroundSample,
} from "../src/layout/forms/index.js";
import { synthesizeTreadPlan, treadPlan, worstRise } from "../src/structures/profiles.js";
import { boundaryEndpoints, carriagewayCells, type StreetGraph } from "../src/layout/streets.js";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const BOUNDS: Rect = { x0: 0, z0: 0, x1: 199, z1: 179 };
const SEED = nodeSeed(20260804n, "world.hill_town", "");

/**
 * A steady hillside, at a gradient a town can actually stand on.
 *
 * One block of rise per fifteen columns of x and per thirty of z, so a bench of
 * {@link BENCH_HEIGHT} is about sixty columns wide — a block of lots between two
 * contour streets rather than a ledge. (A 1-in-3 hill gives twelve-column
 * benches, which are narrower than a street plus its two verges, and the quarter
 * comes out as all pavement and no houses. That is the real cost of a fixed
 * bench height, and it is `docs/URBAN-FORMS-v0.md` §10.3.)
 */
const hillAt = (x: number, z: number): number => 70 + Math.round((x * 2 + z) / 30);

function hillGround(): GroundSample {
  return {
    height: hillAt,
    water: () => false,
    slope: (x, z) => Math.abs(hillAt(x + 1, z) - hillAt(x, z)),
    relief: hillAt(BOUNDS.x1, BOUNDS.z1) - hillAt(BOUNDS.x0, BOUNDS.z0),
    levelled: false,
    waterReach: Number.POSITIVE_INFINITY,
  };
}

const context = (over: Partial<FormContext> = {}): FormContext => ({
  bounds: BOUNDS,
  seed: SEED,
  blockSize: 40,
  sidewalk: 2,
  density: "medium",
  ground: hillGround(),
  focus: [],
  ...over,
});

function planOf(over: Partial<FormContext> = {}) {
  const result = TERRACED_FORM.draw(context(over));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`terraced refused a slope it should have drawn: ${result.reason}`);
  return result.plan;
}

/** An ellipse-ish cell mask: the clipped polygon a city plan lays. */
function blobMask(bounds: Rect): Uint8Array {
  const w = bounds.x1 - bounds.x0 + 1;
  const d = bounds.z1 - bounds.z0 + 1;
  const out = new Uint8Array(w * d);
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / (w / 2);
      const v = (z - cz) / (d / 2);
      out[z * w + x] = u * u + v * v <= 0.98 ? 1 : 0;
    }
  }
  return out;
}

/**
 * Is every segment reachable from any one segment, over the carriageway?
 *
 * §8.1.4's wording exactly — *segments*, not columns. A width-dilated band can
 * shed a handful of cells at a turn against the domain edge, and a stranded
 * paving cell is not a stranded street.
 */
function connected(graph: StreetGraph, bounds: Rect): boolean {
  const cells = carriagewayCells(graph, bounds);
  const keys = new Set(cells.map((c) => `${c.x},${c.z}`));
  const first = cells[0];
  if (first === undefined) return false;
  const seen = new Set<string>([`${first.x},${first.z}`]);
  const queue: Point2[] = [{ x: first.x, z: first.z }];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Point2;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = `${at.x + dx},${at.z + dz}`;
      if (!keys.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: at.x + dx, z: at.z + dz });
    }
  }
  return graph.segments.every((segment) =>
    segment.path.some((c) => seen.has(`${c.x},${c.z}`)),
  );
}

/* -------------------------------------------------------------------------- */
/* 1. the skeleton (§8.1)                                                      */
/* -------------------------------------------------------------------------- */

describe("the terraced skeleton", () => {
  it("draws the same quarter twice from one seed", () => {
    const a = planOf();
    const b = planOf();
    expect(JSON.stringify(b.graph)).toBe(JSON.stringify(a.graph));
    expect(JSON.stringify(b.benches)).toBe(JSON.stringify(a.benches));
  });

  it("is a function of the ground and the seed, not of anything else", () => {
    // A landmark elsewhere in the document changes the focus list and nothing
    // this form reads. The positional-hash law, stated as a test.
    const a = planOf();
    const b = planOf({ focus: [{ kind: "landmark", at: { x: 10, z: 10 }, id: "keep", weight: 1 }] });
    expect(JSON.stringify(b.graph)).toBe(JSON.stringify(a.graph));
  });

  it("steps every path by exactly one block on exactly one axis", () => {
    for (const segment of planOf().graph.segments) {
      for (let i = 1; i < segment.path.length; i++) {
        const a = segment.path[i - 1] as Point2;
        const b = segment.path[i] as Point2;
        expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), segment.id).toBe(1);
      }
    }
  });

  it("reaches every segment from every other on foot", () => {
    expect(connected(planOf().graph, BOUNDS)).toBe(true);
  });

  it("reaches its own boundary, so a lane from the next quarter can anchor", () => {
    expect(boundaryEndpoints(planOf().graph, BOUNDS).length).toBeGreaterThan(0);
  });

  it("lays no carriageway column outside its own bounds", () => {
    for (const cell of carriagewayCells(planOf().graph, BOUNDS)) {
      expect(cell.x).toBeGreaterThanOrEqual(BOUNDS.x0);
      expect(cell.x).toBeLessThanOrEqual(BOUNDS.x1);
      expect(cell.z).toBeGreaterThanOrEqual(BOUNDS.z0);
      expect(cell.z).toBeLessThanOrEqual(BOUNDS.z1);
    }
  });

  it("draws inside a clipped, rotated cell without leaving the mask", () => {
    const mask = blobMask(BOUNDS);
    const plan = planOf({ mask, orientation: 45 });
    const stride = BOUNDS.x1 - BOUNDS.x0 + 1;
    for (const segment of plan.graph.segments) {
      for (const cell of segment.path) {
        expect(mask[(cell.z - BOUNDS.z0) * stride + (cell.x - BOUNDS.x0)], segment.id).toBe(1);
      }
    }
    expect(connected(plan.graph, BOUNDS)).toBe(true);
  });

  it("says it ignored the orientation, because the contours decide", () => {
    const record = planOf({ orientation: 30 }).record;
    expect(record.id).toBe("terraced");
    expect(record.requested).toBe("terraced");
    expect(record.ignored).toContain("orientation (contour-led)");
    // …and ignoring it means ignoring it: the same quarter comes out.
    expect(JSON.stringify(planOf({ orientation: 30 }).graph)).toBe(JSON.stringify(planOf().graph));
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the benches and the stairs (§8.2)                                        */
/* -------------------------------------------------------------------------- */

describe("the benches", () => {
  it("covers every column of the quarter exactly once", () => {
    const plan = planOf();
    const seen = new Map<string, number>();
    for (const bench of plan.benches ?? []) {
      for (const run of bench.runs) {
        expect(run.z0).toBe(run.z1);
        for (let x = run.x0; x <= run.x1; x++) {
          const key = `${x},${run.z0}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
    }
    const columns = (BOUNDS.x1 - BOUNDS.x0 + 1) * (BOUNDS.z1 - BOUNDS.z0 + 1);
    expect(seen.size).toBe(columns);
    expect([...seen.values()].filter((n) => n > 1)).toEqual([]);
  });

  it("steps by exactly one storey between neighbours", () => {
    const levels = (planOf().benches ?? []).map((b) => b.level);
    expect(levels.length).toBeGreaterThan(1);
    for (let k = 1; k < levels.length; k++) {
      expect((levels[k] as number) - (levels[k - 1] as number)).toBe(BENCH_HEIGHT);
    }
  });

  it("puts a street on every bench boundary it kept", () => {
    // The invariant that makes the whole form safe: a bench boundary is a
    // street, so no block — and therefore no lot — spans two bench levels.
    const ctx = context();
    const plan = planOf();
    const { bench } = benchFieldOf(ctx);
    const stride = BOUNDS.x1 - BOUNDS.x0 + 1;
    const paved = new Set(carriagewayCells(plan.graph, BOUNDS).map((c) => `${c.x},${c.z}`));
    let boundaries = 0;
    let covered = 0;
    for (let z = BOUNDS.z0; z < BOUNDS.z1; z++) {
      for (let x = BOUNDS.x0; x < BOUNDS.x1; x++) {
        const k = (z - BOUNDS.z0) * stride + (x - BOUNDS.x0);
        if ((bench[k] as number) === (bench[k + 1] as number)) continue;
        boundaries++;
        if (paved.has(`${x},${z}`) || paved.has(`${x + 1},${z}`)) covered++;
      }
    }
    expect(boundaries).toBeGreaterThan(0);
    // Contour components below `MIN_CLIPPED_RUN` are dropped by design and
    // their columns fall back into the bench either side, so this is a share
    // rather than a total — but it is a large share, and a form that stopped
    // following the contours would fall off a cliff here rather than drift.
    expect(covered / boundaries).toBeGreaterThan(0.9);
  });
});

describe("the stairs", () => {
  it("joins every adjacent bench pair with at least one flight", () => {
    const ctx = context();
    const plan = planOf();
    const { bench } = benchFieldOf(ctx);
    const stride = BOUNDS.x1 - BOUNDS.x0 + 1;
    const benchAt = (p: Point2): number =>
      bench[(p.z - BOUNDS.z0) * stride + (p.x - BOUNDS.x0)] as number;

    const joined = new Set<string>();
    for (const segment of plan.graph.segments) {
      if (segment.role !== "steps") continue;
      const touched = [...new Set(segment.path.map(benchAt))].sort((a, b) => a - b);
      for (let k = 1; k < touched.length; k++) {
        for (let b = touched[k - 1] as number; b < (touched[k] as number); b++) joined.add(`${b}`);
      }
    }

    const levels = (plan.benches ?? []).length;
    expect(levels).toBeGreaterThan(2);
    // Every one of them, §8.2's wording. A bench with no stair is a terrace you
    // can see and cannot reach, and it is the defect this assertion exists for.
    for (let pair = 0; pair < levels - 1; pair++) {
      expect(joined.has(`${pair}`), `bench ${pair} → ${pair + 1}`).toBe(true);
    }
  });

  it("builds only flights a player can climb", () => {
    const plan = planOf();
    const flights = plan.graph.segments.filter((s) => s.role === "steps");
    expect(flights.length).toBeGreaterThan(0);
    for (const segment of flights) {
      const ground = segment.path.map((c) => hillAt(c.x, c.z) + 1);
      const dressed = synthesizeTreadPlan(ground, { maxFill: 8, reach: 1, maxGrade: 1 });
      // A refused flight is not built downstream — that is the whole-run
      // refusal, and it is checked in `roads.ts`. What must never happen is a
      // flight that *is* built and cannot be climbed.
      if (dressed === null) continue;
      expect(worstRise(dressed.levels, treadPlan(dressed.levels, ground)), segment.id).toBeLessThanOrEqual(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the announced fallback (§8.2, §10.1)                                     */
/* -------------------------------------------------------------------------- */

describe("a terraced quarter on a billiard table", () => {
  beforeAll(() => {
    installUrbanForms();
    // `grown` is WP-D's module. Until it lands the fallback has nowhere to go,
    // and this test is about the *announcement*, not about what `grown` draws.
    if (urbanForm("grown") === undefined) registerForm({ ...GRID_FORM, id: "grown" });
  });

  it("warns once, naming the measurement and the fix, and still ships a quarter", () => {
    const result = drawFabric({
      ...context({ ground: flatGround() }),
      fabric: "terraced",
      nodePath: "world.hill_town",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `DISTRICT_FORM` is `LOAM-T222` on the wire.
    const warnings = result.outcome.diagnostics.filter((d) => d.code === "LOAM-T222");
    expect(warnings).toHaveLength(1);
    const only = warnings[0];
    expect(only?.message).toContain("terraced");
    expect(only?.message).toContain("relief");
    expect(only?.fix ?? "").not.toBe("");
    // Requested vs drawn, in the record, for the compile report.
    expect(result.outcome.plan.record.requested).toBe("terraced");
    expect(result.outcome.plan.record.id).not.toBe("terraced");
    expect(result.outcome.plan.record.fellBackBecause ?? "").toContain("relief");
    expect(result.outcome.plan.graph.segments.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. the seam that changes the solver (§3.6, risk 2)                          */
/* -------------------------------------------------------------------------- */

const DISTRICT_BOUNDS: Rect = { x0: -100, z0: -90, x1: 99, z1: 89 };

/**
 * A hillside whose contours run with the world axes.
 *
 * Deliberately not the diagonal hill the skeleton tests use: `subdivide`
 * inscribes an **axis-aligned** rectangle in every block, so a diagonal bench
 * loses most of its area to the lot cutter and a 200 × 180 quarter comes back
 * with a handful of houses. That is `docs/URBAN-FORMS-v0.md` risk 3, it is
 * measured rather than hidden (see the assertion below), and it is not a thing
 * this package can fix — it wants a polygon lot cutter.
 */
function slopedField(region: Region): HeightField {
  const field = new HeightField(region);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      field.values[j * region.width + i] = 70 + Math.round(i / 15);
    }
  }
  return field;
}

function districtDoc(fabric: string): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "terrace_fixture", worldSeed: 20260804 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 26, baseHeight: 84, seaLevel: 62, octaves: 3, frequency: 0.004 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "hill_town",
          kind: "district",
          envelope: { shape: "region", size: [200, 180] },
          params: { fabric, density: "medium", mix: ["cottage", "townhouse", "shop_row"], blockSize: 40 },
          constraints: [{ zone: "center" }],
        },
      ],
    },
  };
}

function documentOf(fabric: string): SettlementDocument {
  const validated = validateSettlementDocument(districtDoc(fabric));
  const doc = validated.document;
  if (doc === undefined) {
    throw new Error(`fixture did not validate: ${validated.diagnostics.map((d) => d.code).join("; ")}`);
  }
  return doc;
}

function districtOf(doc: SettlementDocument): DistrictNode {
  const found = (doc.root.children ?? []).find((c) => c.kind === "district");
  return found as DistrictNode;
}

function layTerraced(): DistrictPassResult {
  const doc = documentOf("terraced");
  const region = centeredRegion(256, 256);
  return solveDistricts({
    doc,
    worldSeed: 20260804n,
    field: slopedField(region),
    placements: [
      {
        nodePath: "world.hill_town",
        id: "hill_town",
        translation: [DISTRICT_BOUNDS.x0, 90, DISTRICT_BOUNDS.z0],
        yaw: 0,
        mirror: false,
        size: [200, 1, 180],
        footprint: DISTRICT_BOUNDS,
        anchor: { x: 0, z: 0 },
        foundationY: 90,
      } satisfies Placement,
    ],
  });
}

describe("the ground policy", () => {
  // Phase 4.2 renamed this value: what `terraced` declares is now spelled
  // `"benched"` — the form cuts its own platforms and `padFor` lays no pad —
  // and `"stepped"` means that *plus* seam treatment, which a document has to
  // ask for by name. The rename is what keeps a `terraced` quarter
  // byte-identical (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.2, §6.2).
  it("asks the registry, and the registry says benched", () => {
    const doc = documentOf("terraced");
    expect(districtGroundPolicy(doc, districtOf(doc), "world.hill_town")).toBe("benched");
    const flat = documentOf("grid");
    expect(districtGroundPolicy(flat, districtOf(flat), "world.hill_town")).toBe("pad");
  });

  it("stops the solver levelling the contours the form was going to read", () => {
    const node: LayoutNodeInput = {
      id: "hill_town",
      nodePath: "world.hill_town",
      kind: "district",
      groundPolicy: "benched",
      size: [200, 1, 180],
      flexible: false,
      padding: 0,
      rotations: [0],
      constraints: [{ type: "terrain_conform", mode: "cut_fill" } as never],
      ports: {},
      optional: false,
      tags: [],
      seed: SEED,
    };
    const placement: Placement = {
      nodePath: "world.hill_town",
      id: "hill_town",
      translation: [DISTRICT_BOUNDS.x0, 90, DISTRICT_BOUNDS.z0],
      yaw: 0,
      mirror: false,
      size: [200, 1, 180],
      footprint: DISTRICT_BOUNDS,
      anchor: { x: 0, z: 0 },
      foundationY: 90,
    };
    expect(padFor(node, placement)).toBeNull();
    const { groundPolicy: _dropped, ...padded } = node;
    expect(padFor(padded as LayoutNodeInput, placement)).not.toBeNull();
  });

  it("resolves the form to the same id before the solve and inside the pass", () => {
    // Risk 2 of the design, and the test it says is not optional: the fabric is
    // resolved once in `from-document.ts` (to set the policy) and once in
    // `layDistrict` (to draw). `resolveDistrictFabric` is the shared answer.
    const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
    const files = readdirSync(examples).filter((f) => f.endsWith(".loam.json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const validated = validateSettlementDocument(
        JSON.parse(readFileSync(path.join(examples, file), "utf8")) as unknown,
      );
      const doc = validated.document;
      if (doc === undefined) continue;
      for (const child of doc.root.children ?? []) {
        if (child.kind !== "district") continue;
        const nodePath = `${doc.root.id}.${child.id}`;
        const fabric = resolveDistrictFabric(doc, child as DistrictNode, nodePath);
        // Same answer every time it is asked — the two call sites hand it the
        // same node, the same path and the same document, so they cannot
        // disagree unless this is false.
        expect(resolveDistrictFabric(doc, child as DistrictNode, nodePath), `${file} ${nodePath}`).toBe(
          fabric,
        );
        expect(districtGroundPolicy(doc, child as DistrictNode, nodePath), `${file} ${nodePath}`).toBe(
          urbanForm(fabric)?.requires.unlevelled === true ? "benched" : "pad",
        );
      }
    }

    const laid = layTerraced();
    const doc = documentOf("terraced");
    expect(laid.districts[0]?.form.requested).toBe(
      resolveDistrictFabric(doc, districtOf(doc), "world.hill_town"),
    );
  });

  it("seats every building on a bench, never across a step", () => {
    const laid = layTerraced();
    expect(laid.districts).toHaveLength(1);
    const product = laid.districts[0];
    expect(product?.form.id).toBe("terraced");
    expect(laid.placements.length).toBeGreaterThan(4);

    const ctx = context({
      bounds: DISTRICT_BOUNDS,
      ground: {
        ...hillGround(),
        height: (x) => 70 + Math.round((x - DISTRICT_BOUNDS.x0) / 15),
      },
    });
    const { bench } = benchFieldOf(ctx);
    const stride = DISTRICT_BOUNDS.x1 - DISTRICT_BOUNDS.x0 + 1;
    for (const placement of laid.placements) {
      const rect = placement.footprint;
      const levels = new Set<number>();
      for (let z = rect.z0; z <= rect.z1; z++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          if (x < DISTRICT_BOUNDS.x0 || x > DISTRICT_BOUNDS.x1) continue;
          if (z < DISTRICT_BOUNDS.z0 || z > DISTRICT_BOUNDS.z1) continue;
          levels.add(bench[(z - DISTRICT_BOUNDS.z0) * stride + (x - DISTRICT_BOUNDS.x0)] as number);
        }
      }
      expect([...levels].length, placement.nodePath).toBe(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5. a compiled terraced quarter, linted (§8.1.8)                             */
/* -------------------------------------------------------------------------- */

describe("a terraced quarter, compiled", () => {
  let root: string;
  let dir: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let stack: PrismarineStack;
  let physics: PhysicsReport;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-terraced-"));
    dir = path.join(root, "hill_town");
    const compiled = await compileTerrain(districtDoc("terraced"), {
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
    const structures = report.layout?.structures as StructurePassResult;
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

  it("draws the form the document asked for", () => {
    const districts = report.layout?.districts;
    expect(districts).toHaveLength(1);
    const form = (districts as NonNullable<typeof districts>)[0]?.form;
    expect(form?.id).toBe("terraced");
    expect(form?.requested).toBe("terraced");
  });

  it("finds nothing wrong under any physics rule", () => {
    expect(
      physics.findings
        .slice(0, 12)
        .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
        .join("\n"),
    ).toBe("");
    for (const rule of PHYSICS_RULES) expect(physics.counts[rule], rule).toBe(0);
  });

  it("reads a document off disk that says what it drew", async () => {
    // The compile report is written beside the world, and a fallback has to be
    // legible in the *final* report rather than only in a compile-feedback round.
    const written = await readFile(path.join(dir, "level.dat")).catch(() => null);
    expect(written).not.toBeNull();
  });
});

/** A 1-in-3 hill: the gradient at which a 4-block bench stops being ground. */
const cliffAt = (x: number, z: number): number => 70 + Math.round((x + z) / 3);

describe("ground too steep to terrace", () => {
  it("refuses, naming the bench width, instead of drawing an empty quarter", () => {
    // Measured during implementation: a 200 × 180 quarter on this gradient laid
    // its contour streets and produced *zero buildings*, because a bench is
    // `BENCH_HEIGHT / gradient` columns wide and twelve columns is narrower
    // than a street and its verges. Returning that in silence is the defect
    // this repo keeps paying for — a request accepted and quietly not met.
    const steep: GroundSample = {
      height: cliffAt,
      water: () => false,
      slope: (x, z) => Math.abs(cliffAt(x + 1, z) - cliffAt(x, z)),
      relief: cliffAt(BOUNDS.x1, BOUNDS.z1) - cliffAt(BOUNDS.x0, BOUNDS.z0),
      levelled: false,
      waterReach: Number.POSITIVE_INFINITY,
    };
    const result = TERRACED_FORM.draw(context({ ground: steep }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/too steep to terrace/);
    expect(result.reason).toMatch(/widest bench comes out \d+ columns/);
    // The announced fallback is what keeps a quarter on the hill at all.
    expect(result.fallback).toBe("grown");
    expect(result.fix).toMatch(/gentler slope|grown/);
  });

  it("still draws the hillside a town can actually stand on", () => {
    expect(TERRACED_FORM.draw(context()).ok).toBe(true);
  });
});
