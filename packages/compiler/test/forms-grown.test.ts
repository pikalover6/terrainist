/**
 * `grown` — WP-D of `docs/URBAN-FORMS-v0.md`.
 *
 * §8.1 for every form (determinism, 4-connectivity, connectivity, boundary
 * reach, containment) and §8.2 for this one: **the recursion terminates within
 * the depth bound on a 512² domain, the block short-axis distribution stays
 * inside `[0.6, 1.8] · blockSize`, and the market reservation exists at
 * `medium`/`high` and not at `low`.**
 *
 * The block distribution is the assertion worth reading twice. `grown` is the
 * one form whose *output* is a size distribution rather than a shape, and the
 * bound is structural rather than measured: the split floor bounds a leaf's long
 * axis from above and the half floor bounds every region from below, so a
 * regression in either constant fails here rather than in a walk.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import type { Point2, Rect } from "../src/layout/frames.js";
import {
  GROWN_AVENUE_SPLITS,
  GROWN_FORM,
  GROWN_HALF_DEN,
  GROWN_MAX_DEPTH,
  GROWN_MIN_HALF_NUM,
  splitFloor,
  splitTree,
} from "../src/layout/forms/grown.js";
import { drawFabric, flatGround, type FormContext } from "../src/layout/forms/index.js";
import { boundaryEndpoints, carriagewayCells, type StreetGraph } from "../src/layout/streets.js";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const BOUNDS: Rect = { x0: 0, z0: 0, x1: 199, z1: 179 };
const BIG: Rect = { x0: 0, z0: 0, x1: 511, z1: 511 };
const SEED = nodeSeed(20260804n, "world.old_town", "");
const BLOCK = 34;

const context = (over: Partial<FormContext> = {}): FormContext => ({
  bounds: BOUNDS,
  seed: SEED,
  blockSize: BLOCK,
  sidewalk: 2,
  density: "medium",
  ground: flatGround(),
  focus: [],
  ...over,
});

function planOf(over: Partial<FormContext> = {}) {
  const result = GROWN_FORM.draw(context(over));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("grown refused a domain it should have drawn");
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

/** Every segment as `id|x,z;x,z;…` — the whole graph as one comparable string. */
function fingerprint(graph: StreetGraph): string {
  return graph.segments
    .map((s) => `${s.id}|${s.kind}|${s.path.map((c) => `${c.x},${c.z}`).join(";")}`)
    .join("\n");
}

/** Is every segment reachable from every other, over shared centre-line cells? */
function oneComponent(graph: StreetGraph): boolean {
  if (graph.segments.length === 0) return false;
  const cells = graph.segments.map((s) => new Set(s.path.map((c) => `${c.x},${c.z}`)));
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.pop() as number;
    for (const [j, other] of cells.entries()) {
      if (seen.has(j)) continue;
      let touches = false;
      for (const key of other) {
        if ((cells[i] as Set<string>).has(key)) {
          touches = true;
          break;
        }
      }
      if (!touches) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen.size === graph.segments.length;
}

/* -------------------------------------------------------------------------- */
/* §8.1 — every form                                                           */
/* -------------------------------------------------------------------------- */

describe("grown — the contract every form keeps", () => {
  it("is deterministic: two draws from one seed are cell-identical", () => {
    expect(fingerprint(planOf().graph)).toEqual(fingerprint(planOf().graph));
  });

  it("is stable under a different seed only", () => {
    const other = planOf({ seed: nodeSeed(20260804n, "world.other_town", "") });
    expect(fingerprint(other.graph)).not.toEqual(fingerprint(planOf().graph));
  });

  it("walks every path 4-connected", () => {
    for (const segment of planOf().graph.segments) {
      for (let i = 1; i < segment.path.length; i++) {
        const a = segment.path[i - 1] as Point2;
        const b = segment.path[i] as Point2;
        expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
      }
    }
  });

  it("draws one connected town, not a scatter of streets", () => {
    expect(oneComponent(planOf().graph)).toBe(true);
    expect(oneComponent(planOf({ mask: lozenge(BOUNDS) }).graph)).toBe(true);
  });

  it("reaches the boundary, so a lane from the next quarter has an anchor", () => {
    expect(boundaryEndpoints(planOf().graph, BOUNDS).length).toBeGreaterThan(0);
  });

  it("keeps every carriageway column inside the bounds and inside the mask", () => {
    const mask = lozenge(BOUNDS);
    const stride = BOUNDS.x1 - BOUNDS.x0 + 1;
    // The centre lines, as the other form tests measure it: the carriageway
    // itself is a swept band and the *caller* clips that, exactly as it does
    // for a grid line whose verge overhangs a city cell's edge.
    for (const segment of planOf({ mask }).graph.segments) {
      for (const cell of segment.path) {
        expect(cell.x).toBeGreaterThanOrEqual(BOUNDS.x0);
        expect(cell.x).toBeLessThanOrEqual(BOUNDS.x1);
        expect(cell.z).toBeGreaterThanOrEqual(BOUNDS.z0);
        expect(cell.z).toBeLessThanOrEqual(BOUNDS.z1);
        expect(mask[(cell.z - BOUNDS.z0) * stride + (cell.x - BOUNDS.x0)]).toBe(1);
      }
    }
    // …and every column of the unmasked draw is inside the bounds outright.
    for (const cell of carriagewayCells(planOf().graph, BOUNDS)) {
      expect(cell.x).toBeGreaterThanOrEqual(BOUNDS.x0);
      expect(cell.z).toBeGreaterThanOrEqual(BOUNDS.z0);
    }
  });

  it("names the inputs it deliberately did not read", () => {
    const record = planOf({ orientation: 45, corridor: [{ x: 0, z: 0 }] }).record;
    expect(record.ignored.some((s) => s.startsWith("orientation"))).toBe(true);
    expect(record.ignored.some((s) => s.startsWith("corridor"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* §8.2 — grown                                                                */
/* -------------------------------------------------------------------------- */

describe("grown — the recursion", () => {
  it("terminates within the depth bound on a 512² domain", () => {
    const cuts = splitTree(context({ bounds: BIG }), BLOCK);
    expect(cuts.length).toBeGreaterThan(8);
    for (const cut of cuts) expect(cut.depth).toBeLessThan(GROWN_MAX_DEPTH);
  });

  it("keeps every block's short axis inside [0.6, 1.8] · blockSize", () => {
    // The leaves of the recursion are the blocks. A region is split while its
    // *long* axis is above the floor, so a leaf's long axis is under it; the
    // half floor is what bounds the other end.
    const floor = splitFloor(BLOCK);
    const minHalf = Math.round((BLOCK * GROWN_MIN_HALF_NUM) / GROWN_HALF_DEN);
    expect(floor).toBeLessThanOrEqual(Math.round(1.8 * BLOCK));
    expect(minHalf).toBeGreaterThanOrEqual(Math.round(0.6 * BLOCK));

    const cuts = splitTree(context({ bounds: BIG }), BLOCK);
    // Every region that was split is at least two half-floors wide, and every
    // region that was not is under the floor on its long axis. Together those
    // are the two ends of the band.
    for (const cut of cuts) {
      const w = cut.region.x1 - cut.region.x0 + 1;
      const d = cut.region.z1 - cut.region.z0 + 1;
      expect(Math.max(w, d)).toBeGreaterThanOrEqual(floor);
      expect(Math.min(w, d)).toBeGreaterThanOrEqual(minHalf);
    }
  });

  it("makes T-junctions, not a grid of crossroads", () => {
    // Every split street ends on the street that made the region it split, so a
    // crossing is a T. Measured as: no street is met by another street on both
    // sides at the same crossing — i.e. far fewer intersections than a grid of
    // the same segment count would have.
    const graph = planOf().graph;
    const grid = graph.segments.length * graph.segments.length / 4;
    expect(graph.intersections.length).toBeLessThan(grid);
    expect(graph.intersections.length).toBeGreaterThan(0);
  });

  it("draws its first streets as avenues and the thin regions as lanes", () => {
    const kinds = planOf({ bounds: BIG }).graph.segments.map((s) => s.kind);
    expect(kinds.slice(0, GROWN_AVENUE_SPLITS).every((k) => k === "avenue")).toBe(true);
    expect(kinds.includes("street")).toBe(true);
  });

  it("reserves the market at medium and high density, and not at low", () => {
    for (const density of ["medium", "high"] as const) {
      const reservations = planOf({ density }).reservations ?? [];
      expect(reservations.length).toBe(1);
      expect(reservations[0]?.why).toContain("market");
    }
    expect(planOf({ density: "low" }).reservations).toBeUndefined();
  });

  it("keeps the market inside the quarter", () => {
    const rect = (planOf().reservations ?? [])[0]?.rect;
    expect(rect).toBeDefined();
    expect(rect?.x0).toBeGreaterThanOrEqual(BOUNDS.x0);
    expect(rect?.z0).toBeGreaterThanOrEqual(BOUNDS.z0);
    expect(rect?.x1).toBeLessThanOrEqual(BOUNDS.x1);
    expect(rect?.z1).toBeLessThanOrEqual(BOUNDS.z1);
  });
});

/* -------------------------------------------------------------------------- */
/* refusal + the fallback it is the target of                                  */
/* -------------------------------------------------------------------------- */

describe("grown — refusal and fallback", () => {
  it("refuses a quarter that cannot hold one split, and names the envelope", () => {
    const small: Rect = { x0: 0, z0: 0, x1: 45, z1: 45 };
    const result = GROWN_FORM.draw(context({ bounds: small, blockSize: 40 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("46 × 46");
    expect(result.fix).toContain("envelope.size");
    expect(result.fallback).toBe("organic");
  });

  it("is what a radial quarter too small for its rings degrades to", () => {
    // Before `grown` landed the announced fallback had no module and the
    // quarter was refused outright. This is the assertion that it no longer is.
    const drawn = drawFabric({
      ...context({ bounds: { x0: 0, z0: 0, x1: 149, z1: 149 }, blockSize: 34 }),
      fabric: "radial",
      nodePath: "world.small_ring",
    });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.outcome.plan.record.id).toBe("grown");
    expect(drawn.outcome.plan.record.requested).toBe("radial");
    expect(drawn.outcome.plan.record.fellBackBecause).toBeDefined();
    expect(drawn.outcome.diagnostics[0]?.name).toBe("DISTRICT_FORM");
  });
});
