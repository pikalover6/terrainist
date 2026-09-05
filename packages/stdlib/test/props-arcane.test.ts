/**
 * The **arcane & magical pack's props** — the nine entries of
 * that are things you walk past rather
 * than into, held to the prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain` — and then the properties this pack was
 * written against, each of which is a rule the physics lint would otherwise
 * find downstream:
 *
 * - **support closure.** Nothing floats: every block rests in the ground
 *   plane, on a column chain run down to it, or on an orthogonal neighbour of
 *   its own. The orrery's rings and the dragon's ribs are the two cases that
 *   matter, and they are the reason `quarterArc` exists — the naive ring test
 *   steps diagonally at the axes, and a diagonal step is a floating block
 *   wearing a circle's clothes. This file proves the arc itself as well as the
 *   props built from it;
 * - **the lantern rule.** Every `lantern` this pack writes hangs with a **full
 *   cube directly above it**, which is what the lint's support-chain rule
 *   keyed on `endsWith("lantern")` asks for;
 * - **the water is boxed.** The scrying pool's every water cell has one of
 *   this prop's own blocks on all four flanks and underneath, which is
 *   `checkPropFluidSafety`'s test run at the op-list level;
 * - **the circle is flat.** The rune circle writes exactly one course, because
 *   its whole reason to exist is being the counterpart to `standing_stones`;
 * - **the wyrm is a silhouette**: ribs over a spine, the spine in the ground
 *   plane, and a skull that is off the axis.
 */

import { describe, expect, it } from "vitest";

import {
  ARCANE_PROP_NAMES,
  DRAGON_D,
  DRAGON_L,
  LANTERN_MAX,
  LANTERN_MIN,
  PROP_NAMES,
  RUNE_SPAN,
  STRUCTURE_CATALOG,
  arcanePropFootprint,
  generateProp,
  isArcaneProp,
  nodeSeed,
  propFootprint,
  quarterArc,
  ringOffsets,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xa2ca_11en, "world.arcane.props");
const OTHER = nodeSeed(0xa2ca_11en, "world.arcane.props.other");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

function opsOf(prop: string, params: Record<string, unknown> = {}): LocalVoxelOp[] {
  return generateProp({ prop, seed: SEED, params }).ops;
}

/**
 * Blocks the `floating.*` rule has nothing to say about — it polices a **full
 * cube** with six air faces, and none of these is one.
 */
const NOT_A_FULL_CUBE =
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|lantern|_pot$|cauldron|iron_bars|torch|lightning_rod|daylight_detector|^water$)/;

/** The param cases this file walks — the lantern row is the only one with any. */
const CASES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  spirit_lantern_row: [{}, { length: LANTERN_MIN }, { length: 9 }, { length: LANTERN_MAX }],
};

/** Every case for a prop: its own, or the single empty one. */
function casesFor(prop: string): readonly Record<string, unknown>[] {
  return CASES[prop] ?? [{}];
}

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the arcane pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of ARCANE_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isArcaneProp(p)).toBe(true);
    }
    expect(isArcaneProp("herm_post")).toBe(false);
    expect(isArcaneProp("warded_gate")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
    expect(ARCANE_PROP_NAMES).toHaveLength(9);
  });

  it("is claimed by the catalog as implemented, and as a PROP", () => {
    for (const p of ARCANE_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("arcane");
      expect(entry?.category, p).toBe("fantasy");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
  });

  /**
   * The pack's two unbuilt entries are nobody's yet, and must stay that way: a
   * status flipped without a generator is exactly what `catalog.test.ts`
   * exists to catch.
   *
   * `warded_gate` was re-kinded to `prop` on 2026-08-14
 * : `triumphal_arch` with different
   * mouldings). The kind says who will host it; the status still says nobody
   * has, which is what this test is really for.
   */
  it("leaves the pack's unbuilt entries alone", () => {
    for (const [id, kind] of [
      ["floating_stair", "infrastructure"],
      ["warded_gate", "prop"],
    ] as const) {
      expect(structureById(id)?.status, id).toBe("not_started");
      expect(structureById(id)?.kind, id).toBe(kind);
      expect(PROP_NAMES as readonly string[], id).not.toContain(id);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of ARCANE_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const declared = propFootprint(p, params);
        expect(declared, p).toEqual(arcanePropFootprint(p, params));
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

  it("survives every quarter turn with its box intact", () => {
    for (const p of ARCANE_PROP_NAMES) {
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
    for (const p of ARCANE_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(arcanePropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, lights no fire and uses no `chain`", () => {
    for (const p of ARCANE_PROP_NAMES) {
      for (const params of casesFor(p)) {
        for (const op of opsOf(p, params)) {
          expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
          expect(op.block, `${p} chain`).not.toBe("chain");
          expect(op.block, `${p} fire`).not.toBe("campfire");
          expect(op.block, `${p} empty pot`).not.toBe("flower_pot");
        }
      }
    }
  });

  /** The pack's colour claim, checked rather than asserted in a doc comment. */
  it("says white, gold and amethyst, in every prop that can", () => {
    const magical = /(quartz|calcite|amethyst|gold_block|glowstone|bone_block|cherry)/;
    for (const p of ARCANE_PROP_NAMES) {
      expect(opsOf(p).some((op) => magical.test(op.block)), p).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the geometry the pack rests on                                              */
/* -------------------------------------------------------------------------- */

describe("the connected arc", () => {
  it("walks from the top of a quarter to its side without a diagonal step", () => {
    for (let r = 1; r <= 12; r++) {
      const arc = quarterArc(r);
      expect(arc[0], `r=${r} starts at the top`).toEqual([0, r]);
      expect(arc[arc.length - 1], `r=${r} ends at the side`).toEqual([r, 0]);
      for (let i = 1; i < arc.length; i++) {
        const a = arc[i - 1] as readonly [number, number];
        const b = arc[i] as readonly [number, number];
        const step = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        expect(step, `r=${r} step ${i}`).toBe(1);
      }
    }
  });

  it("closes a ring in which every cell touches another, orthogonally", () => {
    for (let r = 2; r <= 10; r++) {
      const ring = ringOffsets(r);
      const set = new Set(ring.map(([a, b]) => `${a},${b}`));
      expect(set.size, `r=${r} has no duplicates`).toBe(ring.length);
      for (const [a, b] of ring) {
        const touching = [
          [a + 1, b],
          [a - 1, b],
          [a, b + 1],
          [a, b - 1],
        ].filter(([x, z]) => set.has(`${x},${z}`));
        // Two, not one: a closed loop, so nothing is a dead end either.
        expect(touching.length, `r=${r} at ${a},${b}`).toBeGreaterThanOrEqual(2);
      }
      // And it is a ring rather than a disc: the centre is not in it.
      expect(set.has("0,0"), `r=${r} is hollow`).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* support                                                                     */
/* -------------------------------------------------------------------------- */

describe("the arcane props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of ARCANE_PROP_NAMES) {
      for (const params of casesFor(p)) {
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

  /** THE LANTERN RULE: hanging wants a full cube directly above it. */
  it("hangs every lantern under something that can hold it", () => {
    for (const p of ARCANE_PROP_NAMES) {
      for (const params of casesFor(p)) {
        const at = indexOf(opsOf(p, params));
        for (const op of opsOf(p, params)) {
          if (!op.block.endsWith("lantern")) continue;
          const hanging = op.props?.["hanging"] === "true";
          const anchor = at.get(`${op.x},${op.y + (hanging ? 1 : -1)},${op.z}`)?.block;
          expect(anchor, `${p}: lantern at ${op.x},${op.y},${op.z}`).toBeDefined();
          expect(
            /(_slab|_stairs|_fence|_wall|_pane|_bars|_door|_trapdoor|torch|lantern|chain)$/.test(
              anchor as string,
            ),
            `${p}: lantern anchored to ${anchor}`,
          ).toBe(false);
        }
      }
    }
  });

  /** THE FLUID RULE: `checkPropFluidSafety`, at the op-list level. */
  it("boxes every water block it writes", () => {
    for (const p of ARCANE_PROP_NAMES) {
      const declared = propFootprint(p, {});
      const ops = opsOf(p);
      const at = indexOf(ops);
      const filled = (x: number, y: number, z: number): boolean =>
        y < declared.minY || at.get(`${x},${y},${z}`) !== undefined;
      for (const op of ops) {
        if (op.block !== "water") continue;
        for (const [dx, dy, dz] of [
          [0, -1, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as const) {
          expect(
            filled(op.x + dx, op.y + dy, op.z + dz),
            `${p}: water at ${op.x},${op.y},${op.z} leaks ${dx},${dy},${dz}`,
          ).toBe(true);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the forms                                                                   */
/* -------------------------------------------------------------------------- */

describe("the arcane props' forms", () => {
  /** The counterpart to `standing_stones` is the one that has no stones up. */
  it("keeps the rune circle entirely in the floor plane, and lights it", () => {
    const ops = opsOf("rune_circle");
    for (const op of ops) expect(op.y, "the circle is flat").toBe(0);
    expect(ops.some((op) => op.block === "glowstone"), "the circle glows").toBe(true);
    // A ring, not a disc: the rim is drawn at the edge of the declared box.
    const c = (RUNE_SPAN - 1) / 2;
    const at = indexOf(ops);
    expect(at.get(`0,0,${c}`)?.block, "the rim reaches the box").toBeDefined();
  });

  it("stands the ley marker knee-high with the glow in it", () => {
    const at = indexOf(opsOf("ley_marker"));
    expect(at.get("1,1,1")?.block).toBe("glowstone");
    expect(at.get("1,2,1")?.block).toBe("chiseled_quartz_block");
    expect(at.get("1,3,1"), "and no higher").toBeUndefined();
  });

  it("leans every crystal spire, and never stands one plumb", () => {
    const ops = opsOf("crystal_outcrop");
    // The tallest cell of the outcrop is not over its own foot: a spire that
    // rises plumb is a fence post.
    const top = ops.reduce((best, op) => (op.y > best.y ? op : best), ops[0] as LocalVoxelOp);
    const foot = (OUTCROP_CENTRE());
    expect(top.y, "the outcrop erupts").toBeGreaterThan(3);
    expect(top.x !== foot || top.z !== foot, "the tallest spire leans").toBe(true);
  });

  it("puts the scrying pool's glow under its water, not over it", () => {
    const at = indexOf(opsOf("scrying_pool"));
    const c = 3;
    expect(at.get(`${c},0,${c}`)?.block, "the lit floor").toBe("glowstone");
    expect(at.get(`${c},1,${c}`)?.block, "the water over it").toBe("water");
  });

  it("encloses the paddock and leaves exactly one way in", () => {
    const ops = opsOf("unicorn_paddock");
    const gates = ops.filter((op) => op.block.endsWith("_fence_gate"));
    expect(gates, "one gate").toHaveLength(1);
    const rail = ops.filter((op) => op.block.endsWith("_fence") && op.y === 1);
    const declared = propFootprint("unicorn_paddock", {});
    // The whole perimeter, less the gate cell.
    expect(rail.length).toBe((declared.size[0] - 1) * 4 - 1);
    expect(ops.some((op) => op.block === "cherry_leaves"), "the blossom tree").toBe(true);
    expect(ops.some((op) => op.block === "water_cauldron"), "the trough").toBe(true);
  });

  it("hangs three orrery rings in three different planes about one lit core", () => {
    const ops = opsOf("arcane_orrery");
    const flat = new Set(ops.filter((op) => op.block === "gold_block").map((op) => op.y));
    // The flat ring is one course; the two upright ones are many.
    expect(flat.size, "the equatorial ring is flat").toBe(1);
    const upright = ops.filter((op) => op.block === "amethyst_block");
    expect(new Set(upright.map((op) => op.z)).size, "the polar ring is upright").toBe(1);
    const third = ops.filter((op) => op.block === "smooth_quartz" && op.y > 1);
    expect(new Set(third.map((op) => op.x)).size, "the third ring is upright too").toBe(1);
    expect(ops.some((op) => op.block === "glowstone"), "the lit core").toBe(true);
  });

  it("spaces the lantern row by its pitch and reaches both ends of its run", () => {
    for (const length of [LANTERN_MIN, 9, 15, 40, LANTERN_MAX]) {
      const ops = opsOf("spirit_lantern_row", { length });
      const posts = new Set(
        ops.filter((op) => op.block === "stripped_birch_log").map((op) => op.x),
      );
      expect(posts.has(0), `${length}: a post at the head`).toBe(true);
      expect(posts.has(length - 1), `${length}: a post at the tail`).toBe(true);
      const lanterns = ops.filter((op) => op.block === "lantern");
      expect(lanterns.length, `${length}: two lanterns a post`).toBe(posts.size * 2);
      for (const l of lanterns) expect(l.y, "at head height").toBe(3);
    }
  });

  /** THE HEADLINE: ribs over a spine, half-buried, with the skull turned. */
  it("lays the dragon out where it fell", () => {
    const ops = opsOf("dragon_skeleton");
    const cz = (DRAGON_D - 1) / 2;
    // 1. the spine is IN the ground plane, and runs the length of the box.
    const spine = ops.filter((op) => op.y === 0 && op.props?.["axis"] === "x");
    const xs = spine.map((op) => op.x);
    expect(Math.min(...xs), "from the skull").toBe(0);
    expect(Math.max(...xs), "to the tail tip").toBe(DRAGON_L - 1);
    // 2. the ribs STAND on it: every rib course is an upright bone, and the
    //    tallest of them is well clear of the ground.
    const ribs = ops.filter((op) => op.props?.["axis"] === "y");
    expect(ribs.length, "a ribcage").toBeGreaterThan(60);
    expect(Math.max(...ribs.map((op) => op.y)), "arched over the spine").toBeGreaterThanOrEqual(6);
    // 3. the ribcage is symmetric about the spine and reaches both sides.
    const zs = ribs.map((op) => op.z);
    expect(Math.min(...zs), "the near flank").toBe(0);
    expect(Math.max(...zs), "the far flank").toBe(DRAGON_D - 1);
    // 4. the skull is TURNED: the head end's bone is off the spine's axis.
    const head = ops.filter((op) => op.x <= 3 && op.block === "bone_block");
    expect(head.length, "a skull").toBeGreaterThan(6);
    const mean = head.reduce((sum, op) => sum + op.z, 0) / head.length;
    expect(Math.abs(mean - cz), "turned to one side").toBeGreaterThan(0.9);
    // …and one eye still lit.
    expect(ops.some((op) => op.block === "glowstone"), "the eye").toBe(true);
  });

  it("leans the moon dial's gnomon over a lit face", () => {
    const ops = opsOf("moon_dial");
    const marks = ops.filter((op) => op.block === "glowstone" && op.y === 0);
    expect(marks.length, "the hour marks").toBe(8);
    const gnomon = ops.filter((op) => op.y > 0);
    expect(gnomon.length, "a gnomon").toBeGreaterThan(4);
    // It leans: the highest cell is not over the foot.
    const foot = ops.find((op) => op.y === 1) as LocalVoxelOp;
    const tip = gnomon.reduce((best, op) => (op.y > best.y ? op : best), gnomon[0] as LocalVoxelOp);
    expect(tip.z !== foot.z, "the gnomon leans").toBe(true);
  });
});

/** The outcrop's centre cell, as the generator computes it. */
function OUTCROP_CENTRE(): number {
  return (arcanePropFootprint("crystal_outcrop").size[0] - 1) / 2;
}
