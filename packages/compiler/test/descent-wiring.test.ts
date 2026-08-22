/**
 * **WP-D3 — the fifth datum's wiring** (`docs/DESCENT-SOLVE-v0.md` §3.2, §4.2,
 * §5.2, §5.3).
 *
 * WP-D1 built the solver and every receiving end; nothing called it. This file
 * tests the four joints WP-D3 welded, each at the seam it was welded at, and
 * each with the flag-off state asserted beside the flag-on one:
 *
 * 1. **the corridor joins `blocked`** (§3.2) — `derivePlatforms` elects no
 *    bench over a solved descent, so the election's atoms are cut around a
 *    descent exactly as they are cut around a street;
 * 2. **the corridor leaves the plane's claim before the plane is declared**
 *    (§3.2/§3.4), across the region translation a per-quarter datum needs to
 *    reach a per-plan declarer — `descentCorridorMask`;
 * 3. **the surfacer takes the descent's levels** (§4.2/§5.1) — a flight the
 *    fifth datum solved is surfaced at the levels the *search* chose, not at
 *    the ones the tread law would have filtered out of a router's guess;
 * 4. **S9 may not cut a flight through a claimed face** (§5.3) — and the
 *    `MAX_DERIVED_STAIRS` cap is unaffected by the stacks it yields.
 *
 * Every fixture forces `descentSolve: true` at the call rather than flipping
 * the compile-time flag, which is the discipline `PlatformInput.tiered` and
 * `PlatformInput.electionSolve` already keep: what is measured here is the
 * *consumer's* behaviour, independent of what the world's flag happens to be.
 */

import { describe, expect, it } from "vitest";

import { HeightField, nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { descentCorridorMask, solveDescents } from "../src/layout/descent-datum.js";
import { deriveSeamStairs } from "../src/layout/district.js";
import type { Rect } from "../src/layout/frames.js";
import { declarePads } from "../src/layout/ground-declarers.js";
import { derivePlatforms } from "../src/layout/platforms.js";
import { gradeStreetDatum } from "../src/layout/street-datum.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import type { PadEdit } from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import { surfaceStreetGraph, qualifySegmentId } from "../src/structures/roads.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const QUARTER = "world.quarter";
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));

/* -------------------------------------------------------------------------- */
/* one cliff, in one place, so every joint is tested on the same object        */
/* -------------------------------------------------------------------------- */

/**
 * The quarter every fixture below is laid on: a plateau at 88 falling to a
 * bench at 76 across five columns of cliff, which is a scarp by §1.2 S1 (risers
 * of two and more), a face by §1.2 S2, and a drop of 12 in 5 — steep by both
 * halves of §1.3.
 */
const R: Region = { x0: 0, z0: 0, width: 40, depth: 24 };
const BOUNDS: Rect = { x0: R.x0, z0: R.z0, x1: R.x0 + R.width - 1, z1: R.z0 + R.depth - 1 };

function cliff(x: number): number {
  if (x <= 14) return 88;
  if (x >= 20) return 76;
  return 88 - Math.round(((x - 14) * 12) / 6);
}

function field(r: Region, h: (x: number, z: number) => number): HeightField {
  const f = new HeightField(r);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) f.values[j * r.width + i] = h(r.x0 + i, r.z0 + j);
  }
  return f;
}

function line(
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
  width: number,
  path: readonly { x: number; z: number }[],
  role?: StreetSegment["role"],
): StreetSegment {
  return { id, kind: role === undefined ? "street" : "lane", width, path, ...(role === undefined ? {} : { role }) };
}

/**
 * The plateau street, the bench street, and the flight the router drew between
 * them — the S4 shape, at fixture scale.
 */
function graphOf(): StreetGraph {
  return {
    segments: [
      segment("high", 5, line({ x: 12, z: 1 }, { x: 12, z: 22 })),
      segment("low", 5, line({ x: 24, z: 1 }, { x: 24, z: 22 })),
      segment("flight", 3, line({ x: 12, z: 12 }, { x: 24, z: 12 }), "steps"),
    ],
    intersections: [],
    sidewalk: 1,
  };
}

/** The fifth datum over that quarter, with the flag forced on at the call. */
function solved(): ReturnType<typeof solveDescents> {
  const graph = graphOf();
  const f = field(R, (x) => cliff(x));
  const datum = gradeStreetDatum({ region: R, graph, field: f, seaLevel: SEA });
  return solveDescents({ region: R, graph, field: f, datum, descentSolve: true });
}

/**
 * The fixture is only worth anything if it actually recognizes a descent — the
 * standing rule in this codebase is *prove the harness can see a difference
 * before trusting that it saw none*.
 */
describe("the fixture", () => {
  it("recognizes one cliff, one demand and one built descent", () => {
    const d = solved();
    expect(d.recognition.seeds).toBeGreaterThan(0);
    expect(d.recognition.demands.length).toBe(1);
    expect(d.recognition.groups.length).toBe(1);
    expect(d.descents.length).toBe(1);
    expect((d.descents[0] as { runs: unknown[] }).runs.length).toBeGreaterThan(0);
    expect([...d.corridor].reduce((n, v) => n + v, 0)).toBeGreaterThan(0);
    // §2.7's record, which the design says must exist before this ships.
    expect(d.records.length).toBe(1);
    expect((d.records[0] as { trunkColumns: number }).trunkColumns).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §3.2 — the corridor joins `blocked`                                         */
/* -------------------------------------------------------------------------- */

describe("the corridor joins `blocked` (§3.2)", () => {
  it("no elected bench covers a column of a solved descent", () => {
    const corridor = solved().corridor;
    const input = {
      bounds: BOUNDS,
      blocked: new Uint8Array(R.width * R.depth),
      field: field(R, (x) => cliff(x)),
      tiered: true,
    };
    const before = derivePlatforms(input);
    const after = derivePlatforms({ ...input, descentCorridor: corridor });
    // The harness can see a difference: the plane wanted those columns.
    const covers = (benches: readonly { runs: readonly Rect[] }[], idx: number): boolean => {
      const i = idx % R.width;
      const x = R.x0 + i;
      const z = R.z0 + (idx - i) / R.width;
      return benches.some((b) =>
        b.runs.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1),
      );
    };
    let contested = 0;
    for (let k = 0; k < corridor.length; k++) {
      if (corridor[k] !== 1) continue;
      if (covers(before, k)) contested += 1;
      // …and after the subtraction not one of them is claimed. **The severance
      // is impossible rather than won.**
      expect(covers(after, k)).toBe(false);
    }
    expect(contested).toBeGreaterThan(0);
  });

  it("is inert without a corridor — the flag's off state, by reference", () => {
    const input = {
      bounds: BOUNDS,
      blocked: new Uint8Array(R.width * R.depth),
      field: field(R, (x) => cliff(x)),
      tiered: true,
    };
    expect(derivePlatforms({ ...input, descentCorridor: undefined })).toEqual(
      derivePlatforms(input),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* §3.4 — the corridor leaves the plane's claim, across the region translation */
/* -------------------------------------------------------------------------- */

describe("the plane subtracts the solved corridor (§3.2, §3.4)", () => {
  /** A plan region the quarter sits *inside*, offset on both axes. */
  const PLAN: Region = { x0: -32, z0: -16, width: 96, depth: 72 };

  it("`descentCorridorMask` translates a per-quarter corridor onto the plan", () => {
    const d = solved();
    const mask = descentCorridorMask(PLAN, [d, undefined]) as Uint8Array;
    expect(mask).toBeDefined();
    let n = 0;
    for (let j = 0; j < R.depth; j++) {
      for (let i = 0; i < R.width; i++) {
        if (d.corridor[j * R.width + i] !== 1) continue;
        n += 1;
        const x = R.x0 + i;
        const z = R.z0 + j;
        expect(mask[(z - PLAN.z0) * PLAN.width + (x - PLAN.x0)]).toBe(1);
      }
    }
    expect(n).toBeGreaterThan(0);
    // …and nothing outside the quarter was touched: the mask is exactly the
    // corridor, moved, not the corridor smeared over the plan's corner.
    expect([...mask].reduce((a, b) => a + b, 0)).toBe(n);
  });

  it("no column of a solved descent lies inside a `quarter.plane` claim", () => {
    const mask = descentCorridorMask(PLAN, [solved()]) as Uint8Array;
    const pad = {
      nodePath: QUARTER,
      footprint: { x0: R.x0, z0: R.z0, x1: BOUNDS.x1, z1: BOUNDS.z1 },
      targetY: 84,
      claimClass: "quarter.plane",
    } as PadEdit;
    const claimed = declarePads({
      region: PLAN,
      padEdits: [pad],
      districts: [],
      cities: [],
      corridors: [],
      subtractCarriageway: true,
      descentCorridor: mask,
    });
    const columns = new Set(claimed.flatMap((intent) => intent.columns.map((c) => c.idx)));
    for (let k = 0; k < mask.length; k++) if (mask[k] === 1) expect(columns.has(k)).toBe(false);
  });

  it("nothing solved ⇒ no mask at all, and §1.7 keeps its two rules", () => {
    expect(descentCorridorMask(PLAN, [])).toBeUndefined();
    expect(descentCorridorMask(PLAN, [undefined])).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* §4.2 / §5.1 — the surfacer takes the descent's levels                       */
/* -------------------------------------------------------------------------- */

function plan(r: Region, h: (x: number, z: number) => number): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const k = j * r.width + i;
      ground[k] = h(r.x0 + i, r.z0 + j);
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

/** The surfacer's arguments, over a plan nothing has written to yet. */
function surfaceArgs() {
  return {
    graphs: [graphOf()],
    graphPaths: [QUARTER],
    plan: plan(R, (x) => cliff(x)),
    palette: emptyPalette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, QUARTER),
    theme: "medieval_village",
  } as const;
}

describe("the descent registers as the flight (§4.2)", () => {
  it("the surfaced flight is the run the search chose, at the levels it chose", () => {
    const d = solved();
    // **A fresh plan per call, deliberately.** `surfaceStreetGraph` writes the
    // ground it decides through the driver it makes for the plan it is handed,
    // so two calls over one plan are not two measurements of one pass — they
    // are one pass and its sequel.
    const off = surfaceStreetGraph({ ...surfaceArgs() });
    const on = surfaceStreetGraph({ ...surfaceArgs(), descents: [d] });
    // The harness sees a difference: with the descent wired the flight is a
    // different object from the one the tread law filtered out of the router's
    // straight line.
    expect(JSON.stringify(on.declaration.segments)).not.toEqual(
      JSON.stringify(off.declaration.segments),
    );
    // Every column the descent solved carries the solved level, in stand units
    // — the one `+1` between the solver's top-block convention and a flight's.
    // **The flight nothing named.** Since the WP-D3 amendment a demand is a
    // face plus two opposing stations — the plateau street and the bench street
    // here — so the run carries the descent's own id and the surfacer registers
    // it as a `steps` member of the street family that no segment ever named.
    // The router's own `flight` is superseded on a claimed face (§5.3), which
    // is why the two declarations differ above.
    const demandId = (d.recognition.demands[0] as { segmentId: string }).segmentId;
    const runs = d.bySegment.get(demandId) as readonly {
      columns: readonly number[];
      levels: readonly number[];
    }[];
    expect(runs.length).toBeGreaterThan(0);
    // **In the solver's own units.** The search answers in *top-block* levels —
    // the convention `StreetDatum.columnY` and the materialised ground both
    // speak — and the surfacer converts once to stands for `treadPlan` and once
    // back for the claim, so what a `street.network` column publishes is the
    // number the search chose, unmoved.
    const want = new Map<string, number>();
    for (const r of runs) {
      for (const [i, idx] of r.columns.entries()) {
        const a = idx % R.width;
        want.set(`${R.x0 + a},${R.z0 + (idx - a) / R.width}`, r.levels[i] as number);
      }
    }
    const id = qualifySegmentId(demandId, QUARTER);
    const laid = on.declaration.segments.find((s) => s.id === id);
    expect(laid, "the flight was refused whole").toBeDefined();
    expect((laid as { role: string }).role).toBe("steps");
    // The flight's own declared columns carry the levels the *search* chose —
    // §5.1's "the levels are already decided", read back at the class that
    // publishes them (`street.network`, rank 80, `preserve` over its band).
    let checked = 0;
    for (const claim of (laid as { columns: readonly { idx: number; y: number }[] }).columns) {
      const i = claim.idx % R.width;
      const key = `${R.x0 + i},${R.z0 + (claim.idx - i) / R.width}`;
      const y = want.get(key);
      if (y === undefined) continue; // a verge column, not the centre line
      checked += 1;
      expect(claim.y).toBe(y);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("no descents ⇒ the pass the surfacer has always run", () => {
    expect(
      JSON.stringify(surfaceStreetGraph({ ...surfaceArgs(), descents: [undefined] })),
    ).toEqual(JSON.stringify(surfaceStreetGraph({ ...surfaceArgs() })));
  });
});

/* -------------------------------------------------------------------------- */
/* §5.3 — S9 may not cut a flight through a claimed face                       */
/* -------------------------------------------------------------------------- */

describe("`deriveSeamStairs` is scoped off a claimed face (§5.3)", () => {
  const stackAt = (nodePath: string, x: number, z: number) => ({
    nodePath,
    seam: 0,
    landings: [
      { columns: [{ x, z }] },
      { columns: [{ x: x + 8, z }] },
    ],
  });

  it("a stack whose flight would cross a claimed face gets none, and the cap is unspent", () => {
    const claimedRect = { x0: 10, z0: 8, x1: 20, z1: 16 };
    const claimed = (x: number, z: number): boolean =>
      x >= claimedRect.x0 && x <= claimedRect.x1 && z >= claimedRect.z0 && z <= claimedRect.z1;
    const input = {
      nodePath: QUARTER,
      // One stack inside the claimed face, one well clear of it.
      landings: [stackAt(QUARTER, 11, 12), stackAt(QUARTER, 28, 20)] as never,
      tiered: true,
      onStreet: (): boolean => false,
    };
    const before = deriveSeamStairs(input);
    const after = deriveSeamStairs({ ...input, claimed });
    // The harness can see a difference: unclaimed, S9 cuts both.
    expect(before.cut).toBe(2);
    // Claimed, it cuts only the one off the face — and refuses nothing, which
    // is what "`MAX_DERIVED_STAIRS` is unaffected" means: a stack that yields
    // here never became a flight, so it never spent one.
    expect(after.cut).toBe(1);
    expect(after.refused).toBe(0);
    for (const s of after.segments) {
      for (const c of s.path) expect(claimed(c.x, c.z)).toBe(false);
    }
  });

  it("no claimed mask ⇒ the pass S9 has always run", () => {
    const input = {
      nodePath: QUARTER,
      landings: [stackAt(QUARTER, 11, 12)] as never,
      tiered: true,
      onStreet: (): boolean => false,
    };
    expect(deriveSeamStairs({ ...input, claimed: undefined })).toEqual(deriveSeamStairs(input));
  });
});
