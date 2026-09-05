/**
 * The **frontier West pack's ground pieces** — the three entries of
 * that stand on the ground rather than
 * roofing a room, held to the prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no `lantern`, no mud — and then the
 * properties this pack was written against, each of which is a rule the
 * physics lint would otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its
 *   own. The trestle's legs and the grave markers are the cases that matter,
 *   so the check is the `floating.isolated` rule itself, run over the finished
 *   op set;
 * - **water is contained.** The tank is the one entry that holds water, and
 *   every water cell it writes has solid under it and solid on all four sides
 *   of its own course — the plaza-well argument, asserted rather than asserted
 *   in prose;
 * - **the ground under the trestle stays walkable.** Its braces are at
 *   `y = 3`, so the whole pad keeps solid non-water floor with two courses of
 *   air over it, which is what the lint's 1x2 body needs;
 * - **no mud**, which is 15/16 of a block and cannot be stood on;
 * - **the posts are columns.** Every course of the trestle's legs, the claim
 *   post and every grave marker is a full block.
 */

import { describe, expect, it } from "vitest";

import {
  BOOT_D,
  BOOT_H,
  BOOT_MARKER_MAX,
  BOOT_MARKER_MIN,
  BOOT_W,
  FRONTIER_PROP_NAMES,
  PLACER_SPAN,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  TANK_DECK,
  TANK_SPAN,
  frontierPropFootprint,
  generateProp,
  isFrontierProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x1d5n, "world.frontier.props");
const OTHER = nodeSeed(0x1d5n, "world.frontier.props.other");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

function opsOf(prop: string, params: Record<string, unknown> = {}, seed = SEED): LocalVoxelOp[] {
  return generateProp({ prop, seed, params }).ops;
}

/**
 * Blocks the `floating.*` rule has nothing to say about — it polices a **full
 * cube** with six air faces, and none of these is one.
 */
const NOT_A_FULL_CUBE =
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|_pot$|cauldron|iron_bars|torch|campfire|chest|barrel|_leaves$|^water$|^fern$)/;

/** What a body may stand inside — the lint's vocabulary, for the ways through. */
const PASSABLE = /(_carpet$|_trapdoor$|torch|^air$|^fern$)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the frontier West pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isFrontierProp(p)).toBe(true);
    }
    expect(isFrontierProp("logging_camp")).toBe(false);
    expect(isFrontierProp("well_sweep")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as implemented", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("frontier_west");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
    expect(structureById("water_tank_trestle")?.kind).toBe("prop");
    expect(structureById("boot_hill_row")?.kind).toBe("prop");
  });

  /**
   * The pack's two route-following entries are the linework engine's, not this
   * registry's, and neither is ever a prop: the boardwalk is `infra.entry@0`'s
   * as of W3, and the sluice box stays open because a fall-following trough is
   * a route form the host does not have.
   */
  it("leaves the pack's route-following entries alone", () => {
    for (const id of ["boardwalk", "sluice_box"]) {
      expect(PROP_NAMES as readonly string[], id).not.toContain(id);
    }
    expect(structureById("boardwalk")?.status).toBe("implemented");
    expect(structureById("sluice_box")?.status).toBe("not_started");
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(frontierPropFootprint(p));
      const result = generateProp({ prop: p, seed: SEED });
      expect(result.meta.size, p).toEqual(declared.size);
      expect(result.ops.length, p).toBeGreaterThan(10);
      for (const op of result.ops) {
        expect(op.x, `${p} x`).toBeGreaterThanOrEqual(0);
        expect(op.x, `${p} x`).toBeLessThan(declared.size[0]);
        expect(op.z, `${p} z`).toBeGreaterThanOrEqual(0);
        expect(op.z, `${p} z`).toBeLessThan(declared.size[2]);
        expect(op.y, `${p} y`).toBeGreaterThanOrEqual(declared.minY);
        expect(op.y, `${p} y`).toBeLessThan(declared.minY + declared.size[1]);
      }
    }
  });

  it("ignores params it does not read", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const result = generateProp({ prop: p, seed: SEED });
      const [sx, , sz] = result.meta.size;
      for (const yaw of [90, 180, 270] as const) {
        const rotated = rotateOps(result.ops, yaw, sx, sz);
        expect(rotated.length, `${p} @${yaw}`).toBe(result.ops.length);
        const [w, d] = yaw === 180 ? [sx, sz] : [sz, sx];
        for (const op of rotated) {
          expect(op.x, `${p} @${yaw} x`).toBeGreaterThanOrEqual(0);
          expect(op.x, `${p} @${yaw} x`).toBeLessThan(w);
          expect(op.z, `${p} @${yaw} z`).toBeGreaterThanOrEqual(0);
          expect(op.z, `${p} @${yaw} z`).toBeLessThan(d);
        }
      }
    }
  });

  it("is deterministic, and reseeds without changing its box", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(frontierPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, uses no `chain`, hangs no lantern and lays no mud", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block.endsWith("lantern"), `${p} lantern`).toBe(false);
        expect(op.block, `${p} mud`).not.toBe("mud");
        expect(op.block, `${p} mud`).not.toBe("muddy_mangrove_roots");
        expect(op.block, `${p} path`).not.toBe("dirt_path");
      }
    }
  });

  /** Every one of them writes its whole ground plane, edge to edge. */
  it("writes its whole footprint at the base plane", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const declared = propFootprint(p);
      const at = indexOf(opsOf(p));
      for (let z = 0; z < declared.size[2]; z++) {
        for (let x = 0; x < declared.size[0]; x++) {
          expect(at.get(`${x},${declared.minY},${z}`), `${p} base at ${x},${z}`).toBeDefined();
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* support and water                                                           */
/* -------------------------------------------------------------------------- */

describe("the frontier props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const declared = propFootprint(p);
      const ops = opsOf(p);
      const at = indexOf(ops);
      const solid = (x: number, y: number, z: number): boolean => {
        if (y < declared.minY) return true; // the ground the prop stands on
        const block = at.get(`${x},${y},${z}`)?.block;
        return block !== undefined && block !== "air";
      };
      for (const op of ops) {
        if (op.block === "air" || NOT_A_FULL_CUBE.test(op.block)) continue;
        const touching =
          solid(op.x + 1, op.y, op.z) ||
          solid(op.x - 1, op.y, op.z) ||
          solid(op.x, op.y, op.z + 1) ||
          solid(op.x, op.y, op.z - 1) ||
          solid(op.x, op.y + 1, op.z) ||
          solid(op.x, op.y - 1, op.z);
        expect(touching, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(true);
      }
    }
  });

  /** Gravity blocks belong on floors, and every one of these is on one. */
  it("stands every falling block on something solid", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const declared = propFootprint(p);
      const at = indexOf(opsOf(p));
      for (const op of opsOf(p)) {
        if (!/^(sand|gravel|red_sand)$/.test(op.block)) continue;
        if (op.y === declared.minY) continue;
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBeDefined();
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).not.toBe("air");
      }
    }
  });

  /** Bars, walls and carpets are on the support chain too. */
  it("stands every bar, wall and carpet on something", () => {
    for (const p of FRONTIER_PROP_NAMES) {
      const declared = propFootprint(p);
      const at = indexOf(opsOf(p));
      for (const op of opsOf(p)) {
        if (!/(_wall$|fence|_carpet$|iron_bars)/.test(op.block)) continue;
        if (op.y === declared.minY + 1) continue; // standing on the ground plane
        const held = [
          [0, -1, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
          [0, 1, 0],
        ].some(([dx, dy, dz]) => {
          const block = at.get(`${op.x + (dx as number)},${op.y + (dy as number)},${op.z + (dz as number)}`)?.block;
          return block !== undefined && block !== "air";
        });
        expect(held, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(true);
      }
    }
  });

  /**
   * **Water the tank holds is contained** — the plaza-well argument, asserted.
   *
   * Every water cell has a solid block under it and a solid block on all four
   * sides of its own course, unless the neighbour is water too. That is a
   * plain box, and it is why a tank on a trestle cannot drain down its own
   * legs.
   */
  it("contains every cell of water the tank holds", () => {
    const at = indexOf(opsOf("water_tank_trestle"));
    const wet = (x: number, y: number, z: number): boolean =>
      at.get(`${x},${y},${z}`)?.block === "water";
    const solid = (x: number, y: number, z: number): boolean => {
      const block = at.get(`${x},${y},${z}`)?.block;
      return block !== undefined && block !== "air";
    };
    const cells = opsOf("water_tank_trestle").filter((op) => op.block === "water");
    expect(cells.length, "the tank holds water").toBeGreaterThan(0);
    for (const op of cells) {
      expect(solid(op.x, op.y - 1, op.z), `floor under ${op.x},${op.y},${op.z}`).toBe(true);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const held = wet(op.x + dx, op.y, op.z + dz) || solid(op.x + dx, op.y, op.z + dz);
        expect(held, `side of ${op.x},${op.y},${op.z} toward ${dx},${dz}`).toBe(true);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the props themselves                                                        */
/* -------------------------------------------------------------------------- */

describe("the frontier props themselves", () => {
  /**
   * The trestle's legs are **columns**, and the pad under it stays walkable —
   * which is the whole reason the braces are at `y = 3` and not at `y = 2`.
   */
  it("stands the water tank on four full columns over a walkable pad", () => {
    const at = indexOf(opsOf("water_tank_trestle"));
    const lo = 1;
    const hi = TANK_SPAN - 2;
    for (const [lx, lz] of [
      [lo, lo],
      [lo, hi],
      [hi, lo],
      [hi, hi],
    ] as const) {
      for (let y = 1; y < TANK_DECK; y++) {
        const block = at.get(`${lx},${y},${lz}`)?.block;
        expect(block, `leg at ${lx},${y},${lz}`).toBeDefined();
        expect(PASSABLE.test(block as string), `leg at ${lx},${y},${lz} is ${block}`).toBe(false);
      }
    }
    // The pad: every cell that is not a leg keeps two courses of air.
    let walkable = 0;
    for (let z = 0; z < TANK_SPAN; z++) {
      for (let x = 0; x < TANK_SPAN; x++) {
        const one = at.get(`${x},1,${z}`)?.block;
        const two = at.get(`${x},2,${z}`)?.block;
        const clear = (b: string | undefined): boolean => b === undefined || PASSABLE.test(b);
        if (clear(one) && clear(two)) walkable++;
      }
    }
    expect(walkable, "the pad under the tank").toBeGreaterThan(TANK_SPAN * 2);
  });

  it("gives the placer claim its spoil, its cradle and a post that reaches down", () => {
    const ops = opsOf("placer_claim");
    const at = indexOf(ops);
    expect(ops.some((op) => op.block === "gravel" && op.y === 1), "the spoil ridges").toBe(true);
    // The claim post is a full column from the ground to its head board.
    const px = PLACER_SPAN - 2;
    const pz = PLACER_SPAN - 2;
    for (let y = 1; y <= 3; y++) {
      const block = at.get(`${px},${y},${pz}`)?.block;
      expect(block, `post at ${y}`).toBeDefined();
      expect(block?.endsWith("_slab"), `post at ${y} is a slab`).toBe(false);
    }
    expect(at.get(`${px},4,${pz}`)?.block?.endsWith("_slab"), "the board").toBe(true);
  });

  /** No two neighbouring markers are the same height, and none of them floats. */
  it("cuts boot hill's markers crooked, every one of them a column", () => {
    const at = indexOf(opsOf("boot_hill_row"));
    const heights: number[] = [];
    for (let x = 0; x < BOOT_W; x++) {
      for (let z = 0; z < BOOT_D; z++) {
        let h = 0;
        for (let y = 1; y < BOOT_H; y++) {
          const block = at.get(`${x},${y},${z}`)?.block;
          if (block === undefined || block === "air") break;
          if (block.endsWith("_slab")) break;
          h = y;
        }
        if (h >= BOOT_MARKER_MIN) heights.push(h);
      }
    }
    expect(heights.length, "the markers").toBeGreaterThan(2);
    for (const h of heights) {
      expect(h, "marker height").toBeGreaterThanOrEqual(BOOT_MARKER_MIN);
      expect(h, "marker height").toBeLessThanOrEqual(BOOT_MARKER_MAX);
    }
    expect(new Set(heights).size, "no two the same height").toBeGreaterThan(1);
    // The wire fence is bars, never `chain` and never a themed fence — the
    // palette's `fence` symbol is a wall on half the shipped themes.
    expect(
      opsOf("boot_hill_row").some((op) => op.block === "iron_bars"),
      "the wire",
    ).toBe(true);
  });
});
