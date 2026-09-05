/**
 * `structures/fabric-hull.ts` — **the wall's reference frame**.
 *
 * Ratified 2026-08-11, after Kai walked Troy: a walled city's circuit used to be
 * drawn round the settlement's *envelope* — the rectangle the layout solver
 * reserved — while the fabric packed to its own footprint somewhere inside it,
 * leaving a band of grass between the last houses and the wall wider than the
 * city's quarters. The wall now hugs the fabric: `margin` is measured from the
 * city's edge, which is the hull of what was actually built.
 *
 * What is tested here is the derivation alone. The three properties that made
 * the old frame defensible have to survive it — a hull that encloses every
 * building, a course that still finds its gates where a carriageway crosses,
 * and a sane answer for a precinct with nothing in it — and the new one has to
 * actually kill the lawn.
 */

import { describe, expect, it } from "vitest";

import { FABRIC_MIN_SPAN, fabricExtent, type FabricField } from "../src/structures/fabric-hull.js";
import {
  deriveWallCourse,
  findGates,
  type CoursePoint
} from "../src/structures/wall-course.js";
import { extentOfRects, type ExtentRect } from "../src/structures/walls.js";

const REGION = { x0: 0, z0: 0, width: 512, depth: 512 };
const BOUNDS = REGION;

/** Winding test against a convex polygon, in either winding order. */
function insidePolygon(vertices: readonly CoursePoint[], p: CoursePoint): boolean {
  let positive = false;
  let negative = false;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i] as CoursePoint;
    const b = vertices[(i + 1) % vertices.length] as CoursePoint;
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (cross > 0) positive = true;
    if (cross < 0) negative = true;
  }
  return !(positive && negative);
}

/** A paved field from an explicit column set. */
function pavedField(columns: Iterable<CoursePoint>): FabricField {
  const set = new Set<string>();
  for (const c of columns) set.add(`${c.x},${c.z}`);
  return { region: REGION, paved: (x, z): boolean => set.has(`${x},${z}`) };
}

/** Every column of a rectangle, for a paved field. */
function fill(rect: ExtentRect): CoursePoint[] {
  const out: CoursePoint[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, z });
  }
  return out;
}

/** Distance from a column to the nearest of a set of rectangles. */
function distanceTo(rects: readonly ExtentRect[], p: CoursePoint): number {
  return Math.min(
    ...rects.map((r) =>
      Math.hypot(
        Math.max(r.x0 - p.x, 0, p.x - r.x1),
        Math.max(r.z0 - p.z, 0, p.z - r.z1),
      ),
    ),
  );
}

/**
 * A quarter the solver gave far more ground than the fabric used: a 300-column
 * reservation with the blocks packed into a hundred of it, which is Troy's
 * shape and the reason this file exists.
 */
const SPRAWLING_CLIP: ExtentRect = { x0: 60, z0: 60, x1: 360, z1: 360 };
const PACKED_BUILDINGS: readonly ExtentRect[] = [
  { x0: 140, z0: 140, x1: 160, z1: 160 },
  { x0: 170, z0: 140, x1: 190, z1: 165 },
  { x0: 140, z0: 170, x1: 165, z1: 195 },
  { x0: 175, z0: 175, x1: 200, z1: 200 },
  { x0: 205, z0: 150, x1: 225, z1: 175 }
];

describe("fabricExtent — the wall's reference frame", () => {
  it("measures the margin from the fabric, not from the reservation", () => {
    const margin = 10;
    const extent = fabricExtent({ clip: [SPRAWLING_CLIP], buildings: PACKED_BUILDINGS, margin });
    const hugging = deriveWallCourse({ extent, margin, bounds: BOUNDS });
    const envelope = deriveWallCourse({
      extent: extentOfRects([SPRAWLING_CLIP, ...PACKED_BUILDINGS]),
      margin,
      bounds: BOUNDS
    });
    expect(hugging).toBeDefined();
    expect(envelope).toBeDefined();
    const tight = hugging as NonNullable<typeof hugging>;
    const loose = envelope as NonNullable<typeof envelope>;

    // The lawn, as a number. Under the old frame the ring stood a hundred
    // columns off the nearest house; under the new one it stands the margin off
    // it, less the corner-cutting a 15°-quantized hull does at a diagonal.
    const lawn = tight.path.map((p) => distanceTo(PACKED_BUILDINGS, p)).sort((a, b) => a - b);
    const before = loose.path.map((p) => distanceTo(PACKED_BUILDINGS, p)).sort((a, b) => a - b);
    // Typically the margin, less the corner-cutting a 15°-quantized hull does
    // at a diagonal; at worst twice it, over a notch in a non-convex cluster —
    // the residue of the hull being convex, and a tenth of what the envelope
    // frame left. See the module note for why the hull stays convex.
    expect(lawn[lawn.length >> 1] as number).toBeLessThanOrEqual(margin + 4);
    expect(lawn[lawn.length - 1] as number).toBeLessThanOrEqual(2 * margin);
    expect(before[before.length - 1] as number).toBeGreaterThan(100);
    expect(tight.area).toBeLessThan(loose.area / 3);
  });

  it("still encloses every building it was given", () => {
    const extent = fabricExtent({ clip: [SPRAWLING_CLIP], buildings: PACKED_BUILDINGS, margin: 10 });
    const course = deriveWallCourse({ extent, margin: 10, bounds: BOUNDS });
    const c = course as NonNullable<typeof course>;
    for (const corner of extentOfRects(PACKED_BUILDINGS)) {
      expect(insidePolygon(c.vertices, corner), `${corner.x},${corner.z}`).toBe(true);
    }
  });

  it("takes in the lane that hugs the fabric and ignores the road out of town", () => {
    const margin = 10;
    // A ring lane six columns off the last houses — the town's own edge, which
    // has to be *inside* the wall or the circuit stands on a carriageway and
    // dissolves into one enormous gate. And an approach road running away to
    // the far side of the reservation, which is not the town and must not drag
    // the hull out after it.
    const lane = fill({ x0: 130, z0: 206, x1: 235, z1: 206 });
    const highway = fill({ x0: 226, z0: 160, x1: 355, z1: 162 });
    const extent = fabricExtent({
      clip: [SPRAWLING_CLIP],
      buildings: PACKED_BUILDINGS,
      margin,
      field: pavedField([...lane, ...highway])
    });
    const course = deriveWallCourse({ extent, margin, bounds: BOUNDS });
    const c = course as NonNullable<typeof course>;
    expect(insidePolygon(c.vertices, { x: 180, z: 206 })).toBe(true);
    // The highway is followed for a margin's reach and then let go: the course
    // stays near the town rather than chasing the road to the envelope edge.
    expect(Math.max(...c.path.map((p) => p.x))).toBeLessThan(225 + 3 * margin);
  });

  it("clips the paved field to the precinct, which is what makes nesting work", () => {
    // Two circuits on one town: the city, and a citadel inside it. Each is
    // handed its own window, and the paved ground outside that window — the
    // other precinct's streets — is not its fabric.
    const citadel: ExtentRect = { x0: 140, z0: 140, x1: 200, z1: 200 };
    const city: ExtentRect = SPRAWLING_CLIP;
    const streets = pavedField(fill({ x0: 100, z0: 240, x1: 300, z1: 260 }));
    const citadelExtent = fabricExtent({
      clip: [citadel],
      buildings: PACKED_BUILDINGS.filter((b) => b.x1 <= 200 && b.z1 <= 200),
      margin: 10,
      field: streets
    });
    const cityExtent = fabricExtent({
      clip: [city],
      buildings: PACKED_BUILDINGS,
      margin: 10,
      field: streets
    });
    const inner = deriveWallCourse({ extent: citadelExtent, margin: 10, bounds: BOUNDS });
    const outer = deriveWallCourse({ extent: cityExtent, margin: 10, bounds: BOUNDS });
    const i = inner as NonNullable<typeof inner>;
    const o = outer as NonNullable<typeof outer>;
    expect(i.area).toBeLessThan(o.area);
    // The inner ring is inside the outer one, corner for corner.
    for (const v of i.vertices) expect(insidePolygon(o.vertices, v)).toBe(true);
    // …and the citadel never saw the city's street, which lies outside its own
    // window: nothing of its course reaches the street's row.
    expect(Math.max(...i.path.map((p) => p.z))).toBeLessThan(240);
  });

  it("is a pure function of its input, and blind to the order it is given in", () => {
    const field = pavedField(fill({ x0: 130, z0: 206, x1: 235, z1: 206 }));
    const one = fabricExtent({
      clip: [SPRAWLING_CLIP],
      buildings: PACKED_BUILDINGS,
      margin: 10,
      field
    });
    const two = fabricExtent({
      clip: [SPRAWLING_CLIP],
      buildings: PACKED_BUILDINGS,
      margin: 10,
      field
    });
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    // Permuting the buildings can pick a different extreme *column* on a tie —
    // what may not change is the polygon, because a support hull reads only the
    // maximum in each of the twenty-four directions.
    const shuffled = fabricExtent({
      clip: [SPRAWLING_CLIP],
      buildings: [...PACKED_BUILDINGS].reverse(),
      margin: 10,
      field
    });
    expect(JSON.stringify(deriveWallCourse({ extent: shuffled, margin: 10, bounds: BOUNDS }))).toBe(
      JSON.stringify(deriveWallCourse({ extent: one, margin: 10, bounds: BOUNDS })),
    );
  });

  it("gives the same hull as handing over every column of the fabric", () => {
    // The reduction to twenty-four extreme columns is exact, not an
    // approximation — which is what makes scanning a precinct affordable.
    const dense = PACKED_BUILDINGS.flatMap(fill);
    const reduced = fabricExtent({ clip: [SPRAWLING_CLIP], buildings: PACKED_BUILDINGS, margin: 10 });
    expect(JSON.stringify(deriveWallCourse({ extent: reduced, margin: 10, bounds: BOUNDS }))).toBe(
      JSON.stringify(deriveWallCourse({ extent: dense, margin: 10, bounds: BOUNDS })),
    );
  });

  it("falls back to the reservation when there is no fabric to hug", () => {
    // A quarter the solver never filled: nothing was built, so the reservation
    // is the only statement of extent there is — the frame this file replaced,
    // kept as the degenerate answer rather than a diagnostic.
    expect(fabricExtent({ clip: [SPRAWLING_CLIP], buildings: [], margin: 10 })).toEqual(
      extentOfRects([SPRAWLING_CLIP]),
    );
    // A hamlet: three sheds is not a city edge, and a ring drawn round it would
    // be smaller than the course pass will accept at all.
    const hamlet: ExtentRect[] = [{ x0: 200, z0: 200, x1: 208, z1: 208 }];
    expect(fabricExtent({ clip: [SPRAWLING_CLIP], buildings: hamlet, margin: 10 })).toEqual(
      extentOfRects([SPRAWLING_CLIP, ...hamlet]),
    );
    // The threshold is a span, and a fabric just over it keeps its own hull.
    const big: ExtentRect[] = [
      { x0: 200, z0: 200, x1: 200 + FABRIC_MIN_SPAN + 2, z1: 200 + FABRIC_MIN_SPAN + 2 }
    ];
    expect(fabricExtent({ clip: [SPRAWLING_CLIP], buildings: big, margin: 10 })).not.toEqual(
      extentOfRects([SPRAWLING_CLIP, ...big]),
    );
  });

  it("keeps a gate wherever a carriageway crosses the tightened course", () => {
    const margin = 10;
    const extent = fabricExtent({ clip: [SPRAWLING_CLIP], buildings: PACKED_BUILDINGS, margin });
    const course = deriveWallCourse({ extent, margin, bounds: BOUNDS });
    const path = (course as NonNullable<typeof course>).path;
    // A three-wide carriageway laid along the road's true columns, i.e. found
    // on the course rather than declared on it — exactly what the pass does
    // with the road masks.
    const crossing = new Set(path.slice(20, 23).map((p) => `${p.x},${p.z}`));
    const gates = findGates(path, (x, z) => crossing.has(`${x},${z}`));
    expect(gates).toHaveLength(1);
    const gate = gates[0] as NonNullable<(typeof gates)[0]>;
    expect(gate.width).toBe(5);
    // The opening sits on the road, which is the whole rule: a gate is found,
    // never sited.
    expect(crossing.has(`${(path[gate.centre] as CoursePoint).x},${(path[gate.centre] as CoursePoint).z}`)).toBe(true);
  });
});
