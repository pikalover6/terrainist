import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadSpikeDocument } from "../src/emit/document.js";
import { loadPrismarine, readGzippedNbt } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION, emitWorld } from "../src/emit/world.js";
import type { EmitSummary } from "../src/emit/world.js";

const SPEC_PATH = fileURLToPath(new URL("../../../examples/pyramid.spike.json", import.meta.url));

const scratch: string[] = [];

async function emitTo(label: string): Promise<EmitSummary> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  const doc = await loadSpikeDocument(SPEC_PATH);
  return emitWorld(doc, path.join(dir, "glass-pyramid"));
}

let first: EmitSummary;
let second: EmitSummary;

beforeAll(async () => {
  first = await emitTo("a");
  second = await emitTo("b");
}, 120_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("emitWorld", () => {
  it("reports the expected geometry summary", () => {
    expect(first.minecraftVersion).toBe(EMIT_MINECRAFT_VERSION);
    expect(first.dataVersion).toBe(4671);
    // 64x64 platform => 4x4 chunks; the pyramid sits inside them.
    expect(first.chunkCount).toBe(16);
    // 4096 platform blocks + 224 ring blocks + 1 apex.
    expect(first.blockCount).toBe(4096 + 224 + 1);
    expect(first.bounds).toEqual({ min: [-32, 63, -32], max: [31, 71, 31] });
    expect(first.spawn).toEqual([12, 64, 0]);
    expect(first.regionFiles.map((f) => path.basename(f)).sort()).toEqual([
      "r.-1.-1.mca",
      "r.-1.0.mca",
      "r.0.-1.mca",
      "r.0.0.mca",
    ]);
  });

  it("writes a level.dat with the fields a real client needs", async () => {
    const parsed = readGzippedNbt(await readFile(first.levelDatPath)) as {
      Data: Record<string, unknown>;
    };
    const data = parsed.Data;

    expect(data["version"]).toBe(19133);
    expect(data["DataVersion"]).toBe(4671);
    expect(data["Version"]).toMatchObject({ Id: 4671, Name: EMIT_MINECRAFT_VERSION, Snapshot: 0 });
    expect(data["LevelName"]).toBe("glass-pyramid");
    expect(data["GameType"]).toBe(1);
    expect(data["allowCommands"]).toBe(1);
    expect(data["Difficulty"]).toBe(0);
    expect(data["initialized"]).toBe(1);
    // 1.21.9+ spawn shape; the legacy SpawnX/Y/Z fields would be ignored.
    expect(data["spawn"]).toMatchObject({
      pos: [12, 64, 0],
      dimension: "minecraft:overworld",
    });
    expect(data["SpawnX"]).toBeUndefined();
    expect(data["game_rules"]).toEqual({});
    // Determinism: no wall-clock anywhere.
    expect(Number(data["LastPlayed"])).toBe(0);

    const settings = data["WorldGenSettings"] as Record<string, unknown>;
    expect(settings["generate_features"]).toBe(0);
    const overworld = (settings["dimensions"] as Record<string, Record<string, unknown>>)[
      "minecraft:overworld"
    ];
    const generator = overworld?.["generator"] as Record<string, unknown>;
    expect(generator["type"]).toBe("minecraft:flat");
    const flat = generator["settings"] as Record<string, unknown>;
    expect(flat["features"]).toBe(0);
    expect(flat["lakes"]).toBe(0);
    // A single air layer: unemitted chunks generate empty, not overworld terrain.
    expect(flat["layers"]).toEqual([{ block: "minecraft:air", height: 1 }]);
  });

  it("is byte-identical across runs", async () => {
    expect(second.regionFiles.map((f) => path.basename(f))).toEqual(
      first.regionFiles.map((f) => path.basename(f)),
    );

    const levelA = await readFile(first.levelDatPath);
    const levelB = await readFile(second.levelDatPath);
    expect(levelA.equals(levelB)).toBe(true);

    for (const [i, fileA] of first.regionFiles.entries()) {
      const fileB = second.regionFiles[i];
      expect(fileB).toBeDefined();
      const [a, b] = await Promise.all([readFile(fileA), readFile(fileB as string)]);
      expect(
        a.equals(b),
        `${path.basename(fileA)} differs between runs`,
      ).toBe(true);
    }
  });

  it("leaves the region timestamp sector zeroed", async () => {
    for (const file of first.regionFiles) {
      const buffer = await readFile(file);
      const timestamps = buffer.subarray(4096, 8192);
      expect(timestamps.every((byteValue) => byteValue === 0)).toBe(true);
    }
  });

  it("reads back the pyramid through the anvil provider", async () => {
    const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const anvil = mc.openAnvil(first.regionDir);
    try {
      // Pyramid base ring corner (7, 64, 7) lives in chunk (0, 0) at local (7, 64, 7).
      const origin = await anvil.load(0, 0);
      expect(origin).not.toBeNull();
      expect(origin?.getBlockName(7, 64, 7)).toBe("glass");
      // Apex.
      expect(origin?.getBlockName(0, 71, 0)).toBe("glass");
      // Platform under the pyramid.
      expect(origin?.getBlockName(0, 63, 0)).toBe("grass_block");
      // Inside the hollow pyramid is air.
      expect(origin?.getBlockName(0, 65, 0)).toBe("air");
      // Biome was painted uniformly.
      expect(origin?.getBiomeId(0, 64, 0)).toBe(mc.biomeIdByName("minecraft:plains"));

      // Negative-coordinate corner (-7, 64, -7) => chunk (-1, -1), local (9, 64, 9).
      const negative = await anvil.load(-1, -1);
      expect(negative?.getBlockName(9, 64, 9)).toBe("glass");
      expect(negative?.getBlockName(15, 63, 15)).toBe("grass_block");
    } finally {
      await anvil.close();
    }
  }, 60_000);
});
