/**
 * **ROAD_PULL — authority proportional to need** (`docs/ROAD-PULL-v0.md`).
 *
 * One law, one flag, and this file pins it as the sentence it is:
 *
 * ```
 * y(col) = round( y_drape(col) + pull(s) · ( y_n5(s) − y_drape(col) ) )
 * ```
 *
 * — the homotopy between the two shipped road laws, with the mix decided by the
 * terrain itself. So the rows below are the two endpoints and the path between
 * them: on flat ground `pull` is 0 and the pass is `ROAD_SOVEREIGN`'s drape to
 * the bit; on a cliff face `pull` is 1 and the pass is the graded profile the
 * sovereign flip stopped consuming; and across the boundary between the two the
 * authority *ramps* rather than popping, which is the one thing a blend of two
 * laws can get wrong that neither parent can.
 *
 * And, first of all, that the flag's **off state is inert**: the parameter that
 * lets these tests exist changes nothing when it is false, which is the same
 * claim the ground probe's byte-identity check makes at whole-world scale.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import {
  PULL_RAMP,
  PULL_R_CLIFF,
  PULL_R_FLAT,
  PULL_SMOOTH,
  PULL_WINDOW,
  ROAD_PULL,
  ROAD_SOVEREIGN,
} from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { index, surfaceStreetGraph } from "../src/structures/roads.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 96): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, height: (x: number, z: number) => number): ColumnPlan {
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
    seaLevel: SEA,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 },
  };
}

/** Dead level: `grade` is 0 everywhere, so the grader gets nothing. */
const level = (): number => SEA + 10;

/**
 * A gentle fall — one riser per five blocks, which is gentler than
 * {@link PULL_R_FLAT}'s "one riser per four".
 */
const gentle = (x: number): number => SEA + 20 - Math.floor((x + 48) / 5);

/**
 * The cliff: the terraced fall `road-sovereign.test.ts` grades against, three
 * flat columns and a riser of two — 0.67 blocks per block, well past
 * {@link PULL_R_CLIFF}, and deliberately not 1-Lipschitz.
 */
const terraced = (x: number): number => SEA + 12 - 2 * Math.floor((x + 48) / 3);

/** Flat, then the terrace, then flat: the regime boundary, twice. */
function transition(x: number): number {
  const top = SEA + 30;
  if (x <= -9) return top;
  if (x >= 9) return top - 2 * 6;
  return top - 2 * Math.floor((x + 9) / 3);
}

function graphOf(segments: StreetSegment[]): StreetGraph {
  return { segments, intersections: [], sidewalk: 2 };
}

/** The east–west runs are `2 · RUN_HALF + 1` columns long, centred on x = 0. */
const RUN_HALF = 30;
const RUN_LEN = 2 * RUN_HALF + 1;

/** A straight east–west run across the fixture, `role` as given. */
function run(id: string, z: number, role: StreetSegment["role"], width = 3): StreetSegment {
  return {
    id,
    kind: "lane",
    width,
    path: Array.from({ length: RUN_LEN }, (_, i) => ({ x: -RUN_HALF + i, z })),
    ...(role === undefined ? {} : { role }),
  };
}

function surface(
  p: ColumnPlan,
  graph: StreetGraph,
  overrides: { sovereign?: boolean; pull?: boolean } = {},
) {
  return surfaceStreetGraph({
    graphs: [graph],
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, "world.quarter"),
    theme: "medieval_village",
    ...overrides,
  });
}

/** The one run's pull field, station-indexed. */
function fieldOf(out: { pull?: ReadonlyMap<string, Float64Array> }): number[] {
  const map = out.pull;
  expect(map).toBeDefined();
  if (map === undefined) return [];
  expect(map.size).toBe(1);
  return [...([...map.values()][0] as Float64Array)];
}

/** The centre-line profile of the east–west run at `z`, from the resolved ground. */
function centreline(r: Region, p: ColumnPlan, z: number): number[] {
  return Array.from({ length: RUN_LEN }, (_, i) => p.ground[index(r, -RUN_HALF + i, z)] as number);
}

/* -------------------------------------------------------------------------- */
/* 0. the flag, the ladder, and the inert off state                            */
/* -------------------------------------------------------------------------- */

describe("the flag", () => {
  it("ships false", () => {
    expect(ROAD_PULL).toBe(false);
  });

  it("is a rung above ROAD_SOVEREIGN — the ladder", () => {
    // `ROAD_PULL` implies `ROAD_SOVEREIGN`: the blend's first term *is* the
    // drape, so the flag is meaningless without it. Both the constant and the
    // per-call override read the conjunction, which is why this assertion is
    // the whole of the ladder.
    if (ROAD_PULL) expect(ROAD_SOVEREIGN).toBe(true);
    // The constants are the design's taste levers, one line each.
    expect(PULL_R_FLAT).toBeLessThan(PULL_R_CLIFF);
    expect(PULL_WINDOW).toBeGreaterThan(PULL_SMOOTH);
    expect(PULL_RAMP).toBeGreaterThan(0);
  });

  it("is inert while it is off: the sovereign pass, unmoved", () => {
    const r = region();
    const graph = graphOf([run("ew0", 0, undefined), run("st0", 8, "steps")]);

    const control = plan(r, (x) => terraced(x));
    const sovereign = surface(control, graph, { sovereign: true });

    const explicit = plan(r, (x) => terraced(x));
    const off = surface(explicit, graph, { sovereign: true, pull: false });

    expect([...explicit.ground]).toEqual([...control.ground]);
    expect([...explicit.surface]).toEqual([...control.surface]);
    expect([...off.road]).toEqual([...sovereign.road]);
    expect(off.blocks).toEqual(sovereign.blocks);
    expect(off.surfacedColumns).toBe(sovereign.surfacedColumns);
    // No field off the flag: the off state costs not one allocation.
    expect(off.pull).toBeUndefined();
    expect(sovereign.pull).toBeUndefined();
    // …and the override reaches the machinery: on this fixture the on state is
    // a *different* pass, which is what makes every row below mean something.
    const onPlan = plan(r, (x) => terraced(x));
    const on = surface(onPlan, graph, { sovereign: true, pull: true });
    expect(on.pull).toBeDefined();
    expect([...onPlan.ground]).not.toEqual([...control.ground]);
  });

  it("is a no-op on the graded pass, whatever the override says", () => {
    // The ladder as behaviour: a fixture that forces `sovereign: false` has no
    // drape to blend against, so `pull: true` is the graded surfacing whole.
    const r = region();
    const graph = graphOf([run("ew0", 0, undefined)]);
    const a = plan(r, (x) => terraced(x));
    const graded = surface(a, graph, { sovereign: false });
    const b = plan(r, (x) => terraced(x));
    const asked = surface(b, graph, { sovereign: false, pull: true });
    expect([...b.ground]).toEqual([...a.ground]);
    expect(asked.blocks).toEqual(graded.blocks);
    expect(asked.pull).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 1. pull 0 — the flat quarter is the drape, to the bit                       */
/* -------------------------------------------------------------------------- */

describe("flat ground gives the grader nothing", () => {
  it("is a field of zeros on dead level ground", () => {
    const r = region();
    const p = plan(r, level);
    const out = surface(p, graphOf([run("ew0", 0, undefined)]), { sovereign: true, pull: true });
    expect(fieldOf(out)).toEqual(new Array(RUN_LEN).fill(0));
  });

  it("leaves a gentler-than-R_FLAT fall alone, column for column", () => {
    // One riser per five blocks is gentler than `PULL_R_FLAT`, so whatever
    // residue the smoothing leaves may not move a single block: the on state is
    // the sovereign drape here, and the whole design says so.
    const r = region();
    const graph = graphOf([run("ew0", 0, undefined)]);

    const control = plan(r, (x) => gentle(x));
    const drape = surface(control, graph, { sovereign: true });

    const p = plan(r, (x) => gentle(x));
    const blended = surface(p, graph, { sovereign: true, pull: true });

    expect(Math.max(...fieldOf(blended))).toBeLessThan(0.05);
    expect([...p.ground]).toEqual([...control.ground]);
    expect([...p.surface]).toEqual([...control.surface]);
    expect(blended.blocks).toEqual(drape.blocks);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. pull 1 — the cliff face is the graded profile                            */
/* -------------------------------------------------------------------------- */

describe("a cliff face hands the grader everything", () => {
  it("reaches 1 on the face, and lands within ±1 of the graded profile there", () => {
    const r = region();
    const graph = graphOf([run("ew0", 0, undefined)]);

    // The n5 profile the pre-sovereign law would have laid, from the same
    // fixture — the blend's other endpoint, measured rather than assumed.
    const gradedPlan = plan(r, (x) => terraced(x));
    surface(gradedPlan, graph, { sovereign: false });
    const graded = centreline(r, gradedPlan, 0);

    const p = plan(r, (x) => terraced(x));
    const out = surface(p, graph, { sovereign: true, pull: true });
    const field = fieldOf(out);
    const blended = centreline(r, p, 0);

    // (a) The terrain's verdict on a 0.67-per-block terrace is "decide".
    expect(Math.max(...field)).toBe(1);
    const face = field.map((v, i) => [v, i] as const).filter(([v]) => v >= 0.5);
    expect(face.length).toBeGreaterThan(10);

    // (b) Where the grader decides, the road is the graded profile — the ±1 is
    // the rounding of the blend and the backstop's own relaxation, not a third
    // law appearing between the two.
    for (const [, i] of face) {
      expect(Math.abs((blended[i] as number) - (graded[i] as number))).toBeLessThanOrEqual(1);
    }

    // (c) `ROAD-PULL-v0` §5's acceptance row: zero risers > 1 along the centre
    // line anywhere the grader holds at least half the authority. This is the
    // walkability claim, and it is the whole reason the blend exists.
    for (const [, i] of face) {
      if (i === 0) continue;
      const prev = blended[i - 1] as number;
      expect(Math.abs((blended[i] as number) - prev)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the sovereign's mask and border on the blended levels", () => {
    // Items 2–4 ride the blend untouched: the ribbon still wears its border,
    // and the stairs are still off.
    const r = region();
    const p = plan(r, (x) => terraced(x));
    const out = surface(p, graphOf([run("ew0", 0, undefined), run("st0", 8, "steps")]), {
      sovereign: true,
      pull: true,
    });
    const border = out.border;
    expect(border).toBeDefined();
    if (border === undefined) return;
    let bordered = 0;
    for (let k = 0; k < border.length; k++) if (border[k] === 1) bordered++;
    expect(bordered).toBeGreaterThan(0);
    expect(out.road.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // Item 3 is untouched by this design: a `steps` run is still plain draped
    // (now blended) carriageway, and not one stair block reaches the network.
    const isStair = (id: number): boolean =>
      (stack.blockNameByStateId(id) ?? "").endsWith("_stairs");
    expect(out.blocks.filter((b) => isStair(b.stateId))).toEqual([]);
    expect(out.declaration.segments.map((s) => s.role)).toEqual([
      "carriageway",
      "carriageway",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the transition — a regime change is a ramp, never a pop                  */
/* -------------------------------------------------------------------------- */

describe("flat → cliff → flat", () => {
  it("ramps the authority in and out over at least PULL_RAMP blocks", () => {
    const r = region();
    const p = plan(r, (x) => transition(x));
    const out = surface(p, graphOf([run("ew0", 0, undefined)]), { sovereign: true, pull: true });
    const field = fieldOf(out);

    // Both regimes are present, or the fixture is not a transition.
    expect(Math.min(...field)).toBeLessThan(0.05);
    expect(Math.max(...field)).toBeGreaterThan(0.9);

    // §2's ramp limit, as the invariant it is: authority may change by at most
    // `1 / PULL_RAMP` per block, so it takes at least `PULL_RAMP` blocks to
    // cross from nothing to everything.
    for (let i = 1; i < field.length; i++) {
      expect(Math.abs((field[i] as number) - (field[i - 1] as number))).toBeLessThanOrEqual(
        1 / PULL_RAMP + 1e-9,
      );
    }
    const first = field.findIndex((v) => v >= 0.95);
    const lastZero = field.findLastIndex((v, i) => i < first && v <= 0.05);
    expect(first - lastZero).toBeGreaterThanOrEqual(PULL_RAMP);
  });

  it("never pops the road at a regime boundary", () => {
    const r = region();
    const p = plan(r, (x) => transition(x));
    surface(p, graphOf([run("ew0", 0, undefined)]), { sovereign: true, pull: true });
    const blended = centreline(r, p, 0);

    const drapePlan = plan(r, (x) => transition(x));
    surface(drapePlan, graphOf([run("ew0", 0, undefined)]), { sovereign: true });
    const drape = centreline(r, drapePlan, 0);

    // The blend invents no step of its own: every riser it lays is one the
    // terrain already had, or one block. A "pop" would be exactly a step that
    // is neither — the messy middle §3.1's backstop exists to forbid.
    for (let i = 1; i < blended.length; i++) {
      const step = Math.abs((blended[i] as number) - (blended[i - 1] as number));
      const terrain = Math.abs((drape[i] as number) - (drape[i - 1] as number));
      expect(step).toBeLessThanOrEqual(Math.max(1, terrain));
    }
  });
});
