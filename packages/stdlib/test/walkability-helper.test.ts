/**
 * The pocket detector, tested against hand-built rooms whose answer is known.
 *
 * Each fixture is one of the field failures that motivated the helper: a
 * sealed pocket behind furniture, a lantern hung across a one-wide aisle, a
 * stair the lint says is mountable, the same stair under a low ceiling, and a
 * clean room that must come back with nothing to report.
 */

import { describe, expect, it } from "vitest";

import { assertNoPockets, walkabilityReport, type WalkOp } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A rectangular stone room with a door in the south wall.
 *
 * Interior is `1..w` by `1..h`; the floor slab is `y = 0`, the walls run
 * `y = 1..3` and the ceiling is `y = 4`.
 */
function room(w: number, h: number, extra: readonly WalkOp[] = []) {
  const ops: WalkOp[] = [];
  const floorCells: { x: number; z: number }[] = [];
  for (let z = 0; z <= h + 1; z++) {
    for (let x = 0; x <= w + 1; x++) {
      const wall = x === 0 || z === 0 || x === w + 1 || z === h + 1;
      ops.push({ x, y: 0, z, block: "stone" });
      ops.push({ x, y: 4, z, block: "stone" });
      if (!wall) {
        floorCells.push({ x, z });
        continue;
      }
      for (let y = 1; y <= 3; y++) ops.push({ x, y, z, block: "stone_bricks" });
    }
  }
  // The door: the middle column of the south wall, both halves.
  const dx = Math.max(1, Math.floor((w + 1) / 2));
  ops.push({ x: dx, y: 1, z: 0, block: "oak_door", props: { half: "lower", facing: "north" } });
  ops.push({ x: dx, y: 2, z: 0, block: "oak_door", props: { half: "upper", facing: "north" } });
  ops.push(...extra);
  return { ops, meta: { floorCells, floorLevels: [0], door: { x: dx, z: 0 } } };
}

/** A cell walled in by furniture on all four sides. */
function sealedPocket() {
  // 5x5 room; the middle cell (3,3) is ringed by crafting tables.
  const desks: WalkOp[] = [
    [3, 2],
    [3, 4],
    [2, 3],
    [4, 3],
  ].map(([x, z]) => ({ x: x as number, y: 1, z: z as number, block: "crafting_table" }));
  return room(5, 5, desks);
}

/** A one-wide aisle with a lantern hung at head height across it. */
function lanternAisle() {
  return room(1, 5, [{ x: 1, y: 2, z: 3, block: "lantern", props: { hanging: "true" } }]);
}

/** A one-wide aisle interrupted by a stair a player may mount. */
function mountableStair(lowCeiling = false) {
  const extra: WalkOp[] = [
    { x: 1, y: 1, z: 3, block: "oak_stairs", props: { half: "bottom", facing: "south" } },
  ];
  if (lowCeiling) extra.push({ x: 1, y: 3, z: 3, block: "stone" });
  return room(1, 5, extra);
}

/* -------------------------------------------------------------------------- */
/* tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("walkabilityReport", () => {
  it("reports a clean room as wholly reachable", () => {
    const report = walkabilityReport(room(5, 5));
    expect(report.start).not.toBeNull();
    expect(report.pocket).toEqual([]);
    expect(report.blocked).toEqual([]);
    expect(report.reachable).toHaveLength(25);
    expect(report.ok).toBe(true);
    expect(() => assertNoPockets(room(5, 5))).not.toThrow();
  });

  it("finds a cell sealed behind furniture, and prints where it is", () => {
    const report = walkabilityReport(sealedPocket());
    expect(report.pocket).toEqual(["3,3"]);
    // The desks themselves are blocked, not pockets.
    expect(report.blocked.sort()).toEqual(["2,3", "3,2", "3,4", "4,3"]);
    expect(report.ok).toBe(false);
    expect(report.map).toContain("!");
    expect(() => assertNoPockets(sealedPocket(), { label: "sealed" })).toThrowError(
      /sealed: 1 floor cell\(s\) a player cannot reach/,
    );
  });

  it("treats a lantern at head height as a wall across the aisle", () => {
    const report = walkabilityReport(lanternAisle());
    // The lantern's own cell is not standable; everything past it is a pocket.
    expect(report.blocked).toEqual(["1,3"]);
    expect(report.pocket).toEqual(["1,4", "1,5"]);
    // The naive "is the floor empty" model would have called this fine: the
    // floor plane under the lantern is untouched.
    expect(lanternAisle().ops.some((op) => op.y === 1 && op.x === 1 && op.z === 3)).toBe(false);
  });

  it("mounts a bottom stair approached from its low face", () => {
    const report = walkabilityReport(mountableStair());
    expect(report.blocked).toEqual(["1,3"]);
    expect(report.pocket).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("refuses the same stair when there is no headroom to rise", () => {
    const report = walkabilityReport(mountableStair(true));
    expect(report.pocket).toEqual(["1,4", "1,5"]);
    expect(report.ok).toBe(false);
  });

  it("honours `exclude`, and reports a missing way in", () => {
    // Excluding the lantern column does not reconnect the aisle behind it.
    const excluded = walkabilityReport(lanternAisle(), { exclude: [[1, 3]] });
    expect(excluded.pocket).toEqual(["1,4", "1,5"]);
    // A room whose doorway is bricked up has no start at all.
    const sealed = room(3, 3).ops.filter((op) => !op.block.endsWith("_door"));
    const noDoor = { ops: sealed, meta: { floorCells: room(3, 3).meta.floorCells } };
    expect(walkabilityReport(noDoor).start).toBeNull();
    expect(() => assertNoPockets(noDoor)).toThrowError(/no walkable cell inside the door/);
  });
});
