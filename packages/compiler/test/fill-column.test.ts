import { describe, expect, it } from "vitest";

import {
  WORLD_HEIGHT,
  WORLD_MIN_Y,
  loadPrismarine,
  runFillFallbackCount,
} from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";

/**
 * `fillColumn` writes a run by hand into `prismarine-chunk`'s bit array after
 * letting the first block of each section slice go through the public setter
 * (see the comment on the method). That is only safe while it produces exactly
 * what the naive per-block loop would have. Replay the same randomised script
 * of fills through both and compare every block of the column.
 *
 * The three baseline worlds shasum identical across the change, which is the
 * real gate; this is the cheap one that runs in CI and localises a break to
 * this method rather than to a world diff.
 */
describe("fillColumn's run-fill path", () => {
  it("writes exactly what a per-block loop writes", () => {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);

    // A deterministic script: runs that cross section boundaries, runs inside
    // one section, single-block runs, reversed bounds, air erasures, and a
    // spread of state ids wide enough to grow the palette past a bit-width
    // resize.
    let s = 0x9e3779b9;
    const rnd = (m: number): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) % m);
    const ops: Array<[number, number, number, number, number]> = [];
    for (let i = 0; i < 1200; i++) {
      ops.push([
        rnd(16),
        rnd(16),
        WORLD_MIN_Y + rnd(WORLD_HEIGHT),
        WORLD_MIN_Y + rnd(WORLD_HEIGHT),
        rnd(10) === 0 ? 0 : 1 + rnd(rnd(3) === 0 ? 400 : 12),
      ]);
    }

    const filled = stack.createChunk();
    const looped = stack.createChunk();
    for (const [x, z, y0, y1, stateId] of ops) {
      filled.fillColumn(x, z, y0, y1, stateId);
      const lo = y0 <= y1 ? y0 : y1;
      const hi = y0 <= y1 ? y1 : y0;
      for (let y = lo; y <= hi; y++) looped.setStateId(x, y, z, stateId);
    }

    const readAll = (c: typeof filled): string => {
      const out: number[] = [];
      for (let y = WORLD_MIN_Y; y < WORLD_MIN_Y + WORLD_HEIGHT; y++) {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) out.push(c.getBlockStateId(x, y, z));
        }
      }
      return out.join(",");
    };

    expect(readAll(filled)).toBe(readAll(looped));
  }, 60_000);

  /**
   * Kai's guard on the silent fallback: the run-fill path degrades to the
   * per-block setter if `prismarine-chunk`'s palette internals ever move, and
   * a real compile takes the fast path for *every* slice (2,580,152 slices /
   * 31,029,614 blocks on a 512x512 troy, zero fallbacks). Without this the
   * degradation would be invisible and cost ~300 ms a compile. So CI fails
   * loudly on a dependency bump while production keeps falling back quietly.
   */
  it("takes the fast path for every slice a real terrain fill produces", () => {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const chunk = stack.createChunk();
    const before = runFillFallbackCount();

    // The shape the terrain materializer actually writes: a deep stone body,
    // a subsurface band, a surface run and a fluid column, over every column
    // of the chunk — runs that cross section boundaries and grow the palette.
    const deepslate = 1;
    const stone = 2;
    const soil = 9;
    const water = 80;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const top = 60 + ((x * 7 + z * 13) % 24);
        chunk.fillColumn(x, z, WORLD_MIN_Y + 1, -8, deepslate);
        chunk.fillColumn(x, z, -7, top - 4, stone);
        chunk.fillColumn(x, z, top - 3, top, soil);
        if (top < 63) chunk.fillColumn(x, z, top + 1, 63, water);
      }
    }

    expect(runFillFallbackCount() - before).toBe(0);
  }, 60_000);
});
