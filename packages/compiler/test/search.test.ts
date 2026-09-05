/**
 * Neutral Chebyshev ring search — order and short-circuit.
 *
 * These defend the single source of truth that `city open`, `radial
 * project`, `vistas squareIn` and `roads freeCell/hub` all delegate to.
 * Existing corpus tests prove worlds don't move; these pin the ring order
 * itself so a future refactor cannot silently reorder candidates.
 */

import { describe, expect, it } from "vitest";

import { enumerateChebyshevRing, findFirstOnChebyshevRing } from "../src/search.js";

describe("enumerateChebyshevRing", () => {
  it("emits radius 0 as the origin alone", () => {
    const pts = [...enumerateChebyshevRing({ x: 5, z: 7 }, 0, 0)];
    expect(pts).toEqual([{ x: 5, z: 7 }]);
  });

  it("emits radius 1 in z-then-x order around the origin", () => {
    const origin = { x: 0, z: 0 };
    const pts = [...enumerateChebyshevRing(origin, 1, 1)];
    expect(pts).toEqual([
      { x: -1, z: -1 },
      { x: 0, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 0 },
      { x: 1, z: 0 },
      { x: -1, z: 1 },
      { x: 0, z: 1 },
      { x: 1, z: 1 }
    ]);
  });

  it("respects start/max inclusive and step, emitting only asked rings", () => {
    // Mirrors vistas `squareIn`: 0,2,4 ...64 — check prefix
    const pts = [...enumerateChebyshevRing({ x: 10, z: 10 }, 0, 4, 2)];
    // r=0 -> 1 point, r=2 -> 16 points, r=4 -> 32 points = 49
    expect(pts).toHaveLength(49);
    expect(pts[0]).toEqual({ x: 10, z: 10 });
    // first of r=2 is (-2,-2)
    expect(pts[1]).toEqual({ x: 8, z: 8 });
    expect(pts[5]).toEqual({ x: 12, z: 8 }); // last of top row of r=2
    // r=4 first is (-4,-4)
    expect(pts[17]).toEqual({ x: 6, z: 6 });
  });

  it("enumerates with origin offset in the same z-then-x order", () => {
    const origin = { x: 3, z: -2 };
    const pts = [...enumerateChebyshevRing(origin, 1, 1)];
    // shift of canonical order above
    expect(pts).toEqual([
      { x: 2, z: -3 },
      { x: 3, z: -3 },
      { x: 4, z: -3 },
      { x: 2, z: -2 },
      { x: 4, z: -2 },
      { x: 2, z: -1 },
      { x: 3, z: -1 },
      { x: 4, z: -1 }
    ]);
  });
});

describe("findFirstOnChebyshevRing", () => {
  it("returns null when no candidate is eligible", () => {
    const found = findFirstOnChebyshevRing({ x: 0, z: 0 }, {
      startRadius: 0,
      maxRadius: 2,
      isEligible: () => false
    });
    expect(found).toBeNull();
  });

  it("short-circuits on first eligible in ring order, not scan order", () => {
    const origin = { x: 0, z: 0 };
    // Only the last point of ring 1 is eligible — earlier rings none
    const target = { x: 1, z: 1 };
    const visited: { x: number; z: number }[] = [];
    const found = findFirstOnChebyshevRing(origin, {
      startRadius: 1,
      maxRadius: 1,
      isEligible: (x, z) => {
        visited.push({ x, z });
        return x === target.x && z === target.z;
      }
    });
    expect(found).toEqual(target);
    // visited in the exact z-then-x order, 8 entries, last is target
    expect(visited).toEqual([
      { x: -1, z: -1 },
      { x: 0, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 0 },
      { x: 1, z: 0 },
      { x: -1, z: 1 },
      { x: 0, z: 1 },
      { x: 1, z: 1 }
    ]);
  });

  it("applies inBounds before isEligible and skips ineligible bounds", () => {
    // inBounds rejects centre row; eligible would accept everything
    const found = findFirstOnChebyshevRing({ x: 0, z: 0 }, {
      startRadius: 0,
      maxRadius: 1,
      inBounds: (_x, z) => z !== 0,
      isEligible: () => true
    });
    // r=0 origin is z=0 -> rejected; first eligible is (-1,-1)
    expect(found).toEqual({ x: -1, z: -1 });
  });

  it("preserves startRadius/maxRadius/step exact window", () => {
    // start 1, max 3 step 2 => rings 1 and 3 only
    const origin = { x: 0, z: 0 };
    // make ring 1 empty, ring 3 has one eligible at (3,-3) which is first of ring 3
    const found = findFirstOnChebyshevRing(origin, {
      startRadius: 1,
      maxRadius: 3,
      step: 2,
      isEligible: (x, z) => x === 3 && z === -3
    });
    expect(found).toEqual({ x: 3, z: -3 });

    const none = findFirstOnChebyshevRing(origin, {
      startRadius: 2,
      maxRadius: 2,
      isEligible: (x, z) => x === -1 && z === -1
    });
    // (-1,-1) is ring 1, not visited when start=2
    expect(none).toBeNull();
  });
});
