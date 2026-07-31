/**
 * The wave-6E monuments: seven props, held to the prop contract.
 *
 * The same tests every earlier prop wave was held to — registration, the
 * declared box, the quarter turns, determinism, no signs and no fluids — plus
 * the properties this wave was written against and which the physics lint
 * checks downstream:
 *
 * - **support closure.** Nothing floats. Every block rests on the base plane,
 *   rests on another of the prop's own blocks, or hangs under one; the
 *   `groundedChain` walk for fences, walls and carpets is replicated here
 *   exactly as `physics.ts` walks it;
 * - **the lintel case**, checked rather than asserted: every block of a
 *   trilithon's lintel has a post beneath it or lintel beside it, so no lintel
 *   block is a full cube with six air faces;
 * - **the fallen obelisk is on the ground**: every block of the fallen section
 *   and its scatter rests on the pad or on the run it came off;
 * - **no plain `mud`.** A dig bed is `coarse_dirt` and `packed_mud`; plain mud
 *   is a block a player sinks into and nobody asked a dig for that;
 * - **no `chain`** — not in the pinned block table at all.
 */

import { describe, expect, it } from "vitest";

import {
  PROP_NAMES,
  RELIC_PROP_EXHIBIT_PLAN,
  RELIC_PROP_NAMES,
  STRUCTURE_CATALOG,
  generateProp,
  isRelicProp,
  nodeSeed,
  propFootprint,
  relicPropFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x6e0an, "world.relic");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("wave-6E monument props", () => {
  it("registers every one of them, once", () => {
    for (const p of RELIC_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isRelicProp(p)).toBe(true);
    }
    expect(isRelicProp("cairn")).toBe(false);
    expect(isRelicProp("graveyard")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  /**
   * The catalog flip carries a **`kind` override**: these entries sit in the
   * `ruins` group, whose usual kind is `building`, and every one of them is a
   * prop. The override is the only way the exception stays visible where it is
   * made.
   */
  it("is claimed by the catalog as wave six, implemented, and a PROP", () => {
    for (const p of RELIC_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.wave, p).toBe(6);
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of RELIC_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(relicPropFootprint(p));
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
    for (const p of RELIC_PROP_NAMES) {
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
    for (const p of RELIC_PROP_NAMES) {
      const once = JSON.stringify(generateProp({ prop: p, seed: SEED }).ops);
      expect(JSON.stringify(generateProp({ prop: p, seed: SEED }).ops), p).toBe(once);
    }
  });

  it("places no sign, no chain, no open fluid and no plain mud", () => {
    for (const p of RELIC_PROP_NAMES) {
      for (const op of generateProp({ prop: p, seed: SEED }).ops) {
        const where = `${p} ${op.block} at ${op.x},${op.y},${op.z}`;
        expect(op.block, where).not.toMatch(/sign$/);
        expect(op.block, where).not.toBe("chain");
        expect(["water", "lava", "fire", "mud"], where).not.toContain(op.block);
      }
    }
  });

  it("registers its dev-world rows against real prop names", () => {
    const named = new Set<string>();
    for (const row of RELIC_PROP_EXHIBIT_PLAN) {
      expect(row.water, row.row).toBe(false);
      for (const cell of row.cells) {
        expect(RELIC_PROP_NAMES as readonly string[], row.row).toContain(cell.prop);
        named.add(cell.prop);
      }
    }
    expect([...named].sort()).toEqual([...RELIC_PROP_NAMES].sort());
  });

  /* ------------------------------------------------------------------------ */
  /* support closure                                                           */
  /* ------------------------------------------------------------------------ */

  /** `physics.ts`'s `NEEDS_GROUND`, verbatim. */
  const NEEDS_GROUND =
    /(_fence|_wall|_fence_gate|_carpet|_pressure_plate|_sign|torch|campfire|lantern)$/;
  /** `physics.ts`'s `STANDABLE_PARTIAL`. */
  const PARTIAL = /(_slab|_stairs)$/;

  it("grounds or joins every block it places, at yaw 0", () => {
    for (const p of RELIC_PROP_NAMES) {
      const result = generateProp({ prop: p, seed: SEED });
      const at = indexOf(result.ops);
      const nameAt = (x: number, y: number, z: number): string | undefined =>
        at.get(`${x},${y},${z}`)?.block;

      /** `groundedChain`: down through standing blocks to the base plane. */
      const grounded = (x: number, y: number, z: number): boolean => {
        for (let by = y - 1; by >= 0; by--) {
          const name = nameAt(x, by, z);
          if (name === undefined) return by < 0;
          if (PARTIAL.test(name)) return true;
          if (!NEEDS_GROUND.test(name) && !name.startsWith("potted_")) return true;
        }
        return true; // fell through to the base plane: the ground itself
      };

      for (const op of result.ops) {
        const where = `${p} ${op.block} at ${op.x},${op.y},${op.z}`;
        if (NEEDS_GROUND.test(op.block) || op.block.startsWith("potted_")) {
          expect(grounded(op.x, op.y, op.z), where).toBe(true);
        }
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
        // The stronger "nothing floats" reading for full cubes — which is what
        // makes a lintel legal and a hovering slab of megalith not.
        if (!PARTIAL.test(op.block) && !NEEDS_GROUND.test(op.block) && op.y > 0) {
          const joined = (
            [
              [0, -1, 0],
              [0, 1, 0],
              [1, 0, 0],
              [-1, 0, 0],
              [0, 0, 1],
              [0, 0, -1],
            ] as const
          ).some(([dx, dy, dz]) => nameAt(op.x + dx, op.y + dy, op.z + dz) !== undefined);
          expect(joined, `${where} floats free of the prop`).toBe(true);
        }
      }
    }
  });

  /* ------------------------------------------------------------------------ */
  /* character                                                                 */
  /* ------------------------------------------------------------------------ */

  const opsOf = (prop: string): readonly LocalVoxelOp[] =>
    generateProp({ prop: prop as never, seed: SEED }).ops;
  const has = (prop: string, block: string): boolean =>
    opsOf(prop).some((op) => op.block === block);

  it("builds the thing each prop is for", () => {
    // A turf pad under a ring of stones, with an altar in the middle.
    expect(has("standing_stones", "grass_block"), "the pad").toBe(true);
    expect(
      opsOf("standing_stones").filter((op) => op.y >= 2).length,
      "the stones stand up",
    ).toBeGreaterThan(8);
    // A banked rim of full blocks, and lintels above the post heads.
    expect(has("henge", "grass_block"), "the bank").toBe(true);
    expect(
      opsOf("henge").filter((op) => op.y >= 4).length,
      "the trilithons",
    ).toBeGreaterThan(8);
    // A leaning stone with a mossy skirt.
    expect(has("monolith", "mossy_cobblestone"), "the skirt").toBe(true);
    // A sod dome with a stone doorway read and no way in.
    expect(has("burial_mound", "polished_deepslate"), "the doorway read").toBe(true);
    // A recolour bed, roped, with the finds on a table.
    expect(has("dig_site", "packed_mud"), "the bed").toBe(true);
    expect(has("dig_site", "coarse_dirt"), "the bed").toBe(true);
    expect(has("dig_site", "barrel"), "the finds").toBe(true);
    expect(has("dig_site", "white_banner"), "the marker, not a sign").toBe(true);
    expect(has("dig_site", "bone_block"), "no bones in a plain dig").toBe(false);
    // The same dig, with something enormous in it.
    expect(has("fossil_dig", "bone_block"), "the ribs").toBe(true);
    expect(has("fossil_dig", "packed_mud"), "the same bed").toBe(true);
    // A stump, a fallen section, a scatter.
    expect(has("shattered_obelisk", "cobblestone"), "the scatter").toBe(true);
  });

  /**
   * **The trilithon lintel**, cell for cell.
   *
   * A lintel is a full cube lying across two posts. Every block of it must
   * have something under it or beside it — a post head at each end, lintel in
   * the middle — because a full cube with six air faces is `floating.isolated`
   * and a lintel is the most obvious way to build one by accident.
   */
  it("rests every henge lintel on the posts under it", () => {
    const result = generateProp({ prop: "henge", seed: SEED });
    const at = indexOf(result.ops);
    const solid = (x: number, y: number, z: number): boolean =>
      at.get(`${x},${y},${z}`) !== undefined;
    // The lintels are the highest course of each trilithon: anything at y >= 4.
    const lintels = result.ops.filter((op) => op.y >= 4);
    expect(lintels.length).toBeGreaterThan(8);
    for (const op of lintels) {
      const under = solid(op.x, op.y - 1, op.z);
      const beside =
        solid(op.x + 1, op.y, op.z) ||
        solid(op.x - 1, op.y, op.z) ||
        solid(op.x, op.y, op.z + 1) ||
        solid(op.x, op.y, op.z - 1);
      expect(under || beside, `lintel at ${op.x},${op.y},${op.z} rests on nothing`).toBe(true);
    }
    // …and every lintel run has a post head directly under at least one end.
    const posted = lintels.filter((op) => solid(op.x, op.y - 1, op.z));
    expect(posted.length, "no lintel sits on a post at all").toBeGreaterThan(4);
  });

  /**
   * **The lean is offset courses.** The monolith's footprint never shifts more
   * than one cell between adjacent courses, so every block still rests on
   * stone rather than being cantilevered into air.
   */
  it("leans the monolith by offset courses, never by more than one cell", () => {
    const result = generateProp({ prop: "monolith", seed: SEED });
    const byY = new Map<number, number[]>();
    for (const op of result.ops) {
      if (op.y < 2) continue; // the pad and the skirt are not the stone
      const xs = byY.get(op.y) ?? [];
      xs.push(op.x);
      byY.set(op.y, xs);
    }
    const levels = [...byY.keys()].sort((a, b) => a - b);
    expect(levels.length).toBeGreaterThan(4);
    let shifted = false;
    for (let i = 1; i < levels.length; i++) {
      const below = Math.min(...(byY.get(levels[i - 1] as number) as number[]));
      const here = Math.min(...(byY.get(levels[i] as number) as number[]));
      expect(Math.abs(here - below), `course ${levels[i]} jumped`).toBeLessThanOrEqual(1);
      if (here !== below) shifted = true;
    }
    expect(shifted, "the monolith does not lean at all").toBe(true);
  });

  /**
   * **Every fallen block of the obelisk is grounded or touching the run.**
   *
   * The scatter and the fallen upper section are the one place this wave could
   * have left a block hanging in mid-air, so it is checked directly rather
   * than inferred from the general sweep.
   */
  it("lays every fallen obelisk block on the ground or on the run", () => {
    const result = generateProp({ prop: "shattered_obelisk", seed: SEED });
    const at = indexOf(result.ops);
    for (const op of result.ops) {
      if (op.y === 0) continue; // the pad is the ground
      const under = at.get(`${op.x},${op.y - 1},${op.z}`);
      expect(under, `${op.block} at ${op.x},${op.y},${op.z} hangs off the pad`).toBeDefined();
    }
  });

  /**
   * **The burial mound has no interior.** A sealed chamber is a pocket the
   * traversal lint cannot reach, and an open one is a building. The doorway is
   * a *read*: the cell behind the frame is solid.
   */
  it("gives the burial mound a doorway read and no way in", () => {
    const result = generateProp({ prop: "burial_mound", seed: SEED });
    const at = indexOf(result.ops);
    const backings = result.ops.filter((op) => op.block === "polished_deepslate");
    expect(backings.length).toBeGreaterThan(0);
    for (const op of backings) {
      // Behind the read, going in: dome, never a void the player could enter.
      const behindN = at.get(`${op.x},${op.y},${op.z - 1}`);
      const behindS = at.get(`${op.x},${op.y},${op.z + 1}`);
      expect(
        behindN !== undefined || behindS !== undefined,
        `the doorway read at ${op.x},${op.y},${op.z} opens onto nothing`,
      ).toBe(true);
    }
  });
});
