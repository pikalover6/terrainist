import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  HeightField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams,
} from "@terrainist/stdlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain } from "../src/terrain/compile.js";
import type { CompileTerrainResult, TerrainCompileReport } from "../src/terrain/compile.js";
import { FluidKind, buildColumnPlan, settleFluidPool, type ColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";
import {
  checkFloatingVegetation,
  checkFluidStability,
  validatorDiagnostics,
} from "../src/terrain/validate.js";
import type { TreePlacement } from "../src/terrain/vegetation.js";

const scratch: string[] = [];

/** A small but complete terrain document — big enough to exercise every pass. */
function smallDocument(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "golden_isle", worldSeed: 42, prompt: "a small test isle" },
    style: {
      palettes: {
        "ground.beach": { mix: [["minecraft:black_concrete_powder", 3], ["minecraft:gravel", 2]] },
      },
    },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: {
            ridged: true,
            amplitude: 40,
            seaLevel: 63,
            baseHeight: 70,
            continentalness: { frequency: 0.004, seaFraction: 0.4 },
          },
          children: [
            {
              id: "spine",
              kind: "generator",
              generator: "terrain.edit@0",
              params: { verb: "ridge", course: [[0.1, 0.5], [0.9, 0.45]], width: 30, height: 30 },
            },
            {
              id: "inlet",
              kind: "generator",
              generator: "terrain.edit@0",
              params: { verb: "valley", course: [[0.7, 0.8], [0.3, 0.85], [0.0, 0.9]], width: 24, depth: 60 },
            },
          ],
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "boreal" },
        },
        {
          id: "woods",
          kind: "generator",
          generator: "scatter.forest@0",
          params: {
            area: { all: true },
            density: 0.2,
            spacing: 3,
            species: [{ id: "spruce", weight: 1, shape: "spruce_tall" }],
          },
        },
      ],
    },
  };
}

async function compileTo(label: string): Promise<TerrainCompileReport> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  const result: CompileTerrainResult = await compileTerrain(smallDocument(), {
    outDir: path.join(dir, "golden_isle"),
  });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return result.report;
}

/** A blank column plan over a small region, for the hand-built validator cases. */
function blankPlan(width: number, depth: number, groundY: number): ColumnPlan {
  const region = centeredRegion(width, depth);
  const n = width * depth;
  return {
    region,
    ground: new Int32Array(n).fill(groundY),
    fluidTop: new Int32Array(n).fill(groundY),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n).fill(1),
    subsurface: new Int32Array(n).fill(1),
    soil: new Uint8Array(n),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    seaLevel: 63,
    states: { bedrock: 85, stone: 1, water: 86, lava: 102, snowLayer: 6718 },
  };
}

let first: TerrainCompileReport;
let second: TerrainCompileReport;

beforeAll(async () => {
  first = await compileTo("a");
  second = await compileTo("b");
}, 180_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("compileTerrain", () => {
  it("produces a world with terrain, water and vegetation", () => {
    expect(first.stats.chunkCount).toBe(64);
    expect(first.stats.blockCount).toBeGreaterThan(1_000_000);
    expect(first.stats.treeCount).toBeGreaterThan(0);
    expect(first.stats.landFraction).toBeGreaterThan(0.1);
    expect(first.stats.landFraction).toBeLessThan(0.99);
    expect(Object.keys(first.stats.biomeHistogram).length).toBeGreaterThan(1);
    expect(first.emit.dataVersion).toBeGreaterThan(0);
    expect(first.emit.minecraftVersion).toBe(EMIT_MINECRAFT_VERSION);
  });

  it("never leaves an unstable fluid block", () => {
    expect(first.stats.unstableFluidBlocks).toBe(0);
    expect(first.stats.floatingTrees).toBe(0);
    expect(first.diagnostics).toEqual([]);
  });

  it("records heightfield and edit markers", () => {
    const names = new Set(first.markers.map((m) => m.id));
    expect(names.has("highest_point")).toBe(true);
    expect([...names].some((id) => id.startsWith("spine."))).toBe(true);
    expect([...names].some((id) => id.startsWith("inlet."))).toBe(true);
  });

  it("is byte-identical across two compiles (golden determinism)", async () => {
    expect(second.stats).toEqual(first.stats);
    expect(second.markers).toEqual(first.markers);

    const levelA = await readFile(first.emit.levelDatPath);
    const levelB = await readFile(second.emit.levelDatPath);
    expect(levelB.equals(levelA)).toBe(true);

    expect(second.emit.regionFiles.length).toBe(first.emit.regionFiles.length);
    expect(second.emit.regionFiles.length).toBeGreaterThan(0);
    for (const [i, fileA] of first.emit.regionFiles.entries()) {
      const a = await readFile(fileA);
      const b = await readFile(second.emit.regionFiles[i] as string);
      expect(b.equals(a), `region file ${path.basename(fileA)} differs`).toBe(true);
    }
  });

  it("places trees deterministically", () => {
    expect(second.stats.treeCount).toBe(first.stats.treeCount);
    expect(second.stats.treesPerNode).toEqual(first.stats.treesPerNode);
    expect(second.stats.treeBlockCount).toBe(first.stats.treeBlockCount);
  });

  it("reports diagnostics instead of throwing on an invalid document", async () => {
    const result = await compileTerrain({ loam: "0.1" }, { outDir: path.join(tmpdir(), "unused") });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((d) => d.code.startsWith("LOAM-T"))).toBe(true);
  });
});

describe("semantic warnings from the compile passes", () => {
  it("warns LOAM-T105 for an unclosed water basin and LOAM-T107 for a drowned spawn", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-warn-"));
    scratch.push(dir);
    const doc = smallDocument();
    // A spawn fraction that lands in the carved inlet, and a basin whose rim
    // the surrounding sea has already breached.
    (doc["meta"] as Record<string, unknown>)["spawn"] = { at: [0.02, 0.9] };
    const hf = (doc["root"] as { children: Record<string, unknown>[] }).children[0] as Record<
      string,
      unknown
    >;
    (hf["children"] as Record<string, unknown>[]).push({
      id: "open_basin",
      kind: "generator",
      generator: "terrain.edit@0",
      params: { verb: "basin", at: [0.05, 0.95], radius: 40, depth: 30, water: true },
    });

    const result = await compileTerrain(doc, { outDir: path.join(dir, "warned") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codes = result.report.diagnostics.map((d) => d.code);
    expect(codes).toContain("LOAM-T105");
    expect(codes).toContain("LOAM-T107");
    for (const d of result.report.diagnostics) expect(d.severity).toBe("warning");
  }, 60_000);
});

describe("per-column biomes survive a save/load round trip", () => {
  it("keeps two different biomes inside one chunk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-biome-"));
    scratch.push(dir);
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const oceanId = stack.biomeIdByName("minecraft:ocean");
    const taigaId = stack.biomeIdByName("minecraft:taiga");
    expect(oceanId).toBeDefined();
    expect(taigaId).toBeDefined();

    const chunk = stack.createChunk();
    const stone = stack.blockByName("minecraft:stone");
    expect(stone).toBeDefined();
    // A non-empty chunk, so prismarine actually serialises the section.
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) chunk.setStateId(x, 64, z, (stone as { stateId: number }).stateId);
    }
    // West half ocean, east half taiga, across every biome cell of the column.
    for (let y = -64; y < 320; y += 4) {
      for (let cellZ = 0; cellZ < 4; cellZ++) {
        for (let cellX = 0; cellX < 4; cellX++) {
          chunk.setBiomeAt(cellX * 4, y, cellZ * 4, cellX < 2 ? (oceanId as number) : (taigaId as number));
        }
      }
    }

    const anvil = stack.openAnvil(dir);
    await anvil.save(0, 0, chunk);
    await anvil.close();

    const reopened = stack.openAnvil(dir);
    const loaded = await reopened.load(0, 0);
    await reopened.close();
    expect(loaded).not.toBeNull();
    expect((loaded as NonNullable<typeof loaded>).getBiomeId(1, 64, 1)).toBe(oceanId);
    expect((loaded as NonNullable<typeof loaded>).getBiomeId(13, 64, 1)).toBe(taigaId);
  }, 60_000);
});

describe("fluid settling validator", () => {
  it("passes a sea that fills every low column to the same level", () => {
    const plan = blankPlan(8, 8, 40);
    for (let i = 0; i < plan.fluidKind.length; i++) {
      plan.fluidKind[i] = FluidKind.WATER;
      plan.fluidTop[i] = 63;
    }
    expect(checkFluidStability(plan).unstable).toBe(0);
  });

  it("catches a hand-built pond perched next to lower dry ground", () => {
    const plan = blankPlan(8, 8, 40);
    // One 2x2 block of water at y=63 over ground at 40, everything else dry
    // and lower — nine blocks per column can flow sideways.
    for (const [i, j] of [[3, 3], [3, 4], [4, 3], [4, 4]] as const) {
      const idx = j * 8 + i;
      plan.fluidKind[idx] = FluidKind.WATER;
      plan.fluidTop[idx] = 63;
    }
    const report = checkFluidStability(plan);
    expect(report.unstable).toBeGreaterThan(0);
    expect(report.samples[0]?.kind).toBe("water");

    const errors = validatorDiagnostics(report, [], { allowUnstable: false });
    expect(errors[0]?.code).toBe("LOAM-T110");
    expect(errors[0]?.severity).toBe("error");

    const warnings = validatorDiagnostics(report, [], { allowUnstable: true });
    expect(warnings[0]?.severity).toBe("warning");
  });

  it("settles a bounded pool by eroding the columns that would spill", () => {
    const plan = blankPlan(8, 8, 40);
    // Raise a closed rim around a 4x4 bowl; the pool must survive inside it.
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const inside = i >= 2 && i <= 5 && j >= 2 && j <= 5;
        plan.ground[j * 8 + i] = inside ? 40 : 60;
        plan.fluidTop[j * 8 + i] = plan.ground[j * 8 + i] as number;
      }
    }
    const columns = Int32Array.from(
      [2, 3, 4, 5].flatMap((j) => [2, 3, 4, 5].map((i) => j * 8 + i)),
    );
    expect(settleFluidPool(plan, columns, 55, FluidKind.WATER)).toBe(16);
    expect(checkFluidStability(plan).unstable).toBe(0);

    // A pool above the rim erodes away completely.
    const open = blankPlan(8, 8, 40);
    expect(settleFluidPool(open, Int32Array.from([27, 28, 35, 36]), 55, FluidKind.WATER)).toBe(0);
  });
});

describe("floating vegetation validator", () => {
  it("flags a tree whose base is not on solid dry ground", () => {
    const plan = blankPlan(8, 8, 40);
    const grounded: TreePlacement = {
      nodeId: "woods",
      speciesId: "spruce",
      shape: "spruce_tall",
      x: 0,
      z: 0,
      baseY: 41,
      height: 9,
      trunkState: 140,
      leafState: 307,
    };
    const floating: TreePlacement = { ...grounded, x: 1, baseY: 60 };
    const wet: TreePlacement = { ...grounded, x: 2 };
    plan.fluidKind[plan.region.width * (0 - plan.region.z0) + (2 - plan.region.x0)] = FluidKind.WATER;

    const bad = checkFloatingVegetation(plan, [grounded, floating, wet]);
    expect(bad.map((t) => t.x).sort()).toEqual([1, 2]);

    const diagnostics = validatorDiagnostics({ unstable: 0, samples: [] }, bad, {
      allowUnstable: false,
    });
    expect(diagnostics[0]?.code).toBe("LOAM-T111");
  });
});

describe("the water pass reads the ocean mask, not sea level", () => {
  it("fills a fjord that opens to the map edge and leaves a landlocked gorge dry", () => {
    const region = centeredRegion(48, 48);
    const field = new HeightField(region);
    field.values.fill(80);
    const set = (i: number, j: number, y: number): void => {
      field.values[j * 48 + i] = y;
    };
    // a channel in from the west edge, and an identical pit in the middle
    for (let i = 0; i <= 16; i++) for (let j = 8; j <= 10; j++) set(i, j, 40);
    for (let i = 28; i <= 38; i++) for (let j = 30; j <= 32; j++) set(i, j, 40);

    const classification = classify(field, resolveHeightfieldParams({}));
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const { palette } = resolvePalette(stack, undefined, nodeSeed(1n, "world"));
    const plan = buildColumnPlan({
      field,
      classification,
      palette,
      seaLevel: 63,
      soilDepth: 3,
      calderas: [],
      basins: [],
    });

    expect(plan.fluidKind[9 * 48 + 0]).toBe(FluidKind.WATER);
    expect(plan.fluidKind[9 * 48 + 16]).toBe(FluidKind.WATER);
    // just as deep, no way out to sea, and therefore dry
    expect(plan.ground[31 * 48 + 33]).toBeLessThan(63);
    expect(plan.fluidKind[31 * 48 + 33]).toBe(FluidKind.NONE);
    // and the result is still a settle-safe world
    expect(checkFluidStability(plan).unstable).toBe(0);
  });
});
