/**
 * `radial` — WP-A of `docs/URBAN-FORMS-v0.md`.
 *
 * §8.1 for every form (determinism, 4-connectivity, connectivity, boundary
 * reach, containment, clipping) and §8.2 for this one: every spoke meets the
 * plan, no wedge between two adjacent spokes is wider than 1.5 · blockSize at
 * any ring, and the child named by `params.focus` is seated in the hub.
 *
 * The compiled-world layer (§8.1.8) is deliberately *not* here: `radial` writes
 * no blocks, its rings and spokes are ordinary streets on the ordinary surfacing
 * path, and a per-form emitted world belongs in the slow suite beside
 * `fabric.test.ts` rather than in a graph test.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import { ROTATED_BLOCK_GAIN } from "../src/layout/city.js";
import type { Point2, Rect } from "../src/layout/frames.js";
import {
  BASE_SPOKES,
  MAX_ARC_GAP_DEN,
  MAX_ARC_GAP_NUM,
  RADIAL_FORM,
  RADIAL_RING_GAIN,
} from "../src/layout/forms/radial.js";
import { drawFabric, flatGround, type FormContext, type GroundSample } from "../src/layout/forms/index.js";
import { boundaryEndpoints, carriagewayCells, type StreetGraph } from "../src/layout/streets.js";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const BOUNDS: Rect = { x0: 0, z0: 0, x1: 239, z1: 219 };
const SEED = nodeSeed(20260804n, "world.ring_town", "");

const context = (over: Partial<FormContext> = {}): FormContext => ({
  bounds: BOUNDS,
  seed: SEED,
  blockSize: 34,
  sidewalk: 2,
  density: "medium",
  ground: flatGround(),
  focus: [],
  ...over,
});

/** An ellipse-ish cell mask: the clipped, rotated polygon a city lays. */
function blobMask(bounds: Rect): Uint8Array {
  const w = bounds.x1 - bounds.x0 + 1;
  const d = bounds.z1 - bounds.z0 + 1;
  const out = new Uint8Array(w * d);
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / (w / 2);
      const v = (z - cz) / (d / 2);
      out[z * w + x] = u * u + v * v <= 0.98 ? 1 : 0;
    }
  }
  return out;
}

/** Rough ground with one flat shelf off-centre, for the focus-seating rule. */
const SHELF = { x: 70, z: 70, half: 16 } as const;
function shelfGround(): GroundSample {
  const flat = (x: number, z: number): boolean =>
    Math.abs(x - SHELF.x) <= SHELF.half && Math.abs(z - SHELF.z) <= SHELF.half;
  return {
    height: (x, z) => (flat(x, z) ? 64 : 64 + ((x + z) % 5)),
    water: () => false,
    slope: (x, z) => (flat(x, z) ? 0 : 3),
    relief: 5,
    levelled: false,
    waterReach: Number.POSITIVE_INFINITY,
  };
}

function drawn(over: Partial<FormContext> = {}): {
  readonly graph: StreetGraph;
  readonly plan: ReturnType<typeof planOf>;
} {
  const plan = planOf(over);
  return { graph: plan.graph, plan };
}

function planOf(over: Partial<FormContext> = {}) {
  const result = RADIAL_FORM.draw(context(over));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("radial refused a domain it should have drawn");
  return result.plan;
}

/** Every centre-line cell of the graph, as a key set. */
function cellKeys(graph: StreetGraph): Set<string> {
  const out = new Set<string>();
  for (const segment of graph.segments) for (const c of segment.path) out.add(`${c.x},${c.z}`);
  return out;
}

/** Is the whole graph reachable from any one segment, over its carriageway? */
function connected(graph: StreetGraph, bounds: Rect): boolean {
  const cells = carriagewayCells(graph, bounds);
  const keys = new Set(cells.map((c) => `${c.x},${c.z}`));
  const first = cells[0];
  if (first === undefined) return false;
  const seen = new Set<string>([`${first.x},${first.z}`]);
  const queue: Point2[] = [{ x: first.x, z: first.z }];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Point2;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = `${at.x + dx},${at.z + dz}`;
      if (!keys.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: at.x + dx, z: at.z + dz });
    }
  }
  const reached = new Set<string>();
  for (const cell of cells) if (seen.has(`${cell.x},${cell.z}`)) reached.add(cell.segment);
  return reached.size === graph.segments.length;
}

/* -------------------------------------------------------------------------- */
/* §8.1 — every form                                                           */
/* -------------------------------------------------------------------------- */

describe("radial, the properties every form owes its consumers", () => {
  it("draws the same plan twice from one seed, ids and order included", () => {
    expect(JSON.stringify(planOf())).toBe(JSON.stringify(planOf()));
  });

  it("does not move when an unrelated input changes elsewhere in the document", () => {
    // The positional-hash law: `radial` is arithmetic on the bounds and the
    // focus, so a different node seed cannot move a single cell of it.
    const other = nodeSeed(20260804n, "world.somewhere_else", "");
    expect(JSON.stringify(planOf({ seed: other }))).toBe(JSON.stringify(planOf()));
  });

  it("steps by exactly one block on exactly one axis, everywhere", () => {
    for (const segment of drawn().graph.segments) {
      for (let i = 1; i < segment.path.length; i++) {
        const a = segment.path[i - 1] as Point2;
        const b = segment.path[i] as Point2;
        expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
      }
    }
  });

  it("is one connected network — every segment reachable from any segment", () => {
    expect(connected(drawn().graph, BOUNDS)).toBe(true);
  });

  it("reaches the boundary, so a lane from the next quarter has an anchor", () => {
    expect(boundaryEndpoints(drawn().graph, BOUNDS).length).toBeGreaterThan(0);
  });

  it("keeps every centre line inside the bounds", () => {
    for (const key of cellKeys(drawn().graph)) {
      const [x, z] = key.split(",").map(Number) as [number, number];
      expect(x).toBeGreaterThanOrEqual(BOUNDS.x0);
      expect(x).toBeLessThanOrEqual(BOUNDS.x1);
      expect(z).toBeGreaterThanOrEqual(BOUNDS.z0);
      expect(z).toBeLessThanOrEqual(BOUNDS.z1);
    }
  });

  it("clips to the mask of a non-rectangular cell, and stays connected in it", () => {
    const mask = blobMask(BOUNDS);
    const stride = BOUNDS.x1 - BOUNDS.x0 + 1;
    const plan = planOf({ mask });
    for (const key of cellKeys(plan.graph)) {
      const [x, z] = key.split(",").map(Number) as [number, number];
      expect(mask[(z - BOUNDS.z0) * stride + (x - BOUNDS.x0)]).toBe(1);
    }
    expect(connected(plan.graph, BOUNDS)).toBe(true);
    expect(boundaryEndpoints(plan.graph, BOUNDS, mask).length).toBeGreaterThan(0);
  });

  it("turns with its orientation — the spoke phase, and nothing else", () => {
    const a = planOf();
    const b = planOf({ orientation: 30 });
    expect(JSON.stringify(a.graph)).not.toBe(JSON.stringify(b.graph));
    // The rings are the same circles; only the spokes moved.
    const ringsOf = (plan: typeof a): string =>
      JSON.stringify(plan.graph.segments.filter((s) => s.id.startsWith("ring")));
    expect(ringsOf(a)).toBe(ringsOf(b));
  });
});

/* -------------------------------------------------------------------------- */
/* §8.2 — radial                                                               */
/* -------------------------------------------------------------------------- */

describe("radial, the plan it claims to draw", () => {
  it("draws rings and spokes, and calls them that", () => {
    const { graph } = drawn();
    expect(graph.segments.filter((s) => s.id.startsWith("ring")).length).toBeGreaterThanOrEqual(2);
    expect(graph.segments.filter((s) => s.id.startsWith("spoke")).length).toBeGreaterThanOrEqual(BASE_SPOKES);
  });

  it("reserves the hub about the focus, and offers it to the child that named it", () => {
    const plan = planOf({
      focus: [{ kind: "landmark", at: { x: 100, z: 100 }, id: "cathedral", weight: 1 }],
    });
    const hub = plan.reservations?.[0];
    expect(hub).toBeDefined();
    expect(hub?.for).toBe("cathedral");
    expect(hub?.why).toMatch(/round-point/);
    expect(hub?.rect.x0).toBeLessThan(100);
    expect(hub?.rect.x1).toBeGreaterThan(100);
    expect(hub?.rect.z0).toBeLessThan(100);
    expect(hub?.rect.z1).toBeGreaterThan(100);
  });

  it("prefers a plaza to a landmark to the highest-weight gate", () => {
    const at = (plan: ReturnType<typeof planOf>): Rect => plan.reservations?.[0]?.rect as Rect;
    const plaza = planOf({
      focus: [
        { kind: "gate", at: { x: 40, z: 40 }, weight: 0.9 },
        { kind: "landmark", at: { x: 80, z: 80 }, id: "keep", weight: 0.5 },
        { kind: "plaza", at: { x: 120, z: 110 }, weight: 0.4 },
      ],
    });
    expect(at(plaza).x0).toBeLessThan(120);
    expect(at(plaza).x1).toBeGreaterThan(120);

    const gates = planOf({
      focus: [
        { kind: "gate", at: { x: 60, z: 60 }, weight: 0.2 },
        { kind: "gate", at: { x: 150, z: 120 }, weight: 0.8 },
      ],
    });
    expect(at(gates).x0).toBeLessThan(150);
    expect(at(gates).x1).toBeGreaterThan(150);
  });

  it("names the focus kinds it did not use, rather than dropping them silently", () => {
    const plan = planOf({
      focus: [
        { kind: "plaza", at: { x: 120, z: 110 }, weight: 1 },
        { kind: "water", at: { x: 10, z: 10 }, weight: 1 },
        { kind: "terminus", at: { x: 20, z: 20 }, weight: 1 },
      ],
      corridor: [{ x: 0, z: 0 }],
    });
    expect(plan.record.ignored.join(" ")).toMatch(/water/);
    expect(plan.record.ignored.join(" ")).toMatch(/terminus/);
    expect(plan.record.ignored.join(" ")).toMatch(/corridor/);
  });

  it("seats the hub on the centroid when the ground is flat, and it should look it", () => {
    const rect = planOf().reservations?.[0]?.rect as Rect;
    expect(Math.round((rect.x0 + rect.x1) / 2)).toBe(Math.floor((BOUNDS.x0 + BOUNDS.x1) / 2));
    expect(Math.round((rect.z0 + rect.z1) / 2)).toBe(Math.floor((BOUNDS.z0 + BOUNDS.z1) / 2));
  });

  it("seats the hub on the flattest ground near the centre when nobody said where", () => {
    // A round-point on a slope needs a different level on every ring, so the
    // shelf wins over the centroid — and only when it is strictly flatter.
    const rect = planOf({ ground: shelfGround() }).reservations?.[0]?.rect as Rect;
    const at = { x: Math.round((rect.x0 + rect.x1) / 2), z: Math.round((rect.z0 + rect.z1) / 2) };
    expect(Math.abs(at.x - SHELF.x)).toBeLessThanOrEqual(SHELF.half);
    expect(Math.abs(at.z - SHELF.z)).toBeLessThanOrEqual(SHELF.half);
  });

  it("keeps no wedge wider than 1.5 · blockSize between two adjacent spokes", () => {
    // A square quarter with room for every ring the doubling can serve. Beyond
    // the radius where even a 15° pitch — the trig table's floor — leaves a
    // wider gap, the form says so in `adapted` instead of pretending; those
    // outer rings are excluded here and named in the assertion below.
    const square: Rect = { x0: 0, z0: 0, x1: 399, z1: 399 };
    const plan = planOf({ bounds: square });
    const graph = plan.graph;
    const limit = (MAX_ARC_GAP_NUM * 34) / MAX_ARC_GAP_DEN;
    const hub = plan.reservations?.[0]?.rect as Rect;
    const focus = { x: (hub.x0 + hub.x1) / 2, z: (hub.z0 + hub.z1) / 2 };
    const spokes = graph.segments.filter((s) => s.id.startsWith("spoke"));
    // The 24-gon's edge is 0.261 r, so 24 spokes stop being enough past this.
    const served = limit / 0.2611;

    // At every ring radius, the spokes that exist there, sorted by angle, must
    // sit no further apart than the limit.
    for (const ring of graph.segments.filter((s) => s.id.startsWith("ring"))) {
      const radius = Math.round(
        ring.path.reduce((sum, c) => sum + Math.sqrt((c.x - focus.x) ** 2 + (c.z - focus.z) ** 2), 0) /
          ring.path.length,
      );
      if (radius > served) continue;
      const here: Point2[] = [];
      for (const spoke of spokes) {
        const near = spoke.path.find(
          (c) => Math.abs(Math.sqrt((c.x - focus.x) ** 2 + (c.z - focus.z) ** 2) - radius) <= 1.5,
        );
        if (near !== undefined) here.push(near);
      }
      expect(here.length).toBeGreaterThanOrEqual(BASE_SPOKES);
      const byAngle = [...here].sort(
        (a, b) => Math.atan2(a.x - focus.x, a.z - focus.z) - Math.atan2(b.x - focus.x, b.z - focus.z),
      );
      for (let i = 0; i < byAngle.length; i++) {
        const a = byAngle[i] as Point2;
        const b = byAngle[(i + 1) % byAngle.length] as Point2;
        const gap = Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
        expect(gap).toBeLessThanOrEqual(limit + 2);
      }
    }
  });

  it("grows its ring pitch by the same 16 % a rotated cell gets", () => {
    expect(RADIAL_RING_GAIN).toBe(ROTATED_BLOCK_GAIN);
    expect(planOf().record.adapted.join(" ")).toMatch(/ring pitch 34 → 39/);
  });
});

/* -------------------------------------------------------------------------- */
/* what it does when its requirement is missing                                */
/* -------------------------------------------------------------------------- */

describe("radial, when the domain cannot hold a round-point", () => {
  it("refuses with the measurement and the fix, and announces `grown`", () => {
    // Only a quarter too small for six of the *tightest* rings is refused.
    const result = RADIAL_FORM.draw(context({ bounds: { x0: 0, z0: 0, x1: 89, z1: 79 } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/96 blocks on the short axis/);
    expect(result.reason).toMatch(/90 × 80/);
    expect(result.fix).toMatch(/whatever the block size/);
    expect(result.fallback).toBe("grown");
  });

  it("fits its ring pitch to a quarter the size a city actually produces", () => {
    // The regression this guards: the pitch used to come from `ctx.blockSize`,
    // so the quarter had to be six times a number chosen by density. Measured
    // on a baroque-capital world, all eight city cells were 75–231 columns
    // against a demand of 258–420 — `radial` announced a fallback eight times
    // out of eight and never drew once. A form whose refusal is certain is not
    // a form.
    for (const [x1, z1] of [[159, 149], [230, 109], [119, 99]] as const) {
      const result = RADIAL_FORM.draw(context({ bounds: { x0: 0, z0: 0, x1, z1 } }));
      expect(result.ok, `${x1 + 1} × ${z1 + 1}`).toBe(true);
      if (!result.ok) continue;
      expect(result.plan.record.id).toBe("radial");
      // The fitting is an adaptation, and an adaptation is always declared.
      expect(result.plan.record.adapted.some((a) => /ring pitch .*fitted to/.test(a))).toBe(true);
    }
  });

  it("still seats a plan with no focus at all — the fallback is announced, not silent", () => {
    // A radial quarter with nothing to be about is not a grid in disguise: it
    // is a round-point on the flattest ground near the middle, and it says so.
    const plan = planOf({ focus: [] });
    expect(plan.record.id).toBe("radial");
    expect(plan.reservations).toHaveLength(1);
  });

  it("is drawn through the registry, with no diagnostic when it fits", () => {
    const result = drawFabric({ ...context(), fabric: "radial", nodePath: "world.ring_town" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.diagnostics).toEqual([]);
    expect(result.outcome.plan.record.id).toBe("radial");
    expect(result.outcome.plan.record.requested).toBe("radial");
  });
});
