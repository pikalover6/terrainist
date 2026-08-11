/**
 * **Flora support, settled against the composed world** — `emit/flora-settle.ts`.
 *
 * The defect the pass exists for, measured on `p4-c2/overgrown_hideout` (a
 * `decline: 0.90` metropolis): ten leaves with air on all six faces, every one
 * of them `floating.isolated` (physics rule 13). The emitter's per-tree
 * orphan-leaf sweep had already run and kept them, because in the *tree's* own
 * model each still had a neighbour — the trunk block that the structure layer's
 * air writes (a ruined shell's interior clear) then erased, hundreds of
 * thousands of blocks later in the same emit.
 *
 * So the assertions here are about *when* the question is asked, not about
 * trees: a cell the plan says is held and the world says is not must lose, and
 * the pass must never touch a block that is not its own.
 */

import { describe, expect, it } from "vitest";

import { settleFloraSupport, type FloraCell } from "../src/emit/flora-settle.js";
import { loadPrismarine, type EmitChunk, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";

const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);

const LEAVES = stack.blockStateOf("oak_leaves", {
  distance: "2",
  persistent: "false",
  waterlogged: "false",
}) as number;
const LOG = stack.blockStateOf("oak_log", { axis: "y" }) as number;
const STONE = stack.blockStateOf("stone", {}) as number;
const VINE = stack.blockStateOf("vine", {
  north: "false",
  south: "true",
  east: "false",
  west: "false",
  up: "false",
}) as number;

/**
 * One chunk's worth of world, as a map — enough for a pass whose whole contract
 * is "read the composed world, write air".
 */
function world(): { chunks: Map<string, EmitChunk>; cells: Map<string, number> } {
  const cells = new Map<string, number>();
  const chunk = {
    getBlockStateId: (x: number, y: number, z: number): number => cells.get(`${x},${y},${z}`) ?? 0,
    setStateId: (x: number, y: number, z: number, stateId: number): void => {
      cells.set(`${x},${y},${z}`, stateId);
    },
  } as unknown as EmitChunk;
  return { chunks: new Map([["0,0", chunk]]), cells };
}

/** Write a block and return the flora cell that claims it. */
function put(
  w: ReturnType<typeof world>,
  x: number,
  y: number,
  z: number,
  stateId: number,
): FloraCell {
  w.cells.set(`${x},${y},${z}`, stateId);
  return { x, y, z, stateId };
}

function idAt(w: ReturnType<typeof world>, x: number, y: number, z: number): number {
  return w.cells.get(`${x},${y},${z}`) ?? 0;
}

describe("the stranded leaf (rule 13, on the composed world)", () => {
  it("drops a leaf whose only support the structure layer erased", () => {
    const w = world();
    // The tree as the flora pass wrote it: a trunk with one leaf on top.
    const trunk = put(w, 4, 90, 4, LOG);
    const leaf = put(w, 4, 91, 4, LEAVES);
    // The structure layer, stamped after: the shell's interior goes to air, and
    // the trunk goes with it. This is the erasure the per-tree sweep cannot see.
    w.cells.set("4,90,4", 0);

    const stats = settleFloraSupport(w.chunks, [trunk, leaf], stack);

    expect(stats.dropped).toBe(1);
    expect(idAt(w, 4, 91, 4)).toBe(0);
  });

  it("keeps a leaf a wall holds up, whoever wrote the wall", () => {
    const w = world();
    const leaf = put(w, 4, 91, 4, LEAVES);
    // Masonry beside it — not the tree's, and rule 13 does not care whose it is.
    w.cells.set("5,91,4", STONE);

    const stats = settleFloraSupport(w.chunks, [leaf], stack);

    expect(stats.dropped).toBe(0);
    expect(idAt(w, 4, 91, 4)).toBe(LEAVES);
  });

  it("one sweep is the fixpoint: a dropped cell was touching nothing", () => {
    // The proof, as a test. A pair of leaves left hanging in mid-air is not
    // rule 13's finding — each has a neighbour — and the pass must not invent
    // one by dropping the first and then finding the second stranded. So a
    // *single* sweep is correct however the cells are ordered: nothing this
    // pass removes was touching anything.
    const w = world();
    const trunk = put(w, 4, 90, 4, LOG);
    const lower = put(w, 4, 91, 4, LEAVES);
    const upper = put(w, 4, 92, 4, LEAVES);
    w.cells.set("4,90,4", 0);

    const stats = settleFloraSupport(w.chunks, [trunk, upper, lower], stack);

    expect(stats.dropped).toBe(0);
    expect(idAt(w, 4, 91, 4)).toBe(LEAVES);
    expect(idAt(w, 4, 92, 4)).toBe(LEAVES);
  });
});

describe("what the pass may not touch", () => {
  it("never removes a block another pass wrote over ours", () => {
    const w = world();
    const leaf = put(w, 4, 91, 4, LEAVES);
    // The structure layer won the cell — an isolated block here is that pass's
    // finding to answer for, not this one's to delete.
    w.cells.set("4,91,4", STONE);

    const stats = settleFloraSupport(w.chunks, [leaf], stack);

    expect(stats.dropped).toBe(0);
    expect(idAt(w, 4, 91, 4)).toBe(STONE);
  });

  it("leaves growth alone — a vine is not a full cube, and rule 13 skips it", () => {
    const w = world();
    const vine = put(w, 4, 91, 4, VINE);

    const stats = settleFloraSupport(w.chunks, [vine], stack);

    expect(stats.examined).toBe(0);
    expect(stats.dropped).toBe(0);
    expect(idAt(w, 4, 91, 4)).toBe(VINE);
  });

  it("moves nothing in a world where every cell is held", () => {
    const w = world();
    const cells: FloraCell[] = [];
    for (let y = 88; y <= 92; y++) cells.push(put(w, 4, y, 4, y < 91 ? LOG : LEAVES));
    w.cells.set("4,87,4", STONE);

    const stats = settleFloraSupport(w.chunks, cells, stack);

    expect(stats.dropped).toBe(0);
    expect(stats.examined).toBe(cells.length);
    for (const cell of cells) expect(idAt(w, cell.x, cell.y, cell.z)).toBe(cell.stateId);
  });
});
