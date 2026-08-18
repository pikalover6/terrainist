/**
 * **The asymmetric apron** — `LevelPad.apronBySide` (Wave 8C,
 * `docs/GROUND-UNIFICATION-v0.md` §1.8).
 *
 * A pad's apron is a negotiation with whatever is outside it, and the thing
 * outside is not the same on all four sides. The frontage tie (F7) seats a lot
 * at the level of the carriageway it fronts: on that face there is nothing left
 * to blend, and a two-column smoothstep there manufactures exactly the lip the
 * tie exists to remove. The other three faces still meet untouched hill and
 * still want the adaptive 1:2 ramp. One scalar cannot say both, so a pad may
 * now name a width per side.
 *
 * Three things are asserted, and the middle one is the only judgement in the
 * wave:
 *
 * 1. **each side reaches its own width**, and a side set to `0` reaches nothing
 *    even under `adaptiveApron` — widening a side is not the same as creating
 *    one.
 * 2. **the corner rule.** A column diagonally off a corner is outside two sides
 *    at once and the two may disagree. It takes the reach of the **nearer**
 *    side, and ties go to the **lower-index** side in the canonical face order
 *    `north, east, south, west`. Asserted both ways round: once where the
 *    low-index side is the wide one (the corner blends) and once where it is
 *    the narrow one (the corner does not).
 * 3. **an omitted field is not a field.** Every pad the compiler emits today
 *    omits `apronBySide`, and omitting it must take precisely the old code
 *    path — the same arithmetic, not merely a similar answer.
 */

import { describe, expect, it } from "vitest";

import { APRON_MAX, applyLevelPad, type HeightField } from "../src/index.js";

const REGION = { x0: -64, z0: -64, width: 128, depth: 128 } as const;

/** A field of one constant height, so any departure from it is the pad's. */
function flat(h: number): HeightField {
  const values = new Float64Array(REGION.width * REGION.depth);
  values.fill(h);
  return { region: REGION, values } as HeightField;
}

/** A field that rises to the east, so an adaptive apron has a step to absorb. */
function hillside(): HeightField {
  const values = new Float64Array(REGION.width * REGION.depth);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      values[j * REGION.width + i] = 70 + (REGION.x0 + i) / 2;
    }
  }
  return { region: REGION, values } as HeightField;
}

function at(field: HeightField, x: number, z: number): number {
  return field.values[(z - REGION.z0) * REGION.width + (x - REGION.x0)] as number;
}

const PAD = { x0: -20, z0: -20, x1: 20, z1: 20, targetY: 70 } as const;
const GROUND = 60;

/** True where the pad moved this column off the natural ground. */
function moved(field: HeightField, x: number, z: number): boolean {
  return at(field, x, z) !== GROUND;
}

describe("LevelPad.apronBySide — per-side reach", () => {
  it("gives each face its own width, and the scalar to the faces it omits", () => {
    const f = flat(GROUND);
    applyLevelPad(f, { ...PAD, apron: 3, apronBySide: { north: 8, east: 0 } });

    // North (−Z): eight columns of reach. The last column of a reach is where
    // the smoothstep hits zero, so the blend runs to `width - 1`.
    expect(moved(f, 0, PAD.z0 - 7)).toBe(true);
    expect(moved(f, 0, PAD.z0 - 8)).toBe(false);

    // East (+X): named zero, so no apron at all.
    expect(moved(f, PAD.x1 + 1, 0)).toBe(false);

    // South and west were not named and fall back to the scalar 3 — not to the
    // north's 8 and not to the east's 0.
    expect(moved(f, 0, PAD.z1 + 2)).toBe(true);
    expect(moved(f, 0, PAD.z1 + 3)).toBe(false);
    expect(moved(f, PAD.x0 - 2, 0)).toBe(true);
    expect(moved(f, PAD.x0 - 3, 0)).toBe(false);
  });

  it("does not let an adaptive pad manufacture an apron on a side set to zero", () => {
    // `adaptiveApron` widens a side's reach; it never creates one. The east
    // face here is absorbing ten blocks of hill, which is exactly the case that
    // would otherwise stretch to a twenty-column ramp.
    const f = hillside();
    applyLevelPad(f, { ...PAD, apron: 4, adaptiveApron: true, apronBySide: { east: 0 } });
    for (let x = PAD.x1 + 1; x <= PAD.x1 + APRON_MAX + 4; x++) {
      expect(at(f, x, 0)).toBeCloseTo(70 + x / 2, 9);
    }
    // …while the west face, which kept the scalar, still ramps.
    expect(at(f, PAD.x0 - 4, 0)).not.toBeCloseTo(70 + (PAD.x0 - 4) / 2, 9);
  });
});

describe("LevelPad.apronBySide — the corner rule", () => {
  // North-east corner: the two candidates are north (index 0, wide) and east
  // (index 1, narrow). Offsets are perpendicular distances, so the nearer side
  // is the one with the smaller offset.
  const NE = { ...PAD, apron: 3, apronBySide: { north: 8, east: 2, south: 2, west: 2 } };

  it("takes the nearer side's reach — the wide side, when it is nearer", () => {
    const f = flat(GROUND);
    applyLevelPad(f, NE);
    // dx = 3 east, dz = 2 north → north is nearer, reach 8, d = √13 ≈ 3.6.
    expect(moved(f, PAD.x1 + 3, PAD.z0 - 2)).toBe(true);
  });

  it("takes the nearer side's reach — the narrow side, when it is nearer", () => {
    const f = flat(GROUND);
    applyLevelPad(f, NE);
    // dx = 2 east, dz = 3 north → east is nearer, reach 2, d = √13 ≈ 3.6 > 2.
    // Had the wide north side won on being wider, this column would have moved.
    expect(moved(f, PAD.x1 + 2, PAD.z0 - 3)).toBe(false);
  });

  it("breaks a tie to the lower-index side — north over east", () => {
    const f = flat(GROUND);
    applyLevelPad(f, NE);
    // dx = dz = 3. North (0) beats east (1), so the reach is 8 and d = √18
    // ≈ 4.24 is inside it.
    expect(moved(f, PAD.x1 + 3, PAD.z0 - 3)).toBe(true);
  });

  it("breaks a tie to the lower-index side — south over west, even when west is wider", () => {
    // The mirror case, and the one that proves the tie-break is by index rather
    // than by which width happens to be larger: here the low-index side is the
    // *narrow* one, so the corner must stay untouched.
    const f = flat(GROUND);
    applyLevelPad(f, { ...PAD, apron: 3, apronBySide: { north: 2, east: 2, south: 2, west: 8 } });
    // dx = dz = 3 off the south-west corner. South (2) beats west (3): reach 2,
    // d = √18 ≈ 4.24 > 2.
    expect(moved(f, PAD.x0 - 3, PAD.z1 + 3)).toBe(false);
    // The same offsets off the north-west corner: north (0) beats west (3), and
    // north is equally narrow, so that corner is untouched too.
    expect(moved(f, PAD.x0 - 3, PAD.z0 - 3)).toBe(false);
    // The wide west side only owns the columns for which it is strictly
    // nearer: dx = 3 west against dz = 5 north, reach 8, d = √34 ≈ 5.8.
    expect(moved(f, PAD.x0 - 3, PAD.z0 - 5)).toBe(true);
  });

  it("is a pure function of the geometry — property order does not decide a tie", () => {
    // Same four widths, written in the other order. If the tie-break read the
    // sides in object order rather than by index these would differ.
    const a = flat(GROUND);
    const b = flat(GROUND);
    applyLevelPad(a, { ...PAD, apron: 3, apronBySide: { north: 8, east: 2, south: 5, west: 6 } });
    applyLevelPad(b, {
      ...PAD,
      apron: 3,
      apronBySide: { west: 6, south: 5, east: 2, north: 8 },
    });
    expect([...a.values]).toEqual([...b.values]);
  });
});

describe("LevelPad.apronBySide — an omitted field is the old code path", () => {
  it("matches the scalar pad exactly when every side repeats the scalar", () => {
    const withField = hillside();
    const without = hillside();
    applyLevelPad(withField, {
      ...PAD,
      apron: 4,
      apronBySide: { north: 4, east: 4, south: 4, west: 4 },
    });
    applyLevelPad(without, { ...PAD, apron: 4 });
    expect([...withField.values]).toEqual([...without.values]);
  });

  it("matches the scalar adaptive pad exactly when every side repeats the scalar", () => {
    const withField = hillside();
    const without = hillside();
    applyLevelPad(withField, {
      ...PAD,
      apron: 4,
      adaptiveApron: true,
      apronBySide: { north: 4, east: 4, south: 4, west: 4 },
    });
    applyLevelPad(without, { ...PAD, apron: 4, adaptiveApron: true });
    expect([...withField.values]).toEqual([...without.values]);
  });

  it("treats an empty object, and every individually omitted side, as the scalar", () => {
    const empty = hillside();
    const partial = hillside();
    const without = hillside();
    applyLevelPad(empty, { ...PAD, apron: 4, adaptiveApron: true, apronBySide: {} });
    applyLevelPad(partial, {
      ...PAD,
      apron: 4,
      adaptiveApron: true,
      apronBySide: { north: undefined, south: 4 },
    });
    applyLevelPad(without, { ...PAD, apron: 4, adaptiveApron: true });
    expect([...empty.values]).toEqual([...without.values]);
    expect([...partial.values]).toEqual([...without.values]);
  });

  it("normalises a side the way the scalar is normalised", () => {
    // `max(0, floor(w))`, so a side cannot smuggle in a fractional or negative
    // reach that `apron` itself would have refused.
    const fractional = flat(GROUND);
    const integer = flat(GROUND);
    applyLevelPad(fractional, { ...PAD, apron: 0, apronBySide: { north: 5.9, east: -3 } });
    applyLevelPad(integer, { ...PAD, apron: 0, apronBySide: { north: 5, east: 0 } });
    expect([...fractional.values]).toEqual([...integer.values]);
  });
});
