/**
 * Wave 6D's props — the spectacle five, plus the houseboat that went to the
 * watercraft pipeline instead of to the building grammar.
 *
 * The same tests every earlier prop wave was held to (registration, the
 * declared box, the quarter turns, determinism, no signs / no fluids / no
 * chain) plus the one property this wave was written against and which the
 * physics lint checks downstream:
 *
 * **support closure at yaw 0.** Nothing floats. Every block rests on the base
 * plane, rests on another of the prop's own blocks, or hangs under one — and
 * for the blocks the lint holds to `groundedChain` (fences, walls, carpets,
 * pressure plates, campfires, standing lanterns) the chain is walked all the
 * way down here exactly as `physics.ts` walks it.
 *
 * The ferris wheel is the case this file exists for: a wheel is a ring, and a
 * ring drawn one cell thick is a set of blocks that touch only at their corners
 * — which is to say a set of blocks each of which floats free of the prop. The
 * rim-band and axis-spoke tests below are what hold that shut.
 */

import { describe, expect, it } from "vitest";

import {
  FERRIS_HUB,
  FERRIS_RADIUS,
  PROP_NAMES,
  SPECTACLE_PROP_NAMES,
  generateProp,
  isSpectacleProp,
  nodeSeed,
  onFerrisRim,
  propFootprint,
  rotateOps,
  spectaclePropFootprint,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x60d5eccan, "world.spectacle");

/** Every prop this wave shipped, wherever it lives. */
const WAVE: readonly string[] = [...SPECTACLE_PROP_NAMES, "houseboat"];

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const opsOf = (prop: string): LocalVoxelOp[] =>
  generateProp({ prop: prop as never, seed: SEED }).ops;
const has = (prop: string, block: string): boolean =>
  opsOf(prop).some((op) => op.block === block);

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("wave-6D spectacle props", () => {
  it("registers every one of them, once", () => {
    for (const p of WAVE) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
    }
    for (const p of SPECTACLE_PROP_NAMES) expect(isSpectacleProp(p)).toBe(true);
    // The houseboat is a hull, not one of this file's props.
    expect(isSpectacleProp("houseboat")).toBe(false);
    expect(isSpectacleProp("prize_wheel")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as wave six, implemented, and a prop", () => {
    for (const p of WAVE) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.wave, p).toBe(6);
      // Four of the six sit in categories whose usual kind is not `prop`; each
      // carries the override at the entry that makes it.
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of WAVE) {
      const declared = propFootprint(p as never, {});
      if (isSpectacleProp(p)) expect(declared, p).toEqual(spectaclePropFootprint(p));
      const result = generateProp({ prop: p as never, seed: SEED });
      expect(result.meta.size, p).toEqual(declared.size);
      expect(result.ops.length, p).toBeGreaterThan(12);
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
    for (const p of WAVE) {
      const result = generateProp({ prop: p as never, seed: SEED });
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
    for (const p of WAVE) {
      const once = JSON.stringify(generateProp({ prop: p as never, seed: SEED }).ops);
      expect(JSON.stringify(generateProp({ prop: p as never, seed: SEED }).ops), p).toBe(once);
    }
  });

  it("places no sign block, no chain, no bare pot and no plain mud", () => {
    for (const p of WAVE) {
      for (const op of generateProp({ prop: p as never, seed: SEED }).ops) {
        const where = `${p} ${op.block} at ${op.x},${op.y},${op.z}`;
        expect(op.block, where).not.toMatch(/sign$/);
        expect(op.block, where).not.toBe("chain");
        expect(op.block, where).not.toBe("flower_pot");
        expect(op.block, where).not.toBe("mud");
      }
    }
  });

  it("keeps open fluid to the hulls, which displace it rather than trap it", () => {
    for (const p of SPECTACLE_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(["water", "lava"], `${p} ${op.block}`).not.toContain(op.block);
      }
    }
    // The houseboat is a water prop: it writes no fluid either, it writes solid
    // at the water line and below it and never writes air.
    for (const op of opsOf("houseboat")) {
      expect(["water", "lava", "air"], `houseboat ${op.block}`).not.toContain(op.block);
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
    for (const p of WAVE) {
      const result = generateProp({ prop: p as never, seed: SEED });
      const base = result.meta.minY;
      const at = indexOf(result.ops);
      const nameAt = (x: number, y: number, z: number): string | undefined =>
        at.get(`${x},${y},${z}`)?.block;

      /** `groundedChain`: down through standing blocks to the base plane. */
      const grounded = (x: number, y: number, z: number): boolean => {
        for (let by = y - 1; by >= base; by--) {
          const name = nameAt(x, by, z);
          if (name === undefined) return false;
          if (PARTIAL.test(name)) return true;
          if (!NEEDS_GROUND.test(name) && !name.startsWith("potted_")) return true;
        }
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
          if (!PARTIAL.test(name)) return true;
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
        if (PARTIAL.test(op.block)) {
          expect(joined || op.y === base, where).toBe(true);
          continue;
        }
        // The stronger reading the wayside wave adopted: a full cube either
        // stands on the base plane or joins the prop's own body.
        if (!NEEDS_GROUND.test(op.block) && op.y > base) {
          expect(joined, `${where} floats free of the prop`).toBe(true);
        }
      }
    }
  });

  /* ------------------------------------------------------------------------ */
  /* character                                                                 */
  /* ------------------------------------------------------------------------ */

  it("builds a ferris wheel: A-frames, an axle, a joined rim and hung cars", () => {
    const ops = opsOf("ferris_wheel");
    const at = indexOf(ops);
    const cz = FERRIS_RADIUS;
    const hub = FERRIS_HUB;

    // The axle runs right across all three columns at the hub.
    for (let x = 0; x < 3; x++) {
      expect(at.get(`${x},${hub},${cz}`)?.block, `axle at ${x}`).toMatch(/log$/);
    }
    // Both A-frame feet reach the base plane.
    for (const x of [0, 2]) {
      for (const sign of [-1, 1]) {
        expect(at.get(`${x},0,${cz + sign * 3}`), `frame foot ${x}`).toBeDefined();
      }
    }
    // **The rim is 4-connected.** Every rim cell has a face neighbour that is
    // also part of the wheel — the property a one-thick digital circle does not
    // have and the reason the band predicate is what it is.
    let rimCells = 0;
    for (let dz = -FERRIS_RADIUS; dz <= FERRIS_RADIUS; dz++) {
      for (let dy = -FERRIS_RADIUS; dy <= FERRIS_RADIUS; dy++) {
        if (!onFerrisRim(dz, dy)) continue;
        rimCells++;
        const here = `1,${hub + dy},${cz + dz}`;
        expect(at.get(here), `rim cell ${here}`).toBeDefined();
        const joined = (
          [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ] as const
        ).some(([ez, ey]) => at.get(`1,${hub + dy + ey},${cz + dz + ez}`) !== undefined);
        expect(joined, `rim cell ${here} touches only at its corners`).toBe(true);
      }
    }
    expect(rimCells, "a rim worth the name").toBeGreaterThan(24);
    // Four cars, each an iron-bar link over a slab.
    const links = ops.filter((op) => op.block === "iron_bars");
    expect(links.length, "the gondola links").toBe(4);
    for (const link of links) {
      expect(at.get(`${link.x},${link.y - 1},${link.z}`)?.block, "the car under the link")
        .toMatch(/_slab$/);
      expect(at.get(`${link.x},${link.y + 1},${link.z}`), "the rim over the link").toBeDefined();
    }
    // No centre post: the column under the hub is the wheel, not masonry.
    expect(at.get(`1,0,${cz}`), "no post under the hub").toBeUndefined();
    expect(has("ferris_wheel", "glowstone"), "the hub lights").toBe(true);
  });

  it("builds a bandstand: pillars, a rail, and a cone on a SOLID finial", () => {
    const at = indexOf(opsOf("bandstand"));
    const c = 4;
    expect(at.get(`${c},8,${c}`)?.block, "the finial is solid").toBe("chiseled_stone_bricks");
    expect(at.get(`${c},9,${c}`)?.block, "the flag on it").toMatch(/_banner$/);
    expect(at.get(`${c},7,${c}`)?.block, "the apex course is solid too").toBe("polished_andesite");
    expect(at.get(`0,1,${c}`)?.block, "a pillar").toMatch(/log$/);
    expect(
      opsOf("bandstand").some((op) => op.block.endsWith("_fence")),
      "the rail",
    ).toBe(true);
    // The way in: the +z arc is left unrailed.
    expect(at.get(`${c},1,${c + 4}`)?.block, "the open arc").not.toMatch(/_fence$/);
  });

  it("builds a memorial garden: path, beds, a monument and benches", () => {
    const at = indexOf(opsOf("memorial_garden"));
    expect(at.get("4,1,1")?.block, "the monument plinth").toBe("chiseled_stone_bricks");
    expect(at.get("4,3,1")?.block, "its cap").toMatch(/_slab$/);
    expect(has("memorial_garden", "coarse_dirt"), "the beds").toBe(true);
    expect(has("memorial_garden", "green_carpet"), "the wreath").toBe(true);
    expect(has("memorial_garden", "oak_leaves"), "the hedged bed edges").toBe(true);
    // Persistent, or the hedge decays and the garden is a lawn.
    for (const op of opsOf("memorial_garden")) {
      if (op.block !== "oak_leaves") continue;
      expect(op.props?.["persistent"], "leaves must be persistent").toBe("true");
    }
    expect(
      opsOf("memorial_garden").filter((op) => op.block.endsWith("_stairs")),
      "two benches",
    ).toHaveLength(2);
  });

  it("builds a portal frame with a DELIBERATELY empty interior", () => {
    const at = indexOf(opsOf("portal_frame"));
    for (let x = 0; x < 4; x++) {
      expect(at.get(`${x},0,1`), `sill at ${x}`).toBeDefined();
      expect(at.get(`${x},4,1`), `lintel at ${x}`).toBeDefined();
    }
    for (let y = 1; y <= 3; y++) {
      expect(at.get(`0,${y},1`), `west jamb ${y}`).toBeDefined();
      expect(at.get(`3,${y},1`), `east jamb ${y}`).toBeDefined();
      expect(at.get(`1,${y},1`), `the gateway stays open at ${y}`).toBeUndefined();
      expect(at.get(`2,${y},1`), `the gateway stays open at ${y}`).toBeUndefined();
    }
    expect(has("portal_frame", "obsidian"), "the frame").toBe(true);
    expect(has("portal_frame", "crying_obsidian"), "the corners").toBe(true);
    expect(has("portal_frame", "amethyst_cluster"), "the runes").toBe(true);
    // No portal block anywhere. A lit portal is gameplay, not scenery.
    for (const op of opsOf("portal_frame")) {
      expect(op.block, "no portal block").not.toMatch(/portal/);
    }
  });

  it("builds a floating platform that oversails a real, veiled stem", () => {
    const at = indexOf(opsOf("floating_platform"));
    const c = 3;
    // The stem is real: an unbroken column from the base plane to the disc.
    for (let y = 0; y < 5; y++) {
      expect(at.get(`${c},${y},${c}`)?.block, `stem at ${y}`).toBe("end_stone_bricks");
    }
    // And it is veiled with bars, never chain.
    expect(at.get(`${c + 1},2,${c}`)?.block, "the veil").toBe("iron_bars");
    expect(has("floating_platform", "chain"), "no chain in the block table").toBe(false);
    // The disc oversails the stem by three cells in x and in z.
    expect(at.get(`0,5,${c}`), "the west overhang").toBeDefined();
    expect(at.get(`6,5,${c}`), "the east overhang").toBeDefined();
    expect(at.get(`${c},5,0`), "the north overhang").toBeDefined();
    expect(has("floating_platform", "moss_block"), "the soil").toBe(true);
    expect(has("floating_platform", "amethyst_block"), "the crown").toBe(true);
  });

  it("builds a houseboat on the hull template, not in the building grammar", () => {
    const result = generateProp({ prop: "houseboat" as never, seed: SEED });
    expect(result.meta.base, "a home on open water").toBe("water");
    expect(result.meta.minY, "one course of draught").toBe(-1);
    const at = indexOf(result.ops);
    // Every column of the hull is solid at the water line and below it, which
    // is what makes the barge displace water rather than box a pocket in.
    for (let x = 2; x <= 14; x++) {
      expect(at.get(`${x},0,4`), `deck at ${x}`).toBeDefined();
      expect(at.get(`${x},-1,4`), `hull at ${x}`).toBeDefined();
    }
    expect(at.get("4,1,4"), "the cabin doorway is a gap").toBeUndefined();
    expect(has("houseboat", "glass_pane"), "the clerestory").toBe(true);
    expect(
      result.ops.some((op) => op.block === "white_wall_banner"),
      "the name board is a banner, never a sign",
    ).toBe(true);
    expect(
      result.ops.some((op) => op.block.startsWith("potted_")),
      "the roof planters are potted, never a bare pot",
    ).toBe(true);
    expect(has("houseboat", "iron_bars"), "the mooring lines").toBe(true);
  });
});
