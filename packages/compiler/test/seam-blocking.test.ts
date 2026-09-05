/**
 * A kerb is a step, not a wall (`SEAM_BLOCK_MIN_DROP`).
 *
 * The block election prices one kerb atom per pristine contour on gently
 * rolling ground, and every platform seam used to go into `blocked` before
 * `blocksOf` — so a grid quarter on a shelf was cut into a kerb-bounded mosaic
 * and no terrace run survived it (the r5 metropolis: 68 → 45 terraces,
 * `docs/decks/anchors/METROPOLIS-R5-BISECTION-2026-08-25.md`). These tests pin
 * the one gate both consumers of that mask ask: a seam bounds a block only when
 * it drops at least the constant, and a one-block seam never does.
 *
 * The fixture is a `GroundLevels` built by hand — two platforms side by side —
 * run through the real `levelSeams`, so the seam the gate is asked about is the
 * seam the compiler would produce, `drop` and `treatment` included.
 */

import { describe, expect, it } from "vitest";

import { SEAM_BLOCK_MIN_DROP, boundingSeams } from "../src/layout/district-blocks.js";
import { NO_PLATFORM, levelSeams, type GroundLevels } from "../src/layout/levels.js";

/**
 * A 20×12 field: platform 0 on the west half, platform 1 on the east half, at
 * the heights given; one row of natural ground (no platform) along the south
 * edge so the seam is the only place two platforms touch. Eleven cells of
 * seam — longer than the run `absorbShortSeams` takes out of the list, so the
 * seam the gate is asked about is one the compiler would actually serve.
 */
const WIDTH = 20;
const DEPTH = 12;
function twoPlatforms(westY: number, eastY: number): GroundLevels {
  const bounds = { x0: 0, z0: 0, x1: WIDTH - 1, z1: DEPTH - 1 };
  const index = new Int32Array(WIDTH * DEPTH).fill(NO_PLATFORM);
  for (let z = 0; z < DEPTH - 1; z++) {
    for (let x = 0; x < WIDTH; x++) index[z * WIDTH + x] = x < WIDTH / 2 ? 0 : 1;
  }
  return {
    bounds,
    index,
    levelY: [westY, eastY],
    runs: [
      [{ x0: 0, z0: 0, x1: WIDTH / 2 - 1, z1: DEPTH - 2 }],
      [{ x0: WIDTH / 2, z0: 0, x1: WIDTH - 1, z1: DEPTH - 2 }]
    ],
    at(x, z) {
      if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return NO_PLATFORM;
      return index[(z - bounds.z0) * WIDTH + (x - bounds.x0)] as number;
    }
  };
}

describe("a kerb is a step, not a wall", () => {
  it("ships at two: a one-block seam bounds no block, a two-block seam does", () => {
    expect(SEAM_BLOCK_MIN_DROP).toBe(2);
  });

  it("lets the real seam list say what a one-block drop is, and then does not bound on it", () => {
    const seams = levelSeams(twoPlatforms(70, 71));
    expect(seams).toHaveLength(1);
    expect(seams[0]?.drop).toBe(1);
    expect(seams[0]?.treatment).toBe("kerb");
    expect(boundingSeams(seams)).toHaveLength(0);
  });

  it("bounds on a two-block drop, which is the first drop that stands a wall", () => {
    const seams = levelSeams(twoPlatforms(70, 72));
    expect(seams).toHaveLength(1);
    expect(seams[0]?.drop).toBe(2);
    expect(seams[0]?.treatment).not.toBe("kerb");
    expect(boundingSeams(seams)).toEqual(seams);
  });

  it("keeps every seam at or above the constant and drops every one below it, in order", () => {
    const seams = [
      ...levelSeams(twoPlatforms(70, 71)),
      ...levelSeams(twoPlatforms(70, 72)),
      ...levelSeams(twoPlatforms(70, 78))
    ];
    // Not vacuous: three seams in, or the filter is being asked about nothing.
    expect(seams.map((s) => s.drop)).toEqual([1, 2, 8]);
    const kept = boundingSeams(seams);
    expect(kept.map((s) => s.drop)).toEqual(
      seams.map((s) => s.drop).filter((d) => d >= SEAM_BLOCK_MIN_DROP),
    );
    expect(kept.every((s) => s.drop >= SEAM_BLOCK_MIN_DROP)).toBe(true);
  });

  it("is a filter, never a rewrite: the seams it keeps are the compiler's own objects", () => {
    const seams = levelSeams(twoPlatforms(70, 74));
    expect(seams).toHaveLength(1);
    expect(boundingSeams(seams)[0]).toBe(seams[0]);
  });
});
