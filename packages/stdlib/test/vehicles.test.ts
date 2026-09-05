/**
 * The transport-air and transport-water grammars.
 *
 * `props.test.ts` already holds bounds, determinism and rotation against every
 * name in the catalog, and these craft are in that catalog, so they inherit all
 * of it. What this file adds is the three properties that are specific to
 * things which are *shaped* rather than built:
 *
 * 1. **connectedness** — every op of a craft is face-connected to every other
 *    one. A hollow fuselage drawn as a stack of rings breaks this the moment
 *    the radius steps and nobody draws the bulkhead, and the failure is
 *    invisible in an op count: the airliner had fifteen disconnected pieces
 *    before {@link bulkheadCells} existed, and looked fine from the numbers;
 * 2. **standing** — a grounded craft reaches `y = 0`, which is the block above
 *    the apron, and every fence or lantern it carries has something solid
 *    under it. This is the op-list half of the readback lint's support rules;
 * 3. **draught** — a floating craft writes at `y = -1` and never below it,
 *    because the placer only guarantees two blocks of water, and writes no air
 *    at all, because that is the whole fluid-safety argument.
 */

import { describe, expect, it } from "vitest";

import {
  AIRCRAFT_PROP_NAMES,
  MATERIAL_THEMES,
  PROP_YAWS,
  SHIP_PROP_NAMES,
  assignMaterials,
  bulkheadCells,
  ellipseRadius,
  generateProp,
  hullHalfAt,
  nodeSeed,
  octaDisc,
  propBounds,
  propFootprint,
  ringCells,
  rotateOps,
  type BuildingMaterials,
  type LocalVoxelOp,
  type PropName,
} from "../src/index.js";

const SEED = nodeSeed(20260729n, "world.vehicles", "");
const OTHER = nodeSeed(20260729n, "world.vehicles.other", "");

/** Every craft this round added, air first. */
const CRAFT: readonly PropName[] = [...AIRCRAFT_PROP_NAMES, ...SHIP_PROP_NAMES];

/** The param corners worth walking: the two craft that take a length. */
const PARAM_CASES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  runway: [{}, { length: 12 }, { length: 64 }],
  drydock: [{}, { length: 16 }, { length: 64 }],
};

function casesFor(prop: PropName): readonly Record<string, unknown>[] {
  return PARAM_CASES[prop] ?? [{}];
}

function opsOf(prop: PropName, params: Record<string, unknown> = {}, seed = SEED): LocalVoxelOp[] {
  return generateProp({ prop, seed, params }).ops;
}

/** Blocks that are not full cubes and so cannot carry a support chain. */
const NOT_SOLID = /(_slab|_stairs|_fence|_wall|_pane|iron_bars|lantern|_trapdoor|torch|rail)$/;

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

describe("the geometry primitives", () => {
  it("answers the ellipse in integers, and nothing outside it", () => {
    expect(ellipseRadius(0, 20, 6)).toBe(6);
    expect(ellipseRadius(20, 20, 6)).toBe(0);
    expect(ellipseRadius(21, 20, 6)).toBe(-1);
    // Monotone from the middle out: an envelope that bulges is not an ellipse.
    let previous = 7;
    for (let dx = 0; dx <= 20; dx++) {
      const r = ellipseRadius(dx, 20, 6);
      expect(r).toBeLessThanOrEqual(previous);
      previous = r;
    }
  });

  it("draws a ring that closes at the corners", () => {
    for (let r = 1; r <= 6; r++) {
      const ring = ringCells(r);
      const cells = new Set(ring.map((c) => `${c.dy},${c.dz}`));
      // Every ring cell has a ring neighbour across a face — the property that
      // a four-neighbour erosion of an octagon does *not* have.
      for (const c of ring) {
        const touching =
          cells.has(`${c.dy - 1},${c.dz}`) ||
          cells.has(`${c.dy + 1},${c.dz}`) ||
          cells.has(`${c.dy},${c.dz - 1}`) ||
          cells.has(`${c.dy},${c.dz + 1}`);
        expect(touching, `r=${r} at ${c.dy},${c.dz}`).toBe(true);
      }
      expect(ring.length).toBeLessThanOrEqual(octaDisc(r).length);
    }
  });

  it("fills a bulkhead exactly where the section steps", () => {
    expect(bulkheadCells(3, 3)).toEqual([]);
    const step = bulkheadCells(2, 3);
    expect(step.length).toBe(octaDisc(3).length - octaDisc(2).length);
    // …and it touches the smaller ring, which is the point of drawing it.
    const inner = new Set(ringCells(2).map((c) => `${c.dy},${c.dz}`));
    expect(
      step.some(
        (c) =>
          inner.has(`${c.dy - 1},${c.dz}`) ||
          inner.has(`${c.dy + 1},${c.dz}`) ||
          inner.has(`${c.dy},${c.dz - 1}`) ||
          inner.has(`${c.dy},${c.dz + 1}`),
      ),
    ).toBe(true);
  });

  it("never gives a hull a station with no beam", () => {
    const spec = { length: 46, half: 6, bow: 10, stern: 8 };
    for (let x = 0; x < spec.length; x++) {
      expect(hullHalfAt(spec, x), `station ${x}`).toBeGreaterThanOrEqual(1);
      expect(hullHalfAt(spec, x)).toBeLessThanOrEqual(spec.half);
    }
    expect(hullHalfAt(spec, 20)).toBe(spec.half);
  });
});

describe("every craft", () => {
  it("builds something substantial for each param case", () => {
    for (const prop of CRAFT) {
      for (const params of casesFor(prop)) {
        // The buoy is four blocks of float and a light; everything else here
        // is a vehicle, and a vehicle drawn in fifty blocks is a suggestion.
        expect(opsOf(prop, params).length, prop).toBeGreaterThan(prop === "buoy" ? 10 : 50);
      }
    }
  });

  it("stays inside the box it declared", () => {
    for (const prop of CRAFT) {
      for (const params of casesFor(prop)) {
        const declared = propFootprint(prop, params);
        // One matcher for the whole craft: `expect` per cell over a fleet this
        // size costs more than every generator in this file put together.
        const outside = opsOf(prop, params).filter(
          (op) =>
            op.x < 0 ||
            op.x >= declared.size[0] ||
            op.z < 0 ||
            op.z >= declared.size[2] ||
            op.y < declared.minY ||
            op.y >= declared.minY + declared.size[1],
        );
        expect(outside, `${prop} left its box`).toEqual([]);
      }
    }
  });

  it("touches all four sides of it, on every param case", () => {
    for (const prop of CRAFT) {
      for (const params of casesFor(prop)) {
        const declared = propFootprint(prop, params);
        const bounds = propBounds(opsOf(prop, params));
        expect(bounds.minX, prop).toBe(0);
        expect(bounds.minZ, prop).toBe(0);
        expect(bounds.size[0], prop).toBe(declared.size[0]);
        expect(bounds.size[2], prop).toBe(declared.size[2]);
      }
    }
  });

  it("is one connected object", () => {
    for (const prop of CRAFT) {
      const ops = opsOf(prop);
      expect(largestComponent(ops), `${prop} has a detached piece`).toBe(ops.length);
    }
  });

  it("is a pure function of its seed, params and materials", () => {
    const materials = assignMaterials(MATERIAL_THEMES[1] as never, 1, SEED)[0] as BuildingMaterials;
    for (const prop of CRAFT) {
      const a = generateProp({ prop, seed: SEED, materials });
      const b = generateProp({ prop, seed: SEED, materials });
      expect(a.ops, prop).toEqual(b.ops);
      expect(a.meta, prop).toEqual(b.meta);
    }
  });

  it("varies its cosmetics with the seed and its geometry with nothing", () => {
    // Same shape, different paint: the cell *set* is seed-independent even
    // where the block in a cell is not.
    for (const prop of CRAFT) {
      const a = opsOf(prop, {}, SEED);
      const b = opsOf(prop, {}, OTHER);
      expect(
        a.map((o) => `${o.x},${o.y},${o.z}`),
        prop,
      ).toEqual(b.map((o) => `${o.x},${o.y},${o.z}`));
    }
    // …and several craft actually reroll something. Both op lists are
    // generated once per craft: an airliner is fifteen hundred blocks, and a
    // comparison that regenerated it per block would be a minute of wall time.
    const differs = (prop: PropName): boolean => {
      const a = opsOf(prop, {}, SEED);
      const b = opsOf(prop, {}, OTHER);
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
});

describe("grounded craft", () => {
  const grounded = CRAFT.filter((p) => propFootprint(p, {}).base === "ground");

  it("covers the airliner, the freighter and the airfield", () => {
    expect(grounded).toContain("airliner");
    expect(grounded).toContain("cargo_plane");
    expect(grounded).toContain("drydock");
  });

  it("never writes below its base plane", () => {
    for (const prop of grounded) {
      for (const params of casesFor(prop)) {
        expect(propFootprint(prop, params).minY, prop).toBe(0);
      }
    }
  });

  it("stands on the ground rather than over it", () => {
    // Something has to be *at* y = 0 — the course resting on the apron — and
    // the craft has to be connected to it, which the connectedness test above
    // has already established for the whole op list.
    for (const prop of grounded) {
      const ops = opsOf(prop);
      expect(
        ops.filter((o) => o.y === 0).length,
        `${prop} has nothing touching the ground`,
      ).toBeGreaterThan(0);
    }
  });

  it("puts something solid under every fence and every standing lantern", () => {
    for (const prop of CRAFT) {
      const ops = opsOf(prop);
      const at = new Map(ops.map((o) => [`${o.x},${o.y},${o.z}`, o]));
      const base = propFootprint(prop, {}).base;
      for (const op of ops) {
        const standing =
          op.block.endsWith("_fence") ||
          (op.block.endsWith("lantern") && op.props?.["hanging"] !== "true");
        if (!standing) continue;
        // Walk the chain down: fence on fence on fence is fine, so long as the
        // bottom of it is a full block or the ground the prop stands on.
        let y = op.y - 1;
        let carried = false;
        while (y >= -1) {
          const below = at.get(`${op.x},${y},${op.z}`);
          if (below === undefined) {
            // Nothing of ours: the ground itself, but only at the base plane.
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
});

describe("floating craft", () => {
  const floating = CRAFT.filter((p) => propFootprint(p, {}).base === "water");

  it("covers the whole fleet", () => {
    expect(floating.length).toBe(SHIP_PROP_NAMES.length - 1); // all but the drydock
    expect(floating).toContain("galleon");
    expect(floating).toContain("buoy");
  });

  it("draws exactly one submerged course, and writes no air", () => {
    for (const prop of floating) {
      const ops = opsOf(prop);
      expect(Math.min(...ops.map((o) => o.y)), `${prop} draught`).toBe(-1);
      expect(ops.some((o) => o.block === "air"), prop).toBe(false);
      expect(ops.some((o) => o.block === "water"), prop).toBe(false);
    }
  });

  it("decks every column it submerges, so the hull is solid at the water line", () => {
    for (const prop of floating) {
      const ops = opsOf(prop);
      const deck = new Set(ops.filter((o) => o.y === 0).map((o) => `${o.x},${o.z}`));
      for (const op of ops.filter((o) => o.y === -1)) {
        expect(deck.has(`${op.x},${op.z}`), `${prop} at ${op.x},${op.z}`).toBe(true);
      }
    }
  });
});
