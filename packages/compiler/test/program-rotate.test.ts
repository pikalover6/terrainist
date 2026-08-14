/**
 * The rotation table — the half of bespoke facing that has nothing to do with
 * documents.
 *
 * Everything here is a pure function, and every one of them is checked at all
 * four quarters plus the round trip, because the round trip is the property
 * that actually matters: four turns of anything must be the thing it started
 * as, block states included, or a rotated landmark drifts out of its own
 * envelope one quarter at a time.
 */

import { describe, expect, it } from "vitest";

import {
  PROGRAM_ROTATIONS,
  cardinalToward,
  oppositeCardinal,
  rotateBlockString,
  rotateCardinal,
  rotateLocalPoint,
  rotateRun,
  rotatedEnvelope,
  rotatedFootprint,
  rotatedHeightAt,
  rotationFacing,
  type ProgramRotation,
} from "../src/programs/index.js";
import type { ProgramRun } from "../src/programs/run.js";

/** Turn a string all the way round, one quarter at a time. */
function fourTurns(block: string): string {
  let out = block;
  for (let i = 0; i < 4; i++) out = rotateBlockString(out, 90);
  return out;
}

describe("the quarter turn itself", () => {
  it("takes local north — the canonical front — to the cardinal asked for", () => {
    expect(rotationFacing("north")).toBe(0);
    expect(rotationFacing("east")).toBe(90);
    expect(rotationFacing("south")).toBe(180);
    expect(rotationFacing("west")).toBe(270);
  });

  it("walks the cardinals clockwise, as vanilla's own CLOCKWISE_90 does", () => {
    expect(rotateCardinal("north", 90)).toBe("east");
    expect(rotateCardinal("east", 90)).toBe("south");
    expect(rotateCardinal("south", 90)).toBe("west");
    expect(rotateCardinal("west", 90)).toBe("north");
    for (const cardinal of ["north", "east", "south", "west"] as const) {
      expect(rotateCardinal(cardinal, 0)).toBe(cardinal);
      expect(rotateCardinal(rotateCardinal(cardinal, 180), 180)).toBe(cardinal);
      expect(oppositeCardinal(cardinal)).toBe(rotateCardinal(cardinal, 180));
    }
  });

  it("snaps a bearing to a cardinal, and calls a zero bearing no bearing", () => {
    expect(cardinalToward(0, -10)).toBe("north");
    expect(cardinalToward(0, 10)).toBe("south");
    expect(cardinalToward(10, 0)).toBe("east");
    expect(cardinalToward(-10, 0)).toBe("west");
    // Ties resolve to the X axis — the solver's own rule, kept identical.
    expect(cardinalToward(7, 7)).toBe("east");
    expect(cardinalToward(-7, -7)).toBe("west");
    expect(cardinalToward(0, 0)).toBeUndefined();
  });

  it("swaps the envelope's horizontal edges at 90° and 270° only", () => {
    expect(rotatedEnvelope([11, 12, 21], 0)).toEqual([11, 12, 21]);
    expect(rotatedEnvelope([11, 12, 21], 90)).toEqual([21, 12, 11]);
    expect(rotatedEnvelope([11, 12, 21], 180)).toEqual([11, 12, 21]);
    expect(rotatedEnvelope([11, 12, 21], 270)).toEqual([21, 12, 11]);
    expect(rotatedFootprint(11, 21, 90)).toEqual([21, 11]);
  });
});

describe("rotating a point inside its envelope", () => {
  const w = 11;
  const d = 21;

  it("sends the front-left corner round the four corners", () => {
    // (0, 0) is the min corner and the front-left of a north-facing subject.
    expect(rotateLocalPoint(0, 0, 90, w, d)).toEqual([d - 1, 0]);
    expect(rotateLocalPoint(0, 0, 180, w, d)).toEqual([w - 1, d - 1]);
    expect(rotateLocalPoint(0, 0, 270, w, d)).toEqual([0, w - 1]);
  });

  it("keeps every point inside the turned envelope", () => {
    for (const rotation of PROGRAM_ROTATIONS) {
      const [rw, rd] = rotatedFootprint(w, d, rotation);
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          const [rx, rz] = rotateLocalPoint(x, z, rotation, w, d);
          expect(rx).toBeGreaterThanOrEqual(0);
          expect(rz).toBeGreaterThanOrEqual(0);
          expect(rx).toBeLessThan(rw);
          expect(rz).toBeLessThan(rd);
        }
      }
    }
  });

  it("comes back to itself after four quarters", () => {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        let point: readonly [number, number] = [x, z];
        let ew = w;
        let ed = d;
        for (let turn = 0; turn < 4; turn++) {
          point = rotateLocalPoint(point[0], point[1], 90, ew, ed);
          [ew, ed] = rotatedFootprint(ew, ed, 90);
        }
        expect(point).toEqual([x, z]);
      }
    }
  });
});

describe("rotating a block state", () => {
  it("leaves a block with nothing directional about it exactly as it was", () => {
    for (const block of [
      "minecraft:stone_bricks",
      "stone",
      "minecraft:oak_slab[type=top,waterlogged=false]",
      "minecraft:oak_door[hinge=left,half=upper,open=true]",
    ]) {
      for (const rotation of PROGRAM_ROTATIONS) {
        expect(rotateBlockString(block, rotation)).toBe(block);
      }
    }
  });

  it("turns `facing`, and leaves the vertical faces alone", () => {
    expect(rotateBlockString("minecraft:oak_stairs[facing=north,half=top]", 90)).toBe(
      "minecraft:oak_stairs[facing=east,half=top]",
    );
    expect(rotateBlockString("minecraft:oak_stairs[facing=north,half=top]", 180)).toBe(
      "minecraft:oak_stairs[facing=south,half=top]",
    );
    expect(rotateBlockString("minecraft:oak_stairs[facing=north,half=top]", 270)).toBe(
      "minecraft:oak_stairs[facing=west,half=top]",
    );
    expect(rotateBlockString("minecraft:observer[facing=up]", 90)).toBe(
      "minecraft:observer[facing=up]",
    );
  });

  it("leaves the properties that are already relative to facing", () => {
    // A stair's mitre, a door's hinge, a chest's half, a bed's end: all of them
    // turn *with* the block, so turning them here would turn them twice.
    const stair = "minecraft:oak_stairs[facing=north,shape=inner_left]";
    expect(rotateBlockString(stair, 90)).toBe("minecraft:oak_stairs[facing=east,shape=inner_left]");
    const chest = "minecraft:chest[facing=north,type=left]";
    expect(rotateBlockString(chest, 180)).toBe("minecraft:chest[facing=south,type=left]");
    const bed = "minecraft:red_bed[facing=north,part=head]";
    expect(rotateBlockString(bed, 270)).toBe("minecraft:red_bed[facing=west,part=head]");
  });

  it("swaps a pillar's axis on the odd quarters and not on the even ones", () => {
    expect(rotateBlockString("minecraft:oak_log[axis=x]", 90)).toBe("minecraft:oak_log[axis=z]");
    expect(rotateBlockString("minecraft:oak_log[axis=z]", 270)).toBe("minecraft:oak_log[axis=x]");
    expect(rotateBlockString("minecraft:oak_log[axis=x]", 180)).toBe("minecraft:oak_log[axis=x]");
    expect(rotateBlockString("minecraft:oak_log[axis=y]", 90)).toBe("minecraft:oak_log[axis=y]");
  });

  it("advances a sixteenth `rotation` by four per quarter, and wraps", () => {
    expect(rotateBlockString("minecraft:oak_sign[rotation=0]", 90)).toBe(
      "minecraft:oak_sign[rotation=4]",
    );
    expect(rotateBlockString("minecraft:oak_sign[rotation=13]", 90)).toBe(
      "minecraft:oak_sign[rotation=1]",
    );
    expect(rotateBlockString("minecraft:white_banner[rotation=6]", 180)).toBe(
      "minecraft:white_banner[rotation=14]",
    );
  });

  it("turns a rail's shape — straights, ascents and curves alike", () => {
    expect(rotateBlockString("minecraft:rail[shape=north_south]", 90)).toBe(
      "minecraft:rail[shape=east_west]",
    );
    expect(rotateBlockString("minecraft:rail[shape=ascending_east]", 90)).toBe(
      "minecraft:rail[shape=ascending_south]",
    );
    expect(rotateBlockString("minecraft:rail[shape=ascending_north]", 180)).toBe(
      "minecraft:rail[shape=ascending_south]",
    );
    // A curve names the two directions it joins, so turning it turns both.
    expect(rotateBlockString("minecraft:rail[shape=north_east]", 90)).toBe(
      "minecraft:rail[shape=south_east]",
    );
    expect(rotateBlockString("minecraft:rail[shape=north_east]", 270)).toBe(
      "minecraft:rail[shape=north_west]",
    );
  });

  it("carries a multi-face flag round with the face it names", () => {
    expect(rotateBlockString("minecraft:vine[south=true,up=false]", 90)).toBe(
      "minecraft:vine[west=true,up=false]",
    );
    expect(rotateBlockString("minecraft:glow_lichen[north=true,east=false]", 180)).toBe(
      "minecraft:glow_lichen[south=true,west=false]",
    );
  });

  it("leaves fence, wall and pane connections to the emit pass that recomputes them", () => {
    for (const block of [
      "minecraft:oak_fence[north=true,east=false]",
      "minecraft:stone_brick_wall[north=low,up=true]",
      "minecraft:glass_pane[north=true,south=true]",
      "minecraft:iron_bars[east=true]",
    ]) {
      expect(rotateBlockString(block, 90)).toBe(block);
    }
  });

  it("comes back to itself after four quarters, whatever the state", () => {
    for (const block of [
      "minecraft:oak_stairs[facing=north,half=top,shape=outer_right]",
      "minecraft:oak_log[axis=x]",
      "minecraft:oak_sign[rotation=7]",
      "minecraft:rail[shape=ascending_west]",
      "minecraft:rail[shape=south_west]",
      "minecraft:vine[north=true,south=false,east=true,west=false]",
      "minecraft:stone_bricks",
    ]) {
      expect(fourTurns(block)).toBe(block);
    }
  });
});

describe("rotating a whole run", () => {
  const envelope = [11, 12, 21] as const;

  function run(): ProgramRun {
    return {
      ok: true,
      programId: "sentinel",
      index: 0,
      ops: [],
      voxels: new Map([
        ["0,0,0", "minecraft:stone_bricks"],
        ["5,6,1", "minecraft:oak_stairs[facing=north]"],
      ]),
      result: {
        name: "sentinel",
        seatY: 0,
        anchors: { front: [5, 2, 0] },
        interiors: [{ min: [3, 1, 2], max: [7, 5, 8] }],
      },
      opStream: "pinned",
      outputHash: "b3:pinned",
      fuelUsed: 0,
      writes: 2,
      clipped: 0,
      logs: [],
      diagnostics: [],
    };
  }

  it("moves the voxels, the block states, the anchors and the interiors together", () => {
    const turned = rotateRun(run(), 90, envelope);
    expect([...turned.voxels.entries()].sort()).toEqual([
      ["19,6,5", "minecraft:oak_stairs[facing=east]"],
      ["20,0,0", "minecraft:stone_bricks"],
    ]);
    expect(turned.result?.anchors?.["front"]).toEqual([20, 2, 5]);
    // The box keeps its corners sorted, so `min` is still the min corner.
    expect(turned.result?.interiors?.[0]).toEqual({ min: [12, 1, 3], max: [18, 5, 7] });
  });

  it("leaves the hashes in the frame the program was verified in", () => {
    const turned = rotateRun(run(), 180, envelope);
    expect(turned.outputHash).toBe("b3:pinned");
    expect(turned.opStream).toBe("pinned");
    expect(turned.result?.seatY).toBe(0);
  });

  it("is the identity at zero — the same object, not a copy of it", () => {
    const original = run();
    expect(rotateRun(original, 0, envelope)).toBe(original);
  });

  it("asks the terrain the question in the program's own frame", () => {
    // `heightAt(0, 0)` is the program's front-left corner whichever way the
    // instance ends up standing.
    const sampled: [number, number][] = [];
    const sample = (x: number, z: number): number => {
      sampled.push([x, z]);
      return 0;
    };
    for (const rotation of PROGRAM_ROTATIONS) {
      rotatedHeightAt(sample, rotation as ProgramRotation, envelope)(0, 0);
    }
    expect(sampled).toEqual([
      [0, 0],
      [20, 0],
      [10, 20],
      [0, 10],
    ]);
  });
});
