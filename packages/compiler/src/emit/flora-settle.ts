/**
 * Flora support, settled against the **composed** world.
 *
 * A crown is written by the flora pass, which knows one tree at a time, and
 * then the structure layer is stamped over it — and the structure layer writes
 * *air*: a ruined shell's interior is cleared, a crumble takes a wall head out,
 * a program hollows a room. Air erases whatever was in the cell, including a
 * trunk the clip deliberately spared, and it does so **after** the emitter has
 * already decided which leaves have a neighbour to hang on to.
 *
 * `terrain/emit.ts`'s orphan-leaf sweep asks the right question at the wrong
 * time: it settles a clipped tree against the tree's own surviving cells, so a
 * leaf whose only support is a trunk block the decay is about to delete keeps
 * it, and the world on disk disagrees with the plan. Measured on the
 * high-decline metropolis (`p4-c2/overgrown_hideout`): **ten** leaves left
 * with air on all six faces, every one of them a `floating.isolated` finding
 * (physics rule 13) and every one of them a leaf whose support was erased by a
 * later air write.
 *
 * So the question is asked once more, here, where the answer cannot change
 * again: every cell the flora pass wrote is re-examined against the finished
 * chunks — terrain, ground cover, every plant and every structure — and a cell
 * that is still ours, is still a full cube and has air on all six faces is
 * removed. That is rule 13's own predicate, read off the same world the lint
 * reads, so there is no model left to disagree with.
 *
 * It is a pure function of the composed world and it removes only blocks that
 * would otherwise be findings — so a world with nothing stranded is
 * byte-identical to the one that compiled before this pass existed.
 *
 * Sibling of `growth-fixup.ts`, and for the same stated reason: attachment is a
 * property of a neighbourhood, not of the pass that wrote the block.
 */

import type { EmitChunk, PrismarineStack } from "./prismarine.js";

/** One cell the flora pass wrote, and the state it wrote there. */
export interface FloraCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * The state the flora pass wrote. A cell whose block is no longer this one
   * belongs to whichever pass overwrote it — the settling never touches
   * somebody else's block, only its own.
   */
  readonly stateId: number;
}

/** What {@link settleFloraSupport} changed. */
export interface FloraSettleStats {
  /** Flora cells still standing after composition (a cell a structure won is not one). */
  readonly examined: number;
  /** Of those, cells with air on all six faces after composition, removed. */
  readonly dropped: number;
}

/** The six faces a cell can be held by. */
const FACES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const AIR = new Set(["air", "cave_air", "void_air"]);

/**
 * Remove every flora cell the composed world leaves with air on all six faces.
 *
 * `cells` is every position the flora pass wrote; a cell whose block a later
 * pass overwrote is skipped, because it is that pass's block now.
 */
export function settleFloraSupport(
  chunks: ReadonlyMap<string, EmitChunk>,
  cells: Iterable<FloraCell>,
  stack: PrismarineStack,
): FloraSettleStats {
  // One-entry chunk cache: flora cells arrive in tree order, so the same chunk
  // answers a whole crown's worth of lookups.
  let cachedKey = "";
  let cachedChunk: EmitChunk | undefined;
  const chunkAt = (x: number, z: number): EmitChunk | undefined => {
    const key = `${x >> 4},${z >> 4}`;
    if (key !== cachedKey) {
      cachedKey = key;
      cachedChunk = chunks.get(key);
    }
    return cachedChunk;
  };
  const at = (x: number, y: number, z: number): number => {
    const chunk = chunkAt(x, z);
    if (chunk === undefined) return 0;
    return chunk.getBlockStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16);
  };

  const airCache = new Map<number, boolean>();
  /**
   * A cell outside the emitted chunks counts as air, which is the conservative
   * reading: a leaf hanging off the edge of the region has nothing holding it
   * there either. State id 0 is `minecraft:air`, so one lookup answers both.
   */
  const isAir = (stateId: number): boolean => {
    const cached = airCache.get(stateId);
    if (cached !== undefined) return cached;
    const decoded = stack.blockStateProps(stateId);
    const air = decoded === undefined || AIR.has(decoded.name);
    airCache.set(stateId, air);
    return air;
  };
  const fullCache = new Map<number, boolean>();
  const isFull = (stateId: number): boolean => {
    const cached = fullCache.get(stateId);
    if (cached !== undefined) return cached;
    const full = stack.isFullCube(stateId);
    fullCache.set(stateId, full);
    return full;
  };
  /** Still the flora pass's own block, and still a block rule 13 reads. */
  const ours = (cell: FloraCell): boolean =>
    at(cell.x, cell.y, cell.z) === cell.stateId && isFull(cell.stateId);

  let examined = 0;
  let dropped = 0;

  /** Air on all six faces — physics rule 13's predicate, on the composed world. */
  const stranded = (cell: FloraCell): boolean => {
    for (const [dx, dy, dz] of FACES) {
      if (!isAir(at(cell.x + dx, cell.y + dy, cell.z + dz))) return false;
    }
    return true;
  };
  const drop = (cell: FloraCell): void => {
    const chunk = chunkAt(cell.x, cell.z);
    chunk?.setStateId(cell.x - ((cell.x >> 4) * 16), cell.y, cell.z - ((cell.z >> 4) * 16), 0);
    dropped++;
  };

  // One sweep, in emission order, over every cell that is still ours and is a
  // full cube — a vine or a sapling is not one, and rule 13 does not read it.
  //
  // **One sweep is the fixpoint**, and the proof is the predicate: a cell this
  // pass removes had air on all six faces, so nothing was touching it, so no
  // other cell loses a neighbour when it goes. (The face *states* of a strand
  // beside it do change, which is why `applyGrowthFaces` runs after this — and
  // why the caller settles the two against each other when that pass drops
  // something in turn.)
  for (const cell of cells) {
    if (!ours(cell)) continue;
    examined++;
    if (!stranded(cell)) continue;
    drop(cell);
  }

  return { examined, dropped };
}
