/**
 * Wave 8E — the other clients of F1, and the cities.
 *
 * `docs/GROUND-UNIFICATION-v0.md` §1.6 names five clients of the frontage
 * authority; 8B/8C tied the lot, 8D tied the surfacer, and this wave ties the
 * three that were left plus the city cell:
 *
 * - **props** — a prop inside the datum's band takes the datum's level rather
 *   than the median under its own feet (`datumPropBase`);
 * - **bespoke sites** — a site with a banded column within `SITE_FRONTAGE_REACH`
 *   seats at its street's level whether it conforms or pads (`datumSeatPlane`);
 * - **the city cell** — the cell's one plane becomes its own streets' level
 *   rather than a second plane graded from the hillside the cell pad is about
 *   to erase (`gradeStreetDatum`'s `planeY`, which 8E shipped as a floor and
 *   8F had to correct to a pin — the group below carries the measurement);
 * - **precincts and plazas** — unchanged in WP-8, and asserted so.
 *
 * Every tie is exercised **through the exported pure function**, never by
 * flipping `FRONTAGE_TIE` — which is what keeps this file meaningful now that
 * 8F has flipped it on. The last two cases here are the no-datum equivalence: a
 * placer handed no datum produces exactly the object it produced before this
 * wave existed, which is still every district-less compile.
 *
 * The last group is 9B's small landing item: `seatOn` must be able to tell "the
 * document wrote a pad" from "nobody wrote a seat", or §2.2's "an explicit seat
 * always wins" is not a rule the code can state.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { HeightField, type Region } from "@terrainist/stdlib";
import { DEFAULT_EMBED_DEPTH } from "@terrainist/spec";

import { DEV_GROUND_Y, devColumnPlan } from "../src/devworld.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { gradeStreetDatum, type StreetDatum } from "../src/layout/street-datum.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import { FRONTAGE_TIE, SITE_FRONTAGE_REACH } from "../src/layout/types.js";
import { datumSeatPlane, planProgramSites, programGroundPlane } from "../src/programs/place.js";
import { datumPropBase, groundBase, planPropPlacement } from "../src/structures/props.js";
import { seatOn } from "../src/terrain/compile.js";
import type { Rect } from "../src/layout/frames.js";
import type { ProgramScatterParams } from "@terrainist/spec";
import { nodeSeed, type Seed256 } from "@terrainist/stdlib";

const SEA = 63;

let stack: PrismarineStack;
beforeAll(() => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
});

const PLAN_REGION: Region = { x0: -64, z0: -64, width: 160, depth: 160 };

/** The flat dev plain, with an optional pond dug into it for the water props. */
function plainPlan(pond?: { x0: number; z0: number; x1: number; z1: number }): ColumnPlan {
  const plan = devColumnPlan(PLAN_REGION, stack);
  if (pond === undefined) return plan;
  for (let z = pond.z0; z <= pond.z1; z++) {
    for (let x = pond.x0; x <= pond.x1; x++) {
      const idx = (z - PLAN_REGION.z0) * PLAN_REGION.width + (x - PLAN_REGION.x0);
      plan.ground[idx] = DEV_GROUND_Y - 4;
      plan.fluidTop[idx] = DEV_GROUND_Y - 1;
      plan.fluidKind[idx] = FluidKind.WATER;
    }
  }
  return plan;
}

function region(size = 96): Region {
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

/** One east-west street along `z = 0`, with a two-column sidewalk band. */
function oneStreet(): StreetGraph {
  return {
    segments: [segment("main", "street", 5, run({ x: -40, z: 0 }, { x: 40, z: 0 }))],
    intersections: [],
    sidewalk: 2,
  };
}

function gradeOn(
  h: (x: number, z: number) => number,
  extra: { readonly floorY?: number; readonly planeY?: number } = {},
): StreetDatum {
  const r = region();
  return gradeStreetDatum({
    region: r,
    graph: oneStreet(),
    field: field(r, h),
    seaLevel: SEA,
    ...extra,
  });
}

/* -------------------------------------------------------------------------- */
/* the city cell — §1.8's 8E line, as 8F corrected it                          */
/* -------------------------------------------------------------------------- */

/**
 * **8F's correction, and the bug it is a regression test for.**
 *
 * 8E gave the city cell `floorY`, on the argument that `applyLevelPad` levels
 * the mask in both directions so a floor is enough. It is not: a floor lifts
 * the datum where the raw hillside sits *below* the plane and leaves it exactly
 * where it is where the hillside sits *above* — and those are precisely the
 * columns `maskRuns` is about to cut down to the plane. The street was then
 * surfaced from a level its own ground no longer had, while the cell's lots
 * seat on `cell.foundationY` directly, so the lots ended up **under** their own
 * carriageway: §0.1's lip, inverted.
 *
 * Measured at the flip on `c1-harbourtown`, over the 90 seated lots with a
 * carriageway within five columns: 4 lots off their street's level before, **25
 * after with the floor, 22 of them negative**, and 4 again with the pin. The
 * `floorY` group below is kept because the floor is still the kernel's general
 * primitive; the `planeY` group is what a cell actually takes.
 */
describe("8F: the cell plane is a pin, not a floor", () => {
  const hillside = (x: number, _z: number): number => 90 + x * 0.4;

  it("grades the whole quarter to the plane, above the hillside and below it", () => {
    // The run climbs 32 blocks across the region, so a plane at 100 is under
    // part of it and over the rest — the exact case the floor got wrong.
    const plain = gradeOn(hillside).bySegment.get("main")?.y as readonly number[];
    const pinned = gradeOn(hillside, { planeY: 100 }).bySegment.get("main")?.y as readonly number[];
    expect(Math.min(...plain) < 100 && Math.max(...plain) > 100).toBe(true);
    expect([...pinned]).toEqual(plain.map(() => 100));
  });

  it("carries the plane into the raster every other client reads", () => {
    // `columnY` is what `levelNear`, `frontageSeat` and the surfacer's `datumY`
    // all resolve through, so a pin that stopped at the profile would be no pin.
    const pinned = gradeOn(hillside, { planeY: 100 });
    for (const [k, banded] of pinned.band.entries()) {
      if (banded !== 1) continue;
      expect(pinned.columnY[k]).toBe(100);
    }
  });

  it("seats a lot on its cell's plane exactly — FRONTAGE_RISE is 0", () => {
    // The whole point, stated as the number Kai walks: a lot fronting a pinned
    // quarter's street is at the plane, so `foundationY − carriageway` is 0 and
    // the threshold is the one doorstep F4 designs for.
    const pinned = gradeOn(hillside, { planeY: 100 });
    expect(pinned.levelNear(0, 3, 4)).toBe(100);
    expect(pinned.levelNear(-30, 3, 4)).toBe(100);
    expect(pinned.levelNear(30, 3, 4)).toBe(100);
  });

  it("is trivially 1-Lipschitz, which is what makes a pin legal at all", () => {
    const y = gradeOn(hillside, { planeY: 100 }).bySegment.get("main")?.y as readonly number[];
    for (let i = 1; i < y.length; i++) {
      expect(Math.abs((y[i] as number) - (y[i - 1] as number))).toBe(0);
    }
  });

  it("wins over the floor, and no caller passes both", () => {
    const both = gradeOn(hillside, { floorY: 140, planeY: 100 });
    const pinned = gradeOn(hillside, { planeY: 100 });
    expect([...both.columnY]).toEqual([...pinned.columnY]);
  });

  it("is absent for a district that is not a cell", () => {
    const r = region();
    const f = field(r, hillside);
    const withoutKey = gradeStreetDatum({ region: r, graph: oneStreet(), field: f, seaLevel: SEA });
    const withUndefined = gradeStreetDatum({
      region: r,
      graph: oneStreet(),
      field: f,
      seaLevel: SEA,
      planeY: undefined,
    });
    expect([...withUndefined.columnY]).toEqual([...withoutKey.columnY]);
  });
});

describe("8E: the floor, which is the kernel's general primitive", () => {
  const hillside = (x: number, _z: number): number => 90 + x * 0.4;

  it("lifts every graded level to the floor and never below it", () => {
    const plain = gradeOn(hillside);
    const floorY = 100;
    const floored = gradeOn(hillside, { floorY });
    const a = plain.bySegment.get("main")?.y as readonly number[];
    const b = floored.bySegment.get("main")?.y as readonly number[];
    expect(a.length).toBe(b.length);
    // A floor only ever lifts: above it the natural grade still wins. That is
    // the correct behaviour for a floor and the wrong operator for a cell —
    // see the `planeY` group above for the measurement that separated them.
    expect([...b]).toEqual(a.map((y) => Math.max(y, floorY)));
    expect(Math.min(...b)).toBe(floorY);
  });

  it("keeps the profile 1-Lipschitz over arc length after the floor", () => {
    const y = gradeOn(hillside, { floorY: 100 }).bySegment.get("main")?.y as readonly number[];
    for (let i = 1; i < y.length; i++) {
      const step = Math.abs((y[i] as number) - (y[i - 1] as number));
      expect({ i, step }).toEqual({ i, step: Math.min(step, 1) });
    }
  });

  it("carries the floor into the raster the other clients read", () => {
    const floored = gradeOn(hillside, { floorY: 100 });
    for (const [k, banded] of floored.band.entries()) {
      if (banded !== 1) continue;
      expect(floored.columnY[k]).toBeGreaterThanOrEqual(100);
    }
  });

  it("is a no-op when the floor is below the whole run", () => {
    const plain = gradeOn(hillside);
    const under = gradeOn(hillside, { floorY: 0 });
    expect([...(under.bySegment.get("main")?.y ?? [])]).toEqual([
      ...(plain.bySegment.get("main")?.y ?? []),
    ]);
    expect([...under.columnY]).toEqual([...plain.columnY]);
  });

  it("is absent for an ordinary district — the no-floor shape", () => {
    // No `floorY` key at all is the ordinary district call, and it must grade
    // exactly what it graded before the field existed.
    const r = region();
    const f = field(r, hillside);
    const withoutKey = gradeStreetDatum({ region: r, graph: oneStreet(), field: f, seaLevel: SEA });
    const withUndefined = gradeStreetDatum({
      region: r,
      graph: oneStreet(),
      field: f,
      seaLevel: SEA,
      floorY: undefined,
    });
    expect([...withUndefined.columnY]).toEqual([...withoutKey.columnY]);
  });
});

/* -------------------------------------------------------------------------- */
/* props — §1.6's prop-pad client                                              */
/* -------------------------------------------------------------------------- */

describe("8E: a prop in the band takes the datum's level", () => {
  // A flat-ish street on a slope, so the datum's answer and the natural ground
  // beside it are genuinely different numbers.
  const datum = gradeOn((x, z) => 90 + x * 0.4 + Math.abs(z) * 0.8);

  const level = (x: number, z: number): number =>
    datum.columnY[(z - datum.region.z0) * datum.region.width + (x - datum.region.x0)] as number;

  it("answers level + 1 for a footprint standing on the carriageway", () => {
    const rect: Rect = { x0: -1, z0: -1, x1: 1, z1: 1 };
    expect(datumPropBase([datum], rect)).toBe(level(0, 0) + 1);
  });

  it("answers for a footprint that only clips the band with a corner", () => {
    // The band is the carriageway (5 wide) plus two columns of sidewalk either
    // side: `|z| <= 4`. A 3×3 bench centred at z = 5 has its northern row on
    // z = 4, inside the band, and is therefore tied.
    const clipping: Rect = { x0: 6, z0: 4, x1: 8, z1: 6 };
    expect(datum.band[(4 - datum.region.z0) * datum.region.width + (7 - datum.region.x0)]).toBe(1);
    expect(datumPropBase([datum], clipping)).toBe(level(7, 4) + 1);
  });

  it("says nothing about a prop out in the field", () => {
    expect(datumPropBase([datum], { x0: 10, z0: 20, x1: 12, z1: 22 })).toBeUndefined();
    // …and an empty or all-undefined datum list is silence, not a crash.
    expect(datumPropBase([], { x0: -1, z0: -1, x1: 1, z1: 1 })).toBeUndefined();
    expect(datumPropBase([undefined], { x0: -1, z0: -1, x1: 1, z1: 1 })).toBeUndefined();
  });

  it("consults datums in the caller's order — the first that answers wins", () => {
    const high = gradeOn((x, z) => 90 + x * 0.4 + Math.abs(z) * 0.8, { floorY: 140 });
    const rect: Rect = { x0: -1, z0: -1, x1: 1, z1: 1 };
    expect(datumPropBase([high, datum], rect)).toBe(141);
    expect(datumPropBase([datum, high], rect)).toBe(level(0, 0) + 1);
  });

  it("moves a prop's placed baseY, and moves nothing when no datum is handed over", () => {
    const plan = plainPlan();
    const seed: Seed256 = nodeSeed(0x5eedn, "world.bollard", "");
    const params = { prop: "cart", at: { x: 0, z: 0 } } as Record<string, unknown>;
    const untied = planPropPlacement({ prop: "cart", params, seed, plan });
    expect(untied).toBeDefined();
    // The dev plan is flat at DEV_GROUND_Y, so the untied answer is the ground.
    expect(untied?.baseY).toBe(groundBase(plan, untied?.footprint as Rect));
    expect(untied?.baseY).toBe(DEV_GROUND_Y + 1);

    // A datum standing well above that flat ground: the prop takes the street.
    const lifted = gradeOn(() => 90, { floorY: 140 });
    const tied = planPropPlacement({ prop: "cart", params, seed, plan, datums: [lifted] });
    expect(tied?.footprint).toEqual(untied?.footprint);
    expect(tied?.baseY).toBe(141);

    // Flag-off equivalence: `datums: undefined` is the call the pipeline makes
    // today, and it is the untied object exactly.
    expect(planPropPlacement({ prop: "cart", params, seed, plan, datums: undefined })).toEqual(
      untied,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* bespoke sites — §1.6's third client                                         */
/* -------------------------------------------------------------------------- */

describe("8E: a bespoke site seats on the datum", () => {
  const datum = gradeOn(() => 90, { floorY: 140 });

  it("takes the street's level for a footprint within SITE_FRONTAGE_REACH", () => {
    // The band ends at |z| = 4; the reach is measured from the footprint, so a
    // site whose nearest edge is inside `SITE_FRONTAGE_REACH` of it is tied.
    const near: Rect = { x0: -4, z0: 4 + SITE_FRONTAGE_REACH - 1, x1: 4, z1: 4 + SITE_FRONTAGE_REACH + 7 };
    expect(datumSeatPlane([datum], near)).toBe(141);
  });

  it("says nothing for a site out of reach of every street", () => {
    const far: Rect = { x0: -4, z0: 40, x1: 4, z1: 46 };
    expect(datumSeatPlane([datum], far)).toBeUndefined();
    // The reach is a parameter, so the same site ties when the caller asks
    // further — which is what keeps this one number and not two.
    expect(datumSeatPlane([datum], far, 60)).toBe(141);
  });

  it("moves a scattered site's plane, whether it pads or conforms", () => {
    const plan = plainPlan();
    const params = {
      program: "shrine",
      count: 1,
      spacing: 8,
      area: { zone: "center" },
    } as unknown as ProgramScatterParams;
    const base = {
      params,
      envelope: [5, 6, 5] as readonly [number, number, number],
      plan,
      seed: nodeSeed(0x5eedn, "world.shrine", ""),
    };
    const untied = planProgramSites(base);
    expect(untied.length).toBe(1);
    expect(untied[0]?.baseY).toBe(programGroundPlane(plan, untied[0]?.footprint as Rect));

    // A street laid through the site the ground chose, so the reach test is
    // about the *plane* rather than about where a scatter happened to land.
    const foot = untied[0]?.footprint as Rect;
    const zLine = foot.z0 + ((foot.z1 - foot.z0) >> 1);
    const r: Region = PLAN_REGION;
    const through = gradeStreetDatum({
      region: r,
      graph: {
        segments: [segment("main", "street", 5, run({ x: r.x0 + 4, z: zLine }, { x: r.x0 + r.width - 5, z: zLine }))],
        intersections: [],
        sidewalk: 2,
      },
      field: field(r, () => 90),
      seaLevel: SEA,
      floorY: 140,
    });

    for (const seat of [{ policy: "pad" as const, embedDepth: DEFAULT_EMBED_DEPTH }, { policy: "conform" as const, embedDepth: DEFAULT_EMBED_DEPTH }]) {
      const tied = planProgramSites({ ...base, seat, datums: [through] });
      expect(tied.length).toBe(1);
      expect(tied[0]?.footprint).toEqual(untied[0]?.footprint);
      expect(tied[0]?.baseY).toBe(141);
    }
  });

  it("places identically when no datum is handed over — flag-off equivalence", () => {
    const plan = plainPlan();
    const params = {
      program: "shrine",
      count: 3,
      spacing: 12,
    } as unknown as ProgramScatterParams;
    const base = {
      params,
      envelope: [5, 6, 5] as readonly [number, number, number],
      plan,
      seed: nodeSeed(0x5eedn, "world.shrines", ""),
    };
    expect(planProgramSites({ ...base, datums: undefined })).toEqual(planProgramSites(base));
  });
});

/* -------------------------------------------------------------------------- */
/* the two clients §1.6 leaves alone, and the flag itself                       */
/* -------------------------------------------------------------------------- */

describe("8E: what stays untied", () => {
  it("reaches every tie above through a pure function, flag or no flag", () => {
    // 8F flipped it. The point of this file is unchanged and is now load-bearing
    // in the other direction: every case above forces its datum in as a fixture,
    // so these assertions measure the tie's *functions* and not the flag — they
    // would read the same had 8F never happened.
    expect(FRONTAGE_TIE).toBe(true);
  });

  it("leaves a water-seated prop on its water", () => {
    // §1.6 ties prop *pads*; a boat's base is the waterline, which is not a
    // frontage and is never asked of the datum.
    const plan = plainPlan({ x0: -20, z0: -20, x1: 20, z1: 20 });
    const seed: Seed256 = nodeSeed(0x5eedn, "world.boat", "");
    const params = { prop: "rowboat", at: { x: 0, z: 0 } } as Record<string, unknown>;
    const lifted = gradeOn(() => 90, { floorY: 140 });
    expect(planPropPlacement({ prop: "rowboat", params, seed, plan, datums: [lifted] })).toEqual(
      planPropPlacement({ prop: "rowboat", params, seed, plan }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 9B's landing item: an explicit seat is distinguishable from a defaulted one  */
/* -------------------------------------------------------------------------- */

describe("8E: seatOn records whether the document wrote the seat", () => {
  it("flags a seat the document actually wrote", () => {
    expect(seatOn({ params: { seat: "pad" } })).toEqual({
      seat: { policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH },
      seatExplicit: true,
    });
    expect(seatOn({ params: { seat: "conform" } })).toEqual({
      seat: { policy: "conform", embedDepth: DEFAULT_EMBED_DEPTH },
      seatExplicit: true,
    });
  });

  it("leaves the flag off when nobody wrote a seat — the defaulted pad", () => {
    // The distinction §2.2 needs: this `pad` and the written one above are the
    // same `SeatDecision`, and only the flag tells them apart.
    expect(seatOn({ params: {} })).toEqual({ seat: { policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH } });
    expect(seatOn({})).toEqual({ seat: { policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH } });
    expect(seatOn({ params: { seat: "nonsense" } })).toEqual({
      seat: { policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH },
    });
  });

  it("says nothing at all about a hovering node, which never seats", () => {
    expect(seatOn({ params: { hover: 12 } })).toEqual({});
  });
});
