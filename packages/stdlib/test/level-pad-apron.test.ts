/**
 * **The cobbled-in plateau** — `LevelPad.adaptiveApron`.
 *
 * Kai walked the generated worlds and reported: *"terrain is still jarring how
 * there are 100% flat planes cobbled in with normal terrain."* The mechanism is
 * `padFor`: a district is levelled to one plane with `apron: DEFAULT_BLEND`,
 * which is 4 columns whether the pad is sitting one block proud of the ground
 * or twelve. Twelve blocks absorbed over four columns is a 3:1 cut face, and a
 * cut face is precisely what "cobbled in" describes.
 *
 * The fix is not a wider apron — a wider apron would flatten the far side of
 * the hill too. It is an apron that is a function of the step it is absorbing,
 * measured per column. Three properties, and all three are asserted here:
 *
 * 1. **on level ground nothing moves.** Where the field is already near the
 *    target, the reach is `apron` in every column, so a world that was not
 *    exhibiting the defect is byte-identical.
 * 2. **a deep step gets a long ramp.** Twelve blocks of difference reaches
 *    {@link APRON_MAX} columns, a 1:2 slope, which is a hillside.
 * 3. **the ramp is monotone and it lands on the natural ground.** A blend that
 *    overshot, or that left a lip at the outer edge, would trade one hard edge
 *    for two.
 */

import { describe, expect, it } from "vitest";

import {
  APRON_MAX,
  APRON_RUN_PER_BLOCK,
  applyLevelPad,
  type HeightField,
} from "../src/index.js";

const REGION = { x0: -64, z0: -64, width: 128, depth: 128 } as const;

/** A field whose height depends on `x` only, so a row through it is the profile. */
function ramp(rise: (x: number) => number): HeightField {
  const values = new Float64Array(REGION.width * REGION.depth);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) values[j * REGION.width + i] = rise(REGION.x0 + i);
  }
  return { region: REGION, values } as HeightField;
}

/** The row at z = 0, as world-x → height. */
function row(field: HeightField): (x: number) => number {
  const j = 0 - REGION.z0;
  return (x) => field.values[j * REGION.width + (x - REGION.x0)] as number;
}

const PAD = { x0: -20, z0: -20, x1: 20, z1: 20, targetY: 70 } as const;

describe("adaptiveApron", () => {
  it("changes nothing on ground that is already at the pad's level", () => {
    // Property 1. A quarter on a plain absorbs nothing, so it reaches nothing
    // further than DEFAULT_BLEND and the world it produces is the old world.
    const flat = ramp(() => 70.4);
    const fixed = ramp(() => 70.4);
    applyLevelPad(flat, { ...PAD, apron: 4, adaptiveApron: true });
    applyLevelPad(fixed, { ...PAD, apron: 4 });
    expect([...flat.values]).toEqual([...fixed.values]);
  });

  it("leaves a one-block step to the apron it already had", () => {
    const near = ramp((x) => (x > 20 ? 71 : 70));
    const fixed = ramp((x) => (x > 20 ? 71 : 70));
    applyLevelPad(near, { ...PAD, apron: 4, adaptiveApron: true });
    applyLevelPad(fixed, { ...PAD, apron: 4 });
    expect([...near.values]).toEqual([...fixed.values]);
  });

  // The case Kai walked: a quarter cut into a hillside. The pad spans 41
  // columns of a 1-in-2 slope and is levelled to the *median* of what it
  // covers, so its uphill edge is absorbing ten blocks of ground.
  const HILLSIDE = (x: number): number => 70 + x / 2;

  it("stretches a deep step into a ramp instead of a cut face", () => {
    // Property 2.
    const adaptive = ramp(HILLSIDE);
    const fixed = ramp(HILLSIDE);
    applyLevelPad(adaptive, { ...PAD, apron: 4, adaptiveApron: true });
    applyLevelPad(fixed, { ...PAD, apron: 4 });
    const a = row(adaptive);
    const f = row(fixed);

    // The fixed apron is the defect: four columns out of the pad it has
    // already climbed the whole ten blocks it was absorbing. That is a 3:1
    // face, and it is what reads as "cobbled in".
    expect(f(24) - f(20)).toBeGreaterThan(9);
    // The adaptive one climbs at roughly the hillside's own rate instead.
    expect(a(24) - a(20)).toBeLessThan(3);
    // …and it is genuinely long: still short of natural ground well past the
    // four columns DEFAULT_BLEND would have given it.
    expect(HILLSIDE(30) - a(30)).toBeGreaterThan(1);
    expect(a(30)).toBeLessThan(f(30));
  });

  it("rejoins the natural ground without a lip, and never overshoots it", () => {
    // Property 3. Monotone up the ramp, and by APRON_MAX + 1 columns out the
    // field is untouched: one soft edge, not two hard ones.
    const adaptive = ramp(HILLSIDE);
    applyLevelPad(adaptive, { ...PAD, apron: 4, adaptiveApron: true });
    const a = row(adaptive);
    for (let x = 21; x <= 60; x++) {
      expect(a(x)).toBeGreaterThanOrEqual(a(x - 1) - 1e-9);
      expect(a(x)).toBeLessThanOrEqual(HILLSIDE(x) + 1e-9);
    }
    for (let x = 20 + APRON_MAX + 1; x <= 60; x++) expect(a(x)).toBeCloseTo(HILLSIDE(x), 9);
  });

  it("never reaches further than the cap, whatever the step", () => {
    const cliff = ramp((x) => (x > 20 ? 140 : 70));
    applyLevelPad(cliff, { ...PAD, apron: 4, adaptiveApron: true });
    const a = row(cliff);
    for (let x = 20 + APRON_MAX + 1; x <= 60; x++) expect(a(x)).toBe(140);
    expect(APRON_MAX).toBe(12 * APRON_RUN_PER_BLOCK);
  });

  it("is off by default", () => {
    const a = ramp((x) => 70 + Math.max(0, x - 20) / 2);
    const b = ramp((x) => 70 + Math.max(0, x - 20) / 2);
    applyLevelPad(a, { ...PAD, apron: 4 });
    applyLevelPad(b, { ...PAD, apron: 4, adaptiveApron: false });
    expect([...a.values]).toEqual([...b.values]);
  });
});
