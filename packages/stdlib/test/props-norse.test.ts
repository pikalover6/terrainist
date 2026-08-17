/**
 * The **Nordic & Viking pack's ground pieces** — the three entries of that
 * pack which stand on the open ground rather than roofing a room, held to the
 * prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no `lantern`, no mud — and then the
 * properties this pack was written against, each of which is a rule the
 * physics lint would otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its
 *   own. The drying rack's posts and the mound's stem posts are the cases that
 *   matter, so the check is the `floating.isolated` rule itself;
 * - **the yard under the hjell stays walkable.** Its rail is at
 *   {@link HJELL_RAIL} and its fish hang one course under that, so every lane
 *   of the yard keeps two courses of air over solid non-water floor, which is
 *   what the lint's 1x2 body needs;
 * - **the mound is a filled mass, never a ring and never hollow** — a filled
 *   course on a filled course, which is the only shape that cannot leave an
 *   isolated block or a sealed pocket;
 * - **no mud**, which is 15/16 of a block and cannot be stood on;
 * - **gravity blocks on floors only.**
 */

import { describe, expect, it } from "vitest";

import {
  HJELL_D,
  HJELL_RAIL,
  HJELL_W,
  MOUND_D,
  MOUND_W,
  NORSE_PROP_NAMES,
  PROP_NAMES,
  RUNESTONE_SPAN,
  STRUCTURE_CATALOG,
  generateProp,
  isNorseProp,
  nodeSeed,
  norsePropFootprint,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x1d5n, "world.norse.props");
const OTHER = nodeSeed(0x1d5n, "world.norse.props.other");

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

/** What a body may stand inside — the lint's vocabulary. */
const PASSABLE = /(_carpet$|_trapdoor$|torch|^air$|^fern$|iron_bars)/;

/** Blocks that fall when the cell under them is air. */
const FALLING = /^(sand|red_sand|gravel|.*_concrete_powder|anvil.*)$/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the Nordic & Viking pack's props", () => {
  it("registers every one of them, once", () => {
    expect(NORSE_PROP_NAMES).toHaveLength(3);
    for (const p of NORSE_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isNorseProp(p)).toBe(true);
    }
    expect(isNorseProp("boot_hill_row")).toBe(false);
    expect(isNorseProp("rune_circle")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as an implemented prop", () => {
    for (const p of NORSE_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("nordic_viking");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of NORSE_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(norsePropFootprint(p));
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
    for (const p of NORSE_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of NORSE_PROP_NAMES) {
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
    for (const p of NORSE_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(norsePropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, uses no `chain`, hangs no lantern and lays no mud", () => {
    for (const p of NORSE_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block.endsWith("lantern"), `${p} lantern`).toBe(false);
        expect(op.block, `${p} mud`).not.toBe("mud");
        expect(op.block, `${p} mud`).not.toBe("muddy_mangrove_roots");
        expect(op.block, `${p} path`).not.toBe("dirt_path");
        expect(op.block, `${p} fire`).not.toBe("campfire");
      }
    }
  });

  it("writes its whole footprint at the base plane", () => {
    for (const p of NORSE_PROP_NAMES) {
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
/* support, walkability and mass                                               */
/* -------------------------------------------------------------------------- */

describe("the Nordic props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of NORSE_PROP_NAMES) {
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
    for (const p of NORSE_PROP_NAMES) {
      const at = indexOf(opsOf(p));
      for (const op of opsOf(p)) {
        if (!FALLING.test(op.block)) continue;
        if (op.y === 0) continue; // the base plane is the ground itself
        const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
        expect(
          under !== undefined && under !== "air" && under !== "water",
          `${p}: ${op.block} at ${op.x},${op.y},${op.z} over ${under}`,
        ).toBe(true);
      }
    }
  });

  /**
   * **The yard under the drying rack is walkable end to end.**
   *
   * The reason `HJELL_RAIL` is four and the fish hang at three: a body needs
   * `y + 1` and `y + 2` clear over its floor, so the lowest thing overhead has
   * to sit at three or above, everywhere the posts are not.
   */
  it("keeps every lane of the drying yard walkable", () => {
    const at = indexOf(opsOf("drying_rack_yard"));
    let lanes = 0;
    for (let z = 0; z < HJELL_D; z++) {
      for (let x = 0; x < HJELL_W; x++) {
        const floor = at.get(`${x},0,${z}`)?.block;
        expect(floor, `${x},${z} floor`).toBeDefined();
        const one = at.get(`${x},1,${z}`)?.block;
        const two = at.get(`${x},2,${z}`)?.block;
        const clear =
          (one === undefined || PASSABLE.test(one)) && (two === undefined || PASSABLE.test(two));
        if (clear) lanes++;
      }
    }
    // Everything except the posts, the barrels and the gutting table.
    expect(lanes).toBeGreaterThan(HJELL_W * HJELL_D - 20);
    // And nothing the rack hangs reaches down into a body's head.
    for (const op of opsOf("drying_rack_yard")) {
      if (op.block !== "iron_bars") continue;
      expect(op.y, "a fish in somebody's face").toBeGreaterThanOrEqual(HJELL_RAIL - 1);
    }
  });

  /**
   * **The mound is a filled mass.** Every course of it is a solid rect
   * standing on the solid rect below it — never a ring, never hollow.
   */
  it("heaps the burial mound as filled courses", () => {
    const at = indexOf(opsOf("boat_burial_mound"));
    const cx = Math.floor(MOUND_W / 2);
    const cz = Math.floor(MOUND_D / 2);
    for (let y = 1; y <= 4; y++) {
      const rx = cx - y;
      const rz = cz - y + 1;
      if (rx < 1 || rz < 1) break;
      for (let z = cz - rz; z <= cz + rz; z++) {
        for (let x = cx - rx; x <= cx + rx; x++) {
          if (x < 0 || z < 0 || x >= MOUND_W || z >= MOUND_D) continue;
          const here = at.get(`${x},${y},${z}`)?.block;
          expect(here, `mound ${x},${y},${z}`).toBeDefined();
          expect(here, `mound ${x},${y},${z}`).not.toBe("air");
        }
      }
    }
    // The crown is turf, not bare dirt.
    expect(at.get(`${cx},4,${cz}`)?.block).toBe("grass_block");
  });

  /** The rune stone is a column: three courses of stone under its cap. */
  it("stands the rune stone as a column on its cairn", () => {
    const at = indexOf(opsOf("rune_stone"));
    const mid = Math.floor(RUNESTONE_SPAN / 2);
    for (let y = 1; y <= 4; y++) {
      const here = at.get(`${mid},${y},${mid}`)?.block;
      expect(here, `rune stone at y=${y}`).toBeDefined();
      expect(here, `rune stone at y=${y}`).not.toBe("air");
    }
    expect(at.get(`${mid},3,${mid}`)?.block, "the carved band").toBe("chiseled_stone_bricks");
    expect(at.get(`${mid},5,${mid}`)?.block ?? "", "the cap").toMatch(/_slab$/);
  });
});
