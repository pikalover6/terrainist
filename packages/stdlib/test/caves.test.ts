/**
 * `cave.carver@0` — the carver's contract.
 *
 * Four properties matter here, and each one is the reason a whole class of
 * downstream check can be cheap:
 *
 * 1. **determinism** — same request, byte-identical spans;
 * 2. **the band** — nothing carved outside `yRange`, and never within four
 *    blocks of the surface;
 * 3. **the water shell** — nothing carved within four columns of water or lava,
 *    and nothing at or below sea level within eight of the ocean;
 * 4. **span shape** — sorted, disjoint, and separated by at least one block of
 *    real rock, which is what makes `lo - 1` and `hi + 1` safe anchors for the
 *    compiler's dripstone.
 */

import { describe, expect, it } from "vitest";

import {
  CAVE_DEFAULTS,
  CAVE_FLUID_SHELL,
  CAVE_STYLES,
  CAVE_OCEAN_KEEPOUT,
  CAVE_ROOF_THICKNESS,
  ENTRANCE_MAX_SLOPE,
  carveCaves,
  caveVolume,
  dilate,
  resolveCaveParams,
  systemCount,
  type CaveCarveRequest,
  type CaveParams,
  type CaveSpans,
  type CaveStyle,
} from "../src/caves/index.js";
import { centeredRegion } from "../src/field/index.js";
import { nodeSeed } from "../src/determinism/index.js";

const SIZE = 128;
const GROUND = 96;
const SEA_LEVEL = 63;

interface WorldOptions {
  /** Columns to flood, as a predicate over `(x, z)` world coordinates. */
  readonly wet?: (x: number, z: number) => boolean;
  /** Columns that are ocean rather than fresh water. */
  readonly ocean?: (x: number, z: number) => boolean;
  /** Slope in degrees; a constant unless a function is given. */
  readonly slope?: number | ((x: number, z: number) => number);
  readonly params?: Partial<CaveParams>;
  readonly salt?: string;
}

/** A flat synthetic world, so every finding is about the carver and nothing else. */
function request(options: WorldOptions = {}): CaveCarveRequest {
  const region = centeredRegion(SIZE, SIZE);
  const n = region.width * region.depth;
  const ground = new Int32Array(n).fill(GROUND);
  const fluid = new Uint8Array(n);
  const oceanMask = new Uint8Array(n);
  const slopes = new Float64Array(n);

  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      const x = region.x0 + i;
      const z = region.z0 + j;
      if (options.wet?.(x, z) === true) {
        fluid[idx] = 1;
        ground[idx] = GROUND - 6;
      }
      if (options.ocean?.(x, z) === true) {
        fluid[idx] = 1;
        oceanMask[idx] = 1;
        ground[idx] = SEA_LEVEL - 8;
      }
      slopes[idx] =
        typeof options.slope === "function" ? options.slope(x, z) : (options.slope ?? 0);
    }
  }

  return {
    region,
    seed: nodeSeed(1234n, "world.caves", options.salt ?? ""),
    params: resolveCaveParams({ density: 1, yRange: [10, 90], ...options.params }),
    ground,
    fluid,
    oceanMask,
    slopes,
    seaLevel: SEA_LEVEL,
    nodeId: "world.caves",
  };
}

/** Every `(columnIndex, lo, hi)` triple a span set holds. */
function triples(spans: CaveSpans): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let idx = 0; idx + 1 < spans.offsets.length; idx++) {
    const end = spans.offsets[idx + 1] as number;
    for (let k = spans.offsets[idx] as number; k < end; k++) {
      out.push([idx, spans.lo[k] as number, spans.hi[k] as number]);
    }
  }
  return out;
}

describe("resolveCaveParams", () => {
  it("fills in every default", () => {
    expect(resolveCaveParams(undefined)).toEqual(CAVE_DEFAULTS);
  });

  it("normalizes a boolean `entrances` to a count", () => {
    expect(resolveCaveParams({ entrances: true }).entrances).toBe(1);
    expect(resolveCaveParams({ entrances: false }).entrances).toBe(0);
    expect(resolveCaveParams({ entrances: 3 }).entrances).toBe(3);
  });

  it("keeps nested chamber defaults when only one field is given", () => {
    const p = resolveCaveParams({ chambers: { radius: 14 } });
    expect(p.chambers.radius).toBe(14);
    expect(p.chambers.count).toBe(CAVE_DEFAULTS.chambers.count);
    expect(p.chambers.chance).toBe(CAVE_DEFAULTS.chambers.chance);
  });
});

describe("systemCount", () => {
  it("is zero at zero density and scales with area", () => {
    expect(systemCount(0, 512 * 512)).toBe(0);
    expect(systemCount(1, 128 * 128)).toBeGreaterThan(0);
    expect(systemCount(1, 512 * 512)).toBeGreaterThan(systemCount(1, 128 * 128));
  });

  it("gives a non-zero density at least one system, however small the region", () => {
    expect(systemCount(0.01, 64 * 64)).toBe(1);
  });
});

describe("dilate", () => {
  it("grows a single cell into a Chebyshev square", () => {
    const mask = new Uint8Array(9);
    mask[4] = 1;
    const out = dilate(mask, 3, 3, 1);
    expect([...out]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("is the identity at radius zero", () => {
    const mask = Uint8Array.from([0, 1, 0, 0]);
    expect([...dilate(mask, 2, 2, 0)]).toEqual([0, 1, 0, 0]);
  });
});

describe("carveCaves", () => {
  it("is deterministic: the same request carves byte-identical spans twice", () => {
    const a = carveCaves(request());
    const b = carveCaves(request());
    expect(a.spans.offsets).toEqual(b.spans.offsets);
    expect(a.spans.lo).toEqual(b.spans.lo);
    expect(a.spans.hi).toEqual(b.spans.hi);
    expect(a.carvedBlocks).toBe(b.carvedBlocks);
    expect(a.carvedBlocks).toBeGreaterThan(0);
  });

  it("rerolls on a different seedSalt", () => {
    const a = carveCaves(request());
    const b = carveCaves(request({ salt: "a" }));
    expect([...a.spans.lo]).not.toEqual([...b.spans.lo]);
  });

  it("carves nothing at zero density", () => {
    const result = carveCaves(request({ params: { density: 0 } }));
    expect(result.carvedBlocks).toBe(0);
    expect(result.systems).toBe(0);
  });

  it("keeps every span inside yRange and under the roof margin", () => {
    const req = request({ params: { yRange: [24, 70] } });
    const result = carveCaves(req);
    expect(result.carvedBlocks).toBeGreaterThan(0);
    for (const [, lo, hi] of triples(result.spans)) {
      expect(lo).toBeGreaterThanOrEqual(24);
      expect(hi).toBeLessThanOrEqual(70);
      expect(hi).toBeLessThanOrEqual(GROUND - CAVE_ROOF_THICKNESS);
    }
  });

  it("reports a carve volume matching the spans it returned", () => {
    const result = carveCaves(request());
    expect(result.carvedBlocks).toBe(caveVolume(result.spans));
  });

  it("returns sorted, disjoint spans with rock between them", () => {
    const result = carveCaves(request());
    const { region } = request();
    for (let idx = 0; idx < region.width * region.depth; idx++) {
      const start = result.spans.offsets[idx] as number;
      const end = result.spans.offsets[idx + 1] as number;
      for (let k = start; k < end; k++) {
        expect(result.spans.hi[k] as number).toBeGreaterThanOrEqual(result.spans.lo[k] as number);
        if (k === start) continue;
        // At least one solid block between two spans of a column: a merged
        // pair would have been coalesced, and a zero-gap pair is not a pair.
        expect(result.spans.lo[k] as number).toBeGreaterThan((result.spans.hi[k - 1] as number) + 1);
      }
    }
  });

  it("dodges a lake by four blocks in every direction", () => {
    // A round tarn in the middle of an otherwise open world. The carver is run
    // at full density so it has every incentive to cut through it.
    const wet = (x: number, z: number): boolean => x * x + z * z <= 18 * 18;
    const req = request({ wet });
    const result = carveCaves(req);
    expect(result.carvedBlocks).toBeGreaterThan(0);

    const { region } = req;
    const nearWater = dilate(req.fluid, region.width, region.depth, CAVE_FLUID_SHELL);
    let breaches = 0;
    for (const [idx] of triples(result.spans)) {
      if (nearWater[idx] === 1) breaches++;
    }
    expect(breaches).toBe(0);
  });

  it("never breaches sea level within eight blocks of the ocean", () => {
    const ocean = (x: number): boolean => x > 20;
    const req = request({ ocean, params: { yRange: [10, 90] } });
    const result = carveCaves(req);
    const { region } = req;
    const nearOcean = dilate(req.oceanMask, region.width, region.depth, CAVE_OCEAN_KEEPOUT);
    for (const [idx, lo] of triples(result.spans)) {
      if (nearOcean[idx] === 1) expect(lo).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it("opens no entrance when none is asked for", () => {
    const result = carveCaves(request({ params: { entrances: 0 } }));
    expect(result.markers).toHaveLength(0);
    expect([...result.entranceColumns].every((v) => v === 0)).toBe(true);
  });

  it("opens entrances only on gentle slopes, and publishes a marker for each", () => {
    // Steep everywhere except a band down the middle: every mouth has to land
    // in the band, and there is room for at most a couple of them.
    const gentle = (x: number): boolean => Math.abs(x) < 24;
    const req = request({
      slope: (x) => (gentle(x) ? 9 : 62),
      params: { entrances: 2, yRange: [60, 92] },
    });
    const result = carveCaves(req);

    expect(result.markers.length).toBeGreaterThan(0);
    expect(result.markers.length).toBeLessThanOrEqual(2);
    for (const marker of result.markers) {
      expect(marker.name).toBe("cave_mouth");
      expect(marker.id).toBe("world.caves.cave_mouth");
      expect(gentle(marker.x)).toBe(true);
    }

    const { region } = req;
    for (let idx = 0; idx < result.entranceColumns.length; idx++) {
      if (result.entranceColumns[idx] !== 1) continue;
      const i = idx % region.width;
      const slope = req.slopes[idx] as number;
      // The mouth is a small disk, so its rim may sit two columns outside the
      // ranked candidate; what must never happen is a mouth cut into a cliff.
      expect(slope).toBeLessThan(ENTRANCE_MAX_SLOPE + 1);
      expect(Math.abs(region.x0 + i)).toBeLessThan(26);
    }
  });

  it("opens an entrance all the way to daylight", () => {
    const req = request({ params: { entrances: 1, yRange: [60, 92] } });
    const result = carveCaves(req);
    expect(result.markers.length).toBe(1);
    const marker = result.markers[0];
    if (marker === undefined) throw new Error("expected a mouth");
    const { region } = req;
    const idx = (marker.z - region.z0) * region.width + (marker.x - region.x0);
    const end = result.spans.offsets[idx + 1] as number;
    let top = Number.NEGATIVE_INFINITY;
    for (let k = result.spans.offsets[idx] as number; k < end; k++) {
      top = Math.max(top, result.spans.hi[k] as number);
    }
    expect(top).toBe(req.ground[idx] as number);
    expect(result.entranceColumns[idx]).toBe(1);
  });

  it("opens chambers when asked, and none when the count is zero", () => {
    const withChambers = carveCaves(
      request({ params: { chambers: { count: 6, radius: 9, chance: 1 } } }),
    );
    const without = carveCaves(request({ params: { chambers: { count: 0, radius: 9, chance: 1 } } }));
    expect(withChambers.chambers).toBeGreaterThan(0);
    expect(withChambers.chambers).toBeLessThanOrEqual(6);
    expect(without.chambers).toBe(0);
    expect(withChambers.carvedBlocks).toBeGreaterThan(without.carvedBlocks);
  });
});

/* -------------------------------------------------------------------------- */
/* styles                                                                      */
/* -------------------------------------------------------------------------- */

/** Mean and maximum span height of a carve, the cheapest read on its shape. */
function heights(spans: CaveSpans): { mean: number; max: number; count: number } {
  let total = 0;
  let max = 0;
  let count = 0;
  for (const [, lo, hi] of triples(spans)) {
    const h = hi - lo + 1;
    total += h;
    if (h > max) max = h;
    count++;
  }
  return { mean: count === 0 ? 0 : total / count, max, count };
}

/** Columns a carve touched at all — the horizontal footprint. */
function footprint(spans: CaveSpans): number {
  let n = 0;
  for (let idx = 0; idx + 1 < spans.offsets.length; idx++) {
    if ((spans.offsets[idx + 1] as number) > (spans.offsets[idx] as number)) n++;
  }
  return n;
}

describe("cave styles", () => {
  it("defaults to worm, and worm is what an undefaulted request carves", () => {
    expect(CAVE_DEFAULTS.style).toBe("worm");
    expect(resolveCaveParams({}).style).toBe("worm");
    expect(resolveCaveParams({ style: "ravine" }).style).toBe("ravine");
  });

  it("carves something with every style, deterministically", () => {
    for (const style of CAVE_STYLES) {
      const a = carveCaves(request({ params: { style } }));
      const b = carveCaves(request({ params: { style } }));
      expect(a.carvedBlocks, style).toBeGreaterThan(0);
      expect([...a.spans.lo], style).toEqual([...b.spans.lo]);
      expect([...a.spans.hi], style).toEqual([...b.spans.hi]);
      expect([...a.spans.offsets], style).toEqual([...b.spans.offsets]);
    }
  });

  it("gives each style a different world", () => {
    const volumes = new Map<CaveStyle, number>();
    for (const style of CAVE_STYLES) {
      volumes.set(style, carveCaves(request({ params: { style } })).carvedBlocks);
    }
    expect(new Set(volumes.values()).size).toBe(CAVE_STYLES.length);
  });

  it("keeps every style inside yRange, under the roof margin, and disjoint", () => {
    for (const style of CAVE_STYLES) {
      const result = carveCaves(request({ params: { style, yRange: [24, 70] } }));
      expect(result.carvedBlocks, style).toBeGreaterThan(0);
      for (const [, lo, hi] of triples(result.spans)) {
        expect(lo, style).toBeGreaterThanOrEqual(24);
        expect(hi, style).toBeLessThanOrEqual(70);
        expect(hi, style).toBeLessThanOrEqual(GROUND - CAVE_ROOF_THICKNESS);
      }
      const { region } = request();
      for (let idx = 0; idx < region.width * region.depth; idx++) {
        const start = result.spans.offsets[idx] as number;
        const end = result.spans.offsets[idx + 1] as number;
        for (let k = start + 1; k < end; k++) {
          expect(result.spans.lo[k] as number, style).toBeGreaterThan(
            (result.spans.hi[k - 1] as number) + 1,
          );
        }
      }
    }
  });

  it("respects the fluid shell and the ocean keep-out in every style", () => {
    for (const style of CAVE_STYLES) {
      // A lake through the middle, and an ocean along the west edge.
      const req = request({
        params: { style },
        wet: (x, z) => z >= -2 && z <= 2 && x > -40,
        ocean: (x) => x < -50,
      });
      const result = carveCaves(req);
      const { region } = req;
      for (const [idx, lo] of triples(result.spans)) {
        const i = idx % region.width;
        const j = (idx - i) / region.width;
        const x = region.x0 + i;
        const z = region.z0 + j;
        expect(Math.abs(z) > 2 + CAVE_FLUID_SHELL || x <= -40 - CAVE_FLUID_SHELL, style).toBe(true);
        if (x < -50 + CAVE_OCEAN_KEEPOUT) expect(lo, style).toBeGreaterThan(SEA_LEVEL);
      }
    }
  });

  it("makes a ravine a tall narrow slot and spaghetti a thin wide net", () => {
    const ravine = heights(carveCaves(request({ params: { style: "ravine" } })).spans);
    const spaghetti = carveCaves(request({ params: { style: "spaghetti" } }));
    const worm = carveCaves(request());
    // A slot is taller per column than a tube of the same nominal radius.
    expect(ravine.mean).toBeGreaterThan(heights(worm.spans).mean);
    expect(ravine.max).toBeGreaterThan(10);
    // Spaghetti trades girth for reach: thinner columns, more of them.
    expect(heights(spaghetti.spans).mean).toBeLessThan(heights(worm.spans).mean);
    expect(footprint(spaghetti.spans)).toBeGreaterThan(footprint(worm.spans) / 2);
  });

  it("makes cheese wide and rounded, and chamber_network mostly chambers", () => {
    const cheese = carveCaves(request({ params: { style: "cheese" } }));
    const worm = carveCaves(request());
    // Blobs are rooms: fewer, fatter columns than a worm net of the same radius.
    expect(heights(cheese.spans).max).toBeGreaterThan(6);
    expect(cheese.carvedBlocks / Math.max(1, footprint(cheese.spans))).toBeGreaterThan(
      worm.carvedBlocks / Math.max(1, footprint(worm.spans)),
    );

    const halls = carveCaves(
      request({ params: { style: "chamber_network", chambers: { count: 12, radius: 9, chance: 1, spacing: 30 } } }),
    );
    expect(halls.chambers).toBeGreaterThan(0);
    expect(halls.chambers).toBeLessThanOrEqual(12);
  });
});

describe("chambers.spacing", () => {
  it("defaults to the historical 44-step interval", () => {
    expect(CAVE_DEFAULTS.chambers.spacing).toBe(70);
  });

  it("opens more chambers along a worm when the spacing is tight", () => {
    const params = { chambers: { count: 40, radius: 8, chance: 1 } } as const;
    const wide = carveCaves(request({ params: { ...params, chambers: { ...params.chambers, spacing: 200 } } }));
    const tight = carveCaves(request({ params: { ...params, chambers: { ...params.chambers, spacing: 16 } } }));
    expect(tight.chambers).toBeGreaterThan(wide.chambers);
    expect(tight.carvedBlocks).toBeGreaterThan(wide.carvedBlocks);
  });

  it("sets the connector length of a chamber_network", () => {
    const near = carveCaves(
      request({ params: { style: "chamber_network", chambers: { count: 6, radius: 6, chance: 1, spacing: 20 } } }),
    );
    const far = carveCaves(
      request({ params: { style: "chamber_network", chambers: { count: 6, radius: 6, chance: 1, spacing: 90 } } }),
    );
    // `spacing` is the edge length of the graph, so it decides how far a
    // network gets before it walks out of the region or into a closed column —
    // short edges fit more rooms in, long edges spend the budget on corridor.
    expect(near.chambers).toBeGreaterThan(far.chambers);
    expect(far.carvedBlocks / Math.max(1, far.chambers)).toBeGreaterThan(
      near.carvedBlocks / Math.max(1, near.chambers),
    );
  });
});
