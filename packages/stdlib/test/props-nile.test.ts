/**
 * The **Nile & ancient Egypt pack's props** — §3.8's pyramid, sacred lake and
 * felucca, held to the prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain`, no hanging lantern — and then the
 * properties this half exists to prove, each of which is a rule the physics
 * lint would otherwise find downstream:
 *
 * - **the pyramid is solid per course.** Every course is a filled square, not
 *   a ring and not a shell: a ring leaves its outermost cells with air below
 *   and beside them (`floating.isolated`), and a hollow course is a sealed
 *   pocket. The check counts the cells of each course against the square the
 *   course is supposed to be;
 * - **the pyramid batters, and closes.** Each course is strictly narrower than
 *   the one below and the top course is a single cell — a mass that ran out of
 *   height and finished flat would be a mastaba, which this pack ships
 *   separately and by name;
 * - **the way in is walkable end to end.** Solid non-water floor under the
 *   passage, two courses of air over it for the whole run and in the chamber,
 *   and the chamber reachable from the mouth by a 1x2 body. An icon nobody can
 *   walk into is not what the note asks for;
 * - **the lake's walk and steps are standable** and its water is boxed in
 *   masonry on all four sides;
 * - **support closure**: nothing anywhere in the file is a full cube with six
 *   air faces.
 */

import { describe, expect, it } from "vitest";

import {
  FELUCCA_BEAM,
  FELUCCA_LENGTH,
  NILE_PROP_NAMES,
  PROP_NAMES,
  PYRAMID_BASE,
  PYRAMID_HEIGHT,
  SACRED_LAKE_SPAN,
  STRUCTURE_CATALOG,
  generateProp,
  isNileProp,
  nilePropFootprint,
  nodeSeed,
  propFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x0e11n, "world.nile.props");
const OTHER = nodeSeed(0x0e11n, "world.nile.props.other");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

function opsOf(prop: string, seed = SEED): LocalVoxelOp[] {
  return generateProp({ prop, seed }).ops;
}

/**
 * Blocks the `floating.*` rule has nothing to say about — it polices a **full
 * cube** with six air faces, and none of these is one.
 */
const NOT_A_FULL_CUBE =
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|lantern|_pot$|cauldron|iron_bars|torch|^water$)/;

/** What a body may stand inside, in the lint's vocabulary. */
const PASSABLE = /(_carpet$|_trapdoor$|torch|^air$)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the Nile pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of NILE_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isNileProp(p)).toBe(true);
    }
    expect(isNileProp("beached_wreck")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
    expect(NILE_PROP_NAMES).toHaveLength(3);
  });

  it("is claimed by the catalog as implemented, and as a PROP", () => {
    for (const p of NILE_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("nile");
      expect(
        STRUCTURE_CATALOG.filter((e) => e.id === p),
        p,
      ).toHaveLength(1);
    }
    // The pyramid's row was `building` as the curator wrote it and is marked
    // `prop` here on purpose: a building's roof rebuild has six courses, and
    // the entry that could not be a building is the whole reason §3.8 exists.
    expect(structureById("pyramid")?.category).toBe("religious");
    expect(structureById("sacred_lake")?.category).toBe("waterworks");
    expect(structureById("felucca")?.category).toBe("transport-water");
  });

  /**
   * §3.8's route follower is nobody's yet, and must stay that way: paired
   * recumbent figures at a fixed interval down both sides of a processional
   * way is a sweep client, and neither registry can host one.
   */
  it("leaves the pack's route-following entry alone", () => {
    expect(structureById("sphinx_avenue")?.status).toBe("not_started");
    expect(PROP_NAMES as readonly string[]).not.toContain("sphinx_avenue");
    // And the sphinx itself was ratified out to the bespoke tier: there is no
    // row at all, and adding one here would be a decision this pack cannot
    // make.
    expect(structureById("sphinx")).toBeUndefined();
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of NILE_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(nilePropFootprint(p));
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
    for (const p of NILE_PROP_NAMES) {
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
    for (const p of NILE_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(nilePropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs, uses no `chain`, and hangs no lantern", () => {
    for (const p of NILE_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
        expect(op.block.endsWith("lantern"), `${p} lantern`).toBe(false);
        expect(op.block, `${p} lit fire`).not.toBe("fire");
        expect(op.block, `${p} bare pot`).not.toBe("flower_pot");
        // Rule 5: a gravity block only ever on a floor. There is none at all.
        expect(op.block.endsWith("sand"), `${p} sand`).toBe(false);
        expect(op.block, `${p} gravel`).not.toBe("gravel");
      }
    }
  });

  it("leaves no full block with six air faces", () => {
    for (const p of NILE_PROP_NAMES) {
      const ops = opsOf(p);
      const at = indexOf(ops);
      const declared = nilePropFootprint(p);
      const solid = (x: number, y: number, z: number): boolean => {
        const block = at.get(`${x},${y},${z}`)?.block;
        return block !== undefined && block !== "air";
      };
      for (const op of ops) {
        if (NOT_A_FULL_CUBE.test(op.block)) continue;
        // The base plane rests on the ground the placer prepared for it.
        if (op.y === declared.minY) continue;
        const held =
          solid(op.x + 1, op.y, op.z) ||
          solid(op.x - 1, op.y, op.z) ||
          solid(op.x, op.y, op.z + 1) ||
          solid(op.x, op.y, op.z - 1) ||
          solid(op.x, op.y + 1, op.z) ||
          solid(op.x, op.y - 1, op.z);
        expect(held, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(true);
      }
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the pyramid                                                              */
  /* ------------------------------------------------------------------------ */

  describe("the pyramid", () => {
    const ops = opsOf("pyramid");
    const at = indexOf(ops);
    const mid = (PYRAMID_BASE - 1) >> 1;

    it("is a mass, not a shell: every course is filled to its own square", () => {
      for (let y = 0; y < PYRAMID_HEIGHT; y++) {
        const side = PYRAMID_BASE - 2 * y;
        let filled = 0;
        for (let z = y; z < PYRAMID_BASE - y; z++) {
          for (let x = y; x < PYRAMID_BASE - y; x++) {
            if (at.get(`${x},${y},${z}`) !== undefined) filled++;
          }
        }
        // Every cell of the square, less whatever the passage and the chamber
        // carve out of the four courses they run through.
        const carved = side * side - filled;
        expect(filled, `course ${y}`).toBeGreaterThan(0);
        expect(carved, `course ${y} carved`).toBeLessThan(30);
        if (y === 0 || y > 4) expect(filled, `course ${y} is solid`).toBe(side * side);
      }
    });

    it("batters, and closes on a single cell", () => {
      for (let y = 1; y < PYRAMID_HEIGHT; y++) {
        const width = (yy: number): number => {
          let lo = PYRAMID_BASE;
          let hi = -1;
          for (let x = 0; x < PYRAMID_BASE; x++) {
            if (at.get(`${x},${yy},${mid}`) === undefined) continue;
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
          }
          return hi - lo + 1;
        };
        expect(width(y), `course ${y} is narrower than ${y - 1}`).toBeLessThan(width(y - 1));
      }
      expect(at.get(`${mid},${PYRAMID_HEIGHT - 1},${mid}`), "the apex").toBeDefined();
      expect(at.get(`${mid - 1},${PYRAMID_HEIGHT - 1},${mid}`), "…and only the apex").toBeUndefined();
    });

    it("has a way in a body can actually walk down", () => {
      // The whole run, from the face to the back of the chamber: solid,
      // non-water floor with two courses of air over it.
      for (let z = 1; z <= 10; z++) {
        const floor = at.get(`${mid},0,${z}`);
        expect(floor, `floor at z=${z}`).toBeDefined();
        expect(floor?.block, `floor at z=${z} is not water`).not.toBe("water");
        for (const y of [1, 2]) {
          const cell = at.get(`${mid},${y},${z}`);
          const clear = cell === undefined || PASSABLE.test(cell.block);
          expect(clear, `headroom at ${mid},${y},${z} (${cell?.block ?? "air"})`).toBe(true);
        }
      }
      // …and the chamber is wider than the passage, or it is a corridor with a
      // pot in it rather than a chamber.
      let wide = 0;
      for (let x = 0; x < PYRAMID_BASE; x++) {
        if (at.get(`${x},1,${10}`) === undefined) wide++;
      }
      expect(wide, "the chamber is wider than the passage").toBeGreaterThan(1);
    });

    it("is lit, cased, and dressed — and never by a lantern", () => {
      expect(ops.some((op) => op.block === "glowstone"), "the chamber light").toBe(true);
      expect(
        ops.some((op) => op.block === "chiseled_stone_bricks"),
        "the lintel over the door",
      ).toBe(true);
      expect(ops.some((op) => op.block === "decorated_pot"), "the dressing").toBe(true);
      // The size claim: this is the biggest single prop in the catalog and it
      // still costs less than a galleon.
      expect(ops.length).toBeGreaterThan(4000);
      expect(ops.length).toBeLessThan(8000);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* the sacred lake                                                          */
  /* ------------------------------------------------------------------------ */

  describe("the sacred lake", () => {
    const ops = opsOf("sacred_lake");
    const at = indexOf(ops);
    const last = SACRED_LAKE_SPAN - 1;

    it("boxes its water in masonry on all four sides", () => {
      for (const op of ops) {
        if (op.block !== "water") continue;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const neighbour = at.get(`${op.x + dx},${op.y},${op.z + dz}`);
          expect(neighbour, `water at ${op.x},${op.y},${op.z} has a side`).toBeDefined();
        }
        // …and a floor under it.
        expect(at.get(`${op.x},${op.y - 1},${op.z}`), "water has a bottom").toBeDefined();
      }
    });

    it("leaves the precinct walk standable all the way round", () => {
      for (let i = 1; i < last; i++) {
        for (const [x, z] of [
          [i, 1],
          [i, last - 1],
          [1, i],
          [last - 1, i],
        ] as const) {
          const walk = at.get(`${x},0,${z}`);
          if (walk === undefined) continue;
          expect(walk.block, `the walk at ${x},${z} is not water`).not.toBe("water");
        }
      }
      // The four gates: the precinct wall is broken on each axis, or the basin
      // is a fenced pond nobody can reach the steps of.
      const gate = last >> 1;
      expect(at.get(`${gate},1,0`), "the north gate").toBeUndefined();
      expect(at.get(`${gate},1,${last}`), "the south gate").toBeUndefined();
    });

    it("steps down on all four sides, not one", () => {
      const tread = (x: number, z: number): number => {
        for (let y = 0; y >= -3; y--) {
          const cell = at.get(`${x},${y},${z}`);
          if (cell !== undefined && cell.block !== "water") return y;
        }
        return -9;
      };
      const mid = last >> 1;
      for (const [x, z] of [
        [2, mid],
        [last - 2, mid],
        [mid, 2],
        [mid, last - 2],
      ] as const) {
        expect(tread(x, z), `the step at ${x},${z}`).toBeLessThan(0);
      }
    });
  });

  /* ------------------------------------------------------------------------ */
  /* the felucca                                                              */
  /* ------------------------------------------------------------------------ */

  describe("the felucca", () => {
    const ops = opsOf("felucca");
    const at = indexOf(ops);
    const cz = (FELUCCA_BEAM - 1) >> 1;

    it("floats on a hull with a deck over it", () => {
      let deck = 0;
      for (let x = 2; x < FELUCCA_LENGTH - 2; x++) {
        if (at.get(`${x},0,${cz}`) !== undefined) deck++;
        expect(at.get(`${x},-1,${cz}`), `the hull under station ${x}`).toBeDefined();
      }
      expect(deck, "the deck").toBeGreaterThan(10);
    });

    it("rakes its mast and carries a yard longer than the boat's own house", () => {
      // The mast leans: the column it stands in at the masthead is not the
      // column its foot is in. That lean is the whole read.
      const tops = ops.filter((op) => op.z === cz && op.y >= 6 && op.block.includes("log"));
      expect(tops.length, "something is up there").toBeGreaterThan(0);
      const feet = ops.filter((op) => op.z === cz && op.y === 1 && op.block.includes("log"));
      expect(feet.length, "the mast is stepped on the deck").toBeGreaterThan(0);
      const highX = Math.max(...tops.map((op) => op.x));
      const lowX = Math.min(...feet.map((op) => op.x));
      expect(highX, "the masthead is aft of the step").toBeGreaterThan(lowX);
      // The sail, and the stays that are bars rather than `chain`.
      expect(ops.some((op) => op.block.endsWith("_wool")), "the sail").toBe(true);
      expect(ops.some((op) => op.block === "iron_bars"), "the stays").toBe(true);
    });
  });
});
