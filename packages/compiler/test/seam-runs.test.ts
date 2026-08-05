/**
 * **The scree defect** — a hill town that came out as rubble rather than as
 * terraces, and the two things that caused it.
 *
 * Kai walked `stepped_hilltown` and reported that the retaining walls read as
 * scree. Measured on that world's report: **1010 seams, every one `retaining`,
 * every one a drop of 4, 2495 columns in total** — and 714 of the 1010 were one
 * or two columns long. A two-column wall is not a wall, and a thousand of them
 * on a hillside is exactly what a player sees as rubble.
 *
 * The cause was not the terrain and not the platform construction. It was
 * `levelSeams` grouping its seam columns **4-connected**. A seam is a contour,
 * and a contour on a lattice is a staircase: along a 45° boundary, consecutive
 * lower-side columns are *diagonal* neighbours and never edge neighbours, so a
 * clean 300-column diagonal seam was cut into 150 crumbs and a stub of wall was
 * grown at each. Regrouping the very same 2495 columns 8-connected gives **37**
 * components, 25 of them 25 columns or longer.
 *
 * So there are two assertions here and the first is the fix:
 *
 * 1. a diagonal seam is **one** run, not one run per step;
 * 2. what is still short after that is graded rather than walled
 *    ({@link MIN_RETAIN_RUN}), which on the hill town moved two of the 37.
 */

import { describe, expect, it } from "vitest";

import {
  MIN_RETAIN_RUN,
  RETAIN_MAX,
  groundLevelsOf,
  levelSeams,
  treatmentForDrop,
  treatmentForSeam,
} from "../src/layout/levels.js";
import type { FormBench } from "../src/layout/forms/types.js";

const BOUNDS = { x0: 0, z0: 0, x1: 39, z1: 39 } as const;

/**
 * Two platforms split by the diagonal `x + z < n` — the staircase boundary that
 * the 4-connected grouping shattered.
 *
 * Benches are declared as their maximal horizontal runs, which is the wire
 * format `groundLevelsOf` reads, so this is a field a form could really emit.
 */
function diagonalBenches(low: number, high: number): FormBench[] {
  const lower: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const upper: { x0: number; z0: number; x1: number; z1: number }[] = [];
  for (let z = BOUNDS.z0; z <= BOUNDS.z1; z++) {
    // Columns with x < 40 − z are low; the rest are high. The boundary is a
    // clean 45° line, one lattice step per row.
    const split = 40 - z;
    if (split > BOUNDS.x0) lower.push({ x0: BOUNDS.x0, z0: z, x1: Math.min(BOUNDS.x1, split - 1), z1: z });
    if (split <= BOUNDS.x1) upper.push({ x0: Math.max(BOUNDS.x0, split), z0: z, x1: BOUNDS.x1, z1: z });
  }
  return [
    { id: "low", runs: lower, level: low },
    { id: "high", runs: upper, level: high },
  ];
}

describe("a seam that runs on the diagonal", () => {
  const levels = groundLevelsOf(BOUNDS, diagonalBenches(70, 74));

  it("is one run of wall, not one per lattice step", () => {
    const seams = levelSeams(levels as NonNullable<typeof levels>);
    // The whole point. Under 4-connected grouping this was 20 components of
    // one or two columns each; under 8-connected it is a single terrace.
    expect(seams.length).toBe(1);
    const seam = seams[0] as NonNullable<(typeof seams)[0]>;
    expect(seam.cells.length).toBeGreaterThan(30);
    expect(seam.drop).toBe(4);
    expect(seam.treatment).toBe("retaining");
  });

  it("and its columns are still every lower column that touches the upper platform", () => {
    // 8-connectivity is a grouping decision only: it must not change *which*
    // columns are in a seam, or the wall would move.
    const field = levels as NonNullable<typeof levels>;
    const seams = levelSeams(field);
    const covered = new Set(
      seams.flatMap((s) => s.cells.map((c) => `${c.x},${c.z}`)),
    );
    let expected = 0;
    for (let z = BOUNDS.z0; z <= BOUNDS.z1; z++) {
      for (let x = BOUNDS.x0; x <= BOUNDS.x1; x++) {
        const here = field.at(x, z);
        if (here !== 0) continue;
        const touches = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dz]) => field.at(x + (dx as number), z + (dz as number)) === 1);
        if (!touches) continue;
        expected++;
        expect(covered.has(`${x},${z}`)).toBe(true);
      }
    }
    expect(covered.size).toBe(expected);
  });

  it("stays one run when the boundary is a staircase rather than a pure diagonal", () => {
    // Two columns across, one down — the shape a smoothed contour actually
    // makes. Still 8-connected, still one wall.
    const lower: { x0: number; z0: number; x1: number; z1: number }[] = [];
    const upper: { x0: number; z0: number; x1: number; z1: number }[] = [];
    for (let z = BOUNDS.z0; z <= BOUNDS.z1; z++) {
      const split = 20 + (z >> 1);
      lower.push({ x0: BOUNDS.x0, z0: z, x1: Math.min(BOUNDS.x1, split - 1), z1: z });
      if (split <= BOUNDS.x1) upper.push({ x0: split, z0: z, x1: BOUNDS.x1, z1: z });
    }
    const stepped = groundLevelsOf(BOUNDS, [
      { id: "low", runs: lower, level: 70 },
      { id: "high", runs: upper, level: 73 },
    ]);
    expect(levelSeams(stepped as NonNullable<typeof stepped>).length).toBe(1);
  });
});

describe("treatmentForSeam", () => {
  it("grades a stub instead of walling it", () => {
    // A wall shorter than the tallest wall we build is shorter than it is
    // tall. That is a buttress, not a terrace, and a thousand of them is scree.
    expect(treatmentForSeam(4, MIN_RETAIN_RUN)).toBe("retaining");
    expect(treatmentForSeam(4, MIN_RETAIN_RUN - 1)).toBe("bank");
    expect(treatmentForSeam(4, 1)).toBe("bank");
    expect(MIN_RETAIN_RUN).toBe(RETAIN_MAX);
  });

  it("leaves a kerb and a bank alone, however long the run", () => {
    // A kerb is one course of material on the ground; two columns of it is a
    // doorstep, not a stub, so length has no say.
    expect(treatmentForSeam(1, 1)).toBe("kerb");
    expect(treatmentForSeam(1, 400)).toBe("kerb");
    expect(treatmentForSeam(RETAIN_MAX + 1, 1)).toBe("bank");
    expect(treatmentForSeam(RETAIN_MAX + 1, 400)).toBe("bank");
  });

  it("agrees with treatmentForDrop on any run long enough to build", () => {
    for (let drop = 0; drop <= RETAIN_MAX + 3; drop++) {
      expect(treatmentForSeam(drop, 64)).toBe(treatmentForDrop(drop));
    }
  });
});
