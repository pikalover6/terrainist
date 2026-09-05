/**
 * `linear` — WP-A.
 *
 * §8.1 for every form, and §8.2 for this one: **every lot lies within
 * `ribDepth` of the spine or a rib, and the ground outside the lot mask carries
 * no buildings.** The lot mask is the whole reason this form exists — without
 * one the subdivision finds a single enormous block of leftover ground and lots
 * its perimeter into a hollow ring of houses facing nothing — so the mask is
 * tested as hard as the graph is.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import { LOT_DEPTH } from "../src/layout/district-constants.js";
import type { Point2, Rect } from "../src/layout/frames.js";
import {
  LINEAR_FORM,
  LINEAR_LOT_DEPTH,
  MIN_SPINE_BLOCKS,
  VALLEY_RELIEF
} from "../src/layout/forms/linear.js";
import { drawFabric, flatGround, type FormContext, type GroundSample } from "../src/layout/forms/index.js";
import { boundaryEndpoints, carriagewayCells, type StreetGraph } from "../src/layout/streets.js";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const BOUNDS: Rect = { x0: 0, z0: 0, x1: 299, z1: 119 };
const SEED = nodeSeed(20260804n, "world.ribbon", "");

const context = (over: Partial<FormContext> = {}): FormContext => ({
  bounds: BOUNDS,
  seed: SEED,
  blockSize: 34,
  sidewalk: 2,
  density: "low",
  ground: flatGround(),
  focus: [],
  ...over
});

function planOf(over: Partial<FormContext> = {}) {
  const result = LINEAR_FORM.draw(context(over));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("linear refused a domain it should have drawn");
  return result.plan;
}

/** A lozenge cell — the clipped polygon a city plan lays. */
function lozenge(bounds: Rect): Uint8Array {
  const w = bounds.x1 - bounds.x0 + 1;
  const d = bounds.z1 - bounds.z0 + 1;
  const out = new Uint8Array(w * d);
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      out[z * w + x] = Math.abs(x - cx) / (w / 2) + Math.abs(z - cz) / (d / 2) <= 0.95 ? 1 : 0;
    }
  }
  return out;
}

/** A valley running east–west, its floor drifting off the centre line. */
function valleyGround(): GroundSample {
  const floorZ = (x: number): number => 40 + Math.floor(x / 10);
  const height = (x: number, z: number): number => 64 + Math.abs(z - floorZ(x));
  return {
    height,
    water: () => false,
    slope: () => 1,
    relief: 60,
    levelled: false,
    waterReach: Number.POSITIVE_INFINITY
  };
}

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
      [0, -1]
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

describe("linear, the properties every form owes its consumers", () => {
  it("draws the same plan twice from one seed, ids and order included", () => {
    const a = planOf();
    const b = planOf();
    expect(JSON.stringify(a.graph)).toBe(JSON.stringify(b.graph));
    expect(Array.from(a.lotMask as Uint8Array)).toEqual(Array.from(b.lotMask as Uint8Array));
  });

  it("does not move when an unrelated node's seed changes", () => {
    const other = nodeSeed(20260804n, "world.somewhere_else", "");
    expect(JSON.stringify(planOf({ seed: other }).graph)).toBe(JSON.stringify(planOf().graph));
  });

  it("steps by exactly one block on exactly one axis, everywhere", () => {
    for (const segment of planOf().graph.segments) {
      for (let i = 1; i < segment.path.length; i++) {
        const a = segment.path[i - 1] as Point2;
        const b = segment.path[i] as Point2;
        expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
      }
    }
  });

  it("is one connected network — a rib no road reaches is a defect", () => {
    expect(connected(planOf().graph, BOUNDS)).toBe(true);
    expect(connected(planOf({ density: "high" }).graph, BOUNDS)).toBe(true);
  });

  it("reaches the boundary at both ends of the street", () => {
    expect(boundaryEndpoints(planOf().graph, BOUNDS).length).toBeGreaterThan(0);
  });

  it("clips to the mask of a non-rectangular cell, and stays connected in it", () => {
    const mask = lozenge(BOUNDS);
    const stride = BOUNDS.x1 - BOUNDS.x0 + 1;
    const plan = planOf({ mask });
    for (const segment of plan.graph.segments) {
      for (const c of segment.path) {
        expect(mask[(c.z - BOUNDS.z0) * stride + (c.x - BOUNDS.x0)]).toBe(1);
      }
    }
    expect(connected(plan.graph, BOUNDS)).toBe(true);
    // …and the lot mask never leaves the cell either.
    const lots = plan.lotMask as Uint8Array;
    for (let k = 0; k < lots.length; k++) if (lots[k] === 1) expect(mask[k]).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* §8.2 — linear                                                               */
/* -------------------------------------------------------------------------- */

describe("linear, the ribbon it claims to draw", () => {
  it("draws one street the length of the quarter and dead-end ribs off it", () => {
    const { segments } = planOf().graph;
    const spine = segments.find((s) => s.id === "spine");
    expect(spine?.kind).toBe("avenue");
    expect(spine?.path.length).toBeGreaterThan(280);
    const ribs = segments.filter((s) => s.id.startsWith("rib"));
    expect(ribs.length).toBeGreaterThanOrEqual(MIN_SPINE_BLOCKS);
    for (const rib of ribs) expect(rib.kind).toBe("lane");
  });

  it("produces the lot mask that is the whole reason this form exists", () => {
    const plan = planOf();
    const lots = plan.lotMask as Uint8Array;
    expect(lots).toBeInstanceOf(Uint8Array);
    expect(lots.length).toBe((BOUNDS.x1 - BOUNDS.x0 + 1) * (BOUNDS.z1 - BOUNDS.z0 + 1));

    // Every lottable column is within ribDepth of a centre line, and there is
    // real open ground left over — the fields the village sits in.
    const ribDepth = 2 * LINEAR_LOT_DEPTH.low + 2 + 4;
    const stride = BOUNDS.x1 - BOUNDS.x0 + 1;
    const lines: Point2[] = [];
    for (const segment of plan.graph.segments) for (const c of segment.path) lines.push(c);
    let open = 0;
    for (let k = 0; k < lots.length; k++) {
      if (lots[k] !== 1) {
        open += 1;
        continue;
      }
      const x = BOUNDS.x0 + (k % stride);
      const z = BOUNDS.z0 + Math.floor(k / stride);
      const nearest = lines.reduce(
        (best, c) => Math.min(best, Math.abs(c.x - x) + Math.abs(c.z - z)),
        Number.POSITIVE_INFINITY,
      );
      expect(nearest).toBeLessThanOrEqual(ribDepth);
    }
    expect(open).toBeGreaterThan(lots.length / 10);
  });

  it("restates `LOT_DEPTH` without drifting from it", () => {
    expect(LINEAR_LOT_DEPTH).toEqual(LOT_DEPTH);
  });

  it("joins the rib ends with a back lane at high density, and not below", () => {
    const high = planOf({ density: "high" }).graph.segments.filter((s) => s.id.startsWith("back"));
    const low = planOf({ density: "low" }).graph.segments.filter((s) => s.id.startsWith("back"));
    expect(high.length).toBeGreaterThan(0);
    expect(low).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* the spine, in the order the design states                                   */
/* -------------------------------------------------------------------------- */

describe("linear, choosing the line the village is strung along", () => {
  it("takes the road corridor first, and says it ignored the orientation", () => {
    const corridor: Point2[] = [];
    for (let x = 10; x <= 289; x++) corridor.push({ x, z: 30 + ((x / 30) | 0) });
    const plan = planOf({ corridor, orientation: 90 });
    const spine = plan.graph.segments.find((s) => s.id === "spine");
    expect(spine?.path.some((c) => c.z < 40)).toBe(true);
    expect(plan.record.adapted.join(" ")).toMatch(/corridor/);
    expect(plan.record.ignored.join(" ")).toMatch(/orientation/);
  });

  it("takes the orientation heading when there is no corridor", () => {
    const plan = planOf({ orientation: 0 });
    const spine = plan.graph.segments.find((s) => s.id === "spine");
    // Heading 0 is +Z: a north–south street, across this east–west quarter.
    expect(new Set(spine?.path.map((c) => c.x)).size).toBe(1);
  });

  it("follows the valley floor when the ground has relief and nobody said otherwise", () => {
    const plan = planOf({ ground: valleyGround() });
    const spine = plan.graph.segments.find((s) => s.id === "spine") as { path: readonly Point2[] };
    const zs = new Set(spine.path.map((c) => c.z));
    expect(zs.size).toBeGreaterThan(1); // it drifts with the valley
    expect(plan.record.adapted.join(" ")).toMatch(new RegExp(`${VALLEY_RELIEF}|valley`));
    for (const c of spine.path) expect(Math.abs(c.z - (40 + Math.floor(c.x / 10)))).toBeLessThanOrEqual(8);
  });

  it("falls back to the long axis on flat ground with nothing else to go on", () => {
    const spine = planOf().graph.segments.find((s) => s.id === "spine") as { path: readonly Point2[] };
    expect(new Set(spine.path.map((c) => c.z)).size).toBe(1);
    expect(spine.path.length).toBe(300);
  });

  it("names the focus it did not use", () => {
    const plan = planOf({ focus: [{ kind: "plaza", at: { x: 100, z: 60 }, weight: 1 }] });
    expect(plan.record.ignored.join(" ")).toMatch(/focus/);
  });
});

/* -------------------------------------------------------------------------- */
/* what it does when its requirement is missing                                */
/* -------------------------------------------------------------------------- */

describe("linear, when the quarter is too short for a ribbon", () => {
  it("refuses with the measurement and the fix, and announces `grid`", () => {
    const result = LINEAR_FORM.draw(context({ bounds: { x0: 0, z0: 0, x1: 89, z1: 59 } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/102 blocks along its street/);
    expect(result.reason).toMatch(/90 × 60/);
    expect(result.fix).toMatch(/envelope\.size/);
    expect(result.fallback).toBe("grid");
  });

  it("is drawn through the registry, with no diagnostic when it fits", () => {
    const result = drawFabric({ ...context(), fabric: "linear", nodePath: "world.ribbon" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.diagnostics).toEqual([]);
    expect(result.outcome.plan.record.id).toBe("linear");
    expect(result.outcome.plan.lotMask).toBeInstanceOf(Uint8Array);
  });
});
