/**
 * The carriage spine, ratified by Kai
 * 2026-08-07: *"a horse or a cart on these roads would not be able to move from
 * terrace to terrace."*
 *
 * **Every assertion here is written from the document**, and each names the rule
 * it is the proof of rather than the code path it happens to walk:
 *
 * 1. **The grade cap holds** over every consecutive pair of stations — one block
 *    of rise per `SPINE_GRADE_RUN` columns, measured as a window over the built
 *    levels rather than as a property of the router that chose them.
 * 2. **A cart-profile tread is never a full-block step.** `"stair"` is not one of
 *    the shapes the law can return, and the worst rise a walker meets is half a
 *    block — which is the whole difference between this profile and a flight.
 * 3. **A hairpin landing is level.**
 * 4. **The switchbacks are never drawn**: on a flank too narrow to hold the arc
 *    length the cap demands, hairpins appear; on one broad enough, they do not.
 * 5. **The spine reaches every principal street**, at a column that street owns.
 * 6. **Determinism**: the same ground routes the same road twice.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import { hairpinLandings, type Point2, type Rect } from "../src/layout/frames.js";
import {
  SPINE_GRADE_RUN,
  SPINE_WIDTH,
  routeCarriageSpine,
  spineBudget,
  spineEntry,
  type SpineGround
} from "../src/layout/forms/carriage-spine.js";
import { HILLSIDE_FORM } from "../src/layout/forms/hillside.js";
import type { FormContext, GroundSample } from "../src/layout/forms/index.js";
import { CART_TREAD_RUN, cartTreadPlan, treadSurfaces, worstRise } from "../src/structures/profiles.js";
import { synthesizeCartTreads } from "../src/structures/sweep.js";

/* -------------------------------------------------------------------------- */
/* the law                                                                     */
/* -------------------------------------------------------------------------- */

describe("the cart law climbs at one block in six and never steps a whole one", () => {
  /**
   * Ground **at** the cap — one block per six columns, which is the steepest
   * line the router is allowed to choose and therefore the steepest ground this
   * law is ever handed.
   */
  const atCap = Array.from({ length: 120 }, (_, k) => 80 + Math.floor(k / 6));
  /** Gentler, with a shoulder in the middle of it: the ordinary traverse. */
  const rolling = Array.from({ length: 120 }, (_, k) => 80 + Math.floor(k / 8) - (k > 60 ? 2 : 0));

  for (const [name, ground] of [
    ["ground at the 1:6 cap", atCap],
    ["rolling ground", rolling]
  ] as const) {
    it(`holds one block per ${2 * CART_TREAD_RUN} columns on ${name}`, () => {
      const run = synthesizeCartTreads(ground, { treadRun: CART_TREAD_RUN, maxFill: 1_000 });
      const surface = run.surface;
      expect(surface).not.toBeNull();
      const half = surface as readonly number[];
      // Every consecutive pair: at most half a block, which is what makes the
      // whole run rollable rather than climbable.
      for (let k = 1; k < half.length; k++) {
        expect(Math.abs((half[k] as number) - (half[k - 1] as number))).toBeLessThanOrEqual(1);
      }
      // …and over the router's own step, at most a whole block. This is the cap
      // stated as a measurement on what was built.
      for (let k = SPINE_GRADE_RUN; k < half.length; k++) {
        const rise = (half[k] as number) - (half[k - SPINE_GRADE_RUN] as number);
        expect(Math.abs(rise)).toBeLessThanOrEqual(2);
      }
    });
  }

  it("never dresses a tread as a full-block step", () => {
    const plan = cartTreadPlan(atCap, { maxFill: 1_000 });
    expect(plan).not.toBeNull();
    const { levels, shapes } = plan as { levels: readonly number[]; shapes: readonly string[] };
    expect(shapes).not.toContain("stair");
    // The pessimistic reading of the walking surface: half a block, everywhere.
    expect(worstRise(levels, shapes as never)).toBeLessThanOrEqual(0.5);
    for (const { arrive, depart } of treadSurfaces(levels, shapes as never)) {
      expect(depart - arrive).toBeLessThanOrEqual(0.5);
    }
  });

  it("holds one datum across a hairpin landing", () => {
    const ground = Array.from({ length: 60 }, (_, k) => 80 + Math.floor(k / 8));
    const landing = new Uint8Array(60);
    for (let k = 20; k <= 32; k++) landing[k] = 1;
    const plan = cartTreadPlan(ground, { maxFill: 1_000, landing });
    expect(plan).not.toBeNull();
    const levels = (plan as { levels: readonly number[] }).levels;
    const shapes = (plan as { shapes: readonly string[] }).shapes;
    for (let k = 21; k <= 32; k++) {
      expect(levels[k]).toBe(levels[20]);
      expect(shapes[k]).toBe(shapes[20]);
    }
  });

  it("refuses a whole run it cannot build, rather than half of one", () => {
    // Steeper than the cap by a factor of four: no cart road climbs this.
    const wall = Array.from({ length: 40 }, (_, k) => 80 + 4 * k);
    expect(synthesizeCartTreads(wall, { maxFill: 8 }).surface).toBeNull();
    expect(cartTreadPlan(wall, { maxFill: 8 })).toBeNull();
  });

  it("reads a turn back on itself as a hairpin and a bend as a bend", () => {
    const straight: Point2[] = Array.from({ length: 40 }, (_, k) => ({ x: k, z: 0 }));
    expect([...hairpinLandings(straight, SPINE_GRADE_RUN, 3)].some((v) => v === 1)).toBe(false);
    const back: Point2[] = [
      ...Array.from({ length: 20 }, (_, k) => ({ x: k, z: 0 })),
      ...Array.from({ length: 20 }, (_, k) => ({ x: 19 - k, z: 1 }))
    ];
    expect([...hairpinLandings(back, SPINE_GRADE_RUN, 3)].filter((v) => v === 1).length)
      .toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* the route                                                                   */
/* -------------------------------------------------------------------------- */

/** A ground the router can read, over a rectangle with a height rule. */
function spineGroundOf(bounds: Rect, height: (x: number, z: number) => number): SpineGround {
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const at = (x: number, z: number): number => (z - bounds.z0) * width + (x - bounds.x0);
  return {
    bounds,
    width,
    depth,
    height,
    at,
    inside: (p) => p.x >= bounds.x0 && p.x <= bounds.x1 && p.z >= bounds.z0 && p.z <= bounds.z1,
    strip: new Uint8Array(width * depth)
  };
}

/** The arc length of a 4-connected path, in columns. */
const arcOf = (path: readonly Point2[]): number => path.length - 1;

describe("the switchbacks are never drawn — they are what the cap produces", () => {
  // A narrow flank: 64 columns across, 30 blocks of climb between the two
  // streets. The cap demands 180 columns of arc and the fall line offers 120, so
  // the route cannot be a traverse and cannot be direct.
  const NARROW: Rect = { x0: 0, z0: 0, x1: 63, z1: 199 };
  const narrow = spineGroundOf(NARROW, (_x, z) => 80 + Math.round(z / 4));
  const streets = [
    { path: Array.from({ length: 60 }, (_, k) => ({ x: 2 + k, z: 8 })), level: 82 },
    { path: Array.from({ length: 60 }, (_, k) => ({ x: 2 + k, z: 128 })), level: 112 }
  ];

  it("hairpins when the flank is too narrow to hold the arc the cap demands", () => {
    const entry = spineEntry(narrow, streets[0] as never, 0);
    const spine = routeCarriageSpine(narrow, streets, entry);
    expect(spine).not.toBeNull();
    const routed = spine as NonNullable<typeof spine>;
    expect(routed.hairpins).toBeGreaterThan(0);
    // The arc length is the cap restated: 30 blocks of climb cannot be done in
    // fewer than 180 columns of road, however the road is drawn.
    expect(arcOf(routed.path)).toBeGreaterThanOrEqual(SPINE_GRADE_RUN * 30);
  });

  it("routes the same road twice, column for column", () => {
    const entry = spineEntry(narrow, streets[0] as never, 0);
    const a = routeCarriageSpine(narrow, streets, entry);
    const b = routeCarriageSpine(narrow, streets, entry);
    expect(b?.path).toEqual(a?.path);
    expect(b?.hairpins).toBe(a?.hairpins);
  });

  it("lands on a column the street above owns", () => {
    const entry = spineEntry(narrow, streets[0] as never, 0);
    const spine = routeCarriageSpine(narrow, streets, entry) as NonNullable<
      ReturnType<typeof routeCarriageSpine>
    >;
    const head = spine.path[0] as Point2;
    const tail = spine.path[spine.path.length - 1] as Point2;
    const onStreet = (p: Point2, s: number): boolean =>
      (streets[s] as { path: Point2[] }).path.some((q) => q.x === p.x && q.z === p.z);
    expect(onStreet(head, 0)).toBe(true);
    expect(onStreet(tail, 1)).toBe(true);
  });

  it("budgets one spine, and a second only on a flank broad enough for two", () => {
    expect(spineBudget(NARROW)).toBe(1);
    expect(spineBudget({ x0: 0, z0: 0, x1: 199, z1: 199 })).toBe(2);
    expect(spineEntry(narrow, streets[0] as never, 0)).not.toEqual(
      spineEntry(narrow, streets[0] as never, 1),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* the plan                                                                    */
/* -------------------------------------------------------------------------- */

const QUARTER = 160;
const BOUNDS: Rect = { x0: -QUARTER / 2, z0: -QUARTER / 2, x1: QUARTER / 2 - 1, z1: QUARTER / 2 - 1 };

function planOn(at: (x: number) => number): ReturnType<typeof HILLSIDE_FORM.draw> {
  const ground: GroundSample = {
    height: (x) => at(x),
    water: () => false,
    slope: (x) => Math.abs(at(x + 1) - at(x)),
    relief: at(BOUNDS.x1) - at(BOUNDS.x0),
    levelled: false,
    waterReach: Number.POSITIVE_INFINITY
  };
  const ctx: FormContext = {
    bounds: BOUNDS,
    seed: nodeSeed(20260807n, "world.hill_town", ""),
    blockSize: 32,
    sidewalk: 2,
    density: "medium",
    ground,
    focus: []
  };
  return HILLSIDE_FORM.draw(ctx);
}

describe("a hillside plan carries one carriage spine", () => {
  const steepAt = (x: number): number => 80 + Math.round((x + QUARTER / 2) / 2.5);
  const result = planOn(steepAt);
  if (!result.ok) throw new Error(`hillside refused: ${result.reason}`);
  const plan = result.plan;
  const spine = plan.graph.segments.filter((s) => s.role === "cart");
  const principals = plan.graph.segments.filter((s) => s.kind === "street");

  it("lays exactly one, five columns wide, and says so in the record", () => {
    expect(spine).toHaveLength(1);
    expect((spine[0] as { width: number }).width).toBe(SPINE_WIDTH);
    expect(plan.record.adapted.join(" ")).toContain(`carriage spine(s) at 1 in ${SPINE_GRADE_RUN}`);
  });

  it("touches every principal contour, inside the carriageway that fronts it", () => {
    // **On a centre-line column of a street that was actually laid.** The spine
    // aims at the *candidate* contour, because it is routed before the strips
    // claim (§3.6a), and which stretches of that contour become carriageway is
    // decided afterwards — so a run that pinched out can leave the landing a few
    // columns short. `joinToStreet` carries each end the last few columns on,
    // and this is the assertion that it did: the surfacer pins against an
    // *owner*, and `linkComponents` unions on shared columns rather than on
    // nearness, so a junction that is nearly a junction is not one.
    const path = (spine[0] as { path: readonly Point2[] }).path;
    // The spine **and the short flights that make its interior junctions** — a
    // graded road lands where its grade puts it, and bending the carriageway
    // sideways to find a centre line would spend the cap, so the last few
    // columns to a street it merely passes are steps.
    const on = new Set(
      plan.graph.segments
        .filter((s) => s.id.startsWith("sp"))
        .flatMap((s) => s.path)
        .map((p) => `${p.x},${p.z}`),
    );
    const contours = [...new Set(principals.map((s) => s.id.split("_")[0]))].sort();
    expect(contours.length).toBeGreaterThanOrEqual(2);
    // Both **ends** land on a centre-line column, exactly: the lowest contour
    // and the highest are where the road starts and stops.
    const ends = [path[0] as Point2, path[path.length - 1] as Point2];
    for (const [i, contour] of [contours[0], contours[contours.length - 1]].entries()) {
      const columns = principals
        .filter((s) => s.id.split("_")[0] === contour)
        .flatMap((s) => s.path);
      const end = ends[i] as Point2;
      expect(columns.some((p) => p.x === end.x && p.z === end.z)).toBe(true);
    }
    // …and every contour in between is **crossed**, inside its carriageway —
    // one leg per adjacent pair of streets is what the router builds, so a
    // contour the road never met would be a leg that never happened.
    const reach = (SPINE_WIDTH - 1) >> 1;
    for (const contour of contours) {
      const columns = principals
        .filter((s) => s.id.split("_")[0] === contour)
        .flatMap((s) => s.path);
      expect(
        columns.some((p) => {
          for (let dz = -reach; dz <= reach; dz++) {
            for (let dx = -reach; dx <= reach; dx++) if (on.has(`${p.x + dx},${p.z + dz}`)) return true;
          }
          return false;
        }),
        contour,
      ).toBe(true);
    }
  });

  it("reserves its corridor before any lot: no strip and no lot mask holds it", () => {
    const width = BOUNDS.x1 - BOUNDS.x0 + 1;
    const at = (p: Point2): number => (p.z - BOUNDS.z0) * width + (p.x - BOUNDS.x0);
    const path = (spine[0] as { path: readonly Point2[] }).path;
    for (const p of path) {
      const k = at(p);
      expect(plan.lotMask?.[k] ?? 0).toBe(0);
      for (const strip of plan.strips ?? []) expect(strip.columns[k]).toBe(0);
    }
  });

  it("draws the same spine twice", () => {
    const again = planOn(steepAt);
    if (!again.ok) throw new Error("hillside refused on the second draw");
    const other = again.plan.graph.segments.filter((s) => s.role === "cart");
    expect(other.map((s) => s.path)).toEqual(spine.map((s) => s.path));
  });
});
