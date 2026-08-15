/**
 * **A segment id is only unique inside the quarter that drew it.**
 *
 * Kai's walk of the Gemini-authored `isles_of_war` (seed 301, 2026-08-15) found
 * the pirate settlement's sidewalks graded four blocks *under* their own
 * carriageway and under every parcel beside them — paved lanes at the bottom of
 * a trench with raw dirt faces up to the lots. The two islands sit at different
 * heights (95 and 91), and 91 was the number the pirate island's sidewalks took.
 *
 * The cause is naming, not grading. A {@link StreetGraph}'s segment ids come from
 * the *form* that drew it, so every `grid`/`organic` quarter in every document
 * calls its runs `ns0…`/`ew0…`. `surfaceStreetGraph` minted its rank ids — and
 * with them the `street:` intent sources §4.1 requires to be unique — out of that
 * id alone, so two quarters in one document collided: `structures/index.ts` keys
 * the arc-levels map on those sources and kept only the **last** district's
 * frames, and `paveSidewalks` then graded one island's bands to the other
 * island's levels.
 *
 * Luna's document for the same prompt was immune by luck: its quarters were
 * `grown` (`cut00…`) and `radial` (`ring1`, `spoke00…`), whose id namespaces
 * happen not to overlap.
 *
 * These fixtures are two quarters that *do* name the same segments, on ground
 * four blocks apart — the shape that failed — asserted at the two levels the
 * defect passed through: the surfacer's own declaration, and the sidewalk band.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { StreetGraph } from "../src/layout/streets.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { index, surfaceStreetGraph } from "../src/structures/roads.js";
import { dressStreets, type SegmentArc } from "../src/structures/streetscape.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

/** The two islands' levels, four apart, exactly as the walk measured them. */
const HIGH = 95;
const LOW = 91;

/** Quarter A is the northern half; quarter B the southern one. */
const PATH_A = "world.pirate_haven";
const PATH_B = "world.unicorn_sanctuary";

function region(size = 128): Region {
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

/**
 * One quarter's skeleton: a north-south run and an east-west one, named the way
 * every axis-drawing form names them.
 */
function quarter(z0: number, z1: number): StreetGraph {
  const ns: { x: number; z: number }[] = [];
  for (let z = z0; z <= z1; z++) ns.push({ x: 0, z });
  const ew: { x: number; z: number }[] = [];
  const zMid = (z0 + z1) >> 1;
  for (let x = -24; x <= 24; x++) ew.push({ x, z: zMid });
  return {
    segments: [
      { id: "ns0", kind: "street", width: 5, path: ns },
      { id: "ew0", kind: "street", width: 5, path: ew },
    ],
    intersections: [],
    sidewalk: 2,
  };
}

/** The northern quarter sits on the high island, the southern on the low one. */
const graphA = quarter(-48, -8);
const graphB = quarter(8, 48);

function surfaceBoth(p: ColumnPlan) {
  return surfaceStreetGraph({
    graphs: [graphA, graphB],
    graphPaths: [PATH_A, PATH_B],
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, "world"),
    theme: "medieval_village",
  });
}

/** `structures/index.ts`'s own map, built here the same way it is built there. */
function arcsOf(result: ReturnType<typeof surfaceBoth>): Map<string, SegmentArc> {
  const arcs = new Map<string, SegmentArc>();
  for (const segment of result.declaration.segments) {
    if (segment.frame === undefined || segment.levels === undefined) continue;
    arcs.set(segment.source, { frame: segment.frame, levels: segment.levels });
  }
  return arcs;
}

describe("two quarters that name the same segments", () => {
  it("declares one source per segment, never one per name", () => {
    const p = plan(region(), (_x, z) => (z < 0 ? HIGH : LOW));
    const result = surfaceBoth(p);
    const sources = result.declaration.segments.map((s) => s.source);
    // Four runs, four sources, four frames: the collision used to fold each pair
    // into one entry, which is exactly what the arc map lost.
    expect(sources).toHaveLength(4);
    expect(new Set(sources).size).toBe(4);
    expect(arcsOf(result).size).toBe(4);
    for (const path of [PATH_A, PATH_B]) {
      expect(sources.filter((s) => s.endsWith(path))).toHaveLength(2);
    }
  });

  it("grades each quarter's sidewalks to its own carriageway", () => {
    const r = region();
    const p = plan(r, (_x, z) => (z < 0 ? HIGH : LOW));
    const result = surfaceBoth(p);
    const arcs = arcsOf(result);

    const dress = (graph: StreetGraph, nodePath: string) =>
      dressStreets(graph, {
        plan: p,
        levels: arcs,
        stack,
        seed: nodeSeed(11n, nodePath),
        furniture: "none",
        palette: emptyPalette,
        nodePath,
        surfaced: result.road,
      });
    const dressedA = dress(graphA, PATH_A);
    const dressedB = dress(graphB, PATH_B);

    for (const [dressed, want] of [
      [dressedA, HIGH],
      [dressedB, LOW],
    ] as const) {
      const bad: number[] = [];
      let seen = 0;
      for (let k = 0; k < dressed.masks.sidewalk.length; k++) {
        if (dressed.masks.sidewalk[k] !== 1) continue;
        seen++;
        if (p.ground[k] !== want) bad.push(p.ground[k] as number);
      }
      expect(seen).toBeGreaterThan(100);
      // The defect put every one of the high quarter's bands at 91 — four under
      // the road they flank — so this is the whole assertion.
      expect(bad).toEqual([]);
    }
    // And the carriageways themselves never moved off their own island.
    expect(p.ground[index(r, 0, -24)]).toBe(HIGH);
    expect(p.ground[index(r, 0, 24)]).toBe(LOW);
  });
});
