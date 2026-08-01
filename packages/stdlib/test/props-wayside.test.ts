/**
 * The wayside props: twelve things that stand between buildings, held to the
 * prop contract.
 *
 * The same tests every earlier prop wave was held to — registration, the
 * declared box, the quarter turns, determinism — plus the one property this
 * wave was written against and which the physics lint checks downstream:
 *
 * **support closure.** Nothing floats. Every block either rests on the ground
 * plane, rests on another of the prop's own blocks, or hangs under one — and
 * for the blocks the lint holds to its `groundedChain` rule (fences, walls,
 * carpets, pressure plates, campfires, standing lanterns) the chain is walked
 * all the way down here, exactly as `physics.ts` walks it. Hanging lanterns are
 * walked the other way, to a solid anchor above, which is `hungChain`.
 */

import { describe, expect, it } from "vitest";

import {
  PROP_NAMES,
  STRUCTURE_CATALOG,
  WAYSIDE_PROP_NAMES,
  generateProp,
  isWaysideProp,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  waysidePropFootprint,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xa751den, "world.wayside");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("wayside props", () => {
  it("registers every one of them, once", () => {
    for (const p of WAYSIDE_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isWaysideProp(p)).toBe(true);
    }
    expect(isWaysideProp("well_head")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as wave five, implemented", () => {
    for (const p of WAYSIDE_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      // Wave five built the first twelve; wave six added the helipad to the
      // same file, because a marked pad on the ground is a wayside prop
      // whatever group the catalog files it under.
      expect(entry?.wave === 5 || entry?.wave === 6, p).toBe(true);
      expect(entry?.kind, p).toBe("prop");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of WAYSIDE_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(waysidePropFootprint(p));
      const result = generateProp({ prop: p, seed: SEED });
      expect(result.meta.size, p).toEqual(declared.size);
      // The mailbox and the phone box are deliberately tiny; everything else is
      // comfortably above this.
      expect(result.ops.length, p).toBeGreaterThan(6);
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
    for (const p of WAYSIDE_PROP_NAMES) {
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
    for (const p of WAYSIDE_PROP_NAMES) {
      const once = JSON.stringify(generateProp({ prop: p, seed: SEED }).ops);
      expect(JSON.stringify(generateProp({ prop: p, seed: SEED }).ops), p).toBe(once);
    }
  });

  it("places no sign block, no open fluid and no chain", () => {
    for (const p of WAYSIDE_PROP_NAMES) {
      for (const op of generateProp({ prop: p, seed: SEED }).ops) {
        const where = `${p} ${op.block} at ${op.x},${op.y},${op.z}`;
        expect(op.block, where).not.toMatch(/sign$/);
        expect(["water", "lava"], where).not.toContain(op.block);
        // `chain` is absent from the 1.21.11 block table: the op would be
        // silently dropped. Iron bars carry the read instead.
        expect(op.block, where).not.toBe("chain");
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
    for (const p of WAYSIDE_PROP_NAMES) {
      const result = generateProp({ prop: p, seed: SEED });
      const at = indexOf(result.ops);
      const nameAt = (x: number, y: number, z: number): string | undefined =>
        at.get(`${x},${y},${z}`)?.block;

      /** `groundedChain`: down through standing blocks to the base plane. */
      const grounded = (x: number, y: number, z: number): boolean => {
        for (let by = y - 1; by >= 0; by--) {
          const name = nameAt(x, by, z);
          // A gap under a standing block is exactly the defect the lint fires
          // on: the chain has to be unbroken.
          if (name === undefined) return false;
          if (PARTIAL.test(name)) return true;
          if (!NEEDS_GROUND.test(name) && !name.startsWith("potted_")) return true;
        }
        // Fell through to the base plane: the ground itself.
        return true;
      };

      /** `hungChain`: up through bars and fences to a solid anchor. */
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
        // reading, and it is what lets the midway arch's span cross a gate
        // without letting a block hang in mid-air on its own.
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

  const opsOf = (prop: string): LocalVoxelOp[] =>
    generateProp({ prop: prop as never, seed: SEED }).ops;
  const has = (prop: string, block: string): boolean =>
    opsOf(prop).some((op) => op.block === block);

  it("builds the thing each prop is for", () => {
    // --- the kerb ----------------------------------------------------------
    // Three sides of glass, an open front, a bench and a flag.
    const shelter = indexOf(opsOf("bus_shelter"));
    expect(shelter.get("2,1,2"), "the shelter's open front").toBeUndefined();
    expect(shelter.get("0,1,0")?.block, "the back wall").toBe("glass_pane");
    expect(
      opsOf("bus_shelter").some((op) => op.block.endsWith("_banner")),
      "the route flag",
    ).toBe(true);
    // One cell square, and red.
    for (const op of opsOf("phone_box")) {
      expect(op.x, "the phone box is one cell square").toBe(0);
      expect(op.z, "the phone box is one cell square").toBe(0);
    }
    expect(has("phone_box", "red_concrete"), "the red shell").toBe(true);
    expect(has("phone_box", "glass_pane"), "the glazing").toBe(true);
    // A post, a head and two iron plates.
    expect(opsOf("mailbox").filter((op) => op.block === "iron_trapdoor")).toHaveLength(2);
    expect(has("mailbox", "red_concrete"), "the box head").toBe(true);
    // Three hoops, each a pair of posts under a pair of plates.
    const rack = opsOf("bicycle_rack");
    expect(rack.filter((op) => op.block.endsWith("_fence"))).toHaveLength(6);
    expect(rack.filter((op) => op.block.endsWith("_trapdoor"))).toHaveLength(6);
    // A canopy on posts, with nothing under it: no counter, no wares.
    expect(has("shop_awning", "red_wool"), "stripe").toBe(true);
    expect(has("shop_awning", "white_wool"), "stripe").toBe(true);
    expect(has("shop_awning", "hay_block"), "no wares — that is the stall").toBe(false);
    expect(has("shop_awning", "barrel"), "no wares — that is the stall").toBe(false);

    // --- the road ----------------------------------------------------------
    expect(has("milestone", "chiseled_stone_bricks"), "the carving").toBe(true);
    expect(has("milestone", "mossy_cobblestone"), "the age").toBe(true);
    expect(has("milestone", "moss_carpet"), "the moss detail").toBe(true);
    expect(
      opsOf("bus_stop").some((op) => op.block.endsWith("_banner")),
      "the flag",
    ).toBe(true);
    expect(
      opsOf("bus_stop").filter((op) => op.block.endsWith("_stairs")),
      "two seats",
    ).toHaveLength(2);
    // Four wheels, two courses each, on two axles; and a rail on the roof.
    const coach = indexOf(opsOf("stagecoach"));
    for (const x of [2, 6]) {
      for (const z of [0, 2]) {
        for (const y of [0, 1]) {
          expect(coach.get(`${x},${y},${z}`)?.block, `wheel ${x},${y},${z}`).toMatch(/_trapdoor$/);
        }
      }
    }
    expect(coach.get("0,2,1"), "the drawbar").toBeDefined();
    expect(coach.get("2,6,0")?.block, "the luggage rail").toMatch(/_fence$/);
    expect(coach.get("5,5,1")?.block, "the roof").toMatch(/_slab$/);
    expect(has("stagecoach", "glass_pane"), "the coach windows").toBe(true);

    // --- the pitch ---------------------------------------------------------
    const yurt = indexOf(opsOf("yurt"));
    expect(yurt.get("3,5,3")?.block, "the cap is SOLID").toBe("brown_wool");
    expect(yurt.get("3,4,1"), "the smoke hole").toBeUndefined();
    expect(yurt.get("3,5,1"), "nothing over the smoke hole").toBeUndefined();
    expect(yurt.get("3,1,6"), "the doorway").toBeUndefined();
    expect(yurt.get("3,2,6")?.block, "the door flap").toMatch(/_trapdoor$/);
    expect(yurt.get("3,2,3")?.block, "the stove").toBe("campfire");
    expect(has("yurt", "white_wool") && has("yurt", "brown_wool"), "the two bands").toBe(true);
    expect(has("yurt", "red_carpet"), "the rug").toBe(true);

    // --- the midway --------------------------------------------------------
    // Twenty-four treads spiralling down, every one beside the core.
    const skelter = opsOf("helter_skelter");
    const treads = skelter.filter((op) => op.block.endsWith("_stairs"));
    expect(treads.length, "the slide").toBe(24);
    const skelterAt = indexOf(skelter);
    for (const t of treads) {
      const beside = (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).some(([dx, dz]) => {
        const b = skelterAt.get(`${t.x + dx},${t.y},${t.z + dz}`)?.block;
        return b !== undefined && b.endsWith("_concrete");
      });
      expect(beside, `tread at ${t.x},${t.y},${t.z} is against the core`).toBe(true);
    }
    expect(skelterAt.get("3,10,3")?.block, "the crown's solid point").toMatch(/_wool$/);
    expect(skelterAt.get("3,3,6"), "the entrance lintel").toBeDefined();
    expect(skelterAt.get("3,1,6"), "the entrance doorway").toBeUndefined();
    // A span that reaches a tower head at each end, with bunting under it.
    const arch = indexOf(opsOf("midway_arch"));
    for (let x = 0; x < 9; x++) expect(arch.get(`${x},5,1`), `span at ${x}`).toBeDefined();
    expect(has("midway_arch", "iron_bars"), "the bunting").toBe(true);
    expect(
      opsOf("midway_arch").filter((op) => op.block.endsWith("_banner")).length,
      "the flags",
    ).toBeGreaterThan(2);
    // A counter, three targets and a striped canopy.
    const gallery = opsOf("shooting_gallery");
    expect(gallery.filter((op) => op.block === "stone_button"), "three targets").toHaveLength(3);
    expect(has("shooting_gallery", "white_concrete"), "the target discs").toBe(true);
    expect(has("shooting_gallery", "hay_block"), "the prizes").toBe(true);
    expect(has("shooting_gallery", "red_wool"), "the canopy stripe").toBe(true);

    // --- the pad (wave six) ------------------------------------------------
    // A disc, not a square: the bounding box's corners are empty except the
    // one the mast stands on, and the disc's own edge is white.
    const pad = indexOf(opsOf("helipad"));
    expect(pad.get("8,0,0"), "the pad is a disc, not a square").toBeUndefined();
    expect(pad.get("8,0,8"), "the pad is a disc, not a square").toBeUndefined();
    expect(pad.get("4,0,0")?.block, "the ring").toBe("white_concrete");
    expect(pad.get("4,0,4")?.block, "the middle of the H").toBe("white_concrete");
    expect(pad.get("4,0,2")?.block, "inside the ring").toBe("gray_concrete");
    // Four edge lights, each standing on a pad cell.
    const lights = opsOf("helipad").filter((op) => op.block.endsWith("lantern"));
    expect(lights, "four edge lights").toHaveLength(4);
    for (const l of lights) {
      expect(l.props?.["hanging"], "an edge light stands, it does not hang").toBe("false");
      expect(pad.get(`${l.x},0,${l.z}`), `pad under the light at ${l.x},${l.z}`).toBeDefined();
    }
    // The mast, and the windsock hung off its head — a banner, never a sign,
    // and on a full cube, never a fence.
    expect(pad.get("0,0,0")?.block, "the mast's own footing").toBe("gray_concrete");
    expect(pad.get("0,3,0")?.block, "the mast head").toBe("light_gray_concrete");
    expect(pad.get("0,3,1")?.block, "the windsock").toBe("orange_wall_banner");
  });
});
