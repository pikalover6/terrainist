/**
 * Wave 4: the twelve street-furniture props.
 *
 * The same three properties every prop wave is held to — it registers, it
 * builds inside the box it declared, it is deterministic, it survives a
 * quarter turn — plus the one this wave exists to get right:
 *
 * **support**. Every op rests on the ground plane, stands on another op of the
 * same prop, hangs under one, or touches one sideways (a beam between two
 * posts, a slab arm off a column). That is deliberately the *world* lint's
 * predicate in miniature: `checkWorldPhysics` runs the real one over the dev
 * world, and a prop that fails here would fail there three packages
 * downstream, where the finding names a world coordinate instead of a prop.
 */

import { describe, expect, it } from "vitest";

import {
  BOLLARD_ROW_DEFAULT,
  PROP_NAMES,
  STREET_PROP_EXHIBIT_PLAN,
  STREET_PROP_NAMES,
  generateProp,
  isStreetProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  streetPropFootprint,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x54211n, "world.street");
const OTHER = nodeSeed(0x54211n, "world.street.other");

/** Params worth exercising, per prop. */
const CASES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  bollard_row: [{}, { length: 5 }, { length: 16 }, { length: 33 }],
};

function casesFor(prop: string): readonly Record<string, unknown>[] {
  return CASES[prop] ?? [{}];
}

function opsOf(prop: string, params: Record<string, unknown> = {}, seed = SEED): LocalVoxelOp[] {
  return generateProp({ prop, seed, params }).ops;
}

describe("street props", () => {
  it("registers every one of them, once", () => {
    expect(STREET_PROP_NAMES).toHaveLength(12);
    for (const p of STREET_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isStreetProp(p)).toBe(true);
    }
    expect(isStreetProp("bench")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("declares the box it builds in, and fills all four sides of it", () => {
    for (const p of STREET_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const declared = propFootprint(p, params);
        expect(declared, p).toEqual(streetPropFootprint(p, params));
        const result = generateProp({ prop: p, seed: SEED, params });
        expect(result.meta.size, p).toEqual(declared.size);
        expect(result.ops.length, p).toBeGreaterThan(5);
        const xs = result.ops.map((o) => o.x);
        const zs = result.ops.map((o) => o.z);
        expect(Math.min(...xs), `${p} min x`).toBe(0);
        expect(Math.min(...zs), `${p} min z`).toBe(0);
        expect(Math.max(...xs), `${p} max x`).toBe(declared.size[0] - 1);
        expect(Math.max(...zs), `${p} max z`).toBe(declared.size[2] - 1);
        for (const op of result.ops) {
          expect(op.y, `${p} y`).toBeGreaterThanOrEqual(declared.minY);
          expect(op.y, `${p} y`).toBeLessThan(declared.minY + declared.size[1]);
        }
      }
    }
  });

  it("stands every block on something: ground, itself, or a block over it", () => {
    for (const p of STREET_PROP_NAMES) {
      const ops = opsOf(p);
      const cells = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      const has = (x: number, y: number, z: number): boolean => cells.has(`${x},${y},${z}`);
      for (const op of ops) {
        // The four ways a block is legitimately up. The sideways case is the
        // beam idiom — a log spanning two posts, a slab arm off a column —
        // which the world lint allows for exactly the same reason.
        const supported =
          op.y === 0 ||
          has(op.x, op.y - 1, op.z) ||
          has(op.x, op.y + 1, op.z) ||
          has(op.x + 1, op.y, op.z) ||
          has(op.x - 1, op.y, op.z) ||
          has(op.x, op.y, op.z + 1) ||
          has(op.x, op.y, op.z - 1);
        expect(supported, `${p} floats at ${op.x},${op.y},${op.z} (${op.block})`).toBe(true);
      }
    }
  });

  it("hangs every hanging lantern from a block, and stands the rest on one", () => {
    for (const p of STREET_PROP_NAMES) {
      const ops = opsOf(p);
      const cells = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      for (const op of ops.filter((o) => o.block.endsWith("lantern"))) {
        const dy = op.props?.["hanging"] === "true" ? 1 : -1;
        expect(
          cells.has(`${op.x},${op.y + dy},${op.z}`) || (dy === -1 && op.y === 0),
          `${p} lantern at ${op.x},${op.y},${op.z}`,
        ).toBe(true);
      }
    }
  });

  it("writes no fluid and no sign block anywhere", () => {
    for (const p of STREET_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block, p).not.toBe("water");
        expect(op.block, p).not.toBe("lava");
        expect(op.block.endsWith("_sign"), `${p} ${op.block}`).toBe(false);
      }
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of STREET_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const result = generateProp({ prop: p, seed: SEED, params });
        const [sx, , sz] = result.meta.size;
        for (const yaw of [90, 180, 270] as const) {
          const rotated = rotateOps(result.ops, yaw, sx, sz);
          expect(rotated.length, `${p} @${yaw}`).toBe(result.ops.length);
          const [w, d] = yaw === 180 ? [sx, sz] : [sz, sx];
          const outside = rotated.filter(
            (op) => op.x < 0 || op.x >= w || op.z < 0 || op.z >= d,
          );
          expect(outside, `${p} @${yaw} left its box`).toEqual([]);
          expect(new Set(rotated.map((o) => `${o.x},${o.y},${o.z}`)).size).toBe(
            result.ops.length,
          );
        }
      }
    }
  });

  it("swaps a log pile's axis on a quarter turn and keeps it on the flat", () => {
    const ops = opsOf("log_pile");
    const axes = (list: readonly LocalVoxelOp[]): Set<string> =>
      new Set(
        list.filter((o) => o.block.endsWith("_log")).map((o) => o.props?.["axis"] as string),
      );
    expect(axes(ops)).toEqual(new Set(["x"]));
    expect(axes(rotateOps(ops, 90, 5, 3))).toEqual(new Set(["z"]));
    expect(axes(rotateOps(ops, 180, 5, 3))).toEqual(new Set(["x"]));
  });

  it("gives the same ops for the same seed, and the same box for another", () => {
    for (const p of STREET_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const once = JSON.stringify(opsOf(p, params));
        expect(JSON.stringify(opsOf(p, params)), p).toBe(once);
      }
      const a = generateProp({ prop: p, seed: SEED }).meta;
      const b = generateProp({ prop: p, seed: OTHER }).meta;
      expect(b.size, p).toEqual(a.size);
      expect(b.minY, p).toBe(a.minY);
    }
  });

  it("scales the bollard row with its length, ends included", () => {
    for (const length of [5, BOLLARD_ROW_DEFAULT, 16, 33]) {
      const result = generateProp({ prop: "bollard_row", seed: SEED, params: { length } });
      expect(result.meta.size[0], `length ${length}`).toBe(length);
      const heads = result.ops.filter((o) => o.y === 1).map((o) => o.x);
      expect(heads, `length ${length} west end`).toContain(0);
      expect(heads, `length ${length} east end`).toContain(length - 1);
    }
    // Out of range clamps rather than throwing, like every other param.
    expect(propFootprint("bollard_row", { length: 200 }).size[0]).toBe(33);
    expect(propFootprint("bollard_row", { length: 1 }).size[0]).toBe(5);
  });

  it("fills the water props from cauldrons rather than from a fluid", () => {
    for (const p of ["well_head", "horse_trough", "drinking_fountain"]) {
      const filled = opsOf(p).filter((o) => o.block === "water_cauldron");
      expect(filled.length, p).toBeGreaterThan(0);
      for (const op of filled) expect(op.props?.["level"], p).toBe("3");
    }
  });

  it("draws a flagpole's banner from the seed, out of the banner set", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const seed = nodeSeed(20260731n, `world.flag_${i}`, "");
      const banner = opsOf("flagpole", {}, seed).find((o) => o.block.endsWith("_banner"));
      expect(banner).toBeDefined();
      seen.add((banner as LocalVoxelOp).block);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("leaves the kennel a doorway and roofs it", () => {
    const ops = opsOf("dog_kennel");
    const at = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
    for (const y of [1, 2]) expect(at.has(`1,${y},2`), `doorway at y ${y}`).toBe(false);
    expect(ops.filter((o) => o.y === 3).length, "roof").toBe(9);
    expect(
      ops.some((o) => o.block === "light_weighted_pressure_plate"),
      "the bowl",
    ).toBe(true);
  });

  it("exhibits every one of them, at yaw 0 at least once", () => {
    const shown = new Map<string, Set<unknown>>();
    for (const row of STREET_PROP_EXHIBIT_PLAN) {
      for (const cell of row.cells) {
        const yaws = shown.get(cell.prop) ?? new Set();
        yaws.add(cell.params["yaw"] ?? 0);
        shown.set(cell.prop, yaws);
      }
    }
    for (const p of STREET_PROP_NAMES) {
      expect(shown.has(p), `${p} has no exhibit`).toBe(true);
      expect(shown.get(p)?.has(0), `${p} is never shown unrotated`).toBe(true);
    }
  });

  it("is claimed by the catalog as implemented, at wave 4, with a note", () => {
    for (const p of STREET_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, `${p} is missing from the catalog`).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.wave, p).toBe(4);
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
    }
  });
});
