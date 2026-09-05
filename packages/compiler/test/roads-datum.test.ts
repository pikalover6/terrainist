/**
 * The surfacer as a **consumer** of the street datum —
 * Part I, F8/F9, wave 8D.
 *
 * F2's law is that a carriageway's elevation is computed exactly once. Wave 8A
 * built the grader that computes it in the layout stage; this wave demotes the
 * structure-stage grader to a consumer of that answer. What has to be true, and
 * is asserted below:
 *
 * - **the datum is the profile.** A run handed a datum is surfaced at the
 *   datum's levels, not at levels re-derived from `plan.ground` — proven with a
 *   fixture where the two genuinely differ, so an accidental fallback to the
 *   old path is visible rather than silently equal;
 * - **the water floor is the one further constraint**, and a floor can only
 *   lift, so the final level is `max(datum, floor)` and nothing else;
 * - **`STREET_CUT_MAX` caps the cut** (F9) and, where it binds, the profile is
 *   held up rather than dug down — and it stays 1-Lipschitz, which is what
 *   makes the held-up run a flight rather than a cliff;
 * - **`LOAM-T237 FRONTAGE_TIE_DRIFT`** fires once per segment that ended above
 *   its datum, naming the count and the maximum. That note is the audible
 *   guarantee that the ground authority and the materialised street cannot
 *   silently diverge;
 * - **no datum, no change.** Omitting the array, passing `undefined` at a
 *   position, and any district-less compile are all the pre-8D path exactly;
 * - **the arterial path and the `road.network@0` path are unmoved.** Neither has
 *   a `StreetGraph` to grade and neither can be handed a datum; both are
 *   asserted byte-equal across a call that carries one.
 *
 * The datum is forced in as a **fixture** throughout — `gradeStreetDatum` on a
 * hand-built graph, or a hand-lowered `ArcLevels` — never by flipping
 * `FRONTAGE_TIE`. 8F turned that flag on; forcing the fixture in regardless is
 * what makes these measurements the *consumer's*, independent of what any
 * quarter happens to grade.
 */

import { describe, expect, it } from "vitest";

import { HeightField, nodeSeed, type Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import { FRONTAGE_RISE } from "../src/layout/types.js";
import { frontageReach, frontageSeat } from "../src/layout/district.js";
import { gradeStreetDatum, type StreetDatum } from "../src/layout/street-datum.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { ROAD_BERM_MAX, STREET_CUT_MAX, buildRoadNetwork, qualifySegmentId, surfaceStreetGraph, type StreetSegmentDeclaration, type StreetSurfaceInput, type RoadNetworkInput } from "../src/structures/roads.js";
import { index } from "../src/structures/sweep.js";
import { arcLevels } from "../src/structures/sweep.js";
import type { Placement, ResolvedPort } from "../src/layout/types.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));
const QUARTER = "world.quarter";

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
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 }
  };
}

/** A field whose height is `h(x, z)` at every integer column. */
function field(r: Region, h: (x: number, z: number) => number): HeightField {
  const f = new HeightField(r);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      f.values[j * r.width + i] = h(r.x0 + i, r.z0 + j);
    }
  }
  return f;
}

function segment(
  id: string,
  kind: StreetSegment["kind"],
  width: number,
  path: readonly { x: number; z: number }[],
): StreetSegment {
  return { id, kind, width, path };
}

/** One east–west street, wide enough to have a real cross-section. */
function oneStreet(): StreetGraph {
  const path: { x: number; z: number }[] = [];
  for (let x = -30; x <= 30; x++) path.push({ x, z: 0 });
  return { segments: [segment("s", "street", 5, path)], intersections: [], sidewalk: 2 };
}

function surface(
  p: ColumnPlan,
  graph: StreetGraph,
  extra: Partial<StreetSurfaceInput> = {},
) {
  return surfaceStreetGraph({
    graphs: [graph],
    graphPaths: [QUARTER],
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, QUARTER),
    theme: "medieval_village",
    ...extra
  });
}

/**
 * The declaration row for a segment, by its **bare** id.
 *
 * A street's declared id is `qualifySegmentId(id, graphPath)`; an arterial's is
 * `arterial:<id>` and carries no qualifier. Both are resolved here so a test can
 * name the thing it means.
 */
function declared(
  result: { declaration: { segments: readonly StreetSegmentDeclaration[] } },
  id: string,
): StreetSegmentDeclaration {
  const want = new Set([qualifySegmentId(id, QUARTER), `arterial:${id}`]);
  const hit = result.declaration.segments.find((s) => want.has(s.id));
  expect(hit, `no declared segment "${id}"`).toBeDefined();
  return hit as StreetSegmentDeclaration;
}

/** The datum a quarter would have graded for `graph` over the field `h`. */
function datumFor(r: Region, graph: StreetGraph, h: (x: number, z: number) => number): StreetDatum {
  return gradeStreetDatum({ region: r, graph, field: field(r, h), seaLevel: SEA });
}

/** The same datum with one segment's profile pushed down by `drop` blocks. */
function lowered(datum: StreetDatum, id: string, drop: number): StreetDatum {
  const levels = datum.bySegment.get(id);
  expect(levels, `no datum for segment "${id}"`).toBeDefined();
  const l = levels as NonNullable<typeof levels>;
  const map = new Map(datum.bySegment);
  map.set(
    id,
    arcLevels(
      l.frame,
      l.y.map((y) => y - drop),
    ),
  );
  return { ...datum, bySegment: map };
}

/* -------------------------------------------------------------------------- */
/* 1. the datum is the profile                                                 */
/* -------------------------------------------------------------------------- */

describe("F8: the surfacer consumes the datum", () => {
  // The fixture that makes the test able to fail: the column plan is one block
  // *above* the field the datum was graded from, so "the datum's levels" and
  // "levels re-derived from `plan.ground`" are two different numbers at every
  // station. A fallback to the old path shows up as a one-block offset rather
  // than as an accidental pass.
  const groundH = (x: number, _z: number): number => 90 + Math.floor(x / 8);
  const fieldH = (x: number, z: number): number => groundH(x, z) - 1;

  it("surfaces a run at its datum's levels, not at re-graded ones", () => {
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, fieldH);
    const want = datum.bySegment.get("s")?.y as readonly number[];

    const tied = declared(surface(plan(r, groundH), graph, { datums: [datum] }), "s");
    expect(tied.levels?.y).toEqual([...want]);

    // And the ungraded path really is different — otherwise the assertion above
    // would hold for a surfacer that ignored the datum entirely.
    const free = declared(surface(plan(r, groundH), graph), "s");
    expect(free.levels?.y).not.toEqual([...want]);
    expect(free.levels?.y.map((y) => y - 1)).toEqual([...want]);
  });

  it("writes the datum's level onto the columns it owns", () => {
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, fieldH);
    // `sovereign: false` explicitly. The row above — the *stations* carry the
    // datum's levels — holds either way; this one is about the surfacer
    // spending the datum on the **columns**, and a sovereign road spends
    // nothing: every column takes the resolved ground under it, which on this
    // fixture is one block above the field the datum was graded from. Dormant
    // under `ROAD_SOVEREIGN`; kept tested for the flag's off-state and a
    // possible revert.
    const tied = declared(
      surface(plan(r, groundH), graph, { datums: [datum], sovereign: false }),
      "s",
    );
    // Every claimed column sits at the level the datum gave the station over it,
    // which is the number the lots were seated against in `layDistrict`.
    for (const column of tied.columns) {
      expect(column.y).toBe(datum.columnY[column.idx]);
    }
    expect(tied.columns.length).toBeGreaterThan(100);
  });

  it("does not re-pin at a crossroads the datum already pinned", () => {
    // Two runs meeting at the origin. The datum pinned the lane to the avenue in
    // `compareStreetRank` order; the surfacer must take both profiles as given
    // rather than pin a second time against its own `columnY`.
    const avenue: { x: number; z: number }[] = [];
    const lane: { x: number; z: number }[] = [];
    for (let x = -30; x <= 30; x++) avenue.push({ x, z: 0 });
    for (let z = -30; z <= 30; z++) lane.push({ x: 0, z });
    const graph: StreetGraph = {
      segments: [
        segment("b-lane", "lane", 3, lane),
        segment("a-avenue", "avenue", 7, avenue)
      ],
      intersections: [{ x: 0, z: 0, segments: ["a-avenue", "b-lane"] }],
      sidewalk: 2
    };
    const r = region();
    const datum = datumFor(r, graph, (x, z) => 88 + x * 0.4 + z * 0.4);
    const result = surface(plan(r, (x, z) => 89 + Math.round(x * 0.4 + z * 0.4)), graph, {
      datums: [datum]
    });
    for (const id of ["a-avenue", "b-lane"]) {
      expect(declared(result, id).levels?.y).toEqual([...(datum.bySegment.get(id)?.y ?? [])]);
    }
    // And the junction column carries one level, from the senior run's datum.
    const k = index(r, 0, 0);
    expect(datum.columnY[k]).toBe(datum.bySegment.get("a-avenue")?.at(30));
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the water floor, and only the water floor                                */
/* -------------------------------------------------------------------------- */

describe("F8: the floor is the one further constraint", () => {
  it("lifts a run above its datum where the sea floor bites, and never below", () => {
    // A datum graded from a field under the sea: `gradeProfile`'s floor is
    // `seaLevel + 1` everywhere, so the surfaced street stands on the water line
    // and the drift is exactly the lift.
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, () => 90);
    const sunk = lowered(datum, "s", 30); // 60 — three below the sea
    const result = surface(plan(r, () => 90), graph, { datums: [sunk] });
    const y = declared(result, "s").levels?.y as readonly number[];
    for (const level of y) expect(level).toBeGreaterThanOrEqual(SEA + 1);
    // A floor can only ever lift: no station ends below its datum.
    const before = sunk.bySegment.get("s")?.y as readonly number[];
    for (const [i, level] of y.entries()) expect(level).toBeGreaterThanOrEqual(before[i] as number);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. F9: the cut cap and the break                                            */
/* -------------------------------------------------------------------------- */

describe("F9: a tied carriageway may not dig past STREET_CUT_MAX", () => {
  it("holds the profile up instead of digging, and stays 1-Lipschitz", () => {
    const r = region();
    const graph = oneStreet();
    const flat = 90;
    const datum = lowered(datumFor(r, graph, () => flat), "s", 6);
    const result = surface(plan(r, () => flat), graph, { datums: [datum] });
    const y = declared(result, "s").levels?.y as readonly number[];
    // The cap binds at every station: the datum asked for `flat - 6` and the
    // street is built at `flat - STREET_CUT_MAX`, which is the break, not a dig.
    for (const level of y) expect(level).toBe(flat - STREET_CUT_MAX);
    expect(Math.min(...(datum.bySegment.get("s")?.y ?? []))).toBe(flat - 6);
  });

  it("makes the held-up run a flight of single steps, not a cliff", () => {
    // Ground that falls away in a broad step; a datum well below it everywhere.
    // The cap then holds the profile at `ground - STREET_CUT_MAX` on both sides
    // and `gradeProfile`'s envelope walks between them one block at a time —
    // which is exactly what `ArcLevels.steps` dresses as a tread.
    const r = region();
    const graph = oneStreet();
    const groundH = (x: number, _z: number): number => (x < 0 ? 96 : 90);
    const datum = lowered(datumFor(r, graph, () => 80), "s", 0);
    const levels = declared(surface(plan(r, groundH), graph, { datums: [datum] }), "s").levels;
    const y = levels?.y as readonly number[];
    for (let i = 1; i < y.length; i++) {
      expect(Math.abs((y[i] as number) - (y[i - 1] as number))).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...y)).toBe(96 - STREET_CUT_MAX);
    expect(Math.min(...y)).toBe(90 - STREET_CUT_MAX);
    // Somewhere in the middle the run steps: that is the flight.
    expect(y.some((level, i) => i > 0 && level !== y[i - 1])).toBe(true);
  });

  it("is pinned at the measured value", () => {
    // §3.1's forensics number, and §13.8's "pin the measurement beside the
    // constant". A silent retune of this is a silent retune of every tied
    // street's relationship to its own hill.
    expect(STREET_CUT_MAX).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* 3b. wave 8G: one grading — the cut cap lives in the datum                    */
/* -------------------------------------------------------------------------- */

/**
 * **The walked defect** (Kai's flag-matrix walk): on steep and terraced ground
 * a street rode as much as nine blocks above the frontages seated against it —
 * `LOAM-T237` four times on the citadel of `p1-tie2`, nine times on `p4-gem1`'s
 * ruined metro, four on Troy.
 *
 * The mechanism, measured rather than assumed: at **every** drifted station of
 * both flagged worlds the floor that bit was `natural − STREET_CUT_MAX`, never
 * the water floor (`deckFloor` read 0 or `seaLevel` at all of them). F9's cut
 * cap was applied only in the surfacer, so the datum dug an uncapped trench —
 * `ROAD_FILL_BAND` caps fill, never cut — the lots seated in the trench, and
 * the surfacer then held the carriageway up at the cap. Two graders, one
 * question, which is the exact thing F2 exists to forbid.
 *
 * The cut floor needs nothing the layout stage does not already have: it is a
 * function of the street's own sampled ground. So it moved into
 * `gradeStreetDatum`, and what is asserted here is that the two now agree
 * *without* the surfacer being asked to trust anything: an honestly graded
 * datum comes back from the surfacer unchanged, station for station, over the
 * ground that used to drift it.
 */
describe("8G: a datum graded over a hill comes back from the surfacer unchanged", () => {
  // A slope with a ravine cut through it and a lake standing in the ravine —
  // the two floor-raising features at once, on ground steep enough that the cut
  // cap binds hard: 24 blocks of fall across the street, and a gully 10 deep.
  const hillside = (x: number, _z: number): number => {
    const slope = 96 - Math.floor((x + 30) / 2.5);
    return Math.abs(x) <= 6 ? Math.min(slope, 74) : slope;
  };
  const LAKE_TOP = 78;

  /** The hillside plan, with a lake standing in the ravine at `LAKE_TOP`. */
  function withLake(r: Region): ColumnPlan {
    const p = plan(r, hillside);
    for (let k = 0; k < p.fluidKind.length; k++) {
      if ((p.ground[k] as number) < LAKE_TOP) {
        p.fluidKind[k] = FluidKind.WATER;
        p.fluidTop[k] = LAKE_TOP;
      }
    }
    return p;
  }

  it("carries F9's cut cap, so the datum never digs past STREET_CUT_MAX", () => {
    const r = region();
    const graph = oneStreet();
    const y = datumFor(r, graph, hillside).bySegment.get("s")?.y as readonly number[];
    // Sampled along the same line the datum grades on: the ravine is 10 deep
    // and the profile crosses it, so an uncapped grading digs 8 past the cap.
    for (const [i, level] of y.entries()) {
      const x = -30 + i;
      expect(level).toBeGreaterThanOrEqual(hillside(x, 0) - STREET_CUT_MAX);
    }
    // The cap really is the binding constraint here — this fixture would drift
    // by 8 blocks under the pre-8G grading.
    expect(Math.min(...y)).toBe(hillside(0, 0) - STREET_CUT_MAX);
  });

  it("is surfaced at exactly its datum at every station of the dry hill", () => {
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, hillside);
    const want = datum.bySegment.get("s")?.y as readonly number[];
    const result = surface(plan(r, hillside), graph, { datums: [datum] });
    expect(declared(result, "s").levels?.y).toEqual([...want]);
    // T237 is the alarm, and it is silent: nothing departed from the datum, so
    // no lot on this street was left below its own carriageway. Before 8G this
    // same fixture drifted at 33 of its 61 stations, by up to 10 blocks.
    expect(result.diagnostics).toBeUndefined();
  });

  it("keeps the water floor as the one legal departure, clamped to the berm", () => {
    // Fill the ravine and the rim floor bites: `routeFloorAt` holds the street
    // at the surface of the water beside it. That is F8's one legal departure
    // and the only thing `LOAM-T237` should still have to say — and W1's
    // pre-envelope clamp bounds it at `ROAD_BERM_MAX`, so the rim lifts the
    // carriageway a step out of the lake rather than building an embankment.
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, hillside);
    const want = datum.bySegment.get("s")?.y as readonly number[];
    const result = surface(withLake(r), graph, { datums: [datum] });
    const y = declared(result, "s").levels?.y as readonly number[];
    let lifted = 0;
    for (const [i, level] of y.entries()) {
      const lift = level - (want[i] as number);
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(ROAD_BERM_MAX);
      if (lift > 0) lifted++;
    }
    expect(lifted).toBeGreaterThan(0);
    // W1's clamp announces itself first (`LOAM-T239`); the drift note is the
    // one this test is about.
    const d = (result.diagnostics ?? []).find((n) => n.code === "LOAM-T237");
    expect(d?.name).toBe("FRONTAGE_TIE_DRIFT");
    expect(d?.message).toContain(`at ${lifted} of ${y.length} station(s)`);
  });

  it("leaves every lot on the dry hill within one step of its street", () => {
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, hillside);
    // `sovereign: false` explicitly: F1's "within one step" is a promise the
    // *graded* surfacer makes — the lots are seated off the datum and the
    // carriageway is built to the same datum, so the two cannot drift. A
    // sovereign road is draped on the hillside instead and owes the datum
    // nothing, so the promise is not broken here, it is not being made.
    // Dormant under `ROAD_SOVEREIGN`; kept tested for the flag's off-state and
    // a possible revert.
    const result = surface(plan(r, hillside), graph, { datums: [datum], sovereign: false });
    const built = new Map(declared(result, "s").columns.map((c) => [c.idx, c.y] as const));
    const reach = frontageReach(graph.sidewalk);
    let seated = 0;
    // A row of one-column lots along the street's north face, each seated the
    // way `layDistrict` seats one: `frontageSeat` off the datum, F5's corner
    // rule included. Every one of them must be able to step onto the street it
    // fronts — which is the whole of F1 in one number.
    for (let x = -28; x <= 28; x++) {
      const rect = { x0: x, z0: 6, x1: x, z1: 8 };
      const seat = frontageSeat({ rect, face: "north", corner: false, datum, reach });
      if (seat === undefined) continue;
      seated++;
      // The carriageway column the lot looks at, and the level it was built to.
      let street: number | undefined;
      for (let z = 5; z >= -1 && street === undefined; z--) {
        street = built.get(index(r, x, z));
      }
      expect(street, `no carriageway in front of the lot at x=${x}`).toBeDefined();
      expect(Math.abs((street as number) - (seat - FRONTAGE_RISE))).toBeLessThanOrEqual(1);
    }
    expect(seated).toBeGreaterThan(50);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. LOAM-T237 — the drift is audible                                         */
/* -------------------------------------------------------------------------- */

describe("LOAM-T237 FRONTAGE_TIE_DRIFT", () => {
  it("fires once per segment that ended above its datum, with count and maximum", () => {
    const r = region();
    const graph = oneStreet();
    const datum = lowered(datumFor(r, graph, () => 90), "s", 6);
    const result = surface(plan(r, () => 90), graph, { datums: [datum] });
    const diagnostics = result.diagnostics ?? [];
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0];
    expect(d?.code).toBe("LOAM-T237");
    expect(d?.name).toBe("FRONTAGE_TIE_DRIFT");
    expect(d?.severity).toBe("note");
    // Reported against the quarter that drew the street, not against the world.
    expect(d?.nodePath).toBe(QUARTER);
    // The datum asked for `84`; the cut cap held the street at `88`.
    const stations = (datum.bySegment.get("s")?.y ?? []).length;
    expect(d?.message).toContain(`at ${stations} of ${stations} station(s)`);
    expect(d?.message).toContain("by up to 4 block(s)");
    expect(d?.message).toContain('"s');
  });

  it("stays silent when the street lands on its datum", () => {
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, (x) => 90 + Math.floor(x / 8) - 1);
    const result = surface(plan(r, (x) => 90 + Math.floor(x / 8)), graph, { datums: [datum] });
    expect(result.diagnostics).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 5. no datum, no change                                                      */
/* -------------------------------------------------------------------------- */

describe("the ungraded path is untouched", () => {
  const groundH = (x: number, z: number): number => 88 + Math.round(x * 0.3 + z * 0.2);

  /** Everything a comparison can see: the levels, the columns and the plan. */
  function shape(p: ColumnPlan, extra: Partial<StreetSurfaceInput> = {}) {
    const result = surface(p, oneStreet(), extra);
    return {
      segments: result.declaration.segments.map((s) => ({
        id: s.id,
        columns: s.columns,
        bridged: s.bridged,
        y: s.levels?.y
      })),
      shoulders: result.declaration.shoulders,
      surfacedColumns: result.surfacedColumns,
      blocks: result.blocks.length,
      diagnostics: result.diagnostics,
      ground: [...p.ground]
    };
  }

  it("is identical with the array absent, empty, or holding `undefined`", () => {
    const r = region();
    const base = shape(plan(r, groundH));
    expect(shape(plan(r, groundH), { datums: [] })).toEqual(base);
    expect(shape(plan(r, groundH), { datums: [undefined] })).toEqual(base);
    // And nothing is reported: `diagnostics` is absent, not an empty array, so
    // the result object is the one every caller has always received.
    expect(base.diagnostics).toBeUndefined();
  });

  it("is still the path a district-less compile takes, now that the flag is on", () => {
    // 8F flipped the flag, so a quarter *does* grade a datum and the consumer
    // path above is live. The no-datum path did not go away with it: devworld,
    // terrarium and every documents-without-a-district compile still hand the
    // surfacer nothing, and the three shapes above assert that "nothing" is
    // byte-identical to the pre-8D call.
  });
});

/* -------------------------------------------------------------------------- */
/* 6. the two paths that have no datum                                         */
/* -------------------------------------------------------------------------- */

describe("the arterial path is provably unchanged", () => {
  const groundH = (x: number, z: number): number => 92 + Math.round(x * 0.25 - z * 0.15);
  const arterial = {
    id: "drive",
    width: 11,
    path: Array.from({ length: 61 }, (_, i) => ({ x: -30 + i, z: 12 }))
  };

  it("surfaces a boulevard identically whether or not a datum is in the call", () => {
    const r = region();
    const graph = oneStreet();
    const datum = datumFor(r, graph, (x, z) => groundH(x, z) - 1);
    const withDatum = surface(plan(r, groundH), graph, { arterials: [arterial], datums: [datum] });
    const without = surface(plan(r, groundH), graph, { arterials: [arterial] });
    const a = declared(withDatum, "drive");
    const b = declared(without, "drive");
    expect(a.levels?.y).toEqual(b.levels?.y);
    expect(a.columns).toEqual(b.columns);
    expect(a.bridged).toEqual(b.bridged);
    // The street beside it *did* move — otherwise the comparison above is
    // vacuous, because nothing was tied in the first place.
    expect(declared(withDatum, "s").levels?.y).not.toEqual(declared(without, "s").levels?.y);
  });
});

describe("the road.network@0 path is provably unchanged", () => {
  function building(
    id: string,
    x0: number,
    z0: number,
    w: number,
    d: number,
    y = 90,
  ): { placement: Placement; port: ResolvedPort } {
    const footprint = { x0, z0, x1: x0 + w - 1, z1: z0 + d - 1 };
    const placement: Placement = {
      nodePath: id,
      id,
      translation: [x0, y, z0],
      yaw: 0,
      mirror: false,
      size: [w, 6, d],
      footprint,
      anchor: { x: x0 + ((w - 1) >> 1), z: z0 + ((d - 1) >> 1) },
      foundationY: y
    };
    const port: ResolvedPort = {
      ref: `${id}#door`,
      nodePath: id,
      name: "door",
      type: "door",
      position: [placement.anchor.x, y, footprint.z1],
      outwardNormal: [0, 0, 1],
      face: "south",
      width: 1,
      height: 2,
      floorY: y
    };
    return { placement, port };
  }

  function network(p: ColumnPlan, extra: Record<string, unknown> = {}) {
    const hall = building("world.hall", -6, -6, 11, 11);
    const east = building("world.east", 14, -4, 8, 8);
    const west = building("world.west", -24, 6, 8, 8);
    const plaza = building("world.plaza", -4, 12, 10, 10).placement;
    const input = {
      nodePath: "world.lanes",
      params: { width: 3 },
      seed: nodeSeed(7n, "world.lanes"),
      plan: p,
      palette: emptyPalette,
      stack,
      placements: [hall.placement, east.placement, west.placement, plaza],
      ports: [hall.port, east.port, west.port],
      plaza,
      buildingPaths: new Set(["world.hall", "world.east", "world.west"]),
      ...extra
    } as RoadNetworkInput;
    const result = buildRoadNetwork(input);
    return {
      routes: result.routes,
      surfacedColumns: result.surfacedColumns,
      diagnostics: result.diagnostics,
      ground: [...p.ground]
    };
  }

  it("routes and surfaces identically when a datum rides along in the input", () => {
    // A lane is routed by A* and has no `StreetGraph`, so there is nothing for a
    // datum to be *of*: `RoadNetworkInput` carries no such field, and the cast
    // below proves the pass does not read one behind the type's back.
    const r = region();
    const groundH = (x: number, z: number): number => 90 + Math.floor((x + z) / 16);
    const graph = oneStreet();
    const datum = datumFor(r, graph, (x, z) => groundH(x, z) - 4);
    const base = network(plan(r, groundH));
    const smuggled = network(plan(r, groundH), { datums: [datum] });
    expect(smuggled).toEqual(base);
    expect(base.routes.length).toBeGreaterThan(0);
  });
});
