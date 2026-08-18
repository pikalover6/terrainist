import { describe, expect, it } from "vitest";

import {
  HeightField,
  applyLevelPad,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams,
  type Classification,
  type Region,
} from "@terrainist/stdlib";
import type { CanonicalConstraint, PortDeclaration, Yaw } from "@terrainist/spec";

import {
  applyPadEdits,
  buildOccupancy,
  demotionOrder,
  frameNorm,
  rectGap,
  resolvePort,
  rotateFace,
  rotateLocal,
  solveLayout,
  zoneRect,
  type LayoutNodeInput,
  type LayoutRequest,
  type Placement,
} from "../src/layout/index.js";
import { forestEligibility, resolveForestParams } from "../src/terrain/vegetation.js";

const SEA_LEVEL = 63;
const REGION: Region = centeredRegion(96, 96);

/**
 * A synthetic world: flat land at `base`, with an optional water strip on the
 * west edge and an optional steep ramp on the east half.
 */
function makeWorld(options: { water?: boolean; ramp?: boolean; bumpy?: boolean } = {}): {
  field: HeightField;
  classification: Classification;
} {
  const field = new HeightField(REGION);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      let h = SEA_LEVEL + 6;
      if (options.water === true && i < REGION.width / 3) h = SEA_LEVEL - 8;
      if (options.ramp === true && i > (REGION.width * 2) / 3) {
        h = SEA_LEVEL + 6 + (i - (REGION.width * 2) / 3) * 6;
      }
      if (options.bumpy === true) h += ((i * 7 + j * 13) % 5) - 2;
      field.values[j * REGION.width + i] = h;
    }
  }
  const params = resolveHeightfieldParams({ seaLevel: SEA_LEVEL });
  return { field, classification: classify(field, params, {}) };
}

/** A hazard mask from a classification, as `compile.ts` builds it. */
function hazards(classification: Classification): Uint8Array {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  for (let k = 0; k < mask.length; k++) {
    if (classification.oceanMask[k] === 1 || classification.lakeMask[k] === 1) mask[k] = 1;
  }
  return mask;
}

function node(
  id: string,
  size: [number, number, number],
  constraints: CanonicalConstraint[] = [],
  extra: Partial<LayoutNodeInput> = {},
): LayoutNodeInput {
  return {
    id,
    nodePath: `world.${id}`,
    kind: "generator",
    generator: "building.grammar@0",
    size,
    flexible: false,
    padding: 0,
    rotations: [0, 90, 180, 270],
    constraints,
    ports: {},
    optional: false,
    tags: [],
    seed: nodeSeed(1234n, `world.${id}`, ""),
    ...extra,
  };
}

function request(nodes: LayoutNodeInput[], world = makeWorld()): LayoutRequest {
  return {
    region: REGION,
    field: world.field,
    classification: world.classification,
    seaLevel: SEA_LEVEL,
    rootPath: "world",
    nodes,
    hazardMask: hazards(world.classification),
  };
}

function placementOf(result: { placements: readonly Placement[] }, id: string): Placement {
  const p = result.placements.find((x) => x.id === id);
  if (p === undefined) throw new Error(`no placement for ${id}`);
  return p;
}

describe("solver — determinism", () => {
  it("produces byte-identical results across two runs", () => {
    const build = (): LayoutRequest =>
      request(
        [
          node("town_hall", [12, 9, 10], [{ type: "zone", zone: "center" }]),
          node("chapel", [8, 12, 8], [{ type: "distance", target: "town_hall", min: 6, max: 40 }]),
          node("barn", [10, 6, 14], [{ type: "zone", zone: "east" }]),
        ],
        makeWorld({ bumpy: true }),
      );
    const a = solveLayout(build());
    const b = solveLayout(build());
    expect(JSON.stringify(a.placements)).toBe(JSON.stringify(b.placements));
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
    expect(JSON.stringify(a.padEdits)).toBe(JSON.stringify(b.padEdits));
  });

  it("does not move a placed node when an unrelated node is added later", () => {
    const first = node("town_hall", [12, 9, 10], [{ type: "zone", zone: "center" }]);
    const alone = solveLayout({ ...request([first]), improvementRounds: 0 });
    const withOther = solveLayout({
      ...request([first, node("shed", [6, 5, 6], [{ type: "zone", zone: "southwest" }])]),
      improvementRounds: 0,
    });
    expect(placementOf(withOther, "town_hall").translation).toEqual(
      placementOf(alone, "town_hall").translation,
    );
  });
});

describe("solver — terrain fitness", () => {
  it("never places a footprint on water", () => {
    const world = makeWorld({ water: true });
    const result = solveLayout(request([node("dock_house", [10, 6, 10])], world));
    const p = placementOf(result, "dock_house");
    const mask = hazards(world.classification);
    for (let z = p.footprint.z0; z <= p.footprint.z1; z++) {
      for (let x = p.footprint.x0; x <= p.footprint.x1; x++) {
        const idx = (z - REGION.z0) * REGION.width + (x - REGION.x0);
        expect(mask[idx]).toBe(0);
      }
    }
  });

  it("refuses ground steeper than terrain_conform.maxSlope", () => {
    const world = makeWorld({ ramp: true });
    const result = solveLayout(
      request([node("hall", [10, 8, 10], [{ type: "terrain_conform", mode: "cut_fill", maxSlope: 10 }])], world),
    );
    const p = placementOf(result, "hall");
    for (let z = p.footprint.z0; z <= p.footprint.z1; z++) {
      for (let x = p.footprint.x0; x <= p.footprint.x1; x++) {
        const idx = (z - REGION.z0) * REGION.width + (x - REGION.x0);
        expect(world.classification.slopes[idx] as number).toBeLessThanOrEqual(10);
      }
    }
  });

  it("prefers flat ground: the chosen site is flatter than the region average", () => {
    const world = makeWorld({ ramp: true, bumpy: true });
    const result = solveLayout(request([node("hall", [10, 8, 10])], world));
    const p = placementOf(result, "hall");
    let siteSlope = 0;
    let columns = 0;
    for (let z = p.footprint.z0; z <= p.footprint.z1; z++) {
      for (let x = p.footprint.x0; x <= p.footprint.x1; x++) {
        siteSlope += world.classification.slopes[(z - REGION.z0) * REGION.width + (x - REGION.x0)] as number;
        columns++;
      }
    }
    let regionSlope = 0;
    for (const s of world.classification.slopes) regionSlope += s;
    expect(siteSlope / columns).toBeLessThan(regionSlope / world.classification.slopes.length);
  });
});

describe("solver — hard constraints", () => {
  it("keeps footprints from overlapping", () => {
    const result = solveLayout(
      request([node("a", [16, 8, 16]), node("b", [16, 8, 16]), node("c", [16, 8, 16])]),
    );
    const rects = result.placements.map((p) => p.footprint);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as (typeof rects)[number];
        const b = rects[j] as (typeof rects)[number];
        const overlaps = a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("honours clearance as a keep-clear margin between structures", () => {
    const clearance = 6;
    const result = solveLayout(
      request([
        node("a", [12, 8, 12], [{ type: "clearance", amount: clearance }]),
        node("b", [12, 8, 12], [{ type: "clearance", amount: clearance }]),
      ]),
    );
    const gap = rectGap(placementOf(result, "a").footprint, placementOf(result, "b").footprint);
    expect(gap).toBeGreaterThanOrEqual(clearance);
  });

  it("satisfies a hard distance range", () => {
    const result = solveLayout(
      request([
        node("well", [4, 4, 4]),
        node("inn", [10, 8, 10], [{ type: "distance", target: "well", min: 10, max: 24 }]),
      ]),
    );
    const gap = rectGap(placementOf(result, "inn").footprint, placementOf(result, "well").footprint);
    expect(gap).toBeGreaterThanOrEqual(10);
    expect(gap).toBeLessThanOrEqual(24);
  });

  it("places an adjacent_to node against its target", () => {
    const result = solveLayout(
      request([
        node("hall", [14, 8, 14]),
        node("annex", [8, 6, 8], [{ type: "adjacent_to", target: "hall", gap: [0, 1], overlap: 2 }]),
      ]),
    );
    const gap = rectGap(placementOf(result, "annex").footprint, placementOf(result, "hall").footprint);
    expect(gap).toBeLessThanOrEqual(1);
  });
});

describe("solver — coarse placement", () => {
  it("puts a zoned node inside its nine-grid cell", () => {
    const result = solveLayout(request([node("watchtower", [8, 20, 8], [{ type: "zone", zone: "north" }])]));
    const p = placementOf(result, "watchtower");
    const cell = zoneRect({ x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth }, "north");
    expect(p.anchor.x).toBeGreaterThanOrEqual(cell.x0);
    expect(p.anchor.x).toBeLessThanOrEqual(cell.x1);
    expect(p.anchor.z).toBeGreaterThanOrEqual(cell.z0);
    expect(p.anchor.z).toBeLessThanOrEqual(cell.z1);
  });

  it("has a real deadzone: a placement away from the cell centre can win", () => {
    // A bumpy world makes exactly one part of the cell flattest; with a
    // centre-measured cost the node would still snap to the middle, and every
    // world would come out gridded.
    const world = makeWorld({ bumpy: true, ramp: true });
    const result = solveLayout(request([node("granary", [10, 8, 10], [{ type: "zone", zone: "north" }])], world));
    const p = placementOf(result, "granary");
    const frame = { x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth };
    const cell = zoneRect(frame, "north");
    const centre = { x: Math.floor((cell.x0 + cell.x1) / 2), z: Math.floor((cell.z0 + cell.z1) / 2) };
    expect(p.anchor.x >= cell.x0 && p.anchor.x <= cell.x1).toBe(true);
    expect(p.anchor.z >= cell.z0 && p.anchor.z <= cell.z1).toBe(true);
    expect(p.anchor.x === centre.x && p.anchor.z === centre.z).toBe(false);
    // …and the coarse constraint still reports zero cost, because the whole
    // cell is the zero-cost region (§4.9.4).
    const report = result.report.nodes.find((n) => n.nodePath === "world.granary");
    expect(report?.coarse[0]?.cost).toBe(0);
    expect(report?.constraints[0]?.satisfied).toBe(true);
  });

  it("records the frame, the jittered target point and the mode (§4.7 obligation 7)", () => {
    const result = solveLayout(request([node("keep", [10, 20, 10], [{ type: "zone", zone: "southeast" }])]));
    const coarse = result.report.nodes[0]?.coarse[0];
    expect(coarse?.type).toBe("zone");
    expect(coarse?.mode).toBe("center");
    expect(coarse?.frame).toEqual({ x0: -48, z0: -48, x1: 47, z1: 47 });
    const cell = zoneRect({ x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth }, "southeast");
    expect(coarse?.targetRegion).toEqual(cell);
  });

  it("treats `at` with mode contain as a hard domain", () => {
    const result = solveLayout(
      request([node("shrine", [6, 8, 6], [{ type: "at", at: [0.25, 0.75], mode: "contain", radius: 12 }])]),
    );
    const p = placementOf(result, "shrine");
    const cx = REGION.x0 + Math.floor(0.25 * REGION.width);
    const cz = REGION.z0 + Math.floor(0.75 * REGION.depth);
    expect(p.footprint.x0).toBeGreaterThanOrEqual(cx - 12);
    expect(p.footprint.x1).toBeLessThanOrEqual(cx + 12);
    expect(p.footprint.z0).toBeGreaterThanOrEqual(cz - 12);
    expect(p.footprint.z1).toBeLessThanOrEqual(cz + 12);
  });
});

describe("solver — rotation and facing", () => {
  const ports: Record<string, PortDeclaration> = {
    main_door: { type: "door", face: "south", at: "center" },
  };

  it("rotates so the front faces its target", () => {
    // `well` is placed first, in the south cell; the chapel is in the north
    // cell, so its south-facing door must end up pointing south (yaw 0).
    const result = solveLayout(
      request([
        node("well", [4, 4, 4], [{ type: "zone", zone: "south", mode: "contain" }]),
        node("chapel", [8, 10, 8], [
          { type: "zone", zone: "north", mode: "contain" },
          { type: "facing", target: "well" },
        ], { ports }),
      ]),
    );
    const chapel = placementOf(result, "chapel");
    expect(rotateFace("south", chapel.yaw)).toBe("south");
    const facing = result.report.nodes
      .find((n) => n.nodePath === "world.chapel")
      ?.constraints.find((c) => c.type === "facing");
    expect(facing?.satisfied).toBe(true);
    expect(facing?.cost).toBe(0);
  });

  it("rotates the other way when the target is on the other side", () => {
    const result = solveLayout(
      request([
        node("well", [4, 4, 4], [{ type: "zone", zone: "north", mode: "contain" }]),
        node("chapel", [8, 10, 8], [
          { type: "zone", zone: "south", mode: "contain" },
          { type: "facing", target: "well" },
        ], { ports }),
      ]),
    );
    expect(rotateFace("south", placementOf(result, "chapel").yaw)).toBe("north");
  });

  it("respects a pinned rotation", () => {
    const result = solveLayout(
      request([node("shed", [6, 5, 9], [], { rotations: [90] as Yaw[] })]),
    );
    const p = placementOf(result, "shed");
    expect(p.yaw).toBe(90);
    // Yaw 90 swaps the footprint axes.
    expect(p.size).toEqual([9, 5, 6]);
  });
});

describe("solver — the relaxation ladder", () => {
  it("drops an optional node it cannot place, and says so", () => {
    const result = solveLayout(
      request([
        node("well", [4, 4, 4]),
        node("folly", [8, 8, 8], [{ type: "distance", target: "well", min: 400, max: 500 }], {
          optional: true,
        }),
      ]),
    );
    expect(result.placements.map((p) => p.id)).toEqual(["well"]);
    expect(result.report.dropped).toEqual(["world.folly"]);
    const report = result.report.nodes.find((n) => n.nodePath === "world.folly");
    expect(report?.placed).toBe(false);
    expect(report?.appliedRungs).toEqual(["node_dropped"]);
    const diag = result.diagnostics.find((d) => d.name === "NODE_DROPPED");
    expect(diag?.code).toBe("LOAM-E405");
    expect(diag?.nodePath).toBe("world.folly");
  });

  it("demotes coarse containment before anything else", () => {
    // `mode: "contain"` in a cell too small for the node: the only way out is
    // demoting the containment, which the implicit `within: "^"` still bounds.
    const result = solveLayout(
      request([node("longhouse", [40, 8, 40], [{ type: "zone", zone: "north", mode: "contain" }])]),
    );
    const report = result.report.nodes[0];
    expect(report?.appliedRungs).toContain("constraint_demoted");
    expect(report?.placed).toBe(true);
    expect(report?.constraints[0]?.declaredStrength).toBe("hard");
    expect(report?.constraints[0]?.effectiveStrength).toBe("soft");
    expect(result.diagnostics.some((d) => d.code === "LOAM-E404")).toBe(true);
  });

  it("never demotes not_overlapping", () => {
    const n = node("a", [8, 8, 8], [
      { type: "not_overlapping", target: "b" },
      { type: "distance", target: "b", min: 4 },
    ]);
    expect(demotionOrder(n, "other")).toEqual([1]);
  });

  it("demotes an unreachable hard distance rather than failing", () => {
    const result = solveLayout(
      request([
        node("well", [4, 4, 4]),
        node("outpost", [8, 8, 8], [{ type: "distance", target: "well", min: 4000, max: 5000 }]),
      ]),
    );
    expect(result.placements).toHaveLength(2);
    const report = result.report.nodes.find((n) => n.nodePath === "world.outpost");
    expect(report?.appliedRungs).toContain("constraint_demoted");
    expect(report?.constraints[0]?.effectiveStrength).toBe("soft");
    expect(report?.constraints[0]?.satisfied).toBe(false);
    expect(report?.constraints[0]?.cost).toBeGreaterThan(0);
  });

  it("always terminates with a placement, even when nothing can satisfy the ground", () => {
    // A footprint larger than the whole region: no candidate fits, and no
    // constraint demotion can help. v0.2 rung 7 would fail the compile; this
    // solver reports and places the least-bad candidate instead.
    const result = solveLayout(request([node("colossus", [200, 8, 200])]));
    expect(result.placements).toHaveLength(1);
    const report = result.report.nodes[0];
    expect(report?.appliedRungs).toContain("unsatisfiable");
    const diag = result.diagnostics.find((d) => d.code === "LOAM-E406");
    expect(diag?.name).toBe("UNSATISFIABLE");
    expect(diag?.nodePath).toBe("world.colossus");
  });

  it("reports absorbed when nothing had to be relaxed", () => {
    const result = solveLayout(request([node("hall", [10, 8, 10], [{ type: "zone", zone: "center" }])]));
    expect(result.report.nodes[0]?.appliedRungs).toEqual(["absorbed"]);
  });
});

describe("solver — the report", () => {
  it("accounts for every node with per-constraint strength and cost", () => {
    const result = solveLayout(
      request([
        node("well", [4, 4, 4]),
        node("inn", [10, 8, 10], [
          { type: "distance", target: "well", min: 6 },
          { type: "facing", target: "well" },
          { type: "within", target: "root" },
        ], { ports: { door: { type: "door", face: "south" } } }),
      ]),
    );
    expect(result.report.nodes).toHaveLength(2);
    const inn = result.report.nodes.find((n) => n.nodePath === "world.inn");
    expect(inn?.constraints.map((c) => c.type)).toEqual(["distance", "facing", "within"]);
    expect(inn?.constraints[0]?.declaredStrength).toBe("hard");
    expect(inn?.constraints[1]?.declaredStrength).toBe("soft");
    expect(inn?.constraints[1]?.weight).toBe(2);
    // `within` parses but is not implemented — the report says so rather than
    // pretending it was satisfied.
    expect(inn?.constraints[2]?.effectiveStrength).toBe("ignored");
    expect(inn?.score.total).toBeGreaterThanOrEqual(0);
    expect(inn?.candidatesConsidered).toBeGreaterThan(0);
    expect(inn?.translation).toBeDefined();
    expect(inn?.yaw).toBeDefined();
  });
});

describe("pad edits", () => {
  it("levels the field under a footprint and blends the apron", () => {
    const world = makeWorld({ bumpy: true });
    const result = solveLayout(request([node("hall", [12, 8, 12])], world));
    const pad = result.padEdits[0];
    expect(pad).toBeDefined();
    const before = Float64Array.from(world.field.values);
    applyPadEdits(world.field, result.padEdits);

    const p = placementOf(result, "hall");
    for (let z = p.footprint.z0; z <= p.footprint.z1; z++) {
      for (let x = p.footprint.x0; x <= p.footprint.x1; x++) {
        expect(world.field.at(x, z)).toBe(p.foundationY);
      }
    }
    // The apron moved, but less than the footprint did, and beyond it nothing
    // changed at all.
    const far = (p.footprint.x1 + (pad?.apron ?? 0) + 6) as number;
    if (far < REGION.x0 + REGION.width) {
      const idx = (p.footprint.z0 - REGION.z0) * REGION.width + (far - REGION.x0);
      expect(world.field.values[idx]).toBe(before[idx]);
    }
  });

  it("emits no pad for a terrain_conform mode that does not level", () => {
    const result = solveLayout(
      request([node("bridge_house", [8, 6, 8], [{ type: "terrain_conform", mode: "stilts" }])]),
    );
    expect(result.padEdits).toEqual([]);
  });

  it("uses the requested reference statistic for the foundation", () => {
    const world = makeWorld({ bumpy: true });
    const max = solveLayout(
      request([node("hall", [12, 8, 12], [{ type: "terrain_conform", mode: "flatten", reference: "max" }])], world),
    );
    const p = placementOf(max, "hall");
    let observed = -Infinity;
    for (let z = p.footprint.z0; z <= p.footprint.z1; z++) {
      for (let x = p.footprint.x0; x <= p.footprint.x1; x++) observed = Math.max(observed, world.field.at(x, z));
    }
    expect(p.foundationY).toBe(Math.round(observed));
  });

  it("applyLevelPad is a pure level-to kernel", () => {
    const field = new HeightField(centeredRegion(32, 32));
    field.values.fill(70);
    applyLevelPad(field, { x0: -4, z0: -4, x1: 4, z1: 4, targetY: 64, apron: 4 });
    expect(field.at(0, 0)).toBe(64);
    expect(field.at(4, 4)).toBe(64);
    expect(field.at(12, 12)).toBe(70);
    const apron = field.at(6, 0);
    expect(apron).toBeGreaterThan(64);
    expect(apron).toBeLessThan(70);
  });
});

describe("occupancy", () => {
  it("marks the footprint plus its clearance", () => {
    const result = solveLayout(request([node("hall", [10, 8, 10], [{ type: "clearance", amount: 3 }])]));
    const p = placementOf(result, "hall");
    const at = (x: number, z: number): number =>
      result.occupancy.mask[(z - REGION.z0) * REGION.width + (x - REGION.x0)] as number;
    expect(at(p.anchor.x, p.anchor.z)).toBe(1);
    expect(at(p.footprint.x1 + 3, p.anchor.z)).toBe(1);
    expect(at(p.footprint.x1 + 8, p.anchor.z)).toBe(0);
  });

  it("indexes by tag as well as in the union mask", () => {
    const placed = new Map<string, Placement>([
      [
        "hall",
        {
          nodePath: "world.hall", id: "hall", translation: [0, 64, 0], yaw: 0, mirror: false,
          size: [4, 4, 4], footprint: { x0: 0, z0: 0, x1: 3, z1: 3 }, anchor: { x: 1, z: 1 }, foundationY: 64,
        },
      ],
    ]);
    const grid = buildOccupancy(REGION, [node("hall", [4, 4, 4], [], { tags: ["civic"] })], placed);
    const idx = (0 - REGION.z0) * REGION.width + (0 - REGION.x0);
    expect(grid.mask[idx]).toBe(1);
    expect(grid.byTag.get("civic")?.[idx]).toBe(1);
    expect(grid.byTag.get("structure")?.[idx]).toBe(1);
    expect(grid.byTag.has("market")).toBe(false);
  });

  it("excludes trees from occupied columns", () => {
    const world = makeWorld();
    const result = solveLayout(request([node("hall", [16, 8, 16], [{ type: "clearance", amount: 2 }])], world));
    const plan = {
      region: REGION,
      ground: Int32Array.from(world.field.values, (v) => Math.round(v)),
      fluidKind: new Uint8Array(REGION.width * REGION.depth),
      seaLevel: SEA_LEVEL,
    } as unknown as Parameters<typeof forestEligibility>[0];
    const params = resolveForestParams({ species: [{ id: "oak", shape: "oak_round" }] });

    const open = forestEligibility(plan, world.classification, params);
    const guarded = forestEligibility(plan, world.classification, params, result.occupancy);

    const p = placementOf(result, "hall");
    const idx = (p.anchor.z - REGION.z0) * REGION.width + (p.anchor.x - REGION.x0);
    expect(open[idx]).toBe(1);
    expect(guarded[idx]).toBe(0);

    let openCount = 0;
    let guardedCount = 0;
    for (let k = 0; k < open.length; k++) {
      openCount += open[k] as number;
      guardedCount += guarded[k] as number;
    }
    expect(guardedCount).toBeLessThan(openCount);
  });

  it("excludes a tagged slice through avoidTags", () => {
    const world = makeWorld();
    const result = solveLayout(
      request([node("market", [16, 4, 16], [], { tags: ["market"] })], world),
    );
    const plan = {
      region: REGION,
      ground: Int32Array.from(world.field.values, (v) => Math.round(v)),
      fluidKind: new Uint8Array(REGION.width * REGION.depth),
      seaLevel: SEA_LEVEL,
    } as unknown as Parameters<typeof forestEligibility>[0];
    const params = resolveForestParams({ species: [{ id: "oak", shape: "oak_round" }], avoidTags: ["market"] });
    const mask = forestEligibility(plan, world.classification, params, result.occupancy, ["market"]);
    const p = placementOf(result, "market");
    expect(mask[(p.anchor.z - REGION.z0) * REGION.width + (p.anchor.x - REGION.x0)]).toBe(0);
  });
});

describe("port geometry", () => {
  const placementAt = (yaw: Yaw, size: [number, number, number]): Placement => {
    const rotated: [number, number, number] = yaw === 90 || yaw === 270 ? [size[2], size[1], size[0]] : size;
    return {
      nodePath: "world.hall",
      id: "hall",
      translation: [100, 70, 200],
      yaw,
      mirror: false,
      size: rotated,
      footprint: { x0: 100, z0: 200, x1: 100 + rotated[0] - 1, z1: 200 + rotated[2] - 1 },
      anchor: { x: 100, z: 200 },
      foundationY: 70,
    };
  };

  const door: PortDeclaration = { type: "door", face: "south", at: "center" };

  it("resolves a south door on every yaw, always on the matching world edge", () => {
    const size: [number, number, number] = [7, 5, 11];
    const expected: Record<Yaw, { face: string; normal: readonly number[] }> = {
      0: { face: "south", normal: [0, 0, 1] },
      90: { face: "west", normal: [-1, 0, 0] },
      180: { face: "north", normal: [0, 0, -1] },
      270: { face: "east", normal: [1, 0, 0] },
    };
    for (const yaw of [0, 90, 180, 270] as Yaw[]) {
      const placement = placementAt(yaw, size);
      const port = resolvePort(placement, size, "main_door", door);
      expect(port).not.toBeNull();
      expect(port?.face).toBe(expected[yaw].face);
      expect(port?.outwardNormal).toEqual(expected[yaw].normal);
      const [px, , pz] = port?.position as [number, number, number];
      // The opening sits on the footprint edge its normal points out of.
      const f = placement.footprint;
      if (port?.face === "south") expect(pz).toBe(f.z1);
      if (port?.face === "north") expect(pz).toBe(f.z0);
      if (port?.face === "east") expect(px).toBe(f.x1);
      if (port?.face === "west") expect(px).toBe(f.x0);
      expect(px).toBeGreaterThanOrEqual(f.x0);
      expect(px).toBeLessThanOrEqual(f.x1);
      expect(pz).toBeGreaterThanOrEqual(f.z0);
      expect(pz).toBeLessThanOrEqual(f.z1);
      expect(port?.floorY).toBe(70);
    }
  });

  it("keeps an off-centre port off-centre under rotation", () => {
    const size: [number, number, number] = [9, 5, 5];
    const port = { type: "road_stub", face: "north", at: [0, 0] } as PortDeclaration;
    const straight = resolvePort(placementAt(0, size), size, "stub", port);
    const turned = resolvePort(placementAt(90, size), size, "stub", port);
    // Local (0, 0) is the node's own corner either way, so both land on the
    // footprint's rotated image of that corner — not on the same world corner.
    expect(straight?.position).toEqual([100, 70, 200]);
    expect(turned?.position).toEqual([104, 70, 200]);
  });

  it("returns no position for a vertical port", () => {
    const size: [number, number, number] = [5, 5, 5];
    expect(resolvePort(placementAt(0, size), size, "shaft", { type: "shaft", face: "down" })).toBeNull();
  });

  it("rotates faces one step per 90°", () => {
    expect(rotateFace("north", 90)).toBe("east");
    expect(rotateFace("east", 90)).toBe("south");
    expect(rotateFace("west", 180)).toBe("east");
    expect(rotateFace("north", 270)).toBe("west");
  });

  it("rotates local columns as §4.3 specifies", () => {
    // (x, z) in a box (X, Z) maps to (Z−1−z, x) under yaw 90.
    expect(rotateLocal(0, 0, 4, 6, 90)).toEqual({ x: 5, z: 0 });
    expect(rotateLocal(3, 5, 4, 6, 180)).toEqual({ x: 0, z: 0 });
    expect(rotateLocal(0, 0, 4, 6, 270)).toEqual({ x: 0, z: 3 });
  });

  it("exposes resolved ports on the solve result for the road router", () => {
    const result = solveLayout(
      request([node("hall", [10, 8, 10], [], { ports: { main_door: door, north_road: { type: "road_stub", face: "north" } } })]),
    );
    expect(result.ports.map((p) => p.ref).sort()).toEqual(["world.hall#main_door", "world.hall#north_road"]);
    for (const port of result.ports) {
      expect(port.nodePath).toBe("world.hall");
      expect(Math.abs(port.outwardNormal[0]) + Math.abs(port.outwardNormal[2])).toBe(1);
    }
  });
});

describe("frames", () => {
  it("tiles the nine-grid exactly, with no gaps and no overlap", () => {
    const frame = { x0: 0, z0: 0, width: 100, depth: 100 };
    const tokens = ["northwest", "north", "northeast", "west", "center", "east", "southwest", "south", "southeast"] as const;
    const covered = new Set<string>();
    for (const token of tokens) {
      const r = zoneRect(frame, token);
      for (let z = r.z0; z <= r.z1; z++) {
        for (let x = r.x0; x <= r.x1; x++) {
          const key = `${x},${z}`;
          expect(covered.has(key)).toBe(false);
          covered.add(key);
        }
      }
    }
    expect(covered.size).toBe(100 * 100);
  });

  it("frameNorm is the half-diagonal", () => {
    expect(frameNorm({ x0: 0, z0: 0, width: 6, depth: 8 })).toBe(5);
  });
});

/**
 * F22: a district is *ground*, not a building pad.
 *
 * The exemption `kind: "city"` had — the ground vetoes measured over a
 * landscape-sized footprint rather than a cottage-sized one — was never given
 * to `kind: "district"`, so a single wet or cliffed column out of a hundred
 * thousand vetoed every candidate and the quarter fell to the least-violating
 * position with an `UNSATISFIABLE` warning naming constraints that were
 * innocent.
 */
describe("solver — district ground semantics", () => {
  /**
   * Flat dry land with one gentle hollow whose floor is below sea level — the
   * shape of the district that shipped from `hillkeep`: dry everywhere it is
   * built, rejected on one low column.
   */
  function worldWithOneHollow(): { field: HeightField; classification: Classification } {
    const world = makeWorld();
    const cx = REGION.width >> 1;
    const cz = REGION.depth >> 1;
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) {
        const r = Math.hypot(i - cx, j - cz);
        if (r >= 20) continue;
        const k = j * REGION.width + i;
        // 12 blocks over 20 columns: ~31°, inside the building slope limit, so
        // the only thing wrong with this ground is that it dips under water.
        world.field.values[k] = SEA_LEVEL + 6 - Math.round((20 - r) * 0.6);
      }
    }
    const params = resolveHeightfieldParams({ seaLevel: SEA_LEVEL });
    return { field: world.field, classification: classify(world.field, params, {}) };
  }

  /** Uniformly steep ground: every slope is past 35°, none past 82°. */
  function steepWorld(): { field: HeightField; classification: Classification } {
    const field = new HeightField(REGION);
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) {
        field.values[j * REGION.width + i] = SEA_LEVEL + 6 + i * 2;
      }
    }
    const params = resolveHeightfieldParams({ seaLevel: SEA_LEVEL });
    return { field, classification: classify(field, params, {}) };
  }

  it("places a district over one column below sea level", () => {
    const world = worldWithOneHollow();
    const district = node("quarter", [60, 1, 60], [], { kind: "district", generator: undefined });
    const result = solveLayout(request([district], world));
    expect(result.report.nodes[0]?.appliedRungs).toEqual(["absorbed"]);
    expect(result.diagnostics.find((d) => d.code === "LOAM-E406")).toBeUndefined();
  });

  it("still vetoes a building pad over that same hollow", () => {
    // The counterpart: the extremum veto is right for a cottage, and stays.
    const world = worldWithOneHollow();
    const result = solveLayout(
      request([node("hall", [92, 8, 92])], world),
    );
    expect(result.report.nodes[0]?.appliedRungs).toContain("unsatisfiable");
  });

  it("places a district on ground steeper than a building tolerates", () => {
    const world = steepWorld();
    const district = node("upper_quarter", [60, 1, 60], [], { kind: "district", generator: undefined });
    const result = solveLayout(request([district], world));
    expect(result.report.nodes[0]?.appliedRungs).toEqual(["absorbed"]);
    const pad = solveLayout(request([node("hall", [60, 8, 60])], world));
    expect(pad.report.nodes[0]?.appliedRungs).toContain("unsatisfiable");
  });

  it("honours an authored maxSlope over the district default", () => {
    const world = steepWorld();
    const district = node(
      "strict_quarter",
      [60, 1, 60],
      [{ type: "terrain_conform", mode: "cut_fill", maxSlope: 20 } as unknown as CanonicalConstraint],
      { kind: "district", generator: undefined },
    );
    const result = solveLayout(request([district], world));
    expect(result.report.nodes[0]?.appliedRungs).toContain("unsatisfiable");
  });
});

describe("solver — diagnostics tell the truth", () => {
  it("E406 carries the ground's veto histogram, not a constraint story", () => {
    const world = makeWorld({ water: true });
    // A pad wider than the dry third of the map: every candidate reaches the sea.
    const result = solveLayout(request([node("wharf_hall", [80, 8, 80])], world));
    const diag = result.diagnostics.find((d) => d.code === "LOAM-E406");
    expect(diag?.message).toContain("could stand on the ground");
    expect(diag?.message).toContain("No constraint on this node was violated");
    expect(diag?.message).toMatch(/\d+ (sat below sea level|touched water or lava|were too steep|left the region)/);
    expect(diag?.fix).toContain("this is the ground, not your constraints");
    const report = result.report.nodes[0];
    const veto = report?.terrainVeto;
    expect(veto).toBeDefined();
    expect(veto?.feasible).toBe(0);
    const total =
      (veto?.underwater ?? 0) +
      (veto?.hazard ?? 0) +
      (veto?.too_steep ?? 0) +
      (veto?.out_of_region ?? 0);
    expect(total).toBe(report?.candidatesConsidered);
  });

  it("the E404 fix-hint says widen before it says soften", () => {
    const result = solveLayout(
      request([
        node("well", [4, 4, 4]),
        node("outpost", [8, 8, 8], [{ type: "distance", target: "well", min: 4000, max: 5000 }]),
      ]),
    );
    const diag = result.diagnostics.find((d) => d.code === "LOAM-E404");
    const fix = diag?.fix ?? "";
    expect(fix).toContain("widen what it asks for first");
    expect(fix.indexOf("widen what it asks for first")).toBeLessThan(fix.indexOf('"strength": "soft"'));
    // …and never soften what the prompt itself named.
    expect(fix).toContain("do not soften it");
  });
});

/**
 * `LOAM-W523` — a constraint whose target resolves to nothing.
 *
 * The Troy defect: a horse told to stand 14..42 blocks from `priams_megaron`,
 * which is a *district child* the root solver has never heard of. The
 * "nothing placed yet" branch swallowed it and the report said `satisfied`.
 */
describe("solver — unresolvable constraint targets (LOAM-W523)", () => {
  const w523 = (result: { diagnostics: readonly { code: string; nodePath: string; message: string }[] }) =>
    result.diagnostics.filter((d) => d.code === "LOAM-W523");

  it("names a target no node in the solve carries", () => {
    const result = solveLayout(
      request([
        node("town_hall", [12, 9, 10], [{ type: "zone", zone: "center" }]),
        node(
          "trojan_horse",
          [8, 8, 8],
          [{ type: "distance", target: "priams_megaron", min: 14, max: 42, strength: "hard" }],
        ),
      ]),
    );
    const fired = w523(result);
    expect(fired).toHaveLength(1);
    expect(fired[0]?.nodePath).toBe("world.trojan_horse");
    expect(fired[0]?.message).toContain("priams_megaron");
    expect(fired[0]?.message).toContain("distance");
    // And the report stops calling it satisfied.
    const report = result.report.nodes.find((n) => n.nodePath === "world.trojan_horse");
    const constraint = report?.constraints[0];
    expect(constraint?.satisfied).toBe(false);
    expect(constraint?.targetUnresolved).toBe(true);
  });

  it("says it once, however many candidates were costed", () => {
    const result = solveLayout(
      request([
        node("shed", [6, 5, 6], [{ type: "distance", target: "nowhere", min: 4, max: 20 }]),
      ]),
    );
    expect(w523(result)).toHaveLength(1);
  });

  it("stays silent for a target that is merely placed later", () => {
    const result = solveLayout(
      request([
        // `chapel` is costed before `town_hall` exists — the legitimate
        // mid-solve state, and not a thing to warn about.
        node("chapel", [8, 12, 8], [{ type: "distance", target: "town_hall", min: 6, max: 40 }]),
        node("town_hall", [12, 9, 10], [{ type: "zone", zone: "center" }]),
      ]),
    );
    expect(w523(result)).toHaveLength(0);
    const report = result.report.nodes.find((n) => n.nodePath === "world.chapel");
    expect(report?.constraints[0]?.targetUnresolved).toBeUndefined();
  });

  it("stays silent for `self` and for the namespaces §4.2 does not resolve", () => {
    const result = solveLayout(
      request([
        node("shed", [6, 5, 6], [
          { type: "distance", target: "self", min: 0, max: 4 },
          { type: "facing", target: "@world:north" },
        ]),
      ]),
    );
    expect(w523(result)).toHaveLength(0);
  });

  it("fires for a `#tag:` selector no node wears, and not for one they do", () => {
    const withTag = solveLayout(
      request([
        node("house", [8, 6, 8], [], { tags: ["house"] }),
        node("well", [3, 3, 3], [{ type: "distance", target: "#tag:house", min: 2, max: 30 }]),
      ]),
    );
    expect(w523(withTag)).toHaveLength(0);

    const withoutTag = solveLayout(
      request([
        node("house", [8, 6, 8], [], { tags: ["cottage"] }),
        node("well", [3, 3, 3], [{ type: "distance", target: "#tag:house", min: 2, max: 30 }]),
      ]),
    );
    expect(w523(withoutTag)).toHaveLength(1);
  });

  it("changes no placement", () => {
    const nodes = (): LayoutNodeInput[] => [
      node("town_hall", [12, 9, 10], [{ type: "zone", zone: "center" }]),
      node(
        "horse",
        [8, 8, 8],
        [{ type: "distance", target: "priams_megaron", min: 14, max: 42, strength: "hard" }],
      ),
    ];
    const bound = solveLayout(request(nodes()));
    // The same document with the dead constraint deleted places identically:
    // the warning is a report, not a cost.
    const without = solveLayout(
      request([
        node("town_hall", [12, 9, 10], [{ type: "zone", zone: "center" }]),
        node("horse", [8, 8, 8], []),
      ]),
    );
    expect(JSON.stringify(bound.placements)).toBe(JSON.stringify(without.placements));
  });
});
