/**
 * `scaleReference` — the landform that scales with the region.
 *
 * Two claims, and the second matters as much as the first:
 *
 * 1. **Opted in, the world magnifies.** A region twice as wide gets the same
 *    coastline at twice the size, not twice as much of it. Asserted *exactly*
 *    rather than statistically: at a power-of-two scale factor the transform is
 *    a pair of exact binary operations (`x → 2x`, `f → f/2`), so the two fields
 *    must agree bit for bit at corresponding columns. A stray extra
 *    multiplication anywhere in the stack would show up here as a mismatch in
 *    the last place, which is precisely the failure a tolerance would hide.
 *
 * 2. **Left out, nothing moved.** The parameter is invisible to every document
 *    that does not name it — the resolver hands back the identical object, so
 *    there is not even an opportunity for a float to change.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed } from "../src/determinism/index.js";
import { buildBaseFieldForNode, centeredRegion, resolveHeightfieldParams } from "../src/field/index.js";
import { landformScale, scaleNoiseStackToRegion } from "../src/noise/index.js";
import type { HeightfieldParams } from "../src/field/index.js";

const SEED = nodeSeed(20260801n, "world.terrain", "");

/** A coastal parameter set: warped fBm over a continentalness mask. */
const COASTAL: Partial<HeightfieldParams> = {
  seaLevel: 63,
  baseHeight: 72,
  amplitude: 34,
  octaves: 5,
  frequency: 0.004,
  warp: { amount: 20, frequency: 0.003 },
  continentalness: { frequency: 0.0011, seaFraction: 0.4 },
};

/** Fraction of a field's columns that sit below sea level. */
function seaFraction(values: Float64Array, seaLevel: number): number {
  let wet = 0;
  for (const v of values) if (v < seaLevel) wet++;
  return wet / values.length;
}

/**
 * Coastline crossings per block: how often an east-west walk changes between
 * land and sea, divided by the distance walked.
 *
 * The one honest measure of *feature size* on a map whose size is the variable.
 * A count of anything would grow with the area and a longest-run would saturate
 * on a row that is all ocean; crossings per block is the reciprocal of the mean
 * bay width, so halving it is exactly "the landform got twice as big".
 */
function crossingsPerBlock(values: Float64Array, width: number, depth: number, seaLevel: number): number {
  let crossings = 0;
  for (let j = 0; j < depth; j++) {
    let wet = (values[j * width] as number) < seaLevel;
    for (let i = 1; i < width; i++) {
      const next = (values[j * width + i] as number) < seaLevel;
      if (next !== wet) crossings++;
      wet = next;
    }
  }
  return crossings / (width * depth);
}

describe("landformScale", () => {
  it("is 1 — the exact no-op — for a document that does not opt in", () => {
    expect(landformScale(undefined, { width: 2048, depth: 2048 })).toBe(1);
    const params = resolveHeightfieldParams(COASTAL);
    // Not merely equal: the *same object*, so no float can have been touched.
    expect(scaleNoiseStackToRegion(params, { width: 2048, depth: 2048 })).toBe(params);
  });

  it("reads the region's longest side, so an oblong world sizes but never stretches", () => {
    expect(landformScale(512, { width: 1024, depth: 512 })).toBe(2);
    expect(landformScale(512, { width: 512, depth: 1024 })).toBe(2);
    expect(landformScale(512, { width: 512, depth: 512 })).toBe(1);
  });

  it("scales every horizontal length and no vertical one", () => {
    const params = resolveHeightfieldParams({ ...COASTAL, scaleReference: 512 });
    const scaled = scaleNoiseStackToRegion(params, { width: 1024, depth: 1024 });
    expect(scaled.frequency).toBe(params.frequency / 2);
    expect(scaled.warp.frequency).toBe(params.warp.frequency / 2);
    expect(scaled.warp.amount).toBe(params.warp.amount * 2);
    expect(scaled.continentalness?.frequency).toBe((params.continentalness as { frequency: number }).frequency / 2);
    // The build limit does not scale, so neither do these.
    expect(scaled.baseHeight).toBe(params.baseHeight);
    expect(scaled.amplitude).toBe(params.amplitude);
    expect(scaled.seaLevel).toBe(params.seaLevel);
    expect(scaled.octaves).toBe(params.octaves);
    expect(scaled.continentalness?.seaFraction).toBe(
      (params.continentalness as { seaFraction: number }).seaFraction,
    );
  });
});

describe("a world twice as wide gets a landform twice as big", () => {
  const small = buildBaseFieldForNode(centeredRegion(256, 256), { ...COASTAL, scaleReference: 256 }, SEED);
  const large = buildBaseFieldForNode(centeredRegion(512, 512), { ...COASTAL, scaleReference: 256 }, SEED);

  it("is the same field magnified, column for column", () => {
    // Region origins are `-width/2`, so column `i` of the small field is column
    // `2i` of the large one — the same world point under the doubling.
    let checked = 0;
    for (let j = 0; j < 256; j += 7) {
      for (let i = 0; i < 256; i += 7) {
        const a = small.field.values[j * 256 + i] as number;
        const b = large.field.values[2 * j * 512 + 2 * i] as number;
        expect(b).toBe(a);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("keeps the same proportion of sea while doubling the size of each bay", () => {
    const sSea = seaFraction(small.field.values, 63);
    const lSea = seaFraction(large.field.values, 63);
    expect(sSea).toBeGreaterThan(0.1);
    expect(Math.abs(lSea - sSea)).toBeLessThan(0.03);

    // Half the coastline per block: every bay is twice as wide.
    const s = crossingsPerBlock(small.field.values, 256, 256, 63);
    const l = crossingsPerBlock(large.field.values, 512, 512, 63);
    expect(l).toBeLessThan(s * 0.62);
    expect(l).toBeGreaterThan(s * 0.38);
  });
});

describe("without the parameter the old reading is untouched", () => {
  const small = buildBaseFieldForNode(centeredRegion(256, 256), COASTAL, SEED);
  const large = buildBaseFieldForNode(centeredRegion(512, 512), COASTAL, SEED);

  it("tiles rather than magnifies — the same block is the same height at any region size", () => {
    // No scaling means `frequency` is still per block, so a world point keeps
    // its height however big the window onto it is. This is the invariant the
    // shipped worlds rely on.
    for (let j = 0; j < 256; j += 11) {
      for (let i = 0; i < 256; i += 11) {
        const x = i - 128;
        const z = j - 128;
        const a = small.field.values[j * 256 + i] as number;
        const b = large.field.values[(z + 256) * 512 + (x + 256)] as number;
        expect(b).toBe(a);
      }
    }
  });

  it("puts more, same-sized bays into a bigger world — the defect the parameter fixes", () => {
    const s = crossingsPerBlock(small.field.values, 256, 256, 63);
    const l = crossingsPerBlock(large.field.values, 512, 512, 63);
    // Coastline per block barely moves: the bays stayed the size they were and
    // the world simply acquired more of them, which is why a harbour authored
    // against one of them cannot be relied on to find it again.
    expect(l).toBeGreaterThan(s * 0.75);
    expect(l).toBeLessThan(s * 1.35);
  });
});
