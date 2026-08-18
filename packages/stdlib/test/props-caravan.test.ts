/**
 * The **desert_caravanserai pack's ground pieces** — the two entries of that
 * pack which stand on the bare ground rather than roofing a room, held to the
 * prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no mud, no water — and then the properties
 * this pack was written against, each of which is a rule the physics lint would
 * otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its own.
 *   The palm trunks and their crowns are the cases that matter, so the check is
 *   the `floating.isolated` rule itself;
 * - **the crown stands on the trunk's own top course.** A crown at a guessed
 *   height over a trunk that stopped lower is a hat in the sky, which is how a
 *   grove becomes `floating.isolated` at four cells at once;
 * - **every leaf is `persistent`.** A leaf without it checks for a log within
 *   its decay distance on the first block tick and vanishes when the answer is
 *   no — which is how a grove becomes three poles overnight;
 * - **gravity blocks on the base plane only.** Both pads are sand, so this one
 *   is not theoretical;
 * - **the pack stack lies low** — two courses at its tallest, so a lane walks
 *   round it rather than into it.
 */

import { describe, expect, it } from "vitest";

import {
  CARAVAN_PROP_NAMES,
  GROVE_H,
  GROVE_SPAN,
  PACK_H,
  PACK_SPAN,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  caravanPropFootprint,
  generateProp,
  isCaravanProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xca4a7an, "world.oasis.props");
const OTHER = nodeSeed(0xca4a7an, "world.oasis.props.other");

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

describe("the desert_caravanserai pack's props", () => {
  it("registers every one of them, once", () => {
    expect(CARAVAN_PROP_NAMES).toHaveLength(2);
    for (const p of CARAVAN_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isCaravanProp(p)).toBe(true);
    }
    // The wilds and street waves own every plain planting word there is; this
    // pack claims its own compounds and nothing else.
    expect(isCaravanProp("orchard_row")).toBe(false);
    expect(isCaravanProp("hitching_post")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as an implemented prop", () => {
    for (const p of CARAVAN_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("desert_caravanserai");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of CARAVAN_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(caravanPropFootprint(p));
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
    expect(propFootprint("date_palm_grove").size).toEqual([GROVE_SPAN, GROVE_H, GROVE_SPAN]);
    expect(propFootprint("caravan_pack_stack").size).toEqual([PACK_SPAN, PACK_H, PACK_SPAN]);
  });

  it("ignores params it does not read", () => {
    for (const p of CARAVAN_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of CARAVAN_PROP_NAMES) {
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
    for (const p of CARAVAN_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(caravanPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(9);
    }
  });

  it("hangs no signs, uses no `chain`, lays no mud and writes no water", () => {
    for (const p of CARAVAN_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block, `${p} mud`).not.toBe("mud");
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
    for (const p of CARAVAN_PROP_NAMES) {
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
/* support, gravity and the grove                                              */
/* -------------------------------------------------------------------------- */

describe("the caravan props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of CARAVAN_PROP_NAMES) {
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
    for (const p of CARAVAN_PROP_NAMES) {
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
   * **Every trunk is a column, and every crown stands on its own trunk.**
   *
   * The two failure modes this catches are the same defect twice: a gap in a
   * trunk leaves floating logs, and a crown written at a fixed course over a
   * trunk that stopped lower leaves four floating leaves and a cap. Both are
   * `floating.isolated`, and neither shows in any render.
   */
  it("runs every palm trunk to the ground and crowns it on its own head", () => {
    const ops = opsOf("date_palm_grove");
    const at = indexOf(ops);
    const trunks = ops.filter((op) => op.block === "jungle_log");
    expect(trunks.length, "the trunks").toBeGreaterThan(8);

    // Group the trunk cells by column, and assert each column is unbroken from
    // y = 1 to its own top.
    const columns = new Map<string, number[]>();
    for (const op of trunks) {
      const key = `${op.x},${op.z}`;
      columns.set(key, [...(columns.get(key) ?? []), op.y]);
    }
    expect(columns.size, "three palms").toBe(3);
    for (const [key, ys] of columns) {
      const top = Math.max(...ys);
      for (let y = 1; y <= top; y++) {
        expect(at.get(`${key.split(",")[0]},${y},${key.split(",")[1]}`)?.block, `${key} @${y}`).toBe(
          "jungle_log",
        );
      }
      // The crown: the cap directly over the trunk head, and the plus round it.
      const [tx, tz] = key.split(",").map(Number) as [number, number];
      expect(at.get(`${tx},${top + 1},${tz}`)?.block, `${key} cap`).toBe("jungle_leaves");
      let arms = 0;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (at.get(`${tx + dx},${top},${tz + dz}`)?.block === "jungle_leaves") arms++;
      }
      expect(arms, `${key} crown arms`).toBeGreaterThan(2);
    }
  });

  /** Every leaf is `persistent`: a grove that decays is three poles by morning. */
  it("writes every leaf persistent", () => {
    for (const op of opsOf("date_palm_grove")) {
      if (!op.block.endsWith("_leaves")) continue;
      expect(op.props?.["persistent"], `leaf at ${op.x},${op.y},${op.z}`).toBe("true");
    }
  });

  /**
   * **The pack stack lies low, and every course stands on the one below.**
   *
   * Two courses at its tallest is a deliberate ceiling: a caravan's load is a
   * thing a lane walks round, and a load stacked to head height beside a road
   * is a wall the road runs into.
   */
  it("keeps the pack stack two courses, each on the one below it", () => {
    const ops = opsOf("caravan_pack_stack");
    const at = indexOf(ops);
    for (const op of ops) {
      expect(op.y, `${op.block} at ${op.x},${op.y},${op.z} is standing up`).toBeLessThanOrEqual(2);
      if (op.y === 0) continue;
      const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
      expect(
        under !== undefined && under !== "air" && under !== "water",
        `${op.block} at ${op.x},${op.y},${op.z} over ${under}`,
      ).toBe(true);
    }
    expect(
      ops.some((op) => op.block === "glowstone"),
      "the camp's light",
    ).toBe(true);
  });
});
