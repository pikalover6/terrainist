/**
 * `building.grammar@0` unit tests.
 *
 * These stand in for the visual QA the G4 code phase deliberately skips: every
 * property a human would check by walking around the building ("does it have
 * walls", "can I get in", "can I get upstairs", "is there a roof") is asserted
 * here instead.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_STYLE_DEFAULTS,
  generateBuilding,
  nodeSeed,
  rotateFacing,
  rotateLocalColumn,
  rotateOps,
  rotateProps,
  type BuildingParams,
  type BuildingRoof,
  type LocalVoxelOp,
  type StructureYaw,
} from "../src/index.js";

const SEED = nodeSeed(0x5eedn, "world.house");
const YAWS: readonly StructureYaw[] = [0, 90, 180, 270];

interface Case {
  readonly label: string;
  readonly size: readonly [number, number, number];
  readonly params: BuildingParams;
}

/** The shapes the village example exercises, plus the degenerate small one. */
const CASES: readonly Case[] = [
  { label: "cottage/gable/1", size: [7, 7, 9], params: { floors: 1, roof: "gable" } },
  { label: "hall/hip/2", size: [13, 12, 11], params: { floors: 2, roof: "hip" } },
  { label: "inn/gable/2", size: [11, 11, 9], params: { floors: 2, roof: "gable", windowRhythm: "paired" } },
  { label: "tower/flat/2", size: [7, 12, 7], params: { floors: 2, roof: "flat", windowRhythm: "sparse" } },
  { label: "shed/gable/1 (long z)", size: [7, 7, 13], params: { floors: 1, roof: "gable" } },
  { label: "minimum", size: [3, 5, 3], params: { floors: 1, roof: "flat" } },
];

function build(c: Case, extra: Partial<Parameters<typeof generateBuilding>[0]> = {}) {
  return generateBuilding({ size: c.size, params: c.params, seed: SEED, foundationDepth: 2, ...extra });
}

function key(op: { x: number; y: number; z: number }): string {
  return `${op.x},${op.y},${op.z}`;
}

describe("generateBuilding — determinism", () => {
  it("returns byte-identical ops for identical inputs", () => {
    for (const c of CASES) {
      expect(JSON.stringify(build(c).ops)).toBe(JSON.stringify(build(c).ops));
    }
  });

  it("emits exactly one op per cell, in canonical (y, z, x) order", () => {
    for (const c of CASES) {
      const ops = build(c).ops;
      const seen = new Set(ops.map(key));
      expect(seen.size).toBe(ops.length);
      const sorted = [...ops].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
      expect(ops).toEqual(sorted);
    }
  });

  it("changes materials but not geometry when the seed changes", () => {
    const c = CASES[1] as Case;
    const a = build(c);
    const b = build(c, { seed: nodeSeed(0x5eedn, "world.other_house") });
    expect(b.ops.map(key)).toEqual(a.ops.map(key));
    expect(b.meta).toEqual(a.meta);
    // The foundation mix is position-*and*-seed keyed, so at least one block
    // of the skirt has to differ; anything else would mean the seed is unused.
    expect(b.ops.map((o) => o.block).join()).not.toBe(a.ops.map((o) => o.block).join());
  });

  it("clamps floors into the 1..2 this v0 builds", () => {
    const meta = generateBuilding({ size: [9, 20, 9], params: { floors: 9 }, seed: SEED }).meta;
    expect(meta.params.floors).toBe(2);
  });
});

describe("generateBuilding — structural sanity", () => {
  it("never places a block outside the footprint", () => {
    for (const c of CASES) {
      const [sx, , sz] = c.size;
      for (const op of build(c).ops) {
        expect(op.x).toBeGreaterThanOrEqual(0);
        expect(op.z).toBeGreaterThanOrEqual(0);
        expect(op.x).toBeLessThan(sx);
        expect(op.z).toBeLessThan(sz);
      }
    }
  });

  it("encloses the perimeter at every wall level", () => {
    for (const c of CASES) {
      const [sx, , sz] = c.size;
      const { ops, meta } = build(c);
      const filled = new Set(ops.map(key));
      for (let y = 1; y <= meta.wallTop; y++) {
        for (let z = 0; z < sz; z++) {
          for (let x = 0; x < sx; x++) {
            if (x !== 0 && x !== sx - 1 && z !== 0 && z !== sz - 1) continue;
            expect(filled.has(`${x},${y},${z}`), `${c.label} wall gap at ${x},${y},${z}`).toBe(true);
          }
        }
      }
    }
  });

  it("sinks a foundation skirt to the depth the caller asked for", () => {
    for (const depth of [1, 3, 6]) {
      const { ops, meta } = build(CASES[0] as Case, { foundationDepth: depth });
      expect(meta.foundationDepth).toBe(depth);
      const below = ops.filter((o) => o.y < 0);
      const [sx, , sz] = (CASES[0] as Case).size;
      expect(below.length).toBe(depth * sx * sz);
      expect(Math.min(...below.map((o) => o.y))).toBe(-depth);
    }
  });

  it("cuts the door opening exactly at the declared port", () => {
    for (const face of ["north", "south", "east", "west"] as const) {
      const { ops, meta } = build(CASES[0] as Case, { door: { face } });
      expect(meta.door?.face).toBe(face);
      const at = new Map(ops.map((o) => [key(o), o] as const));
      const lower = at.get(`${meta.door?.x},1,${meta.door?.z}`);
      const upper = at.get(`${meta.door?.x},2,${meta.door?.z}`);
      expect(lower?.block).toBe(BUILDING_STYLE_DEFAULTS["door.block"]);
      expect(upper?.block).toBe(BUILDING_STYLE_DEFAULTS["door.block"]);
      expect(lower?.props?.["half"]).toBe("lower");
      expect(upper?.props?.["half"]).toBe("upper");
      // The door faces out of the wall it is cut into.
      expect(lower?.props?.["facing"]).toBe(face);
    }
  });

  it("puts the door on the named face's wall line", () => {
    const c = CASES[1] as Case;
    const [sx, , sz] = c.size;
    expect(build(c, { door: { face: "north" } }).meta.door?.z).toBe(0);
    expect(build(c, { door: { face: "south" } }).meta.door?.z).toBe(sz - 1);
    expect(build(c, { door: { face: "west" } }).meta.door?.x).toBe(0);
    expect(build(c, { door: { face: "east" } }).meta.door?.x).toBe(sx - 1);
  });

  it("never puts a window in the door column", () => {
    const { ops, meta } = build(CASES[2] as Case, { door: { face: "south" } });
    const panes = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["wall.window"]);
    expect(panes.length).toBe(meta.windowCount);
    expect(panes.some((o) => o.x === meta.door?.x && o.z === meta.door?.z)).toBe(false);
    // Corners are structure, never glazing.
    const [sx, , sz] = (CASES[2] as Case).size;
    expect(panes.some((o) => (o.x === 0 || o.x === sx - 1) && (o.z === 0 || o.z === sz - 1))).toBe(false);
  });

  it("roofs the whole footprint, whatever the shape", () => {
    for (const roof of ["gable", "hip", "flat"] as const) {
      for (const c of CASES) {
        const { ops, meta } = generateBuilding({
          size: c.size,
          params: { ...c.params, roof },
          seed: SEED,
        });
        const covered = new Set(
          ops.filter((o) => o.y >= meta.roofBase).map((o) => `${o.x},${o.z}`),
        );
        const [sx, , sz] = c.size;
        expect(covered.size, `${c.label} ${roof}`).toBe(sx * sz);
      }
    }
  });

  it("gives every storey a floor plane, and a stair up to it", () => {
    const c = CASES[1] as Case;
    const { ops, meta } = build(c);
    expect(meta.params.floors).toBe(2);
    expect(meta.floorLevels).toHaveLength(2);
    expect(meta.stairRuns).toHaveLength(1);

    const stairs = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["stair.interior"]);
    expect(stairs.length).toBeGreaterThan(0);
    // The run climbs one block per step, without a gap, from the ground floor
    // to the storey above.
    const ys = stairs.map((o) => o.y).sort((a, b) => a - b);
    expect(ys[0]).toBe(meta.stairRuns[0]);
    for (let i = 1; i < ys.length; i++) expect((ys[i] as number) - (ys[i - 1] as number)).toBe(1);
    expect(ys[ys.length - 1]).toBe((meta.floorLevels[1] as number) - 1);

    // …and the floor above is open over the run, so the climb is not into a
    // ceiling.
    const upper = new Set(
      ops.filter((o) => o.y === meta.floorLevels[1]).map((o) => `${o.x},${o.z}`),
    );
    for (const stair of stairs) expect(upper.has(`${stair.x},${stair.z}`)).toBe(false);
  });

  it("lights every storey", () => {
    for (const c of CASES) {
      const { ops, meta } = build(c);
      const lanterns = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["light.lantern"]);
      expect(lanterns.length).toBe(meta.lanternCount);
      if (meta.interior.x0 <= meta.interior.x1 && meta.interior.z0 <= meta.interior.z1) {
        expect(meta.lanternCount).toBe(meta.params.floors);
      }
    }
  });

  it("honours the material overrides", () => {
    const { ops } = generateBuilding({
      size: [9, 9, 9],
      params: { wallSymbol: "sandstone", trimSymbol: "acacia_log", roofSymbol: "brick_stairs" },
      seed: SEED,
      style: { "floor.interior": "smooth_stone" },
    });
    const blocks = new Set(ops.map((o) => o.block));
    expect(blocks.has("sandstone")).toBe(true);
    expect(blocks.has("acacia_log")).toBe(true);
    expect(blocks.has("brick_stairs")).toBe(true);
    expect(blocks.has("smooth_stone")).toBe(true);
    expect(blocks.has("oak_planks")).toBe(false);
  });

  it("falls back to the nearest of the three roofs it builds", () => {
    const roofOf = (name: string): BuildingRoof =>
      generateBuilding({ size: [9, 10, 9], params: { roof: name }, seed: SEED }).meta.params.roof;
    expect(roofOf("steep_gable")).toBe("gable");
    expect(roofOf("gambrel")).toBe("gable");
    expect(roofOf("pyramid")).toBe("hip");
    expect(roofOf("flat")).toBe("flat");
  });
});

describe("rotateOps", () => {
  it("is a bijection of the footprint onto the rotated box", () => {
    for (const c of CASES) {
      const [sx, , sz] = c.size;
      const ops = build(c).ops;
      for (const yaw of YAWS) {
        const rotated = rotateOps(ops, yaw, sx, sz);
        expect(rotated.length).toBe(ops.length);
        expect(new Set(rotated.map(key)).size).toBe(ops.length);
        const [rx, rz] = yaw === 90 || yaw === 270 ? [sz, sx] : [sx, sz];
        for (const op of rotated) {
          expect(op.x).toBeGreaterThanOrEqual(0);
          expect(op.z).toBeGreaterThanOrEqual(0);
          expect(op.x).toBeLessThan(rx);
          expect(op.z).toBeLessThan(rz);
        }
      }
    }
  });

  it("composes back to the identity over four quarter turns", () => {
    const c = CASES[1] as Case;
    const [sx, , sz] = c.size;
    const ops = build(c).ops;
    let round = ops.slice();
    for (let i = 0; i < 4; i++) {
      const [w, d] = i % 2 === 0 ? [sx, sz] : [sz, sx];
      round = rotateOps(round, 90, w, d);
    }
    expect(JSON.stringify(round)).toBe(JSON.stringify(ops));
  });

  it("rotates the `facing` property with the geometry", () => {
    // The headline case from the brief: a west-facing stair becomes
    // north-facing under a 90° turn.
    expect(rotateFacing("west", 90)).toBe("north");
    expect(rotateFacing("north", 90)).toBe("east");
    expect(rotateFacing("east", 90)).toBe("south");
    expect(rotateFacing("south", 90)).toBe("west");
    expect(rotateFacing("north", 180)).toBe("south");
    expect(rotateFacing("north", 270)).toBe("west");
    expect(rotateFacing("north", 0)).toBe("north");

    const op: LocalVoxelOp = { x: 0, y: 1, z: 0, block: "oak_stairs", props: { facing: "west", half: "bottom" } };
    const [turned] = rotateOps([op], 90, 5, 5);
    expect(turned?.props?.["facing"]).toBe("north");
    expect(turned?.props?.["half"]).toBe("bottom");
  });

  it("rotates the door of a placed building onto the rotated face", () => {
    const c = CASES[0] as Case;
    const [sx, , sz] = c.size;
    const { ops, meta } = build(c, { door: { face: "south" } });
    const doorOps = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["door.block"]);
    for (const yaw of YAWS) {
      const rotated = rotateOps(doorOps, yaw, sx, sz);
      const expectedFace = rotateFacing("south", yaw);
      for (const op of rotated) expect(op.props?.["facing"]).toBe(expectedFace);
      // Under yaw 90 the south wall (z = sz−1) becomes the west wall (x = 0).
      const moved = rotateLocalColumn(meta.door?.x as number, meta.door?.z as number, sx, sz, yaw);
      expect(rotated.every((o) => o.x === moved.x && o.z === moved.z)).toBe(true);
    }
  });

  it("rotates pillar axes and pane connection flags", () => {
    expect(rotateProps({ axis: "x" }, 90)).toEqual({ axis: "z" });
    expect(rotateProps({ axis: "z" }, 90)).toEqual({ axis: "x" });
    expect(rotateProps({ axis: "x" }, 180)).toEqual({ axis: "x" });
    expect(rotateProps({ axis: "y" }, 90)).toEqual({ axis: "y" });
    expect(rotateProps({ east: "true", west: "true" }, 90)).toEqual({ south: "true", north: "true" });
    expect(rotateProps({ north: "true", south: "true" }, 180)).toEqual({ south: "true", north: "true" });
    expect(rotateProps(undefined, 90)).toBeUndefined();
    expect(rotateProps({ half: "upper" }, 90)).toEqual({ half: "upper" });
  });

  it("keeps the rotated building's walls enclosing its rotated footprint", () => {
    const c = CASES[4] as Case;
    const [sx, , sz] = c.size;
    const { ops, meta } = build(c);
    for (const yaw of YAWS) {
      const rotated = rotateOps(ops, yaw, sx, sz);
      const [w, d] = yaw === 90 || yaw === 270 ? [sz, sx] : [sx, sz];
      const filled = new Set(rotated.map(key));
      for (let y = 1; y <= meta.wallTop; y++) {
        for (let x = 0; x < w; x++) {
          expect(filled.has(`${x},${y},0`)).toBe(true);
          expect(filled.has(`${x},${y},${d - 1}`)).toBe(true);
        }
      }
    }
  });
});
