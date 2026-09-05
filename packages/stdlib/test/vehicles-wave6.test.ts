/**
 * Wave 6's twelve vehicles: four rail, five water, three air.
 *
 * `vehicles.test.ts` states the three properties a *shaped* prop has to have —
 * connectedness, standing, draught — and this file re-derives all three for the
 * craft added since, plus the four rules this wave was written against:
 *
 * - **no `chain`.** The pinned 1.21.11 block table has no `chain` entry, so a
 *   `chain` op is silently dropped; links and rigging are `iron_bars`;
 * - **no sign blocks.** A sign is a block entity; a banner is not;
 * - **no fluid ops.** A hull displaces water rather than writing it, which is
 *   the whole no-leak argument;
 * - **wheels on rails.** Every rail craft carries its own bed and rail, and the
 *   rail is under the wheels rather than beside them.
 */

import { describe, expect, it } from "vitest";

import {
  AIRCRAFT6_PROP_NAMES,
  MATERIAL_THEMES,
  PROP_YAWS,
  RAILCRAFT_PROP_NAMES,
  RAIL_CZ,
  SHIP6_PROP_NAMES,
  assignMaterials,
  generateProp,
  nodeSeed,
  propBounds,
  propFootprint,
  rotateOps,
  type BuildingMaterials,
  type LocalVoxelOp,
  type PropName,
} from "../src/index.js";

const SEED = nodeSeed(20260731n, "world.vehicles6", "");
const OTHER = nodeSeed(20260731n, "world.vehicles6.other", "");

/** Every craft this wave added, rail first. */
const CRAFT: readonly PropName[] = [
  ...RAILCRAFT_PROP_NAMES,
  ...SHIP6_PROP_NAMES,
  ...AIRCRAFT6_PROP_NAMES,
];

/** Blocks that are not full cubes and so cannot carry a support chain. */
const NOT_SOLID = /(_slab|_stairs|_fence|_wall|_pane|iron_bars|lantern|_trapdoor|torch|rail|campfire|_banner)$/;

function opsOf(prop: PropName, seed = SEED): LocalVoxelOp[] {
  return generateProp({ prop, seed, params: {} }).ops;
}

/** The size of the largest face-connected component of an op list. */
function largestComponent(ops: readonly LocalVoxelOp[]): number {
  const cells = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
  let best = 0;
  const seen = new Set<string>();
  for (const start of cells) {
    if (seen.has(start)) continue;
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const cell = stack.pop() as string;
      size++;
      const [x, y, z] = cell.split(",").map(Number) as [number, number, number];
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ] as const) {
        const next = `${x + dx},${y + dy},${z + dz}`;
        if (cells.has(next) && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

/* -------------------------------------------------------------------------- */

describe("every wave-6 craft", () => {
  it("covers the twelve the wave named", () => {
    expect(CRAFT.length).toBe(12);
    for (const name of ["locomotive", "container_ship", "hot_air_balloon", "glider"]) {
      expect(CRAFT).toContain(name as PropName);
    }
  });

  it("builds something substantial", () => {
    for (const prop of CRAFT) expect(opsOf(prop).length, prop).toBeGreaterThan(80);
  });

  it("stays inside the box it declared, and touches all four sides of it", () => {
    for (const prop of CRAFT) {
      const declared = propFootprint(prop, {});
      const ops = opsOf(prop);
      const outside = ops.filter(
        (op) =>
          op.x < 0 ||
          op.x >= declared.size[0] ||
          op.z < 0 ||
          op.z >= declared.size[2] ||
          op.y < declared.minY ||
          op.y >= declared.minY + declared.size[1],
      );
      expect(outside, `${prop} left its box`).toEqual([]);
      const bounds = propBounds(ops);
      expect(bounds.minX, prop).toBe(0);
      expect(bounds.minZ, prop).toBe(0);
      expect(bounds.size[0], prop).toBe(declared.size[0]);
      expect(bounds.size[2], prop).toBe(declared.size[2]);
    }
  });

  it("is one connected object", () => {
    for (const prop of CRAFT) {
      const ops = opsOf(prop);
      expect(largestComponent(ops), `${prop} has a detached piece`).toBe(ops.length);
    }
  });

  it("is a pure function of its seed, params and materials", () => {
    const materials = assignMaterials(MATERIAL_THEMES[2] as never, 1, SEED)[0] as BuildingMaterials;
    for (const prop of CRAFT) {
      const a = generateProp({ prop, seed: SEED, materials });
      const b = generateProp({ prop, seed: SEED, materials });
      expect(a.ops, prop).toEqual(b.ops);
      expect(a.meta, prop).toEqual(b.meta);
    }
  });

  it("varies its cosmetics with the seed and its geometry with nothing", () => {
    for (const prop of CRAFT) {
      const a = opsOf(prop, SEED);
      const b = opsOf(prop, OTHER);
      expect(
        a.map((o) => `${o.x},${o.y},${o.z}`),
        prop,
      ).toEqual(b.map((o) => `${o.x},${o.y},${o.z}`));
    }
    const differs = (prop: PropName): boolean => {
      const a = opsOf(prop, SEED);
      const b = opsOf(prop, OTHER);
      return a.some((op, i) => op.block !== (b[i] as LocalVoxelOp).block);
    };
    expect(CRAFT.filter(differs).length).toBeGreaterThan(3);
  });

  it("rotates onto the rotated box, at every yaw", () => {
    for (const prop of CRAFT) {
      const { ops, meta } = generateProp({ prop, seed: SEED });
      const [sizeX, , sizeZ] = meta.size;
      for (const yaw of PROP_YAWS) {
        const turned = rotateOps(ops, yaw, sizeX, sizeZ);
        expect(turned.length, `${prop}@${yaw}`).toBe(ops.length);
        const bounds = propBounds(turned);
        const [w, d] = yaw === 90 || yaw === 270 ? [sizeZ, sizeX] : [sizeX, sizeZ];
        expect(bounds.size[0], `${prop}@${yaw} x`).toBe(w);
        expect(bounds.size[2], `${prop}@${yaw} z`).toBe(d);
        expect(bounds.minX).toBe(0);
        expect(bounds.minZ).toBe(0);
      }
    }
  });

  it("uses no chain, no sign and no fluid", () => {
    for (const prop of CRAFT) {
      for (const op of opsOf(prop)) {
        expect(op.block, prop).not.toBe("chain");
        expect(op.block.endsWith("_sign"), `${prop}: ${op.block}`).toBe(false);
        expect(op.block, prop).not.toBe("water");
        expect(op.block, prop).not.toBe("lava");
        expect(op.block, prop).not.toBe("air");
      }
    }
  });

  it("puts something solid under every fence, campfire and standing lantern", () => {
    for (const prop of CRAFT) {
      const ops = opsOf(prop);
      const at = new Map(ops.map((o) => [`${o.x},${o.y},${o.z}`, o]));
      const base = propFootprint(prop, {}).base;
      for (const op of ops) {
        const standing =
          op.block.endsWith("_fence") ||
          op.block === "campfire" ||
          (op.block.endsWith("lantern") && op.props?.["hanging"] !== "true");
        if (!standing) continue;
        let y = op.y - 1;
        let carried = false;
        while (y >= -1) {
          const below = at.get(`${op.x},${y},${op.z}`);
          if (below === undefined) {
            carried = base !== "water" && y === -1;
            break;
          }
          if (!NOT_SOLID.test(below.block)) {
            carried = true;
            break;
          }
          if (!below.block.endsWith("_fence")) break;
          y--;
        }
        expect(carried, `${prop}: ${op.block} at ${op.x},${op.y},${op.z} carries nothing`).toBe(
          true,
        );
      }
    }
  });

  it("hangs every hung lantern under one of its own blocks", () => {
    for (const prop of CRAFT) {
      const ops = opsOf(prop);
      const at = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      for (const op of ops) {
        if (!op.block.endsWith("lantern") || op.props?.["hanging"] !== "true") continue;
        expect(at.has(`${op.x},${op.y + 1},${op.z}`), `${prop} lantern hangs from air`).toBe(true);
      }
    }
  });
});

describe("the rolling stock", () => {
  it("stands on the ground plane and never below it", () => {
    for (const prop of RAILCRAFT_PROP_NAMES) {
      const foot = propFootprint(prop as PropName, {});
      expect(foot.base, prop).toBe("ground");
      expect(foot.minY, prop).toBe(0);
      expect(Math.min(...opsOf(prop as PropName).map((o) => o.y)), prop).toBe(0);
    }
  });

  it("carries its own rail, the full length of the craft, under the wheels", () => {
    for (const prop of RAILCRAFT_PROP_NAMES) {
      const ops = opsOf(prop as PropName);
      const length = propFootprint(prop as PropName, {}).size[0];
      const rails = ops.filter((o) => o.block === "rail");
      expect(rails.length, `${prop} rail run`).toBe(length);
      for (const rail of rails) {
        expect(rail.y, prop).toBe(1);
        expect(rail.z, prop).toBe(RAIL_CZ);
      }
      // …and a bed under every one of them.
      const bed = new Set(ops.filter((o) => o.y === 0).map((o) => `${o.x},${o.z}`));
      for (const rail of rails) expect(bed.has(`${rail.x},${rail.z}`), prop).toBe(true);
      // The wheel discs are trapdoors either side of the rail, above it.
      // The running gear only: a body's doors are trapdoors too, and they are
      // above the frame rather than in it.
      const wheels = ops.filter((o) => o.block.endsWith("_trapdoor") && o.y >= 2 && o.y <= 3);
      expect(wheels.length, `${prop} wheels`).toBeGreaterThan(3);
      expect(wheels.every((w) => Math.abs(w.z - RAIL_CZ) === 1), prop).toBe(true);
    }
  });
});

describe("the wave-6 hulls", () => {
  it("draws exactly one submerged course, and decks every column it submerges", () => {
    for (const prop of SHIP6_PROP_NAMES) {
      const ops = opsOf(prop as PropName);
      expect(propFootprint(prop as PropName, {}).base, prop).toBe("water");
      expect(Math.min(...ops.map((o) => o.y)), `${prop} draught`).toBe(-1);
      const deck = new Set(ops.filter((o) => o.y === 0).map((o) => `${o.x},${o.z}`));
      for (const op of ops.filter((o) => o.y === -1)) {
        expect(deck.has(`${op.x},${op.z}`), `${prop} at ${op.x},${op.z}`).toBe(true);
      }
    }
  });
});

describe("the balloon", () => {
  it("is held up by a mast that reaches the ground, not by nothing", () => {
    const ops = opsOf("hot_air_balloon");
    const column = new Set(ops.filter((o) => o.x === 5 && o.z === 5).map((o) => o.y));
    // An unbroken column from the basket floor to the envelope's throat — the
    // envelope itself is a hollow shell above it, which is why the column stops
    // rather than continuing to the crown.
    for (let y = 0; y <= 7; y++) {
      expect(column.has(y), `gap in the balloon mast at y=${y}`).toBe(true);
    }
    // …and the envelope really is over it: the crown is on the same axis.
    const top = Math.max(...ops.map((o) => o.y));
    expect(ops.some((o) => o.y === top && o.x === 5 && o.z === 5)).toBe(true);
  });
});
