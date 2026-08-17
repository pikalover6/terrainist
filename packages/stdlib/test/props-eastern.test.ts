/**
 * The **East Asian pack's props** — the four entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.9 that are things you walk past, under or
 * along, held to the prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain` — and then the properties this pack was
 * written against, each of which is a rule the physics lint would otherwise
 * find downstream:
 *
 * - **the gate is a gate.** The torii's opening is paved at `y = 0` and empty
 *   at `y = 1` and `y = 2` across its whole width, which is the walkability
 *   definition applied to a thing whose entire purpose is being walked
 *   through. This is the one check in this file that would fail a torii that
 *   *looked* perfect;
 * - **support closure**: nothing floats, which is why the lintel's turn-up is
 *   two cells in one column and the boat's head is a stepped stack;
 * - **the lantern rule, inverted.** `stone_lantern` is the name of a *prop*;
 *   this pack writes **no block whose name ends `lantern`** anywhere, so the
 *   support-chain rule keyed on that suffix has nothing to fire on and the
 *   fire box is a `glowstone` cube boxed in worked stone;
 * - **the hull displaces.** Every cell of the dragon boat's beam is solid at
 *   `y = 0` and `y = -1`, so no water pocket can form inside it;
 * - **gravity blocks stay in the floor plane** — the dry garden's gravel is
 *   the pack's only one, and it is at `y = 0`.
 */

import { describe, expect, it } from "vitest";

import {
  DRAGON_BOAT_B,
  DRAGON_BOAT_L,
  EASTERN_PROP_NAMES,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  STONE_LANTERN_SPAN,
  TORII_D,
  TORII_LINTEL_Y,
  TORII_TIE_Y,
  TORII_W,
  ZEN_GARDEN_SPAN,
  easternPropFootprint,
  generateProp,
  isEasternProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xea57_00den, "world.eastern.props");
const OTHER = nodeSeed(0xea57_00den, "world.eastern.props.other");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

function opsOf(prop: string): LocalVoxelOp[] {
  return generateProp({ prop, seed: SEED, params: {} }).ops;
}

/**
 * Blocks the `floating.*` rule has nothing to say about — it polices a **full
 * cube** with six air faces, and none of these is one.
 */
const NOT_A_FULL_CUBE =
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|lantern|_pot$|cauldron|iron_bars|torch|lightning_rod|daylight_detector|^water$)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the East Asian pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of EASTERN_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isEasternProp(p)).toBe(true);
    }
    expect(isEasternProp("moon_dial")).toBe(false);
    expect(isEasternProp("moon_gate")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
    expect(EASTERN_PROP_NAMES).toHaveLength(4);
  });

  it("is claimed by the catalog as implemented, and as a PROP", () => {
    for (const p of EASTERN_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("east_asian");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
  });

  /**
   * The pack's remaining unbuilt entries are nobody's yet, and must stay that
   * way: a status flipped without a generator is exactly what
   * `catalog.test.ts` exists to catch.
   *
   * `paifang` and `spirit_wall` were re-kinded to `prop` on 2026-08-14
   * (docs/INFRA-ENTRIES-v0.md family E: a declared box and a yaw, not a route).
   * The kind says who will host them; the status still says nobody has.
   *
   * `castle_base_wall` left this list on 2026-08-17: it is family B's ōgi
   * revetment and landed as an `infra.entry@0` row that declares a face at
   * `retaining.seam`, which is checked below rather than here.
   */
  it("leaves the pack's unbuilt entries alone", () => {
    for (const [id, kind] of [
      ["moon_gate", "infrastructure"],
      ["paifang", "prop"],
      ["spirit_wall", "prop"],
    ] as const) {
      expect(structureById(id)?.status, id).toBe("not_started");
      expect(structureById(id)?.kind, id).toBe(kind);
      expect(PROP_NAMES as readonly string[], id).not.toContain(id);
    }
  });

  it("hosts the pack's battered keep base as a family-B entry, not as a prop", () => {
    // The catalog guard joins implemented `infrastructure` rows to
    // `INFRA_ENTRY_IDS` in both directions; this is the pack's own half of it.
    const row = structureById("castle_base_wall");
    expect(row?.status).toBe("implemented");
    expect(row?.kind).toBe("infrastructure");
    expect(PROP_NAMES as readonly string[]).not.toContain("castle_base_wall");
  });

  it("does not collide with the houses the pack complements", () => {
    for (const id of ["hanok", "machiya", "pagoda", "tea_house"]) {
      expect(structureById(id)?.status, id).toBe("implemented");
      expect(EASTERN_PROP_NAMES as readonly string[], id).not.toContain(id);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of EASTERN_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(easternPropFootprint(p));
      const result = generateProp({ prop: p, seed: SEED, params: {} });
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

  it("survives every quarter turn with its box intact", () => {
    for (const p of EASTERN_PROP_NAMES) {
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
    for (const p of EASTERN_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(easternPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, lights no fire and uses no `chain`", () => {
    for (const p of EASTERN_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block, `${p} fire`).not.toBe("campfire");
        expect(op.block, `${p} empty pot`).not.toBe("flower_pot");
      }
    }
  });

  /**
   * THE LANTERN RULE, as this pack meets it: by writing no such block at all.
   * `stone_lantern` is a prop name; the support chain keys on **block** names.
   */
  it("writes no block whose name ends `lantern`", () => {
    for (const p of EASTERN_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("lantern"), `${p}: ${op.block}`).toBe(false);
      }
    }
    // And the stone lantern is lit all the same.
    expect(opsOf("stone_lantern").some((op) => op.block === "glowstone")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* support, fluid and gravity                                                  */
/* -------------------------------------------------------------------------- */

describe("the East Asian props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of EASTERN_PROP_NAMES) {
      const declared = propFootprint(p, {});
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

  /** THE GRAVITY RULE: a falling block anywhere but the floor plane falls. */
  it("keeps every gravity block in the floor plane", () => {
    for (const p of EASTERN_PROP_NAMES) {
      for (const op of opsOf(p)) {
        if (!/(^gravel$|sand$|_powder$)/.test(op.block)) continue;
        expect(op.y, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(0);
      }
    }
  });

  /** THE FLUID RULE: a hull displaces rather than trapping a pocket. */
  it("fills the dragon boat's whole beam solid at the waterline and under it", () => {
    const at = indexOf(opsOf("dragon_boat"));
    let stations = 0;
    for (let x = 0; x < DRAGON_BOAT_L; x++) {
      for (let z = 0; z < DRAGON_BOAT_B; z++) {
        const deck = at.get(`${x},0,${z}`);
        if (deck === undefined) continue;
        stations += 1;
        expect(deck.block, `deck at ${x},${z}`).not.toBe("water");
        expect(deck.block, `deck at ${x},${z}`).not.toBe("air");
        const hull = at.get(`${x},-1,${z}`);
        expect(hull?.block, `hull under ${x},${z}`).toBeDefined();
        expect(hull?.block, `hull under ${x},${z}`).not.toBe("water");
      }
    }
    expect(stations, "the boat is a boat").toBeGreaterThan(DRAGON_BOAT_L);
    // And it writes no water of its own.
    expect(opsOf("dragon_boat").some((op) => op.block === "water")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* the forms                                                                   */
/* -------------------------------------------------------------------------- */

describe("the East Asian props' forms", () => {
  /**
   * **The check this file exists for.** A torii whose opening is not walkable
   * is a wall with a decoration on it: the whole width needs a solid non-water
   * floor at `y = 0` and air at `y = 1` and `y = 2` everywhere the posts are
   * not.
   */
  it("makes the torii a thing you can actually walk through", () => {
    const ops = opsOf("torii");
    const at = indexOf(ops);
    for (let x = 0; x < TORII_W; x++) {
      for (let z = 0; z < TORII_D; z++) {
        const floor = at.get(`${x},0,${z}`);
        expect(floor?.block, `floor at ${x},${z}`).toBeDefined();
        expect(floor?.block, `floor at ${x},${z}`).not.toBe("water");
        expect(floor?.block, `floor at ${x},${z}`).not.toBe("air");
      }
    }
    // The opening between and beside the posts, both body courses.
    for (let x = 0; x < TORII_W; x++) {
      for (const y of [1, 2]) {
        const cell = at.get(`${x},${y},1`);
        const isPost = cell !== undefined;
        expect(isPost && x !== 1 && x !== 5, `blocked at ${x},${y}`).toBe(false);
      }
    }
    // The tie is under the lintel, and both are clear of a walking body.
    expect(TORII_TIE_Y).toBeGreaterThan(2);
    expect(TORII_LINTEL_Y).toBe(TORII_TIE_Y + 1);
  });

  it("gives the torii a curve: the lintel turns up at both ends", () => {
    const at = indexOf(opsOf("torii"));
    for (const x of [0, TORII_W - 1]) {
      expect(at.get(`${x},${TORII_LINTEL_Y},1`)?.block, `lintel at ${x}`).toBeDefined();
      expect(at.get(`${x},${TORII_LINTEL_Y + 1},1`)?.block, `turn-up at ${x}`).toBeDefined();
    }
    // And the middle of the lintel is one course lower than the ends.
    const mid = (TORII_W - 1) / 2;
    expect(at.get(`${mid},${TORII_LINTEL_Y + 1},1`), "the middle does not rise").toBeUndefined();
  });

  it("runs the torii's posts as full columns to the ground", () => {
    const at = indexOf(opsOf("torii"));
    for (const px of [1, 5]) {
      for (let y = 0; y < TORII_TIE_Y; y++) {
        expect(at.get(`${px},${y},1`)?.block, `post ${px} at ${y}`).toBeDefined();
      }
    }
  });

  it("keeps the dry garden's bed flat and its walls on three sides only", () => {
    const ops = opsOf("zen_garden");
    const at = indexOf(ops);
    const last = ZEN_GARDEN_SPAN - 1;
    // The bed: a floor everywhere, and nothing standing in the middle of it
    // above the boulders' own two courses.
    for (let z = 1; z < last; z++) {
      expect(at.get(`1,0,${z}`)?.block, `bed at 1,${z}`).toBeDefined();
    }
    // The fourth side is open: no plastered wall on the veranda's own line.
    expect(at.get(`${last},2,${Math.floor(last / 2)}`), "the fourth side is open").toBeUndefined();
    // And the other three carry one.
    for (const [x, z] of [
      [0, 5],
      [5, 0],
      [5, last],
    ] as const) {
      expect(at.get(`${x},2,${z}`)?.block, `wall at ${x},${z}`).toBeDefined();
    }
    expect(ops.some((op) => op.block === "moss_block"), "moss at the stones").toBe(true);
    expect(ops.some((op) => op.block === "gravel"), "the bed is gravel").toBe(true);
  });

  it("builds the stone lantern as a pedestal, a fire box and a cap", () => {
    const at = indexOf(opsOf("stone_lantern"));
    const c = (STONE_LANTERN_SPAN - 1) / 2;
    expect(at.get(`${c},0,${c}`)?.block, "the pedestal").toBeDefined();
    expect(at.get(`${c},2,${c}`)?.block, "the fire").toBe("glowstone");
    expect(at.get(`${c},3,${c}`)?.block, "the capstone").toBeDefined();
    // The cut faces are walls, not full cubes: nothing to support, nothing to
    // float, and the light reads through them.
    expect(at.get(`${c + 1},2,${c}`)?.block, "a cut face").toBe("stone_brick_wall");
  });

  it("keeps the dragon boat long and narrow, with a head and a tail", () => {
    const ops = opsOf("dragon_boat");
    const at = indexOf(ops);
    const cz = (DRAGON_BOAT_B - 1) / 2;
    expect(DRAGON_BOAT_L / DRAGON_BOAT_B, "long and narrow").toBeGreaterThan(4);
    // The head rises off the stem and the tail off the stern, and neither is
    // as tall as the other.
    expect(at.get(`0,3,${cz}`)?.block, "the head").toBeDefined();
    expect(at.get(`${DRAGON_BOAT_L - 1},2,${cz}`)?.block, "the tail").toBeDefined();
    expect(at.get(`0,4,${cz}`)?.block, "the eye").toBe("glowstone");
    // The oars: trapdoors down both topsides.
    expect(ops.some((op) => op.block.endsWith("_trapdoor")), "oars").toBe(true);
  });
});
