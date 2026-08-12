/**
 * The **classical Mediterranean pack's props** — the eight entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.1 you walk past rather than into, held to
 * the prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain` — and then the properties this half of the
 * pack was written against, each of which is a rule the physics lint would
 * otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every block rests on the base plane,
 *   on another of the prop's own blocks, or is a lintel whose neighbours carry
 *   it. The colonnade's entablature is the case that matters — a bay of it is
 *   a lintel over air — so the check is the `floating.isolated` rule itself,
 *   run over the finished op set rather than over a list of shapes that once
 *   went wrong;
 * - **the arch is corbelled, not rung**: the vault's opening narrows by
 *   exactly one cell per course, so each overhanging block has the block
 *   beside it, and the carriageway underneath stays clear from end to end;
 * - **the colonnade's declared box is its built run**: the `length` param is
 *   clamped in exactly one place, so a document that asks for three bays or
 *   for three hundred gets a box that matches what is inside it;
 * - **the trireme displaces water**: solid at `y = 0` and `y = -1`, never air
 *   and never water, which is `ships.ts`'s rule and the only thing between a
 *   fleet and a flooded world;
 * - **`cauldron` carries no properties.** The vessel with a `level` is
 *   `water_cauldron`; a bare `cauldron` with `level` on it is a state that
 *   does not exist in the pinned table.
 */

import { describe, expect, it } from "vitest";

import {
  CLASSICAL_B_PROP_NAMES,
  COLONNADE_MAX,
  COLONNADE_MIN,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  classicalBPropFootprint,
  generateProp,
  isClassicalBProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xc1a5n, "world.classical.props");
const OTHER = nodeSeed(0xc1a5n, "world.classical.props.other");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

function opsOf(prop: string, params: Record<string, unknown> = {}): LocalVoxelOp[] {
  return generateProp({ prop, seed: SEED, params }).ops;
}

/**
 * Blocks the `floating.*` rule has nothing to say about.
 *
 * The rule polices a **full cube** with six air faces; a slab, a stair, a
 * wall, a fence, a trapdoor, a pot or a lantern is not one. Listed here rather
 * than inferred, so the support check below is about the blocks it is actually
 * about.
 */
const NOT_A_FULL_CUBE =
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|lantern|_pot$|cauldron|composter|iron_bars|torch)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the classical pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of CLASSICAL_B_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isClassicalBProp(p)).toBe(true);
    }
    expect(isClassicalBProp("cairn")).toBe(false);
    expect(isClassicalBProp("monolith")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  /**
   * Three of these rows carry a **`kind` override**, and it is the honest
   * answer rather than a convenience: the catalog proposed the colonnade and
   * the arch as `infrastructure`, and what was built is a placed object with a
   * declared box, which is what a prop is. The override keeps the exception
   * visible where it was made.
   */
  it("is claimed by the catalog as implemented, and as a PROP", () => {
    for (const p of CLASSICAL_B_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("classical_mediterranean");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of CLASSICAL_B_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(classicalBPropFootprint(p));
      const result = generateProp({ prop: p, seed: SEED });
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
    for (const p of CLASSICAL_B_PROP_NAMES) {
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
    for (const p of CLASSICAL_B_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(classicalBPropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, uses no `chain`, and puts no properties on a cauldron", () => {
    for (const p of CLASSICAL_B_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        if (op.block === "cauldron") expect(op.props, `${p} cauldron`).toBeUndefined();
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* support                                                                     */
/* -------------------------------------------------------------------------- */

describe("the classical props' support closure", () => {
  /**
   * The `floating.isolated` rule, run as the rule rather than as a list of the
   * shapes that once broke it. Below the base plane is the ground the placer
   * puts the prop on, so a block at the base plane is supported by definition;
   * everything above it has to earn a neighbour.
   */
  it("leaves no full block with six air faces", () => {
    for (const p of CLASSICAL_B_PROP_NAMES) {
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

  /** Fences, walls and lanterns are on the support chain: each one needs a floor. */
  it("stands every wall, fence and standing lantern on something", () => {
    for (const p of CLASSICAL_B_PROP_NAMES) {
      const declared = propFootprint(p, {});
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/(_wall$|fence|^lantern$)/.test(op.block)) continue;
        if (op.props?.["hanging"] === "true") continue;
        if (op.y === declared.minY) continue;
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

describe("what each classical prop is for", () => {
  /**
   * The colonnade's declared box is the run it builds, at both clamps.
   *
   * A length param has exactly one bug available to it, and this is the check
   * for it: the footprint and the generator must read the param through the
   * same clamp, or the placer reserves the wrong hole.
   */
  it("builds the colonnade the length it declares, and clamps in one place", () => {
    for (const length of [3, COLONNADE_MIN, 12, COLONNADE_MAX, 200]) {
      const params = { length };
      const declared = propFootprint("agora_colonnade", params);
      const result = generateProp({ prop: "agora_colonnade", seed: SEED, params });
      expect(result.meta.size, `length=${length}`).toEqual(declared.size);
      const run = declared.size[0];
      expect(run, `length=${length}`).toBeGreaterThanOrEqual(COLONNADE_MIN);
      expect(run, `length=${length}`).toBeLessThanOrEqual(COLONNADE_MAX);
      const xs = new Set(result.ops.map((op) => op.x));
      expect(xs.has(0), `length=${length} starts at 0`).toBe(true);
      expect(xs.has(run - 1), `length=${length} reaches its end`).toBe(true);
    }
  });

  it("gives the colonnade a column rhythm under a continuous entablature", () => {
    const ops = opsOf("agora_colonnade", { length: 15 });
    const at = indexOf(ops);
    // The entablature: one unbroken course over the column row.
    for (let x = 0; x < 15; x++) {
      expect(at.get(`${x},5,1`)?.block, `entablature at ${x}`).toBeDefined();
    }
    // The columns: every other bay, and nothing in between.
    for (let x = 0; x < 15; x++) {
      const shaft = at.get(`${x},3,1`);
      if (x % 2 === 0) expect(shaft?.block, `column at ${x}`).toBeDefined();
      else expect(shaft, `bay at ${x}`).toBeUndefined();
    }
  });

  it("leaves the arch's carriageway open from end to end", () => {
    const ops = opsOf("triumphal_arch");
    const at = indexOf(ops);
    // The passage runs along z through the middle of the span, and a rider has
    // to fit: two clear courses over the paving, at every station.
    for (let z = 0; z < 5; z++) {
      expect(at.get(`5,0,${z}`)?.block, `paving at z=${z}`).toBeDefined();
      for (let y = 1; y <= 6; y++) {
        expect(at.get(`5,${y},${z}`), `the passage at 5,${y},${z}`).toBeUndefined();
      }
    }
    // And the vault closes over it: the crown course is solid all the way.
    for (let x = 0; x < 11; x++) {
      expect(at.get(`${x},10,2`)?.block, `crown at ${x}`).toBeDefined();
    }
  });

  it("faces the rostra with beaks and rails it, leaving the front open", () => {
    const ops = opsOf("rostra");
    const at = indexOf(ops);
    expect(ops.some((op) => op.block === "copper_block"), "the ships' beaks").toBe(true);
    // The rail is on the back and the flanks; the face to the crowd is clear.
    expect(at.get(`0,3,0`)?.block, "the flank rail").toBeDefined();
    for (let x = 1; x < 8; x++) {
      expect(at.get(`${x},3,0`), `the front rail at ${x}`).toBeUndefined();
    }
  });

  it("puts a head on the herm and a tripod on the votive column", () => {
    expect(indexOf(opsOf("herm_post")).get("1,3,1")?.block, "the herm's head").toBe(
      "chiseled_stone_bricks",
    );
    const votive = indexOf(opsOf("votive_column"));
    expect(votive.get("1,9,1")?.block, "the capital").toBe("chiseled_stone_bricks");
    expect(votive.get("1,10,1")?.block, "the tripod").toBe("cauldron");
  });

  it("lays the fallen drums in a line, with the capital at the end of it", () => {
    const ops = opsOf("column_drums");
    const at = indexOf(ops);
    // The run: every station of the shaft's line carries a drum.
    for (let x = 1; x <= 8; x++) {
      expect(at.get(`${x},1,2`)?.block, `drum at ${x}`).toBeDefined();
    }
    expect(at.get("9,1,2")?.block, "the capital").toBe("chiseled_stone_bricks");
    // And it lies in grass rather than on a plinth: this is a ruin.
    expect(ops.some((op) => op.block === "grass_block"), "the turf").toBe(true);
  });

  /**
   * The trireme displaces water rather than trapping a pocket under itself.
   *
   * `ships.ts`'s rule, restated as a test: every station of the hull is solid
   * at the waterline and one course under it, and no cell of the prop is air
   * or water. `y = -1` is the deepest course any hull may write, because the
   * placer only guarantees two blocks of water.
   */
  it("floats the trireme the way every other hull floats", () => {
    const result = generateProp({ prop: "trireme", seed: SEED });
    const at = indexOf(result.ops);
    for (const op of result.ops) {
      expect(op.block, "a hull writes no air").not.toBe("air");
      expect(op.block, "a hull writes no water").not.toBe("water");
      expect(op.y, "nothing is deeper than one course").toBeGreaterThanOrEqual(-1);
    }
    for (let x = 0; x < 23; x++) {
      expect(at.get(`${x},0,2`)?.block, `the centreline at ${x}`).toBeDefined();
      expect(at.get(`${x},-1,2`)?.block, `the submerged course at ${x}`).toBeDefined();
    }
    // The four things that make it a trireme rather than a boat.
    expect(result.ops.some((op) => op.block === "copper_block"), "the ram").toBe(true);
    expect(result.ops.some((op) => op.block === "white_wool"), "the eye").toBe(true);
    expect(result.ops.some((op) => op.block === "black_wool"), "the pupil").toBe(true);
    expect(
      result.ops.filter((op) => op.block.endsWith("_trapdoor")).length,
      "the oar banks",
    ).toBeGreaterThan(5);
  });

  it("sinks the pithoi to the shoulder in a paved yard", () => {
    const ops = opsOf("pithos_store");
    const at = indexOf(ops);
    const jars = ops.filter((op) => op.block === "decorated_pot");
    expect(jars.length, "the jars").toBeGreaterThan(3);
    for (const jar of jars) {
      expect(jar.y, "a jar stands in the pavement").toBe(1);
      expect(at.get(`${jar.x},0,${jar.z}`)?.block, "the clay collar").toBe("terracotta");
    }
    // The yard is paved end to end, so a jar is never standing on the dirt.
    for (let z = 0; z < 9; z++) {
      for (let x = 0; x < 9; x++) expect(at.get(`${x},0,${z}`), `paving at ${x},${z}`).toBeDefined();
    }
  });
});
