/**
 * G4.5a composition unit tests: the settlement clearing, the vegetation clip,
 * and the plaza pass.
 *
 * All three are asserted over synthetic fixtures rather than through a compile.
 * That is deliberate — the properties here are geometric ("no leaf inside a
 * building box", "the treeline ramps rather than steps", "the well's water
 * cannot flow") and a hand-built plan lets each one be provoked exactly, while
 * `village.test.ts` checks that the real example still exhibits them end to end.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import type { Rect } from "../src/layout/frames.js";
import type { OccupancyGrid, Placement } from "../src/layout/types.js";
import {
  CLEARING_FEATHER,
  CLEARING_MARGIN,
  buildSettlementClearing,
  clusterRects,
  convexHull,
  distanceToHull
} from "../src/terrain/clearing.js";
import {
  DECOR_APRON,
  MAX_CLIP_FRACTION,
  clipTrees,
  makeStructureClip,
  roadCorridorBoxes,
  structureBoxes,
  type StructureBox
} from "../src/terrain/clip.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { checkFluidStability } from "../src/terrain/validate.js";
import { resolvePalette } from "../src/terrain/palette.js";
import {
  AREA_EDGE_WOBBLE,
  TREE_TEMPLATES,
  areaContains,
  resolveForestParams,
  type TreePlacement
} from "../src/terrain/vegetation.js";
import { buildBuildings, type BuiltBuilding } from "../src/structures/buildings.js";
import { MIN_PLAZA_SIZE, pavePlaza } from "../src/structures/plaza.js";
import { ROAD_FILL_BAND } from "../src/structures/roads.js";
import { gradeProfile } from "../src/structures/sweep.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 128): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, height: (x: number, z: number) => number = () => 70): ColumnPlan {
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
    fluidKind: new Uint8Array(n),
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
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 1, lava: 2, snowLayer: 0 }
  };
}

function occupancy(r: Region): OccupancyGrid {
  return { region: r, mask: new Uint8Array(r.width * r.depth), byTag: new Map() };
}

const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;

function placement(nodePath: string, footprint: Rect, foundationY = 70): Placement {
  return {
    nodePath,
    id: nodePath,
    translation: [footprint.x0, foundationY, footprint.z0],
    yaw: 0,
    mirror: false,
    size: [footprint.x1 - footprint.x0 + 1, 1, footprint.z1 - footprint.z0 + 1],
    footprint,
    anchor: {
      x: Math.floor((footprint.x0 + footprint.x1) / 2),
      z: Math.floor((footprint.z0 + footprint.z1) / 2)
    },
    foundationY
  };
}

/** A tree of `shape` planted at `(x, z)`, standing on `baseY`. */
function tree(shape: TreePlacement["shape"], x: number, z: number, baseY = 71): TreePlacement {
  return {
    nodeId: "wood",
    speciesId: "t",
    shape,
    x,
    z,
    baseY,
    height: TREE_TEMPLATES[shape].minHeight,
    radiusDelta: 0,
    mega: false,
    trunkState: 10,
    leafState: 11
  };
}

/** A building box straddling `rect`, from `y0` to `y1` inclusive. */
function box(rect: Rect, y0: number, y1: number): StructureBox {
  return { ...rect, y0, y1 };
}

/* -------------------------------------------------------------------------- */
/* the clearing                                                                */
/* -------------------------------------------------------------------------- */

describe("convex hull", () => {
  it("keeps only the extreme points of a square with an interior point", () => {
    const hull = convexHull([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
      { x: 5, z: 5 }
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, z: 5 });
  });

  it("degenerates gracefully to a point and to a segment", () => {
    expect(convexHull([{ x: 3, z: 4 }])).toEqual([{ x: 3, z: 4 }]);
    expect(distanceToHull(convexHull([{ x: 0, z: 0 }]), 3, 4)).toBeCloseTo(5);
    const segment = convexHull([
      { x: 0, z: 0 },
      { x: 10, z: 0 }
    ]);
    expect(distanceToHull(segment, 5, 4)).toBeCloseTo(4);
  });

  it("reports zero distance inside and the edge distance outside", () => {
    const hull = convexHull([
      { x: 0, z: 0 },
      { x: 20, z: 0 },
      { x: 20, z: 20 },
      { x: 0, z: 20 }
    ]);
    expect(distanceToHull(hull, 10, 10)).toBe(0);
    expect(distanceToHull(hull, 25, 10)).toBeCloseTo(5);
  });
});

describe("settlement clearing", () => {
  const r = region();
  const rects: Rect[] = [
    { x0: -10, z0: -10, x1: 0, z1: 0 },
    { x0: 4, z0: -8, x1: 12, z1: 2 }
  ];
  const clearing = buildSettlementClearing(r, rects);
  const at = (x: number, z: number): number =>
    clearing.density[(z - r.z0) * r.width + (x - r.x0)] as number;

  it("clears the hull and its margin completely", () => {
    expect(at(0, -5)).toBe(0);
    expect(at(-10, -10)).toBe(0);
    // Just inside the margin, still fully cleared.
    expect(at(12 + CLEARING_MARGIN - 1, -3)).toBe(0);
    expect(clearing.clearedColumns).toBeGreaterThan(0);
  });

  it("ramps monotonically back to full density across the feather", () => {
    const samples: number[] = [];
    for (let d = 0; d <= CLEARING_MARGIN + CLEARING_FEATHER + 4; d++) {
      samples.push(at(12 + d, -3));
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i] as number).toBeGreaterThanOrEqual(samples[i - 1] as number);
    }
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(1);
    // Genuinely a ramp, not a step: some column in between is strictly partial.
    expect(samples.some((v) => v > 0 && v < 1)).toBe(true);
  });

  it("leaves the far field untouched", () => {
    expect(at(60, 60)).toBe(1);
  });

  it("gives a remote outlier its own clearing rather than one huge wedge", () => {
    const withTower = buildSettlementClearing(r, [...rects, { x0: 50, z0: 50, x1: 56, z1: 56 }]);
    expect(withTower.hulls).toHaveLength(2);
    // The ground between town and tower stays wooded.
    expect(withTower.density[(25 - r.z0) * r.width + (30 - r.x0)]).toBe(1);
  });

  it("clusters neighbours together and keeps clustering deterministic", () => {
    expect(clusterRects(rects)).toHaveLength(1);
    const a = clusterRects([...rects, { x0: 50, z0: 50, x1: 56, z1: 56 }]);
    const b = clusterRects([...rects, { x0: 50, z0: 50, x1: 56, z1: 56 }]);
    expect(a.map((g) => g.length)).toEqual([2, 1]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is a no-op when nothing was placed", () => {
    const empty = buildSettlementClearing(r, []);
    expect(empty.hulls).toEqual([]);
    expect(empty.clearedColumns).toBe(0);
    expect([...empty.density].every((v) => v === 1)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* the vegetation clip                                                         */
/* -------------------------------------------------------------------------- */

describe("structure clip", () => {
  const r = region();
  const hall: Rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
  const clip = makeStructureClip(r, [box(hall, 68, 82)]);

  it("blocks the whole box and nothing outside it", () => {
    expect(clip.blocked(5, 75, 5)).toBe(true);
    expect(clip.blocked(5, 68, 5)).toBe(true);
    expect(clip.blocked(5, 82, 5)).toBe(true);
    // Above the roof and below the skirt is free air/ground again.
    expect(clip.blocked(5, 83, 5)).toBe(false);
    expect(clip.blocked(5, 67, 5)).toBe(false);
    expect(clip.blocked(11, 75, 5)).toBe(false);
  });

  it("reports a claimed column independently of height", () => {
    expect(clip.blockedColumn(5, 5)).toBe(true);
    expect(clip.blockedColumn(11, 5)).toBe(false);
    // Off-region columns are simply not claimed, never an index error.
    expect(clip.blockedColumn(9999, 9999)).toBe(false);
  });

  /**
   * The apron: what keeps a four-block fallen log from lying against a wall.
   * `blockedColumn` answers for a plant standing in one column; deadwood needs
   * the wider question, and it is the same mask dilated by {@link DECOR_APRON}.
   */
  it("holds ground decor a fixed apron clear of every claimed column", () => {
    expect(clip.inApron(5, 5)).toBe(true);
    expect(clip.inApron(10 + DECOR_APRON, 5)).toBe(true);
    expect(clip.inApron(10 + DECOR_APRON + 1, 5)).toBe(false);
    expect(clip.inApron(5, -DECOR_APRON)).toBe(true);
    expect(clip.inApron(5, -DECOR_APRON - 1)).toBe(false);
    // The apron is square, so a diagonal corner is inside it too.
    expect(clip.inApron(10 + DECOR_APRON, 10 + DECOR_APRON)).toBe(true);
    expect(clip.inApron(9999, 9999)).toBe(false);
    // Everything the box claims is in its own apron, by construction.
    for (let x = hall.x0; x <= hall.x1; x++) expect(clip.inApron(x, hall.z0)).toBe(true);
  });

  it("aprons paved ground that owns no box, and clips nothing over it", () => {
    const paved = new Uint8Array(r.width * r.depth);
    const green: Rect = { x0: 40, z0: 40, x1: 46, z1: 46 };
    for (let z = green.z0; z <= green.z1; z++) {
      for (let x = green.x0; x <= green.x1; x++) paved[(z - r.z0) * r.width + (x - r.x0)] = 1;
    }
    const withPlaza = makeStructureClip(r, [box(hall, 68, 82)], paved);
    expect(withPlaza.inApron(43, 43)).toBe(true);
    expect(withPlaza.inApron(green.x1 + DECOR_APRON, 43)).toBe(true);
    expect(withPlaza.inApron(green.x1 + DECOR_APRON + 1, 43)).toBe(false);
    // Paving is a surface, not a solid: no canopy is clipped against it.
    expect(withPlaza.blockedColumn(43, 43)).toBe(false);
    expect(withPlaza.blocked(43, 71, 43)).toBe(false);
  });

  it("derives its boxes from foundation bottom to roof top plus one", () => {
    const built: BuiltBuilding = {
      nodePath: "world.hall",
      footprint: hall,
      interior: { x0: 1, z0: 1, x1: 9, z1: 9 },
      meta: { foundationDepth: 3, roofTop: 9 } as BuiltBuilding["meta"],
      blockCount: 100,
      floorY: 71
    };
    // One block wider than the footprint on every side: the eave course and the
    // rest of the facade detail live in that apron ring — for wood. Leaves are
    // let back into the ring by `leafInset`.
    expect(structureBoxes([built])[0]).toEqual({
      x0: hall.x0 - 1,
      z0: hall.z0 - 1,
      x1: hall.x1 + 1,
      z1: hall.z1 + 1,
      y0: 68,
      y1: 81,
      leafInset: 1
    });
  });
});

/**
 * The eave ring, part by part (Kai's ruling, 2026-08-14).
 *
 * Withholding *leaves* from the ring cut every canopy that came near a house off
 * flat with one block of air behind it. Leaves may now touch the wall face; wood
 * may not; the road corridor's headroom rule is untouched and still eats both.
 */
describe("leaf contact against a wall", () => {
  const r = region();
  const hall: Rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
  const built: BuiltBuilding = {
    nodePath: "world.hall",
    footprint: hall,
    interior: { x0: 1, z0: 1, x1: 9, z1: 9 },
    meta: { foundationDepth: 3, roofTop: 9 } as BuiltBuilding["meta"],
    blockCount: 100,
    floorY: 71
  };
  const clip = makeStructureClip(r, structureBoxes([built]));

  it("lets a leaf stand in the ring and still withholds a log there", () => {
    // x = 11 is the ring column immediately outside the east wall.
    expect(clip.blocked(11, 75, 5, "leaves")).toBe(false);
    expect(clip.blocked(11, 75, 5, "wood")).toBe(true);
    // The default is the strict answer, so no unaware caller loosens anything.
    expect(clip.blocked(11, 75, 5)).toBe(true);
    // Corners of the ring behave the same way.
    expect(clip.blocked(-1, 75, -1, "leaves")).toBe(false);
    expect(clip.blocked(-1, 75, -1, "wood")).toBe(true);
  });

  it("still keeps every part out of the footprint itself", () => {
    expect(clip.blocked(5, 75, 5, "leaves")).toBe(true);
    expect(clip.blocked(0, 75, 0, "leaves")).toBe(true);
    expect(clip.blocked(10, 75, 10, "leaves")).toBe(true);
    // And the vertical extent is unchanged for leaves: skirt bottom to roof + 1.
    expect(clip.blocked(5, 68, 5, "leaves")).toBe(true);
    expect(clip.blocked(5, 81, 5, "leaves")).toBe(true);
    expect(clip.blocked(5, 82, 5, "leaves")).toBe(false);
  });

  it("plants a tree beside the wall and keeps the leaves that reach it", () => {
    // A tree whose canopy reaches the ring column but whose trunk stands clear.
    const beside = tree("oak_round", 13, 5);
    const result = clipTrees([beside], clip);
    expect(result.trees).toEqual([beside]);
    expect(result.dropped).toBe(0);
    // The clip's own reader agrees with the emit-side reader: every leaf the
    // tree puts in the ring survives, so nothing is counted as clipped.
    const blocks = TREE_TEMPLATES["oak_round"].blocks({
      height: TREE_TEMPLATES["oak_round"].minHeight,
      radiusDelta: 0,
      mega: false
    });
    const inRing = blocks.filter(
      (b) =>
        b.part === "leaves" &&
        beside.x + b.dx === 11 &&
        clip.blocked(beside.x + b.dx, beside.baseY + b.dy, beside.z + b.dz, "wood"),
    );
    expect(inRing.length).toBeGreaterThan(0);
    for (const b of inRing) {
      expect(
        clip.blocked(beside.x + b.dx, beside.baseY + b.dy, beside.z + b.dz, "leaves"),
      ).toBe(false);
    }
    expect(result.clippedBlocks).toBe(0);
  });

  it("keeps clipping leaves out of a road corridor", () => {
    const road = makeStructureClip(
      r,
      roadCorridorBoxes([{ path: [{ x: 30, z: 30, y: 70 }] }], 5),
    );
    // Lane headroom is a different law: no `leafInset`, so both parts are cut.
    expect(road.blocked(30, 72, 30, "leaves")).toBe(true);
    expect(road.blocked(30, 72, 30, "wood")).toBe(true);
    expect(road.blocked(33, 72, 30, "leaves")).toBe(true);
    // Above the clearance the crown is scenery again, for both parts.
    expect(road.blocked(30, 75, 30, "leaves")).toBe(false);
  });

  it("changes nothing at all in a world that built nothing", () => {
    // The leaf rule rides on building boxes. A clip made of road corridors —
    // the only other producer — answers identically for both parts everywhere,
    // so a world with no buildings emits exactly the blocks it emitted before.
    const road = makeStructureClip(
      r,
      roadCorridorBoxes([{ path: [{ x: 0, z: 0, y: 70 }, { x: 1, z: 0, y: 70 }] }], 5),
    );
    for (let z = -6; z <= 6; z++) {
      for (let x = -6; x <= 8; x++) {
        for (let y = 68; y <= 76; y++) {
          expect(road.blocked(x, y, z, "leaves")).toBe(road.blocked(x, y, z, "wood"));
        }
      }
    }
  });
});

describe("clipTrees", () => {
  const r = region();
  const hall: Rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
  // A box tall enough to swallow anything planted inside its footprint.
  const clip = makeStructureClip(r, [box(hall, 60, 100)]);

  it("leaves a tree well clear of every structure alone", () => {
    const far = [tree("oak_round", 40, 40)];
    const result = clipTrees(far, clip);
    expect(result.trees).toEqual(far);
    expect(result.dropped).toBe(0);
    expect(result.clippedBlocks).toBe(0);
  });

  it("drops a tree standing inside a building outright", () => {
    const result = clipTrees([tree("oak_round", 5, 5)], clip);
    expect(result.trees).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it("keeps a tree that only grazes a wall, and counts what it loses", () => {
    // Far enough out that a two-block canopy overlaps the box by a sliver.
    const grazing = tree("oak_round", 12, 5);
    const result = clipTrees([grazing], clip);
    expect(result.trees).toEqual([grazing]);
    expect(result.dropped).toBe(0);
    expect(result.clippedBlocks).toBeGreaterThan(0);
  });

  it("honours the fraction threshold exactly", () => {
    // Sweep a tree in from deep inside the box to well clear of it; every
    // survivor must have lost at most the threshold share of its voxels.
    const shape = "oak_round" as const;
    const blocks = TREE_TEMPLATES[shape].blocks({
      height: TREE_TEMPLATES[shape].minHeight,
      radiusDelta: 0,
      mega: false
    });
    for (let x = 0; x <= 20; x++) {
      const t = tree(shape, x, 5);
      const hit = blocks.filter((b) => clip.blocked(t.x + b.dx, t.baseY + b.dy, t.z + b.dz)).length;
      const kept = clipTrees([t], clip).trees.length === 1;
      expect(kept).toBe(hit / blocks.length <= MAX_CLIP_FRACTION);
    }
  });

  it("preserves order and is a pure function of its inputs", () => {
    const forest = [tree("oak_round", 40, 40), tree("birch_slim", 5, 5), tree("spruce_tall", -30, 12)];
    const a = clipTrees(forest, clip);
    const b = clipTrees(forest, clip);
    expect(a.trees.map((t) => `${t.x},${t.z}`)).toEqual(b.trees.map((t) => `${t.x},${t.z}`));
    expect(a.trees.map((t) => `${t.x},${t.z}`)).toEqual(["40,40", "-30,12"]);
  });
});

/* -------------------------------------------------------------------------- */
/* the entrance apron                                                          */
/* -------------------------------------------------------------------------- */

describe("apron underpinning", () => {
  const r = region();
  const rect: Rect = { x0: -4, z0: -4, x1: 4, z1: 4 };
  /** Ground that falls away one block per column south of the footprint. */
  const slope = (_x: number, z: number): number => (z <= rect.z1 ? 70 : 70 - (z - rect.z1));

  function build(height: (x: number, z: number) => number): {
    blocks: readonly ReturnType<typeof buildBuildings>["blocks"][number][];
    floorY: number;
    p: ColumnPlan;
  } {
    const p = plan(r, height);
    const result = buildBuildings(
      [
        {
          nodePath: "world.cottage",
          placement: placement("world.cottage", rect),
          size: [9, 8, 9],
          params: { archetype: "cottage", floors: 1 },
          ports: { door: { type: "door", face: "south" } },
          seed: nodeSeed(5n, "world.cottage"),
          tags: ["house"]
        }
      ],
      p,
      stack,
    );
    expect(result.built).toHaveLength(1);
    return { blocks: result.blocks, floorY: (result.built[0] as BuiltBuilding).floorY, p };
  }

  /**
   * The doorstep defect: the floor plane is level and the ground is not, so a
   * porch block in the apron ring could stand a block or more above the ground
   * with daylight under it.
   */
  it("gives every apron block at the floor plane ground contact", () => {
    const { blocks, floorY, p } = build(slope);
    const solid = new Set(blocks.map((b) => `${b.x},${b.y},${b.z}`));
    const groundAt = (x: number, z: number): number =>
      p.ground[(z - r.z0) * r.width + (x - r.x0)] as number;
    const floating: string[] = [];
    for (const b of blocks) {
      if (b.x >= rect.x0 && b.x <= rect.x1 && b.z >= rect.z0 && b.z <= rect.z1) continue;
      if (b.y > floorY) continue;
      if (b.y - 1 <= groundAt(b.x, b.z)) continue;
      if (solid.has(`${b.x},${b.y - 1},${b.z}`)) continue;
      floating.push(`${b.x},${b.y},${b.z}`);
    }
    expect(floating).toEqual([]);
  });

  it("adds nothing when the ground already meets the apron", () => {
    const level = build(() => 70).blocks.length;
    const sloped = build(slope).blocks.length;
    expect(sloped).toBeGreaterThan(level);
    // Flat ground needs no plinth at all — the pass is a residual, like the
    // skirt it copies.
    const flat = build(() => 70);
    const outside = flat.blocks.filter(
      (b) => (b.x < rect.x0 || b.x > rect.x1 || b.z < rect.z0 || b.z > rect.z1) && b.y < flat.floorY,
    );
    expect(outside).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* the plaza                                                                   */
/* -------------------------------------------------------------------------- */

describe("pavePlaza", () => {
  const r = region();
  const rect: Rect = { x0: -11, z0: -11, x1: 10, z1: 10 };

  function pave(seed = 12345, p = plan(r)): ReturnType<typeof pavePlaza> & { plan: ColumnPlan } {
    const occ = occupancy(r);
    const result = pavePlaza({
      nodePath: "world.plaza",
      placement: placement("world.plaza", rect),
      plan: p,
      palette,
      stack,
      seed,
      occupancy: occ
    });
    return Object.assign(result, { plan: p, occ });
  }

  it("surfaces every column of the rectangle", () => {
    const out = pave();
    const area = (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
    expect(out.pavedColumns).toBe(area);
    expect(out.diagnostics).toEqual([]);
  });

  it("rings the square with a stone-brick border", () => {
    const out = pave();
    const border = palette.state("plaza.border");
    const idx = (x: number, z: number): number => (z - r.z0) * r.width + (x - r.x0);
    for (let x = rect.x0; x <= rect.x1; x++) {
      expect(out.plan.surface[idx(x, rect.z0)]).toBe(border);
      expect(out.plan.surface[idx(x, rect.z1)]).toBe(border);
    }
    expect(out.plan.surface[idx(rect.x0, 0)]).toBe(border);
    expect(out.plan.surface[idx(rect.x1, 0)]).toBe(border);
  });

  it("mixes path, gravel and cobble inside, deterministically", () => {
    const a = pave();
    const b = pave();
    expect([...a.plan.surface]).toEqual([...b.plan.surface]);
    const idx = (x: number, z: number): number => (z - r.z0) * r.width + (x - r.x0);
    const seen = new Set<number>();
    for (let z = rect.z0 + 1; z < rect.z1; z++) {
      for (let x = rect.x0 + 1; x < rect.x1; x++) seen.add(a.plan.surface[idx(x, z)] as number);
    }
    for (const symbol of ["plaza.path", "plaza.gravel", "plaza.cobble"]) {
      expect(seen).toContain(palette.state(symbol));
    }
  });

  it("builds a well whose water cannot flow", () => {
    const out = pave();
    expect(out.well).toBe(true);
    const cx = Math.floor((rect.x0 + rect.x1) / 2);
    const cz = Math.floor((rect.z0 + rect.z1) / 2);
    const centre = (cz - r.z0) * r.width + (cx - r.x0);
    expect(out.plan.fluidKind[centre]).toBe(FluidKind.WATER);
    // Exactly one block deep: floor at 69, surface at the plaza's own level.
    expect(out.plan.ground[centre]).toBe(69);
    expect(out.plan.fluidTop[centre]).toBe(70);
    expect(checkFluidStability(out.plan).unstable).toBe(0);
  });

  it("rings the well with walls, corners and two lit posts", () => {
    const out = pave();
    const wall = palette.state("plaza.well_wall");
    const border = palette.state("plaza.border");
    const post = palette.state("road.post");
    const lantern = palette.state("road.lantern");
    const cx = Math.floor((rect.x0 + rect.x1) / 2);
    const cz = Math.floor((rect.z0 + rect.z1) / 2);
    const ring = out.blocks.filter(
      (b) => b.y === 71 && Math.abs(b.x - cx) <= 1 && Math.abs(b.z - cz) <= 1,
    );
    expect(ring).toHaveLength(8);
    expect(ring.filter((b) => b.stateId === border)).toHaveLength(4);
    expect(ring.filter((b) => b.stateId === wall)).toHaveLength(4);
    // Two posts per lamp, not one: a single course reads as a lantern sunk into
    // the ground from every angle above.
    expect(out.blocks.filter((b) => b.stateId === post)).toHaveLength(4);
    expect(out.blocks.filter((b) => b.stateId === lantern)).toHaveLength(2);
  });

  it("seats two or three benches and no more", () => {
    const out = pave();
    expect(out.benches).toBeGreaterThanOrEqual(2);
    expect(out.benches).toBeLessThanOrEqual(3);
  });

  it("claims the whole green in the occupancy grid, under the plaza tag", () => {
    const occ = occupancy(r);
    pavePlaza({
      nodePath: "world.plaza",
      placement: placement("world.plaza", rect),
      plan: plan(r),
      palette,
      stack,
      seed: 1,
      occupancy: occ
    });
    const idx = (0 - r.z0) * r.width + (0 - r.x0);
    expect(occ.mask[idx]).toBe(1);
    expect(occ.byTag.get("plaza")?.[idx]).toBe(1);
  });

  it("skips a well the ground will not carry, without failing the compile", () => {
    // A step through the middle of the 3×3 breaks the level platform the
    // stability argument depends on, so no well is dug.
    const stepped = plan(r, (x) => (x < 0 ? 70 : 71));
    const out = pave(9, stepped);
    expect(out.well).toBe(false);
    expect(checkFluidStability(out.plan).unstable).toBe(0);
  });

  it("warns rather than paving a plaza too small to hold a border", () => {
    const tiny: Rect = { x0: 0, z0: 0, x1: MIN_PLAZA_SIZE - 2, z1: MIN_PLAZA_SIZE - 2 };
    const out = pavePlaza({
      nodePath: "world.plaza",
      placement: placement("world.plaza", tiny),
      plan: plan(r),
      palette,
      stack,
      seed: 1
    });
    expect(out.pavedColumns).toBe(0);
    expect(out.diagnostics.map((d) => d.name)).toEqual(["STRUCTURE_PARAM"]);
  });
});

/* -------------------------------------------------------------------------- */
/* roads meeting the plaza                                                     */
/* -------------------------------------------------------------------------- */

describe("gradeProfile with a per-cell fill band", () => {
  it("descends to a zero-band stretch and still steps at most one block", () => {
    const ground = new Array<number>(21).fill(70);
    // The middle five cells are the plaza: no fill band there.
    const band = ground.map((_, i) => (i >= 8 && i <= 12 ? 0 : ROAD_FILL_BAND));
    const graded = gradeProfile(ground, SEA, band);
    for (let i = 8; i <= 12; i++) expect(graded[i]).toBe(70);
    // Away from the plaza the road is back on its embankment...
    expect(graded[0]).toBe(70 + ROAD_FILL_BAND);
    // ...and the approach is a ramp, never a cliff.
    for (let i = 1; i < graded.length; i++) {
      expect(Math.abs((graded[i] as number) - (graded[i - 1] as number))).toBeLessThanOrEqual(1);
    }
  });

  it("matches the uniform-band result when every cell shares one band", () => {
    const ground = [70, 71, 75, 68, 66, 66, 72];
    expect(gradeProfile(ground, SEA, ROAD_FILL_BAND)).toEqual(gradeProfile(ground, SEA));
    expect(gradeProfile(ground, SEA, ground.map(() => ROAD_FILL_BAND))).toEqual(
      gradeProfile(ground, SEA),
    );
  });
});

describe("tree templates", () => {
  /**
   * The invariant a canopy has to satisfy: **no log is the topmost block of its
   * own column.**
   *
   * This is the "bare trunk tips" defect stated precisely. It was true of every
   * single-trunk shape and false of the 2×2 mega conifer, whose cap was pushed
   * only over `(0, 0)` — so three of its four trunk columns ended in a log with
   * open sky above, and a wood full of giants grew a field of little masts.
   */
  it("never leaves a log as the top of its column", () => {
    for (const [shape, template] of Object.entries(TREE_TEMPLATES)) {
      for (const mega of [false, true]) {
        for (const height of [template.minHeight, template.maxHeight]) {
          for (const radiusDelta of [-1, 0, 1]) {
            const blocks = template.blocks({ height, radiusDelta, mega });
            const top = new Map<string, { dy: number; part: string }>();
            for (const b of blocks) {
              const key = `${b.dx},${b.dz}`;
              const seen = top.get(key);
              if (seen === undefined || b.dy > seen.dy) top.set(key, { dy: b.dy, part: b.part });
            }
            const bare = [...top.entries()].filter(([, v]) => v.part === "log");
            expect(bare.map(([k]) => k), `${shape} mega=${mega} h=${height} r=${radiusDelta}`).toEqual(
              [],
            );
          }
        }
      }
    }
  });
});

describe("forest area feathering", () => {
  /**
   * A forest limited to a `zone` or a radius must *fade* at its boundary.
   *
   * `edgeFalloff` has always meant "taper the edge"; until now the only edge it
   * knew about was the region's, so an `area`-limited node stopped dead along a
   * straight line and a birch wood read as a hedge someone had trimmed.
   */

  /**
   * The feather alone was not enough: the *predicate* behind it was still the
   * nine-grid rectangle, so the patch's last trees stood on a ruled line and
   * two render reviews called the birch wood a rectangle. The boundary now
   * carries the same wobble the taper does.
   */
  it("bends a zone boundary into bays rather than a ruled line", () => {
    // A world the size the examples use: the wobble's wavelength is 30 blocks,
    // so a zone has to be a few of those across before "bays" means anything.
    const r = region(320);
    const params = resolveForestParams({
      area: { zone: "center" },
      species: [{ id: "b", shape: "birch_slim" }]
    });
    const halfX = r.width / 6;
    const halfZone = r.depth / 6;
    const cx = r.x0 + r.width / 2;
    const cz = r.z0 + r.depth / 2;
    const seed = 0x51ed7ee5;

    // Walk the east boundary row by row and record where it actually falls.
    const edges: number[] = [];
    for (let z = Math.round(cz - halfZone); z <= Math.round(cz + halfZone); z++) {
      let last = Number.NaN;
      for (let x = Math.round(cx); x <= Math.round(cx + halfX + AREA_EDGE_WOBBLE + 2); x++) {
        if (areaContains(r, params.area, x, z, seed)) last = x;
      }
      edges.push(last);
    }
    const spread = Math.max(...edges) - Math.min(...edges);
    // A rectangle has spread 0. One edge of one zone samples only a few
    // wavelengths of the noise, so it sees a fraction of the full ±amplitude —
    // but never more than the amplitude, which is the bound that matters: the
    // boundary bends, it does not wander off the zone.
    expect(spread).toBeGreaterThan(AREA_EDGE_WOBBLE / 2);
    expect(spread).toBeLessThanOrEqual(2 * AREA_EDGE_WOBBLE);
    // Unseeded, the boundary is the bare rectangle again — the wobble is opt-in
    // and every caller passes the node's own stream, so two woods never share
    // an edge shape.
    const straight = new Set<number>();
    for (let z = Math.round(cz - halfZone); z <= Math.round(cz + halfZone); z++) {
      let last = Number.NaN;
      for (let x = Math.round(cx); x <= Math.round(cx + halfX + AREA_EDGE_WOBBLE + 2); x++) {
        if (areaContains(r, params.area, x, z, 0)) last = x;
      }
      straight.add(last);
    }
    expect(straight.size).toBe(1);
  });

  it("keeps the wobbled boundary a pure function of the seed", () => {
    const r = region();
    const params = resolveForestParams({ area: { zone: "north" }, species: [] });
    const sample = (seed: number): string => {
      const bits: string[] = [];
      for (let z = -40; z <= 40; z += 3) {
        for (let x = -40; x <= 40; x += 3) {
          bits.push(areaContains(r, params.area, x, z, seed) ? "1" : "0");
        }
      }
      return bits.join("");
    };
    expect(sample(99)).toBe(sample(99));
    expect(sample(99)).not.toBe(sample(100));
  });
});
