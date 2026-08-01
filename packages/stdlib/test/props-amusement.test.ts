/**
 * The fairground props: four amusements, held to the prop contract.
 *
 * The same tests every earlier prop wave was held to — registration, the
 * declared box, the quarter turns, determinism — plus the one property this
 * wave was written against and which the physics lint checks downstream:
 *
 * **support closure.** Nothing floats. Every block either rests on the ground
 * plane, rests on another of the prop's own blocks, or hangs under one — and
 * for the blocks the lint holds to its `groundedChain` rule (fences, walls,
 * standing lanterns, torches, carpets, potted plants) the chain is walked all
 * the way down here, exactly as `physics.ts` walks it. The hanging lanterns
 * and the swing boats' chains are walked the other way, to a solid anchor
 * above, which is `hungChain`.
 */

import { describe, expect, it } from "vitest";

import {
  AMUSEMENT_PROP_NAMES,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  amusementPropFootprint,
  generateProp,
  isAmusementProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xfa112n, "world.fair");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("fairground props", () => {
  it("registers every one of them, once", () => {
    for (const p of AMUSEMENT_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isAmusementProp(p)).toBe(true);
    }
    expect(isAmusementProp("carousel")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as wave four, implemented", () => {
    for (const p of AMUSEMENT_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.wave, p).toBe(4);
      expect(entry?.kind, p).toBe("prop");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of AMUSEMENT_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(amusementPropFootprint(p));
      const result = generateProp({ prop: p, seed: SEED });
      expect(result.meta.size, p).toEqual(declared.size);
      expect(result.ops.length, p).toBeGreaterThan(15);
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

  it("survives every quarter turn with its box intact", () => {
    for (const p of AMUSEMENT_PROP_NAMES) {
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

  it("gives the same ops for the same seed, every time", () => {
    for (const p of AMUSEMENT_PROP_NAMES) {
      const once = JSON.stringify(generateProp({ prop: p, seed: SEED }).ops);
      expect(JSON.stringify(generateProp({ prop: p, seed: SEED }).ops), p).toBe(once);
    }
  });

  it("places no sign block and no open fluid", () => {
    for (const p of AMUSEMENT_PROP_NAMES) {
      for (const op of generateProp({ prop: p, seed: SEED }).ops) {
        expect(op.block, `${p} ${op.x},${op.y},${op.z}`).not.toMatch(/sign$/);
        expect(["water", "lava"], `${p} ${op.x},${op.y},${op.z}`).not.toContain(op.block);
      }
    }
  });

  /* ------------------------------------------------------------------------ */
  /* support closure                                                           */
  /* ------------------------------------------------------------------------ */

  /** `physics.ts`'s `NEEDS_GROUND`, verbatim. */
  const NEEDS_GROUND =
    /(_fence|_wall|_fence_gate|_carpet|_pressure_plate|_sign|torch|campfire|lantern)$/;
  /** `physics.ts`'s `STANDABLE_PARTIAL`. */
  const PARTIAL = /(_slab|_stairs)$/;

  it("grounds or hangs every block it places, at yaw 0", () => {
    for (const p of AMUSEMENT_PROP_NAMES) {
      const result = generateProp({ prop: p, seed: SEED });
      const at = indexOf(result.ops);
      const nameAt = (x: number, y: number, z: number): string | undefined =>
        at.get(`${x},${y},${z}`)?.block;

      /** `groundedChain`: down through standing blocks to the base plane. */
      const grounded = (x: number, y: number, z: number): boolean => {
        for (let by = y - 1; by >= 0; by--) {
          if (by < 0) return false;
          const name = nameAt(x, by, z);
          // `y = -1` is the ground the prop is placed on, so a block resting
          // on the base plane is grounded by the world beneath it.
          if (name === undefined) return by < 0;
          if (PARTIAL.test(name)) return true;
          if (!NEEDS_GROUND.test(name) && !name.startsWith("potted_")) return true;
        }
        // Fell through to the base plane: the ground itself.
        return true;
      };

      /** `hungChain`: up through chains and fences to a solid anchor. */
      const hung = (x: number, y: number, z: number): boolean => {
        for (let ay = y + 1; ay < 64; ay++) {
          const name = nameAt(x, ay, z);
          if (name === undefined) return false;
          if (name === "iron_bars" || name.endsWith("_fence") || name.endsWith("_wall")) return true;
          if (name.endsWith("lantern")) continue;
          if (name.endsWith("_slab") && at.get(`${x},${ay},${z}`)?.props?.["type"] === "bottom") {
            return true;
          }
          if (!PARTIAL.test(name)) return true; // a full cube
          return false;
        }
        return false;
      };

      for (const op of result.ops) {
        const where = `${p} ${op.block} at ${op.x},${op.y},${op.z}`;
        if (op.block.endsWith("lantern") && op.props?.["hanging"] === "true") {
          expect(hung(op.x, op.y, op.z), where).toBe(true);
          continue;
        }
        if (NEEDS_GROUND.test(op.block) || op.block.startsWith("potted_")) {
          expect(grounded(op.x, op.y, op.z), where).toBe(true);
        }
        // The lint's weaker `floating.*` rule for half blocks: never air on
        // every side.
        if (PARTIAL.test(op.block)) {
          const touching =
            nameAt(op.x, op.y - 1, op.z) !== undefined ||
            nameAt(op.x, op.y + 1, op.z) !== undefined ||
            nameAt(op.x + 1, op.y, op.z) !== undefined ||
            nameAt(op.x - 1, op.y, op.z) !== undefined ||
            nameAt(op.x, op.y, op.z + 1) !== undefined ||
            nameAt(op.x, op.y, op.z - 1) !== undefined ||
            op.y === 0;
          expect(touching, where).toBe(true);
        }
        // Everything else: a full cube sits on the base plane, or joins the
        // prop's own body — under, over or beside. The lint polices no support
        // rule for full cubes, so this is the *stronger* "nothing floats"
        // reading, and it is what lets a crossbar span between two masts
        // without letting a block hang in mid-air on its own.
        if (!PARTIAL.test(op.block) && !NEEDS_GROUND.test(op.block) && op.y > 0) {
          const joined = ([
            [0, -1, 0],
            [0, 1, 0],
            [1, 0, 0],
            [-1, 0, 0],
            [0, 0, 1],
            [0, 0, -1],
          ] as const).some(([dx, dy, dz]) => nameAt(op.x + dx, op.y + dy, op.z + dz) !== undefined);
          expect(joined, `${where} floats free of the prop`).toBe(true);
        }
      }
    }
  });

  it("chains every swing boat seat up to the crossbar", () => {
    const result = generateProp({ prop: "swing_boats", seed: SEED });
    const at = indexOf(result.ops);
    const chains = result.ops.filter((op) => op.block === "iron_bars");
    expect(chains.length).toBeGreaterThanOrEqual(4);
    for (const link of chains) {
      const above = at.get(`${link.x},${link.y + 1},${link.z}`);
      expect(above, `chain at ${link.x},${link.y},${link.z}`).toBeDefined();
      expect(
        above?.block === "iron_bars" || (above?.block ?? "").endsWith("_log"),
        `chain at ${link.x},${link.y},${link.z} hangs from ${above?.block}`,
      ).toBe(true);
      // …and the hull hangs under the lowest link.
      const below = at.get(`${link.x},${link.y - 1},${link.z}`);
      expect(below, `under the chain at ${link.x},${link.y},${link.z}`).toBeDefined();
    }
  });

  /* ------------------------------------------------------------------------ */
  /* character                                                                 */
  /* ------------------------------------------------------------------------ */

  const has = (prop: string, block: string): boolean =>
    generateProp({ prop: prop as never, seed: SEED }).ops.some((op) => op.block === block);

  it("builds the thing each prop is for", () => {
    // A striped canopy, a counter, hanging lights.
    expect(has("fairground_stall", "red_wool"), "stripe").toBe(true);
    expect(has("fairground_stall", "white_wool"), "stripe").toBe(true);
    expect(has("fairground_stall", "hay_block"), "the wares").toBe(true);
    expect(has("fairground_stall", "red_banner"), "the flag").toBe(true);
    // A kiosk with a till and a window gap in the front wall.
    expect(has("ticket_booth", "barrel"), "the till").toBe(true);
    const booth = generateProp({ prop: "ticket_booth", seed: SEED });
    const boothAt = indexOf(booth.ops);
    expect(boothAt.get("1,2,0"), "the window gap").toBeUndefined();
    expect(boothAt.get("1,1,0"), "the sill").toBeDefined();
    // A disc on a post, with a pointer over it.
    const wheel = generateProp({ prop: "prize_wheel", seed: SEED });
    expect(wheel.ops.filter((op) => op.block.endsWith("_wool")).length).toBeGreaterThan(20);
    expect(
      wheel.ops.some((op) => op.block.endsWith("_trapdoor")),
      "the pointer",
    ).toBe(true);
    // Every wheel block stands in the one plane the post is in.
    for (const op of wheel.ops) expect(op.x, "the wheel is one block thick").toBe(0);
    // Two boats, two frames.
    const swing = generateProp({ prop: "swing_boats", seed: SEED });
    expect(swing.ops.filter((op) => op.block.endsWith("_stairs")).length).toBe(4);
    expect(swing.ops.filter((op) => op.block === "iron_bars").length).toBe(4);
  });
});
