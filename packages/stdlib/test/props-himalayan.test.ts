/**
 * The **himalayan_monastery pack's ground pieces** — the two entries of that
 * pack which stand on the bare ridge rather than roofing a room, held to the
 * prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no mud, no water — and then the properties
 * this pack was written against, each of which is a rule the physics lint would
 * otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its own;
 * - **THE FLAG RUN IS UNBROKEN.** A prayer flag line is the single most obvious
 *   thing in this pack to build wrong — the picture in everybody's head is
 *   bunting sagging through air between two poles, and every cell of that sag
 *   is `floating.isolated`. So the run is asserted directly: one course, no
 *   gaps, and a pole column at each end running to the base plane;
 * - **gravity blocks on the base plane only**;
 * - **the cairn lies low** — three courses at its tallest, every one of them
 *   standing on the course below it.
 */

import { describe, expect, it } from "vitest";

import {
  CAIRN_H,
  CAIRN_SPAN,
  FLAG_COURSE,
  FLAG_DEPTH,
  FLAG_H,
  FLAG_SPAN,
  HIMALAYAN_PROP_NAMES,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  generateProp,
  himalayanPropFootprint,
  isHimalayanProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xd20a6n, "world.ridge.props");
const OTHER = nodeSeed(0xd20a6n, "world.ridge.props.other");

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
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|_pot$|cauldron|iron_bars|iron_chain|torch|campfire|chest|barrel|_leaves$|^water$|^fern$)/;

/** Blocks that fall when the cell under them is air. */
const FALLING = /^(sand|red_sand|gravel|.*_concrete_powder|anvil.*)$/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the himalayan_monastery pack's props", () => {
  it("registers every one of them, once", () => {
    expect(HIMALAYAN_PROP_NAMES).toHaveLength(2);
    for (const p of HIMALAYAN_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isHimalayanProp(p)).toBe(true);
    }
    // The wilds, street and steppe waves own every plain marker word there is;
    // this pack claims its own compounds and nothing else.
    expect(isHimalayanProp("shaman_ovoo")).toBe(false);
    expect(isHimalayanProp("rune_stone")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as an implemented prop", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("himalayan_monastery");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(himalayanPropFootprint(p));
      const result = generateProp({ prop: p, seed: SEED });
      expect(result.meta.size, p).toEqual(declared.size);
      expect(result.ops.length, p).toBeGreaterThan(9);
      for (const op of result.ops) {
        expect(op.x, `${p} x`).toBeGreaterThanOrEqual(0);
        expect(op.x, `${p} x`).toBeLessThan(declared.size[0]);
        expect(op.z, `${p} z`).toBeGreaterThanOrEqual(0);
        expect(op.z, `${p} z`).toBeLessThan(declared.size[2]);
        expect(op.y, `${p} y`).toBeGreaterThanOrEqual(declared.minY);
        expect(op.y, `${p} y`).toBeLessThan(declared.minY + declared.size[1]);
      }
    }
    expect(propFootprint("prayer_flag_line").size).toEqual([FLAG_SPAN, FLAG_H, FLAG_DEPTH]);
    expect(propFootprint("mani_stone_cairn").size).toEqual([CAIRN_SPAN, CAIRN_H, CAIRN_SPAN]);
  });

  it("ignores params it does not read", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
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
    for (const p of HIMALAYAN_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(himalayanPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(9);
    }
  });

  it("hangs no signs, uses no `chain`, lays no mud or snow and writes no water", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block, `${p} mud`).not.toBe("mud");
        expect(op.block, `${p} snow`).not.toBe("snow");
        expect(op.block, `${p} path`).not.toBe("dirt_path");
        expect(op.block, `${p} fire`).not.toBe("campfire");
        // The pack's line: outdoors is dry. Its water lives in curbed indoor
        // basins, where the closure is something this project can prove.
        expect(op.block, `${p} water`).not.toBe("water");
        expect(op.props?.["lit"], `${p} lit ${op.block}`).not.toBe("true");
      }
    }
  });

  it("writes its whole footprint at the base plane", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
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
/* support, gravity, the flag run and the cairn                                */
/* -------------------------------------------------------------------------- */

describe("the himalayan props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
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

  it("stands every falling block on something solid", () => {
    for (const p of HIMALAYAN_PROP_NAMES) {
      const at = indexOf(opsOf(p));
      for (const op of opsOf(p)) {
        if (!FALLING.test(op.block)) continue;
        // The base plane is the ground itself; nowhere else may hold one.
        expect(op.y, `${p}: ${op.block} above the ground`).toBe(0);
        expect(at.get(`${op.x},0,${op.z}`), `${p}: ${op.x},${op.z}`).toBeDefined();
      }
    }
  });

  /**
   * **THE FLAG RUN IS UNBROKEN, AND IT LANDS ON TWO POLES.**
   *
   * The failure mode this catches is the whole reason the prop is built the way
   * it is: bunting strung between two poles across air is `floating.isolated` at
   * every cell of it, and no render shows it. So the run is one course of full
   * cubes with no gap in it, and the columns at its two ends run unbroken to the
   * base plane.
   */
  it("strings the flags as one unbroken run between two grounded poles", () => {
    const ops = opsOf("prayer_flag_line");
    const at = indexOf(ops);
    const flags = ops.filter((op) => op.block.endsWith("_wool") && op.y === FLAG_COURSE);
    expect(flags.length, "the run").toBeGreaterThan(4);

    const zs = new Set(flags.map((op) => op.z));
    expect(zs.size, "one course, one row").toBe(1);
    const xs = flags.map((op) => op.x).sort((a, b) => a - b);
    const z = flags[0]?.z as number;
    for (let i = 1; i < xs.length; i++) {
      expect((xs[i] as number) - (xs[i - 1] as number), `a gap in the run at x=${xs[i]}`).toBe(1);
    }

    // Both ends stand on a pole, and every pole is a column to the base plane.
    for (const px of [xs[0] as number, xs[xs.length - 1] as number]) {
      for (let y = 1; y < FLAG_COURSE; y++) {
        const block = at.get(`${px},${y},${z}`)?.block;
        expect(block, `pole at ${px} broken at y=${y}`).toBeDefined();
        expect(block, `pole at ${px} is air at y=${y}`).not.toBe("air");
      }
    }

    // The pennant course, where there is one, stands on the run itself.
    for (const op of ops) {
      if (!op.block.endsWith("_wool") || op.y <= FLAG_COURSE) continue;
      const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
      expect(
        under !== undefined && under !== "air",
        `pennant at ${op.x},${op.y},${op.z} over ${under}`,
      ).toBe(true);
    }

    // Nothing in this prop is an attachable or a hanger.
    for (const op of ops) {
      expect(op.block.endsWith("_banner"), "a banner in the flag line").toBe(false);
      expect(op.block, "a chain in the flag line").not.toBe("iron_chain");
    }
  });

  /**
   * **The cairn lies low, and every course stands on the one below.**
   *
   * Three courses at its tallest is a deliberate ceiling: a mani cairn is a
   * thing a lane walks round, and a cairn stacked to head height beside a path
   * is a wall the path runs into.
   */
  it("keeps the cairn three courses, each on the one below it", () => {
    const ops = opsOf("mani_stone_cairn");
    const at = indexOf(ops);
    for (const op of ops) {
      expect(op.y, `${op.block} at ${op.x},${op.y},${op.z} is standing up`).toBeLessThanOrEqual(3);
      if (op.y === 0) continue;
      const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
      expect(
        under !== undefined && under !== "air" && under !== "water",
        `${op.block} at ${op.x},${op.y},${op.z} over ${under}`,
      ).toBe(true);
    }
    expect(
      ops.some((op) => op.block === "chiseled_deepslate"),
      "the carved faces",
    ).toBe(true);
  });
});
