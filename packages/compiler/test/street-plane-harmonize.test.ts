/**
 * The post-election street harmonization — the +1 road lip
 * (`STREET_PLANE_HARMONIZE`, `layout/street-datum.ts`).
 *
 * The mechanism this repairs is one-way agreement: the street datum grades on
 * pristine terrain *before* the election (F2), and the election then pays a
 * frontage cost to agree with it (`docs/ELECTION-SOLVE-v0.md` §1.3.3), but a
 * street never reciprocates — so a stretch whose whole neighbourhood elected
 * one block lower stands proud of it for ever. That is Kai's walked lip on the
 * citadel: a road at natural grade, planes one lower on both sides, a building
 * `+1` submerged by the road's own sidewalk and a two-block dropoff where the
 * meeting should have been clean.
 *
 * What is asserted here is the *law*, not a golden number:
 *
 * - the drop is a drop of the grader's **input**, so F9's cut cap, the water
 *   floor and the one-block grade cap all survive it;
 * - **both** flanks must want it, one of them by exactly one block, over a run
 *   — one side alone, a flicker, or a flank that wants the street *up* all do
 *   nothing at all;
 * - a run may be **carried** through a junction, where the flank is another
 *   carriageway and the election put no platform in the probe, but a carried
 *   station can never start a run of its own;
 * - a city cell, which is one terrace by law, is not touched;
 * - and the whole thing is pure and idempotent in the sense that matters: the
 *   same input twice is the same answer, and a district whose planes already
 *   agree is re-graded not at all.
 */

import { describe, expect, it } from "vitest";

import { HeightField, type Region } from "@terrainist/stdlib";

import {
  gradeStreetDatum,
  harmonizeStreetDatum,
  type StreetDatum,
  type StreetDatumInput,
} from "../src/layout/street-datum.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import {
  STREET_PLANE_FLANK_PROBE,
  STREET_PLANE_HARMONIZE,
  STREET_PLANE_MIN_FLANK,
  STREET_PLANE_MIN_RUN,
} from "../src/layout/types.js";
import { STREET_CUT_MAX } from "../src/structures/roads.js";

const SEA = 63;
const SIZE = 96;

function region(size = SIZE): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function field(r: Region, h: (x: number, z: number) => number): HeightField {
  const f = new HeightField(r);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) f.values[j * r.width + i] = h(r.x0 + i, r.z0 + j);
  }
  return f;
}

/** A straight 4-connected run between two columns. */
function run(
  from: { x: number; z: number },
  to: { x: number; z: number },
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const dx = Math.sign(to.x - from.x);
  const dz = Math.sign(to.z - from.z);
  let { x, z } = from;
  out.push({ x, z });
  while (x !== to.x || z !== to.z) {
    if (x !== to.x) x += dx;
    else z += dz;
    out.push({ x, z });
  }
  return out;
}

function segment(
  id: string,
  kind: StreetSegment["kind"],
  width: number,
  path: readonly { x: number; z: number }[],
): StreetSegment {
  return { id, kind, width, path };
}

/** One east–west street across the region, sidewalk 2 — the walked shape. */
function oneStreet(width = 7): StreetGraph {
  return {
    segments: [segment("main", "street", width, run({ x: -30, z: 0 }, { x: 30, z: 0 }))],
    intersections: [],
    sidewalk: 2,
  };
}

/** …crossed by a lane at `x = 0`, which is where a flank goes silent. */
function crossroads(): StreetGraph {
  return {
    segments: [
      segment("main", "street", 7, run({ x: -30, z: 0 }, { x: 30, z: 0 })),
      segment("lane", "lane", 3, run({ x: 0, z: -30 }, { x: 0, z: 30 })),
    ],
    intersections: [{ x: 0, z: 0, segments: ["main", "lane"] }],
    sidewalk: 2,
  };
}

function inputFor(graph: StreetGraph, h: (x: number, z: number) => number): StreetDatumInput {
  const r = region();
  return { region: r, graph, field: field(r, h), seaLevel: SEA };
}

/**
 * A plane lookup for the flat case: every column outside the street's own
 * banded cross-section elects `level`, over the `z` band the harmonizer probes.
 * `where` narrows it to a stretch of the street, which is how a *lip* rather
 * than a whole quarter is described.
 */
function planes(level: number, where: (x: number, z: number) => boolean) {
  return (x: number, z: number): number | undefined => (where(x, z) ? level : undefined);
}

/** The inner half-width the harmonizer treats as the street's own band. */
const INNER = 5; // carriagewaySpans(7 + 2·2) → lanes −5…5

/** Both flanks of the street, from the first probed column outward. */
const bothFlanks = (x: number, z: number): boolean =>
  Math.abs(z) > INNER && Math.abs(z) <= INNER + STREET_PLANE_FLANK_PROBE && x >= -60 && x <= 60;

function harmonize(
  base: StreetDatumInput,
  datum: StreetDatum,
  planeAt: (x: number, z: number) => number | undefined,
) {
  return harmonizeStreetDatum({
    base,
    datum,
    planeAt,
    probe: STREET_PLANE_FLANK_PROBE,
    minFlank: STREET_PLANE_MIN_FLANK,
    minRun: STREET_PLANE_MIN_RUN,
  });
}

/** The graded level at a path column of `id`. */
function levelAt(datum: StreetDatum, id: string, x: number, z: number): number {
  const levels = datum.bySegment.get(id);
  if (levels === undefined) throw new Error(`no levels for ${id}`);
  const k = (z - region().z0) * region().width + (x - region().x0);
  return datum.band[k] === 1 ? (datum.columnY[k] as number) : levels.y[0] ?? 0;
}

describe("the flag", () => {
  it("ships off, so every world is byte-identical until it is flipped", () => {
    expect(STREET_PLANE_HARMONIZE).toBe(true); // flipped at the n4 gate (2026-08-21)
  });

  it("keeps its constants where the rule can be read off them", () => {
    // A station's quorum must be reachable inside the probe band it reads.
    expect(STREET_PLANE_MIN_FLANK).toBeLessThanOrEqual(STREET_PLANE_FLANK_PROBE);
    expect(STREET_PLANE_MIN_RUN).toBeGreaterThan(1);
  });
});

describe("the drop is a drop of the grader's input", () => {
  it("lowers exactly the stations it names, and no others", () => {
    const flat = (): number => 90;
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    const levels = before.bySegment.get("main");
    const stations = levels?.y.length ?? 0;
    expect(stations).toBeGreaterThan(20);
    const drop = new Array<number>(stations).fill(0);
    for (let i = 5; i < 15; i++) drop[i] = 1;
    const after = gradeStreetDatum({ ...base, lower: new Map([["main", drop]]) });
    const y = after.bySegment.get("main")?.y ?? [];
    // The named plateau is one lower; the grade cap ramps the two ends, so the
    // stations either side of it are within one block of both answers.
    for (let i = 6; i < 14; i++) expect(y[i]).toBe(90 - 1);
    expect(y[0]).toBe(90);
    expect(y[stations - 1]).toBe(90);
  });

  it("never digs past F9's cut cap, because the cap is sampled unlowered", () => {
    // A trench: the street is already at `ground − STREET_CUT_MAX` because the
    // hill either side of the run holds the envelope down.
    const hill = (x: number): number => 90 + Math.max(0, Math.abs(x) - 4) * 3;
    const base = inputFor(oneStreet(), (x) => hill(x));
    const before = gradeStreetDatum(base);
    const stations = before.bySegment.get("main")?.y.length ?? 0;
    const drop = new Array<number>(stations).fill(1);
    const after = gradeStreetDatum({ ...base, lower: new Map([["main", drop]]) });
    const y = after.bySegment.get("main")?.y ?? [];
    const frame = after.bySegment.get("main")?.frame;
    for (const [i, p] of (frame?.stations ?? []).entries()) {
      expect(y[i]).toBeGreaterThanOrEqual(hill(p.x) - STREET_CUT_MAX);
    }
  });

  it("never crosses the water floor, whatever it is asked for", () => {
    const base = inputFor(oneStreet(), () => SEA + 1);
    const stations = gradeStreetDatum(base).bySegment.get("main")?.y.length ?? 0;
    const after = gradeStreetDatum({
      ...base,
      lower: new Map([["main", new Array<number>(stations).fill(1)]]),
    });
    for (const y of after.bySegment.get("main")?.y ?? []) expect(y).toBeGreaterThanOrEqual(SEA + 1);
  });

  it("is the datum of F2 when no segment is named", () => {
    const base = inputFor(crossroads(), (x, z) => 88 + x * 0.4 - z * 0.3);
    const plain = gradeStreetDatum(base);
    const empty = gradeStreetDatum({ ...base, lower: new Map() });
    expect([...empty.bySegment].map(([id, l]) => [id, l.y])).toEqual(
      [...plain.bySegment].map(([id, l]) => [id, l.y]),
    );
    expect([...empty.columnY]).toEqual([...plain.columnY]);
  });
});

describe("both flanks, one block, a run — or nothing", () => {
  const flat = (): number => 90;

  it("drops a stretch both sides elected one below", () => {
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    const lip = (x: number, z: number): boolean => bothFlanks(x, z) && x >= -10 && x <= 10;
    const out = harmonize(base, before, planes(89, lip));
    expect(out.asked).toBeGreaterThanOrEqual(STREET_PLANE_MIN_RUN);
    expect(out.moved).toBe(out.asked);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0]?.from).toBe(90);
    expect(out.segments[0]?.to).toBe(89);
    // The lip itself is one lower and the street outside it is where it was.
    expect(levelAt(out.datum, "main", 0, 0)).toBe(89);
    expect(levelAt(out.datum, "main", 30, 0)).toBe(90);
  });

  it("does nothing on a one-sided preference", () => {
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    const oneSide = (x: number, z: number): boolean => bothFlanks(x, z) && z > 0;
    const out = harmonize(base, before, planes(89, oneSide));
    expect(out).toEqual({ datum: before, segments: [], asked: 0, moved: 0 });
  });

  it("does nothing where one side is content", () => {
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    // North wants it down, south is flush: the street is already right for one
    // of its frontages and moving it would only trade whose lip it is.
    const out = harmonize(base, before, (x, z) =>
      bothFlanks(x, z) ? (z < 0 ? 89 : 90) : undefined,
    );
    expect(out.asked).toBe(0);
    expect(out.datum).toBe(before);
  });

  it("never lifts, however far below the street the planes elected", () => {
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    // Both flanks two whole blocks *above* the street: a lift would close the
    // disagreement and is not a case this construction has (T13, W1).
    const out = harmonize(base, before, planes(92, bothFlanks));
    expect(out.asked).toBe(0);
    expect(out.datum).toBe(before);
  });

  it("refuses a cliff a single block would not fix", () => {
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    // Both sides at −3: this is a retained face, not a lip.
    const out = harmonize(base, before, planes(87, bothFlanks));
    expect(out.asked).toBe(0);
  });

  it("takes a cliff on one side when the other is a one-block lip", () => {
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    // −1 north, −3 south: the north frontage is repaired outright and the
    // south dropoff shrinks by a block. Nothing is made worse.
    const out = harmonize(base, before, (x, z) =>
      bothFlanks(x, z) ? (z < 0 ? 89 : 87) : undefined,
    );
    expect(out.asked).toBeGreaterThan(0);
    expect(out.segments[0]?.to).toBe(89);
  });

  it("refuses a flicker shorter than a run", () => {
    const base = inputFor(oneStreet(), flat);
    const before = gradeStreetDatum(base);
    const flicker = (x: number, z: number): boolean =>
      bothFlanks(x, z) && x >= 0 && x < STREET_PLANE_MIN_RUN - 1;
    const out = harmonize(base, before, planes(89, flicker));
    expect(out.asked).toBe(0);
  });
});

describe("junctions and city cells", () => {
  it("carries a run through the stations where one flank is another street", () => {
    // A lane joining from the south takes the columns the main street's south
    // probe would have read, so those stations have one speaking flank and one
    // silent one — the shape of Kai's citadel crossing. A qualified run either
    // side must carry through them rather than leave a one-block ridge across
    // an otherwise repaired road.
    const base = inputFor(crossroads(), () => 90);
    const before = gradeStreetDatum(base);
    const out = harmonize(base, before, (x, z) => {
      if (!bothFlanks(x, z)) return undefined;
      if (z > 0 && Math.abs(x) <= INNER) return undefined; // the lane, to the south
      return 89;
    });
    const main = out.segments.find((s) => s.id === "main");
    expect(main).toBeDefined();
    expect(main?.carried).toBeGreaterThan(0);
    // …and the crossing is at the run's level, not one above it.
    expect(levelAt(out.datum, "main", 0, 0)).toBe(89);
  });

  it("does not carry through a crossing where both flanks fall silent", () => {
    // Nothing spoke there at all, so nothing is known about it: a plaza, a
    // district edge and a full crossroads are the same silence, and the grade
    // cap — not this rule — is what bridges them.
    const base = inputFor(crossroads(), () => 90);
    const before = gradeStreetDatum(base);
    const out = harmonize(base, before, (x, z) =>
      bothFlanks(x, z) && Math.abs(x) > INNER ? 89 : undefined,
    );
    expect(out.segments.find((s) => s.id === "main")?.carried).toBe(0);
  });

  it("cannot start a run out of carried stations alone", () => {
    const base = inputFor(oneStreet(), () => 90);
    const before = gradeStreetDatum(base);
    // Only the north flank ever elects anything, anywhere: every station is at
    // best permitting, and permitting alone is not an ask.
    const out = harmonize(base, before, (x, z) =>
      bothFlanks(x, z) && z < 0 ? 89 : undefined,
    );
    expect(out.asked).toBe(0);
  });

  it("leaves a city cell alone — a cell is one terrace by law", () => {
    const base: StreetDatumInput = { ...inputFor(oneStreet(), () => 94), planeY: 90 };
    const before = gradeStreetDatum(base);
    const out = harmonize(base, before, planes(89, bothFlanks));
    expect(out).toEqual({ datum: before, segments: [], asked: 0, moved: 0 });
    for (const y of before.bySegment.get("main")?.y ?? []) expect(y).toBe(90);
  });
});

describe("determinism", () => {
  it("gives the same answer twice, down to the raster", () => {
    const base = inputFor(crossroads(), (x, z) => 92 + x * 0.3 - z * 0.2);
    const lip = (x: number, z: number): boolean => bothFlanks(x, z) && x >= -12 && x <= 12;
    const one = harmonize(base, gradeStreetDatum(base), planes(88, lip));
    const two = harmonize(base, gradeStreetDatum(base), planes(88, lip));
    expect(one.segments).toEqual(two.segments);
    expect([...one.datum.columnY]).toEqual([...two.datum.columnY]);
    expect([...one.datum.band]).toEqual([...two.datum.band]);
  });

  it("does not re-grade a district whose planes already agree", () => {
    const base = inputFor(oneStreet(), () => 90);
    const before = gradeStreetDatum(base);
    const out = harmonize(base, before, planes(90, bothFlanks));
    expect(out.datum).toBe(before);
  });
});
