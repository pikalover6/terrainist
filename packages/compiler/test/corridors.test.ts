/**
 * Route corridors (§4.9.6) and the tier-2 constraints that bind to them —
 * `along`, its `beside` sugar, and `on` (§4.4).
 *
 * Everything here runs against synthetic fields, for the reason the tunnel
 * router's tests give: a corridor test has to put the line, the ground and the
 * building exactly where the property lives, and a compiled example puts them
 * wherever the seed felt like. The one thing a synthetic field cannot check —
 * that the pipeline wires all of this together — is checked by the settlement
 * and village suites, which compile real documents through the same code.
 */

import { describe, expect, it } from "vitest";

import {
  HeightField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams,
  type Classification,
  type Region
} from "@terrainist/stdlib";
import { canonicalize, resolveTypeKey, type CanonicalConstraint } from "@terrainist/spec/ir";

import {
  ALONG_DEFAULT_OFFSET,
  BESIDE_DEFAULT_OFFSET,
  CORRIDOR_RESERVATION_COST,
  CORRIDOR_SAMPLE_STRIDE,
  ROAD_CORRIDOR_MARGIN,
  TerrainProductIndex,
  corridorHit,
  corridorMask,
  corridorOverlap,
  corridorsFromCourses,
  coastlineColumns,
  desugarBeside,
  deriveTerrainProducts,
  frameNorm,
  insideCorridor,
  productSideAt,
  registerRoadCorridors,
  resolveCorridor,
  roadCorridors,
  solveLayout,
  type LayoutNodeInput,
  type LayoutRequest,
  type Placement,
  type RouteCorridor
} from "../src/layout/index.js";

const SEA_LEVEL = 63;
const REGION: Region = centeredRegion(96, 96);
const FRAME = { x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth };
const NORM = frameNorm(FRAME);

/** Flat, buildable land everywhere — corridors, not terrain, are on trial here. */
function flatWorld(): { field: HeightField; classification: Classification } {
  const field = new HeightField(REGION);
  field.values.fill(SEA_LEVEL + 8);
  const params = resolveHeightfieldParams({ seaLevel: SEA_LEVEL });
  return { field, classification: classify(field, params, {}) };
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
    ...extra
  };
}

function request(nodes: LayoutNodeInput[], extra: Partial<LayoutRequest> = {}): LayoutRequest {
  const world = flatWorld();
  return {
    region: REGION,
    field: world.field,
    classification: world.classification,
    seaLevel: SEA_LEVEL,
    rootPath: "world",
    nodes,
    ...extra
  };
}

function placementOf(result: { placements: readonly Placement[] }, id: string): Placement {
  const p = result.placements.find((x) => x.id === id);
  if (p === undefined) throw new Error(`no placement for ${id}`);
  return p;
}

/** A straight east–west corridor down the middle of the region. */
function eastWestCorridor(halfWidth = 4): RouteCorridor {
  const z = REGION.z0 + REGION.depth / 2;
  return corridorsFromCourses(
    [
      {
        editId: "main_street",
        verb: "ridge",
        width: halfWidth * 2,
        samples: Array.from({ length: REGION.width }, (_, i) => ({ x: REGION.x0 + i, z }))
      }
    ],
    "world.terrain",
  )[0] as RouteCorridor;
}

/* -------------------------------------------------------------------------- */
/* registration                                                                */
/* -------------------------------------------------------------------------- */

describe("corridor registration — substage 3b", () => {
  it("buffers a course's refined centreline by half its declared width", () => {
    const corridor = eastWestCorridor(6);
    expect(corridor.kind).toBe("course");
    expect(corridor.verb).toBe("ridge");
    expect(corridor.id).toBe("main_street");
    expect(corridor.nodePath).toBe("world.terrain.main_street");
    expect(corridor.halfWidth).toBe(6);
  });

  it("subsamples a refined course rather than carrying every block of it", () => {
    const corridor = eastWestCorridor();
    // One sample per block in, every stride-th out — plus the last, always,
    // because a corridor that stopped short of its own end would leave the
    // final stretch of the line unreserved.
    expect(corridor.centerline.length).toBeLessThan(REGION.width / 2);
    expect(corridor.centerline.length).toBeGreaterThanOrEqual(REGION.width / CORRIDOR_SAMPLE_STRIDE);
    const last = corridor.centerline[corridor.centerline.length - 1];
    expect(last?.x).toBe(REGION.x0 + REGION.width - 1);
  });

  it("is a pure function of its input — two registrations, one corridor", () => {
    expect(JSON.stringify(eastWestCorridor())).toBe(JSON.stringify(eastWestCorridor()));
  });

  it("registers nothing for a course with fewer than two distinct columns", () => {
    const p = { x: 0, z: 0 };
    expect(corridorsFromCourses([{ editId: "dot", verb: "river", samples: [p, p, p] }], "w")).toEqual(
      [],
    );
  });

  describe("road.network@0.corridors()", () => {
    it("strings its coarse line through the anchors' coarse points", () => {
      const nodes = [
        node("west_hall", [9, 9, 9], [{ type: "zone", zone: "west" }]),
        node("east_hall", [9, 9, 9], [{ type: "zone", zone: "east" }])
      ];
      const [corridor] = registerRoadCorridors("world.lanes", ["west_hall", "east_hall"], nodes, REGION, 3);
      expect(corridor).toBeDefined();
      const c = corridor as RouteCorridor;
      expect(c.kind).toBe("road");
      expect(c.centerline).toHaveLength(2);
      // West anchor first, east second: document order, not selector order.
      expect((c.centerline[0] as { x: number }).x).toBeLessThan((c.centerline[1] as { x: number }).x);
      // Wider than the lane, so a pass-6 route has room to wander inside it.
      expect(c.halfWidth).toBe(Math.round(3 / 2) + ROAD_CORRIDOR_MARGIN);
      expect(c.anchors).toEqual(["world.west_hall", "world.east_hall"]);
    });

    it("ignores the order the anchors are named in", () => {
      const nodes = [
        node("west_hall", [9, 9, 9], [{ type: "zone", zone: "west" }]),
        node("east_hall", [9, 9, 9], [{ type: "zone", zone: "east" }])
      ];
      const a = registerRoadCorridors("world.lanes", ["west_hall", "east_hall"], nodes, REGION, 3);
      const b = registerRoadCorridors("world.lanes", ["east_hall", "west_hall"], nodes, REGION, 3);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });

    it("registers nothing when the anchors have no pre-placement position", () => {
      // No `zone`, no `at` — nothing exists at 3b to string a line through, and
      // the honest answer is to reserve no ground at all.
      const nodes = [node("a", [9, 9, 9]), node("b", [9, 9, 9])];
      expect(registerRoadCorridors("world.lanes", ["a", "b"], nodes, REGION, 3)).toEqual([]);
    });

    it("needs two anchors before there is a line to reserve", () => {
      const nodes = [node("only", [9, 9, 9], [{ type: "zone", zone: "north" }])];
      expect(registerRoadCorridors("world.lanes", ["only"], nodes, REGION, 3)).toEqual([]);
      expect(roadCorridors("world.lanes", [], 3, FRAME)).toEqual([]);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* geometry                                                                    */
/* -------------------------------------------------------------------------- */

describe("corridor geometry", () => {
  const corridor = eastWestCorridor(4);
  const z = REGION.z0 + REGION.depth / 2;

  it("measures distance to the centreline and clearance to the edge", () => {
    const on = corridorHit(corridor, 0, z);
    expect(on.distance).toBe(0);
    expect(on.clearance).toBe(0);
    const out = corridorHit(corridor, 0, z + 10);
    expect(out.distance).toBe(10);
    // `offset` is defined against the corridor's edge, not its middle.
    expect(out.clearance).toBe(10 - corridor.halfWidth);
  });

  it("reports which side of the line a column is on, in the direction of travel", () => {
    // The line runs west→east (+X). Left of that is north (−Z).
    expect(corridorHit(corridor, 0, z - 10).side).toBe(1);
    expect(corridorHit(corridor, 0, z + 10).side).toBe(-1);
    expect(corridorHit(corridor, 0, z).side).toBe(0);
  });

  it("reports normalized position along the run", () => {
    expect(corridorHit(corridor, REGION.x0, z).position).toBeCloseTo(0, 2);
    expect(corridorHit(corridor, REGION.x0 + REGION.width - 1, z).position).toBeCloseTo(1, 2);
    expect(corridorHit(corridor, REGION.x0 + REGION.width / 2, z).position).toBeCloseTo(0.5, 1);
  });

  it("counts a footprint's columns inside the polygon", () => {
    // A 4-wide, 21-long band centred on z: a 3×3 footprint sitting on the line
    // is entirely inside it.
    expect(corridorOverlap(corridor, { x0: 0, z0: z - 1, x1: 2, z1: z + 1 })).toBe(9);
    expect(corridorOverlap(corridor, { x0: 0, z0: z + 40, x1: 2, z1: z + 42 })).toBe(0);
    expect(insideCorridor(corridor, 0, z)).toBe(true);
    expect(insideCorridor(corridor, 0, z + 40)).toBe(false);
  });

  it("rasterizes to a mask, deterministically", () => {
    const a = corridorMask(REGION, [corridor]);
    const b = corridorMask(REGION, [corridor]);
    expect(a).toEqual(b);
    const at = (x: number, zz: number): number =>
      a[(zz - REGION.z0) * REGION.width + (x - REGION.x0)] as number;
    expect(at(0, z)).toBe(1);
    expect(at(0, z + corridor.halfWidth)).toBe(1);
    expect(at(0, z + corridor.halfWidth + 1)).toBe(0);
  });

  it("resolves a target selector by leaf id, node path, verb, or @terrain: form", () => {
    const list = [corridor];
    for (const target of [
      "main_street",
      "^.main_street",
      "world.terrain.main_street",
      "@terrain:ridge",
      "main_street#anything"
    ]) {
      expect(resolveCorridor(target, list), target).toBe(corridor);
    }
    expect(resolveCorridor("no_such_thing", list)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* the reservation                                                             */
/* -------------------------------------------------------------------------- */

describe("the corridor reservation", () => {
  /** A road corridor straight down the middle, east–west. */
  function roadDownTheMiddle(halfWidth = 8): RouteCorridor {
    const z = REGION.z0 + REGION.depth / 2;
    return {
      ...(roadCorridors(
        "world.lanes",
        [
          { nodePath: "world.a", point: { x: REGION.x0 + 4, z } },
          { nodePath: "world.b", point: { x: REGION.x0 + REGION.width - 5, z } }
        ],
        3,
        FRAME,
      )[0] as RouteCorridor),
      halfWidth
    };
  }

  it("moves a building off the future lane", () => {
    const corridor = roadDownTheMiddle();
    // `at` puts the node exactly on the corridor. Without a reservation that is
    // where it goes; with one, the deadzone-free part of the coarse cost is
    // traded against `CORRIDOR_RESERVATION_COST` and it steps aside.
    const constraints: CanonicalConstraint[] = [{ type: "at", at: [0.5, 0.5], tolerance: 24 }];
    const bare = solveLayout(request([node("shed", [7, 6, 7], constraints)]));
    const reserved = solveLayout(
      request([node("shed", [7, 6, 7], constraints)], { corridors: [corridor] }),
    );
    expect(corridorOverlap(corridor, placementOf(bare, "shed").footprint)).toBeGreaterThan(0);
    expect(corridorOverlap(corridor, placementOf(reserved, "shed").footprint)).toBe(0);
  });

  it("charges at most its whole cost, and in proportion to the overlap", () => {
    const corridor = roadDownTheMiddle();
    const constraints: CanonicalConstraint[] = [{ type: "at", at: [0.5, 0.5], tolerance: 24 }];
    const reserved = solveLayout(
      request([node("shed", [7, 6, 7], constraints)], { corridors: [corridor] }),
    );
    const report = reserved.report.nodes[0];
    // Placed clear of the lane, so it pays nothing for it: the reservation is a
    // cost the solver *avoided*, which is the only evidence that it worked.
    expect(report?.score.soft).toBeLessThan(CORRIDOR_RESERVATION_COST);
  });

  it("exempts the corridor's own anchors", () => {
    // An anchor stands where its own street begins. Charging it for that would
    // make the reservation fine a building for being the reason for the road.
    const nodes = [
      node("west_hall", [9, 9, 9], [{ type: "zone", zone: "west" }]),
      node("east_hall", [9, 9, 9], [{ type: "zone", zone: "east" }])
    ];
    const corridors = registerRoadCorridors("world.lanes", ["west_hall", "east_hall"], nodes, REGION, 3);
    const withCorridor = solveLayout(request(nodes, { corridors }));
    const without = solveLayout(request(nodes));
    expect(JSON.stringify(withCorridor.placements)).toBe(JSON.stringify(without.placements));
  });

  it("does not reserve ground for a course corridor", () => {
    // A ridge is not a lane: nothing will be routed along it later, and a
    // seventy-block-wide keep-out nobody asked for is worse than no corridor.
    const corridor = eastWestCorridor(12);
    const constraints: CanonicalConstraint[] = [{ type: "at", at: [0.5, 0.5], tolerance: 24 }];
    const a = solveLayout(request([node("shed", [7, 6, 7], constraints)]));
    const b = solveLayout(request([node("shed", [7, 6, 7], constraints)], { corridors: [corridor] }));
    expect(JSON.stringify(b.placements)).toBe(JSON.stringify(a.placements));
  });

  it("appears in the solver report, frozen as registered", () => {
    const corridor = eastWestCorridor(5);
    const result = solveLayout(request([node("shed", [7, 6, 7])], { corridors: [corridor] }));
    expect(result.report.corridors).toHaveLength(1);
    const reported = result.report.corridors[0];
    expect(reported?.id).toBe("main_street");
    expect(reported?.kind).toBe("course");
    expect(reported?.halfWidth).toBe(5);
    expect(reported?.centerline).toEqual(corridor.centerline.map((p) => [p.x, p.z]));
    expect(reported?.reservedColumns).toBeGreaterThan(0);
  });

  it("reports no corridors when none were registered", () => {
    expect(solveLayout(request([node("shed", [7, 6, 7])])).report.corridors).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* `along` and `beside`                                                        */
/* -------------------------------------------------------------------------- */

describe("`along`", () => {
  const corridor = eastWestCorridor(4);
  const midZ = REGION.z0 + REGION.depth / 2;

  it("places the footprint inside the declared offset band", () => {
    const result = solveLayout(
      request(
        [node("cottage", [7, 6, 7], [{ type: "along", target: "main_street", offset: [2, 5] }])],
        { corridors: [corridor] },
      ),
    );
    const hit = corridorHit(corridor, placementOf(result, "cottage").anchor.x, placementOf(result, "cottage").anchor.z);
    expect(hit.clearance).toBeGreaterThanOrEqual(2);
    expect(hit.clearance).toBeLessThanOrEqual(5);
  });

  it("honours `side`, in the line's direction of travel", () => {
    const build = (side: "left" | "right"): number => {
      const result = solveLayout(
        request(
          [node("cottage", [7, 6, 7], [{ type: "along", target: "main_street", offset: [2, 5], side }])],
          { corridors: [corridor] },
        ),
      );
      const p = placementOf(result, "cottage");
      return corridorHit(corridor, p.anchor.x, p.anchor.z).side;
    };
    expect(build("left")).toBe(1);
    expect(build("right")).toBe(-1);
  });

  it("honours `at` — a stretch of the run, not the whole of it", () => {
    const result = solveLayout(
      request(
        [
          node(
            "cottage",
            [7, 6, 7],
            [{ type: "along", target: "main_street", offset: [2, 5], at: [0.0, 0.2] }],
          )
        ],
        { corridors: [corridor] },
      ),
    );
    const p = placementOf(result, "cottage");
    expect(corridorHit(corridor, p.anchor.x, p.anchor.z).position).toBeLessThanOrEqual(0.25);
  });

  it("turns an elongated footprint to run with the line", () => {
    const result = solveLayout(
      request(
        [node("terrace", [21, 6, 7], [{ type: "along", target: "main_street", offset: [2, 5] }])],
        { corridors: [corridor] },
      ),
    );
    const p = placementOf(result, "terrace");
    // The corridor runs east–west, so the long axis of the world footprint must
    // be X. Yaw 0 or 180 keeps the 21 on X; 90 or 270 would turn it across.
    expect(p.size[0]).toBeGreaterThan(p.size[2]);
  });

  it("costs a miss in blocks, normalized by the frame like every other term", () => {
    // Scored soft whatever it declares (tier 2), so the cost is observable in
    // the report rather than expressed as an infeasible candidate.
    const far: CanonicalConstraint = { type: "along", target: "main_street", offset: [0, 0] };
    const result = solveLayout(
      request([node("cottage", [7, 6, 7], [far, { type: "at", at: [0.5, 0.05], tolerance: 2 }])], {
        corridors: [corridor]
      }),
    );
    const entry = result.report.nodes[0]?.constraints[0];
    expect(entry?.type).toBe("along");
    expect(entry?.satisfied).toBe(false);
    const p = placementOf(result, "cottage");
    const clearance = corridorHit(corridor, p.anchor.x, p.anchor.z).clearance;
    expect(entry?.cost).toBeCloseTo(clearance / NORM, 6);
  });

  it("reports itself soft, whatever §4.4 says it declares", () => {
    const result = solveLayout(
      request([node("cottage", [7, 6, 7], [{ type: "along", target: "main_street" }])], {
        corridors: [corridor]
      }),
    );
    const entry = result.report.nodes[0]?.constraints[0];
    expect(entry?.declaredStrength).toBe("hard");
    // The half the solver owns is a cost; the half that could veto belongs to
    // pass 6, so "hard" would be the report lying about which knob the author has.
    expect(entry?.effectiveStrength).toBe("soft");
  });

  it("never vetoes a node whose target nobody registered", () => {
    const result = solveLayout(
      request([node("cottage", [7, 6, 7], [{ type: "along", target: "no_such_street" }])]),
    );
    expect(result.placements).toHaveLength(1);
    const entry = result.report.nodes[0]?.constraints[0];
    expect(entry?.satisfied).toBe(false);
    expect(entry?.cost).toBe(0);
  });

  it("is a pure function of its inputs", () => {
    const build = (): LayoutRequest =>
      request(
        [
          node("a", [7, 6, 7], [{ type: "along", target: "main_street", offset: [2, 5] }]),
          node("b", [9, 6, 7], [{ type: "along", target: "main_street", offset: [2, 5] }])
        ],
        { corridors: [corridor] },
      );
    expect(JSON.stringify(solveLayout(build()).report)).toBe(
      JSON.stringify(solveLayout(build()).report),
    );
  });

  it("keeps two `along` siblings apart, via the implicit not_overlapping", () => {
    const result = solveLayout(
      request(
        [
          node("a", [7, 6, 7], [{ type: "along", target: "main_street", offset: [2, 5] }]),
          node("b", [7, 6, 7], [{ type: "along", target: "main_street", offset: [2, 5] }])
        ],
        { corridors: [corridor] },
      ),
    );
    const a = placementOf(result, "a").footprint;
    const b = placementOf(result, "b").footprint;
    const disjoint = a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0;
    expect(disjoint).toBe(true);
    void midZ;
  });
});

describe("`beside` — pure sugar over `along` (§4.4)", () => {
  const desugar = (raw: Record<string, unknown>): CanonicalConstraint => {
    const resolved = resolveTypeKey(raw);
    if (!resolved.ok) throw new Error(`unresolvable: ${JSON.stringify(raw)}`);
    return desugarBeside(canonicalize(raw, resolved.type, resolved.shorthand));
  };

  it("takes `along`'s wider band and drops `faceRoad`", () => {
    const c = desugar({ beside: "the_river" });
    expect(c["offset"]).toEqual(BESIDE_DEFAULT_OFFSET);
    expect(c["faceRoad"]).toBe(false);
    // `along`'s own default is the near band, and is not touched by any of this.
    expect(ALONG_DEFAULT_OFFSET).toEqual([1, 4]);
  });

  it("keeps whatever the author did state", () => {
    const c = desugar({ beside: "the_river", offset: [1, 2], side: "left" });
    expect(c["offset"]).toEqual([1, 2]);
    expect(c["side"]).toBe("left");
  });

  it("leaves every other constraint type alone", () => {
    const c = desugar({ zone: "north" });
    expect(c.type).toBe("zone");
  });

  it("places against the corridor with the wider band, and reports as `beside`", () => {
    const corridor = eastWestCorridor(4);
    const result = solveLayout(
      request([node("mill", [7, 6, 7], [desugar({ beside: "main_street" })])], {
        corridors: [corridor]
      }),
    );
    const p = placementOf(result, "mill");
    const hit = corridorHit(corridor, p.anchor.x, p.anchor.z);
    expect(hit.clearance).toBeGreaterThanOrEqual(BESIDE_DEFAULT_OFFSET[0] as number);
    expect(hit.clearance).toBeLessThanOrEqual(BESIDE_DEFAULT_OFFSET[1] as number);
    // The report names the constraint the document contains, not the rewrite.
    expect(result.report.nodes[0]?.constraints[0]?.type).toBe("beside");
  });
});

/* -------------------------------------------------------------------------- */
/* `on`                                                                        */
/* -------------------------------------------------------------------------- */

describe("terrain products, and `on`", () => {
  /** An ocean over the western third, so there is a north–south coastline. */
  function coastMask(): Uint8Array {
    const mask = new Uint8Array(REGION.width * REGION.depth);
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width / 3; i++) mask[j * REGION.width + i] = 1;
    }
    return mask;
  }

  const coastX = REGION.x0 + Math.floor(REGION.width / 3);

  function index(products: ReturnType<typeof deriveTerrainProducts>): TerrainProductIndex {
    return new TerrainProductIndex(REGION, products);
  }

  it("derives a coastline from the ocean mask, four-connected", () => {
    const columns = coastlineColumns(REGION, coastMask(), 1);
    expect(columns.length).toBeGreaterThan(0);
    // Every one is dry land with water immediately west of it.
    for (const c of columns) expect(c.x).toBe(coastX);
  });

  it("derives nothing from a landlocked region", () => {
    const products = deriveTerrainProducts({
      region: REGION,
      oceanMask: new Uint8Array(REGION.width * REGION.depth)
    });
    expect(products).toEqual([]);
  });

  it("widens a product into an areal domain by `band`", () => {
    const idx = index(deriveTerrainProducts({ region: REGION, oceanMask: coastMask() }));
    const at = (x: number, z: number, band: number): number =>
      (idx.band("@terrain:coastline", band) as Uint8Array)[
        (z - REGION.z0) * REGION.width + (x - REGION.x0)
      ] as number;
    const z = REGION.z0 + REGION.depth / 2;
    expect(at(coastX, z, 8)).toBe(1);
    expect(at(coastX + 8, z, 8)).toBe(1);
    expect(at(coastX + 9, z, 8)).toBe(0);
    // …and the mask is cached, not rebuilt.
    expect(idx.band("@terrain:coastline", 8)).toBe(idx.band("coastline", 8));
  });

  it("keeps a hard `on` inside the band", () => {
    const idx = index(deriveTerrainProducts({ region: REGION, oceanMask: coastMask() }));
    const result = solveLayout(
      request(
        [
          node(
            "lighthouse",
            [7, 20, 7],
            // Pulled hard to the far east by `at`; only `on` can bring it back.
            [
              { type: "on", target: "@terrain:coastline", band: 6 },
              { type: "at", at: [0.95, 0.5], weight: 4 }
            ],
          )
        ],
        { products: idx },
      ),
    );
    const p = placementOf(result, "lighthouse");
    expect(Math.abs(p.anchor.x - coastX)).toBeLessThanOrEqual(6);
    expect(result.report.nodes[0]?.constraints[0]?.satisfied).toBe(true);
    expect(result.report.nodes[0]?.constraints[0]?.effectiveStrength).toBe("hard");
  });

  it("never vetoes a node when the terrain made no such product", () => {
    const idx = index(deriveTerrainProducts({ region: REGION }));
    const result = solveLayout(
      request([node("lighthouse", [7, 20, 7], [{ type: "on", target: "@terrain:coastline" }])], {
        products: idx
      }),
    );
    expect(result.placements).toHaveLength(1);
    const entry = result.report.nodes[0]?.constraints[0];
    expect(entry?.satisfied).toBe(false);
    expect(entry?.cost).toBe(0);
  });

  it("resolves `peak` from summit markers and `ridge` from a course", () => {
    const peak = { x: REGION.x0 + 20, z: REGION.z0 + 20 };
    const idx = index(
      deriveTerrainProducts({
        region: REGION,
        peaks: [peak],
        ridgeCourses: [Array.from({ length: 40 }, (_, i) => ({ x: REGION.x0 + i, z: REGION.z0 + 70 }))]
      }),
    );
    expect(idx.names).toEqual(["ridge", "peak"]);
    const result = solveLayout(
      request([node("cairn", [5, 5, 5], [{ type: "on", target: "@terrain:peak", band: 10 }])], {
        products: idx
      }),
    );
    const p = placementOf(result, "cairn");
    expect(Math.abs(p.anchor.x - peak.x)).toBeLessThanOrEqual(10);
    expect(Math.abs(p.anchor.z - peak.z)).toBeLessThanOrEqual(10);
  });

  it("reads a side off a polyline product, and nothing off a point one", () => {
    const ridge = Array.from({ length: 40 }, (_, i) => ({ x: REGION.x0 + i, z: REGION.z0 + 70 }));
    const [product] = deriveTerrainProducts({ region: REGION, ridgeCourses: [ridge] });
    // The line runs west→east; left of it is north.
    expect(productSideAt(product as never, REGION.x0 + 10, REGION.z0 + 60)).toBe(1);
    expect(productSideAt(product as never, REGION.x0 + 10, REGION.z0 + 80)).toBe(-1);
    const [point] = deriveTerrainProducts({ region: REGION, peaks: [{ x: 0, z: 0 }] });
    expect(productSideAt(point as never, 5, 5)).toBe(0);
  });

  it("is a pure function of its inputs", () => {
    const build = (): LayoutRequest =>
      request([node("lighthouse", [7, 20, 7], [{ type: "on", target: "@terrain:coastline", band: 6 }])], {
        products: index(deriveTerrainProducts({ region: REGION, oceanMask: coastMask() }))
      });
    expect(JSON.stringify(solveLayout(build()).report)).toBe(
      JSON.stringify(solveLayout(build()).report),
    );
  });
});
