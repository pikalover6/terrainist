/**
 * The **nautical & pirate pack's shore props** — the seven entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.2 in the table's second half that stand on
 * the quay, the strand and the headland, held to the prop contract every
 * earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no `lantern` — and then the properties
 * this half of the pack was written against, each of which is a rule the
 * physics lint would otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a post run down to it, or on a horizontal neighbour of its own.
 *   The arch's crown and the racks' poles are the two cases that matter, so
 *   the check is the `floating.isolated` rule itself, run over the finished op
 *   set at every param case;
 * - **the ways through stay walkable.** Under the arch and down the racks'
 *   lanes there is solid non-water floor with two courses of air over it,
 *   which is what the lint's 1x2 body needs and what an icon you can only look
 *   at does not have;
 * - **the daymark is mute.** No light source anywhere in it, at any height it
 *   can be asked for — the moment it glows it is the lighthouse the catalog
 *   already ships.
 */

import { describe, expect, it } from "vitest";

import {
  BRINE_PROP_NAMES,
  DAYMARK_MAX,
  DAYMARK_MIN,
  PROP_NAMES,
  RACK_MAX,
  RACK_MIN,
  STRUCTURE_CATALOG,
  brinePropFootprint,
  generateProp,
  isBrineProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xb21n, "world.brine.props");
const OTHER = nodeSeed(0xb21n, "world.brine.props.other");

/** Every param case this file's props are walked at. */
const CASES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  fish_drying_rack: [{}, { length: 3 }, { length: 12 }, { length: 64 }],
  treasure_cache: [{}],
  smugglers_landing: [{}],
  capstan: [{}],
  anchor_stack: [{}],
  daymark: [{}, { height: 3 }, { height: 10 }, { height: 64 }],
  whalebone_arch: [{}],
};

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
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|lantern|_pot$|cauldron|iron_bars|torch|lightning_rod|chest|barrel|_leaves$)/;

/** What a body may stand inside — the lint's vocabulary, for the ways through. */
const PASSABLE = /(_carpet$|_trapdoor$|torch|^air$)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the brine pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of BRINE_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isBrineProp(p)).toBe(true);
    }
    expect(isBrineProp("herm_post")).toBe(false);
    expect(isBrineProp("sunken_ship")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as implemented, and as a PROP", () => {
    for (const p of BRINE_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("nautical_pirate");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
    expect(structureById("daymark")?.category).toBe("transport-water");
    expect(structureById("capstan")?.category).toBe("street-furniture");
    expect(structureById("whalebone_arch")?.category).toBe("memorial");
  });

  /**
   * The pack's infrastructure entry is nobody's yet, and must stay that way:
   * a pair of towers with a chain slung between them across open water is not
   * something the prop or building registries can host.
   */
  it("leaves the pack's infrastructure entry alone", () => {
    expect(structureById("harbour_chain_tower")?.status).toBe("not_started");
    expect(PROP_NAMES as readonly string[]).not.toContain("harbour_chain_tower");
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of BRINE_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        const declared = propFootprint(p, params);
        expect(declared, p).toEqual(brinePropFootprint(p, params));
        const result = generateProp({ prop: p, seed: SEED, params });
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
    }
  });

  it("clamps both size params, at both ends", () => {
    expect(propFootprint("fish_drying_rack", { length: 2 }).size[0]).toBe(RACK_MIN);
    expect(propFootprint("fish_drying_rack", { length: 999 }).size[0]).toBe(RACK_MAX);
    expect(propFootprint("fish_drying_rack", { length: "long" }).size[0]).toBe(
      propFootprint("fish_drying_rack", {}).size[0],
    );
    expect(propFootprint("daymark", { height: 2 }).size[1]).toBe(DAYMARK_MIN);
    expect(propFootprint("daymark", { height: 999 }).size[1]).toBe(DAYMARK_MAX);
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of BRINE_PROP_NAMES) {
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
    for (const p of BRINE_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(brinePropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, uses no `chain`, and hangs no lantern", () => {
    for (const p of BRINE_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        for (const op of opsOf(p, params)) {
          expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
          expect(op.block, `${p} chain`).not.toBe("chain");
          expect(op.block.endsWith("lantern"), `${p} lantern`).toBe(false);
        }
      }
    }
  });

  /** Every one of them writes its whole ground plane, edge to edge. */
  it("writes its whole footprint at the base plane", () => {
    for (const p of BRINE_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        const declared = propFootprint(p, params);
        const at = indexOf(opsOf(p, params));
        for (let z = 0; z < declared.size[2]; z++) {
          for (let x = 0; x < declared.size[0]; x++) {
            expect(at.get(`${x},0,${z}`), `${p} ground at ${x},${z}`).toBeDefined();
          }
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* support                                                                     */
/* -------------------------------------------------------------------------- */

describe("the brine props' support closure", () => {
  it("leaves no full block with six air faces, at any param case", () => {
    for (const p of BRINE_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        const declared = propFootprint(p, params);
        const ops = opsOf(p, params);
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
    }
  });

  /** Gravity blocks belong on floors, and every one of these is on one. */
  it("stands every falling block on something solid", () => {
    for (const p of BRINE_PROP_NAMES) {
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/^(sand|gravel|red_sand)$/.test(op.block)) continue;
        if (op.y === 0) continue;
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBeDefined();
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).not.toBe("air");
      }
    }
  });

  /** Fences, walls and carpets are on the support chain too. */
  it("stands every fence, wall and carpet on something", () => {
    for (const p of BRINE_PROP_NAMES) {
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/(_wall$|fence|_carpet$)/.test(op.block)) continue;
        if (op.y === 0) continue;
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBeDefined();
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).not.toBe("air");
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the props themselves                                                        */
/* -------------------------------------------------------------------------- */

describe("what each brine prop is for", () => {
  it("racks the fish on unbroken poles, and leaves the lanes walkable", () => {
    for (const params of [{}, { length: 7 }, { length: 21 }]) {
      const w = propFootprint("fish_drying_rack", params).size[0];
      const at = indexOf(opsOf("fish_drying_rack", params));
      for (const z of [1, 3, 5]) {
        for (let x = 0; x < w; x++) {
          expect(at.get(`${x},3,${z}`)?.block, `pole at ${x},${z}`).toBeDefined();
        }
      }
      // The fish, hung under the poles.
      expect(at.get("2,2,1")?.block, "a split fish").toBe("bone_block");
      // The lanes: floor, and two courses of air over it.
      for (const z of [0, 2, 4, 6]) {
        for (let x = 0; x < w; x++) {
          expect(at.get(`${x},0,${z}`), `lane floor ${x},${z}`).toBeDefined();
          expect(at.get(`${x},1,${z}`), `lane knee ${x},${z}`).toBeUndefined();
          expect(at.get(`${x},2,${z}`), `lane head ${x},${z}`).toBeUndefined();
        }
      }
    }
  });

  it("buries the cache under a palm whose canopy closes over it", () => {
    const ops = opsOf("treasure_cache");
    const at = indexOf(ops);
    for (let y = 1; y <= 4; y++) expect(at.get(`1,${y},1`)?.block, `trunk ${y}`).toBe("jungle_log");
    expect(at.get("1,5,1")?.block, "the canopy").toBe("jungle_leaves");
    expect(at.get("3,1,1")?.block, "a chest").toBe("chest");
    expect(at.get("3,2,2")?.props?.["open"], "the open lid").toBe("true");
    expect(ops.some((o) => o.block === "gold_block"), "what spilled out").toBe(true);
  });

  it("cuts a climbable stair into the landing's cove wall", () => {
    const at = indexOf(opsOf("smugglers_landing"));
    // Three treads, each one course higher than the last, with air over them.
    for (let i = 0; i < 3; i++) {
      const x = 6 + i;
      const tread = i + 1;
      expect(at.get(`${x},${tread},1`)?.block, `tread at ${x}`).toBeDefined();
      expect(at.get(`${x},${tread + 1},1`), `headroom over ${x}`).toBeUndefined();
      expect(at.get(`${x},${tread + 2},1`), `headroom over ${x}`).toBeUndefined();
    }
    // The wall behind them is full height, so the stair reads as a cut.
    expect(at.get("6,3,0")?.block, "the wall over the stair").toBeDefined();
    // The lamp is glowstone against the rock, not a lantern.
    expect(at.get("0,2,2")?.block, "the shuttered lamp").toBe("glowstone");
  });

  it("gives the capstan a drum, four bars and a coil", () => {
    const ops = opsOf("capstan");
    const at = indexOf(ops);
    expect(at.get("1,1,1")?.block, "the drum").toBeDefined();
    expect(at.get("1,2,1")?.block, "the head").toBe("chiseled_stone_bricks");
    const bars = ops.filter((o) => o.y === 1 && o.block.endsWith("_fence"));
    expect(bars.length, "the bar sockets").toBe(4);
    expect(ops.filter((o) => o.block === "brown_carpet").length, "the hawser").toBe(2);
  });

  it("leans the anchors on a bollard and heaps the chain round them", () => {
    const ops = opsOf("anchor_stack");
    const at = indexOf(ops);
    expect(at.get("2,2,2")?.block, "the bollard").toBeDefined();
    expect(ops.filter((o) => o.block === "iron_bars").length, "iron, everywhere").toBe(12);
    expect(ops.every((o) => o.y <= 2), "nothing stands over head height").toBe(true);
  });

  it("tapers the daymark to a point and puts no light in it", () => {
    for (const params of [{}, { height: 7 }, { height: 13 }]) {
      const declared = propFootprint("daymark", params);
      const ops = opsOf("daymark", params);
      const at = indexOf(ops);
      const top = declared.size[1] - 1;
      // The crown is one cell, on the axis.
      const crown = ops.filter((o) => o.y === top);
      expect(crown.length, `crown at h=${declared.size[1]}`).toBe(1);
      expect(at.get(`3,${top},3`), "the crown is on the axis").toBeDefined();
      // The springing is the full disc.
      expect(at.get("0,1,3")?.block, "the west springing").toBeDefined();
      expect(at.get("6,1,3")?.block, "the east springing").toBeDefined();
      // Mute: no light source at all.
      for (const op of ops) {
        expect(
          /glowstone|sea_lantern|shroomlight|torch|campfire|_lantern$|^lantern$/.test(op.block),
          `${op.block} at ${op.x},${op.y},${op.z} — a daymark has no light`,
        ).toBe(false);
      }
    }
  });

  it("walks a body under the whalebone arch", () => {
    const ops = opsOf("whalebone_arch");
    const at = indexOf(ops);
    // The jaws, and the crown they meet on.
    for (const x of [1, 5]) {
      for (let y = 1; y <= 6; y++) {
        expect(at.get(`${x},${y},2`)?.block, `jaw ${x} at ${y}`).toBe("bone_block");
      }
    }
    for (let x = 2; x <= 4; x++) {
      expect(at.get(`${x},6,2`)?.block, `crown at ${x}`).toBe("bone_block");
    }
    // The way through: floor, and two courses of air over it.
    for (let x = 2; x <= 4; x++) {
      const floor = at.get(`${x},0,2`)?.block;
      expect(floor, `floor at ${x}`).toBeDefined();
      expect(floor, `floor at ${x}`).not.toBe("water");
      for (const y of [1, 2]) {
        const block = at.get(`${x},${y},2`)?.block;
        expect(block === undefined || PASSABLE.test(block), `headroom at ${x},${y}`).toBe(true);
      }
    }
  });
});
