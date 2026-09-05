import { describe, expect, it } from "vitest";

import { HeightField, centeredRegion, type Region } from "../src/field/index.js";
import {
  COAST_ANCHOR_OVERSHOOT,
  applyEdits,
  compassBearing,
  footprintHas,
  lowestEdgeColumn,
  nearestMaskColumn,
  preliminaryOceanMask,
  reportDryCarves,
  resolveCourseAnchors,
  type EditContext,
  type TerrainEdit,
} from "../src/edits/index.js";
import { computeOceanMask } from "../src/classify/index.js";

const W = 128;
const SEA = 63;
const REGION: Region = centeredRegion(W, W);

function ctx(region: Region = REGION): EditContext {
  return { region, worldSeed: 813205n, parentPath: "world.terrain", seaLevel: SEA };
}

/**
 * A map whose sea comes up in the **west**: every column with `i < shore` is at
 * y=50, everything east of it is a plateau at y=90. The coastline is therefore
 * the straight line `i = shore`, which makes "nearest ocean column" a number a
 * test can state rather than a number a test has to trust.
 */
function westCoast(shore = 24, region: Region = REGION): HeightField {
  const f = new HeightField(region);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      f.values[j * region.width + i] = i < shore ? 50 : 90;
    }
  }
  return f;
}

/** An all-land map — nothing anywhere dips below sea level. */
function drySlab(region: Region = REGION): HeightField {
  const f = new HeightField(region);
  f.values.fill(90);
  // A dimple on the north edge, so `lowestEdgeColumn` has a unique answer.
  f.values[0 * region.width + 40] = 70;
  return f;
}

describe("preliminaryOceanMask", () => {
  it("is the edge-connected below-sea set", () => {
    const field = westCoast();
    const mask = preliminaryOceanMask(field, SEA);
    let count = 0;
    for (const b of mask) count += b;
    expect(count).toBe(24 * W);
    expect(mask[0]).toBe(1);
    expect(mask[23]).toBe(1);
    expect(mask[24]).toBe(0);
  });

  it("agrees with the classifier's ocean fill when no carve blocks it", () => {
    const field = westCoast();
    const mine = preliminaryOceanMask(field, SEA);
    const theirs = computeOceanMask(field, SEA).mask;
    expect(Array.from(mine)).toEqual(Array.from(theirs));
  });

  it("leaves a landlocked hollow dry", () => {
    const field = westCoast();
    for (let j = 60; j < 70; j++) {
      for (let i = 60; i < 70; i++) field.values[j * W + i] = 40;
    }
    const mask = preliminaryOceanMask(field, SEA);
    expect(mask[65 * W + 65]).toBe(0);
  });

  it("is empty on a map with no sea at all", () => {
    expect(preliminaryOceanMask(drySlab(), SEA).some((b) => b === 1)).toBe(false);
  });
});

describe("resolveCourseAnchors", () => {
  const field = westCoast();
  const mask = preliminaryOceanMask(field, SEA);
  const { x0, z0 } = REGION;

  it("snaps a trailing anchor to the nearest ocean column, then overshoots into it", () => {
    // Previous waypoint is due east of the shore at row j = 64.
    const course = resolveCourseAnchors(field, [[0.5, 0.5], "coast"], mask);
    expect(course[0]).toEqual([0.5, 0.5]);
    const [fx, fz] = course[1] as readonly [number, number];
    const x = x0 + fx * W;
    const z = z0 + fz * W;
    // The nearest wet column to (i=64, j=64) is (i=23, j=64); the overshoot then
    // carries the endpoint another 8 blocks further west along the same bearing.
    expect(x).toBeCloseTo(x0 + 23 - COAST_ANCHOR_OVERSHOOT, 6);
    expect(z).toBeCloseTo(z0 + 64, 6);
    expect(mask[64 * W + Math.round(x - x0 + COAST_ANCHOR_OVERSHOOT)]).toBe(1);
  });

  it("resolves a leading anchor the same way, off the second waypoint", () => {
    const course = resolveCourseAnchors(field, ["coast", [0.75, 0.25]], mask);
    expect(course[1]).toEqual([0.75, 0.25]);
    const [fx, fz] = course[0] as readonly [number, number];
    expect(x0 + fx * W).toBeLessThan(x0 + 24);
    // The bearing runs from (96, 32) to the shore at row 32, so the row holds.
    expect(z0 + fz * W).toBeCloseTo(z0 + 32, 6);
  });

  it("leaves an anchor-free course untouched", () => {
    const course = resolveCourseAnchors(
      field,
      [
        [0.2, 0.3],
        [0.4, 0.5],
        [0.9, 0.1],
      ],
      mask,
    );
    expect(course).toEqual([
      [0.2, 0.3],
      [0.4, 0.5],
      [0.9, 0.1],
    ]);
  });

  it("falls back to the lowest edge column when the map has no ocean", () => {
    const dry = drySlab();
    const low = lowestEdgeColumn(dry);
    expect(low).toEqual({ x: REGION.x0 + 40, z: REGION.z0 });
    const course = resolveCourseAnchors(dry, [[0.5, 0.5], "coast"], null);
    const [fx, fz] = course[1] as readonly [number, number];
    // Aimed at the low edge point, and past it — so clamped onto the border.
    expect(REGION.z0 + fz * W).toBeLessThanOrEqual(REGION.z0 + 1);
    expect(REGION.x0 + fx * W).toBeGreaterThan(REGION.x0 + 30);
  });

  it("prefers the sea ahead of the course over nearer sea behind it", () => {
    // Water on *both* sides: the west coast at i<24 and an eastern sea at i>=104.
    const twoSeas = westCoast();
    for (let j = 0; j < W; j++) {
      for (let i = 104; i < W; i++) twoSeas.values[j * W + i] = 50;
    }
    const both = preliminaryOceanMask(twoSeas, SEA);
    // The course starts hard against the eastern sea and runs west. The nearest
    // water to its last waypoint is behind it; the water it is aimed at is not.
    const course = resolveCourseAnchors(
      twoSeas,
      [
        [0.9, 0.5],
        [0.35, 0.5],
        "coast",
      ],
      both,
    );
    // Travelling west, so it must resolve onto the western shore even though it
    // started next to the eastern one.
    expect(x0 + (course[2] as readonly [number, number])[0] * W).toBeLessThan(x0 + 24);
  });

  it("takes the sea behind it when there is no sea ahead", () => {
    const course = resolveCourseAnchors(
      field,
      [
        [0.3, 0.5],
        [0.9, 0.5],
        "coast",
      ],
      mask,
    );
    // Heading due east away from the only ocean on the map — it still lands on
    // the western shore, because a dry endpoint would help nobody.
    expect(x0 + (course[2] as readonly [number, number])[0] * W).toBeLessThan(x0 + 24);
  });

  it("is deterministic and side-effect free", () => {
    const a = resolveCourseAnchors(field, [[0.5, 0.5], "coast"], mask);
    const b = resolveCourseAnchors(field, [[0.5, 0.5], "coast"], mask);
    expect(a).toEqual(b);
  });
});

describe("nearestMaskColumn", () => {
  it("returns null for an empty mask", () => {
    const field = westCoast();
    expect(nearestMaskColumn(field, new Uint8Array(W * W), { x: 0, z: 0 })).toBeNull();
  });

  it("breaks ties toward the lowest grid index", () => {
    const field = westCoast();
    const mask = new Uint8Array(W * W);
    mask[10 * W + 20] = 1;
    mask[30 * W + 20] = 1;
    // Exactly between the two candidates in z.
    const p = nearestMaskColumn(field, mask, { x: REGION.x0 + 20, z: REGION.z0 + 20 });
    expect(p).toEqual({ x: REGION.x0 + 20, z: REGION.z0 + 10 });
  });
});

describe("applyEdits with a coast anchor", () => {
  /** A valley aimed at the *wrong* edge — the north — on a west-coast map. */
  const misaimed: TerrainEdit = {
    id: "cove",
    verb: "valley",
    course: [
      [0.5, 0.5],
      [0.5, 0.0],
    ],
    width: 24,
    depth: 40,
  };

  /** The same cove, aimed with the anchor instead of a guess. */
  const anchored: TerrainEdit = {
    id: "cove",
    verb: "valley",
    course: [[0.5, 0.5], "coast"],
    width: 24,
    depth: 40,
  };

  function flooded(edit: TerrainEdit): number {
    const field = westCoast();
    const out = applyEdits(field, [edit], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    const fp = out.footprints[0]!;
    let wet = 0;
    for (let idx = 0; idx < W * W; idx++) {
      if (footprintHas(fp, idx) && ocean[idx] === 1) wet++;
    }
    return wet;
  }

  it("the misaimed guess floods nothing", () => {
    expect(flooded(misaimed)).toBe(0);
  });

  it("the anchored course opens onto the real sea", () => {
    expect(flooded(anchored)).toBeGreaterThan(0);
  });

  it("records the carve as coast-anchored", () => {
    const field = westCoast();
    const out = applyEdits(field, [anchored], ctx());
    expect(out.carves).toEqual([
      { editId: "cove", verb: "valley", flooded: "auto", coastAnchored: true },
    ]);
  });

  it("produces a byte-identical field across two runs", () => {
    const a = westCoast();
    const b = westCoast();
    applyEdits(a, [anchored], ctx());
    applyEdits(b, [anchored], ctx());
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
  });

  it("resolves the anchor against the raises, not the base field", () => {
    // An island raised across the western shallows moves the coastline east;
    // the anchor must land on the *new* coast, since raises compose first.
    const field = westCoast();
    const edits: TerrainEdit[] = [
      { id: "bar", verb: "island", at: [0.09, 0.5], radius: 40, height: 40, irregularity: 0 },
      anchored,
    ];
    const out = applyEdits(field, edits, ctx());
    const fp = out.footprints.find((f) => f.editId === "cove")!;
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    let wet = 0;
    for (let idx = 0; idx < W * W; idx++) {
      if (footprintHas(fp, idx) && ocean[idx] === 1) wet++;
    }
    expect(wet).toBeGreaterThan(0);
  });
});

describe("reportDryCarves — LOAM-T113", () => {
  const misaimed: TerrainEdit = {
    id: "cove",
    verb: "valley",
    course: [
      [0.7, 0.5],
      [0.7, 0.1],
    ],
    width: 24,
    depth: 20,
  };

  it("fires on a landlocked valley, with the distance and bearing to the real coast", () => {
    const field = westCoast();
    const out = applyEdits(field, [misaimed], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    const dry = reportDryCarves(field, out, { seaLevel: SEA, oceanMask: ocean });
    expect(dry).toHaveLength(1);
    expect(dry[0]!.editId).toBe("cove");
    // The coast is a straight north–south line to the west of everything here.
    expect(dry[0]!.direction).toBe("west");
    expect(dry[0]!.distance).toBeGreaterThan(0);

    const note = out.diagnostics.find((d) => d.code === "LOAM-T113");
    expect(note?.severity).toBe("note");
    expect(note?.editId).toBe("cove");
    expect(note?.message).toContain('valley "cove"');
    expect(note?.message).toContain("compiled dry");
    expect(note?.message).toContain(`${dry[0]!.distance} blocks west`);
  });

  it("stays quiet when the carve reaches the sea", () => {
    const field = westCoast();
    const out = applyEdits(field, [{ ...misaimed, course: [[0.7, 0.5], "coast"] }], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    expect(reportDryCarves(field, out, { seaLevel: SEA, oceanMask: ocean })).toHaveLength(0);
  });

  it('stays quiet for a carve that asked for "never"', () => {
    const field = westCoast();
    const out = applyEdits(field, [{ ...misaimed, flooded: "never" }], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    expect(reportDryCarves(field, out, { seaLevel: SEA, oceanMask: ocean })).toHaveLength(0);
  });

  it("says so plainly when the map has no ocean at all", () => {
    const field = drySlab();
    const out = applyEdits(field, [misaimed], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    const dry = reportDryCarves(field, out, { seaLevel: SEA, oceanMask: ocean });
    expect(dry).toEqual([{ editId: "cove", distance: null, direction: null }]);
    expect(out.diagnostics.find((d) => d.code === "LOAM-T113")?.message).toContain(
      "no ocean anywhere",
    );
  });

  it("defers to LOAM-T112 for a river that beaded into ponds", () => {
    const field = drySlab();
    const river: TerrainEdit = {
      id: "brook",
      verb: "river",
      course: [
        [0.2, 0.2],
        [0.8, 0.8],
      ],
    };
    const out = applyEdits(field, [river], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    out.diagnostics.push({ code: "LOAM-T112", editId: "brook", severity: "note", message: "" });
    expect(reportDryCarves(field, out, { seaLevel: SEA, oceanMask: ocean })).toHaveLength(0);
  });

  it("is deterministic", () => {
    const one = westCoast();
    const two = westCoast();
    const a = applyEdits(one, [misaimed], ctx());
    const b = applyEdits(two, [misaimed], ctx());
    const ma = computeOceanMask(one, SEA, a.noFlood).mask;
    const mb = computeOceanMask(two, SEA, b.noFlood).mask;
    expect(reportDryCarves(one, a, { seaLevel: SEA, oceanMask: ma })).toEqual(
      reportDryCarves(two, b, { seaLevel: SEA, oceanMask: mb }),
    );
    expect(a.diagnostics).toEqual(b.diagnostics);
  });
});

describe("compassBearing", () => {
  it("names the eight sectors, with north at −Z", () => {
    expect(compassBearing(0, -10)).toBe("north");
    expect(compassBearing(0, 10)).toBe("south");
    expect(compassBearing(10, 0)).toBe("east");
    expect(compassBearing(-10, 0)).toBe("west");
    expect(compassBearing(10, -10)).toBe("north-east");
    expect(compassBearing(-10, 10)).toBe("south-west");
  });
});

describe("reportDryCarves — LOAM-I502, the mostly dry carve", () => {
  // A valley from the west coast inland: over the shore columns (height 50)
  // it is under the sea; inland the land stands at 90 and a 20-deep valley
  // floors at 70, seven blocks above the water. The mouth is wet, the
  // course is dry — the fjord of the Stocktake Run's probe pass 2.
  const inland: TerrainEdit = {
    id: "fjord",
    verb: "valley",
    course: [
      [0.05, 0.5],
      [0.95, 0.5],
    ],
    width: 24,
    depth: 20,
  };
  it("names a carve whose mouth reaches the sea while its course stands above it", () => {
    const field = westCoast();
    const out = applyEdits(field, [inland], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    const dry = reportDryCarves(field, out, { seaLevel: SEA, oceanMask: ocean });
    expect(dry).toHaveLength(0);
    expect(out.diagnostics.find((d) => d.code === "LOAM-T113")).toBeUndefined();
    const note = out.diagnostics.find((d) => d.code === "LOAM-I502");
    expect(note?.severity).toBe("note");
    expect(note?.editId).toBe("fjord");
    expect(note?.message).toContain("mostly dry");
    expect(note?.message).toMatch(/\d+ of \d+ points along its floor reach the sea/);
    expect(note?.message).toMatch(/up to \d+ blocks above sea level/);
  });
  it("stays quiet when the carve floods along its whole floor", () => {
    // A channel lying wholly over the shore columns (height 50): every floor
    // sample is under the sea and connected to it.
    const field = westCoast();
    const out = applyEdits(field, [{ ...inland, id: "sound", course: [[0.02, 0.3], [0.15, 0.7]] }], ctx());
    const ocean = computeOceanMask(field, SEA, out.noFlood).mask;
    reportDryCarves(field, out, { seaLevel: SEA, oceanMask: ocean });
    expect(out.diagnostics.find((d) => d.code === "LOAM-I502")).toBeUndefined();
    expect(out.diagnostics.find((d) => d.code === "LOAM-T113")).toBeUndefined();
  });
});
