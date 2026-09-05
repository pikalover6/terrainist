/**
 * The **wilds & camps pack's ground pieces** — the six entries of
 * that stand in a cut-over rather than
 * roofing a room, held to the prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the clamps, the
 * quarter turns, determinism, no signs, no `chain`, no `lantern` — and then
 * the properties this pack was written against, each of which is a rule the
 * physics lint would otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every full cube rests on the base
 *   plane, on a column run down to it, or on a horizontal neighbour of its
 *   own. The spar's mast and the cache's box are the cases that matter, so the
 *   check is the `floating.isolated` rule itself, run over the finished op set
 *   at every param case;
 * - **the ways through stay walkable.** The camp's lane, the shanty doorways
 *   and the sawpit's pit floor all have solid non-water floor with two courses
 *   of air over them, which is what the lint's 1x2 body needs;
 * - **no mud.** It is 15/16 of a block and a body cannot stand on it, so a
 *   camp floored in it is a camp you can only look at;
 * - **the mast is a column.** Every course of the spar from the ground to its
 *   head is a full block, at every height the prop can be asked for — a pole
 *   drawn as rigging over a stub is the defect this shape was chosen against.
 */

import { describe, expect, it } from "vitest";

import {
  CAMP_MAX,
  CAMP_MIN,
  PROP_NAMES,
  SPAR_MAX,
  SPAR_MIN,
  SPAR_SPAN,
  STRUCTURE_CATALOG,
  STUMP_MAX,
  STUMP_MIN,
  WILDS_PROP_NAMES,
  generateProp,
  isWildsProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  wildsPropFootprint,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x1d5n, "world.wilds.props");
const OTHER = nodeSeed(0x1d5n, "world.wilds.props.other");

/** Every param case this file's props are walked at. */
const CASES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  logging_camp: [{}, { length: 3 }, { length: 21 }, { length: 64 }],
  log_landing: [{}],
  sawpit: [{}],
  stump_field: [{}, { length: 3 }, { length: 19 }, { length: 64 }],
  spar_pole: [{}, { height: 3 }, { height: 13 }, { height: 64 }],
  hunters_cache: [{}],
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
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|lantern|_pot$|cauldron|iron_bars|torch|campfire|chest|barrel|_leaves$)/;

/** What a body may stand inside — the lint's vocabulary, for the ways through. */
const PASSABLE = /(_carpet$|_trapdoor$|torch|^air$)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the wilds pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of WILDS_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isWildsProp(p)).toBe(true);
    }
    expect(isWildsProp("capstan")).toBe(false);
    expect(isWildsProp("campsite")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as implemented", () => {
    for (const p of WILDS_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("wilds_camps");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
    expect(structureById("logging_camp")?.category).toBe("nomadic");
    expect(structureById("sawpit")?.category).toBe("industrial");
    // The cut-over is an infrastructure-kind row hosted by the prop registry,
    // on `drydock`'s and `careening_beach`'s precedent: it is a floor-plane
    // treatment with a declared box, which is exactly what a prop is.
    expect(structureById("stump_field")?.kind).toBe("infrastructure");
  });

  /**
   * The pack's three route-following entries are nobody's yet, and must stay
   * that way: a flume, a boom and a rope bridge are all runs between two
   * points on the terrain, which is the linework engine's job and not
   * something either registry can host.
   */
  it("leaves the pack's route-following entries alone", () => {
    for (const id of ["log_flume", "river_log_boom", "rope_bridge"]) {
      expect(structureById(id)?.status, id).toBe("not_started");
      expect(PROP_NAMES as readonly string[], id).not.toContain(id);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of WILDS_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        const declared = propFootprint(p, params);
        expect(declared, p).toEqual(wildsPropFootprint(p, params));
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
    expect(propFootprint("logging_camp", { length: 2 }).size[0]).toBe(CAMP_MIN);
    expect(propFootprint("logging_camp", { length: 999 }).size[0]).toBe(CAMP_MAX);
    expect(propFootprint("logging_camp", { length: "long" }).size[0]).toBe(
      propFootprint("logging_camp", {}).size[0],
    );
    expect(propFootprint("stump_field", { length: 2 }).size[0]).toBe(STUMP_MIN);
    expect(propFootprint("stump_field", { length: 999 }).size[0]).toBe(STUMP_MAX);
    expect(propFootprint("spar_pole", { height: 2 }).size[1]).toBe(SPAR_MIN);
    expect(propFootprint("spar_pole", { height: 999 }).size[1]).toBe(SPAR_MAX);
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of WILDS_PROP_NAMES) {
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
    for (const p of WILDS_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(wildsPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, uses no `chain`, hangs no lantern and lays no mud", () => {
    for (const p of WILDS_PROP_NAMES) {
      for (const params of CASES[p] as readonly Record<string, unknown>[]) {
        for (const op of opsOf(p, params)) {
          expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
          expect(op.block, `${p} chain`).not.toBe("chain");
          expect(op.block.endsWith("lantern"), `${p} lantern`).toBe(false);
          // Mud is 15/16 of a block and a body cannot stand on it.
          expect(op.block, `${p} mud`).not.toBe("mud");
          expect(op.block, `${p} mud`).not.toBe("muddy_mangrove_roots");
        }
      }
    }
  });

  /** Every one of them writes its whole ground plane, edge to edge. */
  it("writes its whole footprint at the base plane", () => {
    for (const p of WILDS_PROP_NAMES) {
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

describe("the wilds props' support closure", () => {
  it("leaves no full block with six air faces, at any param case", () => {
    for (const p of WILDS_PROP_NAMES) {
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
    for (const p of WILDS_PROP_NAMES) {
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
    for (const p of WILDS_PROP_NAMES) {
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/(_wall$|fence|_carpet$|^campfire$)/.test(op.block)) continue;
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

describe("what each wilds prop is for", () => {
  it("leaves the logging camp's lane walkable from end to end", () => {
    for (const params of [{}, { length: 13 }, { length: 27 }]) {
      const w = propFootprint("logging_camp", params).size[0];
      const at = indexOf(opsOf("logging_camp", params));
      // The lane, between the two rows — clear apart from the cook fire.
      for (let x = 0; x < w; x++) {
        if (x >= 2 && x <= 4) continue; // the fire's hearth
        for (const y of [1, 2]) {
          const block = at.get(`${x},${y},7`)?.block;
          expect(block === undefined || PASSABLE.test(block), `lane ${x},${y}`).toBe(true);
        }
        expect(at.get(`${x},0,7`), `lane floor ${x}`).toBeDefined();
      }
      // The bunk shanty's doorway: two clear courses over solid ground.
      expect(at.get("3,0,5"), "the doorstep floor").toBeDefined();
      expect(at.get("3,1,5"), "the doorway").toBeUndefined();
      expect(at.get("3,2,5"), "the doorway's head").toBeUndefined();
      // And the roof over it, so the shanty is a shanty.
      expect(at.get("3,3,5")?.block, "the shanty roof").toBeDefined();
      // The fire, on its own hearth and not a lantern by name.
      expect(at.get("3,2,7")?.block, "the cook fire").toBe("campfire");
      expect(at.get("3,1,7")?.block, "the hearth under it").toBeDefined();
    }
  });

  it("batters the log landing's deck back and squares its ends to the track", () => {
    const at = indexOf(opsOf("log_landing"));
    // Three courses, each inset one cell at both ends.
    expect(at.get("1,1,5")?.block, "the bottom course").toBeDefined();
    expect(at.get("1,2,5"), "the second course, inset").toBeUndefined();
    expect(at.get("2,2,5")?.block, "the second course").toBeDefined();
    expect(at.get("3,3,5")?.block, "the third course").toBeDefined();
    // The anchor posts, full columns at both ends.
    for (let y = 1; y <= 3; y++) {
      expect(at.get(`0,${y},4`)?.block, `west anchor at ${y}`).toBeDefined();
      expect(at.get(`10,${y},7`)?.block, `east anchor at ${y}`).toBeDefined();
    }
    // The track stays clear: floor, and two courses of air over it.
    for (let x = 0; x < 11; x++) {
      for (const z of [0, 1]) {
        expect(at.get(`${x},0,${z}`), `track floor ${x},${z}`).toBeDefined();
        expect(at.get(`${x},1,${z}`), `track knee ${x},${z}`).toBeUndefined();
        expect(at.get(`${x},2,${z}`), `track head ${x},${z}`).toBeUndefined();
      }
    }
  });

  it("stands the sawpit's saw in the kerf, over a pit a body can stand in", () => {
    const at = indexOf(opsOf("sawpit"));
    // The pit floor: ground, and two clear courses over it.
    for (let x = 2; x <= 4; x++) {
      expect(at.get(`${x},0,2`), `pit floor ${x}`).toBeDefined();
      if (x === 3) continue; // the saw stands in the middle of the run
      expect(at.get(`${x},1,2`), `pit knee ${x}`).toBeUndefined();
    }
    // The deck either side of it.
    expect(at.get("1,1,1")?.block, "the deck").toBeDefined();
    // The butt over the pit, with the kerf cut out of it.
    expect(at.get("2,2,2")?.block, "the butt").toBeDefined();
    expect(at.get("3,2,2")?.block, "the kerf").toBe("iron_bars");
    // The saw, standing in it from the pit floor to the top of the cut.
    for (let y = 1; y <= 3; y++) expect(at.get(`3,${y},2`)?.block, `saw at ${y}`).toBe("iron_bars");
  });

  it("leaves one great stump in the cut-over, and stumps around it", () => {
    for (const params of [{}, { length: 13 }, { length: 31 }]) {
      const w = propFootprint("stump_field", params).size[0];
      const ops = opsOf("stump_field", params);
      const at = indexOf(ops);
      const midX = Math.floor(w / 2);
      const midZ = 7;
      // The great stump: three across, two courses.
      for (let z = midZ - 1; z <= midZ + 1; z++) {
        for (let x = midX - 1; x <= midX + 1; x++) {
          expect(at.get(`${x},1,${z}`)?.block, `great stump ${x},${z}`).toBeDefined();
          expect(at.get(`${x},2,${z}`)?.block, `great stump crown ${x},${z}`).toBeDefined();
        }
      }
      // And a stand of ordinary ones around it.
      const stumps = ops.filter((o) => o.y === 1 && o.block.includes("log"));
      expect(stumps.length, "the felled stand").toBeGreaterThan(9);
      // Nothing stands high enough to be a wall.
      expect(
        ops.every((o) => o.y <= 2),
        "a cut-over is low",
      ).toBe(true);
    }
  });

  it("runs the spar's mast as a full column from the ground to its head", () => {
    for (const params of [{}, { height: 11 }, { height: 25 }]) {
      const h = propFootprint("spar_pole", params).size[1];
      const at = indexOf(opsOf("spar_pole", params));
      const mid = Math.floor(SPAR_SPAN / 2);
      for (let y = 1; y <= h - 1; y++) {
        const block = at.get(`${mid},${y},${mid}`)?.block;
        expect(block, `mast at ${y} of ${h}`).toBeDefined();
        expect(block?.includes("log"), `mast at ${y} is timber`).toBe(true);
      }
      // Nothing above the head.
      expect(at.get(`${mid},${h},${mid}`), "nothing over the head").toBeUndefined();
      // The four guys, each a run from its own stump.
      for (const [dx, dz] of [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ] as const) {
        expect(at.get(`${mid + dx},1,${mid + dz}`)?.block, "a guy stump").toBeDefined();
        expect(at.get(`${mid + dx},2,${mid + dz}`)?.block, "a guy line").toBe("iron_bars");
      }
      // The foot is walkable: the four cells round the mast are clear.
      for (const [dx, dz] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        expect(at.get(`${mid + dx},1,${mid + dz}`), "the foot is clear").toBeUndefined();
      }
    }
  });

  it("lifts the cache above bear height on four peeled legs", () => {
    const at = indexOf(opsOf("hunters_cache"));
    for (const [x, z] of [
      [1, 1],
      [3, 1],
      [1, 3],
      [3, 3],
    ] as const) {
      for (let y = 1; y <= 4; y++) {
        expect(at.get(`${x},${y},${z}`)?.block, `leg ${x},${z} at ${y}`).toBeDefined();
      }
    }
    // The gap is the point: the cells between the legs are empty all the way up.
    for (let y = 1; y <= 4; y++) {
      expect(at.get(`2,${y},2`), `the gap at ${y}`).toBeUndefined();
    }
    // The box, and its hatch.
    expect(at.get("2,5,2")?.block, "the box floor").toBeDefined();
    expect(at.get("2,6,2")?.block.endsWith("trapdoor"), "the hatch").toBe(true);
  });
});
