/**
 * Multi-rect footprints — the L and the T.
 *
 * Three families of property, and the order they are in is the order they
 * matter in:
 *
 * 1. **The rect case did not move.** A wing generalizes the outline tracer, the
 *    facade, the roof and the eave course, and the only acceptable effect of
 *    that on a plain rectangular building is *none* — byte for byte, op for op.
 *    Everything else here is worth nothing if this fails.
 * 2. **The union is a building.** Its outline closes, its normals point out, it
 *    is roofed everywhere including over the valley, and its two rooms are one
 *    room.
 * 3. **It survives rotation**, in all four yaws, because the solver will turn it.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_STYLE_DEFAULTS,
  MIN_WING_DEPTH,
  MIN_WING_OVERLAP,
  cardinalStep,
  checkWing,
  footprintCovers,
  generateBuilding,
  inRect,
  nodeSeed,
  outlineIndex,
  resolveFootprint,
  rotateCells,
  rotateLocalColumn,
  rotateOps,
  traceShell,
  type BuildingWing,
  type Cardinal,
  type LocalVoxelOp,
  type StructureYaw,
} from "../src/index.js";

const SEED = nodeSeed(0x5eedn, "world.ell");
const YAWS: readonly StructureYaw[] = [0, 90, 180, 270];
const PINNED: Readonly<Record<string, string>> = Object.freeze({ ...BUILDING_STYLE_DEFAULTS });

const SIDES: readonly Cardinal[] = ["north", "east", "south", "west"];

/** The exhibit envelope, and the two plans the dev world shows. */
const BOX: readonly [number, number, number] = [13, 9, 13];

function ell(side: Cardinal): BuildingWing {
  const alongX = side === "north" || side === "south";
  return { size: alongX ? [5, 4] : [4, 5], side, offset: 0 };
}

function tee(side: Cardinal): BuildingWing {
  const alongX = side === "north" || side === "south";
  return { size: alongX ? [5, 4] : [4, 5], side, offset: 4 };
}

function build(wing: BuildingWing | undefined, extra: Record<string, unknown> = {}) {
  return generateBuilding({
    size: BOX,
    params: { floors: 1, roof: "gable", ...(wing === undefined ? {} : { wing }) },
    seed: SEED,
    foundationDepth: 2,
    style: PINNED,
    ...extra,
  });
}

function key(op: { x: number; y: number; z: number }): string {
  return `${op.x},${op.y},${op.z}`;
}

/* -------------------------------------------------------------------------- */
/* 1 — the rect fast path                                                      */
/* -------------------------------------------------------------------------- */

describe("footprints — the rect fast path", () => {
  it("resolves a wingless request to the whole bounding box", () => {
    const fp = resolveFootprint(9, 7);
    expect(fp.wing).toBeNull();
    expect(fp.main).toEqual({ x0: 0, z0: 0, x1: 8, z1: 6 });
    for (let z = 0; z < 7; z++) {
      for (let x = 0; x < 9; x++) expect(footprintCovers(fp, x, z)).toBe(true);
    }
    expect(footprintCovers(fp, -1, 0)).toBe(false);
    expect(footprintCovers(fp, 9, 0)).toBe(false);
  });

  it("traces a rect's shell to the same ring, interior and normals as the old inline rules", () => {
    for (const [sx, sz] of [
      [3, 3],
      [7, 9],
      [13, 11],
    ] as const) {
      const shell = traceShell(resolveFootprint(sx, sz));
      expect(shell.cells).toHaveLength(sx * sz);
      // The ring is the box perimeter, in (z, x) order.
      const expected: { x: number; z: number }[] = [];
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          if (x === 0 || x === sx - 1 || z === 0 || z === sz - 1) expected.push({ x, z });
        }
      }
      expect(shell.ring.map((c) => ({ x: c.x, z: c.z }))).toEqual(expected);
      // The interior is 1..sx-2 × 1..sz-2.
      expect(shell.interiorCells.every((c) => c.x > 0 && c.x < sx - 1 && c.z > 0 && c.z < sz - 1)).toBe(true);
      expect(shell.interiorCells).toHaveLength(Math.max(0, sx - 2) * Math.max(0, sz - 2));
      for (const cell of shell.ring) {
        const isCorner = (cell.x === 0 || cell.x === sx - 1) && (cell.z === 0 || cell.z === sz - 1);
        expect(cell.corner).toBe(isCorner);
        expect(cell.alongX).toBe(cell.z === 0 || cell.z === sz - 1);
        const outward =
          cell.z === 0 ? "north" : cell.z === sz - 1 ? "south" : cell.x === 0 ? "west" : "east";
        expect(cell.outward).toBe(outward);
      }
    }
  });

  it("is byte-identical to a wingless build when the wing is refused", () => {
    // Every rejection reason, each of which must fall back to the pure rect and
    // therefore to exactly the ops the pre-wing grammar emitted.
    const refused: readonly BuildingWing[] = [
      { size: [2, 4], side: "south", offset: 0 }, // run too short
      { size: [5, 2], side: "south", offset: 0 }, // too shallow
      { size: [5, 12], side: "south", offset: 0 }, // eats the main block
      { size: [5, 4], side: "south", offset: 11 }, // overhangs
      { size: [5.5, 4], side: "south", offset: 0 }, // not integral
    ];
    const plain = JSON.stringify(build(undefined).ops);
    for (const wing of refused) {
      expect(checkWing(BOX[0], BOX[2], wing)).not.toBeNull();
      expect(JSON.stringify(build(wing).ops)).toBe(plain);
    }
  });

  it("names the reason a wing is refused", () => {
    expect(checkWing(13, 13, { size: [2, 4], side: "south", offset: 0 })).toBe("overlap_too_short");
    expect(checkWing(13, 13, { size: [5, 2], side: "south", offset: 0 })).toBe("wing_too_shallow");
    expect(checkWing(13, 13, { size: [5, 12], side: "south", offset: 0 })).toBe("main_too_shallow");
    expect(checkWing(13, 13, { size: [5, 4], side: "south", offset: 9 })).toBe("overhangs");
    expect(checkWing(13, 13, { size: [5, 4], side: "south", offset: -1 })).toBe("overhangs");
    expect(checkWing(13, 13, { size: [Number.NaN, 4], side: "south", offset: 0 })).toBe("not_finite");
    expect(checkWing(13, 13, ell("south"))).toBeNull();
    // The smallest wing that is still a wing: the minimum run and the minimum
    // depth, which on an east/west side means `size` reads [depth, run].
    expect(
      checkWing(13, 13, { size: [MIN_WING_DEPTH, MIN_WING_OVERLAP], side: "west", offset: 0 }),
    ).toBeNull();
    expect(
      checkWing(13, 13, { size: [MIN_WING_DEPTH, MIN_WING_OVERLAP - 1], side: "west", offset: 0 }),
    ).toBe("overlap_too_short");
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — the union                                                               */
/* -------------------------------------------------------------------------- */

/** Every plan the suite exercises: L and T, on all four sides. */
const PLANS: readonly { label: string; wing: BuildingWing }[] = [
  ...SIDES.map((s) => ({ label: `L/${s}`, wing: ell(s) })),
  ...SIDES.map((s) => ({ label: `T/${s}`, wing: tee(s) })),
];

describe("footprints — the traced union", () => {
  it("stays inside the bounding box and covers less of it than a rect", () => {
    for (const { label, wing } of PLANS) {
      const fp = resolveFootprint(BOX[0], BOX[2], wing);
      expect(fp.wing, label).not.toBeNull();
      const shell = traceShell(fp);
      expect(shell.cells.length, label).toBeLessThan(BOX[0] * BOX[2]);
      for (const c of shell.cells) {
        expect(c.x >= 0 && c.x < BOX[0] && c.z >= 0 && c.z < BOX[2], label).toBe(true);
      }
      // The two rects share exactly one row/column: the main block's wall line.
      const shared = shell.cells.filter(
        (c) => inRect(fp.main, c.x, c.z) && inRect(fp.wing as never, c.x, c.z),
      );
      expect(shared.length, label).toBe(Math.max(...wing.size) === 5 ? 5 : 5);
    }
  });

  it("closes the outline: every ring cell has a blocked side or a missing diagonal", () => {
    for (const { label, wing } of PLANS) {
      const fp = resolveFootprint(BOX[0], BOX[2], wing);
      const shell = traceShell(fp);
      for (const cell of shell.ring) {
        const covered = footprintCovers(fp, cell.x, cell.z);
        expect(covered, label).toBe(true);
        // Blocked sides are genuinely outside; the normal is one of them.
        for (const dir of cell.blocked) {
          const [dx, dz] = cardinalStep(dir);
          expect(footprintCovers(fp, cell.x + dx, cell.z + dz), `${label} ${dir}`).toBe(false);
        }
        if (cell.blocked.length === 0) {
          // A reflex corner: cardinally enclosed, diagonally not, and a post.
          expect(cell.corner, label).toBe(true);
        } else {
          expect(cell.blocked).toContain(cell.outward);
        }
      }
      // ...and the interior is genuinely enclosed, all eight ways.
      for (const cell of shell.interiorCells) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            expect(footprintCovers(fp, cell.x + dx, cell.z + dz), label).toBe(true);
          }
        }
      }
      // Ring and interior partition the cells.
      expect(shell.ring.length + shell.interiorCells.length, label).toBe(shell.cells.length);
    }
  });

  it("gives an L exactly one reflex corner and a T exactly two", () => {
    for (const side of SIDES) {
      const reflex = (wing: BuildingWing): number =>
        traceShell(resolveFootprint(BOX[0], BOX[2], wing)).ring.filter((c) => c.blocked.length === 0)
          .length;
      expect(reflex(ell(side)), `L/${side}`).toBe(1);
      expect(reflex(tee(side)), `T/${side}`).toBe(2);
    }
  });

  it("leaves a doorway between the two rooms", () => {
    for (const { label, wing } of PLANS) {
      const fp = resolveFootprint(BOX[0], BOX[2], wing);
      const shell = traceShell(fp);
      // Interior cells on the shared line: the opening. At least one, because
      // the shared run is MIN_WING_OVERLAP long and its two ends are posts.
      const opening = shell.interiorCells.filter(
        (c) => inRect(fp.main, c.x, c.z) && inRect(fp.wing as never, c.x, c.z),
      );
      expect(opening.length, label).toBeGreaterThanOrEqual(1);
    }
  });

  it("builds walls on the outline and floor in the interior, and nothing in the notch", () => {
    for (const { label, wing } of PLANS) {
      const result = build(wing);
      const fp = result.meta.footprint;
      const shell = traceShell(fp);
      const ring = outlineIndex(shell);
      const byCell = new Map(result.ops.map((o) => [key(o), o] as const));
      // A wall course at y = 2 over every non-door outline cell...
      for (const cell of shell.ring) {
        expect(byCell.has(`${cell.x},2,${cell.z}`), `${label} wall ${cell.x},${cell.z}`).toBe(true);
      }
      // ...floor under every interior cell...
      for (const cell of shell.interiorCells) {
        expect(byCell.get(`${cell.x},0,${cell.z}`)?.block, `${label} floor`).toBe(
          PINNED["floor.interior"],
        );
      }
      // ...and nothing structural standing in the notch. Apron decorations may
      // reach one cell in, so only y >= 1 columns count as structure.
      for (let z = 0; z < BOX[2]; z++) {
        for (let x = 0; x < BOX[0]; x++) {
          if (footprintCovers(fp, x, z)) continue;
          const wall = result.ops.filter((o) => o.x === x && o.z === z && o.y >= 1 && o.y <= 4);
          for (const op of wall) {
            // Only eave/shutter/lamp-class decorations, never wall or floor.
            expect(op.block, `${label} notch ${x},${z}`).not.toBe(PINNED["wall.primary"]);
            expect(op.block, `${label} notch ${x},${z}`).not.toBe(PINNED["floor.interior"]);
          }
        }
      }
      expect(ring.size).toBe(shell.ring.length);
    }
  });

  it("roofs every cell of the union, valley included", () => {
    for (const { label, wing } of PLANS) {
      for (const roof of ["gable", "hip", "flat"] as const) {
        const result = generateBuilding({
          size: BOX,
          params: { floors: 1, roof, wing },
          seed: SEED,
          foundationDepth: 2,
          style: PINNED,
        });
        const { wallTop } = result.meta;
        const covered = new Set(
          result.ops.filter((o) => o.y > wallTop).map((o) => `${o.x},${o.z}`),
        );
        for (const cell of result.meta.cells) {
          expect(covered.has(`${cell.x},${cell.z}`), `${label}/${roof} ${cell.x},${cell.z}`).toBe(true);
        }
      }
    }
  });

  it("clips the wing's roof out of the main block's volume", () => {
    // The valley: the wing's gable is emitted over the wing rect and every op
    // of it that lands over the main block is dropped, so the main roof — which
    // was there first, over its own rect — is what stands there, untouched.
    //
    // The reference is therefore a *wingless building the size of the main
    // rect*, not the wingless build of the whole envelope: a wing shrinks the
    // main block, and the main block's roof is the roof of the block it covers.
    const wing = ell("south");
    const withWing = build(wing);
    const fp = withWing.meta.footprint;
    const mainOnly = generateBuilding({
      size: [fp.main.x1 - fp.main.x0 + 1, BOX[1], fp.main.z1 - fp.main.z0 + 1],
      params: { floors: 1, roof: "gable" },
      seed: SEED,
      foundationDepth: 2,
      style: PINNED,
    });
    expect(mainOnly.meta.wallTop).toBe(withWing.meta.wallTop);
    const band = (r: typeof withWing): Map<string, string> => {
      const out = new Map<string, string>();
      for (const op of r.ops) {
        if (op.y < r.meta.roofBase || op.y > mainOnly.meta.roofTop) continue;
        if (!inRect(fp.main, op.x, op.z)) continue;
        // The chimney is a wall feature, not a roof one, and it is drawn from a
        // different stage; it is not what this test is about.
        if (op.block === PINNED["chimney.block"] || op.block === PINNED["chimney.rim"]) continue;
        if (op.block === "campfire") continue;
        out.set(key(op), op.block);
      }
      return out;
    };
    expect(band(withWing)).toEqual(band(mainOnly));
    // ...and the wing is still roofed over its own half, outside the main rect.
    const wingRoof = withWing.ops.filter(
      (o) => o.y >= withWing.meta.roofBase && !inRect(fp.main, o.x, o.z),
    );
    expect(wingRoof.length).toBeGreaterThan(0);
  });

  it("spans both rects with floor and light", () => {
    for (const { label, wing } of PLANS) {
      const result = build(wing, { params: { floors: 2, roof: "gable", wing } });
      const fp = result.meta.footprint;
      const wingFloor = result.meta.floorCells.filter((c) => !inRect(fp.main, c.x, c.z));
      expect(wingFloor.length, label).toBeGreaterThan(0);
      // Every floor cell of both rects has a plane under it and a ceiling over.
      const byCell = new Set(result.ops.map(key));
      for (const c of result.meta.floorCells) {
        expect(byCell.has(`${c.x},0,${c.z}`), `${label} plane`).toBe(true);
        expect(byCell.has(`${c.x},${result.meta.wallTop},${c.z}`), `${label} ceiling`).toBe(true);
      }
      // The wing is lit: at least one lantern stands over its half of the plan.
      const lanterns = result.ops.filter(
        (o) => o.block === PINNED["light.lantern"] && !inRect(fp.main, o.x, o.z),
      );
      expect(lanterns.length, `${label} light`).toBeGreaterThan(0);
    }
  });

  it("puts the door on a wall that exists, whatever face the port names", () => {
    for (const { label, wing } of PLANS) {
      for (const face of SIDES) {
        const result = build(wing, {
          params: { floors: 1, roof: "gable", wing },
          door: { face, at: "center" as const },
        });
        const door = result.meta.door;
        expect(door, `${label} ${face}`).not.toBeNull();
        const d = door as { x: number; z: number; face: Cardinal };
        expect(d.face).toBe(face);
        expect(footprintCovers(result.meta.footprint, d.x, d.z), `${label} ${face}`).toBe(true);
        // ...and it opens outward: the cell it faces is outside the footprint.
        const [dx, dz] = cardinalStep(face);
        expect(footprintCovers(result.meta.footprint, d.x + dx, d.z + dz), `${label} ${face}`).toBe(
          false,
        );
      }
    }
  });

  it("keeps exactly one op per cell and canonical order", () => {
    for (const { label, wing } of PLANS) {
      const ops = build(wing).ops;
      expect(new Set(ops.map(key)).size, label).toBe(ops.length);
      const sorted = [...ops].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
      expect(ops, label).toEqual(sorted);
    }
  });

  it("is deterministic", () => {
    for (const { wing } of PLANS) {
      expect(JSON.stringify(build(wing).ops)).toBe(JSON.stringify(build(wing).ops));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3 — rotation                                                                */
/* -------------------------------------------------------------------------- */

describe("footprints — rotation", () => {
  it("rotates the cell claim exactly as it rotates the ops", () => {
    for (const { label, wing } of PLANS) {
      const result = build(wing);
      for (const yaw of YAWS) {
        const cells = new Set(
          rotateCells(result.meta.cells, yaw, BOX[0], BOX[2]).map((c) => `${c.x},${c.z}`),
        );
        expect(cells.size, `${label}@${yaw}`).toBe(result.meta.cells.length);
        // Every structural op lands on a claimed column. Apron decorations do
        // not, by design, so they are excluded the way the emit pass excludes
        // them: y >= 1 and inside the rotated box.
        const rotated = rotateOps(result.ops, yaw, BOX[0], BOX[2]);
        for (const op of rotated as readonly LocalVoxelOp[]) {
          if (op.x < 0 || op.z < 0 || op.x >= BOX[0] || op.z >= BOX[2]) continue;
          const claimed = cells.has(`${op.x},${op.z}`);
          if (!claimed) {
            // Only apron-class decorations may sit over the notch.
            expect(op.block, `${label}@${yaw} ${op.x},${op.z} ${op.block}`).not.toBe(
              PINNED["wall.primary"],
            );
          }
        }
      }
    }
  });

  it("agrees with rotateLocalColumn cell for cell", () => {
    const result = build(ell("south"));
    for (const yaw of YAWS) {
      const got = rotateCells(result.meta.cells, yaw, BOX[0], BOX[2]);
      const want = result.meta.cells
        .map((c) => rotateLocalColumn(c.x, c.z, BOX[0], BOX[2], yaw))
        .sort((a, b) => a.z - b.z || a.x - b.x);
      expect(got).toEqual(want);
    }
  });

  it("turns an L into the same L four times over", () => {
    // The claim's *shape* is a rotation invariant: same cell count at every yaw,
    // and four quarter turns compose back to the plan you started with.
    const result = build(ell("east"));
    const base = new Set(result.meta.cells.map((c) => `${c.x},${c.z}`));
    let cells = result.meta.cells;
    for (const yaw of [90, 90, 90, 90] as const) {
      cells = rotateCells(cells, yaw, BOX[0], BOX[2]);
      expect(cells).toHaveLength(result.meta.cells.length);
    }
    expect(new Set(cells.map((c) => `${c.x},${c.z}`))).toEqual(base);
  });

  it("carries a wing's props round with it", () => {
    // A shutter or a window box on the wing's own wall must rotate like any
    // other prop: coordinates and direction-bearing properties together.
    const result = build(tee("south"));
    const fp = result.meta.footprint;
    const wingProps = result.ops.filter(
      (o) => o.props?.["facing"] !== undefined && !inRect(fp.main, o.x, o.z),
    );
    expect(wingProps.length).toBeGreaterThan(0);
    for (const yaw of YAWS) {
      const rotated = rotateOps(result.ops, yaw, BOX[0], BOX[2]);
      expect(rotated).toHaveLength(result.ops.length);
      expect(new Set(rotated.map(key)).size).toBe(rotated.length);
    }
  });
});
