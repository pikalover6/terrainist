/**
 * The multi-face growth fixup — faces derived against the **world**.
 *
 * `terrain/flora/parts.ts`'s `hangingFaces` derives a vine's attachment faces
 * from the plant's *own* block set, which is the §3.2 law and is right for what
 * that module can see. It is also, at composition time, incomplete: where two
 * plants interleave, the log or leaf that genuinely holds a strand belongs to
 * the *neighbour* plant, and where the emitter clips a plant against a
 * structure the support the derivation assumed is not there at all. Either way
 * the claimed face points at air, vanilla pops the block on the first block
 * update, and it renders until then as a flat plate in mid-air — the defect Kai
 * walked twice (`oldgrowth_vale-2` and `-3`) and rule 27
 * (`unsupported.multiface`) found 435 times on `flora-oldgrowth`.
 *
 * A face is a property of a **neighbourhood**, so — exactly like the connection
 * pass next door, and for exactly its reason — it is settled once, at the end,
 * when every block in the world exists. This pass re-derives each candidate
 * growth block's faces through the shared vocabulary (`growthFaces`, so there
 * is still one implementation of the three laws) with a `solid` predicate that
 * asks the composed world — terrain, ground cover, every plant, every
 * structure — rather than one plant's part table. A cell the composition leaves
 * with no legal face is **dropped** (set to air), which is what `parts.ts`
 * already does per-plant.
 *
 * Determinism: a pure function of the composed world. No RNG; the tiebreak is
 * `chooseGrowthFace`'s position hash; the only ordering is y-descending, which
 * is what makes a strand hand its one horizontal face downward.
 */

import { chooseGrowthFace, growthFaces, isMultifaceGrowth, ownGrowthFaces } from "@terrainist/stdlib";

import type { EmitChunk, PrismarineStack } from "./prismarine.js";

/** One position the fixup should look at. */
export interface GrowthCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What {@link applyGrowthFaces} changed. */
export interface GrowthFixupStats {
  /** Multi-face growth blocks examined (a candidate a later pass overwrote is not one). */
  readonly examined: number;
  /** Of those, blocks whose stored face set was wrong and has been rewritten. */
  readonly rewritten: number;
  /** Of those, blocks with no legal face after composition, removed. */
  readonly dropped: number;
}

/**
 * Re-derive the attachment faces of every candidate multi-face growth block
 * against the finished world.
 *
 * `candidates` is every position a pass wrote such a block at; a position whose
 * block is no longer growth (a structure won the column) is skipped.
 */
export function applyGrowthFaces(
  chunks: ReadonlyMap<string, EmitChunk>,
  candidates: Iterable<GrowthCell>,
  stack: PrismarineStack,
): GrowthFixupStats {
  const at = (x: number, y: number, z: number): number => {
    const chunk = chunks.get(`${x >> 4},${z >> 4}`);
    if (chunk === undefined) return 0;
    return chunk.getBlockStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16);
  };
  const setAt = (x: number, y: number, z: number, stateId: number): void => {
    const chunk = chunks.get(`${x >> 4},${z >> 4}`);
    if (chunk === undefined) return;
    chunk.setStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16, stateId);
  };

  const solidCache = new Map<number, boolean>();
  /**
   * The one predicate the derivation is built on, in the shape the shared
   * vocabulary asks for, and the *same* one rule 27 reads back off disk: is the
   * block at this cell a full cube. A vine is not, which is what keeps law 2's
   * `up` un-inheritable down a strand; a slab, a fence or a pane is not either,
   * which is the conservative-in-the-direction-that-removes reading.
   */
  const solid = (x: number, y: number, z: number): boolean => {
    const stateId = at(x, y, z);
    const cached = solidCache.get(stateId);
    if (cached !== undefined) return cached;
    const full = stack.isFullCube(stateId);
    solidCache.set(stateId, full);
    return full;
  };

  // Top-down, then by column, so a strand always sees a settled parent and the
  // order does not depend on how the candidates were collected.
  const cells = [...candidates];
  cells.sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z);

  /** The strand's canonical horizontal face, keyed by the cell that carries it. */
  const canonical = new Map<string, string>();
  /** Cells this pass has settled (and not dropped) — a chain ends at a dropped parent. */
  const kept = new Set<string>();

  let examined = 0;
  let rewritten = 0;
  let dropped = 0;
  const seen = new Set<string>();

  for (const cell of cells) {
    const k = `${cell.x},${cell.y},${cell.z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const stateId = at(cell.x, cell.y, cell.z);
    const decoded = stack.blockStateProps(stateId);
    if (decoded === undefined || !isMultifaceGrowth(decoded.name)) continue;
    examined++;

    const above = { x: cell.x, y: cell.y + 1, z: cell.z };
    const aboveKey = `${above.x},${above.y},${above.z}`;
    const aboveDecoded = stack.blockStateProps(at(above.x, above.y, above.z));
    let strandFace: string | undefined;
    if (aboveDecoded !== undefined && aboveDecoded.name === decoded.name) {
      // A dropped parent hands down nothing; the chain ends with it.
      if (!kept.has(aboveKey)) {
        // Unless the parent is not ours to settle (another pass placed it and
        // it stands): then its own stored face is the honest thing to carry.
        if (seen.has(aboveKey)) {
          // ours, and dropped
          strandFace = undefined;
        } else {
          for (const face of ["north", "south", "west", "east"]) {
            if (aboveDecoded.props[face] === "true") {
              strandFace = face;
              break;
            }
          }
        }
      } else {
        strandFace = canonical.get(aboveKey);
      }
    }
    const site = { x: cell.x, y: cell.y, z: cell.z };
    if (strandFace === undefined) {
      const own = ownGrowthFaces(site, solid);
      if (own.length > 0) strandFace = chooseGrowthFace(own, site);
    }

    const props = growthFaces(site, solid, strandFace);
    if (props === null) {
      // No legal face after composition — the same refusal `parts.ts` makes.
      setAt(cell.x, cell.y, cell.z, 0);
      dropped++;
      continue;
    }
    if (strandFace !== undefined) canonical.set(k, strandFace);
    kept.add(k);
    const merged: Record<string, string> = { ...decoded.props };
    let differs = false;
    for (const [name, value] of Object.entries(props)) {
      if (!Object.hasOwn(merged, name)) continue;
      if (merged[name] !== value) differs = true;
      merged[name] = value;
    }
    if (!differs) continue;
    const next = stack.blockStateOf(decoded.name, merged);
    if (next === undefined || next === stateId) continue;
    setAt(cell.x, cell.y, cell.z, next);
    rewritten++;
  }

  return { examined, rewritten, dropped };
}
