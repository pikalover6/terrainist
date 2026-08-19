/**
 * The deep block, and the three things that were wrong inside it.
 *
 * Kai walked `trojan_horse_in_troy` (`grown` × `medium` × `stepped`, 220 × 200)
 * twice and called its walled precinct near-empty. The measurement agreed:
 * 42 buildings over 7 604 footprint columns in a 44 000-column envelope —
 * **0.173** built ground per envelope column, against the grid quarter he
 * called good. Three separate defects were behind it, and this file states each
 * one as an invariant rather than as the number it happened to produce:
 *
 * 1. **A block is only as big as its inscribed rectangle** — and for a fabric
 *    whose streets curve or whose platform seams cut across it, that rectangle
 *    is a chord. The rest of the component was ground inside the town no lot
 *    could ever be cut from. {@link BLOCK_MULTI_RECT} lifts the `terraced`-only
 *    gate on {@link rectsOf}: Troy goes to 0.222, and a pitch-laid grid cannot
 *    move because its component *is* its bounding box.
 * 2. **A component too thin for one building is not a block.** 121 of Troy's
 *    141 "blocks" had a short axis under `MIN_INFILL_SIDE`; they produced no
 *    lots, could never produce one, and made the block land look healthy while
 *    a third of it was unbuildable by construction.
 * 3. **A block can be too deep for rim frontage**, and past a measured width an
 *    alley through it pays for itself — {@link leafBlockCap}, whose doc carries
 *    the arithmetic and the world that fixed the number.
 *
 * And the guard that should have caught all three before a walk:
 * `LOAM-W527`, built ground per column of block land, measured on quarters that
 * declared a wall.
 */

import { describe, expect, it } from "vitest";

import { HeightField, centeredRegion, type Region } from "@terrainist/stdlib";
import { validateSettlementDocument } from "@terrainist/spec";

import {
  BLOCK_MULTI_RECT,
  Grid,
  LOT_DEPTH,
  MAX_ALLEY_ROUNDS,
  MIN_INFILL_SIDE,
  WALLED_COVERAGE_FLOOR,
  blocksOf,
  cutDeepBlocks,
  leafBlockCap,
  rectsOf,
  solveDistricts,
} from "../src/layout/district.js";
import { STREET_WIDTH } from "../src/layout/forms/index.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";

/* -------------------------------------------------------------------------- */
/* small synthetic grounds                                                     */
/* -------------------------------------------------------------------------- */

/** A grid over `rect`, and a `member` mask the caller paints. */
function ground(rect: Rect): { grid: Grid; mask: Uint8Array } {
  const grid = new Grid(rect);
  return { grid, mask: new Uint8Array(grid.cells) };
}

function paint(grid: Grid, mask: Uint8Array, rect: Rect, value: number): void {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const k = grid.index(x, z);
      if (k >= 0) mask[k] = value;
    }
  }
}

function area(rect: Rect): number {
  return (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
}

function shortAxis(rect: Rect): number {
  return Math.min(rect.x1 - rect.x0 + 1, rect.z1 - rect.z0 + 1);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
}

/* -------------------------------------------------------------------------- */
/* 1 — the leaf cap                                                            */
/* -------------------------------------------------------------------------- */

describe("the leaf cap is the width at which an alley stops costing lot depth", () => {
  it("is two full-depth blocks plus the lane and its two verges", () => {
    // `medium` with a two-column sidewalk: 2 · (2 · 16 + 2) + 3 + 4.
    expect(leafBlockCap("medium", 2)).toBe(75);
    expect(leafBlockCap("high", 2)).toBe(2 * (2 * 17 + 2) + 3 + 4);
    expect(leafBlockCap("low", 1)).toBe(2 * (2 * 15 + 2) + 3 + 2);
  });

  it("leaves each half deep enough for two full-depth rows — the whole point", () => {
    for (const density of ["high", "medium", "low"] as const) {
      for (const sidewalk of [1, 2]) {
        const cap = leafBlockCap(density, sidewalk);
        const lane = STREET_WIDTH.lane + 2 * sidewalk;
        // The narrowest block the pass will cut, and what each half comes to.
        const half = Math.floor((cap + 1 - lane) / 2);
        // `subdivide` uses `min(LOT_DEPTH, floor((shortest − 2) / 2))`; this is
        // the assertion that the clamp never bites on a half we created.
        expect(Math.floor((half - 2) / 2)).toBeGreaterThanOrEqual(LOT_DEPTH[density]);
      }
    }
  });

  it("is out of reach of a pitch-laid grid block, so no grid quarter can move", () => {
    // A grid block is its centre-line spacing less a carriageway and two
    // sidewalks. The widest the default `medium` spacing can produce:
    const widestGridBlock = 42 - STREET_WIDTH.street - 2 * 2;
    expect(widestGridBlock).toBeLessThan(leafBlockCap("medium", 2));
  });
});

describe("an over-deep block is cut by a lane with a real identity", () => {
  // One 90 × 90 island of free ground inside a paved field: over the cap on
  // both axes, and surrounded by carriageway so the alley has something to
  // reach at both ends.
  const bounds: Rect = { x0: 0, z0: 0, x1: 119, z1: 119 };
  const block: Rect = { x0: 15, z0: 15, x1: 104, z1: 104 };

  function field(): { grid: Grid; blocked: Uint8Array; carriageway: Uint8Array } {
    const { grid, mask: blocked } = ground(bounds);
    blocked.fill(1);
    paint(grid, blocked, block, 0);
    const carriageway = new Uint8Array(grid.cells);
    // The paved ring: everything outside the block, which is what the alley's
    // ends walk out to find.
    for (let k = 0; k < grid.cells; k++) carriageway[k] = blocked[k];
    return { grid, blocked, carriageway };
  }

  it("cuts it, and leaves nothing over the cap", () => {
    const { grid, blocked, carriageway } = field();
    expect(shortAxis(block)).toBeGreaterThan(leafBlockCap("medium", 2));

    const cut = cutDeepBlocks({
      grid,
      carriageway,
      blocked,
      split: BLOCK_MULTI_RECT,
      density: "medium",
      sidewalkWidth: 2,
      bounds,
    });

    expect(cut.lanes.length).toBeGreaterThan(0);
    expect(cut.rounds).toBeGreaterThan(0);
    expect(cut.rounds).toBeLessThanOrEqual(MAX_ALLEY_ROUNDS);
    for (const leaf of blocksOf(grid, blocked, BLOCK_MULTI_RECT)) {
      expect(shortAxis(leaf.rect)).toBeLessThanOrEqual(leafBlockCap("medium", 2));
    }
  });

  it("gives every lane a segment identity a lot can front", () => {
    const { grid, blocked, carriageway } = field();
    const cut = cutDeepBlocks({
      grid,
      carriageway,
      blocked,
      split: BLOCK_MULTI_RECT,
      density: "medium",
      sidewalkWidth: 2,
      bounds,
    });
    const ids = new Set<string>();
    for (const lane of cut.lanes) {
      // A lane with no id, or a duplicate one, is a lot whose `street` names
      // nothing or names somebody else's carriageway.
      expect(lane.id).not.toBe("");
      expect(ids.has(lane.id)).toBe(false);
      ids.add(lane.id);
      expect(lane.kind).toBe("lane");
      expect(lane.width).toBe(STREET_WIDTH.lane);
      expect(lane.path.length).toBeGreaterThanOrEqual(MIN_INFILL_SIDE);
      // Axis-aligned and dense: one cell per step, no gaps for `carriagewayCells`
      // to fall through.
      const alongX = (lane.path[0] as { x: number }).x !== (lane.path[1] as { x: number }).x;
      for (let i = 1; i < lane.path.length; i++) {
        const a = lane.path[i - 1] as { x: number; z: number };
        const b = lane.path[i] as { x: number; z: number };
        expect(alongX ? b.x - a.x : b.z - a.z).toBe(1);
        expect(alongX ? b.z : b.x).toBe(alongX ? a.z : a.x);
      }
    }
  });

  it("leaves a block already under the cap untouched, column for column", () => {
    const small: Rect = { x0: 40, z0: 40, x1: 79, z1: 79 };
    const { grid, mask: blocked } = ground(bounds);
    blocked.fill(1);
    paint(grid, blocked, small, 0);
    const carriageway = Uint8Array.from(blocked);
    const before = Uint8Array.from(blocked);

    const cut = cutDeepBlocks({
      grid,
      carriageway,
      blocked,
      split: BLOCK_MULTI_RECT,
      density: "medium",
      sidewalkWidth: 2,
      bounds,
    });

    expect(cut.lanes).toEqual([]);
    expect(cut.rounds).toBe(0);
    expect(cut.sidewalk).toBeNull();
    expect(Array.from(blocked)).toEqual(Array.from(before));
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — slivers, and the rest of the component                                  */
/* -------------------------------------------------------------------------- */

describe("a component too thin for one building is not a block", () => {
  const bounds: Rect = { x0: 0, z0: 0, x1: 59, z1: 59 };

  it("rectsOf returns nothing rather than a sliver", () => {
    const { grid, mask } = ground(bounds);
    // Four columns wide: under `MIN_INFILL_SIDE` however it is subdivided.
    paint(grid, mask, { x0: 10, z0: 5, x1: 13, z1: 50 }, 1);
    expect(rectsOf(grid, mask, { x0: 10, z0: 5, x1: 13, z1: 50 })).toEqual([]);
  });

  it("blocksOf drops it too, on the single-rectangle path", () => {
    const { grid, mask: blocked } = ground(bounds);
    blocked.fill(1);
    paint(grid, blocked, { x0: 10, z0: 5, x1: 13, z1: 50 }, 0);
    expect(blocksOf(grid, blocked, false)).toEqual([]);
    expect(blocksOf(grid, blocked, true)).toEqual([]);
  });

  it("keeps a component that can hold exactly one building", () => {
    const { grid, mask: blocked } = ground(bounds);
    blocked.fill(1);
    const thin: Rect = { x0: 10, z0: 5, x1: 10 + MIN_INFILL_SIDE - 1, z1: 40 };
    paint(grid, blocked, thin, 0);
    const blocks = blocksOf(grid, blocked, false);
    expect(blocks.length).toBe(1);
    expect(shortAxis((blocks[0] as { rect: Rect }).rect)).toBe(MIN_INFILL_SIDE);
  });
});

describe("a block is every rectangle it holds, not just the biggest", () => {
  const bounds: Rect = { x0: 0, z0: 0, x1: 79, z1: 79 };

  /** An L: one 60 × 20 arm and one 20 × 60 arm sharing a corner. */
  function ell(): { grid: Grid; mask: Uint8Array } {
    const { grid, mask } = ground(bounds);
    paint(grid, mask, { x0: 5, z0: 5, x1: 64, z1: 24 }, 1);
    paint(grid, mask, { x0: 5, z0: 25, x1: 24, z1: 64 }, 1);
    return { grid, mask };
  }

  it("is on", () => {
    expect(BLOCK_MULTI_RECT).toBe(true);
  });

  it("takes the rest of the L rather than leaving it as open ground", () => {
    const { grid, mask } = ell();
    const rects = rectsOf(grid, mask, { x0: 5, z0: 5, x1: 64, z1: 64 });
    expect(rects.length).toBeGreaterThan(1);
    const covered = rects.reduce((sum, r) => sum + area(r), 0);
    const largest = Math.max(...rects.map(area));
    expect(covered).toBeGreaterThan(largest);
  });

  it("never hands two of them the same column", () => {
    const { grid, mask } = ell();
    const rects = rectsOf(grid, mask, { x0: 5, z0: 5, x1: 64, z1: 64 });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i] as Rect, rects[j] as Rect)).toBe(false);
      }
    }
  });

  it("holds every rectangle to the one-building floor", () => {
    const { grid, mask } = ell();
    for (const rect of rectsOf(grid, mask, { x0: 5, z0: 5, x1: 64, z1: 64 })) {
      expect(shortAxis(rect)).toBeGreaterThanOrEqual(MIN_INFILL_SIDE);
    }
  });

  it("is a no-op on a rectangular block, which is why a grid cannot move", () => {
    const { grid, mask } = ground(bounds);
    const rect: Rect = { x0: 10, z0: 10, x1: 42, z1: 42 };
    paint(grid, mask, rect, 1);
    expect(rectsOf(grid, mask, rect)).toEqual([rect]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 — the walled coverage floor, laid                                         */
/* -------------------------------------------------------------------------- */

const SPAN = 160;
const REGION = SPAN * 2;
const BOUNDS: Rect = { x0: -SPAN / 2, z0: -SPAN / 2, x1: SPAN / 2 - 1, z1: SPAN / 2 - 1 };
const SEED = 4471n;

function quarterDoc(params: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "deep_blocks", worldSeed: String(SEED) },
    ...extra,
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [REGION, REGION] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { seaLevel: 63, baseHeight: 74, amplitude: 14, octaves: 4, frequency: 0.005 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [SPAN, SPAN] },
          params,
          constraints: [{ zone: "center" }],
        },
      ],
    },
  };
}

function lay(params: Record<string, unknown>, extra?: Record<string, unknown>) {
  const validated = validateSettlementDocument(quarterDoc(params, extra));
  const doc = validated.document;
  if (doc === undefined) {
    throw new Error(
      `fixture did not validate: ${validated.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  const region: Region = centeredRegion(REGION, REGION);
  const field = new HeightField(region);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      field.values[j * region.width + i] = 74 + Math.floor((i + j) / 14);
    }
  }
  const placement: Placement = {
    nodePath: "world.quarter",
    id: "quarter",
    translation: [BOUNDS.x0, 74, BOUNDS.z0],
    yaw: 0,
    mirror: false,
    size: [SPAN, 1, SPAN],
    footprint: BOUNDS,
    anchor: { x: 0, z: 0 },
    foundationY: 74,
  };
  return solveDistricts({ doc, worldSeed: SEED, field, placements: [placement] });
}

const WALLED = {
  fabric: "grown",
  density: "low",
  blockSize: 46,
  mix: ["cottage"],
  walls: { style: "masonry", margin: 8 },
};

describe("a walled quarter that built almost nothing says so", () => {
  it("is a floor between the two walked ends, not a target", () => {
    expect(WALLED_COVERAGE_FLOOR).toBeGreaterThan(0.34);
    expect(WALLED_COVERAGE_FLOOR).toBeLessThan(0.61);
  });

  it("reports LOAM-W527 on a walled quarter whose blocks are mostly field", () => {
    const laid = lay(WALLED);
    const sparse = laid.diagnostics.filter((d) => d.name === "WALLED_QUARTER_SPARSE");
    expect(sparse.length).toBe(1);
    expect(sparse[0]?.code).toBe("LOAM-W527");
    expect(sparse[0]?.severity).toBe("warning");
    expect(sparse[0]?.nodePath).toBe("world.quarter");
    // The measurement itself is in the message; it is the whole point of it.
    expect(sparse[0]?.message).toMatch(/built \d+ of its \d+ block column/);
  });

  it("says nothing about the same quarter with no wall — a hamlet is a hamlet", () => {
    const { walls: _walls, ...unwalled } = WALLED;
    const laid = lay(unwalled);
    expect(laid.diagnostics.filter((d) => d.name === "WALLED_QUARTER_SPARSE")).toEqual([]);
  });

  it("hears the intent dial as well as the param — Troy wrote the dial", () => {
    const { walls: _walls, ...unwalled } = WALLED;
    const laid = lay(unwalled, { intent: { era: "medieval", character: { fortification: "walled" } } });
    expect(laid.diagnostics.some((d) => d.name === "WALLED_QUARTER_SPARSE")).toBe(true);
  });

  it("goes quiet once the quarter is dense enough to deserve its wall", () => {
    const laid = lay({ ...WALLED, density: "high", blockSize: 34 });
    expect(laid.diagnostics.filter((d) => d.name === "WALLED_QUARTER_SPARSE")).toEqual([]);
  });
});

describe("the laid quarter is still a quarter", () => {
  const laid = lay({ fabric: "grown", density: "medium", blockSize: 44, mix: ["townhouse"] });

  it("builds something", () => {
    expect(laid.placements.length).toBeGreaterThan(4);
  });

  it("never seats two buildings through each other", () => {
    const rects = laid.placements.map((p) => p.footprint);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i] as Rect, rects[j] as Rect)).toBe(false);
      }
    }
  });

  it("lays the same fabric twice, footprint for footprint", () => {
    const again = lay({ fabric: "grown", density: "medium", blockSize: 44, mix: ["townhouse"] });
    expect(JSON.stringify(again.placements.map((p) => p.footprint))).toBe(
      JSON.stringify(laid.placements.map((p) => p.footprint)),
    );
  });
});
