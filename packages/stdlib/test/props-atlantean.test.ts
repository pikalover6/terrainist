/**
 * The **Atlantean pack's ground pieces** — the two entries of that pack which
 * stand on the bare ground rather than roofing a room, held to the prop
 * contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no mud — and then the properties this pack
 * was written against, each of which is a rule the physics lint would otherwise
 * find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its own.
 *   The altar's rib posts and the lintels spanning between them are the cases
 *   that matter, so the check is the `floating.isolated` rule itself;
 * - **the ground round each piece stays walkable.** The rib lintel runs at
 *   {@link ALTAR_LINTEL} and the colossus fragment **lies down**, so the pad
 *   round both keeps two courses of air over solid non-water floor, which is
 *   what the lint's 1x2 body needs;
 * - **the plinth is a filled mass, never a ring and never hollow** — a filled
 *   course on a filled course, the only shape that cannot leave an isolated
 *   block or a sealed pocket;
 * - **not a drop of water**, which is the pack's own line: its water lives
 *   indoors in curbed basins, where the closure is something this project can
 *   prove, and a puddle round a prop is a fluid whose neighbours are whatever
 *   terrain happened to be there;
 * - **no live coral**, which turns grey on the first block tick;
 * - **gravity blocks on the base plane only** — the rubble heaps gravel and
 *   sand, so this one is not theoretical;
 * - **`iron_chain`, never `chain`**, the pack's other standing rule.
 */

import { describe, expect, it } from "vitest";

import {
  ALTAR_H,
  ALTAR_LINTEL,
  ALTAR_SPAN,
  ATLANTEAN_PROP_NAMES,
  COLOSSUS_H,
  COLOSSUS_SPAN,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  atlanteanPropFootprint,
  generateProp,
  isAtlanteanProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xa71a17n, "world.atlantis.props");
const OTHER = nodeSeed(0xa71a17n, "world.atlantis.props.other");

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

/** What a body may stand inside — the lint's vocabulary. */
const PASSABLE = /(_carpet$|_trapdoor$|torch|^air$|^fern$|iron_bars|iron_chain|^cobweb$)/;

/** Blocks that fall when the cell under them is air. */
const FALLING = /^(sand|red_sand|gravel|.*_concrete_powder|anvil.*)$/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the Atlantean pack's props", () => {
  it("registers every one of them, once", () => {
    expect(ATLANTEAN_PROP_NAMES).toHaveLength(2);
    for (const p of ATLANTEAN_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isAtlanteanProp(p)).toBe(true);
    }
    // The memorial wave's standing colossus is a BUILDING-scale piece of its
    // own and keeps every spelling of the word; this pack ships the fragment.
    expect(isAtlanteanProp("colossal_statue")).toBe(false);
    expect(isAtlanteanProp("statue_plinth")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as an implemented prop", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("atlantean");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(atlanteanPropFootprint(p));
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
    expect(propFootprint("leviathan_altar").size).toEqual([ALTAR_SPAN, ALTAR_H, ALTAR_SPAN]);
    expect(propFootprint("bronze_colossus_fragment").size).toEqual([
      COLOSSUS_SPAN,
      COLOSSUS_H,
      COLOSSUS_SPAN,
    ]);
  });

  it("ignores params it does not read", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
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
    for (const p of ATLANTEAN_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(atlanteanPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(9);
    }
  });

  it("hangs no signs, uses no `chain`, lays no mud and writes no water", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block, `${p} mud`).not.toBe("mud");
        expect(op.block, `${p} mud`).not.toBe("muddy_mangrove_roots");
        expect(op.block, `${p} path`).not.toBe("dirt_path");
        expect(op.block, `${p} fire`).not.toBe("campfire");
        // The pack's line: outdoors is dry. Its water lives in curbed indoor
        // basins, where the closure is something this project can prove.
        expect(op.block, `${p} water`).not.toBe("water");
      }
    }
  });

  it("plants no live coral", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
      for (const op of opsOf(p)) {
        if (!op.block.includes("coral")) continue;
        expect(op.block.startsWith("dead_"), `${p}: live ${op.block}`).toBe(true);
      }
    }
  });

  it("writes its whole footprint at the base plane", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
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

describe("the Atlantean props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of ATLANTEAN_PROP_NAMES) {
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
    for (const p of ATLANTEAN_PROP_NAMES) {
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
   * **A body can walk up to the altar.**
   *
   * That is not a flourish, it is what an altar is *for*, and it is the reason
   * `ALTAR_LINTEL` is four rather than two: a body needs `y + 1` and `y + 2`
   * clear over its floor, so the lowest thing spanning between the rib posts
   * has to sit at three or above.
   */
  it("keeps the ground round the altar walkable", () => {
    const at = indexOf(opsOf("leviathan_altar"));
    const mid = Math.floor(ALTAR_SPAN / 2);
    let ring = 0;
    for (let z = 0; z < ALTAR_SPAN; z++) {
      for (let x = 0; x < ALTAR_SPAN; x++) {
        // The plinth's own cells are the thing being walked up to.
        if (Math.abs(x - mid) <= 2 && Math.abs(z - mid) <= 2) continue;
        expect(at.get(`${x},0,${z}`), `${x},${z} floor`).toBeDefined();
        const one = at.get(`${x},1,${z}`)?.block;
        const two = at.get(`${x},2,${z}`)?.block;
        const clear =
          (one === undefined || PASSABLE.test(one)) && (two === undefined || PASSABLE.test(two));
        if (clear) ring++;
      }
    }
    // Everything on the walk except the four rib posts.
    expect(ring).toBeGreaterThan(ALTAR_SPAN * ALTAR_SPAN - 25 - 5);
    // And nothing spanning between them reaches down into a body's head.
    for (const op of opsOf("leviathan_altar")) {
      if (op.block !== "bone_block" || op.props?.["axis"] !== "x") continue;
      expect(op.y, "a rib in somebody's face").toBeGreaterThanOrEqual(ALTAR_LINTEL);
    }
  });

  /**
   * **The plinth is a filled mass.** Every course of it is a solid rect
   * standing on the solid rect below it — never a ring, never hollow.
   */
  it("heaps the altar's plinth as filled courses", () => {
    const at = indexOf(opsOf("leviathan_altar"));
    const mid = Math.floor(ALTAR_SPAN / 2);
    for (let y = 1; y <= 2; y++) {
      const r = 2 - (y - 1);
      for (let z = mid - r; z <= mid + r; z++) {
        for (let x = mid - r; x <= mid + r; x++) {
          const here = at.get(`${x},${y},${z}`)?.block;
          expect(here, `plinth ${x},${y},${z}`).toBeDefined();
          expect(here, `plinth ${x},${y},${z}`).not.toBe("air");
        }
      }
    }
    expect(at.get(`${mid},3,${mid}`)?.block ?? "", "the altar slab").toMatch(/_slab$/);
  });

  /** The ribs are columns, and the lintels touch one at each end. */
  it("stands the ribs as columns, with the lintels overhead", () => {
    const at = indexOf(opsOf("leviathan_altar"));
    const mid = Math.floor(ALTAR_SPAN / 2);
    for (const [px, pz] of [
      [0, mid - 2],
      [0, mid + 2],
      [ALTAR_SPAN - 1, mid - 2],
      [ALTAR_SPAN - 1, mid + 2],
    ] as const) {
      for (let y = 1; y <= ALTAR_LINTEL; y++) {
        expect(at.get(`${px},${y},${pz}`)?.block, `rib post ${px},${y},${pz}`).toBe("bone_block");
      }
    }
    for (const pz of [mid - 2, mid + 2]) {
      for (let x = 0; x < ALTAR_SPAN; x++) {
        expect(at.get(`${x},${ALTAR_LINTEL},${pz}`)?.block, `lintel at ${x},${pz}`).toBe(
          "bone_block",
        );
      }
    }
  });

  /**
   * **The colossus is DOWN, and that is the whole design.**
   *
   * A colossus standing on a plinth is the memorial wave's `colossal_statue`.
   * What a risen city needs is the fragment, so nothing in this piece rises
   * more than two courses off the ground — and every course of it stands on the
   * course below.
   */
  it("lays the colossus fragment down, and keeps it gravity-safe", () => {
    const ops = opsOf("bronze_colossus_fragment");
    const at = indexOf(ops);
    for (const op of ops) {
      expect(op.y, `${op.block} at ${op.x},${op.y},${op.z} is standing up`).toBeLessThanOrEqual(2);
      if (op.y === 0) continue;
      const under = at.get(`${op.x},${op.y - 1},${op.z}`)?.block;
      expect(
        under !== undefined && under !== "air",
        `${op.block} at ${op.x},${op.y},${op.z} over ${under}`,
      ).toBe(true);
    }
    // The bronze itself: the copper oxidation set, and nothing else.
    const bronze = ops.filter((op) => op.block.includes("copper"));
    expect(bronze.length, "the bronze").toBeGreaterThan(10);
    for (const op of bronze) {
      expect(
        ["copper_block", "exposed_copper", "weathered_copper", "oxidized_copper"],
        `${op.block}`,
      ).toContain(op.block);
    }
    // And no gravel or sand above the base plane: the rubble cannot fall.
    for (const op of ops) {
      if (!FALLING.test(op.block)) continue;
      expect(op.y, `${op.block} above the ground`).toBe(0);
    }
  });
});
