/**
 * A hill town is a town on a hill, not a hill made of pavement.
 *
 * `terraced` was built on the invariant *a bench boundary is always a street*,
 * which ties the number of full-width contour streets to the **relief**: forty-
 * five blocks of relief at one storey a bench is twelve terraces and therefore
 * twelve streets. Measured on `out/court-hilltown` (a 160 × 160 quarter over 45
 * blocks of relief): **20 559 of 25 600 columns were carriageway or sidewalk —
 * 80 % of the quarter — 55 of 72 lots were dropped as too small, and four
 * buildings stood in it.**
 *
 * The invariant bought one thing, *no lot spans two bench levels*, and Phase 4.2
 * bought that thing again: `terraced` resolves the `"stepped"` ground policy, so
 * `levelSeams`' columns go into `blocked` before `blocksOf` runs and a block
 * already cannot span two platforms. So the streets were paid for twice, and
 * this file is the three assertions that say so:
 *
 * 1. **The stride.** `contourStrideFor` puts a street on every `S`th bench
 *    boundary, where `S` is the fewest benches whose combined depth reaches
 *    `blockSize` — and `S` is 1 on gentle ground, which is what keeps every
 *    terraced quarter drawn before this byte-identical.
 * 2. **The invariant, without the streets.** The retained boundaries are in the
 *    form's lot mask, so no lot spans two bench levels *whatever* the ground
 *    policy — including `params.ground: "benched"`, where no seam is blocked and
 *    the lot mask is the only thing holding it up.
 * 3. **What it is for.** On a slope the same quarter comes out mostly ground
 *    with houses on it rather than mostly pavement.
 */

import { describe, expect, it } from "vitest";

import { HeightField, centeredRegion, nodeSeed, type Region } from "@terrainist/stdlib";
import { validateSettlementDocument } from "@terrainist/spec";

import { Grid, bestSide, rectsOf, solveDistricts } from "../src/layout/district.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";
import { carriagewayCells } from "../src/layout/streets.js";
import {
  BENCH_HEIGHT_MAX,
  TERRACED_FORM,
  benchFieldOf,
  contourStrideFor,
  meanBenchWidthOf,
} from "../src/layout/forms/terraced.js";
import { flatGround, type FormContext, type GroundSample } from "../src/layout/forms/index.js";

/* -------------------------------------------------------------------------- */
/* a hill, and a quarter on it                                                 */
/* -------------------------------------------------------------------------- */

const QUARTER = 160;
const REGION_SIZE = QUARTER * 2;
const BOUNDS: Rect = { x0: -QUARTER / 2, z0: -QUARTER / 2, x1: QUARTER / 2 - 1, z1: QUARTER / 2 - 1 };
const SEED = nodeSeed(20260805n, "world.hill_town", "");

/**
 * A 1-in-3 hillside — the gradient the measured hill town actually sits on.
 *
 * Falling along **x only**, so the contours are straight and the fixture tests
 * the rule rather than the raster: a plane falling diagonally has 45° contours,
 * and a 45° line on a lattice is a staircase whose column count is √2 times its
 * length, which understates every bench width by the same factor. Real ground
 * is neither; a straight contour is the case the arithmetic is stated in.
 */
const steepAt = (x: number): number => 70 + Math.round(x / 3);

/** A 1-in-24 hillside: benches wider than `blockSize`, so the stride is 1. */
const gentleAt = (x: number): number => 70 + Math.round(x / 24);

function groundOf(at: (x: number) => number): GroundSample {
  return {
    height: (x) => at(x),
    water: () => false,
    slope: (x) => Math.abs(at(x + 1) - at(x)),
    relief: at(BOUNDS.x1) - at(BOUNDS.x0),
    levelled: false,
    waterReach: Number.POSITIVE_INFINITY,
  };
}

function context(ground: GroundSample): FormContext {
  return {
    bounds: BOUNDS,
    seed: SEED,
    blockSize: 36,
    sidewalk: 2,
    density: "medium",
    ground,
    focus: [],
  };
}

/** Columns of `BOUNDS` any segment's carriageway covers. */
function carriagewayShare(graph: Parameters<typeof carriagewayCells>[0]): number {
  const seen = new Set<string>();
  for (const cell of carriagewayCells(graph, BOUNDS)) seen.add(`${cell.x},${cell.z}`);
  return seen.size / (QUARTER * QUARTER);
}

/* -------------------------------------------------------------------------- */
/* 1 — the derivation                                                          */
/* -------------------------------------------------------------------------- */

describe("how often a bench boundary is a street", () => {
  it("is every boundary when a bench is already as deep as a block", () => {
    // `2 · area / boundaryColumns` is the mean bench width. 200 columns of it
    // against a 36-column block is one street per boundary — today's rule, and
    // the reason a gentle terraced quarter does not move.
    expect(contourStrideFor(36, 20_000, 200, 6)).toBe(1);
    expect(contourStrideFor(36, 20_000, 1_000, 6)).toBe(1);
  });

  it("is the fewest benches whose combined depth reaches blockSize", () => {
    // width 10.29 — the number measured on the hill town at four blocks a bench.
    expect(contourStrideFor(36, 25_600, 4_976, 12)).toBe(4);
    // width 15.4 — the same quarter at six blocks a bench.
    expect(contourStrideFor(36, 25_600, 3_325, 8)).toBe(3);
    // A narrower block asks for fewer benches between its streets.
    expect(contourStrideFor(16, 25_600, 3_325, 8)).toBe(2);
  });

  it("never exceeds the number of boundaries there are to be a street", () => {
    // Two benches is one boundary, and it has to carry the street or there is
    // no skeleton at all.
    expect(contourStrideFor(200, 25_600, 3_325, 2)).toBe(1);
    expect(contourStrideFor(200, 25_600, 3_325, 4)).toBe(3);
  });

  it("is total on a field with no boundary at all", () => {
    expect(contourStrideFor(36, 25_600, 0, 1)).toBe(1);
    expect(meanBenchWidthOf(new Int32Array(4).fill(0), 2, 2)).toBe(Number.POSITIVE_INFINITY);
  });

  it("draws a gentle hillside exactly as it always did — one street per boundary", () => {
    const drawn = TERRACED_FORM.draw(context(groundOf(gentleAt)));
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    // No stride line in the record, and no lot mask: at stride 1 both are the
    // absent, byte-identical path.
    expect(drawn.plan.record.adapted.join(" ")).not.toMatch(/bench boundary/);
    expect(drawn.plan.lotMask).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — the invariant, once the streets stop enforcing it                       */
/* -------------------------------------------------------------------------- */

describe("no lot spans two bench levels, with or without a street on the boundary", () => {
  const ctx = context(groundOf(steepAt));
  const drawn = TERRACED_FORM.draw(ctx);

  it("thins the contour streets on a slope this steep", () => {
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.plan.record.adapted.join(" ")).toMatch(/contour streets on every \d\w+ bench boundary/);
  });

  it("puts every retained boundary column in the lot mask, and no street column", () => {
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    const mask = drawn.plan.lotMask;
    expect(mask).toBeDefined();
    if (mask === undefined) return;

    // Re-derive the bench field the form cut, at the height it cut it at, and
    // check the mask column for column. `benchFieldOf` is exported for exactly
    // this: re-deriving the blur by hand would give a different answer.
    const benches = drawn.plan.benches ?? [];
    expect(benches.length).toBeGreaterThan(2);
    const height = benches.length > 1 ? (benches[1] as { level: number }).level - (benches[0] as { level: number }).level : 0;
    expect(height).toBeGreaterThanOrEqual(1);
    expect(height).toBeLessThanOrEqual(BENCH_HEIGHT_MAX);
    const field = benchFieldOf(ctx, height);

    const width = BOUNDS.x1 - BOUNDS.x0 + 1;
    const depth = BOUNDS.z1 - BOUNDS.z0 + 1;
    let retained = 0;
    let masked = 0;
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        const level = field.bench[k] as number;
        if (level < 0) continue;
        let boundary = false;
        for (const n of [
          j > 0 ? k - width : -1,
          i > 0 ? k - 1 : -1,
          i + 1 < width ? k + 1 : -1,
          j + 1 < depth ? k + width : -1,
        ]) {
          if (n < 0) continue;
          const other = field.bench[n] as number;
          if (other >= 0 && other !== level) boundary = true;
        }
        if (!boundary) {
          // Ground in the middle of a terrace is always lottable.
          expect(mask[k], `${i},${j} is not a boundary and must be lottable`).toBe(1);
          continue;
        }
        retained++;
        if (mask[k] === 0) masked++;
      }
    }
    // Most of the boundary is retained rather than streeted — that is the whole
    // change — and every retained column is out of the lot mask.
    expect(retained).toBeGreaterThan(500);
    expect(masked / retained).toBeGreaterThan(0.5);
  });

  it("keeps every bench a form product, streeted or not", () => {
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    // The stride thins the *streets*, never the platforms: every terrace is
    // still cut, still levelled, and still gets a retaining wall on its face.
    const levels = new Set((drawn.plan.benches ?? []).map((b) => b.level));
    expect(levels.size).toBe((drawn.plan.benches ?? []).length);
    expect(levels.size).toBeGreaterThan(2);
  });

  it("refuses flat ground rather than pretending, as it always did", () => {
    const drawnFlat = TERRACED_FORM.draw(context(flatGround()));
    expect(drawnFlat.ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 — what the stride is for                                                  */
/* -------------------------------------------------------------------------- */

/** The hill town, as a document over a synthetic 1-in-3 ramp. */
function hillDoc(ground: string): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "hill_town", worldSeed: "20260805" },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [REGION_SIZE, REGION_SIZE] },
      children: [
        // The profile wants both, and the layout pass reads neither: the field
        // below is handed to `solveDistricts` directly.
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { seaLevel: 63, baseHeight: 70, amplitude: 40 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "hill_town",
          kind: "district",
          envelope: { shape: "region", size: [QUARTER, QUARTER] },
          params: {
            fabric: "terraced",
            density: "medium",
            mix: ["cottage", "townhouse"],
            blockSize: 36,
            ground,
          },
          constraints: [{ zone: "center" }],
        },
      ],
    },
  };
}

/**
 * A conical hill: contours are circles, so every bench is a curved band.
 *
 * The straight-contour ramp above tests the stride's arithmetic; this tests the
 * shape a real hill actually has, and it is the fixture `rectsOf` exists for —
 * the largest rectangle inside an annulus is a chord of it, and one rectangle
 * per block throws the rest of the terrace away.
 */
const coneAt = (i: number, j: number): number => {
  // The summit sits 220 columns south of the quarter, so the contours crossing
  // it are arcs of radius 140 to 300 — curved the way a hillside is, at the
  // same 1-in-3 gradient as the ramp above.
  const dx = i - REGION_SIZE / 2;
  const dz = j - REGION_SIZE / 2 - 220;
  return 70 + Math.round(Math.sqrt(dx * dx + dz * dz) / 3);
};

function layHill(ground: string, at?: (i: number, j: number) => number) {
  const validated = validateSettlementDocument(hillDoc(ground));
  const doc = validated.document;
  if (doc === undefined) {
    throw new Error(
      `fixture did not validate: ${validated.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  const region: Region = centeredRegion(REGION_SIZE, REGION_SIZE);
  const field = new HeightField(region);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      // The same 1-in-3 hillside, in the field's own frame.
      field.values[j * region.width + i] = at === undefined ? 70 + Math.round(i / 3) : at(i, j);
    }
  }
  const placement: Placement = {
    nodePath: "world.hill_town",
    id: "hill_town",
    translation: [BOUNDS.x0, 70, BOUNDS.z0],
    yaw: 0,
    mirror: false,
    size: [QUARTER, 1, QUARTER],
    footprint: BOUNDS,
    anchor: { x: 0, z: 0 },
    foundationY: 70,
  };
  return solveDistricts({ doc, worldSeed: 20260805n, field, placements: [placement] });
}

describe("a hill town is mostly ground with houses on it", () => {
  const laid = layHill("stepped");
  const quarter = laid.districts[0];

  it("lays a terraced quarter worth measuring", () => {
    expect(quarter?.form.id).toBe("terraced");
  });

  it("spends well under half the quarter on pavement", () => {
    expect(quarter).toBeDefined();
    if (quarter === undefined) return;
    const columns = QUARTER * QUARTER;
    const paved = quarter.stats.carriagewayColumns + quarter.stats.sidewalkColumns;
    // 80 % before the stride, on the quarter this was measured on. A third is a
    // ceiling with room in it, not the number that came out.
    expect(paved / columns).toBeLessThan(0.45);
  });

  it("seats buildings on the terraces rather than dropping their lots", () => {
    expect(quarter).toBeDefined();
    if (quarter === undefined) return;
    // Four buildings and 55 dropped lots is what the streets-everywhere fabric
    // gave. The floor here is well under what the fix measures, because the
    // number that matters is *not four*.
    expect(laid.placements.length).toBeGreaterThan(15);
    expect(quarter.stats.lots).toBeGreaterThan(30);
  });

  it("gets the same guarantee under params.ground: benched, where no seam is blocked", () => {
    // The one case the seam machinery does *not* cover: an author who asks for
    // the pre-4.2 ground gets platforms but no blocked seam columns, so the
    // form's own lot mask is the only thing keeping a lot off a bench boundary.
    const benched = layHill("benched");
    const built = benched.districts[0];
    expect(built?.form.id).toBe("terraced");
    expect(benched.placements.length).toBeGreaterThan(0);
  });
});

describe("a terrace is a curved band, and a block is more than one rectangle", () => {
  const laid = layHill("stepped", coneAt);
  const quarter = laid.districts[0];

  it("lays a terraced quarter on a conical hill", () => {
    expect(quarter?.form.id).toBe("terraced");
  });

  it("cuts more than one rectangle out of a curved block", () => {
    expect(quarter).toBeDefined();
    if (quarter === undefined) return;
    // With one inscribed rectangle per block this quarter came out with 26
    // blocks, 20 lots and 6 buildings; the ground it could not reach was the
    // 55 % of every annular bench that is not in its own largest chord. See
    // `rectsOf` and `bestSide` in `layout/district.ts`.
    expect(quarter.stats.blocks).toBeGreaterThan(30);
    expect(quarter.stats.lots).toBeGreaterThan(50);
    expect(laid.placements.length).toBeGreaterThan(10);
  });

  it("never seats two buildings through each other", () => {
    const rects = laid.placements.map((p) => p.footprint);
    const overlaps: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as Rect;
        const b = rects[j] as Rect;
        if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1) {
          overlaps.push(`${JSON.stringify(a)} ∩ ${JSON.stringify(b)}`);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });
});

describe("one rectangle per block throws a terrace away", () => {
  // A crescent: a band eight columns thick bent through a quarter circle, which
  // is what a bench on a hillside is. `largestFreeRect` answers it with one
  // chord.
  const SIDE = 60;
  const bounds: Rect = { x0: 0, z0: 0, x1: SIDE - 1, z1: SIDE - 1 };
  const grid = new Grid(bounds);
  const member = new Uint8Array(grid.cells);
  let band = 0;
  for (let z = 0; z < SIDE; z++) {
    for (let x = 0; x < SIDE; x++) {
      const r = Math.round(Math.sqrt(x * x + z * z));
      if (r < 34 || r > 45) continue;
      member[grid.index(x, z) as number] = 1;
      band++;
    }
  }

  it("covers most of a curved band instead of one chord of it", () => {
    const rects = rectsOf(grid, member, bounds);
    const area = (r: Rect): number => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
    const total = rects.reduce((sum, r) => sum + area(r), 0);
    const largest = Math.max(...rects.map(area));
    expect(rects.length).toBeGreaterThan(2);
    // The whole of the change: what one rectangle reaches, against what the
    // band actually holds.
    expect(largest / band).toBeLessThan(0.4);
    expect(total / band).toBeGreaterThan(0.6);
  });

  it("hands out disjoint rectangles a building fits in", () => {
    const rects = rectsOf(grid, member, bounds);
    for (const r of rects) {
      expect(Math.min(r.x1 - r.x0 + 1, r.z1 - r.z0 + 1)).toBeGreaterThanOrEqual(7);
      // Every column of every rectangle is the band's own ground.
      for (let z = r.z0; z <= r.z1; z++) {
        for (let x = r.x0; x <= r.x1; x++) expect(member[grid.index(x, z) as number]).toBe(1);
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as Rect;
        const b = rects[j] as Rect;
        expect(a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1).toBe(false);
      }
    }
  });

  it("gives a terrace its long face, not the first face in the side order", () => {
    // A bench block with a stair-alley at each end and a contour street along
    // its north side: the fixed order is north-first here, which is already the
    // long face, so the interesting case is the one where it is not.
    const ends = new Map([
      ["west", "st0"],
      ["east", "st1"],
    ] as const);
    // 40 long in x, 12 deep in z: the west and east faces are the *short* ones.
    expect(bestSide(ends, { width: 40, span: 12 })).toBe("west");
    const both = new Map([
      ["south", "cn0"],
      ["west", "st0"],
    ] as const);
    // Without the block's dimensions the fixed order picks south, which is also
    // the long face here — so state the case that separates them.
    expect(bestSide(both)).toBe("south");
    const acrossOnly = new Map([
      ["north", "st0"],
      ["east", "cn0"],
    ] as const);
    // North is first in the side order and is the 9-column end of the terrace;
    // east runs its whole 40-column length.
    expect(bestSide(acrossOnly)).toBe("north");
    expect(bestSide(acrossOnly, { width: 9, span: 40 })).toBe("east");
  });
});

/* -------------------------------------------------------------------------- */
/* the skeleton is still a skeleton                                            */
/* -------------------------------------------------------------------------- */

describe("thinning the streets does not thin the connections", () => {
  const drawn = TERRACED_FORM.draw(context(groundOf(steepAt)));

  it("still draws stair-alleys, and more of them than contour streets", () => {
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    const streets = drawn.plan.graph.segments.filter((s) => s.kind === "street");
    const steps = drawn.plan.graph.segments.filter((s) => s.role === "steps");
    expect(streets.length).toBeGreaterThan(0);
    // The alleys are the frontage of every terrace the stride left streetless,
    // so a hill town has more of them than it has contour streets.
    expect(steps.length).toBeGreaterThan(streets.length);
  });

  it("leaves the quarter connected", () => {
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    // One component over the carriageway columns: `linkComponents` promises it
    // and the inter-district road pass, `boundaryEndpoints` and the physics
    // lint's walking BFS all assume it.
    const cells = new Set<string>();
    for (const cell of carriagewayCells(drawn.plan.graph, BOUNDS)) cells.add(`${cell.x},${cell.z}`);
    const first = [...cells][0] as string;
    const queue = [first];
    const seen = new Set([first]);
    for (let head = 0; head < queue.length; head++) {
      const [x, z] = (queue[head] as string).split(",").map(Number) as [number, number];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const key = `${x + dx},${z + dz}`;
        if (!cells.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push(key);
      }
    }
    expect(seen.size).toBe(cells.size);
  });

  it("keeps carriageway to a fraction of the quarter", () => {
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(carriagewayShare(drawn.plan.graph)).toBeLessThan(0.3);
  });
});
