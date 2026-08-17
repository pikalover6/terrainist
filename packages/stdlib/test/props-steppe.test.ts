/**
 * The **Steppe Nomad pack's ground pieces** — the three entries of that pack
 * which stand on the open grass rather than roofing a room, held to the prop
 * contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no `lantern`, no mud — and then the
 * properties this pack was written against, each of which is a rule the physics
 * lint would otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its own.
 *   The tug's pole, the ovoo's ribbon poles and the balbal's shaft are the
 *   cases that matter, so the check is the `floating.isolated` rule itself;
 * - **the ground round each piece stays walkable.** The tug's standard spreads
 *   at {@link TUG_SPREAD} and the ovoo's ribbons run at {@link OVOO_RIBBON}, so
 *   the pad round both keeps two courses of air over solid non-water floor,
 *   which is what the lint's 1x2 body needs — an ovoo a traveller cannot walk
 *   three times round is an ovoo that has failed at its only job;
 * - **the cairn is a filled mass, never a ring and never hollow** — a filled
 *   course on a filled course, which is the only shape that cannot leave an
 *   isolated block or a sealed pocket;
 * - **no mud**, which is 15/16 of a block and cannot be stood on;
 * - **gravity blocks on floors only** — the cairn heaps gravel, so this one is
 *   not theoretical.
 */

import { describe, expect, it } from "vitest";

import {
  BALBAL_SPAN,
  OVOO_RIBBON,
  OVOO_SPAN,
  PROP_NAMES,
  STEPPE_PROP_NAMES,
  STRUCTURE_CATALOG,
  TUG_SPAN,
  TUG_SPREAD,
  generateProp,
  isSteppeProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  steppePropFootprint,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x57e77en, "world.steppe.props");
const OTHER = nodeSeed(0x57e77en, "world.steppe.props.other");

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

describe("the Steppe Nomad pack's props", () => {
  it("registers every one of them, once", () => {
    expect(STEPPE_PROP_NAMES).toHaveLength(3);
    for (const p of STEPPE_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isSteppeProp(p)).toBe(true);
    }
    // The wayside pack's yurt is a prop and stays one: this pack's tent is a
    // BUILDING called a ger, and the two must never be confused for each other.
    expect(isSteppeProp("yurt")).toBe(false);
    expect(isSteppeProp("rune_stone")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as an implemented prop", () => {
    for (const p of STEPPE_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("steppe_nomad");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of STEPPE_PROP_NAMES) {
      const declared = propFootprint(p);
      expect(declared, p).toEqual(steppePropFootprint(p));
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
    for (const p of STEPPE_PROP_NAMES) {
      expect(propFootprint(p, { length: 99 }), p).toEqual(propFootprint(p));
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of STEPPE_PROP_NAMES) {
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
    for (const p of STEPPE_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(steppePropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(9);
    }
  });

  it("hangs no signs, uses no `chain`, hangs no lantern and lays no mud", () => {
    for (const p of STEPPE_PROP_NAMES) {
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
    for (const p of STEPPE_PROP_NAMES) {
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

describe("the steppe props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of STEPPE_PROP_NAMES) {
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
    for (const p of STEPPE_PROP_NAMES) {
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
   * **A traveller can walk three times round the ovoo.**
   *
   * That is not a flourish, it is what an ovoo is *for*, and it is the reason
   * `OVOO_RIBBON` is four rather than two: a body needs `y + 1` and `y + 2`
   * clear over its floor, so the lowest thing strung between the poles has to
   * sit at three or above.
   */
  it("keeps the walk round the ovoo open", () => {
    const at = indexOf(opsOf("shaman_ovoo"));
    const mid = Math.floor(OVOO_SPAN / 2);
    let ring = 0;
    for (let z = 0; z < OVOO_SPAN; z++) {
      for (let x = 0; x < OVOO_SPAN; x++) {
        // The cairn's own cells are the thing being walked round.
        if (Math.abs(x - mid) <= 2 && Math.abs(z - mid) <= 2) continue;
        expect(at.get(`${x},0,${z}`), `${x},${z} floor`).toBeDefined();
        const one = at.get(`${x},1,${z}`)?.block;
        const two = at.get(`${x},2,${z}`)?.block;
        const clear =
          (one === undefined || PASSABLE.test(one)) && (two === undefined || PASSABLE.test(two));
        if (clear) ring++;
      }
    }
    // Everything on the walk except the four ribbon poles.
    expect(ring).toBeGreaterThan(OVOO_SPAN * OVOO_SPAN - 25 - 5);
    // And nothing strung between them reaches down into a body's head.
    for (const op of opsOf("shaman_ovoo")) {
      if (op.block !== "iron_bars") continue;
      expect(op.y, "a ribbon in somebody's face").toBeGreaterThanOrEqual(OVOO_RIBBON);
    }
  });

  /**
   * **The cairn is a filled mass.** Every course of it is a solid rect standing
   * on the solid rect below it — never a ring, never hollow.
   */
  it("heaps the ovoo as filled courses", () => {
    const at = indexOf(opsOf("shaman_ovoo"));
    const mid = Math.floor(OVOO_SPAN / 2);
    for (let y = 1; y <= 3; y++) {
      const r = 3 - y;
      for (let z = mid - r; z <= mid + r; z++) {
        for (let x = mid - r; x <= mid + r; x++) {
          if (x < 1 || z < 1 || x > OVOO_SPAN - 2 || z > OVOO_SPAN - 2) continue;
          const here = at.get(`${x},${y},${z}`)?.block;
          expect(here, `ovoo ${x},${y},${z}`).toBeDefined();
          expect(here, `ovoo ${x},${y},${z}`).not.toBe("air");
        }
      }
    }
    expect(at.get(`${mid},4,${mid}`)?.block ?? "", "the apex").toMatch(/_slab$/);
  });

  /** The tug is a column, and its standard is well over a body's head. */
  it("stands the banner pole as a column, with the standard overhead", () => {
    const at = indexOf(opsOf("khan_banner_pole"));
    const mid = Math.floor(TUG_SPAN / 2);
    for (let y = 1; y <= TUG_SPREAD; y++) {
      const here = at.get(`${mid},${y},${mid}`)?.block;
      expect(here, `pole at y=${y}`).toBeDefined();
      expect(here, `pole at y=${y}`).not.toBe("air");
    }
    expect(at.get(`${mid},${TUG_SPREAD + 1},${mid}`)?.block ?? "", "the point").toMatch(/_slab$/);
    for (const op of opsOf("khan_banner_pole")) {
      if (op.block !== "iron_bars") continue;
      expect(op.y, "a strand in somebody's face").toBeGreaterThanOrEqual(TUG_SPREAD - 1);
    }
    // And the whole pad stays walkable: nothing but the pole reaches y = 2.
    let standing = 0;
    for (let z = 0; z < TUG_SPAN; z++) {
      for (let x = 0; x < TUG_SPAN; x++) {
        const two = at.get(`${x},2,${z}`)?.block;
        if (two !== undefined && !PASSABLE.test(two)) standing++;
      }
    }
    expect(standing, "only the pole").toBe(1);
  });

  /** The balbal is a shaft with a carved face and a slab cap. */
  it("carves the balbal's face at a body's own height", () => {
    const at = indexOf(opsOf("balbal_stone"));
    const mid = Math.floor(BALBAL_SPAN / 2);
    for (let y = 1; y <= 3; y++) {
      const here = at.get(`${mid},${y},${mid}`)?.block;
      expect(here, `balbal at y=${y}`).toBeDefined();
      expect(here, `balbal at y=${y}`).not.toBe("air");
    }
    expect(at.get(`${mid},2,${mid}`)?.block, "the carved face").toBe("chiseled_stone_bricks");
    expect(at.get(`${mid},4,${mid}`)?.block ?? "", "the cap").toMatch(/_slab$/);
  });
});
