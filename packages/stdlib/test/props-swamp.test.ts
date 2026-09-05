/**
 * The **Swamp Witch pack's ground pieces** — the three entries of that pack
 * which stand on the wet ground rather than roofing a room, held to the prop
 * contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no `lantern`, no mud — and then the
 * properties this pack was written against, each of which is a rule the physics
 * lint would otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its own.
 *   The circle's standing stones, the charm rack's posts and the shrine's shaft
 *   are the cases that matter, so the check is the `floating.isolated` rule
 *   itself;
 * - **the ground round each piece stays walkable.** The walk between the stones
 *   and the ground under the charm rack keep two courses of air over solid
 *   non-water floor — a circle a body cannot walk into has failed at its only
 *   job, and a charm at head height is a charm in somebody's face;
 * - **THE POOL IS CURBED.** The shrine's water is the only fluid in the pack
 *   and it is asserted the strong way: every source block has a **full** block
 *   or its own water on all four sides and the ground under it. A slab is half
 *   a block and water pours straight through one, so the neighbour check
 *   refuses slabs by name;
 * - **not one skull.** The charm rack is bone and stick on purpose: a rack of
 *   skulls is the Mesoamerican pack's `tzompantli_rack` and that is that pack's
 *   argument to make. Asserted by name, the way that pack's own restraint is;
 * - **no mud**, which is 15/16 of a block and cannot be stood on;
 * - **gravity blocks on floors only.**
 */

import { describe, expect, it } from "vitest";

import {
  CHARM_BAR,
  CHARM_SPAN,
  CIRCLE_RADIUS,
  CIRCLE_SPAN,
  PROP_NAMES,
  SHRINE_SPAN,
  STRUCTURE_CATALOG,
  SWAMP_PROP_NAMES,
  generateProp,
  isSwampProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  swampPropFootprint,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x5a11ecn, "world.swamp.props");
const OTHER = nodeSeed(0x5a11ecn, "world.swamp.props.other");

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

/** Anything water can flow into. A curb made of one of these is not a curb. */
const CAN_LEAK = /(_slab$|_stairs$|_fence$|_wall$|iron_bars|_carpet$|_gate$|_door$|^air$)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the Swamp Witch pack's props", () => {
  it("registers every one of them, once", () => {
    expect(SWAMP_PROP_NAMES).toHaveLength(3);
    for (const p of SWAMP_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isSwampProp(p)).toBe(true);
    }
    // The homestead wave's witch hut is a BUILDING and stays one; this pack's
    // pieces are three things that never had a roof over them at all.
    expect(isSwampProp("witch_hut")).toBe(false);
    expect(isSwampProp("scrying_pool")).toBe(false);
    expect(isSwampProp("shaman_ovoo")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as an implemented prop", () => {
    for (const p of SWAMP_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("swamp_witch");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of SWAMP_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(swampPropFootprint(p));
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
  });

  it("ignores params it does not read", () => {
    for (const p of SWAMP_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of SWAMP_PROP_NAMES) {
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
    for (const p of SWAMP_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(swampPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(9);
    }
  });

  it("hangs no signs, uses no `chain`, hangs no lantern and lays no mud", () => {
    for (const p of SWAMP_PROP_NAMES) {
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
    for (const p of SWAMP_PROP_NAMES) {
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
/* support, walkability, water and restraint                                   */
/* -------------------------------------------------------------------------- */

describe("the swamp props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of SWAMP_PROP_NAMES) {
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
    for (const p of SWAMP_PROP_NAMES) {
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
   * **THE POOL IS CURBED, AND ASSERTED THE STRONG WAY.**
   *
   * A water source moves the instant a horizontal neighbour is anything a
   * fluid can enter. So the claim is not "there is a curb" — it is that every
   * single source block in the pack has a **full** block or its own water on
   * all four sides and something solid under it. A slab would be half a block
   * and water pours straight through one, which is exactly the mistake this
   * assertion exists to make impossible.
   */
  it("closes every drop of water it writes", () => {
    for (const p of SWAMP_PROP_NAMES) {
      const declared = propFootprint(p);
      const ops = opsOf(p);
      const at = indexOf(ops);
      let sources = 0;
      for (const op of ops) {
        if (op.block !== "water") continue;
        sources++;
        expect(op.props?.["level"], `${p}: flowing water at ${op.x},${op.y},${op.z}`).toBe("0");
        const under =
          op.y === declared.minY ? "ground" : at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
        expect(
          under !== undefined && under !== "air",
          `${p}: water over ${under} at ${op.x},${op.y},${op.z}`,
        ).toBe(true);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const side = at.get(`${op.x + dx},${op.y},${op.z + dz}`)?.block;
          expect(
            side !== undefined && !CAN_LEAK.test(side),
            `${p}: water at ${op.x},${op.y},${op.z} leaks ${dx},${dz} into ${side}`,
          ).toBe(true);
        }
      }
      if (p === "waterlogged_shrine") {
        // The eight cells of the pool, round the shrine's own shaft.
        expect(sources, "the shrine stands in water").toBe(8);
      } else {
        expect(sources, `${p} has no business with water`).toBe(0);
      }
    }
  });

  /**
   * **NOT ONE SKULL.**
   *
   * The pack's restraint, as an assertion rather than as a taste in a comment.
   * A rack of skulls is the Mesoamerican pack's `tzompantli_rack`; that pack
   * made that argument deliberately and this one is not entitled to borrow it.
   * A fen charm is a knuckle bone and a bundle of sticks over a door, which is
   * a quieter kind of frightening and the right one for a village somebody
   * still lives in.
   */
  it("hangs bone and stick on the charm rack, and never a skull", () => {
    for (const p of SWAMP_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(/skull|skeleton|head$/.test(op.block), `${p}: ${op.block}`).toBe(false);
      }
    }
    const rack = opsOf("bone_charm_rack");
    expect(
      rack.some((op) => op.block === "bone_block"),
      "the crossbar",
    ).toBe(true);
    // And nothing it hangs comes down into a body's face.
    for (const op of rack) {
      if (op.block !== "iron_bars") continue;
      expect(op.y, "a charm in somebody's face").toBeGreaterThanOrEqual(CHARM_BAR - 1);
    }
    // The posts are full columns from the ground to the bar, every course.
    const at = indexOf(rack);
    const mid = Math.floor(CHARM_SPAN / 2);
    for (const px of [mid - 1, mid + 1]) {
      for (let y = 1; y <= CHARM_BAR; y++) {
        const here = at.get(`${px},${y},${mid}`)?.block;
        expect(here, `post at ${px},${y}`).toBeDefined();
        expect(here, `post at ${px},${y}`).not.toBe("air");
      }
    }
  });

  /**
   * **A body can walk into the circle.**
   *
   * That is not a flourish, it is what a stone circle is *for*: the ring is
   * eight stones with the ground between them, and if the pad were paved with
   * standing stone the piece would be a wall in a circle. The walk keeps
   * `y + 1` and `y + 2` clear over solid non-water floor everywhere except the
   * eight stones and the altar at the middle.
   */
  it("keeps the walk into and around the stone circle open", () => {
    const at = indexOf(opsOf("coven_stone_circle"));
    const mid = Math.floor(CIRCLE_SPAN / 2);
    let open = 0;
    let standing = 0;
    for (let z = 0; z < CIRCLE_SPAN; z++) {
      for (let x = 0; x < CIRCLE_SPAN; x++) {
        expect(at.get(`${x},0,${z}`), `${x},${z} floor`).toBeDefined();
        const one = at.get(`${x},1,${z}`)?.block;
        const two = at.get(`${x},2,${z}`)?.block;
        const clear =
          (one === undefined || PASSABLE.test(one)) && (two === undefined || PASSABLE.test(two));
        if (clear) open++;
        else standing++;
      }
    }
    // Eight stones and one altar, and everything else walkable.
    expect(standing, "the eight stones and the altar").toBe(9);
    expect(open).toBe(CIRCLE_SPAN * CIRCLE_SPAN - 9);
    // The stones stand where the ring says they do.
    for (const [sx, sz] of [
      [mid - CIRCLE_RADIUS, mid],
      [mid + CIRCLE_RADIUS, mid],
      [mid, mid - CIRCLE_RADIUS],
      [mid, mid + CIRCLE_RADIUS],
    ] as const) {
      expect(at.get(`${sx},1,${sz}`), `stone at ${sx},${sz}`).toBeDefined();
      expect(at.get(`${sx},3,${sz}`)?.block ?? "", "the capstone").toMatch(/_slab$/);
    }
  });

  /** The shrine is a shaft in a pool, with a walk round the outside of it. */
  it("stands the shrine out of its own water, with the walk left round it", () => {
    const at = indexOf(opsOf("waterlogged_shrine"));
    const mid = Math.floor(SHRINE_SPAN / 2);
    for (let y = 1; y <= 3; y++) {
      const here = at.get(`${mid},${y},${mid}`)?.block;
      expect(here, `shrine at y=${y}`).toBeDefined();
      expect(here, `shrine at y=${y}`).not.toBe("air");
      expect(here, `shrine at y=${y}`).not.toBe("water");
    }
    expect(at.get(`${mid},2,${mid}`)?.block, "the carved band").toBe("chiseled_stone_bricks");
    expect(at.get(`${mid},4,${mid}`)?.block ?? "", "the cap").toMatch(/_slab$/);
    // The outer ring of the pad is open ground: a body walks up and looks over.
    for (let z = 0; z < SHRINE_SPAN; z++) {
      for (let x = 0; x < SHRINE_SPAN; x++) {
        if (Math.abs(x - mid) <= 2 && Math.abs(z - mid) <= 2) continue;
        expect(at.get(`${x},0,${z}`), `${x},${z} floor`).toBeDefined();
        const one = at.get(`${x},1,${z}`)?.block;
        expect(one === undefined || PASSABLE.test(one), `${x},${z} blocked`).toBe(true);
      }
    }
  });
});
