/**
 * The **feudal_japanese pack's ground pieces** — the three entries of that pack
 * which stand on the bare ground rather than roofing a room, held to the prop
 * contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no mud — and then the properties this pack
 * was written against, each of which is a rule the physics lint would otherwise
 * find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its own;
 * - **THE BANNER RUN IS ATTACHED TO ITS POLE.** A nobori is the single most
 *   obvious thing in this pack to build wrong — the picture in everybody's head
 *   is cloth hanging in air off a crossbar, and every cell of that hang is
 *   `floating.isolated`. So the cloth is asserted directly: every block of it
 *   has the pole orthogonally beside it, and the pole is a column to the base
 *   plane;
 * - **THE POND IS CLOSED.** Every water cell has water or a full block on each
 *   of its four sides and the ground plane under it, and nothing stands on one;
 * - **gravity blocks on the base plane only**;
 * - **the lantern is one unbroken column**, every course on the course below.
 */

import { describe, expect, it } from "vitest";

import {
  FEUDAL_PROP_NAMES,
  KOI_H,
  KOI_SPAN,
  NOBORI_DEPTH,
  NOBORI_H,
  NOBORI_POLE,
  NOBORI_SPAN,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  TORO_H,
  TORO_SPAN,
  feudalPropFootprint,
  generateProp,
  isFeudalProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xfeed5n, "world.castle.props");
const OTHER = nodeSeed(0xfeed5n, "world.castle.props.other");

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

describe("the feudal_japanese pack's props", () => {
  it("registers every one of them, once", () => {
    expect(FEUDAL_PROP_NAMES).toHaveLength(3);
    for (const p of FEUDAL_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isFeudalProp(p)).toBe(true);
    }
    // The east-asian, wilds and steppe waves own every plain marker word there
    // is; this pack claims its own compounds and nothing else.
    expect(isFeudalProp("stone_lantern")).toBe(false);
    expect(isFeudalProp("duck_pond")).toBe(false);
    expect(isFeudalProp("flagpole")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as an implemented prop", () => {
    for (const p of FEUDAL_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("feudal_japanese");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of FEUDAL_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(feudalPropFootprint(p));
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
    expect(propFootprint("toro_lantern").size).toEqual([TORO_SPAN, TORO_H, TORO_SPAN]);
    expect(propFootprint("koi_pond").size).toEqual([KOI_SPAN, KOI_H, KOI_SPAN]);
    expect(propFootprint("nobori_banner_line").size).toEqual([
      NOBORI_SPAN,
      NOBORI_H,
      NOBORI_DEPTH,
    ]);
  });

  it("ignores params it does not read", () => {
    for (const p of FEUDAL_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of FEUDAL_PROP_NAMES) {
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
    for (const p of FEUDAL_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(feudalPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(9);
    }
  });

  it("hangs no signs, uses no `chain`, lays no mud or snow and lights no fire", () => {
    for (const p of FEUDAL_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block, `${p} iron chain`).not.toBe("iron_chain");
        expect(op.block, `${p} mud`).not.toBe("mud");
        expect(op.block, `${p} snow`).not.toBe("snow");
        expect(op.block, `${p} path`).not.toBe("dirt_path");
        expect(op.block, `${p} fire`).not.toBe("campfire");
        expect(op.block.endsWith("_banner"), `${p} banner block`).toBe(false);
        expect(op.props?.["lit"], `${p} lit ${op.block}`).not.toBe("true");
      }
    }
  });

  it("writes its whole footprint at the base plane", () => {
    for (const p of FEUDAL_PROP_NAMES) {
      const declared = propFootprint(p);
      const at = indexOf(opsOf(p));
      for (let z = 0; z < declared.size[2]; z++) {
        for (let x = 0; x < declared.size[0]; x++) {
          expect(at.get(`${x},${declared.minY},${z}`), `${p} base at ${x},${z}`).toBeDefined();
        }
      }
    }
  });

  /** The one prop here that writes water is the pond, and only the pond. */
  it("keeps its water in the pond and nowhere else", () => {
    for (const p of FEUDAL_PROP_NAMES) {
      const wet = opsOf(p).some((op) => op.block === "water");
      expect(wet, `${p} water`).toBe(p === "koi_pond");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* support, gravity, the banner run, the pond and the lantern                   */
/* -------------------------------------------------------------------------- */

describe("the feudal props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of FEUDAL_PROP_NAMES) {
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
    for (const p of FEUDAL_PROP_NAMES) {
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
   * **THE CLOTH IS ATTACHED TO ITS POLE, AND THE POLE REACHES THE GROUND.**
   *
   * The failure mode this catches is the whole reason the prop is built the way
   * it is: cloth hung off a crossbar across air is `floating.isolated` at every
   * cell of it, and no render shows it. So every wool block is asserted to have
   * the pole orthogonally beside it, and the poles are asserted to be unbroken
   * columns to the base plane.
   */
  it("runs every banner up the side of a grounded pole", () => {
    const ops = opsOf("nobori_banner_line");
    const at = indexOf(ops);
    const cloth = ops.filter((op) => op.block.endsWith("_wool"));
    expect(cloth.length, "the cloth").toBeGreaterThan(4);

    const isPole = (x: number, y: number, z: number): boolean => {
      const block = at.get(`${x},${y},${z}`)?.block;
      return block !== undefined && block.includes("stripped");
    };
    for (const op of cloth) {
      const beside =
        isPole(op.x, op.y, op.z + 1) ||
        isPole(op.x, op.y, op.z - 1) ||
        isPole(op.x + 1, op.y, op.z) ||
        isPole(op.x - 1, op.y, op.z);
      expect(beside, `cloth at ${op.x},${op.y},${op.z} touches no pole`).toBe(true);
    }

    // Every pole is a column with no gap in it, all the way to the ground.
    const mz = Math.floor(NOBORI_DEPTH / 2);
    for (const px of [1, Math.floor(NOBORI_SPAN / 2), NOBORI_SPAN - 2]) {
      for (let y = 1; y <= NOBORI_POLE; y++) {
        const block = at.get(`${px},${y},${mz}`)?.block;
        expect(block, `pole at ${px} broken at y=${y}`).toBeDefined();
        expect(block, `pole at ${px} is air at y=${y}`).not.toBe("air");
      }
    }
  });

  /**
   * **THE POND IS CLOSED, ON EVERY SIDE AND UNDERNEATH.**
   *
   * The curb ring is written whole before a drop is poured, and this is that
   * ordering asserted as a property rather than remembered as a comment: every
   * water cell has water or a full block on each of its four sides, the ground
   * plane under it, and nothing standing on it.
   */
  it("curbs every water cell of the koi pond", () => {
    const ops = opsOf("koi_pond");
    const at = indexOf(ops);
    const water = ops.filter((op) => op.block === "water");
    expect(water.length, "the pool").toBeGreaterThan(4);
    for (const op of water) {
      const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
      expect(under !== undefined && under !== "air", `water at ${op.x},${op.z} over ${under}`).toBe(
        true,
      );
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const side = at.get(`${op.x + dx},${op.y},${op.z + dz}`)?.block;
        expect(
          side !== undefined && side !== "air",
          `water at ${op.x},${op.z} has an open face toward ${dx},${dz} (${side})`,
        ).toBe(true);
      }
      const over = at.get(`${op.x},${op.y + 1},${op.z}`)?.block;
      expect(
        over === undefined || over === "air",
        `${over} standing on the water at ${op.x},${op.z}`,
      ).toBe(true);
    }
  });

  /**
   * **The lantern is one unbroken column, and its glow is not a `lantern`.**
   *
   * Every course of the shaft stands on the course below it, and the light in
   * the firebox is `glowstone` — a full cube — rather than any block whose name
   * ends `lantern`, which is the lint's lantern rule satisfied rather than
   * dodged.
   */
  it("stacks the toro lantern course on course, with a glowstone firebox", () => {
    const ops = opsOf("toro_lantern");
    const at = indexOf(ops);
    const mid = Math.floor(TORO_SPAN / 2);
    for (let y = 1; y <= 6; y++) {
      const block = at.get(`${mid},${y},${mid}`)?.block;
      expect(block, `the shaft is broken at y=${y}`).toBeDefined();
      expect(block, `the shaft is air at y=${y}`).not.toBe("air");
    }
    expect(at.get(`${mid},4,${mid}`)?.block, "the firebox").toBe("glowstone");
    for (const op of ops) {
      expect(op.block.endsWith("lantern"), `${op.block} is a lantern by name`).toBe(false);
    }
  });
});
