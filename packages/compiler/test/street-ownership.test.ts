/**
 * Column ownership in the street surfacer (`docs/COURTYARDS-AND-LEVELS-v0.md`
 * §2, §8.1).
 *
 * The defect these tests pin down is the one a walk found and no unit test
 * could: on stepped ground the surfacer produced pavement at conflicting
 * levels, because it graded each segment against `plan.ground` *as it stood* and
 * then wrote `plan.ground` back, segment by segment, in document order. Both
 * halves were order-dependent. The properties below are what "exactly one
 * owner, decided before anything is written" means operationally:
 *
 * - the rank order is total and is a pure function of the graph, not of the
 *   traversal — width first, so a street meets a boulevard rather than the
 *   reverse, and `steps` below any street of its width, because a flight
 *   arrives at a street and not the other way round;
 * - a pinned grade returns *exactly* the pin and stays 1-Lipschitz, which is
 *   what makes a junction a place a street arrives at rather than steps at;
 * - a flight's endpoints are measured against the landings that will actually
 *   be built;
 * - and, on a real synthetic hillside, a junction between a wide street and a
 *   narrow one is at the wide one's level from both sides, twice over.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { gradeProfile, index, surfaceStreetGraph } from "../src/structures/roads.js";
import {
  KIND_RANK,
  ROLE_RANK,
  claimColumns,
  compareStreetRank,
  pinLevel,
  type StreetRank,
} from "../src/structures/street-owner.js";
import { synthesizeTreads } from "../src/structures/sweep.js";

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

/** A north–south lane crossing an east–west avenue, on a slope. */
function crossroads(): StreetGraph {
  const avenue: { x: number; z: number }[] = [];
  const lane: { x: number; z: number }[] = [];
  for (let x = -30; x <= 30; x++) avenue.push({ x, z: 0 });
  for (let z = -30; z <= 30; z++) lane.push({ x: 0, z });
  const segments: StreetSegment[] = [
    // Document order puts the *narrow* one first, so last-write-wins and rank
    // order disagree — which is the whole point of the fixture.
    { id: "b-lane", kind: "lane", width: 3, path: lane },
    { id: "a-avenue", kind: "avenue", width: 7, path: avenue },
  ];
  return { segments, intersections: [{ x: 0, z: 0, segments: ["a-avenue", "b-lane"] }], sidewalk: 2 };
}

function surface(p: ColumnPlan, graph: StreetGraph) {
  return surfaceStreetGraph({
    graphs: [graph],
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, "world.quarter"),
    theme: "medieval_village",
  });
}

/* -------------------------------------------------------------------------- */
/* 1. the rank order                                                           */
/* -------------------------------------------------------------------------- */

const rank = (
  id: string,
  width: number,
  kind: StreetRank["kind"],
  role: StreetRank["role"] = "carriageway",
): StreetRank => ({ id, width, kind, role });

describe("the ownership rank order", () => {
  it("puts the wider carriageway first, whatever its class", () => {
    // A lane wider than an avenue is a fiction, but the order must not depend
    // on the class agreeing with the width: width is the first key, alone.
    expect(compareStreetRank(rank("a", 9, "lane"), rank("b", 7, "avenue"))).toBeLessThan(0);
    expect(compareStreetRank(rank("z", 7, "avenue"), rank("a", 3, "lane"))).toBeLessThan(0);
  });

  it("ranks a flight of steps below any street of its width", () => {
    // A flight arrives at the street's level; the street does not arrive at the
    // flight's. That is what a landing is.
    expect(
      compareStreetRank(rank("a", 5, "street"), rank("a", 5, "street", "steps")),
    ).toBeLessThan(0);
    // §2.2's *table* prints `steps 1, carriageway 2`, which under "lower tuple
    // wins" says the opposite of the same section's prose. The prose is the
    // requirement — see the note in `street-owner.ts`.
    expect(ROLE_RANK.carriageway).toBeLessThan(ROLE_RANK.steps);
    expect(ROLE_RANK.channel).toBeLessThan(ROLE_RANK.carriageway);
  });

  it("breaks a full tie on the id, lexicographically", () => {
    expect(compareStreetRank(rank("a", 5, "street"), rank("b", 5, "street"))).toBeLessThan(0);
    expect(compareStreetRank(rank("b", 5, "street"), rank("a", 5, "street"))).toBeGreaterThan(0);
    expect(compareStreetRank(rank("a", 5, "street"), rank("a", 5, "street"))).toBe(0);
  });

  it("is total: no two distinct segments of one pass compare equal", () => {
    const all: StreetRank[] = [
      rank("s1", 7, "arterial"),
      rank("s2", 7, "avenue"),
      rank("s3", 5, "street"),
      rank("s4", 5, "street", "steps"),
      rank("s5", 3, "lane"),
      rank("s6", 3, "lane", "channel"),
    ];
    for (const a of all) {
      for (const b of all) {
        if (a.id === b.id) continue;
        expect(compareStreetRank(a, b)).not.toBe(0);
      }
    }
    expect(KIND_RANK.arterial).toBeLessThan(KIND_RANK.lane);
  });

  it("sorts the same however the segments are enumerated", () => {
    const all = [
      rank("s5", 3, "lane"),
      rank("s1", 7, "arterial"),
      rank("s3", 5, "street"),
      rank("s4", 5, "street", "steps"),
    ];
    const forward = [...all].sort(compareStreetRank).map((r) => r.id);
    const backward = [...all].reverse().sort(compareStreetRank).map((r) => r.id);
    expect(backward).toEqual(forward);
    expect(forward).toEqual(["s1", "s3", "s4", "s5"]);
  });
});

describe("claiming", () => {
  it("gives each column to the first claimer and to nobody else", () => {
    const owner = new Int32Array(8).fill(-1);
    expect(claimColumns(owner, [0, 1, 2, 3], 0)).toBe(4);
    expect(claimColumns(owner, [2, 3, 4, 5], 1)).toBe(2);
    expect([...owner]).toEqual([0, 0, 0, 0, 1, 1, -1, -1]);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. pinning                                                                  */
/* -------------------------------------------------------------------------- */

describe("a pinned grade", () => {
  const ground = [80, 81, 84, 88, 90, 90, 86, 82, 80, 79];

  it("returns exactly the pin, and stays 1-Lipschitz", () => {
    const g = [...ground];
    const band = g.map(() => 0);
    const deck = g.map(() => 0);
    // Two pins four columns apart, and compatible with the 1-Lipschitz law:
    // a pair that is not — 95 here and 77 there — is not a pin the grade can
    // honour and the envelope will honestly refuse the lower of them.
    pinLevel(g, band, deck, 4, 93);
    pinLevel(g, band, deck, 8, 89);
    const out = gradeProfile(g, SEA, band, deck);
    expect(out[4]).toBe(93);
    expect(out[8]).toBe(89);
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs((out[i] as number) - (out[i - 1] as number))).toBeLessThanOrEqual(1);
    }
  });

  it("ramps its neighbours to it one block per column, rather than stepping", () => {
    const g = [...ground];
    const band = g.map(() => 0);
    const deck = g.map(() => 0);
    pinLevel(g, band, deck, 0, 90);
    const out = gradeProfile(g, SEA, band, deck);
    expect(out[0]).toBe(90);
    expect(out[1]).toBe(89);
    expect(out[2]).toBe(88);
  });

  it("changes nothing when no index is pinned", () => {
    const plainly = gradeProfile(ground, SEA, 0, 0);
    const g = [...ground];
    const out = gradeProfile(g, SEA, g.map(() => 0), g.map(() => 0));
    expect(out).toEqual(plainly);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the tread law's endpoint pins                                            */
/* -------------------------------------------------------------------------- */

describe("synthesizeTreads with endpoint pins", () => {
  const bank = [70, 70, 71, 72, 73, 74, 75, 75];

  it("is bit-for-bit the old function when neither pin is given", () => {
    expect(synthesizeTreads(bank, { maxFill: 8 })).toEqual(
      synthesizeTreads(bank, { maxFill: 8, reach: 1, maxGrade: 1 }),
    );
  });

  it("lands the top of the flight on the level its landing was given", () => {
    const run = synthesizeTreads(bank, { maxFill: 8, pinLast: 78 });
    expect(run.levels).not.toBeNull();
    const levels = run.levels as readonly number[];
    expect(levels[levels.length - 1]).toBe(78);
    for (let k = 1; k < levels.length; k++) {
      expect(Math.abs((levels[k] as number) - (levels[k - 1] as number))).toBeLessThanOrEqual(1);
      expect(levels[k] as number).toBeGreaterThan(bank[k] as number);
    }
  });

  it("lands the bottom of the flight on its own landing's level", () => {
    const run = synthesizeTreads(bank, { maxFill: 8, pinFirst: 74 });
    const levels = run.levels as readonly number[];
    expect(levels[0]).toBe(74);
    for (let k = 1; k < levels.length; k++) {
      expect(Math.abs((levels[k] as number) - (levels[k - 1] as number))).toBeLessThanOrEqual(1);
    }
  });

  it("refuses the whole run when the two landings cannot be joined", () => {
    // Eight columns cannot climb twenty blocks at one block a column, and half
    // a staircase ending in a twelve-block hop is worse than none.
    const run = synthesizeTreads(bank, { maxFill: 40, pinFirst: 71, pinLast: 95 });
    expect(run.levels).toBeNull();
    expect(run.refusal).toBe("unclimbable");
  });

  it("refuses a landing below the ground the flight stands on", () => {
    expect(synthesizeTreads(bank, { maxFill: 8, pinFirst: 60 }).levels).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 4. the surfacer, on a slope                                                 */
/* -------------------------------------------------------------------------- */

describe("surfaceStreetGraph on stepped ground", () => {
  /** A steady hillside: one block of fall every two columns, both axes. */
  const hill = (x: number, z: number): number => 80 + Math.floor((x + z) / 2);

  it("gives the junction one level, and it is the wider street's", () => {
    const p = plan(region(), hill);
    const before = Int32Array.from(p.ground);
    const result = surface(p, crossroads());
    expect(result.surfacedColumns).toBeGreaterThan(0);

    // The avenue's own profile, graded from the *snapshot* — nothing the lane
    // did can have moved it, because the lane never owned a column of it.
    const r = p.region;
    const avenue = [];
    for (let x = -30; x <= 30; x++) avenue.push(before[index(r, x, 0)] as number);
    const graded = gradeProfile(avenue, p.seaLevel, 0, 0);
    expect(p.ground[index(r, 0, 0)]).toBe(graded[30]);

    // And the lane arrives at it rather than stepping: no 4-neighbouring pair
    // of surfaced columns differs by more than one block.
    for (let z = -28; z <= 28; z++) {
      const here = p.ground[index(r, 0, z)] as number;
      const next = p.ground[index(r, 0, z + 1)] as number;
      expect(Math.abs(next - here), `lane at z=${z}`).toBeLessThanOrEqual(1);
    }
  });

  it("leaves no surfaced column proud of a surfaced neighbour", () => {
    // The walked defect, as an assertion: a column another segment re-cut after
    // its neighbours were graded against it shows up here and nowhere else.
    //
    // **Away from the junction box the bound is one block, and inside it two**,
    // and the exception is real rather than tolerated noise. A pin is applied to
    // a segment's *centre line*, so a street arrives at the level the wider
    // street chose **on the centre line** — but a carriageway is one level
    // across its whole width while the street it crosses grades along its run,
    // so at the outer corner of a junction the two bands legitimately want
    // different numbers and no single pin can satisfy both. Before ownership the
    // same corner was three blocks; the residue is §2's stated limit, not the
    // defect it removes.
    const p = plan(region(), hill);
    const result = surface(p, crossroads());
    const r = p.region;
    const junction = 5;
    for (let j = 1; j < r.depth - 1; j++) {
      for (let i = 1; i < r.width - 1; i++) {
        const k = j * r.width + i;
        if (result.road[k] !== 1) continue;
        const x = r.x0 + i;
        const z = r.z0 + j;
        const corner = Math.abs(x) <= junction && Math.abs(z) <= junction;
        for (const [di, dj] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const k2 = (j + dj) * r.width + (i + di);
          if (result.road[k2] !== 1) continue;
          const drop = Math.abs((p.ground[k2] as number) - (p.ground[k] as number));
          expect(drop, `${x},${z}`).toBeLessThanOrEqual(corner ? 2 : 1);
        }
      }
    }
  });

  it("does not depend on the order the segments are written down in", () => {
    // Ownership is by rank, not by traversal, so reversing document order may
    // change which segment *paints* a shared column but never which one levels
    // it. The ground is the assertion; the paint deliberately is not.
    const forward = plan(region(), hill);
    surface(forward, crossroads());
    const reversed = plan(region(), hill);
    const graph = crossroads();
    surface(reversed, { ...graph, segments: [...graph.segments].reverse() });
    expect([...reversed.ground]).toEqual([...forward.ground]);
  });

  it("is byte-identical across two runs", () => {
    const a = plan(region(), hill);
    const ra = surface(a, crossroads());
    const b = plan(region(), hill);
    const rb = surface(b, crossroads());
    expect([...b.ground]).toEqual([...a.ground]);
    expect([...b.surface]).toEqual([...a.surface]);
    expect(JSON.stringify(rb.blocks)).toBe(JSON.stringify(ra.blocks));
  });

  it("moves nothing on levelled ground — the flat-world identity", () => {
    // A district is pad-levelled before the fabric pass runs, so every
    // segment's input ground is the pad constant and every owner's level is
    // every non-owner's. §2.5's claim, as a test.
    const p = plan(region(), () => 80);
    surface(p, crossroads());
    for (let k = 0; k < p.ground.length; k++) expect(p.ground[k]).toBe(80);
  });
});
