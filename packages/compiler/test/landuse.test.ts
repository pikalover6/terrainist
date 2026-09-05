/**
 * The biome / snow land-use clamp — Phase 0 contract §4.
 *
 * Two halves. The unit half exercises {@link clampLandUse} directly, because
 * the invariant it enforces ("one coherent biome and one snow story over a
 * settlement footprint") is a statement about a pure function and is best
 * falsified there — including the exact defect this exists to remove, a
 * footprint whose columns disagree about snow.
 *
 * The compile half runs the committed `frost_hollow` fixture, a snowbound
 * alpine mining town strung along a steep valley, end to end and reads the
 * emitted world back: every column of every building pad must carry the same
 * biome.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SurfaceClass } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import type { ProfileBiome } from "../src/terrain/biomes.js";
import {
  BIOME_CELL,
  DEFAULT_FEATHER,
  MAX_FEATHER,
  MIN_FEATHER,
  buildLandUseMask,
  chebyshevDistance,
  clampLandUse,
  featherForPerimeter,
  featherWeight,
  maskPerimeter,
  type LandUseClampInput
} from "../src/terrain/landuse.js";
import { PROFILE_BIOMES, snowConsistentBiome } from "../src/terrain/biomes.js";

/* -------------------------------------------------------------------------- */
/* Unit: the clamp                                                            */
/* -------------------------------------------------------------------------- */

const W = 32;
const D = 32;

/**
 * A 32×32 grassy plateau with a 10×10 settlement in the middle, and a snow
 * line running diagonally across it — the observed defect, in miniature.
 */
function scenario(over: Partial<LandUseClampInput> = {}): LandUseClampInput {
  const n = W * D;
  const mask = new Uint8Array(n);
  for (let j = 11; j < 21; j++) for (let i = 11; i < 21; i++) mask[j * W + i] = 1;
  const base: ProfileBiome[] = new Array<ProfileBiome>(n);
  const snow = new Uint8Array(n);
  const surfaceClass = new Int32Array(n).fill(SurfaceClass.SOIL);
  const temperature = new Float32Array(n).fill(0.35);
  const forested = new Uint8Array(n);
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      // The snow line: everything up and to the right of the diagonal.
      const snowy = i + j > 35;
      base[idx] = snowy ? "minecraft:snowy_slopes" : "minecraft:plains";
      snow[idx] = snowy ? 1 : 0;
    }
  }
  return {
    width: W,
    depth: D,
    x0: 0,
    z0: 0,
    mask,
    base,
    snow,
    surfaceClass,
    temperature,
    forested,
    nodePath: "world",
    ...over
  };
}

/**
 * A big square footprint on flat plains, wide enough that the whole size-scaled
 * feather band fits inside the region with room to spare — the band is now up
 * to {@link MAX_FEATHER} columns, which no longer fits the 32×32 miniature.
 */
function bigBand(): {
  out: ReturnType<typeof clampLandUse>;
  distance: Int32Array;
  width: number;
  depth: number;
  n: number;
} {
  const width = 160;
  const depth = 160;
  const n = width * depth;
  const mask = new Uint8Array(n);
  for (let j = 60; j < 100; j++) for (let i = 60; i < 100; i++) mask[j * width + i] = 1;
  const base: ProfileBiome[] = new Array<ProfileBiome>(n).fill("minecraft:plains");
  const out = clampLandUse({
    width,
    depth,
    x0: 0,
    z0: 0,
    mask,
    base,
    snow: new Uint8Array(n),
    surfaceClass: new Int32Array(n).fill(SurfaceClass.SOIL),
    temperature: new Float32Array(n).fill(0.35),
    forested: new Uint8Array(n),
    intent: { biome: "minecraft:taiga", snow: "never" },
    nodePath: "world"
  });
  return { out, distance: chebyshevDistance(mask, width, depth, out.feather), width, depth, n };
}

/** Every column index the mask claims. */
function footprintIndices(mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let idx = 0; idx < mask.length; idx++) if (mask[idx] === 1) out.push(idx);
  return out;
}

describe("land-use clamp — the invariant", () => {
  it("gives a footprint that straddles the snow line one biome and one snow story", () => {
    const input = scenario();
    // Precondition: the defect is really present in the input.
    const before = footprintIndices(input.mask).map((idx) => input.snow[idx]);
    expect(new Set(before).size).toBe(2);

    const out = clampLandUse(input);
    const inside = footprintIndices(input.mask);
    expect(new Set(inside.map((idx) => out.biome[idx])).size).toBe(1);
    expect(new Set(inside.map((idx) => out.snow[idx])).size).toBe(1);
  });

  it("resolves `auto` by majority vote of the footprint's own columns", () => {
    // 21 of the 100 footprint columns are above the diagonal: a minority.
    const out = clampLandUse(scenario());
    expect(out.vote.total).toBe(100);
    expect(out.vote.snowy).toBeLessThan(50);
    expect(out.snowPolicy).toBe("never");
    expect(out.clampedBiome).toBe("minecraft:plains");
    expect(out.snowSuppressed).toBeGreaterThan(0);
    expect(out.snowAdded).toBe(0);
  });

  it("keeps a snowbound town snowy: majority snow means snowy_plains and snow everywhere", () => {
    const input = scenario();
    input.snow.fill(1);
    const out = clampLandUse(input);
    expect(out.snowPolicy).toBe("always");
    expect(out.clampedBiome).toBe("minecraft:snowy_plains");
    const inside = footprintIndices(input.mask);
    expect(inside.every((idx) => out.snow[idx] === 1)).toBe(true);
    expect(out.snowSuppressed).toBe(0);
  });

  it("never adds snow unless the policy is `always`", () => {
    const out = clampLandUse(scenario({ intent: { snow: "never" } }));
    expect(out.snowPolicy).toBe("never");
    expect(out.snowAdded).toBe(0);
    expect(footprintIndices(scenario().mask).every((idx) => out.snow[idx] === 0)).toBe(true);
  });

  it("clamps a feather band outward and nothing past it", () => {
    const input = scenario();
    const out = clampLandUse(input);
    expect(out.featherColumns).toBeGreaterThan(0);
    const distance = chebyshevDistance(input.mask, W, D, 64);
    for (let idx = 0; idx < W * D; idx++) {
      const d = distance[idx] as number;
      if (d > DEFAULT_FEATHER || d < 0) {
        expect(out.biome[idx]).toBe(input.base[idx]);
        expect(out.snow[idx]).toBe(input.snow[idx]);
      }
    }
  });

  it("is a pure function: it mutates neither input array, and repeats exactly", () => {
    const a = scenario();
    const snowBefore = Uint8Array.from(a.snow);
    const baseBefore = [...a.base];
    const first = clampLandUse(a);
    expect(Array.from(a.snow)).toEqual(Array.from(snowBefore));
    expect([...a.base]).toEqual(baseBefore);
    const second = clampLandUse(scenario());
    expect(Array.from(second.snow)).toEqual(Array.from(first.snow));
    expect([...second.biome]).toEqual([...first.biome]);
  });

  it("returns its inputs untouched when nothing is claimed — the byte-identity case", () => {
    const input = scenario({ mask: new Uint8Array(W * D) });
    const out = clampLandUse(input);
    expect(out.biome).toBe(input.base);
    expect(out.snow).toBe(input.snow);
    expect(out.diagnostics).toEqual([]);
    expect(out.clampedBiome).toBeUndefined();
  });

  it("leaves water alone: land use owns the ground it claims, not the harbour", () => {
    const input = scenario();
    const wet = 15 * W + 15;
    (input.surfaceClass as Int32Array)[wet] = SurfaceClass.UNDERWATER;
    input.base[wet] = "minecraft:ocean";
    const out = clampLandUse(input);
    expect(out.biome[wet]).toBe("minecraft:ocean");
  });

  describe("precedence", () => {
    it("explicit author intent outranks the derived biome and the vote", () => {
      const input = scenario();
      input.snow.fill(1);
      const out = clampLandUse({ ...input, intent: { biome: "minecraft:taiga", snow: "never" } });
      expect(out.clampedBiome).toBe("minecraft:taiga");
      expect(out.snowPolicy).toBe("never");
    });

    it("warns and falls back when intent names a biome the emitter cannot carry", () => {
      const out = clampLandUse(scenario({ intent: { biome: "minecraft:mushroom_fields" } }));
      const codes = out.diagnostics.map((d) => d.code);
      expect(codes).toContain("LOAM-W472");
      expect(out.clampedBiome).toBe("minecraft:plains");
    });
  });

  describe("the ambient majority", () => {
    /** The same plateau, but with a uniform ambient the ring can read. */
    function ambient(biome: ProfileBiome, over: Partial<LandUseClampInput> = {}) {
      const input = scenario(over);
      input.base.fill(biome);
      return input;
    }

    it("takes the biome of the terrain around the footprint, not a default", () => {
      const out = clampLandUse(ambient("minecraft:forest"));
      expect(out.ambient.winner).toBe("minecraft:forest");
      expect(out.ambient.share).toBe(1);
      expect(out.clampedBiome).toBe("minecraft:forest");
    });

    it("votes over the ring, not under the footprint", () => {
      // Under the footprint the terrain says taiga; around it, forest. The
      // ring wins — that is the seam Kai walked.
      const input = ambient("minecraft:forest");
      for (let idx = 0; idx < W * D; idx++) {
        if (input.mask[idx] === 1) input.base[idx] = "minecraft:taiga";
      }
      expect(clampLandUse(input).clampedBiome).toBe("minecraft:forest");
    });

    it("makes a snowy ambient agree with a snow policy of `never`", () => {
      const out = clampLandUse(ambient("minecraft:snowy_slopes", { intent: { snow: "never" } }));
      expect(out.ambient.winner).toBe("minecraft:snowy_slopes");
      expect(out.clampedBiome).toBe("minecraft:windswept_hills");
      expect(out.snowPolicy).toBe("never");
    });

    it("makes a temperate ambient agree with a snow policy of `always`", () => {
      const out = clampLandUse(ambient("minecraft:plains", { intent: { snow: "always" } }));
      expect(out.clampedBiome).toBe("minecraft:snowy_plains");
    });

    it("maps every sibling pair both ways, and leaves the tintless alone", () => {
      expect(snowConsistentBiome("minecraft:beach", "always")).toBe("minecraft:snowy_beach");
      expect(snowConsistentBiome("minecraft:snowy_beach", "never")).toBe("minecraft:beach");
      expect(snowConsistentBiome("minecraft:forest", "always")).toBe("minecraft:taiga");
      expect(snowConsistentBiome("minecraft:taiga", "never")).toBe("minecraft:forest");
      expect(snowConsistentBiome("minecraft:stony_peaks", "always")).toBe("minecraft:stony_peaks");
      expect(snowConsistentBiome("minecraft:stony_peaks", "never")).toBe("minecraft:stony_peaks");
    });

    it("water abstains: an island in the sea derives from its land, not the ocean", () => {
      const input = ambient("minecraft:forest");
      const sc = input.surfaceClass as Int32Array;
      // Drown three of the four ring quadrants; the dry remainder still wins.
      for (let j = 0; j < D; j++) {
        for (let i = 0; i < W; i++) {
          const idx = j * W + i;
          if (input.mask[idx] === 1) continue;
          if (i < 24) {
            sc[idx] = SurfaceClass.UNDERWATER;
            input.base[idx] = "minecraft:ocean";
          }
        }
      }
      const out = clampLandUse(input);
      expect(out.clampedBiome).toBe("minecraft:forest");
    });

    it("falls back to the surface-class derivation when the ring is hopelessly mixed", () => {
      const input = scenario();
      // Five-way split around the footprint: nothing clears the majority bar.
      const spread: ProfileBiome[] = [
        "minecraft:forest",
        "minecraft:taiga",
        "minecraft:windswept_hills",
        "minecraft:stony_peaks",
        "minecraft:beach"
      ];
      for (let idx = 0; idx < W * D; idx++) {
        if (input.mask[idx] !== 1) input.base[idx] = spread[idx % spread.length] as ProfileBiome;
      }
      const out = clampLandUse(input);
      expect(out.ambient.winner).toBeUndefined();
      expect(out.clampedBiome).toBe("minecraft:plains");
      expect(out.diagnostics.find((d) => d.code === "LOAM-W470")?.message).toMatch(
        /too mixed/,
      );
    });

    it("falls back when the ring has too few columns to mean anything", () => {
      // A footprint filling the whole region leaves no ring at all.
      const mask = new Uint8Array(W * D).fill(1);
      const out = clampLandUse(scenario({ mask }));
      expect(out.ambient.total).toBe(0);
      expect(out.ambient.winner).toBeUndefined();
      expect(out.clampedBiome).toBe("minecraft:plains");
    });

    it("still lets explicit intent outrank the ambient", () => {
      const out = clampLandUse(
        ambient("minecraft:forest", { intent: { biome: "minecraft:stony_peaks" } }),
      );
      expect(out.ambient.winner).toBe("minecraft:forest");
      expect(out.clampedBiome).toBe("minecraft:stony_peaks");
    });
  });

  describe("the feather", () => {
    it("scales with the footprint's perimeter, in whole 4-column biome cells", () => {
      expect(maskPerimeter(scenario().mask, W, D)).toBe(36);
      expect(featherForPerimeter(36)).toBe(MIN_FEATHER);
      expect(featherForPerimeter(36)).toBe(DEFAULT_FEATHER);
      expect(featherForPerimeter(448)).toBe(7 * BIOME_CELL);
      expect(featherForPerimeter(4000)).toBe(MAX_FEATHER);
      // Anvil stores biomes per 4×4 cell, so a band that is not a whole number
      // of cells wide cannot mean what it says.
      for (const p of [0, 36, 200, 448, 640, 4000]) {
        expect(featherForPerimeter(p) % BIOME_CELL).toBe(0);
      }
      expect(MIN_FEATHER / BIOME_CELL).toBeGreaterThanOrEqual(6);
    });

    it("gives a city a wider band than a hut", () => {
      const hut = clampLandUse(scenario()).feather;
      // A 160×144 district — the size the islands2 fixture actually claims.
      const cw = 320;
      const cityMask = new Uint8Array(cw * cw);
      for (let j = 88; j < 232; j++) for (let i = 80; i < 240; i++) cityMask[j * cw + i] = 1;
      const city = featherForPerimeter(maskPerimeter(cityMask, cw, cw));
      expect(city).toBeGreaterThan(hut);
    });

    it("honours a caller-pinned width over the size-scaled one", () => {
      expect(clampLandUse(scenario({ feather: 3 })).feather).toBe(3);
    });

    it("weights the band as a gradient: full at the edge, zero at the rim", () => {
      const f = 12;
      const weights = Array.from({ length: f }, (_, k) => featherWeight(k + 1, f));
      expect(weights[0]).toBeGreaterThan(0.98);
      expect(weights[f - 1]).toBeLessThan(0.02);
      for (let k = 1; k < f; k++) {
        expect(weights[k] as number).toBeLessThan(weights[k - 1] as number);
      }
    });

    it("paints a thinning mix across the band", () => {
      const { out, distance, n, width } = bigBand();
      const total = new Map<number, number>();
      const painted = new Map<number, number>();
      for (let idx = 0; idx < n; idx++) {
        const d = distance[idx] as number;
        if (d <= 0 || d > out.feather) continue;
        total.set(d, (total.get(d) ?? 0) + 1);
        if (out.biome[idx] === "minecraft:taiga") painted.set(d, (painted.get(d) ?? 0) + 1);
      }
      const fractions = [...total.keys()]
        .sort((a, b) => a - b)
        .map((d) => (painted.get(d) ?? 0) / (total.get(d) as number));
      expect(width).toBeGreaterThan(out.feather * 2);
      // Near the footprint most of the band is clamped; at the rim almost none.
      expect(fractions[0] as number).toBeGreaterThan(0.8);
      expect(fractions[fractions.length - 1] as number).toBeLessThan(0.2);
      // It thins overall. Per *column* distance it is no longer required to be
      // monotone step by step — the decision is taken per 4×4 cell now, so a
      // single column ring straddles cells at two different cell distances.
      const head = fractions.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
      const tail = fractions.slice(-4).reduce((a, b) => a + b, 0) / 4;
      expect(head - tail).toBeGreaterThan(0.6);
    });

    /**
     * The regression this file exists for after Kai's islands2 walk: the band
     * has to still be a gradient **once Anvil has stored it**.
     */
    it("survives 4×4 storage decimation as a gradual step-down", () => {
      const { out, distance, width, depth } = bigBand();
      // Exactly what `terrain/emit.ts#paintBiomes` stores: one sample column
      // per 4×4 cell, at `cell * 4 + 1` on each axis.
      const rows: number[] = [];
      for (let cellX = 0; cellX * BIOME_CELL + 1 < width; cellX++) {
        let cells = 0;
        let clamped = 0;
        let near = Infinity;
        for (let cellZ = 0; cellZ * BIOME_CELL + 1 < depth; cellZ++) {
          const idx = (cellZ * BIOME_CELL + 1) * width + (cellX * BIOME_CELL + 1);
          const d = distance[idx] as number;
          if (d <= 0 || d > out.feather) continue;
          near = Math.min(near, d);
          cells++;
          if (out.biome[idx] === "minecraft:taiga") clamped++;
        }
        if (cells >= 4) rows.push(clamped / cells);
      }
      expect(rows.length).toBeGreaterThanOrEqual(6);
      // Stored cells carry intermediate mixes — not just "all" and "none",
      // which is what a per-column dither collapsed to.
      const mid = rows.filter((f) => f > 0.15 && f < 0.85);
      expect(mid.length).toBeGreaterThanOrEqual(3);
      // And no cliff: no adjacent pair of cell rows jumps the whole way.
      for (let k = 1; k < rows.length; k++) {
        expect(Math.abs((rows[k] as number) - (rows[k - 1] as number))).toBeLessThan(0.7);
      }
    });

    it("takes one decision per stored biome cell, not per column", () => {
      const { out, distance, width, depth } = bigBand();
      let checked = 0;
      for (let cellZ = 0; (cellZ + 1) * BIOME_CELL <= depth; cellZ++) {
        for (let cellX = 0; (cellX + 1) * BIOME_CELL <= width; cellX++) {
          // Only cells wholly inside the band: a cell straddling the footprint
          // edge legitimately mixes clamped footprint columns with band ones.
          const idxs: number[] = [];
          let ok = true;
          for (let j = 0; j < BIOME_CELL; j++) {
            for (let i = 0; i < BIOME_CELL; i++) {
              const idx = (cellZ * BIOME_CELL + j) * width + (cellX * BIOME_CELL + i);
              const d = distance[idx] as number;
              if (d <= 0 || d > out.feather) ok = false;
              idxs.push(idx);
            }
          }
          if (!ok) continue;
          checked++;
          const first = out.biome[idxs[0] as number];
          for (const idx of idxs) expect(out.biome[idx]).toBe(first);
        }
      }
      expect(checked).toBeGreaterThan(20);
    });
  });

  it("reports what it did", () => {
    const out = clampLandUse(scenario());
    const byCode = new Map(out.diagnostics.map((d) => [d.code, d] as const));
    expect(byCode.get("LOAM-W470")?.message).toMatch(/land use clamped 100 footprint columns/);
    expect(byCode.get("LOAM-W470")?.severity).toBe("note");
    expect(byCode.has("LOAM-W471")).toBe(true);
  });
});

describe("buildLandUseMask", () => {
  it("unions rects and column masks, clipped to the region", () => {
    const region = { x0: 100, z0: 200, width: 8, depth: 8 };
    const columns = new Uint8Array(64);
    columns[63] = 1;
    const mask = buildLandUseMask(region, {
      cells: [{ x0: 98, z0: 198, x1: 101, z1: 201 }],
      pads: [{ x0: 104, z0: 204, x1: 104, z1: 204 }],
      columns: [columns]
    });
    expect(mask[0]).toBe(1); // (100, 200), inside the clipped cell
    expect(mask[1]).toBe(1); // (101, 200)
    expect(mask[2]).toBe(0); // (102, 200)
    expect(mask[4 * 8 + 4]).toBe(1); // the pad
    expect(mask[63]).toBe(1); // the column mask
  });

  it("is empty when there are no sources", () => {
    const mask = buildLandUseMask({ x0: 0, z0: 0, width: 4, depth: 4 }, {});
    expect(mask.every((v) => v === 0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Compile: the snowbound alpine town                                         */
/* -------------------------------------------------------------------------- */

const FIXTURE = fileURLToPath(
  new URL("fixtures/examples/frost_hollow.loam.json", import.meta.url),
);

describe("frost_hollow — a city that straddles the snow line", () => {
  let report: TerrainCompileReport;
  let worldDir: string;
  let scratch: string;

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "terrainist-landuse-"));
    worldDir = path.join(scratch, "frost_hollow");
    const doc: unknown = JSON.parse(await readFile(FIXTURE, "utf8"));
    const result = await compileTerrain(doc, { outDir: worldDir });
    if (!result.ok) {
      throw new Error(result.diagnostics.map((d) => `${d.code} ${d.message}`).join("\n"));
    }
    report = result.report;
  }, 300_000);

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("compiles with zero error-severity diagnostics", () => {
    expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("clamps the settlement to one biome and one snow policy", () => {
    const clamped = report.diagnostics.filter((d) => d.code === "LOAM-W470");
    expect(clamped).toHaveLength(1);
    // One clamp, one policy: the message names a single resolved policy, and
    // an alpine mining town is still allowed to be snowy — coherence, not
    // "no snow".
    expect(clamped[0]?.message).toMatch(/resolved to "always"/);
    // Ambient-derived, not a default: the town takes the snowy ground the
    // valley is already made of, so there is no tint step at its edge — and
    // an alpine mining town is still allowed to be snowy.
    expect(clamped[0]?.message).toMatch(/from the ambient majority \(minecraft:snowy_/);
    expect(report.stats.biomeHistogram["minecraft:snowy_slopes"]).toBeGreaterThan(0);
    expect(report.stats.biomeHistogram["minecraft:snowy_plains"]).toBeUndefined();
  });

  it("puts no biome seam through the middle of a building pad", async () => {
    const placements = report.layout?.placements ?? [];
    expect(placements.length).toBeGreaterThan(0);
    const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const anvil = mc.openAnvil(path.join(worldDir, "region"));
    const cache = new Map<string, Awaited<ReturnType<typeof anvil.load>>>();
    const seen = new Set<number>();
    try {
      for (const placement of placements) {
        const { x0, z0, x1, z1 } = placement.footprint;
        for (let x = x0; x <= x1; x++) {
          for (let z = z0; z <= z1; z++) {
            const cx = x >> 4;
            const cz = z >> 4;
            const key = `${cx},${cz}`;
            let chunk = cache.get(key);
            if (chunk === undefined) {
              chunk = await anvil.load(cx, cz);
              cache.set(key, chunk);
            }
            if (chunk === null || chunk === undefined) continue;
            const y = placement.foundationY;
            seen.add(chunk.getBiomeId(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16));
          }
        }
      }
    } finally {
      await anvil.close();
    }
    expect(seen.size).toBe(1);
  }, 300_000);
});

// --- F21: the biome-intent table, widened -----------------------------------
describe("the intent-only biome rows (F21)", () => {
  it("carries minecraft:dark_forest, the biome the ruins world asked for", () => {
    const out = clampLandUse(scenario({ intent: { biome: "minecraft:dark_forest" } }));
    expect(out.diagnostics.map((d) => d.code)).not.toContain("LOAM-W472");
    expect(out.clampedBiome).toBe("minecraft:dark_forest");
  });

  it("carries the Luna-plausible near neighbours", () => {
    for (const biome of [
      "minecraft:birch_forest",
      "minecraft:flower_forest",
      "minecraft:pale_garden",
      "minecraft:cherry_grove",
      "minecraft:jungle",
      "minecraft:swamp",
      "minecraft:savanna",
      "minecraft:meadow",
      "minecraft:snowy_taiga",
      "minecraft:jagged_peaks"
    ] as const) {
      const out = clampLandUse(scenario({ intent: { biome } }));
      expect(out.diagnostics.map((d) => d.code), biome).not.toContain("LOAM-W472");
      expect(out.clampedBiome, biome).toBe(biome);
    }
  });

  it("still refuses biomes whose signature is ground material the emitter never lays", () => {
    for (const biome of [
      "minecraft:desert",
      "minecraft:badlands",
      "minecraft:mushroom_fields",
      "minecraft:ice_spikes",
      "minecraft:mangrove_swamp"
    ]) {
      const out = clampLandUse(scenario({ intent: { biome } }));
      expect(out.diagnostics.map((d) => d.code), biome).toContain("LOAM-W472");
    }
  });

  it("the W472 fix hint lists the widened table and names the exclusions", () => {
    const out = clampLandUse(scenario({ intent: { biome: "minecraft:mushroom_fields" } }));
    const d = out.diagnostics.find((x) => x.code === "LOAM-W472");
    expect(d?.fix).toContain("minecraft:dark_forest");
    expect(d?.fix).toContain("desert");
  });

  it("every row names a biome the pinned emitter version can actually place", async () => {
    const stack = await loadPrismarine(EMIT_MINECRAFT_VERSION);
    for (const biome of PROFILE_BIOMES) {
      expect(stack.biomeIdByName(biome), biome).toBeTypeOf("number");
    }
  });

  it("the table has no duplicate rows, and the derived rows keep their source order", () => {
    expect(new Set(PROFILE_BIOMES).size).toBe(PROFILE_BIOMES.length);
    // The tie-break in `ambientVote` walks this array; the derived biomes must
    // stay at the front, in the order shipped worlds were painted with.
    expect(PROFILE_BIOMES.slice(0, 15)).toEqual([
      "minecraft:ocean",
      "minecraft:deep_ocean",
      "minecraft:cold_ocean",
      "minecraft:deep_cold_ocean",
      "minecraft:beach",
      "minecraft:snowy_beach",
      "minecraft:plains",
      "minecraft:snowy_plains",
      "minecraft:forest",
      "minecraft:taiga",
      "minecraft:windswept_hills",
      "minecraft:stony_peaks",
      "minecraft:snowy_slopes",
      "minecraft:river",
      "minecraft:basalt_deltas"
    ]);
  });

  it("adding rows moves no derived world: taiga still has no snowy sibling", () => {
    // `taiga` IS derived by `biomeForColumn`, so giving it a snowy sibling
    // would repaint shipped worlds. `snowy_taiga` (intent-only) maps back.
    expect(snowConsistentBiome("minecraft:taiga", "always")).toBe("minecraft:taiga");
    expect(snowConsistentBiome("minecraft:snowy_taiga", "never")).toBe("minecraft:taiga");
    expect(snowConsistentBiome("minecraft:meadow", "always")).toBe("minecraft:grove");
    expect(snowConsistentBiome("minecraft:grove", "never")).toBe("minecraft:meadow");
  });
});
