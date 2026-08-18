/**
 * The frontage record and the flag — `docs/GROUND-UNIFICATION-v0.md` Part I,
 * wave 8B.
 *
 * Three things are asserted here, and the third is the one that matters:
 *
 * - **the flag is off**, and the constants are the design's numbers rather than
 *   numbers somebody liked. `FRONTAGE_TIE = false` is what makes 8B
 *   byte-identical, and `test/ground-equivalence.test.ts` is the harness that
 *   proves the claim across every world.
 * - **the anchor is the front edge's midpoint** (F4), at the same `floor`
 *   midpoint `streetBehind` probes from, and the reach is the same reach — so a
 *   lot the fabric believes is on a street is asked about at the column the
 *   fabric asked about.
 * - **the tied branch computes the design's answer** — F4's seat, F5's corner
 *   rule and F6's untied case. The branch is tested through the exported pure
 *   function, never by flipping the module-level flag: a test that mutates a
 *   `const` is a test of the test harness.
 */

import { describe, expect, it } from "vitest";

import { HeightField, type Region } from "@terrainist/stdlib";

import {
  STREET_PROBE_SLACK,
  frontAnchorOf,
  frontageOf,
  frontageReach,
  frontageSeat,
} from "../src/layout/district.js";
import { gradeStreetDatum, type StreetDatum } from "../src/layout/street-datum.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import {
  CORNER_TOLERANCE,
  FRONTAGE_CUT_MAX,
  FRONTAGE_RISE,
  FRONTAGE_TIE,
} from "../src/layout/types.js";
import { RETAIN_MAX } from "../src/layout/levels.js";
import { TERRAIN_DIAGNOSTICS } from "@terrainist/spec";

const SEA = 63;
const SIZE = 64;

function region(size = SIZE): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function field(r: Region, h: (x: number, z: number) => number): HeightField {
  const f = new HeightField(r);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      f.values[j * r.width + i] = h(r.x0 + i, r.z0 + j);
    }
  }
  return f;
}

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

/** An east-west avenue crossed by a north-south lane at the origin. */
function crossroads(): StreetGraph {
  return {
    segments: [
      segment("avenue", "avenue", 7, run({ x: -24, z: 0 }, { x: 24, z: 0 })),
      segment("lane", "lane", 3, run({ x: 0, z: -24 }, { x: 0, z: 24 })),
    ],
    intersections: [{ x: 0, z: 0, segments: ["avenue", "lane"] }],
    sidewalk: 2,
  };
}

function grade(graph: StreetGraph, h: (x: number, z: number) => number): StreetDatum {
  const r = region();
  return gradeStreetDatum({ region: r, graph, field: field(r, h), seaLevel: SEA });
}

/* -------------------------------------------------------------------------- */

describe("frontage tie: the flag and the constants", () => {
  it("ships on from wave 8F — the flip, and the end of byte-identity", () => {
    // 8A–8E were byte-identical *because* this was false; 8F flips it, and §7's
    // walk-gate table is the reason the flip is its own wave. A test that reads
    // `false` again means somebody reverted the tie, not that a golden moved.
    expect(FRONTAGE_TIE).toBe(true);
  });

  it("carries the design's numbers, and the cut cap is derived from RETAIN_MAX", () => {
    // F4: a lot flush with its street puts its threshold one block above the
    // pavement, which is a doorstep. F5: two blocks. F7: the deepest cut a lot
    // may make is the deepest face the retaining table will build, so a tied lot
    // can never ask for a wall the wall pass refuses.
    expect({ FRONTAGE_RISE, CORNER_TOLERANCE, FRONTAGE_CUT_MAX }).toEqual({
      FRONTAGE_RISE: 0,
      CORNER_TOLERANCE: 2,
      FRONTAGE_CUT_MAX: RETAIN_MAX,
    });
  });

  it("registers T237 and T238 in the T23x block", () => {
    expect(TERRAIN_DIAGNOSTICS.FRONTAGE_TIE_DRIFT).toBe("LOAM-T237");
    expect(TERRAIN_DIAGNOSTICS.FRONTAGE_UNTIED).toBe("LOAM-T238");
    expect(TERRAIN_DIAGNOSTICS.LINEWORK_BED_INTERRUPTED).toBe("LOAM-T236");
  });
});

describe("frontage tie: the anchor and the reach", () => {
  const rect = { x0: 10, z0: 20, x1: 20, z1: 32 };

  it("is the midpoint of the face edge, on the face's own line", () => {
    expect(frontAnchorOf(rect, "south")).toEqual({ x: 15, z: 32 });
    expect(frontAnchorOf(rect, "north")).toEqual({ x: 15, z: 20 });
    expect(frontAnchorOf(rect, "west")).toEqual({ x: 10, z: 26 });
    expect(frontAnchorOf(rect, "east")).toEqual({ x: 20, z: 26 });
  });

  it("reaches exactly as far as streetBehind probes", () => {
    expect(frontageReach(2)).toBe(2 + STREET_PROBE_SLACK);
    expect(frontageReach(0)).toBe(STREET_PROBE_SLACK);
  });
});

describe("frontage tie: the tied branch (F4/F5/F6)", () => {
  // A hill falling to the east: the avenue's level changes along its own run, so
  // "the street's level" is a different number at each lot rather than one
  // number the test could have got right by accident.
  const hill = (x: number, _z: number): number => 80 - Math.floor(x / 4);

  it("seats a lot at its own street's level, not its footprint's median", () => {
    const datum = grade(crossroads(), hill);
    // A lot on the north side of the avenue, facing south onto it. Its rect runs
    // back up the hill; its median is not its frontage.
    const rect = { x0: -20, z0: -14, x1: -8, z1: -6 };
    const anchor = frontAnchorOf(rect, "south");
    const street = datum.levelNear(anchor.x, anchor.z, frontageReach(2));
    expect(street).toBeTypeOf("number");
    expect(
      frontageSeat({ rect, face: "south", corner: false, datum, reach: frontageReach(2) }),
    ).toBe((street as number) + FRONTAGE_RISE);
  });

  it("is undefined — untied — when no banded column is in reach (F6)", () => {
    const datum = grade(crossroads(), hill);
    // The far corner of the region: the nearest carriageway is well beyond the
    // sidewalk band plus the slack.
    const rect = { x0: -31, z0: -31, x1: -25, z1: -25 };
    expect(
      frontageSeat({ rect, face: "north", corner: false, datum, reach: frontageReach(2) }),
    ).toBeUndefined();
  });

  it("a corner lot keeps its front street while the flank agrees within tolerance", () => {
    // Flat ground: front and flank grade to the same level, so the corner rule
    // has nothing to arbitrate and F5's "ties to its front, never to its flank"
    // is the whole answer.
    const datum = grade(crossroads(), () => 80);
    const rect = { x0: 4, z0: -14, x1: 16, z1: -6 };
    const reach = frontageReach(2);
    const front = frontageSeat({ rect, face: "south", corner: false, datum, reach });
    expect(frontageSeat({ rect, face: "south", corner: true, datum, reach })).toBe(front);
  });

  it("a corner lot takes the LOWER of the two when they disagree past the tolerance", () => {
    // A synthetic datum: the front street at 80, the flank street four blocks
    // below it — past CORNER_TOLERANCE, so F5 hands the lot the lower plane and
    // the difference becomes a step-up along the side wall.
    const rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
    const frontAnchor = frontAnchorOf(rect, "south");
    const flankAnchor = frontAnchorOf(rect, "west");
    const fake = (frontY: number, flankY: number): StreetDatum =>
      ({
        levelNear: (x: number, z: number) =>
          x === frontAnchor.x && z === frontAnchor.z
            ? frontY
            : x === flankAnchor.x && z === flankAnchor.z
              ? flankY
              : undefined,
      }) as unknown as StreetDatum;

    const seat = (flankY: number, corner = true): number | undefined =>
      frontageSeat({ rect, face: "south", corner, datum: fake(80, flankY), reach: 12 });

    expect(seat(76)).toBe(76); // 4 below: past tolerance, take the lower
    expect(seat(84)).toBe(80); // 4 above: past tolerance, still take the lower
    expect(seat(78)).toBe(80); // 2 below: inside tolerance, the front wins
    expect(seat(82)).toBe(80); // 2 above: inside tolerance, the front wins
    expect(seat(76, false)).toBe(80); // not a corner: the flank is never asked
  });

  it("a silent flank can never create a tie the front did not", () => {
    const rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
    const flankOnly = {
      levelNear: (x: number) => (x === 0 ? 70 : undefined),
    } as unknown as StreetDatum;
    expect(
      frontageSeat({ rect, face: "south", corner: true, datum: flankOnly, reach: 12 }),
    ).toBeUndefined();
  });
});

describe("frontage tie: the record a claim carries (§0.3c)", () => {
  const lot = (street: string, corner: boolean) => ({ street, corner });

  it("keeps the run's street, any lot's corner, and the claim's own anchor", () => {
    const rect = { x0: 0, z0: 0, x1: 12, z1: 8 };
    expect(frontageOf(rect, "south", [lot("s1", true), lot("s1", false)])).toEqual({
      street: "s1",
      corner: true,
      frontAnchor: { x: 6, z: 8 },
    });
    expect(frontageOf(rect, "south", [lot("s1", false), lot("s1", false)]).corner).toBe(false);
    expect(frontageOf(rect, "west", [lot("s2", false)]).frontAnchor).toEqual({ x: 0, z: 4 });
  });

  it("carries a boundary lot's empty street through, which is F6's untied case", () => {
    const rect = { x0: 0, z0: 0, x1: 4, z1: 4 };
    expect(frontageOf(rect, "north", [lot("", false)]).street).toBe("");
    // A claim off a block site that named no lots at all is untied too.
    expect(frontageOf(rect, "north", []).street).toBe("");
  });
});
