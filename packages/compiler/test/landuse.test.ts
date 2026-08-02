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

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import type { ProfileBiome } from "../src/terrain/biomes.js";
import {
  DEFAULT_FEATHER,
  buildLandUseMask,
  chebyshevDistance,
  clampLandUse,
  type LandUseClampInput,
} from "../src/terrain/landuse.js";

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
    ...over,
  };
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
      columns: [columns],
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
  new URL("../../../out/e2e/glm-p2/frost_hollow.loam.json", import.meta.url),
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
    expect(clamped[0]?.message).toMatch(/resolved to "(always|never)"/);
    expect(report.stats.biomeHistogram["minecraft:snowy_plains"]).toBeGreaterThan(0);
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
