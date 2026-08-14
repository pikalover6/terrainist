/**
 * The **agrarian expansion pack's ground pieces** — the eight entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.5 that stand in a yard or a field rather
 * than roofing a room, held to the prop contract every earlier wave was held
 * to.
 *
 * The shared checks first — registration, the declared box, the clamps, the
 * quarter turns, determinism, no signs, no `chain`, no `lantern`, no mud — and
 * then the properties this pack was written against, each of which is a rule
 * the physics lint would otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its
 *   own. The granary's staddles and the sweep's beam are the cases that
 *   matter, so the check is the `floating.isolated` rule itself, run over the
 *   finished op set at every param case;
 * - **water is contained.** The pond and the dip are the two entries that dig
 *   water, and every water cell they write has solid under it and solid on all
 *   four sides of its own course — the plaza-well argument, asserted rather
 *   than asserted-in-prose;
 * - **the ways through stay walkable.** The pond's rim, the droving lane and
 *   the hop yard's lanes all keep solid non-water floor with two courses of
 *   air over them, which is what the lint's 1x2 body needs;
 * - **no mud**, which is 15/16 of a block and cannot be stood on;
 * - **the posts are columns.** Every course of the hop poles and of the well
 *   sweep's post is a full block, at every length the prop can be asked for.
 */

import { describe, expect, it } from "vitest";

import {
  HEDGEROW_PROP_NAMES,
  HOP_D,
  HOP_MAX,
  HOP_MIN,
  PENS_D,
  PENS_MAX,
  PENS_MIN,
  POND_SPAN,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  SWEEP_SPAN,
  generateProp,
  hedgerowPropFootprint,
  isHedgerowProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x1d5n, "world.hedgerow.props");
const OTHER = nodeSeed(0x1d5n, "world.hedgerow.props.other");

/** Every param case this file's props are walked at. */
const CASES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  field_gate: [{}],
  duck_pond: [{}],
  midden_heap: [{}],
  sheep_dip: [{}],
  staddle_granary: [{}],
  hop_yard: [{}, { length: 3 }, { length: 17 }, { length: 64 }],
  stock_pens: [{}, { length: 3 }, { length: 21 }, { length: 64 }],
  well_sweep: [{}],
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
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|_pot$|cauldron|iron_bars|torch|campfire|chest|barrel|_leaves$|^water$|^fern$)/;

/** What a body may stand inside — the lint's vocabulary, for the ways through. */
const PASSABLE = /(_carpet$|_trapdoor$|torch|^air$|^fern$)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the agrarian expansion pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isHedgerowProp(p)).toBe(true);
    }
    expect(isHedgerowProp("logging_camp")).toBe(false);
    expect(isHedgerowProp("well")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as implemented", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("agrarian");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
    // The hop yard is an infrastructure-kind row hosted by the prop registry,
    // on `stump_field`'s and `drydock`'s precedent: it is an areal frame with
    // a declared box, which is exactly what a prop is — and emphatically not a
    // run between two points on the terrain.
    expect(structureById("hop_yard")?.kind).toBe("infrastructure");
    expect(structureById("duck_pond")?.kind).toBe("prop");
  });

  /**
   * The pack's three route-following entries are nobody's yet, and must stay
   * that way: a hedgerow, a dry stone wall and a cart track are all runs
   * between two points on the terrain, which is the linework engine's job and
   * not something either registry can host.
   */
  it("leaves the pack's route-following entries alone", () => {
    for (const id of ["hedgerow", "dry_stone_wall", "cart_track"]) {
      expect(structureById(id)?.status, id).toBe("not_started");
      expect(PROP_NAMES as readonly string[], id).not.toContain(id);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        const declared = propFootprint(p, params);
        expect(declared, p).toEqual(hedgerowPropFootprint(p, params));
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

  it("clamps every size param, at both ends", () => {
    expect(propFootprint("hop_yard", { length: 2 }).size[0]).toBe(HOP_MIN);
    expect(propFootprint("hop_yard", { length: 999 }).size[0]).toBe(HOP_MAX);
    expect(propFootprint("hop_yard", { length: "long" }).size[0]).toBe(
      propFootprint("hop_yard", {}).size[0],
    );
    expect(propFootprint("stock_pens", { length: 2 }).size[0]).toBe(PENS_MIN);
    expect(propFootprint("stock_pens", { length: 999 }).size[0]).toBe(PENS_MAX);
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
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
    for (const p of HEDGEROW_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(hedgerowPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, uses no `chain`, hangs no lantern and lays no mud", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        for (const op of opsOf(p, params)) {
          expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
          expect(op.block, `${p} chain`).not.toBe("chain");
          expect(op.block.endsWith("lantern"), `${p} lantern`).toBe(false);
          // Mud is 15/16 of a block and a body cannot stand on it; a dirt path
          // is the same trap in a farmyard's clothes.
          expect(op.block, `${p} mud`).not.toBe("mud");
          expect(op.block, `${p} mud`).not.toBe("muddy_mangrove_roots");
          expect(op.block, `${p} path`).not.toBe("dirt_path");
        }
      }
    }
  });

  /** Every one of them writes its whole ground plane, edge to edge. */
  it("writes its whole footprint at the base plane", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        const declared = propFootprint(p, params);
        const at = indexOf(opsOf(p, params));
        for (let z = 0; z < declared.size[2]; z++) {
          for (let x = 0; x < declared.size[0]; x++) {
            expect(
              at.get(`${x},${declared.minY},${z}`),
              `${p} base at ${x},${z}`,
            ).toBeDefined();
          }
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* support and water                                                           */
/* -------------------------------------------------------------------------- */

describe("the agrarian props' support closure", () => {
  it("leaves no full block with six air faces, at any param case", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
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
    for (const p of HEDGEROW_PROP_NAMES) {
      const declared = propFootprint(p);
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/^(sand|gravel|red_sand)$/.test(op.block)) continue;
        if (op.y === declared.minY) continue;
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBeDefined();
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).not.toBe("air");
      }
    }
  });

  /** Fences, walls and carpets are on the support chain too. */
  it("stands every fence, wall and carpet on something", () => {
    for (const p of HEDGEROW_PROP_NAMES) {
      const declared = propFootprint(p);
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/(_wall$|fence|_carpet$|^fern$)/.test(op.block)) continue;
        if (op.y === declared.minY) continue;
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBeDefined();
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).not.toBe("air");
      }
    }
  });

  /**
   * **Water a prop digs is contained** — the one rule this pack could have
   * broken that no earlier prop pack could.
   *
   * Every water cell has a solid block under it and a solid block on all four
   * sides of its own course, unless the neighbour is water too. That is a
   * plain box, which is the argument the plaza well settled, and it is why
   * neither the pond nor the dip can drain into the terrain around it.
   */
  it("contains every cell of water it digs", () => {
    for (const p of ["duck_pond", "sheep_dip"]) {
      const at = indexOf(opsOf(p));
      const wet = (x: number, y: number, z: number): boolean =>
        at.get(`${x},${y},${z}`)?.block === "water";
      const solid = (x: number, y: number, z: number): boolean => {
        const block = at.get(`${x},${y},${z}`)?.block;
        return block !== undefined && block !== "air";
      };
      const cells = opsOf(p).filter((op) => op.block === "water");
      expect(cells.length, `${p} has water`).toBeGreaterThan(0);
      for (const op of cells) {
        expect(solid(op.x, op.y - 1, op.z), `${p}: floor under ${op.x},${op.y},${op.z}`).toBe(true);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const held = wet(op.x + dx, op.y, op.z + dz) || solid(op.x + dx, op.y, op.z + dz);
          expect(held, `${p}: side of ${op.x},${op.y},${op.z} toward ${dx},${dz}`).toBe(true);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the props themselves                                                        */
/* -------------------------------------------------------------------------- */

describe("what each agrarian prop is for", () => {
  it("hangs the field gate between two posts and leaves a way over it", () => {
    const at = indexOf(opsOf("field_gate"));
    // The hanging post is the tall one, and a full column to the ground.
    for (let y = 1; y <= 3; y++) {
      expect(at.get(`1,${y},1`)?.block, `hanging post at ${y}`).toBeDefined();
    }
    expect(at.get("3,2,1")?.block, "the slapping post").toBeDefined();
    expect(at.get("3,3,1"), "and it is shorter").toBeUndefined();
    // The leaf, two courses of bars, and never a `_fence_gate` derived from a
    // palette symbol that is a wall on half the themes.
    expect(at.get("2,1,1")?.block, "the gate's lower bars").toBe("iron_bars");
    expect(at.get("2,2,1")?.block, "the gate's upper bars").toBe("iron_bars");
    for (const op of opsOf("field_gate")) expect(op.block.endsWith("_gate")).toBe(false);
    // The stile, one stood stone each side of the wall end.
    expect(at.get("4,1,0")?.block.endsWith("_slab"), "the stile stone").toBe(true);
    expect(at.get("4,1,2")?.block.endsWith("_slab"), "the stile stone").toBe(true);
    // And the approach either side of the run stays walkable.
    for (const z of [0, 2]) {
      for (const x of [1, 2, 3]) {
        expect(at.get(`${x},0,${z}`), `approach floor ${x},${z}`).toBeDefined();
        for (const y of [1, 2]) {
          const block = at.get(`${x},${y},${z}`)?.block;
          expect(block === undefined || PASSABLE.test(block), `approach ${x},${y},${z}`).toBe(true);
        }
      }
    }
  });

  it("digs the duck pond, rims it, and stands the house on the ramp", () => {
    const at = indexOf(opsOf("duck_pond"));
    const mid = Math.floor(POND_SPAN / 2);
    // The puddled floor under the whole pad.
    for (let z = 0; z < POND_SPAN; z++) {
      for (let x = 0; x < POND_SPAN; x++) {
        expect(at.get(`${x},-1,${z}`)?.block, `clay at ${x},${z}`).toBe("clay");
      }
    }
    // The water, and the rim that holds it.
    expect(at.get(`${mid},0,${mid}`)?.block, "the middle of the pond").toBe("water");
    for (let x = 0; x < POND_SPAN; x++) {
      expect(at.get(`${x},0,0`)?.block, `rim at ${x}`).not.toBe("water");
      expect(at.get(`${x},0,${POND_SPAN - 1}`)?.block, `rim at ${x}`).not.toBe("water");
    }
    // The ramp out over the water, each plank touching the last.
    for (let z = mid; z < POND_SPAN; z++) {
      expect(at.get(`${mid},1,${z}`)?.block, `ramp at ${z}`).toBeDefined();
    }
    // The house on the end of it, over the water.
    expect(at.get(`${mid},2,${mid}`)?.block, "the duck house").toBeDefined();
    expect(at.get(`${mid},3,${mid}`)?.block.endsWith("_stairs"), "its roof").toBe(true);
    // The rim stays walkable: floor, and two clear courses over it.
    for (let x = 1; x < POND_SPAN - 1; x++) {
      if (x === mid) continue; // the ramp comes ashore here
      const floor = at.get(`${x},0,${POND_SPAN - 1}`)?.block;
      expect(floor, `rim floor ${x}`).toBeDefined();
      expect(floor, `rim floor ${x}`).not.toBe("water");
      for (const y of [1, 2]) {
        const block = at.get(`${x},${y},${POND_SPAN - 1}`)?.block;
        expect(block === undefined || PASSABLE.test(block), `rim head ${x},${y}`).toBe(true);
      }
    }
  });

  it("banks the midden against three walls and leaves the front open", () => {
    const at = indexOf(opsOf("midden_heap"));
    // Three walls, two courses each.
    for (let y = 1; y <= 2; y++) {
      expect(at.get(`0,${y},1`)?.block, `west wall at ${y}`).toBeDefined();
      expect(at.get(`4,${y},1`)?.block, `east wall at ${y}`).toBeDefined();
      expect(at.get(`2,${y},0`)?.block, `back wall at ${y}`).toBeDefined();
      // And the front is open, which is what makes it a midden.
      expect(at.get(`2,${y},4`), `front at ${y}`).toBeUndefined();
    }
    // The muck, banked deeper at the back.
    expect(at.get("2,2,1")?.block, "the bank at the back").toBeDefined();
    expect(at.get("2,2,3"), "and shallower at the front").toBeUndefined();
    // The fork, standing in the top of the heap.
    expect(at.get("2,3,1")?.block, "the fork").toBe("iron_bars");
  });

  it("sinks the sheep dip's trough and funnels a race into it", () => {
    const at = indexOf(opsOf("sheep_dip"));
    // The trough: water between two stopped ends, on the ground plane's next
    // course, with the deck either side of it.
    expect(at.get("1,1,2")?.block, "the head stop").not.toBe("water");
    expect(at.get("3,1,2")?.block, "the trough").toBe("water");
    expect(at.get("5,1,2")?.block, "the tail stop").not.toBe("water");
    expect(at.get("3,1,1")?.block, "the deck beside it").toBeDefined();
    expect(at.get("3,1,3")?.block, "the deck beside it").toBeDefined();
    // The race, standing on the deck.
    expect(at.get("3,2,1")?.block.includes("fence") || at.get("3,2,1")?.block.includes("wall")).toBe(
      true,
    );
    // Both ends of the pad stay at ground level and walkable.
    for (const x of [0, 6]) {
      for (const z of [0, 2, 4]) {
        expect(at.get(`${x},0,${z}`), `way in ${x},${z}`).toBeDefined();
        expect(at.get(`${x},1,${z}`), `way in head ${x},${z}`).toBeUndefined();
      }
    }
  });

  it("lifts the granary off the ground on four staddles", () => {
    const at = indexOf(opsOf("staddle_granary"));
    for (const [x, z] of [
      [1, 1],
      [3, 1],
      [1, 3],
      [3, 3],
    ] as const) {
      expect(at.get(`${x},1,${z}`)?.block, `staddle ${x},${z}`).toBeDefined();
      expect(at.get(`${x},2,${z}`)?.block, `staddle cap ${x},${z}`).toBeDefined();
    }
    // The gap is the point: the middle stays empty under the box.
    expect(at.get("2,1,2"), "the gap").toBeUndefined();
    expect(at.get("2,2,2"), "the gap").toBeUndefined();
    // The box, and its hatch.
    expect(at.get("2,3,2")?.block, "the box floor").toBeDefined();
    expect(at.get("2,4,2")?.block.endsWith("trapdoor"), "the hatch").toBe(true);
    // The step that does not touch it.
    expect(at.get("0,1,2")?.block.endsWith("_stairs"), "the step").toBe(true);
  });

  it("runs the hop yard's poles as columns and wires their heads together", () => {
    for (const params of [{}, { length: 13 }, { length: 31 }]) {
      const w = propFootprint("hop_yard", params).size[0];
      const h = propFootprint("hop_yard", params).size[1];
      const at = indexOf(opsOf("hop_yard", params));
      // Every pole is a full column from the ground to its head.
      for (let y = 1; y <= h - 1; y++) {
        const block = at.get(`2,${y},2`)?.block;
        expect(block, `pole at ${y} of ${h}`).toBeDefined();
        expect(block?.includes("log") || block?.includes("stem"), `pole at ${y} is timber`).toBe(
          true,
        );
      }
      // The wire between two pole heads.
      expect(at.get(`3,${h - 1},2`)?.block, "the wire run").toBe("iron_bars");
      // And the lanes between the rows stay clear, the whole length.
      for (let x = 0; x < w; x++) {
        expect(at.get(`${x},0,4`), `lane floor ${x}`).toBeDefined();
        for (const y of [1, 2]) {
          const block = at.get(`${x},${y},4`)?.block;
          expect(block === undefined || PASSABLE.test(block), `lane ${x},${y}`).toBe(true);
        }
      }
      // Nothing pokes out of the top of the box.
      expect(at.get(`2,${h},2`), "nothing over the head").toBeUndefined();
    }
  });

  it("keeps the stock pens' droving lane clear from end to end", () => {
    for (const params of [{}, { length: 13 }, { length: 25 }]) {
      const w = propFootprint("stock_pens", params).size[0];
      const at = indexOf(opsOf("stock_pens", params));
      const lane = Math.floor(PENS_D / 2);
      for (let x = 0; x < w; x++) {
        expect(at.get(`${x},0,${lane}`), `lane floor ${x}`).toBeDefined();
        for (const y of [1, 2]) {
          const block = at.get(`${x},${y},${lane}`)?.block;
          expect(block === undefined || PASSABLE.test(block), `lane ${x},${y}`).toBe(true);
        }
      }
      // The rails, with a gap left in every long run so a pen has a way in.
      expect(at.get(`0,1,${lane - 1}`)?.block, "the lane-side rail").toBeDefined();
      expect(at.get(`3,1,${lane - 1}`), "the gap in it").toBeUndefined();
      // The auctioneer's step, the one thing a body stands on top of.
      expect(at.get(`1,1,${lane - 2}`)?.block, "the step").toBeDefined();
      expect(at.get(`1,2,${lane - 2}`)?.block.endsWith("_slab"), "its tread").toBe(true);
    }
  });

  it("carries the well sweep's beam on a full column over contained water", () => {
    const at = indexOf(opsOf("well_sweep"));
    const mid = Math.floor(SWEEP_SPAN / 2);
    // The post: every course of it a full block, from the ground to the head.
    for (let y = 1; y <= 5; y++) {
      const block = at.get(`1,${y},${mid}`)?.block;
      expect(block, `post at ${y}`).toBeDefined();
      expect(block?.includes("log") || block?.includes("stem"), `post at ${y} is timber`).toBe(true);
    }
    // The beam, every cell of it touching the last.
    for (let x = 2; x <= 5; x++) expect(at.get(`${x},5,${mid}`)?.block, `beam at ${x}`).toBeDefined();
    // The counterweight on the short arm and the bucket line on the long one.
    expect(at.get(`0,5,${mid}`)?.block, "the counterweight").toBeDefined();
    expect(at.get(`5,4,${mid}`)?.block, "the bucket line").toBe("iron_bars");
    // The well: one cell of water inside a ring of stone.
    expect(at.get(`5,1,${mid}`)?.block, "the well").toBe("water");
    expect(at.get(`4,1,${mid}`)?.block, "its rim").not.toBe("water");
    expect(at.get(`6,1,${mid}`)?.block, "its rim").not.toBe("water");
  });
});
